// cierre.js — Cierre de ejercicio, provisiones, corrección monetaria
import {toast, fmtC, pdcNm} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {buildMayor} from './reportes.js';
import {proxFolioAsiento} from './asientos.js';
import {IND} from './indicadores.js';
import {rerender} from './ui.js';
import './storage.js';

// ═══ FASE 4: AJUSTES DE CIERRE ═══

// ── CIERRE DEL EJERCICIO ──
// Calcula el resultado del ejercicio (ingresos − gastos) y prepara el asiento de cierre
// que salda todas las cuentas de resultado (grupos 3 y 4) contra Resultados Acumulados (2303001).
const CUENTA_RESULTADOS_ACUM='2303001';
function calcularResultadoEjercicio(){
  const M=buildMayor();
  // Cuentas de resultado con saldo
  const cuentasRes=Object.keys(M).filter(k=>k.length===7&&(k.startsWith('3')||k.startsWith('4'))&&Math.abs(M[k].saldo)>=0.5);
  const ingresos=cuentasRes.filter(k=>k.startsWith('4')).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const gastos=cuentasRes.filter(k=>k.startsWith('3')).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const resultado=ingresos-gastos;
  return {M,cuentasRes,ingresos,gastos,resultado};
}
function renderCierre(){
  const anio=S.empresa.anio;
  const {cuentasRes,ingresos,gastos,resultado}=calcularResultadoEjercicio();
  const el=document.getElementById('cierre-content');
  const yaCerrado=S.asientos.find(a=>a.glosa&&a.glosa.includes('Cierre del ejercicio '+anio));
  el.innerHTML=`<div class="card" style="max-width:640px">
    <div class="info-tip" style="margin-bottom:16px">🔒 El <strong>cierre del ejercicio</strong> traspasa el resultado del año (utilidad o pérdida) a la cuenta <strong>Resultados Acumulados</strong>, dejando en cero las cuentas de ingresos y gastos para comenzar el año siguiente.</div>
    <table style="margin-bottom:16px"><tbody>
      <tr><td class="tl" style="padding:8px 12px;font-size:13px">Total Ingresos (grupo 4)</td><td style="font-family:var(--mono);text-align:right;color:var(--ach)">${fmtC(ingresos)}</td></tr>
      <tr><td class="tl" style="padding:8px 12px;font-size:13px">Total Gastos y Costos (grupo 3)</td><td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(gastos)}</td></tr>
      <tr style="background:${resultado>=0?'rgba(46,160,67,.12)':'rgba(248,81,73,.12)'}"><td class="tl" style="padding:11px 12px;font-weight:700;font-size:14px">${resultado>=0?'UTILIDAD':'PÉRDIDA'} DEL EJERCICIO</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:${resultado>=0?'var(--ach)':'var(--err)'}">${fmtC(resultado)}</td></tr>
    </tbody></table>
    ${cuentasRes.length===0?'<div class="empty"><div class="ei">📭</div>No hay cuentas de resultado con movimientos para cerrar.</div>':
    yaCerrado?`<div class="info-tip" style="background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ Ya existe un asiento de cierre para ${anio} (N°${yaCerrado.n}). Generar otro duplicaría el efecto.</div>
      <div style="margin-top:12px"><button class="btn btn-g" onclick="generarAsientoCierre()">Generar otro de todas formas</button></div>`:
    `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="generarAsientoCierre()">🔒 Generar asiento de cierre ${anio}</button>
      <span style="font-size:11px;color:var(--mt)">Saldará ${cuentasRes.length} cuentas de resultado contra Resultados Acumulados al 31/dic/${anio}.</span>
    </div>`}
    <div style="margin-top:14px;font-size:10px;color:var(--mt)">Cuenta destino: ${CUENTA_RESULTADOS_ACUM} · ${pdcNm(CUENTA_RESULTADOS_ACUM)}. Recomendado hacerlo después de registrar depreciación y provisiones del año.</div>
  </div>`;
}
function generarAsientoCierre(){
  const anio=S.empresa.anio;
  const {M,cuentasRes,resultado}=calcularResultadoEjercicio();
  if(!cuentasRes.length){toast('⚠️ No hay cuentas de resultado que cerrar','e');return;}
  if(!confirm(`¿Generar el asiento de cierre del ejercicio ${anio}?\n\nSaldará todas las cuentas de ingresos y gastos y traspasará el resultado (${fmtC(resultado)}) a Resultados Acumulados.\n\nEste asiento se registra al 31/dic/${anio}.`))return;
  const movs=[];
  // Saldar cada cuenta de resultado con el movimiento contrario a su saldo
  cuentasRes.forEach(cd=>{
    const saldo=M[cd].saldo; // deudora>0 (gastos), acreedora<0 (ingresos)
    if(saldo>0){ // cuenta de gasto (saldo deudor) → abonar para saldar
      movs.push({cd,nm:M[cd].nm||pdcNm(cd),debe:0,haber:saldo});
    }else{ // cuenta de ingreso (saldo acreedor) → cargar para saldar
      movs.push({cd,nm:M[cd].nm||pdcNm(cd),debe:-saldo,haber:0});
    }
  });
  // Contrapartida: Resultados Acumulados. Utilidad → se abona (haber); Pérdida → se carga (debe)
  if(resultado>=0){
    movs.push({cd:CUENTA_RESULTADOS_ACUM,nm:pdcNm(CUENTA_RESULTADOS_ACUM),debe:0,haber:resultado,desc:'Utilidad del ejercicio '+anio});
  }else{
    movs.push({cd:CUENTA_RESULTADOS_ACUM,nm:pdcNm(CUENTA_RESULTADOS_ACUM),debe:-resultado,haber:0,desc:'Pérdida del ejercicio '+anio});
  }
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha:anio+'-12-31',glosa:'Cierre del ejercicio '+anio,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' de cierre generado ('+fmtC(resultado)+')');
  renderCierre();updateHdr();
}

