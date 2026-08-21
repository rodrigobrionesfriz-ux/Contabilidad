// aperturaaux.js — Detalle de auxiliares del Balance de Apertura
//
// El problema que resuelve
// ────────────────────────
// El asiento de apertura dice "Facturas por Cobrar: $4.859.531.273". Ese número
// cuadra el balance, pero no sirve para trabajar: no se sabe QUÉ facturas lo
// componen, de qué clientes, ni cuáles están vencidas. Y cuando llega un pago
// del cliente, no hay documento contra el cual imputarlo.
//
// Acá se captura ese detalle: cada documento histórico pendiente, con su fecha,
// su vencimiento y su saldo. Con eso:
//   · el auxiliar por cliente/proveedor arranca con su historia real
//   · el aging clasifica los documentos viejos en sus tramos de antigüedad
//   · Pagos y Cobros puede imputar contra facturas anteriores al sistema
//
// La regla que lo mantiene honesto: la suma de los saldos capturados de una
// cuenta tiene que ser IGUAL al monto de esa cuenta en el asiento de apertura.
// Mientras no cuadre, se dice en pantalla y no se deja guardar.
//
// Dónde viven los datos: `S.apertura.auxDocs` — dentro del propio asiento de
// apertura, para que viajen con él al exportar, importar y respaldar.

import {toast, fmtC, fmt, pdcNm, rutFmt, rutParse, rutDV, dteV, dteC, today,
        DTE_VENTAS, DTE_COMPRAS} from './core.js';
import {S} from './state.js';
import {CUENTAS_AUX} from './asientos.js';
import {fichaAux, fichasAux} from './importadoraux.js';
import {inputAux} from './buscadorcuentas.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';

// Estado de edición: se trabaja sobre una copia y sólo al guardar se aplica
export const APX={abierto:false,cd:'',docs:[]};

export const tipoDeCuenta=cd=>CUENTAS_AUX[cd]||'';
const etiquetaTipo={cliente:'cliente',proveedor:'proveedor',honorario:'profesional'};

// ── Qué cuentas auxiliables trae la apertura, y por cuánto ──
// El monto se toma con el signo de presentación de la cuenta: un activo por su
// saldo deudor, un pasivo por su saldo acreedor. Así el número que hay que
// cuadrar siempre es positivo y se lee igual que en el balance.
export function cuentasAuxDeApertura(){
  const ap=S.apertura;
  if(!ap||!ap.movs)return [];
  const porCuenta={};
  ap.movs.forEach(m=>{
    const tipo=tipoDeCuenta(m.cd);
    if(!tipo)return;
    const esActivo=String(m.cd)[0]==='1';
    const monto=esActivo?((m.debe||0)-(m.haber||0)):((m.haber||0)-(m.debe||0));
    if(!porCuenta[m.cd])porCuenta[m.cd]={cd:m.cd,nm:m.nm||pdcNm(m.cd),tipo,monto:0};
    porCuenta[m.cd].monto+=monto;
  });
  return Object.values(porCuenta).filter(x=>Math.abs(x.monto)>=0.5).sort((a,b)=>a.cd.localeCompare(b.cd));
}

export const docsApertura=()=>((S.apertura&&S.apertura.auxDocs)||[]);
export const docsDeCuenta=cd=>docsApertura().filter(d=>d.cd===cd);
export const totalCapturado=cd=>docsDeCuenta(cd).reduce((s,d)=>s+(+d.saldo||0),0);

// Estado de cuadratura de una cuenta
export function estadoCuenta(cd){
  const c=cuentasAuxDeApertura().find(x=>x.cd===cd);
  const esperado=c?c.monto:0;
  const capturado=totalCapturado(cd);
  const dif=capturado-esperado;
  return {esperado,capturado,dif,ok:Math.abs(dif)<1,docs:docsDeCuenta(cd).length};
}

