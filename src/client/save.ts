// Persistencia local con IndexedDB (una ranura de guardado).

import type { SaveState } from '../shared/protocol';
import type { Customization } from './avatar';

const DB = 'survival-iso';
const STORE = 'saves';
const KEY = 'slot1';

export interface SaveBundle {
  state: SaveState;
  custom: Customization;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveGame(state: SaveState, custom: Customization): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ state, custom, savedAt: Date.now() } as SaveBundle, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function loadGame(): Promise<SaveBundle | null> {
  try {
    const db = await openDb();
    const val = await new Promise<SaveBundle | undefined>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const g = tx.objectStore(STORE).get(KEY);
      g.onsuccess = () => res(g.result as SaveBundle | undefined);
      g.onerror = () => rej(g.error);
    });
    db.close();
    return val ?? null;
  } catch {
    return null;
  }
}
