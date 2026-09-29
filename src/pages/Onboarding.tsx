import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import type { Company } from "../auth/types";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Logo } from "../ui/Logo";
import "./auth.css";

const TRADES: [string, string, string][] = [
  ["cabinets", "Cabinet refinishing", "Restauración de gabinetes"], ["painting", "Painting", "Pintura"],
  ["cleaning", "Cleaning", "Limpieza"], ["handyman", "Handyman", "Mantenimiento"],
];

export default function Onboarding() {
  const t = useT();
  const nav = useNavigate();
  const { lang, setLang } = useUi();
  const { user, company, saveCompany } = useAuth();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: company?.name || "", phone: "", email: user?.email || "", website: "", area: "", trade: "painting", door: "", drawer: "", depositPct: "30" });
  const [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  if (company?.onboarded) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const payload = (): Partial<Company> & { name: string } => ({
    name: f.name.trim() || user.name || user.email, phone: f.phone, email: f.email, website: f.website, area: f.area, trade: f.trade,
    pricing: { door: Number(f.door) || 0, drawer: Number(f.drawer) || 0, depositPct: Number(f.depositPct) || 0 },
  });
  const next = async () => {
    setBusy(true);
    try { if (step === 1 || step === 3) await saveCompany(payload()); setStep(step + 1); } finally { setBusy(false); }
  };
  const finish = async (to: string) => { setBusy(true); await saveCompany({ ...payload(), onboarded: true }); nav(to, { replace: true }); };
  const skip = () => finish("/");
  const titles = [t("Welcome to TradeWorks", "Bienvenido a TradeWorks"), t("Your business", "Tu negocio"), t("Your trade", "Tu oficio"), t("Your prices", "Tus precios"), t("You're all set", "¡Todo listo!")];

  return (
    <div className="auth">
      <div className="onb card">
        <button className="onb-skip" onClick={skip}>{t("Skip setup", "Omitir")}</button>
        <div className="onb-dashes">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <Logo size={40} />
        <h1 style={{ marginTop: 16 }}>{titles[step]}</h1>
        {step === 0 && <>
          <p className="sub">{t("Choose your language. Client documents use each client's own language.", "Elige tu idioma. Los documentos usan el idioma de cada cliente.")}</p>
          <div className="choice">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}</div>
        </>}
        {step === 1 && <>
          <p className="sub">{t("This appears on your estimates and client link.", "Esto aparece en tus presupuestos y enlace de cliente.")}</p>
          <label className="f">{t("Business name", "Nombre del negocio")}<input value={f.name} onChange={set("name")} autoFocus /></label>
          <div className="grid2">
            <label className="f">{t("Phone", "Teléfono")}<input value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
            <label className="f">{t("Email", "Correo")}<input type="email" value={f.email} onChange={set("email")} /></label>
            <label className="f">{t("Website", "Sitio web")}<input value={f.website} onChange={set("website")} /></label>
            <label className="f">{t("Area served", "Zona de servicio")}<input value={f.area} onChange={set("area")} /></label>
          </div>
        </>}
        {step === 2 && <>
          <p className="sub">{t("We'll start you with the right job types.", "Te damos los tipos de trabajo adecuados.")}</p>
          <div className="choice">{TRADES.map(([k, en, es]) => <button key={k} className={f.trade === k ? "on" : ""} onClick={() => setF({ ...f, trade: k })}>{t(en, es)}</button>)}</div>
        </>}
        {step === 3 && <>
          <p className="sub">{t("Starting prices — change them any time in Settings.", "Precios iniciales — cámbialos cuando quieras en Ajustes.")}</p>
          <div className="grid2">
            <label className="f">{t("Price per door ($)", "Precio por puerta ($)")}<input type="number" min="0" value={f.door} onChange={set("door")} /></label>
            <label className="f">{t("Price per drawer ($)", "Precio por cajón ($)")}<input type="number" min="0" value={f.drawer} onChange={set("drawer")} /></label>
          </div>
          <label className="f">{t("Deposit (%)", "Depósito (%)")}<input type="number" min="0" max="100" value={f.depositPct} onChange={set("depositPct")} /></label>
        </>}
        {step === 4 && <p className="sub">{t("Create your first estimate, or look around with a sample job.", "Crea tu primer presupuesto o explora con un trabajo de ejemplo.")}</p>}
        <div className="onb-foot">
          {step === 0 ? <button className="link" onClick={async () => { await backend.signOut(); nav("/login"); }}>{t("I already have an account", "Ya tengo cuenta")}</button>
            : step < 4 ? <button className="btn" onClick={() => setStep(step - 1)}>{t("Back", "Atrás")}</button> : <span />}
          {step < 4
            ? <button className="btn pri" disabled={busy || (step === 1 && !f.name.trim())} onClick={next}>{t("Continue", "Continuar")}</button>
            : <span style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={busy} onClick={() => finish("/")}>{t("Explore with a sample job", "Explorar con un ejemplo")}</button>
                <button className="btn pri" disabled={busy} onClick={() => finish("/estimates?new=1")}>{t("First estimate", "Primer presupuesto")}</button>
              </span>}
        </div>
      </div>
    </div>
  );
}
