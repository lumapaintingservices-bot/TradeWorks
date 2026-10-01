import { navFilter, type Role } from "../lib/roles";
export type NavItem = { to: string; icon: string; en: string; es: string };
export const WORK: NavItem[] = [
  { to: "/", icon: "dashboard", en: "Dashboard", es: "Panel" },
  { to: "/pipeline", icon: "pipeline", en: "Pipeline", es: "Embudo" },
  { to: "/calendar", icon: "calendar", en: "Calendar", es: "Calendario" },
  { to: "/estimates", icon: "estimates", en: "Estimates", es: "Presupuestos" },
  { to: "/invoices", icon: "invoices", en: "Invoices", es: "Facturas" },
  { to: "/clients", icon: "clients", en: "Clients", es: "Clientes" },
  { to: "/expenses", icon: "expenses", en: "Expenses", es: "Gastos" },
  { to: "/reports", icon: "reports", en: "Reports", es: "Reportes" },
  { to: "/team", icon: "team", en: "Team", es: "Equipo" },
];
export const BUSINESS: NavItem[] = [{ to: "/settings", icon: "settings", en: "Settings", es: "Ajustes" }];
/** Job team chats (owner + the workers of each job). */
export const CHATS: NavItem = { to: "/chats", icon: "chat", en: "Chats", es: "Chats" };
/** Notes board (owners / admins only). */
export const NOTES: NavItem = { to: "/notes", icon: "note", en: "Notes", es: "Notas" };
/** Workers only: the jobs they are on the crew of (their home). */
export const MY_JOBS: NavItem = { to: "/jobs", icon: "briefcase", en: "Jobs", es: "Trabajos" };
/** Workers only: their own hours and pay (owners see each worker's from Team). */
export const TIMESHEET: NavItem = { to: "/timesheet", icon: "clock", en: "My pay", es: "Mis pagos" };
export const BOTTOM: NavItem[] = [WORK[0], WORK[1], WORK[2], WORK[3], WORK[4]];
export const MORE: NavItem[] = [WORK[5], WORK[6], WORK[7], WORK[8], CHATS, NOTES, BUSINESS[0]];

/* ---------- per-role navigation (permissions live in src/lib/roles.ts) ---------- */
const at = (to: string) => [...WORK, ...BUSINESS].find((i) => i.to === to)!;
/** Sidebar / bottom bar / More sheet for a role. Workers: My jobs + Calendar + Team + Chats + My pay in the bottom bar, Settings under More. */
export function navFor(role: Role | null | undefined) {
  const bottom = role === "worker" ? [MY_JOBS, at("/calendar"), at("/team"), CHATS, TIMESHEET] : navFilter(role, BOTTOM);
  return {
    work: role === "worker" ? [MY_JOBS, ...navFilter(role, WORK), CHATS, TIMESHEET] : [...navFilter(role, WORK), ...navFilter(role, [CHATS, NOTES])],
    business: navFilter(role, BUSINESS),
    bottom,
    more: navFilter(role, MORE).filter((m) => !bottom.some((b) => b.to === m.to)),
  };
}
