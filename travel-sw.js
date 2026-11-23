const SHELL_CACHE = 'traveltraces-shell-v1';
const PATHS = [
  './', 'index.html', 'styles.css', 'catalog.js', 'account.js', 'app.js', 'travel-map/notes.js', 'travel-map/map.js',
  'style/', 'style/index.html', 'style/styles.css', 'style/enhancements.js',
  'travel-map/vendor/maplibre-gl.css', 'travel-map/vendor/maplibre-gl.mjs', 'travel-map/vendor/maplibre-gl-worker.mjs',
];
const shell = new Set(PATHS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll([...shell])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.hash = '';
  if (event.request.method !== 'GET' || !shell.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(url.href, response.clone());
        return response;
      }
      return await cache.match(url.href) || response;
    } catch {
      return await cache.match(url.href) || Response.error();
    }
  })());
});
