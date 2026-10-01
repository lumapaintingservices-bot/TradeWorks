import { useMemo } from "react";
import { backend } from "../auth/backend";
import { workerAccess } from "../lib/roles";
import { useWorkers } from "./hooks";

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
