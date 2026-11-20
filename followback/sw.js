/* FOLLOW/BACK service worker: keeps the app shell cached so the page opens offline.
   Network first, cache as the offline fallback, so every deploy shows up on the next
   load instead of being masked by an old cached copy. It never caches anything from
   another origin, because the app never talks to one. It stores app files only, never
   your Instagram data. */
var CACHE = "followback-v5";
// A file shared to the installed app waits here until the page picks it up,
// then the page deletes it. Must match SHARE_INBOX in src/ui.js.
var INBOX = "followback-share-inbox";
var SHELL = ["./", "./index.html", "./worker.js", "./icon.svg", "./manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== INBOX; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Android share sheet -> manifest share_target -> POST here. */
function takeShare(req) {
  return req.formData().then(function (form) {
    var files = form.getAll("files").filter(function (f) { return f && typeof f !== "string"; });
    return caches.delete(INBOX).then(function () { return caches.open(INBOX); }).then(function (c) {
      return Promise.all(files.map(function (f, i) {
        return c.put("./share-inbox/" + i, new Response(f, { headers: {
          "content-type": f.type || "application/octet-stream",
          "x-name": encodeURIComponent(f.name || "shared.zip"),
          "x-modified": String(f.lastModified || Date.now())
        } }));
      }));
    });
  }).then(function () {
    return Response.redirect(new URL("./?share=1", self.location.href).href, 303);
  }, function () {
    return Response.redirect(new URL("./", self.location.href).href, 303);
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method === "POST" && url.origin === self.location.origin && url.pathname.slice(-13) === "/share-target") {
    e.respondWith(takeShare(req));
    return;
  }
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
