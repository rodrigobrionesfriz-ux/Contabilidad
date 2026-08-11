// compras.js — Libro de compras + importador SII
import {toast, fmt, pn, today, MESES, IVA, DTE_COMPRAS, dteC, rutParse, rutFmt, rutDV, pdcNm, CCOLS, CUENTAS_GASTO, CUENTAS_COMPRA, fmtC} from './core.js';
import {rerender} from './ui.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {mesOpts, mesRango} from './helpers.js';
import {todosDocsCompras, abrirAsientoDesde, proxFolioComprobante} from './asientos.js';
import {ccOpts} from './centroscosto.js';
import {inputCuenta} from './buscadorcuentas.js';
import {leerArchivo} from './importadorsii.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import './storage.js';

// Estado del formulario de compras (interno del módulo)
let CF={editId:null,dist:[]};

// ═══ CORRELATIVO MENSUAL PERSISTENTE ═══
// Cada documento de compra lleva un `corrMes` fijo: el correlativo que se le
// asignó al guardarlo. Reinicia en 1 cada mes y NO se recalcula al editar o
// eliminar otros documentos (a diferencia del folio dinámico por fecha).

// Devuelve el próximo correlativo libre para el mes de `fecha` (YYYY-MM-DD),
// mirando el máximo corrMes ya asignado en ese mes. Excluye un id opcional.
function proxCorrMesCompra(fecha,excluirId=null){
  const m=(fecha||'').slice(0,7);
  if(!m)return 1;
  let max=0;
  S.compras.forEach(d=>{
    if(d.id===excluirId)return;
    if((d.fecha||'').slice(0,7)!==m)return;
    if(typeof d.corrMes==='number'&&d.corrMes>max)max=d.corrMes;
  });
  return max+1;
}

// Asigna corrMes a los documentos que aún no lo tienen, respetando los ya
// asignados. Ordena por fecha y N° para dar números estables a los antiguos.
// Retorna true si hubo cambios (para persistir).
function migrarCorrelativosCompras(){
  const porMes={};
  S.compras.forEach(d=>{
    const m=(d.fecha||'').slice(0,7);if(!m)return;
    (porMes[m]||(porMes[m]=[])).push(d);
  });
  let cambios=false;
  Object.keys(porMes).forEach(m=>{
    const arr=porMes[m];
    // Correlativo máximo ya usado en el mes
    let max=arr.reduce((mx,d)=>typeof d.corrMes==='number'&&d.corrMes>mx?d.corrMes:mx,0);
    // Los que no tienen corrMes se ordenan por fecha+número y toman los siguientes
    arr.filter(d=>typeof d.corrMes!=='number')
      .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(a.numero||'').localeCompare(b.numero||''))
      .forEach(d=>{d.corrMes=++max;cambios=true;});
  });
  return cambios;
}


function onMesChangeC(){
  const m=+(document.getElementById('cf-mes')?.value||0);
  if(m){const r=mesRango(m);document.getElementById('cf-desde').value=r.desde;document.getElementById('cf-hasta').value=r.hasta;}
  else{document.getElementById('cf-desde').value='';document.getElementById('cf-hasta').value='';}
  renderCompras();
}

function limpiarFiltrosC(){
  ['cf-mes','cf-desde','cf-hasta','cf-dte-flt','cf-search'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderCompras();
}

// ═══ COMPRAS — Documentos individuales ═══
function dteComprasOpts(sel=''){
  return '<option value="">— Seleccionar —</option>'+DTE_COMPRAS.map(d=>`<option value="${d.cod}" ${+sel===d.cod?'selected':''}>${d.cod} — ${d.nm}</option>`).join('');
}
function cuentasGastoOpts(sel=''){
  // Ahora incluye gastos + activos (para compras que son inversión, no gasto)
  return '<option value="">— cuenta de gasto o activo —</option>'+CUENTAS_COMPRA.map(c=>`<option value="${c.cd}" ${c.cd===sel?'selected':''}>${c.cd} — ${c.nm} ${c.tp==='A'?'(activo)':''}</option>`).join('');
}

// Estado de selección para acciones masivas
let CF_SEL=new Set();

function toggleCSel(id){
  if(CF_SEL.has(id))CF_SEL.delete(id);else CF_SEL.add(id);
  renderCompras();
}
function toggleCSelAll(marcados){
  const box=document.getElementById('c-tbody');
  if(!box)return;
  box.querySelectorAll('input.c-chk[data-id]').forEach(chk=>{
    const id=chk.dataset.id;
    if(marcados)CF_SEL.add(id);else CF_SEL.delete(id);
  });
  renderCompras();
}
function limpiarCSel(){CF_SEL.clear();renderCompras();}
async function eliminarCSel(){
  if(!CF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  const n=CF_SEL.size;
  if(!confirm(`¿Eliminar ${n} documento${n===1?'':'s'} de compra seleccionado${n===1?'':'s'}?\n\nEsta acción no se puede deshacer.`))return;
  const antes=S.compras.length;
  S.compras=S.compras.filter(d=>!CF_SEL.has(d.id));
  const borrados=antes-S.compras.length;
  CF_SEL.clear();
  try{await window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras));}catch(e){}
  toast(`🗑 ${borrados} documento${borrados===1?'':'s'} eliminado${borrados===1?'':'s'}`);
  logAccion('Eliminó compras masivamente',`${borrados} documentos`);
  rerender();
}

