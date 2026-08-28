// buscadorcuentas.js — Autocompletado de cuentas contables.
// Reemplaza los <select> largos (293 cuentas) por un input que filtra
// por código o nombre mientras se escribe.
//
// Uso en un template:
//   ${inputCuenta({id:'x', value:l.cd, onPick:`lCd(${i},'%CD%')`})}
// La función onPick recibe el código elegido (se sustituye %CD% por el código).

import {CUENTAS_SEL, CUENTAS_GASTO, CUENTAS_INGRESO, CUENTAS_COMPRA, pdcNm} from './core.js';

let AC_ACTIVO=null;   // id del input abierto
let AC_SEL=0;         // índice resaltado
let AC_RES=[];        // resultados visibles
const AC_FILTROS={};  // filtro por id de input: 'compra' | 'ingreso' | 'gasto' | null

// Set de cuentas según filtro
function poblacionCuentas(filtro){
  if(filtro==='compra')return CUENTAS_COMPRA;
  if(filtro==='ingreso')return CUENTAS_INGRESO;
  if(filtro==='gasto')return CUENTAS_GASTO;
  return CUENTAS_SEL;
}

// Normaliza para comparar sin tildes ni mayúsculas
const norm=s=>String(s||'').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'');

// Las listas de sugerencias (.ac-lista) viven dentro de .lineas-scroll, que
// tiene scroll propio (overflow-x:auto → por spec CSS eso también recorta el
// overflow vertical). Con position:absolute, una sugerencia que aparece cerca
// del borde inferior de esa caja queda tapada por lo que sigue más abajo
// (el botón "+ Agregar línea"), aunque el z-index sea alto: el recorte lo
// causa el overflow del contenedor, no el apilamiento de capas.
// Solución: al mostrarlas, se posicionan con position:fixed usando las
// coordenadas reales del input (getBoundingClientRect), así quedan fuera de
// cualquier contenedor con scroll y se ven completas.
function posicionarAC(inp,box){
  const r=inp.getBoundingClientRect();
  box.style.position='fixed';
  box.style.left=r.left+'px';
  box.style.top=(r.bottom+2)+'px';
  box.style.width=Math.max(r.width,280)+'px';
  box.style.right='auto';
}
// Si la página se desplaza (o el scroll interno de las líneas del asiento)
// mientras una lista está abierta, las coordenadas quedan obsoletas: mejor
// cerrarla que dejarla flotando en un lugar equivocado.
document.addEventListener('scroll',()=>{
  document.querySelectorAll('.ac-lista').forEach(b=>{if(b.style.display!=='none')b.style.display='none';});
},true);

// Busca cuentas por código o nombre. Todas las palabras deben aparecer.
export function buscarCuentas(q,limite=40,filtro=null){
  const t=norm(q).trim();
  const pool=poblacionCuentas(filtro);
  if(!t)return pool.slice(0,limite);
  const palabras=t.split(/\s+/);
  const scored=[];
  for(const c of pool){
    const cd=String(c.cd), nm=norm(c.nm);
    const hay=`${cd} ${nm}`;
    if(!palabras.every(p=>hay.includes(p)))continue;
    // Prioridad: código que empieza igual > nombre que empieza igual > resto
    let score=2;
    if(cd.startsWith(t))score=0;
    else if(nm.startsWith(t))score=1;
    scored.push({c,score});
  }
  scored.sort((a,b)=>a.score-b.score||a.c.cd.localeCompare(b.c.cd));
  return scored.slice(0,limite).map(x=>x.c);
}

// Genera el HTML del buscador. `onPick` es código JS donde %CD% será el código.
// `filtro` puede ser 'compra' | 'ingreso' | 'gasto' para restringir el universo.
export function inputCuenta({id,value='',onPick='',placeholder='Buscar cuenta…',clase='linea-inp',filtro=null}){
  const txt=value?`${value} – ${pdcNm(value)}`:'';
  const op=String(onPick).replace(/"/g,'&quot;');
  if(filtro)AC_FILTROS[id]=filtro;
  return `<div class="ac-wrap" style="position:relative">
    <input type="text" id="${id}" class="${clase}" value="${txt.replace(/"/g,'&quot;')}"
      placeholder="${placeholder}" autocomplete="off"
      data-cd="${value}" data-onpick="${op}" data-filtro="${filtro||''}"
      oninput="acBuscar('${id}')" onfocus="acBuscar('${id}')"
      onkeydown="acTecla(event,'${id}')" onblur="acCerrarDif('${id}')">
    <div id="${id}-ac" class="ac-lista" style="display:none"></div>
  </div>`;
}

// Dibuja/actualiza la lista de sugerencias
export function acBuscar(id){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp||!box)return;
  const filtro=inp.dataset.filtro||AC_FILTROS[id]||null;
  // Si el texto es el de una cuenta ya elegida, mostrar todo para poder cambiar
  const q=inp.value===`${inp.dataset.cd} – ${pdcNm(inp.dataset.cd)}`?'':inp.value;
  AC_RES=buscarCuentas(q,40,filtro);
  AC_ACTIVO=id;AC_SEL=0;
  posicionarAC(inp,box);
  if(!AC_RES.length){
    box.innerHTML='<div class="ac-item" style="color:var(--mt)">Sin coincidencias</div>';
    box.style.display='block';return;
  }
  pintarLista(id,box);
}

