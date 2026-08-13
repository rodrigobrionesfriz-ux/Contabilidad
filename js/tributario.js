// tributario.js — Formulario 29 (IVA mensual), PPM y asiento de compensación de IVA
import {fmtC, fmt, MESES, IVA, dteV, dteC, PDC, pdcNm, toast} from './core.js';
import {retencionHonorarios, getIndicadores} from './indicadores.js';
import {todosDocsCompras, todosDocsVentas, proxFolioComprobante} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {savePDC} from './pdc.js';
import {S} from './state.js';
import './storage.js';

// ═══ FORMULARIO 29 (IVA mensual + PPM + retenciones) ═══
// Devuelve los datos mensuales de F29 para un año, con arrastre de remanente de crédito fiscal.
function calcularF29Anual(){
  const anio=S.empresa.anio;
  const meses=[];
  let remanenteAnt=0; // remanente de crédito fiscal del mes anterior (código 504→077)
  const tasaPPM=(S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0)/100;
  for(let m=1;m<=12;m++){
    // Ventas del mes (débito fiscal)
    const vs=todosDocsVentas().filter(d=>+d.fecha.slice(5,7)===m);
    let ventasNetas=0,ventasExentas=0,debito=0;
    vs.forEach(d=>{
      const signo=(dteV(d.tipoDTE)?.signo)||1;
      ventasNetas+=(d.neto||0)*signo;
      ventasExentas+=(d.exento||0)*signo;
      debito+=(d.iva||0)*signo;
    });
    // Compras del mes (crédito fiscal)
    const cs=todosDocsCompras().filter(d=>+d.fecha.slice(5,7)===m);
    let comprasNetas=0,credito=0;
    cs.forEach(d=>{
      const signo=(dteC(d.tipoDTE)?.signo)||1;
      comprasNetas+=(d.neto||0)*signo;
      credito+=(d.iva||0)*signo;
    });
    // Honorarios del mes → retención del año (código 151)
    const honM=S.honorarios.filter(h=>h.mes===m);
    const retencionHon=Math.round(honM.reduce((s,h)=>s+ +(h.bruto||0),0)*retencionHonorarios(S.empresa.anio));
    // IVA: crédito total = crédito del mes + remanente anterior
    const creditoTotal=credito+remanenteAnt;
    const ivaDeterminado=debito-creditoTotal;
    let ivaAPagar=0,remanente=0;
    if(ivaDeterminado>0){ivaAPagar=ivaDeterminado;remanente=0;}
    else{ivaAPagar=0;remanente=-ivaDeterminado;}
    // PPM sobre ingresos brutos (netos + exentos de explotación)
    const basePPM=ventasNetas+ventasExentas;
    const ppm=Math.round(basePPM*tasaPPM);
    // Total a pagar en el F29
    const totalPagar=ivaAPagar+ppm+retencionHon;
    meses.push({m,ventasNetas,ventasExentas,debito,comprasNetas,credito,remanenteAnt,creditoTotal,ivaDeterminado,ivaAPagar,remanente,basePPM,ppm,retencionHon,totalPagar,nDocsV:vs.length,nDocsC:cs.length});
    remanenteAnt=remanente;
  }
  return meses;
}
function renderF29(){
  const sel=document.getElementById('f29-mes');
  if(sel&&sel.options.length===0){
    sel.innerHTML=MESES.map((nm,i)=>`<option value="${i+1}">${nm} ${S.empresa.anio}</option>`).join('');
    // Mes por defecto: el actual si es del año en curso, si no enero
    const hoyMes=new Date().getMonth()+1;
    sel.value=(S.empresa.anio===new Date().getFullYear())?hoyMes:1;
  }
  const mSel=+sel.value||1;
  const data=calcularF29Anual();
  const d=data[mSel-1];
  const el=document.getElementById('f29-content');
  const linea=(cod,lbl,val,opts={})=>`<tr${opts.hl?' style="background:'+(opts.pos?'rgba(46,160,67,.10)':'rgba(88,166,255,.08)')+'"':''}>
    <td style="font-family:var(--mono);font-size:11px;color:var(--mt);width:60px">${cod||''}</td>
    <td class="tl" style="font-size:12px;${opts.bold?'font-weight:700':''}">${lbl}</td>
    <td style="font-family:var(--mono);text-align:right;${opts.bold?'font-weight:700;':''}color:${opts.color||'var(--tx)'}">${val===''?'':fmtC(val)}</td>
  </tr>`;
  el.innerHTML=`<div class="card" style="max-width:640px">
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:15px;font-weight:700">${S.empresa.nombre||'(sin empresa)'}</div>
      <div style="color:var(--mt);font-size:12px;margin-top:3px">Formulario 29 — ${MESES[mSel-1]} ${S.empresa.anio}</div>
      <div style="color:var(--mt);font-size:11px">RUT ${S.empresa.rut||'—'} · ${d.nDocsV} ventas · ${d.nDocsC} compras</div>
    </div>
    <table><tbody>
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">DÉBITO FISCAL (Ventas)</td></tr>
      ${linea('502','Ventas netas afectas',d.ventasNetas)}
      ${linea('142','Ventas exentas',d.ventasExentas)}
      ${linea('538','Débito fiscal IVA (19%)',d.debito,{bold:true})}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">CRÉDITO FISCAL (Compras)</td></tr>
      ${linea('520','Compras netas',d.comprasNetas)}
      ${linea('524','Crédito fiscal del mes',d.credito)}
      ${d.remanenteAnt>0?linea('504','Remanente crédito mes anterior',d.remanenteAnt,{color:'var(--info)'}):''}
      ${linea('537','Crédito fiscal total',d.creditoTotal,{bold:true})}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">DETERMINACIÓN IVA</td></tr>
      ${d.ivaAPagar>0?linea('89','IVA a pagar',d.ivaAPagar,{bold:true,hl:true,color:'var(--err)'}):linea('77','Remanente crédito fiscal (mes siguiente)',d.remanente,{bold:true,hl:true,color:'var(--info)'})}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">PPM Y RETENCIONES</td></tr>
      ${linea('563','Base imponible PPM',d.basePPM)}
      ${linea('62','PPM ('+((S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0))+'%)',d.ppm,{color:'var(--err)'})}
      ${linea('151',`Retención honorarios (${(retencionHonorarios(S.empresa.anio)*100).toFixed(2)}%)`,d.retencionHon,{color:'var(--err)'})}
      <tr style="background:${d.totalPagar>0?'rgba(248,81,73,.12)':'rgba(46,160,67,.12)'}">
        <td style="font-family:var(--mono);font-size:11px;color:var(--mt)">91</td>
        <td class="tl" style="padding:11px;font-weight:700;font-size:14px">TOTAL A PAGAR</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:${d.totalPagar>0?'var(--err)':'var(--ach)'}">${fmtC(d.totalPagar)}</td>
      </tr>
    </tbody></table>
    ${d.tasaPPM===0&&(S.empresa.tasaPPM==null||+S.empresa.tasaPPM===0)?'<div class="info-tip" style="margin-top:12px;font-size:11px">⚠️ La tasa de PPM está en 0%. Configúrala en Empresa → Configuración Tributaria para que se calcule el PPM.</div>':''}
    <div style="margin-top:12px;font-size:10px;color:var(--mt)">Los códigos corresponden al Formulario 29 del SII. Este es un cálculo referencial basado en tus registros; verifica antes de declarar.</div>
  </div>
  <div id="ivac-content" style="max-width:760px"></div>`;
  renderCompensacionIVA();
}

