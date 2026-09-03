/* sw.js — Service worker de Contabilidad ME.
 *
 * Su único trabajo es que la aplicación se pueda instalar y que abra sin red.
 * NO acelera nada sirviendo copias viejas, y esa decisión es deliberada.
 *
 * Por qué siempre va primero a la red
 * -----------------------------------
 * Los 59 módulos se versionan con un import map que genera _release.py. Un
 * service worker con la estrategia habitual (cache-first) volvería a meter el
 * problema que ese import map vino a resolver: el usuario publicaría un arreglo
 * y seguiría ejecutando el código de ayer, sin ningún indicio. En un sistema
 * contable eso significa cuadrar un balance contra una versión equivocada.
 *
 * Así que: red primero, siempre. La caché es sólo el respaldo para cuando no
 * hay señal, que es el caso real en terreno. Estando en línea, lo que se ve es
 * exactamente lo que está publicado.
 */

// _release.py reescribe esta línea en cada publicación: al cambiar el nombre,
// la caché anterior se descarta entera en activate.
const CACHE = 'contabilidad-1788470845';

// Lo mínimo para que la aplicación abra sin red. Los módulos JS y el CSS se van
// guardando solos a medida que se usan (ver fetch), así no hay que mantener a
// mano una lista de 59 archivos que se desincroniza al primer módulo nuevo.
const BASE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  // No se espera a que termine el precache: si algún archivo falla, la
  // instalación no debe abortarse. Lo que falte se guarda al primer uso.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(BASE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Sólo se administra lo propio. Firestore, el CDN de Firebase y el de XLSX
  // se dejan pasar tal cual: tienen su propia caché y sus propias reglas, y
  // cachear respuestas de la base de datos sería servir datos contables viejos.
  if (url.origin !== self.location.origin) return;

  // `no-cache` obliga a revalidar contra el servidor en vez de aceptar lo que
  // tenga la caché HTTP del navegador. Sin esto, el service worker iría a la
  // red pero la red podría responder desde una copia local vencida: la app
  // seguiría ejecutando el módulo de ayer, que es justo lo que hay que evitar.
  // Cuando el archivo no cambió, el servidor responde 304 y no se descarga nada.
  let pedido = req;
  try { pedido = new Request(req, { cache: 'no-cache' }); } catch (_) { /* navegador antiguo */ }

  e.respondWith(
    fetch(pedido)
      .then(res => {
        // Sólo se guardan respuestas completas y propias
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Una navegación sin red cae al index guardado; la aplicación arranca
        // con lo que tenga en localStorage y avisa que está sin conexión.
        if (req.mode === 'navigate') {
          const idx = await caches.match('./index.html');
          if (idx) return idx;
        }
        return Response.error();
      })
  );
});

// Permite que la página fuerce la activación de una versión nueva sin recargar
// dos veces (lo usa el aviso de «hay una versión nueva» en index.html).
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
