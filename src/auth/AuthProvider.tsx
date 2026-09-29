import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { backend } from "./backend";
import type { Company, User } from "./types";

type Ctx = {
  ready: boolean; user: User | null; company: Company | null;
  saveCompany(c: Partial<Company> & { name: string }): Promise<Company>;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => backend.onUser(async (u) => {
    setUser(u);
    setCompany(u ? await backend.getCompany(u.uid).catch(() => null) : null);
    setReady(true);
  }), []);

  const saveCompany: Ctx["saveCompany"] = async (c) => {
    const saved = await backend.saveCompany(user!.uid, { ...c, id: c.id ?? company?.id });
    setCompany(saved);
    return saved;
  };
  return <AuthCtx.Provider value={{ ready, user, company, saveCompany }}>{children}</AuthCtx.Provider>;
}
