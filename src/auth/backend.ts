import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile, sendEmailVerification, GoogleAuthProvider, signInWithPopup,
} from "firebase/auth";
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { auth, db, hasFirebase } from "../lib/firebase";
import { isRole, normEmail } from "../lib/roles";
import type { Company, Invite, Member, Membership, Role, User } from "./types";

/**
 * Backend abstraction: Firebase when configured, otherwise a localStorage demo (same interface).
 *
 * Data model (docs/04-data-model.md):
 *   users/{uid}                     { name, email, companies:[cid], activeCompanyId }
 *   companies/{cid}                 { ...company, ownerUid }
 *   companies/{cid}/members/{uid}   { role, workerId?, name, email }
 *   invites/{emailLower}            { companyId, companyName, role, workerId?, invitedBy, invitedByName }
 * users.companies is only a HINT list: a membership counts only if companies/{cid}/members/{uid} exists (removed members
 * cannot edit their own user doc's truth, so stale ids are simply dropped and pruned on load).
 */
export interface Backend {
  onUser(cb: (u: User | null) => void): () => void;
  signUp(name: string, email: string, pw: string): Promise<void>;
  signIn(email: string, pw: string): Promise<void>;
  /** "Continue with Google" (Firebase only). Creates the profile on first use. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  reset(email: string): Promise<void>;
  /** Re-reads the account (e-mail verified?) and returns it. */
  refreshUser(): Promise<User | null>;
  resendVerification(): Promise<void>;

  loadMemberships(uid: string): Promise<{ list: Membership[]; activeId: string | null }>;
  setActive(uid: string, companyId: string): Promise<void>;
  /** With c.id: updates that company (never touches ownerUid). Without: creates a NEW company, makes the caller its owner and the active one. */
  saveCompany(uid: string, c: Partial<Company> & { name: string }): Promise<Company>;

  listMembers(companyId: string): Promise<Member[]>;
  updateMember(companyId: string, uid: string, patch: { role?: Role; workerId?: string | null }): Promise<void>;
  removeMember(companyId: string, uid: string, self?: boolean): Promise<void>;

  getInvite(email: string): Promise<Invite | null>;
  listInvites(companyId: string): Promise<Invite[]>;
  saveInvite(inv: Invite): Promise<void>;
  deleteInvite(email: string): Promise<void>;
  /** Creates the members doc + adds the company to the user + makes it active + deletes the invite. */
  acceptInvite(user: User, inv: Invite): Promise<void>;
}

const toUser = (u: { uid: string; displayName: string | null; email: string | null; emailVerified: boolean }): User =>
  ({ uid: u.uid, name: u.displayName || "", email: u.email || "", emailVerified: u.emailVerified });
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));
// billing fields are written only by the Stripe webhook; a stale browser copy must never write them back
const BILLING_FIELDS = ["plan", "subscriptionStatus", "stripeCustomerId", "stripeSubscriptionId", "trialEndsAt", "currentPeriodEnd", "pastDueSince", "stripeEventAt"];
const stripBilling = <T extends Record<string, unknown>>(o: T): T => { const c = { ...o }; BILLING_FIELDS.forEach((k) => delete c[k]); return c; };
const stripCompany = ({ id: _i, ownerUid: _o, createdAt: _c, updatedAt: _u, ...rest }: Record<string, unknown>) => stripBilling(rest);
const TRIAL_DAYS = 14;

