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
        loggers?.system?.info('\n🎯 ENHANCED UNIVERSAL LOGGING PLATFORM');
        loggers?.system?.info('🔧 Initial Setup Required');
        loggers?.system?.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        loggers?.system?.info('📋 First-time installation detected!');
        loggers?.system?.info('🎮 Run the setup wizard: node initial-setup-server.js');
        loggers?.system?.info('   Or use quick setup: node scripts/setup.js');
        loggers?.system?.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Try to start setup server automatically
        try {
            const { spawn } = require('child_process');
            loggers?.system?.info('🚀 Starting setup wizard automatically...\n');
            const setupProcess = spawn('node', ['initial-setup-server.js'], { 
                stdio: 'inherit',
                cwd: __dirname
            });
            
            setupProcess.on('exit', (code) => {
                if (code === 0) {
                    loggers?.system?.info('\n✅ Setup completed! Restarting main server...');
                    // Restart main server after setup
                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                }
            });
            
            return false; // Don't continue with main server
        } catch (error) {
            loggers?.system?.error('Could not start setup wizard automatically.');
            loggers?.system?.error('Please run manually: node initial-setup-server.js');
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
const compression = require('compression');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const helmet = require('helmet');
const moment = require('moment-timezone');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const https = require('https');
const basicAuth = require('basic-auth');
const bcrypt = require('bcryptjs'); // Pure JS implementation for Windows compatibility
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

// Advanced features (with graceful fallbacks)
let geoip, nodemailer, twilio, Pushover, Fuse, _, useragent;

// WebSocket for real-time push
const WebSocket = require('ws');

try {
    geoip = require('geoip-lite');
    nodemailer = require('nodemailer');
    twilio = require('twilio');
    Pushover = require('pushover-notifications');
    Fuse = require('fuse.js');
    useragent = require('useragent');
    _ = require('lodash');
} catch (error) {
    // Logger not yet initialized at this point in the code
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
    loggers?.system?.warn('OpenTelemetry packages not available, distributed tracing disabled:', error.message);
}

// Initialize Express application
const app = express();

// Application version (from package.json or APP_VERSION env override)
const APP_VERSION = process.env.APP_VERSION || require('./package.json').version;

// Global readiness flag (set true after full startup completes)
let systemReady = false;

// Early health endpoints (available before full engine init)
app.get('/health', (req, res) => {
    res.json({
        status: systemReady ? 'ready' : 'starting',
        version: APP_VERSION,
        node: process.version,
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        enginesInitialized: systemReady,
        timestamp: new Date().toISOString()
    });
});
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: systemReady ? 'ready' : 'starting',
        version: APP_VERSION,
        timestamp: new Date().toISOString()
    });
});

// Environment configuration
const PORT = process.env.PORT || 3000;
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
        version: APP_VERSION,
        environment: process.env.NODE_ENV || 'production'
    },
    auth: {
        jwtSecret: (() => {
            if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
            // Allow dev/CI fallback secret only outside production or when explicitly permitted
            const allowFallback = (process.env.NODE_ENV !== 'production') || process.env.ALLOW_DEV_SECRET === 'true';
            if (allowFallback) {
                const fallback = crypto.randomBytes(32).toString('hex');
                console.warn('⚠️ Using ephemeral development JWT secret (DO NOT use in production). Set JWT_SECRET to override.');
                return fallback;
            }
            console.error('🚨 SECURITY WARNING: JWT_SECRET environment variable not set and no fallback allowed (production mode).');
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
        transports: (() => {
            const isTest = process.env.NODE_ENV === 'test' || process.env.DISABLE_FILE_LOGGING === 'true';
            const arr = [new winston.transports.Console()];
            if (!isTest) {
                arr.push(new winston.transports.File({
                    filename: path.join(logDir, 'system.log'),
                    maxsize: 50 * 1024 * 1024,
                    maxFiles: 5
                }));
            }
            return arr;
        })()
    }),
    api: winston.createLogger({
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: (() => {
            const isTest = process.env.NODE_ENV === 'test' || process.env.DISABLE_FILE_LOGGING === 'true';
            if (isTest) {
                return [new winston.transports.Console()];
            }
            return [new winston.transports.File({
                filename: path.join(logDir, 'api.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 5
            })];
        })()
    }),
    security: winston.createLogger({
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: (() => {
            const isTest = process.env.NODE_ENV === 'test' || process.env.DISABLE_FILE_LOGGING === 'true';
            if (isTest) {
                return [new winston.transports.Console()];
            }
            return [new winston.transports.File({
                filename: path.join(logDir, 'security.log'),
                maxsize: 50 * 1024 * 1024,
                maxFiles: 5
            })];
        })()
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
        loggers?.system?.error('❌ Error formatting timestamp:', sqliteTimestamp, error);
        return null;
    }
}

// Database initialization
const DatabaseAccessLayer = require('./database-access-layer');
const AdvancedEncryptionSystem = require('./encryption-system');
let dal = null;
let db; // Legacy compatibility
let encryptionSystem = null;

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
// const AdvancedDashboardBuilder = require('./engines/advanced-dashboard-builder');
const DistributedTracingEngine = require('./engines/distributed-tracing-engine');
const FileIngestionEngine = require('./engines/file-ingestion-engine');

// Template system
const { getPageTemplate } = require('./configs/templates/base');

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
let advancedDashboardBuilder = null; // Disabled: Builder not used
let distributedTracingEngine = null;
let fileIngestionEngine = null;

// Express middleware setup - Enhanced Security Configuration!
// Use helmet for all routes except /dashboard to avoid CSP conflicts with custom dashboard CSP
app.use((req, res, next) => {
    if (req.path.startsWith('/dashboard')) {
        // Skip helmet CSP for dashboard
        return next();
    }
    // Apply helmet with CSP for all other routes
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 
                    "https://cdnjs.cloudflare.com", 
                    "https://fonts.googleapis.com", 
                    "https://cdn.jsdelivr.net", 
                    "https://unpkg.com",
                    "https://stackpath.bootstrapcdn.com",
                    "https://maxcdn.bootstrapcdn.com",
                    "https://use.fontawesome.com"
                ],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                    "https://cdnjs.cloudflare.com", 
                    "https://cdn.jsdelivr.net", 
                    "https://unpkg.com",
                    "https://stackpath.bootstrapcdn.com",
                    "https://maxcdn.bootstrapcdn.com",
                    "https://code.jquery.com",
                    "https://use.fontawesome.com",
                    "blob:"
                ],
                scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
                scriptSrcElem: ["'self'", "'unsafe-inline'",
                    "https://cdn.jsdelivr.net",
                    "https://cdnjs.cloudflare.com",
                    "https://unpkg.com",
                    "https://stackpath.bootstrapcdn.com",
                    "https://maxcdn.bootstrapcdn.com",
                    "https://code.jquery.com"
                ],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                connectSrc: ["'self'", "ws:", "wss:", "https:", "http:", "ws://localhost:*", "wss://localhost:*"],
                fontSrc: ["'self'", 
                    "https://cdnjs.cloudflare.com", 
                    "https://fonts.gstatic.com", 
                    "https://cdn.jsdelivr.net", 
                    "https://unpkg.com",
                    "https://stackpath.bootstrapcdn.com",
                    "https://maxcdn.bootstrapcdn.com",
                    "https://use.fontawesome.com",
                    "data:"
                ],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
                workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net"],
                childSrc: ["'self'", "blob:"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                // Explicitly set to null to prevent helmet from adding upgrade-insecure-requests
                upgradeInsecureRequests: null,
                blockAllMixedContent: null
            }
        },
        crossOriginEmbedderPolicy: false, // For WebSocket compatibility
        crossOriginOpenerPolicy: false, // Disable to prevent HTTPS upgrade on HTTP
        originAgentCluster: false, // Disable to prevent HTTPS upgrade on HTTP
        hsts: process.env.HTTPS_ENABLED === 'true' ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        } : false, // Disable HSTS when not using HTTPS to prevent browser caching issues
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        permittedCrossDomainPolicies: false,
        dnsPrefetchControl: true,
        frameguard: { action: 'deny' }
    })(req, res, next);
});

// Additional security headers (HTTP-safe only - no HTTPS-forcing headers)
app.use((req, res, next) => {
    // Basic security headers that work on both HTTP and HTTPS
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Changed from DENY to allow embedding
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade'); // More permissive for HTTP
    // REMOVED: Cross-Origin-* headers that cause browser HTTPS upgrade on HTTP
    // These headers will ONLY be added if serving over HTTPS
    next();
});

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Body parsing middleware (FIXED: removed conflicting custom parser)
// Express.json() handles JSON parsing properly without stream conflicts

app.use(express.json({ 
    limit: '10mb',
    strict: true // Only parse arrays and objects
}));

// JSON syntax error handler - must come right after express.json()
// Catches malformed JSON and returns proper 400 response
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        loggers.security.warn(`Malformed JSON from ${req.ip}: ${err.message}`);
        return res.status(400).json({ 
            success: false, 
            error: 'Malformed JSON in request body',
            details: err.message
        });
    }
    // Pass to next error handler if not a JSON syntax error
    next(err);
});

app.use(express.urlencoded({ extended: true }));

