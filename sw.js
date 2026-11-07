// Bump CACHE_VERSION whenever an app file changes so phones pick up the new version.
const CACHE_VERSION = 'v11';
const CACHE = `kata-${CACHE_VERSION}`;
// Map tiles live in their own cache, filled as the map is browsed. It is kept across
// versions: there are over a thousand tiles, too many to download again at each update.
const TILES_CACHE = 'kata-tiles';

// Relative paths: the app is served from /Kata/ on GitHub Pages, not from the site root.
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'db.js',
  'app.js',
  'manifest.json',
  'tiles_config.json',
  'libs/leaflet.min.js',
  'libs/leaflet.min.css',
  'libs/images/layers.png',
  'libs/images/layers-2x.png',
  'libs/images/marker-icon.png',
  'libs/images/marker-icon-2x.png',
  'libs/images/marker-shadow.png',
  'assets/icons/icon-192.svg',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache: GitHub Pages lets it keep files for
  // 10 minutes, which could otherwise put an old file in the new version's cache.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  // No skipWaiting here: a new version waits until the user taps "Mettre à jour" on the
  // banner, so it never swaps files under a page that is in use (a place being edited).
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TILES_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
});

// Tiles: cache first, and keep every tile fetched. The user can also download the whole map
// into this cache from Maintenance (see downloadMapTiles in app.js), so every zoom level
// works offline.
async function tileResponse(request) {
  const cache = await caches.open(TILES_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Offline and this tile was never downloaded: show an enlarged piece of a less zoomed
    // tile instead of a blank square.
    const fallback = await parentTileFallback(cache, request.url).catch(() => null);
    if (fallback) return fallback;
    throw err;
  }
}

const TILE_PATH = /tiles\/(\d+)\/(\d+)\/(\d+)\.png$/;
let tileConfig = null;

async function getTileConfig() {
  if (tileConfig) return tileConfig;
  const res = await caches.match('tiles_config.json', { ignoreSearch: true });
  tileConfig = res ? await res.json() : { imageHeight: 6910, tileSize: 256, maxZoom: 5 };
  return tileConfig;
}

// Number of tile rows at zoom z (same formula as ImageTileLayer in app.js).
function tileRows(cfg, z) {
  const scale = Math.pow(2, cfg.maxZoom - z);
  return Math.ceil(Math.ceil(cfg.imageHeight / scale) / cfg.tileSize);
}

async function parentTileFallback(cache, url) {
  const match = TILE_PATH.exec(new URL(url).pathname);
  if (!match || typeof OffscreenCanvas === 'undefined') return null;
  const cfg = await getTileConfig();
  const size = cfg.tileSize;
  const [z, x, fileY] = match.slice(1).map(Number);
  // File names count rows from the bottom; Leaflet counts them from the top.
  const y = tileRows(cfg, z) - 1 - fileY;
  for (let k = 1; k <= z; k++) {
    const pz = z - k, px = x >> k, py = y >> k;
    const parentUrl = new URL(`tiles/${pz}/${px}/${tileRows(cfg, pz) - 1 - py}.png`, self.registration.scope).href;
    const parent = await cache.match(parentUrl);
    if (!parent) continue;
    const factor = 1 << k;
    const part = size / factor;
    const bitmap = await createImageBitmap(await parent.blob());
    const canvas = new OffscreenCanvas(size, size);
    canvas.getContext('2d').drawImage(bitmap, (x % factor) * part, (y % factor) * part, part, part, 0, 0, size, size);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    // Not cached: the real tile replaces it as soon as it can be downloaded.
    return new Response(blob, { headers: { 'Content-Type': 'image/png' } });
  }
  return null;
}

// App files: cache first, so the app opens with no network at all.
async function appResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (err) {
    // Offline on a page URL that is not cached as such: serve the app anyway.
    if (request.mode === 'navigate') {
      const index = await caches.match('index.html');
      if (index) return index;
    }
    throw err;
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isTile = url.pathname.startsWith(new URL('tiles/', self.registration.scope).pathname);
  event.respondWith(isTile ? tileResponse(event.request) : appResponse(event.request));
});
