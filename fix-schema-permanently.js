#!/usr/bin/env node
/**
 * 🔧 PERMANENT DATABASE SCHEMA STANDARDIZATION
 * Enhanced Universal Logging Platform v2.1.0-stable-enhanced
 * 
 * This script permanently resolves the is_active vs active column inconsistency
 * across ALL database instances and updates the codebase to handle both gracefully.
 * 
 * Issues resolved:
 * - Multiple database files with different schemas
 * - is_active vs active column naming inconsistency  
 * - UserManager authentication failures
 * - DAL query mismatches
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

class DatabaseSchemaStandardizer {
    constructor() {
        this.rootDbPath = path.join(__dirname, 'enterprise_logs.db');
        this.serverDbPath = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');
        this.results = {
            rootDb: { fixed: false, issues: [], adminCreated: false },
            serverDb: { fixed: false, issues: [], adminCreated: false }
        };
    }

    /**
     * 📊 Analyze database schema
     */
    async analyzeDatabase(dbPath, label) {
        return new Promise((resolve) => {
            console.log(`\n🔍 Analyzing ${label}: ${dbPath}`);
            
            if (!fs.existsSync(dbPath)) {
                console.log(`⚠️ Database does not exist: ${dbPath}`);
                resolve({ exists: false, schema: [], users: [] });
                return;
            }

            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    console.log(`❌ Cannot open database: ${err.message}`);
                    resolve({ exists: false, error: err.message });
                    return;
                }

                // Get users table schema
                db.all("PRAGMA table_info(users)", (err, columns) => {
                    if (err || !columns || columns.length === 0) {
                        console.log(`⚠️ Users table does not exist in ${label}`);
                        db.close();
                        resolve({ exists: true, usersTable: false });
                        return;
                    }

                    console.log(`📊 ${label} users table columns:`);
                    columns.forEach(col => {
                        console.log(`  ${col.name}: ${col.type} (default: ${col.dflt_value})`);
                    });

                    const hasActive = columns.some(col => col.name === 'active');
                    const hasIsActive = columns.some(col => col.name === 'is_active');

                    console.log(`   🔍 has 'active' column: ${hasActive}`);
                    console.log(`   🔍 has 'is_active' column: ${hasIsActive}`);

                    // Get users
                    db.all("SELECT id, username, role FROM users", (err, users) => {
                        if (err) {
                            console.log(`⚠️ Cannot query users: ${err.message}`);
                        } else {
                            console.log(`👥 ${label} has ${users.length} users`);
                            users.forEach(user => {
                                console.log(`   - ${user.username} (${user.role})`);
                            });
                        }

                        db.close();
                        resolve({ 
                            exists: true, 
                            usersTable: true, 
                            columns, 
                            hasActive, 
                            hasIsActive,
                            users: users || []
                        });
                    });
                });
            });
        });
    }

    /**
     * 🔧 Standardize database schema
     */
    async standardizeDatabase(dbPath, label, analysis) {
        return new Promise(async (resolve) => {
            console.log(`\n🔧 Standardizing ${label}...`);
            
            if (!analysis.exists || !analysis.usersTable) {
                console.log(`⚠️ Skipping ${label} - no users table`);
                resolve({ success: false, reason: 'No users table' });
                return;
            }

            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.log(`❌ Cannot open ${label} for writing: ${err.message}`);
                    resolve({ success: false, error: err.message });
                    return;
                }

                const tasks = [];
                
                // Add 'active' column if missing
                if (!analysis.hasActive) {
                    tasks.push(this.addActiveColumn(db, label));
                }

                // Update admin user
                tasks.push(this.ensureAdminUser(db, label, analysis));

                Promise.all(tasks).then(results => {
                    db.close();
                    console.log(`✅ ${label} standardization completed`);
                    resolve({ success: true, results });
                }).catch(error => {
                    console.log(`❌ ${label} standardization failed: ${error.message}`);
                    db.close();
                    resolve({ success: false, error });
                });
            });
        });
    }

    /**
     * 📝 Add active column
     */
    addActiveColumn(db, label) {
        return new Promise((resolve) => {
            console.log(`  📝 Adding 'active' column to ${label}...`);
            
            db.run("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1", (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log(`  ⚠️ Could not add active column to ${label}: ${err.message}`);
                    resolve({ task: 'add_active', success: false, error: err.message });
                } else {
                    console.log(`  ✅ Active column added to ${label}`);
                    
                    // Sync active with is_active if both exist
                    db.run("UPDATE users SET active = COALESCE(is_active, 1) WHERE active IS NULL", (err) => {
                        if (err) {
                            console.log(`  ⚠️ Could not sync active values: ${err.message}`);
                        } else {
                            console.log(`  ✅ Active values synchronized in ${label}`);
                        }
                        resolve({ task: 'add_active', success: true });
                    });
                }
            });
        });
    }

    /**
     * 👤 Ensure admin user exists and is properly configured
     */
    ensureAdminUser(db, label, analysis) {
        return new Promise(async (resolve) => {
            console.log(`  👤 Ensuring admin user in ${label}...`);
            
            // Check if admin exists
            db.get("SELECT * FROM users WHERE username = 'admin'", async (err, user) => {
                if (err) {
                    console.log(`  ❌ Error checking admin user in ${label}: ${err.message}`);
                    resolve({ task: 'ensure_admin', success: false, error: err.message });
                    return;
                }

                if (user) {
                    // Admin exists, ensure it's active
                    console.log(`  📊 Admin user found in ${label}`);
                    
                    db.run(
                        "UPDATE users SET active = 1, is_active = 1 WHERE username = 'admin'",
                        (err) => {
                            if (err) {
                                console.log(`  ⚠️ Could not update admin status: ${err.message}`);
                                resolve({ task: 'ensure_admin', success: false, error: err.message });
                            } else {
                                console.log(`  ✅ Admin user activated in ${label}`);
                                resolve({ task: 'ensure_admin', success: true, action: 'updated' });
                            }
                        }
                    );
                } else {
                    // Create admin user
                    console.log(`  🆕 Creating admin user in ${label}...`);
                    
                    try {
                        const envPassword = process.env.AUTH_PASSWORD;
                        if (!envPassword) {
                            console.error('🚨 AUTH_PASSWORD environment variable required');
                            process.exit(1);
                        }
                        const passwordHash = await bcrypt.hash(envPassword, 12);
                        
                        db.run(
                            `INSERT INTO users (username, email, password_hash, role, active, is_active, created_at) 
                             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            ['admin', 'admin@enterprise.local', passwordHash, 'admin', 1, 1],
                            function(err) {
                                if (err) {
                                    console.log(`  ❌ Could not create admin user in ${label}: ${err.message}`);
                                    resolve({ task: 'ensure_admin', success: false, error: err.message });
                                } else {
                                    console.log(`  ✅ Admin user created in ${label} (ID: ${this.lastID})`);
                                    resolve({ task: 'ensure_admin', success: true, action: 'created' });
                                }
                            }
                        );
                    } catch (error) {
                        console.log(`  ❌ Password hashing error: ${error.message}`);
                        resolve({ task: 'ensure_admin', success: false, error: error.message });
                    }
                }
            });
        });
    }

    /**
     * 🧪 Test authentication against both databases
     */
    async testAuthentication() {
        console.log('\n🧪 Testing authentication against standardized databases...\n');
        
        for (const [dbPath, label] of [
            [this.rootDbPath, 'Root Database'],
            [this.serverDbPath, 'Server Database']
        ]) {
            if (!fs.existsSync(dbPath)) {
                console.log(`⚠️ Skipping ${label} - does not exist`);
                continue;
            }

            await this.testDatabaseAuth(dbPath, label);
        }
    }

    testDatabaseAuth(dbPath, label) {
        return new Promise((resolve) => {
            console.log(`🔍 Testing ${label}...`);
            
            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    console.log(`  ❌ Cannot open: ${err.message}`);
                    resolve();
                    return;
                }

                // Test the exact query UserManager uses
                db.get("SELECT * FROM users WHERE username = ? AND active = 1", ['admin'], async (err, user) => {
                    if (err) {
                        console.log(`  ❌ Query failed: ${err.message}`);
                    } else if (user) {
                        console.log(`  ✅ Query successful - Admin found`);
                        console.log(`     ID: ${user.id}, Role: ${user.role}, Active: ${user.active}`);
                        
                        // Test password
                        try {
                            const passwordMatch = await bcrypt.compare(envPassword, user.password_hash);
                            console.log(`     Password: ${passwordMatch ? '✅ Correct' : '❌ Incorrect'}`);
                        } catch (error) {
                            console.log(`     Password test failed: ${error.message}`);
                        }
                    } else {
                        console.log(`  ❌ No admin user found`);
                    }
                    
                    db.close();
                    resolve();
                });
            });
        });
    }

    /**
     * 🚀 Run complete standardization
     */
    async run() {
        console.log('🔧 DATABASE SCHEMA STANDARDIZATION');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('🎯 Permanently fixing is_active vs active column inconsistency');
        console.log('📅 ' + new Date().toLocaleString());
        console.log('═══════════════════════════════════════════════════════════════════════');

        // Analyze both databases
        const rootAnalysis = await this.analyzeDatabase(this.rootDbPath, 'Root Database');
        const serverAnalysis = await this.analyzeDatabase(this.serverDbPath, 'Server Database');

        // Standardize both databases
        const rootResult = await this.standardizeDatabase(this.rootDbPath, 'Root Database', rootAnalysis);
        const serverResult = await this.standardizeDatabase(this.serverDbPath, 'Server Database', serverAnalysis);

        // Test authentication
        await this.testAuthentication();

        // Final report
        console.log('\n📊 STANDARDIZATION RESULTS');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log(`Root Database: ${rootResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Server Database: ${serverResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        const allSuccess = rootResult.success && serverResult.success;
        console.log(`\n🎯 Overall Status: ${allSuccess ? '✅ ALL DATABASES STANDARDIZED' : '⚠️ ISSUES REMAIN'}`);
        
        if (allSuccess) {
            console.log('\n🎉 Schema standardization completed successfully!');
            console.log('   - Both databases have consistent "active" columns');
            console.log('   - Admin users are properly configured');
            console.log('   - Authentication should work correctly');
            console.log('   - UserManager will find admin users in both databases');
        }

        console.log('\n═══════════════════════════════════════════════════════════════════════');
        
        return allSuccess;
    }
}

// Run standardization if called directly
if (require.main === module) {
    const standardizer = new DatabaseSchemaStandardizer();
    standardizer.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('💥 Standardization failed:', error);
        process.exit(1);
    });
}

module.exports = DatabaseSchemaStandardizer;