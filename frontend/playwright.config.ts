import { defineConfig, devices } from "@playwright/test";
const e2ePort = process.env.E2E_PORT ?? "8001";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "../backend/.venv/bin/python ../scripts/e2e-server.py",
      url: `http://127.0.0.1:${e2ePort}/health`,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `API_PROXY_TARGET=http://127.0.0.1:${e2ePort} bun run dev -- --port 5174`,
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
