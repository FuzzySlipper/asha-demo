import { defineConfig, devices } from '@playwright/test';

const brokerBaseUrl = process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL;
const artifactRoot = process.env.PLAYWRIGHT_BROKER_ARTIFACT_ROOT ?? 'artifacts/playwright-local';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium';

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  reporter: [['list']],
  outputDir: `${artifactRoot}/playwright-results`,
  use: {
    baseURL: brokerBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        launchOptions: {
          executablePath: chromiumExecutable,
          args: ['--no-sandbox'],
        },
      },
    },
  ],
});
