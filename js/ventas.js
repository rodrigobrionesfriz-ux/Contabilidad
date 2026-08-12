// ventas.js — Libro de ventas (documentos individuales)
import {toast, pn, today, MESES, IVA, DTE_VENTAS, dteV, rutParse, rutFmt, rutDV, fmt, fmtC, CUENTAS_INGRESO} from './core.js';
import {leerArchivo} from './importadorsii.js';
import {inputCuenta} from './buscadorcuentas.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import {rerender} from './ui.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {mesRango, mesOpts, dteVentasOpts, foliosMensuales} from './helpers.js';
import {todosDocsVentas, abrirAsientoDesde, proxFolioComprobante} from './asientos.js';
import './storage.js';

// Estado del formulario de ventas (interno del módulo)
let VF={editId:null};
let IMV={docs:[]}; // estado del importador SII de ventas

// ═══ VENTAS — Documentos individuales ═══
// Computa folio correlativo por mes: retorna {[docId]: folioNumero}
// Al elegir un mes en el select, auto-poblar desde/hasta con primer y último día
function onMesChangeV(){
  const m=+(document.getElementById('vf-mes')?.value||0);
  if(m){const r=mesRango(m);document.getElementById('vf-desde').value=r.desde;document.getElementById('vf-hasta').value=r.hasta;}
  else{document.getElementById('vf-desde').value='';document.getElementById('vf-hasta').value='';}
  renderVentas();
}
function limpiarFiltrosV(){
  ['vf-mes','vf-desde','vf-hasta','vf-dte-flt','vf-search'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderVentas();
}
// Estado interno: ids de documentos seleccionados para acciones masivas
let VF_SEL=new Set();

function toggleVSel(id){
  if(VF_SEL.has(id))VF_SEL.delete(id);else VF_SEL.add(id);
  renderVentas();
}
function toggleVSelAll(marcados){
  // Solo alterna los que se están mostrando actualmente
  const box=document.getElementById('v-tbody');
  if(!box)return;
  box.querySelectorAll('input.v-chk[data-id]').forEach(chk=>{
    const id=chk.dataset.id;
    if(marcados)VF_SEL.add(id);else VF_SEL.delete(id);
  });
  renderVentas();
}
function limpiarVSel(){VF_SEL.clear();renderVentas();}
async function cambiarFPVSel(nuevaFP){
  if(!VF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  const fpLbl=nuevaFP==='clientes'?'a crédito (Cliente)':nuevaFP==='banco'?'al contado (Banco)':nuevaFP;
  // Solo se pueden modificar los documentos del libro (no los que vienen de un
  // asiento manual, que se editan desde el asiento).
  let cambiados=0, omitidos=0;
  S.ventas.forEach(d=>{
    if(!VF_SEL.has(d.id))return;
    if(d.formaPago!==nuevaFP){d.formaPago=nuevaFP;cambiados++;}
  });
  // ¿Había seleccionados que no están en el libro (vienen de asientos)?
  omitidos=VF_SEL.size-S.ventas.filter(d=>VF_SEL.has(d.id)).length;
  if(!cambiados&&!omitidos){toast('Los documentos ya tenían esa forma de pago');return;}
  VF_SEL.clear();
  try{await window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas));}catch(e){}
  toast(`✅ ${cambiados} documento${cambiados===1?'':'s'} marcado${cambiados===1?'':'s'} ${fpLbl}${omitidos?` · ${omitidos} omitido${omitidos===1?'':'s'} (vienen de asientos)`:''}`);
  logAccion('Cambió forma de pago masivamente',`${cambiados} ventas → ${nuevaFP}`);
  rerender();
}
async function eliminarVSel(){
  if(!VF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  const n=VF_SEL.size;
  if(!confirm(`¿Eliminar ${n} documento${n===1?'':'s'} de venta seleccionado${n===1?'':'s'}?\n\nEsta acción no se puede deshacer.`))return;
  // Filtrar el array (solo se pueden eliminar los que no vienen de un asiento)
  const antes=S.ventas.length;
  S.ventas=S.ventas.filter(d=>!VF_SEL.has(d.id));
  const borrados=antes-S.ventas.length;
  VF_SEL.clear();
  try{await window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas));}catch(e){}
  toast(`🗑 ${borrados} documento${borrados===1?'':'s'} eliminado${borrados===1?'':'s'}`);
  logAccion('Eliminó ventas masivamente',`${borrados} documentos`);
  rerender();
}

