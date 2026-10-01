import { expect, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

/** Invoice payment link: owner sends /pay/<token>, the client sees the amount and the ways to pay, says "I paid by Venmo", the owner confirms. */
test("invoice payment link: client claims, owner confirms, link shows paid", async ({ page, context }) => {
  await signUpAndSkip(page);

  // ways to pay: Zelle + Venmo + checks payable to (the chips stay as they are: all four)
  await page.goto("/settings?section=client");
  await page.getByLabel("Zelle email or phone").fill("pay@luma.example");
  await page.getByLabel(/Venmo username/).fill("@luma-paint");
  await page.getByLabel(/Checks payable to/).fill("Luma Painting LLC");
  await page.locator(".card", { hasText: "How clients pay you" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  // estimate: 10 doors x $80 + 5 drawers x $55 = $1,075 -> deposit $537.50 + balance $537.50
  await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Phone", { exact: true }).fill("(555) 010-2030");
  await page.getByLabel("Doors", { exact: true }).fill("10");
  await page.getByLabel("Drawers", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: "Create deposit + balance invoices" }).click();
  await expect(page.getByText("2 invoices created.")).toBeVisible();

  // the preview panel: the client's document next to "Send to the client"; create the deposit's payment link there
  const depRow = page.locator(".iv-row", { hasText: "Deposit" }).first();
  await depRow.getByRole("button", { name: "Preview" }).click();
  const panel = page.locator(".drawer");
  await expect(panel.locator(".sheet")).toContainText("$537.50");
  await panel.getByRole("button", { name: "Create payment link" }).click();
  await expect(page.getByText("Link created")).toBeVisible();
  const link = (await panel.locator(".pay-link span").innerText()).trim();
  expect(link).toMatch(/\/pay\/[A-Za-z0-9]{24}$/);
  await expect(panel.locator("textarea")).toHaveValue(/Hi Ana, here is your invoice INV-\d+ \(deposit\) for \$537\.50/);
  // the document's language switch also switches the message
  await panel.getByRole("button", { name: "Español" }).click();
  await expect(panel.locator(".sheet")).toContainText("Factura");
  await expect(panel.locator("textarea")).toHaveValue(/Hola Ana, aquí está su factura/);
  await panel.getByRole("button", { name: "English" }).click();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await expect(depRow.getByRole("button", { name: "Send ✓" })).toBeVisible();

  // ---- the client
  const client = await context.newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Ana Ruiz" })).toBeVisible();
  await expect(client.getByText("Invoice for")).toBeVisible();
  await expect(client.locator(".pt-kpis b").first()).toHaveText("$537.50");
  await expect(client.getByText(/pay@luma\.example/)).toBeVisible();
  await expect(client.getByText("@luma-paint")).toBeVisible();
  await expect(client.getByText("Pay to: Luma Painting LLC")).toBeVisible();
  await expect(client.getByRole("link", { name: "Open Venmo" })).toHaveAttribute("href", /venmo\.com\/\?txn=pay.*recipients=luma-paint&amount=537\.50/);
  // Spanish toggle
  await client.getByRole("button", { name: "ES", exact: true }).click();
  await expect(client.getByText("Factura para")).toBeVisible();
  await client.getByRole("button", { name: "EN", exact: true }).click();

  await client.getByRole("button", { name: "I already paid" }).click();
  await client.getByRole("button", { name: "Venmo", exact: true }).click();
  await client.getByLabel(/Note \(optional\)/).fill("conf 4471");
  await client.getByRole("button", { name: "I paid $537.50" }).click();
  await expect(client.getByText(/You told us you paid by Venmo/).first()).toBeVisible();

  // ---- the owner sees the claim on /invoices and confirms
  await page.goto("/invoices");
  await expect(page.getByRole("button", { name: /To confirm \(1\)/ })).toBeVisible();
  const claim = page.locator(".iv-claim:visible").first();
  await expect(claim).toContainText("The client says they sent $537.50 by Venmo");
  await expect(claim).toContainText("conf 4471");
  await claim.getByRole("button", { name: "Payment received" }).click();
  await expect(page.getByText(/marked paid/)).toBeVisible();
  await expect(page.locator(".iv-claim")).toHaveCount(0);
  await expect(page.getByText("$537.50 collected")).toBeVisible();

  // ---- the client's page now says paid
  await client.reload();
  await expect(client.locator(".pt-status")).toContainText("Paid");
  await expect(client.getByRole("heading", { name: "How to pay" })).toHaveCount(0);

  // "Not received" on the balance: the client can tell us again
  await page.locator("tbody tr", { hasText: "Balance" }).getByRole("button", { name: "Send", exact: true }).click();
  await page.locator(".drawer").getByRole("button", { name: "Create payment link" }).click();
  await expect(page.locator(".drawer .pay-link span")).toContainText("/pay/");
  const link2 = (await page.locator(".drawer .pay-link span").innerText()).trim();
  await page.locator(".drawer").getByRole("button", { name: "Close" }).click();
  await client.goto(link2);
  await client.getByRole("button", { name: "I already paid" }).click();
  await client.getByRole("button", { name: "Zelle", exact: true }).click();
  await client.getByRole("button", { name: "I paid $537.50" }).click();
  await expect(client.getByText(/You told us you paid by Zelle/).first()).toBeVisible();
  await page.reload();
  await page.locator(".iv-claim:visible").first().getByRole("button", { name: "Not received" }).click();
  await expect(page.locator(".iv-claim")).toHaveCount(0);
  await client.reload();
  await expect(client.getByRole("button", { name: "I already paid" })).toBeVisible();

  // turning the link off shows "not active"
  await page.locator("tbody tr", { hasText: "Balance" }).getByRole("button", { name: "Send ✓" }).click();
  await page.locator(".drawer").getByRole("button", { name: "Turn off link" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Link turned off")).toBeVisible();
  await client.goto(link2);
  await expect(client.getByText("This link isn't active")).toBeVisible();
});
