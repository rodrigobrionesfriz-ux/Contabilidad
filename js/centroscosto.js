// centroscosto.js — Centros de costo en dos niveles.
//   Nivel 1: CENTRO PRINCIPAL  (ej: "Administración", "Área Maderas",
//                               "Transporte", "Fundo El Sauce")
//   Nivel 2: SUBCENTRO         (ej: "Contabilidad", "Aserradero",
//                               "Camión 1", "Cuartel 3 — Cerezos")
//
// Cada subcentro acumula sus gastos. Los que representan una INVERSIÓN EN CURSO
// (una plantación en formación, una obra, un proyecto) pueden marcarse como
// capitalizables: se les asigna una curva de % por año y sus costos se traspasan
// a un activo fijo. Los centros operativos normales simplemente acumulan gasto.

import {S} from './state.js';

// Estructura guardada en S.centros (clave 'centros' por empresa):
// [{id, nivel:1, nombre, codigo}, {id, nivel:2, padre:<idPredio>, nombre, codigo,
//   estado:'formacion'|'productivo'|'capitalizado', fechaInicio, capitalizadoEn}]

// Tipo de centro: define si sus costos se capitalizan o van directo a resultado.
export const CC_ESTADOS=[
  {id:'operativo',    nm:'Operativo',      desc:'Sus costos van directo a resultado (administración, transporte, etc.)'},
  {id:'formacion',    nm:'Inversión en curso', desc:'Acumula costos capitalizables según una curva por año'},
  {id:'capitalizado', nm:'Capitalizado',   desc:'Sus costos ya se traspasaron a activo fijo'},
];

// ── Curvas de capitalización ──
// En una inversión en curso, el gasto de cada año se reparte entre ACTIVO
// (lo que se capitaliza) y COSTO del período (lo que va a resultado).
// El % cambia según el año desde el inicio: al principio suele ser todo
// inversión y luego pasa gradualmente a costo.
//   año 1 = primer año desde fechaInicio.
// Las plantillas agrícolas son solo un punto de partida: se pueden editar
// libremente o usar "Personalizada" para cualquier tipo de proyecto.
export const CURVAS_DEFAULT=[
  {id:'cerezo',    nm:'Cerezos',      pcts:[100,100,100,50,0]},
  {id:'manzano',   nm:'Manzanos',     pcts:[100,100,100,50,0]},
  {id:'arandano',  nm:'Arándanos',    pcts:[100,100,50,0]},
  {id:'frambuesa', nm:'Frambuesas',   pcts:[100,50,0]},
  {id:'nogal',     nm:'Nogales',      pcts:[100,100,100,100,50,0]},
  {id:'palto',     nm:'Paltos',       pcts:[100,100,100,50,0]},
  {id:'vid',       nm:'Vides',        pcts:[100,100,50,0]},
  {id:'obra',      nm:'Obra / proyecto (100% hasta terminar)',pcts:[100,100,100]},
  {id:'custom',    nm:'Personalizada',pcts:[100,100,50,0]},
];
export const curvaInfo=id=>CURVAS_DEFAULT.find(c=>c.id===id)||CURVAS_DEFAULT[0];

// ── Temporada / ejercicio de costos ──
// Por defecto la temporada va de MAYO a ABRIL (año agrícola chileno), que es
// como se agrupan los costos de las inversiones en curso.
// Se identifica por el año en que COMIENZA: la temporada 2025 va del
// 1-may-2025 al 30-abr-2026.
export const MES_INICIO_TEMPORADA=5; // mayo

// Temporada a la que pertenece una fecha YYYY-MM-DD
export function temporadaDe(fecha){
  if(!fecha)return null;
  const y=+String(fecha).slice(0,4), m=+String(fecha).slice(5,7);
  if(!y||!m)return null;
  return m>=MES_INICIO_TEMPORADA ? y : y-1;
}
// Etiqueta legible: "2025/26"
export const temporadaLbl=t=>t==null?'':`${t}/${String(t+1).slice(2)}`;
// Rango de fechas de una temporada
export const temporadaRango=t=>({
  desde:`${t}-05-01`,
  hasta:`${t+1}-04-30`,
});