function renderVentas(){
  const selMes=document.getElementById('vf-mes');
  if(selMes&&selMes.options.length<=1)selMes.innerHTML=mesOpts(selMes.value);
  const selDteFlt=document.getElementById('vf-dte-flt');
  if(selDteFlt&&selDteFlt.options.length<=1)selDteFlt.innerHTML='<option value="">Todos los DTE</option>'+DTE_VENTAS.map(d=>`<option value="${d.cod}">${d.cod} — ${d.nm}</option>`).join('');

  const fDesde=(document.getElementById('vf-desde')?.value||'');
  const fHasta=(document.getElementById('vf-hasta')?.value||'');
  const fDte=+(document.getElementById('vf-dte-flt')?.value||0);
  const fQ=(document.getElementById('vf-search')?.value||'').toLowerCase().trim();
  const todos=todosDocsVentas();
  const docs=[...todos].sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.numero||'').localeCompare(b.numero||''));
  const folios=foliosMensuales(todos);
  const fDocs=docs.filter(d=>{
    if(fDesde&&d.fecha<fDesde)return false;
    if(fHasta&&d.fecha>fHasta)return false;
    if(fDte&&+d.tipoDTE!==fDte)return false;
    if(fQ){const t=(d.rutCodigo+' '+(d.razonSocial||'')+' '+(d.numero||'')).toLowerCase();if(!t.includes(fQ))return false;}
    return true;
  });

  const cntMan=todos.filter(d=>d.origen==='asiento').length;

  // Sin ningún filtro activo no cargamos las filas. El usuario debe aplicar un
  // filtro de búsqueda para ver documentos.
  const hayFiltroV=!!(fDesde||fHasta||fDte||fQ);
  const tb=document.getElementById('v-tbody');
  const tf=document.getElementById('v-tfoot');
  if(!hayFiltroV){
    document.getElementById('vf-count').textContent=`${todos.length} documentos en total`;
    tb.innerHTML=`<tr><td colspan="15" class="empty" style="padding:36px 20px">
      <div class="ei">🔎</div>
      Aplica un filtro para ver documentos<br>
      <span style="font-size:11px;color:var(--mt)">Elige un mes, un rango de fechas, un tipo de DTE, o busca por RUT / razón social / N°.${todos.length?` Hay <strong>${todos.length}</strong> documentos registrados.`:''}</span>
    </td></tr>`;
    if(tf)tf.innerHTML='';
    renderVResumen();
    return;
  }

  document.getElementById('vf-count').textContent=`${fDocs.length} de ${todos.length} documentos${cntMan?` (${cntMan} desde asientos)`:''}`;

  // Barra de acciones masivas (solo si hay seleccionados)
  const barraSel=document.getElementById('v-bulk-bar');
  if(barraSel){
    if(VF_SEL.size){
      barraSel.style.display='flex';
      barraSel.innerHTML=`<span style="font-weight:600;color:var(--ac)">${VF_SEL.size} seleccionado${VF_SEL.size===1?'':'s'}</span>
        <button class="btn btn-i" style="font-size:11px" onclick="cambiarFPVSel('clientes')" title="Marcar como venta a crédito (genera cuenta por cobrar en el auxiliar del cliente)">📇 A crédito (Cliente)</button>
        <button class="btn btn-i" style="font-size:11px" onclick="cambiarFPVSel('banco')" title="Marcar como venta al contado (cobrada, sin saldo en el auxiliar)">💵 A contado (Banco)</button>
        <button class="btn btn-d" style="font-size:11px" onclick="eliminarVSel()">🗑 Eliminar seleccionados</button>
        <button class="btn btn-g" style="font-size:11px" onclick="limpiarVSel()">✕ Limpiar selección</button>`;
    }else{
      barraSel.style.display='none';
      barraSel.innerHTML='';
    }
  }

  if(!fDocs.length){
    tb.innerHTML=`<tr><td colspan="15" class="empty"><div class="ei">🛒</div>No hay documentos con ese filtro</td></tr>`;
    document.getElementById('v-tfoot').innerHTML='';
  }else{
    let tN=0,tE=0,tI=0,tO=0,tT=0;
    tb.innerHTML=fDocs.map(d=>{
      const signo=(dteV(d.tipoDTE)?.signo)||1;
      tN+=(d.neto||0)*signo;tE+=(d.exento||0)*signo;tI+=(d.iva||0)*signo;tO+=(d.otrosImpuestos||0)*signo;tT+=(d.total||0)*signo;
      const dte=dteV(d.tipoDTE);
      const fpMap={banco:'💵 Banco',clientes:'📇 Cliente',deudores:'📋 Deudor'};
      const mesSl=(d.fecha||'').slice(5,7);
      const folioNum=folios[d.id]||'';
      const esManual=d.origen==='asiento';
      const rowStyle=esManual?' style="background:rgba(88,166,255,.04)"':'';
      const origenBadge=esManual?`<div style="font-size:9px;color:var(--info);margin-top:2px">✏ Asiento N°${d.asientoN}</div>`:'';
      const acciones=esManual
        ?`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="abrirAsientoDesde('${d.asientoId}')">📝 Abrir</button>`
        :`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarVenta('${d.id}')">✏️</button> <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="eliminarVenta('${d.id}')">🗑</button>`;
      // Los documentos originados por asientos no se pueden marcar
      // (habría que borrar el asiento, no el reflejo en el libro)
      const chk=esManual
        ?'<span style="color:var(--mt);font-size:10px" title="Viene de un asiento manual">—</span>'
        :`<input type="checkbox" class="v-chk" data-id="${d.id}" ${VF_SEL.has(d.id)?'checked':''} onchange="toggleVSel('${d.id}')">`;
      return `<tr${rowStyle}>
        <td style="text-align:center;width:26px">${chk}</td>
        <td class="tl"><span class="doc-folio">${mesSl}-${String(folioNum).padStart(3,'0')}</span></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}${origenBadge}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:${d.fechaVencimiento?'var(--tx)':'var(--mt)'}">${d.fechaVencimiento||'—'}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.tipoDTE}${dte?`<div style="font-size:9px;color:var(--mt);font-family:var(--sans);line-height:1.1;margin-top:1px">${dte.nm.slice(0,18)}</div>`:''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(d.rutCodigo,d.rutDV)}</td>
        <td class="tnm">${d.razonSocial||''}</td>
        <td>${fmt(d.neto)}</td>
        <td>${fmt(d.exento)}</td>
        <td>${fmt(d.iva)}</td>
        <td>${fmt(d.otrosImpuestos)}</td>
        <td style="font-weight:600">${fmt(d.total)}</td>
        <td class="tl" style="font-size:11px">${esManual?'—':(fpMap[d.formaPago]||d.formaPago||'')}</td>
        <td style="text-align:center">${acciones}</td>
      </tr>`;
    }).join('');
    document.getElementById('v-tfoot').innerHTML=`<tr><td class="tl" colspan="8">TOTALES</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td><td colspan="2"></td></tr>`;
  }
  renderVResumen();
}

