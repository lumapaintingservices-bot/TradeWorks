import { execSync, spawn, type ChildProcess } from "node:child_process";
import { FIXTURES, demoCompanyId, demoRows, expect, freezeToday, newCabinetEstimate, sign, signUpAndSkip, test } from "./helpers";

/**
 * The PRODUCTION build served with the rules of public/_headers (Content-Security-Policy, frame-ancestors ...), driven through
 * the main flows while watching for CSP violations. Run: `npm run test:e2e -- --project=csp` (it builds dist/ itself, ~5 s).
 */
const PORT = Number(process.env.E2E_DIST_PORT || 5301);
const ORIGIN = `http://localhost:${PORT}`;
let server: ChildProcess | undefined;
test.use({ baseURL: ORIGIN });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  execSync("npm run build", { stdio: "ignore", env: { ...process.env, VITE_FIREBASE_API_KEY: "", VITE_FIREBASE_PROJECT_ID: "", VITE_BILLING_API: "" } });
  server = spawn("node", ["e2e/serve-dist.mjs", String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(ORIGIN + "/")).ok) return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
  throw new Error("dist server did not start");
});
test.afterAll(() => { server?.kill(); });

test("security headers are served on every page, the client link cannot be framed", async ({ request }) => {
  for (const path of ["/", "/p/abcdefghijklmnopqrstuvwx", "/request?c=x", "/estimates"]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    const h = r.headers();
    expect(h["content-security-policy"], path).toContain("default-src 'self'");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("script-src 'self'");
    expect(h["content-security-policy"], path).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=(self)");
  }
  const asset = await request.get("/assets/" + (await (await request.get("/")).text()).match(/assets\/([^"]+\.js)/)![1]);
  expect(asset.headers()["cache-control"]).toContain("immutable");
});

test("the CSP is really enforced: an inline script and a foreign image are blocked", async ({ page, watch }) => {
  watch.allow(/Refused to (execute|load)/);   // the two blocked things below are the point of this test
  await page.addInitScript(() => { (window as unknown as { __v: string[] }).__v = []; document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.violatedDirective + " " + e.blockedURI)); });
  await page.goto("/login");
  await page.evaluate(() => {
    const s = document.createElement("script"); s.textContent = "window.__pwned = 1"; document.body.appendChild(s);
    const i = document.createElement("img"); i.src = "https://evil.example/x.png"; document.body.appendChild(i);
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __v: string[] }).__v.length)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  const v = await page.evaluate(() => (window as unknown as { __v: string[] }).__v.join(" | "));
  expect(v).toMatch(/script-src/); expect(v).toMatch(/img-src/);
});

test("the app works under the CSP: sign up, estimate, client link, lead form with photo, exports", async ({ page, context }) => {
  await page.addInitScript(() => { (window as unknown as { __v: string[] }).__v = []; document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.violatedDirective + " " + e.blockedURI)); });
  await freezeToday(context);
  await signUpAndSkip(page, "Csp Owner");
  const cid = await demoCompanyId(page);

  const estId = await newCabinetEstimate(page);
  await page.getByLabel("Name", { exact: true }).fill("Ana Ruiz");
  await page.getByLabel("Doors", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Link & chat" }).click();
  await page.getByRole("button", { name: "Create client link" }).click();
  const link = (await page.locator(".linkbox").first().innerText()).trim().replace(/^https?:\/\/[^/]+/, ORIGIN);

  // client link: options, signature (canvas -> data URL), image
  const client = await context.newPage();
  await client.addInitScript(() => { (window as unknown as { __v: string[] }).__v = []; document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.violatedDirective + " " + e.blockedURI)); });
  await client.goto(link);
  await client.getByLabel("Your full name").fill("Ana Ruiz");
  await sign(client.getByLabel("Signature"));
  await client.getByRole("button", { name: /^Accept estimate/ }).click();
  await expect(client.getByText(/Thank you! Your project is confirmed/).first()).toBeVisible();
  expect(await client.evaluate(() => (window as unknown as { __v: string[] }).__v)).toEqual([]);
  await client.close();

  // owner sees the signature image on the printable document (data: image)
  await expect(page.locator("select").first()).toHaveValue("Accepted");
  await expect.poll(async () => (await demoRows<{ signature?: { img?: string } }>(page, cid, "estimates"))[0]?.signature?.img ?? "").toContain("data:image/png");   // saved, not just on screen
  await page.goto(`/estimates/${estId}/doc`);
  await expect(page.locator("img.sig-img")).toBeVisible();

  // lead form with a photo (shrunk in a canvas, sent as data URL)
  const lead = await context.newPage();
  await lead.addInitScript(() => { (window as unknown as { __v: string[] }).__v = []; document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.violatedDirective + " " + e.blockedURI)); });
  await lead.goto(`/request?c=${cid}`);
  await lead.getByRole("button", { name: /^Start/ }).click();
  await lead.getByRole("button", { name: /Kitchen cabinets/ }).click();
  for (let i = 0; i < 4; i++) await lead.getByRole("button", { name: /^Continue/ }).click();
  await lead.locator('input[type="file"]').setInputFiles({ name: "k.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4EIwESMolGF/wEAgRIBDBGxD0sAAAAASUVORK5CYII=", "base64") });
  await expect(lead.locator(".lf-photos .ph")).toHaveCount(1);
  await lead.getByRole("button", { name: /^Continue/ }).click();
  await lead.getByLabel("Full name").fill("Maria G");
  await lead.getByLabel("Phone", { exact: true }).fill("5559876543");
  await lead.getByLabel("Project address").fill("1 Main St");
  await lead.getByRole("button", { name: /Send my request/ }).click();
  await expect(lead.getByRole("heading", { name: "Thank you — we got your request!" })).toBeVisible();
  expect(await lead.evaluate(() => (window as unknown as { __v: string[] }).__v)).toEqual([]);
  await lead.close();

  // importing the request copies the photo and shows it; bank CSV import (FileReader) and a backup download (blob)
  await page.goto("/clients");
  await page.locator(".lead-inbox").getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("New request imported: Maria G")).toBeVisible();
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Import bank CSV" }).first().click();
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "chase-card.csv");
  await expect(page.getByRole("dialog")).toContainText("7 charges");
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.goto("/settings?section=backup");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  await page.goto("/reports");
  await page.goto("/");

  expect(await page.evaluate(() => (window as unknown as { __v: string[] }).__v), "CSP violations on the owner pages").toEqual([]);
});
