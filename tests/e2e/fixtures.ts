import { test as base, expect } from '@playwright/test';

/** Every request to Google's analytics hosts is stubbed and recorded; tests never reach the network. */
export const test = base.extend<{ gaRequests: string[] }>({
  gaRequests: async ({ page }, use) => {
    const seen: string[] = [];
    await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    });
    await use(seen);
  },
});

export { expect };
