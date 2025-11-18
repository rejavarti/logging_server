/**
 * Integration Test Helper Functions
 * Provides real connection testing for various integration types
 */

const https = require('https');
const http = require('http');
const url = require('url');

async function testWebhook(config) {
    if (!config || !config.url) {
        return { success: false, message: 'Webhook URL is required', details: {} };
    }
    
    try {
        const parsedUrl = url.parse(config.url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const timeout = 5000;
        
        return await new Promise((resolve) => {
            const startTime = Date.now();
            const req = protocol.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: config.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Logging-Server-Test',
                    ...(config.headers || {})
                },
                timeout
            }, (res) => {
                const responseTime = Date.now() - startTime;
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        success: true,
                        message: `Webhook endpoint responded with status ${res.statusCode}`,
                        details: { statusCode: res.statusCode, responseTime: `${responseTime}ms` }
                    });
                } else {
                    resolve({
                        success: false,
                        message: `Webhook returned error status ${res.statusCode}`,
                        details: { statusCode: res.statusCode, responseTime: `${responseTime}ms` }
                    });
                }
            });
            
            req.on('error', (error) => {
                resolve({
                    success: false,
                    message: `Failed to connect to webhook: ${error.message}`,
                    details: { error: error.message }
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    message: 'Webhook connection timed out after 5 seconds',
                    details: { timeout: '5000ms' }
                });
            });
            
            // Send test payload
            req.write(JSON.stringify({ test: true, timestamp: new Date().toISOString() }));
            req.end();
        });
    } catch (error) {
        return {
            success: false,
            message: `Invalid webhook configuration: ${error.message}`,
            details: { error: error.message }
        };
    }
}

async function testHomeAssistant(config) {
    if (!config || !config.url || !config.token) {
        return { 
            success: false, 
            message: 'Home Assistant URL and token are required',
            details: { missing: !config?.url ? 'url' : 'token' }
        };
    }
    
    try {
        const parsedUrl = url.parse(config.url + '/api/');
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        return await new Promise((resolve) => {
            const startTime = Date.now();
            const req = protocol.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }, (res) => {
                const responseTime = Date.now() - startTime;
                
                if (res.statusCode === 200) {
                    resolve({
                        success: true,
                        message: 'Successfully connected to Home Assistant',
                        details: { statusCode: 200, responseTime: `${responseTime}ms` }
                    });
                } else if (res.statusCode === 401) {
                    resolve({
                        success: false,
                        message: 'Authentication failed - invalid token',
                        details: { statusCode: 401 }
                    });
                } else {
                    resolve({
                        success: false,
                        message: `Home Assistant returned status ${res.statusCode}`,
                        details: { statusCode: res.statusCode }
                    });
                }
            });
            
            req.on('error', (error) => {
                resolve({
                    success: false,
                    message: `Failed to connect to Home Assistant: ${error.message}`,
                    details: { error: error.message }
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    message: 'Connection to Home Assistant timed out',
                    details: { timeout: '5000ms' }
                });
            });
            
            req.end();
        });
    } catch (error) {
        return {
            success: false,
            message: `Invalid Home Assistant configuration: ${error.message}`,
            details: { error: error.message }
        };
    }
}

async function testMQTT(config) {
    if (!config || !config.broker) {
        return { 
            success: false, 
            message: 'MQTT broker address is required',
            details: { missing: 'broker' }
        };
    }
    
    // For MQTT, we'll just validate the config format
    // Actual MQTT connection testing would require the mqtt library
    return {
        success: true,
        message: 'MQTT configuration validated (broker reachability not tested)',
        details: { 
            broker: config.broker,
            note: 'Full MQTT connection test requires mqtt client library'
        }
    };
}

async function testUniFi(config) {
    if (!config || !config.controller || !config.username || !config.password) {
        return { 
            success: false, 
            message: 'UniFi controller URL, username, and password are required',
            details: { 
                missing: !config?.controller ? 'controller' : !config?.username ? 'username' : 'password'
            }
        };
    }
    
    // UniFi testing would require authentication flow
    // For now, validate URL is reachable
    return await testHTTPEndpoint('unifi', { url: config.controller });
}

async function testWebhookBased(type, config) {
    if (!config || !config.webhookUrl) {
        return { 
            success: false, 
            message: `${type} webhook URL is required`,
            details: { missing: 'webhookUrl' }
        };
    }
    
    return await testWebhook({ url: config.webhookUrl, method: 'POST' });
}

async function testHTTPEndpoint(type, config) {
    if (!config || !config.url) {
        return { 
            success: false, 
            message: `${type} endpoint URL is required`,
            details: { missing: 'url' }
        };
    }
    
    try {
        const parsedUrl = url.parse(config.url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        return await new Promise((resolve) => {
            const startTime = Date.now();
            const req = protocol.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.path || '/',
                method: 'GET',
                timeout: 5000
            }, (res) => {
                const responseTime = Date.now() - startTime;
                
                resolve({
                    success: res.statusCode < 500,
                    message: `${type} endpoint responded with status ${res.statusCode}`,
                    details: { statusCode: res.statusCode, responseTime: `${responseTime}ms` }
                });
            });
            
            req.on('error', (error) => {
                resolve({
                    success: false,
                    message: `Failed to connect to ${type}: ${error.message}`,
                    details: { error: error.message }
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    message: `Connection to ${type} timed out`,
                    details: { timeout: '5000ms' }
                });
            });
            
            req.end();
        });
    } catch (error) {
        return {
            success: false,
            message: `Invalid ${type} configuration: ${error.message}`,
            details: { error: error.message }
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
