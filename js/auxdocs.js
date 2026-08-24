// auxdocs.js — Cómo se ordenan y se saldan los documentos de un auxiliar.
//
// Módulo compartido por la vista Detalle de Auxiliares y por el reporte por
// auxiliar, para que ambos muestren exactamente lo mismo.
//
// Dos reglas:
//
//  1. Una nota de crédito o débito CON folio de referencia se muestra colgando
//     de su factura, no suelta en la línea del tiempo. Leer el auxiliar de un
//     proveedor con muchas notas era imposible cuando cada una aparecía por su
//     fecha, lejos del documento que corrige.
//
//  2. El saldo de una factura es su total menos los pagos y menos el efecto de
//     las notas que la referencian. Es el saldo que de verdad queda por cobrar
//     o pagar, y el que decide si un documento entra en la vista «sólo con
//     saldo pendiente».

import {S} from './state.js';
import {dteV, dteC} from './core.js';

// Documento original en el libro de ventas o compras, si el movimiento viene
// de ahí. Los movimientos de asientos manuales y de apertura no lo tienen.
export function docOriginal(d,tipo){
  if(!d||!d.docOriginalId)return null;
  const arr=tipo==='cliente'?S.ventas:S.compras;
  return arr.find(x=>x.id===d.docOriginalId)||null;
}

const signoDe=(tipoDTE,tipo)=>((tipo==='cliente'?dteV(tipoDTE):dteC(tipoDTE))?.signo)||1;

// ¿Es nota de crédito o débito? (signo negativo, o ND 56)
export function esNota(d,tipo){
  if(!d||d.tipo!=='doc')return false;
  return signoDe(d.tipoDTE,tipo)<0||+d.tipoDTE===56;
}

// Folio de la factura que referencia esta nota, o '' si va suelta
export function folioRefDe(d,tipo){
  const orig=docOriginal(d,tipo);
  return orig&&orig.folioRef?String(orig.folioRef).trim():'';
}

// ── Saldo por documento ──
// Para una factura: total − pagos − efecto de sus notas referenciadas.
// Para una nota suelta: su propio monto menos lo que se le haya pagado.
// Devuelve {total, pagado, notas, saldo} en moneda con signo de presentación
// (positivo = queda por cobrar/pagar).
export function saldoDeDocumento(d,tipo,notasHijas){
  const orig=docOriginal(d,tipo);
  if(!orig)return {total:d.montoSigno||0,pagado:0,notas:0,saldo:d.montoSigno||0,sinLibro:true};
  const signo=signoDe(orig.tipoDTE,tipo);
  const total=(orig.total||0)*signo;
  const pagado=(orig.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
  const notas=(notasHijas||[]).reduce((s,n)=>{
    const o=docOriginal(n,tipo);
    if(!o)return s;
    return s+((o.total||0)*signoDe(o.tipoDTE,tipo));
  },0);
  return {total,pagado,notas,saldo:total+notas-pagado,sinLibro:false};
}

// ── Ordenar poniendo cada nota bajo su factura ──
//
// Devuelve una lista plana lista para pintar, donde cada elemento lleva:
//   .__nivel      0 = documento principal, 1 = nota colgando de él
//   .__notas      (sólo en las facturas) las notas que la referencian
//   .__saldoDoc   resultado de saldoDeDocumento, para filtrar y mostrar
//
// Las notas sin referencia y los movimientos que no son documentos conservan
// su lugar cronológico: no cuelgan de nada.
export function ordenarConNotas(docs,tipo){
  const lista=[...(docs||[])].sort((x,y)=>String(x.fecha||'').localeCompare(String(y.fecha||'')));

  // Agrupar las notas referenciadas por el folio al que apuntan
  const notasPorFolio={};
  const colgadas=new Set();
  lista.forEach(d=>{
    if(!esNota(d,tipo))return;
    const ref=folioRefDe(d,tipo);
    if(!ref)return;
    (notasPorFolio[ref]||(notasPorFolio[ref]=[])).push(d);
  });

  const salida=[];
  lista.forEach(d=>{
    if(colgadas.has(d))return;
    // ¿Es una nota que ya va colgada de una factura presente en este auxiliar?
    if(esNota(d,tipo)){
      const ref=folioRefDe(d,tipo);
      if(ref&&lista.some(f=>!esNota(f,tipo)&&String(f.numero||'').trim()===ref))return;
    }
    const num=String(d.numero||'').trim();
    const hijas=(!esNota(d,tipo)&&num&&notasPorFolio[num])?notasPorFolio[num]:[];
    hijas.forEach(n=>colgadas.add(n));
    d.__nivel=0;
    d.__notas=hijas;
    d.__saldoDoc=d.tipo==='doc'?saldoDeDocumento(d,tipo,hijas):null;
    salida.push(d);
    hijas
      .sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')))
      .forEach(n=>{
        n.__nivel=1;
        n.__notas=[];
        n.__saldoDoc=saldoDeDocumento(n,tipo,[]);
        salida.push(n);
      });
  });
  return salida;
}

// ¿Este documento queda con saldo pendiente?
// Una nota colgada no se evalúa por su cuenta: vive con su factura.
export function tieneSaldo(d){
  if(d.__nivel===1)return false;
  if(!d.__saldoDoc)return Math.abs(d.montoSigno||0)>1;   // movimientos manuales
  return Math.abs(d.__saldoDoc.saldo)>1;
}

// Filtra dejando sólo los documentos con saldo, arrastrando sus notas.
export function soloConSaldo(lista){
  const salida=[];
  lista.forEach(d=>{
    if(d.__nivel===1)return;              // las notas entran con su factura
    if(!tieneSaldo(d))return;
    salida.push(d);
    (d.__notas||[]).forEach(n=>salida.push(n));
  });
  return salida;
}
