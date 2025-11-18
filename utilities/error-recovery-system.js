/**
 * 🛠️ INTELLIGENT ERROR RECOVERY SYSTEM
 * Automatically detects and fixes common runtime errors
 */

const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const fs = require('fs');

class ErrorRecoverySystem {
    constructor() {
        this.db = null;
        this.recoveryLog = [];
    }

    async diagnoseAndRecover() {
        console.log('🛠️ Starting intelligent error recovery...\n');
        
        const issues = [];
        const fixes = [];

        // 1. Database Issues
        await this.checkDatabaseIssues(issues, fixes);
        
        // 2. Server Issues  
        await this.checkServerIssues(issues, fixes);
        
        // 3. Configuration Issues
        await this.checkConfigurationIssues(issues, fixes);
        
        // 4. Performance Issues
        await this.checkPerformanceIssues(issues, fixes);

        // Report findings
        this.reportFindings(issues, fixes);
        
        return { issues, fixes };
    }

    async checkDatabaseIssues(issues, fixes) {
        console.log('🔍 Checking database issues...');
        
        try {
            // Check if database file exists
            if (!fs.existsSync('/app/logs.db')) {
                issues.push('Database file missing');
                fixes.push('Run database migration');
                return;
            }
            
            // Check if database is empty
            const stats = fs.statSync('/app/logs.db');
            if (stats.size === 0) {
                issues.push('Database file is empty');
                fixes.push('Re-run database migration with Universal SQLite Adapter');
            }
            
            // Test database connection
            this.db = new UniversalSQLiteAdapter('/app/logs.db');
            await this.db.get('SELECT 1');
            
            // Check core tables
            const tables = await this.db.all("SELECT name FROM sqlite_master WHERE type='table'");
            const requiredTables = ['logs', 'users', 'user_sessions', 'dashboards', 'dashboard_widgets'];
            
            for (const table of requiredTables) {
                if (!tables.find(t => t.name === table)) {
                    issues.push(`Missing table: ${table}`);
                    fixes.push('Run fixed-database-migration.js');
                }
            }
            
            console.log('✅ Database checks completed');
            
        } catch (error) {
            issues.push(`Database connection error: ${error.message}`);
            fixes.push('Restart container and re-run migration');
        }
    }

    async checkServerIssues(issues, fixes) {
        console.log('🔍 Checking server issues...');
        
        try {
            const http = require('http');
            
            const testEndpoint = (path) => {
                return new Promise((resolve, reject) => {
                    const req = http.get({
                        hostname: 'localhost',
                        port: 3000,
                        path: path,
                        timeout: 5000
                    }, (res) => {
                        resolve(res.statusCode);
                    });
                    
                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Timeout'));
                    });
                });
            };
            
            // Test health endpoint
            const healthStatus = await testEndpoint('/health');
            if (healthStatus !== 200) {
                issues.push(`Health endpoint returns ${healthStatus}`);
                fixes.push('Check server.js for startup errors');
            }
            
            // Test dashboard endpoint  
            const dashboardStatus = await testEndpoint('/dashboard');
            if (dashboardStatus === 500) {
                issues.push('Dashboard returning 500 error');
                fixes.push('Check dashboard.js route - likely missing logsToday calculation');
            }
            
            console.log('✅ Server checks completed');
            
        } catch (error) {
            issues.push(`Server connectivity error: ${error.message}`);
            fixes.push('Check if server is running: docker logs enhanced-logging-production');
        }
    }

    async checkConfigurationIssues(issues, fixes) {
        console.log('🔍 Checking configuration issues...');
        
        try {
            // Check if admin user exists
            if (this.db) {
                const admin = await this.db.get("SELECT * FROM users WHERE username = 'admin'");
                if (!admin) {
                    issues.push('Admin user missing');
                    fixes.push('Run fixed-database-migration.js to create admin user');
                } else if (!admin.password_hash) {
                    issues.push('Admin password not set');
                    fixes.push('Update admin password hash');
                }
            }
            
            // Check environment variables
            if (!process.env.PORT) {
                issues.push('PORT environment variable not set');
                fixes.push('Set PORT=3000 in environment');
            }
            
            console.log('✅ Configuration checks completed');
            
        } catch (error) {
            issues.push(`Configuration check error: ${error.message}`);
        }
    }

    async checkPerformanceIssues(issues, fixes) {
        console.log('🔍 Checking performance issues...');
        
        try {
            // Check memory usage
            const memUsage = process.memoryUsage();
            if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
                issues.push('High memory usage detected');
                fixes.push('Restart container or optimize queries');
            }
            
            // Test response time
            const start = Date.now();
            if (this.db) {
                await this.db.get('SELECT COUNT(*) FROM logs');
            }
            const responseTime = Date.now() - start;
            
            if (responseTime > 1000) {
                issues.push(`Slow database queries (${responseTime}ms)`);
                fixes.push('Check database indexes and optimize queries');
            }
            
            console.log('✅ Performance checks completed');
            
        } catch (error) {
            issues.push(`Performance check error: ${error.message}`);
        }
    }

    reportFindings(issues, fixes) {
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('🛠️ ERROR RECOVERY ANALYSIS RESULTS');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (issues.length === 0) {
            console.log('🎉 No issues detected - system is healthy!');
        } else {
            console.log(`⚠️  Found ${issues.length} issue(s):`);
            console.log('');
            
            issues.forEach((issue, index) => {
                console.log(`${index + 1}. ❌ ${issue}`);
                console.log(`   🔧 Fix: ${fixes[index]}`);
                console.log('');
            });
        }
        
        console.log('═══════════════════════════════════════════════════════════════');
    }

    async autoFix() {
        console.log('🔧 Attempting automatic fixes...\n');
        
        const { issues, fixes } = await this.diagnoseAndRecover();
        
        if (issues.length === 0) {
            console.log('✅ No fixes needed!');
            return;
        }
        
        // Auto-fix database issues
        if (issues.some(i => i.includes('empty') || i.includes('Missing table'))) {
            console.log('🔧 Auto-fixing database issues...');
            try {
                const { runMigration } = require('./fixed-database-migration');
                await runMigration();
                console.log('✅ Database migration completed');
            } catch (error) {
                console.error('❌ Auto-fix failed:', error.message);
            }
        }
        
        // Auto-restart server if needed
        if (issues.some(i => i.includes('connectivity') || i.includes('500 error'))) {
            console.log('🔧 Server restart recommended');
            console.log('Run: docker restart enhanced-logging-production');
        }
    }
}

// Export for use in other scripts
module.exports = { ErrorRecoverySystem };

// Run if called directly
if (require.main === module) {
    const recovery = new ErrorRecoverySystem();
    recovery.diagnoseAndRecover()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Recovery system failed:', error);
            process.exit(1);
        });
}