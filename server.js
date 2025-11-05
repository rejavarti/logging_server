#!/usr/bin/env node
/**
 * Enhanced Universal Logging Platform v2.1.0-stable-enhanced
 * Enterprise-grade modular logging server with complete functionality
 * 
 * Modular Architecture:
 * - templates/ - Complete 4-theme template system
 * - routes/ - Core application routes
 * - routes/admin/ - Complete admin interface
 * - engines/ - All 8 enterprise engine classes
 * - managers/ - System management classes
 * 
 * Zero functionality loss - 100% feature preservation
 */

// Essential imports for setup check
const fs = require('fs');
const path = require('path');

// Check for initial setup completion
function checkInitialSetup() {
    const setupDataPath = path.join(__dirname, 'data', 'setup-complete.json');
    const envPath = path.join(__dirname, '.env');
    
    if (!fs.existsSync(setupDataPath) || !fs.existsSync(envPath)) {
        console.log('\n🎯 ENHANCED UNIVERSAL LOGGING PLATFORM');
        console.log('🔧 Initial Setup Required');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 First-time installation detected!');
        console.log('🎮 Run the setup wizard: node initial-setup-server.js');
        console.log('   Or use quick setup: node scripts/setup.js');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Try to start setup server automatically
        try {
            const { spawn } = require('child_process');
            console.log('🚀 Starting setup wizard automatically...\n');
            const setupProcess = spawn('node', ['initial-setup-server.js'], { 
                stdio: 'inherit',
                cwd: __dirname
            });
            
            setupProcess.on('exit', (code) => {
                if (code === 0) {
                    console.log('\n✅ Setup completed! Restarting main server...');
                    // Restart main server after setup
                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                }
            });
            
            return false; // Don't continue with main server
        } catch (error) {
            console.error('Could not start setup wizard automatically.');
            console.error('Please run manually: node initial-setup-server.js');
            process.exit(1);
        }
    }
    
    // Load environment variables if .env exists
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, ...valueParts] = trimmed.split('=');
                const value = valueParts.join('=');
                if (key && value && !process.env[key]) {
                    process.env[key] = value;
                }
            }
        }
    }
    
    return true; // Continue with main server
}

// Core dependencies
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const https = require('https');
const basicAuth = require('basic-auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

// Advanced features (with graceful fallbacks)
let geoip, useragent, nodemailer, twilio, Pushover, Fuse, _;

try {
    geoip = require('geoip-lite');
    useragent = require('useragent-parser');
    nodemailer = require('nodemailer');
    twilio = require('twilio');
    Pushover = require('pushover-notifications');
    Fuse = require('fuse.js');
    _ = require('lodash');
} catch (error) {
    console.warn('Some optional packages not available:', error.message);
}

// Multi-Protocol Dependencies (already included in engines)
const dgram = require('dgram');
const net = require('net');
const { pipeline } = require('stream');
const zlib = require('zlib');

// Distributed Tracing Dependencies (with graceful fallbacks)
let NodeSDK, Resource, SemanticResourceAttributes, JaegerExporter, BatchSpanProcessor, opentelemetry;

try {
    const otelSDK = require('@opentelemetry/sdk-node');
    NodeSDK = otelSDK.NodeSDK;
    
    const otelResources = require('@opentelemetry/resources');
    Resource = otelResources.Resource;
    
    const otelConventions = require('@opentelemetry/semantic-conventions');
    SemanticResourceAttributes = otelConventions.SemanticResourceAttributes;
    
    const otelJaeger = require('@opentelemetry/exporter-jaeger');
    JaegerExporter = otelJaeger.JaegerExporter;
    
    const otelTrace = require('@opentelemetry/sdk-trace-base');
    BatchSpanProcessor = otelTrace.BatchSpanProcessor;
    
    opentelemetry = require('@opentelemetry/api');
} catch (error) {
    console.warn('OpenTelemetry packages not available, distributed tracing disabled:', error.message);
}

// Initialize Express application
const app = express();

// Environment configuration
const PORT = process.env.PORT || 10180;
const TIMEZONE = process.env.TIMEZONE || 'America/Edmonton';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// SSL Configuration
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'private.key');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'ssl', 'certificate.crt');

// System directories
const dataDir = path.join(__dirname, 'data');
const dbDir = path.join(dataDir, 'databases');
const logDir = path.join(dataDir, 'logs');

