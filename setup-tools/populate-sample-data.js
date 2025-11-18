#!/usr/bin/env node

/**
 * Sample Data Population Script for Enhanced Universal Logging Platform
 * This script populates the database with sample data for testing and demonstration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment-timezone');

const TIMEZONE = 'America/Edmonton';
const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');

console.log('🔄 Populating sample data for testing...');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }
    console.log('✅ Connected to database:', dbPath);
});

// Sample log data
const sampleLogs = [
    { level: 'info', message: 'System startup completed successfully', source: 'system', ip: '127.0.0.1' },
    { level: 'info', message: 'User admin logged in', source: 'authentication', ip: '192.168.1.100' },
    { level: 'warning', message: 'High memory usage detected: 85%', source: 'monitoring', ip: '127.0.0.1' },
    { level: 'error', message: 'Failed to connect to MQTT broker', source: 'integration-mqtt', ip: '127.0.0.1' },
    { level: 'info', message: 'WebSocket client connected from 192.168.1.50', source: 'websocket', ip: '192.168.1.50' },
    { level: 'debug', message: 'Processing HTTP request: GET /api/logs', source: 'http-server', ip: '192.168.1.100' },
    { level: 'critical', message: 'Database backup failed - disk full', source: 'backup-system', ip: '127.0.0.1' },
    { level: 'info', message: 'ESP32 device reported temperature: 22.5°C', source: 'esp32-sensor', ip: '192.168.1.75' },
    { level: 'warning', message: 'SSL certificate expires in 30 days', source: 'security-monitor', ip: '127.0.0.1' },
    { level: 'error', message: 'Rate limit exceeded for IP 203.0.113.45', source: 'rate-limiter', ip: '203.0.113.45' },
    { level: 'info', message: 'Scheduled backup completed successfully', source: 'backup-system', ip: '127.0.0.1' },
    { level: 'debug', message: 'Cache cleared: 1,247 entries removed', source: 'cache-manager', ip: '127.0.0.1' },
    { level: 'info', message: 'Integration health check: Home Assistant OK', source: 'integration-ha', ip: '192.168.1.200' },
    { level: 'warning', message: 'Unusual login pattern detected for user: testuser', source: 'security-monitor', ip: '192.168.1.150' },
    { level: 'info', message: 'Dashboard widget refreshed: system-stats', source: 'dashboard', ip: '192.168.1.100' }
];

// Sample user activity data
const sampleActivities = [
    { user_id: 1, action: 'login', resource: '/dashboard', details: 'Successful login', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    { user_id: 1, action: 'view_logs', resource: '/logs', details: 'Accessed logs page', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    { user_id: 1, action: 'search', resource: '/search', details: 'Searched for: error level logs', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    { user_id: 1, action: 'settings_update', resource: '/admin/settings', details: 'Updated system timezone', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    { user_id: 1, action: 'view_analytics', resource: '/analytics-advanced', details: 'Accessed advanced analytics', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    { user_id: 1, action: 'export_logs', resource: '/api/logs/export', details: 'Exported 500 log entries as CSV', ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
];

// Sample alerts data (matching actual schema)
const sampleAlerts = [
    { rule_id: null, severity: 'critical', message: 'Multiple critical errors detected in system logs', source: 'error-monitor', details: JSON.stringify({ count: 5, pattern: 'critical' }), is_resolved: 0 },
    { rule_id: null, severity: 'warning', message: 'Unusual spike in log volume detected', source: 'volume-monitor', details: JSON.stringify({ rate: '150 logs/min', threshold: '100 logs/min' }), is_resolved: 0 },
    { rule_id: null, severity: 'error', message: 'Multiple login failures from same IP', source: 'auth-monitor', details: JSON.stringify({ ip: '203.0.113.45', attempts: 8 }), is_resolved: 1, resolved_by: 1 }
];

async function populateData() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            let completed = 0;
            const total = sampleLogs.length + sampleActivities.length + sampleAlerts.length;

            console.log(`📝 Inserting ${sampleLogs.length} sample log entries...`);
            
            // Insert sample logs with varied timestamps
            sampleLogs.forEach((log, index) => {
                const timestamp = moment().tz(TIMEZONE).subtract(Math.floor(Math.random() * 24), 'hours').subtract(Math.floor(Math.random() * 60), 'minutes').format('YYYY-MM-DD HH:mm:ss');
                
                db.run(
                    'INSERT INTO logs (level, message, source, timestamp, ip) VALUES (?, ?, ?, ?, ?)',
                    [log.level, log.message, log.source, timestamp, log.ip],
                    function(err) {
                        if (err) {
                            console.error('Failed to insert log:', err);
                        } else {
                            completed++;
                            if (completed === total) resolve();
                        }
                    }
                );
            });

            console.log(`👤 Inserting ${sampleActivities.length} sample user activities...`);
            
            // Insert sample user activities with varied timestamps
            sampleActivities.forEach((activity, index) => {
                const timestamp = moment().tz(TIMEZONE).subtract(Math.floor(Math.random() * 12), 'hours').subtract(Math.floor(Math.random() * 60), 'minutes').format('YYYY-MM-DD HH:mm:ss');
                
                db.run(
                    'INSERT INTO user_activity (user_id, action, resource, details, ip_address, user_agent, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [activity.user_id, activity.action, activity.resource, activity.details, activity.ip_address, activity.user_agent, timestamp],
                    function(err) {
                        if (err) {
                            console.error('Failed to insert activity:', err);
                        } else {
                            completed++;
                            if (completed === total) resolve();
                        }
                    }
                );
            });

            console.log(`🚨 Inserting ${sampleAlerts.length} sample alerts...`);
            
            // Insert sample alerts with varied timestamps
            sampleAlerts.forEach((alert, index) => {
                const created_at = moment().tz(TIMEZONE).subtract(Math.floor(Math.random() * 6), 'hours').subtract(Math.floor(Math.random() * 60), 'minutes').format('YYYY-MM-DD HH:mm:ss');
                const resolved_at = alert.is_resolved ? moment(created_at).add(Math.floor(Math.random() * 120), 'minutes').format('YYYY-MM-DD HH:mm:ss') : null;
                
                db.run(
                    'INSERT INTO system_alerts (rule_id, severity, message, source, details, is_resolved, resolved_by, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [alert.rule_id, alert.severity, alert.message, alert.source, alert.details, alert.is_resolved, alert.resolved_by || null, created_at, resolved_at],
                    function(err) {
                        if (err) {
                            console.error('Failed to insert alert:', err);
                        } else {
                            completed++;
                            if (completed === total) resolve();
                        }
                    }
                );
            });
        });
    });
}

async function main() {
    try {
        await populateData();
        
        console.log('\n✅ Sample data population completed successfully!');
        console.log('📊 Data summary:');
        console.log(`   • ${sampleLogs.length} log entries`);
        console.log(`   • ${sampleActivities.length} user activities`);
        console.log(`   • ${sampleAlerts.length} system alerts`);
        console.log('\n🎯 You can now test the following pages with data:');
        console.log('   • Dashboard - view system stats');
        console.log('   • Logs - browse log entries');
        console.log('   • Activity - see user timeline');
        console.log('   • Analytics - view charts and graphs');
        console.log('   • Alerts - manage system alerts');
        console.log('   • Security & Audit - review audit trail');
        
    } catch (error) {
        console.error('❌ Failed to populate sample data:', error);
        process.exit(1);
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('📁 Database connection closed.');
            }
            process.exit(0);
        });
    }
}

main();