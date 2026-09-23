// Sousedský Halloween – minimální service worker (umožní instalaci na plochu).
// Data se vždy berou ze sítě; offline se zobrazí jen naposledy uložená stránka.
const CACHE = "hw-shell-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./"]).catch(() => {}))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return;
  e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put("./", c)); return res; }).catch(() => caches.match("./")));
});
