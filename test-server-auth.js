#!/usr/bin/env node
/**
 * 🔍 DIRECT SERVER AUTHENTICATION TEST
 * Test against the actual running server
 */

const http = require('http');
const querystring = require('querystring');

async function testServerAuth() {
    console.log('🔍 Testing direct server authentication...\n');
    
    // Test 1: JSON format (what we expect)
    console.log('📋 Test 1: JSON format');
    await testAuthFormat('application/json', JSON.stringify({
        username: 'admin',
        password: 'ChangeMe123!'
    }));
    
    console.log('\n📋 Test 2: URL-encoded format');
    await testAuthFormat('application/x-www-form-urlencoded', 
        querystring.stringify({
            username: 'admin',
            password: 'ChangeMe123!'
        })
    );
    
    console.log('\n📋 Test 3: Check server health');
    await testEndpoint('GET', '/api/system/health', null, 'application/json');
}

function testAuthFormat(contentType, data) {
    return testEndpoint('POST', '/api/auth/login', data, contentType);
}

function testEndpoint(method, path, data, contentType) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 10180,
            path: path,
            method: method,
            headers: {}
        };
        
        if (data) {
            options.headers['Content-Type'] = contentType;
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = http.request(options, (res) => {
            console.log(`  Status: ${res.statusCode}`);
            console.log(`  Headers:`, {
                'content-type': res.headers['content-type'],
                'set-cookie': res.headers['set-cookie'] ? 'Present' : 'None'
            });
            
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                console.log('  Response:', responseData.substring(0, 200) + (responseData.length > 200 ? '...' : ''));
                resolve({ statusCode: res.statusCode, data: responseData, headers: res.headers });
            });
        });

        req.on('error', (error) => {
            console.error('  Request error:', error.message);
            resolve({ error: error.message });
        });

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

testServerAuth();