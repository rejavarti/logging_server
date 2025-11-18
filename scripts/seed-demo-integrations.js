#!/usr/bin/env node
/**
 * Seed Demo Integrations and Health
 * Populates the integrations and integration_health tables with realistic demo data.
 *
 * Usage:
 *   node scripts/seed-demo-integrations.js
 *   node scripts/seed-demo-integrations.js --healthy 2 --degraded 1 --offline 1
 */

const fs = require('fs');
const path = require('path');
const DatabaseAccessLayer = require('../database-access-layer');

// Minimal logger
const logger = {
  info: (...a) => console.log('[info]', ...a),
  warn: (...a) => console.warn('[warn]', ...a),
  error: (...a) => console.error('[error]', ...a),
};

function parseArgs(argv) {
  const args = { healthy: 2, degraded: 1, offline: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--healthy' && argv[i+1]) args.healthy = parseInt(argv[++i], 10) || args.healthy;
    else if (a === '--degraded' && argv[i+1]) args.degraded = parseInt(argv[++i], 10) || args.degraded;
    else if (a === '--offline' && argv[i+1]) args.offline = parseInt(argv[++i], 10) || args.offline;
  }
  return args;
}

function resolveDbPath() {
  const candidates = [
    path.join(__dirname, '..', 'data', 'databases', 'enterprise_logs.db'),
    path.join(__dirname, '..', 'data', 'databases', 'logs.db'),
    path.join(__dirname, '..', 'data', 'logs.db'),
    path.join('/app', 'data', 'databases', 'enterprise_logs.db')
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Fallback to /app path (inside container)
  return path.join('/app', 'data', 'databases', 'enterprise_logs.db');
}

async function ensureTables(dal) {
  // Create integrations table if missing (matches migration schema subset)
  await dal.run(`CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'disabled',
    config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create integration_health table if missing
  await dal.run(`CREATE TABLE IF NOT EXISTS integration_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_name TEXT NOT NULL,
    status TEXT DEFAULT 'unknown',
    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
    response_time INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    uptime_percentage REAL DEFAULT 100.0,
    last_success DATETIME,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function buildDemoIntegrations({ healthy, degraded, offline }) {
  const base = [
    { name: 'websocket', type: 'system', enabled: 1, config: { port: 3001 } },
    { name: 'mqtt', type: 'messaging', enabled: 0, config: { broker: 'mqtt://localhost' } },
    { name: 'homeassistant', type: 'home-automation', enabled: 0, config: { url: 'http://homeassistant.local:8123' } },
    { name: 'unifi', type: 'network', enabled: 0, config: { controller: 'https://unifi.local:8443' } },
    { name: 'influxdb', type: 'database', enabled: 1, config: { url: 'http://influxdb:8086' } },
    { name: 'prometheus', type: 'monitoring', enabled: 1, config: { url: 'http://prometheus:9090' } },
  ];

  // Assign health states cyclically over existing + synthetic names
  const pool = [];
  for (let i = 0; i < healthy; i++) pool.push({ status: 'healthy' });
  for (let i = 0; i < degraded; i++) pool.push({ status: 'degraded' });
  for (let i = 0; i < offline; i++) pool.push({ status: 'offline' });

  // If none specified, default a minimal set
  if (pool.length === 0) pool.push({ status: 'unknown' });

  return base.map((b, idx) => ({ ...b, desiredStatus: pool[idx % pool.length].status }));
}

async function upsertIntegration(dal, { name, type, enabled, config }) {
  // Try update existing
  const existing = await dal.get(`SELECT id FROM integrations WHERE name = ?`, [name]).catch(() => null);
  if (existing && existing.id) {
    await dal.run(
      `UPDATE integrations SET type = ?, config = ?, enabled = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [type, JSON.stringify(config || {}), enabled ? 1 : 0, enabled ? 'enabled' : 'disabled', existing.id]
    );
    return existing.id;
  }
  const res = await dal.run(
    `INSERT INTO integrations (name, type, config, enabled, status, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [name, type, JSON.stringify(config || {}), enabled ? 1 : 0, enabled ? 'enabled' : 'disabled']
  );
  return res.lastID;
}

async function upsertIntegrationHealth(dal, name, status, metadata = {}) {
  const row = await dal.get(`SELECT id FROM integration_health WHERE integration_name = ?`, [name]).catch(() => null);
  if (row && row.id) {
    await dal.run(
      `UPDATE integration_health SET status = ?, last_check = CURRENT_TIMESTAMP, error_count = CASE WHEN ? IN ('offline','degraded') THEN error_count+1 ELSE error_count END, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, status, JSON.stringify(metadata || {}), row.id]
    );
    return row.id;
  }
  const res = await dal.run(
    `INSERT INTO integration_health (integration_name, status, last_check, error_count, metadata) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
    [name, status, (status === 'offline' || status === 'degraded') ? 1 : 0, JSON.stringify(metadata || {})]
  );
  return res.lastID;
}

async function main() {
  const args = parseArgs(process.argv);
  const dbPath = resolveDbPath();
  const dal = new DatabaseAccessLayer(dbPath, logger);

  logger.info('Using database:', dbPath);
  await ensureTables(dal);

  const demos = buildDemoIntegrations(args);

  let count = 0;
  for (const d of demos) {
    await upsertIntegration(dal, d);
    await upsertIntegrationHealth(dal, d.name, d.desiredStatus, { demo: true, type: d.type });
    count++;
  }

  logger.info(`Seeded/updated ${count} demo integrations and health records.`);
  process.exit(0);
}

main().catch(err => {
  logger.error('Seeding failed:', err);
  process.exit(1);
});
