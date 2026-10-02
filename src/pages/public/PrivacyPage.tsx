import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTop } from "../../data/repo";
import { fmtDate } from "../../lib/format";
import { CLIENT_PRIVACY_DATE, clientPrivacy, type PolicyBiz } from "../../lib/legal";
import { safeImgSrc, safeUrl } from "../../lib/safeUrl";
import { TwMark } from "./PortalPage";
import "./portal.css";
import "./legal.css";

type Pub = PolicyBiz & { logoUrl?: string; brandColor?: string };

/**
 * Public: the privacy policy a company's clients see (/privacy/:cid), linked from the request form, the estimate link, the
 * payment link and the signed copy. Company details come from its public card (public/{cid}). Light, printable, EN / ES,
 * with a table of contents and the effective date (shape of a legal page: identity, date, full text, contact path).
 */
export default function PrivacyPage() {
  const { cid = "" } = useParams();
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const q = new URLSearchParams(window.location.search).get("lang");
  const [lang, setLang] = useState<"en" | "es">(q === "es" || q === "en" ? q : navigator.language?.toLowerCase().startsWith("es") ? "es" : "en");
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cid)) { setPub(null); return; }
    getTop<Pub>("public", cid).then((d) => setPub(d || null), () => setPub(null));
  }, [cid]);
  const pol = pub ? clientPrivacy(pub, lang) : null;
  useEffect(() => { if (pol) document.title = `${pol.title} — ${pub?.name || ""}`; }, [pol?.title, pub?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // a link to one section (/privacy/x#esign): the text arrives after loading, so jump there once it is on the page
  useEffect(() => { const id = location.hash.slice(1); if (pub && /^[a-z]+$/.test(id)) document.getElementById(id)?.scrollIntoView(); }, [pub]);

  if (pub === undefined) return <div className="pt-msg-page" />;
  if (!pub || !pol) return <div className="pt-msg-page"><h2>This page isn't available</h2><p>Esta página no está disponible</p></div>;
  const es = lang === "es";
  const logo = safeImgSrc(pub.logoUrl);
  const brand = /^#[0-9a-f]{6}$/i.test(pub.brandColor || "") ? pub.brandColor : "";
  const style = (brand ? { "--acc": brand } : {}) as React.CSSProperties;

  return (
    <div className="pt lg" style={style}>
      <div className="pt-in lg-in">
        <header className="lg-top">
          {logo && <img src={logo} alt="" />}
          <span className="lg-biz">{pub.name}</span>
          <div className="pt-lang">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        </header>
        <main className="lg-doc">
          <h1>{pol.title}</h1>
          <p className="lg-sub">{pol.sub}</p>
          <p className="lg-date">{es ? "Vigente desde el " : "Effective "}{fmtDate(CLIENT_PRIVACY_DATE, lang)}</p>
          <nav className="lg-toc" aria-label={es ? "Contenido" : "Contents"}>
            <b>{es ? "Contenido" : "Contents"}</b>
            <ol>{pol.sections.map((s) => <li key={s.id}><a href={"#" + s.id}>{s.title}</a></li>)}</ol>
          </nav>
          {pol.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="lg-sec">
              <h2>{i + 1}. {s.title}</h2>
              {s.blocks.map((b, j) => b.p ? <p key={j}>{b.p}</p>
                : b.list ? <ul key={j}>{b.list.map((x, k) => <li key={k}>{s.id === "contact" && safeUrl(x) ? <a href={safeUrl(x)} target="_blank" rel="noopener noreferrer">{x}</a> : s.id === "contact" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x) ? <a href={"mailto:" + x}>{x}</a> : x}</li>)}</ul>
                : b.table ? <div key={j} className="lg-tbl-wrap"><table className="lg-tbl"><thead><tr>{b.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{b.table.rows.map((r, k) => <tr key={k}>{r.map((c, n) => <td key={n} data-h={b.table!.head[n]}>{c}</td>)}</tr>)}</tbody></table></div>
                : null)}
            </section>))}
          <div className="lg-actions"><button className="btn" onClick={() => window.print()}>{es ? "Imprimir / Guardar PDF" : "Print / Save PDF"}</button></div>
        </main>
        <footer className="pt-foot lg-foot"><div className="pt-fine">{pub.name}</div><div className="tw-pow"><TwMark />Powered by TradeWorks</div></footer>
      </div>
    </div>
  );
}
