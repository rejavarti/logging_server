#!/usr/bin/env node
/**
 * Placeholder & Incomplete Implementation Auditor
 * Scans route/template files for UI placeholder text that should have
 * real backend logic or proper empty-state handling.
 *
 * Patterns Searched:
 *  - Placeholder words: placeholder, coming soon, todo, fixme, sample data
 *  - Weak empty states: No data, Not implemented, TBD, awaiting implementation
 *  - Generic stub labels: Widget ready, chart placeholder
 *
 * Additionally enumerates fetch()/XHR endpoint strings found in same file to
 * help verify backend coverage.
 *
 * Output: JSON report to stdout.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [path.join(ROOT, 'routes'), path.join(ROOT, 'configs'), path.join(ROOT, 'public')];

// Regex patterns for placeholder detection (focused on problematic phrases).
// Generic input/textarea placeholder attributes are classified separately and not scored.
const PLACEHOLDER_PATTERNS = [
  /coming\s+soon/i,
  /todo\b/i,
  /fixme\b/i,
  /sample\s+data/i,
  /not\s+implemented/i,
  /tbd/i,
  /widget\s+ready/i,
  /chart\s+placeholder/i,
  /awaiting\s+implementation/i,
  /no\s+service\s+dependencies\s+found/i,
  /no\s+data\s+available/i
];

// Lines containing generic HTML form placeholder attributes
function isFormInputPlaceholder(line) {
  return /<(input|textarea)[^>]*\bplaceholder=/.test(line);
}

// CSS pseudo-element placeholder styling (harmless)
function isCssPlaceholderSelector(line) {
  return /::placeholder/.test(line);
}

// Vendor path exclusion patterns
const IGNORE_PATH_SUBSTRINGS = ['public/vendor/'];

// Regex to find fetch/API calls
const FETCH_PATTERNS = [
  /fetch\(\s*['"]([^'"]+)['"]/g,
  /axios\.get\(\s*['"]([^'"]+)['"]/g,
  /axios\.post\(\s*['"]([^'"]+)['"]/g,
  /XMLHttpRequest\s*\(.*?open\(\s*['"](GET|POST|PUT|DELETE)['"],\s*['"]([^'"]+)['"]/g
];

function walk(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(js|ejs|html|htm|css)$/i.test(e.name)) acc.push(full);
  }
  return acc;
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const findings = [];
  let codePlaceholderCount = 0;
  let formPlaceholderCount = 0;
  let cssPlaceholderCount = 0;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Skip if vendor noise
    // (Handled earlier by path exclusion) but keep logic for safety
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(trimmed)) {
        let category = 'code';
        if (isFormInputPlaceholder(trimmed)) category = 'form-attribute';
        else if (isCssPlaceholderSelector(trimmed)) category = 'css-style';
        findings.push({
          line: idx + 1,
          pattern: pattern.source,
          text: trimmed.slice(0, 240),
          category
        });
        if (category === 'code') codePlaceholderCount++; else if (category === 'form-attribute') formPlaceholderCount++; else if (category === 'css-style') cssPlaceholderCount++;
        break;
      }
    }
  });

  // Collect endpoints referenced in file
  const endpoints = new Set();
  for (const fp of FETCH_PATTERNS) {
    let match;
    while ((match = fp.exec(content)) !== null) {
      // Different capture groups depending on pattern shape
      const url = match[1] && match[2] ? match[2] : match[1];
      if (url && url.startsWith('/')) endpoints.add(url);
    }
  }

  if (findings.length === 0) return null;
  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    placeholderCount: findings.length,
    codePlaceholderCount,
    formPlaceholderCount,
    cssPlaceholderCount,
    placeholders: findings,
    referencedEndpoints: Array.from(endpoints).sort()
  };
}

function main() {
  let allFiles = TARGET_DIRS.flatMap(d => (fs.existsSync(d) ? walk(d) : []));
  // Exclude vendor libs
  allFiles = allFiles.filter(f => !IGNORE_PATH_SUBSTRINGS.some(sub => f.includes(sub)));
  const report = [];
  for (const f of allFiles) {
    try {
      const result = scanFile(f);
      if (result) report.push(result);
    } catch (err) {
      report.push({ file: f, error: err.message });
    }
  }

  const summary = {
    scannedFiles: allFiles.length,
    filesWithPlaceholders: report.length,
    totalPlaceholders: report.reduce((a, r) => a + (r.placeholderCount || 0), 0),
    totalCodePlaceholders: report.reduce((a,r)=>a + (r.codePlaceholderCount||0),0),
    totalFormAttributePlaceholders: report.reduce((a,r)=>a + (r.formPlaceholderCount||0),0),
    totalCssPlaceholderSelectors: report.reduce((a,r)=>a + (r.cssPlaceholderCount||0),0)
  };

  const output = { summary, details: report };
  process.stdout.write(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main();
}