function renderVResumen(){
  const el=document.getElementById('v-resumen');if(!el)return;
  if(!S.ventas.length){el.innerHTML='';return;}
  const porMes=Array.from({length:12},()=>({neto:0,exento:0,iva:0,otros:0,total:0,cant:0}));
  S.ventas.forEach(d=>{
    const m=+d.fecha.slice(5,7)-1;if(m<0||m>11)return;
    porMes[m].neto+=d.neto||0;porMes[m].exento+=d.exento||0;porMes[m].iva+=d.iva||0;porMes[m].otros+=d.otrosImpuestos||0;porMes[m].total+=d.total||0;porMes[m].cant++;
  });
  let tN=0,tE=0,tI=0,tO=0,tT=0,tC=0;
  let rows=porMes.map((p,i)=>{
    tN+=p.neto;tE+=p.exento;tI+=p.iva;tO+=p.otros;tT+=p.total;tC+=p.cant;
    if(!p.cant)return '';
    return `<tr><td class="tl">${MESES[i]}</td><td>${p.cant}</td><td>${fmt(p.neto)}</td><td>${fmt(p.exento)}</td><td>${fmt(p.iva)}</td><td>${fmt(p.otros)}</td><td style="font-weight:600">${fmt(p.total)}</td></tr>`;
  }).join('');
  if(!rows)rows=`<tr><td colspan="7" class="empty" style="padding:18px">Sin movimientos</td></tr>`;
  el.innerHTML=`<div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📅 Resumen Mensual</div><div class="tw"><table>
    <thead><tr><th class="tl">MES</th><th>N° DOCS</th><th>NETO</th><th>EXENTO</th><th>IVA</th><th>OTROS</th><th>TOTAL</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="tl">TOTAL ${S.empresa.anio}</td><td>${tC}</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td></tr></tfoot>
  </table></div></div>`;
}

