#!/usr/bin/env node
/**
 * WebSocket Connection Test Script
 * Tests WebSocket connectivity to the logging server
 * 
 * Usage: node test-websocket.js [server-url]
 * Example: node test-websocket.js ws://192.168.1.100:10180/ws
 */

const WebSocket = require('ws');

// Parse command line arguments
const serverUrl = process.argv[2] || 'ws://localhost:10180/ws';

console.log('🧪 WebSocket Connection Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📡 Connecting to: ${serverUrl}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create WebSocket connection
const ws = new WebSocket(serverUrl);

// Connection timeout
const connectionTimeout = setTimeout(() => {
    console.error('❌ Connection timeout (10 seconds)');
    console.error('   Check if server is running and URL is correct\n');
    process.exit(1);
}, 10000);

// Track test results
let testResults = {
    connected: false,
    receivedWelcome: false,
    pingPongWorks: false,
    subscriptionWorks: false
};

// Connection opened
ws.on('open', () => {
    clearTimeout(connectionTimeout);
    console.log('✅ WebSocket connected successfully!\n');
    testResults.connected = true;
    
    // Wait for welcome message before running tests
    setTimeout(() => runTests(), 1000);
});

// Message handler
ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received message:', JSON.stringify(message, null, 2), '\n');
        
        // Track specific events
        switch(message.event) {
            case 'connected':
                testResults.receivedWelcome = true;
                console.log(`   Client ID: ${message.clientId}`);
                break;
            case 'pong':
                testResults.pingPongWorks = true;
                console.log('   ✅ Ping/Pong works!');
                break;
            case 'subscribed':
                testResults.subscriptionWorks = true;
                console.log(`   ✅ Subscribed to: ${message.channels.join(', ')}`);
                break;
            case 'error':
                console.log(`   ⚠️  Error: ${message.error}`);
                break;
        }
    } catch (error) {
        console.error('❌ Failed to parse message:', error.message);
        console.error('   Raw data:', data.toString());
    }
});

// Error handler
ws.on('error', (error) => {
    clearTimeout(connectionTimeout);
    console.error('❌ WebSocket error:', error.message);
    console.error('\nPossible causes:');
    console.error('   • Server is not running');
    console.error('   • Wrong URL or port');
    console.error('   • Firewall blocking connection');
    console.error('   • Network connectivity issues\n');
    process.exit(1);
});

// Connection closed
ws.on('close', (code, reason) => {
    clearTimeout(connectionTimeout);
    console.log('\n🔌 WebSocket disconnected');
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason || 'No reason provided'}\n`);
    
    // Print test summary
    printTestSummary();
    process.exit(0);
});

/**
 * Run connection tests
 */
function runTests() {
    console.log('🧪 Running connection tests...\n');
    
    // Test 1: Ping/Pong
    console.log('Test 1: Ping/Pong heartbeat');
    ws.send(JSON.stringify({
        event: 'ping'
    }));
    
    // Test 2: Subscribe to channels
    setTimeout(() => {
        console.log('\nTest 2: Channel subscription');
        ws.send(JSON.stringify({
            event: 'subscribe',
            payload: { channels: ['logs', 'alerts', 'metrics'] }
        }));
    }, 2000);
    
    // Test 3: Unsubscribe
    setTimeout(() => {
        console.log('\nTest 3: Channel unsubscription');
        ws.send(JSON.stringify({
            event: 'unsubscribe',
            payload: { channels: ['metrics'] }
        }));
    }, 4000);
    
    // Test 4: Invalid event (should get error)
    setTimeout(() => {
        console.log('\nTest 4: Invalid event handling');
        ws.send(JSON.stringify({
            event: 'invalid_event',
            payload: {}
        }));
    }, 6000);
    
    // Close connection after tests
    setTimeout(() => {
        console.log('\n✅ All tests completed!');
        ws.close(1000, 'Tests completed');
    }, 8000);
}

/**
 * Print test summary
 */
function printTestSummary() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Test Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Connection:        ${testResults.connected ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Welcome Message:   ${testResults.receivedWelcome ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Ping/Pong:         ${testResults.pingPongWorks ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Subscription:      ${testResults.subscriptionWorks ? '✅ PASS' : '❌ FAIL'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const passCount = Object.values(testResults).filter(v => v).length;
    const totalTests = Object.keys(testResults).length;
    
    if (passCount === totalTests) {
        console.log('🎉 All tests passed! WebSocket is working correctly.\n');
    } else {
        console.log(`⚠️  ${passCount}/${totalTests} tests passed. Some issues detected.\n`);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Interrupted by user');
    ws.close(1000, 'Interrupted');
    process.exit(0);
});
