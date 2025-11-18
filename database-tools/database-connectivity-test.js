#!/usr/bin/env node
/**
 * DATABASE CONNECTIVITY TEST
 * Comprehensive test suite to verify all database operations work correctly
 * Tests all DAL methods to ensure modular architecture maintains full functionality
 */

const path = require('path');
const fs = require('fs');
const DatabaseAccessLayer = require('./database-access-layer');
const DatabaseMigration = require('./database-migration');

// Test configuration
const TEST_DB_PATH = path.join(__dirname, 'test-database.db');
const CLEANUP_AFTER_TEST = true;

class DatabaseConnectivityTest {
    constructor() {
        this.dal = null;
        this.testResults = [];
        this.logger = {
            info: (msg) => console.log(`[INFO] ${msg}`),
            error: (msg) => console.error(`[ERROR] ${msg}`),
            debug: (msg) => console.log(`[DEBUG] ${msg}`)
        };
    }

    async setup() {
        console.log('🚀 Setting up test environment...');
        
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        
        // Run database migration
        const migration = new DatabaseMigration(TEST_DB_PATH, this.logger);
        await migration.runMigration();
        
        // Initialize DAL
        this.dal = new DatabaseAccessLayer(TEST_DB_PATH, this.logger);
        await this.dal.initialize();
        
        console.log('✅ Test environment setup complete');
    }

