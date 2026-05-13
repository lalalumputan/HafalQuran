/**
 * pwa-patch.js
 * Jalankan setelah `npx expo export --platform web`
 * Menambahkan manifest.json, service worker, dan icon agar
 * browser menampilkan banner "Install App / Add to Home Screen"
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const DIST = path.join(__dirname, '..', 'dist');

async function main() {
  // ── 1. Resize icon ───────────────────────────────────────────────────────
  const src512 = path.join(__dirname, '..', 'assets', 'icon-512.png');

  await sharp(src512).resize(512, 512).toFile(path.join(DIST, 'icon-512.png'));
  await sharp(src512).resize(192, 192).toFile(path.join(DIST, 'icon-192.png'));
  console.log('✅ Icons copied');

  // ── 2. manifest.json ─────────────────────────────────────────────────────
  const manifest = {
    name:             'HafalQuran',
    short_name:       'HafalQuran',
    description:      'Latih hafalan Al-Quran dengan tajwid, murottal, dan evaluasi otomatis.',
    start_url:        '/',
    scope:            '/',
    display:          'standalone',
    background_color: '#1B4332',
    theme_color:      '#1B4332',
    orientation:      'portrait',
    lang:             'id',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  fs.writeFileSync(
    path.join(DIST, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('✅ manifest.json created');

  // ── 3. Service Worker (minimal — agar Chrome akui ini PWA) ───────────────
  const sw = `
// HafalQuran Service Worker
const CACHE = 'hq-${Date.now()}';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Network-first: selalu ambil dari network, fallback ke cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
`.trim();

  fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
  console.log('✅ sw.js created');

  // ── 4. Patch index.html ──────────────────────────────────────────────────
  const htmlPath = path.join(DIST, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const injection = `
  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#1B4332">
  <!-- iOS Safari -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="HafalQuran">
  <link rel="apple-touch-icon" href="/icon-512.png">
  <!-- Register SW -->
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js');
      });
    }
  </script>`;

  html = html.replace('</head>', injection + '\n</head>');
  fs.writeFileSync(htmlPath, html);
  console.log('✅ index.html patched');

  console.log('\n🎉 PWA patch selesai! Siap di-deploy.');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
