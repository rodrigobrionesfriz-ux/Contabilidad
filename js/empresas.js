// empresas.js — Gestión multiempresa.
// Cada empresa tiene sus datos completamente aislados: el prefijo de storage
// separa ventas, compras, asientos, PDC, indicadores, etc.
//
// Claves en storage:
//   _empresas          → catálogo [{id,nombre,rut,marco}]
//   _empresaActiva     → id de la empresa en uso
//   <id>:ventas-2026   → datos de esa empresa (el prefijo lo aplica storage.js)

import {toast} from './core.js';
import {AUTH} from './state.js';
import {guardarACLEmpresa, borrarACLEmpresa, miembrosDe, aclDisponible} from './acl.js';

// Marcos contables disponibles
export const MARCOS=[
  {id:'tributaria', nm:'Tributaria chilena (PCGA)', desc:'Orientada al SII: F29, PPM, depreciación tabla SII, corrección monetaria Art. 41.'},
  {id:'ifrs-pyme',  nm:'NIIF para PYMEs',           desc:'Estados financieros de propósito general. Sin corrección monetaria; deterioro y valor razonable.'},
  {id:'ifrs-full',  nm:'NIIF plenas (IFRS Full)',   desc:'Norma completa. Para entidades con obligación pública de rendir cuentas.'},
];
export const marcoInfo=id=>MARCOS.find(m=>m.id===id)||MARCOS[0];

// ── Visibilidad por usuario ──
// Cada empresa guarda quién la creó (`creadoPor`, el email) y con quién está
// compartida (`compartidaCon`, lista de emails). Un usuario ve sus empresas,
// las que le compartieron y las heredadas (las que existían antes de este
// cambio, que no tienen dueño y quedan visibles para todos hasta que alguien
// las reclame). Los administradores ven todo el catálogo.
//
// IMPORTANTE: esto es visibilidad de interfaz, no aislamiento de datos. Los
// documentos siguen en la misma colección de Firestore y las reglas actuales
// permiten leerlos a cualquier usuario activo. Para aislamiento real hay que
// endurecer las reglas (ver README).
export const EMPRESAS={
  lista:[],      // visibles para el usuario en sesión
  todas:[],      // catálogo completo (lo que se persiste)
  activa:null,
};

const emailActual=()=>((AUTH.user&&AUTH.user.email)||'').toLowerCase();
const esAdminActual=()=>!!(AUTH.user&&AUTH.user.activo&&AUTH.user.rol==='admin');

export const empresaSinDuenio=e=>!e.creadoPor;
export function puedeVerEmpresa(e){
  if(!e)return false;
  if(esAdminActual())return true;              // el admin administra todo el catálogo
  if(empresaSinDuenio(e))return true;          // heredada: visible hasta que se reclame
  const yo=emailActual();
  if(!yo)return true;                          // sin sesión identificada, no ocultamos nada
  if(String(e.creadoPor).toLowerCase()===yo)return true;
  return (e.compartidaCon||[]).some(x=>String(x).toLowerCase()===yo);
}
export const esDuenioDeEmpresa=e=>!!e&&String(e.creadoPor||'').toLowerCase()===emailActual();

// Recalcula la lista visible a partir del catálogo completo
export function aplicarVisibilidad(){
  EMPRESAS.lista=EMPRESAS.todas.filter(puedeVerEmpresa);
  return EMPRESAS.lista;
}

// Clave de empresa activa POR USUARIO: antes era global y dos usuarios se
// pisaban la selección entre sí.
const claveActiva=()=>{
  const yo=emailActual();
  return yo?'_empresaActiva:'+yo:'_empresaActiva';
};

// ── Migración desde monoempresa ──
// Los datos antiguos se guardaron sin prefijo (ej "ventas-2026"). Al pasar a
// multiempresa las claves llevan "emp1:", así que hay que renombrarlas una vez.
// Si no se hiciera, la app arrancaría vacía aunque los datos siguieran ahí.
const CLAVES_DATOS=['empresa','pdc','pdc_v','activos','trabajadores'];
const PREFIJOS_ANUALES=['ventas-','compras-','honorarios-','asientos-','apertura-'];