function renderCompras(){
  // Asegurar que todos los documentos del libro tengan correlativo mensual fijo
  if(migrarCorrelativosCompras())
    window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).catch(()=>{});

  const selMes=document.getElementById('cf-mes');
  if(selMes&&selMes.options.length<=1)selMes.innerHTML=mesOpts(selMes.value);
  const selDteFlt=document.getElementById('cf-dte-flt');
  if(selDteFlt&&selDteFlt.options.length<=1)selDteFlt.innerHTML='<option value="">Todos los DTE</option>'+DTE_COMPRAS.map(d=>`<option value="${d.cod}">${d.cod} — ${d.nm}</option>`).join('');

  const fDesde=(document.getElementById('cf-desde')?.value||'');
  const fHasta=(document.getElementById('cf-hasta')?.value||'');
  const fDte=+(document.getElementById('cf-dte-flt')?.value||0);
  const fQ=(document.getElementById('cf-search')?.value||'').toLowerCase().trim();
  const todos=todosDocsCompras();
  const docs=[...todos].sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.numero||'').localeCompare(b.numero||''));
  // Correlativo mensual: los del libro traen su corrMes fijo; los que vienen de
  // asientos manuales continúan la secuencia del mes (máximo del libro + N).
  const corr={};
  const maxMes={};
  todos.forEach(d=>{if(d.origen==='libro'&&typeof d.corrMes==='number'){corr[d.id]=d.corrMes;const m=(d.fecha||'').slice(0,7);if(!maxMes[m]||d.corrMes>maxMes[m])maxMes[m]=d.corrMes;}});
  [...todos].filter(d=>d.origen!=='libro')
    .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(a.numero||'').localeCompare(b.numero||''))
    .forEach(d=>{const m=(d.fecha||'').slice(0,7);maxMes[m]=(maxMes[m]||0)+1;corr[d.id]=maxMes[m];});
  const fDocs=docs.filter(d=>{
    if(fDesde&&d.fecha<fDesde)return false;
    if(fHasta&&d.fecha>fHasta)return false;
    if(fDte&&+d.tipoDTE!==fDte)return false;
    if(fQ){const t=(d.rutCodigo+' '+(d.razonSocial||'')+' '+(d.numero||'')).toLowerCase();if(!t.includes(fQ))return false;}
    return true;
  });

  const cntMan=todos.filter(d=>d.origen==='asiento').length;

  // Sin ningún filtro activo no cargamos las filas (pueden ser cientos). El
  // usuario debe aplicar un filtro de búsqueda para ver documentos.
  const hayFiltroC=!!(fDesde||fHasta||fDte||fQ);
  const tb=document.getElementById('c-tbody');
  const tf=document.getElementById('c-tfoot');
  if(!hayFiltroC){
    document.getElementById('cf-count').textContent=`${todos.length} documentos en total`;
    tb.innerHTML=`<tr><td colspan="14" class="empty" style="padding:36px 20px">
      <div class="ei">🔎</div>
      Aplica un filtro para ver documentos<br>
      <span style="font-size:11px;color:var(--mt)">Elige un mes, un rango de fechas, un tipo de DTE, o busca por RUT / razón social / N°.${todos.length?` Hay <strong>${todos.length}</strong> documentos registrados.`:''}</span>
    </td></tr>`;
    if(tf)tf.innerHTML='';
    // Igual refrescamos el resumen inferior (usa todos los docs)
    renderCResumen();
    return;
  }

  document.getElementById('cf-count').textContent=`${fDocs.length} de ${todos.length} documentos${cntMan?` (${cntMan} desde asientos)`:''}`;

  // Barra de acciones masivas
  const barraSel=document.getElementById('c-bulk-bar');
  if(barraSel){
    if(CF_SEL.size){
      barraSel.style.display='flex';
      barraSel.innerHTML=`<span style="font-weight:600;color:var(--ac)">${CF_SEL.size} seleccionado${CF_SEL.size===1?'':'s'}</span>
        <button class="btn btn-d" style="font-size:11px" onclick="eliminarCSel()">🗑 Eliminar seleccionados</button>
        <button class="btn btn-g" style="font-size:11px" onclick="limpiarCSel()">✕ Limpiar selección</button>`;
    }else{
      barraSel.style.display='none';
      barraSel.innerHTML='';
    }
  }

  if(!fDocs.length){
    tb.innerHTML=`<tr><td colspan="14" class="empty"><div class="ei">🧾</div>No hay documentos con ese filtro</td></tr>`;
    document.getElementById('c-tfoot').innerHTML='';
  }else{
    let tN=0,tE=0,tI=0,tO=0,tT=0;
    tb.innerHTML=fDocs.map(d=>{
      const signo=(dteC(d.tipoDTE)?.signo)||1;
      tN+=(d.neto||0)*signo;tE+=(d.exento||0)*signo;tI+=(d.iva||0)*signo;tO+=(d.otrosImpuestos||0)*signo;tT+=(d.total||0)*signo;
      const dte=dteC(d.tipoDTE);
      const mesSl=(d.fecha||'').slice(5,7);
      const folioNum=corr[d.id]||'';
      const esManual=d.origen==='asiento';
      const rowStyle=esManual?' style="background:rgba(88,166,255,.04)"':'';
      const origenBadge=esManual?`<div style="font-size:9px;color:var(--info);margin-top:2px">✏ Asiento N°${d.asientoN}</div>`:'';
      const distTxt=d.dist&&d.dist.length>1?`📊 ${d.dist.length} categorías`:(d.dist&&d.dist[0]?pdcNm(d.dist[0].cuenta):'');
      const acciones=esManual
        ?`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="abrirAsientoDesde('${d.asientoId}')">📝 Abrir</button>`
        :`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarCompra('${d.id}')">✏️</button> <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="eliminarCompra('${d.id}')">🗑</button>`;
      const chk=esManual
        ?'<span style="color:var(--mt);font-size:10px" title="Viene de un asiento manual">—</span>'
        :`<input type="checkbox" class="c-chk" data-id="${d.id}" ${CF_SEL.has(d.id)?'checked':''} onchange="toggleCSel('${d.id}')">`;
      return `<tr${rowStyle}>
        <td style="text-align:center;width:26px">${chk}</td>
        <td class="tl"><span class="doc-folio">${String(folioNum).padStart(3,'0')}</span></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}${origenBadge}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:${d.fechaVencimiento?'var(--tx)':'var(--mt)'}">${d.fechaVencimiento||'—'}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.tipoDTE}${dte?`<div style="font-size:9px;color:var(--mt);font-family:var(--sans);line-height:1.1;margin-top:1px">${dte.nm.slice(0,18)}</div>`:''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(d.rutCodigo,d.rutDV)}</td>
        <td class="tnm">${d.razonSocial||''}${distTxt?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${distTxt}</div>`:''}</td>
        <td>${fmt(d.neto)}</td>
        <td>${fmt(d.exento)}</td>
        <td>${fmt(d.iva)}</td>
        <td>${fmt(d.otrosImpuestos)}</td>
        <td style="font-weight:600">${fmt(d.total)}</td>
        <td style="text-align:center">${acciones}</td>
      </tr>`;
    }).join('');
    document.getElementById('c-tfoot').innerHTML=`<tr><td class="tl" colspan="8">TOTALES</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td><td></td></tr>`;
  }
  renderCResumen();
}

function renderCResumen(){
  const el=document.getElementById('c-resumen');if(!el)return;
  if(!S.compras.length){el.innerHTML='';return;}
  const porMes=Array.from({length:12},()=>({neto:0,exento:0,iva:0,otros:0,total:0,cant:0}));
  S.compras.forEach(d=>{
    const m=+d.fecha.slice(5,7)-1;if(m<0||m>11)return;
    porMes[m].neto+=d.neto||0;porMes[m].exento+=d.exento||0;porMes[m].iva+=d.iva||0;porMes[m].otros+=d.otrosImpuestos||0;porMes[m].total+=d.total||0;porMes[m].cant++;
  });
  const porCta={};
  S.compras.forEach(d=>{(d.dist||[]).forEach(l=>{if(!porCta[l.cuenta])porCta[l.cuenta]={nm:pdcNm(l.cuenta),monto:0};porCta[l.cuenta].monto+=l.monto||0;});});

  let tN=0,tE=0,tI=0,tO=0,tT=0,tC=0;
  let rowsM=porMes.map((p,i)=>{
    tN+=p.neto;tE+=p.exento;tI+=p.iva;tO+=p.otros;tT+=p.total;tC+=p.cant;
    if(!p.cant)return '';
    return `<tr><td class="tl">${MESES[i]}</td><td>${p.cant}</td><td>${fmt(p.neto)}</td><td>${fmt(p.exento)}</td><td>${fmt(p.iva)}</td><td>${fmt(p.otros)}</td><td style="font-weight:600">${fmt(p.total)}</td></tr>`;
  }).join('');
  if(!rowsM)rowsM=`<tr><td colspan="7" class="empty" style="padding:18px">Sin movimientos</td></tr>`;

  const ctaKeys=Object.keys(porCta).sort();
  const rowsC=ctaKeys.map(k=>`<tr><td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${k}</td><td class="tnm">${porCta[k].nm}</td><td style="font-weight:600">${fmt(porCta[k].monto)}</td></tr>`).join('');

  el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📅 Resumen Mensual</div><div class="tw"><table>
      <thead><tr><th class="tl">MES</th><th>DOCS</th><th>NETO</th><th>EXENTO</th><th>IVA</th><th>OTROS</th><th>TOTAL</th></tr></thead>
      <tbody>${rowsM}</tbody>
      <tfoot><tr><td class="tl">TOTAL</td><td>${tC}</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td></tr></tfoot>
    </table></div></div>
    <div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📊 Por Cuenta de Gasto</div><div class="tw"><table>
      <thead><tr><th class="tl">CÓDIGO</th><th class="tl">CUENTA</th><th>MONTO</th></tr></thead>
      <tbody>${rowsC||'<tr><td colspan="3" class="empty" style="padding:18px">Sin distribución</td></tr>'}</tbody>
    </table></div></div>
  </div>`;
}

// — Form Compras —
function abrirCF(){
  CF={editId:null,dist:[{cuenta:'',monto:0}]};
  const f=document.getElementById('cf-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('cf-title').textContent='Nuevo Documento de Compra';
  document.getElementById('cf-fecha').value=today();
  document.getElementById('cf-vence').value='';
  document.getElementById('cf-dte').innerHTML=dteComprasOpts('');
  ['cf-num','cf-rut','cf-rs','cf-neto','cf-exento','cf-iva','cf-otros','cf-total'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('cf-dv').textContent='';
  document.getElementById('cf-dup-warn').style.display='none';
  renderDist();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function editarCompra(id){
  const d=S.compras.find(x=>x.id===id);if(!d)return;
  CF={editId:id,dist:d.dist?d.dist.map(l=>({...l})):[{cuenta:'',monto:d.neto||0}]};
  const f=document.getElementById('cf-form');f.style.display='block';f.classList.add('editing');
  document.getElementById('cf-title').textContent='Editando Documento — '+rutFmt(d.rutCodigo,d.rutDV);
  document.getElementById('cf-fecha').value=d.fecha;
  document.getElementById('cf-vence').value=d.fechaVencimiento||'';
  document.getElementById('cf-dte').innerHTML=dteComprasOpts(d.tipoDTE);
  document.getElementById('cf-num').value=d.numero||'';
  document.getElementById('cf-rut').value=(d.rutCodigo||'')+(d.rutDV||'');
  document.getElementById('cf-rs').value=d.razonSocial||'';
  document.getElementById('cf-neto').value=d.neto||'';
  document.getElementById('cf-exento').value=d.exento||'';
  document.getElementById('cf-iva').value=d.iva||'';
  document.getElementById('cf-otros').value=d.otrosImpuestos||'';
  document.getElementById('cf-total').value=d.total||'';
  document.getElementById('cf-dup-warn').style.display='none';
  cfRutInput(document.getElementById('cf-rut').value);
  renderDist();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function cerrarCF(){document.getElementById('cf-form').style.display='none';CF={editId:null,dist:[]};}

function cfRutInput(val){
  const r=rutParse(val);
  const el=document.getElementById('cf-dv');
  if(!r.raw){el.textContent='';el.className='rut-dv';return;}
  if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv ok';
    const prev=S.compras.find(v=>v.rutCodigo===r.codigo&&v.razonSocial);
    const rs=document.getElementById('cf-rs');
    if(prev&&!rs.value)rs.value=prev.razonSocial;
  }else if(r.codigo){el.textContent='✗ DV ≠ '+rutDV(r.codigo);el.className='rut-dv bad';}
  else{el.textContent='…';el.className='rut-dv';}
}

// Detección de duplicado en vivo
function cfCheckDup(){
  const warn=document.getElementById('cf-dup-warn');if(!warn)return;
  const tipoDTE=+document.getElementById('cf-dte').value;
  const numero=document.getElementById('cf-num').value.trim();
  const r=rutParse(document.getElementById('cf-rut').value);
  if(!tipoDTE||!numero||!r.codigo){warn.style.display='none';return;}
  const dup=S.compras.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==CF.editId);
  if(dup){
    const f=(typeof dup.corrMes==='number')?dup.corrMes:'?';
    warn.className='doc-dup-warn';warn.style.display='';
    warn.innerHTML=`⚠️ <span>DOCUMENTO DUPLICADO</span><span style="font-weight:400;margin-left:auto;font-size:11px">Ya existe: N° ${String(f).padStart(3,'0')} · ${dup.fecha} · ${rutFmt(dup.rutCodigo,dup.rutDV)} · DTE ${dup.tipoDTE} N°${dup.numero} · ${fmtC(dup.total)}</span>`;
  }else{warn.style.display='none';}
}

function cfCalcTotals(changed){
  const neto=pn(document.getElementById('cf-neto').value);
  const exento=pn(document.getElementById('cf-exento').value);
  const otros=pn(document.getElementById('cf-otros').value);
  const ivaEl=document.getElementById('cf-iva'),totEl=document.getElementById('cf-total');
  const dte=dteC(document.getElementById('cf-dte').value);
  const afecto=dte?dte.afecto:true;
  if(changed==='neto'||changed==='exento'||changed==='otros'){
    const iva=afecto?Math.round(neto*IVA):0;
    ivaEl.value=iva||'';
    totEl.value=neto+exento+iva+otros;
    if(CF.dist.length===1&&!CF.dist[0].monto&&changed==='neto')CF.dist[0].monto=neto;
    if(changed==='neto')renderDist();
  }else if(changed==='total'){
    const total=pn(totEl.value);
    if(afecto&&total>0&&!exento&&!otros){
      const n=Math.round(total/(1+IVA)),iv=total-n;
      document.getElementById('cf-neto').value=n;ivaEl.value=iv;
      if(CF.dist.length===1&&!CF.dist[0].monto){CF.dist[0].monto=n;renderDist();}
    }
  }else if(changed==='iva'){
    const iva=pn(ivaEl.value);
    totEl.value=neto+exento+iva+otros;
  }
  updCfCheck();
}

function renderDist(){
  const box=document.getElementById('cf-dist');
  if(!CF.dist.length)CF.dist=[{cuenta:'',monto:0,cc:''}];
  box.innerHTML=CF.dist.map((l,i)=>`<div class="dist-row">
    <div class="dist-num">${i+1}</div>
    <div>${inputCuenta({id:`dist-cd-${i}`,value:l.cuenta,onPick:`CF.dist[${i}].cuenta='%CD%';updCfCheck()`,placeholder:'Cuenta de gasto…',clase:'dist-inp'})}</div>
    <div><input type="number" class="dist-num-inp" min="0" placeholder="0" value="${l.monto||''}" oninput="CF.dist[${i}].monto=pn(this.value);updCfCheck()"></div>
    <div><select class="dist-inp" title="Centro de costo" onchange="CF.dist[${i}].cc=this.value">${ccOpts(l.cc||'')}</select></div>
    <div style="text-align:center"><button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="delDist(${i})">✕</button></div>
  </div>`).join('');
  updCfCheck();
}
function addDist(){CF.dist.push({cuenta:'',monto:0});renderDist();}
function delDist(i){if(CF.dist.length>1)CF.dist.splice(i,1);else CF.dist[0]={cuenta:'',monto:0};renderDist();}
function updCfCheck(){
  const neto=pn(document.getElementById('cf-neto').value);
  const sum=CF.dist.reduce((s,l)=>s+(l.monto||0),0);
  const diff=sum-neto,ok=neto>0&&diff===0;
  const box=document.getElementById('cf-check');
  box.className='dist-check '+(ok?'ok':'err');
  document.getElementById('cf-check-ico').textContent=ok?'✅':'⚠️';
  document.getElementById('cf-check-msg').textContent=ok?'Distribución cuadrada con el neto':
    neto===0?'Ingresa el neto y distribúyelo en cuentas':
    diff>0?`Exceso de ${fmtC(diff)} sobre el neto`:
    `Faltan ${fmtC(-diff)} por distribuir`;
  document.getElementById('cf-check-det').innerHTML=`<span>Neto: ${fmtC(neto)}</span> · <span>Distribuido: ${fmtC(sum)}</span>`;
}

function guardarCompra(){
  const fecha=document.getElementById('cf-fecha').value;
  const fechaVencimiento=document.getElementById('cf-vence').value||'';
  const tipoDTE=+document.getElementById('cf-dte').value;
  const numero=document.getElementById('cf-num').value.trim();
  const rutInput=document.getElementById('cf-rut').value;
  const razonSocial=document.getElementById('cf-rs').value.trim();
  const neto=pn(document.getElementById('cf-neto').value);
  const exento=pn(document.getElementById('cf-exento').value);
  const iva=pn(document.getElementById('cf-iva').value);
  const otrosImpuestos=pn(document.getElementById('cf-otros').value);
  const total=pn(document.getElementById('cf-total').value);

  if(!fecha){toast('⚠️ Ingresa la fecha de emisión','e');return;}
  if(fechaVencimiento&&fechaVencimiento<fecha){toast('⚠️ La fecha de vencimiento no puede ser anterior a la emisión','e');return;}
  if(!tipoDTE){toast('⚠️ Selecciona el tipo de documento','e');return;}
  if(!numero){toast('⚠️ Ingresa el N° de documento','e');return;}
  const r=rutParse(rutInput);
  if(!r.codigo){toast('⚠️ Ingresa el RUT del proveedor','e');return;}
  if(!r.valido){toast('⚠️ RUT inválido — dígito verificador no coincide','e');return;}
  if(!razonSocial){toast('⚠️ Ingresa la razón social','e');return;}
  if(total<=0){toast('⚠️ El total debe ser mayor a cero','e');return;}
  if(Math.abs((neto+exento+iva+otrosImpuestos)-total)>1){toast('⚠️ Neto + Exento + IVA + Otros no coincide con el Total','e');return;}

  const dist=CF.dist.filter(l=>l.cuenta&&l.monto>0);
  if(!dist.length){toast('⚠️ Agrega al menos una cuenta de gasto','e');return;}
  const sumDist=dist.reduce((s,l)=>s+l.monto,0);
  if(Math.abs(sumDist-neto)>1){toast('⚠️ La distribución no cuadra con el neto','e');return;}

  const dup=S.compras.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==CF.editId);
  if(dup){
    const f=(typeof dup.corrMes==='number')?dup.corrMes:'?';
    toast(`⚠️ Documento duplicado — ya existe N° ${String(f).padStart(3,'0')} (${dup.fecha}, ${fmtC(dup.total)})`,'e');
    return;
  }

  const doc={id:CF.editId||'c_'+Date.now(),fecha,fechaVencimiento,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,neto,exento,iva,otrosImpuestos,total,dist};
  if(CF.editId){
    const i=S.compras.findIndex(x=>x.id===CF.editId);
    const prev=i>=0?S.compras[i]:null;
    // Conservar el correlativo si el mes no cambió; reasignar si cambió de mes
    if(prev&&typeof prev.corrMes==='number'&&(prev.fecha||'').slice(0,7)===fecha.slice(0,7))
      doc.corrMes=prev.corrMes;
    else
      doc.corrMes=proxCorrMesCompra(fecha,CF.editId);
    if(i>=0)S.compras[i]=doc;toast('✅ Documento actualizado');logAccion('Editó compra',`DTE ${doc.tipoDTE} N°${doc.numero} · ${fmtC(doc.total)}`);
  }
  else{doc.corrMes=proxCorrMesCompra(fecha);S.compras.push(doc);toast('✅ Documento registrado');logAccion('Registró compra',`DTE ${doc.tipoDTE} N°${doc.numero} · ${doc.razonSocial} · ${fmtC(doc.total)}`);}
  window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).catch(()=>{});
  cerrarCF();rerender();
}

function eliminarCompra(id){
  const d=S.compras.find(x=>x.id===id);if(!d)return;
  if(!confirm(`¿Eliminar documento ${d.tipoDTE} N°${d.numero} de ${d.razonSocial}?\nTotal: ${fmtC(d.total)}`))return;
  S.compras=S.compras.filter(x=>x.id!==id);
  window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).catch(()=>{});
  rerender();toast('🗑 Documento eliminado');
}

