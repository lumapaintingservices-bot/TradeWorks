import { expect, newCabinetEstimate, signUpAndSkip, test } from "./helpers";

/** A line break in the middle of a sentence (pasted text) does not split the bullet on the document; the preview shows it. */
test("scope text with broken lines prints as whole bullets", async ({ page }) => {
  await signUpAndSkip(page);
  await newCabinetEstimate(page);
  await page.getByRole("button", { name: "Scope & notes" }).click();
  const box = page.locator(".card", { hasText: "Scope of work" }).locator("textarea").first();
  await box.fill([
    "Interior Painting Areas included primary bedroom, two bathrooms, hallway, living room",
    "dining area, kitchen and laundry room .",
    "Clean cut lines at ceilings, cleanup and removal of all debris and masking at the end of",
    "each day and at the end of the project.",
  ].join("\n"));
  const prev = page.locator(".sc-prev").first();
  await prev.locator("summary").click();
  await expect(prev.locator("summary")).toHaveText("Preview · 2 bullets on the document");
  await expect(prev.locator("li").first()).toHaveText("Interior Painting Areas included primary bedroom, two bathrooms, hallway, living room dining area, kitchen and laundry room.");
  await expect(prev.locator("li").nth(1)).toContainText("at the end of each day and at the end of the project.");
});
