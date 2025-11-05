/**
 * Manual Database Migration Test
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'test_enterprise_logs.db');

console.log('🔧 Testing Log Analyzer Table Creation...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to test database');
});

// Helper function to run SQL
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

// Helper function to check if table exists
function tableExists(tableName) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
}

// Test log analyzer table creation
async function testTableCreation() {
    try {
        console.log('🔄 Testing uploaded_files table creation...');
        
        // Test uploaded_files table
        const uploadedFilesExists = await tableExists('uploaded_files');
        console.log(`uploaded_files exists: ${uploadedFilesExists}`);
        
        if (!uploadedFilesExists) {
            await run(`
                CREATE TABLE uploaded_files (
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
                    error_message TEXT,
                    FOREIGN KEY (analysis_id) REFERENCES file_analysis(id) ON DELETE SET NULL
                )
            `);
            console.log('✅ Created uploaded_files table');
        }

        console.log('🔄 Testing file_analysis table creation...');
        
        // Test file_analysis table
        const fileAnalysisExists = await tableExists('file_analysis');
        console.log(`file_analysis exists: ${fileAnalysisExists}`);
        
        if (!fileAnalysisExists) {
            await run(`
                CREATE TABLE file_analysis (
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
        }

        console.log('🔄 Testing log_sources table creation...');
        
        // Test log_sources table
        const logSourcesExists = await tableExists('log_sources');
        console.log(`log_sources exists: ${logSourcesExists}`);
        
        if (!logSourcesExists) {
            await run(`
                CREATE TABLE log_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    description TEXT,
                    created_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Created log_sources table');
        }

        console.log('🔄 Testing log_patterns table creation...');
        
        // Test log_patterns table
        const logPatternsExists = await tableExists('log_patterns');
        console.log(`log_patterns exists: ${logPatternsExists}`);
        
        if (!logPatternsExists) {
            await run(`
                CREATE TABLE log_patterns (
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
        }

        console.log('🔄 Testing parsed_log_entries table creation...');
        
        // Test parsed_log_entries table
        const parsedLogEntriesExists = await tableExists('parsed_log_entries');
        console.log(`parsed_log_entries exists: ${parsedLogEntriesExists}`);
        
        if (!parsedLogEntriesExists) {
            await run(`
                CREATE TABLE parsed_log_entries (
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
        }

        // Test insertion
        console.log('🔄 Testing data insertion...');
        
        const result = await run(`
            INSERT INTO uploaded_files (
                original_filename, stored_filename, file_path, file_size, 
                mime_type, upload_timestamp, parsing_status
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'test')
        `, ['test.log', 'test_123.log', '/tmp/test.log', 1024, 'text/plain']);
        
        console.log(`✅ Insert successful (ID: ${result.lastID})`);

        // Test selection
        db.get('SELECT * FROM uploaded_files WHERE id = ?', [result.lastID], (err, row) => {
            if (err) {
                console.error('❌ Select failed:', err.message);
            } else {
                console.log('✅ Select successful:', row);
            }
            
            // Cleanup
            db.run('DELETE FROM uploaded_files WHERE id = ?', [result.lastID], (err) => {
                if (err) {
                    console.error('❌ Cleanup failed:', err.message);
                } else {
                    console.log('✅ Cleanup successful');
                }
                
                console.log('\n🎉 All table creation tests passed!');
                db.close();
            });
        });

    } catch (error) {
        console.error('❌ Table creation test failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run tests
testTableCreation();