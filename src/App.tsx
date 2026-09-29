import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Shell from "./layout/Shell";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Placeholder from "./pages/Placeholder";
import Settings from "./pages/Settings";
import { applyTheme, useUi } from "./store/ui";

function Gate() {
  const { ready, user, company } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!company?.onboarded) return <Navigate to="/onboarding" replace />;
  return <Shell />;
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
      <Route path="/login" element={<AuthPage mode="signin" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/reset" element={<AuthPage mode="reset" />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<Gate />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={P("Pipeline", "Embudo", "leads", 4)} />
        <Route path="/calendar" element={P("Calendar", "Calendario", "chart", 4)} />
        <Route path="/estimates" element={P("Estimates", "Presupuestos", "estimates", 2)} />
        <Route path="/invoices" element={P("Invoices", "Facturas", "invoices", 4)} />
        <Route path="/clients" element={P("Clients", "Clientes", "clients", 2)} />
        <Route path="/expenses" element={P("Expenses", "Gastos", "chart", 5)} />
        <Route path="/reports" element={P("Reports", "Reportes", "chart", 6)} />
        <Route path="/team" element={P("Team", "Equipo", "clients", 5)} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
