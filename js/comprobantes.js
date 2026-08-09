// comprobantes.js — Vista unificada de asientos del libro diario
//
// A diferencia de "Asientos Manuales", que solo lista los que el usuario
// escribió a mano, esta vista muestra TODOS los asientos del libro diario:
// apertura, resúmenes automáticos de ventas/compras/honorarios, y manuales.
//
// Cada uno permite editarse: los manuales abren el editor de asientos, los
// automáticos llevan al origen (Libro de Ventas/Compras/Honorarios) para
// que se corrijan los documentos que los generaron.

import {fmt, fmtC, MESES, pdcNm, today} from './core.js';
import {S} from './state.js';
import {nav} from './ui.js';
import {genDiario} from './reportes.js';
import {editarAsiento} from './asientos.js';

// Filtros
let CMP_FILTRO={mes:'',origen:'',texto:''};

function mesOptsCmp(){
  let h='<option value="">Todos los meses</option>';
  for(let i=0;i<12;i++)h+=`<option value="${i+1}" ${CMP_FILTRO.mes===String(i+1)?'selected':''}>${MESES[i]}</option>`;
  return h;
}

function origenLbl(e){
  if(e.origen==='apertura')return {ic:'🔰',nm:'Apertura',c:'#c9a227'};
  if(e.origen==='manual')return {ic:'✏️',nm:'Manual',c:'#3fb950'};
  if(e.fuente==='ventas')return {ic:'🛒',nm:'Ventas',c:'#58a6ff'};
  if(e.fuente==='compras')return {ic:'🧾',nm:'Compras',c:'#f0883e'};
  if(e.fuente==='honorarios')return {ic:'📝',nm:'Honorarios',c:'#c377dc'};
  return {ic:'⚙️',nm:'Automático',c:'var(--mt)'};
}

