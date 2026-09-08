// asigcc.js — Asignación manual de centros de costo.
//
// El centro de costo se captura normalmente al cargar el documento: en el
// Libro de Compras cada línea de la distribución del gasto lleva el suyo, y en
// los asientos manuales cada línea también. Pero eso no siempre pasa: las
// importaciones masivas del Excel del SII entran sin centro, y en la carga del
// día a día es fácil dejarlo en blanco.
//
// El problema es que un gasto sin centro NO aparece en el costo acumulado del
// predio ni del cuartel, así que la capitalización y el control de costos
// quedan cortos sin que nada avise. Esta pantalla es el repaso: junta TODOS los
// movimientos de cuentas de gasto y costo que quedaron sin centro y permite
// asignarlos uno por uno o en bloque, escribiendo en el mismo campo `cc` que ya
// lee costoAcumulado().
//
// Alcance: sólo cuentas de RESULTADO del lado del gasto, o sea los grupos
//   31 costo de explotación · 32 gastos de administración y ventas
//   33 otros gastos operacionales · 34 gastos no operacionales
//   35 corrección monetaria
// Los ingresos (grupo 4) quedan fuera: no se costean por centro. El grupo 36
// (impuesto a la renta) tampoco, porque no es un costo asignable a un predio.

import {S} from './state.js';
import {toast, fmtC, MESES, pdcNm, dteC} from './core.js';
import {ccOpts, ccNombre, centros} from './centroscosto.js';
import {logAccion} from './firebase.js';
import './storage.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Cuenta con la que genDiario registra los honorarios del mes. Vive aquí
// duplicada a propósito: si algún día se hace configurable, este es el segundo
// lugar que hay que tocar y el comentario lo deja dicho.
const CUENTA_HONORARIOS = '3202019';

// ¿Es una cuenta de gasto o costo, imputable (7 dígitos)?
const esCosteable = cd => /^3[1-5]\d{5}$/.test(String(cd || ''));

// ── Estado de la pantalla ──
// OJO: se publica en window desde app.js. Nunca reasignar el objeto —mutar sus
// propiedades—, o window.ACC quedaría apuntando al objeto viejo.
const ACC = {
  mes: '', cuenta: '', origen: '', ver: 'pendientes', q: '',
  sel: {},      // {clave: true} de los movimientos marcados
  bulk: '',     // centro elegido para la asignación en bloque
};

export function resetAsigCC() {
  ACC.mes = ''; ACC.cuenta = ''; ACC.origen = ''; ACC.ver = 'pendientes';
  ACC.q = ''; ACC.sel = {}; ACC.bulk = '';
}

const ORIGENES = {
  compra:    { ic: '🧾', nm: 'Compra',    c: '#f0883e' },
  asiento:   { ic: '✏️', nm: 'Asiento',   c: '#3fb950' },
  honorario: { ic: '📝', nm: 'Honorario', c: '#c377dc' },
};

