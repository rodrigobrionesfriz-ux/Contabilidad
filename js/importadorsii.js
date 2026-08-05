// importadorsii.js — Lector universal del "Registro de Compras/Ventas" del SII.
//
// El SII entrega dos formatos posibles:
//   - CSV descargado desde la página de "Detalle" (registrocompras.sii.cl)
//   - Excel (.xlsx) exportado desde la misma página
//
// Este módulo detecta el formato y devuelve documentos normalizados,
// listos para pasar por la UI de asignación de cuentas.

import {dteC, dteV, rutParse} from './core.js';

// Convierte un número con formato chileno (miles con . o , separador miles)
export function parseNumSII(v){
  if(v==null)return 0;
  const s=String(v).trim().replace(/\s/g,'').replace(/\$/g,'');
  if(!s||s==='-'||s==='—')return 0;
  // Si tiene coma decimal (últimos 3 caracteres son ",dd")
  const norm=s.includes(',')&&s.lastIndexOf(',')===s.length-3
    ? s.replace(/\./g,'').replace(',','.')
    : s.replace(/[.,]/g,'');
  const n=parseFloat(norm);
  return isNaN(n)?0:n;
}

// Fecha del SII: puede venir "dd/mm/yyyy", "yyyy-mm-dd", o como número serial de Excel
export function parseFechaSII(v){
  if(v==null||v==='')return '';
  // Serial Excel
  if(typeof v==='number'&&v>0&&v<100000){
    const d=new Date(Date.UTC(1899,11,30)+v*86400000);
    return d.toISOString().slice(0,10);
  }
  const s=String(v).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // yyyy-mm-dd
  m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return '';
}

// Split de fila CSV respetando comillas
function splitCSVRow(line,delim=','){
  const out=[];let cur='';let en=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(en&&line[i+1]==='"'){cur+='"';i++;}
      else en=!en;
    }else if(c===delim&&!en){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);
  return out.map(x=>x.trim());
}

// Detecta la columna por variantes del encabezado
function findCol(headers,...variantes){
  for(const v of variantes){
    const idx=headers.findIndex(h=>h.includes(v.toLowerCase()));
    if(idx>=0)return idx;
  }
  return -1;
}

