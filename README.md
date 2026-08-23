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
- **Botón 💾 en la barra superior**: se pone amarillo y late cuando hay cambios sin guardar
- **Guardado automático** (`js/autoguardado.js`): cada 30 s / 1 / 2 / 5 min a elección, al cambiar de
  pestaña o minimizar, y como último recurso en `pagehide` (ahí sólo alcanza localStorage, pero el
  dato no se pierde y sube en el próximo arranque). Se activa y configura en Configuración → Sistema;
  la preferencia es por dispositivo
- **Salida que ofrece guardar**: al cerrar sesión con trabajo pendiente, Aceptar guarda y sale;
  Cancelar se queda. Si el guardado falla, recién ahí pregunta si quiere salir perdiendo los cambios
- **Aviso al salir**: si hay cambios sin guardar, avisa antes de cerrar, recargar o cerrar sesión
- **Botón atrás (Android)**: cierra modales → vuelve a la pantalla inicial → pregunta si salir
- **Indicador en el encabezado**: "● Sin guardar" o "✓ Guardado HH:MM"

Para cambiar el comportamiento de sesión, en `js/auth.js`:
```js
firebase.auth.Auth.Persistence.SESSION  // actual
firebase.auth.Auth.Persistence.NONE     // pide clave hasta al recargar
firebase.auth.Auth.Persistence.LOCAL    // recuerda siempre
```

### Reglas de Firestore

El archivo **`firestore.rules`** del repositorio contiene las reglas endurecidas.
Cada usuario sólo lee y escribe los datos de las empresas de las que es miembro,
el rol `consulta` no puede escribir, nadie puede cambiar su propio rol y el
registro de auditoría es inmutable.

#### Cómo funciona el aislamiento

Las reglas no saben parsear JSON ni leer el prefijo del id en una consulta, así
que la app mantiene dos cosas para ellas:

| Qué | Dónde | Para qué |
|---|---|---|
| `empresas_acl/<empresaId>` | colección propia | `{creadoPor, miembros:[emails]}` — las reglas leen `miembros` |
| campo `empresa` | en cada doc de `contabilidad_data` | permite consultar con `where('empresa','==',id)` |

`js/acl.js` mantiene el ACL al día cada vez que se crea, comparte, reclama o
elimina una empresa. `js/storage.js` estampa el campo `empresa` en cada escritura.

#### Puesta en marcha (en este orden — importante)

0. **Abre la colección nueva en tus reglas actuales.** `empresas_acl` no existe
   todavía, así que Firestore la bloquea por defecto y la migración no puede
   crear las fichas. Agrega este bloque a las reglas que ya tienes y publica:
   ```
   match /empresas_acl/{empresaId} {
     allow read, write: if esUsuarioActivo();
   }
   ```
   Es temporal: al publicar `firestore.rules` completo queda sustituido por la
   versión estricta. Si te saltas este paso, el panel te lo dirá con el bloque
   listo para copiar.
1. **Prepara la base con las reglas VIEJAS todavía publicadas.**
   Entra como administrador → Configuración → Sistema → 🔒 Aislamiento por empresa →
   **Preparar aislamiento**. Crea las fichas de acceso y marca los documentos
   existentes. No toca ningún dato contable.
2. **Verifica.** El mismo panel debe quedar en verde: *"La base está lista"*.
3. **Publica** el contenido de `firestore.rules` en
   Firebase → Firestore Database → Reglas → Publicar.
4. **Vuelve a verificar** desde la app. Aquí el panel cambia de modo: con las
   reglas endurecidas publicadas, la consulta sin filtro que usaba el recuento
   completo se rechaza **a propósito**, así que el diagnóstico pasa a contar los
   documentos **empresa por empresa** y a contrastarlos con lo guardado en este
   equipo. Que ese recuento se rechace es la señal de que el aislamiento está
   activo, no un error.
   Si aparecen documentos que este equipo tiene y la nube ya no deja leer
   (quedaron sin marcar), el botón **🛠 Reparar documentos** los vuelve a subir
   —hazlo desde el equipo con la información más al día.
