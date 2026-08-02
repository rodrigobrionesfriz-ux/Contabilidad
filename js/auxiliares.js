// auxiliares.js — Auxiliares por cliente/proveedor + aging
import {toast, fmtC, fmt, MESES, pdcNm, rutFmt, dteV, dteC} from './core.js';
import {S} from './state.js';
import {todosDocsVentas, todosDocsCompras} from './asientos.js';

let AUX_TAB='c';       // 'c'=clientes | 'p'=proveedores
let AUX_VIEW='detalle';// 'detalle' | 'aging'

// ═══ AUXILIARES ═══
function setAuxTab(t){
  AUX_TAB=t;
  document.getElementById('aux-tab-c').classList.toggle('active',t==='c');
  document.getElementById('aux-tab-p').classList.toggle('active',t==='p');
  renderAuxiliares();
}
function setAuxView(v){
  AUX_VIEW=v;
  document.getElementById('aux-view-detalle').classList.toggle('active',v==='detalle');
  document.getElementById('aux-view-aging').classList.toggle('active',v==='aging');
  renderAuxiliares();
}
function toggleAux(id){
  const el=document.getElementById(id);if(!el)return;
  const card=el.closest('.aux-card');
  el.classList.toggle('open');
  if(card)card.classList.toggle('open');
}
function renderAuxiliares(){
  // Cuenta por cada RUT:
  //  - Todos los DTEs (del libro directo + los asociados a asientos manuales)
  //  - Los movimientos manuales SIN DTE (pagos, ajustes, etc.)
  const clientes={},proveedores={};

  // 1) DTEs unificados — CLIENTES (solo los con formaPago='clientes' del libro; los del asiento siempre entran)
  todosDocsVentas().forEach(d=>{
    if(d.origen==='libro'&&d.formaPago!=='clientes')return; // ventas contado no van al auxiliar
    const k=d.rutCodigo;if(!k)return;
    if(!clientes[k])clientes[k]={rutCodigo:k,rutDV:d.rutDV,razonSocial:d.razonSocial||'',docs:[],total:0};
    const signo=(dteV(d.tipoDTE)?.signo)||1;
    const tot=(d.total||0)*signo;
    clientes[k].docs.push({tipo:'doc',origen:d.origen,asientoId:d.asientoId,asientoN:d.asientoN,fecha:d.fecha,fechaVencimiento:d.fechaVencimiento,tipoDTE:d.tipoDTE,numero:d.numero,neto:d.neto,iva:d.iva,total:d.total,montoSigno:tot,debe:tot>0?tot:0,haber:tot<0?-tot:0});
    clientes[k].total+=tot;
    if(d.razonSocial)clientes[k].razonSocial=d.razonSocial;
  });

  // 2) DTEs unificados — PROVEEDORES (todos los del libro + los del asiento)
  todosDocsCompras().forEach(d=>{
    const k=d.rutCodigo;if(!k)return;
    if(!proveedores[k])proveedores[k]={rutCodigo:k,rutDV:d.rutDV,razonSocial:d.razonSocial||'',docs:[],total:0};
    const signo=(dteC(d.tipoDTE)?.signo)||1;
    const tot=(d.total||0)*signo;
    proveedores[k].docs.push({tipo:'doc',origen:d.origen,asientoId:d.asientoId,asientoN:d.asientoN,fecha:d.fecha,fechaVencimiento:d.fechaVencimiento,tipoDTE:d.tipoDTE,numero:d.numero,neto:d.neto,iva:d.iva,total:d.total,dist:d.dist,montoSigno:tot,debe:tot<0?-tot:0,haber:tot>0?tot:0});
    proveedores[k].total+=tot;
    if(d.razonSocial)proveedores[k].razonSocial=d.razonSocial;
  });

  // 3) Movimientos manuales SIN DTE (pagos, ajustes) — solo los que NO tienen .dte
  S.asientos.forEach(a=>{
    if(a.anulado)return;
    (a.movs||[]).forEach(m=>{
      if(!m.rutCodigo||!esAux(m.cd))return;
      if(m.dte)return; // ya contado en paso 1/2 como DTE
      const tipo=CUENTAS_AUX[m.cd];
      const bucket=tipo==='cliente'?clientes:proveedores;
      const k=m.rutCodigo;
      if(!bucket[k])bucket[k]={rutCodigo:k,rutDV:m.rutDV,razonSocial:m.razonSocial||'',docs:[],total:0};
      const mov=tipo==='cliente'?(m.debe||0)-(m.haber||0):(m.haber||0)-(m.debe||0);
      bucket[k].docs.push({tipo:'manual',fecha:a.fecha,glosa:a.glosa,asientoId:a.id,asientoN:a.n,desc:m.desc||'',debe:m.debe||0,haber:m.haber||0,montoSigno:mov});
      bucket[k].total+=mov;
      if(m.razonSocial)bucket[k].razonSocial=m.razonSocial;
    });
  });

  // Contadores en tabs
  document.getElementById('aux-ct-c').textContent=Object.keys(clientes).length;
  document.getElementById('aux-ct-p').textContent=Object.keys(proveedores).length;

  const el=document.getElementById('aux-content');
  const data=AUX_TAB==='c'?clientes:proveedores;

  // Vista Aging
  if(AUX_VIEW==='aging'){renderAuxAging(data);return;}
  const keys=Object.keys(data).sort((a,b)=>(data[b].total-data[a].total));
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';
  const tipoIco=AUX_TAB==='c'?'📇':'🏭';
  const cuentaLbl=AUX_TAB==='c'?'CLIENTES (01.01.03)':'PROVEEDORES (02.01.03)';
  const saldoLbl=AUX_TAB==='c'?'Por Cobrar':'Por Pagar';

  if(!keys.length){
    el.innerHTML=`<div class="empty"><div class="ei">${tipoIco}</div>No hay ${tipoLbl} registrados aún.${AUX_TAB==='c'?'<br><br>Los clientes aparecen automáticamente al registrar ventas con forma de pago <strong>Crédito Cliente</strong>, o al hacer un asiento manual que cargue/abone la cuenta <strong>01.01.03 CLIENTES</strong>.':'<br><br>Los proveedores aparecen automáticamente al registrar documentos en el Libro de Compras, o al hacer un asiento manual que cargue/abone la cuenta <strong>02.01.03 PROVEEDORES</strong>.'}</div>`;
  return;
  }

  const total=keys.reduce((s,k)=>s+data[k].total,0);
  let h=`<div class="info-tip" style="margin-bottom:14px">💡 Sub-libro auxiliar de <strong>${cuentaLbl}</strong> — ${keys.length} ${tipoLbl} · <strong>${saldoLbl}: ${fmtC(total)}</strong></div>`;

  keys.forEach(k=>{
    const a=data[k];
    const docs=[...a.docs].sort((x,y)=>x.fecha.localeCompare(y.fecha));
    const bodyId='auxb_'+k;
    let saldo=0;
    const rows=docs.map(d=>{
      saldo+=d.montoSigno;
      if(d.tipo==='doc'){
        const dteInfo=AUX_TAB==='c'?dteV(d.tipoDTE):dteC(d.tipoDTE);
        const dteNm=dteInfo?.nm||'';
        const signo=dteInfo?.signo||1;
        const neg=signo<0;
        const origenBadge=d.origen==='asiento'?`<span style="color:var(--info);font-size:9px;margin-left:5px;cursor:pointer" onclick="abrirAsientoDesde('${d.asientoId}')">✏ Asiento N°${d.asientoN}</span>`:'';
        const vence=d.fechaVencimiento?`<span style="color:var(--mt);font-size:9px;margin-left:4px">(vto: ${d.fechaVencimiento})</span>`:'';
        return `<tr${neg?' style="color:var(--err)"':''}>
          <td class="tl" style="font-family:var(--mono);font-size:10px">${d.fecha}${vence}</td>
          <td class="tl" style="font-size:11px">DTE ${d.tipoDTE}<span style="color:var(--mt);margin-left:5px;font-size:10px">${dteNm.slice(0,16)} N°${d.numero||''}</span>${origenBadge}</td>
          <td>${d.debe?fmt(d.debe):'–'}</td>
          <td>${d.haber?fmt(d.haber):'–'}</td>
          <td style="font-weight:600;color:${saldo>=0?'var(--ach)':'var(--err)'}">${fmtC(saldo)}</td>
        </tr>`;
      }else{
        // Movimiento manual sin DTE (pagos, ajustes)
        return `<tr style="background:rgba(88,166,255,.04)">
          <td class="tl" style="font-family:var(--mono);font-size:10px">${d.fecha}</td>
          <td class="tl" style="font-size:11px"><span style="color:var(--info);font-weight:600;cursor:pointer" onclick="abrirAsientoDesde('${d.asientoId}')">💰 Pago — Asiento N°${d.asientoN||''}</span><div style="color:var(--mt);font-size:10px;margin-top:1px">${d.glosa||''}${d.desc?' — '+d.desc:''}</div></td>
          <td>${d.debe?fmt(d.debe):'–'}</td>
          <td>${d.haber?fmt(d.haber):'–'}</td>
          <td style="font-weight:600;color:${saldo>=0?'var(--ach)':'var(--err)'}">${fmtC(saldo)}</td>
        </tr>`;
      }
    }).join('');

    h+=`<div class="aux-card">
      <div class="aux-hdr" onclick="toggleAux('${bodyId}')">
        <div class="aux-rut">${rutFmt(a.rutCodigo,a.rutDV)}</div>
        <div class="aux-rs">${a.razonSocial||'(sin razón social)'}</div>
        <div style="font-size:11px;color:var(--mt);font-family:var(--mono);text-align:right">${docs.length} mov</div>
        <div style="font-family:var(--mono);font-weight:700;text-align:right;color:${a.total>=0?'var(--ach)':'var(--err)'}">${fmtC(a.total)}</div>
        <div class="aux-chev">▸</div>
      </div>
      <div class="aux-body" id="${bodyId}">
        <table style="font-size:11px;margin-top:10px">
          <thead><tr><th class="tl">FECHA</th><th class="tl">CONCEPTO</th><th>DEBE</th><th>HABER</th><th>SALDO</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td class="tl" colspan="4">${saldoLbl} (saldo acumulado)</td><td style="font-weight:700;color:${a.total>=0?'var(--ach)':'var(--err)'}">${fmtC(a.total)}</td></tr></tfoot>
        </table>
      </div>
    </div>`;
  });
  el.innerHTML=h;
}

