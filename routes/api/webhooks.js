const express = require('express');
const router = express.Router();

// ==========================================
// STATIC ROUTES - MUST COME BEFORE /:id ROUTES
// Express matches routes in order of definition.
// Static paths like /test must be before /:id
// ==========================================

// GET /api/webhooks - Get all webhooks
router.get('/', async (req, res) => {
    try {
        const webhooks = req.dal && req.dal.getWebhooks ? await req.dal.getWebhooks() : [];
        res.json({ success: true, webhooks });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API webhooks error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch webhooks' });
    }
});

// POST /api/webhooks - Create new webhook
router.post('/', async (req, res) => {
    try {
        const { name, url } = req.body || {};
        if (!name || !url) {
            return res.status(400).json({ success: false, error: 'name and url are required' });
        }
        // Basic URL validation
        try { new URL(url); } catch (_) {
            return res.status(400).json({ success: false, error: 'invalid webhook url' });
        }

        // createWebhook now returns the created webhook object directly
        const webhook = await req.dal.createWebhook(req.body);
        
        // Log the activity
        if (req.dal && req.dal.logUserActivity) {
            try {
                await req.dal.logUserActivity(
                    req.user?.id || null,
                    'webhook_create',
                    `webhook_${webhook.id}`,
                    { name: req.body.name, url: req.body.url },
                    req.ip,
                    req.get('User-Agent')
                );
            } catch (logErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log webhook create activity:', logErr.message);
            }
        }
        
        res.status(201).json({ success: true, webhook });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API create webhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to create webhook' });
    }
});

// POST /api/webhooks/test - Test webhook with custom data (STATIC - before /:id)
router.post('/test', async (req, res) => {
    try {
        const result = await req.dal.testWebhookData(req.body);
        res.json(result);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API test webhook data error:', error);
        res.status(500).json({ error: 'Failed to test webhook data' });
    }
});

// GET /api/webhooks/deliveries/:id - Get single delivery details (STATIC prefix - before /:id)
router.get('/deliveries/:deliveryId', async (req, res) => {
    try {
        const delivery = await req.dal.get(`
            SELECT 
                d.id,
                d.webhook_id as webhookId,
                w.name as webhookName,
                w.url,
                d.response_code as statusCode,
                d.delivery_status as status,
                CASE WHEN d.delivery_status = 'success' THEN 1 ELSE 0 END as success,
                d.attempted_at as timestamp,
                d.delivered_at,
                d.retry_count as attempt,
                d.response_time_ms as responseTime,
                d.request_payload as requestPayload,
                d.request_headers as requestHeaders,
                d.response_body as responseBody,
                d.error_message as error,
                d.event_type as event
            FROM webhook_deliveries d
            LEFT JOIN webhooks w ON d.webhook_id = w.id
            WHERE d.id = $1
        `, [req.params.deliveryId]);

        if (!delivery) {
            return res.status(404).json({ success: false, error: 'Webhook delivery not found' });
        }

        res.json(delivery);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API webhook delivery details error:', error);
        res.status(500).json({ success: false, error: 'Failed to get delivery details' });
    }
});

