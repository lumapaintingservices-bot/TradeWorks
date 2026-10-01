import { Component, type ErrorInfo, type ReactNode } from "react";
import "../pages/auth.css";

const es = () => { try { return (localStorage.getItem("tw.lang") || navigator.language || "").startsWith("es"); } catch { return false; } };
/** A new version was published while this page was open: its old code files are gone. */
const isStaleChunk = (e: unknown) => /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(String((e as Error)?.message || e));

/**
 * Last line of defense: if a screen crashes, show a message with "Reload" (and the error, so a screenshot tells us what
 * failed) instead of a blank white page. After a new version is published, it reloads by itself once.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("TradeWorks crashed:", error, info.componentStack);
    if (isStaleChunk(error)) {
      try {
        if (!sessionStorage.getItem("tw.reloaded")) { sessionStorage.setItem("tw.reloaded", "1"); window.location.reload(); }
      } catch { /* storage blocked: the button below still works */ }
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const sp = es(), msg = String((this.state.error as Error)?.message || this.state.error).slice(0, 300);
    return (
      <div className="auth" role="alert">
        <div className="auth-card card">
          <h1>{sp ? "Algo salió mal" : "Something went wrong"}</h1>
          <p className="muted" style={{ marginBottom: 16 }}>{sp ? "Esta pantalla tuvo un error. Toca Recargar; tus datos están a salvo." : "This screen hit an error. Tap Reload; your data is safe."}</p>
          <button className="btn pri" style={{ width: "100%", height: 42 }} onClick={() => { try { sessionStorage.removeItem("tw.reloaded"); } catch { /* ignore */ } window.location.reload(); }}>
            {sp ? "Recargar" : "Reload"}</button>
          <button className="btn" style={{ width: "100%", height: 42, marginTop: 8 }} onClick={() => { window.location.href = "/"; }}>{sp ? "Ir al inicio" : "Go to start"}</button>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 14, wordBreak: "break-word" }}>{sp ? "Detalle (para soporte): " : "Details (for support): "}{msg}</p>
        </div>
      </div>
    );
  }
}
