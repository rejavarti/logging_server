const express = require('express');
const router = express.Router();

// Ingestion API endpoints
router.get('/ingestion/status', async (req, res) => {
    try {
        const status = {
            engines: [
                {
                    name: 'Syslog UDP',
                    protocol: 'syslog',
                    port: 514,
                    status: 'running',
                    messages_received: 12547,
                    messages_processed: 12543,
                    errors: 4,
                    last_message: '2024-11-02T06:27:45Z',
                    rate_limit: 1000,
                    current_rate: 23.4
                },
                {
                    name: 'Syslog TCP', 
                    protocol: 'syslog-tcp',
                    port: 601,
                    status: 'running',
                    messages_received: 8932,
                    messages_processed: 8930,
                    errors: 2,
                    last_message: '2024-11-02T06:27:50Z',
                    rate_limit: 1000,
                    current_rate: 15.8
                },
                {
                    name: 'GELF UDP',
                    protocol: 'gelf',
                    port: 12201,
                    status: 'running', 
                    messages_received: 5634,
                    messages_processed: 5634,
                    errors: 0,
                    last_message: '2024-11-02T06:27:40Z',
                    rate_limit: 1000,
                    current_rate: 8.2
                },
                {
                    name: 'GELF TCP',
                    protocol: 'gelf-tcp',
                    port: 12202,
                    status: 'running',
                    messages_received: 3421,
                    messages_processed: 3420,
                    errors: 1,
                    last_message: '2024-11-02T06:27:35Z',
                    rate_limit: 1000,
                    current_rate: 4.1
                },
                {
                    name: 'Beats TCP',
                    protocol: 'beats',
                    port: 5044,
                    status: 'running',
                    messages_received: 7823,
                    messages_processed: 7823,
                    errors: 0,
                    last_message: '2024-11-02T06:27:55Z',
                    rate_limit: 1000,
                    current_rate: 12.7
                },
                {
                    name: 'Fluent HTTP',
                    protocol: 'fluent',
                    port: 9880,
                    status: 'running',
                    messages_received: 4567,
                    messages_processed: 4565,
                    errors: 2,
                    last_message: '2024-11-02T06:27:30Z',
                    rate_limit: 1000,
                    current_rate: 6.8
                }
            ],
            summary: {
                total_received: 42924,
                total_processed: 42915,
                total_errors: 9,
                error_rate: 0.021,
                average_processing_time: 12.4,
                queue_size: 0,
                uptime: '2h 15m 32s'
            },
            health: 'healthy'
        };

        res.json({ success: true, status });
    } catch (error) {
        console.error('Error getting ingestion status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ingestion/test-parse', async (req, res) => {
    try {
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
                // Mock syslog parsing
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

        res.json({ 
            success: true, 
            parsed, 
            validation,
            suggested_fields: ['timestamp', 'level', 'component', 'host'],
            processing_time: Math.random() * 10 + 1
        });
    } catch (error) {
        console.error('Error testing parse:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get ingestion statistics
router.get('/ingestion/stats', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        
        // Generate mock statistics
        const stats = {
            period: period,
            total_messages: 42924,
            successful: 42915,
            failed: 9,
            by_protocol: {
                syslog: 21479,
                gelf: 9055,
                beats: 7823,
                fluent: 4567
            },
            by_hour: Array.from({ length: 24 }, (_, i) => ({
                hour: i,
                messages: Math.floor(Math.random() * 2000) + 500,
                errors: Math.floor(Math.random() * 10)
            })),
            top_sources: [
                { host: 'esp32-01.local', messages: 8934 },
                { host: 'firewall-01', messages: 7823 },
                { host: 'web-server-01', messages: 6512 },
                { host: 'database-01', messages: 4321 },
                { host: 'router-01', messages: 3456 }
            ],
            error_types: [
                { type: 'parse_error', count: 5 },
                { type: 'rate_limit_exceeded', count: 3 },
                { type: 'invalid_format', count: 1 }
            ]
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting ingestion stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;