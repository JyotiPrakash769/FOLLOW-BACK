/**
 * Pure parsing helpers for Instagram data exports.
 * No DOM, no JSZip, no globals - everything here is unit tested.
 */

/** Path segments that are never usernames. */
export const RESERVED = new Set([
  "", "_u", "about", "accounts", "accounts_center", "ajax", "api", "archive",
  "blog", "challenge", "create", "developer", "direct", "download", "emails",
  "explore", "graphql", "help", "igtv", "legal", "locations", "login",
  "logout", "oauth", "p", "press", "privacy", "reel", "reels", "saved",
  "session", "settings", "static", "stories", "terms", "topics", "tv", "web",
  "your_activity"
]);
// Single letters such as "a" and "l" are deliberately absent: Instagram's own
// link shims live at /l/<id>, which is two segments and already rejected, and
// one-character handles do exist.

/** Instagram handles: 1-30 chars of letters, digits, dot, underscore. */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** True if `u` looks like a real profile handle rather than a route or junk. */
export function isHandle(u) {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!HANDLE.test(s)) return false;
  if (RESERVED.has(s.toLowerCase())) return false;
  if (!/[A-Za-z0-9]/.test(s)) return false; // reject "..." / "___"
  return true;
}

/**
 * Pull a handle out of an instagram.com URL.
 * Only accepts a single path segment, so /p/ABC/ and /alice/reels/ are rejected.
 */
export function handleFromHref(href) {
  if (typeof href !== "string") return null;
  const m = href.match(/instagram\.com\/([^?#\s"']*)/i);
  if (!m) return null;
  const parts = m[1].split("/").filter(Boolean);
  if (parts[0] === "_u" && parts.length === 2) return isHandle(parts[1]) ? parts[1] : null;
  if (parts.length !== 1) return null;
  return isHandle(parts[0]) ? parts[0] : null;
}

/** Which list a file inside the export belongs to, or null to ignore it. */
export function kind(path) {
  const n = String(path).split("/").pop().toLowerCase();
  if (/threads/.test(String(path).toLowerCase())) return null;
  const table = [
    [/^followers(_\d+)?\.(json|html?)$/, "followers"],
    [/^following(_\d+)?\.(json|html?)$/, "following"],
    [/^pending_follow_requests\.(json|html?)$/, "pending"],
    [/^recently_unfollowed_(profiles|accounts)\.(json|html?)$/, "unfollowed"],
    [/^blocked_(profiles|accounts)\.(json|html?)$/, "blocked"],
    [/^restricted_(profiles|accounts)\.(json|html?)$/, "restricted"],
    [/^close_friends\.(json|html?)$/, "closefriends"],
    [/^follow_requests_you.{0,3}ve_received\.(json|html?)$/, "received"],
    [/^recent_follow_requests\.(json|html?)$/, "recent"]
  ];
  for (const [re, k] of table) if (re.test(n)) return k;
  return null;
}

/** Lists that must be present before we can build a snapshot. */
export const REQUIRED = ["followers", "following"];

function toSeconds(v) {
  if (typeof v === "number" && isFinite(v) && v > 0) return v > 1e11 ? Math.floor(v / 1000) : Math.floor(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n) && n > 0) return toSeconds(n);
    const p = Date.parse(v);
    if (!isNaN(p)) return Math.floor(p / 1000);
  }
  return 0;
}

/** Parse the JSON shapes Instagram has shipped over the years. */
export function extractJson(text) {
  const out = [];
  const seen = new Set();
  const push = (u, t) => {
    if (!isHandle(u)) return;
    const k = u.toLowerCase();
    const ts = toSeconds(t);
    if (seen.has(k)) {
      if (ts) { const prev = out.find((x) => x.u.toLowerCase() === k); if (prev && !prev.t) prev.t = ts; }
      return;
    }
    seen.add(k);
    out.push({ u, t: ts });
  };

  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;

    // Newer "label_values" shape.
    if (Array.isArray(n.label_values)) {
      let u = null, t = n.timestamp;
      for (const lv of n.label_values) {
        const label = String(lv && lv.label || "").toLowerCase();
        if (/^(username|user name|account|profile)$/.test(label)) u = lv.value || handleFromHref(lv.href);
        else if (/date|time/.test(label) && !t) t = lv.value;
      }
      if (u) { push(u, t); return; }
    }

    // Classic "string_list_data" shape.
    if (Array.isArray(n.string_list_data)) {
      let first = true;
      for (const s of n.string_list_data) {
        const u = (s && s.value) || handleFromHref(s && s.href) || (first ? n.title : null);
        push(u, (s && s.timestamp) || n.timestamp);
        first = false;
      }
      return;
    }

    for (const k of Object.keys(n)) walk(n[k]);
  };

  walk(JSON.parse(text));
  return out;
}

const DATE_NEAR = /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}(?:[^<]{0,20}?\d{1,2}:\d{2}\s*[apAP]\.?[mM]\.?)?)/;

/**
 * Parse an HTML export. Only <a href="...instagram.com/..."> anchors count, so
 * navigation chrome, post links and story links no longer become fake followers.
 */
export function extractHtml(text) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']*instagram\.com\/[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const u = handleFromHref(m[1]);
    if (!u) continue;
    const k = u.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const tail = text.slice(re.lastIndex, re.lastIndex + 400);
    const d = tail.match(DATE_NEAR);
    out.push({ u, t: d ? toSeconds(d[1]) : 0 });
  }
  return out;
}

/** Dispatch on content, not on file extension - exports mislabel both ways. */
export function extract(text) {
  const t = String(text).trim();
  if (!t) return [];
  if (t[0] === "{" || t[0] === "[") {
    try { return extractJson(t); } catch (e) { /* fall through to HTML */ }
  }
  return extractHtml(text);
}
