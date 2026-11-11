const CACHE_PREFIX = 'horarios-';
const CACHE_NAME = `${CACHE_PREFIX}v261111.2031-cache`;
const urlsToCache = [
  './',
  './index.html',
  './assets/manifest.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/badge-96.png',
  './assets/fonts/inter-latin.woff2',
  './assets/styles/tokens.css',
  './assets/styles/base.css',
  './assets/styles/tarjetas-vistas.css',
  './assets/styles/modales-funciones.css',
  './assets/styles/responsivo-movimiento.css',
  './src/core/almacenamiento.js',
  './src/core/busqueda-texto.js',
  './src/core/constantes.js',
  './src/core/dom.js',
  './src/core/estilo-calendario.js',
  './src/core/estilo-tarjeta.js',
  './src/core/eventos.js',
  './src/core/geometria-etiquetas.js',
  './src/core/html.js',
  './src/core/movimiento.js',
  './src/core/posicion-header.js',
  './src/core/preferencias.js',
  './src/core/recarga.js',
  './src/core/resumen-tarjeta.js',
  './src/core/seguridad.js',
  './src/core/tema-inicial.js',
  './src/core/tiempo-utils.js',
  './src/data/feriados.js',
  './src/data/fondos.js',
  './src/main.js',
  './src/services/aviso-jornada.js',
  './src/services/cambios.js',
  './src/services/compensatorios.js',
  './src/services/dias-habiles.js',
  './src/services/edicion-grupo.js',
  './src/services/edicion-registro.js',
  './src/services/estadisticas-periodo.js',
  './src/services/estado-app.js',
  './src/services/estado-tarjeta.js',
  './src/services/feriados-ar.js',
  './src/services/filtros.js',
  './src/services/gestion-datos.js',
  './src/services/gestor-historial.js',
  './src/services/gestor-perfiles.js',
  './src/services/importar-exportar.js',
  './src/services/jornada.js',
  './src/services/objetivos.js',
  './src/services/operaciones-lote.js',
  './src/services/orden-cards.js',
  './src/services/recordatorio-push.js',
  './src/services/saldo-semanal.js',
  './src/services/sincronizacion-gist.js',
  './src/services/tiempo-fuera.js',
  './src/services/tipos-registro.js',
  './src/ui/animaciones.js',
  './src/ui/arrastre.js',
  './src/ui/aviso-actualizacion.js',
  './src/ui/aviso-push.js',
  './src/ui/ayuda-buscador.js',
  './src/ui/barra-hitos.js',
  './src/ui/base.js',
  './src/ui/bienvenida-modal.js',
  './src/ui/boton-fichar.js',
  './src/ui/calendario-popups.js',
  './src/ui/calendario.js',
  './src/ui/configuracion.js',
  './src/ui/estadisticas.js',
  './src/ui/foco-hitos.js',
  './src/ui/formularios.js',
  './src/ui/gestor-modales.js',
  './src/ui/gestor-temas.js',
  './src/ui/gestos.js',
  './src/ui/gist-respaldo.js',
  './src/ui/gist-resumen-merge.js',
  './src/ui/header-posicion.js',
  './src/ui/historial-dias.js',
  './src/ui/historico-edicion.js',
  './src/ui/historico-items.js',
  './src/ui/historico.js',
  './src/ui/hover-barra.js',
  './src/ui/iconos-animados.js',
  './src/ui/instalador-pwa.js',
  './src/ui/notificaciones.js',
  './src/ui/orden-tarjetas.js',
  './src/ui/orquestador.js',
  './src/ui/perfiles.js',
  './src/ui/popups.js',
  './src/ui/recarga-gesto.js',
  './src/ui/reportes.js',
  './src/ui/respaldo-local.js',
  './src/ui/scroll.js',
  './src/ui/tarjeta-ciclo-stats.js',
  './src/ui/tarjeta-estilos.js',
  './src/ui/tarjeta-fichaje-vista.js',
  './src/ui/tarjeta-fichaje.js',
  './src/ui/tarjeta-fondos.js',
  './src/ui/tarjeta-lote.js',
  './src/ui/tarjeta-tiempo-fuera.js',
  './src/ui/toast.js',
  './src/ui/transicion-layout.js',
  './src/ui/verificar-feriados.js',
  './src/ui/vista-previa.js',
];

// Avisa a las pestañas abiertas cómo va la descarga de la versión nueva (la página muestra el aviso con barra de progreso)
function avisarAClientes(mensaje) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clientes => clientes.forEach(c => c.postMessage(mensaje)))
    .catch(() => { });
}

