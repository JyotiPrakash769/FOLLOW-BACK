/**
 * Pure parsing helpers for Instagram data exports.
 * No DOM, no JSZip, no globals - everything here is unit tested.
 */

/** Path segments that are never usernames. */
export const RESERVED = new Set([
  "",
  "_u",
  "about",
  "accounts",
  "accounts_center",
  "ajax",
  "api",
  "archive",
  "blog",
  "challenge",
  "create",
  "developer",
  "direct",
  "download",
  "emails",
  "explore",
  "graphql",
  "help",
  "igtv",
  "legal",
  "locations",
  "login",
  "logout",
  "oauth",
  "p",
  "press",
  "privacy",
  "reel",
  "reels",
  "saved",
  "session",
  "settings",
  "static",
  "stories",
  "terms",
  "topics",
  "tv",
  "web",
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
  for (const [re, k] of table) if (/** @type {RegExp} */ (re).test(n)) return k;
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
      if (ts) {
        const prev = out.find((x) => x.u.toLowerCase() === k);
        if (prev && !prev.t) prev.t = ts;
      }
      return;
    }
    seen.add(k);
    out.push({ u, t: ts });
  };

  const walk = (n) => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!n || typeof n !== "object") return;

    // Newer "label_values" shape.
    if (Array.isArray(n.label_values)) {
      let u = null,
        t = n.timestamp;
      for (const lv of n.label_values) {
        const label = String((lv && lv.label) || "").toLowerCase();
        if (/^(username|user name|account|profile)$/.test(label)) u = lv.value || handleFromHref(lv.href);
        else if (/date|time/.test(label) && !t) t = lv.value;
      }
      if (u) {
        push(u, t);
        return;
      }
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

/**
 * Instagram writes HTML exports in the account's own language, so the month
 * name may be in any of these. The lookup is built on first use only, because
 * JSON exports carry numeric timestamps and never need it.
 */
export const DATE_LOCALES = [
  "en",
  "hi",
  "bn",
  "or",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
  "ur",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "id",
  "ms",
  "vi",
  "th",
  "ja",
  "ko",
  "zh",
  "ar",
  "fa",
  "he"
];

let MONTHS = null;
const clean = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[.\u200e\u200f]/g, "")
    .trim();

function monthTable() {
  if (MONTHS) return MONTHS;
  MONTHS = new Map();
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return MONTHS;
  const probe = Array.from({ length: 12 }, (_, m) => Date.UTC(2021, m, 15));
  for (const loc of DATE_LOCALES) {
    for (const month of /** @type {("short"|"long")[]} */ (["short", "long"])) {
      let fmt;
      try {
        fmt = new Intl.DateTimeFormat(loc, { month, timeZone: "UTC" });
      } catch (e) {
        continue;
      }
      probe.forEach((ms, i) => {
        const nameStr = clean(fmt.format(ms));
        if (nameStr && !MONTHS.has(nameStr)) MONTHS.set(nameStr, i);
      });
    }
  }
  return MONTHS;
}

/** Month index for a localised month name, or null. */
export function monthIndex(token) {
  const t = clean(token);
  // A bare number is never a month name. Without this guard the token "12"
  // prefix-matches the Chinese and Japanese month name "12月" and every
  // localised date came back as December.
  if (!t || !/\p{L}/u.test(t)) return null;
  const table = monthTable();
  if (table.has(t)) return table.get(t);
  if (t.length < 3) return null;
  // Some locales abbreviate differently from Intl; match on a prefix.
  for (const [k, v] of table) if (k.length >= 3 && (t.startsWith(k) || k.startsWith(t))) return v;
  return null;
}

/** Arabic-Indic and Devanagari digits to ASCII, so native numerals parse. */
export function normalizeDigits(text) {
  return String(text).replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u0b66-\u0b6f\u0be6-\u0bef]/g, (c) => {
    const cp = c.codePointAt(0);
    return String(
      (cp -
        (cp >= 0x0b66 ? (cp >= 0x0be6 ? 0x0be6 : 0x0b66) : cp >= 0x0966 ? 0x0966 : cp >= 0x06f0 ? 0x06f0 : 0x0660)) %
        10
    );
  });
}

const TIME = /\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?/i;

/**
 * Parse a date out of an export, in any of the supported languages.
 * Returns unix seconds, or 0 when nothing usable is there.
 */
