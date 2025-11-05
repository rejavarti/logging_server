/**
 * 🚀 COMPREHENSIVE LOG PARSER ENGINE
 * Universal log file parser supporting 20+ formats
 * Built for maximum compatibility and intelligent format detection
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
const { promisify } = require('util');

class LogParserEngine {
    constructor(logger) {
        this.logger = logger || console;
        this.supportedFormats = this.initializeSupportedFormats();
        this.stats = {
            totalLines: 0,
            parsedLines: 0,
            errorLines: 0,
            skippedLines: 0
        };
    }

    initializeSupportedFormats() {
        return {
            // 🌐 WEB SERVER LOGS
            apache_common: {
                name: 'Apache Common Log Format',
                pattern: /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+)/,
                fields: ['ip', 'timestamp', 'request', 'status', 'size'],
                sample: '127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326'
            },
            apache_combined: {
                name: 'Apache Combined Log Format',
                pattern: /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\S+) "([^"]*)" "([^"]*)"/,
                fields: ['ip', 'timestamp', 'request', 'status', 'size', 'referer', 'user_agent'],
                sample: '127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /index.html HTTP/1.0" 200 2326 "http://example.com" "Mozilla/5.0"'
            },
            nginx_access: {
                name: 'Nginx Access Log',
                pattern: /^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" "([^"]*)"/,
                fields: ['ip', 'user', 'timestamp', 'request', 'status', 'size', 'referer', 'user_agent', 'forwarded_for'],
                sample: '192.168.1.1 - user [10/Oct/2000:13:55:36 +0000] "GET /index.html HTTP/1.1" 200 612 "http://example.com" "Mozilla/5.0" "-"'
            },
            nginx_error: {
                name: 'Nginx Error Log',
                pattern: /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (\d+)#(\d+): (.+)/,
                fields: ['timestamp', 'level', 'pid', 'tid', 'message'],
                sample: '2023/10/25 10:15:30 [error] 1234#0: *567 connect() failed (111: Connection refused)'
            },
            iis: {
                name: 'IIS W3C Extended Log',
                pattern: /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (\S+) (\S+) (\S+) (\d+) (\S+) (\S+) (\d+) (\d+) (\d+) (\d+) (\S+) (\S+)/,
                fields: ['date', 'time', 'server_ip', 'method', 'uri', 'query', 'port', 'username', 'client_ip', 'user_agent', 'referer', 'status', 'substatus', 'win32_status', 'bytes_sent', 'bytes_received', 'time_taken'],
                sample: '2023-10-25 10:15:30 192.168.1.100 GET /default.htm - 80 - 192.168.1.1 HTTP/1.0 Mozilla/4.0 200 0 0 3330'
            },

            // 🖥️ SYSTEM LOGS
            syslog: {
                name: 'Standard Syslog',
                pattern: /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\S+) (\S+)(?:\[(\d+)\])?: (.+)/,
                fields: ['timestamp', 'hostname', 'process', 'pid', 'message'],
                sample: 'Oct 25 10:15:30 server01 sshd[1234]: Accepted password for user from 192.168.1.1'
            },
            rsyslog: {
                name: 'Rsyslog with facility/severity',
                pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+[+-]\d{2}:\d{2}) (\S+) (\S+) (\S+) (\S+) (.+)/,
                fields: ['timestamp', 'hostname', 'facility', 'severity', 'process', 'message'],
                sample: '2023-10-25T10:15:30.123+00:00 server01 16 6 sshd Accepted password for user'
            },
            systemd: {
                name: 'Systemd Journal',
                pattern: /^(\w{3} \d{2} \d{2}:\d{2}:\d{2}) (\S+) (\S+)\[(\d+)\]: (.+)/,
                fields: ['timestamp', 'hostname', 'unit', 'pid', 'message'],
                sample: 'Oct 25 10:15:30 server01 systemd[1]: Started Apache HTTP Server'
            },

            // 📊 STRUCTURED LOGS
            json_logs: {
                name: 'JSON Log Format',
                pattern: /^(\{.+\})$/,
                fields: ['json_data'],
                parser: 'json',
                sample: '{"timestamp":"2023-10-25T10:15:30Z","level":"info","message":"User logged in","user_id":123}'
            },
            logstash: {
                name: 'Logstash JSON Format',
                pattern: /^(\{.+\})$/,
                fields: ['json_data'],
                parser: 'json_logstash',
                sample: '{"@timestamp":"2023-10-25T10:15:30.123Z","@version":"1","level":"INFO","message":"Processing request"}'
            },

            // 🐳 CONTAINER LOGS
            docker: {
                name: 'Docker Container Logs',
                pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (.+)/,
                fields: ['timestamp', 'message'],
                sample: '2023-10-25T10:15:30.123456789Z This is a log message from container'
            },
            kubernetes: {
                name: 'Kubernetes Pod Logs',
                pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (\S+) (\S+) (.+)/,
                fields: ['timestamp', 'stream', 'level', 'message'],
                sample: '2023-10-25T10:15:30.123Z stderr F [ERROR] Application failed to start'
            },

            // 🗄️ DATABASE LOGS
            mysql_error: {
                name: 'MySQL Error Log',
                pattern: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (\d+) \[(\w+)\] \[(\w+)\] (.+)/,
                fields: ['timestamp', 'thread_id', 'label', 'level', 'message'],
                sample: '2023-10-25T10:15:30.123456Z 0 [Warning] [MY-010068] [Server] CA certificate is self signed.'
            },
            postgresql: {
                name: 'PostgreSQL Log',
                pattern: /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ \w+) \[(\d+)\] (\w+): (.+)/,
                fields: ['timestamp', 'pid', 'level', 'message'],
                sample: '2023-10-25 10:15:30.123 UTC [1234] LOG: database system is ready to accept connections'
            },

            // 🔒 SECURITY LOGS
            auth_log: {
                name: 'Linux Auth Log',
                pattern: /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\S+) (\S+)(?:\[(\d+)\])?: (.+)/,
                fields: ['timestamp', 'hostname', 'process', 'pid', 'message'],
                sample: 'Oct 25 10:15:30 server01 sshd[1234]: Failed password for root from 192.168.1.100'
            },
            fail2ban: {
                name: 'Fail2ban Log',
                pattern: /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+) (\w+) \[(\d+)\]: (\w+) (.+)/,
                fields: ['timestamp', 'level', 'pid', 'module', 'message'],
                sample: '2023-10-25 10:15:30,123 WARNING [1234]: sshd Ban 192.168.1.100'
            },

            // 🔄 APPLICATION LOGS
            spring_boot: {
                name: 'Spring Boot Application Log',
                pattern: /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\s+(\w+) (\d+) --- \[(.+?)\] (\S+)\s+: (.+)/,
                fields: ['timestamp', 'level', 'pid', 'thread', 'logger', 'message'],
                sample: '2023-10-25 10:15:30.123  INFO 1234 --- [main] com.example.Application: Started Application in 2.3 seconds'
            },
            java_log4j: {
                name: 'Java Log4j Format',
                pattern: /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+) (\w+) \[(.+?)\] (\S+) - (.+)/,
                fields: ['timestamp', 'level', 'thread', 'logger', 'message'],
                sample: '2023-10-25 10:15:30,123 INFO [main] com.example.Service - Processing request'
            },

            // 📱 MOBILE & CUSTOM
            custom_delimiter: {
                name: 'Custom Delimited Format',
                pattern: null, // Will be set dynamically
                fields: [], // Will be detected
                parser: 'csv_like'
            }
        };
    }

    /**
     * 🔍 Automatically detect log format from file content
     */
    async detectFormat(filePath, sampleSize = 50) {
        this.logger.info(`🔍 Detecting format for: ${path.basename(filePath)}`);
        
        const readStream = await this.createReadStream(filePath);
        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });

        const samples = [];
        let lineCount = 0;

        for await (const line of rl) {
            if (line.trim()) {
                samples.push(line.trim());
                lineCount++;
                if (lineCount >= sampleSize) break;
            }
        }

        rl.close();
        readStream.destroy();

        // Score each format against sample lines
        const formatScores = {};
        
        for (const [formatId, format] of Object.entries(this.supportedFormats)) {
            if (!format.pattern && formatId !== 'custom_delimiter') continue;
            
            let matches = 0;
            for (const sample of samples) {
                if (formatId === 'json_logs' || formatId === 'logstash') {
                    try {
                        JSON.parse(sample);
                        matches++;
                    } catch (e) {
                        // Not JSON
                    }
                } else if (format.pattern && format.pattern.test(sample)) {
                    matches++;
                }
            }
            
            formatScores[formatId] = {
                score: matches / samples.length,
                matches: matches,
                total: samples.length,
                format: format
            };
        }

        // Check for CSV-like formats
        const csvScore = this.detectCSVFormat(samples);
        if (csvScore.score > 0) {
            formatScores['custom_delimiter'] = csvScore;
        }

        // Find best match
        let bestFormat = null;
        let bestScore = 0;

        for (const [formatId, result] of Object.entries(formatScores)) {
            if (result.score > bestScore && result.score >= 0.7) { // 70% confidence threshold
                bestScore = result.score;
                bestFormat = {
                    id: formatId,
                    name: result.format.name,
                    score: result.score,
                    matches: result.matches,
                    total: result.total
                };
            }
        }

        this.logger.info(`🎯 Format detection result: ${bestFormat ? bestFormat.name : 'Unknown'} (${Math.round((bestScore * 100))}% confidence)`);
        
        return {
            detectedFormat: bestFormat,
            allScores: formatScores,
            samples: samples.slice(0, 10) // Return first 10 samples for preview
        };
    }

    /**
     * 📊 Detect CSV-like delimited formats
     */
    detectCSVFormat(samples) {
        const delimiters = [',', '\t', '|', ';', ' '];
        let bestDelimiter = null;
        let bestScore = 0;
        let consistentFields = 0;

        for (const delimiter of delimiters) {
            const fieldCounts = samples.map(line => line.split(delimiter).length);
            const avgFields = fieldCounts.reduce((a, b) => a + b, 0) / fieldCounts.length;
            const consistency = fieldCounts.filter(count => Math.abs(count - avgFields) <= 1).length / fieldCounts.length;
            
            if (consistency > bestScore && avgFields >= 3) { // At least 3 fields
                bestScore = consistency;
                bestDelimiter = delimiter;
                consistentFields = Math.round(avgFields);
            }
        }

        if (bestScore >= 0.8) { // 80% consistency
            return {
                score: bestScore,
                delimiter: bestDelimiter,
                fields: consistentFields,
                format: {
                    name: `Custom Delimited (${bestDelimiter === '\t' ? 'Tab' : bestDelimiter} separated)`,
                    delimiter: bestDelimiter
                }
            };
        }

        return { score: 0 };
    }

    /**
     * 📂 Create appropriate read stream (handles compression)
     */
    async createReadStream(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const fileStream = fs.createReadStream(filePath);

        switch (ext) {
            case '.gz':
                return fileStream.pipe(zlib.createGunzip());
            case '.bz2':
                // Note: Would need additional library for bz2
                throw new Error('Bzip2 compression not yet supported');
            case '.zip':
                // Note: Would need additional library for zip
                throw new Error('ZIP compression requires additional processing');
            default:
                return fileStream;
        }
    }

    /**
     * 🔄 Parse entire log file with progress tracking
     */
    async parseFile(filePath, formatId = null, progressCallback = null) {
        this.logger.info(`🔄 Starting to parse: ${path.basename(filePath)}`);
        this.stats = { totalLines: 0, parsedLines: 0, errorLines: 0, skippedLines: 0 };

        // Auto-detect format if not provided
        if (!formatId) {
            const detection = await this.detectFormat(filePath);
            formatId = detection.detectedFormat?.id;
            if (!formatId) {
                throw new Error('Could not detect log format');
            }
        }

        const format = this.supportedFormats[formatId];
        if (!format) {
            throw new Error(`Unsupported format: ${formatId}`);
        }

        const readStream = await this.createReadStream(filePath);
        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });

        const parsedEntries = [];
        const patterns = new Map(); // Track recurring patterns
        let lineNumber = 0;

        for await (const line of rl) {
            lineNumber++;
            this.stats.totalLines++;

            if (!line.trim()) {
                this.stats.skippedLines++;
                continue;
            }

            try {
                const parsedLine = this.parseLine(line, format, lineNumber);
                if (parsedLine) {
                    parsedEntries.push(parsedLine);
                    this.stats.parsedLines++;
                    
                    // Track patterns
                    this.trackPattern(parsedLine, patterns);
                } else {
                    this.stats.skippedLines++;
                }

                // Report progress every 1000 lines
                if (progressCallback && lineNumber % 1000 === 0) {
                    progressCallback({
                        processed: lineNumber,
                        parsed: this.stats.parsedLines,
                        errors: this.stats.errorLines,
                        progress: null // Total unknown during streaming
                    });
                }

            } catch (error) {
                this.stats.errorLines++;
                this.logger.debug(`Parse error on line ${lineNumber}: ${error.message}`);
                
                // Store unparseable line for analysis
                parsedEntries.push({
                    line_number: lineNumber,
                    raw_line: line,
                    error: error.message,
                    timestamp: null,
                    level: 'unknown',
                    message: line
                });
            }
        }

        rl.close();
        readStream.destroy();

        const result = {
            formatId,
            formatName: format.name,
            stats: this.stats,
            entries: parsedEntries,
            patterns: Array.from(patterns.entries()).map(([pattern, data]) => ({
                pattern,
                frequency: data.frequency,
                first_seen: data.first_seen,
                last_seen: data.last_seen,
                severity: this.classifyPatternSeverity(pattern),
                examples: data.examples.slice(0, 3)
            }))
        };

        this.logger.info(`✅ Parsing complete: ${this.stats.parsedLines}/${this.stats.totalLines} lines parsed successfully`);
        return result;
    }

    /**
     * 📝 Parse individual log line based on format
     */
    parseLine(line, format, lineNumber) {
        const entry = {
            line_number: lineNumber,
            raw_line: line,
            timestamp: null,
            level: null,
            message: null,
            source: null,
            ip_address: null,
            user_agent: null,
            status_code: null,
            response_size: null,
            processing_time: null,
            parsed_fields: {}
        };

        try {
            if (format.parser === 'json' || format.parser === 'json_logstash') {
                return this.parseJSONLine(line, entry, format);
            } else if (format.parser === 'csv_like') {
                return this.parseDelimitedLine(line, entry, format);
            } else if (format.pattern) {
                return this.parseRegexLine(line, entry, format);
            }
        } catch (error) {
            throw new Error(`Failed to parse line: ${error.message}`);
        }

        return null;
    }

    /**
     * 📊 Parse JSON formatted log lines
     */
    parseJSONLine(line, entry, format) {
        const jsonData = JSON.parse(line);
        
        // Common JSON log fields mapping
        entry.timestamp = this.extractTimestamp(
            jsonData.timestamp || jsonData['@timestamp'] || jsonData.time || jsonData.date
        );
        entry.level = this.normalizeLogLevel(
            jsonData.level || jsonData.severity || jsonData.priority || jsonData.loglevel
        );
        entry.message = jsonData.message || jsonData.msg || jsonData.content || line;
        entry.source = jsonData.source || jsonData.logger || jsonData.service || jsonData.application;
        
        // Store all JSON fields
        entry.parsed_fields = JSON.stringify(jsonData);
        
        return entry;
    }

    /**
     * 📋 Parse delimited (CSV-like) log lines
     */
    parseDelimitedLine(line, entry, format) {
        const fields = line.split(format.delimiter || ',');
        const fieldNames = format.fields || [];
        
        entry.parsed_fields = {};
        fields.forEach((value, index) => {
            const fieldName = fieldNames[index] || `field_${index + 1}`;
            entry.parsed_fields[fieldName] = value.trim();
        });
        
        // Try to identify common fields
        if (entry.parsed_fields.timestamp || entry.parsed_fields.time || entry.parsed_fields.date) {
            entry.timestamp = this.extractTimestamp(entry.parsed_fields.timestamp || entry.parsed_fields.time || entry.parsed_fields.date);
        }
        if (entry.parsed_fields.level || entry.parsed_fields.severity) {
            entry.level = this.normalizeLogLevel(entry.parsed_fields.level || entry.parsed_fields.severity);
        }
        if (entry.parsed_fields.message || entry.parsed_fields.msg) {
            entry.message = entry.parsed_fields.message || entry.parsed_fields.msg;
        }
        
        entry.parsed_fields = JSON.stringify(entry.parsed_fields);
        return entry;
    }

    /**
     * 🔤 Parse regex-based log lines
     */
    parseRegexLine(line, entry, format) {
        const match = format.pattern.exec(line);
        if (!match) {
            throw new Error('Line does not match expected pattern');
        }

        const fieldData = {};
        format.fields.forEach((fieldName, index) => {
            if (match[index + 1] !== undefined) {
                fieldData[fieldName] = match[index + 1];
            }
        });

        // Map common fields
        entry.timestamp = this.extractTimestamp(fieldData.timestamp);
        entry.level = this.normalizeLogLevel(fieldData.level);
        entry.message = fieldData.message;
        entry.source = fieldData.hostname || fieldData.server || fieldData.process;
        entry.ip_address = fieldData.ip || fieldData.client_ip;
        entry.user_agent = fieldData.user_agent;
        entry.status_code = fieldData.status ? parseInt(fieldData.status) : null;
        entry.response_size = fieldData.size ? parseInt(fieldData.size) : null;
        
        entry.parsed_fields = JSON.stringify(fieldData);
        return entry;
    }

    /**
     * ⏰ Extract and normalize timestamp
     */
    extractTimestamp(timestampStr) {
        if (!timestampStr) return null;
        
        try {
            // Handle various timestamp formats
            const date = new Date(timestampStr);
            if (isNaN(date.getTime())) {
                // Try parsing custom formats
                return this.parseCustomTimestamp(timestampStr);
            }
            return date.toISOString();
        } catch (error) {
            return null;
        }
    }

    /**
     * 📅 Parse custom timestamp formats
     */
    parseCustomTimestamp(timestampStr) {
        // Common log timestamp patterns
        const patterns = [
            // Apache/Nginx: [10/Oct/2000:13:55:36 -0700]
            /\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2})\s*([+-]\d{4})?\]/,
            // Syslog: Oct 25 10:15:30
            /(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
            // ISO-like: 2023-10-25 10:15:30.123
            /(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?)/
        ];

        for (const pattern of patterns) {
            const match = timestampStr.match(pattern);
            if (match) {
                try {
                    const date = new Date(match[1]);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString();
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        return null;
    }

    /**
     * 📊 Normalize log levels to standard severity
     */
    normalizeLogLevel(level) {
        if (!level) return 'info';
        
        const levelStr = level.toString().toLowerCase();
        const levelMap = {
            'emerg': 'emergency', 'emergency': 'emergency', '0': 'emergency',
            'alert': 'alert', '1': 'alert',
            'crit': 'critical', 'critical': 'critical', 'fatal': 'critical', '2': 'critical',
            'err': 'error', 'error': 'error', '3': 'error',
            'warn': 'warning', 'warning': 'warning', '4': 'warning',
            'notice': 'notice', '5': 'notice',
            'info': 'info', 'information': 'info', '6': 'info',
            'debug': 'debug', '7': 'debug'
        };

        return levelMap[levelStr] || 'info';
    }

    /**
     * 🔍 Track recurring patterns for analysis
     */
    trackPattern(entry, patterns) {
        if (!entry.message) return;
        
        // Extract pattern (remove dynamic parts like IPs, timestamps, numbers)
        const pattern = entry.message
            .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, 'IP_ADDRESS')
            .replace(/\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
            .replace(/\d+/g, 'NUMBER')
            .replace(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g, 'UUID');

        if (patterns.has(pattern)) {
            const data = patterns.get(pattern);
            data.frequency++;
            data.last_seen = entry.timestamp || new Date().toISOString();
            if (data.examples.length < 5) {
                data.examples.push(entry.message);
            }
        } else {
            patterns.set(pattern, {
                frequency: 1,
                first_seen: entry.timestamp || new Date().toISOString(),
                last_seen: entry.timestamp || new Date().toISOString(),
                examples: [entry.message]
            });
        }
    }

    /**
     * ⚠️ Classify pattern severity based on content
     */
    classifyPatternSeverity(pattern) {
        const errorKeywords = ['error', 'fail', 'exception', 'critical', 'fatal', 'denied', 'refused', 'timeout'];
        const warningKeywords = ['warning', 'warn', 'deprecated', 'slow', 'retry', 'fallback'];
        
        const lowerPattern = pattern.toLowerCase();
        
        if (errorKeywords.some(keyword => lowerPattern.includes(keyword))) {
            return 'error';
        } else if (warningKeywords.some(keyword => lowerPattern.includes(keyword))) {
            return 'warning';
        } else {
            return 'info';
        }
    }

    /**
     * 📈 Generate analysis summary
     */
    generateAnalysisSummary(parseResult) {
        const { stats, entries, patterns } = parseResult;
        
        // Analyze log levels
        const levelCounts = {};
        const hourlyActivity = {};
        const topSources = {};
        const ipAddresses = new Set();
        const statusCodes = {};
        
        entries.forEach(entry => {
            // Log levels
            levelCounts[entry.level || 'unknown'] = (levelCounts[entry.level || 'unknown'] || 0) + 1;
            
            // Hourly activity
            if (entry.timestamp) {
                const hour = new Date(entry.timestamp).getHours();
                hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
            }
            
            // Top sources
            if (entry.source) {
                topSources[entry.source] = (topSources[entry.source] || 0) + 1;
            }
            
            // IP addresses
            if (entry.ip_address) {
                ipAddresses.add(entry.ip_address);
            }
            
            // Status codes
            if (entry.status_code) {
                statusCodes[entry.status_code] = (statusCodes[entry.status_code] || 0) + 1;
            }
        });

        return {
            overview: {
                totalLines: stats.totalLines,
                parsedLines: stats.parsedLines,
                errorLines: stats.errorLines,
                successRate: Math.round((stats.parsedLines / stats.totalLines) * 100)
            },
            logLevels: levelCounts,
            timeAnalysis: {
                hourlyActivity: hourlyActivity,
                timeRange: this.getTimeRange(entries)
            },
            sources: {
                topSources: Object.entries(topSources).sort((a, b) => b[1] - a[1]).slice(0, 10),
                uniqueCount: Object.keys(topSources).length
            },
            network: {
                uniqueIPs: ipAddresses.size,
                topIPs: Array.from(ipAddresses).slice(0, 20)
            },
            httpAnalysis: {
                statusCodes: statusCodes,
                totalRequests: Object.values(statusCodes).reduce((a, b) => a + b, 0)
            },
            patterns: patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 20),
            anomalies: this.detectAnomalies(entries, patterns)
        };
    }

    /**
     * ⏰ Get time range from entries
     */
    getTimeRange(entries) {
        const timestamps = entries
            .map(e => e.timestamp)
            .filter(t => t)
            .map(t => new Date(t))
            .sort((a, b) => a - b);
            
        if (timestamps.length === 0) return null;
        
        return {
            start: timestamps[0].toISOString(),
            end: timestamps[timestamps.length - 1].toISOString(),
            duration: timestamps[timestamps.length - 1] - timestamps[0]
        };
    }

    /**
     * 🚨 Detect potential anomalies and security issues
     */
    detectAnomalies(entries, patterns) {
        const anomalies = [];
        
        // High error rate
        const errorEntries = entries.filter(e => ['error', 'critical', 'emergency'].includes(e.level));
        if (errorEntries.length > entries.length * 0.1) { // More than 10% errors
            anomalies.push({
                type: 'high_error_rate',
                severity: 'warning',
                message: `High error rate detected: ${errorEntries.length}/${entries.length} (${Math.round(errorEntries.length/entries.length*100)}%)`,
                count: errorEntries.length
            });
        }
        
        // Suspicious IP activity
        const ipCounts = {};
        entries.forEach(entry => {
            if (entry.ip_address) {
                ipCounts[entry.ip_address] = (ipCounts[entry.ip_address] || 0) + 1;
            }
        });
        
        const avgRequestsPerIP = Object.values(ipCounts).reduce((a, b) => a + b, 0) / Object.keys(ipCounts).length;
        for (const [ip, count] of Object.entries(ipCounts)) {
            if (count > avgRequestsPerIP * 10) { // IP with 10x more requests than average
                anomalies.push({
                    type: 'suspicious_ip_activity',
                    severity: 'error',
                    message: `IP ${ip} has unusually high activity: ${count} requests`,
                    ip: ip,
                    count: count
                });
            }
        }
        
        // Frequent error patterns
        patterns.forEach(pattern => {
            if (pattern.severity === 'error' && pattern.frequency > 100) {
                anomalies.push({
                    type: 'frequent_error_pattern',
                    severity: 'warning',
                    message: `Frequent error pattern detected: "${pattern.pattern}" (${pattern.frequency} occurrences)`,
                    pattern: pattern.pattern,
                    frequency: pattern.frequency
                });
            }
        });
        
        return anomalies.sort((a, b) => {
            const severityOrder = { 'error': 3, 'warning': 2, 'info': 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }
}

module.exports = LogParserEngine;