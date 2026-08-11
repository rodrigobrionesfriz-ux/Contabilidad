// auxiliares.js — Auxiliares por cliente/proveedor + aging
import {toast, fmtC, fmt, MESES, pdcNm, rutFmt, dteV, dteC, rutDV, rutParse, today} from './core.js';
import {S} from './state.js';
import {todosDocsVentas, todosDocsCompras, CUENTAS_AUX, esAux, abrirAsientoDesde} from './asientos.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import {inputCuenta} from './buscadorcuentas.js';
import {ccOpts} from './centroscosto.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';

let AUX_TAB='c';       // 'c'=clientes | 'p'=proveedores
let AUX_VIEW='detalle';// 'detalle' | 'aging'
let AUX_Q='';          // texto de búsqueda (RUT o razón social)
let AUX_DATA=null;     // cache de {clientes,proveedores} para re-render al buscar

// ═══ AUXILIARES ═══
function setAuxTab(t){
  AUX_TAB=t;
  AUX_Q='';  // al cambiar entre clientes/proveedores, limpiar la búsqueda
  document.getElementById('aux-tab-c').classList.toggle('active',t==='c');
  document.getElementById('aux-tab-p').classList.toggle('active',t==='p');
  renderAuxiliares();
}
function setAuxView(v){
  AUX_VIEW=v;
  document.getElementById('aux-view-detalle').classList.toggle('active',v==='detalle');
  document.getElementById('aux-view-aging').classList.toggle('active',v==='aging');
  // Solo re-renderiza la lista (conserva la búsqueda y el input)
  renderAuxLista();
}
function setAuxQ(v){
  AUX_Q=v;
  renderAuxLista();
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
    clientes[k].docs.push({tipo:'doc',origen:d.origen,asientoId:d.asientoId,asientoN:d.asientoN,docOriginalId:d.origen==='libro'?d.id:null,fecha:d.fecha,fechaVencimiento:d.fechaVencimiento,tipoDTE:d.tipoDTE,numero:d.numero,neto:d.neto,iva:d.iva,total:d.total,montoSigno:tot,debe:tot>0?tot:0,haber:tot<0?-tot:0});
    clientes[k].total+=tot;
    if(d.razonSocial)clientes[k].razonSocial=d.razonSocial;
  });

  // 2) DTEs unificados — PROVEEDORES (todos los del libro + los del asiento)
  todosDocsCompras().forEach(d=>{
    const k=d.rutCodigo;if(!k)return;
    if(!proveedores[k])proveedores[k]={rutCodigo:k,rutDV:d.rutDV,razonSocial:d.razonSocial||'',docs:[],total:0};
    const signo=(dteC(d.tipoDTE)?.signo)||1;
    const tot=(d.total||0)*signo;
    proveedores[k].docs.push({tipo:'doc',origen:d.origen,asientoId:d.asientoId,asientoN:d.asientoN,docOriginalId:d.origen==='libro'?d.id:null,fecha:d.fecha,fechaVencimiento:d.fechaVencimiento,tipoDTE:d.tipoDTE,numero:d.numero,neto:d.neto,iva:d.iva,total:d.total,dist:d.dist,montoSigno:tot,debe:tot<0?-tot:0,haber:tot>0?tot:0});
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

  // 4) Fichas registradas manualmente (o creadas al importar) que aún no tienen
  //    movimientos: deben aparecer igual en el listado, con saldo 0.
  [['cliente',clientes],['proveedor',proveedores]].forEach(([tipo,bucket])=>{
    const fichas=fichasAux(tipo);
    Object.keys(fichas).forEach(k=>{
      if(!bucket[k]){
        const f=fichas[k];
        bucket[k]={rutCodigo:k,rutDV:f.rutDV||'',razonSocial:f.razonSocial||'',docs:[],total:0};
      }
    });
  });

  // Contadores en tabs
  document.getElementById('aux-ct-c').textContent=Object.keys(clientes).length;
  document.getElementById('aux-ct-p').textContent=Object.keys(proveedores).length;

  // Cachear para el re-render de la lista al buscar (sin recalcular todo)
  AUX_DATA={clientes,proveedores};

  const el=document.getElementById('aux-content');
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';

  // Buscador: la lista queda en blanco hasta que se busca/filtra. Solo
  // re-renderiza la lista (no el input) para no perder foco en móvil.
  el.innerHTML=`<div class="filter-row" style="margin-bottom:14px">
      <span class="f-lbl">Buscar:</span>
      <input type="text" id="aux-search" placeholder="RUT o razón social del ${AUX_TAB==='c'?'cliente':'proveedor'}…" value="${AUX_Q.replace(/"/g,'&quot;')}"
        oninput="setAuxQ(this.value)" style="min-width:240px">
      ${AUX_Q?`<button class="btn btn-g" onclick="setAuxQ('')">Limpiar</button>`:''}
      <span class="doc-count" id="aux-count"></span>
    </div>
    <div id="aux-lista"></div>`;

  renderAuxLista();
}

// Renderiza SOLO la lista de auxiliares (depende de la búsqueda). En blanco
// hasta que el usuario busca o filtra.
function renderAuxLista(){
  const el=document.getElementById('aux-lista');
  if(!el||!AUX_DATA)return;
  const {clientes,proveedores}=AUX_DATA;
  const data=AUX_TAB==='c'?clientes:proveedores;

  const q=AUX_Q.toLowerCase().trim();
  const hayBusqueda=!!q;
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';
  const tipoIco=AUX_TAB==='c'?'📇':'🏭';
  const cnt=document.getElementById('aux-count');

  // Sin búsqueda: listado en blanco con instrucción
  if(!hayBusqueda){
    if(cnt)cnt.textContent=`${Object.keys(data).length} ${tipoLbl} en total`;
    el.innerHTML=`<div class="empty" style="padding:36px 20px"><div class="ei">🔎</div>
      Busca un ${AUX_TAB==='c'?'cliente':'proveedor'} para ver su detalle<br>
      <span style="font-size:11px;color:var(--mt)">Escribe un RUT o razón social. Hay <strong>${Object.keys(data).length}</strong> ${tipoLbl} registrados.</span>
    </div>`;
    return;
  }

  // Filtrar por RUT o razón social
  const filtrado={};
  Object.keys(data).forEach(k=>{
    const a=data[k];
    const txt=((a.rutCodigo||'')+' '+(a.rutDV||'')+' '+(a.razonSocial||'')).toLowerCase();
    if(txt.includes(q))filtrado[k]=a;
  });
  if(cnt)cnt.textContent=`${Object.keys(filtrado).length} de ${Object.keys(data).length} ${tipoLbl}`;

  // Vista Aging (respeta el filtro)
  if(AUX_VIEW==='aging'){renderAuxAging(filtrado,el);return;}

  renderAuxDetalle(filtrado,el);
}

// Pinta la vista Detalle a partir de un conjunto ya filtrado.
function renderAuxDetalle(data,el){
  const keys=Object.keys(data).sort((a,b)=>(data[b].total-data[a].total));
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';
  const tipoIco=AUX_TAB==='c'?'📇':'🏭';
  const cuentaLbl=AUX_TAB==='c'?'CLIENTES (1104001)':'PROVEEDORES (2102001)';
  const saldoLbl=AUX_TAB==='c'?'Por Cobrar':'Por Pagar';

  if(!keys.length){
    el.innerHTML=`<div class="empty"><div class="ei">${tipoIco}</div>No hay ${tipoLbl} que coincidan con la búsqueda.</div>`;
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
        // Estado de pago: buscar el doc original en S.compras/S.ventas
        let estadoPago='';
        if(d.docOriginalId){
          const arrOrig=AUX_TAB==='c'?S.ventas:S.compras;
          const orig=arrOrig.find(x=>x.id===d.docOriginalId);
          if(orig){
            const total=(orig.total||0)*signo;
            const pagado=(orig.pagos||[]).reduce((s,p)=>s+(p.monto||0),0);
            const saldoPendiente=total-pagado;
            if(pagado>0&&Math.abs(saldoPendiente)<1){
              estadoPago=`<span style="background:rgba(46,160,67,.15);color:var(--ach);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px">✓ PAGADO</span>`;
            }else if(pagado>0){
              estadoPago=`<span style="background:rgba(255,193,7,.12);color:var(--warn);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px" title="Total ${fmtC(total)} · Pagado ${fmtC(pagado)}">◐ SALDO ${fmtC(saldoPendiente)}</span>`;
            }
          }
        }
        return `<tr${neg?' style="color:var(--err)"':''}>
          <td class="tl" style="font-family:var(--mono);font-size:10px">${d.fecha}${vence}</td>
          <td class="tl" style="font-size:11px">DTE ${d.tipoDTE}<span style="color:var(--mt);margin-left:5px;font-size:10px">${dteNm.slice(0,16)} N°${d.numero||''}</span>${origenBadge}${estadoPago}</td>
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

    // Datos extra de la ficha (si existen)
    const ficha=fichaAux(AUX_TAB==='c'?'cliente':'proveedor',a.rutCodigo);
    const detalleFicha=ficha?[
      ficha.giro,
      ficha.email,
      ficha.telefono,
      ficha.cuentaDefault?`Cuenta por defecto: ${ficha.cuentaDefault}`:'',
      ficha.ccDefault?`CC por defecto: ${ficha.ccDefault}`:'',
    ].filter(Boolean).join(' · '):'';

    h+=`<div class="aux-card">
      <div class="aux-hdr" onclick="toggleAux('${bodyId}')">
        <div class="aux-rut">${rutFmt(a.rutCodigo,a.rutDV)}</div>
        <div class="aux-rs">${a.razonSocial||'(sin razón social)'}${detalleFicha?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${detalleFicha}</div>`:''}</div>
        <div class="aux-mov-count">${docs.length} mov</div>
        <div class="aux-saldo" style="color:${a.total>=0?'var(--ach)':'var(--err)'}">${fmtC(a.total)}</div>
        <div class="aux-chev">▸</div>
      </div>
      <div class="aux-body" id="${bodyId}">
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;margin-bottom:2px">
          <button class="btn btn-i" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();abrirFichaAux('${a.rutCodigo}','${a.rutDV}','${(a.razonSocial||'').replace(/'/g,'&apos;')}')">✏️ Editar ficha</button>
        </div>
        <table style="font-size:11px;margin-top:6px">
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
function renderAuxAging(data,elArg){
  const el=elArg||document.getElementById('aux-lista')||document.getElementById('aux-content');
  const ag=calcularAging(data);
  const tipoLbl=AUX_TAB==='c'?'clientes':'proveedores';
  const saldoLbl=AUX_TAB==='c'?'Por Cobrar':'Por Pagar';
  const hoy=today();
  if(!ag.rows.length){
    el.innerHTML=`<div class="empty"><div class="ei">📊</div>No hay saldos pendientes de ${tipoLbl} que coincidan con la búsqueda.</div>`;return;
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



// ═══ EDITOR DE FICHA AUXILIAR ═══
// Permite editar la ficha de un cliente/proveedor desde el mismo listado,
// para asignar cuenta y CC por defecto sin salir a Excel.
let FICHA_EDIT={rutCodigo:'',rutDV:'',razonSocial:'',tipo:'',esNueva:false};

// Abre el editor para crear un auxiliar manualmente desde cero (RUT editable).
function abrirFichaAuxNueva(){
  const tipo=AUX_TAB==='c'?'cliente':'proveedor';
  FICHA_EDIT={rutCodigo:'',rutDV:'',razonSocial:'',tipo,esNueva:true};
  renderFichaModal({},tipo,true);
}

function abrirFichaAux(rutCodigo,rutDV,razonSocial){
  FICHA_EDIT={rutCodigo,rutDV,razonSocial,tipo:AUX_TAB==='c'?'cliente':'proveedor',esNueva:false};
  const ficha=fichaAux(FICHA_EDIT.tipo,rutCodigo)||{};
  renderFichaModal(ficha,FICHA_EDIT.tipo,false);
}

function renderFichaModal(ficha,tipo,esNueva){
  const modal=document.getElementById('ficha-modal');
  const cont=document.getElementById('ficha-modal-body');
  if(!modal||!cont)return;
  const tipoLbl=tipo==='cliente'?'cliente':'proveedor';
  const filtroCta=tipo==='cliente'?'ingreso':'compra';

  // Bloque de identificación: editable si es nueva, fijo si se está editando.
  const identBlock=esNueva
    ? `<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:6px;padding:12px 14px;margin-bottom:14px">
        <div style="font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">Nuevo ${tipoLbl}</div>
        <div class="fg">
          <div class="grp rut-wrap"><label>RUT</label>
            <input type="text" id="ficha-rut" placeholder="Ej: 76.543.210-8" value="" oninput="fichaRutInput(this.value)">
            <span class="rut-dv" id="ficha-rut-dv"></span>
          </div>
          <div class="grp full"><label>Razón social</label><input type="text" id="ficha-rs" placeholder="Nombre del ${tipoLbl}" value=""></div>
        </div>
        <div id="ficha-rut-warn" style="font-size:11px;color:var(--err);margin-top:2px;display:none"></div>
      </div>`
    : `<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:6px;padding:10px 14px;margin-bottom:14px">
        <div style="font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:4px">${tipoLbl}</div>
        <div style="font-family:var(--mono);font-size:12px">${rutFmt(FICHA_EDIT.rutCodigo,FICHA_EDIT.rutDV)}</div>
        <div style="font-weight:600;font-size:14px;margin-top:2px">${FICHA_EDIT.razonSocial}</div>
      </div>`;

  cont.innerHTML=`
    <div style="padding:16px">
      ${identBlock}
      <div class="fg">
        <div class="grp"><label>Giro</label><input type="text" id="ficha-giro" value="${(ficha.giro||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp"><label>Email</label><input type="email" id="ficha-email" value="${(ficha.email||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp"><label>Teléfono</label><input type="text" id="ficha-tel" value="${(ficha.telefono||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp"><label>Dirección</label><input type="text" id="ficha-dir" value="${(ficha.direccion||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp"><label>Comuna</label><input type="text" id="ficha-comuna" value="${(ficha.comuna||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp"><label>Ciudad</label><input type="text" id="ficha-ciudad" value="${(ficha.ciudad||'').replace(/"/g,'&quot;')}"></div>
        <div class="grp full"><label>Notas</label><input type="text" id="ficha-notas" value="${(ficha.notas||'').replace(/"/g,'&quot;')}"></div>
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--bd)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">⚡ Valores por defecto para importar</div>
        <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Al importar desde el SII, estos valores se aplican automáticamente a los documentos de este ${tipoLbl}.</div>
        <div class="fg">
          <div class="grp full">
            <label>Cuenta ${tipo==='cliente'?'de ingreso':'de gasto o activo'} por defecto</label>
            ${inputCuenta({id:'ficha-cuenta',value:ficha.cuentaDefault||'',
              onPick:"setFichaCuenta('%CD%')",
              placeholder:'Buscar por código o nombre…',filtro:filtroCta})}
          </div>
          ${tipo==='proveedor'?`<div class="grp full">
            <label>Centro de costo por defecto</label>
            <select id="ficha-cc">${ccOpts(ficha.ccDefault||'')}</select>
          </div>`:''}
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cerrarFichaAux()">Cancelar</button>
        <button class="btn btn-p" onclick="guardarFichaAuxUI()">💾 ${esNueva?'Crear ficha':'Guardar ficha'}</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

