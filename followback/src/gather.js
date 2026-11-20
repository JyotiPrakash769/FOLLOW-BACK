import { kind, extractDetailed } from "./parse.js";
import { EXTRA_KINDS } from "./store.js";

const DAY_MS = 86400000;
const SANE_FROM = Date.UTC(2010, 0, 1); // Instagram launched in 2010

export const ALL_KINDS = ["followers", "following", "pending"].concat(EXTRA_KINDS);

/**
 * Turn dropped files (a ZIP, or loose JSON/HTML) into a snapshot payload.
 * `Zip` is injected so this stays testable and so the worker and the
 * main-thread fallback share one implementation.
 */
export async function gather(files, Zip, onProgress) {
  const jobs = [];
  // When the export was made: the newest file date inside the ZIP (Instagram
  // stamps them when it builds the export), else the files' own dates.
  let exportedAt = 0;
  const seenDate = (d) => {
    const ms = d instanceof Date ? d.getTime() : Number(d) || 0;
    // ZIP dates default to 1980 when unset; ignore anything implausible.
    if (ms > SANE_FROM && ms <= Date.now() + DAY_MS && ms > exportedAt) exportedAt = ms;
  };
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      if (!Zip) throw new Error("ZIP support unavailable");
      // Hand JSZip an ArrayBuffer rather than the Blob: it skips JSZip's
      // FileReader path, and it means this runs under Node in the tests too.
      const z = await Zip.loadAsync(f.arrayBuffer ? await f.arrayBuffer() : f);
      for (const nm of Object.keys(z.files)) {
        const entry = z.files[nm];
        if (entry.dir) continue;
        const k = kind(nm);
        if (k) {
          seenDate(entry.date);
          jobs.push({ k, name: nm, read: () => entry.async("string") });
        }
      }
    } else {
      const k = kind(f.name);
      if (k) {
        seenDate(f.lastModified);
        jobs.push({ k, name: f.name, read: () => f.text() });
      }
    }
  }
  if (!exportedAt) for (const f of files) seenDate(f.lastModified);

  const payload = {};
  const index = {};
  for (const k of ALL_KINDS) {
    payload[k] = [];
    index[k] = new Map();
  }
  const used = [];

  let htmlFiles = 0,
    htmlWithDates = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    if (onProgress) onProgress({ done: i, total: jobs.length, name: j.name });
    const { rows, format } = extractDetailed(await j.read());
    if (!rows.length) continue;
    if (format === "html") {
      htmlFiles++;
      if (rows.some((r) => r.t)) htmlWithDates++;
    }
    used.push(j.name);
    const seen = index[j.k],
      list = payload[j.k];
    for (const r of rows) {
      const key = r.u.toLowerCase();
      const at = seen.get(key);
      if (at === undefined) {
        seen.set(key, list.length);
        list.push(r);
      } else if (r.t && (!list[at].t || r.t < list[at].t)) list[at].t = r.t;
    }
  }
  if (onProgress) onProgress({ done: jobs.length, total: jobs.length, name: "" });

  const counts = {};
  for (const k of ALL_KINDS) counts[k] = payload[k].length;
  return {
    payload,
    counts,
    files: used,
    considered: jobs.map((j) => j.name),
    exportedAt: exportedAt || Date.now(),
    // An HTML export whose dates could not be read at all: usually a language
    // whose month names are not recognised. JSON always carries real timestamps.
    warnings: { htmlNoDates: htmlFiles > 0 && htmlWithDates === 0 }
  };
}
