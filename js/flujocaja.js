// flujocaja.js
import {fmtC, today, dteV, dteC, MESES} from './core.js';
import {S} from './state.js';
import {buildMayor} from './reportes.js';
import {todosDocsVentas, todosDocsCompras} from './asientos.js';

let FC_VIEW='realizado';

// ═══ FASE 6: FLUJO DE CAJA ═══
// Cuentas de efectivo: caja y bancos (prefijo 1101)
const esCuentaEfectivo=cd=>cd.length===7&&cd.startsWith('1101');
function setFCView(v){
  FC_VIEW=v;
  document.getElementById('fc-tab-real').classList.toggle('active',v==='realizado');
  document.getElementById('fc-tab-proy').classList.toggle('active',v==='proyectado');
  renderFlujoCaja();
}
function renderFlujoCaja(){
  if(FC_VIEW==='proyectado')renderFlujoProyectado();
  else renderFlujoRealizado();
}
// FLUJO REALIZADO: entradas y salidas efectivas de las cuentas de caja/banco, por mes
function renderFlujoRealizado(){
  const anio=S.empresa.anio;
  const M=buildMayor();
  const el=document.getElementById('fc-content');
  // Saldo inicial de efectivo (de la apertura): saldo de cuentas 1101 al inicio
  // Movimientos por mes de las cuentas de efectivo
  const meses=Array.from({length:12},()=>({entradas:0,salidas:0}));
  let saldoInicial=0;
  Object.keys(M).filter(esCuentaEfectivo).forEach(cd=>{
    M[cd].movs.forEach(m=>{
      // Apertura → saldo inicial; resto → mes correspondiente
      if(m.glosa&&(m.glosa.includes('Apertura')||m.glosa.includes('apertura'))){
        saldoInicial+=(m.debe||0)-(m.haber||0);
        return;
      }
      const mesN=+(m.fecha||'').slice(5,7);
      if(mesN>=1&&mesN<=12){
        meses[mesN-1].entradas+=m.debe||0;
        meses[mesN-1].salidas+=m.haber||0;
      }
    });
  });
  // Construir tabla con saldo acumulado
  let saldo=saldoInicial,totE=0,totS=0;
  const rows=meses.map((m,i)=>{
    const neto=m.entradas-m.salidas;
    saldo+=neto;totE+=m.entradas;totS+=m.salidas;
    const vacio=m.entradas===0&&m.salidas===0;
    return `<tr${vacio?' style="opacity:.4"':''}>
      <td class="tl" style="font-size:12px">${MESES[i]}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--ach)">${m.entradas?fmtC(m.entradas):'–'}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${m.salidas?fmtC(m.salidas):'–'}</td>
      <td style="font-family:var(--mono);text-align:right;color:${neto>=0?'var(--ach)':'var(--err)'}">${fmtC(neto)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:600;color:${saldo>=0?'var(--tx)':'var(--err)'}">${fmtC(saldo)}</td>
    </tr>`;
  }).join('');
  const saldoFinal=saldo;
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Saldo Inicial</div><div class="kpi-val">${fmtC(saldoInicial)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Entradas</div><div class="kpi-val pos">${fmtC(totE)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Salidas</div><div class="kpi-val neg">${fmtC(totS)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Saldo Final</div><div class="kpi-val ${saldoFinal>=0?'pos':'neg'}">${fmtC(saldoFinal)}</div></div>
  </div>
  <div class="info-tip" style="margin-bottom:14px">💵 Movimiento real de efectivo (caja y bancos) durante ${anio}. Entradas = cargos al banco, Salidas = abonos. El saldo acumulado parte del saldo inicial de la apertura.</div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">MES</th><th style="text-align:right">ENTRADAS</th><th style="text-align:right">SALIDAS</th><th style="text-align:right">FLUJO NETO</th><th style="text-align:right">SALDO ACUM.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTAL AÑO</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(totE)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totS)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totE-totS)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(saldoFinal)}</td></tr></tfoot>
  </table></div></div>
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">Cuentas consideradas: Caja y Bancos (código 1101xxx).</div>`;
}
// FLUJO PROYECTADO: posición de caja futura según vencimientos por cobrar y por pagar
function renderFlujoProyectado(){
  const el=document.getElementById('fc-content');
  const hoy=today();
  const M=buildMayor();
  // Saldo de efectivo actual
  const saldoEfectivo=Object.keys(M).filter(esCuentaEfectivo).reduce((s,cd)=>s+M[cd].saldo,0);
  // Por cobrar: DTEs de clientes con saldo pendiente (usar vencimiento; si no hay, la fecha)
  // Por pagar: DTEs de proveedores + honorarios pendientes
  // Agrupar por "bucket" temporal según vencimiento
  const buckets={vencido:{cobrar:0,pagar:0},b30:{cobrar:0,pagar:0},b60:{cobrar:0,pagar:0},b90:{cobrar:0,pagar:0},futuro:{cobrar:0,pagar:0}};
  const clasificar=fechaVto=>{
    const d=Math.round((new Date(fechaVto+'T00:00:00')-new Date(hoy+'T00:00:00'))/86400000);
    if(d<0)return 'vencido';
    if(d<=30)return 'b30';
    if(d<=60)return 'b60';
    if(d<=90)return 'b90';
    return 'futuro';
  };
  // Cuentas por cobrar (clientes)
  todosDocsVentas().forEach(d=>{
    if(d.origen==='libro'&&d.formaPago!=='clientes')return; // solo crédito
    const signo=(dteV(d.tipoDTE)?.signo)||1;
    const monto=(d.total||0)*signo;
    if(monto<=0)return;
    const vto=d.fechaVencimiento||d.fecha;
    buckets[clasificar(vto)].cobrar+=monto;
  });
  // Cuentas por pagar (proveedores)
  todosDocsCompras().forEach(d=>{
    const signo=(dteC(d.tipoDTE)?.signo)||1;
    const monto=(d.total||0)*signo;
    if(monto<=0)return;
    const vto=d.fechaVencimiento||d.fecha;
    buckets[clasificar(vto)].pagar+=monto;
  });
  // Honorarios pendientes (retención se paga, líquido se paga)
  // (los honorarios ya registrados se consideran pagados en el mes; se omiten aquí por simplicidad)
  const orden=[
    {k:'vencido',lbl:'Vencido',color:'var(--err)'},
    {k:'b30',lbl:'0–30 días',color:'#d29922'},
    {k:'b60',lbl:'31–60 días',color:'#58a6ff'},
    {k:'b90',lbl:'61–90 días',color:'var(--info)'},
    {k:'futuro',lbl:'+90 días',color:'var(--mt)'},
  ];
  let saldoProy=saldoEfectivo,totCobrar=0,totPagar=0;
  const rows=orden.map(b=>{
    const c=buckets[b.k].cobrar,p=buckets[b.k].pagar,neto=c-p;
    saldoProy+=neto;totCobrar+=c;totPagar+=p;
    return `<tr>
      <td class="tl" style="font-size:12px"><span style="color:${b.color}">●</span> ${b.lbl}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--ach)">${c?fmtC(c):'–'}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${p?fmtC(p):'–'}</td>
      <td style="font-family:var(--mono);text-align:right;color:${neto>=0?'var(--ach)':'var(--err)'}">${fmtC(neto)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:600;color:${saldoProy>=0?'var(--tx)':'var(--err)'}">${fmtC(saldoProy)}</td>
    </tr>`;
  }).join('');
  const posicionFinal=saldoEfectivo+totCobrar-totPagar;
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Efectivo Actual</div><div class="kpi-val">${fmtC(saldoEfectivo)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Por Cobrar</div><div class="kpi-val pos">${fmtC(totCobrar)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Por Pagar</div><div class="kpi-val neg">${fmtC(totPagar)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Posición Proyectada</div><div class="kpi-val ${posicionFinal>=0?'pos':'neg'}">${fmtC(posicionFinal)}</div></div>
  </div>
  <div class="info-tip" style="margin-bottom:14px">🔮 Proyección de caja según vencimientos de documentos pendientes. Parte del efectivo actual (${fmtC(saldoEfectivo)}) y suma lo por cobrar menos lo por pagar en cada tramo.</div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">VENCIMIENTO</th><th style="text-align:right">POR COBRAR</th><th style="text-align:right">POR PAGAR</th><th style="text-align:right">FLUJO NETO</th><th style="text-align:right">POSICIÓN</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTAL</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(totCobrar)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totPagar)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totCobrar-totPagar)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(posicionFinal)}</td></tr></tfoot>
  </table></div></div>
  ${buckets.vencido.cobrar>0||buckets.vencido.pagar>0?`<div class="info-tip" style="margin-top:12px;background:rgba(248,81,73,.08);border-color:var(--err);font-size:11px">⚠️ Tienes ${fmtC(buckets.vencido.cobrar)} por cobrar y ${fmtC(buckets.vencido.pagar)} por pagar <strong>vencidos</strong> (fecha de vencimiento ya pasó).</div>`:''}
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">Proyección basada en fechas de vencimiento de los documentos. Los documentos sin vencimiento usan su fecha de emisión.</div>`;
}


export {FC_VIEW, esCuentaEfectivo, setFCView, renderFlujoCaja, renderFlujoRealizado, renderFlujoProyectado};
