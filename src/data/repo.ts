import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, hasFirebase } from "../lib/firebase";

/** Every record: id, companyId, createdAt, updatedAt. Firebase when configured, otherwise a localStorage demo. */
export type Rec = { id: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
type Cb<T> = (rows: T[]) => void;

const key = (cid: string, col: string) => `tw.demo.${cid}.${col}`;
const bus = new EventTarget();
const readLocal = <T,>(cid: string, col: string): T[] => { try { return JSON.parse(localStorage.getItem(key(cid, col)) || "[]"); } catch { return []; } };

export function subscribe<T extends Rec>(cid: string, col: string, cb: Cb<T>): () => void {
  if (hasFirebase) {
    return onSnapshot(collection(db, "companies", cid, col), (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)));
  }
  const fire = () => cb(readLocal<T>(cid, col));
  const h = (ev: Event) => { if ((ev as CustomEvent).detail === key(cid, col)) fire(); };
  bus.addEventListener("change", h); fire();
  return () => bus.removeEventListener("change", h);
}

export async function saveRec<T extends Rec>(cid: string, col: string, rec: T): Promise<void> {
  if (hasFirebase) {
    const { id, ...data } = rec;
    const clean = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, "companies", cid, col, id), { ...clean, companyId: cid, createdAt: rec.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  const rows = readLocal<T>(cid, col), now = new Date().toISOString();
  const i = rows.findIndex((r) => r.id === rec.id);
  const next = { ...rec, companyId: cid, createdAt: rec.createdAt ?? now, updatedAt: now };
  if (i >= 0) rows[i] = next; else rows.push(next);
  localStorage.setItem(key(cid, col), JSON.stringify(rows));
  bus.dispatchEvent(new CustomEvent("change", { detail: key(cid, col) }));
}

export async function removeRec(cid: string, col: string, id: string): Promise<void> {
  if (hasFirebase) { await deleteDoc(doc(db, "companies", cid, col, id)); return; }
  localStorage.setItem(key(cid, col), JSON.stringify(readLocal<Rec>(cid, col).filter((r) => r.id !== id)));
  bus.dispatchEvent(new CustomEvent("change", { detail: key(cid, col) }));
}
