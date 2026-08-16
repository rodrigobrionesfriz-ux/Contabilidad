// remuneraciones.js — Liquidaciones de sueldo (AFP, salud, cesantía, IUSC)
import {toast, fmtC, MESES, pdcNm} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {getIndicadores, IND, calcularGratificacion, topeGratificacionMensual,
        getIUSCTabla, calcularIUSCDetalle, IUSC_TABLA_OFICIAL} from './indicadores.js';
import {getPrevisional, afpInfo, isapreInfo, calcularAportePatronal} from './previsional.js';
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
// Las AFP y sus comisiones viven en previsional.js (editables por el usuario).
// La tabla del Impuesto Único de Segunda Categoría (Art. 43 N°1 LIR) vive en
// indicadores.js, donde es editable. Se expone acá por compatibilidad.
const IUSC_TABLA=IUSC_TABLA_OFICIAL;
function calcularIUSC(baseTributable,utm){
  return calcularIUSCDetalle(baseTributable,utm,getIUSCTabla()).impuesto;
}
// UF/UTM del mes: guardadas en empresa (editables). Defaults referenciales.
function getUF(){return +document.getElementById('rem-uf')?.value||IND('uf');}
function getUTM(){return +document.getElementById('rem-utm')?.value||IND('utm');}

// Calcula la liquidación completa de un trabajador con UF/UTM dados
// Modo de gratificación de un trabajador. Los registros antiguos (sin
// `gratifModo` ni `gratifPct`) siguen con su monto fijo: así una ficha ya
// cargada no cambia de líquido sólo por actualizar el sistema.
function gratificacionModo(t){
  if(t.gratifModo==='pct'||t.gratifModo==='monto')return t.gratifModo;
  return (t.gratifPct!=null&&t.gratifPct!=='')?'pct':'monto';
}

function calcularLiquidacion(t,uf,utm){
  const REM_PARAMS=remParams(); // indicadores configurables
  const base=+t.base||0, otros=+t.otros||0;
  const colacion=+t.colacion||0, movilizacion=+t.movilizacion||0;
  // ── Gratificación legal (Art. 50 Código del Trabajo) ──
  // Modo 'pct': % sobre la remuneración imponible del mes (sueldo base + otros
  // haberes imponibles, sin incluirse a sí misma), con el tope legal prorrateado.
  // Modo 'monto': cifra pactada, sin tope (es una gratificación convencional).
  // Los trabajadores creados antes de este cambio no traen `gratifModo`: se
  // mantienen en 'monto' para no alterar sus liquidaciones.
  const gratModo=gratificacionModo(t);
  let grat=0, gratInfo=null;
  if(gratModo==='pct'){
    gratInfo=calcularGratificacion(base+otros,t.gratifPct);
    grat=gratInfo.monto;
  }else{
    grat=+t.grat||0;
  }
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
  const descAFP=Math.round(baseAFP*(REM_PARAMS.tasaAFP+(afp.comision/100)));
  const descAFP_pension=Math.round(baseAFP*REM_PARAMS.tasaAFP);
  const descAFP_comision=descAFP-descAFP_pension;
  // Salud: se separan los dos componentes como en una liquidación real.
  //  - saludLegal: el 7% obligatorio sobre la renta imponible (topeada)
  //  - adicionalIsapre: el excedente cuando el plan pactado (UF del FUN) supera ese 7%
  // Fonasa siempre cotiza exactamente el 7%, sin adicional.
  const saludLegal=Math.round(baseAFP*REM_PARAMS.tasaSalud);
  let adicionalIsapre=0;
  if(t.salud&&t.salud!=='fonasa'&&t.plan){
    const planPesos=Math.round((+t.plan||0)*uf);
    // Si el plan vale menos que el 7%, igual se entera el 7% (no hay adicional).
    adicionalIsapre=Math.max(0,planPesos-saludLegal);
  }
  const descSalud=saludLegal+adicionalIsapre; // total enterado a la institución
  const planUF=+t.plan||0;
  const planPesos=planUF?Math.round(planUF*uf):0;
  // Cesantía trabajador (solo contrato indefinido)
  const descCesantia=t.contrato==='indefinido'?Math.round(baseCes*REM_PARAMS.tasaCesantiaTrab):0;
  // Total cotizaciones previsionales
  const totalPrevisional=descAFP+descSalud+descCesantia;
  // Base tributable = imponible − cotizaciones previsionales
  const baseTributable=totalImponible-totalPrevisional;
  // Impuesto único de Segunda Categoría, según la tabla configurada en Indicadores
  const iuscDet=calcularIUSCDetalle(baseTributable,utm,getIUSCTabla());
  const iusc=iuscDet.impuesto;
  // Total descuentos y líquido
  const totalDescuentos=totalPrevisional+iusc;
  const liquido=totalHaberes-totalDescuentos;
  // Aporte patronal (costo empresa, no se descuenta al trabajador)
  const patronal=calcularAportePatronal(t,baseAFP,baseCes);
  const costoEmpresa=totalHaberes+patronal.total;
  return {patronal,costoEmpresa,
    grat,gratModo,gratInfo,
    totalImponible,totalNoImponible,totalHaberes,baseAFP,baseCes,
    descAFP,descAFP_pension,descAFP_comision,descSalud,saludLegal,adicionalIsapre,planUF,planPesos,descCesantia,
    totalPrevisional,baseTributable,iusc,iuscDet,totalDescuentos,liquido,
    afpNm:afp.nm, saludNm:(t.salud&&t.salud!=='fonasa')?isapreInfo(t.salud).nm:'Fonasa'};
}

