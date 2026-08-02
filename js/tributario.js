// tributario.js — Formulario 29 (IVA mensual) y PPM
import {fmtC, MESES, IVA, RET_H, dteV, dteC} from './core.js';
import {todosDocsCompras, todosDocsVentas} from './asientos.js';
import {S} from './state.js';

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
    // Honorarios del mes → retención 10,75% (código 151)
    const honM=S.honorarios.filter(h=>h.mes===m);
    const retencionHon=Math.round(honM.reduce((s,h)=>s+ +(h.bruto||0),0)*RET_H);
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
      ${linea('151','Retención honorarios (10,75%)',d.retencionHon,{color:'var(--err)'})}
      <tr style="background:${d.totalPagar>0?'rgba(248,81,73,.12)':'rgba(46,160,67,.12)'}">
        <td style="font-family:var(--mono);font-size:11px;color:var(--mt)">91</td>
        <td class="tl" style="padding:11px;font-weight:700;font-size:14px">TOTAL A PAGAR</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:${d.totalPagar>0?'var(--err)':'var(--ach)'}">${fmtC(d.totalPagar)}</td>
      </tr>
    </tbody></table>
    ${d.tasaPPM===0&&(S.empresa.tasaPPM==null||+S.empresa.tasaPPM===0)?'<div class="info-tip" style="margin-top:12px;font-size:11px">⚠️ La tasa de PPM está en 0%. Configúrala en Empresa → Configuración Tributaria para que se calcule el PPM.</div>':''}
    <div style="margin-top:12px;font-size:10px;color:var(--mt)">Los códigos corresponden al Formulario 29 del SII. Este es un cálculo referencial basado en tus registros; verifica antes de declarar.</div>
  </div>`;
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


export {calcularF29Anual, renderF29, renderPPM};
