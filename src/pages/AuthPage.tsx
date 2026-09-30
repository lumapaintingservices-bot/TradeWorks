import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Logo } from "../ui/Logo";
import { hasFirebase } from "../lib/firebase";
import "./auth.css";

export default function AuthPage({ mode }: { mode: "signin" | "signup" | "reset" }) {
  const t = useT();
  const { lang, setLang } = useUi();
  const { user } = useAuth();
  const loc = useLocation();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from || "/"} replace />;

  const message = (e: unknown) => {
    const c = String((e as Error).message);
    if (c.includes("email-already")) return t("That email already has an account.", "Ese correo ya tiene cuenta.");
    if (c.includes("weak-password")) return t("Password must be at least 6 characters.", "La contraseña debe tener al menos 6 caracteres.");
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return t("Wrong email or password.", "Correo o contraseña incorrectos.");
    if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "";
    if (c.includes("popup-blocked")) return t("Your browser blocked the Google window. Allow pop-ups for this site and try again.", "Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.");
    if (c.includes("unauthorized-domain")) return t("This web address is not authorized in Firebase yet.", "Esta dirección web todavía no está autorizada en Firebase.");
    if (c.includes("operation-not-allowed")) return t("Google sign-in is not turned on in Firebase yet.", "El inicio con Google todavía no está activado en Firebase.");
    if (c.includes("network-request-failed")) return t("No connection. Check your internet and try again.", "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    if (c.includes("too-many-requests")) return t("Too many attempts. Wait a few minutes and try again.", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
    if (c.includes("user-disabled")) return t("This account is disabled.", "Esta cuenta está desactivada.");
    const code = /auth\/[a-z-]+/i.exec(c)?.[0];
    return t("Something went wrong. Try again.", "Algo salió mal. Inténtalo de nuevo.") + (code ? ` (${code})` : "");
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setErr(""); setBusy(true);
    try {
      if (mode === "signup") { if (pw.length < 6) throw new Error("weak-password"); await backend.signUp(name.trim(), email.trim(), pw); }
      else if (mode === "signin") await backend.signIn(email.trim(), pw);
      else { await backend.reset(email.trim()); setSent(true); }
    } catch (e) { setErr(message(e)); } finally { setBusy(false); }
  };
  const google = async () => { setErr(""); setBusy(true); try { await backend.signInWithGoogle(); } catch (e) { setErr(message(e)); } finally { setBusy(false); } };
  const title = { signin: t("Sign in", "Iniciar sesión"), signup: t("Create your account", "Crea tu cuenta"), reset: t("Reset password", "Restablecer contraseña") }[mode];

  return (
    <div className="auth">
      <form className="auth-card card" onSubmit={submit}>
        <div className="auth-top"><Logo size={40} /><b>TradeWorks</b>
          <div className="seg">{(["en", "es"] as const).map((l) => <button type="button" key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        </div>
        <h1>{title}</h1>
        {mode === "signup" && <label className="f">{t("Your name", "Tu nombre")}<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>}
        <label className="f">{t("Email", "Correo")}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        {mode !== "reset" && <label className="f">{t("Password", "Contraseña")}<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>}
        {err && <p className="err" role="alert">{err}</p>}
        {sent && <p className="muted" style={{ marginBottom: 12 }}>{t("If that email has an account, a reset link is on its way.", "Si ese correo tiene cuenta, te enviamos un enlace.")}</p>}
        <button className="btn pri" style={{ width: "100%", height: 42 }} disabled={busy}>{mode === "reset" ? t("Send reset link", "Enviar enlace") : title}</button>
        {hasFirebase && mode !== "reset" && <>
          <div className="auth-or"><span>{t("or", "o")}</span></div>
          <button type="button" className="btn auth-google" style={{ width: "100%", height: 42 }} disabled={busy} onClick={google}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            {t("Continue with Google", "Continuar con Google")}
          </button></>}
        <div className="auth-links">
          {mode === "signin" && <><Link to="/signup">{t("Create an account", "Crear cuenta")}</Link><Link to="/reset">{t("Forgot password?", "¿Olvidaste tu contraseña?")}</Link></>}
          {mode !== "signin" && <Link to="/login">{t("I already have an account", "Ya tengo cuenta")}</Link>}
        </div>
      </form>
    </div>
  );
}
