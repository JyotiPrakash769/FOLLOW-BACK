import { kind, extract } from "./parse.js";
import { EXTRA_KINDS } from "./store.js";

export const ALL_KINDS = ["followers", "following", "pending"].concat(EXTRA_KINDS);

/**
 * Turn dropped files (a ZIP, or loose JSON/HTML) into a snapshot payload.
 * `Zip` is injected so this stays testable and so the worker and the
 * main-thread fallback share one implementation.
 */
export async function gather(files, Zip, onProgress) {
  const jobs = [];
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
        if (k) jobs.push({ k, name: nm, read: () => entry.async("string") });
      }
    } else {
      const k = kind(f.name);
      if (k) jobs.push({ k, name: f.name, read: () => f.text() });
    }
  }

  const payload = {};
  const index = {};
  for (const k of ALL_KINDS) { payload[k] = []; index[k] = new Map(); }
  const used = [];

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    if (onProgress) onProgress({ done: i, total: jobs.length, name: j.name });
    const rows = extract(await j.read());
    if (!rows.length) continue;
    used.push(j.name);
    const seen = index[j.k], list = payload[j.k];
    for (const r of rows) {
      const key = r.u.toLowerCase();
      const at = seen.get(key);
      if (at === undefined) { seen.set(key, list.length); list.push(r); }
      else if (r.t && (!list[at].t || r.t < list[at].t)) list[at].t = r.t;
    }
  }
  if (onProgress) onProgress({ done: jobs.length, total: jobs.length, name: "" });

  const counts = {};
  for (const k of ALL_KINDS) counts[k] = payload[k].length;
  return { payload, counts, files: used, considered: jobs.map((j) => j.name) };
}
