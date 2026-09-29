import { useState } from "react";
import { deleteTop } from "../../data/repo";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { newToken } from "../../lib/portal";
import { useUi } from "../../store/ui";
import { feedUrl, WORKER_BASE } from "./calendarFeed";

/** Settings card: subscribe to your jobs and tasks from Google / Apple / Outlook calendar. */
export default function CalendarCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { settings, update } = useSettings();
  const [busy, setBusy] = useState(false);
  const on = !!(settings.calOn && settings.calToken);
  const token = settings.calToken || "";
  const url = on ? feedUrl(token) : "";
  const webcal = url.replace(/^https?:/, "webcal:");

  const drop = async (tk: string) => { if (tk) { try { await deleteTop("calfeed", tk); } catch { /* already gone */ } } };
  async function turnOn() { setBusy(true); try { await update({ calOn: true, calToken: token || newToken() }); } finally { setBusy(false); } }
  async function turnOff() {
    if (!confirm(t("Turn off the calendar link? Your calendar app will stop receiving updates.", "¿Apagar el enlace de calendario? Tu app de calendario dejará de recibir cambios."))) return;
    setBusy(true);
    try { await drop(token); await update({ calOn: false, calToken: "" }); toast(t("Calendar link turned off", "Enlace de calendario apagado")); } finally { setBusy(false); }
  }
  async function renew() {
    if (!confirm(t("Make a new link? You will need to add the new one to your calendar again.", "¿Crear un enlace nuevo? Tendrás que agregar el nuevo a tu calendario otra vez."))) return;
    setBusy(true);
    try { await drop(token); await update({ calOn: true, calToken: newToken() }); } finally { setBusy(false); }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(t("Link copied", "Enlace copiado")); } catch { window.prompt(t("Copy this link", "Copia este enlace"), url); } };

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }} id="calendar-link">
      <div className="card-h"><h2>{t("Calendar link", "Enlace de calendario")}</h2><span className="muted" style={{ fontSize: 12.5 }}>Google · Outlook · Apple</span></div>
      <div className="card-b">
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          {t("Your jobs and tasks show up in your own calendar and update by themselves. Your calendar app sends the reminders: 8 PM the day before a job, 1 hour before a task.",
            "Tus trabajos y tareas salen en tu propio calendario y se actualizan solos. Tu calendario te manda los recordatorios: 8 PM el día antes de un trabajo, 1 hora antes de una tarea.")}
        </p>
        {!WORKER_BASE ? (
          <p className="muted" style={{ fontSize: 13 }}>
            {t("The calendar service is not set up yet, so the automatic link is not available. For now, open the Calendar, tap a day and use “+ Google” or “+ Outlook/Apple” on each job.",
              "El servicio de calendario aún no está instalado, así que el enlace automático no está disponible. Por ahora abre el Calendario, toca un día y usa “+ Google” o “+ Outlook/Apple” en cada trabajo.")}
          </p>
        ) : (
          <>
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" style={{ width: 18, height: 18 }} checked={on} disabled={busy} onChange={(e) => (e.target.checked ? turnOn() : turnOff())} />
              {t("Subscribe from Google / Apple / Outlook calendar", "Suscribir desde el calendario de Google / Apple / Outlook")}
            </label>
            {on && (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 240px", minWidth: 0 }} />
                  <button className="btn" onClick={copy}>{t("Copy link", "Copiar enlace")}</button>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <a className="btn sm pri" target="_blank" rel="noopener" href={"https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal)}>{t("Add to Google Calendar", "Agregar a Google Calendar")}</a>
                  <a className="btn sm" href={webcal}>{t("Apple / Outlook", "Apple / Outlook")}</a>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, margin: "18px 0 6px" }}>{t("How to add it", "Cómo agregarlo")}</div>
                <ol className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                  <li>{t("Tap “Copy link” above.", "Toca “Copiar enlace” arriba.")}</li>
                  <li><b>Google:</b> {t("on a computer open calendar.google.com. Next to “Other calendars” tap +, choose “From URL”, paste the link and tap “Add calendar”.", "en una computadora abre calendar.google.com. Junto a “Otros calendarios” toca +, elige “Desde URL”, pega el enlace y toca “Agregar calendario”.")}</li>
                  <li><b>iPhone / Mac:</b> {t("Tap “Apple / Outlook” above and confirm “Subscribe”. Or: Settings > Calendar > Accounts > Add Account > Other > Add Subscribed Calendar, and paste the link.", "Toca “Apple / Outlook” arriba y confirma “Suscribirse”. O: Ajustes > Calendario > Cuentas > Añadir cuenta > Otra > Añadir calendario suscrito, y pega el enlace.")}</li>
                  <li><b>Outlook:</b> {t("Calendar > Add calendar > Subscribe from web, paste the link and tap Import.", "Calendario > Agregar calendario > Suscribirse desde la web, pega el enlace y toca Importar.")}</li>
                  <li>{t("Done. New jobs and tasks appear on their own; Google can take a few hours to refresh.", "Listo. Los trabajos y tareas nuevos aparecen solos; Google puede tardar unas horas en actualizar.")}</li>
                </ol>
                <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn sm" disabled={busy} onClick={renew}>{t("Make a new private link", "Crear un enlace privado nuevo")}</button>
                  <button className="btn sm danger" disabled={busy} onClick={turnOff}>{t("Turn off", "Apagar")}</button>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t("Anyone with this link can see your schedule. If you shared it by mistake, make a new one; the old one stops working.", "Cualquiera con este enlace puede ver tu agenda. Si lo compartiste por error, crea uno nuevo; el anterior deja de funcionar.")}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
