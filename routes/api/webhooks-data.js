const express = require('express');
const router = express.Router();

// Get all webhook statistics in one request
router.get('/all', async (req, res) => {
    try {
        const [webhooks, recentDeliveries, stats] = await Promise.all([
            req.dal.getWebhooks(),
            req.dal.all(
                `SELECT wd.*, w.name as webhook_name, w.url 
                 FROM webhook_deliveries wd 
                 JOIN webhooks w ON wd.webhook_id = w.id 
                 ORDER BY wd.created_at DESC 
                 LIMIT 50`
            ).catch(() => []),
            // Calculate stats
            (async () => {
                const webhooksList = await req.dal.getWebhooks();
                const totalWebhooks = webhooksList.length;
                const activeWebhooks = webhooksList.filter(w => w.is_active).length;
                
                const allDeliveries = await req.dal.all(
                    `SELECT status, COUNT(*) as count 
                     FROM webhook_deliveries 
                     WHERE created_at > NOW() - INTERVAL '24 hours'
                     GROUP BY status`
                ).catch(() => []);
                
                const deliveries24h = allDeliveries.reduce((sum, row) => sum + row.count, 0);
                const successfulDeliveries = allDeliveries.find(row => row.status === 'success')?.count || 0;
                const failedDeliveries = allDeliveries.find(row => row.status === 'failed')?.count || 0;
                
                return {
                    totalWebhooks,
                    activeWebhooks,
                    deliveries24h,
                    successfulDeliveries,
                    failedDeliveries,
                    successRate: deliveries24h > 0 ? ((successfulDeliveries / deliveries24h) * 100).toFixed(1) : 0
                };
            })()
        ]);

        res.json({
            success: true,
            data: {
                webhooks,
                recentDeliveries,
                stats
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error loading webhook data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load webhook data'
        });
    }
});

// Individual endpoints for partial updates
router.get('/webhooks', async (req, res) => {
    try {
        const webhooks = await req.dal.getWebhooks();
        res.json({ success: true, data: webhooks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/deliveries', async (req, res) => {
    try {
        const deliveries = await req.dal.all(
            `SELECT wd.*, w.name as webhook_name, w.url 
             FROM webhook_deliveries wd 
             JOIN webhooks w ON wd.webhook_id = w.id 
             ORDER BY wd.created_at DESC 
             LIMIT 50`
        );
        res.json({ success: true, data: deliveries });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const webhooks = await req.dal.getWebhooks();
        const totalWebhooks = webhooks.length;
        const activeWebhooks = webhooks.filter(w => w.is_active).length;
        
        const deliveryStats = await req.dal.all(
            `SELECT status, COUNT(*) as count 
             FROM webhook_deliveries 
             WHERE created_at > datetime('now', '-24 hours')
             GROUP BY status`
        );
        
        const deliveries24h = deliveryStats.reduce((sum, row) => sum + row.count, 0);
        const successfulDeliveries = deliveryStats.find(row => row.status === 'success')?.count || 0;
        const failedDeliveries = deliveryStats.find(row => row.status === 'failed')?.count || 0;
        
        res.json({
            success: true,
            data: {
                totalWebhooks,
                activeWebhooks,
                deliveries24h,
                successfulDeliveries,
                failedDeliveries,
                successRate: deliveries24h > 0 ? ((successfulDeliveries / deliveries24h) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
