// ayuda.js — Las ayudas de cada pantalla, detrás de una ampolleta.
//
// Los recuadros .info-tip explican cómo funciona cada módulo, pero una vez que
// el sistema está en producción ocupan espacio arriba de todos los formularios.
// En vez de borrarlos —siguen sirviendo cuando entra alguien nuevo— quedan
// ocultos y se muestran al pulsar 💡 en la cabecera de la sección.
//
// El ocultamiento es por CSS (.section sin .ayuda-on esconde sus .info-tip),
// no por JavaScript: así sobrevive a los re-render de cada módulo, que
// reescriben su contenido entero muchas veces. Lo único que hace este módulo
// es poner el botón, alternar la clase y recordar la preferencia.

const CLAVE='cv:ayuda';
const CLASE='ayuda-on';

// Preferencia por sección: {balance:true, ventas:false, ...}
// Vive en localStorage porque es del usuario y del dispositivo, no de la
// empresa: no tiene por qué viajar a la nube ni cambiar al cambiar de empresa.
function leerPrefs(){
  try{return JSON.parse(localStorage.getItem(CLAVE)||'{}')||{};}
  catch(e){return {};}
}
function guardarPrefs(p){
  try{localStorage.setItem(CLAVE,JSON.stringify(p));}catch(e){}
}

const idDeSeccion=sec=>String(sec.id||'').replace(/^s-/,'');

// ¿Esta sección tiene ayudas que mostrar en este momento?
// Se excluyen las que estén dentro de un modal: esas se ven cuando el modal se
// abre y no dependen de la ampolleta de la pantalla de atrás.
function tieneAyudas(sec){
  return [...sec.querySelectorAll('.info-tip')].some(t=>!t.closest('.modal-bkd'));
}

function botonDe(sec){
  return sec.querySelector(':scope > .sec-hdr .btn-ayuda');
}

// Coloca el botón una sola vez por sección
function montarBoton(sec){
  const hdr=sec.querySelector(':scope > .sec-hdr');
  if(!hdr||botonDe(sec))return null;
  const b=document.createElement('button');
  b.className='btn btn-g btn-ayuda';
  b.type='button';
  b.textContent='💡';
  b.setAttribute('aria-expanded','false');
  b.addEventListener('click',()=>toggleAyuda(idDeSeccion(sec)));
  hdr.appendChild(b);
  return b;
}

// Refresca el botón de una sección: lo esconde si no hay nada que explicar y
// lo deja reflejando si la ayuda está abierta o cerrada.
function refrescarSeccion(sec){
  if(!sec)return;
  const b=botonDe(sec)||montarBoton(sec);
  if(!b)return;
  const hay=tieneAyudas(sec);
  b.style.display=hay?'':'none';
  const abierta=sec.classList.contains(CLASE);
  b.classList.toggle('on',abierta);
  b.setAttribute('aria-expanded',abierta?'true':'false');
  b.title=abierta?'Ocultar la ayuda de esta pantalla':'Ver la ayuda de esta pantalla';
}

// Aplica la preferencia guardada a una sección (al montarla o al navegar)
function aplicarPref(sec){
  if(!sec)return;
  const prefs=leerPrefs();
  sec.classList.toggle(CLASE,!!prefs[idDeSeccion(sec)]);
  refrescarSeccion(sec);
}

export function toggleAyuda(id){
  const sec=document.getElementById('s-'+id);
  if(!sec)return;
  const abierta=!sec.classList.contains(CLASE);
  sec.classList.toggle(CLASE,abierta);
  const prefs=leerPrefs();
  if(abierta)prefs[id]=true; else delete prefs[id];
  guardarPrefs(prefs);
  refrescarSeccion(sec);
}

// La sección visible en este momento
function seccionActiva(){
  return document.querySelector('.section.active');
}

// Se llama después de cada render: el contenido pudo cambiar y con él la
// existencia de ayudas (una sección vacía no tiene ninguna, la misma sección
// con datos sí).
export function actualizarAyuda(){
  refrescarSeccion(seccionActiva());
}

let observador=null;
export function initAyuda(){
  document.querySelectorAll('.section').forEach(aplicarPref);

  // Los módulos reescriben su contenido con innerHTML muchas veces y de forma
  // asíncrona. En vez de pedirle a cada uno que avise, se vigila el contenedor
  // y se refresca el botón de la sección visible, con un respiro para no
  // trabajar en cada nodo que se inserta.
  const cont=document.querySelector('main')||document.body;
  if(observador)observador.disconnect();
  let t=null;
  observador=new MutationObserver(()=>{
    clearTimeout(t);
    t=setTimeout(()=>{ try{actualizarAyuda();}catch(e){} },120);
  });
  observador.observe(cont,{childList:true,subtree:true});
}

// Al navegar a otra sección hay que aplicarle su preferencia y refrescar
export function ayudaAlNavegar(id){
  aplicarPref(document.getElementById('s-'+id));
}
