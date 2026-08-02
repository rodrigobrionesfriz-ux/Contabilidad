// empresas-ui.js — Vista de gestión de empresas (crear, editar, marco contable)
import {toast} from './core.js';
import {EMPRESAS, MARCOS, marcoInfo, empresaActiva, crearEmpresa,
        eliminarEmpresa, actualizarEmpresa, activarEmpresa} from './empresas.js';

let EMPF={editId:null};

export function renderEmpresas(){
  const el=document.getElementById('empresas-content');
  if(!el)return;
  const filas=EMPRESAS.lista.map(e=>{
    const m=marcoInfo(e.marco);
    const activa=e.id===EMPRESAS.activa;
    return `<tr${activa?' style="background:rgba(88,166,255,.08)"':''}>
      <td class="tl" style="font-size:13px">
        ${activa?'<span style="color:var(--ac)">● </span>':''}<strong>${e.nombre}</strong>
        ${activa?'<span style="font-size:10px;color:var(--ac)"> (activa)</span>':''}
        <div style="font-size:10px;color:var(--mt)">${e.rut||'sin RUT'}</div>
      </td>
      <td class="tl" style="font-size:11px">${m.nm}</td>
      <td style="text-align:right;white-space:nowrap">
        ${activa?'':`<button class="btn btn-i" onclick="seleccionarEmpresa('${e.id}')" title="Activar">▶</button>`}
        <button class="btn btn-i" onclick="editarEmpresaCat('${e.id}')">✏️</button>
        ${EMPRESAS.lista.length>1?`<button class="btn btn-d" onclick="borrarEmpresa('${e.id}')">🗑</button>`:''}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML=`<div class="info-tip" style="margin-bottom:14px">🏢 Cada empresa tiene sus datos <strong>completamente separados</strong>: plan de cuentas, libros, asientos e indicadores propios. Cambia de empresa con el selector del encabezado.</div>
  <div class="card-np" style="margin-bottom:14px"><div class="tw"><table>
    <thead><tr><th class="tl">EMPRESA</th><th class="tl">MARCO CONTABLE</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div></div>
  <button class="btn btn-p" onclick="abrirFormEmpresa()">+ Nueva empresa</button>

  <div class="card" id="emp-form" style="display:none;margin-top:14px">
    <div class="card-title" id="empf-title">Nueva empresa</div>
    <div class="fg">
      <div class="grp full"><label>Nombre / Razón social</label><input type="text" id="empf-nombre" placeholder="Ej: Vivero La Cabaña Ltda."></div>
      <div class="grp"><label>RUT</label><input type="text" id="empf-rut" placeholder="12.345.678-9"></div>
      <div class="grp"><label>Marco contable</label><select id="empf-marco" onchange="onMarcoChange()">
        ${MARCOS.map(m=>`<option value="${m.id}">${m.nm}</option>`).join('')}
      </select></div>
    </div>
    <div id="empf-marco-desc" class="info-tip" style="font-size:11px;margin:10px 0"></div>
    <div class="save-row" style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="guardarEmpresaCat()">💾 Guardar</button>
      <button class="btn btn-g" onclick="cerrarFormEmpresa()">Cancelar</button>
    </div>
  </div>`;
}

export function onMarcoChange(){
  const id=document.getElementById('empf-marco').value;
  const d=document.getElementById('empf-marco-desc');
  if(d)d.textContent=marcoInfo(id).desc;
}

export function abrirFormEmpresa(){
  EMPF={editId:null};
  const f=document.getElementById('emp-form');f.style.display='block';
  document.getElementById('empf-title').textContent='Nueva empresa';
  document.getElementById('empf-nombre').value='';
  document.getElementById('empf-rut').value='';
  document.getElementById('empf-marco').value='tributaria';
  onMarcoChange();
}

export function cerrarFormEmpresa(){
  const f=document.getElementById('emp-form');if(f)f.style.display='none';
  EMPF={editId:null};
}

export function editarEmpresaCat(id){
  const e=EMPRESAS.lista.find(x=>x.id===id);if(!e)return;
  EMPF={editId:id};
  const f=document.getElementById('emp-form');f.style.display='block';
  document.getElementById('empf-title').textContent='Editar empresa';
  document.getElementById('empf-nombre').value=e.nombre;
  document.getElementById('empf-rut').value=e.rut||'';
  document.getElementById('empf-marco').value=e.marco||'tributaria';
  onMarcoChange();
}

export async function guardarEmpresaCat(){
  const nombre=document.getElementById('empf-nombre').value.trim();
  const rut=document.getElementById('empf-rut').value.trim();
  const marco=document.getElementById('empf-marco').value;
  if(!nombre){toast('⚠️ Ingresa el nombre de la empresa','e');return;}
  if(EMPF.editId){
    await actualizarEmpresa(EMPF.editId,{nombre,rut,marco});
    toast('✅ Empresa actualizada');
  }else{
    await crearEmpresa(nombre,rut,marco);
    toast('✅ Empresa creada — actívala para empezar a cargar sus datos');
  }
  cerrarFormEmpresa();
  renderEmpresas();
  if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
}

export async function seleccionarEmpresa(id){
  const e=EMPRESAS.lista.find(x=>x.id===id);if(!e)return;
  if(!confirm(`¿Cambiar a "${e.nombre}"?\n\nSe cargarán sus datos (los de la empresa actual quedan guardados).`))return;
  await activarEmpresa(id);
  if(window.recargarEmpresaActiva)await window.recargarEmpresaActiva();
  renderEmpresas();
  toast('🏢 Empresa activa: '+e.nombre);
}

export async function borrarEmpresa(id){
  const e=EMPRESAS.lista.find(x=>x.id===id);if(!e)return;
  if(!confirm(`¿Eliminar "${e.nombre}" del listado?\n\nSus datos NO se borran del almacenamiento, pero dejará de aparecer. Esta acción no se puede deshacer desde la app.`))return;
  try{
    await eliminarEmpresa(id);
    toast('🗑 Empresa eliminada del listado');
    renderEmpresas();
    if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
  }catch(err){toast('⚠️ '+err.message,'e');}
}
