// auth.js — Autenticación, roles y permisos
import {S, AUTH} from './state.js';
import {nav} from './ui.js';
import {FS, logAccion, initFirestore} from './firebase.js';

// Callback que app.js registra para arrancar la app tras login exitoso.
let _onAuthReady=null;
export const setOnAuthReady=fn=>{_onAuthReady=fn;};

// ═══ SISTEMA DE AUTENTICACIÓN Y USUARIOS ═══
// Estructura de un usuario en Firestore (colección "usuarios", doc.id = email):
// {
//   email, nombre, foto, rol: 'admin'|'contador'|'consulta',
//   activo: true|false,          // false = acceso revocado
//   pendiente: false|true,       // true = intentó entrar pero admin no lo aprobó
//   creadoEn, ultimoLogin,
//   permisos: {                  // opcional; sobrescribe el rol para secciones específicas
//     empresa: 'none'|'read'|'write',
//     pdc: '...', apertura: '...',
//     ventas: '...', compras: '...', honorarios: '...',
//     asientos: '...', auxiliares: '...',
//     diario: '...', mayor: '...', balance: '...', resultados: '...'
//   }
// }

// Roles y sus permisos por defecto
const ROLES={
  admin:{icon:'👑',label:'Administrador',color:'var(--ach)',descripcion:'Acceso total + gestión de usuarios'},
  contador:{icon:'📝',label:'Contador',color:'var(--info)',descripcion:'Edición de todos los datos contables'},
  consulta:{icon:'👁',label:'Consulta',color:'var(--mt)',descripcion:'Solo lectura de reportes'}
};

// Secciones a las que se aplican permisos
const SECCIONES=[
  {id:'empresa',lbl:'Empresa'},
  {id:'empresas',lbl:'Empresas'},
  {id:'pdc',lbl:'Plan de Cuentas'},
  {id:'indicadores',lbl:'Indicadores'},
  {id:'apertura',lbl:'Balance de Apertura'},
  {id:'ventas',lbl:'Libro de Ventas'},
  {id:'compras',lbl:'Libro de Compras'},
  {id:'honorarios',lbl:'Honorarios'},
  {id:'remuneraciones',lbl:'Remuneraciones'},
  {id:'asientos',lbl:'Asientos Manuales'},
  {id:'auxiliares',lbl:'Auxiliares'},
  {id:'diario',lbl:'Libro Diario'},
  {id:'mayor',lbl:'Libro Mayor'},
  {id:'balance',lbl:'Balance General'},
  {id:'resultados',lbl:'Estado de Resultados'},
  {id:'flujocaja',lbl:'Flujo de Caja'},
  {id:'conciliacion',lbl:'Conciliación Bancaria'},
  {id:'auditlog',lbl:'Registro de Actividad'},
  {id:'f29',lbl:'Formulario 29'},
  {id:'ppm',lbl:'PPM'},
  {id:'xmlsii',lbl:'Exportar XML SII'},
  {id:'activofijo',lbl:'Activos Fijos'},
  {id:'provisiones',lbl:'Provisiones'},
  {id:'correccion',lbl:'Corrección Monetaria'},
  {id:'cierre',lbl:'Cierre del Ejercicio'}
];

// Permisos por rol (por defecto)
function permisosDeRol(rol){
  const p={};
  SECCIONES.forEach(s=>{
    if(rol==='admin'||rol==='contador')p[s.id]='write';
    else if(rol==='consulta')p[s.id]='read';
    else p[s.id]='none';
  });
  return p;
}

// Estado global del usuario actual
// AUTH se importa de state.js (evita duplicar el objeto de estado)

// Retorna el permiso efectivo del usuario para una sección: 'none' | 'read' | 'write'
function permiso(seccion){
  if(!AUTH.user||!AUTH.user.activo)return 'none';
  // Permisos custom sobrescriben rol
  if(AUTH.user.permisos&&AUTH.user.permisos[seccion])return AUTH.user.permisos[seccion];
  return permisosDeRol(AUTH.user.rol)[seccion]||'none';
}

