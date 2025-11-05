/**
 * MANUAL LOG ANALYZER TABLE CREATION
 * Create tables in the existing enterprise_logs.db while server is running
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enterprise_logs.db');

console.log('🔧 Manual Log Analyzer Table Creation...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to enterprise database');
});

// Helper function to run SQL with better error handling
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error(`❌ SQL Error: ${err.message}`);
                console.error(`SQL: ${sql.substring(0, 100)}...`);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

// Create all log analyzer tables
async function createLogAnalyzerTables() {
    try {
        console.log('🔄 Creating uploaded_files table...');
        await run(`
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT,
                upload_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                parsing_status TEXT DEFAULT 'pending',
                format_detected TEXT,
                detection_confidence REAL,
                parsing_started TEXT,
                parsing_completed TEXT,
                analysis_id INTEGER,
                error_message TEXT
            )
        `);
        console.log('✅ Created uploaded_files table');

        console.log('🔄 Creating file_analysis table...');
        await run(`
            CREATE TABLE IF NOT EXISTS file_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                format_used TEXT NOT NULL,
                total_lines INTEGER NOT NULL,
                parsed_lines INTEGER NOT NULL,
                error_lines INTEGER NOT NULL,
                success_rate INTEGER NOT NULL,
                analysis_data TEXT NOT NULL,
                analysis_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created file_analysis table');

        console.log('🔄 Creating log_sources table...');
        await run(`
            CREATE TABLE IF NOT EXISTS log_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                description TEXT,
                created_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created log_sources table');

        console.log('🔄 Creating log_patterns table...');
        await run(`
            CREATE TABLE IF NOT EXISTS log_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id INTEGER NOT NULL,
                pattern_text TEXT NOT NULL,
                frequency INTEGER DEFAULT 1,
                severity TEXT DEFAULT 'info',
                first_seen TEXT,
                last_seen TEXT,
                examples TEXT,
                pattern_hash TEXT,
                FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created log_patterns table');

        console.log('🔄 Creating parsed_log_entries table...');
        await run(`
            CREATE TABLE IF NOT EXISTS parsed_log_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id INTEGER NOT NULL,
                line_number INTEGER NOT NULL,
                raw_line TEXT,
                timestamp TEXT,
                level TEXT,
                message TEXT,
                source TEXT,
                ip_address TEXT,
                user_agent TEXT,
                status_code INTEGER,
                response_size INTEGER,
                processing_time REAL,
                parsed_fields TEXT,
                error_message TEXT,
                FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created parsed_log_entries table');

        console.log('🔄 Creating indexes...');
        await run('CREATE INDEX IF NOT EXISTS idx_uploaded_files_upload_timestamp ON uploaded_files(upload_timestamp)');
        await run('CREATE INDEX IF NOT EXISTS idx_uploaded_files_parsing_status ON uploaded_files(parsing_status)');
        await run('CREATE INDEX IF NOT EXISTS idx_uploaded_files_format_detected ON uploaded_files(format_detected)');
        await run('CREATE INDEX IF NOT EXISTS idx_file_analysis_file_id ON file_analysis(file_id)');
        await run('CREATE INDEX IF NOT EXISTS idx_file_analysis_format_used ON file_analysis(format_used)');
        await run('CREATE INDEX IF NOT EXISTS idx_file_analysis_timestamp ON file_analysis(analysis_timestamp)');
        await run('CREATE INDEX IF NOT EXISTS idx_log_sources_source_type ON log_sources(source_type)');
        await run('CREATE INDEX IF NOT EXISTS idx_log_patterns_analysis_id ON log_patterns(analysis_id)');
        await run('CREATE INDEX IF NOT EXISTS idx_log_patterns_severity ON log_patterns(severity)');
        await run('CREATE INDEX IF NOT EXISTS idx_log_patterns_frequency ON log_patterns(frequency)');
        await run('CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_analysis_id ON parsed_log_entries(analysis_id)');
        await run('CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_timestamp ON parsed_log_entries(timestamp)');
        await run('CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_level ON parsed_log_entries(level)');
        await run('CREATE INDEX IF NOT EXISTS idx_parsed_log_entries_ip_address ON parsed_log_entries(ip_address)');
        console.log('✅ Created indexes');

        console.log('🔄 Testing insertion...');
        const result = await run(`
            INSERT INTO uploaded_files (
                original_filename, stored_filename, file_path, file_size, 
                mime_type, parsing_status
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, ['test.log', 'test_123.log', '/tmp/test.log', 1024, 'text/plain', 'test']);

        console.log(`✅ Insert test passed (ID: ${result.lastID})`);

        // Cleanup test record
        await run('DELETE FROM uploaded_files WHERE id = ?', [result.lastID]);
        console.log('✅ Cleanup completed');

        console.log('\n🎉 Log Analyzer tables created successfully!');
        console.log('The database now supports:');
        console.log('  • File uploads and storage');
        console.log('  • Multi-format log parsing');
        console.log('  • Pattern detection and analysis');
        console.log('  • Full-text log search');
        console.log('  • Performance optimizations');

    } catch (error) {
        console.error('\n❌ Table creation failed:', error.message);
        process.exit(1);
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('\n✅ Database connection closed');
            }
        });
    }
}

// Run the table creation
createLogAnalyzerTables();