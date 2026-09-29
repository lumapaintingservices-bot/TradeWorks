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
export const BOTTOM: NavItem[] = [WORK[0], WORK[1], WORK[2], WORK[3], WORK[4]];
export const MORE: NavItem[] = [WORK[5], WORK[6], WORK[7], WORK[8], BUSINESS[0]];
