// storage.js — Shim de persistencia (Firestore + localStorage)
// Instala window.storage. Depende de firebase (FS).

import {FS, fsStatusSet} from './firebase.js';

// ═══ SHIM DE STORAGE — Firestore + localStorage fallback ═══
// Estrategia: siempre escribir a AMBOS (localStorage para velocidad + Firestore para nube).
// Lectura: prioriza Firestore si está online, cae a localStorage si no.
(function(){
  if(typeof window==='undefined')return;
  if(window.storage&&typeof window.storage.get==='function'&&typeof window.storage.set==='function')return;
  const prefix='cv:';
  const COLL='contabilidad_data'; // colección Firestore

  function getLocal(key){try{const v=localStorage.getItem(prefix+key);return v!==null?{key,value:v}:null;}catch(e){return null;}}
  function setLocal(key,value){try{localStorage.setItem(prefix+key,value);return true;}catch(e){return false;}}
  function delLocal(key){try{localStorage.removeItem(prefix+key);}catch(e){}}

  async function getRemote(key){
    if(!FS.enabled||!FS.db)return null;
    try{
      const doc=await FS.db.collection(COLL).doc(key).get();
      if(doc.exists){const d=doc.data();return d&&d.value!==undefined?{key,value:d.value}:null;}
      return null;
    }catch(e){console.warn('FS get',key,e);return null;}
  }
  async function setRemote(key,value){
    if(!FS.enabled||!FS.db)return false;
    try{
      FS.pendingWrites++;fsStatusSet('syncing');
      await FS.db.collection(COLL).doc(key).set({value,ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      FS.pendingWrites--;FS.lastSaveTs=Date.now();
      if(FS.pendingWrites===0)fsStatusSet('saved');
      return true;
    }catch(e){
      FS.pendingWrites--;
      fsStatusSet('error',e.code||e.message);
      console.warn('FS set',key,e);
      return false;
    }
  }
  async function delRemote(key){
    if(!FS.enabled||!FS.db)return;
    try{await FS.db.collection(COLL).doc(key).delete();}catch(e){console.warn('FS del',key,e);}
  }

  // ── Prefijo multiempresa ──
  // Todas las claves de datos se guardan como "<empresaId>:<clave>", de modo que
  // cada empresa queda aislada sin tocar los módulos que llaman a storage.
  // Las claves del catálogo (_empresas, _empresaActiva) usan getGlobal/setGlobal
  // y NO llevan prefijo.
  let empresaId='emp1';
  const K=key=>empresaId+':'+key;   // clave con prefijo de empresa

  window.storage={
    // Cambia la empresa activa (lo llama empresas.js)
    setPrefijo(id){empresaId=id||'emp1';},
    getPrefijo(){return empresaId;},

    // ── API con prefijo (datos de la empresa activa) ──
    async get(key){
      const k=K(key);
      const local=getLocal(k);
      if(FS.enabled){
        const remote=await getRemote(k);
        if(remote){setLocal(k,remote.value);return {key,value:remote.value};}
      }
      return local?{key,value:local.value}:null;
    },
    async set(key,value){
      const k=K(key);
      setLocal(k,value);
      setRemote(k,value);
      // Avisar al control de salida que se guardó (si está cargado)
      try{ if(window.__marcarGuardado)window.__marcarGuardado(); }catch(e){}
      return {key,value};
    },
    async delete(key){
      const k=K(key);
      delLocal(k);delRemote(k);
      return {key,deleted:true};
    },

    // ── API sin prefijo (catálogo de empresas, config global) ──
    async getGlobal(key){
      const local=getLocal(key);
      if(FS.enabled){
        const remote=await getRemote(key);
        if(remote){setLocal(key,remote.value);return remote;}
      }
      return local;
    },
    async setGlobal(key,value){
      setLocal(key,value);setRemote(key,value);
      return {key,value};
    },

    async list(prefixArg){
      try{const keys=[];const pref=empresaId+':';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix)){let base=k.slice(prefix.length);if(!base.startsWith(pref))continue;base=base.slice(pref.length);if(!prefixArg||base.startsWith(prefixArg))keys.push(base);}}return {keys};}
      catch(e){return {keys:[]};}
    },
    // Sincronizar todo local → remoto (usado tras conectar por primera vez)
    async syncAllToRemote(){
      if(!FS.enabled)return {count:0};
      let count=0;
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k||!k.startsWith(prefix))continue;
        const base=k.slice(prefix.length);
        const v=localStorage.getItem(k);
        if(v!==null){await setRemote(base,v);count++;}
      }
      return {count};
    },
    // Sincronizar todo remoto → local (usado al abrir en un dispositivo nuevo)
    async syncAllFromRemote(){
      if(!FS.enabled||!FS.db)return {count:0};
      try{
        const snap=await FS.db.collection(COLL).get();
        let count=0;
        snap.forEach(doc=>{const d=doc.data();if(d&&d.value!==undefined){setLocal(doc.id,d.value);count++;}});
        return {count};
      }catch(e){console.error('syncAllFromRemote',e);return {count:0,error:e.message};}
    }
  };
})();
