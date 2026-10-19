// Service worker: l'app si apre subito dai file salvati (anche con rete scarsa o assente) e si aggiorna
// in sottofondo; ogni nuova versione (VERSION) viene scaricata intera e poi compare l'avviso "Aggiorna".
const VERSION = "jp27-v45";
const MAPPE = "jp27-mappe";   // zone offline, caratteri e icone della mappa: non si cancellano con gli aggiornamenti
const CDN = "jp27-cdn";       // librerie, font e foto da siti esterni
const SHELL = ["./", "index.html", "app.css", "app.js", "data.js", "photos.js", "content.js", "sync.js", "mappa-offline.js", "icons.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "favicon-32.png", "fonts/jakarta-latin.woff2", "fonts/jakarta-latin-ext.woff2"];
const KEEP = [VERSION, MAPPE, CDN];

self.addEventListener("install", e => {
  // cache: "reload" = salta la cache HTTP del browser, così la nuova versione è davvero nuova
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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

// notifiche: le manda il servizio notifiche (Cloudflare); toccandole si apre l'app sulla pagina giusta
self.addEventListener("push", e => {
  let m = {}; try { m = e.data.json(); } catch { m = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Giappone 2027", { body: m.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: m.tag, data: { url: m.url || "" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const go = e.notification.data?.url || "";
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if ("focus" in c) { await c.focus(); c.postMessage({ goto: go }); return; }
    }
    await self.clients.openWindow(new URL("./" + go, self.registration.scope).href);
  })());
});

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

  // file dell'app: subito dalla copia salvata (l'app si apre anche con rete lenta o assente),
  // intanto si controlla la rete in sottofondo e si aggiorna la copia
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const nav = e.request.mode === "navigate";
      const cached = (await cache.match(e.request, { ignoreSearch: true })) || (nav ? await cache.match("index.html") : null);
      const network = fetch(e.request, { cache: "no-cache" }).then(r => { if (r.ok) cache.put(nav ? "index.html" : e.request, r.clone()); return r; });
      if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
      try { return await network; } catch (err) { const idx = nav && await cache.match("index.html"); if (idx) return idx; throw err; }
    })());
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
