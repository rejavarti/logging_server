/**
 * Database Migration Script
 * Fixes schema issues for zero-error startup
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Starting database migration...');

db.serialize(() => {
    // Check if system_settings table exists and what columns it has
    db.all("PRAGMA table_info(system_settings)", (err, columns) => {
        if (err) {
            console.error('Error checking system_settings table:', err);
            return;
        }
        
        console.log('📋 Current system_settings columns:', columns.map(c => c.name));
        
        const hasSettingKey = columns.some(col => col.name === 'setting_key');
        const hasSettingValue = columns.some(col => col.name === 'setting_value');
        const hasKey = columns.some(col => col.name === 'key');
        const hasValue = columns.some(col => col.name === 'value');
        
        if (hasKey && hasValue && !hasSettingKey && !hasSettingValue) {
            console.log('🔄 Migrating system_settings table columns...');
            
            // Create new table with correct schema
            db.run(`CREATE TABLE IF NOT EXISTS system_settings_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating new system_settings table:', err);
                    return;
                }
                
                // Copy data from old table to new table
                db.run(`INSERT INTO system_settings_new (setting_key, setting_value, description, created_at, updated_at)
                        SELECT key, value, description, created_at, updated_at FROM system_settings`, (err) => {
                    if (err) {
                        console.error('Error copying system_settings data:', err);
                        return;
                    }
                    
                    // Drop old table and rename new table
                    db.run('DROP TABLE system_settings', (err) => {
                        if (err) {
                            console.error('Error dropping old system_settings table:', err);
                            return;
                        }
                        
                        db.run('ALTER TABLE system_settings_new RENAME TO system_settings', (err) => {
                            if (err) {
                                console.error('Error renaming system_settings table:', err);
                                return;
                            }
                            
                            console.log('✅ system_settings table migrated successfully');
                            checkUserSessions();
                        });
                    });
                });
            });
        } else {
            console.log('✅ system_settings table schema is correct');
            checkUserSessions();
        }
    });
    
    function checkUserSessions() {
        // Check if user_sessions table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'", (err, row) => {
            if (err) {
                console.error('Error checking user_sessions table:', err);
                return;
            }
            
            if (!row) {
                console.log('🔄 Creating user_sessions table...');
                db.run(`CREATE TABLE user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token TEXT UNIQUE NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )`, (err) => {
                    if (err) {
                        console.error('Error creating user_sessions table:', err);
                        return;
                    }
                    
                    console.log('✅ user_sessions table created successfully');
                    completeMigration();
                });
            } else {
                console.log('✅ user_sessions table already exists');
                completeMigration();
            }
        });
    }
    
    function completeMigration() {
        console.log('🎉 Database migration completed successfully!');
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('📫 Database connection closed');
            }
        });
    }
});