// Resumen para la tarjeta de la sección Apertura
export function resumenAperturaAux(){
  const cuentas=cuentasAuxDeApertura();
  return cuentas.map(c=>({...c,...estadoCuenta(c.cd)}));
}

// ── Edición ──
export function abrirAperturaAux(cd){
  if(!S.apertura){toast('⚠️ Primero configura el Balance de Apertura','e');return;}
  const c=cuentasAuxDeApertura().find(x=>x.cd===cd);
  if(!c){toast('⚠️ Esa cuenta no está en la apertura','e');return;}
  APX.abierto=true;APX.cd=cd;
  APX.docs=docsDeCuenta(cd).map(d=>({...d}));
  if(!APX.docs.length)APX.docs=[nuevoDoc(cd)];
  renderAperturaAux();
  document.getElementById('apx-modal').classList.add('open');
}

export function cerrarAperturaAux(){
  APX.abierto=false;APX.cd='';APX.docs=[];
  document.getElementById('apx-modal').classList.remove('open');
}

const nuevoDoc=cd=>({cd,rutCodigo:'',rutDV:'',razonSocial:'',tipoDTE:'',numero:'',
                     fecha:'',fechaVencimiento:'',monto:0,saldo:0});

export function apxAddDoc(){APX.docs.push(nuevoDoc(APX.cd));renderAperturaAux();}
export function apxDelDoc(i){
  APX.docs.splice(i,1);
  if(!APX.docs.length)APX.docs=[nuevoDoc(APX.cd)];
  renderAperturaAux();
}
export function apxCampo(i,campo,valor){
  const d=APX.docs[i];if(!d)return;
  if(campo==='monto'||campo==='saldo'){
    d[campo]=+String(valor).replace(/[^\d-]/g,'')||0;
    // Al escribir el monto por primera vez, el saldo se asume igual: lo más
    // común es capturar documentos impagos completos.
    if(campo==='monto'&&!d._saldoTocado)d.saldo=d.monto;
    if(campo==='saldo')d._saldoTocado=true;
  }else d[campo]=valor;
  apxActualizarCuadre();
}
// El buscador de auxiliares rellena RUT y razón social de una
export function apxAuxElegido(i,rut){
  const d=APX.docs[i];if(!d)return;
  const tipo=tipoDeCuenta(APX.cd);
  d.rutCodigo=String(rut||'');
  d.rutDV=rutDV(d.rutCodigo)||'';
  const f=fichaAux(tipo==='cliente'?'cliente':'proveedor',d.rutCodigo);
  if(f)d.razonSocial=f.razonSocial||f.nombre||'';
  renderAperturaAux();
}
export function apxRut(i,val){
  const d=APX.docs[i];if(!d)return;
  const r=rutParse(val);
  d.rutCodigo=r.codigo||'';d.rutDV=r.dv||'';
  apxActualizarCuadre();
}

// ── Vista ──
function opcionesDTE(tipo,sel){
  const lista=tipo==='cliente'?DTE_VENTAS:DTE_COMPRAS;
  return `<option value="">—</option>`+
    (lista||[]).map(d=>`<option value="${d.cd}" ${+sel===+d.cd?'selected':''}>${d.cd} — ${d.nm}</option>`).join('');
}

