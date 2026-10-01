/**
 * Roles & permissions (pure logic, no React / Firebase). Used by the route guard, the nav, the Members card
 * and mirrored by firestore.rules (keep both in sync).
 *
 *   owner  : everything, incl. members, roles and billing.
 *   admin  : everything about the business (clients, estimates, money, team...). Sees the member list, may invite / remove
 *            WORKERS only; cannot touch owners or admins, cannot change roles, cannot delete the company.
 *   worker : Calendar (own tasks), Team (own hours / clock in-out / job photos), Timesheet (own hours, pay, payments),
 *            My jobs (the jobs they are on the crew of), Chats (the job chats they were added to) and Settings -> language & theme.
 *
 * The company creator (`company.ownerUid`, the "primary owner") can never be removed or demoted; that guarantees a company
 * always keeps at least one owner (firestore.rules enforce the same thing, they cannot count owners).
 */

export type Role = "owner" | "admin" | "worker";
export const ROLES: Role[] = ["owner", "admin", "worker"];
export const isRole = (v: unknown): v is Role => v === "owner" || v === "admin" || v === "worker";

/** Routes a worker may open (prefix match). Everything else redirects to homeFor("worker"). */
export const WORKER_ROUTES = ["/jobs", "/calendar", "/team", "/timesheet", "/chats", "/settings"];

/**
 * May this person start a NEW company? Only a TradeWorks platform admin (admins/{uid} in Firestore, set by hand in the
 * console; rules check the same doc). Everyone else gets into a company by invitation only. Demo mode: everybody.
 */
export const canCreateCompany = (isPlatformAdmin: boolean): boolean => isPlatformAdmin;

export type OnboardingView = "join" | "wizard" | "home" | "no-access";
/**
 * What /onboarding shows: the "You were invited" prompt, the company wizard (a platform admin creating a company, or
 * anyone finishing the setup of the company they are already in), their home, or "you need an invitation".
 */
export function onboardingView(o: { invite: boolean; skipInvite: boolean; hasCompany: boolean; companies: number; creating: boolean; isPlatformAdmin: boolean; role: Role | null }): OnboardingView {
  if (o.invite && !o.hasCompany && !o.creating && !o.skipInvite) return "join";
  if (o.role === "worker" && o.companies > 0) return "home"; // a worker never sets up a company
  if (o.hasCompany && !o.creating) return "wizard";        // finishing the setup of the company they are in
  if (o.isPlatformAdmin) return "wizard";                   // creating a new company
  return o.companies > 0 ? "home" : "no-access";
}

export const homeFor = (role: Role | null | undefined): string => (role === "worker" ? "/jobs" : "/");

