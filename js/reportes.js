// reportes.js — Libro Diario, Mayor, Balance, Resultados (núcleo de reportes)
// genDiario y buildMayor son la base de casi todos los cálculos.
import {toast, fmtC, fmt, pn, today, MESES, MC, IVA, pdcNm, PDC, CUENTAS_SEL, dteV, dteC} from './core.js';
import {nav} from './ui.js';
import {retencionHonorarios} from './indicadores.js';
import {toggleAgingDetalle} from './auxiliares.js';
import {S} from './state.js';
import './storage.js';

// ═══ LIBRO DIARIO (auto + manuales) ═══
let DIARIO_Q='';   // texto de búsqueda del libro diario
function genDiario(){
  const entries=[];let n=1;const anio=S.empresa.anio;

  // ASIENTO N°0 — Balance de Apertura (si existe)
  if(S.apertura&&S.apertura.movs&&S.apertura.movs.length){
    entries.push({
      n:0,
      fecha:S.apertura.fecha,
      glosa:S.apertura.glosa||'Balance de Apertura',
      movs:S.apertura.movs.map(m=>({...m})),
      origen:'apertura'
    });
  }

  // Agrupar ventas por mes
  // Excluimos los documentos que el usuario convirtió a asiento manual desde
  // Comprobantes: sus movimientos ya están representados en S.asientos.
  const vPorMes={};
  S.ventas.forEach(d=>{if(d.excluidoAuto)return;const m=+d.fecha.slice(5,7);if(!m)return;if(!vPorMes[m])vPorMes[m]=[];vPorMes[m].push(d);});
  const cPorMes={};
  S.compras.forEach(d=>{if(d.excluidoAuto)return;const m=+d.fecha.slice(5,7);if(!m)return;if(!cPorMes[m])cPorMes[m]=[];cPorMes[m].push(d);});

  MESES.forEach((mesNm,i)=>{
    const m=i+1;
    const fecha=`${anio}-${String(m).padStart(2,'0')}-28`;

    // VENTAS del mes — UN ASIENTO POR CADA DOCUMENTO (mismo criterio que
    // compras): así el auxiliar de clientes y el libro mayor muestran cada
    // movimiento con su folio, fecha real y RUT. Las NC (signo -1) invierten
    // los lados automáticamente.
    const vs=vPorMes[m]||[];
    if(vs.length){
      vs.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')).forEach(d=>{
        const signo=(dteV(d.tipoDTE)?.signo)||1;   // NC: -1, resto: +1
        const dteInfo=dteV(d.tipoDTE);
        const nombreDoc=dteInfo?.nm||('DTE '+d.tipoDTE);
        const glosa=`${nombreDoc} N°${d.numero} — ${d.razonSocial||'cliente'}`;
        const movs=[];

        const totSig=(d.total||0)*signo;
        const netoSig=(d.neto||0)*signo;
        const exentoSig=(d.exento||0)*signo;
        const otrosSig=(d.otrosImpuestos||0)*signo;
        const ivaSig=(d.iva||0)*signo;
        const ingSig=netoSig+exentoSig+otrosSig;

        // DEBE según forma de pago (banco=contado, clientes=crédito, deudores)
        const cuentaDeb=d.formaPago==='banco'?'1101201':d.formaPago==='deudores'?'1107003':'1104001';
        if(totSig){
          if(cuentaDeb==='1104001'){
            // Cuenta cliente con TODOS los datos del auxiliar (RUT, folio, DTE)
            const desc=`${d.razonSocial||''} · ${nombreDoc} N°${d.numero}`.trim();
            if(totSig>0)movs.push({cd:'1104001',nm:pdcNm('1104001'),debe:totSig,haber:0,desc,rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE});
            else movs.push({cd:'1104001',nm:pdcNm('1104001'),debe:0,haber:-totSig,desc,rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE});
          }else{
            if(totSig>0)movs.push({cd:cuentaDeb,nm:pdcNm(cuentaDeb),debe:totSig,haber:0});
            else movs.push({cd:cuentaDeb,nm:pdcNm(cuentaDeb),debe:0,haber:-totSig});
          }
        }
        // HABER: ingreso por venta según DTE
        const cuentaIng=dteInfo?dteInfo.cuenta:'4101002';
        if(ingSig){
          if(ingSig>0)movs.push({cd:cuentaIng,nm:pdcNm(cuentaIng),debe:0,haber:ingSig});
          else movs.push({cd:cuentaIng,nm:pdcNm(cuentaIng),debe:-ingSig,haber:0});
        }
        // HABER: IVA débito fiscal
        if(ivaSig){
          if(ivaSig>0)movs.push({cd:'2103003',nm:pdcNm('2103003'),debe:0,haber:ivaSig});
          else movs.push({cd:'2103003',nm:pdcNm('2103003'),debe:-ivaSig,haber:0});
        }

        if(movs.length){
          entries.push({
            n:d.folioComp||n++,
            fecha:d.fecha,
            glosa,
            movs,
            origen:'auto',
            fuente:'ventas',
            docId:d.id,
            tipoDTE:d.tipoDTE,
            folio:d.numero,
            rutCodigo:d.rutCodigo,
          });
        }
      });
    }

    // COMPRAS del mes — asiento agregado (CREDITO A PROVEEDORES)
    const cs=cPorMes[m]||[];
    if(cs.length){
      // UN ASIENTO POR CADA DOCUMENTO — así el auxiliar de proveedores muestra
      // cada movimiento con su folio y su fecha real, y el libro mayor los
      // separa. Las NC quedan como cargo a proveedores (rebaja) y las ND como
      // abono adicional (aumento), gracias al signo del DTE.
      cs.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')).forEach(d=>{
        const signo=(dteC(d.tipoDTE)?.signo)||1;   // NC: -1, todo lo demás: +1
        const dteInfo=dteC(d.tipoDTE);
        const nombreDoc=dteInfo?.nm||('DTE '+d.tipoDTE);
        const glosa=`${nombreDoc} N°${d.numero} — ${d.razonSocial||'proveedor'}`;
        const movs=[];

        // Gasto/activo (una línea por cuenta en la distribución).
        // El signo positivo → DEBE aumenta; signo negativo (NC) → invierte.
        // Los "otros impuestos" (patente, específico combustible, tabacos, etc.)
        // se acumulan en la primera cuenta como parte del costo.
        const otros=(d.otrosImpuestos||0)*signo;
        (d.dist||[]).forEach((l,idx)=>{
          let monto=(l.monto||0)*signo;
          if(idx===0)monto+=otros;   // primera línea absorbe los otros impuestos
          if(!monto)return;
          const desc=l.cc?`CC: ${l.cc}`:'';
          if(monto>0)movs.push({cd:l.cuenta,nm:pdcNm(l.cuenta),debe:monto,haber:0,desc});
          else movs.push({cd:l.cuenta,nm:pdcNm(l.cuenta),debe:0,haber:-monto,desc});
        });
        // IVA crédito fiscal
        const iva=(d.iva||0)*signo;
        if(iva){
          if(iva>0)movs.push({cd:'1108002',nm:pdcNm('1108002'),debe:iva,haber:0});
          else movs.push({cd:'1108002',nm:pdcNm('1108002'),debe:0,haber:-iva});
        }
        // Proveedor (auxiliar) — el HABER normal, DEBE cuando es NC
        const totalProv=(d.total||0)*signo;
        // Para DTE 46 (factura de compra) el total no incluye IVA porque el
        // receptor retiene. La cuenta proveedor solo recibe lo neto.
        if(totalProv){
          const desc=`${d.razonSocial||''} · ${nombreDoc} N°${d.numero}`.trim();
          if(totalProv>0)movs.push({cd:'2102001',nm:pdcNm('2102001'),debe:0,haber:totalProv,desc,rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE});
          else movs.push({cd:'2102001',nm:pdcNm('2102001'),debe:-totalProv,haber:0,desc,rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE});
        }
        // DTE 46: IVA retenido va al haber (obligación con el SII)
        if(+d.tipoDTE===46){
          const ret=(d.iva||0)*signo;
          if(ret>0)movs.push({cd:'2103003',nm:pdcNm('2103003'),debe:0,haber:ret,desc:'IVA retenido factura compra'});
          else if(ret<0)movs.push({cd:'2103003',nm:pdcNm('2103003'),debe:-ret,haber:0,desc:'IVA retenido factura compra'});
        }

        if(movs.length){
          entries.push({
            n:d.folioComp||n++,   // usar el folio persistente del doc
            fecha:d.fecha,
            glosa,
            movs,
            origen:'auto',
            fuente:'compras',
            docId:d.id,
            tipoDTE:d.tipoDTE,
            folio:d.numero,
            rutCodigo:d.rutCodigo,
          });
        }
      });
    }

    // HONORARIOS
    const honM=S.honorarios.filter(h=>h.mes===m);
    if(honM.length){
      const tBruto=honM.reduce((s,h)=>s+ +(h.bruto||0),0),tRet=Math.round(tBruto*retencionHonorarios(S.empresa.anio));
      entries.push({n:n++,fecha,glosa:`Honorarios ${mesNm} ${anio}`,movs:[
        {cd:'3202019',nm:'HONORARIOS',debe:tBruto,haber:0},
        {cd:'2102006',nm:pdcNm('2102006'),debe:0,haber:tRet},
        {cd:'1101201',nm:pdcNm('1101201'),debe:0,haber:tBruto-tRet},
      ],origen:'auto',fuente:'honorarios',mes:m,anio});
    }
  });
  // Asientos manuales (excluir anulados de todos los cómputos)
  [...S.asientos].filter(a=>!a.anulado).sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(a=>{
    entries.push({n:a.folioComp||a.n||n++,fecha:a.fecha,glosa:a.glosa,movs:a.movs,origen:'manual',ref:a.n});
  });
  return entries.sort((a,b)=>{
    // Apertura siempre primero
    if(a.origen==='apertura')return -1;
    if(b.origen==='apertura')return 1;
    return a.fecha.localeCompare(b.fecha);
  });
}