// — Form Ventas —
function abrirVF(){
  VF={editId:null};
  const f=document.getElementById('vf-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('vf-title').textContent='Nuevo Documento de Venta';
  document.getElementById('vf-fecha').value=today();
  document.getElementById('vf-vence').value='';
  document.getElementById('vf-dte').innerHTML=dteVentasOpts('');
  ['vf-num','vf-rut','vf-rs','vf-neto','vf-exento','vf-iva','vf-otros','vf-total'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('vf-fp').value='banco';
  document.getElementById('vf-dv').textContent='';
  document.getElementById('vf-dup-warn').style.display='none';
  _vfCuentaSel='';
  const wrap=document.getElementById('vf-cuenta-wrap');
  if(wrap)wrap.innerHTML=inputCuenta({id:'vf-cuenta',value:'',onPick:"setVfCuenta('%CD%')",placeholder:'Cuenta de ingreso (opcional)…',filtro:'ingreso'});
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function editarVenta(id){
  const d=S.ventas.find(x=>x.id===id);if(!d)return;
  VF={editId:id};
  const f=document.getElementById('vf-form');f.style.display='block';f.classList.add('editing');
  document.getElementById('vf-title').textContent='Editando Documento — '+rutFmt(d.rutCodigo,d.rutDV);
  document.getElementById('vf-fecha').value=d.fecha;
  document.getElementById('vf-vence').value=d.fechaVencimiento||'';
  document.getElementById('vf-dte').innerHTML=dteVentasOpts(d.tipoDTE);
  document.getElementById('vf-num').value=d.numero||'';
  document.getElementById('vf-rut').value=(d.rutCodigo||'')+(d.rutDV||'');
  document.getElementById('vf-rs').value=d.razonSocial||'';
  document.getElementById('vf-neto').value=d.neto||'';
  document.getElementById('vf-exento').value=d.exento||'';
  document.getElementById('vf-iva').value=d.iva||'';
  document.getElementById('vf-otros').value=d.otrosImpuestos||'';
  document.getElementById('vf-total').value=d.total||'';
  document.getElementById('vf-fp').value=d.formaPago||'banco';
  document.getElementById('vf-dup-warn').style.display='none';
  _vfCuentaSel=d.cuentaIngreso||'';
  const wrap=document.getElementById('vf-cuenta-wrap');
  if(wrap)wrap.innerHTML=inputCuenta({id:'vf-cuenta',value:d.cuentaIngreso||'',onPick:"setVfCuenta('%CD%')",placeholder:'Cuenta de ingreso (opcional)…',filtro:'ingreso'});
  vfRutInput(document.getElementById('vf-rut').value);
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
let _vfCuentaSel='';
function setVfCuenta(cd){_vfCuentaSel=cd;}
function cerrarVF(){document.getElementById('vf-form').style.display='none';VF={editId:null};}

function vfRutInput(val){
  const r=rutParse(val);
  const el=document.getElementById('vf-dv');
  if(!r.raw){el.textContent='';el.className='rut-dv';return;}
  if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv ok';
    const prev=S.ventas.find(v=>v.rutCodigo===r.codigo&&v.razonSocial);
    const rs=document.getElementById('vf-rs');
    if(prev&&!rs.value)rs.value=prev.razonSocial;
  }else if(r.codigo){el.textContent='✗ DV ≠ '+rutDV(r.codigo);el.className='rut-dv bad';}
  else{el.textContent='…';el.className='rut-dv';}
}

// Detección de duplicado en vivo (mientras el usuario escribe)
function vfCheckDup(){
  const warn=document.getElementById('vf-dup-warn');if(!warn)return;
  const tipoDTE=+document.getElementById('vf-dte').value;
  const numero=document.getElementById('vf-num').value.trim();
  const r=rutParse(document.getElementById('vf-rut').value);
  if(!tipoDTE||!numero||!r.codigo){warn.style.display='none';return;}
  const dup=S.ventas.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==VF.editId);
  if(dup){
    const folios=foliosMensuales(S.ventas);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    warn.className='doc-dup-warn';warn.style.display='';
    warn.innerHTML=`⚠️ <span>DOCUMENTO DUPLICADO</span><span style="font-weight:400;margin-left:auto;font-size:11px">Ya existe: Folio ${mesSl}-${String(f).padStart(3,'0')} · ${dup.fecha} · ${rutFmt(dup.rutCodigo,dup.rutDV)} · DTE ${dup.tipoDTE} N°${dup.numero} · ${fmtC(dup.total)}</span>`;
  }else{warn.style.display='none';}
}

function vfCalcTotals(changed){
  const neto=pn(document.getElementById('vf-neto').value);
  const exento=pn(document.getElementById('vf-exento').value);
  const otros=pn(document.getElementById('vf-otros').value);
  const ivaEl=document.getElementById('vf-iva'),totEl=document.getElementById('vf-total');
  const dte=dteV(document.getElementById('vf-dte').value);
  const afecto=dte?dte.afecto:true;
  if(changed==='neto'||changed==='exento'||changed==='otros'){
    const iva=afecto?Math.round(neto*IVA):0;
    ivaEl.value=iva||'';
    totEl.value=neto+exento+iva+otros;
  }else if(changed==='total'){
    const total=pn(totEl.value);
    if(afecto&&total>0&&!exento&&!otros){
      const n=Math.round(total/(1+IVA)),iv=total-n;
      document.getElementById('vf-neto').value=n;ivaEl.value=iv;
    }
  }else if(changed==='iva'){
    const iva=pn(ivaEl.value);
    totEl.value=neto+exento+iva+otros;
  }
}
function vfAutoCalc(){vfCalcTotals('neto');}

function guardarVenta(){
  const fecha=document.getElementById('vf-fecha').value;
  const fechaVencimiento=document.getElementById('vf-vence').value||'';
  const tipoDTE=+document.getElementById('vf-dte').value;
  const numero=document.getElementById('vf-num').value.trim();
  const rutInput=document.getElementById('vf-rut').value;
  const razonSocial=document.getElementById('vf-rs').value.trim();
  const neto=pn(document.getElementById('vf-neto').value);
  const exento=pn(document.getElementById('vf-exento').value);
  const iva=pn(document.getElementById('vf-iva').value);
  const otrosImpuestos=pn(document.getElementById('vf-otros').value);
  const total=pn(document.getElementById('vf-total').value);
  const formaPago=document.getElementById('vf-fp').value;

  if(!fecha){toast('⚠️ Ingresa la fecha de emisión','e');return;}
  if(fechaVencimiento&&fechaVencimiento<fecha){toast('⚠️ La fecha de vencimiento no puede ser anterior a la emisión','e');return;}
  if(!tipoDTE){toast('⚠️ Selecciona el tipo de documento','e');return;}
  if(!numero){toast('⚠️ Ingresa el N° de documento','e');return;}
  const r=rutParse(rutInput);
  if(!r.codigo){toast('⚠️ Ingresa el RUT del cliente','e');return;}
  if(!r.valido){toast('⚠️ RUT inválido — dígito verificador no coincide','e');return;}
  if(!razonSocial){toast('⚠️ Ingresa la razón social','e');return;}
  if(total<=0){toast('⚠️ El total debe ser mayor a cero','e');return;}
  if(Math.abs((neto+exento+iva+otrosImpuestos)-total)>1){toast('⚠️ Neto + Exento + IVA + Otros no coincide con el Total','e');return;}

  const dup=S.ventas.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==VF.editId);
  if(dup){
    const folios=foliosMensuales(S.ventas);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    toast(`⚠️ Documento duplicado — ya existe Folio ${mesSl}-${String(f).padStart(3,'0')} (${dup.fecha}, ${fmtC(dup.total)})`,'e');
    return;
  }

  const cuentaIngreso=_vfCuentaSel||(document.getElementById('vf-cuenta')?.dataset.cd)||'';
  const doc={id:VF.editId||'v_'+Date.now(),fecha,fechaVencimiento,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,neto,exento,iva,otrosImpuestos,total,formaPago,cuentaIngreso};
  if(VF.editId){const i=S.ventas.findIndex(x=>x.id===VF.editId);if(i>=0)S.ventas[i]=doc;toast('✅ Documento actualizado');logAccion('Editó venta',`DTE ${doc.tipoDTE} N°${doc.numero} · ${fmtC(doc.total)}`);}
  else{S.ventas.push(doc);toast('✅ Documento registrado');logAccion('Registró venta',`DTE ${doc.tipoDTE} N°${doc.numero} · ${doc.razonSocial} · ${fmtC(doc.total)}`);}
  window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas)).catch(()=>{});
  cerrarVF();rerender();
}

