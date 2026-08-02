// remuneraciones.js — Liquidaciones de sueldo (AFP, salud, cesantía, IUSC)
import {toast, fmtC, MESES, pdcNm} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {getIndicadores, IND} from './indicadores.js';
import './storage.js';

let REMF={editId:null}; // form trabajador (estado interno)

// ═══ FASE 5: REMUNERACIONES ═══
// Parámetros previsionales — ahora leídos desde los indicadores configurables
function remParams(){
  const i=getIndicadores();
  return {
    topeAFP_UF:i.topeAFP_UF,
    topeCesantia_UF:i.topeCesantia_UF,
    tasaAFP:i.tasaAFP/100,
    tasaSalud:i.tasaSalud/100,
    tasaCesantiaTrab:i.tasaCesantiaTrab/100,
    ingresoMinimo:i.ingresoMinimo,
  };
}
// AFP con sus comisiones (% adicional sobre imponible) — actualizables
const AFP_LISTA=[
  {k:'capital',   nm:'Capital',    comision:0.0144},
  {k:'cuprum',    nm:'Cuprum',     comision:0.0144},
  {k:'habitat',   nm:'Habitat',    comision:0.0127},
  {k:'planvital', nm:'PlanVital',  comision:0.0116},
  {k:'provida',   nm:'ProVida',    comision:0.0145},
  {k:'modelo',    nm:'Modelo',     comision:0.0058},
  {k:'uno',       nm:'AFP Uno',    comision:0.0049},
];
const afpInfo=k=>AFP_LISTA.find(a=>a.k===k)||AFP_LISTA[0];
// Tabla IUSC en UTM (Art. 43 LIR) — factores y rebajas estables; solo cambia la UTM
const IUSC_TABLA=[
  {desde:0,    hasta:13.5, factor:0,     rebajaUTM:0},
  {desde:13.5, hasta:30,   factor:0.04,  rebajaUTM:0.54},
  {desde:30,   hasta:50,   factor:0.08,  rebajaUTM:1.74},
  {desde:50,   hasta:70,   factor:0.135, rebajaUTM:4.49},
  {desde:70,   hasta:90,   factor:0.23,  rebajaUTM:11.14},
  {desde:90,   hasta:120,  factor:0.304, rebajaUTM:17.80},
  {desde:120,  hasta:310,  factor:0.35,  rebajaUTM:23.32},
  {desde:310,  hasta:1e9,  factor:0.40,  rebajaUTM:38.82},
];
function calcularIUSC(baseTributable,utm){
  if(!utm||utm<=0)return 0;
  const baseUTM=baseTributable/utm;
  const t=IUSC_TABLA.find(x=>baseUTM>x.desde&&baseUTM<=x.hasta)||IUSC_TABLA[IUSC_TABLA.length-1];
  return Math.max(0,Math.round(baseTributable*t.factor-t.rebajaUTM*utm));
}
// UF/UTM del mes: guardadas en empresa (editables). Defaults referenciales.
function getUF(){return +document.getElementById('rem-uf')?.value||IND('uf');}
function getUTM(){return +document.getElementById('rem-utm')?.value||IND('utm');}

