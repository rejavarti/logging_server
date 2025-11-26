#!/usr/bin/env node
/**
 * Auto-Fix Missing Credentials in Fetch Calls
 * Adds credentials: 'same-origin' to all fetch calls to /api/ endpoints
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

// Files to skip (archives, backups, node_modules, etc.)
const SKIP_PATTERNS = [
    'node_modules',
    'archive',
    'backup',
    '.git',
    'dist',
    'build',
    'coverage',
    'deploy-package'
];

// Track statistics
const stats = {
    filesScanned: 0,
    filesModified: 0,
    fixesApplied: 0,
    errors: []
};

function shouldSkipFile(filePath) {
    return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function fixFetchCredentials(content, filePath) {
    let modified = false;
    let fixCount = 0;
    
    // Pattern 1: fetch('/api/...', { credentials: 'same-origin' }) without options - add options object
    // fetch('/api/something', { credentials: 'same-origin' })  ->  fetch('/api/something', { credentials: 'same-origin' })
    const pattern1 = /fetch\s*\(\s*(['"`]\/api\/[^'"`]+['"`])\s*\)/g;
    content = content.replace(pattern1, (match, url) => {
        modified = true;
        fixCount++;
        return `fetch(${url}, { credentials: 'same-origin' })`;
    });
    
    // Pattern 2: fetch('/api/...', { method: '...', credentials: 'same-origin' }) without credentials
    // Need to add credentials to existing options object
    const pattern2 = /fetch\s*\(\s*(['"`]\/api\/[^'"`]+['"`])\s*,\s*\{([^}]*)\}\s*\)/g;
    content = content.replace(pattern2, (match, url, options) => {
        // Skip if already has credentials
        if (options.includes('credentials')) {
            return match;
        }
        modified = true;
        fixCount++;
        // Add credentials to the options
        const trimmedOptions = options.trim();
        if (trimmedOptions.endsWith(',')) {
            return `fetch(${url}, { ${trimmedOptions} credentials: 'same-origin' })`;
        } else if (trimmedOptions) {
            return `fetch(${url}, { ${trimmedOptions}, credentials: 'same-origin' })`;
        } else {
            return `fetch(${url}, { credentials: 'same-origin' })`;
        }
    });
    
    // Pattern 3: Multi-line fetch options (more complex)
    // This handles cases where the options span multiple lines
    const lines = content.split('\n');
    const newLines = [];
    let inFetch = false;
    let fetchStartLine = -1;
    let braceCount = 0;
    let fetchBuffer = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect start of fetch call to /api/
        if (!inFetch && /fetch\s*\(\s*['"`]\/api\//.test(line)) {
            // Check if this line already has credentials
            if (line.includes('credentials')) {
                newLines.push(line);
                continue;
            }
            
            // Check if fetch completes on same line
            const openParens = (line.match(/\(/g) || []).length;
            const closeParens = (line.match(/\)/g) || []).length;
            
            if (openParens === closeParens) {
                // Single line fetch - already handled by pattern1/pattern2
                newLines.push(line);
                continue;
            }
            
            // Multi-line fetch
            inFetch = true;
            fetchStartLine = i;
            fetchBuffer = line;
            braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            continue;
        }
        
        if (inFetch) {
            fetchBuffer += '\n' + line;
            braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            
            // Check if fetch call ends
            if (line.includes(')') && braceCount <= 0) {
                // Process the complete fetch call
                if (!fetchBuffer.includes('credentials')) {
                    // Find the last } before the closing )
                    const lastBraceIndex = fetchBuffer.lastIndexOf('}');
                    if (lastBraceIndex !== -1) {
                        // Check if there's content before the brace
                        const beforeBrace = fetchBuffer.substring(0, lastBraceIndex).trim();
                        if (beforeBrace.endsWith(',')) {
                            fetchBuffer = fetchBuffer.substring(0, lastBraceIndex) + 
                                "credentials: 'same-origin' " + 
                                fetchBuffer.substring(lastBraceIndex);
                        } else {
                            fetchBuffer = fetchBuffer.substring(0, lastBraceIndex) + 
                                ", credentials: 'same-origin' " + 
                                fetchBuffer.substring(lastBraceIndex);
                        }
                        modified = true;
                        fixCount++;
                    }
                }
                newLines.push(...fetchBuffer.split('\n'));
                inFetch = false;
                fetchBuffer = '';
                continue;
            }
        } else {
            newLines.push(line);
        }
    }
    
    // If we ended while still in a fetch, add the buffer
    if (inFetch) {
        newLines.push(...fetchBuffer.split('\n'));
    }
    
    return {
        content: modified ? newLines.join('\n') : content,
        modified,
        fixCount
    };
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        stats.filesScanned++;
        
        // Only process JS files
        if (!filePath.endsWith('.js')) return;
        
        // Skip if no fetch to /api/
        if (!content.includes("fetch(") || !content.includes('/api/')) return;
        
        const result = fixFetchCredentials(content, filePath);
        
        if (result.modified) {
            fs.writeFileSync(filePath, result.content, 'utf8');
            stats.filesModified++;
            stats.fixesApplied += result.fixCount;
            console.log(`${COLORS.green}✅ Fixed ${result.fixCount} fetch calls in: ${path.relative(process.cwd(), filePath)}${COLORS.reset}`);
        }
    } catch (err) {
        stats.errors.push({ file: filePath, error: err.message });
    }
}

function processDirectory(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (shouldSkipFile(fullPath)) continue;
            
            if (entry.isDirectory()) {
                processDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                processFile(fullPath);
            }
        }
    } catch (err) {
        stats.errors.push({ file: dir, error: err.message });
    }
}

// Main execution
console.log(`\n${COLORS.cyan}${COLORS.bold}🔧 Auto-Fix: Missing Credentials in Fetch Calls${COLORS.reset}\n`);
console.log(`Scanning: ${process.cwd()}\n`);

processDirectory(process.cwd());

// Report
console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════${COLORS.reset}`);
console.log(`${COLORS.bold}📊 Summary${COLORS.reset}`);
console.log(`${COLORS.cyan}═══════════════════════════════════════════════════${COLORS.reset}`);
console.log(`   Files scanned:  ${stats.filesScanned}`);
console.log(`   Files modified: ${COLORS.green}${stats.filesModified}${COLORS.reset}`);
console.log(`   Fixes applied:  ${COLORS.green}${stats.fixesApplied}${COLORS.reset}`);

if (stats.errors.length > 0) {
    console.log(`\n${COLORS.red}Errors:${COLORS.reset}`);
    stats.errors.forEach(e => console.log(`   ${e.file}: ${e.error}`));
}

console.log(`\n${COLORS.green}✅ Done!${COLORS.reset}\n`);
