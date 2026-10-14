/* CM Notez service worker
 * - App shell: precached, stale-while-revalidate
 * - data/topics.csv: network-first, cache fallback (offline)
 * - Google Fonts: cache-first (runtime)
 * Bump VERSION when shell files change so old caches are cleared.
 */
const VERSION = 'v2.1.0';
const SHELL = `cmn-shell-${VERSION}`;
const DATA = 'cmn-data';
const FONTS = 'cmn-fonts';

const SHELL_FILES = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/csv.js',
  './js/data.js',
  './js/ui.js',
  './js/theme.js',
  './js/tg.js',
  './assets/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/favicon-32.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(SHELL);
      await c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));
      try {
        const d = await caches.open(DATA);
        const res = await fetch('./data/topics.csv', { cache: 'no-store' });
        if (res.ok) await d.put('./data/topics.csv', res);
      } catch { /* offline install — ignore */ }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('cmn-shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts (CSS + font files): cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // CSV database: network-first with cache fallback (query string ignored for the cache key)
  if (url.pathname.endsWith('/data/topics.csv')) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Navigations: serve cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  const key = './data/topics.csv';
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}
