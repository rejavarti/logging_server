const express = require('express');
const router = express.Router();
const cache = require('../../utils/cache');

// POST /api/admin/cache/clear - clear in-memory cache
router.post('/cache/clear', async (req, res) => {
  try {
    const cleared = cache.clearAll();
    // Optionally log admin activity if DAL available
    try {
      if (req.dal && typeof req.dal.logUserActivity === 'function') {
        await req.dal.logUserActivity(
          req.user?.id || 0,
            'admin_cache_clear',
            'cache',
            { cleared },
            req.ip,
            req.get('User-Agent')
        );
      }
    } catch (e) {
      req.app.locals?.loggers?.system?.warn('Cache clear activity log failed:', e.message);
    }
    res.json({ success: true, cleared, timestamp: new Date().toISOString() });
  } catch (err) {
    req.app.locals?.loggers?.system?.error('Cache clear error:', err);
    res.status(500).json({ success: false, error: 'Failed to clear cache' });
  }
});

// GET /api/admin/cache/stats - cache stats introspection
router.get('/cache/stats', (req, res) => {
  try {
    const data = cache.stats();
    res.json({ success: true, stats: data, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get cache stats' });
  }
});

module.exports = router;
