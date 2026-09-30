/** Job status — port of jobStatus: invoices override the estimate's own status. Pure; imported by followups and referrals. */
import type { EstStatus, Estimate, Invoice } from "./types";

export const invoicesOf = (invoices: Invoice[], estId: string) => invoices.filter((v) => v.estId === estId);
export const mainInvoicesOf = (invoices: Invoice[], estId: string) => invoicesOf(invoices, estId).filter((v) => v.kind !== "co");
export function jobStatus(e: Pick<Estimate, "id" | "status">, invoices: Invoice[] = []): EstStatus {
  const invs = invoicesOf(invoices, e.id);
  if (invs.length) {
    if (invs.every((v) => v.status === "Paid")) return "Paid in Full";
    if (invs.some((v) => v.status === "Paid")) return "Deposit Paid";
  }
  return e.status || "Draft";
}