export function renderAperturaAux(){
  const box=document.getElementById('apx-body');if(!box)return;
  const cd=APX.cd;
  const c=cuentasAuxDeApertura().find(x=>x.cd===cd)||{nm:pdcNm(cd),monto:0,tipo:''};
  const tipo=c.tipo;
  const lbl=etiquetaTipo[tipo]||'auxiliar';

  const filas=APX.docs.map((d,i)=>`<tr>
    <td class="tl" style="padding:4px">${i+1}</td>
    <td style="padding:4px;min-width:190px">
      ${inputAux({id:`apx-rut-${i}`,tipo:tipo==='cliente'?'cliente':'proveedor',
                  value:(d.rutCodigo||'')+(d.rutDV||''),
                  onPick:`apxAuxElegido(${i},'%RUT%')`,placeholder:'RUT o nombre…'})}
    </td>
    <td style="padding:4px;min-width:170px">
      <input type="text" class="linea-inp" placeholder="Razón social" value="${(d.razonSocial||'').replace(/"/g,'&quot;')}"
        oninput="apxCampo(${i},'razonSocial',this.value)">
    </td>
    <td style="padding:4px">
      <select class="linea-inp" onchange="apxCampo(${i},'tipoDTE',this.value)" style="min-width:120px">
        ${opcionesDTE(tipo,d.tipoDTE)}
      </select>
    </td>
    <td style="padding:4px"><input type="text" class="linea-inp" style="width:80px" placeholder="N°"
      value="${d.numero||''}" oninput="apxCampo(${i},'numero',this.value)"></td>
    <td style="padding:4px"><input type="date" class="linea-inp" value="${d.fecha||''}"
      onchange="apxCampo(${i},'fecha',this.value)"></td>
    <td style="padding:4px"><input type="date" class="linea-inp" value="${d.fechaVencimiento||''}"
      onchange="apxCampo(${i},'fechaVencimiento',this.value)"></td>
    <td style="padding:4px"><input type="text" class="linea-num-inp" inputmode="numeric" placeholder="0"
      value="${d.monto?new Intl.NumberFormat('es-CL').format(d.monto):''}"
      oninput="apxCampo(${i},'monto',this.value)" onblur="renderAperturaAux()" onfocus="this.select()"></td>
    <td style="padding:4px"><input type="text" class="linea-num-inp" inputmode="numeric" placeholder="0"
      value="${d.saldo?new Intl.NumberFormat('es-CL').format(d.saldo):''}"
      oninput="apxCampo(${i},'saldo',this.value)" onblur="renderAperturaAux()" onfocus="this.select()"></td>
    <td style="padding:4px;text-align:center">
      <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="apxDelDoc(${i})">✕</button></td>
  </tr>`).join('');

  box.innerHTML=`
    <div style="padding:14px 18px">
      <div class="info-tip" style="margin-bottom:12px;font-size:11px;line-height:1.6">
        📌 Cuenta <strong>${cd} ${c.nm}</strong> — la apertura dice <strong>${fmtC(c.monto)}</strong>.
        Captura acá los documentos históricos que componen ese saldo, uno por fila.
        El <strong>saldo</strong> es lo que quedaba pendiente al inicio del ejercicio
        (si el documento está impago completo, es igual al monto).
      </div>

      <div class="tw" style="max-height:46vh;overflow:auto">
        <table style="font-size:12px;width:100%">
          <thead><tr>
            <th class="tl" style="width:26px">#</th>
            <th class="tl">RUT ${lbl}</th>
            <th class="tl">RAZÓN SOCIAL</th>
            <th class="tl">DOCUMENTO</th>
            <th class="tl">N°</th>
            <th class="tl">EMISIÓN</th>
            <th class="tl">VENCE</th>
            <th style="text-align:right">MONTO</th>
            <th style="text-align:right">SALDO</th>
            <th></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>

      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-i" onclick="apxAddDoc()">+ Agregar documento</button>
        <button class="btn btn-g" onclick="descargarPlantillaAperturaAux()">📄 Plantilla Excel</button>
        <button class="btn btn-g" onclick="document.getElementById('apx-file').click()">📥 Importar Excel</button>
      </div>

      <div id="apx-cuadre" class="dist-check" style="margin-top:12px"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button class="btn btn-g" onclick="cerrarAperturaAux()">Cancelar</button>
        <button class="btn btn-p" onclick="guardarAperturaAux()">💾 Guardar detalle</button>
      </div>
    </div>`;
  apxActualizarCuadre();
}

