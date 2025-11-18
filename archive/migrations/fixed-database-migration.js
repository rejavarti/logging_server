/**
 * FIXED DATABASE MIGRATION - Uses Universal SQLite Adapter for consistency
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');

async function runMigration() {
    console.log('🔄 Starting database migration with Universal SQLite Adapter...');
    
    const db = new UniversalSQLiteAdapter('/app/logs.db');
    
    try {
        // Create core system tables
        console.log('Creating core system tables...');
        
        await db.run(`CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            service TEXT,
            message TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('✅ Created logs table');
        
        await db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('✅ Created users table');
        
        await db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        console.log('✅ Created user_sessions table');
        
        await db.run(`CREATE TABLE IF NOT EXISTS dashboards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            config TEXT,
            user_id INTEGER,
            is_public INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        console.log('✅ Created dashboards table');
        
        await db.run(`CREATE TABLE IF NOT EXISTS dashboard_widgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dashboard_id INTEGER,
            widget_type TEXT NOT NULL,
            title TEXT NOT NULL,
            config TEXT,
            position_x INTEGER DEFAULT 0,
            position_y INTEGER DEFAULT 0,
            width INTEGER DEFAULT 1,
            height INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
        )`);
        console.log('✅ Created dashboard_widgets table');
        
        // Create indexes for performance
        await db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service)`);
        console.log('✅ Created database indexes');
        
        // Insert default admin user
        const existingUser = await db.get(`SELECT id FROM users WHERE username = 'admin'`);
        if (!existingUser) {
            const bcrypt = require('bcrypt');
            const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || (() => {
                throw new Error('INITIAL_ADMIN_PASSWORD environment variable must be set for security');
            })();
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            await db.run(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`, 
                ['admin', 'admin@localhost', hashedPassword, 'admin']);
            console.log('✅ Created default admin user');
        } else {
            console.log('ℹ️  Admin user already exists');
        }
        
        // Verify migration
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log(`✅ Migration completed successfully! Created ${tables.length} tables:`);
        tables.forEach(table => console.log(`  - ${table.name}`));
        
        return true;
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('🎉 Database migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { runMigration };