import type { Page } from "@playwright/test";
import { demoCompanyId, demoRows, demoStore, dollars, expect, signUp, signUpAndSkip, test, acceptConfirms } from "./helpers";

type CatalogRow = { id: string; en: string; unit: string; rate: number; hrs?: number };
type SettingsDoc = { id: string; trade?: string; catalog?: CatalogRow[]; pricing: { depositPct: number; doorRate: number } };
const settingsOf = async (page: Page, cid: string) => (await demoRows<SettingsDoc>(page, cid, "settings")).find((r) => r.id === "main");

/** Walks the real onboarding wizard up to the trade step (business name filled). */
async function toTradeStep(page: Page, business: string) {
  await signUp(page, "Trade Owner");
  await page.getByRole("button", { name: "Continue" }).click();               // language
  await page.getByLabel("Business name").fill(business);
  await page.getByRole("button", { name: "Continue" }).click();               // business
  await expect(page.getByRole("heading", { name: "Your trade" })).toBeVisible();
}
const addLine = (page: Page, name: string) => page.locator("select", { hasText: "+ Add line" }).selectOption({ label: name });

test("onboarding as cleaning: its own prices (no doors or drawers), saved and used by the estimate", async ({ page }) => {
  await toTradeStep(page, "Sparkle Clean");
  await page.getByRole("button", { name: "Cleaning", exact: true }).click();
  await expect(page.getByText("Start with the cleaning template")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your prices" })).toBeVisible();

  // cleaning asks its own prices — nothing about cabinets
  await expect(page.getByLabel("Price per door")).toHaveCount(0);
  await expect(page.getByLabel("Price per drawer")).toHaveCount(0);
  await expect(page.getByLabel("Price per hour ($)")).toBeVisible();
  await expect(page.getByLabel("Price per room ($)")).toBeVisible();
  await expect(page.getByLabel("Price per sq ft ($)")).toBeVisible();
  await expect(page.getByLabel("Deposit (%)")).toHaveValue("25");            // the trade's default
  await page.getByLabel("Price per hour ($)").fill("65");
  await page.getByLabel("Deposit (%)").fill("20");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "First estimate" }).click();
  await page.waitForURL(/\/estimates\?new=1/);

  // the prices were saved to the company's catalog; untouched ones keep the starter placeholder
  const cid = await demoCompanyId(page);
  await expect.poll(async () => (await settingsOf(page, cid))?.catalog?.find((c) => c.id === "clean-hour")?.rate).toBe(65);
  const s = (await settingsOf(page, cid))!;
  expect(s.catalog!.find((c) => c.id === "clean-room")!.rate).toBe(35);
  expect(s.pricing.depositPct).toBe(20);
  expect(s.pricing.doorRate).toBe(80);                                           // painting default untouched

  // the job-type picker is the cleaning one
  await expect(page.getByRole("button", { name: /^Regular cleaning/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Deep cleaning/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Kitchen cabinets/ })).toHaveCount(0);
  await expect(page.getByText("Standard kitchen")).toHaveCount(0);               // the starter cabinet templates are hidden
  await page.getByRole("button", { name: /^Deep cleaning/ }).click();
  await page.waitForURL(/\/estimates\/[^/]+$/);

  // the Pricing tab: no cabinet controls, the services picker comes from the catalog
  await expect(page.getByLabel("Price per door")).toHaveCount(0);
  await expect(page.getByLabel("Doors", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deep cleaning", exact: true })).toHaveClass(/on/);
  await addLine(page, "Cleaning — hourly");
  const line = page.locator(".line").first();
  await expect(line.getByPlaceholder("unit")).toHaveValue("hr");
  await expect(line.getByPlaceholder("Description")).toHaveValue("Cleaning — hourly");
  await line.getByPlaceholder("Qty").fill("3");                                  // 3 h x $65
  await addLine(page, "Deep-clean add-on (baseboards, vents, detail work)");
  await expect(page.locator(".totline.big").first()).toContainText("$315.00");    // 195 + 120
  await expect(page.locator(".totline.dim", { hasText: "Deposit (20%)" })).toContainText("$63.00");

  // scope & terms are the cleaning ones, not the cabinet texts
  await page.getByRole("button", { name: "Scope & notes" }).click();
  await expect(page.locator("textarea").first()).toHaveValue(/Baseboards/);
  await expect(page.locator("textarea").first()).not.toHaveValue(/cabinet|sprayed/i);

  // Costs & profit keeps working: hours come from the catalog (1 h/h x 3 + 2 h deep clean)
  await page.getByRole("button", { name: "Costs & profit" }).click();
  await expect(page.getByText("5 h · ~").first()).toBeVisible();
  await expect(page.getByRole("option", { name: "Client buys the paint" })).toHaveCount(0);
  const kept = page.locator(".totline", { hasText: "What you keep" }).first();
  expect(dollars(await kept.locator("b").textContent())).toBe(315);              // no materials entered
});

test("custom trade: skip the template and define your own priced services", async ({ page }) => {
  await toTradeStep(page, "Roof Wash Pros");
  await page.getByRole("button", { name: "Custom (my own services)" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your prices" })).toBeVisible();
  await expect(page.getByLabel("Price per door")).toHaveCount(0);

  const names = page.getByLabel("Service name"), units = page.getByLabel("Unit", { exact: true }), prices = page.getByLabel("Price ($)");
  await names.nth(0).fill("Roof wash"); await units.nth(0).fill("sq ft"); await prices.nth(0).fill("0.35");
  await page.getByRole("button", { name: "+ Add another" }).click();
  await names.nth(1).fill("Gutter cleaning"); await units.nth(1).fill("job"); await prices.nth(1).fill("120");
  await page.getByRole("button", { name: "+ Add another" }).click();
  await expect(names).toHaveCount(3);
  await page.getByRole("button", { name: "Remove" }).nth(2).click();             // an empty extra row can go
  await expect(names).toHaveCount(2);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "First estimate" }).click();
  await page.waitForURL(/\/estimates\?new=1/);

  const cid = await demoCompanyId(page);
  await expect.poll(async () => (await settingsOf(page, cid))?.catalog?.length).toBe(2);
  const s = (await settingsOf(page, cid))!;
  expect(s.catalog!.map((c) => [c.en, c.unit, c.rate])).toEqual([["Roof wash", "sq ft", 0.35], ["Gutter cleaning", "job", 120]]);

  await page.getByRole("button", { name: /^Job/ }).click();
  await page.waitForURL(/\/estimates\/[^/]+$/);
  await expect(page.getByLabel("Doors", { exact: true })).toHaveCount(0);
  await addLine(page, "Roof wash");
  await page.locator(".line").first().getByPlaceholder("Qty").fill("2000");
  await addLine(page, "Gutter cleaning");                                        // a non-area line starts at qty 1
  await expect(page.locator(".totline.big").first()).toContainText("$820.00");    // 2000 x 0.35 + 120
  // an area line of a non-painting trade is not turned into paint gallons
  await page.getByRole("button", { name: "Costs & profit" }).click();
  await expect(page.getByText(/gal\b/)).toHaveCount(0);
});

test("\"I'll set my prices later\" keeps the trade's starter list, editable in Settings → Services & prices", async ({ page }) => {
  await toTradeStep(page, "Bright Sparks");
  await page.getByRole("button", { name: "Electrical", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Service-call fee ($)")).toBeVisible();
  await expect(page.getByLabel("Hourly rate ($)")).toBeVisible();
  await page.getByLabel("Service-call fee ($)").fill("999");                     // typed, but then skipped: must not be saved
  await page.getByRole("button", { name: "I'll set my prices later" }).click();
  await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
  await page.getByRole("button", { name: "Explore with a sample job" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  const cid = await demoCompanyId(page);
  await expect.poll(async () => (await settingsOf(page, cid))?.catalog?.length).toBeGreaterThan(5);
  expect((await settingsOf(page, cid))!.catalog!.find((c) => c.id === "elec-call")!.rate).toBe(95);

  await page.goto("/settings?section=services");
  const card = page.locator(".card", { hasText: "Services & prices" }).last();
  await expect(card.getByLabel("Name — English").first()).toHaveValue("Service call / diagnostic fee");
  await card.getByLabel("Price ($)").first().fill("110");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await expect.poll(async () => (await settingsOf(page, cid))!.catalog!.find((c) => c.id === "elec-call")!.rate).toBe(110);
});

test("Settings: edit the catalog and switch trade without losing your own services", async ({ page }) => {
  await acceptConfirms(page);
  await signUpAndSkip(page);                                                       // a painting company
  const cid = await demoCompanyId(page);
  await page.goto("/settings?section=services");
  const card = () => page.locator(".card", { hasText: "Services & prices" }).last();

  // painting: the built-in services, plus one of its own, with hours; reorder and rename
  await expect(card().getByLabel("Name — English").first()).toHaveValue("Interior painting — walls");
  await card().getByRole("button", { name: "+ Add service" }).click();
  const last = card().locator(".st-cat").last();
  await last.getByLabel("Name — English").fill("Mural");
  await last.getByLabel("Unit", { exact: true }).fill("sq ft");
  await last.getByLabel("Price ($)").fill("12");
  await last.getByLabel("Your hours per unit").fill("0.3");
  await card().getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await expect.poll(async () => (await settingsOf(page, cid))?.catalog?.some((c) => c.en === "Mural")).toBe(true);
  const mural = (await settingsOf(page, cid))!.catalog!.find((c) => c.en === "Mural")!;
  expect([mural.unit, mural.rate, mural.hrs]).toEqual(["sq ft", 12, 0.3]);

  // the painting estimate offers it (and still shows the cabinet controls)
  await page.goto("/estimates?new=1");
  await page.getByRole("button", { name: /^Kitchen cabinets\s+Doors/ }).click();
  await page.waitForURL(/\/estimates\/[^/]+$/);
  await expect(page.getByLabel("Price per door")).toBeVisible();
  await addLine(page, "Mural");
  await expect(page.locator(".line").first().getByPlaceholder("Rate")).toHaveValue("12");

  // switch to plumbing: the catalog has our own edit, so it is kept and the starter items are offered separately
  await page.goto("/settings?section=services");
  await card().locator("..").getByRole("button", { name: "Plumbing", exact: true }).click();
  await page.getByRole("button", { name: "Switch to Plumbing" }).click();
  await expect(page.getByText("Trade changed").first()).toBeVisible();
  await expect(card().locator(".st-cat")).toHaveCount(16);                         // nothing was replaced
  await expect(card().locator(".st-cat").last().getByLabel("Name — English")).toHaveValue("Mural");
  const add = page.getByRole("button", { name: /Add plumbing starter items/ });
  await add.click();
  await card().getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await settingsOf(page, cid))?.catalog?.some((c) => c.id === "plum-hour")).toBe(true);
  expect((await settingsOf(page, cid))!.catalog!.some((c) => c.en === "Mural")).toBe(true);
  await expect(add).toBeDisabled();

  // job types follow the trade; the cabinet price fields are gone from Prices
  await page.goto("/settings?section=jobtypes");
  await expect(page.getByRole("button", { name: "Water heater" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kitchen cabinets" })).toHaveCount(0);
  await page.goto("/settings?section=pricing");
  await expect(page.getByLabel("Price per door ($)")).toHaveCount(0);
  await expect(page.getByLabel("Deposit (%)")).toBeVisible();
  // the public business card carries the trade for the request form
  await expect.poll(async () => JSON.stringify(await demoStore(page))).toContain('"trade":"plumbing"');
});

test("request form for an electrician: its own services and questions, no cabinet steps", async ({ page, context }) => {
  await acceptConfirms(page);
  await signUpAndSkip(page, "Volt Electric");
  const cid = await demoCompanyId(page);
  await page.goto("/settings?section=services");
  await page.getByRole("button", { name: "Electrical", exact: true }).click();
  await page.getByRole("button", { name: "Switch to Electrical" }).click();
  await expect(page.getByText("Trade changed").first()).toBeVisible();
  await expect.poll(() => page.evaluate((c) => localStorage.getItem("tw.demo.top.public." + c) || "", cid)).toContain('"trade":"electrical"');

  const lead = await context.newPage();
  await lead.goto(`/request?c=${cid}`);
  const go = (name: RegExp) => lead.getByRole("button", { name }).click();
  await go(/^Start/);
  await expect(lead.getByRole("button", { name: /Lights, fans & outlets/ })).toBeVisible();
  await expect(lead.getByRole("button", { name: /Kitchen cabinets/ })).toHaveCount(0);
  await go(/^Continue/);                                                           // nothing picked yet
  await expect(lead.getByRole("alert").filter({ hasText: "Pick at least one project" })).toBeVisible();
  await lead.getByRole("button", { name: /Repair \/ troubleshooting/ }).click();
  await lead.getByRole("button", { name: /Lights, fans & outlets/ }).click();
  await go(/^Continue/);

  await expect(lead.getByRole("heading", { name: "Tell us about the electrical job" })).toBeVisible();
  await expect(lead.getByText("Doors", { exact: true })).toHaveCount(0);
  await expect(lead.getByText("Step 2 of 5")).toBeVisible();                      // six steps: no finish-level step
  await lead.getByRole("button", { name: "House", exact: true }).click();
  await lead.getByRole("button", { name: /Yes — please call me first/ }).click();
  await lead.locator(".lf-count", { hasText: "How many?" }).getByLabel("+").click({ clickCount: 3 });
  await expect(lead.getByText("Age of the electrical panel")).toHaveCount(0);     // only for panel work
  await lead.getByPlaceholder(/kitchen outlets stop working/).fill("Kitchen outlets are dead");
  await go(/^Continue/);

  await expect(lead.getByRole("heading", { name: "When would you like it done?" })).toBeVisible();   // no "finish level" step in between
  await lead.getByRole("button", { name: /As soon as possible/ }).click();
  await go(/^Continue/);
  await expect(lead.getByText("A photo of the panel, fixture or outlet")).toBeVisible();
  await go(/^Continue/);
  await lead.getByLabel("Full name").fill("Dan Reyes");
  await lead.getByLabel("Phone", { exact: true }).fill("(555) 222-3344");
  await lead.getByLabel("Project address").fill("12 Oak St");
  await expect(lead.locator(".lf-sum")).toContainText("Repair / troubleshooting, Lights, fans & outlets");
  await go(/Send my request/);
  await expect(lead.getByRole("heading", { name: "Thank you — we got your request!" })).toBeVisible();
  await lead.close();

  // the stored request keeps the usual shape (details.v, types) plus the trade and its answers
  const store = await demoStore(page);
  const doc = Object.entries(store).map(([k, v]) => (/leads/.test(k) ? JSON.stringify(v) : "")).find((x) => x.includes('"details"'))!;
  expect(doc).toContain('"v":2');
  expect(doc).toContain('"types":["elec-repair","elec-install"]');
  expect(doc).toContain('"trade":"electrical"');
  expect(doc).toContain('"safety":"yes"');
  expect(doc).toContain('"count":3');
  expect(doc).toContain("Repair / troubleshooting, Lights, fans & outlets");

  // the owner sees it with readable chips and the estimate suggests the electrician's job type
  await page.goto("/clients");
  const inbox = page.locator(".lead-inbox");
  await expect(inbox).toContainText("Dan Reyes");
  await expect(inbox).toContainText("Yes — please call me first");
  await inbox.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("New request imported: Dan Reyes")).toBeVisible();
  await page.locator("table tbody tr, .ec", { hasText: "Dan Reyes" }).first().getByText("Dan Reyes").first().click();
  await page.waitForURL(/\/clients\/.+/);
  await page.locator("main, .page").getByRole("button", { name: /New estimate/ }).first().click();
  await expect(page.locator(".jt-card.sug")).toContainText("Repair / troubleshooting");
  await expect(page.locator(".jt-card.sug")).toContainText("From the request");
});
