/**
 * Persistence.
 *
 * localStorage caps an origin at roughly 5MB, which is the ceiling the v2
 * schema was fighting. IndexedDB has no comparable cap and stores binary, so
 * the payload is gzipped on the way in. localStorage stays as a fallback for
 * private-browsing modes and anything that blocks IndexedDB.
 *
 * Every adapter exposes the same three methods. They return promises here;
 * createStore also accepts a plain synchronous Storage object, which is what
 * the unit tests use.
 */

export const DB_NAME = "followback";
export const DB_STORE = "state";
export const DB_KEY = "db_v2";
export const LS_KEY = "fb_db_v2";
export const LS_OLD_SNAPS = "fb_snaps_v1";
export const LS_OLD_META = "fb_meta_v1";

const hasCompression = () => typeof CompressionStream === "function" && typeof Response === "function";

/** gzip a string. Returns a Uint8Array, or null when the browser cannot. */
export async function gzip(text) {
  if (!hasCompression()) return null;
  const cs = new CompressionStream("gzip");
  const stream = new Blob([text]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reverse of gzip. */
export async function gunzip(bytes) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(DB_STORE, mode);
    const req = fn(t.objectStore(DB_STORE));
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
    t.onerror = () => reject(t.error);
    t.oncomplete = () => resolve(req ? req.result : undefined);
  });
}

/** Wrap a synchronous Storage (localStorage, or a test double). */
export function storageAdapter(storage) {
  const get = (k) => {
    try {
      return storage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  return {
    kind: "localStorage",
    readAll: () => ({ current: get(LS_KEY), v1snaps: get(LS_OLD_SNAPS), v1meta: get(LS_OLD_META) }),
    write(text) {
      try {
        storage.setItem(LS_KEY, text);
        return { ok: true };
      } catch (e) {
        const quota = e && (e.name === "QuotaExceededError" || e.code === 22 || /quota/i.test(e.message || ""));
        return { ok: false, quota: !!quota, error: e };
      }
    },
    clear() {
      try {
        storage.removeItem(LS_KEY);
        storage.removeItem(LS_OLD_SNAPS);
      } catch (e) {}
      return { ok: true };
    }
  };
}

/**
 * IndexedDB with gzip, falling back to localStorage when IndexedDB is
 * unavailable. Reads still consult localStorage so existing users are migrated
 * across on their first visit.
 */
export function indexedDbAdapter(fallbackStorage) {
  const ls = fallbackStorage ? storageAdapter(fallbackStorage) : null;
  let db = null;
  let broken = false;

  async function handle() {
    if (broken) return null;
    if (db) return db;
    try {
      db = await openDb();
      return db;
    } catch (e) {
      broken = true;
      console.warn("IndexedDB unavailable, using localStorage", e);
      return null;
    }
  }

  return {
    kind: "indexedDB",
    get degraded() {
      return broken;
    },

    async readAll() {
      const legacy = ls ? ls.readAll() : { current: null, v1snaps: null, v1meta: null };
      const h = await handle();
      if (!h) return legacy;
      try {
        const rec = await tx(h, "readonly", (s) => s.get(DB_KEY));
        if (rec) {
          const text = typeof rec === "string" ? rec : await gunzip(rec);
          return { current: text, v1snaps: legacy.v1snaps, v1meta: legacy.v1meta, from: "indexedDB" };
        }
      } catch (e) {
        console.warn("IndexedDB read failed", e);
      }
      return legacy; // nothing in IndexedDB yet: adopt whatever localStorage holds
    },

    async write(text) {
      const h = await handle();
      if (!h) return ls ? ls.write(text) : { ok: false, error: new Error("no storage") };
      try {
        const packed = (await gzip(text)) || text;
        await tx(h, "readwrite", (s) => s.put(packed, DB_KEY));
        // The localStorage copy is now stale and only wastes the small quota.
        if (ls) ls.clear();
        return { ok: true, bytes: packed.length || packed.byteLength || text.length, compressed: packed !== text };
      } catch (e) {
        const quota = e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""));
        if (ls) {
          const r = ls.write(text);
          if (r.ok) return { ok: true, degraded: true };
          return r;
        }
        return { ok: false, quota: !!quota, error: e };
      }
    },

    async clear() {
      if (ls) ls.clear();
      const h = await handle();
      if (h) {
        try {
          await tx(h, "readwrite", (s) => s.delete(DB_KEY));
        } catch (e) {
          console.warn("IndexedDB clear failed", e);
        }
      }
      return { ok: true };
    }
  };
}

/** How much room we have. IndexedDB quotas are orders of magnitude larger. */
export async function estimateQuota(adapter) {
  if (
    adapter &&
    adapter.kind === "indexedDB" &&
    !adapter.degraded &&
    typeof navigator !== "undefined" &&
    navigator.storage &&
    navigator.storage.estimate
  ) {
    try {
      const e = await navigator.storage.estimate();
      if (e && e.quota) return { quota: e.quota, usage: e.usage || 0, source: "navigator.storage" };
    } catch (err) {
      /* fall through */
    }
  }
  if (adapter && adapter.kind === "indexedDB" && !adapter.degraded)
    return { quota: 200 * 1024 * 1024, usage: 0, source: "assumed" };
  return { quota: 5 * 1024 * 1024, usage: 0, source: "localStorage" };
}

/** Pick the best adapter this browser offers. */
export function defaultAdapter() {
  const ls = typeof localStorage !== "undefined" ? localStorage : null;
  if (typeof indexedDB !== "undefined") return indexedDbAdapter(ls);
  return ls ? storageAdapter(ls) : null;
}
