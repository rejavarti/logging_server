#!/usr/bin/env node
/**
 * Code Anomaly Detector
 * Intelligent scanner for common issues, inconsistencies, and potential bugs
 * 
 * Usage: node scripts/code-anomaly-detector.js [--fix] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bold: '\x1b[1m'
};

class AnomalyDetector {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.fix = options.fix || false;
        this.rootDir = options.rootDir || process.cwd();
        this.issues = [];
        this.stats = {
            filesScanned: 0,
            issuesFound: 0,
            critical: 0,
            warning: 0,
            info: 0
        };
    }

    log(message, color = 'white') {
        console.log(`${COLORS[color]}${message}${COLORS.reset}`);
    }

    addIssue(severity, category, file, line, message, suggestion, pattern = null) {
        this.issues.push({ severity, category, file, line, message, suggestion, pattern });
        this.stats.issuesFound++;
        this.stats[severity]++;
    }

    // ==================== ANOMALY DETECTION RULES ====================

    /**
     * Rule 1: Fetch calls without credentials
     * API calls that should include credentials for authentication
     */
    checkMissingCredentials(content, filePath) {
        const lines = content.split('\n');
        const fetchRegex = /fetch\s*\(\s*['"`]\/api\//g;
        
        lines.forEach((line, idx) => {
            if (fetchRegex.test(line)) {
                // Reset regex
                fetchRegex.lastIndex = 0;
                
                // Check if this fetch has credentials
                // Look ahead up to 5 lines for the fetch options
                const context = lines.slice(idx, Math.min(idx + 8, lines.length)).join('\n');
                
                if (!context.includes('credentials') && 
                    !context.includes('Authorization') &&
                    context.includes('/api/')) {
                    
                    // Skip if it's a GET to public endpoints
                    const isPublicEndpoint = /\/api\/health|\/api\/auth\/login/.test(line);
                    if (!isPublicEndpoint) {
                        this.addIssue(
                            'critical',
                            'Missing Credentials',
                            filePath,
                            idx + 1,
                            `Fetch to API endpoint without credentials: ${line.trim().substring(0, 80)}...`,
                            "Add credentials: 'same-origin' to fetch options",
                            'credentials'
                        );
                    }
                }
            }
        });
    }

    /**
     * Rule 2: Console.log in production code (should use logger)
     */
    checkConsoleLogs(content, filePath) {
        // Skip test files and scripts
        if (filePath.includes('test') || filePath.includes('scripts/')) return;
        
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (/console\.(log|error|warn|info)\s*\(/.test(line) && 
                !line.trim().startsWith('//') &&
                !line.includes('DEBUG')) {
                this.addIssue(
                    'info',
                    'Console Usage',
                    filePath,
                    idx + 1,
                    `Console statement in production code: ${line.trim().substring(0, 60)}...`,
                    'Consider using structured logger instead of console'
                );
            }
        });
    }

    /**
     * Rule 3: Hardcoded secrets/passwords
     */
    checkHardcodedSecrets(content, filePath) {
        const secretPatterns = [
            { regex: /password\s*[:=]\s*['"`][^'"`]{3,}['"`]/gi, name: 'password' },
            { regex: /secret\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi, name: 'secret' },
            { regex: /api[_-]?key\s*[:=]\s*['"`][^'"`]{10,}['"`]/gi, name: 'API key' },
            { regex: /token\s*[:=]\s*['"`][A-Za-z0-9_\-\.]{20,}['"`]/gi, name: 'token' },
        ];

        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            // Skip comments and environment variable references
            if (line.trim().startsWith('//') || line.includes('process.env') || line.includes('example')) return;
            
            secretPatterns.forEach(({ regex, name }) => {
                if (regex.test(line)) {
                    this.addIssue(
                        'critical',
                        'Hardcoded Secret',
                        filePath,
                        idx + 1,
                        `Potential hardcoded ${name} found`,
                        'Use environment variables instead of hardcoded values'
                    );
                }
                regex.lastIndex = 0;
            });
        });
    }

    /**
     * Rule 4: Inconsistent error handling
     */
    checkErrorHandling(content, filePath) {
        const lines = content.split('\n');
        let inTryCatch = false;
        let tryLine = 0;
        
        lines.forEach((line, idx) => {
            // Check for try without proper catch
            if (/\btry\s*{/.test(line)) {
                inTryCatch = true;
                tryLine = idx + 1;
            }
            
            // Empty catch blocks
            if (/catch\s*\([^)]*\)\s*{\s*}/.test(line)) {
                this.addIssue(
                    'warning',
                    'Error Handling',
                    filePath,
                    idx + 1,
                    'Empty catch block - errors are silently ignored',
                    'Log the error or handle it appropriately'
                );
            }
            
            // Catch with no error parameter usage (swallowed errors)
            const catchMatch = line.match(/catch\s*\((\w+)\)\s*{/);
            if (catchMatch) {
                const errorVar = catchMatch[1];
                const catchContext = lines.slice(idx, Math.min(idx + 10, lines.length)).join('\n');
                if (!catchContext.includes(errorVar) || 
                    (catchContext.match(new RegExp(errorVar, 'g')) || []).length === 1) {
                    this.addIssue(
                        'warning',
                        'Error Handling',
                        filePath,
                        idx + 1,
                        `Caught error '${errorVar}' is not used`,
                        'Log or handle the error properly'
                    );
                }
            }
        });
    }

    /**
     * Rule 5: SQL Injection vulnerabilities
     */
    checkSQLInjection(content, filePath) {
        const lines = content.split('\n');
        const dangerousPatterns = [
            /\.(run|get|all|exec)\s*\(\s*['"`].*\$\{/,  // Template literal in SQL
            /\.(run|get|all|exec)\s*\(\s*['"`].*\+\s*\w+/,  // String concat in SQL
            /\.(run|get|all|exec)\s*\([^,]*\+[^,]*\)/,  // Concatenation in query
        ];

        lines.forEach((line, idx) => {
            dangerousPatterns.forEach(pattern => {
                if (pattern.test(line) && !line.includes('?')) {
                    this.addIssue(
                        'critical',
                        'SQL Injection',
                        filePath,
                        idx + 1,
                        `Potential SQL injection vulnerability: ${line.trim().substring(0, 60)}...`,
                        'Use parameterized queries with ? placeholders'
                    );
                }
            });
        });
    }

    /**
     * Rule 6: Missing await on async functions
     */
    checkMissingAwait(content, filePath) {
        const lines = content.split('\n');
        const asyncFunctionCalls = [
            'fetch(', 'req.dal.', 'db.run(', 'db.get(', 'db.all(',
            'fs.promises.', 'readFile(', 'writeFile(',
            '.save()', '.find()', '.findOne()', '.create()', '.update()', '.delete()'
        ];

        lines.forEach((line, idx) => {
            // Skip if line is a comment or already has await
            if (line.trim().startsWith('//') || line.includes('await ') || line.includes('return ')) return;
            
            asyncFunctionCalls.forEach(call => {
                if (line.includes(call) && 
                    !line.includes('await') && 
                    !line.includes('.then(') &&
                    !line.includes('Promise.') &&
                    /^\s*(const|let|var|\w+\s*=)/.test(line)) {
                    this.addIssue(
                        'warning',
                        'Missing Await',
                        filePath,
                        idx + 1,
                        `Possible missing await on async operation: ${line.trim().substring(0, 60)}...`,
                        'Add await keyword or handle the promise'
                    );
                }
            });
        });
    }

    /**
     * Rule 7: Inconsistent response formats
     */
    checkResponseFormats(content, filePath) {
        if (!filePath.includes('routes/')) return;
        
        const lines = content.split('\n');
        let hasSuccessTrue = false;
        let hasSuccessFalse = false;
        let hasDirectResponse = false;

        lines.forEach((line, idx) => {
            if (/res\.json\s*\(\s*{\s*success:\s*true/.test(line)) hasSuccessTrue = true;
            if (/res\.json\s*\(\s*{\s*success:\s*false/.test(line)) hasSuccessFalse = true;
            if (/res\.json\s*\(\s*{\s*(?!success)/.test(line) && 
                !line.includes('error:') && 
                !line.includes('message:')) {
                hasDirectResponse = true;
            }
        });

        // Check for mixed patterns
        if (hasSuccessTrue && hasDirectResponse) {
            this.addIssue(
                'info',
                'Response Format',
                filePath,
                0,
                'Mixed response formats: some use {success: true, ...}, others return data directly',
                'Standardize on one response format pattern'
            );
        }
    }

    /**
     * Rule 8: Unclosed resources (DB connections, file handles)
     */
    checkUnclosedResources(content, filePath) {
        const lines = content.split('\n');
        
        // Check for file operations without close
        let hasOpen = false;
        let hasClose = false;
        
        lines.forEach((line, idx) => {
            if (/fs\.(open|createReadStream|createWriteStream)/.test(line)) hasOpen = true;
            if (/\.close\(|\.end\(|\.destroy\(/.test(line)) hasClose = true;
            
            // Check for missing finally blocks with resources
            if (/const\s+\w+\s*=\s*await\s+.*open/.test(line)) {
                const context = lines.slice(idx, Math.min(idx + 20, lines.length)).join('\n');
                if (!context.includes('finally') && !context.includes('.close(')) {
                    this.addIssue(
                        'warning',
                        'Resource Leak',
                        filePath,
                        idx + 1,
                        'Resource opened but may not be closed on error',
                        'Use try/finally or ensure resource is closed in all paths'
                    );
                }
            }
        });
    }

    /**
     * Rule 9: Deprecated or dangerous patterns
     */
    checkDeprecatedPatterns(content, filePath) {
        const patterns = [
            { regex: /eval\s*\(/, name: 'eval()', severity: 'critical', msg: 'eval() is dangerous and should be avoided' },
            { regex: /new\s+Function\s*\(/, name: 'new Function()', severity: 'critical', msg: 'Dynamic function creation is dangerous' },
            { regex: /innerHTML\s*=/, name: 'innerHTML', severity: 'warning', msg: 'innerHTML can lead to XSS - use textContent or sanitize' },
            { regex: /document\.write/, name: 'document.write', severity: 'warning', msg: 'document.write is deprecated' },
            { regex: /\.substr\s*\(/, name: 'substr()', severity: 'info', msg: 'substr() is deprecated - use substring() or slice()' },
            { regex: /__proto__/, name: '__proto__', severity: 'warning', msg: '__proto__ is deprecated - use Object.getPrototypeOf()' },
        ];

        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.trim().startsWith('//')) return;
            
            patterns.forEach(({ regex, name, severity, msg }) => {
                if (regex.test(line)) {
                    this.addIssue(severity, 'Deprecated Pattern', filePath, idx + 1, `${name}: ${msg}`, `Avoid using ${name}`);
                }
            });
        });
    }

    /**
     * Rule 10: Environment variable usage without defaults
     */
    checkEnvVarDefaults(content, filePath) {
        const lines = content.split('\n');
        const envVarRegex = /process\.env\.(\w+)/g;
        
        lines.forEach((line, idx) => {
            if (line.trim().startsWith('//')) return;
            
            let match;
            while ((match = envVarRegex.exec(line)) !== null) {
                const varName = match[1];
                // Check if there's a default value
                const hasDefault = /\|\||(\?\?)|(\?\.)/.test(line.substring(match.index));
                const isRequired = /^(NODE_ENV|PORT)$/.test(varName);
                
                if (!hasDefault && !isRequired && !line.includes('if (')) {
                    this.addIssue(
                        'info',
                        'Env Var Default',
                        filePath,
                        idx + 1,
                        `process.env.${varName} used without default value`,
                        `Consider: process.env.${varName} || 'default'`
                    );
                }
            }
        });
    }

    /**
     * Rule 11: Route parameter validation
     */
    checkRouteValidation(content, filePath) {
        if (!filePath.includes('routes/')) return;
        
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
            // Check for route params used directly without validation
            if (/req\.params\.(\w+)/.test(line)) {
                const context = lines.slice(Math.max(0, idx - 3), idx + 1).join('\n');
                if (!context.includes('parseInt') && 
                    !context.includes('validate') &&
                    !context.includes('isNaN') &&
                    !context.includes('if (') &&
                    line.includes('req.params.id')) {
                    // Check if used in SQL
                    if (line.includes('.get(') || line.includes('.run(') || line.includes('.all(')) {
                        this.addIssue(
                            'warning',
                            'Input Validation',
                            filePath,
                            idx + 1,
                            'Route parameter used without explicit validation',
                            'Validate and sanitize req.params before use'
                        );
                    }
                }
            }
        });
    }

    /**
     * Rule 12: Duplicate function definitions
     */
    checkDuplicateFunctions(content, filePath) {
        const functionDefs = new Map();
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
            const funcMatch = line.match(/(?:async\s+)?function\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?[^)]*\)?\s*=>/);
            if (funcMatch) {
                const funcName = funcMatch[1] || funcMatch[2];
                if (funcName && funcName.length > 2) {
                    if (functionDefs.has(funcName)) {
                        this.addIssue(
                            'warning',
                            'Duplicate Function',
                            filePath,
                            idx + 1,
                            `Function '${funcName}' defined multiple times (first at line ${functionDefs.get(funcName)})`,
                            'Remove duplicate or rename one of them'
                        );
                    } else {
                        functionDefs.set(funcName, idx + 1);
                    }
                }
            }
        });
    }

    /**
     * Rule 13: Memory leak patterns
     */
    checkMemoryLeaks(content, filePath) {
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
            // Event listeners without cleanup
            if (/\.addEventListener\s*\(/.test(line) || /\.on\s*\(['"`]/.test(line)) {
                const context = content;
                if (!context.includes('removeEventListener') && 
                    !context.includes('.off(') &&
                    !context.includes('.removeListener(') &&
                    !filePath.includes('test')) {
                    // Only report once per file
                    if (idx === lines.findIndex(l => /\.addEventListener\s*\(|\.on\s*\(['"`]/.test(l))) {
                        this.addIssue(
                            'info',
                            'Memory Leak',
                            filePath,
                            idx + 1,
                            'Event listeners added but no cleanup code found',
                            'Ensure event listeners are removed when no longer needed'
                        );
                    }
                }
            }
            
            // setInterval without clearInterval
            if (/setInterval\s*\(/.test(line)) {
                if (!content.includes('clearInterval')) {
                    this.addIssue(
                        'warning',
                        'Memory Leak',
                        filePath,
                        idx + 1,
                        'setInterval without corresponding clearInterval',
                        'Store interval ID and clear it when appropriate'
                    );
                }
            }
        });
    }

    /**
     * Rule 14: Timeout/async issues
     */
    checkTimeoutIssues(content, filePath) {
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
            // setTimeout with 0 delay
            if (/setTimeout\s*\([^,]+,\s*0\s*\)/.test(line)) {
                this.addIssue(
                    'info',
                    'Timeout Pattern',
                    filePath,
                    idx + 1,
                    'setTimeout with 0 delay - consider using setImmediate or queueMicrotask',
                    'Use setImmediate() for Node.js or queueMicrotask() for browsers'
                );
            }
            
            // Very long timeouts (potential issue)
            const timeoutMatch = line.match(/setTimeout\s*\([^,]+,\s*(\d+)\s*\)/);
            if (timeoutMatch && parseInt(timeoutMatch[1]) > 60000) {
                this.addIssue(
                    'info',
                    'Long Timeout',
                    filePath,
                    idx + 1,
                    `Very long timeout: ${timeoutMatch[1]}ms (${Math.round(timeoutMatch[1]/1000)}s)`,
                    'Consider if this is intentional or if there is a better approach'
                );
            }
        });
    }

    // ==================== FILE SCANNING ====================

    scanFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.stats.filesScanned++;

            // Run all checks
            this.checkMissingCredentials(content, filePath);
            this.checkConsoleLogs(content, filePath);
            this.checkHardcodedSecrets(content, filePath);
            this.checkErrorHandling(content, filePath);
            this.checkSQLInjection(content, filePath);
            this.checkMissingAwait(content, filePath);
            this.checkResponseFormats(content, filePath);
            this.checkUnclosedResources(content, filePath);
            this.checkDeprecatedPatterns(content, filePath);
            this.checkEnvVarDefaults(content, filePath);
            this.checkRouteValidation(content, filePath);
            this.checkDuplicateFunctions(content, filePath);
            this.checkMemoryLeaks(content, filePath);
            this.checkTimeoutIssues(content, filePath);

        } catch (err) {
            if (this.verbose) {
                console.error(`Error scanning ${filePath}: ${err.message}`);
            }
        }
    }

    scanDirectory(dir, extensions = ['.js', '.ts', '.jsx', '.tsx']) {
        const ignorePatterns = ['node_modules', '.git', 'dist', 'build', 'coverage', 'public/vendor'];
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                // Skip ignored directories
                if (ignorePatterns.some(p => fullPath.includes(p))) continue;
                
                if (entry.isDirectory()) {
                    this.scanDirectory(fullPath, extensions);
                } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
                    this.scanFile(fullPath);
                }
            }
        } catch (err) {
            if (this.verbose) {
                console.error(`Error scanning directory ${dir}: ${err.message}`);
            }
        }
    }

    // ==================== REPORTING ====================

    generateReport() {
        console.log('\n');
        this.log('═'.repeat(70), 'cyan');
        this.log('  🔍  CODE ANOMALY DETECTION REPORT', 'bold');
        this.log('═'.repeat(70), 'cyan');
        console.log();

        // Summary
        this.log(`📁 Files Scanned: ${this.stats.filesScanned}`, 'white');
        this.log(`🔎 Total Issues: ${this.stats.issuesFound}`, 'white');
        console.log();
        
        if (this.stats.critical > 0) this.log(`  🔴 Critical: ${this.stats.critical}`, 'red');
        if (this.stats.warning > 0) this.log(`  🟡 Warning: ${this.stats.warning}`, 'yellow');
        if (this.stats.info > 0) this.log(`  🔵 Info: ${this.stats.info}`, 'blue');
        
        console.log();
        this.log('─'.repeat(70), 'cyan');
        
        // Group issues by category
        const byCategory = {};
        this.issues.forEach(issue => {
            if (!byCategory[issue.category]) byCategory[issue.category] = [];
            byCategory[issue.category].push(issue);
        });

        // Print by category
        Object.keys(byCategory).sort().forEach(category => {
            const categoryIssues = byCategory[category];
            const criticalCount = categoryIssues.filter(i => i.severity === 'critical').length;
            const warningCount = categoryIssues.filter(i => i.severity === 'warning').length;
            
            let icon = '📋';
            if (criticalCount > 0) icon = '🔴';
            else if (warningCount > 0) icon = '🟡';
            else icon = '🔵';
            
            console.log();
            this.log(`${icon} ${category} (${categoryIssues.length} issues)`, 'bold');
            
            categoryIssues.forEach(issue => {
                const severityColor = issue.severity === 'critical' ? 'red' : 
                                      issue.severity === 'warning' ? 'yellow' : 'blue';
                const severityIcon = issue.severity === 'critical' ? '❌' : 
                                     issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                
                const relPath = path.relative(this.rootDir, issue.file);
                console.log();
                this.log(`   ${severityIcon} ${relPath}:${issue.line}`, severityColor);
                console.log(`      ${issue.message}`);
                this.log(`      💡 ${issue.suggestion}`, 'green');
            });
        });

        // Final summary
        console.log();
        this.log('═'.repeat(70), 'cyan');
        
        if (this.stats.critical > 0) {
            this.log('  ❌ CRITICAL ISSUES FOUND - Immediate attention required!', 'red');
        } else if (this.stats.warning > 0) {
            this.log('  ⚠️  Warnings found - Review recommended', 'yellow');
        } else if (this.stats.info > 0) {
            this.log('  ℹ️  Minor suggestions found - Optional improvements', 'blue');
        } else {
            this.log('  ✅ No issues detected!', 'green');
        }
        
        this.log('═'.repeat(70), 'cyan');
        console.log();

        return {
            filesScanned: this.stats.filesScanned,
            totalIssues: this.stats.issuesFound,
            critical: this.stats.critical,
            warning: this.stats.warning,
            info: this.stats.info,
            issues: this.issues
        };
    }

    run() {
        this.log('\n🔍 Starting Code Anomaly Detection...', 'cyan');
        this.log(`   Scanning: ${this.rootDir}`, 'white');
        console.log();

        this.scanDirectory(this.rootDir);
        return this.generateReport();
    }
}

// ==================== CLI ENTRY POINT ====================

if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        fix: args.includes('--fix'),
        rootDir: process.cwd()
    };

    const detector = new AnomalyDetector(options);
    const report = detector.run();

    // Exit with error code if critical issues found
    process.exit(report.critical > 0 ? 1 : 0);
}

module.exports = AnomalyDetector;
