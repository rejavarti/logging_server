#!/usr/bin/env node
/**
 * Alerts Table Migration Script
 * Creates alerts table with proper schema and indexes
 * 
 * Usage: node scripts/create-alerts-table.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine database path
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/databases/enterprise_logs.db');

console.log('🔔 Alerts Table Migration');
console.log('========================\n');
console.log('Database:', dbPath);

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    console.log('Creating data directory:', dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to open database:', err.message);
        process.exit(1);
    }
    console.log('✅ Database connected\n');
});

// Migration SQL
const createAlertsTable = `
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    condition TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'open',
    created TEXT NOT NULL,
    acknowledged INTEGER DEFAULT 0,
    resolved INTEGER DEFAULT 0,
    data TEXT,
    CONSTRAINT status_check CHECK (status IN ('open', 'acknowledged', 'resolved'))
)`;

const createIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved)`
];

// Execute migration
db.serialize(() => {
    console.log('Creating alerts table...');
    db.run(createAlertsTable, (err) => {
        if (err) {
            console.error('❌ Failed to create alerts table:', err.message);
            process.exit(1);
        }
        console.log('✅ Alerts table created\n');
        
        console.log('Creating indexes...');
        let indexCount = 0;
        
        createIndexes.forEach((indexSQL, i) => {
            db.run(indexSQL, (err) => {
                if (err) {
                    console.error(`❌ Failed to create index ${i + 1}:`, err.message);
                } else {
                    indexCount++;
                    console.log(`✅ Index ${i + 1}/${createIndexes.length} created`);
                }
                
                // When all indexes are done, verify and close
                if (i === createIndexes.length - 1) {
                    console.log(`\n✅ ${indexCount}/${createIndexes.length} indexes created\n`);
                    
                    // Verify table structure
                    db.all('PRAGMA table_info(alerts)', [], (err, columns) => {
                        if (err) {
                            console.error('❌ Failed to verify table:', err.message);
                        } else {
                            console.log('Table structure verified:');
                            console.log('Columns:', columns.map(c => c.name).join(', '));
                            console.log('\nColumn details:');
                            columns.forEach(col => {
                                console.log(`  • ${col.name.padEnd(15)} ${col.type.padEnd(10)} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
                            });
                        }
                        
                        // Check for existing alerts
                        db.get('SELECT COUNT(*) as count FROM alerts', [], (err, row) => {
                            if (!err && row) {
                                console.log(`\n📊 Existing alerts: ${row.count}`);
                            }
                            
                            console.log('\n✅ Migration completed successfully!');
                            console.log('The alerts API endpoints are now ready to use.\n');
                            
                            db.close((err) => {
                                if (err) {
                                    console.error('Error closing database:', err.message);
                                }
                                process.exit(0);
                            });
                        });
                    });
                }
            });
        });
    });
});