function eliminarVenta(id){
  const d=S.ventas.find(x=>x.id===id);if(!d)return;
  if(!confirm(`¿Eliminar documento ${d.tipoDTE} N°${d.numero} de ${d.razonSocial}?\nTotal: ${fmtC(d.total)}`))return;
  S.ventas=S.ventas.filter(x=>x.id!==id);
  window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas)).catch(()=>{});
  rerender();toast('🗑 Documento eliminado');
}




function initImportListenerV(){
  const input=document.getElementById('imp-ventas-file');
  if(input&&!input._bound){input._bound=true;input.addEventListener('change',handleFileImportVentas);}
}

// ═══ IMPORTACIÓN DESDE SII (Registro de Ventas) ═══

function abrirImportSIIVentas(){
  const input=document.getElementById('imp-ventas-file');
  input.value='';
  input.click();
}

async function handleFileImportVentas(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const res=await leerArchivo(file,'venta');
    mostrarVentasImportadas(res,file.name);
  }catch(err){
    toast('❌ '+err.message,'e');
  }
}

function mostrarVentasImportadas(res,nombreArchivo){
  if(!res.docs.length){
    toast('⚠️ No se detectaron documentos válidos en el archivo','e');
    return;
  }
  // Periodo más frecuente
  const conteo={};
  res.docs.forEach(d=>{const mY=d.fecha.slice(0,7);conteo[mY]=(conteo[mY]||0)+1;});
  const [periodoTop]=Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
  const [anioTop,mesTop]=periodoTop.split('-');

  // Duplicados: comparación como string para tolerar tipos mixtos.
  const todos=todosDocsVentas();
  res.docs.forEach(d=>{
    const dup=todos.find(x=>
      x.rutCodigo===d.rutCodigo &&
      +x.tipoDTE===+d.tipoDTE &&
      String(x.numero).trim()===String(d.numero).trim()
    );
    d.dup=dup||null;
    d.incluir=!dup;
    const ficha=fichaAux('cliente',d.rutCodigo);
    d.cuenta=ficha?.cuentaDefault||'';
    d.fp='banco';
  });

  // Mutar IMV in-place (NO reasignar): window.IMV apunta a este mismo objeto y
  // los onPick de los buscadores de cuenta escriben vía window.IMV. Si se
  // reasignara, esas escrituras irían al objeto viejo y la cuenta no se
  // guardaría (bug: "documentos sin cuenta" pese a asignarla).
  IMV.docs=res.docs;
  IMV.descartados=res.descartados||0;
  IMV.archivo=nombreArchivo;
  IMV.periodoMes=+mesTop;
  IMV.periodoAnio=+anioTop;
  abrirImportModalVentas();
}

