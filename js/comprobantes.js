// comprobantes.js — Vista unificada de asientos del libro diario
//
// A diferencia de "Asientos Manuales", que solo lista los que el usuario
// escribió a mano, esta vista muestra TODOS los asientos del libro diario:
// apertura, resúmenes automáticos de ventas/compras/honorarios, y manuales.
//
// Cada uno permite editarse: los manuales abren el editor de asientos, los
// automáticos llevan al origen (Libro de Ventas/Compras/Honorarios) para
// que se corrijan los documentos que los generaron.

import {fmtC, MESES, pdcNm, today, toast, rutFmt, dteV, dteC, rutParse, DTE_VENTAS, DTE_COMPRAS} from './core.js';
import {S} from './state.js';
import {nav, rerender} from './ui.js';
import {genDiario} from './reportes.js';
import {editarAsiento, proxFolioAsiento, CUENTAS_AUX} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {logAccion} from './firebase.js';

// Filtros
let CMP_FILTRO={mes:'',origen:'',texto:'',numero:''};

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

// Escapa comillas para poder meter el texto en un atributo title="…"
const attr=t=>String(t||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

let CMP_ENTRIES=[];        // cachea las entries actuales para el modal
let CMP_MODAL={mode:'view',idx:-1,edit:null};

export function renderComprobantes(){
  const cont=document.getElementById('comprobantes-content');
  if(!cont)return;

  // Barra de filtros: se pinta UNA sola vez. El input de texto no debe
  // destruirse en cada tecleo (oninput) o el cursor pierde el foco y hay que
  // volver a clicar para cada letra — por eso solo el contenido de abajo
  // (#cmp-body) se re-renderiza al filtrar.
  const barra=`<div class="filter-row" style="margin-bottom:14px;flex-wrap:wrap;align-items:flex-end">
    <span class="f-lbl">Filtrar:</span>
    <select id="cmp-mes-sel" onchange="setCmpFiltro('mes',this.value)">${mesOptsCmp()}</select>
    <select id="cmp-origen-sel" onchange="setCmpFiltro('origen',this.value)">
      <option value="">Todos los orígenes</option>
      <option value="apertura" ${CMP_FILTRO.origen==='apertura'?'selected':''}>🔰 Apertura</option>
      <option value="manual" ${CMP_FILTRO.origen==='manual'?'selected':''}>✏️ Manuales</option>
      <option value="auto" ${CMP_FILTRO.origen==='auto'?'selected':''}>⚙️ Todos automáticos</option>
      <option value="ventas" ${CMP_FILTRO.origen==='ventas'?'selected':''}>🛒 Auto ventas</option>
      <option value="compras" ${CMP_FILTRO.origen==='compras'?'selected':''}>🧾 Auto compras</option>
      <option value="honorarios" ${CMP_FILTRO.origen==='honorarios'?'selected':''}>📝 Auto honorarios</option>
      <option value="descuadrados" ${CMP_FILTRO.origen==='descuadrados'?'selected':''}>⚠️ Solo descuadrados</option>
    </select>
    <div style="position:relative;min-width:150px">
      <input type="text" id="cmp-num-input" inputmode="numeric" placeholder="N° comprobante…" autocomplete="off"
        value="${CMP_FILTRO.numero.replace(/"/g,'&quot;')}"
        oninput="cmpNumeroBuscar(this.value)"
        onfocus="cmpNumeroBuscar(this.value)"
        onblur="setTimeout(()=>renderCmpNumeroList([]),160)"
        style="width:100%">
      <div id="cmp-num-list" class="ac-lista" style="display:none;min-width:280px"></div>
    </div>
    <input type="text" id="cmp-texto-input" placeholder="Buscar por glosa o cuenta…" value="${CMP_FILTRO.texto.replace(/"/g,'&quot;')}"
      oninput="setCmpFiltro('texto',this.value)" style="min-width:180px">
    <button class="btn btn-g" onclick="limpiarCmpFiltro()">Limpiar</button>
    <span class="doc-count" id="cmp-count"></span>
  </div>`;

  cont.innerHTML=barra+'<div id="cmp-body"></div>';
  renderComprobantesBody();
}

// Re-renderiza SOLO el resultado (alerta + tabla), sin tocar la barra de
// filtros de arriba — así el input de búsqueda no pierde el foco al escribir.
function renderComprobantesBody(){
  const box=document.getElementById('cmp-body');
  if(!box)return;

  let entries=genDiario();

  // Filtros
  if(CMP_FILTRO.mes){
    const m=+CMP_FILTRO.mes;
    entries=entries.filter(e=>{
      const em=+String(e.fecha).slice(5,7);
      return em===m;
    });
  }
  // OJO: 'descuadrados' NO es un origen ni una fuente — es una condición sobre
  // los montos y se aplica más abajo. Si entra aquí, el filtro por fuente lo
  // vacía todo (ningún asiento tiene fuente:'descuadrados').
  if(CMP_FILTRO.origen&&CMP_FILTRO.origen!=='descuadrados'){
    entries=entries.filter(e=>{
      if(CMP_FILTRO.origen==='apertura')return e.origen==='apertura';
      if(CMP_FILTRO.origen==='manual')return e.origen==='manual';
      if(CMP_FILTRO.origen==='auto')return e.origen==='auto';
      // filtros por fuente
      return e.fuente===CMP_FILTRO.origen;
    });
  }
  if(CMP_FILTRO.texto){
    const t=CMP_FILTRO.texto.toLowerCase().trim();
    // Buscar también por N° de comprobante (folio) — coincidencia exacta o parcial
    entries=entries.filter(e=>{
      if(String(e.n||'').includes(t))return true;
      if((e.glosa||'').toLowerCase().includes(t))return true;
      return e.movs.some(m=>String(m.cd).includes(t)||(m.nm||'').toLowerCase().includes(t));
    });
  }
  if(CMP_FILTRO.numero){
    // Búsqueda EXACTA o "empieza con" del N° de comprobante
    const q=String(CMP_FILTRO.numero).trim();
    entries=entries.filter(e=>String(e.n||'').startsWith(q));
  }

  // Detectar comprobantes descuadrados (útil para el filtro y para la alerta)
  const cuadraE=e=>{
    const d=e.movs.reduce((s,m)=>s+(m.debe||0),0);
    const h=e.movs.reduce((s,m)=>s+(m.haber||0),0);
    return Math.abs(d-h)<1;
  };
  if(CMP_FILTRO.origen==='descuadrados'){
    entries=entries.filter(e=>!cuadraE(e));
  }
  const descuadres=(CMP_FILTRO.origen==='descuadrados'?entries:entries.filter(e=>!cuadraE(e)));

  // Resumen
  const totD=entries.reduce((s,e)=>s+e.movs.reduce((ss,m)=>ss+(m.debe||0),0),0);
  const totH=entries.reduce((s,e)=>s+e.movs.reduce((ss,m)=>ss+(m.haber||0),0),0);
  const cntAuto=entries.filter(e=>e.origen==='auto').length;
  const cntMan=entries.filter(e=>e.origen==='manual').length;
  const cntAp=entries.filter(e=>e.origen==='apertura').length;
  const totalFiltrado=entries.length;

  const cnt=document.getElementById('cmp-count');
  if(cnt)cnt.textContent=`${entries.length} comprobantes${cntAp?' · '+cntAp+' apertura':''}${cntAuto?' · '+cntAuto+' automáticos':''}${cntMan?' · '+cntMan+' manuales':''}`;

  // Panel de alerta cuando hay descuadres (y no estamos ya filtrando solo por ellos)
  let alerta='';
  if(descuadres.length&&CMP_FILTRO.origen!=='descuadrados'){
    alerta=`<div style="background:rgba(248,81,73,.08);border:1px solid var(--err);border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:16px">⚠️</span>
      <span style="font-weight:700;color:var(--err)">${descuadres.length} comprobante${descuadres.length===1?'':'s'} descuadrado${descuadres.length===1?'':'s'}</span>
      <span style="font-size:11px;color:var(--mt)">— revisa cada asiento y corrige el documento origen</span>
      <button class="btn btn-d" style="font-size:11px;margin-left:auto" onclick="setCmpFiltro('origen','descuadrados')">Ver solo descuadrados</button>
    </div>`;
  }

  let h=alerta;

  if(!entries.length){
    h+=`<div style="text-align:center;padding:40px;color:var(--mt)">
      <div style="font-size:36px;margin-bottom:8px">📖</div>
      No hay comprobantes que coincidan con los filtros
    </div>`;
    box.innerHTML=h;
    CMP_ENTRIES=[];
    return;
  }

  // Sin filtro activo: mostrar solo los últimos 5 (los más recientes) para no
  // cargar cientos de filas. Al buscar/filtrar se muestran todos los que
  // coincidan. genDiario viene ordenado ascendente, así que "últimos" = final.
  const hayFiltro=!!(CMP_FILTRO.mes||CMP_FILTRO.origen||CMP_FILTRO.texto||CMP_FILTRO.numero);
  const LIMITE_CMP=5;
  let ocultosCmp=0;
  if(!hayFiltro&&entries.length>LIMITE_CMP){
    ocultosCmp=entries.length-LIMITE_CMP;
    entries=entries.slice(-LIMITE_CMP);
  }
  if(ocultosCmp){
    h+=`<div style="background:rgba(88,166,255,.06);border:1px solid rgba(88,166,255,.25);color:var(--info);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px">
      📄 Mostrando los <strong>${LIMITE_CMP} más recientes</strong> de ${totalFiltrado}. Usa el buscador o los filtros para ver el resto.
    </div>`;
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
    const descuadrado=Math.abs(totED-totEH)>1;
    // Un ÚNICO atributo style: antes se emitían dos (`<tr style=".." style="..">`)
    // y el navegador se quedaba con el primero, perdiendo el cursor:pointer.
    // Los anulados no llegan hasta aquí: genDiario ya los excluye.
    const estiloFila=(descuadrado?'background:rgba(248,81,73,.05);':'')+'cursor:pointer';
    const estiloTotal=descuadrado?'color:var(--err);font-weight:700':'font-family:var(--mono)';
    const badgeDescuadre=descuadrado
      ?` <span style="background:rgba(248,81,73,.15);color:var(--err);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px">⚠ DESCUADRE ${fmtC(Math.abs(totED-totEH))}</span>`
      :'';

    // Acción según origen — si hay descuadre, ir directo al documento
    let btnEditar;
    if(e.origen==='manual'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="editarAsientoDesdeCmp(${e.ref})" title="Editar asiento manual">✏️ ${descuadrado?'Corregir':'Editar'}</button>`;
    }else if(e.origen==='apertura'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('apertura')" title="Ir a Balance de Apertura">🔰 ${descuadrado?'Corregir':'Abrir'}</button>`;
    }else if(e.fuente==='ventas'){
      const accion=e.docId?`corregirCmp('ventas','${e.docId}')`:`nav('ventas')`;
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="${accion}" title="Editar el documento">🛒 ${descuadrado?'Corregir':'Al doc'}</button>`;
    }else if(e.fuente==='compras'){
      const accion=e.docId?`corregirCmp('compras','${e.docId}')`:`nav('compras')`;
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="${accion}" title="Editar el documento">🧾 ${descuadrado?'Corregir':'Al doc'}</button>`;
    }else if(e.fuente==='honorarios'){
      btnEditar=`<button class="btn btn-i" style="font-size:10px" onclick="nav('honorarios')" title="Ir al libro de honorarios">📝 ${descuadrado?'Corregir':'Al libro'}</button>`;
    }else{
      btnEditar='';
    }

    // Toda la fila abre el modal de vista/edición del comprobante
    // (el índice del array `entries` va como referencia)
    h+=`<tr style="${estiloFila}" onclick="abrirCmpModal(${i})">
      <td class="tl" style="font-family:var(--mono);font-weight:600">${e.n}</td>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${e.fecha}</td>
      <td class="tl">
        <span style="display:inline-flex;align-items:center;gap:4px;background:${o.c}22;color:${o.c};padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600">${o.ic} ${o.nm}</span>
      </td>
      <td class="tl">
        ${e.glosa||''}${badgeDescuadre}
        <span style="font-size:10px;color:var(--mt);margin-left:6px">▸ ${e.movs.length} línea${e.movs.length===1?'':'s'}</span>
      </td>
      <td style="text-align:right;${estiloTotal}">${fmtC(totED)}</td>
      <td style="text-align:right;${estiloTotal}">${fmtC(totEH)}</td>
      <td style="text-align:right;white-space:nowrap" onclick="event.stopPropagation()">${btnEditar}</td>
    </tr>`;
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

  box.innerHTML=h;
  CMP_ENTRIES=entries;
}

function setCmpFiltro(campo,valor){
  CMP_FILTRO[campo]=valor;
  renderComprobantesBody();
}

// Búsqueda dinámica por N° de comprobante: filtra los entries del año actual
// que empiecen con el número tipeado y muestra una lista dropdown.
function cmpNumeroBuscar(q){
  const box=document.getElementById('cmp-num-list');
  if(!box)return;
  const qs=String(q||'').trim();
  if(!qs){
    // Sin query: limpiar el filtro y ocultar la lista. Se re-renderiza SOLO el
    // cuerpo, nunca la barra: repintarla destruiría este mismo input y el
    // usuario perdería el foco justo mientras borra (crítico en móvil).
    renderCmpNumeroList([]);
    if(CMP_FILTRO.numero){
      CMP_FILTRO.numero='';
      renderComprobantesBody();
    }
    return;
  }
  // Universo COMPLETO de comprobantes del año: sin filtro activo, CMP_ENTRIES
  // solo cachea los 5 más recientes, así que buscar ahí dejaba fuera todo lo
  // anterior y el desplegable salía vacío.
  const filtrados=genDiario().filter(e=>String(e.n||'').startsWith(qs)).slice(0,15);
  renderCmpNumeroList(filtrados);
}

function renderCmpNumeroList(items){
  const box=document.getElementById('cmp-num-list');
  if(!box)return;
  if(!items.length){box.style.display='none';box.innerHTML='';return;}
  box.innerHTML=items.map(e=>`
    <div class="ac-item" onmousedown="cmpNumeroElegir(${e.n})">
      <span style="font-family:var(--mono);color:var(--info);font-weight:700">N°${e.n}</span>
      <span style="margin-left:8px;color:var(--mt);font-size:11px">${e.fecha}</span>
      <span style="margin-left:8px">${(e.glosa||'').slice(0,50)}</span>
    </div>`).join('');
  box.style.display='block';
}

function cmpNumeroElegir(n){
  CMP_FILTRO.numero=String(n);
  CMP_FILTRO.mes=''; CMP_FILTRO.origen=''; CMP_FILTRO.texto='';
  const box=document.getElementById('cmp-num-list');
  if(box){box.style.display='none';box.innerHTML='';}
  // Se eligió desde la lista (clic), no se está tecleando texto: sí conviene
  // repintar la barra completa para reflejar mes/origen/texto en blanco.
  renderComprobantes();
  // Auto-abrir el modal del comprobante elegido
  const idx=(CMP_ENTRIES||[]).findIndex(e=>+e.n===+n);
  if(idx>=0)setTimeout(()=>abrirCmpModal(idx),100);
}

// ── Abrir el comprobante de un registro cualquiera ──
// Lo usa el buscador global: da lo mismo si el resultado es una factura, un
// asiento manual o la apertura — lo que interesa es ver su comprobante.
//
// Se resuelve a través del N° y se reutiliza `cmpNumeroElegir`, porque sin
// filtro la lista sólo cachea los 5 comprobantes más recientes y el buscado
// podría no estar entre ellos.
function abrirComprobantePor(criterio){
  const entries=genDiario();
  const e=entries.find(x=>{
    if(criterio.docId)return x.docId===criterio.docId;
    if(criterio.asientoN!=null)return x.origen==='manual'&&+x.ref===+criterio.asientoN;
    if(criterio.apertura)return x.origen==='apertura';
    if(criterio.honorariosMes!=null)return x.fuente==='honorarios'&&+x.mes===+criterio.honorariosMes;
    return false;
  });
  if(!e)return false;
  nav('comprobantes');
  // Un respiro para que la sección esté visible antes de abrir el modal
  setTimeout(()=>cmpNumeroElegir(e.n),60);
  return true;
}

function limpiarCmpFiltro(){
  CMP_FILTRO={mes:'',origen:'',texto:'',numero:''};
  renderCmpNumeroList([]);
  renderComprobantes();
}

// Editar asiento manual desde Comprobantes: navega a Asientos y abre el editor.
function editarAsientoDesdeCmp(n){
  const a=S.asientos.find(x=>x.n===n);
  if(!a)return;
  nav('asientos');
  // pequeña espera para que la sección se muestre antes de abrir el editor
  setTimeout(()=>editarAsiento(a.id),50);
}

// Va al documento origen de un asiento automático (ventas/compras) para editarlo.
function corregirCmp(fuente,docId){
  if(!docId){nav(fuente);return;}
  nav(fuente);
  setTimeout(()=>{
    try{
      if(fuente==='compras'&&window.editarCompra)window.editarCompra(docId);
      else if(fuente==='ventas'&&window.editarVenta)window.editarVenta(docId);
    }catch(e){}
  },80);
}

// ═══ MODAL VER / EDITAR COMPROBANTE ═══
//
// Al clicar cualquier fila, se abre este modal en modo VER. Muestra el asiento
// completo (glosa, N°, fecha, movimientos con debe/haber).
//
// Botón "Editar" conmuta a modo EDITAR:
//   - Manuales: se editan directamente, guardando de vuelta en S.asientos.
//   - Automáticos (compras/ventas): se convierten a manual en el momento.
//     Esto crea un asiento manual con las líneas actuales que reemplaza al
//     resumen automático de ese documento (se marca el documento con
//     `excluidoAuto:true` para que genDiario ya no lo agregue automáticamente).
//   - Apertura: se edita directamente el S.apertura.
//
// El guardado exige cuadratura de partida doble (Debe = Haber, diferencia < 1).

function abrirCmpModal(idx){
  const e=CMP_ENTRIES[idx];
  if(!e)return;
  CMP_MODAL={mode:'view',idx,edit:null};
  document.getElementById('cmp-modal').classList.add('open');
  renderCmpModal();
}

function cerrarCmpModal(){
  document.getElementById('cmp-modal').classList.remove('open');
  CMP_MODAL={mode:'view',idx:-1,edit:null};
}

function renderCmpModal(){
  const box=document.getElementById('cmp-modal-body');
  if(!box)return;
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e)return;
  const o=origenLbl(e);

  if(CMP_MODAL.mode==='view')renderCmpModalView(box,e,o);
  else renderCmpModalEdit(box,e,o);
}

function renderCmpModalView(box,e,o){
  const totD=e.movs.reduce((s,m)=>s+(m.debe||0),0);
  const totH=e.movs.reduce((s,m)=>s+(m.haber||0),0);
  const cuadra=Math.abs(totD-totH)<1;
  const editable=e.origen==='manual'||e.origen==='apertura'||e.fuente==='compras'||e.fuente==='ventas';

  box.innerHTML=`
    <div style="padding:16px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:6px;background:${o.c}22;color:${o.c};padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700">${o.ic} ${o.nm}</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--mt)">N° ${e.n} · ${e.fecha}</span>
        ${!cuadra?`<span style="background:rgba(248,81,73,.15);color:var(--err);padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700">⚠ DESCUADRE ${fmtC(Math.abs(totD-totH))}</span>`:''}
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:14px">${e.glosa||'(sin glosa)'}</div>

      <div class="cmp-tbl-wrap">
      <table class="tbl-cmp">
        <thead><tr style="border-bottom:1px solid var(--bd);color:var(--mt);text-transform:uppercase;font-size:10px">
          <th class="tl">CÓDIGO</th>
          <th class="tl">CUENTA</th>
          <th class="tl">DESCRIPCIÓN</th>
          <th style="text-align:right">DEBE</th>
          <th style="text-align:right">HABER</th>
        </tr></thead>
        <tbody>${e.movs.map(m=>{
          const desc=m.desc||'';
          return `<tr style="border-bottom:1px solid rgba(48,54,61,.5)">
          <td class="tl c-cod">${m.cd}</td>
          <td class="tl c-cta">${m.nm||pdcNm(m.cd)}</td>
          <td class="tl c-desc" title="${attr(desc)}">${desc||'—'}</td>
          <td class="c-num">${m.debe?fmtC(m.debe):'—'}</td>
          <td class="c-num">${m.haber?fmtC(m.haber):'—'}</td>
        </tr>`;}).join('')}</tbody>
        <tfoot><tr style="background:var(--sf2);font-weight:700">
          <td colspan="3" class="tl">TOTALES</td>
          <td class="c-num" style="color:${cuadra?'var(--tx)':'var(--err)'}">${fmtC(totD)}</td>
          <td class="c-num" style="color:${cuadra?'var(--tx)':'var(--err)'}">${fmtC(totH)}</td>
        </tr></tfoot>
      </table>
      </div>

      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${borrable(e)?`<button class="btn btn-d" onclick="eliminarComprobante()">🗑 Eliminar</button>`:''}
          ${e.origen==='manual'?`<button class="btn btn-g" onclick="anularComprobante()" title="Mantiene el N° correlativo pero excluye sus efectos">🚫 Anular</button>`:''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-g" onclick="cerrarCmpModal()">Cerrar</button>
          ${editable?`<button class="btn btn-p" onclick="cmpModalEditar()">✏️ Editar</button>`:''}
        </div>
      </div>
    </div>`;
}

// ── Eliminar comprobante ──
// Un comprobante automático NO existe como registro propio: es el reflejo
// contable de un documento del libro. Por eso "eliminar" significa cosas
// distintas según el origen, y el diálogo lo dice con todas sus letras.
//
// Honorarios queda fuera: su comprobante resume TODAS las boletas del mes, así
// que no hay un documento único que borrar — se manda al libro correspondiente.
function borrable(e){
  if(e.origen==='manual'||e.origen==='apertura')return true;
  return e.origen==='auto'&&(e.fuente==='ventas'||e.fuente==='compras')&&!!e.docId;
}

function eliminarComprobante(){
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e)return;

  // ── Manual ──
  if(e.origen==='manual'){
    const a=S.asientos.find(x=>x.n===e.ref)||S.asientos.find(x=>x.folioComp===e.n);
    if(!a){toast('⚠️ No se encontró el asiento de origen','e');return;}
    if(!confirm(
      `¿Eliminar el asiento manual N°${a.n}?\n\n`+
      `"${a.glosa||'(sin glosa)'}"\n\n`+
      `El N° ${a.n} queda libre y el correlativo pierde continuidad.\n`+
      `Si lo que quieres es dejar constancia, usa "Anular" en vez de eliminar.\n\n`+
      `Esta acción no se puede deshacer.`))return;
    S.asientos=S.asientos.filter(x=>x!==a);
    window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
    logAccion('Eliminó asiento',`N°${a.n} — ${a.glosa}`);
    cerrarCmpModal();rerender();toast('🗑 Asiento eliminado');
    return;
  }

  // ── Apertura ──
  if(e.origen==='apertura'){
    if(!confirm(
      `¿Eliminar el Balance de Apertura ${S.empresa.anio}?\n\n`+
      `Es el asiento N°0 del ejercicio: se van sus ${e.movs.length} líneas y con ellas\n`+
      `los saldos iniciales del Mayor, el Balance y los auxiliares.\n\n`+
      `Esta acción no se puede deshacer.`))return;
    S.apertura=null;
    window.storage.delete('apertura-'+S.empresa.anio).catch(()=>{});
    logAccion('Eliminó apertura',`Ejercicio ${S.empresa.anio}`);
    cerrarCmpModal();rerender();toast('🗑 Balance de apertura eliminado');
    return;
  }

  // ── Automático de ventas o compras: se borra el DOCUMENTO ──
  if(e.origen==='auto'&&(e.fuente==='ventas'||e.fuente==='compras')&&e.docId){
    const esVenta=e.fuente==='ventas';
    const lista=esVenta?S.ventas:S.compras;
    const d=lista.find(x=>x.id===e.docId);
    if(!d){toast('⚠️ No se encontró el documento de origen','e');return;}
    const libro=esVenta?'Libro de Ventas':'Libro de Compras';
    if(!confirm(
      `Este comprobante es automático: lo genera un documento del ${libro}.\n\n`+
      `Para que desaparezca hay que eliminar el documento que lo origina:\n\n`+
      `   ${esVenta?dteV(d.tipoDTE)?.nm||'DTE '+d.tipoDTE:dteC(d.tipoDTE)?.nm||'DTE '+d.tipoDTE} N°${d.numero}\n`+
      `   ${d.razonSocial||''}\n`+
      `   ${fmtC(d.total||0)}\n\n`+
      `Se borra del ${libro} y de todos los reportes.\n`+
      `Esta acción no se puede deshacer.`))return;
    if(esVenta){
      S.ventas=S.ventas.filter(x=>x.id!==e.docId);
      window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas)).catch(()=>{});
    }else{
      S.compras=S.compras.filter(x=>x.id!==e.docId);
      window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).catch(()=>{});
    }
    logAccion('Eliminó documento',`${libro} — N°${d.numero} ${d.razonSocial||''}`);
    cerrarCmpModal();rerender();toast('🗑 Documento eliminado — el comprobante ya no se genera');
    return;
  }

  toast('⚠️ Este comprobante no se puede eliminar desde aquí','e');
}