const fbBackend: Backend = {
  onUser: (cb) => onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)),
  async signUp(name, email, pw) {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { name, email, lang: "en", theme: "light", companies: [], activeCompanyId: null });
    // needed to accept a team invite (rules require a verified e-mail); harmless otherwise
    sendEmailVerification(cred.user).catch(() => {});
  },
  async signIn(email, pw) { await signInWithEmailAndPassword(auth, email, pw); },
  async signInWithGoogle() {
    const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
    // first time: create the profile (name / email only; an existing profile is left alone)
    const ref = doc(db, "users", user.uid);
    if (!(await getDoc(ref)).exists()) await setDoc(ref, { name: user.displayName || "", email: user.email || "", lang: "en", theme: "light", companies: [], activeCompanyId: null });
  },
  signOut: () => fbSignOut(auth),
  reset: (email) => sendPasswordResetEmail(auth, email),
  async refreshUser() {
    const u = auth.currentUser;
    if (!u) return null;
    await u.reload();
    await u.getIdToken(true); // so request.auth.token.email_verified is current in the rules
    return toUser(u);
  },
  async resendVerification() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },

  async loadMemberships(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.data() || {};
    const active: string | null = d.activeCompanyId || null;
    const ids: string[] = [...new Set<string>([...(Array.isArray(d.companies) ? d.companies : []), ...(active ? [active] : [])])];
    const gone: string[] = [];
    let failed = 0;
    const found = await Promise.all(ids.map(async (cid): Promise<Membership | null> => {
      try {
        const m = await getDoc(doc(db, "companies", cid, "members", uid));
        if (!m.exists() || !isRole(m.data().role)) { gone.push(cid); return null; }
        const c = await getDoc(doc(db, "companies", cid));
        if (!c.exists()) { gone.push(cid); return null; }
        return { company: { id: c.id, ...c.data() } as Company, role: m.data().role as Role, workerId: m.data().workerId || undefined };
      } catch { failed++; return null; } // offline / transient: keep the id, just skip it this time
    }));
    if (gone.length) updateDoc(doc(db, "users", uid), { companies: arrayRemove(...gone) }).catch(() => {});
    const list = found.filter((x): x is Membership => !!x);
    // nothing loaded only because reads failed (offline): report it instead of looking like "no company yet" (-> onboarding)
    if (!list.length && failed) throw new Error("load-failed");
    return { list, activeId: list.some((m) => m.company.id === active) ? active : list[0]?.company.id ?? null };
  },
  async setActive(uid, cid) { await setDoc(doc(db, "users", uid), { activeCompanyId: cid }, { merge: true }); },
  async saveCompany(uid, c) {
    if (c.id) {
      // update: ownerUid / createdAt are immutable (rules), so they are never sent
      await updateDoc(doc(db, "companies", c.id), { ...clean(stripCompany(c as Record<string, unknown>)), updatedAt: serverTimestamp() });
      return c as Company;
    }
    const id = doc(collection(db, "companies")).id;
    const full = { ...defaults(uid), ...c, id, ownerUid: uid } as Company;
    const { id: _omit, ...data } = full;
    await setDoc(doc(db, "companies", id), { ...clean(data), trialEndsAt: Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 864e5), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const me = auth.currentUser;
    await setDoc(doc(db, "companies", id, "members", uid), { role: "owner", name: me?.displayName || "", email: normEmail(me?.email), createdAt: serverTimestamp() });
    // merge-write: also creates the profile if sign-up failed to save it earlier
    await setDoc(doc(db, "users", uid), { name: me?.displayName || "", email: me?.email || "", companies: arrayUnion(id), activeCompanyId: id }, { merge: true });
    return full;
  },

  async listMembers(cid) {
    const s = await getDocs(collection(db, "companies", cid, "members"));
    return s.docs.filter((d) => isRole(d.data().role)).map((d) => ({ uid: d.id, role: d.data().role as Role, workerId: d.data().workerId || undefined, name: d.data().name || "", email: d.data().email || "" }));
  },
  async updateMember(cid, uid, patch) {
    const data: Record<string, unknown> = {};
    if (patch.role) data.role = patch.role;
    if ("workerId" in patch) data.workerId = patch.workerId || null;
    await updateDoc(doc(db, "companies", cid, "members", uid), data);
  },
  async removeMember(cid, uid, self) {
    await deleteDoc(doc(db, "companies", cid, "members", uid));
    if (self) await updateDoc(doc(db, "users", uid), { companies: arrayRemove(cid) }).catch(() => {});
  },

  async getInvite(email) {
    const e = normEmail(email);
    if (!e) return null;
    const s = await getDoc(doc(db, "invites", e));
    return s.exists() ? inviteFrom(e, s.data()) : null;
  },
  async listInvites(cid) {
    const s = await getDocs(query(collection(db, "invites"), where("companyId", "==", cid)));
    return s.docs.map((d) => inviteFrom(d.id, d.data()));
  },
  async saveInvite(inv) {
    const { email, ...rest } = inv;
    await setDoc(doc(db, "invites", normEmail(email)), { ...clean(rest), createdAt: serverTimestamp() });
  },
  async deleteInvite(email) { await deleteDoc(doc(db, "invites", normEmail(email))); },
  async acceptInvite(user, inv) {
    const e = normEmail(user.email);
    // one atomic batch. The members rule reads invites/{email} (get() sees the state BEFORE the batch), so the
    // invite still counts while the same batch deletes it.
    const b = writeBatch(db);
    b.set(doc(db, "companies", inv.companyId, "members", user.uid), clean({
      role: inv.role, ...(inv.workerId ? { workerId: inv.workerId } : {}), name: user.name || "", email: e, createdAt: serverTimestamp(),
    }));
    b.set(doc(db, "users", user.uid), { name: user.name, email: user.email, companies: arrayUnion(inv.companyId), activeCompanyId: inv.companyId }, { merge: true });
    b.delete(doc(db, "invites", e));
    await b.commit();
  },
};