// ═══════════════════════════════════════════════════════════════════════
// ASIENTO DE COMPENSACIÓN DE IVA (liquidación mensual del F29)
// ═══════════════════════════════════════════════════════════════════════
//
// Procedimiento contable chileno. Durante el mes, el IVA recargado en las
// ventas se acumula en el pasivo IVA Débito Fiscal y el soportado en las
// compras en el activo IVA Crédito Fiscal. Al cierre del período tributario
// ambas cuentas se saldan entre sí (DL 825, art. 20 y 23) y la diferencia
// determina el resultado del período:
//
//   • Débito > Crédito  → IVA a pagar (F29 código 89): pasivo por enterar en
//                         arcas fiscales dentro del plazo legal.
//   • Crédito > Débito  → Remanente de crédito fiscal (F29 código 77): activo
//                         que se imputa al período siguiente (art. 26 y 27).
//
// El remanente arrastrado se reajusta según el art. 27 del DL 825:
// se convierte a UTM del mes en que se originó y se reconvierte a UTM del mes
// en que se imputa. La diferencia de reajuste es un resultado del ejercicio.
//
// Las líneas quedan siempre cuadradas por construcción:
//   Débito = Crédito del mes ± Δ Remanente + IVA a pagar ± Reajuste

// Cuentas por defecto del asiento (se pueden cambiar en el formulario)
const IVAC_DEFAULT={
  debito:'2103003',      // IVA DÉBITO FISCAL (pasivo)
  credito:'1108002',     // IVA CRÉDITO FISCAL (activo)
  remanente:'1108007',   // REMANENTE CRÉDITO FISCAL (activo) — se crea si no existe
  porPagar:'2104002',    // IMPUESTOS POR PAGAR (pasivo)
  reajuste:'3501001',    // CORRECCIÓN MONETARIA (resultado) — se resuelve dinámicamente
  ppmActivo:'1108001',   // PAGOS PROVISIONALES MENSUALES (activo)
  ppmPasivo:'2105006',   // PROVISIÓN PPM (pasivo)
};
// Estado del formulario
const IVAC={cuentas:{...IVAC_DEFAULT},incluirPPM:false,utmOrigen:0,utmActual:0,fecha:'',glosa:''};

