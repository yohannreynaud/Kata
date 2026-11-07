// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════
const CATEGORIES = {
  undefined:  { label: "Undefined",     icon: "❓", color: "#6B7280" },
  salle:     { label: "Salle",        icon: "🏠", color: "#457B9D" },
  oeuvre:    { label: "Œuvre d'art",  icon: "🗿", color: "#E63946" },
  repere:    { label: "Repère",       icon: "👁️", color: "#2A9D8F" },
  avisiter:  { label: "À visiter",    icon: "🔖", color: "#F4A261" },
};
function getCat(key) {
  return CATEGORIES[key] || CATEGORIES[Object.keys(CATEGORIES)[0]];
}

// Configuration de la carte personnalisée
const MAP_CONFIG = {
  imageWidth:  8166,
  imageHeight: 6910,
  tileSize:    256,
  minZoom:     1,
  maxZoom:     5,
};

// Conversion Y-inversée pour CRS.Simple (l'image commence en haut, Leaflet en bas)
function imgToLatLng(px, py) {
  const cfg = MAP_CONFIG;
  return L.latLng(cfg.imageHeight - py, px);
}

function latLngToImg(latlng) {
  const cfg = MAP_CONFIG;
  return {
    x: Math.round(latlng.lng),
    y: Math.round(cfg.imageHeight - latlng.lat),
  };
}

// Formate l'affichage propre des coordonnées en pixels
function getCoordsDisplay(location) {
  if (!location) return '';
  const { x, y } = latLngToImg(location);
  return `📍 X: ${x} px, Y: ${y} px`;
}

// Couche de tuiles personnalisée
const ImageTileLayer = L.TileLayer.extend({
  getTileUrl: function(coords) {
    const cfg     = MAP_CONFIG;
    const scale   = Math.pow(2, cfg.maxZoom - coords.z);
    const scaledH = Math.ceil(cfg.imageHeight / scale);
    const nTilesY = Math.ceil(scaledH / cfg.tileSize);

    if (coords.y < 0 || coords.y >= nTilesY) {
      return '';
    }

    // Y inversé par rapport au générateur de tuiles
    const y = (nTilesY - 1) - coords.y;
    return `tiles/${coords.z}/${coords.x}/${y}.png`;
  }
});



/* ------------------------------
    SERVICE WORKER ET MISES À JOUR
    Une nouvelle version de sw.js s'installe en arrière-plan et attend. La bannière
    permet de l'activer, puis la page se recharge. Rien ne change sous les pieds de
    l'utilisateur tant qu'il n'a pas cliqué (même approche que l'app Flash-cards).
------------------------------ */

let reloadOnUpdate = false;

function showUpdateBanner(reg) {
    document.getElementById('update-banner').hidden = false;
    document.getElementById('update-btn').onclick = () => {
        if (!reg.waiting) return window.location.reload();
        reloadOnUpdate = true;
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    };
}

async function registerServiceWorker() {
    const reg = await navigator.serviceWorker.register('sw.js');
    // Une version installée lors d'une visite précédente et toujours en attente.
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
    reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
            // Sans contrôleur, c'est la toute première installation, pas une mise à jour.
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
        });
    });
    // On ne recharge que si l'utilisateur l'a demandé : la première installation et le
    // hard reset changent aussi de contrôleur.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadOnUpdate) window.location.reload();
    });
    // Une PWA installée peut rester ouverte des jours : on cherche une nouvelle version
    // quand elle revient au premier plan, et toutes les heures tant qu'elle reste ouverte.
    const checkForUpdate = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
    });
    setInterval(checkForUpdate, 60 * 60 * 1000);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'SW_VERSION') {
            document.getElementById('sw-version').textContent = `Service Worker ${event.data.version}`;
        }
    });
    registerServiceWorker().catch(err => console.error('[SW] Enregistrement impossible', err));
}

/* ------------------------------
    CARTE HORS LIGNE
    Le service worker ne garde une tuile que lorsqu'elle est affichée : hors ligne, les
    niveaux de zoom jamais vus restaient blancs. On télécharge donc toute la carte
    (~1 200 tuiles, ~70 Mo) dans le cache des tuiles, seulement quand l'utilisateur le
    demande depuis Maintenance, sans retélécharger ce qui y est déjà. La carte affiche
    toujours les tuiles une par une : seul le stockage est concerné, pas la mémoire.
------------------------------ */

const TILES_CACHE = 'kata-tiles'; // même nom que dans sw.js
let tilesDownload = null;

// Toutes les tuiles que la carte peut demander (même calcul que ImageTileLayer).
function allTileUrls() {
    const { imageWidth, imageHeight, tileSize, minZoom, maxZoom } = MAP_CONFIG;
    const urls = [];
    for (let z = minZoom; z <= maxZoom; z++) {
        const scale = Math.pow(2, maxZoom - z);
        const cols = Math.ceil(Math.ceil(imageWidth / scale) / tileSize);
        const rows = Math.ceil(Math.ceil(imageHeight / scale) / tileSize);
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) urls.push(new URL(`tiles/${z}/${x}/${y}.png`, document.baseURI).href);
        }
    }
    return urls;
}

function setTilesStatus(text, busy) {
    const desc = document.getElementById('tiles-status');
    if (desc) desc.textContent = text;
    for (const id of ['tiles-download-btn', 'tiles-delete-btn']) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = busy;
    }
}

async function missingTileUrls(cache) {
    const urls = allTileUrls();
    const have = new Set((await cache.keys()).map(req => req.url));
    return { total: urls.length, missing: urls.filter(url => !have.has(url)) };
}

async function refreshTilesStatus() {
    if (tilesDownload || !('caches' in window)) return;
    const { total, missing } = await missingTileUrls(await caches.open(TILES_CACHE));
    setTilesStatus(missing.length
        ? `${total - missing.length} / ${total} tuiles disponibles hors ligne.`
        : `Toute la carte est disponible hors ligne (${total} tuiles).`, false);
}

