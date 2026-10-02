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

  // the expense shows on the Expenses page linked to the job
  const after = Number((await keep.innerText()).replace(/[^0-9.-]/g, ""));
  expect(after).toBeLessThan(before);
  await page.goto("/expenses");
  await expect(page.locator("table tbody tr", { hasText: "Jose helper" })).toContainText("EST-");
  expect(estId).toBeTruthy();
});
