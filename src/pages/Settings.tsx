import { useRole } from "../auth/AuthProvider";
import { can } from "../lib/roles";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prepareLogo } from "../lib/image";
import { PAY_METHODS, PAY_METHOD_KEYS, payMethodsOf } from "../lib/payMethods";
import { deleteImage, putImage } from "../lib/storage";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
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
import AutoEmailCard from "./settings/AutoEmailCard";
import ReferralCard from "./settings/ReferralCard";
import PricingCard from "./settings/PricingCard";
import ProductionCard from "./settings/ProductionCard";
import CatalogCard, { TradeCard } from "./settings/CatalogCard";
import ShowcaseCard from "./settings/ShowcaseCard";
import CardPayCard from "./settings/CardPayCard";
import { ask } from "../ui/confirm";
import { PhoneInput } from "../ui/PhoneInput";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
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
  const { theme, lang, setLang } = useUi();
  const opts: [ThemePref, string, string][] = [["light", "Light", "Claro"], ["dark", "Dark", "Oscuro"], ["auto", "Match device", "Igual al dispositivo"]];
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Appearance & language", "Apariencia e idioma")}</h2></div>
      <div className="card-b">
        <div className="st-lbl">{t("Colors", "Colores")}</div>
        <div className="st-theme"><ThemeSwitcher /><span>{(() => { const o = opts.find(([k]) => k === theme); return o ? t(o[1], o[2]) : ""; })()}</span></div>
        <div className="st-lbl">{t("App language", "Idioma de la app")}</div>
        <div className="pills">
          {(["en", "es"] as const).map((l) => <button key={l} className={"pill" + (lang === l ? " on" : "")} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}
        </div>
        <p className="muted st-help" style={{ marginBottom: 0 }}>{t("This is only for the menus and buttons. Each client's estimate and invoice open in that client's own language.", "Esto es solo para los menús y botones. El presupuesto y la factura de cada cliente se abren en el idioma de ese cliente.")}</p>
      </div>
    </div>
  );
}

function LogoBox() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company, saveCompany } = useAuth();
  const [trim, setTrim] = useState(true);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!company) return null;
  const path = `companies/${company.id}/logo/logo.png`;
  async function pick(f?: File | null) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast(t("That file is not an image.", "Ese archivo no es una imagen.")); return; }
    setBusy(true);
    try {
      const data = await prepareLogo(f, trim);
      const { url } = await putImage(path, data);
      await saveCompany({ name: company!.name, logoUrl: url });
      toast(t("Logo saved", "Logo guardado"));
    } catch { toast(t("Couldn't save the logo. Check your connection and try again.", "No se pudo guardar el logo. Revisa tu conexión e inténtalo de nuevo.")); }
    setBusy(false);
    if (file.current) file.current.value = "";
  }
  async function remove() {
    if (!await ask(t("Remove your logo?", "¿Quitar tu logo?"))) return;
    setBusy(true);
    try { await saveCompany({ name: company!.name, logoUrl: "" }); await deleteImage(path); toast(t("Logo removed", "Logo quitado")); } catch { toast(t("Couldn't remove it. Try again.", "No se pudo quitar. Inténtalo de nuevo.")); }
    setBusy(false);
  }
  return (
    <div className="logo-box" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <div style={{ width: 120, height: 84, border: "1px dashed var(--line)", borderRadius: 12, display: "grid", placeItems: "center", overflow: "hidden", background: "var(--bg-2, transparent)" }}>
        {company.logoUrl ? <img src={company.logoUrl} alt={t("Logo", "Logo")} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="muted" style={{ fontSize: 12, textAlign: "center", padding: 6 }}>{t("No logo yet", "Todavía sin logo")}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>{t("Your logo", "Tu logo")}</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 9 }}>{t("Upload a file at any size — it is resized to 600px automatically. PNG or JPG. It shows on your estimates, invoices, client link and request form.", "Sube un archivo de cualquier tamaño — se ajusta a 600px automáticamente. PNG o JPG. Sale en tus presupuestos, facturas, enlace del cliente y formulario de solicitud.")}</div>
        <label className="chk" style={{ marginBottom: 10 }}><input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />{t("Trim the white background and empty margins", "Quitar el fondo blanco y los márgenes vacíos")}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>{busy ? t("Processing…", "Procesando…") : company.logoUrl ? t("Replace logo", "Cambiar logo") : t("Upload logo", "Subir logo")}</button>
          {company.logoUrl && <button type="button" className="btn danger" disabled={busy} onClick={remove}>{t("Remove", "Quitar")}</button>}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Danger zone: the person who created the company can delete it (and only it), after typing its name. */