async function downloadMapTiles({ manual = false } = {}) {
    if (!('caches' in window)) return;
    if (tilesDownload) return tilesDownload;
    tilesDownload = (async () => {
        // Demande au navigateur de ne pas effacer ces données quand l'espace manque.
        navigator.storage?.persist?.().catch(() => {});
        const cache = await caches.open(TILES_CACHE);
        const { total, missing } = await missingTileUrls(cache);
        if (!missing.length) return true;
        let done = total - missing.length;
        let failed = 0;
        let next = 0;
        setTilesStatus(`Téléchargement de la carte… ${done} / ${total}`, true);
        // 4 téléchargements à la fois : assez rapide, sans saturer le réseau du téléphone.
        const worker = async () => {
            while (next < missing.length && failed < 20) {
                const url = missing[next++];
                try {
                    const res = await fetch(url, { cache: 'no-cache' });
                    if (res.ok) await cache.put(url, res);
                    else failed++;
                } catch {
                    failed++;
                }
                done++;
                setTilesStatus(`Téléchargement de la carte… ${done} / ${total}`, true);
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        return failed === 0;
    })();
    try {
        const ok = await tilesDownload;
        if (manual) showToast(ok ? '✅ Carte disponible hors ligne' : '📶 Téléchargement incomplet, réessaie avec du réseau');
    } catch (err) {
        console.warn('[TILES] Téléchargement impossible', err);
        if (manual) showToast('⚠️ Téléchargement impossible');
    } finally {
        tilesDownload = null;
        refreshTilesStatus().catch(() => {});
    }
}

// Vider le cache hors ligne ne laisserait rien pour recharger l'app : les deux outils de
// reset vérifient d'abord que le serveur répond (navigator.onLine n'est pas fiable sur iOS).
async function serverReachable() {
    try {
        const res = await fetch(`sw.js?check=${Date.now()}`, { cache: 'no-store' });
        return res.ok;
    } catch {
        return false;
    }
}

async function ensureOnline() {
    if (await serverReachable()) return true;
    showToast('📶 Connecte-toi à Internet d\'abord');
    return false;
}

async function clearCache() {
    if (!confirm('Vider le cache de l\'application ?')) return;
    if (!(await ensureOnline())) return;
    await deleteAppCaches();
    showToast('✅ Cache vidé');
}

// Vide les caches de l'app mais garde la carte téléchargée (~70 Mo, long à refaire) :
// les tuiles ne changent pas avec les mises à jour de l'app.
async function deleteAppCaches() {
    for (const key of await caches.keys()) {
        if (key !== TILES_CACHE) await caches.delete(key);
    }
}

async function deleteMapTiles() {
    if (!confirm('Dé-télécharger la carte ? Il faudra la retélécharger pour zoomer hors ligne.')) return;
    if (tilesDownload) return showToast('⏳ Téléchargement en cours, attends la fin');
    await caches.delete(TILES_CACHE);
    showToast('🗑️ Carte dé-téléchargée');
    refreshTilesStatus().catch(() => {});
}

// Reset complet : mise à jour, activation d'un SW en attente, vidage des caches de l'app,
// désenregistrement, rechargement. IndexedDB et la carte téléchargée ne sont pas touchées.
async function hardResetPWA() {
    if (!confirm('Réinitialiser complètement l\'application ? Tes lieux et la carte téléchargée sont conservés.')) return;
    if (!(await ensureOnline())) return;
    console.log('[RESET] Réinitialisation complète…');
    const reg = await navigator.serviceWorker?.getRegistration();

    try {
        // 1) Forcer une mise à jour (on continue même si elle échoue)
        try { await reg?.update(); } catch (err) { console.warn('[RESET] update() impossible', err); }

        // 2) Forcer skipWaiting si un SW est en attente, sans bloquer plus de 3 s
        if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            await new Promise(resolve => {
                navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                setTimeout(resolve, 3000);
            });
        }

        // 3) Vider les caches de l'app (la carte téléchargée est conservée)
        await deleteAppCaches();

        // 4) Désenregistrer le SW
        await reg?.unregister();
    } catch (err) {
        console.error('[RESET] Erreur', err);
    }

    // 5) Rechargement final
    window.location.reload();
}



// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let activeListCategories = new Set(Object.keys(CATEGORIES));
let map;
const layers = {};
const markers = {};
let panelMode = null;
let editPoiId = null;
let pendingLatLng = null;
let formPhotos = [];
let formTags = [];
let activeCategories = new Set(Object.keys(CATEGORIES));
let allPois = [];
let filterFavoritesOnlyMap = false;
let filterFavoritesOnlyList = false;

// ═══════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════
function initMap() {
    const { imageWidth, imageHeight, tileSize, minZoom, maxZoom } = MAP_CONFIG;
    const bounds = [[0, 0], [imageHeight, imageWidth]];

    const scaleFactor = 1 / Math.pow(2, maxZoom);
    const customCRS = L.extend({}, L.CRS.Simple, {
        transformation: new L.Transformation(scaleFactor, 0, -scaleFactor, imageHeight * scaleFactor)
    });

    map = L.map('map', {
        crs:             customCRS,
        minZoom:         minZoom,
        maxZoom:         maxZoom,
        zoomControl:     false,
        doubleClickZoom: false,
        tap:             false,              // ← essentiel sur iOS
        touchZoom:       true,
        dragging:        true,
        preferCanvas:    true,
        maxBounds:       bounds,
        maxBoundsViscosity: 1.0,
        // Zoom continu : le pincement et la molette s'arrêtent où l'on veut, sans
        // revenir au niveau entier le plus proche. Leaflet affiche alors les tuiles
        // du niveau le plus proche, légèrement agrandies ou réduites.
        zoomSnap:            0,
        zoomDelta:           0.5,   // boutons +/-
        wheelPxPerZoomLevel: 120,   // molette un peu plus douce
    });

    new ImageTileLayer('tiles/{z}/{x}/{y}.png', {
        tileSize,
        minZoom,
        // Pendant un pincement au-delà du zoom max, Leaflet dépasse temporairement
        // maxZoom avant de rebondir. Si la couche s'arrêtait à maxZoom, elle effacerait
        // ses tuiles pendant ce dépassement (carte blanche). On l'autorise donc à
        // agrandir les tuiles du niveau le plus précis (maxNativeZoom) au-delà ;
        // la carte, elle, reste bornée à maxZoom et revient toujours au zoom max.
        maxNativeZoom: maxZoom,
        maxZoom:       maxZoom + 6,
        bounds,
        noWrap: true,
        errorTileUrl: '',
        keepBuffer: 0,
    }).addTo(map);

    for (const key of Object.keys(CATEGORIES)) {
        layers[key] = L.layerGroup().addTo(map);
    }

    const center = imgToLatLng(imageWidth / 2, imageHeight / 2);
    map.setView(center, Math.floor((minZoom + maxZoom) / 2));

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    setupLongPressToAdd();
}

// ═══════════════════════════════════════════════
// APPUI PROLONGÉ → NOUVEAU LIEU
// ═══════════════════════════════════════════════
// Un appui prolongé (doigt ou souris) sans bouger ouvre le formulaire de création.
// Dès que le doigt bouge, qu'un second doigt arrive (pincement) ou qu'on relâche,
// l'appui est annulé : le déplacement et le zoom de la carte ne sont pas gênés.
const LONG_PRESS_DELAY = 550;        // ms
const LONG_PRESS_MOVE_TOLERANCE = 10; // px

function setupLongPressToAdd() {
    const container = map.getContainer();
    let press = null;          // { id, x, y, timer }
    const activePointers = new Set();

    // Bloque le menu contextuel natif (iOS/Android le déclenchent sur un appui prolongé).
    container.addEventListener('contextmenu', e => e.preventDefault());

    function cancelPress() {
        if (!press) return;
        clearTimeout(press.timer);
        press = null;
    }

    // Après un appui prolongé, le relâchement peut produire un « click » qui refermerait
    // le formulaire ouvert sous le doigt. On n'avale QUE ce click-là : il arrive juste
    // après le relâchement. iOS n'en envoie pas après un appui long ; on ne doit donc
    // jamais avaler le tap suivant de l'utilisateur (sinon son premier tap dans le
    // formulaire serait sans effet). Tout nouvel appui annule la protection.
    let firedPointerId = null;
    let swallowUntil = 0;
    document.addEventListener('click', ev => {
        if (Date.now() < swallowUntil) {
            swallowUntil = 0;
            ev.preventDefault();
            ev.stopPropagation();
        }
    }, { capture: true });
    document.addEventListener('pointerdown', () => { swallowUntil = 0; }, { capture: true });

    container.addEventListener('pointerdown', e => {
        activePointers.add(e.pointerId);
        if (activePointers.size > 1) { cancelPress(); return; }   // pincement
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // Pas sur un pin, un bouton de zoom ou une bulle ouverte.
        if (e.target.closest('.leaflet-marker-icon, .leaflet-control, .leaflet-popup')) return;

        cancelPress();
        const rect = container.getBoundingClientRect();

        const x = e.clientX, y = e.clientY;
        press = {
            id: e.pointerId, x, y,
            timer: setTimeout(() => {
                const latlng = map.containerPointToLatLng(L.point(x - rect.left, y - rect.top));
                const id = press.id;
                cancelPress();
                if (navigator.vibrate) navigator.vibrate(30);
                firedPointerId = id;
                // Le doigt est encore posé là où le formulaire apparaît : tant qu'il n'est
                // pas relâché, le formulaire ignore les appuis, sinon le relâchement
                // sélectionnerait le champ de saisie situé sous le doigt.
                document.body.classList.add('long-press-holding');
                pendingLatLng = { lat: latlng.lat, lng: latlng.lng };
                openAddForm();
            }, LONG_PRESS_DELAY),
        };
    });

    container.addEventListener('pointermove', e => {
        if (!press || e.pointerId !== press.id) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE) cancelPress();
    });

    const release = e => {
        activePointers.delete(e.pointerId);
        if (press && e.pointerId === press.id) cancelPress();
        if (e.pointerId === firedPointerId) {
            firedPointerId = null;
            if (e.type === 'pointerup') swallowUntil = Date.now() + 350;
            // On laisse passer le click/focus de compatibilité émis après le relâchement.
            setTimeout(() => document.body.classList.remove('long-press-holding'), 350);
        }
    };
    // Sur document : le relâchement peut avoir lieu hors de la carte.
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    map.on('movestart zoomstart', cancelPress);
    window.addEventListener('blur', cancelPress);
}

