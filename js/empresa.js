// empresa.js — Datos de empresa y encabezado (updateHdr)
import {toast} from './core.js';
import {S} from './state.js';
import {REGIMENES, regimenInfo, tasaIDPC, tasaPPM, REGIMEN_DEFAULT, regimenLbl} from './regimenes.js';
import {EMPRESAS} from './empresas.js';
import './storage.js';

// ── Régimen tributario de la empresa activa ──
// El régimen se elige al crear la empresa y vive en el catálogo (_empresas).
// Esta función lo baja a S.empresa después de leer el documento 'empresa',
// y rellena las tasas SOLO si la empresa aún no las tenía definidas — nunca
// pisa una tasa que el usuario haya ajustado a mano.
function aplicarRegimenEmpresa(){
  const cat=(EMPRESAS.todas||[]).find(e=>e.id===EMPRESAS.activa);
  const delCatalogo=cat&&cat.regimen;
  const yaTenia=!!S.empresa.regimen;
  const k=S.empresa.regimen||delCatalogo||REGIMEN_DEFAULT;
  S.empresa.regimen=delCatalogo||k;
  if(!yaTenia){
    const anio=S.empresa.anio||new Date().getFullYear();
    const t=tasaIDPC(S.empresa.regimen,anio);
    const p=tasaPPM(S.empresa.regimen,anio);
    if(S.empresa.tasaRenta==null)S.empresa.tasaRenta=t;
    if(S.empresa.tasaPPM==null&&p!=null)S.empresa.tasaPPM=p;
  }
  return S.empresa.regimen;
}

// Rellena el selector de régimen y su panel de parámetros en la ficha Empresa
function pintarRegimen(){
  const sel=document.getElementById('e-regimen');
  if(!sel)return;
  if(sel.tagName==='SELECT'&&!sel.options.length)
    sel.innerHTML=REGIMENES.map(r=>`<option value="${r.k}">${r.corto} — ${r.nm}</option>`).join('');
  if(sel.tagName==='SELECT')sel.value=S.empresa.regimen||REGIMEN_DEFAULT;
  onRegimenEmpresaChange(true);
}

// Al cambiar el régimen en la ficha, se recalculan las tasas sugeridas.
// `soloPintar` evita sobrescribir las tasas cuando sólo estamos refrescando.
function onRegimenEmpresaChange(soloPintar){
  const sel=document.getElementById('e-regimen');
  if(!sel)return;
  const r=regimenInfo(sel.value);
  const anio=+((document.getElementById('e-anio')||{}).value)||S.empresa.anio||new Date().getFullYear();
  const t=tasaIDPC(r.k,anio), pp=tasaPPM(r.k,anio);
  if(!soloPintar){
    const tr=document.getElementById('e-tasarenta');if(tr)tr.value=t;
    const tp=document.getElementById('e-tasappm');if(tp&&pp!=null)tp.value=pp;
  }
  const d=document.getElementById('e-regimen-desc');
  if(d){
    const pct=v=>String(v).replace('.',',');
    const uf=v=>v?v.toLocaleString('es-CL')+' UF':'sin tope';
    d.innerHTML=`<strong>${r.nm}</strong> · ${r.art}<br>${r.desc}
      <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-family:var(--mono);font-size:11px">
        <span>IDPC <strong style="color:var(--acc)">${pct(t)}%</strong></span>
        <span>PPM <strong style="color:var(--acc)">${pp==null?'variable':pct(pp)+'%'}</strong></span>
        <span>Contabilidad <strong>${r.contabilidad}</strong></span>
        <span>Corr. monetaria <strong>${r.correccionMonetaria?'sí':'no'}</strong></span>
        <span>Depreciación <strong>${r.deprInstantanea?'instantánea':'vida útil'}</strong></span>
        <span>Crédito IDPC <strong>${r.creditoIDPC}%</strong></span>
        <span>Tope ingresos <strong>${uf(r.topeIngresosUF)}</strong></span>
      </div>
      ${r.nota?`<div style="margin-top:6px;color:var(--warn)">⚠ ${r.nota}</div>`:''}`;
  }
}

