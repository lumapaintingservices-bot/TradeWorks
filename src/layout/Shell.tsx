import { normalizeTrade } from "../lib/trades";
import BillingBanner from "../components/BillingBanner";
import { createContext, forwardRef, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { InviteBanner } from "../auth/InviteBanner";
import { RoleBadge } from "../auth/RoleBadge";
import { setTop } from "../data/repo";
import { backend } from "../auth/backend";
import { can, canCreateCompany, homeFor, type Role } from "../lib/roles";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { useNavBadges } from "../pages/FollowUps";
import { useInvoices } from "../data/hooks";
import { usePayLinkSync } from "../data/paylinks";
import { useTeamPhotoSync } from "../data/teamPhotos";
import { useLocationRetention } from "../data/locRetention";
import { useChatInbox } from "../data/teamChat";
import { useTaskInbox } from "../data/taskInbox";
import { useFirestoreReconnect } from "../data/reconnect";
import { useCrewSync } from "../data/crew";
import { useDepositOnSign } from "../data/deposit";
import { navFor, type NavItem } from "./nav";
import "./shell.css";
import LocationPing from "../pages/team/LocationPing";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Toaster } from "../ui/Toaster";
import { modKey, QuickMenu, SearchPalette } from "./QuickActions";
import { NavUser, UserHead } from "./NavUser";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";


