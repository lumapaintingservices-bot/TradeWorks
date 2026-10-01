import { useCallback, useEffect, useMemo, useState } from "react";
import { backend } from "../auth/backend";
import type { Invite, Member } from "../auth/types";
import { normEmail, workerAccess } from "../lib/roles";
import { useWorkers } from "./hooks";
import { sendInviteEmail } from "./inviteMail";

/**
 * A worker record was deleted or marked inactive: their login loses access to the company right away (members doc
 * removed) and any invitation still waiting for that record is cancelled. Returns how many logins lost access.
 */
export async function revokeWorkerAccess(companyId: string, workerId: string): Promise<number> {
  const [members, invites] = await Promise.all([backend.listMembers(companyId), backend.listInvites(companyId).catch(() => [])]);
  const { uids, emails } = workerAccess(members, invites, workerId);
  await Promise.all([...uids.map((uid) => backend.removeMember(companyId, uid)), ...emails.map((e) => backend.deleteInvite(e))]);
  return uids.length;
}

/** Active workers as {id, name}, sorted by name (Firestore returns documents by id, so order is fixed here). For assignee selects. */
export function useWorkerOptions(): { id: string; name: string }[] {
  const { rows } = useWorkers();
  return useMemo(
    () => rows.filter((w) => w.active !== false).map((w) => ({ id: w.id, name: w.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
}

/** Who can open the app (owners / admins): the company's logins and the invitations still waiting. reload() after a change. */
export function useTeamAccess(companyId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const reload = useCallback(async () => {
    if (!companyId) return;
    try {
      const [m, i] = await Promise.all([backend.listMembers(companyId), backend.listInvites(companyId).catch(() => [] as Invite[])]);
      setMembers(m); setInvites(i);
    } catch { /* not allowed or offline: no badges */ }
  }, [companyId]);
  useEffect(() => { reload(); }, [reload]);
  return { members, invites, reload };
}

export type InviteMail = "sent" | "demo" | "error";
/**
 * Invite a worker record to the app: the invitation (invites/{email}, linked to the record, like Settings > Team & access) and
 * the e-mail TradeWorks sends (src/data/inviteMail.ts). The invitation stands even when the e-mail cannot go out (note says why).
 */
export async function inviteWorker(o: { company: { id: string; name: string }; user: { uid: string; name?: string }; email: string; workerId: string; lang: "en" | "es" }): Promise<{ inv: Invite; mail: InviteMail; note?: string }> {
  const inv: Invite = { email: normEmail(o.email), companyId: o.company.id, companyName: o.company.name, role: "worker", workerId: o.workerId, invitedBy: o.user.uid, ...(o.user.name ? { invitedByName: o.user.name } : {}) };
  await backend.saveInvite(inv);
  try { return { inv, mail: await sendInviteEmail(inv.email, o.lang) }; }
  catch (e) { return { inv, mail: "error", note: String((e as Error).message || "") }; }
}
