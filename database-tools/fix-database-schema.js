/**
 * DATABASE SCHEMA FIX - Add missing columns to users table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🔧 Fixing database schema issues...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }

    console.log('✅ Connected to database');

    // Check current users table structure
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('❌ Error checking users table:', err.message);
            db.close();
            return;
        }

        console.log('📋 Current users table columns:');
        const columnNames = [];
        columns.forEach(col => {
            columnNames.push(col.name);
            console.log(`  - ${col.name} (${col.type})`);
        });

        // Check for missing columns
        const requiredColumns = ['active', 'created_at', 'last_login'];
        const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

        if (missingColumns.length === 0) {
            console.log('✅ All required columns exist');
            db.close();
            return;
        }

        console.log(`\n🔧 Missing columns detected: ${missingColumns.join(', ')}`);
        console.log('Adding missing columns...');

        let operationsCompleted = 0;
        const totalOperations = missingColumns.length;

        missingColumns.forEach(column => {
            let query = '';
            let defaultValue = '';

            switch (column) {
                case 'active':
                    query = 'ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1';
                    defaultValue = '1 (active by default)';
                    break;
                case 'created_at':
                    query = 'ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP';
                    defaultValue = 'CURRENT_TIMESTAMP';
                    break;
                case 'last_login':
                    query = 'ALTER TABLE users ADD COLUMN last_login TEXT';
                    defaultValue = 'NULL';
                    break;
            }

            db.run(query, (err) => {
                if (err) {
                    console.log(`❌ Failed to add ${column}: ${err.message}`);
                } else {
                    console.log(`✅ Added column ${column} with default: ${defaultValue}`);
                }

                operationsCompleted++;
                if (operationsCompleted === totalOperations) {
                    // Update existing users to be active
                    db.run('UPDATE users SET active = 1 WHERE active IS NULL', (err) => {
                        if (err) {
                            console.log(`⚠️ Warning updating users: ${err.message}`);
                        } else {
                            console.log('✅ Updated existing users to active status');
                        }

                        console.log('\n📊 Final users table verification:');
                        db.all("PRAGMA table_info(users)", (err, finalColumns) => {
                            if (!err) {
                                finalColumns.forEach(col => {
                                    console.log(`  ✓ ${col.name} (${col.type})`);
                                });
                            }

                            console.log('\n🎉 Database schema fix completed!');
                            db.close();
                        });
                    });
                }
            });
        });
    });
});