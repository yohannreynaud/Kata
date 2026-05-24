// db.js — helper IndexedDB compatible iOS Safari
const DB_NAME = 'paris-map-v1';
const DB_VERSION = 1;
let db;

function initDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;

      if (!d.objectStoreNames.contains('poi')) {
        const s = d.createObjectStore('poi', { keyPath: 'id' });
        s.createIndex('category', 'content.category');
      }

      if (!d.objectStoreNames.contains('photos')) {
        const p = d.createObjectStore('photos', { keyPath: 'photoId' });
        p.createIndex('poiId', 'poiId');
      }
    };

    req.onsuccess = e => { 
      db = e.target.result; 
      resolve(db); 
    };

    req.onerror = reject;
  });
}

/* -------------------------------------------------
   NORMALISATION DES BLOBS (fix iOS Safari)
-------------------------------------------------- */
function normalizeRecord(r) {
  if (!r) return r;

  if (r.blob && !(r.blob instanceof Blob)) {
    try {
      r.blob = new Blob([r.blob], { type: r.mimeType || 'image/jpeg' });
    } catch (e) {
      console.warn("Impossible de normaliser le blob", e);
    }
  }

  return r;
}

/* -------------------------------------------------
   WRAPPERS INDEXEDDB
-------------------------------------------------- */

function dbGetAll(store){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();

    req.onsuccess = () => {
      const out = req.result.map(normalizeRecord);
      res(out);
    };

    req.onerror = rej;
  });
}

function dbGet(store, key){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);

    req.onsuccess = () => res(normalizeRecord(req.result));
    req.onerror = rej;
  });
}

function dbPut(store, val){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(val);

    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

function dbDelete(store, key){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);

    req.onsuccess = () => res();
    req.onerror = rej;
  });
}

function dbGetByIndex(store, index, value){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(index).getAll(value);

    req.onsuccess = () => {
      const out = req.result.map(normalizeRecord);
      res(out);
    };

    req.onerror = rej;
  });
}