// ═══ IMPORTACIÓN DESDE SII (Registro de Compras CSV) ═══
let IM={docs:[]};

// Parser de CSV que respeta comillas dobles (con escape "")

// Parsea número en formato chileno (1.234.567 o 1.234,56 o 1234567)

// "02/01/2026" o "2/1/2026" → "2026-01-02"

function parseSIICompras(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1); // BOM
  const rawLines=text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(!rawLines.length)throw new Error('Archivo vacío');

  // Detectar delimitador (; es lo más común en SII)
  const first=rawLines[0];
  const nSemi=(first.match(/;/g)||[]).length;
  const nComma=(first.match(/,/g)||[]).length;
  const delim=nSemi>=nComma?';':',';

  const rows=rawLines.map(l=>splitCSVRow(l,delim));

  // Buscar fila de headers
  let headerIdx=-1;
  for(let i=0;i<Math.min(8,rows.length);i++){
    const joined=rows[i].join(' ').toLowerCase();
    if(joined.includes('tipo doc')&&(joined.includes('rut')||joined.includes('proveedor'))){
      headerIdx=i;break;
    }
    if(joined.includes('tipo dte')&&joined.includes('rut')){headerIdx=i;break;}
  }
  if(headerIdx<0)throw new Error('No se encontró fila de encabezados. ¿Es el archivo "Detalle de Registro de Compras" del SII?');

  const headers=rows[headerIdx].map(h=>h.toLowerCase().trim().replace(/"/g,''));
  const getCol=(...patterns)=>{
    for(const p of patterns){
      const idx=headers.findIndex(h=>h.includes(p.toLowerCase()));
      if(idx>=0)return idx;
    }
    return -1;
  };

  const cTipo=getCol('tipo doc','tipo dte');
  const cRut=getCol('rut proveedor','rut emisor','rut');
  const cRazon=getCol('razon social','razón social','razonsocial');
  const cNro=getCol('nro doc','n° doc','folio');
  const cFecha=getCol('fecha docto','fecha documento','fecha emision','fecha emisión','fecha doc','fecha');
  const cExento=getCol('monto exento','exento');
  const cNeto=getCol('monto neto','neto');
  const cIvaRec=getCol('iva recuperable','monto iva recuperable');
  const cIvaNoRec=getCol('iva no recuperable','monto iva no recuperable');
  const cIvaPlano=getCol('monto iva','iva');
  const cTotal=getCol('monto total','total');
  const cOtroImp=getCol('valor otro impuesto','otro impuesto');

  if(cTipo<0||cRut<0||cNro<0||cFecha<0||cTotal<0){
    throw new Error('Faltan columnas esenciales (Tipo Doc, RUT, N° Doc, Fecha, Total). Verifica el formato del archivo.');
  }

  const docs=[];let descartados=0;
  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i];if(r.length<3)continue;
    const tipoDTE=parseInt(r[cTipo],10)||0;
    if(!tipoDTE){descartados++;continue;}
    if(!dteC(tipoDTE)){descartados++;continue;} // DTE no soportado
    const rutInfo=rutParse(r[cRut]||'');
    if(!rutInfo.codigo||!rutInfo.valido){descartados++;continue;}
    const fecha=parseFechaSII(r[cFecha]||'');
    if(!fecha){descartados++;continue;}
    const neto=Math.abs(parseNumSII(r[cNeto]||'0'));
    const exento=Math.abs(parseNumSII(r[cExento]||'0'));
    let iva=0;
    if(cIvaRec>=0)iva+=Math.abs(parseNumSII(r[cIvaRec]||'0'));
    if(cIvaNoRec>=0)iva+=Math.abs(parseNumSII(r[cIvaNoRec]||'0'));
    if(!iva&&cIvaPlano>=0)iva=Math.abs(parseNumSII(r[cIvaPlano]||'0'));
    const total=Math.abs(parseNumSII(r[cTotal]||'0'));
    const otrosImpuestos=cOtroImp>=0?Math.abs(parseNumSII(r[cOtroImp]||'0')):0;
    const numero=String(r[cNro]||'').trim();
    if(!numero||total===0){descartados++;continue;}

    docs.push({fecha,tipoDTE,numero,rutCodigo:rutInfo.codigo,rutDV:rutInfo.dv,razonSocial:(r[cRazon]||'').trim(),neto,exento,iva,otrosImpuestos,total});
  }
  return {docs,descartados};
}