// ═══════════════════════════════════════════════
// MARKERS
// ═══════════════════════════════════════════════
function makeMarkerIcon(category, isFavorite = false) {
  const cat = getCat(category);
  const favBadge = isFavorite
    ? `<circle cx="26" cy="6" r="6" fill="#F5C400" stroke="white" stroke-width="1.5"/>
       <text x="26" y="10" text-anchor="middle" font-size="8" font-family="sans-serif">★</text>`
    : '';
  const svg = `<svg viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 28 12 28s12-19 12-28C28 5.37 22.63 0 16 0z"
      fill="${cat.color}" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <circle cx="16" cy="12" r="6" fill="white" fill-opacity=".9"/>
    <text x="16" y="16" text-anchor="middle" font-size="8" font-family="sans-serif">${cat.icon}</text>
    ${favBadge}
  </svg>`;
  return L.divIcon({
    html: `<div class="custom-marker">${svg}</div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -42],
    className: '',
  });
}
function addMarkerToMap(poi) {
  const cat = CATEGORIES[poi.content.category] ? poi.content.category : Object.keys(CATEGORIES)[0];
  const marker = L.marker([poi.location.lat, poi.location.lng], {
    icon: makeMarkerIcon(cat, !!poi.favorite),
  });
  marker.bindPopup(() => {
    const div = document.createElement('div');
    const catInfo = getCat(cat);

    div.innerHTML = `
    <div class="popup-header">
        <div>
        <div class="popup-title">${escHtml(poi.content.title || 'Sans titre')} <span class="popup-cat">(${catInfo.label})</span></div>
        </div>
        <button class="popup-fav-btn" id="popup-fav-${poi.id}"
        onclick="toggleFavoriteFromPopup('${poi.id}', this)">
        ${poi.favorite ? '🌟' : '⭐'}
        </button>
    </div>
    <div class="popup-photos" id="popup-photos-${poi.id}">
        <div class="popup-photo-loading">Chargement…</div>
    </div>
    <div class="popup-actions">
        <button class="popup-btn" onclick="openDetail('${poi.id}')">Voir détails</button>
    </div>
    `;

    // On passe le conteneur directement : à ce moment, le div n'est pas encore
    // inséré dans la page, donc un getElementById ne le trouverait pas.
    loadPopupPhotos(poi.id, div.querySelector('.popup-photos'));
    return div;
  }, { maxWidth: 260 });

  marker.addTo(layers[cat]);
  markers[poi.id] = marker;
}

async function loadPopupPhotos(poiId, container) {
  container = container || document.getElementById(`popup-photos-${poiId}`);
  if (!container) return;

  let photos;
  try {
    photos = await dbGetByIndex('photos', 'poiId', poiId);
  } catch (err) {
    console.error('Lecture des photos impossible', err);
    container.innerHTML = `<div class="popup-no-photo">Photos indisponibles</div>`;
    return;
  }

  if (!photos.length) {
    container.innerHTML = `<div class="popup-no-photo">Aucune photo</div>`;
    return;
  }

  // Limiter à 3 miniatures
  const thumbs = photos.slice(0, 3);

  const html = await Promise.all(thumbs.map(async p => {
    // Normalisation iOS (au cas où)
    if (!(p.blob instanceof Blob)) {
      p.blob = new Blob([p.blob], { type: p.mimeType });
    }

    const url = URL.createObjectURL(p.blob);

    return `<img class="popup-thumb" src="${url}" onclick="openLightbox('${url}', '${poiId}')" />`;

  }));

  container.innerHTML = `
    <div class="popup-thumb-row">
      ${html.join('')}
    </div>
  `;
}


function removeMarkerFromMap(poiId) {
  if (markers[poiId]) {
    map.removeLayer(markers[poiId]);
    delete markers[poiId];
  }
}

function openPanel(title) {
    document.getElementById('panel-title').textContent = title;
    document.getElementById('panel').classList.add('open');
    document.getElementById('panel-overlay').classList.add('open'); // ← ajouter
}

function closePanel() {
    document.getElementById('panel').classList.remove('open');
    document.getElementById('panel-overlay').classList.remove('open'); // ← ajouter
    document.getElementById('panel-fav-btn').style.display = 'none';
    panelMode = null;
    editPoiId = null;
    pendingLatLng = null;
    formPhotos = [];
    formTags = [];
}

// ═══════════════════════════════════════════════
// FILTER BAR
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// MENU FILTRE (carte + liste)
// ═══════════════════════════════════════════════
let currentFilterContext = 'map'; // 'map' | 'list'

function openFilterMenu(context) {
  currentFilterContext = context;
  const cats = context === 'map' ? activeCategories : activeListCategories;
  const favOnly = context === 'map' ? filterFavoritesOnlyMap : filterFavoritesOnlyList;
  const body = document.getElementById('filter-menu-body');

  const favRow = `
    <div class="filter-row${favOnly ? ' selected' : ''}"
         style="color:#F5C400"
         data-filter="favorites"
         onclick="toggleFavoritesFilter(this)">
      <span class="filter-row-icon">⭐</span>
      <span class="filter-row-label">Favoris</span>
      <span class="filter-row-check"><span class="filter-row-check-icon">✓</span></span>
    </div>
    <div class="filter-divider"></div>`;

  const catRows = Object.entries(CATEGORIES).map(([key, cat]) => {
    const sel = cats.has(key);
    return `
      <div class="filter-row${sel ? ' selected' : ''}"
           style="color:${cat.color}"
           data-category="${key}"
           onclick="toggleFilterRow(this, '${key}')">
        <span class="filter-row-icon">${cat.icon}</span>
        <span class="filter-row-label">${cat.label}</span>
        <span class="filter-row-check"><span class="filter-row-check-icon">✓</span></span>
      </div>`;
  }).join('');

  body.innerHTML = favRow + catRows;

  document.getElementById('filter-overlay').classList.add('open');
  document.getElementById('filter-menu').classList.add('open');
}

function toggleFilterRow(el, key) {
  const cats = currentFilterContext === 'map' ? activeCategories : activeListCategories;
  if (cats.has(key)) {
    cats.delete(key);
    el.classList.remove('selected');
  } else {
    cats.add(key);
    el.classList.add('selected');
  }
  applyFilters();
}

function toggleFavoritesFilter(el) {
  if (currentFilterContext === 'map') {
    filterFavoritesOnlyMap = !filterFavoritesOnlyMap;
    el.classList.toggle('selected', filterFavoritesOnlyMap);
  } else {
    filterFavoritesOnlyList = !filterFavoritesOnlyList;
    el.classList.toggle('selected', filterFavoritesOnlyList);
  }
  applyFilters();
}

function selectAllCategories() {
  const cats = currentFilterContext === 'map' ? activeCategories : activeListCategories;
  Object.keys(CATEGORIES).forEach(k => cats.add(k));
  // Re-render rows
  document.querySelectorAll('#filter-menu-body .filter-row').forEach(row => {
    row.classList.add('selected');
  });
  applyFilters();
}

function applyFilters() {
  if (currentFilterContext === 'map') {
    for (const key of Object.keys(CATEGORIES)) {
      if (activeCategories.has(key)) {
        if (!map.hasLayer(layers[key])) layers[key].addTo(map);
      } else {
        if (map.hasLayer(layers[key])) map.removeLayer(layers[key]);
      }
    }
    for (const poi of allPois) {
      const marker = markers[poi.id];
      if (!marker) continue;
      const cat = CATEGORIES[poi.content.category] ? poi.content.category : Object.keys(CATEGORIES)[0];
      if (filterFavoritesOnlyMap && !poi.favorite) {
        layers[cat].removeLayer(marker);
      } else if (activeCategories.has(cat)) {
        if (!layers[cat].hasLayer(marker)) layers[cat].addLayer(marker);
      }
    }
    updateFilterButton('map', activeCategories);
  } else {
    renderList();
    updateFilterButton('list', activeListCategories);
  }

  if (document.getElementById('filter-menu').classList.contains('open')) {
    refreshFilterMenuSelection();
  }
}

function refreshFilterMenuSelection() {
  const cats = currentFilterContext === 'map' ? activeCategories : activeListCategories;
  const favOnly = currentFilterContext === 'map' ? filterFavoritesOnlyMap : filterFavoritesOnlyList;

  document.querySelectorAll('#filter-menu-body .filter-row').forEach(row => {
    if (row.dataset.filter === 'favorites') {
      row.classList.toggle('selected', favOnly);
    } else {
      row.classList.toggle('selected', cats.has(row.dataset.category));
    }
  });
}

function updateFilterButton(context, cats) {
  const total = Object.keys(CATEGORIES).length;
  const active = cats.size;
  const favOnly = context === 'map' ? filterFavoritesOnlyMap : filterFavoritesOnlyList;
  const isFiltered = active < total || favOnly;

  const btn = document.getElementById(`btn-filter-${context}`);
  const badge = document.getElementById(`filter-count-${context}`);

  if (btn) btn.classList.toggle('has-filter', isFiltered);
  if (badge) {
    badge.textContent = active;
    badge.classList.toggle('visible', isFiltered);
  }
}

function closeFilterMenu() {
  document.getElementById('filter-overlay').classList.remove('open');
  document.getElementById('filter-menu').classList.remove('open');
}

// ═══════════════════════════════════════════════
// PANEL
// ═══════════════════════════════════════════════
// (openPanel / closePanel définis plus haut, section MARKERS)

// ═══════════════════════════════════════════════
// ADD / EDIT FORM
// ═══════════════════════════════════════════════
function openAddForm() {
  panelMode = 'add';
  editPoiId = null;
  formPhotos = [];
  formTags = [];
  document.getElementById('panel-fav-btn').style.display = 'none';
  renderForm(null);
  openPanel('Nouveau lieu');
}

async function openEditForm(poiId) {
  panelMode = 'edit';
  editPoiId = poiId;
  const poi = await dbGet('poi', poiId);
  const photos = await dbGetByIndex('photos', 'poiId', poiId);
  formPhotos = photos.map(p => ({ blob: p.blob, url: URL.createObjectURL(p.blob), existingId: p.photoId }));
  formTags = [...(poi.content.tags || [])];
  document.getElementById('panel-fav-btn').style.display = 'none';
  renderForm(poi);
  openPanel('Modifier le lieu');
}

function renderForm(poi) {
  const body = document.getElementById('panel-body');
  const footer = document.getElementById('panel-footer');
  const selectedCategory = poi?.content?.category || 'undefined';
  const catGridHtml = Object.entries(CATEGORIES).map(([key, cat]) =>
    `<button type="button" class="cat-btn${selectedCategory === key ? ' selected' : ''}"
      data-cat="${key}"
      style="${selectedCategory === key ? `border-color:${cat.color};background:${cat.color}20;` : ''}"
      onclick="selectCat(this, '${key}', '${cat.color}')">
      <span class="cat-icon">${cat.icon}</span>
      ${cat.label}
    </button>`
  ).join('');

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="f-title">Titre</label>
      <input id="f-title" class="form-input" value="${escHtml(poi?.content?.title || '')}" placeholder="Ex: Salle Z" />
    </div>
    <div class="form-group">
      <label class="form-label" for="f-desc">Description</label>
      <textarea id="f-desc" class="form-textarea" placeholder="Décrivez le lieu...">${escHtml(poi?.content?.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-category">Catégories</label>
      <input id="f-category" class="form-input" type="hidden" value="${selectedCategory}" />
      <div class="cat-grid">${catGridHtml}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="tag-input-wrap" onclick="document.getElementById('tag-input').focus()">
        <div id="tags-display">${formTags.map(t => `<span class="tag-chip">${escHtml(t)}<button onclick="removeTag('${escHtml(t)}');event.stopPropagation();" type="button">✕</button></span>`).join('')}</div>
        <input id="tag-input" class="form-input" type="text" placeholder="Ajouter un tag" onkeydown="handleTagKey(event)" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Photos</label>
      <label class="photo-drop" for="file-input">
        <span class="icon">📷</span>
        Glissez des images ici ou cliquez pour ajouter
      </label>
      <input id="file-input" type="file" accept="image/*" multiple onchange="handleFileInput(event)" />
      <div class="photo-grid" id="photo-preview"></div>
    </div>
    ${poi ? `<div class="detail-coords">${getCoordsDisplay(poi.location)}</div>` : ''}
  `;

  renderPhotoPreview();

  footer.innerHTML = `
    <button class="btn-secondary" onclick="closePanel()">Annuler</button>
    <button class="btn-primary" onclick="savePoi()">Enregistrer</button>
  `;
}

function selectCat(el, key, color) {
  document.querySelectorAll('.cat-btn').forEach(b => {
    b.classList.remove('selected');
    b.style.borderColor = '';
    b.style.background = '';
  });
  el.classList.add('selected');
  el.style.borderColor = color;
  el.style.background = color + '20';
  document.getElementById('f-category').value = key;
}

function handleTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().toLowerCase().replace(/[^a-z0-9À-ÿ\s\-]/g, '');
    if (val && !formTags.includes(val)) {
      formTags.push(val);
      renderTagsDisplay();
    }
    e.target.value = '';
  }
}

