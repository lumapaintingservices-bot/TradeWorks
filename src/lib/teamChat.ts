/**
 * Job team chats: one group chat per job (companies/{cid}/jobchats/{estId}) with the owner / admins and the workers the
 * owner adds (members = worker ids). Messages in jobchats/{chatId}/msgs. Pure functions, no I/O.
 */
import type { ChatLast, JobChat, Task, TeamMsg } from "./types";

export const MSG_MAX = 2000;
export const PREVIEW_MAX = 140;

/** Who I am in a chat: "u:{uid}" for owners / admins, "w:{workerId}" for a worker ("" when a worker is not linked yet). */
export const meKey = (role: string | null | undefined, uid?: string | null, workerId?: string | null): string =>
  role === "worker" ? (workerId ? "w:" + workerId : "") : uid ? "u:" + uid : "";
export const isWorkerKey = (by: string) => by.startsWith("w:");

/** The text as it is sent: trimmed, Windows line ends fixed, at most MSG_MAX characters ("" = nothing to send). */
export const cleanText = (s: string): string => String(s || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MSG_MAX);
/** One line for the chat list. */
export const previewOf = (text: string): string => String(text || "").replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX);
export const lastOf = (m: Pick<TeamMsg, "by" | "name" | "text" | "at" | "photo">): ChatLast => ({ by: m.by, name: String(m.name || "").slice(0, 80), text: previewOf(m.text) || (m.photo ? "📷" : ""), at: m.at });
/** Where a chat photo is stored: a worker in their own folder (the only place they may upload), owners / admins per chat. */
export const chatPhotoPath = (cid: string, chatId: string, me: string, id: string) =>
  me.startsWith("w:") ? `companies/${cid}/jobphotos/${me.slice(2)}/${id}.jpg` : `companies/${cid}/chats/${chatId}/${id}.jpg`;

/** New for me: the latest message is someone else's and newer than when I last opened the chat. */
export function isUnread(chat: Pick<JobChat, "last">, seenAt: string | undefined, me: string): boolean {
  const l = chat.last;
  return !!l && !!l.at && l.by !== me && (!seenAt || l.at > seenAt);
}
export const unreadCount = (chats: Pick<JobChat, "id" | "last">[], seen: Record<string, string>, me: string) =>
  chats.filter((c) => isUnread(c, seen[c.id], me)).length;

/** Chat list order: open chats first, newest activity first. */
export function sortChats<T extends Pick<JobChat, "closed" | "last" | "jobLabel">>(chats: T[]): T[] {
  return chats.slice().sort((a, b) => Number(!!a.closed) - Number(!!b.closed)
    || String(b.last?.at || "").localeCompare(String(a.last?.at || "")) || String(a.jobLabel).localeCompare(String(b.jobLabel)));
}

/** Who to add when a job chat starts: the workers with tasks on that job. */
export function defaultMembers(tasks: Pick<Task, "estId" | "workerId">[], estId: string): string[] {
  const out: string[] = [];
  for (const k of tasks) if (k.estId === estId && k.workerId && !out.includes(k.workerId)) out.push(k.workerId);
  return out;
}

/** The local calendar day (YYYY-MM-DD) of an ISO time ("" when not a date). */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Messages oldest first, grouped by day (local date of `at`). */
export function msgDays<T extends Pick<TeamMsg, "at" | "id">>(msgs: T[]): { day: string; msgs: T[] }[] {
  const out: { day: string; msgs: T[] }[] = [];
  const sorted = msgs.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
  for (const m of sorted) {
    const day = localDay(m.at);
    const g = out[out.length - 1];
    if (g && g.day === day) g.msgs.push(m); else out.push({ day, msgs: [m] });
  }
  return out;
}
/** The newest message time (to mark the chat read). */
export const latestAt = (msgs: Pick<TeamMsg, "at">[]): string => msgs.reduce((a, m) => (String(m.at) > a ? String(m.at) : a), "");
