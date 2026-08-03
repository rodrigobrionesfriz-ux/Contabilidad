# Contabilidad — Sistema contable chileno

Aplicación web de contabilidad para empresas chilenas, con soporte multiempresa, orientación agrícola/forestal y cumplimiento tributario SII.

**Stack:** HTML + 39 módulos ES nativos + CSS. Sin build, sin npm, sin frameworks. Firebase (Auth + Firestore) para autenticación y sincronización.

---

## Instalación

### Probar localmente
Los módulos ES **no funcionan abriendo el archivo con doble clic** (`file://`). Necesitas un servidor:

```bash
cd app-modular
python3 -m http.server 8000
```
Abre `http://localhost:8000`.

### Publicar en GitHub Pages
Sube `index.html`, la carpeta `js/` y la carpeta `css/` a la **raíz** del repositorio, manteniendo la estructura. Son ~40 archivos y las rutas relativas importan: no basta con subir uno solo.

---

## Funcionalidades

### Registros
- **Libro de Ventas** — documentos individuales con DTE, RUT, formas de pago, filtros por rango de fechas
- **Libro de Compras** — con distribución de gastos por cuenta e importador desde el registro del SII
- **Honorarios** — retención de 2ª categoría con tasa automática por año (Ley 21.133)
- **Asientos Manuales** — partidas libres con buscador de cuentas, modal de documentos auxiliares, duplicar y anular
- **Auxiliares** — por cliente/proveedor, con análisis de antigüedad de saldos (aging)

### Reportes
Libro Diario · Libro Mayor · Balance General (con comparativo entre años) · Estado de Resultados estructurado · Flujo de Caja (realizado y proyectado) · Conciliación Bancaria (manual o cargando cartola)

### Tributario SII
- **Formulario 29** — IVA mensual con arrastre de remanente, PPM y retenciones
- **PPM** — pago provisional mensual
- **Exportar XML SII** — libros de compra/venta en formato IECV (esquema LibroCV_v10)

### Activo fijo y cierre
Activos fijos con depreciación lineal y acelerada · Provisiones (incobrables, feriado legal) · Corrección monetaria (informativa) · Cierre de ejercicio

### Remuneraciones
Liquidaciones completas con AFP, salud (Fonasa o isapre con plan en UF del FUN), seguro de cesantía e impuesto único de 2ª categoría. La liquidación separa el 7% legal del adicional isapre. Incluye aporte patronal desglosado (SIS, mutual, AFC, caja) con la institución de destino de cada componente.

### Centros de costo
Dos niveles (centro principal → subcentro) para clasificar gastos por área: Administración, Transporte, Área Maderas, predios agrícolas, etc.

Tres tipos de centro:
- **Operativo** — sus costos van directo a resultado
- **Inversión en curso** — acumula costos capitalizables según una curva de % por año
- **Capitalizado** — ya se traspasaron a activo fijo

Las inversiones en curso permiten **cierre mensual manual** (solo administradores) que traspasa los gastos del mes repartiéndolos entre activo y costo del período, y **capitalización final** a activo fijo.

### Multiempresa
Cada empresa tiene sus datos completamente aislados: plan de cuentas, libros, asientos, indicadores y centros propios. Se cambia con el selector del encabezado. Cada empresa elige su marco contable (tributaria chilena PCGA, NIIF para PYMEs o NIIF plenas).

### Sistema
Autenticación con roles (admin, contador, consulta) y permisos por sección · Gestión de usuarios · Registro de actividad (audit log) · Búsqueda global (Ctrl+K) · Export/import Excel · Sincronización con Firestore · Impresión con encabezado oficial · Tres temas visuales · Diseño responsive

---

## Configuración importante

### Indicadores (Configuración → Indicadores)
Valores que **debes mantener actualizados**:
- **UF** (cambia a diario), **UTM** y **UTA** (mensuales), dólar y euro
- Botón **"Traer valores del Banco Central"** que los consulta automáticamente desde mindicador.cl
- Topes imponibles (AFP/salud 90 UF, cesantía 135,2 UF), ingreso mínimo
- Tasas: AFP 10%, salud 7%, cesantía 0,6%, factor corrección monetaria
- **Retención de honorarios**: tabla por año según Ley 21.133 (2026: 15,25%, sube hasta 17% en 2028). Se aplica la tasa del año en que se emite la boleta

### Previsional (dentro de Indicadores)
- Comisiones de las 7 AFP (editables)
- Aporte del empleador: SIS 1,62%, mutual (base 0,90% + adicional por riesgo), AFC 2,4% indefinido / 3% plazo fijo, caja de compensación
- Instituciones: mutual (ACHS, Mutual CChC, IST, ISL) y caja

⚠️ **La tasa adicional de mutualidad viene en 0%**: depende del riesgo de tu actividad y te la notifica tu mutual. Cárgala para que el costo empresa quede exacto.