function removeTag(tag) {
  formTags = formTags.filter(t => t !== tag);
  renderTagsDisplay();
}

function renderTagsDisplay() {
  const el = document.getElementById('tags-display');
  if (!el) return;
  el.innerHTML = formTags.map(t =>
    `<span class="tag-chip">${escHtml(t)}<button onclick="removeTag('${escHtml(t)}')" type="button">✕</button></span>`
  ).join('');
}

async function handleFileInput(e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    formPhotos.push({ blob: file, url });
  }
  renderPhotoPreview();
  e.target.value = '';
}

function renderPhotoPreview() {
  const grid = document.getElementById('photo-preview');
  if (!grid) return;
  grid.innerHTML = formPhotos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.url}" alt="Photo ${i + 1}" />
      <button class="del-photo" onclick="removeFormPhoto(${i})" type="button">✕</button>
    </div>
  `).join('');
}

function removeFormPhoto(i) {
  URL.revokeObjectURL(formPhotos[i].url);
  formPhotos.splice(i, 1);
  renderPhotoPreview();
}

// ═══════════════════════════════════════════════
// SAVE POI
// ═══════════════════════════════════════════════
async function savePoi() {
  const title = document.getElementById('f-title').value.trim();
  const category = document.getElementById('f-category').value;
  const description = document.getElementById('f-desc').value.trim();

  if (!title) { showToast('⚠️ Titre requis'); return; }
  if (!category) { showToast('⚠️ Catégorie requise'); return; }

  const now = new Date().toISOString();
  const id = editPoiId || `poi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const photoRefs = [];

  for (const p of formPhotos) {
    if (p.existingId) photoRefs.push({ photoId: p.existingId });
  }

  if (editPoiId) {
    const existingPhotos = await dbGetByIndex('photos', 'poiId', editPoiId);
    const keptIds = new Set(formPhotos.filter(p => p.existingId).map(p => p.existingId));
    for (const ep of existingPhotos) {
      if (!keptIds.has(ep.photoId)) await dbDelete('photos', ep.photoId);
    }
  }

  for (const p of formPhotos) {
    if (!p.existingId) {
      const photoId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await dbPut('photos', {
        photoId,
        poiId: id,
        blob: p.blob,
        mimeType: p.blob.type,
        sizeBytes: p.blob.size,
        createdAt: now,
      });
      photoRefs.push({ photoId });
    }
  }

  const poi = {
    id,
    version: 1,
    createdAt: editPoiId ? (await dbGet('poi', editPoiId))?.createdAt || now : now,
    updatedAt: now,
    location: pendingLatLng || (editPoiId ? (await dbGet('poi', editPoiId))?.location : null),
    content: { title, description, tags: formTags, category },
    photos: photoRefs,
  };

  await dbPut('poi', poi);

  if (editPoiId) removeMarkerFromMap(editPoiId);
  addMarkerToMap(poi);

  allPois = await dbGetAll('poi');
  updatePoiCount();
  renderList();

  closePanel();
  showToast(editPoiId ? '✅ Lieu mis à jour' : '✅ Lieu ajouté !');
}

