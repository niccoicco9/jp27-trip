// Backup del viaggio: un file completo per il ripristino (JSON) e tabelle leggibili (Excel, si apre anche in Fogli Google).
// Nessuna libreria: lo usano l'app (Utility › Backup) e il servizio notturno che lo copia sul foglio Google.
export const KIND = "jp27-backup", V = 1;
// liste salvate una voce per documento; i documenti allegati (foto di biglietti e passaporti) restano fuori:
// nel backup c'è solo il loro elenco, le immagini sono troppo pesanti
export const LISTS = ["spese", "prenotazioni", "luoghi", "categorie", "allegati"];
export const RESTORE_LISTS = ["spese", "prenotazioni", "luoghi", "categorie"];

const SPESE = { cibo: "Cibo", trasporti: "Trasporti", alloggio: "Alloggio", attivita: "Attività", shopping: "Shopping", altro: "Altro", rimborso: "Rimborso" };
const PREN = { hotel: "Hotel", volo: "Volo", treno: "Treno", biglietto: "Biglietto", altro: "Altro" };

// orari del server (Timestamp di Firestore o testo ISO) → millisecondi, così il file è JSON puro
const plain = v => v == null || typeof v !== "object" ? v : typeof v.toMillis === "function" ? v.toMillis()
  : Array.isArray(v) ? v.map(plain) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));

export function snapshot({ plan, booked, lists, by = "", app = "" }) {
  return {
    kind: KIND, v: V, creato: new Date().toISOString(), da: by, app,
    plan: plain(plan || {}), booked: [...(booked || [])],
    lists: Object.fromEntries(LISTS.map(n => [n, plain(lists?.[n] || [])])),
  };
}
// controlla un file scelto per il ripristino: restituisce il backup o un messaggio d'errore
export function readBackup(text) {
  let b; try { b = JSON.parse(text); } catch { return { err: "Il file non è un backup del viaggio" }; }
  if (b?.kind !== KIND || typeof b.plan !== "object" || !b.lists || typeof b.lists !== "object") return { err: "Il file non è un backup del viaggio" };
  if (b.v > V) return { err: "Backup fatto con una versione più nuova dell'app: aggiorna prima l'app" };
  for (const n of LISTS) if (!Array.isArray(b.lists[n] ?? [])) return { err: "Backup rovinato: manca " + n };
  return { b };
}
export const counts = b => ({ giorni: Object.values(b.plan || {}).filter(d => d?.i?.length).length, tappe: Object.values(b.plan || {}).reduce((a, d) => a + (d?.i?.length || 0), 0),
  spese: (b.lists.spese || []).filter(s => !s.del).length, prenotazioni: (b.lists.prenotazioni || []).length, luoghi: (b.lists.luoghi || []).filter(x => !x.edit && !x.hide).length });

