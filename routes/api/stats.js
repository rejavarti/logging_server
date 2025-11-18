const express = require('express');
const router = express.Router();

// GET /api/stats - Aggregate system/log stats
router.get('/stats', async (req, res) => {
    try {
        if (!req.dal || !req.dal.getSystemStats) {
            return res.status(503).json({ success: false, error: 'Stats service unavailable' });
        }
        const stats = await req.dal.getSystemStats();
        // Ensure compatibility: include both totalLogs and logs keys if missing
        const normalized = {
            ...stats,
            logs: typeof stats?.logs !== 'undefined' ? stats.logs : stats?.totalLogs
        };
        res.json({ success: true, stats: normalized });
    } catch (err) {
        req.app.locals?.loggers?.api?.error('api/stats error:', err);
        res.status(500).json({ success: false, error: 'Failed to get stats' });
    }
});

module.exports = router;