// ═══════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════
async function openDetail(poiId) {
  panelMode = 'detail';
  const poi = await dbGet('poi', poiId);
  const photos = await dbGetByIndex('photos', 'poiId', poiId);
  const cat = getCat(poi.content.category);

  const favBtn = document.getElementById('panel-fav-btn');
  favBtn.style.display = '';
  favBtn.dataset.poiId = poiId;
  favBtn.textContent = poi.favorite ? '🌟' : '⭐';
  favBtn.classList.toggle('active', !!poi.favorite);

  const body = document.getElementById('panel-body');
  const footer = document.getElementById('panel-footer');

  const tagsHtml = (poi.content.tags || []).map(t => `<span class="detail-tag">${escHtml(t)}</span>`).join('');
  const photosHtml = photos.map(p => {
    const url = URL.createObjectURL(p.blob);
    return `<div class="detail-photo"><img src="${url}" onclick="openLightbox('${url}', '${poiId}')" loading="lazy"></div>`;
  }).join('');

  body.innerHTML = `
    <div>
      <div class="detail-category-badge" style="background:${cat.color};">${cat.icon} ${cat.label}</div>
      <div class="detail-description">${escHtml(poi.content.description || 'Aucune description')}</div>
    </div>
    ${tagsHtml ? `<div class="detail-tags">${tagsHtml}</div>` : ''}
    ${photosHtml ? `<div class="detail-photo-grid">${photosHtml}</div>` : ''}
    <div class="detail-coords">${getCoordsDisplay(poi.location)}</div>
    <div style="font-size:.72rem;color:var(--text-muted)">Ajouté le ${new Date(poi.createdAt).toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'})}</div>
  `;

  footer.innerHTML = `
    <button class="btn-danger" onclick="deletePoi('${poi.id}')">Supprimer</button>
    <div style="flex:1"></div>
    <button class="btn-secondary" onclick="closePanel()">Fermer</button>
    <button class="btn-primary" onclick="openEditForm('${poi.id}')">Modifier</button>
  `;

  openPanel(poi.content.title || 'Détail');
}

