/**
 * Snapshot storage.
 *
 * Schema v2 interns every username once into `names` and stores snapshots as
 * arrays of integer ids. A v1 snapshot repeated the full username list on every
 * upload, which exhausted the ~5MB localStorage quota after a few months of
 * weekly uploads.
 */

export const KEY = "fb_db_v2";
export const OLD_SNAPS = "fb_snaps_v1";
export const OLD_META = "fb_meta_v1";

export const EXTRA_KINDS = ["unfollowed", "blocked", "restricted", "closefriends", "received", "recent"];

function blank() {
  return {
    v: 2,
    names: [],
    first: {},
    snaps: [],
    events: [],
    meta: { ign: [], done: [], th: "", so: "az", tab: "notback", claimed: null }
  };
}

export function createStore(storage) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  let db = blank();
  let idx = new Map();

  function reindex() {
    idx = new Map();
    db.names.forEach((n, i) => idx.set(n.toLowerCase(), i));
  }

  /** Intern a username, returning its stable integer id. */
  function id(u) {
    const k = String(u).toLowerCase();
    let i = idx.get(k);
    if (i === undefined) { i = db.names.length; db.names.push(String(u)); idx.set(k, i); }
    else if (db.names[i] !== u && u) db.names[i] = String(u); // keep newest capitalisation
    return i;
  }
  const name = (i) => db.names[i] || "";
  const has = (u) => idx.has(String(u).toLowerCase());

  function read(key) {
    try { return store ? store.getItem(key) : null; } catch (e) { return null; }
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(read(KEY) || "null"); } catch (e) { raw = null; }
    if (raw && raw.v === 2) {
      db = Object.assign(blank(), raw);
      db.meta = Object.assign(blank().meta, raw.meta || {});
      reindex();
      return { migrated: false };
    }
    const migrated = migrate();
    return { migrated };
  }

  /** Convert a v1 payload (or a v1 backup) in place. */
  function migrate(v1snaps, v1meta) {
    let old = v1snaps;
    if (!old) { try { old = JSON.parse(read(OLD_SNAPS) || "null"); } catch (e) { old = null; } }
    let meta = v1meta;
    if (!meta) { try { meta = JSON.parse(read(OLD_META) || "null"); } catch (e) { meta = null; } }
    if (!Array.isArray(old) || !old.length) {
      if (meta) db.meta = Object.assign(db.meta, pickMeta(meta));
      return false;
    }
    db = blank();
    idx = new Map();
    for (const s of old) {
      if (!s || !Array.isArray(s.followers) || !Array.isArray(s.following)) continue;
      const stamps = Object.assign({}, s.dfo || {}, s.dfg || {});
      add({
        t: s.t,
        followers: s.followers.map((u) => ({ u, t: stamps[String(u).toLowerCase()] || 0 })),
        following: s.following.map((u) => ({ u, t: stamps[String(u).toLowerCase()] || 0 })),
        pending: (s.pending || []).map((u) => ({ u, t: 0 }))
      }, true);
    }
    if (meta) {
      const m = pickMeta(meta);
      m.ign = (meta.ign || []).filter(has).map(id);
      m.done = (meta.done || []).filter(has).map(id);
      db.meta = Object.assign(db.meta, m);
    }
    save();
    return true;
  }

  function pickMeta(m) {
    const o = {};
    if (typeof m.th === "string") o.th = m.th;
    if (typeof m.so === "string") o.so = m.so;
    if (typeof m.claimed === "number") o.claimed = m.claimed;
    return o;
  }

  function serialise() { return JSON.stringify(db); }

  /**
   * Persist. Returns {ok} or {ok:false, quota:true} so the caller can offer to
   * prune instead of silently losing the snapshot.
   */
  function save() {
    if (!store) return { ok: false };
    try { store.setItem(KEY, serialise()); return { ok: true }; }
    catch (e) {
      const quota = e && (e.name === "QuotaExceededError" || e.code === 22 || /quota/i.test(e.message || ""));
      return { ok: false, quota: !!quota, error: e };
    }
  }

  const snaps = () => db.snaps;
  const latest = () => db.snaps[db.snaps.length - 1] || null;
  const meta = () => db.meta;
  const events = () => db.events;
  const firstSeen = (i) => db.first[i] || 0;

  /** ids present in a snapshot list, as a Set for O(1) membership. */
  const setOf = (snap, key) => new Set(snap && snap[key] ? snap[key] : []);

  /**
   * Add a snapshot. `payload.followers/following/pending` are [{u,t}] arrays.
   * Two uploads on the same calendar day replace each other.
   */
  function add(payload, quiet) {
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
      if (payload[k] && payload[k].length) { snap.x = snap.x || {}; snap.x[k] = conv(payload[k]); }
    }

    const prev = latest();
    const sameDay = prev && new Date(prev.t).toDateString() === new Date(t).toDateString();
    if (sameDay) {
      db.events = db.events.filter((e) => e.s !== db.snaps.length - 1);
      db.snaps[db.snaps.length - 1] = snap;
    } else {
      db.snaps.push(snap);
    }
    const base = sameDay ? db.snaps[db.snaps.length - 2] : prev;
    if (base) logEvents(base, snap, db.snaps.length - 1);
    if (!quiet) return save();
    return { ok: true };
  }

  /** Record who joined and left between two snapshots. */
  function logEvents(a, b, si) {
    const pairs = [["fo", "gained", "lost"], ["fg", "followed", "unfollowed"]];
    for (const [key, up, down] of pairs) {
      const A = setOf(a, key), B = setOf(b, key);
      for (const i of B) if (!A.has(i)) db.events.push({ t: b.t, k: up, id: i, s: si });
      for (const i of A) if (!B.has(i)) db.events.push({ t: b.t, k: down, id: i, s: si });
    }
    db.events.sort((x, y) => y.t - x.t);
  }

  /** Accounts that followed, then unfollowed - the follow-for-follow pattern. */
  function boomerangs() {
    const pending = new Map();
    const out = [];
    for (const e of db.events.slice().reverse()) { // oldest first
      if (e.k === "gained") pending.set(e.id, e.t);
      else if (e.k === "lost" && pending.has(e.id)) {
        out.push({ id: e.id, from: pending.get(e.id), to: e.t });
        pending.delete(e.id);
      }
    }
    return out.sort((a, b) => b.to - a.to);
  }

  /** Derived lists for the latest snapshot, comparing snapshots `ai` and `bi`. */
  function lists(ai, bi) {
    const s = latest();
    const L = { notback: [], fans: [], mutual: [], lost: [], gained: [], pending: [], ign: [], boomerang: [] };
    for (const k of EXTRA_KINDS) L[k] = [];
    if (!s) return L;
    const ign = new Set(db.meta.ign);
    const fo = setOf(s, "fo"), fg = setOf(s, "fg");
    for (const i of fg) { if (fo.has(i)) L.mutual.push(i); else (ign.has(i) ? L.ign : L.notback).push(i); }
    for (const i of fo) if (!fg.has(i)) (ign.has(i) ? L.ign : L.fans).push(i);
    L.pending = (s.pe || []).filter((i) => !ign.has(i));
    for (const k of EXTRA_KINDS) L[k] = ((s.x && s.x[k]) || []).filter((i) => !ign.has(i));
    if (db.snaps.length > 1) {
      const A = db.snaps[ai != null && ai >= 0 ? ai : db.snaps.length - 2];
      const B = db.snaps[bi != null && bi >= 0 ? bi : db.snaps.length - 1];
      const pa = setOf(A, "fo"), pb = setOf(B, "fo");
      for (const i of pa) if (!pb.has(i)) L.lost.push(i);
      for (const i of pb) if (!pa.has(i)) L.gained.push(i);
    }
    L.boomerang = boomerangs().map((b) => b.id).filter((i) => !ign.has(i));
    return L;
  }

  function toggle(listName, i) {
    const arr = db.meta[listName];
    const at = arr.indexOf(i);
    if (at > -1) arr.splice(at, 1); else arr.push(i);
    return save();
  }
  function setFlag(listName, ids, on) {
    const arr = new Set(db.meta[listName]);
    for (const i of ids) on ? arr.add(i) : arr.delete(i);
    db.meta[listName] = Array.from(arr);
    return save();
  }

  function deleteSnapshot(i) {
    if (i < 0 || i >= db.snaps.length) return { ok: false };
    db.snaps.splice(i, 1);
    db.events = db.events.filter((e) => e.s !== i).map((e) => (e.s > i ? Object.assign({}, e, { s: e.s - 1 }) : e));
    compact();
    return save();
  }
  function label(i, text) {
    if (!db.snaps[i]) return { ok: false };
    if (text) db.snaps[i].label = String(text).slice(0, 40); else delete db.snaps[i].label;
    return save();
  }
  /** Drop the oldest snapshots - the recovery path when the quota is full. */
  function pruneOldest(n) {
    const keep = Math.max(1, db.snaps.length - n);
    const dropped = db.snaps.length - keep;
    if (dropped <= 0) return { ok: true, dropped: 0 };
    db.snaps = db.snaps.slice(-keep);
    db.events = db.events.filter((e) => e.s >= dropped).map((e) => Object.assign({}, e, { s: e.s - dropped }));
    compact();
    const r = save();
    return Object.assign({ dropped }, r);
  }

  /** Drop names no snapshot, event or flag refers to, and renumber. */
  function compact() {
    const live = new Set();
    for (const s of db.snaps) {
      for (const k of ["fo", "fg", "pe"]) for (const i of s[k] || []) live.add(i);
      if (s.x) for (const k of Object.keys(s.x)) for (const i of s.x[k]) live.add(i);
    }
    for (const e of db.events) live.add(e.id);
    for (const k of ["ign", "done"]) for (const i of db.meta[k]) live.add(i);
    if (live.size === db.names.length) return;
    const map = new Map();
    const names = [], first = {};
    db.names.forEach((n, i) => {
      if (!live.has(i)) return;
      const ni = names.length;
      map.set(i, ni); names.push(n);
      if (db.first[i]) first[ni] = db.first[i];
    });
    const mv = (arr) => arr.map((i) => map.get(i)).filter((i) => i !== undefined);
    db.names = names; db.first = first;
    for (const s of db.snaps) {
      for (const k of ["fo", "fg", "pe"]) if (s[k]) s[k] = mv(s[k]);
      if (s.x) for (const k of Object.keys(s.x)) s.x[k] = mv(s.x[k]);
    }
    db.events = db.events.filter((e) => map.has(e.id)).map((e) => Object.assign({}, e, { id: map.get(e.id) }));
    for (const k of ["ign", "done"]) db.meta[k] = mv(db.meta[k]);
    reindex();
  }

  function exportJson() { return JSON.stringify(db); }

  /** Accept a v2 export or a v1 backup. */
  function importJson(text) {
    let j;
    try { j = JSON.parse(text); } catch (e) { return { ok: false, reason: "not JSON" }; }
    if (Array.isArray(j) || (j && Array.isArray(j.snaps) && !j.v)) {
      const arr = Array.isArray(j) ? j : j.snaps;
      if (!arr.every((s) => s && s.followers && s.following && s.t)) return { ok: false, reason: "bad v1 backup" };
      migrate(arr, j.meta || null);
      return Object.assign({ ok: true, count: db.snaps.length }, save());
    }
    if (!j || j.v !== 2 || !Array.isArray(j.snaps) || !Array.isArray(j.names)) return { ok: false, reason: "unrecognised backup" };
    db = Object.assign(blank(), j);
    db.meta = Object.assign(blank().meta, j.meta || {});
    reindex();
    return Object.assign({ ok: true, count: db.snaps.length }, save());
  }

  function clear() {
    db = blank(); idx = new Map();
    try { if (store) { store.removeItem(KEY); store.removeItem(OLD_SNAPS); } } catch (e) {}
    return { ok: true };
  }

  /** Rough bytes used, for the storage meter. */
  const bytes = () => serialise().length;

  return {
    load, save, add, lists, snaps, latest, meta, events, boomerangs,
    id, name, has, firstSeen, toggle, setFlag, deleteSnapshot, label,
    pruneOldest, compact, exportJson, importJson, clear, bytes,
    get raw() { return db; }
  };
}
