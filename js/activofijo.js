// activofijo.js — Activos fijos y depreciación
import {toast, fmtC, fmt, today, pdcNm, PDC} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {rerender} from './ui.js';
import './storage.js';

let AFB={editId:null}; // form de activo fijo (estado interno)

// ═══ ACTIVO FIJO Y DEPRECIACIÓN ═══
// Categorías: cada una mapea a su cuenta de activo, depreciación acumulada y gasto.
// Vida útil normal según tabla del SII (Res. Ex. N°43/2002).
const AF_CATEGORIAS=[
  {k:'bienes_raices', lbl:'Bienes raíces (construcciones)', activo:'1201002', deprAcum:'1201202', gasto:'3301002', vida:40},
  {k:'maquinarias',   lbl:'Maquinarias y equipos',          activo:'1201003', deprAcum:'1201203', gasto:'3301003', vida:15},
  {k:'instalaciones', lbl:'Instalaciones',                  activo:'1201004', deprAcum:'1201204', gasto:'3301004', vida:10},
  {k:'vehiculos',     lbl:'Vehículos (camiones, remolques)',activo:'1201005', deprAcum:'1201205', gasto:'3301005', vida:7},
  {k:'equipos_ofic',  lbl:'Equipos de oficina / muebles',   activo:'1201006', deprAcum:'1201206', gasto:'3301006', vida:7},
];
const afCat=k=>AF_CATEGORIAS.find(c=>c.k===k)||AF_CATEGORIAS[0];
// Vida útil acelerada SII: 1/3 de la normal, mínimo 3 años (se descarta la fracción)
const vidaAcelerada=vidaNormal=>Math.max(3,Math.floor(vidaNormal/3));

// Calcula la depreciación de un bien hasta el 31/dic del año dado.
// Regla: empieza a depreciar desde el 1/ene del año SIGUIENTE al de compra.
// Devuelve depreciación anual, acumulada al cierre del año y valor libro.
function calcularDepreciacion(bien,anioCierre){
  const vidaNormal=+bien.vida||afCat(bien.cat).vida;
  const vidaUsada=bien.metodo==='acelerada'?vidaAcelerada(vidaNormal):vidaNormal;
  const base=(+bien.valor||0)-(+bien.residual||0); // base depreciable
  const cuotaAnual=vidaUsada>0?Math.round(base/vidaUsada):0;
  const anioCompra=+(bien.fecha||'').slice(0,4);
  const anioInicio=anioCompra+1; // desde el año siguiente
  // Años ya depreciados al cierre del año pedido (inclusive)
  let aniosTranscurridos=anioCierre-anioInicio+1;
  if(aniosTranscurridos<0)aniosTranscurridos=0;
  if(aniosTranscurridos>vidaUsada)aniosTranscurridos=vidaUsada;
  // ¿este año en particular corresponde depreciar?
  const deprEsteAnio=(anioCierre>=anioInicio&&anioCierre<anioInicio+vidaUsada)?cuotaAnual:0;
  let acumulada=cuotaAnual*aniosTranscurridos;
  // Ajuste último año: la acumulada no puede exceder la base (por redondeo de cuota)
  if(acumulada>base)acumulada=base;
  const valorLibro=(+bien.valor||0)-acumulada;
  const totalmenteDepreciado=aniosTranscurridos>=vidaUsada;
  return {vidaNormal,vidaUsada,base,cuotaAnual,anioInicio,aniosTranscurridos,deprEsteAnio,acumulada,valorLibro,totalmenteDepreciado};
}

