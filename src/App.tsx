import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { backend } from "./auth/backend";
import { JoinPrompt } from "./auth/InviteBanner";
import { can, canAccess, homeFor, onboardingView, redirectFor } from "./lib/roles";
import { useT } from "./i18n";
import { Logo } from "./ui/Logo";
import Shell from "./layout/Shell";
import AuthPage from "./pages/AuthPage";
import Calendar from "./pages/Calendar";
import { useCalendarFeedSync } from "./pages/settings/calendarFeed";
import ClientProfile from "./pages/ClientProfile";
import Clients from "./pages/Clients";
import Dashboard from "./pages/Dashboard";
import EstimateDoc from "./pages/estimate/EstimateDoc";
import EstimateEditor from "./pages/estimate/EstimateEditor";
import Estimates from "./pages/Estimates";
import Onboarding from "./pages/Onboarding";
import LeadForm from "./pages/public/LeadForm";
import PortalPage from "./pages/public/PortalPage";
import PayPage from "./pages/public/PayPage";
import InvoiceDoc from "./pages/InvoiceDoc";
import Invoices from "./pages/Invoices";
import Pipeline from "./pages/Pipeline";
import Team from "./pages/Team";
import { OwnerWorkerTimesheet, WorkerTimesheet } from "./pages/team/Timesheet";
import Expenses from "./pages/Expenses";
import WorkOrder from "./pages/estimate/WorkOrder";
import Reports from "./pages/Reports";
import Placeholder from "./pages/Placeholder";
import Settings from "./pages/Settings";
import Chats from "./pages/chat/Chats";
import Notes from "./pages/notes/Notes";
import { JobDetail, MyJobs } from "./pages/jobs/MyJobs";
import { applyTheme, useUi } from "./store/ui";
import { LoadingScreen } from "./ui/LoadingScreen";

/** Publishes the calendar feed; it reads owner-only collections, so workers never run it. */
function FeedSync() { const { role } = useAuth(); return can(role, "data.all") ? <FeedSyncRun /> : null; }
function FeedSyncRun() { useCalendarFeedSync(); return null; }

/** Shown instead of the onboarding wizard when the account could not be read (offline / rules) — never treat that as "no company yet". */
function LoadFailed() {
  const t = useT();
  return (
    <div className="auth">
      <div className="auth-card card">
        <div className="auth-top"><Logo size={40} /><b>TradeWorks</b></div>
        <h1>{t("Could not load your account", "No se pudo cargar tu cuenta")}</h1>
        <p className="muted" style={{ marginBottom: 16 }}>{t("It took too long or the connection failed. Check your internet and try again.", "Tardó demasiado o falló la conexión. Revisa tu internet e inténtalo de nuevo.")}</p>
        <button className="btn pri" style={{ width: "100%", height: 42 }} onClick={() => window.location.reload()}>{t("Try again", "Reintentar")}</button>
        <div className="auth-links"><button className="link-btn" onClick={() => backend.signOut()}>{t("Sign out", "Salir")}</button></div>
      </div>
    </div>
  );
}

function Gate() {
  const { ready, user, company, loadError } = useAuth();
  const loc = useLocation();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (loadError) return <LoadFailed />;
  if (!company?.onboarded) return <Navigate to="/onboarding" replace />;
  // key = company id: switching company remounts the whole app tree, so no page or hook keeps the previous company's rows
  return <><FeedSync /><Shell key={company.id} /></>;
}

/** Route guard: a role only reaches the routes src/lib/roles.ts allows; anything else goes to that role's home. */
function Guard() {
  const { role } = useAuth();
  const loc = useLocation();
  const to = redirectFor(role, loc.pathname);
  return to ? <Navigate to={to} replace /> : <Outlet />;
}

function Bare() {
  const { ready, user, company, role, loadError } = useAuth();
  const loc = useLocation();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (loadError) return <LoadFailed />;
  if (!company?.onboarded) return <Navigate to="/onboarding" replace />;
  if (!canAccess(role, loc.pathname)) return <Navigate to={homeFor(role)} replace />;
  return <Outlet key={company.id} />;
}

/** Back to the app from /onboarding; a "new company" that may not be created is cancelled first (else the Gate sends us back here). */
function LeaveOnboarding({ to }: { to: string }) {
  const { creating, cancelCreateCompany } = useAuth();
  useEffect(() => { if (creating) cancelCreateCompany(); }, [creating, cancelCreateCompany]);
  return creating ? <LoadingScreen /> : <Navigate to={to} replace />;
}

