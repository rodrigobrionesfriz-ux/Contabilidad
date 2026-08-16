// libroremuneraciones.js — Libro auxiliar de remuneraciones mensual (Art. 62 CdT)
//
// El Código del Trabajo obliga a llevar un libro auxiliar de remuneraciones a
// las empresas con 5 o más trabajadores. Este módulo arma ese libro mes a mes
// a partir de las liquidaciones.
//
// Punto clave: las liquidaciones se calculan al vuelo con los datos VIGENTES de
// cada trabajador. Un libro legal, en cambio, debe reflejar lo que efectivamente
// se pagó en ese mes. Por eso el libro se puede CERRAR: al cerrarlo se guarda
// una fotografía del mes (montos, UF/UTM y parámetros usados) que ya no cambia
// aunque después se edite un sueldo. Mientras no se cierre, el libro se muestra
// en vivo y se advierte que es provisorio.

import {toast, fmtC, fmt, MESES} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {calcularLiquidacion, getUF, getUTM} from './remuneraciones.js';
import {getIndicadores} from './indicadores.js';
import './storage.js';

// Vista activa de la sección Remuneraciones
let REM_VIEW='trabajadores';   // 'trabajadores' | 'libro'

// ── Persistencia de los meses cerrados ──
// Clave global 'libroRem': { 'YYYY-MM': {...} }
export function librosRem(){
  if(!S.libroRem||typeof S.libroRem!=='object')S.libroRem={};
  return S.libroRem;
}
export async function cargarLibroRem(){
  try{
    const r=await window.storage.get('libroRem');
    S.libroRem=r?JSON.parse(r.value):{};
    if(!S.libroRem||typeof S.libroRem!=='object')S.libroRem={};
  }catch(e){S.libroRem={};}
  return S.libroRem;
}
async function guardarLibroRem(){
  try{await window.storage.set('libroRem',JSON.stringify(librosRem()));}
  catch(e){toast('❌ Error guardando el libro de remuneraciones','e');}
}