// Devuelve el % que se capitaliza en un año dado del cuartel.
// Si el año supera la curva, ya es 100% costo (0% activo).
export function pctCapitalizacion(centro,anio){
  if(!centro)return 0;
  const pcts=(centro.pctsCapitalizacion&&centro.pctsCapitalizacion.length)
    ? centro.pctsCapitalizacion
    : curvaInfo(centro.curva).pcts;
  const n=anioFormacion(centro,anio);
  if(n<1)return 0;                       // aún no empieza
  if(n>pcts.length)return 0;             // ya es 100% costo
  return +pcts[n-1]||0;
}

// Año de formación (1,2,3…) contado en TEMPORADAS agrícolas desde la plantación.
export function anioFormacion(centro,temporada){
  if(!centro||!centro.fechaInicio)return 0;
  const tIni=temporadaDe(centro.fechaInicio);
  if(tIni==null)return 0;
  return (+temporada)-tIni+1;
}

// Reparte un monto entre activo y costo según la curva del cuartel.
export function repartirCosto(centro,anio,monto){
  const pct=pctCapitalizacion(centro,anio);
  const activo=Math.round((+monto||0)*pct/100);
  return {pct, activo, costo:(+monto||0)-activo};
}

export const centros=()=>S.centros||[];
export const predios=()=>centros().filter(c=>c.nivel===1);      // nivel 1 (alias histórico)
export const principales=()=>centros().filter(c=>c.nivel===1);
export const cuarteles=(idPadre)=>centros().filter(c=>c.nivel===2&&(!idPadre||c.padre===idPadre)); // nivel 2 (alias histórico)
export const subcentros=(idPadre)=>cuarteles(idPadre);
export const ccInfo=id=>centros().find(c=>c.id===id)||null;

// Nombre completo "Predio › Cuartel"
export function ccNombre(id){
  const c=ccInfo(id);
  if(!c)return '';
  if(c.nivel===1)return c.nombre;
  const p=ccInfo(c.padre);
  return (p?p.nombre+' › ':'')+c.nombre;
}

export async function guardarCentros(){
  if(!S.centros)S.centros=[];
  try{await window.storage.set('centros',JSON.stringify(S.centros));}catch(e){}
}

export async function cargarCentros(){
  try{
    const r=await window.storage.get('centros');
    S.centros=r?JSON.parse(r.value):[];
    if(!Array.isArray(S.centros))S.centros=[];
  }catch(e){S.centros=[];}
  return S.centros;
}

export function crearCentro({nivel,nombre,codigo,padre,estado,fechaInicio,curva,pctsCapitalizacion,cuentaCosto}){
  if(!S.centros)S.centros=[];
  const id='cc_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  S.centros.push({
    id, nivel:+nivel, nombre, codigo:codigo||'',
    padre:nivel===2?padre:null,
    estado:nivel===2?(estado||'formacion'):null,
    fechaInicio:fechaInicio||'',
    curva:nivel===2?(curva||'cerezo'):null,
    pctsCapitalizacion:nivel===2?(pctsCapitalizacion||null):null,
    cuentaCosto:nivel===2?(cuentaCosto||'3101003'):null, // cuenta de costo del huerto
    capitalizadoEn:null,
  });
  return id;
}

export function actualizarCentro(id,campos){
  const c=ccInfo(id);
  if(c)Object.assign(c,campos);
}

export function eliminarCentro(id){
  const c=ccInfo(id);
  if(!c)return {ok:false,motivo:'No existe'};
  // No permitir borrar un centro con subcentros
  if(c.nivel===1&&cuarteles(id).length)
    return {ok:false,motivo:'Tiene subcentros asociados. Elimínalos primero.'};
  // No permitir borrar si tiene movimientos
  if(contarMovimientos(id)>0)
    return {ok:false,motivo:'Tiene movimientos registrados. Puedes marcarlo como capitalizado o cambiar su tipo en vez de borrarlo.'};
  S.centros=centros().filter(x=>x.id!==id);
  return {ok:true};
}