// Enable gzip/deflate compression for responses
app.use(compression());

// SLA Tracking Middleware (capture latency metrics before processing)
const slaTracker = require('./middleware/sla-tracker');
app.use(slaTracker);

// Static file serving for public assets
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    etag: true,
    lastModified: true
}));

// Session configuration - Using SQLiteStore for persistent sessions
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, 'data', 'sessions'),
        table: 'sessions',
        concurrentDB: true
    }),
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
// Can be disabled for stress testing with DISABLE_RATE_LIMIT=true
const rateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true';

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: rateLimitDisabled ? 999999 : 500, // Effectively unlimited when disabled
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for polling and frequently accessed endpoints
    skip: (req) => {
        if (rateLimitDisabled) return true;
        const exemptEndpoints = [
            '/api/notifications/recent',
            '/api/notifications/unread',
            '/api/system/health',
            '/api/users',
            '/api/audit-trail',
            '/api/tracing/status',
            '/api/tracing/dependencies',
            '/health'
        ];
        return exemptEndpoints.some(endpoint => req.path.includes(endpoint));
    }
});

const logIngestionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes  
    max: rateLimitDisabled ? 999999 : 1000, // Effectively unlimited when disabled
    message: { error: 'Log ingestion rate limit exceeded.' },
    skip: (req) => rateLimitDisabled || req.path === '/health'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: rateLimitDisabled ? 999999 : (process.env.NODE_ENV === 'test' ? 1000 : 5), // Effectively unlimited when disabled
    message: { error: 'Too many authentication attempts, please try again later.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: true
});

// Apply rate limiting (disable aggressive limits in test to avoid flakiness)
if (process.env.NODE_ENV !== 'test') {
    app.use('/api/', generalLimiter);
    app.use('/log', logIngestionLimiter);
    app.use('/login', authLimiter);
    app.use('/api/auth/', authLimiter);
} else {
    // In test mode, still protect auth endpoints minimally but avoid interfering with assertions
    app.use('/login', authLimiter);
    app.use('/api/auth/', authLimiter);
}

if (rateLimitDisabled) {
    loggers.system.warn('⚠️  RATE LIMITING DISABLED - For stress testing only!');
}

// Make dependencies available to routes
app.locals.config = config;
app.locals.loggers = loggers;
app.locals.dal = () => dal;
app.locals.db = () => db;
app.locals.TIMEZONE = TIMEZONE;
app.locals.encryptionSystem = null; // Will be set after initialization

