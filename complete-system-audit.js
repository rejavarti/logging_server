#!/usr/bin/env node

/**
 * Complete System Audit - Comprehensive Health Check
 * Identifies ALL remaining small fixes needed across the entire system
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const spawn = require('child_process').spawn;

class CompleteSystemAuditor {
    constructor() {
        this.issues = [];
        this.warnings = [];
        this.passed = [];
        this.serverProcess = null;
        this.baseURL = 'http://localhost:10180';
        this.testCount = 0;
        this.passCount = 0;
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    addIssue(category, description, severity = 'medium') {
        this.issues.push({ category, description, severity });
        this.log(`ISSUE [${category}]: ${description}`, 'error');
    }

    addWarning(category, description) {
        this.warnings.push({ category, description });
        this.log(`WARNING [${category}]: ${description}`, 'warning');
    }

    addPassed(category, description) {
        this.passed.push({ category, description });
        this.log(`PASSED [${category}]: ${description}`, 'success');
    }

    async auditFileSystem() {
        this.log('🔍 AUDITING FILE SYSTEM STRUCTURE...');
        
        const criticalFiles = [
            'server.js',
            'package.json',
            'data/databases/enterprise_logs.db',
            'api/log-analyzer.js',
            'routes/log-analyzer.js'
        ];

        for (const file of criticalFiles) {
            const filePath = path.resolve(file);
            if (fs.existsSync(filePath)) {
                this.addPassed('File System', `${file} exists`);
            } else {
                this.addIssue('File System', `Missing critical file: ${file}`, 'high');
            }
        }

        // Check for duplicate files
        const duplicateChecks = [
            { pattern: 'enterprise_logs.db', locations: ['./enterprise_logs.db', './data/databases/enterprise_logs.db'] },
            { pattern: 'dashboard.html', locations: ['./templates/dashboard.html', './public/dashboard.html'] }
        ];

        for (const check of duplicateChecks) {
            const existing = check.locations.filter(loc => fs.existsSync(loc));
            if (existing.length > 1) {
                this.addWarning('File System', `Duplicate ${check.pattern} files found: ${existing.join(', ')}`);
            }
        }
    }

    async auditDatabaseSchema() {
        this.log('🔍 AUDITING DATABASE SCHEMA...');
        
        const databases = [
            './data/databases/enterprise_logs.db'
        ];

        for (const dbPath of databases) {
            if (!fs.existsSync(dbPath)) continue;

            try {
                const db = new sqlite3.Database(dbPath);
                
                await new Promise((resolve, reject) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
                        if (err) {
                            this.addIssue('Database', `${dbPath}: Cannot query users table - ${err.message}`, 'high');
                        } else if (!row) {
                            this.addIssue('Database', `${dbPath}: Missing users table`, 'high');
                        } else {
                            this.addPassed('Database', `${dbPath}: Users table exists`);
                        }
                        resolve();
                    });
                });

                // Check for is_active vs active column issue
                await new Promise((resolve, reject) => {
                    db.all("PRAGMA table_info(users)", (err, columns) => {
                        if (err) {
                            this.addIssue('Database', `${dbPath}: Cannot get table info - ${err.message}`, 'medium');
                        } else {
                            const hasActive = columns.some(col => col.name === 'active');
                            const hasIsActive = columns.some(col => col.name === 'is_active');
                            
                            if (hasActive && hasIsActive) {
                                this.addWarning('Database', `${dbPath}: Has both 'active' and 'is_active' columns`);
                            } else if (hasActive) {
                                this.addPassed('Database', `${dbPath}: Uses 'active' column (standardized)`);
                            } else if (hasIsActive) {
                                this.addWarning('Database', `${dbPath}: Uses 'is_active' column (legacy format)`);
                            } else {
                                this.addIssue('Database', `${dbPath}: Missing active status column`, 'medium');
                            }
                        }
                        resolve();
                    });
                });

                db.close();
            } catch (error) {
                this.addIssue('Database', `${dbPath}: Cannot open database - ${error.message}`, 'high');
            }
        }
    }

    async auditCodePatterns() {
        this.log('🔍 AUDITING CODE PATTERNS...');

        const codeFiles = [
            'server.js',
            'api/log-analyzer.js',
            'routes/log-analyzer.js'
        ];

        for (const file of codeFiles) {
            if (!fs.existsSync(file)) continue;

            try {
                const content = fs.readFileSync(file, 'utf8');

                // Check for problematic patterns
                const patterns = [
                    { regex: /req\.app\.locals\.logger[^s]/, issue: 'Uses old logger reference instead of loggers?.system' },
                    { regex: /req\.app\.locals\.db[^(]/, issue: 'Uses db as property instead of function call db()' },
                    { regex: /\.\.\/\.\.\/templates/, issue: 'Uses incorrect template path (should be ../templates)' },
                    { regex: /is_active.*=.*1/, issue: 'Uses is_active column (should use active)' },
                    { regex: /console\.log\((?!.*Enhanced Universal Logging|.*═|.*🎯|.*🌐|.*🔐|.*📊|.*🔒|.*💚|.*🔗|.*📡)/, issue: 'Uses inappropriate console.log instead of logger' }
                ];

                for (const pattern of patterns) {
                    const matches = content.match(pattern.regex);
                    if (matches) {
                        this.addIssue('Code Pattern', `${file}: ${pattern.issue}`, 'medium');
                    }
                }

                // Check for correct patterns
                if (content.includes('req.app.locals.loggers?.system')) {
                    this.addPassed('Code Pattern', `${file}: Uses correct logger pattern`);
                }
                if (content.includes('req.app.locals.db()')) {
                    this.addPassed('Code Pattern', `${file}: Uses correct db function pattern`);
                }

            } catch (error) {
                this.addIssue('Code Pattern', `Cannot read ${file}: ${error.message}`, 'medium');
            }
        }
    }

    async startServer() {
        this.log('🚀 STARTING SERVER FOR ENDPOINT TESTING...');
        
        return new Promise((resolve) => {
            this.serverProcess = spawn('node', ['server.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: process.cwd()
            });

            let output = '';
            this.serverProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            this.serverProcess.stderr.on('data', (data) => {
                output += data.toString();
            });

            // Wait for server to start
            setTimeout(() => {
                if (output.includes('Server running') || output.includes('listening')) {
                    this.addPassed('Server', 'Server started successfully');
                    resolve(true);
                } else {
                    this.addIssue('Server', `Server failed to start properly: ${output}`, 'high');
                    resolve(false);
                }
            }, 3000);
        });
    }

    async auditEndpoints() {
        this.log('🔍 AUDITING API ENDPOINTS...');

        const endpoints = [
            { path: '/', name: 'Root Dashboard', expectedStatus: [200, 302] },
            { path: '/dashboard', name: 'Dashboard Page', expectedStatus: [200] },
            { path: '/log-analyzer', name: 'Log Analyzer Interface', expectedStatus: [200] },
            { path: '/api/log-analyzer/supported-formats', name: 'Supported Formats API', expectedStatus: [200] },
            { path: '/api/health', name: 'Health Check API', expectedStatus: [200] },
            { path: '/api/auth/login', name: 'Login API (POST)', method: 'POST', expectedStatus: [200, 400, 401] },
            { path: '/admin', name: 'Admin Interface', expectedStatus: [200, 302, 401] }
        ];

        for (const endpoint of endpoints) {
            this.testCount++;
            try {
                const method = endpoint.method || 'GET';
                const config = {
                    method,
                    url: `${this.baseURL}${endpoint.path}`,
                    timeout: 5000,
                    validateStatus: () => true, // Accept any status code
                    data: method === 'POST' && endpoint.path.includes('login') ? {
                        username: 'admin',
                        password: 'admin123'
                    } : undefined
                };

                const response = await axios(config);
                
                if (endpoint.expectedStatus.includes(response.status)) {
                    this.addPassed('Endpoint', `${endpoint.name}: ${response.status}`);
                    this.passCount++;
                } else {
                    this.addIssue('Endpoint', `${endpoint.name}: Expected ${endpoint.expectedStatus}, got ${response.status}`, 'medium');
                }
            } catch (error) {
                this.addIssue('Endpoint', `${endpoint.name}: ${error.message}`, 'medium');
            }
        }
    }

    async auditConfigFiles() {
        this.log('🔍 AUDITING CONFIGURATION FILES...');

        const configFiles = [
            { path: 'package.json', required: ['name', 'version', 'dependencies'] }
        ];

        for (const config of configFiles) {
            if (!fs.existsSync(config.path)) {
                this.addIssue('Config', `Missing config file: ${config.path}`, 'medium');
                continue;
            }

            try {
                const content = fs.readFileSync(config.path, 'utf8');
                
                if (config.required) {
                    const json = JSON.parse(content);
                    for (const field of config.required) {
                        if (json[field]) {
                            this.addPassed('Config', `${config.path}: Has ${field}`);
                        } else {
                            this.addIssue('Config', `${config.path}: Missing ${field}`, 'medium');
                        }
                    }
                }

                if (config.patterns) {
                    for (const pattern of config.patterns) {
                        if (content.includes(pattern)) {
                            this.addPassed('Config', `${config.path}: Contains ${pattern}`);
                        } else {
                            this.addWarning('Config', `${config.path}: Missing pattern ${pattern}`);
                        }
                    }
                }
            } catch (error) {
                this.addIssue('Config', `Cannot parse ${config.path}: ${error.message}`, 'medium');
            }
        }
    }

    stopServer() {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.log('🛑 Server stopped');
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 COMPLETE SYSTEM AUDIT REPORT');
        console.log('='.repeat(80));

        console.log('\n📊 SUMMARY STATISTICS:');
        console.log(`Total Tests: ${this.testCount + this.passed.length}`);
        console.log(`Passed: ${this.passCount + this.passed.length} ✅`);
        console.log(`Issues: ${this.issues.length} ❌`);
        console.log(`Warnings: ${this.warnings.length} ⚠️`);

        const successRate = Math.round(((this.passCount + this.passed.length) / (this.testCount + this.passed.length + this.issues.length)) * 100);
        console.log(`Success Rate: ${successRate}% ${successRate >= 90 ? '🎯' : successRate >= 70 ? '📈' : '⚠️'}`);

        if (this.issues.length > 0) {
            console.log('\n❌ CRITICAL ISSUES REQUIRING FIXES:');
            const criticalIssues = this.issues.filter(i => i.severity === 'high');
            const mediumIssues = this.issues.filter(i => i.severity === 'medium');
            
            if (criticalIssues.length > 0) {
                console.log('\n🚨 HIGH PRIORITY:');
                criticalIssues.forEach((issue, i) => {
                    console.log(`${i + 1}. [${issue.category}] ${issue.description}`);
                });
            }

            if (mediumIssues.length > 0) {
                console.log('\n⚠️ MEDIUM PRIORITY:');
                mediumIssues.forEach((issue, i) => {
                    console.log(`${i + 1}. [${issue.category}] ${issue.description}`);
                });
            }
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS (Non-Critical):');
            this.warnings.forEach((warning, i) => {
                console.log(`${i + 1}. [${warning.category}] ${warning.description}`);
            });
        }

        console.log('\n✅ WORKING COMPONENTS:');
        this.passed.forEach((pass, i) => {
            console.log(`${i + 1}. [${pass.category}] ${pass.description}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log(`🎯 SYSTEM HEALTH: ${this.issues.length === 0 ? 'EXCELLENT' : this.issues.filter(i => i.severity === 'high').length === 0 ? 'GOOD' : 'NEEDS ATTENTION'}`);
        console.log(`🔧 FIXES NEEDED: ${this.issues.length} issues, ${this.warnings.length} warnings`);
        console.log('='.repeat(80));
    }

    async runCompleteAudit() {
        console.log('🚀 STARTING COMPLETE SYSTEM AUDIT...\n');

        await this.auditFileSystem();
        await this.auditDatabaseSchema();
        await this.auditCodePatterns();
        await this.auditConfigFiles();

        const serverStarted = await this.startServer();
        if (serverStarted) {
            // Wait for server to be fully ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.auditEndpoints();
        }

        this.stopServer();
        this.generateReport();
    }
}

// Run the complete audit
const auditor = new CompleteSystemAuditor();
auditor.runCompleteAudit().catch(error => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
});