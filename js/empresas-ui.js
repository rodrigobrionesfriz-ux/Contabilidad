// empresas-ui.js — Vista de gestión de empresas (crear, editar, marco contable)
import {toast} from './core.js';
import {esAdmin} from './auth.js';
import {logAccion} from './firebase.js';
import {EMPRESAS, MARCOS, marcoInfo, empresaActiva, crearEmpresa,
        eliminarEmpresa, actualizarEmpresa, activarEmpresa,
        compartirEmpresa, asignarDuenio, empresaSinDuenio, esDuenioDeEmpresa,
        empresasHuerfanas, recuperarEmpresa} from './empresas.js';
import {FS} from './firebase.js';
import {AUTH} from './state.js';
import {US} from './usuarios.js';

let EMPF={editId:null};
let EMPC={id:null};   // empresa cuyo panel de compartir está abierto

const miEmail=()=>((AUTH.user&&AUTH.user.email)||'').toLowerCase();
// Usuarios del sistema con los que se puede compartir (todos menos yo)
const otrosUsuarios=()=>(US.usuarios||[]).filter(u=>String(u.email).toLowerCase()!==miEmail());

// Cuando el catálogo no se pudo LEER, no se inventa nada: se dice qué pasó.
// Es el caso de abrir en un equipo nuevo (el móvil) y que la nube no responda.
function bannerErrorCatalogo(){
  if(!EMPRESAS.errorCarga)return '';
  return `<div class="info-tip" style="margin-bottom:14px;border-color:var(--err);line-height:1.6">
    🚫 <strong>No se pudo leer el catálogo de empresas desde la nube.</strong>
    <div style="font-family:var(--mono);font-size:11px;color:var(--mt);margin:6px 0">${EMPRESAS.errorCarga}</div>
    Tus datos <strong>no se han perdido</strong>: siguen en Firestore. La app prefiere no mostrar nada
    antes que inventar una empresa vacía y sobrescribir el catálogo real.
    <div style="margin-top:8px">Qué revisar, en orden:</div>
    <div style="margin-top:4px">
      1. Que este equipo tenga conexión y que hayas entrado con <strong>el mismo correo</strong> del PC.<br>
      2. Que en Firebase las reglas publicadas sean las del archivo <code>firestore.rules</code>.<br>
      3. Configuración → Sistema → 🔒 Aislamiento por empresa → <strong>Verificar</strong>, que dice
         exactamente qué está rechazando la nube.
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="location.reload()">🔄 Reintentar</button>
    </div>
  </div>`;
}

// Empresas que se sacaron del catálogo pero cuyos datos siguen enteros.
// Pasa al eliminar sin marcar "borrar datos" — incluido el caso de quien
// cancelaba en la segunda pregunta creyendo que abortaba la operación.
function bloqueHuerfanas(){
  const h=empresasHuerfanas();
  if(!h.length)return '';
  const filas=h.map(x=>`<tr>
    <td class="tl" style="font-size:13px"><strong>${x.nombre||'(sin nombre guardado)'}</strong>
      <div style="font-size:10px;color:var(--mt);font-family:var(--mono)">${x.id}${x.rut?' · '+x.rut:''}</div></td>
    <td class="tl" style="font-size:11px;color:var(--mt)">${x.claves} registro${x.claves===1?'':'s'}${x.anios.length?' · ejercicios '+x.anios.join(', '):''}</td>
    <td style="text-align:right"><button class="btn btn-p" style="font-size:11px" onclick="restaurarEmpresa('${x.id}')">↩️ Recuperar</button></td>
  </tr>`).join('');
  return `<div class="card" style="margin-top:14px;border-color:var(--warn)">
    <div class="card-title">↩️ Empresas recuperables</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px;line-height:1.6">
      Estas empresas ya no están en el listado, pero sus datos siguen guardados en este equipo.
      Se eliminaron del catálogo sin borrar la información. Al recuperarlas vuelven con su
      <strong>mismo identificador</strong>, así que reaparecen con todos sus libros intactos.
    </div>
    <div class="tw"><table><tbody>${filas}</tbody></table></div>
  </div>`;
}

