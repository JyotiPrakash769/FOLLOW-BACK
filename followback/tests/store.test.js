import { describe, it, expect, beforeEach } from "vitest";
import { createStore, KEY, OLD_SNAPS, OLD_META } from "../src/store.js";

/** localStorage stand-in, with an optional byte cap to exercise the quota path. */
function fakeStorage(cap) {
  const m = new Map();
  return {
    cap,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    setItem(k, v) {
      if (this.cap && v.length > this.cap) {
        const e = new Error("quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, v);
    },
    _map: m
  };
}
const day = 86400000;
const list = (...us) => us.map((u) => ({ u, t: 0 }));

let st, S;
beforeEach(() => {
  st = fakeStorage();
  S = createStore(st);
  S.load();
});

describe("snapshots and derived lists", () => {
  it("splits follow relationships into the right buckets", () => {
    S.add({ t: day, followers: list("alice", "bob"), following: list("alice", "carol") });
    const L = S.lists();
    expect(L.mutual.map(S.name)).toEqual(["alice"]);
    expect(L.notback.map(S.name)).toEqual(["carol"]);
    expect(L.fans.map(S.name)).toEqual(["bob"]);
  });

  it("is case-insensitive but keeps the newest capitalisation", () => {
    S.add({ t: day, followers: list("Alice"), following: list("alice") });
    expect(S.lists().mutual.map(S.name)).toEqual(["alice"]);
  });

  it("replaces a snapshot uploaded the same day instead of stacking one up", () => {
    S.add({ t: day, followers: list("a1"), following: list("a1") });
    S.add({ t: day + 3600000, followers: list("a1", "a2"), following: list("a1") });
    expect(S.snaps()).toHaveLength(1);
    expect(S.latest().fo).toHaveLength(2);
  });

  it("diffs followers between two snapshots", () => {
    S.add({ t: day, followers: list("x", "y"), following: list("x") });
    S.add({ t: 2 * day, followers: list("y", "z"), following: list("x") });
    const L = S.lists();
    expect(L.lost.map(S.name)).toEqual(["x"]);
    expect(L.gained.map(S.name)).toEqual(["z"]);
  });

  it("stores the extra export lists", () => {
    S.add({ t: day, followers: list("a"), following: list("a"), blocked: list("spam"), unfollowed: list("gone") });
    const L = S.lists();
    expect(L.blocked.map(S.name)).toEqual(["spam"]);
    expect(L.unfollowed.map(S.name)).toEqual(["gone"]);
  });
});

describe("first-seen timestamps", () => {
  it("keeps the earliest timestamp and survives later snapshots that lack it", () => {
    S.add({ t: day, followers: [{ u: "alice", t: 500 }], following: list("alice") });
    S.add({ t: 2 * day, followers: [{ u: "alice", t: 900 }], following: list("alice") });
    S.add({ t: 3 * day, followers: list("alice"), following: list("alice") });
    expect(S.firstSeen(S.id("alice"))).toBe(500);
  });

  it("remembers a timestamp from a snapshot that is no longer the previous one", () => {
    S.add({ t: day, followers: [{ u: "old", t: 111 }], following: [{ u: "old", t: 111 }] });
    for (let i = 2; i < 6; i++) S.add({ t: i * day, followers: list("old"), following: list("old") });
    expect(S.firstSeen(S.id("old"))).toBe(111); // the v1 code lost this after two uploads
  });
});

describe("event log", () => {
  it("records follower and following changes with dates", () => {
    S.add({ t: day, followers: list("a"), following: list("a", "b") });
    S.add({ t: 2 * day, followers: list("a", "c"), following: list("a") });
    const kinds = S.events().map((e) => e.k + ":" + S.name(e.id)).sort();
    expect(kinds).toEqual(["gained:c", "unfollowed:b"]);
    expect(S.events()[0].t).toBe(2 * day);
  });

  it("spots the follow-then-unfollow pattern", () => {
    S.add({ t: day, followers: list("real"), following: list("real") });
    S.add({ t: 2 * day, followers: list("real", "f4f"), following: list("real") });
    S.add({ t: 3 * day, followers: list("real"), following: list("real") });
    const b = S.boomerangs();
    expect(b).toHaveLength(1);
    expect(S.name(b[0].id)).toBe("f4f");
    expect(b[0].from).toBe(2 * day);
    expect(b[0].to).toBe(3 * day);
  });

  it("drops the events of a re-uploaded day rather than double counting", () => {
    S.add({ t: day, followers: list("a"), following: list("a") });
    S.add({ t: 2 * day, followers: list("a", "b"), following: list("a") });
    S.add({ t: 2 * day + 1000, followers: list("a", "b"), following: list("a") });
    expect(S.events().filter((e) => e.k === "gained")).toHaveLength(1);
  });
});

describe("storage size", () => {
  it("stores far less than the v1 schema for repeated snapshots", () => {
    const names = Array.from({ length: 500 }, (_, i) => "user_number_" + i);
    const v1 = [];
    for (let d = 1; d <= 20; d++) {
      S.add({ t: d * day, followers: names.map((u) => ({ u, t: 1700000000 })), following: list(...names.slice(0, 250)) });
      v1.push({ t: d * day, followers: names, following: names.slice(0, 250), dfo: {}, dfg: {} });
    }
    const v1bytes = JSON.stringify(v1).length;
    expect(S.bytes()).toBeLessThan(v1bytes / 3);
  });

  it("charges much less than v1 did for each extra snapshot", () => {
    const names = Array.from({ length: 500 }, (_, i) => "user_number_" + i);
    const fo = list(...names), fg = list(...names.slice(0, 250));
    for (let d = 1; d <= 10; d++) S.add({ t: d * day, followers: fo, following: fg });
    const before = S.bytes();
    S.add({ t: 11 * day, followers: fo, following: fg });
    const v2marginal = S.bytes() - before;
    // v1 wrote every username out again on every upload.
    const v1marginal = JSON.stringify({ t: 0, followers: names, following: names.slice(0, 250), dfo: {}, dfg: {} }).length;
    expect(v2marginal).toBeLessThan(v1marginal / 3);
  });

  it("reports a quota failure instead of silently losing the snapshot", () => {
    st.cap = 50;
    const r = S.add({ t: day, followers: list("a", "b", "c"), following: list("a") });
    expect(r.ok).toBe(false);
    expect(r.quota).toBe(true);
    expect(S.snaps()).toHaveLength(1); // still in memory, so the UI can offer to prune
  });

  it("prunes the oldest snapshots and frees the names they held", () => {
    for (let d = 1; d <= 4; d++) S.add({ t: d * day, followers: list("keep", "drop" + d), following: list("keep") });
    const before = S.raw.names.length;
    const r = S.pruneOldest(3);
    expect(r.dropped).toBe(3);
    expect(S.snaps()).toHaveLength(1);
    expect(S.raw.names.length).toBeLessThan(before);
    expect(S.lists().mutual.map(S.name)).toEqual(["keep"]);
  });

  it("never prunes away the last snapshot", () => {
    S.add({ t: day, followers: list("a"), following: list("a") });
    S.pruneOldest(9);
    expect(S.snaps()).toHaveLength(1);
  });
});

describe("snapshot management", () => {
  it("labels and deletes individual snapshots", () => {
    S.add({ t: day, followers: list("a"), following: list("a") });
    S.add({ t: 2 * day, followers: list("a", "b"), following: list("a") });
    S.label(0, "wrong date range");
    expect(S.snaps()[0].label).toBe("wrong date range");
    S.deleteSnapshot(0);
    expect(S.snaps()).toHaveLength(1);
    expect(S.snaps()[0].t).toBe(2 * day);
  });

  it("keeps hidden and done flags pointing at the right accounts after a compaction", () => {
    S.add({ t: day, followers: list("gone"), following: list("gone", "stay") });
    S.add({ t: 2 * day, followers: list("stay"), following: list("stay", "target") });
    const target = S.id("target");
    S.setFlag("ign", [target], true);
    S.deleteSnapshot(0);
    expect(S.meta().ign.map(S.name)).toEqual(["target"]);
    expect(S.lists().notback.map(S.name)).toEqual([]);
    expect(S.lists().ign.map(S.name)).toEqual(["target"]);
  });
});

describe("backups", () => {
  it("round-trips a v2 export", () => {
    S.add({ t: day, followers: [{ u: "alice", t: 42 }], following: list("alice", "bob") });
    S.setFlag("done", [S.id("bob")], true);
    const text = S.exportJson();
    const T = createStore(fakeStorage());
    T.load();
    const r = T.importJson(text);
    expect(r.ok).toBe(true);
    expect(T.lists().notback.map(T.name)).toEqual(["bob"]);
    expect(T.firstSeen(T.id("alice"))).toBe(42);
    expect(T.meta().done.map(T.name)).toEqual(["bob"]);
  });

  it("imports an old v1 backup", () => {
    const v1 = { snaps: [{ t: day, followers: ["alice"], following: ["alice", "bob"], dfo: { alice: 7 }, dfg: {} }], meta: { ign: ["bob"], so: "new" } };
    const r = S.importJson(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    expect(S.lists().mutual.map(S.name)).toEqual(["alice"]);
    expect(S.lists().ign.map(S.name)).toEqual(["bob"]);
    expect(S.meta().so).toBe("new");
    expect(S.firstSeen(S.id("alice"))).toBe(7);
  });

  it("rejects junk with a reason", () => {
    expect(S.importJson("not json").ok).toBe(false);
    expect(S.importJson('{"v":99}').reason).toMatch(/unrecognised/);
    expect(S.importJson('{"snaps":[{"nope":1}]}').reason).toMatch(/v1/);
  });
});

describe("migration from v1 localStorage", () => {
  it("converts saved v1 data on first load and writes the new key", () => {
    const s2 = fakeStorage();
    s2.setItem(OLD_SNAPS, JSON.stringify([
      { t: day, followers: ["alice", "bob"], following: ["alice"], dfo: { alice: 99 }, dfg: {} },
      { t: 2 * day, followers: ["alice"], following: ["alice"], dfo: {}, dfg: {} }
    ]));
    s2.setItem(OLD_META, JSON.stringify({ ign: ["bob"], th: "dark", so: "old" }));
    const T = createStore(s2);
    expect(T.load().migrated).toBe(true);
    expect(T.snaps()).toHaveLength(2);
    expect(T.meta().th).toBe("dark");
    expect(T.firstSeen(T.id("alice"))).toBe(99);
    expect(T.events().some((e) => e.k === "lost" && T.name(e.id) === "bob")).toBe(true);
    expect(JSON.parse(s2.getItem(KEY)).v).toBe(2);
  });

  it("loads v2 data straight back without migrating", () => {
    S.add({ t: day, followers: list("alice"), following: list("alice") });
    const T = createStore(st);
    expect(T.load().migrated).toBe(false);
    expect(T.lists().mutual.map(T.name)).toEqual(["alice"]);
  });

  it("survives corrupt stored data", () => {
    const s3 = fakeStorage();
    s3.setItem(KEY, "{not json");
    const T = createStore(s3);
    expect(() => T.load()).not.toThrow();
    expect(T.snaps()).toEqual([]);
  });
});