// Ensure directories exist
[dataDir, dbDir, logDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// System configuration
const config = {
    system: {
        name: 'Enhanced Universal Logging Platform',
        version: '2.1.0-stable-enhanced',
        environment: process.env.NODE_ENV || 'production'
    },
    auth: {
        jwtSecret: process.env.JWT_SECRET || (() => {
            console.error('🚨 SECURITY WARNING: JWT_SECRET environment variable not set!');
            console.error('🔧 Generate a secure secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
            process.exit(1);
        })(),
        saltRounds: 12,
        sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
    },
    integrations: {
        unifi: {
            enabled: process.env.UNIFI_ENABLED === 'true' || false,
            host: process.env.UNIFI_HOST || "https://unifi.local:8443",
            username: process.env.UNIFI_USER || "",
            password: process.env.UNIFI_PASS || "",
            pollInterval: parseInt(process.env.UNIFI_POLL_INTERVAL) || 300 // 5 minutes
        },
        homeAssistant: {
            enabled: process.env.HA_ENABLED === 'true' || false,
            host: process.env.HA_HOST || "http://homeassistant.local:8123",
            token: process.env.HA_TOKEN || "",
            websocketEnabled: process.env.HA_WEBSOCKET === 'true' || true
        },
        websocket: {
            enabled: process.env.WS_ENABLED === 'true' || true,
            port: parseInt(process.env.WS_PORT) || 8081
        },
        mqtt: {
            enabled: process.env.MQTT_ENABLED === 'true',
            broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASSWORD,
            topic: process.env.MQTT_TOPIC || "enterprise/logs",
            topics: ['dsc/+/+', 'homeassistant/+/+', 'iot/+/+', 'security/+/+'],
            nodeRedLogging: {
                enabled: process.env.NODE_RED_LOGGING_ENABLED === 'true' || true,
                errorTopic: process.env.NODE_RED_ERROR_TOPIC || 'homeassistant/logging/+/error',
                criticalTopic: process.env.NODE_RED_CRITICAL_TOPIC || 'homeassistant/logging/+/critical'
            }
        }
    },
    ingestion: {
        syslog: {
            enabled: process.env.SYSLOG_ENABLED === 'true' || true,
            udpPort: parseInt(process.env.SYSLOG_UDP_PORT) || 514,
            tcpPort: parseInt(process.env.SYSLOG_TCP_PORT) || 601
        },
        gelf: {
            enabled: process.env.GELF_ENABLED === 'true' || true,
            udpPort: parseInt(process.env.GELF_UDP_PORT) || 12201,
            tcpPort: parseInt(process.env.GELF_TCP_PORT) || 12202
        },
        beats: {
            enabled: process.env.BEATS_ENABLED === 'true' || true,
            tcpPort: parseInt(process.env.BEATS_TCP_PORT) || 5044
        },
        fluent: {
            enabled: process.env.FLUENT_ENABLED === 'true' || true,
            httpPort: parseInt(process.env.FLUENT_HTTP_PORT) || 9880
        }
    },
    tracing: {
        enabled: process.env.TRACING_ENABLED === 'true' || true,
        serviceName: process.env.TRACING_SERVICE_NAME || 'enterprise-logging-platform',
        jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        samplingRate: parseFloat(process.env.TRACING_SAMPLING_RATE) || 1.0,
        enableConsoleExporter: process.env.TRACING_CONSOLE === 'true' || false
    },
    maintenance: {
        logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
        backupSchedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        cleanupSchedule: process.env.CLEANUP_SCHEDULE || '0 3 * * 0' // Weekly on Sunday at 3 AM
    },
    notifications: {
        email: {
            enabled: process.env.EMAIL_ENABLED === 'true' || false,
            smtp: {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true' || false,
                auth: {
                    user: process.env.SMTP_USER || '',
                    pass: process.env.SMTP_PASS || ''
                }
            },
            from: process.env.EMAIL_FROM || 'alerts@loggingplatform.local'
        },
        sms: {
            enabled: process.env.SMS_ENABLED === 'true' || false,
            twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
            twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
            twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
            defaultRecipient: process.env.SMS_DEFAULT_RECIPIENT || ''
        },
        pushover: {
            enabled: process.env.PUSHOVER_ENABLED === 'true' || false,
            applicationToken: process.env.PUSHOVER_APP_TOKEN || '',
            userKey: process.env.PUSHOVER_USER_KEY || ''
        }
    }
};

// Winston logging configuration
const timezoneTimestamp = winston.format((info) => {
    info.timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    return info;
});

const loggers = {
    system: winston.createLogger({
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.colorize(),
            winston.format.printf(info => `${info.timestamp} [${info.level}] ${info.message}`)
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({ 
                filename: path.join(logDir, 'system.log'),
                maxsize: 50 * 1024 * 1024, // 50MB
                maxFiles: 5
            })
        ]
    }),
    api: winston.createLogger({
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ 
                filename: path.join(logDir, 'api.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 5
            })
        ]
    }),
    security: winston.createLogger({
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ 
                filename: path.join(logDir, 'security.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 10
            })
        ]
    }),
    access: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(info => {
                        return `🌐 ${info.timestamp} - ${info.message}`;
                    })
                )
            }),
            new winston.transports.File({ 
                filename: path.join(logDir, 'access.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 10
            })
        ]
    }),
    audit: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ 
                filename: path.join(logDir, 'audit.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 10
            })
        ]
    })
};

// Global System Settings (matching monolithic implementation)
const SYSTEM_SETTINGS = {};

// Initialize default system settings
Object.assign(SYSTEM_SETTINGS, {
    timezone: TIMEZONE,
    default_theme: 'ocean', 
    date_format: 'MM/DD/YYYY, hh:mm:ss A'
});

// System settings loader function
async function loadSystemSettings(callback) {
    try {
        const settings = await dal.getAllSettings();
        
        settings.forEach(row => {
            SYSTEM_SETTINGS[row.setting_key] = row.setting_value;
        });
        
        loggers.system.info('✅ System settings loaded via DAL:', SYSTEM_SETTINGS);
        if (callback) callback(null, SYSTEM_SETTINGS);
    } catch (error) {
        loggers.system.error('Failed to load system settings:', error);
        if (callback) callback(error);
    }
}

