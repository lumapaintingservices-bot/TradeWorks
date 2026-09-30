import BillingBanner from "../components/BillingBanner";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { InviteBanner } from "../auth/InviteBanner";
import { RoleBadge } from "../auth/RoleBadge";
import { setTop } from "../data/repo";
import { backend } from "../auth/backend";
import { can, canCreateCompany, homeFor, roleLabel, type Role } from "../lib/roles";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { useNavBadges } from "../pages/FollowUps";
import { useInvoices } from "../data/hooks";
import { navFor, type NavItem } from "./nav";
import "./shell.css";
import { hasFirebase } from "../lib/firebase";

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

const Badges = createContext<Record<string, number>>({});
const Item = ({ it, onClick }: { it: NavItem; onClick?: () => void }) => {
  const t = useT();
  const n = useContext(Badges)[it.to] || 0;
  return (
    <NavLink to={it.to} end={it.to === "/"} onClick={onClick} className={({ isActive }) => "nav-item" + (isActive ? " on" : "")}>
      <Icon name={it.icon} /><span>{t(it.en, it.es)}</span>{n > 0 && <em className="nav-badge">{n}</em>}
    </NavLink>
  );
};

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 9 5 5 5-5" /></svg>
);
const CompanyLogo = ({ name, logoUrl }: { name?: string; logoUrl?: string }) => (
  <span className="ws-logo">{logoUrl ? <img src={logoUrl} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}</span>
);

/** Workspace switcher list: my companies (role badge), "+ New company", optionally Sign out. Used by the sidebar popover and the mobile More sheet. */
function WorkspaceList({ onDone, signOut }: { onDone(): void; signOut?: boolean }) {
  const t = useT();
  const nav = useNavigate();
  const { companies, company, switchCompany, createCompany } = useAuth();
  const pick = async (id: string, role: Role) => {
    onDone();
    if (id === company?.id) return;
    await switchCompany(id);
    nav(homeFor(role), { replace: true }); // the old route (e.g. an estimate id) belongs to the previous company
  };
  return (
    <div className="ws-list" role="listbox" aria-label={t("Your companies", "Tus empresas")}>
      {companies.map((c) => (
        <button key={c.id} role="option" aria-selected={c.id === company?.id} className={"ws-opt" + (c.id === company?.id ? " on" : "")} onClick={() => pick(c.id, c.role)}>
          <CompanyLogo name={c.name} logoUrl={c.logoUrl} />
          <span className="ws-opt-name">{c.name || t("(no name yet)", "(sin nombre)")}</span>
          <RoleBadge role={c.role} />
          {c.id === company?.id && <span className="ws-check"><Icon name="check" size={16} /></span>}
        </button>
      ))}
      {canCreateCompany(companies.map((c) => c.role)) && <button className="ws-opt add" onClick={() => { onDone(); createCompany(); nav("/onboarding"); }}>
        <span className="ws-logo add"><Icon name="plus" size={16} /></span>
        <span className="ws-opt-name">{t("New company", "Nueva empresa")}</span>
      </button>}
      {signOut && <button className="ws-opt out" onClick={() => { onDone(); backend.signOut(); }}>
        <span className="ws-logo add"><Icon name="user" size={16} /></span>
        <span className="ws-opt-name">{t("Sign out", "Salir")}</span>
      </button>}
    </div>
  );
}

/** Badge counts read owner-only collections (invoices, estimates, clients...), so workers never mount this. */
function AdminBadges({ children }: { children: ReactNode }) {
  const nb = useNavBadges();
  const { rows: invs } = useInvoices();
  const badges = { "/": nb.dashboard, "/pipeline": nb.pipeline, "/invoices": invs.filter((v) => v.status !== "Paid").length };
  return <Badges.Provider value={badges}>{children}</Badges.Provider>;
}

export default function Shell() {
  const { role } = useAuth();
  const body = <ShellBody />;
  return role === "worker" ? <Badges.Provider value={{}}>{body}</Badges.Provider> : <AdminBadges>{body}</AdminBadges>;
}

