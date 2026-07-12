// Persistencia local robusta: espejo síncrono en localStorage (sobrevive al
// cierre/refresco de la pestaña) + copia en IndexedDB (mayor capacidad).
// Al cargar se devuelve la copia MÁS RECIENTE de las dos.

import type { SaveState } from '../shared/protocol';
import type { Customization } from './avatar';

const DB = 'survival-iso';
const STORE = 'saves';
const KEY = 'slot1';
const LS_KEY = 'survival-iso-save';

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

function readLS(): SaveBundle | null {
  try {
    const j = localStorage.getItem(LS_KEY);
    return j ? (JSON.parse(j) as SaveBundle) : null;
  } catch {
    return null;
  }
}
function writeLS(bundle: SaveBundle): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(bundle));
  } catch {
    /* sin cuota u otro: la copia de IndexedDB hará de respaldo */
  }
}

// Guardado SÍNCRONO (localStorage). Seguro para usar al cerrar/ocultar la
// pestaña, cuando una escritura asíncrona (IndexedDB) no llegaría a completarse.
export function saveGameSync(state: SaveState, custom: Customization): void {
  writeLS({ state, custom, savedAt: Date.now() });
}

export async function saveGame(state: SaveState, custom: Customization): Promise<void> {
  const bundle: SaveBundle = { state, custom, savedAt: Date.now() };
  writeLS(bundle); // espejo síncrono y durable primero
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bundle, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    /* IndexedDB no disponible: basta con el espejo de localStorage */
  }
}

async function readIdb(): Promise<SaveBundle | null> {
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

export async function loadGame(): Promise<SaveBundle | null> {
  const ls = readLS();
  const idb = await readIdb();
  if (ls && idb) return (ls.savedAt ?? 0) >= (idb.savedAt ?? 0) ? ls : idb;
  return ls ?? idb ?? null;
}
