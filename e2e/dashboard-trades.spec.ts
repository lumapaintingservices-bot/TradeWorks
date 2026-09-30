import type { Page } from "@playwright/test";
import { expect, signUp, signUpAndSkip, test } from "./helpers";

/** Real onboarding as the given trade, prices skipped, then the dashboard (sample job or empty). */
async function dashboardAs(page: Page, business: string, trade: string, sample: boolean) {
  await signUp(page, "Trade Owner");
  await page.getByRole("button", { name: "Continue" }).click();               // language
  await page.getByLabel("Business name").fill(business);
  await page.getByRole("button", { name: "Continue" }).click();               // business
  await expect(page.getByRole("heading", { name: "Your trade" })).toBeVisible();
  await page.getByRole("button", { name: trade, exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "I'll set my prices later" }).click();
  await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
  await page.getByRole("button", { name: sample ? "Explore with a sample job" : /^(Go to dashboard|Skip)/ }).click().catch(() => {});
  await page.waitForURL((u) => u.pathname === "/");
}
const cards = (page: Page) => page.locator(".db-kgrid .kcard");
const noNaN = async (page: Page) => { const txt = (await page.locator("main, .page").first().innerText()) || ""; expect(txt).not.toMatch(/NaN|Infinity|undefined/); };

test("cleaning dashboard: its own default cards, a trade section in the library, no NaN", async ({ page }) => {
  await dashboardAs(page, "Sparkle Clean", "Cleaning", true);
  for (const title of ["Sales won", "Repeat clients", "Revenue per hour", "Jobs per week", "Still to collect", "Job profit margin"]) await expect(cards(page).filter({ hasText: title }).first()).toBeVisible();
  await expect(cards(page).filter({ hasText: "Backlog" })).toHaveCount(0);       // painting's default four are not the cleaning default
  await expect(cards(page)).toHaveCount(6);
  await noNaN(page);

  await page.getByRole("button", { name: "Customize" }).click();
  const lib = page.getByRole("dialog");
  await expect(lib.getByText("For your trade")).toBeVisible();
  await expect(lib.getByText("General", { exact: true })).toBeVisible();
  await expect(lib.locator(".db-kl").first()).toContainText("Sales won");         // trade cards first
  await lib.locator(".db-kl", { hasText: "Average ticket" }).getByRole("button", { name: /Add to dashboard/ }).click();
  await lib.getByRole("button", { name: "Done" }).click();
  await expect(cards(page).filter({ hasText: "Average ticket" })).toBeVisible();  // saving the choice keeps the rest
  await expect(cards(page)).toHaveCount(7);
  await noNaN(page);
});

test("electrical dashboard: jobs, ticket, materials margin, quote-to-win; empty company shows dashes", async ({ page }) => {
  await dashboardAs(page, "Bright Sparks", "Electrical", false);
  for (const title of ["Jobs won", "Average ticket", "Materials margin", "Quote-to-win time", "Still to collect"]) await expect(cards(page).filter({ hasText: title }).first()).toBeVisible();
  await expect(cards(page).filter({ hasText: "Materials margin" }).locator(".kv")).toHaveText("—");
  await expect(cards(page).filter({ hasText: "Quote-to-win time" }).locator(".kv")).toHaveText("—");
  await expect(cards(page).filter({ hasText: "Repeat clients" })).toHaveCount(0);
  await noNaN(page);
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Back to the default cards" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(cards(page).filter({ hasText: "Quote-to-win time" })).toBeVisible();
  await noNaN(page);
});

test("Settings > Costs & profit: cleaning hides the cabinet fields and keeps rates and supplies; painting keeps them", async ({ page }) => {
  await dashboardAs(page, "Sparkle Clean", "Cleaning", true);
  await page.goto("/settings?section=profit");
  await expect(page.getByLabel("Hours per cabinet door")).toHaveCount(0);
  await expect(page.getByLabel("Hours per drawer front")).toHaveCount(0);
  await expect(page.getByLabel("Paint price per gallon ($)")).toHaveCount(0);
  await expect(page.getByLabel("Primer name")).toHaveCount(0);
  await expect(page.getByLabel("What you want to earn per hour ($)")).toBeVisible();
  await expect(page.getByLabel("Hours you work per day")).toBeVisible();
  await page.getByRole("button", { name: "With workers" }).click();
  await expect(page.getByLabel("Target margin (%)")).toBeVisible();
  await expect(page.getByLabel("People on a crew")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Add supply" })).toBeVisible();
});

test("Settings > Costs & profit: a painting company still sees the cabinet fields", async ({ page }) => {
  await signUpAndSkip(page);
  await page.goto("/settings?section=profit");
  await expect(page.getByLabel("Hours per cabinet door")).toBeVisible();
  await expect(page.getByLabel("Paint price per gallon ($)").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Add supply" })).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".db-kgrid .kcard")).toHaveCount(4);
  await expect(page.locator(".db-kgrid .kcard").filter({ hasText: "Backlog" })).toBeVisible();
});
