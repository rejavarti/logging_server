#!/usr/bin/env node
/**
 * Script to replace console.log/error/warn with proper logger calls in production routes
 * Only processes route files, not tests/scripts/utilities
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Files to process (production routes only)
const patterns = [
  'routes/**/*.js',
  'server.js'
];

// Files to skip (tests, scripts, utilities, vendor)
const skipPatterns = [
  '**/node_modules/**',
  '**/test/**',
  '**/tests/**',
  '**/*.test.js',
  '**/*.spec.js',
  '**/scripts/**',
  '**/utilities/**',
  '**/archive/**',
  '**/backup/**',
  '**/vendor/**'
];

let totalReplacements = 0;
let filesModified = 0;

function shouldProcess(filePath) {
  // Skip if matches any skip pattern
  for (const pattern of skipPatterns) {
    if (filePath.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''))) {
      return false;
    }
  }
  return true;
}

function replaceConsole(content, filePath) {
  let modified = false;
  let count = 0;
  
  // Determine which logger to use based on file location
  const isApiRoute = filePath.includes('routes/api');
  const isAdminRoute = filePath.includes('routes/admin');
  const isServerFile = filePath.includes('server.js');
  
  let loggerRef = 'req.app.locals?.loggers?.system';
  if (isApiRoute) {
    loggerRef = 'req.app.locals?.loggers?.api';
  } else if (isAdminRoute) {
    loggerRef = 'req.app.locals?.loggers?.admin';
  } else if (isServerFile) {
    loggerRef = 'loggers?.system';
  }
  
  // Replace console.log()
  content = content.replace(/console\.log\(/g, (match) => {
    count++;
    modified = true;
    return `${loggerRef}?.info(`;
  });
  
  // Replace console.error()
  content = content.replace(/console\.error\(/g, (match) => {
    count++;
    modified = true;
    return `${loggerRef}?.error(`;
  });
  
  // Replace console.warn()
  content = content.replace(/console\.warn\(/g, (match) => {
    count++;
    modified = true;
    return `${loggerRef}?.warn(`;
  });
  
  return { content, modified, count };
}

function processFile(filePath) {
  if (!shouldProcess(filePath)) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const result = replaceConsole(content, filePath);
  
  if (result.modified) {
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`✅ ${filePath}: ${result.count} replacements`);
    filesModified++;
    totalReplacements += result.count;
  }
}

console.log('🚀 Starting console.log replacement...\n');

// Process each pattern
for (const pattern of patterns) {
  const files = glob.sync(pattern, { 
    cwd: path.resolve(__dirname, '..'),
    absolute: true,
    ignore: skipPatterns 
  });
  
  files.forEach(processFile);
}

console.log(`\n✨ Complete! Modified ${filesModified} files with ${totalReplacements} replacements`);
