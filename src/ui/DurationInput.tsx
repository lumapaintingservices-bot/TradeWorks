import { hoursOf, hoursSplit } from "../lib/team";
import { useUi } from "../store/ui";
import { NumInput } from "./NumInput";
import "./ui.css";

/** Time worked as hours + minutes (shadcn input group style); the value is hours, kept to the minute (src/lib/team.ts hoursOf). */
export function DurationInput({ value, onChange, label }: { value: number; onChange(hours: number): void; label: string }) {
  const es = useUi((s) => s.lang) === "es";
  const { h, m } = hoursSplit(value);
  return (
    <div className="f dur" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="dur-row">
        <div className="ig"><NumInput step="1" placeholder="8" value={h} aria-label={es ? "Horas" : "Hours"} onChange={(n) => onChange(hoursOf(Math.floor(n), m))} /><span className="ig-a">h</span></div>
        <div className="ig"><NumInput step="1" placeholder="0" value={m} aria-label={es ? "Minutos" : "Minutes"} onChange={(n) => onChange(hoursOf(h, n))} /><span className="ig-a">min</span></div>
      </div>
    </div>
  );
}
