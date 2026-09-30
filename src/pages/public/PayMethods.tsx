import { useState } from "react";
import { money } from "../../lib/money";
import { payKindName, payMethodCopy, payMethodDetail, payMethodUrl, type PayMethod } from "../../lib/paylink";

type Props = {
  methods: PayMethod[]; amount: number; memo: string; es: boolean;
  /** Method the client already said they used (then only a thank-you shows). */
  claimed?: string;
  onClaim(method: string, note: string): Promise<unknown>;
  say(msg: string): void;
};

/** Client-facing list of ways to pay (each with "Open Venmo" / "Copy") and the "I already paid" step. Styled by portal.css. */
export function PayMethods({ methods, amount, memo, es, claimed, onClaim, say }: Props) {
  const T = (a: string, b: string) => (es ? b : a);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const name = (m: PayMethod) => payKindName(m.kind, es);
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => say(T("Copied.", "Copiado."))).catch(() => say(t)); };
  const send = () => {
    if (!method) { say(T("Pick how you paid.", "Escoja cómo pagó.")); return; }
    onClaim(method.slice(0, 40), note.trim().slice(0, 300))
      .then(() => { setOpen(false); say(T("Thank you! We'll confirm when it arrives.", "¡Gracias! Confirmaremos cuando llegue.")); })
      .catch(() => say(T("No connection. Try again.", "Sin conexión. Inténtalo de nuevo.")));
  };

  return (
    <>
      {methods.map((pm) => {
        const url = payMethodUrl(pm, amount, memo), cp = payMethodCopy(pm);
        return (
          <div className="pt-pm" key={pm.kind}>
            <div style={{ minWidth: 0, overflowWrap: "anywhere" }}><b>{name(pm)}</b><span>{payMethodDetail(pm, es)}{pm.name ? " · " + pm.name : ""}</span></div>
            {(url || cp) && <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              {url && <a className="btn sm pri" href={url} target="_blank" rel="noopener noreferrer">{T("Open", "Abrir")} {name(pm)}</a>}
              {cp && <button className="btn sm" onClick={() => copy(cp)}>{T("Copy", "Copiar")}</button>}
            </div>}
          </div>);
      })}
      {claimed ? <p className="pt-paid" style={{ marginTop: 12 }}>✓ {T(`Thanks! You told us you paid by ${claimed}. We'll confirm when it arrives.`, `¡Gracias! Nos dijo que pagó por ${claimed}. Confirmaremos cuando llegue.`)}</p>
        : !open ? <div className="pt-sent"><button className="btn pri" style={{ width: "100%" }} onClick={() => { setOpen(true); setMethod(methods.length === 1 ? name(methods[0]) : ""); }}>{T("I already paid", "Ya pagué")}</button></div>
        : <div className="pt-pay">
            <h3>{T("How did you pay?", "¿Cómo pagó?")}</h3>
            {methods.map((pm) => { const n = name(pm), on = method === n; return (
              <button key={pm.kind} className={"pt-opt" + (on ? " on" : "")} aria-pressed={on} onClick={() => setMethod(n)}>
                <span className="pt-ck" aria-hidden="true">{on ? "✓" : ""}</span><span className="pt-od">{n}</span></button>); })}
            <label className="f" style={{ marginTop: 12 }}><span>{T("Note (optional) — e.g. confirmation number", "Nota (opcional) — p. ej. número de confirmación")}</span>
              <input type="text" value={note} maxLength={300} onChange={(ev) => setNote(ev.target.value)} /></label>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setOpen(false)}>{T("Cancel", "Cancelar")}</button><div style={{ marginLeft: "auto" }} />
              <button className="btn pri" onClick={send}>{T(`I paid ${money(amount)}`, `Pagué ${money(amount)}`)}</button>
            </div>
          </div>}
    </>
  );
}
