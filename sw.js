// Service worker: hanya menyimpan kerangka aplikasi agar bisa dibuka cepat.
// Data transaksi TIDAK PERNAH di-cache — angka stok dan uang harus selalu dari server.
const V = 'kp-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/config.js', './assets/js/core.js', './assets/js/app.js',
  './assets/js/pages/dashboard.js', './assets/js/pages/sales.js', './assets/js/pages/production.js',
  './assets/js/pages/logistics.js', './assets/js/pages/inventory.js', './assets/js/pages/purchasing.js',
  './assets/js/pages/finance.js', './assets/js/pages/reports.js', './assets/js/pages/master.js',
  './assets/js/pages/hr.js', './assets/js/pages/announce.js', './assets/js/pages/tour.js',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // jangan pernah cache panggilan ke Supabase (data & autentikasi)
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.origin !== location.origin && !url.hostname.includes('jsdelivr') && !url.hostname.includes('fonts.')) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || net;
    })
  );
});
