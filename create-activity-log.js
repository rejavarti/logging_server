#!/usr/bin/env node
/**
 * 🔧 CREATE MISSING ACTIVITY LOG TABLE
 * Complete the database schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🔧 Creating missing activity_log table...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    
    const createActivityLogTable = `
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id INTEGER,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `;
    
    db.run(createActivityLogTable, (err) => {
        if (err) {
            console.error('❌ Error creating activity_log table:', err);
        } else {
            console.log('✅ Activity log table created successfully');
            
            // Also create indexes for performance
            const createIndexes = [
                "CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action)"
            ];
            
            let indexCount = 0;
            createIndexes.forEach((indexSQL, i) => {
                db.run(indexSQL, (err) => {
                    if (err) {
                        console.error(`❌ Error creating index ${i + 1}:`, err);
                    } else {
                        console.log(`✅ Index ${i + 1} created`);
                    }
                    
                    indexCount++;
                    if (indexCount === createIndexes.length) {
                        console.log('\n🎉 Database schema completed!');
                        db.close();
                    }
                });
            });
        }
    });
});
