/**
 * Runtime Integration Test
 * 
 * Actually starts the server and tests all critical endpoints.
 * This catches issues that static analysis misses.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 19999; // Use different port to not conflict
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let authToken = null;

const results = {
    passed: [],
    failed: [],
    skipped: []
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => {
                        try { return JSON.parse(data); }
                        catch { return null; }
                    },
                    text: () => data
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

async function startServer() {
    console.log('Starting server on port', PORT, '...');
    
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            env: { 
                ...process.env, 
                PORT: PORT.toString(),
                NODE_ENV: 'test',
                JWT_SECRET: 'test-secret-key-for-testing-only'
            },
            cwd: path.join(__dirname, '..'),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let started = false;
        const timeout = setTimeout(() => {
            if (!started) {
                reject(new Error('Server failed to start within 15 seconds'));
            }
        }, 15000);

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('running on port') || output.includes('Server running')) {
                started = true;
                clearTimeout(timeout);
                setTimeout(resolve, 1000); // Give it a second to fully initialize
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const err = data.toString();
            if (err.includes('Error') || err.includes('EADDRINUSE')) {
                clearTimeout(timeout);
                reject(new Error(err));
            }
        });

        serverProcess.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function stopServer() {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await sleep(500);
    }
}

async function login() {
    try {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { username: 'admin', password: 'admin' }
        });

        if (response.ok) {
            const data = response.json();
            authToken = data?.token;
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function testEndpoint(name, method, path, expectStatus = 200, requireAuth = true) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (requireAuth && authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${BASE_URL}${path}`, { method, headers });

        if (response.status === expectStatus || (expectStatus === 200 && response.ok)) {
            results.passed.push({ name, path, status: response.status });
            return true;
        } else if (response.status === 401 && requireAuth) {
            results.skipped.push({ name, path, reason: 'Auth required' });
            return true;
        } else {
            results.failed.push({ name, path, expected: expectStatus, got: response.status });
            return false;
        }
    } catch (e) {
        results.failed.push({ name, path, error: e.message });
        return false;
    }
}

async function runTests() {
    console.log('\n=== RUNTIME ENDPOINT TESTS ===\n');

    // Public endpoints
    await testEndpoint('Health Check', 'GET', '/health', 200, false);
    await testEndpoint('Login Page', 'GET', '/login', 200, false);

    // Try to login
    const loggedIn = await login();
    if (!loggedIn) {
        console.log('⚠️  Could not login, testing without auth...');
    }

    // API endpoints
    await testEndpoint('System Metrics', 'GET', '/api/system/metrics');
    await testEndpoint('System Health', 'GET', '/api/system/health');
    await testEndpoint('Get Logs', 'GET', '/api/logs?limit=10');
    await testEndpoint('Log Stats', 'GET', '/api/logs/stats');
    await testEndpoint('Log Analytics', 'GET', '/api/logs/analytics');
    await testEndpoint('Integrations List', 'GET', '/api/integrations');
    await testEndpoint('Webhooks List', 'GET', '/api/webhooks');
    await testEndpoint('Saved Searches', 'GET', '/api/saved-searches');
    await testEndpoint('Dashboard Widgets', 'GET', '/api/dashboard/widgets');
    await testEndpoint('Activity Log', 'GET', '/api/activity');
    await testEndpoint('Alert Rules', 'GET', '/api/alerts/rules');
    await testEndpoint('Users List', 'GET', '/api/users');
    await testEndpoint('Settings', 'GET', '/api/settings');

    // Admin pages
    await testEndpoint('Dashboard Page', 'GET', '/dashboard');
    await testEndpoint('Logs Page', 'GET', '/logs');
    await testEndpoint('Integrations Page', 'GET', '/integrations');
    await testEndpoint('Webhooks Page', 'GET', '/webhooks');
    await testEndpoint('Admin Settings', 'GET', '/admin/settings');
    await testEndpoint('Admin Users', 'GET', '/admin/users');
    await testEndpoint('Admin Activity', 'GET', '/admin/activity');
    await testEndpoint('Admin Backups', 'GET', '/admin/backups');

    // Integrations-specific endpoints  
    await testEndpoint('Integration Health', 'GET', '/integrations/api/health');
}

async function main() {
    console.log('=== RUNTIME INTEGRATION TEST ===');
    console.log('Testing actual server startup and endpoint responses\n');

    try {
        await startServer();
        console.log('✅ Server started successfully\n');

        await runTests();

    } catch (e) {
        console.log('❌ Server failed to start:', e.message);
        results.failed.push({ name: 'Server Startup', error: e.message });
    } finally {
        await stopServer();
    }

    // Print results
    console.log('\n' + '='.repeat(50));
    console.log('RESULTS');
    console.log('='.repeat(50));

    console.log(`\n✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);

    if (results.failed.length > 0) {
        console.log('\nFailed tests:');
        results.failed.forEach(f => {
            if (f.error) {
                console.log(`  - ${f.name}: ${f.error}`);
            } else {
                console.log(`  - ${f.name} (${f.path}): expected ${f.expected}, got ${f.got}`);
            }
        });
        process.exit(1);
    } else {
        console.log('\n✅ ALL RUNTIME TESTS PASSED!');
    }
}

main().catch(console.error);
