import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { create } from "zustand";
import { useAuth } from "../auth/AuthProvider";
import { uid } from "../lib/estimate";
import { cleanText, lastOf, meKey, unreadCount } from "../lib/teamChat";
import type { ChatPhoto, TeamMsg } from "../lib/types";
import { useUi } from "../store/ui";
import { useJobChats, useWorkers } from "./hooks";
import { patchRec, saveRec, type Rec } from "./repo";

/* ---------- when I last read each chat: this device, per company and person (localStorage tw.chatSeen.{cid}.{me}) ---------- */
const seenKey = (cid: string) => "tw.chatSeen." + cid;
const readSeen = (cid: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(seenKey(cid)) || "{}") || {}; } catch { return {}; } };
const useSeenStore = create<{ byCompany: Record<string, Record<string, string>>; mark(cid: string, chatId: string, at: string): void }>((set, get) => ({
  byCompany: {},
  mark: (cid, chatId, at) => {
    const cur = get().byCompany[cid] || readSeen(cid);
    if (!at || (cur[chatId] && cur[chatId] >= at)) return;
    const next = { ...cur, [chatId]: at };
    try { localStorage.setItem(seenKey(cid), JSON.stringify(next)); } catch { /* private mode: only for this visit */ }
    set({ byCompany: { ...get().byCompany, [cid]: next } });
  },
}));
/** { chatId: last read time } for the current company, and a function to mark a chat read up to a time. */
export function useChatSeen() {
  const { company, role, user, workerId } = useAuth();
  const me = meKey(role, user?.uid, workerId);
  const cid = company?.id && me ? company.id + "." + me : ""; // a shared phone / computer: each person has their own
  const stored = useSeenStore((s) => s.byCompany[cid]);
  const mark = useSeenStore((s) => s.mark);
  const seen = useMemo(() => stored || (cid ? readSeen(cid) : {}), [stored, cid]);
  return { seen, markSeen: (chatId: string, at: string) => { if (cid) mark(cid, chatId, at); } };
}

/** Me in the chats: key ("u:uid" / "w:workerId") and the name shown on my messages. */
export function useChatMe() {
  const { user, role, workerId, company } = useAuth();
  const { rows: workers } = useWorkers(); // a worker reads only their own record
  const key = meKey(role, user?.uid, workerId);
  const name = (role === "worker" ? workers.find((w) => w.id === workerId)?.name : "") || user?.name || user?.email?.split("@")[0] || company?.name || "";
  return { key, name: name.slice(0, 80), isBoss: role === "owner" || role === "admin" };
}

/** Sends one message (text and / or a photo) and puts it on the chat as the latest (list preview, unread). */
export async function sendTeamMsg(cid: string, chatId: string, me: { key: string; name: string }, text: string, photo?: ChatPhoto, id = uid("m")): Promise<void> {
  const clean = cleanText(text);
  if ((!clean && !photo) || !me.key) return;
  const msg: TeamMsg = { id, by: me.key, name: me.name, text: clean, at: new Date().toISOString(), ...(photo ? { photo } : {}) };
  await saveRec(cid, `jobchats/${chatId}/msgs`, msg as TeamMsg & Rec);
  await patchRec(cid, "jobchats", chatId, { last: lastOf(msg) }).catch(() => { /* the message is saved; the preview catches up on the next one */ });
}

/**
 * Shell (owners and workers): how many chats have news for me (the "Chats" badge), and a toast when a message arrives
 * while I am somewhere else in the app.
 */
export function useChatInbox(): number {
  const { company } = useAuth();
  const me = useChatMe();
  const { rows: chats, loading } = useJobChats();
  const { seen } = useChatSeen();
  const toast = useUi((s) => s.toast);
  const loc = useLocation();
  const lastSeenAt = useRef<Record<string, string> | null>(null);
  useEffect(() => { lastSeenAt.current = null; }, [company?.id]);
  useEffect(() => {
    if (loading) return;
    const prev = lastSeenAt.current;
    const now: Record<string, string> = {};
    for (const c of chats) now[c.id] = c.last?.at || "";
    lastSeenAt.current = now;
    if (!prev) return; // first load: no toasts for old messages
    for (const c of chats) {
      const l = c.last;
      if (!l || l.by === me.key || !l.at || l.at <= (prev[c.id] || "")) continue;
      if (loc.pathname === "/chats/" + c.id) continue;
      toast("💬 " + l.name + " · " + c.jobLabel + ": " + (l.text || "📷").slice(0, 80));
    }
  }, [chats, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  return me.key ? unreadCount(chats, seen, me.key) : 0;
}
