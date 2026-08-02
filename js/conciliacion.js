// conciliacion.js
import {toast, PDC, fmtC} from './core.js';
import {S} from './state.js';
import {buildMayor} from './reportes.js';
import './storage.js';

let CONC_CARTOLA=null;

// ═══ FASE 6: CONCILIACIÓN BANCARIA ═══
// Estado: marcas de conciliado guardadas en S.empresa.conciliacion[cuenta-anio] = {ids:[...], saldoBanco}
// Cada movimiento del mayor recibe un id determinista (fecha+glosa+monto+índice) para marcarlo.
function concKey(){
  const cd=document.getElementById('conc-cuenta')?.value||'';
  return cd+'-'+S.empresa.anio;
}
function getConcEstado(){
  const k=concKey();
  const all=S.empresa.conciliacion||{};
  return all[k]||{ids:[],saldoBanco:0};
}
function setConcEstado(est){
  if(!S.empresa.conciliacion)S.empresa.conciliacion={};
  S.empresa.conciliacion[concKey()]=est;
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>{});
}
// id determinista de un movimiento del mayor
function movId(m,i){return `${m.fecha}|${(m.glosa||'').slice(0,20)}|${m.debe||0}|${m.haber||0}|${i}`;}
function renderConciliacion(){
  // Poblar selector de cuentas de banco/caja (1101)
  const sel=document.getElementById('conc-cuenta');
  if(sel&&sel.options.length===0){
    const cuentas=PDC.filter(c=>c.cd.startsWith('1101')&&c.cd.length===7&&c.nat);
    sel.innerHTML=cuentas.map(c=>`<option value="${c.cd}">${c.cd} — ${c.nm}</option>`).join('');
    // default: Banco Estado si existe
    if(cuentas.find(c=>c.cd==='1101201'))sel.value='1101201';
  }
  const cd=sel.value;
  const el=document.getElementById('conc-content');
  if(!cd){el.innerHTML='<div class="empty"><div class="ei">🏦</div>Selecciona una cuenta bancaria.</div>';return;}
  const M=buildMayor();
  const cuenta=M[cd];
  const movs=cuenta?cuenta.movs.map((m,i)=>({...m,_id:movId(m,i)})):[];
  const est=getConcEstado();
  const conciliados=new Set(est.ids);
  // Restaurar saldo banco guardado
  const sbEl=document.getElementById('conc-saldo-banco');
  if(sbEl&&!sbEl.value&&est.saldoBanco)sbEl.value=est.saldoBanco;
  const saldoBanco=+((sbEl&&sbEl.value)||est.saldoBanco||0);
  // Saldo según libros = saldo contable de la cuenta
  const saldoLibros=cuenta?cuenta.saldo:0;
  // Movimientos no conciliados (partidas conciliatorias)
  const noConc=movs.filter(m=>!conciliados.has(m._id));
  const sumaNoConc=noConc.reduce((s,m)=>s+(m.debe||0)-(m.haber||0),0);
  // Saldo conciliado en libros = suma de los conciliados
  const saldoConciliado=movs.filter(m=>conciliados.has(m._id)).reduce((s,m)=>s+(m.debe||0)-(m.haber||0),0);
  // Diferencia: saldo banco vs saldo libros
  const diferencia=saldoLibros-saldoBanco;
  // Filas
  let filas=movs.map(m=>{
    const marcado=conciliados.has(m._id);
    const monto=(m.debe||0)-(m.haber||0);
    return `<tr style="${marcado?'opacity:.55':''}">
      <td style="text-align:center"><input type="checkbox" ${marcado?'checked':''} onchange="toggleConciliado('${m._id.replace(/'/g,"\\'")}')" style="width:16px;height:16px;cursor:pointer"></td>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${m.fecha}</td>
      <td class="tl" style="font-size:11px">${m.glosa||''}</td>
      <td style="font-family:var(--mono);text-align:right;color:${monto>=0?'var(--ach)':'var(--err)'}">${fmtC(monto)}</td>
      <td style="text-align:center;font-size:11px">${marcado?'<span style="color:var(--ach)">✓ Conciliado</span>':'<span style="color:var(--mt)">Pendiente</span>'}</td>
    </tr>`;
  }).join('');
  const cartolaHtml=CONC_CARTOLA?renderCartolaMatch(movs,conciliados):'';
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Saldo según Libros</div><div class="kpi-val">${fmtC(saldoLibros)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Saldo según Banco</div><div class="kpi-val">${fmtC(saldoBanco)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Diferencia</div><div class="kpi-val ${Math.abs(diferencia)<1?'pos':'neg'}">${fmtC(diferencia)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Sin conciliar</div><div class="kpi-val">${noConc.length}</div></div>
  </div>
  ${Math.abs(diferencia)<1&&saldoBanco!==0?'<div class="info-tip" style="margin-bottom:14px;background:rgba(46,160,67,.10);border-color:var(--ach)">✅ <strong>Conciliado.</strong> El saldo de libros coincide con el del banco.</div>':saldoBanco!==0?`<div class="info-tip" style="margin-bottom:14px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ Hay una diferencia de <strong>${fmtC(diferencia)}</strong> entre libros y banco. Revisa las partidas pendientes (cheques girados no cobrados, depósitos en tránsito, cargos del banco no registrados).</div>`:''}
  ${cartolaHtml}
  <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <button class="btn btn-i" onclick="marcarTodosConciliados(true)">✓ Marcar todos</button>
    <button class="btn btn-i" onclick="marcarTodosConciliados(false)">✗ Desmarcar todos</button>
    <span style="font-size:11px;color:var(--mt);align-self:center">${conciliados.size} de ${movs.length} conciliados</span>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th style="width:40px">✓</th><th class="tl">FECHA</th><th class="tl">GLOSA</th><th style="text-align:right">MONTO</th><th style="text-align:center">ESTADO</th></tr></thead>
    <tbody>${filas||'<tr><td colspan="5" style="text-align:center;color:var(--mt);padding:20px">Sin movimientos en esta cuenta</td></tr>'}</tbody>
  </table></div></div>
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">Marca cada movimiento que aparezca en tu cartola del banco. Al conciliar todos y coincidir el saldo, la cuenta queda cuadrada.</div>`;
}
function onSaldoBancoChange(){
  const est=getConcEstado();
  est.saldoBanco=+document.getElementById('conc-saldo-banco').value||0;
  setConcEstado(est);
  renderConciliacion();
}
function toggleConciliado(id){
  const est=getConcEstado();
  const s=new Set(est.ids);
  if(s.has(id))s.delete(id);else s.add(id);
  est.ids=[...s];
  setConcEstado(est);
  renderConciliacion();
}
function marcarTodosConciliados(marcar){
  const cd=document.getElementById('conc-cuenta').value;
  const M=buildMayor();
  const movs=M[cd]?M[cd].movs.map((m,i)=>movId(m,i)):[];
  const est=getConcEstado();
  est.ids=marcar?movs:[];
  setConcEstado(est);
  renderConciliacion();
  toast(marcar?'✓ Todos marcados como conciliados':'✗ Todos desmarcados');
}
// Cargar cartola desde Excel/CSV: intenta detectar fecha, descripción y monto
function cargarCartola(ev){
  const file=ev.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
      // Detectar columnas: buscar fila de encabezado con "fecha", "monto/cargo/abono", "detalle/glosa"
      const cartola=[];
      rows.forEach(r=>{
        if(!r||!r.length)return;
        // Buscar una fecha y un número en la fila
        let fecha=null,monto=null,desc='';
        r.forEach(cell=>{
          if(cell==null)return;
          const s=String(cell).trim();
          // fecha dd/mm/yyyy o yyyy-mm-dd
          if(!fecha&&/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(s))fecha=s;
          else if(typeof cell==='number'&&Math.abs(cell)>100&&monto===null)monto=cell;
          else if(s.length>3&&!/^\d+$/.test(s))desc=desc||s;
        });
        if(fecha&&monto!==null)cartola.push({fecha,desc,monto});
      });
      if(!cartola.length){toast('⚠️ No se detectaron movimientos. Verifica que la cartola tenga columnas de fecha y monto.','e');return;}
      CONC_CARTOLA=cartola;
      toast('✅ Cartola cargada: '+cartola.length+' movimientos');
      renderConciliacion();
    }catch(err){toast('❌ Error al leer cartola: '+err.message,'e');}
  };
  reader.readAsArrayBuffer(file);
  ev.target.value='';
}
// Compara cartola cargada contra movimientos del mayor y sugiere coincidencias
function renderCartolaMatch(movs,conciliados){
  if(!CONC_CARTOLA)return '';
  // Emparejar por monto aproximado
  const noConcMovs=movs.filter(m=>!conciliados.has(m._id));
  let emparejados=0,sinMatch=[];
  CONC_CARTOLA.forEach(c=>{
    const montoAbs=Math.abs(c.monto);
    const match=noConcMovs.find(m=>Math.abs(Math.abs((m.debe||0)-(m.haber||0))-montoAbs)<1);
    if(match)emparejados++;else sinMatch.push(c);
  });
  return `<div class="card" style="margin-bottom:14px;background:rgba(88,166,255,.06)">
    <div class="card-title">📤 Cartola cargada (${CONC_CARTOLA.length} movimientos)</div>
    <div style="font-size:12px;color:var(--mt);margin-bottom:8px">${emparejados} coinciden con movimientos pendientes por monto. ${sinMatch.length} sin coincidencia (podrían ser cargos del banco no registrados).</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="autoConciliarCartola()">🔗 Auto-conciliar coincidencias</button>
      <button class="btn btn-g" onclick="CONC_CARTOLA=null;renderConciliacion()">Descartar cartola</button>
    </div>
    ${sinMatch.length?`<div style="margin-top:10px;font-size:11px"><strong>Sin coincidencia en libros:</strong><ul style="margin:4px 0 0 16px;color:var(--mt)">${sinMatch.slice(0,8).map(c=>`<li>${c.fecha} · ${c.desc||''} · ${fmtC(c.monto)}</li>`).join('')}</ul>${sinMatch.length>8?`<div style="color:var(--mt);margin-top:4px">…y ${sinMatch.length-8} más</div>`:''}</div>`:''}
  </div>`;
}
function autoConciliarCartola(){
  if(!CONC_CARTOLA)return;
  const cd=document.getElementById('conc-cuenta').value;
  const M=buildMayor();
  const movs=M[cd]?M[cd].movs.map((m,i)=>({...m,_id:movId(m,i)})):[];
  const est=getConcEstado();
  const s=new Set(est.ids);
  let n=0;
  CONC_CARTOLA.forEach(c=>{
    const montoAbs=Math.abs(c.monto);
    const match=movs.find(m=>!s.has(m._id)&&Math.abs(Math.abs((m.debe||0)-(m.haber||0))-montoAbs)<1);
    if(match){s.add(match._id);n++;}
  });
  est.ids=[...s];
  setConcEstado(est);
  toast('🔗 '+n+' movimientos conciliados automáticamente');
  renderConciliacion();
}


export {concKey, getConcEstado, setConcEstado, movId, renderConciliacion, onSaldoBancoChange, toggleConciliado, marcarTodosConciliados, cargarCartola, renderCartolaMatch, autoConciliarCartola};
