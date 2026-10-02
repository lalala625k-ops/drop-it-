import { Card } from '../types';

const DATABASE = 'pinboard_pending_images';
const STORE = 'images';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storePendingImage(id: string, dataUrl: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(dataUrl, id);
      transaction.oncomplete = () => { db.close(); resolve(true); };
      transaction.onerror = () => { db.close(); resolve(false); };
      transaction.onabort = () => { db.close(); resolve(false); };
    });
  } catch { return false; }
}

async function readPendingImage(id: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return await new Promise<string | null>((resolve) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(id);
      request.onsuccess = () => { db.close(); resolve(typeof request.result === 'string' ? request.result : null); };
      request.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

export async function readAllPendingImages(): Promise<Record<string, string>> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const result: Record<string, string> = {};
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (typeof cursor.value === 'string') result[String(cursor.key)] = cursor.value;
          cursor.continue();
        } else { db.close(); resolve(result); }
      };
      request.onerror = () => { db.close(); resolve(result); };
    });
  } catch { return {}; }
}

export async function restorePendingImages(cards: Card[]): Promise<Card[]> {
  return Promise.all(cards.map(async (card) => {
    if (card.type !== 'image' || card.image) return card;
    const image = await readPendingImage(card.id);
    return image ? { ...card, image } : card;
  }));
}

export async function removePendingImage(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); resolve(); };
    });
  } catch { /* A stale backup is harmless. */ }
}
