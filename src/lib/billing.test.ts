import { describe, expect, it } from "vitest";
import { billingState, toMs, TRIAL_DAYS, GRACE_DAYS } from "./billing";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 10, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

describe("toMs", () => {
  it("reads ISO, numbers, Dates and Firestore-like timestamps", () => {
    expect(toMs("2026-01-10T12:00:00.000Z")).toBe(T0);
    expect(toMs(T0)).toBe(T0);
    expect(toMs(new Date(T0))).toBe(T0);
    expect(toMs({ seconds: T0 / 1000, nanoseconds: 0 })).toBe(T0);
    expect(toMs({ toMillis: () => T0 })).toBe(T0);
  });
  it("returns null for junk", () => {
    for (const v of [undefined, null, "", "nope", {}, NaN]) expect(toMs(v)).toBeNull();
  });
});

describe("billingState - trial", () => {
  it("14 days left right after creation, no banner", () => {
    const s = billingState({ trialEndsAt: iso(T0 + TRIAL_DAYS * DAY) }, T0);
    expect(s).toMatchObject({ status: "trial", daysLeft: 14, canWrite: true, level: "none" });
    expect(s.message.en).toBe("Free trial: 14 days left.");
    expect(s.message.es).toBe("Prueba gratis: quedan 14 días.");
  });
  it("rounds partial days up and warns at 3 days or fewer", () => {
    const end = T0 + 2 * DAY + 1000;
    expect(billingState({ trialEndsAt: iso(end) }, T0)).toMatchObject({ daysLeft: 3, level: "warn", canWrite: true });
    expect(billingState({ trialEndsAt: iso(T0 + 4 * DAY) }, T0)).toMatchObject({ daysLeft: 4, level: "none" });
  });
  it("singular day wording", () => {
    const s = billingState({ trialEndsAt: iso(T0 + 1000) }, T0);
    expect(s.daysLeft).toBe(1);
    expect(s.message.en).toBe("Free trial: 1 day left.");
    expect(s.message.es).toBe("Prueba gratis: quedan 1 día.");
  });
  it("expires exactly at trialEndsAt and becomes read-only", () => {
    const end = T0 + 5 * DAY;
    expect(billingState({ trialEndsAt: iso(end) }, end - 1).status).toBe("trial");
    const s = billingState({ trialEndsAt: iso(end) }, end);
    expect(s).toMatchObject({ status: "expired", daysLeft: 0, canWrite: false, level: "bad" });
    expect(s.message.en).toMatch(/data is safe/);
    expect(s.message.es).toMatch(/datos están seguros/);
  });
  it("falls back to createdAt + 14 days (Firestore Timestamp) when trialEndsAt is missing", () => {
    const created = { seconds: (T0 - 10 * DAY) / 1000 };
    expect(billingState({ createdAt: created }, T0)).toMatchObject({ status: "trial", daysLeft: 4 });
    expect(billingState({ createdAt: created }, T0 + 5 * DAY)).toMatchObject({ status: "expired", canWrite: false });
  });
  it("older company with no dates is never locked", () => {
    expect(billingState({}, T0)).toMatchObject({ status: "trial", canWrite: true, level: "none" });
    expect(billingState(null, T0)).toMatchObject({ status: "trial", canWrite: true });
    expect(billingState(undefined, T0).canWrite).toBe(true);
  });
  it("an unfinished checkout (incomplete) keeps counting the trial", () => {
    const c = { plan: "pro" as const, subscriptionStatus: "incomplete", trialEndsAt: iso(T0 + 5 * DAY) };
    expect(billingState(c, T0)).toMatchObject({ status: "trial", daysLeft: 5 });
  });
  it("accepts a Date as 'now'", () => {
    expect(billingState({ trialEndsAt: iso(T0 + 2 * DAY) }, new Date(T0)).daysLeft).toBe(2);
  });
});

describe("billingState - paid", () => {
  it("active and trialing subscriptions are active, with renewal countdown", () => {
    const end = iso(T0 + 12 * DAY);
    expect(billingState({ plan: "pro", subscriptionStatus: "active", currentPeriodEnd: end }, T0)).toMatchObject({ status: "active", daysLeft: 12, canWrite: true, level: "none" });
    expect(billingState({ plan: "pro", subscriptionStatus: "trialing" }, T0)).toMatchObject({ status: "active", daysLeft: 0 });
  });
  it("plan pro without a status (granted by hand) is active", () => {
    expect(billingState({ plan: "pro" }, T0).status).toBe("active");
  });
  it("stays active even if the renewal date passed (late webhook must not lock anyone)", () => {
    expect(billingState({ plan: "pro", subscriptionStatus: "active", currentPeriodEnd: iso(T0 - 3 * DAY) }, T0)).toMatchObject({ status: "active", canWrite: true });
  });
  it("an old trial date is ignored once the company is paid", () => {
    expect(billingState({ plan: "pro", subscriptionStatus: "active", trialEndsAt: iso(T0 - 30 * DAY) }, T0).status).toBe("active");
  });
  it("past_due gets a 7-day grace from pastDueSince, still editable, with warning", () => {
    const c = { plan: "pro" as const, subscriptionStatus: "past_due", pastDueSince: iso(T0) };
    expect(billingState(c, T0)).toMatchObject({ status: "grace", daysLeft: GRACE_DAYS, canWrite: true, level: "warn" });
    expect(billingState(c, T0 + 3 * DAY + 1000)).toMatchObject({ status: "grace", daysLeft: 4 });
    const s = billingState(c, T0 + GRACE_DAYS * DAY - 1);
    expect(s).toMatchObject({ status: "grace", daysLeft: 1 });
    expect(s.message.en).toMatch(/within 1 day to keep editing/);
    expect(s.message.es).toMatch(/en 1 día para seguir editando/);
  });
  it("grace ends after 7 days -> expired read-only", () => {
    const c = { plan: "pro" as const, subscriptionStatus: "past_due", pastDueSince: iso(T0) };
    expect(billingState(c, T0 + GRACE_DAYS * DAY)).toMatchObject({ status: "expired", canWrite: false, level: "bad" });
  });
  it("past_due without pastDueSince uses the period end, then now", () => {
    expect(billingState({ plan: "pro", subscriptionStatus: "past_due", currentPeriodEnd: iso(T0 - 2 * DAY) }, T0)).toMatchObject({ status: "grace", daysLeft: 5 });
    expect(billingState({ plan: "pro", subscriptionStatus: "past_due" }, T0)).toMatchObject({ status: "grace", daysLeft: 7 });
  });
  it("canceled, unpaid and paused subscriptions are read-only", () => {
    for (const st of ["canceled", "unpaid", "paused", "incomplete_expired"]) {
      expect(billingState({ plan: "pro", subscriptionStatus: st }, T0)).toMatchObject({ status: "expired", canWrite: false });
    }
  });
  it("a Stripe subscription id alone counts as paid", () => {
    expect(billingState({ stripeSubscriptionId: "sub_1", subscriptionStatus: "canceled" }, T0).status).toBe("expired");
  });
});
