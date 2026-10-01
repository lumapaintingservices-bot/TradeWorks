import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import { useT } from "../i18n";
import { hasFirebase } from "../lib/firebase";
import { roleLabel } from "../lib/roles";
import { Icon } from "../ui/Icon";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";

const initials = (s: string) => (s.trim().split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();

/** Who is signed in: avatar + name + e-mail, cloud / demo, role. */
export function UserHead() {
  const t = useT();
  const { user, company, role } = useAuth();
  const name = user?.name || company?.name || "";
  return (
    <div className="nu-head">
      <span className="av">{initials(user?.name || user?.email || "?")}</span>
      <div><b>{name}</b><span>{user?.email}</span>
        <em><i style={hasFirebase ? undefined : { background: "var(--warn)" }} />{hasFirebase ? t("Cloud on", "Nube activa") : t("Demo mode", "Modo demo")}{role ? " · " + t(...roleLabel(role)) : ""}</em></div>
    </div>
  );
}

/**
 * The signed-in person at the bottom of the sidebar (idea from shadcn's dashboard-01 "NavUser"): click for a menu with
 * Settings, Language & appearance, the theme switcher and Sign out. Folded sidebar: only the avatar.
 */
export function NavUser({ mini, onTip }: { mini: boolean; onTip?(text: string, el?: HTMLElement | null): void }) {
  const t = useT();
  const nav = useNavigate();
  const { user, company } = useAuth();
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const name = user?.name || company?.name || "";
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) });
  };
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLElement>("button")?.focus();
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    const size = () => close();
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key); window.addEventListener("resize", size);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); window.removeEventListener("resize", size); };
  }, [pos]);
  const go = (to: string) => { close(); nav(to); };
  return (
    <>
      <button ref={btn} type="button" className={"nav-user" + (pos ? " open" : "")} aria-haspopup="menu" aria-expanded={!!pos}
        aria-label={mini ? name + " · " + t("Account menu", "Menú de la cuenta") : undefined}
        onMouseEnter={(e) => mini && onTip?.(name, e.currentTarget)} onMouseLeave={() => onTip?.("")}
        onClick={() => (pos ? close() : open())}>
        <span className="av">{initials(user?.name || user?.email || "?")}</span>
        <span className="nu-txt"><b>{name}</b><span>{user?.email}</span></span>
        <svg className="nu-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
      </button>
      {pos && (
        <div ref={menu} className="nu-menu" role="menu" style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}>
          <UserHead />
          <div className="nu-sep" />
          <button role="menuitem" className="nu-it" onClick={() => go("/settings")}><Icon name="settings" size={17} />{t("Settings", "Ajustes")}</button>
          <button role="menuitem" className="nu-it" onClick={() => go("/settings?section=general")}><Icon name="globe" size={17} />{t("Language & appearance", "Idioma y apariencia")}</button>
          <div className="nu-theme"><span>{t("Theme", "Tema")}</span><ThemeSwitcher small /></div>
          <div className="nu-sep" />
          <button role="menuitem" className="nu-it" onClick={() => { close(); backend.signOut(); }}><Icon name="logout" size={17} />{t("Sign out", "Salir")}</button>
        </div>
      )}
    </>
  );
}