async function deletePoi(poiId) {
  if (!confirm('Supprimer ce lieu définitivement ?')) return;
  const photos = await dbGetByIndex('photos', 'poiId', poiId);
  for (const p of photos) await dbDelete('photos', p.photoId);
  await dbDelete('poi', poiId);
  removeMarkerFromMap(poiId);
  allPois = await dbGetAll('poi');
  updatePoiCount();
  renderList();
  closePanel();
  showToast('🗑️ Lieu supprimé');
}

async function toggleFavorite() {
  const btn = document.getElementById('panel-fav-btn');
  const poiId = btn.dataset.poiId;
  const poi = await dbGet('poi', poiId);
  poi.favorite = !poi.favorite;
  poi.updatedAt = new Date().toISOString();
  await dbPut('poi', poi);
  btn.textContent = poi.favorite ? '🌟' : '⭐';
  btn.classList.toggle('active', poi.favorite);
  if (markers[poiId]) {
    markers[poiId].setIcon(makeMarkerIcon(poi.content.category, poi.favorite));
    if (filterFavoritesOnlyMap) {
      const cat = CATEGORIES[poi.content.category] ? poi.content.category : Object.keys(CATEGORIES)[0];
      if (!poi.favorite) {
        layers[cat].removeLayer(markers[poiId]);
      } else if (activeCategories.has(cat)) {
        layers[cat].addLayer(markers[poiId]);
      }
    }
  }
  allPois = await dbGetAll('poi');
  renderList();
  showToast(poi.favorite ? '🌟 Ajouté aux favoris' : '⭐ Retiré des favoris');
}

// ═══════════════════════════════════════════════
// LIGHTBOX
// ═══════════════════════════════════════════════
let lightboxPoiId = null; // variable d'état en haut du fichier (avec les autres)

function openLightbox(url, poiId = null) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
  lightboxPoiId = poiId;
  const actions = document.getElementById('lightbox-actions');
  if (actions) actions.style.display = poiId ? 'flex' : 'none';
}

function handleLightboxClick(event) {
  // Ferme seulement si on clique sur le fond, pas sur l'inner
  closeLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  lightboxPoiId = null;
}

function lightboxGoToDetail() {
  if (!lightboxPoiId) return;
  closeLightbox();
  switchView('list');
  setTimeout(() => openDetail(lightboxPoiId), 100);
}

