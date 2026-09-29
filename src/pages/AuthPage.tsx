import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { backend } from "../auth/backend";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Logo } from "../ui/Logo";
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
    return t("Something went wrong. Try again.", "Algo salió mal. Inténtalo de nuevo.");
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setErr(""); setBusy(true);
    try {
      if (mode === "signup") { if (pw.length < 6) throw new Error("weak-password"); await backend.signUp(name.trim(), email.trim(), pw); }
      else if (mode === "signin") await backend.signIn(email.trim(), pw);
      else { await backend.reset(email.trim()); setSent(true); }
    } catch (e) { setErr(message(e)); } finally { setBusy(false); }
  };
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
        <div className="auth-links">
          {mode === "signin" && <><Link to="/signup">{t("Create an account", "Crear cuenta")}</Link><Link to="/reset">{t("Forgot password?", "¿Olvidaste tu contraseña?")}</Link></>}
          {mode !== "signin" && <Link to="/login">{t("I already have an account", "Ya tengo cuenta")}</Link>}
        </div>
      </form>
    </div>
  );
}