// Descarga todos los archivos de esta versión en paralelo (sin usar la caché HTTP), informa el avance y, al terminar, toma el control.
// Es todo o nada: si falla uno, este worker queda en espera sin activarse y se conserva la versión anterior.
// Una sola descarga a la vez: los pedidos repetidos se suman a la que está en curso; si falla, se puede volver a pedir.
let descargaEnCurso = null;
function descargarVersion() {
  if (descargaEnCurso) return descargaEnCurso;
  descargaEnCurso = (async () => {
    const cache = await caches.open(CACHE_NAME);
    const total = urlsToCache.length;
    let descargados = 0;
    let ultimoAviso = -1;
    const informar = () => {
      const porcentaje = Math.floor((descargados / total) * 100);
      if (porcentaje === ultimoAviso) return;
      ultimoAviso = porcentaje;
      avisarAClientes({ tipo: 'sw-progreso', progreso: porcentaje, version: CACHE_NAME });
    };
    try {
      informar();
      await Promise.all(urlsToCache.map(async url => {
        const respuesta = await fetch(new Request(url, { cache: 'reload' }));
        if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
        await cache.put(url, respuesta);
        descargados++;
        informar();
      }));
    } catch (err) {
      console.error('CRÍTICO: Falló la descarga de archivos de la versión nueva:', err);
      await avisarAClientes({ tipo: 'sw-error', version: CACHE_NAME });
      throw err;
    }
    await self.skipWaiting();
  })();
  descargaEnCurso.catch(() => { descargaEnCurso = null; });
  return descargaEnCurso;
}

// Instalación: termina enseguida y la descarga corre DESPUÉS del evento, no dentro de él.
// Chromium (Chrome, Brave, Edge) limita a 3 los pedidos simultáneos de un worker mientras está instalándose: con ~100 archivos
// la descarga dentro del install tardaba varios segundos en el celular; fuera del evento van todos en paralelo.
// El worker arranca la descarga por su cuenta (sirve también para páginas abiertas con código anterior, que no la piden)
// y la página la pide además con 'sw-descargar' (ver el manejador de 'message'), lo que la mantiene viva y permite reintentar.
self.addEventListener('install', () => {
  setTimeout(() => { descargarVersion().catch(() => { }); }, 0);
});

// Activación — limpieza de cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          // Solo cachés propias: el origen de GitHub Pages es compartido con otras apps
          .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — cache-first aislado en CACHE_NAME, fallback a network
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  
  // Limitar al scope del Service Worker para no cachear otros proyectos en el mismo origen de GitHub Pages
  if (!url.pathname.startsWith(self.registration.scope.replace(location.origin, ''))) return;

  const matchOpts = { cacheName: CACHE_NAME, ignoreSearch: true };

  event.respondWith(
    caches.match(event.request, matchOpts)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(networkResponse => {
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type !== 'basic'
            ) {
              return networkResponse;
            }
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return networkResponse;
          })
          .catch(async () => {
            // Sin conexión: una navegación cae a la app precacheada; cualquier otro recurso falla como error de red
            if (event.request.mode === 'navigate') {
              const app = (await caches.match('./index.html', matchOpts)) || (await caches.match('./', matchOpts));
              if (app) return app;
            }
            return Response.error();
          });
      })
  );
});

// Muestra el recordatorio de fin de jornada (lo usan el push real y la notificación de prueba)
// El payload puede llegar como cualquier JSON (null, un número, un array): se toman solo title y body como texto acotado.
function mostrarRecordatorio(data) {
  const d = data && typeof data === 'object' ? data : {};
  const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : '');
  return self.registration.showNotification(texto(d.title, 100) || 'Horarios', {
    body: texto(d.body, 300) || 'Se cumplió tu horario de hoy',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/badge-96.png',
    tag: 'horarios-recordatorio',
    renotify: true,
  });
}

// Push — recordatorio de fin de jornada (viene del Worker de Cloudflare)
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Horarios', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(mostrarRecordatorio(data));
});

// Mensajes de la página:
// - 'sw-descargar': la página vio este worker ya instalado (en espera) y pide la descarga de la versión; si quedó a medias
//   o falló en una apertura anterior, se reintenta acá.
// - 'notificacion-prueba': pedida desde Ajustes → Notificaciones. Se muestra con una demora (máx. 60 s) para poder cerrar
//   la app antes y comprobar qué abre el click.
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.tipo === 'sw-descargar') {
    event.waitUntil(descargarVersion().catch(() => { }));
    return;
  }
  if (event.data.tipo !== 'notificacion-prueba') return;
  const demora = Math.min(Math.max(Number(event.data.demoraMs) || 0, 0), 60000);
  event.waitUntil(
    new Promise(resolve => setTimeout(resolve, demora))
      .then(() => mostrarRecordatorio({ title: 'Notificación de prueba', body: 'Tocá para comprobar que se abre la app' }))
  );
});

// Click en la notificación — enfoca la PWA si ya está abierta, si no la abre
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 1. Prioridad: ventana que tenga la URL de PWA (modo standalone)
      const pwaClient = clientList.find(c => c.url && c.url.includes('mode=pwa'));
      if (pwaClient && 'focus' in pwaClient) {
        return pwaClient.focus();
      }

      // 2. Si no hay con mode=pwa, enfocar cualquier ventana que pertenezca al scope de la app
      for (const client of clientList) {
        if (client.url && client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }

      // 3. Si no hay ninguna ventana abierta, abrir la PWA directamente con URL absoluta
      const pwaUrl = new URL('./index.html?mode=pwa', self.registration.scope).href;
      if (self.clients.openWindow) {
        return self.clients.openWindow(pwaUrl);
      }
    })
  );
});
