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
  await w.waitForURL((u) => u.pathname === "/jobs");

  // navigation: only Jobs, Calendar, Team, Settings (+ Chats, My pay)
  for (const name of ["Jobs", "Calendar", "Team", "Settings"]) await expect(w.getByRole("link", { name, exact: true }).first()).toBeVisible();
  for (const name of ["Dashboard", "Pipeline", "Estimates", "Invoices", "Clients", "Expenses", "Reports", "Notes"]) await expect(w.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(w.getByRole("button", { name: "New estimate" })).toHaveCount(0);

  // routes the role may not open bounce back to My jobs
  for (const path of ["/", "/estimates", "/clients", "/invoices", "/expenses", "/reports", "/pipeline", "/notes"]) {
    await w.goto(path);
    await w.waitForURL((u) => u.pathname === "/jobs");
  }
  await w.goto("/estimates/anything/doc");
  await w.waitForURL((u) => u.pathname === "/jobs");

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

  // settings: their photo, language and theme only (one section, no section menu)
  await w.goto("/settings");
  await expect(w.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(w.getByRole("heading", { name: "Appearance & language" })).toBeVisible();
  for (const section of ["Prices", "Costs & profit", "Job types", "Client link & payments", "Team & plan", "Backup & storage"]) await expect(w.getByRole("button", { name: section })).toHaveCount(0);
  await expect(w.getByText("Team & access")).toHaveCount(0);

  // a task assigned while the worker has the app open shows up live: a notice + the Calendar badge, no reload
  // (demo mode: another tab writing the shared storage stands in for Firestore pushing the boss's change)
  await w.goto("/jobs");
  await w.waitForURL((u) => u.pathname === "/jobs");
  const other = await seeded.newPage();
  await other.goto("/jobs");
  await other.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^tw\.demo\.[^.]+\.tasks$/.test(x))!;
    const rows = JSON.parse(localStorage.getItem(k) || "[]");
    const sam = rows.find((r: { title: string }) => r.title === "Prep the kitchen");
    rows.push({ ...sam, id: "t-live", title: "Spray the doors", done: false });
    localStorage.setItem(k, JSON.stringify(rows));
  });
  await other.close();
  await expect(w.getByText(/New task: Spray the doors/)).toBeVisible();
  const calLink = w.getByRole("link", { name: /^Calendar/ }).first();
  await expect(calLink.locator(".nav-badge")).toHaveText("1");
  await w.goto("/calendar");   // looking at the calendar = seen
  await expect(calLink.locator(".nav-badge")).toHaveCount(0);
  expect(errors, "worker console errors").toEqual([]);
  await seeded.close();

  // the owner is unaffected and still sees everything
  await page.goto("/estimates");
  await expect(page.getByRole("heading", { name: "Estimates", exact: true })).toBeVisible();
});
