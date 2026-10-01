import type { ThemePref } from "../store/ui";
import { useUi } from "../store/ui";
import "./ui.css";

// 24×24, stroke 1.8 (same grid as /design/icons.ts)
const ICON: Record<ThemePref, string> = {
  auto: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
};
const ORDER: ThemePref[] = ["auto", "light", "dark"];

/** Light / dark / match device as three round buttons in a pill (idea from Vercel Geist's Theme Switcher). */
export function ThemeSwitcher({ small }: { small?: boolean }) {
  const theme = useUi((s) => s.theme), setTheme = useUi((s) => s.setTheme);
  const es = useUi((s) => s.lang) === "es";
  const name: Record<ThemePref, string> = es ? { auto: "Igual al dispositivo", light: "Claro", dark: "Oscuro" } : { auto: "Match device", light: "Light", dark: "Dark" };
  return (
    <div className={"thsw" + (small ? " sm" : "")} role="radiogroup" aria-label={es ? "Tema" : "Theme"}>
      {ORDER.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={theme === k} aria-label={name[k]} title={name[k]} className={theme === k ? "on" : ""}
          onClick={() => setTheme(k)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const n = ORDER[(ORDER.indexOf(k) + (e.key === "ArrowRight" ? 1 : 2)) % 3];
            setTheme(n);
            (e.currentTarget.parentElement?.querySelector(`[aria-label="${name[n]}"]`) as HTMLElement | null)?.focus();
          }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: ICON[k] }} />
        </button>
      ))}
    </div>
  );
}