const periodoDe=mes=>`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;

// Una línea del libro a partir de un trabajador y su liquidación
function lineaLibro(t,uf,utm){
  const l=calcularLiquidacion(t,uf,utm);
  return {
    id:t.id, nombre:t.nombre, rut:t.rut||'', cargo:t.cargo||'',
    afp:l.afpNm, salud:l.saludNm,
    contrato:t.contrato||'indefinido',
    // Haberes imponibles
    base:+t.base||0,
    gratificacion:l.grat,
    gratDetalle:l.gratModo==='pct'?`${l.gratInfo?l.gratInfo.pct:0}%${l.gratInfo&&l.gratInfo.topeAplicado?' (topeada)':''}`:'pactada',
    otros:+t.otros||0,
    totalImponible:l.totalImponible,
    // Haberes no imponibles
    colacion:+t.colacion||0,
    movilizacion:+t.movilizacion||0,
    totalNoImponible:l.totalNoImponible,
    totalHaberes:l.totalHaberes,
    // Descuentos
    descAFP:l.descAFP, descSalud:l.descSalud, saludLegal:l.saludLegal,
    adicionalIsapre:l.adicionalIsapre, descCesantia:l.descCesantia,
    totalPrevisional:l.totalPrevisional,
    baseTributable:l.baseTributable,
    iusc:l.iusc,
    iuscTramo:l.iuscDet&&l.iuscDet.idx>=0?l.iuscDet.idx+1:0,
    iuscFactor:l.iuscDet?l.iuscDet.factor:0,
    totalDescuentos:l.totalDescuentos,
    liquido:l.liquido,
    // Aportes del empleador
    sis:l.patronal.sis, mutual:l.patronal.mutual, afc:l.patronal.afc,
    caja:l.patronal.caja, totalPatronal:l.patronal.total,
    costoEmpresa:l.costoEmpresa,
  };
}

const CAMPOS_SUMA=['base','gratificacion','otros','totalImponible','colacion','movilizacion',
  'totalNoImponible','totalHaberes','descAFP','descSalud','saludLegal','adicionalIsapre','descCesantia',
  'totalPrevisional','baseTributable','iusc','totalDescuentos','liquido','sis','mutual','afc','caja',
  'totalPatronal','costoEmpresa'];

function totalizar(lineas){
  const t={};
  CAMPOS_SUMA.forEach(k=>{t[k]=lineas.reduce((s,l)=>s+(+l[k]||0),0);});
  t.n=lineas.length;
  return t;
}

// Libro de un mes: el cerrado si existe, si no uno calculado en vivo
export function libroDelMes(mes){
  const per=periodoDe(mes);
  const guardado=librosRem()[per];
  if(guardado&&Array.isArray(guardado.lineas)){
    return {...guardado,cerrado:true,totales:guardado.totales||totalizar(guardado.lineas)};
  }
  const uf=getUF(),utm=getUTM();
  const lineas=(S.trabajadores||[]).map(t=>lineaLibro(t,uf,utm));
  return {periodo:per,anio:S.empresa.anio,mes,uf,utm,lineas,totales:totalizar(lineas),cerrado:false};
}

// ── Cerrar / reabrir el mes ──
export async function cerrarMesRem(){
  const mes=+(document.getElementById('rem-mes')?.value||1);
  const per=periodoDe(mes);
  if(!(S.trabajadores||[]).length){toast('⚠️ No hay trabajadores que registrar','e');return;}
  if(librosRem()[per]&&!confirm(`El libro de ${MESES[mes-1]} ${S.empresa.anio} ya está cerrado.\n¿Reemplazarlo con los datos actuales?`))return;
  const uf=getUF(),utm=getUTM();
  const lineas=(S.trabajadores||[]).map(t=>lineaLibro(t,uf,utm));
  const totales=totalizar(lineas);
  if(!confirm(`Cerrar el libro de remuneraciones de ${MESES[mes-1]} ${S.empresa.anio}\n\n`+
    `${lineas.length} trabajador(es)\nTotal haberes: ${fmtC(totales.totalHaberes)}\nLíquido a pagar: ${fmtC(totales.liquido)}\n\n`+
    `Se guarda una fotografía del mes: los montos quedan fijos aunque después edites un sueldo.\n¿Continuar?`))return;
  librosRem()[per]={
    periodo:per,anio:S.empresa.anio,mes,uf,utm,lineas,totales,
    cerradoEl:new Date().toISOString(),
    indicadores:{ingresoMinimo:getIndicadores().ingresoMinimo,gratifPct:getIndicadores().gratifPct,gratifTopeIMM:getIndicadores().gratifTopeIMM},
  };
  await guardarLibroRem();
  toast(`📗 Libro de ${MESES[mes-1]} cerrado — ${lineas.length} trabajador(es), líquido ${fmtC(totales.liquido)}`);
  logAccion('Cerró libro de remuneraciones',`${MESES[mes-1]} ${S.empresa.anio} · ${lineas.length} trabajadores · ${fmtC(totales.liquido)}`);
  renderLibroRem();
}
export async function reabrirMesRem(){
  const mes=+(document.getElementById('rem-mes')?.value||1);
  const per=periodoDe(mes);
  if(!librosRem()[per]){toast('Este mes no está cerrado');return;}
  if(!confirm(`Reabrir el libro de ${MESES[mes-1]} ${S.empresa.anio}.\n\nEl libro volverá a calcularse con los datos vigentes de cada trabajador y se perderá la fotografía guardada.\n¿Continuar?`))return;
  delete librosRem()[per];
  await guardarLibroRem();
  toast('🔓 Libro reabierto — vuelve a mostrarse en vivo');
  logAccion('Reabrió libro de remuneraciones',`${MESES[mes-1]} ${S.empresa.anio}`);
  renderLibroRem();
}

// ── Vista ──
export function setRemView(v){
  REM_VIEW=v==='libro'?'libro':'trabajadores';
  if(window.renderRemuneraciones)window.renderRemuneraciones();
}
export function getRemView(){return REM_VIEW;}

// Encabezado con las pestañas, compartido por ambas vistas
export function tabsRemuneraciones(){
  return `<div class="aux-tabs">
    <div class="aux-tab ${REM_VIEW==='trabajadores'?'active':''}" onclick="setRemView('trabajadores')">👷 Trabajadores</div>
    <div class="aux-tab ${REM_VIEW==='libro'?'active':''}" onclick="setRemView('libro')">📗 Libro de Remuneraciones</div>
  </div>`;
}

export function renderLibroRem(){
  const el=document.getElementById('rem-content');if(!el)return;
  const mes=+(document.getElementById('rem-mes')?.value||1);
  const L=libroDelMes(mes);
  const T=L.totales;
  const per=`${MESES[mes-1]} ${S.empresa.anio}`;

  if(!L.lineas.length){
    el.innerHTML=tabsRemuneraciones()+`<div class="empty"><div class="ei">📗</div>
      No hay trabajadores en ${per}.<br><br>
      <button class="btn btn-p" onclick="setRemView('trabajadores')">👷 Ir a Trabajadores</button></div>`;
    return;
  }

  const m=n=>`<td style="font-family:var(--mono);text-align:right">${n?fmt(n):'–'}</td>`;
  const filas=L.lineas.map((l,i)=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${i+1}</td>
    <td class="tnm" style="font-size:12px">${l.nombre}
      <div style="font-size:10px;color:var(--mt)">${[l.rut,l.cargo].filter(Boolean).join(' · ')}</div>
      <div style="font-size:10px;color:var(--mt)">${l.afp} · ${l.salud}</div></td>
    ${m(l.base)}${m(l.gratificacion)}${m(l.otros)}
    <td style="font-family:var(--mono);text-align:right;font-weight:600">${fmt(l.totalImponible)}</td>
    ${m(l.colacion)}${m(l.movilizacion)}
    <td style="font-family:var(--mono);text-align:right;font-weight:600">${fmt(l.totalHaberes)}</td>
    ${m(l.descAFP)}${m(l.descSalud)}${m(l.descCesantia)}
    <td style="font-family:var(--mono);text-align:right" title="Tramo ${l.iuscTramo} · ${(l.iuscFactor*100).toFixed(2)}%">${l.iusc?fmt(l.iusc):'–'}</td>
    <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmt(l.totalDescuentos)}</td>
    <td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmt(l.liquido)}</td>
    ${m(l.totalPatronal)}
    <td style="font-family:var(--mono);text-align:right">${fmt(l.costoEmpresa)}</td>
  </tr>`).join('');

  const tot=`<tr style="background:rgba(88,166,255,.08)">
    <td colspan="2" class="tl" style="font-weight:700">TOTALES (${T.n})</td>
    ${['base','gratificacion','otros','totalImponible','colacion','movilizacion','totalHaberes',
       'descAFP','descSalud','descCesantia','iusc','totalDescuentos','liquido','totalPatronal','costoEmpresa']
      .map(k=>`<td style="font-family:var(--mono);text-align:right;font-weight:700${k==='liquido'?';color:var(--ach)':(k==='totalDescuentos'?';color:var(--err)':'')}">${fmt(T[k])}</td>`).join('')}
  </tr>`;

  el.innerHTML=tabsRemuneraciones()+`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:700">📗 Libro de Remuneraciones — ${per}</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">${S.empresa.nombre||''} ${S.empresa.rut?'· RUT '+S.empresa.rut:''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${L.cerrado
          ? `<span class="badge bg" title="Cerrado el ${new Date(L.cerradoEl).toLocaleString('es-CL')}">🔒 Cerrado</span>
             <button class="btn btn-g" style="font-size:11px" onclick="reabrirMesRem()">🔓 Reabrir</button>`
          : `<span class="badge bb">📝 Provisorio</span>
             <button class="btn btn-p" style="font-size:11px" onclick="cerrarMesRem()">🔒 Cerrar mes</button>`}
        <button class="btn btn-i" style="font-size:11px" onclick="exportarLibroRemExcel()">📊 Excel</button>
        <button class="btn btn-g" style="font-size:11px" onclick="window.print()">🖨️</button>
      </div>
    </div>

    <div class="info-tip" style="margin-bottom:12px;font-size:11px;line-height:1.6">
      📘 Libro auxiliar de remuneraciones (Art. 62 del Código del Trabajo — obligatorio con 5 o más trabajadores).
      ${L.cerrado
        ? `Este mes está <strong>cerrado</strong>: los montos son la fotografía guardada el ${new Date(L.cerradoEl).toLocaleDateString('es-CL')} y no cambian aunque edites un sueldo. Cálculo con UF ${fmtC(L.uf)} y UTM ${fmtC(L.utm)}.`
        : `Este mes está <strong>provisorio</strong>: se calcula en vivo con los datos vigentes de cada trabajador, así que cambiará si editas un sueldo. <strong>Ciérralo</strong> cuando pagues para dejar la fotografía del mes. Cálculo con UF ${fmtC(L.uf)} y UTM ${fmtC(L.utm)}.`}
    </div>

    <div class="card-np"><div class="tw"><table style="font-size:11px">
      <thead>
        <tr>
          <th class="tl" rowspan="2" style="width:26px">#</th>
          <th class="tl" rowspan="2" style="min-width:170px">TRABAJADOR</th>
          <th colspan="4" style="text-align:center">HABERES IMPONIBLES</th>
          <th colspan="3" style="text-align:center">NO IMPONIBLES</th>
          <th colspan="5" style="text-align:center">DESCUENTOS</th>
          <th rowspan="2" style="text-align:right">LÍQUIDO</th>
          <th colspan="2" style="text-align:center">EMPLEADOR</th>
        </tr>
        <tr>
          <th style="text-align:right">SUELDO BASE</th><th style="text-align:right">GRATIF.</th><th style="text-align:right">OTROS</th><th style="text-align:right">TOTAL IMP.</th>
          <th style="text-align:right">COLACIÓN</th><th style="text-align:right">MOVILIZ.</th><th style="text-align:right">TOTAL HAB.</th>
          <th style="text-align:right">AFP</th><th style="text-align:right">SALUD</th><th style="text-align:right">CESANTÍA</th><th style="text-align:right">IUSC</th><th style="text-align:right">TOTAL DESC.</th>
          <th style="text-align:right">APORTES</th><th style="text-align:right">COSTO</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>${tot}</tfoot>
    </table></div></div>

    <div class="kpi-grid" style="margin-top:14px">
      <div class="kpi"><div class="kpi-lbl">Total Haberes</div><div class="kpi-val">${fmtC(T.totalHaberes)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Cotizaciones</div><div class="kpi-val neg">${fmtC(T.totalPrevisional)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Impuesto Único</div><div class="kpi-val neg">${fmtC(T.iusc)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Líquido a Pagar</div><div class="kpi-val pos">${fmtC(T.liquido)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Aporte Empleador</div><div class="kpi-val">${fmtC(T.totalPatronal)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Costo Total Empresa</div><div class="kpi-val">${fmtC(T.costoEmpresa)}</div></div>
    </div>

    <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="generarAsientoRemuneraciones()">📝 Generar asiento de remuneraciones</button>
      <span style="font-size:11px;color:var(--mt)">Sueldos a gasto, cotizaciones e impuesto a pasivos, líquido por pagar.</span>
    </div>
    ${mesesCerradosResumen()}`;
}