function inviteFrom(email: string, d: Record<string, unknown>): Invite {
  return {
    email, companyId: String(d.companyId || ""), companyName: String(d.companyName || ""), role: (isRole(d.role) ? d.role : "worker") as Role,
    workerId: d.workerId ? String(d.workerId) : undefined, invitedBy: String(d.invitedBy || ""), invitedByName: d.invitedByName ? String(d.invitedByName) : undefined,
  };
}

/* ============================== demo (localStorage) ============================== */
type DemoUser = User & { pw: string };
type DemoMember = { role: Role; workerId?: string; name?: string; email?: string };
const K = {
  users: "tw.demo.users", session: "tw.demo.session",
  companies: "tw.demo.companies",   // Record<key, Company>; key = company id (legacy seeds used the owner's uid; lookups go by company.id)
  members: "tw.demo.members",       // Record<companyId, Record<uid, DemoMember>>
  profiles: "tw.demo.profiles",     // Record<uid, { activeCompanyId }>
  invites: "tw.demo.invites",       // Record<emailLower, Invite>
};
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const listeners = new Set<(u: User | null) => void>();
const emit = () => { const s = read<User | null>(K.session, null); listeners.forEach((f) => f(s)); };
const demoUser = (e: string) => Object.values(read<Record<string, DemoUser>>(K.users, {})).find((u) => normEmail(u.email) === normEmail(e));
const demoUid = (uid: string) => Object.values(read<Record<string, DemoUser>>(K.users, {})).find((u) => u.uid === uid);
const demoCompanies = () => read<Record<string, Company>>(K.companies, {});
const uniqId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/** Members of a company; a company seeded/created before roles existed gets its owner row on first read. */
function demoMembersOf(cid: string): Record<string, DemoMember> {
  const all = read<Record<string, Record<string, DemoMember>>>(K.members, {});
  const rows = all[cid] || {};
  const c = Object.values(demoCompanies()).find((x) => x.id === cid);
  if (c?.ownerUid && !rows[c.ownerUid]) {
    const o = demoUid(c.ownerUid);
    rows[c.ownerUid] = { role: "owner", name: o?.name || "", email: normEmail(o?.email) };
    all[cid] = rows; write(K.members, all);
  }
  return rows;
}
function setDemoMembers(cid: string, rows: Record<string, DemoMember>) {
  const all = read<Record<string, Record<string, DemoMember>>>(K.members, {});
  all[cid] = rows; write(K.members, all);
}

