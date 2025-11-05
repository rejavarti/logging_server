/**
 * Fix Alert Rules Table Schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Fixing alert_rules table schema...');

db.serialize(() => {
    // Drop the existing alert_rules table if it exists
    db.run('DROP TABLE IF EXISTS alert_rules', (err) => {
        if (err) {
            console.error('Error dropping alert_rules table:', err);
            return;
        }
        
        console.log('✅ Dropped existing alert_rules table');
        
        // Create the alert_rules table with correct schema
        db.run(`CREATE TABLE IF NOT EXISTS alert_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            type TEXT NOT NULL DEFAULT 'pattern',
            condition TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            cooldown INTEGER DEFAULT 300,
            enabled BOOLEAN DEFAULT 1,
            channels TEXT DEFAULT '[]',
            escalation_rules TEXT,
            trigger_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`, (err) => {
            if (err) {
                console.error('Error creating alert_rules table:', err);
                return;
            }
            
            console.log('✅ Created alert_rules table with correct schema');
            
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('🎉 Alert rules table fixed successfully!');
                }
            });
        });
    });
});