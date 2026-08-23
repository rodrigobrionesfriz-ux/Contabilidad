// regimenes.js — Catálogo de regímenes tributarios chilenos y sus parámetros.
//
// Módulo base SIN dependencias (igual que state.js): lo importan empresas.js,
// empresa.js, renta.js y la UI. Es la única fuente de verdad sobre qué implica
// cada régimen para la contabilidad de una empresa.
//
// Fuentes: Ley sobre Impuesto a la Renta (D.L. 824), Arts. 14 A), 14 D) N°3,
// 14 D) N°8, 20 y 34; tabla de regímenes del SII; y Circular SII N°53 de
// 03.09.2025 (rebaja transitoria de tasa IDPC y PPM para Pymes).
//
// Cada régimen declara:
//   tasaBase              % de IDPC permanente
//   tasasPorAnio          excepciones transitorias por año comercial
//   ppmSugerido(anio)     % de PPM por defecto al crear la empresa
//   contabilidad          'completa' | 'simplificada'
//   correccionMonetaria   si debe aplicar CM del Art. 41
//   deprInstantanea       si el activo fijo se deduce 100% en el año de compra
//   creditoIDPC           % de crédito del IDPC contra los impuestos finales
//   rentaPresunta         si la base se presume en vez de determinarse
//   topeIngresosUF        tope de ingresos que permite permanecer en el régimen
//   topeCapitalUF         capital efectivo máximo al inicio de actividades
//   recuadro/linea/codLinea  ubicación en el Formulario 22
//   secciones             qué módulos del sistema tienen sentido en este régimen