// Resumen de los meses ya cerrados en el año
function mesesCerradosResumen(){
  const libros=Object.values(librosRem()).filter(l=>+l.anio===+S.empresa.anio).sort((a,b)=>a.mes-b.mes);
  if(!libros.length)return '';
  const filas=libros.map(l=>`<tr>
    <td class="tl" style="font-size:12px">${MESES[l.mes-1]}</td>
    <td style="text-align:right;font-family:var(--mono)">${l.totales.n}</td>
    <td style="text-align:right;font-family:var(--mono)">${fmtC(l.totales.totalHaberes)}</td>
    <td style="text-align:right;font-family:var(--mono);color:var(--err)">${fmtC(l.totales.totalDescuentos)}</td>
    <td style="text-align:right;font-family:var(--mono);color:var(--ach);font-weight:600">${fmtC(l.totales.liquido)}</td>
    <td style="text-align:right;font-family:var(--mono)">${fmtC(l.totales.costoEmpresa)}</td>
  </tr>`).join('');
  const s=k=>libros.reduce((a,l)=>a+(+l.totales[k]||0),0);
  return `<div style="margin-top:18px">
    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Meses cerrados del ejercicio ${S.empresa.anio}</div>
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">MES</th><th style="text-align:right">TRAB.</th><th style="text-align:right">HABERES</th><th style="text-align:right">DESCUENTOS</th><th style="text-align:right">LÍQUIDO</th><th style="text-align:right">COSTO EMPRESA</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td class="tl">TOTAL AÑO</td><td style="text-align:right;font-family:var(--mono)">—</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtC(s('totalHaberes'))}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtC(s('totalDescuentos'))}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtC(s('liquido'))}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtC(s('costoEmpresa'))}</td></tr></tfoot>
    </table></div></div>
  </div>`;
}

