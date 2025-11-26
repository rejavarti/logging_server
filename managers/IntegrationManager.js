const WebSocket = require('ws');
const mqtt = require('mqtt');
const crypto = require('crypto');
const moment = require('moment-timezone');
const axios = require('axios');

class IntegrationManager {
    constructor(config, loggers, logToDatabase, TIMEZONE) {
        this.config = config;
        this.loggers = loggers;
        this.logToDatabase = logToDatabase;
        this.TIMEZONE = TIMEZONE;
        this.connections = {};
        this.mqttClient = null;
        this.haWebSocket = null;
        this.unifiClient = null;
        this.wsServer = null;
        this.connectedClients = new Set();
        this.homeAssistantStatus = {
            enabled: Boolean(this.config?.integrations?.homeAssistant?.enabled),
            connected: false,
            lastSuccess: null,
            lastError: null,
            lastAttempt: null,
            mode: 'rest', // rest | websocket
            errorCount: 0
        };
    }

    async initialize() {
        this.loggers.system.info('🔌 Initializing integrations...');
        
        try {
            // Initialize WebSocket server
            if (this.config.integrations.websocket.enabled) {
                await this.initializeWebSocket();
            }
            
            // Initialize MQTT
            if (this.config.integrations.mqtt.enabled) {
                await this.initializeMQTT();
            }

            // Initialize Home Assistant (REST + optional WebSocket)
            if (this.config.integrations.homeAssistant.enabled) {
                await this.initializeHomeAssistant();
                this.initializeHomeAssistantHealthLoop();
            }
            
            this.loggers.system.info('✅ All integrations initialized');
        } catch (error) {
            this.loggers.system.error('❌ Integration initialization failed:', error);
        }
    }

    async initializeHomeAssistant() {
        try {
            const haCfg = this.config.integrations.homeAssistant;
            if (!haCfg.enabled) {
                this.loggers.system.info('⏭️ Home Assistant integration disabled');
                this.homeAssistantStatus.enabled = false;
                return;
            }
            if (!haCfg.host || !haCfg.token) {
                this.loggers.system.warn('⚠️ Home Assistant host or token missing; cannot connect');
                this.homeAssistantStatus.lastError = 'Missing host or token';
                return;
            }
            this.homeAssistantStatus.lastAttempt = new Date().toISOString();
            // Basic REST connectivity test
            const url = haCfg.host.replace(/\/$/, '') + '/api/config';
            this.loggers.system.info(`🔗 Connecting to Home Assistant (REST): ${url}`);
            const resp = await axios.get(url, {
                headers: { Authorization: `Bearer ${haCfg.token}` },
                timeout: 5000
            });
            if (resp.status === 200) {
                this.homeAssistantStatus.connected = true;
                this.homeAssistantStatus.lastSuccess = new Date().toISOString();
                this.homeAssistantStatus.lastError = null;
                this.loggers.system.info('✅ Home Assistant REST connectivity verified');
            } else {
                this.homeAssistantStatus.connected = false;
                this.homeAssistantStatus.lastError = `Unexpected status ${resp.status}`;
                this.homeAssistantStatus.errorCount++;
                this.loggers.system.warn(`⚠️ Home Assistant connectivity failed: status ${resp.status}`);
            }
            // Optional WebSocket auth handshake
            if (haCfg.websocketEnabled) {
                await this.connectHomeAssistantWebSocket();
            }
        } catch (error) {
            this.homeAssistantStatus.connected = false;
            this.homeAssistantStatus.lastError = error.message;
            this.homeAssistantStatus.errorCount++;
            this.loggers.system.warn('❌ Home Assistant connection error:', error.message);
        }
    }