function ShellBody() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const { user, company, role } = useAuth();
  const toast = useUi((s) => s.toastMsg);
  const [more, setMore] = useState(false);
  const [ws, setWs] = useState(false);       // desktop popover
  const [wsMore, setWsMore] = useState(false); // list inside the mobile More sheet
  const badges = useContext(Badges);
  const items = navFor(role);
  useEffect(() => { setMore(false); setWs(false); }, [loc.pathname]);
  useEffect(() => { if (!more) setWsMore(false); }, [more]);
  // public branding for the lead form (public/{companyId}); readable by anyone with the link, holds no private data.
  // Only owners/admins may write it (rules), so workers skip it.
  useEffect(() => {
    if (!company || !can(role, "company.edit")) return;
    setTop("public", company.id, { name: company.name, phone: company.phone, website: company.website, logoUrl: company.logoUrl, brandColor: company.brandColor, area: company.area }, true).catch(() => {});
  }, [company?.id, role, company?.name, company?.phone, company?.website, company?.logoUrl, company?.brandColor, company?.area]); // eslint-disable-line react-hooks/exhaustive-deps
  const newEstimate = () => nav("/estimates?new=1");
  const canNew = can(role, "data.all");

  return (
    <div className="shell">
      <aside className="sb">
        <div className="sb-top" onClick={() => nav(homeFor(role))}>
          <Logo /><div><b>TradeWorks</b><span>{t("Field service suite", "Gestión de servicios")}</span></div>
        </div>
        <div className="ws-wrap">
          <button className="ws" aria-haspopup="listbox" aria-expanded={ws} title={t("Switch company", "Cambiar de empresa")} onClick={() => setWs((o) => !o)}>
            <CompanyLogo name={company?.name} logoUrl={company?.logoUrl} />
            <span className="ws-name">{company?.name}</span>
            <span className="ws-chev"><Chevron /></span>
          </button>
          {ws && <>
            <div className="ws-back" onClick={() => setWs(false)} />
            <div className="ws-menu"><WorkspaceList onDone={() => setWs(false)} signOut /></div>
          </>}
        </div>
        {canNew && <button className="btn pri sb-new" onClick={newEstimate}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>}
        {items.work.length > 0 && <div className="sb-lbl">{t("Work", "Trabajo")}</div>}
        <nav>{items.work.map((it) => <Item key={it.to} it={it} />)}</nav>
        {items.business.length > 0 && <div className="sb-lbl">{t("Business", "Negocio")}</div>}
        <nav>{items.business.map((it) => <Item key={it.to} it={it} />)}</nav>
        <div className="sb-foot">
          <div className="row"><span className="cloud" title={hasFirebase ? undefined : t("No Firebase keys: data stays in this browser only", "Sin claves de Firebase: los datos solo quedan en este navegador")}><i style={hasFirebase ? undefined : { background: "var(--warn, #F79009)" }} />{hasFirebase ? t("Cloud on", "Nube activa") : t("Demo mode", "Modo demo")}</span><LangSwitch /></div>
          <div className="me">
            <span className="av">{(user?.name || user?.email || "?").slice(0, 2).toUpperCase()}</span>
            <div><b>{user?.name || company?.name}</b><span>{role ? t(...roleLabel(role)) + " · " : ""}{user?.email}</span></div>
            <button className="btn sm" title={t("Sign out", "Salir")} onClick={() => backend.signOut()}>{t("Sign out", "Salir")}</button>
          </div>
        </div>
      </aside>

      <header className="mtop">
        <div className="sb-top" onClick={() => nav(homeFor(role))}><Logo size={28} /><b>TradeWorks</b></div>
        <LangSwitch />
        {canNew && <button className="btn pri sm" onClick={newEstimate}><Icon name="plus" size={16} />{t("New", "Nuevo")}</button>}
      </header>

      <main className="main"><InviteBanner /><BillingBanner /><Outlet /></main>

      {more && <div className="more-back" onClick={() => setMore(false)} />}
      {more && (
        <div className="more"><div className="more-in">
          {items.more.map((it) => <Item key={it.to} it={it} onClick={() => setMore(false)} />)}
          <button className={"nav-item ws-row" + (wsMore ? " open" : "")} aria-expanded={wsMore} onClick={() => setWsMore((o) => !o)}>
            <CompanyLogo name={company?.name} logoUrl={company?.logoUrl} />
            <span className="ws-more-name"><span>{company?.name}</span><small>{t("Switch company", "Cambiar de empresa")}</small></span>
            <span className="ws-chev"><Chevron /></span>
          </button>
          {wsMore && <WorkspaceList onDone={() => setMore(false)} />}
          <button className="nav-item" onClick={() => backend.signOut()}><Icon name="user" /><span>{t("Sign out", "Salir")}</span></button>
        </div></div>
      )}
      <nav className="bnav">
        {items.bottom.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
            <Icon name={it.icon} /><span>{t(it.en, it.es)}</span>{(badges[it.to] || 0) > 0 && <em className="nav-badge">{badges[it.to]}</em>}
          </NavLink>
        ))}
        <button className={more ? "on" : ""} onClick={() => setMore((m) => !m)}><Icon name="more" /><span>{t("More", "Más")}</span></button>
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
