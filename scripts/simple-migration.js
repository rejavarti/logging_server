// Simple Migration Script
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = './enterprise_logs.db';
const migrationPath = './migrations/add-missing-tables.sql';

console.log('🔧 Running database migration...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to open database:', err.message);
        process.exit(1);
    }
});

const migration = fs.readFileSync(migrationPath, 'utf8');
const statements = migration
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.startsWith('--'));

console.log(`Executing ${statements.length} SQL statements...\n`);

let completed = 0;
let skipped = 0;

const executeNext = (index) => {
    if (index >= statements.length) {
        console.log(`\n✅ Migration complete!`);
        console.log(`   Executed: ${completed}`);
        console.log(`   Skipped: ${skipped}`);
        
        // Verify tables
        db.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN (
                'themes', 'settings', 'saved_searches', 
                'webhook_deliveries', 'request_metrics', 'backups'
            )
            ORDER BY name
        `, [], (err, rows) => {
            if (!err && rows) {
                console.log(`\n✅ Verified ${rows.length}/6 tables:`);
                rows.forEach(r => console.log(`   ✓ ${r.name}`));
            }
            
            // Show counts
            db.get('SELECT COUNT(*) as count FROM themes', [], (err, row) => {
                if (!err && row) console.log(`\n🎨 Themes: ${row.count}`);
                
                db.get('SELECT COUNT(*) as count FROM settings', [], (err, row) => {
                    if (!err && row) console.log(`⚙️  Settings: ${row.count}`);
                    db.close();
                });
            });
        });
        return;
    }
    
    const statement = statements[index];
    db.run(statement, [], (err) => {
        if (err) {
            if (err.message && err.message.includes('already exists')) {
                process.stdout.write('.');
                skipped++;
            } else {
                console.log(`\n   ❌ Error: ${err.message}`);
            }
        } else {
            process.stdout.write('✓');
            completed++;
        }
        executeNext(index + 1);
    });
};

executeNext(0);