// ═══════════════════════════════════════════════════════════════════════
// RECOLECCIÓN
// ═══════════════════════════════════════════════════════════════════════
//
// Se recorren las mismas fuentes que costoAcumulado(), para que lo que esta
// pantalla dice que falta sea exactamente lo que al centro le falta.
export function movimientosGasto() {
  const out = [];

  // ── Compras: una fila por línea de la distribución del gasto ──
  (S.compras || []).forEach(d => {
    // Los documentos convertidos a asiento manual ya no generan comprobante
    // automático: su centro se asigna en el asiento, no aquí, o saldría dos veces.
    if (d.excluidoAuto) return;
    const signo = (dteC(d.tipoDTE) || {}).signo || 1;
    const nmDoc = (dteC(d.tipoDTE) || {}).nm || ('DTE ' + d.tipoDTE);
    (d.dist || []).forEach((l, i) => {
      const monto = (+l.monto || 0) * signo;
      if (!esCosteable(l.cuenta) || !monto) return;
      out.push({
        k: `c|${d.id}|${i}`, tipo: 'compra',
        fecha: d.fecha || '', cuenta: l.cuenta, monto,
        doc: `${nmDoc} N°${d.numero || ''}`,
        glosa: d.razonSocial || '',
        cc: l.cc || '',
        // Un documento puede tener el centro puesto a nivel de documento
        // completo; costoAcumulado lo respeta mientras ninguna línea tenga
        // el suyo. Lo mostramos como heredado para no pedir dos veces lo mismo.
        ccDoc: (!l.cc && !(d.dist || []).some(x => x.cc)) ? (d.cc || '') : '',
        ir: `corregirDesdeDiario('compras','${d.id}')`,
      });
    });
  });

  // ── Asientos manuales: una fila por línea de gasto ──
  (S.asientos || []).forEach(a => {
    // Los asientos de cierre y capitalización mueven costos YA contados en el
    // centro; asignarles centro los duplicaría en el acumulado.
    if (a.anulado || a.tipoCierreCC) return;
    (a.movs || []).forEach((m, i) => {
      const monto = (+m.debe || 0) - (+m.haber || 0);
      if (!esCosteable(m.cd) || !monto) return;
      out.push({
        k: `a|${a.id}|${i}`, tipo: 'asiento',
        fecha: a.fecha || '', cuenta: m.cd, monto,
        doc: `Asiento N°${a.n}`,
        glosa: [a.glosa || '', m.desc || ''].filter(Boolean).join(' — '),
        cc: m.cc || '', ccDoc: '',
        ir: `editarAsientoRef(${a.n})`,
      });
    });
  });

  // ── Honorarios: una fila por boleta ──
  (S.honorarios || []).forEach((hn, i) => {
    const bruto = +hn.bruto || 0;
    if (!bruto) return;
    const mes = String(hn.mes || 1).padStart(2, '0');
    out.push({
      k: `h|${i}`, tipo: 'honorario',
      fecha: `${S.empresa.anio}-${mes}-28`, cuenta: CUENTA_HONORARIOS, monto: bruto,
      doc: `Boleta ${MESES[(+hn.mes || 1) - 1] || ''}`,
      glosa: [hn.nombre || '', hn.rut || ''].filter(Boolean).join(' · '),
      cc: hn.cc || '', ccDoc: '',
      ir: `nav('honorarios')`,
    });
  });

  return out.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

// Centro efectivo: el propio, o el heredado del documento
const ccEfectivo = m => m.cc || m.ccDoc || '';

function filtrar(movs) {
  const q = ACC.q.toLowerCase().trim();
  return movs.filter(m => {
    const asignado = !!ccEfectivo(m);
    if (ACC.ver === 'pendientes' && asignado) return false;
    if (ACC.ver === 'asignados' && !asignado) return false;
    if (ACC.mes && +String(m.fecha).slice(5, 7) !== +ACC.mes) return false;
    if (ACC.cuenta && m.cuenta !== ACC.cuenta) return false;
    if (ACC.origen && m.tipo !== ACC.origen) return false;
    if (!q) return true;
    return (m.doc + ' ' + m.glosa + ' ' + m.cuenta + ' ' + (pdcNm(m.cuenta) || ''))
      .toLowerCase().includes(q);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ESCRITURA
// ═══════════════════════════════════════════════════════════════════════
//
// Se escribe en el mismo campo que ya existía: `dist[i].cc` en compras,
// `movs[i].cc` en asientos y `cc` en la boleta de honorarios. No hay estructura
// nueva ni migración: un gasto asignado desde aquí es indistinguible de uno
// que se capturó con su centro desde el principio.
//
// Devuelve el conjunto de colecciones tocadas, para guardar cada una una sola
// vez aunque se asignen doscientas líneas de golpe.
function aplicar(clave, cc) {
  const [tipo, id, idx] = String(clave).split('|');
  if (tipo === 'c') {
    const d = (S.compras || []).find(x => String(x.id) === id);
    if (!d || !d.dist || !d.dist[+idx]) return null;
    d.dist[+idx].cc = cc;
    return 'compras';
  }
  if (tipo === 'a') {
    const a = (S.asientos || []).find(x => String(x.id) === id);
    if (!a || !a.movs || !a.movs[+idx]) return null;
    a.movs[+idx].cc = cc;
    return 'asientos';
  }
  if (tipo === 'h') {
    const hn = (S.honorarios || [])[+id];
    if (!hn) return null;
    hn.cc = cc;
    return 'honorarios';
  }
  return null;
}

async function guardar(colecciones) {
  const anio = S.empresa.anio;
  const mapa = {
    compras:    () => window.storage.set('compras-' + anio, JSON.stringify(S.compras)),
    asientos:   () => window.storage.set('asientos-' + anio, JSON.stringify(S.asientos)),
    honorarios: () => window.storage.set('honorarios-' + anio, JSON.stringify(S.honorarios)),
  };
  try {
    await Promise.all([...colecciones].map(c => mapa[c] && mapa[c]()));
    return true;
  } catch (e) {
    toast('❌ No se pudo guardar la asignación: ' + e.message, 'e');
    return false;
  }
}

// Asignar una sola línea (el select de la fila)
export async function setCCMov(clave, cc) {
  const col = aplicar(clave, cc);
  if (!col) { toast('⚠️ No se encontró el movimiento', 'e'); return; }
  if (!await guardar(new Set([col]))) return;
  logAccion('Asignó centro de costo', cc ? `1 movimiento → ${ccNombre(cc) || cc}` : '1 movimiento sin centro');
  toast(cc ? `📊 Centro asignado: ${ccNombre(cc) || cc}` : '📊 Centro de costo quitado');
  renderAsigCC();
}

// ── Selección para asignar en bloque ──
export function toggleSelCC(clave) {
  if (ACC.sel[clave]) delete ACC.sel[clave]; else ACC.sel[clave] = true;
  pintarBarraSel();
}

export function selTodosCC(visibles) {
  // `visibles` llega como lista de claves separadas por coma desde el onclick
  const claves = String(visibles || '').split(',').filter(Boolean);
  const todosMarcados = claves.length && claves.every(k => ACC.sel[k]);
  claves.forEach(k => { if (todosMarcados) delete ACC.sel[k]; else ACC.sel[k] = true; });
  renderAsigCC();
}

export function limpiarSelCC() { ACC.sel = {}; renderAsigCC(); }

export function setBulkCC(v) { ACC.bulk = v; pintarBarraSel(); }

export async function asignarSelCC() {
  const claves = Object.keys(ACC.sel);
  if (!claves.length) { toast('⚠️ No hay movimientos seleccionados', 'e'); return; }
  if (!ACC.bulk) { toast('⚠️ Elige el centro de costo que quieres aplicar', 'e'); return; }
  const nombre = ccNombre(ACC.bulk) || ACC.bulk;
  if (!confirm(`¿Asignar «${nombre}» a ${claves.length} movimiento(s)?\n\nSe puede volver a cambiar uno por uno desde esta misma pantalla.`)) return;

  const cols = new Set();
  let n = 0;
  claves.forEach(k => { const c = aplicar(k, ACC.bulk); if (c) { cols.add(c); n++; } });
  if (!n) { toast('⚠️ No se pudo asignar ningún movimiento', 'e'); return; }
  if (!await guardar(cols)) return;

  logAccion('Asignó centro de costo', `${n} movimientos → ${nombre}`);
  ACC.sel = {};
  toast(`📊 ${n} movimiento${n === 1 ? '' : 's'} asignado${n === 1 ? '' : 's'} a ${nombre}`);
  renderAsigCC();
}

// ── Filtros ──
export function setAsigCC(campo, valor) {
  ACC[campo] = valor;
  if (campo !== 'q') ACC.sel = {};   // cambiar de filtro no debe arrastrar selección invisible
  renderAsigCC();
}
export function limpiarFiltrosCC() {
  ACC.mes = ''; ACC.cuenta = ''; ACC.origen = ''; ACC.ver = 'pendientes'; ACC.q = '';
  ACC.sel = {};
  renderAsigCC();
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

// Cuántos gastos quedan sin centro. Lo usa también el Estado de Resultados
// para avisar sin que haya que entrar a esta pantalla.
export function pendientesCC() {
  const movs = movimientosGasto().filter(m => !ccEfectivo(m));
  return { n: movs.length, monto: movs.reduce((s, m) => s + m.monto, 0) };
}

export function renderAsigCC() {
  const el = document.getElementById('asigcc-content');
  if (!el) return;

  const todos = movimientosGasto();
  const pend = todos.filter(m => !ccEfectivo(m));
  const hayCentros = (centros() || []).length > 0;

  if (!hayCentros) {
    el.innerHTML = `<div class="card">
      <div class="empty"><div class="ei">📊</div>
        <div style="font-weight:600;margin-bottom:6px">Todavía no hay centros de costo</div>
        <div style="font-size:12px;max-width:520px;margin:0 auto 14px">
          Un centro de costo es el predio, el cuartel, el camión o el área a la que se le carga
          el gasto. Sin al menos uno creado no hay nada que asignar.
        </div>
        <button class="btn btn-p" onclick="nav('centroscosto')">Crear centros de costo</button>
      </div></div>`;
    return;
  }

  const lista = filtrar(todos);
  const montoPend = pend.reduce((s, m) => s + m.monto, 0);
  const montoTot = todos.reduce((s, m) => s + m.monto, 0);
  const pctAsig = montoTot ? Math.round((montoTot - montoPend) / montoTot * 100) : 100;

  // Cuentas presentes, para el filtro
  const cuentas = [...new Set(todos.map(m => m.cuenta))].sort();
  const nSel = Object.keys(ACC.sel).length;
  const clavesVisibles = lista.map(m => m.k).join(',');

  el.innerHTML = `
  <div class="card">
    <div class="acc-kpis">
      <div class="acc-kpi">
        <div class="acc-kpi-l">Sin centro de costo</div>
        <div class="acc-kpi-v" style="color:${pend.length ? 'var(--warn)' : 'var(--ach)'}">${pend.length}</div>
        <div class="acc-kpi-s">de ${todos.length} movimientos de gasto</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-l">Monto sin asignar</div>
        <div class="acc-kpi-v" style="color:${montoPend ? 'var(--warn)' : 'var(--ach)'}">${fmtC(montoPend)}</div>
        <div class="acc-kpi-s">de ${fmtC(montoTot)} del ejercicio</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-l">Gasto costeado</div>
        <div class="acc-kpi-v">${pctAsig}%</div>
        <div class="acc-kpi-s"><div class="acc-barra"><span style="width:${pctAsig}%"></span></div></div>
      </div>
    </div>
    <div class="info-tip" style="margin-top:12px">
      📊 Aquí están los movimientos de cuentas de <strong>gasto y costo</strong> (grupos 31 a 35) del
      ejercicio ${S.empresa.anio}. Los que quedaron sin centro no suman en el costo acumulado del predio
      ni del cuartel, así que la capitalización y el control de costos salen cortos.
      Asignar aquí escribe en el mismo campo que se llena al capturar el documento: el resultado es
      idéntico a haberlo puesto desde el principio.
    </div>
  </div>

  <div class="filter-row" style="margin:14px 0">
    <span class="f-lbl">Ver:</span>
    <select onchange="setAsigCC('ver',this.value)">
      <option value="pendientes" ${ACC.ver === 'pendientes' ? 'selected' : ''}>Sólo sin centro (${pend.length})</option>
      <option value="asignados"  ${ACC.ver === 'asignados' ? 'selected' : ''}>Sólo con centro (${todos.length - pend.length})</option>
      <option value="todos"      ${ACC.ver === 'todos' ? 'selected' : ''}>Todos (${todos.length})</option>
    </select>
    <select onchange="setAsigCC('mes',this.value)">
      <option value="">Todos los meses</option>
      ${MESES.map((m, i) => `<option value="${i + 1}" ${+ACC.mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
    <select onchange="setAsigCC('origen',this.value)">
      <option value="">Todos los orígenes</option>
      ${Object.keys(ORIGENES).map(k =>
        `<option value="${k}" ${ACC.origen === k ? 'selected' : ''}>${ORIGENES[k].ic} ${ORIGENES[k].nm}</option>`).join('')}
    </select>
    <select onchange="setAsigCC('cuenta',this.value)" style="max-width:280px">
      <option value="">Todas las cuentas</option>
      ${cuentas.map(c => `<option value="${c}" ${ACC.cuenta === c ? 'selected' : ''}>${c} — ${esc(pdcNm(c) || '')}</option>`).join('')}
    </select>
    <input type="text" placeholder="Buscar documento, proveedor o cuenta…" value="${esc(ACC.q)}"
      oninput="setAsigCC('q',this.value)" style="min-width:220px">
    <button class="btn btn-g" onclick="limpiarFiltrosCC()">Limpiar</button>
    <button class="btn btn-i" onclick="exportarAsigCCExcel()" title="Descargar el listado en Excel">📊 Excel</button>
    <span class="doc-count">${lista.length} movimiento${lista.length === 1 ? '' : 's'}</span>
  </div>

  <div id="acc-barra-sel">${barraSel(nSel)}</div>

  ${lista.length ? tabla(lista, clavesVisibles) : vacio(pend.length)}`;
}

function vacio(nPend) {
  if (!nPend && ACC.ver === 'pendientes') {
    return `<div class="empty"><div class="ei">✅</div>
      <div style="font-weight:600">Todo el gasto del ejercicio tiene centro de costo</div>
      <div style="font-size:12px;margin-top:5px">No queda nada por asignar.</div></div>`;
  }
  return `<div class="empty"><div class="ei">🔍</div>No hay movimientos que coincidan con el filtro.</div>`;
}

// Barra de asignación en bloque. Se repinta sola al marcar casillas, para no
// re-renderizar la tabla entera con cada clic.
function barraSel(n) {
  if (!n) return '';
  return `<div class="acc-bulk">
    <span class="acc-bulk-n">${n} seleccionado${n === 1 ? '' : 's'}</span>
    <span style="color:var(--mt);font-size:11px">asignar a</span>
    <select onchange="setBulkCC(this.value)" style="min-width:220px">${ccOpts(ACC.bulk)}</select>
    <button class="btn btn-p" onclick="asignarSelCC()" ${ACC.bulk ? '' : 'disabled'}>📊 Asignar</button>
    <button class="btn btn-g" onclick="limpiarSelCC()">Quitar selección</button>
  </div>`;
}

function pintarBarraSel() {
  const box = document.getElementById('acc-barra-sel');
  if (box) box.innerHTML = barraSel(Object.keys(ACC.sel).length);
}

function tabla(lista, clavesVisibles) {
  const filas = lista.map(m => {
    const o = ORIGENES[m.tipo] || ORIGENES.asiento;
    const heredado = !m.cc && m.ccDoc;
    const marcado = ACC.sel[m.k] ? ' checked' : '';
    return `<tr class="${ccEfectivo(m) ? '' : 'acc-pend'}">
      <td class="acc-chk"><input type="checkbox"${marcado} onchange="toggleSelCC('${m.k}')"></td>
      <td class="tl acc-fecha">${esc(m.fecha)}</td>
      <td class="tl"><span class="acc-org" style="background:${o.c}22;color:${o.c}">${o.ic} ${o.nm}</span></td>
      <td class="tl acc-cta">
        <div class="acc-cod">${esc(m.cuenta)}</div>
        <div class="acc-cta-nm" title="${esc(pdcNm(m.cuenta) || '')}">${esc(pdcNm(m.cuenta) || '')}</div>
      </td>
      <td class="tl acc-doc">
        <div>${esc(m.doc)}</div>
        <div class="acc-glosa" title="${esc(m.glosa)}">${esc(m.glosa) || '—'}</div>
      </td>
      <td class="acc-monto">${fmtC(m.monto)}</td>
      <td class="acc-cc">
        <select onchange="setCCMov('${m.k}',this.value)">${ccOpts(m.cc)}</select>
        ${heredado ? `<div class="acc-hered" title="El documento completo tiene este centro; elegir uno aquí lo reemplaza sólo para esta línea">↳ del documento: ${esc(ccNombre(m.ccDoc) || m.ccDoc)}</div>` : ''}
      </td>
      <td class="acc-ir no-print"><button class="btn btn-g" onclick="${m.ir}" title="Ir al documento de origen">↗</button></td>
    </tr>`;
  }).join('');

  const tot = lista.reduce((s, m) => s + m.monto, 0);

  return `<div class="card-np"><div class="tw"><table class="tbl-asigcc">
    <thead><tr>
      <th class="acc-chk no-print"><input type="checkbox" onchange="selTodosCC('${clavesVisibles}')" title="Marcar o desmarcar todo lo visible"></th>
      <th class="tl">FECHA</th><th class="tl">ORIGEN</th><th class="tl">CUENTA</th>
      <th class="tl">DOCUMENTO</th><th>MONTO</th><th class="tl">CENTRO DE COSTO</th><th class="no-print"></th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="5" class="tl">TOTAL DE LO LISTADO</td>
      <td class="acc-monto">${fmtC(tot)}</td><td></td><td class="no-print"></td></tr></tfoot>
  </table></div></div>`;
}

// ── Exportar el listado a Excel ──
export function exportarAsigCCExcel() {
  try {
    if (typeof XLSX === 'undefined') { toast('⚠️ Biblioteca Excel no cargada (¿sin internet?)', 'e'); return; }
    const lista = filtrar(movimientosGasto());
    if (!lista.length) { toast('⚠️ No hay movimientos que exportar con el filtro actual', 'e'); return; }
    const hdr = ['FECHA', 'ORIGEN', 'DOCUMENTO', 'DETALLE', 'CÓDIGO', 'CUENTA', 'MONTO', 'CENTRO DE COSTO'];
    const rows = lista.map(m => [
      m.fecha, (ORIGENES[m.tipo] || {}).nm || '', m.doc, m.glosa,
      m.cuenta, pdcNm(m.cuenta) || '', Math.round(m.monto),
      ccNombre(ccEfectivo(m)) || (ccEfectivo(m) ? ccEfectivo(m) : 'SIN ASIGNAR'),
    ]);
    rows.push(['', '', 'TOTAL', '', '', '', Math.round(lista.reduce((s, m) => s + m.monto, 0)), '']);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 38 }, { wch: 10 }, { wch: 34 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Centros de costo');
    XLSX.writeFile(wb, `centros_costo_${S.empresa.anio}_${(S.empresa.rut || '').replace(/[^0-9kK]/g, '')}.xlsx`);
    toast(`📊 ${lista.length} movimiento${lista.length === 1 ? '' : 's'} exportado${lista.length === 1 ? '' : 's'}`);
  } catch (e) {
    toast('❌ No se pudo exportar: ' + e.message, 'e');
  }
}

export { ACC };
