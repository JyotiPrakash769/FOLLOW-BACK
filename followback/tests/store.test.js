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
    const kinds = S.events()
      .map((e) => e.k + ":" + S.name(e.id))
      .sort();
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
      S.add({
        t: d * day,
        followers: names.map((u) => ({ u, t: 1700000000 })),
        following: list(...names.slice(0, 250))
      });
      v1.push({ t: d * day, followers: names, following: names.slice(0, 250), dfo: {}, dfg: {} });
    }
    const v1bytes = JSON.stringify(v1).length;
    expect(S.bytes()).toBeLessThan(v1bytes / 3);
  });

  it("charges much less than v1 did for each extra snapshot", () => {
    const names = Array.from({ length: 500 }, (_, i) => "user_number_" + i);
    const fo = list(...names),
      fg = list(...names.slice(0, 250));
    for (let d = 1; d <= 10; d++) S.add({ t: d * day, followers: fo, following: fg });
    const before = S.bytes();
    S.add({ t: 11 * day, followers: fo, following: fg });
    const v2marginal = S.bytes() - before;
    // v1 wrote every username out again on every upload.
    const v1marginal = JSON.stringify({
      t: 0,
      followers: names,
      following: names.slice(0, 250),
      dfo: {},
      dfg: {}
    }).length;
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
    const v1 = {
      snaps: [{ t: day, followers: ["alice"], following: ["alice", "bob"], dfo: { alice: 7 }, dfg: {} }],
      meta: { ign: ["bob"], so: "new" }
    };
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
    s2.setItem(
      OLD_SNAPS,
      JSON.stringify([
        { t: day, followers: ["alice", "bob"], following: ["alice"], dfo: { alice: 99 }, dfg: {} },
        { t: 2 * day, followers: ["alice"], following: ["alice"], dfo: {}, dfg: {} }
      ])
    );
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

describe("insights", () => {
  it("computes growth, churn and retention across history", () => {
    S.add({ t: day, followers: list("a", "b", "c"), following: list("a") });
    S.add({ t: 31 * day, followers: list("a", "b", "d", "e"), following: list("a") }); // -c +d +e
    const ins = S.insights();
    expect(ins.intervals).toHaveLength(1);
    expect(ins.intervals[0].gained).toBe(2);
    expect(ins.intervals[0].lost).toBe(1);
    expect(ins.growth.total).toBe(1);
    expect(ins.churn.lost).toBe(1);
    expect(ins.churn.gained).toBe(2);
    const cohort = ins.cohorts.find((c) => c.gained === 2);
    expect(cohort.stillHere).toBe(2); // d and e are still present in the latest snapshot
    expect(cohort.retention).toBe(1);
  });

  it("measures how long boomerangs lasted", () => {
    S.add({ t: day, followers: list("x"), following: list("x") });
    S.add({ t: 11 * day, followers: list("x", "flake"), following: list("x") });
    S.add({ t: 21 * day, followers: list("x"), following: list("x") });
    expect(S.insights().medianDaysToUnfollow).toBe(10);
  });

  it("returns an empty shape before a second snapshot", () => {
    S.add({ t: day, followers: list("a"), following: list("a") });
    expect(S.insights().intervals).toEqual([]);
    expect(S.insights().growth).toBe(null);
  });
});

describe("account history", () => {
  it("returns every recorded event for one account, newest first", () => {
    S.add({ t: day, followers: list("on"), following: list("on") });
    S.add({ t: 2 * day, followers: list(), following: list("on") }); // on unfollowed
    S.add({ t: 3 * day, followers: list("on"), following: list("on") }); // on came back
    const h = S.historyOf(S.id("on"));
    expect(h.map((e) => e.k)).toEqual(["gained", "lost"]);
    expect(h[0].t).toBe(3 * day);
  });
});

describe("snooze versus always-skip", () => {
  it("clears snoozes on the next upload but keeps always-skip", () => {
    S.add({ t: day, followers: list("keep", "skipme", "snoozeme"), following: list("keep", "skipme", "snoozeme") });
    // make skipme and snoozeme not-back by having us follow but them not follow back
    S.add({ t: 2 * day, followers: list("keep"), following: list("keep", "skipme", "snoozeme") });
    S.setFlag("ign", [S.id("skipme")], true);
    S.setFlag("snooze", [S.id("snoozeme")], true);
    expect(S.lists().notback.map(S.name)).toEqual([]);
    S.add({ t: 3 * day, followers: list("keep"), following: list("keep", "skipme", "snoozeme") });
    const nb = S.lists().notback.map(S.name);
    expect(nb).toContain("snoozeme"); // snooze expired
    expect(nb).not.toContain("skipme"); // always-skip persists
  });

  it("moving an account to one hide bucket removes it from the other", () => {
    S.add({ t: day, followers: list("a"), following: list("a", "b") });
    const b = S.id("b");
    S.setFlag("snooze", [b], true);
    expect(S.meta().snooze).toContain(b);
    S.setFlag("ign", [b], true);
    expect(S.meta().ign).toContain(b);
    expect(S.meta().snooze).not.toContain(b);
  });
});

describe("lists memoization", () => {
  it("returns a cached object until the store changes", () => {
    S.add({ t: day, followers: list("a"), following: list("a", "b") });
    const first = S.lists();
    expect(S.lists()).toBe(first); // same reference, served from cache
    S.setFlag("done", [S.id("b")], true);
    expect(S.lists()).not.toBe(first); // invalidated by the write
  });
});