// Anular deja el N° en su sitio y excluye los efectos: es lo correcto en
// contabilidad, donde el correlativo no debería tener huecos.
function anularComprobante(){
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e||e.origen!=='manual')return;
  const a=S.asientos.find(x=>x.n===e.ref)||S.asientos.find(x=>x.folioComp===e.n);
  if(!a){toast('⚠️ No se encontró el asiento de origen','e');return;}
  if(!confirm(
    `¿Anular el asiento N°${a.n}?\n\n`+
    `"${a.glosa||'(sin glosa)'}"\n\n`+
    `NO borra el N° ${a.n} — el correlativo queda intacto — pero sus montos\n`+
    `dejan de sumar en el Mayor, el Balance y los auxiliares.\n\n`+
    `Como el libro diario excluye los anulados, el comprobante deja de\n`+
    `aparecer en esta lista. Queda visible y se puede reactivar desde\n`+
    `"Asientos Manuales".`))return;
  a.anulado=true;
  window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
  logAccion('Anuló asiento',`N°${a.n} — ${a.glosa}`);
  cerrarCmpModal();rerender();
  toast('🚫 Asiento N°'+a.n+' anulado — reactivable desde Asientos Manuales');
}

function renderCmpModalEdit(box,e,o){
  const ed=CMP_MODAL.edit;
  const totD=ed.movs.reduce((s,m)=>s+(+m.debe||0),0);
  const totH=ed.movs.reduce((s,m)=>s+(+m.haber||0),0);
  const dif=totD-totH;
  const cuadra=Math.abs(dif)<1;

  const filas=ed.movs.map((m,i)=>{
    const busc=inputCuenta({
      id:`cmp-ed-cd-${i}`,
      value:m.cd||'',
      onPick:`setCmpEdCuenta(${i},'%CD%')`,
      placeholder:'Buscar cuenta…',
      clase:'linea-inp',
    });
    // Si la cuenta maneja auxiliar (proveedor / cliente / honorario),
    // mostramos un resumen de los datos DTE ya asociados y un botón para
    // editarlos en un modal aparte.
    const aux=m.cd?CUENTAS_AUX[m.cd]:'';
    let dteBloque='';
    if(aux){
      const d=m.dte||{};
      const dteInfo=aux==='cliente'?dteV(d.tipoDTE):dteC(d.tipoDTE);
      const dteNm=dteInfo?.nm||(d.tipoDTE?`DTE ${d.tipoDTE}`:'sin definir');
      const tieneDatos=d.rutCodigo&&d.numero;
      dteBloque=`<div style="margin-top:4px;padding:6px 8px;background:${tieneDatos?'rgba(88,166,255,.06)':'rgba(255,193,7,.08)'};border:1px solid ${tieneDatos?'rgba(88,166,255,.3)':'rgba(255,193,7,.35)'};border-radius:4px;font-size:10px">
        ${tieneDatos
          ? `<span style="color:var(--info);font-weight:600">📄 ${dteNm} N°${d.numero||'?'}</span> · ${d.fecha||''} · ${d.rutCodigo?rutFmt(d.rutCodigo,d.rutDV):''} · ${d.razonSocial||''}${d.total?` · <b>${fmtC(d.total)}</b>`:''}`
          : `<span style="color:var(--warn)">⚠️ Falta ${aux==='cliente'?'datos del cliente':aux==='proveedor'?'datos del proveedor':'datos del honorario'}</span>`}
        <button class="btn btn-i" style="padding:2px 8px;font-size:10px;margin-left:8px" onclick="abrirCmpEdDte(${i})">${tieneDatos?'✏️ Editar':'+ Agregar'} datos</button>
      </div>`;
    }
    return `<tr>
      <td style="padding:4px 6px">${busc}${dteBloque}</td>
      <td style="padding:4px 6px"><input type="text" class="linea-inp" placeholder="Descripción"
        value="${(m.desc||'').replace(/"/g,'&quot;')}" oninput="setCmpEdCampo(${i},'desc',this.value)"></td>
      <td style="padding:4px 6px"><input type="text" class="linea-num-inp" inputmode="numeric" placeholder="0"
        value="${m.debe?new Intl.NumberFormat('es-CL').format(Math.round(m.debe)):''}"
        oninput="setCmpEdMonto(${i},'debe',this)" onblur="setCmpEdMontoBlur(${i},'debe',this)" onfocus="this.select()"></td>
      <td style="padding:4px 6px"><input type="text" class="linea-num-inp" inputmode="numeric" placeholder="0"
        value="${m.haber?new Intl.NumberFormat('es-CL').format(Math.round(m.haber)):''}"
        oninput="setCmpEdMonto(${i},'haber',this)" onblur="setCmpEdMontoBlur(${i},'haber',this)" onfocus="this.select()"></td>
      <td style="padding:4px 6px;text-align:center">
        <button class="btn btn-d" style="padding:3px 8px;font-size:10px" onclick="delCmpEdLinea(${i})" ${ed.movs.length<=2?'disabled':''}>✕</button>
      </td>
    </tr>`;
  }).join('');

  const infoOrigen=(e.origen==='auto')
    ? `<div style="background:rgba(255,193,7,.08);border:1px solid rgba(255,193,7,.35);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:var(--tx)">
        ⚠️ Este comprobante es <strong>automático</strong> (generado desde ${e.fuente==='ventas'?'Libro de Ventas':e.fuente==='compras'?'Libro de Compras':'un libro'}).
        Si guardas los cambios se creará un asiento manual que <strong>reemplazará</strong> al automático de ese documento — el documento origen queda excluido de la generación automática.
      </div>`
    : '';

  box.innerHTML=`
    <div style="padding:16px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:6px;background:${o.c}22;color:${o.c};padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700">${o.ic} ${o.nm}</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--mt)">N° ${e.n} · ${e.fecha}</span>
        <span style="background:rgba(88,166,255,.15);color:var(--info);padding:2px 8px;border-radius:3px;font-size:10px;font-weight:600">MODO EDICIÓN</span>
      </div>

      ${infoOrigen}

      <div style="margin-bottom:14px;display:grid;grid-template-columns:1fr 140px;gap:10px">
        <div>
          <label style="font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Glosa</label>
          <input type="text" id="cmp-ed-glosa" style="width:100%;padding:6px 10px;margin-top:4px" value="${(ed.glosa||'').replace(/"/g,'&quot;')}" oninput="setCmpEdGlosa(this.value)">
        </div>
        <div>
          <label style="font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Fecha</label>
          <input type="date" id="cmp-ed-fecha" style="width:100%;padding:6px 10px;margin-top:4px" value="${ed.fecha||''}" oninput="setCmpEdFecha(this.value)">
        </div>
      </div>

      <table style="width:100%;font-size:12px;table-layout:fixed">
        <colgroup><col style="width:30%"><col><col style="width:84px"><col style="width:84px"><col style="width:30px"></colgroup>
        <thead><tr style="border-bottom:1px solid var(--bd);color:var(--mt);text-transform:uppercase;font-size:10px">
          <th class="tl" style="padding:6px">CUENTA</th>
          <th class="tl" style="padding:6px">DESCRIPCIÓN</th>
          <th class="tl" style="padding:6px">DEBE</th>
          <th class="tl" style="padding:6px">HABER</th>
          <th></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-i" onclick="addCmpEdLinea()">+ Agregar línea</button>
        <div data-cuadre-bar style="flex:1;padding:6px 12px;border-radius:6px;background:${cuadra?'rgba(46,160,67,.08)':'rgba(248,81,73,.08)'};border:1px solid ${cuadra?'var(--ach)':'var(--err)'};display:flex;gap:16px;font-size:12px;font-weight:600">
          <span>DEBE <span style="font-family:var(--mono)">${fmtC(totD)}</span></span>
          <span>HABER <span style="font-family:var(--mono)">${fmtC(totH)}</span></span>
          <span style="color:${cuadra?'var(--ach)':'var(--err)'};margin-left:auto">${cuadra?'✅ Cuadrado':'⚠️ Diferencia '+fmtC(Math.abs(dif))}</span>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cmpModalCancelar()">Cancelar</button>
        <button data-btn-guardar class="btn ${cuadra?'btn-p':'btn-w'}" onclick="cmpModalGuardar()" title="${cuadra?'Guardar cambios':'Guardar pese al descuadre (aparecerá en el reporte de descuadres)'}">
          💾 ${cuadra?'Guardar cambios':'Guardar (descuadra)'}
        </button>
      </div>
    </div>`;
}

