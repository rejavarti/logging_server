#!/usr/bin/env node
/**
 * 🔍 CHECK USERS TABLE SCHEMA
 * Verify the users table has all required columns
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🔍 Checking users table schema...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    
    // Get table schema
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('Error getting table info:', err);
            db.close();
            return;
        }
        
        console.log('📊 Users table columns:');
        columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} (null: ${col.notnull === 0}, default: ${col.dflt_value})`);
        });
        
        const requiredColumns = ['id', 'username', 'password_hash', 'email', 'role', 'active', 'created_at'];
        const existingColumns = columns.map(c => c.name);
        const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
        
        if (missingColumns.length > 0) {
            console.log(`\n❌ Missing columns: ${missingColumns.join(', ')}`);
        } else {
            console.log('\n✅ All required columns present');
        }
        
        // Test the exact query that's failing
        console.log('\n📋 Testing the failing query...');
        db.get("SELECT * FROM users WHERE username = ? AND active = 1", ['admin'], (err, user) => {
            if (err) {
                console.log('❌ Query failed:', err.message);
            } else if (user) {
                console.log('✅ Query successful, user found');
                console.log(`   ID: ${user.id}`);
                console.log(`   Username: ${user.username}`);
                console.log(`   Active: ${user.active}`);
            } else {
                console.log('⚠️ Query successful, but no user found');
            }
            
            db.close();
        });
    });
});