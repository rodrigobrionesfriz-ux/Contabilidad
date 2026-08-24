// pagos.js — Módulo de pagos masivos a proveedores y cobros de clientes
//
// Permite:
//   - Ver documentos con saldo pendiente (proveedores o clientes)
//   - Seleccionar varios y aplicar pago/cobro con cuenta de caja o banco
//   - Registrar el pago en el documento (S.compras[i].pagos / S.ventas[i].pagos)
//   - Generar automáticamente un asiento contable en S.asientos
//
// Al pagar N documentos con la misma cuenta, se crea UN asiento contable
// con una línea por documento (proveedor DEBE) y una única línea de banco/caja
// (HABER). Esto refleja la realidad de una transferencia consolidada.

import {toast, fmtC, MESES, pdcNm, PDC, today, dteV, dteC, rutFmt} from './core.js';
import {S} from './state.js';
import {proxFolioAsiento, CUENTAS_AUX} from './asientos.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {inputCuenta} from './buscadorcuentas.js';

// Estado del módulo — persiste solo mientras estás en la vista
let PAG={
  tipo:'proveedor',      // 'proveedor' | 'cliente'
  fecha:today(),
  cuentaPago:'',         // caja o banco
  glosa:'',
  seleccionados:new Set(),   // set de docId
  montoParcial:{},       // docId → monto (para pagos parciales)
  filtro:{texto:'',mes:''},
};

// ═══ HELPERS ═══

