import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { asInv, type InvoiceRec } from "../lib/invoices";
import { payApply, payModel, type PayDoc } from "../lib/paylink";
import { brandOf, newToken, type Brand } from "../lib/portal";
import { referralLink } from "../lib/clientProfile";
import type { Estimate, Settings } from "../lib/types";
import { useUi } from "../store/ui";
import { useEstimates, useInvoices, useSettings } from "./hooks";
import { deleteTop, patchRec, setTop, subscribeOwned } from "./repo";

export const payLinkOf = (token: string) => `${location.origin}/pay/${token}`;
/** The client's personal referral link, shown on the paid invoice when the referral program is on. */
const refUrlOf = (cid: string, e: Estimate) => (e.clientId ? referralLink(location.origin, cid, e.clientId) : undefined);

type Co = Brand & { id: string };

/** Writes the public copy of one invoice to paylink/{token}. */
export function publishPayLink(v: InvoiceRec, token: string, e: Estimate, s: Settings, company: Co) {
  return setTop("paylink", token, { owner: company.id, invId: v.id, data: JSON.stringify(payModel(v, e, s, brandOf(company), { refUrl: refUrlOf(company.id, e) })) }, true);
}

/** New payment link for an invoice: public copy first, then the token on the invoice. */
export async function createPayLink(v: InvoiceRec, e: Estimate, s: Settings, company: Co): Promise<string> {
  const token = newToken();
  await publishPayLink(v, token, e, s, company);
  await setTop("paylink", token, { client: {} }, true);
  await patchRec(company.id, "invoices", v.id, { pay: { token } });
  return token;
}

/** Turns the link off: the public copy is deleted, so the old address shows "not active". */
export async function removePayLink(v: InvoiceRec, cid: string) {
  if (!v.pay?.token) return;
  await deleteTop("paylink", v.pay.token).catch(() => {});
  await patchRec(cid, "invoices", v.id, { pay: null, payViews: 0 });
}

/** Live public payment-link docs of this company (views, "I paid" claims). */
export function usePayDocs() {
  const { company } = useAuth();
  const [docs, setDocs] = useState<PayDoc[]>([]);
  useEffect(() => { if (company?.id) return subscribeOwned<PayDoc>("paylink", company.id, setDocs); }, [company?.id]);
  return docs;
}

/**
 * Keeps every payment link in step with its invoice, for owners/admins, from anywhere in the app (mounted in the Shell):
 *  - re-publishes the public copy when the invoice, the estimate, the settings or the branding change (e.g. marked paid);
 *  - copies what the client did (views, "I paid by ...") onto the invoice, once, with a toast for a new claim;
 *  - deletes public copies whose invoice was deleted.
 */
export function usePayLinkSync() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const { rows: invRows, loading } = useInvoices();
  const { rows: ests, loading: estLoading } = useEstimates();
  const { settings, loading: setLoading } = useSettings();
  const docs = usePayDocs();
  const busy = useRef(new Set<string>());

  useEffect(() => {
    if (!company || loading || estLoading || setLoading) return;
    const invs = invRows.map(asInv);
    const byToken = new Map(docs.map((d) => [d.id, d]));
    const once = (key: string, fn: () => Promise<unknown>) => {
      if (busy.current.has(key)) return;
      busy.current.add(key);
      fn().catch((err) => console.error("[TradeWorks] payment link sync:", err)).finally(() => busy.current.delete(key));
    };
    for (const v of invs) {
      const token = v.pay?.token;
      if (!token) continue;
      const d = byToken.get(token);
      const e = ests.find((x) => x.id === v.estId);
      if (!d || !e) continue; // not written yet / estimate deleted: leave it alone
      const data = JSON.stringify(payModel(v, e, settings, brandOf(company as Co), { refUrl: refUrlOf(company.id, e) }));
      if (d.data !== data) once("pub:" + token, () => setTop("paylink", token, { data }, true));
      const patch = payApply(v, d.client);
      if (patch) {
        once("apply:" + v.id + ":" + JSON.stringify(patch), () => patchRec(company.id, "invoices", v.id, patch));
        if (patch.payClaim) toast(t(`${v.clientName || "The client"} says ${v.number} was paid by ${patch.payClaim.method}`, `${v.clientName || "El cliente"} dice que pagó ${v.number} por ${patch.payClaim.method}`));
      }
    }
    // orphans: only when the invoice list really loaded (an empty list after a read error must never wipe the links)
    if (invs.length) {
      const live = new Set(invs.map((v) => v.pay?.token).filter(Boolean) as string[]);
      const ids = new Set(invs.map((v) => v.id));
      for (const d of docs) if (!live.has(d.id) && !ids.has(d.invId) && d.data) once("del:" + d.id, () => deleteTop("paylink", d.id));
    }
  }, [company, invRows, ests, settings, docs, loading, estLoading, setLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