// ═══ EMPRESA ═══
function fillEmpresaForm(){
  const e=S.empresa;
  ['nombre','rut','domicilio','giro','codigo','ciudad','comuna','rep','rutrep'].forEach(f=>{const el=document.getElementById('e-'+f);if(el)el.value=e[f]||'';});
  const ea=document.getElementById('e-anio');if(ea)ea.value=e.anio;
  const tr=document.getElementById('e-tasarenta');if(tr)tr.value=e.tasaRenta!=null?e.tasaRenta:25;
  const tp=document.getElementById('e-tasappm');if(tp)tp.value=e.tasaPPM!=null?e.tasaPPM:'';
  pintarRegimen();
}
async function saveEmpresa(){
  try{
    S.empresa={anio:+document.getElementById('e-anio').value||new Date().getFullYear(),nombre:document.getElementById('e-nombre').value.trim(),rut:document.getElementById('e-rut').value.trim(),domicilio:document.getElementById('e-domicilio').value.trim(),giro:document.getElementById('e-giro').value.trim(),codigo:document.getElementById('e-codigo').value.trim(),ciudad:document.getElementById('e-ciudad').value.trim(),comuna:document.getElementById('e-comuna').value.trim(),rep:document.getElementById('e-rep').value.trim(),rutrep:document.getElementById('e-rutrep').value.trim(),tasaRenta:+document.getElementById('e-tasarenta').value||25,tasaPPM:+document.getElementById('e-tasappm').value||0,regimen:(document.getElementById('e-regimen')||{}).value||S.empresa.regimen||REGIMEN_DEFAULT};
    const ys=document.getElementById('year-sel');if(ys)ys.value=S.empresa.anio;
    updateHdr();
    await window.storage.set('empresa',JSON.stringify(S.empresa));
    // El régimen decide qué secciones tienen sentido: refrescar el menú
    try{if(window.aplicarPermisosUI)window.aplicarPermisosUI();}catch(e){}
    pintarRegimen();
    toast('✅ Empresa guardada');
  }catch(e){
    console.error('Error guardando empresa:',e);
    toast('❌ Error: '+(e.message||'sin detalle'),'e');
  }
}
function updateHdr(){
  // El nombre de la empresa se muestra en el bloque de contexto de la barra
  // lateral (antes estaba en el header, que ahora sólo lleva título y usuario).
  const ctx=document.getElementById('ctx-empresa-nombre');
  if(ctx)ctx.textContent=S.empresa.nombre||'Configura los datos de empresa';
  const hdr=document.getElementById('hdr-empresa');
  if(hdr)hdr.innerHTML=S.empresa.nombre?`<span>${S.empresa.nombre}</span> &nbsp;|&nbsp; Año ${S.empresa.anio}`:'Configure los datos de empresa';
  const vs=document.getElementById('ventas-sub');if(vs)vs.textContent='Registro por documento — '+S.empresa.anio;
  const cs=document.getElementById('compras-sub');if(cs)cs.textContent='Registro por documento — '+S.empresa.anio;
  const nba=document.getElementById('nb-as');if(nba)nba.textContent=S.asientos.length||'0';
  const nbaf=document.getElementById('nb-af');if(nbaf)nbaf.textContent=(S.activos&&S.activos.length)||'0';
  const nbrem=document.getElementById('nb-rem');if(nbrem)nbrem.textContent=(S.trabajadores&&S.trabajadores.length)||'0';
  const nbx=document.getElementById('nb-aux');if(nbx){
    const cli=new Set(),prv=new Set();
    S.ventas.forEach(v=>{if(v.rutCodigo&&v.formaPago==='clientes')cli.add(v.rutCodigo);});
    S.compras.forEach(c=>{if(c.rutCodigo)prv.add(c.rutCodigo);});
    nbx.textContent=(cli.size+prv.size)||'0';
  }
}


export {fillEmpresaForm, saveEmpresa, updateHdr, aplicarRegimenEmpresa, onRegimenEmpresaChange, pintarRegimen};
