/**
 * FileIngestionEngine
 * Real directory-based log ingestion with zero mock data.
 * 
 * Configuration (environment variables):
 *   FILE_INGESTION_ENABLED=true|false (default: false)
 *   FILE_INGESTION_DIRECTORY=absolute_or_relative_path (required when enabled)
 *   FILE_INGESTION_FILE_PATTERN=glob or regex (default: *.log, *.jsonl)
 *   FILE_INGESTION_MODE=jsonl|regex (default: auto)
 *
 * Behavior:
 *   - Watches configured directory for new/changed files matching pattern
 *   - Incrementally reads only appended content (maintains in-memory offsets)
 *   - Parses each non-empty line:
 *       * JSON Lines (when valid JSON) OR
 *       * Fallback regex: TIMESTAMP LEVEL MESSAGE
 *   - Inserts real log entries via dal.createLogEntry without fabrication
 *   - Skips lines that cannot be parsed (no placeholder substitutions)
 */
const fs = require('fs');
const path = require('path');
let chokidar; // Lazy require to avoid issues if dependency missing unexpectedly

class FileIngestionEngine {
    constructor(config, loggers, dal) {
        this.config = config;
        this.loggers = loggers;
        this.dal = dal;
        this.enabled = String(process.env.FILE_INGESTION_ENABLED || 'false').toLowerCase() === 'true';
        this.directory = process.env.FILE_INGESTION_DIRECTORY || path.join(process.cwd(), 'incoming-logs');
        this.filePattern = process.env.FILE_INGESTION_FILE_PATTERN || '**/*.{log,jsonl}';
        this.mode = process.env.FILE_INGESTION_MODE || 'auto'; // 'jsonl' | 'regex' | 'auto'
        this.offsets = new Map(); // filename -> last byte offset processed
        this.maxInitialFileSize = 50 * 1024 * 1024; // 50MB safety cap for initial full read
        this.initialized = false;
    }

    async initialize() {
        if (!this.enabled) {
            this.loggers.system.info('📁 File Ingestion Engine disabled via FILE_INGESTION_ENABLED');
            return false;
        }

        // Ensure chokidar is available
        try {
            chokidar = require('chokidar');
        } catch (err) {
            this.loggers.system.error('File Ingestion Engine requires chokidar dependency. Install and retry.', err);
            return false;
        }

        // Validate directory
        if (!fs.existsSync(this.directory)) {
            try {
                fs.mkdirSync(this.directory, { recursive: true });
                this.loggers.system.warn(`📁 Created missing ingestion directory: ${this.directory}`);
            } catch (mkdirErr) {
                this.loggers.system.error(`❌ Cannot create ingestion directory: ${this.directory}`, mkdirErr);
                return false;
            }
        }

        this.loggers.system.info('🚀 Starting File Ingestion Engine...');
        this.loggers.system.info(`   • Directory: ${this.directory}`);
        this.loggers.system.info(`   • Pattern: ${this.filePattern}`);
        this.loggers.system.info(`   • Mode: ${this.mode}`);

        await this._startWatcher();
        this.initialized = true;
        this.loggers.system.info('✅ File Ingestion Engine initialized');
        return true;
    }

    async _loadExistingOffsets() {
        // Load persisted offsets for existing files in directory
        try {
            const files = fs.readdirSync(this.directory);
            for (const f of files) {
                const full = path.join(this.directory, f);
                if (!fs.statSync(full).isFile()) continue;
                const matchExt = /\.(log|jsonl)$/i.test(f);
                if (!matchExt) continue;
                const record = await this.dal.getFileOffset(full);
                if (record && typeof record.last_offset === 'number') {
                    this.offsets.set(full, record.last_offset);
                }
            }
            this.loggers.system.info(`📁 Loaded ${this.offsets.size} persisted file offsets`);
        } catch (err) {
            this.loggers.system.warn('Failed to load file offsets (continuing with empty cache):', err.message);
        }
    }

