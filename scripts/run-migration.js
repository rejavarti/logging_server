// Run Database Migration - Add Missing Tables
// Execute: node scripts/run-migration.js

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'enterprise_logs.db');
const migrationPath = path.join(__dirname, '..', 'migrations', 'add-missing-tables.sql');

console.log('🔧 Running database migration...');
console.log(`Database: ${dbPath}`);
console.log(`Migration: ${migrationPath}`);

try {
    const db = new Database(dbPath);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migration
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`\nExecuting ${statements.length} SQL statements...`);
    
    db.exec('BEGIN TRANSACTION');
    
    try {
        for (const statement of statements) {
            if (statement.trim()) {
                db.exec(statement);
            }
        }
        db.exec('COMMIT');
        console.log('✅ Migration completed successfully!');
        
        // Verify tables
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN (
                'themes', 'settings', 'saved_searches', 
                'webhook_deliveries', 'request_metrics', 'backups'
            )
        `).all();
        
        console.log(`\n✅ Verified ${tables.length} new tables:`);
        tables.forEach(t => console.log(`   - ${t.name}`));
        
        // Show theme count
        const themeCount = db.prepare('SELECT COUNT(*) as count FROM themes').get();
        console.log(`\n🎨 Built-in themes: ${themeCount.count}`);
        
        // Show settings count
        const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
        console.log(`⚙️  Default settings: ${settingsCount.count}`);
        
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    } finally {
        db.close();
    }
    
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
