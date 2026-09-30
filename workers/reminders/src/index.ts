/**
 * TradeWorks daily reminders — Cloudflare Worker (cron). Deploy steps: workers/reminders/README.md.
 *
 * Secrets:  FIREBASE_SERVICE_ACCOUNT (the service-account JSON, same as billing), RESEND_API_KEY, RUN_TOKEN (for /run)
 * Vars:     APP_URL (https://tradeworks-app.pages.dev), MAIL_FROM_ADDRESS (an address on a domain verified in Resend),
 *           ENFORCE_BILLING ("1" only once TradeWorks subscriptions are live: then expired companies get no e-mails)
 *
 * Cron: once a day (wrangler.toml). Manual run:  POST /run?dry=1[&company=<id>]  with header  Authorization: Bearer <RUN_TOKEN>
 * (dry=1 lists what WOULD be sent, sends nothing and logs nothing).
 */
import { firestore } from "../../../functions/_lib/firestore.js";
import { runAll, type Db, type Env as RunEnv, type Mail } from "./run";

type Env = RunEnv & { FIREBASE_SERVICE_ACCOUNT?: string; FIREBASE_PROJECT_ID?: string; RESEND_API_KEY?: string; RUN_TOKEN?: string };

const missing = (env: Env) => ["FIREBASE_SERVICE_ACCOUNT", "RESEND_API_KEY", "APP_URL", "MAIL_FROM_ADDRESS"].filter((k) => !env[k as keyof Env]);

/** Resend (https://resend.com/docs/api-reference/emails/send-email). */
export const resendSender = (apiKey: string, fetchImpl: typeof fetch = fetch) => async (m: Mail) => {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

async function run(env: Env, opt: { dry?: boolean; only?: string } = {}) {
  const miss = missing(env);
  if (miss.length) throw new Error("Missing settings on the worker: " + miss.join(", "));
  const db = firestore(env) as unknown as Db;
  return runAll(db, resendSender(env.RESEND_API_KEY!), env, { ...opt, log: (m) => console.log(m) });
}

/** Constant-time compare for the /run token. */
function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(run(env).then((r) => console.log(JSON.stringify(r.map(({ emails: _e, ...x }) => x)))).catch((e) => console.error(String(e?.message || e))));
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") return new Response("TradeWorks reminders", { status: 200 });
    if (request.method !== "POST") return new Response("Use POST", { status: 405 });
    const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.RUN_TOKEN || !sameToken(auth, env.RUN_TOKEN)) return new Response("Unauthorized", { status: 401 });
    try {
      const out = await run(env, { dry: url.searchParams.get("dry") === "1", only: url.searchParams.get("company") || undefined });
      return Response.json(out);
    } catch (e) {
      return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
    }
  },
};
