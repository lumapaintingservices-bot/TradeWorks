import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db, hasFirebase } from "../lib/firebase";
import { matchFilter } from "../lib/workerView";

/** Every record: id, companyId, createdAt, updatedAt. Firebase when configured, otherwise a localStorage demo. */
export type Rec = { id: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
type Cb<T> = (rows: T[]) => void;

const key = (cid: string, col: string) => `tw.demo.${cid}.${col}`;
const bus = new EventTarget();
const readLocal = <T,>(cid: string, col: string): T[] => { try { return JSON.parse(localStorage.getItem(key(cid, col)) || "[]"); } catch { return []; } };

/** Optional equality filter. Workers MUST use it: Firestore rules are not filters, so a whole-collection read is denied. */
/** where(field == value), or where(field array-contains value) (a worker's job chats: members contains their id). */
export type SubFilter = { field: string; value: string; op?: "array-contains" };
const reportErr = (what: string, err: unknown) => { console.error(`[TradeWorks] could not read ${what}:`, err); };

/**
 * Live rows of companies/{cid}/{col}. With `filter` it becomes where(field == value) (demo mode filters locally).
 * On a listener error (e.g. permission-denied) `cb([])` is called and the error is reported, so `loading` never sticks.
 */
export function subscribe<T extends Rec>(cid: string, col: string, cb: Cb<T>, filter?: SubFilter, onError?: (err: unknown) => void): () => void {
  if (hasFirebase) {
    const ref = collection(db, "companies", cid, col);
    return onSnapshot(filter ? query(ref, where(filter.field, filter.op || "==", filter.value)) : ref,
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
      (err) => { reportErr(`${col}`, err); onError?.(err); cb([]); });
  }
  const fire = () => cb(readLocal<T>(cid, col).filter((r) => matchFilter(r as unknown as Record<string, unknown>, filter)));
  const h = (ev: Event) => { if ((ev as CustomEvent).detail === key(cid, col)) fire(); };
  bus.addEventListener("change", h); fire();
  return () => bus.removeEventListener("change", h);
}

/** Live single document companies/{cid}/{col}/{id} (null when it does not exist or cannot be read). */
export function subscribeDoc<T extends Rec>(cid: string, col: string, id: string, cb: (row: T | null) => void, onError?: (err: unknown) => void): () => void {
  if (hasFirebase) {
    return onSnapshot(doc(db, "companies", cid, col, id),
      (s) => cb(s.exists() ? ({ ...s.data(), id: s.id } as T) : null),
      (err) => { reportErr(`${col}/${id}`, err); onError?.(err); cb(null); });
  }
  const fire = () => cb(readLocal<T>(cid, col).find((r) => r.id === id) ?? null);
  const h = (ev: Event) => { if ((ev as CustomEvent).detail === key(cid, col)) fire(); };
  bus.addEventListener("change", h); fire();
  return () => bus.removeEventListener("change", h);
}

export async function saveRec<T extends Rec>(cid: string, col: string, rec: T): Promise<void> {
  if (hasFirebase) {
    const { id, ...data } = rec;
    const clean = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, "companies", cid, col, id), { ...clean, companyId: cid, createdAt: rec.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() }); // full-document write so cleared fields really disappear
    return;
  }
  const rows = readLocal<T>(cid, col), now = new Date().toISOString();
  const i = rows.findIndex((r) => r.id === rec.id);
  const next = { ...rec, companyId: cid, createdAt: rec.createdAt ?? now, updatedAt: now };
  if (i >= 0) rows[i] = next; else rows.push(next);
  localStorage.setItem(key(cid, col), JSON.stringify(rows));
  bus.dispatchEvent(new CustomEvent("change", { detail: key(cid, col) }));
}

/**
 * Changes only some fields of an existing record (updateDoc), so a worker ticking a task does not overwrite the owner's
 * edits, and the rules see exactly `patch` + updatedAt as the changed keys.
 */
export async function patchRec(cid: string, col: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const clean = JSON.parse(JSON.stringify(patch));
  if (hasFirebase) { await updateDoc(doc(db, "companies", cid, col, id), { ...clean, updatedAt: serverTimestamp() }); return; }
  const rows = readLocal<Rec>(cid, col), i = rows.findIndex((r) => r.id === id);
  if (i < 0) throw new Error("not-found");
  rows[i] = { ...rows[i], ...clean, updatedAt: new Date().toISOString() };
  localStorage.setItem(key(cid, col), JSON.stringify(rows));
  bus.dispatchEvent(new CustomEvent("change", { detail: key(cid, col) }));
}

export async function removeRec(cid: string, col: string, id: string): Promise<void> {
  if (hasFirebase) { await deleteDoc(doc(db, "companies", cid, col, id)); return; }
  localStorage.setItem(key(cid, col), JSON.stringify(readLocal<Rec>(cid, col).filter((r) => r.id !== id)));
  bus.dispatchEvent(new CustomEvent("change", { detail: key(cid, col) }));
}

/* ---------- top-level collections (portal, leads, public) ----------
   These are readable by anyone with the id/token (see docs/06-security-rules.md), so they never hold owner-only data. */
import { getDoc, getDocs } from "firebase/firestore";

