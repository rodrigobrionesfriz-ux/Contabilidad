// helpers.js — Utilidades de negocio compartidas (folios, opciones de mes/DTE)
// Capa datos: usado por ventas, compras, asientos. Solo depende de core y state.
import {DTE_VENTAS, MESES} from './core.js';
import {S} from './state.js';

function dteVentasOpts(sel=''){
  return '<option value="">— Seleccionar —</option>'+DTE_VENTAS.map(d=>`<option value="${d.cod}" ${+sel===d.cod?'selected':''}>${d.cod} — ${d.nm}</option>`).join('');
}

function mesOpts(sel=''){
  return '<option value="">Todos los meses</option>'+MESES.map((m,i)=>`<option value="${i+1}" ${+sel===i+1?'selected':''}>${m}</option>`).join('');
}

function foliosMensuales(docs){
  const porMes={};
  [...docs].sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.numero||'').localeCompare(b.numero||''))
    .forEach(d=>{
      const m=(d.fecha||'').slice(0,7);if(!m)return;
      if(!porMes[m])porMes[m]=[];
      porMes[m].push(d);
    });
  const out={};
  Object.keys(porMes).forEach(m=>{porMes[m].forEach((d,i)=>{out[d.id]=i+1;});});
  return out;
}

function mesRango(m){
  const anio=S.empresa.anio||new Date().getFullYear();
  const mm=String(m).padStart(2,'0');
  const ultimo=new Date(anio,m,0).getDate(); // día 0 del mes siguiente = último del mes
  return {desde:`${anio}-${mm}-01`,hasta:`${anio}-${mm}-${String(ultimo).padStart(2,'0')}`};
}

export {dteVentasOpts, mesOpts, foliosMensuales, mesRango};