// ── Costos acumulados por centro ──
// Recorre compras y asientos manuales buscando el campo cc (centro de costo).
export function contarMovimientos(idCC){
  let n=0;
  (S.compras||[]).forEach(d=>{
    if(d.cc===idCC)n++;
    (d.dist||[]).forEach(x=>{if(x.cc===idCC)n++;});
  });
  (S.asientos||[]).forEach(a=>{
    if(a.anulado||a.tipoCierreCC)return;
    (a.movs||[]).forEach(m=>{if(m.cc===idCC)n++;});
  });
  return n;
}

// Suma los cargos (debe) asociados a un centro de costo.
// Solo cuentas de gasto/costo (grupo 3) o de activo en curso, según se registre.
export function costoAcumulado(idCC,opts={}){
  const soloHasta=opts.hasta||null; // fecha límite YYYY-MM-DD
  let total=0;
  const detalle=[];
  const dentroFecha=f=>!soloHasta||!f||f<=soloHasta;

  // Compras: el centro puede venir en el documento o en cada línea de distribución
  (S.compras||[]).forEach(d=>{
    if(!dentroFecha(d.fecha))return;
    (d.dist||[]).forEach(x=>{
      if(x.cc===idCC&&+x.monto){
        total+=+x.monto;
        detalle.push({fecha:d.fecha,origen:'Compra',doc:`DTE ${d.tipoDTE} N°${d.numero}`,glosa:d.razonSocial||'',cuenta:x.cuenta||x.cd||'',monto:+x.monto});
      }
    });
    // Documento completo asignado a un centro y sin distribución por línea
    if(d.cc===idCC&&!(d.dist||[]).some(x=>x.cc)){
      const m=+d.neto||0;
      if(m){total+=m;detalle.push({fecha:d.fecha,origen:'Compra',doc:`DTE ${d.tipoDTE} N°${d.numero}`,glosa:d.razonSocial||'',cuenta:'',monto:m});}
    }
  });

  // Asientos manuales: líneas con cc
  (S.asientos||[]).forEach(a=>{
    if(a.anulado||!dentroFecha(a.fecha))return;
    // Los asientos de cierre/capitalización mueven costos YA contados:
    // incluirlos duplicaría el acumulado del centro.
    if(a.tipoCierreCC)return;
    (a.movs||[]).forEach(m=>{
      if(m.cc===idCC){
        const monto=(+m.debe||0)-(+m.haber||0);
        if(monto){
          total+=monto;
          detalle.push({fecha:a.fecha,origen:'Asiento',doc:'N°'+a.n,glosa:a.glosa||'',cuenta:m.cd||'',monto});
        }
      }
    });
  });

  detalle.sort((x,y)=>(x.fecha||'').localeCompare(y.fecha||''));
  return {total,detalle};
}

// Costo acumulado desglosado POR TEMPORADA AGRÍCOLA (mayo-abril), aplicando la
// curva de capitalización. Devuelve cuánto de lo gastado en cada temporada va a
// activo (inversión) y cuánto a costo del huerto (resultado).
export function costoPorAnio(idCC){
  const centro=ccInfo(idCC);
  const {detalle}=costoAcumulado(idCC);
  const porTemp={};
  detalle.forEach(d=>{
    const t=temporadaDe(d.fecha);
    if(t==null)return;
    if(!porTemp[t])porTemp[t]={anio:t,temporada:t,lbl:temporadaLbl(t),total:0,movs:0};
    porTemp[t].total+=d.monto;
    porTemp[t].movs++;
  });
  const filas=Object.values(porTemp).sort((a,b)=>a.temporada-b.temporada).map(f=>{
    const r=repartirCosto(centro,f.temporada,f.total);
    return {...f,anioFormacion:anioFormacion(centro,f.temporada),pct:r.pct,activo:r.activo,costo:r.costo};
  });
  return {
    filas,
    totalGasto:filas.reduce((s,f)=>s+f.total,0),
    totalActivo:filas.reduce((s,f)=>s+f.activo,0),
    totalCosto:filas.reduce((s,f)=>s+f.costo,0),
  };
}

