import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { BOTTOM, BUSINESS, MORE, WORK, type NavItem } from "./nav";
import "./shell.css";

function LangSwitch() {
  const { lang, setLang } = useUi();
  return (
    <div className="seg" role="group" aria-label="Language">
      {(["en", "es"] as const).map((l) => (
        <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

const Item = ({ it, onClick }: { it: NavItem; onClick?: () => void }) => {
  const t = useT();
  return (
    <NavLink to={it.to} end={it.to === "/"} onClick={onClick} className={({ isActive }) => "nav-item" + (isActive ? " on" : "")}>
      <Icon name={it.icon} /><span>{t(it.en, it.es)}</span>
    </NavLink>
  );
};

export default function Shell() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const { user, company } = useAuth();
  const toast = useUi((s) => s.toastMsg);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [loc.pathname]);
  const newEstimate = () => nav("/estimates?new=1");

  return (
    <div className="shell">
      <aside className="sb">
        <div className="sb-top" onClick={() => nav("/")}>
          <Logo /><div><b>TradeWorks</b><span>{t("Field service suite", "Gestión de servicios")}</span></div>
        </div>
        <button className="ws" onClick={() => nav("/settings")}>
          <span className="ws-logo">{company?.logoUrl ? <img src={company.logoUrl} alt="" /> : (company?.name || "?").slice(0, 1)}</span>
          <span className="ws-name">{company?.name}</span>
        </button>
        <button className="btn pri sb-new" onClick={newEstimate}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>
        <div className="sb-lbl">{t("Work", "Trabajo")}</div>
        <nav>{WORK.map((it) => <Item key={it.to} it={it} />)}</nav>
        <div className="sb-lbl">{t("Business", "Negocio")}</div>
        <nav>{BUSINESS.map((it) => <Item key={it.to} it={it} />)}</nav>
        <div className="sb-foot">
          <div className="row"><span className="cloud"><i />{t("Cloud on", "Nube activa")}</span><LangSwitch /></div>
          <div className="me">
            <span className="av">{(user?.name || user?.email || "?").slice(0, 2).toUpperCase()}</span>
            <div><b>{user?.name || company?.name}</b><span>{user?.email}</span></div>
            <button className="btn sm" title={t("Sign out", "Salir")} onClick={() => backend.signOut()}>⎋</button>
          </div>
        </div>
      </aside>

      <header className="mtop">
        <div className="sb-top" onClick={() => nav("/")}><Logo size={28} /><b>TradeWorks</b></div>
        <LangSwitch />
        <button className="btn pri sm" onClick={newEstimate}><Icon name="plus" size={16} />{t("New", "Nuevo")}</button>
      </header>

      <main className="main"><Outlet /></main>

      {more && <div className="more-back" onClick={() => setMore(false)} />}
      {more && (
        <div className="more"><div className="more-in">
          {MORE.map((it) => <Item key={it.to} it={it} onClick={() => setMore(false)} />)}
          <button className="nav-item" onClick={() => backend.signOut()}><Icon name="user" /><span>{t("Sign out", "Salir")}</span></button>
        </div></div>
      )}
      <nav className="bnav">
        {BOTTOM.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
            <Icon name={it.icon} /><span>{t(it.en, it.es)}</span>
          </NavLink>
        ))}
        <button className={more ? "on" : ""} onClick={() => setMore((m) => !m)}><Icon name="more" /><span>{t("More", "Más")}</span></button>
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