/** Signed in, but not in any company and not invited: TradeWorks accounts are by invitation only. */
function NoAccess() {
  const t = useT();
  const { user, retryLoad } = useAuth();
  return (
    <div className="auth">
      <div className="auth-card card">
        <div className="auth-top"><Logo size={40} /><b>TradeWorks</b></div>
        <h1>{t("You need an invitation", "Necesitas una invitación")}</h1>
        <p className="muted" style={{ marginBottom: 10 }}>{t("TradeWorks accounts are by invitation. Ask your company to invite this e-mail:", "Las cuentas de TradeWorks son por invitación. Pídele a tu empresa que invite este correo:")}</p>
        <p style={{ fontWeight: 600, marginBottom: 16, overflowWrap: "anywhere" }}>{user?.email}</p>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{t("Already invited? Make sure you signed up with exactly the e-mail they invited, then check again.", "¿Ya te invitaron? Asegúrate de haberte registrado con el mismo correo que invitaron y vuelve a revisar.")}</p>
        <button className="btn pri" style={{ width: "100%", height: 42 }} onClick={retryLoad}>{t("Check again", "Revisar otra vez")}</button>
        <div className="auth-links"><button className="link-btn" onClick={() => backend.signOut()}>{t("Sign out", "Salir")}</button></div>
      </div>
    </div>
  );
}

/** /onboarding: the create-company wizard, plus (a) the "You were invited" prompt for accounts with an invite and no company,
 *  (b) a way back when this is an ADDITIONAL company being created (the existing company is never touched). */
function OnboardingRoute() {
  const t = useT();
  const nav = useNavigate();
  const { ready, user, company, companies, activeCompanyId, creating, invite, cancelCreateCompany, switchCompany, loadError, isPlatformAdmin, role } = useAuth();
  const [skipInvite, setSkipInvite] = useState(false);
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (loadError) return <LoadFailed />;
  // only a TradeWorks platform admin creates companies; everyone else gets in by invitation (rules enforce the same)
  const view = onboardingView({ invite: !!invite, skipInvite, hasCompany: !!company, companies: companies.length, creating, isPlatformAdmin, role: role ?? companies.find((c) => c.id === activeCompanyId)?.role ?? null });
  if (view === "join") return <JoinPrompt onSkip={() => setSkipInvite(true)} />;
  if (view === "no-access") return <NoAccess />;
  if (view === "home") return <LeaveOnboarding to={homeFor(companies.find((c) => c.id === activeCompanyId)?.role ?? "worker")} />;
  // creating: go back to the company that stays active underneath; a half-finished new company: go to any other one
  const target = creating ? companies.find((c) => c.id === activeCompanyId) : companies.find((c) => c.id !== company?.id);
  const back = () => {
    if (creating) { cancelCreateCompany(); nav("/", { replace: true }); }
    else if (target) { switchCompany(target.id).then(() => nav(homeFor(target.role), { replace: true })); }
  };
  return (
    <>
      {user && target && (creating || (company && !company.onboarded)) && (
        <div className="onb-back"><button className="btn sm" onClick={back}>← {t("Back to", "Volver a")} {target.name}</button></div>
      )}
      <Onboarding />
    </>
  );
}

const P = (en: string, es: string, icon: string, phase: number) => <Placeholder en={en} es={es} icon={icon} phase={phase} />;

export default function App() {
  const theme = useUi((s) => s.theme);
  const { pathname } = useLocation();
  // client-facing pages (client link, lead form, estimate/invoice documents, work order) are always light, whatever the owner's theme
  const clientPage = /^\/(p\/|request(\/|$)|(estimates|invoices)\/[^/]+\/(doc|work-order)(\/|$))/.test(pathname);
  useEffect(() => {
    if (clientPage) { document.documentElement.classList.remove("tw-dark"); return; }
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const h = () => theme === "auto" && applyTheme(theme);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme, clientPage]);

  return (
    <Routes>
      <Route path="/p/:token" element={<PortalPage />} />
      <Route path="/pay/:token" element={<PayPage />} />
      <Route path="/request" element={<LeadForm />} />
      <Route path="/login" element={<AuthPage mode="signin" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/reset" element={<AuthPage mode="reset" />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route element={<Bare />}><Route path="/estimates/:id/doc" element={<EstimateDoc />} /><Route path="/invoices/:id/doc" element={<InvoiceDoc />} /><Route path="/estimates/:id/work-order" element={<WorkOrder />} /></Route>
      <Route element={<Gate />}><Route element={<Guard />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/estimates" element={<Estimates />} />
        <Route path="/estimates/:id" element={<EstimateEditor />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientProfile />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/:workerId/timesheet" element={<OwnerWorkerTimesheet />} />
        <Route path="/timesheet" element={<WorkerTimesheet />} />
        <Route path="/jobs" element={<MyJobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/chats/:id" element={<Chats />} />
        <Route path="/settings" element={<Settings />} />
      </Route></Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
