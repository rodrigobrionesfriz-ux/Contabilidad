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

// Al salir del campo: si no eligió nada válido, restaurar el valor previo
export function acCerrarDif(id){
  setTimeout(()=>{
    const inp=document.getElementById(id);
    const box=document.getElementById(id+'-ac');
    if(box)box.style.display='none';
    if(!inp)return;
    const cd=inp.dataset.cd;
    if(cd)inp.value=`${cd} – ${pdcNm(cd)}`;
    else if(inp.value&&!cd)inp.value=''; // texto sin selección válida
  },160);
}
