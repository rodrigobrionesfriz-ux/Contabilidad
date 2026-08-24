// auxreporte.js — Reporte de un auxiliar concreto (estado de cuenta).
//
// Abre la ficha de un solo cliente o proveedor con todos sus documentos, o
// sólo los que quedan con saldo. Es lo que se manda al proveedor para cuadrar
// o al cliente para cobrar, así que se puede imprimir y exportar a Excel.
//
// Las notas de crédito y débito con folio de referencia van colgando de su
// factura, igual que en la vista Detalle: la lógica vive en auxdocs.js para
// que ambas pantallas no se separen.

import {S} from './state.js';
import {fmtC, fmt, rutFmt, dteV, dteC, toast, today} from './core.js';
import {ordenarConNotas, soloConSaldo, docOriginal} from './auxdocs.js';
import {fichaAux} from './importadoraux.js';
import {logAccion} from './firebase.js';

// Estado del reporte abierto
let REP={rut:null, tipo:'proveedor', vista:'saldo', datos:null};

const esc=s=>String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const dteNombre=(t,tipo)=>((tipo==='cliente'?dteV(t):dteC(t))?.nm)||('DTE '+t);

// Abre el reporte. `aux` es la entrada del auxiliar tal como la arma
// renderAuxiliares: {rutCodigo, rutDV, razonSocial, docs, total}.
export function abrirReporteAux(rutCodigo,tipo,aux){
  const datos=aux||(window.__auxBuscar?window.__auxBuscar(rutCodigo,tipo):null);
  if(!datos){toast('⚠️ No se encontró el auxiliar','e');return;}
  REP={rut:rutCodigo, tipo:tipo==='cliente'?'cliente':'proveedor', vista:REP.vista||'saldo', datos};
  const m=document.getElementById('aux-rep-modal');
  if(m)m.classList.add('open');
  renderReporteAux();
}

export function cerrarReporteAux(){
  const m=document.getElementById('aux-rep-modal');
  if(m)m.classList.remove('open');
  REP={rut:null,tipo:REP.tipo,vista:REP.vista,datos:null};
}

export function setReporteAuxVista(v){
  REP.vista=v==='todos'?'todos':'saldo';
  renderReporteAux();
}

// Devuelve las filas ya ordenadas y filtradas según la vista elegida
function filasDelReporte(){
  const tipo=REP.tipo;
  const orden=ordenarConNotas((REP.datos&&REP.datos.docs)||[],tipo);
  return REP.vista==='todos'?orden:soloConSaldo(orden);
}

