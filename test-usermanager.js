#!/usr/bin/env node
/**
 * 🔍 TEST USERMANAGER AUTHENTICATION
 * Test the exact same flow that the server uses
 */

const path = require('path');
const bcrypt = require('bcrypt');

async function testUserManagerAuth() {
    try {
        console.log('🔍 Testing UserManager authentication...\n');
        
        // Import exactly as server does
        const DatabaseAccessLayer = require('./database-access-layer');
        const UserManager = require('./managers/UserManager');
        
        // Mock logger
        const mockLoggers = {
            system: {
                info: console.log,
                error: console.error,
                warn: console.warn,
                debug: console.log
            },
            security: {
                info: console.log,
                error: console.error,
                warn: console.warn,
                debug: console.log
            }
        };
        
        // Mock config - check what config the server uses
        const config = {
            auth: {
                jwtSecret: 'test-secret-key-for-verification',
                saltRounds: 12
            }
        };
        
        // Initialize DAL
        const dbPath = path.join(__dirname, 'enterprise_logs.db');
        const dal = new DatabaseAccessLayer(dbPath, mockLoggers.system);
        
        console.log('✅ DAL initialized');
        
        // Initialize UserManager exactly as server does
        const userManager = new UserManager(config, mockLoggers, dal);
        
        console.log('✅ UserManager initialized');
        
        // Wait a moment for async initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test authentication
        console.log('\n📋 Testing authentication with admin/ChangeMe123!...');
        
        const result = await userManager.authenticateUser('admin', 'ChangeMe123!');
        
        console.log('📊 Authentication result:');
        console.log('  Success:', result.success);
        if (result.success) {
            console.log('  User ID:', result.user.id);
            console.log('  Username:', result.user.username);
            console.log('  Role:', result.user.role);
        } else {
            console.log('  Error:', result.error);
        }
        
    } catch (error) {
        console.error('❌ UserManager Test Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testUserManagerAuth();