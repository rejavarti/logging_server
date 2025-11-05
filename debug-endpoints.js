#!/usr/bin/env node
/**
 * 🔍 DEBUG API ENDPOINTS
 * Test specific failing endpoints to see exact errors
 */

const http = require('http');

async function testEndpoint(path, method = 'GET', sessionCookie = null, description = '') {
    return new Promise((resolve) => {
        console.log(`\n🔍 Testing ${description || path}...`);
        
        const options = {
            hostname: 'localhost',
            port: 10180,
            path: path,
            method: method,
            headers: sessionCookie ? { 'Cookie': sessionCookie } : {}
        };

        const req = http.request(options, (res) => {
            console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
            console.log(`   Headers:`, {
                'content-type': res.headers['content-type'],
                'location': res.headers['location']
            });
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`   Response: ${data.substring(0, 300)}${data.length > 300 ? '...' : ''}`);
                resolve({ statusCode: res.statusCode, data, headers: res.headers });
            });
        });

        req.on('error', (error) => {
            console.log(`   Error: ${error.message}`);
            resolve({ error: error.message });
        });

        req.end();
    });
}

async function debugEndpoints() {
    console.log('🔧 DEBUGGING FAILING API ENDPOINTS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');
    
    // First, authenticate to get session cookie
    console.log('🔐 Getting authentication...');
    
    const loginData = JSON.stringify({ username: 'admin', password: 'ChangeMe123!' });
    const loginOptions = {
        hostname: 'localhost',
        port: 10180,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(loginData)
        }
    };

    const authResult = await new Promise((resolve) => {
        const req = http.request(loginOptions, (res) => {
            let sessionCookie = null;
            if (res.headers['set-cookie']) {
                const cookies = res.headers['set-cookie'];
                for (const cookie of cookies) {
                    if (cookie.startsWith('connect.sid=')) {
                        sessionCookie = cookie.split(';')[0];
                        break;
                    }
                }
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`✅ Authentication: Status ${res.statusCode}`);
                resolve({ sessionCookie, statusCode: res.statusCode });
            });
        });
        req.on('error', (error) => resolve({ error: error.message }));
        req.write(loginData);
        req.end();
    });

    if (!authResult.sessionCookie) {
        console.log('❌ Could not authenticate - cannot test protected endpoints');
        return;
    }

    console.log(`🍪 Session cookie: ${authResult.sessionCookie.substring(0, 30)}...`);

    // Test the failing endpoints
    await testEndpoint('/', 'GET', authResult.sessionCookie, 'Dashboard Root');
    await testEndpoint('/api/log-analyzer/files', 'GET', authResult.sessionCookie, 'Files API');
    await testEndpoint('/log-analyzer/upload', 'POST', authResult.sessionCookie, 'Log Upload Route');
    await testEndpoint('/api/log-analyzer/upload', 'POST', authResult.sessionCookie, 'Log Upload API');
    
    console.log('\n═══════════════════════════════════════════════════════════════════════');
}

debugEndpoints().catch(console.error);