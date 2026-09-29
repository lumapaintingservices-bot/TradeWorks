import { getDownloadURL, ref, uploadString, deleteObject } from "firebase/storage";
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