function abrirFormTrabajador(){
  REMF={editId:null};
  const f=document.getElementById('rem-form');f.style.display='block';
  document.getElementById('remf-title').textContent='Nuevo Trabajador';
  const P=getPrevisional();
  document.getElementById('remf-afp').innerHTML=P.afps.map(a=>`<option value="${a.k}">${a.nm} (${(+a.comision).toFixed(2)}%)</option>`).join('');
  document.getElementById('remf-salud').innerHTML=P.isapres.map(i=>`<option value="${i.k}">${i.nm}</option>`).join('');
  ['nombre','rut','cargo','base','plan'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='';});
  ['grat','otros','colacion','movilizacion'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='0';});
  document.getElementById('remf-salud').value='fonasa';
  document.getElementById('remf-contrato').value='indefinido';
  // Los trabajadores nuevos parten con la gratificación legal en porcentaje
  document.getElementById('remf-gratmodo').value='pct';
  document.getElementById('remf-gratpct').value=getIndicadores().gratifPct??25;
  onGratModoChange();
  document.getElementById('remf-plan-wrap').style.display='none';
  document.getElementById('remf-preview').innerHTML='';
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function cerrarFormTrabajador(){document.getElementById('rem-form').style.display='none';REMF={editId:null};}
// Alterna entre gratificación por porcentaje y monto fijo, y muestra el tope legal vigente
function onGratModoChange(){
  const modo=document.getElementById('remf-gratmodo')?.value||'pct';
  const wp=document.getElementById('remf-gratpct-wrap'),wm=document.getElementById('remf-gratmonto-wrap');
  if(wp)wp.style.display=modo==='pct'?'':'none';
  if(wm)wm.style.display=modo==='monto'?'':'none';
  const hint=document.getElementById('remf-grat-hint');
  if(hint){
    const i=getIndicadores();
    hint.innerHTML=modo==='pct'
      ? `Tope legal: ${fmtC(topeGratificacionMensual())} al mes (${(+i.gratifTopeIMM||0).toLocaleString('es-CL')} IMM ÷ 12)`
      : 'Gratificación pactada — no se le aplica el tope legal';
  }
  previewLiq();
}
function onSaludChange(){
  const isIsapre=document.getElementById('remf-salud').value!=='fonasa';
  document.getElementById('remf-plan-wrap').style.display=isIsapre?'':'none';
  previewLiq();
}
function leerFormTrabajador(){
  return {
    nombre:document.getElementById('remf-nombre').value.trim(),
    rut:document.getElementById('remf-rut').value.trim(),
    cargo:document.getElementById('remf-cargo').value.trim(),
    base:+document.getElementById('remf-base').value||0,
    gratifModo:document.getElementById('remf-gratmodo')?.value||'pct',
    gratifPct:+document.getElementById('remf-gratpct')?.value||0,
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
      ${l.gratModo==='pct'&&l.gratInfo?`<span style="color:var(--mt)">Gratificación ${l.gratInfo.pct}% ${l.gratInfo.topeAplicado?`<span style="color:var(--warn)">(topeada desde ${fmtC(l.gratInfo.bruta)})</span>`:''}</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.grat)}</span>`:''}
      <span>Total haberes</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</span>
      <span style="color:var(--mt)">AFP ${l.afpNm} (10% + comisión)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descAFP)}</span>
      <span style="color:var(--mt)">Salud 7% legal</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.saludLegal)}</span>
      ${l.adicionalIsapre?`<span style="color:var(--mt)">Adicional isapre (${l.planUF} UF)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.adicionalIsapre)}</span>`:''}
      <span style="color:var(--mt)">Cesantía (0,6%)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descCesantia)}</span>
      <span style="color:var(--mt)">Impuesto único${l.iuscDet&&l.iuscDet.idx>=0?` <span style="font-size:10px">(tramo ${l.iuscDet.idx+1} · ${(l.iuscDet.factor*100).toFixed(2)}% · ${l.iuscDet.baseUTM.toFixed(1)} UTM)</span>`:''}</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.iusc)}</span>
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
  const P=getPrevisional();
  document.getElementById('remf-afp').innerHTML=P.afps.map(a=>`<option value="${a.k}" ${a.k===t.afp?'selected':''}>${a.nm} (${(+a.comision).toFixed(2)}%)</option>`).join('');
  document.getElementById('remf-salud').innerHTML=P.isapres.map(i=>`<option value="${i.k}" ${i.k===(t.salud||'fonasa')?'selected':''}>${i.nm}</option>`).join('');
  document.getElementById('remf-nombre').value=t.nombre;
  document.getElementById('remf-rut').value=t.rut||'';
  document.getElementById('remf-cargo').value=t.cargo||'';
  document.getElementById('remf-base').value=t.base;
  document.getElementById('remf-gratmodo').value=gratificacionModo(t);
  document.getElementById('remf-gratpct').value=(t.gratifPct!=null&&t.gratifPct!=='')?t.gratifPct:(getIndicadores().gratifPct??25);
  document.getElementById('remf-grat').value=t.grat||0;
  onGratModoChange();
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
  // El Libro de Remuneraciones es la otra vista de esta sección (libroremuneraciones.js).
  // Se llama por window para no crear un ciclo de imports entre ambos módulos.
  if(window.getRemView&&window.getRemView()==='libro'&&window.renderLibroRem){window.renderLibroRem();return;}
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  const uf=getUF(),utm=getUTM();
  const el=document.getElementById('rem-content');
  if(!S.trabajadores.length){
    el.innerHTML=tabs+`<div class="empty"><div class="ei">👷</div>No hay trabajadores registrados.<br><br><button class="btn btn-p" onclick="abrirFormTrabajador()">+ Registrar primer trabajador</button></div>`;
    return;
  }
  let totHab=0,totLiq=0,totPrev=0,totIusc=0,totPatronal=0;
  const filas=S.trabajadores.map(t=>{
    const l=calcularLiquidacion(t,uf,utm);
    totHab+=l.totalHaberes;totLiq+=l.liquido;totPrev+=l.totalPrevisional;totIusc+=l.iusc;totPatronal+=l.patronal.total;
    return `<tr>
      <td class="tl" style="font-size:12px">${t.nombre}<div style="font-size:10px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''}</div></td>
      <td style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descAFP)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)" title="7% legal: ${fmtC(l.saludLegal)}${l.adicionalIsapre?' · Adicional: '+fmtC(l.adicionalIsapre):''}">${fmtC(l.descSalud)}${l.adicionalIsapre?'<div style="font-size:9px;color:var(--mt)">7%: '+fmtC(l.saludLegal)+' + adic. '+fmtC(l.adicionalIsapre)+'</div>':''}</td>
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
  el.innerHTML=tabs+`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Total Haberes</div><div class="kpi-val">${fmtC(totHab)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Cotizaciones</div><div class="kpi-val neg">${fmtC(totPrev)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Impuesto Único</div><div class="kpi-val neg">${fmtC(totIusc)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Líquido a Pagar</div><div class="kpi-val pos">${fmtC(totLiq)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Aporte Empleador</div><div class="kpi-val">${fmtC(totPatronal)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Costo Total Empresa</div><div class="kpi-val">${fmtC(totHab+totPatronal)}</div></div>
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
    <div style="margin-bottom:10px"><strong>${t.nombre}</strong><div style="font-size:11px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''} · ${l.afpNm} · ${l.saludNm}</div></div>
    <table><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">HABERES</td></tr>
      ${row('Sueldo base',+t.base)}
      ${l.grat?row(l.gratModo==='pct'
          ?`Gratificación legal (${l.gratInfo.pct}%${l.gratInfo.topeAplicado?' · tope legal aplicado':''})`
          :'Gratificación pactada',l.grat):''}
      ${+t.otros?row('Otros imponibles',+t.otros):''}
      ${+t.colacion?row('Colación (no imp.)',+t.colacion):''}
      ${+t.movilizacion?row('Movilización (no imp.)',+t.movilizacion):''}
      ${row('Total haberes',l.totalHaberes,false,true)}
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">DESCUENTOS</td></tr>
      ${row('AFP '+l.afpNm+' (pensión 10%)',l.descAFP_pension,true)}
      ${row('AFP comisión',l.descAFP_comision,true)}
      ${row('Salud 7% (cotización legal)',l.saludLegal,true)}
      ${l.adicionalIsapre?row(`Adicional ${l.saludNm} (plan ${l.planUF} UF)`,l.adicionalIsapre,true):''}
      ${l.descCesantia?row('Seguro cesantía 0,6%',l.descCesantia,true):''}
      ${l.iusc?row(`Impuesto único 2ª cat. (tramo ${l.iuscDet.idx+1} · ${(l.iuscDet.factor*100).toFixed(2)}%)`,l.iusc,true):''}
      ${row('Total descuentos',l.totalDescuentos,true,true)}
      <tr style="background:rgba(46,160,67,.14)"><td class="tl" style="padding:11px 10px;font-weight:700;font-size:14px">LÍQUIDO A PAGAR</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:var(--ach)">${fmtC(l.liquido)}</td></tr>
    </tbody></table>
    <table style="margin-top:14px"><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">APORTE DEL EMPLEADOR (no se descuenta al trabajador)</td></tr>
      ${l.patronal.detalle.map(d=>`<tr><td class="tl" style="padding:5px 10px;font-size:11px">${d.concepto} <span style="color:var(--mt)">${(+d.tasa).toFixed(2)}% → ${d.institucion}</span></td><td style="font-family:var(--mono);text-align:right;font-size:11px">${fmtC(d.monto)}</td></tr>`).join('')}
      <tr><td class="tl" style="padding:6px 10px;font-weight:700;font-size:12px">Total aporte empleador</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:12px">${fmtC(l.patronal.total)}</td></tr>
      <tr style="background:rgba(88,166,255,.10)"><td class="tl" style="padding:9px 10px;font-weight:700;font-size:13px">COSTO TOTAL EMPRESA</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:13px">${fmtC(l.costoEmpresa)}</td></tr>
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
  let totSueldo=0,totColMov=0,totAFP=0,totSalud=0,totCes=0,totIusc=0,totLiq=0,totPatronal=0;
  S.trabajadores.forEach(t=>{
    const l=calcularLiquidacion(t,uf,utm);
    totSueldo+=l.totalImponible;totColMov+=l.totalNoImponible;
    totAFP+=l.descAFP;totSalud+=l.descSalud;totCes+=l.descCesantia;totIusc+=l.iusc;totLiq+=l.liquido;
    totPatronal+=l.patronal.total;
  });
  if(totSueldo<=0){toast('⚠️ No hay montos','e');return;}
  const fecha=`${anio}-${String(mesNum).padStart(2,'0')}-30`;
  if(!confirm(`¿Generar asiento de remuneraciones de ${MESES[mesNum-1]} ${anio}?\n\n${S.trabajadores.length} trabajadores\nLíquido a pagar: ${fmtC(totLiq)}\nAporte patronal: ${fmtC(totPatronal)}`))return;
  const movs=[];
  // DEBE: gasto en sueldos (imponible + no imponible)
  movs.push({cd:'3201001',nm:pdcNm('3201001'),debe:totSueldo,haber:0,desc:'Sueldos '+MESES[mesNum-1]});
  if(totColMov)movs.push({cd:'3201003',nm:pdcNm('3201003'),debe:totColMov,haber:0,desc:'Colación y movilización'});
  // HABER: retenciones previsionales e impuesto (por pagar), líquido por pagar
  const totPrev=totAFP+totSalud+totCes;
  if(totPrev)movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPrev,desc:'Instituciones previsionales por pagar'});
  if(totIusc)movs.push({cd:'2104002',nm:pdcNm('2104002'),debe:0,haber:totIusc,desc:'Impuesto único por pagar'});
  movs.push({cd:'2104005',nm:pdcNm('2104005'),debe:0,haber:totLiq,desc:'Líquidos por pagar'});
  // Aporte patronal: es GASTO de la empresa (no se descuenta al trabajador),
  // con contrapartida en instituciones previsionales por pagar.
  if(totPatronal>0){
    movs.push({cd:'3201013',nm:pdcNm('3201013'),debe:totPatronal,haber:0,desc:'Aporte patronal (SIS, mutual, AFC)'});
    movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPatronal,desc:'Aporte patronal por pagar'});
  }
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha,glosa:`Remuneraciones ${MESES[mesNum-1]} ${anio}`,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' de remuneraciones ('+fmtC(totLiq)+' líquido)');
  renderRemuneraciones();updateHdr();
}


export {remParams, IUSC_TABLA, calcularIUSC, getUF, getUTM, calcularLiquidacion, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, onGratModoChange, gratificacionModo, leerFormTrabajador, previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador, onParamRem, renderRemuneraciones, verLiquidacion, generarAsientoRemuneraciones, REMF};
