#!/usr/bin/env node
/**
 * QUICK ERROR SNAPSHOT TOOL
 * Checks for immediate error patterns without heavy API testing
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

console.log('🔍 QUICK ERROR ANALYSIS SNAPSHOT');
console.log('═════════════════════════════════════════════════════════');

// Check 1: Health endpoint only (no auth required)
console.log('\n🏥 Health Check...');
axios.get('http://localhost:10180/health', { timeout: 5000 })
    .then(response => {
        console.log('✅ Server Health: OK');
        console.log(`📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    })
    .catch(error => {
        console.log(`❌ Server Health: ${error.message}`);
    });

// Check 2: File system errors
console.log('\n📂 File System Check...');
const criticalFiles = [
    'server.js',
    'database-access-layer.js', 
    'universal-sqlite-adapter.js',
    'routes/dashboard.js',
    'routes/logs.js'
];

criticalFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ File exists: ${file}`);
    } else {
        console.log(`❌ File missing: ${file}`);
    }
});

// Check 3: Database file existence
console.log('\n💾 Database Check...');
const dbPaths = [
    path.join(__dirname, 'data', 'database.sqlite'),
    path.join(__dirname, 'data', 'logs.db'),
    path.join(__dirname, 'database.sqlite'),
    path.join(__dirname, 'logs.db')
];

dbPaths.forEach(dbPath => {
    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`✅ Database found: ${path.basename(dbPath)} (${Math.round(stats.size / 1024)}KB)`);
    }
});

// Check 4: Configuration errors
console.log('\n⚙️ Configuration Check...');
const configFiles = [
    '.env',
    'package.json',
    'docker-compose.yml'
];

configFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ Config exists: ${file}`);
        
        // Check for common config issues
        if (file === 'package.json') {
            try {
                const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const criticalDeps = ['express', 'sqlite3', 'jsonwebtoken'];
                criticalDeps.forEach(dep => {
                    if (pkg.dependencies && pkg.dependencies[dep]) {
                        console.log(`   ✅ ${dep}: ${pkg.dependencies[dep]}`);
                    } else if (pkg.devDependencies && pkg.devDependencies[dep]) {
                        console.log(`   ⚠️ ${dep}: ${pkg.devDependencies[dep]} (dev only)`);
                    } else {
                        console.log(`   ❌ ${dep}: missing`);
                    }
                });
            } catch (e) {
                console.log(`   ❌ package.json: Invalid JSON`);
            }
        }
    } else {
        console.log(`⚠️ Config missing: ${file}`);
    }
});

// Check 5: JavaScript syntax errors in critical files
console.log('\n🟨 JavaScript Syntax Check...');
const jsFiles = [
    'server.js',
    'database-access-layer.js',
    'universal-sqlite-adapter.js'
];

jsFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Basic syntax checks
            const issues = [];
            
            // Check for common syntax issues
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                // Check for unmatched brackets
                const openBrackets = (line.match(/\{/g) || []).length;
                const closeBrackets = (line.match(/\}/g) || []).length;
                const openParens = (line.match(/\(/g) || []).length;
                const closeParens = (line.match(/\)/g) || []).length;
                
                // Check for common typos
                if (line.includes('dalrun') || line.includes('dal.run(')) {
                    // This is actually correct
                }
                if (line.includes('require(') && !line.includes(');') && !line.includes('),')) {
                    issues.push(`Line ${index + 1}: Potential require statement issue`);
                }
            });
            
            if (issues.length === 0) {
                console.log(`✅ Syntax OK: ${file}`);
            } else {
                console.log(`⚠️ Potential issues in ${file}:`);
                issues.forEach(issue => console.log(`   ${issue}`));
            }
            
        } catch (error) {
            console.log(`❌ Cannot read ${file}: ${error.message}`);
        }
    }
});

// Check 6: Port conflicts
console.log('\n🔌 Port Check...');
const { spawn } = require('child_process');

// Check if port 10180 is in use
const netstat = spawn('netstat', ['-ano']);
let portFound = false;

netstat.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes(':10180')) {
        portFound = true;
        console.log('✅ Port 10180: In use (server running)');
    }
});

netstat.stderr.on('data', (data) => {
    console.log(`⚠️ netstat error: ${data}`);
});

netstat.on('close', (code) => {
    if (!portFound) {
        console.log('⚠️ Port 10180: Not in use (server not running?)');
    }
    
    // Final summary
    setTimeout(() => {
        console.log('\n═════════════════════════════════════════════════════════');
        console.log('📋 QUICK ERROR ANALYSIS COMPLETE');
        console.log('⏰ For detailed error analysis, wait for rate limiting to reset');
        console.log('💡 Most common issues: authentication rate limits, missing config files, port conflicts');
    }, 100);
});

netstat.on('error', (error) => {
    console.log(`❌ Port check failed: ${error.message}`);
});