// Service worker: l'app funziona offline, mappa compresa (per le zone scaricate).
const VERSION = "jp27-v19";
const MAPPE = "jp27-mappe";   // zone offline, caratteri e icone della mappa: non si cancellano con gli aggiornamenti
const CDN = "jp27-cdn";       // librerie, font e foto da siti esterni
const SHELL = ["./", "index.html", "app.css", "app.js", "data.js", "photos.js", "content.js", "sync.js", "mappa-offline.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "favicon-32.png"];
const KEEP = [VERSION, MAPPE, CDN];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// risponde dalla copia salvata, anche solo un pezzo (Range): così la libreria pmtiles legge la mappa offline
async function fromBlob(req, cached) {
  const blob = await cached.blob();
  const range = req.headers.get("range");
  const m = range && /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return new Response(blob, { status: 200, headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size), "Accept-Ranges": "bytes" } });
  const start = +m[1], end = m[2] ? Math.min(+m[2], blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": "application/octet-stream", "Content-Range": `bytes ${start}-${end}/${blob.size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // mappa offline: prima la copia scaricata, altrimenti la rete (senza salvarla qui)
  if (url.origin === location.origin && url.pathname.includes("/mappe/")) {
    e.respondWith((async () => {
      const cached = await (await caches.open(MAPPE)).match(url.href);
      if (cached) return url.pathname.endsWith(".pmtiles") ? fromBlob(e.request, cached) : cached;
      return fetch(e.request);
    })());
    return;
  }

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
    e.respondWith(caches.open(CDN).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const r = await fetch(e.request); if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r;
      } catch (err) {
        // offline: per le foto usa la miniatura salvata dello stesso file, se c'è
        if (url.hostname.endsWith("wikimedia.org")) { const small = await c.match(url.href.replace(/\/\d+px-/, "/330px-")); if (small) return small; }
        throw err;
      }
    }));
  }
});
