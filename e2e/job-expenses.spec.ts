import { expect, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

/** Costs & profit counts the job's expenses: materials replace the estimate, subcontractors and other costs lower the profit. */
test("expenses added on a job change its real profit", async ({ page }) => {
  await signUpAndSkip(page);
  const estId = await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Dillon Test");
  await page.getByLabel("Doors", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Costs & profit" }).click();

  const keep = page.locator(".totline", { hasText: "What you keep" }).locator("b");
  await expect(page.locator(".totline", { hasText: "Materials (estimated)" })).toBeVisible();
  const before = Number((await keep.innerText()).replace(/[^0-9.-]/g, ""));
  const card = page.locator(".card", { hasText: "Expenses for this job" });

  // materials receipt from the job itself: the job is already picked
  await card.getByRole("button", { name: "+ Add expense" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.locator(".cbx-btn")).toContainText("Dillon Test");
  await dlg.getByLabel("Amount ($)").fill("95.50");
  await dlg.getByLabel("Vendor").fill("Sherwin-Williams");
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(card.locator(".jx-row", { hasText: "Sherwin-Williams" })).toContainText("$95.50");
  await expect(page.locator(".totline", { hasText: "Materials (real)" })).toContainText("$95.50");
  await expect(page.locator(".cost-cmp")).toContainText("Real (expenses)");

  // a subcontractor paid for this job
  await card.getByRole("button", { name: "+ Add expense" }).click();
  await dlg.getByLabel("Amount ($)").fill("300");
  await dlg.getByLabel("Vendor").fill("Jose helper");
  await dlg.getByRole("button", { name: "Labor / subcontractors" }).click();
  await dlg.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".totline", { hasText: "Subcontractors (expenses)" })).toContainText("$300.00");
  await expect(card.locator(".card-h b")).toHaveText("$395.50");

  // the Expenses tab: budget vs actual, every receipt, profit so far, CSV
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page.locator(".jl-tiles .tile", { hasText: "Spent so far" })).toContainText("$395.50");
  const bva = page.locator(".jl-bva");
  await expect(bva.locator(".jl-bva-r", { hasText: "Materials" })).toContainText("$95.50");
  await expect(bva.locator(".jl-bva-r", { hasText: "Subcontractors" })).toContainText("$300.00");
  await expect(page.locator(".jl-row", { hasText: "Jose helper" })).toContainText("$300.00");
  await page.getByRole("button", { name: /^Materials · 1$/ }).click();
  await expect(page.locator(".card", { hasText: "Receipts & expenses" }).locator("button.jl-row")).toHaveCount(1);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await dl).suggestedFilename()).toMatch(/-expenses\.csv$/);
  await page.getByRole("button", { name: "Costs & profit" }).click();

  // the expense shows on the Expenses page linked to the job
  const after = Number((await keep.innerText()).replace(/[^0-9.-]/g, ""));
  expect(after).toBeLessThan(before);
  await page.goto("/expenses");
  await expect(page.locator("table tbody tr", { hasText: "Jose helper" })).toContainText("EST-");
  // one period button (dropdown) and the "By job" view, which opens the job's Expenses tab
  await page.getByRole("button", { name: "Period" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: "Period" })).toContainText("All");
  await page.getByRole("tab", { name: "By job" }).click();
  const jobRow = page.locator(".exj-row", { hasText: "Dillon Test" });
  await expect(jobRow).toContainText("$395.50");
  await jobRow.click();
  await page.waitForURL(/tab=exp/);
  await expect(page.locator(".jl-tiles")).toBeVisible();
  expect(estId).toBeTruthy();

  // Settings > Materials learns from this job: real $95.50 vs the calculator, and offers to use that percentage
  await page.goto("/settings?section=profit");
  const learn = page.locator(".st-learn");
  await expect(learn).toContainText("On 1 job you really spent $95.50 on materials");
  const card2 = page.locator("#materials");
  await learn.getByRole("button", { name: /^Use \d+% on my estimates$/ }).click();
  await page.getByRole("switch", { name: "Cost only the paint and primer the job uses" }).check();
  await card2.getByRole("button", { name: "Save", exact: true }).click();
  await expect(learn).toContainText("Now using");

  // the estimate's materials now show the adjustment and the gallons used
  await page.goto(`/estimates/${estId}`);
  await page.getByRole("button", { name: "Costs & profit" }).click();
  await expect(page.locator(".totline", { hasText: "Adjusted to your real jobs" })).toBeVisible();
  await expect(page.locator(".totline", { hasText: "gal used (buy" }).first()).toBeVisible();
});
