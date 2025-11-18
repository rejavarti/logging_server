-- Migration: Seed Integration Health Data
-- Date: November 17, 2025
-- Purpose: Add default built-in integration health records for monitoring

-- Seed default built-in integrations (WebSocket, MQTT, Home Assistant, UniFi)
-- These represent system integrations that can be monitored for health status

INSERT OR IGNORE INTO integration_health (integration_name, status, last_check, error_count, metadata)
VALUES 
    ('websocket', 'unknown', CURRENT_TIMESTAMP, 0, '{"enabled":true,"port":3001,"description":"WebSocket server for real-time log streaming"}'),
    ('mqtt', 'unknown', CURRENT_TIMESTAMP, 0, '{"enabled":false,"broker":"","description":"MQTT broker integration for message-based logging"}'),
    ('homeassistant', 'unknown', CURRENT_TIMESTAMP, 0, '{"enabled":false,"url":"","description":"Home Assistant integration for home automation logging"}'),
    ('unifi', 'unknown', CURRENT_TIMESTAMP, 0, '{"enabled":false,"controller":"","description":"UniFi Network controller integration"}');

-- Note: Initial status is 'unknown' because integrations haven't been tested yet
-- The Health Monitor tab will show these integrations and allow testing them
-- When tested, the status will update to 'online', 'degraded', or 'offline'