export function renderReporteAux(){
  const box=document.getElementById('aux-rep-body');
  if(!box||!REP.datos)return;
  const a=REP.datos, tipo=REP.tipo;
  const esCliente=tipo==='cliente';
  const filas=filasDelReporte();
  const ficha=fichaAux(tipo,a.rutCodigo);

  // Totales: el saldo del auxiliar es siempre el acumulado real, no el de las
  // filas visibles — si no, la vista «sólo con saldo» mostraría un total que
  // no cuadra con el Balance.
  const totalAux=a.total||0;
  const totalVisible=filas.filter(d=>d.__nivel!==1)
    .reduce((s,d)=>s+(d.__saldoDoc?d.__saldoDoc.saldo:(d.montoSigno||0)),0);

  const tab=(k,lbl)=>`<button class="btn ${REP.vista===k?'btn-p':'btn-g'}" onclick="setReporteAuxVista('${k}')">${lbl}</button>`;

  const filasHtml=filas.length?filas.map(d=>{
    const hija=d.__nivel===1;
    if(d.tipo!=='doc'){
      // Pago, ajuste o movimiento manual sin documento
      return `<tr>
        <td class="tl mono">${esc(d.fecha)}</td>
        <td class="tl">${esc(d.glosa||'Movimiento')}${d.desc?` <span class="mt">— ${esc(d.desc)}</span>`:''}
          ${d.asientoN?`<span class="mt"> · Asiento N°${esc(d.asientoN)}</span>`:''}</td>
        <td class="num">${d.debe?fmt(d.debe):'–'}</td>
        <td class="num">${d.haber?fmt(d.haber):'–'}</td>
        <td class="num">–</td>
        <td class="num fuerte">${fmtC(d.montoSigno||0)}</td>
      </tr>`;
    }
    const orig=docOriginal(d,tipo);
    const sd=d.__saldoDoc||{total:d.montoSigno||0,pagado:0,notas:0,saldo:d.montoSigno||0};
    const nm=dteNombre(d.tipoDTE,tipo);
    const refTxt=hija?'↳ ':'';
    const vto=d.fechaVencimiento?`<span class="mt"> · vence ${esc(d.fechaVencimiento)}</span>`:'';
    const sinRef=(!hija&&orig&&!orig.folioRef&&sd.total<0)
      ? '<span class="rep-warn">sin referencia</span>':'';
    return `<tr${hija?' class="rep-hija"':''}>
      <td class="tl mono">${esc(d.fecha)}</td>
      <td class="tl">${refTxt}${esc(nm)} N°${esc(d.numero||'')}${vto}${sinRef}</td>
      <td class="num">${d.debe?fmt(d.debe):'–'}</td>
      <td class="num">${d.haber?fmt(d.haber):'–'}</td>
      <td class="num">${sd.pagado?fmt(sd.pagado):'–'}</td>
      <td class="num fuerte">${hija?'':fmtC(sd.saldo)}</td>
    </tr>`;
  }).join('')
   :`<tr><td colspan="6" style="padding:22px;text-align:center;color:var(--mt)">
       ${REP.vista==='saldo'?'No quedan documentos con saldo pendiente.':'Este auxiliar no tiene movimientos.'}
     </td></tr>`;

  box.innerHTML=`
  <div id="aux-rep-print">
    <div class="rep-cab">
      <div>
        <div class="rep-emp">${esc(S.empresa.nombre||'')}</div>
        <div class="rep-emp-sub">${esc(S.empresa.rut||'')}${S.empresa.giro?' · '+esc(S.empresa.giro):''}</div>
      </div>
      <div class="rep-fecha">
        <div>Estado de cuenta</div>
        <div class="mt">Emitido ${esc(today())} · Ejercicio ${S.empresa.anio}</div>
      </div>
    </div>

    <div class="rep-aux">
      <div>
        <div class="rep-aux-nm">${esc(a.razonSocial||'(sin razón social)')}</div>
        <div class="mono mt">${esc(rutFmt(a.rutCodigo,a.rutDV))} · ${esCliente?'Cliente':'Proveedor'}</div>
        ${ficha&&(ficha.giro||ficha.email||ficha.telefono)
          ? `<div class="mt" style="margin-top:3px">${[ficha.giro,ficha.email,ficha.telefono].filter(Boolean).map(esc).join(' · ')}</div>`:''}
      </div>
      <div class="rep-saldo">
        <div class="mt">${esCliente?'Por cobrar':'Por pagar'}</div>
        <div class="rep-saldo-val" style="color:${totalAux>=0?'var(--ach)':'var(--err)'}">${fmtC(totalAux)}</div>
      </div>
    </div>

    <div class="rep-vista-lbl">
      ${REP.vista==='saldo'
        ? `Documentos con saldo pendiente (${filas.filter(d=>d.__nivel!==1).length})`
        : `Todos los documentos (${filas.filter(d=>d.__nivel!==1).length})`}
    </div>

    <div class="rep-scroll">
    <table class="rep-tabla">
      <thead><tr>
        <th class="tl" style="width:88px">FECHA</th>
        <th class="tl">DOCUMENTO</th>
        <th class="num" style="width:104px">DEBE</th>
        <th class="num" style="width:104px">HABER</th>
        <th class="num" style="width:104px">${esCliente?'COBRADO':'PAGADO'}</th>
        <th class="num" style="width:112px">SALDO DOC.</th>
      </tr></thead>
      <tbody>${filasHtml}</tbody>
      <tfoot><tr>
        <td class="tl" colspan="5">${REP.vista==='saldo'?'Total pendiente':'Saldo del auxiliar'}</td>
        <td class="num fuerte">${fmtC(REP.vista==='saldo'?totalVisible:totalAux)}</td>
      </tr></tfoot>
    </table>
    </div>

    ${REP.vista==='saldo'&&Math.abs(totalVisible-totalAux)>1
      ? `<div class="rep-nota">El total pendiente (${fmtC(totalVisible)}) difiere del saldo contable del auxiliar
         (${fmtC(totalAux)}) porque hay movimientos sin documento asociado o notas ya imputadas.
         El Balance usa siempre el saldo contable.</div>`:''}
  </div>

  <div class="rep-acciones no-print">
    ${tab('saldo','Sólo con saldo')}
    ${tab('todos','Todos los documentos')}
    <span style="flex:1"></span>
    <button class="btn btn-g" onclick="imprimirReporteAux()">🖨️ Imprimir</button>
    <button class="btn btn-g" onclick="exportarReporteAuxExcel()">📊 Excel</button>
    <button class="btn btn-g" onclick="cerrarReporteAux()">Cerrar</button>
  </div>`;
}

