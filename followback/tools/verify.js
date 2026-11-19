/** Post-build guards. These are the invariants the README promises. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
ok(!!script, "no inline script found in index.html");

ok(!/https?:\/\/(?!www\.instagram\.com|www\.w3\.org)/.test(html.replace(/<script>[\s\S]*<\/script>/, "")),
  "index.html markup references an external origin");
ok(!/cdnjs|unpkg|jsdelivr|googleapis/i.test(html), "index.html references a CDN");
ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+EventSource|new\s+WebSocket/.test(script || ""),
  "app script contains network calls");
ok(/connect-src 'none'/.test(html), "CSP is missing connect-src 'none'");
ok(/<script\s+src=/i.test(html) === false, "index.html loads an external script file");

if (script) {
  const want = "sha256-" + createHash("sha256").update(script, "utf8").digest("base64");
  const got = (html.match(/script-src '([^']+)'/) || [])[1];
  ok(want === got, "CSP script hash does not match the inline script (run npm run build)");
}
ok(!/^\s*(import|export)\s/m.test(script || ""), "module syntax leaked into the bundle");

if (fails.length) { console.error("verify failed:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("verify: " + 8 + " invariants hold (no network, strict CSP, hash in sync)");
