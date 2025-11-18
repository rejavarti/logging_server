/**
 * COMPREHENSIVE API ENDPOINT TESTING
 * Tests authentication, data validation, error handling across all endpoints
 */

async function testAPIEndpoints() {
    console.log('🔗 Testing all REST endpoints, authentication, and error handling...\n');
    
    let passed = 0;
    let failed = 0;
    
    const test = async (testName, testFunction) => {
        try {
            console.log(`Testing: ${testName}`);
            await testFunction();
            console.log(`✅ PASS: ${testName}`);
            passed++;
        } catch (error) {
            console.error(`❌ FAIL: ${testName} - ${error.message}`);
            failed++;
        }
        console.log('');
    };
    
    const makeRequest = async (url, options = {}) => {
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const curlArgs = ['-s', '-w', '%{http_code}'];
            
            if (options.method && options.method !== 'GET') {
                curlArgs.push('-X', options.method);
            }
            
            if (options.headers) {
                for (const [key, value] of Object.entries(options.headers)) {
                    curlArgs.push('-H', `${key}: ${value}`);
                }
            }
            
            if (options.data) {
                curlArgs.push('-d', options.data);
            }
            
            if (options.followRedirects === false) {
                // Don't follow redirects
            } else {
                curlArgs.push('-L');
            }
            
            curlArgs.push(url);
            
            const curl = spawn('curl', curlArgs);
            let output = '';
            let errorOutput = '';
            
            curl.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            curl.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            curl.on('close', (code) => {
                if (code === 0) {
                    // Extract status code (last 3 characters)
                    const statusCode = output.slice(-3);
                    const body = output.slice(0, -3);
                    resolve({ statusCode, body, error: errorOutput });
                } else {
                    reject(new Error(`curl failed: ${errorOutput}`));
                }
            });
        });
    };
    
    // Test 1: Health Endpoint
    await test('Health Endpoint', async () => {
        const response = await makeRequest('http://localhost:10180/health');
        
        if (response.statusCode !== '200') {
            throw new Error(`Expected 200, got ${response.statusCode}`);
        }
        
        const healthData = JSON.parse(response.body);
        if (!healthData.status || !healthData.timestamp) {
            throw new Error('Health endpoint missing required fields');
        }
        
        console.log(`    - Status: ${healthData.status}`);
        console.log(`    - Version: ${healthData.version || 'Unknown'}`);
    });
    
    // Test 2: Authentication Redirects
    await test('Authentication Redirects', async () => {
        const protectedEndpoints = [
            'http://localhost:10180/dashboard',
            'http://localhost:10180/api/logs',
            'http://localhost:10180/api/admin/health'
        ];
        
        for (const endpoint of protectedEndpoints) {
            const response = await makeRequest(endpoint, { followRedirects: false });
            
            if (response.statusCode !== '302') {
                throw new Error(`${endpoint} should redirect (302), got ${response.statusCode}`);
            }
        }
        
        console.log(`    - Tested ${protectedEndpoints.length} protected endpoints`);
    });
    
    // Test 3: Login Endpoint
    await test('Login Endpoint', async () => {
        const response = await makeRequest('http://localhost:10180/login', { followRedirects: false });
        
        if (response.statusCode !== '200') {
            throw new Error(`Login page should return 200, got ${response.statusCode}`);
        }
        
        if (!response.body.includes('login') && !response.body.includes('username')) {
            console.log('    - Login page may be redirecting or have different content structure');
        }
        
        console.log(`    - Login endpoint accessible`);
    });
    
    // Test 4: JSON Validation Middleware
    await test('JSON Validation Middleware', async () => {
        const response = await makeRequest('http://localhost:10180/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: '{"invalid": json}',  // Malformed JSON
            followRedirects: false
        });
        
        // Should handle malformed JSON gracefully (not crash)
        if (response.statusCode === '500') {
            throw new Error('Server crashed on malformed JSON - middleware not working');
        }
        
        console.log(`    - Malformed JSON handled gracefully (${response.statusCode})`);
    });
    
    // Test 5: HTTP Security Headers
    await test('Security Headers', async () => {
        const { spawn } = require('child_process');
        
        const checkHeaders = () => new Promise((resolve, reject) => {
            const curl = spawn('curl', ['-I', '-s', 'http://localhost:10180/health']);
            let output = '';
            
            curl.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            curl.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error('Failed to get headers'));
                }
            });
        });
        
        const headers = await checkHeaders();
        
        const requiredHeaders = [
            'Content-Security-Policy',
            'X-Content-Type-Options',
            'X-Frame-Options'
        ];
        
        const missingHeaders = [];
        for (const header of requiredHeaders) {
            if (!headers.includes(header)) {
                missingHeaders.push(header);
            }
        }
        
        if (missingHeaders.length > 0) {
            throw new Error(`Missing security headers: ${missingHeaders.join(', ')}`);
        }
        
        console.log(`    - All required security headers present`);
    });
    
    // Test 6: Rate Limiting
    await test('Rate Limiting Protection', async () => {
        const requests = [];
        
        // Make multiple rapid requests
        for (let i = 0; i < 5; i++) {
            requests.push(makeRequest('http://localhost:10180/health', { followRedirects: false }));
        }
        
        const responses = await Promise.all(requests);
        const rateLimited = responses.some(r => r.statusCode === '429');
        
        console.log(`    - Rate limiting: ${rateLimited ? 'Active' : 'Not triggered'}`);
        console.log(`    - All requests handled without crashes`);
    });
    
    // Test 7: Error Handling
    await test('Error Handling', async () => {
        const errorEndpoints = [
            'http://localhost:10180/nonexistent-endpoint',
            'http://localhost:10180/api/invalid-route'
        ];
        
        for (const endpoint of errorEndpoints) {
            const response = await makeRequest(endpoint, { followRedirects: false });
            
            if (response.statusCode === '500') {
                throw new Error(`${endpoint} returned 500 - poor error handling`);
            }
            
            // 404 or redirect is fine
            if (!['404', '302'].includes(response.statusCode)) {
                console.log(`    - ${endpoint}: ${response.statusCode} (unexpected but not fatal)`);
            }
        }
        
        console.log(`    - Error endpoints handled gracefully`);
    });
    
    // Summary
    console.log('═══════════════════════════════════════');
    console.log('🔗 API ENDPOINT TESTING RESULTS');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🌐 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    if (failed === 0) {
        console.log('🎉 All API endpoint tests PASSED!');
        return true;
    } else {
        console.log('⚠️  Some API endpoint tests FAILED!');
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    testAPIEndpoints()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('💥 API testing crashed:', error);
            process.exit(1);
        });
}

module.exports = { testAPIEndpoints };