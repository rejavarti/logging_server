/**
 * Live Integration Test for Dashboard
 */

const http = require('http');

console.log('🌐 LIVE INTEGRATION TEST\n');
console.log('=' .repeat(60));

// Test actual HTTP endpoint
console.log('\n🔄 Testing /dashboard endpoint...');

const options = {
    hostname: 'localhost',
    port: 10180,
    path: '/dashboard',
    method: 'GET',
    headers: {
        'Accept': 'text/html',
        'User-Agent': 'Integration-Test/1.0'
    }
};

const req = http.request(options, (res) => {
    console.log(`\n📊 Response Status: ${res.statusCode} ${res.statusMessage}`);
    console.log('📝 Response Headers:');
    Object.keys(res.headers).forEach(key => {
        console.log(`  - ${key}: ${res.headers[key]}`);
    });

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`\n📏 Content Length: ${data.length} bytes`);
        
        console.log('\n🔍 Content Validation:');
        
        const tests = [
            { name: 'Muuri Library', pattern: /muuri.*\.js/i },
            { name: 'ECharts Library', pattern: /echarts.*\.js/i },
            { name: 'Dashboard Grid Container', pattern: /dashboard-grid/i },
            { name: 'Widget Items', pattern: /widget-item/i },
            { name: 'Widget Controls', pattern: /dashboard-controls/i },
            { name: 'System Stats Widget', pattern: /data-widget-id="system-stats"/i },
            { name: 'Log Levels Widget', pattern: /data-widget-id="log-levels"/i },
            { name: 'System Metrics Widget', pattern: /data-widget-id="system-metrics"/i },
            { name: 'Timeline Widget', pattern: /data-widget-id="timeline"/i },
            { name: 'Integration Widget', pattern: /data-widget-id="integrations"/i },
            { name: 'Chart Initialization', pattern: /echarts\.init/i },
            { name: 'Muuri Initialization', pattern: /new Muuri/i },
            { name: 'Toggle Lock Function', pattern: /function toggleLock/i },
            { name: 'Save Layout Function', pattern: /function saveLayout/i },
            { name: 'Remove Widget Function', pattern: /function removeWidget/i }
        ];

        let passed = 0;
        let failed = 0;

        tests.forEach(test => {
            const result = test.pattern.test(data);
            const icon = result ? '✅' : '❌';
            console.log(`  ${icon} ${test.name}: ${result}`);
            result ? passed++ : failed++;
        });

        console.log('\n' + '='.repeat(60));
        console.log(`\n📈 Test Results:`);
        console.log(`  ✅ Passed: ${passed}/${tests.length}`);
        console.log(`  ❌ Failed: ${failed}/${tests.length}`);
        console.log(`  📊 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

        if (failed === 0) {
            console.log('\n🎉 ALL INTEGRATION TESTS PASSED!\n');
        } else {
            console.log('\n⚠️  Some tests failed. Check browser cache or restart container.\n');
        }

        // Save response for inspection
        const fs = require('fs');
        fs.writeFileSync('./dashboard-response.html', data);
        console.log('💾 Full response saved to: dashboard-response.html\n');
    });
});

req.on('error', (e) => {
    console.error(`\n❌ Request failed: ${e.message}`);
    console.error('   Make sure the server is running on port 10180\n');
});

req.end();
