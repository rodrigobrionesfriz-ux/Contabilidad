// acl.js — Lista de control de acceso por empresa (para las reglas de Firestore)
//
// ¿Por qué existe este módulo?
// El catálogo de empresas (`_empresas`) se guarda como un STRING JSON dentro de
// un documento. Las reglas de seguridad de Firestore no saben parsear JSON, así
// que no pueden preguntarle a ese documento quién es el dueño de "emp1".
//
// Solución: una colección paralela, legible por las reglas, con un documento
// por empresa y campos planos:
//
//   empresas_acl/emp1 = {
//     nombre:    'Vivero La Cabaña',
//     creadoPor: 'rodrigo@ejemplo.cl',
//     miembros:  ['rodrigo@ejemplo.cl','ana@ejemplo.cl'],   // dueño incluido
//     ts:        <serverTimestamp>
//   }
//
// Las reglas leen `empresas_acl/<empresa>` y comprueban que el email del usuario
// esté en `miembros`. Este módulo mantiene esos documentos sincronizados con el
// catálogo cada vez que se crea, comparte, reclama o elimina una empresa.
//
// El campo `miembros` es la fuente de verdad para las REGLAS; el catálogo lo
// sigue siendo para la INTERFAZ. Si los dos se desincronizan, "Reparar accesos"
// en Configuración → Sistema los vuelve a igualar.

import {FS} from './firebase.js';

const COLL='empresas_acl';

export const aclDisponible=()=>!!(FS.enabled&&FS.db);

// Miembros de una empresa = dueño + compartidos, en minúsculas y sin repetir
export function miembrosDe(e){
  const lista=[String(e.creadoPor||'').trim().toLowerCase(),
               ...((e.compartidaCon||[]).map(x=>String(x).trim().toLowerCase()))];
  return [...new Set(lista.filter(Boolean))];
}

// Último error de escritura, para poder explicarlo en pantalla
export const ACL_ERR={ultimo:null};
export const esErrorPermisos=msg=>/permission|insufficient|permisos/i.test(String(msg||''));

// Escribe (o actualiza) el documento ACL de una empresa
export async function guardarACLEmpresa(e){
  if(!aclDisponible()||!e||!e.id)return false;
  try{
    await FS.db.collection(COLL).doc(e.id).set({
      nombre:e.nombre||'',
      creadoPor:String(e.creadoPor||'').trim().toLowerCase(),
      miembros:miembrosDe(e),
      ts:firebase.firestore.FieldValue.serverTimestamp(),
    },{merge:true});
    return true;
  }catch(err){console.warn('ACL set',e.id,err);ACL_ERR.ultimo=err.message||String(err);return false;}
}

export async function borrarACLEmpresa(id){
  if(!aclDisponible()||!id)return false;
  try{await FS.db.collection(COLL).doc(id).delete();return true;}
  catch(err){console.warn('ACL del',id,err);return false;}
}

// Sincroniza TODO el catálogo. Se llama en la migración y en "Reparar accesos".
// No borra ACLs de empresas que ya no están en el catálogo salvo que se pida.
export async function sincronizarACL(empresas,{limpiarSobrantes=false}={}){
  if(!aclDisponible())return {escritos:0,borrados:0,error:'Firestore no está disponible'};
  let escritos=0,borrados=0;
  ACL_ERR.ultimo=null;
  for(const e of empresas){ if(await guardarACLEmpresa(e))escritos++; }
  if(!escritos&&empresas.length&&ACL_ERR.ultimo)return {escritos:0,borrados:0,error:ACL_ERR.ultimo};
  if(limpiarSobrantes){
    try{
      const vivos=new Set(empresas.map(e=>e.id));
      const snap=await FS.db.collection(COLL).get();
      for(const doc of snap.docs){
        if(!vivos.has(doc.id)){await doc.ref.delete();borrados++;}
      }
    }catch(err){console.warn('ACL limpieza',err);}
  }
  return {escritos,borrados};
}

// Compara catálogo vs ACL y devuelve las diferencias (para el diagnóstico)
export async function diagnosticarACL(empresas){
  if(!aclDisponible())return {ok:false,error:'Firestore no está disponible'};
  const faltantes=[],desfasadas=[],sobrantes=[];
  let snap;
  try{snap=await FS.db.collection(COLL).get();}
  catch(err){return {ok:false,error:err.message};}
  const porId={};snap.forEach(d=>{porId[d.id]=d.data()||{};});
  for(const e of empresas){
    const a=porId[e.id];
    if(!a){faltantes.push(e.nombre||e.id);continue;}
    const esperado=miembrosDe(e).slice().sort().join(',');
    const actual=(a.miembros||[]).map(x=>String(x).toLowerCase()).sort().join(',');
    if(esperado!==actual)desfasadas.push(e.nombre||e.id);
  }
  const vivos=new Set(empresas.map(e=>e.id));
  Object.keys(porId).forEach(id=>{if(!vivos.has(id))sobrantes.push(id);});
  return {ok:true,total:Object.keys(porId).length,faltantes,desfasadas,sobrantes};
}
