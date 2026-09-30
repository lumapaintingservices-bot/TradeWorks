import { useState } from "react";
import { useSettings } from "../data/hooks";
import { onboardingSettingsPatch, starterCatalog, TRADE_LIST, tradeById, type OwnService } from "../lib/trades";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import type { Company } from "../auth/types";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Logo } from "../ui/Logo";
import "./auth.css";

const UNITS = ["job", "hr", "ea", "sq ft", "lin ft", "visit", "room", "day"];
const newRow = (): OwnService => ({ name: "", unit: "job", price: "" });

export default function Onboarding() {
  const t = useT();
  const nav = useNavigate();
  const { lang, setLang } = useUi();
  const { user, company, saveCompany, creating } = useAuth();
  const { settings, update } = useSettings();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: company?.name || "", phone: "", email: user?.email || "", website: "", area: "", trade: "painting", door: "", drawer: "", depositPct: String(tradeById("painting").depositPct) });
  const [blank, setBlank] = useState(false);            // "start blank" = the custom trade (no template)
  const [later, setLater] = useState(false);            // "I'll set my prices later"
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [own, setOwn] = useState<OwnService[]>([newRow()]);
  const [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  if (company?.onboarded) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const trade = blank ? "custom" : f.trade;              // what the company really is
  const tr = tradeById(trade);
  const pickTrade = (k: string) => { setF({ ...f, trade: k, depositPct: String(tradeById(k).depositPct) }); setAnswers({}); if (k === "custom") setBlank(false); };
  const paintingAns = { door: f.door, drawer: f.drawer };

  const payload = (): Partial<Company> & { name: string } => ({
    name: f.name.trim() || user.name || user.email, phone: f.phone, email: f.email, website: f.website, area: f.area, trade,
    pricing: { door: Number(f.door) || 0, drawer: Number(f.drawer) || 0, depositPct: Number(f.depositPct) || 0 },
  });
  const next = async () => {
    setBusy(true);
    try { if (step === 3) setLater(false); if (step === 1 || step === 3) await saveCompany(payload()); setStep(step + 1); } finally { setBusy(false); }
  };
  /** Prices are written to Settings only when the person went through the prices step (the top "Skip setup" never writes them). */
  const finish = async (to: string, withPrices = true) => {
    setBusy(true);
    await saveCompany({ ...payload(), onboarded: true });
    if (withPrices && company?.id && step >= 3) {
      const patch = onboardingSettingsPatch(settings, { trade, skip: later, answers: tr.id === "painting" ? paintingAns : answers, own, depositPct: f.depositPct });
      if (Object.keys(patch).length) await update(patch);
    }
    nav(to, { replace: true });
  };
  const skip = () => finish("/", false);
  const priceLater = async () => { setLater(true); setBusy(true); try { await saveCompany(payload()); setStep(4); } finally { setBusy(false); } };
  const starter = new Map(starterCatalog(tr.id).map((c) => [c.id, c.rate]));
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
          <p className="sub">{t("We'll start you with the right services, job types and texts for your trade.", "Te damos los servicios, tipos de trabajo y textos adecuados para tu oficio.")}</p>
          <div className="choice">{TRADE_LIST.map((x) => <button key={x.id} className={f.trade === x.id ? "on" : ""} onClick={() => pickTrade(x.id)}>{t(x.en, x.es)}</button>)}</div>
          {f.trade !== "custom" && <div className="choice" style={{ marginTop: 14 }}>
            <button className={!blank ? "on" : ""} onClick={() => setBlank(false)}>{t(`Start with the ${tradeById(f.trade).en.toLowerCase()} template`, `Empezar con la plantilla de ${tradeById(f.trade).es.toLowerCase()}`)}</button>
            <button className={blank ? "on" : ""} onClick={() => setBlank(true)}>{t("Start blank — I'll add my own services", "Empezar en blanco — agrego mis servicios")}</button>
          </div>}
          <p className="sub" style={{ marginTop: 10 }}>{blank || f.trade === "custom" ? t("No template: you'll write your own services and prices.", "Sin plantilla: escribirás tus propios servicios y precios.") : t(tradeById(f.trade).hint.en, tradeById(f.trade).hint.es)}</p>
        </>}
        {step === 3 && <>
          {tr.id === "custom" ? <>
            <p className="sub">{t("Add the services you sell, each with a unit and a price. You can add more any time in Settings.", "Agrega los servicios que vendes, cada uno con su unidad y precio. Puedes agregar más cuando quieras en Ajustes.")}</p>
            {own.map((r, i) => (
              <div className="onb-own" key={i}>
                <label className="f">{t("Service name", "Nombre del servicio")}<input value={r.name} onChange={(e) => setOwn(own.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></label>
                <label className="f">{t("Unit", "Unidad")}<input list="tw-units" value={r.unit} onChange={(e) => setOwn(own.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} /></label>
                <label className="f">{t("Price ($)", "Precio ($)")}<input type="number" min="0" value={r.price} onChange={(e) => setOwn(own.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} /></label>
                <button className="btn" type="button" aria-label={t("Remove", "Quitar")} disabled={own.length <= 1} onClick={() => setOwn(own.filter((_, j) => j !== i))}>✕</button>
              </div>))}
            <datalist id="tw-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            <button className="btn" type="button" style={{ marginBottom: 14 }} onClick={() => setOwn([...own, newRow()])}>{t("+ Add another", "+ Agregar otro")}</button>
          </> : <>
            <p className="sub">{tr.id === "painting"
              ? t("Starting prices — change them any time in Settings.", "Precios iniciales — cámbialos cuando quieras en Ajustes.")
              : t("Your main prices. We start you with typical prices — change them any time in Settings.", "Tus precios principales. Empezamos con precios típicos — cámbialos cuando quieras en Ajustes.")}</p>
            <div className="grid2">
              {tr.prices.map((q) => {
                const isP = "pricing" in q.target;
                const val = isP ? (q.id === "door" ? f.door : f.drawer) : answers[q.id] ?? "";
                const ph = "item" in q.target ? String(starter.get(q.target.item) ?? "") : "";
                return <label className="f" key={q.id}>{t(q.en, q.es)}<input type="number" min="0" placeholder={ph} value={val}
                  onChange={(e) => (isP ? setF({ ...f, [q.id]: e.target.value }) : setAnswers({ ...answers, [q.id]: e.target.value }))} /></label>;
              })}
            </div>
          </>}
          <label className="f">{t("Deposit (%)", "Depósito (%)")}<input type="number" min="0" max="100" value={f.depositPct} onChange={set("depositPct")} /></label>
          <button className="link onb-later" type="button" disabled={busy} onClick={priceLater}>{t("I'll set my prices later", "Pondré mis precios después")}</button>
        </>}
        {step === 4 && <p className="sub">{t("Create your first estimate, or look around with a sample job.", "Crea tu primer presupuesto o explora con un trabajo de ejemplo.")}</p>}
        <div className="onb-foot">
          {step === 0 ? (creating ? <span /> : <button className="link" onClick={async () => { await backend.signOut(); nav("/login"); }}>{t("I already have an account", "Ya tengo cuenta")}</button>)
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
