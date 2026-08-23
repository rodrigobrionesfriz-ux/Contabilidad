// renta.js — Declaración Anual de Renta (Formulario 22)
//
// Determina la Renta Líquida Imponible (RLI) de Primera Categoría a partir de
// los datos contables del ejercicio y calcula el impuesto anual del F22.
//
// Normativa considerada (vigente a la fecha de este módulo):
//  · Art. 14 letra D) N°3 LIR — Régimen Pro Pyme General (contabilidad completa,
//    RLI simplificada, depreciación instantánea, liberado de corrección monetaria).
//  · Art. 14 letra D) N°8 LIR — Pro Pyme Transparente (la empresa no paga IDPC;
//    la base se atribuye a los dueños en su Global Complementario).
//  · Art. 14 letra A) LIR — Régimen General Semi Integrado (tasa 27%).
//  · Ley 21.681 / Circular SII N°53 de 03.09.2025 — rebaja transitoria de la tasa
//    de IDPC de las Pymes a 12,5% por los años comerciales 2025, 2026 y 2027
//    (15% el 2028), condicionada al cumplimiento del pago de cotizaciones.
//  · Art. 31 N°3 LIR — imputación de pérdidas tributarias de arrastre.
//  · Art. 33 bis LIR — crédito por inversión en activo fijo.
//  · Art. 21 LIR — gastos rechazados.
//  · Art. 84 LIR — PPM imputables al impuesto anual.
//
// Los códigos SII que se muestran junto a cada línea corresponden al F22 del
// Año Tributario 2026 (Recuadro N°17 para Pro Pyme 14 D N°3, Recuadro N°12 para
// contabilidad completa del régimen general). Se muestran como referencia para
// el traspaso manual al formulario en sii.cl.
import {toast, fmtC, pdcNm} from './core.js';
import {S} from './state.js';
import {buildMayor} from './reportes.js';
import {calcularF29Anual} from './tributario.js';
import {logAccion} from './firebase.js';
import './storage.js';

// ═══════════════════════════════════════════════════════════════════════
// PARÁMETROS DE RÉGIMEN
// ═══════════════════════════════════════════════════════════════════════

const REGIMENES=[
  {k:'14D3', lbl:'14 D N°3 — Pro Pyme General',      tasa:25, recuadro:17, linea:53, codLinea:63,  pyme:true,  cm:false, deprInstantanea:true},
  {k:'14D8', lbl:'14 D N°8 — Pro Pyme Transparente', tasa:0,  recuadro:22, linea:0,  codLinea:0,   pyme:true,  cm:false, deprInstantanea:true},
  {k:'14A',  lbl:'14 A — Semi Integrado (general)',  tasa:27, recuadro:12, linea:52, codLinea:58,  pyme:false, cm:true,  deprInstantanea:false},
];
const regInfo=k=>REGIMENES.find(r=>r.k===k)||REGIMENES[0];

// Tasa de IDPC vigente para un régimen y año comercial.
// Para Pymes rige la rebaja transitoria de la Circular N°53/2025.
function tasaLegal(regimen,anio){
  const r=regInfo(regimen);
  if(!r.pyme)return r.tasa;
  if(r.k==='14D8')return 0;
  if(anio>=2025&&anio<=2027)return 12.5;
  if(anio===2028)return 15;
  return 25;
}

// Etiqueta explicativa de la tasa aplicada
function notaTasa(regimen,anio){
  const r=regInfo(regimen);
  if(r.k==='14D8')return 'La empresa no paga IDPC: la base imponible se atribuye a los dueños.';
  if(!r.pyme)return 'Tasa general del régimen semi integrado (Art. 14 A LIR).';
  if(anio>=2025&&anio<=2027)return 'Rebaja transitoria Pyme (Circular SII N°53/2025): 12,5% para los años comerciales 2025 a 2027, condicionada al cumplimiento del pago de cotizaciones previsionales.';
  if(anio===2028)return 'Rebaja transitoria Pyme: 15% para el año comercial 2028.';
  return 'Tasa permanente del régimen Pro Pyme General.';
}

// ═══════════════════════════════════════════════════════════════════════
// ESTADO DEL MÓDULO
// ═══════════════════════════════════════════════════════════════════════

// Todo lo que el usuario decide (y que no se puede deducir de la contabilidad)
// vive aquí y se persiste en la clave renta-<año>.
const RENTA_DEFAULT=()=>({
  regimen:(S.empresa&&S.empresa.regimen)||'14D3',
  tasa:null,               // null = usar la tasa legal del año
  perdidaArrastre:0,       // pérdida tributaria de ejercicios anteriores (Art. 31 N°3)
  rechazadas:[],           // códigos de cuenta marcados como gasto rechazado (Art. 21)
  agregados:[],            // {lbl, monto} agregados manuales
  deducciones:[],          // {lbl, monto} deducciones manuales
  creditos:{af33bis:0, sence:0, donaciones:0, otros:0},
  ppmManual:null,          // si se informa, reemplaza el PPM calculado del F29
  reajustePPM:0,           // % de reajuste de los PPM al 31/dic (Art. 95)
  notas:''
});
let RENTA=RENTA_DEFAULT();
let RENTA_ANIO=null;       // año cuyos datos están cargados en RENTA
function resetRenta(){RENTA=RENTA_DEFAULT();RENTA_ANIO=null;}
let RENTA_TAB='rli';       // 'rli' | 'impuesto' | 'ajustes'

const claveRenta=anio=>'renta-'+anio;

