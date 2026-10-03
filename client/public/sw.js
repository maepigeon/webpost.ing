// Minimal service worker: it exists so the site is installable and opens
// offline to the app shell. It must never touch user data.
const CACHE = 'webpost-v1';

self.addEventListener('install', () => self.skipWaiting()); // new deploys take over promptly

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Writes, other origins, the API and uploads go straight to the network:
  // a cached post, avatar or login response would be stale or wrong.
  if (req.method !== 'GET' || url.origin !== self.location.origin
      || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Pages: network first so a deploy is seen at once; the cached shell is
  // only a fallback for being offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); }
        return res;
      }).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Build assets have content hashes in their names, so a cached copy never goes stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
