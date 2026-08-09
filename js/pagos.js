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

// Documentos con saldo pendiente (proveedores en compras, clientes en ventas)
function docsPendientes(tipo){
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  return arr.map(d=>{
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    // Total del documento con signo (NC restan)
    const totalSigno=(d.total||0)*signo;
    const pagosSum=(d.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
    const saldo=totalSigno-pagosSum;
    return {...d,dteInfo,signo,totalSigno,pagosSum,saldo};
  }).filter(d=>Math.abs(d.saldo)>1);   // solo con saldo pendiente
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

  // Agregado por auxiliar (proveedor/cliente)
  const porRut={};
  filtrados.forEach(d=>{
    const k=d.rutCodigo||'sinRut';
    if(!porRut[k])porRut[k]={rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial,docs:[],total:0};
    porRut[k].docs.push(d);
    porRut[k].total+=d.saldo;
  });

  // Totales de selección
  let totSel=0, cntSel=0;
  PAG.seleccionados.forEach(id=>{
    const d=filtrados.find(x=>x.id===id);
    if(!d)return;
    const monto=PAG.montoParcial[id]!=null?+PAG.montoParcial[id]:d.saldo;
    totSel+=monto; cntSel++;
  });

  const tipoLbl=PAG.tipo==='proveedor'?'a Proveedores':'de Clientes';
  const accionLbl=PAG.tipo==='proveedor'?'Pagar':'Cobrar';

  let h=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ${PAG.tipo==='proveedor'?'btn-p':'btn-g'}" onclick="setPagTipo('proveedor')">🏭 Pagar Proveedores</button>
      <button class="btn ${PAG.tipo==='cliente'?'btn-p':'btn-g'}" onclick="setPagTipo('cliente')">📇 Cobrar Clientes</button>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">💳 Datos del ${accionLbl.toLowerCase()}</div>
      <div class="fg">
        <div class="grp"><label>Fecha del ${accionLbl.toLowerCase()}</label>
          <input type="date" value="${PAG.fecha}" oninput="setPagCampo('fecha',this.value)"></div>
        <div class="grp"><label>${PAG.tipo==='proveedor'?'Cuenta de origen':'Cuenta de destino'} (caja / banco)</label>
          <select onchange="setPagCampo('cuentaPago',this.value)">${cuentasPagoOpts()}</select></div>
        <div class="grp full"><label>Glosa del asiento (opcional)</label>
          <input type="text" placeholder="Ej: Pago proveedores julio 2026" value="${PAG.glosa.replace(/"/g,'&quot;')}" oninput="setPagCampo('glosa',this.value)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 14px;background:${cntSel?'rgba(46,160,67,.08)':'var(--sf2)'};border-radius:6px;border:1px solid ${cntSel?'var(--ach)':'var(--bd)'}">
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
      <input type="text" placeholder="Buscar por RUT, razón social o folio…" value="${PAG.filtro.texto.replace(/"/g,'&quot;')}"
        oninput="setPagFiltro('texto',this.value)" style="min-width:220px">
      <button class="btn btn-g" onclick="limpiarPagFiltro()">Limpiar</button>
      <span class="doc-count">${filtrados.length} documentos pendientes · ${Object.keys(porRut).length} auxiliares</span>
    </div>
  `;

  if(!filtrados.length){
    h+=`<div style="text-align:center;padding:40px;color:var(--mt)">
      <div style="font-size:36px;margin-bottom:8px">${PAG.tipo==='proveedor'?'💰':'📥'}</div>
      No hay documentos pendientes de ${accionLbl.toLowerCase()}
    </div>`;
    cont.innerHTML=h;
    return;
  }

  // Tabla agrupada por auxiliar
  h+='<div class="card-np"><div class="tw"><table style="font-size:12px">';
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
      h+=`<tr ${sel?'style="background:rgba(46,160,67,.04)"':''}>
        <td style="text-align:center"><input type="checkbox" ${sel?'checked':''} onchange="togglePagSel('${d.id}',this.checked)"></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}</td>
        <td class="tl" style="font-size:11px">${dteNm}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero}</td>
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
    });
  });
  h+='</tbody></table></div></div>';

  cont.innerHTML=h;
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
  renderPagos();
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
  const asientoId='a_pag_'+Date.now();

  PAG.seleccionados.forEach(docId=>{
    const d=docs.find(x=>x.id===docId);
    if(!d)return;
    const monto=PAG.montoParcial[docId]!=null?+PAG.montoParcial[docId]:d.saldo;
    if(!monto)return;
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

export {PAG, renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro,
        togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago};
