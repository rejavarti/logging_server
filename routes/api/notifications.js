const express = require('express');
const router = express.Router();

// Recent notifications (parse errors for now)
router.get('/recent', async (req, res) => {
    try {
        const dal = req.dal;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const items = await dal.getRecentParseErrors(limit);
        res.json({ success: true, notifications: items });
    } catch (error) {
        req.loggers?.system?.error('notifications/recent error:', error);
        res.status(500).json({ success: false, error: 'Failed to load notifications' });
    }
});

// Unread count
router.get('/unread-count', async (req, res) => {
    try {
        const dal = req.dal;
        const count = await dal.getUnreadParseErrorCount();
        res.json({ success: true, count });
    } catch (error) {
        req.loggers?.system?.error('notifications/unread-count error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch count' });
    }
});

// Acknowledge (mark read) a notification
router.post('/:id/ack', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
        const result = await req.dal.acknowledgeParseError(id);
        // Idempotent: returns 200 even if already acked (changes=0)
        res.json({ success: true, changes: result.changes || 0 });
    } catch (error) {
        req.loggers?.system?.error('notifications/ack error:', error);
        res.status(500).json({ success: false, error: 'Failed to acknowledge notification' });
    }
});

module.exports = router;