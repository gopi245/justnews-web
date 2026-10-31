// Gundusoodhi media cache: photos, audio and YouTube thumbnails are kept on the phone,
// so re-opening the app or an article never downloads them again.
const CACHE = 'gs-media-v1';
const SHELL = 'gs-shell-v1'; // the app itself, so it opens without internet
const MAX_ITEMS = 600; // oldest entries are removed beyond this

const isMedia = (url) =>
  url.pathname.startsWith('/media/') ||
  url.pathname.startsWith('/audio/') ||
  url.hostname === 'i.ytimg.com' ||
  /\.(webp|jpe?g|png|mp3)$/i.test(url.pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ITEMS; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // let audio seeking go to the network
  const url = new URL(req.url);

  // App page: network first (always fresh), saved copy when offline.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match('/')).then((r) => r || Response.error())),
    );
    return;
  }
  // Built JS/CSS/fonts have content hashes in their names, so a saved copy is always valid.
  if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname === '/earth-4096.jpg')) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (!isMedia(url)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: url.pathname.startsWith('/audio/') });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        cache.put(req, res.clone()).then(() => trim(cache));
      }
      return res;
    }),
  );
});