function DeleteCompanyCard() {
  const t = useT();
  const { user, company } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!company || !user || company.ownerUid !== user.uid) return null;
  const ok = text.trim() === company.name.trim();
  const run = async () => {
    if (!ok) return;
    if (!await ask(t(`Delete "${company.name}" and everything in it? This cannot be undone.`, `¿Borrar "${company.name}" y todo lo que tiene? No se puede deshacer.`))) return;
    setBusy(true); setErr("");
    try { await backend.deleteCompany(user.uid, company.id); window.location.assign("/"); }
    catch { setErr(t("Could not delete it. Try again.", "No se pudo borrar. Inténtalo de nuevo.")); setBusy(false); }
  };
  return (
    <div className="card" style={{ borderColor: "var(--bad)" }}>
      <div className="card-h"><h2 style={{ color: "var(--bad)" }}>{t("Delete this company", "Borrar esta empresa")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0 }}>{t("This deletes ONLY this company: its clients, estimates, invoices, expenses, team, photos, client links and requests. Your other companies and your account are not touched. It cannot be undone — download a backup first.", "Esto borra SOLO esta empresa: sus clientes, presupuestos, facturas, gastos, equipo, fotos, enlaces y solicitudes. Tus otras empresas y tu cuenta no se tocan. No se puede deshacer — descarga una copia primero.")}</p>
        <label className="f">{t(`Type the company name (${company.name}) to confirm`, `Escribe el nombre de la empresa (${company.name}) para confirmar`)}<input value={text} onChange={(e) => setText(e.target.value)} /></label>
        {err && <p className="st-err" role="alert">{err}</p>}
        <button className="btn danger" disabled={!ok || busy} onClick={run}>{busy ? t("Deleting…", "Borrando…") : t("Delete company", "Borrar empresa")}</button>
      </div>
    </div>
  );
}

function BusinessCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company, saveCompany } = useAuth();
  const [f, setF] = useState(company ? { name: company.name, phone: company.phone, email: company.email, website: company.website, area: company.area, address: company.address || "", hours: company.hours || "", hoursEs: company.hoursEs || "", brandColor: company.brandColor || "#EF6A2C" } : null);
  if (!company || !f) return null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Business info", "Datos del negocio")}</h2><span className="muted st-hint-h">{t("printed on client documents", "sale en los documentos del cliente")}</span></div>
      <div className="card-b">
        <LogoBox />
        <label className="f">{t("Business name", "Nombre del negocio")}<input value={f.name} onChange={set("name")} /></label>
        <div className="grid2">
          <label className="f">{t("Phone", "Teléfono")}<PhoneInput value={f.phone} onChange={(v) => set("phone")({ target: { value: v } })} /></label>
          <label className="f">{t("Email", "Correo")}<input type="email" value={f.email} onChange={set("email")} /></label>
          <label className="f">{t("Website", "Sitio web")}<input value={f.website} onChange={set("website")} /></label>
          <label className="f">{t("Area served", "Zona de servicio")}<input value={f.area} onChange={set("area")} /></label>
        </div>
        <label className="f">{t("Business address", "Dirección del negocio")}<input value={f.address} placeholder="4401 NW 87th Ave, Doral, FL 33178" onChange={set("address")} /></label>
        <div className="grid2">
          <label className="f">{t("Opening hours (English)", "Horario (inglés)")}<input value={f.hours} placeholder="Mon–Fri 9am–7pm · Sat–Sun 10am–4pm" onChange={set("hours")} /></label>
          <label className="f">{t("Opening hours (Spanish)", "Horario (español)")}<input value={f.hoursEs} placeholder="Lun–Vie 9am–7pm · Sáb–Dom 10am–4pm" onChange={set("hoursEs")} /></label>
        </div>
        <label className="f">{t("Brand color (client pages and documents)", "Color de marca (páginas y documentos del cliente)")}
          <input type="color" value={f.brandColor} onChange={set("brandColor")} style={{ width: 80, padding: 4 }} /></label>
        <button className="btn pri" disabled={!f.name.trim()} onClick={async () => { await saveCompany({ ...f, name: f.name.trim() }); toast(t("Saved", "Guardado")); }}>{t("Save", "Guardar")}</button>
      </div>
    </div>
  );
}

