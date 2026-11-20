/** Tiny static server for local testing. No dependencies. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: on Windows .pathname is "/C:/..." and every request 404s.
const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".css": "text/css"
};

createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  // normalize("/") is "\" on Windows, so test for either separator.
  const file = join(root, /^[/\\]?$/.test(p) ? "index.html" : p);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end("not found");
  }
}).listen(8080, () => console.log("http://localhost:8080"));
