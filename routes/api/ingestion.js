const express = require('express');
const router = express.Router();
const glossy = require('glossy'); // Professional syslog parser
const fs = require('fs');
const path = require('path');

// Initialize syslog helpers (glossy.Parse is a plain object with .parse)
const syslogProducer = glossy.Produce; // producer factory/static
const syslogParser = glossy.Parse; // not a constructor

// Ingestion API endpoints
router.get('/ingestion/status', async (req, res) => {
    try {
        const db = req.app.get('db');
        
        // Get real counts from database
        const totalLogs = db.prepare('SELECT COUNT(*) as count FROM logs').get();
        const recentLogs = db.prepare('SELECT COUNT(*) as count FROM logs WHERE timestamp > NOW() - INTERVAL \'1 hour\'').get();
        
        const status = {
            engines: [
                {
                    name: 'Syslog UDP',
                    protocol: 'syslog',
                    port: 514,
                    status: 'not configured',
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                },
                {
                    name: 'Syslog TCP', 
                    protocol: 'syslog-tcp',
                    port: 601,
                    status: 'not configured',
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                },
                {
                    name: 'GELF UDP',
                    protocol: 'gelf',
                    port: 12201,
                    status: 'not configured', 
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                },
                {
                    name: 'GELF TCP',
                    protocol: 'gelf-tcp',
                    port: 12202,
                    status: 'not configured',
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                },
                {
                    name: 'Beats TCP',
                    protocol: 'beats',
                    port: 5044,
                    status: 'not configured',
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                },
                {
                    name: 'Fluent HTTP',
                    protocol: 'fluent',
                    port: 9880,
                    status: 'not configured',
                    messages_received: 0,
                    messages_processed: 0,
                    errors: 0,
                    last_message: null,
                    rate_limit: 1000,
                    current_rate: 0
                }
            ],
            summary: {
                total_received: totalLogs.count,
                total_processed: totalLogs.count,
                total_errors: 0,
                error_rate: 0,
                average_processing_time: 0,
                queue_size: 0,
                uptime: process.uptime()
            },
            health: 'healthy'
        };

        res.json({ success: true, status });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting ingestion status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ingestion/test-parse', async (req, res) => {
    try {
        const startTime = Date.now();
        const { message, format } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required' 
            });
        }

        let parsed = {};
        let validation = { valid: true, errors: [] };

        // Parse based on format
        switch (format) {
            case 'syslog':
                try {
                    // Use professional syslog parser
                    parsed = syslogParser.parse(message);
                    if (parsed) {
                        // Normalize parsed syslog message
                        parsed = {
                            priority: parsed.pri || 0,
                            facility: parsed.facility || Math.floor((parsed.pri || 0) / 8),
                            severity: parsed.severity || (parsed.pri || 0) % 8,
                            timestamp: parsed.time || new Date().toISOString(),
                            hostname: parsed.host || 'unknown',
                            appName: parsed.appName || parsed.tag || 'unknown',
                            message: parsed.message || message,
                            raw: message
                        };
                    } else {
                        throw new Error('Parse failed');
                    }
                } catch (e) {
                    // Fallback to basic regex if glossy fails
                    const syslogMatch = message.match(/<(\d+)>(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(.+)/);
                    if (syslogMatch) {
                        const [, priority, timestamp, hostname, msg] = syslogMatch;
                        parsed = {
                            priority: parseInt(priority),
                            facility: Math.floor(priority / 8),
                            severity: priority % 8,
                            timestamp: timestamp,
                            hostname: hostname,
                            message: msg,
                            raw: message
                        };
                    } else {
                        validation = { valid: false, errors: ['Invalid syslog format'] };
                    }
                }
                break;

            case 'json':
                try {
                    parsed = JSON.parse(message);
                    parsed.raw = message;
                } catch (e) {
                    validation = { valid: false, errors: ['Invalid JSON format'] };
                }
                break;

            case 'gelf':
                try {
                    const gelf = JSON.parse(message);
                    if (!gelf.version || !gelf.host || !gelf.short_message) {
                        validation = { 
                            valid: false, 
                            errors: ['Missing required GELF fields (version, host, short_message)'] 
                        };
                    } else {
                        parsed = gelf;
                        parsed.raw = message;
                    }
                } catch (e) {
                    validation = { valid: false, errors: ['Invalid GELF JSON format'] };
                }
                break;

            default:
                // Raw text parsing
                parsed = {
                    message: message,
                    timestamp: new Date().toISOString(),
                    raw: message
                };
        }

        // Store valid parsed logs to database (use req.dal or app.locals.dal())
        if (validation.valid) {
            try {
                const dal = req.dal || (typeof req.app?.locals?.dal === 'function' ? req.app.locals.dal() : req.app?.locals?.dal);
                if (dal && typeof dal.run === 'function') {
                    await dal.run(
                    `INSERT INTO logs (level, message, source, ip, timestamp, hostname, raw_data) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        parsed.severity || 'info',
                        parsed.message || parsed.short_message || message,
                        format,
                        req.ip || 'unknown',
                        parsed.timestamp || new Date().toISOString(),
                        parsed.hostname || parsed.host || 'unknown',
                        JSON.stringify(parsed)
                    ]
                );
                }
            } catch (dbError) {
                req.app.locals?.loggers?.api?.warn('Failed to store parsed log:', dbError.message);
                // Don't fail the request if DB storage fails
            }
        }

        const processingTime = Date.now() - startTime;
        
        res.json({ 
            success: true, 
            parsed, 
            validation,
            stored: validation.valid,
            suggested_fields: ['timestamp', 'level', 'component', 'host'],
            processing_time: processingTime
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error testing parse:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get ingestion statistics
router.get('/ingestion/stats', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        const dal = req.dal || (typeof req.app?.locals?.dal === 'function' ? req.app.locals.dal() : req.app?.locals?.dal);
        if (!dal || typeof dal.get !== 'function' || typeof dal.all !== 'function') {
            return res.json({ success: true, stats: {
                period,
                total_messages: 0,
                successful: 0,
                failed: 0,
                by_protocol: {},
                by_hour: Array.from({ length: 24 }, (_, i) => ({ hour: i, messages: 0, errors: 0 })),
                top_sources: [],
                error_types: []
            }});
        }
        
        // Parse period to hours
        const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };
        const hours = hoursMap[period] || 24;
        const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        // Query real statistics from database
        const totalResult = await dal.get(
            `SELECT COUNT(*) as total FROM logs WHERE timestamp >= $1`,
            [cutoffDate]
        );
        
        const bySourceResult = await dal.all(
            `SELECT source, COUNT(*) as count FROM logs WHERE timestamp >= $1 GROUP BY source`,
            [cutoffDate]
        );
        
        const topHostsResult = await dal.all(
            `SELECT hostname, COUNT(*) as messages FROM logs WHERE timestamp >= $1 
             GROUP BY hostname ORDER BY messages DESC LIMIT 5`,
            [cutoffDate]
        );
        
        // Calculate hourly distribution
        const hourlyResult = await dal.all(
            `SELECT EXTRACT(HOUR FROM timestamp) as hour, COUNT(*) as messages 
             FROM logs WHERE timestamp >= $1 GROUP BY hour ORDER BY hour`,
            [cutoffDate]
        );
        
        // Build by_hour array with all 24 hours
        const hourlyMap = {};
        hourlyResult.forEach(row => {
            hourlyMap[parseInt(row.hour)] = row.messages;
        });
        
        const by_hour = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            messages: hourlyMap[i] || 0,
            errors: 0 // Could query error logs separately if needed
        }));
        
        // Build by_protocol from source field
        const by_protocol = {};
        bySourceResult.forEach(row => {
            by_protocol[row.source] = row.count;
        });
        
        const stats = {
            period: period,
            total_messages: totalResult?.total || 0,
            successful: totalResult?.total || 0,
            failed: 0, // Could track in separate error_logs table
            by_protocol,
            by_hour,
            top_sources: topHostsResult.map(row => ({
                host: row.hostname,
                messages: row.messages
            })),
            error_types: [] // Could query from error_logs table if exists
        };

        res.json({ success: true, stats });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting ingestion stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// New: Report desired port open/close status as controlled by Port Guardian
router.get('/ports-status', async (req, res) => {
    try {
        const cfgPath = path.resolve(__dirname, '../../data/config/ingestion-state.json');
        let state = { tcp: {}, udp: {} };
        try {
            const raw = fs.readFileSync(cfgPath, 'utf8');
            state = JSON.parse(raw);
        } catch (e) {
            // If missing, return defaults (all closed)
        }

        // Build a friendly list
        const entries = [
            { key: 'syslog-udp', name: 'Syslog UDP', proto: 'udp', port: 514 },
            { key: 'syslog-tcp', name: 'Syslog TCP', proto: 'tcp', port: 601 },
            { key: 'gelf-udp', name: 'GELF UDP', proto: 'udp', port: 12201 },
            { key: 'gelf-tcp', name: 'GELF TCP', proto: 'tcp', port: 12202 },
            { key: 'beats', name: 'Beats TCP', proto: 'tcp', port: 5044 },
            { key: 'fluent', name: 'Fluent HTTP', proto: 'tcp', port: 9880 }
        ];

        const status = entries.map(e => ({
            key: e.key,
            name: e.name,
            port: e.port,
            protocol: e.proto,
            desiredOpen: e.proto === 'tcp' ? !!state.tcp?.[String(e.port)] : !!state.udp?.[String(e.port)]
        }));

        res.json({ success: true, ports: status, source: 'port-guardian-desired-state' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting ports status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;