async function cargarRenta(anio){
  RENTA=RENTA_DEFAULT();
  try{
    const r=await window.storage.get(claveRenta(anio));
    if(r&&r.value){
      const p=JSON.parse(r.value);
      if(p&&typeof p==='object')RENTA={...RENTA_DEFAULT(),...p,creditos:{...RENTA_DEFAULT().creditos,...(p.creditos||{})}};
    }
  }catch(e){}
  RENTA_ANIO=anio;
  return RENTA;
}
function guardarRenta(){
  const anio=S.empresa.anio;
  window.storage.set(claveRenta(anio),JSON.stringify(RENTA)).catch(()=>toast('❌ No se pudo guardar la declaración','e'));
}

// ═══════════════════════════════════════════════════════════════════════
// LECTURA DE LA CONTABILIDAD
// ═══════════════════════════════════════════════════════════════════════

// Los grupos 2 (pasivo/patrimonio) y 4 (ingresos) tienen naturaleza acreedora:
// su saldo contable es negativo y hay que invertirlo para presentarlo.
const naturalezaAcreedora=cd=>String(cd).startsWith('2')||String(cd).startsWith('4');
const saldoPres=(cd,saldo)=>naturalezaAcreedora(cd)?-saldo:saldo;

// Cuentas imputables (7 dígitos) con saldo, filtradas por prefijo
function cuentasCon(M,pref){
  return Object.keys(M).filter(k=>k.length===7&&k.startsWith(pref)&&Math.abs(M[k].saldo)>=0.5).sort();
}
const sumaPref=(M,pref)=>cuentasCon(M,pref).reduce((s,k)=>s+saldoPres(k,M[k].saldo),0);

// Palabras que delatan un gasto no aceptado tributariamente. Sólo se usan para
// SUGERIR: la decisión final es del usuario (checkbox en la pestaña Ajustes).
const PISTAS_RECHAZO=[
  {re:/MULTA|SANCI[ÓO]N|INFRACCI[ÓO]N/i,       motivo:'Multas y sanciones (Art. 31 inc. 2°)'},
  {re:/INTERES(ES)? (FISCAL|PENAL|MORATORIO)/i, motivo:'Intereses penales fiscales (Art. 31 inc. 2°)'},
  {re:/DONACI[ÓO]N/i,                            motivo:'Donaciones — deducibles sólo dentro del límite legal'},
  {re:/GASTO(S)? RECHAZADO|NO DEDUCIBLE/i,      motivo:'Gasto rechazado (Art. 21)'},
  {re:/RETIRO|PARTICULAR(ES)?/i,                 motivo:'Retiros y gastos particulares del dueño (Art. 21)'},
  {re:/PROVISI[ÓO]N|ESTIMACI[ÓO]N/i,            motivo:'Provisión / estimación — deducible sólo al materializarse'},
];
function motivoRechazo(cd,nm){
  const txt=String(nm||pdcNm(cd)||'');
  const h=PISTAS_RECHAZO.find(p=>p.re.test(txt));
  return h?h.motivo:'';
}

// Todas las cuentas de gasto y costo con saldo, con su sugerencia de rechazo
function cuentasGasto(M){
  return cuentasCon(M,'3').map(cd=>({
    cd, nm:M[cd].nm||pdcNm(cd),
    monto:saldoPres(cd,M[cd].saldo),
    sugerido:motivoRechazo(cd,M[cd].nm),
    marcada:RENTA.rechazadas.includes(cd)
  }));
}

// Depreciación tributaria del ejercicio.
// Pro Pyme (14 D): depreciación instantánea — el activo fijo adquirido en el año
// se deduce íntegro. Régimen general: cuota según vida útil (ya contabilizada).
function depreciacionTributaria(anio,regimen){
  const r=regInfo(regimen);
  if(!r.deprInstantanea)return {total:0, bienes:[], instantanea:false};
  const bienes=(S.activos||[]).filter(b=>+(b.fecha||'').slice(0,4)===anio)
    .map(b=>({nm:b.desc||b.nombre||'Activo', fecha:b.fecha, valor:+(b.valor||0)}));
  return {total:bienes.reduce((s,b)=>s+b.valor,0), bienes, instantanea:true};
}

// Depreciación financiera cargada a resultado en el ejercicio (grupo 3301xxx)
function depreciacionFinanciera(M){
  return cuentasCon(M,'3301').reduce((s,k)=>s+saldoPres(k,M[k].saldo),0);
}

