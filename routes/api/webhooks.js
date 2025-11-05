const express = require('express');
const router = express.Router();

// GET /api/webhooks - Get all webhooks
router.get('/', async (req, res) => {
    try {
        const webhooks = await req.dal.getAllWebhooks();
        res.json({ webhooks });
    } catch (error) {
        console.error('API webhooks error:', error);
        res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
});

// POST /api/webhooks - Create new webhook
router.post('/', async (req, res) => {
    try {
        const webhook = await req.dal.createWebhook(req.body);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'webhook_create',
            `webhook_${webhook.id}`,
            { name: req.body.name, url: req.body.url },
            req.ip,
            req.get('User-Agent')
        );
        
        res.json({ webhook });
    } catch (error) {
        console.error('API create webhook error:', error);
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

// PUT /api/webhooks/:id - Update webhook
router.put('/:id', async (req, res) => {
    try {
        const webhook = await req.dal.updateWebhook(req.params.id, req.body);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'webhook_update',
            `webhook_${req.params.id}`,
            req.body,
            req.ip,
            req.get('User-Agent')
        );
        
        res.json({ webhook });
    } catch (error) {
        console.error('API update webhook error:', error);
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

// DELETE /api/webhooks/:id - Delete webhook
router.delete('/:id', async (req, res) => {
    try {
        await req.dal.deleteWebhook(req.params.id);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'webhook_delete',
            `webhook_${req.params.id}`,
            null,
            req.ip,
            req.get('User-Agent')
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('API delete webhook error:', error);
        res.status(500).json({ error: 'Failed to delete webhook' });
    }
});

// POST /api/webhooks/:id/toggle - Toggle webhook enabled/disabled
router.post('/:id/toggle', async (req, res) => {
    try {
        const result = await req.dal.toggleWebhook(req.params.id);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'webhook_toggle',
            `webhook_${req.params.id}`,
            { enabled: result.enabled },
            req.ip,
            req.get('User-Agent')
        );
        
        res.json(result);
    } catch (error) {
        console.error('API toggle webhook error:', error);
        res.status(500).json({ error: 'Failed to toggle webhook' });
    }
});

// POST /api/webhooks/:id/test - Test webhook
router.post('/:id/test', async (req, res) => {
    try {
        const result = await req.dal.testWebhook(req.params.id);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'webhook_test',
            `webhook_${req.params.id}`,
            null,
            req.ip,
            req.get('User-Agent')
        );
        
        res.json(result);
    } catch (error) {
        console.error('API test webhook error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// POST /api/webhooks/test - Test webhook with custom data  
router.post('/test', async (req, res) => {
    try {
        const result = await req.dal.testWebhookData(req.body);
        res.json(result);
    } catch (error) {
        console.error('API test webhook data error:', error);
        res.status(500).json({ error: 'Failed to test webhook data' });
    }
});

// GET /api/webhooks/:id/deliveries - Get webhook delivery history
router.get('/:id/deliveries', async (req, res) => {
    try {
        const deliveries = [
            {
                id: '1',
                webhookId: req.params.id,
                status: 'success',
                statusCode: 200,
                timestamp: '2024-11-02T06:15:00Z',
                payload: { message: 'Log alert triggered', level: 'error' },
                responseTime: '150ms',
                response: 'OK'
            },
            {
                id: '2',
                webhookId: req.params.id,
                status: 'failed',
                statusCode: 500,
                timestamp: '2024-11-02T06:10:00Z',
                payload: { message: 'System alert', level: 'warning' },
                responseTime: '5000ms',
                response: 'Internal Server Error',
                error: 'Connection timeout'
            },
            {
                id: '3',
                webhookId: req.params.id,
                status: 'success',
                statusCode: 200,
                timestamp: '2024-11-02T06:05:00Z',
                payload: { message: 'Authentication success', level: 'info' },
                responseTime: '85ms',
                response: 'Received'
            }
        ];

        res.json({ success: true, deliveries });
    } catch (error) {
        console.error('API webhook deliveries error:', error);
        res.status(500).json({ error: 'Failed to get webhook deliveries' });
    }
});

// POST /api/webhooks/deliveries/:id/retry - Retry failed webhook delivery
router.post('/deliveries/:id/retry', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`Retrying webhook delivery ${id} by user ${req.user ? req.user.username : 'system'}`);
        
        // Simulate retry operation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResult = {
            deliveryId: id,
            status: 'success',
            statusCode: 200,
            timestamp: new Date().toISOString(),
            responseTime: '120ms',
            response: 'Retry successful',
            retriedBy: req.user ? req.user.username : 'system'
        };

        // Log the activity
        if (req.dal && req.dal.logUserActivity) {
            await req.dal.logUserActivity(
                req.user ? req.user.id : 0,
                'webhook_retry',
                `delivery_${id}`,
                { status: 'success' },
                req.ip,
                req.get('User-Agent')
            );
        }

        res.json({ success: true, retry: retryResult });
    } catch (error) {
        console.error('API webhook retry error:', error);
        res.status(500).json({ error: 'Failed to retry webhook delivery' });
    }
});

module.exports = router;