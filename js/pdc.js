// pdc.js — Plan de cuentas: edición, alta/baja, reset
// Importa de: core (PDC array + helpers), state (S)

import {PDC, recalcDerivadasPDC, toast} from './core.js';
import {S} from './state.js';
import './storage.js'; // instala window.storage

// ═══ PDC ═══
// Guarda el PDC completo en storage (clave global, no por año)
async function savePDC(){
  try{await window.storage.set('pdc',JSON.stringify(PDC));}catch(e){console.error('Error guardando PDC:',e);}
  recalcDerivadasPDC();
}

// Plan de cuentas por defecto — copia inicial para poder resetear
const PDC_DEFAULT=JSON.parse(JSON.stringify([
  {cd:'1',nm:'ACTIVO',tp:'T'},
  {cd:'2',nm:'PASIVO',tp:'T'},
  {cd:'3',nm:'GASTOS',tp:'T'},
  {cd:'4',nm:'INGRESOS',tp:'T'},
  {cd:'11',nm:'ACTIVOS CORRIENTES',tp:'S'},
  {cd:'12',nm:'ACTIVOS NO CORRIENTES',tp:'S'},
  {cd:'21',nm:'PASIVOS CORRIENTES',tp:'S'},
  {cd:'22',nm:'PASIVOS NO CORRIENTES',tp:'S'},
  {cd:'23',nm:'PATRIMONIO',tp:'S'},
  {cd:'31',nm:'COSTO DE EXPLOTACIÓN',tp:'S'},
  {cd:'32',nm:'GASTOS OPERACIONALES',tp:'S'},
  {cd:'33',nm:'OTROS GASTOS OPERACIONALES',tp:'S'},
  {cd:'34',nm:'GASTOS NO OPERACIONALES',tp:'S'},
  {cd:'35',nm:'CORRECCIÓN MONETARIA',tp:'S'},
  {cd:'36',nm:'IMPUESTO A LA RENTA',tp:'S'},
  {cd:'41',nm:'INGRESOS DE EXPLOTACIÓN',tp:'S'},
  {cd:'42',nm:'INGRESOS FUERA DE EXPLOTACIÓN',tp:'S'},
  {cd:'43',nm:'INGRESOS FINANCIEROS',tp:'S'},
  {cd:'1101',nm:'EFECTIVO Y EQUIVALENTE DE EFECTIVO',tp:'S'},
  {cd:'1103',nm:'INVERSIONES CORTO PLAZO',tp:'S'},
  {cd:'1104',nm:'DEUDORES COMERCIALES Y OTRAS CUENTAS POR COBRAR',tp:'S'},
  {cd:'1105',nm:'DEUDORES INCOBRABLES',tp:'S'},
  {cd:'1106',nm:'CUENTAS CORRIENTES DEL PERSONAL',tp:'S'},
  {cd:'1107',nm:'DEUDORES VARIOS',tp:'S'},
  {cd:'1108',nm:'IMPUESTOS POR RECUPERAR',tp:'S'},
  {cd:'1109',nm:'EXISTENCIAS',tp:'S'},
  {cd:'1110',nm:'ACTIVOS BIOLÓGICOS CORRIENTES',tp:'S'},
  {cd:'1111',nm:'IMPORTACIONES EN TRÁNSITO',tp:'S'},
  {cd:'1190',nm:'OTROS ACTIVOS CORRIENTES',tp:'S'},
  {cd:'1201',nm:'PROPIEDAD, PLANTA Y EQUIPOS (ACTIVOS FIJOS)',tp:'S'},
  {cd:'1202',nm:'ACTIVOS FIJOS EN LEASING',tp:'S'},
  {cd:'1203',nm:'ACTIVOS FINANCIEROS',tp:'S'},
  {cd:'1204',nm:'INVERSIONES EN OTRAS EMPRESAS',tp:'S'},
  {cd:'1205',nm:'OTROS DEUDORES A LARGO PLAZO',tp:'S'},
  {cd:'1206',nm:'ACTIVOS BIOLÓGICOS NO CORRIENTES',tp:'S'},
  {cd:'1207',nm:'ACTIVOS INTANGIBLES',tp:'S'},
  {cd:'1209',nm:'OTROS ACTIVOS NO CORRIENTES',tp:'S'},
  {cd:'1210',nm:'PLANTACIONES FORESTALES',tp:'S'},
  {cd:'2101',nm:'OBLIGACIONES CON BANCOS A CORTO PLAZO',tp:'S'},
  {cd:'2102',nm:'ACREEDORES COMERCIALES',tp:'S'},
  {cd:'2103',nm:'IMPUESTOS POR PAGAR Y RETENCIONES SII',tp:'S'},
  {cd:'2104',nm:'RETENCIONES AL PERSONAL',tp:'S'},
  {cd:'2105',nm:'PROVISIONES CORTO PLAZO',tp:'S'},
  {cd:'2106',nm:'OBLIGACIONES EN LEASING',tp:'S'},
  {cd:'2201',nm:'OBLIGACIONES CON BANCOS A LARGO PLAZO',tp:'S'},
  {cd:'2202',nm:'PROVISIONES LARGO PLAZO',tp:'S'},
  {cd:'2203',nm:'OBLIGACIONES POR DEUDA EMITIDA',tp:'S'},
  {cd:'2209',nm:'BONIFICACIONES FORESTALES',tp:'S'},
  {cd:'2301',nm:'CAPITAL',tp:'S'},
  {cd:'2302',nm:'FONDO REVALORIZACIÓN CAPITAL PROPIO',tp:'S'},
  {cd:'2303',nm:'RESULTADOS ACUMULADOS',tp:'S'},
  {cd:'3101',nm:'COSTO MATERIA PRIMA',tp:'S'},
  {cd:'3103',nm:'OTROS GASTOS EXPLOTACIÓN',tp:'S'},
  {cd:'3201',nm:'COSTO REMUNERACIONES',tp:'S'},
  {cd:'3202',nm:'GASTOS DE ADMINISTRACIÓN Y VENTAS',tp:'S'},
  {cd:'3203',nm:'COMUNICACIONES',tp:'S'},
  {cd:'3204',nm:'GASTOS VEHÍCULOS',tp:'S'},
  {cd:'3205',nm:'GASTOS DE REPRESENTACIÓN',tp:'S'},
  {cd:'3206',nm:'MISCELANEOS',tp:'S'},
  {cd:'3301',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR DE LOS ACTIVOS',tp:'S'},
  {cd:'3302',nm:'CASTIGO INCOBRABLES',tp:'S'},
  {cd:'3401',nm:'GASTOS FINANCIEROS',tp:'S'},
  {cd:'3402',nm:'RESULTADOS EN VENTA ACTIVOS FIJOS',tp:'S'},
  {cd:'3403',nm:'OTROS GASTOS NO OPERACIONALES',tp:'S'},
  {cd:'3501',nm:'CORRECCIÓN MONETARIA',tp:'S'},
  {cd:'3502',nm:'DIFERENCIA DE CAMBIO',tp:'S'},
  {cd:'3601',nm:'IMPUESTO A LA RENTA',tp:'S'},
  {cd:'4101',nm:'INGRESOS DE EXPLOTACIÓN',tp:'S'},
  {cd:'4201',nm:'INGRESOS FUERA DE EXPLOTACIÓN',tp:'S'},
  {cd:'4301',nm:'INGRESOS FINANCIEROS',tp:'S'},
  {cd:'11011',nm:'CAJA',tp:'S'},
  {cd:'11012',nm:'BANCOS',tp:'S'},
  {cd:'12012',nm:'DEPRECIACIÓN ACUMULADA PROPIEDADES, PLANTA Y EQUIPO',tp:'S'},
  {cd:'12022',nm:'DEPRECIACIÓN ACUMULADA ACTIVOS EN LEASING',tp:'S'},
  {cd:'12072',nm:'AMORTIZACIÓN ACTIVOS INTANGIBLES',tp:'S'},
  {cd:'1101101',nm:'CAJA CENTRAL',tp:'A',nat:'D'},
  {cd:'1101102',nm:'CAJA CHICA',tp:'A',nat:'D'},
  {cd:'1101201',nm:'BANCO ESTADO',tp:'A',nat:'D'},
  {cd:'1101202',nm:'BANCO DE CHILE 04',tp:'A',nat:'D'},
  {cd:'1101203',nm:'BANCO DE CHILE 08',tp:'A',nat:'D'},
  {cd:'1101204',nm:'BANCO ESTADO DOLAR',tp:'A',nat:'D'},
  {cd:'1101205',nm:'BANCO SANTANDER',tp:'A',nat:'D'},
  {cd:'1101206',nm:'BANCO BCI',tp:'A',nat:'D'},
  {cd:'1103001',nm:'FONDOS MUTUOS',tp:'A',nat:'D'},
  {cd:'1103002',nm:'DEPOSITO A PLAZO',tp:'A',nat:'D'},
  {cd:'1104001',nm:'FACTURAS POR COBRAR',tp:'A',nat:'D'},
  {cd:'1104002',nm:'CHEQUES EN CARTERA',tp:'A',nat:'D'},
  {cd:'1104003',nm:'LETRAS EN CARTERA',tp:'A',nat:'D'},
  {cd:'1104004',nm:'LETRAS EN COBRANZA',tp:'A',nat:'D'},
  {cd:'1104005',nm:'LETRAS EN DESCUENTO',tp:'A',nat:'D'},
  {cd:'1104006',nm:'DOCUMENTOS PROTESTADOS',tp:'A',nat:'D'},
  {cd:'1105001',nm:'ESTIMACIÓN CLIENTES INCOBRABLES',tp:'A',nat:'D'},
  {cd:'1105002',nm:'ESTIMACIÓN DOCUMENTOS INCOBRABLES',tp:'A',nat:'D'},
  {cd:'1106001',nm:'ANTICIPO DE SUELDO',tp:'A',nat:'D'},
  {cd:'1106002',nm:'PRÉSTAMOS AL PERSONAL',tp:'A',nat:'D'},
  {cd:'1106003',nm:'FONDOS POR RENDIR',tp:'A',nat:'D'},
  {cd:'1107001',nm:'ANTICIPO A PROVEEDORES',tp:'A',nat:'D'},
  {cd:'1107002',nm:'ANTICIPO A HONORARIOS',tp:'A',nat:'D'},
  {cd:'1107003',nm:'OTRAS CUENTAS POR COBRAR',tp:'A',nat:'D'},
  {cd:'1108001',nm:'PAGOS PROVISIONALES MENSUALES',tp:'A',nat:'D'},
  {cd:'1108002',nm:'IVA CRÉDITO FISCAL',tp:'A',nat:'D'},
  {cd:'1108003',nm:'CRÉDITO 4-6% COMPRA ACTIVO',tp:'A',nat:'D'},
  {cd:'1108004',nm:'CRÉDITO GASTOS DE CAPACITACIÓN',tp:'A',nat:'D'},
  {cd:'1108005',nm:'CRÉDITO 2% ADICIONAL ISAPRE',tp:'A',nat:'D'},
  {cd:'1108006',nm:'OTROS IMPUESTOS POR RECUPERAR',tp:'A',nat:'D'},
  {cd:'1109001',nm:'MADERAS',tp:'A',nat:'D'},
  {cd:'1109002',nm:'BOSQUES',tp:'A',nat:'D'},
  {cd:'1109003',nm:'CULTIVOS AGRICOLAS',tp:'A',nat:'D'},
  {cd:'1109004',nm:'FARDOS',tp:'A',nat:'D'},
  {cd:'1109005',nm:'ENVASES Y EMBALAJES',tp:'A',nat:'D'},
  {cd:'1109006',nm:'MADERA PROVEEDORES',tp:'A',nat:'D'},
  {cd:'1110001',nm:'ACTIVOS BIOLÓGICOS CORRIENTES',tp:'A',nat:'D'},
  {cd:'1111001',nm:'IMPORTACIONES EN TRÁNSITO',tp:'A',nat:'D'},
  {cd:'1190001',nm:'SEGUROS PAGADOS ANTICIPADO',tp:'A',nat:'D'},
  {cd:'1190002',nm:'ARRIENDOS OFICINAS',tp:'A',nat:'D'},
  {cd:'1190003',nm:'OTROS GASTOS PAGADOS ANTICIPADO',tp:'A',nat:'D'},
  {cd:'1190004',nm:'INTERESES DIFERIDOS POR LEASING',tp:'A',nat:'D'},
  {cd:'1190005',nm:'ARRIENDO PLANTACIONES',tp:'A',nat:'D'},
  {cd:'1201001',nm:'TERRENOS',tp:'A',nat:'D'},
  {cd:'1201002',nm:'BIENES RAÍCES',tp:'A',nat:'D'},
  {cd:'1201003',nm:'MAQUINARIAS Y EQUIPOS',tp:'A',nat:'D'},
  {cd:'1201004',nm:'INSTALACIONES',tp:'A',nat:'D'},
  {cd:'1201005',nm:'VEHÍCULOS',tp:'A',nat:'D'},
  {cd:'1201006',nm:'EQUIPOS DE OFICINA',tp:'A',nat:'D'},
  {cd:'1201202',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR ACUMULADOS BIENES RAÍCES',tp:'A',nat:'D'},
  {cd:'1201203',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR ACUMULADOS MAQUINARIA Y E',tp:'A',nat:'D'},
  {cd:'1201204',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR ACUMULADOS INSTALACIONES',tp:'A',nat:'D'},
  {cd:'1201205',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR ACUMULADOS VEHÍCULOS',tp:'A',nat:'D'},
  {cd:'1201206',nm:'DEPRECIACIÓN Y DETERIORO DEL VALOR ACUMULADOS EQUIPOS DE OFI',tp:'A',nat:'D'},
  {cd:'1202001',nm:'TERRENOS EN LEASING',tp:'A',nat:'D'},
  {cd:'1202002',nm:'BIENES RAÍCES EN LEASING',tp:'A',nat:'D'},
  {cd:'1202003',nm:'MAQUINARIAS Y EQUIPOS EN LEASING',tp:'A',nat:'D'},
  {cd:'1202004',nm:'INSTALACIONES EN LEASING',tp:'A',nat:'D'},
  {cd:'1202005',nm:'VEHÍCULOS EN LEASING',tp:'A',nat:'D'},
  {cd:'1202201',nm:'DEPRECIACIÓN ACUMULADA ACTIVOS EN LEASING',tp:'A',nat:'D'},
  {cd:'1203001',nm:'INVERSIONES FINANCIERAS A LARGO PLAZO',tp:'A',nat:'D'},
  {cd:'1204001',nm:'INVERSIONES EN OTRAS EMPRESAS',tp:'A',nat:'D'},
  {cd:'1204002',nm:'INVERSIONES EN OTRAS EMPRESAS DEL GRUPO',tp:'A',nat:'D'},
  {cd:'1205001',nm:'DEUDORES POR VENTAS CON VENCIMIENTO A MÁS DE UN AÑO',tp:'A',nat:'D'},
  {cd:'1206001',nm:'ACTIVOS BIOLÓGICOS',tp:'A',nat:'D'},
  {cd:'1207001',nm:'SOFTWARE',tp:'A',nat:'D'},
  {cd:'1207002',nm:'PORPIEDAD INDUSTRIAL',tp:'A',nat:'D'},
  {cd:'1207003',nm:'DERECHOS DE MARCA',tp:'A',nat:'D'},
  {cd:'1207004',nm:'OTROS ACTIVOS INTANGIBLES',tp:'A',nat:'D'},
  {cd:'1207201',nm:'AMORTIZACIÓN ACUMULADA ACTIVOS INTANGIBLES',tp:'A',nat:'D'},
  {cd:'1210001',nm:'PLANTACION FORESTAL SAUCE GRANDE',tp:'A',nat:'D'},
  {cd:'2101001',nm:'CREDITO BANCO CHILE',tp:'P',nat:'C'},
  {cd:'2101002',nm:'LÍNEAS DE CRÉDITO',tp:'P',nat:'C'},
  {cd:'2101003',nm:'OBLIGACIONES POR LEASING CORTO PLAZO',tp:'P',nat:'C'},
  {cd:'2101004',nm:'CREDITO BANCO ESTADO',tp:'P',nat:'C'},
  {cd:'2102001',nm:'PROVEEDORES NACIONALES',tp:'P',nat:'C'},
  {cd:'2102002',nm:'PROVEEDORES EXTRANJEROS',tp:'P',nat:'C'},
  {cd:'2102003',nm:'CHEQUES POR PAGAR',tp:'P',nat:'C'},
  {cd:'2102004',nm:'LETRAS POR PAGAR',tp:'P',nat:'C'},
  {cd:'2102005',nm:'ACREEDORES VARIOS',tp:'P',nat:'C'},
  {cd:'2102006',nm:'HONORARIOS POR PAGAR',tp:'P',nat:'C'},
  {cd:'2102007',nm:'ANTICIPOS DE CLIENTES',tp:'P',nat:'C'},
  {cd:'2103002',nm:'RETENCIÓN 2º CATEGORÍA',tp:'P',nat:'C'},
  {cd:'2103003',nm:'IVA DÉBITO FISCAL',tp:'P',nat:'C'},
  {cd:'2103004',nm:'OTROS IMPUESTOS POR PAGAR',tp:'P',nat:'C'},
  {cd:'2104001',nm:'INSTITUCIONES PREVISIONALES POR PAGAR',tp:'P',nat:'C'},
  {cd:'2104002',nm:'IMPUESTOS POR PAGAR',tp:'P',nat:'C'},
  {cd:'2104005',nm:'REMUNERACIONES POR PAGAR',tp:'P',nat:'C'},
  {cd:'2105001',nm:'PROVISIÓN IMPUESTO RENTA',tp:'P',nat:'C'},
  {cd:'2105002',nm:'PROVISIONES VARIAS',tp:'P',nat:'C'},
  {cd:'2105003',nm:'PROVISIÓN IVA',tp:'P',nat:'C'},
  {cd:'2105004',nm:'PROVISIÓN VACACIONES',tp:'P',nat:'C'},
  {cd:'2105005',nm:'PROVISIÓN GRATIFICACION',tp:'P',nat:'C'},
  {cd:'2105006',nm:'PROVISIÓN PPM',tp:'P',nat:'C'},
  {cd:'2106001',nm:'OBLIG. LEASING TRINEUMATICO',tp:'P',nat:'C'},
  {cd:'2201001',nm:'OBLIGACIONES CON BANCOS A LARGO PLAZO',tp:'P',nat:'C'},
  {cd:'2201002',nm:'OBLIGACIONES POR LEASING A LARGO PLAZO',tp:'P',nat:'C'},
  {cd:'2202001',nm:'PROVISIÓN INDEMNIZACIÓN AÑOS DE SERVICIO',tp:'P',nat:'C'},
  {cd:'2202002',nm:'PROVISIONES VARIAS',tp:'P',nat:'C'},
  {cd:'2203001',nm:'OBLIGACIONES POR BONOS A LARGO PLAZO',tp:'P',nat:'C'},
  {cd:'2209001',nm:'INCENTIVOS POR VOLUMEN A PROVEEDORES',tp:'P',nat:'C'},
  {cd:'2301001',nm:'CAPITAL SOCIAL',tp:'P',nat:'C'},
  {cd:'2301002',nm:'REINVERSIONES RECIBIDAS',tp:'P',nat:'C'},
  {cd:'2301003',nm:'CAPITALIZACIONES',tp:'P',nat:'C'},
  {cd:'2301004',nm:'CUENTA PARTICULAR SOCIOS',tp:'P',nat:'C'},
  {cd:'2302001',nm:'FONDO REVALORIZACIÓN CAPITAL PROPIO',tp:'P',nat:'C'},
  {cd:'2303001',nm:'RESULTADOS ACUMULADOS',tp:'P',nat:'C'},
  {cd:'3101001',nm:'COSTO VENTA BOSQUES',tp:'C',nat:'D'},
  {cd:'3101002',nm:'COSTO VENTA PROVEEDORES',tp:'C',nat:'D'},
  {cd:'3101003',nm:'COSTO VENTA PLANTACIONES',tp:'C',nat:'D'},
  {cd:'3101004',nm:'COSTO VENTA DE CULTIVOS AGRICOLAS',tp:'C',nat:'D'},
  {cd:'3101005',nm:'COSTO SERVICIOS FORESTALES',tp:'C',nat:'D'},
  {cd:'3103001',nm:'HECHURA DE MADERA',tp:'C',nat:'D'},
  {cd:'3103002',nm:'ARRIENDO DE MAQUINARIA',tp:'C',nat:'D'},
  {cd:'3103003',nm:'COMBUSTIBLE Y LUBRICANTES',tp:'C',nat:'D'},
  {cd:'3103004',nm:'FLETE Y CARGUIO',tp:'C',nat:'D'},
  {cd:'3103005',nm:'TRASLADO DE MAQUINARIA',tp:'C',nat:'D'},
  {cd:'3103006',nm:'SERVICIO DE CARGUÍO',tp:'C',nat:'D'},
  {cd:'3103007',nm:'ARRIENDO PLANTACIONES',tp:'C',nat:'D'},
  {cd:'3201001',nm:'SUELDOS Y SALARIOS',tp:'C',nat:'D'},
  {cd:'3201002',nm:'SOBRE TIEMPO',tp:'C',nat:'D'},
  {cd:'3201003',nm:'COLACIÓN',tp:'C',nat:'D'},
  {cd:'3201004',nm:'MOVILIZACIÓN',tp:'C',nat:'D'},
  {cd:'3201005',nm:'COMISIONES POR VENTAS',tp:'C',nat:'D'},
  {cd:'3201006',nm:'BONOS',tp:'C',nat:'D'},
  {cd:'3201007',nm:'OTROS BENEFICIOS',tp:'C',nat:'D'},
  {cd:'3201008',nm:'AGUINALDOS',tp:'C',nat:'D'},
  {cd:'3201009',nm:'INDEMNIZACIONES',tp:'C',nat:'D'},
  {cd:'3201010',nm:'PERSONAL DE REEMPLAZO',tp:'C',nat:'D'},
  {cd:'3201011',nm:'VACACIONES',tp:'C',nat:'D'},
  {cd:'3201012',nm:'GRATIFICACIÓN',tp:'C',nat:'D'},
  {cd:'3201013',nm:'APORTE PATRONAL',tp:'C',nat:'D'},
  {cd:'3201014',nm:'FINIQUITOS',tp:'C',nat:'D'},
  {cd:'3202001',nm:'ASESORÍA LEGAL',tp:'C',nat:'D'},
  {cd:'3202002',nm:'ASESORÍA TRIBUTARIA',tp:'C',nat:'D'},
  {cd:'3202003',nm:'ASESORÍA LABORAL',tp:'C',nat:'D'},
  {cd:'3202005',nm:'SERVICIOS CONTABLES',tp:'C',nat:'D'},
  {cd:'3202006',nm:'PUBLICIDAD Y PROPAGANDA',tp:'C',nat:'D'},
  {cd:'3202007',nm:'ASEO OFICINA',tp:'C',nat:'D'},
  {cd:'3202009',nm:'ARTÍCULOS DE OFICINA',tp:'C',nat:'D'},
  {cd:'3202010',nm:'GASTOS IMPRENTA',tp:'C',nat:'D'},
  {cd:'3202011',nm:'GASTOS DE LOCOMOCIÓN VENTAS',tp:'C',nat:'D'},
  {cd:'3202012',nm:'ELECTRICIDAD',tp:'C',nat:'D'},
  {cd:'3202013',nm:'GASTOS NOTARIALES',tp:'C',nat:'D'},
  {cd:'3202014',nm:'GASTOS BANCARIOS',tp:'C',nat:'D'},
  {cd:'3202015',nm:'GAS PARAFINA',tp:'C',nat:'D'},
  {cd:'3202016',nm:'SERVICIO DE SEGURIDAD',tp:'C',nat:'D'},
  {cd:'3202018',nm:'INSUMOS COMPUTACIONALES',tp:'C',nat:'D'},
  {cd:'3202019',nm:'HONORARIOS PROFESIONALES',tp:'C',nat:'D'},
  {cd:'3202020',nm:'SUSCRIPCIONES',tp:'C',nat:'D'},
  {cd:'3202023',nm:'MANTENCION DE ACTIVOS',tp:'C',nat:'D'},
  {cd:'3202024',nm:'GASTOS GENERALES',tp:'C',nat:'D'},
  {cd:'3202025',nm:'CONTRIBUCION BIENES RAÍCES',tp:'C',nat:'D'},
  {cd:'3202026',nm:'FLETES EXTERNOS',tp:'C',nat:'D'},
  {cd:'3202029',nm:'UNIFORMES',tp:'C',nat:'D'},
  {cd:'3202030',nm:'AGUA',tp:'C',nat:'D'},
  {cd:'3202031',nm:'GASTOS EVENTOS',tp:'C',nat:'D'},
  {cd:'3202032',nm:'GASTOS RAPPEL',tp:'C',nat:'D'},
  {cd:'3202033',nm:'GASTOS POR APERTURA DE LOCALES',tp:'C',nat:'D'},
  {cd:'3202034',nm:'PENSION - RESIDENCIAL',tp:'C',nat:'D'},
  {cd:'3202035',nm:'MATERIALES PARA PRODUCCION',tp:'C',nat:'D'},
  {cd:'3202036',nm:'GASTOS FINANCIEROS',tp:'C',nat:'D'},
  {cd:'3203001',nm:'TELEFONÍA NACIONAL',tp:'C',nat:'D'},
  {cd:'3203002',nm:'TELEFONÍA INTERNACIONAL',tp:'C',nat:'D'},
  {cd:'3203003',nm:'INTERNET',tp:'C',nat:'D'},
  {cd:'3203004',nm:'CELULARES',tp:'C',nat:'D'},
  {cd:'3204001',nm:'COMBUSTIBLE',tp:'C',nat:'D'},
  {cd:'3204002',nm:'PATENTE',tp:'C',nat:'D'},
  {cd:'3204004',nm:'SEGUROS',tp:'C',nat:'D'},
  {cd:'3204005',nm:'PEAJES',tp:'C',nat:'D'},
  {cd:'3204006',nm:'ESTACIONAMIENTO',tp:'C',nat:'D'},
  {cd:'3204007',nm:'PARTES MUNICIPALES',tp:'C',nat:'D'},
  {cd:'3204008',nm:'MANTENCIÓN Y REPARACIÓN',tp:'C',nat:'D'},
  {cd:'3205001',nm:'COMBUSTIBLE GERENCIA',tp:'C',nat:'D'},
  {cd:'3205002',nm:'PEAJES Y PROPINAS',tp:'C',nat:'D'},
  {cd:'3205003',nm:'ALOJAMIENTO',tp:'C',nat:'D'},
  {cd:'3205004',nm:'ALIMENTACION',tp:'C',nat:'D'},
  {cd:'3205005',nm:'PASAJES',tp:'C',nat:'D'},
  {cd:'3205006',nm:'ARRIENDO VEHÍCULOS',tp:'C',nat:'D'},
  {cd:'3205007',nm:'ESTACIONAMIENTO',tp:'C',nat:'D'},
  {cd:'3206001',nm:'PATENTES COMERCIALES',tp:'C',nat:'D'},
  {cd:'3206002',nm:'SEGUROS',tp:'C',nat:'D'},
  {cd:'3206003',nm:'CONTRIBUCIONES BIENES RAÍCES',tp:'C',nat:'D'},
  {cd:'3301002',nm:'DEPRECIACIÓN BIENES RAÍCES',tp:'C',nat:'D'},
  {cd:'3301003',nm:'DEPRECIACIÓN MAQUINARIAS Y EQUIPOS',tp:'C',nat:'D'},
  {cd:'3301004',nm:'DEPRECIACIÓN INSTALACIONES',tp:'C',nat:'D'},
  {cd:'3301005',nm:'DEPRECIACIÓN VEHÍCULOS',tp:'C',nat:'D'},
  {cd:'3301006',nm:'DEPRECIACIÓN EQUIPOS DE OFICINA',tp:'C',nat:'D'},
  {cd:'3301102',nm:'DETERIORO DEL VALOR DE BIENES RAÍCES',tp:'C',nat:'D'},
  {cd:'3301103',nm:'DETERIORO DEL VALOR DE MAQUINARIAS Y EQUIPOS',tp:'C',nat:'D'},
  {cd:'3301104',nm:'DETERIORO DEL VALOR DE INSTALACIONES',tp:'C',nat:'D'},
  {cd:'3301105',nm:'DETERIORO DEL VALOR DE VEHÍCULOS',tp:'C',nat:'D'},
  {cd:'3301106',nm:'DETERIORO DEL VALOR DE EQUIPOS DE OFICINA',tp:'C',nat:'D'},
  {cd:'3301900',nm:'DEPRECIACIÓN ACTIVO FIJO EN LEASING',tp:'C',nat:'D'},
  {cd:'3301901',nm:'DETERIORO DEL VALOR DE ACTIVO FIJO EN LEASING',tp:'C',nat:'D'},
  {cd:'3302001',nm:'CASTIGO INCOBRABLES',tp:'C',nat:'D'},
  {cd:'3401001',nm:'INTERESES BANCARIOS',tp:'C',nat:'D'},
  {cd:'3401002',nm:'IMPUESTO TIMBRE Y ESTAMPILLAS',tp:'C',nat:'D'},
  {cd:'3401003',nm:'REAJUSTE PRÉSTAMOS BANCARIOS',tp:'C',nat:'D'},
  {cd:'3401004',nm:'OTROS INTERESES',tp:'C',nat:'D'},
  {cd:'3402001',nm:'PÉRDIDA EN VENTA ACTIVOS FIJO',tp:'C',nat:'D'},
  {cd:'3403001',nm:'OTROS GASTOS NO OPERACIONALES',tp:'C',nat:'D'},
  {cd:'3501001',nm:'CORRECCIÓN MONETARIA',tp:'C',nat:'D'},
  {cd:'3502001',nm:'DIFERENCIA DE CAMBIO',tp:'C',nat:'D'},
  {cd:'3601001',nm:'IMPUESTO PRIMERA CATEGORÍA',tp:'C',nat:'D'},
  {cd:'3601002',nm:'IMPUESTO 35 %',tp:'C',nat:'D'},
  {cd:'3601003',nm:'IMPUESTOS DIFERIDOS',tp:'C',nat:'D'},
  {cd:'4101001',nm:'INGRESOS FORESTALES',tp:'I',nat:'C'},
  {cd:'4101002',nm:'INGRESOS POR VENTA PROVEEDORES',tp:'I',nat:'C'},
  {cd:'4101003',nm:'INGRESOS POR VENTA PLANTACIONES',tp:'I',nat:'C'},
  {cd:'4101004',nm:'INGRESOS AGRICOLAS',tp:'I',nat:'C'},
  {cd:'4101005',nm:'INGRESOS POR SERVICIOS FORESTALES',tp:'I',nat:'C'},
  {cd:'4201001',nm:'UTILIDAD POR VENTA DE ACTIVOS FIJOS',tp:'I',nat:'C'},
  {cd:'4201002',nm:'OTROS INGRESOS FUERA DE EXPLOTACIÓN',tp:'I',nat:'C'},
  {cd:'4201003',nm:'REAJUSTE UTM',tp:'I',nat:'C'},
  {cd:'4301001',nm:'INTERESES GANADOS',tp:'I',nat:'C'},
  {cd:'4301002',nm:'OTROS INGRESOS FINANCIEROS',tp:'I',nat:'C'},
  {cd:'4301003',nm:'INGRESOS POR ARRIENDO',tp:'I',nat:'C'}
]));

let PF={editCd:null}; // Estado del formulario PDC

function abrirPdcForm(){
  PF={editCd:null};
  const f=document.getElementById('pdc-form');f.style.display='block';
  document.getElementById('pdc-form-title').textContent='Nueva Cuenta';
  ['pdc-cd','pdc-nm'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pdc-tp').value='A';
  document.getElementById('pdc-nat').value='D';
  f.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.getElementById('pdc-cd').focus(),120);
}

function editarCuenta(cd){
  const c=PDC.find(x=>x.cd===cd);if(!c)return;
  PF={editCd:cd};
  const f=document.getElementById('pdc-form');f.style.display='block';
  document.getElementById('pdc-form-title').textContent='Editando Cuenta — '+cd;
  document.getElementById('pdc-cd').value=c.cd;
  document.getElementById('pdc-nm').value=c.nm;
  document.getElementById('pdc-tp').value=c.tp;
  document.getElementById('pdc-nat').value=c.nat||'';
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function cerrarPdcForm(){document.getElementById('pdc-form').style.display='none';PF={editCd:null};}

async function guardarCuenta(){
  const cd=document.getElementById('pdc-cd').value.trim();
  const nm=document.getElementById('pdc-nm').value.trim();
  const tp=document.getElementById('pdc-tp').value;
  let nat=document.getElementById('pdc-nat').value;

  if(!cd){toast('⚠️ Ingresa el código','e');return;}
  if(!nm){toast('⚠️ Ingresa el nombre','e');return;}
  if(!/^(\d{1,7}|\d{2}\.\d{2}\.\d{2})$/.test(cd)){toast('⚠️ Código inválido. Usa un número (ej: 1101201) o formato XX.XX.XX (ej: 01.01.05)','e');return;}
  if(!['A','P','C','I','S','T'].includes(tp)){toast('⚠️ Tipo inválido','e');return;}

  // Auto-asignar naturaleza si no se especificó (solo para cuentas reales)
  if(!nat&&(tp==='A'||tp==='C'))nat='D';
  else if(!nat&&(tp==='P'||tp==='I'))nat='C';
  else if(tp==='T'||tp==='S')nat='';

  // Duplicado de código
  const dup=PDC.find(x=>x.cd===cd&&x.cd!==PF.editCd);
  if(dup){toast(`⚠️ Ya existe una cuenta con el código ${cd}: ${dup.nm}`,'e');return;}

  if(PF.editCd){
    // Si se cambió el código, validar que no se esté usando en movimientos existentes
    if(PF.editCd!==cd){
      const uso=contarUsoCuenta(PF.editCd);
      if(uso>0){
        toast(`⚠️ No se puede cambiar el código: la cuenta ${PF.editCd} está en uso en ${uso} movimiento${uso===1?'':'s'}. Elimina primero los movimientos.`,'e');
        return;
      }
    }
    const idx=PDC.findIndex(x=>x.cd===PF.editCd);
    if(idx>=0)PDC[idx]={cd,nm,tp,nat};
    toast('✅ Cuenta actualizada');
  }else{
    PDC.push({cd,nm,tp,nat});
    toast('✅ Cuenta '+cd+' agregada');
  }
  await savePDC();
  cerrarPdcForm();
  renderPDC();
}

// Cuenta cuántos movimientos usan un código (para bloquear eliminación si está en uso)
function contarUsoCuenta(cd){
  let n=0;
  S.ventas.forEach(v=>{/* ventas no referencian cuentas directamente, solo via DTE map */});
  S.compras.forEach(c=>(c.dist||[]).forEach(l=>{if(l.cuenta===cd)n++;}));
  S.asientos.forEach(a=>(a.movs||[]).forEach(m=>{if(m.cd===cd)n++;}));
  return n;
}

async function eliminarCuenta(cd){
  const c=PDC.find(x=>x.cd===cd);if(!c)return;
  const uso=contarUsoCuenta(cd);
  if(uso>0){
    toast(`⚠️ No se puede eliminar: ${cd} está en uso en ${uso} movimiento${uso===1?'':'s'}`,'e');
    return;
  }
  // Proteger cuentas críticas del sistema (usadas por ventas/compras automáticas)
  const criticas=['1101201','1104001','1107003','1108002','2103003','2102001','2102006','3202019','4101002','4101003','4101003'];
  if(criticas.includes(cd)){
    if(!confirm(`⚠️ ATENCIÓN: ${cd} ${c.nm}\n\nEs una cuenta usada automáticamente por el sistema (para asientos de ventas, compras u honorarios). Si la eliminas, esos asientos podrían fallar.\n\n¿Eliminar de todas formas?`))return;
  }else{
    if(!confirm(`¿Eliminar la cuenta ${cd} — ${c.nm}?`))return;
  }
  { const _n=PDC.filter(x=>x.cd!==cd); PDC.splice(0,PDC.length,..._n); }
  await savePDC();
  toast('🗑 Cuenta eliminada');
  renderPDC();
}

async function resetPDC(){
  if(!confirm('¿Restaurar el plan de cuentas estándar?\n\nLas cuentas personalizadas que agregaste se PERDERÁN. Los movimientos existentes se mantienen, pero referenciarán códigos que podrían no estar.\n\n¿Continuar?'))return;
  { const _n=JSON.parse(JSON.stringify(PDC_DEFAULT)); PDC.splice(0,PDC.length,..._n); }
  await savePDC();
  toast('↺ Plan de cuentas restaurado');
  renderPDC();
}

function renderPDC(){
  // Ordenar por código
  PDC.sort((a,b)=>a.cd.localeCompare(b.cd));
  const tb={A:'<span class="badge bg">ACTIVO</span>',P:'<span class="badge br">PASIVO</span>',C:'<span class="badge br">COSTO</span>',I:'<span class="badge bg">INGRESO</span>',T:'<span style="color:var(--mt);font-size:10px">TÍTULO</span>',S:'<span style="color:var(--mt);font-size:10px">SUB</span>'};
  const ti={T:'font-weight:700;font-size:13px',S:'font-weight:600;padding-left:12px',A:'padding-left:28px',P:'padding-left:28px',C:'padding-left:28px',I:'padding-left:28px'};
  document.getElementById('pdc-sub').textContent=`${PDC.length} cuentas · ${CUENTAS_GASTO.length} de gasto · ${CUENTAS_SEL.length} operativas`;
  let h=`<div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">CÓDIGO</th><th class="tl">NOMBRE</th><th>TIPO</th><th>NATURALEZA</th><th>USO</th><th style="width:110px"></th></tr></thead>
    <tbody>`;
  PDC.forEach(c=>{
    const nat=c.nat?`<span class="badge ${c.nat==='D'?'bg':'br'}">${c.nat==='D'?'DÉBITO':'CRÉDITO'}</span>`:'<span style="color:var(--mt);font-size:10px">—</span>';
    const uso=contarUsoCuenta(c.cd);
    const usoHtml=uso>0?`<span style="color:var(--info);font-family:var(--mono);font-size:11px">${uso}</span>`:`<span style="color:var(--mt);font-size:10px">—</span>`;
    h+=`<tr>
      <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${c.cd}</td>
      <td class="tl" style="${ti[c.tp]||''}">${c.nm}</td>
      <td>${tb[c.tp]||''}</td>
      <td>${nat}</td>
      <td>${usoHtml}</td>
      <td style="text-align:center">
        <button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarCuenta('${c.cd}')">✏️</button>
        <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="eliminarCuenta('${c.cd}')">🗑</button>
      </td>
    </tr>`;
  });
  document.getElementById('pdc-content').innerHTML=h+'</tbody></table></div></div>';
}


export {savePDC, PDC_DEFAULT, PF, abrirPdcForm, editarCuenta, cerrarPdcForm, guardarCuenta, contarUsoCuenta, eliminarCuenta, resetPDC, renderPDC};
