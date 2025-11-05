// ============================================================================
// MULTI-PROTOCOL LOG INGESTION ENGINE
// ============================================================================

const dgram = require('dgram');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class MultiProtocolIngestionEngine extends EventEmitter {
    constructor(database, loggers, config) {
        super();
        this.dal = database;
        this.loggers = loggers;
        this.config = config || {};
        this.servers = new Map();
        this.parsers = new Map();
        this.stats = {
            totalMessages: 0,
            messagesByProtocol: {},
            errors: 0,
            bytesReceived: 0,
            connectionsActive: 0
        };
        this.setupParsers();
    }

    setupParsers() {
        // Syslog RFC3164 Parser
        this.parsers.set('syslog-rfc3164', this.parseSyslogRFC3164.bind(this));
        
        // Syslog RFC5424 Parser  
        this.parsers.set('syslog-rfc5424', this.parseSyslogRFC5424.bind(this));
        
        // GELF Parser
        this.parsers.set('gelf', this.parseGELF.bind(this));
        
        // Beats Protocol Parser
        this.parsers.set('beats', this.parseBeats.bind(this));
        
        // Fluent Bit Parser
        this.parsers.set('fluent', this.parseFluentBit.bind(this));
        
        // JSON Parser
        this.parsers.set('json', this.parseJSON.bind(this));
    }

    async initialize() {
        try {
            this.loggers.system.info('🌐 Initializing Multi-Protocol Log Ingestion Engine...');
            
            // Start Syslog UDP Server (RFC3164/5424)
            await this.startSyslogUDPServer();
            
            // Start Syslog TCP Server (RFC3164/5424)
            await this.startSyslogTCPServer();
            
            // Start GELF UDP Server
            await this.startGELFUDPServer();
            
            // Start GELF TCP Server  
            await this.startGELFTCPServer();
            
            // Start Beats TCP Server
            await this.startBeatsTCPServer();
            
            // Start Fluent Bit HTTP Server
            await this.startFluentBitHTTPServer();
            
            this.loggers.system.info('✅ Multi-Protocol Log Ingestion Engine initialized');
            this.loggers.system.info(`   • Syslog UDP: Port ${this.config.ingestion?.syslog?.udpPort || 514}`);
            this.loggers.system.info(`   • Syslog TCP: Port ${this.config.ingestion?.syslog?.tcpPort || 601}`);
            this.loggers.system.info(`   • GELF UDP: Port ${this.config.ingestion?.gelf?.udpPort || 12201}`);
            this.loggers.system.info(`   • GELF TCP: Port ${this.config.ingestion?.gelf?.tcpPort || 12202}`);
            this.loggers.system.info(`   • Beats TCP: Port ${this.config.ingestion?.beats?.tcpPort || 5044}`);
            this.loggers.system.info(`   • Fluent HTTP: Port ${this.config.ingestion?.fluent?.httpPort || 9880}`);
            
            return true;
        } catch (error) {
            this.loggers.system.error('❌ Multi-Protocol Ingestion Engine initialization failed:', error);
            this.loggers.system.warn('⚠️ Multi-Protocol Ingestion Engine will run in disabled mode');
            return false;
        }
    }

    async startSyslogUDPServer() {
        const port = this.config.ingestion?.syslog?.udpPort || 514;
        
        return new Promise((resolve, reject) => {
            const server = dgram.createSocket('udp4');
            
            server.on('message', (msg, rinfo) => {
                this.handleSyslogMessage(msg.toString(), rinfo, 'udp');
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('Syslog UDP Server error:', error);
                reject(error);
            });
            
            server.bind(port, () => {
                this.servers.set('syslog-udp', server);
                this.loggers.system.info(`Syslog UDP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async startSyslogTCPServer() {
        const port = this.config.ingestion?.syslog?.tcpPort || 601;
        
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket) => {
                socket.on('data', (data) => {
                    this.handleSyslogMessage(data.toString(), socket.remoteAddress, 'tcp');
                });
                
                socket.on('error', (error) => {
                    this.loggers.system.error('Syslog TCP socket error:', error);
                });
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('Syslog TCP Server error:', error);
                reject(error);
            });
            
            server.listen(port, () => {
                this.servers.set('syslog-tcp', server);
                this.loggers.system.info(`Syslog TCP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async startGELFUDPServer() {
        const port = this.config.ingestion?.gelf?.udpPort || 12201;
        
        return new Promise((resolve, reject) => {
            const server = dgram.createSocket('udp4');
            
            server.on('message', (msg, rinfo) => {
                this.handleGELFMessage(msg, rinfo, 'udp');
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('GELF UDP Server error:', error);
                reject(error);
            });
            
            server.bind(port, () => {
                this.servers.set('gelf-udp', server);
                this.loggers.system.info(`GELF UDP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async startGELFTCPServer() {
        const port = this.config.ingestion?.gelf?.tcpPort || 12202;
        
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket) => {
                let buffer = '';
                
                socket.on('data', (data) => {
                    buffer += data.toString();
                    const messages = buffer.split('\n');
                    buffer = messages.pop() || ''; // Keep incomplete message
                    
                    messages.forEach(message => {
                        if (message.trim()) {
                            this.handleGELFMessage(Buffer.from(message), socket.remoteAddress, 'tcp');
                        }
                    });
                });
                
                socket.on('error', (error) => {
                    
                    this.loggers.system.error('GELF TCP socket error:', error);
                });
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('GELF TCP Server error:', error);
                reject(error);
            });
            
            server.listen(port, () => {
                this.servers.set('gelf-tcp', server);
                this.loggers.system.info(`GELF TCP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async startBeatsTCPServer() {
        
        
        const port = this.config.ingestion?.beats?.tcpPort || 5044;
        
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket) => {
                socket.on('data', (data) => {
                    this.handleBeatsMessage(data, socket.remoteAddress);
                });
                
                socket.on('error', (error) => {
                    this.loggers.system.error('Beats TCP socket error:', error);
                });
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('Beats TCP Server error:', error);
                reject(error);
            });
            
            server.listen(port, () => {
                this.servers.set('beats-tcp', server);
                this.loggers.system.info(`Beats TCP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async startFluentBitHTTPServer() {
        
        
        const port = this.config.ingestion?.fluent?.httpPort || 9880;
        
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                if (req.method === 'POST') {
                    let body = '';
                    
                    req.on('data', (chunk) => {
                        body += chunk.toString();
                    });
                    
                    req.on('end', () => {
                        this.handleFluentBitMessage(body, req.connection.remoteAddress);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'ok' }));
                    });
                } else {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                }
            });
            
            server.on('error', (error) => {
                this.loggers.system.error('Fluent HTTP Server error:', error);
                reject(error);
            });
            
            server.listen(port, () => {
                this.servers.set('fluent-http', server);
                this.loggers.system.info(`Fluent HTTP server listening on port ${port}`);
                resolve();
            });
        });
    }

    handleSyslogMessage(message, remoteInfo, protocol) {
        try {
            
            this.updateStats('syslog', message.length);
            
            // Try RFC5424 first, then RFC3164
            let parsed = this.parseSyslogRFC5424(message);
            if (!parsed) {
                parsed = this.parseSyslogRFC3164(message);
            }
            
            if (parsed) {
                parsed.protocol = 'syslog';
                parsed.transport = protocol;
                parsed.source_ip = typeof remoteInfo === 'string' ? remoteInfo : remoteInfo.address;
                parsed.received_at = new Date().toISOString();
                
                this.emit('log', parsed);
            } else {
                this.loggers.system.warn('Failed to parse syslog message:', message.substring(0, 100));
            }
        } catch (error) {
            
            this.loggers.system.error('Error handling syslog message:', error);
            this.stats.errors++;
        }
    }

    handleGELFMessage(buffer, remoteInfo, protocol) {
        try {
            
            this.updateStats('gelf', buffer.length);
            
            // Check if message is compressed
            let message;
            if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
                // Gzip compressed
                const zlib = require('zlib');
                message = zlib.gunzipSync(buffer).toString();
            } else {
                message = buffer.toString();
            }
            
            const parsed = this.parseGELF(message);
            if (parsed) {
                parsed.protocol = 'gelf';
                parsed.transport = protocol;
                parsed.source_ip = typeof remoteInfo === 'string' ? remoteInfo : remoteInfo.address;
                parsed.received_at = new Date().toISOString();
                
                this.emit('log', parsed);
            } else {
                this.loggers.system.warn('Failed to parse GELF message');
            }
        } catch (error) {
            
            this.loggers.system.error('Error handling GELF message:', error);
            this.stats.errors++;
        }
    }

    handleBeatsMessage(data, remoteAddress) {
        try {
            
            this.updateStats('beats', data.length);
            
            // Beats protocol uses JSON over TCP
            const message = data.toString();
            const parsed = this.parseBeats(message);
            
            if (parsed) {
                parsed.protocol = 'beats';
                parsed.transport = 'tcp';
                parsed.source_ip = remoteAddress;
                parsed.received_at = new Date().toISOString();
                
                this.emit('log', parsed);
            } else {
                this.loggers.system.warn('Failed to parse Beats message');
            }
        } catch (error) {
            
            this.loggers.system.error('Error handling Beats message:', error);
            this.stats.errors++;
        }
    }

    handleFluentBitMessage(body, remoteAddress) {
        try {
            
            this.updateStats('fluent', body.length);
            
            const parsed = this.parseFluentBit(body);
            if (parsed) {
                parsed.protocol = 'fluent';
                parsed.transport = 'http';
                parsed.source_ip = remoteAddress;
                parsed.received_at = new Date().toISOString();
                
                this.emit('log', parsed);
            } else {
                this.loggers.system.warn('Failed to parse Fluent message');
            }
        } catch (error) {
            
            this.loggers.system.error('Error handling Fluent message:', error);
            this.stats.errors++;
        }
    }

    parseSyslogRFC3164(message) {
        // RFC3164: <priority>timestamp hostname tag: content
        const rfc3164Regex = /^<(\d+)>(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):\s*(.*)$/;
        const match = message.match(rfc3164Regex);
        
        if (!match) return null;
        
        const [, priority, timestamp, hostname, tag, content] = match;
        
        return {
            priority: parseInt(priority),
            facility: Math.floor(priority / 8),
            severity: priority % 8,
            level: this.severityToLevel(priority % 8),
            timestamp: this.parseRFC3164Timestamp(timestamp),
            hostname: hostname,
            tag: tag,
            message: content.trim(),
            source: hostname
        };
    }

    parseSyslogRFC5424(message) {
        // RFC5424: <priority>version timestamp hostname app-name procid msgid structured-data msg
        const rfc5424Regex = /^<(\d+)>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S*)\s*(.*)$/;
        const match = message.match(rfc5424Regex);
        
        if (!match) return null;
        
        const [, priority, version, timestamp, hostname, appName, procId, msgId, structuredData, msg] = match;
        
        return {
            priority: parseInt(priority),
            facility: Math.floor(priority / 8),
            severity: priority % 8,
            level: this.severityToLevel(priority % 8),
            version: parseInt(version),
            timestamp: timestamp !== '-' ? timestamp : new Date().toISOString(),
            hostname: hostname !== '-' ? hostname : 'unknown',
            app_name: appName !== '-' ? appName : null,
            proc_id: procId !== '-' ? procId : null,
            msg_id: msgId !== '-' ? msgId : null,
            structured_data: structuredData !== '-' ? structuredData : null,
            message: msg.trim(),
            source: hostname !== '-' ? hostname : 'unknown'
        };
    }

    parseGELF(message) {
        try {
            const data = JSON.parse(message);
            
            // GELF required fields: version, host, short_message, timestamp
            if (!data.version || !data.host || !data.short_message) {
                return null;
            }
            
            return {
                version: data.version,
                hostname: data.host,
                message: data.short_message,
                full_message: data.full_message,
                timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString(),
                level: this.gelfLevelToSyslog(data.level || 6),
                facility: data.facility || 'gelf',
                line: data.line,
                file: data.file,
                source: data.host,
                ...Object.keys(data).reduce((acc, key) => {
                    if (key.startsWith('_')) {
                        acc[key.substring(1)] = data[key];
                    }
                    return acc;
                }, {})
            };
        } catch (error) {
            return null;
        }
    }

    parseBeats(message) {
        try {
            // Beats can send multiple JSON objects separated by newlines
            const lines = message.trim().split('\n');
            const events = [];
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const data = JSON.parse(line);
                
                events.push({
                    timestamp: data['@timestamp'] || new Date().toISOString(),
                    message: data.message || JSON.stringify(data),
                    source: data.beat?.hostname || data.host?.name || 'beats',
                    level: 'info',
                    fields: data.fields || {},
                    beat_type: data.beat?.name,
                    beat_version: data.beat?.version,
                    original: data
                });
            }
            
            return events.length === 1 ? events[0] : events;
        } catch (error) {
            return null;
        }
    }

    parseFluentBit(message) {
        try {
            const data = JSON.parse(message);
            
            // Fluent Bit can send array of [timestamp, record] or single record
            if (Array.isArray(data)) {
                return data.map(([timestamp, record]) => ({
                    timestamp: new Date(timestamp * 1000).toISOString(),
                    message: record.message || JSON.stringify(record),
                    source: record.source || 'fluent',
                    level: record.level || 'info',
                    tag: record.tag,
                    original: record
                }));
            } else {
                return {
                    timestamp: data.timestamp || new Date().toISOString(),
                    message: data.message || JSON.stringify(data),
                    source: data.source || 'fluent',
                    level: data.level || 'info',
                    tag: data.tag,
                    original: data
                };
            }
        } catch (error) {
            return null;
        }
    }

    parseJSON(message) {
        try {
            const data = JSON.parse(message);
            
            return {
                timestamp: data.timestamp || data.time || data['@timestamp'] || new Date().toISOString(),
                message: data.message || data.msg || JSON.stringify(data),
                level: data.level || data.severity || 'info',
                source: data.source || data.hostname || data.host || 'json',
                original: data
            };
        } catch (error) {
            return null;
        }
    }

    parseRFC3164Timestamp(timestamp) {
        // Convert RFC3164 timestamp (MMM DD HH:mm:ss) to ISO string
        const currentYear = new Date().getFullYear();
        const dateStr = `${currentYear} ${timestamp}`;
        const date = new Date(dateStr);
        
        // If the parsed date is in the future, assume it's from last year
        if (date > new Date()) {
            date.setFullYear(currentYear - 1);
        }
        
        return date.toISOString();
    }

    severityToLevel(severity) {
        const levels = {
            0: 'emergency',
            1: 'alert',
            2: 'critical',
            3: 'error',
            4: 'warning',
            5: 'notice',
            6: 'info',
            7: 'debug'
        };
        return levels[severity] || 'info';
    }

    gelfLevelToSyslog(level) {
        // GELF levels: 0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug
        return this.severityToLevel(level);
    }

    updateStats(protocol, bytes) {
        this.stats.totalMessages++;
        this.stats.bytesReceived += bytes;
        
        if (!this.stats.messagesByProtocol[protocol]) {
            this.stats.messagesByProtocol[protocol] = 0;
        }
        this.stats.messagesByProtocol[protocol]++;
    }

    getStatistics() {
        return {
            ...this.stats,
            uptime: process.uptime(),
            servers: Array.from(this.servers.keys()),
            parsers: Array.from(this.parsers.keys())
        };
    }

    async shutdown() {
        
        
        try {
            this.loggers.system.info('Shutting down Multi-Protocol Ingestion Engine...');
            
            // Close all servers
            for (const [name, server] of this.servers) {
                try {
                    if (server.close) {
                        server.close();
                    }
                    this.loggers.system.info(`Closed ${name} server`);
                } catch (error) {
                    this.loggers.system.error(`Error closing ${name} server:`, error);
                }
            }
            
            this.servers.clear();
            this.loggers.system.info('Multi-Protocol Ingestion Engine shutdown complete');
            
        } catch (error) {
            this.loggers.system.error('Error during Multi-Protocol Ingestion Engine shutdown:', error);
            throw error;
        }
    }
}

module.exports = MultiProtocolIngestionEngine;
