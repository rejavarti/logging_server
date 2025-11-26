#!/usr/bin/env node
/**
 * Initial Setup Web Server
 * Provides a web-based setup wizard for first-time installation
 * Runs before the main server to configure environment and admin user
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class InitialSetupServer {
    constructor() {
        this.app = express();
        this.port = 10180; // Use same port as main application
        this.setupComplete = false;
        this.configPath = path.join(__dirname, '.env');
        this.setupDataPath = path.join(__dirname, 'data', 'setup-complete.json');
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
    }

    setupRoutes() {
        // Main setup page
        this.app.get('/', (req, res) => {
            console.log('🌐 Root path accessed');
            console.log('🔍 Setup completion check:', this.isSetupComplete());
            console.log('📁 Setup file exists:', fs.existsSync(this.setupDataPath));
            console.log('📁 Config file exists:', fs.existsSync(this.configPath));
            
            if (this.isSetupComplete()) {
                console.log('⚠️ Setup is complete but setup server is still running!');
                res.send(`
                    <h1>Setup Already Complete</h1>
                    <p>The setup has been completed, but the main server may not have started properly.</p>
                    <p><strong>Please manually start the main server:</strong></p>
                    <ol>
                        <li>Close this setup server (Ctrl+C)</li>
                        <li>Run: <code>node server.js</code></li>
                        <li>Access: <a href="http://localhost:10180">http://localhost:10180</a></li>
                    </ol>
                    <p><a href="/reset-setup">Reset Setup</a> if you want to reconfigure.</p>
                `);
            } else {
                res.send(this.getSetupHTML());
            }
        });

        // Get current setup status
        this.app.get('/api/setup/status', (req, res) => {
            res.json({
                isComplete: this.isSetupComplete(),
                hasEnvFile: fs.existsSync(this.configPath)
            });
        });

        // Save setup configuration
        this.app.post('/api/setup/configure', async (req, res) => {
            console.log('\n🎯 Setup configure endpoint reached');
            console.log('📋 Request body:', req.body);
            
            try {
                const {
                    adminUsername = 'admin',
                    adminEmail = 'admin@enterprise.local',
                    adminPassword,
                    serverPort = 10180,
                    enableSSL = false,
                    sslCertPath = '',
                    sslKeyPath = '',
                    jwtSecret = crypto.randomBytes(64).toString('hex'),
                    enableMetrics = true,
                    enableAlerting = true,
                    logRetentionDays = 30
                } = req.body;

                // Validate required fields
                if (!adminPassword || adminPassword.length < 12) {
                    return res.status(400).json({
                        success: false,
                        error: 'Admin password must be at least 12 characters long'
                    });
                }

                // Create environment configuration
                const envConfig = this.generateEnvConfig({
                    adminUsername,
                    adminEmail,
                    adminPassword,
                    serverPort,
                    enableSSL,
                    sslCertPath,
                    sslKeyPath,
                    jwtSecret,
                    enableMetrics,
                    enableAlerting,
                    logRetentionDays
                });

                // Write .env file with restricted permissions
                fs.writeFileSync(this.configPath, envConfig, { mode: 0o600 });
                console.log('✅ Environment file created with restricted permissions (600)');

                // Create initial admin user in database
                await this.createInitialDatabase(adminUsername, adminEmail, adminPassword);

                // Mark setup as complete
                console.log('📋 Marking setup as complete...');
                this.markSetupComplete({
                    completedAt: new Date().toISOString(),
                    adminUsername,
                    adminEmail,
                    serverPort,
                    version: '2.1.0-stable-enhanced'
                });
                console.log('✅ Setup marked as complete');

                // Verify setup completion
                const isComplete = this.isSetupComplete();
                console.log('🔍 Setup completion verification:', isComplete);
                console.log('📁 Setup file path:', this.setupDataPath);
                console.log('📁 Config file path:', this.configPath);
                console.log('📁 Setup file exists:', fs.existsSync(this.setupDataPath));
                console.log('📁 Config file exists:', fs.existsSync(this.configPath));

                res.json({
                    success: true,
                    message: 'Setup completed successfully',
                    nextSteps: [
                        'Configuration saved to .env file',
                        'Initial admin user created',
                        'You can now start the main server with: node server.js',
                        `Server will be available at: http://localhost:${serverPort}`,
                        '',
                        '🐳 Docker Deployment:',
                        `docker run -p ${serverPort}:${serverPort} -v ./data:/app/data [image]`,
                        `Or update docker-compose.yml ports: ["${serverPort}:${serverPort}"]`
                    ]
                });

            } catch (error) {
                console.error('Setup error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Complete setup and transition to main server
        this.app.post('/api/setup/complete', (req, res) => {
            console.log('\n🎯 Complete endpoint called');
            console.log('🔍 Setup completion status:', this.isSetupComplete());
            
            res.json({
                success: true,
                message: 'Setup completed! Transitioning to main server...',
                redirect: '/dashboard'
            });
            
            setTimeout(() => {
                console.log('\n✅ Setup completed! Starting main server on same port...');
                console.log('🔄 Initiating server transition...');
                this.startMainServer();
            }, 3000);
        });

        // Reset setup endpoint for testing
        this.app.get('/reset-setup', (req, res) => {
            console.log('🔄 Reset setup requested');
            try {
                if (fs.existsSync(this.setupDataPath)) {
                    fs.unlinkSync(this.setupDataPath);
                    console.log('🗑️ Removed setup completion file');
                }
                if (fs.existsSync(this.configPath)) {
                    fs.unlinkSync(this.configPath);
                    console.log('🗑️ Removed .env config file');
                }
                res.redirect('/');
            } catch (error) {
                console.error('❌ Reset setup error:', error);
                res.status(500).send('Failed to reset setup: ' + error.message);
            }
        });
    }

    generateEnvConfig(config) {
        return `# Enhanced Universal Logging Platform Configuration
# Generated by Initial Setup Wizard on ${new Date().toISOString()}

# Authentication
AUTH_PASSWORD=${config.adminPassword}
JWT_SECRET=${config.jwtSecret}

# Server Configuration
PORT=${config.serverPort}
NODE_ENV=production

# SSL Configuration
USE_HTTPS=${config.enableSSL}
SSL_CERT_PATH=${config.sslCertPath || '/path/to/cert.pem'}
SSL_KEY_PATH=${config.sslKeyPath || '/path/to/key.pem'}

# Feature Flags
ENABLE_METRICS=${config.enableMetrics}
ENABLE_ALERTING=${config.enableAlerting}
ENABLE_DISTRIBUTED_TRACING=true
ENABLE_ADVANCED_SEARCH=true

# Data Retention
LOG_RETENTION_DAYS=${config.logRetentionDays}
CLEANUP_INTERVAL_HOURS=24

# Performance
MAX_MEMORY_MB=512
MAX_CPU_PERCENT=80

# Database
DATABASE_PATH=./data/databases/logs.db

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_TO_CONSOLE=true

# Security
BCRYPT_SALT_ROUNDS=12
SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Integration defaults
DEFAULT_TIMEZONE=UTC
DATE_FORMAT=YYYY-MM-DD HH:mm:ss
`;
    }

    async createInitialDatabase(username, email, password) {
        // Create basic SQLite database with admin user
        const Database = require('sqlite3').Database;
        const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
        
        // Ensure directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        const db = new Database(dbPath);
        const passwordHash = await bcrypt.hash(password, 12);

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Create users table
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )`);

                // Insert admin user
                db.run(`INSERT OR REPLACE INTO users (username, email, password_hash, role) 
                        VALUES (?, ?, ?, 'admin')`, 
                    [username, email, passwordHash], 
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`✅ Initial admin user created: ${username}`);
                            resolve();
                        }
                    }
                );
            });

            db.close();
        });
    }

    isSetupComplete() {
        return fs.existsSync(this.setupDataPath) && fs.existsSync(this.configPath);
    }

    markSetupComplete(data) {
        const setupDir = path.dirname(this.setupDataPath);
        if (!fs.existsSync(setupDir)) {
            fs.mkdirSync(setupDir, { recursive: true });
        }
        fs.writeFileSync(this.setupDataPath, JSON.stringify(data, null, 2));
    }

    getSetupHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Universal Logging Platform - Initial Setup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        .setup-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            width: 90%;
            overflow: hidden;
        }
        .setup-header {
            background: #2c3e50;
            color: white;
            padding: 2rem;
            text-align: center;
        }
        .setup-header h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
        .setup-header p { opacity: 0.9; }
        .setup-form { padding: 2rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-row { display: flex; gap: 1rem; }
        .form-row .form-group { flex: 1; margin-bottom: 0; }
        label { 
            display: block; 
            margin-bottom: 0.5rem; 
            font-weight: 600; 
            color: #2c3e50;
        }
        input, select {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 1rem;
            transition: border-color 0.2s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .checkbox-group input {
            width: auto;
        }
        .setup-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 6px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s;
        }
        .setup-button:hover { transform: translateY(-2px); }
        .setup-button:disabled { 
            opacity: 0.6; 
            cursor: not-allowed; 
            transform: none; 
        }
        .progress { 
            text-align: center; 
            padding: 2rem; 
            display: none; 
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .success { 
            text-align: center; 
            padding: 2rem; 
            display: none; 
        }
        .success-icon {
            background: #27ae60;
            color: white;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            font-size: 2rem;
            transition: all 0.3s ease;
        }
        .transition-icon {
            background: #3498db;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
        }
        .info {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
        }
        .password-strength {
            margin-top: 8px;
        }
        .strength-meter {
            width: 100%;
            height: 4px;
            background: #e0e0e0;
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 5px;
        }
        .strength-bar {
            height: 100%;
            transition: all 0.3s ease;
            border-radius: 2px;
        }
        .strength-bar.strength-weak {
            width: 33%;
            background: #dc3545;
        }
        .strength-bar.strength-medium {
            width: 66%;
            background: #ffc107;
        }
        .strength-bar.strength-strong {
            width: 100%;
            background: #28a745;
        }
        .strength-text {
            font-size: 0.85rem;
            font-weight: 500;
        }
        .strength-text.weak {
            color: #dc3545;
        }
        .strength-text.medium {
            color: #ffc107;
        }
        .strength-text.strong {
            color: #28a745;
        }
    </style>
</head>
<body>
    <div class="setup-container">
        <div class="setup-header">
            <h1>🚀 Enhanced Universal Logging Platform</h1>
            <p>Welcome! Let's set up your enterprise logging system</p>
        </div>

        <div id="setupForm" class="setup-form">
            <div class="info">
                <strong>Initial Setup:</strong> This wizard will configure your environment, create the admin user, and prepare your logging system for production use.
            </div>

            <form id="configForm" method="POST" action="/api/setup/configure" autocomplete="off">
                <div class="form-group">
                    <label>Administrator Username</label>
                    <input type="text" name="adminUsername" value="" placeholder="Enter admin username" autocomplete="new-password" required>
                    <small style="color: #666; font-size: 0.9rem;">This will be your main admin username</small>
                </div>

                <div class="form-group">
                    <label>Administrator Email</label>
                    <input type="email" name="adminEmail" value="" placeholder="admin@yourdomain.com" autocomplete="new-password" required>
                    <small style="color: #666; font-size: 0.9rem;">Used for notifications and account recovery</small>
                </div>

                <div class="form-group">
                    <label>Administrator Password</label>
                    <input type="password" name="adminPassword" value="" placeholder="Minimum 12 characters" autocomplete="new-password" required minlength="12">
                    <small style="color: #666; font-size: 0.9rem;">Choose a strong password - this will be your main admin account</small>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Server Port</label>
                        <input type="number" name="serverPort" value="10180" min="1" max="65535" required>
                        <small style="color: #666; font-size: 0.9rem;">
                            🐳 <strong>Docker Note:</strong> If changing this port, update your Docker port mapping:<br>
                            <code>-p [host-port]:[this-port]</code> or <code>"[host-port]:[this-port]"</code> in docker-compose.yml
                        </small>
                    </div>
                    <div class="form-group">
                        <label>Log Retention (Days)</label>
                        <input type="number" name="logRetentionDays" value="30" min="1" max="365" required>
                    </div>
                </div>

                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" name="enableSSL" id="enableSSL">
                        <label for="enableSSL">Enable HTTPS/SSL</label>
                    </div>
                </div>

                <div id="sslConfig" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>SSL Certificate Path</label>
                            <input type="text" name="sslCertPath" placeholder="/path/to/cert.pem">
                        </div>
                        <div class="form-group">
                            <label>SSL Key Path</label>
                            <input type="text" name="sslKeyPath" placeholder="/path/to/key.pem">
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" name="enableMetrics" id="enableMetrics" checked>
                            <label for="enableMetrics">Enable Metrics</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" name="enableAlerting" id="enableAlerting" checked>
                            <label for="enableAlerting">Enable Alerting</label>
                        </div>
                    </div>
                </div>

                <div id="dockerInfo" class="info" style="margin-top: 1rem;">
                    <strong>🐳 Docker Deployment:</strong><br>
                    <div style="margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; background: #f8f9fa; padding: 0.5rem; border-radius: 4px;">
                        <div><strong>Docker Run:</strong></div>
                        <div id="dockerRunCommand">docker run -p <span id="hostPort">10180</span>:<span id="containerPort">10180</span> ...</div>
                        <br>
                        <div><strong>docker-compose.yml:</strong></div>
                        <div id="dockerComposeCommand">ports: ["<span id="composeHostPort">10180</span>:<span id="composeContainerPort">10180</span>"]</div>
                    </div>
                </div>

                <button type="submit" class="setup-button">🔧 Complete Setup</button>
            </form>
        </div>

        <div id="progress" class="progress">
            <div class="spinner"></div>
            <h3>Setting up your logging platform...</h3>
            <p>Creating configuration, database, and admin user</p>
        </div>

        <div id="success" class="success">
            <div class="success-icon">✓</div>
            <h3>Setup Complete!</h3>
            <p>Your Enhanced Universal Logging Platform is ready.</p>
            <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 6px; text-align: left;">
                <strong>Automatic Transition:</strong>
                <ol style="margin-left: 1rem; margin-top: 0.5rem;">
                    <li>✅ Configuration saved and admin user created</li>
                    <li>🔄 Setup wizard will close and main server will start</li>
                    <li>🚀 You'll be automatically redirected to the login page</li>
                    <li>🔐 Login with your admin credentials</li>
                </ol>
                <div style="margin-top: 0.5rem; padding: 0.5rem; background: #d4edda; border-radius: 4px; font-size: 0.9rem;">
                    <strong>🎯 No manual steps required!</strong> Just wait for the automatic transition.
                </div>
                <div style="margin-top: 0.5rem; padding: 0.5rem; background: #e3f2fd; border-radius: 4px; font-size: 0.9rem;">
                    <strong>🐳 Docker Users:</strong> Your port mapping remains consistent!
                </div>
            </div>
        </div>
    </div>

    <script>
        console.log('🚀 Setup JavaScript loaded');
        
        // All DOM operations wrapped in DOMContentLoaded for security and reliability
        document.addEventListener('DOMContentLoaded', function() {
            console.log('📋 DOM Content Loaded - Initializing secure setup wizard');
            
            // Ensure form is properly configured for security
            const form = document.getElementById('configForm');
            if (form) {
                form.method = 'POST';
                form.action = '/api/setup/configure';
                console.log('✅ Form security configuration verified');
            }
            
            // Toggle SSL configuration
            document.getElementById('enableSSL').addEventListener('change', function(e) {
                document.getElementById('sslConfig').style.display = e.target.checked ? 'block' : 'none';
            });

            // Update Docker commands when port changes
            document.querySelector('input[name="serverPort"]').addEventListener('input', function(e) {
            const port = e.target.value;
            document.getElementById('hostPort').textContent = port;
            document.getElementById('containerPort').textContent = port;
            document.getElementById('composeHostPort').textContent = port;
            document.getElementById('composeContainerPort').textContent = port;
        });

        // Password strength checking
        const passwordInput = document.querySelector('input[name="adminPassword"]');
        const passwordStrength = document.createElement('div');
        passwordStrength.className = 'password-strength';
        passwordStrength.style.marginTop = '5px';
        passwordInput.parentNode.appendChild(passwordStrength);
        
        passwordInput.addEventListener('input', function() {
            const password = this.value;
            const strength = calculatePasswordStrength(password);
            
            passwordStrength.innerHTML = 
                '<div class="strength-meter">' +
                    '<div class="strength-bar strength-' + strength.level + '"></div>' +
                '</div>' +
                '<span class="strength-text ' + strength.level + '">' + strength.text + '</span>';
        });
        
        function calculatePasswordStrength(password) {
            if (password.length < 8) return { level: 'weak', text: 'Too short (minimum 12 characters)' };
            if (password.length < 12) return { level: 'weak', text: 'Weak - needs to be at least 12 characters' };
            
            let score = 0;
            if (password.length >= 12) score++;
            if (/[a-z]/.test(password)) score++;
            if (/[A-Z]/.test(password)) score++;
            if (/[0-9]/.test(password)) score++;
            if (/[^A-Za-z0-9]/.test(password)) score++;
            
            if (score < 3) return { level: 'weak', text: 'Weak - add uppercase, numbers, or symbols' };
            if (score < 4) return { level: 'medium', text: 'Medium - consider adding more character types' };
            return { level: 'strong', text: 'Strong password ✓' };
        }

            // Handle form submission - CRITICAL SECURITY: Must prevent default GET submission
            document.getElementById('configForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎯 Form submission started - preventDefault called');
            
            const formData = new FormData(e.target);
            const config = Object.fromEntries(formData);
            console.log('📋 Form data collected:', config);
            
            // Convert checkboxes to booleans
            config.enableSSL = document.getElementById('enableSSL').checked;
            config.enableMetrics = document.getElementById('enableMetrics').checked;
            config.enableAlerting = document.getElementById('enableAlerting').checked;
            
            console.log('📋 Final config object:', config);
            
            // Show progress
            document.getElementById('setupForm').style.display = 'none';
            document.getElementById('progress').style.display = 'block';
            
            try {
                const response = await fetch('/api/setup/configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                , credentials: 'same-origin' });
                
                const result = await response.json();
                
                if (result.success) {
                    // Show success
                    document.getElementById('progress').style.display = 'none';
                    document.getElementById('success').style.display = 'block';
                    
                    // Auto-complete and transition to main server
                    setTimeout(async () => {
                        try {
                            const completeResponse = await fetch('/api/setup/complete', { method: 'POST', credentials: 'same-origin' });
                            const completeResult = await completeResponse.json();
                            
                            if (completeResult.success) {
                                // Show transition message
                                const successIcon = document.querySelector('.success-icon');
                                successIcon.className = 'success-icon transition-icon';
                                successIcon.textContent = '🔄';
                                
                                document.querySelector('#success h3').textContent = 'Starting Main Server...';
                                document.querySelector('#success p').textContent = 'Transitioning to your dashboard - please wait...';
                                
                                // Wait for main server to start, then check availability
                                setTimeout(() => {
                                    successIcon.textContent = '🚀';
                                    document.querySelector('#success h3').textContent = 'Starting Main Server...';
                                    document.querySelector('#success p').innerHTML = 
                                        'A new terminal window will open with the main server.<br>' +
                                        'The main server will be accessible at <strong>http://localhost:10180</strong>';
                                    
                                    // Add manual access button
                                    const buttonContainer = document.createElement('div');
                                    buttonContainer.style.marginTop = '20px';
                                    buttonContainer.innerHTML = 
                                        '<button onclick="window.open(\'http://localhost:10180\', \'_blank\')" ' +
                                        'style="background: #28a745; color: white; border: none; padding: 12px 24px; ' +
                                        'border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 500;">' +
                                        '🚀 Access Main Server</button>' +
                                        '<p style="margin-top: 10px; font-size: 0.9rem; color: #666;">' +
                                        'Click above to access your dashboard, or wait for automatic redirect...</p>';
                                    
                                    document.getElementById('success').appendChild(buttonContainer);
                                    
                                    // Try to redirect after giving server time to start
                                    setTimeout(() => {
                                        // Check if server is responding before redirect
                                        fetch('http://localhost:10180/health', { method: 'GET' })
                                            .then(() => {
                                                window.location.href = 'http://localhost:10180';
                                            })
                                            .catch(() => {
                                                // Server not ready yet, show manual instructions
                                                document.querySelector('#success p').innerHTML = 
                                                    '<strong>Server is starting...</strong><br>' +
                                                    'If the server doesn\'t respond, check the new terminal window.<br>' +
                                                    'Manual access: <a href="http://localhost:10180" target="_blank">http://localhost:10180</a>';
                                            });
                                    }, 8000);
                                }, 3000);
                            }
                        } catch (error) {
                            console.error('Setup completion error:', error);
                            // Fallback - just refresh the page
                            setTimeout(() => {
                                window.location.reload();
                            }, 3000);
                        }
                    }, 3000);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                alert('Setup failed: ' + error.message);
                document.getElementById('progress').style.display = 'none';
                document.getElementById('setupForm').style.display = 'block';
            }
            });
        });
    </script>
</body>
</html>`;
    }

    startMainServer() {
        // Close the setup server
        if (this.server) {
            this.server.close(() => {
                console.log('🔄 Setup server closed, starting main server...');
                console.log('💡 A new terminal window will open for the main server');
                
                // Start main server with visible terminal window (Windows-compatible)
                setTimeout(() => {
                    const { spawn } = require('child_process');
                    const os = require('os');
                    
                    let mainServer;
                    
                    if (os.platform() === 'win32') {
                        // Windows: Use batch file for clean startup
                        mainServer = spawn('cmd', ['/c', 'start', 'start-server.bat'], {
                            detached: true,
                            cwd: __dirname,
                            windowsHide: false
                        });
                    } else {
                        // Linux/Mac: Try to open new terminal
                        const terminals = ['gnome-terminal', 'xterm', 'konsole', 'terminal'];
                        let terminalFound = false;
                        
                        for (const terminal of terminals) {
                            try {
                                mainServer = spawn(terminal, ['-e', `cd "${__dirname}" && node server.js`], {
                                    detached: true,
                                    cwd: __dirname
                                });
                                terminalFound = true;
                                break;
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (!terminalFound) {
                            // Fallback: run in current terminal
                            mainServer = spawn('node', ['server.js'], {
                                stdio: 'inherit',
                                cwd: __dirname
                            });
                        }
                    }
                    
                    if (mainServer) {
                        mainServer.on('error', (error) => {
                            console.error('❌ Failed to start main server:', error);
                            console.log('💡 Try running manually: node server.js');
                        });
                        
                        mainServer.on('spawn', () => {
                            console.log('✅ Main server starting in new window...');
                            // Don't exit immediately, give server time to start
                            setTimeout(() => {
                                console.log('🎯 Setup complete! Main server should be accessible at http://localhost:10180');
                                process.exit(0);
                            }, 3000);
                        });
                        
                        // If spawn fails, provide manual instructions
                        setTimeout(() => {
                            console.log('\n📋 If the server window didn\'t open automatically:');
                            console.log('   1. Open a new terminal/PowerShell window');
                            console.log(`   2. Navigate to: ${__dirname}`);
                            console.log('   3. Run: node server.js');
                            console.log('   4. Access: http://localhost:10180\n');
                        }, 2000);
                    }
                }, 1000);
            });
        }
    }

    start() {
        if (this.isSetupComplete()) {
            console.log('✅ Setup already completed. Run: node server.js');
            process.exit(0);
        }

        this.server = this.app.listen(this.port, () => {
            console.log('\n🎯 ENHANCED UNIVERSAL LOGGING PLATFORM');
            console.log('🔧 Initial Setup Required');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📋 Open your browser to: http://localhost:${this.port}`);
            console.log('🎮 Complete the setup wizard to configure your system');
            console.log(`🐳 Same port (${this.port}) will be used for the main application`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        });
    }
}

// Start setup server if run directly
if (require.main === module) {
    const setupServer = new InitialSetupServer();
    setupServer.start();
}

module.exports = InitialSetupServer;