/**
 * COMPREHENSIVE DATABASE INTEGRITY CHECK
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');

async function testDatabaseIntegrity() {
    console.log('🔍 Running comprehensive database integrity check...\n');
    
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
    
    // Test 1: Database connection
    await test('Database Connection', async () => {
        const result = await db.get("SELECT 1 as test");
        if (result.test !== 1) throw new Error('Basic query failed');
    });
    
    // Test 2: Table existence
    await test('Core Tables Exist', async () => {
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        const requiredTables = ['logs', 'users', 'user_sessions', 'dashboards', 'dashboard_widgets'];
        
        for (const table of requiredTables) {
            if (!tables.find(t => t.name === table)) {
                throw new Error(`Missing required table: ${table}`);
            }
        }
    });
    
    // Test 3: Insert and read operations
    await test('Log Entry CRUD Operations', async () => {
        // Insert test log
        await db.run(`INSERT INTO logs (timestamp, level, service, message) VALUES (?, ?, ?, ?)`, 
            [new Date().toISOString(), 'info', 'test-service', 'Database integrity test message']);
        
        // Read test log
        const logs = await db.all("SELECT * FROM logs WHERE service = 'test-service' LIMIT 1");
        if (logs.length === 0) throw new Error('Failed to read inserted log');
        
        // Clean up test log
        await db.run("DELETE FROM logs WHERE service = 'test-service'");
    });
    
    // Test 4: User authentication data
    await test('Admin User Exists', async () => {
        const admin = await db.get("SELECT * FROM users WHERE username = 'admin'");
        if (!admin) throw new Error('Admin user not found');
        if (!admin.password_hash) throw new Error('Admin password not set');
    });
    
    // Test 5: Foreign key constraints
    await test('Foreign Key Constraints', async () => {
        const result = await db.get("PRAGMA foreign_key_check");
        if (result) throw new Error('Foreign key constraint violations found');
    });
    
    // Test 6: Database file integrity
    await test('Database File Integrity', async () => {
        const result = await db.get("PRAGMA integrity_check");
        if (result.integrity_check !== 'ok') {
            throw new Error(`Database integrity issue: ${result.integrity_check}`);
        }
    });
    
    // Test 7: Index effectiveness
    await test('Database Indexes', async () => {
        const indexes = await db.all("SELECT name FROM sqlite_master WHERE type='index'");
        if (indexes.length < 3) throw new Error('Expected database indexes missing');
    });
    
    // Summary
    console.log('═══════════════════════════════════════');
    console.log('🎯 DATABASE INTEGRITY TEST RESULTS');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    
    if (failed === 0) {
        console.log('🎉 All database integrity tests PASSED!');
        return true;
    } else {
        console.log('⚠️  Some database integrity tests FAILED!');
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    testDatabaseIntegrity()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('💥 Integrity check crashed:', error);
            process.exit(1);
        });
}

module.exports = { testDatabaseIntegrity };