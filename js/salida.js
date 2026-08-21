// salida.js — Aviso antes de cerrar la app con trabajo sin guardar.
//
// El navegador solo permite mostrar el diálogo nativo de confirmación
// (no se puede personalizar el texto por seguridad), y únicamente si
// hay una razón real: por eso solo se activa cuando hay cambios pendientes.

import {AUTH} from './state.js';
import {toast} from './core.js';

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
  // El botón de la barra superior también refleja el estado. Se llama por
  // window para no importar autoguardado.js desde acá (él ya importa este
  // módulo y quedaría un ciclo).
  try{ if(window.actualizarBotonGuardar)window.actualizarBotonGuardar(); }catch(e){}
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
  // Idempotente: si se llamara dos veces quedarían dos manejadores de `atrás`
  // y cada toque haría dos cosas —cerrar el modal Y navegar al inicio—, que es
  // justo el tipo de comportamiento errático que se está corrigiendo acá.
  if(window.__salidaLista)return;
  window.__salidaLista=true;

  // Publicar el marcador para que storage.js lo llame al persistir
  window.__marcarGuardado=marcarGuardado;

  // ── Botón "atrás" (Android / navegación del historial) ──
  //
  // En el móvil el atrás es EL botón que se usa, y en una web cerrar la pestaña
  // de un toque es brutal: se pierde la sesión y hay que volver a entrar.
  //
  // La versión anterior tenía tres fallas que lo hacían cerrarse igual:
  //   · buscaba los modales por `style.display`, pero se abren con la clase
  //     `open`, así que NUNCA detectaba uno abierto
  //   · en varios caminos salía sin reponer la entrada centinela del historial,
  //     y sin centinela el siguiente atrás se va de la página
  //   · usaba `confirm()` dentro de popstate, que en Android Chrome se ignora
  //     con frecuencia — el diálogo no aparecía y la salida seguía su curso
  //
  // Ahora: la centinela se repone SIEMPRE y de inmediato, lo abierto se detecta
  // de forma genérica, y la confirmación es un diálogo propio de la página.
  let _saliendo=false;
  const ponerCentinela=()=>{try{history.pushState({app:'centinela'},'');}catch(e){}};

  // Lo que el atrás debe cerrar antes de pensar en salir, de más a menos encima
  function capaAbierta(){
    // 1. Modales (comprobante, DTE, importadores, plantillas…)
    const modales=[...document.querySelectorAll('.modal-bkd.open')];
    if(modales.length)return {el:modales[modales.length-1],cerrar:el=>el.classList.remove('open')};
    // 2. Buscador global y otras capas por display
    for(const id of ['search-overlay','nav-overlay']){
      const el=document.getElementById(id);
      if(el&&el.style.display&&el.style.display!=='none')
        return {el,cerrar:e=>{e.style.display='none';}};
    }
    // 3. Menú lateral desplegado en móvil
    const nav=document.querySelector('nav.abierto,.sidebar.abierto,#sidebar.open');
    if(nav)return {el:nav,cerrar:()=>{try{window.cerrarNavMovil&&window.cerrarNavMovil();}catch(e){}}};
    // 4. Formularios en pantalla (nueva venta, compra, asiento…)
    const forms=['vf-form','cf-form','as-form','ap-form','cc-form','rem-form',
                 'af-form-bien','pdc-form','emp-form','us-form'];
    for(const id of forms){
      const el=document.getElementById(id);
      if(el&&el.style.display!=='none'&&el.offsetParent!==null)
        return {el,cerrar:e=>{e.style.display='none';}};
    }
    return null;
  }

  // Diálogo propio: `confirm()` no es de fiar dentro de popstate en Android
  function preguntarSalir(sucio){
    return new Promise(resolve=>{
      const prev=document.getElementById('salir-dlg');
      if(prev)prev.remove();
      const d=document.createElement('div');
      d.id='salir-dlg';
      d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9500;display:flex;'+
        'align-items:center;justify-content:center;padding:24px';
      d.innerHTML=`<div style="background:var(--sf,#161b22);border:1px solid var(--bd,#30363d);border-radius:14px;
          max-width:340px;width:100%;padding:22px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.5)">
        <div style="font-size:32px;margin-bottom:8px">${sucio?'⚠️':'🚪'}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">¿Salir de Contabilidad?</div>
        <div style="font-size:12px;color:var(--mt,#8b949e);line-height:1.6;margin-bottom:18px">
          ${sucio
            ? 'Tienes cambios <strong>sin guardar</strong>. Si sales ahora podrías perderlos.'
            : 'Vas a cerrar la aplicación y tendrás que iniciar sesión otra vez.'}
        </div>
        <div style="display:flex;gap:8px;flex-direction:column">
          <button id="salir-no" class="btn btn-p" style="width:100%;justify-content:center">Seguir trabajando</button>
          ${sucio?'<button id="salir-guardar" class="btn btn-s" style="width:100%;justify-content:center">💾 Guardar y salir</button>':''}
          <button id="salir-si" class="btn btn-d" style="width:100%;justify-content:center">${sucio?'Salir sin guardar':'Salir'}</button>
        </div>
      </div>`;
      document.body.appendChild(d);
      const cerrar=v=>{d.remove();resolve(v);};
      d.querySelector('#salir-no').onclick=()=>cerrar('quedarse');
      d.querySelector('#salir-si').onclick=()=>cerrar('salir');
      const g=d.querySelector('#salir-guardar');
      if(g)g.onclick=()=>cerrar('guardar');
      d.onclick=e=>{if(e.target===d)cerrar('quedarse');};   // tocar fuera = quedarse
    });
  }

  async function manejarAtras(){
    // Lo primero, SIEMPRE: reponer la centinela. Pase lo que pase después, el
    // siguiente atrás vuelve a caer acá y no se va de la página.
    ponerCentinela();
    if(_saliendo)return;
    if(!AUTH.user)return;               // en el login, que el atrás sea normal

    const capa=capaAbierta();
    if(capa){capa.cerrar(capa.el);return;}

    const sec=(window.getCurSec&&window.getCurSec())||'empresa';
    if(sec!=='empresa'&&window.nav){window.nav('empresa');return;}

    const r=await preguntarSalir(_sucio);
    if(r==='quedarse')return;
    if(r==='guardar'){
      try{ if(window.saveAll)await window.saveAll(); }catch(e){}
    }
    _saliendo=true;
    // Saltar la centinela y la entrada de la app para llegar a lo que había antes
    try{history.go(-2);}catch(e){}
    // Si la app se abrió en una pestaña nueva no hay adónde volver: decirlo en
    // vez de dejar al usuario mirando la misma pantalla sin entender.
    setTimeout(()=>{
      if(!document.hidden){
        _saliendo=false;ponerCentinela();
        try{toast&&toast('Ya puedes cerrar esta pestaña');}catch(e){}
      }
    },600);
  }

  try{
    ponerCentinela();
    window.addEventListener('popstate',manejarAtras);
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
