#!/usr/bin/env node
/**
 * 🔍 DEBUG AUTHENTICATION RESPONSE
 * Check what the server actually returns
 */

const http = require('http');

function testAuth() {
    const loginData = JSON.stringify({
        username: 'admin',
        password: 'ChangeMe123!'
    });
    
    const options = {
        hostname: 'localhost',
        port: 10180,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(loginData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Status Message: ${res.statusMessage}`);
        console.log(`Headers:`, res.headers);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Raw Response:', data);
            
            try {
                const parsed = JSON.parse(data);
                console.log('Parsed Response:', JSON.stringify(parsed, null, 2));
            } catch (error) {
                console.log('Response is not JSON:', error.message);
            }
        });
    });

    req.on('error', (error) => {
        console.error('Request error:', error);
    });

    req.write(loginData);
    req.end();
}

console.log('🔍 Testing authentication response...');
testAuth();