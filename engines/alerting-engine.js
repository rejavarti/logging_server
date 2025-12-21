// engines/alerting-engine.js - Advanced Real-time Alerting Engine
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

/**
 * Advanced Real-time Alerting Engine
 * Handles sophisticated alert rules, notifications, and escalations with database persistence
 */
class AlertingEngine {
    constructor(database, loggers, config) {
        this.dal = database; // Use DAL instead of direct db
        this.loggers = loggers;
        this.config = config || {};
        this.rules = [];
        this.alertHistory = [];
        this.isRunning = false;
        this.thresholds = new Map(); // For rate-based alerts
        this.notificationChannels = new Map(); // Configured notification channels
        this.escalationManager = new Map(); // Active escalations
        
        // Initialize notification services
        this.emailTransporter = null;
        this.twilioClient = null;
        this.pushoverClient = null;
        
        // Don't initialize notification services in constructor - do it in initialize()
    }

    async initialize() {
        try {
            this.loggers.system.info('🚨 Initializing Enhanced Real-time Alerting Engine...');
            
            // Initialize notification services safely
            this.initializeNotificationServices();
            
            // Load rules and channels with fallback to defaults
            await this.loadAlertRulesFromDB();
            await this.loadNotificationChannelsFromDB();
            await this.initializeDefaultChannels();
            
            this.isRunning = true;
            this.loggers.system.info('✅ Enhanced Alerting Engine initialized successfully');
        } catch (error) {
            this.loggers.system.error('❌ Failed to initialize Alerting Engine:', error);
            // Initialize with defaults if database fails
            this.loadDefaultRules();
            this.isRunning = true;
            this.loggers.system.warn('⚠️ Alerting Engine initialized with default rules only');
        }
    }

