// Lapland: lets the page open as an app from the home screen, and still open with no internet.
// It always asks the network first, so every update shows on the next open; the saved copy is only for offline.
const CACHE = "lapland-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "vault/content.txt"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("lapland-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const mine = url.origin === location.origin && url.pathname.startsWith(new URL("./", self.registration.scope).pathname);
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mine && !font) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  const net = isPage ? fetch(req, { cache: "no-store" }) : fetch(req);
  e.respondWith(net.then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(isPage ? "index.html" : req, copy)); }
    return res;
  }).catch(() => caches.match(isPage ? "index.html" : req, { ignoreSearch: true }).then(r => r || caches.match(req))));
});