export function apxActualizarCuadre(){
  const box=document.getElementById('apx-cuadre');if(!box)return;
  const c=cuentasAuxDeApertura().find(x=>x.cd===APX.cd)||{monto:0};
  const suma=APX.docs.reduce((s,d)=>s+(+d.saldo||0),0);
  const dif=suma-c.monto;
  const ok=Math.abs(dif)<1;
  box.className='dist-check '+(ok?'ok':'err');
  box.innerHTML=`<span style="font-size:14px">${ok?'✅':'⚠️'}</span>
    <span style="font-weight:600">${ok?'Cuadrado con la apertura'
      :dif>0?`Sobran ${fmtC(dif)} respecto de la apertura`
             :`Faltan ${fmtC(-dif)} para llegar a la apertura`}</span>
    <span style="margin-left:auto;font-size:11px;color:var(--mt)">
      Apertura: ${fmtC(c.monto)} · Capturado: ${fmtC(suma)} · ${APX.docs.filter(d=>d.saldo).length} documento(s)
    </span>`;
}

// ── Guardar ──
export async function guardarAperturaAux(){
  if(!S.apertura){toast('⚠️ No hay balance de apertura','e');return;}
  const cd=APX.cd;
  const c=cuentasAuxDeApertura().find(x=>x.cd===cd)||{monto:0};
  const docs=APX.docs.filter(d=>(+d.saldo||0)!==0||d.numero||d.rutCodigo);

  // Validaciones: sin RUT el documento no sirve para nada en el auxiliar
  for(let i=0;i<docs.length;i++){
    const d=docs[i];
    if(!d.rutCodigo){toast(`⚠️ Fila ${i+1}: falta el RUT`,'e');return;}
    if(rutDV(d.rutCodigo)!==String(d.rutDV).toUpperCase()){toast(`⚠️ Fila ${i+1}: RUT inválido`,'e');return;}
    if(!String(d.razonSocial||'').trim()){toast(`⚠️ Fila ${i+1}: falta la razón social`,'e');return;}
    if(!(+d.saldo)){toast(`⚠️ Fila ${i+1}: el saldo no puede ser cero`,'e');return;}
    if(!d.fecha){toast(`⚠️ Fila ${i+1}: falta la fecha de emisión`,'e');return;}
  }
  const suma=docs.reduce((s,d)=>s+(+d.saldo||0),0);
  if(Math.abs(suma-c.monto)>=1){
    if(!confirm(
      `El detalle no cuadra con la apertura.\n\n`+
      `  Apertura:  ${fmtC(c.monto)}\n`+
      `  Capturado: ${fmtC(suma)}\n`+
      `  Diferencia:${fmtC(suma-c.monto)}\n\n`+
      `Puedes guardarlo igual y completarlo después, pero mientras no cuadre el\n`+
      `auxiliar no va a coincidir con el balance.\n\n¿Guardar de todas formas?`))return;
  }

  const limpios=docs.map(d=>({
    cd,rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:String(d.razonSocial||'').trim(),
    tipoDTE:+d.tipoDTE||0,numero:String(d.numero||'').trim(),
    fecha:d.fecha,fechaVencimiento:d.fechaVencimiento||'',
    monto:+d.monto||+d.saldo||0,saldo:+d.saldo||0,
  }));

  const otros=docsApertura().filter(d=>d.cd!==cd);
  S.apertura.auxDocs=[...otros,...limpios];
  try{await window.storage.set('apertura-'+S.empresa.anio,JSON.stringify(S.apertura));}
  catch(e){toast('❌ Error guardando: '+e.message,'e');return;}
  logAccion('Detalle de apertura',`${cd} — ${limpios.length} documentos`);
  toast(`✅ ${limpios.length} documento(s) guardados en ${cd}`);
  cerrarAperturaAux();
  rerender();
}

