#!/usr/bin/env node
/**
 * 🔧 FIX DATABASE ACCESS IN LOG-ANALYZER API
 * Fix all database access calls to properly call the function
 */

const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'api', 'log-analyzer.js');

console.log('🔧 Fixing database access in log-analyzer API...\n');

// Read the file
let content = fs.readFileSync(apiPath, 'utf8');

// Fix database access - change from req.app.locals.db to req.app.locals.db()
content = content.replace(/const db = req\.app\.locals\.db;/g, 'const db = req.app.locals.db();');

// Count changes
const matches = (content.match(/const db = req\.app\.locals\.db\(\);/g) || []).length;

console.log(`📊 Database access fixes:`);
console.log(`   Fixed database assignments: ${matches}`);

// Write the fixed content
fs.writeFileSync(apiPath, content, 'utf8');

console.log('\n✅ Database access fixed successfully!');
console.log('   All db assignments now call: req.app.locals.db()');
console.log('   Database methods should work correctly');