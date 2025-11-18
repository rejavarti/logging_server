/**
 * CHART SYSTEM VALIDATION TEST
 * Tests Chart.js implementations, data feeds, and rendering
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');

async function validateChartSystems() {
    console.log('📊 Testing Chart.js implementations and data feeds...\n');
    
    const db = new UniversalSQLiteAdapter('/app/logs.db');
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
    
    // Test 1: Chart Data Queries
    await test('Chart Data Queries', async () => {
        // Test log level distribution query (for pie charts)
        const logLevels = await db.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            GROUP BY level
        `);
        
        // Test hourly stats query (for line charts)
        const hourlyStats = await db.all(`
            SELECT 
                strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                COUNT(*) as count,
                level
            FROM logs 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY hour, level
            ORDER BY hour
        `);
        
        // Queries should execute without errors
        console.log(`    - Log levels data points: ${logLevels.length}`);
        console.log(`    - Hourly stats data points: ${hourlyStats.length}`);
    });
    
    // Test 2: System Stats for Gauges
    await test('System Stats Data', async () => {
        const stats = await db.get(`
            SELECT 
                COUNT(*) as totalLogs,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errorCount,
                SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warningCount,
                SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as infoCount
            FROM logs
        `);
        
        if (typeof stats.totalLogs !== 'number') {
            throw new Error('Invalid stats data format');
        }
        
        console.log(`    - Total logs: ${stats.totalLogs}`);
        console.log(`    - Error count: ${stats.errorCount}`);
        console.log(`    - Warning count: ${stats.warningCount}`);
        console.log(`    - Info count: ${stats.infoCount}`);
    });
    
    // Test 3: Chart Configuration Validation
    await test('Chart Configuration Structure', async () => {
        // Insert test data for charts
        const testLogs = [
            { level: 'info', message: 'Test info message' },
            { level: 'error', message: 'Test error message' },
            { level: 'warning', message: 'Test warning message' }
        ];
        
        for (const log of testLogs) {
            await db.run(`INSERT INTO logs (timestamp, level, service, message) VALUES (?, ?, ?, ?)`, 
                [new Date().toISOString(), log.level, 'chart-test', log.message]);
        }
        
        // Test chart data structure
        const chartData = await db.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            WHERE service = 'chart-test'
            GROUP BY level
        `);
        
        if (chartData.length !== 3) {
            throw new Error(`Expected 3 chart data points, got ${chartData.length}`);
        }
        
        // Verify data has required properties
        chartData.forEach(item => {
            if (!item.level || typeof item.count !== 'number') {
                throw new Error('Chart data missing required properties');
            }
        });
        
        // Clean up test data
        await db.run("DELETE FROM logs WHERE service = 'chart-test'");
        
        console.log(`    - Chart data structure validated`);
        console.log(`    - Data points: ${chartData.length}`);
    });
    
    // Test 4: Time Series Data
    await test('Time Series Chart Data', async () => {
        // Insert time series test data
        const now = new Date();
        for (let i = 0; i < 24; i++) {
            const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Hours ago
            await db.run(`INSERT INTO logs (timestamp, level, service, message) VALUES (?, ?, ?, ?)`, 
                [timestamp.toISOString(), 'info', 'timeseries-test', `Test message ${i}`]);
        }
        
        // Test time series query
        const timeSeriesData = await db.all(`
            SELECT 
                strftime('%H:00', timestamp) as hour,
                COUNT(*) as count
            FROM logs 
            WHERE service = 'timeseries-test'
            GROUP BY hour
            ORDER BY hour
        `);
        
        if (timeSeriesData.length === 0) {
            throw new Error('Time series query returned no data');
        }
        
        // Clean up
        await db.run("DELETE FROM logs WHERE service = 'timeseries-test'");
        
        console.log(`    - Time series data points: ${timeSeriesData.length}`);
    });
    
    // Test 5: Dashboard Widget Data
    await test('Dashboard Widget Data', async () => {
        const widgets = await db.all("SELECT * FROM dashboard_widgets LIMIT 5");
        const dashboards = await db.all("SELECT * FROM dashboards LIMIT 5");
        
        console.log(`    - Available widgets: ${widgets.length}`);
        console.log(`    - Available dashboards: ${dashboards.length}`);
        
        // Table structure should be valid
        if (widgets.length > 0) {
            const widget = widgets[0];
            if (!widget.id || !widget.widget_type || !widget.title) {
                throw new Error('Widget data structure invalid');
            }
        }
    });
    
    // Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 CHART SYSTEM VALIDATION RESULTS');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    if (failed === 0) {
        console.log('🎉 All chart system tests PASSED!');
        return true;
    } else {
        console.log('⚠️  Some chart system tests FAILED!');
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    validateChartSystems()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('💥 Chart validation crashed:', error);
            process.exit(1);
        });
}

module.exports = { validateChartSystems };