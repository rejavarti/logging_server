/**
 * 📁 LOG FILE ANALYZER - API ROUTES
 * Comprehensive file upload, parsing, and analysis endpoints
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const LogParserEngine = require('../log-parser-engine');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit
        files: 10 // Maximum 10 files at once
    },
    fileFilter: (req, file, cb) => {
        // Allow common log file extensions
        const allowedExts = ['.log', '.txt', '.json', '.csv', '.tsv', '.gz', '.out', '.err'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedExts.includes(ext) || ext === '') {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not supported. Allowed: ${allowedExts.join(', ')}`), false);
        }
    }
});

/**
 * 📤 Upload log files for analysis
 */
router.post('/upload', upload.array('logFiles', 10), async (req, res) => {
    const logger = req.app.locals.loggers?.system || console;
    const db = req.app.locals.db();
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
            });
        }

        logger.info(`📤 Processing ${req.files.length} uploaded log files`);

        const uploadResults = [];
        
        for (const file of req.files) {
            try {
                // Store file metadata in database
                const fileRecord = await db.run(`
                    INSERT INTO uploaded_files (
                        original_filename, stored_filename, file_path, 
                        file_size, mime_type, upload_timestamp, 
                        parsing_status, format_detected
                    ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'pending', NULL)
                `, [
                    file.originalname,
                    file.filename,
                    file.path,
                    file.size,
                    file.mimetype
                ]);

                const fileId = fileRecord.lastID;

                // Initialize parser engine
                const parser = new LogParserEngine(logger);
                
                // Detect format
                logger.info(`🔍 Detecting format for: ${file.originalname}`);
                const detection = await parser.detectFormat(file.path);
                
                let formatId = null;
                let confidence = 0;
                
                if (detection.detectedFormat) {
                    formatId = detection.detectedFormat.id;
                    confidence = detection.detectedFormat.score;
                    
                    // Update file record with detected format
                    await db.run(`
                        UPDATE uploaded_files 
                        SET format_detected = ?, detection_confidence = ?
                        WHERE id = ?
                    `, [formatId, confidence, fileId]);
                }

                uploadResults.push({
                    fileId: fileId,
                    filename: file.originalname,
                    size: file.size,
                    detectedFormat: detection.detectedFormat,
                    samples: detection.samples,
                    allScores: detection.allScores,
                    status: 'uploaded',
                    message: formatId ? `Format detected: ${detection.detectedFormat.name}` : 'Format detection failed'
                });

                logger.info(`✅ File ${file.originalname} uploaded successfully (ID: ${fileId})`);

            } catch (error) {
                logger.error(`❌ Error processing file ${file.originalname}: ${error.message}`);
                uploadResults.push({
                    filename: file.originalname,
                    status: 'error',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `${req.files.length} files processed`,
            results: uploadResults,
            totalFiles: uploadResults.length,
            successfulUploads: uploadResults.filter(r => r.status === 'uploaded').length
        });

    } catch (error) {
        logger.error(`❌ Upload error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * ⚙️ Parse uploaded log file
 */
router.post('/parse/:fileId', async (req, res) => {
    const logger = req.app.locals.loggers?.system || console;
    const db = req.app.locals.db();
    
    try {
        const fileId = parseInt(req.params.fileId);
        const { formatId, customFormat } = req.body;

        // Get file information
        const fileRecord = await db.get(`
            SELECT * FROM uploaded_files WHERE id = ?
        `, [fileId]);

        if (!fileRecord) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if file exists
        if (!fs.existsSync(fileRecord.file_path)) {
            return res.status(404).json({
                success: false,
                error: 'File no longer exists on disk'
            });
        }

        // Update parsing status
        await db.run(`
            UPDATE uploaded_files 
            SET parsing_status = 'processing', parsing_started = datetime('now')
            WHERE id = ?
        `, [fileId]);

        logger.info(`🔄 Starting to parse file: ${fileRecord.original_filename} (Format: ${formatId || 'auto-detect'})`);

        // Initialize parser
        const parser = new LogParserEngine(logger);

        // Progress tracking via SSE would go here in a full implementation
        const progressCallback = (progress) => {
            logger.debug(`Parse progress: ${progress.processed} lines processed`);
        };

        // Parse the file
        const parseResult = await parser.parseFile(
            fileRecord.file_path, 
            formatId || fileRecord.format_detected,
            progressCallback
        );

        // Generate comprehensive analysis
        const analysis = parser.generateAnalysisSummary(parseResult);

        // Store results in database
        const analysisRecord = await db.run(`
            INSERT INTO file_analysis (
                file_id, format_used, total_lines, parsed_lines, 
                error_lines, success_rate, analysis_data, 
                analysis_timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            fileId,
            parseResult.formatId,
            parseResult.stats.totalLines,
            parseResult.stats.parsedLines,
            parseResult.stats.errorLines,
            Math.round((parseResult.stats.parsedLines / parseResult.stats.totalLines) * 100),
            JSON.stringify(analysis)
        ]);

        const analysisId = analysisRecord.lastID;

        // Store parsed entries (batch insert for performance)
        if (parseResult.entries.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < parseResult.entries.length; i += chunkSize) {
                const chunk = parseResult.entries.slice(i, i + chunkSize);
                const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                
                const values = [];
                chunk.forEach(entry => {
                    values.push(
                        analysisId,
                        entry.line_number,
                        entry.raw_line,
                        entry.timestamp,
                        entry.level,
                        entry.message,
                        entry.source,
                        entry.ip_address,
                        entry.user_agent,
                        entry.status_code,
                        entry.response_size,
                        entry.processing_time,
                        entry.parsed_fields,
                        entry.error
                    );
                });

                await db.run(`
                    INSERT INTO parsed_log_entries (
                        analysis_id, line_number, raw_line, timestamp, level, 
                        message, source, ip_address, user_agent, status_code, 
                        response_size, processing_time, parsed_fields, error_message
                    ) VALUES ${placeholders}
                `, values);
            }
        }

        // Store detected patterns
        if (parseResult.patterns && parseResult.patterns.length > 0) {
            for (const pattern of parseResult.patterns) {
                await db.run(`
                    INSERT INTO log_patterns (
                        analysis_id, pattern_text, frequency, severity, 
                        first_seen, last_seen, examples, pattern_hash
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    analysisId,
                    pattern.pattern,
                    pattern.frequency,
                    pattern.severity,
                    pattern.first_seen,
                    pattern.last_seen,
                    JSON.stringify(pattern.examples),
                    require('crypto').createHash('md5').update(pattern.pattern).digest('hex')
                ]);
            }
        }

        // Update file parsing status
        await db.run(`
            UPDATE uploaded_files 
            SET parsing_status = 'completed', parsing_completed = datetime('now'),
                analysis_id = ?
            WHERE id = ?
        `, [analysisId, fileId]);

        logger.info(`✅ Successfully parsed ${fileRecord.original_filename}: ${parseResult.stats.parsedLines}/${parseResult.stats.totalLines} lines`);

        res.json({
            success: true,
            message: 'File parsed successfully',
            fileId: fileId,
            analysisId: analysisId,
            stats: parseResult.stats,
            analysis: analysis,
            formatUsed: parseResult.formatName,
            processingTime: Date.now() // You'd calculate actual processing time
        });

    } catch (error) {
        logger.error(`❌ Parse error: ${error.message}`);
        
        // Update file status to error
        try {
            await db.run(`
                UPDATE uploaded_files 
                SET parsing_status = 'error', error_message = ?
                WHERE id = ?
            `, [error.message, req.params.fileId]);
        } catch (dbError) {
            logger.error(`Database update error: ${dbError.message}`);
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 📊 Get analysis results for a file
 */
router.get('/analysis/:analysisId', async (req, res) => {
    const db = req.app.locals.db();
    
    try {
        const analysisId = parseInt(req.params.analysisId);

        // Get analysis metadata
        const analysis = await db.get(`
            SELECT fa.*, uf.original_filename, uf.file_size, uf.upload_timestamp
            FROM file_analysis fa
            JOIN uploaded_files uf ON fa.file_id = uf.id
            WHERE fa.id = ?
        `, [analysisId]);

        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: 'Analysis not found'
            });
        }

        // Get patterns
        const patterns = await db.all(`
            SELECT * FROM log_patterns 
            WHERE analysis_id = ? 
            ORDER BY frequency DESC
            LIMIT 50
        `, [analysisId]);

        // Get sample entries
        const sampleEntries = await db.all(`
            SELECT * FROM parsed_log_entries 
            WHERE analysis_id = ? 
            ORDER BY line_number 
            LIMIT 100
        `, [analysisId]);

        res.json({
            success: true,
            analysis: {
                ...analysis,
                analysis_data: JSON.parse(analysis.analysis_data || '{}')
            },
            patterns: patterns.map(p => ({
                ...p,
                examples: JSON.parse(p.examples || '[]')
            })),
            sampleEntries: sampleEntries.map(e => ({
                ...e,
                parsed_fields: JSON.parse(e.parsed_fields || '{}')
            })),
            metadata: {
                totalPatterns: patterns.length,
                totalEntries: analysis.parsed_lines,
                analysisDate: analysis.analysis_timestamp
            }
        });

    } catch (error) {
        const logger = req.app.locals.loggers?.system || console;
        logger.error(`❌ Error fetching analysis: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 📋 List all uploaded files and their status
 */
router.get('/files', async (req, res) => {
    const db = req.app.locals.db();
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const files = await db.all(`
            SELECT 
                uf.*,
                fa.id as analysis_id,
                fa.success_rate,
                fa.analysis_timestamp
            FROM uploaded_files uf
            LEFT JOIN file_analysis fa ON uf.analysis_id = fa.id
            ORDER BY uf.upload_timestamp DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const totalCount = await db.get(`
            SELECT COUNT(*) as total FROM uploaded_files
        `);

        res.json({
            success: true,
            files: files,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount.total / limit),
                totalFiles: totalCount.total,
                hasMore: offset + files.length < totalCount.total
            }
        });

    } catch (error) {
        const logger = req.app.locals.loggers?.system || console;
        logger.error(`❌ Error listing files: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 🔍 Search parsed log entries
 */
router.post('/search/:analysisId', async (req, res) => {
    const db = req.app.locals.db();
    
    try {
        const analysisId = parseInt(req.params.analysisId);
        const { 
            query, 
            level, 
            startTime, 
            endTime, 
            source, 
            limit = 100, 
            offset = 0 
        } = req.body;

        let whereClause = 'WHERE analysis_id = ?';
        const params = [analysisId];

        if (query) {
            whereClause += ' AND (message LIKE ? OR raw_line LIKE ?)';
            params.push(`%${query}%`, `%${query}%`);
        }

        if (level) {
            whereClause += ' AND level = ?';
            params.push(level);
        }

        if (startTime) {
            whereClause += ' AND timestamp >= ?';
            params.push(startTime);
        }

        if (endTime) {
            whereClause += ' AND timestamp <= ?';
            params.push(endTime);
        }

        if (source) {
            whereClause += ' AND source LIKE ?';
            params.push(`%${source}%`);
        }

        const entries = await db.all(`
            SELECT * FROM parsed_log_entries 
            ${whereClause}
            ORDER BY line_number DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const totalCount = await db.get(`
            SELECT COUNT(*) as total FROM parsed_log_entries ${whereClause}
        `, params);

        res.json({
            success: true,
            entries: entries.map(e => ({
                ...e,
                parsed_fields: JSON.parse(e.parsed_fields || '{}')
            })),
            total: totalCount.total,
            hasMore: offset + entries.length < totalCount.total
        });

    } catch (error) {
        const logger = req.app.locals.loggers?.system || console;
        logger.error(`❌ Search error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 🗑️ Delete uploaded file and analysis
 */
router.delete('/file/:fileId', async (req, res) => {
    const logger = req.app.locals.loggers?.system || console;
    const db = req.app.locals.db();
    
    try {
        const fileId = parseInt(req.params.fileId);

        // Get file information
        const fileRecord = await db.get(`
            SELECT * FROM uploaded_files WHERE id = ?
        `, [fileId]);

        if (!fileRecord) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Delete physical file
        if (fs.existsSync(fileRecord.file_path)) {
            fs.unlinkSync(fileRecord.file_path);
            logger.info(`🗑️ Deleted physical file: ${fileRecord.file_path}`);
        }

        // Delete from database (cascading deletes will handle related records)
        await db.run('DELETE FROM uploaded_files WHERE id = ?', [fileId]);
        
        logger.info(`🗑️ Deleted file record: ${fileRecord.original_filename}`);

        res.json({
            success: true,
            message: `File ${fileRecord.original_filename} deleted successfully`
        });

    } catch (error) {
        logger.error(`❌ Delete error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 📊 Get supported log formats
 */
router.get('/formats', (req, res) => {
    const parser = new LogParserEngine();
    const formats = Object.entries(parser.supportedFormats).map(([id, format]) => ({
        id,
        name: format.name,
        description: format.sample || 'Custom format',
        fields: format.fields || []
    }));

    res.json({
        success: true,
        formats: formats,
        totalFormats: formats.length
    });
});

/**
 * 📈 Get dashboard statistics
 */
router.get('/dashboard/stats', async (req, res) => {
    const db = req.app.locals.db();
    
    try {
        const stats = await Promise.all([
            db.get('SELECT COUNT(*) as total FROM uploaded_files'),
            db.get('SELECT COUNT(*) as total FROM file_analysis'),
            db.get('SELECT SUM(file_size) as total FROM uploaded_files'),
            db.get('SELECT SUM(parsed_lines) as total FROM file_analysis'),
            db.all(`
                SELECT parsing_status, COUNT(*) as count 
                FROM uploaded_files 
                GROUP BY parsing_status
            `),
            db.all(`
                SELECT DATE(upload_timestamp) as date, COUNT(*) as uploads
                FROM uploaded_files 
                WHERE upload_timestamp >= datetime('now', '-30 days')
                GROUP BY DATE(upload_timestamp)
                ORDER BY date DESC
            `)
        ]);

        res.json({
            success: true,
            stats: {
                totalFiles: stats[0].total,
                totalAnalyses: stats[1].total,
                totalSize: stats[2].total || 0,
                totalParsedLines: stats[3].total || 0,
                statusDistribution: stats[4],
                uploadTrend: stats[5]
            }
        });

    } catch (error) {
        const logger = req.app.locals.loggers?.system || console;
        logger.error(`❌ Dashboard stats error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;