    async connectHomeAssistantWebSocket() {
        try {
            const haCfg = this.config.integrations.homeAssistant;
            const base = haCfg.host.replace(/\/$/, '');
            const wsUrl = base.startsWith('https://')
                ? 'wss://' + base.substring('https://'.length) + '/api/websocket'
                : base.startsWith('http://')
                    ? 'ws://' + base.substring('http://'.length) + '/api/websocket'
                    : base + '/api/websocket';
            this.loggers.system.info(`🔗 Home Assistant WebSocket attempting: ${wsUrl}`);
            const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
            this.haWebSocket = ws;
            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'auth', access_token: haCfg.token }));
            });
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'auth_ok') {
                        this.homeAssistantStatus.connected = true;
                        this.homeAssistantStatus.mode = 'websocket';
                        this.homeAssistantStatus.lastSuccess = new Date().toISOString();
                        this.homeAssistantStatus.lastError = null;
                        this.loggers.system.info('✅ Home Assistant WebSocket authenticated');
                    } else if (msg.type === 'auth_invalid') {
                        this.homeAssistantStatus.connected = false;
                        this.homeAssistantStatus.lastError = 'Invalid token';
                        this.loggers.system.error('❌ Home Assistant WebSocket auth invalid');
                        ws.close();
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            });
            ws.on('error', (err) => {
                this.loggers.system.warn('Home Assistant WebSocket error:', err.message);
            });
            ws.on('close', () => {
                this.loggers.system.info('Home Assistant WebSocket closed');
            });
        } catch (error) {
            this.loggers.system.warn('Home Assistant WebSocket connection failed:', error.message);
        }
    }

    initializeHomeAssistantHealthLoop() {
        // Periodic health check (REST)
        setInterval(async () => {
            if (!this.config.integrations.homeAssistant.enabled) return;
            await this.initializeHomeAssistant();
        }, 60000);
    }

    updateHomeAssistantConfig(updates = {}) {
        // Merge updates into runtime config and attempt reconnect
        Object.assign(this.config.integrations.homeAssistant, updates);
        this.homeAssistantStatus.enabled = Boolean(this.config.integrations.homeAssistant.enabled);
        this.loggers.system.info('🔄 Home Assistant config updated; reinitializing integration');
        this.initializeHomeAssistant();
    }

    async initializeWebSocket() {
        try {
            if (process.env.NODE_ENV === 'test' || process.env.TEST_DISABLE_NETWORK === 'true') {
                this.loggers.system.warn('⏭️ Skipping WebSocket server startup in test mode');
                return;
            }
            this.wsServer = new WebSocket.Server({ port: this.config.integrations.websocket.port });
            
            this.wsServer.on('connection', (ws, req) => {
                const clientId = crypto.randomUUID();
                this.connectedClients.add(ws);
                
                this.loggers.system.info(`🔗 WebSocket client connected: ${clientId}`);
                
                ws.on('close', () => {
                    this.connectedClients.delete(ws);
                    this.loggers.system.info(`🔌 WebSocket client disconnected: ${clientId}`);
                });
                
                ws.on('error', (error) => {
                    this.loggers.system.error(`WebSocket error for ${clientId}:`, error);
                });
                
                // Send welcome message
                ws.send(JSON.stringify({
                    type: 'connection',
                    message: 'Connected to Enterprise Logging Platform',
                    timestamp: moment().tz(this.TIMEZONE).toISOString()
                }));
            });
            
            this.loggers.system.info(`✅ WebSocket server running on port ${this.config.integrations.websocket.port}`);
        } catch (error) {
            this.loggers.system.error('❌ WebSocket initialization failed:', error);
        }
    }

    async initializeMQTT() {
        try {
            if (process.env.NODE_ENV === 'test' || process.env.TEST_DISABLE_NETWORK === 'true') {
                this.loggers.system.warn('⏭️ Skipping MQTT connection in test mode');
                return;
            }
            this.loggers.system.info('🔗 Connecting to MQTT broker...');
            
            const mqttOptions = {};
            if (this.config.integrations.mqtt.username) {
                mqttOptions.username = this.config.integrations.mqtt.username;
                mqttOptions.password = this.config.integrations.mqtt.password;
            }
            
            this.mqttClient = mqtt.connect(this.config.integrations.mqtt.broker, mqttOptions);
            
            this.mqttClient.on('connect', () => {
                this.loggers.system.info('✅ MQTT connected successfully');
                
                // Subscribe to configured topics
                this.config.integrations.mqtt.topics.forEach(topic => {
                    this.mqttClient.subscribe(topic);
                    this.loggers.system.info(`📡 Subscribed to MQTT topic: ${topic}`);
                });
            });
            
            this.mqttClient.on('message', (topic, message) => {
                // Process MQTT message and log to database
                this.processMQTTMessage(topic, message);
            });
            
            this.mqttClient.on('error', (error) => {
                this.loggers.system.error('❌ MQTT connection error:', error);
            });
        } catch (error) {
            this.loggers.system.error('❌ MQTT initialization failed:', error);
        }
    }

    processMQTTMessage(topic, message) {
        try {
            const messageStr = message.toString();
            let logData;
            
            try {
                logData = JSON.parse(messageStr);
            } catch {
                logData = { message: messageStr };
            }
            
            // Create standardized log entry
            const logEntry = {
                timestamp: new Date().toISOString(),
                source: topic,
                message: logData.message || messageStr,
                level: logData.level || 'info',
                category: 'mqtt',
                data: logData
            };
            
            // Store in database
            this.logToDatabase(logEntry.message, logEntry.level, logEntry.category, logEntry.source);
            
            // Broadcast to WebSocket clients
            this.broadcastToWebSockets({
                type: 'mqtt_message',
                topic: topic,
                data: logEntry
            });
            
        } catch (error) {
            this.loggers.system.error('Error processing MQTT message:', error);
        }
    }

    broadcastToWebSockets(data) {
        if (this.connectedClients.size === 0) return;
        
        const message = JSON.stringify(data);
        this.connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    getStatus() {
        return {
            websocket: {
                enabled: this.config.integrations.websocket.enabled,
                connected: this.wsServer ? true : false,
                clients: this.connectedClients.size
            },
            mqtt: {
                enabled: this.config.integrations.mqtt.enabled,
                connected: this.mqttClient ? this.mqttClient.connected : false,
                broker: this.config.integrations.mqtt.broker
            },
            homeAssistant: {
                enabled: this.homeAssistantStatus.enabled,
                connected: this.homeAssistantStatus.connected,
                lastSuccess: this.homeAssistantStatus.lastSuccess,
                lastError: this.homeAssistantStatus.lastError,
                mode: this.homeAssistantStatus.mode,
                errorCount: this.homeAssistantStatus.errorCount
            }
        };
    }

    async checkIntegrationHealth(name) {
        const status = this.getStatus();
        return status[name] || { enabled: false, connected: false };
    }

    async checkAllIntegrationsHealth() {
        return this.getStatus();
    }

    initializeHealthChecks() {
        this.loggers.system.info('🏥 Initializing integration health checks...');
        
        // Set up periodic health checks for all integrations
        setInterval(async () => {
            try {
                const healthStatus = await this.checkAllIntegrationsHealth();
                
                // Log health status to database
                Object.entries(healthStatus).forEach(([integration, status]) => {
                    if (!status.connected && status.enabled) {
                        this.loggers.system.warn(`⚠️ Integration ${integration} is enabled but not connected`);
                    }
                });
                
            } catch (error) {
                this.loggers.system.error('Health check failed:', error);
            }
        }, 60000); // Check every minute
        
        this.loggers.system.info('✅ Integration health checks initialized');
    }
}

module.exports = IntegrationManager;