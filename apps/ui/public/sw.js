// Network first so a new deploy shows up at once; the cache covers offline.
const CACHE = 'devpul-v1';
const SHELL = ['./', './theme.js', './favicon.svg', './manifest.webmanifest'];

// The page loaded its hashed JS and CSS before this worker took over, so cache them here.
async function install() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const page = await cache.match('./');
  const assets = page ? (await page.text()).match(/\.\/assets\/[^"]+/g) : null;
  if (assets) await cache.addAll([...new Set(assets)]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(install().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Update checks need the registry as deployed, never a cached copy.
  if (url.pathname.endsWith('/plugins/registry.json')) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      // Module scripts send Origin, which misses entries cached with Vary: Origin.
      .catch(() => caches.match(request, { ignoreVary: true }).then((hit) => hit ?? caches.match('./'))),
  );
});
