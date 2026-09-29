import { cloneDemoData, expect, freezeToday, PW, signUp, signUpAndSkip, test, uniq } from "./helpers";

/**
 * (e) roles: the owner invites a worker by e-mail; the worker signs up on another device and can open only
 * Calendar, Team and Settings. Demo mode keeps accounts, members and invites in localStorage, so the worker's browser starts from a
 * copy of the owner's storage (same "cloud") minus the owner's login.
 */
test("owner invites a worker who only sees Calendar, Team and Settings", async ({ page, context, browser, baseURL }) => {
  await freezeToday(context);
  await signUpAndSkip(page, "Olivia Owner");

  // a worker record (with a rate) and two tasks: one for Sam, one for nobody
  await page.goto("/team");
  await page.getByRole("button", { name: "+ Add a worker" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Sam Worker");
  await page.getByLabel("Pay per hour ($)").fill("18");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("table tbody tr", { hasText: "Sam Worker" })).toBeVisible();
  for (const [title, who] of [["Prep the kitchen", "Sam Worker"], ["Owner errand", ""]] as const) {
    await page.getByRole("button", { name: "+ Task" }).first().click();
    await page.getByLabel("What needs to be done?").fill(title);
    await page.getByLabel("Assign to").selectOption({ label: who || "Me" });   // "Me" = the owner
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(page.getByText("Task saved.")).toBeVisible();
  }

  // invite: Settings > Team & plan
  const email = uniq("sam") + "@example.com";
  await page.goto("/settings?section=team");
  await page.getByLabel("Their email").fill(email);
  await page.locator("label.f", { hasText: "Role" }).locator("select").selectOption("worker");
  await page.locator("label.f", { hasText: "Worker record" }).locator("select").selectOption({ label: "Sam Worker" });
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Waiting to join")).toBeVisible();
  await expect(page.locator(".mb-who", { hasText: email })).toBeVisible();

  // ---- the worker's own browser
  const seeded = await cloneDemoData(context, (o) => browser.newContext({ baseURL, viewport: { width: 1300, height: 900 }, ...o }), new URL(baseURL!).origin);
  await seeded.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await freezeToday(seeded);
  const w = await seeded.newPage();
  const errors: string[] = [];
  w.on("pageerror", (e) => errors.push(e.message));
  w.on("console", (m) => { if (m.type() === "error" && !/fonts\./.test(m.text() + m.location().url)) errors.push(m.text()); });

  await signUp(w, "Sam Worker", email, PW);
  await expect(w.getByRole("heading", { name: "You have been invited" })).toBeVisible();
  await w.getByRole("button", { name: /^Join / }).click();
  await w.waitForURL((u) => u.pathname === "/calendar");

  // navigation: only Calendar, Team, Settings
  for (const name of ["Calendar", "Team", "Settings"]) await expect(w.getByRole("link", { name, exact: true }).first()).toBeVisible();
  for (const name of ["Dashboard", "Pipeline", "Estimates", "Invoices", "Clients", "Expenses", "Reports"]) await expect(w.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(w.getByRole("button", { name: "New estimate" })).toHaveCount(0);

  // routes the role may not open bounce back to the calendar
  for (const path of ["/", "/estimates", "/clients", "/invoices", "/expenses", "/reports", "/pipeline"]) {
    await w.goto(path);
    await w.waitForURL((u) => u.pathname === "/calendar");
  }
  await w.goto("/estimates/anything/doc");
  await w.waitForURL((u) => u.pathname === "/calendar");

  // calendar shows only Sam's task
  await w.goto("/calendar");
  await expect(w.getByText("Prep the kitchen").first()).toBeVisible();
  await expect(w.getByText("Owner errand")).toHaveCount(0);

  // team: own hours and clock only, no money of the company
  await w.goto("/team");
  await expect(w.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(w.getByText("Time clock")).toBeVisible();
  await expect(w.getByText("Prep the kitchen").first()).toBeVisible();
  await expect(w.getByText("You owe now")).toHaveCount(0);
  await expect(w.getByText("Labor cost")).toHaveCount(0);
  await w.getByRole("button", { name: /Clock in/i }).first().click();
  await expect(w.getByRole("button", { name: /Clock out/i }).first()).toBeVisible();

  // settings: language and theme only
  await w.goto("/settings");
  await expect(w.getByRole("heading", { name: "General" })).toBeVisible();
  for (const section of ["Prices", "Costs & profit", "Job types", "Client link & Zelle", "Team & plan", "Backup & storage"]) await expect(w.getByRole("button", { name: section })).toHaveCount(0);
  await expect(w.getByText("Team & access")).toHaveCount(0);
  expect(errors, "worker console errors").toEqual([]);
  await seeded.close();

  // the owner is unaffected and still sees everything
  await page.goto("/estimates");
  await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
});
