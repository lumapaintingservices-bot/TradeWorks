import { useEffect, useState } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { DEFAULT_REWARD, rewardText } from "../../lib/referrals";
import { useUi } from "../../store/ui";

/** Settings card: referral program on/off and the reward a client gets when a friend they referred pays a job in full. */
export default function ReferralCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { settings, update, loading } = useSettings();
  const [f, setF] = useState({ on: false, amount: String(DEFAULT_REWARD), rewardEn: "", rewardEs: "" });
  useEffect(() => {
    if (loading) return;
    const r = settings.referral || {};
    setF({ on: !!r.on, amount: String(r.amount ?? DEFAULT_REWARD), rewardEn: r.rewardEn || "", rewardEs: r.rewardEs || "" });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = Math.max(0, Math.round((Number(f.amount) || 0) * 100) / 100);
  const preview = { referral: { amount, rewardEn: f.rewardEn, rewardEs: f.rewardEs } };
  const save = async () => {
    await update({ referral: { on: f.on, amount, rewardEn: f.rewardEn.trim(), rewardEs: f.rewardEs.trim() } });
    toast(t("Saved", "Guardado"));
  };

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <div className="card-h"><h2>{t("Referral program", "Programa de referidos")}</h2></div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t(
          "Each client has a personal link (in their profile). When a friend who came through it pays a job in full, the client earns this reward: it shows up in “Who to write to today” with a thank-you message, and you mark it given in their profile. The review request and the paid invoice also invite clients to share their link.",
          "Cada cliente tiene un link personal (en su perfil). Cuando un amigo que llegó por ese link paga un trabajo completo, el cliente gana esta recompensa: aparece en “A quién escribirle hoy” con un mensaje de agradecimiento, y tú la marcas como entregada en su perfil. La petición de reseña y la factura pagada también invitan a compartir el link.")}</p>
        <label className="chk" style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          <input type="checkbox" role="switch" className="sw" checked={f.on} onChange={(e) => setF({ ...f, on: e.target.checked })} />{t("Reward clients who refer friends", "Premiar a los clientes que recomiendan amigos")}</label>
        <div style={{ opacity: f.on ? 1 : 0.55 }}>
          <label className="f">{t("Reward value ($) — for your records and the default text", "Valor de la recompensa ($) — para tus registros y el texto por defecto")}
            <input type="number" min={0} step={5} inputMode="decimal" disabled={!f.on} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ maxWidth: 140, display: "block" }} /></label>
          <div className="grid2">
            <label className="f">{t("What they get (English)", "Qué reciben (inglés)")}<input disabled={!f.on} value={f.rewardEn} placeholder={rewardText({ referral: { amount } }, false)} onChange={(e) => setF({ ...f, rewardEn: e.target.value })} /></label>
            <label className="f">{t("What they get (Spanish)", "Qué reciben (español)")}<input disabled={!f.on} value={f.rewardEs} placeholder={rewardText({ referral: { amount } }, true)} onChange={(e) => setF({ ...f, rewardEs: e.target.value })} /></label>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{t("Clients read: ", "Los clientes leen: ")}“{rewardText(preview, false)}” / “{rewardText(preview, true)}”</p>
        </div>
        <button className="btn pri" onClick={save}>{t("Save", "Guardar")}</button>
      </div>
    </div>
  );
}
