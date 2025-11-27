/**
 * Comprehensive Button Test
 * 
 * This test clicks EVERY button in the UI and verifies no 500 errors occur.
 * Created after discovering missing DAL methods that caused runtime failures.
 */

const puppeteer = require('puppeteer');

const SERVER_URL = process.env.TEST_URL || 'http://localhost:10180';
const AUTH_CREDENTIALS = {
    username: 'admin',
    password: process.env.TEST_PASSWORD || 'ChangeMe123!'
};

// All pages to test
const PAGES_TO_TEST = [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/logs', name: 'Logs' },
    { path: '/integrations', name: 'Integrations' },
    { path: '/webhooks', name: 'Webhooks' },
    { path: '/admin/settings', name: 'Settings' },
    { path: '/admin/users', name: 'Users' },
    { path: '/admin/api-keys', name: 'API Keys' },
    { path: '/admin/activity', name: 'Activity' },
    { path: '/admin/backups', name: 'Backups' },
    { path: '/admin/security', name: 'Security' },
    { path: '/admin/tracing', name: 'Tracing' },
    { path: '/admin/alerts', name: 'Alerts' }
];

// Button selectors and their expected behavior
const BUTTON_TESTS = {
    dashboard: [
        { selector: '.theme-toggle, [onclick*="toggleTheme"]', action: 'click', name: 'Theme Toggle' },
        { selector: '[onclick*="refreshAllWidgets"]', action: 'click', name: 'Refresh All Widgets' },
        { selector: '[onclick*="saveLayout"]', action: 'click', name: 'Save Layout' },
        { selector: '[onclick*="resetLayout"]', action: 'click', name: 'Reset Layout', confirm: true },
        { selector: '[onclick*="toggleLock"]', action: 'click', name: 'Toggle Lock' },
        { selector: '[onclick*="addWidget"], .add-widget-btn', action: 'click', name: 'Add Widget' },
    ],
    integrations: [
        { selector: '[onclick*="testHealthIntegration"]', action: 'first', name: 'Test Health Integration' },
        { selector: '[onclick*="testAllHealthIntegrations"]', action: 'click', name: 'Test All Integrations' },
        { selector: '[onclick*="toggleIntegration"]', action: 'first', name: 'Toggle Integration' },
        { selector: '[onclick*="showAddIntegration"]', action: 'click', name: 'Add Integration Modal' },
        { selector: '[onclick*="testIntegrationForm"]', action: 'click', name: 'Test Integration Form' },
        { selector: '[onclick*="refreshCustomIntegrations"]', action: 'click', name: 'Refresh Custom' },
    ],
    webhooks: [
        { selector: '[onclick*="testWebhook"]', action: 'first', name: 'Test Webhook' },
        { selector: '[onclick*="toggleWebhook"]', action: 'first', name: 'Toggle Webhook' },
        { selector: '[onclick*="showAddWebhook"]', action: 'click', name: 'Add Webhook Modal' },
    ],
    logs: [
        { selector: '[onclick*="loadLogs"], [onclick*="refreshLogs"]', action: 'click', name: 'Load/Refresh Logs' },
        { selector: '[onclick*="exportLogs"]', action: 'click', name: 'Export Logs' },
        { selector: '[onclick*="clearFilters"]', action: 'click', name: 'Clear Filters' },
    ],
    settings: [
        { selector: '[onclick*="saveSettings"]', action: 'click', name: 'Save Settings' },
        { selector: '[onclick*="testNotification"]', action: 'click', name: 'Test Notification' },
    ],
    activity: [
        { selector: '[onclick*="refreshActivity"], [onclick*="loadActivity"]', action: 'click', name: 'Refresh Activity' },
        { selector: '[onclick*="exportActivity"]', action: 'click', name: 'Export Activity' },
        { selector: '[onclick*="clearActivityFilters"]', action: 'click', name: 'Clear Activity Filters' },
    ]
};