// Middleware to inject DAL and engines into request objects
app.use((req, res, next) => {
    req.dal = dal;
    req.db = db;
    req.config = config;
    req.loggers = loggers;
    req.TIMEZONE = TIMEZONE;
    req.systemSettings = { timezone: TIMEZONE, default_theme: 'auto' };
    // Dashboard builder disabled: do not inject
    req.dashboardBuilder = null;
    req.webhookManager = webhookManager;
    // Provide integration manager for config update endpoints
    req.integrationManager = integrationManager;
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

// Authentication middleware will be initialized after userManager is ready
// (moved to initializeSystemComponents function)

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

// Make legacy auth middleware available (requireAuth and requireAdmin initialized later)
app.locals.legacyAuth = legacyAuth;

// Database initialization function
async function initializeDatabase() {
    try {
        // Allow TEST_DB_PATH override for test environments
        const dbPath = process.env.TEST_DB_PATH || path.join(dbDir, 'enterprise_logs.db');
        
        // Run database migration first to ensure all tables exist
        loggers.system.info('🔧 Running database migration...');
        const DatabaseMigration = require('./migrations/database-migration');
        const migration = new DatabaseMigration(dbPath, loggers.system);
        await migration.runMigration();
        loggers.system.info('✅ Database migration completed successfully');
        
        // CRITICAL FIX for :memory: databases:
        // For :memory: databases, each new connection creates a new isolated database.
        // We must reuse the SAME connection that runMigration() created.
        if (dbPath === ':memory:' && migration.db) {
            loggers.system.info('🔄 Reusing :memory: database connection from migration');
            dal = new DatabaseAccessLayer(dbPath, loggers.system);
            // Replace DAL's db instance with the migration's db to preserve tables
            dal.db = migration.db;
            dal.adapter = migration.db;
        } else {
            // For file-based databases, normal connection creation is fine
            // 🔧 TIMING FIX: Allow SQLite to fully commit changes to disk
            loggers.system.info('⏳ Ensuring database is fully ready...');
            await new Promise(resolve => setTimeout(resolve, 200));
            dal = new DatabaseAccessLayer(dbPath, loggers.system);
        }
        
        // Attach metrics manager reference for reliability counters once initialized
        db = dal.db; // Legacy compatibility
        
        // Load system settings after DAL is initialized
        await loadSystemSettings();
        
        // Note: Admin user initialization is handled by UserManager during system components init
        
        loggers.system.info('✅ Database Access Layer initialized successfully');
        return true;
    } catch (error) {
        loggers.system.error('❌ Database initialization failed:', error.message);
        throw error;
    }
}

// Migrate integration secrets from environment variables to encrypted database storage
async function migrateIntegrationSecretsToDatabase() {
    try {
        // Initialize encryption system with JWT_SECRET as master key
        const masterKey = process.env.JWT_SECRET || 'default-encryption-key-change-me';
        encryptionSystem = new AdvancedEncryptionSystem();
        app.locals.encryptionSystem = encryptionSystem;
        
        // Migrate Home Assistant token if present in environment and not already in DB
        if (process.env.HA_TOKEN) {
            const existing = await dal.getEncryptedSecret('homeassistant_token');
            if (!existing) {
                loggers.system.info('🔐 Migrating Home Assistant token to encrypted storage...');
                const encryptedToken = encryptionSystem.encrypt(process.env.HA_TOKEN, masterKey);
                await dal.storeEncryptedSecret('homeassistant_token', encryptedToken, {
                    integration: 'homeassistant',
                    migrated_from: 'environment',
                    migrated_at: new Date().toISOString()
                });
                loggers.system.info('✅ Home Assistant token migrated to encrypted database storage');
            }
        }
        
        // Load token from DB and update runtime config
        const haTokenRecord = await dal.getEncryptedSecret('homeassistant_token');
        if (haTokenRecord) {
            try {
                const decryptedToken = encryptionSystem.decrypt(haTokenRecord.encryptedValue, masterKey);
                config.integrations.homeAssistant.token = decryptedToken;
                loggers.system.info('🔐 Home Assistant token loaded from encrypted storage');
            } catch (decryptError) {
                loggers.system.error('❌ Failed to decrypt Home Assistant token:', decryptError.message);
                // Fallback to environment variable if decryption fails
                if (process.env.HA_TOKEN) {
                    config.integrations.homeAssistant.token = process.env.HA_TOKEN;
                    loggers.system.warn('⚠️ Using Home Assistant token from environment (decryption failed)');
                }
            }
        }
    } catch (error) {
        loggers.system.error('❌ Secret migration failed:', error.message);
        // Don't throw - allow app to continue with env vars
    }
}

// Initialize default admin user if it doesn't exist
async function initializeDefaultAdmin() {
    try {
        // Check if admin user exists
        const existingAdmin = await dal.get('SELECT id FROM users WHERE username = ?', ['admin']);
        
        if (!existingAdmin) {
            // Require AUTH_PASSWORD from environment for security
            const defaultPassword = process.env.AUTH_PASSWORD || (() => {
                throw new Error('AUTH_PASSWORD environment variable must be set for admin user creation');
            })();
            const bcrypt = require('bcrypt');
            const passwordHash = await bcrypt.hash(defaultPassword, config.auth.saltRounds);
            
            // Use INSERT OR IGNORE to handle race conditions during parallel initialization
            await dal.run(
                'INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['admin', 'admin@enterprise.local', passwordHash, 'admin']
            );
            
            // Check if we actually inserted (or if another process beat us)
            const adminCreated = await dal.get('SELECT id FROM users WHERE username = ?', ['admin']);
            if (adminCreated) {
                loggers.system.info('✅ Default admin user created', {
                    username: 'admin',
                    password: defaultPassword
                });
                loggers?.system?.info(`\n🔐 Default Admin Created:`);
                loggers?.system?.info(`   Username: admin`);
                loggers?.system?.info(`   Password: ${defaultPassword}`);
                loggers?.system?.info(`   Please change this password after first login!\n`);
            }
        }
    } catch (error) {
        loggers.system.error('Error creating default admin:', error);
    }
}

// System components initialization
async function initializeSystemComponents() {
    try {
        loggers.system.info('🔧 Initializing system components...');

        // Initialize managers
        metricsManager = new MetricsManager(loggers);
        await metricsManager.initialize();
        if (dal) dal.metricsManager = metricsManager;

        userManager = new UserManager(config, loggers, dal);
        
        // Initialize authentication middleware AFTER userManager is ready
        // This ensures the middleware can properly reference userManager
        const requireAuth = (req, res, next) => {
            // Extract token from session (web UI) OR Authorization header (API clients)
            let token = req.session?.token;
            let tokenSource = 'session';
            
            // Check for Bearer token in Authorization header
            if (!token && req.headers.authorization) {
                const authHeader = req.headers.authorization;
                if (authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7); // Remove 'Bearer ' prefix
                    tokenSource = 'bearer';
                }
            }
            
            loggers.security.info(`Auth check for ${req.originalUrl}: token=${token ? 'present' : 'missing'} (source: ${tokenSource})`);
            
            if (!token) {
                loggers.security.warn(`No token for ${req.originalUrl}, redirecting to login`);
                if (req.originalUrl.startsWith('/api/')) {
                    return res.status(401).json({ success: false, error: 'Authentication required' });
                }
                return res.redirect('/login');
            }

            const user = userManager.verifyJWT(token);
            if (!user) {
                loggers.security.warn(`Invalid token for ${req.originalUrl}, redirecting to login`);
                if (req.originalUrl.startsWith('/api/')) {
                    return res.status(401).json({ success: false, error: 'Invalid token' });
                }
                return res.redirect('/login');
            }

            loggers.security.info(`Auth successful for ${req.originalUrl}, user: ${user.username} (via ${tokenSource})`);
            req.user = user;
            
            // Update session last_activity (use explicit UTC time)
            const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
            dal.run(
                `UPDATE user_sessions SET last_activity = ? WHERE session_token = ? AND is_active = 1`,
                [utcNow, token],
                (err) => {
                    if (err) loggers.system.error('Failed to update session activity:', err);
                }
            );
            
            next();
        };

        const requireAdmin = (req, res, next) => {
            // Strict role check - only users with 'admin' role can access
            if (req.user?.role !== 'admin') {
                loggers.security.warn(`Admin access denied for user: ${req.user?.username} (role: ${req.user?.role})`);
                if (req.originalUrl.startsWith('/api/')) {
                    return res.status(403).json({ error: 'Admin access required' });
                }
                return res.status(403).send('<h1>Access Denied</h1><p>Administrator privileges required</p>');
            }
            next();
        };

        // Make middleware available to app
        app.locals.requireAuth = requireAuth;
        app.locals.requireAdmin = requireAdmin;
        
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
                    // Record per-source metrics based on category (stored in source field)
                    const bytes = typeof message === 'string' ? message.length : 0;
                    metricsManager.recordIngestion(logEntry.source || 'system', bytes);
                }
                return logId;
            } catch (error) {
                loggers.system.error('Database log insert error:', error);
                throw error;
            }
        };
        
    integrationManager = new IntegrationManager(config, loggers, logToDatabase, TIMEZONE);
    await integrationManager.initialize();
    
    // Migrate HA token from environment to encrypted storage if present
    await migrateIntegrationSecretsToDatabase();
        
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

        multiProtocolIngestionEngine = new MultiProtocolIngestionEngine(dal, loggers, config);
        // Skip binding network sockets during tests to avoid EADDRINUSE
        if (process.env.NODE_ENV === 'test' || process.env.TEST_DISABLE_NETWORK === 'true') {
            loggers.system.warn('⏭️ Skipping Multi-Protocol Ingestion Engine initialization in test mode');
        } else {
            await multiProtocolIngestionEngine.initialize();
        }

        // Initialize File Ingestion Engine (directory-based log tailing)
        fileIngestionEngine = new FileIngestionEngine(config, loggers, dal);
        await fileIngestionEngine.initialize();

        dataRetentionEngine = new DataRetentionEngine(dal, loggers, config);
        await dataRetentionEngine.initialize();

        realTimeStreamingEngine = new RealTimeStreamingEngine(dal, loggers, config);
        if (process.env.NODE_ENV === 'test' || process.env.TEST_DISABLE_NETWORK === 'true') {
            loggers.system.warn('⏭️ Skipping Real-time Streaming Engine initialization in test mode');
        } else {
            await realTimeStreamingEngine.initialize();
        }

        anomalyDetectionEngine = new AnomalyDetectionEngine(dal, loggers, config);
        await anomalyDetectionEngine.initialize();

        logCorrelationEngine = new LogCorrelationEngine(dal, loggers, config);
        await logCorrelationEngine.initialize();

        performanceOptimizationEngine = new PerformanceOptimizationEngine(dal, loggers, config);
        await performanceOptimizationEngine.initialize();

    // AdvancedDashboardBuilder disabled (single dashboard mode)
    // advancedDashboardBuilder = new AdvancedDashboardBuilder(dal, loggers, config);
    // await advancedDashboardBuilder.initialize();

        // Distributed tracing initialization gated by TRACING_ENABLED env
        const tracingEnabled = String(process.env.TRACING_ENABLED || 'false').toLowerCase() === 'true';
        distributedTracingEngine = new DistributedTracingEngine(dal, loggers, config);
        if (tracingEnabled) {
            loggers.system.info('🛰️ Distributed Tracing enabled - initializing OpenTelemetry pipeline');
            await distributedTracingEngine.initialize();
        } else {
            loggers.system.info('🛰️ Distributed Tracing disabled (set TRACING_ENABLED=true to activate)');
        }

        loggers.system.info('✅ All system components initialized successfully');
        loggers.system.info('📊 System Summary:');
        loggers.system.info('   • Database: SQLite with DAL optimization');
    loggers.system.info('   • Engines: 10 enterprise engines loaded (including File Ingestion)');
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

        // Extract middleware from app.locals (initialized in initializeSystemComponents)
        const requireAuth = app.locals.requireAuth;
        const requireAdmin = app.locals.requireAdmin;
        
        if (!requireAuth || !requireAdmin) {
            throw new Error('Auth middleware not initialized! Call initializeSystemComponents first.');
        }

        // REMOVED DUPLICATE /health endpoint - already defined at line 153
        // app.get('/health', (req, res) => { ... })

        // Root redirect
        app.get('/', (req, res) => res.redirect('/dashboard'));

    // Engine status route (Unix philosophy: simple status resource)
    const enginesStatusRouter = require('./routes/api/engines-status');
    app.use('/api/engines/status', requireAuth, enginesStatusRouter);

    // Expose engine references for status route without tight coupling
    app.locals.alertingEngine = alertingEngine;
    app.locals.advancedSearchEngine = advancedSearchEngine;
    app.locals.multiProtocolIngestionEngine = multiProtocolIngestionEngine;
    app.locals.fileIngestionEngine = fileIngestionEngine;
    app.locals.dataRetentionEngine = dataRetentionEngine;
    app.locals.realTimeStreamingEngine = realTimeStreamingEngine;
    app.locals.anomalyDetectionEngine = anomalyDetectionEngine;
    app.locals.logCorrelationEngine = logCorrelationEngine;
    app.locals.performanceOptimizationEngine = performanceOptimizationEngine;
    // Builder disabled; leave null reference for status route
    app.locals.advancedDashboardBuilder = advancedDashboardBuilder;
    app.locals.distributedTracingEngine = distributedTracingEngine;

        // Mount authentication pages router (login, etc.)
        const authPagesRouter = require('./routes/auth-pages');
        app.use('/', authPagesRouter);

        // REMOVED: Login page inline code - now in routes/auth-pages.js (577 lines extracted)

        // Authentication endpoints
        app.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.headers['user-agent'] || 'unknown';
                
                if (!username || !password) {
                    return res.status(400).json({ success: false, error: 'username and password are required' });
                }

                const result = await userManager.authenticateUser(username, password);
                
                if (result.success) {
                    const token = userManager.generateJWT(result.user);
                    
                    // Regenerate session to prevent fixation and ensure persistence before responding
                    return req.session.regenerate(async (regenErr) => {
                        if (regenErr) {
                            loggers.security.error('Session regenerate error during login:', regenErr);
                            return res.status(500).json({ success: false, error: 'Login failed' });
                        }

                        req.session.token = token;

                        // Log successful login to activity
                        if (dal && dal.logActivity) {
                            try {
                                await dal.logActivity({
                                    user_id: result.user.id,
                                    action: 'login',
                                    resource_type: 'auth',
                                    resource_id: result.user.id.toString(),
                                    details: JSON.stringify({ username: result.user.username, method: 'password' }),
                                    ip_address: clientIp,
                                    user_agent: userAgent
                                });
                            } catch (auditErr) {
                                loggers.security.warn('Failed to log activity for login:', auditErr.message);
                            }
                        }

                        req.session.save((saveErr) => {
                            if (saveErr) {
                                loggers.security.error('Session save error during login:', saveErr);
                                return res.status(500).json({ success: false, error: 'Login failed' });
                            }
                            return res.json({ success: true, token, user: result.user });
                        });
                    });
                } else {
                    // Log failed login attempt
                    if (dal && dal.logActivity) {
                        try {
                            await dal.logActivity({
                                user_id: null,
                                action: 'login_failed',
                                resource_type: 'auth',
                                resource_id: username,
                                details: JSON.stringify({ username, reason: result.error || 'invalid_credentials' }),
                                ip_address: clientIp,
                                user_agent: userAgent
                            });
                        } catch (auditErr) {
                            loggers.security.warn('Failed to log activity for failed login:', auditErr.message);
                        }
                    }
                    
                    // Authentication failed
                    res.status(401).json({ success: false, error: 'Invalid credentials' });
                }
            } catch (error) {
                loggers.security.error('Login error:', error);
                res.status(500).json({ success: false, error: 'Login failed' });
            }
        });

        app.post('/api/auth/logout', (req, res) => {
            // Log logout activity
            if (req.user && dal && dal.logActivity) {
                const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.headers['user-agent'] || 'unknown';
                dal.logActivity({
                    user_id: req.user.id,
                    action: 'logout',
                    resource_type: 'auth',
                    resource_id: req.user.id.toString(),
                    details: JSON.stringify({ username: req.user.username }),
                    ip_address: clientIp,
                    user_agent: userAgent
                }).catch(err => loggers.security.warn('Failed to log logout activity:', err.message));
            }
            
            req.session.destroy();
            res.json({ success: true });
        });

        // Token validation endpoint
        app.get('/api/auth/validate', requireAuth, (req, res) => {
            res.json({
                success: true,
                user: req.user
            });
        });

        // Core routes
    app.use('/dashboard', requireAuth, require('./routes/dashboard'));
        app.use('/logs', requireAuth, require('./routes/logs'));
        app.use('/log-analyzer', requireAuth, require('./routes/log-analyzer'));
        app.use('/search', requireAuth, require('./routes/search'));
        app.use('/webhooks', requireAuth, require('./routes/webhooks'));
        app.use('/integrations', requireAuth, require('./routes/integrations'));
        app.use('/activity', requireAuth, require('./routes/activity'));

        // Admin routes
        app.use('/admin/users', requireAuth, requireAdmin, require('./routes/admin/users')(getPageTemplate, requireAuth));
        app.use('/admin', requireAuth, requireAdmin, require('./routes/admin/settings'));
        app.use('/admin/health', requireAuth, requireAdmin, require('./routes/admin/health')(getPageTemplate, requireAuth));
        app.use('/admin', requireAuth, requireAdmin, require('./routes/admin/security')(getPageTemplate, requireAuth));
        app.use('/admin/api-keys', requireAuth, requireAdmin, require('./routes/admin/api-keys')(getPageTemplate, requireAuth));
        app.use('/admin/search-advanced', requireAuth, requireAdmin, require('./routes/admin/search-advanced'));
        app.use('/admin/ingestion', requireAuth, requireAdmin, require('./routes/admin/ingestion'));
        // Instrumented mount for /admin/tracing to isolate Unexpected identifier error
        try {
            app.use('/admin/tracing', requireAuth, requireAdmin, require('./routes/admin/tracing'));
            loggers.system.info('Mounted /admin/tracing route');
        } catch (e) {
            loggers.system.error('❌ Failed mounting /admin/tracing route: ' + e.message);
            if (e && e.stack) loggers.system.error(e.stack);
        }
    // Builder admin removed
    // app.use('/admin/dashboards', requireAuth, requireAdmin, require('./routes/admin/dashboards'));

        // Dashboard API routes
        
        // Request metrics tracking middleware (tracks all /api/* requests)
        const requestMetricsMiddleware = require('./middleware/request-metrics');
        app.use(requestMetricsMiddleware(dal));
        
    // Builder API removed
    // app.use('/api/dashboards', requireAuth, require('./routes/api/dashboards'));
    // Notifications API (parse error notifications)
    app.use('/api/notifications', requireAuth, require('./routes/api/notifications'));
    app.use('/api/logs', requireAuth, require('./routes/api/logs'));
    // Register analytics API (restored from monolithic feature set)
    app.use('/api/analytics', requireAuth, require('./routes/api/analytics'));
    app.use('/api/notes', requireAuth, require('./routes/api/notes'));
    app.use('/api/bookmarks', requireAuth, require('./routes/api/bookmarks'));
        app.use('/api/activity', requireAuth, require('./routes/api/activity'));
        app.use('/api/webhooks', requireAuth, require('./routes/api/webhooks'));
        app.use('/api/search', requireAuth, require('./routes/api/search'));
        app.use('/api/dashboard', requireAuth, require('./routes/api/dashboard'));
        // WebSocket clients inspection endpoint (REST) for parity with monolithic
        app.get('/api/websocket/clients', requireAuth, async (req, res) => {
            try {
                if (!wsServer) {
                    return res.json({ success: false, error: 'WebSocket server not initialized', clients: [] });
                }
                
                const clients = [];
                for (const [clientId, clientData] of wsClients.entries()) {
                    clients.push({
                        id: clientId,
                        authenticated: clientData.authenticated,
                        username: clientData.username || 'anonymous',
                        connectedAt: clientData.connectedAt,
                        lastPing: new Date(clientData.lastPing).toISOString(),
                        subscriptions: Array.from(clientData.subscriptions || []),
                        status: clientData.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
                    });
                }
                
                res.json({ success: true, total: clients.length, clients });
            } catch (error) {
                loggers.system.error('WebSocket clients endpoint error:', error);
                res.status(500).json({ success: false, error: 'Failed to enumerate WebSocket clients' });
            }
        });
        
        // Admin API routes
        app.use('/api/settings', requireAuth, require('./routes/api/settings'));
        // REMOVED DUPLICATE: app.use('/api/api-keys', requireAuth, require('./routes/api/settings')); // WRONG FILE!
        // Instrumented mount for /api/tracing to isolate Unexpected identifier error
        try {
            app.use('/api/tracing', requireAuth, require('./routes/api/tracing'));
            loggers.system.info('Mounted /api/tracing route');
        } catch (e) {
            loggers.system.error('❌ Failed mounting /api/tracing route: ' + e.message);
            if (e && e.stack) loggers.system.error(e.stack);
        }
        app.use('/api/ingestion', requireAuth, require('./routes/api/ingestion'));
        app.use('/api/users', requireAuth, require('./routes/api/users'));
        app.use('/api/admin', requireAuth, require('./routes/api/admin'));
        app.use('/api/admin', requireAuth, require('./routes/api/admin-tools'));
        app.use('/api/roles', requireAuth, require('./routes/api/users'));
        app.use('/api/log-analyzer', requireAuth, require('./api/log-analyzer'));
    app.use('/api', requireAuth, require('./routes/api/alerts'));
    app.use('/api', requireAuth, require('./routes/api/system'));
    app.use('/api', requireAuth, require('./routes/api/stats'));
        // REMOVED DUPLICATE: app.use('/api/admin', requireAuth, require('./routes/api/admin'));
        app.use('/api', requireAuth, require('./routes/api/backups'));
        app.use('/api', requireAuth, require('./routes/api/user-theme'));
        app.use('/api', requireAuth, require('./routes/api/themes'));
        app.use('/api', requireAuth, require('./routes/api/saved-searches'));
        app.use('/api', requireAuth, require('./routes/api/integrations'));
        app.use('/api', requireAuth, require('./routes/api/secrets'));
        app.use('/api', requireAuth, require('./routes/api/api-keys'));
        app.use('/api', requireAuth, require('./routes/api/security'));  // Contains /rate-limits, /audit-trail, /security/* routes
        // REMOVED DUPLICATES - security.js now handles these paths:
        // app.use('/api', requireAuth, require('./routes/api/rate-limits'));
        // app.use('/api', requireAuth, require('./routes/api/audit-trail'));

        // Enhanced log ingestion endpoint with geographic and user-agent analysis
        // NOTE: No authentication required to allow Home Assistant and ESP32 devices to send logs
        app.post('/log', async (req, res) => {
            try {
                const { 
                    message, 
                    level,
                    severity, // Node-RED uses 'severity' instead of 'level'
                    category = 'esp32',
                    // Additional context fields that may be sent by integrations
                    source: explicitSource,
                    entity_id: topLevelEntityId,
                    automation_name: topLevelAutomationName,
                    automation_id,
                    trigger,
                    context,
                    node_id,
                    flow_id,
                    hostname,
                    tags,
                    metadata: incomingMetadata
                } = req.body;
                
                // Parse metadata if it's a string (could be JSON stringified)
                let parsedMetadata = {};
                if (typeof incomingMetadata === 'string') {
                    try { parsedMetadata = JSON.parse(incomingMetadata); } catch (_) {}
                } else if (typeof incomingMetadata === 'object' && incomingMetadata !== null) {
                    parsedMetadata = incomingMetadata;
                }
                
                // Extract entity_id from metadata if not at top level (Node-RED pattern)
                const entity_id = topLevelEntityId || parsedMetadata.entity_id;
                const automation_name = topLevelAutomationName || parsedMetadata.automation_name;
                const domain = parsedMetadata.domain;
                const service = parsedMetadata.service;
                
                // Support both 'level' and 'severity' field names
                const effectiveLevel = level || severity || 'info';
                
                const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.headers['user-agent'] || 'unknown';
                
                // Build a more descriptive source from available context
                // Priority: automation_name > entity_id > domain.service > explicit source > category
                let effectiveSource = explicitSource || category;
                if (automation_name) {
                    effectiveSource = automation_name;
                } else if (entity_id && entity_id !== 'none') {
                    effectiveSource = entity_id;
                } else if (domain && service) {
                    effectiveSource = `${domain}.${service}`;
                } else if (node_id && flow_id) {
                    effectiveSource = `node-red:${flow_id}/${node_id}`;
                }
                
                // Compile metadata from all context fields
                const compiledMetadata = {
                    ...parsedMetadata,
                    ...(entity_id && { entity_id }),
                    ...(automation_name && { automation_name }),
                    ...(automation_id && { automation_id }),
                    ...(trigger && { trigger }),
                    ...(context && { context }),
                    ...(node_id && { node_id }),
                    ...(flow_id && { flow_id }),
                    original_category: category
                };
                
                // Enhanced log entry with geographic and user-agent data
                const logEntry = {
                    level: effectiveLevel,
                    message,
                    source: effectiveSource,
                    ip: clientIp,
                    timestamp: new Date().toISOString(),
                    user_agent: userAgent,
                    hostname: hostname || null,
                    tags: Array.isArray(tags) ? tags.join(',') : (tags || null),
                    metadata: Object.keys(compiledMetadata).length > 1 ? JSON.stringify(compiledMetadata) : null
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
                        logEntry.browser = parsed.toAgent();
                        logEntry.os = parsed.os.toString();
                        logEntry.device = parsed.device.toString();
                    } catch (uaError) {
                        loggers.system.warn('User-agent parsing failed:', uaError.message);
                    }
                }
                
                // Prefer batched ingestion for higher reliability under load
                if (dal && typeof dal.enqueueLogEntry === 'function') {
                    dal.enqueueLogEntry(logEntry);
                    if (metricsManager) metricsManager.incrementLogs();
                } else {
                    await dal.createLogEntry(logEntry);
                    if (metricsManager) metricsManager.incrementLogs();
                }
                
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

        // REMOVED: Mock tracing search endpoint (handled by routes/api/tracing.js)

        // REMOVED: Mock settings endpoint (use routes/api/settings.js)

        // NOTE: API Keys management is now handled by routes/api/api-keys.js
        // Those routes are mounted via: app.use('/api', requireAuth, require('./routes/api/api-keys'));

        // System Metrics API endpoints  
        app.get('/api/metrics/system', (req, res) => {
            try {
                const memoryUsage = process.memoryUsage();
                const cpuUsage = process.cpuUsage();
                const uptime = process.uptime();

                // Calculate CPU percentage (approximation)
                const cpuPercent = Math.min(100, Math.max(0, 
                    ((cpuUsage.user + cpuUsage.system) / 1000000 / uptime) * 100
                ));

                // Memory calculations
                const totalMemory = memoryUsage.heapTotal;
                const usedMemory = memoryUsage.heapUsed;
                const memoryPercent = (usedMemory / totalMemory) * 100;

                // Format uptime
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);

                const metrics = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    memory: {
                        used: Math.round(usedMemory / 1024 / 1024), // MB
                        total: Math.round(totalMemory / 1024 / 1024), // MB
                        percentage: Math.round(memoryPercent * 100) / 100,
                        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
                    },
                    cpu: {
                        percentage: Math.round(cpuPercent * 100) / 100,
                        user: cpuUsage.user,
                        system: cpuUsage.system
                    },
                    uptime: {
                        seconds: Math.floor(uptime),
                        formatted: `${hours}h ${minutes}m ${seconds}s`,
                        hours: hours,
                        minutes: minutes
                    },
                    system: {
                        platform: process.platform,
                        arch: process.arch,
                        nodeVersion: process.version,
                        pid: process.pid
                    }
                };

                res.json(metrics);
            } catch (error) {
                loggers.system.error('System metrics API error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch system metrics'
                });
            }
        });

        app.get('/api/metrics/database', async (req, res) => {
            try {
                const fs = require('fs');
                let dbStats = {
                    size: 0,
                    tables: 4,
                    lastBackup: null
                };

                try {
                    const dbPath = './database.db';
                    if (fs.existsSync(dbPath)) {
                        const stats = fs.statSync(dbPath);
                        dbStats.size = Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
                        dbStats.lastModified = stats.mtime.toISOString();
                    }
                } catch (e) {
                    loggers.system.warn('Could not read database stats:', e.message);
                }

                // Get real query statistics from request_metrics table
                let queryStats = {
                    totalQueries: 0,
                    avgQueryTime: 0,
                    cacheHitRate: 0
                };
                
                try {
                    if (dal) {
                        // Total queries from request_metrics
                        const totalResult = await dal.get('SELECT COUNT(*) as count FROM request_metrics');
                        queryStats.totalQueries = totalResult ? totalResult.count : 0;
                        
                        // Average query time from recent requests
                        const avgResult = await dal.get(`
                            SELECT AVG(response_time_ms) as avgTime
                            FROM request_metrics
                            WHERE timestamp >= datetime('now', 'localtime', '-1 hour')
                        `);
                        queryStats.avgQueryTime = avgResult && avgResult.avgTime ? 
                            Math.round(avgResult.avgTime) : 0;
                        
                        // Cache hit rate approximation from status codes (2xx vs others)
                        const cacheResult = await dal.get(`
                            SELECT 
                                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as hits,
                                COUNT(*) as total
                            FROM request_metrics
                            WHERE timestamp >= datetime('now', 'localtime', '-1 hour')
                        `);
                        
                        if (cacheResult && cacheResult.total > 0) {
                            queryStats.cacheHitRate = Math.round((cacheResult.hits / cacheResult.total) * 100);
                        }
                    }
                } catch (dbError) {
                    loggers.system.warn('Could not fetch query statistics:', dbError.message);
                }

                const metrics = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    database: dbStats,
                    performance: {
                        connectionPool: 1,
                        activeConnections: 1,
                        avgQueryTime: queryStats.avgQueryTime + 'ms',
                        totalQueries: queryStats.totalQueries,
                        cacheHitRate: queryStats.cacheHitRate
                    }
                };

                res.json(metrics);
            } catch (error) {
                loggers.system.error('Database metrics API error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch database metrics'
                });
            }
        });

        app.get('/api/metrics/requests', async (req, res) => {
            try {
                const timeRange = req.query.range || '24h';
                let timeCondition = '';
                
                // Calculate time condition based on range
                switch(timeRange) {
                    case '1h':
                        timeCondition = "timestamp >= datetime('now', '-1 hour')";
                        break;
                    case '24h':
                        timeCondition = "timestamp >= datetime('now', '-1 day')";
                        break;
                    case '7d':
                        timeCondition = "timestamp >= datetime('now', '-7 days')";
                        break;
                    case '30d':
                        timeCondition = "timestamp >= datetime('now', '-30 days')";
                        break;
                    default:
                        timeCondition = "timestamp >= datetime('now', '-1 day')";
                }
                
                // Get request counts and statistics
                const totalRequests = await dal.get(
                    `SELECT COUNT(*) as total, 
                            AVG(response_time_ms) as avgTime,
                            MAX(response_time_ms) as maxTime,
                            MIN(response_time_ms) as minTime
                     FROM request_metrics`
                );
                
                const recentRequests = await dal.get(
                    `SELECT COUNT(*) as count, AVG(response_time_ms) as avgTime
                     FROM request_metrics WHERE ${timeCondition}`
                );
                
                const lastHourRequests = await dal.get(
                    `SELECT COUNT(*) as count
                     FROM request_metrics 
                     WHERE timestamp >= datetime('now', '-1 hour')`
                );
                
                // Top endpoints by request count
                const topEndpoints = await dal.all(
                    `SELECT endpoint, method, COUNT(*) as requests, 
                            ROUND(AVG(response_time_ms), 2) as avgTime
                     FROM request_metrics
                     WHERE ${timeCondition}
                     GROUP BY endpoint, method
                     ORDER BY requests DESC
                     LIMIT 10`
                );
                
                // Status code distribution
                const statusCodes = await dal.all(
                    `SELECT status_code, COUNT(*) as count
                     FROM request_metrics
                     WHERE ${timeCondition}
                     GROUP BY status_code
                     ORDER BY status_code`
                );
                
                const statusCodeMap = {};
                statusCodes.forEach(row => {
                    statusCodeMap[row.status_code.toString()] = row.count;
                });
                
                const metrics = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    timeRange,
                    requests: {
                        total: totalRequests.total || 0,
                        inRange: recentRequests.count || 0,
                        lastHour: lastHourRequests.count || 0,
                        perMinute: Math.round((lastHourRequests.count || 0) / 60),
                        avgResponseTime: recentRequests.avgTime ? 
                            Math.round(recentRequests.avgTime) + 'ms' : '0ms'
                    },
                    endpoints: topEndpoints.map(ep => ({
                        path: `${ep.method} ${ep.endpoint}`,
                        requests: ep.requests,
                        avgTime: Math.round(ep.avgTime) + 'ms'
                    })),
                    statusCodes: statusCodeMap
                };

                res.json(metrics);
            } catch (error) {
                loggers.system.error('Request metrics API error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch request metrics'
                });
            }
        });

        // Theme Management API - handled by routes/api/themes.js module

        // Backup Management API - handled by routes/api/backups.js module

        // REMOVED DUPLICATE /health endpoint - already defined at line 153
        // app.get('/health', (req, res) => { ... })

        // Analytics Advanced endpoint
        app.get('/analytics-advanced', requireAuth, (req, res) => {
            try {
                const contentBody = `
                <div class="analytics-dashboard">
                    <h2><i class="fas fa-chart-line"></i> Advanced Analytics</h2>
                    
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h5 class="card-title">Total Logs</h5>
                                    <h3 id="total-logs" class="text-primary">Loading...</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h5 class="card-title">Error Rate</h5>
                                    <h3 id="error-rate" class="text-danger">Loading...</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h5 class="card-title">Active Connections</h5>
                                    <h3 id="active-connections" class="text-success">Loading...</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h5 class="card-title">Uptime</h5>
                                    <h3 id="uptime" class="text-info">Loading...</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5>Performance Metrics</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="performance-chart" width="400" height="200"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5>Log Trends</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="trends-chart" width="400" height="200"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <script>
                    // Ensure Chart.js is available (loaded elsewhere or add CDN if missing)
                    (function ensureChart(){
                        if (typeof Chart === 'undefined') {
                            const s = document.createElement('script');
                            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
                            document.head.appendChild(s);
                        }
                    })();

                    let performanceChart, trendsChart;

                    function placeholderIfEmpty(arr, label='No Data') {
                        if (!Array.isArray(arr) || arr.length === 0) {
                            return { labels:[label], values:[0], _empty:true };
                        }
                        return arr;
                    }

                    function setMetric(id, value, emptyMsg) {
                        const el = document.getElementById(id);
                        if (!el) return;
                        if (value === 0 || value === '0' || value === 0.00) {
                            el.textContent = '0';
                            if (emptyMsg) {
                                el.parentElement.querySelector('.card-title + h3')?.classList?.add('text-muted');
                            }
                        } else {
                            el.textContent = value;
                        }
                    }

                    function updateCards(data){
                        const overview = data?.data?.overview || { totalLogs:0,errorRate:0,activeConnections:0 };
                        const perf = data?.data?.performance || { uptime:0 };
                        document.getElementById('total-logs').textContent = (overview.totalLogs||0).toLocaleString();
                        document.getElementById('error-rate').textContent = (overview.errorRate||0) + '%';
                        document.getElementById('active-connections').textContent = overview.activeConnections||0;
                        document.getElementById('uptime').textContent = Math.floor((perf.uptime||0) / 3600) + 'h';
                        if ((overview.totalLogs||0) === 0){
                            document.getElementById('total-logs').insertAdjacentHTML('afterend','<div style="font-size:0.75rem;color:var(--text-muted);">No log data yet</div>');
                        }
                    }

                    function initPerformanceChart(data){
                        const ctx = document.getElementById('performance-chart').getContext('2d');
                        const perf = data?.data?.performance?.normalized || { memoryMB:0, cpuPercent:0 };
                        const labels = ['Memory (MB)','CPU (%)'];
                        const values = [perf.memoryMB, perf.cpuPercent];
                        performanceChart = new Chart(ctx, {
                            type:'bar',
                            data:{ labels, datasets:[{ label:'Performance', data:values, backgroundColor:['#3b82f6','#10b981'] }] },
                            options:{ responsive:true, scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Value' } } } }
                        });
                    }

                    function initTrendsChart(data){
                        const ctx = document.getElementById('trends-chart').getContext('2d');
                        const daily = data?.data?.trends?.daily || [];
                        const labels = daily.map(d=>d.date);
                        const values = daily.map(d=>d.count);
                        const placeholder = labels.length===0;
                        trendsChart = new Chart(ctx, {
                            type:'line',
                            data:{ labels: placeholder?['No Data']:labels, datasets:[{ label:'Daily Logs', data: placeholder?[0]:values, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.25)', tension:0.3 }] },
                            options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
                        });
                    }

                    function updateCharts(data){
                        if (!performanceChart) initPerformanceChart(data); else {
                            const perf = data?.data?.performance?.normalized || { memoryMB:0, cpuPercent:0 };
                            performanceChart.data.datasets[0].data = [perf.memoryMB, perf.cpuPercent];
                            performanceChart.update();
                        }
                        if (!trendsChart) initTrendsChart(data); else {
                            const daily = data?.data?.trends?.daily || [];
                            const labels = daily.map(d=>d.date);
                            const values = daily.map(d=>d.count);
                            if (labels.length===0){
                                trendsChart.data.labels=['No Data'];
                                trendsChart.data.datasets[0].data=[0];
                            } else {
                                trendsChart.data.labels=labels;
                                trendsChart.data.datasets[0].data=values;
                            }
                            trendsChart.update();
                        }
                    }

                    // Load analytics data with empty-state handling
                    async function loadAnalyticsData() {
                        try {
                            const response = await fetch('/api/analytics/data', { credentials: 'same-origin' });
                            const data = await response.json();
                            updateCards(data);
                            updateCharts(data);
                        } catch (error) {
                            loggers?.system?.error('Failed to load analytics data:', error);
                            ['total-logs','error-rate','active-connections','uptime'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='Error'; });
                        }
                    }

                    document.addEventListener('DOMContentLoaded', loadAnalyticsData);
                    setInterval(loadAnalyticsData, 30000);
                </script>
                `;

                const html = getPageTemplate({
                    pageTitle: 'Advanced Analytics',
                    pageIcon: 'fas fa-chart-line',
                    activeNav: 'analytics',
                    contentBody: contentBody,
                    req: req
                });
                
                res.send(html);
            } catch (error) {
                loggers.system.error('Analytics endpoint error:', error);
                res.status(500).json({
                    status: 'error',
                    message: 'Failed to retrieve analytics data',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Analytics data API endpoint
        app.get('/api/analytics/data', requireAuth, async (req, res) => {
            try {
                const analyticsData = {
                    status: 'success',
                    data: {
                        overview: {
                            totalLogs: 0,
                            errorRate: 0,
                            avgResponseTime: 0,
                            activeConnections: 0
                        },
                        trends: {
                            hourly: [],
                            daily: [],
                            weekly: []
                        },
                        performance: {
                            raw: {
                                cpuUsage: process.cpuUsage(),
                                memoryUsage: process.memoryUsage()
                            },
                            uptime: Math.floor(process.uptime()),
                            normalized: {
                                cpuPercent: 0,
                                memoryMB: 0,
                                memoryPercent: 0
                            }
                        },
                        alerts: []
                    },
                    timestamp: new Date().toISOString()
                };

                // Get actual data from database if available
                try {
                    if (req.dal) {
                        // Total logs count
                        const totalLogs = await req.dal.getLogCount();
                        analyticsData.data.overview.totalLogs = totalLogs;
                        
                        // Calculate error rate from all logs
                        const errorLogs = await req.dal.getLogCount({ level: 'error' });
                        analyticsData.data.overview.errorRate = totalLogs > 0 ? 
                            parseFloat(((errorLogs / totalLogs) * 100).toFixed(2)) : 0;
                        
                        // Get real trend data using new DAL methods
                        if (req.dal.getDailyLogTrends) {
                            const dailyTrends = await req.dal.getDailyLogTrends(7);
                            analyticsData.data.trends.daily = dailyTrends.map(d => ({
                                date: d.date,
                                count: d.count,
                                errors: d.errors || 0,
                                warnings: d.warnings || 0
                            }));
                        }
                        
                        if (req.dal.getHourlyLogTrends) {
                            const hourlyTrends = await req.dal.getHourlyLogTrends(24);
                            analyticsData.data.trends.hourly = hourlyTrends.map(h => ({
                                hour: h.hour,
                                count: h.count,
                                errors: h.errors || 0,
                                warnings: h.warnings || 0
                            }));
                        }
                        
                        if (req.dal.getWeeklyLogTrends) {
                            const weeklyTrends = await req.dal.getWeeklyLogTrends(4);
                            analyticsData.data.trends.weekly = weeklyTrends.map(w => ({
                                week: w.week,
                                count: w.count,
                                errors: w.errors || 0,
                                warnings: w.warnings || 0
                            }));
                        }
                        
                        // Active connections from WebSocket if available
                        try {
                            if (wsServer) {
                                analyticsData.data.overview.activeConnections = wsClients.size;
                            }
                        } catch (_) { /* wsServer not available */ }
                        
                        // Average response time from request_metrics table
                        const avgTimeResult = await req.dal.get(`
                            SELECT AVG(response_time_ms) as avgTime
                            FROM request_metrics
                            WHERE timestamp >= datetime('now', 'localtime', '-1 hour')
                        `);
                        
                        if (avgTimeResult && avgTimeResult.avgTime) {
                            analyticsData.data.overview.avgResponseTime = 
                                parseFloat(avgTimeResult.avgTime.toFixed(2));
                        }

                        // Normalized CPU% (fallback similar to DAL logic for Windows)
                        try {
                            const os = require('os');
                            const loadAvg = os.loadavg()[0];
                            const cpuCount = os.cpus().length;
                            if (loadAvg && loadAvg > 0) {
                                analyticsData.data.performance.normalized.cpuPercent = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);
                            } else {
                                // Derive from process.cpuUsage since last request if available
                                if (!req.app.locals._lastCpuSample) {
                                    req.app.locals._lastCpuSample = { usage: process.cpuUsage(), time: Date.now() };
                                    analyticsData.data.performance.normalized.cpuPercent = 0;
                                } else {
                                    const now = Date.now();
                                    const current = process.cpuUsage();
                                    const elapsedMs = now - req.app.locals._lastCpuSample.time;
                                    if (elapsedMs > 0) {
                                        const userDiff = current.user - req.app.locals._lastCpuSample.usage.user;
                                        const sysDiff = current.system - req.app.locals._lastCpuSample.usage.system;
                                        const totalDiffMicros = userDiff + sysDiff;
                                        const percentOneCore = (totalDiffMicros / 1000) / elapsedMs * 100;
                                        analyticsData.data.performance.normalized.cpuPercent = Math.min(100, Math.max(0, Math.round(percentOneCore / cpuCount)));
                                    }
                                    req.app.locals._lastCpuSample = { usage: current, time: now };
                                }
                            }
                        } catch (_) { /* ignore cpu calc errors */ }

                        // Normalized memory metrics
                        try {
                            const mem = analyticsData.data.performance.raw.memoryUsage;
                            const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
                            const heapTotalMB = Math.max(1, Math.round(mem.heapTotal / 1024 / 1024));
                            analyticsData.data.performance.normalized.memoryMB = heapUsedMB;
                            analyticsData.data.performance.normalized.memoryPercent = Math.min(100, Math.round((heapUsedMB / heapTotalMB) * 100));
                        } catch (memErr) { 
                            loggers.system.warn('Memory calc error:', memErr); 
                        }
                    }
                } catch (dbError) {
                    loggers.system.error('Failed to get analytics data:', dbError);
                }

                res.json(analyticsData);
            } catch (error) {
                loggers.system.error('Analytics data API error:', error);
                res.status(500).json({ 
                    status: 'error', 
                    error: 'Analytics data unavailable' 
                });
            }
        });

        // API Ingestion Status endpoint
        app.get('/api/ingestion/status', async (req, res) => {
            try {
                // Get log counts by source/protocol from database
                let protocolCounts = {};
                let totalMessages = 0;
                let errors = 0;
                
                if (dal) {
                    try {
                        // Get total log count
                        const totalResult = await dal.get('SELECT COUNT(*) as count FROM logs');
                        totalMessages = totalResult ? totalResult.count : 0;
                        
                        // Get counts by source/protocol
                        const protocolResult = await dal.all(`
                            SELECT source, COUNT(*) as count 
                            FROM logs 
                            GROUP BY source
                        `);
                        
                        if (protocolResult && Array.isArray(protocolResult)) {
                            protocolResult.forEach(row => {
                                const protocol = row.source || 'unknown';
                                protocolCounts[protocol] = row.count;
                            });
                        }
                        
                        // Get error count (warning and error levels)
                        const errorResult = await dal.get(`
                            SELECT COUNT(*) as count 
                            FROM logs 
                            WHERE level IN ('error', 'warning')
                        `);
                        errors = errorResult ? errorResult.count : 0;
                        
                    } catch (dbError) {
                        loggers.system.warn('Database query error in ingestion status:', dbError);
                    }
                }
                
                // If no protocol data, provide some default structure
                if (Object.keys(protocolCounts).length === 0) {
                    protocolCounts = {
                        'syslog': 0,
                        'gelf': 0,
                        'beats': 0,
                        'fluent': 0,
                        'http': 0,
                        'system': totalMessages
                    };
                }

                const memUsage = process.memoryUsage();
                const response = {
                    success: true,
                    stats: {
                        totalMessages: totalMessages,
                        connectionsActive: 6, // Number of protocol listeners
                        bytesReceived: Math.round(memUsage.heapUsed / 1024), // Convert to KB
                        errors: errors,
                        messagesByProtocol: protocolCounts
                    },
                    health: {
                        database: dal ? 'connected' : 'disconnected',
                        memory: {
                            used: Math.round(memUsage.heapUsed / 1024 / 1024),
                            total: Math.round(memUsage.heapTotal / 1024 / 1024)
                        },
                        uptime: Math.floor(process.uptime())
                    },
                    timestamp: new Date().toISOString()
                };

                res.json(response);
            } catch (error) {
                loggers.system.error('Ingestion status endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to retrieve ingestion status',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // REMOVED: Mock tracing dependencies endpoint (use routes/api/tracing.js)

        // REMOVED: Mock tracing status endpoint (use routes/api/tracing.js)

        // Global error handler to ensure consistent JSON for API errors and safe HTML for pages
        app.use((err, req, res, next) => {
            try {
                const status = err.status || err.statusCode || 500;
                const code = err.code || undefined;
                const rawMessage = err.message || 'Unexpected error';
                const message = status >= 500 ? 'Internal Server Error' : rawMessage;

                // Log standardized error with stack for debugging
                loggers.system.error('Unhandled error:', { status, code, message: rawMessage, stack: err.stack });

                if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
                    return res.status(status).json({
                        success: false,
                        error: {
                            message,
                            code
                        },
                        path: req.originalUrl,
                        timestamp: new Date().toISOString()
                    });
                }

                // Escape HTML helper
                const escapeHtml = (s) => String(s)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

                // Attempt to render with base template when available
                try {
                    const html = getPageTemplate({
                        title: `Error ${status}`,
                        content: `<div class="container"><h1>Error ${status}</h1><p>${escapeHtml(rawMessage)}</p></div>`,
                        req
                    });
                    return res.status(status).send(html);
                } catch (_) {
                    return res.status(status).send(`<h1>Error ${status}</h1><p>${escapeHtml(rawMessage)}</p>`);
                }
            } catch (fatal) {
                // As a last resort, send minimal text
                try {
                    return res.status(500).send('Internal Server Error');
                } catch (_) {
                    return; // give up if headers already sent
                }
            }
        });

        loggers.system.info('✅ All routes configured successfully');
    } catch (error) {
        loggers.system.error('❌ Route setup failed:', error);
        if (error && error.stack) {
            loggers.system.error('❌ Route setup failed stack trace:', error.stack);
        }
    }
    }
// WebSocket server and client management
const wsClients = new Map(); // Map of clientId -> { ws, subscriptions: Set(['logs', 'alerts', 'metrics', 'sessions']) }
let wsServer = null;

/**
 * Initialize WebSocket server attached to HTTP/HTTPS server
 * @param {http.Server|https.Server} httpServer - The HTTP/HTTPS server instance
 * @returns {WebSocket.Server} The WebSocket server instance
 */
function initializeWebSocketServer(httpServer) {
    try {
        const wss = new WebSocket.Server({ 
            server: httpServer,
            path: '/ws',
            clientTracking: true
        });
        
        wsServer = wss; // Store reference for broadcast functions
        
        loggers.system.info('✅ WebSocket server initialized on path /ws');
        
        // Connection handler
        wss.on('connection', (ws, req) => {
            const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const clientInfo = {
                ws,
                subscriptions: new Set(),
                authenticated: false,
                connectedAt: new Date(),
                lastPing: Date.now()
            };
            
            wsClients.set(clientId, clientInfo);
            loggers.system.info(`WebSocket client connected: ${clientId} from ${req.socket.remoteAddress}`);
            
            // Send welcome message
            ws.send(JSON.stringify({
                event: 'connected',
                clientId,
                timestamp: new Date().toISOString()
            }));
            
            // Message handler
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    handleWebSocketMessage(clientId, data);
                } catch (error) {
                    loggers.system.error(`WebSocket message parse error from ${clientId}:`, error);
                    ws.send(JSON.stringify({
                        event: 'error',
                        error: 'Invalid JSON message'
                    }));
                }
            });
            
            // Error handler
            ws.on('error', (error) => {
                loggers.system.error(`WebSocket error for ${clientId}:`, error);
            });
            
            // Close handler
            ws.on('close', () => {
                wsClients.delete(clientId);
                loggers.system.info(`WebSocket client disconnected: ${clientId}`);
            });
            
            // Ping/pong heartbeat
            ws.on('pong', () => {
                if (wsClients.has(clientId)) {
                    wsClients.get(clientId).lastPing = Date.now();
                }
            });
        });
        
        // Heartbeat interval to detect dead connections
        const heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const staleClients = [];
            
            wsClients.forEach((client, clientId) => {
                if (now - client.lastPing > 35000) { // 35s timeout (30s + 5s grace)
                    loggers.system.warn(`WebSocket client ${clientId} timed out, terminating`);
                    client.ws.terminate();
                    staleClients.push(clientId);
                } else if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.ping();
                } else if (client.ws.readyState === WebSocket.CLOSED || client.ws.readyState === WebSocket.CLOSING) {
                    // Clean up clients in closed/closing state
                    staleClients.push(clientId);
                }
            });
            
            // Remove stale clients after iteration to avoid concurrent modification
            staleClients.forEach(id => wsClients.delete(id));
            
            // Limit total connections to prevent memory exhaustion (max 500)
            if (wsClients.size > 500) {
                const oldest = Array.from(wsClients.entries())
                    .sort((a, b) => a[1].connectedAt - b[1].connectedAt)
                    .slice(0, wsClients.size - 500);
                oldest.forEach(([id, client]) => {
                    loggers.system.warn(`Terminating oldest connection ${id} (limit exceeded)`);
                    client.ws.terminate();
                    wsClients.delete(id);
                });
            }
        }, 30000); // Ping every 30s
        
        wss.on('close', () => {
            clearInterval(heartbeatInterval);
        });
        
        return wss;
    } catch (error) {
        loggers.system.error('❌ WebSocket server initialization failed:', error);
        throw error;
    }
}

