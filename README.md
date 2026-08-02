# Contabilidad — Versión Modular

Migración del `index.html` monolítico (7.667 líneas) a **31 módulos ES**, sin build ni npm.

## Estructura
```
index.html      950 líneas (solo HTML)
css/styles.css  estilos + 3 temas
js/             31 módulos ES
```

## Probar localmente
Los módulos ES **no funcionan con `file://`**. Necesitas servidor:
```bash
python3 -m http.server 8000
```
Abre `http://localhost:8000`.

## Subir a GitHub Pages
Sube `index.html`, `js/` y `css/` a la **raíz** del repo, manteniendo la estructura.
Ya no basta con un solo archivo: son 32 archivos y las rutas relativas importan.

## Temas
Botón en el header (🌙 / ☀️ / 🔷) alterna entre tres paletas, y recuerda la elección:
- **Oscuro** — el original (verde)
- **SAP Claro** — Fiori: fondo `#f5f6f7`, azul `#0a6ed1`, texto `#32363a`
- **SAP Oscuro** — Fiori Horizon dark

Definidas en `css/styles.css` como `html[data-theme="..."]`. Todo el CSS usa variables, así que agregar otra paleta es solo añadir un bloque.

## Arquitectura por capas
Dependencias en una sola dirección, sin ciclos.
```
Capa 0  core state ui tema
Capa 1  firebase storage
Capa 2  helpers pdc empresa indicadores
Capa 3  auth usuarios audit
Capa 4  asientos ventas compras honorarios apertura activofijo remuneraciones
Capa 5  reportes auxiliares tributario cierre flujocaja conciliacion
        xmlsii busqueda backup impresion
Capa 6  app  (orquestador)
```

## Cómo se rompieron los ciclos
| Ciclo | Solución |
|---|---|
| auth ↔ audit | `logAccion` (escritura) → firebase.js; `renderAuditLog` (vista) → audit.js |
| auth ↔ app | auth expone `setOnAuthReady(fn)`; app.js registra el arranque |
| ventas ↔ asientos | helpers de bajo nivel → helpers.js |
| varios ↔ app | `ui.js` con wrappers de `rerender`/`nav`; app.js inyecta con `registrarUI()` |

## Cambios que exigió la modularización
- **`PDC` se muta in-place**: `PDC.splice(0,PDC.length,...nueva)` en vez de reasignar.
- **`AUTH` vive en state.js**; **`curSec`** se accede con `getCurSec()`/`setCurSec()`.
- **Estado de formularios interno**: `VF`, `CF`, `AF`, `REMF`, `AFB`, `AUX_*` en su módulo.
- **`onclick`**: app.js publica las 155 funciones necesarias en `window`.

## Bug corregido: plan de cuentas vacío
`renderPDC` usaba `CUENTAS_SEL`/`CUENTAS_GASTO` sin importarlos → `ReferenceError`.
Se auditaron todos los módulos: **18 tenían imports faltantes** del mismo tipo (ventas, compras, asientos, backup…). Todos corregidos.

## Validación hecha
- ✅ Los 31 módulos cargan sin ciclos
- ✅ **Las 24 funciones `render*` se ejecutan sin error** (esta prueba detecta los ReferenceError que la sintaxis no ve)
- ✅ Cobertura de `onclick`: 155/155 expuestas
- ✅ Servido por HTTP con MIME correcto
- ✅ Cálculos verificados: `genDiario`/`buildMayor` correctos; liquidación de sueldo idéntica al monolito (AFP 74.060, líquido 572.740)
- ✅ Ciclo de temas + persistencia

## Falta validar en navegador
Node no cubre DOM real ni eventos. Prueba: login/logout, guardar en cada sección, reportes, export/import Excel, Firestore, búsqueda (Ctrl+K), impresión, móvil.
Mantén el monolito como respaldo hasta confirmarlo.

---

## Multiempresa

Cada empresa tiene **datos completamente aislados**: plan de cuentas, libros, asientos, indicadores y activos propios.

- **Selector en el header** para cambiar de empresa (recarga todos los datos).
- **Sección Configuración → Empresas** para crear, editar y eliminar.
- Técnicamente: `storage.js` prefija todas las claves con el id de empresa (`emp1:ventas-2026`). Los módulos no cambiaron: el prefijo es transparente.
- **Migración automática**: los datos que ya tenías pasan a ser la empresa "Mi Empresa" (emp1) la primera vez que abras esta versión. Las claves antiguas se conservan por seguridad.

## Marco contable (IFRS)

Cada empresa elige su marco al crearla o editarla:

| Marco | Uso |
|---|---|
| **Tributaria chilena (PCGA)** | Orientada al SII: F29, PPM, depreciación tabla SII, corrección monetaria Art. 41 |
| **NIIF para PYMEs** | Estados financieros de propósito general (bancos, inversionistas) |
| **NIIF plenas** | Entidades con obligación pública de rendir cuentas |

Efectos actuales del marco:
- **Corrección monetaria**: bajo NIIF se advierte que el Art. 41 LIR no forma parte de las normas internacionales (es un ajuste tributario chileno; NIC 29 solo aplica en economías hiperinflacionarias).
- **Impresión**: el encabezado de los reportes indica el marco bajo el cual se emiten.

⚠️ **Alcance honesto**: el marco hoy adapta advertencias y el encabezado de reportes. Una implementación IFRS completa requeriría además: plan de cuentas por naturaleza NIIF, estado de situación financiera y estado de resultados integral en formato NIIF, notas explicativas, deterioro de activos (NIC 36), arrendamientos (NIIF 16) e impuestos diferidos (NIC 12). Eso es un proyecto aparte.
