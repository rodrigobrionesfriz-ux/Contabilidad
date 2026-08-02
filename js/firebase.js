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
    // Probar conexión con un read simple
    await FS.db.collection('_meta').doc('ping').get();
    FS.enabled=true;
    fsStatusSet('online');
    console.log('✓ Firestore conectado');
  }catch(e){
    console.error('Error Firestore:',e);
    fsStatusSet('error',e.code||e.message);
  }
}


// logAccion — registro de auditoría (escritura). Vive aquí (capa infraestructura)
// para no depender de auth.js y evitar ciclos. Lee AUTH/S de state.
function logAccion(accion,detalle){
  if(!FS.enabled||!FS.db)return;
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

export {FS, fsStatusSet, initFirestore, FIREBASE_CONFIG, logAccion};