`firestore.rules` viene en su **versión estricta**: una empresa sin ficha de
acceso queda fuera del alcance de todos menos los administradores. Si hay que
migrar una base desde cero y el paso 1 no puede completarse con las reglas ya
publicadas, agrega temporalmente `|| !hayAcl(emp)` como tercera condición de la
función `miembro()` y bórralo apenas el panel quede en verde.

Si compartes una empresa y el otro usuario no la ve, usa **Reparar accesos** en
el mismo panel: reescribe las fichas desde el catálogo.

#### Consecuencias a tener en cuenta

- **Alta de usuarios**: un administrador puede invitar a cualquiera desde
  Configuración → Usuarios (pre-autoriza el email con su rol). Quien se registra
  por su cuenta queda siempre inactivo y de sólo consulta hasta que un admin lo
  apruebe. En ambos casos el id del documento tiene que ser el email que lleva
  dentro.
- **Proyecto nuevo desde cero**: el atajo "primer usuario = admin" que trae la app
  no se puede validar desde las reglas, así que queda prohibido. Crea a mano el
  primer documento en la consola de Firebase:
  `usuarios/<tu-email>` = `{email, nombre, rol:'admin', activo:true, pendiente:false}`.
- **Auto-promoción del usuario único**: la red de seguridad de `auth.js` que
  promueve a admin al único usuario del sistema deja de funcionar por la misma
  razón. Se arregla desde la consola.
- **El catálogo `_empresas` sigue siendo escribible** por cualquier usuario con
  permiso de escritura: es un único documento compartido. El aislamiento protege
  los *datos*, no la lista de nombres de empresa.
- **"Descargar de la nube"** ahora consulta empresa por empresa en lugar de traer
  la colección completa (una consulta sin filtro se rechaza entera).

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

- **Comprobantes — eliminar**: desde el modal se puede eliminar cualquier comprobante.
  Un comprobante manual borra su asiento (y ofrece "Anular" como alternativa, que
  conserva el N° correlativo); uno de apertura borra el asiento N°0; uno automático
  de ventas o compras borra el **documento que lo origina**, porque el comprobante
  es su reflejo y no existe por separado. Honorarios queda fuera: su comprobante
  resume todas las boletas del mes, así que manda al libro correspondiente.
- **Comprobantes — tabla**: código, cuenta y montos se dimensionan según su
  contenido y siempre caben enteros; la descripción absorbe el espacio sobrante y
  es la única que se corta, con el texto completo en el tooltip.
- **Signo de presentación en los informes**: `buildMayor` guarda `saldo = debe − haber`,
  así que las cuentas de pasivo, patrimonio e ingreso quedan con saldo negativo. Para
  presentarlas hay que **invertir el signo**, nunca tomar el valor absoluto: con
  `Math.abs`, una cuenta de activo con saldo acreedor (un banco sobregirado) se muestra
  sumando en vez de restando y el balance descuadra en el DOBLE de ese saldo. El helper
  `saldoPres(cd,saldo)` centraliza la regla y lo usan Balance, Mayor, EERR y comparativo.
- **Aviso de saldos invertidos**: el Balance lista las cuentas que quedaron con saldo
  contrario a su naturaleza (excluyendo las correctoras de activo, donde es normal),
  porque casi siempre son datos pendientes de cargar.
- **Eliminar empresa**: tres pasos. El segundo pregunta SÓLO por los datos (Cancelar ahí
  conserva la información, la empresa se elimina igual del listado) y el tercero es la
  salida de emergencia donde Cancelar aborta todo. Antes el segundo Cancelar se
  interpretaba como "no borres los datos" y la empresa desaparecía igual del catálogo,
  que es exactamente lo que la gente creía estar evitando.
