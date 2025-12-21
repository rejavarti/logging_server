// ============================================================================
// REAL-TIME LOG STREAMING ENGINE
// ============================================================================

const WebSocket = require('ws');

class RealTimeStreamingEngine {
    constructor(database, loggers, config) {
        this.dal = database;
        this.loggers = loggers;
        this.config = config;
        this.wsServer = null;
        this.clients = new Map();
        this.subscriptions = new Map();
        this.streamFilters = new Map();
        this.messageBuffer = [];
        this.bufferSize = 1000;
        this.rateLimitMap = new Map();
        this.maxClientsPerIP = 10;
        this.totalMaxClients = 500;
        this.statistics = {
            connectedClients: 0,
            totalMessages: 0,
            filteredMessages: 0,
            bytesTransferred: 0,
            connectionsCount: 0,
            disconnectionsCount: 0
        };
    }

    async initialize() {
        try {
            // Create streaming-related database tables
            await this.createStreamingSchema();
            
            // Initialize WebSocket server
            await this.initializeWebSocketServer();
            
            // Schedule cleanup tasks
            this.scheduleCleanupTasks();
            
            this.loggers.system.info('Real-time Streaming Engine initialized successfully');
            return true;
        } catch (error) {
            this.loggers.system.error('Failed to initialize Real-time Streaming Engine:', error);
            return false;
        }
    }

    async createStreamingSchema() {
        // Skip table creation for PostgreSQL - schema is created by postgres-schema.sql
        if (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
            this.loggers.system.info('✅ Streaming schema exists (PostgreSQL)');
            return;
        }

        const queries = [
            `CREATE TABLE IF NOT EXISTS streaming_sessions (
                id SERIAL PRIMARY KEY,
                client_id TEXT UNIQUE NOT NULL,
                ip_address TEXT NOT NULL,
                user_agent TEXT,
                connected_at TIMESTAMPTZ DEFAULT NOW(),
                disconnected_at TIMESTAMPTZ,
                duration_seconds INTEGER,
                messages_sent INTEGER DEFAULT 0,
                bytes_sent INTEGER DEFAULT 0,
                filter_rules TEXT,
                status TEXT DEFAULT 'active'
            )`,
            `CREATE TABLE IF NOT EXISTS streaming_filters (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                filter_criteria TEXT NOT NULL,
                created_by INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                is_public BOOLEAN DEFAULT false,
                usage_count INTEGER DEFAULT 0,
                FOREIGN KEY (created_by) REFERENCES users (id)
            )`,
            `CREATE TABLE IF NOT EXISTS streaming_statistics (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                connected_clients INTEGER,
                messages_per_second REAL,
                bytes_per_second REAL,
                average_latency_ms REAL,
                error_count INTEGER DEFAULT 0
            )`
        ];

        for (const query of queries) {
            await this.dal.run(query);
        }
    }

    async initializeWebSocketServer() {
        
        const wsPort = (this.config.integrations?.websocket?.port || 8080) + 1; // Use next port to avoid conflict
        
        this.wsServer = new WebSocket.Server({
            port: wsPort,
            perMessageDeflate: false,
            clientTracking: true,
            maxPayload: 1024 * 1024, // 1MB max message size
            verifyClient: (info) => {
                return this.verifyClient(info);
            }
        });

        this.wsServer.on('connection', (ws, request) => {
            this.handleClientConnection(ws, request);
        });

        this.wsServer.on('error', (error) => {
            this.loggers.system.error('WebSocket server error:', error);
        });

        this.loggers.system.info(`Real-time streaming server started on port ${wsPort}`);
    }

    verifyClient(info) {
        
        const ip = info.req.connection.remoteAddress || info.req.socket.remoteAddress;
        
        // Check rate limiting per IP
        const now = Date.now();
        if (!this.rateLimitMap.has(ip)) {
            this.rateLimitMap.set(ip, { connections: 0, lastReset: now });
        }
        
        const ipData = this.rateLimitMap.get(ip);
        
        // Reset counter every minute
        if (now - ipData.lastReset > 60000) {
            ipData.connections = 0;
            ipData.lastReset = now;
        }
        
        // Check per-IP client limit
        if (ipData.connections >= this.maxClientsPerIP) {
            this.loggers.security.warn(`WebSocket connection rejected - IP limit exceeded: ${ip}`);
            return false;
        }
        
        // Check total client limit
        if (this.wsServer.clients.size >= this.totalMaxClients) {
            this.loggers.security.warn(`WebSocket connection rejected - Total client limit exceeded`);
            return false;
        }
        
        return true;
    }

