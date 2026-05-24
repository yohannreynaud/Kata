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
    ENREGISTREMENT DU SERVICE WORKER
------------------------------ */

if ('serviceWorker' in navigator) { // Teste si le navigateur supporte les service workers
    window.addEventListener('load', async () => { // vraie une fois que la page est complètement chargée
        
        // Si un SW contrôle déjà la page, on lui demande sa version pour l'afficher dans la console (utile aussi pour vérifier que le skipWaiting a bien fonctionné après une mise à jour).
        if (navigator.serviceWorker.controller) {
            console.log('[SW] Un SW contrôle déjà cette page. Récupération de sa version…');
            navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        }

        console.log('[SW] Récupération de la dernière version du SW (sw.js) mise à disposition par le serveur…');
        // représente l’inscription du SW pour le scope courant (ici : /pwa/). C’est un objet qui contient des infos sur le SW installé, et qui émet des événements liés à son cycle de vie (install, updatefound, etc.).
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('[SW] La version du SW du serveur est récupérée. Comparaison avec le SW actif…');
        /*
        Précisions sur la gestion des SW par le navigateur : un SW peut avoir trois états : active (contrôle la page), waiting (en attente de prendre le contrôle) et installing (en cours d'installation).
        Au moment du register(), on pourrait se retrouver avec 3 SW : 1 SW active, 1 SW caiting et 1 SW installing. 
        En réalité le navigateur éjecte automatiquement le SW waiting dès qu'il détecte un SW installing (le SW installing deviendra le nouveau SW waiting).
        */
        if (registration.active && !registration.waiting && !registration.installing) {
            console.log('[SW] Le SW chargé depuis le serveur est identique au SW actif : aucune mise à jour requise.');
        }

        /*
        Au moment où on recharge la page, on vérifie si un SW est en attente de prise de contrôle (waiting)
        Cela arrive quand un SW a été précédement installé mais n'a jamais
        pu prendre le contrôle (pas de skipWaiting, onglet non fermé).
        On a alors 2 SW :
        - N°1 : active  (contrôle la page)
        - N°2 : waiting (prêt à prendre le contrôle dès skipWaiting)
        */
        if (registration.waiting) { // vrai si un SW (N°2) est  installé et en attente de prendre le contrôle (waiting) → on affiche la bannière qui permet de déclencher skipWaiting et ainsi activer le nouveau SW.
            console.log('[SW] Un SW a été installé, il est en attente de prise de contrôle. Veuillez rafraîchir la page pour l\'activer.');
            showUpdateBanner(registration);
        }

        // EventListener qui détecte l'arrivée d'un nouveau SW (updatefound) → on affiche la bannière qui permet de déclencher skipWaiting et ainsi activer le nouveau SW.
        registration.addEventListener('updatefound', () => {
            console.log('[SW] Nouvelle version du SW trouvée → tentative d\'installation…');
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                    console.log('[SW] Nouveau SW installé et prêt à remplacer le SW actif → Veuillez valider le changement de SW en cliquant sur le bouton de la bannière de mise à jour.');
                    showUpdateBanner(registration);
                }
            });
        });

        // EventListener qui détecte le changement de SW controlant la page (controllerchange) → on recharge la page pour actualiser l\'affichage des ressources.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SW] Changement de SW controlant la page → reload de la page pour actualiser l\'affichage des ressources');
            window.location.reload();
        });

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type === 'SW_VERSION') {
                console.log('[SW] Version du SW actif :', event.data.version);
            }
        });

        /* ------------------------------
        POLLING PÉRIODIQUE
        Vérifie toutes les 60s si sw.js a changé sur le serveur.
        ------------------------------ */
        setInterval(async () => {
            try {
                await registration.update();
                console.log('[SW] Vérification mise à jour…');
            } catch (err) {
                console.warn('[SW] Échec vérification mise à jour', err);
            }
        }, 60 * 1000); // toutes les 60 secondes
    });
}


function showUpdateBanner(registration) {
    /* ------------------------------
        BANNIÈRE DE MISE À JOUR DU SW
    ------------------------------ */
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.position = 'fixed';
    banner.style.bottom = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.padding = '12px 16px';
    banner.style.background = '#222';
    banner.style.color = '#fff';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
    banner.style.zIndex = '9999';

    const text = document.createElement('span');
    text.textContent = 'Une nouvelle version du SW est disponible.';

    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Mettre à jour';
    updateBtn.style.marginLeft = '8px';

    updateBtn.addEventListener('click', () => {
    if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    });

    banner.appendChild(text);
    banner.appendChild(updateBtn);
    document.body.appendChild(banner);
}