function cmpModalEditar(){
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e)return;
  CMP_MODAL.mode='edit';

  // Si el comprobante viene de un doc de compras/ventas, buscamos ese doc
  // para pre-poblar los datos DTE en la línea del auxiliar (proveedor/cliente).
  let docOrigen=null;
  if(e.docId&&(e.fuente==='compras'||e.fuente==='ventas')){
    const arr=e.fuente==='compras'?S.compras:S.ventas;
    docOrigen=arr.find(x=>x.id===e.docId);
  }

  CMP_MODAL.edit={
    glosa:e.glosa||'',
    fecha:e.fecha||today(),
    movs:e.movs.map(m=>{
      const linea={
        cd:m.cd||'',
        nm:m.nm||pdcNm(m.cd)||'',
        desc:m.desc||'',
        debe:+m.debe||0,
        haber:+m.haber||0,
      };
      // Si la cuenta es auxiliar y hay un doc origen, poblar los datos DTE
      const aux=m.cd?CUENTAS_AUX[m.cd]:'';
      if(aux&&docOrigen&&(aux==='proveedor'||aux==='cliente')){
        linea.dte={
          fecha:docOrigen.fecha||e.fecha,
          fechaVencimiento:docOrigen.fechaVencimiento||'',
          tipoDTE:docOrigen.tipoDTE,
          numero:docOrigen.numero,
          rutCodigo:docOrigen.rutCodigo,
          rutDV:docOrigen.rutDV,
          razonSocial:docOrigen.razonSocial,
          neto:docOrigen.neto||0,
          exento:docOrigen.exento||0,
          iva:docOrigen.iva||0,
          otrosImpuestos:docOrigen.otrosImpuestos||0,
          retencion:docOrigen.retencion||0,
          total:docOrigen.total||0,
        };
      }
      // Preservar los datos DTE si ya venían en el mov (asientos manuales)
      if(m.dte)linea.dte={...linea.dte,...m.dte};
      // Preservar campos que traía el mov original
      if(m.rutCodigo&&!linea.dte){
        linea.dte={
          fecha:e.fecha,tipoDTE:m.tipoDTE,numero:m.folio,
          rutCodigo:m.rutCodigo,rutDV:m.rutDV,
        };
      }
      return linea;
    }),
  };
  // Asegurar al menos 2 líneas
  while(CMP_MODAL.edit.movs.length<2)CMP_MODAL.edit.movs.push({cd:'',nm:'',desc:'',debe:0,haber:0});
  renderCmpModal();
}

