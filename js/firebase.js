// firebase.js — Conexión Firestore (usa firebase global del CDN)
// Depende solo del SDK de Firebase cargado por <script> en index.html
import {AUTH, S} from './state.js';

// ═══ CONFIGURACIÓN FIREBASE ═══
const FIREBASE_CONFIG={
  apiKey:"AIzaSyCm6Kh1733lBcbakAP8b9-dPxltM3REhUc",
  authDomain:"contabilidad-me.firebaseapp.com",
  projectId:"contabilidad-me",
  storageBucket:"contabilidad-me.firebasestorage.app",
  messagingSenderId:"87660185304",
  appId:"1:87660185304:web:1eab12e9bc042488bdb9ad"
};

// Estado global de Firestore
let FS={
  db:null,           // instancia de Firestore
  enabled:false,     // true cuando se conecta OK
  status:'offline',  // 'offline'|'connecting'|'online'|'syncing'|'saved'|'error'
  lastError:null,
  lastSaveTs:null,
  pendingWrites:0
};

function fsStatusSet(status,msg){
  FS.status=status;FS.lastError=msg||null;
  const el=document.getElementById('fs-indicator');if(!el)return;
  const cfg={
    offline:{ico:'⚪',txt:'Sin nube',col:'var(--mt)'},
    connecting:{ico:'🔄',txt:'Conectando...',col:'var(--info)'},
    online:{ico:'☁️',txt:'Firestore OK',col:'var(--ach)'},
    syncing:{ico:'⏫',txt:'Guardando...',col:'var(--info)'},
    saved:{ico:'✓',txt:'Guardado en nube '+(FS.lastSaveTs?new Date(FS.lastSaveTs).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''),col:'var(--ach)'},
    error:{ico:'⚠️',txt:msg||'Error nube',col:'var(--err)'}
  };
  const c=cfg[status]||cfg.offline;
  el.innerHTML=`<span>${c.ico}</span><span style="color:${c.col}">${c.txt}</span>`;
}

// Inicializar Firebase — asíncrono, no bloquea la app
async function initFirestore(){
  if(typeof firebase==='undefined'){
    console.warn('Firebase SDK no cargado (sin internet?). Usando solo localStorage.');
    fsStatusSet('offline');
    return;
  }
  try{
    fsStatusSet('connecting');
    if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
    FS.db=firebase.firestore();
    // Habilitar persistencia offline (para que funcione sin internet)
    try{await FS.db.enablePersistence({synchronizeTabs:true});}catch(e){/* ya habilitada o multi-tab */}
    // Probar conexión con un read simple. Con tope de tiempo: sin él, en una
    // red móvil dormida esta promesa se queda colgada y todo lo que espera a
    // Firestore se queda esperando con ella.
    await Promise.race([
      FS.db.collection('_meta').doc('ping').get(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('sin respuesta en 8s')),8000)),
    ]);
    FS.enabled=true;
    fsStatusSet('online');
    console.log('✓ Firestore conectado');
  }catch(e){
    console.error('Error Firestore:',e);
    fsStatusSet('error',e.code||e.message);
    reintentarConexion();
  }
}

// Volver a intentar la conexión sola cuando la red vuelva.
// Antes, si el primer intento fallaba, la app se quedaba en modo local hasta
// que alguien recargara la página — justo lo que pasa al reabrir la app en el
// teléfono antes de que el móvil enganche.
let _reintento=null;
function reintentarConexion(){
  if(_reintento||FS.enabled||!FS.db)return;
  const probar=async()=>{
    if(FS.enabled){clearInterval(_reintento);_reintento=null;return;}
    try{
      fsStatusSet('connecting');
      await Promise.race([
        FS.db.collection('_meta').doc('ping').get(),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000)),
      ]);
      FS.enabled=true;
      fsStatusSet('online');
      clearInterval(_reintento);_reintento=null;
      console.log('✓ Firestore reconectado');
    }catch(e){ fsStatusSet('error',e.code||e.message); }
  };
  _reintento=setInterval(probar,20000);
  // Si el navegador avisa que volvió la red, no esperar al próximo turno
  try{window.addEventListener('online',probar);}catch(e){}
}


// ═══ QUÉ SE AUDITA ═══
//
// El registro era una bitácora de todo: inicios de sesión, exportaciones,
// cambios de indicadores… y con eso se volvía ilegible justo cuando hace falta,
// que es al buscar quién tocó un comprobante. Ahora sólo entra lo que MODIFICA
// o DESTRUYE un comprobante ya registrado; lo demás se descarta en silencio.
//
// La política vive aquí y no en cada llamada: así se lee de un vistazo y una
// llamada nueva no se cuela en el registro sin pasar por esta lista.
const ACCIONES_AUDITADAS=[
  // Asientos y comprobantes
  /^(Editó|Eliminó|Anuló|Reactivó) asiento/i,
  /^Editó (asiento manual|balance de apertura) desde Comprobantes/i,
  /^Convertió comprobante auto/i,
  /^Eliminó (documento|apertura)/i,
  // Documentos de los libros, que son los comprobantes automáticos
  /^Editó (venta|compra)$/i,
  /^Eliminó (ventas|compras) masivamente$/i,
  // Borrar una empresa con sus datos elimina TODOS sus comprobantes de una vez:
  // es la eliminación más grande que permite el sistema y por eso queda.
  /^Eliminó empresa \(con datos\)$/i,
  /^Asignó centro de costo/i,
];
const seAudita=accion=>ACCIONES_AUDITADAS.some(re=>re.test(String(accion||'')));

// logAccion — registro de auditoría (escritura). Vive aquí (capa infraestructura)
// para no depender de auth.js y evitar ciclos. Lee AUTH/S de state.
function logAccion(accion,detalle){
  if(!FS.enabled||!FS.db)return;
  if(!seAudita(accion))return;
  try{
    const email=(AUTH.user&&AUTH.user.email)||'desconocido';
    const nombre=(AUTH.user&&AUTH.user.nombre)||email;
    FS.db.collection('audit_log').add({
      accion,detalle:detalle||'',
      usuario:email,nombre,
      anio:S.empresa.anio,
      ts:firebase.firestore.FieldValue.serverTimestamp(),
      tsLocal:new Date().toISOString()
    }).catch(()=>{});
  }catch(e){}
}

export {FS, fsStatusSet, initFirestore, FIREBASE_CONFIG, logAccion, seAudita, ACCIONES_AUDITADAS};
