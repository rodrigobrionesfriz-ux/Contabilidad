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

  // ── Botón "atrás" (Android / navegación del historial) ──
  // beforeunload NO se dispara al retroceder: el navegador solo navega en el
  // historial. Se inserta una entrada extra para interceptarlo con popstate.
  //
  // Comportamiento: si el usuario no está en la pantalla inicial (Empresa),
  // el botón atrás lo lleva ahí en vez de salir — que es lo que espera en una
  // app. Solo pregunta si salir cuando ya está en la pantalla inicial.
  let _saliendo=false;
  try{
    history.pushState({app:true},'');
    window.addEventListener('popstate',()=>{
      if(_saliendo)return;              // ya confirmó: dejar que salga
      if(!AUTH.user)return;             // sin sesión, no interceptar

      const sec=(window.getCurSec&&window.getCurSec())||'empresa';
      // Si hay un modal abierto, el atrás solo lo cierra
      const modalAbierto=['dte-modal','search-overlay'].find(id=>{
        const el=document.getElementById(id);
        return el&&el.style.display&&el.style.display!=='none';
      });
      if(modalAbierto){
        const el=document.getElementById(modalAbierto);
        if(el)el.style.display='none';
        history.pushState({app:true},'');
        return;
      }
      // Si no está en la pantalla inicial, volver a ella en vez de salir
      if(sec!=='empresa'&&window.nav){
        window.nav('empresa');
        history.pushState({app:true},'');
        return;
      }
      // Ya en la pantalla inicial: preguntar si quiere salir
      const msg=_sucio
        ? '⚠️ Hay cambios SIN GUARDAR.\n\nSi sales ahora podrías perderlos.\n\n¿Salir de la aplicación?'
        : '¿Salir de la aplicación?';
      if(confirm(msg)){
        _saliendo=true;
        history.back();
      }else{
        history.pushState({app:true},''); // reponer para el próximo atrás
      }
    });
  }catch(e){ console.warn('No se pudo interceptar el botón atrás:',e); }

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
