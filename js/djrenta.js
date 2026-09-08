// djrenta.js — Declaraciones Juradas de Renta.
//
// Muestra qué declaraciones le tocan a la empresa según su régimen, en qué
// plazo vencen y en qué estado está cada una. Donde el sistema ya tiene los
// datos —sueldos, honorarios, RLI, renta presunta— arma el resumen para
// contrastarlo con lo que se sube al portal del SII.
//
// El catálogo es EDITABLE. La ley tributaria cambia todos los años, así que la
// lista oficial del AT 2026 (djcatalogo.js) es sólo la semilla: se guarda una
// copia por empresa que se puede modificar entera, y hay un botón para volver
// a la semilla cuando se actualice el archivo.
//
// Lo que NO hace: presentar las declaraciones. Eso se hace en sii.cl. Aquí se
// controla el cumplimiento y se prepara la información.

import {S} from './state.js';
import {toast, fmtC, fmt, MESES} from './core.js';
import {regimenInfo, regimenLbl} from './regimenes.js';
import {retencionHonorarios} from './indicadores.js';
import {libroDelMes} from './libroremuneraciones.js';
import {buildMayor} from './reportes.js';
import {calcularRenta} from './renta.js';
import {DJ_SEMILLA, DJ_NUEVA, FUENTES, plazoLbl, fechaLbl, fechaVence, aplicaA} from './djcatalogo.js';
import './storage.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Estado del módulo ──
// catalogo  las declaraciones (semilla o la copia editada de esta empresa)
// estados   por año tributario: {'1887': {estado, fecha, folio, obs}}
// OJO: este objeto se publica en window desde app.js. Nunca reasignarlo —hay que
// mutar sus propiedades—, porque window.DJ quedaría apuntando al objeto viejo.
const DJ = { catalogo: null, estados: {}, anio: null, verTodas: false, edit: null };

const CLAVE_CAT = 'dj_catalogo';                 // global de la empresa
const claveEst  = at => 'dj_estado-' + at;       // uno por año tributario

const ESTADOS = {
  pendiente: { lbl: 'Pendiente',   color: 'var(--mt)'   },
  preparada: { lbl: 'Preparada',   color: 'var(--warn)' },
  presentada:{ lbl: 'Presentada',  color: 'var(--ach)'  },
  noaplica:  { lbl: 'No aplica',   color: 'var(--mt)'   },
};

// Año tributario = año comercial + 1
const anioTributario = () => (S.empresa.anio || new Date().getFullYear()) + 1;

// ── Persistencia ──
export async function cargarDJ() {
  const at = anioTributario();
  // Catálogo: la copia de la empresa si existe, si no la semilla
  DJ.catalogo = null;
  try {
    const r = await window.storage.get(CLAVE_CAT);
    if (r && r.value) {
      const p = JSON.parse(r.value);
      if (Array.isArray(p) && p.length) DJ.catalogo = p;
    }
  } catch (e) {}
  if (!DJ.catalogo) DJ.catalogo = DJ_SEMILLA.map(d => ({ ...d }));

  DJ.estados = {};
  try {
    const r = await window.storage.get(claveEst(at));
    if (r && r.value) {
      const p = JSON.parse(r.value);
      if (p && typeof p === 'object') DJ.estados = p;
    }
  } catch (e) {}
  DJ.anio = at;
  return DJ;
}

const guardarCatalogo = () =>
  window.storage.set(CLAVE_CAT, JSON.stringify(DJ.catalogo))
    .catch(() => toast('❌ No se pudo guardar el catálogo', 'e'));

const guardarEstados = () =>
  window.storage.set(claveEst(DJ.anio), JSON.stringify(DJ.estados))
    .catch(() => toast('❌ No se pudo guardar el estado', 'e'));

// Estado de una declaración, con valores por defecto
const estadoDe = n => DJ.estados[n] || { estado: 'pendiente', fecha: '', folio: '', obs: '' };