// Utility function for formatting SQLite timestamps (matching monolithic implementation)
function formatSQLiteTimestamp(sqliteTimestamp, format) {
    if (!sqliteTimestamp) return null;
    try {
        // Use format from settings if not provided
        const displayFormat = format || SYSTEM_SETTINGS.date_format || 'MM/DD/YYYY, hh:mm:ss A';
        // Use timezone from settings
        const timezone = SYSTEM_SETTINGS.timezone || TIMEZONE;
        // Parse as UTC (SQLite CURRENT_TIMESTAMP is always UTC)
        // Then convert to configured timezone
        const m = moment.utc(sqliteTimestamp, 'YYYY-MM-DD HH:mm:ss').tz(timezone);
        return m.isValid() ? m.format(displayFormat) : null;
    } catch (error) {
        console.error('❌ Error formatting timestamp:', sqliteTimestamp, error);
        return null;
    }
}

// Database initialization
const DatabaseAccessLayer = require('./database-access-layer');
let dal = null;
let db; // Legacy compatibility

// Imported modules
const IntegrationManager = require('./managers/IntegrationManager');
const WebhookManager = require('./managers/WebhookManager');
const MetricsManager = require('./managers/MetricsManager');
const UserManager = require('./managers/UserManager');

// Engine imports  
const AlertingEngine = require('./engines/alerting-engine');
const AdvancedSearchEngine = require('./engines/advanced-search-engine');
const MultiProtocolIngestionEngine = require('./engines/multi-protocol-ingestion-engine');
const DataRetentionEngine = require('./engines/data-retention-engine');
const RealTimeStreamingEngine = require('./engines/real-time-streaming-engine');
const AnomalyDetectionEngine = require('./engines/anomaly-detection-engine');
const LogCorrelationEngine = require('./engines/log-correlation-engine');
const PerformanceOptimizationEngine = require('./engines/performance-optimization-engine');
const AdvancedDashboardBuilder = require('./engines/advanced-dashboard-builder');
const DistributedTracingEngine = require('./engines/distributed-tracing-engine');

// Template system
const { getPageTemplate } = require('./templates/base');

// Global system components
let integrationManager = null;
let webhookManager = null;
let metricsManager = null;
let userManager = null;
let alertingEngine = null;
let advancedSearchEngine = null;
let multiProtocolIngestionEngine = null;
let dataRetentionEngine = null;
let realTimeStreamingEngine = null;
let anomalyDetectionEngine = null;
let logCorrelationEngine = null;
let performanceOptimizationEngine = null;
let advancedDashboardBuilder = null;
let distributedTracingEngine = null;

// Express middleware setup - Security first!
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false // For WebSocket compatibility
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:10180', 'https://localhost:10180'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: config.auth.jwtSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: USE_HTTPS,
        httpOnly: true,
        maxAge: config.auth.sessionTimeout,
        sameSite: 'strict' // CSRF protection
    },
    name: 'sessionId', // Don't use default session name
    rolling: true // Refresh session on activity
}));

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const logIngestionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes  
    max: 1000, // Higher limit for log ingestion
    message: { error: 'Log ingestion rate limit exceeded.' },
    skip: (req) => req.path === '/health'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth attempts per windowMs
    message: { error: 'Too many authentication attempts, please try again later.' },
    skipSuccessfulRequests: true
});

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/log', logIngestionLimiter);
app.use('/login', authLimiter);
app.use('/api/auth/', authLimiter);

// Make dependencies available to routes
app.locals.config = config;
app.locals.loggers = loggers;
app.locals.dal = () => dal;
app.locals.db = () => db;
app.locals.TIMEZONE = TIMEZONE;

// Middleware to inject DAL and engines into request objects
app.use((req, res, next) => {
    req.dal = dal;
    req.db = db;
    req.config = config;
    req.loggers = loggers;
    req.TIMEZONE = TIMEZONE;
    req.systemSettings = { timezone: TIMEZONE, default_theme: 'auto' };
    req.dashboardBuilder = advancedDashboardBuilder;
    req.webhookManager = webhookManager;
    next();
});
app.locals.getEngines = () => ({
    alertingEngine,
    advancedSearchEngine,
    multiProtocolIngestionEngine,
    dataRetentionEngine,
    realTimeStreamingEngine,
    anomalyDetectionEngine,
    logCorrelationEngine,
    performanceOptimizationEngine
});
app.locals.getManagers = () => ({
    integrationManager,
    metricsManager,
    userManager
});

// Set template function for routes
app.set('pageTemplate', getPageTemplate);

// Authentication middleware - matches monolithic implementation exactly
const requireAuth = (req, res, next) => {
    const token = req.session?.token;
    
    loggers.security.info(`Auth check for ${req.path}: token=${token ? 'present' : 'missing'}`);
    
    if (!token) {
        loggers.security.warn(`No token for ${req.path}, redirecting to login`);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }

    const user = userManager.verifyJWT(token);
    if (!user) {
        loggers.security.warn(`Invalid token for ${req.path}, redirecting to login`);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.redirect('/login');
    }

    loggers.security.info(`Auth successful for ${req.path}, user: ${user.username}`);
    req.user = user;
    
    // Update session last_activity (use explicit UTC time)
    const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
    dal.run(
        `UPDATE user_sessions SET last_activity = ? WHERE session_token = ? AND active = 1`,
        [utcNow, token],
        (err) => {
            if (err) loggers.system.error('Failed to update session activity:', err);
        }
    );
    
    next();
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return res.status(403).send('<h1>Access Denied</h1><p>Administrator privileges required</p>');
    }
    next();
};