// ── Exportar a Excel ──
export function exportarLibroRemExcel(){
  try{
    if(typeof XLSX==='undefined'){toast('⚠️ Biblioteca Excel no cargada (¿sin internet?)','e');return;}
    const mes=+(document.getElementById('rem-mes')?.value||1);
    const L=libroDelMes(mes);
    if(!L.lineas.length){toast('⚠️ No hay trabajadores que exportar','e');return;}
    const T=L.totales;
    const per=`${MESES[mes-1]} ${S.empresa.anio}`;
    const hdr=['N°','TRABAJADOR','RUT','CARGO','AFP','SALUD','CONTRATO',
      'SUELDO BASE','GRATIFICACIÓN','OTROS IMPONIBLES','TOTAL IMPONIBLE',
      'COLACIÓN','MOVILIZACIÓN','TOTAL NO IMPONIBLE','TOTAL HABERES',
      'AFP (DESC.)','SALUD (DESC.)','SALUD 7% LEGAL','ADICIONAL ISAPRE','CESANTÍA','TOTAL PREVISIONAL',
      'BASE TRIBUTABLE','IMPUESTO ÚNICO','TRAMO IUSC','TOTAL DESCUENTOS','LÍQUIDO',
      'SIS','MUTUAL','AFC EMPLEADOR','CAJA COMPENSACIÓN','TOTAL APORTES','COSTO EMPRESA'];
    const rows=L.lineas.map((l,i)=>[i+1,l.nombre,l.rut,l.cargo,l.afp,l.salud,l.contrato,
      l.base,l.gratificacion,l.otros,l.totalImponible,
      l.colacion,l.movilizacion,l.totalNoImponible,l.totalHaberes,
      l.descAFP,l.descSalud,l.saludLegal,l.adicionalIsapre,l.descCesantia,l.totalPrevisional,
      l.baseTributable,l.iusc,l.iuscTramo||'',l.totalDescuentos,l.liquido,
      l.sis,l.mutual,l.afc,l.caja,l.totalPatronal,l.costoEmpresa]);
    rows.push(['','TOTALES','','','','','',
      T.base,T.gratificacion,T.otros,T.totalImponible,
      T.colacion,T.movilizacion,T.totalNoImponible,T.totalHaberes,
      T.descAFP,T.descSalud,T.saludLegal,T.adicionalIsapre,T.descCesantia,T.totalPrevisional,
      T.baseTributable,T.iusc,'',T.totalDescuentos,T.liquido,
      T.sis,T.mutual,T.afc,T.caja,T.totalPatronal,T.costoEmpresa]);
    const ws=XLSX.utils.aoa_to_sheet([hdr,...rows]);
    ws['!cols']=hdr.map((h,i)=>({wch:i===1?28:Math.max(12,String(h).length+2)}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Libro Remuneraciones');
    const meta=[
      ['LIBRO DE REMUNERACIONES'],
      ['Artículo 62 del Código del Trabajo'],
      ['Empresa',S.empresa.nombre||''],
      ['RUT',S.empresa.rut||''],
      ['Domicilio',S.empresa.domicilio||''],
      ['Período',per],
      ['Estado',L.cerrado?`Cerrado el ${new Date(L.cerradoEl).toLocaleString('es-CL')}`:'Provisorio (calculado en vivo)'],
      ['Trabajadores',T.n],
      ['UF utilizada',L.uf],
      ['UTM utilizada',L.utm],
      ['Total haberes',T.totalHaberes],
      ['Total descuentos',T.totalDescuentos],
      ['Líquido a pagar',T.liquido],
      ['Aportes del empleador',T.totalPatronal],
      ['Costo total empresa',T.costoEmpresa],
      ['Generado',new Date().toLocaleString('es-CL')],
    ];
    const wsm=XLSX.utils.aoa_to_sheet(meta);
    wsm['!cols']=[{wch:24},{wch:44}];
    XLSX.utils.book_append_sheet(wb,wsm,'Datos');
    const emp=(S.empresa.nombre||'empresa').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    XLSX.writeFile(wb,`${emp}_libro_remuneraciones_${L.periodo}.xlsx`);
    toast(`✅ Libro de ${per} exportado — ${T.n} trabajador(es)`);
  }catch(e){toast('❌ Error al exportar: '+e.message,'e');}
}
