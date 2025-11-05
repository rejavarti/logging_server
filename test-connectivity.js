/**
 * Simple server connectivity test
 */

const http = require('http');

console.log('🔍 Testing server connectivity...');

// Test if server is running
const options = {
    hostname: 'localhost',
    port: 10180,
    path: '/health',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, (res) => {
    console.log(`✅ Server responded: ${res.statusCode}`);
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('📄 Response:', data);
        process.exit(0);
    });
});

req.on('error', (error) => {
    console.log('❌ Connection failed:', error.message);
    
    // Check if it's a connection refused error (server not running)
    if (error.code === 'ECONNREFUSED') {
        console.log('🚨 Server appears to be down or crashed');
        console.log('💡 Try running: node server.js');
    }
    
    process.exit(1);
});

req.on('timeout', () => {
    console.log('⏰ Request timed out');
    req.destroy();
    process.exit(1);
});

req.setTimeout(5000);
req.end();