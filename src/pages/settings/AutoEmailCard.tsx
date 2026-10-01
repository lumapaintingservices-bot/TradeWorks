import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useCollection, useSettings } from "../../data/hooks";
import type { Rec } from "../../data/repo";
import { useT } from "../../i18n";
import { AUTO_KINDS, autoKindsOf, isEmail } from "../../lib/autoEmail";
import { DEFAULT_INVOICE_DUE_DAYS } from "../../lib/followups";
import { TPL_LABELS, type TplKey } from "../../lib/messages";
import { useUi } from "../../store/ui";
import { Badge } from "../../ui/Badge";

type Log = Rec & { item?: string; kind?: string; to?: string; subject?: string; status?: string; sentAt?: string; error?: string };

/** Settings card: which reminders the daily worker e-mails by itself, the "overdue after N days" rule, and the recent log. */
export default function AutoEmailCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const lang = useUi((s) => s.lang);
  const { company } = useAuth();
  const { settings, update, loading } = useSettings();
  const { rows: log } = useCollection<Log>("autoemails");
  const [on, setOn] = useState(false);
  const [kinds, setKinds] = useState<TplKey[]>([]);
  const [due, setDue] = useState(String(DEFAULT_INVOICE_DUE_DAYS));
  useEffect(() => {
    if (loading) return;
    setOn(!!settings.autoEmail?.on); setKinds(autoKindsOf(settings)); setDue(String(settings.invoiceDueDays ?? DEFAULT_INVOICE_DUE_DAYS));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => [...log].filter((r) => r.sentAt).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 8), [log]);
  const save = async () => {
    const n = Math.max(1, Math.round(Number(due) || DEFAULT_INVOICE_DUE_DAYS));
    await update({ autoEmail: { on, kinds }, invoiceDueDays: n });
    setDue(String(n));
    toast(t("Saved", "Guardado"));
  };
  const when = (iso?: string) => { const d = new Date(String(iso)); return isNaN(d.getTime()) ? "" : d.toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <div className="card-h"><h2>{t("Automatic reminders by e-mail", "Recordatorios automáticos por correo")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t(
          "Every morning TradeWorks e-mails the reminders you pick below, in each client's language, with the payment link when it's about money. Each reminder goes out once. If the client still hasn't answered 3 days later, it shows up in “Who to write to today” so you can follow up by WhatsApp.",
          "Cada mañana TradeWorks envía por correo los recordatorios que elijas abajo, en el idioma de cada cliente y con el enlace de pago cuando se trata de dinero. Cada recordatorio sale una sola vez. Si a los 3 días el cliente no ha respondido, aparece en “A quién escribirle hoy” para que le escribas por WhatsApp.")}</p>
        <label className="chk" style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <input type="checkbox" role="switch" className="sw" checked={on} onChange={(e) => setOn(e.target.checked)} />{t("Send reminder e-mails automatically", "Enviar recordatorios por correo automáticamente")}</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "6px 14px", marginBottom: 14, opacity: on ? 1 : 0.55 }}>
          {AUTO_KINDS.map((k) => (
            <label className="chk" key={k} style={{ fontSize: 13.5 }}>
              <input type="checkbox" disabled={!on} checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />
              {t(TPL_LABELS[k].en, TPL_LABELS[k].es)}</label>))}
        </div>
        <label className="f">{t("An unpaid invoice is overdue after (days)", "Una factura sin pagar se vence después de (días)")}
          <input type="number" min={1} step={1} inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} style={{ maxWidth: 120, display: "block" }} /></label>
        {on && !isEmail(company?.email) && <p className="iv-warn" style={{ marginTop: 0 }}>{t("Add your business e-mail so clients can reply to you: ", "Agrega el correo de tu negocio para que los clientes te puedan responder: ")}
          <Link to="/settings?section=general">{t("Business info", "Datos del negocio")}</Link></p>}
        <p className="muted" style={{ fontSize: 12.5 }}>{t("Clients without an e-mail only appear in your list. The text is the one in your message templates below.", "Los clientes sin correo solo aparecen en tu lista. El texto es el de tus mensajes de abajo.")}</p>
        <button className="btn pri" onClick={save}>{t("Save", "Guardar")}</button>

        {recent.length > 0 && <>
          <div className="st-lbl" style={{ marginTop: 18 }}>{t("Recent automatic e-mails", "Correos automáticos recientes")}</div>
          {recent.map((r) => (
            <div className="totline dim" key={r.id} style={{ alignItems: "flex-start" }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{r.subject || r.kind} <span className="muted">→ {r.to}</span>
                {r.status !== "sent" && <Badge tone={r.status === "sending" ? "amber" : "red"} spinner={r.status === "sending"} icon={r.status === "sending" ? undefined : "alert"} size="sm" style={{ marginLeft: 6 }}>{r.status === "sending" ? t("sending", "enviando") : t("failed", "falló")}</Badge>}</span>
              <b style={{ whiteSpace: "nowrap" }}>{when(r.sentAt)}</b>
            </div>))}
        </>}
      </div>
    </div>
  );
}
