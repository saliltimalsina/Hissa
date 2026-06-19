import { test, expect, type Page } from '@playwright/test';

// Happy-path regression net for the recent hook refactors (auth split + the
// accounts/auto-load effects). Every /api/** call is route-stubbed, so this
// runs with NO live backend and NO MeroShare.

const USER = { user_id: 1, email: 'demo@hissa.test', name: 'Demo User' };

const ACCOUNTS = [
  { id: 1, username: 'acct-one', label: 'Account One', dp: '13700', crn: 'CRN1' },
  { id: 2, username: 'acct-two', label: 'Account Two', dp: '13800', crn: 'CRN2' },
];

/**
 * Install API stubs. `loggedIn` controls whether /api/auth/me resolves to a
 * user (used to assert the bootstrap/login transition). All other endpoints
 * return benign empty-ish payloads so the auto-load effects succeed quietly.
 */
async function stubApi(page: Page, { loggedIn }: { loggedIn: boolean }) {
  // Playwright evaluates routes in REVERSE registration order (last-registered
  // wins). Register the broad catch-all FIRST so the specific routes below take
  // precedence over it.
  //
  // Catch-all: anything under /api not matched below returns an empty object
  // rather than hitting the (absent) backend.
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));

  // Auth: bootstrap session check.
  await page.route('**/api/auth/me', async (route) => {
    if (loggedIn) {
      await route.fulfill({ json: USER });
    } else {
      await route.fulfill({ status: 401, json: { detail: 'no session' } });
    }
  });

  // Auth: login → set a readable CSRF cookie + return the user.
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'set-cookie': 'hissa_csrf=e2e-csrf-token; Path=/; SameSite=Lax',
      },
      json: USER,
    });
  });

  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  // Account metadata (drives the auto-load effects).
  await page.route('**/api/accounts', (route) => route.fulfill({ json: ACCOUNTS }));

  // Auto-loaded data endpoints — return empty collections so pages render
  // their empty states without errors.
  await page.route('**/api/ipos', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/portfolio/aggregate', (route) => route.fulfill({ json: { accounts: [] } }));
  await page.route('**/api/reports', (route) => route.fulfill({ json: { accounts: [] } }));
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: { accounts: [] } }));
  // Broad history route first; the specific ones below override it (last wins).
  await page.route('**/api/history**', (route) => route.fulfill({ json: { rows: [], total: 0 } }));
  await page.route('**/api/history/stats', (route) =>
    route.fulfill({ json: { total: 0, success: 0, failed: 0, success_rate: 0 } }),
  );
  await page.route('**/api/history/applied-ipos', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/scheduler/rules', (route) => route.fulfill({ json: [] }));
}

test('sign in and navigate the app shell', async ({ page }) => {
  await stubApi(page, { loggedIn: false });

  await page.goto('/');

  // Login screen is shown (no session).
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  // Fill + submit the login form.
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Lands on the app shell — Overview is the default page; the sidebar renders.
  const sidebar = page.locator('aside');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Overview' })).toBeVisible();

  // Navigate to Accounts and assert it renders (the two stubbed accounts).
  await sidebar.getByRole('button', { name: 'Accounts' }).click();
  await expect(page.getByText('Account One')).toBeVisible();
  await expect(page.getByText('Account Two')).toBeVisible();

  // Navigate to the IPO Engine and assert the page mounts.
  await sidebar.getByRole('button', { name: 'IPO Engine' }).click();
  await expect(sidebar.getByRole('button', { name: 'IPO Engine' })).toBeVisible();
});