// Calcula la liquidación completa de un trabajador con UF/UTM dados
function calcularLiquidacion(t,uf,utm){
  const REM_PARAMS=remParams(); // indicadores configurables
  const base=+t.base||0, grat=+t.grat||0, otros=+t.otros||0;
  const colacion=+t.colacion||0, movilizacion=+t.movilizacion||0;
  // Total imponible (haberes que cotizan)
  const totalImponible=base+grat+otros;
  const totalNoImponible=colacion+movilizacion;
  const totalHaberes=totalImponible+totalNoImponible;
  // Topes
  const topeAFP=Math.round(REM_PARAMS.topeAFP_UF*uf);
  const topeCes=Math.round(REM_PARAMS.topeCesantia_UF*uf);
  const baseAFP=Math.min(totalImponible,topeAFP);
  const baseCes=Math.min(totalImponible,topeCes);
  // Descuentos previsionales
  const afp=afpInfo(t.afp);
  const descAFP=Math.round(baseAFP*(REM_PARAMS.tasaAFP+afp.comision));
  const descAFP_pension=Math.round(baseAFP*REM_PARAMS.tasaAFP);
  const descAFP_comision=descAFP-descAFP_pension;
  // Salud: Fonasa 7%, Isapre = mayor entre 7% y plan en UF
  let descSalud;
  if(t.salud==='isapre'&&t.plan){
    const planPesos=Math.round((+t.plan||0)*uf);
    descSalud=Math.max(Math.round(baseAFP*REM_PARAMS.tasaSalud),planPesos);
  }else{
    descSalud=Math.round(baseAFP*REM_PARAMS.tasaSalud);
  }
  // Cesantía trabajador (solo contrato indefinido)
  const descCesantia=t.contrato==='indefinido'?Math.round(baseCes*REM_PARAMS.tasaCesantiaTrab):0;
  // Total cotizaciones previsionales
  const totalPrevisional=descAFP+descSalud+descCesantia;
  // Base tributable = imponible − cotizaciones previsionales
  const baseTributable=totalImponible-totalPrevisional;
  // Impuesto único
  const iusc=calcularIUSC(baseTributable,utm);
  // Total descuentos y líquido
  const totalDescuentos=totalPrevisional+iusc;
  const liquido=totalHaberes-totalDescuentos;
  return {totalImponible,totalNoImponible,totalHaberes,baseAFP,baseCes,
    descAFP,descAFP_pension,descAFP_comision,descSalud,descCesantia,
    totalPrevisional,baseTributable,iusc,totalDescuentos,liquido,
    afpNm:afp.nm};
}

