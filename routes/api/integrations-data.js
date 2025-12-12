const express = require('express');
const router = express.Router();

// Get all integration data in one request
router.get('/all', async (req, res) => {
    try {
        const [integrations, managerStatus, messageStats] = await Promise.all([
            req.dal.getIntegrations(),
            req.integrationManager.getStatus(),
            req.dal.get(
                `SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
                 FROM integration_messages
                 WHERE created_at > NOW() - INTERVAL '24 hours'`
            ).catch(() => ({
                total_messages: 0,
                delivered: 0,
                failed: 0,
                pending: 0
            }))
        ]);

        res.json({
            success: true,
            data: {
                integrations,
                managerStatus,
                messageStats
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error loading integration data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load integration data'
        });
    }
});

// Individual endpoints
router.get('/integrations', async (req, res) => {
    try {
        const integrations = await req.dal.getIntegrations();
        res.json({ success: true, data: integrations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/status', async (req, res) => {
    try {
        const status = req.integrationManager.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const stats = await req.dal.get(
            `SELECT 
                COUNT(*) as total_messages,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
             FROM integration_messages
             WHERE created_at > NOW() - INTERVAL '24 hours'`
        );
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
