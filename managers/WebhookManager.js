const axios = require('axios');
const crypto = require('crypto');

class WebhookManager {
    constructor(dal, loggers) {
        this.dal = dal;
        this.loggers = loggers;
    }

    async triggerWebhooks(eventType, data) {
        try {
            // Get all active webhooks for this event type
            const webhooks = await this.dal.all(
                'SELECT * FROM webhooks WHERE enabled = 1 AND (events = ? OR events LIKE ? OR events LIKE ? OR events LIKE ?)',
                [eventType, `%${eventType}%`, `${eventType},%`, `%,${eventType}`]
            );

            if (!webhooks || webhooks.length === 0) {
                return;
            }

            this.loggers.system.info(`Triggering ${webhooks.length} webhooks for event: ${eventType}`);

            // Process webhooks in parallel
            const promises = webhooks.map(webhook => this.triggerSingleWebhook(webhook, eventType, data));
            await Promise.allSettled(promises);

        } catch (error) {
            this.loggers.system.error('Error triggering webhooks:', error);
        }
    }

    async triggerSingleWebhook(webhook, eventType, data) {
        const startTime = Date.now();
        
        try {
            const payload = {
                event: eventType,
                timestamp: new Date().toISOString(),
                data: data,
                webhook: {
                    id: webhook.id,
                    name: webhook.name
                }
            };

            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Enterprise-Logging-Platform/1.0'
            };

            // Add custom headers if specified
            if (webhook.headers) {
                const customHeaders = JSON.parse(webhook.headers);
                Object.assign(headers, customHeaders);
            }

            // Add authentication
            const authData = webhook.auth_data ? JSON.parse(webhook.auth_data) : {};
            if (webhook.auth_type === 'bearer' && authData.token) {
                headers['Authorization'] = `Bearer ${authData.token}`;
            } else if (webhook.auth_type === 'basic' && authData.username && authData.password) {
                const credentials = Buffer.from(`${authData.username}:${authData.password}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
            } else if (webhook.auth_type === 'header' && authData.header_name && authData.header_value) {
                headers[authData.header_name] = authData.header_value;
            }

            // Add signature if secret is provided
            if (webhook.secret) {
                const signature = crypto
                    .createHmac('sha256', webhook.secret)
                    .update(JSON.stringify(payload))
                    .digest('hex');
                headers['X-Webhook-Signature'] = `sha256=${signature}`;
            }

            const response = await axios({
                method: 'POST',
                url: webhook.url,
                headers: headers,
                data: JSON.stringify(payload),
                timeout: 30000, // 30 second timeout
                validateStatus: () => true // Accept all status codes
            });

            const responseTime = Date.now() - startTime;
            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

            if (response.status >= 200 && response.status < 300) {
                // Update success metrics
                await this.dal.run(
                    'UPDATE webhooks SET success_count = success_count + 1, last_triggered = CURRENT_TIMESTAMP WHERE id = ?',
                    [webhook.id]
                );

                // Log delivery success
                await this.dal.createWebhookDelivery({
                    webhook_id: webhook.id,
                    payload: JSON.stringify(payload),
                    response_code: response.status,
                    response_body: responseText.substring(0, 1000), // Limit response body storage
                    delivery_status: 'success'
                });

                this.loggers.system.info(`Webhook triggered successfully: ${webhook.name} (${responseTime}ms)`);
            } else {
                throw new Error(`HTTP ${response.status}: ${responseText}`);
            }

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Update failure metrics
            await this.dal.run(
                'UPDATE webhooks SET failure_count = failure_count + 1, last_triggered = CURRENT_TIMESTAMP WHERE id = ?',
                [webhook.id]
            );

            // Log delivery failure
            await this.dal.createWebhookDelivery({
                webhook_id: webhook.id,
                payload: JSON.stringify({ event: eventType, data }),
                response_code: 0,
                response_body: '',
                delivery_status: 'failed',
                error_message: error.message
            });

            this.loggers.system.error(`Webhook failed: ${webhook.name} (${responseTime}ms) - ${error.message}`);
        }
    }

    async getWebhookStats() {
        const stats = await this.dal.get(`
            SELECT 
                COUNT(*) as total_webhooks,
                SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active_webhooks,
                SUM(success_count) as total_successes,
                SUM(failure_count) as total_failures
            FROM webhooks
        `);

        const recentDeliveries = await this.dal.all(`
            SELECT COUNT(*) as count, delivery_status 
            FROM webhook_deliveries 
            WHERE attempted_at > datetime('now', '-24 hours')
            GROUP BY delivery_status
        `);

        return {
            ...stats,
            recent_deliveries: recentDeliveries.reduce((acc, row) => {
                acc[row.delivery_status] = row.count;
                return acc;
            }, {})
        };
    }
}

module.exports = WebhookManager;