    async cleanup() {
        if (this.dal) {
            await this.dal.close();
        }
        
        if (CLEANUP_AFTER_TEST && fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        
        console.log('🧹 Test cleanup complete');
    }

    recordTest(testName, passed, error = null) {
        this.testResults.push({
            name: testName,
            passed,
            error: error ? error.message : null
        });
        
        const status = passed ? '✅' : '❌';
        console.log(`${status} ${testName}${error ? ` - Error: ${error.message}` : ''}`);
    }

    async runTest(testName, testFunction) {
        try {
            await testFunction();
            this.recordTest(testName, true);
        } catch (error) {
            this.recordTest(testName, false, error);
        }
    }

    async testUserOperations() {
        console.log('\n📋 Testing User Operations...');
        
        let userId;
        
        await this.runTest('Create User', async () => {
            userId = await this.dal.createUser({
                username: 'testuser',
                password_hash: 'testhash',
                email: 'test@example.com',
                role: 'admin'
            });
            
            if (!userId) throw new Error('Failed to create user');
        });

        await this.runTest('Get User By ID', async () => {
            const user = await this.dal.getUserById(userId);
            if (!user || user.username !== 'testuser') {
                throw new Error('Failed to retrieve user by ID');
            }
        });

        await this.runTest('Update User', async () => {
            const updated = await this.dal.updateUser(userId, { email: 'updated@example.com' });
            if (!updated) throw new Error('Failed to update user');
        });

        await this.runTest('Get All Users', async () => {
            const users = await this.dal.getAllUsers();
            if (!users || users.length === 0) {
                throw new Error('Failed to get all users');
            }
        });
    }

    async testSessionOperations() {
        console.log('\n🔐 Testing Session Operations...');
        
        // Create a test user first
        const userId = await this.dal.createUser({
            username: 'sessionuser',
            password_hash: 'sessionhash',
            email: 'session@example.com'
        });

        let sessionToken;
        
        await this.runTest('Create User Session', async () => {
            const sessionId = await this.dal.createUserSession({
                user_id: userId,
                session_token: 'test-session-token-123',
                expires_at: new Date(Date.now() + 3600000).toISOString()
            });
            
            if (!sessionId) throw new Error('Failed to create user session');
            sessionToken = 'test-session-token-123';
        });

        await this.runTest('Get Active Session', async () => {
            const session = await this.dal.getActiveSession(sessionToken);
            if (!session || session.user_id !== userId) {
                throw new Error('Failed to retrieve active session');
            }
        });

        await this.runTest('Update Session Activity', async () => {
            const updated = await this.dal.updateSessionActivity(sessionToken);
            if (!updated) throw new Error('Failed to update session activity');
        });
    }

    async testLogOperations() {
        console.log('\n📝 Testing Log Operations...');
        
        let logId;
        
        await this.runTest('Create Log Entry', async () => {
            logId = await this.dal.createLogEntry({
                timestamp: new Date().toISOString(),
                level: 'info',
                source: 'test',
                message: 'Test log message'
            });
            
            if (!logId) throw new Error('Failed to create log entry');
        });

        await this.runTest('Get Log Count', async () => {
            const count = await this.dal.getLogCount();
            if (count === undefined || count < 1) {
                throw new Error('Failed to get log count');
            }
        });

        await this.runTest('Get Logs By Time Range', async () => {
            const startTime = new Date(Date.now() - 3600000).toISOString();
            const endTime = new Date(Date.now() + 3600000).toISOString();
            
            const logs = await this.dal.getLogsByTimeRange(startTime, endTime);
            if (!logs || logs.length === 0) {
                throw new Error('Failed to get logs by time range');
            }
        });
    }

    async testWebhookOperations() {
        console.log('\n🔗 Testing Webhook Operations...');
        
        let webhookId;
        
        await this.runTest('Create Webhook', async () => {
            webhookId = await this.dal.createWebhook({
                name: 'Test Webhook',
                url: 'https://example.com/webhook',
                method: 'POST',
                event_types: 'log.created,alert.triggered'
            });
            
            if (!webhookId) throw new Error('Failed to create webhook');
        });

        await this.runTest('Get All Webhooks', async () => {
            const webhooks = await this.dal.getAllWebhooks();
            if (!webhooks || webhooks.length === 0) {
                throw new Error('Failed to get all webhooks');
            }
        });

        await this.runTest('Update Webhook', async () => {
            const updated = await this.dal.updateWebhook(webhookId, { enabled: 0 });
            if (!updated) throw new Error('Failed to update webhook');
        });
    }

    async testIntegrationOperations() {
        console.log('\n🔌 Testing Integration Operations...');
        
        let integrationId;
        
        await this.runTest('Create Integration', async () => {
            integrationId = await this.dal.createIntegration({
                name: 'Test Integration',
                type: 'slack',
                configuration: { webhook_url: 'https://hooks.slack.com/test' }
            });
            
            if (!integrationId) throw new Error('Failed to create integration');
        });

        await this.runTest('Get All Integrations', async () => {
            const integrations = await this.dal.getAllIntegrations();
            if (!integrations || integrations.length === 0) {
                throw new Error('Failed to get all integrations');
            }
        });

        await this.runTest('Update Integration', async () => {
            const updated = await this.dal.updateIntegration(integrationId, { enabled: 0 });
            if (!updated) throw new Error('Failed to update integration');
        });
    }

    async testSavedSearchOperations() {
        console.log('\n🔍 Testing Saved Search Operations...');
        
        // Create a test user first
        const userId = await this.dal.createUser({
            username: 'searchuser',
            password_hash: 'searchhash',
            email: 'search@example.com'
        });

        let searchId;
        
        await this.runTest('Create Saved Search', async () => {
            searchId = await this.dal.createSavedSearch({
                name: 'Test Search',
                description: 'Test saved search',
                query: 'error OR warning',
                level: 'error',
                userId: userId
            });
            
            if (!searchId) throw new Error('Failed to create saved search');
        });

        await this.runTest('Get Saved Searches By User', async () => {
            const searches = await this.dal.getSavedSearchesByUser(userId);
            if (!searches || searches.length === 0) {
                throw new Error('Failed to get saved searches by user');
            }
        });

        await this.runTest('Delete Saved Search', async () => {
            const deleted = await this.dal.deleteSavedSearch(searchId, userId);
            if (!deleted) throw new Error('Failed to delete saved search');
        });
    }

    async testApiKeyOperations() {
        console.log('\n🔑 Testing API Key Operations...');
        
        let keyId;
        
        await this.runTest('Create API Key', async () => {
            keyId = await this.dal.createApiKey({
                name: 'Test API Key',
                key_hash: 'test-hash-123',
                permissions: ['logs:read', 'webhooks:manage'],
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                user_id: 1
            });
            
            if (!keyId) throw new Error('Failed to create API key');
        });

        await this.runTest('Get All API Keys', async () => {
            const keys = await this.dal.getAllApiKeys();
            if (!keys || keys.length === 0) {
                throw new Error('Failed to get all API keys');
            }
        });

        await this.runTest('Revoke API Key', async () => {
            const revoked = await this.dal.revokeApiKey(keyId);
            if (!revoked) throw new Error('Failed to revoke API key');
        });
    }

    async testDashboardOperations() {
        console.log('\n📊 Testing Dashboard Operations...');
        
        // Create a test user first
        const userId = await this.dal.createUser({
            username: 'dashuser',
            password_hash: 'dashhash',
            email: 'dash@example.com'
        });

        let dashboardId;
        
        await this.runTest('Create Dashboard', async () => {
            dashboardId = await this.dal.createDashboard({
                name: 'Test Dashboard',
                description: 'Test dashboard',
                configuration: { theme: 'light' },
                widgets: [{ type: 'chart', config: {} }],
                user_id: userId
            });
            
            if (!dashboardId) throw new Error('Failed to create dashboard');
        });

        await this.runTest('Get All Dashboards', async () => {
            const dashboards = await this.dal.getAllDashboards(userId);
            if (!dashboards || dashboards.length === 0) {
                throw new Error('Failed to get all dashboards');
            }
        });

        await this.runTest('Update Dashboard', async () => {
            const updated = await this.dal.updateDashboard(dashboardId, { 
                description: 'Updated dashboard' 
            }, userId);
            if (!updated) throw new Error('Failed to update dashboard');
        });
    }

    async testSystemSettings() {
        console.log('\n⚙️ Testing System Settings...');
        
        await this.runTest('Set Setting', async () => {
            const set = await this.dal.setSetting('test.setting', 'test-value', 'Test setting');
            if (!set) throw new Error('Failed to set setting');
        });

        await this.runTest('Get Setting', async () => {
            const value = await this.dal.getSetting('test.setting');
            if (value !== 'test-value') {
                throw new Error('Failed to get setting value');
            }
        });

        await this.runTest('Get All Settings', async () => {
            const settings = await this.dal.getAllSettings();
            if (!settings || settings.length === 0) {
                throw new Error('Failed to get all settings');
            }
        });
    }

    async testDatabaseHealth() {
        console.log('\n🏥 Testing Database Health Operations...');
        
        await this.runTest('Get Database Stats', async () => {
            const stats = await this.dal.getDbStats();
            if (!stats || !stats.database_size_bytes) {
                throw new Error('Failed to get database stats');
            }
        });

        await this.runTest('Check Integrity', async () => {
            const isHealthy = await this.dal.checkIntegrity();
            if (!isHealthy) throw new Error('Database integrity check failed');
        });

        await this.runTest('Analyze Database', async () => {
            const duration = await this.dal.analyze();
            if (typeof duration !== 'number') {
                throw new Error('Failed to analyze database');
            }
        });
    }

    async runAllTests() {
        console.log('🧪 Starting comprehensive database connectivity test...\n');
        
        try {
            await this.setup();
            
            // Run all test suites
            await this.testUserOperations();
            await this.testSessionOperations();
            await this.testLogOperations();
            await this.testWebhookOperations();
            await this.testIntegrationOperations();
            await this.testSavedSearchOperations();
            await this.testApiKeyOperations();
            await this.testDashboardOperations();
            await this.testSystemSettings();
            await this.testDatabaseHealth();
            
        } finally {
            await this.cleanup();
        }
        
        // Print results summary
        this.printResults();
    }

    printResults() {
        console.log('\n📈 TEST RESULTS SUMMARY');
        console.log('=' .repeat(50));
        
        const passed = this.testResults.filter(r => r.passed).length;
        const failed = this.testResults.filter(r => !r.passed).length;
        const total = this.testResults.length;
        
        console.log(`Total Tests: ${total}`);
        console.log(`Passed: ${passed} ✅`);
        console.log(`Failed: ${failed} ❌`);
        console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults.filter(r => !r.passed).forEach(test => {
                console.log(`  - ${test.name}: ${test.error}`);
            });
        }
        
        console.log('\n' + '=' .repeat(50));
        
        if (failed === 0) {
            console.log('🎉 ALL TESTS PASSED! Database integration is fully functional.');
        } else {
            console.log('⚠️ Some tests failed. Please review the errors above.');
            process.exit(1);
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new DatabaseConnectivityTest();
    tester.runAllTests().catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = DatabaseConnectivityTest;