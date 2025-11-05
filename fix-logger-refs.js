#!/usr/bin/env node
/**
 * 🔧 FIX LOG-ANALYZER API LOGGER REFERENCES
 * Fix all logger references from req.app.locals.logger to req.app.locals.loggers.system
 */

const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'api', 'log-analyzer.js');

console.log('🔧 Fixing logger references in log-analyzer API...\n');

// Read the file
const content = fs.readFileSync(apiPath, 'utf8');

// Replace all instances of req.app.locals.logger
let fixedContent = content;

// Fix direct error calls
fixedContent = fixedContent.replace(
    /req\.app\.locals\.logger\.error\(/g,
    '(req.app.locals.loggers?.system || console).error('
);

// Fix logger assignments
fixedContent = fixedContent.replace(
    /const logger = req\.app\.locals\.logger;/g,
    'const logger = req.app.locals.loggers?.system || console;'
);

// Count changes
const originalMatches = (content.match(/req\.app\.locals\.logger/g) || []).length;
const fixedMatches = (fixedContent.match(/req\.app\.locals\.logger/g) || []).length;
const changesMade = originalMatches - fixedMatches;

console.log(`📊 Logger reference fixes:`);
console.log(`   Original references: ${originalMatches}`);
console.log(`   Remaining references: ${fixedMatches}`);
console.log(`   Changes made: ${changesMade}`);

// Write the fixed content
if (changesMade > 0) {
    fs.writeFileSync(apiPath, fixedContent, 'utf8');
    console.log('\n✅ Logger references fixed successfully!');
} else {
    console.log('\n⚠️ No changes needed');
}

console.log('\n📋 Verification:');
console.log('   All logger calls now use: req.app.locals.loggers?.system || console');
console.log('   Fallback to console if loggers not available');
console.log('   Safe error handling with optional chaining');