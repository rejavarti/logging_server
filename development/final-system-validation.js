/**
 * 🎯 FINAL COMPREHENSIVE SYSTEM VALIDATION
 * Complete end-to-end system health check
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');

async function finalSystemValidation() {
    console.log('🎯 Running final comprehensive system validation...\n');
    
    const categories = {
        '🗄️ Database': { passed: 0, total: 0 },
        '📊 Charts & Analytics': { passed: 0, total: 0 },
        '🔗 API Endpoints': { passed: 0, total: 0 },
        '🐳 Docker Environment': { passed: 0, total: 0 },
        '🔒 Security Features': { passed: 0, total: 0 }
    };
    
    const test = async (category, testName, testFunction) => {
        categories[category].total++;
        try {
            console.log(`[${category}] Testing: ${testName}`);
            await testFunction();
            console.log(`[${category}] ✅ PASS: ${testName}`);
            categories[category].passed++;
        } catch (error) {
            console.error(`[${category}] ❌ FAIL: ${testName} - ${error.message}`);
        }
        console.log('');
    };
    
    const db = new UniversalSQLiteAdapter('/app/logs.db');
    
    // 🗄️ DATABASE TESTS
    await test('🗄️ Database', 'Database Connection & Adapter', async () => {
        const result = await db.get("SELECT 1 as test");
        if (result.test !== 1) throw new Error('Database connection failed');
    });
    
    await test('🗄️ Database', 'Core Tables Structure', async () => {
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        const requiredTables = ['logs', 'users', 'user_sessions', 'dashboards'];
        
        for (const table of requiredTables) {
            if (!tables.find(t => t.name === table)) {
                throw new Error(`Missing table: ${table}`);
            }
        }
    });
    
    await test('🗄️ Database', 'Database Integrity', async () => {
        const result = await db.get("PRAGMA integrity_check");
        if (result.integrity_check !== 'ok') {
            throw new Error(`Integrity issue: ${result.integrity_check}`);
        }
    });
    
    // 📊 CHARTS & ANALYTICS TESTS
    await test('📊 Charts & Analytics', 'Chart Data Queries', async () => {
        await db.all("SELECT level, COUNT(*) as count FROM logs GROUP BY level");
        await db.all("SELECT strftime('%H:00', timestamp) as hour, COUNT(*) FROM logs GROUP BY hour");
    });
    
    await test('📊 Charts & Analytics', 'System Stats Calculation', async () => {
        const stats = await db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors
            FROM logs
        `);
        if (typeof stats.total !== 'number') throw new Error('Invalid stats format');
    });
    
    // 🔗 API ENDPOINTS TESTS  
    const http = require('http');
    const makeRequest = (path) => {
        return new Promise((resolve, reject) => {
            const req = http.get({ hostname: 'localhost', port: 3000, path, timeout: 2000 }, resolve);
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
    };
    
    await test('🔗 API Endpoints', 'Health Endpoint', async () => {
        const res = await makeRequest('/health');
        if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    });
    
    await test('🔗 API Endpoints', 'Authentication System', async () => {
        const res = await makeRequest('/dashboard');
        // Should redirect for authentication (302) or serve content (200)
        if (![200, 302].includes(res.statusCode)) {
            throw new Error(`Unexpected status ${res.statusCode}`);
        }
    });
    
    await test('🔗 API Endpoints', 'Error Handling', async () => {
        const res = await makeRequest('/nonexistent');
        if (res.statusCode === 500) throw new Error('Poor error handling');
    });
    
    // 🐳 DOCKER ENVIRONMENT TESTS
    await test('🐳 Docker Environment', 'Node.js Runtime', async () => {
        if (!process.version.startsWith('v20')) {
            throw new Error(`Expected Node v20, got ${process.version}`);
        }
    });
    
    await test('🐳 Docker Environment', 'File System Access', async () => {
        const fs = require('fs');
        const dbStats = fs.statSync('/app/logs.db');
        if (dbStats.size === 0) throw new Error('Database file is empty');
    });
    
    // 🔒 SECURITY FEATURES TESTS
    await test('🔒 Security Features', 'Admin User Configuration', async () => {
        const admin = await db.get("SELECT * FROM users WHERE username = 'admin'");
        if (!admin || !admin.password_hash) throw new Error('Admin user not properly configured');
    });
    
    await test('🔒 Security Features', 'Security Headers', async () => {
        const res = await makeRequest('/health');
        let headerData = '';
        res.on('data', chunk => { headerData += chunk; });
        
        await new Promise(resolve => res.on('end', resolve));
        
        const hasCSP = res.headers['content-security-policy'];
        const hasFrameOptions = res.headers['x-frame-options'];
        
        if (!hasCSP || !hasFrameOptions) {
            throw new Error('Missing security headers');
        }
    });
    
    // FINAL SUMMARY
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎯 FINAL COMPREHENSIVE VALIDATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    
    let totalPassed = 0;
    let totalTests = 0;
    
    for (const [category, results] of Object.entries(categories)) {
        const percentage = Math.round((results.passed / results.total) * 100);
        console.log(`${category}: ${results.passed}/${results.total} (${percentage}%)`);
        totalPassed += results.passed;
        totalTests += results.total;
    }
    
    const overallPercentage = Math.round((totalPassed / totalTests) * 100);
    
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`📊 OVERALL SYSTEM HEALTH: ${totalPassed}/${totalTests} (${overallPercentage}%)`);
    
    if (overallPercentage >= 90) {
        console.log('🎉 EXCELLENT: System is fully operational and optimized!');
    } else if (overallPercentage >= 75) {
        console.log('✅ GOOD: System is stable with minor issues');
    } else if (overallPercentage >= 50) {
        console.log('⚠️  NEEDS ATTENTION: System has significant issues');
    } else {
        console.log('🚨 CRITICAL: System requires immediate attention');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    
    return overallPercentage >= 75;
}

// Run if called directly
if (require.main === module) {
    finalSystemValidation()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('💥 Final validation crashed:', error);
            process.exit(1);
        });
}

module.exports = { finalSystemValidation };