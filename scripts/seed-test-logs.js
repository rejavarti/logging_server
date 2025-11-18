#!/usr/bin/env node
/**
 * Seed Test Logs Script
 * Inserts randomized log entries into the SQLite database for development/testing.
 *
 * Usage inside container:
 *   node /app/scripts/seed-test-logs.js --count 200 --days 1
 */

const path = require('path');
const DatabaseAccessLayer = require('../database-access-layer');

// Tiny console-backed logger
const logger = {
  info: (...args) => console.log('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
  debug: (...args) => console.debug('[debug]', ...args),
};

function parseArgs(argv) {
  const args = { count: 100, days: 0, source: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count' && argv[i+1]) args.count = parseInt(argv[++i], 10) || args.count;
    else if (a === '--days' && argv[i+1]) args.days = parseInt(argv[++i], 10) || args.days;
    else if (a === '--source' && argv[i+1]) args.source = argv[++i];
  }
  return args;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomTimestamp(withinDays = 0) {
  const now = Date.now();
  if (!withinDays || withinDays <= 0) return new Date(now).toISOString();
  const msRange = withinDays * 24 * 60 * 60 * 1000;
  const t = now - Math.floor(Math.random() * msRange);
  return new Date(t).toISOString();
}

async function main() {
  const { count, days, source } = parseArgs(process.argv);
  // Resolve DB path cross-platform (prefer local dev paths; fallback to container path)
  const candidates = [
    process.env.DATABASE_PATH,
    path.join(__dirname, '..', 'data', 'databases', 'enterprise_logs.db'),
    path.join(__dirname, '..', 'data', 'databases', 'logs.db'),
    path.join(__dirname, '..', 'data', 'logs.db'),
    path.join('/app', 'data', 'databases', 'enterprise_logs.db')
  ].filter(Boolean);
  let dbPath = candidates.find(p => { try { return require('fs').existsSync(p); } catch { return false; } }) || candidates[candidates.length - 1];
  const dal = new DatabaseAccessLayer(dbPath, logger);

  const levels = ['info', 'warning', 'error', 'debug'];
  const sources = source ? [source] : ['webapp', 'api', 'scheduler', 'ingestor', 'node-red', 'home-assistant'];
  const messages = [
    'User logged in successfully',
    'Background job completed',
    'Sensor update received',
    'Scheduled task executed',
    'Integration ping OK',
    'Cache refreshed',
    'Network latency warning',
    'Disk space approaching limit',
    'Rate limit exceeded',
    'Unhandled exception captured',
  ];

  let inserted = 0;
  for (let i = 0; i < count; i++) {
    const entry = {
      timestamp: randomTimestamp(days),
      level: randomPick(levels),
      source: randomPick(sources),
      message: randomPick(messages) + ` (#${i+1})`,
      metadata: { requestId: Math.random().toString(36).slice(2), cpu: Math.round(Math.random()*100) }
    };
    try {
      await dal.createLogEntry(entry);
      inserted++;
    } catch (err) {
      logger.error('Insert failed:', err.message);
    }
  }

  logger.info(`Inserted ${inserted}/${count} test logs into ${dbPath}`);
  process.exit(0);
}

main().catch(err => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
