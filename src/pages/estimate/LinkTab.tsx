import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { patchTop, setTop } from "../../data/repo";
import { useT } from "../../i18n";
import { calcEstimate, uid } from "../../lib/estimate";
import { waLink } from "../../lib/format";
import { money } from "../../lib/money";
import { newToken, portalSnapshot, sendLinkMessage, type Brand } from "../../lib/portal";
import type { Estimate, Settings } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";

export const brandOf = (c: { name: string; phone: string; email: string; website: string; area: string; logoUrl: string; brandColor: string; address?: string; hours?: string; hoursEs?: string }): Brand =>
  ({ name: c.name, phone: c.phone, email: c.email, website: c.website, area: c.area, logoUrl: c.logoUrl, brandColor: c.brandColor,
    ...(c.address ? { address: c.address } : {}), ...(c.hours ? { hours: c.hours } : {}), ...(c.hoursEs ? { hoursEs: c.hoursEs } : {}) });

export const linkOf = (token: string) => `${location.origin}/p/${token}`;

/** Writes the client-visible copy of the estimate to portal/{token} (owner-only fields stripped). */
export function publishPortal(e: Estimate, s: Settings, company: Parameters<typeof brandOf>[0] & { id: string }) {
  if (!e.portal) return Promise.resolve();
  const snap = portalSnapshot(e, s, brandOf(company), { reviewUrl: s.reviewUrl, websiteUrl: s.websiteUrl, instagramUrl: s.instagramUrl });
  return setTop("portal", e.portal.token, { owner: company.id, estId: e.id, number: e.number, data: JSON.stringify(snap) }, true);
}

