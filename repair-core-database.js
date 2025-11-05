/**
 * CRITICAL DATABASE REPAIR - Create missing core tables
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🚨 CRITICAL DATABASE REPAIR - Creating missing core tables...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }

    console.log('✅ Connected to database');

    // Check what tables exist
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error('❌ Error listing tables:', err.message);
            db.close();
            return;
        }

        console.log('\n📋 Existing tables:');
        const tableNames = tables.map(t => t.name);
        tableNames.forEach(name => console.log(`  ✓ ${name}`));

        const requiredTables = ['users', 'sessions', 'system_settings'];
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));

        if (missingTables.length === 0) {
            console.log('\n✅ All core tables exist');
            db.close();
            return;
        }

        console.log(`\n🔧 Missing core tables: ${missingTables.join(', ')}`);
        console.log('Creating missing core tables...\n');

        const createQueries = {
            users: `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    last_login TEXT,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TEXT
                )
            `,
            sessions: `
                CREATE TABLE IF NOT EXISTS sessions (
                    sid TEXT PRIMARY KEY,
                    sess TEXT NOT NULL,
                    expire INTEGER NOT NULL
                )
            `,
            system_settings: `
                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    description TEXT,
                    category TEXT DEFAULT 'general',
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `
        };

        let tablesCreated = 0;
        const totalTables = Object.keys(createQueries).length;

        Object.entries(createQueries).forEach(([tableName, query]) => {
            db.run(query, (err) => {
                if (err) {
                    console.log(`❌ Failed to create ${tableName}: ${err.message}`);
                } else {
                    console.log(`✅ Created table: ${tableName}`);
                }

                tablesCreated++;
                if (tablesCreated === totalTables) {
                    // Create default admin user
                    createDefaultUser();
                }
            });
        });

        function createDefaultUser() {
            console.log('\n🔧 Creating default admin user...');

            // Check if admin user exists
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) {
                    console.log(`⚠️ Error checking admin user: ${err.message}`);
                    finalVerification();
                    return;
                }

                if (row) {
                    console.log('✅ Admin user already exists');
                    finalVerification();
                    return;
                }

                // Create admin user with hashed password
                const password = process.env.AUTH_PASSWORD;
                if (!password) {
                    console.error('🚨 AUTH_PASSWORD environment variable required for admin user creation');
                    process.exit(1);
                }
                bcrypt.hash(password, 12, (err, hash) => {
                    if (err) {
                        console.log(`❌ Error hashing password: ${err.message}`);
                        finalVerification();
                        return;
                    }

                    db.run(`
                        INSERT INTO users (username, email, password_hash, role, active, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        'admin',
                        'admin@logging-platform.local',
                        hash,
                        'admin',
                        1,
                        new Date().toISOString()
                    ], function(err) {
                        if (err) {
                            console.log(`❌ Failed to create admin user: ${err.message}`);
                        } else {
                            console.log(`✅ Created admin user (ID: ${this.lastID})`);
                            console.log(`   Username: admin`);
                            console.log(`   Password: ${password}`);
                        }
                        finalVerification();
                    });
                });
            });
        }

        function finalVerification() {
            console.log('\n📊 Final verification...');

            // List all tables again
            db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, finalTables) => {
                if (!err) {
                    console.log('✅ Final table list:');
                    finalTables.forEach(table => {
                        console.log(`  ✓ ${table.name}`);
                    });
                }

                // Check users table structure
                db.all("PRAGMA table_info(users)", (err, columns) => {
                    if (!err && columns.length > 0) {
                        console.log('\n✅ Users table structure:');
                        columns.forEach(col => {
                            console.log(`  ✓ ${col.name} (${col.type})`);
                        });
                    }

                    console.log('\n🎉 CRITICAL DATABASE REPAIR COMPLETED!');
                    console.log('💡 Server should now start without database errors');
                    db.close();
                });
            });
        }
    });
});