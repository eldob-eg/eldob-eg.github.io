// El-Dob: lets the site open as an app and load fast. Always tries the network first,
// so edits from the admin panel show right away; the saved copy is only used offline.
const CACHE = "eldob-v5";
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
  // pages always ask the server for the newest version (skips the browser's 10-minute page cache)
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  // pages skip GitHub's 10-minute copy too (a unique address each time), so a new version shows on the next open
  const fresh = new URL(url.href); fresh.searchParams.set("_", Date.now());
  const net = isPage ? fetch(fresh.href, {cache: "no-store", credentials: "same-origin"}) : fetch(req);
  e.respondWith(
    net.then(res => {
      if (res.ok && (req.mode === "navigate" || SHELL.some(s => url.pathname.endsWith(s.replace("./", ""))) || url.pathname.includes("/uploads/") || url.pathname.includes("/img/"))) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