function lightboxGoToMap() {
  if (!lightboxPoiId) return;
  closeLightbox();
  switchView('map');
  const poi = allPois.find(p => p.id === lightboxPoiId);
  if (!poi) return;
  setTimeout(() => {
    map.setView([poi.location.lat, poi.location.lng], MAP_CONFIG.maxZoom, { animate: true });
    if (markers[lightboxPoiId]) markers[lightboxPoiId].openPopup();
  }, 100);
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════
async function exportData() {
  showToast('⏳ Export en cours…');
  const pois = await dbGetAll('poi');
  const full = await Promise.all(pois.map(async poi => {
    const photos = await dbGetByIndex('photos', 'poiId', poi.id);
    const photosData = await Promise.all(photos.map(async p => {
      const data = await blobToBase64(p.blob);
      return { photoId: p.photoId, mimeType: p.mimeType, sizeBytes: p.sizeBytes, data };
    }));
    return { ...poi, photosData };
  }));

  const json = JSON.stringify({ version: 1, exportDate: new Date().toISOString(), pois: full }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `paris-map-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Export terminé !');
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function updatePoiCount() {
  document.getElementById('poi-count').textContent =
    `${allPois.length} lieu${allPois.length !== 1 ? 'x' : ''}`;
}

// ═══════════════════════════════════════════════
// NAVIGATION PAR ONGLETS
// ═══════════════════════════════════════════════
// Menu (bouton ☰ en haut à gauche), comme dans l'app Flash-cards.
const menu = {
  panel: document.getElementById('menu'),
  backdrop: document.getElementById('menu-backdrop'),
  open: document.getElementById('menu-btn'),
  close: document.getElementById('menu-close'),
  items: document.querySelectorAll('.menu-item'),
  title: document.getElementById('page-title'),
};

function toggleMenu(show) {
  menu.panel.hidden = menu.backdrop.hidden = !show;
  menu.open.setAttribute('aria-expanded', String(show));
}

menu.open.addEventListener('click', () => toggleMenu(menu.panel.hidden));
menu.close.addEventListener('click', () => toggleMenu(false));
menu.backdrop.addEventListener('click', () => toggleMenu(false));
menu.items.forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));

function switchView(viewName) {
  closeFilterMenu();
  toggleMenu(false);
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewName}`);
  view.classList.add('active');
  menu.title.textContent = view.dataset.title;
  menu.items.forEach(item => {
    if (item.dataset.view === viewName) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  // Le compteur et le bouton filtre de l'en-tête suivent la vue affichée.
  document.body.dataset.view = viewName;

  if (viewName === 'map') setTimeout(() => map.invalidateSize(), 10);
  if (viewName === 'list') renderList();
  if (viewName === 'photos') renderPhotosView();
  if (viewName === 'maintenance') {
    navigator.serviceWorker?.controller?.postMessage({ type: 'GET_VERSION' });
    refreshTilesStatus().catch(() => {});
  }
}
menu.items.forEach(item => { if (item.dataset.view === 'map') item.setAttribute('aria-current', 'page'); });

// Couleur du thème, mémorisée sur ce téléphone (orange par défaut), comme dans Flash-cards.
const swatches = document.querySelectorAll('.swatch');

function applyColor(color) {
  if (color === 'orange') delete document.documentElement.dataset.color;
  else document.documentElement.dataset.color = color;
  swatches.forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color === color)));
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  document.querySelector('meta[name="theme-color"]').setAttribute('content', accent);
}

swatches.forEach(s => s.addEventListener('click', () => {
  applyColor(s.dataset.color);
  try { localStorage.setItem('color', s.dataset.color); } catch {}
}));
applyColor(document.documentElement.dataset.color || 'orange');

// ═══════════════════════════════════════════════
// ONGLET LISTE
// ═══════════════════════════════════════════════
function renderListFilterBar() {
  const bar = document.getElementById('filter-bar-list');
  bar.innerHTML = '';
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeListCategories.has(key) ? ' active' : '');
    chip.innerHTML = `<span class="dot" style="background:${cat.color}"></span>${cat.icon} ${cat.label}`;
    chip.onclick = () => toggleListCategory(key);
    bar.appendChild(chip);
  }
}

function toggleListCategory(key) {
  if (activeListCategories.has(key)) {
    activeListCategories.delete(key);
  } else {
    activeListCategories.add(key);
  }
  renderListFilterBar();
  renderList();
}

async function renderList() {
  const body = document.getElementById('list-body');
  if (!body) return;

  const filtered = allPois.filter(poi =>
    activeListCategories.has(poi.content.category || 'other') &&
    (!filterFavoritesOnlyList || !!poi.favorite)
  );
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  document.getElementById('poi-count-list').textContent =
    `${filtered.length} lieu${filtered.length !== 1 ? 'x' : ''}`;

  if (!filtered.length) {
    body.innerHTML = `
      <div class="list-empty-state">
        <span>📍</span>
        <p>Aucun lieu pour ces filtres.</p>
      </div>`;
    return;
  }

  // Charger toutes les photos en parallèle
  const photosMap = {};
  await Promise.all(filtered.map(async poi => {
    const photos = await dbGetByIndex('photos', 'poiId', poi.id);
    photosMap[poi.id] = photos.slice(0, 3).map(p => {
      if (!(p.blob instanceof Blob)) p.blob = new Blob([p.blob], { type: p.mimeType });
      return URL.createObjectURL(p.blob);
    });
  }));

  body.innerHTML = filtered.map(poi => {
    const cat = getCat(poi.content.category);
    const tagsHtml = (poi.content.tags || []).slice(0, 4)
      .map(t => `<span class="detail-tag">${escHtml(t)}</span>`).join('');
    const descHtml = poi.content.description
      ? `<div class="list-card-desc">${escHtml(poi.content.description)}</div>` : '';
    const tagsSection = tagsHtml
      ? `<div class="list-card-tags">${tagsHtml}</div>` : '';

    const urls = photosMap[poi.id] || [];
    const photosHtml = urls.length
      ? `<div class="list-card-thumbs">
           ${urls.map(url => `<img class="list-card-thumb" src="${url}" onclick="openLightbox('${url}', '${poi.id}')">`).join('')}
         </div>`
      : '';

    return `
      <div class="list-card">
        <div class="list-card-header">
            <span class="list-card-badge" style="background:${cat.color}">${cat.icon} ${cat.label}</span>
            <div class="list-card-title">${escHtml(poi.content.title || 'Sans titre')}</div>
            <button class="list-fav-btn" onclick="toggleFavoriteFromList('${poi.id}')">
                ${poi.favorite ? '🌟' : '⭐'}
            </button>
        </div>
        ${descHtml}
        ${photosHtml}
        ${tagsSection}
        <div class="list-card-actions">
            <button class="popup-btn" onclick="openDetailInList('${poi.id}')">Voir détails</button>
            <button class="popup-btn primary" onclick="goToPoiOnMap('${poi.id}')">📍 Carte</button>
        </div>
      </div>`;
  }).join('');
}

