#!/usr/bin/env node
/**
 * 🔍 CHECK DATABASE USERS
 * Verify if admin user exists and check password
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    
    console.log('🔍 Checking database users...\n');
    
    // Check if users table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
        if (err) {
            console.error('Error checking users table:', err);
            return;
        }
        
        if (!row) {
            console.log('❌ Users table does not exist!');
            db.close();
            return;
        }
        
        console.log('✅ Users table exists');
        
        // Get all users
        db.all("SELECT * FROM users", (err, users) => {
            if (err) {
                console.error('Error querying users:', err);
                db.close();
                return;
            }
            
            console.log(`📊 Found ${users.length} users:`);
            
            users.forEach(user => {
                console.log(`\n👤 User: ${user.username}`);
                console.log(`   ID: ${user.id}`);
                console.log(`   Active: ${user.active}`);
                console.log(`   Role: ${user.role}`);
                console.log(`   Created: ${user.created_at}`);
                console.log(`   Password Hash: ${user.password_hash ? 'Present' : 'Missing'}`);
                
                // Test password if this is admin
                if (user.username === 'admin' && user.password_hash) {
                    const testPassword = process.env.AUTH_PASSWORD;
                    if (!testPassword) {
                        console.log('   Password Test: ⚠️  AUTH_PASSWORD not set - cannot verify');
                        db.close();
                        return;
                    }
                    bcrypt.compare(testPassword, user.password_hash, (err, result) => {
                        if (err) {
                            console.log(`   Password Test: Error - ${err.message}`);
                        } else {
                            console.log(`   Password Test: ${result ? '✅ CORRECT' : '❌ INCORRECT'}`);
                        }
                        
                        db.close();
                    });
                } else if (users.indexOf(user) === users.length - 1) {
                    db.close();
                }
            });
            
            if (users.length === 0) {
                console.log('\n❌ No users found in database!');
                console.log('💡 Need to run repair-core-database.js again');
                db.close();
            }
        });
    });
});