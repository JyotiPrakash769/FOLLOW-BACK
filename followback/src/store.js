/**
 * Snapshot store, held in memory only. Nothing is written to the browser: the
 * page starts over on every visit, and backups are the way to carry history.
 *
 * Usernames are interned once into `names`; snapshots hold integer ids, so a
 * backup of many snapshots stays small. Snapshots are kept in date order, and
 * the event log is replayed from them whenever that order changes, so ZIPs can
 * be added in any order.
 */

export const EXTRA_KINDS = ["unfollowed", "blocked", "restricted", "closefriends", "received", "recent"];
export const DAY = 86400000;

function blank() {
  return {
    v: 2,
    names: [],
    first: {},
    snaps: [],
    events: [],
    meta: { ign: [], done: [], snooze: [], th: "", so: "az", tab: "notback", claimed: null }
  };
}

export function createStore() {
  let db = blank();
  let idx = new Map();
  let version = 0; // bumped on every mutation, to invalidate caches
  let cache = null;

  const bump = () => {
    version++;
    cache = null;
  };
  function reindex() {
    idx = new Map();
    db.names.forEach((n, i) => idx.set(n.toLowerCase(), i));
  }

  /** Intern a username, returning its stable integer id. */
  function id(u) {
    const k = String(u).toLowerCase();
    let i = idx.get(k);
    if (i === undefined) {
      i = db.names.length;
      db.names.push(String(u));
      idx.set(k, i);
    } else if (u && db.names[i] !== u) db.names[i] = String(u);
    return i;
  }
  const name = (i) => db.names[i] || "";
  const has = (u) => idx.has(String(u).toLowerCase());

  function adopt(raw) {
    db = Object.assign(blank(), raw);
    db.meta = Object.assign(blank().meta, raw.meta || {});
    for (const k of ["ign", "done", "snooze"]) if (!Array.isArray(db.meta[k])) db.meta[k] = [];
    reindex();
    bump();
  }

  /** Convert a v1 payload (from storage, or from an old backup file). */
  function migrate(old, meta) {
    if (!Array.isArray(old) || !old.length) {
      if (meta) {
        db.meta = Object.assign(db.meta, pickMeta(meta));
        bump();
      }
      return false;
    }
    db = blank();
    idx = new Map();
    for (const s of old) {
      if (!s || !Array.isArray(s.followers) || !Array.isArray(s.following)) continue;
      const stamps = Object.assign({}, s.dfo || {}, s.dfg || {});
      const at = (u) => stamps[String(u).toLowerCase()] || 0;
      add({
        t: s.t,
        followers: s.followers.map((u) => ({ u, t: at(u) })),
        following: s.following.map((u) => ({ u, t: at(u) })),
        pending: (s.pending || []).map((u) => ({ u, t: 0 }))
      });
    }
    if (meta) {
      const m = pickMeta(meta);
      m.ign = (meta.ign || []).filter(has).map(id);
      m.done = (meta.done || []).filter(has).map(id);
      db.meta = Object.assign(db.meta, m);
    }
    bump();
    return true;
  }

  function pickMeta(m) {
    const o = {};
    if (typeof m.th === "string") o.th = m.th;
    if (typeof m.so === "string") o.so = m.so;
    if (typeof m.claimed === "number") o.claimed = m.claimed;
    if (typeof m.tab === "string") o.tab = m.tab;
    return o;
  }

  const serialise = () => JSON.stringify(db);
  const OK = () => ({ ok: true });

  const snaps = () => db.snaps;
  const latest = () => db.snaps[db.snaps.length - 1] || null;
  const meta = () => db.meta;
  const events = () => db.events;
  const firstSeen = (i) => db.first[i] || 0;
  const setOf = (snap, key) => new Set(snap && snap[key] ? snap[key] : []);

  /** Followers minus mutuals: the headline number, per snapshot, for the chart. */
  function notBackCount(snap) {
    const fo = setOf(snap, "fo");
    let n = 0;
    for (const i of snap.fg || []) if (!fo.has(i)) n++;
    return n;
  }

  /**
   * Add a snapshot. `payload.followers/following/...` are [{u,t}] arrays.
   * It goes in date order, so an older ZIP added after a newer one lands in
   * the right place. Two exports from the same calendar day replace each other.
   */
  function add(payload) {
    const t = payload.t || Date.now();
    const conv = (arr) => {
      const out = [];
      for (const e of arr || []) {
        const i = id(e.u);
        if (e.t && (!db.first[i] || e.t < db.first[i])) db.first[i] = e.t;
        out.push(i);
      }
      return Array.from(new Set(out)).sort((a, b) => a - b);
    };
    const snap = { t, fo: conv(payload.followers), fg: conv(payload.following), pe: conv(payload.pending) };
    for (const k of EXTRA_KINDS) {
      if (payload[k] && payload[k].length) {
        snap.x = snap.x || {};
        snap.x[k] = conv(payload[k]);
      }
    }

    const day = new Date(t).toDateString();
    const same = db.snaps.findIndex((x) => new Date(x.t).toDateString() === day);
    if (same > -1) db.snaps[same] = snap;
    else {
      let at = db.snaps.length;
      while (at > 0 && db.snaps[at - 1].t > t) at--;
      db.snaps.splice(at, 0, snap);
    }
    replay();
    db.meta.snooze = []; // a snooze lasts until the next upload
    bump();
    return OK();
  }

  /** Rebuild the event log from consecutive snapshots. */
  function replay() {
    db.events = [];
    for (let i = 1; i < db.snaps.length; i++) logEvents(db.snaps[i - 1], db.snaps[i], i);
  }

  function logEvents(a, b, si) {
    for (const [key, up, down] of [
      ["fo", "gained", "lost"],
      ["fg", "followed", "unfollowed"]
    ]) {
      const A = setOf(a, key),
        B = setOf(b, key);
      for (const i of B) if (!A.has(i)) db.events.push({ t: b.t, k: up, id: i, s: si });
      for (const i of A) if (!B.has(i)) db.events.push({ t: b.t, k: down, id: i, s: si });
    }
    db.events.sort((x, y) => y.t - x.t);
  }

  /** Every recorded event for one account, newest first. */
  const historyOf = (i) => db.events.filter((e) => e.id === i);

  /** Accounts that followed, then unfollowed: the follow-for-follow pattern. */
  function boomerangs() {
    const pending = new Map();
    const out = [];
    for (const e of db.events.slice().reverse()) {
      // oldest first
      if (e.k === "gained") pending.set(e.id, e.t);
      else if (e.k === "lost" && pending.has(e.id)) {
        out.push({ id: e.id, from: pending.get(e.id), to: e.t });
        pending.delete(e.id);
      }
    }
    return out.sort((a, b) => b.to - a.to);
  }

  /**
   * Two hide buckets doing two different jobs: `ign` is "always skip this
   * account" (a celebrity you follow on purpose), `snooze` is "not this time"
   * and is cleared by the next upload.
   */
  const isHidden = (i) => db.meta.ign.includes(i) || db.meta.snooze.includes(i);

  /** Derived lists for the latest snapshot, comparing snapshots `ai` and `bi`. */
  function lists(ai, bi) {
    const key = version + ":" + (ai == null ? -1 : ai) + ":" + (bi == null ? -1 : bi);
    if (cache && cache.key === key) return cache.value;

    const s = latest();
    const L = { notback: [], fans: [], mutual: [], lost: [], gained: [], boomerang: [], snooze: [], ign: [] };
    for (const k of EXTRA_KINDS) L[k] = [];
    if (!s) {
      cache = { key, value: L };
      return L;
    }

    const fo = setOf(s, "fo"),
      fg = setOf(s, "fg");
    for (const i of fg) {
      if (fo.has(i)) L.mutual.push(i);
      else if (!isHidden(i)) L.notback.push(i);
    }
    for (const i of fo) if (!fg.has(i) && !isHidden(i)) L.fans.push(i);
    L.pending = (s.pe || []).filter((i) => !isHidden(i));
    for (const k of EXTRA_KINDS) L[k] = ((s.x && s.x[k]) || []).filter((i) => !isHidden(i));
    L.snooze = db.meta.snooze.slice();
    L.ign = db.meta.ign.slice();

    if (db.snaps.length > 1) {
      const A = db.snaps[ai != null && ai >= 0 ? ai : db.snaps.length - 2];
      const B = db.snaps[bi != null && bi >= 0 ? bi : db.snaps.length - 1];
      const pa = setOf(A, "fo"),
        pb = setOf(B, "fo");
      for (const i of pa) if (!pb.has(i)) L.lost.push(i);
      for (const i of pb) if (!pa.has(i)) L.gained.push(i);
    }
    L.boomerang = boomerangs()
      .map((b) => b.id)
      .filter((i) => !isHidden(i));

    cache = { key, value: L };
    return L;
  }

  /**
   * Analysis over the whole snapshot history: growth and churn per interval,
   * how long boomerangs last, and how well each month's intake stuck around.
   */
  function insights() {
    const sn = db.snaps;
    const out = {
      intervals: [],
      growth: null,
      churn: null,
      medianDaysToUnfollow: null,
      cohorts: [],
      best: null,
      worst: null,
      followerDays: 0
    };
    if (sn.length < 2) return out;

    for (let i = 1; i < sn.length; i++) {
      const A = setOf(sn[i - 1], "fo"),
        B = setOf(sn[i], "fo");
      let gained = 0,
        lost = 0;
      for (const x of B) if (!A.has(x)) gained++;
      for (const x of A) if (!B.has(x)) lost++;
      const days = Math.max(1, Math.round((sn[i].t - sn[i - 1].t) / DAY));
      out.intervals.push({
        from: sn[i - 1].t,
        to: sn[i].t,
        days,
        gained,
        lost,
        net: gained - lost,
        followers: sn[i].fo.length
      });
    }

    const first = sn[0],
      last = sn[sn.length - 1];
    const span = Math.max(1, (last.t - first.t) / DAY);
    out.followerDays = Math.round(span);
    out.growth = {
      total: last.fo.length - first.fo.length,
      perDay: (last.fo.length - first.fo.length) / span,
      perMonth: ((last.fo.length - first.fo.length) / span) * 30
    };

    const lostTotal = out.intervals.reduce((a, b) => a + b.lost, 0);
    const gainedTotal = out.intervals.reduce((a, b) => a + b.gained, 0);
    out.churn = {
      lost: lostTotal,
      gained: gainedTotal,
      ratePerMonth: (lostTotal / span) * 30,
      share: first.fo.length ? lostTotal / first.fo.length : 0
    };

    const spans = boomerangs()
      .map((b) => (b.to - b.from) / DAY)
      .sort((a, b) => a - b);
    if (spans.length) {
      const mid = Math.floor(spans.length / 2);
      out.medianDaysToUnfollow = Math.round(spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2);
    }

    // Of the followers gained in a given month, how many are still here?
    const still = setOf(last, "fo");
    const byMonth = new Map();
    for (const e of db.events) {
      if (e.k !== "gained") continue;
      const d = new Date(e.t);
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      if (!byMonth.has(k)) byMonth.set(k, { month: k, gained: 0, stillHere: 0 });
      const c = byMonth.get(k);
      c.gained++;
      if (still.has(e.id)) c.stillHere++;
    }
    out.cohorts = Array.from(byMonth.values())
      .map((c) => Object.assign(c, { retention: c.gained ? c.stillHere / c.gained : 0 }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));

    const ranked = out.intervals.slice().sort((a, b) => b.net - a.net);
    out.best = ranked[0] || null;
    out.worst = ranked[ranked.length - 1] || null;
    return out;
  }

  function toggle(listName, i) {
    const arr = db.meta[listName];
    const at = arr.indexOf(i);
    if (at > -1) arr.splice(at, 1);
    else arr.push(i);
    bump();
    return OK();
  }
  /** Set or clear a flag for several accounts at once. */
  function setFlag(listName, ids, on) {
    const arr = new Set(db.meta[listName]);
    for (const i of ids) on ? arr.add(i) : arr.delete(i);
    db.meta[listName] = Array.from(arr);
    // The hide buckets are mutually exclusive.
    if (on) {
      for (const other of ["ign", "snooze"]) {
        if (other === listName) continue;
        db.meta[other] = db.meta[other].filter((x) => !ids.includes(x));
      }
    }
    bump();
    return OK();
  }

  function deleteSnapshot(i) {
    if (i < 0 || i >= db.snaps.length) return { ok: false };
    db.snaps.splice(i, 1);
    replay();
    compact();
    bump();
    return OK();
  }
  function label(i, text) {
    if (!db.snaps[i]) return { ok: false };
    if (text) db.snaps[i].label = String(text).slice(0, 40);
    else delete db.snaps[i].label;
    bump();
    return OK();
  }
  /** Drop names nothing refers to any more, and renumber. */
  function compact() {
    const live = new Set();
    for (const s of db.snaps) {
      for (const k of ["fo", "fg", "pe"]) for (const i of s[k] || []) live.add(i);
      if (s.x) for (const k of Object.keys(s.x)) for (const i of s.x[k]) live.add(i);
    }
    for (const e of db.events) live.add(e.id);
    for (const k of ["ign", "done", "snooze"]) for (const i of db.meta[k]) live.add(i);
    if (live.size === db.names.length) return;
    const map = new Map();
    const names = [],
      first = {};
    db.names.forEach((n, i) => {
      if (!live.has(i)) return;
      const ni = names.length;
      map.set(i, ni);
      names.push(n);
      if (db.first[i]) first[ni] = db.first[i];
    });
    const mv = (arr) => arr.map((i) => map.get(i)).filter((i) => i !== undefined);
    db.names = names;
    db.first = first;
    for (const s of db.snaps) {
      for (const k of ["fo", "fg", "pe"]) if (s[k]) s[k] = mv(s[k]);
      if (s.x) for (const k of Object.keys(s.x)) s.x[k] = mv(s.x[k]);
    }
    db.events = db.events.filter((e) => map.has(e.id)).map((e) => Object.assign({}, e, { id: map.get(e.id) }));
    for (const k of ["ign", "done", "snooze"]) db.meta[k] = mv(db.meta[k]);
    reindex();
    bump();
  }

  const exportJson = () => JSON.stringify(db);

  /** Accept a v2 export or a v1 backup. */
  function importJson(text) {
    let j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: "not JSON" };
    }
    if (Array.isArray(j) || (j && Array.isArray(j.snaps) && !j.v)) {
      const arr = Array.isArray(j) ? j : j.snaps;
      if (!arr.every((s) => s && s.followers && s.following && s.t)) return { ok: false, reason: "bad v1 backup" };
      migrate(arr, j.meta || null);
      return { ok: true, count: db.snaps.length };
    }
    if (!j || j.v !== 2 || !Array.isArray(j.snaps) || !Array.isArray(j.names))
      return { ok: false, reason: "unrecognised backup" };
    adopt(j);
    return { ok: true, count: db.snaps.length };
  }

  function clear() {
    db = blank();
    idx = new Map();
    bump();
    return OK();
  }

  const bytes = () => serialise().length;

  return {
    add,
    lists,
    insights,
    snaps,
    latest,
    meta,
    events,
    boomerangs,
    historyOf,
    id,
    name,
    has,
    firstSeen,
    notBackCount,
    isHidden,
    toggle,
    setFlag,
    deleteSnapshot,
    label,
    compact,
    exportJson,
    importJson,
    clear,
    bytes,
    get version() {
      return version;
    },
    get raw() {
      return db;
    }
  };
}
