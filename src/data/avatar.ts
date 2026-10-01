import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { myPhotoUrl, userAvatarPath, workerAvatarPath } from "../lib/avatar";
import { uid as newId } from "../lib/estimate";
import { db, hasFirebase } from "../lib/firebase";
import { squareImage } from "../lib/image";
import { deleteImage, putImage } from "../lib/storage";
import type { PhotoMini, Worker } from "../lib/types";
import { useWorkers } from "./hooks";
import { patchRec } from "./repo";

/**
 * Profile photos.
 *  - Workers: workers/{id}.photo, file in companies/{cid}/avatars/{workerId}/. The owner / admins change it in Team, the
 *    worker in Settings (rules: a worker may change only the photo of their own worker record).
 *  - Owners / admins themselves: users/{uid}.avatar ({ url, path } or "none" = hide the Google photo), file in
 *    users/{uid}/avatar/. Only they see it (their menu, Settings).
 * Demo mode keeps the photo as a data URL (localStorage).
 */
type Own = PhotoMini | "none" | null;
const DEMO_KEY = "tw.demo.avatars";
const bus = new EventTarget();
const demoRead = (): Record<string, Own> => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); } catch { return {}; } };

/** The signed-in person's own photo setting (owners / admins). */
export function useOwnAvatar(userId: string | undefined): Own {
  const [own, setOwn] = useState<Own>(null);
  useEffect(() => {
    if (!userId) { setOwn(null); return; }
    if (hasFirebase) {
      return onSnapshot(doc(db, "users", userId), (s) => {
        const a = s.get("avatar");
        setOwn(a === "none" ? "none" : a && typeof a.url === "string" ? { url: a.url, path: String(a.path || "") } : null);
      }, () => setOwn(null));
    }
    const fire = () => setOwn(demoRead()[userId] ?? null);
    fire(); bus.addEventListener("change", fire);
    return () => bus.removeEventListener("change", fire);
  }, [userId]);
  return own;
}

async function setOwn(userId: string, v: Own) {
  if (hasFirebase) { await setDoc(doc(db, "users", userId), { avatar: v }, { merge: true }); return; }
  localStorage.setItem(DEMO_KEY, JSON.stringify({ ...demoRead(), [userId]: v }));
  bus.dispatchEvent(new Event("change"));
}

/** Square-crops and uploads a picked photo. */
async function upload(path: string, file: File | string): Promise<PhotoMini> {
  const data = typeof file === "string" ? file : await squareImage(file);
  return putImage(path, data);
}

/** Saves a new photo on a worker record (owner, admin, or that worker) and deletes the old file. */
export async function setWorkerPhoto(cid: string, w: Pick<Worker, "id" | "photo">, file: File | string): Promise<PhotoMini> {
  const photo = await upload(workerAvatarPath(cid, w.id, newId("a")), file);
  await patchRec(cid, "workers", w.id, { photo });
  if (w.photo?.path && w.photo.path !== photo.path) deleteImage(w.photo.path);
  return photo;
}
export async function removeWorkerPhoto(cid: string, w: Pick<Worker, "id" | "photo">): Promise<void> {
  await patchRec(cid, "workers", w.id, { photo: null });
  deleteImage(w.photo?.path);
}

/**
 * The signed-in person's photo + change / remove. Workers change the photo on their worker record (the boss sees it);
 * owners / admins their own.
 */
export function useMyPhoto() {
  const { user, company, role, workerId } = useAuth();
  const own = useOwnAvatar(user?.uid);
  const { rows: workers } = useWorkers();
  const isWorker = role === "worker";
  const me = isWorker && workerId ? workers.find((w) => w.id === workerId) : undefined;
  const url = myPhotoUrl({ isWorker, workerPhoto: me?.photo, own, google: user?.photo });
  const canEdit = isWorker ? !!(me && company) : !!user;
  const change = async (file: File) => {
    if (!user) return;
    if (isWorker) { if (me && company) await setWorkerPhoto(company.id, me, file); return; }
    const photo = await upload(userAvatarPath(user.uid, newId("a")), file);
    await setOwn(user.uid, photo);
    if (own && own !== "none" && own.path !== photo.path) deleteImage(own.path);
  };
  const remove = async () => {
    if (!user) return;
    if (isWorker) { if (me && company) await removeWorkerPhoto(company.id, me); return; }
    await setOwn(user.uid, "none");
    if (own && own !== "none") deleteImage(own.path);
  };
  return { url, canEdit, change, remove, isWorker };
}