// ═══════════════════════════════════════════════════════════════════════
// RESÚMENES: lo que el sistema ya sabe de cada declaración
// ═══════════════════════════════════════════════════════════════════════
//
// Son cifras de control, no el archivo que se sube: sirven para comparar con lo
// que muestra el portal del SII y detectar diferencias antes de presentar.
function resumenDe(fuente) {
  try {
    if (fuente === 'honorarios') {
      const hs = S.honorarios || [];
      if (!hs.length) return null;
      const bruto = hs.reduce((s, h) => s + (+h.bruto || 0), 0);
      const tasa = retencionHonorarios(S.empresa.anio);
      const ret = Math.round(bruto * tasa);
      const personas = new Set(hs.map(h => String(h.rut || '').trim()).filter(Boolean)).size;
      return { lineas: [
        ['Boletas del ejercicio', hs.length + ''],
        ['Personas distintas', personas + ''],
        ['Total bruto', fmtC(bruto)],
        [`Retención (${(tasa * 100).toFixed(2).replace('.', ',')}%)`, fmtC(ret)],
      ]};
    }

    if (fuente === 'sueldos') {
      let n = 0, rentas = 0, iusc = 0, meses = 0;
      for (let m = 1; m <= 12; m++) {
        const lb = libroDelMes(m);
        if (!lb || !lb.lineas || !lb.lineas.length) continue;
        meses++;
        n = Math.max(n, lb.lineas.length);
        rentas += (lb.totales && lb.totales.totalHaberes) || 0;
        iusc   += (lb.totales && lb.totales.iusc) || 0;
      }
      if (!meses) return null;
      return { lineas: [
        ['Meses con remuneraciones', meses + ''],
        ['Trabajadores (máximo del año)', n + ''],
        ['Total haberes del año', fmtC(rentas)],
        ['Impuesto Único retenido', fmtC(iusc)],
      ]};
    }

    if (fuente === 'rli') {
      const R = calcularRenta();
      if (!R) return null;
      return { lineas: [
        ['Resultado según balance', fmtC(R.resultadoBalance)],
        ['Total agregados', fmtC(R.totalAgregados)],
        ['Total deducciones', fmtC(R.totalDeducciones)],
        [R.rli >= 0 ? 'Renta Líquida Imponible' : 'Pérdida tributaria', fmtC(Math.abs(R.rli))],
        ['Impuesto de Primera Categoría', fmtC(R.idpcNeto)],
      ], ir: 'renta' };
    }

    if (fuente === 'presunta') {
      const R = calcularRenta();
      if (!R || !R.presunta) return null;
      return { lineas: [
        [R.presunta.lbl, fmtC(R.presunta.valor)],
        ['Porcentaje de presunción', String(R.presunta.pct).replace('.', ',') + '%'],
        ['Renta presunta', fmtC(R.presunta.renta)],
        ['Impuesto de Primera Categoría', fmtC(R.idpcNeto)],
      ], ir: 'renta' };
    }

    if (fuente === 'balance') {
      const M = buildMayor();
      const imputables = Object.keys(M).filter(k => k.length === 7 && Math.abs(M[k].saldo) >= 0.5);
      const debe  = imputables.reduce((s, k) => s + (M[k].debe || 0), 0);
      const haber = imputables.reduce((s, k) => s + (M[k].haber || 0), 0);
      if (!imputables.length) return null;
      return { lineas: [
        ['Cuentas con movimiento', imputables.length + ''],
        ['Sumas del Debe', fmtC(debe)],
        ['Sumas del Haber', fmtC(haber)],
        ['Diferencia', fmtC(debe - haber)],
      ], ir: 'balance' };
    }
  } catch (e) {
    console.warn('resumenDe(' + fuente + '):', e);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export async function renderDJ() {
  const at = anioTributario();
  if (DJ.anio !== at || !DJ.catalogo) await cargarDJ();
  const el = document.getElementById('dj-content');
  if (!el) return;

  const regimen = (S.empresa && S.empresa.regimen) || '14D3';
  const reg = regimenInfo(regimen);
  const propias = DJ.catalogo.filter(d => aplicaA(d, regimen));
  const otras   = DJ.catalogo.filter(d => !aplicaA(d, regimen));
  const lista   = DJ.verTodas ? DJ.catalogo : propias;

  const hoy = new Date();
  const pendientes = propias.filter(d => {
    const e = estadoDe(d.n).estado;
    return e !== 'presentada' && e !== 'noaplica';
  }).length;

  el.innerHTML = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:15px;font-weight:700">Año Tributario ${at}</div>
        <div style="font-size:11px;color:var(--mt);margin-top:3px">
          Ejercicio comercial ${S.empresa.anio} · Régimen ${esc(regimenLbl(regimen))}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:var(--mt);text-transform:uppercase">Le corresponden</div>
        <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--acc)">${propias.length}</div>
        <div style="font-size:10px;color:${pendientes ? 'var(--warn)' : 'var(--ach)'}">
          ${pendientes ? pendientes + ' sin presentar' : 'todas al día'}
        </div>
      </div>
    </div>
    <div class="info-tip" style="margin-top:12px">
      📋 Estas son las declaraciones juradas del régimen <strong>${esc(reg.corto)}</strong> según la
      Resolución Ex. SII N°123 de 25-09-2025. Se presentan en <strong>sii.cl</strong>; aquí se controla
      el cumplimiento y se preparan las cifras. El catálogo es editable: si el SII cambia un plazo o
      agrega una declaración, se ajusta desde aquí sin esperar una versión nueva del sistema.
    </div>
  </div>

  <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap;align-items:center">
    <button class="btn ${DJ.verTodas ? 'btn-g' : 'btn-p'}" onclick="setDJVerTodas(false)">
      Las de mi régimen (${propias.length})
    </button>
    <button class="btn ${DJ.verTodas ? 'btn-p' : 'btn-g'}" onclick="setDJVerTodas(true)">
      Todo el catálogo (${DJ.catalogo.length})
    </button>
    <span style="flex:1"></span>
    <button class="btn btn-g" onclick="nuevaDJ()">+ Agregar declaración</button>
    <button class="btn btn-g" onclick="exportarDJExcel()">📊 Exportar</button>
    <button class="btn btn-g" onclick="restaurarCatalogoDJ()" title="Descarta los cambios y vuelve al listado oficial que trae el sistema">↺ Catálogo oficial</button>
  </div>

  ${lista.length ? lista.map(d => tarjetaDJ(d, regimen, at, hoy)).join('')
    : `<div class="empty"><div class="ei">📋</div>No hay declaraciones en el catálogo.</div>`}

  ${!DJ.verTodas && otras.length ? `
    <div style="font-size:11px;color:var(--mt);margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">
      Hay ${otras.length} declaración(es) más en el catálogo que no aplican al régimen
      ${esc(reg.corto)}: ${otras.map(d => 'N°' + esc(d.n)).join(', ')}.
    </div>` : ''}`;
}

function tarjetaDJ(d, regimen, at, hoy) {
  const st = estadoDe(d.n);
  const info = ESTADOS[st.estado] || ESTADOS.pendiente;
  const aplica = aplicaA(d, regimen);
  const vence = fechaVence(d, at);
  const resumen = d.fuente ? resumenDe(d.fuente) : null;

  // Semáforo del plazo: sólo importa si todavía no se presenta
  let aviso = '';
  if (vence && st.estado !== 'presentada' && st.estado !== 'noaplica' && aplica) {
    const dias = Math.ceil((vence - hoy) / 86400000);
    if (dias < 0)       aviso = `<span class="dj-alerta dj-vencida">Venció hace ${-dias} día(s)</span>`;
    else if (dias <= 15) aviso = `<span class="dj-alerta dj-pronto">Vence en ${dias} día(s)</span>`;
  }

  return `
  <div class="card dj-card${aplica ? '' : ' dj-ajena'}">
    <div class="dj-cab">
      <div style="min-width:0">
        <div class="dj-titulo">
          <span class="dj-num">N°${esc(d.n)}</span>
          <span>${esc(d.nm)}</span>
          ${d.propia ? '<span class="dj-badge dj-propia">propia</span>' : ''}
          ${aplica ? '' : '<span class="dj-badge">otro régimen</span>'}
        </div>
        <div class="dj-desc">${esc(d.desc || '')}</div>
        <div class="dj-meta">
          <span>📅 Vence el <strong>${esc(plazoLbl(d, at))}</strong>${
            d.plazoTxt && d.plazo ? ` <span class="dj-ctrl">(el aviso se cuenta al ${esc(fechaLbl(d, at))})</span>` : ''
          }</span>
          ${d.cert ? `<span>· 📄 ${esc(d.cert)}</span>` : ''}
          ${d.fuente && FUENTES[d.fuente] ? `<span>· 🔗 ${esc(FUENTES[d.fuente])}</span>` : ''}
          ${aviso}
        </div>
        ${d.nota ? `<div class="dj-nota">⚠ ${esc(d.nota)}</div>` : ''}
      </div>
      <div class="dj-acciones">
        <select class="dj-estado" onchange="setDJEstado('${esc(d.n)}','estado',this.value)"
                style="color:${info.color}">
          ${Object.keys(ESTADOS).map(k =>
            `<option value="${k}" ${st.estado === k ? 'selected' : ''}>${ESTADOS[k].lbl}</option>`).join('')}
        </select>
        <button class="btn btn-i" onclick="editarDJ('${esc(d.n)}')" title="Editar esta declaración">✏️</button>
        ${d.propia ? `<button class="btn btn-d" onclick="borrarDJ('${esc(d.n)}')" title="Quitar del catálogo">🗑</button>` : ''}
      </div>
    </div>

    ${st.estado === 'presentada' || st.estado === 'preparada' ? `
      <div class="dj-registro">
        <div class="grp">
          <label>Fecha de presentación</label>
          <input type="date" value="${esc(st.fecha)}" onchange="setDJEstado('${esc(d.n)}','fecha',this.value)">
        </div>
        <div class="grp">
          <label>Folio o comprobante</label>
          <input type="text" value="${esc(st.folio)}" placeholder="N° de folio del SII"
                 onchange="setDJEstado('${esc(d.n)}','folio',this.value)">
        </div>
        <div class="grp full">
          <label>Observaciones</label>
          <input type="text" value="${esc(st.obs)}" placeholder="Diferencias, rectificatorias, pendientes…"
                 onchange="setDJEstado('${esc(d.n)}','obs',this.value)">
        </div>
      </div>` : ''}

    ${resumen ? `
      <div class="dj-resumen">
        <div class="dj-resumen-t">Lo que registra el sistema</div>
        <table class="dj-tabla"><tbody>
          ${resumen.lineas.map(([k, v]) =>
            `<tr><td class="tl">${esc(k)}</td><td class="dj-val">${esc(v)}</td></tr>`).join('')}
        </tbody></table>
        <div class="dj-resumen-p">
          Cifras de control para contrastar con el portal del SII, no el archivo que se sube.
          ${resumen.ir ? `<a href="#" onclick="nav('${resumen.ir}');return false">Ver el detalle →</a>` : ''}
        </div>
      </div>` : (d.fuente ? `
      <div class="dj-resumen-p" style="margin-top:10px">
        Sin datos en el ejercicio ${S.empresa.anio} para resumir esta declaración.
      </div>` : '')}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// ACCIONES
// ═══════════════════════════════════════════════════════════════════════

export function setDJVerTodas(v) { DJ.verTodas = !!v; renderDJ(); }

export function setDJEstado(n, campo, valor) {
  if (!DJ.estados[n]) DJ.estados[n] = { estado: 'pendiente', fecha: '', folio: '', obs: '' };
  DJ.estados[n][campo] = valor;
  // Al marcar como presentada sin fecha, se propone hoy: es el caso normal
  if (campo === 'estado' && valor === 'presentada' && !DJ.estados[n].fecha) {
    DJ.estados[n].fecha = new Date().toISOString().slice(0, 10);
  }
  guardarEstados();
  if (campo === 'estado') renderDJ();   // cambia qué campos se muestran
}

// ── Editor del catálogo ──
export function editarDJ(n) {
  const d = DJ.catalogo.find(x => String(x.n) === String(n));
  if (!d) return;
  DJ.edit = { ...d, __orig: d.n };
  renderEditorDJ();
}

export function nuevaDJ() {
  DJ.edit = { ...DJ_NUEVA(), __orig: null };
  renderEditorDJ();
}

export function cerrarEditorDJ() {
  DJ.edit = null;
  const m = document.getElementById('dj-modal');
  if (m) m.classList.remove('open');
}

function renderEditorDJ() {
  const m = document.getElementById('dj-modal');
  const box = document.getElementById('dj-modal-body');
  if (!m || !box || !DJ.edit) return;
  const e = DJ.edit;
  const REG = [
    ['14A', '14 A Semi Integrado'], ['14D3', '14 D N°3 Pro Pyme'], ['14D8', '14 D N°8 Transparente'],
    ['34AGRI', 'Presunta agrícola'], ['34TRANS', 'Presunta transporte'], ['34MIN', 'Presunta minería'],
    ['NOSUJ', 'No sujeto Art. 14'],
  ];
  box.innerHTML = `
    <div class="fg">
      <div class="grp"><label>Número de formulario</label>
        <input type="text" id="dje-n" value="${esc(e.n)}" placeholder="Ej: 1948"></div>
      <div class="grp"><label>Vence el (mes-día)</label>
        <input type="text" id="dje-plazo" value="${esc(e.plazo)}" placeholder="03-27"></div>
      <div class="grp full"><label>Nombre</label>
        <input type="text" id="dje-nm" value="${esc(e.nm)}" placeholder="Retiros, remesas y dividendos"></div>
      <div class="grp full"><label>Qué informa</label>
        <input type="text" id="dje-desc" value="${esc(e.desc)}"></div>
      <div class="grp full"><label>Plazo en palabras <span style="color:var(--mt)">(opcional, si no es una sola fecha)</span></label>
        <input type="text" id="dje-plazotxt" value="${esc(e.plazoTxt || '')}" placeholder="Junto con el Formulario 22"></div>
      <div class="grp"><label>Certificado asociado</label>
        <input type="text" id="dje-cert" value="${esc(e.cert || '')}" placeholder="Certificado N°70"></div>
      <div class="grp"><label>Datos del sistema</label>
        <select id="dje-fuente">
          <option value="">— sin resumen automático —</option>
          ${Object.keys(FUENTES).map(k =>
            `<option value="${k}" ${e.fuente === k ? 'selected' : ''}>${FUENTES[k]}</option>`).join('')}
        </select></div>
      <div class="grp full"><label>Nota o condición</label>
        <input type="text" id="dje-nota" value="${esc(e.nota || '')}"
               placeholder="Sólo si hubo trabajadores en el ejercicio"></div>
    </div>

    <div style="margin-top:12px">
      <label style="font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">
        Regímenes a los que aplica</label>
      <div class="dj-regs">
        ${REG.map(([k, lbl]) => `
          <label class="dj-reg">
            <input type="checkbox" value="${k}" ${(e.regimenes || []).includes(k) ? 'checked' : ''}>
            <span>${lbl}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="save-row" style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-p" onclick="guardarDJ()">💾 Guardar</button>
      <button class="btn btn-g" onclick="cerrarEditorDJ()">Cancelar</button>
    </div>`;
  m.classList.add('open');
}

export function guardarDJ() {
  if (!DJ.edit) return;
  const v = id => (document.getElementById(id) || {}).value || '';
  const n = v('dje-n').trim();
  if (!n) { toast('⚠️ Indica el número del formulario', 'e'); return; }
  const nm = v('dje-nm').trim();
  if (!nm) { toast('⚠️ Ponle un nombre a la declaración', 'e'); return; }

  const plazo = v('dje-plazo').trim();
  if (plazo && !/^\d{2}-\d{2}$/.test(plazo)) {
    toast('⚠️ El plazo va como mes-día, por ejemplo 03-27', 'e'); return;
  }

  const regimenes = [...document.querySelectorAll('.dj-regs input:checked')].map(c => c.value);
  const orig = DJ.edit.__orig;

  // No se permiten dos declaraciones con el mismo número: el número ES la clave
  // con la que se guarda el estado de presentación de cada año.
  if (DJ.catalogo.some(d => String(d.n) === n && String(d.n) !== String(orig))) {
    toast(`⚠️ Ya existe la declaración N°${n} en el catálogo`, 'e'); return;
  }

  const datos = {
    n, nm,
    desc: v('dje-desc').trim(),
    plazo,
    plazoTxt: v('dje-plazotxt').trim(),
    regimenes,
    fuente: v('dje-fuente'),
    cert: v('dje-cert').trim(),
    nota: v('dje-nota').trim(),
    propia: DJ.edit.propia || orig == null,
  };

  if (orig == null) {
    DJ.catalogo.push(datos);
  } else {
    const i = DJ.catalogo.findIndex(d => String(d.n) === String(orig));
    if (i >= 0) DJ.catalogo[i] = { ...DJ.catalogo[i], ...datos };
    // Si cambió el número, el estado guardado tiene que seguirlo
    if (String(orig) !== n && DJ.estados[orig]) {
      DJ.estados[n] = DJ.estados[orig];
      delete DJ.estados[orig];
      guardarEstados();
    }
  }
  guardarCatalogo();
  cerrarEditorDJ();
  toast(orig == null ? '✅ Declaración agregada' : '✅ Declaración actualizada');
  renderDJ();
}

export function borrarDJ(n) {
  const d = DJ.catalogo.find(x => String(x.n) === String(n));
  if (!d) return;
  if (!confirm(`¿Quitar la declaración N°${d.n} del catálogo?\n\nSe puede volver a agregar, y «Catálogo oficial» restaura las que trae el sistema.`)) return;
  DJ.catalogo = DJ.catalogo.filter(x => String(x.n) !== String(n));
  guardarCatalogo();
  toast('🗑 Declaración quitada del catálogo');
  renderDJ();
}

export function restaurarCatalogoDJ() {
  if (!confirm('¿Volver al catálogo oficial que trae el sistema?\n\nSe descartan los cambios que hayas hecho al listado —plazos, nombres, regímenes— y las declaraciones que agregaste.\n\nEl estado de presentación de cada año NO se toca.')) return;
  DJ.catalogo = DJ_SEMILLA.map(d => ({ ...d }));
  guardarCatalogo();
  toast('↺ Catálogo oficial restaurado');
  renderDJ();
}

// ── Exportar el control a Excel ──
export function exportarDJExcel() {
  try {
    if (typeof XLSX === 'undefined') { toast('⚠️ No se pudo cargar el generador de Excel', 'e'); return; }
    const at = DJ.anio || anioTributario();
    const regimen = (S.empresa && S.empresa.regimen) || '14D3';
    const rows = [];
    rows.push(['CONTROL DE DECLARACIONES JURADAS DE RENTA']);
    rows.push([S.empresa.nombre || '', S.empresa.rut || '']);
    rows.push(['Año Tributario', at, 'Ejercicio comercial', S.empresa.anio]);
    rows.push(['Régimen', regimenLbl(regimen)]);
    rows.push([]);
    rows.push(['N°', 'NOMBRE', 'APLICA', 'VENCE', 'ESTADO', 'FECHA PRESENTACIÓN', 'FOLIO', 'OBSERVACIONES']);
    (DJ.verTodas ? DJ.catalogo : DJ.catalogo.filter(d => aplicaA(d, regimen))).forEach(d => {
      const st = estadoDe(d.n);
      rows.push([
        d.n, d.nm,
        aplicaA(d, regimen) ? 'Sí' : 'No',
        plazoLbl(d, at),
        (ESTADOS[st.estado] || ESTADOS.pendiente).lbl,
        st.fecha || '', st.folio || '', st.obs || '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 46 }, { wch: 8 }, { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DJ AT' + at);
    XLSX.writeFile(wb, `declaraciones_juradas_AT${at}_${(S.empresa.rut || '').replace(/[^0-9kK]/g, '')}.xlsx`);
    toast('📊 Control de declaraciones exportado');
  } catch (e) {
    toast('❌ No se pudo exportar: ' + e.message, 'e');
  }
}

// Se llama al cambiar de empresa o de año: el catálogo y los estados son suyos
export function resetDJ() {
  DJ.catalogo = null;
  DJ.estados = {};
  DJ.anio = null;
  DJ.edit = null;
  // verTodas es preferencia de quien mira, no dato de la empresa: se conserva
}

export { DJ };
