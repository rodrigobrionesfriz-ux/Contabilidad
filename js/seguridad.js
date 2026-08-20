// seguridad.js — Preparación y diagnóstico del aislamiento por empresa
//
// Las reglas endurecidas de Firestore (firestore.rules) necesitan dos cosas que
// la base todavía no tiene si el sistema viene funcionando desde antes:
//
//   1. Un documento en `empresas_acl` por cada empresa, con dueño y miembros.
//      Las reglas no pueden leer el catálogo porque es un JSON dentro de un
//      string; necesitan campos planos.
//   2. El campo `empresa` en cada documento de `contabilidad_data`. Las reglas
//      no pueden leer el prefijo del id en una consulta, sólo campos.
//
// Este módulo hace ambas cosas y luego verifica que quedaron bien. Hay que
// correrlo ANTES de publicar las reglas nuevas: mientras siguen las reglas
// antiguas todo esto está permitido; después ya no haría falta.

import {toast} from './core.js';
import {FS} from './firebase.js';
import {EMPRESAS, asignarDuenio} from './empresas.js';
import {sincronizarACL, diagnosticarACL, aclDisponible} from './acl.js';
import {esAdmin} from './auth.js';
import {AUTH} from './state.js';

let SEG={estado:null,corriendo:false,progreso:''};

// ── Diagnóstico ──
export async function diagnosticarSeguridad(){
  if(!aclDisponible()){toast('⚠️ Firestore no está conectado','e');return;}
  SEG.corriendo=true;SEG.progreso='Revisando la base…';renderSeguridad();
  const r={fecha:new Date().toLocaleString('es-CL')};
  try{
    const docs=await window.storage.docsSinEmpresa();
    r.totalDocs=docs.total;
    r.sinCampo=docs.faltan;
  }catch(e){r.errorDocs=e.message;}
  try{
    const acl=await diagnosticarACL(EMPRESAS.todas);
    if(acl.ok){
      r.aclTotal=acl.total;r.aclFaltantes=acl.faltantes;
      r.aclDesfasadas=acl.desfasadas;r.aclSobrantes=acl.sobrantes;
    }else r.errorAcl=acl.error;
  }catch(e){r.errorAcl=e.message;}
  r.listo = !r.errorDocs && !r.errorAcl
    && (r.sinCampo||[]).length===0
    && (r.aclFaltantes||[]).length===0
    && (r.aclDesfasadas||[]).length===0;
  SEG.estado=r;SEG.corriendo=false;SEG.progreso='';
  renderSeguridad();
  return r;
}

// ── Preparación (migración) ──
export async function prepararAislamiento(){
  if(!aclDisponible()){toast('⚠️ Firestore no está conectado','e');return;}
  if(!esAdmin()){toast('🚫 Sólo un administrador puede preparar el aislamiento','e');return;}
  if(!confirm(
    'Preparar el aislamiento por empresa\n\n'+
    'Se hará dos cosas en la base de la nube:\n'+
    '  1. Crear la ficha de acceso de cada empresa (dueño y usuarios con acceso)\n'+
    '  2. Marcar cada documento con la empresa a la que pertenece\n\n'+
    'No se borra ni se modifica ningún dato contable. Puede tardar un poco si\n'+
    'hay muchos documentos.\n\n¿Continuar?'))return;

  // Una empresa heredada (sin dueño) quedaría sin ningún miembro: tras publicar
  // las reglas sólo la alcanzarían los administradores. Se avisa y se ofrece
  // ponerla a nombre de quien está corriendo la migración.
  const huerfanas=EMPRESAS.todas.filter(e=>!e.creadoPor);
  if(huerfanas.length){
    const yo=((AUTH.user&&AUTH.user.email)||'').toLowerCase();
    const asignar=confirm(
      `Hay ${huerfanas.length} empresa(s) sin dueño:\n`+
      huerfanas.map(e=>'  · '+(e.nombre||e.id)).join('\n')+'\n\n'+
      `Cuando publiques las reglas, sólo los administradores podrán entrar en ellas.\n\n`+
      `Aceptar  → quedan a tu nombre (${yo}) y luego las compartes con quien corresponda\n`+
      `Cancelar → se dejan sin dueño (accesibles sólo para administradores)`);
    if(asignar){
      for(const e of huerfanas)await asignarDuenio(e.id,yo);
    }
  }

  SEG.corriendo=true;SEG.progreso='Creando fichas de acceso…';renderSeguridad();
  try{
    const acl=await sincronizarACL(EMPRESAS.todas);
    SEG.progreso=`Fichas de acceso: ${acl.escritos}. Revisando documentos…`;renderSeguridad();

    const docs=await window.storage.docsSinEmpresa();
    if(docs.faltan.length){
      await window.storage.estamparEmpresa(docs.faltan,(hechos,total)=>{
        SEG.progreso=`Marcando documentos… ${hechos} de ${total}`;renderSeguridad();
      });
    }
    SEG.progreso='Verificando…';renderSeguridad();
    SEG.corriendo=false;
    const r=await diagnosticarSeguridad();
    if(r&&r.listo)toast(`✅ Listo: ${acl.escritos} empresa(s) y ${docs.faltan.length} documento(s) preparados`);
    else toast('⚠️ La preparación terminó con observaciones — revisa el detalle','e');
  }catch(e){
    SEG.corriendo=false;SEG.progreso='';renderSeguridad();
    toast('❌ Error preparando: '+e.message,'e');
  }
}

