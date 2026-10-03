import { expect, newCabinetEstimate, sign, signUpAndSkip, test } from "./helpers";

/** A client signs while the owner is on another page: the estimate turns Accepted without opening it, and "Who to write to today"
 *  (only on Dashboard > Today now) drops the "follow up on the estimate" item. */
test("a signature reaches the estimate while it is closed", async ({ page, context }) => {
  await signUpAndSkip(page);
  await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Phone", { exact: true }).fill("(555) 010-2030");
  await page.getByLabel("Doors", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Link & chat" }).click();
  await page.getByRole("button", { name: "Create client link" }).click();
  const link = (await page.locator(".linkbox").first().innerText()).trim();

  // the owner leaves the estimate; the pipeline no longer shows the follow-up list (it lives on Dashboard > Today)
  await page.getByRole("link", { name: "Pipeline" }).first().click();   // in-app navigation: the last edit is saved on the way out
  await page.waitForURL("**/pipeline");
  await expect(page.getByText("Who to write to today")).toHaveCount(0);

  const client = await context.newPage();
  await client.goto(link);
  await client.getByLabel("Your full name").fill("Ana Ruiz");
  await sign(client.getByLabel("Signature"));
  await client.getByRole("button", { name: /^Accept estimate/ }).click();
  await expect(client.getByText(/Thank you! Your project is confirmed/).first()).toBeVisible();

  // the owner's app (on the pipeline page, the estimate closed) gets it
  await expect(page.getByText(/Ana Ruiz signed the estimate!/)).toBeVisible({ timeout: 25_000 });
  await page.getByRole("link", { name: "Estimates" }).first().click();
  await expect(page.locator("tr, .ec, .card", { hasText: "Ana Ruiz" }).filter({ hasText: "Accepted" }).first()).toBeVisible();
});