// Documentos con saldo pendiente, aplicando efecto de NC/ND referenciadas.
//
// Reglas:
//   - Facturas (DTE 30/33/34/45/46 compras · 33/34/39/41 ventas): aparecen
//     como docs pendientes con su saldo real (total - NC referenciadas + ND
//     referenciadas - pagos).
//   - NC/ND que tienen `folioRef` apuntando a una factura: NO aparecen como
//     doc separado; su monto se aplica al saldo de la factura referenciada.
//   - NC/ND SIN referencia ("huérfanas"): aparecen aparte con badge amarillo
//     pidiendo que se asocien a una factura del mismo proveedor/cliente.
function docsPendientes(tipo){
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  // Separar facturas de NC/ND
  const facturas=[];
  const notasReferenciadas={};   // key = rut|folioRef -> [notas]
  const huerfanas=[];
  arr.forEach(d=>{
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    if(signo<0||+d.tipoDTE===56){   // NC (signo -1) o ND (56)
      if(d.folioRef){
        const key=d.rutCodigo+'|'+String(d.folioRef).trim();
        if(!notasReferenciadas[key])notasReferenciadas[key]=[];
        notasReferenciadas[key].push({...d,dteInfo,signo});
      }else{
        huerfanas.push({...d,dteInfo,signo});
      }
    }else{
      facturas.push({...d,dteInfo,signo});
    }
  });

  // Calcular saldos de facturas aplicando NC/ND referenciadas
  const conSaldo=facturas.map(f=>{
    const key=f.rutCodigo+'|'+String(f.numero).trim();
    const notas=notasReferenciadas[key]||[];
    const efectoNotas=notas.reduce((s,n)=>s+((n.total||0)*n.signo),0);
    // Total: factura + notas (NC restan, ND suman)
    const totalReal=(f.total||0)+efectoNotas;
    const pagosSum=(f.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
    return {...f,totalSigno:totalReal,pagosSum,saldo:totalReal-pagosSum,notas,notasAuto:[]};
  });

  // ── Notas de crédito sin referencia: se imputan FIFO al mismo auxiliar ──
  // Una NC sin folio de referencia igual reduce la deuda con ese proveedor.
  // Si no se imputa, la factura que anula sigue apareciendo con saldo completo
  // y se puede pagar igual: el auxiliar termina rebajado DOS VECES por la misma
  // operación (una por la NC y otra por el pago). Se imputan de la más antigua
  // a la más nueva, el mismo criterio FIFO que usa el Aging de Auxiliares.
  const porRut={};
  conSaldo.forEach(f=>{(porRut[f.rutCodigo]||(porRut[f.rutCodigo]=[])).push(f);});
  Object.values(porRut).forEach(list=>list.sort((a,b)=>
    (a.fecha||'').localeCompare(b.fecha||'')||String(a.numero||'').localeCompare(String(b.numero||''))));

  const huerfanasRestantes=[];
  huerfanas.forEach(h=>{
    const totalSigno=(h.total||0)*h.signo;
    const pagosSum=(h.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
    let restante=totalSigno-pagosSum;
    // Sólo las de efecto negativo (NC) se imputan; una ND aumenta la deuda y
    // sigue siendo un documento por pagar en sí mismo.
    if(restante>=0){
      if(Math.abs(restante)>1)huerfanasRestantes.push({...h,totalSigno,pagosSum,saldo:restante,huerfana:true});
      return;
    }
    const aplicadoA=[];
    (porRut[h.rutCodigo]||[]).forEach(f=>{
      if(restante>=-0.5||f.saldo<=0.5)return;
      const aplica=Math.min(f.saldo,-restante);
      f.saldo-=aplica;
      restante+=aplica;
      f.notasAuto.push({numero:h.numero,tipoDTE:h.tipoDTE,fecha:h.fecha,monto:aplica,id:h.id});
      aplicadoA.push({numero:f.numero,monto:aplica});
    });
    if(restante<-0.5){
      // Sobrante: queda como saldo a favor del auxiliar
      huerfanasRestantes.push({...h,totalSigno,pagosSum,saldo:restante,huerfana:true,
        aplicadoParcial:aplicadoA.length>0,aplicadoA});
    }
  });

  const resultado=[];
  conSaldo.forEach(f=>{if(Math.abs(f.saldo)>1)resultado.push(f);});
  huerfanasRestantes.forEach(h=>resultado.push(h));
  return resultado;
}

// Auxiliares cuyo saldo quedó DEUDOR (se pagó más de lo que se debía).
// Es la huella que deja un documento pagado dos veces o un pago sobre una
// factura que ya estaba anulada por una nota de crédito.
function auxiliaresSobrepagados(tipo){
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  const porRut={};
  arr.forEach(d=>{
    const k=d.rutCodigo;if(!k)return;
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    if(!porRut[k])porRut[k]={rutCodigo:k,rutDV:d.rutDV,razonSocial:d.razonSocial||'',deuda:0,pagado:0};
    porRut[k].deuda+=(d.total||0)*signo;
    porRut[k].pagado+=(d.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
    if(d.razonSocial)porRut[k].razonSocial=d.razonSocial;
  });
  return Object.values(porRut)
    .map(a=>({...a,exceso:a.pagado-a.deuda}))
    .filter(a=>a.exceso>1)
    .sort((a,b)=>b.exceso-a.exceso);
}

// Panel de alerta: auxiliares con saldo deudor por pagos en exceso
function avisoSobrepagos(){
  const lista=auxiliaresSobrepagados(PAG.tipo);
  if(!lista.length)return '';
  const esProv=PAG.tipo==='proveedor';
  const total=lista.reduce((s,a)=>s+a.exceso,0);
  const filas=lista.slice(0,15).map(a=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(a.rutCodigo,a.rutDV)}</td>
    <td class="tnm" style="font-size:11px">${a.razonSocial||'(sin razón social)'}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(a.deuda)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(a.pagado)}</td>
    <td style="font-family:var(--mono);text-align:right;color:var(--err);font-weight:700">${fmtC(a.exceso)}</td>
  </tr>`).join('');
  return `<div style="background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.35);border-radius:8px;padding:12px 14px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700;color:var(--err);margin-bottom:4px">
      ⚠️ ${lista.length} ${esProv?'proveedor':'cliente'}${lista.length===1?'':'es'} con ${esProv?'pagos':'cobros'} por sobre lo adeudado
    </div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px;line-height:1.5">
      Se registró ${esProv?'un pago':'un cobro'} mayor al saldo real por <strong style="color:var(--err)">${fmtC(total)}</strong> en total.
      La causa habitual es haber ${esProv?'pagado':'cobrado'} una factura que <strong>ya estaba anulada por una nota de crédito</strong>:
      la cuenta del auxiliar queda rebajada dos veces por la misma operación.
      Revisa el detalle en Auxiliares y anula el ${esProv?'pago':'cobro'} sobrante desde su asiento.
    </div>
    <div class="tw" style="max-height:220px;overflow:auto"><table>
      <thead><tr><th class="tl">RUT</th><th class="tl">RAZÓN SOCIAL</th><th style="text-align:right">ADEUDADO</th><th style="text-align:right">${esProv?'PAGADO':'COBRADO'}</th><th style="text-align:right">EXCESO</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${lista.length>15?`<div style="font-size:10px;color:var(--mt);margin-top:6px">Mostrando los primeros 15 de ${lista.length}.</div>`:''}
  </div>`;
}

// Facturas del mismo proveedor/cliente (para el selector "asociar a factura")
function facturasDelAuxiliar(tipo,rutCodigo){
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  return arr.filter(d=>{
    if(d.rutCodigo!==rutCodigo)return false;
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    return signo>0&&+d.tipoDTE!==56;   // solo facturas, no NC ni ND
  }).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
}

// Cuentas de caja y banco disponibles (código 1101xxx)
function cuentasPagoOpts(){
  const cuentas=PDC.filter(c=>c.cd&&c.cd.startsWith('1101')&&c.tp==='A');
  let opts='<option value="">— seleccionar cuenta —</option>';
  cuentas.forEach(c=>{
    opts+=`<option value="${c.cd}" ${PAG.cuentaPago===c.cd?'selected':''}>${c.cd} — ${c.nm}</option>`;
  });
  return opts;
}

// ═══ RENDER ═══

function renderPagos(){
  const cont=document.getElementById('pagos-content');
  if(!cont)return;

  const docs=docsPendientes(PAG.tipo);
  // Filtros
  let filtrados=docs;
  if(PAG.filtro.mes){
    filtrados=filtrados.filter(d=>+d.fecha.slice(5,7)===+PAG.filtro.mes);
  }
  if(PAG.filtro.texto){
    const t=PAG.filtro.texto.toLowerCase();
    filtrados=filtrados.filter(d=>
      (d.razonSocial||'').toLowerCase().includes(t)||
      (d.rutCodigo||'').includes(t)||
      String(d.numero||'').includes(t)
    );
  }

  // Totales de selección (para el panel superior)
  let totSel=0, cntSel=0;
  PAG.seleccionados.forEach(id=>{
    const d=filtrados.find(x=>x.id===id);
    if(!d)return;
    const monto=PAG.montoParcial[id]!=null?+PAG.montoParcial[id]:d.saldo;
    totSel+=monto; cntSel++;
  });

  const accionLbl=PAG.tipo==='proveedor'?'Pagar':'Cobrar';
  const sustantivo=PAG.tipo==='proveedor'?'pago':'cobro';   // "fecha del pago" / "datos del cobro"

  let h=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ${PAG.tipo==='proveedor'?'btn-p':'btn-g'}" onclick="setPagTipo('proveedor')">🏭 Pagar Proveedores</button>
      <button class="btn ${PAG.tipo==='cliente'?'btn-p':'btn-g'}" onclick="setPagTipo('cliente')">📇 Cobrar Clientes</button>
    </div>
    ${avisoSobrepagos()}

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">💳 Datos del ${sustantivo}</div>
      <div class="fg">
        <div class="grp"><label>Fecha del ${sustantivo}</label>
          <input type="date" value="${PAG.fecha}" oninput="setPagCampo('fecha',this.value)"></div>
        <div class="grp"><label>${PAG.tipo==='proveedor'?'Cuenta de origen':'Cuenta de destino'} (caja / banco)</label>
          <select onchange="setPagCampo('cuentaPago',this.value)">${cuentasPagoOpts()}</select></div>
        <div class="grp full"><label>Glosa del asiento (opcional)</label>
          <input type="text" placeholder="Ej: Pago proveedores julio 2026" value="${PAG.glosa.replace(/"/g,'&quot;')}" oninput="setPagCampo('glosa',this.value)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 14px;background:${cntSel?'rgba(46,160,67,.08)':'var(--sf2)'};border-radius:6px;border:1px solid ${cntSel?'var(--ach)':'var(--bd)'};gap:10px;flex-wrap:wrap">
        <div style="font-size:12px">
          <strong>${cntSel}</strong> ${cntSel===1?'documento':'documentos'} seleccionado${cntSel===1?'':'s'}
          <span style="color:var(--mt);margin-left:8px">Total: <span style="font-family:var(--mono);font-weight:700;color:var(--tx)">${fmtC(totSel)}</span></span>
        </div>
        <button class="btn btn-p" ${cntSel&&PAG.cuentaPago?'':'disabled style="opacity:.4;cursor:not-allowed"'} onclick="ejecutarPago()">
          💾 ${accionLbl} ${cntSel} seleccionado${cntSel===1?'':'s'}
        </button>
      </div>
    </div>

    <div class="filter-row">
      <span class="f-lbl">Filtrar:</span>
      <select onchange="setPagFiltro('mes',this.value)">
        <option value="">Todos los meses</option>
        ${MESES.map((m,i)=>`<option value="${i+1}" ${+PAG.filtro.mes===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
      <input type="text" id="pag-search" placeholder="Buscar por RUT, razón social o folio…" value="${PAG.filtro.texto.replace(/"/g,'&quot;')}"
        oninput="setPagFiltro('texto',this.value)" style="min-width:220px">
      <button class="btn btn-g" onclick="limpiarPagFiltro()">Limpiar</button>
      <span class="doc-count" id="pag-count"></span>
    </div>
    <div id="pagos-tabla"></div>
  `;

  cont.innerHTML=h;
  renderPagosTabla();
}

// Renderiza SOLO la tabla + contador (depende de los filtros). Se separa del
// render principal para poder filtrar por texto sin destruir el input de
// búsqueda (que perdería el foco y cerraría el teclado en móvil).
function renderPagosTabla(){
  const box=document.getElementById('pagos-tabla');
  if(!box)return;

  const accionLbl=PAG.tipo==='proveedor'?'Pagar':'Cobrar';
  const sustantivo=PAG.tipo==='proveedor'?'pago':'cobro';

  const docs=docsPendientes(PAG.tipo);
  let filtrados=docs;
  if(PAG.filtro.mes){
    filtrados=filtrados.filter(d=>+d.fecha.slice(5,7)===+PAG.filtro.mes);
  }
  if(PAG.filtro.texto){
    const t=PAG.filtro.texto.toLowerCase();
    filtrados=filtrados.filter(d=>
      (d.razonSocial||'').toLowerCase().includes(t)||
      (d.rutCodigo||'').includes(t)||
      String(d.numero||'').includes(t)
    );
  }

  const porRut={};
  filtrados.forEach(d=>{
    const k=d.rutCodigo||'sinRut';
    if(!porRut[k])porRut[k]={rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial,docs:[],total:0};
    porRut[k].docs.push(d);
    porRut[k].total+=d.saldo;
  });

  const cnt=document.getElementById('pag-count');
  if(cnt)cnt.textContent=`${filtrados.length} documentos pendientes · ${Object.keys(porRut).length} auxiliares`;

  if(!filtrados.length){
    box.innerHTML=`<div style="text-align:center;padding:40px;color:var(--mt)">
      <div style="font-size:36px;margin-bottom:8px">${PAG.tipo==='proveedor'?'💰':'📥'}</div>
      No hay documentos pendientes de ${sustantivo}
    </div>`;
    return;
  }

  // Tabla agrupada por auxiliar
  let h='<div class="card-np"><div class="tw"><table style="font-size:12px">';
  h+=`<thead><tr>
    <th style="width:30px;text-align:center"><input type="checkbox" onchange="togglePagAll(this.checked)"></th>
    <th class="tl" style="width:90px">FECHA</th>
    <th class="tl" style="width:110px">DTE</th>
    <th class="tl" style="width:80px">N°</th>
    <th class="tl">RAZÓN SOCIAL / RUT</th>
    <th style="text-align:right;width:110px">TOTAL DOC</th>
    <th style="text-align:right;width:110px">YA ${PAG.tipo==='proveedor'?'PAGADO':'COBRADO'}</th>
    <th style="text-align:right;width:110px">SALDO</th>
    <th style="width:120px">MONTO ${accionLbl.toUpperCase()}</th>
  </tr></thead><tbody>`;

  Object.values(porRut).sort((a,b)=>(a.razonSocial||'').localeCompare(b.razonSocial||'')).forEach(aux=>{
    // Encabezado del auxiliar
    h+=`<tr style="background:var(--sf2)">
      <td colspan="4" class="tl" style="font-weight:700;padding:6px 8px">
        ${aux.razonSocial||'(sin razón social)'} <span style="color:var(--mt);font-family:var(--mono);font-size:10px">${rutFmt(aux.rutCodigo,aux.rutDV)}</span>
      </td>
      <td colspan="4" style="text-align:right;padding:6px 8px;color:var(--mt);font-size:11px">
        Total pendiente:
      </td>
      <td style="text-align:right;padding:6px 8px;font-family:var(--mono);font-weight:700">${fmtC(aux.total)}</td>
    </tr>`;
    aux.docs.forEach(d=>{
      const sel=PAG.seleccionados.has(d.id);
      const dteNm=d.dteInfo?.nm||`DTE ${d.tipoDTE}`;
      const montoDef=PAG.montoParcial[d.id]!=null?PAG.montoParcial[d.id]:d.saldo;

      // Badge de huérfana: NC/ND sin referencia
      const badgeHuerfana=d.huerfana?`
        <span style="background:rgba(255,193,7,.15);color:var(--warn);padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px;cursor:pointer" onclick="event.stopPropagation();abrirAsociarNota('${d.id}','${d.rutCodigo}')">
          ⚠ SIN REFERENCIA${d.aplicadoParcial?' · IMPUTADA EN PARTE':''} · Asociar
        </span>`:'';
      // Nota de crédito sin referencia imputada automáticamente a esta factura:
      // el saldo ya viene rebajado, por eso se avisa de dónde sale.
      // Notas imputadas automáticamente por falta de referencia. Antes eran un
      // simple aviso y la nota desaparecía de la lista, así que no quedaba forma
      // de corregir a qué factura se aplicó. Ahora cada una es un botón que abre
      // la asociación para fijarla donde corresponde.
      const badgeNotaAuto=(d.notasAuto&&d.notasAuto.length)?d.notasAuto.map(n=>`
        <span style="background:rgba(88,166,255,.13);color:var(--info);padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px;cursor:pointer"
          title="Aplicada automáticamente por no tener folio de referencia. Pulsa para asociarla a la factura que corresponde."
          onclick="event.stopPropagation();abrirAsociarNota('${n.id}','${d.rutCodigo}','${PAG.tipo}')">
          ↩ NC N°${n.numero} ${fmtC(n.monto)} · Asociar
        </span>`).join(''):'';

      h+=`<tr ${sel?'style="background:rgba(46,160,67,.04)"':''}>
        <td style="text-align:center"><input type="checkbox" ${sel?'checked':''} onchange="togglePagSel('${d.id}',this.checked)"></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}</td>
        <td class="tl" style="font-size:11px">${dteNm}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero}${badgeHuerfana}${badgeNotaAuto}</td>
        <td class="tl" style="color:var(--mt);font-size:11px">${d.fechaVencimiento?'Vence '+d.fechaVencimiento:''}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtC(d.totalSigno)}</td>
        <td style="text-align:right;font-family:var(--mono);color:${d.pagosSum?'var(--ach)':'var(--mt)'}">${d.pagosSum?fmtC(d.pagosSum):'—'}</td>
        <td style="text-align:right;font-family:var(--mono);font-weight:700;color:${d.saldo<0?'var(--err)':'var(--tx)'}">${fmtC(d.saldo)}</td>
        <td style="text-align:right">
          <input type="number" style="width:100px;text-align:right;font-family:var(--mono);font-size:11px;padding:3px 6px"
            value="${montoDef}" oninput="setPagMontoParcial('${d.id}',this.value)"
            ${sel?'':'disabled style="opacity:.4"'}>
        </td>
      </tr>`;
      // Sub-líneas: NC/ND asociadas a esta factura
      (d.notas||[]).forEach(n=>{
        const nmN=n.dteInfo?.nm||`DTE ${n.tipoDTE}`;
        const efecto=(n.total||0)*n.signo;
        h+=`<tr style="background:rgba(88,166,255,.04)">
          <td></td>
          <td class="tl" style="font-family:var(--mono);font-size:10px;padding-left:20px;color:var(--mt)">${n.fecha}</td>
          <td class="tl" style="font-size:10px;color:var(--info)">↳ ${nmN}</td>
          <td class="tl" style="font-family:var(--mono);font-size:10px;color:var(--mt)">${n.numero}
            <button class="btn btn-g" style="font-size:9px;padding:1px 5px;margin-left:4px" onclick="quitarReferencia('${n.id}')" title="Quitar referencia a factura">✕</button>
          </td>
          <td class="tl" style="color:var(--mt);font-size:10px">aplicado a N°${d.numero}</td>
          <td style="text-align:right;font-family:var(--mono);font-size:10px;color:${efecto<0?'var(--err)':'var(--ach)'}">${efecto>0?'+':''}${fmtC(efecto)}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`;
      });
    });
  });
  h+='</tbody></table></div></div>';

  box.innerHTML=h;
}

// ═══ ACCIONES ═══

function setPagTipo(t){
  PAG.tipo=t;
  PAG.seleccionados=new Set();
  PAG.montoParcial={};
  renderPagos();
}
function setPagCampo(campo,valor){
  PAG[campo]=valor;
  // No re-renderiza para no perder foco en el input
  if(campo==='cuentaPago')renderPagos();
}
function setPagFiltro(campo,valor){
  PAG.filtro[campo]=valor;
  // Solo re-renderiza la tabla (no el contenedor completo), así el input de
  // búsqueda conserva el foco y no se cierra el teclado en móvil.
  renderPagosTabla();
}
function limpiarPagFiltro(){
  PAG.filtro={texto:'',mes:''};
  renderPagos();
}
function togglePagSel(docId,checked){
  if(checked)PAG.seleccionados.add(docId);
  else{PAG.seleccionados.delete(docId);delete PAG.montoParcial[docId];}
  renderPagos();
}
function togglePagAll(checked){
  const docs=docsPendientes(PAG.tipo);
  if(checked)docs.forEach(d=>PAG.seleccionados.add(d.id));
  else{PAG.seleccionados=new Set();PAG.montoParcial={};}
  renderPagos();
}
function setPagMontoParcial(docId,valor){
  const v=+valor;
  if(!v||isNaN(v))delete PAG.montoParcial[docId];
  else PAG.montoParcial[docId]=v;
  // No re-renderiza para no perder foco
}

// ═══ EJECUTAR PAGO ═══
async function ejecutarPago(){
  if(!PAG.cuentaPago){toast('⚠️ Selecciona la cuenta de origen (caja o banco)','e');return;}
  if(!PAG.seleccionados.size){toast('⚠️ Selecciona al menos un documento','e');return;}
  if(!PAG.fecha){toast('⚠️ Ingresa la fecha del pago','e');return;}

  const docs=docsPendientes(PAG.tipo);
  const arr=PAG.tipo==='proveedor'?S.compras:S.ventas;
  const cuentaAux=PAG.tipo==='proveedor'?'2102001':'1104001';
  const nomAux=pdcNm(cuentaAux);
  const nomPago=pdcNm(PAG.cuentaPago);

  // Construir los movs del asiento
  const movs=[];
  let totalPago=0;
  const pagosPorDoc=[];
  const excedidos=[];
  const asientoId='a_pag_'+Date.now();

  PAG.seleccionados.forEach(docId=>{
    const d=docs.find(x=>x.id===docId);
    if(!d)return;
    let monto=PAG.montoParcial[docId]!=null?+PAG.montoParcial[docId]:d.saldo;
    if(!monto)return;
    // Nunca pagar por sobre el saldo real del documento: `d.saldo` ya viene
    // neto de notas de crédito (referenciadas e imputadas) y de pagos previos.
    if(monto>d.saldo+1){
      excedidos.push({numero:d.numero,pedido:monto,saldo:d.saldo});
      monto=d.saldo;
    }
    if(monto<=0)return;
    totalPago+=monto;
    pagosPorDoc.push({docId,monto,doc:d});
    // Una línea de auxiliar por documento (para trazabilidad en el libro mayor)
    const dteNm=d.dteInfo?.nm||`DTE ${d.tipoDTE}`;
    const descLinea=`${d.razonSocial||''} · ${dteNm} N°${d.numero}`.trim();
    if(PAG.tipo==='proveedor'){
      movs.push({
        cd:cuentaAux, nm:nomAux, desc:descLinea,
        debe:monto, haber:0,
        rutCodigo:d.rutCodigo, rutDV:d.rutDV, folio:d.numero, tipoDTE:d.tipoDTE,
      });
    }else{
      movs.push({
        cd:cuentaAux, nm:nomAux, desc:descLinea,
        debe:0, haber:monto,
        rutCodigo:d.rutCodigo, rutDV:d.rutDV, folio:d.numero, tipoDTE:d.tipoDTE,
      });
    }
  });

  if(excedidos.length){
    const det=excedidos.map(x=>`  · N°${x.numero}: pediste ${fmtC(x.pedido)} y el saldo real es ${fmtC(x.saldo)}`).join('\n');
    if(!confirm(`Hay ${excedidos.length} documento(s) con un monto mayor a su saldo real:\n\n${det}\n\n`+
      `Se ajustarán al saldo para no rebajar dos veces la cuenta del auxiliar.\n¿Continuar?`))return;
  }
  if(!totalPago){toast('⚠️ Monto total = 0','e');return;}

  // Una única línea de banco/caja consolidada
  if(PAG.tipo==='proveedor'){
    movs.push({cd:PAG.cuentaPago, nm:nomPago, desc:`${PAG.seleccionados.size} pagos a proveedores`, debe:0, haber:totalPago});
  }else{
    movs.push({cd:PAG.cuentaPago, nm:nomPago, desc:`${PAG.seleccionados.size} cobros a clientes`, debe:totalPago, haber:0});
  }

  // Crear asiento contable
  if(!S.asientos)S.asientos=[];
  const n=proxFolioAsiento();
  const glosaFinal=PAG.glosa||`${PAG.tipo==='proveedor'?'Pago a proveedores':'Cobro a clientes'} — ${pagosPorDoc.length} documento${pagosPorDoc.length===1?'':'s'}`;
  S.asientos.push({
    id:asientoId, n,
    fecha:PAG.fecha,
    glosa:glosaFinal,
    movs,
    tipo:'pago',   // marca este asiento como generado por el módulo de pagos
    cuentaPago:PAG.cuentaPago,
    esPagoAgrupado:true,
  });

  // Registrar el pago en cada documento
  pagosPorDoc.forEach(({docId,monto,doc})=>{
    const d=arr.find(x=>x.id===docId);
    if(!d)return;
    if(!d.pagos)d.pagos=[];
    d.pagos.push({
      id:'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      fecha:PAG.fecha,
      monto,
      cuentaPago:PAG.cuentaPago,
      asientoId,
      glosa:PAG.glosa||'',
    });
  });

  // Persistir
  await window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
  const clave=PAG.tipo==='proveedor'?'compras':'ventas';
  await window.storage.set(clave+'-'+S.empresa.anio,JSON.stringify(arr)).catch(()=>{});

  logAccion(`${PAG.tipo==='proveedor'?'Pagó':'Cobró'} ${pagosPorDoc.length} documento(s)`,`Total ${fmtC(totalPago)} · Asiento N°${n}`);
  toast(`✅ ${PAG.tipo==='proveedor'?'Pago registrado':'Cobro registrado'}: ${pagosPorDoc.length} doc · ${fmtC(totalPago)} · Asiento N°${n}`);

  // Limpiar selección y refrescar
  PAG.seleccionados=new Set();
  PAG.montoParcial={};
  PAG.glosa='';
  rerender();
}

// ═══ ASOCIAR NC/ND A FACTURA DE REFERENCIA ═══
//
// En Chile, las NC y ND se emiten CONTRA un documento específico (una factura,
// típicamente). El SII trae el campo "Folio Documento Referenciado" solo en el
// XML del DTE, no en el resumen RCV, así que el usuario debe asociarlas
// manualmente. Al asociar, la NC se descuenta del saldo pendiente de la factura.

// Estado del modal de asociación. Guarda el tipo con el que se abrió porque
// ahora también se entra desde Auxiliares, donde PAG.tipo no manda.
let ASOC={tipo:null,volverA:null};

function abrirAsociarNota(notaId,rutCodigo,tipo,volverA){
  const t=tipo||PAG.tipo;
  ASOC={tipo:t, volverA:volverA||null};
  const arr=t==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  const facturas=facturasDelAuxiliar(t,rutCodigo);
  if(!facturas.length){
    toast('⚠️ No hay facturas de este auxiliar para asociar','e');
    return;
  }
  const dteNotaInfo=t==='proveedor'?dteC(nota.tipoDTE):dteV(nota.tipoDTE);
  const nombreNota=dteNotaInfo?.nm||`DTE ${nota.tipoDTE}`;

  const box=document.getElementById('asoc-nota-modal-body');
  const modal=document.getElementById('asoc-nota-modal');
  if(!box||!modal)return;

  box.innerHTML=`
    <div style="padding:16px 20px">
      <div style="background:var(--sf2);border-radius:6px;padding:10px 14px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--mt);text-transform:uppercase;font-weight:700;margin-bottom:4px">Nota a asociar</div>
        <div style="font-weight:600">${nombreNota} N°${nota.numero} · ${nota.fecha}</div>
        <div style="font-family:var(--mono);font-size:12px;margin-top:2px">Monto: ${fmtC(nota.total)}</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">${nota.razonSocial||''} · ${rutFmt(nota.rutCodigo,nota.rutDV)}</div>
      </div>

      ${nota.folioRef?`<div class="info-tip" style="display:block;margin:0 0 12px">
        Hoy está asociada a la factura <strong>N°${nota.folioRef}</strong>. Elige otra para cambiarla.
      </div>`:`<div class="info-tip" style="display:block;margin:0 0 12px">
        Sin referencia. Mientras no la tenga, el sistema la descuenta de la factura más antigua con saldo,
        que no siempre es la que corresponde. Al asociarla queda imputada donde tú indiques.
      </div>`}

      <div style="font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">
        Selecciona la factura de referencia
      </div>

      <div style="max-height:360px;overflow-y:auto;border:1px solid var(--bd);border-radius:6px">
        ${facturas.map(f=>{
          const fInfo=t==='proveedor'?dteC(f.tipoDTE):dteV(f.tipoDTE);
          const fNm=fInfo?.nm||`DTE ${f.tipoDTE}`;
          return `<div style="padding:10px 14px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="confirmarAsociar('${nota.id}','${f.numero}')" onmouseover="this.style.background='rgba(88,166,255,.06)'" onmouseout="this.style.background=''">
            <div>
              <div style="font-weight:600;font-size:12px">${fNm} N°${f.numero}</div>
              <div style="font-size:10px;color:var(--mt);font-family:var(--mono);margin-top:2px">${f.fecha}${f.fechaVencimiento?' · Vence '+f.fechaVencimiento:''}</div>
            </div>
            <div style="font-family:var(--mono);font-weight:700;font-size:12px">${fmtC(f.total)}</div>
          </div>`;
        }).join('')}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button class="btn btn-g" onclick="cerrarAsociarNota()">Cancelar</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

