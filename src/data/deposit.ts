import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { depositPayFor, needsDepositLink } from "../lib/deposit";
import { createInvoices, mainInvoicesFor, type InvoiceRec } from "../lib/invoices";
import type { Invoice } from "../lib/types";
import { useUi } from "../store/ui";
import { publishPortal } from "../pages/estimate/LinkTab";
import { useEstimates, useInvoices, useSettings } from "./hooks";
import { createPayLink } from "./paylinks";
import type { Rec } from "./repo";

/**
 * Owner / admin app (mounted in the Shell). Deposit at signing (src/lib/deposit.ts):
 *  - a client signed a job that asks for a deposit: create the job's invoices (if none yet) and a payment link for the first
 *    one, then republish the client link so it shows "Pay the deposit";
 *  - keeps the client link's deposit box current (link made, deposit paid) even when the estimate editor is closed.
 */
export function useDepositOnSign() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { role, company } = useAuth();
  const on = role === "owner" || role === "admin";
  const { rows: ests, loading: l1 } = useEstimates();
  const { rows: invRows, loading: l2, save: saveInv } = useInvoices();
  const { settings, update, loading: l3 } = useSettings();
  const busy = useRef(new Set<string>());
  const published = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!on || !company || l1 || l2 || l3) return;
    const all = invRows as unknown as InvoiceRec[];
    for (const e of ests) {
      if (busy.current.has(e.id)) continue;
      if (needsDepositLink(e, settings, all)) {
        busy.current.add(e.id);
        (async () => {
          let list = all, first = mainInvoicesFor(all, e.id)[0], made = 0;
          if (!first) {
            const r = createInvoices(e, settings, all);
            if (!r.ok) return;
            for (const v of r.invoices) await saveInv(v as unknown as Invoice & Rec);
            await update({ numbering: { ...settings.numbering, nextInv: r.nextInv } });
            list = [...all, ...r.invoices]; first = mainInvoicesFor(list, e.id)[0]; made = r.invoices.length;
          }
          const token = await createPayLink(first, e, settings, company);
          list = list.map((v) => (v.id === first.id ? { ...v, pay: { token } } : v));
          await publishPortal(e, settings, company, list);
          published.current[e.id] = JSON.stringify(depositPayFor(e, settings, list));
          toast(made
            ? t(`${e.clientName || e.number} signed: deposit invoice ${first.number} and its payment link are ready.`, `${e.clientName || e.number} firmó: la factura del depósito ${first.number} y su enlace de pago están listos.`)
            : t(`Deposit payment link ready for ${e.number}.`, `Enlace de pago del depósito listo para ${e.number}.`));
        })().catch(() => { /* retried on the next change */ }).finally(() => busy.current.delete(e.id));
        continue;
      }
      if (!e.portal || !e.signature) continue;
      const sig = JSON.stringify(depositPayFor(e, settings, all));
      const prev = published.current[e.id];
      if (prev === sig || (prev === undefined && sig === "null")) continue;
      published.current[e.id] = sig;
      publishPortal(e, settings, company, all).catch(() => { delete published.current[e.id]; });
    }
  }, [on, company, ests, invRows, settings, l1, l2, l3]); // eslint-disable-line react-hooks/exhaustive-deps
}
