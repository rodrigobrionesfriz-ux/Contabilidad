// ventas.js — Libro de ventas (documentos individuales)
import {toast, pn, today, MESES, IVA, DTE_VENTAS, dteV, rutParse, rutFmt, rutDV, fmt, fmtC} from './core.js';
import {rerender} from './ui.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {mesRango, mesOpts, dteVentasOpts, foliosMensuales} from './helpers.js';
import {todosDocsVentas, abrirAsientoDesde} from './asientos.js';
import './storage.js';

// Estado del formulario de ventas (interno del módulo)
let VF={editId:null};

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
  document.getElementById('vf-count').textContent=`${fDocs.length} de ${todos.length} documentos${cntMan?` (${cntMan} desde asientos)`:''}`;

  const tb=document.getElementById('v-tbody');
  if(!fDocs.length){
    tb.innerHTML=`<tr><td colspan="14" class="empty"><div class="ei">🛒</div>${todos.length?'No hay documentos con ese filtro':'No hay documentos de venta. Usa <strong>+ Nuevo Documento</strong> para agregar el primero.'}</td></tr>`;
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
      return `<tr${rowStyle}>
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
    document.getElementById('v-tfoot').innerHTML=`<tr><td class="tl" colspan="7">TOTALES</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td><td colspan="2"></td></tr>`;
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
  vfRutInput(document.getElementById('vf-rut').value);
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
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

  const doc={id:VF.editId||'v_'+Date.now(),fecha,fechaVencimiento,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,neto,exento,iva,otrosImpuestos,total,formaPago};
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


export {onMesChangeV, limpiarFiltrosV, renderVentas, renderVResumen, abrirVF, editarVenta, cerrarVF, vfRutInput, vfCheckDup, vfCalcTotals, vfAutoCalc, guardarVenta, eliminarVenta, VF};
