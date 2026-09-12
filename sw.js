const CACHE_NAME = 'horarios-v260911.1108-cache';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icons/icon-192.png',
  './icons/badge-96.png',
  './app.js',
  './styles.css',
  './fondos.js',
  './feriados.js',
  './flash.js',
];

// Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(err => {
          console.error('CRÍTICO: Falló la carga de archivos en el install:', err);
          throw err;
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activación — limpieza de cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — cache-first, fallback a network
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
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
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html', { ignoreSearch: true }) || caches.match('./', { ignoreSearch: true });
            }
          });
      })
  );
});

// Push — recordatorio de fin de jornada (viene del Worker de Cloudflare)
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Horarios', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Horarios', {
      body: data.body || 'Se cumplió tu horario de hoy',
      icon: './icons/icon-192.png',
      badge: './icons/badge-96.png',
      tag: 'horarios-recordatorio',
      renotify: true,
    })
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