- **Empresas recuperables**: eliminar sin borrar datos deja las claves `<id>:…` intactas.
  La sección Empresas lista esas empresas huérfanas —leyendo su nombre y RUT de la propia
  ficha guardada— y permite volver a registrarlas con SU MISMO id, que es lo que hace que
  reaparezcan con todos sus libros.
- **Buscador global (Ctrl+K)**: al elegir un resultado se abre **su comprobante**, que es la
  vista con el registro completo y su asiento. Antes sólo navegaba a la sección: si el
  documento era de otro mes —o si ya estabas ahí— no pasaba nada visible y el clic parecía
  perderse. Funciona para ventas, compras, asientos manuales, honorarios y apertura; los
  resultados que tienen comprobante se marcan con 📄. Las cuentas del plan, trabajadores y
  activos siguen navegando a su sección.
- **Abrir en un equipo nuevo (móvil)**: ahí no hay nada en local y todo tiene que venir de
  Firestore. `storage.leerGlobalConEstado(clave)` distingue **"la nube dice que no hay nada"**
  de **"no pude leer la nube"** — `getGlobal` devolvía `null` en ambos casos. Con esa
  distinción, `cargarEmpresas` ya no crea una empresa por defecto cuando la lectura falla:
  marca `EMPRESAS.errorCarga`, la sección Empresas muestra qué pasó y no se escribe nada.
  Antes, un fallo de lectura en el móvil creaba "Mi Empresa" y la **guardaba**, pisando en la
  nube el catálogo real de todos los equipos. `guardarCatalogo` tampoco escribe si el
  catálogo no se pudo leer primero.
- **Candado contra la pérdida silenciosa** (`storage.js`): toda lectura que falla se parece
  a "no hay datos" — la sección aparece vacía y el primer guardado escribe ese vacío encima
  del dato bueno. Ahora `leerConEstado(clave)` distingue el error y **bloquea la escritura**
  de esa clave hasta que se lea bien. El candado vive en storage a propósito: protege a
  todos los módulos, al `saveAll` y al autoguardado sin que cada uno tenga que acordarse.
  El botón de la barra superior pasa a **🚫 Guardado bloqueado** y explica qué claves y por
  qué. Se libera solo en cuanto la lectura vuelve a funcionar (basta recargar).
- **Identidad de dispositivo** (`js/dispositivo.js`): cada navegador donde se abre la app
  recibe un id permanente y un nombre editable ("PC oficina", "Celular Rodrigo"), visible en
  Configuración → Sistema. Firma cada escritura en la nube.
- **Versión por documento y fusión** (`storage.js`): cada documento lleva `rev` (contador) y
  el dispositivo que lo escribió. Guardar abre una **transacción**: si la rev de la nube ya
  no es la que se leyó, otro equipo escribió en el intermedio y NO se sobrescribe.
  Los libros son listas de registros con `id`, así que se **fusionan por id** — lo del otro
  equipo se conserva, lo propio se agrega, y en empates gana la edición local. Lo que no es
  una lista con id (ficha de empresa, indicadores) no se puede fusionar solo: se frena, no
  se escribe nada y se avisa a quién pertenece la versión de la nube.
  Detalle honesto: en una fusión, un registro borrado localmente que el otro equipo todavía
  tenía **revive**. Es el mal menor frente a perder su trabajo completo, y se avisa.
  La condición de conflicto mira SÓLO la revisión, no el id del dispositivo: dos pestañas
  del mismo navegador comparten id y se habrían pisado igual.
- **Lápidas** (`storage.js`): fusionar por id tenía un agujero — un registro borrado acá que
  el otro equipo todavía tenía **revivía**, porque "no está en mi lista" no distingue entre
  "nunca lo tuve" y "lo borré". Ahora cada documento guarda un mapa `borrados` {id: fecha}
  que viaja con él, y la fusión excluye esos ids vengan de donde vengan. Se detecta solo:
  `baseline` recuerda los ids de la última lectura o escritura buena, y lo que desaparece de
  una escritura a la siguiente es un borrado — ningún módulo tiene que avisar nada. Si un id
  con lápida se vuelve a crear a propósito, la lápida se levanta (y no la resucita la unión
  con las lápidas de la nube).
