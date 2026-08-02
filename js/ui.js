// ui.js — Puentes de UI de bajo nivel para evitar ciclos con el orquestador (app.js).
// app.js registra las implementaciones reales al arrancar; los módulos de negocio
// importan estos wrappers sin depender de app.js.

let _rerender=()=>{};
let _nav=()=>{};
let _renderSec=()=>{};

// app.js llama esto una vez al iniciar para inyectar las funciones reales.
export function registrarUI({rerender,nav,renderSec}){
  if(rerender)_rerender=rerender;
  if(nav)_nav=nav;
  if(renderSec)_renderSec=renderSec;
}

// Wrappers que los módulos importan y llaman.
export const rerender=(...a)=>_rerender(...a);
export const nav=(...a)=>_nav(...a);
export const renderSec=(...a)=>_renderSec(...a);
