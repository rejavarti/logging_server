/**
 * Check sample logs for any syntax or formatting issues
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking sample log files for issues...\n');

const sampleDir = path.join(__dirname, 'sample-logs');

// Check all sample files
const files = ['apache-access.log', 'application.json', 'syslog.log'];

files.forEach(filename => {
    const filePath = path.join(sampleDir, filename);
    
    console.log(`📄 Checking: ${filename}`);
    
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`  ❌ File not found: ${filePath}`);
            return;
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        console.log(`  ✅ File exists: ${lines.length} lines`);
        
        // Special checks per file type
        if (filename.endsWith('.json')) {
            // Check if each line is valid JSON
            let validJsonLines = 0;
            let invalidLines = [];
            
            lines.forEach((line, index) => {
                try {
                    JSON.parse(line);
                    validJsonLines++;
                } catch (error) {
                    invalidLines.push({ line: index + 1, error: error.message });
                }
            });
            
            console.log(`  ✅ Valid JSON lines: ${validJsonLines}/${lines.length}`);
            
            if (invalidLines.length > 0) {
                console.log(`  ❌ Invalid JSON lines found:`);
                invalidLines.forEach(item => {
                    console.log(`    Line ${item.line}: ${item.error}`);
                });
            }
        }
        
        // Show first few lines as sample
        console.log(`  📝 First 2 lines:`);
        lines.slice(0, 2).forEach((line, index) => {
            console.log(`    ${index + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
        });
        
        console.log('');
        
    } catch (error) {
        console.log(`  ❌ Error reading file: ${error.message}\n`);
    }
});

console.log('🔧 Sample log validation complete!');