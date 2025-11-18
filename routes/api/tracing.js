// Tracing API endpoints (minimal, non-mock, safe defaults)
// If OpenTelemetry is not configured, we still return structured responses
// that the UI can consume without throwing runtime errors.
const express = require('express');
const router = express.Router();

function getTracingEngine(req) {
  return req.app?.locals?.engines?.tracing || null;
}

function readEnvBool(value, defaultVal = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  return defaultVal;
}

function safeNumber(value, defaultVal = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultVal;
}

// GET /api/tracing/status
router.get('/status', async (req, res) => {
  try {
    const engine = getTracingEngine(req);
    // Prefer engine config when available; otherwise read from env
    const enabled = engine?.config?.enabled ?? readEnvBool(process.env.TRACING_ENABLED, false);
    const endpoint = engine?.config?.jaegerEndpoint || process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
    const serviceName = engine?.config?.serviceName || process.env.TRACING_SERVICE_NAME || 'enterprise-logging-platform';
    const samplingRate = engine?.config?.samplingRate ?? safeNumber(process.env.TRACING_SAMPLING_RATE ?? 1.0, 1.0);

    // Basic health signal: configured endpoint + enabled
    const isConfigured = !!endpoint && enabled;
    const health = isConfigured ? 'healthy' : 'disabled';

    return res.json({
      success: true,
      status: {
        enabled,
        endpoint,
        service_name: serviceName,
        sampling_rate: samplingRate,
        health
      }
    });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('Tracing status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get tracing status' });
  }
});

// GET /api/tracing/dependencies
router.get('/dependencies', async (req, res) => {
  try {
    const engine = getTracingEngine(req);
    let dependencies = [];
    if (engine && typeof engine.getServiceDependencies === 'function') {
      const result = await engine.getServiceDependencies();
      if (Array.isArray(result)) dependencies = result; // ensure array to avoid forEach errors
    }
    return res.json({ success: true, dependencies });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('Tracing dependencies error:', err);
    return res.json({ success: true, dependencies: [] }); // degrade gracefully
  }
});

// GET /api/tracing/search
router.get('/search', async (req, res) => {
  try {
    const engine = getTracingEngine(req);
    if (!engine || typeof engine.searchTraces !== 'function') {
      return res.status(501).json({ success: false, error: 'Tracing search not implemented' });
    }
    const results = await engine.searchTraces(req.query || {});
    return res.json({ success: true, results: Array.isArray(results) ? results : [] });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('Tracing search error:', err);
    return res.status(500).json({ success: false, error: 'Failed to search traces' });
  }
});

// GET /api/tracing/trace/:traceId
router.get('/trace/:traceId', async (req, res) => {
  try {
    const engine = getTracingEngine(req);
    if (!engine || typeof engine.getTraceData !== 'function') {
      return res.status(404).json({ success: false, error: 'Trace not found' });
    }
    const data = await engine.getTraceData(req.params.traceId);
    if (!data) return res.status(404).json({ success: false, error: 'Trace not found' });
    return res.json({ success: true, trace: data });
  } catch (err) {
    req.app.locals?.loggers?.api?.error('Tracing trace fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch trace' });
  }
});

module.exports = router;