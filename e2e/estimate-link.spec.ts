import { expect, newCabinetEstimate, sign, signUpAndSkip, test } from "./helpers";

/** (a) the whole selling loop: estimate -> client link -> options, signature, Zelle, chat -> owner confirms the deposit. */
test("estimate to client link to signed, deposit claimed, confirmed and invoiced", async ({ page, context }) => {
  await signUpAndSkip(page);

  // the owner's Zelle details (the client sees them after signing)
  await page.goto("/settings?section=client");
  await page.getByLabel("Zelle email or phone").fill("pay@luma.example");
  await page.getByLabel("Name on the Zelle account").fill("Luma Painting");
  await page.locator(".card", { hasText: "How clients pay you" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  // new kitchen-cabinet estimate for a client: 10 doors x $80 + 5 drawers x $55 = $1,075
  await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Phone", { exact: true }).fill("(555) 010-2030");
  await page.getByLabel("Email", { exact: true }).fill("ana@client.example");
  await page.getByLabel("Job address").fill("12 Oak Street");
  await page.getByLabel("Doors", { exact: true }).fill("10");
  await page.getByLabel("Drawers", { exact: true }).fill("5");
  const total = page.locator(".card", { hasText: "Totals" }).locator(".totline.big, .totline", { hasText: /^Total/ }).first();
  await expect(total).toContainText("$1,075.00");

  // an optional add-on the client can pick
  await page.getByRole("button", { name: "+ Add option" }).click();
  await page.getByPlaceholder("Description").last().fill("Crown molding");
  await page.getByPlaceholder("Price").last().fill("200");

  // create the client link
  await page.getByRole("tab", { name: "Link & chat" }).or(page.getByRole("button", { name: "Link & chat" })).first().click();
  await page.getByRole("button", { name: "Create client link" }).click();
  const link = (await page.locator(".linkbox").first().innerText()).trim();
  expect(link).toMatch(/\/p\/[A-Za-z0-9]{24}$/);

  // ---- the client, in a second tab (same browser storage = the shared demo "cloud")
  const client = await context.newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Ana Ruiz" })).toBeVisible();
  const bigTotal = client.locator("#ptHeroTotal");
  await expect(bigTotal).toHaveText("$1,075.00");
  await client.getByRole("button", { name: /Crown molding/ }).click();       // live total changes
  await expect(bigTotal).toHaveText("$1,275.00");
  await client.getByRole("button", { name: /Crown molding/ }).click();       // and back
  await expect(bigTotal).toHaveText("$1,075.00");
  await client.getByRole("button", { name: /Crown molding/ }).click();
  await expect(bigTotal).toHaveText("$1,275.00");

  await client.getByLabel("Your full name").fill("Ana Ruiz");
  await sign(client.getByLabel("Signature"));
  await client.getByRole("button", { name: /^Accept estimate/ }).click();
  await expect(client.getByText(/Thank you! Your project is confirmed/).first()).toBeVisible();

  // Zelle box: details visible, deposit is 50% of $1,275
  await expect(client.locator(".pt-pm").getByText(/pay@luma\.example/)).toBeVisible();
  await expect(client.locator(".pt-amt b")).toHaveText("$637.50");
  await client.getByRole("button", { name: "I sent the Zelle" }).click();
  await expect(client.getByText(/We'll confirm your payment shortly/)).toBeVisible();

  // chat
  await client.getByPlaceholder("Write a message").fill("When can you start?");
  await client.getByRole("button", { name: "Send", exact: true }).click();
  await expect(client.locator(".pt-msg", { hasText: "When can you start?" })).toBeVisible();
  await client.close();

  // ---- back on the owner's screen: Accepted + deposit claim + the chat message
  await expect(page.getByText("Confirm the deposit")).toBeVisible();
  await expect(page.locator(".owner-chat", { hasText: "When can you start?" })).toBeVisible();
  await expect(page.locator("select").first()).toHaveValue("Accepted");
  await expect(page.locator(".totline.big", { hasText: "Total" }).first()).toContainText("$1,275.00");

  // owner replies; the client sees it
  await page.getByPlaceholder("Reply to the client…").fill("Next Monday!");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await page.getByRole("button", { name: "Deposit received" }).click();
  await expect(page.locator("select").first()).toHaveValue("Deposit Paid");

  // invoices: one click builds deposit + balance from the estimate, then the deposit is marked paid
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page.getByRole("button", { name: "Create deposit + balance invoices" }).click();
  await expect(page.getByText("2 invoices created.")).toBeVisible();
  await page.locator(".iv-row, .card", { hasText: "Deposit" }).getByRole("button", { name: "Mark paid" }).first().click();
  await expect(page.getByRole("button", { name: "Mark paid" })).toHaveCount(1); // only the balance is left ("Mark unpaid" is in the ⋯ menu)
  await expect(page.locator("select").first()).toHaveValue("Deposit Paid");

  await page.goto("/invoices");
  await expect(page.getByText("$637.50 collected")).toBeVisible();
  await expect(page.getByText("$637.50 outstanding")).toBeVisible();
  const list = page.locator("table").first();
  await expect(list.locator("tbody tr")).toHaveCount(2);
  await expect(list).toContainText("Ana Ruiz");
  await expect(list.locator("tbody tr", { hasText: "Paid" }).first()).toContainText("$637.50");
  // survives a reload (it is saved, not just on screen)
  await page.reload();
  await expect(page.getByText("$637.50 collected")).toBeVisible();
});
