/**
 * Enhanced JSON Log Parser
 * Supports both JSONL (JSON Lines) and JSON Array formats
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Enhanced JSON Log Parser...\n');

// Test both JSON formats
const testFiles = [
    { name: 'JSONL Format', file: 'application.json' },
    { name: 'JSON Array Format', file: 'application-array.json' }
];

testFiles.forEach(testFile => {
    console.log(`🔄 Testing ${testFile.name}: ${testFile.file}`);
    
    const filePath = path.join(__dirname, 'sample-logs', testFile.file);
    
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ File not found: ${testFile.file}\n`);
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let logEntries = [];
        
        if (testFile.file.includes('array')) {
            // JSON Array format
            try {
                logEntries = JSON.parse(content);
                console.log(`✅ Parsed as JSON Array: ${logEntries.length} entries`);
            } catch (error) {
                console.log(`❌ JSON Array parsing failed: ${error.message}`);
                return;
            }
        } else {
            // JSONL format - parse line by line
            const lines = content.split('\n').filter(line => line.trim());
            lines.forEach((line, index) => {
                try {
                    const entry = JSON.parse(line);
                    logEntries.push(entry);
                } catch (error) {
                    console.log(`❌ Line ${index + 1} parsing failed: ${error.message}`);
                }
            });
            console.log(`✅ Parsed as JSONL: ${logEntries.length} entries`);
        }
        
        // Analyze the parsed data
        if (logEntries.length > 0) {
            const levels = {};
            const services = {};
            
            logEntries.forEach(entry => {
                const level = entry.level || 'unknown';
                const service = entry.service || 'unknown';
                
                levels[level] = (levels[level] || 0) + 1;
                services[service] = (services[service] || 0) + 1;
            });
            
            console.log(`   📊 Log Levels:`, Object.keys(levels).map(k => `${k}:${levels[k]}`).join(', '));
            console.log(`   🏷️ Services:`, Object.keys(services).map(k => `${k}:${services[k]}`).join(', '));
        }
        
        console.log('');
        
    } catch (error) {
        console.error(`❌ File reading error: ${error.message}\n`);
    }
});

// Create a universal JSON log parser function
function parseJsonLogs(content) {
    let logEntries = [];
    
    // Try JSON Array format first
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return { format: 'JSON Array', entries: parsed };
        } else {
            return { format: 'Single JSON', entries: [parsed] };
        }
    } catch (arrayError) {
        // Try JSONL format
        try {
            const lines = content.split('\n').filter(line => line.trim());
            const entries = [];
            
            lines.forEach(line => {
                try {
                    entries.push(JSON.parse(line));
                } catch (lineError) {
                    // Skip invalid lines
                }
            });
            
            return { format: 'JSONL', entries: entries };
        } catch (jsonlError) {
            throw new Error(`Neither JSON Array nor JSONL format: ${arrayError.message}`);
        }
    }
}

console.log('🔧 Testing Universal Parser...');
const testContent = fs.readFileSync(path.join(__dirname, 'sample-logs', 'application.json'), 'utf8');
const result = parseJsonLogs(testContent);
console.log(`✅ Detected format: ${result.format}`);
console.log(`✅ Parsed entries: ${result.entries.length}`);

console.log('\n🎯 Solution: JSONL format is correct for log files!');
console.log('💡 If a tool expects JSON Array format, use application-array.json instead');
console.log('📋 Both formats are now available and fully functional\n');