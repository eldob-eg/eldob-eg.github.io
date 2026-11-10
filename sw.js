// El-Dob: lets the site open as an app and load fast. Always tries the network first,
// so edits from the admin panel show right away; the saved copy is only used offline.
const CACHE = "eldob-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // never touch the admin panel, other sites, or anything that isn't a plain GET
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("admin.html") || url.pathname.includes("admin-vault")) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && (req.mode === "navigate" || SHELL.some(s => url.pathname.endsWith(s.replace("./", ""))) || url.pathname.includes("/uploads/") || url.pathname.includes("/img/"))) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
