import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, retries: 0, timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:13000',
    trace: 'off', screenshot: 'off', video: 'off',
    launchOptions: {
      ...(process.env['PLAYWRIGHT_CHROME_PATH'] ? { executablePath: process.env['PLAYWRIGHT_CHROME_PATH'] } : {}),
    },
  },
});
