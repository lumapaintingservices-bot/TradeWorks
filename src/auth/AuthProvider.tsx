import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { decideInvite, normEmail, type Role } from "../lib/roles";
import { backend } from "./backend";
import type { Company, CompanyRef, Invite, Membership, User } from "./types";

export type PendingInvite = { invite: Invite; state: "accept" | "needs-verify" };

type Ctx = {
  ready: boolean; user: User | null;
  /** The ACTIVE company (null while a new company is being created, or when the user has none yet). */
  company: Company | null;
  /** The user's role in the active company. */
  role: Role | null;
  /** For role "worker": the workers/{id} record this login is linked to (set by the owner in Settings > Members). */
  workerId: string | null;
  /** Every company the user belongs to (for the workspace switcher). */
  companies: CompanyRef[];
  /** Id of the company that is (or, while `creating`, stays) active underneath. */
  activeCompanyId: string | null;
  /** True while the user is creating an additional company with the onboarding steps (the old company is untouched). */
  creating: boolean;
  /** Account data could not be loaded (offline / rules / too slow). The app shows a retry screen instead of onboarding. */
  loadError: boolean;
  /** Signed in, and the account (companies, role) is still loading: the sign-in page shows "Signing you in…". */
  loadingAccount: boolean;
  /** Updates the active company, or (no id and none active) creates a NEW one and makes it active. */
  saveCompany(c: Partial<Company> & { name: string }): Promise<Company>;
  switchCompany(id: string): Promise<void>;
  /** Starts the "new company" onboarding: company becomes null until the first save creates it. */
  createCompany(): void;
  cancelCreateCompany(): void;
  retryLoad(): void;
  invite: PendingInvite | null;
  acceptInvite(): Promise<void>;
  /** Hides the banner for this visit; the invite stays. */
  dismissInvite(): void;
  refreshVerification(): Promise<void>;
  resendVerification(): Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);
/** owner | admin | worker for the active company (null before it is known). */
export const useRole = (): Role | null => useContext(AuthCtx).role;
/** Worker scope for data hooks: { isWorker, workerId } (workerId only matters for role worker). */
export function useWorkerScope(): { isWorker: boolean; workerId: string | null } {
  const { role, workerId } = useContext(AuthCtx);
  return { isWorker: role === "worker", workerId };
}

/** Account loading gives up after this long (a stuck connection, e.g. Safari's storage after the tab slept) and offers a retry. */
export const LOAD_TIMEOUT_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("load-timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [inviteDoc, setInviteDoc] = useState<Invite | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const seq = useRef(0);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Everything is (re)loaded per signed-in user; a stale answer for a previous user is discarded.
  useEffect(() => backend.onUser(async (u) => {
    const mine = ++seq.current;
    if (!u) {
      setUser(null); setMembers([]); setActiveId(null); setDraft(false); setInviteDoc(null); setDismissed([]); setLoadError(false); setReady(true);
      return;
    }
    setReady(false); setLoadingAccount(true);
    let list: Membership[] = [], active: string | null = null, err = false;
    try { ({ list, activeId: active } = await withTimeout(backend.loadMemberships(u.uid), LOAD_TIMEOUT_MS)); } catch { err = true; }
    const inv = err ? null : await withTimeout(backend.getInvite(u.email), 8000).catch(() => null);
    if (mine !== seq.current) return;
    setUser(u); setMembers(list); setActiveId(active); setDraft(false); setInviteDoc(inv); setDismissed([]); setLoadError(err); setReady(true); setLoadingAccount(false);
  }), [retry]);

  const active = useMemo(() => members.find((m) => m.company.id === activeId) ?? null, [members, activeId]);
  const company = draft ? null : active?.company ?? null;

  const invite = useMemo<PendingInvite | null>(() => {
    if (!user || !inviteDoc || dismissed.includes(inviteDoc.companyId)) return null;
    const d = decideInvite({ invite: inviteDoc, docEmail: inviteDoc.email, userEmail: user.email, emailVerified: !!user.emailVerified, memberOf: members.map((m) => m.company.id) });
    return d.kind === "accept" || d.kind === "needs-verify" ? { invite: inviteDoc, state: d.kind } : null;
  }, [user, inviteDoc, dismissed, members]);

  // an invite for a company the user already belongs to is stale: clear it (allowed for the invited e-mail)
  useEffect(() => {
    if (user && inviteDoc && members.some((m) => m.company.id === inviteDoc.companyId) && normEmail(inviteDoc.email) === normEmail(user.email)) {
      backend.deleteInvite(inviteDoc.email).catch(() => {}); setInviteDoc(null);
    }
  }, [user, inviteDoc, members]);

  const saveCompany: Ctx["saveCompany"] = async (c) => {
    const u = userRef.current!;
    const cur = active && !draft ? active.company : null;
    const id = c.id ?? cur?.id;
    const merged = id && cur && cur.id === id ? { ...cur, ...c, id } : { ...c, ...(id ? { id } : {}) };
    const saved = { ...(cur && cur.id === id ? cur : {}), ...(await backend.saveCompany(u.uid, merged)) } as Company;
    setMembers((ms) => ms.some((m) => m.company.id === saved.id)
      ? ms.map((m) => (m.company.id === saved.id ? { ...m, company: saved } : m))
      : [...ms, { company: saved, role: "owner" }]);
    if (!id) { setActiveId(saved.id); setDraft(false); } // a brand-new company becomes the active one
    return saved;
  };

  const switchCompany = useCallback(async (id: string) => {
    const u = userRef.current;
    if (!u) return;
    setDraft(false); setActiveId(id);
    backend.setActive(u.uid, id).catch(() => {});
    // refresh the list in the background (role / branding may have changed elsewhere); the chosen company stays active
    backend.loadMemberships(u.uid).then(({ list }) => { if (userRef.current?.uid === u.uid && list.some((m) => m.company.id === id)) setMembers(list); }).catch(() => {});
  }, []);

  const acceptInvite = async () => {
    if (!user || !invite || invite.state !== "accept") return;
    await backend.acceptInvite(user, invite.invite);
    const { list } = await backend.loadMemberships(user.uid);
    setMembers(list); setActiveId(invite.invite.companyId); setDraft(false); setInviteDoc(null);
  };
  const refreshVerification = async () => { const u = await backend.refreshUser(); if (u) setUser(u); };

  const value: Ctx = {
    ready, user, company, role: draft ? null : active?.role ?? null, workerId: draft ? null : active?.workerId ?? null,
    companies: members.map((m) => ({ id: m.company.id, name: m.company.name, logoUrl: m.company.logoUrl, role: m.role })),
    activeCompanyId: activeId, creating: draft, loadError, loadingAccount,
    saveCompany, switchCompany,
    createCompany: () => setDraft(true),
    cancelCreateCompany: () => setDraft(false),
    retryLoad: () => setRetry((n) => n + 1),
    invite, acceptInvite,
    dismissInvite: () => { if (inviteDoc) setDismissed((d) => [...d, inviteDoc.companyId]); },
    refreshVerification, resendVerification: () => backend.resendVerification(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
