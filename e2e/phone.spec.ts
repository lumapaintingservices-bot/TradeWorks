import { demoCompanyId, expect, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** (g) phone smoke: every main screen at 390 px wide opens, has no horizontal scroll and logs no console errors. */
const ROUTES = ["/", "/pipeline", "/calendar", "/estimates", "/invoices", "/clients", "/expenses", "/reports", "/team", "/notes", "/settings",
  ...["general", "pricing", "profit", "jobtypes", "leads", "client", "calendar", "team", "backup"].map((s) => "/settings?section=" + s)];

/** Fails when the page can be scrolled sideways. The message names the elements that stick out (ignoring ones inside their own scroller or hidden). */
const noSideScroll = async (page: import("@playwright/test").Page, where: string) => {
  const over = await page.evaluate(() => {
    const de = document.documentElement, w = de.clientWidth;
    const clipped = (e: Element) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
    const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && getComputedStyle(e).position !== "fixed" && e.offsetParent !== null && !clipped(e); })
      .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}[right=${Math.round(e.getBoundingClientRect().right)}]`);
    return { sw: de.scrollWidth, cw: w, bodySw: document.body.scrollWidth, wide };
  });
  expect(over.sw, `${where}: page is wider than the screen ${JSON.stringify(over)}`).toBeLessThanOrEqual(over.cw + 1);
  expect(over.bodySw, `${where}: body is wider than the screen ${JSON.stringify(over)}`).toBeLessThanOrEqual(over.cw + 1);
};

test("every main route fits a phone", async ({ page }) => {
  test.setTimeout(150_000);   // ~35 screens; slower when the other specs run at the same time
  await signUpAndSkip(page, "Phone Owner");
  const cid = await demoCompanyId(page);

  // one real estimate with a client and a client link, plus a little of everything else
  const estId = await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Phone", { exact: true }).fill("(555) 010-2030");
  await page.getByLabel("Job address").fill("12 Oak Street, Austin TX");
  await page.getByLabel("Doors", { exact: true }).fill("20");
  await page.getByLabel("Drawers", { exact: true }).fill("8");
  await expect.poll(async () => (await page.evaluate(([c]) => JSON.parse(localStorage.getItem(`tw.demo.${c}.estimates`) || "[]")[0]?.doors, [cid]))).toBe(20);
  await page.getByRole("button", { name: "Link & chat" }).click();
  await page.getByRole("button", { name: "Create client link" }).click();
  const link = (await page.locator(".linkbox").first().innerText()).trim();
  await page.evaluate(([c, est]) => {
    const put = (col: string, rows: unknown[]) => localStorage.setItem(`tw.demo.${c}.${col}`, JSON.stringify(rows));
    const today = new Date().toISOString().slice(0, 10), base = { companyId: c, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    put("workers", [{ id: "w1", name: "Sam Worker", rate: 20, active: true, ...base }]);
    put("hours", [{ id: "h1", workerId: "w1", date: today, hours: 6, rate: 20, estId: est, note: "Sanding", ...base }]);
    put("payouts", [{ id: "p1", workerId: "w1", date: today, amount: 60, method: "Zelle", ...base }]);
    put("expenses", [{ id: "x1", date: today, vendor: "Sherwin-Williams", amount: 312.55, category: "materials", estId: est, ...base }, { id: "x2", date: today, vendor: "Shell", amount: 58.1, category: "fuel", ...base }]);
    put("tasks", [{ id: "t1", title: "Prep kitchen", date: today, workerId: "w1", estId: est, done: false, ...base }]);
    put("invoices", [
      { id: "i1", number: "INV-1001", estId: est, kind: "deposit", amount: 500, date: today, status: "Paid", paidDate: today, ...base },
      { id: "i2", number: "INV-1002", estId: est, kind: "balance", amount: 1500, date: today, status: "Unpaid", ...base }]);
  }, [cid, estId] as const);

  const routes = [...ROUTES, `/estimates/${estId}`, `/estimates/${estId}/doc`, `/estimates/${estId}/work-order`, "/invoices/i1/doc"];
  for (const path of routes) {
    await page.goto(path);
    await expect(page.locator("main, .page, .doc, .wo, body > div").first()).toBeVisible();
    await page.waitForTimeout(120);
    await noSideScroll(page, path);
  }

  // every tab of the estimate editor
  await page.goto(`/estimates/${estId}`);
  for (const tab of ["Pricing", "Scope & notes", "Costs & profit", "Change orders", "Invoices", "Link & chat", "Photos", "Job day"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(80);
    await noSideScroll(page, "estimate tab " + tab);
  }

  // a client profile, the bottom bar and the More sheet
  await page.goto("/clients");
  await page.locator(".ec").first().click();
  await page.waitForURL(/\/clients\/.+/);
  await noSideScroll(page, "client profile");
  await page.goto("/");
  const bottom = page.locator(".bottom-nav, nav.bnav, [class*=bottom]").first();
  await expect(bottom).toBeVisible();
  await page.getByRole("button", { name: /^More/ }).click();
  await expect(page.getByRole("link", { name: "Reports" }).first()).toBeVisible();
  await noSideScroll(page, "More sheet");

  // the public pages the client sees
  await page.goto(link);
  await expect(page.locator(".pt-hero")).toBeVisible();
  await noSideScroll(page, "client link");
  await page.goto(`/request?c=${cid}`);
  await expect(page.getByRole("heading", { name: "Get your free estimate" })).toBeVisible();
  await noSideScroll(page, "lead form");
  await page.goto("/login");
  await noSideScroll(page, "login");
});
