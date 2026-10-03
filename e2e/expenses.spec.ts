import { expect, FIXTURES, freezeToday, signUpAndSkip, test } from "./helpers";

/** (c) expenses: add one by hand, import a bank statement, and the dashboard money-out follows. */
test("add an expense, import a bank CSV, dashboard numbers change", async ({ page, context }) => {
  await freezeToday(context);
  await signUpAndSkip(page);
  const cashCard = page.locator(".db-card", { hasText: "Cash this month" });
  const moneyOut = cashCard.locator(".db-hb", { hasText: "Money out" });

  await page.goto("/");
  await expect(moneyOut).toContainText("$0.00");

  // ---- one expense by hand
  await page.goto("/expenses");
  await expect(page.getByText("No expenses yet")).toBeVisible();
  await page.getByRole("button", { name: "Expense", exact: true }).click();
  await page.getByLabel("Amount ($)").fill("120.50");
  await page.getByLabel("Vendor").fill("Home Depot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("table tbody tr", { hasText: "Home Depot" })).toContainText("$120.50");

  await page.goto("/");
  await expect(moneyOut).toContainText("$120.50");
  await expect(cashCard.locator(".kv")).toHaveText("-$120.50");

  // ---- bank statement: 7 charges, $842.22 (the payment line is not a charge)
  await page.goto("/expenses");
  await page.getByRole("button", { name: /^More: recurring/ }).click();   // the "⋯" menu next to "+ Expense"
  await page.getByRole("menuitem", { name: "Import bank CSV" }).click();
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "chase-card.csv");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("7 charges · 7 selected · $842.22");
  await dlg.getByRole("button", { name: "Import 7 expenses" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("table tbody tr", { hasText: "SHELL OIL" })).toContainText("Fuel & vehicle");   // categorised by the built-in rules
  await expect(page.locator("table tbody tr", { hasText: "GOOGLE" })).toContainText("Ads & marketing");
  await expect(page.locator("table tbody tr")).toHaveCount(8);

  await page.goto("/");
  await expect(moneyOut).toContainText("$962.72");
  await expect(cashCard.locator(".kv")).toHaveText("-$962.72");                                    // 120.50 + 842.22

  // the same file again: everything is a duplicate and starts unchecked
  await page.goto("/expenses");
  await page.getByRole("button", { name: /^More: recurring/ }).click();   // the "⋯" menu next to "+ Expense"
  await page.getByRole("menuitem", { name: "Import bank CSV" }).click();
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "chase-card.csv");
  await expect(page.getByRole("dialog")).toContainText("0 selected");
  await expect(page.getByRole("button", { name: /^Import 0 expenses/ })).toBeDisabled();
});
