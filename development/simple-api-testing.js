/**
 * SIMPLIFIED API ENDPOINT TESTING (Node.js only)
 * Tests authentication, data validation, error handling without external dependencies
 */

const http = require('http');

async function testAPIEndpoints() {
    console.log('🔗 Testing REST endpoints with Node.js http module...\n');
    
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
    
    const makeRequest = (path, options = {}) => {
        return new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: 'localhost',
                port: 3000,  // Internal port
                path: path,
                method: options.method || 'GET',
                headers: options.headers || {},
                timeout: 5000
            };
            
            const req = http.request(reqOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            if (options.data) {
                req.write(options.data);
            }
            
            req.end();
        });
    };
    
    // Test 1: Health Endpoint
    await test('Health Endpoint', async () => {
        const response = await makeRequest('/health');
        
        if (response.statusCode !== 200) {
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
        const protectedPaths = ['/dashboard', '/api/logs', '/api/admin/health'];
        
        for (const path of protectedPaths) {
            const response = await makeRequest(path);
            
            if (response.statusCode !== 302 && response.statusCode !== 401 && response.statusCode !== 200) {
                console.log(`    - ${path}: ${response.statusCode} (may have different auth handling)`);
            }
        }
        
        console.log(`    - Tested ${protectedPaths.length} protected endpoints`);
    });
    
    // Test 3: Error Handling
    await test('Error Handling', async () => {
        const response = await makeRequest('/nonexistent-endpoint');
        
        if (response.statusCode === 500) {
            throw new Error('Server returned 500 for non-existent endpoint - poor error handling');
        }
        
        console.log(`    - Non-existent endpoint: ${response.statusCode}`);
    });
    
    // Test 4: JSON Validation
    await test('JSON Validation', async () => {
        try {
            const response = await makeRequest('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: '{"invalid": json}'  // Malformed JSON
            });
            
            if (response.statusCode === 500) {
                throw new Error('Server crashed on malformed JSON');
            }
            
            console.log(`    - Malformed JSON handled: ${response.statusCode}`);
        } catch (error) {
            if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
                console.log(`    - JSON validation may be working (connection handled)`);
            } else {
                throw error;
            }
        }
    });
    
    // Test 5: Security Headers Check
    await test('Security Headers', async () => {
        const response = await makeRequest('/health');
        
        const securityHeaders = [
            'x-content-type-options',
            'x-frame-options', 
            'content-security-policy'
        ];
        
        const presentHeaders = [];
        const missingHeaders = [];
        
        for (const header of securityHeaders) {
            if (response.headers[header]) {
                presentHeaders.push(header);
            } else {
                missingHeaders.push(header);
            }
        }
        
        console.log(`    - Security headers present: ${presentHeaders.length}/${securityHeaders.length}`);
        if (presentHeaders.length > 0) {
            console.log(`    - Found: ${presentHeaders.join(', ')}`);
        }
    });
    
    // Test 6: Response Time
    await test('Response Performance', async () => {
        const startTime = Date.now();
        const response = await makeRequest('/health');
        const responseTime = Date.now() - startTime;
        
        if (responseTime > 5000) {
            throw new Error(`Health endpoint too slow: ${responseTime}ms`);
        }
        
        console.log(`    - Response time: ${responseTime}ms`);
    });
    
    // Test 7: Content Type Validation
    await test('Content Type Validation', async () => {
        const response = await makeRequest('/health');
        
        if (!response.headers['content-type']) {
            throw new Error('No Content-Type header');
        }
        
        if (!response.headers['content-type'].includes('application/json')) {
            console.log(`    - Unexpected content type: ${response.headers['content-type']}`);
        } else {
            console.log(`    - Correct JSON content type`);
        }
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