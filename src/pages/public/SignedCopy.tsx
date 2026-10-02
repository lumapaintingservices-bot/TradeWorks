import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EstimateSheet } from "../../components/DocSheet";
import { getTopSub } from "../../data/repo";
import { fmtDate } from "../../lib/format";
import { money } from "../../lib/money";
import { payMethodsOf } from "../../lib/payMethods";
import { effective, modelSettings, type PortalModel } from "../../lib/portal";
import { safeImgSrc } from "../../lib/safeUrl";
import { TwMark } from "./PortalPage";
import "./portal.css";
import { privacyPath } from "../../lib/legal";

/** portal/{token}/signed/{id}: written only by the server when the client signed (functions/api/portal/sign.js). */
type Copy = {
  kind: "est" | "co"; coId?: string; coN?: number; name: string; img: string; at: string; amount: number; picks?: Record<string, boolean>;
  data: string; dataTooBig?: boolean; hash: string; ip?: string; ua?: string; tz?: string; lang?: "en" | "es"; number?: string; emailedTo?: string; emailedAt?: string; owner?: string;
};

const W = {
  en: { title: "Signed copy", est: "Estimate", co: "Change order", record: "Signature record", by: "Signed by", when: "Date and time", ip: "IP address", device: "Device",
    hash: "Document fingerprint (SHA-256)", id: "Copy ID", mailed: "Copy e-mailed to", kept: "TradeWorks kept this copy on its server at the moment of signing. It cannot be changed afterwards — not by the client, the business or TradeWorks' app.",
    print: "Print / Save PDF", gone: "This signed copy isn't available.", tooBig: "The document was too large to keep in full; the record and fingerprint above still identify it.", amount: "Amount", change: "Change", doc: "The estimate it changes" },
  es: { title: "Copia firmada", est: "Presupuesto", co: "Orden de cambio", record: "Registro de la firma", by: "Firmado por", when: "Fecha y hora", ip: "Dirección IP", device: "Dispositivo",
    hash: "Huella del documento (SHA-256)", id: "ID de la copia", mailed: "Copia enviada a", kept: "TradeWorks guardó esta copia en su servidor en el momento de la firma. No se puede cambiar después: ni el cliente, ni la empresa, ni la app de TradeWorks.",
    print: "Imprimir / Guardar PDF", gone: "Esta copia firmada no está disponible.", tooBig: "El documento era demasiado grande para guardarlo completo; el registro y la huella de arriba lo identifican.", amount: "Monto", change: "Cambio", doc: "El presupuesto que cambia" },
};
const localDay = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Public: the copy of exactly what the client signed, with who / when / where from. Light, printable, EN / ES. */
export default function SignedCopy() {
  const { token = "", sid = "" } = useParams();
  const [copy, setCopy] = useState<Copy | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "es" | "">("");
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => {
    if (!/^[A-Za-z0-9]{16,64}$/.test(token) || !/^[A-Za-z0-9_-]{1,120}$/.test(sid)) { setCopy(null); return; }
    getTopSub<Copy>("portal", token, "signed", sid).then(setCopy, () => setCopy(null));
  }, [token, sid]);
  const m = useMemo<PortalModel | null>(() => { try { return copy?.data ? (JSON.parse(copy.data) as PortalModel) : null; } catch { return null; } }, [copy?.data]);
  const L = (lang || copy?.lang || m?.e.docLang || "en") as "en" | "es";
  const T = W[L], es = L === "es";
  useEffect(() => { if (copy) document.title = `${T.title} — ${copy.number || ""}`; }, [copy, T.title]);

  if (copy === undefined) return <div className="pt-msg-page" />;
  if (!copy) return <div className="pt-msg-page"><h2>{W.en.gone}</h2><p>{W.es.gone}</p></div>;

  const when = (() => { const d = new Date(copy.at); return isNaN(d.getTime()) ? copy.at : d.toLocaleString(es ? "es-US" : "en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }); })();
  const b = m?.s.business;
  const co = copy.kind === "co" && m ? (m.e.changeOrders || []).find((x) => x.id === copy.coId) : undefined;
  const e = m && copy.kind === "est"
    ? { ...effective(m, { picks: copy.picks || {} }), signature: { name: copy.name, img: copy.img, date: localDay(copy.at), via: "link", at: copy.at } }
    : m ? { ...m.e, signature: null } : null;
  const sheet = m && e && b ? <EstimateSheet e={e} s={modelSettings(m)} lang={L} biz={b} services={(es ? m.s.services?.es : m.s.services?.en) || ""}
    pay={{ zelle: m.s.payZelle, zelleName: m.s.payZelleName, note: m.s.payNote, methods: payMethodsOf(m.s.payMethods) }} /> : null;
  const rows: [string, string][] = [
    [T.by, copy.name], [T.when, when], ...(copy.ip ? [[T.ip, copy.ip] as [string, string]] : []), ...(copy.ua ? [[T.device, copy.ua] as [string, string]] : []),
    ...(copy.emailedTo ? [[T.mailed, copy.emailedTo] as [string, string]] : []), [T.hash, copy.hash], [T.id, sid],
  ];

  return (
    <div className="pt sc">
      <div className="pt-in">
        <section className="pt-hero">
          <div className="pt-cv-top">
            {b && safeImgSrc(b.logoUrl) && <img src={safeImgSrc(b.logoUrl)} alt="" />}
            <span className="pt-cv-logo">{b?.name || ""}</span>
            <div className="pt-lang sc-noprint">{(["en", "es"] as const).map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
          </div>
          <div className="pt-k">{T.title}</div>
          <h1 className="sc-h1">{copy.kind === "co" ? `${T.co} #${copy.coN ?? co?.n ?? ""} · ${copy.number || ""}` : `${T.est} ${copy.number || ""}`}</h1>
          <div className="pt-meta">{copy.name} · {fmtDate(localDay(copy.at), L)} · {money(copy.amount)}</div>
          <button className="btn sc-noprint" style={{ marginTop: 12 }} onClick={() => window.print()}>{T.print}</button>
        </section>

        {copy.kind === "co" && (
          <section className="pt-sec"><h2>{T.co} #{copy.coN ?? co?.n ?? ""}</h2>
            <div className="pt-lines">
              <div className="pt-line"><span>{T.change}</span><span>{co ? (es ? co.descEs || co.desc : co.desc || co.descEs) : ""}</span></div>
              <div className="pt-line pt-big"><span>{T.amount}</span><span className="num">{money(copy.amount)}</span></div>
            </div>
            {safeImgSrc(copy.img) && <div className="pt-signed"><img src={safeImgSrc(copy.img)} alt="" /><p><b>{copy.name}</b></p></div>}
          </section>)}

        <section className="pt-sec sc-rec"><h2>{T.record}</h2>
          <dl className="sc-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === T.hash || k === T.id ? "sc-mono" : ""}>{v}</dd></div>)}</dl>
          <p className="pt-hint">{T.kept}</p>
          {copy.dataTooBig && <p className="pt-hint">{T.tooBig}</p>}
        </section>

        {sheet && <section className="pt-sec">{copy.kind === "co" && <h2>{T.doc}</h2>}<div className="pt-docin sc-doc">{sheet}</div></section>}

        <footer className="pt-foot"><div className="pt-fine">{b?.name || ""}{b?.area ? ` · ${b.area}` : ""}{copy.owner ? <> · <a className="pt-priv" href={privacyPath(copy.owner, L)} target="_blank" rel="noopener noreferrer">{es ? "Política de privacidad" : "Privacy policy"}</a></> : null}</div><div className="tw-pow"><TwMark />Powered by TradeWorks</div></footer>
      </div>
    </div>
  );
}
