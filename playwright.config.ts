import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * End-to-end tests (`npm run test:e2e`). They run the real app in local DEMO mode (no Firebase: accounts and data live in the
 * browser's localStorage), so they are fast, need no network and never touch a real project.
 *
 * - No browser download: the browser at /opt/pw-browsers/chromium is used when it exists (this sandbox); otherwise Playwright's own
 *   (run `npx playwright install chromium` once), or the installed Edge / Chrome with E2E_CHANNEL=msedge / chrome.
 * - E2E_PORT changes the dev-server port (default 5300); E2E_DIST_PORT the port of the production-build check (default 5301, see e2e/csp.spec.ts).
 */
const PORT = Number(process.env.E2E_PORT || 5300);
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
// A developer's .env with real Firebase keys must never leak into the tests: empty values win over .env files.
const DEMO_ENV = {
  VITE_FIREBASE_API_KEY: "", VITE_FIREBASE_AUTH_DOMAIN: "", VITE_FIREBASE_PROJECT_ID: "", VITE_FIREBASE_STORAGE_BUCKET: "",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "", VITE_FIREBASE_APP_ID: "", VITE_BILLING_API: "", VITE_CAL_FEED_URL: "",
};

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1300, height: 900 },
    launchOptions: existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM, args: ["--no-sandbox"] } : {},
    // E2E_CHANNEL=msedge (or chrome) uses the browser already installed on the PC instead of downloading Playwright's
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "app", testIgnore: /csp\.spec/ },
    // the production build served with the rules of public/_headers (Content-Security-Policy etc.); the spec builds and serves it itself
    { name: "csp", testMatch: /csp\.spec/ },
  ],
  webServer: [
    { command: `npm run dev -- --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI, timeout: 120_000, env: DEMO_ENV },
  ],
});
