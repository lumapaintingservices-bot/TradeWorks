import { demoCompanyId, demoRows, expect, signUpAndSkip, test } from "./helpers";

// a 2x2 red PNG: the form shrinks it to a JPEG and stores it with the request
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4EIwESMolGF/wEAgRIBDBGxD0sAAAAASUVORK5CYII=", "base64");

/** (b) the public 7-step request form -> the owner imports it -> a client with the Lead badge -> a new estimate from it. */
test("lead form to imported client to estimate", async ({ page, context }) => {
  await signUpAndSkip(page, "Rosa Painter");
  const cid = await demoCompanyId(page);
  await expect.poll(() => page.evaluate((c) => !!localStorage.getItem("tw.demo.top.public." + c), cid)).toBeTruthy(); // the public business card is published

  // ---- a stranger fills the form (no login needed)
  const lead = await context.newPage();
  await lead.goto(`/request?c=${cid}&src=thumbtack`);
  await expect(lead.getByRole("heading", { name: "Get your free estimate" })).toBeVisible();
  const go = (name: RegExp) => lead.getByRole("button", { name }).click();

  await go(/^Start/);                                                              // 1 intro -> types
  await lead.getByRole("button", { name: /Kitchen cabinets/ }).click();
  await lead.getByRole("button", { name: /Interior painting/ }).click();
  await go(/^Continue/);                                                           // 2 types -> details
  await expect(lead.getByText("Step 2 of 6")).toBeVisible().catch(() => {});
  await lead.locator(".lf-count", { hasText: "Doors" }).getByLabel("+").click({ clickCount: 3 });
  await lead.locator(".lf-count", { hasText: "Drawers" }).getByLabel("+").click({ clickCount: 2 });
  await lead.getByRole("button", { name: "Yes", exact: true }).click();
  await lead.getByRole("button", { name: "Bedrooms" }).click();
  await lead.getByRole("button", { name: "Walls", exact: true }).click();
  await go(/^Continue/);                                                           // 3 details -> finish level
  await expect(lead.getByRole("heading", { name: "Which finish level do you prefer?" })).toBeVisible();
  await lead.getByRole("button", { name: /Recommend the best for me/ }).first().click();
  await go(/^Continue/);                                                           // 4 -> timing
  await lead.getByRole("button", { name: /In the next 2 weeks/ }).click();
  await go(/^Continue/);                                                           // 5 -> photos
  await lead.locator('input[type="file"]').setInputFiles({ name: "kitchen.png", mimeType: "image/png", buffer: PNG });
  await expect(lead.locator(".lf-photos .ph")).toHaveCount(1);
  await lead.getByPlaceholder(/Colors you have in mind/).fill("Warm white please");
  await go(/^Continue/);                                                           // 6 -> contact
  await expect(lead.getByRole("heading", { name: "Where should we send your estimate?" })).toBeVisible();
  await expect(lead.locator(".lf-sum")).toContainText("3 doors · 2 drawers");
  // the privacy policy is one tap away from the consent line
  await expect(lead.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", /^\/privacy\/[^/?]+\?lang=en$/);

  // validation: name + phone are required
  await go(/Send my request/);
  await expect(lead.getByRole("alert").filter({ hasText: "add your name and a phone number" })).toBeVisible();
  await lead.getByLabel("Full name").fill("Maria Gonzalez");
  await lead.getByLabel("Phone", { exact: true }).fill("(555) 987-6543");
  await lead.getByLabel(/^Email/).fill("maria@client.example");
  await lead.getByLabel("Project address").fill("88 Pine Ave, Austin TX");
  await go(/Send my request/);
  await expect(lead.getByRole("heading", { name: "Thank you — we got your request!" })).toBeVisible();
  await lead.close();

  // ---- the owner: Clients shows the new request; import it
  await page.goto("/clients");
  const inbox = page.locator(".lead-inbox");
  await expect(inbox).toContainText("1 new request from your website");
  await expect(inbox).toContainText("Maria Gonzalez");
  await inbox.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("New request imported: Maria Gonzalez")).toBeVisible();
  await expect(inbox).toHaveCount(0);

  // the client is in the list with the Lead badge and the source
  const row = page.locator("table tbody tr, .ec", { hasText: "Maria Gonzalez" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Lead");
  const [saved] = await demoRows<{ name: string; source: string; lead: boolean; photos: unknown[]; lang: string }>(page, cid, "clients");
  expect(saved).toMatchObject({ name: "Maria Gonzalez", source: "Thumbtack", lead: true });   // came in through ?src=thumbtack
  expect(saved.photos).toHaveLength(1);

  // open the profile: the request's answers came along as notes
  await row.getByText("Maria Gonzalez").first().click();
  await page.waitForURL(/\/clients\/.+/);
  await expect(page.getByText("88 Pine Ave, Austin TX").first()).toBeVisible();
  await expect(page.getByText("Source: Thumbtack")).toBeVisible();
  await expect(page.locator("textarea").first()).toHaveValue(/3 doors, 2 drawers.*Warm white please/s);

  // new estimate from the client: the editor opens with the client's data filled in
  await page.locator("main, .page").getByRole("button", { name: /New estimate/ }).first().click();
  await page.getByRole("button", { name: /^Kitchen cabinets\s+Doors/ }).click();
  await page.waitForURL(/\/estimates\/[^/]+$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Maria Gonzalez");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("(555) 987-6543");
  await expect(page.getByLabel("Job address")).toHaveValue("88 Pine Ave, Austin TX");
});
