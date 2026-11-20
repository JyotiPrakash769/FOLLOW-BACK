/**
 * The app keeps nothing in the browser. Versions up to 3.0 saved history in
 * IndexedDB and localStorage under these names; forgetSaved() removes it so
 * nothing from an earlier visit lingers.
 */

export const DB_NAME = "followback";
export const LS_KEYS = ["fb_db_v2", "fb_snaps_v1", "fb_meta_v1"];

/**
 * Delete everything an earlier version saved in this browser. Never throws,
 * never hangs.
 * @param {Pick<Storage, "removeItem"> | null} [storage] defaults to the page's localStorage
 * @param {IDBFactory | null} [idb] defaults to the page's indexedDB
 * @returns {Promise<void>}
 */
export function forgetSaved(storage, idb) {
  const ls = storage !== undefined ? storage : typeof localStorage !== "undefined" ? localStorage : null;
  const db = idb !== undefined ? idb : typeof indexedDB !== "undefined" ? indexedDB : null;
  if (ls) {
    for (const k of LS_KEYS) {
      try {
        ls.removeItem(k);
      } catch (e) {
        /* storage blocked: nothing was saved there either */
      }
    }
  }
  if (!db) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const req = db.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}