async function hardResetPWA() {
    /* ------------------------------
        RESET COMPLET DE LA PWA
    ------------------------------ */
    console.log('[RESET] Réinitialisation complète…');

    // FIX : on désactive le listener controllerchange AVANT de déclencher
    // skipWaiting, pour éviter que le reload automatique interrompe les
    // étapes suivantes (vidage des caches, unregister) qui n'auraient
    // jamais le temps de s'exécuter.
    navigator.serviceWorker.oncontrollerchange = null;

    const reg = await navigator.serviceWorker.getRegistration();

    try {
    // 1) Forcer une mise à jour
    if (reg) {
        console.log('[RESET] registration.update()');
        await reg.update();
    }

    // 2) Forcer skipWaiting si un SW est en attente
    if (reg?.waiting) {
        console.log('[RESET] skipWaiting()');
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // On attend que le nouveau SW prenne le contrôle avant de continuer
        await new Promise(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        });
    }

    // 3) Vider tous les caches
    const keys = await caches.keys();
    for (const key of keys) {
        console.log('[RESET] Suppression du cache', key);
        await caches.delete(key);
    }

    // 4) Désenregistrer le SW
    if (reg) {
        console.log('[RESET] unregister()');
        await reg.unregister();
    }

    } catch (err) {
    console.error('[RESET] Erreur', err);
    }

    // 5) Reload final
    console.log('[RESET] Reload');
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
    });

    new ImageTileLayer('tiles/{z}/{x}/{y}.png', {
        tileSize,
        minZoom,
        maxZoom,
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

    let lastTapTime = 0;
    let lastTapPos = null;
    let lastSyntheticAddTime = 0;
    const DOUBLE_TAP_DELAY = 350;
    const TAP_MOVE_TOLERANCE = 15;

    map.on('contextmenu', e => {
        // Bloque le menu contextuel natif iOS/Android
        e.originalEvent.preventDefault();
    });

    map.on('dblclick', e => {
        if (Date.now() - lastSyntheticAddTime <= DOUBLE_TAP_DELAY) {
            return;
        }
        if (!e.latlng) return;
        pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        openAddForm();
    });

    const mapContainer = map.getContainer();
    mapContainer.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) {
            lastTapTime = 0;
            lastTapPos = null;
            return;
        }
        const touch = e.touches[0];
        lastTapPos = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });

    mapContainer.addEventListener('touchmove', e => {
        if (!lastTapPos || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dx = touch.clientX - lastTapPos.x;
        const dy = touch.clientY - lastTapPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_TOLERANCE) {
            lastTapTime = 0;
            lastTapPos = null;
        }
    }, { passive: true });

    mapContainer.addEventListener('touchend', e => {
        if (!lastTapPos) return;
        const touch = e.changedTouches[0];
        if (!touch) {
            lastTapTime = 0;
            lastTapPos = null;
            return;
        }

        const dx = touch.clientX - lastTapPos.x;
        const dy = touch.clientY - lastTapPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_TOLERANCE) {
            lastTapTime = 0;
            lastTapPos = null;
            return;
        }

        const now = Date.now();
        if (now - lastTapTime <= DOUBLE_TAP_DELAY) {
            const containerPoint = map.mouseEventToContainerPoint(touch);
            const latlng = map.containerPointToLatLng(containerPoint);
            pendingLatLng = { lat: latlng.lat, lng: latlng.lng };
            openAddForm();
            lastSyntheticAddTime = now;
            lastTapTime = 0;
            lastTapPos = null;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        lastTapTime = now;
        lastTapPos = null;
    }, { passive: false });

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
        <div class="popup-title">${escHtml(poi.content.title || 'Sans titre')}</div>
        <div class="popup-cat">${catInfo.icon} ${catInfo.label}</div>
        <div class="popup-coords-hint" style="margin-top:2px;font-size:0.68rem;opacity:0.7">${getCoordsDisplay(poi.location)}</div>
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

    loadPopupPhotos(poi.id);
    return div;
  }, { maxWidth: 260 });

  marker.addTo(layers[cat]);
  markers[poi.id] = marker;
}

async function loadPopupPhotos(poiId) {
    
    
    const container = document.getElementById(`popup-photos-${poiId}`);
    if (!container) return;
    
    const photos = await dbGetByIndex('photos', 'poiId', poiId);
    console.log("Photos brutes =", photos);
  

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
  const listBtn = document.querySelector('.nav-btn[data-view="list"]');
  switchView('list', listBtn);
  setTimeout(() => openDetail(lightboxPoiId), 100);
}

function lightboxGoToMap() {
  if (!lightboxPoiId) return;
  closeLightbox();
  const mapBtn = document.querySelector('.nav-btn[data-view="map"]');
  switchView('map', mapBtn);
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
function switchView(viewName, btnEl) {
  closeFilterMenu(); // ← manquant
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  btnEl.classList.add('active');

  if (viewName === 'map') setTimeout(() => map.invalidateSize(), 10);
  if (viewName === 'list') renderList();
  if (viewName === 'photos') renderPhotosView();
}

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

  const mapBtn = document.querySelector('.nav-btn[data-view="map"]');
  switchView('map', mapBtn);

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

async function clearCache() {
  if (!confirm('Vider le cache de l\'application ?')) return;
  const keys = await caches.keys();
  for (const key of keys) await caches.delete(key);
  showToast('✅ Cache vidé');
}
// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
(async function init() {
    await initDB();
    
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
    allPois = await dbGetAll('poi');
    for (const poi of allPois) addMarkerToMap(poi);
    updatePoiCount();
    console.log(`✅ Paris Map initialisé — ${allPois.length} POI chargés depuis IndexedDB`);
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