class ComprehensiveButtonTest {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = {
            passed: [],
            failed: [],
            skipped: [],
            errors: []
        };
        this.consoleErrors = [];
        this.networkErrors = [];
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });

        // Capture console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Filter out known false positives
                if (!text.includes('extension://') && 
                    !text.includes('favicon') &&
                    text.trim() !== '') {
                    this.consoleErrors.push(text);
                }
            }
        });

        // Capture network errors (500s)
        this.page.on('response', response => {
            if (response.status() >= 500) {
                this.networkErrors.push({
                    url: response.url(),
                    status: response.status(),
                    statusText: response.statusText()
                });
            }
        });
    }

    async login() {
        console.log('🔐 Logging in...');
        await this.page.goto(`${SERVER_URL}/login`, { waitUntil: 'networkidle2' });
        
        await this.page.type('input[name="username"], #username', AUTH_CREDENTIALS.username);
        await this.page.type('input[name="password"], #password', AUTH_CREDENTIALS.password);
        
        await Promise.all([
            this.page.click('button[type="submit"], .login-btn, #login-btn'),
            this.page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]).catch(() => {});
        
        // Verify logged in
        const url = this.page.url();
        if (url.includes('login')) {
            throw new Error('Login failed - still on login page');
        }
        console.log('✅ Login successful');
    }

    async testPage(pageConfig) {
        console.log(`\n📄 Testing page: ${pageConfig.name} (${pageConfig.path})`);
        
        try {
            await this.page.goto(`${SERVER_URL}${pageConfig.path}`, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            await this.page.waitForTimeout(1000); // Let page settle

            // Find ALL buttons on the page
            const buttons = await this.page.$$eval(
                'button, [onclick], input[type="submit"], .btn, a.btn',
                els => els.map(el => ({
                    text: el.innerText?.trim() || el.value || '',
                    onclick: el.getAttribute('onclick') || '',
                    className: el.className,
                    id: el.id,
                    tagName: el.tagName
                }))
            );

            console.log(`   Found ${buttons.length} clickable elements`);

            // Click each button that has an onclick handler
            for (const button of buttons) {
                if (button.onclick && !button.onclick.includes('location.href')) {
                    await this.testButton(button, pageConfig.name);
                }
            }

            // Also test by known selectors for this page type
            const pageType = pageConfig.path.split('/').pop() || 'dashboard';
            const knownTests = BUTTON_TESTS[pageType] || [];
            
            for (const test of knownTests) {
                await this.testButtonBySelector(test, pageConfig.name);
            }

        } catch (error) {
            this.results.errors.push({
                page: pageConfig.name,
                error: error.message
            });
            console.log(`   ❌ Page error: ${error.message}`);
        }
    }

    async testButton(buttonInfo, pageName) {
        const funcMatch = buttonInfo.onclick.match(/^(\w+)/);
        const funcName = funcMatch ? funcMatch[1] : buttonInfo.onclick.substring(0, 30);
        
        // Skip navigation and close buttons
        if (['window', 'location', 'close', 'history'].some(s => buttonInfo.onclick.includes(s))) {
            return;
        }

        // Clear error tracking before click
        const errorsBefore = this.networkErrors.length;
        
        try {
            // Find and click the button
            const selector = buttonInfo.id 
                ? `#${buttonInfo.id}` 
                : `[onclick="${buttonInfo.onclick.replace(/"/g, '\\"')}"]`;
            
            const element = await this.page.$(selector);
            if (element) {
                await element.click().catch(() => {});
                await this.page.waitForTimeout(500);
                
                // Check for 500 errors
                const errorsAfter = this.networkErrors.length;
                if (errorsAfter > errorsBefore) {
                    const newErrors = this.networkErrors.slice(errorsBefore);
                    this.results.failed.push({
                        page: pageName,
                        button: funcName,
                        errors: newErrors
                    });
                    console.log(`   ❌ ${funcName}: 500 error!`);
                } else {
                    this.results.passed.push({ page: pageName, button: funcName });
                }
                
                // Close any modals that opened
                await this.closeModals();
            }
        } catch (error) {
            // Button not found or click failed - skip
        }
    }

    async testButtonBySelector(test, pageName) {
        const errorsBefore = this.networkErrors.length;
        
        try {
            const element = await this.page.$(test.selector);
            if (!element) {
                this.results.skipped.push({ page: pageName, button: test.name, reason: 'Not found' });
                return;
            }

            // Handle confirm dialogs
            if (test.confirm) {
                this.page.once('dialog', async dialog => {
                    await dialog.dismiss();
                });
            }

            if (test.action === 'first') {
                // Click first matching element
                await element.click().catch(() => {});
            } else {
                await element.click().catch(() => {});
            }
            
            await this.page.waitForTimeout(800);

            // Check for 500 errors
            const errorsAfter = this.networkErrors.length;
            if (errorsAfter > errorsBefore) {
                const newErrors = this.networkErrors.slice(errorsBefore);
                this.results.failed.push({
                    page: pageName,
                    button: test.name,
                    errors: newErrors
                });
                console.log(`   ❌ ${test.name}: 500 error - ${newErrors.map(e => e.url).join(', ')}`);
            } else {
                this.results.passed.push({ page: pageName, button: test.name });
                console.log(`   ✅ ${test.name}`);
            }

            await this.closeModals();

        } catch (error) {
            this.results.skipped.push({ 
                page: pageName, 
                button: test.name, 
                reason: error.message 
            });
        }
    }

    async closeModals() {
        try {
            // Try various modal close methods
            await this.page.evaluate(() => {
                // Close any open modals
                document.querySelectorAll('.modal.show, .modal[style*="display: block"]').forEach(modal => {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                });
                // Click close buttons
                document.querySelectorAll('.modal .close, .modal .btn-close, [onclick*="closeModal"]').forEach(btn => {
                    btn.click();
                });
                // Remove backdrop
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            });
        } catch (e) {}
    }

    async runFullTest() {
        console.log('🚀 Starting Comprehensive Button Test');
        console.log('=' .repeat(60));
        
        await this.init();
        await this.login();

        for (const pageConfig of PAGES_TO_TEST) {
            await this.testPage(pageConfig);
        }

        await this.browser.close();
        this.printReport();
    }

    printReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 COMPREHENSIVE BUTTON TEST REPORT');
        console.log('='.repeat(60));

        console.log(`\n✅ PASSED: ${this.results.passed.length}`);
        
        if (this.results.failed.length > 0) {
            console.log(`\n❌ FAILED: ${this.results.failed.length}`);
            this.results.failed.forEach(f => {
                console.log(`   - [${f.page}] ${f.button}`);
                f.errors.forEach(e => {
                    console.log(`     └─ ${e.status} ${e.url}`);
                });
            });
        }

        if (this.results.skipped.length > 0) {
            console.log(`\n⏭️  SKIPPED: ${this.results.skipped.length}`);
        }

        if (this.results.errors.length > 0) {
            console.log(`\n⚠️  PAGE ERRORS: ${this.results.errors.length}`);
            this.results.errors.forEach(e => {
                console.log(`   - [${e.page}] ${e.error}`);
            });
        }

        if (this.consoleErrors.length > 0) {
            console.log(`\n🔴 CONSOLE ERRORS: ${this.consoleErrors.length}`);
            this.consoleErrors.slice(0, 10).forEach(e => {
                console.log(`   - ${e.substring(0, 100)}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        const total = this.results.passed.length + this.results.failed.length;
        const passRate = total > 0 ? Math.round((this.results.passed.length / total) * 100) : 0;
        console.log(`📈 PASS RATE: ${passRate}% (${this.results.passed.length}/${total})`);
        
        if (this.results.failed.length === 0) {
            console.log('🎉 ALL BUTTONS WORKING - NO 500 ERRORS!');
        } else {
            console.log('⚠️  SOME BUTTONS HAVE ISSUES - SEE FAILED LIST ABOVE');
            process.exit(1);
        }
    }
}

// Run the test
const test = new ComprehensiveButtonTest();
test.runFullTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
