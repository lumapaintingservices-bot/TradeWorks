/**
 * Referral program — who referred whom, and the thank-you reward the referrer earns once the friend's job is paid in full.
 * Pure functions, no I/O. The link itself (clientProfile.referralLink) already saves new leads with `referredBy`.
 *
 * Reward rule: a referred client (friend) with at least one job Paid in Full earns the referrer ONE reward (per friend).
 * The owner marks it paid in the referrer's profile (friend.refReward); that can also log a marketing expense with
 * source "Referral", so Reports > marketing ROI counts it.
 */
import { calcEstimate } from "./estimate";
import { jobStatus } from "./jobStatus";
import { money, num, r2 } from "./money";
import type { Client, Estimate, Invoice, Settings } from "./types";

export type ReferralProgram = NonNullable<Settings["referral"]>;
export const DEFAULT_REWARD = 50;
export const programOn = (s: Pick<Settings, "referral">) => !!s.referral?.on;
export const rewardAmount = (s: Pick<Settings, "referral">) => r2(num(s.referral?.amount) || DEFAULT_REWARD);

/** What the referrer gets, in the client's language: the owner's own words, else "$50 off your next job". */
export function rewardText(s: Pick<Settings, "referral">, es: boolean): string {
  const r = s.referral || {};
  const own = (es ? r.rewardEs || r.rewardEn : r.rewardEn || r.rewardEs) || "";
  if (own.trim()) return own.trim();
  const amt = money(rewardAmount(s));
  return es ? `${amt} de descuento en su próximo trabajo` : `${amt} off your next job`;
}

export type RefStatus = "lead" | "won" | "paid";
export type RefRow = {
  friend: Client; referrer: Client;
  /** lead = no job won yet; won = a job accepted; paid = a job paid in full (reward earned). */
  status: RefStatus;
  /** Sum of the friend's won jobs. */
  value: number;
  reward: "none" | "earned" | "paid";
};

const WON = ["Accepted", "Deposit Paid", "Paid in Full"];

/** Every referred client whose referrer still exists, newest first. Archived friends are left out. */
export function referralRows(clients: Client[], estimates: Estimate[], invoices: Invoice[], settings: Settings): RefRow[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out: RefRow[] = [];
  for (const friend of clients) {
    const referrer = friend.referredBy ? byId.get(friend.referredBy) : undefined;
    if (!referrer || friend.archived || referrer.id === friend.id) continue;
    let value = 0, won = false, paid = false;
    for (const e of estimates) {
      if (e.clientId !== friend.id) continue;
      const st = jobStatus(e, invoices);
      if (WON.includes(st)) { won = true; value += calcEstimate(e, settings).total; }
      if (st === "Paid in Full") paid = true;
    }
    const status: RefStatus = paid ? "paid" : won ? "won" : "lead";
    out.push({ friend, referrer, status, value: r2(value), reward: friend.refReward ? "paid" : paid ? "earned" : "none" });
  }
  const at = (c: Client) => String(c.createdAt || "");
  return out.sort((a, b) => at(b.friend).localeCompare(at(a.friend)));
}

/** Rewards earned but not given yet (only while the program is on). */
export const rewardsDue = (rows: RefRow[], s: Pick<Settings, "referral">) => (programOn(s) ? rows.filter((r) => r.reward === "earned") : []);

/** The friend's record once the reward is given (and the marketing expense it logged, if any). */
export const markRewardPaid = (friend: Client, amount: number, paidAt: string, method?: string, expenseId?: string): Client =>
  ({ ...friend, refReward: { amount: r2(num(amount)), paidAt, ...(method ? { method } : {}), ...(expenseId ? { expenseId } : {}) } });

/** Expense for a reward, so marketing ROI counts it under the "Referral" source. */
export const rewardExpense = (id: string, referrer: Client, friend: Client, amount: number, date: string, method?: string) => ({
  id, date, vendor: referrer.name || "Referral", amount: r2(num(amount)), category: "ads", source: "Referral", method: method || "",
  note: `Referral reward — ${friend.name || ""}`,
});
