import { useEffect, useState } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TPL_KEYS, TPL_LABELS, type TplKey } from "../../lib/messages";
import type { MessageTemplates } from "../../lib/types";
import { useUi } from "../../store/ui";

type Draft = Record<TplKey, { en: string; es: string }>;
const fromSettings = (o?: MessageTemplates): Draft =>
  Object.fromEntries(TPL_KEYS.map((k) => [k, { en: o?.[k]?.en?.trim() ? o[k]!.en : DEFAULT_TEMPLATES[k].en, es: o?.[k]?.es?.trim() ? o[k]!.es : DEFAULT_TEMPLATES[k].es }])) as Draft;
const isDefault = (d: Draft, k: TplKey) => d[k].en === DEFAULT_TEMPLATES[k].en && d[k].es === DEFAULT_TEMPLATES[k].es;

/** Settings card: message templates EN/ES with the placeholder legend, plus "follow up after N days". */
export default function MessageTemplatesCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { settings, update, loading } = useSettings();
  const [draft, setDraft] = useState<Draft>(() => fromSettings(settings.messageTemplates));
  const [days, setDays] = useState<string>(String(settings.followUpDays ?? 5));
  const [open, setOpen] = useState<TplKey | null>(null);
  useEffect(() => { if (!loading) { setDraft(fromSettings(settings.messageTemplates)); setDays(String(settings.followUpDays ?? 5)); } }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = TPL_KEYS.some((k) => draft[k].en !== fromSettings(settings.messageTemplates)[k].en || draft[k].es !== fromSettings(settings.messageTemplates)[k].es)
    || Number(days) !== (settings.followUpDays ?? 5);
  const set = (k: TplKey, l: "en" | "es", v: string) => setDraft({ ...draft, [k]: { ...draft[k], [l]: v } });

  async function save() {
    // Only store what differs from the defaults, so future improvements to the defaults still reach untouched templates.
    // A template that was stored before and is now reset is written back as the default text: Firestore merges maps,
    // so leaving the key out would keep the old wording.
    const mt: MessageTemplates = {};
    TPL_KEYS.forEach((k) => { if (!isDefault(draft, k) || settings.messageTemplates?.[k]) mt[k] = { en: draft[k].en, es: draft[k].es }; });
    const n = Math.max(1, Math.round(Number(days) || 5));
    await update({ messageTemplates: mt, followUpDays: n });
    setDays(String(n));
    toast(t("Saved", "Guardado"));
  }

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <div className="card-h"><h2>{t("Messages & follow-ups", "Mensajes y seguimiento")}</h2></div>
      <div className="card-b">
        <label className="f">{t("Flag an estimate after this many days with no answer", "Avisar de un presupuesto después de estos días sin respuesta")}
          <input type="number" min={1} step={1} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} style={{ maxWidth: 120, display: "block" }} /></label>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>
          {t("The pre-written messages you send from “Who to write to today”. Each one is sent in the client's language. You can change the wording here and still edit it before every send.",
            "Los mensajes ya escritos que envías desde “A quién escribirle hoy”. Cada uno sale en el idioma del cliente. Puedes cambiar el texto aquí y aun así editarlo antes de cada envío.")}
        </p>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{t("You can use these placeholders:", "Puedes usar estos campos:")}</div>
        <div className="pills" style={{ marginBottom: 16 }}>{PLACEHOLDERS.map((p) => <code key={p} className="pill" style={{ fontSize: 12 }}>{p}</code>)}</div>
        {TPL_KEYS.map((k) => (
          <div key={k} style={{ borderTop: "1px solid var(--line-2)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <button className="btn sm" style={{ border: 0, boxShadow: "none", background: "none", fontWeight: 600, padding: 0 }} onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                {open === k ? "▾" : "▸"} {t(TPL_LABELS[k].en, TPL_LABELS[k].es)}{!isDefault(draft, k) && <span className="badge b-blue" style={{ marginLeft: 8 }}>{t("edited", "editado")}</span>}
              </button>
              <button className="btn sm" disabled={isDefault(draft, k)} onClick={() => setDraft({ ...draft, [k]: { ...DEFAULT_TEMPLATES[k] } })}>{t("Reset to default", "Volver al original")}</button>
            </div>
            {open === k && (
              <div style={{ marginTop: 10 }}>
                <label className="f">English<textarea rows={10} value={draft[k].en} onChange={(e) => set(k, "en", e.target.value)} style={{ fontSize: 13.5 }} /></label>
                <label className="f">Español<textarea rows={10} value={draft[k].es} onChange={(e) => set(k, "es", e.target.value)} style={{ fontSize: 13.5 }} /></label>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 14 }}><button className="btn pri" disabled={!dirty} onClick={save}>{t("Save", "Guardar")}</button></div>
      </div>
    </div>
  );
}