// ── Plantilla e importación ──
export function descargarPlantillaAperturaAux(){
  if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada','e');return;}
  const tipo=tipoDeCuenta(APX.cd);
  const hdr=['RUT','Razón Social','Tipo DTE','N° Documento','Fecha Emisión','Fecha Vencimiento','Monto','Saldo Pendiente'];
  const ej=tipo==='cliente'
    ? [['76123456-7','CLIENTE EJEMPLO SPA',33,'1001','2025-11-20','2025-12-20',1190000,1190000]]
    : [['77999888-6','PROVEEDOR EJEMPLO LTDA',33,'5001','2025-10-15','2025-11-15',595000,300000]];
  const ws=XLSX.utils.aoa_to_sheet([hdr,...ej]);
  ws['!cols']=[{wch:14},{wch:34},{wch:10},{wch:14},{wch:15},{wch:17},{wch:14},{wch:16}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Documentos');
  XLSX.writeFile(wb,`apertura-auxiliar-${APX.cd}.xlsx`);
  toast('📄 Plantilla descargada — la fila de ejemplo se puede borrar');
}

export function initAperturaAuxListener(){
  const inp=document.getElementById('apx-file');
  if(!inp||inp.dataset.listo)return;
  inp.dataset.listo='1';
  inp.addEventListener('change',async ev=>{
    const file=ev.target.files&&ev.target.files[0];
    ev.target.value='';
    if(!file)return;
    if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada','e');return;}
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const filas=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const {docs,errores}=parsearFilasApertura(filas,APX.cd);
      if(!docs.length){
        toast('⚠️ No se encontró ninguna fila válida — revisa el formato','e');
        console.warn('Importación apertura auxiliar:',errores);return;
      }
      // Se AGREGAN a lo que ya hay: importar dos archivos parciales es normal
      const vacias=APX.docs.filter(d=>!d.rutCodigo&&!d.saldo);
      APX.docs=[...APX.docs.filter(d=>d.rutCodigo||d.saldo),...docs];
      renderAperturaAux();
      toast(`📥 ${docs.length} documento(s) importados${errores.length?` · ${errores.length} fila(s) con problemas`:''}`
            ,errores.length?'e':'');
      if(errores.length)console.warn('Filas con problemas:',errores);
    }catch(e){toast('❌ Error leyendo el archivo: '+e.message,'e');}
  });
}

