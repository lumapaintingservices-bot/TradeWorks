import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUi } from "../store/ui";

export type Lang = "en" | "es";
export type T = (en: string, es: string) => string;
const Ctx = createContext<T>((en) => en);
export const useT = () => useContext(Ctx);

/** UI text is passed inline as (en, es) pairs: t("Pipeline", "Embudo"). */
export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useUi((s) => s.lang);
  const t = useMemo<T>(() => (en, es) => (lang === "es" ? es : en), [lang]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}