function abrirImportSII(){
  const input=document.getElementById('imp-file');
  input.value='';
  input.click();
}

async function handleFileImport(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const res=await leerArchivo(file,'compra');
    mostrarDocsImportados(res,file.name);
  }catch(err){
    toast('❌ '+err.message,'e');
  }
}


function mostrarDocsImportados(res,nombreArchivo){
  if(!res.docs.length){
    toast('⚠️ No se detectaron documentos válidos en el archivo','e');
    return;
  }
  // Detectar periodo: el mes-año más frecuente entre los documentos
  const conteo={};
  res.docs.forEach(d=>{
    const mY=d.fecha.slice(0,7); // "YYYY-MM"
    conteo[mY]=(conteo[mY]||0)+1;
  });
  const periodos=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
  const [periodoTop,cantTop]=periodos[0];
  const [anioTop,mesTop]=periodoTop.split('-');

  // Marcar duplicados: comparamos SIEMPRE como string, porque un doc guardado
  // manualmente puede tener el número como Number y el CSV lo trae como String.
  const todos=todosDocsCompras();
  res.docs.forEach(d=>{
    const dup=todos.find(x=>
      x.rutCodigo===d.rutCodigo &&
      +x.tipoDTE===+d.tipoDTE &&
      String(x.numero).trim()===String(d.numero).trim()
    );
    d.dup=dup||null;
    d.incluir=!dup;
    // Pre-poblar cuenta y CC desde la ficha del proveedor si existe.
    // Esto agiliza el flujo: los proveedores recurrentes ya vienen clasificados.
    const ficha=fichaAux('proveedor',d.rutCodigo);
    d.cuenta=ficha?.cuentaDefault||'';
    d.cc=ficha?.ccDefault||'';
    d.fechaOriginal=d.fecha;
  });

  // Mutar IM in-place (NO reasignar): window.IM debe seguir apuntando a este
  // objeto para que los onPick de los buscadores de cuenta escriban aquí.
  IM.docs=res.docs;
  IM.descartados=res.descartados||0;
  IM.archivo=nombreArchivo;
  IM.periodoMes=+mesTop;
  IM.periodoAnio=+anioTop;
  IM.periodos=periodos;
  abrirImportModal();
}

