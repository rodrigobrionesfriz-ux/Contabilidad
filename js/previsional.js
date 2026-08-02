// previsional.js — Instituciones previsionales de Chile y sus tasas.
// Todo es editable desde la sección Indicadores → Previsional, porque las
// comisiones AFP, la tasa SIS y la mutual cambian por resolución.
//
// Fuentes: Superintendencia de Pensiones, Superintendencia de Salud, AFC Chile.

import {S} from './state.js';

// ── Valores de referencia (Superintendencia de Pensiones, 2026) ──
// Comisión = % adicional sobre la renta imponible que cobra la AFP.
export const AFP_DEFAULT=[
  {k:'capital',   nm:'AFP Capital',   comision:1.44},
  {k:'cuprum',    nm:'AFP Cuprum',    comision:1.44},
  {k:'habitat',   nm:'AFP Habitat',   comision:1.27},
  {k:'modelo',    nm:'AFP Modelo',    comision:0.58},
  {k:'planvital', nm:'AFP PlanVital', comision:1.16},
  {k:'provida',   nm:'AFP ProVida',   comision:1.45},
  {k:'uno',       nm:'AFP Uno',       comision:0.46},
];

// Isapres abiertas vigentes. El plan de cada trabajador se pacta en UF (su FUN).
export const ISAPRES_DEFAULT=[
  {k:'fonasa',        nm:'Fonasa'},
  {k:'banmedica',     nm:'Isapre Banmédica'},
  {k:'colmena',       nm:'Isapre Colmena Golden Cross'},
  {k:'consalud',      nm:'Isapre Consalud'},
  {k:'cruzblanca',    nm:'Isapre Cruz Blanca'},
  {k:'esencial',      nm:'Isapre Esencial'},
  {k:'nuevamasvida',  nm:'Isapre Nueva Masvida'},
  {k:'vidatres',      nm:'Isapre Vida Tres'},
  {k:'fundacion',     nm:'Isapre Fundación'},
];

// Mutualidades de seguridad (Ley 16.744). La tasa total = base 0,90% + adicional
// por riesgo de la actividad (0% a 3,4%), que notifica la propia mutual.
export const MUTUALES_DEFAULT=[
  {k:'achs',  nm:'ACHS — Asociación Chilena de Seguridad'},
  {k:'mutual',nm:'Mutual de Seguridad CChC'},
  {k:'ist',   nm:'IST — Instituto de Seguridad del Trabajo'},
  {k:'isl',   nm:'ISL — Instituto de Seguridad Laboral (estatal)'},
];

// Cajas de compensación (opcionales; afiliación de la empresa)
export const CAJAS_DEFAULT=[
  {k:'ninguna',   nm:'Sin caja de compensación'},
  {k:'losandes',  nm:'Caja Los Andes'},
  {k:'laaraucana',nm:'Caja La Araucana'},
  {k:'18septiembre',nm:'Caja 18 de Septiembre'},
  {k:'gabriela',  nm:'Caja Gabriela Mistral'},
];

// ── Tasas del empleador (aporte patronal) ──
export const PATRONAL_DEFAULT={
  sis:1.62,               // Seguro de Invalidez y Sobrevivencia (desde abril 2026)
  mutualBase:0.90,        // cotización básica Ley 16.744
  mutualAdicional:0.00,   // adicional por riesgo: la fija la mutual (0% a 3,4%)
  afcIndefinido:2.40,     // AFC empleador, contrato indefinido
  afcPlazoFijo:3.00,      // AFC empleador, plazo fijo (el trabajador no aporta)
  cajaCompensacion:0.00,  // si la empresa está afiliada (habitualmente 0,6%)
  mutualInstitucion:'achs',
  cajaInstitucion:'ninguna',
};

// ── Acceso a la configuración vigente (mezcla defaults con lo guardado) ──
export function getPrevisional(){
  const g=(S.empresa&&S.empresa.previsional)||{};
  return {
    afps:      g.afps||AFP_DEFAULT,
    isapres:   g.isapres||ISAPRES_DEFAULT,
    mutuales:  g.mutuales||MUTUALES_DEFAULT,
    cajas:     g.cajas||CAJAS_DEFAULT,
    patronal:  {...PATRONAL_DEFAULT,...(g.patronal||{})},
  };
}

export const afpInfo=k=>getPrevisional().afps.find(a=>a.k===k)||getPrevisional().afps[0];
export const isapreInfo=k=>getPrevisional().isapres.find(i=>i.k===k)||getPrevisional().isapres[0];
export const mutualInfo=k=>getPrevisional().mutuales.find(m=>m.k===k)||getPrevisional().mutuales[0];
export const cajaInfo=k=>getPrevisional().cajas.find(c=>c.k===k)||getPrevisional().cajas[0];

// ── Aporte patronal de un trabajador ──
// Devuelve el costo empresa adicional al sueldo bruto, con su desglose y
// la institución a la que se paga cada componente.
export function calcularAportePatronal(t,baseImponible,baseCesantia){
  const p=getPrevisional().patronal;
  const R=n=>Math.round(n||0);
  const indefinido=(t.contrato||'indefinido')==='indefinido';
  const sis=R(baseImponible*p.sis/100);
  const mutualTasa=(+p.mutualBase||0)+(+p.mutualAdicional||0);
  const mutual=R(baseImponible*mutualTasa/100);
  const afcTasa=indefinido?p.afcIndefinido:p.afcPlazoFijo;
  const afc=R(baseCesantia*afcTasa/100);
  const caja=R(baseImponible*(+p.cajaCompensacion||0)/100);
  const total=sis+mutual+afc+caja;
  return {
    sis, mutual, afc, caja, total,
    mutualTasa, afcTasa,
    detalle:[
      {concepto:'SIS (invalidez y sobrevivencia)', tasa:p.sis,      monto:sis,    institucion:'AFP del trabajador'},
      {concepto:'Mutual (Ley 16.744)',             tasa:mutualTasa, monto:mutual, institucion:mutualInfo(p.mutualInstitucion).nm},
      {concepto:`Seguro cesantía (${indefinido?'indefinido':'plazo fijo'})`, tasa:afcTasa, monto:afc, institucion:'AFC Chile'},
      ...(caja>0?[{concepto:'Caja de compensación', tasa:p.cajaCompensacion, monto:caja, institucion:cajaInfo(p.cajaInstitucion).nm}]:[]),
    ],
  };
}
