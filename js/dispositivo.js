// dispositivo.js — Identidad estable de este equipo
//
// Cada navegador donde se abre la app recibe un id propio y permanente. Sirve
// para dos cosas:
//
//   1. Firmar cada escritura en la nube: se puede saber QUIÉN dejó cada versión
//      de un documento, que es lo que permite avisar "el móvil escribió esto
//      mientras trabajabas en el PC".
//   2. Detectar escrituras concurrentes. Por sí solo un id no evita que un
//      equipo pise a otro —para eso está el número de versión en storage.js—
//      pero es lo que hace que el aviso sea entendible en vez de un error seco.
//
// El id vive en localStorage: es del navegador, no del usuario. El mismo
// Rodrigo en el PC y en el móvil son dos dispositivos distintos, que es
// justamente la distinción que interesa.

const CLAVE='cv:_dispositivo';

function nombrePorDefecto(){
  const ua=navigator.userAgent||'';
  const movil=/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  let so='Equipo';
  if(/Android/i.test(ua))so='Android';
  else if(/iPhone|iPad|iPod/i.test(ua))so='iPhone/iPad';
  else if(/Windows/i.test(ua))so='Windows';
  else if(/Mac OS X/i.test(ua))so='Mac';
  else if(/Linux/i.test(ua))so='Linux';
  let nav='navegador';
  if(/Edg\//i.test(ua))nav='Edge';
  else if(/Chrome\//i.test(ua)&&!/Edg\//i.test(ua))nav='Chrome';
  else if(/Firefox\//i.test(ua))nav='Firefox';
  else if(/Safari\//i.test(ua)&&!/Chrome\//i.test(ua))nav='Safari';
  return `${so} · ${nav}${movil?' (móvil)':''}`;
}

function nuevoId(){
  try{
    if(crypto&&crypto.randomUUID)return 'dev_'+crypto.randomUUID().slice(0,12);
  }catch(e){}
  return 'dev_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
}

function leer(){
  try{
    const v=JSON.parse(localStorage.getItem(CLAVE)||'null');
    if(v&&v.id)return v;
  }catch(e){}
  return null;
}

export const DISPOSITIVO={id:'',nombre:'',creado:''};

export function initDispositivo(){
  let d=leer();
  if(!d){
    d={id:nuevoId(),nombre:nombrePorDefecto(),creado:new Date().toISOString()};
    try{localStorage.setItem(CLAVE,JSON.stringify(d));}catch(e){}
  }
  Object.assign(DISPOSITIVO,d);
  return DISPOSITIVO;
}

// Permite ponerle un nombre reconocible ("PC oficina", "Celular Rodrigo"):
// los avisos de conflicto se leen muchísimo mejor así.
export function renombrarDispositivo(nombre){
  const n=String(nombre||'').trim().slice(0,40);
  if(!n)return false;
  DISPOSITIVO.nombre=n;
  try{localStorage.setItem(CLAVE,JSON.stringify({id:DISPOSITIVO.id,nombre:n,creado:DISPOSITIVO.creado}));}catch(e){}
  return true;
}

export const esteDispositivo=()=>DISPOSITIVO.id;
