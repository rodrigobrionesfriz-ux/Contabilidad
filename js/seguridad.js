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
import {sincronizarACL, diagnosticarACL, aclDisponible, esErrorPermisos} from './acl.js';
import {esAdmin} from './auth.js';
import {AUTH} from './state.js';

let SEG={estado:null,corriendo:false,progreso:''};

// ── Diagnóstico ──
export async function diagnosticarSeguridad(){
  if(!aclDisponible()){toast('⚠️ Firestore no está conectado','e');return;}
  SEG.corriendo=true;SEG.progreso='Revisando la base…';renderSeguridad();
  const r={fecha:new Date().toLocaleString('es-CL')};
  const ids=EMPRESAS.lista.map(x=>x.id);
  try{
    const docs=await window.storage.docsSinEmpresa();
    r.totalDocs=docs.total;
    r.sinCampo=docs.faltan;
  }catch(e){
    // Que el recuento completo se rechace es la SEÑAL de que las reglas
    // endurecidas ya están publicadas: prohíben las consultas sin filtro.
    // Se pasa a verificar por empresa y contra lo guardado en este equipo.
    if(esErrorPermisos(e.message)){
      r.modoEstricto=true;
      try{
        const alc=await window.storage.docsAlcanzables(ids);
        const enNube=new Set(Object.values(alc.porEmpresa).flat());
        const locales=window.storage.clavesLocales(ids);
        r.totalDocs=alc.total;
        r.porEmpresa=alc.porEmpresa;
        r.huerfanos=locales.filter(k=>!enNube.has(k));
        r.sinCampo=[];
      }catch(e2){r.errorDocs=e2.message;}
    }else r.errorDocs=e.message;
  }
  try{
    const acl=await diagnosticarACL(EMPRESAS.todas);
    if(acl.ok){
      r.aclTotal=acl.total;r.aclFaltantes=acl.faltantes;
      r.aclDesfasadas=acl.desfasadas;r.aclSobrantes=acl.sobrantes;
    }else r.errorAcl=acl.error;
  }catch(e){r.errorAcl=e.message;}
  r.listo = !r.errorDocs && !r.errorAcl
    && (r.sinCampo||[]).length===0
    && (r.huerfanos||[]).length===0
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
    if(acl.error&&esErrorPermisos(acl.error)){
      SEG.corriendo=false;
      await diagnosticarSeguridad();
      toast('🔑 Falta abrir la colección empresas_acl en tus reglas — mira el detalle','e');
      return;
    }
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

// Vuelve a subir los documentos que este equipo tiene pero la nube ya no deja
// leer (quedaron sin marcar). Al subirlos, storage.js los marca con su empresa.
export async function repararDocumentos(){
  const e=SEG.estado;
  const claves=(e&&e.huerfanos)||[];
  if(!claves.length){toast('No hay documentos que reparar');return;}
  if(!confirm(
    `Reparar ${claves.length} documento(s)\n\n`+
    `Se van a subir a la nube desde ESTE equipo, sobrescribiendo lo que haya allá.\n`+
    `Hazlo desde el equipo que tenga la información más al día.\n\n¿Continuar?`))return;
  SEG.corriendo=true;SEG.progreso='Subiendo documentos…';renderSeguridad();
  try{
    const r=await window.storage.repararDocs(claves,(hechos,total)=>{
      SEG.progreso=`Subiendo documentos… ${hechos} de ${total}`;renderSeguridad();
    });
    SEG.corriendo=false;
    toast(r.fallos?`⚠️ ${r.hechos} reparado(s), ${r.fallos} con problemas`:`✅ ${r.hechos} documento(s) reparado(s)`,r.fallos?'e':'');
    await diagnosticarSeguridad();
  }catch(err){
    SEG.corriendo=false;SEG.progreso='';renderSeguridad();
    toast('❌ Error: '+err.message,'e');
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
// El huevo y la gallina: para crear las fichas de acceso hay que poder escribir
// en `empresas_acl`, pero esa colección no existe en las reglas antiguas, así
// que Firestore la rechaza por defecto. Se resuelve con una regla puente.
function bloqueReglaPuente(){
  const regla=
`match /empresas_acl/{empresaId} {
  allow read, write: if esUsuarioActivo();
}`;
  return `<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6;border-color:var(--warn)">
    🔑 <strong>Falta abrir la colección <code>empresas_acl</code> en tus reglas actuales.</strong><br>
    Es normal: esa colección es nueva y las reglas de hoy la bloquean por defecto, así que la app
    no puede crear las fichas de acceso.<br><br>
    <strong>1.</strong> En Firebase → Firestore Database → Reglas, agrega este bloque
    <em>dentro</em> de <code>match /databases/{database}/documents</code>, junto a los que ya tienes,
    y publica:
    <pre style="background:var(--sf2);padding:10px;border-radius:6px;margin:8px 0;font-size:11px;overflow:auto;white-space:pre">${regla}</pre>
    <strong>2.</strong> Vuelve acá y ejecuta <strong>Preparar aislamiento</strong> otra vez.<br>
    <strong>3.</strong> Cuando quede en verde, reemplaza TODAS las reglas por el archivo
    <code>firestore.rules</code> completo — ahí esta regla puente queda sustituida por la versión
    estricta (sólo el dueño o un administrador modifica los miembros).
  </div>`;
}

// "1 empresa tiene" vs "3 empresas tienen"
const plural=(n,uno,varios)=>`${n===1?'La':'Las'} ${n} ${n===1?uno:varios}`.replace(/^Las 1 /,'1 ').replace(/^La 1 /,'1 ').replace(/^Las (\d+) /,'$1 ');

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
    const huerf=(e.huerfanos||[]).length;
    detalle=`<table style="margin-top:12px"><tbody>
      ${e.errorDocs?fila(false,`No se pudieron revisar los documentos: ${e.errorDocs}`)
        :e.modoEstricto
        ?fila(huerf===0,
          huerf===0?`${plural(e.totalDocs,'documento alcanzable','documentos alcanzables')} — coinciden con los de este equipo`
                   :`${huerf} documento(s) de este equipo no se alcanzan en la nube`,
          huerf?lista(e.huerfanos):'')
        :fila(sinCampo===0,
          sinCampo===0?plural(e.totalDocs,'documento marcado con su empresa','documentos marcados con su empresa')
                      :`${sinCampo} de ${e.totalDocs} documentos sin marcar`,
          sinCampo?lista(e.sinCampo):'')}
      ${e.errorAcl?fila(false,`No se pudieron revisar las fichas de acceso: ${e.errorAcl}`)
        :fila(falt===0&&desf===0,
          falt===0&&desf===0?plural(EMPRESAS.todas.length,'empresa tiene su ficha de acceso al día','empresas tienen su ficha de acceso al día')
                            :`${falt} empresa(s) sin ficha, ${desf} desactualizada(s)`,
          lista([...(e.aclFaltantes||[]),...(e.aclDesfasadas||[])]))}
      ${sobr?fila(false,`${sobr} ficha(s) de empresas que ya no existen`,lista(e.aclSobrantes)):''}
    </tbody></table>
    <div style="font-size:10px;color:var(--mt);margin-top:8px">Última revisión: ${e.fecha}</div>
    ${esErrorPermisos(e.errorAcl)?bloqueReglaPuente():''}
    ${e.listo&&e.modoEstricto?`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6">
        🔒 <strong>El aislamiento está activo.</strong> Las reglas endurecidas ya rechazan las consultas
        sin filtro — por eso esta verificación pasó a contar los documentos empresa por empresa.
        Todo lo que tienes en este equipo se alcanza en la nube.<br><br>
        Si publicaste la versión con la escotilla de transición (la que trae
        <code>|| !hayAcl(emp)</code> en la función <code>miembro()</code>), bórrala y vuelve a publicar
        para que el aislamiento quede estricto. El <code>firestore.rules</code> del repositorio ya
        viene sin ella.
      </div>`
      :e.listo?`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6">
        ✅ <strong>La base está lista.</strong> Ya puedes publicar <code>firestore.rules</code> en
        Firebase → Firestore Database → Reglas. Después de publicarlas, vuelve acá y ejecuta
        la verificación otra vez: si todo sigue en verde, el aislamiento quedó activo.
      </div>`
      :e.modoEstricto?`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6;border-color:var(--warn)">
        ⚠️ <strong>Hay documentos de este equipo que la nube ya no deja leer.</strong> Suelen ser
        documentos que quedaron sin marcar antes de publicar las reglas.
        Usa <strong>🛠 Reparar documentos</strong>: los vuelve a subir desde este equipo y al subirlos
        quedan marcados. Hazlo desde el equipo que tenga la información más al día.
      </div>`
      :esErrorPermisos(e.errorAcl)?''
      :`<div class="info-tip" style="margin-top:10px;font-size:11px;line-height:1.6;border-color:var(--warn)">
        ⚠️ <strong>Todavía no publiques las reglas.</strong> Ejecuta primero “Preparar aislamiento”:
        si publicas ahora, la app dejará de leer los documentos que están sin marcar.
      </div>`}`;
  }

  return `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-i" onclick="diagnosticarSeguridad()" ${SEG.corriendo?'disabled':''}>🔎 Verificar</button>
      ${esAdmin()&&!(SEG.estado&&SEG.estado.modoEstricto)?`<button class="btn btn-p" onclick="prepararAislamiento()" ${SEG.corriendo?'disabled':''}>🔒 Preparar aislamiento</button>`:''}
      ${esAdmin()?`<button class="btn btn-g" onclick="repararAccesos()" ${SEG.corriendo?'disabled':''}>🛠 Reparar accesos</button>`:''}
      ${(SEG.estado&&(SEG.estado.huerfanos||[]).length)?`<button class="btn btn-d" onclick="repararDocumentos()" ${SEG.corriendo?'disabled':''}>🛠 Reparar documentos (${SEG.estado.huerfanos.length})</button>`:''}
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
