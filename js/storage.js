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

  window.storage={
    async get(key){
      // Preferir remoto si Firestore está online, si no hay local
      const local=getLocal(key);
      if(FS.enabled){
        const remote=await getRemote(key);
        if(remote){setLocal(key,remote.value);return remote;} // sincronizar local
      }
      return local;
    },
    async set(key,value){
      setLocal(key,value); // siempre escribir local primero (rápido, offline-safe)
      setRemote(key,value); // fire-and-forget al remoto
      return {key,value};
    },
    async delete(key){
      delLocal(key);
      delRemote(key);
      return {key,deleted:true};
    },
    async list(prefixArg){
      try{const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix)){const base=k.slice(prefix.length);if(!prefixArg||base.startsWith(prefixArg))keys.push(base);}}return {keys};}
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
