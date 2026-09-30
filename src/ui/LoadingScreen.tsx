import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { Logo } from "./Logo";
import "./loading.css";

/** Shown while the signed-in account is loading (instead of a blank page), so a slow sign-in never looks frozen. */
export function LoadingScreen() {
  const t = useT();
  const { loadingAccount } = useAuth();
  return (
    <div className="loading-wrap" role="status" aria-live="polite">
      <div className="loading-screen">
        <Logo size={40} />
        <span className="loading-dot" aria-hidden />
        <p className="muted">{loadingAccount ? t("Signing you in…", "Iniciando sesión…") : t("Loading…", "Cargando…")}</p>
      </div>
    </div>
  );
}
