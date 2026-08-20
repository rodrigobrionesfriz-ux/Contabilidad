// busqueda.js
import {toast, PDC, fmtC, MESES, rutFmt} from './core.js';
import {S, AUTH} from './state.js';
import {todosDocsVentas, todosDocsCompras, editarAsiento} from './asientos.js';
import {puedeVer, permiso} from './auth.js';
import {nav} from './ui.js';
import {abrirComprobantePor} from './comprobantes.js';

let SEARCH_SEL=0;

// ═══ FASE 6: BÚSQUEDA GLOBAL (Ctrl+K) ═══
function abrirBusqueda(){
  document.getElementById('search-overlay').style.display='block';
  const inp=document.getElementById('search-input');
  inp.value='';document.getElementById('search-results').innerHTML='';SEARCH_SEL=0;
  setTimeout(()=>inp.focus(),50);
}
function cerrarBusqueda(){
  document.getElementById('search-overlay').style.display='none';
}
// Construye el índice de todos los registros buscables
function construirIndiceBusqueda(){
  const items=[];
  // Ventas
  todosDocsVentas().forEach(d=>{
    items.push({tipo:'Venta',ico:'🛒',sec:'ventas',docId:d.id,
      titulo:`${d.razonSocial||'(sin razón)'} — DTE ${d.tipoDTE} N°${d.numero||''}`,
      sub:`${d.fecha} · ${fmtC(d.total)} · ${rutFmt(d.rutCodigo,d.rutDV)}`,
      texto:`${d.razonSocial} ${d.rutCodigo} ${d.numero} ${d.total} ${d.fecha}`.toLowerCase()});
  });
  // Compras
  todosDocsCompras().forEach(d=>{
    items.push({tipo:'Compra',ico:'🧾',sec:'compras',docId:d.id,
      titulo:`${d.razonSocial||'(sin razón)'} — DTE ${d.tipoDTE} N°${d.numero||''}`,
      sub:`${d.fecha} · ${fmtC(d.total)} · ${rutFmt(d.rutCodigo,d.rutDV)}`,
      texto:`${d.razonSocial} ${d.rutCodigo} ${d.numero} ${d.total} ${d.fecha}`.toLowerCase()});
  });
  // Asientos manuales
  S.asientos.forEach(a=>{
    const total=a.movs.reduce((s,m)=>s+(m.debe||0),0);
    items.push({tipo:'Asiento',ico:'✏️',sec:'asientos',id:a.id,asientoN:a.n,
      titulo:`N°${a.n} — ${a.glosa||'(sin glosa)'}`,
      sub:`${a.fecha} · ${fmtC(total)}${a.anulado?' · ANULADO':''}`,
      texto:`${a.n} ${a.glosa} ${a.fecha} ${a.movs.map(m=>m.cd+' '+(m.nm||'')).join(' ')}`.toLowerCase()});
  });
  // Honorarios
  S.honorarios.forEach(h=>{
    items.push({tipo:'Honorario',ico:'📝',sec:'honorarios',honMes:h.mes,
      titulo:`${h.profesional||h.nombre||'(sin nombre)'}`,
      sub:`${MESES[(h.mes||1)-1]||''} · ${fmtC(h.bruto||0)} bruto`,
      texto:`${h.profesional||h.nombre} ${h.rut} ${h.bruto}`.toLowerCase()});
  });
  // Trabajadores
  (S.trabajadores||[]).forEach(t=>{
    items.push({tipo:'Trabajador',ico:'👷',sec:'remuneraciones',
      titulo:`${t.nombre}`,
      sub:`${t.cargo||''} · ${fmtC(t.base)} base · ${t.rut||''}`,
      texto:`${t.nombre} ${t.cargo} ${t.rut}`.toLowerCase()});
  });
  // Activos fijos
  (S.activos||[]).forEach(a=>{
    items.push({tipo:'Activo',ico:'🏗️',sec:'activofijo',
      titulo:`${a.desc}`,
      sub:`${a.fecha} · ${fmtC(a.valor)}`,
      texto:`${a.desc} ${a.fecha} ${a.valor}`.toLowerCase()});
  });
  // Cuentas del PDC
  PDC.filter(c=>c.nat).forEach(c=>{
    items.push({tipo:'Cuenta',ico:'📋',sec:'pdc',
      titulo:`${c.cd} — ${c.nm}`,
      sub:`Plan de cuentas`,
      texto:`${c.cd} ${c.nm}`.toLowerCase()});
  });
  return items;
}
function ejecutarBusqueda(){
  const q=document.getElementById('search-input').value.toLowerCase().trim();
  const cont=document.getElementById('search-results');
  if(q.length<2){cont.innerHTML='<div style="padding:20px;text-align:center;color:var(--mt);font-size:13px">Escribe al menos 2 letras para buscar…</div>';return;}
  const idx=construirIndiceBusqueda();
  // Filtrar: todas las palabras del query deben aparecer
  const palabras=q.split(/\s+/);
  const res=idx.filter(it=>palabras.every(p=>it.texto.includes(p))).slice(0,40);
  SEARCH_SEL=0;
  if(!res.length){cont.innerHTML='<div style="padding:20px;text-align:center;color:var(--mt);font-size:13px">Sin resultados para "'+q+'"</div>';return;}
  window._searchRes=res;
  cont.innerHTML=res.map((it,i)=>`<div class="search-item" data-i="${i}" onclick="irAResultado(${i})" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;${i===0?'background:var(--sf2,rgba(88,166,255,.12))':''}">
    <span style="font-size:18px">${it.ico}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.titulo}</div>
      <div style="font-size:11px;color:var(--mt)">${it.sub}</div>
    </div>
    <span style="font-size:9px;color:var(--mt);text-transform:uppercase;border:1px solid var(--bd);border-radius:4px;padding:2px 6px">${it.tipo}</span>
    ${criterioComprobante(it)?`<span style="font-size:10px;color:var(--mt)" title="Se abre su comprobante">📄</span>`:''}
  </div>`).join('');
}
function navBusqueda(e){
  if(e.key==='Escape'){cerrarBusqueda();return;}
  const res=window._searchRes||[];
  if(!res.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();SEARCH_SEL=Math.min(SEARCH_SEL+1,res.length-1);actualizarSeleccion();}
  else if(e.key==='ArrowUp'){e.preventDefault();SEARCH_SEL=Math.max(SEARCH_SEL-1,0);actualizarSeleccion();}
  else if(e.key==='Enter'){e.preventDefault();irAResultado(SEARCH_SEL);}
}
function actualizarSeleccion(){
  document.querySelectorAll('.search-item').forEach((el,i)=>{
    el.style.background=i===SEARCH_SEL?'var(--sf2,rgba(88,166,255,.12))':'';
    if(i===SEARCH_SEL)el.scrollIntoView({block:'nearest'});
  });
}
// Al elegir un resultado se abre SU COMPROBANTE, que es la vista que muestra el
// registro completo con su asiento contable. Antes sólo se navegaba a la
// sección: si el documento era de otro mes —o si ya estabas en esa sección— no
// pasaba nada visible y parecía que el clic se perdía.
//
// Para lo que no tiene comprobante (cuentas del plan, trabajadores, activos) se
// navega a su sección, como siempre.
function criterioComprobante(it){
  if(it.docId)return {docId:it.docId};
  if(it.asientoN!=null)return {asientoN:it.asientoN};
  if(it.tipo==='Honorario'&&it.honMes!=null)return {honorariosMes:it.honMes};
  return null;
}

function irAResultado(i){
  const res=window._searchRes||[];
  const it=res[i];if(!it)return;
  cerrarBusqueda();

  const crit=criterioComprobante(it);
  if(crit&&puedeVer('comprobantes')){
    if(abrirComprobantePor(crit))return;
    // Sin comprobante propio (por ejemplo un DTE que vive dentro de un asiento):
    // se cae a la sección de origen en vez de dejar el clic sin efecto.
    toast('Ese registro no tiene un comprobante propio — te llevo a su libro');
  }

  if(!puedeVer(it.sec)){toast('⚠️ No tienes permiso para ver esa sección','e');return;}
  nav(it.sec);
  if(it.tipo==='Asiento'&&it.id){setTimeout(()=>{if(typeof editarAsiento==='function')editarAsiento(it.id);},150);}
}
// Atajo de teclado global Ctrl+K / Cmd+K
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){
    e.preventDefault();
    if(AUTH.user)abrirBusqueda();
  }
});


export {abrirBusqueda, cerrarBusqueda, construirIndiceBusqueda, ejecutarBusqueda, navBusqueda, actualizarSeleccion, irAResultado};
