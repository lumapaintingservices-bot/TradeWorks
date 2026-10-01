import { auth, hasFirebase } from "../lib/firebase";

export type InviteMailResult = "sent" | "demo";

/**
 * Asks the server (functions/api/invite/send.js) to e-mail an invitation, in the inviter's language. The server checks
 * who is asking. Demo mode has no server: nothing is sent ("demo"). Throws an Error whose message the card can show:
 * "not-setup" when e-mail is not configured yet, otherwise the server's own words.
 */
export async function sendInviteEmail(email: string, lang: "en" | "es"): Promise<InviteMailResult> {
  if (!hasFirebase) return "demo";
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/invite/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, lang }),
  });
  if (res.ok) return "sent";
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(res.status === 503 ? "not-setup" : data.error || `HTTP ${res.status}`);
}