function abrirFormTrabajador(){
  REMF={editId:null};
  const f=document.getElementById('rem-form');f.style.display='block';
  document.getElementById('remf-title').textContent='Nuevo Trabajador';
  document.getElementById('remf-afp').innerHTML=AFP_LISTA.map(a=>`<option value="${a.k}">${a.nm} (${(a.comision*100).toFixed(2)}%)</option>`).join('');
  ['nombre','rut','cargo','base','plan'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='';});
  ['grat','otros','colacion','movilizacion'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='0';});
  document.getElementById('remf-salud').value='fonasa';
  document.getElementById('remf-contrato').value='indefinido';
  document.getElementById('remf-plan-wrap').style.display='none';
  document.getElementById('remf-preview').innerHTML='';
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function cerrarFormTrabajador(){document.getElementById('rem-form').style.display='none';REMF={editId:null};}
function onSaludChange(){
  const isIsapre=document.getElementById('remf-salud').value==='isapre';
  document.getElementById('remf-plan-wrap').style.display=isIsapre?'':'none';
  previewLiq();
}
function leerFormTrabajador(){
  return {
    nombre:document.getElementById('remf-nombre').value.trim(),
    rut:document.getElementById('remf-rut').value.trim(),
    cargo:document.getElementById('remf-cargo').value.trim(),
    base:+document.getElementById('remf-base').value||0,
    grat:+document.getElementById('remf-grat').value||0,
    otros:+document.getElementById('remf-otros').value||0,
    colacion:+document.getElementById('remf-colacion').value||0,
    movilizacion:+document.getElementById('remf-movilizacion').value||0,
    afp:document.getElementById('remf-afp').value,
    salud:document.getElementById('remf-salud').value,
    plan:+document.getElementById('remf-plan').value||0,
    contrato:document.getElementById('remf-contrato').value,
  };
}
function previewLiq(){
  const t=leerFormTrabajador();
  const el=document.getElementById('remf-preview');
  if(!t.base){el.innerHTML='';return;}
  const uf=getUF(),utm=getUTM();
  const l=calcularLiquidacion(t,uf,utm);
  el.innerHTML=`<div class="info-tip" style="font-size:12px">
    <div style="display:grid;grid-template-columns:1fr auto;gap:2px 16px">
      <span>Total haberes</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</span>
      <span style="color:var(--mt)">AFP ${l.afpNm} (10% + comisión)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descAFP)}</span>
      <span style="color:var(--mt)">Salud (7%)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descSalud)}</span>
      <span style="color:var(--mt)">Cesantía (0,6%)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descCesantia)}</span>
      <span style="color:var(--mt)">Impuesto único</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.iusc)}</span>
      <span style="font-weight:700;border-top:1px solid var(--bd);padding-top:4px">LÍQUIDO A PAGAR</span><span style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach);border-top:1px solid var(--bd);padding-top:4px">${fmtC(l.liquido)}</span>
    </div>
  </div>`;
}
function guardarTrabajador(){
  const t=leerFormTrabajador();
  if(!t.nombre){toast('⚠️ Ingresa el nombre','e');return;}
  if(t.base<=0){toast('⚠️ Ingresa el sueldo base','e');return;}
  const _rp=remParams();
  if(t.base<_rp.ingresoMinimo){
    if(!confirm(`El sueldo base (${fmtC(t.base)}) es menor al ingreso mínimo (${fmtC(_rp.ingresoMinimo)}). ¿Continuar de todas formas?`))return;
  }
  const bien={id:REMF.editId||'tr_'+Date.now(),...t};
  if(REMF.editId){const i=S.trabajadores.findIndex(x=>x.id===REMF.editId);if(i>=0)S.trabajadores[i]=bien;toast('✅ Trabajador actualizado');}
  else{S.trabajadores.push(bien);toast('✅ Trabajador registrado');}
  window.storage.set('trabajadores',JSON.stringify(S.trabajadores)).catch(()=>toast('❌ Error al guardar','e'));
  cerrarFormTrabajador();renderRemuneraciones();updateHdr();
}
function editarTrabajador(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  REMF={editId:id};
  const f=document.getElementById('rem-form');f.style.display='block';
  document.getElementById('remf-title').textContent='Editando Trabajador';
  document.getElementById('remf-afp').innerHTML=AFP_LISTA.map(a=>`<option value="${a.k}" ${a.k===t.afp?'selected':''}>${a.nm} (${(a.comision*100).toFixed(2)}%)</option>`).join('');
  document.getElementById('remf-nombre').value=t.nombre;
  document.getElementById('remf-rut').value=t.rut||'';
  document.getElementById('remf-cargo').value=t.cargo||'';
  document.getElementById('remf-base').value=t.base;
  document.getElementById('remf-grat').value=t.grat||0;
  document.getElementById('remf-otros').value=t.otros||0;
  document.getElementById('remf-colacion').value=t.colacion||0;
  document.getElementById('remf-movilizacion').value=t.movilizacion||0;
  document.getElementById('remf-salud').value=t.salud||'fonasa';
  document.getElementById('remf-plan').value=t.plan||0;
  document.getElementById('remf-contrato').value=t.contrato||'indefinido';
  onSaludChange();previewLiq();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function eliminarTrabajador(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  if(!confirm(`¿Eliminar al trabajador "${t.nombre}"?`))return;
  S.trabajadores=S.trabajadores.filter(x=>x.id!==id);
  window.storage.set('trabajadores',JSON.stringify(S.trabajadores)).catch(()=>{});
  renderRemuneraciones();updateHdr();toast('🗑 Trabajador eliminado');
}
function onParamRem(){
  // Guardar UF/UTM en empresa y re-render
  S.empresa.remUF=getUF();S.empresa.remUTM=getUTM();
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>{});
  renderRemuneraciones();
  if(document.getElementById('rem-form').style.display!=='none')previewLiq();
}
function renderRemuneraciones(){
  // Poblar selector de mes y UF/UTM
  const selMes=document.getElementById('rem-mes');
  if(selMes&&selMes.options.length===0){
    selMes.innerHTML=MESES.map((nm,i)=>`<option value="${i+1}">${nm} ${S.empresa.anio}</option>`).join('');
    const hoyMes=new Date().getMonth()+1;selMes.value=(S.empresa.anio===new Date().getFullYear())?hoyMes:1;
  }
  const ufEl=document.getElementById('rem-uf'),utmEl=document.getElementById('rem-utm');
  if(ufEl&&!ufEl.value)ufEl.value=IND('uf');
  if(utmEl&&!utmEl.value)utmEl.value=IND('utm');
  const uf=getUF(),utm=getUTM();
  const el=document.getElementById('rem-content');
  if(!S.trabajadores.length){
    el.innerHTML=`<div class="empty"><div class="ei">👷</div>No hay trabajadores registrados.<br><br><button class="btn btn-p" onclick="abrirFormTrabajador()">+ Registrar primer trabajador</button></div>`;
    return;
  }
  let totHab=0,totLiq=0,totPrev=0,totIusc=0;
  const filas=S.trabajadores.map(t=>{
    const l=calcularLiquidacion(t,uf,utm);
    totHab+=l.totalHaberes;totLiq+=l.liquido;totPrev+=l.totalPrevisional;totIusc+=l.iusc;
    return `<tr>
      <td class="tl" style="font-size:12px">${t.nombre}<div style="font-size:10px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''}</div></td>
      <td style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descAFP)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descSalud)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descCesantia)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.iusc)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(l.liquido)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-i" onclick="verLiquidacion('${t.id}')" title="Ver liquidación">📄</button>
        <button class="btn btn-i" onclick="editarTrabajador('${t.id}')">✏️</button>
        <button class="btn btn-d" onclick="eliminarTrabajador('${t.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Total Haberes</div><div class="kpi-val">${fmtC(totHab)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Cotizaciones</div><div class="kpi-val neg">${fmtC(totPrev)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Impuesto Único</div><div class="kpi-val neg">${fmtC(totIusc)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Líquido a Pagar</div><div class="kpi-val pos">${fmtC(totLiq)}</div></div>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">TRABAJADOR</th><th style="text-align:right">HABERES</th><th style="text-align:right">AFP</th><th style="text-align:right">SALUD</th><th style="text-align:right">CESANTÍA</th><th style="text-align:right">IUSC</th><th style="text-align:right">LÍQUIDO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTALES (${S.trabajadores.length})</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totHab)}</td><td colspan="4"></td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(totLiq)}</td><td></td></tr></tfoot>
  </table></div></div>
  <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-p" onclick="generarAsientoRemuneraciones()">📝 Generar asiento de remuneraciones</button>
    <span style="font-size:11px;color:var(--mt)">Crea el asiento mensual: sueldos a gasto, cotizaciones e impuesto a pasivos, líquido por pagar.</span>
  </div>
  <div style="margin-top:8px;font-size:10px;color:var(--mt)">Cálculo con UF ${fmtC(uf)} y UTM ${fmtC(utm)}. Topes: AFP/salud 90 UF, cesantía 135,2 UF. Referencial — verifica en Previred antes de declarar.</div>`;
}
function verLiquidacion(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  const uf=getUF(),utm=getUTM();
  const l=calcularLiquidacion(t,uf,utm);
  const mes=MESES[(+document.getElementById('rem-mes').value||1)-1];
  const row=(lbl,val,neg,bold)=>`<tr><td class="tl" style="padding:5px 10px;font-size:12px;${bold?'font-weight:700':''}">${lbl}</td><td style="font-family:var(--mono);text-align:right;${bold?'font-weight:700;':''}color:${neg?'var(--err)':(bold?'var(--ach)':'var(--tx)')}">${neg?'−':''}${fmtC(val)}</td></tr>`;
  const html=`<div class="card" style="max-width:480px;margin:0 auto">
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Liquidación de Sueldo</div>
      <div style="font-size:12px;color:var(--mt)">${mes} ${S.empresa.anio} · ${S.empresa.nombre||''}</div>
    </div>
    <div style="margin-bottom:10px"><strong>${t.nombre}</strong><div style="font-size:11px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''} · ${l.afpNm} · ${t.salud==='isapre'?'Isapre':'Fonasa'}</div></div>
    <table><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">HABERES</td></tr>
      ${row('Sueldo base',+t.base)}
      ${+t.grat?row('Gratificación legal',+t.grat):''}
      ${+t.otros?row('Otros imponibles',+t.otros):''}
      ${+t.colacion?row('Colación (no imp.)',+t.colacion):''}
      ${+t.movilizacion?row('Movilización (no imp.)',+t.movilizacion):''}
      ${row('Total haberes',l.totalHaberes,false,true)}
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">DESCUENTOS</td></tr>
      ${row('AFP '+l.afpNm+' (pensión 10%)',l.descAFP_pension,true)}
      ${row('AFP comisión',l.descAFP_comision,true)}
      ${row('Salud 7%',l.descSalud,true)}
      ${l.descCesantia?row('Seguro cesantía 0,6%',l.descCesantia,true):''}
      ${l.iusc?row('Impuesto único 2ª cat.',l.iusc,true):''}
      ${row('Total descuentos',l.totalDescuentos,true,true)}
      <tr style="background:rgba(46,160,67,.14)"><td class="tl" style="padding:11px 10px;font-weight:700;font-size:14px">LÍQUIDO A PAGAR</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:var(--ach)">${fmtC(l.liquido)}</td></tr>
    </tbody></table>
    <div style="font-size:10px;color:var(--mt);margin-top:8px">Base tributable: ${fmtC(l.baseTributable)} · UF ${fmtC(uf)} · UTM ${fmtC(utm)}</div>
    <div style="margin-top:12px;text-align:right"><button class="btn btn-g" onclick="renderRemuneraciones()">← Volver</button> <button class="btn btn-g" onclick="window.print()">🖨️ Imprimir</button></div>
  </div>`;
  document.getElementById('rem-content').innerHTML=html;
}
function generarAsientoRemuneraciones(){
  const anio=S.empresa.anio;
  const mesNum=+document.getElementById('rem-mes').value||1;
  const uf=getUF(),utm=getUTM();
  if(!S.trabajadores.length){toast('⚠️ No hay trabajadores','e');return;}
  // Acumular
  let totSueldo=0,totColMov=0,totAFP=0,totSalud=0,totCes=0,totIusc=0,totLiq=0;
  S.trabajadores.forEach(t=>{
    const l=calcularLiquidacion(t,uf,utm);
    totSueldo+=l.totalImponible;totColMov+=l.totalNoImponible;
    totAFP+=l.descAFP;totSalud+=l.descSalud;totCes+=l.descCesantia;totIusc+=l.iusc;totLiq+=l.liquido;
  });
  if(totSueldo<=0){toast('⚠️ No hay montos','e');return;}
  const fecha=`${anio}-${String(mesNum).padStart(2,'0')}-30`;
  if(!confirm(`¿Generar asiento de remuneraciones de ${MESES[mesNum-1]} ${anio}?\n\n${S.trabajadores.length} trabajadores · Líquido a pagar: ${fmtC(totLiq)}`))return;
  const movs=[];
  // DEBE: gasto en sueldos (imponible + no imponible)
  movs.push({cd:'3201001',nm:pdcNm('3201001'),debe:totSueldo,haber:0,desc:'Sueldos '+MESES[mesNum-1]});
  if(totColMov)movs.push({cd:'3201003',nm:pdcNm('3201003'),debe:totColMov,haber:0,desc:'Colación y movilización'});
  // HABER: retenciones previsionales e impuesto (por pagar), líquido por pagar
  const totPrev=totAFP+totSalud+totCes;
  if(totPrev)movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPrev,desc:'Instituciones previsionales por pagar'});
  if(totIusc)movs.push({cd:'2104002',nm:pdcNm('2104002'),debe:0,haber:totIusc,desc:'Impuesto único por pagar'});
  movs.push({cd:'2104005',nm:pdcNm('2104005'),debe:0,haber:totLiq,desc:'Líquidos por pagar'});
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha,glosa:`Remuneraciones ${MESES[mesNum-1]} ${anio}`,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' de remuneraciones ('+fmtC(totLiq)+' líquido)');
  renderRemuneraciones();updateHdr();
}


export {remParams, AFP_LISTA, afpInfo, IUSC_TABLA, calcularIUSC, getUF, getUTM, calcularLiquidacion, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, leerFormTrabajador, previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador, onParamRem, renderRemuneraciones, verLiquidacion, generarAsientoRemuneraciones};
