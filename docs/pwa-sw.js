const CACHE_NAME = 'chess-assistant-pwa-v1';
const APP_FILES = [
  './sidepanel.html',
  './manifest.webmanifest',
  './styles.css',
  './sidepanel.css',
  './sidepanel.js',
  './vendor/chessjs/chess.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('chess-assistant-pwa-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const isEngineAsset = /stockfish-19-single\.(?:js|wasm)$/.test(new URL(request.url).pathname);
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (isEngineAsset || APP_FILES.some((file) => new URL(file, self.registration.scope).href === request.url))) {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  }));
});
