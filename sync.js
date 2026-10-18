// Sincronizzazione condivisa via Firebase Firestore.
// Tutto vive sotto viaggi/{codice}: il codice segreto non è nel codice pubblico,
// e le regole di Firestore permettono l'accesso solo a quel percorso.
// - documento principale: programma dei giorni + prenotazioni spuntate (merge per campo)
// - sottoraccolte "spese" e "prenotazioni": un documento per voce, così più persone
//   possono aggiungere insieme senza sovrascriversi.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp,
  FieldPath, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const LISTS = ["spese", "prenotazioni"];

export function start(config, code, h) {
  const app = initializeApp(config);
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });
  const main = doc(db, "viaggi", code);
  const fail = err => h.status("error", err);
  let first = true;

  onSnapshot(main, { includeMetadataChanges: true }, snap => {
    h.status(snap.metadata.fromCache ? "offline" : "online");
    if (snap.metadata.hasPendingWrites) return;   // è una nostra modifica non ancora confermata
    h.main(snap.exists() ? snap.data() : null, first);
    first = false;
  }, fail);

  for (const name of LISTS) {
    onSnapshot(collection(main, name), snap => {
      h.list(name, snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, fail);
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

  return {
    patch,
    pushMain: data => setDoc(main, { ...data, at: serverTimestamp() }, { merge: true }).catch(fail),
    put: (name, { id, ...rest }) => setDoc(doc(main, name, id), { ...rest, at: serverTimestamp() }).catch(fail),
    del: (name, id) => deleteDoc(doc(main, name, id)).catch(fail),
  };
}