// Parser común. `tipo` es 'compra' o 'venta'.
// `rows` es una matriz de celdas (headers + datos).
function parseFilas(rows,tipo){
  // Buscar la fila de headers
  let headerIdx=-1;
  for(let i=0;i<Math.min(10,rows.length);i++){
    const joined=rows[i].join(' ').toLowerCase();
    const tieneTipo=joined.includes('tipo doc')||joined.includes('tipo dte');
    const tieneRut=joined.includes('rut');
    if(tieneTipo&&tieneRut){headerIdx=i;break;}
  }
  if(headerIdx<0){
    throw new Error(`No se encontró la fila de encabezados. ¿Es el archivo "Detalle de Registro de ${tipo==='compra'?'Compras':'Ventas'}" del SII?`);
  }

  const headers=rows[headerIdx].map(h=>String(h||'').toLowerCase().trim().replace(/"/g,''));
  // Columnas comunes
  const cTipo   = findCol(headers,'tipo doc','tipo dte');
  const cRut    = findCol(headers, tipo==='compra' ? 'rut proveedor' : 'rut cliente' , 'rut receptor','rut emisor','rut');
  const cRazon  = findCol(headers,'razon social','razón social','razonsocial');
  const cNro    = findCol(headers,'nro doc','n° doc','nº doc','folio');
  const cFecha  = findCol(headers,'fecha docto','fecha documento','fecha emision','fecha emisión','fecha doc','fecha');
  const cExento = findCol(headers,'monto exento','exento');
  const cNeto   = findCol(headers,'monto neto','neto');
  const cIvaRec = findCol(headers,'iva recuperable','monto iva recuperable');
  const cIvaNoRec = findCol(headers,'iva no recuperable','monto iva no recuperable');
  const cIva    = findCol(headers,'monto iva','iva');
  const cTotal  = findCol(headers,'monto total','total');
  const cOtro   = findCol(headers,'valor otro impuesto','otro impuesto','otros impuestos');
  const cNetoAF = findCol(headers,'monto neto activo fijo','neto activo fijo');
  const cIvaAF  = findCol(headers,'iva activo fijo');
  const cNroSII = findCol(headers,'nro');   // "Nro" (contador SII) — indica documento nuevo

  if(cTipo<0||cRut<0||cNro<0||cFecha<0||cTotal<0){
    throw new Error('Faltan columnas esenciales (Tipo Doc, RUT, N° Doc, Fecha, Total). Verifica el archivo.');
  }

  const dteValido=tipo==='compra'?dteC:dteV;
  const docs=[]; let descartados=0; let continuaciones=0;

  // Índice para detectar duplicados DENTRO del mismo archivo
  // (algunos archivos del SII pueden repetir filas de encabezado o notas)
  const claves=new Map();

  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i];
    if(!r||r.length<3)continue;

    // ── Filas continuadas del SII (misma factura, otro impuesto) ──
    // En el "Detalle de Registro de Compras" del SII, un documento con dos
    // otros impuestos aparece como DOS filas: la primera con todos los datos,
    // la segunda con "Nro" vacío y solo los datos del segundo impuesto.
    // Debemos sumar el impuesto de la continuación al documento anterior,
    // no crear un documento nuevo.
    const nroSII=cNroSII>=0?String(r[cNroSII]||'').trim():'x';
    const numero=String(r[cNro]||'').trim();
    const esContinuacion=!nroSII&&!!numero===false&&docs.length>0;
    // Si SII trae "Nro" vacío pero la fila tiene monto de impuesto,
    // sumarlo al último documento válido
    if(cNroSII>=0&&!nroSII){
      if(docs.length){
        const extra=cOtro>=0?Math.abs(parseNumSII(r[cOtro])):0;
        if(extra>0){
          docs[docs.length-1].otrosImpuestos+=extra;
          continuaciones++;
        }
      }
      continue;
    }

    const tipoDTE=parseInt(r[cTipo],10)||0;
    if(!tipoDTE||!dteValido(tipoDTE)){descartados++;continue;}
    const rutInfo=rutParse(String(r[cRut]||''));
    if(!rutInfo.codigo){descartados++;continue;}
    const fecha=parseFechaSII(r[cFecha]);
    if(!fecha){descartados++;continue;}

    // Montos: sumamos IVA recuperable + IVA no recuperable + IVA activo fijo
    // (todos son crédito fiscal según su régimen)
    const neto=Math.abs(parseNumSII(r[cNeto]));
    const netoAF=cNetoAF>=0?Math.abs(parseNumSII(r[cNetoAF])):0;
    const exento=Math.abs(parseNumSII(r[cExento]));
    let iva=0;
    if(cIvaRec>=0)iva+=Math.abs(parseNumSII(r[cIvaRec]));
    if(cIvaNoRec>=0)iva+=Math.abs(parseNumSII(r[cIvaNoRec]));
    if(cIvaAF>=0)iva+=Math.abs(parseNumSII(r[cIvaAF]));
    if(!iva&&cIva>=0)iva=Math.abs(parseNumSII(r[cIva]));
    const total=Math.abs(parseNumSII(r[cTotal]));
    const otrosImpuestos=cOtro>=0?Math.abs(parseNumSII(r[cOtro])):0;

    if(!numero||total===0){descartados++;continue;}

    // ── DTE 46 (Factura de compra) ──
    // En este documento el receptor RETIENE el IVA (no lo paga al proveedor).
    // El campo "Otro Impuesto" (código 331) es la retención de IVA, que es el
    // MISMO monto del IVA recuperable — duplicado por diseño.
    // Total del documento = neto (sin IVA, porque el proveedor no lo recibe).
    // Para que el asiento cuadre, NO sumamos "otros" a otrosImpuestos.
    let otrosFinal=otrosImpuestos;
    if(tipoDTE===46){
      otrosFinal=0;
    }

    // ── Dedup dentro del archivo ──
    // Clave: RUT + tipoDTE + número. El SII a veces trae la misma factura
    // dos veces en distintos "detalles" del mismo documento.
    const claveDoc=`${rutInfo.codigo}|${tipoDTE}|${numero}`;
    if(claves.has(claveDoc)){descartados++;continue;}
    claves.set(claveDoc,true);

    docs.push({
      fecha, tipoDTE, numero,
      rutCodigo:rutInfo.codigo, rutDV:rutInfo.dv,
      razonSocial:String(r[cRazon]||'').trim(),
      neto, exento, iva, otrosImpuestos:otrosFinal, total,
      netoAF,   // porción de neto que es activo fijo (guía para asignar cuenta)
    });
  }
  return {docs, descartados, continuaciones};
}

// ── Entradas públicas ──

// Lee un CSV del SII (texto ya cargado)
export function leerCSV(texto,tipo){
  const raw=String(texto||'').replace(/\r/g,'').split('\n').filter(l=>l.trim());
  if(!raw.length)throw new Error('El archivo está vacío');
  const first=raw[0];
  const nSemi=(first.match(/;/g)||[]).length;
  const nComma=(first.match(/,/g)||[]).length;
  const delim=nSemi>=nComma?';':',';
  const rows=raw.map(l=>splitCSVRow(l,delim));
  return parseFilas(rows,tipo);
}

// Lee un archivo Excel del SII (usa XLSX global de SheetJS)
export async function leerExcel(file,tipo){
  if(typeof XLSX==='undefined')throw new Error('La librería Excel (XLSX) no está cargada');
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:false});
  const hoja=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(hoja,{header:1,defval:'',raw:false});
  return parseFilas(rows,tipo);
}

// Dispatcher que detecta el formato por la extensión y llama al parser adecuado
export async function leerArchivo(file,tipo){
  const nombre=(file.name||'').toLowerCase();
  const esExcel=/\.(xlsx|xls)$/.test(nombre);
  if(esExcel)return await leerExcel(file,tipo);
  const texto=await file.text();
  return leerCSV(texto,tipo);
}
