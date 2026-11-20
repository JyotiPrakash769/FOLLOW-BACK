import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { forgetSaved, LS_KEYS, DB_NAME } from "../src/db.js";

function fakeLs() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _map: m
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("forgetSaved", () => {
  it("deletes the IndexedDB history and every localStorage key", async () => {
    const ls = fakeLs();
    for (const k of LS_KEYS) ls.setItem(k, "old");
    ls.setItem("someone-elses-key", "keep");
    // Seed the database the way 3.0 left it, then close the connection: the
    // app holds none open, and an open one blocks deletion.
    await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onsuccess = () => {
        const tx = r.result.transaction("state", "readwrite");
        tx.objectStore("state").put("old history", "db_v2");
        tx.oncomplete = () => {
          r.result.close();
          res(undefined);
        };
      };
      r.onerror = () => rej(r.error);
    });

    await forgetSaved(ls, globalThis.indexedDB);

    expect(Array.from(ls._map.keys())).toEqual(["someone-elses-key"]);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(DB_NAME);
  });

  it("never throws when storage is blocked or missing", async () => {
    const blocked = {
      removeItem() {
        throw new Error("SecurityError");
      }
    };
    await expect(forgetSaved(/** @type {any} */ (blocked), null)).resolves.toBeUndefined();
    await expect(forgetSaved(null, null)).resolves.toBeUndefined();
  });
});