function cmpModalCancelar(){
  if(confirm('¿Descartar los cambios sin guardar?')){
    CMP_MODAL.mode='view';
    CMP_MODAL.edit=null;
    renderCmpModal();
  }
}

function setCmpEdGlosa(v){CMP_MODAL.edit.glosa=v;}
function setCmpEdFecha(v){CMP_MODAL.edit.fecha=v;}
function setCmpEdCuenta(i,cd){
  if(!CMP_MODAL.edit.movs[i])return;
  CMP_MODAL.edit.movs[i].cd=cd;
  CMP_MODAL.edit.movs[i].nm=pdcNm(cd);
  renderCmpModal();
}
function setCmpEdCampo(i,campo,v){
  if(!CMP_MODAL.edit.movs[i])return;
  const m=CMP_MODAL.edit.movs[i];
  if(campo==='debe'||campo==='haber'){
    m[campo]=+v||0;
    // Débito y crédito son excluyentes por línea
    if(campo==='debe'&&+v)m.haber=0;
    if(campo==='haber'&&+v)m.debe=0;
    renderCmpModal();   // re-render para actualizar cuadratura
  }else{
    m[campo]=v;
  }
}

// Setter para inputs con formato de miles: reformatea al vuelo sin perder foco.
// No re-renderiza el modal completo (para no perder el foco del input); solo
// actualiza los totales de cuadratura en la barra inferior.
function setCmpEdMonto(i,campo,inp){
  if(!CMP_MODAL.edit.movs[i])return;
  const raw=String(inp.value||'').replace(/[^\d]/g,'');
  const num=+raw||0;
  const m=CMP_MODAL.edit.movs[i];
  m[campo]=num;
  // Excluyente: si escribe debe, limpia haber (y viceversa)
  if(campo==='debe'&&num>0)m.haber=0;
  if(campo==='haber'&&num>0)m.debe=0;
  // Reformatear con miles conservando el cursor al final si allí está.
  const formatted=num?new Intl.NumberFormat('es-CL').format(num):'';
  const posEnd=inp.selectionStart===inp.value.length;
  if(inp.value!==formatted){
    inp.value=formatted;
    if(posEnd)try{inp.setSelectionRange(formatted.length,formatted.length);}catch(e){}
  }
  // Actualizar la barra de cuadratura sin re-renderizar todo el modal
  actualizarBarraCuadre();
}

