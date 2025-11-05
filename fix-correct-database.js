#!/usr/bin/env node
/**
 * 🔍 CHECK CORRECT DATABASE SCHEMA
 * Check the schema of the database the server actually uses
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const correctDbPath = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');

console.log('🔍 Checking correct database schema...');
console.log('Database path:', correctDbPath);
console.log('');

const db = new sqlite3.Database(correctDbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    
    // Get users table schema
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('Error getting table info:', err);
            db.close();
            return;
        }
        
        console.log('📊 Users table columns in server database:');
        columns.forEach(col => {
            console.log(`  ${col.name}: ${col.type} (null: ${col.notnull === 0}, default: ${col.dflt_value})`);
        });
        
        const hasActiveColumn = columns.some(col => col.name === 'active');
        
        if (!hasActiveColumn) {
            console.log('\n❌ ACTIVE COLUMN IS MISSING!');
            console.log('🔧 Adding active column to users table...');
            
            db.run("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1", (err) => {
                if (err) {
                    console.log('⚠️ Could not add active column (might already exist):', err.message);
                } else {
                    console.log('✅ Active column added successfully');
                }
                
                // Now update admin user to be active
                db.run("UPDATE users SET active = 1 WHERE username = 'admin'", (err) => {
                    if (err) {
                        console.error('❌ Error updating admin user:', err);
                    } else {
                        console.log('✅ Admin user set to active');
                    }
                    
                    // Verify the fix
                    db.get("SELECT * FROM users WHERE username = ? AND active = 1", ['admin'], (err, user) => {
                        if (err) {
                            console.error('❌ Verification failed:', err);
                        } else if (user) {
                            console.log('\n🎉 ADMIN USER IS NOW PROPERLY CONFIGURED');
                            console.log(`   ID: ${user.id}`);
                            console.log(`   Username: ${user.username}`);
                            console.log(`   Active: ${user.active}`);
                            console.log(`   Role: ${user.role}`);
                        } else {
                            console.log('\n❌ Admin user still not found');
                        }
                        
                        db.close();
                    });
                });
            });
        } else {
            console.log('\n✅ Active column exists');
            
            // Check admin user
            db.get("SELECT * FROM users WHERE username = 'admin'", (err, user) => {
                if (user) {
                    console.log(`\n👤 Admin user: active=${user.active}, role=${user.role}`);
                } else {
                    console.log('\n❌ Admin user not found');
                }
                db.close();
            });
        }
    });
});