// ── Cierre mensual de costos ──
// Cada mes el administrador traspasa los gastos acumulados del período:
// una parte se activa (inversión en formación) y otra va a costo del huerto.
// Se registra qué meses ya fueron cerrados para no duplicar.

// Gastos de un centro en un mes concreto (YYYY-MM).
// Si el mes ya fue cerrado, se informa igual pero marcado como cerrado
// (la UI impide volver a traspasarlo).
export function costosDelMes(idCC,anio,mes){
  const centro=ccInfo(idCC);
  const {detalle}=costoAcumulado(idCC);
  const per=`${anio}-${String(mes).padStart(2,'0')}`;
  const delMes=detalle.filter(d=>String(d.fecha||'').slice(0,7)===per);
  const total=delMes.reduce((s,d)=>s+d.monto,0);
  // El % aplicable es el de la TEMPORADA a la que pertenece ese mes
  const temp=temporadaDe(`${per}-15`);
  const r=repartirCosto(centro,temp,total);
  const porCuenta={};
  delMes.forEach(d=>{const cd=d.cuenta||'SIN';porCuenta[cd]=(porCuenta[cd]||0)+d.monto;});
  return {
    periodo:per, temporada:temp, lblTemporada:temporadaLbl(temp),
    anioFormacion:anioFormacion(centro,temp),
    total, pct:r.pct, activo:r.activo, costo:r.costo,
    movimientos:delMes.length, detalle:delMes, porCuenta,
  };
}

// Registro de cierres ya ejecutados: S.cierresCC = [{cc,periodo,fecha,folio,activo,costo}]
export const cierresCC=()=>S.cierresCC||[];
export const estaCerrado=(idCC,anio,mes)=>{
  const per=`${anio}-${String(mes).padStart(2,'0')}`;
  return cierresCC().some(c=>c.cc===idCC&&c.periodo===per);
};
export function registrarCierre(reg){
  if(!S.cierresCC)S.cierresCC=[];
  S.cierresCC.push(reg);
}
export function revertirCierre(idCC,periodo){
  S.cierresCC=cierresCC().filter(c=>!(c.cc===idCC&&c.periodo===periodo));
}
export async function guardarCierresCC(){
  try{await window.storage.set('cierresCC',JSON.stringify(S.cierresCC||[]));}catch(e){}
}
export async function cargarCierresCC(){
  try{
    const r=await window.storage.get('cierresCC');
    S.cierresCC=r?JSON.parse(r.value):[];
    if(!Array.isArray(S.cierresCC))S.cierresCC=[];
  }catch(e){S.cierresCC=[];}
  return S.cierresCC;
}

// Resumen jerárquico: cada centro principal con sus subcentros y costos
export function resumenCentros(){
  return principales().map(p=>({
    predio:p,        // centro principal (nombre histórico de la propiedad)
    cuarteles:subcentros(p.id).map(c=>({
      centro:c,
      costo:costoAcumulado(c.id).total,
      movimientos:contarMovimientos(c.id),
    })),
  }));
}

// Opciones <option> para los selectores de los formularios
export function ccOpts(sel='',incluirVacio=true){
  let h=incluirVacio?'<option value="">— sin centro de costo —</option>':'';
  principales().forEach(p=>{
    const hijos=subcentros(p.id);
    if(!hijos.length){
      h+=`<option value="${p.id}" ${sel===p.id?'selected':''}>${p.nombre}</option>`;
      return;
    }
    h+=`<optgroup label="${p.nombre}">`;
    h+=`<option value="${p.id}" ${sel===p.id?'selected':''}>${p.nombre} (general)</option>`;
    hijos.forEach(c=>{
      const badge=c.estado==='capitalizado'?' ✓':(c.estado==='formacion'?' ⏳':'');
      h+=`<option value="${c.id}" ${sel===c.id?'selected':''}>${c.nombre}${badge}</option>`;
    });
    h+='</optgroup>';
  });
  return h;
}
