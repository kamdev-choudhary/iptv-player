import { defineConfig, devices } from '@playwright/test'

/**
 * Drives the real application against a real database.
 *
 * There is no fixture data: the catalog is whatever `pnpm sync` last pulled,
 * which is the point — these tests are about the application working against
 * eleven thousand strangers' streams, and a hand-written fixture would not be
 * that. Nothing here asserts on a particular channel for the same reason.
 *
 * Both dev servers are started if they are not already up, so `pnpm e2e` works
 * from a cold terminal and reuses what is running when you are mid-session.
 */
const WEB = 'http://localhost:12995'
const API = 'http://127.0.0.1:12994'

export default defineConfig({
  testDir: './tests',
  // A dead upstream stream is the normal case here, so a slow tune is not a
  // broken test; the failover has several sources to get through.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: [
    {
      command: 'pnpm --filter @tuner/api dev',
      url: `${API}/health`,
      cwd: '..',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @tuner/web dev',
      url: WEB,
      cwd: '..',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
