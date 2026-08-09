// comprobantes.js — Vista unificada de asientos del libro diario
//
// A diferencia de "Asientos Manuales", que solo lista los que el usuario
// escribió a mano, esta vista muestra TODOS los asientos del libro diario:
// apertura, resúmenes automáticos de ventas/compras/honorarios, y manuales.
//
// Cada uno permite editarse: los manuales abren el editor de asientos, los
// automáticos llevan al origen (Libro de Ventas/Compras/Honorarios) para
// que se corrijan los documentos que los generaron.

import {fmt, fmtC, MESES, pdcNm, today, toast} from './core.js';
import {S} from './state.js';
import {nav, rerender} from './ui.js';
import {genDiario} from './reportes.js';
import {editarAsiento, sigAsiento} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {logAccion} from './firebase.js';

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

let CMP_ENTRIES=[];        // cachea las entries actuales para el modal
let CMP_MODAL={mode:'view',idx:-1,edit:null};

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

  let h=alerta+`<div class="filter-row" style="margin-bottom:14px">
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
      <option value="descuadrados" ${CMP_FILTRO.origen==='descuadrados'?'selected':''}>⚠️ Solo descuadrados</option>
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
    const anulado=e.anulado?' opacity:.5;text-decoration:line-through;':'';
    const descuadrado=Math.abs(totED-totEH)>1;
    const estiloFila=(anulado||descuadrado)?` style="${anulado}${descuadrado?'background:rgba(248,81,73,.05);':''}"`:'';
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
    h+=`<tr${estiloFila} style="${estiloFila?estiloFila.slice(8,-1)+';':''}cursor:pointer" onclick="abrirCmpModal(${i})">
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

  cont.innerHTML=h;
  CMP_ENTRIES=entries;
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

      <table style="width:100%;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--bd);color:var(--mt);text-transform:uppercase;font-size:10px">
          <th class="tl" style="padding:6px 8px">CÓDIGO</th>
          <th class="tl" style="padding:6px 8px">CUENTA</th>
          <th class="tl" style="padding:6px 8px">DESCRIPCIÓN</th>
          <th style="text-align:right;padding:6px 8px">DEBE</th>
          <th style="text-align:right;padding:6px 8px">HABER</th>
        </tr></thead>
        <tbody>${e.movs.map(m=>`<tr style="border-bottom:1px solid rgba(48,54,61,.5)">
          <td class="tl" style="padding:6px 8px;font-family:var(--mono);color:var(--mt)">${m.cd}</td>
          <td class="tl" style="padding:6px 8px">${m.nm||pdcNm(m.cd)}</td>
          <td class="tl" style="padding:6px 8px;color:var(--mt);font-size:11px">${m.desc||''}</td>
          <td style="text-align:right;padding:6px 8px;font-family:var(--mono)">${m.debe?fmtC(m.debe):'—'}</td>
          <td style="text-align:right;padding:6px 8px;font-family:var(--mono)">${m.haber?fmtC(m.haber):'—'}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr style="background:var(--sf2);font-weight:700">
          <td colspan="3" class="tl" style="padding:8px">TOTALES</td>
          <td style="text-align:right;padding:8px;font-family:var(--mono);color:${cuadra?'var(--tx)':'var(--err)'}">${fmtC(totD)}</td>
          <td style="text-align:right;padding:8px;font-family:var(--mono);color:${cuadra?'var(--tx)':'var(--err)'}">${fmtC(totH)}</td>
        </tr></tfoot>
      </table>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cerrarCmpModal()">Cerrar</button>
        ${editable?`<button class="btn btn-p" onclick="cmpModalEditar()">✏️ Editar</button>`:''}
      </div>
    </div>`;
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
    return `<tr>
      <td style="padding:4px 6px;min-width:220px">${busc}</td>
      <td style="padding:4px 6px"><input type="text" class="linea-inp" placeholder="Descripción"
        value="${(m.desc||'').replace(/"/g,'&quot;')}" oninput="setCmpEdCampo(${i},'desc',this.value)"></td>
      <td style="padding:4px 6px"><input type="number" class="linea-num-inp" placeholder="Debe"
        value="${m.debe||''}" oninput="setCmpEdCampo(${i},'debe',this.value)"></td>
      <td style="padding:4px 6px"><input type="number" class="linea-num-inp" placeholder="Haber"
        value="${m.haber||''}" oninput="setCmpEdCampo(${i},'haber',this.value)"></td>
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

      <table style="width:100%;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--bd);color:var(--mt);text-transform:uppercase;font-size:10px">
          <th class="tl" style="padding:6px">CUENTA</th>
          <th class="tl" style="padding:6px">DESCRIPCIÓN</th>
          <th class="tl" style="padding:6px;width:110px">DEBE</th>
          <th class="tl" style="padding:6px;width:110px">HABER</th>
          <th style="width:36px"></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-i" onclick="addCmpEdLinea()">+ Agregar línea</button>
        <div style="flex:1;padding:6px 12px;border-radius:6px;background:${cuadra?'rgba(46,160,67,.08)':'rgba(248,81,73,.08)'};border:1px solid ${cuadra?'var(--ach)':'var(--err)'};display:flex;gap:16px;font-size:12px;font-weight:600">
          <span>DEBE <span style="font-family:var(--mono)">${fmtC(totD)}</span></span>
          <span>HABER <span style="font-family:var(--mono)">${fmtC(totH)}</span></span>
          <span style="color:${cuadra?'var(--ach)':'var(--err)'};margin-left:auto">${cuadra?'✅ Cuadrado':'⚠️ Diferencia '+fmtC(Math.abs(dif))}</span>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cmpModalCancelar()">Cancelar</button>
        <button class="btn btn-p" onclick="cmpModalGuardar()" ${cuadra?'':'disabled title="El asiento debe cuadrar antes de guardar" style="opacity:.4;cursor:not-allowed"'}>💾 Guardar cambios</button>
      </div>
    </div>`;
}

function cmpModalEditar(){
  const e=CMP_ENTRIES[CMP_MODAL.idx];
  if(!e)return;
  CMP_MODAL.mode='edit';
  CMP_MODAL.edit={
    glosa:e.glosa||'',
    fecha:e.fecha||today(),
    movs:e.movs.map(m=>({
      cd:m.cd||'',
      nm:m.nm||pdcNm(m.cd)||'',
      desc:m.desc||'',
      debe:+m.debe||0,
      haber:+m.haber||0,
    })),
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

  // Validación final de cuadratura (defensiva)
  const totD=ed.movs.reduce((s,m)=>s+(+m.debe||0),0);
  const totH=ed.movs.reduce((s,m)=>s+(+m.haber||0),0);
  if(Math.abs(totD-totH)>1){
    toast('⚠️ El asiento no cuadra — corrige antes de guardar','e');
    return;
  }
  // Requerir cuenta en todas las líneas con monto
  const sinCuenta=ed.movs.filter(m=>(m.debe||m.haber)&&!m.cd);
  if(sinCuenta.length){
    toast(`⚠️ ${sinCuenta.length} línea${sinCuenta.length===1?'':'s'} sin cuenta asignada`,'e');
    return;
  }
  // Filtrar líneas vacías
  const movsClean=ed.movs.filter(m=>m.cd&&(m.debe||m.haber)).map(m=>({
    cd:m.cd, nm:pdcNm(m.cd), desc:m.desc||'',
    debe:+m.debe||0, haber:+m.haber||0,
  }));
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
    if(doc)doc.excluidoAuto=true;
    // Crear asiento manual
    if(!S.asientos)S.asientos=[];
    const n=sigAsiento();
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

export {setCmpFiltro, limpiarCmpFiltro, toggleCmpDet, editarAsientoDesdeCmp, corregirCmp,
        abrirCmpModal, cerrarCmpModal, cmpModalEditar, cmpModalCancelar, cmpModalGuardar,
        setCmpEdGlosa, setCmpEdFecha, setCmpEdCuenta, setCmpEdCampo, addCmpEdLinea, delCmpEdLinea};