function pintarLista(id,box){
  box.innerHTML=AC_RES.map((c,i)=>`
    <div class="ac-item${i===AC_SEL?' sel':''}" onmousedown="acElegir('${id}','${c.cd}')">
      <span style="font-family:var(--mono);color:var(--ac)">${c.cd}</span>
      <span style="margin-left:8px">${c.nm}</span>
    </div>`).join('');
  box.style.display='block';
}

// Navegación con teclado
export function acTecla(ev,id){
  const box=document.getElementById(id+'-ac');
  if(!box||box.style.display==='none')return;
  if(ev.key==='ArrowDown'){ev.preventDefault();AC_SEL=Math.min(AC_SEL+1,AC_RES.length-1);pintarLista(id,box);scrollSel(box);}
  else if(ev.key==='ArrowUp'){ev.preventDefault();AC_SEL=Math.max(AC_SEL-1,0);pintarLista(id,box);scrollSel(box);}
  else if(ev.key==='Enter'){
    ev.preventDefault();
    if(AC_RES[AC_SEL])acElegir(id,AC_RES[AC_SEL].cd);
  }
  else if(ev.key==='Escape'){box.style.display='none';}
}
function scrollSel(box){
  const el=box.querySelector('.ac-item.sel');
  if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});
}

// Selecciona una cuenta y ejecuta la acción configurada
export function acElegir(id,cd){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp)return;
  inp.value=`${cd} – ${pdcNm(cd)}`;
  inp.dataset.cd=cd;
  if(box)box.style.display='none';
  const acc=inp.dataset.onpick;
  if(acc){
    try{ new Function('cd',acc.replace(/%CD%/g,cd))(cd); }
    catch(e){ console.warn('acElegir:',e); }
  }
}

// Al salir del campo (Tab o clic fuera): antes se borraba TODO lo escrito si el
// usuario no había clicado una sugerencia. Quien tecleaba el código completo y
// pasaba al campo siguiente perdía la cuenta sin aviso. Ahora, si lo escrito
// identifica una sola cuenta, se da por elegida y se dispara su onPick.
export function acCerrarDif(id){
  setTimeout(()=>{
    const inp=document.getElementById(id);
    const box=document.getElementById(id+'-ac');
    if(box)box.style.display='none';
    if(!inp)return;
    if(inp.dataset.cd){inp.value=`${inp.dataset.cd} – ${pdcNm(inp.dataset.cd)}`;return;}
    const texto=String(inp.value||'').trim();
    if(!texto)return;
    const cd=resolverCuenta(texto,inp.dataset.filtro||AC_FILTROS[id]||null);
    if(cd)acElegir(id,cd);      // fija el valor, el data-cd y avisa al formulario
    else inp.value='';          // texto que no identifica ninguna cuenta
  },160);
}

// Devuelve el código si el texto identifica UNA sola cuenta imputable.
// Acepta el código exacto (con o sin puntos), el formato "código – nombre"
// y un nombre que calce con una única cuenta. Ante cualquier ambigüedad
// devuelve null: es preferible limpiar el campo que imputar la cuenta errónea.
export function resolverCuenta(texto,filtro){
  const t=String(texto||'').trim();
  if(!t)return null;
  const pool=poblacionCuentas(filtro);
  const porCodigo=cd=>{const c=pool.find(x=>String(x.cd)===cd);return c?c.cd:null;};
  // 1) "1101201 – BANCO ESTADO" → se queda con el código
  const conGuion=t.match(/^\s*([\d.]+)\s*[\u2013-]/);
  if(conGuion){const cd=porCodigo(conGuion[1].replace(/\./g,''));if(cd)return cd;}
  // 2) sólo dígitos (o con puntos): código exacto
  if(/^[\d.]+$/.test(t)){const cd=porCodigo(t.replace(/\./g,''));if(cd)return cd;}
  // 3) nombre: sirve sólo si calza con una única cuenta
  const exactas=pool.filter(c=>norm(c.nm)===norm(t));
  if(exactas.length===1)return exactas[0].cd;
  const res=buscarCuentas(t,5,filtro);
  return res.length===1?res[0].cd:null;
}


