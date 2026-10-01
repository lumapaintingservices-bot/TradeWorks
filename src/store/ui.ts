import { create } from "zustand";
import type { Lang } from "../i18n";

export type ThemePref = "light" | "dark" | "auto";
const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** sbMini: the desktop sidebar is folded to icons (button at its top, or Ctrl/Cmd+B); remembered on this device. */
/** A toast can offer "Undo" (e.g. after a delete); errors get a red icon (detected from the text when not given). */
export type ToastOpts = { undo?: () => void; kind?: "ok" | "err" };
type Ui = { lang: Lang; theme: ThemePref; toastMsg: string; toastOpts: ToastOpts; toastId: number; sbMini: boolean; setLang(l: Lang): void; setTheme(t: ThemePref): void; setSbMini(v: boolean): void; toast(m: string, opts?: ToastOpts): void; closeToast(): void };
let toastTimer: ReturnType<typeof setTimeout> | undefined; // one timer: an older toast must not clear a newer one
export const useUi = create<Ui>((set) => ({
  lang: (ls("tw.lang") as Lang) || (navigator.language.startsWith("es") ? "es" : "en"),
  theme: (ls("tw.theme") as ThemePref) || "light",
  toastMsg: "", toastOpts: {}, toastId: 0,
  sbMini: ls("tw.sbMini") === "1",
  setSbMini: (sbMini) => { save("tw.sbMini", sbMini ? "1" : "0"); set({ sbMini }); },
  setLang: (lang) => { save("tw.lang", lang); document.documentElement.lang = lang; set({ lang }); },
  setTheme: (theme) => { save("tw.theme", theme); set({ theme }); },
  toast: (toastMsg, toastOpts = {}) => {
    set((s) => ({ toastMsg, toastOpts, toastId: s.toastId + 1 }));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => set({ toastMsg: "", toastOpts: {} }), toastOpts.undo ? 6000 : 3000);
  },
  closeToast: () => { clearTimeout(toastTimer); set({ toastMsg: "", toastOpts: {} }); },
}));

/** Applies html.tw-dark from the theme preference ("auto" follows the device). */
export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("tw-dark", dark);
}
