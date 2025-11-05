const WebSocket = require('ws');
const mqtt = require('mqtt');
const crypto = require('crypto');
const moment = require('moment-timezone');

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
            
            this.loggers.system.info('✅ All integrations initialized');
        } catch (error) {
            this.loggers.system.error('❌ Integration initialization failed:', error);
        }
    }

    async initializeWebSocket() {
        try {
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