// ═══ BUSCADOR DINÁMICO DE CENTROS DE COSTO ═══
// Reutiliza los mismos patrones que el buscador de cuentas contables.
// Ejemplo:
//   inputCC({id:'ln-cc-0', value:'cc_abc', onPick:"lCC(0,'%CC%')"})
import {S as _SCC} from './state.js';

let CC_RES=[], CC_ACTIVO=null, CC_SEL=0;

function ccNombreCompleto(id){
  const c=(_SCC.centros||[]).find(x=>x.id===id);
  if(!c)return '';
  if(c.nivel===1)return c.nombre;
  const p=(_SCC.centros||[]).find(x=>x.id===c.padre);
  return (p?p.nombre+' › ':'')+c.nombre;
}

function buscarCC(q){
  const centros=_SCC.centros||[];
  if(!q||!q.trim())return centros.slice(0,40);
  const t=q.toLowerCase().trim();
  return centros.filter(c=>{
    const nombreCompleto=ccNombreCompleto(c.id).toLowerCase();
    return (c.codigo||'').toLowerCase().includes(t)||
           nombreCompleto.includes(t)||
           (c.nombre||'').toLowerCase().includes(t);
  }).slice(0,40);
}

export function inputCC({id,value='',onPick='',placeholder='Buscar centro de costo…',clase='linea-inp'}){
  const txt=value?ccNombreCompleto(value):'';
  const op=String(onPick).replace(/"/g,'&quot;');
  return `<div class="ac-wrap" style="position:relative">
    <input type="text" id="${id}" class="${clase}" value="${txt.replace(/"/g,'&quot;')}"
      placeholder="${placeholder}" autocomplete="off"
      data-cc="${value}" data-onpick="${op}"
      oninput="ccAcBuscar('${id}')" onfocus="ccAcBuscar('${id}')"
      onkeydown="ccAcTecla(event,'${id}')" onblur="ccAcCerrarDif('${id}')">
    <div id="${id}-ac" class="ac-lista" style="display:none"></div>
  </div>`;
}

export function ccAcBuscar(id){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp||!box)return;
  const q=inp.value===ccNombreCompleto(inp.dataset.cc)?'':inp.value;
  CC_RES=buscarCC(q);
  CC_ACTIVO=id; CC_SEL=0;
  posicionarAC(inp,box);
  if(!CC_RES.length){
    box.innerHTML='<div class="ac-item" style="color:var(--mt)">Sin centros de costo definidos</div>';
    box.style.display='block';return;
  }
  pintarListaCC(id,box);
}

function pintarListaCC(id,box){
  box.innerHTML=[
    `<div class="ac-item${CC_SEL===-1?' sel':''}" onmousedown="ccAcElegir('${id}','')" style="color:var(--mt);font-style:italic">
      — sin centro de costo —
    </div>`,
    ...CC_RES.map((c,i)=>`
      <div class="ac-item${i===CC_SEL?' sel':''}" onmousedown="ccAcElegir('${id}','${c.id}')">
        ${c.codigo?`<span style="font-family:var(--mono);color:var(--ac);font-size:11px">${c.codigo}</span>`:''}
        <span style="margin-left:6px">${ccNombreCompleto(c.id)}</span>
      </div>`)
  ].join('');
  box.style.display='block';
}

export function ccAcTecla(ev,id){
  const box=document.getElementById(id+'-ac');
  if(!box||box.style.display==='none')return;
  if(ev.key==='ArrowDown'){ev.preventDefault();CC_SEL=Math.min(CC_SEL+1,CC_RES.length-1);pintarListaCC(id,box);}
  else if(ev.key==='ArrowUp'){ev.preventDefault();CC_SEL=Math.max(CC_SEL-1,-1);pintarListaCC(id,box);}
  else if(ev.key==='Enter'){
    ev.preventDefault();
    if(CC_SEL===-1)ccAcElegir(id,'');
    else if(CC_RES[CC_SEL])ccAcElegir(id,CC_RES[CC_SEL].id);
  }
  else if(ev.key==='Escape'){box.style.display='none';}
}

export function ccAcElegir(id,ccId){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp)return;
  inp.value=ccId?ccNombreCompleto(ccId):'';
  inp.dataset.cc=ccId;
  if(box)box.style.display='none';
  const acc=inp.dataset.onpick;
  if(acc){
    try{ new Function('cc',acc.replace(/%CC%/g,ccId))(ccId); }
    catch(e){ console.warn('ccAcElegir:',e); }
  }
}

export function ccAcCerrarDif(id){
  setTimeout(()=>{
    const inp=document.getElementById(id);
    const box=document.getElementById(id+'-ac');
    if(box)box.style.display='none';
    if(!inp)return;
    const ccId=inp.dataset.cc;
    if(ccId)inp.value=ccNombreCompleto(ccId);
    else if(inp.value&&!ccId)inp.value='';
  },160);
}

