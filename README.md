# Contabilidad — Versión Modular

Migración completa del `index.html` monolítico (7.667 líneas) a **30 módulos ES** sin build ni npm.

## Estructura

```
index.html          950 líneas (solo HTML)
css/styles.css      estilos
js/                 30 módulos ES
```

`index.html` ahora solo tiene marcado + un `<script type="module" src="js/app.js">`.

## Cómo probarlo localmente

Los módulos ES **no funcionan abriendo el archivo directamente** (`file://`) por seguridad del navegador. Necesitas un servidor:

```bash
cd app-modular
python3 -m http.server 8000
```
Luego abre `http://localhost:8000`.

## Cómo subirlo a GitHub Pages

Sube **la carpeta completa** (index.html + js/ + css/) manteniendo la estructura. GitHub Pages sirve módulos ES sin configuración extra.

⚠️ Ya no basta con subir un solo archivo: son 32 archivos y las rutas relativas importan.

## Arquitectura por capas

Las dependencias fluyen en una sola dirección. Ningún ciclo.

```
Capa 0  core.js state.js ui.js          sin dependencias
Capa 1  firebase.js storage.js          infraestructura
Capa 2  helpers.js pdc.js empresa.js indicadores.js
Capa 3  auth.js usuarios.js audit.js    sistema
Capa 4  asientos.js ventas.js compras.js honorarios.js apertura.js
        activofijo.js remuneraciones.js
Capa 5  reportes.js auxiliares.js tributario.js cierre.js
        flujocaja.js conciliacion.js xmlsii.js busqueda.js
        backup.js impresion.js
Capa 6  app.js                          orquestador
```

## Cómo se rompieron los ciclos

Cuatro dependencias circulares aparecieron durante la migración. Todas se resolvieron **separando responsabilidades**, no con parches:

| Ciclo | Solución |
|---|---|
| auth ↔ audit | `logAccion` (escritura) → firebase.js; `renderAuditLog` (vista, requiere admin) → audit.js |
| auth ↔ app | Inversión: auth expone `setOnAuthReady(fn)`; app.js registra el arranque |
| ventas ↔ asientos | Helpers de bajo nivel (`mesOpts`, `foliosMensuales`, `dteVentasOpts`, `mesRango`) → helpers.js |
| (varios) ↔ app | `ui.js` expone wrappers de `rerender`/`nav`/`renderSec`; app.js inyecta las reales con `registrarUI()` |

## Otros cambios necesarios

- **`PDC` se muta in-place**: `PDC=PDC.filter(...)` → `PDC.splice(0,PDC.length,...nueva)`. Los módulos ES no permiten reasignar un import.
- **`AUTH` vive en state.js** (es solo estado), no en auth.js.
- **`curSec`** se accede con `getCurSec()`/`setCurSec()`.
- **Estado de formularios interno**: `VF`, `CF`, `AF`, `REMF`, `AFB`, `AUX_TAB/VIEW` se declaran en su propio módulo (se comprobó que no se comparten).
- **`onclick` del HTML**: los módulos tienen scope propio, así que app.js publica las 155 funciones necesarias en `window` con `Object.assign`.

## Validación hecha

- ✅ Los 30 módulos cargan en cadena sin ciclos (probado con Node + stubs del DOM)
- ✅ Cobertura de `onclick`: las 155 funciones que el HTML invoca están expuestas
- ✅ Todas las rutas de import resuelven
- ✅ Servido por HTTP con MIME `text/javascript` correcto
- ✅ Pruebas funcionales: `genDiario`/`buildMayor` calculan correcto (apertura → banco deudor, capital acreedor); liquidación de sueldo da AFP 74.060 y líquido 572.740, idénticos al monolito

## Lo que FALTA validar (imprescindible antes de reemplazar el monolito)

Node valida sintaxis, imports y lógica pura, pero **no** el DOM real ni los eventos. Antes de dar por buena la migración, prueba en el navegador:

1. Login y logout
2. Cargar/guardar cada sección (empresa, PDC, apertura, ventas, compras, honorarios, asientos, remuneraciones, activo fijo)
3. Reportes: diario, mayor, balance, resultados, F29, flujo, conciliación
4. Export/import Excel y sincronización con Firestore
5. Búsqueda (Ctrl+K), impresión, responsive móvil

Mantén el `index.html` monolítico como respaldo hasta completar esta prueba.