function abrirFormAF(){
  AFB={editId:null};
  const f=document.getElementById('af-form-bien');f.style.display='block';
  document.getElementById('afb-title').textContent='Nuevo Activo Fijo';
  const sel=document.getElementById('afb-cat');
  sel.innerHTML=AF_CATEGORIAS.map(c=>`<option value="${c.k}">${c.lbl}</option>`).join('');
  document.getElementById('afb-desc').value='';
  document.getElementById('afb-fecha').value=today();
  document.getElementById('afb-valor').value='';
  document.getElementById('afb-residual').value='0';
  document.getElementById('afb-metodo').value='lineal';
  onCatAF(); // setea vida útil default
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function onCatAF(){
  const k=document.getElementById('afb-cat').value;
  document.getElementById('afb-vida').value=afCat(k).vida;
  previewAF();
}
function cerrarFormAF(){document.getElementById('af-form-bien').style.display='none';AFB={editId:null};}

function previewAF(){
  const bien={
    cat:document.getElementById('afb-cat').value,
    fecha:document.getElementById('afb-fecha').value,
    valor:+document.getElementById('afb-valor').value||0,
    residual:+document.getElementById('afb-residual').value||0,
    vida:+document.getElementById('afb-vida').value||0,
    metodo:document.getElementById('afb-metodo').value,
  };
  const el=document.getElementById('afb-preview');
  if(!bien.valor||!bien.vida){el.innerHTML='';return;}
  const vAcel=vidaAcelerada(bien.vida);
  const baseL=bien.valor-bien.residual;
  const cuotaL=Math.round(baseL/bien.vida);
  const cuotaA=Math.round(baseL/vAcel);
  el.innerHTML=`<div class="info-tip" style="font-size:11px">
    📐 <strong>Comparación de métodos</strong> (base depreciable ${fmtC(baseL)}):<br>
    • <strong>Lineal</strong>: ${bien.vida} años → cuota anual ${fmtC(cuotaL)} (${fmtC(Math.round(cuotaL/12))}/mes)<br>
    • <strong>Acelerada</strong>: ${vAcel} años → cuota anual ${fmtC(cuotaA)} (${fmtC(Math.round(cuotaA/12))}/mes)<br>
    <span style="color:var(--mt)">Empieza a depreciar el 1/ene/${+(bien.fecha||'').slice(0,4)+1}</span>
  </div>`;
}

function guardarAF(){
  const desc=document.getElementById('afb-desc').value.trim();
  const cat=document.getElementById('afb-cat').value;
  const fecha=document.getElementById('afb-fecha').value;
  const valor=+document.getElementById('afb-valor').value||0;
  const residual=+document.getElementById('afb-residual').value||0;
  const vida=+document.getElementById('afb-vida').value||0;
  const metodo=document.getElementById('afb-metodo').value;
  if(!desc){toast('⚠️ Ingresa la descripción del bien','e');return;}
  if(!fecha){toast('⚠️ Ingresa la fecha de compra','e');return;}
  if(valor<=0){toast('⚠️ El valor debe ser mayor a 0','e');return;}
  if(vida<=0){toast('⚠️ La vida útil debe ser mayor a 0','e');return;}
  if(residual>=valor){toast('⚠️ El valor residual no puede ser mayor o igual al valor','e');return;}
  const c=afCat(cat);
  const bien={
    id:AFB.editId||'af_'+Date.now(),
    desc,cat,fecha,valor,residual,vida,metodo,
    cuentaActivo:c.activo,cuentaDeprAcum:c.deprAcum,cuentaGasto:c.gasto,
  };
  if(AFB.editId){const i=S.activos.findIndex(a=>a.id===AFB.editId);if(i>=0)S.activos[i]=bien;toast('✅ Activo actualizado');}
  else{S.activos.push(bien);toast('✅ Activo registrado');}
  window.storage.set('activos',JSON.stringify(S.activos)).catch(()=>toast('❌ Error al guardar','e'));
  cerrarFormAF();
  renderActivoFijo();updateHdr();
}
function editarAF(id){
  const b=S.activos.find(a=>a.id===id);if(!b)return;
  AFB={editId:id};
  const f=document.getElementById('af-form-bien');f.style.display='block';
  document.getElementById('afb-title').textContent='Editando Activo';
  document.getElementById('afb-cat').innerHTML=AF_CATEGORIAS.map(c=>`<option value="${c.k}" ${c.k===b.cat?'selected':''}>${c.lbl}</option>`).join('');
  document.getElementById('afb-desc').value=b.desc;
  document.getElementById('afb-fecha').value=b.fecha;
  document.getElementById('afb-valor').value=b.valor;
  document.getElementById('afb-residual').value=b.residual||0;
  document.getElementById('afb-vida').value=b.vida;
  document.getElementById('afb-metodo').value=b.metodo||'lineal';
  previewAF();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function eliminarAF(id){
  const b=S.activos.find(a=>a.id===id);if(!b)return;
  if(!confirm(`¿Eliminar el activo "${b.desc}"?\nEsta acción no se puede deshacer.`))return;
  S.activos=S.activos.filter(a=>a.id!==id);
  window.storage.set('activos',JSON.stringify(S.activos)).catch(()=>{});
  renderActivoFijo();updateHdr();toast('🗑 Activo eliminado');
}

// Genera el asiento de depreciación del año activo y lo agrega como asiento manual
function generarAsientoDepreciacion(){
  const anio=S.empresa.anio;
  // Acumular depreciación del año por cuenta de gasto y de depreciación acumulada
  const porGasto={},porAcum={};let total=0;
  S.activos.forEach(b=>{
    const d=calcularDepreciacion(b,anio);
    if(d.deprEsteAnio<=0)return;
    porGasto[b.cuentaGasto]=(porGasto[b.cuentaGasto]||0)+d.deprEsteAnio;
    porAcum[b.cuentaDeprAcum]=(porAcum[b.cuentaDeprAcum]||0)+d.deprEsteAnio;
    total+=d.deprEsteAnio;
  });
  if(total<=0){toast('⚠️ No hay depreciación que registrar para '+anio,'e');return;}
  const movs=[];
  Object.keys(porGasto).sort().forEach(cd=>movs.push({cd,nm:pdcNm(cd),debe:porGasto[cd],haber:0}));
  Object.keys(porAcum).sort().forEach(cd=>movs.push({cd,nm:pdcNm(cd),debe:0,haber:porAcum[cd]}));
  const fecha=anio+'-12-31';
  // Evitar duplicado: si ya existe un asiento de depreciación de este año
  const yaExiste=S.asientos.find(a=>a.glosa&&a.glosa.includes('Depreciación del ejercicio '+anio));
  if(yaExiste&&!confirm(`Ya existe un asiento de depreciación para ${anio} (N°${yaExiste.n}).\n¿Crear otro de todas formas?`))return;
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha,glosa:'Depreciación del ejercicio '+anio,movs});
  window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  toast('✅ Asiento N°'+folio+' de depreciación creado ('+fmtC(total)+')');
  renderActivoFijo();updateHdr();
}

