/** Avatar helpers (Avatar.tsx): the letters shown when there is no photo, and a steady color per person. */

export const AVATAR_TONES = ["blue", "purple", "green", "orange", "pink", "teal"] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/** "Ana María Ruiz" -> "AR", "carlos" -> "C", "sam.demo@x.com" -> "SD", "Ruiz (Kitchen)" -> "R". */
export function avatarInitials(name?: string | null): string {
  let s = String(name || "").trim();
  if (s.includes("@")) s = s.split("@")[0].replace(/[._\-+]+/g, " ");
  const words = s.replace(/\(.*?\)/g, " ").split(/\s+/).filter((w) => /\p{L}|\d/u.test(w.charAt(0)));
  if (!words.length) return "?";
  const first = [...words[0]][0], last = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + last).toUpperCase();
}

/** The same name always gets the same soft color. */
export function avatarTone(key?: string | null): AvatarTone {
  const s = String(key || "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** Which avatars a group shows and how many are left for the "+N" circle. */
export function groupSplit<T>(people: T[], max: number): { shown: T[]; more: number } {
  const n = Math.max(1, Math.floor(max));
  if (people.length <= n) return { shown: people, more: 0 };
  return { shown: people.slice(0, n - 1), more: people.length - (n - 1) };
}

/** Photos bigger than this are refused before shrinking (a phone photo is 2-8 MB). */
export const AVATAR_MAX_BYTES = 20 * 1024 * 1024;
/** Why a picked file can't be a profile photo, or null when it can. */
export function avatarFileProblem(f: { type: string; size: number }): "type" | "size" | null {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(f.type || "")) return "type";
  if (f.size > AVATAR_MAX_BYTES) return "size";
  return null;
}
/** Where a profile photo is stored (Storage). Workers: in the company; the signed-in person's own: under their user id. */
export const workerAvatarPath = (cid: string, workerId: string, file: string) => `companies/${cid}/avatars/${workerId}/${file}.jpg`;
export const userAvatarPath = (uid: string, file: string) => `users/${uid}/avatar/${file}.jpg`;

/**
 * The signed-in person's photo. A worker login shows the photo on their worker record (what the boss sees too);
 * owners / admins their own upload, else their Google photo unless they removed it ("none").
 */
export function myPhotoUrl(o: { isWorker: boolean; workerPhoto?: { url: string } | null; own?: { url: string } | "none" | null; google?: string }): string | undefined {
  if (o.isWorker) return o.workerPhoto?.url || undefined;
  if (o.own === "none") return undefined;
  return (o.own && o.own.url) || o.google || undefined;
}