function abrirImportModalVentas(){
  const selMes=document.getElementById('impv-periodo-mes');
  selMes.innerHTML=MESES.map((m,i)=>`<option value="${i+1}" ${i+1===IMV.periodoMes?'selected':''}>${m}</option>`).join('');
  const selAnio=document.getElementById('impv-periodo-anio');
  const cy=new Date().getFullYear();
  const anios=new Set();
  for(let y=cy-3;y<=cy+1;y++)anios.add(y);
  anios.add(IMV.periodoAnio);
  selAnio.innerHTML=[...anios].sort().map(y=>`<option value="${y}" ${y===IMV.periodoAnio?'selected':''}>${y}</option>`).join('');

  // Bulk: usa buscador dinámico
  const bulkWrap=document.getElementById('impv-bulk-wrap');
  if(bulkWrap){
    bulkWrap.innerHTML=inputCuenta({id:'impv-bulk-cd',value:'',
      onPick:"setBulkCuentaImpV('%CD%')",
      placeholder:'Buscar cuenta de ingreso por código o nombre…',
      clase:'linea-inp',filtro:'ingreso'});
  }

  renderImportModalVentas();
  document.getElementById('impv-modal').classList.add('open');
}

function cerrarImportModalVentas(){
  document.getElementById('impv-modal').classList.remove('open');
}

function cambiarPeriodoImportV(){
  IMV.periodoMes=+document.getElementById('impv-periodo-mes').value;
  IMV.periodoAnio=+document.getElementById('impv-periodo-anio').value;
  renderImportModalVentas();
}

function toggleAllImportV(v){
  IMV.docs.forEach(d=>{if(!d.dup)d.incluir=v;});
  renderImportModalVentas();
}

// Guarda temporalmente la cuenta elegida en el buscador bulk
let _bulkCuentaImpV='';
function setBulkCuentaImpV(cd){_bulkCuentaImpV=cd;}

function aplicarCuentaATodosV(){
  const bulkInp=document.getElementById('impv-bulk-cd');
  const cd=_bulkCuentaImpV||(bulkInp?bulkInp.dataset.cd:'')||
    (document.getElementById('impv-bulk')&&document.getElementById('impv-bulk').value)||'';
  if(!cd){toast('⚠️ Elige una cuenta primero','e');return;}
  IMV.docs.forEach(d=>{if(d.incluir)d.cuenta=cd;});
  renderImportModalVentas();
}

