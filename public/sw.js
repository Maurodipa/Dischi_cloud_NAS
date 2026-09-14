self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Pass-through fetch handler (required for PWA installability on Chrome)
  e.respondWith(fetch(e.request).catch(() => new Response("Offline")));
});
