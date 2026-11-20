/** Post-build guards. These are the invariants the README promises. */
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const fails = [];
const ok = (cond, msg) => {
  if (!cond) fails.push(msg);
};
let checks = 0;
const check = (cond, msg) => {
  checks++;
  ok(cond, msg);
};

/* ---- no network, strict CSP ---- */
const html = read("index.html");
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
check(!!script, "no inline script found in index.html");

const markup = html.replace(/<script>[\s\S]*<\/script>/, "");
check(
  !/https?:\/\/(?!www\.instagram\.com|www\.w3\.org)/.test(markup),
  "index.html markup references an external origin"
);
check(
  !/cdnjs|unpkg|jsdelivr|googleapis|googletagmanager|google-analytics/i.test(html),
  "index.html references a CDN or analytics host"
);
check(
  !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+EventSource|new\s+WebSocket|import\s*\(/.test(script || ""),
  "app script contains a network call or dynamic import"
);
check(/connect-src 'none'/.test(html), "CSP is missing connect-src 'none'");
check(!/<script\s+src=/i.test(html), "index.html loads an external script file");
check(!/^\s*(import|export)\s/m.test(script || ""), "module syntax leaked into the bundle");

if (script) {
  const want = "sha256-" + createHash("sha256").update(script, "utf8").digest("base64");
  const got = (html.match(/script-src '([^']+)'/) || [])[1];
  check(want === got, "CSP script hash does not match the inline script (run npm run build)");

  /* ---- Netlify _headers carries the same policy ---- */
  const hdrPath = join(root, "_headers");
  check(existsSync(hdrPath), "_headers is missing (run npm run build)");
  if (existsSync(hdrPath)) {
    const hdr = readFileSync(hdrPath, "utf8");
    check(hdr.includes("script-src '" + want + "'"), "_headers CSP hash is stale (run npm run build)");
    check(/frame-ancestors 'none'/.test(hdr), "_headers does not forbid framing");
    check(/X-Content-Type-Options: nosniff/.test(hdr), "_headers is missing nosniff");
    check(!/^\/sw\.js|^\/\*\s*\n\s*Content-Security-Policy/m.test(hdr), "_headers puts the page CSP on sw.js");
  }
}

/* ---- worker is also network-free ---- */
const worker = read("worker.js");
check(!/cdnjs|unpkg|jsdelivr|importScripts\s*\(\s*["']https?/.test(worker), "worker.js fetches code from the network");

/* ---- both bundles compile ----
 * The build concatenates modules into one scope, so two modules declaring the
 * same top-level name pass every unit test and still break the page at parse
 * time. Compiling (not running) the bundles catches that. */
const compiles = (src, name) => {
  try {
    new Script(src, { filename: name });
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const scriptErr = compiles(script || "", "index.html <script>");
check(!scriptErr, "index.html script does not compile: " + scriptErr);
const workerErr = compiles(worker, "worker.js");
check(!workerErr, "worker.js does not compile: " + workerErr);

/* ---- service worker precache matches the files on disk ---- */
const sw = read("sw.js");
const shellMatch = sw.match(/SHELL\s*=\s*\[([^\]]*)\]/);
check(!!shellMatch, "sw.js has no SHELL precache list");
if (shellMatch) {
  const files = shellMatch[1]
    .match(/"([^"]+)"/g)
    .map((s) => s.slice(1, -1))
    .filter((f) => f !== "./");
  for (const f of files) check(existsSync(join(root, f)), "sw.js precaches '" + f + "' which is not on disk");
  // and every shipped top-level asset should be precached, or offline install is partial
  for (const f of ["index.html", "worker.js", "icon.svg", "manifest.webmanifest"]) {
    check(
      files.includes("./" + f) || files.includes(f),
      "sw.js does not precache " + f + " (offline install would be incomplete)"
    );
  }
}

/* ---- manifest is valid and installable ---- */
let manifest = null;
try {
  manifest = JSON.parse(read("manifest.webmanifest"));
} catch (e) {
  fails.push("manifest.webmanifest is not valid JSON: " + e.message);
}
if (manifest) {
  for (const field of ["name", "start_url", "display", "icons"])
    check(field in manifest, "manifest is missing required field '" + field + "'");
  check(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest has no icons");
  for (const icon of manifest.icons || [])
    check(existsSync(join(root, icon.src.replace(/^\.\//, ""))), "manifest icon '" + icon.src + "' is not on disk");
  check(
    ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
    "manifest display mode is not installable"
  );
}

/* ---- size budget: a regression that doubles the page should fail the build ---- */
const BUDGET_KB = 320;
const kb = statSync(join(root, "index.html")).size / 1024;
check(kb <= BUDGET_KB, "index.html is " + kb.toFixed(0) + " KB, over the " + BUDGET_KB + " KB budget");

if (fails.length) {
  console.error("verify failed:\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log(
  "verify: " +
    checks +
    " invariants hold (no network, strict CSP, SW precache, manifest, size " +
    kb.toFixed(0) +
    "/" +
    BUDGET_KB +
    " KB)"
);