// POST /api/webhooks/deliveries/:id/retry - Retry failed webhook delivery (STATIC prefix - before /:id)
router.post('/deliveries/:deliveryId/retry', async (req, res) => {
    try {
        const { deliveryId } = req.params;
        
        req.app.locals?.loggers?.api?.info(`Retrying webhook delivery ${deliveryId} by user ${req.user ? req.user.username : 'system'}`);
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Get the original delivery
        const delivery = await req.dal.get(
            `SELECT * FROM webhook_deliveries WHERE id = $1`,
            [deliveryId]
        );
        
        if (!delivery) {
            return res.status(404).json({ success: false, error: 'Webhook delivery not found' });
        }
        
        // Get the webhook configuration
        const webhook = await req.dal.get(
            `SELECT * FROM webhooks WHERE id = $1`,
            [delivery.webhook_id]
        );
        
        if (!webhook) {
            return res.status(404).json({ success: false, error: 'Webhook configuration not found' });
        }
        
        // Attempt to resend the webhook
        const axios = require('axios');
        let retryResult = {
            status: 'failed',
            status_code: null,
            error: null,
            response_body: null
        };
        
        try {
            const startTime = Date.now();
            const response = await axios.post(webhook.url, JSON.parse(delivery.request_payload || '{}'), {
                headers: webhook.headers ? JSON.parse(webhook.headers) : {},
                timeout: 30000
            });
            const duration = Date.now() - startTime;
            
            retryResult = {
                status: 'success',
                status_code: response.status,
                response_body: JSON.stringify(response.data),
                duration_ms: duration
            };
        } catch (axiosError) {
            retryResult.error = axiosError.message;
            retryResult.status_code = axiosError.response?.status || null;
        }
        
        // Create new delivery record for retry
        const result = await req.dal.run(
            `INSERT INTO webhook_deliveries (webhook_id, delivery_status, response_code, request_payload, response_body, error_message, retry_count, response_time_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                delivery.webhook_id,
                retryResult.status,
                retryResult.status_code,
                delivery.request_payload,
                retryResult.response_body,
                retryResult.error,
                (delivery.retry_count || 0) + 1,
                retryResult.duration_ms
            ]
        );
        
        // Log the activity
        if (req.dal.logUserActivity) {
            try {
                await req.dal.logUserActivity(
                    req.user?.id || 0,
                    'webhook_retry',
                    `webhook_delivery_${deliveryId}`,
                    { status: retryResult.status },
                    req.ip,
                    req.get('User-Agent')
                );
            } catch (logErr) {
                // Ignore activity log errors
            }
        }

        res.json({ 
            success: true, 
            retry: {
                id: result.lastID,
                originalDeliveryId: deliveryId,
                status: retryResult.status,
                statusCode: retryResult.status_code,
                attemptNumber: (delivery.retry_count || 0) + 1
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API webhook retry error:', error);
        res.status(500).json({ success: false, error: 'Failed to retry webhook delivery' });
    }
});

// ==========================================
// PARAMETERIZED ROUTES - MUST COME AFTER STATIC ROUTES
// ==========================================

// PUT /api/webhooks/:id - Update webhook
router.put('/:id', async (req, res) => {
    try {
        // Check if webhook exists first
        const existing = await req.dal.get('SELECT id FROM webhooks WHERE id = $1', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Webhook not found' });
        }
        
        const result = await req.dal.updateWebhook(req.params.id, req.body);
        
        // Log the activity
        try {
            await req.dal.logUserActivity(
                req.user?.id,
                'webhook_update',
                `webhook_${req.params.id}`,
                req.body,
                req.ip,
                req.get('User-Agent')
            );
        } catch (logErr) {
            req.app.locals?.loggers?.api?.warn('Failed to log webhook update activity:', logErr.message);
        }
        
        res.json({ success: true, changes: result.changes });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API update webhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to update webhook' });
    }
});

// DELETE /api/webhooks/:id - Delete webhook
router.delete('/:id', async (req, res) => {
    try {
        // Check if webhook exists first
        const existing = await req.dal.get('SELECT id FROM webhooks WHERE id = $1', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Webhook not found' });
        }
        
        await req.dal.deleteWebhook(req.params.id);
        
        // Log the activity
        try {
            await req.dal.logUserActivity(
                req.user?.id,
                'webhook_delete',
                `webhook_${req.params.id}`,
                null,
                req.ip,
                req.get('User-Agent')
            );
        } catch (logErr) {
            req.app.locals?.loggers?.api?.warn('Failed to log webhook delete activity:', logErr.message);
        }
        
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API delete webhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete webhook' });
    }
});

// POST /api/webhooks/:id/toggle - Toggle webhook enabled/disabled
router.post('/:id/toggle', async (req, res) => {
    try {
        const result = await req.dal.toggleWebhook(req.params.id);
        
        // Check if webhook was not found
        if (!result.success && result.error === 'Webhook not found') {
            return res.status(404).json(result);
        }
        
        // Log the activity
        try {
            await req.dal.logUserActivity(
                req.user?.id,
                'webhook_toggle',
                `webhook_${req.params.id}`,
                { enabled: result.enabled },
                req.ip,
                req.get('User-Agent')
            );
        } catch (logErr) {
            req.app.locals?.loggers?.api?.warn('Failed to log webhook toggle activity:', logErr.message);
        }
        
        res.json(result);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API toggle webhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to toggle webhook' });
    }
});

// POST /api/webhooks/:id/test - Test specific webhook by ID
router.post('/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get webhook from database
        const webhook = await req.dal.get('SELECT * FROM webhooks WHERE id = $1', [id]);
        
        if (!webhook) {
            return res.status(404).json({ 
                success: false, 
                error: 'Webhook not found' 
            });
        }
        
        // Test webhook by sending a test payload
        let result = { success: true, tested: true, webhook_id: id };
        
        if (req.dal && req.dal.testWebhook) {
            result = await req.dal.testWebhook(id);
        }
        
        // Log the activity
        if (req.dal && req.dal.logUserActivity) {
            try {
                await req.dal.logUserActivity(
                    req.user?.id || 1,
                    'webhook_test',
                    `webhook_${id}`,
                    null,
                    req.ip,
                    req.get('User-Agent')
                );
            } catch (logError) {
                req.app.locals?.loggers?.api?.warn('Failed to log webhook test activity:', logError.message);
            }
        }
        
        res.json(result);
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API test webhook error:', error);
        res.status(500).json({ success: false, error: 'Failed to test webhook: ' + error.message });
    }
});

// GET /api/webhooks/:id/deliveries - Get webhook delivery history for specific webhook
router.get('/:id/deliveries', async (req, res) => {
    try {
        const rows = await req.dal.all(`
            SELECT id, webhook_id as webhookId, response_code as statusCode,
                   delivery_status as status, attempted_at as timestamp,
                   delivered_at, retry_count as retries
            FROM webhook_deliveries
            WHERE webhook_id = $1
            ORDER BY attempted_at DESC
            LIMIT 50
        `, [req.params.id]);

        res.json({ success: true, deliveries: rows || [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API webhook deliveries error:', error);
        res.status(500).json({ success: false, error: 'Failed to get webhook deliveries' });
    }
});

module.exports = router;
