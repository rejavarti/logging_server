/**
 * Check database schema and fix column name issues
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🔍 Checking current database schema...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }

    // Check uploaded_files table schema
    db.all("PRAGMA table_info(uploaded_files)", (err, columns) => {
        if (err) {
            console.error('❌ Error checking uploaded_files schema:', err.message);
            db.close();
            return;
        }

        console.log('📋 uploaded_files table columns:');
        columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
        });

        // Check file_analysis table schema
        db.all("PRAGMA table_info(file_analysis)", (err, columns2) => {
            if (err) {
                console.error('❌ Error checking file_analysis schema:', err.message);
                db.close();
                return;
            }

            console.log('\n📋 file_analysis table columns:');
            columns2.forEach(col => {
                console.log(`  - ${col.name} (${col.type})`);
            });

            // Check what the expected API columns should be
            console.log('\n🎯 Expected API column mapping:');
            console.log('  uploaded_files should have:');
            console.log('    - stored_filename (current: filename?)');
            console.log('    - original_name (current: original_name)');
            console.log('    - file_size (current: file_size)');
            console.log('    - mime_type (current: mime_type)'); 
            console.log('    - upload_timestamp (current: upload_timestamp)');

            db.close();
        });
    });
});