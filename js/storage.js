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
  // ── Campo `empresa` ──
  // Las reglas de Firestore no pueden leer el prefijo del id del documento en
  // una consulta, así que cada documento lleva además un campo `empresa` con
  // el id de la empresa dueña (o '_global' para el catálogo y la config).
  // Las reglas endurecidas exigen que este campo coincida con el prefijo del id.
  function empresaDeClave(key){
    if(!key||key[0]==='_')return '_global';
    const i=key.indexOf(':');
    return i>0?key.slice(0,i):'_global';
  }

  async function setRemote(key,value){
    if(!FS.enabled||!FS.db)return false;
    try{
      FS.pendingWrites++;fsStatusSet('syncing');
      await FS.db.collection(COLL).doc(key).set({value,empresa:empresaDeClave(key),ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
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
    //
    // `ids` = empresas que el usuario puede ver. Se consulta una vez por empresa
    // (más '_global' para el catálogo) en vez de traer la colección completa:
    // con las reglas endurecidas una consulta sin filtro se rechaza entera,
    // porque Firestore no puede garantizar que todos los resultados sean legibles.
    // Si no se pasan ids se cae a la consulta antigua (reglas permisivas).
    async syncAllFromRemote(ids){
      if(!FS.enabled||!FS.db)return {count:0};
      const guardar=snap=>{let n=0;snap.forEach(doc=>{const d=doc.data();if(d&&d.value!==undefined){setLocal(doc.id,d.value);n++;}});return n;};
      try{
        if(Array.isArray(ids)&&ids.length){
          let count=0;
          for(const emp of ['_global',...ids]){
            const snap=await FS.db.collection(COLL).where('empresa','==',emp).get();
            count+=guardar(snap);
          }
          return {count};
        }
        return {count:guardar(await FS.db.collection(COLL).get())};
      }catch(e){console.error('syncAllFromRemote',e);return {count:0,error:e.message};}
    },

    // Recorre la colección y devuelve los documentos SIN campo `empresa`.
    // Sólo funciona con las reglas antiguas (hace un list sin filtro): se usa
    // exactamente una vez, en la migración previa a publicar las reglas nuevas.
    async docsSinEmpresa(){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      const snap=await FS.db.collection(COLL).get();
      const faltan=[];let total=0;
      snap.forEach(doc=>{total++;const d=doc.data()||{};if(d.empresa===undefined)faltan.push(doc.id);});
      return {total,faltan};
    },

    // ── Verificación con las reglas endurecidas ya publicadas ──
    // Ahí `docsSinEmpresa()` deja de funcionar a propósito: una consulta sin
    // filtro se rechaza entera, porque Firestore no puede garantizar de antemano
    // que todos los resultados sean legibles. Es la señal de que el aislamiento
    // está activo, no un error.
    //
    // En ese modo se cuenta lo ALCANZABLE (una consulta filtrada por empresa) y
    // se contrasta con lo que hay en este dispositivo: si algo está guardado
    // acá pero no aparece en la nube, es un documento sin marcar que quedó
    // fuera del alcance de las reglas.
    async docsAlcanzables(ids){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      const porEmpresa={};let total=0;
      for(const emp of ['_global',...(ids||[])]){
        const snap=await FS.db.collection(COLL).where('empresa','==',emp).get();
        const vistos=new Set();snap.forEach(d=>vistos.add(d.id));
        porEmpresa[emp]=[...vistos];total+=vistos.size;
      }
      return {total,porEmpresa};
    },
    // Claves guardadas en este dispositivo que corresponden a esas empresas
    clavesLocales(ids){
      const set=new Set(ids||[]);const claves=[];
      try{
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(!k||!k.startsWith(prefix))continue;
          const base=k.slice(prefix.length);
          const emp=empresaDeClave(base);
          if(emp==='_global'||set.has(emp))claves.push(base);
        }
      }catch(e){}
      return claves;
    },
    // Repara documentos que existen en este dispositivo pero no se alcanzan en
    // la nube: los vuelve a subir, y al subirlos quedan marcados con su empresa.
    async repararDocs(claves,onProgreso){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      let hechos=0,fallos=0;
      for(const clave of claves){
        const local=getLocal(clave);
        if(local===null||local.value===undefined){fallos++;continue;}
        if(await setRemote(clave,local.value))hechos++;else fallos++;
        if(onProgreso)onProgreso(hechos+fallos,claves.length);
      }
      return {hechos,fallos};
    },

    // Estampa el campo `empresa` en los documentos que no lo tienen.
    async estamparEmpresa(ids,onProgreso){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      let hechos=0;
      for(let i=0;i<ids.length;i+=400){
        const lote=FS.db.batch();
        ids.slice(i,i+400).forEach(id=>lote.update(FS.db.collection(COLL).doc(id),{empresa:empresaDeClave(id)}));
        await lote.commit();
        hechos+=Math.min(400,ids.length-i);
        if(onProgreso)onProgreso(hechos,ids.length);
      }
      return {hechos};
    }
  };
})();
