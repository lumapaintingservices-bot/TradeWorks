import { useT } from "../i18n";
import { useUi, type ThemePref } from "../store/ui";

export default function Settings() {
  const t = useT();
  const { theme, setTheme } = useUi();
  const opts: [ThemePref, string, string][] = [["light", "Light", "Claro"], ["dark", "Dark", "Oscuro"], ["auto", "Match device", "Igual al dispositivo"]];
  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("Settings", "Ajustes")}</h1></div></div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-h"><h2>{t("Appearance", "Apariencia")}</h2></div>
        <div className="card-b">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {opts.map(([k, en, es]) => <button key={k} className={theme === k ? "on" : ""} onClick={() => setTheme(k)}>{t(en, es)}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}