const Badges = createContext<Record<string, number>>({});
/** Folded sidebar (icons only): names show as a tooltip beside the icon on hover / keyboard focus. */
type Tip = (text: string | null, ev?: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;
const Mini = createContext<{ mini: boolean; tip: Tip }>({ mini: false, tip: () => {} });
/** Props that give an element the folded-sidebar tooltip (and an accessible name, since its text is hidden). */
function useTipProps(label: string) {
  const { mini, tip } = useContext(Mini);
  return mini ? { "aria-label": label, onMouseEnter: (e: MouseEvent<HTMLElement>) => tip(label, e), onMouseLeave: () => tip(null), onFocus: (e: FocusEvent<HTMLElement>) => tip(label, e), onBlur: () => tip(null) } : {};
}
const Item = ({ it, onClick }: { it: NavItem; onClick?: () => void }) => {
  const t = useT();
  const n = useContext(Badges)[it.to] || 0;
  const tipProps = useTipProps(t(it.en, it.es) + (n > 0 ? " (" + n + ")" : ""));
  return (
    <NavLink to={it.to} end={it.to === "/"} onClick={onClick} {...tipProps} className={({ isActive }) => "nav-item" + (isActive ? " on" : "")}>
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
  const { companies, company, switchCompany, createCompany, isPlatformAdmin } = useAuth();
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
      {canCreateCompany(isPlatformAdmin) && <button className="ws-opt add" onClick={() => { onDone(); createCompany(); nav("/onboarding"); }}>
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

/** A sidebar button that, when the sidebar is folded, shows its label as a tooltip (and uses it as its accessible name). */
const MiniBtn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function MiniBtn({ label, ...p }, ref) {
  const tipProps = useTipProps(label);
  return <button type="button" ref={ref} {...p} {...tipProps} />;
});

/** Badge counts read owner-only collections (invoices, estimates, clients...), so workers never mount this. */
function AdminBadges({ children }: { children: ReactNode }) {
  usePayLinkSync(); // invoice payment links: keep the public copies fresh and pick up "I paid" claims
  useTeamPhotoSync(); // before / after photos workers take land on their jobs
  useCrewSync(); // each job's crew gets its copy of the job (My jobs) and their checklist ticks come back
  useDepositOnSign(); // deposit at signing: invoices + payment link as soon as the client signs
  useLocationRetention(); // workers' positions on hours entries go after 90 days (location notice)
  const nb = useNavBadges();
  const { rows: invs } = useInvoices();
  const chats = useChatInbox(); // job team chats with news (and a toast when a message comes in)
  const badges = { "/": nb.dashboard, "/pipeline": nb.pipeline, "/invoices": invs.filter((v) => v.status !== "Paid").length, "/chats": chats };
  return <Badges.Provider value={badges}>{children}</Badges.Provider>;
}

/** Workers: the Chats badge (their job chats with news) and the Calendar badge (tasks the boss just assigned, with a toast). */
function WorkerBadges({ children }: { children: ReactNode }) {
  const chats = useChatInbox();
  const tasks = useTaskInbox();
  return <Badges.Provider value={{ "/chats": chats, "/calendar": tasks }}>{children}</Badges.Provider>;
}

export default function Shell() {
  const { role } = useAuth();
  useFirestoreReconnect(); // back from the background: live lists catch up without a reload
  const body = <ShellBody />;
  // workers: keep their position fresh on the running clock (team map), only while clocked in and the app is open
  return role === "worker" ? <WorkerBadges><LocationPing />{body}</WorkerBadges> : <AdminBadges>{body}</AdminBadges>;
}

function ShellBody() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const { company, role } = useAuth();
  const [more, setMore] = useState(false);
  const [ws, setWs] = useState(false);       // desktop popover
  const [wsMore, setWsMore] = useState(false); // list inside the mobile More sheet
  const [qc, setQc] = useState<"" | "side" | "sheet">(""); // Quick create menu (sidebar popover / phone sheet)
  const [search, setSearch] = useState(false);              // Ctrl/Cmd+K
  const badges = useContext(Badges);
  const items = navFor(role);
  // desktop sidebar folded to icons: the button at its top or Ctrl/Cmd+B (remembered on this device)
  const mini = useUi((s) => s.sbMini), setMini = useUi((s) => s.setSbMini);
  const [tipAt, setTipAt] = useState<{ text: string; top: number } | null>(null);
  const tip: Tip = (text, ev) => {
    const r = ev?.currentTarget.getBoundingClientRect();
    setTipAt(text && r ? { text, top: r.top + r.height / 2 } : null);
  };
  const wsBtn = useRef<HTMLButtonElement>(null);
  const [wsTop, setWsTop] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b" && window.innerWidth >= 900) { e.preventDefault(); setMini(!useUi.getState().sbMini); }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && canNewRef.current) { e.preventDefault(); setQc(""); setSearch((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMini]);
  useEffect(() => { setTipAt(null); }, [mini]);
  useEffect(() => { setMore(false); setWs(false); setTipAt(null); setQc(""); }, [loc.pathname]);
  useEffect(() => { if (!more) setWsMore(false); }, [more]);
  // public branding for the lead form (public/{companyId}); readable by anyone with the link, holds no private data.
  // Only owners/admins may write it (rules), so workers skip it.
  useEffect(() => {
    if (!company || !can(role, "company.edit")) return;
    setTop("public", company.id, { name: company.name, phone: company.phone, email: company.email || "", address: company.address || "", website: company.website, logoUrl: company.logoUrl, brandColor: company.brandColor, area: company.area, trade: normalizeTrade(company.trade) }, true).catch(() => {});
  }, [company?.id, role, company?.name, company?.phone, company?.website, company?.logoUrl, company?.brandColor, company?.area, company?.trade]); // eslint-disable-line react-hooks/exhaustive-deps
  const newEstimate = () => nav("/estimates?new=1");
  const canNew = can(role, "data.all");
  const canNewRef = useRef(canNew); canNewRef.current = canNew; // search reads owner data: owners / admins only

  return (
    <div className={"shell" + (mini ? " sb-mini" : "")}>
      <Mini.Provider value={{ mini, tip }}>
      <aside className="sb">
        <div className="sb-head">
          <button type="button" className="sb-brand" onClick={() => nav(homeFor(role))} {...(mini ? { "aria-label": "TradeWorks" } : {})}>
            <Logo /><div><b>TradeWorks</b><span>{t("Field service suite", "Gestión de servicios")}</span></div>
          </button>
          <MiniBtn className="sb-tog" label={mini ? t("Show menu (Ctrl+B)", "Mostrar menú (Ctrl+B)") : t("Hide menu (Ctrl+B)", "Esconder menú (Ctrl+B)")}
            title={mini ? undefined : t("Hide menu (Ctrl+B)", "Esconder menú (Ctrl+B)")} aria-expanded={!mini} onClick={() => setMini(!mini)}><Icon name="sidebar" size={18} /></MiniBtn>
        </div>
        <div className="ws-wrap">
          <MiniBtn ref={wsBtn} className="ws" label={(company?.name || "") + " · " + t("Switch company", "Cambiar de empresa")} aria-haspopup="listbox" aria-expanded={ws}
            title={mini ? undefined : t("Switch company", "Cambiar de empresa")} onClick={() => { setWsTop(wsBtn.current?.getBoundingClientRect().top || 0); setWs((o) => !o); }}>
            <CompanyLogo name={company?.name} logoUrl={company?.logoUrl} />
            <span className="ws-name">{company?.name}</span>
            <span className="ws-chev"><Chevron /></span>
          </MiniBtn>
          {ws && <>
            <div className="ws-back" onClick={() => setWs(false)} />
            {/* folded: the list opens beside the rail (fixed, so the narrow sidebar does not clip it) */}
            <div className="ws-menu" style={mini ? { position: "fixed", top: wsTop, left: "calc(var(--sidebar-mini) + 8px)", right: "auto", width: 260 } : undefined}>
              <WorkspaceList onDone={() => setWs(false)} signOut /></div>
          </>}
        </div>
        {canNew && <div className="sb-new-row">
          <MiniBtn className="btn pri sb-new" label={t("New estimate", "Nuevo presupuesto")} onClick={newEstimate}><Icon name="plus" /><span>{t("New estimate", "Nuevo presupuesto")}</span></MiniBtn>
          <button type="button" className="btn sb-qc" aria-haspopup="menu" aria-expanded={qc === "side"} aria-label={t("Create something else", "Crear otra cosa")} title={t("Create something else", "Crear otra cosa")}
            onClick={() => setQc((o) => (o ? "" : "side"))}><Chevron /></button>
          {qc === "side" && <QuickMenu onDone={() => setQc("")} />}
        </div>}
        {canNew && <MiniBtn className="sb-search" label={t("Search", "Buscar") + " (" + modKey() + "+K)"} onClick={() => setSearch(true)}>
          <Icon name="search" size={17} /><span>{t("Search…", "Buscar…")}</span><kbd>{modKey()} K</kbd></MiniBtn>}
        {items.work.length > 0 && <div className="sb-lbl">{t("Work", "Trabajo")}</div>}
        <nav>{items.work.map((it) => <Item key={it.to} it={it} />)}</nav>
        <div className="sb-foot">
          {/* like shadcn dashboard-01: Settings at the bottom, then the signed-in person with their menu */}
          <nav className="sb-sec">{items.business.map((it) => <Item key={it.to} it={it} />)}</nav>
          <NavUser mini={mini} onTip={(text, el) => { const r = el?.getBoundingClientRect(); setTipAt(text && r ? { text, top: r.top + r.height / 2 } : null); }} />
        </div>
      </aside>
      {mini && tipAt && <div className="sb-tip" style={{ top: tipAt.top }} aria-hidden>{tipAt.text}</div>}
      </Mini.Provider>

      <header className="mtop">
        <div className="sb-top" onClick={() => nav(homeFor(role))}><Logo size={28} /><b>TradeWorks</b></div>
        {canNew && <button className="btn sm icon-only" onClick={() => setSearch(true)} aria-label={t("Search", "Buscar")}><Icon name="search" size={18} /></button>}
        {canNew && <button className="btn pri sm" aria-haspopup="menu" aria-expanded={qc === "sheet"} onClick={() => setQc("sheet")}><Icon name="plus" size={16} />{t("New", "Nuevo")}</button>}
      </header>
      {qc === "sheet" && <QuickMenu className="sheet" onDone={() => setQc("")} />}
      {search && canNew && <SearchPalette onClose={() => setSearch(false)} />}

      {/* a crashing screen shows a message inside the app (menu still works); it resets when you go to another page */}
      <main className="main"><InviteBanner /><BillingBanner /><ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary></main>

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
          <div className="more-user">
            <UserHead />
            <div className="mu-row"><ThemeSwitcher /><button className="btn sm" onClick={() => backend.signOut()}><Icon name="logout" size={16} />{t("Sign out", "Salir")}</button></div>
          </div>
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
      <Toaster />
    </div>
  );
}