// Vuelve a escribir las fichas de acceso desde el catálogo (sin tocar documentos)
export async function repararAccesos(){
  if(!aclDisponible()){toast('⚠️ Firestore no está conectado','e');return;}
  SEG.corriendo=true;SEG.progreso='Reescribiendo fichas de acceso…';renderSeguridad();
  try{
    const r=await sincronizarACL(EMPRESAS.todas,{limpiarSobrantes:esAdmin()});
    SEG.corriendo=false;
    toast(`✅ ${r.escritos} ficha(s) actualizada(s)${r.borrados?`, ${r.borrados} sobrante(s) eliminada(s)`:''}`);
    await diagnosticarSeguridad();
  }catch(e){
    SEG.corriendo=false;SEG.progreso='';renderSeguridad();
    toast('❌ Error: '+e.message,'e');
  }
}

// ── Vista ──
function lista(items,max=8){
  if(!items||!items.length)return '';
  const muestra=items.slice(0,max).join(', ');
  return `<div style="font-size:10px;color:var(--mt);margin-top:2px;font-family:var(--mono);word-break:break-all">${muestra}${items.length>max?` … (+${items.length-max})`:''}</div>`;
}

export function bloqueSeguridad(){
  const conectado=aclDisponible();
  if(!conectado){
    return `<div style="font-size:11px;color:var(--mt)">Firestore no está conectado en este momento, así que no se puede preparar ni verificar el aislamiento.</div>`;
  }
  const e=SEG.estado;
  let detalle='';
  if(SEG.corriendo){
    detalle=`<div style="font-size:11px;color:var(--ac);margin-top:10px">⏳ ${SEG.progreso||'Trabajando…'}</div>`;
  }else if(e){
    const fila=(ok,txt,extra)=>`<tr>
      <td class="tl" style="font-size:12px;width:22px">${ok?'✅':'⚠️'}</td>
      <td class="tl" style="font-size:12px">${txt}${extra||''}</td></tr>`;
    const sinCampo=(e.sinCampo||[]).length;
    const falt=(e.aclFaltantes||[]).length;
    const desf=(e.aclDesfasadas||[]).length;
    const sobr=(e.aclSobrantes||[]).length;
    detalle=`<table style="margin-top:12px"><tbody>
      ${e.errorDocs?fila(false,`No se pudieron revisar los documentos: ${e.errorDocs}`)
        :fila(sinCampo===0,
          sinCampo===0?`Los ${e.totalDocs} documentos están marcados con su empresa`
                      :`${sinCampo} de ${e.totalDocs} documentos sin marcar`,
          sinCampo?lista(e.sinCampo):'')}
      ${e.errorAcl?fila(false,`No se pudieron revisar las fichas de acceso: ${e.errorAcl}`)
        :fila(falt===0&&desf===0,
          falt===0&&desf===0?`Las ${EMPRESAS.todas.length} empresas tienen su ficha de acceso al día`
                            :`${falt} empresa(s) sin ficha, ${desf} desactualizada(s)`,
          lista([...(e.aclFaltantes||[]),...(e.aclDesfasadas||[])]))}
      ${sobr?fila(false,`${sobr} ficha(s) de empresas que ya no existen`,lista(e.aclSobrantes)):''}
    </tbody></table>
    <div style="font-size:10px;color:var(--mt);margin-top:8px">Última revisión: ${e.fecha}</div>
    ${e.listo?`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6">
        ✅ <strong>La base está lista.</strong> Ya puedes publicar <code>firestore.rules</code> en
        Firebase → Firestore Database → Reglas. Después de publicarlas, vuelve acá y ejecuta
        la verificación otra vez: si todo sigue en verde, el aislamiento quedó activo.
      </div>`
      :`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6;border-color:var(--warn)">
        ⚠️ <strong>Todavía no publiques las reglas.</strong> Ejecuta primero “Preparar aislamiento”:
        si publicas ahora, la app dejará de leer los documentos que están sin marcar.
      </div>`}`;
  }

  return `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-i" onclick="diagnosticarSeguridad()" ${SEG.corriendo?'disabled':''}>🔎 Verificar</button>
      ${esAdmin()?`<button class="btn btn-p" onclick="prepararAislamiento()" ${SEG.corriendo?'disabled':''}>🔒 Preparar aislamiento</button>
      <button class="btn btn-g" onclick="repararAccesos()" ${SEG.corriendo?'disabled':''}>🛠 Reparar accesos</button>`:''}
    </div>
    ${detalle}
    <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
      <strong>Preparar</strong> deja la base compatible con las reglas endurecidas: crea la ficha de acceso
      de cada empresa y marca cada documento con su empresa. No modifica datos contables.<br>
      <strong>Reparar accesos</strong> reescribe las fichas desde el catálogo; úsalo si compartiste una
      empresa y el otro usuario sigue sin verla.
    </div>`;
}

// Re-render de la sección Sistema (donde vive esta tarjeta)
function renderSeguridad(){
  if(window.renderSistema&&document.getElementById('sistema-content'))window.renderSistema();
}

export {SEG};
