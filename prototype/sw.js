const CACHE_NAME = 'ai-tutor-prototype-v1';
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './ask.html',
  './mistakes.html',
  './review.html',
  './report.html',
  './me.html',
  './legal.html',
  './admin.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/app-icon.svg',
  './css/styles.css',
  './js/pwa.js',
  './js/app.js',
  './js/admin-console.js',
  './js/api.js',
  './js/ai-script.js',
  './js/mock-data.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(request) {
  return request.url.includes('/auth/')
    || request.url.includes('/billing/')
    || request.url.includes('/questions')
    || request.url.includes('/review-tasks')
    || request.url.includes('/reports')
    || request.url.includes('/uploads')
    || request.url.includes('/ocr')
    || request.url.includes('/me')
    || request.url.includes('/account')
    || request.url.includes('/admin/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || isApiRequest(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }))
  );
});