function renderImportModalVentas(){
  const forzar=document.getElementById('impv-forzar-periodo').checked;
  const box=document.getElementById('impv-rows');


  const filas=IMV.docs.map((d,i)=>{
    const fechaMostrar=forzar
      ? `${IMV.periodoAnio}-${String(IMV.periodoMes).padStart(2,'0')}-${d.fechaOriginal?d.fechaOriginal.slice(8,10):String(d.fecha).slice(8,10)}`
      : d.fecha;
    const estado=d.dup
      ? '<span style="color:var(--warn);font-size:10px">⚠️ duplicado</span>'
      : (d.incluir?'<span style="color:var(--ach);font-size:10px">✓ nuevo</span>':'<span style="color:var(--mt);font-size:10px">omitido</span>');
    // Por defecto todas las ventas van al auxiliar de clientes (cuenta por
    // cobrar). El usuario cambia a "Banco" las que sean realmente al contado.
    if(!d.fp)d.fp='clientes';
    const fpSel=`<select onchange="IMV.docs[${i}].fp=this.value" style="width:100%;font-size:11px;padding:3px">
      <option value="banco" ${d.fp==='banco'?'selected':''}>💵 Banco</option>
      <option value="clientes" ${d.fp==='clientes'?'selected':''}>📇 Cliente</option>
      <option value="deudores" ${d.fp==='deudores'?'selected':''}>📋 Deudor</option>
    </select>`;
    return `<div class="imp-row" style="display:grid;grid-template-columns:26px 90px 60px 80px 120px 1fr 90px 80px 80px 100px 180px 110px 80px;gap:6px;padding:6px 8px;border-bottom:1px solid var(--bd);font-size:11px;align-items:center">
      <div style="text-align:center">${d.dup?'':`<input type="checkbox" ${d.incluir?'checked':''} onchange="IMV.docs[${i}].incluir=this.checked;renderImportModalVentas()">`}</div>
      <div>${fechaMostrar}</div>
      <div>${d.tipoDTE}</div>
      <div>${d.numero}</div>
      <div>${rutFmt(d.rutCodigo,d.rutDV)}</div>
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="${(d.razonSocial||'').replace(/"/g,'&quot;')}" onclick="toast('${(d.razonSocial||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;')}')">${d.razonSocial}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.neto)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.iva)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.otrosImpuestos||0)}</div>
      <div style="text-align:right;font-family:var(--mono);font-weight:600">${fmtC(d.total)}</div>
      <div>${inputCuenta({id:`impv-cd-${i}`,value:d.cuenta||'',onPick:`IMV.docs[${i}].cuenta='%CD%';renderImportModalVentas()`,placeholder:'Buscar cuenta…',clase:'linea-inp',filtro:'ingreso'})}</div>
      <div>${fpSel}</div>
      <div>${estado}</div>
    </div>`;
  }).join('');

  box.innerHTML=filas;

  const nuevos=IMV.docs.filter(d=>!d.dup).length;
  const incluidos=IMV.docs.filter(d=>d.incluir).length;
  const conCuenta=IMV.docs.filter(d=>d.incluir&&d.cuenta).length;

  const summary=document.getElementById('impv-summary');
  if(summary){
    summary.innerHTML=`📄 <strong>${IMV.docs.length}</strong> documentos detectados en <em>${IMV.archivo||''}</em> · <strong>${nuevos}</strong> nuevos · <strong>${IMV.docs.length-nuevos}</strong> duplicados${IMV.descartados?' · '+IMV.descartados+' descartados':''}`;
  }
  const info=document.getElementById('impv-periodo-info');
  if(info)info.textContent=`${incluidos} para importar · ${conCuenta} con cuenta asignada`;
  const cnt=document.getElementById('impv-count');
  if(cnt)cnt.textContent=`${incluidos} seleccionados`;
}

