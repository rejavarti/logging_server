// UI style and theming consistency checks across pages, including login
const { test, expect } = require('@playwright/test');

async function login(page, username = 'admin', password = process.env.AUTH_PASSWORD) {
  // Fast path: authenticate via API using the same browser context so cookies persist
  try {
    const res = await page.request.post('/api/auth/login', {
      data: { username, password }
    });
    if (res.ok()) {
      const body = await res.json();
      if (body && body.success) {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#lastUpdate, #totalLogs', { timeout: 30000, state: 'attached' });
        return;
      }
    }
  } catch (_) {
    // ignore and fall back to UI login
  }

  // Fallback: perform UI login
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait until the login script reports success or an error appears to avoid racing the session save.
  const loginOutcome = await page.waitForFunction(() => {
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('error-message');
    return (btn && /Success/i.test(btn.textContent)) || (err && err.textContent && err.textContent.trim().length > 0);
  }, { timeout: 30000 }).catch(() => null);

  if (!loginOutcome) {
    // Fallback small delay if the function didn't resolve but no exception thrown
    await page.waitForTimeout(1000);
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lastUpdate, #totalLogs', { timeout: 30000, state: 'attached' });
}

test.describe('UI style consistency', () => {
  test('favicon route responds with SVG', async ({ request }) => {
    const res = await request.get('/favicon.svg');
    expect(res.ok()).toBeTruthy();
    const ct = res.headers()['content-type'] || '';
    expect(ct).toMatch(/image\/svg\+xml/i);
  });

  test('login page has theme, toggle, and favicon link', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.ok()).toBeTruthy();
    // data-theme present either on html or body
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme')
    );
    expect(themeAttr).toBeTruthy();
    // theme toggle button is visible
    await expect(page.locator('.theme-toggle')).toBeVisible();
    // favicon link present
    await expect(page.locator('head link[rel*="icon"][href="/favicon.svg"]')).toHaveCount(1);
    // core CSS variables exist
    const hasVars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return !!(s.getPropertyValue('--bg-primary') && s.getPropertyValue('--accent-primary'));
    });
    expect(hasVars).toBeTruthy();
  });

  test('authenticated pages share theme, toggle, favicon, and base styles', async ({ page }) => {
    await login(page);
    // Prefer concrete admin subpages to avoid redirect-related flakiness
    const pages = [
      '/dashboard',
      '/logs',
      '/webhooks',
      '/search',
      '/integrations',
      '/activity',
      '/admin/settings',
      '/admin/users',
      '/admin/health',
      '/admin/api-keys',
      '/admin/search-advanced',
      '/admin/ingestion',
      '/admin/tracing',
      '/admin/dashboards',
    ];

    for (const path of pages) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Basic readiness check without relying on HTTP status (handles 30x redirects internally)
      const ready = await page.evaluate(() => ['interactive', 'complete'].includes(document.readyState));
      expect.soft(ready, `${path} should be loaded`).toBeTruthy();

      // DEBUG: capture HTML for first failing admin page if elements missing
      const htmlSnapshot = await page.content();

      // consistent theme attribute
      const themeAttr = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme')
      );
      if (!themeAttr && path.includes('/admin/settings')) {
        console.log('DEBUG_HTML_START /admin/settings');
        console.log(htmlSnapshot.substring(0, 1200));
        console.log('DEBUG_HTML_END');
      }
      expect.soft(!!themeAttr, `${path} has theme attribute`).toBeTruthy();

      // toggle exists
      const toggleVisible = await page.locator('.theme-toggle').first().isVisible().catch(() => false);
      if (!toggleVisible && path.includes('/admin/settings')) {
        console.log('DEBUG_NO_TOGGLE_FOUND');
      }
      await expect.soft(page.locator('.theme-toggle'), `${path} has theme toggle`).toBeVisible();

      // favicon link exists
      const faviconCount = await page.locator('head link[rel*="icon"][href="/favicon.svg"]').count();
      if (faviconCount === 0 && path.includes('/admin/settings')) {
        console.log('DEBUG_NO_FAVICON_LINK');
      }
      await expect.soft(page.locator('head link[rel*="icon"][href="/favicon.svg"]'), `${path} has favicon link`).toHaveCount(1);

      // core CSS vars present
      const hasVars = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return !!(s.getPropertyValue('--bg-primary') && s.getPropertyValue('--accent-primary'));
      });
      if (!hasVars && path.includes('/admin/settings')) {
        console.log('DEBUG_NO_CSS_VARS');
      }
      expect.soft(hasVars, `${path} has CSS variables set`).toBeTruthy();

      // common UI elements: either a button or a card exists (layout sanity)
      const hasCommon = await page.locator('.btn, button, .card').first().isVisible().catch(() => false);
      if (!hasCommon && path.includes('/admin/settings')) {
        console.log('DEBUG_NO_COMMON_UI_ELEMENTS');
      }
      expect.soft(hasCommon, `${path} has common UI elements`).toBeTruthy();
    }
  });
});
