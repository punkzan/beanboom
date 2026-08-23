// Bean Boom Service Worker - PWA offline support
const CACHE_VERSION = 'bb-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/og-cover.png',
  '/styles/main.css',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: strategy by resource type
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Skip cross-origin (analytics, PayPal, APIs)
  if (url.origin !== self.location.origin) return;

  // Skip API and admin routes
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/og') || url.pathname.startsWith('/share')) return;

  // HTML pages: network-first (always fresh content)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Hashed build assets (/assets/*.js, *.css): stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Other static assets (styles, images, audio, icons): cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
