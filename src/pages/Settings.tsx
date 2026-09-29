import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useSettings } from "../data/hooks";
import CalendarCard from "./settings/CalendarCard";
import { useT } from "../i18n";
import { useUi, type ThemePref } from "../store/ui";

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

function BusinessCard() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company, saveCompany } = useAuth();
  const [f, setF] = useState(company ? { name: company.name, phone: company.phone, email: company.email, website: company.website, area: company.area, brandColor: company.brandColor || "#EF6A2C" } : null);
  if (!company || !f) return null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <div className="card-h"><h2>{t("Business info", "Datos del negocio")}</h2></div>
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
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
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

export default function Settings() {
  const t = useT();
  const { theme, setTheme } = useUi();
  const { company } = useAuth();
  const base = company ? `${location.origin}/request?c=${company.id}` : "";
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
      <BusinessCard />
      <ClientLinkCard />
      <CalendarCard />
      {company && (
        <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
          <div className="card-h"><h2>{t("Request-form link", "Enlace del formulario de solicitud")}</h2></div>
          <div className="card-b">
            <p className="muted" style={{ marginTop: 0 }}>{t("Share this link (website, Instagram, WhatsApp). Answers arrive in Clients as new requests.", "Comparte este enlace (sitio web, Instagram, WhatsApp). Las respuestas llegan a Clientes como solicitudes nuevas.")}</p>
            <LinkRow label={t("General link", "Enlace general")} url={base} />
            <LinkRow label="Thumbtack" url={`${base}&src=thumbtack`} />
            <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>{t("Referral links per client come later.", "Los enlaces de referidos por cliente vienen después.")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
