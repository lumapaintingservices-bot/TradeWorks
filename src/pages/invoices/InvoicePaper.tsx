import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { InvoiceSheet } from "../../components/DocSheet";
import { useSettings } from "../../data/hooks";
import { payLinkOf } from "../../data/paylinks";
import { servicesLine } from "../../lib/estimate";
import type { InvoiceRec } from "../../lib/invoices";
import { payHandleLines } from "../../lib/paylink";
import { payMethodsOf } from "../../lib/payMethods";
import type { Estimate } from "../../lib/types";

/** The client's invoice document (always light, the contractor's branding), as on /invoices/:id/doc and the preview panel. */
export function InvoicePaper({ v, e, lang, compact }: { v: InvoiceRec; e: Estimate; lang: "en" | "es"; compact?: boolean }) {
  const { company } = useAuth();
  const { settings: s } = useSettings();
  if (!company) return null;
  return (
    <InvoiceSheet v={v} e={e} s={s} lang={lang} compact={compact} biz={company} services={servicesLine(e, s, lang)}
      pay={{ zelle: s.payZelle || "", zelleName: s.payZelleName || "", note: s.payNote || "", methods: payMethodsOf(s.payMethods), handles: payHandleLines(s, lang === "es"), payUrl: v.pay?.token && v.status !== "Paid" ? payLinkOf(v.pay.token) : "" }} />
  );
}

const PAGE = 816; // 8.5in at 96 dpi: the sheet's full width

/**
 * Shows a document as a page that fits the box: drawn at full width and scaled down, like a print preview.
 * In a narrow box (a phone) the sheet lays itself out at the box's width instead, so the text stays readable.
 */
export function PaperFit({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, h: 0, natural: true });
  useLayoutEffect(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      const w = b.clientWidth, natural = w < 520, scale = natural ? 1 : Math.min(1, w / PAGE);
      setFit((f) => {
        const h = natural ? 0 : Math.ceil(i.offsetHeight * scale);
        return f.scale === scale && f.h === h && f.natural === natural ? f : { scale, h, natural };
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(b); ro.observe(i); measure();
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="paper-fit" style={fit.natural ? undefined : { height: fit.h }}>
      <div ref={inner} style={fit.natural ? undefined : { width: PAGE, transform: `scale(${fit.scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}
