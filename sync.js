// Sincronizzazione condivisa del programma via Firebase Firestore.
// Caricato solo se window.FIREBASE è configurato in data.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, doc, onSnapshot, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function start(config, docId, onRemote, onStatus) {
  const app = initializeApp(config);
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });
  const ref = doc(db, "viaggi", docId);
  let first = true;

  onSnapshot(ref, { includeMetadataChanges: true }, snap => {
    onStatus(snap.metadata.fromCache ? "offline" : "online");
    if (snap.metadata.hasPendingWrites) return; // è una nostra modifica non ancora confermata
    const data = snap.exists() ? snap.data() : null;
    onRemote(data, first);
    first = false;
  }, err => onStatus("error", err));

  return { push: data => setDoc(ref, { ...data, at: serverTimestamp() }).catch(err => onStatus("error", err)) };
}
