// Apply Database Migration using existing DAL
// Execute: node scripts/apply-migration.js

const DatabaseAccessLayer = require('../database-access-layer');
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '..', 'migrations', 'add-missing-tables.sql');

console.log('🔧 Applying database migration...');

(async () => {
    const dal = new DatabaseAccessLayer('./enterprise_logs.db', null);

    try {
        const migration = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements
    const statements = migration
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`\nExecuting ${statements.length} SQL statements...`);
    
    let executed = 0;
    for (const statement of statements) {
        if (statement.trim().length > 10) {  // Skip very short statements
            try {
                await dal.run(statement);
                executed++;
            } catch (err) {
                if (err.message && err.message.includes('already exists')) {
                    // Table already exists, that's okay
                    console.log(`   ⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`);
                } else {
                    console.log(`   ❌ Failed: ${err.message}`);
                }
            }
        }
    }
    
    console.log(`✅ Successfully executed ${executed} statements`);
    
    // Verify tables
    const tables = await dal.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN (
            'themes', 'settings', 'saved_searches', 
            'webhook_deliveries', 'request_metrics', 'backups'
        )
        ORDER BY name
    `);
    
    console.log(`\n✅ Verified ${tables.length}/6 tables:`);
    tables.forEach(t => console.log(`   ✓ ${t.name}`));
    
    // Show counts
    try {
        const themeCount = await dal.get('SELECT COUNT(*) as count FROM themes');
        console.log(`\n🎨 Themes: ${themeCount.count}`);
    } catch(e) {}
    
    try {
        const settingsCount = await dal.get('SELECT COUNT(*) as count FROM settings');
        console.log(`⚙️  Settings: ${settingsCount.count}`);
    } catch(e) {}
    
    console.log('\n✅ Migration complete!');
    
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
})();