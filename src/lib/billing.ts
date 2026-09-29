/**
 * TradeWorks' OWN subscription rules (contractors pay TradeWorks; their clients pay them by Zelle - unrelated).
 * Pure functions only, so they are unit-tested (billing.test.ts) and can be reused by the banner and the card.
 *
 * Rules
 *  - New company: 14-day free trial (`trialEndsAt`, written at creation; falls back to createdAt + 14 days).
 *  - plan "pro" + status active/trialing (or no status): ACTIVE. Never locked because of a late webhook.
 *  - status past_due: 7-day GRACE counted from `pastDueSince` (or the period end if that is missing). Still editable.
 *  - Trial over, or subscription canceled/unpaid/paused, or grace over: EXPIRED = read-only. Nothing is ever deleted.
 *  - A company with no date information at all (older records) is treated as a fresh trial and never locked.
 */
import type { Company } from "../auth/types";

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
/** The banner starts showing when the trial has this many days (or fewer) left. */
export const WARN_DAYS = 3;
const DAY = 86_400_000;

/** The billing feature is OFF unless the owner sets VITE_BILLING_API (see docs/08-billing-setup.md). */
export const BILLING_API: string = String(import.meta.env?.VITE_BILLING_API ?? "").trim().replace(/\/+$/, "");
export const billingEnabled = (): boolean => BILLING_API !== "";

export type BillingStatus = "trial" | "active" | "grace" | "expired";
export type BillingState = {
  status: BillingStatus;
  /** trial: days until it ends; grace: days until editing locks; active: days to the next renewal (0 if unknown); expired: 0 */
  daysLeft: number;
  /** false only when expired (read-only). */
  canWrite: boolean;
  message: { en: string; es: string };
  /** how loud the app-wide banner should be ("none" = do not show it). */
  level: "none" | "warn" | "bad";
};

type BillingCompany = Partial<Pick<Company, "plan" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd" | "pastDueSince" | "stripeSubscriptionId">> & { createdAt?: unknown };

/** Accepts ISO string, epoch ms, Date, or a Firestore Timestamp ({seconds} / toMillis()). Anything else -> null. */
export function toMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") { const n = Date.parse(v); return Number.isNaN(n) ? null : n; }
  if (typeof v === "object") {
    const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof o.toMillis === "function") { const n = o.toMillis(); return Number.isFinite(n) ? n : null; }
    const s = o.seconds ?? o._seconds;
    if (typeof s === "number") return s * 1000;
  }
  return null;
}

const daysUntil = (end: number, now: number) => Math.max(0, Math.ceil((end - now) / DAY));
const plural = (n: number, en: [string, string], es: [string, string]) => ({ en: `${n} ${n === 1 ? en[0] : en[1]}`, es: `${n} ${n === 1 ? es[0] : es[1]}` });

export function billingState(company: BillingCompany | null | undefined, now: Date | number = Date.now()): BillingState {
  const at = now instanceof Date ? now.getTime() : now;
  const c = company ?? {};
  const sub = c.subscriptionStatus;
  const paid = (c.plan === "pro" || !!c.stripeSubscriptionId) && sub !== "incomplete";

  if (paid) {
    if (!sub || sub === "active" || sub === "trialing") {
      const end = toMs(c.currentPeriodEnd);
      return { status: "active", daysLeft: end ? daysUntil(end, at) : 0, canWrite: true, level: "none",
        message: { en: "TradeWorks Pro is active.", es: "TradeWorks Pro está activo." } };
    }
    if (sub === "past_due") {
      const since = toMs(c.pastDueSince) ?? toMs(c.currentPeriodEnd) ?? at;
      const end = since + GRACE_DAYS * DAY;
      if (at < end) {
        const d = daysUntil(end, at);
        const en = plural(d, ["day", "days"], ["día", "días"]);
        return { status: "grace", daysLeft: d, canWrite: true, level: "warn",
          message: {
            en: `Your last payment did not go through. Update your card within ${en.en} to keep editing.`,
            es: `No se pudo cobrar tu último pago. Actualiza tu tarjeta en ${en.es} para seguir editando.`,
          } };
      }
    }
    // canceled / unpaid / paused / incomplete_expired / grace over
    return { status: "expired", daysLeft: 0, canWrite: false, level: "bad",
      message: {
        en: "Your subscription is not active, so TradeWorks is read-only. Your data is safe. Subscribe to keep adding and editing.",
        es: "Tu suscripción no está activa, por eso TradeWorks está en solo lectura. Tus datos están seguros. Suscríbete para seguir agregando y editando.",
      } };
  }

  // Free trial
  const created = toMs(c.createdAt);
  const end = toMs(c.trialEndsAt) ?? (created != null ? created + TRIAL_DAYS * DAY : null);
  if (end == null) {
    return { status: "trial", daysLeft: TRIAL_DAYS, canWrite: true, level: "none",
      message: { en: `Free trial: ${TRIAL_DAYS} days left.`, es: `Prueba gratis: quedan ${TRIAL_DAYS} días.` } };
  }
  if (at < end) {
    const d = daysUntil(end, at);
    const p = plural(d, ["day", "days"], ["día", "días"]);
    return { status: "trial", daysLeft: d, canWrite: true, level: d <= WARN_DAYS ? "warn" : "none",
      message: { en: `Free trial: ${p.en} left.`, es: `Prueba gratis: quedan ${p.es}.` } };
  }
  return { status: "expired", daysLeft: 0, canWrite: false, level: "bad",
    message: {
      en: "Your free trial has ended, so TradeWorks is read-only. Your data is safe. Subscribe to keep adding and editing.",
      es: "Tu prueba gratis terminó, por eso TradeWorks está en solo lectura. Tus datos están seguros. Suscríbete para seguir agregando y editando.",
    } };
}
