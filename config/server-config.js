/**
 * Server Configuration Module
 * Central configuration management for the logging server
 */

const path = require('path');
const fs = require('fs');

class ServerConfig {
    constructor() {
        this.loadEnvironmentVariables();
        this.config = this.initializeConfig();
    }

    /**
     * Load environment variables from .env file
     */
    loadEnvironmentVariables() {
        const envPath = path.join(__dirname, '..', '.env');
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
    }

    /**
     * Initialize configuration from environment and defaults
     */
    initializeConfig() {
        return {
            // Server settings
            port: parseInt(process.env.PORT) || 10180,
            nodeEnv: process.env.NODE_ENV || 'development',
            
            // Security
            jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
            authPassword: process.env.AUTH_PASSWORD || 'ChangeMe123!',
            sessionSecret: process.env.SESSION_SECRET || 'your-secret-key-here',
            
            // Authentication
            auth: {
                saltRounds: 12,
                jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
                sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
            },
            
            // Database
            databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'logging.db'),
            
            // File paths
            dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
            logFilePath: process.env.LOG_FILE_PATH || path.join(__dirname, '..', 'data', 'application.log'),
            
            // Rate limiting
            rateLimit: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // Limit each IP to 100 requests per windowMs
                message: 'Too many requests from this IP, please try again later.'
            },
            
            // Session configuration
            session: {
                secret: process.env.SESSION_SECRET || 'your-secret-key-here',
                resave: false,
                saveUninitialized: false,
                cookie: {
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                }
            },
            
            // CORS settings
            cors: {
                origin: process.env.CORS_ORIGIN || '*',
                credentials: true
            },
            
            // HTTPS settings (optional)
            https: {
                enabled: process.env.HTTPS_ENABLED === 'true',
                keyPath: process.env.HTTPS_KEY_PATH,
                certPath: process.env.HTTPS_CERT_PATH
            },
            
            // Monitoring
            diskQuotaMB: parseInt(process.env.DISK_QUOTA_MB) || 10240,
            
            // Integration defaults
            integrations: {
                websocket: {
                    enabled: true,
                    path: '/ws'
                }
            }
        };
    }

    /**
     * Get configuration value by path
     */
    get(path) {
        const parts = path.split('.');
        let value = this.config;
        
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value by path
     */
    set(path, value) {
        const parts = path.split('.');
        let target = this.config;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in target)) {
                target[part] = {};
            }
            target = target[part];
        }
        
        target[parts[parts.length - 1]] = value;
    }

    /**
     * Get all configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Validate required configuration
     */
    validate() {
        const required = ['port', 'jwtSecret', 'databasePath'];
        const missing = [];
        
        for (const key of required) {
            if (!this.config[key]) {
                missing.push(key);
            }
        }
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Check if running in production mode
     */
    isProduction() {
        return this.config.nodeEnv === 'production';
    }

    /**
     * Check if running in development mode
     */
    isDevelopment() {
        return this.config.nodeEnv === 'development';
    }
}

// Singleton instance
const serverConfig = new ServerConfig();

module.exports = serverConfig;