// ═══ AGING (antigüedad de saldos) ═══
// Buckets por días de atraso desde la fecha del documento. Lógica FIFO:
// los pagos/abonos se imputan a las facturas más antiguas primero.
const AGING_BUCKETS=[
  {k:'aldia', lbl:'Al día',   min:-1e9,max:0,   color:'var(--ach)'},
  {k:'b30',   lbl:'1–30',     min:1,   max:30,  color:'#58a6ff'},
  {k:'b60',   lbl:'31–60',    min:31,  max:60,  color:'#d29922'},
  {k:'b90',   lbl:'61–90',    min:61,  max:90,  color:'#db6d28'},
  {k:'b120',  lbl:'91–120',   min:91,  max:120, color:'#f85149'},
  {k:'bmas',  lbl:'+120',     min:121, max:1e9, color:'#da3633'},
];
function diasEntre(f1,f2){
  return Math.round((new Date(f2+'T00:00:00')-new Date(f1+'T00:00:00'))/86400000);
}
// data: objeto { rut: {rutCodigo,rutDV,razonSocial,docs:[{montoSigno,fecha,...}], total} }
// tipo cliente: cargo = montoSigno>0 (factura), abono = montoSigno<0 (pago)
// tipo proveedor: en su data.docs, factura = montoSigno>0 también (por cómo se arma), abono<0
function calcularAging(data){
  const hoy=today();
  const res={rows:[],tot:{},total:0};
  AGING_BUCKETS.forEach(b=>res.tot[b.k]=0);
  Object.keys(data).forEach(k=>{
    const a=data[k];
    // Separar cargos (facturas, montoSigno>0) y abonos (pagos, montoSigno<0), orden cronológico
    const movs=[...a.docs].sort((x,y)=>x.fecha.localeCompare(y.fecha));
    const facturas=movs.filter(m=>m.montoSigno>0).map(m=>({fecha:m.fecha,fechaVto:m.fechaVencimiento||m.fecha,resto:m.montoSigno,ref:m}));
    let abono=movs.filter(m=>m.montoSigno<0).reduce((s,m)=>s+(-m.montoSigno),0);
    // FIFO: aplicar abonos a facturas más antiguas
    for(const f of facturas){
      if(abono<=0)break;
      const pagar=Math.min(abono,f.resto);
      f.resto-=pagar;abono-=pagar;
    }
    // Clasificar el resto de cada factura por antigüedad (usa vencimiento si existe, si no la fecha)
    const buckets={};AGING_BUCKETS.forEach(b=>buckets[b.k]=0);
    let saldoRut=0;
    for(const f of facturas){
      if(f.resto<=0.5)continue;
      const refFecha=f.fechaVto||f.fecha;
      const d=diasEntre(refFecha,hoy);
      const b=AGING_BUCKETS.find(x=>d>=x.min&&d<=x.max)||AGING_BUCKETS[0];
      buckets[b.k]+=f.resto;saldoRut+=f.resto;
    }
    // Si quedó abono sin imputar (saldo a favor), reflejarlo en "al día" como negativo
    if(abono>0.5){buckets.aldia-=abono;saldoRut-=abono;}
    if(Math.abs(saldoRut)<0.5)return; // sin saldo pendiente, omitir
    AGING_BUCKETS.forEach(b=>res.tot[b.k]+=buckets[b.k]);
    res.total+=saldoRut;
    res.rows.push({rutCodigo:a.rutCodigo,rutDV:a.rutDV,razonSocial:a.razonSocial,buckets,saldo:saldoRut,facturas:facturas.filter(f=>f.resto>0.5)});
  });
  res.rows.sort((x,y)=>Math.abs(y.saldo)-Math.abs(x.saldo));
  return res;
}
function toggleAgingDetalle(id){
  const el=document.getElementById(id);if(el)el.classList.toggle('open');
}
function renderAuxAging(data){
  const el=document.getElementById('aux-content');
  const ag=calcularAging(data);
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';
  const saldoLbl=AUX_TAB==='c'?'Por Cobrar':'Por Pagar';
  const hoy=today();
  if(!ag.rows.length){
    el.innerHTML=`<div class="empty"><div class="ei">📊</div>No hay saldos pendientes de ${tipoLbl}.</div>`;return;
  }
  // Cards resumen por bucket
  let cards=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">`;
  AGING_BUCKETS.forEach(b=>{
    const v=ag.tot[b.k];
    const pct=ag.total?Math.round(Math.abs(v)/Math.abs(ag.total)*100):0;
    cards+=`<div style="background:var(--cd,#161b22);border:1px solid var(--bd);border-left:3px solid ${b.color};border-radius:8px;padding:10px 12px">
      <div style="font-size:10px;color:var(--mt);text-transform:uppercase;font-weight:700">${b.lbl} días</div>
      <div style="font-family:var(--mono);font-weight:700;font-size:14px;color:${b.color};margin-top:4px">${fmtC(v)}</div>
      <div style="font-size:10px;color:var(--mt);margin-top:2px">${pct}%</div>
    </div>`;
  });
  cards+=`</div>`;
  // Tabla por RUT
  let rows='';
  ag.rows.forEach(r=>{
    const detId='agd_'+r.rutCodigo;
    const celdas=AGING_BUCKETS.map(b=>{
      const v=r.buckets[b.k];
      return `<td style="text-align:right;font-family:var(--mono);font-size:11px;color:${v>0.5?b.color:'var(--bd)'}">${v>0.5?fmt(v):'–'}</td>`;
    }).join('');
    const facRows=r.facturas.map(f=>{
      const refFecha=f.fechaVto||f.fecha;
      const d=diasEntre(refFecha,hoy);
      const b=AGING_BUCKETS.find(x=>d>=x.min&&d<=x.max)||AGING_BUCKETS[0];
      const dm=f.ref;
      const concepto=dm.tipo==='doc'?`DTE ${dm.tipoDTE} N°${dm.numero||''}`:(dm.glosa||'Movimiento');
      return `<tr style="font-size:10px;color:var(--mt)">
        <td class="tl" style="font-family:var(--mono);padding-left:16px">${f.fecha}${f.fechaVto&&f.fechaVto!==f.fecha?` <span style="color:var(--mt)">(vto ${f.fechaVto})</span>`:''}</td>
        <td class="tl">${concepto}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmt(f.resto)}</td>
        <td style="text-align:right;color:${b.color}">${d<=0?'al día':d+'d'} · ${b.lbl}</td>
      </tr>`;
    }).join('');
    rows+=`<tr class="rth" style="cursor:pointer" onclick="toggleAgingDetalle('${detId}')">
      <td class="tl" style="font-family:var(--mono);font-size:10px">${rutFmt(r.rutCodigo,r.rutDV)}</td>
      <td class="tl" style="font-size:11px">${r.razonSocial||'(sin razón social)'}</td>
      ${celdas}
      <td style="text-align:right;font-family:var(--mono);font-weight:700;color:${r.saldo>=0?'var(--ach)':'var(--err)'}">${fmtC(r.saldo)}</td>
    </tr>
    <tr><td colspan="9" style="padding:0"><div class="aux-body" id="${detId}"><table style="width:100%;margin:6px 0 10px 0"><tbody>${facRows||'<tr><td style="color:var(--mt);font-size:10px;padding-left:16px">Sin facturas pendientes</td></tr>'}</tbody></table></div></td></tr>`;
  });
  const totCeldas=AGING_BUCKETS.map(b=>`<td style="text-align:right;font-family:var(--mono);font-weight:700;color:${b.color}">${fmtC(ag.tot[b.k])}</td>`).join('');
  el.innerHTML=`<div class="info-tip" style="margin-bottom:14px">📊 <strong>Aging de ${tipoLbl}</strong> — antigüedad de saldos al ${hoy} · ${saldoLbl}: <strong>${fmtC(ag.total)}</strong><br><span style="font-size:11px;color:var(--mt)">Los pagos se imputan a las facturas más antiguas (FIFO). Click en una fila para ver el detalle.</span></div>
  ${cards}
  <div class="card-np"><div class="tw"><table style="font-size:11px">
    <thead><tr><th class="tl">RUT</th><th class="tl">RAZÓN SOCIAL</th>${AGING_BUCKETS.map(b=>`<th style="text-align:right">${b.lbl}</th>`).join('')}<th style="text-align:right">SALDO</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="tl" colspan="2" style="font-weight:700">TOTAL</td>${totCeldas}<td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(ag.total)}</td></tr></tfoot>
  </table></div></div>`;
}



export {setAuxTab, setAuxView, toggleAux, renderAuxiliares, AGING_BUCKETS, diasEntre, calcularAging, toggleAgingDetalle, renderAuxAging};