function confirmarImportacionV(){
  const incluidos=IMV.docs.filter(d=>d.incluir);
  if(!incluidos.length){toast('⚠️ No hay documentos seleccionados','e');return;}
  const sinCuenta=incluidos.filter(d=>!d.cuenta);
  if(sinCuenta.length){
    if(!confirm(`⚠️ Hay ${sinCuenta.length} documentos sin cuenta de ingreso asignada.\n\nSe importarán igual pero deberás asignarles cuenta después. ¿Continuar?`))return;
  }

  const forzar=document.getElementById('impv-forzar-periodo').checked;
  const anio=IMV.periodoAnio, mes=String(IMV.periodoMes).padStart(2,'0');

  // Detectar clientes nuevos
  const rutsExistentes=new Set(todosDocsVentas().map(v=>v.rutCodigo));
  const clientesNuevos=new Map();
  incluidos.forEach(d=>{
    if(!rutsExistentes.has(d.rutCodigo)&&!clientesNuevos.has(d.rutCodigo)){
      clientesNuevos.set(d.rutCodigo,{rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial});
    }
  });

  // Aviso si el año del archivo no coincide con el año activo:
  // S.ventas es el libro del año activo; guardar en otro año no se vería.
  if(anio!==S.empresa.anio){
    if(!confirm(`El archivo es de ${anio} pero el año activo es ${S.empresa.anio}.\n\nSi importas ahora, los documentos irán al libro de ${S.empresa.anio}. Para importarlos en ${anio}, cambia primero de año con el selector del encabezado.\n\n¿Continuar de todas formas?`))return;
  }

  // S.ventas es un array plano (el año lo define storage). Reproducimos el
  // patrón de guardarVenta() individual: push al array y persistir.
  if(!Array.isArray(S.ventas))S.ventas=[];

  let importados=0;
  // Reservar rango de folios de comprobante para las ventas.
  let folioNext=proxFolioComprobante();
  incluidos.forEach((d,i)=>{
    let fecha=d.fecha;
    if(forzar){
      const dia=String(d.fecha).slice(8,10)||'01';
      fecha=`${anio}-${mes}-${dia}`;
    }
    S.ventas.push({
      id:'v_imp_'+Date.now()+'_'+i,
      folioComp:folioNext++,   // correlativo único de comprobante contable
      fecha, tipoDTE:d.tipoDTE, numero:d.numero,
      fechaVencimiento:'',
      rutCodigo:d.rutCodigo, rutDV:d.rutDV, razonSocial:d.razonSocial,
      neto:d.neto, exento:d.exento, iva:d.iva,
      otrosImpuestos:d.otrosImpuestos||0, total:d.total,
      formaPago:d.fp||'banco',
      cuentaIngreso:d.cuenta||'',
    });
    importados++;
  });

  window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas)).catch(()=>toast('❌ Error guardando en storage','e'));

  // Crear/completar la ficha del cliente para TODOS los documentos importados,
  // tenga o no cuenta de ingreso asignada. Si el cliente no existe, se crea la
  // ficha con los datos básicos (RUT, razón social) para editarla luego; si el
  // documento trae cuenta, se guarda como cuenta por defecto.
  const asignaciones={};  // rut → {cuenta:{cd→count}, dv, razon}
  incluidos.forEach(d=>{
    const key=d.rutCodigo;
    if(!key)return;
    if(!asignaciones[key])asignaciones[key]={cuenta:{},rutDV:d.rutDV,razonSocial:d.razonSocial};
    if(d.cuenta)asignaciones[key].cuenta[d.cuenta]=(asignaciones[key].cuenta[d.cuenta]||0)+1;
    // conservar la razón social si aún no la teníamos
    if(!asignaciones[key].razonSocial&&d.razonSocial)asignaciones[key].razonSocial=d.razonSocial;
  });
  let fichasCreadas=0, fichasActualizadas=0;
  const clientesF=fichasAux('cliente');
  Object.entries(asignaciones).forEach(([rut,a])=>{
    const cuentaTop=Object.entries(a.cuenta).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ficha=clientesF[rut];
    if(!ficha){
      clientesF[rut]={
        rutCodigo:rut, rutDV:a.rutDV, razonSocial:a.razonSocial||'',
        cuentaDefault:cuentaTop, ccDefault:'',
        giro:'', direccion:'', comuna:'', ciudad:'', email:'', telefono:'', notas:'',
      };
      fichasCreadas++;
    }else{
      let cambio=false;
      if(!ficha.cuentaDefault&&cuentaTop){ficha.cuentaDefault=cuentaTop;cambio=true;}
      if(!ficha.razonSocial&&a.razonSocial){ficha.razonSocial=a.razonSocial;cambio=true;}
      if(!ficha.rutDV&&a.rutDV){ficha.rutDV=a.rutDV;cambio=true;}
      if(cambio)fichasActualizadas++;
    }
  });
  if(fichasCreadas||fichasActualizadas){
    guardarFichasAux().catch(()=>{});
  }

  cerrarImportModalVentas();
  const msgClientes=clientesNuevos.size?` · ${clientesNuevos.size} clientes nuevos detectados en auxiliares`:'';
  const msgFichas=(fichasCreadas||fichasActualizadas)?` · fichas: ${fichasCreadas} nuevas${fichasActualizadas?', '+fichasActualizadas+' completadas':''}`:'';
  toast(`✅ ${importados} ventas importadas${msgClientes}${msgFichas}`);
  logAccion('Importó ventas SII',`${importados} documentos${msgFichas}`);
  rerender();
}


export {onMesChangeV, abrirImportSIIVentas, handleFileImportVentas,
        cambiarPeriodoImportV, toggleAllImportV, aplicarCuentaATodosV, setBulkCuentaImpV,
        renderImportModalVentas, confirmarImportacionV, cerrarImportModalVentas, initImportListenerV,
        IMV, limpiarFiltrosV, renderVentas, renderVResumen, abrirVF, editarVenta, cerrarVF, vfRutInput, vfCheckDup, vfCalcTotals, vfAutoCalc, guardarVenta, setVfCuenta, eliminarVenta,
        toggleVSel, toggleVSelAll, limpiarVSel, eliminarVSel, cambiarFPVSel, VF};
