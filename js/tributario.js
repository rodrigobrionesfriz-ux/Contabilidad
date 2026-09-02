// tributario.js — Formulario 29 (IVA mensual), PPM y asiento de compensación de IVA
import {fmtC, fmt, MESES, IVA, dteV, dteC, PDC, pdcNm, toast} from './core.js';
import {retencionHonorarios, getIndicadores} from './indicadores.js';
import {todosDocsCompras, todosDocsVentas, proxFolioComprobante} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {buildMayor} from './reportes.js';
import {calcularLiquidacion, getUF, getUTM} from './remuneraciones.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {savePDC} from './pdc.js';
import {S} from './state.js';
import {periodoDoc} from './helpers.js';
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
    // Por PERIODO TRIBUTARIO: un DTE de agosto arrastrado al RCV de septiembre
    // se declara en el F29 de septiembre, no en el de agosto.
    const vs=todosDocsVentas().filter(d=>+periodoDoc(d).slice(5,7)===m);
    let ventasNetas=0,ventasExentas=0,debito=0;
    vs.forEach(d=>{
      const signo=(dteV(d.tipoDTE)?.signo)||1;
      ventasNetas+=(d.neto||0)*signo;
      ventasExentas+=(d.exento||0)*signo;
      debito+=(d.iva||0)*signo;
    });
    // Compras del mes (crédito fiscal)
    const cs=todosDocsCompras().filter(d=>+periodoDoc(d).slice(5,7)===m);
    let comprasNetas=0,credito=0,ivaRetenido=0;
    cs.forEach(d=>{
      const signo=(dteC(d.tipoDTE)?.signo)||1;
      comprasNetas+=(d.neto||0)*signo;
      credito+=(d.iva||0)*signo;
      // DTE 46 (factura de compra): el receptor RETIENE el IVA. Ese mismo monto
      // es crédito fiscal Y una retención que hay que enterar, así que suma a
      // ambos lados y su efecto neto sobre lo que se paga es cero. Si sólo se
      // contara como crédito, el IVA a pagar quedaría subestimado y la cuenta
      // IVA Débito Fiscal (donde el asiento automático acredita la retención)
      // arrastraría un saldo que nunca se salda.
      if(+d.tipoDTE===46)ivaRetenido+=(d.iva||0)*signo;
    });
    // Honorarios del mes → retención del año (código 151)
    const honM=S.honorarios.filter(h=>h.mes===m);
    const retencionHon=Math.round(honM.reduce((s,h)=>s+ +(h.bruto||0),0)*retencionHonorarios(S.empresa.anio));
    // IVA: crédito total = crédito del mes + remanente anterior
    // Débito total = débito de las ventas + IVA retenido en facturas de compra
    const creditoTotal=credito+remanenteAnt;
    const debitoTotal=debito+ivaRetenido;
    const ivaDeterminado=debitoTotal-creditoTotal;
    let ivaAPagar=0,remanente=0;
    if(ivaDeterminado>0){ivaAPagar=ivaDeterminado;remanente=0;}
    else{ivaAPagar=0;remanente=-ivaDeterminado;}
    // PPM sobre ingresos brutos (netos + exentos de explotación)
    const basePPM=ventasNetas+ventasExentas;
    const ppm=Math.round(basePPM*tasaPPM);
    // Total a pagar en el F29
    const totalPagar=ivaAPagar+ppm+retencionHon;
    meses.push({m,ventasNetas,ventasExentas,debito,ivaRetenido,debitoTotal,comprasNetas,credito,remanenteAnt,creditoTotal,ivaDeterminado,ivaAPagar,remanente,basePPM,ppm,retencionHon,totalPagar,nDocsV:vs.length,nDocsC:cs.length});
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
      ${linea('538','Débito fiscal IVA (19%)',d.debito,{bold:!d.ivaRetenido})}
      ${d.ivaRetenido?linea('39','IVA retenido facturas de compra (cambio de sujeto)',d.ivaRetenido,{color:'var(--info)'})+linea('','Débito fiscal total',d.debitoTotal,{bold:true}):''}
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
  <div id="ivac-content" style="max-width:760px"></div>
  <div id="pagof29-content" style="max-width:900px"></div>`;
  renderCompensacionIVA();
  renderPagoF29();
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
  // Recalcular la determinación con el remanente reajustado.
  // El débito a saldar incluye el IVA retenido en facturas de compra, porque el
  // asiento automático de compras lo acredita en la misma cuenta de débito.
  const creditoTotal=d.credito+remanenteReaj;
  const determinado=d.debitoTotal-creditoTotal;
  const ivaAPagar=determinado>0?determinado:0;
  const remanenteNuevo=determinado<0?-determinado:0;
  // Movimiento neto de la cuenta de remanente en el período
  const deltaRem=remanenteNuevo-d.remanenteAnt;

  const movs=[];
  const nm=cd=>pdcNm(cd)||cd;
  const per=`${MESES[mes-1]} ${anio}`;
  // 1) Se salda el IVA Débito Fiscal acumulado en el mes (ventas + IVA retenido
  //    en facturas de compra, que el asiento de compras acredita en esta cuenta)
  if(d.debitoTotal>0)movs.push({cd:c.debito,nm:nm(c.debito),debe:Math.round(d.debitoTotal),haber:0,
    desc:`Débito fiscal ${per} (F29 cód. 538${d.ivaRetenido?` + ${fmtC(d.ivaRetenido)} retenido en facturas de compra`:''})`});
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
      ${d.ivaRetenido?`<tr><td class="tl" style="font-size:12px;color:var(--info)">IVA retenido en facturas de compra (cambio de sujeto)</td><td style="font-family:var(--mono);color:var(--info)">${fmtC(d.ivaRetenido)}</td></tr>`:''}
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
      Las retenciones (honorarios, impuesto único, cambio de sujeto) <strong>no</strong> se incluyen acá: se registran al momento de cada operación y se cancelan en el asiento de pago del F29, más abajo.
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
    +(r.d.ivaRetenido?`IVA retenido:    ${fmtC(r.d.ivaRetenido)} (facturas de compra)\n`:'')
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


// ═══════════════════════════════════════════════════════════════════════
// ASIENTO DE PAGO DEL F29
// ═══════════════════════════════════════════════════════════════════════
//
// El F29 no paga sólo IVA: en el mismo formulario se enteran las retenciones
// que la empresa practicó durante el mes actuando como agente retenedor.
// El asiento de pago cancela esos pasivos contra banco/caja:
//
//   DEBE   IVA determinado a pagar .................... cód. 89
//   DEBE   PPM Primera Categoría ...................... cód. 62
//   DEBE   Retención boletas de honorarios recibidas .. cód. 151 (Art. 42 N°2)
//   DEBE   Retención boletas de servicios de terceros . cód. 151 (BTE)
//   DEBE   Impuesto Único de Segunda Categoría ........ cód. 48 (Art. 74 N°1)
//   DEBE   IVA retenido en facturas de compra ......... cambio de sujeto
//   DEBE   Multas, reajustes e intereses (si paga fuera de plazo) → gasto
//     HABER  Banco / Caja ............................. total enterado
//
// Los montos se proponen desde el propio F29 del período (y desde las
// liquidaciones, para el impuesto único), pero cada línea es editable: lo que
// manda es lo efectivamente declarado.

const PAGOF29_DEFAULT={
  iva:'2104002',          // IMPUESTOS POR PAGAR
  ivaRetenido:'2103003',  // IVA DÉBITO FISCAL (es donde el sistema acredita la retención del DTE 46)
  ppm:'1108001',          // PAGOS PROVISIONALES MENSUALES (activo: anticipo de impuesto renta)
  honorarios:'2103002',   // RETENCIÓN 2º CATEGORÍA
  bte:'2103002',          // RETENCIÓN 2º CATEGORÍA
  iusc:'2104002',         // IMPUESTOS POR PAGAR (donde lo acredita el asiento de remuneraciones)
  multas:'3403001',       // OTROS GASTOS NO OPERACIONALES
  banco:'1101201',        // BANCO ESTADO
};
const PAGOF29={cuentas:{...PAGOF29_DEFAULT},montos:{},incluir:null,fecha:'',glosa:'',periodo:''};

// Conceptos que se enteran con el F29. `on` es el estado inicial del checkbox.
const CONCEPTOS_F29=[
  {k:'iva',lbl:'IVA determinado a pagar',cod:'89',on:true},
  {k:'ivaRetenido',lbl:'IVA retenido en facturas de compra (cambio de sujeto)',cod:'',on:false,
   nota:'El sistema acredita esta retención en IVA Débito Fiscal, así que <strong>ya viene incluida dentro del IVA a pagar</strong> de la compensación. Actívala sólo si la llevas en una cuenta separada.'},
  {k:'ppm',lbl:'PPM Primera Categoría',cod:'62',on:true,
   nota:'Va al activo <strong>Pagos Provisionales Mensuales</strong>: es un anticipo de impuesto a la renta, no un gasto. Si ya lo provisionaste en el asiento de compensación, apunta esta línea a la cuenta de provisión.'},
  {k:'honorarios',lbl:'Retención boletas de honorarios recibidas',cod:'151',on:true},
  {k:'bte',lbl:'Retención boletas de servicios de terceros (BTE)',cod:'151',on:false,
   nota:'El sistema no registra BTE todavía: ingresa el monto a mano si emitiste boletas por cuenta de terceros.'},
  {k:'iusc',lbl:'Impuesto Único de Segunda Categoría (trabajadores)',cod:'48',on:false,
   nota:'Se estima con las liquidaciones vigentes en Remuneraciones; si no hay trabajadores cargados, ingrésalo a mano. El asiento de remuneraciones lo acredita hoy en <strong>Impuestos por Pagar</strong>, la misma cuenta del IVA: por eso el pendiente aparece mezclado.'},
  {k:'multas',lbl:'Multas, reajustes e intereses por pago fuera de plazo',cod:'',on:false,gasto:true,
   nota:'Va a resultado, no es un pasivo previo: sólo si pagas fuera de plazo.'},
];

// IVA retenido en facturas de compra (DTE 46) del período
function ivaRetenidoDTE46(mes){
  return Math.round(todosDocsCompras()
    .filter(d=>+d.tipoDTE===46&&+periodoDoc(d).slice(5,7)===mes)
    .reduce((s,d)=>s+(d.iva||0)*((dteC(d.tipoDTE)?.signo)||1),0));
}
// Impuesto único estimado con las liquidaciones vigentes
function iuscEstimado(){
  try{
    const uf=getUF(),utm=getUTM();
    return Math.round((S.trabajadores||[]).reduce((s,t)=>s+(calcularLiquidacion(t,uf,utm).iusc||0),0));
  }catch(e){return 0;}
}

// Montos sugeridos por concepto para un mes
function montosSugeridosF29(mes){
  const d=calcularF29Anual()[mes-1];
  const comp=calcularCompensacionIVA(mes);   // respeta el reajuste configurado arriba
  return {
    iva:comp.ivaAPagar,
    ivaRetenido:ivaRetenidoDTE46(mes),
    ppm:d.ppm,
    honorarios:d.retencionHon,
    bte:0,
    iusc:iuscEstimado(),
    multas:0,
  };
}

// Saldo pendiente (acreedor) de una cuenta a la fecha de pago
function saldoPendiente(M,cd){
  const a=M[cd];
  if(!a)return 0;
  return -a.saldo;   // pasivo: saldo negativo (debe−haber) ⇒ pendiente positivo
}

function asientoPagoExistente(periodo){
  return (S.asientos||[]).find(a=>!a.anulado&&a.origenAuto==='pagof29'&&a.periodoIVA===periodo)||null;
}

// Fecha legal de pago: día 12 del mes siguiente al período
function fechaPagoDefault(anio,mes){
  const y=mes===12?anio+1:anio, m=mes===12?1:mes+1;
  return `${y}-${String(m).padStart(2,'0')}-12`;
}

function setPagoF29Cuenta(k,cd){PAGOF29.cuentas[k]=cd;renderPagoF29();}
function setPagoF29Campo(k,v){PAGOF29[k]=v;renderPagoF29();}
function setPagoF29Monto(k,v){PAGOF29.montos[k]=Math.max(0,Math.round(+v||0));renderPagoF29();}
function togglePagoF29(k,on){PAGOF29.incluir[k]=!!on;renderPagoF29();}
function resetPagoF29(){
  PAGOF29.cuentas={...PAGOF29_DEFAULT};PAGOF29.montos={};
  PAGOF29.incluir=Object.fromEntries(CONCEPTOS_F29.map(c=>[c.k,c.on]));
  renderPagoF29();
}
// Repone en una línea el monto sugerido por el sistema
function usarSugeridoF29(k){delete PAGOF29.montos[k];renderPagoF29();}

// Arma las líneas del asiento de pago
function calcularPagoF29(mes){
  const sug=montosSugeridosF29(mes);
  const anio=S.empresa.anio;
  const per=`${MESES[mes-1]} ${anio}`;
  const nm=cd=>pdcNm(cd)||cd;
  const movs=[];
  let total=0;
  CONCEPTOS_F29.forEach(c=>{
    if(!PAGOF29.incluir[c.k])return;
    const monto=PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:sug[c.k];
    if(!monto||monto<=0)return;
    const cd=PAGOF29.cuentas[c.k];
    movs.push({cd,nm:nm(cd),debe:Math.round(monto),haber:0,
      desc:`${c.lbl}${c.cod?` (F29 cód. ${c.cod})`:''} — ${per}`});
    total+=Math.round(monto);
  });
  if(total>0){
    const cb=PAGOF29.cuentas.banco;
    movs.push({cd:cb,nm:nm(cb),debe:0,haber:total,desc:`Pago F29 ${per}`});
  }
  const tD=movs.reduce((s,m)=>s+m.debe,0),tH=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,tD,tH,total,sug,cuadra:Math.abs(tD-tH)<1};
}

function renderPagoF29(){
  const el=document.getElementById('pagof29-content');if(!el)return;
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  if(!PAGOF29.incluir)PAGOF29.incluir=Object.fromEntries(CONCEPTOS_F29.map(c=>[c.k,c.on]));
  if(PAGOF29.periodo!==periodo){PAGOF29.periodo=periodo;PAGOF29.fecha='';PAGOF29.glosa='';PAGOF29.montos={};}

  const r=calcularPagoF29(mes);
  const yaExiste=asientoPagoExistente(periodo);
  const fecha=PAGOF29.fecha||fechaPagoDefault(anio,mes);
  const glosa=PAGOF29.glosa||`Pago F29 ${MESES[mes-1]} ${anio}`;
  // Saldos del mayor hasta la fecha de pago, como referencia de lo pendiente
  const M=buildMayor(undefined,fecha);
  // Cuentas usadas por más de un concepto activo: su saldo es compartido
  const usoCuenta={};
  CONCEPTOS_F29.forEach(c=>{if(PAGOF29.incluir[c.k]&&!c.gasto)usoCuenta[PAGOF29.cuentas[c.k]]=(usoCuenta[PAGOF29.cuentas[c.k]]||0)+1;});

  const filas=CONCEPTOS_F29.map(c=>{
    const on=!!PAGOF29.incluir[c.k];
    const monto=PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:r.sug[c.k];
    const editado=PAGOF29.montos[c.k]!=null&&PAGOF29.montos[c.k]!==r.sug[c.k];
    const cd=PAGOF29.cuentas[c.k];
    const pend=c.gasto?null:saldoPendiente(M,cd);
    const compartida=!c.gasto&&usoCuenta[cd]>1;
    return `<tr style="${on?'':'opacity:.45'}">
      <td style="text-align:center;width:26px"><input type="checkbox" ${on?'checked':''} onchange="togglePagoF29('${c.k}',this.checked)" style="width:auto"></td>
      <td class="tnm" style="font-size:12px">
        ${c.lbl}${c.cod?` <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">cód. ${c.cod}</span>`:''}
        ${c.nota?`<div style="font-size:10px;color:var(--mt);line-height:1.45;margin-top:2px">${c.nota}</div>`:''}
      </td>
      <td style="width:250px">${inputCuenta({id:'pf29-cd-'+c.k,value:cd||'',onPick:`setPagoF29Cuenta('${c.k}','%CD%')`,placeholder:'Cuenta…',clase:'linea-inp'})}</td>
      <td style="width:130px"><input type="number" value="${monto||0}" onchange="setPagoF29Monto('${c.k}',this.value)" style="text-align:right;font-family:var(--mono)"></td>
      <td style="width:150px;font-size:10px;color:var(--mt);text-align:right">
        ${editado?`<div><button class="btn btn-g" style="padding:1px 6px;font-size:9px" onclick="usarSugeridoF29('${c.k}')">↺ ${fmtC(r.sug[c.k])}</button></div>`:''}
        ${pend!==null?`<div title="Saldo acreedor de la cuenta al ${fecha}">Pendiente: ${fmtC(pend)}${compartida?' <span style="color:var(--warn)" title="Otro concepto usa la misma cuenta: el saldo es compartido">⚠</span>':''}</div>`:'<div>—</div>'}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML=`<div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      <div>
        <div style="font-size:15px;font-weight:700">🏦 Asiento de pago del F29</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">Cancela los impuestos y retenciones del período ${MESES[mes-1]} ${anio} contra banco o caja</div>
      </div>
      ${yaExiste?`<span class="badge br">⚠️ Ya generado — Asiento N°${yaExiste.n}</span>`:''}
    </div>

    <div class="info-tip" style="margin:10px 0 14px;font-size:11px;line-height:1.6">
      📘 En el F29 no se entera sólo el IVA: también las <strong>retenciones que la empresa practicó como agente retenedor</strong>
      durante el mes — boletas de honorarios recibidas (Art. 42 N°2), boletas de servicios de terceros, el Impuesto Único de
      Segunda Categoría de los trabajadores (Art. 74 N°1) y el IVA retenido en facturas de compra por cambio de sujeto.
      Todos son pasivos que ya se registraron al momento de la operación: este asiento sólo los <strong>cancela contra banco</strong>.
      Los montos se proponen desde el F29 del período, pero manda lo efectivamente declarado: edítalos si difieren.
    </div>

    <div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th style="width:26px"></th><th class="tl">CONCEPTO</th><th class="tl">CUENTA</th><th style="text-align:right">MONTO</th><th style="text-align:right">REFERENCIA</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td colspan="3" class="tl">TOTAL A ENTERAR</td>
        <td style="font-family:var(--mono);font-weight:700;color:${r.total>0?'var(--err)':'var(--mt)'}">${fmtC(r.total)}</td><td></td></tr></tfoot>
    </table></div></div>

    <div class="fg" style="margin-bottom:12px">
      <div class="grp"><label>Fecha de pago</label>
        <input type="date" value="${fecha}" onchange="setPagoF29Campo('fecha',this.value)">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Por defecto el día 12 del mes siguiente</div></div>
      <div class="grp"><label>Glosa</label>
        <input type="text" value="${glosa.replace(/"/g,'&quot;')}" onchange="setPagoF29Campo('glosa',this.value)"></div>
      <div class="grp"><label>Cuenta de pago (banco o caja)</label>
        ${inputCuenta({id:'pf29-cd-banco',value:PAGOF29.cuentas.banco||'',onPick:"setPagoF29Cuenta('banco','%CD%')",placeholder:'Buscar cuenta…',clase:'linea-inp'})}</div>
      <div class="grp" style="justify-content:flex-end">
        <button class="btn btn-g" style="font-size:11px" onclick="resetPagoF29()">↺ Cuentas y montos por defecto</button></div>
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Previsualización del asiento</div>
    ${r.movs.length?`<div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th class="tl" style="width:82px">CÓD.</th><th class="tl">CUENTA</th><th style="width:130px">DEBE</th><th style="width:130px">HABER</th></tr></thead>
      <tbody>${r.movs.map(m=>`<tr>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${m.cd}</td>
        <td class="tnm" style="font-size:12px">${m.nm}<div style="font-size:10px;color:var(--mt)">${m.desc}</div></td>
        <td style="font-family:var(--mono)">${m.debe?fmtC(m.debe):'–'}</td>
        <td style="font-family:var(--mono)">${m.haber?fmtC(m.haber):'–'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="tl" colspan="2">TOTALES</td>
        <td style="font-family:var(--mono)">${fmtC(r.tD)}</td><td style="font-family:var(--mono)">${fmtC(r.tH)}</td></tr></tfoot>
    </table></div></div>
    <div style="font-size:12px;color:${r.cuadra?'var(--ach)':'var(--err)'};margin-bottom:12px">
      ${r.cuadra?'✅ Asiento cuadrado — Debe = Haber = '+fmtC(r.tD):'⚠️ Descuadre de '+fmtC(Math.abs(r.tD-r.tH))}
    </div>`
    :`<div style="text-align:center;padding:24px;color:var(--mt);font-size:12px">No hay montos que enterar en ${MESES[mes-1]} ${anio}. Marca al menos un concepto con monto mayor a cero.</div>`}

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-p" onclick="generarAsientoPagoF29()" ${(!r.movs.length||!r.cuadra)?'disabled style="opacity:.5;cursor:not-allowed"':''}>
        🏦 ${yaExiste?'Generar de nuevo':'Generar asiento de pago'}
      </button>
    </div>
  </div>`;
}

function generarAsientoPagoF29(){
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  const r=calcularPagoF29(mes);
  if(!r.movs.length){toast('⚠️ No hay montos que enterar','e');return;}
  if(!r.cuadra){toast('⚠️ El asiento no cuadra — revisa las cuentas','e');return;}
  const faltantes=[...new Set(r.movs.filter(m=>!PDC.some(x=>x.cd===m.cd)).map(m=>m.cd))];
  if(faltantes.length){toast(`⚠️ Estas cuentas no existen en el plan: ${faltantes.join(', ')}`,'e');return;}

  const yaExiste=asientoPagoExistente(periodo);
  const per=`${MESES[mes-1]} ${anio}`;
  const detalle=r.movs.filter(m=>m.debe>0)
    .map(m=>`  ${m.cd} ${m.nm}: ${fmtC(m.debe)}`).join('\n');
  const msg=(yaExiste?`⚠️ Ya existe el asiento N°${yaExiste.n} de pago de ${per}.\nSe creará OTRO (anula el anterior si corresponde).\n\n`:'')
    +`Pago F29 — ${per}\n\n${detalle}\n\nTotal a pagar: ${fmtC(r.total)}\nContra: ${pdcNm(PAGOF29.cuentas.banco)||PAGOF29.cuentas.banco}\n\n¿Generar el asiento?`;
  if(!confirm(msg))return;

  const folio=proxFolioComprobante();
  const fecha=PAGOF29.fecha||fechaPagoDefault(anio,mes);
  const glosa=PAGOF29.glosa||`Pago F29 ${per}`;
  S.asientos.push({
    id:'as_pagof29_'+Date.now(),n:folio,folioComp:folio,fecha,glosa,
    movs:r.movs.map(m=>({...m})),
    origenAuto:'pagof29',periodoIVA:periodo,
  });
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>toast('❌ Error guardando en storage','e'));
  toast(`✅ Asiento N°${folio} — pago F29 ${per} · ${fmtC(r.total)}`);
  logAccion('Generó pago de F29',`${per} · asiento N°${folio} · ${fmtC(r.total)}`);
  rerender();
  renderF29();
}

export {calcularF29Anual, renderF29, renderPPM,
        IVAC, calcularCompensacionIVA, renderCompensacionIVA, generarAsientoIVA,
        setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente, asientoIVAExistente,
        PAGOF29, CONCEPTOS_F29, calcularPagoF29, montosSugeridosF29, renderPagoF29, generarAsientoPagoF29,
        setPagoF29Cuenta, setPagoF29Campo, setPagoF29Monto, togglePagoF29, resetPagoF29, usarSugeridoF29,
        ivaRetenidoDTE46, asientoPagoExistente};