function puedeVer(seccion){return permiso(seccion)!=='none';}
function puedeEditar(seccion){return permiso(seccion)==='write';}
function esAdmin(){return AUTH.user&&AUTH.user.activo&&AUTH.user.rol==='admin';}

async function initAuth(){
  if(typeof firebase==='undefined'||!firebase.auth){
    console.warn('Firebase Auth no disponible');
    document.getElementById('login-error').style.display='';
    document.getElementById('login-error').textContent='Sistema de autenticación no disponible. Verifica tu conexión.';
    return;
  }
  AUTH.auth=firebase.auth();

  // Listener de cambios de sesión
  AUTH.auth.onAuthStateChanged(async(user)=>{
    if(!user){
      // No hay sesión → mostrar login
      mostrarLogin();
      return;
    }
    // Hay sesión → verificar autorización en Firestore
    await verificarUsuarioAutorizado(user);
  });
}

// Modo del formulario: 'login' (inicio de sesión) o 'register' (registro nuevo usuario)
let LOGIN_MODE='login';

function toggleLoginMode(){
  LOGIN_MODE=LOGIN_MODE==='login'?'register':'login';
  const isReg=LOGIN_MODE==='register';
  document.getElementById('login-mode-sub').textContent=isReg?'Crea tu cuenta para acceder':'Inicia sesión para acceder al sistema';
  document.getElementById('btn-submit-login').innerHTML=isReg?'📝 Crear Cuenta':'🔐 Iniciar Sesión';
  document.getElementById('toggle-mode-btn').textContent=isReg?'← Volver a inicio de sesión':'¿Primer usuario? Regístrate';
  document.getElementById('login-name-wrap').style.display=isReg?'':'none';
  document.getElementById('login-password-hint').style.display=isReg?'':'none';
  document.getElementById('login-password').setAttribute('autocomplete',isReg?'new-password':'current-password');
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-success').style.display='none';
}

async function submitLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const password=document.getElementById('login-password').value;
  const nombre=document.getElementById('login-name').value.trim();
  const errEl=document.getElementById('login-error');
  const loadEl=document.getElementById('login-loading');
  const okEl=document.getElementById('login-success');
  const btn=document.getElementById('btn-submit-login');

  errEl.style.display='none';okEl.style.display='none';

  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa un email válido';return;
  }
  if(!password||password.length<6){
    errEl.style.display='';errEl.textContent='⚠️ La contraseña debe tener al menos 6 caracteres';return;
  }
  if(LOGIN_MODE==='register'&&!nombre){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa tu nombre';return;
  }

  btn.disabled=true;btn.style.opacity='0.6';
  loadEl.style.display='';loadEl.textContent=LOGIN_MODE==='register'?'⏳ Creando cuenta...':'⏳ Iniciando sesión...';

  try{
    if(LOGIN_MODE==='register'){
      await AUTH.auth.createUserWithEmailAndPassword(email,password);
      // Actualizar el displayName con el nombre ingresado
      try{await AUTH.auth.currentUser.updateProfile({displayName:nombre});}catch(e){}
    }else{
      await AUTH.auth.signInWithEmailAndPassword(email,password);
    }
    // El onAuthStateChanged toma el control
  }catch(e){
    console.error('Error auth:',e);
    btn.disabled=false;btn.style.opacity='1';
    loadEl.style.display='none';
    errEl.style.display='';
    const map={
      'auth/user-not-found':'⚠️ No existe una cuenta con este email',
      'auth/wrong-password':'⚠️ Contraseña incorrecta',
      'auth/invalid-credential':'⚠️ Email o contraseña incorrectos',
      'auth/invalid-email':'⚠️ Email inválido',
      'auth/email-already-in-use':'⚠️ Este email ya está registrado. Intenta iniciar sesión.',
      'auth/weak-password':'⚠️ La contraseña es muy débil (mínimo 6 caracteres)',
      'auth/too-many-requests':'⚠️ Demasiados intentos. Espera unos minutos.',
      'auth/network-request-failed':'⚠️ Sin conexión a internet',
      'auth/operation-not-allowed':'⚠️ Registro por email/contraseña no habilitado en Firebase Console'
    };
    errEl.textContent=map[e.code]||('Error: '+(e.message||e.code));
  }
}

