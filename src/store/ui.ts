import { create } from "zustand";
import type { Lang } from "../i18n";

export type ThemePref = "light" | "dark" | "auto";
const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** sbMini: the desktop sidebar is folded to icons (button at its top, or Ctrl/Cmd+B); remembered on this device. */
type Ui = { lang: Lang; theme: ThemePref; toastMsg: string; sbMini: boolean; setLang(l: Lang): void; setTheme(t: ThemePref): void; setSbMini(v: boolean): void; toast(m: string): void };
let toastTimer: ReturnType<typeof setTimeout> | undefined; // one timer: an older toast must not clear a newer one
export const useUi = create<Ui>((set) => ({
  lang: (ls("tw.lang") as Lang) || (navigator.language.startsWith("es") ? "es" : "en"),
  theme: (ls("tw.theme") as ThemePref) || "light",
  toastMsg: "",
  sbMini: ls("tw.sbMini") === "1",
  setSbMini: (sbMini) => { save("tw.sbMini", sbMini ? "1" : "0"); set({ sbMini }); },
  setLang: (lang) => { save("tw.lang", lang); document.documentElement.lang = lang; set({ lang }); },
  setTheme: (theme) => { save("tw.theme", theme); set({ theme }); },
  toast: (toastMsg) => { set({ toastMsg }); clearTimeout(toastTimer); toastTimer = setTimeout(() => set({ toastMsg: "" }), 2400); },
}));

/** Applies html.tw-dark from the theme preference ("auto" follows the device). */
export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("tw-dark", dark);
}