    initializeNotificationServices() {
        try {
            // Initialize Email (nodemailer) - only if package is available
            const emailConfig = process.env.EMAIL_SMTP_HOST ? {
                host: process.env.EMAIL_SMTP_HOST,
                port: parseInt(process.env.EMAIL_SMTP_PORT) || 587,
                secure: process.env.EMAIL_SMTP_SECURE === 'true',
                auth: {
                    user: process.env.EMAIL_SMTP_USER,
                    pass: process.env.EMAIL_SMTP_PASS
                }
            } : null;

            if (emailConfig) {
                try {
                    this.emailTransporter = nodemailer.createTransporter(emailConfig);
                    this.loggers.system.info('📧 Email notifications configured');
                } catch (error) {
                    this.loggers.system.warn('📧 Nodemailer not available:', error.message);
                }
            }

            // Initialize Twilio (SMS) - optional dependency
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                try {
                    const twilio = require('twilio');
                    this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                    this.loggers.system.info('📱 SMS notifications configured');
                } catch (error) {
                    this.loggers.system.warn('📱 Twilio not available:', error.message);
                }
            }

            // Initialize Pushover - optional dependency
            if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER) {
                try {
                    const Pushover = require('pushover-notifications');
                    this.pushoverClient = new Pushover({
                        token: process.env.PUSHOVER_TOKEN,
                        user: process.env.PUSHOVER_USER
                    });
                    this.loggers.system.info('📢 Pushover notifications configured');
                } catch (error) {
                    this.loggers.system.warn('📢 Pushover not available:', error.message);
                }
            }
        } catch (error) {
            this.loggers.system.warn('⚠️ Notification services initialization failed:', error.message);
        }
    }

    async loadAlertRulesFromDB() {
        try {
            // Use DAL 'all' method for querying alert rules (PostgreSQL: enabled = TRUE)
            const rows = await this.dal.all('SELECT * FROM alert_rules WHERE enabled = TRUE');
            
            if (rows && rows.length > 0) {
                this.rules = rows.map(row => {
                    // Safely parse JSON fields with fallbacks
                    let condition = {};
                    let channels = [];
                    let escalationRules = null;
                    
                    try {
                        // Handle both text and jsonb types
                        if (row.condition && typeof row.condition === 'string') {
                            condition = JSON.parse(row.condition);
                        } else if (row.condition && typeof row.condition === 'object') {
                            condition = row.condition;
                        } else if (row.conditions) {
                            // Use conditions (jsonb) if condition (text) is empty
                            condition = row.conditions;
                        }
                    } catch (e) {
                        this.loggers.system.warn(`Failed to parse condition for rule ${row.id}: ${e.message}`);
                    }
                    
                    try {
                        if (row.channels && typeof row.channels === 'string') {
                            channels = JSON.parse(row.channels);
                        } else if (row.channels && typeof row.channels === 'object') {
                            channels = row.channels;
                        }
                    } catch (e) {
                        this.loggers.system.warn(`Failed to parse channels for rule ${row.id}: ${e.message}`);
                    }
                    
                    try {
                        if (row.escalation_rules && typeof row.escalation_rules === 'string') {
                            escalationRules = JSON.parse(row.escalation_rules);
                        } else if (row.escalation_rules && typeof row.escalation_rules === 'object') {
                            escalationRules = row.escalation_rules;
                        }
                    } catch (e) {
                        this.loggers.system.warn(`Failed to parse escalation_rules for rule ${row.id}: ${e.message}`);
                    }
                    
                    return {
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        type: row.type,
                        condition: condition,
                        channels: channels,
                        severity: row.severity,
                        enabled: Boolean(row.enabled),
                        cooldown: row.cooldown,
                        escalationRules: escalationRules,
                        lastTriggered: row.last_triggered,
                        triggerCount: row.trigger_count || 0
                    };
                });
                this.loggers.system.info(`📋 Loaded ${this.rules.length} alert rules from database`);
            } else {
                this.loggers.system.info('No alert rules in database, creating default rules...');
                await this.createDefaultRules();
            }
        } catch (error) {
            this.loggers.system.error('Failed to load alert rules from database:', error);
            this.loggers.system.info('Using default alert rules as fallback');
            this.loadDefaultRules();
        }
    }

    loadDefaultRules() {
        // Fallback default rules - same as before but enhanced with escalation
        this.rules = [
            {
                id: null, // Will be set by database
                name: 'Error Rate Spike',
                description: 'Detects when error rate exceeds threshold',
                type: 'rate',
                condition: {
                    severity: 'error',
                    count: 10,
                    timeWindow: 300
                },
                channels: ['default_email', 'slack'],
                severity: 'high',
                enabled: true,
                cooldown: 900,
                escalationRules: {
                    levels: [
                        { delay: 900, channels: ['email', 'sms'] },
                        { delay: 1800, channels: ['email', 'sms', 'pushover'] }
                    ]
                }
            },
            {
                id: null, // Will be set by database
                name: 'Security Event Detection',
                description: 'Detects security-related events and authentication failures',
                type: 'pattern',
                condition: {
                    categories: ['security', 'authentication'],
                    severity: ['error', 'critical'],
                    pattern: '(failed|unauthorized|denied|breach|attack|intrusion|suspicious)'
                },
                channels: ['default_email', 'slack'],
                severity: 'critical',
                enabled: true,
                cooldown: 300,
                escalationRules: {
                    levels: [
                        { delay: 300, channels: ['sms', 'pushover'] },
                        { delay: 600, channels: ['email', 'sms', 'pushover', 'slack'] }
                    ]
                }
            },
            {
                id: null, // Will be set by database
                name: 'Critical System Alert',
                description: 'Immediate notification for critical system events',
                type: 'pattern',
                condition: {
                    severity: 'critical',
                    pattern: '(down|offline|failure|crash|panic|emergency|outage)'
                },
                channels: ['default_email', 'sms', 'pushover'],
                severity: 'critical',
                enabled: true,
                cooldown: 0,
                escalationRules: {
                    levels: [
                        { delay: 0, channels: ['sms', 'pushover', 'email'] }
                    ]
                }
            },
            {
                id: null, // Will be set by database
                name: 'Device Connectivity Alert',
                description: 'Monitors device connectivity status',
                type: 'pattern',
                condition: {
                    event_type: 'device_status',
                    pattern: '(offline|disconnected|unreachable|timeout)'
                },
                channels: ['default_email'],
                severity: 'medium',
                enabled: true,
                cooldown: 1800
            }
        ];

        this.loggers.system.info(`📋 Loaded ${this.rules.length} default alert rules`);
    }

    async createDefaultRules() {
        this.loadDefaultRules();
        
        try {
            // Try to insert default rules into database if DAL supports it
            if (typeof this.dal.run === 'function') {
                for (let i = 0; i < this.rules.length; i++) {
                    const rule = this.rules[i];
                    try {
                        const query = `
                            INSERT INTO alert_rules (
                                name, description, type, conditions, actions, channels, severity, 
                                enabled, cooldown, escalation_rules, created_by, trigger_count
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        `;
                        
                        // Create default actions from channels
                        const actions = rule.channels.map(channel => ({
                            type: 'notify',
                            channel: channel,
                            template: 'default'
                        }));
                        
                        await this.dal.run(query, [
                            rule.name,
                            rule.description || '',
                            rule.type,
                            JSON.stringify(rule.condition),
                            JSON.stringify(actions),
                            JSON.stringify(rule.channels),
                            rule.severity,
                            rule.enabled ? true : false,
                            rule.cooldown,
                            rule.escalationRules ? JSON.stringify(rule.escalationRules) : null,
                            null, // set to null to avoid foreign key constraint until admin user exists
                            0
                        ]);
                        
                        // Assign a temporary ID for in-memory rules
                        this.rules[i].id = `default_${i + 1}`;
                    } catch (err) {
                        this.loggers.system.error(`Failed to insert default rule ${rule.name}:`, err);
                        // Assign temporary ID even if database insert fails
                        this.rules[i].id = `default_${i + 1}`;
                    }
                }
                this.loggers.system.info('✅ Default alert rules created in database');
            } else {
                // Just assign temporary IDs if no database access
                for (let i = 0; i < this.rules.length; i++) {
                    this.rules[i].id = `default_${i + 1}`;
                }
                this.loggers.system.info('✅ Default alert rules created in memory');
            }
        } catch (error) {
            this.loggers.system.error('Failed to create default rules in database:', error);
            // Ensure rules have IDs even if database operations fail
            for (let i = 0; i < this.rules.length; i++) {
                this.rules[i].id = `default_${i + 1}`;
            }
            this.loggers.system.info('✅ Default alert rules created in memory (database unavailable)');
        }
    }

    async loadNotificationChannelsFromDB() {
        try {
            // Use DAL 'all' method for querying notification channels
            const rows = await this.dal.all('SELECT * FROM notification_channels WHERE enabled = true');
            
            if (rows && rows.length > 0) {
                rows.forEach(row => {
                    this.notificationChannels.set(row.id, {
                        id: row.id,
                        name: row.name,
                        type: row.type,
                        config: JSON.parse(row.config || '{}'),
                        enabled: Boolean(row.enabled),
                        rateLimit: row.rate_limit,
                        lastUsed: row.last_used,
                        usageCount: row.usage_count || 0,
                        failureCount: row.failure_count || 0
                    });
                });
                this.loggers.system.info(`📢 Loaded ${this.notificationChannels.size} notification channels`);
            } else {
                this.loggers.system.info('No notification channels in database');
            }
        } catch (error) {
            this.loggers.system.error('Failed to load notification channels:', error);
        }
    }

    async initializeDefaultChannels() {
        // Create default email channel if configured
        if (this.emailTransporter && !this.notificationChannels.has('default_email')) {
            await this.createNotificationChannel({
                id: 'default_email',
                name: 'Default Email',
                type: 'email',
                config: {
                    from: process.env.EMAIL_FROM || 'alerts@enterprise-logging.local',
                    to: process.env.EMAIL_ALERTS_TO || 'admin@enterprise-logging.local',
                    subject_prefix: '[ALERT]'
                }
            });
        }

        // Create default SMS channel if configured
        if (this.twilioClient && process.env.SMS_ALERTS_TO && !this.notificationChannels.has('default_sms')) {
            await this.createNotificationChannel({
                id: 'default_sms',
                name: 'Default SMS',
                type: 'sms',
                config: {
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: process.env.SMS_ALERTS_TO
                }
            });
        }
    }

    async createNotificationChannel(channelData) {
        const channel = {
            id: channelData.id || crypto.randomUUID(),
            name: channelData.name,
            type: channelData.type,
            config: channelData.config,
            enabled: channelData.enabled !== false,
            rateLimit: channelData.rateLimit || 0,
            lastUsed: null,
            usageCount: 0,
            failureCount: 0
        };

        this.notificationChannels.set(channel.id, channel);

        // Save to database
        this.db.run(`
            INSERT INTO notification_channels 
            (id, name, type, config, enabled, rate_limit) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                config = EXCLUDED.config,
                enabled = EXCLUDED.enabled,
                rate_limit = EXCLUDED.rate_limit
        `, [
            channel.id,
            channel.name,
            channel.type,
            JSON.stringify(channel.config),
            channel.enabled ? 1 : 0,
            channel.rateLimit
        ]);

        return channel;
    }

    async processLogEvent(logEvent) {
        if (!this.isRunning) return;

        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            try {
                const shouldTrigger = await this.evaluateRule(rule, logEvent);
                if (shouldTrigger) {
                    await this.triggerAlert(rule, logEvent);
                    
                    // Update rule statistics
                    await this.updateRuleStats(rule.id);
                }
            } catch (error) {
                this.loggers.system.error(`Alert rule evaluation error for ${rule.id}:`, error);
            }
        }
    }

    async updateRuleStats(ruleId) {
        this.db.run(`
            UPDATE alert_rules 
            SET last_triggered = CURRENT_TIMESTAMP, trigger_count = trigger_count + 1 
            WHERE id = ?
        `, [ruleId]);
    }

    async evaluateRule(rule, logEvent) {
        const { condition } = rule;

        // Check cooldown
        if (this.isInCooldown(rule.id, rule.cooldown)) {
            return false;
        }

        switch (rule.type) {
            case 'pattern':
                return this.evaluatePatternRule(condition, logEvent);
            case 'rate':
                return this.evaluateRateRule(condition, logEvent, rule.id);
            default:
                return false;
        }
    }

    evaluatePatternRule(condition, logEvent) {
        // Check severity
        if (condition.severity) {
            const severities = Array.isArray(condition.severity) ? condition.severity : [condition.severity];
            if (!severities.includes(logEvent.severity)) {
                return false;
            }
        }

        // Check categories
        if (condition.categories) {
            if (!condition.categories.includes(logEvent.category)) {
                return false;
            }
        }

        // Check event type
        if (condition.event_type && logEvent.event_type !== condition.event_type) {
            return false;
        }

        // Check pattern in message
        if (condition.pattern) {
            const regex = new RegExp(condition.pattern, 'i');
            return regex.test(logEvent.message || '');
        }

        return true;
    }

    evaluateRateRule(condition, logEvent, ruleId) {
        // Check if this log matches the condition
        if (condition.severity && logEvent.severity !== condition.severity) {
            return false;
        }

        if (condition.category && logEvent.category !== condition.category) {
            return false;
        }

        // Track rate
        const now = Date.now();
        const windowStart = now - (condition.timeWindow * 1000);
        
        if (!this.thresholds.has(ruleId)) {
            this.thresholds.set(ruleId, []);
        }

        const events = this.thresholds.get(ruleId);
        
        // Add current event
        events.push(now);
        
        // Remove old events outside window
        const filteredEvents = events.filter(timestamp => timestamp > windowStart);
        this.thresholds.set(ruleId, filteredEvents);

        // Check if threshold is exceeded
        return filteredEvents.length >= condition.count;
    }

    isInCooldown(ruleId, cooldownSeconds) {
        if (cooldownSeconds === 0) return false;

        const lastAlert = this.alertHistory.find(alert => 
            alert.ruleId === ruleId && 
            (Date.now() - alert.timestamp) < (cooldownSeconds * 1000)
        );
        
        return !!lastAlert;
    }

    async triggerAlert(rule, logEvent) {
        const alertId = crypto.randomUUID();
        const alert = {
            id: alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            timestamp: Date.now(),
            logEvent,
            channels: rule.channels,
            status: 'triggered'
        };

        // Record alert in memory (for compatibility)
        this.alertHistory.push(alert);
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }

        // Save alert to database
        await this.saveAlertToDatabase(alert);

        this.loggers.security.info(`🚨 Alert triggered: ${rule.name} [${rule.severity.toUpperCase()}]`, {
            alertId: alertId,
            ruleId: rule.id,
            logEvent: {
                message: logEvent.message,
                severity: logEvent.severity,
                source: logEvent.source
            }
        });

        // Send notifications to all configured channels
        const notificationResults = {};
        for (const channelId of rule.channels) {
            try {
                const result = await this.sendNotification(channelId, alert);
                notificationResults[channelId] = result;
            } catch (error) {
                this.loggers.system.error(`Failed to send alert to channel ${channelId}:`, error);
                notificationResults[channelId] = { success: false, error: error.message };
            }
        }

        // Update alert with notification results
        await this.updateAlertNotificationResults(alertId, notificationResults);

        // Setup escalation if configured
        if (rule.escalationRules && rule.escalationRules.levels) {
            await this.scheduleEscalation(alertId, rule.escalationRules);
        }

        return alert;
    }

    async saveAlertToDatabase(alert) {
        const { logEvent } = alert;
        
        this.db.run(`
            INSERT INTO alert_history (
                id, rule_id, rule_name, severity, status, message, 
                log_event_data, channels_notified, triggered_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        `, [
            alert.id,
            alert.ruleId,
            alert.ruleName,
            alert.severity,
            alert.status,
            logEvent.message || 'No message',
            JSON.stringify(logEvent),
            JSON.stringify(alert.channels)
        ]);
    }

    async updateAlertNotificationResults(alertId, results) {
        this.db.run(`
            UPDATE alert_history 
            SET notification_results = $1 
            WHERE id = $2
        `, [JSON.stringify(results), alertId]);
    }

    async sendNotification(channelId, alert) {
        const channel = this.notificationChannels.get(channelId);
        if (!channel) {
            this.loggers.system.warn(`Unknown notification channel: ${channelId}`);
            return { success: false, error: 'Channel not found' };
        }

        if (!channel.enabled) {
            return { success: false, error: 'Channel disabled' };
        }

        // Check rate limiting
        if (channel.rateLimit > 0 && channel.lastUsed) {
            const timeSinceLastUse = Date.now() - new Date(channel.lastUsed).getTime();
            if (timeSinceLastUse < (channel.rateLimit * 1000)) {
                return { success: false, error: 'Rate limited' };
            }
        }

        const { logEvent, ruleName, severity } = alert;
        
        const message = {
            alertId: alert.id,
            title: `🚨 ${ruleName}`,
            description: logEvent.message || 'No message',
            severity: severity,
            logSeverity: logEvent.severity || 'unknown',
            source: logEvent.source || 'unknown',
            device: logEvent.device_id || 'unknown',
            timestamp: this.formatTimestamp(logEvent.timestamp || Date.now()),
            alertTime: this.formatTimestamp(alert.timestamp)
        };

        try {
            let result;
            switch (channel.type) {
                case 'email':
                    result = await this.sendEmailNotification(channel, message);
                    break;
                case 'sms':
                    result = await this.sendSMSNotification(channel, message);
                    break;
                case 'slack':
                    result = await this.sendSlackNotification(channel, message);
                    break;
                case 'discord':
                    result = await this.sendDiscordNotification(channel, message);
                    break;
                case 'webhook':
                    result = await this.sendWebhookNotification(channel, message);
                    break;
                case 'pushover':
                    result = await this.sendPushoverNotification(channel, message);
                    break;
                case 'telegram':
                    result = await this.sendTelegramNotification(channel, message);
                    break;
                default:
                    throw new Error(`Unsupported channel type: ${channel.type}`);
            }

            // Update channel usage statistics
            await this.updateChannelUsage(channelId, true);
            
            return { success: true, ...result };
        } catch (error) {
            this.loggers.system.error(`Failed to send ${channel.type} notification:`, error);
            await this.updateChannelUsage(channelId, false);
            return { success: false, error: error.message };
        }
    }

    async updateChannelUsage(channelId, success) {
        const updateQuery = success 
            ? 'UPDATE notification_channels SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1 WHERE id = $1'
            : 'UPDATE notification_channels SET failure_count = failure_count + 1 WHERE id = $1';
        
        this.db.run(updateQuery, [channelId]);
        
        // Update in-memory channel
        const channel = this.notificationChannels.get(channelId);
        if (channel) {
            if (success) {
                channel.lastUsed = new Date().toISOString();
                channel.usageCount++;
            } else {
                channel.failureCount++;
            }
        }
    }

    async sendEmailNotification(channel, message) {
        if (!this.emailTransporter) {
            throw new Error('Email transporter not configured');
        }

        const { config } = channel;
        const subject = `${config.subject_prefix || '[ALERT]'} ${message.title} - ${message.severity.toUpperCase()}`;
        
        const htmlBody = `
            <h2>${message.title}</h2>
            <p><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(message.severity)}">${message.severity.toUpperCase()}</span></p>
            <p><strong>Description:</strong> ${message.description}</p>
            <hr>
            <table style="border-collapse: collapse; width: 100%;">
                <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Log Severity:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${message.logSeverity}</td></tr>
                <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Source:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${message.source}</td></tr>
                <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Device:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${message.device}</td></tr>
                <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Timestamp:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${message.timestamp}</td></tr>
                <tr><td style="border: 1px solid #ddd; padding: 8px;"><strong>Alert ID:</strong></td><td style="border: 1px solid #ddd; padding: 8px;">${message.alertId}</td></tr>
            </table>
        `;

        const textBody = `
${message.title}

Severity: ${message.severity.toUpperCase()}
Description: ${message.description}

Details:
- Log Severity: ${message.logSeverity}
- Source: ${message.source}
- Device: ${message.device}
- Timestamp: ${message.timestamp}
- Alert ID: ${message.alertId}
        `.trim();

        const mailOptions = {
            from: config.from,
            to: config.to,
            subject: subject,
            text: textBody,
            html: htmlBody
        };

        const info = await this.emailTransporter.sendMail(mailOptions);
        return { messageId: info.messageId };
    }

    async sendSMSNotification(channel, message) {
        if (!this.twilioClient) {
            throw new Error('Twilio client not configured');
        }

        const { config } = channel;
        const smsBody = `🚨 ${message.title}\n\nSeverity: ${message.severity.toUpperCase()}\n${message.description}\n\nSource: ${message.source}\nTime: ${message.timestamp}`;

        const result = await this.twilioClient.messages.create({
            body: smsBody,
            from: config.from,
            to: config.to
        });

        return { messageId: result.sid };
    }

    async sendSlackNotification(channel, message) {
        const { config } = channel;
        if (!config.webhook_url) {
            throw new Error('Slack webhook URL not configured');
        }

        const payload = {
            text: message.title,
            attachments: [{
                color: this.getSeverityColor(message.severity),
                title: message.title,
                text: message.description,
                fields: [
                    { title: 'Alert Severity', value: message.severity.toUpperCase(), short: true },
                    { title: 'Log Severity', value: message.logSeverity, short: true },
                    { title: 'Source', value: message.source, short: true },
                    { title: 'Device', value: message.device, short: true },
                    { title: 'Timestamp', value: message.timestamp, short: false },
                    { title: 'Alert ID', value: message.alertId, short: false }
                ],
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        const response = await axios.post(config.webhook_url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        return { status: response.status };
    }

    getSeverityColor(severity) {
        const colors = {
            critical: '#dc2626', // red-600
            high: '#ef4444',     // red-500
            error: '#ef4444',    // red-500 (compatibility)
            medium: '#f59e0b',   // amber-500
            warning: '#f59e0b',  // amber-500 (compatibility)
            low: '#3b82f6',      // blue-500
            info: '#3b82f6',     // blue-500 (compatibility)
            debug: '#6b7280'     // gray-500
        };
        return colors[severity?.toLowerCase()] || colors.info;
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    getRules() {
        return this.rules || [];
    }
    
    getRule(ruleId) {
        return this.rules.find(rule => rule.id === ruleId);
    }
    
    async updateRule(ruleId, updates) {
        const rule = this.getRule(ruleId);
        if (!rule) return null;

        // Update in memory
        Object.assign(rule, updates);
        rule.updated_at = new Date().toISOString();

        // Update in database
        this.db.run(`
            UPDATE alert_rules 
            SET name = $1, description = $2, type = $3, condition = $4, channels = $5, 
                severity = $6, enabled = $7, cooldown = $8, escalation_rules = $9, updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
        `, [
            rule.name,
            rule.description || '',
            rule.type,
            JSON.stringify(rule.condition),
            JSON.stringify(rule.channels),
            rule.severity,
            rule.enabled ? 1 : 0,
            rule.cooldown,
            rule.escalationRules ? JSON.stringify(rule.escalationRules) : null,
            ruleId
        ]);

        return rule;
    }

    async getAlertHistory(limit = 50, filters = {}) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM alert_history';
            const params = [];
            const conditions = [];

            if (filters.severity) {
                conditions.push('severity = ?');
                params.push(filters.severity);
            }

            if (filters.status) {
                conditions.push('status = ?');
                params.push(filters.status);
            }

            if (filters.ruleId) {
                conditions.push('rule_id = ?');
                params.push(filters.ruleId);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY triggered_at DESC LIMIT $' + (params.length + 1);
            params.push(limit);

            this.db.all(query, params, (err, rows) => {
                if (err) return reject(err);

                const alerts = rows.map(row => ({
                    id: row.id,
                    ruleId: row.rule_id,
                    ruleName: row.rule_name,
                    severity: row.severity,
                    status: row.status,
                    message: row.message,
                    timestamp: new Date(row.triggered_at).getTime(),
                    logEvent: JSON.parse(row.log_event_data),
                    channelsNotified: JSON.parse(row.channels_notified || '[]'),
                    notificationResults: row.notification_results ? JSON.parse(row.notification_results) : {},
                    escalationLevel: row.escalation_level || 0,
                    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null
                }));

                resolve(alerts);
            });
        });
    }

    async getAlertStats() {
        return new Promise((resolve, reject) => {
            const queries = [
                { name: 'total', sql: 'SELECT COUNT(*) as count FROM alert_history' },
                { name: 'today', sql: "SELECT COUNT(*) as count FROM alert_history WHERE DATE(triggered_at) = DATE('now')" },
                { name: 'active', sql: "SELECT COUNT(*) as count FROM alert_history WHERE status = 'triggered'" },
                { name: 'resolved', sql: "SELECT COUNT(*) as count FROM alert_history WHERE status = 'resolved'" },
                { name: 'by_severity', sql: 'SELECT severity, COUNT(*) as count FROM alert_history GROUP BY severity' }
            ];

            const stats = {};
            let completed = 0;

            queries.forEach(({ name, sql }) => {
                this.db.all(sql, (err, rows) => {
                    if (err) return reject(err);

                    if (name === 'by_severity') {
                        stats[name] = rows.reduce((acc, row) => {
                            acc[row.severity] = row.count;
                            return acc;
                        }, {});
                    } else {
                        stats[name] = rows[0].count;
                    }

                    completed++;
                    if (completed === queries.length) {
                        resolve(stats);
                    }
                });
            });
        });
    }

    async getNotificationChannels() {
        return Array.from(this.notificationChannels.values());
    }

    // ============================================================================
    // ENHANCED ESCALATION MANAGEMENT (From Monolithic Server)
    // ============================================================================

    async scheduleEscalation(alertId, escalationRules) {
        const { levels } = escalationRules;
        
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const escalationId = crypto.randomUUID();
            const escalationTime = new Date(Date.now() + (level.delay * 1000));
            
            // Save escalation to database
            try {
                await this.dal.run(`
                    INSERT INTO alert_escalations 
                    (id, alert_id, level, channels, next_escalation_at) 
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    escalationId,
                    alertId,
                    i + 1,
                    JSON.stringify(level.channels),
                    escalationTime.toISOString()
                ]);

                // Schedule escalation
                setTimeout(async () => {
                    await this.executeEscalation(escalationId, alertId, i + 1, level.channels);
                }, level.delay * 1000);
                
                this.loggers.system.info(`📅 Scheduled escalation level ${i + 1} for alert ${alertId} in ${level.delay}s`);
            } catch (error) {
                this.loggers.system.error(`Failed to schedule escalation for alert ${alertId}:`, error);
            }
        }
    }

    async executeEscalation(escalationId, alertId, level, channels) {
        try {
            // Check if alert is still active (not resolved)
            const alert = await this.getAlertById(alertId);
            if (!alert || alert.status === 'resolved') {
                this.loggers.system.info(`Skipping escalation for resolved alert ${alertId}`);
                return;
            }

            this.loggers.system.info(`🔥 Executing escalation level ${level} for alert ${alertId}`);

            // Send escalation notifications
            const notificationResults = {};
            for (const channelId of channels) {
                try {
                    const escalationMessage = {
                        ...alert,
                        title: `🔥 ESCALATION Level ${level}: ${alert.ruleName}`,
                        description: `Alert has not been resolved and is being escalated.\n\nOriginal: ${alert.logEvent.message}`
                    };
                    
                    const result = await this.sendNotification(channelId, escalationMessage);
                    notificationResults[channelId] = result;
                } catch (error) {
                    this.loggers.system.error(`Failed escalation notification to ${channelId}:`, error);
                    notificationResults[channelId] = { success: false, error: error.message };
                }
            }

            // Update escalation status
            await this.dal.run(`
                UPDATE alert_escalations 
                SET notification_sent = 1, triggered_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [escalationId]);

            // Update alert escalation level
            await this.dal.run(`
                UPDATE alert_history 
                SET escalated_at = CURRENT_TIMESTAMP, escalation_level = $1 
                WHERE id = $2
            `, [level, alertId]);
            
        } catch (error) {
            this.loggers.system.error(`Error executing escalation ${escalationId}:`, error);
        }
    }

    async getAlertById(alertId) {
        try {
            const row = await this.dal.get('SELECT * FROM alert_history WHERE id = $1', [alertId]);
            
            if (row) {
                return {
                    id: row.id,
                    ruleId: row.rule_id,
                    ruleName: row.rule_name,
                    severity: row.severity,
                    status: row.status,
                    message: row.message,
                    logEvent: JSON.parse(row.log_event_data),
                    timestamp: new Date(row.triggered_at).getTime()
                };
            }
            return null;
        } catch (error) {
            this.loggers.system.error(`Error getting alert ${alertId}:`, error);
            return null;
        }
    }

    async resolveAlert(alertId, resolvedBy = 'system') {
        try {
            await this.dal.run(`
                UPDATE alert_history 
                SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP 
                WHERE id = $1 AND status != 'resolved'
            `, [alertId]);
            
            this.loggers.system.info(`✅ Resolved alert ${alertId} by ${resolvedBy}`);
        } catch (error) {
            this.loggers.system.error(`Error resolving alert ${alertId}:`, error);
        }
    }
}

module.exports = AlertingEngine;