const norm = (p: string) => { const q = (p.split(/[?#]/)[0] || "/").replace(/\/+$/, ""); return q === "" ? "/" : q; };

/** May this role open this route? Unknown / missing role can open nothing. */
export function canAccess(role: Role | null | undefined, path: string): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role !== "worker") return false;
  const p = norm(path);
  return WORKER_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

/** Where to send someone who opened a route they may not see. null = stay. */
export const redirectFor = (role: Role | null | undefined, path: string): string | null =>
  canAccess(role, path) ? null : homeFor(role);

export type Action = "data.all" | "members.view" | "members.manage" | "billing" | "company.edit" | "settings.business" | "settings.prefs";

const ACTIONS: Record<Action, Role[]> = {
  "data.all": ["owner", "admin"],          // clients, estimates, invoices, expenses, reports...
  "members.view": ["owner", "admin"],      // the Members card
  "members.manage": ["owner"],             // roles of admins / owners, inviting admins (admins: workers only, see canInviteRole)
  billing: ["owner"],
  "company.edit": ["owner", "admin"],
  "settings.business": ["owner", "admin"], // everything in Settings except language / theme
  "settings.prefs": ["owner", "admin", "worker"],
};
export const can = (role: Role | null | undefined, action: Action): boolean => !!role && ACTIONS[action].includes(role);

/** Nav items a role sees (by route). */
export const navFilter = <T extends { to: string }>(role: Role | null | undefined, items: T[]): T[] => items.filter((i) => canAccess(role, i.to));

/* ---------- invites ---------- */
export type InviteLite = { companyId: string; role: string; email?: string };

export const normEmail = (e: string | null | undefined): string => (e || "").trim().toLowerCase();
export const isEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/**
 * Which roles may this actor invite? Owners and admins invite WORKERS to their company; owners and admins are invited
 * only by the TradeWorks platform admin (owner rule 2026-10-01), who is the owner of the companies they set up.
 */
export const canInviteRole = (actor: Role | null | undefined, invited: Role, isPlatformAdmin = false): boolean =>
  invited === "worker" ? actor === "owner" || actor === "admin" : actor === "owner" && isPlatformAdmin;

export type InviteDecision =
  | { kind: "none" }                 // no invite for this user
  | { kind: "invalid" }              // malformed invite doc (ignored)
  | { kind: "already-member" }       // already in that company: just clear the invite
  | { kind: "needs-verify" }         // the e-mail must be verified before joining (someone else could have typed it)
  | { kind: "accept" };              // show the "You were invited to X - Join" banner

/**
 * What to do with `invites/{emailLower}` when a signed-in user is found.
 * `docEmail` is the invite's document id; it must equal the user's e-mail (case-insensitive) or the invite is not theirs.
 */
export function decideInvite(a: { invite: InviteLite | null; docEmail: string; userEmail: string; emailVerified: boolean; memberOf: string[] }): InviteDecision {
  const { invite } = a;
  if (!invite) return { kind: "none" };
  if (!normEmail(a.userEmail) || normEmail(a.docEmail) !== normEmail(a.userEmail)) return { kind: "none" };
  if (!invite.companyId || !isRole(invite.role)) return { kind: "invalid" };
  if (a.memberOf.includes(invite.companyId)) return { kind: "already-member" };
  if (!a.emailVerified) return { kind: "needs-verify" };
  return { kind: "accept" };
}

/**
 * Who loses access when a worker record is deleted or marked inactive: the WORKER logins linked to it (never an owner /
 * admin) and the worker invitations still waiting for it.
 */
export function workerAccess(members: { uid: string; role: string; workerId?: string }[], invites: { email: string; role: string; workerId?: string }[], workerId: string): { uids: string[]; emails: string[] } {
  if (!workerId) return { uids: [], emails: [] };
  return {
    uids: members.filter((m) => m.role === "worker" && m.workerId === workerId).map((m) => m.uid),
    emails: invites.filter((i) => i.role === "worker" && i.workerId === workerId).map((i) => i.email),
  };
}

/* ---------- role-change rules ---------- */
export type MemberLite = { uid: string; role: Role };
export type Denial = "not-allowed" | "primary-owner" | "last-owner" | "admin-workers-only" | "same-role" | "not-a-member" | "platform-only";
export type Verdict = { ok: true } | { ok: false; reason: Denial };
const ok: Verdict = { ok: true };
const no = (reason: Denial): Verdict => ({ ok: false, reason });
const ownerCount = (ms: MemberLite[]) => ms.filter((m) => m.role === "owner").length;

type Ctx = { actor: MemberLite; members: MemberLite[]; primaryOwnerUid?: string; isPlatformAdmin?: boolean };

/**
 * May `actor` set `targetUid`'s role to `newRole`?
 *  - the company creator (primary owner) and the last owner can never be demoted
 *  - owners can change anyone else; admins may not change roles at all (workers only stay workers: "same-role" no-op)
 *  - making someone an owner or admin: only the TradeWorks platform admin (owners can only make people workers)
 *  - workers can change nothing
 */
export function canChangeRole(c: Ctx & { targetUid: string; newRole: Role }): Verdict {
  const target = c.members.find((m) => m.uid === c.targetUid);
  if (!target) return no("not-a-member");
  if (c.actor.role !== "owner") return no(c.actor.role === "admin" ? "admin-workers-only" : "not-allowed");
  if (target.role === c.newRole) return no("same-role");
  if (target.role === "owner" && c.newRole !== "owner") {
    if (c.primaryOwnerUid && target.uid === c.primaryOwnerUid) return no("primary-owner");
    if (ownerCount(c.members) <= 1) return no("last-owner");
  }
  if (c.newRole !== "worker" && !c.isPlatformAdmin) return no("platform-only");
  return ok;
}

/** May `actor` remove `targetUid` from the company? A member may always leave, except the primary / last owner. */
export function canRemoveMember(c: Ctx & { targetUid: string }): Verdict {
  const target = c.members.find((m) => m.uid === c.targetUid);
  if (!target) return no("not-a-member");
  const self = c.actor.uid === target.uid;
  if (target.role === "owner") {
    if (c.primaryOwnerUid && target.uid === c.primaryOwnerUid) return no("primary-owner");
    if (ownerCount(c.members) <= 1) return no("last-owner");
  }
  if (self) return ok;
  if (c.actor.role === "owner") return ok;
  if (c.actor.role === "admin") return target.role === "worker" ? ok : no("admin-workers-only");
  return no("not-allowed");
}

/** May `actor` change which worker record a WORKER member is linked to? Owners and admins, workers only. */
export function canLinkWorker(actor: Role | null | undefined, target: Role): boolean {
  return target === "worker" && (actor === "owner" || actor === "admin");
}

/* ---------- worker data scope (mirrors firestore.rules) ---------- */
/**
 * A worker's Firestore reads must be narrowed the same way the rules narrow them, because rules are not filters:
 *  - { field }  -> query `where(field, "==", workerId)`   (tasks assigned to me, my hours)
 *  - { docId }  -> read only the doc with id = workerId    (my worker record, my clock)
 *  - { field, op: "array-contains" } -> where(field array-contains workerId)   (job chats I am in)
 *  - { member }  -> the whole (sub)collection; the rules check membership of the parent (a job chat's messages)
 *  - null       -> a worker may not read this collection at all
 */
export function workerScope(col: string): { field: string; op?: "array-contains" } | { docId: true } | { member: true } | null {
  if (col === "tasks" || col === "hours" || col === "payouts" || col === "jobphotos") return { field: "workerId" };
  if (col === "jobchats") return { field: "members", op: "array-contains" };
  if (col === "crewjobs") return { field: "crew", op: "array-contains" };
  if (/^jobchats\/[^/]+\/msgs$/.test(col)) return { member: true };
  if (col === "clock" || col === "workers") return { docId: true };
  return null;
}

export const roleLabel = (r: Role): [string, string] => (r === "owner" ? ["Owner", "Dueño"] : r === "admin" ? ["Admin", "Administrador"] : ["Worker", "Trabajador"]);

/** The invitation text to send yourself (WhatsApp, text...) when the e-mail did not go out, in the inviter's language. */
export function inviteMessage(inv: { companyName: string; role: Role; email: string }, lang: "en" | "es", origin: string): string {
  const [rEn, rEs] = roleLabel(inv.role);
  return lang === "es"
    ? `¡Hola! Te invito a unirte a ${inv.companyName} en TradeWorks como ${rEs}.\n1. Abre ${origin}/signup?email=${encodeURIComponent(inv.email)} y crea tu cuenta con exactamente este correo: ${inv.email}\n2. Verifica tu correo (te llega un enlace; si no lo ves, revisa la carpeta de spam), entra en ${origin}/login y toca "Unirme".`
    : `Hi! I'm inviting you to join ${inv.companyName} on TradeWorks as ${rEn}.\n1. Open ${origin}/signup?email=${encodeURIComponent(inv.email)} and create your account with exactly this email: ${inv.email}\n2. Verify your email (you get a link; if you don't see it, check your spam folder), sign in at ${origin}/login and tap "Join".`;
}

/** Can a worker record open the app? "app" = a login is linked to it, "invited" = an invitation is waiting, else "none". */
export type WorkerAccess = { state: "app"; email: string } | { state: "invited"; email: string } | { state: "none" };
export function workerAccessState(workerId: string, members: { role: string; workerId?: string; email?: string }[], invites: { email: string; role: string; workerId?: string }[]): WorkerAccess {
  const m = workerId ? members.find((x) => x.role === "worker" && x.workerId === workerId) : undefined;
  if (m) return { state: "app", email: m.email || "" };
  const i = workerId ? invites.find((x) => x.role === "worker" && x.workerId === workerId) : undefined;
  return i ? { state: "invited", email: i.email } : { state: "none" };
}

export const denialText = (d: Denial): [string, string] => {
  switch (d) {
    case "primary-owner": return ["The person who created the company cannot be removed or demoted.", "La persona que creó la empresa no se puede quitar ni bajar de nivel."];
    case "last-owner": return ["A company needs at least one owner.", "La empresa necesita al menos un dueño."];
    case "admin-workers-only": return ["Admins can only manage workers.", "Los administradores solo pueden gestionar trabajadores."];
    case "same-role": return ["Already has that role.", "Ya tiene ese rol."];
    case "platform-only": return ["Only TradeWorks can make someone an owner or admin.", "Solo TradeWorks puede hacer a alguien dueño o administrador."];
    case "not-a-member": return ["That person is not a member.", "Esa persona no es miembro."];
    default: return ["You are not allowed to do that.", "No tienes permiso para hacerlo."];
  }
};
