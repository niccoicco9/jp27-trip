// Sincronizzazione condivisa via Firebase Firestore.
// Tutto vive sotto viaggi/{codice}: il codice segreto non è nel codice pubblico,
// e le regole di Firestore permettono l'accesso solo a quel percorso.
// - documento principale: programma dei giorni + prenotazioni spuntate (merge per campo)
// - sottoraccolte "spese", "prenotazioni" e "luoghi": un documento per voce, così più persone
//   possono aggiungere insieme senza sovrascriversi.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp,
  FieldPath, arrayUnion, arrayRemove, disableNetwork, enableNetwork, terminate, clearIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const LISTS = ["spese", "prenotazioni", "luoghi", "categorie"];

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

  for (const name of LISTS) {
    unsubs.push(onSnapshot(collection(main, name), snap => {
      h.list(name, snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, fail));
  }

  // Aggiorna solo i giorni cambiati e le singole spunte: così due persone che modificano
  // giorni diversi (anche offline) non si sovrascrivono a vicenda.
  async function patch({ days, add, rem, by }) {
    const args = [new FieldPath("by"), by, new FieldPath("at"), serverTimestamp()];
    for (const [d, v] of Object.entries(days)) args.push(new FieldPath("plan", d), v);
    if (add.length) args.push(new FieldPath("booked"), arrayUnion(...add));
    try {
      await updateDoc(main, ...args);
      if (rem.length) await updateDoc(main, new FieldPath("booked"), arrayRemove(...rem));
    } catch (err) {
      if (err.code === "not-found") return h.recreate();   // documento non ancora creato: lo crea l'app
      fail(err);
    }
  }

  // iOS congela l'app quando va in background e chiude la connessione senza avvisare: al rientro
  // Firestore se ne accorgerebbe solo al proprio timeout (anche minuti), mostrando dati vecchi.
  // Riaprire subito la connessione fa arrivare le modifiche degli altri in un attimo: si scaricano
  // solo le differenze e le modifiche locali in coda partono appena è riaperta.
  let waking = null;
  function wake() {
    if (waking || !navigator.onLine) return waking;
    return waking = disableNetwork(db).then(() => enableNetwork(db)).catch(() => {}).finally(() => { waking = null; });
  }

  return {
    patch,
    wake,
    // ripara: butta la copia locale di Firestore (non le modifiche già inviate) e si riparte dal server
    stop: () => { unsubs.forEach(u => u()); return terminate(db).catch(() => {}); },
    reset: () => terminate(db).then(() => clearIndexedDbPersistence(db)),
    pushMain: data => setDoc(main, { ...data, at: serverTimestamp() }, { merge: true }).catch(fail),
    put: (name, { id, ...rest }) => setDoc(doc(main, name, id), { ...rest, at: serverTimestamp() }).catch(fail),
    del: (name, id) => deleteDoc(doc(main, name, id)).catch(fail),
  };
}
