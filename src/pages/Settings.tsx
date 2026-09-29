import { useRole } from "../auth/AuthProvider";
import { can } from "../lib/roles";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useSettings } from "../data/hooks";
import { useT } from "../i18n";
import { Icon } from "../ui/Icon";
import { useUi, type ThemePref } from "../store/ui";
import BillingCard from "./settings/BillingCard";
import MembersCard from "./settings/MembersCard";
import BackupCard from "./settings/BackupCard";
import CalendarCard from "./settings/CalendarCard";
import DiscountsCard from "./settings/DiscountsCard";
import JobTypesCard from "./settings/JobTypesCard";
import LeadSourcesCard from "./settings/LeadSourcesCard";
import MaterialsCard from "./settings/MaterialsCard";
import MessageTemplatesCard from "./settings/MessageTemplatesCard";
import PricingCard from "./settings/PricingCard";
import ProductionCard from "./settings/ProductionCard";
import ServicesCard from "./settings/ServicesCard";
import ShowcaseCard from "./settings/ShowcaseCard";
import "./Settings.css";

function LinkRow({ label, url }: { label: string; url: string }) {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(t("Link copied", "Enlace copiado")); } catch { window.prompt(t("Copy this link", "Copia este enlace"), url); } };
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
        <button className="btn" onClick={copy}>{t("Copy", "Copiar")}</button>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const t = useT();
  const { theme, setTheme, lang, setLang } = useUi();
  const opts: [ThemePref, string, string][] = [["light", "Light", "Claro"], ["dark", "Dark", "Oscuro"], ["auto", "Match device", "Igual al dispositivo"]];
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Appearance & language", "Apariencia e idioma")}</h2></div>
      <div className="card-b">
        <div className="st-lbl">{t("Colors", "Colores")}</div>
        <div className="tabs" style={{ marginBottom: 18 }}>
          {opts.map(([k, en, es]) => <button key={k} className={theme === k ? "on" : ""} onClick={() => setTheme(k)}>{t(en, es)}</button>)}
        </div>
        <div className="st-lbl">{t("App language", "Idioma de la app")}</div>
        <div className="pills">
          {(["en", "es"] as const).map((l) => <button key={l} className={"pill" + (lang === l ? " on" : "")} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}
        </div>
        <p className="muted st-help" style={{ marginBottom: 0 }}>{t("This is only for the menus and buttons. Each client's estimate and invoice open in that client's own language.", "Esto es solo para los menús y botones. El presupuesto y la factura de cada cliente se abren en el idioma de ese cliente.")}</p>
      </div>
    </div>
  );
}

function BusinessCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company, saveCompany } = useAuth();
  const [f, setF] = useState(company ? { name: company.name, phone: company.phone, email: company.email, website: company.website, area: company.area, brandColor: company.brandColor || "#EF6A2C" } : null);
  if (!company || !f) return null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Business info", "Datos del negocio")}</h2><span className="muted st-hint-h">{t("printed on client documents", "sale en los documentos del cliente")}</span></div>
      <div className="card-b">
        <label className="f">{t("Business name", "Nombre del negocio")}<input value={f.name} onChange={set("name")} /></label>
        <div className="grid2">
          <label className="f">{t("Phone", "Teléfono")}<input value={f.phone} inputMode="tel" onChange={set("phone")} /></label>
          <label className="f">{t("Email", "Correo")}<input type="email" value={f.email} onChange={set("email")} /></label>
          <label className="f">{t("Website", "Sitio web")}<input value={f.website} onChange={set("website")} /></label>
          <label className="f">{t("Area served", "Zona de servicio")}<input value={f.area} onChange={set("area")} /></label>
        </div>
        <label className="f">{t("Brand color (client pages and documents)", "Color de marca (páginas y documentos del cliente)")}
          <input type="color" value={f.brandColor} onChange={set("brandColor")} style={{ width: 80, padding: 4 }} /></label>
        <button className="btn pri" disabled={!f.name.trim()} onClick={async () => { await saveCompany({ ...f, name: f.name.trim() }); toast(t("Saved", "Guardado")); }}>{t("Save", "Guardar")}</button>
      </div>
    </div>
  );
}

function ClientLinkCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { settings, update, loading } = useSettings();
  const [f, setF] = useState({ payZelle: "", payZelleName: "", payNote: "", reviewUrl: "", instagramUrl: "" });
  useEffect(() => { if (!loading) setF({ payZelle: settings.payZelle || "", payZelleName: settings.payZelleName || "", payNote: settings.payNote || "", reviewUrl: settings.reviewUrl || "", instagramUrl: settings.instagramUrl || "" }); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Client link & Zelle deposit", "Enlace del cliente y depósito Zelle")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0 }}>{t("After a client signs, they see how to pay the deposit by Zelle. TradeWorks only shows the details — the money goes straight to you.", "Después de firmar, el cliente ve cómo pagar el depósito por Zelle. TradeWorks solo muestra los datos — el dinero va directo a ti.")}</p>
        <div className="grid2">
          <label className="f">{t("Zelle email or phone", "Correo o teléfono de Zelle")}<input value={f.payZelle} onChange={set("payZelle")} /></label>
          <label className="f">{t("Name on the Zelle account", "Nombre en la cuenta Zelle")}<input value={f.payZelleName} onChange={set("payZelleName")} /></label>
        </div>
        <label className="f">{t("Note for the client (optional)", "Nota para el cliente (opcional)")}<input value={f.payNote} onChange={set("payNote")} /></label>
        <div className="grid2">
          <label className="f">{t("Reviews link", "Enlace de reseñas")}<input value={f.reviewUrl} onChange={set("reviewUrl")} /></label>
          <label className="f">Instagram<input value={f.instagramUrl} onChange={set("instagramUrl")} /></label>
        </div>
        <button className="btn pri" onClick={async () => { await update(f); toast(t("Saved", "Guardado")); }}>{t("Save", "Guardar")}</button>
      </div>
    </div>
  );
}

function RequestLinkCard() {
  const t = useT();
  const { company } = useAuth();
  if (!company) return null;
  const base = `${location.origin}/request?c=${company.id}`;
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Request-form link", "Enlace del formulario de solicitud")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0 }}>{t("Share this link (website, Instagram, WhatsApp). Answers arrive in Clients as new requests.", "Comparte este enlace (sitio web, Instagram, WhatsApp). Las respuestas llegan a Clientes como solicitudes nuevas.")}</p>
        <LinkRow label={t("General link", "Enlace general")} url={base} />
        <LinkRow label="Thumbtack" url={`${base}&src=thumbtack`} />
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>{t("Referral links per client are in each client's profile.", "Los enlaces de referidos están en el perfil de cada cliente.")}</p>
      </div>
    </div>
  );
}

function BusinessGate() { return can(useRole(), "settings.business") ? <BusinessCard /> : null; }
function OwnerOnly({ children }: { children: ReactNode }) { return can(useRole(), "billing") ? <>{children}</> : null; }

