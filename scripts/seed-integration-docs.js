#!/usr/bin/env node
/**
 * Seed Integration Documentation entries
 * Populates/updates the integration_docs table with helpful quick-start docs.
 *
 * Usage:
 *   node scripts/seed-integration-docs.js
 */

const fs = require('fs');
const path = require('path');
const DatabaseAccessLayer = require('../database-access-layer');

const logger = {
  info: (...a) => console.log('[info]', ...a),
  warn: (...a) => console.warn('[warn]', ...a),
  error: (...a) => console.error('[error]', ...a),
};

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
  return path.join('/app', 'data', 'databases', 'enterprise_logs.db');
}

async function ensureTable(dal) {
  await dal.run(`CREATE TABLE IF NOT EXISTS integration_docs (
    type TEXT PRIMARY KEY,
    doc TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

function docs() {
  // Minimal concise docs; can be extended later
  return {
    websocket: `WebSocket Ingestion\n\n- Endpoint: ws://<host>:3001\n- Send JSON lines or text frames; each frame becomes a log entry.\n- Auth optional (configure in settings).`,
    mqtt: `MQTT Integration\n\n- Configure broker URL (e.g., mqtt://localhost).\n- Subscribe topics and map payload fields to log fields.\n- Example payload: { level: 'info', message: 'hello', source: 'mqtt' }`,
    homeassistant: `Home Assistant\n\n- Use HA automations to publish events to MQTT or Webhook.\n- Common topics: homeassistant/# with retained state and event updates.\n- Map sensor events to logs with templates.`,
    unifi: `UniFi Controller\n\n- Enable syslog export from UniFi to this server's syslog port.\n- Alternatively, poll controller API and transform events to logs.\n- Parse fields: site, ap, client_mac, category.`,
    influxdb: `InfluxDB (metrics)\n\n- Write metrics to Influx and optionally mirror alerts/events here.\n- Use a task to POST anomalies to /api/ingest/webhook.\n- Include measurement, tags, fields in metadata.`,
    prometheus: `Prometheus Alerts\n\n- Configure Alertmanager receiver to POST to /api/ingest/webhook.\n- Template payload to include labels and annotations.\n- Each alert becomes a structured log entry.`,
  };
}

async function main() {
  const dbPath = resolveDbPath();
  const dal = new DatabaseAccessLayer(dbPath, logger);
  logger.info('Using database:', dbPath);
  await ensureTable(dal);

  const entries = docs();
  let upserts = 0;
  for (const [type, doc] of Object.entries(entries)) {
    try {
      await dal.upsertIntegrationDoc(type, doc);
      upserts++;
    } catch (e) {
      logger.warn('Failed to upsert doc for', type, e.message);
    }
  }
  logger.info(`Seeded/updated ${upserts} integration_docs entries.`);
  process.exit(0);
}

main().catch(err => {
  logger.error('Seeding docs failed:', err);
  process.exit(1);
});
