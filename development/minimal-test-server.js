/**
 * Minimal test server to verify basic Node.js HTTP functionality
 */

const http = require('http');

console.log('🧪 Starting minimal test server...');

const server = http.createServer((req, res) => {
    console.log(`📡 Request: ${req.method} ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Test server is working' }));
});

server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
});

server.listen(10181, () => {
    console.log('✅ Test server running on http://localhost:10181');
    console.log('🔗 Test URL: http://localhost:10181/test');
});