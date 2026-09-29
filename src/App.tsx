import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Shell from "./layout/Shell";
import AuthPage from "./pages/AuthPage";
import Calendar from "./pages/Calendar";
import { useCalendarFeedSync } from "./pages/settings/calendarFeed";
import Clients from "./pages/Clients";
import Dashboard from "./pages/Dashboard";
import EstimateDoc from "./pages/estimate/EstimateDoc";
import EstimateEditor from "./pages/estimate/EstimateEditor";
import Estimates from "./pages/Estimates";
import Onboarding from "./pages/Onboarding";
import LeadForm from "./pages/public/LeadForm";
import PortalPage from "./pages/public/PortalPage";
import InvoiceDoc from "./pages/InvoiceDoc";
import Invoices from "./pages/Invoices";
import Pipeline from "./pages/Pipeline";
import Team from "./pages/Team";
import Expenses from "./pages/Expenses";
import WorkOrder from "./pages/estimate/WorkOrder";
import Placeholder from "./pages/Placeholder";
import Settings from "./pages/Settings";
import { applyTheme, useUi } from "./store/ui";

function FeedSync() { useCalendarFeedSync(); return null; }

function Gate() {
  const { ready, user, company } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!company?.onboarded) return <Navigate to="/onboarding" replace />;
  return <><FeedSync /><Shell /></>;
}

function Bare() {
  const { ready, user, company } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!company?.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

const P = (en: string, es: string, icon: string, phase: number) => <Placeholder en={en} es={es} icon={icon} phase={phase} />;

export default function App() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const h = () => theme === "auto" && applyTheme(theme);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme]);

  return (
    <Routes>
      <Route path="/p/:token" element={<PortalPage />} />
      <Route path="/request" element={<LeadForm />} />
      <Route path="/login" element={<AuthPage mode="signin" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/reset" element={<AuthPage mode="reset" />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<Bare />}><Route path="/estimates/:id/doc" element={<EstimateDoc />} /><Route path="/invoices/:id/doc" element={<InvoiceDoc />} /><Route path="/estimates/:id/work-order" element={<WorkOrder />} /></Route>
      <Route element={<Gate />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/estimates" element={<Estimates />} />
        <Route path="/estimates/:id" element={<EstimateEditor />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={P("Reports", "Reportes", "chart", 6)} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