const demoBackend: Backend = {
  onUser(cb) { listeners.add(cb); cb(read<User | null>(K.session, null)); return () => listeners.delete(cb); },
  async signUp(name, email, pw) {
    const users = read<Record<string, DemoUser>>(K.users, {});
    if (users[email.toLowerCase()]) throw new Error("auth/email-already-in-use");
    const u = { uid: uniqId(), name, email, pw };
    users[email.toLowerCase()] = u; write(K.users, users);
    write(K.session, { uid: u.uid, name, email, emailVerified: true }); emit(); // demo: e-mail counts as verified
  },
  async signIn(email, pw) {
    const u = read<Record<string, DemoUser>>(K.users, {})[email.toLowerCase()];
    if (!u || u.pw !== pw) throw new Error("auth/invalid-credential");
    write(K.session, { uid: u.uid, name: u.name, email: u.email, emailVerified: true }); emit();
  },
  async signInWithGoogle() { throw new Error("auth/google-unavailable"); },
  async signOut() { localStorage.removeItem(K.session); emit(); },
  async reset() { /* demo: nothing to send */ },
  async refreshUser() { return read<User | null>(K.session, null); },
  async resendVerification() { /* demo: nothing to send */ },

  async loadMemberships(uid) {
    const list: Membership[] = [];
    for (const c of Object.values(demoCompanies())) {
      if (!c?.id) continue;
      const m = demoMembersOf(c.id)[uid];
      if (m && isRole(m.role)) list.push({ company: c, role: m.role, workerId: m.workerId });
    }
    const active = read<Record<string, { activeCompanyId?: string }>>(K.profiles, {})[uid]?.activeCompanyId;
    return { list, activeId: list.some((m) => m.company.id === active) ? active! : list[0]?.company.id ?? null };
  },
  async setActive(uid, cid) {
    const p = read<Record<string, { activeCompanyId?: string }>>(K.profiles, {});
    p[uid] = { ...p[uid], activeCompanyId: cid }; write(K.profiles, p);
  },
  async saveCompany(uid, c) {
    const all = demoCompanies();
    const key = c.id ? Object.keys(all).find((k) => all[k].id === c.id) : undefined;
    if (key) { // update: ownerUid is immutable
      const full = { ...all[key], ...stripBilling(c as Record<string, unknown>), id: all[key].id, ownerUid: all[key].ownerUid } as Company;
      all[key] = full; write(K.companies, all); return full;
    }
    const id = c.id || uniqId();
    const full = { ...defaults(uid), ...c, id, ownerUid: uid, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() } as Company;
    all[id] = full; write(K.companies, all);
    const me = demoUid(uid);
    setDemoMembers(id, { ...demoMembersOf(id), [uid]: { role: "owner", name: me?.name || "", email: normEmail(me?.email) } });
    await demoBackend.setActive(uid, id);
    return full;
  },

  async listMembers(cid) {
    return Object.entries(demoMembersOf(cid)).map(([uid, m]) => ({ uid, role: m.role, workerId: m.workerId, name: m.name || "", email: m.email || "" }));
  },
  async updateMember(cid, uid, patch) {
    const rows = demoMembersOf(cid);
    if (!rows[uid]) return;
    if (patch.role) rows[uid].role = patch.role;
    if ("workerId" in patch) { if (patch.workerId) rows[uid].workerId = patch.workerId; else delete rows[uid].workerId; }
    setDemoMembers(cid, rows);
  },
  async removeMember(cid, uid) {
    const rows = demoMembersOf(cid); delete rows[uid]; setDemoMembers(cid, rows);
  },

  async getInvite(email) { const e = normEmail(email); return e ? read<Record<string, Invite>>(K.invites, {})[e] ?? null : null; },
  async listInvites(cid) { return Object.entries(read<Record<string, Invite>>(K.invites, {})).filter(([, v]) => v.companyId === cid).map(([email, v]) => ({ ...v, email })); },
  async saveInvite(inv) {
    const all = read<Record<string, Invite>>(K.invites, {});
    all[normEmail(inv.email)] = clean({ ...inv, email: normEmail(inv.email) }); write(K.invites, all);
  },
  async deleteInvite(email) { const all = read<Record<string, Invite>>(K.invites, {}); delete all[normEmail(email)]; write(K.invites, all); },
  async acceptInvite(user, inv) {
    const rows = demoMembersOf(inv.companyId);
    rows[user.uid] = clean({ role: inv.role, workerId: inv.workerId, name: user.name, email: normEmail(user.email) });
    setDemoMembers(inv.companyId, rows);
    await demoBackend.deleteInvite(user.email);
    await demoBackend.setActive(user.uid, inv.companyId);
  },
};

function defaults(uid: string): Company {
  return {
    id: "", name: "", phone: "", email: "", website: "", area: "", logoUrl: "", brandColor: "#EF6A2C", trade: "",
    ownerUid: uid, pricing: { door: 0, drawer: 0, depositPct: 30 }, onboarded: false,
  };
}

export const backend: Backend = hasFirebase ? fbBackend : demoBackend;