function abrirImportModal(){
  // Poblar select de mes
  const selMes=document.getElementById('imp-periodo-mes');
  selMes.innerHTML=MESES.map((m,i)=>`<option value="${i+1}" ${i+1===IM.periodoMes?'selected':''}>${m}</option>`).join('');
  // Poblar select de año (±3 años del actual, incluyendo el detectado)
  const selAnio=document.getElementById('imp-periodo-anio');
  const cy=new Date().getFullYear();
  const anios=new Set();
  for(let y=cy-3;y<=cy+1;y++)anios.add(y);
  anios.add(IM.periodoAnio);
  const aniosOrd=[...anios].sort();
  selAnio.innerHTML=aniosOrd.map(y=>`<option value="${y}" ${y===IM.periodoAnio?'selected':''}>${y}</option>`).join('');

  // Poblar select bulk
  // El bulk usa el buscador dinámico: reemplazamos el <select> por un <input>
  const bulkWrap=document.getElementById('imp-bulk-wrap');
  if(bulkWrap){
    bulkWrap.innerHTML=inputCuenta({id:'imp-bulk-cd',value:'',
      onPick:"setBulkCuentaImp('%CD%')",
      placeholder:'Buscar cuenta de gasto o activo por código o nombre…',
      clase:'linea-inp',filtro:'compra'});
  }
  // Bulk de centro de costo: reutilizamos ccOpts() que ya arma la jerarquía
  const bulkCC=document.getElementById('imp-bulk-cc');
  if(bulkCC)bulkCC.innerHTML=ccOpts('');

  renderImportModal();
  document.getElementById('imp-modal').classList.add('open');
}

