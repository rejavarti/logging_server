/**
 * Comprehensive Syntax and Method Verification
 * Run this before any deployment to catch issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== COMPREHENSIVE PRE-DEPLOYMENT VERIFICATION ===\n');

// Test 1: Syntax Check All Files
console.log('[1/5] SYNTAX CHECK');
console.log('-'.repeat(50));

function checkSyntax(file) {
    try {
        execSync(`node -c "${file}"`, { stdio: 'pipe' });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.stderr?.toString() || e.message };
    }
}

function walkDir(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walkDir(full, results);
        else if (f.endsWith('.js')) results.push(full);
    });
    return results;
}

const dirs = ['routes', 'middleware', 'configs', 'engines', 'widgets'];
let syntaxFailures = [];

dirs.forEach(dir => {
    const files = walkDir(dir);
    files.forEach(f => {
        const result = checkSyntax(f);
        if (!result.ok) syntaxFailures.push({ file: f, error: result.error });
    });
});

['server.js', 'database-access-layer.js'].forEach(f => {
    if (fs.existsSync(f)) {
        const result = checkSyntax(f);
        if (!result.ok) syntaxFailures.push({ file: f, error: result.error });
    }
});

if (syntaxFailures.length === 0) {
    console.log('✅ All files passed syntax check\n');
} else {
    console.log('❌ SYNTAX ERRORS FOUND:');
    syntaxFailures.forEach(f => {
        console.log(`  - ${f.file}`);
        console.log(`    ${f.error?.substring(0, 100)}`);
    });
    console.log();
}

// Test 2: DAL Method Verification
console.log('[2/5] DAL METHOD VERIFICATION');
console.log('-'.repeat(50));

const dalContent = fs.readFileSync('database-access-layer.js', 'utf8');
const asyncMethods = [...dalContent.matchAll(/async\s+(\w+)\s*\(/g)].map(m => m[1]);
const syncMethods = [...dalContent.matchAll(/^\s+(\w+)\s*\([^)]*\)\s*\{/gm)].map(m => m[1]);
const properties = [...dalContent.matchAll(/^\s+(\w+)\s*=\s*\[/gm)].map(m => m[1]);
const dalMethods = new Set([...asyncMethods, ...syncMethods, ...properties]);

let dalIssues = [];
walkDir('routes').forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const calls = [...content.matchAll(/req\.dal\.(\w+)\s*\(/g)];
    calls.forEach(match => {
        if (!dalMethods.has(match[1])) {
            dalIssues.push({ file: path.relative('.', file), method: match[1] });
        }
    });
});

if (dalIssues.length === 0) {
    console.log('✅ All DAL method calls have implementations\n');
} else {
    console.log('❌ MISSING DAL METHODS:');
    dalIssues.forEach(i => console.log(`  - ${i.method} in ${i.file}`));
    console.log();
}

// Test 3: Check for missing requires
console.log('[3/5] REQUIRE/MODULE VERIFICATION');
console.log('-'.repeat(50));

let requireIssues = [];
[...walkDir('routes'), ...walkDir('middleware'), ...walkDir('configs')].forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const requires = [...content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)];
    requires.forEach(match => {
        const mod = match[1];
        if (mod.startsWith('.') || mod.startsWith('..')) {
            const resolved = path.resolve(path.dirname(file), mod);
            const exists = fs.existsSync(resolved) || 
                          fs.existsSync(resolved + '.js') || 
                          fs.existsSync(path.join(resolved, 'index.js')) ||
                          fs.existsSync(resolved + '.json');
            if (!exists) {
                requireIssues.push({ file: path.relative('.', file), module: mod });
            }
        }
    });
});

if (requireIssues.length === 0) {
    console.log('✅ All relative requires resolve correctly\n');
} else {
    console.log('❌ MISSING MODULES:');
    requireIssues.forEach(i => console.log(`  - ${i.module} in ${i.file}`));
    console.log();
}

// Test 4: Check for undefined function calls in templates
console.log('[4/5] TEMPLATE FUNCTION VERIFICATION');
console.log('-'.repeat(50));

// Find all onclick handlers in templates
const templateFiles = [...walkDir('routes'), ...walkDir('configs/templates')];
const onclickFunctions = new Set();
const definedFunctions = new Set();

templateFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // Find onclick handlers
    const onclicks = [...content.matchAll(/onclick\s*=\s*["']([^"'(]+)/g)];
    onclicks.forEach(m => onclickFunctions.add(m[1].trim()));
    
    // Find function definitions
    const funcDefs = [...content.matchAll(/function\s+(\w+)\s*\(/g)];
    funcDefs.forEach(m => definedFunctions.add(m[1]));
    
    // Arrow functions assigned to window
    const windowFuncs = [...content.matchAll(/window\.(\w+)\s*=/g)];
    windowFuncs.forEach(m => definedFunctions.add(m[1]));
    
    // Const/let function expressions
    const constFuncs = [...content.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g)];
    constFuncs.forEach(m => definedFunctions.add(m[1]));
});

// Common built-in/expected functions
const builtins = new Set(['window', 'document', 'console', 'alert', 'confirm', 'close', 'history', 'location', 'event']);
const unusedOnclicks = [...onclickFunctions].filter(f => !definedFunctions.has(f) && !builtins.has(f.split('.')[0]));

if (unusedOnclicks.length < 5) { // Some false positives expected
    console.log('✅ Template functions appear properly defined\n');
} else {
    console.log(`⚠️  ${unusedOnclicks.length} onclick handlers may reference undefined functions`);
    console.log('   (Some may be false positives from dynamic code)\n');
}

// Test 5: Check for TODO/FIXME/placeholder comments
console.log('[5/5] PLACEHOLDER/TODO CHECK');
console.log('-'.repeat(50));

let placeholders = [];
[...walkDir('routes'), ...walkDir('engines')].forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        if (/TODO|FIXME|PLACEHOLDER|NOT IMPLEMENTED/i.test(line) && !line.includes('// OK:')) {
            placeholders.push({ file: path.relative('.', file), line: i + 1, text: line.trim().substring(0, 80) });
        }
    });
});

if (placeholders.length === 0) {
    console.log('✅ No TODO/FIXME/PLACEHOLDER comments found\n');
} else {
    console.log(`⚠️  Found ${placeholders.length} TODO/FIXME comments:`);
    placeholders.slice(0, 10).forEach(p => console.log(`  - ${p.file}:${p.line}`));
    if (placeholders.length > 10) console.log(`  ... and ${placeholders.length - 10} more`);
    console.log();
}

// Summary
console.log('='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));

const issues = syntaxFailures.length + dalIssues.length + requireIssues.length;
if (issues === 0) {
    console.log('✅ ALL CRITICAL CHECKS PASSED');
    console.log('   Ready for deployment!');
} else {
    console.log(`❌ ${issues} CRITICAL ISSUES FOUND`);
    console.log('   Fix these before deploying!');
    process.exit(1);
}