// ── Imprimir sólo el reporte ──
// Se marca el body para que el CSS de impresión esconda todo lo demás; así se
// imprime la ficha sola y no la aplicación entera detrás del modal.
export function imprimirReporteAux(){
  document.body.classList.add('imprimiendo-reporte');
  const limpiar=()=>document.body.classList.remove('imprimiendo-reporte');
  window.addEventListener('afterprint',limpiar,{once:true});
  setTimeout(limpiar,3000);   // por si el navegador no dispara afterprint
  window.print();
}

export function exportarReporteAuxExcel(){
  try{
    if(typeof XLSX==='undefined'){toast('⚠️ No se pudo cargar el generador de Excel','e');return;}
    const a=REP.datos, tipo=REP.tipo, esCliente=tipo==='cliente';
    const filas=filasDelReporte();
    const rows=[];
    rows.push(['ESTADO DE CUENTA']);
    rows.push([S.empresa.nombre||'', S.empresa.rut||'']);
    rows.push([esCliente?'Cliente':'Proveedor', a.razonSocial||'', rutFmt(a.rutCodigo,a.rutDV)]);
    rows.push(['Ejercicio',S.empresa.anio,'Emitido',today()]);
    rows.push(['Vista',REP.vista==='saldo'?'Sólo documentos con saldo':'Todos los documentos']);
    rows.push([]);
    rows.push(['FECHA','DOCUMENTO','DEBE','HABER',esCliente?'COBRADO':'PAGADO','SALDO DOC.']);
    filas.forEach(d=>{
      const hija=d.__nivel===1;
      if(d.tipo!=='doc'){
        rows.push([d.fecha,(d.glosa||'Movimiento')+(d.desc?' — '+d.desc:''),
                   d.debe||0,d.haber||0,'',Math.round(d.montoSigno||0)]);
        return;
      }
      const sd=d.__saldoDoc||{pagado:0,saldo:d.montoSigno||0};
      rows.push([d.fecha,
        (hija?'   ↳ ':'')+dteNombre(d.tipoDTE,tipo)+' N°'+(d.numero||''),
        d.debe||0,d.haber||0,
        sd.pagado||0,
        hija?'':Math.round(sd.saldo)]);
    });
    rows.push([]);
    rows.push(['',REP.vista==='saldo'?'TOTAL PENDIENTE':'SALDO DEL AUXILIAR','','','',
      Math.round(REP.vista==='saldo'
        ? filas.filter(d=>d.__nivel!==1).reduce((s,d)=>s+(d.__saldoDoc?d.__saldoDoc.saldo:(d.montoSigno||0)),0)
        : (a.total||0))]);

    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=[{wch:12},{wch:46},{wch:14},{wch:14},{wch:14},{wch:16}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Estado de cuenta');
    const nom=(a.razonSocial||a.rutCodigo||'auxiliar').replace(/[^A-Za-z0-9]+/g,'_').slice(0,40);
    XLSX.writeFile(wb,`estado_cuenta_${nom}_${S.empresa.anio}.xlsx`);
    toast('📊 Estado de cuenta exportado');
    try{logAccion('exportar','auxiliar',a.razonSocial||a.rutCodigo);}catch(e){}
  }catch(e){
    toast('❌ No se pudo exportar: '+e.message,'e');
  }
}

export {REP};