// Legacy ESP32 authentication
const legacyAuth = (req, res, next) => {
    const credentials = basicAuth(req);
    const validUsername = process.env.AUTH_USERNAME || 'admin';
    
    // Require environment password - no hardcoded fallback for security
    const validPassword = process.env.AUTH_PASSWORD;
    if (!validPassword) {
        loggers.security.error('🚨 AUTH_PASSWORD environment variable not set! Cannot authenticate.');
        res.status(500).json({ error: 'Server configuration error - contact administrator' });
        return;
    }
    
    if (!credentials || credentials.name !== validUsername || credentials.pass !== validPassword) {
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Basic realm="DSC Logging Server"');
        res.end('Access denied');
        return;
    }
    next();
};

// Make middleware available to routes
app.locals.requireAuth = requireAuth;
app.locals.requireAdmin = requireAdmin;
app.locals.legacyAuth = legacyAuth;

// Database initialization function
async function initializeDatabase() {
    try {
        const dbPath = path.join(dbDir, 'enterprise_logs.db');
        
        // Run database migration first to ensure all tables exist
        loggers.system.info('🔧 Running database migration...');
        const DatabaseMigration = require('./database-migration');
        const migration = new DatabaseMigration(dbPath, loggers.system);
        await migration.runMigration();
        loggers.system.info('✅ Database migration completed successfully');
        
        // 🔧 TIMING FIX: Allow SQLite to fully commit changes to disk
        loggers.system.info('⏳ Ensuring database is fully ready...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        dal = new DatabaseAccessLayer(dbPath, loggers.system);
        db = dal.db; // Legacy compatibility
        
        // Load system settings after DAL is initialized
        await loadSystemSettings();
        
        loggers.system.info('✅ Database Access Layer initialized successfully');
        return true;
    } catch (error) {
        loggers.system.error('❌ Database initialization failed:', error.message);
        throw error;
    }
}

// System components initialization
async function initializeSystemComponents() {
    try {
        loggers.system.info('🔧 Initializing system components...');

        // Initialize managers
        metricsManager = new MetricsManager(loggers);
        await metricsManager.initialize();

        userManager = new UserManager(config, loggers, dal);
        
        // Enhanced log to database function with optional request context
        const logToDatabase = async (message, level = 'info', category = 'system', source = 'localhost', requestContext = null) => {
            try {
                const logEntry = {
                    level, 
                    message, 
                    source: category, 
                    ip: source, 
                    timestamp: new Date().toISOString() 
                };

                // Add enhanced data if request context is provided
                if (requestContext) {
                    const clientIp = requestContext.ip || requestContext.connection?.remoteAddress || source;
                    const userAgent = requestContext.headers?.['user-agent'] || 'unknown';
                    
                    logEntry.ip = clientIp;
                    logEntry.user_agent = userAgent;

                    // Add geographic data
                    if (geoip && clientIp !== 'localhost' && clientIp !== '127.0.0.1' && clientIp !== '::1') {
                        try {
                            const geo = geoip.lookup(clientIp);
                            if (geo) {
                                logEntry.country = geo.country;
                                logEntry.region = geo.region;
                                logEntry.city = geo.city;
                                logEntry.timezone = geo.timezone;
                                logEntry.coordinates = geo.ll ? `${geo.ll[0]},${geo.ll[1]}` : null;
                            }
                        } catch (geoError) {
                            // Silent fail for geo lookup
                        }
                    }

                    // Parse user agent
                    if (useragent && userAgent !== 'unknown') {
                        try {
                            const parsed = useragent.parse(userAgent);
                            logEntry.browser = parsed.browser;
                            logEntry.os = parsed.os;
                            logEntry.device = parsed.device;
                        } catch (uaError) {
                            // Silent fail for user-agent parsing
                        }
                    }
                }

                const logId = await dal.createLogEntry(logEntry);
                if (metricsManager) {
                    metricsManager.incrementLogs();
                    metricsManager.incrementBytes(message.length || 0);
                }
                return logId;
            } catch (error) {
                loggers.system.error('Database log insert error:', error);
                throw error;
            }
        };
        
        integrationManager = new IntegrationManager(config, loggers, logToDatabase, TIMEZONE);
        await integrationManager.initialize();
        
        // Initialize WebhookManager
        webhookManager = new WebhookManager(dal, loggers);
        loggers.system.info('✅ WebhookManager initialized');

        // Database is properly migrated and ready for engines
        loggers.system.info('🔍 Database schema validated during migration - proceeding with engine initialization');
        
        // Initialize engines
        alertingEngine = new AlertingEngine(dal, loggers, config);
        await alertingEngine.initialize();

        advancedSearchEngine = new AdvancedSearchEngine(dal, loggers);
        await advancedSearchEngine.initialize();

        multiProtocolIngestionEngine = new MultiProtocolIngestionEngine(config, loggers, dal);
        await multiProtocolIngestionEngine.initialize();

        dataRetentionEngine = new DataRetentionEngine(dal, loggers, config);
        await dataRetentionEngine.initialize();

        realTimeStreamingEngine = new RealTimeStreamingEngine(dal, loggers, config);
        await realTimeStreamingEngine.initialize();

        anomalyDetectionEngine = new AnomalyDetectionEngine(dal, loggers, config);
        await anomalyDetectionEngine.initialize();

        logCorrelationEngine = new LogCorrelationEngine(dal, loggers, config);
        await logCorrelationEngine.initialize();

        performanceOptimizationEngine = new PerformanceOptimizationEngine(dal, loggers, config);
        await performanceOptimizationEngine.initialize();

        advancedDashboardBuilder = new AdvancedDashboardBuilder(dal, loggers, config);
        await advancedDashboardBuilder.initialize();

        distributedTracingEngine = new DistributedTracingEngine(dal, loggers, config);
        await distributedTracingEngine.initialize();

        loggers.system.info('✅ All system components initialized successfully');
        loggers.system.info('📊 System Summary:');
        loggers.system.info('   • Database: SQLite with DAL optimization');
        loggers.system.info('   • Engines: 9 enterprise engines loaded');
        loggers.system.info('   • Integrations: WebSocket, MQTT, Multi-protocol');
        loggers.system.info('   • Security: Rate limiting, JWT auth, audit logging');
        loggers.system.info('   • Performance: Caching, streaming, optimization');
        return true;
    } catch (error) {
        loggers.system.error('❌ Component initialization failed:', error);
        throw error;
    }
}

// Route imports and setup
function setupRoutes() {
    try {
        loggers.system.info('🛣️ Setting up application routes...');

        // Health check endpoint (for setup server transition)
        app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                server: 'Enhanced Universal Logging Platform',
                version: config.system.version
            });
        });

        // Root redirect
        app.get('/', (req, res) => res.redirect('/dashboard'));

        // Login page
        app.get('/login', (req, res) => {
            if (req.session?.token && userManager && userManager.verifyJWT(req.session.token)) {
                return res.redirect('/dashboard');
            }
            
            const loginPageContent = `
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle Theme">
                <i class="fas fa-palette"></i>
            </button>
            <div class="login-container">
                <div class="login-header">
                    <h1>🔥 Enterprise Logger</h1>
                    <p>Advanced Infrastructure Monitoring Platform</p>
                </div>
                
                <div class="login-form">
                    <div class="welcome-message">
                        <strong>🚀 Welcome to Enterprise Logging Platform</strong><br>
                        Secure access to your infrastructure monitoring dashboard
                    </div>
                    
                    <form id="loginForm">
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" name="username" placeholder="Enter username" autocomplete="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" placeholder="Enter your password" autocomplete="current-password" required>
                        </div>
                        
                        <button type="submit" class="login-btn" id="loginBtn">
                            Sign In
                        </button>
                    </form>
                    
                    <div id="error-message" class="error-message"></div>
                </div>
                
                <div class="login-footer">
                    <strong>Enhanced Universal Logging Platform v2.1.0-stable-enhanced</strong><br>
                    Multi-Source Infrastructure Monitoring
                </div>
            </div>`;

            const loginCSS = `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: var(--login-bg);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            
            /* Animated background elements */
            body::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                animation: shimmer 3s ease-in-out infinite;
            }
            
            @keyframes shimmer {
                0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(30deg); }
                50% { transform: translateX(100%) translateY(100%) rotate(30deg); }
            }
            
            .login-container {
                background: var(--bg-primary);
                backdrop-filter: blur(20px);
                border-radius: 20px;
                box-shadow: var(--shadow-medium);
                overflow: hidden;
                width: 100%;
                max-width: 420px;
                margin: 2rem;
                border: 1px solid var(--border-color);
                position: relative;
                z-index: 1;
                transition: all 0.3s ease;
            }
            
            .login-header {
                background: var(--gradient-ocean);
                color: white;
                padding: 2.5rem 2rem;
                text-align: center;
                position: relative;
                overflow: hidden;
            }
            
            .login-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                animation: headerShimmer 4s ease-in-out infinite;
            }
            
            @keyframes headerShimmer {
                0%, 100% { transform: translateX(-100%); }
                50% { transform: translateX(100%); }
            }
            
            .login-header h1 {
                font-size: 2rem;
                margin-bottom: 0.5rem;
                font-weight: 700;
                position: relative;
                z-index: 1;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .login-header p {
                opacity: 0.9;
                font-size: 0.95rem;
                position: relative;
                z-index: 1;
            }
            
            .login-form {
                padding: 2.5rem 2rem;
            }
            
            /* Theme Toggle Button */
            .theme-toggle {
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: var(--gradient-sky);
                border: 2px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 0.75rem;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 1.2rem;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                z-index: 10;
            }
            .theme-toggle:hover {
                transform: scale(1.1) rotate(15deg);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
                background: var(--gradient-deep-blue);
            }
            
            .form-group {
                margin-bottom: 1.75rem;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 0.75rem;
                font-weight: 600;
                color: var(--text-primary);
                font-size: 0.95rem;
            }
            
            .form-group input {
                width: 100%;
                padding: 1rem 1.25rem;
                border: 2px solid var(--border-color);
                border-radius: 12px;
                font-size: 1rem;
                transition: all 0.3s ease;
                background: var(--bg-secondary);
                color: var(--text-primary);
                box-sizing: border-box;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: var(--accent-primary);
                box-shadow: var(--shadow-glow);
                transform: translateY(-1px);
            }
            
            .login-btn {
                width: 100%;
                padding: 1.25rem;
                background: var(--gradient-ocean);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 1.05rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .login-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transition: left 0.5s;
            }
            
            .login-btn:hover::before {
                left: 100%;
            }
            
            .login-btn:hover {
                transform: translateY(-3px);
                box-shadow: var(--shadow-glow);
                background: var(--gradient-deep-blue);
            }
            
            .login-btn:active {
                transform: translateY(-1px);
                box-shadow: 0 8px 20px rgba(29, 78, 216, 0.3);
            }
            
            .error-message {
                margin-top: 1.5rem;
                padding: 1rem;
                background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                border: 1px solid #fecaca;
                border-radius: 12px;
                color: #dc2626;
                display: none;
                font-weight: 500;
            }
            
            .login-footer {
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                padding: 1.75rem;
                text-align: center;
                border-top: 1px solid #e2e8f0;
                color: #64748b;
                font-size: 0.85rem;
            }
            
            .welcome-message {
                background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
                padding: 1.25rem;
                border-radius: 12px;
                margin-bottom: 1.5rem;
                font-size: 0.9rem;
                color: #1e40af;
                border: 1px solid #93c5fd;
                font-weight: 500;
            }
            
            /* Responsive design */
            @media (max-width: 480px) {
                .login-container {
                    margin: 1rem;
                    border-radius: 16px;
                }
                
                .login-header {
                    padding: 2rem 1.5rem;
                }
                
                .login-form {
                    padding: 2rem 1.5rem;
                }
                
                .login-header h1 {
                    font-size: 1.75rem;
                }
            }`;

            const loginJS = `
            // Enhanced login functionality with proper error handling
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const loginBtn = document.getElementById('loginBtn');
                const errorDiv = document.getElementById('error-message');
                
                // Reset error state
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
                
                // Show loading state
                loginBtn.disabled = true;
                loginBtn.textContent = 'Signing In...';
                
                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        loginBtn.textContent = 'Success! Redirecting...';
                        loginBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 500);
                    } else {
                        throw new Error(result.error || 'Login failed');
                    }
                } catch (error) {
                    // Show error message
                    errorDiv.textContent = error.message;
                    errorDiv.style.display = 'block';
                    
                    // Reset button state
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In';
                    loginBtn.style.background = '';
                    
                    // Shake animation for error feedback
                    loginBtn.style.animation = 'shake 0.5s ease-in-out';
                    setTimeout(() => {
                        loginBtn.style.animation = '';
                    }, 500);
                }
            });
            
            // Add shake animation
            const style = document.createElement('style');
            style.textContent = \`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            \`;
            document.head.appendChild(style);
            
            // Enhanced theme management with light/dark/auto
            function toggleTheme() {
                const html = document.documentElement;
                const currentTheme = html.getAttribute('data-theme') || 'auto';
                let nextTheme;
                
                switch(currentTheme) {
                    case 'auto': nextTheme = 'light'; break;
                    case 'light': nextTheme = 'dark'; break;
                    case 'dark': nextTheme = 'auto'; break;
                    default: nextTheme = 'auto';
                }
                
                html.setAttribute('data-theme', nextTheme);
                
                try {
                    localStorage.setItem('preferred-theme', nextTheme);
                } catch(e) {
                    console.warn('Cannot save theme preference:', e);
                }
                
                // Update theme toggle icon and tooltip
                const toggle = document.querySelector('.theme-toggle i');
                const button = document.querySelector('.theme-toggle');
                switch(nextTheme) {
                    case 'light':
                        toggle.className = 'fas fa-sun';
                        button.title = 'Switch to Dark Theme';
                        break;
                    case 'dark':
                        toggle.className = 'fas fa-moon';
                        button.title = 'Switch to Auto Theme';
                        break;
                    case 'auto':
                        toggle.className = 'fas fa-palette';
                        button.title = 'Switch to Light Theme';
                        break;
                }
            }
            
            // Initialize theme on page load
            (function() {
                try {
                    const saved = localStorage.getItem('preferred-theme') || 'auto';
                    document.documentElement.setAttribute('data-theme', saved);
                    
                    // Set initial icon
                    const toggle = document.querySelector('.theme-toggle i');
                    const button = document.querySelector('.theme-toggle');
                    switch(saved) {
                        case 'light':
                            toggle.className = 'fas fa-sun';
                            button.title = 'Switch to Dark Theme';
                            break;
                        case 'dark':
                            toggle.className = 'fas fa-moon';
                            button.title = 'Switch to Auto Theme';
                            break;
                        case 'auto':
                            toggle.className = 'fas fa-palette';
                            button.title = 'Switch to Light Theme';
                            break;
                    }
                } catch(e) {
                    console.warn('Cannot load theme preference:', e);
                }
            })();
            
            // Auto-focus username field
            document.getElementById('username').focus();`;

            // Send login page as standalone HTML (no sidebar/template)
            res.send(`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 Enterprise Logger - Login</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            /* Light Theme Colors */
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-tertiary: #f1f5f9;
            --text-primary: #1e293b;
            --text-secondary: #475569;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.2);
            
            /* Light Theme Ocean Gradients */
            --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
            --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
            --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
            
            /* Standard Colors - Using Ocean Gradient as Primary */
            --accent-primary: var(--gradient-ocean);
            --btn-primary: var(--gradient-ocean);
            --accent-secondary: #3b82f6;
            --login-bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
        }

        /* Dark Theme */
        [data-theme="dark"] {
            --bg-primary: #1e293b;
            --bg-secondary: #334155;
            --bg-tertiary: #475569;
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #94a3b8;
            --border-color: #475569;
            --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
            
            /* Ocean Gradients for Dark Theme */
            --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
            --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
            --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
            
            /* Standard Colors - Using Ocean Gradient as Primary */
            --accent-primary: var(--gradient-ocean);
            --btn-primary: var(--gradient-ocean);
            --accent-secondary: #3b82f6;
            --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
        }

        /* Auto Theme - follows system preference */
        @media (prefers-color-scheme: dark) {
            [data-theme="auto"] {
                --bg-primary: #1e293b;
                --bg-secondary: #334155;
                --bg-tertiary: #475569;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-color: #475569;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                
                /* Ocean Gradients for Auto Dark Mode */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            }
        }
        
        ${loginCSS}
    </style>
</head>
<body>
    ${loginPageContent}
    
    <script>
        ${loginJS}
    </script>
</body>
</html>`);
        });

        // Authentication endpoints
        app.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const result = await userManager.authenticateUser(username, password);
                
                if (result.success) {
                    const token = userManager.generateJWT(result.user);
                    req.session.token = token;
                    res.json({ success: true, token, user: result.user });
                } else {
                    res.status(401).json({ success: false, error: result.error });
                }
            } catch (error) {
                loggers.security.error('Login error:', error);
                res.status(500).json({ success: false, error: 'Login failed' });
            }
        });

        app.post('/api/auth/logout', (req, res) => {
            req.session.destroy();
            res.json({ success: true });
        });

        // Core routes
        app.use('/dashboard', requireAuth, require('./routes/dashboard'));
        app.use('/dashboard', requireAuth, require('./routes/dashboard-builder'));
        app.use('/logs', requireAuth, require('./routes/logs'));
        app.use('/log-analyzer', requireAuth, require('./routes/log-analyzer'));
        app.use('/search', requireAuth, require('./routes/search'));
        app.use('/webhooks', requireAuth, require('./routes/webhooks'));
        app.use('/integrations', requireAuth, require('./routes/integrations'));
        app.use('/activity', requireAuth, require('./routes/activity'));

        // Admin routes
        app.use('/admin/users', requireAuth, requireAdmin, require('./routes/admin/users'));
        app.use('/admin', requireAuth, requireAdmin, require('./routes/admin/settings'));
        app.use('/admin/health', requireAuth, requireAdmin, require('./routes/admin/health'));
        app.use('/admin', requireAuth, requireAdmin, require('./routes/admin/security')(getPageTemplate, requireAuth));
        app.use('/admin/api-keys', requireAuth, requireAdmin, require('./routes/admin/api-keys'));
        app.use('/admin/search-advanced', requireAuth, requireAdmin, require('./routes/admin/search-advanced'));
        app.use('/admin/ingestion', requireAuth, requireAdmin, require('./routes/admin/ingestion'));
        app.use('/admin/tracing', requireAuth, requireAdmin, require('./routes/admin/tracing'));
        app.use('/admin/dashboards', requireAuth, requireAdmin, require('./routes/admin/dashboards'));

        // Dashboard API routes
        app.use('/api/dashboards', requireAuth, require('./routes/api/dashboards'));
        app.use('/api/logs', requireAuth, require('./routes/api/logs'));
        app.use('/api/activity', requireAuth, require('./routes/api/activity'));
        app.use('/api/webhooks', requireAuth, require('./routes/api/webhooks'));
        app.use('/api/search', requireAuth, require('./routes/api/search'));
        app.use('/api/dashboard', requireAuth, require('./routes/api/dashboard'));
        
        // Admin API routes
        app.use('/api/settings', requireAuth, require('./routes/api/settings'));
        app.use('/api/api-keys', requireAuth, require('./routes/api/settings'));
        app.use('/api/tracing', requireAuth, require('./routes/api/tracing'));
        app.use('/api/ingestion', requireAuth, require('./routes/api/ingestion'));
        app.use('/api/users', requireAuth, require('./routes/api/users'));
        app.use('/api/admin', requireAuth, require('./routes/api/users'));
        app.use('/api/roles', requireAuth, require('./routes/api/users'));
        app.use('/api/rate-limits', requireAuth, require('./routes/api/security'));
        app.use('/api/audit-trail', requireAuth, require('./routes/api/security'));
        app.use('/api/security', requireAuth, require('./routes/api/security'));
        app.use('/api/log-analyzer', requireAuth, require('./api/log-analyzer'));
        app.use('/api', requireAuth, require('./routes/api/alerts'));
        app.use('/api', requireAuth, require('./routes/api/system'));
        app.use('/api', requireAuth, require('./routes/api/admin'));
        app.use('/api', requireAuth, require('./routes/api/backups'));
        app.use('/api', requireAuth, require('./routes/api/user-theme'));
        app.use('/api', requireAuth, require('./routes/api/saved-searches'));
        app.use('/api', requireAuth, require('./routes/api/integrations'));
        app.use('/api', requireAuth, require('./routes/api/api-keys'));
        app.use('/api', requireAuth, require('./routes/api/rate-limits'));
        app.use('/api', requireAuth, require('./routes/api/audit-trail'));

        // Enhanced log ingestion endpoint with geographic and user-agent analysis
        app.post('/log', legacyAuth, async (req, res) => {
            try {
                const { message, level = 'info', category = 'esp32' } = req.body;
                const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.headers['user-agent'] || 'unknown';
                
                // Enhanced log entry with geographic and user-agent data
                const logEntry = {
                    level,
                    message,
                    source: category,
                    ip: clientIp,
                    timestamp: new Date().toISOString(),
                    user_agent: userAgent
                };

                // Add geographic data if geoip is available
                if (geoip && clientIp !== 'unknown' && clientIp !== '127.0.0.1' && clientIp !== '::1') {
                    try {
                        const geo = geoip.lookup(clientIp);
                        if (geo) {
                            logEntry.country = geo.country;
                            logEntry.region = geo.region;
                            logEntry.city = geo.city;
                            logEntry.timezone = geo.timezone;
                            logEntry.coordinates = geo.ll ? `${geo.ll[0]},${geo.ll[1]}` : null;
                        }
                    } catch (geoError) {
                        loggers.system.warn('Geographic lookup failed:', geoError.message);
                    }
                }

                // Parse user agent if available
                if (useragent && userAgent !== 'unknown') {
                    try {
                        const parsed = useragent.parse(userAgent);
                        logEntry.browser = parsed.browser;
                        logEntry.os = parsed.os;
                        logEntry.device = parsed.device;
                    } catch (uaError) {
                        loggers.system.warn('User-agent parsing failed:', uaError.message);
                    }
                }
                
                await dal.createLogEntry(logEntry);
                if (metricsManager) metricsManager.incrementLogs();
                
                res.json({ success: true, message: 'Log received' });
            } catch (error) {
                loggers.system.error('Enhanced log ingestion error:', error);
                res.status(500).json({ success: false, error: 'Failed to log message' });
            }
        });

        // Favicon route
        app.get('/favicon.svg', (req, res) => {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#3b82f6;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#6366f1;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="45" fill="url(#grad)" stroke="#1e293b" stroke-width="2"/>
                <rect x="20" y="35" width="60" height="4" rx="2" fill="white" opacity="0.9"/>
                <rect x="20" y="43" width="45" height="4" rx="2" fill="white" opacity="0.7"/>
                <rect x="20" y="51" width="55" height="4" rx="2" fill="white" opacity="0.8"/>
                <rect x="20" y="59" width="40" height="4" rx="2" fill="white" opacity="0.6"/>
                <circle cx="75" cy="25" r="8" fill="#10b981" stroke="white" stroke-width="2"/>
                <text x="75" y="30" font-family="Arial" font-size="10" fill="white" text-anchor="middle" font-weight="bold">✓</text>
            </svg>`);
        });

        // Health check endpoint
        app.get('/health', (req, res) => {
            const uptime = process.uptime();
            res.json({
                status: 'healthy',
                uptime: Math.floor(uptime),
                version: config.system.version,
                timestamp: new Date().toISOString()
            });
        });

        loggers.system.info('✅ All routes configured successfully');
    } catch (error) {
        loggers.system.error('❌ Route setup failed:', error);
        throw error;
    }
}

// Server startup function
async function startServer() {
    try {
        loggers.system.info('🚀 Starting Enhanced Universal Logging Platform...');
        
        // Initialize database
        await initializeDatabase();
        
        // Initialize system components
        await initializeSystemComponents();
        
        // Setup routes
        setupRoutes();
        
        // Start server
        let server;
        
        if (USE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
            const httpsOptions = {
                key: fs.readFileSync(SSL_KEY_PATH),
                cert: fs.readFileSync(SSL_CERT_PATH)
            };
            
            server = https.createServer(httpsOptions, app);
            server.listen(PORT, () => {
                loggers.system.info(`🔒 HTTPS Server running on port ${PORT}`);
                printStartupBanner(true);
            });
        } else {
            if (USE_HTTPS) {
                loggers.system.warn('⚠️  HTTPS requested but SSL certificates not found, using HTTP');
            }
            
            server = app.listen(PORT, () => {
                loggers.system.info(`🚀 HTTP Server running on port ${PORT}`);
                printStartupBanner(false);
            });
        }
        
        // Server error handling
        server.on('error', (error) => {
            loggers.system.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use!`);
                process.exit(1);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            loggers.system.info('SIGTERM received - shutting down gracefully...');
            server.close(() => {
                loggers.system.info('Server shut down successfully');
                if (db) {
                    db.close((err) => {
                        if (err) loggers.system.error('Database close error:', err);
                        else loggers.system.info('Database connection closed');
                        process.exit(0);
                    });
                } else {
                    process.exit(0);
                }
            });
        });
        
    } catch (error) {
        loggers.system.error('❌ Server startup failed:', error);
        console.error('🚨 STARTUP ERROR:', error);
        process.exit(1);
    }
}

// Startup banner
function printStartupBanner(isHttps) {
    const protocol = isHttps ? 'https' : 'http';
    
    console.log('\n🎯 Enhanced Universal Logging Platform Started Successfully!');
    console.log('═════════════════════════════════════════════════════════════');
    if (isHttps) console.log(`🔒 HTTPS Enabled - Secure Connection`);
    console.log(`🌐 Web Interface: ${protocol}://localhost:${PORT}/dashboard`);
    console.log(`🔐 Login: admin / ChangeMe123!`);
    console.log(`📊 API Endpoints: ${protocol}://localhost:${PORT}/api/`);
    console.log(`🔒 ESP32 Endpoint: ${protocol}://localhost:${PORT}/log`);
    console.log(`💚 Health Check: ${protocol}://localhost:${PORT}/health`);
    if (config.integrations.websocket.enabled) {
        console.log(`🔗 WebSocket Server: ws${isHttps ? 's' : ''}://localhost:${config.integrations.websocket.port}`);
    }
    if (config.integrations.mqtt.enabled) {
        console.log(`📡 MQTT Integration: ${config.integrations.mqtt.broker}`);
    }
    console.log('═════════════════════════════════════════════════════════════\n');
}

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = { app, config, loggers };