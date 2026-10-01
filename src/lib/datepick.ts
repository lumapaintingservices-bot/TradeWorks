/** Date picker helpers (src/ui/DatePicker.tsx). Dates are "YYYY-MM-DD" strings, months "YYYY-MM"; no time zones involved. */
import { addDaysISO, weekStartISO } from "./calendar";

export const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z"));
export const monthOf = (iso: string) => iso.slice(0, 7);

/** "2026-10" + 1 -> "2026-11"; works across years both ways. */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** The 42 days (6 weeks, Sunday first) the month view shows, starting on the Sunday on or before the 1st. */
export function monthGrid(month: string): string[] {
  const start = weekStartISO(month + "-01");
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

/** Is the day allowed by min / max (both optional, inclusive)? */
export const inRange = (iso: string, min?: string, max?: string) => (!min || iso >= min) && (!max || iso <= max);

const asDate = (iso: string) => new Date(iso + "T12:00:00Z");
/** "Thu, Oct 1, 2026" / "jue, 1 oct 2026" for the button. */
export const fmtPicked = (iso: string, lang: "en" | "es") =>
  asDate(iso).toLocaleDateString(lang === "es" ? "es" : "en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "October 2026" / "octubre de 2026" for the header. */
export const fmtMonth = (month: string, lang: "en" | "es") =>
  asDate(month + "-01").toLocaleDateString(lang === "es" ? "es" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
/** Su Mo Tu … / do lu ma … */
export const weekdayShort = (lang: "en" | "es") =>
  monthGrid("2026-02").slice(0, 7).map((iso) => asDate(iso).toLocaleDateString(lang === "es" ? "es" : "en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 2));