export function renderEmpresas(){
  const el=document.getElementById('empresas-content');
  if(!el)return;
  const filas=EMPRESAS.lista.map(e=>{
    const m=marcoInfo(e.marco);
    const activa=e.id===EMPRESAS.activa;
    const mia=esDuenioDeEmpresa(e);
    const huerfana=empresaSinDuenio(e);
    const compartida=(e.compartidaCon||[]).length;
    // Quién es el dueño y con quién está compartida
    const duenio=huerfana
      ? `<span class="badge" style="background:rgba(210,153,34,.15);color:var(--warn)" title="Creada antes de activar la visibilidad por usuario: la ven todos">heredada</span>`
      : (mia?`<span class="badge bg">tuya</span>`
            :`<span class="badge bb" title="Creada por ${e.creadoPor}">de ${String(e.creadoPor).split('@')[0]}</span>`);
    const compBadge=compartida
      ? `<span class="badge bb" title="Compartida con: ${(e.compartidaCon||[]).join(', ')}">👥 ${compartida}</span>`:'';
    // Sólo el dueño (o un admin) puede compartir o traspasar
    const puedeGestionar=mia||esAdmin();
    return `<tr${activa?' style="background:rgba(88,166,255,.08)"':''}>
      <td class="tl" style="font-size:13px">
        ${activa?'<span style="color:var(--ac)">● </span>':''}<strong>${e.nombre}</strong>
        ${activa?'<span style="font-size:10px;color:var(--ac)"> (activa)</span>':''}
        <div style="font-size:10px;color:var(--mt)">${e.rut||'sin RUT'}</div>
      </td>
      <td class="tl" style="font-size:11px">${m.nm}</td>
      <td class="tl" style="font-size:11px">${duenio} ${compBadge}</td>
      <td style="text-align:right;white-space:nowrap">
        ${activa?'':`<button class="btn btn-i" onclick="seleccionarEmpresa('${e.id}')" title="Activar">▶</button>`}
        ${huerfana?`<button class="btn btn-i" onclick="reclamarEmpresa('${e.id}')" title="Marcarla como tuya: dejará de verla el resto">🙋 Reclamar</button>`:''}
        ${puedeGestionar&&!huerfana?`<button class="btn btn-i" onclick="abrirCompartir('${e.id}')" title="Compartir con otros usuarios">👥</button>`:''}
        <button class="btn btn-i" onclick="editarEmpresaCat('${e.id}')">✏️</button>
        ${EMPRESAS.lista.length>1&&esAdmin()?`<button class="btn btn-d" onclick="borrarEmpresa('${e.id}')" title="Eliminar empresa (solo administradores)">🗑</button>`:''}
      </td>
    </tr>${EMPC.id===e.id?filaCompartir(e):''}`;
  }).join('');

  const ocultas=EMPRESAS.todas.length-EMPRESAS.lista.length;

  el.innerHTML=`${bannerErrorCatalogo()}<div class="info-tip" style="margin-bottom:14px">🏢 Cada empresa tiene sus datos <strong>completamente separados</strong>: plan de cuentas, libros, asientos e indicadores propios. Cambia de empresa con el selector del menú lateral.</div>
  <div class="info-tip" style="margin-bottom:14px;font-size:11px;line-height:1.6">
    👤 <strong>Cada usuario ve sólo sus empresas.</strong> La empresa queda a nombre de quien la crea; el dueño puede
    compartirla con otros usuarios desde el botón 👥. ${esAdmin()?'Como administrador ves <strong>todo el catálogo</strong>, con el dueño de cada una.':''}
    Las marcadas como <em>heredadas</em> son anteriores a este cambio y las sigue viendo todo el mundo hasta que alguien las reclame.
    ${ocultas>0&&!esAdmin()?`<br><span style="color:var(--mt)">Hay ${ocultas} empresa(s) de otros usuarios que no se muestran.</span>`:''}
    <br><span style="color:var(--warn)">⚠️ Es separación de vista, no de acceso: los datos siguen en la misma base y un usuario con conocimientos técnicos podría alcanzarlos. Para aislamiento real hay que endurecer las reglas de Firestore.</span>
  </div>
  <div class="card-np" style="margin-bottom:14px"><div class="tw"><table>
    <thead><tr><th class="tl">EMPRESA</th><th class="tl">MARCO CONTABLE</th><th class="tl">ACCESO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div></div>
  <button class="btn btn-p" onclick="abrirFormEmpresa()">+ Nueva empresa</button>
  ${bloqueHuerfanas()}

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

export async function restaurarEmpresa(id){
  const x=empresasHuerfanas().find(y=>y.id===id);
  if(!x){toast('⚠️ Ya no está disponible para recuperar','e');renderEmpresas();return;}
  const nombre=prompt(
`↩️ RECUPERAR EMPRESA

Vuelve al listado con su mismo identificador (${id}), así que recupera todos sus datos.

Confirma o corrige el nombre:`, x.nombre||'Empresa recuperada');
  if(nombre===null)return;
  try{
    const ok=await recuperarEmpresa(id,String(nombre).trim(),x.rut);
    if(!ok){toast('⚠️ Esa empresa ya está en el catálogo','e');return;}
    toast(`↩️ "${String(nombre).trim()}" recuperada con sus ${x.claves} registros`);
    logAccion('Recuperó empresa',`${nombre} (${id})`);
    renderEmpresas();
    if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
  }catch(e){toast('❌ '+e.message,'e');}
}

export async function borrarEmpresa(id){
  // Solo administradores pueden eliminar empresas
  if(!esAdmin()){
    toast('🔒 Solo los administradores pueden eliminar empresas','e');
    return;
  }
  const e=EMPRESAS.lista.find(x=>x.id===id);if(!e)return;

  // Primer paso: confirmar la eliminación de la empresa del catálogo
  const nombre=e.nombre||'(sin nombre)';
  const c1=confirm(
`⚠️ ELIMINAR EMPRESA

Vas a eliminar "${nombre}" del catálogo.

Esto NO se puede deshacer desde la aplicación. ¿Continuar?`);
  if(!c1)return;

  // Segundo paso: preguntar si además borrar todos los datos.
  //
  // OJO: acá "Cancelar" NO abortaba la operación — sólo significaba "no borres
  // los datos" — y la empresa se eliminaba igual del catálogo. Quien apretaba
  // Cancelar creyendo que se echaba atrás perdía la empresa del listado.
  // Ahora el texto lo dice explícitamente Y hay una confirmación final donde
  // Cancelar sí aborta todo.
  const c2=confirm(
`🗑 ¿Borrar TAMBIÉN los datos de "${nombre}"?

Esta pregunta es SÓLO sobre los datos. La empresa se elimina del listado en los dos casos.

• Aceptar  = se borran además libros, asientos, indicadores y configuración (solo de este navegador; la nube no se toca).
• Cancelar = los datos se conservan y la empresa se puede recuperar después.

⚠️ Para echarte atrás por completo, cancela en la pregunta que viene a continuación.`);

  // Tercer paso: para el borrado destructivo, pedir escribir el nombre
  if(c2){
    const escrito=prompt(
`🚨 CONFIRMACIÓN FINAL

Escribe el nombre exacto de la empresa para confirmar el borrado de sus datos:

${nombre}`);
    if(String(escrito||'').trim()!==nombre){
      toast('❌ Nombre no coincide — cancelado','e');
      return;
    }
  }

  // Último paso: la salida de emergencia. Acá Cancelar SIEMPRE aborta todo.
  const c3=confirm(
`❓ ÚLTIMA CONFIRMACIÓN

Se va a eliminar "${nombre}" del listado${c2?` Y BORRAR TODOS SUS DATOS`:`, conservando sus datos`}.

• Aceptar  = proceder
• Cancelar = no hacer nada`);
  if(!c3){toast('Operación cancelada — no se eliminó nada');return;}

  try{
    const {borradas}=await eliminarEmpresa(id,c2);
    if(c2){
      toast(`🗑 "${nombre}" eliminada · ${borradas} clave${borradas===1?'':'s'} borrada${borradas===1?'':'s'}`);
      logAccion('Eliminó empresa (con datos)',`${nombre} · ${borradas} claves`);
    }else{
      toast('🗑 "'+nombre+'" eliminada del listado (datos preservados)');
      logAccion('Eliminó empresa del catálogo',nombre);
    }
    renderEmpresas();
    if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
    // Si borró la activa, hay que recargar todo con la nueva activa
    if(window.recargarEmpresaActiva)await window.recargarEmpresaActiva();
  }catch(err){toast('⚠️ '+err.message,'e');}
}


// ── Compartir empresa con otros usuarios ──
function filaCompartir(e){
  const users=otrosUsuarios();
  const sel=new Set((e.compartidaCon||[]).map(x=>String(x).toLowerCase()));
  const cuerpo=users.length
    ? users.map(u=>`<label style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx);cursor:pointer">
        <input type="checkbox" value="${u.email}" class="chk-comp" ${sel.has(String(u.email).toLowerCase())?'checked':''} style="width:auto">
        <span>${u.nombre||u.email}<span style="color:var(--mt);font-size:10px"> · ${u.email}${u.rol?' · '+u.rol:''}</span></span>
      </label>`).join('')
    : '<div style="font-size:11px;color:var(--mt)">No hay otros usuarios registrados todavía. Invítalos desde Configuración → Usuarios.</div>';
  return `<tr><td colspan="4" style="background:var(--sf2);padding:14px 16px">
    <div style="font-size:12px;font-weight:700;margin-bottom:8px">👥 Compartir «${e.nombre}»</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Los usuarios marcados verán esta empresa en su selector y podrán trabajar en ella.</div>
    <div style="max-height:220px;overflow:auto;margin-bottom:12px">${cuerpo}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="guardarCompartir('${e.id}')">💾 Guardar acceso</button>
      <button class="btn btn-g" onclick="cerrarCompartir()">Cancelar</button>
    </div>
  </td></tr>`;
}

export function abrirCompartir(id){EMPC.id=id;renderEmpresas();}
export function cerrarCompartir(){EMPC.id=null;renderEmpresas();}

export async function guardarCompartir(id){
  const emails=[...document.querySelectorAll('.chk-comp:checked')].map(c=>c.value);
  await compartirEmpresa(id,emails);
  const e=EMPRESAS.todas.find(x=>x.id===id);
  toast(emails.length?`👥 «${e?e.nombre:''}» compartida con ${emails.length} usuario(s)`:`🔒 «${e?e.nombre:''}» ya no está compartida`);
  logAccion('Compartió empresa',`${e?e.nombre:id} → ${emails.join(', ')||'(nadie)'}`);
  EMPC.id=null;
  renderEmpresas();
  if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
}

// Reclamar una empresa heredada: pasa a ser tuya y deja de verla el resto
export async function reclamarEmpresa(id){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return;
  const yo=miEmail();
  if(!yo){toast('⚠️ No hay sesión identificada','e');return;}
  if(!confirm(`Reclamar «${e.nombre}»\n\nQuedará a tu nombre (${yo}) y dejará de aparecerle al resto de los usuarios, salvo que la compartas.\n\n¿Continuar?`))return;
  await asignarDuenio(id,yo);
  toast(`🙋 «${e.nombre}» quedó a tu nombre`);
  logAccion('Reclamó empresa',`${e.nombre} → ${yo}`);
  renderEmpresas();
  if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
}
