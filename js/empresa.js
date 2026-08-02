// empresa.js — Datos de empresa y encabezado (updateHdr)
import {toast} from './core.js';
import {S} from './state.js';
import './storage.js';

// ═══ EMPRESA ═══
function fillEmpresaForm(){
  const e=S.empresa;
  ['nombre','rut','domicilio','giro','codigo','ciudad','comuna','rep','rutrep'].forEach(f=>{const el=document.getElementById('e-'+f);if(el)el.value=e[f]||'';});
  const ea=document.getElementById('e-anio');if(ea)ea.value=e.anio;
  const tr=document.getElementById('e-tasarenta');if(tr)tr.value=e.tasaRenta!=null?e.tasaRenta:25;
  const tp=document.getElementById('e-tasappm');if(tp)tp.value=e.tasaPPM!=null?e.tasaPPM:'';
}
async function saveEmpresa(){
  try{
    S.empresa={anio:+document.getElementById('e-anio').value||new Date().getFullYear(),nombre:document.getElementById('e-nombre').value.trim(),rut:document.getElementById('e-rut').value.trim(),domicilio:document.getElementById('e-domicilio').value.trim(),giro:document.getElementById('e-giro').value.trim(),codigo:document.getElementById('e-codigo').value.trim(),ciudad:document.getElementById('e-ciudad').value.trim(),comuna:document.getElementById('e-comuna').value.trim(),rep:document.getElementById('e-rep').value.trim(),rutrep:document.getElementById('e-rutrep').value.trim(),tasaRenta:+document.getElementById('e-tasarenta').value||25,tasaPPM:+document.getElementById('e-tasappm').value||0,regimen:'14D3'};
    document.getElementById('year-sel').value=S.empresa.anio;
    updateHdr();
    await window.storage.set('empresa',JSON.stringify(S.empresa));
    toast('✅ Empresa guardada');
  }catch(e){
    console.error('Error guardando empresa:',e);
    toast('❌ Error: '+(e.message||'sin detalle'),'e');
  }
}
function updateHdr(){
  document.getElementById('hdr-empresa').innerHTML=S.empresa.nombre?`<span>${S.empresa.nombre}</span> &nbsp;|&nbsp; Año ${S.empresa.anio}`:'Configure los datos de empresa';
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


export {fillEmpresaForm, saveEmpresa, updateHdr};
