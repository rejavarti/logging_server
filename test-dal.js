#!/usr/bin/env node
/**
 * 🔍 TEST DAL USER LOOKUP
 * Test if the DAL can properly retrieve users
 */

const path = require('path');

async function testDAL() {
    try {
        // Import the DAL
        const DatabaseAccessLayer = require('./database-access-layer');
        const dbPath = path.join(__dirname, 'enterprise_logs.db');
        
        console.log('🔍 Testing DAL user lookup...\n');
        
        // Initialize DAL with console logger
        const mockLogger = {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.log
        };
        const dal = new DatabaseAccessLayer(dbPath, mockLogger);
        
        // Test getUserByUsername
        console.log('📋 Testing getUserByUsername("admin")...');
        const user = await dal.getUserByUsername('admin');
        
        if (user) {
            console.log('✅ User found:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Username: ${user.username}`);
            console.log(`   Active: ${user.active}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   Password Hash: ${user.password_hash ? 'Present' : 'Missing'}`);
        } else {
            console.log('❌ User not found');
        }
        
    } catch (error) {
        console.error('❌ DAL Test Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testDAL();