// ═══════════════════════════════════════════════════════════════════════
// DETERMINACIÓN DE LA RENTA LÍQUIDA IMPONIBLE
// ═══════════════════════════════════════════════════════════════════════
//
//   Resultado según balance (antes de impuesto)
//   (+) Agregados      · gastos rechazados, provisiones, impuesto contabilizado,
//                        depreciación financiera reversada, CM acreedora
//   (−) Deducciones    · depreciación tributaria, ingresos no renta, CM deudora
//   (−) Pérdida tributaria de arrastre (Art. 31 N°3)
//   = RENTA LÍQUIDA IMPONIBLE (o pérdida tributaria del ejercicio)
//
function calcularRenta(){
  const anio=S.empresa.anio;
  const reg=regInfo(RENTA.regimen);
  const M=buildMayor();

  // ── Resultado según balance ──
  const ingExp=sumaPref(M,'41');
  const otrosIng=sumaPref(M,'42')+sumaPref(M,'43');
  const ingresos=sumaPref(M,'4');
  const costoExp=sumaPref(M,'31');
  const gastosOp=sumaPref(M,'32')+sumaPref(M,'33');
  const gastosNoOp=sumaPref(M,'34');
  const correccMon=sumaPref(M,'35');
  const impContab=sumaPref(M,'36');
  // Los gastos totales del grupo 3 incluyen el impuesto a la renta contabilizado,
  // que no forma parte del resultado ANTES de impuesto.
  const gastos=sumaPref(M,'3')-impContab;
  const resultadoBalance=ingresos-gastos;

  // ── Agregados ──
  const ag=[];
  // 1. Impuesto a la renta contabilizado: no es gasto tributario (Art. 31 N°2)
  if(Math.abs(impContab)>=0.5)
    ag.push({cod:'', lbl:'Impuesto a la renta contabilizado en el ejercicio', monto:impContab, auto:true,
             nota:'El IDPC no es un gasto deducible (Art. 31 N°2 LIR). Se agrega para llegar a la base tributaria.'});
  // 2. Gastos rechazados marcados por el usuario
  RENTA.rechazadas.forEach(cd=>{
    if(!M[cd])return;
    const monto=saldoPres(cd,M[cd].saldo);
    if(Math.abs(monto)<0.5)return;
    ag.push({cod:'', lbl:'Gasto rechazado: '+(M[cd].nm||pdcNm(cd)), monto, auto:true, cuenta:cd,
             nota:motivoRechazo(cd,M[cd].nm)||'Marcado como no deducible (Art. 21 / Art. 31 LIR).'});
  });
  // 3. Depreciación financiera, cuando el régimen usa depreciación instantánea
  const depTrib=depreciacionTributaria(anio,RENTA.regimen);
  const depFin=depreciacionFinanciera(M);
  if(reg.deprInstantanea&&Math.abs(depFin)>=0.5)
    ag.push({cod:'982', lbl:'Depreciación financiera del ejercicio (se reversa)', monto:depFin, auto:true,
             nota:'En el régimen Pro Pyme la depreciación es instantánea: se reversa la cuota financiera y se deduce el 100% del activo adquirido en el año.'});
  // 4. Corrección monetaria: las Pymes 14 D están liberadas de aplicarla
  if(!reg.cm&&Math.abs(correccMon)>=0.5)
    ag.push({cod:'1146', lbl:'Corrección monetaria contabilizada (se reversa)', monto:correccMon, auto:true,
             nota:'Las empresas acogidas al Art. 14 D están liberadas de aplicar corrección monetaria a su capital propio.'});
  // 5. Agregados manuales
  RENTA.agregados.forEach((a,i)=>{
    if(Math.abs(+a.monto||0)<0.5)return;
    ag.push({cod:'', lbl:a.lbl||'Agregado manual', monto:+a.monto||0, auto:false, idx:i});
  });

  // ── Deducciones ──
  const de=[];
  // 1. Depreciación tributaria (instantánea en Pro Pyme)
  if(depTrib.total>=0.5)
    de.push({cod:'1391', lbl:'Depreciación instantánea del activo fijo adquirido en '+anio, monto:depTrib.total, auto:true,
             nota:depTrib.bienes.length+' bien(es) del activo fijo adquiridos en el ejercicio, deducidos al 100%.'});
  // 2. Deducciones manuales
  RENTA.deducciones.forEach((d,i)=>{
    if(Math.abs(+d.monto||0)<0.5)return;
    de.push({cod:'', lbl:d.lbl||'Deducción manual', monto:+d.monto||0, auto:false, idx:i});
  });

  const totalAgregados=ag.reduce((s,a)=>s+a.monto,0);
  const totalDeducciones=de.reduce((s,d)=>s+d.monto,0);
  const rliAntesPerdida=resultadoBalance+totalAgregados-totalDeducciones;

  // ── Pérdida tributaria de arrastre (Art. 31 N°3) ──
  // Sólo se imputa hasta absorber la renta positiva; el exceso queda para el año siguiente.
  const perdidaPrevia=Math.max(0,+RENTA.perdidaArrastre||0);
  const perdidaImputada=rliAntesPerdida>0?Math.min(perdidaPrevia,rliAntesPerdida):0;
  const perdidaRemanente=perdidaPrevia-perdidaImputada+(rliAntesPerdida<0?-rliAntesPerdida:0);
  const rli=rliAntesPerdida-perdidaImputada;

  // ── Impuesto de Primera Categoría ──
  const tasa=RENTA.tasa!=null?+RENTA.tasa:tasaLegal(RENTA.regimen,anio);
  const baseImponible=Math.max(0,rli);
  const idpc=Math.round(baseImponible*tasa/100);

  // ── Créditos contra el IDPC ──
  const c=RENTA.creditos||{};
  const creditos=[
    {cod:'366', lbl:'Crédito por inversión en activo fijo (Art. 33 bis)', monto:+c.af33bis||0},
    {cod:'82',  lbl:'Crédito por gastos de capacitación (SENCE)',          monto:+c.sence||0},
    {cod:'895', lbl:'Crédito por donaciones',                              monto:+c.donaciones||0},
    {cod:'',    lbl:'Otros créditos imputables al IDPC',                   monto:+c.otros||0},
  ].filter(x=>Math.abs(x.monto)>=0.5);
  const totalCreditos=creditos.reduce((s,x)=>s+x.monto,0);
  const idpcNeto=Math.max(0,idpc-totalCreditos);

  // ── PPM del ejercicio (Art. 84) ──
  let ppmF29=0;
  try{ ppmF29=calcularF29Anual().reduce((s,d)=>s+(d.ppm||0),0); }catch(e){ ppmF29=0; }
  const ppmBase=RENTA.ppmManual!=null?+RENTA.ppmManual:ppmF29;
  const reaj=+RENTA.reajustePPM||0;
  const ppmReajustado=Math.round(ppmBase*(1+reaj/100));

  // ── Resultado de la declaración ──
  const saldo=idpcNeto-ppmReajustado;   // >0 a pagar, <0 devolución
  const aPagar=saldo>0?saldo:0;
  const devolucion=saldo<0?-saldo:0;

  // ── Capital Propio Tributario (referencial) ──
  const activos=sumaPref(M,'1');
  const pasivoExigible=sumaPref(M,'21')+sumaPref(M,'22');
  const cpt=activos-pasivoExigible;

  return {
    anio, reg, tasa, M,
    ingresos, ingExp, otrosIng, costoExp, gastosOp, gastosNoOp, correccMon, impContab, gastos,
    resultadoBalance,
    ag, de, totalAgregados, totalDeducciones,
    rliAntesPerdida, perdidaPrevia, perdidaImputada, perdidaRemanente, rli,
    baseImponible, idpc, creditos, totalCreditos, idpcNeto,
    ppmF29, ppmBase, ppmReajustado, reaj,
    saldo, aPagar, devolucion,
    depTrib, depFin, cpt, activos, pasivoExigible
  };
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

// Porcentajes con decimales (fmt() de core.js redondea a entero y mostraría 12,5% como 13%)
const fmtPct=v=>{const n=Math.round((+v||0)*100)/100;return String(n).replace('.',',');};
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function renderRenta(){
  const anio=S.empresa.anio;
  if(RENTA_ANIO!==anio)await cargarRenta(anio);
  const el=document.getElementById('renta-content');
  if(!el)return;
  const R=calcularRenta();
  const at=anio+1; // Año Tributario = año comercial + 1

  const tab=(k,lbl)=>`<button class="btn ${RENTA_TAB===k?'btn-p':'btn-g'}" onclick="setRentaTab('${k}')">${lbl}</button>`;

  el.innerHTML=`
  ${bloqueCabecera(R,at)}
  <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap">
    ${tab('rli','📐 Renta Líquida Imponible')}
    ${tab('impuesto','🧾 Formulario 22')}
    ${tab('ajustes','⚙️ Ajustes y créditos')}
  </div>
  ${RENTA_TAB==='rli'?bloqueRLI(R):''}
  ${RENTA_TAB==='impuesto'?bloqueF22(R,at):''}
  ${RENTA_TAB==='ajustes'?bloqueAjustes(R):''}
  `;
}
function setRentaTab(k){RENTA_TAB=k;renderRenta();}

// ── Cabecera: régimen, tasa y resultado ──
function bloqueCabecera(R,at){
  const positivo=R.rli>=0;
  const transparente=R.reg.k==='14D8';
  return `<div class="card">
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end">
      <div class="grp" style="min-width:250px">
        <label>Régimen tributario</label>
        <select onchange="setRentaParam('regimen',this.value)">
          ${REGIMENES.map(r=>`<option value="${r.k}" ${R.reg.k===r.k?'selected':''}>${r.lbl}</option>`).join('')}
        </select>
      </div>
      <div class="grp" style="min-width:130px">
        <label>Tasa IDPC (%)</label>
        <input type="number" step="0.1" min="0" max="100" value="${R.tasa}" onchange="setRentaParam('tasa',this.value)">
      </div>
      <div class="grp" style="min-width:120px">
        <label>Año Tributario</label>
        <input type="text" value="AT ${at}" readonly style="color:var(--mt)">
      </div>
      <button class="btn btn-g" onclick="restaurarTasaLegal()">↺ Tasa legal (${fmtPct(tasaLegal(RENTA.regimen,R.anio))}%)</button>
    </div>
    <div class="info-tip" style="margin-top:12px">📌 ${esc(notaTasa(RENTA.regimen,R.anio))}</div>
    <div class="bal-layout" style="margin-top:14px">
      ${kpi('Resultado según balance',R.resultadoBalance,R.resultadoBalance>=0?'var(--ach)':'var(--err)')}
      ${kpi(positivo?'Renta Líquida Imponible':'Pérdida tributaria',Math.abs(R.rli),positivo?'var(--acc)':'var(--err)')}
      ${transparente
        ? kpi('IDPC que paga la empresa',0,'var(--mt)')+kpi('Base atribuible a los dueños',Math.max(0,R.rli),'var(--acc)')
        : kpi('Impuesto 1ª Categoría',R.idpcNeto,'var(--warn)')+
          (R.aPagar>0?kpi('IMPUESTO A PAGAR',R.aPagar,'var(--err)'):kpi('DEVOLUCIÓN SOLICITADA',R.devolucion,'var(--ach)'))}
    </div>
    ${transparente?`<div class="info-tip" style="margin-top:12px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ En el régimen <strong>14 D N°8 (Transparente)</strong> la empresa no paga Impuesto de Primera Categoría: la base imponible determinada aquí se atribuye a los dueños según su participación y ellos la declaran en su Global Complementario. Los PPM pagados también se les atribuyen.</div>`:''}
  </div>`;
}
function kpi(lbl,val,color){
  return `<div class="card-np" style="padding:12px 14px">
    <div style="font-size:10px;color:var(--mt);letter-spacing:.5px;text-transform:uppercase">${esc(lbl)}</div>
    <div style="font-family:var(--mono);font-size:17px;font-weight:700;color:${color};margin-top:4px;overflow-wrap:anywhere">${fmtC(val)}</div>
  </div>`;
}

// ── Pestaña 1: determinación de la RLI ──
function bloqueRLI(R){
  const fila=(lbl,monto,opts={})=>`<tr${opts.bg?` style="background:${opts.bg}"`:''}>
    <td style="font-family:var(--mono);font-size:10px;color:var(--mt);width:52px">${opts.cod||''}</td>
    <td class="tl" style="padding:${opts.fuerte?'9px 12px':'6px 12px'};font-size:${opts.fuerte?'13':'12'}px;font-weight:${opts.fuerte?'700':'400'}">
      ${opts.signo?`<span style="color:var(--mt)">${opts.signo}</span> `:''}${esc(lbl)}
      ${opts.nota?`<div style="font-size:10px;color:var(--mt);margin-top:2px;overflow-wrap:anywhere">${esc(opts.nota)}</div>`:''}
    </td>
    <td style="font-family:var(--mono);text-align:right;white-space:nowrap;font-weight:${opts.fuerte?'700':'400'};color:${opts.color||'var(--tx)'}">${fmtC(monto)}</td>
  </tr>`;

  const filasAg=R.ag.length?R.ag.map(a=>fila(a.lbl,a.monto,{cod:a.cod,signo:'+',nota:a.nota,color:'var(--warn)'})).join('')
    :`<tr><td colspan="3" style="padding:8px 12px;font-size:11px;color:var(--mt)">Sin agregados. Marca los gastos no deducibles en la pestaña <strong>Ajustes</strong>.</td></tr>`;
  const filasDe=R.de.length?R.de.map(d=>fila(d.lbl,d.monto,{cod:d.cod,signo:'−',nota:d.nota,color:'var(--ach)'})).join('')
    :`<tr><td colspan="3" style="padding:8px 12px;font-size:11px;color:var(--mt)">Sin deducciones.</td></tr>`;

  return `<div class="card">
    <div class="sec-title" style="font-size:14px;margin-bottom:4px">Determinación de la Renta Líquida Imponible</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:14px">Recuadro N°${R.reg.recuadro} del F22 · ejercicio comercial ${R.anio}</div>
    <div style="overflow-x:auto"><table style="width:100%;min-width:520px"><tbody>
      ${fila('Ingresos del giro y otros ingresos',R.ingresos,{cod:R.reg.pyme?'1545':'1698',color:'var(--ach)'})}
      ${fila('Costos y gastos del ejercicio',R.gastos,{cod:R.reg.pyme?'1546':'1717',signo:'−',color:'var(--err)'})}
      ${fila('RESULTADO SEGÚN BALANCE (antes de impuesto)',R.resultadoBalance,{cod:'645',fuerte:true,bg:'rgba(88,166,255,.08)'})}
      <tr><td colspan="3" style="padding:12px 12px 4px;font-size:11px;font-weight:700;color:var(--warn);letter-spacing:.5px">AGREGADOS</td></tr>
      ${filasAg}
      ${fila('Total agregados',R.totalAgregados,{fuerte:true,color:'var(--warn)'})}
      <tr><td colspan="3" style="padding:12px 12px 4px;font-size:11px;font-weight:700;color:var(--ach);letter-spacing:.5px">DEDUCCIONES</td></tr>
      ${filasDe}
      ${fila('Total deducciones',R.totalDeducciones,{fuerte:true,color:'var(--ach)'})}
      ${fila('Subtotal antes de pérdidas de arrastre',R.rliAntesPerdida,{fuerte:true,bg:'rgba(88,166,255,.06)'})}
      ${R.perdidaPrevia>0?fila('Pérdida tributaria de ejercicios anteriores imputada (Art. 31 N°3)',R.perdidaImputada,{cod:'634',signo:'−',color:'var(--ach)',nota:'Disponible: '+fmtC(R.perdidaPrevia)+'. Sólo se imputa hasta absorber la renta positiva del ejercicio.'}):''}
      ${fila(R.rli>=0?'RENTA LÍQUIDA IMPONIBLE':'PÉRDIDA TRIBUTARIA DEL EJERCICIO',Math.abs(R.rli),
        {cod:R.reg.pyme?'1728':'643',fuerte:true,bg:R.rli>=0?'rgba(46,160,67,.12)':'rgba(248,81,73,.12)',color:R.rli>=0?'var(--ach)':'var(--err)'})}
    </tbody></table></div>
    ${R.perdidaRemanente>0?`<div class="info-tip" style="margin-top:12px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ Queda una <strong>pérdida tributaria de arrastre de ${fmtC(R.perdidaRemanente)}</strong> para imputar en ejercicios siguientes. Anótala en el campo "Pérdida de arrastre" de la declaración del año ${R.anio+1}.</div>`:''}
    <div class="info-tip" style="margin-top:12px">🧮 <strong>Capital Propio Tributario referencial:</strong> ${fmtC(R.cpt)} &nbsp;·&nbsp; activos ${fmtC(R.activos)} − pasivo exigible ${fmtC(R.pasivoExigible)}. Es una aproximación contable: el CPT tributario puede diferir si hay activos o pasivos con valorización tributaria distinta.</div>
  </div>`;
}

// ── Pestaña 2: líneas del F22 ──
function bloqueF22(R,at){
  const transparente=R.reg.k==='14D8';
  const ln=(linea,cod,lbl,monto,opts={})=>`<tr${opts.bg?` style="background:${opts.bg}"`:''}>
    <td style="font-family:var(--mono);font-size:10px;color:var(--mt);width:44px">${linea||''}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--acc);width:48px">${cod||''}</td>
    <td class="tl" style="padding:${opts.fuerte?'9px 10px':'6px 10px'};font-size:${opts.fuerte?'13':'12'}px;font-weight:${opts.fuerte?'700':'400'}">${esc(lbl)}</td>
    <td style="font-family:var(--mono);text-align:right;white-space:nowrap;font-weight:${opts.fuerte?'700':'400'};color:${opts.color||'var(--tx)'}">${fmtC(monto)}</td>
  </tr>`;
  const filasCred=R.creditos.length?R.creditos.map(c=>ln('',c.cod,c.lbl,c.monto,{color:'var(--ach)'})).join('')
    :`<tr><td colspan="4" style="padding:8px 10px;font-size:11px;color:var(--mt)">Sin créditos informados. Agrégalos en la pestaña <strong>Ajustes</strong>.</td></tr>`;

  return `<div class="card">
    <div class="sec-title" style="font-size:14px;margin-bottom:4px">Formulario 22 — Año Tributario ${at}</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:14px">Líneas y códigos para el traspaso a la declaración en sii.cl</div>
    <div style="overflow-x:auto"><table style="width:100%;min-width:560px">
      <thead><tr><th class="tl" style="width:44px">LÍN.</th><th class="tl" style="width:48px">CÓD.</th><th class="tl">CONCEPTO</th><th style="text-align:right">MONTO</th></tr></thead>
      <tbody>
      ${ln('',R.reg.pyme?'1728':'643','Base Imponible de Primera Categoría',R.baseImponible,{fuerte:true,bg:'rgba(88,166,255,.08)'})}
      ${transparente
        ? `<tr><td colspan="4" style="padding:10px;font-size:12px;color:var(--warn)">Régimen transparente: la base imponible se atribuye a los dueños. La empresa no determina IDPC.</td></tr>`
        : ln(String(R.reg.linea),String(R.reg.codLinea),`Impuesto Primera Categoría (${fmtPct(R.tasa)}% sobre la base)`,R.idpc,{color:'var(--err)'})}
      ${transparente?'':`<tr><td colspan="4" style="padding:12px 10px 4px;font-size:11px;font-weight:700;color:var(--ach);letter-spacing:.5px">CRÉDITOS IMPUTABLES AL IDPC</td></tr>
      ${filasCred}
      ${ln('','','Total créditos',R.totalCreditos,{color:'var(--ach)'})}
      ${ln('','','IMPUESTO PRIMERA CATEGORÍA NETO',R.idpcNeto,{fuerte:true,bg:'rgba(88,166,255,.06)',color:'var(--err)'})}`}
      <tr><td colspan="4" style="padding:12px 10px 4px;font-size:11px;font-weight:700;color:var(--acc);letter-spacing:.5px">PAGOS PROVISIONALES Y RETENCIONES</td></tr>
      ${ln('84','36','PPM del ejercicio (Art. 84 LIR)',R.ppmBase,{color:'var(--ach)'})}
      ${R.reaj?ln('','','Reajuste de PPM al 31/dic ('+fmtPct(R.reaj)+'%)',R.ppmReajustado-R.ppmBase,{color:'var(--ach)'}):''}
      ${ln('','','Total PPM reajustados',R.ppmReajustado,{fuerte:true,color:'var(--ach)'})}
      ${transparente?'':(R.aPagar>0
        ? ln('','91','IMPUESTO ADEUDADO — A PAGAR',R.aPagar,{fuerte:true,bg:'rgba(248,81,73,.12)',color:'var(--err)'})
        : ln('','87','REMANENTE — DEVOLUCIÓN SOLICITADA',R.devolucion,{fuerte:true,bg:'rgba(46,160,67,.12)',color:'var(--ach)'}))}
      </tbody>
    </table></div>
    <div class="info-tip" style="margin-top:14px">ℹ️ Los códigos son de referencia según las instrucciones del F22 del Año Tributario ${at}. <strong>Verifica siempre contra el formulario vigente en sii.cl</strong> antes de presentar: el SII renumera líneas cada año. El cálculo del impuesto sí se hace con los datos contables reales del ejercicio ${R.anio}.</div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="exportRentaXLSX()">📊 Exportar a Excel</button>
      <button class="btn btn-g" onclick="window.print()">🖨️ Imprimir</button>
      <a class="btn btn-g" href="https://www.sii.cl/servicios_online/1044-.html" target="_blank" rel="noopener">🔗 Declarar en sii.cl</a>
    </div>
  </div>`;
}

// ── Pestaña 3: ajustes, gastos rechazados y créditos ──
function bloqueAjustes(R){
  const gastos=cuentasGasto(R.M);
  const filasG=gastos.length?gastos.map(g=>`<tr>
      <td style="width:28px;text-align:center"><input type="checkbox" ${g.marcada?'checked':''} onchange="toggleRechazada('${g.cd}')"></td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--mt)">${g.cd}</td>
      <td class="tl" style="font-size:12px">${esc(g.nm)}${g.sugerido?`<div style="font-size:10px;color:var(--warn);margin-top:2px">⚠ ${esc(g.sugerido)}</div>`:''}</td>
      <td style="font-family:var(--mono);text-align:right;white-space:nowrap">${fmtC(g.monto)}</td>
    </tr>`).join('')
    :`<tr><td colspan="4" style="padding:10px;font-size:11px;color:var(--mt)">No hay cuentas de gasto con saldo en el ejercicio.</td></tr>`;
  const sugeridas=gastos.filter(g=>g.sugerido&&!g.marcada).length;

  const listaManual=(arr,tipo)=>arr.length?arr.map((x,i)=>`<div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
      <input type="text" value="${esc(x.lbl||'')}" placeholder="Concepto" style="flex:1;min-width:180px" onchange="setRentaLinea('${tipo}',${i},'lbl',this.value)">
      <input type="number" value="${+x.monto||0}" placeholder="0" style="width:140px" onchange="setRentaLinea('${tipo}',${i},'monto',this.value)">
      <button class="btn btn-g" onclick="delRentaLinea('${tipo}',${i})">🗑</button>
    </div>`).join('')
    :`<div style="font-size:11px;color:var(--mt);margin-bottom:6px">Sin líneas manuales.</div>`;

  const c=RENTA.creditos||{};
  const credito=(k,lbl,cod)=>`<div class="grp" style="min-width:220px">
    <label>${esc(lbl)}${cod?` <span style="font-family:var(--mono);color:var(--acc)">${cod}</span>`:''}</label>
    <input type="number" min="0" value="${+c[k]||0}" onchange="setRentaCredito('${k}',this.value)">
  </div>`;

  return `<div class="card" style="margin-bottom:14px">
    <div class="sec-title" style="font-size:14px;margin-bottom:4px">Gastos rechazados (Art. 21 / Art. 31 LIR)</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:12px">Marca las cuentas de gasto que <strong>no son deducibles</strong> tributariamente. Cada cuenta marcada se agrega a la RLI por su saldo del ejercicio.${sugeridas?` <span style="color:var(--warn)">Hay ${sugeridas} cuenta(s) con indicios de no ser deducibles.</span>`:''}</div>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto"><table style="width:100%;min-width:460px">
      <thead><tr><th style="width:28px"></th><th class="tl" style="width:60px">CÓDIGO</th><th class="tl">CUENTA</th><th style="text-align:right">SALDO ${R.anio}</th></tr></thead>
      <tbody>${filasG}</tbody>
    </table></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="sec-title" style="font-size:14px;margin-bottom:12px">Agregados y deducciones manuales</div>
    <div style="font-size:11px;font-weight:700;color:var(--warn);margin-bottom:6px">AGREGADOS (+)</div>
    ${listaManual(RENTA.agregados,'agregados')}
    <button class="btn btn-g" style="margin-bottom:14px" onclick="addRentaLinea('agregados')">+ Agregar línea</button>
    <div style="font-size:11px;font-weight:700;color:var(--ach);margin-bottom:6px">DEDUCCIONES (−)</div>
    ${listaManual(RENTA.deducciones,'deducciones')}
    <button class="btn btn-g" onclick="addRentaLinea('deducciones')">+ Agregar línea</button>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="sec-title" style="font-size:14px;margin-bottom:12px">Créditos contra el impuesto</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${credito('af33bis','Activo fijo (Art. 33 bis)','366')}
      ${credito('sence','Capacitación SENCE','82')}
      ${credito('donaciones','Donaciones','895')}
      ${credito('otros','Otros créditos','')}
    </div>
  </div>

  <div class="card">
    <div class="sec-title" style="font-size:14px;margin-bottom:12px">Pérdidas de arrastre y PPM</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
      <div class="grp" style="min-width:220px">
        <label>Pérdida tributaria de ejercicios anteriores</label>
        <input type="number" min="0" value="${+RENTA.perdidaArrastre||0}" onchange="setRentaParam('perdidaArrastre',this.value)">
      </div>
      <div class="grp" style="min-width:220px">
        <label>PPM del ejercicio (calculado: ${fmtC(R.ppmF29)})</label>
        <input type="number" min="0" value="${RENTA.ppmManual!=null?+RENTA.ppmManual:R.ppmF29}" onchange="setRentaParam('ppmManual',this.value)">
      </div>
      <div class="grp" style="min-width:160px">
        <label>Reajuste PPM al 31/dic (%)</label>
        <input type="number" step="0.1" value="${+RENTA.reajustePPM||0}" onchange="setRentaParam('reajustePPM',this.value)">
      </div>
      <button class="btn btn-g" onclick="setRentaParam('ppmManual',null)">↺ Usar PPM del F29</button>
    </div>
    <div class="grp" style="margin-top:14px">
      <label>Notas de la declaración</label>
      <textarea rows="3" onchange="setRentaParam('notas',this.value)" placeholder="Observaciones, respaldo de los ajustes, criterios aplicados…">${esc(RENTA.notas||'')}</textarea>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// ACCIONES