// ——— tabelle ———
// info: { days: ["2027-02-21", …], luoghi: { id: { n, z } }, zone: { id: nome }, catLuoghi: { k: nome } }
export function tables(b, info) {
  const zona = z => info.zone?.[z] || z || "", cat = {}, names = {};
  for (const [id, p] of Object.entries(info.luoghi || {})) names[id] = p;
  for (const c of b.lists.categorie || []) cat[c.id] = c.n;
  const L = b.lists.luoghi || [];
  for (const x of L) if (x.edit && names[x.edit] && x.n) names[x.edit] = { ...names[x.edit], n: x.n };
  for (const x of L) if (!x.edit && !x.hide && x.n) names[x.id] = { n: x.n, z: x.z };
  const day = d => ({ date: d });
  const days = [...new Set([...(info.days || []), ...Object.keys(b.plan || {})])].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  const prog = [["Giorno", "Data", "Titolo del giorno", "Ora", "Tappa", "Zona", "Fatta", "Nota del giorno"]];
  days.forEach((d, k) => {
    const g = b.plan[d] || {}, ids = g.i || [], n = (info.days || []).indexOf(d) + 1 || k + 1;
    if (!ids.length) { if (g.l || g.n) prog.push([n, day(d), g.l || "", "", "", "", "", g.n || ""]); return; }
    // ordine del giorno; se una tappa ha l'orario resta comunque al suo posto (come nell'app)
    ids.forEach((id, j) => prog.push([n, day(d), j ? "" : g.l || "", g.t?.[id] || "", names[id]?.n || id, zona(names[id]?.z), g.f?.includes(id) ? "sì" : "", j ? "" : g.n || ""]));
  });

  // spese: quelle che contano, quelle nel cestino (eliminate, con chi e quando) e la storia di ogni cambio
  const ora = t => t ? new Date(t).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const spCols = s => [s.data ? day(s.data) : "", s.desc || "", SPESE[s.cat] || cat[s.cat] || s.cat || "", +s.importo || 0, s.valuta || "", { eur: +s.eur || 0 }, s.pagatoDa || "", (s.perChi || []).join(", "), s.da || s.by || ""];
  const spHead = ["Data", "Descrizione", "Categoria", "Importo", "Valuta", "Euro", "Pagato da", "Per chi", "Inserita da"];
  const allSp = [...(b.lists.spese || [])].sort((a, c) => (a.data || "").localeCompare(c.data || "") || (a.ts || 0) - (c.ts || 0));
  const spese = [[...spHead, "Modificata"]];
  for (const s of allSp.filter(s => !s.del)) { const m = (s.storia || []).filter(x => x.a === "mod"); spese.push([...spCols(s), m.length ? `sì, ${m.length === 1 ? "1 volta" : m.length + " volte"} (ultima: ${m[m.length - 1].by})` : ""]); }
  const cestino = [[...spHead, "Eliminata da", "Eliminata il (ora italiana)"]];
  for (const s of allSp.filter(s => s.del).sort((a, c) => (c.del.t || 0) - (a.del.t || 0))) cestino.push([...spCols(s), (s.del.by || "") + (s.del.backup ? " (ripristino backup)" : ""), ora(s.del.t)]);
  const AZ = { mod: "modificata", del: "eliminata", rip: "ripristinata" };
  const ev = [];
  for (const s of allSp) {
    const nome = (s.desc || SPESE[s.cat] || cat[s.cat] || "Spesa") + (s.data ? ` (${s.data.split("-").reverse().join("/")})` : ""), imp = `${+s.importo || 0} ${s.valuta === "EUR" ? "€" : "¥"}`;
    const prima = k => (s.storia || []).flatMap(x => x.c || []).find(c => c.k === k)?.da;   // com'era quando è stata aggiunta
    if (s.ts) ev.push([s.ts, ora(s.ts), s.da || s.by || "", "aggiunta", nome, `${prima("Importo") || imp} · pagata da ${prima("Ha pagato") || s.pagatoDa || "?"}`]);
    for (const x of s.storia || []) ev.push([x.t || 0, ora(x.t), x.by || "", AZ[x.a] || x.a || "", nome, (x.c || []).map(c => `${c.k}: ${c.da} → ${c.a}`).join(" · ") || (x.a === "mod" ? "" : imp)]);
  }
  const storia = [["Quando (ora italiana)", "Chi", "Cosa", "Spesa", "Dettaglio"], ...ev.sort((a, c) => c[0] - a[0]).map(r => r.slice(1))];

  const pren = [["Tipo", "Titolo", "Dal", "Al", "Ora", "Arrivo", "Codice", "Link", "Note"]];
  for (const p of [...(b.lists.prenotazioni || [])].sort((a, c) => (a.dal || "9").localeCompare(c.dal || "9") || (a.ora || "").localeCompare(c.ora || "")))
    pren.push([PREN[p.tipo] || p.tipo || "", p.titolo || "", p.dal ? day(p.dal) : "", p.al ? day(p.al) : "", p.ora || "", p.oraA || "", p.codice || "", p.link || "", p.note || ""]);

  const luoghi = [["Cosa", "Nome", "Giapponese", "Zona", "Categoria", "Indirizzo", "Coordinate", "Descrizione", "Da"]];
  for (const x of L) {
    if (x.hide) luoghi.push(["eliminato da Wanderlog", names[x.hide]?.n || x.hide, "", zona(names[x.hide]?.z), "", "", "", "", x.by || ""]);
    else if (x.edit) luoghi.push(["modificato (Wanderlog)", names[x.edit]?.n || x.edit, x.jp ?? "", zona(names[x.edit]?.z), "", "", "", x.d ?? "", x.by || ""]);
    else luoghi.push(["aggiunto da voi", x.n || "", x.jp || "", zona(x.z), info.catLuoghi?.[x.c] || x.c || "", x.addr || "", x.lat != null ? `${x.lat}, ${x.lng}` : "", x.d || "", x.chi || x.by || ""]);
  }

  const pTit = Object.fromEntries((b.lists.prenotazioni || []).map(p => [p.id, p.titolo]));
  const docs = [["Documento", "Prenotazione", "Pagine"]];
  for (const a of b.lists.allegati || []) docs.push([a.nome || "Documento", pTit[a.pren] || "", +a.pagine || 0]);

  const c = counts(b), when = new Date(b.creato);
  const info0 = [["Backup del viaggio", ""], ["Creato il", when.toLocaleString("it-IT", { timeZone: "Europe/Rome" })], ["Da", b.da || ""], ["Versione app", b.app || ""],
    ["Giorni con tappe", c.giorni], ["Tappe", c.tappe], ["Spese", c.spese], ["Spese eliminate (nel cestino)", (b.lists.spese || []).length - c.spese], ["Prenotazioni", c.prenotazioni], ["Luoghi aggiunti", c.luoghi], ["", ""],
    ["Per ripristinare", "nell'app: Utility › Backup › Ripristina, scegliendo il file .json di questo backup"]];
  return [{ name: "Info", rows: info0 }, { name: "Programma", rows: prog }, { name: "Spese", rows: spese }, { name: "Spese eliminate", rows: cestino }, { name: "Storia spese", rows: storia }, { name: "Prenotazioni", rows: pren }, { name: "Luoghi", rows: luoghi }, { name: "Documenti", rows: docs }];
}