function setCmpEdMontoBlur(i,campo,inp){
  if(!CMP_MODAL.edit.movs[i])return;
  const num=+CMP_MODAL.edit.movs[i][campo]||0;
  inp.value=num?new Intl.NumberFormat('es-CL').format(num):'';
  // Al perder foco es buen momento de re-renderizar para reflejar cualquier
  // limpieza de la pareja debe/haber en el otro input.
  renderCmpModal();
}

// Actualiza solo la barra de cuadratura (Debe / Haber / Diferencia) del modal
// de edición, sin volver a renderizar toda la vista. Se usa mientras el usuario
// escribe montos, para no perder el foco del input.
function actualizarBarraCuadre(){
  const ed=CMP_MODAL.edit;
  if(!ed)return;
  const box=document.getElementById('cmp-modal-body');
  if(!box)return;
  const totD=ed.movs.reduce((s,m)=>s+(+m.debe||0),0);
  const totH=ed.movs.reduce((s,m)=>s+(+m.haber||0),0);
  const dif=totD-totH;
  const cuadra=Math.abs(dif)<1;
  const barra=box.querySelector('[data-cuadre-bar]');
  if(barra){
    barra.style.background=cuadra?'rgba(46,160,67,.08)':'rgba(248,81,73,.08)';
    barra.style.borderColor=cuadra?'var(--ach)':'var(--err)';
    barra.innerHTML=`
      <span>DEBE <span style="font-family:var(--mono)">${fmtC(totD)}</span></span>
      <span>HABER <span style="font-family:var(--mono)">${fmtC(totH)}</span></span>
      <span style="color:${cuadra?'var(--ach)':'var(--err)'};margin-left:auto">${cuadra?'✅ Cuadrado':'⚠️ Diferencia '+fmtC(Math.abs(dif))}</span>`;
  }
  // Actualizar botón guardar
  const btnG=box.querySelector('[data-btn-guardar]');
  if(btnG){
    btnG.className='btn '+(cuadra?'btn-p':'btn-w');
    btnG.textContent=cuadra?'💾 Guardar cambios':'💾 Guardar (descuadra)';
    btnG.title=cuadra?'Guardar cambios':'Guardar pese al descuadre';
  }
}
function addCmpEdLinea(){
  CMP_MODAL.edit.movs.push({cd:'',nm:'',desc:'',debe:0,haber:0});
  renderCmpModal();
}
function delCmpEdLinea(i){
  if(CMP_MODAL.edit.movs.length<=2)return;   // mínimo 2 líneas (partida doble)
  CMP_MODAL.edit.movs.splice(i,1);
  renderCmpModal();
}