// Primera cuenta existente de una lista de candidatos
function primeraCuenta(...cds){
  for(const cd of cds){if(PDC.some(x=>x.cd===cd))return cd;}
  return '';
}
// La cuenta de remanente no viene en el plan estándar: se ofrece crearla.
function cuentaRemanenteExiste(){return PDC.some(x=>x.cd===IVAC.cuentas.remanente);}
async function crearCuentaRemanente(){
  const cd=IVAC_DEFAULT.remanente;
  if(PDC.some(x=>x.cd===cd)){toast('La cuenta ya existe');return;}
  PDC.push({cd,nm:'REMANENTE CRÉDITO FISCAL',tp:'A',nat:'D'});
  PDC.sort((a,b)=>String(a.cd).localeCompare(String(b.cd),'es',{numeric:true}));
  await savePDC();
  IVAC.cuentas.remanente=cd;
  toast(`✅ Cuenta ${cd} REMANENTE CRÉDITO FISCAL creada en el plan de cuentas`);
  renderCompensacionIVA();
}

// Último día del mes (fecha contable del asiento de liquidación)
function ultimoDiaMes(anio,mes){
  return `${anio}-${String(mes).padStart(2,'0')}-${String(new Date(anio,mes,0).getDate()).padStart(2,'0')}`;
}

// ¿Ya se generó el asiento de compensación de este período?
function asientoIVAExistente(periodo){
  return (S.asientos||[]).find(a=>!a.anulado&&a.origenAuto==='ivaf29'&&a.periodoIVA===periodo)||null;
}