// ═══ BUSCADOR DINÁMICO DE AUXILIARES (clientes / proveedores) ═══
//
// Antes el RUT del auxiliar se escribía a mano y sólo se validaba el dígito
// verificador. Con las fichas cargadas desde Excel ya existe el dato: se puede
// buscar por código o por nombre y traer razón social, giro y dirección de una.
//
// Ejemplo:
//   inputAux({id:'ln-rut-0', tipo:'proveedor', value:'77999888',
//             onPick:"lAuxElegido(0,'%RUT%')"})
import {S as _SAX} from './state.js';

let AX_RES=[], AX_SEL=0;

const fichasDe=tipo=>((_SAX.fichasAux||{})[tipo])||{};

export function auxNombre(tipo,rutCodigo){
  const f=fichasDe(tipo)[rutCodigo];
  return f?(f.razonSocial||f.nombre||''):'';
}

function buscarAux(tipo,q){
  const fichas=fichasDe(tipo);
  const todos=Object.keys(fichas).map(rut=>({rut,...fichas[rut]}));
  if(!q||!q.trim())return todos.slice(0,40);
  const t=q.toLowerCase().trim().replace(/[.\-\s]/g,'');
  return todos.filter(f=>
    String(f.rut).toLowerCase().includes(t)||
    String(f.razonSocial||f.nombre||'').toLowerCase().includes(q.toLowerCase().trim())
  ).slice(0,40);
}

export function inputAux({id,tipo='proveedor',value='',onPick='',placeholder='RUT o nombre…',clase='linea-inp'}){
  const op=String(onPick).replace(/"/g,'&quot;');
  return `<div class="ac-wrap" style="position:relative">
    <input type="text" id="${id}" class="${clase}" value="${String(value||'').replace(/"/g,'&quot;')}"
      placeholder="${placeholder}" autocomplete="off"
      data-tipo="${tipo}" data-onpick="${op}"
      oninput="axAcBuscar('${id}')" onfocus="axAcBuscar('${id}')"
      onkeydown="axAcTecla(event,'${id}')" onblur="axAcCerrar('${id}')">
    <div id="${id}-ac" class="ac-lista" style="display:none;min-width:280px"></div>
  </div>`;
}

export function axAcBuscar(id){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp||!box)return;
  const tipo=inp.dataset.tipo||'proveedor';
  AX_RES=buscarAux(tipo,inp.value);
  AX_SEL=0;
  posicionarAC(inp,box);
  if(!AX_RES.length){
    box.innerHTML=`<div class="ac-item" style="color:var(--mt)">
      ${Object.keys(fichasDe(tipo)).length
        ? 'Sin coincidencias — puedes escribir el RUT igual'
        : 'No hay fichas de '+tipo+' cargadas · Configuración → Carga desde Excel'}
    </div>`;
    box.style.display='block';return;
  }
  pintarListaAux(id,box);
}

function pintarListaAux(id,box){
  box.innerHTML=AX_RES.map((f,i)=>`
    <div class="ac-item${i===AX_SEL?' sel':''}" onmousedown="axAcElegir('${id}','${f.rut}')">
      <span style="font-family:var(--mono);color:var(--ac);font-size:11px">${f.rut}</span>
      <span style="margin-left:8px">${f.razonSocial||f.nombre||''}</span>
      ${f.giro?`<div style="font-size:10px;color:var(--mt);margin-left:2px">${f.giro}</div>`:''}
    </div>`).join('');
  box.style.display='block';
}

export function axAcTecla(ev,id){
  const box=document.getElementById(id+'-ac');
  if(!box||box.style.display==='none')return;
  if(ev.key==='ArrowDown'){ev.preventDefault();AX_SEL=Math.min(AX_SEL+1,AX_RES.length-1);pintarListaAux(id,box);}
  else if(ev.key==='ArrowUp'){ev.preventDefault();AX_SEL=Math.max(AX_SEL-1,0);pintarListaAux(id,box);}
  else if(ev.key==='Enter'&&AX_RES[AX_SEL]){ev.preventDefault();axAcElegir(id,AX_RES[AX_SEL].rut);}
  else if(ev.key==='Escape'){box.style.display='none';}
}

export function axAcElegir(id,rut){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp)return;
  inp.value=rut;
  if(box){box.style.display='none';}
  const op=inp.dataset.onpick;
  if(op){try{ (new Function(op.replace(/%RUT%/g,rut)))(); }catch(e){console.warn('onPick aux',e);} }
}

// Al salir, cerrar la lista sin borrar lo escrito: un RUT que no está en las
// fichas sigue siendo válido, sólo que no tiene datos que autocompletar.
export function axAcCerrar(id){
  setTimeout(()=>{
    const box=document.getElementById(id+'-ac');
    if(box)box.style.display='none';
  },160);
}