// ——— file Excel (.xlsx): un archivio zip di file XML, scritto a mano ———
const xe = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const colName = k => { let s = ""; for (k++; k; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + (k - 1) % 26) + s; return s; };
const serial = iso => { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
// stili: 1 intestazione in grassetto · 2 data gg/mm/aaaa · 3 euro con due decimali
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;€&quot;"/></numFmts>`
  + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>`
  + `<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function sheetXml(rows) {
  const w = [];
  const body = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, k) => {
    const ref = colName(k) + (i + 1), len = v?.date ? 10 : String(v?.eur ?? v ?? "").length;
    w[k] = Math.max(w[k] || 6, Math.min(60, len + 2));
    if (v === "" || v == null) return "";
    if (v.date) return `<c r="${ref}" s="2"><v>${serial(v.date)}</v></c>`;
    if (v.eur != null) return `<c r="${ref}" s="3"><v>${v.eur}</v></c>`;
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${i ? "" : ' s="1"'}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${i ? "" : ' s="1"'}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${w.map((x, k) => `<col min="${k + 1}" max="${k + 1}" width="${x}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData></worksheet>`;
}
export function xlsx(sheets) {
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
  ];
  return zip(files);
}

// zip senza compressione ("store"): basta per pochi KB di XML ed è lo stesso formato che Excel e Fogli Google leggono
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const te = new TextEncoder(), parts = [], dir = [];
  let off = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, text] of files) {
    const nm = te.encode(name), data = te.encode(text), crc = crc32(data);
    // versione 2.0 · flag 0x0800 = nomi in UTF-8 · metodo 0 (store) · ora/data fisse (1/1/2027)
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16((2027 - 1980) << 9 | 1 << 5 | 1), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    const head = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...common]);
    parts.push(head, nm, data);
    dir.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += head.length + nm.length + data.length;
  }
  const dirLen = dir.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(dirLen), ...u32(off), 0, 0]);
  const all = [...parts, ...dir, end], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
