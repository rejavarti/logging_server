#!/usr/bin/env node
/**
 * Inject random logs from the past 7 days
 * Creates realistic log entries with varied timestamps, levels, and sources
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path - check multiple possible locations
const possiblePaths = [
    path.join(__dirname, '..', 'data', 'databases', 'enterprise_logs.db'),
    path.join(__dirname, '..', 'data', 'databases', 'logs.db'),
    path.join(__dirname, '..', 'data', 'logs.db')
];

let dbPath = null;
for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
        dbPath = p;
        break;
    }
}

if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found at:', dbPath);
    console.error('Make sure the server has been started at least once.');
    process.exit(1);
}

// Open database
const db = new sqlite3.Database(dbPath);

// Log levels with realistic distribution
const LOG_LEVELS = [
    { level: 'info', weight: 60 },
    { level: 'warn', weight: 20 },
    { level: 'error', weight: 15 },
    { level: 'debug', weight: 5 }
];

// Sample sources/services
const SOURCES = [
    'home-assistant', 'node-red', 'mqtt-broker', 'esp32-sensor',
    'zigbee-coordinator', 'weather-service', 'automation-engine',
    'database-service', 'web-server', 'backup-service',
    'camera-feed', 'motion-detector', 'thermostat', 'door-sensor'
];

// Sample messages by level
const MESSAGES = {
    info: [
        'Service started successfully',
        'Connection established',
        'Sensor reading updated',
        'Automation triggered',
        'State change detected',
        'Configuration reloaded',
        'Heartbeat received',
        'Data synchronized',
        'Backup completed',
        'Health check passed',
        'Message published',
        'Device discovered'
    ],
    warn: [
        'Connection timeout, retrying',
        'High memory usage detected',
        'Slow response time',
        'Certificate expiring soon',
        'Disk space running low',
        'Retry attempt {n} of 3',
        'Deprecated API usage',
        'Rate limit approaching',
        'Sensor not responding',
        'Configuration mismatch'
    ],
    error: [
        'Connection failed',
        'Database query timeout',
        'Authentication failed',
        'Device offline',
        'Parse error in configuration',
        'Network unreachable',
        'Service unavailable',
        'Invalid response format',
        'Sensor reading out of range',
        'Failed to write to disk'
    ],
    debug: [
        'Processing request',
        'Cache hit',
        'Query executed in {n}ms',
        'Event handler invoked',
        'Mutex acquired',
        'State transition: idle -> active',
        'Buffer size: {n} bytes',
        'Thread pool: {n} active'
    ]
};

// Generate random timestamp within the last 7 days
function randomTimestamp() {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const randomTime = sevenDaysAgo + Math.random() * (now - sevenDaysAgo);
    return new Date(randomTime).toISOString();
}

// Get weighted random level
function getRandomLevel() {
    const totalWeight = LOG_LEVELS.reduce((sum, l) => sum + l.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of LOG_LEVELS) {
        random -= item.weight;
        if (random <= 0) {
            return item.level;
        }
    }
    return 'info';
}

// Get random item from array
function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a log entry
function generateLog() {
    const level = getRandomLevel();
    const source = randomItem(SOURCES);
    let message = randomItem(MESSAGES[level]);
    
    // Replace placeholders
    message = message.replace('{n}', Math.floor(Math.random() * 100) + 1);
    
    return {
        timestamp: randomTimestamp(),
        level: level,
        source: source,
        message: message,
        metadata: JSON.stringify({
            host: `${source}-${Math.floor(Math.random() * 10)}`,
            pid: Math.floor(Math.random() * 10000) + 1000,
            correlationId: `corr-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        })
    };
}

// Insert logs in batches
async function insertLogs(count) {
    return new Promise((resolve, reject) => {
        const batchSize = 100;
        let inserted = 0;
        
        console.log(`📊 Generating ${count} random logs from the past 7 days...`);
        
        const insertBatch = () => {
            const remainingLogs = count - inserted;
            const currentBatchSize = Math.min(batchSize, remainingLogs);
            
            if (currentBatchSize === 0) {
                resolve(inserted);
                return;
            }
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                const stmt = db.prepare(`
                    INSERT INTO logs (timestamp, level, source, message, metadata)
                    VALUES (?, ?, ?, ?, ?)
                `);
                
                for (let i = 0; i < currentBatchSize; i++) {
                    const log = generateLog();
                    stmt.run(log.timestamp, log.level, log.source, log.message, log.metadata);
                }
                
                stmt.finalize();
                
                db.run('COMMIT', (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    inserted += currentBatchSize;
                    const progress = Math.floor((inserted / count) * 100);
                    process.stdout.write(`\r⏳ Progress: ${inserted}/${count} logs (${progress}%)   `);
                    
                    // Continue with next batch
                    setImmediate(insertBatch);
                });
            });
        };
        
        insertBatch();
    });
}

// Get current log count
function getLogCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM logs', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// Main execution
async function main() {
    try {
        const initialCount = await getLogCount();
        console.log(`📋 Current log count: ${initialCount}\n`);
        
        // Generate between 500-1000 logs
        const logsToGenerate = Math.floor(Math.random() * 500) + 500;
        
        await insertLogs(logsToGenerate);
        
        const finalCount = await getLogCount();
        console.log(`\n\n✅ Successfully injected ${logsToGenerate} logs!`);
        console.log(`📊 Total logs in database: ${finalCount}`);
        
        // Show distribution
        console.log('\n📈 Log distribution by level:');
        db.all(`
            SELECT level, COUNT(*) as count 
            FROM logs 
            GROUP BY level 
            ORDER BY count DESC
        `, (err, rows) => {
            if (!err) {
                rows.forEach(row => {
                    console.log(`   ${row.level.padEnd(8)}: ${row.count}`);
                });
            }
            
            console.log('\n📅 Log distribution by day:');
            db.all(`
                SELECT DATE(timestamp) as date, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= datetime('now', '-7 days')
                GROUP BY DATE(timestamp) 
                ORDER BY date DESC
            `, (err, rows) => {
                if (!err) {
                    rows.forEach(row => {
                        console.log(`   ${row.date}: ${row.count} logs`);
                    });
                }
                
                db.close();
                console.log('\n✨ Done!');
            });
        });
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        db.close();
        process.exit(1);
    }
}

main();
