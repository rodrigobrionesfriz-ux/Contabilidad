// comprobantestipo.js — Plantillas de asientos ("comprobantes tipo").
//
// Guardan la estructura de un asiento recurrente (cuentas, glosa, centros de
// costo y opcionalmente los montos) para reutilizarla sin volver a armarla.
// Se guardan por empresa; se pueden copiar a otra desde la misma pantalla.

import {S} from './state.js';
import {pdcNm} from './core.js';

// Estructura: S.comprobantesTipo = [{
//   id, nombre, descripcion, glosa, guardaMontos,
//   lineas:[{cd, desc, debe, haber, cc}]
// }]

export const comprobantesTipo=()=>S.comprobantesTipo||[];
export const ctInfo=id=>comprobantesTipo().find(c=>c.id===id)||null;

export async function guardarComprobantes(){
  if(!S.comprobantesTipo)S.comprobantesTipo=[];
  try{await window.storage.set('comprobantesTipo',JSON.stringify(S.comprobantesTipo));}catch(e){}
}

export async function cargarComprobantes(){
  try{
    const r=await window.storage.get('comprobantesTipo');
    S.comprobantesTipo=r?JSON.parse(r.value):[];
    if(!Array.isArray(S.comprobantesTipo))S.comprobantesTipo=[];
  }catch(e){S.comprobantesTipo=[];}
  return S.comprobantesTipo;
}

export function crearComprobante({nombre,descripcion,glosa,guardaMontos,lineas,distActiva,distBase,dist}){
  if(!S.comprobantesTipo)S.comprobantesTipo=[];
  const id='ct_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  S.comprobantesTipo.push({
    id,
    nombre:nombre||'Sin nombre',
    descripcion:descripcion||'',
    glosa:glosa||'',
    guardaMontos:!!guardaMontos,
    lineas:(lineas||[]).map(l=>({
      cd:l.cd||'',
      desc:l.desc||'',
      debe:guardaMontos?(+l.debe||0):0,
      haber:guardaMontos?(+l.haber||0):0,
      cc:l.cc||'',
    })),
    // Distribución del gasto por porcentaje (opcional)
    distActiva:!!distActiva,
    distBase:guardaMontos?(+distBase||0):0,
    dist:(dist||[]).map(d=>({cd:d.cd||'',pct:+d.pct||0,cc:d.cc||''})),
    creado:new Date().toISOString(),
  });
  return id;
}

export function actualizarComprobante(id,campos){
  const c=ctInfo(id);
  if(!c)return;
  Object.assign(c,campos);
}

export function eliminarComprobante(id){
  S.comprobantesTipo=comprobantesTipo().filter(c=>c.id!==id);
}

// Búsqueda por nombre, descripción, glosa o código/nombre de cuenta
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function buscarComprobantes(q){
  const t=norm(q).trim();
  const lista=comprobantesTipo();
  if(!t)return lista;
  const palabras=t.split(/\s+/);
  return lista.filter(c=>{
    const texto=norm(`${c.nombre} ${c.descripcion} ${c.glosa} `+
      c.lineas.map(l=>`${l.cd} ${pdcNm(l.cd)} ${l.desc}`).join(' '));
    return palabras.every(p=>texto.includes(p));
  });
}

// Convierte una plantilla en líneas listas para el formulario de asientos
export function lineasDesdeComprobante(id,montoDist){
  const c=ctInfo(id);
  if(!c)return null;
  const lineas=c.lineas.map(l=>({
    cd:l.cd||'',
    nm:l.cd?pdcNm(l.cd):'',
    desc:l.desc||'',
    debe:c.guardaMontos?(+l.debe||0):0,
    haber:c.guardaMontos?(+l.haber||0):0,
    cc:l.cc||'',
  }));
  // Distribución del gasto: cada tramo se convierte en una línea del asiento.
  // El monto sale de lo que pida quien aplica la plantilla; si no se indica,
  // del guardado; si tampoco hay, quedan en cero con el % anotado en la glosa.
  const dist=(c.dist||[]).filter(d=>d.cd&&(+d.pct||0)>0);
  if(c.distActiva&&dist.length){
    const base=montoDist!=null?(+montoDist||0):(c.guardaMontos?(+c.distBase||0):0);
    const montos=repartir(base,dist.map(d=>+d.pct||0));
    dist.forEach((d,i)=>{
      lineas.push({
        cd:d.cd,
        nm:pdcNm(d.cd),
        desc:`${String(Math.round((+d.pct||0)*100)/100).replace('.',',')}%`,
        debe:montos[i],
        haber:0,
        cc:d.cc||'',
      });
    });
  }
  // Siempre dejar al menos dos líneas para poder cuadrar
  while(lineas.length<2)lineas.push({cd:'',nm:'',desc:'',debe:0,haber:0,cc:''});
  return {glosa:c.glosa||'',lineas,distribuido:c.distActiva&&dist.length?dist.length:0};
}

// Reparte un monto según porcentajes SIN perder ni inventar pesos: cada tramo
// se redondea y la diferencia acumulada por el redondeo se ajusta en el último.
export function repartir(total,pcts){
  const t=Math.round(+total||0);
  if(!t)return pcts.map(()=>0);
  const montos=pcts.map(p=>Math.round(t*(+p||0)/100));
  const suma=montos.reduce((s,m)=>s+m,0);
  if(montos.length)montos[montos.length-1]+=t-suma;
  return montos;
}

// Resumen legible de una plantilla (para las listas)
export function resumenComprobante(c){
  const nDist=(c.dist||[]).filter(d=>d.cd&&(+d.pct||0)>0).length;
  const n=c.lineas.filter(l=>l.cd).length+(c.distActiva?nDist:0);
  const total=c.lineas.reduce((s,l)=>s+(+l.debe||0),0);
  return {
    cuentas:n,
    dist:c.distActiva?nDist:0,
    total,
    cuadra:Math.abs(c.lineas.reduce((s,l)=>s+(+l.debe||0)-(+l.haber||0),0))<1,
  };
}