async function cmpModalGuardar(){
  const ed=CMP_MODAL.edit;
  if(!ed)return;
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e)return;

  // Validación de cuadratura: si descuadra, pedir confirmación en vez de rechazar.
  // Esto permite guardar en pasos intermedios mientras se corrige la distribución
  // o los datos DTE, sin perder los cambios hechos.
  const totD=ed.movs.reduce((s,m)=>s+(+m.debe||0),0);
  const totH=ed.movs.reduce((s,m)=>s+(+m.haber||0),0);
  const dif=totD-totH;
  if(Math.abs(dif)>1){
    const conf=confirm(
      `⚠️ El asiento no cuadra:\n\n`+
      `  DEBE:  ${new Intl.NumberFormat('es-CL').format(Math.round(totD))}\n`+
      `  HABER: ${new Intl.NumberFormat('es-CL').format(Math.round(totH))}\n`+
      `  DIFERENCIA: ${new Intl.NumberFormat('es-CL').format(Math.abs(Math.round(dif)))}\n\n`+
      `¿Guardar de todas formas? Aparecerá en el reporte de descuadres del libro diario y podrás corregirlo después.`
    );
    if(!conf)return;
  }
  // Requerir cuenta en todas las líneas con monto
  const sinCuenta=ed.movs.filter(m=>(m.debe||m.haber)&&!m.cd);
  if(sinCuenta.length){
    toast(`⚠️ ${sinCuenta.length} línea${sinCuenta.length===1?'':'s'} sin cuenta asignada`,'e');
    return;
  }
  // Filtrar líneas vacías (preservando los datos DTE en cuentas auxiliares)
  const movsClean=ed.movs.filter(m=>m.cd&&(m.debe||m.haber)).map(m=>{
    const mv={
      cd:m.cd, nm:pdcNm(m.cd), desc:m.desc||'',
      debe:+m.debe||0, haber:+m.haber||0,
    };
    if(m.dte)mv.dte=m.dte;
    return mv;
  });
  if(movsClean.length<2){
    toast('⚠️ El asiento debe tener al menos 2 líneas con monto','e');
    return;
  }

  if(e.origen==='manual'){
    // Editar el asiento manual existente
    const a=S.asientos.find(x=>x.n===e.ref);
    if(!a){toast('❌ No se encontró el asiento manual','e');return;}
    a.glosa=ed.glosa;
    a.fecha=ed.fecha;
    a.movs=movsClean;
    await window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
    logAccion('Editó asiento manual desde Comprobantes',`N°${e.n} · ${ed.glosa}`);
    toast(`✅ Asiento N°${e.n} actualizado`);
  }else if(e.origen==='apertura'){
    // Editar el balance de apertura
    if(!S.apertura)S.apertura={};
    S.apertura.glosa=ed.glosa;
    S.apertura.fecha=ed.fecha;
    S.apertura.movs=movsClean;
    await window.storage.set('apertura-'+S.empresa.anio,JSON.stringify(S.apertura)).catch(()=>{});
    logAccion('Editó balance de apertura desde Comprobantes',ed.glosa);
    toast('✅ Balance de apertura actualizado');
  }else if(e.fuente==='compras'||e.fuente==='ventas'){
    // Convertir asiento automático a manual: crea un asiento manual con las
    // líneas actuales y marca el documento origen como excluido de la generación
    // automática (excluidoAuto:true). El resumen agregado del mes ya no lo tomará.
    const arr=e.fuente==='compras'?S.compras:S.ventas;
    const doc=arr.find(x=>x.id===e.docId);
    if(doc){
      doc.excluidoAuto=true;
      // Si el usuario editó los datos DTE en alguna línea auxiliar, propagar
      // esos cambios al documento origen para mantener consistencia con el
      // libro de compras/ventas y auxiliares.
      const movAux=movsClean.find(m=>m.dte&&m.dte.rutCodigo);
      if(movAux){
        const d=movAux.dte;
        if(d.fecha)doc.fecha=d.fecha;
        if(d.fechaVencimiento)doc.fechaVencimiento=d.fechaVencimiento;
        if(d.tipoDTE)doc.tipoDTE=+d.tipoDTE;
        if(d.numero)doc.numero=String(d.numero);
        if(d.rutCodigo)doc.rutCodigo=d.rutCodigo;
        if(d.rutDV)doc.rutDV=d.rutDV;
        if(d.razonSocial)doc.razonSocial=d.razonSocial;
        if(d.neto!==undefined)doc.neto=+d.neto||0;
        if(d.exento!==undefined)doc.exento=+d.exento||0;
        if(d.iva!==undefined)doc.iva=+d.iva||0;
        if(d.otrosImpuestos!==undefined)doc.otrosImpuestos=+d.otrosImpuestos||0;
        if(d.total!==undefined)doc.total=+d.total||0;
      }
    }
    // Crear asiento manual
    if(!S.asientos)S.asientos=[];
    const n=proxFolioAsiento();
    S.asientos.push({
      id:'a_'+Date.now(),
      n,
      fecha:ed.fecha,
      glosa:ed.glosa,
      movs:movsClean,
      referenciaDoc:{fuente:e.fuente,docId:e.docId,tipoDTE:e.tipoDTE,folio:e.folio,rutCodigo:e.rutCodigo},
    });
    // Guardar
    if(doc)await window.storage.set(e.fuente+'-'+S.empresa.anio,JSON.stringify(arr)).catch(()=>{});
    await window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
    logAccion(`Convertió comprobante auto (${e.fuente}) a manual`,`${e.glosa} → asiento N°${n}`);
    toast(`✅ Comprobante convertido a asiento manual N°${n}`);
  }
  cerrarCmpModal();
  rerender();
}

