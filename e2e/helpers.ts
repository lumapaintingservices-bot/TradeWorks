import { expect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";

/** Console messages that are not the app's fault (fonts come from Google; the sandbox may have no internet). */
const IGNORED = [/fonts\.(googleapis|gstatic)\.com/i, /ERR_(CERT|NAME|INTERNET|CONNECTION|PROXY|TUNNEL)/i];

export const PW = "secret123";
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * `test` with two extras: Google Fonts are stubbed (deterministic, offline) and every page opened in the test is watched:
 * any console error or uncaught exception fails the test at the end. Tests that expect an error call `allowErrors(/regex/)`.
 */
export const test = base.extend<{ watch: { errors: string[]; allow(re: RegExp): void } }>({
  watch: [async ({ context }, use) => {
    const errors: string[] = [], allowed: RegExp[] = [];
    await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    const hook = (p: Page) => {
      p.on("console", (m) => { if (m.type() === "error" && !IGNORED.some((re) => re.test(m.text() + (m.location().url || "")))) errors.push(`[console] ${m.text()} @ ${m.location().url}`); });
      p.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
    };
    context.pages().forEach(hook); context.on("page", hook);
    await use({ errors, allow: (re) => allowed.push(re) });
    expect(errors.filter((e) => !allowed.some((re) => re.test(e))), "console errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Sign up through the real form, then press "Skip setup" (the company gets the name of the person). Ends on the dashboard. */
export async function signUp(page: Page, name = "Luis Owner", email = uniq("owner") + "@example.com", pw = PW) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL("**/onboarding");
  return { name, email, pw };
}
export async function skipSetup(page: Page) {
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}
export async function signUpAndSkip(page: Page, name = "Luis Owner", email = uniq("owner") + "@example.com") {
  const acct = await signUp(page, name, email);
  await skipSetup(page);
  return acct;
}
export async function signIn(page: Page, email: string, pw = PW) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Draws a squiggle on a signature canvas. */
export async function sign(canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  const p = canvas.page();
  await p.mouse.move(b.x + 30, b.y + b.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + 30 + i * 20, b.y + b.height / 2 + (i % 2 ? -25 : 25), { steps: 3 });
  await p.mouse.up();
}

/** "$1,075.00" -> 1075 */
export const dollars = (s: string | null) => Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));

/** Reads the demo "database" (localStorage) of a page: every `tw.demo.*` key, parsed. */
export const demoStore = (page: Page) => page.evaluate(() => {
  const o: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith("tw.demo.")) { try { o[k] = JSON.parse(localStorage.getItem(k)!); } catch { o[k] = localStorage.getItem(k); } } }
  return o;
});
export const demoCompanyId = (page: Page) => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("tw.demo.companies") || "{}") as Record<string, { id: string }>)[0].id);
export const demoRows = <T = Record<string, unknown>>(page: Page, cid: string, col: string) =>
  page.evaluate(([c, k]) => JSON.parse(localStorage.getItem(`tw.demo.${c}.${k}`) || "[]") as T[], [cid, col] as const);

/** A second browser profile that starts from another one's demo data but NOT its login (roles test: owner and worker share one "cloud"). */
export async function cloneDemoData(from: BrowserContext, to: (state: Parameters<import("@playwright/test").Browser["newContext"]>[0]) => Promise<BrowserContext>, origin: string) {
  const st = await from.storageState();
  const ls = (st.origins.find((o) => o.origin === origin)?.localStorage || []).filter((x) => x.name !== "tw.demo.session");
  return to({ storageState: { cookies: [], origins: [{ origin, localStorage: ls }] } });
}

/** Opens the "new estimate" picker and starts a kitchen-cabinet estimate; ends on the editor. Returns the estimate id. */
export async function newCabinetEstimate(page: Page) {
  await page.goto("/estimates?new=1");
  await page.getByRole("button", { name: /^Kitchen cabinets\s+Doors/ }).click();
  await page.waitForURL(/\/estimates\/[^/]+$/);
  return page.url().split("/").pop()!;
}

/** The bank-statement fixtures are dated September 2026, so the browser clock is pinned to that month (deterministic on any day). */
export const freezeToday = (context: BrowserContext, iso = "2026-09-29T12:00:00") => context.clock.setFixedTime(new Date(iso));
export const FIXTURES = new URL("../src/lib/fixtures/", import.meta.url).pathname;

/** Says yes to every app confirm window ("Delete this…?") that shows up in this page (src/ui/confirm.tsx). */
export async function acceptConfirms(page: Page) {
  await page.addLocatorHandler(page.getByRole("alertdialog"), async (dlg) => { await dlg.locator(".ask-act .btn").last().click(); });
}
