// djcatalogo.js — Catálogo de Declaraciones Juradas de Renta.
//
// Trae el listado oficial del Año Tributario 2026 como SEMILLA, no como verdad
// fija: la ley tributaria cambia todos los años y el SII renumera, agrega y
// deroga declaraciones. Por eso el catálogo se guarda en la base de datos y se
// puede editar entero desde la aplicación —plazos, nombres, a qué régimen
// aplica— e incluso crear declaraciones que todavía no existen aquí.
//
// Fuente de la semilla:
//   · Resolución Ex. SII N°123 del 25-09-2025, que fija los vencimientos AT 2026
//   · Tabla de «Principales Declaraciones Juradas por Régimen Tributario» del SII
//
// Cuando salga el calendario del AT 2027 hay dos caminos: editar los plazos a
// mano desde la pantalla, o actualizar esta semilla y pulsar «Restaurar
// catálogo oficial», que descarta los cambios locales y vuelve a esto.

// Códigos de régimen tal como los define regimenes.js
const TODOS = ['14A', '14D3', '14D8', '34AGRI', '34TRANS', '34MIN', 'NOSUJ'];

// Cada declaración declara:
//   n          número del formulario
//   nm         nombre oficial abreviado
//   desc       qué informa, en una línea
//   plazo      fecha de vencimiento como 'MM-DD' del año tributario
//   plazoTxt   el plazo en palabras cuando no es una sola fecha
//   regimenes  a qué regímenes aplica ([] = a ninguno por defecto)
//   fuente     de dónde salen los datos si el sistema puede calcularlos
//   cert       certificado que se emite al receptor, si corresponde
//   nota       advertencias o condiciones
export const DJ_SEMILLA = [
  // ── Transversales: las presenta cualquier empresa con personal o boletas ──
  {
    n: '1887', nm: 'Rentas del Art. 42 N°1 (sueldos)',
    desc: 'Sueldos, remuneraciones y retenciones de Impuesto Único de Segunda Categoría de cada trabajador.',
    plazo: '03-27', regimenes: TODOS, fuente: 'sueldos', cert: 'Certificado N°6',
    nota: 'Sólo si hubo trabajadores con remuneración en el ejercicio.',
  },
  {
    n: '1879', nm: 'Retenciones del Art. 42 N°2 (honorarios)',
    desc: 'Honorarios pagados y retenciones practicadas a profesionales independientes.',
    plazo: '03-27', regimenes: TODOS, fuente: 'honorarios', cert: 'Certificado N°1',
    nota: 'Sólo si se pagaron boletas de honorarios con retención.',
  },

  // ── Régimen General Semi Integrado (14 A) ──
  {
    n: '1847', nm: 'Balance de 8 columnas',
    desc: 'Balance tributario de ocho columnas del ejercicio.',
    plazo: '06-30', regimenes: ['14A', 'NOSUJ'], fuente: 'balance',
    nota: 'Contribuyentes obligados a llevar contabilidad completa.',
  },
  {
    n: '1926', nm: 'Base Imponible de Primera Categoría',
    desc: 'Ajustes al resultado del balance para llegar a la Renta Líquida Imponible y datos contables.',
    plazo: '06-30', regimenes: ['14A', 'NOSUJ'], fuente: 'rli',
    nota: 'Contribuyentes que declaran renta efectiva con contabilidad completa.',
  },

  // ── Retiros y dividendos ──
  {
    n: '1948', nm: 'Retiros, remesas y dividendos',
    desc: 'Retiros, remesas y dividendos distribuidos a los dueños, con sus créditos asociados.',
    plazo: '03-27',
    plazoTxt: '16, 24 o 27 de marzo según el tipo de propietario',
    regimenes: ['14A', '14D3'], cert: 'Certificado N°70',
    nota: 'S.A. abiertas al 16 de marzo · socios personas jurídicas al 24 · socios personas naturales al 27.',
  },

  // ── Pro Pyme Transparente (14 D N°8) ──
  {
    n: '1947', nm: 'Base imponible Pro Pyme Transparente',
    desc: 'Base imponible que se atribuye a los dueños, con sus créditos y PPM.',
    plazo: '03-27',
    plazoTxt: 'Junto con el Formulario 22',
    regimenes: ['14D8'], fuente: 'rli', cert: 'Certificado N°71',
    nota: 'La empresa no paga IDPC: son los dueños quienes declaran esta base.',
  },

  // ── Renta Presunta (Art. 34) ──
  {
    n: '1943', nm: 'Contribuyentes acogidos a renta presunta',
    desc: 'Declaración anual de quienes tributan sobre renta presunta.',
    plazo: '03-27', regimenes: ['34AGRI', '34TRANS', '34MIN'], fuente: 'presunta',
  },
  {
    n: '1949', nm: 'Retiros y dividendos de renta presunta',
    desc: 'Retiros y dividendos de contribuyentes de renta presunta y del Art. 14 B.',
    plazo: '03-23', regimenes: ['34AGRI', '34TRANS', '34MIN'],
  },
];

// Estructura vacía de una declaración nueva creada por el usuario
export const DJ_NUEVA = () => ({
  n: '', nm: '', desc: '', plazo: '03-27', plazoTxt: '',
  regimenes: [], fuente: '', cert: '', nota: '', propia: true,
});

// Fuentes de datos que el sistema sabe resumir. Las demás quedan sin resumen y
// se completan directamente en el portal del SII.
export const FUENTES = {
  sueldos:    'Libro de Remuneraciones',
  honorarios: 'Honorarios del ejercicio',
  rli:        'Declaración de Renta (RLI)',
  presunta:   'Declaración de Renta (renta presunta)',
  balance:    'Balance General',
};

const MESES_DJ = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// La fecha del campo `plazo` escrita en palabras. Es la que manda el semáforo
// de vencimiento, aunque en pantalla se muestre el texto libre.
export function fechaLbl(dj, anioTributario) {
  if (!dj.plazo) return '';
  const [m, d] = String(dj.plazo).split('-');
  const nm = MESES_DJ[(+m || 1) - 1] || '';
  return `${+d} de ${nm}${anioTributario ? ' de ' + anioTributario : ''}`;
}

// Etiqueta legible del plazo: el texto libre gana si existe, porque hay
// declaraciones cuyo vencimiento depende del tipo de propietario y no cabe en
// una sola fecha.
export function plazoLbl(dj, anioTributario) {
  if (dj.plazoTxt) return dj.plazoTxt;
  return fechaLbl(dj, anioTributario) || 'sin plazo definido';
}

// Fecha real de vencimiento, para comparar contra hoy
export function fechaVence(dj, anioTributario) {
  if (!dj.plazo || !anioTributario) return null;
  const [m, d] = String(dj.plazo).split('-').map(Number);
  if (!m || !d) return null;
  return new Date(anioTributario, m - 1, d, 23, 59, 59);
}

// ¿Esta declaración aplica al régimen dado?
export const aplicaA = (dj, regimen) =>
  Array.isArray(dj.regimenes) && dj.regimenes.includes(regimen);
