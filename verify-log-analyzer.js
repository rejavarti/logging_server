/**
 * Database Schema Verification Script for Log Analyzer
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔍 Checking Log Analyzer Database Schema...\n');

// Check for database files
const dbFiles = ['enterprise_logs.db', 'logging.db'];
console.log('📁 Available database files:');
dbFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    console.log(`  ${exists ? '✅' : '❌'} ${file} ${exists ? `(${fs.statSync(path.join(__dirname, file)).size} bytes)` : ''}`);
});

const dbPath = path.join(__dirname, 'enterprise_logs.db');
console.log(`\n� Connecting to: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to database');
});

// Check if our new tables exist
const checkTables = () => {
    // First, let's see ALL tables
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, allTables) => {
        if (err) {
            console.error('❌ Error getting all tables:', err.message);
            return;
        }

        console.log('📋 All tables in database:');
        allTables.forEach(table => {
            console.log(`  📄 ${table.name}`);
        });

        // Now check our specific tables
        const requiredTables = [
            'uploaded_files',
            'file_analysis', 
            'log_sources',
            'log_patterns',
            'parsed_log_entries'
        ];

        db.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})
        `, requiredTables, (err, rows) => {
            if (err) {
                console.error('❌ Error checking tables:', err.message);
                return;
            }

            console.log('\n📋 Log Analyzer Tables Status:');
            requiredTables.forEach(table => {
                const exists = rows.find(row => row.name === table);
                console.log(`  ${exists ? '✅' : '❌'} ${table}`);
            });

            if (rows.length === requiredTables.length) {
                console.log('\n🎉 All required tables exist! Checking structure...\n');
                checkTableStructures();
            } else {
                console.log(`\n⚠️ Found ${rows.length}/${requiredTables.length} required tables.`);
                console.log('This might be expected if migration is still in progress...\n');
                checkTableStructures(); // Continue anyway to see what we have
            }
        });
    });
};

// Check table structures
const checkTableStructures = () => {
    const tableChecks = [
        {
            table: 'uploaded_files',
            requiredColumns: ['id', 'original_filename', 'stored_filename', 'file_path', 'file_size', 
                             'mime_type', 'upload_timestamp', 'parsing_status', 'format_detected']
        },
        {
            table: 'file_analysis', 
            requiredColumns: ['id', 'file_id', 'format_used', 'total_lines', 'parsed_lines', 
                             'error_lines', 'success_rate', 'analysis_data', 'analysis_timestamp']
        },
        {
            table: 'log_sources',
            requiredColumns: ['id', 'source_name', 'source_type', 'description', 'created_timestamp']
        },
        {
            table: 'log_patterns',
            requiredColumns: ['id', 'analysis_id', 'pattern_text', 'frequency', 'severity', 
                             'first_seen', 'last_seen', 'examples', 'pattern_hash']
        },
        {
            table: 'parsed_log_entries',
            requiredColumns: ['id', 'analysis_id', 'line_number', 'raw_line', 'timestamp', 
                             'level', 'message', 'source', 'ip_address', 'parsed_fields']
        }
    ];

    let completedChecks = 0;

    tableChecks.forEach(check => {
        db.all(`PRAGMA table_info(${check.table})`, (err, columns) => {
            if (err) {
                console.error(`❌ Error checking ${check.table}:`, err.message);
                return;
            }

            console.log(`📊 Table: ${check.table}`);
            const columnNames = columns.map(col => col.name);
            
            check.requiredColumns.forEach(reqCol => {
                const exists = columnNames.includes(reqCol);
                console.log(`  ${exists ? '✅' : '❌'} ${reqCol}`);
            });

            completedChecks++;
            if (completedChecks === tableChecks.length) {
                console.log('\n🔍 Checking indexes...');
                checkIndexes();
            }
        });
    });
};

// Check indexes
const checkIndexes = () => {
    db.all(`
        SELECT name, tbl_name, sql 
        FROM sqlite_master 
        WHERE type='index' AND name LIKE '%analyzer%'
    `, (err, indexes) => {
        if (err) {
            console.error('❌ Error checking indexes:', err.message);
            return;
        }

        console.log(`📈 Log Analyzer Indexes: ${indexes.length} found`);
        indexes.forEach(index => {
            console.log(`  ✅ ${index.name} on ${index.tbl_name}`);
        });

        console.log('\n🔍 Testing database operations...');
        testDatabaseOperations();
    });
};

// Test basic database operations
const testDatabaseOperations = () => {
    // Test insert into uploaded_files
    db.run(`
        INSERT INTO uploaded_files (
            original_filename, stored_filename, file_path, file_size, 
            mime_type, upload_timestamp, parsing_status
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'test')
    `, ['test.log', 'test_123.log', '/tmp/test.log', 1024, 'text/plain'], function(err) {
        if (err) {
            console.error('❌ Insert test failed:', err.message);
            return;
        }

        console.log('✅ Insert test passed (ID:', this.lastID, ')');
        
        // Test select
        db.get('SELECT * FROM uploaded_files WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
                console.error('❌ Select test failed:', err.message);
                return;
            }

            console.log('✅ Select test passed');
            
            // Cleanup test data
            db.run('DELETE FROM uploaded_files WHERE id = ?', [this.lastID], (err) => {
                if (err) {
                    console.error('❌ Cleanup failed:', err.message);
                } else {
                    console.log('✅ Cleanup completed');
                }
                
                console.log('\n🎉 Database verification completed successfully!');
                db.close();
            });
        });
    });
};

// Start verification
checkTables();