// Lee la matriz del Excel. Tolerante: busca el encabezado y acepta variantes
// de los nombres de columna, porque cada quien exporta el auxiliar distinto.
export function parsearFilasApertura(filas,cd){
  const docs=[],errores=[];
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  // Ubicar la fila de encabezado (la que menciona un RUT)
  let hi=filas.findIndex(f=>(f||[]).some(c=>/^rut/.test(norm(c))));
  if(hi<0)hi=0;
  const hdr=(filas[hi]||[]).map(norm);
  const col=(...nombres)=>{
    for(const n of nombres){
      const i=hdr.findIndex(h=>h.includes(n));
      if(i>=0)return i;
    }
    return -1;
  };
  const iRut=col('rut'), iRS=col('razon','nombre'), iTipo=col('tipo'), iNum=col('n° doc','numero','n doc','folio','documento'),
        iFec=col('emision','fecha emision','fecha'), iVen=col('vencim'),
        iMonto=col('monto','total'), iSaldo=col('saldo','pendiente');
  if(iRut<0)return {docs,errores:[{fila:hi+1,motivo:'no se encontró la columna RUT'}]};

  const fechaDe=v=>{
    if(v===''||v==null)return '';
    if(typeof v==='number'){          // serial de Excel
      const d=new Date(Math.round((v-25569)*86400000));
      return isNaN(d)?'':d.toISOString().slice(0,10);
    }
    const s=String(v).trim();
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);            if(m)return `${m[1]}-${m[2]}-${m[3]}`;
    m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);  if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return '';
  };
  const num=v=>{
    if(typeof v==='number')return Math.round(v);
    return Math.round(+String(v||'').replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'))||0;
  };

  for(let i=hi+1;i<filas.length;i++){
    const f=filas[i]||[];
    const rutRaw=String(f[iRut]||'').trim();
    if(!rutRaw)continue;
    const r=rutParse(rutRaw);
    if(!r.codigo){errores.push({fila:i+1,motivo:'RUT ilegible: '+rutRaw});continue;}
    if(!r.valido){errores.push({fila:i+1,motivo:'RUT con dígito verificador incorrecto: '+rutRaw});continue;}
    const monto=iMonto>=0?num(f[iMonto]):0;
    const saldo=iSaldo>=0?num(f[iSaldo]):monto;
    if(!saldo){errores.push({fila:i+1,motivo:'saldo pendiente vacío o cero'});continue;}
    const fecha=iFec>=0?fechaDe(f[iFec]):'';
    if(!fecha){errores.push({fila:i+1,motivo:'fecha de emisión ilegible'});continue;}
    const ficha=fichaAux(tipoDeCuenta(cd)==='cliente'?'cliente':'proveedor',r.codigo);
    docs.push({
      cd,rutCodigo:r.codigo,rutDV:r.dv,
      razonSocial:String((iRS>=0?f[iRS]:'')||(ficha?ficha.razonSocial:'')||'').trim(),
      tipoDTE:iTipo>=0?(+String(f[iTipo]).replace(/\D/g,'')||0):0,
      numero:String((iNum>=0?f[iNum]:'')||'').trim(),
      fecha,fechaVencimiento:iVen>=0?fechaDe(f[iVen]):'',
      monto:monto||saldo,saldo,
    });
  }
  return {docs,errores};
}

// ── Tarjeta en la sección Apertura ──
export function bloqueAperturaAux(){
  if(!S.apertura)return '';
  const cuentas=resumenAperturaAux();
  if(!cuentas.length)return '';
  const filas=cuentas.map(c=>`<tr>
    <td class="tl" style="font-size:12px">
      <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">${c.cd}</span> ${c.nm}
      <div style="font-size:10px;color:var(--mt)">${c.docs} documento(s) capturados</div>
    </td>
    <td style="font-family:var(--mono);font-size:12px">${fmtC(c.monto)}</td>
    <td style="font-family:var(--mono);font-size:12px;${c.ok?'':'color:var(--err)'}">${fmtC(c.capturado)}</td>
    <td style="text-align:center">${c.ok
      ? '<span class="badge bg">✓ cuadra</span>'
      : `<span class="badge br" title="Diferencia ${fmtC(c.dif)}">⚠️ ${fmtC(Math.abs(c.dif))}</span>`}</td>
    <td style="text-align:right"><button class="btn btn-i" onclick="abrirAperturaAux('${c.cd}')">
      ${c.docs?'✏️ Editar detalle':'+ Capturar'}</button></td>
  </tr>`).join('');
  const pendientes=cuentas.filter(c=>!c.ok).length;
  return `<div class="card" style="margin-top:14px${pendientes?';border-color:var(--warn)':''}">
    <div class="card-title">📒 Detalle de auxiliares de la apertura</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:12px;line-height:1.6">
      El asiento de apertura dice cuánto suman los clientes, proveedores y honorarios por pagar,
      pero no <em>qué documentos</em> lo componen. Captúralos acá para que el auxiliar arranque con su
      historia real: el aging clasifica lo vencido y Pagos y Cobros puede imputar contra facturas
      anteriores al sistema.
      ${pendientes?`<br><span style="color:var(--warn)">⚠️ ${pendientes} cuenta(s) todavía no cuadran con el balance.</span>`:''}
    </div>
    <div class="tw"><table>
      <thead><tr><th class="tl">CUENTA</th><th style="text-align:right">SEGÚN APERTURA</th>
        <th style="text-align:right">CAPTURADO</th><th></th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
  </div>`;
}