export const REGIMENES=[
  {
    k:'14D3',
    nm:'Pro Pyme General',
    art:'Art. 14 letra D) N°3 LIR',
    corto:'14 D N°3',
    desc:'Régimen general de las Pymes. Contabilidad completa, depreciación instantánea del activo fijo, liberado de corrección monetaria y crédito del 100% del IDPC contra los impuestos finales de los dueños.',
    tasaBase:25,
    tasasPorAnio:{2025:12.5, 2026:12.5, 2027:12.5, 2028:15},
    ppmBase:0.25,
    ppmPorAnio:{2025:0.125, 2026:0.125, 2027:0.125},
    contabilidad:'completa',
    correccionMonetaria:false,
    deprInstantanea:true,
    creditoIDPC:100,
    rentaPresunta:false,
    topeIngresosUF:75000,
    topeIngresosAnualUF:85000,
    topeCapitalUF:85000,
    recuadro:17, linea:53, codLinea:63,
    cod:{ingresos:'1545', gastos:'1546', base:'1728'},
    secciones:{correccion:false, activofijo:true, provisiones:true, cierre:true},
    nota:'Promedio de ingresos de los últimos 3 años ≤ 75.000 UF, sin superar 85.000 UF en ningún año.',
  },
  {
    k:'14D8',
    nm:'Pro Pyme Transparente',
    art:'Art. 14 letra D) N°8 LIR',
    corto:'14 D N°8',
    desc:'La empresa queda liberada del Impuesto de Primera Categoría: su base imponible se atribuye a los dueños, que la declaran en su Global Complementario. Los PPM también se les atribuyen.',
    tasaBase:0,
    tasasPorAnio:{},
    ppmBase:0.25,
    ppmPorAnio:{2025:0.125, 2026:0.125, 2027:0.125},
    contabilidad:'simplificada',
    correccionMonetaria:false,
    deprInstantanea:true,
    creditoIDPC:0,
    rentaPresunta:false,
    topeIngresosUF:75000,
    topeIngresosAnualUF:85000,
    topeCapitalUF:85000,
    recuadro:22, linea:0, codLinea:0,
    cod:{ingresos:'1545', gastos:'1546', base:'1728'},
    secciones:{correccion:false, activofijo:true, provisiones:true, cierre:true},
    nota:'Sólo si TODOS los dueños son contribuyentes de impuestos finales (personas naturales o sin domicilio en Chile).',
  },
  {
    k:'14A',
    nm:'Régimen General (Semi Integrado)',
    art:'Art. 14 letra A) LIR',
    corto:'14 A',
    desc:'Régimen de la gran empresa. Contabilidad completa obligatoria, corrección monetaria del Art. 41, depreciación según vida útil y crédito parcial: los dueños sólo imputan el 65% del IDPC contra sus impuestos finales.',
    tasaBase:27,
    tasasPorAnio:{},
    ppmBase:null,          // tasa variable, se recalcula cada año según el F22 anterior
    ppmPorAnio:{},
    contabilidad:'completa',
    correccionMonetaria:true,
    deprInstantanea:false,
    creditoIDPC:65,
    rentaPresunta:false,
    topeIngresosUF:null,
    topeIngresosAnualUF:null,
    topeCapitalUF:null,
    recuadro:12, linea:52, codLinea:58,
    cod:{ingresos:'1698', gastos:'1717', base:'643'},
    secciones:{correccion:true, activofijo:true, provisiones:true, cierre:true},
    nota:'Sin límite de ingresos. Es el régimen por defecto de quien no cumple los requisitos Pyme.',
  },
  {
    k:'34AGRI',
    nm:'Agrícola',
    art:'Art. 34 N°2 letra b) LIR',
    corto:'Renta Presunta',
    desc:'La renta no se determina: se presume en un 10% del avalúo fiscal del predio al 1 de enero del año de la declaración. No exige contabilidad completa, pero sí el registro de compras y ventas para el IVA.',
    tasaBase:25,
    tasasPorAnio:{},
    ppmBase:0.25,
    ppmPorAnio:{},
    contabilidad:'simplificada',
    correccionMonetaria:false,
    deprInstantanea:false,
    creditoIDPC:100,
    rentaPresunta:true,
    presuncion:{base:'avaluo', pct:10, lbl:'Avalúo fiscal del predio al 1 de enero'},
    topeIngresosUF:9000,
    topeIngresosAnualUF:9000,
    topeCapitalUF:18000,
    recuadro:0, linea:51, codLinea:57,
    cod:{ingresos:'', gastos:'', base:'808'},
    secciones:{correccion:false, activofijo:false, provisiones:false, cierre:false},
    nota:'Ventas netas anuales ≤ 9.000 UF (sumando las de las empresas relacionadas). Excluye a las sociedades anónimas.',
  },
  {
    k:'34TRANS',
    nm:'Transporte terrestre',
    art:'Art. 34 N°2 letra c) LIR',
    corto:'Renta Presunta',
    desc:'La renta se presume en un 10% del valor corriente en plaza de cada vehículo destinado al transporte terrestre de carga o pasajeros.',
    tasaBase:25,
    tasasPorAnio:{},
    ppmBase:0.3,
    ppmPorAnio:{},
    contabilidad:'simplificada',
    correccionMonetaria:false,
    deprInstantanea:false,
    creditoIDPC:100,
    rentaPresunta:true,
    presuncion:{base:'vehiculos', pct:10, lbl:'Valor corriente en plaza de los vehículos'},
    topeIngresosUF:5000,
    topeIngresosAnualUF:5000,
    topeCapitalUF:10000,
    recuadro:0, linea:51, codLinea:57,
    cod:{ingresos:'', gastos:'', base:'809'},
    secciones:{correccion:false, activofijo:false, provisiones:false, cierre:false},
    nota:'Ventas netas anuales ≤ 5.000 UF.',
  },
  {
    k:'34MIN',
    nm:'Minería',
    art:'Art. 34 N°2 letra a) LIR',
    corto:'Renta Presunta',
    desc:'La renta se presume sobre las ventas netas anuales, con un porcentaje escalonado que sube con el precio promedio de la libra de cobre (de 4% a 20%).',
    tasaBase:25,
    tasasPorAnio:{},
    ppmBase:0.3,
    ppmPorAnio:{},
    contabilidad:'simplificada',
    correccionMonetaria:false,
    deprInstantanea:false,
    creditoIDPC:100,
    rentaPresunta:true,
    presuncion:{base:'ventas', pct:6, lbl:'Ventas netas anuales de minerales', escala:true},
    topeIngresosUF:17000,
    topeIngresosAnualUF:17000,
    topeCapitalUF:34000,
    recuadro:0, linea:51, codLinea:57,
    cod:{ingresos:'', gastos:'', base:'807'},
    secciones:{correccion:false, activofijo:false, provisiones:false, cierre:false},
    nota:'Ventas netas anuales ≤ 17.000 UF. El porcentaje va de 4% a 20% según el precio del cobre: ajústalo a mano cada año.',
  },
  {
    k:'NOSUJ',
    nm:'No sujeto al Art. 14 LIR',
    art:'Art. 14 letra G) LIR',
    corto:'No sujeto',
    desc:'Contribuyentes sin propietarios afectos a impuestos finales: corporaciones, fundaciones, empresas del Estado y similares. Llevan contabilidad completa y tributan con IDPC, pero no hay atribución de rentas a dueños.',
    tasaBase:25,
    tasasPorAnio:{},
    ppmBase:null,
    ppmPorAnio:{},
    contabilidad:'completa',
    correccionMonetaria:true,
    deprInstantanea:false,
    creditoIDPC:0,
    rentaPresunta:false,
    topeIngresosUF:null,
    topeIngresosAnualUF:null,
    topeCapitalUF:null,
    recuadro:12, linea:52, codLinea:58,
    cod:{ingresos:'1698', gastos:'1717', base:'643'},
    secciones:{correccion:true, activofijo:true, provisiones:true, cierre:true},
    nota:'No genera crédito de IDPC porque no hay propietarios que lo imputen.',
  },
];