- **Cruce al iniciar sesión**: antes de dejar trabajar, la app lee de la nube TODAS las
  claves de la empresa activa, con una pantalla de progreso. Demora un poco la apertura a
  cambio de atacar la causa de fondo: un equipo que arranca con una foto vieja es el que
  después genera conflictos. Al terminar, cada clave queda con su revisión, su baseline de
  ids y sus lápidas al día. Si alguna no se pudo leer, avisa y deja el guardado bloqueado.
- **Claves globales compartidas**: `_empresas` es el único documento que escriben TODOS los
  usuarios, y cada uno guarda el catálogo COMPLETO. Dos personas creando su empresa a la vez
  se borraban la del otro del listado (los datos sobrevivían, pero la empresa desaparecía).
  Ahora `setGlobal(clave,valor,{fusionar:true})` le aplica el mismo control de versión y
  fusión por id que a los libros, y `guardarCatalogo` adopta el catálogo fusionado para que
  la pantalla muestre también lo que creó el otro. Las demás claves globales son de un solo
  usuario (`_empresaActiva:<email>`) o se escriben una vez: ahí gana la última escritura,
  que es lo correcto para una preferencia.
- **Botón atrás en el móvil** (`js/salida.js`): en el celular el atrás es EL botón que se
  usa, y cerrar la pestaña de un toque obliga a iniciar sesión de nuevo. Ahora escala por
  capas: cierra el modal abierto → cierra el buscador o el menú → cierra el formulario en
  pantalla → vuelve a la pantalla inicial → y sólo entonces **pregunta** si salir, con un
  diálogo propio de la página que ofrece "Seguir trabajando", "Guardar y salir" (si hay
  cambios pendientes) y "Salir".
  Tres motivos por los que antes se cerraba igual: los modales se buscaban por
  `style.display` pero se abren con la clase `open` (nunca se detectaban); varios caminos
  salían sin reponer la entrada centinela del historial, y sin centinela el siguiente atrás
  abandona la página; y usaba `confirm()` dentro de `popstate`, que Android Chrome ignora
  con frecuencia. La centinela ahora se repone SIEMPRE y de inmediato.
  `initAvisoSalida` es idempotente: dos manejadores harían dos cosas por cada toque.
- **Centro de costo sólo en cuentas de resultado**: en los asientos manuales, la columna de
  centro de costo aparece únicamente cuando la cuenta es de **gasto/costo** (`tp:'C'`,
  prefijo 3) o de **ingreso** (`tp:'I'`, prefijo 4). Un centro de costo responde "¿dónde se
  gastó / de dónde vino esto?", pregunta que no aplica a un banco, un proveedor o el capital:
  activo y pasivo son saldos, no consumo. En esas cuentas el campo queda desactivado y
  explica por qué. Si se cambia la cuenta a una que no admite centro, el que hubiera se
  descarta —para que no viaje invisible hasta el guardado— y `guardarAsiento` lo vuelve a
  comprobar como red de seguridad. `aceptaCentroCosto(cd)` mira el `tp` del plan y cae al
  prefijo del código si la cuenta no está en el plan (cargada desde Excel, por ejemplo).
- **Modal DTE al terminar el monto, no al primer dígito**: la apertura automática vivía en
  `oninput`, así que saltaba con la primera tecla y tapaba el campo mientras se escribía.
  Se movió a `lValFmtBlur` — se abre al salir del campo (tab o clic fuera), con el monto ya
  completo.
- **Buscador dinámico de auxiliares** (`inputAux` en `buscadorcuentas.js`): el RUT del
  cliente/proveedor se escribía a mano. Ahora se busca por código o por nombre sobre las
  fichas cargadas, muestra el giro y al elegir rellena RUT, dígito verificador y razón
  social. Un RUT sin ficha sigue siendo válido: sólo no hay nada que autocompletar.