// ── PROVISIONES ──
function renderProvisiones(){
  const anio=S.empresa.anio;
  const el=document.getElementById('prov-content');
  // Base incobrables: saldo de clientes por cobrar (auxiliar). Base feriado: sueldos del año.
  const M=buildMayor();
  const saldoClientes=M['1104001']?Math.abs(M['1104001'].saldo):0;
  const sueldosAnio=Object.keys(M).filter(k=>k.startsWith('3201')&&Math.abs(M[k].saldo)>=0.5).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  el.innerHTML=`<div class="card" style="max-width:640px;margin-bottom:16px">
    <div class="card-title">🔻 Provisión de Incobrables</div>
    <div class="info-tip" style="margin-bottom:12px">Estima el % de las cuentas por cobrar que probablemente no se cobrarán. Genera: cargo a <strong>Castigo Incobrables</strong> (gasto) / abono a <strong>Estimación Clientes Incobrables</strong> (correctora del activo).</div>
    <div class="fg">
      <div class="grp"><label>Saldo Clientes por Cobrar</label><input type="text" value="${fmtC(saldoClientes)}" readonly style="color:var(--mt)"></div>
      <div class="grp"><label>% Incobrable estimado</label><input type="number" id="prov-inc-pct" step="0.1" min="0" max="100" value="2" oninput="previewProvInc()"></div>
    </div>
    <div id="prov-inc-preview" style="margin:10px 0"></div>
    <button class="btn btn-p" onclick="generarProvisionIncobrables()">📝 Generar provisión incobrables</button>
  </div>
  <div class="card" style="max-width:640px">
    <div class="card-title">🏖️ Provisión de Feriado Legal (Vacaciones)</div>
    <div class="info-tip" style="margin-bottom:12px">Estima el costo de los días de vacaciones acumulados por el personal. Genera: cargo a <strong>Vacaciones</strong> (gasto) / abono a <strong>Provisión Vacaciones</strong> (pasivo).</div>
    <div class="fg">
      <div class="grp"><label>Monto a provisionar</label><input type="number" id="prov-fer-monto" placeholder="0" oninput="previewProvFer()"></div>
    </div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:8px">Referencia: sueldos del año = ${fmtC(sueldosAnio)}. Regla general: ~1,25 días por mes trabajado por remuneración diaria.</div>
    <div id="prov-fer-preview" style="margin:10px 0"></div>
    <button class="btn btn-p" onclick="generarProvisionFeriado()">📝 Generar provisión feriado</button>
  </div>`;
  previewProvInc();
}
function previewProvInc(){
  const M=buildMayor();
  const saldo=M['1104001']?Math.abs(M['1104001'].saldo):0;
  const pct=+document.getElementById('prov-inc-pct').value||0;
  const monto=Math.round(saldo*pct/100);
  const el=document.getElementById('prov-inc-preview');
  if(el)el.innerHTML=monto>0?`<div class="info-tip" style="font-size:12px">Provisión: <strong>${fmtC(monto)}</strong> (${pct}% de ${fmtC(saldo)})</div>`:'';
}
function previewProvFer(){
  const monto=+document.getElementById('prov-fer-monto').value||0;
  const el=document.getElementById('prov-fer-preview');
  if(el)el.innerHTML=monto>0?`<div class="info-tip" style="font-size:12px">Provisión feriado: <strong>${fmtC(monto)}</strong></div>`:'';
}
function generarProvisionIncobrables(){
  const anio=S.empresa.anio;
  const M=buildMayor();
  const saldo=M['1104001']?Math.abs(M['1104001'].saldo):0;
  const pct=+document.getElementById('prov-inc-pct').value||0;
  const monto=Math.round(saldo*pct/100);
  if(monto<=0){toast('⚠️ El monto de la provisión es 0','e');return;}
  if(!confirm(`¿Generar provisión de incobrables por ${fmtC(monto)} (${pct}% de las cuentas por cobrar)?`))return;
  const movs=[
    {cd:'3302001',nm:pdcNm('3302001'),debe:monto,haber:0,desc:'Provisión incobrables '+anio},
    {cd:'1105001',nm:pdcNm('1105001'),debe:0,haber:monto,desc:'Estimación clientes incobrables'},
  ];
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha:anio+'-12-31',glosa:'Provisión incobrables '+anio,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' — provisión incobrables '+fmtC(monto));
  renderProvisiones();updateHdr();
}
function generarProvisionFeriado(){
  const anio=S.empresa.anio;
  const monto=+document.getElementById('prov-fer-monto').value||0;
  if(monto<=0){toast('⚠️ Ingresa el monto a provisionar','e');return;}
  if(!confirm(`¿Generar provisión de feriado legal por ${fmtC(monto)}?`))return;
  const movs=[
    {cd:'3201011',nm:pdcNm('3201011'),debe:monto,haber:0,desc:'Provisión feriado '+anio},
    {cd:'2105004',nm:pdcNm('2105004'),debe:0,haber:monto,desc:'Provisión vacaciones'},
  ];
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha:anio+'-12-31',glosa:'Provisión feriado '+anio,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' — provisión feriado '+fmtC(monto));
  renderProvisiones();updateHdr();
}