const topKey = (col: string, id: string) => `tw.demo.top.${col}.${id}`;
const topBus = new EventTarget();
const readTop = <T,>(col: string, id: string): T | null => { try { const v = localStorage.getItem(topKey(col, id)); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const topIndex = (col: string): string[] => { try { return JSON.parse(localStorage.getItem(`tw.demo.topidx.${col}`) || "[]"); } catch { return []; } };

export async function getTop<T>(col: string, id: string): Promise<T | null> {
  if (hasFirebase) { const s = await getDoc(doc(db, col, id)); return s.exists() ? ({ ...s.data(), id: s.id } as T) : null; }
  return readTop<T>(col, id);
}
/** Writes (or merges into) col/id. */
export async function setTop(col: string, id: string, data: Record<string, unknown>, merge = true): Promise<void> {
  const clean = JSON.parse(JSON.stringify(data));
  const stamp = !col.startsWith("leads"); // anonymous lead writes must match the rules' exact key list
  if (hasFirebase) { await setDoc(doc(db, col, id), stamp ? { ...clean, updatedAt: serverTimestamp() } : clean, { merge }); return; }
  const prev = merge ? readTop<Record<string, unknown>>(col, id) || {} : {};
  localStorage.setItem(topKey(col, id), JSON.stringify({ ...prev, ...clean, updatedAt: new Date().toISOString() }));
  const idx = topIndex(col); if (!idx.includes(id)) localStorage.setItem(`tw.demo.topidx.${col}`, JSON.stringify([...idx, id]));
  topBus.dispatchEvent(new CustomEvent("change", { detail: topKey(col, id) }));
  topBus.dispatchEvent(new CustomEvent("change", { detail: `col.${col}` }));
}
export async function updateTop(col: string, id: string, data: Record<string, unknown>): Promise<void> {
  if (hasFirebase) { await updateDoc(doc(db, col, id), { ...JSON.parse(JSON.stringify(data)), updatedAt: serverTimestamp() }); return; }
  await setTop(col, id, data, true);
}
export async function deleteTop(col: string, id: string): Promise<void> {
  if (hasFirebase) { await deleteDoc(doc(db, col, id)); return; }
  localStorage.removeItem(topKey(col, id));
  localStorage.setItem(`tw.demo.topidx.${col}`, JSON.stringify(topIndex(col).filter((x) => x !== id)));
  topBus.dispatchEvent(new CustomEvent("change", { detail: topKey(col, id) }));
  topBus.dispatchEvent(new CustomEvent("change", { detail: `col.${col}` }));
}
export function subscribeTop<T>(col: string, id: string, cb: (v: T | null) => void): () => void {
  if (hasFirebase) return onSnapshot(doc(db, col, id), (s) => cb(s.exists() ? ({ ...s.data(), id: s.id } as T) : null));
  const fire = () => cb(readTop<T>(col, id));
  const h = (ev: Event) => { if ((ev as CustomEvent).detail === topKey(col, id)) fire(); };
  const onStorage = (ev: StorageEvent) => { if (ev.key === topKey(col, id)) fire(); }; // another tab (e.g. the client link)
  topBus.addEventListener("change", h); window.addEventListener("storage", onStorage); fire();
  return () => { topBus.removeEventListener("change", h); window.removeEventListener("storage", onStorage); };
}
/** All docs of a top-level collection whose `owner` field is this company. */
export function subscribeOwned<T>(col: string, owner: string, cb: (rows: T[]) => void): () => void {
  if (hasFirebase) return onSnapshot(query(collection(db, col), where("owner", "==", owner)), (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }) as T)));
  const fire = () => cb(topIndex(col).map((id) => ({ ...readTop<Record<string, unknown>>(col, id), id }) as T).filter((r) => (r as { owner?: string }).owner === owner));
  const h = (ev: Event) => { if ((ev as CustomEvent).detail === `col.${col}`) fire(); };
  const onStorage = (ev: StorageEvent) => { if (ev.key?.startsWith(`tw.demo.top.${col}.`) || ev.key === `tw.demo.topidx.${col}`) fire(); };
  topBus.addEventListener("change", h); window.addEventListener("storage", onStorage); fire();
  return () => { topBus.removeEventListener("change", h); window.removeEventListener("storage", onStorage); };
}
export async function listOwned<T>(col: string, owner: string): Promise<T[]> {
  if (hasFirebase) { const s = await getDocs(query(collection(db, col), where("owner", "==", owner))); return s.docs.map((d) => ({ ...d.data(), id: d.id }) as T); }
  return topIndex(col).map((id) => ({ ...readTop<Record<string, unknown>>(col, id), id }) as T).filter((r) => (r as { owner?: string }).owner === owner);
}

/** Atomic nested edits for portal docs: `set` uses dot paths ("client.picks.up1"), `append` pushes onto an array (arrayUnion). */
export async function patchTop(col: string, id: string, ops: { set?: Record<string, unknown>; append?: Record<string, unknown> }): Promise<void> {
  if (hasFirebase) {
    const { arrayUnion } = await import("firebase/firestore");
    const data: Record<string, unknown> = {}; // portal rules let the client change only the `client` key, so no updatedAt here
    for (const [k, v] of Object.entries(ops.set || {})) data[k] = JSON.parse(JSON.stringify(v));
    for (const [k, v] of Object.entries(ops.append || {})) data[k] = arrayUnion(JSON.parse(JSON.stringify(v)));
    await updateDoc(doc(db, col, id), data);
    return;
  }
  const cur = readTop<Record<string, any>>(col, id) || {};
  const put = (path: string, fn: (prev: unknown) => unknown) => {
    const ks = path.split("."); let o = cur;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] && typeof o[ks[i]] === "object" ? o[ks[i]] : {};
    o[ks[ks.length - 1]] = fn(o[ks[ks.length - 1]]);
  };
  for (const [k, v] of Object.entries(ops.set || {})) put(k, () => JSON.parse(JSON.stringify(v)));
  for (const [k, v] of Object.entries(ops.append || {})) put(k, (p) => [...(Array.isArray(p) ? p : []), JSON.parse(JSON.stringify(v))]);
  await setTop(col, id, cur, false);
}