/** Deposit at signing: company default (each estimate can change it in Pricing). */
function DepositCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { settings, update } = useSettings();
  const on = !!settings.depositAtSign;
  return (
    <div className="card">
      <div className="card-h"><h2>{t("Deposit when the client signs", "Depósito al firmar")}</h2>
        <label className="chk"><input type="checkbox" role="switch" className="sw" checked={on} onChange={async (ev) => { await update({ depositAtSign: ev.target.checked, ...(ev.target.checked ? { depositAtSignSince: new Date().toISOString() } : {}) }); toast(t("Saved", "Guardado")); }} />{on ? t("On", "Activo") : t("Off", "Apagado")}</label></div>
      <div className="card-b"><p className="muted" style={{ margin: 0 }}>
        {on ? t("Right after signing, the client is asked to pay the first payment: TradeWorks creates the job's invoices and the client gets a “Pay the deposit” button with all your ways to pay (and card, if it's on).",
              "Justo al firmar se le pide al cliente el primer pago: TradeWorks crea las facturas del trabajo y el cliente ve un botón “Pagar depósito” con todas tus formas de pago (y tarjeta, si está activa).")
            : t("After signing, the client only sees “Thank you” and the payment schedule. You bill each payment with an invoice when it's due.",
              "Al firmar, el cliente solo ve “Gracias” y el calendario de pagos. Cobras cada pago con una factura cuando toca.")}
        {" "}{t("You can change it on each estimate (Pricing).", "Lo puedes cambiar en cada presupuesto (Precios).")}</p></div>
    </div>
  );
}

function ClientLinkCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { settings, update, loading } = useSettings();
  const [f, setF] = useState({ payZelle: "", payZelleName: "", payNote: "", reviewUrl: "", instagramUrl: "" });
  const [methods, setMethods] = useState<string[]>(PAY_METHOD_KEYS);
  const [h, setH] = useState({ venmo: "", cashapp: "", paypal: "", checkTo: "" });
  useEffect(() => {
    if (!loading) {
      setF({ payZelle: settings.payZelle || "", payZelleName: settings.payZelleName || "", payNote: settings.payNote || "", reviewUrl: settings.reviewUrl || "", instagramUrl: settings.instagramUrl || "" });
      const ph = settings.payHandles || {};
      setH({ venmo: ph.venmo || "", cashapp: ph.cashapp || "", paypal: ph.paypal || "", checkTo: ph.checkTo || "" });
    }
    setMethods(payMethodsOf(settings.payMethods));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setHandle = (k: keyof typeof h) => (e: { target: { value: string } }) => setH({ ...h, [k]: e.target.value });
  const save = async () => {
    const payHandles = { venmo: h.venmo.trim(), cashapp: h.cashapp.trim(), paypal: h.paypal.trim(), checkTo: h.checkTo.trim() };
    await update({ ...f, payMethods: PAY_METHOD_KEYS.filter((k) => methods.includes(k)), payHandles });
    toast(t("Saved", "Guardado"));
  };
  return (
    <div className="card">
      <div className="card-h"><h2>{t("How clients pay you", "Cómo te pagan tus clientes")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0 }}>{t("Shown on your documents and on each invoice's payment link (and after signing, when you ask for a deposit). TradeWorks only shows the details — the money goes straight to you.", "Se muestra en tus documentos y en el enlace de pago de cada factura (y al firmar, si pides depósito). TradeWorks solo muestra los datos — el dinero va directo a ti.")}</p>
        <div className="grid2">
          <label className="f">{t("Zelle email or phone", "Correo o teléfono de Zelle")}<input value={f.payZelle} onChange={set("payZelle")} /></label>
          <label className="f">{t("Name on the Zelle account", "Nombre en la cuenta Zelle")}<input value={f.payZelleName} onChange={set("payZelleName")} /></label>
          <label className="f">{t("Venmo username (optional)", "Usuario de Venmo (opcional)")}<input value={h.venmo} placeholder="@yourbusiness" onChange={setHandle("venmo")} /></label>
          <label className="f">{t("Cash App $cashtag (optional)", "$cashtag de Cash App (opcional)")}<input value={h.cashapp} placeholder="$yourbusiness" onChange={setHandle("cashapp")} /></label>
          <label className="f">{t("PayPal.me link or name (optional)", "Enlace o nombre de PayPal.me (opcional)")}<input value={h.paypal} placeholder="paypal.me/yourbusiness" onChange={setHandle("paypal")} /></label>
          <label className="f">{t("Checks payable to (optional)", "Cheques a nombre de (opcional)")}<input value={h.checkTo} onChange={setHandle("checkTo")} /></label>
        </div>
        <div className="f"><span>{t("Payment methods shown on documents", "Formas de pago que salen en los documentos")}</span>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            {PAY_METHOD_KEYS.map((k) => <label className="chk" key={k}><input type="checkbox" checked={methods.includes(k)} onChange={(e) => setMethods(e.target.checked ? [...methods, k] : methods.filter((x) => x !== k))} />{t(PAY_METHODS[k][0], PAY_METHODS[k][1])}</label>)}
          </div></div>
        <label className="f">{t("Note for the client (optional)", "Nota para el cliente (opcional)")}<input value={f.payNote} onChange={set("payNote")} /></label>
        <div className="grid2">
          <label className="f">{t("Reviews link", "Enlace de reseñas")}<input value={f.reviewUrl} onChange={set("reviewUrl")} /></label>
          <label className="f">Instagram<input value={f.instagramUrl} onChange={set("instagramUrl")} /></label>
        </div>
        <button className="btn pri" onClick={save}>{t("Save", "Guardar")}</button>
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
    body: () => <><AppearanceCard /><BusinessGate /><OwnerOnly><DeleteCompanyCard /></OwnerOnly></> },
  { id: "pricing", icon: "dollar", en: "Prices", es: "Precios", descEn: "What a new estimate starts with: your rates, deposit, tax, discounts and numbering.", descEs: "Con qué empieza un presupuesto nuevo: tus precios, depósito, impuesto, descuentos y numeración.",
    body: () => <><PricingCard /><DiscountsCard /></> },
  { id: "services", icon: "tag", en: "Services & prices", es: "Servicios y precios", descEn: "Your trade and your own priced services, picked on every estimate.", descEs: "Tu oficio y tus servicios con precio, que eliges en cada presupuesto.",
    body: () => <><TradeCard /><CatalogCard /></> },
  { id: "profit", icon: "percent", en: "Costs & profit", es: "Costos y ganancia", descEn: "The numbers behind your profit: how long the work takes, what labor costs, and paint and supplies.", descEs: "Los números detrás de tu ganancia: cuánto tarda el trabajo, cuánto cuesta la mano de obra, y la pintura y suministros.",
    body: () => <><ProductionCard /><MaterialsCard /></> },
  { id: "jobtypes", icon: "estimates", en: "Job types", es: "Tipos de trabajo", descEn: "The texts each kind of job starts with.", descEs: "Los textos con que empieza cada tipo de trabajo.",
    body: () => <JobTypesCard /> },
  { id: "leads", icon: "tag", en: "Leads & messages", es: "Clientes y mensajes", descEn: "Where your clients come from and the messages you send them.", descEs: "De dónde vienen tus clientes y los mensajes que les mandas.",
    body: () => <><LeadSourcesCard /><ReferralCard /><AutoEmailCard /><MessageTemplatesCard /></> },
  { id: "client", icon: "send", en: "Client link & payments", es: "Enlace del cliente y pagos", descEn: "What your client sees: how to pay you, request form and your recent work.", descEs: "Lo que ve tu cliente: cómo pagarte, formulario de solicitud y tus trabajos recientes.",
    body: () => <><DepositCard /><ClientLinkCard /><CardPayCard /><RequestLinkCard /><ShowcaseCard /></> },
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
  const only = sections.length === 1; // workers: just language & appearance, no section menu
  const go = (id: string) => { setParams({ section: id }, { replace: true }); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (location.hash === "#calendar-link") setTimeout(() => document.getElementById("calendar-link")?.scrollIntoView({ block: "start" }), 50); }, []);

  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("Settings", "Ajustes")}</h1><p>{only ? t("Your language and how the app looks.", "Tu idioma y cómo se ve la app.") : t("Defaults for new estimates. Existing estimates keep the values they were written with.", "Valores para presupuestos nuevos. Los presupuestos que ya existen conservan sus valores.")}</p></div></div>
      <div className={"st-layout" + (only ? " only" : "")}>
        {!only && <nav className="st-nav" aria-label={t("Settings sections", "Secciones de ajustes")}>
          {sections.map((s) => (
            <button key={s.id} className={"st-nav-i" + (s.id === sec.id ? " on" : "")} aria-current={s.id === sec.id ? "page" : undefined} onClick={() => go(s.id)}>
              <Icon name={s.icon} size={18} /><span>{t(s.en, s.es)}</span>
            </button>
          ))}
        </nav>}
        {!only && <label className="st-pick">
          <span>{t("Section", "Sección")}</span>
          <select value={sec.id} onChange={(e) => go(e.target.value)}>{sections.map((s) => <option key={s.id} value={s.id}>{t(s.en, s.es)}</option>)}</select>
        </label>}
        <div className="st-main">
          {!only && <div className="st-intro"><h2>{t(sec.en, sec.es)}</h2><p className="muted">{t(sec.descEn, sec.descEs)}</p></div>}
          <div className="st-body" key={sec.id}>{sec.body()}</div>
        </div>
      </div>
    </div>
  );
}