- **Distribución del gasto tomada del asiento**: la cuenta de gasto ya está en el asiento
  (es la contrapartida de la línea del proveedor). El modal la trae de ahí, recordando de
  qué línea salió, y si en el modal se elige otra cuenta, **se actualiza la línea del
  asiento** — son el mismo hecho económico y no pueden quedar discrepando.

## Detalle de auxiliares del Balance de Apertura (`js/aperturaaux.js`)

El asiento de apertura dice "Facturas por Cobrar: $4.859.531.273". Ese número cuadra el
balance, pero no sirve para trabajar: no se sabe qué facturas lo componen, de qué clientes,
ni cuáles están vencidas — y cuando llega un pago, no hay documento contra el cual imputarlo.

Este módulo captura ese detalle documento por documento (RUT, razón social, tipo de DTE,
número, emisión, vencimiento, monto y **saldo pendiente**), para clientes, proveedores y
honorarios por pagar. Vive en la sección **Apertura**, en la tarjeta "📒 Detalle de
auxiliares".

- **La regla que lo mantiene honesto**: la suma de los saldos capturados de una cuenta debe
  ser igual al monto de esa cuenta en el asiento de apertura. La diferencia se muestra en
  vivo y guardar sin cuadrar exige una confirmación explícita.
- **Dónde viven los datos**: `S.apertura.auxDocs`, dentro del propio asiento de apertura,
  para que viajen con él al exportar, importar y respaldar.
- **Carga**: fila a fila con el buscador dinámico de auxiliares, o desde Excel con plantilla
  descargable. El importador tolera variantes de nombres de columna, fechas `dd-mm-aaaa`,
  `aaaa-mm-dd` y seriales de Excel, y reporta las filas con problemas sin abortar el resto.
- **Para qué sirve**: los documentos entran al auxiliar como documentos normales **con su
  fecha real de emisión** (no la del asiento de apertura), así que el aging los clasifica por
  su antigüedad verdadera y Pagos y Cobros puede imputar contra facturas anteriores al
  sistema.

## Publicar una versión (`_release.py`)

`index.html` cargaba `js/app.js?v=<epoch>`, pero app.js importa los otros ~50 módulos con
rutas estáticas **sin versión**. El navegador se quedaba con la copia vieja de cada uno: se
publicaba un arreglo en `apertura.js` y el usuario seguía ejecutando el de ayer, sin ningún
indicio de que algo iba mal. Fue exactamente lo que pasó con la tarjeta de auxiliares — el
código estaba publicado, el navegador servía el módulo anterior.

`_release.py` lo resuelve sin build: genera un **import map** que apunta cada módulo a su URL
con la versión. Los import maps aceptan especificadores tipo URL, así que `./core.js` dentro
de app.js queda redirigido a `./js/core.js?v=<epoch>`.

    python3 _release.py v2026.08.22-0130

Actualiza el import map, el `?v=` de app.js y la versión visible en la barra superior. Hay que
correrlo **en cada publicación**; si no, el problema vuelve.
- **Asientos manuales dentro de Comprobantes**: "Asientos Manuales" dejó de ser un módulo
  aparte. Tenía su propio listado de sólo los manuales, cuando Comprobantes ya muestra el
  libro diario completo — dos listas del mismo hecho, y había que saber en cuál buscar.
  Ahora el formulario vive dentro de la sección Comprobantes y se abre con **"+ Nuevo
  Asiento"**. `abrirForm`, `editarAsiento` y `duplicarAsiento` navegan primero a Comprobantes
  (`irAComprobantes()`): si no, al llamarlos desde el Diario o el buscador el formulario se
  abría en una sección invisible. `renderAsientos()` sobrevive con un guard —varios flujos la
  llaman tras guardar— y `renderSec('asientos')` redirige a Comprobantes por si queda algún
  enlace viejo.