async function recuperarPassword(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const errEl=document.getElementById('login-error');
  const okEl=document.getElementById('login-success');
  errEl.style.display='none';okEl.style.display='none';
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa tu email primero y luego haz clic en "¿Olvidaste tu contraseña?"';return;
  }
  try{
    await AUTH.auth.sendPasswordResetEmail(email);
    okEl.style.display='';
    okEl.innerHTML=`✅ Enviamos un enlace de recuperación a <strong>${email}</strong>.<br>Revisa tu bandeja de entrada (y la carpeta de spam).`;
  }catch(e){
    errEl.style.display='';
    if(e.code==='auth/user-not-found')errEl.textContent='⚠️ No existe una cuenta con ese email';
    else errEl.textContent='Error: '+(e.message||e.code);
  }
}

async function verificarUsuarioAutorizado(fbUser){
  const errEl=document.getElementById('login-error');
  const loadEl=document.getElementById('login-loading');
  loadEl.style.display='';loadEl.textContent='⏳ Verificando permisos...';

  if(!FS.enabled||!FS.db){
    // Firestore no cargó, no podemos verificar. Bloquear con reintento.
    errEl.style.display='';errEl.textContent='No hay conexión con la base de datos. Reintentando en 3s...';
    setTimeout(()=>verificarUsuarioAutorizado(fbUser),3000);
    return;
  }

  try{
    const email=fbUser.email.toLowerCase();
    const doc=await FS.db.collection('usuarios').doc(email).get();

    // ¿Cuántos usuarios hay en el sistema? (para detectar "primer/único usuario")
    const todos=await FS.db.collection('usuarios').limit(2).get();
    const esPrimerUsuario=todos.empty;
    // Red de seguridad: si el ÚNICO documento del sistema es el de este mismo usuario,
    // debe ser admin (evita quedar bloqueado si el registro inicial falló a medias).
    const esUnicoYPropio=todos.size===1&&todos.docs[0].id===email;

    let userData;
    if(!doc.exists){
      // Usuario no registrado en /usuarios/
      if(esPrimerUsuario){
        // ¡Primer usuario del sistema! → auto-admin
        userData={
          email,
          nombre:fbUser.displayName||email.split('@')[0],
          foto:fbUser.photoURL||'',
          rol:'admin',
          activo:true,
          pendiente:false,
          creadoEn:firebase.firestore.FieldValue.serverTimestamp(),
          ultimoLogin:firebase.firestore.FieldValue.serverTimestamp()
        };
        await FS.db.collection('usuarios').doc(email).set(userData);
        console.log('Primer usuario del sistema — asignado como admin:',email);
      }else{
        // No es primer usuario y no está en /usuarios/ → crear como pendiente
        userData={
          email,
          nombre:fbUser.displayName||email.split('@')[0],
          foto:fbUser.photoURL||'',
          rol:'consulta',
          activo:false,
          pendiente:true,
          creadoEn:firebase.firestore.FieldValue.serverTimestamp()
        };
        try{await FS.db.collection('usuarios').doc(email).set(userData);}catch(e){}
        errEl.style.display='';loadEl.style.display='none';
        errEl.innerHTML=`⏳ Cuenta creada. Tu solicitud de acceso está <strong>pendiente de aprobación</strong> por un administrador.<br><br>Email: <strong>${email}</strong><br><br>Contacta al administrador para que apruebe tu cuenta.`;
        setTimeout(async()=>{await AUTH.auth.signOut();},8000);
        return;
      }
    }else{
      userData={...doc.data(),email};
      // Red de seguridad: si eres el ÚNICO usuario del sistema pero tu doc quedó
      // inactivo o sin rol admin (registro inicial fallido), auto-promover a admin.
      if(esUnicoYPropio&&(!userData.activo||userData.rol!=='admin')){
        userData.rol='admin';userData.activo=true;userData.pendiente=false;
        try{await FS.db.collection('usuarios').doc(email).update({rol:'admin',activo:true,pendiente:false});}catch(e){}
        console.log('Único usuario del sistema — auto-promovido a admin:',email);
      }
      if(!userData.activo){
        errEl.style.display='';loadEl.style.display='none';
        if(userData.pendiente){
          errEl.innerHTML=`⏳ Tu cuenta <strong>${email}</strong> está pendiente de aprobación por un administrador.`;
        }else{
          errEl.innerHTML=`🚫 Tu acceso ha sido revocado. Contacta al administrador.`;
        }
        setTimeout(async()=>{await AUTH.auth.signOut();},6000);
        return;
      }
      // Actualizar último login (sin bloquear)
      FS.db.collection('usuarios').doc(email).update({
        ultimoLogin:firebase.firestore.FieldValue.serverTimestamp(),
        // Actualizar foto/nombre por si cambió en Google
        foto:fbUser.photoURL||userData.foto||'',
        nombre:userData.nombre||fbUser.displayName||email.split('@')[0]
      }).catch(()=>{});
    }

    AUTH.user=userData;
    AUTH.ready=true;

    // Ocultar login, mostrar app
    document.getElementById('login-overlay').style.display='none';
    // Mostrar badge de usuario
    const badge=document.getElementById('user-badge');
    badge.style.display='flex';
    document.getElementById('user-name').textContent=userData.nombre||email;
    const rolInfo=ROLES[userData.rol]||ROLES.consulta;
    document.getElementById('user-role').innerHTML=`${rolInfo.icon} ${rolInfo.label}`;
    if(userData.foto){
      const av=document.getElementById('user-avatar');
      av.src=userData.foto;av.style.display='';
    }
    // Bloque de usuario en el nav móvil
    const nub=document.getElementById('nav-user-block-m');
    if(nub){
      nub.style.display='';
      document.getElementById('nav-user-name-m').textContent=userData.nombre||email;
      document.getElementById('nav-user-role-m').innerHTML=`${rolInfo.icon} ${rolInfo.label}`;
    }
    // Mostrar item Usuarios si es admin
    if(esAdmin()){
      document.getElementById('nav-usuarios').style.display='';
      const na=document.getElementById('nav-auditlog');if(na)na.style.display='';
    }
    logAccion('Inició sesión','');
    // Aplicar filtros de permisos a la UI
    aplicarPermisosUI();
    // Iniciar la app si aún no ha iniciado
    if(!window._appInited){window._appInited=true;(_onAuthReady||(()=>{}))();}
  }catch(e){
    console.error('Error verificando usuario:',e);
    errEl.style.display='';loadEl.style.display='none';
    errEl.textContent='Error verificando permisos: '+e.message;
  }
}

function mostrarLogin(){
  document.getElementById('login-overlay').style.display='flex';
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-loading').style.display='none';
  document.getElementById('login-success').style.display='none';
  const btn=document.getElementById('btn-submit-login');
  if(btn){btn.disabled=false;btn.style.opacity='1';}
  document.getElementById('user-badge').style.display='none';
  AUTH.user=null;
}

async function logout(){
  if(!confirm('¿Cerrar sesión?'))return;
  try{await AUTH.auth.signOut();}catch(e){}
  location.reload();
}

// Ocultar items del nav para secciones sin acceso
function aplicarPermisosUI(){
  document.querySelectorAll('.nav-item[data-s]').forEach(item=>{
    const s=item.getAttribute('data-s');
    if(s==='usuarios')return; // se maneja aparte (solo admin)
    if(!puedeVer(s))item.style.display='none';
    else item.style.display='';
  });
}


export {ROLES, SECCIONES, permisosDeRol, permiso, puedeVer, puedeEditar, esAdmin, initAuth, LOGIN_MODE, toggleLoginMode, submitLogin, recuperarPassword, verificarUsuarioAutorizado, mostrarLogin, logout, aplicarPermisosUI};
