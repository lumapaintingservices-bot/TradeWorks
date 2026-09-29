import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // e2e/ is Playwright (npm run test:e2e) and rules-tests/ needs the Firebase emulator (npm run test:rules): not unit tests
  test: { exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", "rules-tests/**", "test-results/**"] },
});
