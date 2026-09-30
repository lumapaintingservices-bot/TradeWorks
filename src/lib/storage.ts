import { getDownloadURL, ref, uploadBytesResumable, uploadString, deleteObject, listAll, type StorageReference } from "firebase/storage";
import { hasFirebase, storage } from "./firebase";

/**
 * Stores an image (data URL) and returns what to keep on the record.
 * Firebase: uploads to Storage at `path` (e.g. companies/{cid}/receipts/{id}.jpg) and returns its download URL.
 * Demo mode: returns the data URL itself (kept in localStorage with the record).
 * `onProgress` (0..1) makes it a resumable upload that reports how far it got (the upload cards show "Uploading · 64%").
 */
export async function putImage(path: string, dataUrl: string, onProgress?: (f: number) => void): Promise<{ url: string; path: string }> {
  if (!hasFirebase) { onProgress?.(1); return { url: dataUrl, path }; }
  const r = ref(storage, path);
  if (!onProgress) await uploadString(r, dataUrl, "data_url");
  else {
    const { bytes, type } = dataUrlBytes(dataUrl);
    await new Promise<void>((resolve, reject) => {
      uploadBytesResumable(r, bytes, { contentType: type }).on("state_changed",
        (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve());
    });
  }
  return { url: await getDownloadURL(r), path };
}
function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; type: string } {
  const i = dataUrl.indexOf(","), head = dataUrl.slice(0, i), bin = atob(dataUrl.slice(i + 1));
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return { bytes, type: /^data:([^;,]+)/.exec(head)?.[1] || "image/jpeg" };
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
