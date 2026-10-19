(() => {
  "use strict";

  // ——— storage (protetto: in privato o con dati bloccati può fallire) ———
  let dataVer = 0;
  const UI_KEYS = new Set(["selDay", "lview", "mapMode", "notifyQ", "skipCode"]);   // solo preferenze di navigazione: non cambiano le pagine   // cresce a ogni modifica salvata: le pagine tenute in memoria più vecchie si ricostruiscono
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("jp27:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { if (!UI_KEYS.has(k)) dataVer++; try { localStorage.setItem("jp27:" + k, JSON.stringify(v)); } catch {} },
  };

  const APP_VERSION = 69;   // aggiornare insieme a VERSION in sw.js
  const T = window.TRIP;
  const FOTO = window.FOTO || {};
  const isPhotoUrl = u => typeof u === "string" && /^https:\/\/(lh3\.googleusercontent\.com|(thumb|upload)\.wikimedia\.org)\/[^"'()\s\\]+$/.test(u);
  const customFoto = new Set();   // luoghi vostri con una foto scelta all'aggiunta
  const byId = Object.fromEntries(LUOGHI.map(p => [p.id, p]));
  const zona = Object.fromEntries(ZONE.map(z => [z.id, z]));
  const zoneOrder = Object.fromEntries(ZONE.map((z, i) => [z.id, i]));
  const clone = o => JSON.parse(JSON.stringify(o));

  // dati letti dal telefono o arrivati dagli altri: si ripuliscono sempre, così una voce incompleta
  // (versione vecchia dell'app, salvataggio interrotto) non può bloccare una pagina
  const str = v => typeof v === "string" ? v : v == null ? "" : String(v);
  function cleanPlan(p) {
    const out = {};
    for (const [d, v] of Object.entries(p && typeof p === "object" ? p : {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const o = v && typeof v === "object" ? v : {};
      out[d] = { ...o, l: str(o.l), n: str(o.n), i: Array.isArray(o.i) ? o.i.filter(x => typeof x === "string" && x) : [] };
      if (o.f !== undefined) out[d].f = Array.isArray(o.f) ? o.f.filter(x => typeof x === "string") : [];   // tappe fatte
      if (o.t && typeof o.t !== "object") delete out[d].t;
    }
    return out;
  }
  function cleanList(name, items) {
    const rate0 = (LS.get("rate", { r: 170 }) || {}).r || 170;
    return (Array.isArray(items) ? items : []).filter(x => x && typeof x === "object" && x.id).map(x => {
      if (name === "spese") {
        const importo = +x.importo, valuta = x.valuta === "EUR" ? "EUR" : "JPY";
        if (!(importo > 0)) return null;
        const eur = +x.eur > 0 ? +x.eur : valuta === "EUR" ? importo : Math.round(importo / rate0 * 100) / 100;
        const per = (Array.isArray(x.perChi) ? x.perChi : []).filter(n => T.viaggiatori.includes(n));
        return { ...x, importo, valuta, eur, perChi: per.length ? per : [...T.viaggiatori], pagatoDa: T.viaggiatori.includes(x.pagatoDa) ? x.pagatoDa : T.viaggiatori[0], desc: str(x.desc), cat: str(x.cat) || "altro" };
      }
      if (name === "categorie") return str(x.n) ? { ...x, n: str(x.n).slice(0, 24), e: str(x.e) || "🏷️", col: /^#[0-9a-f]{6}$/i.test(x.col) ? x.col : "#8a6d4b" } : null;
      if (name === "prenotazioni") return { ...x, tipo: ["hotel", "volo", "treno", "biglietto", "altro"].includes(x.tipo) ? x.tipo : "altro", titolo: str(x.titolo), dal: /^\d{4}-\d{2}-\d{2}$/.test(x.dal) ? x.dal : "", al: /^\d{4}-\d{2}-\d{2}$/.test(x.al) ? x.al : "", lat: isFinite(x.lat) && x.lat !== null ? +x.lat : null, lng: isFinite(x.lng) && x.lng !== null ? +x.lng : null };
      return x;
    }).filter(Boolean);
  }
  let plan = cleanPlan(LS.get("plan", null) || clone(window.BOZZA || {}));   // { "2027-02-20": { l, n, i: [...] } }
  let booked = new Set(LS.get("booked", []));
  let checks = new Set(LS.get("checks", []));
  let me = LS.get("me", "");
  let lastEdit = LS.get("lastEdit", null);   // { by, at }
  let sync = null, syncStatus = "off", pendingRemote = false;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view"), SC = $("#scroller");   // SC: il contenitore che scorre (non la finestra)

  // ——— icone (Lucide, generate come stringhe SVG) ———
  const TORII = [["path", { d: "M2 5.5c4 1.3 16 1.3 20 0" }], ["path", { d: "M4 9.5h16" }], ["path", { d: "M6.5 6.6V21" }], ["path", { d: "M17.5 6.6V21" }], ["path", { d: "M12 6.9v2.6" }]];
  const iconNodes = n => n === "Torii" ? TORII : (window.lucide?.icons?.[n]?.[2] || []);
  const nodesSvg = nodes => nodes.map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  const icon = (n, extra = "") => `<svg class="i" ${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodesSvg(iconNodes(n))}</svg>`;

  const CAT = {
    tempio: ["Landmark", "#b4572e", "Tempio"], santuario: ["Torii", "#d4442f", "Santuario"], parco: ["Trees", "#4f8a3c", "Parco"],
    museo: ["Palette", "#7b4fa0", "Museo"], quartiere: ["Lamp", "#c8902a", "Quartiere"], shopping: ["ShoppingBag", "#2e6fb0", "Shopping"],
    divertimento: ["FerrisWheel", "#e0607e", "Divertimento"], natura: ["Mountain", "#1f9488", "Natura"], vista: ["Binoculars", "#2b4c7e", "Panorama"],
    cibo: ["Utensils", "#d9822b", "Cibo"], castello: ["Castle", "#6b5a45", "Castello"], onsen: ["Bath", "#3a8fb7", "Onsen"], esperienza: ["Sparkles", "#b8860b", "Esperienza"],
  };
  const cat = p => CAT[p.c] || ["MapPin", "#888", ""];

  // ——— foto (Wikimedia) ———
  // foto: Wikimedia (larghezza nel nome del file, "960px-") o Google (larghezza in fondo, "-w960")
  const photoUrl = (id, w = 330) => { const u = FOTO[id]?.u; return u && (u.includes("googleusercontent") ? u.replace(/-w\d+$/, `-w${w}`) : u.replace(/\/\d+px-/, `/${w}px-`)); };
  const credit = id => { const f = FOTO[id]; return !f ? "" : f.g ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(f.g)}`
    : f.h === "commons" ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f.f)}` : `https://${f.h}.wikipedia.org/wiki/File:${encodeURIComponent(f.f)}`; };
  const creditLabel = id => FOTO[id]?.g ? `Foto: Google${FOTO[id].a ? " · " + FOTO[id].a : ""}` : "Foto: Wikimedia Commons";
  function photo(id, w, cls = "") {
    const u = photoUrl(id, w), p = byId[id];
    if (u) return `<div class="ph ${cls}" data-bg="${u}"></div>`;
    const [ic, col] = cat(p);
    return `<div class="ph none ${cls}" style="background:linear-gradient(135deg, ${zona[p.z].colore}, ${col})">${icon(ic)}</div>`;
  }

  // caricamento pigro delle foto: si scaricano solo quando stanno per comparire (risparmio dati)
  const seenPh = new Set();
  function showPhoto(el) {
    const u = el.dataset.bg; el.removeAttribute("data-bg"); el.classList.add("wait");
    const put = () => {
      // foto grandi in cima alla pagina: decodificate subito; nelle liste e gallerie in sottofondo, per non frenare lo scorrimento
      const img = document.createElement("img"); img.className = "phi"; img.alt = ""; img.decoding = el.closest(".hero, .daycover") ? "sync" : "async"; img.draggable = false; img.src = u;
      el.prepend(img); el.classList.add("in");
      getComputedStyle(img).opacity;   // fissa il punto di partenza (trasparente), altrimenti la dissolvenza non parte
      // compare con una dissolvenza solo quando è davvero pronta da disegnare (niente comparse a scatti)
      const show = () => requestAnimationFrame(() => { img.classList.add("ok"); setTimeout(() => el.classList.remove("wait"), 500); });
      img.decode ? img.decode().then(show, show) : (img.onload = show);
    };
    if (seenPh.has(u)) { el.classList.add("now"); return put(); }   // già vista: dissolvenza breve
    const pre = new Image(); pre.src = u;
    (pre.decode ? pre.decode() : Promise.resolve()).then(() => { seenPh.add(u); put(); }, () => { el.classList.add("in"); el.classList.remove("wait"); });
  }
  const lazyIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    lazyIO.unobserve(e.target); showPhoto(e.target);
  }), { rootMargin: "300px" }) : null;
  function lazyScan() {
    $$("[data-bg]").forEach(el => { if (el.dataset.lz) return; el.dataset.lz = 1; if (seenPh.has(el.dataset.bg) || !lazyIO || el.matches(".hero > .ph, .daycover .ph")) showPhoto(el); else lazyIO.observe(el); });   // la foto in cima parte subito
  }
  let lazyRaf = 0;
  new MutationObserver(() => { cancelAnimationFrame(lazyRaf); lazyRaf = requestAnimationFrame(lazyScan); }).observe(document.body, { childList: true, subtree: true });

  // ——— illustrazione (Fuji + torii), cambia di giorno/notte con il tema ———
  let artN = 0;
  function art() {
    const k = ++artN, dark = isDark();
    const sky = dark ? ["#141a35", "#2c2f5c", "#5a4a73"] : ["#f39a78", "#f6c49c", "#fbe5c8"];
    const sun = dark ? `<circle cx="300" cy="58" r="22" fill="#f4e9cf"/><circle cx="292" cy="53" r="26" fill="${sky[0]}" opacity=".35"/>${[[40, 40], [90, 70], [150, 30], [210, 60], [360, 40], [250, 22], [120, 110]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" opacity=".8"/>`).join("")}`
      : `<circle cx="292" cy="62" r="30" fill="#e2553c"/>`;
    const mt = dark ? ["#3b4470", "#262d52", "#191e3b"] : ["#6b7fa8", "#46557e", "#2e3a5e"];
    return `<svg class="art" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="sk${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".65" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
      <pattern id="sg${k}" width="24" height="12" patternUnits="userSpaceOnUse"><g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1"><path d="M0 12a12 12 0 0 1 24 0M4 12a8 8 0 0 1 16 0M8 12a4 4 0 0 1 8 0"/><path d="M-12 6a12 12 0 0 1 24 0M12 6a12 12 0 0 1 24 0"/></g></pattern></defs>
      <rect width="400" height="260" fill="url(#sk${k})"/>${sun}
      <path d="M40 210 L168 88 Q182 76 196 88 L330 210Z" fill="${mt[0]}"/>
      <path d="M146 109 L168 88 Q182 76 196 88 L218 109 L206 103 L196 114 L185 101 L174 113 L163 102Z" fill="#fff" opacity=".95"/>
      <path d="M0 214 Q70 176 150 204 T300 196 T400 204 V260 H0Z" fill="${mt[1]}"/>
      <path d="M0 236 Q110 206 210 232 T400 226 V260 H0Z" fill="${mt[2]}"/>
      <rect width="400" height="260" fill="url(#sg${k})"/>
      <g fill="#c8402f" transform="translate(262 -12)"><path d="M18 150 Q70 158 122 150 L120 158 Q70 165 20 158Z"/><rect x="28" y="166" width="86" height="5"/><rect x="38" y="155" width="7" height="85"/><rect x="95" y="155" width="7" height="85"/><rect x="67" y="160" width="6" height="8"/></g>
    </svg>`;
  }

  // ——— tema ———
  const mq = matchMedia("(prefers-color-scheme: dark)");
  let theme = LS.get("theme", "");
  const isDark = () => theme === "dark" || (theme !== "light" && mq.matches);
  function applyTheme() {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    // barra di stato dello stesso colore del fondo dell'app (la testata non ha più una tinta sua)
    $$('meta[name="theme-color"]').forEach(m => m.setAttribute("content", isDark() ? "#0e0d0c" : "#f5f1ea"));
    for (const e of Object.values(engines)) e.theme();
  }
  function setTheme(t) { theme = t; LS.set("theme", theme); applyTheme(); rerender(); }
  mq.addEventListener?.("change", () => { if (!theme) { applyTheme(); rerender(); } });

  // ——— date ———
  const DAYS = [];
  for (let d = new Date(T.inizio + "T00:00:00Z"); d <= new Date(T.fine + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) DAYS.push(d.toISOString().slice(0, 10));
  const fmtDay = (iso, opts = { weekday: "long", day: "numeric", month: "long" }) => new Date(iso + "T00:00:00Z").toLocaleDateString("it-IT", { timeZone: "UTC", ...opts });
  // orario: su iPhone un campo vuoto sembra rotto, quindi mostra "--:--" finché non si sceglie
  const timeIn = attrs => `<span class="tin"><input type="time" required ${attrs}><i aria-hidden="true">--:--</i></span>`;
  const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);   // "lunedì 22 febbraio" → "Lunedì 22 febbraio"
  const fakeToday = new URLSearchParams(location.search).get("oggi");
  const todayJP = () => fakeToday || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const nowJP = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const kmBetween = (a, b) => { const r = x => x * Math.PI / 180; return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2)); };
  // importi scritti all'italiana: "1.500" = millecinquecento, "1.500,50" e "12,5" con la virgola decimale
  function parseNum(t) {
    t = String(t || "").trim().replace(/[\s¥€'’]/g, "");
    if (!t) return NaN;
    if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (t.includes(",")) t = t.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    return parseFloat(t);
  }
  // il luogo è chiuso quel giorno? ("lun", "mar e mer"…)
  const closedOn = (p, d) => { if (!p?.chiuso || !d) return false; const wd = fmtDay(d, { weekday: "short" }).replace(".", "").toLowerCase(); return new RegExp(`(^|[^a-zà-ù])${wd}([^a-zà-ù]|$)`).test(p.chiuso.toLowerCase()); };
  const closedPill = p => `<span class="pill warn">${icon("Clock")} chiuso di ${esc(p.chiuso)}!</span>`;
  // numeri interi sempre con il punto delle migliaia (1.500 ¥ come 12.000 ¥)
  const fmtInt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fmtKm = km => km < .05 ? "qui" : km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
  const dayIndex = iso => DAYS.indexOf(iso);
  const getDay = iso => (plan[iso] ||= { l: "", n: "", i: [] });
  const dayOf = id => DAYS.filter(d => plan[d]?.i?.includes(id));
  const short = d => fmtDay(d, { day: "numeric", month: "short" });
  function dayZone(d) {
    const c = {}; for (const id of plan[d]?.i || []) { const z = byId[id]?.z; if (z) c[z] = (c[z] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  // ——— salvataggio + sync ———
  // Spese e prenotazioni: una voce per documento, in cache locale per l'avvio offline.
  const lists = { spese: cleanList("spese", LS.get("spese", [])), prenotazioni: cleanList("prenotazioni", LS.get("prenotazioni", [])), luoghi: cleanList("luoghi", LS.get("luoghi", [])), categorie: cleanList("categorie", LS.get("categorie", [])) };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let code = LS.get("code", "");
  let pushT;

  // luoghi aggiunti da voi (condivisi): si uniscono a quelli di Wanderlog
  const BASE_N = LUOGHI.length;
  const BASE_OUT = new Set(LUOGHI.filter(p => p.out).map(p => p.id));   // scartati già in Wanderlog
  // luoghi di Wanderlog modificati da voi: si salvano solo le differenze, l'originale resta per poterlo ripristinare
  const EDIT_F = ["n", "jp", "d", "dur", "eur", "pren"];
  const BASE_ORIG = new Map(LUOGHI.slice(0, BASE_N).map(p => [p.id, Object.fromEntries(EDIT_F.map(f => [f, p[f]]))]));
  function mergeCustom() {
    for (const k of customFoto) delete FOTO[k]; customFoto.clear();
    LUOGHI.length = BASE_N;
    for (const k of Object.keys(byId)) if (byId[k].mine) delete byId[k];
    for (let i = 0; i < BASE_N; i++) { const b = LUOGHI[i]; b.out = BASE_OUT.has(b.id); delete b.gone; delete b.edBy; Object.assign(b, BASE_ORIG.get(b.id)); }
    for (const x of lists.luoghi) {
      if (x.edit) {   // testi cambiati da voi su un luogo di Wanderlog
        const b = byId[x.edit]; if (!b || b.mine) continue;
        if (str(x.n).trim()) b.n = str(x.n).slice(0, 80);
        for (const f of ["jp", "d", "dur"]) if (typeof x[f] === "string") b[f] = x[f].slice(0, f === "d" ? 1000 : 80);
        if ("eur" in x) b.eur = +x.eur > 0 ? +x.eur : undefined;
        if (typeof x.pren === "boolean") b.pren = x.pren;
        b.edBy = str(x.by) || "voi";
        continue;
      }
      // luogo di Wanderlog eliminato da voi: resta solo tra gli scartati (si può ripristinare), per tutti e quattro
      if (x.hide) { const b = byId[x.hide]; if (b && !b.mine) { b.out = true; b.gone = true; } continue; }
      if (!x.n || !isFinite(x.lat) || !isFinite(x.lng)) continue;
      const p = { jp: "", d: "", c: "esperienza", ...x, z: zona[x.z] ? x.z : "altre", mine: true };
      LUOGHI.push(p); byId[p.id] = p;
      if (isPhotoUrl(x.img?.u)) { FOTO[p.id] = { u: x.img.u, f: str(x.img.f), h: /^(it|en|ja|commons)$/.test(x.img.h) ? x.img.h : "commons", g: str(x.img.g), a: str(x.img.a).slice(0, 60) }; customFoto.add(p.id); }
    }
  }
  mergeCustom();
  // ultimo stato confermato dal server: si inviano solo le differenze rispetto a questo
  let synced = { plan: clone(plan), booked: [...booked] };
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  // impronta dei dati indipendente dall'ordine delle chiavi e dall'orario del server ("at"):
  // serve a riconoscere gli aggiornamenti di Firestore che non cambiano niente (conferme delle proprie modifiche, passaggio online)
  const sig = v => JSON.stringify(v ?? null, (k, x) => k === "at" ? undefined
    : x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(j => [j, x[j]])) : x);
  const listSig = items => sig([...items].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  function localChanges() {
    const days = {};
    for (const d of new Set([...Object.keys(plan), ...Object.keys(synced.plan)])) if (!same(plan[d], synced.plan[d])) days[d] = plan[d] || { l: "", n: "", i: [] };
    return { days, add: [...booked].filter(x => !synced.booked.includes(x)), rem: synced.booked.filter(x => !booked.has(x)) };
  }
  function pushChanges() {
    const ch = localChanges();
    if (!Object.keys(ch.days).length && !ch.add.length && !ch.rem.length) return;
    sync.patch({ ...ch, by: me || "?" });
    synced = { plan: clone(plan), booked: [...booked] };
  }
  function savePlan() {
    LS.set("plan", plan); LS.set("booked", [...booked]);
    lastEdit = { by: me || "?", at: Date.now() }; LS.set("lastEdit", lastEdit);
    if (sync) { clearTimeout(pushT); pushT = setTimeout(pushChanges, 400); }
  }
  function putItem(name, item) {
    item = { ...item, id: item.id || uid(), by: me || "?" };
    const arr = lists[name], k = arr.findIndex(x => x.id === item.id);
    if (k < 0) markFresh(item.id);
    k >= 0 ? (arr[k] = item) : arr.push(item);
    LS.set(name, arr); sync?.put(name, item);
    if (name === "luoghi") mergeCustom();
    return item;
  }
  function delItem(name, id) {
    lists[name] = lists[name].filter(x => x.id !== id); LS.set(name, lists[name]); sync?.del(name, id);
    if (name === "luoghi") mergeCustom();
  }
  function remoteChanged() {
    const a = document.activeElement;
    if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !sheetOpen()) rerender(); else pendingRemote = true;
  }
  function onRemote(data, first) {
    if (!data) { if (first) { sync.pushMain({ plan, booked: [...booked], by: me || "?" }); synced = { plan: clone(plan), booked: [...booked] }; } return; }
    // tiene le modifiche locali non ancora inviate, prende tutto il resto dal server
    const mine = localChanges();
    const remote = cleanPlan(data.plan);
    synced = { plan: clone(remote), booked: [...(Array.isArray(data.booked) ? data.booked : [])] };
    const nextPlan = { ...remote, ...clone(mine.days) };
    const nextBooked = new Set([...(Array.isArray(data.booked) ? data.booked : []).filter(x => !mine.rem.includes(x)), ...mine.add]);
    if (Object.keys(mine.days).length || mine.add.length || mine.rem.length) { clearTimeout(pushT); pushT = setTimeout(pushChanges, 400); }
    // niente di nuovo (es. conferma della propria modifica): la pagina resta com'è, senza ricostruirla
    if (sig(nextPlan) === sig(plan) && sig([...nextBooked].sort()) === sig([...booked].sort())) return;
    plan = nextPlan; booked = nextBooked;
    lastEdit = { by: data.by, at: data.at?.toMillis?.() || Date.now() };
    LS.set("plan", plan); LS.set("booked", [...booked]); LS.set("lastEdit", lastEdit);
    remoteChanged();
  }
  function onList(name, items) {
    items = cleanList(name, items);
    if (listSig(items) === listSig(lists[name])) { lists[name] = items; return; }   // stessi dati: nessuna ricostruzione
    lists[name] = items; LS.set(name, items);
    if (name === "luoghi") mergeCustom();
    remoteChanged();
  }
  function setSync(s, err) {
    syncStatus = s;
    if (err) console.warn("Sincronizzazione:", err.code || "", err.message || err);
    if (err?.code === "permission-denied" && code) {   // codice sbagliato o regole non pubblicate
      toast("Codice del viaggio non valido");
      code = ""; LS.set("code", ""); setTimeout(() => askWho(true), 400);
    }
    const el = $("#syncdot");
    el.hidden = false; el.className = "sync-dot" + (s === "online" ? " on" : "");
    el.title = s === "online" ? "Dati condivisi: sincronizzati" : s === "offline" ? "Offline: le modifiche partiranno appena torna la rete" : "Errore di sincronizzazione";
  }
  let syncStarting = false;
  function startSync() {
    if (!window.FIREBASE || !code || sync || syncStarting) return;
    syncStarting = true;
    import("./sync.js").then(m => { sync = m.start(window.FIREBASE, code, { main: onRemote, list: onList, status: setSync, recreate: () => sync.pushMain({ plan, booked: [...booked], by: me || "?" }) }); }).catch(err => { syncStarting = false; setSync("error", err); });
  }

  // ricerca tollerante: ignora accenti (ō → o), trattini, apostrofi e maiuscole; ogni parola deve comparire
  const fold = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-'’·.]/g, "");
  const matches = (text, q) => { const h = fold(text).replace(/\s+/g, ""); return fold(q).split(/\s+/).filter(Boolean).every(w => h.includes(w)); };

  // ——— link Google Maps ———
  const q = p => p.mine ? `${p.lat},${p.lng}` : p.jp.replace(/（.*?）/g, "").trim() || p.n;
  const gmSearch = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q(p))}`;
  const gmDir = p => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q(p))}&travelmode=transit`;
  const gmRoute = ids => {
    const ps = ids.map(id => byId[id]).filter(Boolean).map(q);
    if (ps.length < 2) return ps.length ? gmSearch(byId[ids[0]]) : null;
    const wp = ps.slice(1, -1).slice(0, 8).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ps[0])}&destination=${encodeURIComponent(ps.at(-1))}${wp ? "&waypoints=" + encodeURIComponent(wp) : ""}&travelmode=walking`;
  };
  function hop(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const km = 2 * R * Math.asin(Math.sqrt(Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2));
    if (km < 1.4) return `${icon("Footprints")} ~${Math.max(2, Math.round(km * 1.3 / 4.5 * 60))} min a piedi`;
    if (km < 60) return `${icon("TrainFront")} ~${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km · metro / treno`;
    return `${icon("TrainFront")} trasferimento · ~${Math.round(km)} km`;
  }

  // ——— animazioni ———
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let freshId = null, freshT;
  function markFresh(id) { freshId = id; clearTimeout(freshT); freshT = setTimeout(() => (freshId = null), 1200); }
  // richiude lo spazio di un elemento prima di toglierlo
  function collapse(el) {
    if (!el || reduceMotion()) return Promise.resolve();
    const h = el.getBoundingClientRect().height;
    el.style.height = h + "px"; el.style.overflow = "hidden"; void el.offsetHeight;
    el.style.transition = "height .22s cubic-bezier(.32, .72, 0, 1), opacity .18s"; el.style.height = "0px"; el.style.opacity = "0";
    return new Promise(r => setTimeout(r, 220));
  }
  // numeri che salgono fino al valore e barre che si riempiono (solo quando si entra in una pagina)
  function playIntro(root = view) {
    if (reduceMotion()) return;
    $$("[data-count]", root).forEach(el => {
      const to = +el.dataset.count, fmt = el.dataset.fmt, t0 = performance.now(), dur = 750;
      const show = v => el.textContent = fmt === "eur" ? eurF(v) : fmt === "eur±" ? (to > 0 ? "+" : "") + eurF(v) : fmtInt(v);
      if (!to) return;
      let done = false;
      const step = () => { if (done) return; const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur)), e = 1 - Math.pow(1 - k, 3); show(to * e); if (k < 1) requestAnimationFrame(step); else done = true; };
      show(0); requestAnimationFrame(step);
      setTimeout(() => { done = true; show(to); }, dur + 60);   // valore giusto garantito anche se i fotogrammi si fermano
    });
    if (root.animate) $$(".progress i", root).forEach((el, i) => el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: 700, delay: 60 + i * 40, easing: "cubic-bezier(.32, .72, 0, 1)", fill: "backwards" }));
  }

  // ——— ui helpers ———
  let toastT;
  // avviso in basso: scheda scura con icona, testo su una o due righe e, se si può, "Annulla" con il tempo che scorre
  function toast(msg, undo) {
    const t = $("#toast"), ok = /✓\s*$/.test(msg), text = String(msg).replace(/\s*✓\s*$/, "");
    const kind = undo ? "del" : ok ? "ok" : /offline|rete|connession/i.test(text) ? "net" : "info";
    const ic = { del: "Trash2", ok: "Check", net: "CloudOff", info: "Sparkles" }[kind], ms = undo ? 5000 : Math.min(4200, 1800 + text.length * 35);
    t.className = "toast " + kind + (undo ? " act" : "");
    t.innerHTML = `<span class="tic">${icon(ic)}</span><span class="tmsg">${esc(text)}</span>${undo ? `<button class="undo">Annulla</button><i class="tbar" style="animation-duration:${ms}ms"></i>` : ""}`;
    t.hidden = false;
    if (undo || ok) buzz();
    const hide = () => { if (t.hidden) return; t.classList.add("out"); toastT = setTimeout(() => { t.hidden = true; t.classList.remove("out"); }, reduceMotion() ? 0 : 220); };
    if (undo) t.querySelector(".undo").onclick = e => { e.stopPropagation(); clearTimeout(toastT); hide(); buzz(); undo(); };
    t.onclick = () => { clearTimeout(toastT); hide(); };   // un tocco lo chiude
    clearTimeout(toastT); toastT = setTimeout(hide, ms);
  }
  const sheet = $("#sheet"), sheetCard = $(".sheet-card");
  let sheetOnClose = null;
  // schede e finestre aperte: NON entrano nella cronologia (non sono pagine nuove). Si chiudono
  // trascinandole giù o con la X, e lo swipe indietro dal bordo non le tocca
  const layers = [];
  function pushLayer(close) { layers.push(close); }
  function dropLayer(close) { const k = layers.lastIndexOf(close); if (k >= 0) layers.splice(k, 1); }
  // cronologia a forma di app: sotto c'è sempre e solo la pagina principale della sezione; sopra, al massimo,
  // la sottopagina di Utility. Così "indietro" (swipe di iOS, tasto Android, il nostro swipe)
  // risale dentro la sezione e non salta mai a sezioni o giorni visti prima
  let subPushed = false, pendingGo = null;
  const isSub = h => /^#utility\/./.test(h);
  // cambia indirizzo e pagina subito, senza aspettare "hashchange" (su iPhone non sempre arriva)
  function setUrl(h, push) { history[push ? "pushState" : "replaceState"](null, "", h); navigate(); }
  function land(h) {
    if (isSub(h)) { if (location.hash !== "#utility") history.replaceState(null, "", "#utility"); subPushed = true; setUrl(h, true); }
    else setUrl(h, false);
  }
  function go(h) {
    const cur = location.hash || "#oggi";
    // stessa pagina: chiude la scheda aperta, altrimenti torna in cima (come ritoccare la scheda attiva su iPhone)
    if (h === cur) { if (sheetOpen()) closeSheet(); else SC.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); return; }
    if (cur === "#utility" && isSub(h)) { subPushed = true; setUrl(h, true); return; }
    if (!subPushed) { land(h); return; }
    subPushed = false; pendingGo = h; history.back();
    // rete di sicurezza: se la cronologia non risponde (passo già tolto), si va comunque alla pagina
    setTimeout(() => { if (pendingGo === h) { pendingGo = null; land(h); } }, 700);
  }
  addEventListener("popstate", () => {
    if (pendingGo) { const h = pendingGo; pendingGo = null; if (h !== (location.hash || "#oggi")) land(h); }
  });
  // tutti i link interni passano da go()
  document.addEventListener("click", e => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || e.defaultPrevented || a.target || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); go(a.getAttribute("href"));
  });
  let sheetT = null, sheetVer = 0;
  const sheetOpen = () => !sheet.hidden && !sheet.classList.contains("closing");
  // dentro una scheda già aperta: "push" (avanti, es. Modifica) o "pop" (indietro, es. Annulla/Salva) fanno scorrere il contenuto
  let sheetNav = "";
  const inSheet = (dir, fn) => { sheetNav = dir; fn(); sheetNav = ""; };
  function openSheet(html, onMount, onClose) {
    const nav = sheetOpen() ? sheetNav : ""; sheetNav = "";
    if (!sheetOpen()) sheetVer = dataVer;   // riaperta da dentro (es. dopo una modifica): conta da quando si è aperta la prima volta
    clearTimeout(sheetT); if (sheet.hidden) sheetCard.style.animation = ""; sheet.classList.remove("closing"); $(".sheet-bg").style.opacity = ""; sheetCard.style.transition = "";
    if (!layers.includes(sheetLayer)) pushLayer(sheetLayer);
    $("#sheet-body").innerHTML = html; sheet.hidden = false; SC.classList.add("locked");
    if (nav) { const b = $("#sheet-body"); b.classList.remove("push", "pop"); void b.offsetWidth; b.classList.add(nav); }
    sheetCard.scrollTop = 0; sheetCard.style.transform = "";
    lazyScan();
    sheetOnClose = onClose || null;
    onMount?.($("#sheet-body"));
  }
  function sheetLayer(fromHistory) { closeSheet(false, fromHistory); }
  function closeSheet(instant, fromHistory, v = 0) {
    if (!sheetOpen()) return;
    if (!fromHistory) dropLayer(sheetLayer);
    SC.classList.remove("locked");
    if (instant || reduceMotion()) { sheet.hidden = true; sheetCard.style.transform = ""; }
    else {
      sheet.classList.add("closing");
      // dopo un trascinamento la scheda continua alla velocità del dito (lancio veloce = chiusura più rapida)
      const ms = v > 0 ? Math.round(Math.min(340, Math.max(180, (sheetCard.offsetHeight / v) * .9))) : 340;
      sheetCard.style.transition = `transform ${ms}ms cubic-bezier(.32, .72, 0, 1)`; sheetCard.style.transform = "translate3d(0, 105%, 0)";
      sheet.style.setProperty("--close-ms", ms + "ms");
      sheetT = setTimeout(() => { sheet.hidden = true; sheet.classList.remove("closing"); sheetCard.style.transition = ""; sheetCard.style.transform = ""; }, ms);
    }
    // chiusa senza aver cambiato niente: la pagina sotto resta com'è (niente ricostruzione, foto già pronte)
    const f = sheetOnClose === rerender && dataVer === sheetVer ? null : sheetOnClose; sheetOnClose = null; f?.();
    if (pendingRemote) { pendingRemote = false; rerender(); }
  }
  document.addEventListener("focusout", () => setTimeout(() => {
    const a = document.activeElement;
    if (pendingRemote && !sheetOpen() && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { pendingRemote = false; rerender(); }
  }, 300));
  sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); hideBig(); } });
  // trascina giù per chiudere: dalla lineetta o da qualunque punto quando il contenuto è in cima;
  // basta anche un colpetto veloce verso il basso
  (() => {
    let y0 = null, dy = 0, t0 = 0, lastY = 0, lastT = 0, v = 0, mode = null;
    const startAt = (y) => {
      // presa mentre sta ancora salendo: si ferma dov'è e segue il dito da lì (l'animazione CSS altrimenti ignorerebbe il dito)
      let from = 0;
      if (sheetCard.getAnimations?.().length) { from = Math.max(0, new DOMMatrix(getComputedStyle(sheetCard).transform).m42 || 0); sheetCard.style.animation = "none"; sheetCard.style.transform = `translate3d(0, ${from}px, 0)`; }
      y0 = y - from; dy = from; t0 = lastT = performance.now(); lastY = y; v = 0; sheetCard.style.transition = "none"; $(".sheet-bg").style.transition = "none"; };
    // si aggiorna una volta per fotogramma, solo con transform/opacity (lavoro della scheda grafica, niente ricalcolo della pagina)
    const bg = $(".sheet-bg"); let raf = 0;
    const paint = () => { raf = 0; sheetCard.style.transform = `translate3d(0, ${dy}px, 0)`; bg.style.opacity = String(Math.max(0, 1 - dy / 500)); };
    const moveTo = y => {
      const now = performance.now(), nv = (y - lastY) / Math.max(1, now - lastT); v = v * .4 + nv * .6; lastY = y; lastT = now;
      dy = Math.max(0, y - y0); if (!raf) raf = requestAnimationFrame(paint);
    };
    const finish = () => {
      if (y0 == null) return; y0 = null; mode = null;
      cancelAnimationFrame(raf); raf = 0; bg.style.transition = "";
      if (dy > 110 || (v > .5 && dy > 16)) { buzz(); closeSheet(false, false, v); bg.style.opacity = "0"; return; }
      bg.style.opacity = "";
      sheetCard.style.transition = "transform .4s cubic-bezier(.32, .72, 0, 1)"; sheetCard.style.transform = "";
    };
    const grab = $(".grab");
    grab.addEventListener("pointerdown", e => { startAt(e.clientY); grab.setPointerCapture(e.pointerId); });
    grab.addEventListener("pointermove", e => { if (y0 != null) moveTo(e.clientY); });
    grab.addEventListener("pointerup", finish); grab.addEventListener("pointercancel", finish);
    sheetCard.addEventListener("touchstart", e => {
      if (e.target.closest(".grab, input, textarea, select, .chips, .mcar, .hscroll")) { mode = "no"; return; }
      mode = sheetCard.scrollTop <= 0 ? "maybe" : "no"; lastY = e.touches[0].clientY; y0 = null;
    }, { passive: true });
    sheetCard.addEventListener("touchmove", e => {
      if (mode === "no" || !mode) return;
      const y = e.touches[0].clientY;
      if (mode === "maybe") { if (y - lastY > 4 && sheetCard.scrollTop <= 0) { mode = "drag"; startAt(y); } else if (lastY - y > 4) { mode = "no"; return; } else return; }
      e.preventDefault(); moveTo(y);
    }, { passive: false });
    sheetCard.addEventListener("touchend", () => { if (mode === "drag") finish(); mode = null; });
    sheetCard.addEventListener("touchcancel", () => { if (mode === "drag") finish(); mode = null; });
  })();

  // finestra di conferma nello stile dell'app (sopra anche le schede aperte); restituisce true/false
  function ask({ title, text = "", ok = "Conferma", danger = false, icon: ic = danger ? "Trash2" : "Sparkles" }) {
    return new Promise(res => {
      const d = document.createElement("div"); d.className = "dlg";
      d.innerHTML = `<div class="dlg-bg"></div><div class="dlg-card" role="alertdialog" aria-modal="true">
        <span class="dlg-ic${danger ? " danger" : ""}">${icon(ic)}</span><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}
        <div class="dlg-btns"><button class="btn" data-a="0">Annulla</button><button class="btn ${danger ? "danger" : "primary"}" data-a="1">${esc(ok)}</button></div></div>`;
      const layer = () => close(false, true);
      pushLayer(layer);
      const close = (v, fromHistory) => { if (d.classList.contains("out")) return; if (!fromHistory) dropLayer(layer); d.classList.add("out"); setTimeout(() => d.remove(), 180); document.removeEventListener("keydown", key); res(v); };
      const key = e => { if (e.key === "Escape") close(false); };
      d.addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b) close(b.dataset.a === "1"); else if (e.target.classList.contains("dlg-bg")) close(false); });
      document.addEventListener("keydown", key);
      document.body.appendChild(d); d.querySelector('[data-a="1"]').focus({ preventScroll: true });
    });
  }

  function bigLayer() { hideBig(true); }
  function hideBig(fromHistory) {
    const b = $("#big"); if (b.hidden || b.classList.contains("out")) return;
    if (fromHistory !== true) dropLayer(bigLayer);
    if (reduceMotion()) { b.hidden = true; return; }
    b.classList.add("out"); setTimeout(() => { b.hidden = true; b.classList.remove("out"); }, 180);
  }
  function showBig(jp, sub, speakIt) {
    const b = $("#big");
    b.innerHTML = `<div class="jp">${esc(jp)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}<div class="btns" style="width:100%;max-width:360px"><button class="btn" data-say>${icon("Volume2")} Ascolta</button><button class="btn primary">Chiudi</button></div>`;
    b.hidden = false;
    b.classList.remove("out");
    if (!layers.includes(bigLayer)) pushLayer(bigLayer);
    b.onclick = e => { if (e.target.closest("[data-say]")) return speak(jp); hideBig(); };
    if (speakIt) speak(jp);
  }
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[…／]/g, " "));
      u.lang = "ja-JP"; u.rate = .85;
      const v = speechSynthesis.getVoices().find(v => v.lang?.startsWith("ja"));
      if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { toast("Audio non disponibile su questo dispositivo"); }
  }

  const zonePill = z => `<span class="pill z" style="background:${zona[z].colore}">${esc(zona[z].nome)}</span>`;
  function placeMeta(p, opts = {}) {
    const m = [];
    if (!opts.noZone) m.push(zonePill(p.z));
    if (p.dur) m.push(`<span class="pill ghost">${icon("Clock")} ${esc(p.dur)}</span>`);
    if (p.eur && !opts.compact) m.push(`<span class="pill ghost">~${Math.max(1, Math.round(p.eur))} €</span>`);
    if (p.pren) m.push(booked.has(p.id) ? `<span class="pill ok">${icon("Check")} prenotato</span>` : `<span class="pill warn">${icon("Ticket")} da prenotare</span>`);
    if (p.chiuso) m.push(`<span class="pill ghost">chiuso ${esc(p.chiuso)}</span>`);
    const ds = dayOf(p.id);
    if (ds.length && !opts.noDays) m.push(`<span class="pill">${icon("CalendarDays")} ${ds.map(short).join(", ")}</span>`);
    if (p.out) m.push(`<span class="pill ghost">${p.gone ? "eliminato" : "scartato"}</span>`);
    if (p.mine && !opts.compact) m.push(`<span class="pill ghost">${icon("UserRound")} ${esc(p.chi || "aggiunto")}</span>`);
    return m.join("");
  }
  function placeRow(p, opts = {}) {
    const [ic, col] = cat(p);
    return `<div class="place${p.out ? " out" : ""}${p.id === freshId ? " fresh" : ""}" data-place="${p.id}">
      <div style="position:relative">${photo(p.id, 330)}${photoUrl(p.id) ? `<span class="cat-ic" style="background:${col}">${icon(ic)}</span>` : ""}</div>
      <div class="grow"><h4>${esc(p.n)}</h4><div class="jp">${esc(p.jp)}</div><div class="meta">${placeMeta(p, opts)}</div></div>
      ${opts.right || ""}
    </div>`;
  }

  // ——— scheda luogo ———
  function openPlace(id) {
    const p = byId[id]; if (!p) return;
    const ds = dayOf(id);
    const [ic, col, cname] = cat(p);
    openSheet(`
      <div class="cover ph${photoUrl(id) ? "" : " none"}"${photoUrl(id) ? ` data-full="${photoUrl(id, 1600)}" data-small="${photoUrl(id, 960)}"` : ""} style="${photoUrl(id) ? `background-image:url('${photoUrl(id, 960)}')` : `background:linear-gradient(135deg, ${zona[p.z].colore}, ${col})`}">${photoUrl(id) ? `<a class="credit" href="${credit(id)}" target="_blank" rel="noopener">${esc(creditLabel(id))}</a>` : icon(ic)}</div>
      <div class="row" style="gap:6px;margin-bottom:8px">${zonePill(p.z)}<span class="pill ghost" style="color:${col}">${icon(ic)} ${cname}</span></div>
      <h2>${esc(p.n)}</h2>
      ${p.jp ? `<p class="jpname jp">${esc(p.jp)}</p>` : ""}
      ${p.d ? `<p style="margin:0">${esc(p.d)}</p>` : ""}
      ${p.mine ? `<p class="small muted" style="margin:6px 0 0">${icon("UserRound")} Aggiunto da ${esc(p.chi || "voi")}, non è nella lista Wanderlog</p>` : ""}
      ${p.edBy ? `<p class="small muted" style="margin:6px 0 0">${icon("Pencil")} Modificato da ${esc(p.edBy)}</p>` : ""}
      ${p.note ? `<div class="note">${icon("Pencil")}<span>${esc(p.note)}</span></div>` : ""}
      <div class="btns">
        <a class="btn primary" href="${gmDir(p)}" target="_blank" rel="noopener">${icon("Navigation")} Portami qui</a>
        <a class="btn" href="${gmSearch(p)}" target="_blank" rel="noopener">${icon("MapPin")} Maps</a>
      </div>
      <div class="btns" style="margin-top:8px">
        ${p.jp ? `<button class="btn" id="showjp">${icon("Languages")} In giapponese</button>` : ""}
        <button class="btn" id="onmap">${icon("Map")} Sulla mappa</button>
        ${p.gone ? "" : `<button class="btn" id="editl">${icon("Pencil")} Modifica</button>`}
      </div>
      <dl class="info">
        ${p.dur ? `<dt>Durata</dt><dd>${esc(p.dur)}</dd>` : ""}
        ${p.eur ? `<dt>Costo</dt><dd>~${p.eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € a persona <span class="muted">(${p.mine ? "stima vostra" : "stima Wanderlog"})</span></dd>` : ""}
        ${p.chiuso ? `<dt>Chiuso</dt><dd>${esc(p.chiuso)}</dd>` : ""}
        ${p.pren ? `<dt>Biglietti</dt><dd><label class="check" style="border:none;padding:0"><input type="checkbox" id="bk" ${booked.has(id) ? "checked" : ""}><span>${booked.has(id) ? "<b>Prenotato</b>" : "Da prenotare in anticipo: <b>segna quando è fatto</b>"}</span></label></dd>` : ""}
        <dt>In programma</dt><dd>${ds.length ? ds.map(d => `<a href="#giorni/${d}">Giorno ${dayIndex(d) + 1} · ${fmtDay(d)}</a>`).join("<br>") : "<span class='muted'>non ancora</span>"}</dd>
      </dl>
      ${p.gone ? "" : `<h3>Aggiungi a un giorno</h3>
      <select id="addday"><option value="">Scegli il giorno…</option>${DAYS.map((d, i) => `<option value="${d}" ${plan[d]?.i?.includes(id) ? "disabled" : ""}>Giorno ${i + 1} · ${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}${plan[d]?.l ? " — " + esc(plan[d].l) : ""}</option>`).join("")}</select>`}
      ${p.gone ? `<button class="btn primary" id="restp" style="width:100%;margin-top:16px">${icon("Undo2")} Ripristina il luogo</button>`
        : `<button class="btn" id="delp" style="width:100%;margin-top:16px;color:var(--shu)">${icon("Trash2")} Elimina luogo</button>`}
    `, el => {
      $("#delp", el)?.addEventListener("click", () => deletePlace(p));
      $("#restp", el)?.addEventListener("click", () => { delItem("luoghi", "h" + id); toast("Luogo ripristinato"); closeSheet(); rerender(); });
      $("#bk", el)?.addEventListener("change", e => { e.target.checked ? booked.add(id) : booked.delete(id); savePlan(); openPlace(id); });
      $("#editl", el)?.addEventListener("click", () => inSheet("push", () => p.mine ? editLuogo(lists.luoghi.find(x => x.id === id) || p, null, true) : editBase(p)));
      if ($("#showjp", el)) $("#showjp", el).onclick = () => showBig(p.jp, `${esc(p.n)}<br><span class="jp" style="font-size:1.3rem;color:var(--ink)">ここに行きたいです</span><br><small>"Vorrei andare qui"</small>`);
      $("#onmap", el).onclick = () => { mapFocus = id; go("#mappa"); };
      if ($("#addday", el)) $("#addday", el).onchange = e => {
        const d = e.target.value; if (!d) return;
        getDay(d).i.push(id); savePlan(); toast(closedOn(p, d) ? `Attenzione: quel giorno è chiuso (${p.chiuso})` : `Aggiunto al giorno ${dayIndex(d) + 1}`); openPlace(id);
      };
    }, rerender);
  }
  document.addEventListener("click", e => {
    // tocco su una card con un luogo: si apre la scheda. I pulsanti dentro la card fanno la loro azione,
    // tranne quando il pulsante stesso porta il luogo (es. "Dettagli" nelle card della mappa)
    const el = e.target.closest("[data-place]"), ctl = e.target.closest("button, a, input, select, textarea");
    if (el && (!ctl || ctl === el)) openPlace(el.dataset.place);
  });

  // ——— OGGI ———
  const QUICK = [["prenotazioni", "BedDouble", "#2e6fb0", "Prenotaz."], ["spese", "HandCoins", "#7b4fa0", "Spese"], ["frasi", "Languages", "#2b4c7e", "Frasi"], ["yen", "Banknote", "#4f8a3c", "¥ ↔ €"]];
  const HERO_PLACE = { tokyo: "t33", vicino: "v1", kyoto: "k1", osaka: "o6", nara: "n2", fuji: "h3", kanazawa: "z1", altre: "a1" };
  function chapters() {
    const out = [];
    DAYS.forEach((d, i) => {
      const z = dayZone(d) || out.at(-1)?.z; if (!z) return;
      const last = out.at(-1);
      if (last && last.z === z) last.to = i; else out.push({ z, from: i, to: i, d });
    });
    return out;
  }
  // Hotel della notte + prenotazioni con orario, per Oggi e per ogni giorno
  function dayPren(d) {
    if (!code) return "";
    const h = hotelFor(d), bs = bookingsOn(d), ci = lists.prenotazioni.filter(p => p.tipo === "hotel" && p.dal === d);
    if (!h && !bs.length && d !== T.fine) return `<a class="mini" href="#utility/prenotazioni">${icon("BedDouble")} <span class="grow">Nessun hotel per questa notte</span><b>Aggiungi</b></a>`;
    return `${h ? `<div class="mini hotel" data-pren="${h.id}">${icon("BedDouble")}<span class="grow"><small>${ci.includes(h) ? "Check-in" + (h.ora ? " " + esc(h.ora) : "") : "Notte"}</small><b>${esc(h.titolo)}</b></span>
        <a class="btn small primary" href="${gmTo(addrQ(h))}" target="_blank" rel="noopener">${icon("Navigation")}</a><button class="btn small" data-taxi="${h.id}" aria-label="Mostra al tassista">${icon("CarTaxiFront")}</button></div>` : ""}
      ${bs.map(p => { const [ic, col] = PTYPE[p.tipo] || PTYPE.altro; return `<div class="mini" data-pren="${p.id}"><span style="color:${col}">${icon(ic)}</span><span class="grow"><small>${p.ora ? esc(p.ora) : "Prenotato"}</small><b>${esc(p.titolo)}</b></span>${p.link ? `<a class="btn small" href="${esc(p.link)}" target="_blank" rel="noopener">${icon("Link")}</a>` : ""}</div>`; }).join("")}`;
  }
  function oggiPren(today, before, after) {
    if (!code || after || before) return "";
    if (!before) return `<div class="section-h"><h3>Oggi e stanotte</h3><a class="small" href="#utility/prenotazioni" style="font-weight:600">Tutte</a></div>${dayPren(today)}`;
    const next = [...lists.prenotazioni].filter(p => p.dal).sort((a, b) => a.dal.localeCompare(b.dal) || (a.ora || "").localeCompare(b.ora || "")).slice(0, 3);
    const covered = NIGHTS.filter(hotelFor).length;
    return `<a class="card mini-card" href="#utility/prenotazioni"><div class="between"><b>${icon("BedDouble")} Hotel prenotati</b><b>${covered}/${NIGHTS.length} notti</b></div>
      <div class="nights">${NIGHTS.map(d => `<i class="${hotelFor(d) ? "ok" : ""}"></i>`).join("")}</div>
      ${next.length ? `<div class="small muted" style="margin-top:8px">Prossime: ${next.map(p => `${esc(p.titolo)} (${short(p.dal)})`).join(" · ")}</div>` : `<div class="small muted" style="margin-top:8px">Aggiungi hotel, voli e biglietti →</div>`}</a>`;
  }
  function renderOggi() {
    const today = todayJP();
    const idx = dayIndex(today);
    const before = today < T.inizio, after = today > T.fine;
    const daysTo = Math.ceil((new Date(T.inizio + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 864e5);
    const firstDay = id => dayOf(id)[0] || "9999";
    const toBook = LUOGHI.filter(p => p.pren && !p.out).sort((a, b) => firstDay(a.id).localeCompare(firstDay(b.id)) || zoneOrder[a.z] - zoneOrder[b.z]);
    const doneBook = toBook.filter(p => booked.has(p.id)).length;
    // il saluto segue l'ora di dove siete: in viaggio quella del Giappone
    const hh = !before && !after ? +nowJP().slice(0, 2) : new Date().getHours(), hi = "";
    const saluto = (hh >= 5 && hh < 13 ? "Buongiorno" : hh >= 13 && hh < 18 ? "Buon pomeriggio" : hh >= 18 && hh < 23 ? "Buonasera" : "Buonanotte") + (me ? ", " + esc(me) : "");
    const KANJI = { tokyo: "東京", vicino: "鎌倉", kyoto: "京都", osaka: "大阪", nara: "奈良", fuji: "箱根", kanazawa: "金沢" };
    const z0 = dayZone(T.inizio) || "tokyo", zNow = (!before && !after && dayZone(today)) || z0;
    const greet = `<div class="greet"><h2>${saluto}</h2><div class="gpills">
      <span class="gpill"><em style="color:#c8402f">JP</em><span data-clock="Asia/Tokyo"></span></span>
      <span class="gpill"><em style="color:#3f8a4f">IT</em><span data-clock="Europe/Rome"></span></span>
      <span class="gpill" id="wpill" hidden></span></div></div>`;

    let hero;
    if (before || after) hero = `<div class="hero">${before && photoUrl(HERO_PLACE[z0]) ? `<div class="ph" data-bg="${photoUrl(HERO_PLACE[z0], 960)}"></div>` : art()}${before && KANJI[z0] ? `<span class="kanji" aria-hidden="true">${KANJI[z0]}</span>` : ""}<div class="hero-in">
        <span class="kicker">${before ? hi + (daysTo === 1 ? "Manca" : "Mancano") : "Okaeri!"}</span>
        ${before ? `<div class="big-n" data-count="${daysTo}">${daysTo}</div><div class="title">${daysTo === 1 ? "giorno" : "giorni"} al Giappone</div>` : `<div class="title">Viaggio concluso.<br>Arigatō, Giappone!</div>`}
        <p>${fmtDay(T.inizio, { day: "numeric", month: "long" })} – ${fmtDay(T.fine, { day: "numeric", month: "long", year: "numeric" })} · Niccolò & Antonella · Miriam & Paolo</p>
      </div></div>`;
    else {
      const d = getDay(today), first = d.i[0] && byId[d.i[0]], nst = d.i.filter(id => byId[id]).length;
      hero = `<div class="hero">${first && photoUrl(first.id) ? `<div class="ph" data-bg="${photoUrl(first.id, 960)}"></div>` : art()}${KANJI[zNow] ? `<span class="kanji" aria-hidden="true">${KANJI[zNow]}</span>` : ""}<div class="hero-in">
        <span class="kicker">${hi}Giorno ${idx + 1} di ${DAYS.length}</span>
        <div class="title">${esc(d.l || "Oggi")}</div>
        ${nst ? `<p>${nst} ${nst === 1 ? "tappa" : "tappe"} in programma</p>` : ""}
        <div class="btns"><a class="btn primary" href="#giorni/${today}">${icon("CalendarDays")} Programma</a>${first ? `<a class="btn" href="${gmDir(first)}" target="_blank" rel="noopener">${icon("Navigation")} Portami</a>` : ""}</div>
      </div></div>`;
    }

    const ch = chapters();
    view.innerHTML = `
      ${greet}
      ${hero}
      <div class="quick">${QUICK.map(([k, ic, c, t]) => `<a class="qa" href="#utility/${k}"><span class="ic" style="background:${c}">${icon(ic)}</span>${t}</a>`).join("")}</div>
      ${before ? prepCard(toBook, doneBook) : ""}
      ${!before && !after ? tripCard(today) + eveningCard(today) + nearCard(today) : ""}
      ${oggiPren(today, before, after)}
      ${ch.length ? `<div><div class="section-h"><h3>Il viaggio in capitoli</h3><a class="small" href="#giorni" style="font-weight:600">Tutti i giorni</a></div>
      <div class="hscroll">${ch.map((c, k) => `<a class="chapter" href="#giorni/${DAYS[c.from]}" style="--c:${zona[c.z].colore}">${photoUrl(HERO_PLACE[c.z]) ? `<div class="ph" data-bg="${photoUrl(HERO_PLACE[c.z], 330)}"></div>` : `<div class="ph" style="background:${zona[c.z].colore}"></div>`}<span class="num">${k + 1}</span><b>${esc(zona[c.z].nome)}</b><small>${c.from === c.to ? `giorno ${c.from + 1}` : `giorni ${c.from + 1}–${c.to + 1}`} · ${short(DAYS[c.from])}</small></a>`).join("")}</div></div>` : ""}
      ${!before && !after ? `<div class="card"><div class="between"><h3 style="margin:0" id="wtitle">Meteo</h3><span class="muted small" id="wtime"></span></div><div class="weather" id="weather" style="margin-top:12px"><div>…</div></div></div>` : ""}
      <div class="card">
        <div class="between"><h3 style="margin:0">${icon("Ticket")} Da prenotare</h3><b class="small">${doneBook}/${toBook.length}</b></div>
        <div class="progress bar-head"><i style="width:${toBook.length ? doneBook / toBook.length * 100 : 0}%"></i></div>
        <p class="muted small" style="margin:8px 0 4px">Wanderlog consiglia di prenotarli in anticipo. In ordine di data: prima quelli già in programma.</p>
        <div id="booklist">${toBook.map((p, k) => `<label class="check${booked.has(p.id) ? " done" : ""}"${k >= 6 ? " data-more hidden" : ""}><input type="checkbox" data-book="${p.id}" ${booked.has(p.id) ? "checked" : ""}><span class="grow">${esc(p.n)}<small class="sub">${esc(zona[p.z].nome)}${dayOf(p.id).length ? " · " + dayOf(p.id).map(short).join(", ") : ""}</small></span><a class="iconbtn" href="${bookUrl(p)}" target="_blank" rel="noopener" aria-label="Cerca i biglietti">${icon("ExternalLink")}</a></label>`).join("")}</div>
        ${toBook.length > 6 ? `<button class="btn small ghost" id="more" style="width:100%;margin-top:8px">Mostra tutti (${toBook.length})</button>` : ""}
      </div>
    `;
    $$("[data-book]").forEach(cb => cb.onchange = () => {
      cb.checked ? booked.add(cb.dataset.book) : booked.delete(cb.dataset.book);
      savePlan(); cb.closest(".check").classList.toggle("done", cb.checked);
      const n = toBook.filter(p => booked.has(p.id)).length, w = n / toBook.length * 100 + "%";
      const card = cb.closest(".card"); card.querySelector(".progress i").style.width = w; card.querySelector(".between b").textContent = `${n}/${toBook.length}`;
      const pr = $('[data-goto="booklist"]'); if (pr) { pr.querySelector("small").textContent = `${n}/${toBook.length}`; pr.querySelector(".progress i").style.width = w; }
    });
    $("#more")?.addEventListener("click", e => { $$("[data-more]").forEach(x => (x.hidden = false)); e.currentTarget.remove(); });
    $("[data-goto]")?.addEventListener("click", e => { $("#" + e.currentTarget.dataset.goto)?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    if (before) window.OfflineMap?.status?.().then(st => { const n = Object.values(st).filter(Boolean).length, el = $("#prep-maps"); if (el) { el.querySelector("small").textContent = `${n}/${OfflineMap.ZONE.length} zone`; el.querySelector(".progress i").style.width = n / OfflineMap.ZONE.length * 100 + "%"; } }).catch(() => {});
    bindPcards();
    loadWeather(today); tick();
    if (!before && !after) bindTrip(today);
  }

  const bookUrl = p => `https://www.google.com/search?q=${encodeURIComponent(p.n + " official tickets booking")}`;
  // prima di partire: a che punto siete con i preparativi
  function prepCard(toBook, doneBook) {
    const bar = (n, tot) => `<div class="progress"><i style="width:${tot ? Math.min(1, n / tot) * 100 : 0}%"></i></div>`;
    const row = (tag, attr, ic, col, label, val, n, tot, id = "") => `<${tag} class="prep" ${attr}${id ? ` id="${id}"` : ""}><span class="pic" style="background:${col}">${icon(ic)}</span><span class="grow"><span class="between"><b>${label}</b><small>${val}</small></span>${bar(n, tot)}</span>${icon("ChevronRight")}</${tag}>`;
    const tot = CHECKLIST.reduce((s, [, it]) => s + it.length, 0);
    const rows = [row("button", 'data-goto="booklist"', "Ticket", "#d4442f", "Biglietti da prenotare", `${doneBook}/${toBook.length}`, doneBook, toBook.length)];
    if (code) {
      const covered = NIGHTS.filter(hotelFor).length, voli = lists.prenotazioni.filter(p => p.tipo === "volo").length;
      rows.push(row("a", 'href="#utility/prenotazioni"', "BedDouble", "#2e6fb0", "Hotel", `${covered}/${NIGHTS.length} notti`, covered, NIGHTS.length));
      rows.push(row("a", 'href="#utility/prenotazioni"', "Plane", "#7b4fa0", "Voli", voli ? `${voli} ${voli === 1 ? "inserito" : "inseriti"}` : "da inserire", Math.min(voli, 2), 2));
    }
    rows.push(row("a", 'href="#utility/checklist"', "Luggage", "#c89b3c", "Valigia e documenti", `${checks.size}/${tot}`, checks.size, tot));
    rows.push(row("a", 'href="#utility/mappe"', "CloudOff", "#1f9488", "Mappe offline", "…", 0, 1, "prep-maps"));
    return `<div class="card"><h3 style="margin:0 0 2px">Prima di partire</h3>${rows.join("")}${code ? "" : `<p class="small muted" style="margin:8px 0 0">Con il codice del viaggio vedrete qui anche hotel e voli.</p>`}</div>`;
  }
  // in viaggio: la prossima tappa di oggi (in base agli orari, se li avete messi)
  // ——— Oggi in viaggio: tappe da timbrare, spesa veloce, sera, vicino a te ———
  function toggleDone(today, id, on) {
    const d = getDay(today), f = new Set(d.f || []);
    on ? f.add(id) : f.delete(id); d.f = d.i.filter(x => f.has(x)); savePlan();
  }
  function tripCard(today) {
    const d = plan[today], ids = (d?.i || []).filter(id => byId[id]);
    const quick = `<button class="btn small primary" id="qspesa">${icon("Plus")} Spesa</button>`;
    if (!ids.length) return `<div class="card tripc"><div class="between"><h3 style="margin:0">Giornata libera</h3>${quick}</div><p class="small muted" style="margin:6px 0 0">Nessuna tappa in programma. Guardate "Vicino a te" qui sotto.</p></div>`;
    const done = new Set(d.f || []), n = ids.filter(id => done.has(id)).length, k = ids.findIndex(id => !done.has(id));
    const p = k >= 0 ? byId[ids[k]] : null, prev = k > 0 ? byId[ids[k - 1]] : null, t = d.t || {};
    return `<div class="card tripc"><div class="between"><h3 style="margin:0">${p ? (n ? "Prossima tappa" : "Prima tappa") : "Tappe di oggi fatte 🎉"}</h3>${quick}</div>
      <div class="bar"><i style="width:${n / ids.length * 100}%"></i></div><div class="small muted">${n} di ${ids.length} tappe</div>
      ${p ? `<div class="row" data-place="${p.id}" style="margin-top:12px">${photo(p.id, 330, "ns-ph")}<div class="grow"><b>${esc(p.n)}</b>${p.jp ? `<div class="small muted jp">${esc(p.jp)}</div>` : ""}<div class="small muted">${t[p.id] ? `${icon("Clock")} ${esc(t[p.id])} · ` : ""}${prev ? `a ${fmtKm(kmBetween(prev, p))} dalla tappa prima` : ""}</div></div></div>
      <div class="btns"><a class="btn primary" href="${gmDir(p)}" target="_blank" rel="noopener">${icon("Navigation")} Portami qui</a><button class="btn" data-fatto="${p.id}">Fatto 済</button></div>` : ""}
      <div class="stops">${ids.map(id => `<label class="check${done.has(id) ? " done" : ""}"><input type="checkbox" data-stop="${id}" ${done.has(id) ? "checked" : ""}><span><b>${esc(byId[id].n)}</b>${t[id] ? ` <small class="muted">${esc(t[id])}</small>` : ""}</span></label>`).join("")}</div></div>`;
  }
  const onOggi = () => (location.hash || "#oggi") === "#oggi";
  function bindTrip(today) {
    $("#qspesa")?.addEventListener("click", () => code ? editSpesa({ data: today }, true) : askWho(true));
    $$("[data-stop]").forEach(c => c.onchange = () => { toggleDone(today, c.dataset.stop, c.checked); setTimeout(() => { if (onOggi()) keepScroll(render); }, 420); });
    $$("[data-fatto]").forEach(b => b.onclick = () => { buzz(); toggleDone(today, b.dataset.fatto, true); keepScroll(render); });
    $("#nearbtn")?.addEventListener("click", () => {
      if (!navigator.geolocation) return toast("Posizione non disponibile");
      toast("Cerco la tua posizione…");
      // la posizione può arrivare dopo qualche secondo: si ridisegna Oggi solo se è ancora sullo schermo
      navigator.geolocation.getCurrentPosition(pos => { nearPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }; dataVer++; if (onOggi()) keepScroll(render); },
        () => toast("Non riesco a leggere la posizione"), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }
  // sera (dalle 21 in Giappone): com'è andata e cosa c'è domani
  function eveningCard(today) {
    if (nowJP() < "21:00") return "";
    const d = plan[today] || {}, ids = (d.i || []).filter(id => byId[id]), done = ids.filter(id => d.f?.includes(id));
    let km = 0; for (let j = 1; j < done.length; j++) km += kmBetween(byId[done[j - 1]], byId[done[j]]) * 1.25;
    const sp = lists.spese.filter(s => s.data === today && s.cat !== "rimborso"), tot = sp.reduce((a, s) => a + s.eur, 0);
    const tom = DAYS[dayIndex(today) + 1], td = tom && plan[tom], first = td?.i?.map(id => byId[id]).find(Boolean);
    return `<div class="card evening"><h3 style="margin:0">Com'è andata oggi</h3>
      <div class="stat"><div><b>${done.length}/${ids.length}</b><small>tappe</small></div><div><b>${km < 1 ? "–" : fmtKm(km)}</b><small>a piedi (stima)</small></div><div><b>${tot ? Math.round(tot) + " €" : "–"}</b><small>spesi oggi</small></div></div>
      ${tom ? `<p class="small" style="margin:12px 0 0"><b>Domani</b> · ${esc(td?.l || "giornata libera")}${first ? ` · prima tappa ${esc(first.n)}${td.t?.[first.id] ? " alle " + esc(td.t[first.id]) : ""}` : ""}</p>` : `<p class="small" style="margin:12px 0 0"><b>Domani si torna a casa.</b> Buon viaggio! ✈️</p>`}</div>`;
  }
  // vicino a te: luoghi della lista entro 1,5 km (anche di altri giorni), su richiesta
  let nearPos = null;
  function nearCard(today) {
    if (!nearPos || Date.now() - nearPos.at > 30 * 60e3) return `<div class="card row"><span class="pic" style="background:#1f9488">${icon("LocateFixed")}</span><div class="grow"><b>Vicino a te</b><div class="small muted">I posti della vostra lista qui intorno</div></div><button class="btn small" id="nearbtn">Mostra</button></div>`;
    const doneToday = new Set(plan[today]?.f || []);
    const list = LUOGHI.filter(p => !p.out && !doneToday.has(p.id)).map(p => [p, kmBetween(nearPos, p)]).filter(([, km]) => km <= 1.5).sort((a, b) => a[1] - b[1]).slice(0, 5);
    return `<div class="card nearl"><div class="between"><h3 style="margin:0">Vicino a te</h3><button class="btn small" id="nearbtn">${icon("RotateCcw")} Aggiorna</button></div>
      ${list.length ? list.map(([p, km]) => `<div class="row" data-place="${p.id}">${photo(p.id, 330)}<div class="grow"><b>${esc(p.n)}</b><div class="small muted">${fmtKm(km)}${dayOf(p.id)[0] ? ` · in programma ${short(dayOf(p.id)[0])}` : " · non in programma"}</div></div>${icon("ChevronRight")}</div>`).join("") : `<p class="small muted" style="margin:10px 0 0">Nessun posto della lista entro 1,5 km.</p>`}</div>`;
  }


  const CITTA_METEO = [["Tokyo", 35.68, 139.76], ["Kyoto", 35.01, 135.77], ["Osaka", 34.69, 135.50], ["Nara", 34.68, 135.83], ["Fuji", 35.50, 138.76], ["Kanazawa", 36.56, 136.66]];
  const WMO = c => c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "❄️" : c <= 82 ? "🌦️" : c <= 86 ? "🌨️" : "⛈️";
  const ZCOORD = { tokyo: ["Tokyo", 35.68, 139.76], vicino: ["Kamakura", 35.32, 139.55], kyoto: ["Kyoto", 35.01, 135.77], osaka: ["Osaka", 34.69, 135.50], nara: ["Nara", 34.68, 135.83], fuji: ["Hakone", 35.23, 139.03], kanazawa: ["Kanazawa", 36.56, 136.66], altre: ["Tokyo", 35.68, 139.76] };
  async function loadWeather(today) {
    const [city, lat, lng] = ZCOORD[dayZone(today) || "tokyo"];
    const key = city + today;
    const paint = w => {
      const pill = $("#wpill"); if (pill && w) { pill.hidden = false; pill.innerHTML = `${WMO(w.cur[1])} ${esc(city)} ${Math.round(w.cur[0])}°`; }
      const el = $("#weather"); if (!el || !w) return;
      $("#wtitle").textContent = "Meteo a " + city;
      el.innerHTML = `<div>Adesso<b>${WMO(w.cur[1])} ${Math.round(w.cur[0])}°</b></div>` + w.days.map(([n, c, mx, mn, pr]) => `<div>${n}<b>${WMO(c)} ${Math.round(mx)}°</b><small>min ${Math.round(mn)}° · pioggia ${pr ?? 0}%</small></div>`).join("");
      $("#wtime").textContent = "agg. " + new Date(w.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    };
    const cached = LS.get("weather2", null);
    if (cached?.key === key) { paint(cached); if (Date.now() - cached.at < 20 * 60e3) return; }
    try {
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2&timezone=Asia%2FTokyo`)).json();
      const w = { key, at: Date.now(), cur: [j.current.temperature_2m, j.current.weather_code], days: j.daily.time.map((_, i) => [i ? "Domani" : "Oggi", j.daily.weather_code[i], j.daily.temperature_2m_max[i], j.daily.temperature_2m_min[i], j.daily.precipitation_probability_max[i]]) };
      LS.set("weather2", w); paint(w);
    } catch { if (cached?.key !== key) { const el = $("#weather"); if (el) el.innerHTML = `<div style="grid-column:1/-1">Meteo non disponibile offline</div>`; } }
  }

  // ——— GIORNI ———
  let selDay = LS.get("selDay", null), editMode = false;
  const ZSHORT = { tokyo: "Tokyo", vicino: "Dintorni", kyoto: "Kyoto", osaka: "Osaka", nara: "Nara", fuji: "Fuji", kanazawa: "Kanaz.", altre: "Altro" };
  function renderGiorni(sub) {
    const today = todayJP();
    if (sub && DAYS.includes(sub)) selDay = sub;
    if (!DAYS.includes(selDay)) selDay = DAYS.includes(today) ? today : DAYS[0];
    LS.set("selDay", selDay);
    const d = selDay, i = dayIndex(d), day = getDay(d);
    const first = day.i.map(id => byId[id]).find(p => p && photoUrl(p.id));
    const editedBy = lastEdit?.by && lastEdit.by !== "?" ? ` · ultima modifica di ${esc(lastEdit.by)}` : "";

    view.innerHTML = `
      <div class="daystrip" id="strip">${DAYS.map((x, k) => { const z = dayZone(x), prev = k ? dayZone(DAYS[k - 1]) : null, move = z && prev && z !== prev; return `<a class="dchip${x === d ? " on" : ""}${x === today ? " today" : ""}" href="#giorni/${x}" style="--c:${z ? zona[z].colore : "var(--muted)"}" aria-label="Giorno ${k + 1}${z ? ", " + zona[z].nome : ""}${move ? ", trasferimento" : ""}"><small>${fmtDay(x, { weekday: "short" }).replace(".", "")}</small><b>${fmtDay(x, { day: "numeric" })}</b><em>${move ? icon("TrainFront") : ""}${z ? ZSHORT[z] : "libero"}</em></a>`; }).join("")}</div>
      <div class="daycover" id="cover">${first ? `<div class="ph" data-bg="${photoUrl(first.id, 960)}"></div>` : art()}
        <span class="dn">Giorno ${i + 1} / ${DAYS.length}</span>
        <div class="dtxt"><div class="kicker">${fmtDay(d)}</div>${editMode ? `<input id="dlabel" value="${esc(day.l)}" placeholder="Dai un nome al giorno…" aria-label="Nome del giorno">` : `<div class="dtitle">${esc(day.l) || "Giorno libero"}</div>`}</div>
      </div>
      ${editMode ? `<textarea id="dnote" rows="2" placeholder="Nota del giorno (orari, treni, cose da ricordare)…" style="margin-bottom:14px">${esc(day.n || "")}</textarea>`
        : day.n ? `<div class="daynote">${icon("Sparkles")}<span>${esc(day.n)}</span></div>` : ""}
      ${dayPren(d)}
      <div class="dayact">
        <button id="add">${icon("Plus")}<span>Aggiungi</span></button>
        ${day.i.length ? `<a href="#mappa" id="dmap">${icon("Map")}<span>Mappa</span></a>` : `<button disabled>${icon("Map")}<span>Mappa</span></button>`}
        ${day.i.length > 1 ? `<a href="${gmRoute(day.i)}" target="_blank" rel="noopener">${icon("Route")}<span>Percorso</span></a>` : `<button disabled>${icon("Route")}<span>Percorso</span></button>`}
        <button id="edit" class="${editMode ? "on" : ""}" ${day.i.length || editMode ? "" : "disabled"}>${icon(editMode ? "Check" : "Pencil")}<span>${editMode ? "Fatto" : "Modifica"}</span></button>
      </div>
      ${editMode && day.i.length ? `<p class="small muted" style="margin:0 0 6px">Trascina il numero per cambiare l'ordine · metti un orario alle tappe</p>` : ""}
      ${day.i.length ? `<ul class="tl${editMode ? " editing" : ""}">${day.i.map((id, k) => {
        const p = byId[id]; if (!p) return "";
        const next = byId[day.i[k + 1]], tm = day.t?.[id];
        const right = editMode ? `<div class="edit">${timeIn(`class="ttime" data-time="${id}" value="${esc(tm || "")}" aria-label="Orario"`)}<button class="iconbtn danger" data-rm="${k}" aria-label="Rimuovi">${icon("Trash2")}</button></div>` : "";
        const row = placeRow(p, { noDays: true, compact: true, noZone: true, right }).replace('<div class="meta">', `<div class="meta">${closedOn(p, d) ? closedPill(p) : ""}${tm ? `<span class="pill">${icon("Clock")} ${esc(tm)}</span>` : ""}`);
        const fatto = day.f?.includes(id);
        return `<li${fatto ? ' class="done"' : ""}>${editMode ? `<span class="n grip" data-grip="${k}" style="background:${zona[p.z].colore}" aria-label="Trascina per spostare">${icon("GripVertical")}</span>` : fatto ? `<span class="n done" aria-label="Fatta">済</span>` : `<span class="n" style="background:${zona[p.z].colore}">${k + 1}</span>`}<div class="sw">${editMode ? "" : `<div class="swipebg">${icon("Trash2")} Togli</div>`}${row}</div>${next ? `<div class="hop">${hop(p, next)}</div>` : ""}</li>`;
      }).join("")}</ul>` : `<div class="empty" style="margin-top:14px">Nessuna tappa per questo giorno.<br><button class="btn small primary" id="add2" style="margin-top:10px">${icon("Plus")} Aggiungi tappe</button></div>`}
      <div class="btns daynav">
        ${i > 0 ? `<a class="btn" href="#giorni/${DAYS[i - 1]}">‹ Giorno ${i}</a>` : ""}
        ${i < DAYS.length - 1 ? `<a class="btn" href="#giorni/${DAYS[i + 1]}">Giorno ${i + 2} ›</a>` : ""}
      </div>
      <div class="card daysync">
        <div class="row"><span class="contact"><span class="ic">${icon(sync ? "Users" : "Smartphone")}</span></span><div class="grow small">${sync
          ? `<b>Programma condiviso</b> tra voi quattro<div class="muted">${syncStatus === "online" ? "Sincronizzato" : "In attesa di rete"}${editedBy}</div>`
          : `<b>Programma salvato su questo telefono</b><div class="muted">Per mandarlo agli altri usa Condividi.</div>`}</div></div>
        <div class="btns">${sync ? "" : `<button class="btn small" id="share">${icon("Share2")} Condividi</button>`}<button class="btn small ghost" id="reset">${icon("RotateCcw")} Ripristina bozza</button></div>
      </div>
    `;
    $("#strip .on")?.scrollIntoView({ inline: "center", block: "nearest" });
    bindPcards();
    $("#dlabel")?.addEventListener("change", e => { day.l = e.target.value.trim(); savePlan(); });
    
    $("#dnote")?.addEventListener("change", e => { day.n = e.target.value.trim(); savePlan(); });
    $("#add").onclick = () => openPicker(d);
    $("#add2")?.addEventListener("click", () => openPicker(d));
    $("#dmap")?.addEventListener("click", () => { mapFilter = { z: "all", d }; });
    $("#edit").onclick = () => { editMode = !editMode; keepScroll(() => renderGiorni()); };
    // togli una tappa (con "Annulla")
    const removeStop = k => {
      const dd = getDay(d), id = dd.i[k], tm = dd.t?.[id]; if (!id) return;
      dd.i.splice(k, 1); if (dd.t) delete dd.t[id]; savePlan(); keepScroll(() => renderGiorni());
      toast(`${byId[id]?.n || "Tappa"}: tolta`, () => { const d2 = getDay(d); markFresh(id); d2.i.splice(Math.min(k, d2.i.length), 0, id); if (tm) (d2.t ||= {})[id] = tm; savePlan(); keepScroll(() => renderGiorni()); });
    };
    $$("[data-rm]").forEach(b => b.onclick = () => collapse(b.closest("li")).then(() => removeStop(+b.dataset.rm)));
    $$("[data-time]").forEach(inp => inp.onchange = () => {
      const dd = getDay(d); dd.t ||= {};
      if (inp.value) dd.t[inp.dataset.time] = inp.value; else delete dd.t[inp.dataset.time];
      if (!Object.keys(dd.t).length) delete dd.t;
      savePlan();
    });
    // trascina il numero per riordinare
    $$("[data-grip]").forEach(g => g.addEventListener("pointerdown", e => {
      e.preventDefault();
      const li = g.closest("li"), items = [...li.parentElement.children], from = items.indexOf(li);
      const rects = items.map(x => x.getBoundingClientRect()), y0 = e.clientY, h = rects[from].height;
      let to = from;
      g.setPointerCapture(e.pointerId); li.classList.add("dragging"); buzz();
      const move = ev => {
        const dy = ev.clientY - y0, mid = rects[from].top + h / 2 + dy;
        li.style.transform = `translateY(${dy}px)`;
        to = rects.filter((r, j) => j !== from && r.top + r.height / 2 < mid).length;
        items.forEach((x, j) => { if (j === from) return; x.style.transform = from < to && j > from && j <= to ? `translateY(${-h}px)` : to < from && j >= to && j < from ? `translateY(${h}px)` : ""; });
      };
      const up = () => {
        g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        items.forEach(x => (x.style.transform = "")); li.classList.remove("dragging");
        if (to !== from) { const dd = getDay(d), [id] = dd.i.splice(from, 1); dd.i.splice(to, 0, id); savePlan(); buzz(); }
        keepScroll(() => renderGiorni());
      };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    }));
    // scorri una tappa verso sinistra per toglierla
    if (!editMode) $$(".tl li").forEach((li, k) => {
      const card = $(".place", li); if (!card) return;
      let x0 = 0, y0 = 0, dx = 0, on = null;
      li.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; on = null; card.style.transition = "none"; }, { passive: true });
      li.addEventListener("touchmove", e => {
        const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
        if (on === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) on = Math.abs(mx) > Math.abs(my) * 1.3 && mx < 0;
        if (!on) return;
        dx = Math.min(0, mx); card.style.transform = `translateX(${dx}px)`; li.classList.add("swiping"); li.classList.toggle("swipe-go", dx < -110);
      }, { passive: true });
      li.addEventListener("touchend", () => {
        card.style.transition = "";
        if (on && dx < -110) { card.style.transform = "translateX(-110%)"; setTimeout(() => collapse(li).then(() => removeStop(k)), 140); }
        else { card.style.transform = ""; li.classList.remove("swipe-go"); setTimeout(() => li.classList.remove("swiping"), 220); }
      });
    });
    $("#share")?.addEventListener("click", sharePlan);
    $("#reset").onclick = async () => {
      if (!(await ask({ title: "Ripristinare la bozza?", text: `Il programma torna alla bozza proposta (arrivo a Tokyo, partenza da Osaka). Le modifiche andranno perse${sync ? " per tutti e quattro" : ""}.`, ok: "Ripristina", danger: true, icon: "RotateCcw" }))) return;
      plan = clone(window.BOZZA || {}); savePlan(); toast("Bozza ripristinata"); render();
    };
    // swipe orizzontale sulla copertina per cambiare giorno
    let x0 = null;
    $("#cover").addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    $("#cover").addEventListener("touchend", e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) { const j = i + (dx < 0 ? 1 : -1); if (DAYS[j]) go("#giorni/" + DAYS[j]); }
    });
  }
  function keepScroll(fn) { const y = SC.scrollTop; fn(); SC.scrollTop = y; }

  function openPicker(d) {
    let fz = dayZone(d) || "all", fq = "";
    const v0 = dataVer;
    const draw = el => {
      const list = LUOGHI.filter(p => !p.out && (fz === "all" || p.z === fz) && (!fq || matches(p.n + " " + p.jp + " " + p.d, fq)));
      $("#pk-list", el).innerHTML = list.map(p => {
        const inDay = plan[d]?.i?.includes(p.id);
        const other = dayOf(p.id).filter(x => x !== d);
        return placeRow(p, { noDays: true, compact: true, noZone: fz !== "all", right: `<span class="iconbtn" style="${inDay ? "background:var(--ok);color:#fff" : ""}">${icon(inDay ? "Check" : "Plus")}</span>` })
          .replace('class="place', `data-pick="${p.id}" class="place`).replace(/data-place="[^"]+"/, "")
          .replace('<div class="meta">', `<div class="meta">${closedOn(p, d) ? closedPill(p) : ""}${other.length ? `<span class="pill">già il ${other.map(short).join(", ")}</span>` : ""}`);
      }).join("") + `<button class="btn addl" data-newl style="width:100%;margin-top:6px">${icon("Plus")} ${fq ? `Non c'è? Aggiungi «${esc($("#pk-q", el).value.trim())}»` : "Aggiungi un luogo che non è in lista"}</button>`;
    };
    openSheet(`
      <h2>Giorno ${dayIndex(d) + 1}</h2><p class="lead">${cap1(fmtDay(d))} · tocca per aggiungere o togliere</p>
      <div class="searchbox">${icon("Search")}<input type="search" id="pk-q" placeholder="Cerca un luogo…" autocomplete="off"></div>
      <div class="chips">${[["all", "Tutte"], ...ZONE.map(z => [z.id, z.nome])].map(([id, n]) => `<button class="chip${id === fz ? " on" : ""}" data-pz="${id}">${id !== "all" ? `<span class="dot" style="background:${zona[id].colore}"></span>` : ""}${esc(n)}</button>`).join("")}</div>
      <div id="pk-list"></div>
      <div style="position:sticky;bottom:0;padding-top:10px;background:linear-gradient(transparent, var(--bg) 30%)"><button class="btn primary" data-close style="width:100%">Fatto</button></div>
    `, el => {
      draw(el);
      $("#pk-q", el).oninput = e => { fq = e.target.value.toLowerCase().trim(); draw(el); };
      $$("[data-pz]", el).forEach(c => c.onclick = () => { fz = c.dataset.pz; $$("[data-pz]", el).forEach(x => x.classList.toggle("on", x === c)); draw(el); });
      $("#pk-list", el).onclick = e => {
        if (e.target.closest("[data-newl]")) return editLuogo({ n: $("#pk-q", el).value.trim() }, d);
        const it = e.target.closest("[data-pick]"); if (!it) return;
        const day = getDay(d); const id = it.dataset.pick; const k = day.i.indexOf(id);
        if (k >= 0) day.i.splice(k, 1); else { day.i.push(id); markFresh(id); buzz(); if (closedOn(byId[id], d)) toast(`Attenzione: ${byId[id].n} è chiuso di ${byId[id].chiuso}`); }
        savePlan(); draw(el);
      };
    }, () => { if (dataVer !== v0 && location.hash.startsWith("#giorni")) keepScroll(render); });
  }

  // ——— condivisione programma via link (quando la sync non è attiva) ———
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  async function sharePlan() {
    const clean = Object.fromEntries(Object.entries(plan).filter(([, v]) => v.l || v.n || v.i.length));
    const url = location.origin + location.pathname + "#import=" + b64e(JSON.stringify({ p: clean, b: [...booked] }));
    const text = "Ecco il programma aggiornato del Giappone 🇯🇵 — aprilo per importarlo:";
    try {
      if (navigator.share) await navigator.share({ title: "Programma Giappone", text, url });
      else { await navigator.clipboard.writeText(url); toast("Link copiato: mandalo nel gruppo"); }
    } catch (e) { if (e?.name !== "AbortError") prompt("Copia questo link:", url); }
  }
  function maybeImport() {
    const m = location.hash.match(/^#import=(.+)$/); if (!m) return false;
    let data; try { data = JSON.parse(b64d(m[1])); } catch { toast("Link non valido"); location.replace("#giorni"); return true; }
    const n = Object.values(data.p || {}).reduce((s, d) => s + (d.i?.length || 0), 0), g = Object.keys(data.p || {}).length, nb = data.b?.length || 0;
    history.replaceState(null, "", "#giorni"); render();
    openSheet(`<h2>Importa programma</h2><p>Questo link contiene un programma con <b>${n} ${n === 1 ? "tappa" : "tappe"}</b> in ${g} ${g === 1 ? "giorno" : "giorni"}${nb ? ` e ${nb} ${nb === 1 ? "prenotazione segnata" : "prenotazioni segnate"}` : ""}.</p><p class="muted small">Sostituirà il programma salvato su questo telefono.</p><div class="btns"><button class="btn" data-close>Annulla</button><button class="btn primary" id="imp">Importa</button></div>`, el => {
      $("#imp", el).onclick = () => {
        plan = data.p || {}; if (data.b) booked = new Set(data.b);
        savePlan(); closeSheet(); toast("Programma importato ✓"); render();
      };
    });
    return true;
  }

  // ——— LUOGHI ———
  // liste lunghe: si disegnano subito le prime righe (quelle che si vedono), il resto al frame successivo
  let progTok = 0, progRest = null;
  function putProgressive(el, html) {
    const tok = ++progTok, cut = html.split(/(?=<h3>|<div class="place)/);
    if (cut.length <= 30) { el.innerHTML = html; lazyScan(); return; }
    el.innerHTML = cut.slice(0, 26).join(""); lazyScan();
    const rest = () => { progRest = null; if (tok !== progTok) return; el.insertAdjacentHTML("beforeend", cut.slice(26).join("")); lazyScan(); };
    progRest = rest; setTimeout(() => progRest === rest && rest(), 40);
  }
  let lf = { z: "all", q: "", out: false, pren: false, mine: false, near: null, view: LS.get("lview", "g") };
  // galleria: per ogni città una fila di card a foto piena da sfogliare (come Apple Maps); l'elenco resta per cercare e filtrare
  function galCard(p) {
    const ds = dayOf(p.id), [ic, col] = cat(p), u = photoUrl(p.id, 960);
    return `<div class="gcard${p.id === freshId ? " fresh" : ""}" data-place="${p.id}">${u ? `<div class="ph" data-bg="${u}"></div>` : `<div class="ph none" style="background:linear-gradient(135deg, ${zona[p.z].colore}, ${col})">${icon(ic)}</div>`}
      <div class="gin"><b>${esc(p.n)}</b>${p.jp ? `<small class="jp">${esc(p.jp)}</small>` : ""}<div class="gtags">${ds[0] ? `<span>${icon("CalendarDays")} ${short(ds[0])}</span>` : ""}${p.pren ? `<span${booked.has(p.id) ? ' class="ok"' : ""}>${booked.has(p.id) ? "済 prenotato" : `${icon("Ticket")} da prenotare`}</span>` : ""}${p.dur ? `<span>${icon("Clock")} ${esc(p.dur)}</span>` : ""}</div></div></div>`;
  }
  function renderLuoghi() {
    view.innerHTML = `
      <div class="between"><h2>Luoghi</h2><button class="btn small primary" id="addl" data-top>${icon("Plus")} Aggiungi</button></div><p class="lead">${LUOGHI.filter(p => !p.out && !p.mine).length} posti dalla vostra lista Wanderlog${LUOGHI.length > BASE_N ? ` · ${LUOGHI.length - BASE_N} aggiunti da voi` : ""}</p>

      <div class="searchbox">${icon("Search")}<input type="search" id="lq" placeholder="Cerca templi, quartieri, cibo…" value="${esc(lf.q)}" autocomplete="off"></div>
      <div class="chips">
        ${[["all", "Tutte"], ...ZONE.map(z => [z.id, z.nome])].map(([id, n]) => `<button class="chip${lf.z === id ? " on" : ""}" data-z="${id}">${id !== "all" ? `<span class="dot" style="background:${zona[id].colore}"></span>` : ""}${esc(n)}</button>`).join("")}
      </div>
      <div class="chips" style="padding-top:0">
        <button class="chip${lf.near ? " on" : ""}" id="fnear">${icon("LocateFixed")} Vicino a me</button>
        <button class="chip${lf.pren ? " on" : ""}" id="fpren">${icon("Ticket")} Da prenotare</button>
        ${LUOGHI.length > BASE_N ? `<button class="chip${lf.mine ? " on" : ""}" id="fmine">${icon("UserRound")} Aggiunti da voi</button>` : ""}
        <button class="chip${lf.out ? " on" : ""}" id="fout">Scartati ed eliminati</button>
      </div>
      <div class="between" style="margin:0 0 4px"><span class="small muted" id="lcount"></span><div class="seg lview"><button data-lv="g">${icon("LayoutGrid")} Foto</button><button data-lv="l">${icon("ListChecks")} Elenco</button></div></div>
      <div id="llist"></div>`;
    const draw = () => {
      const qq = lf.q.toLowerCase().trim();
      const gallery = lf.view === "g" && !qq && !lf.near && !lf.pren && !lf.mine && !lf.out;
      $$("[data-lv]").forEach(b => b.classList.toggle("on", b.dataset.lv === lf.view));
      if (gallery) {
        const zs = lf.z === "all" ? ZONE.map(z => z.id) : [lf.z];
        let html = "", n = 0;
        for (const z of zs) {
          const ps = LUOGHI.filter(p => !p.out && p.z === z).sort((a, b) => (dayOf(a.id)[0] || "9").localeCompare(dayOf(b.id)[0] || "9") || (photoUrl(b.id) ? 1 : 0) - (photoUrl(a.id) ? 1 : 0));
          if (!ps.length) continue; n += ps.length;
          html += `<h3 class="galh"><span class="dot" style="background:${zona[z].colore}"></span>${esc(zona[z].nome)}<small>${ps.length}</small></h3><div class="gal">${ps.map(galCard).join("")}</div>`;
        }
        $("#lcount").textContent = `${n} posti`;
        $("#llist").innerHTML = html || `<p class="empty">Nessun risultato</p>`; lazyScan(); return;
      }
      const list = LUOGHI.filter(p => (lf.out || !p.out) && (lf.z === "all" || p.z === lf.z) && (!lf.pren || p.pren) && (!lf.mine || p.mine) && (!qq || matches(p.n + " " + p.jp + " " + p.d + " " + (CAT[p.c]?.[2] || "") + " " + zona[p.z].nome, qq)))
        .sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (lf.near ? kmBetween(lf.near, a) - kmBetween(lf.near, b) : zoneOrder[a.z] - zoneOrder[b.z]));
      let last = null, html = "";
      if (lf.near) {
        putProgressive($("#llist"), list.slice(0, 40).map(p => placeRow(p).replace('<div class="meta">', `<div class="meta"><span class="pill">${icon("Navigation")} ${fmtKm(kmBetween(lf.near, p))}</span>`)).join("") || `<p class="empty">Nessun risultato</p>`);
        return;
      }
      for (const p of list) {
        const key = p.out ? "out" : p.z;
        if (key !== last && lf.z === "all") html += `<h3>${p.out ? "Scartati ed eliminati" : `<span class="dot" style="background:${zona[p.z].colore};margin-right:6px"></span>${esc(zona[p.z].nome)}`}</h3>`;
        last = key; html += placeRow(p, { noZone: lf.z !== "all" || true });
      }
      $("#lcount").textContent = `${list.length} ${list.length === 1 ? "posto" : "posti"}`;
      putProgressive($("#llist"), html || (qq ? `<div class="empty">Nessun luogo trovato per «${esc(lf.q.trim())}».<br><button class="btn small primary" id="addq" style="margin-top:10px">${icon("Plus")} Aggiungilo</button></div>` : `<p class="empty">Nessun risultato</p>`));
      $("#addq")?.addEventListener("click", () => editLuogo({ n: lf.q.trim() }));
    };
    $$("[data-lv]").forEach(b => b.onclick = () => { lf.view = b.dataset.lv; LS.set("lview", lf.view); buzz(); draw(); });
    draw();
    $("#lq").oninput = e => { lf.q = e.target.value; draw(); };
    $$("[data-z]").forEach(c => c.onclick = () => { lf.z = c.dataset.z; $$("[data-z]").forEach(x => x.classList.toggle("on", x === c)); draw(); });
    $("#fpren").onclick = e => { lf.pren = !lf.pren; e.currentTarget.classList.toggle("on", lf.pren); draw(); };
    $("#fout").onclick = e => { lf.out = !lf.out; e.currentTarget.classList.toggle("on", lf.out); draw(); };
    $("#fmine")?.addEventListener("click", e => { lf.mine = !lf.mine; e.currentTarget.classList.toggle("on", lf.mine); draw(); });
    $("#addl").onclick = () => editLuogo({});
    $("#fnear").onclick = e => {
      const b = e.currentTarget;
      if (lf.near) { lf.near = null; b.classList.remove("on"); return draw(); }
      if (!navigator.geolocation) return toast("Posizione non disponibile");
      toast("Cerco la tua posizione…");
      navigator.geolocation.getCurrentPosition(pos => { lf.near = { lat: pos.coords.latitude, lng: pos.coords.longitude }; dataVer++; if (!b.isConnected) return; b.classList.add("on"); draw(); },
        () => toast("Non riesco a leggere la posizione"), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    };
  }

  // ——— MAPPA ———
  // Due motori con la stessa interfaccia: Google (online) e MapLibre (offline, zone scaricate).
  // In automatico si usa Google; senza rete, o se Google non si carica, si passa alla mappa offline.
  let mapFilter = { z: "all", d: "" }, mapFocus = null;
  let mapMode = LS.get("mapMode", "auto");          // "auto" | "offline"
  let mapsPromise, eng = null;                      // motore attivo
  const engines = {}, engineInit = {};              // google / offline, creati una volta sola
  function loadMaps() {
    if (mapsPromise) return mapsPromise;
    mapsPromise = new Promise((res, rej) => {
      window.gm_authFailure = () => rej(new Error("auth"));
      window.__gmReady = () => res();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${T.mapsKey}&loading=async&callback=__gmReady&language=it&region=JP&v=weekly`;
      s.async = true; s.onerror = () => { mapsPromise = null; rej(new Error("net")); };
      document.head.appendChild(s);
      // rete lenta: dopo 8 secondi si passa alla mappa offline, e la prossima volta si riprova Google
      setTimeout(() => { if (!window.google?.maps?.Map) { mapsPromise = null; rej(new Error("timeout")); } }, 8000);
    });
    return mapsPromise;
  }
  const MAP_LIGHT = [
    { elementType: "geometry", stylers: [{ color: "#f2ede4" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#5f564b" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f7f3ec" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#b9d2dc" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f1dcbc" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dae4c8" }] },
    { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#c9b79c" }] },
    { featureType: "transit.station", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d8cdbb" }] },
  ];
  const MAP_DARK = [
    { elementType: "geometry", stylers: [{ color: "#1b1916" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#9a8f80" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#141210" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1820" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2722" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3329" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#1d2619" }] },
    { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#4a4236" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3a352d" }] },
  ];

  // segnaposto (stesso disegno per i due motori)
  const pinCache = {};
  function pinSvg(col, inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 42.5s14-14.2 14-24.5A14 14 0 0 0 3 18c0 10.3 14 24.5 14 24.5z" fill="${col}" stroke="#fff" stroke-width="2"/>${inner}</svg>`;
  }
  function pinUrl(kind, p, n) {
    const key = kind + (p ? p.z + p.c : "") + (n || "");
    if (!pinCache[key]) {
      const col = kind === "hotel" ? "#2e6fb0" : zona[p.z].colore;
      const glyph = kind === "hotel" ? "BedDouble" : cat(p)[0];
      const inner = n
        ? `<circle cx="17" cy="16" r="9.5" fill="#fff"/><text x="17" y="20.3" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="${col}">${n}</text>`
        : `<g transform="translate(8.6 7.6) scale(.7)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${nodesSvg(iconNodes(glyph))}</g>`;
      pinCache[key] = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(pinSvg(col, inner));
    }
    return pinCache[key];
  }
  const pinSize = n => (n ? [38, 49] : [30, 39]);
  function iwHtml(id) {
    const p = byId[id];
    return `<div class="gm-iw">${photo(id, 330)}<div class="iwtxt"><b>${esc(p.n)}</b><div class="jp">${esc(p.jp)}</div><button data-iw="${id}">Dettagli e indicazioni</button></div></div>`;
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-iw]"); if (b) openPlace(b.dataset.iw); });
  const hotelsWithPos = () => lists.prenotazioni.filter(p => p.tipo === "hotel" && p.lat && p.lng);

  // ——— puntine vicine raggruppate in un pallino con il numero (si apre toccandolo) ———
  const CLUSTER_PX = 46;
  function worldXY(p, scale) { const s = Math.sin(p.lat * Math.PI / 180); return [(p.lng + 180) / 360 * scale, (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale]; }
  function clusterize(ids, zoom, tile) {
    const scale = tile * 2 ** zoom, groups = [];
    for (const id of ids) {
      const [x, y] = worldXY(byId[id], scale);
      const g = groups.find(c => (c.x - x) ** 2 + (c.y - y) ** 2 < CLUSTER_PX ** 2);
      if (g) g.ids.push(id); else groups.push({ x, y, ids: [id] });
    }
    return groups.map(g => {
      const ps = g.ids.map(id => byId[id]), c = {};
      ps.forEach(p => (c[p.z] = (c[p.z] || 0) + 1));
      return { ids: g.ids, lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length, lng: ps.reduce((a, p) => a + p.lng, 0) / ps.length, col: zona[Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]].colore };
    });
  }
  const clusterCache = {};
  function clusterIcon(n, col) {
    const key = n + col;
    if (!clusterCache[key]) {
      const r = n < 10 ? 16 : n < 50 ? 19 : 22, sz = r * 2 + 10, c = sz / 2;
      clusterCache[key] = { size: sz, url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><circle cx="${c}" cy="${c}" r="${r + 4}" fill="${col}" opacity=".28"/><circle cx="${c}" cy="${c}" r="${r}" fill="${col}" stroke="#fff" stroke-width="2.5"/><text x="${c}" y="${c + 4.6}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${n < 100 ? 13.5 : 12}" fill="#fff">${n}</text></svg>`) };
    }
    return clusterCache[key];
  }
  // quali puntine mostrare e quali pallini: niente raggruppamento con le tappe di un giorno o da molto vicino
  function clusterPlan(vis, nums, zoom, tile, maxZ) {
    const ids = [...vis].filter(id => byId[id]);
    if (Object.keys(nums).length || zoom >= maxZ) return { groups: [], hidden: new Set() };
    const groups = clusterize(ids, zoom, tile).filter(g => g.ids.length > 1), hidden = new Set();
    groups.forEach(g => g.ids.forEach(id => hidden.add(id)));
    return { groups, hidden };
  }

  // la scheda di un luogo deve stare tutta tra i filtri in alto e la barra (o le schede) in basso
  function keepInView(el, panBy) {
    if (!el) return;
    const r = el.getBoundingClientRect(), top = ($(".map-ui")?.getBoundingClientRect().bottom || 0) + 12;
    const car = $("#mcar"), bottom = (car && !car.hidden ? car.getBoundingClientRect().top : ($("#tabs")?.getBoundingClientRect().top || innerHeight)) - 12;
    const dy = r.top < top ? r.top - top : r.bottom > bottom ? r.bottom - bottom : 0;
    if (dy) panBy(Math.round(dy));
  }

  // ——— motore Google ———
  function googleEngine(el) {
    let map, iw, you, route, curVis = new Set(), curNums = {}, lastZ = null, cl = []; const mk = {}, hk = {};
    const recluster = () => {
      if (!map) return;
      const z = map.getZoom(); lastZ = z;
      cl.forEach(m => m.setMap(null)); cl = [];
      const { groups, hidden } = clusterPlan(curVis, curNums, z, 256, 16);
      for (const [id, m] of Object.entries(mk)) m.setVisible(curVis.has(id) && !hidden.has(id));
      for (const g of groups) {
        const ic = clusterIcon(g.ids.length, g.col);
        const m = new google.maps.Marker({ map, position: { lat: g.lat, lng: g.lng }, zIndex: 200 + g.ids.length, title: `${g.ids.length} luoghi`,
          icon: { url: ic.url, scaledSize: new google.maps.Size(ic.size, ic.size), anchor: new google.maps.Point(ic.size / 2, ic.size / 2) } });
        m.addListener("click", () => { iw.close(); zoomInto(g); });
        cl.push(m);
      }
    };
    const openIw = (id, anchor) => {
      iw.setContent(iwHtml(id)); iw.open({ map, anchor });
      google.maps.event.addListenerOnce(iw, "domready", () => setTimeout(() => keepInView(el.querySelector(".gm-style-iw-c"), dy => map.panBy(0, dy)), 60));
    };
    const zoomInto = g => {
      const b = new google.maps.LatLngBounds(); g.ids.forEach(id => b.extend({ lat: byId[id].lat, lng: byId[id].lng }));
      const span = Math.max(b.toSpan().lat(), b.toSpan().lng());
      if (span < .002) { map.panTo({ lat: g.lat, lng: g.lng }); map.setZoom(Math.min(18, map.getZoom() + 3)); }
      else map.fitBounds(b, { top: mapPadTop(), bottom: mapPadBottom(), left: 50, right: 50 });
    };
    const icon = (url, n) => { const [w, h] = pinSize(n); return { url, scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(w / 2, h - 1) }; };
    return {
      kind: "google",
      async init() {
        await loadMaps();
        const { Map, InfoWindow } = await google.maps.importLibrary("maps");
        const { Marker } = await google.maps.importLibrary("marker");
        map = new Map(el, {
          center: { lat: 35.3, lng: 137.5 }, zoom: 6, disableDefaultUI: true, gestureHandling: "greedy",   // zoom con due dita
          clickableIcons: false, styles: isDark() ? MAP_DARK : MAP_LIGHT, keyboardShortcuts: false,
        });
        iw = new InfoWindow({ headerDisabled: true });
        map.addListener("click", () => iw.close());
        map.addListener("idle", () => { if (map.getZoom() !== lastZ) recluster(); });
        route = new google.maps.Polyline({ map, strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#d4442f", scale: 3 }, offset: "0", repeat: "12px" }] });
      },
      show(vis, nums) {
        // puntine allineate ai luoghi (anche quelli aggiunti, modificati o tolti da voi)
        for (const p of LUOGHI) {
          if (p.out || mk[p.id]) continue;
          const m = new google.maps.Marker({ map, title: p.n });
          m.addListener("click", () => openIw(p.id, m));
          mk[p.id] = m;
        }
        for (const id of Object.keys(mk)) if (!byId[id]) { mk[id].setMap(null); delete mk[id]; }
        for (const [id, m] of Object.entries(mk)) { const p = byId[id]; m.setPosition({ lat: p.lat, lng: p.lng }); m.setTitle(p.n); }
        for (const [id, m] of Object.entries(mk)) { const n = nums[id] || 0; m.setIcon(icon(pinUrl("p", byId[id], n), n)); m.setZIndex(n ? 100 - n : 1); }
        curVis = vis; curNums = nums; recluster();
        for (const h of hotelsWithPos()) {
          hk[h.id] ||= new google.maps.Marker({ map, title: h.titolo, icon: icon(pinUrl("hotel")), zIndex: 150 });
          hk[h.id].setPosition({ lat: h.lat, lng: h.lng });
        }
        iw?.close();
      },
      route(pts) { route.setPath(pts.map(([lng, lat]) => ({ lat, lng }))); },
      fit(pts) {
        if (!pts.length) return;
        if (pts.length === 1) { map.setCenter({ lat: pts[0][1], lng: pts[0][0] }); map.setZoom(14); return; }
        const b = new google.maps.LatLngBounds(); pts.forEach(([lng, lat]) => b.extend({ lat, lng }));
        map.fitBounds(b, { top: mapPadTop(), bottom: mapPadBottom(), left: 40, right: 60 });
      },
      focus(id, popup) { const p = byId[id]; map.panTo({ lat: p.lat, lng: p.lng }); if (map.getZoom() < 16) map.setZoom(16); recluster(); if (popup) openIw(id, mk[id]); },
      you(ll) { you ||= new google.maps.Marker({ map, zIndex: 999, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#2e7bf6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } }); you.setPosition({ lat: ll[1], lng: ll[0] }); map.panTo({ lat: ll[1], lng: ll[0] }); map.setZoom(15); },
      theme() { map?.setOptions({ styles: isDark() ? MAP_DARK : MAP_LIGHT }); },
      destroy() { Object.values(mk).concat(Object.values(hk), cl, you ? [you] : []).forEach(m => m.setMap(null)); route?.setMap(null); google.maps.event.clearInstanceListeners(map); map = null; },
    };
  }

  // ——— motore offline (MapLibre) ———
  function offlineEngine(el) {
    let map, popup, you, curVis = new Set(), curNums = {}, cl = []; const mk = {}, hk = {}; let routePts = [];
    const recluster = () => {
      if (!map) return;
      cl.forEach(m => m.remove()); cl = [];
      const { groups, hidden } = clusterPlan(curVis, curNums, map.getZoom(), 512, 15);
      for (const [id, m] of Object.entries(mk)) m.getElement().style.display = curVis.has(id) && !hidden.has(id) ? "" : "none";
      for (const g of groups) {
        const ic = clusterIcon(g.ids.length, g.col), e = document.createElement("img");
        e.src = ic.url; e.width = e.height = ic.size; e.className = "ml-pin ml-cluster"; e.alt = `${g.ids.length} luoghi`; e.style.zIndex = 200 + g.ids.length;
        e.addEventListener("click", ev => { ev.stopPropagation(); popup.remove(); zoomInto(g); });
        cl.push(new maplibregl.Marker({ element: e, anchor: "center" }).setLngLat([g.lng, g.lat]).addTo(map));
      }
    };
    const openPop = id => {
      const q = byId[id]; popup.setLngLat([q.lng, q.lat]).setHTML(iwHtml(id)).addTo(map);
      setTimeout(() => keepInView(popup.getElement(), dy => {
        const target = map.unproject([el.clientWidth / 2, el.clientHeight / 2 + dy]);
        map.easeTo({ center: target, duration: 250 });
        setTimeout(() => { const n = map.getCenter(); if (Math.abs(n.lat - target.lat) + Math.abs(n.lng - target.lng) > 1e-6) map.jumpTo({ center: target }); }, 450);   // se l'animazione non è arrivata
      }), 40);
    };
    const zoomInto = g => {
      const pts = g.ids.map(id => [byId[id].lng, byId[id].lat]);
      const b = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      const span = Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest());
      if (span < .002) map.easeTo({ center: [g.lng, g.lat], zoom: Math.min(18, map.getZoom() + 3) });
      else { const h = el.clientHeight; map.fitBounds(b, { padding: h > 420 ? { top: mapPadTop(), bottom: mapPadBottom(), left: 50, right: 50 } : 30, maxZoom: 17 }); }
    };
    const markerEl = (url, n) => { const [w, h] = pinSize(n); const i = document.createElement("img"); i.src = url; i.width = w; i.height = h; i.className = "ml-pin"; return i; };
    const addRoute = () => {
      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#d4442f", "line-width": 3, "line-dasharray": [1.5, 1.5] }, layout: { "line-cap": "round" } });
      }
      map.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: routePts }, properties: {} });
    };
    return {
      kind: "offline",
      async init() {
        map = await OfflineMap.create(el, { dark: isDark(), center: [137.5, 35.3], zoom: 5 });
        await new Promise(r => { map.once("load", r); setTimeout(r, 6000); });   // senza rete può non arrivare mai: si va avanti comunque
        popup = new maplibregl.Popup({ offset: 34, closeButton: false, maxWidth: "240px", className: "ml-pop" });
        map.on("style.load", addRoute);
        map.on("zoomend", recluster);
        addRoute();
      },
      show(vis, nums) {
        for (const p of LUOGHI) {
          if (p.out || mk[p.id]) continue;
          const id = p.id, m = new maplibregl.Marker({ element: markerEl(pinUrl("p", p)), anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
          m.getElement().addEventListener("click", ev => { ev.stopPropagation(); openPop(id); });
          mk[id] = m;
        }
        for (const id of Object.keys(mk)) if (!byId[id]) { mk[id].remove(); delete mk[id]; }
        for (const [id, m] of Object.entries(mk)) m.setLngLat([byId[id].lng, byId[id].lat]);
        for (const [id, m] of Object.entries(mk)) {
          const n = nums[id] || 0, e = m.getElement(), [w, h] = pinSize(n);
          e.src = pinUrl("p", byId[id], n); e.width = w; e.height = h; e.style.zIndex = n ? 100 - n : 1;
        }
        curVis = vis; curNums = nums; recluster();
        for (const h of hotelsWithPos()) { if (hk[h.id]) hk[h.id].setLngLat([h.lng, h.lat]); else { const e = markerEl(pinUrl("hotel")); e.style.zIndex = 150; hk[h.id] = new maplibregl.Marker({ element: e, anchor: "bottom" }).setLngLat([h.lng, h.lat]).addTo(map); } }   // prima la posizione, poi sulla mappa
        popup?.remove();
      },
      route(pts) { routePts = pts; if (map.isStyleLoaded()) addRoute(); },
      fit(pts) {
        if (!pts.length) return;
        map.resize();
        if (pts.length === 1) { map.jumpTo({ center: pts[0], zoom: 14 }); return; }
        const b = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        const h = el.clientHeight, w = el.clientWidth;
        const pad = h > 420 && w > 200 ? { top: mapPadTop(), bottom: mapPadBottom(), left: 40, right: 60 } : 20;
        try { map.fitBounds(b, { padding: pad, duration: 0, maxZoom: 15 }); } catch { map.jumpTo({ center: b.getCenter(), zoom: 9 }); }
      },
      focus(id, pop) { const p = byId[id]; map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15.5) }); if (pop) setTimeout(() => openPop(id), 350); },
      you(ll) {
        // il segnaposto va creato già con la posizione: senza, la libreria va in errore a ogni movimento e la mappa si blocca
        if (!you) { const d = document.createElement("div"); d.className = "ml-you"; you = new maplibregl.Marker({ element: d }).setLngLat(ll).addTo(map); }
        else you.setLngLat(ll);
        // la mappa offline copre solo il Giappone: fuori (es. ancora in Italia) si avvisa invece di portare la mappa sul vuoto
        const [lng, lat] = ll;
        if (lng < 122 || lng > 154 || lat < 24 || lat > 46) return toast("Sei fuori dal Giappone: la mappa offline copre solo il Giappone");
        // zona non scaricata: senza rete ci sarebbe solo lo sfondo vuoto, quindi niente zoom stretto e un avviso
        OfflineMap.covers(ll).then(({ ok, baseMax }) => {
          if (!map) return;
          const off = !ok && !navigator.onLine;   // con la rete le zone non scaricate arrivano lo stesso
          map.easeTo({ center: ll, zoom: off ? Math.min(map.getZoom() + 1, baseMax) : 15 });
          if (off) toast("Questa zona non è scaricata: scaricala da Mappe offline per vedere le strade");
        }, () => map?.easeTo({ center: ll, zoom: 15 }));
      },
      theme() { if (map) OfflineMap.setTheme(map, isDark()); },
      resize() { map?.resize(); },
      destroy() { popup?.remove(); map?.remove(); map = null; },
    };
  }

  // la mappa è a tutto schermo: i margini dello zoom tengono conto di intestazione, filtri, barra e schede
  const mapPadTop = () => ($(".top")?.offsetHeight || 60) + 120;
  const mapPadBottom = () => { const n = $("#tabs"); const navSpace = n ? innerHeight - n.getBoundingClientRect().top : 110; return navSpace + ($("#mcar") && !$("#mcar").hidden ? 190 : 24); };
  async function useEngine(kind) {
    const slot = $("#mapslot"); if (!slot) return;
    if (!engines[kind]) {
      engineInit[kind] ||= (async () => {
        const el = document.createElement("div"); el.className = "mapel";
        const e = kind === "google" ? googleEngine(el) : offlineEngine(el);
        e.el = el; ($("#mapslot") || slot).appendChild(el);
        try { await e.init(); engines[kind] = e; } catch (err) { el.remove(); throw err; } finally { engineInit[kind] = null; }
      })();
      await engineInit[kind];
      if (!$("#mapslot")) return;   // nel frattempo si è cambiata pagina
    }
    eng = engines[kind];
    const cur = $("#mapslot");
    $(".map-loading", cur)?.remove();
    // l'altra mappa (se c'era) viene chiusa: libera memoria e batteria
    for (const [k, e] of Object.entries(engines)) if (e !== eng) { try { e.destroy?.(); } catch {} e.el.remove(); delete engines[k]; }
    if (eng.el.parentNode !== cur) cur.appendChild(eng.el);
    eng.el.hidden = false;
    eng.resize?.();
    $("#mmode") && ($("#mmode").innerHTML = eng.kind === "offline" ? `${icon("CloudOff")} Offline` : `${icon("Map")} Google`);
    $("#mmode")?.classList.toggle("on", eng.kind === "offline");
    // aperta da "Sulla mappa": niente inquadratura di tutto il Giappone (con Google arrivava dopo e copriva lo zoom sul luogo)
    applyMapFilter(!mapFocus);
    if (mapFocus) { const id = mapFocus; mapFocus = null; eng.focus(id, true); }
  }

  function renderMappa() {
    view.classList.add("full");
    const dayOpts = DAYS.map((d, i) => `<option value="${d}" ${mapFilter.d === d ? "selected" : ""}>Giorno ${i + 1} · ${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}${plan[d]?.l ? " — " + esc(plan[d].l) : ""}</option>`).join("");
    view.innerHTML = `<div class="mapwrap">
      <div class="map-ui">
        <div class="chips">${[["all", "Tutte"], ...ZONE.map(z => [z.id, z.nome])].map(([id, n]) => `<button class="chip${!mapFilter.d && mapFilter.z === id ? " on" : ""}" data-mz="${id}">${id !== "all" ? `<span class="dot" style="background:${zona[id].colore}"></span>` : ""}${esc(n)}</button>`).join("")}</div>
        <div class="row" style="gap:8px"><select id="mday" aria-label="Filtra per giorno"><option value="">Tutti i giorni</option>${dayOpts}</select>
          <button class="chip" id="mmode" title="Mappa Google o offline">${icon("Map")} Google</button><button class="chip" id="mdl" aria-label="Mappe offline">${icon("Download")}</button></div>
      </div>
      <div id="mapslot" style="position:absolute;inset:0"><div class="map-loading">${icon("Map")}<span>Carico la mappa…</span></div></div>
      <div class="mcar" id="mcar" hidden></div>
      <button class="locbtn" id="loc" aria-label="La mia posizione">${icon("LocateFixed")}</button>
    </div>`;
    $$("[data-mz]").forEach(c => c.onclick = () => { mapFilter = { z: c.dataset.mz, d: "" }; $("#mday").value = ""; $$("[data-mz]").forEach(x => x.classList.toggle("on", x === c)); applyMapFilter(true); });
    $("#mday").onchange = e => { mapFilter = { z: "all", d: e.target.value }; $$("[data-mz]").forEach(x => x.classList.toggle("on", !e.target.value && x.dataset.mz === "all")); applyMapFilter(true); };
    $("#loc").onclick = locateMe;
    $("#mdl").onclick = openOfflineMaps;
    $("#mmode").onclick = () => {
      if (eng?.kind === "offline") { if (!navigator.onLine) return toast("Sei offline: serve la rete per Google"); mapMode = "auto"; LS.set("mapMode", mapMode); pickEngine(); }
      else { mapMode = "offline"; LS.set("mapMode", mapMode); pickEngine(); }
    };
    pickEngine();
  }
  async function pickEngine() {
    const wantOffline = mapMode === "offline" || !navigator.onLine;
    try {
      if (!wantOffline) { try { return await useEngine("google"); } catch (err) { if (err.message === "auth") toast("Chiave Google rifiutata: uso la mappa offline"); } }
      await useEngine("offline");
    } catch (err) {
      console.warn("Mappa:", err);
      mapFallback(navigator.onLine ? "Non riesco a caricare la mappa. Riprova tra poco." : "Senza rete la mappa offline non è ancora pronta su questo telefono. Appena hai il Wi-Fi apri la Mappa una volta (o scarica le zone con ⬇): da lì in poi funzionerà sempre.");
    }
  }
  addEventListener("offline", () => { if (location.hash.startsWith("#mappa") && eng?.kind === "google") pickEngine(); });

  function mapFallback(msg) {
    view.classList.remove("full"); document.body.classList.remove("on-map");
    view.innerHTML = `<div class="card"><b>${icon("CloudOff")} Mappa non disponibile</b><p class="small">${msg}</p><button class="btn small primary" id="mretry">${icon("RotateCcw")} Riprova</button><p class="small muted" style="margin-bottom:0">Intanto ecco i luoghi: "Portami qui" apre l'app Google Maps.</p></div>
      ${LUOGHI.filter(p => !p.out && (mapFilter.d ? plan[mapFilter.d]?.i?.includes(p.id) : (mapFilter.z === "all" || p.z === mapFilter.z))).map(p => placeRow(p)).join("")}`;
    $("#mretry").onclick = () => renderMappa();
  }

  function applyMapFilter(fit) {
    if (!eng) return;
    const dayIds = mapFilter.d ? (plan[mapFilter.d]?.i || []).filter(id => byId[id]) : null;
    const vis = new Set(), nums = {};
    if (dayIds) dayIds.forEach((id, k) => { vis.add(id); nums[id] = k + 1; });
    else LUOGHI.forEach(p => { if (!p.out && (mapFilter.z === "all" || p.z === mapFilter.z)) vis.add(p.id); });
    eng.show(vis, nums);
    const pts = dayIds ? dayIds.map(id => [byId[id].lng, byId[id].lat]) : [];
    eng.route(pts);
    renderCarousel(dayIds);
    if (!fit) return;
    if (dayIds && !dayIds.length) return toast("Nessuna tappa in questo giorno");
    try { eng.fit([...vis].map(id => [byId[id].lng, byId[id].lat])); } catch (err) { console.warn("Mappa (zoom):", err); }
  }

  // schede scorrevoli con le tappe del giorno: la mappa segue la scheda al centro
  function renderCarousel(dayIds) {
    const c = $("#mcar"); if (!c) return;
    if (!dayIds?.length) { c.hidden = true; $("#loc")?.classList.remove("up"); return; }
    c.hidden = false; $("#loc")?.classList.add("up");
    c.innerHTML = dayIds.map((id, k) => { const p = byId[id]; return `<div class="mcard" data-mc="${id}"><div style="position:relative">${photo(id, 330)}<span class="mnum" style="background:${zona[p.z].colore}">${k + 1}</span></div><div class="grow"><b>${esc(p.n)}</b><div class="small muted">${p.dur ? esc(p.dur) : esc(zona[p.z].nome)}</div><div class="row" style="gap:6px;margin-top:6px"><a class="btn small primary" href="${gmDir(p)}" target="_blank" rel="noopener">${icon("Navigation")}</a><button class="btn small" data-place="${id}">Dettagli</button></div></div></div>`; }).join("");
    c.scrollLeft = 0;
    let t; c.onscroll = () => { clearTimeout(t); t = setTimeout(() => {
      const mid = c.getBoundingClientRect().left + c.clientWidth / 2;
      const card = [...c.children].reduce((b, x) => { const r = x.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - mid) < Math.abs(b.r.left + b.r.width / 2 - mid) ? { x, r } : b; }, { x: c.children[0], r: c.children[0].getBoundingClientRect() }).x;
      if (card?.dataset.mc && card.dataset.mc !== c.dataset.cur) { c.dataset.cur = card.dataset.mc; eng?.focus(card.dataset.mc, false); }
    }, 140); };
  }

  function locateMe() {
    if (!navigator.geolocation) return toast("Posizione non disponibile");
    navigator.geolocation.getCurrentPosition(pos => eng?.you([pos.coords.longitude, pos.coords.latitude]),
      () => toast("Non riesco a leggere la posizione"), { enableHighAccuracy: true, timeout: 10000 });
  }

  // ——— foto offline: le miniature di tutti i luoghi (le salva il service worker) ———
  const thumbUrls = () => Object.keys(FOTO).map(id => photoUrl(id, 330));
  async function photosSaved() {
    try { const c = await caches.open("jp27-cdn"); let n = 0; for (const u of thumbUrls()) if (await c.match(u)) n++; return n; } catch { return 0; }
  }
  async function savePhotos(onProgress) {
    const urls = thumbUrls(); let done = 0;
    const c = await caches.open("jp27-cdn");
    for (let i = 0; i < urls.length; i += 6) {
      await Promise.all(urls.slice(i, i + 6).map(async u => { if (!(await c.match(u))) { try { await fetch(u, { mode: "no-cors" }); } catch {} } done++; }));
      onProgress?.(done / urls.length);
    }
    const ok = await photosSaved(); if (ok < urls.length * .9) throw new Error("foto");
  }

  // ——— gestione mappe offline ———
  async function openOfflineMaps() {
    const st = await OfflineMap.status(), used = await OfflineMap.usedMB();
    const nFoto = Object.keys(FOTO).length, fotoOk = (await photosSaved()) >= nFoto * .9;
    const busy = {};
    const row = z => `<div class="card zrow" data-zone="${z.id}"><div class="row"><span class="pic" style="background:${z.base ? "#6b5a45" : "#1f9488"}">${icon(z.base ? "Map" : "Mountain")}</span>
      <div class="grow"><b>${esc(z.nome)}</b><div class="small muted">${z.mb.toLocaleString("it-IT")} MB${z.base ? " · si scarica con la prima zona" : ""}</div></div>
      ${st[z.id] ? `<span class="pill ok">${icon("Check")} offline</span><button class="iconbtn danger" data-zdel="${z.id}" aria-label="Elimina">${icon("Trash2")}</button>` : `<button class="btn small primary" data-zdl="${z.id}">${icon("Download")} Scarica</button>`}</div>
      <div class="progress" hidden style="margin-top:10px"><i style="width:0"></i></div></div>`;
    openSheet(`<div class="ttl"><span class="pic" style="background:#1f9488">${icon("CloudOff")}</span><h2>Mappe offline</h2></div>
      <p class="lead">Scaricale ora col Wi-Fi: in Giappone la mappa funzionerà anche senza rete, con la vostra posizione GPS. Per navigare con i treni serve comunque la rete (Google Maps).</p>
      ${OfflineMap.ZONE.some(z => !st[z.id]) || !fotoOk ? `<button class="btn primary" id="zall" style="width:100%;margin-bottom:14px">${icon("Download")} Scarica tutte (${Math.round(OfflineMap.ZONE.filter(z => !st[z.id]).reduce((a, z) => a + z.mb, 0) + (fotoOk ? 0 : 3))} MB)</button>` : `<p class="small" style="color:var(--ok);margin-top:0">${icon("Check")} Tutte le zone sono disponibili offline</p>`}
      ${OfflineMap.ZONE.map(row).join("")}
      <div class="card zrow" id="zfoto"><div class="row"><span class="pic" style="background:#7b4fa0">${icon("Palette")}</span>
        <div class="grow"><b>Foto dei luoghi</b><div class="small muted">${nFoto} miniature · circa 3 MB</div></div>
        ${fotoOk ? `<span class="pill ok">${icon("Check")} offline</span>` : `<button class="btn small primary" id="fdl">${icon("Download")} Scarica</button>`}</div>
        <div class="progress" hidden style="margin-top:10px"><i style="width:0"></i></div></div>
      <p class="small muted">${used != null ? `Spazio usato dall'app: circa ${used} MB. ` : ""}Su iPhone usa l'app dalla schermata Home, così iOS non cancella le mappe.</p>`, el => {
      $$("[data-zdl]", el).forEach(b => b.onclick = async () => {
        const z = OfflineMap.ZONE.find(x => x.id === b.dataset.zdl); if (busy[z.id]) return; busy[z.id] = true;
        const card = b.closest(".zrow"), bar = $(".progress", card); bar.hidden = false; b.disabled = true; b.textContent = "0%";
        try {
          await OfflineMap.download(z, f => { $("i", bar).style.width = Math.round(f * 100) + "%"; b.textContent = Math.round(f * 100) + "%"; });
          OfflineMap.reset(); toast(`${z.nome}: pronta offline ✓`); openOfflineMaps();
        } catch { toast("Download non riuscito: riprova col Wi-Fi"); b.disabled = false; b.innerHTML = `${icon("Download")} Riprova`; busy[z.id] = false; }
      });
      $("#zall", el)?.addEventListener("click", async e => {
        const b = e.currentTarget; b.disabled = true;
        const todo = OfflineMap.ZONE.filter(z => !st[z.id]);
        try {
          for (const [i, z] of todo.entries()) await OfflineMap.download(z, f => { b.textContent = `${z.nome}: ${Math.round(f * 100)}% (${i + 1}/${todo.length})`; });
          if (!fotoOk) await savePhotos(f => { b.textContent = `Foto: ${Math.round(f * 100)}%`; });
          OfflineMap.reset(); toast("Tutte le mappe sono offline ✓"); openOfflineMaps();
        } catch { toast("Download interrotto: riprova col Wi-Fi"); openOfflineMaps(); }
      });
      $("#fdl", el)?.addEventListener("click", async e => {
        const b = e.currentTarget, bar = $("#zfoto .progress", el); bar.hidden = false; b.disabled = true;
        try { await savePhotos(f => { $("i", bar).style.width = Math.round(f * 100) + "%"; b.textContent = Math.round(f * 100) + "%"; }); toast("Foto salvate per l'offline ✓"); openOfflineMaps(); }
        catch { toast("Alcune foto non si sono scaricate: riprova col Wi-Fi"); openOfflineMaps(); }
      });
      $$("[data-zdel]", el).forEach(b => b.onclick = async () => {
        const z = OfflineMap.ZONE.find(x => x.id === b.dataset.zdel);
        if (!(await ask({ title: `Eliminare "${z.nome}"?`, text: "La mappa offline verrà tolta da questo telefono. Potrai riscaricarla quando vuoi.", ok: "Elimina", danger: true }))) return;
        await OfflineMap.remove(z); OfflineMap.reset(); openOfflineMaps();
      });
    });
  }

  // ——— UTILITY ———
  const UTIL = [
    ["prenotazioni", "BedDouble", "#2e6fb0", "Prenotazioni", "Hotel, voli, biglietti"],
    ["spese", "HandCoins", "#7b4fa0", "Spese", "Chi deve a chi"],
    ["yen", "Banknote", "#4f8a3c", "¥ ↔ €", "Convertitore"],
    ["frasi", "Languages", "#2b4c7e", "Frasi utili", "Con pronuncia audio"],
    ["sos", "Siren", "#d4442f", "Emergenze", "Numeri e ambasciata"],
    ["mappe", "CloudOff", "#1f9488", "Mappe offline", "Scarica le zone"],
    ["budget", "Wallet", "#b8860b", "Budget", "Costi da Wanderlog"],
    ["checklist", "Luggage", "#c89b3c", "Checklist", "Valigia e documenti"],
    ["ricordi", "Sparkles", "#d4442f", "Il nostro Giappone", "Il viaggio in numeri"],
    ...Object.entries(GUIDE).map(([k, g]) => [k, g.icon, g.col, g.titolo, { trasporti: "Suica, Shinkansen, JR Pass", galateo: "Cosa fare e non fare", soldi: "Contanti, ATM, tax free", stagione: "Clima ed eventi", pratico: "Prese, eSIM, farmaci", installa: "Aggiungila alla Home" }[k] || ""]),
  ];
  // in alto le 4 cose di ogni giorno (riquadri grandi), sotto il resto in elenchi sobri stile Impostazioni di iPhone
  const UTOP = ["prenotazioni", "spese", "frasi", "yen"];
  const UGROUPS = [["In viaggio", ["sos", "mappe", "ricordi"]], ["Prima di partire", ["checklist", "budget", "pratico", "installa"]], ["Guide", ["trasporti", "soldi", "galateo", "stagione"]]];
  function renderUtility(sub) {
    const back = `<a class="back" href="#utility">${icon("ChevronLeft")} Utility</a>`;
    if (!sub) {
      view.innerHTML = `<h2>Utility</h2><p class="lead">Tutto quello che serve in viaggio, anche offline.</p>
        <div class="ugrid">${UTOP.map(k => UTIL.find(u => u[0] === k)).map(([k, ic, c, t, s]) => `<a class="ucard" href="#utility/${k}"><span class="ic" style="background:${c}">${icon(ic)}</span><b>${t}</b>${s ? `<small>${s}</small>` : ""}</a>`).join("")}</div>
        ${UGROUPS.map(([g, keys]) => `<h3 class="ugroup">${g}</h3><div class="card ulist">${UTIL.filter(u => keys.includes(u[0]) || (g === "Guide" && !UTOP.includes(u[0]) && !UGROUPS.some(([, ks]) => ks.includes(u[0])))).map(([k, ic, , t, s]) => `<a class="urow" href="#utility/${k}"><span class="uic">${icon(ic)}</span><span class="grow"><b>${t}</b>${s ? `<small>${s}</small>` : ""}</span>${icon("ChevronRight")}</a>`).join("")}</div>`).join("")}
        <h3 class="ugroup">Impostazioni</h3>
        <div class="card row"><div class="grow"><b>Accesso</b><div class="muted small">${me ? esc(me) : "Nome non scelto"} · ${code ? "dati condivisi attivi" : "codice del viaggio non inserito"}</div></div><button class="btn small${code ? "" : " primary"}" id="whoami">${icon(code ? "UserRound" : "KeyRound")} ${code ? "Cambia" : "Inserisci"}</button></div>`;
      $("#whoami").onclick = askWho;
      view.insertAdjacentHTML("beforeend", `<div class="card row"><div class="grow"><b>Tema</b><div class="muted small">Auto segue l'iPhone</div></div>
        <div class="seg">${[["", "Auto"], ["light", "Chiaro"], ["dark", "Scuro"]].map(([k, t]) => `<button data-theme="${k}" class="${theme === k ? "on" : ""}">${t}</button>`).join("")}</div></div>`);
      $$("[data-theme]", view).forEach(b => b.onclick = () => { buzz(); setTheme(b.dataset.theme); });
      notifCard();
      view.insertAdjacentHTML("beforeend", `<div class="card row"><div class="grow"><b>Versione ${APP_VERSION}</b><div class="muted small">Se qualcosa non sembra aggiornato, scarica di nuovo l'app (le mappe offline restano).</div></div><button class="btn small" id="forceupd">${icon("RotateCcw")} Aggiorna adesso</button></div>`);
      $("#forceupd").onclick = forceUpdate;
      return;
    }
    const g = GUIDE[sub];
    if (g) { view.innerHTML = `${back}<h2>${g.titolo}</h2><div class="card prose">${g.html}</div>`; return; }
    if (sub === "frasi") return renderFrasi(back);
    if (sub === "ricordi") return renderRicordi(back);
    if (sub === "yen") return renderYen(back);
    if (sub === "sos") {
      view.innerHTML = `${back}<h2>Emergenze</h2><p class="lead">Tocca per chiamare.</p>
        ${CONTATTI.map(c => `<a class="card contact" href="tel:${c.n.replace(/\s/g, "")}" style="text-decoration:none;color:inherit"><span class="ic">${icon("Phone")}</span><div class="grow"><b>${c.t}</b><div style="color:var(--shu);font-weight:800;font-variant-numeric:tabular-nums">${c.n}</div><div class="muted small">${c.d}</div></div>${icon("ChevronRight")}</a>`).join("")}
        <div class="card"><h3 style="margin-top:0">Frasi rapide</h3>${FRASI.find(f => f.cat === "Emergenza").items.map(phraseRow).join("")}</div>
        <p class="muted small">Prima di partire registratevi su <a href="https://www.dovesiamonelmondo.it" target="_blank" rel="noopener">Dove siamo nel mondo</a> (Farnesina). Verificate i numeri prima del viaggio.</p>`;
      bindPhrases(); return;
    }
    if (sub === "budget") return renderBudget(back);
    if (sub === "prenotazioni") return renderPren(back);
    if (sub === "mappe") { renderUtility(); setTimeout(openOfflineMaps, 50); return; }
    if (sub === "spese") return renderSpese(back);
    if (sub === "checklist") return renderChecklist(back);
    go("#utility");
  }

  const phraseRow = ([jp, ro, it]) => `<div class="phrase" data-jp="${esc(jp)}" data-it="${esc(it)}" data-ro="${esc(ro)}"><div class="grow"><div class="jp">${esc(jp)}</div><div class="ro">${esc(ro)}</div><div class="it">${esc(it)}</div></div><button class="iconbtn" data-speak aria-label="Ascolta">${icon("Volume2")}</button></div>`;
  function bindPhrases() {
    $$(".phrase").forEach(el => el.onclick = e => {
      if (e.target.closest("[data-speak]")) return speak(el.dataset.jp);
      showBig(el.dataset.jp, `<span style="color:var(--shu);font-weight:700">${esc(el.dataset.ro)}</span><br>${esc(el.dataset.it)}`, true);
    });
  }
  function renderFrasi(back) {
    view.innerHTML = `${back}<h2>Frasi utili</h2><p class="lead">Tocca ${icon("Volume2")} per ascoltare. Tocca la frase per mostrarla a schermo intero.</p>
      ${FRASI.map(g => `<div class="card"><h3 style="margin-top:0">${g.cat}</h3>${g.items.map(phraseRow).join("")}</div>`).join("")}`;
    bindPhrases();
  }

  function renderYen(back) {
    const st = LS.get("rate", { r: 170, d: null });
    view.innerHTML = `${back}<h2>Yen ↔ Euro</h2><p class="lead" id="rate"></p>
      <div class="card">
        <div class="conv"><div><label for="jpy">Yen</label><input type="number" inputmode="decimal" id="jpy" value="1000"></div><span class="muted" style="padding-top:18px">=</span><div><label for="eur">Euro</label><input type="number" inputmode="decimal" id="eur"></div></div>
        <div class="qchips">${[100, 500, 1000, 3000, 5000, 10000, 30000].map(v => `<button class="chip" data-y="${v}">${fmtInt(v)} ¥</button>`).join("")}</div>
      </div>
      <div class="card small"><b>A occhio:</b> 1.000 ¥ ≈ <span id="k">${(1000 / st.r).toFixed(2).replace(".", ",")}</span> €. Un pasto in un ristorantino costa 1.000–1.500 ¥, un caffè al konbini 150 ¥ e una corsa in metro 180–300 ¥.</div>`;
    let rate = st.r;
    const jpy = $("#jpy"), eur = $("#eur");
    const showRate = d => { $("#rate").textContent = `1 € = ${rate.toFixed(2).replace(".", ",")} ¥ · ${d ? "aggiornato al " + new Date(d).toLocaleDateString("it-IT") : "tasso indicativo (offline)"}`; $("#k").textContent = (1000 / rate).toFixed(2).replace(".", ","); };
    const fromY = () => eur.value = jpy.value ? (jpy.value / rate).toFixed(2) : "";
    const fromE = () => jpy.value = eur.value ? Math.round(eur.value * rate) : "";
    jpy.oninput = fromY; eur.oninput = fromE;
    $$("[data-y]").forEach(b => b.onclick = () => { jpy.value = b.dataset.y; fromY(); });
    fromY(); showRate(st.d);
    if (!st.d || Date.now() - new Date(st.d) > 12 * 3600e3) {
      fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY").then(r => r.json()).then(j => {
        rate = j.rates.JPY; LS.set("rate", { r: rate, d: j.date }); if ($("#jpy")) { fromY(); showRate(j.date); }
      }).catch(() => {});
    }
  }

  function renderBudget(back) {
    const act = LUOGHI.filter(p => p.eur && !p.out), out = LUOGHI.filter(p => p.eur && p.out);
    const sum = a => a.reduce((s, p) => s + p.eur, 0);
    const eur = v => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    const perZ = ZONE.map(z => [z, sum(act.filter(p => p.z === z.id))]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...perZ.map(x => x[1]));
    const planned = new Set(DAYS.flatMap(d => plan[d]?.i || []));
    view.innerHTML = `${back}<h2>Budget</h2><p class="lead">Biglietti e attività stimati in Wanderlog, a persona.</p>
      <div class="hero solid" style="min-height:0"><span class="kanji" aria-hidden="true">予算</span><div class="hero-in" style="min-height:170px"><span class="kicker">Luoghi attivi</span><div class="big-n" style="font-size:2.8rem">${eur(sum(act))}</div><p>In programma: <b>${eur(sum(act.filter(p => planned.has(p.id))))}</b> · Totale Wanderlog con gli scartati: ${eur(T.budgetWanderlog)}</p></div></div>
      <div class="card"><h3 style="margin-top:0">Per zona</h3>${perZ.map(([z, v]) => `<div style="margin-bottom:12px"><div class="row small"><span class="dot" style="background:${z.colore}"></span><span class="grow">${z.nome}</span><b>${eur(v)}</b></div><div class="bar"><i style="width:${v / max * 100}%;background:${z.colore}"></i></div></div>`).join("")}</div>
      <div class="card"><h3 style="margin-top:0">Dettaglio</h3><table class="budget">${act.sort((a, b) => b.eur - a.eur).map(p => `<tr data-place="${p.id}" style="cursor:pointer"><td>${esc(p.n)} <span class="muted small">· ${zona[p.z].nome}</span></td><td>${eur(p.eur)}</td></tr>`).join("")}</table>
      ${out.length ? `<h3>Scartati</h3><table class="budget">${out.map(p => `<tr class="muted"><td>${esc(p.n)}</td><td>${eur(p.eur)}</td></tr>`).join("")}</table>` : ""}</div>
      <p class="muted small">Le spese condivise tra le due coppie (chi ha pagato cosa) arriveranno nella prossima versione.</p>`;
  }

  function renderChecklist(back) {
    const total = CHECKLIST.reduce((s, [, it]) => s + it.length, 0);
    const head = () => `<div class="between small"><span class="muted">Salvata su questo telefono</span><b>${checks.size}/${total}</b></div><div class="progress bar-head"><i style="width:${checks.size / total * 100}%"></i></div>`;
    view.innerHTML = `${back}<h2>Checklist</h2><div class="card" id="ckhead">${head()}</div>
      ${CHECKLIST.map(([g, items]) => `<div class="card"><h3 style="margin-top:0">${g}</h3>${items.map(t => `<label class="check${checks.has(t) ? " done" : ""}"><input type="checkbox" data-ck="${esc(t)}" ${checks.has(t) ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}</div>`).join("")}`;
    $$("[data-ck]").forEach(cb => cb.onchange = () => {
      cb.checked ? checks.add(cb.dataset.ck) : checks.delete(cb.dataset.ck); LS.set("checks", [...checks]);
      cb.parentElement.classList.toggle("done", cb.checked); $("#ckhead").innerHTML = head();
    });
  }

  // ——— PRENOTAZIONI (hotel, voli, treni, biglietti) ———
  const PTYPE = {
    hotel: ["BedDouble", "#2e6fb0", "Hotel"], volo: ["Plane", "#7b4fa0", "Volo"], treno: ["TrainFront", "#1f9488", "Treno"],
    biglietto: ["Ticket", "#d4442f", "Biglietto"], altro: ["Bookmark", "#6b5a45", "Altro"],
  };
  const NIGHTS = DAYS.slice(0, -1);
  // per le prenotazioni (voli soprattutto) si possono scegliere anche 3 giorni prima e dopo il viaggio
  const BOOK_DAYS = (() => { const out = [], a = new Date(T.inizio + "T00:00:00Z"), b = new Date(T.fine + "T00:00:00Z"); a.setUTCDate(a.getUTCDate() - 3); b.setUTCDate(b.getUTCDate() + 3); for (const d = a; d <= b; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; })();   // l'ultimo giorno si parte
  const hotelFor = d => lists.prenotazioni.find(p => p.tipo === "hotel" && p.dal <= d && d < (p.al || p.dal));
  const bookingsOn = d => lists.prenotazioni.filter(p => p.dal === d && p.tipo !== "hotel").sort((a, b) => (a.ora || "99").localeCompare(b.ora || "99"));
  const nightsOf = p => p.dal && p.al ? Math.max(1, Math.round((new Date(p.al + "T00:00:00Z") - new Date(p.dal + "T00:00:00Z")) / 864e5)) : 0;
  const addrQ = p => p.jp || p.indirizzo || p.titolo;
  const gmTo = s => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s)}&travelmode=transit`;
  const showTaxi = p => showBig(p.jp || p.indirizzo || p.titolo, `${esc(p.titolo)}<br><span class="jp" style="font-size:1.2rem;color:var(--ink)">ここに行ってください</span><br><small>"Mi porti qui, per favore"</small>`);
  const needCodeBox = what => `<div class="card"><b>${icon("KeyRound")} Serve il codice del viaggio</b><p class="small muted">${what} sono condivise tra voi quattro e protette dal codice.</p><button class="btn primary small" id="needcode">Inserisci il codice</button></div>`;

  function pcard(p) {
    const [ic, col, tn] = PTYPE[p.tipo] || PTYPE.altro;
    const when = p.tipo === "hotel"
      ? (p.dal && p.al ? `${short(p.dal)} → ${short(p.al)} · ${nightsOf(p)} ${nightsOf(p) === 1 ? "notte" : "notti"}` : "date da definire") + (p.ora ? ` · check-in ${esc(p.ora)}` : "")
      : `${p.dal ? fmtDay(p.dal, { weekday: "short", day: "numeric", month: "short" }) : "data da definire"}${p.ora ? " · " + esc(p.ora) : ""}`;
    const route = p.da || p.a ? `<div class="small">${esc(p.da || "?")} → ${esc(p.a || "?")}</div>` : "";
    return `<div class="card pcard${p.id === freshId ? " fresh" : ""}" data-pren="${p.id}">
      <div class="row"><span class="pic" style="background:${col}">${icon(ic)}</span>
        <div class="grow"><b>${esc(p.titolo || tn)}</b><div class="muted small">${when}</div>${route}${p.indirizzo ? `<div class="small muted">${esc(p.indirizzo)}</div>` : ""}</div></div>
      ${p.codice ? `<div class="small" style="margin-top:8px">${icon("KeyRound")} Codice: <b class="copiabile">${esc(p.codice)}</b></div>` : ""}
      ${p.note ? `<div class="small muted" style="margin-top:4px">${esc(p.note)}</div>` : ""}
      <div class="btns">
        ${p.tipo === "hotel" ? `<a class="btn small primary" href="${gmTo(addrQ(p))}" target="_blank" rel="noopener">${icon("Navigation")} Portami</a><button class="btn small" data-taxi="${p.id}">${icon("CarTaxiFront")} Al tassista</button>` : ""}
        ${p.link ? `<a class="btn small" href="${esc(p.link)}" target="_blank" rel="noopener">${icon("Link")} Apri</a>` : ""}
      </div>
    </div>`;
  }
  function bindPcards(root = view) {
    $$("[data-taxi]", root).forEach(b => b.onclick = e => { e.stopPropagation(); showTaxi(lists.prenotazioni.find(x => x.id === b.dataset.taxi)); });
    $$("[data-pren]", root).forEach(c => c.onclick = e => { if (!e.target.closest("a, button")) editPren(lists.prenotazioni.find(x => x.id === c.dataset.pren)); });
    $("#needcode", root)?.addEventListener("click", () => askWho(true));
  }

  function renderPren(back) {
    if (!code) { view.innerHTML = `${back}<h2>Prenotazioni</h2><p class="lead">Hotel, voli, treni e biglietti, condivisi tra voi quattro.</p>${needCodeBox("Le prenotazioni")}`; bindPcards(); return; }
    const all = [...lists.prenotazioni].sort((a, b) => (a.dal || "9").localeCompare(b.dal || "9") || (a.ora || "").localeCompare(b.ora || ""));
    const covered = NIGHTS.filter(hotelFor).length;
    view.innerHTML = `${back}<h2>Prenotazioni</h2><p class="lead">Hotel, voli, treni e biglietti, condivisi tra voi quattro.</p>
      <div class="card">
        <div class="between"><b>${icon("BedDouble")} Notti con hotel</b><b>${covered}/${NIGHTS.length}</b></div>
        <div class="nights">${NIGHTS.map((d, i) => { const h = hotelFor(d); return `<i title="${short(d)}${h ? " · " + esc(h.titolo) : ""}" class="${h ? "ok" : ""}"></i>`; }).join("")}</div>
        ${covered < NIGHTS.length ? `<p class="small muted" style="margin:8px 0 0">Mancano: ${NIGHTS.filter(d => !hotelFor(d)).map(short).join(", ")}</p>` : `<p class="small" style="margin:8px 0 0;color:var(--ok)">Tutte le notti sono coperte ✓</p>`}
      </div>
      <div class="section-h"><h3>Aggiungi</h3></div>
      <div class="addgrid">${Object.entries(PTYPE).map(([k, [ic, col, tn]]) => `<button data-addp="${k}"><span class="pic" style="background:${col}">${icon(ic)}</span>${tn}</button>`).join("")}</div>
      ${all.length ? all.map((p, k) => (k === 0 || p.dal !== all[k - 1].dal ? `<h3>${p.dal ? cap1(fmtDay(p.dal)) : "Senza data"}</h3>` : "") + pcard(p)).join("") : `<p class="empty">Ancora nessuna prenotazione. Comincia dagli hotel e dai voli.</p>`}`;
    $$("[data-addp]").forEach(b => b.onclick = () => editPren({ tipo: b.dataset.addp }));
    bindPcards();
  }

  function editPren(p) {
    const isNew = !p.id, t = p.tipo || "altro";
    const [ic, col, tn] = PTYPE[t] || PTYPE.altro;
    const dayOpts = sel => `<option value="">Scegli il giorno</option>` + BOOK_DAYS.map(d => `<option value="${d}" ${d === sel ? "selected" : ""}>${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}${d < T.inizio ? " · prima del viaggio" : d > T.fine ? " · dopo il viaggio" : ""}</option>`).join("");
    const f = (id, label, val, attrs = "", ph = "") => /type="time"/.test(attrs) ? `<label class="fl"><span>${label}</span>${timeIn(`id="${id}" value="${esc(val || "")}"`)}</label>`
      : `<label class="fl"><span>${label}</span><input id="${id}" value="${esc(val || "")}" ${attrs}${ph ? ` placeholder="${esc(ph)}"` : ""}></label>`;
    const titolo = t === "hotel" ? "Nuovo hotel" : t === "volo" ? "Nuovo volo" : t === "treno" ? "Nuovo treno" : t === "biglietto" ? "Nuovo biglietto" : "Nuova prenotazione";
    openSheet(`
      <div class="ttl"><span class="pic" style="background:${col}">${icon(ic)}</span><h2>${isNew ? titolo : "Modifica " + tn.toLowerCase()}</h2></div>
      ${f("p-tit", t === "hotel" ? "Nome dell'hotel" : t === "volo" ? "Volo" : t === "treno" ? "Treno" : "Cosa", p.titolo, 'autocomplete="off"', t === "hotel" ? "es. Hotel Gracery Shinjuku" : t === "volo" ? "es. AZ 784" : t === "treno" ? "es. Nozomi 21, Tokyo → Kyoto" : t === "biglietto" ? "es. teamLab Planets" : "es. Cena kaiseki")}
      <div class="grid2">
        <label class="fl"><span>${t === "hotel" ? "Check-in" : "Giorno"}</span><select id="p-dal">${dayOpts(p.dal)}</select></label>
        ${t === "hotel" ? `<label class="fl"><span>Check-out</span><select id="p-al">${dayOpts(p.al)}</select></label>` : f("p-ora", "Ora", p.ora, 'type="time"')}
      </div>
      ${t === "hotel" ? f("p-ora", "Orario check-in", p.ora, 'type="time"') : ""}
      ${t === "volo" || t === "treno" ? `<div class="grid2">${f("p-da", "Da", p.da, "", t === "volo" ? "es. Roma FCO" : "es. Tokyo")}${f("p-a", "A", p.a, "", t === "volo" ? "es. Tokyo HND" : "es. Kyoto")}</div>` : ""}
      ${t === "hotel" ? f("p-ind", "Indirizzo", p.indirizzo, "", "es. 1-19-1 Kabukicho, Shinjuku") + f("p-jp", "Indirizzo in giapponese (per il taxi)", p.jp, "", "Dalla conferma o da Google Maps") : ""}
      ${t === "biglietto" ? `<label class="fl"><span>Luogo collegato</span><select id="p-luogo"><option value="">Nessuno</option>${LUOGHI.filter(x => !x.out).map(x => `<option value="${x.id}" ${x.id === p.luogo ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</select></label>` : ""}
      ${f("p-cod", "Codice di prenotazione", p.codice, 'autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"', "es. ABC12345")}
      ${f("p-link", "Link (conferma, biglietto, app)", p.link, 'type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"', "https://…")}
      <label class="fl"><span>Note</span><textarea id="p-note" rows="2" placeholder="${t === "hotel" ? "Colazione inclusa, deposito bagagli…" : "Cosa portare, dove ci si trova…"}">${esc(p.note || "")}</textarea></label>
      <div class="btns">${isNew ? `<button class="btn" data-close>Annulla</button>` : `<button class="btn" id="p-del" style="color:var(--shu)">${icon("Trash2")} Elimina</button>`}<button class="btn primary" id="p-save">Salva</button></div>
    `, el => {
      const v = id => $("#" + id, el)?.value.trim() || "";
      $("#p-save", el).onclick = () => {
        const item = { ...p, tipo: t, titolo: v("p-tit"), dal: v("p-dal"), ora: v("p-ora"), codice: v("p-cod"), link: v("p-link"), note: v("p-note") };
        if (t === "hotel") Object.assign(item, { al: v("p-al"), indirizzo: v("p-ind"), jp: v("p-jp") });
        if (t === "volo" || t === "treno") Object.assign(item, { da: v("p-da"), a: v("p-a") });
        if (t === "biglietto") item.luogo = v("p-luogo");
        if (!item.titolo) return toast("Scrivi almeno il nome");
        if (t === "hotel" && (!item.dal || !item.al || item.al <= item.dal)) return toast("Controlla check-in e check-out");
        const saved = putItem("prenotazioni", item);
        if (isNew) notifyOthers("pren", saved);
        if (t === "hotel" && (item.jp !== p.jp || item.indirizzo !== p.indirizzo || item.titolo !== p.titolo || !p.lat)) geocodeHotel(saved);
        if (item.luogo && !booked.has(item.luogo)) { booked.add(item.luogo); savePlan(); }   // biglietto preso = "prenotato" spuntato
        closeSheet(); toast("Salvato ✓"); rerender();
      };
      $("#p-del", el)?.addEventListener("click", () => { const old = { ...p }; delItem("prenotazioni", p.id); closeSheet(); rerender(); toast("Prenotazione eliminata", () => { putItem("prenotazioni", old); rerender(); }); });
    });
  }

  // posizione dell'hotel dall'indirizzo (OpenStreetMap), per la puntina sulla mappa
  async function geocodeHotel(h) {
    if (!navigator.onLine) return;
    for (const q of [h.jp, h.indirizzo && h.indirizzo + ", Japan", h.titolo + ", Japan"].filter(Boolean)) {
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(q)}`)).json();
        if (r[0]) { putItem("prenotazioni", { ...h, lat: +r[0].lat, lng: +r[0].lon }); return; }
      } catch {}
    }
  }

  // ——— LUOGHI aggiunti da voi ———
  // la zona si deduce dal luogo Wanderlog più vicino (entro ~40 km), altrimenti "Altre località"
  function guessZone(lat, lng) {
    let best = null, bd = Infinity;
    for (const p of LUOGHI) { if (p.mine) continue; const d = (p.lat - lat) ** 2 + ((p.lng - lng) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = p; } }
    return best && Math.sqrt(bd) * 111 < 40 ? best.z : "altre";
  }
  // coordinate da un link di Google Maps (quello lungo) o scritte a mano "35.68, 139.76"
  function parseCoords(t) {
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) || /(?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/.exec(t) || /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/.exec(t);
    return m ? { lat: +m[1], lng: +m[2] } : null;
  }
  // ricerca: prima Google (se attivo il servizio Places), altrimenti OpenStreetMap
  async function searchPlaces(text) {
    try {
      await Promise.race([loadMaps(), new Promise((_, r) => setTimeout(r, 4000))]);
      const { Place } = await google.maps.importLibrary("places");
      const { places } = await Place.searchByText({ textQuery: text, fields: ["displayName", "formattedAddress", "location"], language: "it", region: "jp", maxResultCount: 6, locationBias: { lat: 35.4, lng: 137.5 } });
      if (places?.length) return places.map(x => ({ n: x.displayName, addr: x.formattedAddress, lat: x.location.lat(), lng: x.location.lng(), gid: x.id }));
    } catch (err) { console.info("Ricerca Google non disponibile, uso OpenStreetMap:", err?.message || err); }
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=jp&namedetails=1&accept-language=it&q=${encodeURIComponent(text)}`)).json();
    return r.map(x => ({ n: x.namedetails?.["name:it"] || x.namedetails?.["name:en"] || x.name || x.display_name.split(",")[0], jp: x.namedetails?.["name:ja"] || x.namedetails?.name || "", addr: x.display_name.split(",").slice(1, 4).join(",").trim(), lat: +x.lat, lng: +x.lon }));
  }
  // ——— foto per i luoghi aggiunti da voi: prima quelle del locale su Google, poi Wikipedia, poi le foto scattate lì vicino ———
  async function googlePhotos({ gid, name, lat, lng }) {
    try {
      await Promise.race([loadMaps(), new Promise((_, r) => setTimeout(r, 4000))]);
      const { Place } = await google.maps.importLibrary("places");
      let pl;
      if (gid) { pl = new Place({ id: gid }); await pl.fetchFields({ fields: ["photos"] }); }
      else if (name && lat != null) {
        const { places } = await Place.searchByText({ textQuery: name, fields: ["location", "photos"], locationBias: { center: { lat, lng }, radius: 500 }, maxResultCount: 1 });
        pl = places?.[0]; if (!pl?.location || kmBetween({ lat: pl.location.lat(), lng: pl.location.lng() }, { lat, lng }) > .5) return [];   // trovato un altro posto con lo stesso nome
      }
      return (pl?.photos || []).slice(0, 6).map(ph => ({ src: "g", ph, gid: pl.id, thumb: ph.getURI({ maxWidth: 330 }), a: ph.authorAttributions?.[0]?.displayName || "" }));
    } catch { return []; }
  }
  async function wikiPhotos(name, lat, lng) {
    const api = (host, q) => fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: "json", origin: "*", action: "query", ...q })).then(r => r.json()).catch(() => ({}));
    const pages = j => Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const clean = u => u?.split("?")[0];
    const [arts, geo] = await Promise.all([
      Promise.all((name ? ["it", "en", "ja"] : []).map(l => api(`${l}.wikipedia.org`, { generator: "search", gsrsearch: name, gsrlimit: 3, prop: "pageimages|coordinates", piprop: "thumbnail|name", pithumbsize: 960 }).then(j => ({ l, j })))),
      lat != null ? api("commons.wikimedia.org", { generator: "geosearch", ggscoord: `${lat}|${lng}`, ggsradius: 200, ggslimit: 12, ggsnamespace: 6, prop: "imageinfo", iiprop: "url", iiurlwidth: 960 }) : {},
    ]);
    const out = [];
    // articolo di Wikipedia con quel nome e nello stesso posto (entro 3 km): la sua foto principale
    for (const { l, j } of arts) for (const p of pages(j)) {
      const c = p.coordinates?.[0], u = clean(p.thumbnail?.source);
      if (isPhotoUrl(u) && u.includes("/wikipedia/commons/") && c && lat != null && kmBetween({ lat: c.lat, lng: c.lon }, { lat, lng }) < 3) out.push({ src: "w", u, f: p.pageimage, h: l });
    }
    // foto scattate a meno di 200 m (utili per i posti piccoli, ma da scegliere a mano)
    for (const p of pages(geo)) { const u = clean(p.imageinfo?.[0]?.thumburl); if (isPhotoUrl(u) && /\.(jpe?g|png)$/i.test(p.title)) out.push({ src: "w", u, f: p.title.replace(/^File:/, ""), h: "commons", near: true }); }
    const seen = new Set(); return out.filter(x => !seen.has(x.u) && seen.add(x.u));
  }
  // nome giapponese (per il tassista) di un risultato Google
  async function jpName(gid) {
    try { const { Place } = await google.maps.importLibrary("places"); const pl = new Place({ id: gid, requestedLanguage: "ja" }); await pl.fetchFields({ fields: ["displayName"] }); return pl.displayName || ""; } catch { return ""; }
  }

  // luogo della lista Wanderlog: si cambiano i testi (la posizione resta quella originale)
  function editBase(p) {
    const ed = lists.luoghi.find(x => x.edit === p.id), o = BASE_ORIG.get(p.id) || {};
    openSheet(`
      <div class="ttl"><span class="pic" style="background:var(--shu)">${icon("Pencil")}</span><h2>Modifica luogo</h2></div>
      <p class="lead">Le modifiche si vedono per tutti e quattro. Posizione e foto restano quelle di Wanderlog.</p>
      <label class="fl"><span>Nome</span><input id="b-n" value="${esc(p.n || "")}" autocomplete="off"></label>
      <label class="fl"><span>Nome in giapponese (per il tassista)</span><input id="b-jp" value="${esc(p.jp || "")}" placeholder="Facoltativo" autocomplete="off"></label>
      <label class="fl"><span>Descrizione</span><textarea id="b-d" rows="4" placeholder="Perché andarci, cosa vedere, orari…">${esc(p.d || "")}</textarea></label>
      <div class="grid2">
        <label class="fl"><span>Durata</span><input id="b-dur" value="${esc(p.dur || "")}" placeholder="es. 1 ora" autocomplete="off"></label>
        <label class="fl"><span>Costo a persona (€)</span><input id="b-eur" inputmode="decimal" value="${p.eur ?? ""}" placeholder="Facoltativo"></label>
      </div>
      <label class="check" style="border:none;padding:0 0 12px"><input type="checkbox" id="b-pren" ${p.pren ? "checked" : ""}><span>Da prenotare in anticipo</span></label>
      ${ed ? `<button class="btn" id="b-orig" style="width:100%;margin-bottom:10px">${icon("Undo2")} Ripristina com'era su Wanderlog</button>` : ""}
      <div class="btns"><button class="btn" id="b-cancel">Annulla</button><button class="btn primary" id="b-save">Salva</button></div>
    `, el => {
      const v = id => $("#" + id, el).value.trim();
      $("#b-save", el).onclick = () => {
        const n = v("b-n"); if (!n) return toast("Scrivi il nome del luogo");
        const now = { n, jp: v("b-jp"), d: v("b-d"), dur: v("b-dur"), eur: parseNum(v("b-eur")) || 0, pren: $("#b-pren", el).checked };
        // si salvano solo i campi diversi dall'originale di Wanderlog
        const diff = {}; for (const f of EDIT_F) { const a = now[f], b = f === "eur" ? (+o.eur || 0) : f === "pren" ? !!o.pren : (o[f] || ""); if (a !== b) diff[f] = a; }
        if (!now.pren) booked.delete(p.id), savePlan();
        if (Object.keys(diff).length) putItem("luoghi", { id: "e" + p.id, edit: p.id, ...diff });
        else if (ed) delItem("luoghi", ed.id);
        mergeCustom(); rerender(); toast("Salvato ✓"); inSheet("pop", () => openPlace(p.id));
      };
      $("#b-cancel", el).onclick = () => inSheet("pop", () => openPlace(p.id));
      $("#b-orig", el)?.addEventListener("click", () => { delItem("luoghi", ed.id); mergeCustom(); rerender(); toast("Ripristinato com'era su Wanderlog"); inSheet("pop", () => openPlace(p.id)); });
    });
  }
  function editLuogo(p, day, fromPlace) {
    const isNew = !p.id;
    let st = { c: p.c || "cibo", z: p.z || "", lat: p.lat, lng: p.lng, where: p.lat ? (p.addr || `${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}`) : "", pren: !!p.pren,
      gid: "", sel: isPhotoUrl(p.img?.u) ? "cur" : -1, picked: isPhotoUrl(p.img?.u) };   // sel: "cur" = foto già salvata, numero = proposta, -1 = nessuna
    let cands = [], phTok = 0, phT;
    const thumbOf = c => c.src === "g" ? c.thumb : c.u.replace(/\/\d+px-/, "/330px-");
    const drawPh = el => {
      const box = $("#l-ph", el); if (!box) return;
      const btn = (k, src) => `<button type="button" class="lphb${st.sel === k ? " on" : ""}" data-ph="${k}"><img src="${esc(src)}" alt="" decoding="async"></button>`;
      box.innerHTML = (isPhotoUrl(p.img?.u) ? btn("cur", photoUrl(p.id, 330) || p.img.u) : "")
        + cands.map((c, k) => btn(k, thumbOf(c))).join("")
        + `<button type="button" class="lphb none${st.sel === -1 ? " on" : ""}" data-ph="-1">Nessuna</button>`;
      $("#l-phn", el).textContent = st.loading ? "Cerco le foto…" : cands.length ? (cands[0].src === "g" ? "Foto da Google Maps e Wikimedia: tocca quella che preferisci." : "Foto da Wikimedia: tocca quella che preferisci.")
        : st.lat ? "Nessuna foto trovata: resta il colore della categoria." : "Scegli dove si trova e cerco una foto.";
    };
    const findPh = el => {
      clearTimeout(phT);
      phT = setTimeout(async () => {
        if (st.lat == null && !st.gid) return;
        const my = ++phTok, name = $("#l-n", el)?.value.trim() || "";
        st.loading = true; drawPh(el);
        const [g, w] = await Promise.all([googlePhotos({ gid: st.gid, name, lat: +st.lat, lng: +st.lng }), wikiPhotos(name, +st.lat, +st.lng)]);
        if (my !== phTok || !el.isConnected) return;
        cands = [...g, ...w.filter(x => !x.near), ...w.filter(x => x.near)].slice(0, 10);
        st.loading = false;
        // scelta automatica: la prima foto sicura (del locale o della sua pagina Wikipedia), non quelle "dei dintorni"
        if (!st.picked) { const k = cands.findIndex(c => !c.near); st.sel = k; }
        drawPh(el);
      }, 500);
    };
    const draw = el => {
      $$("[data-lc]", el).forEach(b => b.classList.toggle("on", b.dataset.lc === st.c));
      $$("[data-lz]", el).forEach(b => b.classList.toggle("on", b.dataset.lz === st.z));
      const pos = $("#l-pos", el);
      pos.className = "lpos" + (st.lat ? " ok" : "");
      pos.innerHTML = st.lat
        ? `${icon("MapPin")}<span class="grow">${esc(st.where)}</span><a href="https://www.google.com/maps/search/?api=1&query=${st.lat},${st.lng}" target="_blank" rel="noopener">Controlla</a>`
        : `${icon("MapPin")}<span class="grow">Posizione non ancora scelta</span>`;
    };
    const setPos = (el, lat, lng, where, gid = "") => {
      Object.assign(st, { lat, lng, where, gid });
      if (!st.zManual) st.z = guessZone(lat, lng);
      draw(el); findPh(el);
    };
    openSheet(`
      <div class="ttl"><span class="pic" style="background:var(--shu)">${icon("MapPin")}</span><h2>${isNew ? "Nuovo luogo" : "Modifica luogo"}</h2></div>
      ${isNew ? `<p class="lead">Cercalo per nome, oppure usa la tua posizione: sarà visibile a tutti e quattro.</p>` : ""}
      <div class="fl"><span>Dove si trova</span>
        <div class="searchbox">${icon("Search")}<input type="search" id="l-q" placeholder="es. Ichiran Shibuya, Nishiki Market…" value="${esc(isNew ? p.n || "" : "")}" autocomplete="off" enterkeyhint="search"></div>
        <div id="l-res" class="lres"></div>
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn small" id="l-gps">${icon("LocateFixed")} Sono qui</button><button class="btn small" id="l-link">${icon("Link")} Incolla link Maps</button></div>
        <div id="l-pos" class="lpos"></div>
      </div>
      <div class="fl"><span>Foto</span><div id="l-ph" class="lph"></div><small id="l-phn" class="muted small"></small></div>
      <label class="fl"><span>Nome</span><input id="l-n" value="${esc(p.n || "")}" placeholder="Come lo chiamate voi" autocomplete="off"></label>
      <label class="fl"><span>Nome in giapponese (per il tassista)</span><input id="l-jp" value="${esc(p.jp || "")}" placeholder="Facoltativo" autocomplete="off"></label>
      <div class="fl"><span>Categoria</span><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">${Object.entries(CAT).map(([k, [ic, col, n]]) => `<button class="chip" data-lc="${k}"><span style="color:${col};display:contents">${icon(ic)}</span> ${n}</button>`).join("")}</div></div>
      <div class="fl"><span>Zona</span><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">${ZONE.map(z => `<button class="chip" data-lz="${z.id}"><span class="dot" style="background:${z.colore}"></span>${esc(z.nome)}</button>`).join("")}</div></div>
      <label class="fl"><span>Descrizione / note</span><textarea id="l-d" rows="2" placeholder="Perché andarci, cosa ordinare, orari…">${esc(p.d || "")}</textarea></label>
      <div class="grid2">
        <label class="fl"><span>Durata</span><input id="l-dur" value="${esc(p.dur || "")}" placeholder="es. 1 ora" autocomplete="off"></label>
        <label class="fl"><span>Costo a persona (€)</span><input id="l-eur" inputmode="decimal" value="${p.eur ?? ""}" placeholder="Facoltativo"></label>
      </div>
      <label class="check" style="border:none;padding:0 0 12px"><input type="checkbox" id="l-pren" ${st.pren ? "checked" : ""}><span>Da prenotare in anticipo</span></label>
      ${isNew ? "" : `<button class="btn" id="l-del" style="width:100%;margin-bottom:10px;color:var(--shu)">${icon("Trash2")} Elimina luogo</button>`}
      <div class="btns"><button class="btn" ${fromPlace ? 'id="l-cancel"' : "data-close"}>Annulla</button><button class="btn primary" id="l-save">Salva</button></div>
    `, el => {
      draw(el); drawPh(el);
      if (!isNew && !st.picked && st.lat != null) findPh(el);   // luogo già salvato senza foto: propone qualcosa
      $("#l-ph", el).onclick = e => { const b = e.target.closest("[data-ph]"); if (!b) return; st.sel = b.dataset.ph === "cur" ? "cur" : +b.dataset.ph; st.picked = true; buzz(); drawPh(el); };
      $("#l-n", el).addEventListener("change", () => { if (!st.gid) findPh(el); });
      const res = $("#l-res", el), qi = $("#l-q", el);
      let found = [];
      const doSearch = async () => {
        const text = qi.value.trim(); if (!text) return;
        const c = parseCoords(text); if (c) { res.innerHTML = ""; return setPos(el, c.lat, c.lng, `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`); }
        if (!navigator.onLine) { res.innerHTML = `<p class="small muted">Senza rete non posso cercare: usa «Sono qui» quando sei sul posto.</p>`; return; }
        res.innerHTML = `<p class="small muted">Cerco…</p>`;
        try { found = await searchPlaces(text); } catch { found = []; }
        res.innerHTML = found.length ? found.map((r, k) => `<button data-lr="${k}">${icon("MapPin")}<span><b>${esc(r.n)}</b><small>${esc(r.addr || "")}</small></span></button>`).join("") : `<p class="small muted">Nessun risultato: prova con un altro nome o in inglese.</p>`;
      };
      let qt; qi.oninput = () => { clearTimeout(qt); qt = setTimeout(doSearch, 600); };
      qi.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(qt); doSearch(); qi.blur(); } };
      res.onclick = async e => {
        const b = e.target.closest("[data-lr]"); if (!b) return;
        const r = found[+b.dataset.lr]; res.innerHTML = ""; qi.value = "";
        if (!$("#l-n", el).value.trim()) $("#l-n", el).value = r.n;
        setPos(el, r.lat, r.lng, [r.n, r.addr].filter(Boolean).join(" · "), r.gid || "");
        const jp = r.jp || (r.gid ? await jpName(r.gid) : "");
        if (jp && !$("#l-jp", el).value.trim()) $("#l-jp", el).value = jp;
      };
      $("#l-gps", el).onclick = () => {
        if (!navigator.geolocation) return toast("Posizione non disponibile");
        toast("Leggo la posizione…");
        navigator.geolocation.getCurrentPosition(pos => setPos(el, pos.coords.latitude, pos.coords.longitude, "La tua posizione attuale"),
          () => toast("Non riesco a leggere la posizione"), { enableHighAccuracy: true, timeout: 15000 });
      };
      $("#l-link", el).onclick = async () => {
        let t = ""; try { t = await navigator.clipboard.readText(); } catch {}
        const c = parseCoords(t || "");
        if (c) return setPos(el, c.lat, c.lng, "Dal link di Google Maps");
        toast(/goo\.gl|maps\.app/.test(t) ? "Link corto: aprilo e copia l'indirizzo completo dalla barra" : "Copia prima un link di Google Maps");
      };
      $$("[data-lc]", el).forEach(b => b.onclick = () => { st.c = b.dataset.lc; draw(el); });
      $$("[data-lz]", el).forEach(b => b.onclick = () => { st.z = b.dataset.lz; st.zManual = true; draw(el); });
      $("#l-save", el).onclick = async e => {
        const v = id => $("#" + id, el).value.trim();
        const n = v("l-n");
        if (!n) return toast("Scrivi il nome del luogo");
        if (!st.lat) return toast("Scegli dove si trova");
        const eur = parseNum(v("l-eur"));
        const item = { id: p.id || "u" + uid(), n, jp: v("l-jp"), d: v("l-d"), c: st.c, z: st.z || guessZone(st.lat, st.lng), lat: +(+st.lat).toFixed(6), lng: +(+st.lng).toFixed(6), addr: st.where, chi: p.chi || me || "", dur: v("l-dur"), pren: $("#l-pren", el).checked, eur: eur > 0 ? eur : null, ts: p.ts || Date.now() };
        if (!item.pren) booked.delete(item.id);
        // foto scelta: quelle di Google si salvano come indirizzo diretto dell'immagine (così funzionano anche offline)
        let img = null;
        if (st.sel === "cur") img = p.img;
        else if (st.sel >= 0 && cands[st.sel]) {
          const c = cands[st.sel];
          if (c.src === "w") img = { u: c.u, f: c.f || "", h: c.h };
          else {
            const b = e.currentTarget; b.disabled = true; b.textContent = "Salvo…";
            try { const u = (await (await fetch(c.ph.getURI({ maxWidth: 960 }) + "&skipHttpRedirect=true")).json()).photoUri; if (isPhotoUrl(u)) img = { u, g: c.gid, a: c.a }; } catch {}
            if (!sheetOpen() || !$("#l-save", el)) return;   // scheda chiusa nel frattempo: niente salvataggio
          }
        }
        item.img = img;
        const saved = putItem("luoghi", item);
        toast(isNew ? "Luogo aggiunto ✓" : "Salvato ✓");
        if (day) { const dd = getDay(day); if (!dd.i.includes(saved.id)) dd.i.push(saved.id); savePlan(); openPicker(day); }
        else if (isNew || fromPlace) { rerender(); inSheet("pop", () => openPlace(saved.id)); }
        else { closeSheet(); rerender(); }
      };
      $("#l-cancel", el)?.addEventListener("click", () => inSheet("pop", () => openPlace(p.id)));
      $("#l-del", el)?.addEventListener("click", () => deletePlace(byId[p.id] || { ...p, mine: true }));
    });
  }
  // elimina un luogo per tutti: i vostri spariscono, quelli di Wanderlog finiscono tra gli eliminati (ripristinabili).
  // Viene tolto anche dai giorni in cui era in programma; "Annulla" rimette tutto com'era
  function deletePlace(p) {
    const id = p.id, wasBooked = booked.has(id), pos = dayOf(id).map(d => [d, plan[d].i.indexOf(id)]);
    const old = p.mine ? lists.luoghi.find(x => x.id === id) : null;
    for (const [d] of pos) plan[d].i = plan[d].i.filter(x => x !== id);
    booked.delete(id); savePlan();
    if (p.mine) delItem("luoghi", id); else putItem("luoghi", { id: "h" + id, hide: id });
    closeSheet(); rerender(); buzz();
    toast(pos.length ? `Luogo eliminato e tolto da ${pos.length === 1 ? "1 giorno" : pos.length + " giorni"}` : "Luogo eliminato", () => {
      if (old) putItem("luoghi", old); else delItem("luoghi", "h" + id);
      for (const [d, k] of pos) getDay(d).i.splice(k, 0, id);
      if (wasBooked) booked.add(id);
      savePlan(); rerender();
    });
  }

  // ——— SPESE condivise tra le due coppie ———
  const COPPIE = [["Niccolò", "Antonella"], ["Miriam", "Paolo"]];
  const coupleName = c => c.join(" & ");
  const SCAT = { cibo: ["Utensils", "Cibo", "#d9822b"], trasporti: ["TrainFront", "Trasporti", "#1f9488"], alloggio: ["BedDouble", "Alloggio", "#2e6fb0"], attivita: ["Ticket", "Attività", "#d4442f"], shopping: ["ShoppingBag", "Shopping", "#7b4fa0"], altro: ["Receipt", "Altro", "#6b5a45"], rimborso: ["HandCoins", "Rimborso", "var(--ok)"] };
  // categoria di una spesa: quelle fisse con icona, quelle create da voi con emoji; sconosciuta → Altro
  const CCOL = ["#db2777", "#65a30d", "#4f46e5", "#0891b2", "#ca8a04", "#e11d48", "#059669", "#c026d3", "#475569", "#0d9488"];   // diversi dai colori delle categorie fisse
  function catOf(k) {
    if (SCAT[k]) { const [ic, n, col] = SCAT[k]; return { k, n, col, html: icon(ic) }; }
    const c = lists.categorie.find(x => x.id === k);
    return c ? { k, n: c.n, col: c.col, html: `<i class="emo">${esc(c.e)}</i>`, mine: true } : { ...catOf("altro"), k: "altro" };
  }
  let spFilter = null, spMine = false;   // grafico: categoria scelta e "la mia parte"
  // grafico a ciambella: totale per categoria (del gruppo o solo la mia parte); tocca una riga per filtrare
  function catCard() {
    const sp = lists.spese.filter(s => s.cat !== "rimborso");
    if (!sp.length) return "";
    const share = s => { const per = s.perChi?.length ? s.perChi : T.viaggiatori; return spMine ? (per.includes(me) ? s.eur / per.length : 0) : s.eur; };
    const tot = {}; for (const s of sp) { const k = catOf(s.cat).k; tot[k] = (tot[k] || 0) + share(s); }
    const rows = Object.entries(tot).filter(([, v]) => v > .004).sort((a, b) => b[1] - a[1]);
    const sum = rows.reduce((a, [, v]) => a + v, 0), R = 52, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = rows.map(([k, v]) => { const len = v / sum * C, a = `<circle r="${R}" cx="66" cy="66" stroke="${catOf(k).col}" stroke-dasharray="${Math.max(.5, len - (rows.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-off}" opacity="${spFilter && spFilter !== k ? .25 : 1}"/>`; off += len; return a; }).join("");
    return `<div class="card"><div class="between" style="gap:8px"><h3 style="margin:0">Per categoria</h3>${me ? `<div class="seg"><button data-spmine="0" class="${spMine ? "" : "on"}">Gruppo</button><button data-spmine="1" class="${spMine ? "on" : ""}">La mia parte</button></div>` : ""}</div>
      ${sum ? `<div class="catchart"><div class="donut"><svg viewBox="0 0 132 132" aria-hidden="true"><circle r="${R}" cx="66" cy="66" stroke="var(--card-2)"/>${arcs}</svg><div class="mid"><small class="muted">${spMine ? "la tua parte" : "totale"}</small><b>${eurF(sum)}</b></div></div>
        <div class="catrows">${rows.map(([k, v]) => { const c = catOf(k); return `<button class="catrow${spFilter === k ? " on" : ""}" data-fcat="${k}"><span class="sw" style="background:${c.col}">${c.html}</span><span class="nm">${esc(c.n)}</span><span><b>${eurF(v)}</b><span class="pc">${Math.round(v / sum * 100)}%</span></span></button>`; }).join("")}</div></div>
        <p class="small muted" style="margin:8px 0 0">Tocca una categoria per vedere solo quelle spese. I rimborsi non contano.</p>` : `<p class="small muted" style="margin:10px 0 0">Nessuna spesa a tuo carico per ora.</p>`}</div>`;
  }
  const rate = () => LS.get("rate", { r: 170 }).r || 170;
  const eurF = v => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const avatar = (n, s = 26) => `<span class="avatar" style="width:${s}px;height:${s}px;font-size:${s * .42}px;background:${AVATAR[n] || "#888"}">${n[0]}</span>`;
  function balances() {
    const net = Object.fromEntries(T.viaggiatori.map(n => [n, 0]));
    let total = 0;
    for (const s of lists.spese) {
      const per = s.perChi?.length ? s.perChi : T.viaggiatori;
      net[s.pagatoDa] = (net[s.pagatoDa] || 0) + s.eur;
      for (const n of per) net[n] = (net[n] || 0) - s.eur / per.length;
      if (s.cat !== "rimborso") total += s.eur;
    }
    const cn = COPPIE.map(c => c.reduce((a, n) => a + (net[n] || 0), 0));
    return { net, total, cn };
  }
  function splitLabel(per) {
    if (!per?.length || per.length === 4) return "tutti e 4";
    const c = COPPIE.find(c => c.length === per.length && c.every(n => per.includes(n)));
    return c ? coupleName(c) : per.join(", ");
  }

  function renderSpese(back) {
    if (!code) { view.innerHTML = `${back}<h2>Spese</h2><p class="lead">Chi ha pagato cosa, e alla fine chi deve quanto a chi.</p>${needCodeBox("Le spese")}`; bindPcards(); return; }
    const { net, total, cn } = balances();   // cn: saldo di ogni coppia
    const debt = Math.abs(cn[0]) < .5 ? null : cn[0] > 0 ? [COPPIE[1], COPPIE[0], cn[0]] : [COPPIE[0], COPPIE[1], -cn[0]];
    const items = [...lists.spese].filter(s => !spFilter || catOf(s.cat).k === spFilter).sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.ts || 0) - (a.ts || 0));
    let lastD = null;
    view.innerHTML = `${back}<div class="between"><h2>Spese</h2><button class="btn small primary" id="adds" data-top>${icon("Plus")} Aggiungi</button></div><p class="lead">Chi ha pagato cosa, e alla fine chi deve quanto a chi.</p>
      <div class="hero solid" style="min-height:0"><span class="kanji" aria-hidden="true">会計</span><div class="hero-in" style="min-height:190px">
        <span class="kicker">Spesa totale del gruppo</span><div class="big-n" style="font-size:2.6rem" data-count="${total}" data-fmt="eur">${eurF(total)}</div>
        <p>${debt ? `<b>${coupleName(debt[0])}</b> devono <b>${eurF(debt[2])}</b> a ${coupleName(debt[1])}` : "Siete in pari 🤝"}</p>
      </div></div>
      <div class="card"><div class="between"><h3 style="margin:0">Saldo tra le coppie</h3>${debt ? `<button class="btn small" id="settle">${icon("HandCoins")} Segna rimborso</button>` : ""}</div>
        ${COPPIE.map((c, k) => `<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><span class="avpair">${c.map(n => avatar(n, 28)).join("")}</span><span class="grow"><b>${coupleName(c)}</b></span><b style="font-size:1.05rem;color:${cn[k] > .5 ? "var(--ok)" : cn[k] < -.5 ? "var(--shu)" : "var(--muted)"}" data-count="${cn[k]}" data-fmt="eur±">${cn[k] > 0 ? "+" : ""}${eurF(cn[k])}</b></div>`).join("")}
        <p class="small muted" style="margin:8px 0 0">+ deve ricevere · − deve dare. Gli importi in yen sono convertiti al cambio del giorno in cui li inserite.</p>
        <details class="perperson"><summary>Dettaglio per persona</summary>
          ${T.viaggiatori.map(n => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line)">${avatar(n)}<span class="grow">${n}</span><span class="small" style="color:${net[n] > .5 ? "var(--ok)" : net[n] < -.5 ? "var(--shu)" : "var(--muted)"}">${net[n] > 0 ? "+" : ""}${eurF(net[n])}</span></div>`).join("")}
          <p class="small muted" style="margin:6px 0 0">Conta chi ha anticipato dentro la coppia: tra voi due fate come preferite.</p>
        </details>
      </div>
      ${catCard()}
      ${spFilter ? `<div class="row" style="margin-top:14px"><span class="grow small muted">Solo le spese <b>${esc(catOf(spFilter).n)}</b></span><button class="chip on" id="spclr">Mostra tutte ✕</button></div>` : ""}
      ${items.length ? items.map(s => {
        const c = catOf(s.cat), cl = c.n;
        const head = s.data !== lastD ? `<h3>${s.data ? cap1(fmtDay(s.data, { weekday: "long", day: "numeric", month: "long" })) : "Senza data"}</h3>` : ""; lastD = s.data;
        return `${head}<div class="card spesa${s.id === freshId ? " fresh" : ""}" data-spesa="${s.id}"><div class="row">
          <span class="pic" style="background:${c.col}">${c.html}</span>
          <div class="grow"><b>${esc(s.desc || cl)}</b><div class="small muted">${s.cat === "rimborso" ? `${esc(s.pagatoDa)} → ${esc(splitLabel(s.perChi))}` : `pagato da ${esc(s.pagatoDa)} · per ${esc(splitLabel(s.perChi))}`}</div></div>
          <div style="text-align:right"><b>${s.valuta === "JPY" ? fmtInt(s.importo) + " ¥" : eurF(s.importo)}</b>${s.valuta === "JPY" ? `<div class="small muted">${eurF(s.eur)}</div>` : ""}</div>
        </div></div>`;
      }).join("") : `<p class="empty">Nessuna spesa ancora. La prima cena a Shinjuku? 🍜</p>`}`;
    $("#adds").onclick = () => editSpesa({});
    $$("[data-fcat]").forEach(b => b.onclick = () => { spFilter = spFilter === b.dataset.fcat ? null : b.dataset.fcat; buzz(); keepScroll(render); });
    $("#spclr")?.addEventListener("click", () => { spFilter = null; keepScroll(render); });
    $$("[data-spmine]").forEach(b => b.onclick = () => { spMine = b.dataset.spmine === "1"; keepScroll(render); });
    $("#settle")?.addEventListener("click", () => editSpesa({ cat: "rimborso", desc: "Rimborso", valuta: "EUR", importo: Math.round(debt[2] * 100) / 100, pagatoDa: me && debt[0].includes(me) ? me : debt[0][0], perChi: debt[1] }));
    $$("[data-spesa]").forEach(c => c.onclick = () => editSpesa(lists.spese.find(x => x.id === c.dataset.spesa)));
  }

  function editSpesa(s, quick) {
    const isNew = !s.id, today = todayJP();
    let st = { valuta: s.valuta || "JPY", pagatoDa: s.pagatoDa || me || T.viaggiatori[0], perChi: s.perChi?.length ? [...s.perChi] : [...T.viaggiatori], cat: s.cat || "cibo" };
    // chip delle categorie: fisse + create da voi + "Nuova"; tieni premuto su una vostra per eliminarla
    const drawCats = el => {
      const box = $("#s-cats", el); if (!box) return;
      box.innerHTML = Object.keys(SCAT).filter(k => k !== "rimborso").concat(lists.categorie.map(c => c.id)).map(k => { const c = catOf(k); return `<button class="chip" data-cat="${k}">${c.html} ${esc(c.n)}</button>`; }).join("")
        + `<button class="chip" id="nc-open">${icon("Plus")} Nuova</button>`;
      $$("[data-cat]", el).forEach(b => {
        b.onclick = () => { st.cat = b.dataset.cat; draw(el); };
        if (!SCAT[b.dataset.cat]) { let t; b.addEventListener("pointerdown", () => { t = setTimeout(() => delCat(b.dataset.cat, el), 600); }); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => clearTimeout(t))); }
      });
      $("#nc-open", el).onclick = () => { const n = $("#s-newcat", el); n.hidden = !n.hidden; if (!n.hidden) $("#nc-n", el).focus(); };
      draw(el);
    };
    const delCat = async (k, el) => {
      buzz(); const c = catOf(k), used = lists.spese.filter(x => x.cat === k).length;
      if (!(await ask({ title: `Eliminare "${c.n}"?`, text: used ? `${used === 1 ? "1 spesa passa" : used + " spese passano"} in "Altro".` : "Nessuna spesa la usa.", ok: "Elimina", danger: true }))) return;
      for (const x of lists.spese.filter(x => x.cat === k)) putItem("spese", { ...x, cat: "altro" });
      delItem("categorie", k); if (st.cat === k) st.cat = "altro"; drawCats(el); pendingRemote = true;   // la pagina sotto si aggiorna alla chiusura
    };
    const draw = el => {
      $$("[data-val]", el).forEach(b => b.classList.toggle("on", b.dataset.val === st.valuta));
      $$("[data-paid]", el).forEach(b => b.classList.toggle("sel", b.dataset.paid === st.pagatoDa));
      $$("[data-per]", el).forEach(b => b.classList.toggle("sel", st.perChi.includes(b.dataset.per)));
      $$("[data-grp]", el).forEach(b => { const g = b.dataset.grp === "all" ? T.viaggiatori : COPPIE[+b.dataset.grp]; b.classList.toggle("on", g.length === st.perChi.length && g.every(n => st.perChi.includes(n))); });
      $$("[data-cat]", el).forEach(b => b.classList.toggle("on", b.dataset.cat === st.cat));
      const imp = parseNum($("#s-imp", el).value) || 0;
      $("#s-conv", el).textContent = imp ? (st.valuta === "JPY" ? `≈ ${eurF(imp / rate())}` : `≈ ${fmtInt(imp * rate())} ¥`) + (st.perChi.length ? ` · ${eurF((st.valuta === "JPY" ? imp / rate() : imp) / st.perChi.length)} a testa` : "") : "";
    };
    openSheet(`<div class="ttl"><span class="pic" style="background:${s.cat === "rimborso" ? "var(--ok)" : "#7b4fa0"}">${icon(s.cat === "rimborso" ? "HandCoins" : "Receipt")}</span><h2>${isNew ? (s.cat === "rimborso" ? "Rimborso" : "Nuova spesa") : "Modifica spesa"}</h2></div>
      <label class="fl"><span>Descrizione</span><input id="s-desc" value="${esc(s.desc || "")}" placeholder="es. Cena izakaya" autocomplete="off"></label>
      <div class="grid2" style="grid-template-columns:1fr auto;align-items:end">
        <label class="fl"><span>Importo</span><input id="s-imp" inputmode="decimal" value="${s.importo ?? ""}" placeholder="0" style="font-size:1.3rem;font-weight:800"></label>
        <div class="seg" style="margin-bottom:12px"><button data-val="JPY">¥</button><button data-val="EUR">€</button></div>
      </div>
      <p class="small muted" id="s-conv" style="margin:-4px 0 10px"></p>
      <div class="fl"><span>${s.cat === "rimborso" ? "Chi restituisce" : "Ha pagato"}</span><div class="whos">${T.viaggiatori.map(n => `<button data-paid="${n}">${avatar(n, 30)}${n}</button>`).join("")}</div></div>
      <div class="fl"><span>${s.cat === "rimborso" ? "A chi" : "Diviso tra"}</span>
        <div class="seg wide"><button data-grp="all">Tutti e 4</button><button data-grp="0">${COPPIE[0].map(n => n[0]).join(" & ")}</button><button data-grp="1">${COPPIE[1].map(n => n[0]).join(" & ")}</button></div>
        <div class="whos multi">${T.viaggiatori.map(n => `<button data-per="${n}">${avatar(n, 30)}${n}</button>`).join("")}</div></div>
      ${s.cat === "rimborso" ? "" : `<div class="fl"><span>Categoria</span><div class="chips" id="s-cats" style="margin:0;padding:0;flex-wrap:wrap"></div>
        <div class="newcat" id="s-newcat" hidden><input id="nc-e" placeholder="🍡" maxlength="4" autocomplete="off" aria-label="Emoji"><input id="nc-n" placeholder="Nome, es. Onsen" maxlength="24" autocomplete="off"><button class="btn small primary" id="nc-ok">Crea</button></div></div>`}
      <label class="fl"><span>Giorno</span><input type="date" id="s-data" value="${s.data || (today >= T.inizio && today <= T.fine ? today : today)}"></label>
      <div class="btns">${isNew ? `<button class="btn" data-close>Annulla</button>` : `<button class="btn" id="s-del" style="color:var(--shu)">${icon("Trash2")} Elimina</button>`}<button class="btn primary" id="s-save">Salva</button></div>
    `, el => {
      drawCats(el); draw(el);
      if (quick) $("#s-imp", el).focus();   // spesa veloce: si scrive subito l'importo
      if ($("#nc-ok", el)) $("#nc-ok", el).onclick = () => {
        const n = $("#nc-n", el).value.trim(); if (!n) return toast("Scrivi il nome della categoria");
        if ([...Object.values(SCAT).map(x => x[1]), ...lists.categorie.map(c => c.n)].some(x => x.toLowerCase() === n.toLowerCase())) return toast("Esiste già");
        const e = [...$("#nc-e", el).value.trim()].slice(0, 2).join("") || "🏷️";
        const c = putItem("categorie", { id: "k" + uid(), n, e, col: CCOL[lists.categorie.length % CCOL.length] });
        st.cat = c.id; $("#nc-n", el).value = $("#nc-e", el).value = ""; $("#s-newcat", el).hidden = true; drawCats(el); toast(`Categoria "${n}" creata ✓`);
      };
      $("#s-imp", el).oninput = () => draw(el);
      $$("[data-val]", el).forEach(b => b.onclick = () => { st.valuta = b.dataset.val; draw(el); });
      $$("[data-paid]", el).forEach(b => b.onclick = () => { st.pagatoDa = b.dataset.paid; draw(el); });
      $$("[data-per]", el).forEach(b => b.onclick = () => { const n = b.dataset.per; st.perChi = st.perChi.includes(n) ? st.perChi.filter(x => x !== n) : [...st.perChi, n]; draw(el); });
      $$("[data-grp]", el).forEach(b => b.onclick = () => { st.perChi = [...(b.dataset.grp === "all" ? T.viaggiatori : COPPIE[+b.dataset.grp])]; draw(el); });
      $("#s-save", el).onclick = () => {
        const importo = parseNum($("#s-imp", el).value);
        if (!(importo > 0)) return toast("Inserisci l'importo");
        if (!st.perChi.length) return toast("Scegli tra chi dividere");
        const eur = st.valuta === "JPY" ? (s.valuta === "JPY" && s.importo === importo && s.eur ? s.eur : importo / rate()) : importo;
        const saved = putItem("spese", { ...s, ...st, desc: $("#s-desc", el).value.trim(), importo, eur: Math.round(eur * 100) / 100, data: $("#s-data", el).value, ts: s.ts || Date.now() });
        if (isNew) notifyOthers("spesa", saved);
        closeSheet(); toast("Spesa salvata ✓"); rerender();
      };
      $("#s-del", el)?.addEventListener("click", () => { const old = { ...s }; delItem("spese", s.id); closeSheet(); rerender(); toast("Spesa eliminata", () => { putItem("spese", old); rerender(); }); });
    });
  }

  // ——— IL NOSTRO GIAPPONE: il viaggio in numeri (anteprima prima di partire, completo alla fine) ———
  function renderRicordi(back) {
    const today = todayJP(), before = today < T.inizio, after = today > T.fine;
    const anyDone = DAYS.some(d => plan[d]?.f?.length);
    const stopsOf = d => ((anyDone ? plan[d]?.f : plan[d]?.i) || []).filter(id => byId[id]);
    const stops = DAYS.flatMap(stopsOf), uniq = [...new Set(stops)];
    let km = 0; for (const d of DAYS) { const s = stopsOf(d); for (let j = 1; j < s.length; j++) km += kmBetween(byId[s[j - 1]], byId[s[j]]) * 1.25; }
    const zs = []; for (const d of DAYS) { const z = dayZone(d); if (z && zs[zs.length - 1]?.z !== z) zs.push({ z, n: 0 }); if (z) zs[zs.length - 1].n++; }
    const cities = [...new Set(zs.map(x => x.z))];
    const sp = lists.spese.filter(x => x.cat !== "rimborso"), tot = sp.reduce((a, x) => a + x.eur, 0);
    const byCat = {}; for (const x of sp) { const k = catOf(x.cat).k; byCat[k] = (byCat[k] || 0) + x.eur; }
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const byWho = {}; for (const x of sp) byWho[x.pagatoDa] = (byWho[x.pagatoDa] || 0) + x.eur;
    const topWho = Object.entries(byWho).sort((a, b) => b[1] - a[1])[0];
    const big = [...sp].sort((a, b) => b.eur - a.eur)[0];
    const seenU = new Set(), pics = uniq.filter(id => { const u = photoUrl(id); if (!u || seenU.has(u)) return false; seenU.add(u); return true; }).slice(0, 9);   // stessa foto su più luoghi: una volta sola
    const stat = (n, l, c) => `<div class="rstat" style="--c:${c}"><b>${n}</b><small>${l}</small></div>`;
    view.innerHTML = `${back}<h2>Il nostro Giappone</h2><p class="lead">${before ? "Anteprima: si completa durante il viaggio, man mano che timbrate le tappe e segnate le spese." : after ? "Com'è andata, in numeri." : "Il viaggio fin qui, in numeri."}</p>
      <div class="rgrid">
        ${stat(DAYS.length, "giorni", "#c8402f")}${stat(cities.length, "città", "#7b4fa0")}
        ${stat(uniq.length, (uniq.length === 1 ? "tappa " : "tappe ") + (anyDone ? (uniq.length === 1 ? "fatta" : "fatte") : "in programma"), "#1f9488")}${stat(km >= 1 ? Math.round(km) + " km" : "–", "a piedi (stima)", "#d9822b")}
        ${stat(tot ? fmtInt(tot) + " €" : "–", "spesi in tutto", "#2e6fb0")}${stat(tot ? fmtInt(tot / T.viaggiatori.length) + " €" : "–", "a testa", "#4f8a3c")}
      </div>
      ${zs.length ? `<div class="card"><h3 style="margin-top:0">Il percorso</h3><div class="rtrip">${zs.map(x => `<span style="--c:${zona[x.z].colore}"><b>${esc(zona[x.z].nome)}</b><small>${x.n} ${x.n === 1 ? "giorno" : "giorni"}</small></span>`).join(`<i>${icon("ChevronRight")}</i>`)}</div></div>` : ""}
      ${sp.length ? `<div class="card"><h3 style="margin-top:0">Le spese</h3>
        ${topCat ? `<div class="row rline"><span class="pic" style="background:${catOf(topCat[0]).col}">${catOf(topCat[0]).html}</span><div class="grow"><small class="muted">Categoria regina</small><b>${esc(catOf(topCat[0]).n)} · ${eurF(topCat[1])}</b></div></div>` : ""}
        ${big ? `<div class="row rline"><span class="pic" style="background:${catOf(big.cat).col}">${catOf(big.cat).html}</span><div class="grow"><small class="muted">La spesa più grande</small><b>${esc(big.desc || catOf(big.cat).n)} · ${eurF(big.eur)}</b></div></div>` : ""}
        ${topWho ? `<div class="row rline">${avatar(topWho[0], 40)}<div class="grow"><small class="muted">Ha anticipato di più</small><b>${esc(topWho[0])} · ${eurF(topWho[1])}</b></div></div>` : ""}</div>` : ""}
      ${pics.length ? `<h3>${anyDone ? "Dove siamo stati" : "Dove andremo"}</h3><div class="rpics">${pics.map(id => `<div class="ph" data-bg="${photoUrl(id, 330)}" data-place="${id}"></div>`).join("")}</div>` : ""}
      ${navigator.share ? `<button class="btn primary" id="rshare" style="width:100%;margin-top:16px">${icon("Share2")} Condividi il riassunto</button>` : ""}`;
    lazyScan();
    $("#rshare")?.addEventListener("click", () => navigator.share({ title: T.titolo, text: `${T.titolo}: ${DAYS.length} giorni, ${cities.map(z => zona[z].nome).join(", ")}${uniq.length ? `, ${uniq.length} tappe` : ""}${km >= 1 ? `, ~${Math.round(km)} km a piedi` : ""}${tot ? `, ${fmtInt(tot)} € in tutto` : ""}. 🇯🇵` }).catch(() => {}));
  }

  // ——— NOTIFICHE ———
  // Le manda il servizio notifiche (Cloudflare, gratuito): l'app registra questo telefono in Firestore (viaggi/{codice}/push)
  // e gli segnala le spese e prenotazioni nuove; i promemoria a orario li decide il servizio da solo.
  const VAPID = "BIRse5R_V9V2eO33I-EUwgiO2zR6uYtwm2c-zn6xTvUBB5Ot5yig1WfJI0A5FYwL_JX55CtfcrzCwvmWLRLNVfM";
  const PREFS = [["spese", "Nuove spese", "quando un altro aggiunge una spesa o un rimborso"], ["pren", "Nuove prenotazioni", "hotel, voli, treni e biglietti aggiunti dagli altri"],
    ["bigl", "Biglietti da prenotare", "30, 14, 7 e 3 giorni prima, finché non è spuntato"], ["part", "Prima di partire", "una settimana e il giorno prima, check-in del volo"],
    ["matt", "Ogni mattina in viaggio", "alle 8: tappe del giorno, meteo e hotel"], ["trasf", "Sera prima di un trasferimento", "alle 20: treno, orario e valigie"]];
  const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  async function whenSync() { for (let i = 0; i < 40 && !sync; i++) await new Promise(r => setTimeout(r, 250)); return sync; }
  async function savePush(sub, st) { const s = await whenSync(); s?.put("push", { id: st.sid, sub: JSON.stringify(sub), who: me || "", prefs: st.prefs }); }
  async function currentSub() { try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; } }
  function notifCard() {
    if (!T.notifyUrl) return;
    const st = LS.get("push", null), box = document.createElement("div"); box.className = "card"; box.id = "notif";
    const msg = t => `<div class="row"><span class="pic" style="background:#d4442f">${icon("Sparkles")}</span><div class="grow"><b>Notifiche</b><div class="muted small">${t}</div></div></div>`;
    if (!pushOK()) box.innerHTML = msg(isIOS && !standalone ? "Per riceverle aggiungi l'app alla schermata Home (Condividi › Aggiungi alla schermata Home) e aprila da lì." : "Questo browser non le supporta.");
    else if (!code) box.innerHTML = msg("Serve prima il codice del viaggio (Accesso, qui sopra).");
    else if (Notification.permission === "denied") box.innerHTML = msg(isIOS ? "Bloccate. Per riattivarle: Impostazioni di iPhone › Notifiche › Giappone 2027." : "Bloccate. Riattivale dalle impostazioni del browser per questo sito.");
    else if (!st || Notification.permission !== "granted") {
      box.innerHTML = `${msg("Spese e prenotazioni degli altri, promemoria per biglietti, partenza, mattine e trasferimenti.")}<button class="btn primary" id="pushon" style="width:100%;margin-top:12px">${icon("Sparkles")} Attiva notifiche</button>`;
    } else {
      box.innerHTML = `<div class="between"><b>Notifiche attive</b><button class="btn small" id="pushtest">Prova</button></div>
        ${PREFS.map(([k, t, d]) => `<label class="check plain" style="margin-top:8px"><input type="checkbox" data-pref="${k}" ${st.prefs?.[k] !== false ? "checked" : ""}><span><b>${t}</b><br><small class="muted">${d}</small></span></label>`).join("")}
        <button class="btn" id="pushoff" style="width:100%;margin-top:12px;color:var(--shu)">Disattiva su questo telefono</button>`;
    }
    view.appendChild(box);
    $("#pushon", box)?.addEventListener("click", enablePush);
    $("#pushtest", box)?.addEventListener("click", async () => {
      try { const r = await fetch(T.notifyUrl + "/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, kind: "test", sid: st.sid }) }); toast(r.ok ? "Inviata: arriva tra pochi secondi" : "Non riuscita, riprova tra poco"); }
      catch { toast("Serve la connessione"); }
    });
    $$("[data-pref]", box).forEach(c => c.onchange = async () => { st.prefs = { ...st.prefs, [c.dataset.pref]: c.checked }; LS.set("push", st); const sub = await currentSub(); if (sub) savePush(sub, st); });
    $("#pushoff", box)?.addEventListener("click", async () => {
      const sub = await currentSub(); try { await sub?.unsubscribe(); } catch {}
      (await whenSync())?.del("push", st.sid); LS.set("push", null); toast("Notifiche disattivate"); rerender();
    });
  }
  async function enablePush() {
    try {
      if (await Notification.requestPermission() !== "granted") { toast("Permesso negato"); return rerender(); }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(VAPID) });
      const st = { sid: await sha(sub.endpoint), prefs: Object.fromEntries(PREFS.map(([k]) => [k, true])) };
      LS.set("push", st); await savePush(sub, st); buzz(); toast("Notifiche attive ✓"); rerender();
    } catch (err) { console.warn(err); toast("Non sono riuscito ad attivarle"); }
  }
  // all'avvio: tiene aggiornata l'iscrizione (il telefono può cambiarla) e il nome di chi la usa
  setTimeout(async () => {
    const st = LS.get("push", null); if (!st || !T.notifyUrl || !pushOK() || !code) return;
    const sub = await currentSub();
    if (!sub || Notification.permission !== "granted") { LS.set("push", null); return; }
    const sid = await sha(sub.endpoint); if (sid !== st.sid) { (await whenSync())?.del("push", st.sid); st.sid = sid; LS.set("push", st); }
    savePush(sub, st);
  }, 4000);
  // spese e prenotazioni nuove → avviso agli altri (in coda se si è offline, riparte appena torna la rete)
  let flushing = false;
  function notifyOthers(kind, it) {
    if (!T.notifyUrl || !code) return;
    const item = kind === "spesa" ? { id: it.id, desc: it.desc, importo: it.importo, valuta: it.valuta, eur: it.eur, pagatoDa: it.pagatoDa, perChi: it.perChi, cat: it.cat }
      : { id: it.id, tipo: it.tipo, titolo: it.titolo, dal: it.dal, ora: it.ora };
    LS.set("notifyQ", [...LS.get("notifyQ", []), { kind, by: me || "Qualcuno", item, t: Date.now() }].slice(-30)); flushNotify();
  }
  async function flushNotify() {
    if (flushing || !navigator.onLine || !T.notifyUrl || !code) return; flushing = true;
    try {
      const keep = [];
      for (const x of LS.get("notifyQ", [])) {
        if (Date.now() - x.t > 2 * 864e5) continue;   // dopo due giorni non ha più senso
        try { const r = await fetch(T.notifyUrl + "/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, kind: x.kind, by: x.by, item: x.item }) }); if (r.status >= 500) keep.push(x); } catch { keep.push(x); }
      }
      LS.set("notifyQ", keep);
    } finally { flushing = false; }
  }
  addEventListener("online", flushNotify); setTimeout(flushNotify, 3000);
  // avviso offline: l'app funziona lo stesso, le modifiche partono appena torna la rete
  let offT = null;
  function offPill(on) {
    $(".offpill")?.remove(); clearTimeout(offT);
    if (!on) return;
    const el = document.createElement("div"); el.className = "offpill"; el.innerHTML = `${icon("CloudOff")} Offline · i dati restano sul telefono`;
    document.body.appendChild(el); offT = setTimeout(() => el.remove(), 4500);
  }
  addEventListener("offline", () => offPill(true));
  addEventListener("online", () => { offPill(false); toast("Di nuovo online ✓"); });
  if (!navigator.onLine) setTimeout(() => offPill(true), 800);

  // aggiornamento forzato: scarta la versione salvata dell'app (non le mappe né le foto) e ricarica
  async function forceUpdate() {
    toast("Scarico la versione nuova…");
    try {
      for (const k of await caches.keys()) if (k !== "jp27-mappe" && k !== "jp27-cdn") await caches.delete(k);
      for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister();
    } catch {}
    location.replace(location.pathname + "?v=" + Date.now() + location.hash);
  }

  // ——— chi sei? ———
  const AVATAR = { "Niccolò": "#2b4c7e", "Antonella": "#c0577a", "Miriam": "#1f9488", "Paolo": "#d9822b" };
  // Accesso: codice segreto del viaggio (protegge i dati condivisi) + chi sei.
  function askWho(needCode = !code) {
    let pick = me;
    openSheet(`
      <h2>${needCode ? "Benvenuti a bordo ✈️" : "Chi sei?"}</h2>
      <p class="lead">${needCode ? "Inserisci il codice del viaggio che vi siete passati: protegge programma, prenotazioni e spese." : "Così sappiamo chi ha fatto le modifiche."}</p>
      ${needCode ? `<input type="text" id="tcode" placeholder="Codice del viaggio" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(code)}" style="font-weight:700;letter-spacing:.04em">` : ""}
      <div class="who">${T.viaggiatori.map(n => `<button data-who="${n}" class="${n === me ? "sel" : ""}"><span class="avatar" style="background:${AVATAR[n] || "#888"}">${n[0]}</span>${n}</button>`).join("")}</div>
      ${needCode ? `<div class="btns"><button class="btn ghost" data-close>Più tardi</button><button class="btn primary" id="enter">Entra</button></div>
        <p class="muted small" style="margin-top:12px">Senza codice l'app funziona lo stesso, ma solo su questo telefono e senza spese e prenotazioni condivise.</p>` : ""}`, el => {
      $$("[data-who]", el).forEach(b => b.onclick = () => {
        pick = b.dataset.who; $$("[data-who]", el).forEach(x => x.classList.toggle("sel", x === b));
        if (!needCode) { me = pick; LS.set("me", me); closeSheet(); toast(`Ciao ${me}! 👋`); render(); }
      });
      $("#enter", el)?.addEventListener("click", () => {
        const c = $("#tcode", el).value.trim().toLowerCase();
        if (!c) return toast("Scrivi il codice del viaggio");
        if (!pick) return toast("Scegli chi sei");
        me = pick; LS.set("me", me);
        const changed = c !== code; code = c; LS.set("code", c);
        closeSheet();
        LS.set("skipCode", false);
        if (changed && sync) location.reload(); else { startSync(); toast(`Ciao ${me}! 👋`); render(); }
      });
    }, () => { if (needCode && !code) { LS.set("skipCode", true); toast("Puoi inserire il codice quando vuoi da Utility"); } });
  }

  // ——— orologi ———
  function tick() {
    const f = tz => new Date().toLocaleTimeString("it-IT", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    $$("[data-clock]").forEach(el => { el.textContent = f(el.dataset.clock); });
  }
  setInterval(tick, 30e3);

  // ——— router ———
  const TABS = [["oggi", "Sun", "Oggi"], ["giorni", "CalendarDays", "Giorni"], ["luoghi", "MapPin", "Luoghi"], ["mappa", "Map", "Mappa"], ["utility", "LayoutGrid", "Utility"]];
  const nav = $("#tabs");
  nav.innerHTML = `<span class="tab-ind" aria-hidden="true"><i class="tint"></i><i class="glass"><span class="lens-row">${TABS.map(([k, ic, t]) => `<span data-tab="${k}">${icon(ic)}${t}</span>`).join("")}</span></i><i class="shine"></i></span>`
    + TABS.map(([k, ic, t]) => `<a href="#${k}" data-tab="${k}">${icon(ic)}${t}</a>`).join("")
    + `<label class="haptic" aria-hidden="true"><input type="checkbox" switch tabindex="-1"></label>`;
  const ind = $(".tab-ind", nav), tint = $(".tint", ind), glass = $(".glass", ind), shine = $(".shine", ind), row = $(".lens-row", ind);
  const rowItems = $$(".lens-row span", ind), haptic = $(".haptic", nav);
  const tabLinks = () => $$("a", nav);

  // ——— Lente "liquid glass" della barra in basso ———
  // Stato fisico: posizione x (molla sottosmorzata = rimbalzo), "pressione" p 0→1 (crescita della lente).
  const L = { x: 0, vx: 0, tx: 0, p: 0, vp: 0, tp: 0, raf: 0, last: 0, hit: null };
  const POS = { k: 420, c: 26 }, PRESS = { k: 340, c: 17 };
  function syncInd(instant) {
    const on = $("a.on", nav); if (!on) return;
    L.tx = on.offsetLeft; if (instant) { L.x = L.tx; L.vx = 0; }
    kick();
  }
  function kick() { if (!L.raf) { L.last = performance.now(); L.raf = requestAnimationFrame(frame); } }
  function frame(now) {
    let dt = Math.min(0.05, (now - L.last) / 1000); L.last = now;
    while (dt > 0) {   // passi piccoli = molla stabile
      const h = Math.min(dt, 1 / 240); dt -= h;
      L.vx += (POS.k * (L.tx - L.x) - POS.c * L.vx) * h; L.x += L.vx * h;
      L.vp += (PRESS.k * (L.tp - L.p) - PRESS.c * L.vp) * h; L.p += L.vp * h;
    }
    draw();
    const settled = Math.abs(L.tx - L.x) < .2 && Math.abs(L.vx) < 2 && Math.abs(L.tp - L.p) < .002 && Math.abs(L.vp) < .02;
    if (settled && !drag.on) { L.x = L.tx; L.p = L.tp; draw(); L.raf = 0; return; }
    L.raf = requestAnimationFrame(frame);
  }
  function draw() {
    const a0 = tabLinks()[0]; if (!a0) return;
    const tabW = a0.offsetWidth, rowH = nav.clientHeight - 12, p = Math.max(0, L.p);
    const w = tabW + 22 * p, h = rowH + 20 * p;
    const left = L.x - (w - tabW) / 2, top = 6 - 10 * p;
    // deformazione "gelatina": si allunga nella direzione del moto e si schiaccia in altezza
    const st = Math.min(Math.abs(L.vx) / 2600, .24) * (.35 + .65 * Math.min(1, p + .3));
    const pressSquish = (L.p - L.tp) * -.06;   // piccola oscillazione mentre cresce/si sgonfia
    ind.style.width = w + "px"; ind.style.height = h + "px";
    ind.style.transform = `translate(${left}px, ${top}px) scale(${1 + st + pressSquish}, ${1 - st * .55 - pressSquish})`;
    const g = Math.min(1, p * 1.4);
    tint.style.opacity = 1 - g; glass.style.opacity = g; shine.style.opacity = g;
    // ingrandimento: copia delle voci dentro la lente, scalata attorno al centro della lente
    const M = 1 + .22 * p, cx = L.x + tabW / 2;
    row.style.width = nav.clientWidth - 12 + "px"; row.style.height = rowH + "px"; row.style.top = 6 - top + "px";
    row.style.transformOrigin = `${cx - 6}px 50%`;
    row.style.transform = `translateX(${6 - left}px) scale(${M})`;
    nav.style.scale = 1 + .03 * p;
    const hit = tabLinks().reduce((b, a) => Math.abs(a.offsetLeft + tabW / 2 - cx) < Math.abs(b.offsetLeft + tabW / 2 - cx) ? a : b);
    if (hit !== L.hit) {
      L.hit = hit;
      rowItems.forEach(s => s.classList.toggle("hit", s.dataset.tab === hit.dataset.tab));
      if (drag.on) buzz();
    }
  }
  // feedback aptico: su iOS 18+ il toggle di un <input switch> fa vibrare il telefono
  function buzz() { if (navigator.userActivation && !navigator.userActivation.isActive) return; try { haptic.click(); } catch {} navigator.vibrate?.(8); }

  const drag = { on: false, pid: null, x0: 0, timer: 0, tapA: null };
  addEventListener("resize", () => syncInd(true));
  (() => {
    const tabW = () => tabLinks()[0].offsetWidth;
    const localX = e => e.clientX - nav.getBoundingClientRect().left;
    const clampX = x => Math.max(6, Math.min(nav.clientWidth - tabW() - 6, x));
    const nearest = cx => tabLinks().reduce((b, a) => Math.abs(a.offsetLeft + tabW() / 2 - cx) < Math.abs(b.offsetLeft + tabW() / 2 - cx) ? a : b);
    function begin(e) {
      if (drag.on) return; drag.on = true; clearTimeout(drag.timer);
      L.tp = 1; L.tx = clampX(localX(e) - tabW() / 2); kick();
    }
    function finish(ok) {
      clearTimeout(drag.timer);
      const wasDrag = drag.on, a = wasDrag ? nearest(L.tx + tabW() / 2) : drag.tapA;
      drag.on = false; drag.pid = null;
      if (!ok || !a) { L.tp = 0; syncInd(); return; }
      L.tx = a.offsetLeft;
      if (wasDrag) L.tp = 0;
      else { L.tp = .55; setTimeout(() => { L.tp = 0; kick(); }, 140); }   // tocco: piccolo "respiro" della goccia
      kick();
      // cambia pagina al frame successivo, così l'animazione parte senza scatti
      requestAnimationFrame(() => setTimeout(() => go("#" + a.dataset.tab), 0));
    }
    nav.addEventListener("pointerdown", e => {
      if (drag.pid !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag.pid = e.pointerId; drag.x0 = e.clientX; drag.tapA = e.target.closest("a");
      try { nav.setPointerCapture(drag.pid); } catch {}
      const ev = { clientX: e.clientX };
      drag.timer = setTimeout(() => begin(ev), 170);   // tieni premuto → la goccia diventa lente
    });
    nav.addEventListener("pointermove", e => {
      if (e.pointerId !== drag.pid) return;
      if (!drag.on && Math.abs(e.clientX - drag.x0) > 6) begin(e);
      if (drag.on) { L.tx = clampX(localX(e) - tabW() / 2); kick(); }
    });
    nav.addEventListener("pointerup", e => { if (e.pointerId === drag.pid) finish(true); });
    nav.addEventListener("pointercancel", e => { if (e.pointerId === drag.pid) finish(false); });
    nav.addEventListener("click", e => { if (e.detail !== 0 && !e.target.closest(".haptic")) e.preventDefault(); });
    nav.addEventListener("contextmenu", e => e.preventDefault());
  })();

  // memoria delle pagine (come le app con le schede in basso): tornando su una pagina già vista, se nel frattempo
  // non è cambiato niente si rimette quella di prima, con foto già pronte e senza ricostruirla
  const pages = new Map();   // indirizzo → { frag, stamp }
  let shown = null;          // { key, stamp } della pagina sullo schermo
  const stampNow = () => `${dataVer}|${todayJP()}|${new Date().getHours()}|${code ? 1 : 0}|${me}|${isDark()}`;
  function stashPage() {
    if (!shown || shown.key.startsWith("#mappa") || !view.firstChild) { shown = null; return; }
    progRest?.();
    const frag = document.createDocumentFragment(); while (view.firstChild) frag.appendChild(view.firstChild);
    pages.delete(shown.key); pages.set(shown.key, { frag, stamp: shown.stamp });
    while (pages.size > 6) pages.delete(pages.keys().next().value);   // al massimo 6 pagine in memoria
    shown = null;
  }
  let restored = false;
  function render() {
    let [tab, sub] = (location.hash.slice(1) || "oggi").split("/");
    if (!TABS.some(t => t[0] === tab)) { tab = "oggi"; sub = undefined; history.replaceState(null, "", "#oggi"); }   // indirizzo sconosciuto
    const key = location.hash || "#oggi";
    if (shown && shown.key !== key) stashPage(); else shown = null;
    view.classList.remove("full");
    document.body.classList.toggle("on-map", tab === "mappa");
    setHead();
    tabLinks().forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    syncInd(!L.raf && L.x === 0);
    const kept = pages.get(key); pages.delete(key);
    restored = !!kept && kept.stamp === stampNow();
    if (restored) { view.replaceChildren(kept.frag); if (tab === "oggi") tick(); }
    else ({ oggi: renderOggi, giorni: () => renderGiorni(sub), luoghi: renderLuoghi, mappa: renderMappa, utility: () => renderUtility(sub) }[tab] || renderOggi)();
    shown = { key, stamp: stampNow() };
    watchTitle();
  }
  // altezza della testata come variabile CSS: si scrive solo se cambia (scriverla ricalcola lo stile di tutta la pagina)
  let headPx = "";
  function setHead() { const v = ($(".top")?.offsetHeight || 60) + "px"; if (v !== headPx) { headPx = v; document.documentElement.style.setProperty("--head", v); } }
  // titolo compatto nella testata quando quello grande della pagina scorre via
  let pageTitle = null;
  // testata: "‹ indietro" o la data a sinistra, azione principale (+) a destra, titolo piccolo al centro
  function watchTitle() {
    const [tab] = (location.hash.slice(1) || "oggi").split("/"), top = $(".top");
    const back = $("#view > a.back"), act = $("#view [data-top]");
    pageTitle = $("#view > h2, #view > .between > h2");
    $("#tbl").innerHTML = tab === "oggi" ? `<span class="tbdate">${fmtDay(todayJP(), { weekday: "long", day: "numeric", month: "long" }).replace(/^./, c => c.toUpperCase())}</span>`
      : back ? `<a class="tbback" href="${back.getAttribute("href")}">${icon("ChevronLeft")}${esc(back.textContent.trim())}</a>` : "";
    $("#tbact").innerHTML = act ? `<button class="tbplus" aria-label="${esc(act.textContent.trim())}">${icon("Plus")}</button>` : "";
    if (act) $("#tbact button").onclick = () => { buzz(); act.click(); };
    $("#ctitle").textContent = pageTitle ? pageTitle.textContent.trim() : tab === "oggi" ? "" : (TABS.find(t => t[0] === tab)?.[2] || "");
    top.classList.toggle("always", !pageTitle && tab !== "oggi");
    checkTitle();
  }
  function checkTitle() {
    const top = $(".top"), on = !!pageTitle?.isConnected && pageTitle.getBoundingClientRect().bottom < top.offsetHeight;
    if (top.classList.contains("compact") !== on) top.classList.toggle("compact", on);
  }
  SC.addEventListener("scroll", checkTitle, { passive: true });
  function rerender() {
    dataVer++; const [tab] = (location.hash.slice(1) || "oggi").split("/"); if (tab === "mappa") return;
    if (canVT() && !sheetOpen() && $(LIST_SEL)) runVT("update", () => keepScroll(render), true);
    else keepScroll(render);
  }
  // è un'app: niente zoom della pagina con due dita (iOS ignora user-scalable=no, serve bloccarlo a mano).
  // La mappa resta libera: ha il suo zoom
  const onMap = e => !!e.target?.closest?.(".mapwrap, .mapel");
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, e => { if (!onMap(e)) e.preventDefault(); }, { passive: false });
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  // indietro come nelle app con la barra in basso: risale solo dentro la sezione (Utility › Spese → Utility),
  // non salta mai da una sezione all'altra; sulla pagina principale di una sezione non fa nulla
  const backTarget = () => { const [tab, sub] = (location.hash.slice(1) || "oggi").split("/"); return tab === "utility" && sub ? "#utility" : null; };
  if (standalone) (() => {
    let x0 = null, y0 = 0, dx = 0, on = null, t0 = 0;
    document.addEventListener("touchstart", e => {
      const t = e.touches[0];
      if (e.touches.length > 1 || t.clientX > 22 || onMap(e) || sheetOpen() || !$("#big").hidden || !backTarget()) { x0 = null; return; }
      x0 = t.clientX; y0 = t.clientY; dx = 0; on = null; t0 = performance.now();
      document.addEventListener("touchmove", move, { passive: false });   // solo durante questo gesto: lo scroll normale resta fluido
    }, { passive: true });
    function move(e) {
      if (x0 == null) return;
      const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
      if (on === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) on = mx > Math.abs(my);
      if (!on) { if (on === false) x0 = null; return; }
      e.preventDefault();
      dx = Math.max(0, mx); view.style.transition = "none"; view.style.transform = `translateX(${dx}px)`; view.style.opacity = String(1 - Math.min(.4, dx / innerWidth * .6));
    }
    document.addEventListener("touchend", () => {
      document.removeEventListener("touchmove", move);
      if (x0 == null || !on) { x0 = null; return; }
      x0 = null;
      const fast = dx > 40 && dx / (performance.now() - t0) > .5;
      view.style.transition = "transform .22s cubic-bezier(.32, .72, 0, 1), opacity .22s";
      if (dx > innerWidth * .33 || fast) {
        buzz(); view.style.transform = `translateX(${innerWidth}px)`; view.style.opacity = "0";
        setTimeout(() => { view.style.transition = view.style.transform = view.style.opacity = ""; if (backTarget()) go("#utility"); }, 200);
      } else { view.style.transform = ""; view.style.opacity = ""; setTimeout(() => (view.style.transition = ""), 240); }
    });
  })();

  // tastiera aperta: la barra in basso si nasconde (su Android salirebbe sopra la tastiera)
  const isTyping = el => el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !/checkbox|radio|button|submit|range/.test(el.type)));
  document.addEventListener("focusin", e => { if (isTyping(e.target)) document.body.classList.add("kb"); });
  document.addEventListener("focusout", () => setTimeout(() => { if (!isTyping(document.activeElement)) document.body.classList.remove("kb"); }, 80));

  // tastiera giusta per ogni campo: "Cerca" nelle ricerche, maiuscola iniziale nei testi, "Fine" negli importi
  new MutationObserver(() => $$("input:not([data-kb]), textarea:not([data-kb])").forEach(i => {
    i.dataset.kb = 1;
    if (i.type === "search") i.enterKeyHint = "search";
    else if (i.inputMode === "decimal" || i.type === "number") i.enterKeyHint = "done";
    else if ((i.type === "text" || i.tagName === "TEXTAREA") && !i.hasAttribute("autocapitalize")) i.setAttribute("autocapitalize", "sentences");
  })).observe(document.body, { childList: true, subtree: true });

  // riaperta dopo un po' (o il giorno dopo): si aggiorna da sola, come un'app
  let shownDay = todayJP(), hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    const newDay = todayJP() !== shownDay, long = hiddenAt && Date.now() - hiddenAt > 20 * 60e3;
    shownDay = todayJP();
    if ((newDay || long) && !sheetOpen()) { const [tab] = (location.hash.slice(1) || "oggi").split("/"); if (tab === "oggi" || tab === "giorni") rerender(); }
  });

  // effetto pressione come nelle app native: compare solo quando è davvero un tocco, non quando il dito
  // appoggiato inizia a scorrere la pagina (con :active le card si "accendevano" anche scorrendo)
  const PRESSABLE = ".ucard, .qa, .dchip, .chip, .mini, .prep, .mcard, .chapter, .lres button, .whos button, .who button, .addgrid button, .dayact > *, .iconbtn, .seg button, .card.pcard, .card.spesa, .nextstop .row, .gcard, .place, .btn, .urow, label.check, .phrase";
  let press = null;
  const unpress = (keep = 0) => { if (!press) return; clearTimeout(press.t); const el = press.el; press = null; setTimeout(() => el.classList.remove("pressed"), keep); };
  document.addEventListener("pointerdown", e => {
    unpress();
    if (e.pointerType === "mouse" && e.button) return;
    const el = e.target.closest(PRESSABLE); if (!el || el.disabled || el.closest(".dragging, .swiping")) return;
    // un attimo di attesa: se nel frattempo il dito si muove è uno scorrimento, e non si accende niente
    press = { el, x: e.clientX, y: e.clientY, t: setTimeout(() => el.classList.add("pressed"), 60) };
  }, { passive: true });
  document.addEventListener("pointermove", e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { press.el.classList.remove("pressed"); unpress(); } }, { passive: true });
  document.addEventListener("pointerup", () => { if (!press) return; press.el.classList.add("pressed"); unpress(110); }, { passive: true });   // tocco veloce: si vede comunque
  document.addEventListener("pointercancel", () => { if (press) { press.el.classList.remove("pressed"); unpress(); } }, { passive: true });
  addEventListener("scroll", () => { if (press) { press.el.classList.remove("pressed"); unpress(); } }, { passive: true, capture: true });
  // vibrazione leggera quando si spunta qualcosa
  document.addEventListener("change", e => { if (e.target.matches?.('input[type="checkbox"]') && !e.target.closest(".haptic")) buzz(); });
  // ogni pagina ricorda dov'eri arrivato; entrare in una sottopagina scorre da destra, tornare da sinistra
  const scrollMem = {};
  let lastHash = location.hash || "#oggi";
  function navKind(from, to) {
    const [ta, sa] = from.slice(1).split("/"), [tb, sb] = to.slice(1).split("/");
    if (tb === "mappa" || ta === "mappa") return "fade";
    if (ta !== tb) return "tab";
    if (tb === "giorni") { const a = DAYS.indexOf(sa || selDay), b = DAYS.indexOf(sb || selDay); return a === b ? "tab" : b > a ? "next" : "prev"; }
    if (!sa && sb) return "push";
    if (sa && !sb) return "pop";
    return "tab";
  }
  function restoreScroll(y) { SC.scrollTop = y; if (y && Math.abs(SC.scrollTop - y) > 2) [80, 250].forEach(ms => setTimeout(() => { if (SC.scrollTop < y) SC.scrollTop = y; }, ms)); }
  function navigate() {
    if (!isSub(location.hash)) subPushed = false;   // indietro di sistema da una sottopagina: non si è più "dentro"
    layers.length = 0;   // la pagina cambia: le schede aperte si chiudono
    closeSheet(true, true); hideBig(true);
    if (maybeImport()) return;
    // un tocco durante uno scorrimento di pagina: lo scorrimento finisce subito (altrimenti resterebbe sullo schermo
    // la "fotografia" della pagina di prima sopra quella nuova)
    vtRun?.skipTransition?.();
    const to = location.hash || "#oggi", kind = navKind(lastHash, to);
    if (!lastHash.startsWith("#mappa")) scrollMem[lastHash] = SC.scrollTop;
    // ferma l'inerzia della pagina di prima (su iPhone continuerebbe a scorrere la pagina nuova)
    SC.style.overflowY = "hidden"; setTimeout(() => { SC.style.overflowY = ""; }, 30);
    lastHash = to;
    view.classList.remove("enter", "nav-push", "nav-pop", "nav-next", "nav-prev", "nav-fade");
    const show = () => {
      if (!to.startsWith("#mappa")) SC.scrollTop = 0;
      render();
      if (!to.startsWith("#mappa") && (kind === "tab" || kind === "pop")) restoreScroll(scrollMem[location.hash || "#oggi"] || 0);
      if (!restored) playIntro();
    };
    // come su iPhone: le schede in basso cambiano all'istante; entrare/uscire da una pagina (o passare al giorno dopo)
    // fa scorrere la pagina intera, con la tecnica nativa di Safari (View Transitions) quando c'è
    const slide = kind === "push" || kind === "pop" || kind === "next" || kind === "prev";
    if (slide && canVT()) runVT(kind === "next" ? "push" : kind === "prev" ? "pop" : kind, show);
    else {
      show();
      if (slide || kind === "fade") { void view.offsetWidth; view.classList.add("enter", "nav-" + kind); }
    }
  }
  // ——— transizioni native (View Transitions): pagine che scorrono e liste che si riordinano da sole ———
  const canVT = () => !!document.startViewTransition && !reduceMotion() && !document.hidden;
  let vtRun = null;
  function runVT(type, update, keys) {
    vtRun?.skipTransition?.();
    const r = document.documentElement; r.dataset.vt = type;
    if (keys) nameItems(keys);
    const t = vtRun = document.startViewTransition(() => { update(); if (keys) nameItems(keys); });
    t.ready.catch(() => {});   // transizione saltata (es. un tocco durante lo scorrimento): non è un errore
    t.finished.finally(() => { if (vtRun === t) { vtRun = null; delete r.dataset.vt; if (keys) nameItems(null); } });
  }
  // gli elementi delle liste (tappe, spese, prenotazioni, biglietti, luoghi) ricevono un nome: così, quando la lista
  // cambia, ognuno scivola nella nuova posizione, quelli nuovi compaiono e quelli tolti spariscono
  const LIST_SEL = "#view .tl > li, #view .card.spesa, #view .card.pcard, #view #booklist > .check, #view .place[data-place], #view .gcard[data-place]";
  const itemKey = el => el.dataset.spesa || el.dataset.pren || el.dataset.place || el.querySelector("[data-place],[data-book],[data-stop]")?.dataset.place
    || el.querySelector("[data-book]")?.dataset.book || el.querySelector("[data-stop]")?.dataset.stop || "";
  function nameItems(on) {
    const seen = new Set();
    for (const el of $$(LIST_SEL)) {
      const k = on && itemKey(el), n = k && "it-" + k.replace(/[^\w-]/g, "_");
      if (!n || seen.has(n) || seen.size > 60 || el.offsetParent === null) { el.style.viewTransitionName = ""; continue; }
      seen.add(n); el.style.viewTransitionName = n;
    }
  }
  // indietro/avanti di sistema: cambia pagina se l'indirizzo è cambiato (una volta sola, chiunque arrivi prima)
  const syncNav = () => { if ((location.hash || "#oggi") !== lastHash) navigate(); };
  addEventListener("hashchange", syncNav); addEventListener("popstate", syncNav);

  applyTheme();
  // cambio ¥/€ aggiornato all'avvio (serve anche alle spese), al massimo ogni 12 ore
  (() => {
    const st = LS.get("rate", null);
    if (st?.d && Date.now() - new Date(st.d) < 12 * 3600e3) return;
    fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY").then(r => r.json()).then(j => { if (j?.rates?.JPY) LS.set("rate", { r: j.rates.JPY, d: j.date }); }).catch(() => {});
  })();
  // dimensione del testo come in Impostazioni › Schermo e luminosità › Dimensioni testo di iPhone
  function textScale() {
    if (!CSS.supports?.("font", "-apple-system-body") || !navigator.maxTouchPoints) return;   // solo iPhone/iPad (sul Mac la misura è diversa)
    const probe = document.createElement("span"); probe.style.cssText = "font:-apple-system-body;position:absolute;visibility:hidden"; probe.textContent = "x";
    document.body.appendChild(probe); const px = parseFloat(getComputedStyle(probe).fontSize); probe.remove();
    const r = px ? Math.min(1.3, Math.max(.9, px / 17)) : 1;   // 17 = dimensione standard di iPhone; limiti perché l'impaginazione regga
    document.documentElement.style.fontSize = Math.abs(r - 1) < .01 ? "" : 16 * r + "px";
    setHead();
  }
  textScale();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") textScale(); });

  // foto a schermo intero: due dita per ingrandire, doppio tocco per zoom, trascina giù per chiudere
  function openViewer(src, small) {
    const v = document.createElement("div"); v.className = "viewer";
    v.innerHTML = `<img src="${src}" alt=""><button class="vx" aria-label="Chiudi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    document.body.appendChild(v);
    const img = $("img", v); if (small) img.onerror = () => { img.onerror = null; img.src = small; };   // foto originale più piccola di 1600px
    let s = 1, tx = 0, ty = 0, st = null, lastTap = 0;
    const apply = anim => { img.style.transition = anim ? "transform .25s cubic-bezier(.32, .72, 0, 1)" : "none"; img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
    const close = () => { if (v.classList.contains("out")) return; v.classList.add("out"); document.removeEventListener("keydown", key); setTimeout(() => v.remove(), 200); };
    const key = e => { if (e.key === "Escape") close(); };
    const mid = t => ({ x: (t[0].clientX + t[1].clientX) / 2 - innerWidth / 2, y: (t[0].clientY + t[1].clientY) / 2 - innerHeight / 2 });
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    v.addEventListener("touchstart", e => {
      const t = e.touches;
      if (t.length === 2) { const m = mid(t); st = { d: dist(t), s, lx: (m.x - tx) / s, ly: (m.y - ty) / s }; return; }
      if (t.length !== 1) return;
      const now = Date.now();
      if (now - lastTap < 280) {   // doppio tocco: ingrandisce dove tocchi, o torna normale
        if (s > 1) { s = 1; tx = ty = 0; } else { const x = t[0].clientX - innerWidth / 2, y = t[0].clientY - innerHeight / 2; s = 2.5; tx = -x * 1.5; ty = -y * 1.5; }
        apply(true); st = null; lastTap = 0; return;
      }
      lastTap = now; st = { x: t[0].clientX, y: t[0].clientY, tx, ty };
    }, { passive: true });
    v.addEventListener("touchmove", e => {
      e.preventDefault(); const t = e.touches; if (!st) return;
      if (t.length === 2 && st.d) { const m = mid(t); s = Math.min(5, Math.max(1, st.s * dist(t) / st.d)); tx = m.x - st.lx * s; ty = m.y - st.ly * s; apply(); return; }
      if (t.length === 1 && st.x != null) {
        const dx = t[0].clientX - st.x, dy = t[0].clientY - st.y;
        if (s > 1) { tx = st.tx + dx; ty = st.ty + dy; }
        else { tx = 0; ty = Math.max(0, dy); v.style.background = `rgba(0,0,0,${1 - Math.min(.7, ty / 300)})`; }
        apply();
      }
    }, { passive: false });
    v.addEventListener("touchend", e => {
      if (e.touches.length) { st = null; return; }
      if (s <= 1.02) { if (ty > 110) return close(); s = 1; tx = ty = 0; v.style.background = ""; apply(true); }
      st = null;
    });
    v.addEventListener("click", e => { if (e.target.closest(".vx") || (!("ontouchstart" in window) && e.target === v)) close(); });
    document.addEventListener("keydown", key);
  }
  document.addEventListener("click", e => { const c = e.target.closest(".cover[data-full]"); if (c && !e.target.closest("a")) openViewer(c.dataset.full, c.dataset.small); });

  // tieni premuto: menu Copia sul testo da leggere; niente menu/anteprima su pulsanti, link, foto e schede toccabili
  document.addEventListener("contextmenu", e => { if (e.target.closest("a, img, button, label, .tabs, .place, .tl li, .ph, .cover, .viewer") && !e.target.closest("input, textarea, .copiabile")) e.preventDefault(); });
  if (!maybeImport()) render();
  // logo d'avvio: resta un attimo (si deve vedere anche quando l'app si apre in un lampo), poi sfuma
  (() => { const b = $("#boot"); if (!b) return; setTimeout(() => { b.classList.add("out"); setTimeout(() => b.remove(), 450); }, Math.max(0, 700 - performance.now())); })();
  // la sincronizzazione (Firebase, ~525 KB) parte dopo la prima schermata: l'app compare subito con i dati del telefono
  (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => startSync(), { timeout: 800 });
  setTimeout(() => { if (navigator.onLine) OfflineMap.warmup?.().catch(() => {}); }, 5000);
  if (!me || (!code && window.FIREBASE && !LS.get("skipCode", false))) setTimeout(() => askWho(), 600);

  // aggiornamenti: quando arriva una nuova versione compare un avviso con "Aggiorna"
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(reg => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 30 * 60e3);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("message", e => { if (typeof e.data?.goto === "string") go(e.data.goto || "#oggi"); });   // tocco su una notifica
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || $("#upd")) return;
      const b = document.createElement("div"); b.id = "upd"; b.className = "upd";
      b.innerHTML = `${icon("Sparkles")}<span class="grow">Nuova versione disponibile</span><button class="btn small primary">Aggiorna</button>`;
      b.querySelector("button").onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
})();