/**
 * Handle incoming WebSocket messages from clients
 * @param {string} clientId - The client identifier
 * @param {object} data - The parsed JSON message
 */
function handleWebSocketMessage(clientId, data) {
    const client = wsClients.get(clientId);
    if (!client) return;
    
    const { event, payload } = data;
    
    switch (event) {
        case 'authenticate':
            // Simple token-based authentication
            if (payload && payload.token) {
                // Verify JWT token (reuse existing auth logic)
                try {
                    const decoded = jwt.verify(payload.token, JWT_SECRET);
                    client.authenticated = true;
                    client.userId = decoded.userId;
                    client.username = decoded.username;
                    
                    client.ws.send(JSON.stringify({
                        event: 'authenticated',
                        username: decoded.username,
                        timestamp: new Date().toISOString()
                    }));
                    
                    loggers.system.info(`WebSocket client ${clientId} authenticated as ${decoded.username}`);
                } catch (error) {
                    client.ws.send(JSON.stringify({
                        event: 'error',
                        error: 'Authentication failed'
                    }));
                }
            }
            break;
            
        case 'subscribe':
            // Subscribe to event channels: logs, alerts, metrics, sessions
            if (payload && payload.channels && Array.isArray(payload.channels)) {
                payload.channels.forEach(channel => {
                    client.subscriptions.add(channel);
                });
                
                client.ws.send(JSON.stringify({
                    event: 'subscribed',
                    channels: Array.from(client.subscriptions),
                    timestamp: new Date().toISOString()
                }));
                
                loggers.system.info(`WebSocket client ${clientId} subscribed to: ${payload.channels.join(', ')}`);
            }
            break;
            
        case 'unsubscribe':
            // Unsubscribe from event channels
            if (payload && payload.channels && Array.isArray(payload.channels)) {
                payload.channels.forEach(channel => {
                    client.subscriptions.delete(channel);
                });
                
                client.ws.send(JSON.stringify({
                    event: 'unsubscribed',
                    channels: payload.channels,
                    remaining: Array.from(client.subscriptions),
                    timestamp: new Date().toISOString()
                }));
            }
            break;
            
        case 'ping':
            // Manual ping/pong for application-level heartbeat
            client.ws.send(JSON.stringify({
                event: 'pong',
                timestamp: new Date().toISOString()
            }));
            break;
            
        default:
            client.ws.send(JSON.stringify({
                event: 'error',
                error: `Unknown event: ${event}`
            }));
    }
}

