// usuarios.js — Gestión de usuarios (solo admin)
import {toast} from './core.js';
import {S, AUTH} from './state.js';
import {FS} from './firebase.js';
import {ROLES, esAdmin, permisosDeRol, SECCIONES} from './auth.js';

// ═══ GESTIÓN DE USUARIOS (solo admin) ═══
let US={usuarios:[],editEmail:null,permCustom:false};

async function cargarUsuarios(){
  if(!FS.enabled||!FS.db){US.usuarios=[];return;}
  try{
    const snap=await FS.db.collection('usuarios').orderBy('email').get();
    US.usuarios=[];
    snap.forEach(doc=>{US.usuarios.push({...doc.data(),email:doc.id});});
  }catch(e){console.error(e);toast('Error cargando usuarios','e');}
}

async function renderUsuarios(){
  if(!esAdmin()){
    document.getElementById('us-content').innerHTML='<div class="empty"><div class="ei">🚫</div>Solo los administradores pueden gestionar usuarios.</div>';
    return;
  }
  await cargarUsuarios();
  const pendientes=US.usuarios.filter(u=>u.pendiente&&!u.activo);
  const activos=US.usuarios.filter(u=>u.activo);
  const desactivados=US.usuarios.filter(u=>!u.activo&&!u.pendiente);
  document.getElementById('us-sub').textContent=`${US.usuarios.length} usuarios · ${activos.length} activos · ${pendientes.length} pendientes · ${desactivados.length} desactivados`;

  let h='';
  if(pendientes.length){
    h+=`<div style="background:rgba(255,193,7,.08);border:1px solid rgba(255,193,7,.3);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="font-weight:700;color:#ffc107;margin-bottom:8px">⏳ ${pendientes.length} solicitud${pendientes.length===1?'':'es'} pendiente${pendientes.length===1?'':'s'} de aprobación</div>
      ${pendientes.map(u=>renderRowUsuario(u,true)).join('')}
    </div>`;
  }

  h+='<div class="card-np"><div class="tw"><table><thead><tr><th class="tl">USUARIO</th><th class="tl">EMAIL</th><th>ROL</th><th>ESTADO</th><th>ÚLTIMO ACCESO</th><th style="width:180px"></th></tr></thead><tbody>';
  US.usuarios.filter(u=>!(u.pendiente&&!u.activo)).forEach(u=>{h+=renderRowUsuario(u,false);});
  if(!US.usuarios.length)h+='<tr><td colspan="6" class="empty">Aún no hay usuarios registrados.</td></tr>';
  h+='</tbody></table></div></div>';

  document.getElementById('us-content').innerHTML=h;
}

function renderRowUsuario(u,esPendiente){
  const rol=ROLES[u.rol]||ROLES.consulta;
  const estado=u.activo?'<span class="badge bg">ACTIVO</span>':u.pendiente?'<span class="badge" style="background:rgba(255,193,7,.15);color:#ffc107">PENDIENTE</span>':'<span class="badge br">INACTIVO</span>';
  const ultimo=u.ultimoLogin&&u.ultimoLogin.toDate?u.ultimoLogin.toDate().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}):'—';
  const acciones=[];
  if(esPendiente||!u.activo){
    acciones.push(`<button class="btn btn-s" style="padding:3px 7px;font-size:10px" onclick="aprobarUsuario('${u.email}')">✅ Aprobar</button>`);
  }else{
    acciones.push(`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarUsuario('${u.email}')">✏️ Editar</button>`);
    if(u.email!==AUTH.user.email){
      acciones.push(`<button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="desactivarUsuario('${u.email}')">🚫 Desactivar</button>`);
    }
  }
  const avatar=u.foto?`<img src="${u.foto}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px">`:'👤 ';
  return `<tr>
    <td class="tl">${avatar}${u.nombre||'(sin nombre)'}${u.email===AUTH.user.email?' <span style="font-size:9px;color:var(--info);margin-left:4px">(tú)</span>':''}</td>
    <td class="tl" style="font-family:var(--mono);font-size:11px">${u.email}</td>
    <td><span style="color:${rol.color};font-weight:600">${rol.icon} ${rol.label}</span></td>
    <td>${estado}</td>
    <td style="font-size:10px;color:var(--mt)">${ultimo}</td>
    <td style="text-align:center">${acciones.join(' ')}</td>
  </tr>`;
}

function abrirInvitarUsuario(){
  US.editEmail=null;US.permCustom=false;
  document.getElementById('us-form-title').textContent='Invitar nuevo usuario';
  document.getElementById('us-email').value='';document.getElementById('us-email').disabled=false;
  document.getElementById('us-nombre').value='';
  document.getElementById('us-rol').value='contador';
  renderPermisosForm();
  document.getElementById('us-form').style.display='block';
  document.getElementById('us-form').scrollIntoView({behavior:'smooth',block:'start'});
}