// Calcula las líneas del asiento para un mes. Devuelve {movs, detalle, cuadra}.
function calcularCompensacionIVA(mes){
  const anio=S.empresa.anio;
  const d=calcularF29Anual()[mes-1];
  const c=IVAC.cuentas;

  // Reajuste del remanente arrastrado (art. 27 DL 825). Con UTM iguales el
  // factor es 1 y no se genera línea: el usuario decide si reajusta o no.
  const utmO=+IVAC.utmOrigen||0, utmA=+IVAC.utmActual||0;
  let remanenteReaj=d.remanenteAnt, reajuste=0, remanenteUTM=0;
  if(d.remanenteAnt>0&&utmO>0&&utmA>0&&utmO!==utmA){
    remanenteUTM=d.remanenteAnt/utmO;
    remanenteReaj=Math.round(remanenteUTM*utmA);
    reajuste=remanenteReaj-d.remanenteAnt;
  }
  // Recalcular la determinación con el remanente reajustado
  const creditoTotal=d.credito+remanenteReaj;
  const determinado=d.debito-creditoTotal;
  const ivaAPagar=determinado>0?determinado:0;
  const remanenteNuevo=determinado<0?-determinado:0;
  // Movimiento neto de la cuenta de remanente en el período
  const deltaRem=remanenteNuevo-d.remanenteAnt;

  const movs=[];
  const nm=cd=>pdcNm(cd)||cd;
  const per=`${MESES[mes-1]} ${anio}`;
  // 1) Se salda el IVA Débito Fiscal acumulado en el mes
  if(d.debito>0)movs.push({cd:c.debito,nm:nm(c.debito),debe:Math.round(d.debito),haber:0,desc:`Débito fiscal ${per} (F29 cód. 538)`});
  // 2) Se salda el IVA Crédito Fiscal del mes
  if(d.credito>0)movs.push({cd:c.credito,nm:nm(c.credito),debe:0,haber:Math.round(d.credito),desc:`Crédito fiscal ${per} (F29 cód. 524)`});
  // 3) Reajuste del remanente arrastrado, si corresponde.
  //    Un reajuste positivo aumenta el crédito imputable, así que reduce el IVA
  //    a pagar (o engrosa el remanente): se reconoce como ingreso por corrección
  //    monetaria (HABER). Si la UTM bajara sería una pérdida (DEBE).
  if(reajuste!==0)movs.push({
    cd:c.reajuste,nm:nm(c.reajuste),
    debe:reajuste<0?Math.round(-reajuste):0,haber:reajuste>0?Math.round(reajuste):0,
    desc:`Reajuste remanente art. 27 DL 825 (UTM ${fmt(utmO)} → ${fmt(utmA)})`});
  // 4) Movimiento neto de la cuenta de remanente
  if(deltaRem>0)movs.push({cd:c.remanente,nm:nm(c.remanente),debe:Math.round(deltaRem),haber:0,desc:`Remanente crédito fiscal ${per} (F29 cód. 77)`});
  else if(deltaRem<0)movs.push({cd:c.remanente,nm:nm(c.remanente),debe:0,haber:Math.round(-deltaRem),desc:`Imputación remanente mes anterior (F29 cód. 504)`});
  // 5) IVA a pagar del período
  if(ivaAPagar>0)movs.push({cd:c.porPagar,nm:nm(c.porPagar),debe:0,haber:Math.round(ivaAPagar),desc:`IVA a pagar ${per} (F29 cód. 89)`});
  // 6) PPM del período (opcional — no se registra en ninguna otra parte del sistema)
  if(IVAC.incluirPPM&&d.ppm>0){
    movs.push({cd:c.ppmActivo,nm:nm(c.ppmActivo),debe:Math.round(d.ppm),haber:0,desc:`PPM ${per} (F29 cód. 62)`});
    movs.push({cd:c.ppmPasivo,nm:nm(c.ppmPasivo),debe:0,haber:Math.round(d.ppm),desc:`PPM por pagar ${per}`});
  }

  const tD=movs.reduce((s,m)=>s+m.debe,0),tH=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,tD,tH,cuadra:Math.abs(tD-tH)<1,
    d,remanenteReaj,reajuste,remanenteUTM,creditoTotal,determinado,ivaAPagar,remanenteNuevo,deltaRem};
}

// ── Handlers del formulario ──
function setIvacCuenta(k,cd){IVAC.cuentas[k]=cd;renderCompensacionIVA();}
function setIvacCampo(k,v){
  if(k==='incluirPPM')IVAC.incluirPPM=!!v;
  else IVAC[k]=v;
  renderCompensacionIVA();
}
function resetIvacCuentas(){IVAC.cuentas={...IVAC_DEFAULT};renderCompensacionIVA();}

