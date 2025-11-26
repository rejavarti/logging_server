#!/usr/bin/env node
/**
 * Minimal smoke test for Enhanced Logging Platform
 * - Logs in
 * - Hits several protected endpoints
 * - Validates 200/JSON and basic shape
 */
const axios = require('axios');

(async () => {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:10180';
  const username = process.env.SMOKE_USERNAME || 'admin';
  const password = process.env.SMOKE_PASSWORD || process.env.AUTH_PASSWORD;
  if (!password) throw new Error('AUTH_PASSWORD or SMOKE_PASSWORD must be set for smoke test');

  function log(step) { console.log(`SMOKE: ${step}`); }

  try {
    log(`Login at ${baseUrl}/api/auth/login as ${username}`);
    const loginRes = await axios.post(`${baseUrl}/api/auth/login`, { username, password }, { timeout: 8000 });
    if (!loginRes.data?.token) throw new Error('No token received');
    const token = loginRes.data.token;
    const headers = { Authorization: `Bearer ${token}` };

    const checks = [
      {
        name: 'Dashboard refresh',
        method: 'get',
        url: `${baseUrl}/api/dashboard/refresh`,
        expect: (data) => data && data.stats && Array.isArray(data.recentLogs)
      },
      {
        name: 'Dashboard widgets',
        method: 'get',
        url: `${baseUrl}/api/dashboard/widgets`,
        expect: (data) => data && Array.isArray(data.widgetTypes)
      },
      {
        name: 'Dashboard widget-data log_count',
        method: 'get',
        url: `${baseUrl}/api/dashboard/widget-data/log_count`,
        expect: (data) => data && typeof data.value === 'number'
      },
      {
        name: 'Analytics stats',
        method: 'get',
        url: `${baseUrl}/api/analytics/stats`,
        expect: (data) => data && data.success === true && data.stats && typeof data.sourceCount === 'number'
      },
      {
        name: 'Logs count',
        method: 'get',
        url: `${baseUrl}/api/logs/count`,
        expect: (data) => data && typeof data.count === 'number'
      },
      {
        name: 'Search suggest',
        method: 'get',
        url: `${baseUrl}/api/search/suggest?q=test`,
        expect: (data) => data && Array.isArray(data.suggestions)
      },
      {
        name: 'Webhooks UI route (legacy add)',
        method: 'get',
        url: `${baseUrl}/webhooks/add`,
        expectStatusOnly: true
      },
      {
        name: 'WebSocket clients',
        method: 'get',
        url: `${baseUrl}/api/websocket/clients`,
        expect: (data) => data && data.success !== undefined
      },
      {
        name: 'Themes list',
        method: 'get',
        url: `${baseUrl}/api/themes/list`,
        expect: (data) => data && data.success === true && Array.isArray(data.themes)
      },
      {
        name: 'Request metrics',
        method: 'get',
        url: `${baseUrl}/api/metrics/requests`,
        expect: (data) => data && data.success === true && data.requests && typeof data.requests.total === 'number'
      },
      {
        name: 'Settings fetch',
        method: 'get',
        url: `${baseUrl}/api/settings`,
        expect: (data) => data && data.success === true && data.settings && data.settings.system
      },
      {
        name: 'Backups list',
        method: 'get',
        url: `${baseUrl}/api/backups`,
        expect: (data) => data && data.success === true && Array.isArray(data.backups)
      },
      {
        name: 'Health (api)',
        method: 'get',
        url: `${baseUrl}/api/health`,
        expect: (data) => data && data.success === true && ['ready','starting'].includes(data.status)
      }
    ];

    for (const check of checks) {
      log(`Checking: ${check.name}`);
      const resp = await axios({ method: check.method, url: check.url, headers, timeout: 8000, validateStatus: () => true });
      if (check.expectStatusOnly) {
        if (resp.status >= 400) throw new Error(`${check.name} failed with status ${resp.status}`);
      } else {
        if (resp.status !== 200) throw new Error(`${check.name} failed with status ${resp.status}`);
        if (!check.expect(resp.data)) throw new Error(`${check.name} returned unexpected shape`);
      }
    }

    console.log('SMOKE: All checks passed ✅');
    process.exit(0);
  } catch (err) {
    console.error('SMOKE: Failed ❌');
    console.error(err.message);
    process.exit(1);
  }
})();