export function parseDate(input) {
  const raw = normalizeDigits(String(input || "").trim());
  if (!raw) return 0;

  // A strict ISO datetime is the one case worth handing to the native parser.
  // For everything else Date.parse is too lenient - it reads "just 2024", and
  // guesses month-first on ambiguous "03/04/2024" - so the structured paths
  // below do the work and leave genuinely ambiguous input unparsed.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const iso = Date.parse(raw);
    if (!isNaN(iso)) return Math.floor(iso / 1000);
  }

  const body = raw.replace(TIME, " ").replace(/\s+/g, " ").trim();

  // Year first, with any separator: 2024-03-02, 2024/03/02, 2024年11月12日,
  // "2024. 11. 12."
  let m = body.match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return localMidnight(+m[1], +m[2] - 1, +m[3]);

  // Unambiguous day-first numeric: 25/12/2024. A first field of 12 or less is
  // ambiguous with the US order, so it is left alone rather than guessed.
  m = body.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m && +m[1] > 12 && +m[2] <= 12) return localMidnight(+m[3], +m[2] - 1, +m[1]);

  // A month name in any supported language, with the day and year anywhere
  // around it: "Nov 12, 2024", "12 November 2024", "25 de diciembre de 2024".
  const words = body.match(/([^\s,\u060c]+)/g) || [];
  const mi = words.map(monthIndex).findIndex((x) => x !== null);
  if (mi > -1) {
    const nums = (body.match(/\d+/g) || []).map(Number);
    const nextYear = new Date().getFullYear() + 1;
    const year = nums.find((n) => n >= MIN_YEAR && n <= nextYear);
    const day = nums.find((n) => n >= 1 && n <= 31 && n !== year);
    if (year && day) return localMidnight(year, monthIndex(words[mi]), day);
  }
  return 0;
}

/**
 * HTML exports carry no timezone, so a bare date is taken as local midnight -
 * the same reading Date.parse gives "Nov 12, 2024", and the one that displays
 * back as the expected day via toLocaleDateString.
 *
 * Years are clamped to a sane window: Instagram launched in 2010, so a parsed
 * year of 1212 (a stray number mistaken for a year) is a misparse, not a date.
 * Returning 0 keeps the "timestamp is a non-negative number" contract.
 */
const MIN_YEAR = 2000;
const localMidnight = (y, mo, d) => {
  if (y < MIN_YEAR || y > new Date().getFullYear() + 1) return 0;
  const ms = new Date(y, mo, d).getTime();
  return isNaN(ms) || ms < 0 ? 0 : Math.floor(ms / 1000);
};

/**
 * Locate the first thing that looks like a date inside a run of text, so a
 * whole date is handed to parseDate rather than a blob of surrounding markup.
 */
const DATE_CANDIDATE = new RegExp(
  "(\\d{4}\\s*[^\\d\\s]{0,2}\\s*\\d{1,2}\\s*[^\\d\\s]{0,2}\\s*\\d{1,2})" + // 2024-03-02, 2024年11月12日
    "|(\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4})" + // 25/12/2024
    "|([\\p{L}]{3,}\\.?\\s+\\d{1,2},?\\s+\\d{4})" + // Nov 12, 2024
    "|(\\d{1,2}(?:\\s+[\\p{L}.]+){1,3}\\s+\\d{4})", // 25 de diciembre de 2024
  "u"
);

export function findDate(text) {
  const m = normalizeDigits(String(text)).match(DATE_CANDIDATE);
  return m ? parseDate(m[0]) : 0;
}

/**
 * Parse an HTML export. Only <a href="...instagram.com/..."> anchors count, so
 * navigation chrome, post links and story links no longer become fake followers.
 *
 * HTML exports have no timezone, so dates here are day-resolution: the time of
 * day is discarded and the date is taken as local midnight.
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
    // Dates sit in the markup beside the link; strip tags before parsing.
    const tail = text.slice(re.lastIndex, re.lastIndex + 300).replace(/<[^>]*>/g, " ");
    out.push({ u, t: findDate(tail) });
  }
  return out;
}

/**
 * Dispatch on content, not on file extension - exports mislabel both ways.
 * Returns the rows plus which format was recognised, so callers can tell the
 * user when an HTML export yielded no usable dates.
 */
export function extractDetailed(text) {
  const t = String(text).trim();
  if (!t) return { rows: [], format: "empty" };
  if (t[0] === "{" || t[0] === "[") {
    try {
      return { rows: extractJson(t), format: "json" };
    } catch (e) {
      /* fall through */
    }
  }
  return { rows: extractHtml(text), format: "html" };
}

export function extract(text) {
  return extractDetailed(text).rows;
}
