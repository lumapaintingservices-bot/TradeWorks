import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile,
} from "firebase/auth";
import { collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { auth, db, hasFirebase } from "../lib/firebase";
import type { Company, User } from "./types";

/** Backend abstraction: Firebase when configured, otherwise a localStorage demo (same interface). */
export interface Backend {
  onUser(cb: (u: User | null) => void): () => void;
  signUp(name: string, email: string, pw: string): Promise<void>;
  signIn(email: string, pw: string): Promise<void>;
  signOut(): Promise<void>;
  reset(email: string): Promise<void>;
  getCompany(uid: string): Promise<Company | null>;
  saveCompany(uid: string, c: Partial<Company> & { name: string }): Promise<Company>;
}

const fbBackend: Backend = {
  onUser: (cb) => onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName || "", email: u.email || "" } : null)),
  async signUp(name, email, pw) {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { name, email, lang: "en", theme: "light", companies: [], activeCompanyId: null });
  },
  async signIn(email, pw) { await signInWithEmailAndPassword(auth, email, pw); },
  signOut: () => fbSignOut(auth),
  reset: (email) => sendPasswordResetEmail(auth, email),
  async getCompany(uid) {
    const u = await getDoc(doc(db, "users", uid));
    const cid = u.data()?.activeCompanyId;
    if (!cid) return null;
    const c = await getDoc(doc(db, "companies", cid));
    return c.exists() ? ({ id: c.id, ...c.data() } as Company) : null;
  },
  async saveCompany(uid, c) {
    const id = c.id || doc(collection(db, "companies")).id;
    const full = { ...defaults(uid), ...c, id, ownerUid: uid } as Company;
    const { id: _omit, ...data } = full;
    const ref = doc(db, "companies", id);
    if (c.id) await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    else {
      await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await setDoc(doc(db, "companies", id, "members", uid), { role: "owner", createdAt: serverTimestamp() });
      await updateDoc(doc(db, "users", uid), { companies: arrayUnion(id), activeCompanyId: id });
    }
    return full;
  },
};

const K = { users: "tw.demo.users", session: "tw.demo.session", companies: "tw.demo.companies" };
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return d; } };
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const listeners = new Set<(u: User | null) => void>();
const emit = () => { const s = read<User | null>(K.session, null); listeners.forEach((f) => f(s)); };

const demoBackend: Backend = {
  onUser(cb) { listeners.add(cb); cb(read<User | null>(K.session, null)); return () => listeners.delete(cb); },
  async signUp(name, email, pw) {
    const users = read<Record<string, User & { pw: string }>>(K.users, {});
    if (users[email.toLowerCase()]) throw new Error("auth/email-already-in-use");
    const u = { uid: crypto.randomUUID(), name, email, pw };
    users[email.toLowerCase()] = u; write(K.users, users);
    write(K.session, { uid: u.uid, name, email }); emit();
  },
  async signIn(email, pw) {
    const u = read<Record<string, User & { pw: string }>>(K.users, {})[email.toLowerCase()];
    if (!u || u.pw !== pw) throw new Error("auth/invalid-credential");
    write(K.session, { uid: u.uid, name: u.name, email: u.email }); emit();
  },
  async signOut() { localStorage.removeItem(K.session); emit(); },
  async reset() { /* demo: nothing to send */ },
  async getCompany(uid) { return read<Record<string, Company>>(K.companies, {})[uid] ?? null; },
  async saveCompany(uid, c) {
    const all = read<Record<string, Company>>(K.companies, {});
    const full = { ...defaults(uid), ...all[uid], ...c, id: all[uid]?.id || crypto.randomUUID(), ownerUid: uid } as Company;
    all[uid] = full; write(K.companies, all); return full;
  },
};

function defaults(uid: string): Company {
  return {
    id: "", name: "", phone: "", email: "", website: "", area: "", logoUrl: "", brandColor: "#EF6A2C", trade: "",
    ownerUid: uid, pricing: { door: 0, drawer: 0, depositPct: 30 }, onboarded: false,
  };
}

export const backend: Backend = hasFirebase ? fbBackend : demoBackend;
