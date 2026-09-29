import { expect, freezeToday, signUpAndSkip, test } from "./helpers";

/** (d) team: add a worker, clock in and out (2.5 h at $20), the app knows what is owed, pay it. */
test("worker, clock in/out and payment", async ({ page, context }) => {
  await freezeToday(context, "2026-09-29T09:00:00");
  await signUpAndSkip(page);
  await page.goto("/team");

  await page.getByRole("button", { name: "+ Add a worker" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Carlos Painter");
  await page.getByLabel("Pay per hour ($)").fill("20");
  await page.getByLabel("Role").fill("Sprayer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.locator("table tbody tr", { hasText: "Carlos Painter" });
  await expect(row).toContainText("$20.00");

  // clock in at 9:00, clock out at 11:30
  await row.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText("Clocked in.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Clock out" })).toBeVisible();
  await freezeToday(context, "2026-09-29T11:30:00");
  await row.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("2.5 h saved.")).toBeVisible();

  await expect(page.locator("table tbody tr", { hasText: "Carlos Painter" }).filter({ hasText: "$50.00" }).first()).toBeVisible();
  await expect(page.locator(".tm-tile", { hasText: "You owe now" })).toContainText("$50.00");
  await expect(page.locator(".tm-tile", { hasText: "Labor cost" })).toContainText("$50.00");

  // pay: the amount is prefilled with what is owed
  await row.getByRole("button", { name: "Pay", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("Amount ($)")).toHaveValue("50");
  await dlg.getByLabel("Method").selectOption("Zelle");
  await dlg.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("Payment saved.")).toBeVisible();
  await expect(page.locator(".tm-tile", { hasText: "You owe now" })).toContainText("$0.00");
  await expect(page.locator(".tm-tile", { hasText: "Paid" }).first()).toContainText("$50.00");
  await expect(row.getByRole("button", { name: "Pay", exact: true })).toHaveCount(0);

  // it survives a reload
  await page.reload();
  await expect(page.locator(".tm-tile", { hasText: "Paid" }).first()).toContainText("$50.00");
});
