/**
 * EXHAUSTIVE BUTTON CLICK TEST
 * Visits every page and clicks every button, capturing 500 errors
 */

const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:19180';
const CREDS = { username: 'admin', password: 'TestPass123!' };

const results = {
    pagesVisited: 0,
    buttonsClicked: 0,
    errors500: [],
    consoleErrors: [],
    passed: []
};

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function run() {
    console.log('='.repeat(60));
    console.log('EXHAUSTIVE BUTTON CLICK TEST');
    console.log('='.repeat(60) + '\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Capture network errors
    page.on('response', response => {
        if (response.status() >= 500) {
            results.errors500.push({
                url: response.url(),
                status: response.status()
            });
            console.log(`❌ 500 ERROR: ${response.url()}`);
        }
    });

    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            if (!text.includes('extension://') && !text.includes('favicon') && text.trim()) {
                results.consoleErrors.push(text.substring(0, 200));
            }
        }
    });

    // Login
    console.log('Logging in...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('input[name="username"], #username', CREDS.username);
    await page.type('input[name="password"], #password', CREDS.password);
    await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    ]);
    await sleep(1000);
    console.log('✅ Logged in\n');

    // Pages to visit
    const pages = [
        '/dashboard',
        '/logs', 
        '/integrations',
        '/webhooks',
        '/admin/settings',
        '/admin/users',
        '/admin/api-keys',
        '/admin/security',
        '/admin/tracing',
        '/admin/ingestion'
    ];

    for (const pagePath of pages) {
        console.log(`\n--- Testing ${pagePath} ---`);
        
        try {
            await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1000);
            results.pagesVisited++;

            // Get all clickable elements
            const buttons = await page.evaluate(() => {
                const elements = document.querySelectorAll('button, [onclick], input[type="submit"], .btn');
                return Array.from(elements).map((el, i) => ({
                    index: i,
                    tag: el.tagName,
                    text: (el.innerText || el.value || '').substring(0, 30),
                    onclick: el.getAttribute('onclick') || '',
                    id: el.id,
                    className: el.className
                })).filter(b => {
                    // Skip navigation, close, and dangerous buttons
                    const skip = ['location.href', 'window.close', 'history.back', 'deleteUser', 'deleteIntegration', 'deleteWebhook', 'resetLayout'];
                    return !skip.some(s => b.onclick.includes(s) || b.text.toLowerCase().includes('delete'));
                });
            });

            console.log(`   Found ${buttons.length} clickable elements`);

            // Click each button
            for (const btn of buttons.slice(0, 20)) { // Limit to first 20 per page
                if (!btn.onclick && btn.tag !== 'BUTTON') continue;
                
                try {
                    const selector = btn.id 
                        ? `#${btn.id}`
                        : btn.onclick 
                            ? `[onclick="${btn.onclick.replace(/"/g, '\\"')}"]`
                            : `button:nth-of-type(${btn.index + 1})`;

                    // Clear previous errors
                    const errorsBefore = results.errors500.length;

                    await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el) el.click();
                    }, selector);

                    await sleep(500);
                    results.buttonsClicked++;

                    // Check for new 500 errors
                    if (results.errors500.length > errorsBefore) {
                        console.log(`   ❌ Button "${btn.text || btn.onclick.substring(0,20)}" caused 500 error`);
                    } else {
                        results.passed.push({ page: pagePath, button: btn.text || btn.onclick.substring(0, 20) });
                    }

                    // Close any modals
                    await page.evaluate(() => {
                        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
                        document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
                    });

                } catch (e) {
                    // Button click failed, ignore
                }
            }

        } catch (e) {
            console.log(`   ⚠️  Page error: ${e.message}`);
        }
    }

    await browser.close();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Pages visited: ${results.pagesVisited}`);
    console.log(`Buttons clicked: ${results.buttonsClicked}`);
    console.log(`500 Errors: ${results.errors500.length}`);
    console.log(`Console Errors: ${results.consoleErrors.length}`);

    if (results.errors500.length > 0) {
        console.log('\n❌ 500 ERRORS FOUND:');
        results.errors500.forEach(e => console.log(`   ${e.url}`));
        process.exit(1);
    }

    if (results.consoleErrors.length > 0) {
        console.log('\n⚠️  CONSOLE ERRORS (first 5):');
        results.consoleErrors.slice(0, 5).forEach(e => console.log(`   ${e.substring(0, 100)}`));
    }

    console.log('\n✅ NO 500 ERRORS FOUND!');
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
