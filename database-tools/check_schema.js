// Quick script to check database schema
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking users table schema:');
db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    rows.forEach(row => {
        console.log(`  ${row.name}: ${row.type} ${row.dflt_value ? `(default: ${row.dflt_value})` : ''}`);
    });
    
    console.log('\n🔍 Checking dashboard_widgets table schema:');
    db.all("PRAGMA table_info(dashboard_widgets)", (err, rows) => {
        if (err) {
            console.error('Error:', err);
            db.close();
            return;
        }
        rows.forEach(row => {
            console.log(`  ${row.name}: ${row.type} ${row.dflt_value ? `(default: ${row.dflt_value})` : ''}`);
        });
        
        console.log('\n✅ Schema check complete');
        db.close();
    });
});