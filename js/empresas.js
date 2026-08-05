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

// Elimina una empresa del catálogo y opcionalmente todos sus datos del storage.
// Si `borrarDatos` es true, recorre localStorage buscando las claves con
// el prefijo de esa empresa (`emp1:ventas-2026`, etc.) y las elimina.
// En Firestore no se puede borrar todo desde el cliente sin listar la colección;
// se dejan huérfanos y quedan invisibles porque ya no aparece la empresa.
export async function eliminarEmpresa(id,borrarDatos=false){
  if(EMPRESAS.lista.length<=1)throw new Error('Debe existir al menos una empresa');
  const era=EMPRESAS.activa===id;
  EMPRESAS.lista=EMPRESAS.lista.filter(e=>e.id!==id);
  if(era)EMPRESAS.activa=EMPRESAS.lista[0].id;
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