export default function LinkTab({ e, set, s }: { e: Estimate; set(p: Partial<Estimate>): void; s: Settings; lang: "en" | "es" }) {
  const t = useT();
  const lang = useUi((x) => x.lang);
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const [send, setSend] = useState(false);
  const [reply, setReply] = useState("");
  const link = e.portal ? linkOf(e.portal.token) : "";
  const tot = calcEstimate(e, s);

  useEffect(() => { if (e.chatUnread) set({ chatUnread: 0 }); }, [e.chatUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const token = newToken();
    const next = { ...e, portal: { token, live: true } };
    await publishPortal(next, s, company!);
    await setTop("portal", token, { client: {} }, true);
    set({ portal: { token, live: true }, activity: [...(e.activity || []), { at: new Date().toISOString(), text: t("Client link created", "Enlace del cliente creado") }] });
    toast(t("Client link created", "Enlace del cliente creado"));
  };
  const markSent = (how: string) => set({ status: e.status === "Draft" ? "Sent" : e.status, sentAt: e.sentAt || new Date().toISOString().slice(0, 10), activity: [...(e.activity || []), { at: new Date().toISOString(), text: t(`Link sent by ${how}`, `Enlace enviado por ${how}`) }] });
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast(t("Copied.", "Copiado."))).catch(() => prompt(t("Copy the link", "Copia el enlace"), link));
  const [body, setBody] = useState("");
  const openSend = () => { setBody(sendLinkMessage(e, money(tot.total), link, company?.name || "", e.docLang)); setSend(true); };
  const sendReply = async () => { const x = reply.trim(); if (!x || !e.portal) return; setReply(""); await patchTop("portal", e.portal.token, { append: { "client.chat": { from: "owner", text: x, at: new Date().toISOString() } } }); };
  const confirmDeposit = () => set({ status: "Deposit Paid", payClaim: undefined, activity: [...(e.activity || []), { at: new Date().toISOString(), text: t("Deposit confirmed", "Depósito confirmado") }] });
  const signed = !!e.signature;

  if (!e.portal) return (
    <div className="card"><div className="card-b">
      <p className="muted" style={{ marginBottom: 14 }}>{t("Send the client a link: they see the estimate on their phone, pick the options, sign and ask questions. Everything they do shows up here.", "Envíale al cliente un enlace: ve el presupuesto en su teléfono, escoge las opciones, firma y hace preguntas. Todo lo que haga aparece aquí.")}</p>
      <button className="btn pri" onClick={create}>{t("Create client link", "Crear enlace del cliente")}</button>
    </div></div>
  );

  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Client link", "Enlace del cliente")}</h2>{signed && <span className="badge b-green"><i />{t("Signed", "Firmado")}</span>}</div><div className="card-b">
        <div className="linkbox">{link}</div>
        <div className="pills" style={{ marginTop: 12 }}>
          <button className="btn pri" onClick={openSend}>{t("Send to client", "Enviar al cliente")}</button>
          <button className="btn" onClick={copy}>{t("Copy link", "Copiar enlace")}</button>
          <a className="btn" href={link} target="_blank" rel="noreferrer">{t("Open", "Abrir")}</a>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>{t(`Opened ${(e.portalViews || []).length} time(s). Changes you make here update the link automatically.`, `Abierto ${(e.portalViews || []).length} vez/veces. Los cambios que hagas aquí actualizan el enlace automáticamente.`)}</p>
      </div></div>

      {e.payClaim && e.status === "Accepted" && (
        <div className="card" style={{ borderColor: "var(--ok)" }}><div className="card-b" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><b>{t("Confirm the deposit", "Confirmar el depósito")}</b><div className="muted" style={{ fontSize: 13 }}>{t(`The client says they sent ${money(tot.deposit)} by ${e.payClaim.method}. Check your bank, then confirm.`, `El cliente dice que envió ${money(tot.deposit)} por ${e.payClaim.method}. Revisa tu banco y confirma.`)}</div></div>
          <button className="btn pri" onClick={confirmDeposit}>{t("Deposit received", "Depósito recibido")}</button></div></div>)}

      <div className="card"><div className="card-h"><h2>{t("Chat", "Chat")}</h2></div><div className="card-b">
        <div className="pt-msgs owner-chat">{(e.chat || []).length === 0 && <p className="muted">{t("No messages yet.", "Aún no hay mensajes.")}</p>}
          {(e.chat || []).map((m, i) => <div key={i} className={"ob" + (m.from === "owner" ? " me" : "")}>{m.text}<small>{new Date(m.at).toLocaleString(lang, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>)}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input value={reply} onChange={(ev) => setReply(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && sendReply()} placeholder={t("Reply to the client…", "Responder al cliente…")} /><button className="btn pri" onClick={sendReply}>{t("Send", "Enviar")}</button></div>
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Activity", "Actividad")}</h2></div><div className="card-b">
        {(e.activity || []).length === 0 && <p className="muted">{t("Nothing yet.", "Aún nada.")}</p>}
        {[...(e.activity || [])].reverse().map((a, i) => <div className="totline dim" key={i}><span>{a.text}</span><b>{new Date(a.at).toLocaleString(lang, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b></div>)}
      </div></div>

      {send && (
        <Modal title={t("Send the link", "Enviar el enlace") + " — " + e.number} onClose={() => setSend(false)}>
          <div className="linkbox">{link}</div>
          <label className="f" style={{ marginTop: 12 }}>{t("Message (in the client's language — edit anything)", "Mensaje (en el idioma del cliente — cambia lo que quieras)")}<textarea rows={8} value={body} onChange={(ev) => setBody(ev.target.value)} /></label>
          <div className="pills">
            <button className="btn" style={{ background: "#12B76A", color: "#fff", borderColor: "#12B76A" }} onClick={() => { window.open(`${waLink(e.phone)}?text=${encodeURIComponent(body)}`, "_blank"); markSent("WhatsApp"); }}>WhatsApp</button>
            <button className="btn" onClick={() => { markSent("SMS"); location.href = `sms:${e.phone.replace(/\D/g, "")}?&body=${encodeURIComponent(body)}`; }}>SMS</button>
            <button className="btn" onClick={() => { markSent(t("email", "correo")); location.href = `mailto:${encodeURIComponent(e.email || "")}?subject=${encodeURIComponent((e.docLang === "es" ? "Su presupuesto " : "Your estimate ") + e.number)}&body=${encodeURIComponent(body)}`; }}>{t("Email", "Correo")}</button>
            <button className="btn" onClick={copy}>{t("Copy link", "Copiar enlace")}</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t("Sending marks the estimate as Sent.", "Al enviarlo, el presupuesto queda como Enviado.")}</p>
        </Modal>)}
    </div>
  );
}
void uid;