function cambiarPeriodoImport(){
  IM.periodoMes=+document.getElementById('imp-periodo-mes').value;
  IM.periodoAnio=+document.getElementById('imp-periodo-anio').value;
  renderImportModal();
}

function cerrarImportModal(){
  document.getElementById('imp-modal').classList.remove('open');
  IM.docs=[];  // limpiar in-place (no reasignar; ver nota en cargarArchivoSII)
}

// Devuelve la fecha efectiva que se guardará: si "forzar" está activo y el doc está fuera del
// periodo, retornar el último día del mes del periodo; si no, usar la fecha original.
function fechaEfectivaImport(d){
  const forzar=document.getElementById('imp-forzar-periodo')?.checked;
  const [yOrig,mOrig]=d.fechaOriginal.split('-');
  const fueraPeriodo=(+yOrig!==IM.periodoAnio||+mOrig!==IM.periodoMes);
  if(!forzar||!fueraPeriodo)return d.fechaOriginal;
  // Forzar al último día del mes del periodo (para preservar orden cronológico al cierre)
  const ultDia=new Date(IM.periodoAnio,IM.periodoMes,0).getDate();
  return `${IM.periodoAnio}-${String(IM.periodoMes).padStart(2,'0')}-${String(ultDia).padStart(2,'0')}`;
}

