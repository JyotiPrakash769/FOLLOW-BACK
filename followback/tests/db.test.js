import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { indexedDbAdapter, storageAdapter, gzip, gunzip, estimateQuota, LS_KEY } from "../src/db.js";

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

describe("gzip round-trip", () => {
  it("compresses and decompresses JSON losslessly", async () => {
    const text = JSON.stringify({ names: Array.from({ length: 300 }, (_, i) => "user_" + i) });
    const packed = await gzip(text);
    expect(packed).toBeInstanceOf(Uint8Array);
    expect(packed.length).toBeLessThan(text.length);
    expect(await gunzip(packed)).toBe(text);
  });
});

describe("indexedDbAdapter", () => {
  it("writes gzipped and reads back", async () => {
    const a = indexedDbAdapter(fakeLs());
    const r = await a.write('{"v":2,"hello":"world"}');
    expect(r.ok).toBe(true);
    expect(r.compressed).toBe(true);
    const got = await a.readAll();
    expect(JSON.parse(got.current)).toEqual({ v: 2, hello: "world" });
    expect(got.from).toBe("indexedDB");
  });

  it("adopts existing localStorage data on first read, then clears it", async () => {
    const ls = fakeLs();
    ls.setItem(LS_KEY, '{"v":2,"migrated":true}');
    const a = indexedDbAdapter(ls);
    const first = await a.readAll(); // nothing in IDB yet
    expect(JSON.parse(first.current).migrated).toBe(true);
    await a.write(first.current); // store copies it into IDB
    expect(ls.getItem(LS_KEY)).toBe(null); // and frees the localStorage copy
    const second = await a.readAll();
    expect(second.from).toBe("indexedDB");
  });

  it("surfaces a v1 payload from localStorage for migration", async () => {
    const ls = fakeLs();
    ls.setItem("fb_snaps_v1", "[1,2,3]");
    const got = await indexedDbAdapter(ls).readAll();
    expect(got.v1snaps).toBe("[1,2,3]");
  });

  it("falls back to localStorage when IndexedDB cannot open", async () => {
    globalThis.indexedDB = undefined;
    const ls = fakeLs();
    const a = indexedDbAdapter(ls);
    const r = await a.write('{"v":2}');
    expect(r.ok).toBe(true);
    expect(ls.getItem(LS_KEY)).toBe('{"v":2}');
  });

  it("estimates a much larger quota than localStorage", async () => {
    const q = await estimateQuota(indexedDbAdapter(fakeLs()));
    expect(q.quota).toBeGreaterThan(50 * 1024 * 1024);
    const qLs = await estimateQuota(storageAdapter(fakeLs()));
    expect(qLs.quota).toBe(5 * 1024 * 1024);
  });
});

describe("storageAdapter", () => {
  it("reports a quota failure rather than throwing", () => {
    const ls = {
      getItem: () => null,
      setItem: () => {
        const e = new Error("quota");
        e.name = "QuotaExceededError";
        throw e;
      },
      removeItem() {}
    };
    const r = storageAdapter(ls).write("x");
    expect(r.ok).toBe(false);
    expect(r.quota).toBe(true);
  });
});
