// changelog-ui.js — Modal del historial de versiones
//
// Se abre desde el badge de versión del encabezado (que pasa a ser clicable) y
// desde una tarjeta en Configuración → Sistema.

import {APP_VERSION, CHANGELOG, ICONO, ETIQUETA, COLOR,
        marcarChangelogVisto, hayNovedades, novedadesDesdeUltimaVista} from './changelog.js';

const esc=t=>String(t==null?'':t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Rellena el badge del encabezado desde APP_VERSION y lo hace clicable. Así la
// versión se escribe en un solo sitio (changelog.js) y no en el HTML.
function initChangelogBadge(){
  const badge=document.getElementById('app-version');
  if(!badge)return;
  badge.textContent=APP_VERSION;
  badge.style.cursor='pointer';
  badge.title='Ver historial de versiones';
  badge.onclick=abrirChangelog;
  pintarPuntoNovedades();
}

// Punto junto a la versión cuando hay entradas que el usuario no ha visto.
function pintarPuntoNovedades(){
  const punto=document.getElementById('app-version-dot');
  if(!punto)return;
  punto.style.display=hayNovedades()?'inline-block':'none';
}

function abrirChangelog(){
  renderChangelog();
  const m=document.getElementById('changelog-modal');
  if(m)m.classList.add('open');
  // Al abrirlo se da por leído: el punto desaparece a partir de aquí.
  marcarChangelogVisto();
  pintarPuntoNovedades();
}

function cerrarChangelog(){
  const m=document.getElementById('changelog-modal');
  if(m)m.classList.remove('open');
}

function renderChangelog(){
  const box=document.getElementById('changelog-body');
  if(!box)return;
  // Cuántas entradas son nuevas para este usuario (se resaltan).
  const nuevas=novedadesDesdeUltimaVista();

  box.innerHTML=CHANGELOG.map((e,i)=>{
    const actual=e.v===APP_VERSION;
    const esNueva=i<nuevas;
    const porTipo={};
    (e.cambios||[]).forEach(c=>{(porTipo[c.tipo]||(porTipo[c.tipo]=[])).push(c.txt);});

    const bloques=['nuevo','arreglo','cambio'].filter(t=>porTipo[t]).map(t=>`
      <div style="margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:${COLOR[t]};margin-bottom:5px">
          ${ICONO[t]} ${ETIQUETA[t]}${porTipo[t].length>1?'s':''}
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.65;color:var(--tx)">
          ${porTipo[t].map(x=>`<li style="margin-bottom:4px">${esc(x)}</li>`).join('')}
        </ul>
      </div>`).join('');

    return `<div class="card" style="margin-bottom:12px;${esNueva?'border-color:var(--ach)':''}">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-family:var(--mono);font-size:13px;font-weight:700">${esc(e.v)}</span>
        ${actual?'<span class="badge bg" style="font-size:9px">EN USO</span>':''}
        ${esNueva&&!actual?'<span class="badge bi" style="font-size:9px">NUEVO</span>':''}
        <span style="font-size:11px;color:var(--mt);margin-left:auto">${esc(e.fecha)}</span>
      </div>
      ${e.titulo?`<div style="font-size:12px;color:var(--mt);margin-top:3px">${esc(e.titulo)}</div>`:''}
      ${bloques}
    </div>`;
  }).join('');
}

// Tarjeta para Configuración → Sistema
function bloqueChangelog(){
  const ultima=CHANGELOG[0];
  return `<table><tbody>
      <tr><td class="tl" style="font-size:12px">Versión en uso</td>
          <td style="text-align:right;font-family:var(--mono);font-size:12px"><strong>${esc(APP_VERSION)}</strong></td></tr>
      <tr><td class="tl" style="font-size:12px">Publicada</td>
          <td style="text-align:right;font-size:12px">${esc(ultima?ultima.fecha:'—')}</td></tr>
      <tr><td class="tl" style="font-size:12px">Versiones registradas</td>
          <td style="text-align:right;font-size:12px">${CHANGELOG.length}</td></tr>
    </tbody></table>
    <div style="margin-top:12px">
      <button class="btn btn-p" onclick="abrirChangelog()">📜 Ver historial de cambios</button>
    </div>
    <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
      También puedes abrirlo pulsando el número de versión en el encabezado.
      Si el número no coincide con el de la última entrega, el navegador está
      sirviendo una copia en caché: recarga con Ctrl+F5 (o borrando los datos del
      sitio en el teléfono).
    </div>`;
}

export {initChangelogBadge, abrirChangelog, cerrarChangelog, renderChangelog,
        bloqueChangelog, pintarPuntoNovedades};