function renderImportModal(){
  const total=IM.docs.length;
  const dups=IM.docs.filter(d=>d.dup).length;
  const incl=IM.docs.filter(d=>d.incluir).length;
  const conCuenta=IM.docs.filter(d=>d.incluir&&d.cuenta).length;

  // Info del periodo
  const periodoStr=`${MESES[IM.periodoMes-1]} ${IM.periodoAnio}`;
  const fuera=IM.docs.filter(d=>{
    const [y,m]=d.fechaOriginal.split('-');
    return +y!==IM.periodoAnio||+m!==IM.periodoMes;
  }).length;
  const forzar=document.getElementById('imp-forzar-periodo')?.checked;
  let periodoInfo=`Periodo seleccionado: <strong>${periodoStr}</strong>`;
  if(IM.periodos&&IM.periodos.length>1){
    const detallado=IM.periodos.map(([p,c])=>{
      const [y,m]=p.split('-');
      return `${MESES[+m-1].slice(0,3)} ${y}: ${c}`;
    }).join(' · ');
    periodoInfo+=`<br><span style="color:var(--mt);font-size:10px">Detectado en archivo: ${detallado}</span>`;
  }
  if(fuera>0){
    periodoInfo+=`<br><span style="color:${forzar?'var(--info)':'var(--err)'};font-size:11px;margin-top:2px;display:inline-block">${forzar?'✓':'⚠️'} ${fuera} documento${fuera===1?'':'s'} con fecha fuera del periodo ${forzar?`se ajustarán al último día de ${periodoStr}`:'se importarán con su fecha original'}</span>`;
  }
  document.getElementById('imp-periodo-info').innerHTML=periodoInfo;

  // Summary
  document.getElementById('imp-summary').innerHTML=`📊 <strong>${total}</strong> documentos detectados` +
    (IM.descartados?` · ${IM.descartados} descartados (datos incompletos o DTE no soportado)`:'')+
    (dups?` · <strong style="color:var(--err)">${dups} duplicados</strong> (ya existen)`:'')+
    ` · Archivo: <code style="font-family:var(--mono);font-size:11px">${IM.archivo||'-'}</code>`;
  document.getElementById('imp-count').textContent=`${conCuenta}/${incl} con cuenta asignada`;

  // Botón OK
  const btnOk=document.getElementById('imp-btn-ok');
  btnOk.textContent=`💾 Importar ${incl} documento${incl===1?'':'s'} al ${periodoStr}`;
  btnOk.disabled=incl===0;

  // Checkbox "todos"
  const chkAll=document.getElementById('imp-all');
  chkAll.checked=incl>0&&incl===IM.docs.filter(d=>!d.dup).length;

  // Filas: cada una usa buscador dinámico (compra = gasto + activo)
  document.getElementById('imp-rows').innerHTML=IM.docs.map((d,i)=>{
    const cls='imp-row'+(d.dup?' dup':'')+(!d.incluir?' excluded':'');
    const [y,m]=d.fechaOriginal.split('-');
    const fueraP=+y!==IM.periodoAnio||+m!==IM.periodoMes;
    const fechaShow=fueraP
      ? `<span style="color:var(--err)" title="Fuera del periodo">${d.fechaOriginal}</span>${forzar?`<div style="font-size:9px;color:var(--info)">→ ${fechaEfectivaImport(d)}</div>`:''}`
      : d.fechaOriginal;
    const estado=d.dup
      ?`<span class="dup-badge">DUPLICADO</span>`
      :(d.cuenta?`<span class="ok-badge">LISTO</span>`:`<span style="color:var(--mt);font-size:10px">pendiente</span>`);
    const selHtml=inputCuenta({id:`imp-cd-${i}`,value:d.cuenta||'',
      onPick:`setImportCuenta(${i},'%CD%')`,
      placeholder:'Buscar cuenta…',clase:'linea-inp',filtro:'compra'});
    // Selector de centro de costo (opcional)
    const ccHtml=`<select onchange="setImportCC(${i},this.value)" style="width:100%;font-size:11px;padding:3px">${ccOpts(d.cc||'')}</select>`;
    return `<div class="${cls}">
      <div style="text-align:center"><input type="checkbox" ${d.incluir?'checked':''} ${d.dup?'disabled':''} onchange="toggleImportDoc(${i},this.checked)"></div>
      <div style="font-family:var(--mono);font-size:10px">${fechaShow}</div>
      <div style="font-family:var(--mono);font-size:10px">${d.tipoDTE}</div>
      <div style="font-family:var(--mono);font-size:10px">${d.numero}</div>
      <div style="font-family:var(--mono);font-size:10px">${rutFmt(d.rutCodigo,d.rutDV)}</div>
      <div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="${(d.razonSocial||'').replace(/"/g,'&quot;')}" onclick="toast('${(d.razonSocial||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;')}')">${d.razonSocial}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.neto)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.iva)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.otrosImpuestos)}</div>
      <div style="text-align:right;font-family:var(--mono);font-weight:600">${fmt(d.total)}</div>
      <div>${selHtml}</div>
      <div>${ccHtml}</div>
      <div>${estado}</div>
    </div>`;
  }).join('');
}

function toggleImportDoc(i,checked){
  IM.docs[i].incluir=checked;
  renderImportModal();
}
function toggleAllImport(checked){
  IM.docs.forEach(d=>{if(!d.dup)d.incluir=checked;});
  renderImportModal();
}
function setImportCuenta(i,cuenta){
  IM.docs[i].cuenta=cuenta;
  renderImportModal();
}
// Guarda temporalmente la cuenta elegida en el buscador bulk
let _bulkCuentaImp='';
function setBulkCuentaImp(cd){_bulkCuentaImp=cd;}

function aplicarCuentaATodos(){
  // Leer del buscador (nuevo) o del select antiguo si aún existe
  const bulkInp=document.getElementById('imp-bulk-cd');
  const cta=_bulkCuentaImp||(bulkInp?bulkInp.dataset.cd:'')||
    (document.getElementById('imp-bulk')&&document.getElementById('imp-bulk').value)||'';
  if(!cta){toast('⚠️ Selecciona una cuenta primero','e');return;}
  let n=0;
  IM.docs.forEach(d=>{if(d.incluir){d.cuenta=cta;n++;}});
  renderImportModal();
  toast(`✅ Aplicada cuenta a ${n} documento${n===1?'':'s'}`);
}

// ── Centro de costo en el importador ──
function setImportCC(i,cc){
  IM.docs[i].cc=cc;
}
function aplicarCCATodos(){
  const sel=document.getElementById('imp-bulk-cc');
  const cc=sel?sel.value:'';
  // Se aplica también con cc vacío: eso significa "quitar CC a todos"
  let n=0;
  IM.docs.forEach(d=>{if(d.incluir){d.cc=cc;n++;}});
  renderImportModal();
  toast(cc
    ? `✅ Centro de costo aplicado a ${n} documento${n===1?'':'s'}`
    : `✅ Centro de costo quitado de ${n} documento${n===1?'':'s'}`);
}

