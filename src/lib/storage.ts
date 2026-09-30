import { getDownloadURL, ref, uploadString, deleteObject, listAll, type StorageReference } from "firebase/storage";
import { hasFirebase, storage } from "./firebase";

/**
 * Stores an image (data URL) and returns what to keep on the record.
 * Firebase: uploads to Storage at `path` (e.g. companies/{cid}/receipts/{id}.jpg) and returns its download URL.
 * Demo mode: returns the data URL itself (kept in localStorage with the record).
 */
export async function putImage(path: string, dataUrl: string): Promise<{ url: string; path: string }> {
  if (!hasFirebase) return { url: dataUrl, path };
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return { url: await getDownloadURL(r), path };
}
export async function deleteImage(path?: string): Promise<void> {
  if (!hasFirebase || !path) return;
  try { await deleteObject(ref(storage, path)); } catch { /* already gone */ }
}

/** Deletes every file under one folder (e.g. companies/{cid}). Best effort: missing files or folders are ignored. */
export async function deleteFolder(path: string): Promise<void> {
  if (!hasFirebase) return;
  const walk = async (r: StorageReference): Promise<void> => {
    const l = await listAll(r);
    await Promise.all(l.items.map((i) => deleteObject(i).catch(() => {})));
    for (const p of l.prefixes) await walk(p);
  };
  try { await walk(ref(storage, path)); } catch { /* nothing there */ }
}
