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
/** Workers only: their own hours and pay (owners see each worker's from Team). */
export const TIMESHEET: NavItem = { to: "/timesheet", icon: "clock", en: "My pay", es: "Mis pagos" };
export const BOTTOM: NavItem[] = [WORK[0], WORK[1], WORK[2], WORK[3], WORK[4]];
export const MORE: NavItem[] = [WORK[5], WORK[6], WORK[7], WORK[8], BUSINESS[0]];

/* ---------- per-role navigation (permissions live in src/lib/roles.ts) ---------- */
const at = (to: string) => [...WORK, ...BUSINESS].find((i) => i.to === to)!;
/** Sidebar / bottom bar / More sheet for a role. Workers: Calendar + Team + My pay in the bottom bar, Settings under More. */
export function navFor(role: Role | null | undefined) {
  const bottom = role === "worker" ? [at("/calendar"), at("/team"), TIMESHEET] : navFilter(role, BOTTOM);
  return {
    work: role === "worker" ? [...navFilter(role, WORK), TIMESHEET] : navFilter(role, WORK),
    business: navFilter(role, BUSINESS),
    bottom,
    more: navFilter(role, MORE).filter((m) => !bottom.some((b) => b.to === m.to)),
  };
}
