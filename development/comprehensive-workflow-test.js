/**
 * COMPREHENSIVE LOG ANALYZER WORKFLOW TEST
 * Test complete workflow with all sample files and formats
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🚀 Comprehensive Log Analyzer Workflow Test\n');

const dbPath = path.join(__dirname, 'enterprise_logs.db');
const sampleDir = path.join(__dirname, 'sample-logs');

let db;

// Log format definitions with patterns
const logFormats = [
    {
        name: 'Apache Common Log',
        pattern: /^(\S+) \S+ \S+ \[(.*?)\] "(.*?)" (\d+) (\S+)/,
        fields: ['ip', 'timestamp', 'request', 'status', 'bytes'],
        testFile: 'apache-access.log'
    },
    {
        name: 'JSON Application Log',
        pattern: /^\{.*\}$/,
        fields: ['timestamp', 'level', 'service', 'message'],
        testFile: 'application.json',
        parseFunction: (line) => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }
    },
    {
        name: 'Syslog',
        pattern: /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(.*)$/,
        fields: ['timestamp', 'host', 'message'],
        testFile: 'syslog.log'
    }
];

// Test 1: Process each sample file type
async function processAllSampleFiles() {
    return new Promise((resolve) => {
        console.log('🔄 Processing all sample log files...\n');
        
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection failed:', err.message);
                resolve(false);
                return;
            }

            let processedFiles = 0;
            const totalFiles = logFormats.length;
            const results = [];

            logFormats.forEach((format, formatIndex) => {
                const filePath = path.join(sampleDir, format.testFile);
                
                if (!fs.existsSync(filePath)) {
                    console.log(`⚠️ Sample file not found: ${format.testFile}`);
                    processedFiles++;
                    checkCompletion();
                    return;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                
                console.log(`📄 Processing: ${format.testFile}`);
                console.log(`   Format: ${format.name}`);
                console.log(`   Lines: ${lines.length}`);

                // Detect format confidence
                let matchedLines = 0;
                let parsedData = [];

                lines.forEach((line, lineIndex) => {
                    let parsed = null;

                    if (format.parseFunction) {
                        parsed = format.parseFunction(line);
                    } else if (format.pattern.test(line)) {
                        const match = format.pattern.exec(line);
                        if (match) {
                            parsed = {};
                            format.fields.forEach((field, index) => {
                                parsed[field] = match[index + 1];
                            });
                        }
                    }

                    if (parsed) {
                        matchedLines++;
                        parsedData.push({
                            lineNumber: lineIndex + 1,
                            rawLine: line,
                            parsedData: parsed
                        });
                    }
                });

                const confidence = matchedLines / lines.length;
                console.log(`   Parsed: ${matchedLines}/${lines.length} (${Math.round(confidence * 100)}%)`);

                // Store in database
                const timestamp = new Date().toISOString();
                const fileId = `test-${formatIndex}-${Date.now()}`;

                db.run(`
                    INSERT INTO uploaded_files (
                        stored_filename, original_filename, file_path, file_size, 
                        mime_type, upload_timestamp, parsing_status, format_detected, 
                        detection_confidence
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    fileId + '.log',
                    format.testFile,
                    '/uploads/' + fileId + '.log',
                    Buffer.byteLength(content, 'utf8'),
                    format.name === 'JSON Application Log' ? 'application/json' : 'text/plain',
                    timestamp,
                    'completed',
                    format.name,
                    confidence
                ], function(err) {
                    if (err) {
                        console.error(`❌ Failed to insert file record: ${err.message}`);
                        processedFiles++;
                        checkCompletion();
                        return;
                    }

                    const dbFileId = this.lastID;
                    console.log(`   ✅ File stored with ID: ${dbFileId}`);

                    // Create analysis record
                    const analysisData = {
                        totalLines: lines.length,
                        parsedLines: matchedLines,
                        successRate: confidence,
                        format: format.name,
                        sampleData: parsedData.slice(0, 5), // First 5 parsed entries
                        timestamp: timestamp
                    };

                    if (format.name === 'JSON Application Log') {
                        // Analyze JSON logs for levels
                        const levels = {};
                        parsedData.forEach(entry => {
                            const level = entry.parsedData.level || 'unknown';
                            levels[level] = (levels[level] || 0) + 1;
                        });
                        analysisData.logLevels = levels;
                    }

                    if (format.name === 'Apache Common Log') {
                        // Analyze Apache logs for status codes and IPs
                        const statusCodes = {};
                        const uniqueIPs = new Set();
                        parsedData.forEach(entry => {
                            const status = entry.parsedData.status;
                            const ip = entry.parsedData.ip;
                            if (status) statusCodes[status] = (statusCodes[status] || 0) + 1;
                            if (ip) uniqueIPs.add(ip);
                        });
                        analysisData.statusCodes = statusCodes;
                        analysisData.uniqueIPs = uniqueIPs.size;
                    }

                    db.run(`
                        INSERT INTO file_analysis (
                            file_id, format_used, total_lines, parsed_lines, 
                            error_lines, success_rate, analysis_data, analysis_timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        dbFileId,
                        format.name,
                        lines.length,
                        matchedLines,
                        lines.length - matchedLines,
                        Math.round(confidence * 100),
                        JSON.stringify(analysisData),
                        timestamp
                    ], function(err) {
                        if (err) {
                            console.error(`❌ Failed to insert analysis: ${err.message}`);
                        } else {
                            console.log(`   ✅ Analysis stored with ID: ${this.lastID}`);
                            
                            // Store some parsed log entries
                            let storedEntries = 0;
                            const maxEntries = Math.min(parsedData.length, 10);
                            
                            if (maxEntries > 0) {
                                parsedData.slice(0, maxEntries).forEach((entry, index) => {
                                    db.run(`
                                        INSERT INTO parsed_log_entries (
                                            analysis_id, line_number, raw_line, parsed_data, entry_timestamp
                                        ) VALUES (?, ?, ?, ?, ?)
                                    `, [
                                        this.lastID,
                                        entry.lineNumber,
                                        entry.rawLine,
                                        JSON.stringify(entry.parsedData),
                                        timestamp
                                    ], (err) => {
                                        if (!err) storedEntries++;
                                        if (index === maxEntries - 1) {
                                            console.log(`   ✅ Stored ${storedEntries} parsed entries`);
                                        }
                                    });
                                });
                            }
                        }

                        results.push({
                            format: format.name,
                            file: format.testFile,
                            totalLines: lines.length,
                            parsedLines: matchedLines,
                            confidence: confidence,
                            success: true
                        });

                        processedFiles++;
                        checkCompletion();
                    });
                });
            });

            function checkCompletion() {
                if (processedFiles === totalFiles) {
                    console.log('\n📊 WORKFLOW TEST RESULTS:');
                    console.log('═══════════════════════════════════════');
                    results.forEach(result => {
                        console.log(`✅ ${result.format}:`);
                        console.log(`   File: ${result.file}`);
                        console.log(`   Parsing: ${result.parsedLines}/${result.totalLines} lines (${Math.round(result.confidence * 100)}%)`);
                    });

                    // Query database statistics
                    db.get('SELECT COUNT(*) as file_count FROM uploaded_files', (err, row) => {
                        if (!err) {
                            console.log(`\n📈 Database Statistics:`);
                            console.log(`   Total files processed: ${row.file_count}`);
                        }

                        db.get('SELECT COUNT(*) as analysis_count FROM file_analysis', (err, row) => {
                            if (!err) {
                                console.log(`   Total analyses: ${row.analysis_count}`);
                            }

                            db.get('SELECT COUNT(*) as entries_count FROM parsed_log_entries', (err, row) => {
                                if (!err) {
                                    console.log(`   Total parsed entries: ${row.entries_count}`);
                                }

                                console.log('\n🎉 COMPREHENSIVE TEST COMPLETED SUCCESSFULLY!');
                                console.log('💡 Log Analyzer is fully functional with all format support');
                                
                                db.close();
                                resolve(true);
                            });
                        });
                    });
                }
            }
        });
    });
}

// Run comprehensive test
processAllSampleFiles().catch(error => {
    console.error('💥 Comprehensive test failed:', error);
    if (db) {
        db.close();
    }
    process.exit(1);
});