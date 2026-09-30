import type { Role } from "../lib/roles";
export type { Role };

export type User = { uid: string; name: string; email: string; emailVerified?: boolean };
export type Company = {
  id: string; name: string; phone: string; email: string; website: string; area: string; logoUrl: string;
  brandColor: string; trade: string; ownerUid: string;
  /** Printed on client documents. */
  address?: string; hours?: string; hoursEs?: string;
  pricing: { door: number; drawer: number; depositPct: number };
  onboarded: boolean;
  /* --- TradeWorks subscription (see docs/08-billing-setup.md). Dates are ISO strings written by the billing
     backend / company creation; billingState() also accepts numbers, Dates and Firestore Timestamps. --- */
  plan?: "trial" | "pro";
  subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused" | string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  /** When the first failed payment happened (starts the 7-day grace). Set by the webhook, cleared when paid. */
  pastDueSince?: string | null;
  /* --- Card payments on invoice links: the company's own Stripe account (Stripe Connect), written only by the server
     (functions/api/connect, functions/_lib/connect.js). stripeReady = Stripe lets it take payments. --- */
  stripeAccountId?: string;
  stripeReady?: boolean;
  stripeDetails?: boolean;
  stripeCheckedAt?: string;
};
/** A company the signed-in user belongs to, with their role in it (companies/{cid}/members/{uid}). */
export type Membership = { company: Company; role: Role; workerId?: string };
/** Light entry for the workspace switcher. */
export type CompanyRef = { id: string; name: string; logoUrl: string; role: Role };
/** companies/{cid}/members/{uid} */
export type Member = { uid: string; role: Role; workerId?: string; name?: string; email?: string };
/** invites/{emailLower}. `email` is the document id. */
export type Invite = { email: string; companyId: string; companyName: string; role: Role; workerId?: string; invitedBy: string; invitedByName?: string };
