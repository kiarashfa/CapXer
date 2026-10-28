import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { BASE_PATH } from '../src/config/site.ts';

const PORT = 4321;
const CI = !!process.env.CI;

// Chromium's built-in fake webcam (a moving test pattern), allowed without a prompt.
const fakeCamera = {
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
};

// Runs against the production build (`npm run build` first) served by `astro preview`.
export default defineConfig({
  testDir: 'e2e',
  outputDir: '.results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never', outputFolder: '.report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...fakeCamera } },
    // No real iPhone is available for testing, so mobile WebKit is the stand-in for iOS Safari.
    // It has no fake camera: the live tests there cover the refused and missing camera paths.
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...fakeCamera } },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT}`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !CI,
  },
});
