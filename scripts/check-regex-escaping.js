#!/usr/bin/env node
/**
 * Regex Escaping Checker
 * 
 * Detects potentially problematic double-escaped regex patterns in JavaScript files
 * that are intended to run in the browser (via EJS templates).
 * 
 * Problem: In EJS templates, regex like /\\d+/ becomes /\d+/ in browser,
 * which is WRONG - the browser receives literal backslash-d.
 * 
 * The regex should be /\d+/ in the source, which becomes /\d+/ in browser.
 * 
 * However, if the source is a Node.js string that gets eval'd or sent as JSON,
 * then double escaping IS correct. This tool flags potential issues for review.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// Patterns to detect potentially problematic double-escaping
const patterns = [
    {
        name: 'Double-escaped digit class',
        regex: /\\\\d/g,
        description: '\\\\d should probably be \\d in browser regex'
    },
    {
        name: 'Double-escaped whitespace class',
        regex: /\\\\s/g,
        description: '\\\\s should probably be \\s in browser regex'
    },
    {
        name: 'Double-escaped word class',
        regex: /\\\\w/g,
        description: '\\\\w should probably be \\w in browser regex'
    },
    {
        name: 'Double-escaped word boundary',
        regex: /\\\\[bB]/g,
        description: '\\\\b or \\\\B should probably be \\b or \\B in browser regex'
    },
    {
        name: 'Double-escaped parenthesis',
        regex: /\\\\[()\[\]]/g,
        description: 'Double-escaped brackets in regex'
    },
    {
        name: 'Double-escaped dot',
        regex: /\\\\\./g,
        description: '\\\\. should probably be \\. in browser regex'
    }
];

// Files/directories to skip
const skipPatterns = [
    'node_modules',
    'archive',
    'backup',
    'deploy-package',
    '.git',
    'test-',
    'check-regex-escaping.js' // Skip this file
];

// Context patterns that indicate it's documentation/help text (OK to have double escapes)
const docContextPatterns = [
    /<code>/i,
    /example/i,
    /documentation/i,
    /help.*text/i,
    /<td>/i,
    /<li>/i,
    /innerHTML.*=/,
    /textContent.*=/
];

function shouldSkip(filePath) {
    return skipPatterns.some(p => filePath.includes(p));
}

function isDocumentation(line) {
    return docContextPatterns.some(p => p.test(line));
}

function scanFile(filePath) {
    const issues = [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
        // Skip if it's documentation/help text
        if (isDocumentation(line)) return;
        
        // Skip if it's a comment
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        
        // Check if line contains .match(), .replace(), .test(), .split() with regex
        if (!/\.(match|replace|test|split)\s*\(/.test(line)) return;
        
        patterns.forEach(pattern => {
            if (pattern.regex.test(line)) {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    pattern: pattern.name,
                    description: pattern.description,
                    code: line.trim().substring(0, 120)
                });
            }
        });
    });
    
    return issues;
}

function scanDirectory(dir) {
    let allIssues = [];
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (shouldSkip(fullPath)) continue;
        
        if (entry.isDirectory()) {
            allIssues = allIssues.concat(scanDirectory(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            const issues = scanFile(fullPath);
            allIssues = allIssues.concat(issues);
        }
    }
    
    return allIssues;
}

console.log('🔍 Regex Escaping Checker');
console.log('='.repeat(60));
console.log('');

const issues = scanDirectory(rootDir);

if (issues.length === 0) {
    console.log('✅ No potential double-escaping issues found!');
} else {
    console.log(`⚠️  Found ${issues.length} potential issues:\n`);
    
    issues.forEach((issue, i) => {
        const relPath = path.relative(rootDir, issue.file);
        console.log(`${i + 1}. ${relPath}:${issue.line}`);
        console.log(`   Pattern: ${issue.pattern}`);
        console.log(`   Code: ${issue.code}`);
        console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('NOTE: Not all findings are bugs. Review each case:');
    console.log('- If regex runs in BROWSER (EJS template JS): \\\\d is WRONG, use \\d');
    console.log('- If regex is in a Node.js STRING that gets parsed: \\\\d might be correct');
    console.log('- If it\'s in documentation/help text: OK to have \\\\d for display');
}

console.log('\nDone.');
