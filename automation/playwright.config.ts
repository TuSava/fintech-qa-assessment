import { defineConfig } from '@playwright/test';
import { Config } from './configuration/environment';

export default defineConfig({
  testDir: './tests',
  timeout: Config.timeout,
  fullyParallel: false, // Run financial tests sequentially to avoid cross-test ledger contamination
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: Config.baseUrl,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx ts-node mock-server/server.ts',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
