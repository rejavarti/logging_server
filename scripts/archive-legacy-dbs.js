#!/usr/bin/env node
/**
 * Archive legacy root-level database artifacts into data/archives/legacy-db-obsolete
 * Safe: skips if file missing or size 0 bytes (unless --force)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const targetDir = path.join(dataDir, 'archives', 'legacy-db-obsolete');
const legacyFiles = [
  'enterprise_logs.db',
  'logging.db',
  'universal_logging.db'
];

const args = process.argv.slice(2);
const force = args.includes('--force');

(async () => {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    let moved = [];
    for (const f of legacyFiles) {
      const src = path.join(dataDir, f);
      if (!fs.existsSync(src)) continue;
      const stats = fs.statSync(src);
      if (stats.size === 0 && !force) {
        // Delete empty placeholder to reduce clutter
        fs.unlinkSync(src);
        moved.push({ file: f, action: 'deleted-empty', size: 0 });
        continue;
      }
      const dest = path.join(targetDir, f);
      fs.renameSync(src, dest);
      moved.push({ file: f, action: 'archived', size: stats.size });
    }
    console.log(JSON.stringify({ success: true, moved }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
    process.exit(1);
  }
})();