export async function migrarSiHaceFalta(){
  try{
    const yaHecha=await window.storage.getGlobal('_migrado_multiempresa');
    if(yaHecha&&yaHecha.value==='1')return {migradas:0,yaHecha:true};
  }catch(e){}

  const LS_PREFIX='cv:';
  let migradas=0;
  try{
    // Recolectar claves antiguas (sin "empN:" y que sean de datos)
    const antiguas=[];
    for(let i=0;i<localStorage.length;i++){
      const full=localStorage.key(i);
      if(!full||!full.startsWith(LS_PREFIX))continue;
      const base=full.slice(LS_PREFIX.length);
      if(base.startsWith('_'))continue;           // catálogo
      if(/^emp[a-z0-9]+:/.test(base))continue;    // ya migrada
      const esDato=CLAVES_DATOS.includes(base)||PREFIJOS_ANUALES.some(p=>base.startsWith(p));
      if(esDato)antiguas.push(base);
    }
    // Copiar a la clave con prefijo emp1 (conservando la original por seguridad)
    for(const base of antiguas){
      const valor=localStorage.getItem(LS_PREFIX+base);
      if(valor===null)continue;
      const nueva=LS_PREFIX+'emp1:'+base;
      if(localStorage.getItem(nueva)===null){
        localStorage.setItem(nueva,valor);
        migradas++;
      }
    }
    await window.storage.setGlobal('_migrado_multiempresa','1');
  }catch(e){console.warn('Migración multiempresa:',e);}
  return {migradas,yaHecha:false};
}

// ── Catálogo ──
export async function cargarEmpresas(){
  try{
    const r=await window.storage.getGlobal('_empresas');
    EMPRESAS.todas=r?JSON.parse(r.value):[];
  }catch(e){EMPRESAS.todas=[];}
  // Empresa activa: primero la del usuario, si no la global (compatibilidad)
  EMPRESAS.activa=null;
  try{
    const r=await window.storage.getGlobal(claveActiva());
    if(r)EMPRESAS.activa=r.value;
  }catch(e){}
  if(!EMPRESAS.activa){
    try{
      const r=await window.storage.getGlobal('_empresaActiva');
      EMPRESAS.activa=r?r.value:null;
    }catch(e){}
  }
  // Si no hay ninguna, crear la empresa por defecto (migración desde monoempresa)
  if(!EMPRESAS.todas.length){
    const def={id:'emp1',nombre:'Mi Empresa',rut:'',marco:'tributaria',
      creada:new Date().toISOString(),creadoPor:emailActual()||'',compartidaCon:[]};
    EMPRESAS.todas=[def];
    EMPRESAS.activa='emp1';
    await guardarCatalogo();
  }
  aplicarVisibilidad();
  // Si el usuario no puede ver la empresa activa, cae a la primera visible.
  // Si no tiene ninguna visible, se le crea una propia: nunca queda sin trabajar.
  if(!EMPRESAS.activa||!EMPRESAS.lista.find(e=>e.id===EMPRESAS.activa)){
    if(!EMPRESAS.lista.length){
      const nombre=(AUTH.user&&AUTH.user.nombre)?`Empresa de ${AUTH.user.nombre}`:'Mi Empresa';
      const id=await crearEmpresa(nombre,'','tributaria');
      EMPRESAS.activa=id;
    }else{
      EMPRESAS.activa=EMPRESAS.lista[0].id;
    }
    await window.storage.setGlobal(claveActiva(),EMPRESAS.activa);
  }
  return EMPRESAS;
}

// Firma de acceso de una empresa: si no cambió, no hace falta reescribir su ACL
const firmaACL=e=>`${String(e.creadoPor||'').toLowerCase()}|${miembrosDe(e).sort().join(',')}|${e.nombre||''}`;
const ULTIMA_ACL={};   // id → firma escrita en esta sesión

// Replica en `empresas_acl` los cambios de dueño/compartidos, porque las reglas
// de Firestore no pueden leer el catálogo (es un JSON dentro de un string).
async function refrescarACL(){
  if(!aclDisponible())return;
  for(const e of EMPRESAS.todas){
    const f=firmaACL(e);
    if(ULTIMA_ACL[e.id]===f)continue;
    if(await guardarACLEmpresa(e))ULTIMA_ACL[e.id]=f;
  }
}

export async function guardarCatalogo(){
  // Se persiste el catálogo COMPLETO: si se guardara sólo lo visible, un
  // usuario borraría del catálogo las empresas de los demás sin querer.
  await window.storage.setGlobal('_empresas',JSON.stringify(EMPRESAS.todas));
  if(EMPRESAS.activa)await window.storage.setGlobal(claveActiva(),EMPRESAS.activa);
  aplicarVisibilidad();
  refrescarACL();   // en segundo plano: no debe frenar el guardado
}

export const empresaActiva=()=>EMPRESAS.todas.find(e=>e.id===EMPRESAS.activa)||null;

// ── Operaciones ──
export async function crearEmpresa(nombre,rut,marco){
  // El id debe ser único aunque se creen dos empresas en el mismo milisegundo
  // (pasaba al auto-crear la empresa de un usuario justo después de otra).
  let id='emp'+Date.now().toString(36);
  while(EMPRESAS.todas.some(e=>e.id===id))id='emp'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  EMPRESAS.todas.push({id,nombre,rut:rut||'',marco:marco||'tributaria',
    creada:new Date().toISOString(),
    creadoPor:emailActual()||'',      // dueño = quien la crea
    compartidaCon:[]});
  await guardarCatalogo();
  return id;
}

