// audit.js — Vista del registro de actividad (solo admin)
// logAccion vive en firebase.js (capa base). Aquí solo la vista.
import {FS} from './firebase.js';
import {esAdmin} from './auth.js';

async function renderAuditLog(){
  const el=document.getElementById('audit-content');
  if(!esAdmin()){
    el.innerHTML='<div class="empty"><div class="ei">🚫</div>Solo los administradores pueden ver el registro de actividad.</div>';return;
  }
  if(!FS.enabled||!FS.db){
    el.innerHTML='<div class="empty"><div class="ei">☁️</div>El registro de actividad requiere conexión con Firestore.</div>';return;
  }
  el.innerHTML='<div style="padding:20px;text-align:center;color:var(--mt)">⏳ Cargando actividad...</div>';
  try{
    const snap=await FS.db.collection('audit_log').orderBy('ts','desc').limit(200).get();
    if(snap.empty){el.innerHTML='<div class="empty"><div class="ei">📜</div>No se ha editado ni eliminado ningún comprobante.</div>';return;}
    const icoAccion=a=>{
      if(a.includes('creó')||a.includes('registró')||a.includes('Creó'))return '➕';
      if(a.includes('eliminó')||a.includes('Eliminó'))return '🗑';
      if(a.includes('anuló')||a.includes('Anuló'))return '🚫';
      if(a.includes('editó')||a.includes('actualizó')||a.includes('Editó'))return '✏️';
      if(a.includes('cerró')||a.includes('cierre'))return '🔒';
      return '📝';
    };
    let rows='';
    snap.forEach(doc=>{
      const d=doc.data();
      const fecha=d.tsLocal?new Date(d.tsLocal):(d.ts&&d.ts.toDate?d.ts.toDate():null);
      const fechaStr=fecha?fecha.toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      rows+=`<tr>
        <td style="text-align:center;font-size:15px">${icoAccion(d.accion||'')}</td>
        <td class="tl" style="font-size:12px">${d.accion||''}${d.detalle?`<div style="font-size:10px;color:var(--mt)">${d.detalle}</div>`:''}</td>
        <td class="tl" style="font-size:11px">${d.nombre||d.usuario||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:10px;color:var(--mt)">${fechaStr}</td>
      </tr>`;
    });
    el.innerHTML=`<div class="info-tip" style="margin-bottom:14px">📜 Últimas ${snap.size} acciones registradas. Sólo se guardan las <strong>ediciones y eliminaciones de comprobantes</strong> —incluidas las anulaciones y el borrado de una empresa con sus datos—, que es lo que hay que poder reconstruir después. El resto de la operación diaria no se registra.</div>
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th style="width:40px"></th><th class="tl">ACCIÓN</th><th class="tl">USUARIO</th><th class="tl">FECHA</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }catch(e){
    el.innerHTML='<div class="empty"><div class="ei">⚠️</div>Error al cargar el registro: '+e.message+'</div>';
  }
}


export {renderAuditLog};
