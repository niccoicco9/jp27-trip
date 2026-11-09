// Sincronizzazione condivisa via Firebase Firestore.
// Tutto vive sotto viaggi/{codice}: il codice segreto non è nel codice pubblico,
// e le regole di Firestore permettono l'accesso solo a quel percorso.
// - documento principale: programma dei giorni + prenotazioni spuntate (merge per campo)
// - sottoraccolte "spese", "prenotazioni", "luoghi", "categorie" e "allegati": un documento per voce, così più persone
//   possono aggiungere insieme senza sovrascriversi.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp,
  FieldPath, arrayUnion, arrayRemove, deleteField, disableNetwork, enableNetwork, terminate, clearIndexedDbPersistence, getDoc, Bytes,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const LISTS = ["spese", "prenotazioni", "luoghi", "categorie", "allegati"];

// memory: true riparte senza la copia su disco (se l'IndexedDB di Safari si è rotto, capita su iOS)
export function start(config, code, h, { memory = false } = {}) {
  const app = initializeApp(config, memory ? "mem" + Date.now() : undefined);
  let db;
  try { db = initializeFirestore(app, memory ? {} : { localCache: persistentLocalCache() }); }
  catch { db = initializeFirestore(initializeApp(config, "mem" + Date.now()), {}); }
  const main = doc(db, "viaggi", code);
  const fail = err => h.status("error", err);
  let first = true;

  const unsubs = [];
  unsubs.push(onSnapshot(main, { includeMetadataChanges: true }, snap => {
    if (!(waking && snap.metadata.fromCache)) h.status(snap.metadata.fromCache ? "offline" : "online");   // niente pallino grigio mentre riapre la connessione
    if (snap.metadata.hasPendingWrites) return;   // è una nostra modifica non ancora confermata
    h.main(snap.exists() ? snap.data() : null, first);
    first = false;
  }, fail));

  // con includeMetadataChanges arriva anche il passaggio da copia locale a server; h.list solo quando cambiano i dati
  for (const name of LISTS) {
    let listed = false, fromServer = false;
    unsubs.push(onSnapshot(collection(main, name), { includeMetadataChanges: true }, snap => {
      if (!listed || snap.docChanges().length) { listed = true; h.list(name, snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
      // prima lettura dal server: all'app serve l'ora di ogni voce per la coda di riserva
      if (!snap.metadata.fromCache && !fromServer) {
        fromServer = true;
        h.server?.(name, new Map(snap.docs.map(d => [d.id, d.metadata.hasPendingWrites ? Infinity : d.get("at")?.toMillis?.() ?? 0])));
      }
    }, fail));
  }

  // Aggiorna solo quello che è cambiato, tappa per tappa (days: operazioni di app.js › dayOps) e spunta per spunta:
  // così due persone che modificano lo stesso giorno, anche offline, non si cancellano le tappe a vicenda.
  // Aggiungere e togliere dallo stesso campo non si può nella stessa scrittura: le rimozioni vanno in una seconda,
  // inviata subito dopo (Firestore le applica in ordine, anche se partono al ritorno della rete).
  function patch({ days, add, rem, by }) {
    const args = [new FieldPath("by"), by, new FieldPath("at"), serverTimestamp()], later = [];
    for (const [d, op] of Object.entries(days)) {
      for (const [k, v] of Object.entries(op.set)) args.push(new FieldPath("plan", d, k), v);
      for (const [k, v] of Object.entries(op.t)) args.push(new FieldPath("plan", d, "t", k), v ?? deleteField());
      for (const [k, v] of Object.entries(op.add)) args.push(new FieldPath("plan", d, k), arrayUnion(...v));
      for (const [k, v] of Object.entries(op.rem)) later.push(new FieldPath("plan", d, k), arrayRemove(...v));
    }
    if (add.length) args.push(new FieldPath("booked"), arrayUnion(...add));
    if (rem.length) later.push(new FieldPath("booked"), arrayRemove(...rem));
    const done = [updateDoc(main, ...args)];
    if (later.length) done.push(updateDoc(main, ...later));
    // true = confermata dal server (l'app sposta lì la base delle differenze), false = no
    return Promise.all(done).then(() => true, err => {
      if (err.code === "not-found") return h.recreate();   // documento non ancora creato: lo crea l'app
      if (!stopped) writeFail(err); return false;
    });
  }

  // iOS congela l'app quando va in background e chiude la connessione senza avvisare: al rientro
  // Firestore se ne accorgerebbe solo al proprio timeout (anche minuti), mostrando dati vecchi.
  // Riaprire subito la connessione fa arrivare le modifiche degli altri in un attimo: si scaricano
  // solo le differenze e le modifiche locali in coda partono appena è riaperta.
  let stopped = false;   // dopo stop/reset le scritture rimaste a metà falliscono: non è un errore della nuova connessione
  // scrittura rifiutata per i permessi: non vuol dire codice sbagliato (quello lo segnalano le letture, che con un
  // codice sbagliato falliscono tutte). Passarla all'app farebbe chiedere di nuovo il codice a ogni tentativo.
  const writeFail = e => { if (e?.code === "permission-denied") console.warn("Scrittura rifiutata:", e.message || e); else fail(e); };
  const outcome = e => { if (stopped) return false; writeFail(e); return e?.code === "invalid-argument" ? "drop" : false; };

  let waking = null;
  function wake() {
    if (waking || !navigator.onLine) return waking;
    return waking = disableNetwork(db).then(() => enableNetwork(db)).catch(() => {}).finally(() => { waking = null; });
  }

  return {
    patch,
    wake,
    // ripara: butta la copia locale di Firestore (non le modifiche già inviate) e si riparte dal server
    stop: () => { stopped = true; unsubs.forEach(u => u()); return terminate(db).catch(() => {}); },
    reset: () => { stopped = true; return terminate(db).then(() => clearIndexedDbPersistence(db)); },
    pushMain: data => setDoc(main, { ...data, at: serverTimestamp() }, { merge: true }).then(() => true, e => { if (!stopped) writeFail(e); return false; }),
    // per la coda di riserva dell'app: true = confermata dal server, "drop" = rifiutata per sempre (voce non valida:
    // ritentarla non serve), false = da ritentare (rete, permessi, database locale)
    // Promise.resolve().then: i dati non validi Firestore li rifiuta subito (eccezione), così finiscono in outcome
    put: (name, { id, ...rest }) => Promise.resolve().then(() => setDoc(doc(main, name, id), { ...rest, at: serverTimestamp() })).then(() => true, outcome),
    del: (name, id) => Promise.resolve().then(() => deleteDoc(doc(main, name, id))).then(() => true, outcome),
    // documenti allegati: ogni pagina (un'immagine JPEG) è un documento a sé, letto solo quando serve
    putPage: (id, k, bytes) => setDoc(doc(main, "allegati_pagine", `${id}_${k}`), { b: Bytes.fromUint8Array(bytes), at: serverTimestamp() }),
    getPage: (id, k) => getDoc(doc(main, "allegati_pagine", `${id}_${k}`)).then(s => s.exists() ? s.data().b.toUint8Array() : null),
    delPage: (id, k) => deleteDoc(doc(main, "allegati_pagine", `${id}_${k}`)).catch(() => {}),
  };
}
