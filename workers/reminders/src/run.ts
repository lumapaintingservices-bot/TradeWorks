/**
 * The daily reminders run, for every company that turned on "Automatic reminders by e-mail" (Settings > Leads & messages).
 * Everything the app would put in "Who to write to today" is computed with the same code (src/lib/followups.ts,
 * src/lib/autoEmail.ts), so the worker and the app always agree. Each e-mail is logged first in
 * companies/{cid}/autoemails/{id} with a create-if-missing write, so it can never go out twice (not even when two runs overlap).
 */
import { autoEmailOn, planEmails, withPayLink, type PlanInput, type PlannedEmail } from "../../../src/lib/autoEmail";
import { billingState } from "../../../src/lib/billing";
import { asInv } from "../../../src/lib/invoices";
import { payModel } from "../../../src/lib/paylink";
import { brandOf, newToken, type Brand } from "../../../src/lib/portal";
import { defaultSettings } from "../../../src/lib/settings";
import type { Client, Estimate, Invoice, Settings } from "../../../src/lib/types";

export type Doc = { id: string; data: Record<string, any> };
export type Db = {
  list(path: string): Promise<Doc[]>;
  get(path: string): Promise<Doc | null>;
  create(path: string, data: Record<string, unknown>): Promise<boolean>;
  set(path: string, data: Record<string, unknown>): Promise<void>;
  patch(path: string, data: Record<string, unknown>): Promise<void>;
};
export type Mail = { from: string; to: string; replyTo?: string; subject: string; text: string };
export type Env = { APP_URL?: string; MAIL_FROM_ADDRESS?: string; ENFORCE_BILLING?: string };
export type RunOptions = { dry?: boolean; only?: string; now?: Date; log?: (msg: string) => void };
export type CompanyResult = { company: string; skipped?: string; planned: number; sent: number; failed: number; emails: { to: string; subject: string; status: string }[] };

const rows = <T,>(docs: Doc[]) => docs.map((d) => ({ ...d.data, id: d.id }) as unknown as T);
/** "Luma Painting" <avisos@x.com>: the business name without characters that could break the header. */
export const fromHeader = (name: string, address: string) => `"${String(name || "TradeWorks").replace(/["<>\r\n\\]/g, "").slice(0, 70)}" <${address}>`;

/** One company: plan, (create missing payment links), log, send. */
export async function runCompany(db: Db, send: (m: Mail) => Promise<void>, env: Env, cid: string, company: Record<string, any>, opt: RunOptions = {}): Promise<CompanyResult> {
  const res: CompanyResult = { company: cid, planned: 0, sent: 0, failed: 0, emails: [] };
  const base = `companies/${cid}`;
  const sdoc = await db.get(`${base}/settings/main`);
  const settings = { ...defaultSettings(), ...(sdoc?.data || {}) } as Settings;
  if (!autoEmailOn(settings)) return { ...res, skipped: "off" };
  if (env.ENFORCE_BILLING === "1" && !billingState(company as never, opt.now).canWrite) return { ...res, skipped: "plan expired" };

  const [estimates, clients, invoices, logDocs] = await Promise.all([
    db.list(`${base}/estimates`), db.list(`${base}/clients`), db.list(`${base}/invoices`), db.list(`${base}/autoemails`)]);
  const origin = String(env.APP_URL || "").replace(/\/+$/, "");
  const business = { name: String(company.name || ""), phone: String(company.phone || ""), email: String(company.email || ""), website: String(company.website || "") };
  const inp: PlanInput = {
    estimates: rows<Estimate>(estimates).filter((e) => !(e as { deleted?: boolean }).deleted), clients: rows<Client>(clients), invoices: rows<Invoice>(invoices),
    settings, business, origin, sent: new Set(logDocs.map((d) => d.id)), now: opt.now,
  };
  const plan = planEmails(inp);
  res.planned = plan.length;
  for (let p of plan) {
    if (opt.dry) { res.emails.push({ to: p.to, subject: p.subject, status: "dry-run" }); continue; }
    if (p.needsPayLink) p = await ensurePayLink(db, cid, company, inp, p);
    const logPath = `${base}/autoemails/${p.id}`;
    const at = (opt.now || new Date()).toISOString();
    const fresh = await db.create(logPath, { item: p.id, kind: p.kind, estId: p.estId || "", invId: p.invId || "", to: p.to, subject: p.subject, status: "sending", sentAt: at, companyId: cid });
    if (!fresh) continue; // another run got it first
    try {
      await send({ from: fromHeader(business.name, String(env.MAIL_FROM_ADDRESS || "")), to: p.to, replyTo: business.email || undefined, subject: p.subject, text: p.body });
      await db.patch(logPath, { status: "sent" });
      res.sent++; res.emails.push({ to: p.to, subject: p.subject, status: "sent" });
    } catch (err) {
      await db.patch(logPath, { status: "failed", error: String((err as Error)?.message || err).slice(0, 300) }).catch(() => {});
      res.failed++; res.emails.push({ to: p.to, subject: p.subject, status: "failed" });
      opt.log?.(`[${cid}] send failed for ${p.id}: ${String((err as Error)?.message || err)}`);
    }
  }
  return res;
}

/** Money reminder about an invoice with no payment link yet: create the link (same shape the app writes) and use it in the text. */
async function ensurePayLink(db: Db, cid: string, company: Record<string, any>, inp: PlanInput, p: PlannedEmail): Promise<PlannedEmail> {
  const inv0 = inp.invoices.find((v) => v.id === p.invId), e = inp.estimates.find((x) => x.id === p.estId);
  if (!inv0 || !e) return { ...p, needsPayLink: false };
  const v = asInv(inv0);
  const token = newToken();
  const brand = brandOf({ name: "", phone: "", email: "", website: "", area: "", logoUrl: "", brandColor: "", ...company } as Brand);
  await db.create(`paylink/${token}`, { owner: cid, invId: v.id, data: JSON.stringify(payModel(v, e, inp.settings, brand)), client: {}, updatedAt: new Date() });
  await db.patch(`companies/${cid}/invoices/${v.id}`, { pay: { token } });
  v.pay = { token }; // later reminders in this run reuse it
  return withPayLink(p, inp, token);
}

/** Every company (or only `opt.only`). Errors in one company never stop the others. */
export async function runAll(db: Db, send: (m: Mail) => Promise<void>, env: Env, opt: RunOptions = {}): Promise<CompanyResult[]> {
  const companies = opt.only ? [await db.get(`companies/${opt.only}`)].filter(Boolean) as Doc[] : await db.list("companies");
  const out: CompanyResult[] = [];
  for (const c of companies) {
    try { out.push(await runCompany(db, send, env, c.id, c.data, opt)); }
    catch (err) { opt.log?.(`[${c.id}] ${String((err as Error)?.message || err)}`); out.push({ company: c.id, skipped: "error", planned: 0, sent: 0, failed: 0, emails: [] }); }
  }
  return out;
}