function confirmarImportacion(){
  const incluidos=IM.docs.filter(d=>d.incluir);
  if(!incluidos.length){toast('⚠️ No hay documentos para importar','e');return;}
  const sinCuenta=incluidos.filter(d=>!d.cuenta);
  if(sinCuenta.length){
    toast(`⚠️ ${sinCuenta.length} documento${sinCuenta.length===1?' no tiene':'s no tienen'} cuenta asignada`,'e');
    return;
  }
  // Detectar proveedores nuevos (RUTs que no aparecen en el libro actual)
  const rutsExistentes=new Set(todosDocsCompras().map(x=>x.rutCodigo));
  const proveedoresNuevos=new Map();
  incluidos.forEach(d=>{
    if(!rutsExistentes.has(d.rutCodigo)&&!proveedoresNuevos.has(d.rutCodigo)){
      proveedoresNuevos.set(d.rutCodigo,{rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial});
    }
  });
  // Crear registros de compras
  let agregados=0,normalizados=0;
  const ts=Date.now();
  // Reservar el rango de folios de comprobante ANTES de crear los docs, así
  // cada uno recibe un correlativo único y consecutivo aunque el import
  // se interrumpa a mitad.
  let folioNext=proxFolioComprobante();
  incluidos.forEach((d,i)=>{
    const fechaFinal=fechaEfectivaImport(d);
    if(fechaFinal!==d.fechaOriginal)normalizados++;
    // Calculamos el gasto como (total - IVA recuperable). Es lo que
    // efectivamente le cuesta a la empresa. Con esta fórmula:
    //   - El asiento SIEMPRE cuadra: DEBE(gasto) + DEBE(IVA) = HABER(prov)
    //   - Absorbe inconsistencias del CSV (cuando neto+iva+otros ≠ total)
    //   - Los "otros impuestos" quedan implícitamente incluidos en el gasto
    // DTE 46 (factura de compra): el IVA lo retiene el receptor, así que el
    // proveedor solo recibe `total` (= neto). El gasto es igual al total.
    const montoDist=+d.tipoDTE===46 ? d.total : (d.total-d.iva);
    const doc={
      id:'c_imp_'+ts+'_'+i,
      folioComp:folioNext++,   // correlativo único de comprobante contable
      fecha:fechaFinal,
      fechaVencimiento:'',
      tipoDTE:d.tipoDTE,
      numero:d.numero,
      rutCodigo:d.rutCodigo,
      rutDV:d.rutDV,
      razonSocial:d.razonSocial,
      neto:d.neto,
      exento:d.exento,
      iva:d.iva,
      // otrosImpuestos ya está incluido en montoDist (por ser total-iva),
      // así que lo dejamos en 0 para que genDiario no lo sume dos veces.
      otrosImpuestos:0,
      // Guardamos el valor original por si se necesita para reportes SII.
      otrosImpuestosOriginal:d.otrosImpuestos||0,
      total:d.total,
      dist:[{cuenta:d.cuenta,monto:montoDist,cc:d.cc||''}]
    };
    S.compras.push(doc);
    agregados++;
  });
  window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).catch(()=>toast('❌ Error guardando en storage','e'));

  // Guardar cuenta y CC como default en la ficha del proveedor.
  // Reglas:
  //  - Si el proveedor NO tiene ficha, se crea con los datos actuales.
  //  - Si tiene ficha pero SIN cuentaDefault/ccDefault, se completan.
  //  - Si ya tiene cuentaDefault/ccDefault configurados por el usuario,
  //    NO se sobreescriben (respetamos su configuración).
  //  - Cuando un proveedor tiene documentos con distinta cuenta en el mismo
  //    batch, se usa la más frecuente.
  const asignaciones={};  // rut → { cuenta:{cd→count}, cc:{cd→count}, dv, razon }
  incluidos.forEach(d=>{
    const key=d.rutCodigo;
    if(!key)return;
    if(!asignaciones[key])asignaciones[key]={cuenta:{},cc:{},rutDV:d.rutDV,razonSocial:d.razonSocial};
    if(d.cuenta)asignaciones[key].cuenta[d.cuenta]=(asignaciones[key].cuenta[d.cuenta]||0)+1;
    if(d.cc)asignaciones[key].cc[d.cc]=(asignaciones[key].cc[d.cc]||0)+1;
    if(!asignaciones[key].razonSocial&&d.razonSocial)asignaciones[key].razonSocial=d.razonSocial;
  });
  let fichasCreadas=0, fichasActualizadas=0;
  const proveedoresF=fichasAux('proveedor');
  Object.entries(asignaciones).forEach(([rut,a])=>{
    const cuentaTop=Object.entries(a.cuenta).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ccTop=Object.entries(a.cc).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ficha=proveedoresF[rut];
    if(!ficha){
      // Ficha nueva con datos básicos (se completa el resto luego)
      proveedoresF[rut]={
        rutCodigo:rut, rutDV:a.rutDV, razonSocial:a.razonSocial||'',
        cuentaDefault:cuentaTop, ccDefault:ccTop,
        giro:'', direccion:'', comuna:'', ciudad:'', email:'', telefono:'', notas:'',
      };
      fichasCreadas++;
    }else{
      // Completar solo los campos vacíos, respetando lo que el usuario ya haya
      // configurado manualmente
      let cambio=false;
      if(!ficha.cuentaDefault&&cuentaTop){ficha.cuentaDefault=cuentaTop;cambio=true;}
      if(!ficha.ccDefault&&ccTop){ficha.ccDefault=ccTop;cambio=true;}
      if(!ficha.razonSocial&&a.razonSocial){ficha.razonSocial=a.razonSocial;cambio=true;}
      if(!ficha.rutDV&&a.rutDV){ficha.rutDV=a.rutDV;cambio=true;}
      if(cambio)fichasActualizadas++;
    }
  });
  if(fichasCreadas||fichasActualizadas){
    guardarFichasAux().catch(()=>{});
  }

  cerrarImportModal();
  const periodoStr=`${MESES[IM.periodoMes-1]} ${IM.periodoAnio}`;
  const msgProv=proveedoresNuevos.size?` · ${proveedoresNuevos.size} proveedor${proveedoresNuevos.size===1?'':'es'} nuevo${proveedoresNuevos.size===1?'':'s'} detectado${proveedoresNuevos.size===1?'':'s'} en auxiliares`:'';
  const msgFichas=(fichasCreadas||fichasActualizadas)?` · fichas: ${fichasCreadas} nuevas${fichasActualizadas?', '+fichasActualizadas+' completadas':''}`:'';
  toast(`✅ ${agregados} documento${agregados===1?'':'s'} importado${agregados===1?'':'s'} al periodo ${periodoStr}${normalizados?` (${normalizados} con fecha normalizada)`:''}${msgProv}${msgFichas}`);
  logAccion('Importó compras SII',`${agregados} documentos${msgFichas}`);
  rerender();
}

// Listener del file input (se adjunta al init)
function initImportListener(){
  const input=document.getElementById('imp-file');
  if(input&&!input._listenerAttached){
    input.addEventListener('change',handleFileImport);
    input._listenerAttached=true;
  }
}


export {onMesChangeC, limpiarFiltrosC, dteComprasOpts, cuentasGastoOpts, renderCompras, renderCResumen, abrirCF, editarCompra, cerrarCF, cfRutInput, cfCheckDup, cfCalcTotals, renderDist, addDist, delDist, updCfCheck, guardarCompra, eliminarCompra, IM,  abrirImportSII, handleFileImport,  mostrarDocsImportados, abrirImportModal, cambiarPeriodoImport, cerrarImportModal, fechaEfectivaImport, renderImportModal, toggleImportDoc, toggleAllImport, setImportCuenta, aplicarCuentaATodos, setImportCC, aplicarCCATodos, setBulkCuentaImp, confirmarImportacion, initImportListener,
        toggleCSel, toggleCSelAll, limpiarCSel, eliminarCSel, CF};