function cerrarAsociarNota(){
  const m=document.getElementById('asoc-nota-modal');
  if(m)m.classList.remove('open');
}

async function confirmarAsociar(notaId,folioFactura){
  const tipo=ASOC.tipo||PAG.tipo;
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  nota.folioRef=String(folioFactura);
  const clave=tipo==='proveedor'?'compras':'ventas';
  await window.storage.set(clave+'-'+S.empresa.anio,JSON.stringify(arr)).catch(()=>{});
  logAccion('Asoció NC/ND a factura',`${nota.razonSocial} · Doc N°${nota.numero} → Fact N°${folioFactura}`);
  toast(`✅ Nota asociada a factura N°${folioFactura}`);
  cerrarAsociarNota();
  // Quitar de selección si estaba
  PAG.seleccionados.delete(notaId);
  // Volver a dibujar la pantalla desde la que se abrió el modal
  if(ASOC.volverA==='auxiliares'&&window.renderAuxiliares)window.renderAuxiliares();
  else renderPagos();
}

async function quitarReferencia(notaId,tipo){
  const t=tipo||PAG.tipo;
  const arr=t==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  const conf=confirm('¿Quitar la referencia de esta nota? Volverá a aparecer como documento independiente.');
  if(!conf)return;
  delete nota.folioRef;
  const clave=t==='proveedor'?'compras':'ventas';
  await window.storage.set(clave+'-'+S.empresa.anio,JSON.stringify(arr)).catch(()=>{});
  logAccion('Quitó referencia de NC/ND',`${nota.razonSocial} · Doc N°${nota.numero}`);
  toast('Referencia removida');
  if(window.getCurSec&&window.getCurSec()==='auxiliares'&&window.renderAuxiliares)window.renderAuxiliares();
  else renderPagos();
}

export {PAG, renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro,
        togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago,
        abrirAsociarNota, cerrarAsociarNota, confirmarAsociar, quitarReferencia};
