const CACHE_NAME = 'kaleidoskop-v44';
const PRECACHE_URLS = [
  'circle.html',
  'install/index.html',
  '4ElementalCorners.png',
  'Obrazce/zrcadlo.png',
  'Obrazce/jeskyne.png',
  'Obrazce/spirala.png',
  'Obrazce/kyvadlo.png',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // {cache: 'reload'} skips the browser's own HTTP cache. Without it a
      // freshly installed worker can precache a copy that is already stale --
      // GitHub Pages serves these with a max-age of several minutes -- so the
      // app kept coming up on old code no matter how long you waited after a
      // push, and a new build was undetectable from inside it.
      .then(cache => cache.addAll(
        PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});


self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Page loads go to the network first. The stale-while-revalidate path below
  // answers from cache and only refreshes it for the *next* load, so an
  // installed PWA ran a deploy behind the site and kept doing so -- which is
  // why the app could behave differently from the same page in a browser tab.
  // Falls back to the cached copy when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // By URL with no-store rather than passing the Request through: a
      // navigation Request carries the HTTP cache mode the browser chose, and
      // that is exactly what has to be bypassed here.
      fetch(event.request.url, { cache: 'no-store' })
        .then(response => {

          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached || caches.match('circle.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
