/**
 * JSON Format Diagnostic and Fix Tool
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'sample-logs', 'application.json');

console.log('🔍 Diagnosing JSON format issue in application.json...\n');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📄 File contains ${lines.length} lines`);
    console.log('🔍 Checking each line for JSON validity...\n');
    
    let validLines = 0;
    let invalidLines = [];
    
    lines.forEach((line, index) => {
        try {
            JSON.parse(line);
            console.log(`✅ Line ${index + 1}: Valid JSON`);
            validLines++;
        } catch (error) {
            console.log(`❌ Line ${index + 1}: ${error.message}`);
            invalidLines.push({ line: index + 1, content: line, error: error.message });
        }
    });
    
    console.log(`\n📊 Results: ${validLines}/${lines.length} lines are valid JSON`);
    
    if (invalidLines.length > 0) {
        console.log('\n🔧 Invalid lines found:');
        invalidLines.forEach(item => {
            console.log(`   Line ${item.line}: ${item.content.substring(0, 50)}...`);
            console.log(`   Error: ${item.error}`);
        });
    }
    
    // Check if it's JSONL format (each line is separate JSON)
    if (validLines === lines.length && lines.length > 1) {
        console.log('\n✅ Format Detection: This is JSONL (JSON Lines) format');
        console.log('💡 Each line is a separate JSON object - this is correct for log files');
        console.log('🔧 Some parsers expect JSON array format instead');
        
        // Offer to create both formats
        console.log('\n🛠️ Creating alternative formats...');
        
        // Create JSON Array format
        const jsonArray = lines.map(line => JSON.parse(line));
        const arrayFilePath = path.join(__dirname, 'sample-logs', 'application-array.json');
        fs.writeFileSync(arrayFilePath, JSON.stringify(jsonArray, null, 2));
        console.log(`✅ Created JSON Array format: ${arrayFilePath}`);
        
        // Validate the original JSONL format is actually correct
        console.log('\n🧪 Testing JSONL parsing...');
        let parsedCount = 0;
        lines.forEach((line, index) => {
            try {
                const parsed = JSON.parse(line);
                if (parsed.timestamp && parsed.level && parsed.service) {
                    parsedCount++;
                }
            } catch (e) {
                console.log(`❌ Parse error on line ${index + 1}: ${e.message}`);
            }
        });
        
        console.log(`✅ Successfully parsed ${parsedCount}/${lines.length} JSONL entries`);
        
    } else if (lines.length === 1) {
        // Single JSON object
        console.log('\n✅ Format Detection: Single JSON object');
    } else {
        console.log('\n❌ Format Issue: Mixed or invalid JSON format detected');
        
        // Try to fix common issues
        console.log('\n🔧 Attempting to fix JSON format issues...');
        
        const fixedLines = [];
        lines.forEach((line, index) => {
            let fixedLine = line.trim();
            
            // Common fixes
            if (fixedLine && !fixedLine.startsWith('{')) {
                console.log(`⚠️ Line ${index + 1}: Doesn't start with {`);
            } else if (fixedLine && !fixedLine.endsWith('}')) {
                console.log(`⚠️ Line ${index + 1}: Doesn't end with }`);
            } else {
                try {
                    JSON.parse(fixedLine);
                    fixedLines.push(fixedLine);
                } catch (e) {
                    console.log(`❌ Line ${index + 1}: Cannot fix - ${e.message}`);
                }
            }
        });
        
        if (fixedLines.length === lines.length) {
            console.log('✅ All lines can be fixed');
            const backupPath = path.join(__dirname, 'sample-logs', 'application.json.backup');
            fs.writeFileSync(backupPath, content);
            console.log(`📦 Backup created: ${backupPath}`);
            
            const fixedContent = fixedLines.join('\n');
            fs.writeFileSync(filePath, fixedContent);
            console.log(`✅ Fixed file written: ${filePath}`);
        }
    }
    
} catch (error) {
    console.error('❌ File reading error:', error.message);
}

console.log('\n🔍 JSON diagnostic complete!');