// Formatea el RUT en el input de nueva ficha y muestra el DV / validación.
function fichaRutInput(val){
  const r=rutParse(val);
  const dvEl=document.getElementById('ficha-rut-dv');
  const warn=document.getElementById('ficha-rut-warn');
  if(dvEl)dvEl.textContent=r.codigo?`-${r.dv}`:'';
  if(warn){
    if(r.codigo&&!r.valido){warn.textContent='⚠️ El dígito verificador no corresponde al RUT';warn.style.display='';}
    else warn.style.display='none';
  }
}

function cerrarFichaAux(){
  const m=document.getElementById('ficha-modal');
  if(m)m.classList.remove('open');
}

let _fichaCuentaSel='';
function setFichaCuenta(cd){_fichaCuentaSel=cd;}

async function guardarFichaAuxUI(){
  let {rutCodigo,rutDV,razonSocial,tipo,esNueva}=FICHA_EDIT;

  // Modo creación: leer y validar RUT + razón social de los inputs editables
  if(esNueva){
    const r=rutParse(document.getElementById('ficha-rut')?.value||'');
    const rs=(document.getElementById('ficha-rs')?.value||'').trim();
    if(!r.codigo){toast('⚠️ Ingresa un RUT válido','e');return;}
    if(!r.valido){toast('⚠️ El dígito verificador del RUT no es correcto','e');return;}
    if(!rs){toast('⚠️ Ingresa la razón social','e');return;}
    // Evitar duplicar una ficha existente
    if(fichasAux(tipo)[r.codigo]){
      toast(`⚠️ Ya existe una ficha de ${tipo} con ese RUT`,'e');return;
    }
    rutCodigo=r.codigo; rutDV=r.dv; razonSocial=rs;
  }
  if(!rutCodigo)return;

  const inp=document.getElementById('ficha-cuenta');
  const cuentaDefault=_fichaCuentaSel||(inp?inp.dataset.cd:'')||'';
  const ficha={
    rutCodigo,rutDV,razonSocial,
    giro:document.getElementById('ficha-giro')?.value.trim()||'',
    email:document.getElementById('ficha-email')?.value.trim()||'',
    telefono:document.getElementById('ficha-tel')?.value.trim()||'',
    direccion:document.getElementById('ficha-dir')?.value.trim()||'',
    comuna:document.getElementById('ficha-comuna')?.value.trim()||'',
    ciudad:document.getElementById('ficha-ciudad')?.value.trim()||'',
    notas:document.getElementById('ficha-notas')?.value.trim()||'',
    cuentaDefault,
    ccDefault:tipo==='proveedor'?(document.getElementById('ficha-cc')?.value||''):'',
  };
  fichasAux(tipo)[rutCodigo]=ficha;
  await guardarFichasAux();
  _fichaCuentaSel='';
  cerrarFichaAux();
  toast(`✅ Ficha de ${razonSocial} ${esNueva?'creada':'actualizada'}`);
  logAccion(`${esNueva?'Creó':'Editó'} ficha de ${tipo}`,`${razonSocial} (${rutFmt(rutCodigo,rutDV)})`);
  // Si es nueva, dejarla visible buscándola por su RUT
  if(esNueva)AUX_Q=rutCodigo;
  rerender();
}

export {setAuxTab, setAuxView, setAuxQ, toggleAux, renderAuxiliares, AGING_BUCKETS, diasEntre, calcularAging, toggleAgingDetalle, renderAuxAging, AUX_TAB,
        abrirFichaAux, abrirFichaAuxNueva, fichaRutInput, cerrarFichaAux, setFichaCuenta, guardarFichaAuxUI};
