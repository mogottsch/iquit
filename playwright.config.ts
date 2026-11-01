import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: { browserName: 'chromium' },
  webServer: {
    command:
      'corepack pnpm@12.16.1 build && corepack pnpm@12.16.1 preview --host 127.0.0.1 --port 4187',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
  },
});
