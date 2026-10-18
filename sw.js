// Service worker: l'app funziona offline (mappa e meteo esclusi).
const VERSION = "jp27-v5";
const SHELL = ["./", "index.html", "app.css", "app.js", "data.js", "photos.js", "content.js", "sync.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "favicon-32.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // file dell'app: rete prima (così gli aggiornamenti arrivano subito), cache se offline
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request, { cache: "no-cache" }).then(r => {
        const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // font, icone, librerie e foto: cache prima (così funzionano offline)
  if (["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "www.gstatic.com", "upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)) {
    e.respondWith(caches.open(VERSION + "-fonts").then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request); if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r;
    }));
  }
});