// ═══ MODAL DE DATOS DTE PARA LÍNEA AUXILIAR ═══
//
// Cuando en el editor de comprobantes hay una línea con cuenta auxiliar
// (proveedor / cliente / honorario), este modal permite editar todos los
// campos del documento asociado: fecha, RUT, razón social, tipo DTE, folio,
// fecha vencimiento, neto, IVA, retención, total.
//
// Es un modal secundario que se abre sobre el editor principal.

let CMP_DTE={lineaIdx:-1,dte:null,tipoAux:''};

function abrirCmpEdDte(lineaIdx){
  const l=CMP_MODAL.edit.movs[lineaIdx];
  if(!l||!l.cd)return;
  const tipoAux=CUENTAS_AUX[l.cd];
  if(!tipoAux)return;
  CMP_DTE={
    lineaIdx,
    tipoAux,
    dte:l.dte?{...l.dte}:{
      fecha:CMP_MODAL.edit.fecha||today(),
      fechaVencimiento:'',
      tipoDTE:'', numero:'',
      rutCodigo:'', rutDV:'', razonSocial:'',
      neto:0, exento:0, iva:0, otrosImpuestos:0, retencion:0, total:0,
    },
  };
  document.getElementById('cmp-dte-modal').classList.add('open');
  renderCmpDteModal();
}

function cerrarCmpEdDte(){
  document.getElementById('cmp-dte-modal').classList.remove('open');
  CMP_DTE={lineaIdx:-1,dte:null,tipoAux:''};
}

