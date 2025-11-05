const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'enterprise_logs.db');
console.log('🔍 Checking alert_rules table schema...');

const db = new sqlite3.Database(dbPath);

// Check current schema
db.all("PRAGMA table_info(alert_rules)", (err, rows) => {
    if (err) {
        console.error('❌ Error checking table info:', err);
        return;
    }
    
    console.log('📋 Current alert_rules columns:');
    rows.forEach(col => {
        console.log(`   - ${col.name}: ${col.type} ${col.dflt_value ? `(default: ${col.dflt_value})` : ''}`);
    });
    
    // Check if type column exists
    const hasTypeColumn = rows.some(col => col.name === 'type');
    
    if (!hasTypeColumn) {
        console.log('⚠️  MISSING TYPE COLUMN - Fixing schema...');
        
        // Drop existing table and recreate with correct schema
        db.serialize(() => {
            db.run("DROP TABLE IF EXISTS alert_rules");
            db.run(`CREATE TABLE alert_rules (
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
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )`, (err) => {
                if (err) {
                    console.error('❌ Error creating table:', err);
                } else {
                    console.log('✅ alert_rules table recreated with correct schema!');
                }
                db.close();
            });
        });
    } else {
        console.log('✅ alert_rules table schema is correct');
        db.close();
    }
});