/**
 * Broadcast message to all connected WebSocket clients
 * @param {string} event - The event name
 * @param {object} data - The event data
 */
function broadcastToAll(event, data) {
    if (!wsServer) return;
    
    const message = JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString()
    });
    
    wsClients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

/**
 * Broadcast message to clients subscribed to a specific channel
 * @param {string} channel - The channel name (logs, alerts, metrics, sessions)
 * @param {string} event - The event name
 * @param {object} data - The event data
 */
function broadcastToSubscribers(channel, event, data) {
    if (!wsServer) return;
    
    const message = JSON.stringify({
        event,
        channel,
        data,
        timestamp: new Date().toISOString()
    });
    
    wsClients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && client.subscriptions.has(channel)) {
            client.ws.send(message);
        }
    });
}

// Export WebSocket functions for use in routes
global.wsClients = wsClients;
global.broadcastToAll = broadcastToAll;
global.broadcastToSubscribers = broadcastToSubscribers;

// Server startup function
async function startServer() {
    try {
        loggers.system.info('🚀 Starting Enhanced Universal Logging Platform...');
        
        // Initialize database
        await initializeDatabase();
        // Initialize resilience workers (failed operation retry + health snapshots)
        let resilienceWorkers = { cleanup: () => {} }; // Default no-op cleanup
        try {
            const { setupResilienceWorkers } = require('./resilience-workers');
            resilienceWorkers = setupResilienceWorkers({ app, dal, loggers }) || resilienceWorkers;
            loggers.system.info('🛡️ Resilience workers scheduled');
        } catch (resErr) {
            loggers.system.error('⚠️ Could not initialize resilience workers:', resErr);
        }
        
        // Store reference for graceful shutdown
        app.resilienceWorkers = resilienceWorkers;
        
        // Initialize system components
        await initializeSystemComponents();
        
        // Setup routes
        setupRoutes();
        
        // Start server
        let server;
        let wss; // WebSocket server instance
        
    if (USE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
            const httpsOptions = {
                key: fs.readFileSync(SSL_KEY_PATH),
                cert: fs.readFileSync(SSL_CERT_PATH)
            };
            
            server = https.createServer(httpsOptions, app);
            server.listen(PORT, '0.0.0.0', () => {
                loggers.system.info(`🔒 HTTPS Server running on port ${PORT}`);
                
                // Initialize WebSocket server on HTTPS
                if (config.integrations.websocket.enabled) {
                    wss = initializeWebSocketServer(server);
                }
                
                printStartupBanner(true);
            });
        } else {
            if (USE_HTTPS) {
                loggers.system.warn('⚠️  HTTPS requested but SSL certificates not found, using HTTP');
            }
            
            server = app.listen(PORT, '0.0.0.0', () => {
                loggers.system.info(`🚀 HTTP Server running on port ${PORT} (bound to 0.0.0.0)`);
                
                // Initialize WebSocket server on HTTP
                if (config.integrations.websocket.enabled) {
                    wss = initializeWebSocketServer(server);
                }
                
                printStartupBanner(false);
                systemReady = true;
            });
        }
        
        // Server error handling
        server.on('error', (error) => {
            loggers.system.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                loggers?.system?.error(`❌ Port ${PORT} is already in use!`);
                process.exit(1);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            loggers.system.info('SIGTERM received - shutting down gracefully...');
            
            // Cleanup resilience workers first
            if (app.resilienceWorkers && typeof app.resilienceWorkers.cleanup === 'function') {
                app.resilienceWorkers.cleanup();
            }
            
            server.close(() => {
                loggers.system.info('Server shut down successfully');
                
                // Clean up DAL (includes batch timer and database connection)
                if (dal && typeof dal.cleanup === 'function') {
                    dal.cleanup().then(() => {
                        loggers.system.info('Database connection closed');
                        process.exit(0);
                    }).catch((err) => {
                        loggers.system.error('Database cleanup error:', err);
                        process.exit(1);
                    });
                } else if (db) {
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
        loggers?.system?.error('🚨 STARTUP ERROR:', error);
        process.exit(1);
    }
}

// Startup banner
function printStartupBanner(isHttps) {
    const protocol = isHttps ? 'https' : 'http';
    
    loggers?.system?.info('\n🎯 Enhanced Universal Logging Platform Started Successfully!');
    loggers?.system?.info('═════════════════════════════════════════════════════════════');
    if (isHttps) loggers?.system?.info(`🔒 HTTPS Enabled - Secure Connection`);
    loggers?.system?.info(`🌐 Web Interface: ${protocol}://localhost:${PORT}/dashboard`);
    loggers?.system?.info(`🔐 Login: admin / [AUTH_PASSWORD from environment]`);
    loggers?.system?.info(`📊 API Endpoints: ${protocol}://localhost:${PORT}/api/`);
    loggers?.system?.info(`🔒 ESP32 Endpoint: ${protocol}://localhost:${PORT}/log`);
    loggers?.system?.info(`💚 Health Check: ${protocol}://localhost:${PORT}/health`);
    if (config.integrations.websocket.enabled) {
        loggers?.system?.info(`🔗 WebSocket Server: ws${isHttps ? 's' : ''}://localhost:${PORT}/ws`);
    }
    if (config.integrations.mqtt.enabled) {
        loggers?.system?.info(`📡 MQTT Integration: ${config.integrations.mqtt.broker}`);
    }
    loggers?.system?.info('═════════════════════════════════════════════════════════════\n');
}

// Start the server
if (require.main === module) {
    startServer();
}
// Test initialization helper: sets up database, system components, routes without starting network listener
// Ensures default admin user exists for authentication tests
async function createTestApp() {
    // Avoid re-initializing if already set up
    if (!dal) {
        // Require AUTH_PASSWORD explicitly in test environments for security (no fallback)
        if (!process.env.AUTH_PASSWORD) {
            throw new Error('AUTH_PASSWORD environment variable must be set for tests');
        }
        // Mark test mode and disable networked components
        process.env.NODE_ENV = process.env.NODE_ENV || 'test';
        process.env.TEST_DISABLE_NETWORK = 'true';
        // Disable integrations and ingestion that open sockets
        config.integrations.websocket.enabled = false;
        config.integrations.mqtt.enabled = false;
        if (config.ingestion && config.ingestion.syslog) config.ingestion.syslog.enabled = false;
        if (config.ingestion && config.ingestion.gelf) config.ingestion.gelf.enabled = false;
        if (config.ingestion && config.ingestion.beats) config.ingestion.beats.enabled = false;
        if (config.ingestion && config.ingestion.fluent) config.ingestion.fluent.enabled = false;
        await initializeDatabase();
        await initializeSystemComponents();
        await initializeDefaultAdmin();
        setupRoutes();
        systemReady = true;
    }
    return app;
}

module.exports = { app, config, loggers, createTestApp }; 