function renderCmpDteModal(){
  const box=document.getElementById('cmp-dte-modal-body');
  if(!box)return;
  const d=CMP_DTE.dte;
  const tipoAux=CMP_DTE.tipoAux;
  const tipoLbl=tipoAux==='cliente'?'Cliente':tipoAux==='proveedor'?'Proveedor':'Honorario';
  const rutLbl=tipoAux==='cliente'?'RUT Cliente':tipoAux==='proveedor'?'RUT Proveedor':'RUT Prestador';

  // Opciones de DTE según tipo auxiliar
  let dteOpts='<option value="">— tipo documento —</option>';
  if(tipoAux==='cliente'){
    DTE_VENTAS.forEach(x=>{dteOpts+=`<option value="${x.cod}" ${+d.tipoDTE===x.cod?'selected':''}>${x.cod} — ${x.nm}</option>`;});
  }else if(tipoAux==='proveedor'){
    DTE_COMPRAS.forEach(x=>{dteOpts+=`<option value="${x.cod}" ${+d.tipoDTE===x.cod?'selected':''}>${x.cod} — ${x.nm}</option>`;});
  }else{
    dteOpts+=`<option value="70" ${+d.tipoDTE===70?'selected':''}>70 — Boleta de Honorarios</option>
              <option value="71" ${+d.tipoDTE===71?'selected':''}>71 — Boleta de Honorarios Electrónica</option>`;
  }

  const rutFmt2=d.rutCodigo?`${d.rutCodigo}-${d.rutDV||''}`:'';
  const esHono=tipoAux==='honorario';

  box.innerHTML=`
    <div style="padding:16px 20px">
      <div style="background:var(--sf2);border-radius:6px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;color:var(--mt);text-transform:uppercase;font-weight:700">${tipoLbl}</span>
        <span style="font-family:var(--mono);font-size:11px">${pdcNm(CMP_MODAL.edit.movs[CMP_DTE.lineaIdx]?.cd||'')}</span>
      </div>

      <div class="fg">
        <div class="grp"><label>Fecha emisión</label>
          <input type="date" id="cmpdte-fecha" value="${d.fecha||''}" oninput="setCmpDteCampo('fecha',this.value)"></div>
        <div class="grp"><label>Fecha vencimiento</label>
          <input type="date" id="cmpdte-fvenc" value="${d.fechaVencimiento||''}" oninput="setCmpDteCampo('fechaVencimiento',this.value)"></div>

        <div class="grp"><label>${rutLbl}</label>
          <input type="text" id="cmpdte-rut" value="${rutFmt2}" placeholder="12345678-9" oninput="setCmpDteRut(this.value)"></div>
        <div class="grp"><label>Razón social / Nombre</label>
          <input type="text" id="cmpdte-razon" value="${(d.razonSocial||'').replace(/"/g,'&quot;')}" oninput="setCmpDteCampo('razonSocial',this.value)"></div>

        <div class="grp"><label>Tipo de documento</label>
          <select id="cmpdte-tipo" onchange="setCmpDteCampo('tipoDTE',+this.value)">${dteOpts}</select></div>
        <div class="grp"><label>Folio / N° documento</label>
          <input type="text" id="cmpdte-numero" value="${d.numero||''}" oninput="setCmpDteCampo('numero',this.value)"></div>
      </div>

      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--bd)">
        <div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em">Montos</div>
        <div class="fg">
          ${esHono?`
          <div class="grp"><label>Bruto (base honorarios)</label>
            <input type="number" id="cmpdte-neto" value="${d.neto||''}" oninput="setCmpDteCampo('neto',+this.value)"></div>
          <div class="grp"><label>Retención</label>
            <input type="number" id="cmpdte-ret" value="${d.retencion||''}" oninput="setCmpDteCampo('retencion',+this.value)"></div>
          `:`
          <div class="grp"><label>Neto</label>
            <input type="number" id="cmpdte-neto" value="${d.neto||''}" oninput="setCmpDteCampo('neto',+this.value);cmpDteAutoTotal()"></div>
          <div class="grp"><label>Exento</label>
            <input type="number" id="cmpdte-exento" value="${d.exento||''}" oninput="setCmpDteCampo('exento',+this.value);cmpDteAutoTotal()"></div>
          <div class="grp"><label>IVA</label>
            <input type="number" id="cmpdte-iva" value="${d.iva||''}" oninput="setCmpDteCampo('iva',+this.value);cmpDteAutoTotal()"></div>
          <div class="grp"><label>Otros impuestos / Retención</label>
            <input type="number" id="cmpdte-otros" value="${d.otrosImpuestos||d.retencion||''}" oninput="setCmpDteCampo('otrosImpuestos',+this.value);cmpDteAutoTotal()"></div>
          `}
          <div class="grp full"><label style="font-weight:700">Total documento</label>
            <input type="number" id="cmpdte-total" style="font-weight:700;font-size:14px" value="${d.total||''}" oninput="setCmpDteCampo('total',+this.value)"></div>
        </div>
        ${!esHono?`<div style="font-size:10px;color:var(--mt);margin-top:6px">💡 El total se recalcula automáticamente al editar neto/exento/IVA. Puedes ajustarlo manualmente si hay diferencias con el documento real.</div>`:''}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cerrarCmpEdDte()">Cancelar</button>
        <button class="btn btn-p" onclick="guardarCmpEdDte()">💾 Guardar datos</button>
      </div>
    </div>`;
}

function setCmpDteCampo(campo,valor){
  if(!CMP_DTE.dte)return;
  CMP_DTE.dte[campo]=valor;
}
function setCmpDteRut(txt){
  if(!CMP_DTE.dte)return;
  const info=rutParse(txt||'');
  CMP_DTE.dte.rutCodigo=info.codigo||'';
  CMP_DTE.dte.rutDV=info.dv||'';
}
function cmpDteAutoTotal(){
  const d=CMP_DTE.dte;if(!d)return;
  const total=(+d.neto||0)+(+d.exento||0)+(+d.iva||0)+(+d.otrosImpuestos||0);
  const inp=document.getElementById('cmpdte-total');
  if(inp&&document.activeElement!==inp){inp.value=total;d.total=total;}
}

function guardarCmpEdDte(){
  const d=CMP_DTE.dte;
  const li=CMP_DTE.lineaIdx;
  if(!d||li<0)return;
  if(!d.rutCodigo){toast('⚠️ Falta el RUT','e');return;}
  if(!d.tipoDTE){toast('⚠️ Falta el tipo de documento','e');return;}
  if(!String(d.numero||'').trim()){toast('⚠️ Falta el folio','e');return;}
  if(!d.fecha){toast('⚠️ Falta la fecha','e');return;}

  CMP_MODAL.edit.movs[li].dte={...d};
  const m=CMP_MODAL.edit.movs[li];
  // Sugerir monto según tipo de cuenta si aún no hay debe/haber
  if(!m.debe&&!m.haber&&d.total){
    const cuentaTipo=CUENTAS_AUX[m.cd];
    if(cuentaTipo==='proveedor'||m.cd==='2102006')m.haber=+d.total;
    else if(cuentaTipo==='cliente')m.debe=+d.total;
    else m.debe=+d.total;
  }
  cerrarCmpEdDte();
  renderCmpModal();
  toast('✅ Datos del documento actualizados');
}

export {abrirComprobantePor,
        setCmpFiltro, limpiarCmpFiltro, editarAsientoDesdeCmp, corregirCmp,
        cmpNumeroBuscar, renderCmpNumeroList, cmpNumeroElegir,
        abrirCmpModal, cerrarCmpModal, cmpModalEditar, cmpModalCancelar, cmpModalGuardar,
        eliminarComprobante, anularComprobante,
        setCmpEdGlosa, setCmpEdFecha, setCmpEdCuenta, setCmpEdCampo, setCmpEdMonto, setCmpEdMontoBlur, addCmpEdLinea, delCmpEdLinea,
        abrirCmpEdDte, cerrarCmpEdDte, setCmpDteCampo, setCmpDteRut, cmpDteAutoTotal, guardarCmpEdDte};