### Año agrícola
Los costos de las inversiones en curso se agrupan por **temporada de mayo a abril**. La temporada 2025/26 va del 1-may-2025 al 30-abr-2026.

---

## Arquitectura

Dependencias en una sola dirección, sin ciclos.

```
Capa 0  core · state · ui · tema · salida · buscadorcuentas
Capa 1  firebase · storage
Capa 2  helpers · pdc · empresa · indicadores · previsional · centroscosto
Capa 3  auth · usuarios · audit · empresas
Capa 4  asientos · ventas · compras · honorarios · apertura
        activofijo · remuneraciones
Capa 5  reportes · auxiliares · tributario · cierre · flujocaja
        conciliacion · xmlsii · busqueda · backup · impresion
        (+ las UI: previsional-ui · centroscosto-ui · empresas-ui)
Capa 6  app  (orquestador)
```

`app.js` importa todo, define el routing y publica en `window` las ~160 funciones que el HTML usa en sus `onclick`.

### Cómo se rompieron los ciclos
| Ciclo | Solución |
|---|---|
| auth ↔ audit | `logAccion` (escritura) → firebase.js; `renderAuditLog` (vista) → audit.js |
| auth ↔ app | auth expone `setOnAuthReady(fn)`; app.js registra el arranque |
| ventas ↔ asientos | helpers de bajo nivel → helpers.js |
| varios ↔ app | `ui.js` con wrappers de `rerender`/`nav`; app.js inyecta con `registrarUI()` |

### Detalles técnicos
- **`PDC` se muta in-place** (`splice`), nunca se reasigna: los módulos ES no permiten reasignar un import
- **Estado de formularios interno**: `AF`, `VF`, `CF`, `REMF`, `AFB` se declaran en su módulo y se publican en `window` porque el HTML los usa en `onclick`
- **Multiempresa**: `storage.js` prefija todas las claves con el id de empresa (`emp1:ventas-2026`). Transparente para el resto de módulos
- **Migración automática**: los datos de la versión monoempresa pasan a "Mi Empresa" la primera vez

---

## Sesión y seguridad

- **Persistencia SESSION**: la sesión sobrevive a recargas (F5) pero se pierde al cerrar la pestaña o el navegador
- **Aviso al salir**: si hay cambios sin guardar, avisa antes de cerrar, recargar o cerrar sesión
- **Botón atrás (Android)**: cierra modales → vuelve a la pantalla inicial → pregunta si salir
- **Indicador en el encabezado**: "● Sin guardar" o "✓ Guardado HH:MM"

Para cambiar el comportamiento de sesión, en `js/auth.js`:
```js
firebase.auth.Auth.Persistence.SESSION  // actual
firebase.auth.Auth.Persistence.NONE     // pide clave hasta al recargar
firebase.auth.Auth.Persistence.LOCAL    // recuerda siempre
```

### Reglas de Firestore necesarias
Para que el registro de actividad funcione, agrega en `firestore.rules`:
```
match /audit_log/{doc} {
  allow create: if esUsuarioActivo();
  allow read: if esAdminActivo();
  allow update, delete: if false;   // el historial es inmutable
}
```

---

## Validación

Cada entrega se valida en Node con stubs del DOM:
- Los 39 módulos cargan en cadena sin ciclos
- **27 secciones** se renderizan y dibujan contenido real
- **12 formularios** abren sin error
- Cobertura de `onclick`: todas las funciones que el HTML invoca están publicadas
- Cálculos verificados contra fuentes oficiales: liquidaciones de sueldo, retención de honorarios, IUSC, F29, depreciación, capitalización por curva

### Lo que Node NO cubre
El DOM real, los eventos y Firebase. Antes de dar por buena una versión, prueba en el navegador: login/logout, guardar en cada sección, reportes, export/import Excel, sincronización, búsqueda (Ctrl+K), impresión y uso en móvil.

---

## Limitaciones conocidas

- **XML SII**: el archivo cumple el formato de datos, pero para presentarlo al SII debe **firmarse digitalmente** con certificado electrónico. Eso no se puede hacer desde un sitio web estático
- **IFRS**: el marco contable por empresa hoy adapta advertencias y el encabezado de reportes. Una implementación NIIF completa requeriría plan de cuentas por naturaleza, estados en formato NIIF, notas, deterioro (NIC 36), arrendamientos (NIIF 16) e impuestos diferidos (NIC 12)
- **Corrección monetaria**: el régimen 14 D N°3 Pro-Pyme General **no está sujeto** a la CM del Art. 41 LIR. El módulo es informativo
- **Indicadores automáticos**: dependen de mindicador.cl, un servicio externo gratuito. Si está caído, los valores se ingresan a mano
