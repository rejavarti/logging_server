const winston = require('winston');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Pushover = require('pushover-notifications');
const axios = require('axios');

/**
 * Real-time Alerting Engine
 * Extracted from monolithic server.js for better maintainability
 * 
 * Features:
 * - Pattern-based alerts (error detection, keyword matching)
 * - Rate-based alerts (threshold monitoring)
 * - Multi-channel notifications (email, SMS, Slack, Discord, webhooks)
 * - Alert escalation and cooldowns
 * - Database persistence for rules and history
 */
class AlertingEngine {
    constructor(database, loggers) {
        this.db = database;
        this.loggers = loggers;
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
        
        this.initializeNotificationServices();
    }

    async initialize() {
        this.loggers.system.info('🚨 Initializing Enhanced Real-time Alerting Engine...');
        await this.loadAlertRulesFromDB();
        await this.loadNotificationChannelsFromDB();
        await this.initializeDefaultChannels();
        this.isRunning = true;
        this.loggers.system.info('✅ Enhanced Alerting Engine initialized with database persistence');
    }

    initializeNotificationServices() {
        // Initialize Email (nodemailer)
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
            this.emailTransporter = nodemailer.createTransporter(emailConfig);
        }

        // Initialize Twilio (SMS)
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        }

        // Initialize Pushover
        if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER) {
            this.pushoverClient = new Pushover({
                token: process.env.PUSHOVER_TOKEN,
                user: process.env.PUSHOVER_USER
            });
        }
    }

    // ... [REST OF THE CLASS METHODS WOULD GO HERE] ...
    
    // Example method to show how dependencies are injected
    async processLogEvent(logEvent) {
        if (!this.isRunning || !logEvent) return;
        
        try {
            for (const rule of this.rules) {
                if (!rule.enabled) continue;
                
                const shouldTrigger = await this.evaluateRule(rule, logEvent);
                if (shouldTrigger) {
                    await this.triggerAlert(rule, logEvent);
                }
            }
        } catch (error) {
            this.loggers.system.error('Error processing log event for alerts:', error);
        }
    }

    // Add other methods here...
}

module.exports = AlertingEngine;