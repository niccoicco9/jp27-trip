(() => {
  "use strict";

  // ——— storage (protetto: in privato o con dati bloccati può fallire) ———
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("jp27:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("jp27:" + k, JSON.stringify(v)); } catch {} },
  };

  const T = window.TRIP;
  const FOTO = window.FOTO || {};
  const byId = Object.fromEntries(LUOGHI.map(p => [p.id, p]));
  const zona = Object.fromEntries(ZONE.map(z => [z.id, z]));
  const zoneOrder = Object.fromEntries(ZONE.map((z, i) => [z.id, i]));
  const clone = o => JSON.parse(JSON.stringify(o));

  let plan = LS.get("plan", null) || clone(window.BOZZA || {});   // { "2027-02-20": { l, n, i: [...] } }
  let booked = new Set(LS.get("booked", []));
  let checks = new Set(LS.get("checks", []));
  let me = LS.get("me", "");
  let lastEdit = LS.get("lastEdit", null);   // { by, at }
  let sync = null, syncStatus = "off", pendingRemote = false;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view");

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
  const photoUrl = (id, w = 330) => FOTO[id]?.u?.replace(/\/\d+px-/, `/${w}px-`);
  const credit = id => FOTO[id] ? `https://${FOTO[id].h}.wikipedia.org/wiki/File:${encodeURIComponent(FOTO[id].f)}` : "";
  function photo(id, w, cls = "") {
    const u = photoUrl(id, w), p = byId[id];
    if (u) return `<div class="ph ${cls}" style="background-image:url('${u}')"></div>`;
    const [ic, col] = cat(p);
    return `<div class="ph none ${cls}" style="background:linear-gradient(135deg, ${zona[p.z].colore}, ${col})">${icon(ic)}</div>`;
  }

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
    $$('meta[name="theme-color"]').forEach(m => m.setAttribute("content", isDark() ? "#0e0d0c" : "#f5f1ea"));
    $("#theme").innerHTML = icon(theme === "dark" ? "Moon" : theme === "light" ? "Sun" : "SunMoon");
    $("#theme").title = "Tema: " + (theme === "dark" ? "scuro" : theme === "light" ? "chiaro" : "automatico");
    for (const e of Object.values(engines)) e.theme();
  }
  $("#theme").onclick = () => {
    theme = theme === "" ? (mq.matches ? "light" : "dark") : theme === "light" && !mq.matches ? "dark" : theme === "dark" && mq.matches ? "light" : "";
    LS.set("theme", theme); applyTheme(); rerender();
    toast("Tema " + (theme === "dark" ? "scuro" : theme === "light" ? "chiaro" : "automatico"));
  };
  mq.addEventListener?.("change", () => { if (!theme) { applyTheme(); rerender(); } });

  // ——— date ———
  const DAYS = [];
  for (let d = new Date(T.inizio + "T00:00:00Z"); d <= new Date(T.fine + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) DAYS.push(d.toISOString().slice(0, 10));
  const fmtDay = (iso, opts = { weekday: "long", day: "numeric", month: "long" }) => new Date(iso + "T00:00:00Z").toLocaleDateString("it-IT", { timeZone: "UTC", ...opts });
  const todayJP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
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
  const lists = { spese: LS.get("spese", []), prenotazioni: LS.get("prenotazioni", []) };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let code = LS.get("code", "");
  let pushT;
  // ultimo stato confermato dal server: si inviano solo le differenze rispetto a questo
  let synced = { plan: clone(plan), booked: [...booked] };
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
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
    k >= 0 ? (arr[k] = item) : arr.push(item);
    LS.set(name, arr); sync?.put(name, item);
    return item;
  }
  function delItem(name, id) {
    lists[name] = lists[name].filter(x => x.id !== id); LS.set(name, lists[name]); sync?.del(name, id);
  }
  function remoteChanged() {
    const a = document.activeElement;
    if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && sheet.hidden) rerender(); else pendingRemote = true;
  }
  function onRemote(data, first) {
    if (!data) { if (first) { sync.pushMain({ plan, booked: [...booked], by: me || "?" }); synced = { plan: clone(plan), booked: [...booked] }; } return; }
    // tiene le modifiche locali non ancora inviate, prende tutto il resto dal server
    const mine = localChanges();
    synced = { plan: clone(data.plan || {}), booked: [...(data.booked || [])] };
    plan = { ...clone(data.plan || {}), ...clone(mine.days) };
    booked = new Set([...(data.booked || []).filter(x => !mine.rem.includes(x)), ...mine.add]);
    if (Object.keys(mine.days).length || mine.add.length || mine.rem.length) { clearTimeout(pushT); pushT = setTimeout(pushChanges, 400); }
    lastEdit = { by: data.by, at: data.at?.toMillis?.() || Date.now() };
    LS.set("plan", plan); LS.set("booked", [...booked]); LS.set("lastEdit", lastEdit);
    remoteChanged();
  }
  function onList(name, items) {
    lists[name] = items; LS.set(name, items);
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
  function startSync() {
    if (!window.FIREBASE || !code || sync) return;
    import("./sync.js").then(m => { sync = m.start(window.FIREBASE, code, { main: onRemote, list: onList, status: setSync, recreate: () => sync.pushMain({ plan, booked: [...booked], by: me || "?" }) }); }).catch(err => setSync("error", err));
  }
  startSync();

  // ricerca tollerante: ignora accenti (ō → o), trattini, apostrofi e maiuscole; ogni parola deve comparire
  const fold = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-'’·.]/g, "");
  const matches = (text, q) => { const h = fold(text).replace(/\s+/g, ""); return fold(q).split(/\s+/).filter(Boolean).every(w => h.includes(w)); };

  // ——— link Google Maps ———
  const q = p => p.jp.replace(/（.*?）/g, "").trim() || p.n;
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

  // ——— ui helpers ———
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
  }
  const sheet = $("#sheet"), sheetCard = $(".sheet-card");
  let sheetOnClose = null;
  function openSheet(html, onMount, onClose) {
    $("#sheet-body").innerHTML = html; sheet.hidden = false; document.body.style.overflow = "hidden";
    sheetCard.scrollTop = 0; sheetCard.style.transform = "";
    sheetOnClose = onClose || null;
    onMount?.($("#sheet-body"));
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true; document.body.style.overflow = "";
    const f = sheetOnClose; sheetOnClose = null; f?.();
    if (pendingRemote) { pendingRemote = false; rerender(); }
  }
  document.addEventListener("focusout", () => setTimeout(() => {
    const a = document.activeElement;
    if (pendingRemote && sheet.hidden && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { pendingRemote = false; rerender(); }
  }, 300));
  sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); $("#big").hidden = true; } });
  // trascina giù per chiudere
  (() => {
    let y0 = null, dy = 0;
    const grab = $(".grab");
    grab.addEventListener("pointerdown", e => { y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); sheetCard.style.transition = "none"; });
    grab.addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheetCard.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 == null) return; y0 = null; sheetCard.style.transition = "transform .25s"; if (dy > 90) closeSheet(); sheetCard.style.transform = ""; };
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
  })();

  function showBig(jp, sub, speakIt) {
    const b = $("#big");
    b.innerHTML = `<div class="jp">${esc(jp)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}<div class="btns" style="width:100%;max-width:360px"><button class="btn" data-say>${icon("Volume2")} Ascolta</button><button class="btn primary">Chiudi</button></div>`;
    b.hidden = false;
    b.onclick = e => { if (e.target.closest("[data-say]")) return speak(jp); b.hidden = true; };
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
    if (p.eur && !opts.compact) m.push(`<span class="pill ghost">~${p.eur.toLocaleString("it-IT")} €</span>`);
    if (p.pren) m.push(booked.has(p.id) ? `<span class="pill ok">${icon("Check")} prenotato</span>` : `<span class="pill warn">${icon("Ticket")} da prenotare</span>`);
    if (p.chiuso) m.push(`<span class="pill ghost">chiuso ${esc(p.chiuso)}</span>`);
    const ds = dayOf(p.id);
    if (ds.length && !opts.noDays) m.push(`<span class="pill">${icon("CalendarDays")} ${ds.map(short).join(", ")}</span>`);
    if (p.out) m.push(`<span class="pill ghost">scartato</span>`);
    return m.join("");
  }
  function placeRow(p, opts = {}) {
    const [ic, col] = cat(p);
    return `<div class="place${p.out ? " out" : ""}" data-place="${p.id}">
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
      <div class="cover ph${photoUrl(id) ? "" : " none"}" style="${photoUrl(id) ? `background-image:url('${photoUrl(id, 960)}')` : `background:linear-gradient(135deg, ${zona[p.z].colore}, ${col})`}">${photoUrl(id) ? `<a class="credit" href="${credit(id)}" target="_blank" rel="noopener">Foto: Wikimedia Commons</a>` : icon(ic)}</div>
      <div class="row" style="gap:6px;margin-bottom:8px">${zonePill(p.z)}<span class="pill ghost" style="color:${col}">${icon(ic)} ${cname}</span></div>
      <h2>${esc(p.n)}</h2>
      <p class="jpname jp">${esc(p.jp)}</p>
      <p style="margin:0">${esc(p.d)}</p>
      ${p.note ? `<div class="note">${icon("Pencil")}<span>${esc(p.note)}</span></div>` : ""}
      <div class="btns">
        <a class="btn primary" href="${gmDir(p)}" target="_blank" rel="noopener">${icon("Navigation")} Portami qui</a>
        <a class="btn" href="${gmSearch(p)}" target="_blank" rel="noopener">${icon("MapPin")} Maps</a>
      </div>
      <div class="btns" style="margin-top:8px">
        <button class="btn" id="showjp">${icon("Languages")} In giapponese</button>
        <button class="btn" id="onmap">${icon("Map")} Sulla mappa</button>
      </div>
      <dl class="info">
        ${p.dur ? `<dt>Durata</dt><dd>${esc(p.dur)}</dd>` : ""}
        ${p.eur ? `<dt>Costo</dt><dd>~${p.eur.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € a persona <span class="muted">(stima Wanderlog)</span></dd>` : ""}
        ${p.chiuso ? `<dt>Chiuso</dt><dd>${esc(p.chiuso)}</dd>` : ""}
        ${p.pren ? `<dt>Biglietti</dt><dd><label class="check" style="border:none;padding:0"><input type="checkbox" id="bk" ${booked.has(id) ? "checked" : ""}><span>Da prenotare in anticipo: <b>${booked.has(id) ? "fatto ✓" : "segna quando è fatto"}</b></span></label></dd>` : ""}
        <dt>In programma</dt><dd>${ds.length ? ds.map(d => `<a href="#giorni/${d}">Giorno ${dayIndex(d) + 1} · ${fmtDay(d)}</a>`).join("<br>") : "<span class='muted'>non ancora</span>"}</dd>
      </dl>
      <h3>Aggiungi a un giorno</h3>
      <select id="addday"><option value="">Scegli il giorno…</option>${DAYS.map((d, i) => `<option value="${d}" ${plan[d]?.i?.includes(id) ? "disabled" : ""}>Giorno ${i + 1} · ${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}${plan[d]?.l ? " — " + esc(plan[d].l) : ""}</option>`).join("")}</select>
    `, el => {
      $("#bk", el)?.addEventListener("change", e => { e.target.checked ? booked.add(id) : booked.delete(id); savePlan(); openPlace(id); });
      $("#showjp", el).onclick = () => showBig(p.jp, `${esc(p.n)}<br><span class="jp" style="font-size:1.3rem;color:var(--ink)">ここに行きたいです</span><br><small>"Vorrei andare qui"</small>`);
      $("#onmap", el).onclick = () => { mapFocus = id; location.hash = "#mappa"; };
      $("#addday", el).onchange = e => {
        const d = e.target.value; if (!d) return;
        getDay(d).i.push(id); savePlan(); toast(`Aggiunto al giorno ${dayIndex(d) + 1}`); openPlace(id);
      };
    }, rerender);
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-place]");
    if (el && !e.target.closest("button, a, input, select, textarea")) openPlace(el.dataset.place);
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
    if (!code || after) return "";
    if (!before) return `<div class="section-h" style="margin-top:0"><h3>Oggi e stanotte</h3><a class="small" href="#utility/prenotazioni" style="font-weight:600">Tutte</a></div>${dayPren(today)}`;
    const next = [...lists.prenotazioni].filter(p => p.dal).sort((a, b) => a.dal.localeCompare(b.dal) || (a.ora || "").localeCompare(b.ora || "")).slice(0, 3);
    const covered = NIGHTS.filter(hotelFor).length;
    return `<a class="card mini-card" href="#utility/prenotazioni"><div class="between"><b>${icon("BedDouble")} Hotel prenotati</b><b>${covered}/${NIGHTS.length} notti</b></div>
      <div class="nights" style="margin-top:8px">${NIGHTS.map(d => `<i class="${hotelFor(d) ? "ok" : ""}"></i>`).join("")}</div>
      ${next.length ? `<div class="small muted" style="margin-top:8px">Prossime: ${next.map(p => `${esc(p.titolo)} (${short(p.dal)})`).join(" · ")}</div>` : `<div class="small muted" style="margin-top:8px">Aggiungi hotel, voli e biglietti →</div>`}</a>`;
  }
  function renderOggi() {
    const today = todayJP();
    const idx = dayIndex(today);
    const before = today < T.inizio, after = today > T.fine;
    const daysTo = Math.ceil((new Date(T.inizio + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 864e5);
    const toBook = LUOGHI.filter(p => p.pren && !p.out).sort((a, b) => (dayOf(b.id).length > 0) - (dayOf(a.id).length > 0) || zoneOrder[a.z] - zoneOrder[b.z]);
    const doneBook = toBook.filter(p => booked.has(p.id)).length;
    const hi = me ? `Ciao ${esc(me)}! ` : "";

    let hero;
    if (before || after) hero = `<div class="hero">${art()}<div class="hero-in">
        <span class="kicker">${before ? hi + (daysTo === 1 ? "Manca" : "Mancano") : "Okaeri!"}</span>
        ${before ? `<div class="big-n">${daysTo}</div><div class="title">${daysTo === 1 ? "giorno" : "giorni"} al Giappone</div>` : `<div class="title">Viaggio concluso.<br>Arigatō, Giappone!</div>`}
        <p>${fmtDay(T.inizio, { day: "numeric", month: "long" })} – ${fmtDay(T.fine, { day: "numeric", month: "long", year: "numeric" })} · Niccolò & Antonella · Miriam & Paolo</p>
      </div></div>`;
    else {
      const d = getDay(today), first = d.i[0] && byId[d.i[0]];
      hero = `<div class="hero">${first && photoUrl(first.id) ? `<div class="ph" style="background-image:url('${photoUrl(first.id, 960)}')"></div>` : art()}<div class="hero-in">
        <span class="kicker">${hi}Giorno ${idx + 1} di ${DAYS.length} · ${fmtDay(today, { weekday: "long", day: "numeric", month: "long" })}</span>
        <div class="title">${esc(d.l || "Oggi")}</div>
        ${first ? `<p>Prima tappa: <b>${esc(first.n)}</b></p>` : ""}
        <div class="btns"><a class="btn primary" href="#giorni/${today}">${icon("CalendarDays")} Programma</a>${first ? `<a class="btn" href="${gmDir(first)}" target="_blank" rel="noopener">${icon("Navigation")} Portami</a>` : ""}</div>
      </div></div>`;
    }

    const ch = chapters();
    view.innerHTML = `
      ${hero}
      <div class="quick">${QUICK.map(([k, ic, c, t]) => `<a class="qa" href="#utility/${k}"><span class="ic" style="background:${c}">${icon(ic)}</span>${t}</a>`).join("")}</div>
      ${oggiPren(today, before, after)}
      ${ch.length ? `<div><div class="section-h" style="margin-top:4px"><h3>Il viaggio in capitoli</h3><a class="small" href="#giorni" style="font-weight:600">Tutti i giorni</a></div>
      <div class="hscroll">${ch.map((c, k) => `<a class="chapter" href="#giorni/${DAYS[c.from]}" style="--c:${zona[c.z].colore}">${photoUrl(HERO_PLACE[c.z]) ? `<div class="ph" style="background-image:url('${photoUrl(HERO_PLACE[c.z], 330)}')"></div>` : `<div class="ph" style="background:${zona[c.z].colore}"></div>`}<span class="num">${k + 1}</span><b>${esc(zona[c.z].nome)}</b><small>${c.from === c.to ? `giorno ${c.from + 1}` : `giorni ${c.from + 1}–${c.to + 1}`} · ${short(DAYS[c.from])}</small></a>`).join("")}</div></div>` : ""}
      <div class="card"><div class="between"><h3 style="margin:0">Meteo adesso</h3><span class="muted small" id="wtime"></span></div><div class="weather" id="weather" style="margin-top:12px"><div>…</div></div></div>
      <div class="card">
        <div class="between"><h3 style="margin:0">${icon("Ticket")} Da prenotare</h3><b class="small">${doneBook}/${toBook.length}</b></div>
        <div class="progress" style="margin:10px 0 4px"><i style="width:${toBook.length ? doneBook / toBook.length * 100 : 0}%"></i></div>
        <p class="muted small" style="margin:6px 0 4px">Wanderlog consiglia di prenotarli in anticipo. In cima trovi quelli già in programma.</p>
        <div id="booklist">${toBook.map((p, k) => `<label class="check${booked.has(p.id) ? " done" : ""}"${k >= 6 ? " data-more hidden" : ""}><input type="checkbox" data-book="${p.id}" ${booked.has(p.id) ? "checked" : ""}><span class="grow">${esc(p.n)} <span class="muted small">· ${esc(zona[p.z].nome)}${dayOf(p.id).length ? " · " + dayOf(p.id).map(short).join(", ") : ""}</span></span></label>`).join("")}</div>
        ${toBook.length > 6 ? `<button class="btn small ghost" id="more" style="width:100%;margin-top:6px">Mostra tutti (${toBook.length})</button>` : ""}
      </div>
    `;
    $$("[data-book]").forEach(cb => cb.onchange = () => {
      cb.checked ? booked.add(cb.dataset.book) : booked.delete(cb.dataset.book);
      savePlan(); cb.closest(".check").classList.toggle("done", cb.checked);
      const n = toBook.filter(p => booked.has(p.id)).length;
      $(".card .progress i").style.width = n / toBook.length * 100 + "%";
      cb.closest(".card").querySelector(".between b").textContent = `${n}/${toBook.length}`;
    });
    $("#more")?.addEventListener("click", e => { $$("[data-more]").forEach(x => (x.hidden = false)); e.currentTarget.remove(); });
    bindPcards();
    loadWeather();
  }

  const CITTA_METEO = [["Tokyo", 35.68, 139.76], ["Kyoto", 35.01, 135.77], ["Osaka", 34.69, 135.50], ["Nara", 34.68, 135.83], ["Fuji", 35.50, 138.76], ["Kanazawa", 36.56, 136.66]];
  const WMO = c => c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "❄️" : c <= 82 ? "🌦️" : c <= 86 ? "🌨️" : "⛈️";
  async function loadWeather() {
    const paint = w => {
      const el = $("#weather"); if (!el || !w) return;
      el.innerHTML = w.list.map(([n, t, c]) => `<div>${n}<b>${WMO(c)} ${Math.round(t)}°</b></div>`).join("");
      $("#wtime").textContent = "agg. " + new Date(w.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    };
    const cached = LS.get("weather", null);
    paint(cached);
    if (cached && Date.now() - cached.at < 20 * 60e3) return;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${CITTA_METEO.map(c => c[1]).join(",")}&longitude=${CITTA_METEO.map(c => c[2]).join(",")}&current=temperature_2m,weather_code&timezone=Asia%2FTokyo`;
      const j = await (await fetch(u)).json();
      const arr = Array.isArray(j) ? j : [j];
      const w = { at: Date.now(), list: arr.map((x, i) => [CITTA_METEO[i][0], x.current.temperature_2m, x.current.weather_code]) };
      LS.set("weather", w); paint(w);
    } catch { if (!cached) { const el = $("#weather"); if (el) el.innerHTML = `<div style="grid-column:1/-1">Meteo non disponibile offline</div>`; } }
  }

  // ——— GIORNI ———
  let selDay = LS.get("selDay", null), editMode = false;
  function renderGiorni(sub) {
    const today = todayJP();
    if (sub && DAYS.includes(sub)) selDay = sub;
    if (!DAYS.includes(selDay)) selDay = DAYS.includes(today) ? today : DAYS[0];
    LS.set("selDay", selDay);
    const d = selDay, i = dayIndex(d), day = getDay(d);
    const first = day.i.map(id => byId[id]).find(p => p && photoUrl(p.id));
    const editedBy = lastEdit?.by && lastEdit.by !== "?" ? ` · ultima modifica di ${esc(lastEdit.by)}` : "";

    view.innerHTML = `
      <div class="daystrip" id="strip">${DAYS.map((x, k) => { const z = dayZone(x); return `<a class="dchip${x === d ? " on" : ""}${x === today ? " today" : ""}" href="#giorni/${x}" style="--c:${z ? zona[z].colore : "var(--line)"}" aria-label="Giorno ${k + 1}"><small>${fmtDay(x, { weekday: "short" }).replace(".", "")}</small><b>${fmtDay(x, { day: "numeric" })}</b><i></i></a>`; }).join("")}</div>
      <div class="daycover" id="cover">${first ? `<div class="ph" style="background-image:url('${photoUrl(first.id, 960)}')"></div>` : art()}
        <span class="dn">Giorno ${i + 1} / ${DAYS.length}</span>
        <div class="in"><div class="kicker">${fmtDay(d)}</div>${editMode ? `<input id="dlabel" value="${esc(day.l)}" placeholder="Dai un nome al giorno…" aria-label="Nome del giorno">` : `<div class="dtitle">${esc(day.l) || "Giorno libero"}</div>`}</div>
      </div>
      ${editMode ? `<textarea id="dnote" rows="2" placeholder="Nota del giorno (orari, treni, cose da ricordare)…" style="margin-bottom:14px">${esc(day.n || "")}</textarea>`
        : day.n ? `<div class="daynote">${icon("Sparkles")}<span>${esc(day.n)}</span></div>` : ""}
      ${dayPren(d)}
      <div class="btns" style="margin:0 0 6px">
        <button class="btn small" id="add">${icon("Plus")} Aggiungi</button>
        ${day.i.length ? `<a class="btn small" href="#mappa" id="dmap">${icon("Map")} Mappa</a>` : ""}
        ${day.i.length > 1 ? `<a class="btn small" href="${gmRoute(day.i)}" target="_blank" rel="noopener">${icon("Route")} Percorso</a>` : ""}
        <button class="btn small${editMode ? " dark" : ""}" id="edit">${icon(editMode ? "Check" : "Pencil")} ${editMode ? "Fatto" : "Modifica"}</button>
      </div>
      ${day.i.length ? `<ul class="tl">${day.i.map((id, k) => {
        const p = byId[id]; if (!p) return "";
        const next = byId[day.i[k + 1]];
        const right = editMode ? `<div class="edit"><button class="iconbtn" data-mv="${k}|-1" aria-label="Su" ${k === 0 ? "disabled" : ""}>${icon("ArrowUp")}</button><button class="iconbtn" data-mv="${k}|1" aria-label="Giù" ${k === day.i.length - 1 ? "disabled" : ""}>${icon("ArrowDown")}</button><button class="iconbtn danger" data-rm="${k}" aria-label="Rimuovi">${icon("Trash2")}</button></div>` : "";
        return `<li><span class="n" style="background:${zona[p.z].colore}">${k + 1}</span>${placeRow(p, { noDays: true, compact: true, noZone: true, right })}${next ? `<div class="hop">${hop(p, next)}</div>` : ""}</li>`;
      }).join("")}</ul>` : `<div class="empty" style="margin-top:14px">Nessuna tappa per questo giorno.<br><button class="btn small primary" id="add2" style="margin-top:10px">${icon("Plus")} Aggiungi tappe</button></div>`}
      <div class="btns" style="margin-top:20px">
        ${i > 0 ? `<a class="btn" href="#giorni/${DAYS[i - 1]}">‹ Giorno ${i}</a>` : ""}
        ${i < DAYS.length - 1 ? `<a class="btn" href="#giorni/${DAYS[i + 1]}">Giorno ${i + 2} ›</a>` : ""}
      </div>
      <div class="card" style="margin-top:22px">
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
    $$("[data-mv]").forEach(b => b.onclick = () => {
      const [k, dir] = b.dataset.mv.split("|").map(Number); const a = day.i;
      [a[k], a[k + dir]] = [a[k + dir], a[k]]; savePlan(); keepScroll(() => renderGiorni());
    });
    $$("[data-rm]").forEach(b => b.onclick = () => { day.i.splice(+b.dataset.rm, 1); savePlan(); keepScroll(() => renderGiorni()); });
    $("#share")?.addEventListener("click", sharePlan);
    $("#reset").onclick = () => openSheet(`<h2>Ripristinare la bozza?</h2><p>Il programma tornerà alla bozza proposta (arrivo a Tokyo, partenza da Osaka). Le modifiche fatte andranno perse${sync ? " per tutti e quattro" : ""}.</p><div class="btns"><button class="btn" data-close>Annulla</button><button class="btn primary" id="doreset">Ripristina</button></div>`, el => {
      $("#doreset", el).onclick = () => { plan = clone(window.BOZZA || {}); savePlan(); closeSheet(); toast("Bozza ripristinata"); render(); };
    });
    // swipe orizzontale sulla copertina per cambiare giorno
    let x0 = null;
    $("#cover").addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    $("#cover").addEventListener("touchend", e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) { const j = i + (dx < 0 ? 1 : -1); if (DAYS[j]) location.hash = "#giorni/" + DAYS[j]; }
    });
  }
  function keepScroll(fn) { const y = scrollY; fn(); scrollTo(0, y); }

  function openPicker(d) {
    let fz = dayZone(d) || "all", fq = "";
    const draw = el => {
      const list = LUOGHI.filter(p => !p.out && (fz === "all" || p.z === fz) && (!fq || matches(p.n + " " + p.jp + " " + p.d, fq)));
      $("#pk-list", el).innerHTML = list.map(p => {
        const inDay = plan[d]?.i?.includes(p.id);
        const other = dayOf(p.id).filter(x => x !== d);
        return placeRow(p, { noDays: true, compact: true, noZone: fz !== "all", right: `<span class="iconbtn" style="${inDay ? "background:var(--ok);color:#fff" : ""}">${icon(inDay ? "Check" : "Plus")}</span>` })
          .replace('class="place', `data-pick="${p.id}" class="place`).replace(/data-place="[^"]+"/, "")
          .replace('<div class="meta">', `<div class="meta">${other.length ? `<span class="pill">già il ${other.map(short).join(", ")}</span>` : ""}`);
      }).join("") || `<p class="empty">Nessun luogo trovato</p>`;
    };
    openSheet(`
      <h2>Giorno ${dayIndex(d) + 1}</h2><p class="lead" style="text-transform:capitalize">${fmtDay(d)} · tocca per aggiungere o togliere</p>
      <div class="searchbox">${icon("Search")}<input type="search" id="pk-q" placeholder="Cerca un luogo…" autocomplete="off"></div>
      <div class="chips" style="margin-top:10px">${[["all", "Tutte"], ...ZONE.map(z => [z.id, z.nome])].map(([id, n]) => `<button class="chip${id === fz ? " on" : ""}" data-pz="${id}">${id !== "all" ? `<span class="dot" style="background:${zona[id].colore}"></span>` : ""}${esc(n)}</button>`).join("")}</div>
      <div id="pk-list"></div>
      <div style="position:sticky;bottom:0;padding-top:10px;background:linear-gradient(transparent, var(--bg) 30%)"><button class="btn primary" data-close style="width:100%">Fatto</button></div>
    `, el => {
      draw(el);
      $("#pk-q", el).oninput = e => { fq = e.target.value.toLowerCase().trim(); draw(el); };
      $$("[data-pz]", el).forEach(c => c.onclick = () => { fz = c.dataset.pz; $$("[data-pz]", el).forEach(x => x.classList.toggle("on", x === c)); draw(el); });
      $("#pk-list", el).onclick = e => {
        const it = e.target.closest("[data-pick]"); if (!it) return;
        const day = getDay(d); const id = it.dataset.pick; const k = day.i.indexOf(id);
        k >= 0 ? day.i.splice(k, 1) : day.i.push(id); savePlan(); draw(el);
      };
    }, () => { if (location.hash.startsWith("#giorni")) keepScroll(() => renderGiorni()); });
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
    let data; try { data = JSON.parse(b64d(m[1])); } catch { toast("Link non valido"); location.hash = "#giorni"; return true; }
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
  let lf = { z: "all", q: "", out: false, pren: false };
  function renderLuoghi() {
    view.innerHTML = `
      <h2>Luoghi</h2><p class="lead">${LUOGHI.filter(p => !p.out).length} posti dalla vostra lista Wanderlog</p>
      <div class="searchbox">${icon("Search")}<input type="search" id="lq" placeholder="Cerca templi, quartieri, cibo…" value="${esc(lf.q)}" autocomplete="off"></div>
      <div class="chips" style="margin-top:12px">
        ${[["all", "Tutte"], ...ZONE.map(z => [z.id, z.nome])].map(([id, n]) => `<button class="chip${lf.z === id ? " on" : ""}" data-z="${id}">${id !== "all" ? `<span class="dot" style="background:${zona[id].colore}"></span>` : ""}${esc(n)}</button>`).join("")}
      </div>
      <div class="chips" style="padding-top:0">
        <button class="chip${lf.pren ? " on" : ""}" id="fpren">${icon("Ticket")} Da prenotare</button>
        <button class="chip${lf.out ? " on" : ""}" id="fout">Mostra scartati</button>
      </div>
      <div id="llist"></div>`;
    const draw = () => {
      const qq = lf.q.toLowerCase().trim();
      const list = LUOGHI.filter(p => (lf.out || !p.out) && (lf.z === "all" || p.z === lf.z) && (!lf.pren || p.pren) && (!qq || matches(p.n + " " + p.jp + " " + p.d + " " + (CAT[p.c]?.[2] || "") + " " + zona[p.z].nome, qq)))
        .sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || zoneOrder[a.z] - zoneOrder[b.z]);
      let last = null, html = "";
      for (const p of list) {
        const key = p.out ? "out" : p.z;
        if (key !== last && lf.z === "all") html += `<h3>${p.out ? "Scartati" : `<span class="dot" style="background:${zona[p.z].colore};margin-right:6px"></span>${esc(zona[p.z].nome)}`}</h3>`;
        last = key; html += placeRow(p, { noZone: lf.z !== "all" || true });
      }
      $("#llist").innerHTML = html || `<p class="empty">Nessun risultato</p>`;
    };
    draw();
    $("#lq").oninput = e => { lf.q = e.target.value; draw(); };
    $$("[data-z]").forEach(c => c.onclick = () => { lf.z = c.dataset.z; $$("[data-z]").forEach(x => x.classList.toggle("on", x === c)); draw(); });
    $("#fpren").onclick = e => { lf.pren = !lf.pren; e.currentTarget.classList.toggle("on", lf.pren); draw(); };
    $("#fout").onclick = e => { lf.out = !lf.out; e.currentTarget.classList.toggle("on", lf.out); draw(); };
  }

  // ——— MAPPA ———
  // Due motori con la stessa interfaccia: Google (online) e MapLibre (offline, zone scaricate).
  // In automatico si usa Google; senza rete, o se Google non si carica, si passa alla mappa offline.
  let mapFilter = { z: "all", d: "" }, mapFocus = null;
  let mapMode = LS.get("mapMode", "auto");          // "auto" | "offline"
  let mapsPromise, eng = null;                      // motore attivo
  const engines = {};                               // google / offline, creati una volta sola
  function loadMaps() {
    if (mapsPromise) return mapsPromise;
    mapsPromise = new Promise((res, rej) => {
      window.gm_authFailure = () => rej(new Error("auth"));
      window.__gmReady = () => res();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${T.mapsKey}&loading=async&callback=__gmReady&language=it&region=JP&v=weekly`;
      s.async = true; s.onerror = () => { mapsPromise = null; rej(new Error("net")); };
      document.head.appendChild(s);
      setTimeout(() => rej(new Error("timeout")), 12000);
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
    return `<div class="gm-iw">${photo(id, 330)}<div class="in"><b>${esc(p.n)}</b><div class="jp">${esc(p.jp)}</div><button data-iw="${id}">Dettagli e indicazioni</button></div></div>`;
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-iw]"); if (b) openPlace(b.dataset.iw); });
  const hotelsWithPos = () => lists.prenotazioni.filter(p => p.tipo === "hotel" && p.lat && p.lng);

  // ——— motore Google ———
  function googleEngine(el) {
    let map, iw, you, route; const mk = {}, hk = {};
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
        for (const p of LUOGHI) {
          if (p.out) continue;
          const m = new Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.n, icon: icon(pinUrl("p", p)) });
          m.addListener("click", () => { iw.setContent(iwHtml(p.id)); iw.open({ map, anchor: m }); });
          mk[p.id] = m;
        }
        route = new google.maps.Polyline({ map, strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#d4442f", scale: 3 }, offset: "0", repeat: "12px" }] });
      },
      show(vis, nums) {
        for (const [id, m] of Object.entries(mk)) { const n = nums[id] || 0; m.setVisible(vis.has(id)); m.setIcon(icon(pinUrl("p", byId[id], n), n)); m.setZIndex(n ? 100 - n : 1); }
        for (const h of hotelsWithPos()) {
          hk[h.id] ||= new google.maps.Marker({ map, title: h.titolo, icon: icon(pinUrl("hotel")) });
          hk[h.id].setPosition({ lat: h.lat, lng: h.lng });
        }
        iw?.close();
      },
      route(pts) { route.setPath(pts.map(([lng, lat]) => ({ lat, lng }))); },
      fit(pts) {
        if (!pts.length) return;
        if (pts.length === 1) { map.setCenter({ lat: pts[0][1], lng: pts[0][0] }); map.setZoom(14); return; }
        const b = new google.maps.LatLngBounds(); pts.forEach(([lng, lat]) => b.extend({ lat, lng }));
        map.fitBounds(b, { top: 170, bottom: mapPadBottom(), left: 40, right: 60 });
      },
      focus(id, popup) { const p = byId[id]; map.panTo({ lat: p.lat, lng: p.lng }); if (map.getZoom() < 14) map.setZoom(15); if (popup) { iw.setContent(iwHtml(id)); iw.open({ map, anchor: mk[id] }); } },
      you(ll) { you ||= new google.maps.Marker({ map, zIndex: 999, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#2e7bf6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } }); you.setPosition({ lat: ll[1], lng: ll[0] }); map.panTo({ lat: ll[1], lng: ll[0] }); map.setZoom(15); },
      theme() { map?.setOptions({ styles: isDark() ? MAP_DARK : MAP_LIGHT }); },
    };
  }

  // ——— motore offline (MapLibre) ———
  function offlineEngine(el) {
    let map, popup, you; const mk = {}, hk = {}; let routePts = [];
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
        await new Promise(r => map.once("load", r));
        popup = new maplibregl.Popup({ offset: 34, closeButton: false, maxWidth: "240px", className: "ml-pop" });
        for (const p of LUOGHI) {
          if (p.out) continue;
          const m = new maplibregl.Marker({ element: markerEl(pinUrl("p", p)), anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
          m.getElement().addEventListener("click", ev => { ev.stopPropagation(); popup.setLngLat([p.lng, p.lat]).setHTML(iwHtml(p.id)).addTo(map); });
          mk[p.id] = m;
        }
        map.on("style.load", addRoute);
        addRoute();
      },
      show(vis, nums) {
        for (const [id, m] of Object.entries(mk)) {
          const n = nums[id] || 0, e = m.getElement(), [w, h] = pinSize(n);
          e.style.display = vis.has(id) ? "" : "none"; e.src = pinUrl("p", byId[id], n); e.width = w; e.height = h; e.style.zIndex = n ? 100 - n : 1;
        }
        for (const h of hotelsWithPos()) { hk[h.id] ||= new maplibregl.Marker({ element: markerEl(pinUrl("hotel")), anchor: "bottom" }).addTo(map); hk[h.id].setLngLat([h.lng, h.lat]); }
        popup?.remove();
      },
      route(pts) { routePts = pts; if (map.isStyleLoaded()) addRoute(); },
      fit(pts) {
        if (!pts.length) return;
        map.resize();
        if (pts.length === 1) { map.jumpTo({ center: pts[0], zoom: 14 }); return; }
        const b = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        const h = el.clientHeight, w = el.clientWidth;
        const pad = h > 420 && w > 200 ? { top: 170, bottom: mapPadBottom(), left: 40, right: 60 } : 20;
        try { map.fitBounds(b, { padding: pad, duration: 0, maxZoom: 15 }); } catch { map.jumpTo({ center: b.getCenter(), zoom: 9 }); }
      },
      focus(id, pop) { const p = byId[id]; map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) }); if (pop) popup.setLngLat([p.lng, p.lat]).setHTML(iwHtml(id)).addTo(map); },
      you(ll) {
        if (!you) { const d = document.createElement("div"); d.className = "ml-you"; you = new maplibregl.Marker({ element: d }).addTo(map); }
        you.setLngLat(ll); map.easeTo({ center: ll, zoom: 15 });
      },
      theme() { if (map) OfflineMap.setTheme(map, isDark()); },
      resize() { map?.resize(); },
    };
  }

  const mapPadBottom = () => ($("#mcar") && !$("#mcar").hidden ? 230 : 130);
  async function useEngine(kind) {
    const slot = $("#mapslot"); if (!slot) return;
    if (!engines[kind]) {
      const el = document.createElement("div"); el.className = "mapel";
      const e = kind === "google" ? googleEngine(el) : offlineEngine(el);
      e.el = el; slot.appendChild(el);
      try { await e.init(); engines[kind] = e; } catch (err) { el.remove(); throw err; }
    }
    eng = engines[kind];
    $(".map-loading", slot)?.remove();
    for (const e of Object.values(engines)) { if (e.el.parentNode !== slot) slot.appendChild(e.el); e.el.hidden = e !== eng; }
    eng.resize?.();
    $("#mmode") && ($("#mmode").innerHTML = eng.kind === "offline" ? `${icon("CloudOff")} Offline` : `${icon("Map")} Google`);
    $("#mmode")?.classList.toggle("on", eng.kind === "offline");
    applyMapFilter(true);
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
      mapFallback(navigator.onLine ? "Non riesco a caricare la mappa." : "Sei offline e la mappa offline non è ancora stata scaricata. Quando hai il Wi-Fi: Mappa → ⬇ → scarica le zone.");
    }
  }
  addEventListener("offline", () => { if (location.hash.startsWith("#mappa") && eng?.kind === "google") pickEngine(); });

  function mapFallback(msg) {
    view.classList.remove("full");
    view.innerHTML = `<div class="card"><b>${icon("CloudOff")} Mappa non disponibile</b><p class="small">${msg}</p><p class="small muted" style="margin-bottom:0">Intanto ecco i luoghi: "Portami qui" apre l'app Google Maps.</p></div>
      ${LUOGHI.filter(p => !p.out && (mapFilter.d ? plan[mapFilter.d]?.i?.includes(p.id) : (mapFilter.z === "all" || p.z === mapFilter.z))).map(p => placeRow(p)).join("")}`;
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

  // ——— gestione mappe offline ———
  async function openOfflineMaps() {
    const st = await OfflineMap.status(), used = await OfflineMap.usedMB();
    const busy = {};
    const row = z => `<div class="card zrow" data-zone="${z.id}"><div class="row"><span class="pic" style="background:${z.base ? "#6b5a45" : "#1f9488"}">${icon(z.base ? "Map" : "Mountain")}</span>
      <div class="grow"><b>${esc(z.nome)}</b><div class="small muted">${z.mb.toLocaleString("it-IT")} MB${z.base ? " · si scarica con la prima zona" : ""}</div></div>
      ${st[z.id] ? `<span class="pill ok">${icon("Check")} offline</span><button class="iconbtn danger" data-zdel="${z.id}" aria-label="Elimina">${icon("Trash2")}</button>` : `<button class="btn small primary" data-zdl="${z.id}">${icon("Download")} Scarica</button>`}</div>
      <div class="progress" hidden style="margin-top:10px"><i style="width:0"></i></div></div>`;
    openSheet(`<div class="ttl"><span class="pic" style="background:#1f9488">${icon("CloudOff")}</span><h2>Mappe offline</h2></div>
      <p class="lead">Scaricale ora col Wi-Fi: in Giappone la mappa funzionerà anche senza rete, con la vostra posizione GPS. Per navigare con i treni serve comunque la rete (Google Maps).</p>
      ${OfflineMap.ZONE.some(z => !st[z.id]) ? `<button class="btn primary" id="zall" style="width:100%;margin-bottom:14px">${icon("Download")} Scarica tutte (${Math.round(OfflineMap.ZONE.filter(z => !st[z.id]).reduce((a, z) => a + z.mb, 0))} MB)</button>` : `<p class="small" style="color:var(--ok);margin-top:0">${icon("Check")} Tutte le zone sono disponibili offline</p>`}
      ${OfflineMap.ZONE.map(row).join("")}
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
          OfflineMap.reset(); toast("Tutte le mappe sono offline ✓"); openOfflineMaps();
        } catch { toast("Download interrotto: riprova col Wi-Fi"); openOfflineMaps(); }
      });
      $$("[data-zdel]", el).forEach(b => b.onclick = async () => {
        const z = OfflineMap.ZONE.find(x => x.id === b.dataset.zdel);
        if (!confirm(`Eliminare la mappa offline "${z.nome}" da questo telefono?`)) return;
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
    ...Object.entries(GUIDE).map(([k, g]) => [k, g.icon, g.col, g.titolo, { trasporti: "Suica, Shinkansen, JR Pass", galateo: "Cosa fare e non fare", soldi: "Contanti, ATM, tax free", stagione: "Clima ed eventi", pratico: "Prese, eSIM, farmaci", installa: "Aggiungila alla Home" }[k] || ""]),
  ];
  function renderUtility(sub) {
    const back = `<a class="back" href="#utility">${icon("ChevronLeft")} Utility</a>`;
    if (!sub) {
      view.innerHTML = `<h2>Utility</h2><p class="lead">Tutto quello che serve in viaggio, anche offline.</p>
        <div class="ugrid">${UTIL.map(([k, ic, c, t, s]) => `<a class="ucard" href="#utility/${k}"><span class="ic" style="background:${c}">${icon(ic)}</span><b>${t}</b>${s ? `<small>${s}</small>` : ""}</a>`).join("")}</div>
        <div class="card row" style="margin-top:16px"><div class="grow"><b>Accesso</b><div class="muted small">${me ? esc(me) : "Nome non scelto"} · ${code ? "dati condivisi attivi" : "codice del viaggio non inserito"}</div></div><button class="btn small${code ? "" : " primary"}" id="whoami">${icon(code ? "UserRound" : "KeyRound")} ${code ? "Cambia" : "Inserisci"}</button></div>`;
      $("#whoami").onclick = askWho;
      return;
    }
    const g = GUIDE[sub];
    if (g) { view.innerHTML = `${back}<h2>${g.titolo}</h2><div class="card prose" style="margin-top:12px">${g.html}</div>`; return; }
    if (sub === "frasi") return renderFrasi(back);
    if (sub === "yen") return renderYen(back);
    if (sub === "sos") {
      view.innerHTML = `${back}<h2>Emergenze</h2><p class="lead">Tocca per chiamare.</p>
        ${CONTATTI.map(c => `<a class="card contact" href="tel:${c.n.replace(/\s/g, "")}" style="text-decoration:none;color:inherit"><span class="ic">${icon("Phone")}</span><div class="grow"><b>${c.t}</b><div class="muted small">${c.d}</div></div><b style="color:var(--shu);white-space:nowrap">${c.n}</b></a>`).join("")}
        <div class="card"><h3 style="margin-top:0">Frasi rapide</h3>${FRASI.find(f => f.cat === "Emergenza").items.map(phraseRow).join("")}</div>
        <p class="muted small">Prima di partire registratevi su <a href="https://www.dovesiamonelmondo.it" target="_blank" rel="noopener">Dove siamo nel mondo</a> (Farnesina). Verificate i numeri prima del viaggio.</p>`;
      bindPhrases(); return;
    }
    if (sub === "budget") return renderBudget(back);
    if (sub === "prenotazioni") return renderPren(back);
    if (sub === "mappe") { renderUtility(); setTimeout(openOfflineMaps, 50); return; }
    if (sub === "spese") return renderSpese(back);
    if (sub === "checklist") return renderChecklist(back);
    location.hash = "#utility";
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
        <div class="qchips">${[100, 500, 1000, 3000, 5000, 10000, 30000].map(v => `<button class="chip" data-y="${v}">${v.toLocaleString("it-IT")} ¥</button>`).join("")}</div>
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
      <div class="hero" style="min-height:0">${art()}<div class="hero-in" style="min-height:170px"><span class="kicker">Luoghi attivi</span><div class="big-n" style="font-size:2.8rem">${eur(sum(act))}</div><p>In programma: <b>${eur(sum(act.filter(p => planned.has(p.id))))}</b> · Totale Wanderlog con gli scartati: ${eur(T.budgetWanderlog)}</p></div></div>
      <div class="card"><h3 style="margin-top:0">Per zona</h3>${perZ.map(([z, v]) => `<div style="margin-bottom:12px"><div class="row small"><span class="dot" style="background:${z.colore}"></span><span class="grow">${z.nome}</span><b>${eur(v)}</b></div><div class="bar"><i style="width:${v / max * 100}%;background:${z.colore}"></i></div></div>`).join("")}</div>
      <div class="card"><h3 style="margin-top:0">Dettaglio</h3><table class="budget">${act.sort((a, b) => b.eur - a.eur).map(p => `<tr data-place="${p.id}" style="cursor:pointer"><td>${esc(p.n)} <span class="muted small">· ${zona[p.z].nome}</span></td><td>${eur(p.eur)}</td></tr>`).join("")}</table>
      ${out.length ? `<h3>Scartati</h3><table class="budget">${out.map(p => `<tr class="muted"><td>${esc(p.n)}</td><td>${eur(p.eur)}</td></tr>`).join("")}</table>` : ""}</div>
      <p class="muted small">Le spese condivise tra le due coppie (chi ha pagato cosa) arriveranno nella prossima versione.</p>`;
  }

  function renderChecklist(back) {
    const total = CHECKLIST.reduce((s, [, it]) => s + it.length, 0);
    const head = () => `<div class="between small"><span class="muted">Salvata su questo telefono</span><b>${checks.size}/${total}</b></div><div class="progress" style="margin-top:8px"><i style="width:${checks.size / total * 100}%"></i></div>`;
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
  const NIGHTS = DAYS.slice(0, -1);   // l'ultimo giorno si parte
  const hotelFor = d => lists.prenotazioni.find(p => p.tipo === "hotel" && p.dal <= d && d < (p.al || p.dal));
  const bookingsOn = d => lists.prenotazioni.filter(p => p.dal === d && p.tipo !== "hotel").sort((a, b) => (a.ora || "99").localeCompare(b.ora || "99"));
  const nightsOf = p => Math.max(1, Math.round((new Date(p.al + "T00:00:00Z") - new Date(p.dal + "T00:00:00Z")) / 864e5));
  const addrQ = p => p.jp || p.indirizzo || p.titolo;
  const gmTo = s => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s)}&travelmode=transit`;
  const showTaxi = p => showBig(p.jp || p.indirizzo || p.titolo, `${esc(p.titolo)}<br><span class="jp" style="font-size:1.2rem;color:var(--ink)">ここに行ってください</span><br><small>"Mi porti qui, per favore"</small>`);
  const needCodeBox = what => `<div class="card"><b>${icon("KeyRound")} Serve il codice del viaggio</b><p class="small muted">${what} sono condivise tra voi quattro e protette dal codice.</p><button class="btn primary small" id="needcode">Inserisci il codice</button></div>`;

  function pcard(p) {
    const [ic, col, tn] = PTYPE[p.tipo] || PTYPE.altro;
    const when = p.tipo === "hotel"
      ? `${short(p.dal)} → ${short(p.al || p.dal)} · ${nightsOf(p)} ${nightsOf(p) === 1 ? "notte" : "notti"}${p.ora ? ` · check-in ${esc(p.ora)}` : ""}`
      : `${p.dal ? fmtDay(p.dal, { weekday: "short", day: "numeric", month: "short" }) : "data da definire"}${p.ora ? " · " + esc(p.ora) : ""}`;
    const route = p.da || p.a ? `<div class="small">${esc(p.da || "?")} → ${esc(p.a || "?")}</div>` : "";
    return `<div class="card pcard" data-pren="${p.id}">
      <div class="row"><span class="pic" style="background:${col}">${icon(ic)}</span>
        <div class="grow"><b>${esc(p.titolo || tn)}</b><div class="muted small">${when}</div>${route}${p.indirizzo ? `<div class="small muted">${esc(p.indirizzo)}</div>` : ""}</div></div>
      ${p.codice ? `<div class="small" style="margin-top:8px">${icon("KeyRound")} Codice: <b style="user-select:all">${esc(p.codice)}</b></div>` : ""}
      ${p.note ? `<div class="small muted" style="margin-top:4px">${esc(p.note)}</div>` : ""}
      <div class="btns" style="margin-top:10px">
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
    if (!code) { view.innerHTML = `${back}<h2>Prenotazioni</h2>${needCodeBox("Le prenotazioni")}`; bindPcards(); return; }
    const all = [...lists.prenotazioni].sort((a, b) => (a.dal || "9").localeCompare(b.dal || "9") || (a.ora || "").localeCompare(b.ora || ""));
    const covered = NIGHTS.filter(hotelFor).length;
    view.innerHTML = `${back}<h2>Prenotazioni</h2><p class="lead">Hotel, voli, treni e biglietti, condivisi tra voi quattro.</p>
      <div class="card">
        <div class="between"><b>${icon("BedDouble")} Notti con hotel</b><b>${covered}/${NIGHTS.length}</b></div>
        <div class="nights">${NIGHTS.map((d, i) => { const h = hotelFor(d); return `<i title="${short(d)}${h ? " · " + esc(h.titolo) : ""}" class="${h ? "ok" : ""}"></i>`; }).join("")}</div>
        ${covered < NIGHTS.length ? `<p class="small muted" style="margin:8px 0 0">Mancano: ${NIGHTS.filter(d => !hotelFor(d)).map(short).join(", ")}</p>` : `<p class="small" style="margin:8px 0 0;color:var(--ok)">Tutte le notti sono coperte ✓</p>`}
      </div>
      <div class="section-h" style="margin-top:6px"><h3>Aggiungi</h3></div>
      <div class="addgrid">${Object.entries(PTYPE).map(([k, [ic, col, tn]]) => `<button data-addp="${k}"><span class="pic" style="background:${col}">${icon(ic)}</span>${tn}</button>`).join("")}</div>
      ${all.length ? all.map(pcard).join("") : `<p class="empty">Ancora nessuna prenotazione. Comincia dagli hotel e dai voli.</p>`}`;
    $$("[data-addp]").forEach(b => b.onclick = () => editPren({ tipo: b.dataset.addp }));
    bindPcards();
  }

  function editPren(p) {
    const isNew = !p.id, t = p.tipo || "altro";
    const [ic, col, tn] = PTYPE[t];
    const dayOpts = sel => `<option value="">Scegli il giorno</option>` + DAYS.map(d => `<option value="${d}" ${d === sel ? "selected" : ""}>${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}</option>`).join("");
    const f = (id, label, val, attrs = "", ph = "") => `<label class="fl"><span>${label}</span><input id="${id}" value="${esc(val || "")}" ${attrs}${ph ? ` placeholder="${esc(ph)}"` : ""}></label>`;
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
      ${f("p-cod", "Codice di prenotazione", p.codice, 'autocomplete="off"', "es. ABC12345")}
      ${f("p-link", "Link (conferma, biglietto, app)", p.link, 'type="url" inputmode="url"', "https://…")}
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
        if (t === "hotel" && (item.jp !== p.jp || item.indirizzo !== p.indirizzo || item.titolo !== p.titolo || !p.lat)) geocodeHotel(saved);
        if (item.luogo && !booked.has(item.luogo)) { booked.add(item.luogo); savePlan(); }   // biglietto preso = "prenotato" spuntato
        closeSheet(); toast("Salvato ✓"); rerender();
      };
      $("#p-del", el)?.addEventListener("click", () => { if (confirm("Eliminare questa prenotazione per tutti?")) { delItem("prenotazioni", p.id); closeSheet(); rerender(); } });
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

  // ——— SPESE condivise tra le due coppie ———
  const COPPIE = [["Niccolò", "Antonella"], ["Miriam", "Paolo"]];
  const coupleName = c => c.join(" & ");
  const SCAT = { cibo: ["Utensils", "Cibo"], trasporti: ["TrainFront", "Trasporti"], alloggio: ["BedDouble", "Alloggio"], attivita: ["Ticket", "Attività"], shopping: ["ShoppingBag", "Shopping"], altro: ["Receipt", "Altro"], rimborso: ["HandCoins", "Rimborso"] };
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
    if (!code) { view.innerHTML = `${back}<h2>Spese</h2>${needCodeBox("Le spese")}`; bindPcards(); return; }
    const { net, total, cn } = balances();
    const debt = Math.abs(cn[0]) < .5 ? null : cn[0] > 0 ? [COPPIE[1], COPPIE[0], cn[0]] : [COPPIE[0], COPPIE[1], -cn[0]];
    const items = [...lists.spese].sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.ts || 0) - (a.ts || 0));
    let lastD = null;
    view.innerHTML = `${back}<h2>Spese</h2><p class="lead">Chi ha pagato cosa, e alla fine chi deve quanto a chi.</p>
      <div class="hero" style="min-height:0">${art()}<div class="hero-in" style="min-height:190px">
        <span class="kicker">Spesa totale del gruppo</span><div class="big-n" style="font-size:2.6rem">${eurF(total)}</div>
        <p>${debt ? `<b>${coupleName(debt[0])}</b> devono <b>${eurF(debt[2])}</b> a ${coupleName(debt[1])}` : "Siete in pari 🤝"}</p>
      </div></div>
      <div class="card"><div class="between"><h3 style="margin:0">Saldo per persona</h3>${debt ? `<button class="btn small" id="settle">${icon("HandCoins")} Segna rimborso</button>` : ""}</div>
        ${T.viaggiatori.map(n => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line)">${avatar(n)}<span class="grow">${n}</span><b style="color:${net[n] > .5 ? "var(--ok)" : net[n] < -.5 ? "var(--shu)" : "var(--muted)"}">${net[n] > 0 ? "+" : ""}${eurF(net[n])}</b></div>`).join("")}
        <p class="small muted" style="margin:8px 0 0">+ deve ricevere · − deve dare. Gli importi in yen sono convertiti al cambio del giorno in cui li inserite.</p>
      </div>
      <button class="btn primary" id="adds" style="width:100%;margin-bottom:14px">${icon("Plus")} Aggiungi spesa</button>
      ${items.length ? items.map(s => {
        const [ic, cl] = SCAT[s.cat] || SCAT.altro;
        const head = s.data !== lastD ? `<h3>${s.data ? fmtDay(s.data, { weekday: "long", day: "numeric", month: "long" }) : "Senza data"}</h3>` : ""; lastD = s.data;
        return `${head}<div class="card spesa" data-spesa="${s.id}"><div class="row">
          <span class="pic" style="background:${s.cat === "rimborso" ? "var(--ok)" : "#7b4fa0"}">${icon(ic)}</span>
          <div class="grow"><b>${esc(s.desc || cl)}</b><div class="small muted">${s.cat === "rimborso" ? `${esc(s.pagatoDa)} → ${esc(splitLabel(s.perChi))}` : `pagato da ${esc(s.pagatoDa)} · per ${esc(splitLabel(s.perChi))}`}</div></div>
          <div style="text-align:right"><b>${s.valuta === "JPY" ? Math.round(s.importo).toLocaleString("it-IT") + " ¥" : eurF(s.importo)}</b>${s.valuta === "JPY" ? `<div class="small muted">${eurF(s.eur)}</div>` : ""}</div>
        </div></div>`;
      }).join("") : `<p class="empty">Nessuna spesa ancora. La prima cena a Shinjuku? 🍜</p>`}`;
    $("#adds").onclick = () => editSpesa({});
    $("#settle")?.addEventListener("click", () => editSpesa({ cat: "rimborso", desc: "Rimborso", valuta: "EUR", importo: Math.round(debt[2] * 100) / 100, pagatoDa: me && debt[0].includes(me) ? me : debt[0][0], perChi: debt[1] }));
    $$("[data-spesa]").forEach(c => c.onclick = () => editSpesa(lists.spese.find(x => x.id === c.dataset.spesa)));
  }

  function editSpesa(s) {
    const isNew = !s.id, today = todayJP();
    let st = { valuta: s.valuta || "JPY", pagatoDa: s.pagatoDa || me || T.viaggiatori[0], perChi: s.perChi?.length ? [...s.perChi] : [...T.viaggiatori], cat: s.cat || "cibo" };
    const draw = el => {
      $$("[data-val]", el).forEach(b => b.classList.toggle("on", b.dataset.val === st.valuta));
      $$("[data-paid]", el).forEach(b => b.classList.toggle("sel", b.dataset.paid === st.pagatoDa));
      $$("[data-per]", el).forEach(b => b.classList.toggle("sel", st.perChi.includes(b.dataset.per)));
      $$("[data-grp]", el).forEach(b => { const g = b.dataset.grp === "all" ? T.viaggiatori : COPPIE[+b.dataset.grp]; b.classList.toggle("on", g.length === st.perChi.length && g.every(n => st.perChi.includes(n))); });
      $$("[data-cat]", el).forEach(b => b.classList.toggle("on", b.dataset.cat === st.cat));
      const imp = parseFloat($("#s-imp", el).value.replace(",", ".")) || 0;
      $("#s-conv", el).textContent = imp ? (st.valuta === "JPY" ? `≈ ${eurF(imp / rate())}` : `≈ ${Math.round(imp * rate()).toLocaleString("it-IT")} ¥`) + (st.perChi.length ? ` · ${eurF((st.valuta === "JPY" ? imp / rate() : imp) / st.perChi.length)} a testa` : "") : "";
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
      ${s.cat === "rimborso" ? "" : `<div class="fl"><span>Categoria</span><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">${Object.entries(SCAT).filter(([k]) => k !== "rimborso").map(([k, [ic, n]]) => `<button class="chip" data-cat="${k}">${icon(ic)} ${n}</button>`).join("")}</div></div>`}
      <label class="fl"><span>Giorno</span><input type="date" id="s-data" value="${s.data || (today >= T.inizio && today <= T.fine ? today : today)}"></label>
      <div class="btns">${isNew ? `<button class="btn" data-close>Annulla</button>` : `<button class="btn" id="s-del" style="color:var(--shu)">${icon("Trash2")} Elimina</button>`}<button class="btn primary" id="s-save">Salva</button></div>
    `, el => {
      draw(el);
      $("#s-imp", el).oninput = () => draw(el);
      $$("[data-val]", el).forEach(b => b.onclick = () => { st.valuta = b.dataset.val; draw(el); });
      $$("[data-paid]", el).forEach(b => b.onclick = () => { st.pagatoDa = b.dataset.paid; draw(el); });
      $$("[data-per]", el).forEach(b => b.onclick = () => { const n = b.dataset.per; st.perChi = st.perChi.includes(n) ? st.perChi.filter(x => x !== n) : [...st.perChi, n]; draw(el); });
      $$("[data-grp]", el).forEach(b => b.onclick = () => { st.perChi = [...(b.dataset.grp === "all" ? T.viaggiatori : COPPIE[+b.dataset.grp])]; draw(el); });
      $$("[data-cat]", el).forEach(b => b.onclick = () => { st.cat = b.dataset.cat; draw(el); });
      $("#s-save", el).onclick = () => {
        const importo = parseFloat($("#s-imp", el).value.replace(",", "."));
        if (!(importo > 0)) return toast("Inserisci l'importo");
        if (!st.perChi.length) return toast("Scegli tra chi dividere");
        const eur = st.valuta === "JPY" ? (s.valuta === "JPY" && s.importo === importo && s.eur ? s.eur : importo / rate()) : importo;
        putItem("spese", { ...s, ...st, desc: $("#s-desc", el).value.trim(), importo, eur: Math.round(eur * 100) / 100, data: $("#s-data", el).value, ts: s.ts || Date.now() });
        closeSheet(); toast("Spesa salvata ✓"); rerender();
      };
      $("#s-del", el)?.addEventListener("click", () => { if (confirm("Eliminare questa spesa per tutti?")) { delItem("spese", s.id); closeSheet(); rerender(); } });
    });
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
    $("#clocks").innerHTML = `🇯🇵 <b>${f("Asia/Tokyo")}</b><br>🇮🇹 ${f("Europe/Rome")}`;
  }
  tick(); setInterval(tick, 30e3);
  $("#sub").textContent = `${short(T.inizio)} – ${short(T.fine)} · ${DAYS.length} giorni`;

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
  function buzz() { try { haptic.click(); } catch {} navigator.vibrate?.(8); }

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
    function finish(go) {
      clearTimeout(drag.timer);
      const wasDrag = drag.on, a = wasDrag ? nearest(L.tx + tabW() / 2) : drag.tapA;
      drag.on = false; drag.pid = null;
      if (!go || !a) { L.tp = 0; syncInd(); return; }
      L.tx = a.offsetLeft;
      if (wasDrag) L.tp = 0;
      else { L.tp = .55; setTimeout(() => { L.tp = 0; kick(); }, 140); }   // tocco: piccolo "respiro" della goccia
      kick();
      // cambia pagina al frame successivo, così l'animazione parte senza scatti
      requestAnimationFrame(() => setTimeout(() => { location.hash = "#" + a.dataset.tab; }, 0));
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

  function render() {
    const [tab, sub] = (location.hash.slice(1) || "oggi").split("/");
    view.classList.remove("full");
    tabLinks().forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    syncInd(!L.raf && L.x === 0);
    ({ oggi: renderOggi, giorni: () => renderGiorni(sub), luoghi: renderLuoghi, mappa: renderMappa, utility: () => renderUtility(sub) }[tab] || renderOggi)();
  }
  function rerender() { const [tab] = (location.hash.slice(1) || "oggi").split("/"); if (tab !== "mappa") keepScroll(render); }
  function navigate() {
    closeSheet(); $("#big").hidden = true;
    if (maybeImport()) return;
    // prima si torna in cima, poi si disegna: niente salti; fade leggero solo sul contenuto
    if (!location.hash.startsWith("#mappa")) scrollTo(0, 0);
    render();
    view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
  }
  addEventListener("hashchange", navigate);

  applyTheme();
  // cambio ¥/€ aggiornato all'avvio (serve anche alle spese), al massimo ogni 12 ore
  (() => {
    const st = LS.get("rate", null);
    if (st?.d && Date.now() - new Date(st.d) < 12 * 3600e3) return;
    fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY").then(r => r.json()).then(j => { if (j?.rates?.JPY) LS.set("rate", { r: j.rates.JPY, d: j.date }); }).catch(() => {});
  })();
  if (!maybeImport()) render();
  if (!me || (!code && window.FIREBASE && !LS.get("skipCode", false))) setTimeout(() => askWho(), 600);

  // aggiornamenti: quando arriva una nuova versione compare un avviso con "Aggiorna"
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(reg => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 30 * 60e3);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || $("#upd")) return;
      const b = document.createElement("div"); b.id = "upd"; b.className = "upd";
      b.innerHTML = `${icon("Sparkles")}<span class="grow">Nuova versione disponibile</span><button class="btn small primary">Aggiorna</button>`;
      b.querySelector("button").onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
})();
