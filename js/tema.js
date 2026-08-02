// tema.js — Selector de paleta de colores (persistente)
// Los temas se definen en css/styles.css con html[data-theme="..."]

export const TEMAS=[
  {id:'dark',      nm:'Oscuro',     ico:'🌙'},
  {id:'sap-light', nm:'SAP Claro',  ico:'☀️'},
  {id:'sap-dark',  nm:'SAP Oscuro', ico:'🔷'},
];

const KEY='tema';

export function aplicarTema(id){
  const t=TEMAS.find(x=>x.id===id)||TEMAS[0];
  document.documentElement.setAttribute('data-theme',t.id);
  try{localStorage.setItem(KEY,t.id);}catch(e){}
  const btn=document.getElementById('btn-tema');
  if(btn){btn.textContent=t.ico;btn.title='Tema: '+t.nm+' (clic para cambiar)';}
}

// Alterna al siguiente tema de la lista
export function cambiarTema(){
  const actual=document.documentElement.getAttribute('data-theme')||'dark';
  const i=TEMAS.findIndex(t=>t.id===actual);
  aplicarTema(TEMAS[(i+1)%TEMAS.length].id);
}

// Restaura el tema guardado al arrancar
export function initTema(){
  let guardado='dark';
  try{guardado=localStorage.getItem(KEY)||'dark';}catch(e){}
  aplicarTema(guardado);
}
