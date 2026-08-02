// empresas.js — Gestión multiempresa.
// Cada empresa tiene sus datos completamente aislados: el prefijo de storage
// separa ventas, compras, asientos, PDC, indicadores, etc.
//
// Claves en storage:
//   _empresas          → catálogo [{id,nombre,rut,marco}]
//   _empresaActiva     → id de la empresa en uso
//   <id>:ventas-2026   → datos de esa empresa (el prefijo lo aplica storage.js)

import {toast} from './core.js';

// Marcos contables disponibles
export const MARCOS=[
  {id:'tributaria', nm:'Tributaria chilena (PCGA)', desc:'Orientada al SII: F29, PPM, depreciación tabla SII, corrección monetaria Art. 41.'},
  {id:'ifrs-pyme',  nm:'NIIF para PYMEs',           desc:'Estados financieros de propósito general. Sin corrección monetaria; deterioro y valor razonable.'},
  {id:'ifrs-full',  nm:'NIIF plenas (IFRS Full)',   desc:'Norma completa. Para entidades con obligación pública de rendir cuentas.'},
];
export const marcoInfo=id=>MARCOS.find(m=>m.id===id)||MARCOS[0];

// Estado en memoria del catálogo
export const EMPRESAS={lista:[],activa:null};

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
    EMPRESAS.lista=r?JSON.parse(r.value):[];
  }catch(e){EMPRESAS.lista=[];}
  try{
    const r=await window.storage.getGlobal('_empresaActiva');
    EMPRESAS.activa=r?r.value:null;
  }catch(e){EMPRESAS.activa=null;}
  // Si no hay ninguna, crear la empresa por defecto (migración desde monoempresa)
  if(!EMPRESAS.lista.length){
    const def={id:'emp1',nombre:'Mi Empresa',rut:'',marco:'tributaria',creada:new Date().toISOString()};
    EMPRESAS.lista=[def];
    EMPRESAS.activa='emp1';
    await guardarCatalogo();
  }
  if(!EMPRESAS.activa||!EMPRESAS.lista.find(e=>e.id===EMPRESAS.activa)){
    EMPRESAS.activa=EMPRESAS.lista[0].id;
    await window.storage.setGlobal('_empresaActiva',EMPRESAS.activa);
  }
  return EMPRESAS;
}

export async function guardarCatalogo(){
  await window.storage.setGlobal('_empresas',JSON.stringify(EMPRESAS.lista));
  if(EMPRESAS.activa)await window.storage.setGlobal('_empresaActiva',EMPRESAS.activa);
}

export const empresaActiva=()=>EMPRESAS.lista.find(e=>e.id===EMPRESAS.activa)||null;

// ── Operaciones ──
export async function crearEmpresa(nombre,rut,marco){
  const id='emp'+Date.now().toString(36);
  EMPRESAS.lista.push({id,nombre,rut:rut||'',marco:marco||'tributaria',creada:new Date().toISOString()});
  await guardarCatalogo();
  return id;
}

export async function eliminarEmpresa(id){
  if(EMPRESAS.lista.length<=1)throw new Error('Debe existir al menos una empresa');
  EMPRESAS.lista=EMPRESAS.lista.filter(e=>e.id!==id);
  if(EMPRESAS.activa===id)EMPRESAS.activa=EMPRESAS.lista[0].id;
  await guardarCatalogo();
  // Nota: los datos de esa empresa quedan huérfanos en storage a propósito
  // (borrarlos requeriría recorrer todas las claves; se puede hacer aparte).
}

export async function actualizarEmpresa(id,campos){
  const e=EMPRESAS.lista.find(x=>x.id===id);
  if(!e)return;
  Object.assign(e,campos);
  await guardarCatalogo();
}

// Cambia la empresa activa. Requiere recargar los datos (lo hace app.js).
export async function activarEmpresa(id){
  if(!EMPRESAS.lista.find(e=>e.id===id))return false;
  EMPRESAS.activa=id;
  await window.storage.setGlobal('_empresaActiva',id);
  window.storage.setPrefijo(id);
  return true;
}
