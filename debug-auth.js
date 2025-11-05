#!/usr/bin/env node
/**
 * 🔍 DEBUG AUTHENTICATION
 * Test authentication to see what the server expects
 */

const http = require('http');

function testLogin() {
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
        console.log(`Headers:`, res.headers);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Response:', data);
            
            // Also test with URL encoded
            testLoginUrlEncoded();
        });
    });

    req.on('error', (error) => {
        console.error('Request error:', error);
    });

    req.write(loginData);
    req.end();
}

function testLoginUrlEncoded() {
    console.log('\n--- Testing URL Encoded ---');
    
    const loginData = 'username=admin&password=ChangeMe123!';
    
    const options = {
        hostname: 'localhost',
        port: 10180,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(loginData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Response:', data);
        });
    });

    req.on('error', (error) => {
        console.error('Request error:', error);
    });

    req.write(loginData);
    req.end();
}

console.log('🔍 Testing authentication formats...');
testLogin();