// ── Compartir y traspasar ──
export async function compartirEmpresa(id,emails){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  const limpios=[...new Set((emails||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))]
    .filter(x=>x!==String(e.creadoPor||'').toLowerCase());   // el dueño no se auto-comparte
  e.compartidaCon=limpios;
  await guardarCatalogo();
  return true;
}
// Reclama una empresa heredada (sin dueño) o traspasa el dueño (solo admin)
export async function asignarDuenio(id,email){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  e.creadoPor=String(email||'').trim().toLowerCase();
  e.compartidaCon=(e.compartidaCon||[]).filter(x=>String(x).toLowerCase()!==e.creadoPor);
  await guardarCatalogo();
  return true;
}

// Elimina una empresa del catálogo y opcionalmente todos sus datos del storage.
// Si `borrarDatos` es true, recorre localStorage buscando las claves con
// el prefijo de esa empresa (`emp1:ventas-2026`, etc.) y las elimina.
// En Firestore no se puede borrar todo desde el cliente sin listar la colección;
// se dejan huérfanos y quedan invisibles porque ya no aparece la empresa.
export async function eliminarEmpresa(id,borrarDatos=false){
  if(EMPRESAS.lista.length<=1)throw new Error('Debe existir al menos una empresa');
  const era=EMPRESAS.activa===id;
  EMPRESAS.todas=EMPRESAS.todas.filter(e=>e.id!==id);
  borrarACLEmpresa(id);
  aplicarVisibilidad();
  if(era)EMPRESAS.activa=(EMPRESAS.lista[0]||EMPRESAS.todas[0]||{}).id||null;
  await guardarCatalogo();

  if(borrarDatos){
    // Recorrer localStorage y borrar todas las claves de esta empresa.
    // El storage guarda como `<prefijoInstancia><empresaId>:<clave>` o
    // directamente `<empresaId>:<clave>` según cómo esté configurado.
    // Debemos matchear el prefijo de empresa como un segmento COMPLETO
    // seguido de ":" para no confundir "emp1" con "emp10".
    const aBorrar=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k)continue;
        // Coincidencia: empieza con "id:" o contiene ":id:"
        if(k===id||k.startsWith(id+':')||k.includes(':'+id+':')){
          aBorrar.push(k);
        }
      }
    }catch(e){}
    aBorrar.forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
    return {borradas:aBorrar.length};
  }
  return {borradas:0};
}

// ── Recuperar una empresa borrada del catálogo ──
// Eliminar sin marcar "borrar datos" sólo saca la empresa del catálogo: sus
// claves (`<id>:ventas-2026`, `<id>:empresa`, …) siguen enteras. Esto las busca
// y permite volver a registrarla con SU MISMO id, que es lo que hace que los
// datos vuelvan a aparecer.
export function empresasHuerfanas(){
  const LS='cv:';
  const conocidas=new Set(EMPRESAS.todas.map(e=>e.id));
  const porId={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const full=localStorage.key(i);
      if(!full||!full.startsWith(LS))continue;
      const base=full.slice(LS.length);
      const m=base.match(/^(emp[a-z0-9]+):(.+)$/);
      if(!m)continue;
      const [,id,clave]=m;
      if(conocidas.has(id))continue;
      (porId[id]=porId[id]||{id,claves:0,nombre:'',rut:'',anios:new Set()}).claves++;
      // La ficha de la empresa guarda su nombre: se recupera tal cual estaba
      if(clave==='empresa'){
        try{
          const d=JSON.parse(localStorage.getItem(full)||'{}');
          porId[id].nombre=d.nombre||'';porId[id].rut=d.rut||'';
        }catch(e){}
      }
      const my=clave.match(/-(\d{4})$/);
      if(my)porId[id].anios.add(my[1]);
    }
  }catch(e){}
  return Object.values(porId)
    .map(x=>({...x,anios:[...x.anios].sort()}))
    .sort((a,b)=>b.claves-a.claves);
}

// Vuelve a registrar una empresa huérfana conservando su id
export async function recuperarEmpresa(id,nombre,rut){
  if(EMPRESAS.todas.some(e=>e.id===id))return false;
  EMPRESAS.todas.push({
    id,
    nombre:nombre||'Empresa recuperada',
    rut:rut||'',
    marco:'tributaria',
    creada:new Date().toISOString(),
    creadoPor:emailActual()||'',
    compartidaCon:[],
    recuperada:new Date().toISOString(),
  });
  await guardarCatalogo();
  return true;
}

export async function actualizarEmpresa(id,campos){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return;
  Object.assign(e,campos);
  await guardarCatalogo();
}

// Cambia la empresa activa. Requiere recargar los datos (lo hace app.js).
export async function activarEmpresa(id){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  if(!puedeVerEmpresa(e)){toast('⚠️ No tienes acceso a esa empresa','e');return false;}
  EMPRESAS.activa=id;
  await window.storage.setGlobal(claveActiva(),id);
  window.storage.setPrefijo(id);
  return true;
}