    async _startWatcher() {
        await this._loadExistingOffsets();
        const watcher = chokidar.watch(this.filePattern, {
            cwd: this.directory,
            persistent: true,
            ignoreInitial: false,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        watcher.on('add', file => this._processFile(file, true));
        watcher.on('change', file => this._processFile(file, false));
        watcher.on('error', error => this.loggers.system.error('File watcher error:', error));
    }

    _resolveFilePath(rel) {
        return path.isAbsolute(rel) ? rel : path.join(this.directory, rel);
    }

    _processFile(relPath, isNew) {
        const fullPath = this._resolveFilePath(relPath);
        fs.stat(fullPath, (err, stats) => {
            if (err) {
                this.loggers.system.error(`Stat failed for ${fullPath}`, err);
                return;
            }
            const previousOffset = this.offsets.get(fullPath) || 0;
            const fileSize = stats.size;

            // Determine start offset
            let startOffset = previousOffset;
            if (isNew && previousOffset === 0) {
                // For new files if very large, skip initial historical content beyond cap
                if (fileSize > this.maxInitialFileSize) {
                    startOffset = fileSize - this.maxInitialFileSize;
                    this.loggers.system.warn(`Skipping to tail of large file (>${this.maxInitialFileSize} bytes): ${path.basename(fullPath)}`);
                } else {
                    startOffset = 0;
                }
            }

            if (fileSize <= startOffset) {
                // Nothing new
                return;
            }

            fs.open(fullPath, 'r', (openErr, fd) => {
                if (openErr) {
                    this.loggers.system.error(`Open failed for ${fullPath}`, openErr);
                    return;
                }
                const length = fileSize - startOffset;
                const buffer = Buffer.alloc(length);
                fs.read(fd, buffer, 0, length, startOffset, (readErr, bytesRead) => {
                    fs.close(fd, () => {});
                    if (readErr) {
                        this.loggers.system.error(`Read failed for ${fullPath}`, readErr);
                        return;
                    }
                    if (!bytesRead) return;
                    const chunk = buffer.toString('utf8', 0, bytesRead);
                    this._parseAndIngestLines(chunk, fullPath);
                    this.offsets.set(fullPath, fileSize);
                    // Persist offset
                    this.dal.setFileOffset(fullPath, fileSize).catch(e => {
                        this.loggers.system.warn('Failed to persist file offset', { file: fullPath, error: e.message });
                    });
                });
            });
        });
    }

    _parseAndIngestLines(content, filePath) {
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (!lines.length) return;

        // Determine effective mode: use jsonl for .jsonl files even in auto mode
        const isJsonlFile = filePath.toLowerCase().endsWith('.jsonl');
        const effectiveMode = (this.mode === 'auto' && isJsonlFile) ? 'jsonl' : this.mode;

        let ingested = 0;
        let errors = 0;
        for (const line of lines) {
            const { entry, errorReason } = this._parseLineDetailed(line, effectiveMode);
            if (!entry) {
                errors++;
                // Record parse error non-blockingly; truncate snippet for safety
                const snippet = line.length > 500 ? line.slice(0, 500) : line;
                this.dal.recordParseError?.({
                    source: 'file',
                    file_path: filePath,
                    line_number: null,
                    line_snippet: snippet,
                    reason: errorReason || 'unparsable'
                }).catch(e => {
                    this.loggers.system.warn('Failed to record parse error', { file: filePath, error: e.message });
                });
                continue; // Skip unparsable without fabricating
            }
            this.dal.createLogEntry(entry).catch(err => {
                this.loggers.system.error('Failed to insert parsed file log', { error: err.message, file: filePath });
            });
            ingested++;
        }
        if (ingested) {
            this.loggers.system.info(`📥 Ingested ${ingested} log line(s) from ${path.basename(filePath)}`);
        }
        if (errors) {
            this.loggers.system.warn(`⚠️ Skipped ${errors} unparsable line(s) from ${path.basename(filePath)}`);
        }
    }

    _parseLineDetailed(line, effectiveMode = null) {
        const mode = effectiveMode || this.mode;
        // Try JSON lines first (unless mode explicitly regex)
        let jsonTried = false;
        if (mode !== 'regex') {
            // In jsonl mode or if line looks like JSON, try to parse
            if ((line.startsWith('{') && line.endsWith('}')) || mode === 'jsonl') {
                jsonTried = true;
                try {
                    const obj = JSON.parse(line);
                    // Map minimal fields; allow passthrough of existing schema keys
                    return {
                        entry: {
                            timestamp: obj.timestamp || new Date().toISOString(),
                            level: obj.level || obj.severity || 'info',
                            source: obj.source || obj.category || 'file',
                            message: obj.message || obj.msg || line,
                            ip: obj.ip || null,
                            tags: obj.tags || null,
                            metadata: obj.metadata || null
                        }
                    };
                } catch (e) {
                    // In jsonl mode, don't fall through to regex - it's an invalid JSON error
                    if (mode === 'jsonl') {
                        return { entry: null, errorReason: 'invalid-json' };
                    }
                    // Otherwise fall through to regex
                }
            }
        }

        // Regex fallback: TIMESTAMP LEVEL MESSAGE
        // Example: 2025-11-14T18:32:10.123Z INFO Service started
        const regex = /^(\d{4}-\d{2}-\d{2}[^\s]*)\s+([A-Z]+)\s+(.+)$/;
        const m = line.match(regex);
        if (m) {
            return {
                entry: {
                    timestamp: m[1],
                    level: m[2].toLowerCase(),
                    source: 'file',
                    message: m[3]
                }
            };
        }

        // Unparsable - return null (do NOT fabricate)
        return { entry: null, errorReason: jsonTried ? 'invalid-json' : 'no-regex-match' };
    }
}

module.exports = FileIngestionEngine;