export const REGIMEN_DEFAULT='14D3';

// Devuelve la ficha del régimen; cae al Pro Pyme General si el código no existe
// (empresas creadas antes de que existiera este catálogo).
export const regimenInfo=k=>REGIMENES.find(r=>r.k===k)||REGIMENES.find(r=>r.k===REGIMEN_DEFAULT);

// Tasa de IDPC vigente para un régimen y año comercial.
export function tasaIDPC(k,anio){
  const r=regimenInfo(k);
  const esp=r.tasasPorAnio&&r.tasasPorAnio[anio];
  return esp!=null?esp:r.tasaBase;
}

// Tasa de PPM sugerida. null = variable, la fija el contribuyente según su F22.
export function tasaPPM(k,anio){
  const r=regimenInfo(k);
  const esp=r.ppmPorAnio&&r.ppmPorAnio[anio];
  if(esp!=null)return esp;
  return r.ppmBase;
}

// Explicación de por qué la tasa es la que es (se muestra bajo el selector).
export function notaTasa(k,anio){
  const r=regimenInfo(k);
  if(r.k==='14D8')return 'La empresa no paga IDPC: la base imponible se atribuye a los dueños.';
  if(r.rentaPresunta)return 'Tasa general de Primera Categoría (Art. 20 LIR) aplicada sobre la renta presunta.';
  if(r.tasasPorAnio&&r.tasasPorAnio[anio]!=null)
    return 'Rebaja transitoria Pyme (Circular SII N°53/2025): '+String(r.tasasPorAnio[anio]).replace('.',',')+
           '% para el año comercial '+anio+', condicionada al cumplimiento del pago de cotizaciones previsionales.';
  if(r.k==='14A')return 'Tasa del régimen semi integrado (Art. 14 A LIR).';
  return 'Tasa permanente del régimen '+r.corto+'.';
}

// Paquete de parámetros que se aplica a S.empresa al elegir un régimen.
export function parametrosDe(k,anio){
  const r=regimenInfo(k);
  return {
    regimen:r.k,
    tasaRenta:tasaIDPC(r.k,anio),
    tasaPPM:tasaPPM(r.k,anio),
    contabilidad:r.contabilidad,
    correccionMonetaria:r.correccionMonetaria,
    deprInstantanea:r.deprInstantanea,
    rentaPresunta:r.rentaPresunta,
  };
}

// ¿Tiene sentido mostrar esta sección con el régimen elegido?
// Las secciones no declaradas se muestran siempre.
export function seccionAplica(k,seccion){
  const r=regimenInfo(k);
  if(!r.secciones||!(seccion in r.secciones))return true;
  return !!r.secciones[seccion];
}

// Etiqueta corta para listados: "14 D N°3 · Pro Pyme General"
export const regimenLbl=k=>{const r=regimenInfo(k);return r.corto+' · '+r.nm;};
