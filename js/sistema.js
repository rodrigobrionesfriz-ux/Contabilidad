// sistema.js — Sección "Sistema y Respaldos" (Configuración)
//
// Reúne todo lo que antes vivía apretado en la barra superior: estado de
// sincronización, respaldos en la nube, exportar/importar Excel, carpeta de
// auto-guardado, tema y guardado manual. La barra superior quedó solo con el
// título, el último guardado y el usuario.
//
// Los indicadores (#fs-indicator, #db-indicator) siguen existiendo en el
// header oculto porque varios módulos escriben directo sobre ellos; acá se
// clonan sus contenidos para mostrarlos en la tarjeta de estado.

import {S, AUTH} from './state.js';
import {TEMAS} from './tema.js';
import {bloqueSeguridad} from './seguridad.js';
import {AG, OPCIONES_INTERVALO, etiquetaIntervalo} from './autoguardado.js';
import {DISPOSITIVO} from './dispositivo.js';
import {bloqueChangelog} from './changelog-ui.js';

// Lee el texto que los módulos de sincronización dejaron en los indicadores
function estadoTexto(id,fallback){
  const el=document.getElementById(id);
  const t=(el&&el.textContent||'').trim();
  return t||fallback;
}

function renderSistema(){
  const el=document.getElementById('sistema-content');if(!el)return;
  const guardado=estadoTexto('save-indicator','—');
  const nube=estadoTexto('fs-indicator','Sin información');
  const excel=estadoTexto('db-indicator','Sin carpeta vinculada');
  const temaActual=document.documentElement.getAttribute('data-theme')||'dark';

  const tarjeta=(icono,titulo,sub,cuerpo)=>`<div class="card" style="margin-bottom:0">
    <div style="font-size:15px;font-weight:700">${icono} ${titulo}</div>
    <div style="font-size:11px;color:var(--mt);margin-top:3px;margin-bottom:12px;line-height:1.5">${sub}</div>
    ${cuerpo}
  </div>`;

  el.innerHTML=`
    <div class="info-tip" style="margin-bottom:14px;font-size:11px;line-height:1.6">
      💡 La barra superior quedó solo con el título, el estado de guardado, el botón 💾 y tu usuario.
      Todo lo demás vive acá. La <strong>empresa activa</strong> y el <strong>ejercicio</strong> se cambian
      desde el bloque de arriba del menú lateral, y el buscador global sigue abriéndose con <strong>Ctrl+K</strong>
      desde cualquier sección.
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px">

      ${tarjeta('📜','Versión e historial',
        'Qué versión está corriendo en este dispositivo y qué cambió en cada entrega.',
        bloqueChangelog())}

      ${tarjeta('📡','Estado de sincronización',
        'Cómo está guardada tu información en este momento.',
        `<table><tbody>
          <tr><td class="tl" style="font-size:12px">Último guardado</td><td style="text-align:right;font-size:12px">${guardado}</td></tr>
          <tr><td class="tl" style="font-size:12px">Nube (Firestore)</td><td style="text-align:right;font-size:12px">${nube}</td></tr>
          <tr><td class="tl" style="font-size:12px">Carpeta Excel</td><td style="text-align:right;font-size:12px">${excel}</td></tr>
        </tbody></table>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-p" onclick="saveAll().then(renderSistema)">💾 Guardar todo ahora</button>
          <button class="btn btn-g" onclick="renderSistema()">🔄 Actualizar</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:8px">El sistema guarda solo cada vez que registras algo; este botón fuerza un guardado inmediato.</div>`)}

      ${tarjeta('⏱','Guardado automático',
        'Guarda solo cada cierto rato mientras trabajas, y también al cambiar de pestaña o cerrar. La preferencia queda en este dispositivo.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn ${AG.activo?'btn-p':'btn-g'}" onclick="setAutoguardado(${!AG.activo})">
            ${AG.activo?'✅ Activado':'⏸ Desactivado'}
          </button>
          <select onchange="setIntervaloAutoguardado(this.value)" ${AG.activo?'':'disabled'} style="width:auto">
            ${OPCIONES_INTERVALO.map(s=>`<option value="${s}" ${s===AG.segundos?'selected':''}>Cada ${etiquetaIntervalo(s)}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
          ${AG.activo
            ? `Guarda cada <strong>${etiquetaIntervalo(AG.segundos)}</strong> si hay algo pendiente${AG.ultimo?` · último automático a las ${AG.ultimo.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}`:''}.`
            : 'Con el automático apagado, el botón 💾 de la barra superior se pone <strong>amarillo</strong> cuando hay algo sin guardar.'}
          <br>Al cerrar sesión o cerrar la pestaña con trabajo pendiente, el sistema ofrece guardarlo antes de salir.
        </div>`)}

      ${tarjeta('🖥','Este dispositivo',
        'Cada equipo donde abres la app tiene su propia identidad. Firma lo que guarda, para que dos equipos no se pisen sin que nadie se entere.',
        `<table><tbody>
          <tr><td class="tl" style="font-size:12px">Nombre</td><td style="text-align:right;font-size:12px"><strong>${DISPOSITIVO.nombre}</strong></td></tr>
          <tr><td class="tl" style="font-size:12px">Identificador</td><td style="text-align:right;font-size:11px;font-family:var(--mono);color:var(--mt)">${DISPOSITIVO.id}</td></tr>
        </tbody></table>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-g" onclick="renombrarEsteDispositivo()">✏️ Ponerle nombre</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
          Ponle un nombre reconocible —"PC oficina", "Celular Rodrigo"— y los avisos de
          cambios simultáneos se van a entender de una.
        </div>`)}

      ${tarjeta('☁️','Respaldo en la nube',
        'Copia de todos tus datos en Firestore. Útil para abrir el sistema en otro equipo o recuperar información.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-i" onclick="fsBackupToCloud()" title="Subir todos los datos locales a Firestore">☁️⬆ Subir a la nube</button>
          <button class="btn btn-i" onclick="fsRestoreFromCloud()" title="Descargar los datos desde Firestore a este dispositivo">☁️⬇ Descargar de la nube</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          <strong>Descargar</strong> reemplaza lo que tengas en este dispositivo con lo que hay en la nube. Úsalo al entrar desde un equipo nuevo.
        </div>`)}

      ${tarjeta('📊','Respaldo en Excel',
        'Descarga toda la base de datos en un archivo, o restaura desde uno previo.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-i" onclick="exportarExcelManual()">📥 Exportar Excel</button>
          <button class="btn btn-i" onclick="document.getElementById('imp-bd-file').click()">📤 Importar Excel</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          El archivo incluye empresa, ventas, compras, honorarios, asientos, apertura, activos fijos, trabajadores, centros de costo, plan de cuentas y auxiliares.
        </div>`)}

      ${tarjeta('🔗','Auto-guardado en carpeta',
        'Vincula una carpeta del computador para que el respaldo Excel se escriba solo cada vez que guardas.',
        `<button class="btn btn-s" onclick="conectarBD()" id="btn-conectar-bd">🔗 Conectar carpeta</button>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          Requiere un navegador con soporte para acceso a archivos (Chrome o Edge de escritorio). Si no está disponible, usa Exportar / Importar.
        </div>`)}

      ${tarjeta('🎨','Apariencia',
        'Tema de la interfaz. La preferencia queda guardada en este dispositivo.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          ${TEMAS.map(t=>`<button class="btn ${t.id===temaActual?'btn-p':'btn-g'}" onclick="aplicarTema('${t.id}');renderSistema()">${t.ico} ${t.nm}</button>`).join('')}
        </div>`)}

      ${tarjeta('🔎','Búsqueda global',
        'Encuentra documentos, asientos, cuentas y personas desde cualquier sección.',
        `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-i" onclick="abrirBusqueda()">🔍 Abrir buscador</button>
          <span style="font-size:11px;color:var(--mt)">Atajo: <strong style="font-family:var(--mono)">Ctrl + K</strong></span>
        </div>`)}

    </div>

    <div class="card" style="margin-top:14px">
      <div style="font-size:15px;font-weight:700">🔒 Aislamiento por empresa</div>
      <div style="font-size:11px;color:var(--mt);margin-top:3px;margin-bottom:12px;line-height:1.5">
        Hoy cada usuario <em>ve</em> sólo sus empresas, pero los datos siguen siendo alcanzables para
        cualquier usuario activo con conocimientos técnicos. Para que el aislamiento sea real hay que
        publicar las reglas endurecidas (<code>firestore.rules</code>) — y antes, dejar la base preparada.
      </div>
      ${bloqueSeguridad()}
    </div>

    <div style="margin-top:16px;font-size:10px;color:var(--mt)">
      Sesión iniciada como <strong>${AUTH.user?.nombre||AUTH.user?.email||'—'}</strong>${AUTH.user?.rol?` · ${AUTH.user.rol}`:''} ·
      Empresa activa <strong>${S.empresa.nombre||'(sin nombre)'}</strong> · Ejercicio <strong>${S.empresa.anio}</strong>
    </div>`;
}

export {renderSistema};
