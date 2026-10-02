import { useT } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import { editHistory, hoursText, type HourChange } from "../../lib/team";
import type { HourEntry } from "../../lib/types";
import { useUi } from "../../store/ui";

/**
 * What the owner changed on an hours entry after it was saved: who, when, and each field from -> to. Shown to the owner in the
 * hours window and to the worker under their own entry (they see what changed on their time).
 */
export function HourHistory({ h, nameOf, jobOf, compact }: { h: HourEntry; nameOf?(id: string): string; jobOf?(estId: string): string; compact?: boolean }) {
  const t = useT(), lang = useUi((s) => s.lang);
  const list = editHistory(h);
  if (!list.length) return null;
  const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
  const label: Record<HourChange["field"], string> = { hours: t("time", "tiempo"), date: t("date", "fecha"), rate: t("pay per hour", "pago por hora"), estId: t("job", "trabajo"), note: t("note", "nota"), workerId: t("worker", "trabajador") };
  const val = (c: HourChange, v: unknown) => {
    if (c.field === "hours") return hoursText(num(v));
    if (c.field === "rate") return money(num(v)) + "/h";
    if (c.field === "date") return v ? fmtDate(String(v), lang) : "—";
    if (c.field === "estId") return v ? jobOf?.(String(v)) || t("a job", "un trabajo") : t("no job", "sin trabajo");
    if (c.field === "workerId") return v ? nameOf?.(String(v)) || "—" : "—";
    return String(v || "") || "—";
  };
  // the worker's short version: what changed on their time (a delete that was put back is not news)
  const shown = compact ? list.filter((x) => x.what === "edit" && x.changes.length).slice(-2) : list;
  if (!shown.length) return null;
  return (
    <div className={"hh" + (compact ? " compact" : "")}>
      {!compact && <div className="hh-h">{t("Changes", "Cambios")}</div>}
      {shown.map((x, i) => (
        <div key={i} className="hh-it">
          <span className="hh-who">{when(x.at)} · {x.by || t("Owner", "Dueño")}</span>
          <span>{x.what === "delete" ? t("deleted it", "la borró") : x.what === "restore" ? t("put it back", "la restauró")
            : x.changes.map((c) => `${label[c.field]}: ${val(c, c.from)} → ${val(c, c.to)}`).join(" · ") || t("edited", "editó")}</span>
        </div>))}
    </div>
  );
}