type Section = { id: string; icon: string; en: string; es: string; descEn: string; descEs: string; body: () => ReactNode };
const SECTIONS: Section[] = [
  { id: "general", icon: "settings", en: "General", es: "General", descEn: "How the app looks and your business details.", descEs: "Cómo se ve la app y los datos de tu negocio.",
    body: () => <><AppearanceCard /><BusinessGate /></> },
  { id: "pricing", icon: "dollar", en: "Prices", es: "Precios", descEn: "What a new estimate starts with: your rates, deposit, tax, discounts and numbering.", descEs: "Con qué empieza un presupuesto nuevo: tus precios, depósito, impuesto, descuentos y numeración.",
    body: () => <><PricingCard /><DiscountsCard /><ServicesCard /></> },
  { id: "profit", icon: "percent", en: "Costs & profit", es: "Costos y ganancia", descEn: "The numbers behind your profit: how long the work takes, what labor costs, and paint and supplies.", descEs: "Los números detrás de tu ganancia: cuánto tarda el trabajo, cuánto cuesta la mano de obra, y la pintura y suministros.",
    body: () => <><ProductionCard /><MaterialsCard /></> },
  { id: "jobtypes", icon: "estimates", en: "Job types", es: "Tipos de trabajo", descEn: "The texts each kind of job starts with.", descEs: "Los textos con que empieza cada tipo de trabajo.",
    body: () => <JobTypesCard /> },
  { id: "leads", icon: "tag", en: "Leads & messages", es: "Clientes y mensajes", descEn: "Where your clients come from and the messages you send them.", descEs: "De dónde vienen tus clientes y los mensajes que les mandas.",
    body: () => <><LeadSourcesCard /><MessageTemplatesCard /></> },
  { id: "client", icon: "send", en: "Client link & Zelle", es: "Enlace del cliente y Zelle", descEn: "What your client sees: payment details, request form and your recent work.", descEs: "Lo que ve tu cliente: datos de pago, formulario de solicitud y tus trabajos recientes.",
    body: () => <><ClientLinkCard /><RequestLinkCard /><ShowcaseCard /></> },
  { id: "calendar", icon: "calendar", en: "Calendar", es: "Calendario", descEn: "Your jobs and tasks in Google, Outlook or Apple calendar.", descEs: "Tus trabajos y tareas en el calendario de Google, Outlook o Apple.",
    body: () => <CalendarCard /> },
  { id: "team", icon: "team", en: "Team & plan", es: "Equipo y plan", descEn: "Who can use your company, and your TradeWorks plan.", descEs: "Quién puede usar tu empresa y tu plan de TradeWorks.",
    body: () => <><MembersCard /><OwnerOnly><BillingCard /></OwnerOnly></> },
  { id: "backup", icon: "inbox", en: "Backup & storage", es: "Copia y almacenamiento", descEn: "Keep a copy of your data safe.", descEs: "Guarda una copia segura de tus datos.",
    body: () => <BackupCard /> },
];

export default function Settings() {
  const t = useT();
  const role = useRole();
  const sections = can(role, "settings.business") ? SECTIONS : SECTIONS.filter((x) => x.id === "general");
  const [params, setParams] = useSearchParams();
  const asked = params.get("section") || (location.hash === "#calendar-link" ? "calendar" : "");
  const sec = sections.find((s) => s.id === asked) || sections[0];
  const go = (id: string) => { setParams({ section: id }, { replace: true }); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (location.hash === "#calendar-link") setTimeout(() => document.getElementById("calendar-link")?.scrollIntoView({ block: "start" }), 50); }, []);

  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("Settings", "Ajustes")}</h1><p>{t("Defaults for new estimates. Existing estimates keep the values they were written with.", "Valores para presupuestos nuevos. Los presupuestos que ya existen conservan sus valores.")}</p></div></div>
      <div className="st-layout">
        <nav className="st-nav" aria-label={t("Settings sections", "Secciones de ajustes")}>
          {sections.map((s) => (
            <button key={s.id} className={"st-nav-i" + (s.id === sec.id ? " on" : "")} aria-current={s.id === sec.id ? "page" : undefined} onClick={() => go(s.id)}>
              <Icon name={s.icon} size={18} /><span>{t(s.en, s.es)}</span>
            </button>
          ))}
        </nav>
        <label className="st-pick">
          <span>{t("Section", "Sección")}</span>
          <select value={sec.id} onChange={(e) => go(e.target.value)}>{sections.map((s) => <option key={s.id} value={s.id}>{t(s.en, s.es)}</option>)}</select>
        </label>
        <div className="st-main">
          <div className="st-intro"><h2>{t(sec.en, sec.es)}</h2><p className="muted">{t(sec.descEn, sec.descEs)}</p></div>
          <div className="st-body" key={sec.id}>{sec.body()}</div>
        </div>
      </div>
    </div>
  );
}
