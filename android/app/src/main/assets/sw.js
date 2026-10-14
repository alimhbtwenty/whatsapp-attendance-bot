const CACHE_NAME = 'geoteam-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // cache: 'reload' از کش HTTP مرورگر رد می‌شود؛ وگرنه نسخه جدید ممکن بود index.html قدیمی را ذخیره کند
      return cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' }).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