function renderCompensacionIVA(){
  const el=document.getElementById('ivac-content');if(!el)return;
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  // Al cambiar de mes se recalculan fecha y glosa (si no las editó el usuario a mano)
  if(IVAC.periodo!==periodo){IVAC.periodo=periodo;IVAC.fecha='';IVAC.glosa='';}

  // Cuentas por defecto que sí existan en este plan de cuentas
  if(!PDC.some(x=>x.cd===IVAC.cuentas.reajuste))
    IVAC.cuentas.reajuste=primeraCuenta('3502001','3501001','3503001','4301001','3401001')||IVAC.cuentas.reajuste;
  // UTM: por defecto la configurada en Indicadores para ambos meses (factor 1)
  const utmCfg=Math.round(getIndicadores()?.utm||0);
  if(!IVAC.utmOrigen)IVAC.utmOrigen=utmCfg;
  if(!IVAC.utmActual)IVAC.utmActual=utmCfg;

  const r=calcularCompensacionIVA(mes);
  const d=r.d;
  const yaExiste=asientoIVAExistente(periodo);
  const faltaRemanente=(r.deltaRem!==0)&&!cuentaRemanenteExiste();
  const fecha=IVAC.fecha||ultimoDiaMes(anio,mes);
  const glosa=IVAC.glosa||`Compensación IVA ${MESES[mes-1]} ${anio} — F29`;

  const selCuenta=(k,lbl,ayuda)=>`<div class="grp">
    <label>${lbl}</label>
    ${inputCuenta({id:'ivac-cd-'+k,value:IVAC.cuentas[k]||'',onPick:`setIvacCuenta('${k}','%CD%')`,
      placeholder:'Buscar cuenta…',clase:'linea-inp'})}
    ${ayuda?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${ayuda}</div>`:''}
  </div>`;

  const filaMov=m=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${m.cd}</td>
    <td class="tnm" style="font-size:12px">${m.nm}<div style="font-size:10px;color:var(--mt)">${m.desc}</div></td>
    <td style="font-family:var(--mono)">${m.debe?fmtC(m.debe):'–'}</td>
    <td style="font-family:var(--mono)">${m.haber?fmtC(m.haber):'–'}</td>
  </tr>`;

  el.innerHTML=`<div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      <div>
        <div style="font-size:15px;font-weight:700">🧾 Asiento de compensación de IVA</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">Liquidación del período ${MESES[mes-1]} ${anio} — salda Débito contra Crédito Fiscal</div>
      </div>
      ${yaExiste?`<span class="badge br" title="Ya se generó la compensación de este período">⚠️ Ya generado — Asiento N°${yaExiste.n}</span>`:''}
    </div>

    <div class="info-tip" style="margin:10px 0 14px;font-size:11px;line-height:1.6">
      📘 El IVA recargado en las ventas se acumula en el pasivo <strong>IVA Débito Fiscal</strong> y el soportado en las compras
      en el activo <strong>IVA Crédito Fiscal</strong>. Al cierre del período tributario ambas cuentas se saldan entre sí
      (DL 825, arts. 20 y 23) y la diferencia determina el resultado:
      si el débito supera al crédito queda un <strong>IVA a pagar</strong> (código 89); si el crédito supera al débito queda un
      <strong>remanente de crédito fiscal</strong> (código 77) que se imputa al período siguiente, reajustado en UTM según el art. 27.
    </div>

    <div class="card-np" style="margin-bottom:14px"><table><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:7px 10px">DETERMINACIÓN DEL PERÍODO</td></tr>
      <tr><td class="tl" style="font-size:12px">Débito fiscal del mes (cód. 538)</td><td style="font-family:var(--mono)">${fmtC(d.debito)}</td></tr>
      <tr><td class="tl" style="font-size:12px">Crédito fiscal del mes (cód. 524)</td><td style="font-family:var(--mono)">${fmtC(d.credito)}</td></tr>
      ${d.remanenteAnt>0?`<tr><td class="tl" style="font-size:12px">Remanente del mes anterior (cód. 504)</td><td style="font-family:var(--mono)">${fmtC(d.remanenteAnt)}</td></tr>`:''}
      ${r.reajuste!==0?`<tr><td class="tl" style="font-size:12px;color:var(--info)">Reajuste del remanente (art. 27) — ${r.remanenteUTM.toFixed(2)} UTM</td><td style="font-family:var(--mono);color:var(--info)">${fmtC(r.reajuste)}</td></tr>`:''}
      <tr><td class="tl" style="font-size:12px;font-weight:600">Crédito fiscal total</td><td style="font-family:var(--mono);font-weight:600">${fmtC(r.creditoTotal)}</td></tr>
      <tr style="background:${r.ivaAPagar>0?'rgba(248,81,73,.10)':'rgba(88,166,255,.08)'}">
        <td class="tl" style="font-size:13px;font-weight:700;padding:9px 10px">${r.ivaAPagar>0?'IVA A PAGAR (cód. 89)':'REMANENTE PARA EL MES SIGUIENTE (cód. 77)'}</td>
        <td style="font-family:var(--mono);font-weight:700;color:${r.ivaAPagar>0?'var(--err)':'var(--info)'}">${fmtC(r.ivaAPagar>0?r.ivaAPagar:r.remanenteNuevo)}</td>
      </tr>
    </tbody></table></div>

    <div class="fg" style="margin-bottom:12px">
      <div class="grp"><label>Fecha del asiento</label>
        <input type="date" value="${fecha}" onchange="setIvacCampo('fecha',this.value)">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Por defecto el último día del período tributario</div></div>
      <div class="grp"><label>Glosa</label>
        <input type="text" value="${glosa.replace(/"/g,'&quot;')}" onchange="setIvacCampo('glosa',this.value)"></div>
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Cuentas del asiento</div>
    <div class="fg" style="margin-bottom:6px">
      ${selCuenta('debito','IVA Débito Fiscal (se salda al DEBE)')}
      ${selCuenta('credito','IVA Crédito Fiscal (se salda al HABER)')}
      ${selCuenta('remanente','Remanente crédito fiscal',faltaRemanente?'<span style="color:var(--warn)">⚠️ Esta cuenta no existe en tu plan</span>':'')}
      ${selCuenta('porPagar','IVA por pagar')}
      ${r.reajuste!==0?selCuenta('reajuste','Reajuste del remanente (resultado)'):''}
      ${IVAC.incluirPPM?selCuenta('ppmActivo','PPM (activo)')+selCuenta('ppmPasivo','PPM por pagar'):''}
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-g" style="font-size:11px" onclick="resetIvacCuentas()">↺ Cuentas por defecto</button>
      ${faltaRemanente?`<button class="btn btn-i" style="font-size:11px" onclick="crearCuentaRemanente()">+ Crear cuenta 1108007 REMANENTE CRÉDITO FISCAL</button>`:''}
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Reajuste del remanente (art. 27 DL 825)</div>
    ${d.remanenteAnt>0?`
      <div class="fg" style="margin-bottom:6px">
        <div class="grp"><label>UTM del mes en que se originó</label>
          <input type="number" value="${IVAC.utmOrigen}" onchange="setIvacCampo('utmOrigen',this.value)"></div>
        <div class="grp"><label>UTM del mes de imputación</label>
          <input type="number" value="${IVAC.utmActual}" onchange="setIvacCampo('utmActual',this.value)"></div>
      </div>
      <div style="font-size:11px;color:var(--mt);margin-bottom:14px">
        El remanente se expresa en UTM del mes en que se originó y se reconvierte a la UTM del mes en que se imputa.
        Con ambos valores iguales el factor es 1 y no se genera línea de reajuste.
        ${r.reajuste!==0?`<br><strong style="color:var(--info)">${fmtC(d.remanenteAnt)} ÷ ${fmt(IVAC.utmOrigen)} = ${r.remanenteUTM.toFixed(2)} UTM × ${fmt(IVAC.utmActual)} = ${fmtC(r.remanenteReaj)}</strong> · reajuste ${fmtC(r.reajuste)}`:''}
      </div>`
      :`<div style="font-size:11px;color:var(--mt);margin-bottom:14px">No hay remanente arrastrado desde el mes anterior, así que no corresponde reajuste.</div>`}

    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;user-select:none;margin-bottom:14px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
      <input type="checkbox" ${IVAC.incluirPPM?'checked':''} onchange="setIvacCampo('incluirPPM',this.checked)" style="width:auto">
      <span>Incluir también el PPM del período (${fmtC(d.ppm)})</span>
    </label>
    <div style="font-size:10px;color:var(--mt);margin-top:-10px;margin-bottom:14px">
      La retención de honorarios <strong>no</strong> se incluye: ya queda registrada al ingresar cada boleta en la cuenta ${pdcNm('2102006')||'2102006'}.
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Previsualización del asiento</div>
    ${r.movs.length?`<div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th class="tl" style="width:82px">CÓD.</th><th class="tl">CUENTA</th><th style="width:130px">DEBE</th><th style="width:130px">HABER</th></tr></thead>
      <tbody>${r.movs.map(filaMov).join('')}</tbody>
      <tfoot><tr><td class="tl" colspan="2">TOTALES</td>
        <td style="font-family:var(--mono)">${fmtC(r.tD)}</td>
        <td style="font-family:var(--mono)">${fmtC(r.tH)}</td></tr></tfoot>
    </table></div></div>
    <div style="font-size:12px;color:${r.cuadra?'var(--ach)':'var(--err)'};margin-bottom:12px">
      ${r.cuadra?'✅ Asiento cuadrado — Debe = Haber = '+fmtC(r.tD):'⚠️ Descuadre de '+fmtC(Math.abs(r.tD-r.tH))}
    </div>`
    :`<div style="text-align:center;padding:24px;color:var(--mt);font-size:12px">No hay IVA que compensar en ${MESES[mes-1]} ${anio}.</div>`}

    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-p" onclick="generarAsientoIVA()" ${(!r.movs.length||!r.cuadra||faltaRemanente)?'disabled style="opacity:.5;cursor:not-allowed"':''}>
        📝 ${yaExiste?'Generar de nuevo':'Generar asiento'}
      </button>
    </div>
    <div style="margin-top:10px;font-size:10px;color:var(--mt)">
      El asiento se crea como <strong>asiento manual</strong>: queda visible en Comprobantes y Libro Diario, y se puede editar o anular como cualquier otro.
    </div>
  </div>`;
}

