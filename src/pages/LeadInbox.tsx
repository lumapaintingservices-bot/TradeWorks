import { useLeadInbox } from "../data/leads";
import { useT } from "../i18n";
import { leadSummary } from "../lib/leads";
import { useUi } from "../store/ui";
import { ask } from "../ui/confirm";
import "./LeadInbox.css";

const ago = (iso: string | undefined, es: boolean) => {
  const ms = Date.now() - new Date(iso || "").getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 60) return es ? `hace ${Math.max(1, m)} min` : `${Math.max(1, m)} min ago`;
  if (h < 24) return es ? `hace ${h} h` : `${h} h ago`;
  return es ? `hace ${d} d` : `${d} d ago`;
};

/** Banner at the top of Clients: new requests from the public form, ready to import. */
export function LeadInbox() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { pending, importLead, importAll, dismiss, busy } = useLeadInbox();
  if (!pending.length) return null;
  return (
    <div className="card lead-inbox">
      <div className="card-h">
        <h2>{t(`${pending.length} new ${pending.length === 1 ? "request" : "requests"} from your website`, `${pending.length} ${pending.length === 1 ? "solicitud nueva" : "solicitudes nuevas"} desde tu sitio web`)}</h2>
        {pending.length > 1 && <button className="btn pri sm" disabled={busy} onClick={importAll}>{t("Import all", "Importar todas")}</button>}
      </div>
      <div className="li-list">
        {pending.map((l) => (
          <div key={l.id} className="li-row">
            <div className="li-main">
              <div className="li-top"><b>{l.name}</b><span className="muted">{ago(l.at, lang === "es")}</span></div>
              <div className="muted li-sub">{[l.service, l.city].filter(Boolean).join(" · ")}</div>
              <div className="li-chips">{leadSummary(l.details, lang).slice(0, 6).map((s, i) => <span key={i} className="pill">{s}</span>)}</div>
            </div>
            <div className="li-act">
              <button className="btn pri sm" disabled={busy} onClick={() => importLead(l)}>{t("Import", "Importar")}</button>
              <button className="btn danger sm" disabled={busy} onClick={async () => { if (await ask(t("Delete this request?", "¿Eliminar esta solicitud?"))) dismiss(l); }}>{t("Dismiss", "Descartar")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
