import { useT } from "../i18n";
import type { EstStatus } from "../lib/types";

const ES: Record<EstStatus, string> = { Draft: "Borrador", Sent: "Enviado", Viewed: "Visto", Accepted: "Aceptado", "Deposit Paid": "Depósito pagado", "Paid in Full": "Pagado", Declined: "Rechazado" };
const TONE: Record<EstStatus, string> = { Draft: "gray", Sent: "blue", Viewed: "purple", Accepted: "green", "Deposit Paid": "teal", "Paid in Full": "green", Declined: "red" };
export const statusLabel = (s: EstStatus, es: boolean) => (es ? ES[s] : s);
export function StatusBadge({ status }: { status: EstStatus }) {
  const t = useT();
  return <span className={`badge b-${TONE[status] || "gray"}`}><i />{t(status, ES[status])}</span>;
}