// ═══════════════════════════════════════════════════════════════════════

function setRentaParam(k,v){
  if(k==='regimen'){
    RENTA.regimen=v;
    RENTA.tasa=null; // al cambiar de régimen se vuelve a la tasa legal
  }else if(k==='tasa'){
    RENTA.tasa=v===''||v==null?null:+v;
  }else if(k==='ppmManual'){
    RENTA.ppmManual=(v===''||v==null)?null:+v;
  }else if(k==='notas'){
    RENTA.notas=String(v||'');
  }else{
    RENTA[k]=+v||0;
  }
  guardarRenta();renderRenta();
}
function restaurarTasaLegal(){RENTA.tasa=null;guardarRenta();renderRenta();}

function toggleRechazada(cd){
  const i=RENTA.rechazadas.indexOf(cd);
  if(i>=0)RENTA.rechazadas.splice(i,1);else RENTA.rechazadas.push(cd);
  guardarRenta();renderRenta();
}
function addRentaLinea(tipo){
  if(!Array.isArray(RENTA[tipo]))RENTA[tipo]=[];
  RENTA[tipo].push({lbl:'',monto:0});
  guardarRenta();renderRenta();
}
function setRentaLinea(tipo,i,campo,v){
  if(!RENTA[tipo]||!RENTA[tipo][i])return;
  RENTA[tipo][i][campo]=campo==='monto'?(+v||0):String(v||'');
  guardarRenta();
  if(campo==='monto')renderRenta();
}
function delRentaLinea(tipo,i){
  if(!RENTA[tipo])return;
  RENTA[tipo].splice(i,1);
  guardarRenta();renderRenta();
}
function setRentaCredito(k,v){
  if(!RENTA.creditos)RENTA.creditos={};
  RENTA.creditos[k]=+v||0;
  guardarRenta();renderRenta();
}

