import { useState } from "react";
import { roleLabel } from "../lib/roles";
import { useT } from "../i18n";
import { useUi } from "../store/ui";
import { Logo } from "../ui/Logo";
import { backend } from "./backend";
import { useAuth } from "./AuthProvider";
import "./invite.css";

/** Shared actions for the banner and the full-page prompt. */
function useInviteActions() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { invite, acceptInvite, refreshVerification, resendVerification, dismissInvite } = useAuth();
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>, done?: string) => async () => {
    setBusy(true);
    try { await fn(); if (done) toast(done); } catch { toast(t("Something went wrong. Try again.", "Algo salió mal. Inténtalo de nuevo.")); } finally { setBusy(false); }
  };
  return {
    invite, busy, dismissInvite,
    join: run(acceptInvite),
    verified: run(async () => {
      await refreshVerification();
    }),
    resend: run(resendVerification, t("Verification email sent", "Correo de verificación enviado")),
  };
}

function Text({ full }: { full?: boolean }) {
  const t = useT();
  const { invite } = useAuth();
  const { user } = useAuth();
  if (!invite) return null;
  const [rEn, rEs] = roleLabel(invite.invite.role);
  const name = invite.invite.companyName || t("a company", "una empresa");
  const by = invite.invite.invitedByName;
  if (invite.state === "needs-verify") return (
    <span className="inv-txt">
      <b>{t(`You were invited to ${name}.`, `Te invitaron a ${name}.`)}</b>{" "}
      {t(`Verify ${user?.email} first (we emailed you a link — it can take a minute, and often lands in your spam folder), then press "I verified".`, `Primero verifica ${user?.email} (te enviamos un enlace — puede tardar un minuto y muchas veces cae en la carpeta de spam) y luego pulsa "Ya verifiqué".`)}
    </span>
  );
  return (
    <span className="inv-txt">
      <b>{t(`You were invited to ${name}`, `Te invitaron a ${name}`)}</b>{" "}
      {full
        ? t(`as ${rEn}${by ? ` by ${by}` : ""}.`, `como ${rEs}${by ? ` por ${by}` : ""}.`)
        : <span className="muted">· {t(rEn, rEs)}</span>}
    </span>
  );
}

/** Slim bar shown inside the app (and anywhere else after sign-in) when the signed-in e-mail has a pending team invite. */
export function InviteBanner() {
  const t = useT();
  const a = useInviteActions();
  if (!a.invite) return null;
  return (
    <div className="inv-bar" role="status">
      <Text />
      <span className="inv-act">
        {a.invite.state === "accept" ? <>
          <button className="btn pri sm" disabled={a.busy} onClick={a.join}>{t("Join", "Unirme")}</button>
          <button className="btn sm" disabled={a.busy} onClick={a.dismissInvite}>{t("Not now", "Ahora no")}</button>
        </> : <>
          <button className="btn pri sm" disabled={a.busy} onClick={a.verified}>{t("I verified", "Ya verifiqué")}</button>
          <button className="btn sm" disabled={a.busy} onClick={a.resend}>{t("Resend email", "Reenviar correo")}</button>
          <button className="btn sm" disabled={a.busy} onClick={a.dismissInvite}>{t("Not now", "Ahora no")}</button>
        </>}
      </span>
    </div>
  );
}

/** Full-page version for a brand-new account that has an invite but no company yet (replaces the create-company wizard). */
export function JoinPrompt({ onSkip }: { onSkip(): void }) {
  const t = useT();
  const a = useInviteActions();
  const { user } = useAuth();
  if (!a.invite) return null;
  return (
    <div className="auth">
      <div className="auth-card card inv-full">
        <div className="auth-top"><Logo size={40} /><b>TradeWorks</b></div>
        <h1>{t("You have been invited", "Te invitaron")}</h1>
        <p className="inv-p"><Text full /></p>
        {a.invite.state === "needs-verify" && <p className="muted inv-p">{t(`Signed in as ${user?.email}.`, `Sesión iniciada como ${user?.email}.`)}</p>}
        {a.invite.state === "accept"
          ? <button className="btn pri" style={{ width: "100%", height: 42 }} disabled={a.busy} onClick={a.join}>{t("Join", "Unirme")} {a.invite.invite.companyName}</button>
          : <div className="inv-col">
              <button className="btn pri" style={{ width: "100%", height: 42 }} disabled={a.busy} onClick={a.verified}>{t("I verified my email", "Ya verifiqué mi correo")}</button>
              <button className="btn" style={{ width: "100%" }} disabled={a.busy} onClick={a.resend}>{t("Resend verification email", "Reenviar correo de verificación")}</button>
            </div>}
        <div className="auth-links">
          <button className="link-btn" onClick={onSkip}>{t("Create my own company instead", "Crear mi propia empresa")}</button>
          <button className="link-btn" onClick={() => backend.signOut()}>{t("Sign out", "Salir")}</button>
        </div>
      </div>
    </div>
  );
}
