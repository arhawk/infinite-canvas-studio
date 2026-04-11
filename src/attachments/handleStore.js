const DB_NAME = "mind-map-attachments";
const STORE_NAME = "handles";

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDatabase() {
  if (!supportsIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };

    callback(store, resolve, reject);
  });
}

export function supportsHandlePersistence() {
  return supportsIndexedDb();
}

export async function saveHandleRecord(id, handle, metadata = {}) {
  if (!id || !handle || !supportsIndexedDb()) return false;

  // Store browser-local handles/files outside document JSON. The document only
  // keeps handle keys, so reopening on another browser may require reattachment.
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.put({
      id,
      handle,
      metadata,
    });
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error ?? new Error("Failed to save handle."));
  });

  return true;
}

export async function loadHandleRecord(id) {
  if (!id || !supportsIndexedDb()) return null;

  return withStore("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Failed to load handle."));
  });
}