// ── Exportación a Excel ──
function exportRentaXLSX(){
  try{
    const R=calcularRenta();
    const at=R.anio+1;
    const rows=[];
    const push=(cod,concepto,monto)=>rows.push([cod||'',concepto,monto===''?'':Math.round(monto)]);
    push('','DECLARACIÓN DE RENTA — FORMULARIO 22','');
    push('','Empresa: '+(S.empresa.nombre||''),'');
    push('','RUT: '+(S.empresa.rut||''),'');
    push('','Ejercicio comercial '+R.anio+' · Año Tributario '+at,'');
    push('','Régimen: '+R.reg.lbl+' · Tasa IDPC '+fmtPct(R.tasa)+'%','');
    push('','','');
    push('','DETERMINACIÓN DE LA RENTA LÍQUIDA IMPONIBLE','');
    push(R.reg.pyme?'1545':'1698','Ingresos del giro y otros ingresos',R.ingresos);
    push(R.reg.pyme?'1546':'1717','Costos y gastos del ejercicio',-R.gastos);
    push('645','RESULTADO SEGÚN BALANCE (antes de impuesto)',R.resultadoBalance);
    push('','AGREGADOS','');
    R.ag.forEach(a=>push(a.cod,'  '+a.lbl,a.monto));
    push('','Total agregados',R.totalAgregados);
    push('','DEDUCCIONES','');
    R.de.forEach(d=>push(d.cod,'  '+d.lbl,-d.monto));
    push('','Total deducciones',-R.totalDeducciones);
    push('','Subtotal antes de pérdidas de arrastre',R.rliAntesPerdida);
    if(R.perdidaPrevia>0)push('634','Pérdida tributaria de arrastre imputada',-R.perdidaImputada);
    push(R.reg.pyme?'1728':'643',R.rli>=0?'RENTA LÍQUIDA IMPONIBLE':'PÉRDIDA TRIBUTARIA DEL EJERCICIO',R.rli);
    push('','','');
    push('','FORMULARIO 22 — AT '+at,'');
    push(R.reg.pyme?'1728':'643','Base Imponible de Primera Categoría',R.baseImponible);
    if(R.reg.k!=='14D8'){
      push(String(R.reg.codLinea),'Impuesto Primera Categoría ('+fmtPct(R.tasa)+'%)',R.idpc);
      R.creditos.forEach(c=>push(c.cod,'  Crédito: '+c.lbl,-c.monto));
      push('','Total créditos',-R.totalCreditos);
      push('','Impuesto Primera Categoría neto',R.idpcNeto);
    }
    push('36','PPM del ejercicio (Art. 84 LIR)',-R.ppmBase);
    if(R.reaj)push('','Reajuste de PPM ('+fmtPct(R.reaj)+'%)',-(R.ppmReajustado-R.ppmBase));
    push('','Total PPM reajustados',-R.ppmReajustado);
    if(R.reg.k!=='14D8'){
      if(R.aPagar>0)push('91','IMPUESTO ADEUDADO — A PAGAR',R.aPagar);
      else push('87','REMANENTE — DEVOLUCIÓN SOLICITADA',R.devolucion);
    }
    push('','','');
    push('','Capital Propio Tributario (referencial)',R.cpt);
    if(R.perdidaRemanente>0)push('','Pérdida de arrastre para el ejercicio siguiente',R.perdidaRemanente);
    if(RENTA.notas)push('','Notas: '+RENTA.notas,'');

    const ws=XLSX.utils.aoa_to_sheet([['CÓDIGO','CONCEPTO','MONTO'],...rows]);
    ws['!cols']=[{wch:10},{wch:62},{wch:18}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'F22 AT'+at);

    // Hoja de detalle: cuentas marcadas como gasto rechazado
    const det=[['CÓDIGO','CUENTA','SALDO','MOTIVO']];
    cuentasGasto(R.M).filter(g=>g.marcada).forEach(g=>det.push([g.cd,g.nm,Math.round(g.monto),g.sugerido||'Marcado manualmente']));
    if(det.length>1){
      const wsd=XLSX.utils.aoa_to_sheet(det);
      wsd['!cols']=[{wch:10},{wch:42},{wch:16},{wch:48}];
      XLSX.utils.book_append_sheet(wb,wsd,'Gastos rechazados');
    }
    XLSX.writeFile(wb,'F22_AT'+at+'_'+(S.empresa.rut||'empresa').replace(/[^0-9kK]/g,'')+'.xlsx');
    toast('📊 Declaración exportada');
    try{logAccion('exportar','renta','F22 AT'+at);}catch(e){}
  }catch(e){
    toast('❌ No se pudo exportar: '+e.message,'e');
  }
}

export {REGIMENES, regInfo, tasaLegal, calcularRenta, renderRenta, setRentaTab,
        setRentaParam, restaurarTasaLegal, toggleRechazada,
        addRentaLinea, setRentaLinea, delRentaLinea, setRentaCredito,
        exportRentaXLSX, cargarRenta, resetRenta};