function renderDiario(){
  const todas=genDiario(),el=document.getElementById('diario-content');
  if(!todas.length){el.innerHTML=`<div class="empty"><div class="ei">📖</div>No hay asientos registrados.</div>`;return;}

  // Detectar descuadres sobre TODOS los asientos (no solo los visibles).
  const descuadres=[];
  todas.forEach(e=>{
    const eD=e.movs.reduce((s,m)=>s+m.debe,0);
    const eH=e.movs.reduce((s,m)=>s+m.haber,0);
    const dif=Math.round(eD-eH);
    if(Math.abs(dif)>1){
      descuadres.push({n:e.n,fecha:e.fecha,glosa:e.glosa,debe:eD,haber:eH,dif,origen:e.origen,fuente:e.fuente,docId:e.docId,ref:e.ref});
    }
  });

  // Panel de alerta en el encabezado si hay descuadres
  let alerta='';
  if(descuadres.length){
    alerta=`<div style="background:rgba(248,81,73,.08);border:1px solid var(--err);border-radius:8px;padding:14px 16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:18px">⚠️</span>
        <span style="font-weight:700;color:var(--err)">${descuadres.length} comprobante${descuadres.length===1?'':'s'} descuadrado${descuadres.length===1?'':'s'}</span>
        <span style="font-size:11px;color:var(--mt)">— la partida doble no cuadra en estos asientos</span>
      </div>
      <div style="max-height:180px;overflow-y:auto">
        <table style="width:100%;font-size:11px">
          <thead><tr style="color:var(--mt);text-transform:uppercase;font-size:10px">
            <th class="tl" style="width:40px;padding:4px 8px">N°</th>
            <th class="tl" style="width:90px;padding:4px 8px">FECHA</th>
            <th class="tl" style="padding:4px 8px">GLOSA</th>
            <th style="text-align:right;padding:4px 8px">DEBE</th>
            <th style="text-align:right;padding:4px 8px">HABER</th>
            <th style="text-align:right;padding:4px 8px">DIFERENCIA</th>
            <th style="padding:4px 8px;text-align:center">CORREGIR</th>
          </tr></thead>
          <tbody>${descuadres.map(d=>{
            let btn='';
            if(d.origen==='manual'){
              btn=`<button class="btn btn-i" style="font-size:10px;padding:2px 8px" onclick="editarAsientoRef(${d.ref})">✏️ Editar</button>`;
            }else if(d.fuente==='compras'){
              btn=`<button class="btn btn-i" style="font-size:10px;padding:2px 8px" onclick="corregirDesdeDiario('compras','${d.docId}')">🧾 Al doc</button>`;
            }else if(d.fuente==='ventas'){
              btn=`<button class="btn btn-i" style="font-size:10px;padding:2px 8px" onclick="corregirDesdeDiario('ventas','${d.docId}')">🛒 Al doc</button>`;
            }else if(d.origen==='apertura'){
              btn=`<button class="btn btn-i" style="font-size:10px;padding:2px 8px" onclick="nav('apertura')">🔰 Abrir</button>`;
            }else{
              btn='<span style="color:var(--mt);font-size:10px">—</span>';
            }
            return `<tr>
              <td class="tl" style="padding:4px 8px;font-family:var(--mono);font-weight:600">${d.n}</td>
              <td class="tl" style="padding:4px 8px;font-family:var(--mono)">${d.fecha}</td>
              <td class="tl" style="padding:4px 8px">${d.glosa}</td>
              <td style="text-align:right;padding:4px 8px;font-family:var(--mono)">${fmtC(d.debe)}</td>
              <td style="text-align:right;padding:4px 8px;font-family:var(--mono)">${fmtC(d.haber)}</td>
              <td style="text-align:right;padding:4px 8px;font-family:var(--mono);color:var(--err);font-weight:700">${fmtC(Math.abs(d.dif))}</td>
              <td style="padding:4px 8px;text-align:center">${btn}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  // Buscador (por N°, glosa o cuenta). Solo re-renderiza la lista, no el input.
  const buscador=`<div class="filter-row" style="margin-bottom:12px">
    <span class="f-lbl">Buscar:</span>
    <input type="text" id="diario-search" placeholder="N° comprobante, glosa o cuenta…" value="${DIARIO_Q.replace(/"/g,'&quot;')}"
      oninput="setDiarioQ(this.value)" style="min-width:240px">
    ${DIARIO_Q?`<button class="btn btn-g" onclick="setDiarioQ('')">Limpiar</button>`:''}
    <span class="doc-count" id="diario-count"></span>
  </div>`;

  el.innerHTML=alerta+buscador+`<div id="diario-tabla"></div>`;
  renderDiarioTabla();
}

// Renderiza SOLO la tabla del diario (depende de la búsqueda). Separado para
// no destruir el input de búsqueda al teclear (evita perder foco en móvil).
function renderDiarioTabla(){
  const box=document.getElementById('diario-tabla');
  if(!box)return;
  let entries=genDiario();

  const q=DIARIO_Q.toLowerCase().trim();
  const hayBusqueda=!!q;
  if(hayBusqueda){
    entries=entries.filter(e=>{
      if(String(e.n||'').includes(q))return true;
      if((e.glosa||'').toLowerCase().includes(q))return true;
      return e.movs.some(m=>String(m.cd).includes(q)||(m.nm||pdcNm(m.cd)||'').toLowerCase().includes(q));
    });
  }

  const totalDisp=entries.length;
  // Sin búsqueda: solo los últimos 5 (más recientes). genDiario viene ascendente.
  const LIMITE_DIA=5;
  let ocultos=0;
  if(!hayBusqueda&&entries.length>LIMITE_DIA){
    ocultos=entries.length-LIMITE_DIA;
    entries=entries.slice(-LIMITE_DIA);
  }

  const cnt=document.getElementById('diario-count');
  if(cnt)cnt.textContent=hayBusqueda?`${totalDisp} resultado${totalDisp===1?'':'s'}`:'';

  if(!entries.length){
    box.innerHTML=`<div style="text-align:center;padding:30px;color:var(--mt)">No hay asientos que coincidan con la búsqueda.</div>`;
    return;
  }

  let aviso='';
  if(ocultos){
    aviso=`<div style="background:rgba(88,166,255,.06);border:1px solid rgba(88,166,255,.25);color:var(--info);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px">
      📖 Mostrando los <strong>${LIMITE_DIA} asientos más recientes</strong> de ${totalDisp}. Usa el buscador para ver el resto.
    </div>`;
  }

  // Totales SIEMPRE sobre todo el diario (no solo lo visible).
  let tD=0,tH=0;
  genDiario().forEach(e=>{tD+=e.movs.reduce((s,m)=>s+m.debe,0);tH+=e.movs.reduce((s,m)=>s+m.haber,0);});

  let h=aviso+`<div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl" style="width:38px">N°</th><th class="tl" style="width:92px">FECHA</th><th class="tl">GLOSA / CUENTA</th><th class="tl" style="width:82px">CÓD.</th><th style="min-width:110px">DEBE</th><th style="min-width:110px">HABER</th><th class="tl" style="width:65px">ORIGEN</th></tr></thead><tbody>`;
  entries.forEach(e=>{
    const eD=e.movs.reduce((s,m)=>s+m.debe,0),eH=e.movs.reduce((s,m)=>s+m.haber,0);
    const asDescuadrado=Math.abs(eD-eH)>1;
    const estiloTotal=asDescuadrado?'color:var(--err);font-weight:700':'';
    const ob=e.origen==='manual'?`<span class="badge bb">Manual</span>`:`<span class="badge" style="background:rgba(130,130,130,.12);color:var(--mt)">Auto</span>`;
    const trStyle=asDescuadrado?' style="background:rgba(248,81,73,.05)"':'';
    const badgeDescuadre=asDescuadrado?' <span style="background:rgba(248,81,73,.15);color:var(--err);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px">⚠ DESCUADRE</span>':'';
    h+=`<tr class="rth"${trStyle}><td class="tl">${e.n}</td><td class="tl" style="font-family:var(--mono);font-size:11px">${e.fecha}</td><td class="tl" colspan="2">${e.glosa}${badgeDescuadre}</td><td style="${estiloTotal}">${fmtC(eD)}</td><td style="${estiloTotal}">${fmtC(eH)}</td><td>${ob}</td></tr>`;
    e.movs.forEach(m=>{
      const isH=m.haber>0;
      h+=`<tr><td></td><td></td><td class="tnm" style="${isH?'padding-left:28px;color:var(--mt)':''}">${m.nm||pdcNm(m.cd)}${m.desc?` <span style="color:var(--mt);font-size:11px">— ${m.desc}</span>`:''}</td><td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${m.cd}</td><td>${m.debe?fmtC(m.debe):''}</td><td>${m.haber?fmtC(m.haber):''}</td><td></td></tr>`;
    });
  });
  const ok=Math.abs(tD-tH)<1;
  h+=`</tbody><tfoot><tr><td class="tl" colspan="4">TOTALES${!hayBusqueda&&ocultos?' (todo el diario)':''}</td><td style="${ok?'':'color:var(--err);font-weight:700'}">${fmtC(tD)}</td><td style="${ok?'':'color:var(--err);font-weight:700'}">${fmtC(tH)}</td><td></td></tr></tfoot></table></div></div>`;
  h+=`<div style="margin-top:10px;font-size:12px;color:${ok?'var(--ach)':'var(--err)'}">
    ${ok?'✅ Partida doble cuadrada — Debe = Haber = '+fmtC(tD):'⚠️ Descuadre global: Debe '+fmtC(tD)+' | Haber '+fmtC(tH)+' | Diferencia '+fmtC(Math.abs(tD-tH))}</div>`;
  box.innerHTML=h;
}

function setDiarioQ(v){
  DIARIO_Q=v;
  renderDiarioTabla();
}

// Puentes usados desde el reporte de descuadres del libro diario y desde Comprobantes.
// - Manuales: abrir editor de asientos
// - Compras/ventas: navegar al libro y filtrar por el número
async function corregirDesdeDiario(fuente,docId){
  if(!docId){nav(fuente);return;}
  nav(fuente);
  // Le damos tiempo a la sección para renderizarse y luego intentamos abrir el
  // editor del documento específico. Los IDs de docs importados llevan
  // prefijo 'c_imp_' o 'v_imp_'.
  setTimeout(()=>{
    try{
      if(fuente==='compras'&&window.editarCompra)window.editarCompra(docId);
      else if(fuente==='ventas'&&window.editarVenta)window.editarVenta(docId);
    }catch(e){}
  },80);
}

// Abre el editor de un asiento manual por su n° correlativo
function editarAsientoRef(n){
  const a=S.asientos.find(x=>x.n===n);
  if(!a)return;
  nav('asientos');
  setTimeout(()=>{try{window.editarAsiento&&window.editarAsiento(a.id);}catch(e){}},50);
}

// ═══ MAYOR ═══
function buildMayor(){
  const M={};
  genDiario().forEach(e=>{
    e.movs.forEach(m=>{
      if(!M[m.cd])M[m.cd]={nm:m.nm||pdcNm(m.cd),debe:0,haber:0,movs:[]};
      M[m.cd].debe+=m.debe;M[m.cd].haber+=m.haber;
      M[m.cd].movs.push({fecha:e.fecha,glosa:e.glosa,debe:m.debe,haber:m.haber});
    });
  });
  Object.values(M).forEach(a=>{let s=0;a.movs.forEach(m=>{s+=m.debe-m.haber;m.saldo=s;});a.saldo=a.debe-a.haber;});
  return M;
}

// Construye el Mayor de OTRO año leyendo su storage, sin alterar el estado actual.
// Reutiliza genDiario/buildMayor haciendo swap temporal de las colecciones de S.
async function buildMayorAnio(y){
  const bak={ventas:S.ventas,compras:S.compras,honorarios:S.honorarios,asientos:S.asientos,apertura:S.apertura,anio:S.empresa.anio};
  const tmp={ventas:[],compras:[],honorarios:[],asientos:[],apertura:null};
  for(const[k,d] of [['ventas-'+y,'ventas'],['compras-'+y,'compras'],['honorarios-'+y,'honorarios'],['asientos-'+y,'asientos']]){
    try{const r=await window.storage.get(k);if(r){const p=JSON.parse(r.value);if(Array.isArray(p))tmp[d]=p;}}catch(e){}
  }
  try{const r=await window.storage.get('apertura-'+y);if(r)tmp.apertura=JSON.parse(r.value);}catch(e){}
  // Swap
  S.ventas=tmp.ventas;S.compras=tmp.compras;S.honorarios=tmp.honorarios;S.asientos=tmp.asientos;S.apertura=tmp.apertura;S.empresa.anio=y;
  let M;
  try{M=buildMayor();}finally{
    // Restaurar SIEMPRE
    S.ventas=bak.ventas;S.compras=bak.compras;S.honorarios=bak.honorarios;S.asientos=bak.asientos;S.apertura=bak.apertura;S.empresa.anio=bak.anio;
  }
  return M;
}
// Totales agregados de un Mayor (para comparativo)
function totalesDeMayor(M){
  const keys=Object.keys(M);
  const get=cd=>{const a=M[cd];return a?Math.abs(a.saldo):0;};
  return {
    ingresos:keys.filter(k=>k.startsWith('4')).reduce((s,k)=>s+Math.abs(M[k].saldo),0),
    costos:keys.filter(k=>k.startsWith('3')).reduce((s,k)=>s+M[k].saldo,0),
    activos:keys.filter(k=>k.startsWith('1')).reduce((s,k)=>s+M[k].saldo,0),
    pasivos:keys.filter(k=>k.startsWith('2')&&!k.startsWith('23')).reduce((s,k)=>s+Math.abs(M[k].saldo),0),
    capital:keys.filter(k=>k.startsWith('23')).reduce((s,k)=>s+Math.abs(M[k].saldo),0),
  };
}
// Estado del comparativo (año seleccionado para comparar). null = sin comparar.
let CMP_YEAR=null;
function fmtVar(actual,anterior){
  const dif=actual-anterior;
  if(Math.abs(anterior)<0.5){
    if(Math.abs(actual)<0.5)return {txt:'–',color:'var(--mt)',sig:false};
    return {txt:'nuevo',color:'var(--info)',sig:true};
  }
  const pct=dif/Math.abs(anterior)*100;
  const sig=Math.abs(pct)>=20; // variación significativa ≥20%
  const color=dif>0?'var(--ach)':(dif<0?'var(--err)':'var(--mt)');
  return {txt:(pct>0?'+':'')+pct.toFixed(1)+'%',color,sig,dif};
}
function renderMayor(){
  const M=buildMayor(),el=document.getElementById('mayor-content');
  const keys=Object.keys(M);
  if(!keys.length){el.innerHTML=`<div class="empty"><div class="ei">📊</div>No hay movimientos.</div>`;return;}
  const tA=keys.filter(k=>k.startsWith('1')).reduce((s,k)=>s+M[k].saldo,0);
  const tP=keys.filter(k=>k.startsWith('2')&&!k.startsWith('23')).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const tC=keys.filter(k=>k.startsWith('3')).reduce((s,k)=>s+M[k].saldo,0);
  const tI=keys.filter(k=>k.startsWith('4')).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  let h=`<div class="kpi-grid">
    <div class="kpi"><div class="kpi-lbl">Total Activos</div><div class="kpi-val pos">${fmtC(tA)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Pasivos</div><div class="kpi-val neg">${fmtC(tP)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Ingresos</div><div class="kpi-val pos">${fmtC(tI)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Costos</div><div class="kpi-val neg">${fmtC(tC)}</div></div>
  </div>`;
  keys.sort().forEach(cd=>{
    const a=M[cd];
    h+=`<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div><span style="font-family:var(--mono);font-size:11px;color:var(--mt)">${cd}</span><span style="font-size:14px;font-weight:700;margin-left:10px">${a.nm}</span></div>
        <div style="display:flex;gap:14px;align-items:center">
          <span style="font-size:11px;color:var(--mt)">D: ${fmtC(a.debe)}</span>
          <span style="font-size:11px;color:var(--mt)">H: ${fmtC(a.haber)}</span>
          <span class="badge ${a.saldo>=0?'bg':'br'}">Saldo: ${fmtC(Math.abs(a.saldo))}</span>
        </div>
      </div>
      <table style="font-size:11px">
        <thead><tr><th class="tl">FECHA</th><th class="tl">GLOSA</th><th>DEBE</th><th>HABER</th><th>SALDO</th></tr></thead><tbody>
        ${a.movs.map(m=>`<tr><td class="tl" style="font-family:var(--mono);font-size:10px">${m.fecha}</td><td class="tl">${m.glosa}</td><td>${m.debe?fmtC(m.debe):'–'}</td><td>${m.haber?fmtC(m.haber):'–'}</td><td style="font-weight:600">${fmtC(Math.abs(m.saldo))}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  });
  el.innerHTML=h;
}

// ═══ BALANCE ═══
async function renderBalance(){
  const M=buildMayor();
  // Agrupación dinámica: recorre todas las cuentas imputables con saldo y las clasifica por prefijo.
  // Activos: 11 (corriente) / 12 (no corriente). Pasivos: 21 (corriente) / 22 (no corriente). Patrimonio: 23.
  // El resultado del ejercicio (ingresos 04 − costos 03) se calcula aparte y se suma al patrimonio.
  const grpPrefijo=(pref,title)=>{
    let tot=0;
    // Cuentas correctoras de activo (restan del activo, saldo acreedor):
    //  - Depreciación/amortización acumulada: grupo 12 con 5º dígito '2' (ej 1201202)
    //  - Estimación de incobrables: subgrupo 1105 (ej 1105001)
    const esCorrectoraActivo=cd=>(cd.startsWith('12')&&cd[4]==='2')||cd.startsWith('1105');
    const cds=Object.keys(M).filter(cd=>cd.length===7&&pref.some(p=>cd.startsWith(p))&&Math.abs(M[cd].saldo)>=0.5)
      .sort();
    const rows=cds.map(cd=>{
      const correctora=esCorrectoraActivo(cd);
      const v=correctora?-Math.abs(M[cd].saldo):Math.abs(M[cd].saldo);
      tot+=v;
      return`<tr><td class="tl" style="padding-left:16px;font-size:12px"><span style="font-family:var(--mono);font-size:10px;color:var(--mt)">${cd}</span> ${M[cd].nm||pdcNm(cd)}${correctora?' <span style="color:var(--mt);font-size:10px">(−)</span>':''}</td><td style="font-family:var(--mono);${correctora?'color:var(--err)':''}">${correctora?'('+fmt(Math.abs(v))+')':(fmt(v)||'–')}</td></tr>`;
    }).join('')||`<tr><td class="tl" style="padding-left:16px;font-size:11px;color:var(--mt)">Sin movimientos</td><td>–</td></tr>`;
    return{h:`<tr class="rth"><td colspan="2" class="tl" style="padding:8px 10px">${title}</td></tr>${rows}`,tot};
  };
  const gAC=grpPrefijo(['11'],'ACTIVOS CORRIENTES');
  const gAF=grpPrefijo(['12'],'ACTIVOS NO CORRIENTES');
  const gPC=grpPrefijo(['21'],'PASIVOS CORRIENTES');
  const gPNC=grpPrefijo(['22'],'PASIVOS NO CORRIENTES');
  // Patrimonio: cuentas del prefijo 23 (capital, revalorización, resultados acumulados)
  const gPat=grpPrefijo(['23'],'PATRIMONIO');
  const tI=Object.keys(M).filter(k=>k.startsWith('4')).reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  const tC=Object.keys(M).filter(k=>k.startsWith('3')).reduce((s,k)=>s+M[k].saldo,0);
  const res=tI-tC;
  const totAct=gAC.tot+gAF.tot;
  const totPas=gPC.tot+gPNC.tot;
  const totPat=gPat.tot+res; // patrimonio contable + resultado del ejercicio corriente
  const totPasYPat=totPas+totPat;
  const ok=Math.abs(totAct-totPasYPat)<2;
  document.getElementById('balance-content').innerHTML=`<div class="card">
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:15px;font-weight:700">${S.empresa.nombre||'(sin empresa)'}</div>
      <div style="color:var(--mt);font-size:12px;margin-top:3px">Balance General al 31 de Diciembre de ${S.empresa.anio}</div>
    </div>
    <div class="bal-layout">
      <div>
        <div class="card-title">ACTIVOS</div>
        <table><tbody>
          ${gAC.h}<tr class="rtot"><td class="tl" style="padding:8px 10px;font-size:11px">Total Activos Corrientes</td><td style="font-family:var(--mono)">${fmtC(gAC.tot)}</td></tr>
          ${gAF.h}<tr class="rtot"><td class="tl" style="padding:8px 10px;font-size:11px">Total Activos No Corrientes</td><td style="font-family:var(--mono)">${fmtC(gAF.tot)}</td></tr>
          <tr style="background:rgba(46,160,67,.12)"><td class="tl" style="padding:10px;font-weight:700;font-size:13px">TOTAL ACTIVOS</td><td style="font-family:var(--mono);font-weight:700;font-size:13px;color:var(--ach)">${fmtC(totAct)}</td></tr>
        </tbody></table>
      </div>
      <div>
        <div class="card-title">PASIVOS Y PATRIMONIO</div>
        <table><tbody>
          ${gPC.h}<tr class="rtot"><td class="tl" style="padding:8px 10px;font-size:11px">Total Pasivos Corrientes</td><td style="font-family:var(--mono)">${fmtC(gPC.tot)}</td></tr>
          ${gPNC.h}<tr class="rtot"><td class="tl" style="padding:8px 10px;font-size:11px">Total Pasivos No Corrientes</td><td style="font-family:var(--mono)">${fmtC(gPNC.tot)}</td></tr>
          <tr class="rtot" style="background:rgba(248,81,73,.08)"><td class="tl" style="padding:8px 10px;font-size:11px">Total Pasivos</td><td style="font-family:var(--mono)">${fmtC(totPas)}</td></tr>
          ${gPat.h}
          <tr><td class="tl" style="padding-left:16px;font-size:12px">Resultado del Ejercicio</td><td style="font-family:var(--mono);color:${res>=0?'var(--ach)':'var(--err)'}">${fmtC(res)}</td></tr>
          <tr class="rtot"><td class="tl" style="padding:8px 10px;font-size:11px">Total Patrimonio</td><td style="font-family:var(--mono)">${fmtC(totPat)}</td></tr>
          <tr style="background:rgba(46,160,67,.12)"><td class="tl" style="padding:10px;font-weight:700;font-size:13px">TOTAL PASIVOS + PATRIMONIO</td><td style="font-family:var(--mono);font-weight:700;font-size:13px;color:var(--ach)">${fmtC(totPasYPat)}</td></tr>
        </tbody></table>
      </div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:${ok?'var(--ach)':'var(--warn)'}">${ok?'✅ Balance cuadrado':'⚠️ Diferencia: '+fmtC(Math.abs(totAct-totPasYPat))}</div>
  </div>`;
  poblarCmpSelect('cmp-year-bal');
  if(CMP_YEAR)await renderComparativo('balance-content','balance');
}

// Poblar selector de años a comparar (todos menos el actual)
function poblarCmpSelect(id){
  const sel=document.getElementById(id);if(!sel)return;
  const actual=S.empresa.anio;
  const cy=new Date().getFullYear();
  const años=[];for(let y=cy+1;y>=cy-6;y--){if(y!==actual)años.push(y);}
  sel.innerHTML='<option value="">— sin comparar —</option>'+años.map(y=>`<option value="${y}" ${CMP_YEAR==y?'selected':''}>${y}</option>`).join('');
}
async function onCmpYear(v){
  CMP_YEAR=v?+v:null;
  // Sincronizar ambos selects
  ['cmp-year-bal','cmp-year-res'].forEach(id=>{const s=document.getElementById(id);if(s)s.value=v||'';});
  // Re-render de la sección activa
  const activa=document.querySelector('.section.active')?.id||'';
  if(activa==='s-balance')await renderBalance();
  else if(activa==='s-resultados')await renderResultados();
}
// Panel comparativo Actual vs Anterior con variación %
async function renderComparativo(targetId,tipo){
  const cont=document.getElementById(targetId);if(!cont)return;
  const actual=S.empresa.anio;
  const Mact=buildMayor();
  let Mant;
  try{Mant=await buildMayorAnio(CMP_YEAR);}catch(e){Mant={};}
  const tA=totalesDeMayor(Mact),tB=totalesDeMayor(Mant);
  const resA=tA.ingresos-tA.costos,resB=tB.ingresos-tB.costos;
  // Filas según tipo de reporte
  let filas;
  if(tipo==='resultados'){
    filas=[
      ['Ingresos de explotación',tA.ingresos,tB.ingresos],
      ['Costos y gastos',tA.costos,tB.costos],
      ['Resultado del ejercicio',resA,resB],
    ];
  }else{
    filas=[
      ['Total activos',tA.activos,tB.activos],
      ['Total pasivos',tA.pasivos,tB.pasivos],
      ['Capital',tA.capital,tB.capital],
      ['Resultado del ejercicio',resA,resB],
    ];
  }
  const rows=filas.map(([lbl,a,b])=>{
    const v=fmtVar(a,b);
    return `<tr${v.sig?' style="background:rgba(210,153,34,.08)"':''}>
      <td class="tl" style="font-size:12px">${v.sig?'⚡ ':''}${lbl}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtC(a)}</td>
      <td style="text-align:right;font-family:var(--mono);color:var(--mt)">${fmtC(b)}</td>
      <td style="text-align:right;font-family:var(--mono);font-weight:600;color:${v.color}">${v.txt}</td>
    </tr>`;
  }).join('');
  const panel=`<div class="card" style="margin-bottom:16px;border-color:var(--info)">
    <div style="font-size:13px;font-weight:700;margin-bottom:10px">📊 Comparativo ${actual} vs ${CMP_YEAR}</div>
    <table style="font-size:12px"><thead><tr>
      <th class="tl">CONCEPTO</th><th style="text-align:right">${actual}</th><th style="text-align:right">${CMP_YEAR}</th><th style="text-align:right">VAR. %</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:8px;font-size:10px;color:var(--mt)">⚡ Variación significativa (≥20%). Variación positiva en verde, negativa en rojo — el signo es aritmético (no implica mejora o empeoramiento según la naturaleza de la cuenta).</div>
  </div>`;
  cont.insertAdjacentHTML('afterbegin',panel);
}

// ═══ RESULTADOS ═══
async function renderResultados(){
  const M=buildMayor();
  // Suma el saldo (valor absoluto) de todas las cuentas imputables cuyo código empieza con un prefijo dado
  const sumaPref=pref=>Object.keys(M).filter(k=>k.length===7&&k.startsWith(pref)&&Math.abs(M[k].saldo)>=0.5)
    .reduce((s,k)=>s+Math.abs(M[k].saldo),0);
  // Filas de detalle por prefijo (cuentas con saldo)
  const detallePref=pref=>Object.keys(M).filter(k=>k.length===7&&k.startsWith(pref)&&Math.abs(M[k].saldo)>=0.5).sort()
    .map(k=>`<tr><td class="tl" style="padding:5px 6px 5px 34px;font-size:11px;color:var(--mt)"><span style="font-family:var(--mono);font-size:10px">${k}</span> ${M[k].nm||pdcNm(k)}</td><td style="font-family:var(--mono);font-size:11px;color:var(--mt)">${fmtC(Math.abs(M[k].saldo))}</td></tr>`).join('');

  // Niveles del EERR
  const ingExp=sumaPref('41');   // Ingresos de explotación
  const costoExp=sumaPref('31'); // Costo de explotación
  const margenBruto=ingExp-costoExp;

  const gastosOp=sumaPref('32');   // Gastos operacionales (admin y ventas)
  const otrosGastosOp=sumaPref('33'); // Otros gastos operacionales
  const resultadoOp=margenBruto-gastosOp-otrosGastosOp;

  const ingFuera=sumaPref('42');   // Ingresos fuera de explotación
  const ingFinanc=sumaPref('43');  // Ingresos financieros
  const gastosNoOp=sumaPref('34'); // Gastos no operacionales
  const correccMon=sumaPref('35'); // Corrección monetaria
  const resAntesImp=resultadoOp+ingFuera+ingFinanc-gastosNoOp-correccMon;

  // Impuesto a la renta: si hay cuenta contabilizada (36) se usa; si no, se estima con tasa del régimen
  const impContab=sumaPref('36');
  const TASA_RENTA=(S.empresa.tasaRenta!=null?+S.empresa.tasaRenta:25)/100; // 14D N°3 Pro-Pyme General: 25%
  const impEstimado=resAntesImp>0?Math.round(resAntesImp*TASA_RENTA):0;
  const usaEstimado=impContab<0.5&&resAntesImp>0;
  const impuesto=impContab>=0.5?impContab:impEstimado;
  const utilidadNeta=resAntesImp-impuesto;

  // Helper para renderizar una línea de nivel con detalle expandible
  let idc=0;
  const nivel=(lbl,valor,pref,opts={})=>{
    idc++;const id='eerr-d'+idc;
    const det=pref?detallePref(pref):'';
    const tieneDet=det.length>0;
    const signo=opts.resta?'−':(opts.suma?'+':'');
    const color=opts.color||'var(--tx)';
    return `<tr class="${tieneDet?'rth':''}" style="cursor:${tieneDet?'pointer':'default'}" ${tieneDet?`onclick="toggleAgingDetalle('${id}')"`:''}>
        <td class="tl" style="padding:7px 12px;font-size:12px">${tieneDet?'▸ ':''}${signo?`<span style="color:var(--mt)">${signo}</span> `:''}${lbl}</td>
        <td style="font-family:var(--mono);color:${color}">${fmtC(valor)}</td>
      </tr>${tieneDet?`<tr><td colspan="2" style="padding:0"><div class="aux-body" id="${id}"><table style="width:100%"><tbody>${det}</tbody></table></div></td></tr>`:''}`;
  };
  const subtotal=(lbl,valor,fuerte)=>`<tr class="rtot" style="${fuerte?'background:rgba(88,166,255,.10)':''}">
      <td class="tl" style="padding:9px 12px;font-weight:700;font-size:${fuerte?'13':'12'}px">${lbl}</td>
      <td style="font-family:var(--mono);font-weight:700;color:${valor>=0?'var(--ach)':'var(--err)'};font-size:${fuerte?'13':'12'}px">${fmtC(valor)}</td>
    </tr>`;
  const espacio=`<tr><td colspan="2" style="height:6px;border:none"></td></tr>`;

  document.getElementById('resultados-content').innerHTML=`<div class="card" style="max-width:720px">
    <div style="text-align:center;margin-bottom:22px">
      <div style="font-size:16px;font-weight:700">${S.empresa.nombre||'(sin empresa)'}</div>
      <div style="color:var(--mt);font-size:12px;margin-top:3px">Estado de Resultados — Año ${S.empresa.anio}</div>
      <div style="color:var(--mt);font-size:11px;margin-top:2px">Régimen 14 D N°3 Pro-Pyme General</div>
    </div>
    <table><tbody>
      ${nivel('Ingresos de explotación',ingExp,'41',{color:'var(--ach)'})}
      ${nivel('Costo de explotación',costoExp,'31',{resta:true,color:'var(--err)'})}
      ${subtotal('= MARGEN BRUTO',margenBruto)}
      ${espacio}
      ${nivel('Gastos de administración y ventas',gastosOp,'32',{resta:true,color:'var(--err)'})}
      ${nivel('Otros gastos operacionales',otrosGastosOp,'33',{resta:true,color:'var(--err)'})}
      ${subtotal('= RESULTADO OPERACIONAL',resultadoOp)}
      ${espacio}
      ${nivel('Ingresos fuera de explotación',ingFuera,'42',{suma:true,color:'var(--ach)'})}
      ${nivel('Ingresos financieros',ingFinanc,'43',{suma:true,color:'var(--ach)'})}
      ${nivel('Gastos no operacionales',gastosNoOp,'34',{resta:true,color:'var(--err)'})}
      ${nivel('Corrección monetaria',correccMon,'35',{resta:true,color:'var(--err)'})}
      ${subtotal('= RESULTADO ANTES DE IMPUESTO',resAntesImp)}
      ${espacio}
      <tr>
        <td class="tl" style="padding:7px 12px;font-size:12px"><span style="color:var(--mt)">−</span> Impuesto a la renta (${(TASA_RENTA*100).toFixed(1)}%)${usaEstimado?' <span style="color:var(--warn);font-size:10px">estimado</span>':''}</td>
        <td style="font-family:var(--mono);color:var(--err)">${fmtC(impuesto)}</td>
      </tr>
      ${espacio}
      <tr style="background:${utilidadNeta>=0?'rgba(46,160,67,.14)':'rgba(248,81,73,.14)'}">
        <td class="tl" style="padding:13px 12px;font-size:15px;font-weight:700">UTILIDAD NETA DEL EJERCICIO</td>
        <td style="font-family:var(--mono);font-size:15px;font-weight:700;color:${utilidadNeta>=0?'var(--ach)':'var(--err)'}">${fmtC(utilidadNeta)}</td>
      </tr>
    </tbody></table>
    ${usaEstimado?`<div class="info-tip" style="margin-top:14px;font-size:11px">ℹ️ El impuesto a la renta es una <strong>estimación</strong> (${(TASA_RENTA*100).toFixed(1)}% sobre el resultado antes de impuesto). No hay cuenta del grupo 36 contabilizada. Puedes cambiar la tasa en Empresa → Configuración tributaria.</div>`:''}
    <div style="margin-top:12px;font-size:12px;color:var(--mt);display:flex;gap:16px;flex-wrap:wrap">
      <span>Margen bruto: <strong style="color:var(--tx)">${ingExp>0?(margenBruto/ingExp*100).toFixed(1):'0'}%</strong></span>
      <span>Margen operacional: <strong style="color:var(--tx)">${ingExp>0?(resultadoOp/ingExp*100).toFixed(1):'0'}%</strong></span>
      <span>Margen neto: <strong style="color:var(--tx)">${ingExp>0?(utilidadNeta/ingExp*100).toFixed(1):'0'}%</strong></span>
    </div>
  </div>`;
  poblarCmpSelect('cmp-year-res');
  if(CMP_YEAR)await renderComparativo('resultados-content','resultados');
}


export {genDiario, renderDiario, setDiarioQ, buildMayor, buildMayorAnio, totalesDeMayor, CMP_YEAR, fmtVar, renderMayor, renderBalance, poblarCmpSelect, onCmpYear, renderComparativo, renderResultados, corregirDesdeDiario, editarAsientoRef};
