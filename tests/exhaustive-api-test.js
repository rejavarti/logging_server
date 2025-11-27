/**
 * EXHAUSTIVE API ENDPOINT TEST
 * Tests EVERY single API endpoint to find 500 errors
 */

const http = require('http');

const BASE_URL = 'http://localhost:19180';
const AUTH = { username: 'admin', password: 'TestPass123!' };

let token = null;
const results = { passed: [], failed: [], notFound: [] };

function request(method, path, body = null, useAuth = true) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        
        if (useAuth && token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data, headers: res.headers });
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function login() {
    const res = await request('POST', '/api/auth/login', AUTH, false);
    if (res.status === 200) {
        const data = JSON.parse(res.data);
        token = data.token;
        console.log('✅ Login successful\n');
        return true;
    }
    console.log('❌ Login failed:', res.status, res.data);
    return false;
}

async function testEndpoint(method, path, body = null, description = '') {
    try {
        const res = await request(method, path, body);
        
        if (res.status >= 500) {
            results.failed.push({ method, path, status: res.status, error: res.data.substring(0, 100) });
            console.log(`❌ ${method} ${path} - ${res.status} SERVER ERROR`);
            return false;
        } else if (res.status === 404) {
            results.notFound.push({ method, path });
            console.log(`⚠️  ${method} ${path} - 404 NOT FOUND`);
            return true; // Not a failure, just missing
        } else if (res.status >= 400) {
            console.log(`⚠️  ${method} ${path} - ${res.status}`);
            return true; // Client errors are OK for this test
        } else {
            results.passed.push({ method, path, status: res.status });
            console.log(`✅ ${method} ${path} - ${res.status}`);
            return true;
        }
    } catch (e) {
        results.failed.push({ method, path, error: e.message });
        console.log(`❌ ${method} ${path} - ERROR: ${e.message}`);
        return false;
    }
}

async function runAllTests() {
    console.log('='.repeat(60));
    console.log('EXHAUSTIVE API ENDPOINT TEST');
    console.log('='.repeat(60) + '\n');

    // Login
    if (!await login()) return;

    console.log('--- PUBLIC ENDPOINTS ---');
    await testEndpoint('GET', '/health');
    await testEndpoint('GET', '/login');

    console.log('\n--- SYSTEM API ---');
    await testEndpoint('GET', '/api/system/metrics');
    await testEndpoint('GET', '/api/system/health');
    await testEndpoint('GET', '/api/system/health-checks');
    await testEndpoint('GET', '/api/system/rate-limits');

    console.log('\n--- LOGS API ---');
    await testEndpoint('GET', '/api/logs');
    await testEndpoint('GET', '/api/logs?limit=10');
    await testEndpoint('GET', '/api/logs/stats');
    await testEndpoint('GET', '/api/logs/stats?groupBy=level');
    await testEndpoint('GET', '/api/logs/stats?groupBy=source');
    await testEndpoint('GET', '/api/logs/stats?groupBy=hour');
    await testEndpoint('GET', '/api/logs/analytics');
    await testEndpoint('GET', '/api/logs/sources');
    await testEndpoint('GET', '/api/logs/trends');
    await testEndpoint('GET', '/api/logs/trends?hours=24');
    await testEndpoint('GET', '/api/logs/count');
    await testEndpoint('POST', '/api/logs', { level: 'info', message: 'Test log', source: 'test' });

    console.log('\n--- INTEGRATIONS API ---');
    await testEndpoint('GET', '/api/integrations');
    await testEndpoint('GET', '/api/integrations/types');
    await testEndpoint('GET', '/integrations/api/health');
    await testEndpoint('POST', '/integrations/api/test-all');

    console.log('\n--- WEBHOOKS API ---');
    await testEndpoint('GET', '/api/webhooks');
    await testEndpoint('GET', '/api/webhooks/deliveries');
    await testEndpoint('POST', '/api/webhooks/test', { url: 'https://httpbin.org/post' });

    console.log('\n--- DASHBOARD API ---');
    await testEndpoint('GET', '/api/dashboard/widgets');
    await testEndpoint('GET', '/api/dashboard/layout');
    await testEndpoint('GET', '/api/dashboard/data');

    console.log('\n--- ACTIVITY API ---');
    await testEndpoint('GET', '/api/activity');
    await testEndpoint('GET', '/api/activity?limit=10');

    console.log('\n--- ALERTS API ---');
    await testEndpoint('GET', '/api/alerts/rules');
    await testEndpoint('GET', '/api/alerts/channels');
    await testEndpoint('GET', '/api/alerts/history');

    console.log('\n--- USERS API ---');
    await testEndpoint('GET', '/api/users');
    await testEndpoint('GET', '/api/users/me');
    await testEndpoint('GET', '/api/users/roles');

    console.log('\n--- SETTINGS API ---');
    await testEndpoint('GET', '/api/settings');
    await testEndpoint('GET', '/api/settings/all');

    console.log('\n--- SAVED SEARCHES API ---');
    await testEndpoint('GET', '/api/saved-searches');

    console.log('\n--- TRACING API ---');
    await testEndpoint('GET', '/api/tracing/status');
    await testEndpoint('GET', '/api/tracing/dependencies');
    await testEndpoint('GET', '/api/tracing/search');

    console.log('\n--- INGESTION API ---');
    await testEndpoint('GET', '/api/ingestion/status');
    await testEndpoint('POST', '/api/ingestion/test-parse', { data: 'test log line' });

    console.log('\n--- SECRETS API ---');
    await testEndpoint('GET', '/api/secrets/keys');

    console.log('\n--- API KEYS API ---');
    await testEndpoint('GET', '/api/api-keys');

    console.log('\n--- BACKUPS API ---');
    await testEndpoint('GET', '/api/backups');

    console.log('\n--- PAGES (HTML) ---');
    await testEndpoint('GET', '/dashboard');
    await testEndpoint('GET', '/logs');
    await testEndpoint('GET', '/integrations');
    await testEndpoint('GET', '/webhooks');
    await testEndpoint('GET', '/admin/settings');
    await testEndpoint('GET', '/admin/users');
    await testEndpoint('GET', '/admin/activity');
    await testEndpoint('GET', '/admin/backups');
    await testEndpoint('GET', '/admin/api-keys');
    await testEndpoint('GET', '/admin/security');
    await testEndpoint('GET', '/admin/alerts');
    await testEndpoint('GET', '/admin/tracing');
    await testEndpoint('GET', '/admin/ingestion');

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed (500 errors): ${results.failed.length}`);
    console.log(`⚠️  Not Found (404): ${results.notFound.length}`);

    if (results.failed.length > 0) {
        console.log('\n❌ FAILED ENDPOINTS:');
        results.failed.forEach(f => {
            console.log(`   ${f.method} ${f.path}: ${f.status || f.error}`);
        });
        process.exit(1);
    }

    if (results.notFound.length > 0) {
        console.log('\n⚠️  NOT FOUND (may be intentional):');
        results.notFound.forEach(f => {
            console.log(`   ${f.method} ${f.path}`);
        });
    }

    console.log('\n✅ All critical endpoints working!');
}

runAllTests().catch(console.error);
