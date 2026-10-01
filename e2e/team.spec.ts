import { expect, freezeToday, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

/** (d) team: add a worker, clock in for a task and out (2 h 30 min at $20), the app knows what is owed, pay it. */
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

  // the clock always runs for a task: none yet, so add one from the clock window (it comes back with the task picked)
  await row.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByRole("dialog")).toContainText("has no open tasks for today");
  await page.getByRole("dialog").getByRole("button", { name: "New task" }).click();
  await page.getByLabel("What needs to be done?").fill("Spray the doors");
  await page.getByRole("dialog").getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("dialog").getByRole("radio", { name: /Spray the doors/ })).toBeChecked();

  // clock in at 9:00, clock out at 11:30
  await page.getByRole("dialog").getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText("Clocked in.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Clock out" })).toBeVisible();
  await freezeToday(context, "2026-09-29T11:30:00");
  await row.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("2 h 30 min saved.")).toBeVisible();

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

/** (d2) owner rule 2026-10-01: assign a job's tasks from Team in one window; the clock offers them and counts exact minutes. */
test("assign job tasks from Team, clock in on one, exact minutes", async ({ page, context }) => {
  await freezeToday(context, "2026-09-29T09:00:00");
  await signUpAndSkip(page);

  // a won job for a client (no date yet)
  const estId = await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Job address").fill("12 Oak Street");
  await page.getByLabel("Status").selectOption("Accepted");
  await expect(page.getByText(/^Saved ·/)).toBeVisible();

  // one window: name, pay, role
  await page.goto("/team");
  await page.getByRole("button", { name: "+ Add a worker" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Carlos Painter");
  await page.getByLabel("Pay per hour ($)").fill("30");
  await page.getByRole("button", { name: "Sprayer" }).click();
  await expect(page.getByLabel("Role")).toHaveValue("Sprayer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.locator("table tbody tr", { hasText: "Carlos Painter" });
  await expect(row).toContainText("Nothing assigned today");

  // assign work: the job, its start date (today) and all of day 1
  await row.getByRole("button", { name: "Assign work" }).click();
  const dlg = page.getByRole("dialog", { name: /Assign work to Carlos Painter/ });
  await dlg.getByRole("button", { name: "Job", exact: true }).click();
  await page.getByRole("option", { name: /Ana Ruiz/ }).click();
  await dlg.getByRole("button", { name: /^Start date/ }).click();
  await page.getByRole("dialog", { name: "Choose date" }).getByRole("button", { name: "Today" }).click();
  await dlg.getByLabel("All of day 1").check();
  const save = dlg.getByRole("button", { name: /^Save · \d+ tasks?$/ });
  const n = Number(((await save.innerText()).match(/(\d+)/) || [])[1]);
  expect(n).toBeGreaterThan(0);
  await save.click();
  await expect(page.getByText(new RegExp(`Carlos Painter: ${n} tasks? on EST-`))).toBeVisible();
  await expect(row).toContainText("Today:");

  // the clock offers exactly those lines; 4 minutes on the clock are 4 minutes of pay (not 15)
  await row.getByRole("button", { name: "Clock in" }).click();
  const clk = page.getByRole("dialog", { name: /Clock in Carlos Painter/ });
  await expect(clk.getByRole("radio")).toHaveCount(n);
  await clk.getByRole("radio").first().check();
  await clk.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText("Clocked in.")).toBeVisible();
  await freezeToday(context, "2026-09-29T09:04:00");
  await row.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("4 min saved.")).toBeVisible();
  await expect(page.locator(".tm-tile", { hasText: "Labor cost" })).toContainText("$2.00");

  // the job's Job day tab shows the same lines with Carlos on them
  await page.goto(`/estimates/${estId}?tab=jobday`);
  await expect(page.locator(".jd-who")).toContainText("Carlos Painter");
  await expect(page.getByRole("button", { name: /^Done by Carlos Painter/ }).first()).toBeVisible();
});
