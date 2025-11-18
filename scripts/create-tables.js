// Direct Migration - Create Tables Manually
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/databases/enterprise_logs.db');

console.log('🔧 Creating database tables...\n');

const db = new sqlite3.Database(dbPath);

const createStatements = [
    `CREATE TABLE IF NOT EXISTS themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_builtin INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        data_type TEXT DEFAULT 'string',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        query_data TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_used TEXT,
        use_count INTEGER DEFAULT 0,
        is_shared INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
    
    `CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_code INTEGER,
        request_body TEXT,
        response_body TEXT,
        response_headers TEXT,
        error TEXT,
        attempt_number INTEGER DEFAULT 1,
        delivered_at TEXT DEFAULT CURRENT_TIMESTAMP,
        duration_ms INTEGER,
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    )`,
    
    `CREATE TABLE IF NOT EXISTS request_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        user_id INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        filepath TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        backup_type TEXT DEFAULT 'manual',
        include_logs INTEGER DEFAULT 1,
        compression TEXT DEFAULT 'gzip',
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'completed',
        error TEXT,
        tables_included TEXT,
        record_count INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`
];

const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(created_by)',
    'CREATE INDEX IF NOT EXISTS idx_saved_searches_shared ON saved_searches(is_shared)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_time ON webhook_deliveries(delivered_at)',
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_endpoint ON request_metrics(endpoint)',
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_timestamp ON request_metrics(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_user ON request_metrics(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(backup_type)'
];

db.serialize(() => {
    let created = 0;
    
    createStatements.forEach((sql, i) => {
        db.run(sql, (err) => {
            if (err) {
                console.log(`   ❌ Table ${i+1}: ${err.message}`);
            } else {
                console.log(`   ✓ Table ${i+1} created`);
                created++;
            }
        });
    });
    
    indexes.forEach((sql, i) => {
        db.run(sql);
    });
    
    // Insert built-in themes
    const themeInserts = [
        `INSERT OR IGNORE INTO themes (id, name, data, is_builtin) VALUES (1, 'Default Light', '{"colors":{"primary":"#3b82f6","secondary":"#f8fafc","accent":"#0ea5e9","background":"#ffffff","surface":"#f1f5f9","text":"#1e293b","textSecondary":"#64748b","textMuted":"#94a3b8","border":"#e2e8f0","success":"#10b981","warning":"#f59e0b","error":"#ef4444","info":"#3b82f6"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.1)","medium":"0 4px 6px rgba(0,0,0,0.1)","large":"0 10px 15px rgba(0,0,0,0.1)"}}', 1)`,
        `INSERT OR IGNORE INTO themes (id, name, data, is_builtin) VALUES (2, 'Dark Professional', '{"colors":{"primary":"#60a5fa","secondary":"#0f172a","accent":"#38bdf8","background":"#1e293b","surface":"#334155","text":"#f8fafc","textSecondary":"#cbd5e1","textMuted":"#94a3b8","border":"#475569","success":"#34d399","warning":"#fbbf24","error":"#f87171","info":"#60a5fa"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.3)","medium":"0 4px 6px rgba(0,0,0,0.3)","large":"0 10px 15px rgba(0,0,0,0.3)"}}', 1)`,
        `INSERT OR IGNORE INTO themes (id, name, data, is_builtin) VALUES (3, 'Ocean Blue', '{"colors":{"primary":"#0ea5e9","secondary":"#0c4a6e","accent":"#06b6d4","background":"#0c4a6e","surface":"#075985","text":"#e0f2fe","textSecondary":"#bae6fd","textMuted":"#7dd3fc","border":"#0369a1","success":"#22d3ee","warning":"#fcd34d","error":"#fb7185","info":"#38bdf8"},"fonts":{"primary":"Inter, system-ui, sans-serif","monospace":"JetBrains Mono, Consolas, monospace"},"spacing":{"unit":"0.25rem","small":"0.5rem","medium":"1rem","large":"1.5rem"},"borderRadius":{"small":"6px","medium":"8px","large":"12px"},"shadows":{"light":"0 1px 3px rgba(0,0,0,0.4)","medium":"0 4px 6px rgba(0,0,0,0.4)","large":"0 10px 15px rgba(0,0,0,0.4)"}}', 1)`
    ];
    
    themeInserts.forEach(sql => db.run(sql));
    
    // Insert default settings
    const settings = [
        ["system.name", "Enhanced Universal Logging Platform", "System display name", "general", "string"],
        ["system.timezone", "America/Edmonton", "Server timezone", "general", "string"],
        ["system.environment", "production", "Deployment environment", "general", "string"],
        ["logs.retention_days", "90", "Log retention period in days", "logs", "number"],
        ["backup.auto_enabled", "true", "Enable automatic backups", "backup", "boolean"],
        ["backup.auto_schedule", "0 2 * * *", "Backup cron schedule", "backup", "string"]
    ];
    
    settings.forEach(([key, value, desc, cat, type]) => {
        db.run(`INSERT OR IGNORE INTO settings (key, value, description, category, data_type) VALUES (?, ?, ?, ?, ?)`, 
            [key, value, desc, cat, type]);
    });
    
    // Verify
    setTimeout(() => {
        db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('themes', 'settings', 'saved_searches', 'webhook_deliveries', 'request_metrics', 'backups') ORDER BY name`, [], (err, rows) => {
            console.log(`\n✅ Created ${rows ? rows.length : 0}/6 tables:`);
            if (rows) rows.forEach(r => console.log(`   ✓ ${r.name}`));
            
            db.get('SELECT COUNT(*) as count FROM themes', [], (err, row) => {
                if (!err && row) console.log(`\n🎨 Built-in themes: ${row.count}`);
                
                db.get('SELECT COUNT(*) as count FROM settings', [], (err, row) => {
                    if (!err && row) console.log(`⚙️  Default settings: ${row.count}`);
                    console.log('\n✅ Migration complete!');
                    db.close();
                });
            });
        });
    }, 500);
});