function generarAsientoIVA(){
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  const r=calcularCompensacionIVA(mes);
  if(!r.movs.length){toast('⚠️ No hay IVA que compensar en este período','e');return;}
  if(!r.cuadra){toast('⚠️ El asiento no cuadra — revisa las cuentas','e');return;}
  const faltantes=r.movs.filter(m=>!PDC.some(x=>x.cd===m.cd)).map(m=>m.cd);
  if(faltantes.length){toast(`⚠️ Estas cuentas no existen en el plan: ${[...new Set(faltantes)].join(', ')}`,'e');return;}

  const yaExiste=asientoIVAExistente(periodo);
  const per=`${MESES[mes-1]} ${anio}`;
  const resumen=r.ivaAPagar>0?`IVA a pagar ${fmtC(r.ivaAPagar)}`:`Remanente ${fmtC(r.remanenteNuevo)}`;
  const msg=(yaExiste
      ? `⚠️ Ya existe el asiento N°${yaExiste.n} de compensación de ${per}.\nSe creará OTRO asiento (el anterior no se borra: anúlalo si corresponde).\n\n`
      : '')
    +`Compensación de IVA — ${per}\n\n`
    +`Débito fiscal:   ${fmtC(r.d.debito)}\n`
    +`Crédito fiscal:  ${fmtC(r.d.credito)}\n`
    +(r.d.remanenteAnt>0?`Remanente ant.:  ${fmtC(r.d.remanenteAnt)}${r.reajuste?` (reajustado a ${fmtC(r.remanenteReaj)})`:''}\n`:'')
    +(IVAC.incluirPPM&&r.d.ppm>0?`PPM:             ${fmtC(r.d.ppm)}\n`:'')
    +`\nResultado:       ${resumen}\n\n¿Generar el asiento?`;
  if(!confirm(msg))return;

  const folio=proxFolioComprobante();
  const fecha=IVAC.fecha||ultimoDiaMes(anio,mes);
  const glosa=IVAC.glosa||`Compensación IVA ${per} — F29`;
  S.asientos.push({
    id:'as_iva_'+Date.now(),n:folio,folioComp:folio,fecha,glosa,
    movs:r.movs.map(m=>({...m})),
    origenAuto:'ivaf29',periodoIVA:periodo,
  });
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>toast('❌ Error guardando en storage','e'));
  toast(`✅ Asiento N°${folio} — compensación IVA ${per} · ${resumen}`);
  logAccion('Generó compensación de IVA',`${per} · asiento N°${folio} · ${resumen}`);
  rerender();
  renderF29();
}
// Resumen anual PPM
function renderPPM(){
  const data=calcularF29Anual();
  const tasaPPM=(S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0);
  const el=document.getElementById('ppm-content');
  const totBase=data.reduce((s,d)=>s+d.basePPM,0);
  const totPPM=data.reduce((s,d)=>s+d.ppm,0);
  const rows=data.map(d=>`<tr${d.basePPM>0?'':' style="opacity:.4"'}>
    <td class="tl" style="font-size:12px">${MESES[d.m-1]}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(d.basePPM)}</td>
    <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(d.ppm)}</td>
  </tr>`).join('');
  el.innerHTML=`<div class="card" style="max-width:560px">
    <div class="info-tip" style="margin-bottom:14px">💰 PPM del ejercicio ${S.empresa.anio} — tasa <strong>${tasaPPM}%</strong> sobre ingresos brutos mensuales.${tasaPPM===0?' <span style="color:var(--warn)">Configura la tasa en Empresa.</span>':''}</div>
    <table><thead><tr><th class="tl">MES</th><th style="text-align:right">BASE (Ingresos brutos)</th><th style="text-align:right">PPM</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTAL AÑO</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totBase)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totPPM)}</td></tr></tfoot>
    </table>
  </div>`;
}


export {calcularF29Anual, renderF29, renderPPM,
        IVAC, calcularCompensacionIVA, renderCompensacionIVA, generarAsientoIVA,
        setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente, asientoIVAExistente};
