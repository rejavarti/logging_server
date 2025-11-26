/**
 * UI Launch Readiness Test - Puppeteer Browser Testing
 * Usage: node scripts/ui-launch-test.js [serverUrl] [password]
 */

const puppeteer = require('puppeteer');

const serverUrl = process.argv[2] || 'http://localhost:10180';
const password = process.argv[3] || 'ChangeMe123!';

(async () => {
    const results = { passed: 0, failed: 0, tests: [] };

    function pass(name) {
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log('✅ ' + name);
    }

    function fail(name, reason) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', reason });
        console.log('❌ ' + name + ': ' + reason);
    }

    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Test 1: Login page loads
        await page.goto(serverUrl + '/login', { waitUntil: 'networkidle2', timeout: 15000 });
        const loginForm = await page.$('form, input[type="password"]');
        loginForm ? pass('Login page loads with form') : fail('Login page', 'No form found');

        // Test 2: Login works
        await page.type('input[name="username"], input[type="text"]', 'admin');
        await page.type('input[name="password"], input[type="password"]', password);
        await Promise.all([
            page.waitForNavigation({ timeout: 10000 }),
            page.click('button[type="submit"], input[type="submit"]')
        ]);

        const url = page.url();
        url.includes('dashboard') || url.includes('logs') ? pass('Login redirects to dashboard') : fail('Login redirect', 'Still on: ' + url);

        // Test 3: Dashboard widgets render
        await new Promise(r => setTimeout(r, 2000));
        const widgets = await page.$$('.widget, .card, .muuri-item, [class*="widget"]');
        widgets.length > 0 ? pass('Dashboard widgets rendered: ' + widgets.length) : fail('Dashboard widgets', 'No widgets found');

        // Test 4: Charts render
        const charts = await page.$$('canvas');
        charts.length > 0 ? pass('Charts rendered: ' + charts.length) : fail('Charts', 'No canvas elements');

        // Test 5: Navigation works
        await page.goto(serverUrl + '/logs', { waitUntil: 'networkidle2', timeout: 10000 });
        const logsContent = await page.content();
        logsContent.includes('log') || logsContent.includes('Log') ? pass('Logs page loads') : fail('Logs page', 'Content missing');

        // Test 6: Admin pages accessible
        await page.goto(serverUrl + '/admin', { waitUntil: 'networkidle2', timeout: 10000 });
        const adminContent = await page.content();
        adminContent.length > 500 ? pass('Admin page loads') : fail('Admin page', 'Page too short');

        // Test 7: Settings page
        await page.goto(serverUrl + '/admin/settings', { waitUntil: 'networkidle2', timeout: 10000 });
        const settingsContent = await page.content();
        settingsContent.includes('setting') || settingsContent.includes('Setting') || settingsContent.length > 1000
            ? pass('Settings page loads')
            : fail('Settings page', 'Content missing');

        // Test 8: Integrations page
        await page.goto(serverUrl + '/integrations', { waitUntil: 'networkidle2', timeout: 10000 });
        const intContent = await page.content();
        intContent.length > 500 ? pass('Integrations page loads') : fail('Integrations page', 'Page too short');

        // Test 9: No critical console errors
        const consoleErrors = [];
        page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        await page.goto(serverUrl + '/dashboard', { waitUntil: 'networkidle2', timeout: 10000 });
        await new Promise(r => setTimeout(r, 3000)); // Wait for async operations

        const criticalErrors = consoleErrors.filter(e =>
            !e.includes('extension://') &&
            !e.includes('WebSocket error') &&
            !e.includes('favicon') &&
            e.length > 0
        );
        criticalErrors.length === 0 ? pass('No critical console errors') : fail('Console errors', criticalErrors.slice(0, 3).join('; '));

        // Test 10: Theme toggle works
        const themeToggle = await page.$('.theme-toggle, [data-theme], button[onclick*="theme"]');
        themeToggle ? pass('Theme toggle exists') : fail('Theme toggle', 'Not found');

    } catch (err) {
        fail('Puppeteer execution', err.message);
    } finally {
        if (browser) await browser.close();
    }

    console.log('');
    console.log('UI Tests: ' + results.passed + '/' + (results.passed + results.failed) + ' passed');
    console.log(JSON.stringify({ passed: results.passed, failed: results.failed }, null, 2));
    process.exit(results.failed > 0 ? 1 : 0);
})();
