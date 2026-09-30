import { readFileSync } from "node:fs";
import { demoCompanyId, demoRows, expect, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

/** (f) settings: a new door price is what the next estimate starts with; backup -> damage -> restore brings everything back. */
test("door rate flows into new estimates", async ({ page }) => {
  await signUpAndSkip(page);
  await page.goto("/settings?section=pricing");
  await page.getByLabel("Price per door ($)").fill("95");
  await page.getByLabel("Price per drawer front ($)").fill("60");
  await page.locator(".card", { hasText: "Prices & estimate defaults" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  await newCabinetEstimate(page);
  await expect(page.getByLabel("Price per door")).toHaveValue("95");
  await expect(page.getByLabel("Price per drawer")).toHaveValue("60");
  await page.getByLabel("Doors", { exact: true }).fill("10");
  await page.getByLabel("Drawers", { exact: true }).fill("2");
  await expect(page.locator(".totline.big", { hasText: "Total" }).first()).toContainText("$1,070.00");   // 10 x 95 + 2 x 60
  const cid = await demoCompanyId(page);
  await expect.poll(async () => (await demoRows<{ doorRate: number; doors: number }>(page, cid, "estimates"))[0]?.doors).toBe(10);   // autosave has run
  expect((await demoRows<{ doorRate: number }>(page, cid, "estimates"))[0].doorRate).toBe(95);

  // an estimate that already exists keeps its own price when the default changes later
  await page.goto("/settings?section=pricing");
  await page.getByLabel("Price per door ($)").fill("120");
  await page.locator(".card", { hasText: "Prices & estimate defaults" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.goto("/estimates");
  await expect(page.locator("table tbody tr").first()).toContainText("$1,070.00");
});

test("backup download and restore round trip", async ({ page }) => {
  await signUpAndSkip(page);
  const cid = await demoCompanyId(page);

  // two clients and an expense to protect
  for (const [name, phone] of [["Ana Ruiz", "5550101"], ["Ben Carter", "5550102"]]) {
    await page.goto("/clients");
    await page.getByRole("button", { name: /New client|Add client|\+ Client/i }).first().click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Phone", { exact: true }).fill(phone);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("table tbody tr", { hasText: name })).toBeVisible();
  }

  // download
  await page.goto("/settings?section=backup");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  const path = test.info().outputPath("backup.json");
  await dl.saveAs(path);
  const file = JSON.parse(readFileSync(path, "utf8"));
  expect(file).toMatchObject({ app: "TradeWorks", version: 1 });
  expect(file.data.clients).toHaveLength(2);

  // damage: rename one client, delete the other
  await page.goto("/clients");
  await page.evaluate((c) => {
    const k = `tw.demo.${c}.clients`, rows = JSON.parse(localStorage.getItem(k)!);
    rows[0].name = "CHANGED"; rows.pop();
    localStorage.setItem(k, JSON.stringify(rows));
  }, cid);
  await page.reload();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr", { hasText: "CHANGED" })).toBeVisible();

  // restore from the file
  await page.goto("/settings?section=backup");
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(page.locator(".st-restore")).toContainText("Clients: 2");
  page.once("dialog", (d) => d.accept());
  await page.locator(".st-restore").getByRole("button", { name: /^Restore/ }).click();
  await expect(page.getByText(/Restored \d+ records/)).toBeVisible();

  const clients = await demoRows<{ name: string }>(page, cid, "clients");
  expect(clients.map((c) => c.name).sort()).toEqual(["Ana Ruiz", "Ben Carter"]);
  await page.goto("/clients");
  await expect(page.locator("table tbody tr")).toHaveCount(2);

  // a file that is not a backup is refused, nothing is written
  await page.goto("/settings?section=backup");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
  await expect(page.getByRole("alert")).toBeVisible();
});

test("logo upload shows in Settings and the sidebar", async ({ page }) => {
  await signUpAndSkip(page);
  await page.goto("/settings?section=general");
  await page.locator('.logo-box input[type=file]').setInputFiles("e2e/fixtures/logo.png");
  await expect(page.getByText("Logo saved").first()).toBeVisible();
  const src = await page.locator(".logo-box img").getAttribute("src");
  expect(src).toMatch(/^data:image\/png/);
  await expect(page.locator(".ws-logo img").first()).toBeVisible();
});

test("owner can delete only the chosen company, after typing its name", async ({ page }) => {
  await signUpAndSkip(page);
  const cid = await demoCompanyId(page);
  await page.goto("/settings?section=general");
  const card = page.locator(".card", { hasText: "Delete this company" });
  const name = (await page.locator(".ws-name").first().innerText()).trim();
  const btn = card.getByRole("button", { name: "Delete company" });
  await expect(btn).toBeDisabled();
  await card.getByRole("textbox").fill(name);
  page.once("dialog", (d) => d.accept());
  await btn.click();
  await expect.poll(async () => page.evaluate((id) => Object.keys(localStorage).some((k) => k.startsWith(`tw.demo.${id}.`)) || JSON.stringify(localStorage.getItem("tw.demo.companies")).includes(id), cid)).toBe(false);
});
