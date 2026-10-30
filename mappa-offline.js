// Mappa offline: MapLibre + OpenStreetMap (Protomaps), con zone scaricabili sul telefono.
// I file .pmtiles stanno in mappe/ sul sito; quando una zona è scaricata il service worker
// li serve dalla cache (anche a pezzi, con le richieste Range), quindi la mappa va senza rete.
(() => {
  "use strict";
  const CACHE = "jp27-mappe";
  const base = new URL("./", location.href).href;
  const abs = p => new URL(p, base).href;

  const ZONE = [
    { id: "giappone", nome: "Giappone intero (panoramica)", file: "mappe/giappone.pmtiles", mb: 9.9, base: true },
    { id: "tokyo", nome: "Tokyo e Kamakura", file: "mappe/tokyo.pmtiles", mb: 82 },
    { id: "kansai", nome: "Kyoto, Osaka e Nara", file: "mappe/kansai.pmtiles", mb: 47 },
    { id: "fuji", nome: "Monte Fuji e Hakone", file: "mappe/fuji.pmtiles", mb: 6.2 },
    { id: "nikko", nome: "Nikko", file: "mappe/nikko.pmtiles", mb: 2.3 },
  ];
  const LIBS = [
    "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js",
    "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css",
    "https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js",
    "https://cdn.jsdelivr.net/npm/@protomaps/basemaps@5.7.2/dist/basemaps.js",
  ];
  const FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
  const RANGES = ["0-255", "256-511", "512-767", "1024-1279", "8192-8447"];
  const ASSETS = [
    ...FONTS.flatMap(f => RANGES.map(r => `mappe/fonts/${encodeURIComponent(f)}/${r}.pbf`)),
    ...["light", "dark"].flatMap(fl => ["", "@2x"].flatMap(s => [`mappe/sprites/${fl}${s}.json`, `mappe/sprites/${fl}${s}.png`])),
  ];

  // ——— zone scaricate ———
  async function isDownloaded(z) { try { return !!(await (await caches.open(CACHE)).match(abs(z.file))); } catch { return false; } }
  async function status() { const out = {}; for (const z of ZONE) out[z.id] = await isDownloaded(z); return out; }
  async function usedMB() { try { const e = await navigator.storage?.estimate?.(); return e ? Math.round(e.usage / 1048576) : null; } catch { return null; } }

  // scarica con avanzamento; insieme alla prima zona salva anche librerie, caratteri e icone
  async function download(z, onProgress) {
    try { await navigator.storage?.persist?.(); } catch {}
    const cache = await caches.open(CACHE);
    for (const u of LIBS) { try { await fetch(u, { mode: "cors" }); } catch {} }   // le salva il service worker (cache CDN)
    for (const a of ASSETS) { if (!(await cache.match(abs(a)))) { const r = await fetch(abs(a)); if (r.ok) await cache.put(abs(a), r); } }
    const todo = z.base ? [z] : [ZONE[0], z].filter((x, i, arr) => arr.indexOf(x) === i);
    for (const zz of todo) {
      if (await cache.match(abs(zz.file))) continue;
      const res = await fetch(abs(zz.file), { cache: "no-store" });
      if (!res.ok || !res.body) throw new Error("download " + res.status);
      const total = +res.headers.get("content-length") || zz.mb * 1048576;
      const reader = res.body.getReader(), parts = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        parts.push(value); got += value.length;
        if (zz === z) onProgress?.(Math.min(1, got / total));
      }
      const blob = new Blob(parts, { type: "application/octet-stream" });
      await cache.put(abs(zz.file), new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size) } }));
    }
    onProgress?.(1);
  }
  // all'avvio (con la rete): salva librerie, caratteri e icone, così la mappa offline parte sempre
  async function warmup() {
    const cache = await caches.open(CACHE);
    for (const u of LIBS) { try { await fetch(u, { mode: "cors" }); } catch {} }
    for (const a of ASSETS) { if (!(await cache.match(abs(a)))) { try { const r = await fetch(abs(a)); if (r.ok) await cache.put(abs(a), r); } catch {} } }
  }
  async function remove(z) { const cache = await caches.open(CACHE); await cache.delete(abs(z.file)); }

  // ——— librerie (caricate solo quando serve la mappa offline) ———
  let libsP = null;
  function loadLibs() {
    if (libsP) return libsP;
    const load = u => new Promise((res, rej) => {
      if (u.endsWith(".css")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = u; l.onload = res; l.onerror = rej; document.head.appendChild(l); return; }
      const s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    libsP = Promise.all(LIBS.map(load)).catch(e => { libsP = null; throw e; });
    return libsP;
  }

  // ——— protocollo "jp://": un'unica sorgente che pesca il tile dall'archivio giusto ———
  let archives = null, protoAdded = false;
  async function getArchives() {
    if (archives) return archives;
    archives = await Promise.all(ZONE.map(async z => {
      const a = new pmtiles.PMTiles(abs(z.file));
      try { const h = await a.getHeader(); return { z, a, b: [h.minLon, h.minLat, h.maxLon, h.maxLat], mz: h.maxZoom }; } catch { return { z, a, b: null }; }
    }));
    return archives;
  }
  const tileBounds = (z, x, y) => {
    const n = 2 ** z, lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
    return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
  };
  const overlap = (a, b) => a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  function addProtocol() {
    if (protoAdded) return; protoAdded = true;
    maplibregl.addProtocol("jp", async params => {
      const [z, x, y] = params.url.replace("jp://", "").split("/").map(Number);
      const tb = tileBounds(z, x, y), list = await getArchives();
      const order = z <= 8 ? list : [...list.slice(1), list[0]];
      for (const it of order) {
        if (it.b && !overlap(it.b, tb)) continue;
        try { const r = await it.a.getZxy(z, x, y, params.signal); if (r?.data) return { data: new Uint8Array(r.data) }; } catch {}
      }
      return { data: new Uint8Array(0) };
    });
  }

  function style(dark) {
    const flavor = { ...basemaps.namedFlavor(dark ? "dark" : "light") };
    Object.assign(flavor, dark
      ? { background: "#1b1916", earth: "#1b1916", water: "#0d1820" }
      : { background: "#f2ede4", earth: "#f2ede4", water: "#b9d2dc" });
    return {
      version: 8,
      glyphs: abs("mappe/fonts/") + "{fontstack}/{range}.pbf",
      sprite: abs("mappe/sprites/" + (dark ? "dark" : "light")),
      sources: { protomaps: { type: "vector", tiles: ["jp://{z}/{x}/{y}"], maxzoom: 15, attribution: "© OpenStreetMap" } },
      layers: clean(basemaps.layers("protomaps", flavor, { lang: "en" }), dark),
    };
  }
  // come la mappa Google: via numeri delle strade, sensi unici, numeri civici e punti che non c'entrano (scuole, negozi…);
  // restano stazioni, aeroporti, traghetti, fermate dei bus e natura. I binari, sottili e tratteggiati, diventano ben visibili
  const POI_KEEP = ["station", "aerodrome", "ferry_terminal", "bus_stop", "park", "garden", "zoo", "peak", "beach"];
  function clean(layers, dark) {
    return layers.filter(l => !["roads_shields", "roads_oneway", "address_label"].includes(l.id)).map(l => {
      if (l.id === "pois") return { ...l, filter: ["all", ["in", ["get", "kind"], ["literal", POI_KEEP]], ...l.filter.slice(2)] };
      if (l.id === "roads_rail") return { ...l, paint: { "line-color": dark ? "#6f6658" : "#9a8c78", "line-opacity": .9,
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 5, .4, 10, 1.2, 14, 2.2, 18, 5] } };
      return l;
    });
  }

  async function create(el, { dark, center, zoom }) {
    await loadLibs(); addProtocol();
    const map = new maplibregl.Map({
      container: el, style: style(dark), center, zoom, maxZoom: 18,
      attributionControl: { compact: true }, localIdeographFontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
      dragRotate: false, pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    return map;
  }
  const setTheme = (map, dark) => map.setStyle(style(dark), { diff: false });

  const reset = () => { archives = null; };
  // c'è una zona scaricata (con le strade) che copre questo punto? E fino a che zoom arriva la panoramica?
  async function covers([lng, lat]) {
    const st = await status(), list = await getArchives();
    const ok = list.some(it => !it.z.base && st[it.z.id] && it.b && lng >= it.b[0] && lng <= it.b[2] && lat >= it.b[1] && lat <= it.b[3]);
    return { ok, baseMax: list.find(it => it.z.base)?.mz ?? 6 };
  }
  window.OfflineMap = { ZONE, status, usedMB, download, remove, create, setTheme, loadLibs, reset, warmup, covers };
})();
