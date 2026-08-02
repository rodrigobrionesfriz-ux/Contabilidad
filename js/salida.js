// salida.js — Aviso antes de cerrar la app con trabajo sin guardar.
//
// El navegador solo permite mostrar el diálogo nativo de confirmación
// (no se puede personalizar el texto por seguridad), y únicamente si
// hay una razón real: por eso solo se activa cuando hay cambios pendientes.

import {AUTH} from './state.js';

let _sucio=false;           // hay cambios sin guardar
let _ultimoGuardado=null;   // marca de tiempo del último guardado

// Marcar que hay trabajo sin guardar (lo llaman los módulos al editar)
export function marcarSucio(){
  _sucio=true;
  actualizarIndicador();
}

// Marcar que ya se guardó todo
export function marcarGuardado(){
  _sucio=false;
  _ultimoGuardado=new Date();
  actualizarIndicador();
}

export const haySinGuardar=()=>_sucio;

// Indicador visual en el encabezado
function actualizarIndicador(){
  const el=document.getElementById('save-indicator');
  if(!el)return;
  if(_sucio){
    el.textContent='● Sin guardar';
    el.style.color='var(--warn)';
    el.title='Hay cambios que aún no se han guardado';
  }else if(_ultimoGuardado){
    el.textContent='✓ Guardado '+_ultimoGuardado.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
    el.style.color='var(--mt)';
    el.title='Todos los cambios están guardados';
  }else{
    el.textContent='';
  }
}

// Instala el aviso del navegador al cerrar/recargar
export function initAvisoSalida(){
  // Publicar el marcador para que storage.js lo llame al persistir
  window.__marcarGuardado=marcarGuardado;

  // Detectar edición: cualquier campo modificado dentro de la app marca pendiente.
  // Se excluyen los campos de búsqueda/filtro y el login, que no son datos.
  const IGNORAR=new Set(['search-input','login-email','login-password','conc-cartola-file']);
  const esFiltro=id=>/^(vf|cf)-(mes|desde|hasta|dte-flt|search)$|filtro|-flt$|^cierre-mes$|^cmp-year$/.test(id||'');
  document.addEventListener('input',(e)=>{
    const t=e.target;
    if(!t||!t.tagName)return;
    if(!['INPUT','SELECT','TEXTAREA'].includes(t.tagName))return;
    if(IGNORAR.has(t.id)||esFiltro(t.id))return;
    if(t.type==='file')return;
    marcarSucio();
  },true);
  window.addEventListener('beforeunload',(e)=>{
    // Solo avisar si hay sesión activa Y cambios sin guardar.
    // Sin cambios pendientes no molestamos al usuario.
    if(!AUTH.user||!_sucio)return;
    e.preventDefault();
    e.returnValue='';   // requerido por el estándar para que salga el diálogo
    return '';
  });
}