function renderActivoFijo(){
  const anio=S.empresa.anio;
  const el=document.getElementById('af-content');
  if(!S.activos.length){
    el.innerHTML=`<div class="empty"><div class="ei">🏗️</div>No hay activos fijos registrados.<br><br><button class="btn btn-p" onclick="abrirFormAF()">+ Registrar primer activo</button></div>`;
    return;
  }
  // KPIs
  let totValor=0,totAcum=0,totLibro=0,totDeprAnio=0;
  const filas=S.activos.map(b=>{
    const d=calcularDepreciacion(b,anio);
    totValor+=+b.valor||0;totAcum+=d.acumulada;totLibro+=d.valorLibro;totDeprAnio+=d.deprEsteAnio;
    const c=afCat(b.cat);
    const estado=d.totalmenteDepreciado?'<span class="badge br">Depreciado</span>':(d.deprEsteAnio>0?'<span class="badge bg">Activo</span>':'<span class="badge" style="background:rgba(130,130,130,.12);color:var(--mt)">Sin iniciar</span>');
    return `<tr>
      <td class="tl" style="font-size:12px">${b.desc}<div style="font-size:10px;color:var(--mt)">${c.lbl}</div></td>
      <td class="tl" style="font-family:var(--mono);font-size:10px">${b.fecha}</td>
      <td style="font-size:11px">${b.metodo==='acelerada'?'Acel. '+d.vidaUsada+'a':'Lineal '+d.vidaUsada+'a'}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtC(b.valor)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(d.deprEsteAnio)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--mt)">${fmtC(d.acumulada)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:600">${fmtC(d.valorLibro)}</td>
      <td style="text-align:center">${estado}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-i" onclick="editarAF('${b.id}')">✏️</button>
        <button class="btn btn-d" onclick="eliminarAF('${b.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Valor de Adquisición</div><div class="kpi-val">${fmtC(totValor)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Deprec. Acumulada</div><div class="kpi-val neg">${fmtC(totAcum)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Valor Libro</div><div class="kpi-val pos">${fmtC(totLibro)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Deprec. ${anio}</div><div class="kpi-val neg">${fmtC(totDeprAnio)}</div></div>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">BIEN</th><th class="tl">COMPRA</th><th class="tl">MÉTODO</th><th style="text-align:right">VALOR</th><th style="text-align:right">DEPR. ${anio}</th><th style="text-align:right">ACUMULADA</th><th style="text-align:right">V. LIBRO</th><th style="text-align:center">ESTADO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" colspan="3" style="font-weight:700">TOTALES</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totValor)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totDeprAnio)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totAcum)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totLibro)}</td><td colspan="2"></td></tr></tfoot>
  </table></div></div>
  ${totDeprAnio>0?`<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-p" onclick="generarAsientoDepreciacion()">📝 Generar asiento de depreciación ${anio}</button>
    <span style="font-size:11px;color:var(--mt)">Crea el asiento al 31/dic/${anio} por ${fmtC(totDeprAnio)} (cargo a gasto, abono a depreciación acumulada).</span>
  </div>`:''}
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">Vida útil según tabla normal del SII. La depreciación comienza el 1 de enero del año siguiente a la compra. El método acelerado usa 1/3 de la vida normal (mínimo 3 años).</div>`;
}


export {AF_CATEGORIAS, afCat, vidaAcelerada, calcularDepreciacion, abrirFormAF, onCatAF, cerrarFormAF, previewAF, guardarAF, editarAF, eliminarAF, generarAsientoDepreciacion, renderActivoFijo};