export function renderComprobantes(){
  const cont=document.getElementById('comprobantes-content');
  if(!cont)return;

  let entries=genDiario();

  // Filtros
  if(CMP_FILTRO.mes){
    const m=+CMP_FILTRO.mes;
    entries=entries.filter(e=>{
      const em=+String(e.fecha).slice(5,7);
      return em===m;
    });
  }
  if(CMP_FILTRO.origen){
    entries=entries.filter(e=>{
      if(CMP_FILTRO.origen==='apertura')return e.origen==='apertura';
      if(CMP_FILTRO.origen==='manual')return e.origen==='manual';
      if(CMP_FILTRO.origen==='auto')return e.origen==='auto';
      // filtros por fuente
      return e.fuente===CMP_FILTRO.origen;
    });
  }
  if(CMP_FILTRO.texto){
    const t=CMP_FILTRO.texto.toLowerCase();
    entries=entries.filter(e=>{
      if((e.glosa||'').toLowerCase().includes(t))return true;
      return e.movs.some(m=>String(m.cd).includes(t)||(m.nm||'').toLowerCase().includes(t));
    });
  }

  // Resumen
  const totD=entries.reduce((s,e)=>s+e.movs.reduce((ss,m)=>ss+(m.debe||0),0),0);
  const totH=entries.reduce((s,e)=>s+e.movs.reduce((ss,m)=>ss+(m.haber||0),0),0);
  const cntAuto=entries.filter(e=>e.origen==='auto').length;
  const cntMan=entries.filter(e=>e.origen==='manual').length;
  const cntAp=entries.filter(e=>e.origen==='apertura').length;

  let h=`<div class="filter-row" style="margin-bottom:14px">
    <span class="f-lbl">Filtrar:</span>
    <select onchange="setCmpFiltro('mes',this.value)">${mesOptsCmp()}</select>
    <select onchange="setCmpFiltro('origen',this.value)">
      <option value="">Todos los orígenes</option>
      <option value="apertura" ${CMP_FILTRO.origen==='apertura'?'selected':''}>🔰 Apertura</option>
      <option value="manual" ${CMP_FILTRO.origen==='manual'?'selected':''}>✏️ Manuales</option>
      <option value="auto" ${CMP_FILTRO.origen==='auto'?'selected':''}>⚙️ Todos automáticos</option>
      <option value="ventas" ${CMP_FILTRO.origen==='ventas'?'selected':''}>🛒 Auto ventas</option>
      <option value="compras" ${CMP_FILTRO.origen==='compras'?'selected':''}>🧾 Auto compras</option>
      <option value="honorarios" ${CMP_FILTRO.origen==='honorarios'?'selected':''}>📝 Auto honorarios</option>
    </select>
    <input type="text" placeholder="Buscar por glosa o cuenta…" value="${CMP_FILTRO.texto.replace(/"/g,'&quot;')}"
      oninput="setCmpFiltro('texto',this.value)" style="min-width:220px">
    <button class="btn btn-g" onclick="limpiarCmpFiltro()">Limpiar</button>
    <span class="doc-count">${entries.length} comprobantes${cntAp?' · '+cntAp+' apertura':''}${cntAuto?' · '+cntAuto+' automáticos':''}${cntMan?' · '+cntMan+' manuales':''}</span>
  </div>`;

  if(!entries.length){
    h+=`<div style="text-align:center;padding:40px;color:var(--mt)">
      <div style="font-size:36px;margin-bottom:8px">📖</div>
      No hay comprobantes que coincidan con los filtros
    </div>`;
    cont.innerHTML=h;
    return;
  }

  // Tabla de comprobantes
  h+='<div class="card-np" style="margin-bottom:14px"><div class="tw"><table style="font-size:12px">';
  h+=`<thead><tr>
    <th class="tl" style="width:50px">N°</th>
    <th class="tl" style="width:90px">FECHA</th>
    <th class="tl" style="width:110px">ORIGEN</th>
    <th class="tl">GLOSA</th>
    <th style="text-align:right;width:120px">DEBE</th>
    <th style="text-align:right;width:120px">HABER</th>
    <th style="width:110px"></th>
  </tr></thead><tbody>`;

  entries.forEach((e,i)=>{
    const o=origenLbl(e);
    const totED=e.movs.reduce((s,m)=>s+(m.debe||0),0);
    const totEH=e.movs.reduce((s,m)=>s+(m.haber||0),0);
    const detId='cmp-det-'+i;
    const anulado=e.anulado?' style="opacity:.5;text-decoration:line-through"':'';

    // Acción según origen
    let btnEditar;
    if(e.origen==='manual'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="editarAsientoDesdeCmp(${e.ref})" title="Editar asiento manual">✏️ Editar</button>`;
    }else if(e.origen==='apertura'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('apertura')" title="Ir a Balance de Apertura">🔰 Abrir</button>`;
    }else if(e.fuente==='ventas'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('ventas')" title="Ir al Libro de Ventas para editar los documentos">🛒 Al libro</button>`;
    }else if(e.fuente==='compras'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('compras')" title="Ir al Libro de Compras para editar los documentos">🧾 Al libro</button>`;
    }else if(e.fuente==='honorarios'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('honorarios')" title="Ir al libro de honorarios">📝 Al libro</button>`;
    }else{
      btnEditar='';
    }

    h+=`<tr${anulado}>
      <td class="tl" style="font-family:var(--mono);font-weight:600">${e.n}</td>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${e.fecha}</td>
      <td class="tl">
        <span style="display:inline-flex;align-items:center;gap:4px;background:${o.c}22;color:${o.c};padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600">${o.ic} ${o.nm}</span>
      </td>
      <td class="tl" onclick="toggleCmpDet('${detId}')" style="cursor:pointer">
        ${e.glosa||''}
        <span style="font-size:10px;color:var(--mt);margin-left:6px">▸ ${e.movs.length} línea${e.movs.length===1?'':'s'}</span>
      </td>
      <td style="text-align:right;font-family:var(--mono)">${fmtC(totED)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtC(totEH)}</td>
      <td style="text-align:right;white-space:nowrap">${btnEditar}</td>
    </tr>`;
    // Detalle expandible
    h+=`<tr id="${detId}" style="display:none;background:var(--sf2)"><td colspan="7" style="padding:8px 14px">
      <table style="width:100%;font-size:11px">
        <thead><tr>
          <th class="tl">CUENTA</th><th class="tl">DESCRIPCIÓN</th>
          <th style="text-align:right">DEBE</th><th style="text-align:right">HABER</th>
        </tr></thead>
        <tbody>${e.movs.map(m=>`<tr>
          <td class="tl" style="font-family:var(--mono)">${m.cd} — ${m.nm||pdcNm(m.cd)}</td>
          <td class="tl" style="color:var(--mt)">${m.desc||''}</td>
          <td style="text-align:right;font-family:var(--mono)">${m.debe?fmtC(m.debe):'—'}</td>
          <td style="text-align:right;font-family:var(--mono)">${m.haber?fmtC(m.haber):'—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </td></tr>`;
  });

  h+=`<tfoot><tr>
    <td colspan="4" class="tl" style="font-weight:700">TOTALES</td>
    <td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(totD)}</td>
    <td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(totH)}</td>
    <td style="text-align:right;font-size:10px;color:${Math.abs(totD-totH)<1?'var(--ach)':'var(--err)'}">
      ${Math.abs(totD-totH)<1?'✓ cuadra':'⚠️ diff '+fmtC(Math.abs(totD-totH))}
    </td>
  </tr></tfoot>`;
  h+='</table></div></div>';

  cont.innerHTML=h;
}

function setCmpFiltro(campo,valor){
  CMP_FILTRO[campo]=valor;
  renderComprobantes();
}

function limpiarCmpFiltro(){
  CMP_FILTRO={mes:'',origen:'',texto:''};
  renderComprobantes();
}

function toggleCmpDet(id){
  const t=document.getElementById(id);
  if(!t)return;
  t.style.display=t.style.display==='none'?'':'none';
}

// Editar asiento manual desde Comprobantes: navega a Asientos y abre el editor.
function editarAsientoDesdeCmp(n){
  const a=S.asientos.find(x=>x.n===n);
  if(!a)return;
  nav('asientos');
  // pequeña espera para que la sección se muestre antes de abrir el editor
  setTimeout(()=>editarAsiento(a.id),50);
}

export {setCmpFiltro, limpiarCmpFiltro, toggleCmpDet, editarAsientoDesdeCmp};
