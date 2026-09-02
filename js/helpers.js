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

// ── Periodo tributario de un documento ──────────────────────────────────────
// La fecha del documento y el mes del libro en que se declara NO siempre
// coinciden. Un DTE emitido el 25/08 al que no se le da acuse de recibo dentro
// de los 8 días se arrastra al RCV de septiembre: se declara en el F29 de
// septiembre y va en el libro de septiembre, pero su fecha real sigue siendo
// agosto y así debe quedar (vencimientos, aging y el propio registro del DTE
// dependen de ella).
//
// Por eso `d.periodo` ('AAAA-MM') manda para libros, correlativos y F29,
// mientras que `d.fecha` manda para el asiento contable y todo lo que dependa
// de cuándo ocurrió realmente la operación.
//
// Los documentos anteriores a este cambio no traen `periodo`: para ellos el
// periodo es el mes de su fecha, que es justo lo que se asumía antes.
function periodoDoc(d){
  if(!d)return '';
  if(d.periodo&&/^\d{4}-\d{2}$/.test(d.periodo))return d.periodo;
  return String(d.fecha||'').slice(0,7);
}

// Correlativo interno del libro. Va por PERIODO, no por mes de la fecha: el
// libro de septiembre numera sus documentos 1..N incluyendo los de agosto que
// entraron arrastrados. Dentro del periodo se ordena por fecha real.
function foliosMensuales(docs){
  const porMes={};
  [...docs].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))||String(a.numero||'').localeCompare(String(b.numero||'')))
    .forEach(d=>{
      const m=periodoDoc(d);if(!m)return;
      if(!porMes[m])porMes[m]=[];
      porMes[m].push(d);
    });
  const out={};
  Object.keys(porMes).forEach(m=>{porMes[m].forEach((d,i)=>{out[d.id]=i+1;});});
  return out;
}

// acum=true → desde el 1 de enero hasta el fin del mes elegido (acumulado del ejercicio).
// acum=false (por defecto) → solo el mes elegido, del día 1 a su último día.
function mesRango(m,acum=false){
  const anio=S.empresa.anio||new Date().getFullYear();
  const mm=String(m).padStart(2,'0');
  const ultimo=new Date(anio,m,0).getDate(); // día 0 del mes siguiente = último del mes
  return {desde:acum?`${anio}-01-01`:`${anio}-${mm}-01`,hasta:`${anio}-${mm}-${String(ultimo).padStart(2,'0')}`};
}

export {dteVentasOpts, mesOpts, foliosMensuales, mesRango, periodoDoc};