function editarUsuario(email){
  const u=US.usuarios.find(x=>x.email===email);if(!u)return;
  US.editEmail=email;
  US.permCustom=!!u.permisos;
  document.getElementById('us-form-title').textContent='Editar usuario — '+email;
  document.getElementById('us-email').value=email;document.getElementById('us-email').disabled=true;
  document.getElementById('us-nombre').value=u.nombre||'';
  document.getElementById('us-rol').value=u.rol||'consulta';
  renderPermisosForm(u.permisos);
  document.getElementById('us-form').style.display='block';
  document.getElementById('us-form').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPermisosForm(permisosActuales){
  const rol=document.getElementById('us-rol').value;
  const permBase=permisosDeRol(rol);
  const permActuales=permisosActuales||permBase;
  const html=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <label style="font-size:11px;cursor:pointer">
        <input type="checkbox" id="us-perm-custom" ${US.permCustom?'checked':''} onchange="US.permCustom=this.checked;renderPermisosForm()">
        Personalizar permisos (sobrescribe el rol)
      </label>
      <span style="font-size:10px;color:var(--mt)">💡 Sin personalizar, se usan los permisos del rol seleccionado.</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px 12px;${!US.permCustom?'opacity:.4;pointer-events:none':''}">
      ${SECCIONES.map(s=>`
        <div style="display:flex;align-items:center;gap:8px">
          <span style="flex:1;font-size:11px">${s.lbl}</span>
          <select id="us-p-${s.id}" style="background:var(--sf2);border:1px solid var(--bd);color:var(--tx);padding:3px 6px;border-radius:4px;font-size:10px">
            <option value="none" ${permActuales[s.id]==='none'?'selected':''}>Sin acceso</option>
            <option value="read" ${permActuales[s.id]==='read'?'selected':''}>Lectura</option>
            <option value="write" ${permActuales[s.id]==='write'?'selected':''}>Edición</option>
          </select>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('us-perms').innerHTML=html;
}

// Listener para cambios de rol → re-renderiza permisos
document.addEventListener('change',(e)=>{
  if(e.target&&e.target.id==='us-rol')renderPermisosForm();
});

function cerrarUsuarioForm(){
  document.getElementById('us-form').style.display='none';
  US.editEmail=null;
}

async function guardarUsuario(){
  const email=document.getElementById('us-email').value.trim().toLowerCase();
  const nombre=document.getElementById('us-nombre').value.trim();
  const rol=document.getElementById('us-rol').value;
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('⚠️ Email inválido','e');return;}
  if(!['admin','contador','consulta'].includes(rol)){toast('⚠️ Rol inválido','e');return;}

  let permisos=null;
  if(US.permCustom){
    permisos={};
    SECCIONES.forEach(s=>{permisos[s.id]=document.getElementById('us-p-'+s.id).value;});
  }

  try{
    const existente=US.usuarios.find(u=>u.email===email);
    if(US.editEmail){
      // Actualizar
      const data={nombre,rol,activo:true,pendiente:false};
      if(permisos)data.permisos=permisos;
      else data.permisos=firebase.firestore.FieldValue.delete();
      await FS.db.collection('usuarios').doc(email).update(data);
      toast('✅ Usuario actualizado');
    }else{
      // Crear invitación
      if(existente){toast('⚠️ Ya existe un usuario con ese email','e');return;}
      const data={
        email,nombre,rol,activo:true,pendiente:false,
        creadoEn:firebase.firestore.FieldValue.serverTimestamp()
      };
      if(permisos)data.permisos=permisos;
      await FS.db.collection('usuarios').doc(email).set(data);
      toast('✅ Usuario invitado — podrá entrar en su próximo login');
    }
    cerrarUsuarioForm();
    await renderUsuarios();
  }catch(e){
    console.error(e);toast('❌ Error: '+e.message,'e');
  }
}

async function aprobarUsuario(email){
  try{
    await FS.db.collection('usuarios').doc(email).update({activo:true,pendiente:false});
    toast('✅ Usuario aprobado');
    await renderUsuarios();
  }catch(e){toast('❌ '+e.message,'e');}
}

async function desactivarUsuario(email){
  if(email===AUTH.user.email){toast('⚠️ No puedes desactivarte a ti mismo','e');return;}
  const u=US.usuarios.find(x=>x.email===email);
  if(!confirm(`¿Desactivar el acceso de ${u?.nombre||email}?\n\nEl usuario no podrá entrar hasta que lo reactives.`))return;
  try{
    await FS.db.collection('usuarios').doc(email).update({activo:false});
    toast('🚫 Usuario desactivado');
    await renderUsuarios();
  }catch(e){toast('❌ '+e.message,'e');}
}


export {US, cargarUsuarios, renderUsuarios, renderRowUsuario, abrirInvitarUsuario, editarUsuario, renderPermisosForm, cerrarUsuarioForm, guardarUsuario, aprobarUsuario, desactivarUsuario};
