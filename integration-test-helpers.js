/**
 * Integration Test Helpers
 * 
 * Provides connectivity testing functions for various integration types.
 * Used by the integrations routes to test configurations before saving.
 */

/**
 * Test a webhook URL
 * @param {Object} config - Webhook configuration
 * @returns {Object} Test result
 */
async function testWebhook(config) {
    const url = config.url || config.webhook_url;
    if (!url) {
        return { success: false, message: 'No webhook URL configured', details: {} };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        // Try HEAD first
        let response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal
        }).catch(() => null);
        clearTimeout(timeout);

        if (!response || !response.ok) {
            // Try POST with test payload
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test: true,
                    source: 'logging-server',
                    timestamp: new Date().toISOString(),
                    message: 'Webhook connectivity test'
                }),
                signal: AbortSignal.timeout(5000)
            }).catch(() => null);
        }

        if (response && (response.ok || response.status < 500)) {
            return { 
                success: true, 
                message: 'Webhook URL is reachable', 
                details: { status: response.status } 
            };
        }

        return { 
            success: false, 
            message: `Webhook returned status ${response?.status || 'unknown'}`, 
            details: { status: response?.status } 
        };
    } catch (error) {
        return { 
            success: false, 
            message: `Connection failed: ${error.message}`, 
            details: {} 
        };
    }
}

/**
 * Test Home Assistant connection
 * @param {Object} config - Home Assistant configuration
 * @returns {Object} Test result
 */
async function testHomeAssistant(config) {
    const url = config.url || config.ha_url;
    const token = config.token || config.access_token;

    if (!url) {
        return { success: false, message: 'No Home Assistant URL configured', details: {} };
    }

    try {
        const apiUrl = url.replace(/\/$/, '') + '/api/';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            return { 
                success: true, 
                message: 'Connected to Home Assistant', 
                details: { version: data.version || 'unknown' } 
            };
        }

        return { 
            success: false, 
            message: `Home Assistant returned ${response.status}`, 
            details: { status: response.status } 
        };
    } catch (error) {
        return { 
            success: false, 
            message: `Connection failed: ${error.message}`, 
            details: {} 
        };
    }
}

/**
 * Test MQTT broker connection
 * @param {Object} config - MQTT configuration
 * @returns {Object} Test result
 */
async function testMQTT(config) {
    const host = config.host || config.broker || config.url;
    const port = config.port || 1883;

    if (!host) {
        return { success: false, message: 'No MQTT broker configured', details: {} };
    }

    // Note: Actual MQTT connection testing requires the mqtt library
    // This validates configuration and returns a success if config looks valid
    return { 
        success: true, 
        message: 'MQTT configuration valid (broker connectivity requires runtime test)',
        details: { host, port }
    };
}

/**
 * Test UniFi controller connection
 * @param {Object} config - UniFi configuration
 * @returns {Object} Test result
 */
async function testUniFi(config) {
    const url = config.url || config.controller_url;
    const username = config.username;
    const password = config.password;

    if (!url) {
        return { success: false, message: 'No UniFi controller URL configured', details: {} };
    }

    try {
        // Try to reach the controller
        const response = await fetch(url.replace(/\/$/, '') + '/api', {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        }).catch(() => null);

        if (response) {
            return { 
                success: true, 
                message: 'UniFi controller is reachable',
                details: { 
                    status: response.status,
                    hasCredentials: !!(username && password)
                }
            };
        }

        return { 
            success: false, 
            message: 'UniFi controller unreachable', 
            details: {} 
        };
    } catch (error) {
        return { 
            success: false, 
            message: `Connection failed: ${error.message}`, 
            details: {} 
        };
    }
}

/**
 * Test webhook-based notification services (Slack, Discord, Teams, etc.)
 * @param {string} type - Service type
 * @param {Object} config - Service configuration
 * @returns {Object} Test result
 */
async function testWebhookBased(type, config) {
    const url = config.url || config.webhook_url || config.webhook;

    if (!url) {
        return { success: false, message: `No ${type} webhook URL configured`, details: {} };
    }

    try {
        // Different payload formats for different services
        let payload;
        switch (type.toLowerCase()) {
            case 'slack':
                payload = { text: 'Test message from Logging Server' };
                break;
            case 'discord':
                payload = { content: 'Test message from Logging Server' };
                break;
            case 'teams':
                payload = { text: 'Test message from Logging Server' };
                break;
            case 'telegram':
                // Telegram requires chat_id
                if (!config.chat_id) {
                    return { success: false, message: 'Telegram requires chat_id', details: {} };
                }
                payload = { chat_id: config.chat_id, text: 'Test message from Logging Server' };
                break;
            case 'pushover':
                payload = { message: 'Test message from Logging Server' };
                break;
            default:
                payload = { text: 'Test message from Logging Server' };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
        }).catch(() => null);

        if (response && (response.ok || response.status < 500)) {
            return { 
                success: true, 
                message: `${type} webhook is reachable`, 
                details: { status: response.status } 
            };
        }

        return { 
            success: false, 
            message: `${type} webhook test failed`, 
            details: { status: response?.status } 
        };
    } catch (error) {
        return { 
            success: false, 
            message: `Connection failed: ${error.message}`, 
            details: {} 
        };
    }
}

/**
 * Test HTTP endpoint for database/metrics integrations
 * @param {string} type - Integration type (elasticsearch, influxdb, etc.)
 * @param {Object} config - Integration configuration
 * @returns {Object} Test result
 */
async function testHTTPEndpoint(type, config) {
    const url = config.url || config.host || config.endpoint;

    if (!url) {
        return { success: false, message: `No ${type} URL configured`, details: {} };
    }

    try {
        const testUrl = url.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json' };

        // Add auth if provided
        if (config.username && config.password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
        } else if (config.token || config.api_key) {
            headers['Authorization'] = `Bearer ${config.token || config.api_key}`;
        }

        const response = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000)
        }).catch(() => null);

        if (response && (response.ok || response.status < 500)) {
            return { 
                success: true, 
                message: `${type} endpoint is reachable`, 
                details: { status: response.status } 
            };
        }

        return { 
            success: false, 
            message: `${type} endpoint unreachable`, 
            details: { status: response?.status } 
        };
    } catch (error) {
        return { 
            success: false, 
            message: `Connection failed: ${error.message}`, 
            details: {} 
        };
    }
}

module.exports = {
    testWebhook,
    testHomeAssistant,
    testMQTT,
    testUniFi,
    testWebhookBased,
    testHTTPEndpoint
};