// ── CORRECCIÓN MONETARIA (informativa; 14 D N°3 está exento) ──
function renderCorreccion(){
  const anio=S.empresa.anio;
  const el=document.getElementById('cm-content');
  const M=buildMayor();
  const capital=Object.keys(M).filter(k=>k.startsWith('23')&&Math.abs(M[k].saldo)>=0.5).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const factorDefault=IND('factorCM');
  el.innerHTML=`<div class="card" style="max-width:640px">
    <div class="info-tip" style="margin-bottom:16px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ <strong>Tu empresa está en régimen 14 D N°3 Pro-Pyme General, que NO está sujeto a corrección monetaria</strong> del Art. 41 de la LIR (los contribuyentes de este régimen no reajustan sus registros empresariales). Este módulo es solo <strong>informativo/referencial</strong> por si cambias de régimen o lo necesitas para análisis.</div>
    <div class="card-title">Cálculo referencial de reajuste</div>
    <div class="fg">
      <div class="grp"><label>Capital Propio (patrimonio)</label><input type="text" value="${fmtC(capital)}" readonly style="color:var(--mt)"></div>
      <div class="grp"><label>Factor de reajuste anual (%)</label><input type="number" id="cm-factor" step="0.1" value="${factorDefault}" oninput="previewCM()"></div>
    </div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:8px">Factor oficial SII 2025 (regímenes sujetos a CM): 3,4%. Actualízalo según el año en el sitio del SII.</div>
    <div id="cm-preview"></div>
    <div class="info-tip" style="margin-top:14px;font-size:10px">El SII publica el factor anual de reajuste del capital propio. Referencia: sii.cl → Valores y Fechas → Corrección Monetaria. Para 14 D N°3 no se registra ningún asiento por este concepto.</div>
  </div>`;
  previewCM();
}
function previewCM(){
  const M=buildMayor();
  const capital=Object.keys(M).filter(k=>k.startsWith('23')&&Math.abs(M[k].saldo)>=0.5).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const factor=+document.getElementById('cm-factor').value||0;
  const reajuste=Math.round(capital*factor/100);
  const el=document.getElementById('cm-preview');
  if(el)el.innerHTML=`<div class="info-tip" style="font-size:12px">Reajuste referencial del capital propio: <strong>${fmtC(reajuste)}</strong> (${factor}% de ${fmtC(capital)})<br><span style="color:var(--mt);font-size:11px">En regímenes sujetos a CM: cargo a Corrección Monetaria (resultado) / abono a Fondo Revalorización Capital Propio.</span></div>`;
}


export {CUENTA_RESULTADOS_ACUM, calcularResultadoEjercicio, renderCierre, generarAsientoCierre, renderProvisiones, previewProvInc, previewProvFer, generarProvisionIncobrables, generarProvisionFeriado, renderCorreccion, previewCM};