    handleClientConnection(ws, request) {
        
        const clientId = this.generateClientId();
        const ip = request.connection.remoteAddress || request.socket.remoteAddress;
        const userAgent = request.headers['user-agent'] || 'Unknown';
        
        // Update rate limiting
        const ipData = this.rateLimitMap.get(ip);
        if (ipData) ipData.connections++;
        
        // Initialize client data
        const clientData = {
            id: clientId,
            ip: ip,
            userAgent: userAgent,
            connectedAt: new Date(),
            messagesSent: 0,
            bytesSent: 0,
            filters: [],
            subscriptions: new Set()
        };
        
        this.clients.set(clientId, clientData);
        this.statistics.connectedClients++;
        this.statistics.connectionsCount++;

        // Store session in database
        this.createStreamingSession(clientData);

        // Set up message handlers
        ws.on('message', (data) => {
            this.handleClientMessage(clientId, data);
        });

        ws.on('close', (code, reason) => {
            this.handleClientDisconnection(clientId, code, reason);
        });

        ws.on('error', (error) => {
            this.loggers.system.error(`WebSocket client error for ${clientId}:`, error);
            this.handleClientDisconnection(clientId, 1006, 'Client error');
        });

        // Store WebSocket reference
        ws.clientId = clientId;
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'connection',
            status: 'connected',
            clientId: clientId,
            serverTime: new Date().toISOString(),
            capabilities: ['filtering', 'subscriptions', 'buffering']
        });

        this.loggers.system.info(`WebSocket client connected: ${clientId} from ${ip}`);
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async createStreamingSession(clientData) {
        try {
            await this.dal.run(`
                INSERT INTO streaming_sessions (
                    client_id, ip_address, user_agent, connected_at
                ) VALUES (?, ?, ?, ?)
            `, [clientData.id, clientData.ip, clientData.userAgent, clientData.connectedAt.toISOString()]);
        } catch (error) {
            this.loggers.system.error('Failed to create streaming session:', error);
        }
    }

    handleClientMessage(clientId, data) {
        try {
            
            
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);
            
            if (!client) return;

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscription(clientId, message);
                    break;
                case 'unsubscribe':
                    this.handleUnsubscription(clientId, message);
                    break;
                case 'filter':
                    this.handleFilterUpdate(clientId, message);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                case 'buffer_request':
                    this.sendBufferedMessages(clientId, message.count || 50);
                    break;
                default:
                    this.loggers.system.warn(`Unknown message type from ${clientId}: ${message.type}`);
            }
        } catch (error) {
            
            this.loggers.system.error(`Error handling message from ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid message format',
                timestamp: new Date().toISOString()
            });
        }
    }

    handleSubscription(clientId, message) {
        
        
        const client = this.clients.get(clientId);
        if (!client) return;

        const subscription = {
            id: message.subscription_id || this.generateSubscriptionId(),
            channels: message.channels || ['logs'],
            filters: message.filters || {},
            throttle: message.throttle || 0 // milliseconds
        };

        client.subscriptions.add(subscription.id);
        this.subscriptions.set(subscription.id, { clientId, ...subscription });

        this.sendToClient(clientId, {
            type: 'subscription_confirmed',
            subscription_id: subscription.id,
            channels: subscription.channels,
            timestamp: new Date().toISOString()
        });

        this.loggers.system.info(`Client ${clientId} subscribed to channels: ${subscription.channels.join(', ')}`);
    }

    handleUnsubscription(clientId, message) {
        
        
        const client = this.clients.get(clientId);
        if (!client) return;

        const subscriptionId = message.subscription_id;
        client.subscriptions.delete(subscriptionId);
        this.subscriptions.delete(subscriptionId);

        this.sendToClient(clientId, {
            type: 'unsubscription_confirmed',
            subscription_id: subscriptionId,
            timestamp: new Date().toISOString()
        });

        this.loggers.system.info(`Client ${clientId} unsubscribed from ${subscriptionId}`);
    }

    handleFilterUpdate(clientId, message) {
        
        
        const client = this.clients.get(clientId);
        if (!client) return;

        client.filters = message.filters || [];

        this.sendToClient(clientId, {
            type: 'filter_updated',
            filters: client.filters,
            timestamp: new Date().toISOString()
        });

        this.loggers.system.info(`Client ${clientId} updated filters`);
    }

    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    handleClientDisconnection(clientId, code, reason) {
        
        
        const client = this.clients.get(clientId);
        if (!client) return;

        const disconnectedAt = new Date();
        const duration = Math.floor((disconnectedAt - client.connectedAt) / 1000);

        // Update statistics
        this.statistics.connectedClients--;
        this.statistics.disconnectionsCount++;

        // Clean up subscriptions
        for (const subscriptionId of client.subscriptions) {
            this.subscriptions.delete(subscriptionId);
        }

        // Update rate limiting
        const ipData = this.rateLimitMap.get(client.ip);
        if (ipData) ipData.connections = Math.max(0, ipData.connections - 1);

        // Update database session
        this.updateStreamingSession(client, disconnectedAt, duration);

        // Remove client
        this.clients.delete(clientId);

        this.loggers.system.info(`WebSocket client disconnected: ${clientId} (duration: ${duration}s, code: ${code})`);
    }

    async updateStreamingSession(client, disconnectedAt, duration) {
        try {
            await this.dal.run(`
                UPDATE streaming_sessions 
                SET disconnected_at = ?, 
                    duration_seconds = ?,
                    messages_sent = ?,
                    bytes_sent = ?,
                    status = 'disconnected'
                WHERE client_id = ?
            `, [
                disconnectedAt.toISOString(),
                duration,
                client.messagesSent,
                client.bytesSent,
                client.id
            ]);
        } catch (error) {
            
            this.loggers.system.error('Failed to update streaming session:', error);
        }
    }

    broadcastLogEvent(logEvent) {
        // Add to buffer
        this.messageBuffer.push({
            ...logEvent,
            timestamp: new Date().toISOString(),
            stream_id: this.generateStreamId()
        });

        // Maintain buffer size
        if (this.messageBuffer.length > this.bufferSize) {
            this.messageBuffer = this.messageBuffer.slice(-this.bufferSize);
        }

        // Broadcast to subscribed clients
        const message = {
            type: 'log_event',
            data: logEvent,
            timestamp: new Date().toISOString()
        };

        let sentCount = 0;
        let filteredCount = 0;

        for (const [subscriptionId, subscription] of this.subscriptions) {
            const client = this.clients.get(subscription.clientId);
            if (!client) continue;

            // Check channel subscription
            if (!subscription.channels.includes('logs') && !subscription.channels.includes('all')) {
                continue;
            }

            // Apply filters
            if (!this.matchesFilters(logEvent, subscription.filters, client.filters)) {
                filteredCount++;
                continue;
            }

            // Send to client
            if (this.sendToClient(subscription.clientId, message)) {
                sentCount++;
            }
        }

        // Update statistics
        this.statistics.totalMessages++;
        this.statistics.filteredMessages += filteredCount;

        return { sent: sentCount, filtered: filteredCount };
    }

    matchesFilters(logEvent, subscriptionFilters, clientFilters) {
        // Combine subscription and client filters
        const allFilters = [...(subscriptionFilters || []), ...(clientFilters || [])];
        
        if (allFilters.length === 0) return true;

        for (const filter of allFilters) {
            if (!this.matchesFilter(logEvent, filter)) {
                return false;
            }
        }

        return true;
    }

    matchesFilter(logEvent, filter) {
        try {
            
            
            switch (filter.type) {
                case 'level':
                    return this.matchesLevelFilter(logEvent.severity || logEvent.level, filter.value);
                case 'source':
                    return this.matchesStringFilter(logEvent.source, filter.value, filter.operator);
                case 'message':
                    return this.matchesStringFilter(logEvent.message, filter.value, filter.operator);
                case 'timerange':
                    return this.matchesTimeRange(logEvent.timestamp, filter.from, filter.to);
                case 'custom':
                    return this.matchesCustomFilter(logEvent, filter.expression);
                default:
                    return true;
            }
        } catch (error) {
            
            this.loggers.system.error('Filter matching error:', error);
            return true; // Default to allowing the message
        }
    }

    matchesLevelFilter(logLevel, filterLevel) {
        const levels = ['debug', 'info', 'warn', 'error', 'critical'];
        const logIndex = levels.indexOf(logLevel?.toLowerCase());
        const filterIndex = levels.indexOf(filterLevel?.toLowerCase());
        return logIndex >= filterIndex;
    }

    matchesStringFilter(value, filterValue, operator = 'contains') {
        if (!value || !filterValue) return false;
        
        const str = value.toString().toLowerCase();
        const filter = filterValue.toString().toLowerCase();
        
        switch (operator) {
            case 'equals':
                return str === filter;
            case 'contains':
                return str.includes(filter);
            case 'starts_with':
                return str.startsWith(filter);
            case 'ends_with':
                return str.endsWith(filter);
            case 'regex':
                try {
                    return new RegExp(filter, 'i').test(str);
                } catch {
                    return false;
                }
            default:
                return str.includes(filter);
        }
    }

    matchesTimeRange(timestamp, from, to) {
        if (!timestamp) return false;
        
        const time = new Date(timestamp).getTime();
        const fromTime = from ? new Date(from).getTime() : 0;
        const toTime = to ? new Date(to).getTime() : Date.now();
        
        return time >= fromTime && time <= toTime;
    }

    matchesCustomFilter(logEvent, expression) {
        try {
            // Simple expression evaluation for basic custom filters
            // This could be expanded with a proper expression parser
            return Function('event', `return ${expression}`)(logEvent);
        } catch (error) {
            
            this.loggers.system.error('Custom filter evaluation error:', error);
            return false;
        }
    }

    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    sendToClient(clientId, message) {
        
        
        const client = this.clients.get(clientId);
        if (!client) return false;

        try {
            // Find the WebSocket connection
            let ws = null;
            for (const wsClient of this.wsServer.clients) {
                if (wsClient.clientId === clientId && wsClient.readyState === WebSocket.OPEN) {
                    ws = wsClient;
                    break;
                }
            }

            if (!ws) return false;

            const messageStr = JSON.stringify(message);
            const messageSize = Buffer.byteLength(messageStr, 'utf8');

            ws.send(messageStr);

            // Update client statistics
            client.messagesSent++;
            client.bytesSent += messageSize;
            this.statistics.bytesTransferred += messageSize;

            return true;
        } catch (error) {
            this.loggers.system.error(`Error sending message to client ${clientId}:`, error);
            return false;
        }
    }

    sendBufferedMessages(clientId, count = 50) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const messages = this.messageBuffer.slice(-Math.min(count, this.bufferSize));
        
        this.sendToClient(clientId, {
            type: 'buffered_messages',
            messages: messages,
            count: messages.length,
            timestamp: new Date().toISOString()
        });
    }

    scheduleCleanupTasks() {
        
        
        // Clean up old sessions every hour
        setInterval(async () => {
            await this.cleanupOldSessions();
        }, 60 * 60 * 1000);

        // Update statistics every minute
        setInterval(async () => {
            await this.updateStatistics();
        }, 60 * 1000);

        // Clean up rate limiting data every 5 minutes
        setInterval(() => {
            this.cleanupRateLimiting();
        }, 5 * 60 * 1000);
    }

    async cleanupOldSessions() {
        try {
            
            
            // Delete sessions older than 30 days
            await this.dal.run(`
                DELETE FROM streaming_sessions 
                WHERE connected_at < NOW() - INTERVAL '30 days'
            `);

            // Delete old statistics older than 7 days
            await this.dal.run(`
                DELETE FROM streaming_statistics 
                WHERE timestamp < NOW() - INTERVAL '7 days'
            `);

            this.loggers.system.info('Cleaned up old streaming sessions and statistics');
        } catch (error) {
            
            this.loggers.system.error('Failed to cleanup old streaming data:', error);
        }
    }

    async updateStatistics() {
        try {
            const connectedClients = this.statistics.connectedClients;
            const messagesPerSecond = this.statistics.totalMessages / 60; // Rough calculation
            const bytesPerSecond = this.statistics.bytesTransferred / 60;

            await this.dal.run(`
                INSERT INTO streaming_statistics (
                    connected_clients, messages_per_second, bytes_per_second
                ) VALUES (?, ?, ?)
            `, [connectedClients, messagesPerSecond, bytesPerSecond]);

            // Reset counters for next interval
            this.statistics.totalMessages = 0;
            this.statistics.bytesTransferred = 0;

        } catch (error) {
            
            this.loggers.system.error('Failed to update streaming statistics:', error);
        }
    }

    cleanupRateLimiting() {
        const now = Date.now();
        for (const [ip, data] of this.rateLimitMap) {
            if (now - data.lastReset > 300000) { // 5 minutes
                this.rateLimitMap.delete(ip);
            }
        }
    }

    async getStreamingStatistics() {
        try {
            const currentStats = {
                connectedClients: this.statistics.connectedClients,
                totalConnections: this.statistics.connectionsCount,
                totalDisconnections: this.statistics.disconnectionsCount,
                activeSubscriptions: this.subscriptions.size,
                bufferedMessages: this.messageBuffer.length,
                rateLimitedIPs: this.rateLimitMap.size
            };

            const recentStats = await this.dal.all(`
                SELECT * FROM streaming_statistics 
                WHERE timestamp > NOW() - INTERVAL '24 hours'
                ORDER BY timestamp DESC
                LIMIT 100
            `);

            const activeSessions = await this.dal.all(`
                SELECT * FROM streaming_sessions 
                WHERE status = 'active'
                ORDER BY connected_at DESC
            `);

            return {
                current: currentStats,
                recent: recentStats,
                activeSessions,
                serverInfo: {
                    port: this.wsServer ? this.wsServer.options.port : null,
                    maxClients: this.totalMaxClients,
                    maxClientsPerIP: this.maxClientsPerIP,
                    bufferSize: this.bufferSize
                }
            };
        } catch (error) {
            
            this.loggers.system.error('Failed to get streaming statistics:', error);
            return null;
        }
    }

    async createStreamingFilter(filterData) {
        try {
            const result = await this.dal.run(`
                INSERT INTO streaming_filters (
                    name, description, filter_criteria, created_by, is_public
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                filterData.name,
                filterData.description,
                JSON.stringify(filterData.criteria),
                filterData.created_by,
                filterData.is_public ? 1 : 0
            ]);

            return { success: true, id: result.lastID };
        } catch (error) {
            
            this.loggers.system.error('Failed to create streaming filter:', error);
            return { success: false, error: error.message };
        }
    }

    async getStreamingFilters(userId = null) {
        try {
            let query = `
                SELECT * FROM streaming_filters 
                WHERE is_public = 1
            `;
            let params = [];

            if (userId) {
                query += ` OR created_by = ?`;
                params.push(userId);
            }

            query += ` ORDER BY name`;

            const filters = await this.dal.all(query, params);
            return filters.map(filter => ({
                ...filter,
                filter_criteria: JSON.parse(filter.filter_criteria)
            }));
        } catch (error) {
            
            this.loggers.system.error('Failed to get streaming filters:', error);
            return [];
        }
    }

    shutdown() {
        
        
        if (this.wsServer) {
            // Notify all clients of shutdown
            for (const [clientId] of this.clients) {
                this.sendToClient(clientId, {
                    type: 'server_shutdown',
                    message: 'Server is shutting down',
                    timestamp: new Date().toISOString()
                });
            }

            // Close all connections
            this.wsServer.close(() => {
                this.loggers.system.info('Real-time streaming server shut down');
            });
        }
    }
}

module.exports = RealTimeStreamingEngine;
