import { num } from "./money";
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDate(iso?: string, lang: "en" | "es" = "en"): string {
  if (!iso) return "—";
  const p = String(iso).split("-");
  if (p.length !== 3) return iso;
  const y = num(p[0]), m = num(p[1]) - 1, d = num(p[2]);
  if (m < 0 || m > 11) return iso;
  return lang === "es" ? `${d} ${MON_ES[m]} ${y}` : `${MON_EN[m]} ${d}, ${y}`;
}
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
export const waLink = (phone: string) => "https://wa.me/" + phone.replace(/\D/g, "");