function goToPoiOnMap(poiId) {
  const poi = allPois.find(p => p.id === poiId);
  if (!poi) return;
  switchView('map');

  setTimeout(() => {
    map.setView([poi.location.lat, poi.location.lng], MAP_CONFIG.maxZoom, { animate: true });
    if (markers[poiId]) {
      markers[poiId].openPopup();
    }
  }, 50);
}
// ═══════════════════════════════════════════════
// PARAMÈTRES
// ═══════════════════════════════════════════════
async function deleteAllPois() {
  if (!confirm('Supprimer tous les lieux définitivement ? Cette action est irréversible.')) return;
  const pois = await dbGetAll('poi');
  for (const poi of pois) {
    const photos = await dbGetByIndex('photos', 'poiId', poi.id);
    for (const p of photos) await dbDelete('photos', p.photoId);
    await dbDelete('poi', poi.id);
    removeMarkerFromMap(poi.id);
  }
  allPois = [];
  updatePoiCount();
  renderList();
  showToast('🗑️ Tous les lieux ont été supprimés');
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`pas de réponse après ${ms} ms`)), ms))]);
}

(async function init() {
    // La carte ne dépend pas de la base : on l'affiche d'abord. Avant, l'app attendait
    // IndexedDB, et un navigateur où elle échoue ou ne répond jamais (navigateur intégré
    // d'une messagerie, navigation privée, vieux iOS) restait sur un écran sans carte.
    // Essayer de charger la configuration dynamique de la carte
    try {
        const response = await fetch('tiles_config.json');
        if (response.ok) {
            const cfg = await response.json();
            Object.assign(MAP_CONFIG, cfg);
            console.log('✅ Configuration de la carte chargée depuis tiles_config.json :', MAP_CONFIG);
        }
    } catch (err) {
        console.warn('⚠️ Impossible de charger tiles_config.json, utilisation des valeurs par défaut :', err);
    }

    initMap();
    updateFilterButton('map', activeCategories);
    updateFilterButton('list', activeListCategories);
    try {
        await withTimeout(initDB(), 5000);
    } catch (err) {
        console.error('❌ IndexedDB indisponible', err);
        showToast('⚠️ Stockage indisponible dans ce navigateur : tes lieux ne seront pas enregistrés');
        return;
    }
    allPois = await dbGetAll('poi');
    for (const poi of allPois) addMarkerToMap(poi);
    updatePoiCount();
    console.log(`✅ KatApp initialisée — ${allPois.length} POI chargés depuis IndexedDB`);
    renderList();

})();

// Nouvelle fonction à ajouter
async function renderPhotosView() {
  const body = document.getElementById('photos-grid-body');
  if (!body) return;

  // Charger toutes les photos de tous les POI
  const allPhotos = await dbGetAll('photos');

  document.getElementById('poi-count-photos').textContent =
    `${allPhotos.length} photo${allPhotos.length !== 1 ? 's' : ''}`;

  if (!allPhotos.length) {
    body.innerHTML = `
      <div class="list-empty-state">
        <span>🖼️</span>
        <p>Aucune photo enregistrée.</p>
      </div>`;
    return;
  }

  const items = await Promise.all(allPhotos.map(async p => {
    if (!(p.blob instanceof Blob)) {
      p.blob = new Blob([p.blob], { type: p.mimeType });
    }
    const url = URL.createObjectURL(p.blob);
    return { url, poiId: p.poiId };
  }));

  body.innerHTML = items.map(({ url, poiId }) => `
    <div class="photo-grid-item">
      <img src="${url}" loading="lazy" onclick="openLightbox('${url}', '${poiId}')">
    </div>
  `).join('');
}

async function toggleFavoriteFromPopup(poiId, btn) {
  const poi = await dbGet('poi', poiId);
  poi.favorite = !poi.favorite;
  poi.updatedAt = new Date().toISOString();
  await dbPut('poi', poi);
  btn.textContent = poi.favorite ? '🌟' : '⭐';
  if (markers[poiId]) {
    markers[poiId].setIcon(makeMarkerIcon(poi.content.category, poi.favorite));
  }
  allPois = await dbGetAll('poi');
  renderList();
  showToast(poi.favorite ? '🌟 Ajouté aux favoris' : '⭐ Retiré des favoris');
}

async function toggleFavoriteFromList(poiId) {
  const poi = await dbGet('poi', poiId);
  poi.favorite = !poi.favorite;
  poi.updatedAt = new Date().toISOString();
  await dbPut('poi', poi);
  if (markers[poiId]) {
    markers[poiId].setIcon(makeMarkerIcon(poi.content.category, poi.favorite));
  }
  allPois = await dbGetAll('poi');
  renderList();
  showToast(poi.favorite ? '🌟 Ajouté aux favoris' : '⭐ Retiré des favoris');
}

async function openDetailInList(poiId) {
  const poi = await dbGet('poi', poiId);
  const photos = await dbGetByIndex('photos', 'poiId', poiId);
  const cat = getCat(poi.content.category);

  const tagsHtml = (poi.content.tags || [])
    .map(t => `<span class="detail-tag">${escHtml(t)}</span>`).join('');

  const photosHtml = await Promise.all(photos.map(async p => {
    if (!(p.blob instanceof Blob)) p.blob = new Blob([p.blob], { type: p.mimeType });
    const url = URL.createObjectURL(p.blob);
    return `<div class="detail-photo"><img src="${url}" onclick="openLightbox('${url}', '${poiId}')" loading="lazy"></div>`;
  }));

  document.getElementById('list-body').innerHTML = `
    <div class="list-detail-view">
      <button class="btn-secondary list-detail-back" onclick="renderList()">← Retour</button>
      <div class="detail-category-badge" style="background:${cat.color}">${cat.icon} ${cat.label}</div>
      <h2 class="list-detail-title">${escHtml(poi.content.title || 'Sans titre')}</h2>
      <div class="detail-description">${escHtml(poi.content.description || 'Aucune description')}</div>
      ${tagsHtml ? `<div class="detail-tags">${tagsHtml}</div>` : ''}
      ${photosHtml.length ? `<div class="detail-photo-grid">${photosHtml.join('')}</div>` : ''}
      <div class="detail-coords">${getCoordsDisplay(poi.location)}</div>
      <div style="font-size:.72rem;color:var(--text-muted)">
        Ajouté le ${new Date(poi.createdAt).toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'})}
      </div>
      <div class="list-detail-actions">
        <button class="btn-danger" onclick="deletePoi('${poi.id}')">Supprimer</button>
        <button class="btn-primary" onclick="openEditForm('${poi.id}')">Modifier</button>
      </div>
    </div>
  `;
}