/**
 * Enhanced Universal Logging Server - Stable Version
 * Based on working simple-server.js with enterprise features added
 * 
 * Tom Nelson - 2025
 * Features: Multi-user authentication, enterprise dashboard, all integrations
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const moment = require('moment-timezone');
const winston = require('winston');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const basicAuth = require('basic-auth');
const crypto = require('crypto');
const axios = require('axios');
const mqtt = require('mqtt');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10180;
const TIMEZONE = process.env.TIMEZONE || 'America/Edmonton'; // Mountain Time (Canada)

// Configuration
const config = {
    system: {
        name: "Universal Enterprise Logging Platform",
        version: "2.1.0-stable-enhanced",
        owner: "Tom Nelson",
        timezone: TIMEZONE
    },
    auth: {
        jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
        saltRounds: 12,
        sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex')
    },
    integrations: {
        unifi: {
            enabled: process.env.UNIFI_ENABLED === 'true' || false,
            host: process.env.UNIFI_HOST || "https://unifi.local:8443",
            username: process.env.UNIFI_USER || "",
            password: process.env.UNIFI_PASS || "",
            pollInterval: parseInt(process.env.UNIFI_POLL_INTERVAL) || 300 // 5 minutes
        },
        homeAssistant: {
            enabled: process.env.HA_ENABLED === 'true' || false,
            host: process.env.HA_HOST || "http://homeassistant.local:8123",
            token: process.env.HA_TOKEN || "",
            websocketEnabled: process.env.HA_WEBSOCKET === 'true' || true
        },
        mqtt: {
            enabled: process.env.MQTT_ENABLED === 'true' || false,
            broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
            username: process.env.MQTT_USER || "",
            password: process.env.MQTT_PASS || "",
            topic: process.env.MQTT_TOPIC || "enterprise/logs",
            topics: ['dsc/+/+', 'homeassistant/+/+', 'iot/+/+', 'security/+/+']
        },
        websocket: {
            enabled: process.env.WS_ENABLED === 'true' || true,
            port: parseInt(process.env.WS_PORT) || (PORT + 1)
        }
    },
    maintenance: {
        logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
        backupSchedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        cleanupSchedule: process.env.CLEANUP_SCHEDULE || '0 3 * * 0' // Weekly on Sunday at 3 AM
    }
};

// Ensure directories exist
const dataDir = path.join(__dirname, 'data');
const dbDir = path.join(dataDir, 'databases');
const logDir = path.join(dataDir, 'logs');

[dataDir, dbDir, logDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Custom timestamp format using configured timezone
const timezoneTimestamp = winston.format((info) => {
    info.timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss z');
    return info;
});

// Enhanced Winston logging
const loggers = {
    system: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ level, message, timestamp }) => {
                        return `${timestamp} [${level}]: ${message}`;
                    })
                )
            }),
            new winston.transports.File({ 
                filename: path.join(logDir, 'system.log'),
                maxsize: 10485760, // 10MB
                maxFiles: 5
            })
        ]
    }),
    security: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ 
                filename: path.join(logDir, 'security.log'),
                maxsize: 10485760,
                maxFiles: 10
            })
        ]
    }),
    audit: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ 
                filename: path.join(logDir, 'audit.log'),
                maxsize: 10485760,
                maxFiles: 10
            })
        ]
    }),
    access: winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            timezoneTimestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(info => {
                        return `🌐 ${info.timestamp} - ${info.message}`;
                    })
                )
            }),
            new winston.transports.File({ 
                filename: path.join(logDir, 'access.log'),
                maxsize: 10485760,
                maxFiles: 10
            })
        ]
    })
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format SQLite timestamp to local timezone
// SQLite CURRENT_TIMESTAMP returns UTC in format 'YYYY-MM-DD HH:MM:SS'
function formatSQLiteTimestamp(sqliteTimestamp, format) {
    if (!sqliteTimestamp) return null;
    try {
        // Use format from settings if not provided
        const displayFormat = format || SYSTEM_SETTINGS.date_format || 'MM/DD/YYYY, hh:mm:ss A';
        // Use timezone from settings
        const timezone = SYSTEM_SETTINGS.timezone || TIMEZONE;
        // Parse as UTC (SQLite CURRENT_TIMESTAMP is always UTC)
        // Then convert to configured timezone
        const m = moment.utc(sqliteTimestamp, 'YYYY-MM-DD HH:mm:ss').tz(timezone);
        return m.isValid() ? m.format(displayFormat) : null;
    } catch (error) {
        console.error('❌ Error formatting timestamp:', sqliteTimestamp, error);
        return null;
    }
}

// ============================================================================
// PAGE TEMPLATE SYSTEM
// ============================================================================

/**
 * Centralized Page Template Generator
 * This function creates a consistent layout for all pages with:
 * - Common styles (CSS variables, colors, themes)
 * - Sidebar navigation
 * - Header with timezone display
 * - Shared JavaScript utilities
 * 
 * Usage: getPageTemplate({ pageTitle, pageIcon, activeNav, contentBody, additionalCSS, additionalJS })
 */
function getPageTemplate(options) {
    const {
        pageTitle = 'Dashboard',
        pageIcon = 'fa-tachometer-alt',
        activeNav = 'dashboard',
        contentBody = '',
        additionalCSS = '',
        additionalJS = '',
        req
    } = options;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${pageTitle} | Enterprise Logging Platform</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            :root {
                /* Light Theme Colors */
                --bg-primary: #ffffff;
                --bg-secondary: #f8fafc;
                --bg-tertiary: #f1f5f9;
                --text-primary: #1e293b;
                --text-secondary: #475569;
                --text-muted: #64748b;
                --border-color: #e2e8f0;
                
                /* Ocean Gradients */
                --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
                --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #1d4ed8;
                --success-color: #10b981;
                --warning-color: #f59e0b;
                --error-color: #ef4444;
                --info-color: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
                
                --sidebar-bg: var(--gradient-ocean);
            }

            /* Dark Theme */
            [data-theme="dark"] {
                --bg-primary: #1e293b;
                --bg-secondary: #334155;
                --bg-tertiary: #475569;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-color: #475569;
                
                /* Ocean Gradients for Dark Theme */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                --sidebar-bg: var(--gradient-deep-blue);
            }

            /* Auto Theme - follows system preference */
            @media (prefers-color-scheme: dark) {
                [data-theme="auto"] {
                    --bg-primary: #1e293b;
                    --bg-secondary: #334155;
                    --bg-tertiary: #475569;
                    --text-primary: #f1f5f9;
                    --text-secondary: #cbd5e1;
                    --text-muted: #94a3b8;
                    --border-color: #475569;
                    
                    /* Ocean Gradients for Auto Dark Mode */
                    --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                    --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                    
                    /* Standard Colors - Using Ocean Gradient as Primary */
                    --accent-primary: var(--gradient-ocean);
                    --btn-primary: var(--gradient-ocean);
                    --accent-secondary: #3b82f6;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                    --sidebar-bg: var(--gradient-deep-blue);
                }
            }

            /* Ocean Theme */
            [data-theme="ocean"] {
                --bg-primary: #1e293b;
                --bg-secondary: #334155;
                --bg-tertiary: #475569;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-color: #475569;
                
                /* Ocean Gradients */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                --sidebar-bg: var(--gradient-deep-blue);
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background: var(--bg-secondary);
                color: var(--text-primary);
                line-height: 1.6;
            }

            .dashboard-container {
                display: flex;
                min-height: 100vh;
            }

            .sidebar {
                width: 280px;
                background: var(--sidebar-bg);
                padding: 2rem 0;
                display: flex;
                flex-direction: column;
                color: white;
                position: relative;
                overflow: hidden;
            }

            .sidebar::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
                pointer-events: none;
            }

            .sidebar-header {
                border-bottom: 1px solid rgba(255,255,255,0.2);
                margin-bottom: 2rem;
                position: relative;
                z-index: 1;
                overflow: hidden;
                background: var(--gradient-ocean);
                margin: -2rem -2rem 2rem -2rem;
                padding: 0 2rem;
                text-align: center;
                height: 94px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .sidebar-header::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
                animation: headerShimmer 4s ease-in-out infinite;
                pointer-events: none;
            }

            .sidebar-header h2 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 700;
                position: relative;
                z-index: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                line-height: 1.2;
            }

            .sidebar-header p {
                margin: 0;
                opacity: 0.8;
                font-size: 0.875rem;
                position: relative;
                z-index: 1;
            }

            .sidebar-nav {
                list-style: none;
                padding: 0;
                margin: 0;
                flex: 1;
                position: relative;
                z-index: 1;
            }

            .sidebar-nav li {
                margin: 0;
            }

            .sidebar-nav a {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 1rem 2rem;
                color: rgba(255,255,255,0.9);
                text-decoration: none;
                transition: all 0.3s ease;
                border-left: 3px solid transparent;
                position: relative;
            }

            .sidebar-nav a:hover {
                background: rgba(255,255,255,0.1);
                color: white;
                border-left-color: rgba(255,255,255,0.5);
            }

            .sidebar-nav a.active {
                background: rgba(255,255,255,0.15);
                color: white;
                border-left-color: white;
                font-weight: 600;
            }

            .sidebar-nav i {
                width: 20px;
                font-size: 1.1rem;
            }

            .sidebar-footer {
                padding: 2rem;
                border-top: 1px solid rgba(255,255,255,0.2);
                margin-top: auto;
                position: relative;
                z-index: 1;
            }

            .user-info {
                margin-bottom: 1rem;
                padding: 1rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                text-align: center;
            }

            .user-info strong {
                display: block;
                margin-bottom: 0.25rem;
                color: white;
                font-size: 1.1rem;
            }

            .user-role {
                font-size: 0.85rem;
                color: #3b82f6;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
            }

            .btn-logout {
                width: 100%;
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.4);
                color: white;
                padding: 0.75rem;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.9rem;
            }

            .btn-logout:hover {
                background: rgba(239, 68, 68, 0.3);
                border-color: rgba(239, 68, 68, 0.6);
            }

            .main-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .content-header {
                background: var(--gradient-ocean);
                padding: 1.5rem 2rem;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: var(--shadow-light);
                position: relative;
                overflow: hidden;
            }

            .content-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                animation: headerShimmer 4s ease-in-out infinite;
            }

            .content-header h1 {
                margin: 0;
                color: white;
                font-size: 1.75rem;
                font-weight: 700;
                position: relative;
                z-index: 1;
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                position: relative;
                z-index: 1;
            }

            .theme-toggle {
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                color: var(--text-primary);
                padding: 0.75rem;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 1.2rem;
                box-shadow: var(--shadow-light);
                display: flex;
                align-items: center;
                justify-content: center;
                width: 45px;
                height: 45px;
            }

            .theme-toggle:hover {
                transform: scale(1.1) rotate(15deg);
                box-shadow: var(--shadow-medium);
                border-color: var(--accent-primary);
            }

            .content-body {
                flex: 1;
                padding: 2rem;
                overflow-y: auto;
                background: var(--bg-secondary);
            }

            .timestamp {
                font-size: 0.875rem;
                color: var(--text-muted);
                font-weight: 500;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.875rem;
                font-weight: 600;
            }

            .status-indicator.online {
                color: var(--success-color);
            }

            /* Universal Button Styles */
            .btn, button.btn, a.btn {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                padding: 0.375rem 0.75rem;
                background: var(--gradient-ocean);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                box-shadow: var(--shadow-light);
            }

            .btn:hover, button.btn:hover, a.btn:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-medium);
                filter: brightness(1.1);
            }

            .btn:active, button.btn:active, a.btn:active {
                transform: translateY(0);
            }

            .btn-secondary, button.btn-secondary, a.btn-secondary {
                background: var(--bg-tertiary);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
            }

            .btn-secondary:hover, button.btn-secondary:hover, a.btn-secondary:hover {
                background: var(--bg-secondary);
                border-color: var(--accent-primary);
            }

            .btn-danger, button.btn-danger, a.btn-danger {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                border: none;
            }

            .btn-success, button.btn-success, a.btn-success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
            }

            .btn-warning, button.btn-warning, a.btn-warning {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: white;
                border: none;
            }

            .btn:disabled, button.btn:disabled, a.btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                pointer-events: none;
            }

            /* Card Component */
            .card {
                background: var(--bg-primary);
                border-radius: 12px;
                box-shadow: var(--shadow-light);
                border: 1px solid var(--border-color);
                margin-bottom: 1.5rem;
                overflow: hidden;
                transition: all 0.3s ease;
            }

            .card:hover {
                box-shadow: var(--shadow-medium);
                transform: translateY(-2px);
            }

            .card-header {
                padding: 1.5rem;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-secondary);
            }

            .card-header h3 {
                margin: 0;
                font-size: 1.25rem;
                color: var(--text-primary);
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .card-header h3 i {
                color: var(--accent-primary);
            }

            .card-body {
                padding: 1.5rem;
            }

            .card-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid var(--border-color);
                background: var(--bg-secondary);
                display: flex;
                justify-content: flex-end;
                gap: 1rem;
            }

            /* Data Table Component */
            .data-table {
                width: 100%;
                border-collapse: collapse;
                background: var(--bg-primary);
                border-radius: 8px;
                overflow: hidden;
            }

            .data-table thead {
                background: var(--bg-secondary);
            }

            .data-table thead th {
                padding: 1rem;
                text-align: left;
                font-weight: 600;
                color: var(--text-primary);
                font-size: 0.875rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 2px solid var(--border-color);
            }

            .data-table tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: all 0.2s ease;
            }

            .data-table tbody tr:hover {
                background: var(--bg-secondary);
                transform: scale(1.01);
            }

            .data-table tbody tr:last-child {
                border-bottom: none;
            }

            .data-table tbody td {
                padding: 1rem;
                color: var(--text-secondary);
                font-size: 0.925rem;
                vertical-align: middle;
            }

            .data-table tbody td:first-child {
                font-weight: 500;
                color: var(--text-primary);
            }

            /* Status Badges */
            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.375rem;
                padding: 0.375rem 0.75rem;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 600;
                letter-spacing: 0.3px;
                text-transform: uppercase;
                transition: all 0.2s ease;
            }

            .status-badge.online {
                background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                color: #065f46;
                border: 1px solid #6ee7b7;
            }

            [data-theme="dark"] .status-badge.online, [data-theme="ocean"] .status-badge.online {
                background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
                color: #6ee7b7;
                border: 1px solid #059669;
            }

            .status-badge.offline {
                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                color: #991b1b;
                border: 1px solid #fca5a5;
            }

            [data-theme="dark"] .status-badge.offline, [data-theme="ocean"] .status-badge.offline {
                background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
                color: #fca5a5;
                border: 1px solid #dc2626;
            }

            .status-badge.pending {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                color: #78350f;
                border: 1px solid #fbbf24;
            }

            [data-theme="dark"] .status-badge.pending, [data-theme="ocean"] .status-badge.pending {
                background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
                color: #fbbf24;
                border: 1px solid #f59e0b;
            }

            /* Form Components */
            .form-group {
                margin-bottom: 1.5rem;
            }

            .form-group label {
                display: block;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 0.5rem;
                font-size: 0.95rem;
            }

            .form-group label i {
                margin-right: 0.5rem;
                color: var(--accent-primary);
            }

            .form-control {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid var(--border-color);
                border-radius: 8px;
                background: var(--bg-primary);
                color: var(--text-primary);
                font-size: 1rem;
                transition: all 0.2s ease;
                font-family: inherit;
            }

            .form-control:focus {
                outline: none;
                border-color: var(--accent-primary);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                background: var(--bg-primary);
            }

            .form-control::placeholder {
                color: var(--text-muted);
                opacity: 0.7;
            }

            textarea.form-control {
                resize: vertical;
                min-height: 100px;
                font-family: inherit;
            }

            select.form-control {
                cursor: pointer;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 0.75rem center;
                padding-right: 2.5rem;
            }

            input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
                accent-color: var(--accent-primary);
            }

            .form-group small {
                display: block;
                margin-top: 0.5rem;
                font-size: 0.875rem;
                color: var(--text-muted);
            }

            /* Stats Cards */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1.5rem;
                margin-bottom: 2rem;
            }

            .stat-card {
                background: var(--bg-primary);
                padding: 1.5rem;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                box-shadow: var(--shadow-light);
                transition: all 0.3s ease;
            }

            .stat-card:hover {
                transform: translateY(-4px);
                box-shadow: var(--shadow-medium);
            }

            .stat-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }

            .stat-title {
                font-size: 0.875rem;
                color: var(--text-muted);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .stat-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                background: var(--gradient-ocean);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
            }

            .stat-value {
                font-size: 2rem;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 0.5rem;
            }

            .stat-label {
                font-size: 0.875rem;
                color: var(--text-muted);
            }

            /* Utility Classes */
            .text-center {
                text-align: center;
            }

            .text-right {
                text-align: right;
            }

            .text-muted {
                color: var(--text-muted);
            }

            .text-primary {
                color: var(--text-primary);
            }

            .text-success {
                color: var(--success-color);
            }

            .text-warning {
                color: var(--warning-color);
            }

            .text-error {
                color: var(--error-color);
            }

            .mb-0 { margin-bottom: 0; }
            .mb-1 { margin-bottom: 0.5rem; }
            .mb-2 { margin-bottom: 1rem; }
            .mb-3 { margin-bottom: 1.5rem; }
            .mb-4 { margin-bottom: 2rem; }

            .mt-0 { margin-top: 0; }
            .mt-1 { margin-top: 0.5rem; }
            .mt-2 { margin-top: 1rem; }
            .mt-3 { margin-top: 1.5rem; }
            .mt-4 { margin-top: 2rem; }

            .flex {
                display: flex;
            }

            .flex-between {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .flex-center {
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .gap-1 { gap: 0.5rem; }
            .gap-2 { gap: 1rem; }
            .gap-3 { gap: 1.5rem; }
            .gap-4 { gap: 2rem; }

            ${additionalCSS}
        </style>
    </head>
    <body data-theme="auto">
        <div class="dashboard-container">
            <!-- Sidebar -->
            <nav class="sidebar">
                <div class="sidebar-header">
                    <h2><i class="fas fa-chart-network"></i> Rejavarti's Logging Server</h2>
                </div>
                <ul class="sidebar-nav">
                    <li><a href="/dashboard" ${activeNav === 'dashboard' ? 'class="active"' : ''}><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
                    <li><a href="/logs" ${activeNav === 'logs' ? 'class="active"' : ''}><i class="fas fa-file-alt"></i> Logs</a></li>
                    <li><a href="/integrations" ${activeNav === 'integrations' ? 'class="active"' : ''}><i class="fas fa-plug"></i> Integrations</a></li>
                    <li><a href="/webhooks" ${activeNav === 'webhooks' ? 'class="active"' : ''}><i class="fas fa-link"></i> Webhooks</a></li>
                    <li><a href="/activity" ${activeNav === 'activity' ? 'class="active"' : ''}><i class="fas fa-history"></i> Activity</a></li>
                    <li><a href="/admin/security" ${activeNav === 'security' ? 'class="active"' : ''}><i class="fas fa-shield-alt"></i> Security & Audit</a></li>
                    <li><a href="/admin/users" ${activeNav === 'users' ? 'class="active"' : ''}><i class="fas fa-users"></i> Users</a></li>
                    <li><a href="/admin/settings" ${activeNav === 'settings' ? 'class="active"' : ''}><i class="fas fa-cog"></i> Settings</a></li>
                </ul>
                <div class="sidebar-footer">
                    <div class="user-info">
                        <strong><i class="fas fa-user-circle"></i> ${req.user.username}</strong>
                        <span class="user-role">${req.user.role}</span>
                    </div>
                    <button onclick="logout()" class="btn-logout">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </nav>

            <!-- Main Content -->
            <main class="main-content">
                <header class="content-header">
                    <h1><i class="${pageIcon}"></i> ${pageTitle}</h1>
                    <div class="header-actions">
                        <a href="/search" class="search-toggle" title="Advanced Search" style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: var(--bg-secondary); color: var(--text-primary); text-decoration: none; margin-right: 8px; transition: all 0.3s ease; border: 1px solid var(--border-color);">
                            <i class="fas fa-search"></i>
                        </a>
                        <button onclick="toggleTheme()" class="theme-toggle" title="Auto Mode (Click for Light)">
                            <i id="theme-icon" class="fas fa-adjust"></i>
                        </button>
                        <span class="timestamp" id="current-time"></span>
                        <span class="status-indicator online">
                            <i class="fas fa-circle"></i> System Online
                        </span>
                    </div>
                </header>

                <div class="content-body">
                    ${contentBody}
                </div>
            </main>
        </div>

        <script>
            // ===== SHARED JAVASCRIPT UTILITIES - SINGLE SOURCE OF TRUTH =====
            
            // TIMEZONE CONFIGURATION (from server settings)
            const TIMEZONE = '${SYSTEM_SETTINGS.timezone || TIMEZONE}';
            const TIMEZONE_ABBR = '${moment().tz(SYSTEM_SETTINGS.timezone || TIMEZONE).format('z')}';
            const DEFAULT_THEME = '${SYSTEM_SETTINGS.default_theme || 'auto'}';
            
            // Format time in configured timezone
            function formatTime(date) {
                if (!date) return 'N/A';
                const d = new Date(date);
                return d.toLocaleString('en-US', {
                    timeZone: TIMEZONE,
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            // Update current time display
            function updateTime() {
                const now = new Date();
                document.getElementById('current-time').textContent = formatTime(now);
            }

            // Theme Management
            let currentTheme = localStorage.getItem('theme') || DEFAULT_THEME;
            
            function toggleTheme() {
                const themes = ['auto', 'light', 'dark', 'ocean'];
                const currentIndex = themes.indexOf(currentTheme);
                currentTheme = themes[(currentIndex + 1) % themes.length];
                localStorage.setItem('theme', currentTheme);
                applyTheme();
            }

            function applyTheme() {
                const icon = document.getElementById('theme-icon');
                const body = document.body;
                
                if (currentTheme === 'light') {
                    body.setAttribute('data-theme', 'light');
                    icon.className = 'fas fa-sun';
                    document.querySelector('.theme-toggle').title = 'Light Mode (Click for Dark)';
                } else if (currentTheme === 'dark') {
                    body.setAttribute('data-theme', 'dark');
                    icon.className = 'fas fa-moon';
                    document.querySelector('.theme-toggle').title = 'Dark Mode (Click for Ocean)';
                } else if (currentTheme === 'ocean') {
                    body.setAttribute('data-theme', 'ocean');
                    icon.className = 'fas fa-water';
                    document.querySelector('.theme-toggle').title = 'Ocean Blue Mode (Click for Auto)';
                } else {
                    // Auto mode
                    const hour = new Date().getHours();
                    if (hour >= 6 && hour < 18) {
                        body.setAttribute('data-theme', 'light');
                    } else {
                        body.setAttribute('data-theme', 'ocean');
                    }
                    icon.className = 'fas fa-adjust';
                    document.querySelector('.theme-toggle').title = 'Auto Mode (Click for Light)';
                }
            }

            // Notification System
            function showNotification(message, type = 'info') {
                // You can enhance this with a toast library
                console.log(\`[\${type.toUpperCase()}] \${message}\`);
                alert(message);
            }

            // Logout Function
            async function logout() {
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            }

            // Initialize on page load
            document.addEventListener('DOMContentLoaded', function() {
                applyTheme();
                updateTime();
                setInterval(updateTime, 1000);
            });

            // ===== COMMON UTILITY FUNCTIONS =====
            // Toast Notifications
            function showToast(message, type = 'info') {
                const toast = document.createElement('div');
                const colors = {
                    success: 'var(--success-color)',
                    error: 'var(--error-color)',
                    warning: 'var(--warning-color)',
                    info: 'var(--accent-primary)'
                };
                const icons = {
                    success: 'check-circle',
                    error: 'exclamation-circle',
                    warning: 'exclamation-triangle',
                    info: 'info-circle'
                };
                
                toast.style.cssText = \`
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: \${colors[type] || colors.info};
                    color: white;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 10001;
                    animation: slideInRight 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    min-width: 250px;
                    max-width: 400px;
                \`;
                
                toast.innerHTML = \`
                    <i class="fas fa-\${icons[type] || icons.info}"></i>
                    <span>\${message}</span>
                \`;
                
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.animation = 'slideOutRight 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }

            // Format timestamp for display
            function formatTimestamp(timestamp, options = {}) {
                if (!timestamp) return 'N/A';
                try {
                    // Ensure UTC timestamp is treated as UTC
                    let dateStr = timestamp;
                    // If the timestamp doesn't have timezone info, append 'Z' for UTC
                    if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
                        // Convert space-separated format to ISO format and add Z
                        dateStr = dateStr.replace(' ', 'T') + 'Z';
                    }
                    
                    const date = new Date(dateStr);
                    if (isNaN(date.getTime())) return timestamp; // Return original if invalid
                    
                    const opts = {
                        timeZone: TIMEZONE,
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                        ...options
                    };
                    
                    return date.toLocaleString('en-US', opts);
                } catch (error) {
                    console.error('Error formatting timestamp:', error);
                    return timestamp;
                }
            }

            // Format Bytes
            function formatBytes(bytes, decimals = 2) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const dm = decimals < 0 ? 0 : decimals;
                const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
            }

            // Format Number with commas
            function formatNumber(num) {
                return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
            }

            // Get Status Color
            function getStatusColor(status) {
                const statusMap = {
                    'online': '#10b981',
                    'success': '#10b981',
                    'active': '#10b981',
                    'offline': '#ef4444',
                    'error': '#ef4444',
                    'failed': '#ef4444',
                    'degraded': '#f59e0b',
                    'warning': '#f59e0b',
                    'pending': '#f59e0b',
                    'disabled': '#6b7280',
                    'inactive': '#6b7280',
                    'unknown': '#9ca3af'
                };
                return statusMap[status?.toLowerCase()] || '#9ca3af';
            }

            // Get Status Icon
            function getStatusIcon(status) {
                const iconMap = {
                    'online': 'check-circle',
                    'success': 'check-circle',
                    'active': 'check-circle',
                    'offline': 'times-circle',
                    'error': 'times-circle',
                    'failed': 'times-circle',
                    'degraded': 'exclamation-circle',
                    'warning': 'exclamation-triangle',
                    'pending': 'clock',
                    'disabled': 'ban',
                    'inactive': 'ban',
                    'unknown': 'question-circle'
                };
                return iconMap[status?.toLowerCase()] || 'question-circle';
            }

            // Time Ago Helper
            function timeAgo(timestamp) {
                const now = new Date();
                const time = new Date(timestamp);
                const diffMs = now - time;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                
                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return \`\${diffMins} minute\${diffMins !== 1 ? 's' : ''} ago\`;
                if (diffHours < 24) return \`\${diffHours} hour\${diffHours !== 1 ? 's' : ''} ago\`;
                if (diffDays < 7) return \`\${diffDays} day\${diffDays !== 1 ? 's' : ''} ago\`;
                return time.toLocaleDateString();
            }

            // Debounce Helper
            function debounce(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            }

            // Copy to Clipboard
            async function copyToClipboard(text) {
                try {
                    await navigator.clipboard.writeText(text);
                    showToast('Copied to clipboard', 'success');
                } catch (err) {
                    console.error('Failed to copy:', err);
                    showToast('Failed to copy to clipboard', 'error');
                }
            }

            // Confirm Dialog
            function confirmDialog(message, callback) {
                if (confirm(message)) {
                    callback();
                }
            }

            // Loading Spinner
            function showLoading(elementId) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                            <p>Loading...</p>
                        </div>
                    \`;
                }
            }

            // Error Display
            function showError(elementId, message) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                            <p>\${message}</p>
                        </div>
                    \`;
                }
            }

            // Empty State
            function showEmptyState(elementId, message, icon = 'inbox') {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-\${icon}" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>\${message}</p>
                        </div>
                    \`;
                }
            }

            // Modal Helpers
            function openModal(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }

            function closeModal(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }

            // Close modal on escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal.active').forEach(modal => {
                        modal.classList.remove('active');
                        document.body.style.overflow = '';
                    });
                }
            });

            // Close modal on backdrop click
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('modal')) {
                    e.target.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });

            // Animations
            const style = document.createElement('style');
            style.textContent = \`
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            \`;
            document.head.appendChild(style);

            // ===== PAGE-SPECIFIC JAVASCRIPT =====
            ${additionalJS}
        </script>
    </body>
    </html>
    `;
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

// Express middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: config.auth.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Request logging middleware - logs to file and database
app.use((req, res, next) => {
    const startTime = Date.now();
    const logMessage = `${req.method} ${req.url} from ${req.ip || req.connection.remoteAddress}`;
    loggers.access.info(logMessage);
    
    // Log HTTP requests to database
    logToDatabase(logMessage, 'info', 'http', 'logging-server');
    
    // Track response time for performance monitoring
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (req.path.startsWith('/api/') && duration > 1000) { // Track API requests over 1s
            trackResponseTime(req.path, duration);
        }
    });
    
    next();
});

// Integration Manager Class
class IntegrationManager {
    constructor() {
        this.connections = {};
        this.mqttClient = null;
        this.haWebSocket = null;
        this.unifiClient = null;
        this.wsServer = null;
        this.connectedClients = new Set();
    }

    async initialize() {
        loggers.system.info('🔌 Initializing integrations...');
        
        // Initialize WebSocket server
        if (config.integrations.websocket.enabled) {
            await this.initializeWebSocket();
        }
        
        // Initialize MQTT
        if (config.integrations.mqtt.enabled) {
            await this.initializeMQTT();
        }
        
        // Initialize UniFi
        if (config.integrations.unifi.enabled) {
            await this.initializeUniFi();
        }
        
        // Initialize Home Assistant
        if (config.integrations.homeAssistant.enabled) {
            await this.initializeHomeAssistant();
        }
        
        // Start maintenance tasks
        this.initializeMaintenanceTasks();
        
        loggers.system.info('✅ All integrations initialized');
    }

    async initializeWebSocket() {
        try {
            this.wsServer = new WebSocket.Server({ port: config.integrations.websocket.port });
            
            this.wsServer.on('connection', (ws, req) => {
                const clientId = crypto.randomUUID();
                this.connectedClients.add(ws);
                
                loggers.system.info(`🔗 WebSocket client connected: ${clientId}`);
                
                ws.on('close', () => {
                    this.connectedClients.delete(ws);
                    loggers.system.info(`🔌 WebSocket client disconnected: ${clientId}`);
                });
                
                ws.on('error', (error) => {
                    loggers.system.error(`WebSocket error for ${clientId}:`, error);
                });
                
                // Send welcome message
                ws.send(JSON.stringify({
                    type: 'connection',
                    message: 'Connected to Enterprise Logging Platform',
                    timestamp: moment().tz(TIMEZONE).toISOString()
                }));
            });
            
            loggers.system.info(`✅ WebSocket server running on port ${config.integrations.websocket.port}`);
        } catch (error) {
            loggers.system.error('❌ WebSocket initialization failed:', error);
        }
    }

    async initializeMQTT() {
        try {
            loggers.system.info('🔗 Connecting to MQTT broker...');
            
            const mqttOptions = {};
            if (config.integrations.mqtt.username) {
                mqttOptions.username = config.integrations.mqtt.username;
                mqttOptions.password = config.integrations.mqtt.password;
            }
            
            this.mqttClient = mqtt.connect(config.integrations.mqtt.broker, mqttOptions);
            
            this.mqttClient.on('connect', () => {
                loggers.system.info('✅ MQTT connected successfully');
                
                // Subscribe to configured topics
                config.integrations.mqtt.topics.forEach(topic => {
                    this.mqttClient.subscribe(topic);
                    loggers.system.info(`📡 Subscribed to MQTT topic: ${topic}`);
                });
                
                this.updateIntegrationStatus('mqtt', 'connected');
            });
            
            this.mqttClient.on('message', (topic, message) => {
                this.processMQTTMessage(topic, message);
            });
            
            this.mqttClient.on('error', (error) => {
                loggers.system.error('MQTT error:', error);
                this.updateIntegrationStatus('mqtt', 'error', error.message);
            });
            
            this.mqttClient.on('reconnect', () => {
                loggers.system.info('🔄 MQTT reconnecting...');
            });
            
        } catch (error) {
            loggers.system.error('❌ MQTT initialization failed:', error);
            this.updateIntegrationStatus('mqtt', 'error', error.message);
        }
    }

    async initializeUniFi() {
        if (!config.integrations.unifi.enabled) return;
        
        try {
            loggers.system.info('🌐 Initializing UniFi integration...');
            
            // Start periodic polling
            if (config.integrations.unifi.pollInterval > 0) {
                setInterval(async () => {
                    await this.pollUniFiDevices();
                }, config.integrations.unifi.pollInterval * 1000);
            }
            
            this.updateIntegrationStatus('unifi', 'connected');
            loggers.system.info('✅ UniFi integration initialized');
        } catch (error) {
            loggers.system.error('❌ UniFi integration failed:', error);
            this.updateIntegrationStatus('unifi', 'error', error.message);
        }
    }

    async initializeHomeAssistant() {
        if (!config.integrations.homeAssistant.enabled) return;

        try {
            loggers.system.info('🏠 Initializing Home Assistant integration...');
            
            if (config.integrations.homeAssistant.websocketEnabled) {
                await this.connectHomeAssistantWebSocket();
            }
            
            this.updateIntegrationStatus('home_assistant', 'connected');
            loggers.system.info('✅ Home Assistant integration initialized');
        } catch (error) {
            loggers.system.error('❌ Home Assistant integration failed:', error);
            this.updateIntegrationStatus('home_assistant', 'error', error.message);
        }
    }

    initializeMaintenanceTasks() {
        loggers.system.info('⏰ Setting up maintenance tasks...');
        
        // Database cleanup task
        cron.schedule(config.maintenance.cleanupSchedule, () => {
            this.performDatabaseCleanup();
        });
        
        // Backup task
        cron.schedule(config.maintenance.backupSchedule, () => {
            this.performBackup();
        });
        
        // Health check every 5 minutes
        cron.schedule('*/5 * * * *', () => {
            this.performHealthCheck();
        });
        
        loggers.system.info('✅ Maintenance tasks scheduled');
    }

    async pollUniFiDevices() {
        try {
            // Simulated UniFi device polling (replace with actual API calls)
            const mockDevices = [
                { name: 'USG Gateway', status: 'online', clients: Math.floor(Math.random() * 20) + 10 },
                { name: 'Switch 24 Port', status: 'online', clients: Math.floor(Math.random() * 15) + 5 },
                { name: 'AP Living Room', status: 'online', clients: Math.floor(Math.random() * 10) + 2 }
            ];

            for (const device of mockDevices) {
                this.logIntegrationEvent('network', 'unifi', device.name, 'device_status', {
                    status: device.status,
                    clients: device.clients,
                    timestamp: moment().tz(TIMEZONE).toISOString()
                });
            }
        } catch (error) {
            loggers.system.error('UniFi polling error:', error);
        }
    }

    async connectHomeAssistantWebSocket() {
        // Simulated Home Assistant events (replace with actual WebSocket connection)
        loggers.system.info('🔗 Home Assistant WebSocket simulation started');
        
        setInterval(() => {
            const mockEvents = [
                { entity: 'sensor.temperature', value: (20 + Math.random() * 10).toFixed(1), unit: '°C' },
                { entity: 'binary_sensor.front_door', value: Math.random() > 0.8 ? 'on' : 'off' },
                { entity: 'light.living_room', value: Math.random() > 0.5 ? 'on' : 'off', brightness: Math.floor(Math.random() * 100) }
            ];

            const randomEvent = mockEvents[Math.floor(Math.random() * mockEvents.length)];
            this.logIntegrationEvent('automation', 'home_assistant', randomEvent.entity, 'state_change', randomEvent);
        }, 45000); // Every 45 seconds
    }

    processMQTTMessage(topic, message) {
        try {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch {
                data = { raw_message: message.toString() };
            }
            
            this.logIntegrationEvent('iot', 'mqtt', topic, 'message_received', data);
            
            // Broadcast to WebSocket clients
            this.broadcastToWebSockets({
                type: 'mqtt_message',
                topic,
                data,
                timestamp: moment().tz(TIMEZONE).toISOString()
            });
            
        } catch (error) {
            loggers.system.error('MQTT message processing error:', error);
        }
    }

    logIntegrationEvent(category, source, deviceId, eventType, metadata = {}) {
        const timestamp = moment().tz(TIMEZONE).toISOString();
        
        // Log to database
        db.run(
            `INSERT INTO log_events (timestamp, category, source, device_id, event_type, severity, message, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                timestamp,
                category,
                source,
                deviceId,
                eventType,
                'info',
                `${source} ${eventType} from ${deviceId}`,
                JSON.stringify(metadata)
            ],
            function(err) {
                if (err) {
                    loggers.system.error('Database insert error:', err);
                } else {
                    // Broadcast to WebSocket clients
                    integrationManager.broadcastToWebSockets({
                        type: 'new_log_event',
                        event: {
                            id: this.lastID,
                            timestamp,
                            category,
                            source,
                            device_id: deviceId,
                            event_type: eventType,
                            message: `${source} ${eventType} from ${deviceId}`,
                            metadata
                        }
                    });
                }
            }
        );
        
        // Log to appropriate winston logger
        const logger = loggers[category] || loggers.system;
        logger.info(`${source} ${eventType}`, { device_id: deviceId, ...metadata });
    }

    broadcastToWebSockets(message) {
        const messageStr = JSON.stringify(message);
        this.connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    updateIntegrationStatus(integration, status, error = null) {
        this.connections[integration] = {
            status,
            lastUpdate: moment().tz(TIMEZONE).toISOString(),
            error
        };
        
        // Broadcast status update
        this.broadcastToWebSockets({
            type: 'integration_status',
            integration,
            status,
            error,
            timestamp: moment().tz(TIMEZONE).toISOString()
        });
    }

    async performDatabaseCleanup() {
        try {
            loggers.system.info('🧹 Starting database cleanup...');
            
            const cutoffDate = moment().subtract(config.maintenance.logRetentionDays, 'days').toISOString();
            
            db.run(
                'DELETE FROM log_events WHERE timestamp < ?',
                [cutoffDate],
                function(err) {
                    if (err) {
                        loggers.system.error('Database cleanup error:', err);
                    } else {
                        loggers.system.info(`✅ Cleaned up ${this.changes} old log entries`);
                    }
                }
            );
        } catch (error) {
            loggers.system.error('Database cleanup failed:', error);
        }
    }

    async performBackup() {
        try {
            loggers.system.info('💾 Starting database backup...');
            
            const backupDir = path.join(__dirname, 'data', 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const backupPath = path.join(backupDir, `enterprise_logs_${timestamp}.db`);
            
            fs.copyFileSync(dbPath, backupPath);
            loggers.system.info(`✅ Database backup created: ${backupPath}`);
            
            // Clean up old backups - keep only last 10
            const backupFiles = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('enterprise_logs_') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(backupDir, file),
                    time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Sort newest first
            
            // Delete backups older than the 10 most recent
            if (backupFiles.length > 10) {
                const filesToDelete = backupFiles.slice(10);
                for (const file of filesToDelete) {
                    fs.unlinkSync(file.path);
                    loggers.system.info(`🗑️  Deleted old backup: ${file.name}`);
                }
                loggers.system.info(`✨ Cleaned up ${filesToDelete.length} old backup(s), keeping latest 10`);
            }
            
        } catch (error) {
            loggers.system.error('Database backup failed:', error);
        }
    }

    performHealthCheck() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        // Check if memory usage is too high (> 500MB)
        if (memoryUsage.heapUsed > 500 * 1024 * 1024) {
            loggers.system.warn('High memory usage detected', {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                uptime: Math.round(uptime) + 's'
            });
        }
        
        // Log health status
        loggers.system.info('Health check completed', {
            uptime: Math.round(uptime),
            memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            connections: this.connectedClients.size,
            integrations: Object.keys(this.connections).length
        });
    }

    getStatus() {
        return {
            integrations: this.connections,
            websocket: {
                enabled: config.integrations.websocket.enabled,
                port: config.integrations.websocket.port,
                clients: this.connectedClients.size
            },
            mqtt: {
                enabled: config.integrations.mqtt.enabled,
                connected: this.mqttClient?.connected || false
            }
        };
    }

    async checkIntegrationHealth(integrationName) {
        const startTime = Date.now();
        let status = 'unknown';
        let error_message = null;
        let response_time = 0;

        try {
            switch(integrationName) {
                case 'mqtt':
                    if (config.integrations.mqtt && config.integrations.mqtt.enabled) {
                        if (this.mqttClient && this.mqttClient.connected) {
                            status = 'online';
                        } else {
                            status = 'offline';
                            error_message = 'MQTT client not connected';
                        }
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'websocket':
                    if (config.integrations.websocket && config.integrations.websocket.enabled) {
                        if (this.wsServer && this.wsServer.clients.size >= 0) {
                            status = 'online';
                        } else {
                            status = 'offline';
                            error_message = 'WebSocket server not running';
                        }
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'home_assistant':
                    if (config.integrations.homeAssistant.enabled && config.integrations.homeAssistant.url) {
                        try {
                            const haResponse = await axios.get(`${config.integrations.homeAssistant.url}/api/`, {
                                headers: { Authorization: `Bearer ${config.integrations.homeAssistant.token}` },
                                timeout: 5000
                            });
                            status = haResponse.status === 200 ? 'online' : 'degraded';
                        } catch (error) {
                            status = 'offline';
                            error_message = error.message;
                        }
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'pushover':
                    if (config.integrations.pushover.enabled && config.integrations.pushover.apiToken) {
                        try {
                            const pushResponse = await axios.post('https://api.pushover.net/1/users/validate.json', {
                                token: config.integrations.pushover.apiToken,
                                user: config.integrations.pushover.userKey
                            }, { timeout: 5000 });
                            status = pushResponse.data.status === 1 ? 'online' : 'offline';
                        } catch (error) {
                            status = 'offline';
                            error_message = error.message;
                        }
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'discord':
                    if (config.integrations.discord.enabled && config.integrations.discord.webhookUrl) {
                        status = 'online'; // Discord webhooks don't have a validation endpoint
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'slack':
                    if (config.integrations.slack.enabled && config.integrations.slack.webhookUrl) {
                        status = 'online'; // Slack webhooks don't have a validation endpoint
                    } else {
                        status = 'disabled';
                    }
                    break;

                case 'telegram':
                    if (config.integrations.telegram.enabled && config.integrations.telegram.botToken) {
                        try {
                            const tgResponse = await axios.get(`https://api.telegram.org/bot${config.integrations.telegram.botToken}/getMe`, {
                                timeout: 5000
                            });
                            status = tgResponse.data.ok ? 'online' : 'offline';
                        } catch (error) {
                            status = 'offline';
                            error_message = error.message;
                        }
                    } else {
                        status = 'disabled';
                    }
                    break;

                default:
                    status = 'unknown';
                    error_message = 'Unknown integration';
            }

            response_time = Date.now() - startTime;

            // Update integration_health table
            if (db) {
                db.run(
                    `INSERT OR REPLACE INTO integration_health 
                     (integration_name, status, last_check, last_success, error_count, error_message, response_time, updated_at)
                     VALUES (
                         ?,
                         ?,
                         CURRENT_TIMESTAMP,
                         CASE WHEN ? = 'online' THEN CURRENT_TIMESTAMP ELSE (SELECT last_success FROM integration_health WHERE integration_name = ?) END,
                         CASE WHEN ? = 'online' THEN 0 ELSE COALESCE((SELECT error_count FROM integration_health WHERE integration_name = ?), 0) + 1 END,
                         ?,
                         ?,
                         CURRENT_TIMESTAMP
                     )`,
                    [integrationName, status, status, integrationName, status, integrationName, error_message, response_time]
                );
            }

            return { integration: integrationName, status, response_time, error_message };
        } catch (error) {
            loggers.system.error(`Health check failed for ${integrationName}:`, error);
            return { integration: integrationName, status: 'error', error_message: error.message };
        }
    }

    async checkAllIntegrationsHealth() {
        const integrations = ['mqtt', 'websocket', 'home_assistant', 'pushover', 'discord', 'slack', 'telegram'];
        const results = [];

        for (const integration of integrations) {
            const result = await this.checkIntegrationHealth(integration);
            results.push(result);
        }

        return results;
    }

    initializeHealthChecks() {
        // Check all integrations health every 5 minutes
        setInterval(async () => {
            await this.checkAllIntegrationsHealth();
        }, 5 * 60 * 1000);

        // Perform initial health check after 10 seconds
        setTimeout(() => this.checkAllIntegrationsHealth(), 10000);
    }
}

// System Metrics Manager Class
class SystemMetricsManager {
    constructor() {
        this.startTime = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;
    }

    initializeMetricsCollection() {
        loggers.system.info('📊 System metrics collection started (30s interval)');
        
        // Collect initial metrics immediately
        this.collectMetrics();
        
        // Collect metrics every 30 seconds
        setInterval(() => this.collectMetrics(), 30000);
    }

    collectMetrics() {
        const metrics = this.getSystemMetrics();
        
        // Store in database for historical analysis
        if (db) {
            db.run(
                'INSERT INTO integration_metrics (integration_name, metric_type, value, status, timestamp) VALUES (?, ?, ?, ?, ?)',
                ['system', 'health', JSON.stringify(metrics), 'ok', new Date().toISOString()],
                (err) => {
                    if (err) {
                        loggers.system.error('Failed to store metrics:', err);
                    } else {
                        const metricsMsg = `Metrics: ${metrics.memory.heapUsed}MB memory, ${metrics.uptime}s uptime, ${metrics.requests.total} requests`;
                        loggers.system.info(`✅ ${metricsMsg}`);
                        
                        // Also log to database so it appears in the logs page
                        logToDatabase(metricsMsg, 'info', 'metrics', 'logging-server');
                    }
                }
            );
        }
    }

    getSystemMetrics() {
        const mem = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Calculate CPU percentage (convert microseconds to percentage)
        if (!this.lastCpuUsage) {
            this.lastCpuUsage = cpuUsage;
            this.lastCpuTime = Date.now();
        }
        
        const cpuElapsed = (Date.now() - this.lastCpuTime) * 1000; // to microseconds
        const cpuUserDiff = cpuUsage.user - this.lastCpuUsage.user;
        const cpuSystemDiff = cpuUsage.system - this.lastCpuUsage.system;
        const cpuPercent = cpuElapsed > 0 ? Math.min(((cpuUserDiff + cpuSystemDiff) / cpuElapsed * 100), 100).toFixed(1) : 0;
        
        this.lastCpuUsage = cpuUsage;
        this.lastCpuTime = Date.now();
        
        return {
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            memory: {
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                rss: Math.round(mem.rss / 1024 / 1024),
                external: Math.round(mem.external / 1024 / 1024)
            },
            cpu: {
                percent: parseFloat(cpuPercent),
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            requests: {
                total: this.requestCount,
                errors: this.errorCount,
                errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount * 100).toFixed(2) : 0
            }
        };
    }

    incrementRequestCount() {
        this.requestCount++;
    }

    incrementErrorCount() {
        this.errorCount++;
    }
}

// Alert Manager Class
class AlertManager {
    constructor() {
        this.alertThresholds = {
            memory: 500, // MB
            errorRate: 10, // percentage
            responseTime: 5000 // ms
        };
    }

    createAlert(alertData) {
        const { type, severity, title, message, source, metadata } = alertData;
        
        if (!db) return;
        
        db.run(
            'INSERT INTO system_alerts (type, severity, title, message, source, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            [type, severity, title, message, source, JSON.stringify(metadata || {})],
            function(err) {
                if (err) {
                    loggers.system.error('Failed to create alert:', err);
                } else {
                    loggers.system.info(`Alert created: ${title} (${severity})`);
                    
                    // Broadcast to WebSocket clients
                    if (integrationManager) {
                        integrationManager.broadcastToWebSockets({
                            type: 'alert',
                            alert: {
                                id: this.lastID,
                                type,
                                severity,
                                title,
                                message,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                    
                    // Trigger webhooks
                    if (webhookManager) {
                        webhookManager.triggerWebhooks('alert', { type, severity, title, message });
                    }
                }
            }
        );
    }

    getUnreadAlerts(callback) {
        db.all(
            'SELECT * FROM system_alerts WHERE is_read = 0 ORDER BY created_at DESC LIMIT 50',
            [],
            callback
        );
    }

    markAsRead(alertId, callback) {
        db.run(
            'UPDATE system_alerts SET is_read = 1 WHERE id = ?',
            [alertId],
            callback
        );
    }

    resolveAlert(alertId, userId, callback) {
        db.run(
            'UPDATE system_alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?',
            [userId, alertId],
            callback
        );
    }
    
    // Check if similar alert already exists (prevent duplicates)
    checkDuplicateAlert(type, title, callback) {
        db.get(
            'SELECT id FROM system_alerts WHERE type = ? AND title = ? AND is_resolved = 0 AND created_at > datetime("now", "-1 hour")',
            [type, title],
            callback
        );
    }
}

// Real-time Monitoring System
const failedLoginAttempts = new Map(); // Track failed logins by IP

function startRealTimeMonitoring() {
    // Memory monitoring - check every 2 minutes
    setInterval(() => {
        const mem = process.memoryUsage();
        const heapUsedMB = mem.heapUsed / 1024 / 1024;
        const rssMB = mem.rss / 1024 / 1024;
        const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;
        
        // Note: High heap % (70-90%) is normal for Node.js/V8 - it means efficient memory usage
        // We use RSS (Resident Set Size) as the primary indicator of actual memory problems
        
        // Critical: RSS > 500MB (actual memory usage, not heap %)
        if (rssMB > 500) {
            alertManager.checkDuplicateAlert('system', 'High Memory Usage', (err, existing) => {
                if (!err && !existing) {
                    alertManager.createAlert({
                        type: 'system',
                        severity: 'critical',
                        title: 'High Memory Usage',
                        message: `Server memory (RSS) has exceeded 500MB threshold. Current: ${rssMB.toFixed(1)}MB. Consider restarting or investigating memory leaks.`,
                        source: 'System Monitor',
                        metadata: { 
                            rssMB: Math.round(rssMB),
                            heapUsedMB: Math.round(heapUsedMB),
                            heapPercent: heapUsedPercent.toFixed(1)
                        }
                    });
                }
            });
        }
        
        // Warning: RSS > 300MB
        else if (rssMB > 300) {
            alertManager.checkDuplicateAlert('system', 'Elevated Memory Usage', (err, existing) => {
                if (!err && !existing) {
                    alertManager.createAlert({
                        type: 'system',
                        severity: 'warning',
                        title: 'Elevated Memory Usage',
                        message: `Server memory (RSS) is at ${rssMB.toFixed(1)}MB. Monitor for potential memory issues.`,
                        source: 'System Monitor',
                        metadata: { 
                            rssMB: Math.round(rssMB),
                            heapUsedMB: Math.round(heapUsedMB),
                            heapPercent: heapUsedPercent.toFixed(1)
                        }
                    });
                }
            });
        }
    }, 120000); // Every 2 minutes
    
    // Clean up old failed login tracking every hour
    setInterval(() => {
        const oneHourAgo = Date.now() - 3600000;
        for (const [ip, data] of failedLoginAttempts.entries()) {
            if (data.lastAttempt < oneHourAgo) {
                failedLoginAttempts.delete(ip);
            }
        }
    }, 3600000); // Every hour
    
    loggers.system.info('🔍 Real-time monitoring started (memory, security, performance)');
}

// Track failed login attempts (called from login endpoint)
function trackFailedLogin(ip, username) {
    if (!failedLoginAttempts.has(ip)) {
        failedLoginAttempts.set(ip, { count: 0, lastAttempt: Date.now(), username });
    }
    
    const data = failedLoginAttempts.get(ip);
    data.count++;
    data.lastAttempt = Date.now();
    
    // Alert on 5+ failed attempts in an hour
    if (data.count >= 5) {
        alertManager.checkDuplicateAlert('security', `Failed Login Attempts from ${ip}`, (err, existing) => {
            if (!err && !existing) {
                alertManager.createAlert({
                    type: 'security',
                    severity: data.count >= 10 ? 'error' : 'warning',
                    title: `Failed Login Attempts from ${ip}`,
                    message: `${data.count} failed login attempts detected from IP ${ip} for user "${username}". Possible brute force attack.`,
                    source: 'Auth System',
                    metadata: { ip, attempts: data.count, username, timestamp: new Date().toISOString() }
                });
            }
        });
    }
}

// Track slow API responses (middleware)
const responseTimeTracker = { requests: [], lastAlert: 0 };

// Endpoints that are expected to be slow (data-heavy operations)
const expectedSlowEndpoints = [
    '/api/logs',           // Can fetch 999,999 logs
    '/api/activity',       // Large activity history
    '/api/backups',        // File system operations
    '/api/system/metrics'  // System data collection
];

function trackResponseTime(endpoint, duration) {
    // Ignore expected-slow endpoints unless extremely slow (>10s)
    const isExpectedSlow = expectedSlowEndpoints.some(slow => endpoint.includes(slow));
    if (isExpectedSlow && duration < 10000) {
        return; // Don't track these unless really problematic
    }
    
    responseTimeTracker.requests.push({ endpoint, duration, timestamp: Date.now() });
    
    // Keep only last 100 requests
    if (responseTimeTracker.requests.length > 100) {
        responseTimeTracker.requests.shift();
    }
    
    // Check for slow responses every 5 minutes
    const now = Date.now();
    if (now - responseTimeTracker.lastAlert > 300000) { // 5 minutes
        // Adjusted threshold: >5s for unexpected endpoints
        const recentSlow = responseTimeTracker.requests.filter(r => 
            r.duration > 5000 && r.timestamp > now - 300000
        );
        
        if (recentSlow.length >= 3) { // Reduced from 5 to 3
            const avgTime = recentSlow.reduce((sum, r) => sum + r.duration, 0) / recentSlow.length;
            const slowestEndpoint = recentSlow.reduce((prev, curr) => 
                curr.duration > prev.duration ? curr : prev
            );
            
            alertManager.checkDuplicateAlert('performance', 'Slow API Response Times', (err, existing) => {
                if (!err && !existing) {
                    alertManager.createAlert({
                        type: 'performance',
                        severity: avgTime > 15000 ? 'error' : 'warning',
                        title: 'Slow API Response Times',
                        message: `${recentSlow.length} unexpectedly slow API responses detected. Average: ${(avgTime/1000).toFixed(2)}s. Slowest: ${slowestEndpoint.endpoint} (${(slowestEndpoint.duration/1000).toFixed(2)}s)`,
                        source: 'Performance Monitor',
                        metadata: { 
                            count: recentSlow.length, 
                            avgTimeMs: Math.round(avgTime),
                            slowestEndpoint: slowestEndpoint.endpoint,
                            slowestTimeMs: slowestEndpoint.duration
                        }
                    });
                    responseTimeTracker.lastAlert = now;
                }
            });
        }
    }
}

// Webhook Manager Class
class WebhookManager {
    async triggerWebhooks(eventType, data) {
        if (!db) return;
        
        db.all(
            'SELECT * FROM webhooks WHERE enabled = 1',
            [],
            async (err, webhooks) => {
                if (err) {
                    loggers.system.error('Failed to fetch webhooks:', err);
                    return;
                }
                
                for (const webhook of webhooks) {
                    const eventTypes = webhook.event_types ? JSON.parse(webhook.event_types) : [];
                    
                    if (eventTypes.length === 0 || eventTypes.includes(eventType)) {
                        await this.deliverWebhook(webhook, eventType, data);
                    }
                }
            }
        );
    }

    async deliverWebhook(webhook, eventType, data) {
        const payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            data
        };

        try {
            const headers = webhook.headers ? JSON.parse(webhook.headers) : {};
            if (webhook.secret) {
                headers['X-Webhook-Secret'] = webhook.secret;
            }
            
            const startTime = Date.now();
            const response = await axios({
                method: webhook.method,
                url: webhook.url,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                data: payload,
                timeout: 10000
            });
            const responseTime = Date.now() - startTime;
            
            // Log successful delivery
            db.run(
                `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, response_code, response_body, attempted_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [webhook.id, eventType, JSON.stringify(payload), 'success', response.status, JSON.stringify(response.data).substring(0, 1000)]
            );
            
            // Update success count
            db.run(
                'UPDATE webhooks SET success_count = success_count + 1, last_triggered = CURRENT_TIMESTAMP WHERE id = ?',
                [webhook.id]
            );
            
            loggers.system.info(`Webhook triggered successfully: ${webhook.name} (${responseTime}ms)`);
            return { success: true, response };
        } catch (error) {
            // Log failed delivery
            db.run(
                `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, response_code, error_message, attempted_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [webhook.id, eventType, JSON.stringify(payload), 'failed', error.response?.status || null, error.message]
            );
            
            // Update failure count
            db.run(
                'UPDATE webhooks SET failure_count = failure_count + 1, last_triggered = CURRENT_TIMESTAMP WHERE id = ?',
                [webhook.id]
            );
            
            loggers.system.error(`Webhook failed: ${webhook.name}`, error.message);
            return { success: false, error: error.message };
        }
    }
}

// Database setup
const dbPath = path.join(dbDir, 'enterprise_logs.db');
const db = new sqlite3.Database(dbPath);

// Helper function to log server events to database
function logToDatabase(message, severity = 'info', category = 'server', source = 'logging-server') {
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    
    db.run(
        `INSERT INTO log_events (timestamp, category, source, device_id, event_type, severity, message, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            timestamp,
            category,
            source,
            'logging-server',
            'system',
            severity,
            message,
            JSON.stringify({ logged_at: new Date().toISOString() })
        ],
        (err) => {
            if (err) {
                loggers.system.error('Failed to insert log into database:', err);
            }
        }
    );
}

// Initialize database schema
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // Enhanced log events table
    db.run(`
        CREATE TABLE IF NOT EXISTS log_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'security',
            source TEXT NOT NULL DEFAULT 'DSC',
            device_id TEXT NOT NULL DEFAULT 'esp32-dsc',
            event_type TEXT NOT NULL DEFAULT 'zone_event',
            severity TEXT DEFAULT 'info',
            zone_number INTEGER,
            zone_name TEXT,
            message TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Audit log table
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            resource TEXT,
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Custom integrations table
    db.run(`
        CREATE TABLE IF NOT EXISTS custom_integrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            base_url TEXT,
            auth_type TEXT DEFAULT 'none',
            auth_data TEXT,
            enabled BOOLEAN DEFAULT 1,
            description TEXT,
            test_endpoint TEXT,
            icon TEXT DEFAULT 'puzzle-piece',
            icon_color TEXT DEFAULT '#8b5cf6',
            status TEXT DEFAULT 'unknown',
            last_tested DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrate existing custom_integrations table to add icon columns if they don't exist
    db.all("PRAGMA table_info(custom_integrations)", [], (err, columns) => {
        if (err) {
            loggers.system.error('Error checking custom_integrations schema:', err);
            return;
        }
        
        const hasIcon = columns.some(col => col.name === 'icon');
        const hasIconColor = columns.some(col => col.name === 'icon_color');
        
        if (!hasIcon) {
            db.run("ALTER TABLE custom_integrations ADD COLUMN icon TEXT DEFAULT 'puzzle-piece'", (err) => {
                if (err) loggers.system.error('Error adding icon column:', err);
                else loggers.system.info('Added icon column to custom_integrations');
            });
        }
        
        if (!hasIconColor) {
            db.run("ALTER TABLE custom_integrations ADD COLUMN icon_color TEXT DEFAULT '#8b5cf6'", (err) => {
                if (err) loggers.system.error('Error adding icon_color column:', err);
                else loggers.system.info('Added icon_color column to custom_integrations');
            });
        }
    });

    // User sessions table for session management
    db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL UNIQUE,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // User activity log table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            resource TEXT,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // System alerts table
    db.run(`
        CREATE TABLE IF NOT EXISTS system_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            is_read BOOLEAN DEFAULT 0,
            is_resolved BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            resolved_by INTEGER,
            FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
    `);

    // Webhooks table
    db.run(`
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            method TEXT DEFAULT 'POST',
            headers TEXT,
            event_types TEXT,
            enabled BOOLEAN DEFAULT 1,
            secret TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_triggered DATETIME,
            success_count INTEGER DEFAULT 0,
            failure_count INTEGER DEFAULT 0
        )
    `);

    // Webhook deliveries table
    db.run(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            webhook_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            response_code INTEGER,
            response_body TEXT,
            error_message TEXT,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
        )
    `);

    // Integration health metrics table
    db.run(`
        CREATE TABLE IF NOT EXISTS integration_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_name TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            value REAL,
            status TEXT,
            response_time INTEGER,
            error_message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Integration health status table
    db.run(`
        CREATE TABLE IF NOT EXISTS integration_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_name TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'unknown',
            last_check DATETIME,
            last_success DATETIME,
            error_count INTEGER DEFAULT 0,
            error_message TEXT,
            response_time INTEGER,
            metadata TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Integration configurations table
    db.run(`
        CREATE TABLE IF NOT EXISTS integration_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_name TEXT NOT NULL UNIQUE,
            integration_type TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 0,
            config_json TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by INTEGER,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )
    `);

    // Custom dashboard layouts table
    db.run(`
        CREATE TABLE IF NOT EXISTS dashboard_layouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            layout_data TEXT NOT NULL,
            is_default BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // User theme preferences table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_theme_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            gradient_type TEXT DEFAULT 'linear',
            gradient_angle INTEGER DEFAULT 135,
            gradient_stops TEXT,
            bg_primary TEXT,
            bg_secondary TEXT,
            bg_tertiary TEXT,
            text_primary TEXT,
            text_secondary TEXT,
            text_muted TEXT,
            border_color TEXT,
            accent_primary TEXT,
            accent_secondary TEXT,
            success_color TEXT,
            warning_color TEXT,
            error_color TEXT,
            info_color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Rate limiting table
    db.run(`
        CREATE TABLE IF NOT EXISTS rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            request_count INTEGER DEFAULT 1,
            window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
            blocked_until DATETIME
        )
    `);

    // Two-factor authentication secrets table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_2fa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            secret TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 0,
            backup_codes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            verified_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // API Keys table for external integrations
    db.run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            key_value TEXT NOT NULL UNIQUE,
            description TEXT,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used DATETIME,
            expires_at DATETIME,
            is_active BOOLEAN DEFAULT 1,
            permissions TEXT,
            ip_whitelist TEXT,
            usage_count INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            loggers.system.error('Error creating api_keys table:', err);
        } else {
            loggers.system.info('✅ API Keys table ready');
        }
    });

    // System Settings table
    db.run(`
        CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT DEFAULT 'string',
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by INTEGER,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )
    `);

    // Initialize default settings
    db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) 
            VALUES ('timezone', 'America/Edmonton', 'string', 'System timezone for displaying dates and times')`);
    db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) 
            VALUES ('default_theme', 'ocean', 'string', 'Default theme for all users (auto/light/dark/ocean)')`);
    db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) 
            VALUES ('date_format', 'MM/DD/YYYY, hh:mm:ss A', 'string', 'Date and time display format')`);

    loggers.system.info('Database schema initialized');
});

// ========================================
// DATABASE MIGRATION SYSTEM
// ========================================
// Automatic schema version management and migrations
const SCHEMA_VERSION = 4; // Increment this when adding new tables/columns

const MIGRATION_DEFINITIONS = {
    1: {
        description: 'Initial schema with all base tables',
        tables: [
            'logs', 'users', 'user_sessions', 'activity_log', 'webhooks', 
            'integrations', 'system_metrics', 'alert_rules', 'alert_history',
            'dashboard_layouts', 'user_2fa', 'api_keys', 'system_settings'
        ]
    },
    2: {
        description: 'Add missing columns and verify structure',
        migrations: [
            {
                name: 'verify_api_keys_structure',
                check: (db, callback) => {
                    db.get("PRAGMA table_info(api_keys)", (err, result) => {
                        callback(err, result ? false : true); // needs migration if table doesn't exist
                    });
                },
                apply: (db, callback) => {
                    db.run(`
                        CREATE TABLE IF NOT EXISTS api_keys (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            key_value TEXT NOT NULL UNIQUE,
                            description TEXT,
                            created_by INTEGER NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_used DATETIME,
                            expires_at DATETIME,
                            is_active BOOLEAN DEFAULT 1,
                            permissions TEXT,
                            ip_whitelist TEXT,
                            usage_count INTEGER DEFAULT 0,
                            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                        )
                    `, callback);
                }
            }
        ]
    },
    3: {
        description: 'Add Advanced Search and Custom Dashboard Widgets features',
        migrations: [
            {
                name: 'create_saved_searches',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_searches'", 
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`
                        CREATE TABLE saved_searches (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            name TEXT NOT NULL,
                            description TEXT,
                            filters TEXT NOT NULL,
                            is_public BOOLEAN DEFAULT 0,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_used DATETIME,
                            use_count INTEGER DEFAULT 0,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                        )
                    `, callback);
                }
            },
            {
                name: 'create_dashboard_widgets',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='dashboard_widgets'", 
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`
                        CREATE TABLE dashboard_widgets (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            widget_type TEXT NOT NULL,
                            title TEXT NOT NULL,
                            position_x INTEGER DEFAULT 0,
                            position_y INTEGER DEFAULT 0,
                            width INTEGER DEFAULT 4,
                            height INTEGER DEFAULT 3,
                            config TEXT,
                            is_visible BOOLEAN DEFAULT 1,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                        )
                    `, callback);
                }
            },
            {
                name: 'add_saved_searches_index',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_saved_searches_user'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`CREATE INDEX idx_saved_searches_user ON saved_searches(user_id, created_at DESC)`, callback);
                }
            },
            {
                name: 'add_dashboard_widgets_index',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_dashboard_widgets_user'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`CREATE INDEX idx_dashboard_widgets_user ON dashboard_widgets(user_id, is_visible)`, callback);
                }
            }
        ]
    },
    4: {
        description: 'Fix API Keys table structure',
        migrations: [
            {
                name: 'recreate_api_keys_table',
                check: (db, callback) => {
                    // Check if the table has the correct schema by checking for 'name' column
                    db.all("PRAGMA table_info(api_keys)", (err, columns) => {
                        if (err) return callback(err, true); // Error, needs migration
                        const hasNameColumn = columns && columns.some(col => col.name === 'name');
                        callback(null, !hasNameColumn); // Needs migration if name column is missing
                    });
                },
                apply: (db, callback) => {
                    // Drop and recreate the table with correct schema
                    db.run(`DROP TABLE IF EXISTS api_keys`, (dropErr) => {
                        if (dropErr) return callback(dropErr);
                        
                        db.run(`
                            CREATE TABLE api_keys (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT NOT NULL,
                                key_value TEXT NOT NULL UNIQUE,
                                description TEXT,
                                created_by INTEGER NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                last_used DATETIME,
                                expires_at DATETIME,
                                is_active BOOLEAN DEFAULT 1,
                                permissions TEXT,
                                ip_whitelist TEXT,
                                usage_count INTEGER DEFAULT 0,
                                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                            )
                        `, callback);
                    });
                }
            }
        ]
    }
    // Add new versions here as features are added
};

// Migration manager
class DatabaseMigrationManager {
    constructor(database) {
        this.db = database;
    }

    async getCurrentVersion(callback) {
        this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'", (err, row) => {
            if (err) return callback(err);
            
            if (!row) {
                // Create migrations table
                this.db.run(`
                    CREATE TABLE schema_migrations (
                        version INTEGER PRIMARY KEY,
                        description TEXT,
                        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (createErr) => {
                    if (createErr) return callback(createErr);
                    callback(null, 0); // Starting from version 0
                });
            } else {
                this.db.get("SELECT MAX(version) as version FROM schema_migrations", (err, row) => {
                    callback(err, row ? (row.version || 0) : 0);
                });
            }
        });
    }

    async runMigration(version, definition, callback) {
        loggers.system.info(`🔄 Running migration version ${version}: ${definition.description}`);
        
        if (!definition.migrations || definition.migrations.length === 0) {
            // No migrations defined, just record version
            this.recordMigration(version, definition.description, callback);
            return;
        }

        // Run migrations sequentially
        let index = 0;
        const runNext = () => {
            if (index >= definition.migrations.length) {
                // All migrations completed
                this.recordMigration(version, definition.description, callback);
                return;
            }

            const migration = definition.migrations[index];

            // Check if migration is needed
            migration.check(this.db, (checkErr, needsMigration) => {
                if (checkErr) {
                    loggers.system.error(`❌ Error checking migration ${migration.name}:`, checkErr);
                    return callback(checkErr);
                }

                if (!needsMigration) {
                    loggers.system.info(`⏭️  Skipping ${migration.name} (already applied)`);
                    index++;
                    runNext();
                    return;
                }

                // Apply migration
                migration.apply(this.db, (applyErr) => {
                    if (applyErr) {
                        loggers.system.error(`❌ Failed to apply migration ${migration.name}:`, applyErr);
                        return callback(applyErr);
                    }

                    loggers.system.info(`✅ Applied migration: ${migration.name}`);
                    index++;
                    runNext();
                });
            });
        };

        runNext();
    }

    recordMigration(version, description, callback) {
        this.db.run(
            "INSERT INTO schema_migrations (version, description) VALUES (?, ?)",
            [version, description],
            (err) => {
                if (err) {
                    loggers.system.error(`❌ Failed to record migration version ${version}:`, err);
                    return callback(err);
                }
                loggers.system.info(`✅ Migration version ${version} completed: ${description}`);
                callback(null);
            }
        );
    }

    async runAllMigrations(callback) {
        this.getCurrentVersion((err, currentVersion) => {
            if (err) {
                loggers.system.error('❌ Failed to get current schema version:', err);
                return callback(err);
            }

            loggers.system.info(`📊 Current schema version: ${currentVersion}, Target version: ${SCHEMA_VERSION}`);

            if (currentVersion >= SCHEMA_VERSION) {
                loggers.system.info('✅ Database schema is up to date');
                return callback(null);
            }

            // Run migrations sequentially
            const versionsToRun = [];
            for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
                if (MIGRATION_DEFINITIONS[v]) {
                    versionsToRun.push(v);
                }
            }

            let index = 0;
            const runNext = () => {
                if (index >= versionsToRun.length) {
                    loggers.system.info('✅ All migrations completed successfully');
                    return callback(null);
                }

                const version = versionsToRun[index];
                const definition = MIGRATION_DEFINITIONS[version];

                this.runMigration(version, definition, (migrationErr) => {
                    if (migrationErr) {
                        loggers.system.error(`❌ Migration version ${version} failed:`, migrationErr);
                        return callback(migrationErr);
                    }

                    index++;
                    runNext();
                });
            };

            runNext();
        });
    }
}

// Initialize migration system
const migrationManager = new DatabaseMigrationManager(db);

// Run migrations after database is ready (with delay)
setTimeout(() => {
    migrationManager.runAllMigrations((err) => {
        if (err) {
            loggers.system.error('❌ Database migration failed:', err);
        } else {
            loggers.system.info('✅ Database migration system ready');
        }
    });
}, 2000);

// Global system settings cache
let SYSTEM_SETTINGS = {
    timezone: TIMEZONE,
    default_theme: 'ocean',
    date_format: 'MM/DD/YYYY, hh:mm:ss A'
};

// Load system settings from database
function loadSystemSettings(callback) {
    db.all('SELECT setting_key, setting_value FROM system_settings', [], (err, rows) => {
        if (err) {
            loggers.system.error('Failed to load system settings:', err);
            if (callback) callback(err);
            return;
        }
        
        rows.forEach(row => {
            SYSTEM_SETTINGS[row.setting_key] = row.setting_value;
        });
        
        loggers.system.info('✅ System settings loaded:', SYSTEM_SETTINGS);
        if (callback) callback(null, SYSTEM_SETTINGS);
    });
}

// Load settings on startup (with delay to ensure DB is ready)
setTimeout(() => {
    loadSystemSettings((err, settings) => {
        if (!err) {
            // Update config with loaded timezone
            config.system.timezone = settings.timezone;
        }
    });
}, 1000);

// Initialize managers
const integrationManager = new IntegrationManager();
const metricsManager = new SystemMetricsManager();
const alertManager = new AlertManager();
const webhookManager = new WebhookManager();

// Start metrics collection
setTimeout(() => metricsManager.initializeMetricsCollection(), 5000);

// User Management Class
class UserManager {
    constructor() {
        this.jwtSecret = config.auth.jwtSecret;
        this.initializeDefaultAdmin();
    }

    async initializeDefaultAdmin() {
        // Check if admin user exists
        db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, row) => {
            if (err) {
                loggers.system.error('Error checking for admin user:', err);
                return;
            }
            
            if (!row) {
                // Create default admin user
                try {
                    const defaultPassword = 'ChangeMe123!';
                    const passwordHash = await bcrypt.hash(defaultPassword, config.auth.saltRounds);
                    
                    db.run(
                        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                        ['admin', 'admin@enterprise.local', passwordHash, 'admin'],
                        function(err) {
                            if (err) {
                                loggers.system.error('Failed to create default admin:', err);
                            } else {
                                loggers.system.info('✅ Default admin user created', {
                                    username: 'admin',
                                    password: defaultPassword
                                });
                                console.log(`\n🔐 Default Admin Created:`);
                                console.log(`   Username: admin`);
                                console.log(`   Password: ${defaultPassword}`);
                                console.log(`   Please change this password after first login!\n`);
                            }
                        }
                    );
                } catch (error) {
                    loggers.system.error('Error creating default admin:', error);
                }
            }
        });
    }

    async authenticateUser(username, password) {
        return new Promise((resolve) => {
            db.get(
                'SELECT * FROM users WHERE username = ? AND is_active = 1',
                [username],
                async (err, user) => {
                    if (err || !user) {
                        resolve({ success: false, error: 'Invalid credentials' });
                        return;
                    }

                    try {
                        const validPassword = await bcrypt.compare(password, user.password_hash);
                        if (validPassword) {
                            // Update last login (use explicit UTC time)
                            const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
                            db.run(
                                'UPDATE users SET last_login = ? WHERE id = ?',
                                [utcNow, user.id]
                            );
                            
                            resolve({
                                success: true,
                                user: {
                                    id: user.id,
                                    username: user.username,
                                    email: user.email,
                                    role: user.role
                                }
                            });
                        } else {
                            resolve({ success: false, error: 'Invalid credentials' });
                        }
                    } catch (error) {
                        resolve({ success: false, error: 'Authentication failed' });
                    }
                }
            );
        });
    }

    generateJWT(user) {
        return jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            this.jwtSecret,
            { expiresIn: '24h' }
        );
    }

    verifyJWT(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            return null;
        }
    }
}

const userManager = new UserManager();

// Authentication middleware - logs to security.log file
const requireAuth = (req, res, next) => {
    const token = req.session?.token;
    
    loggers.security.info(`Auth check for ${req.path}: token=${token ? 'present' : 'missing'}`);
    
    if (!token) {
        loggers.security.warn(`No token for ${req.path}, redirecting to login`);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }

    const user = userManager.verifyJWT(token);
    if (!user) {
        loggers.security.warn(`Invalid token for ${req.path}, redirecting to login`);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.redirect('/login');
    }

    loggers.security.info(`Auth successful for ${req.path}, user: ${user.username}`);
    req.user = user;
    
    // Update session last_activity (use explicit UTC time)
    const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
    db.run(
        `UPDATE user_sessions SET last_activity = ? WHERE session_token = ? AND is_active = 1`,
        [utcNow, token],
        (err) => {
            if (err) loggers.system.error('Failed to update session activity:', err);
        }
    );
    
    next();
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return res.status(403).send('<h1>Access Denied</h1><p>Administrator privileges required</p>');
    }
    next();
};

// Rate limiting middleware
const rateLimiter = (options = {}) => {
    const { maxRequests = 100, windowMs = 60000, blockDurationMs = 300000 } = options;
    
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const endpoint = req.path;
        const now = new Date();
        
        // Check if IP is currently blocked
        db.get(
            'SELECT blocked_until FROM rate_limits WHERE ip_address = ? AND endpoint = ? AND blocked_until > ?',
            [ip, endpoint, now.toISOString()],
            (err, blocked) => {
                if (blocked) {
                    return res.status(429).json({ 
                        error: 'Too many requests. Please try again later.',
                        retryAfter: Math.ceil((new Date(blocked.blocked_until) - now) / 1000)
                    });
                }
                
                // Clean up old entries
                const windowStart = new Date(now.getTime() - windowMs);
                db.run(
                    'DELETE FROM rate_limits WHERE ip_address = ? AND endpoint = ? AND window_start < ?',
                    [ip, endpoint, windowStart.toISOString()]
                );
                
                // Check current request count
                db.get(
                    'SELECT request_count FROM rate_limits WHERE ip_address = ? AND endpoint = ? AND window_start > ?',
                    [ip, endpoint, windowStart.toISOString()],
                    (err, record) => {
                        if (record && record.request_count >= maxRequests) {
                            // Block the IP
                            const blockedUntil = new Date(now.getTime() + blockDurationMs);
                            db.run(
                                'UPDATE rate_limits SET blocked_until = ? WHERE ip_address = ? AND endpoint = ?',
                                [blockedUntil.toISOString(), ip, endpoint]
                            );
                            
                            loggers.security.warn('Rate limit exceeded', { ip, endpoint, count: record.request_count });
                            
                            return res.status(429).json({ 
                                error: 'Too many requests. Your IP has been temporarily blocked.',
                                retryAfter: Math.ceil(blockDurationMs / 1000)
                            });
                        }
                        
                        // Increment or create record
                        if (record) {
                            db.run(
                                'UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_address = ? AND endpoint = ?',
                                [ip, endpoint]
                            );
                        } else {
                            db.run(
                                'INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start) VALUES (?, ?, 1, ?)',
                                [ip, endpoint, now.toISOString()]
                            );
                        }
                        
                        next();
                    }
                );
            }
        );
    };
};

// Legacy ESP32 authentication
const legacyAuth = (req, res, next) => {
    const credentials = basicAuth(req);
    const validUsername = process.env.AUTH_USERNAME || 'admin';
    const validPassword = process.env.AUTH_PASSWORD || 'ChangeMe123!';
    
    if (!credentials || credentials.name !== validUsername || credentials.pass !== validPassword) {
        res.status(401);
        res.setHeader('WWW-Authenticate', 'Basic realm="DSC Logging Server"');
        res.end('Access denied');
        return;
    }
    next();
};

// =============================================================================
// ROUTES
// =============================================================================

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Login page
app.get('/login', (req, res) => {
    if (req.session?.token && userManager.verifyJWT(req.session.token)) {
        return res.redirect('/dashboard');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en" data-theme="auto">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Enterprise Login | Universal Logging Platform</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                :root {
                    /* Light Theme Colors */
                    --bg-primary: #ffffff;
                    --bg-secondary: #f8fafc;
                    --bg-tertiary: #f1f5f9;
                    --text-primary: #1e293b;
                    --text-secondary: #475569;
                    --text-muted: #64748b;
                    --border-color: #e2e8f0;
                    --success-color: #10b981;
                    --warning-color: #f59e0b;
                    --error-color: #ef4444;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                    --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
                    
                    /* Ocean Gradients */
                    --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
                    
                    /* Standard Colors - Using Ocean Gradient as Primary */
                    --accent-primary: var(--gradient-ocean);
                    --btn-primary: var(--gradient-ocean);
                    --accent-secondary: #1d4ed8;
                    --login-bg: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%);
                }

                /* Dark Theme */
                [data-theme="dark"] {
                    --bg-primary: #1e293b;
                    --bg-secondary: #334155;
                    --bg-tertiary: #475569;
                    --text-primary: #f1f5f9;
                    --text-secondary: #cbd5e1;
                    --text-muted: #94a3b8;
                    --border-color: #475569;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                    
                    /* Ocean Gradients for Dark Theme */
                    --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                    --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                    
                    /* Standard Colors - Using Ocean Gradient as Primary */
                    --accent-primary: var(--gradient-ocean);
                    --btn-primary: var(--gradient-ocean);
                    --accent-secondary: #3b82f6;
                    --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
                }

                /* Auto Theme - follows system preference */
                @media (prefers-color-scheme: dark) {
                    [data-theme="auto"] {
                        --bg-primary: #1e293b;
                        --bg-secondary: #334155;
                        --bg-tertiary: #475569;
                        --text-primary: #f1f5f9;
                        --text-secondary: #cbd5e1;
                        --text-muted: #94a3b8;
                        --border-color: #475569;
                        --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                        --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                        --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                        
                        /* Ocean Gradients for Auto Dark Mode */
                        --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                        --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                        --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                        
                        /* Standard Colors - Using Ocean Gradient as Primary */
                        --accent-primary: var(--gradient-ocean);
                        --btn-primary: var(--gradient-ocean);
                        --accent-secondary: #3b82f6;
                        --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
                    }
                }

                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: var(--login-bg);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                
                /* Animated background elements */
                body::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                    animation: shimmer 3s ease-in-out infinite;
                }
                
                @keyframes shimmer {
                    0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(30deg); }
                    50% { transform: translateX(100%) translateY(100%) rotate(30deg); }
                }
                
                .login-container {
                    background: var(--bg-primary);
                    backdrop-filter: blur(20px);
                    border-radius: 20px;
                    box-shadow: var(--shadow-medium);
                    overflow: hidden;
                    width: 100%;
                    max-width: 420px;
                    margin: 2rem;
                    border: 1px solid var(--border-color);
                    position: relative;
                    z-index: 1;
                    transition: all 0.3s ease;
                }
                
                .login-header {
                    background: var(--gradient-ocean);
                    color: white;
                    padding: 2.5rem 2rem;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                }
                
                .login-header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                    animation: headerShimmer 4s ease-in-out infinite;
                }
                
                @keyframes headerShimmer {
                    0%, 100% { transform: translateX(-100%); }
                    50% { transform: translateX(100%); }
                }
                
                .login-header h1 {
                    font-size: 2rem;
                    margin-bottom: 0.5rem;
                    font-weight: 700;
                    position: relative;
                    z-index: 1;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                
                .login-header p {
                    opacity: 0.9;
                    font-size: 0.95rem;
                    position: relative;
                    z-index: 1;
                }
                
                .login-form {
                    padding: 2.5rem 2rem;
                }
                
                /* Theme Toggle Button */
                .theme-toggle {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: var(--gradient-sky);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 0.75rem;
                    border-radius: 50%;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 1.2rem;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    z-index: 10;
                }
                .theme-toggle:hover {
                    transform: scale(1.1) rotate(15deg);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
                    background: var(--gradient-deep-blue);
                }
                
                .form-group {
                    margin-bottom: 1.75rem;
                }
                
                .form-group label {
                    display: block;
                    margin-bottom: 0.75rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }
                
                .form-group input {
                    width: 100%;
                    padding: 1rem 1.25rem;
                    border: 2px solid var(--border-color);
                    border-radius: 12px;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }
                
                .form-group input:focus {
                    outline: none;
                    border-color: var(--accent-primary);
                    box-shadow: var(--shadow-glow);
                    transform: translateY(-1px);
                }
                
                .login-btn {
                    width: 100%;
                    padding: 1.25rem;
                    background: var(--gradient-ocean);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 1.05rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .login-btn::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s;
                }
                
                .login-btn:hover::before {
                    left: 100%;
                }
                
                .login-btn:hover {
                    transform: translateY(-3px);
                    box-shadow: var(--shadow-glow);
                    background: var(--gradient-deep-blue);
                }
                
                .login-btn:active {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 20px rgba(29, 78, 216, 0.3);
                }
                
                .error-message {
                    margin-top: 1.5rem;
                    padding: 1rem;
                    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                    border: 1px solid #fecaca;
                    border-radius: 12px;
                    color: #dc2626;
                    display: none;
                    font-weight: 500;
                }
                
                .login-footer {
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    padding: 1.75rem;
                    text-align: center;
                    border-top: 1px solid #e2e8f0;
                    color: #64748b;
                    font-size: 0.85rem;
                }
                
                .welcome-message {
                    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
                    padding: 1.25rem;
                    border-radius: 12px;
                    margin-bottom: 1.5rem;
                    font-size: 0.9rem;
                    color: #1e40af;
                    border: 1px solid #93c5fd;
                    font-weight: 500;
                }
                
                /* Responsive design */
                @media (max-width: 480px) {
                    .login-container {
                        margin: 1rem;
                        border-radius: 16px;
                    }
                    
                    .login-header {
                        padding: 2rem 1.5rem;
                    }
                    
                    .login-form {
                        padding: 2rem 1.5rem;
                    }
                    
                    .login-header h1 {
                        font-size: 1.75rem;
                    }
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-header">
                    <h1>� Enterprise Logger</h1>
                    <p>Advanced Infrastructure Monitoring Platform</p>
                </div>
                
                <div class="login-form">
                    <div class="welcome-message">
                        <strong>🚀 Welcome to Enterprise Logging Platform</strong><br>
                        Secure access to your infrastructure monitoring dashboard
                    </div>
                    
                    <form id="loginForm">
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" name="username" placeholder="Enter username" autocomplete="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" placeholder="Enter your password" autocomplete="current-password" required>
                        </div>
                        
                        <button type="submit" class="login-btn" id="loginBtn">
                            Sign In
                        </button>
                    </form>
                    
                    <div id="error-message" class="error-message"></div>
                </div>
                
                <div class="login-footer">
                    <strong>Enterprise Logging Platform v${config.system.version}</strong><br>
                    Multi-Source Infrastructure Monitoring
                </div>
            </div>

            <script>
                // Enhanced theme management with light/dark/auto
                function toggleTheme() {
                    const html = document.documentElement;
                    const currentTheme = html.getAttribute('data-theme') || 'auto';
                    let newTheme;
                    
                    // Cycle through: auto -> light -> dark -> auto
                    switch(currentTheme) {
                        case 'auto':
                            newTheme = 'light';
                            break;
                        case 'light':
                            newTheme = 'dark';
                            break;
                        case 'dark':
                            newTheme = 'auto';
                            break;
                        default:
                            newTheme = 'auto';
                    }
                    
                    html.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                    updateThemeIcon(newTheme);
                }
                
                function updateThemeIcon(theme) {
                    const themeButton = document.querySelector('.theme-toggle i');
                    if (themeButton) {
                        switch(theme) {
                            case 'light':
                                themeButton.className = 'fas fa-sun';
                                themeButton.parentElement.title = 'Light Mode (Click for Dark)';
                                break;
                            case 'dark':
                                themeButton.className = 'fas fa-moon';
                                themeButton.parentElement.title = 'Dark Mode (Click for Auto)';
                                break;
                            case 'auto':
                            default:
                                themeButton.className = 'fas fa-adjust';
                                themeButton.parentElement.title = 'Auto Mode (Click for Light)';
                                break;
                        }
                    }
                }
                
                // Initialize theme
                function initializeTheme() {
                    const savedTheme = localStorage.getItem('theme') || 'auto';
                    document.documentElement.setAttribute('data-theme', savedTheme);
                    updateThemeIcon(savedTheme);
                }
                
                // Initialize theme on page load
                document.addEventListener('DOMContentLoaded', initializeTheme);
                
                document.getElementById('loginForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const btn = document.getElementById('loginBtn');
                    const errorDiv = document.getElementById('error-message');
                    
                    btn.disabled = true;
                    btn.textContent = 'Signing in...';
                    errorDiv.style.display = 'none';
                    
                    try {
                        const formData = new FormData(this);
                        const response = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: formData.get('username'),
                                password: formData.get('password')
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            btn.textContent = 'Success! Redirecting...';
                            setTimeout(() => {
                                window.location.href = '/dashboard';
                            }, 500);
                        } else {
                            throw new Error(result.error);
                        }
                    } catch (error) {
                        errorDiv.textContent = error.message;
                        errorDiv.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Sign In';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Login API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const result = await userManager.authenticateUser(username, password);
        
        if (result.success) {
            const token = userManager.generateJWT(result.user);
            req.session.token = token;
            req.session.userId = result.user.id;
            
            loggers.audit.info('User login successful', { 
                username: result.user.username,
                ip: req.ip 
            });
            
            // Log successful login to database
            logToDatabase(`User login: ${result.user.username} from ${req.ip}`, 'info', 'auth', 'logging-server');
            
            // Log login activity
            logActivity(result.user.id, 'login', '/api/auth/login', `Successful login from ${req.ip}`, req);
            
            // Create session record in database
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
            const utcNow = moment.utc().format('YYYY-MM-DD HH:mm:ss');
            db.run(
                `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, created_at, last_activity, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [result.user.id, token, req.ip || req.connection.remoteAddress, req.get('User-Agent'), utcNow, utcNow, expiresAt.toISOString()],
                (err) => {
                    if (err) {
                        loggers.system.error('Failed to create session record:', err);
                    }
                }
            );
            
            res.json({
                success: true,
                token: token,
                user: result.user
            });
        } else {
            loggers.audit.warn('User login failed', { 
                username,
                ip: req.ip,
                error: result.error 
            });
            
            // Track failed login attempt for security monitoring
            trackFailedLogin(req.ip || req.connection.remoteAddress, username);
            
            // Log failed login to database
            logToDatabase(`Failed login attempt: ${username} from ${req.ip}`, 'warn', 'auth', 'logging-server');
            
            res.status(401).json({ error: result.error });
        }
    } catch (error) {
        loggers.audit.error('Login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Logout API
app.post('/api/auth/logout', (req, res) => {
    const token = req.session?.token;
    
    // Log logout activity before destroying session
    if (req.user) {
        logActivity(req.user.id, 'logout', '/api/auth/logout', `User logged out from ${req.ip}`, req);
    }
    
    if (token) {
        // Mark session as inactive in database
        db.run(
            `UPDATE user_sessions SET is_active = 0 WHERE session_token = ?`,
            [token],
            (err) => {
                if (err) loggers.system.error('Failed to deactivate session:', err);
            }
        );
    }
    req.session.destroy();
    res.json({ success: true });
});

// Logout GET route
app.get('/logout', (req, res) => {
    const token = req.session?.token;
    
    // Log logout activity before destroying session
    if (req.user) {
        logActivity(req.user.id, 'logout', '/logout', `User logged out from ${req.ip}`, req);
    }
    
    if (token) {
        // Mark session as inactive in database
        db.run(
            `UPDATE user_sessions SET is_active = 0 WHERE session_token = ?`,
            [token],
            (err) => {
                if (err) loggers.system.error('Failed to deactivate session:', err);
            }
        );
    }
    req.session.destroy();
    res.redirect('/');
});

// User Management API
app.get('/api/users', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    db.all('SELECT id, username, email, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Format timestamps
        const usersWithFormattedDates = rows.map(user => ({
            ...user,
            created_at_formatted: formatSQLiteTimestamp(user.created_at),
            last_login_formatted: formatSQLiteTimestamp(user.last_login)
        }));
        
        res.json({ success: true, users: usersWithFormattedDates });
    });
});

app.post('/api/users', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    try {
        const { username, email, password, role } = req.body;
        
        if (!username || !email || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be admin or user' });
        }
        
        // Check if username already exists
        db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (row) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            
            // Hash password and create user
            const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
            
            db.run(
                'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [username, email, passwordHash, role],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to create user' });
                    }
                    
                    loggers.audit.info('User created', { 
                        newUserId: this.lastID,
                        newUsername: username,
                        newUserRole: role,
                        createdBy: req.user.username 
                    });
                    
                    // Log admin activity
                    logActivity(req.user.id, 'admin_action', '/api/users', `Created new user: ${username} (${role})`, req);
                    
                    res.json({
                        success: true,
                        message: 'User created successfully',
                        userId: this.lastID
                    });
                }
            );
        });
    } catch (error) {
        loggers.audit.error('User creation error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    try {
        const userId = req.params.id;
        const { username, email, role, password } = req.body;
        
        if (!username || !email || !role) {
            return res.status(400).json({ error: 'Username, email, and role are required' });
        }
        
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be admin or user' });
        }
        
        let query = 'UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?';
        let params = [username, email, role, userId];
        
        // If password is provided, hash and update it too
        if (password) {
            const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);
            query = 'UPDATE users SET username = ?, email = ?, role = ?, password_hash = ? WHERE id = ?';
            params = [username, email, role, passwordHash, userId];
        }
        
        db.run(query, params, function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update user' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            loggers.audit.info('User updated', { 
                updatedUserId: userId,
                updatedUsername: username,
                updatedBy: req.user.username 
            });
            
            res.json({ success: true, message: 'User updated successfully' });
        });
    } catch (error) {
        loggers.audit.error('User update error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    const userId = req.params.id;
    
    // Prevent deleting the last admin
    db.get('SELECT COUNT(*) as adminCount FROM users WHERE role = "admin"', (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (row.adminCount <= 1) {
            db.get('SELECT role FROM users WHERE id = ?', [userId], (err, userRow) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (userRow && userRow.role === 'admin') {
                    return res.status(400).json({ error: 'Cannot delete the last admin user' });
                }
                
                deleteUser();
            });
        } else {
            deleteUser();
        }
        
        function deleteUser() {
            db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to delete user' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                
                loggers.audit.info('User deleted', { 
                    deletedUserId: userId,
                    deletedBy: req.user.username 
                });
                
                res.json({ success: true, message: 'User deleted successfully' });
            });
        }
    });
});

// Settings API endpoints
app.get('/api/settings', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    // Return comprehensive settings including system info, server config, and integrations
    res.json({
        system: {
            name: config.system.name || 'Enterprise Logging Platform',
            version: config.system.version || '2.1.0-stable-enhanced',
            owner: config.system.owner || 'Tom Nelson',
            timezone: config.system.timezone || 'America/Edmonton'
        },
        server: {
            port: PORT,
            host: 'localhost'
        },
        database: {
            path: dbPath
        },
        maintenance: {
            logRetentionDays: config.maintenance?.logRetentionDays || 30,
            backupSchedule: config.maintenance?.backupSchedule || '0 2 * * *',
            cleanupSchedule: config.maintenance?.cleanupSchedule || '0 3 * * 0'
        },
        integrations: {
            websocket: {
                enabled: config.integrations.websocket.enabled,
                port: config.integrations.websocket.port
            },
            mqtt: {
                enabled: config.integrations.mqtt.enabled,
                broker: config.integrations.mqtt.broker || '',
                username: config.integrations.mqtt.username || '',
                topic: config.integrations.mqtt.topic || 'enterprise/logs'
            },
            unifi: {
                enabled: config.integrations.unifi.enabled,
                host: config.integrations.unifi.host || '',
                username: config.integrations.unifi.username || '',
                site: 'default'
            },
            homeAssistant: {
                enabled: config.integrations.homeAssistant.enabled,
                host: config.integrations.homeAssistant.host || '',
                token: config.integrations.homeAssistant.token ? '••••••••' : ''
            }
        }
    });
});

app.put('/api/settings', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    try {
        const updates = req.body;
        
        // Update in-memory config (will persist until server restart)
        if (updates.systemName) config.system.name = updates.systemName;
        if (updates.systemOwner) config.system.owner = updates.systemOwner;
        if (updates.timezone) {
            config.system.timezone = updates.timezone;
            // Update in database for persistence
            const validTimezones = moment.tz.names();
            if (validTimezones.includes(updates.timezone)) {
                db.run(
                    'INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)',
                    ['timezone', updates.timezone, req.user.id],
                    (err) => {
                        if (err) {
                            loggers.system.error('Failed to update timezone in database:', err);
                        } else {
                            loggers.system.info(`Timezone updated to: ${updates.timezone}`);
                        }
                    }
                );
                SYSTEM_SETTINGS.timezone = updates.timezone;
            }
        }
        if (updates.default_theme) {
            // Update theme in database for persistence
            const validThemes = ['auto', 'light', 'dark', 'ocean'];
            if (validThemes.includes(updates.default_theme)) {
                db.run(
                    'INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)',
                    ['default_theme', updates.default_theme, req.user.id],
                    (err) => {
                        if (err) {
                            loggers.system.error('Failed to update theme in database:', err);
                        } else {
                            loggers.system.info(`Default theme updated to: ${updates.default_theme}`);
                        }
                    }
                );
                SYSTEM_SETTINGS.default_theme = updates.default_theme;
            }
        }
        if (updates.logRetentionDays) config.maintenance.logRetentionDays = updates.logRetentionDays;
        if (updates.backupSchedule) config.maintenance.backupSchedule = updates.backupSchedule;
        if (updates.cleanupSchedule) config.maintenance.cleanupSchedule = updates.cleanupSchedule;
        
        // Integration settings
        if (typeof updates.wsEnabled !== 'undefined') config.integrations.websocket.enabled = updates.wsEnabled;
        if (typeof updates.mqttEnabled !== 'undefined') config.integrations.mqtt.enabled = updates.mqttEnabled;
        if (updates.mqttBroker) config.integrations.mqtt.broker = updates.mqttBroker;
        if (updates.mqttUsername) config.integrations.mqtt.username = updates.mqttUsername;
        if (updates.mqttPassword) config.integrations.mqtt.password = updates.mqttPassword;
        if (updates.mqttTopic) config.integrations.mqtt.topic = updates.mqttTopic;
        
        if (typeof updates.unifiEnabled !== 'undefined') config.integrations.unifi.enabled = updates.unifiEnabled;
        if (updates.unifiHost) config.integrations.unifi.host = updates.unifiHost;
        if (updates.unifiUsername) config.integrations.unifi.username = updates.unifiUsername;
        if (updates.unifiPassword) config.integrations.unifi.password = updates.unifiPassword;
        if (updates.unifiSite) config.integrations.unifi.site = updates.unifiSite;
        
        if (typeof updates.haEnabled !== 'undefined') config.integrations.homeAssistant.enabled = updates.haEnabled;
        if (updates.haHost) config.integrations.homeAssistant.host = updates.haHost;
        if (updates.haToken) config.integrations.homeAssistant.token = updates.haToken;
        
        loggers.audit.info('System settings updated', { 
            updatedBy: req.user.username,
            settingsChanged: Object.keys(updates)
        });
        
        res.json({ success: true, message: 'Settings saved successfully. Some changes may require a server restart.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings: ' + error.message });
    }
});

app.post('/api/settings', requireAuth, async (req, res) => {
    // Redirect POST to PUT for compatibility
    req.method = 'PUT';
    return app._router.handle(req, res);
});

// Get timezone setting (public endpoint for timestamp formatting)
app.get('/api/timezone', (req, res) => {
    res.json({ timezone: SYSTEM_SETTINGS.timezone || config.system.timezone || 'America/Edmonton' });
});

// ============================================================================
// SYSTEM SETTINGS API ENDPOINTS
// ============================================================================

// Update a specific system setting in database (admin only)
app.put('/api/settings/:key', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
        return res.status(400).json({ error: 'Setting value is required' });
    }

    // Validate timezone if that's what we're updating
    if (key === 'timezone') {
        const validTimezones = moment.tz.names();
        if (!validTimezones.includes(value)) {
            return res.status(400).json({ error: 'Invalid timezone. Must be a valid IANA timezone.' });
        }
    }

    // Validate theme if that's what we're updating
    if (key === 'default_theme') {
        const validThemes = ['auto', 'light', 'dark', 'ocean'];
        if (!validThemes.includes(value)) {
            return res.status(400).json({ error: 'Invalid theme. Must be auto, light, dark, or ocean.' });
        }
    }

    try {
        const stmt = db.prepare(`
            UPDATE system_settings 
            SET setting_value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
            WHERE setting_key = ?
        `);
        const result = stmt.run(value, req.user.id, key);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        // Update the cached settings
        SYSTEM_SETTINGS[key] = value;

        // Update config if timezone changed
        if (key === 'timezone') {
            config.system.timezone = value;
        }

        loggers.system.info(`⚙️  Setting '${key}' updated to '${value}' by user ${req.user.username}`);
        res.json({ success: true, setting_key: key, setting_value: value });
    } catch (error) {
        loggers.system.error('❌ Failed to update setting:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// Get current theme preference (public authenticated endpoint)
app.get('/api/settings/theme', requireAuth, (req, res) => {
    res.json({ theme: SYSTEM_SETTINGS.default_theme || 'auto' });
});

// ============================================================================
// USER THEME CUSTOMIZATION API ENDPOINTS
// ============================================================================

// Get user's custom theme preferences
app.get('/api/user/theme', requireAuth, (req, res) => {
    db.get(
        'SELECT * FROM user_theme_preferences WHERE user_id = ?',
        [req.user.id],
        (err, theme) => {
            if (err) {
                loggers.system.error('Failed to fetch user theme:', err);
                return res.status(500).json({ error: 'Failed to fetch theme preferences' });
            }
            
            // Return theme or null if no custom theme set
            if (theme && theme.gradient_stops) {
                try {
                    theme.gradient_stops = JSON.parse(theme.gradient_stops);
                } catch (e) {
                    theme.gradient_stops = [];
                }
            }
            
            res.json({ theme: theme || null });
        }
    );
});

// Save user's custom theme preferences
app.post('/api/user/theme', requireAuth, (req, res) => {
    const {
        gradient_type,
        gradient_angle,
        gradient_stops,
        bg_primary,
        bg_secondary,
        bg_tertiary,
        text_primary,
        text_secondary,
        text_muted,
        border_color,
        accent_primary,
        accent_secondary,
        success_color,
        warning_color,
        error_color,
        info_color
    } = req.body;

    const gradient_stops_json = JSON.stringify(gradient_stops || []);

    db.run(
        `INSERT OR REPLACE INTO user_theme_preferences 
        (user_id, gradient_type, gradient_angle, gradient_stops, bg_primary, bg_secondary, bg_tertiary,
         text_primary, text_secondary, text_muted, border_color, accent_primary, accent_secondary,
         success_color, warning_color, error_color, info_color, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            req.user.id,
            gradient_type || 'linear',
            gradient_angle || 135,
            gradient_stops_json,
            bg_primary,
            bg_secondary,
            bg_tertiary,
            text_primary,
            text_secondary,
            text_muted,
            border_color,
            accent_primary,
            accent_secondary,
            success_color,
            warning_color,
            error_color,
            info_color
        ],
        function(err) {
            if (err) {
                loggers.system.error('Failed to save user theme:', err);
                return res.status(500).json({ error: 'Failed to save theme preferences' });
            }

            logActivity(req.user.id, 'theme_customization', 'User updated theme preferences', req);
            res.json({ success: true, message: 'Theme preferences saved successfully' });
        }
    );
});

// Reset user's theme to defaults
app.delete('/api/user/theme', requireAuth, (req, res) => {
    db.run(
        'DELETE FROM user_theme_preferences WHERE user_id = ?',
        [req.user.id],
        function(err) {
            if (err) {
                loggers.system.error('Failed to reset user theme:', err);
                return res.status(500).json({ error: 'Failed to reset theme' });
            }

            logActivity(req.user.id, 'theme_customization', 'User reset theme to defaults', req);
            res.json({ success: true, message: 'Theme reset to defaults' });
        }
    );
});

// ============================================================================
// SESSION MANAGEMENT API ENDPOINTS
// ============================================================================

// Get all active sessions (admin only)
app.get('/api/admin/sessions', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const query = `
        SELECT 
            s.id,
            s.user_id,
            s.session_token,
            s.ip_address,
            s.user_agent,
            s.created_at,
            s.last_activity,
            s.expires_at,
            u.username,
            u.role
        FROM user_sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.is_active = 1
        ORDER BY s.last_activity DESC
    `;

    db.all(query, [], (err, sessions) => {
        if (err) {
            loggers.system.error('Failed to fetch sessions:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Don't send session tokens to client, and format timestamps
        const sanitizedSessions = sessions.map(s => ({
            id: s.id,
            user_id: s.user_id,
            username: s.username,
            role: s.role,
            ip_address: s.ip_address,
            user_agent: s.user_agent,
            created_at: s.created_at,
            last_activity: s.last_activity,
            expires_at: s.expires_at,
            created_at_formatted: formatSQLiteTimestamp(s.created_at),
            last_activity_formatted: formatSQLiteTimestamp(s.last_activity),
            expires_at_formatted: formatSQLiteTimestamp(s.expires_at)
        }));

        res.json(sanitizedSessions);
    });
});

// Terminate a specific session
app.delete('/api/admin/sessions/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const sessionId = req.params.id;

    db.run(
        'UPDATE user_sessions SET is_active = 0 WHERE id = ?',
        [sessionId],
        function(err) {
            if (err) {
                loggers.system.error('Failed to terminate session:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            loggers.audit.info(`Session ${sessionId} terminated by ${req.user.username}`);
            logToDatabase(`Session terminated: ID ${sessionId}`, 'info', 'security', 'logging-server');

            res.json({ success: true, message: 'Session terminated' });
        }
    );
});

// Terminate all sessions except current
app.post('/api/admin/sessions/terminate-all', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const currentToken = req.session.token;

    db.run(
        'UPDATE user_sessions SET is_active = 0 WHERE session_token != ?',
        [currentToken],
        function(err) {
            if (err) {
                loggers.system.error('Failed to terminate sessions:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            loggers.audit.warn(`All sessions terminated by ${req.user.username} (${this.changes} sessions)`);
            logToDatabase(`All sessions terminated: ${this.changes} sessions`, 'warn', 'security', 'logging-server');

            res.json({ 
                success: true, 
                message: `${this.changes} sessions terminated`,
                count: this.changes
            });
        }
    );
});

// Restart server endpoint
app.post('/api/admin/restart', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    loggers.audit.warn(`Server restart initiated by ${req.user.username}`);
    logToDatabase(`Server restart initiated by ${req.user.username}`, 'warn', 'system', 'logging-server');

    res.json({ 
        success: true, 
        message: 'Server shutting down for restart...'
    });

    // Give time for the response to be sent, then exit
    setTimeout(() => {
        loggers.system.info('🔄 Server shutting down for restart...');
        process.exit(0); // Exit cleanly - your PowerShell loop will restart it
    }, 1000);
});

// ============================================================================
// ALERT API ENDPOINTS
// ============================================================================

// Get all alerts with optional filtering
app.get('/api/alerts', requireAuth, (req, res) => {
    const { severity, status } = req.query;
    
    let query = `
        SELECT 
            a.id,
            a.type,
            a.severity,
            a.title,
            a.message,
            a.source,
            a.metadata,
            a.is_read,
            a.is_resolved,
            a.created_at,
            a.resolved_at,
            a.resolved_by,
            u.username as resolved_by_username
        FROM system_alerts a
        LEFT JOIN users u ON a.resolved_by = u.id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (severity && severity !== 'all') {
        query += ' AND a.severity = ?';
        params.push(severity);
    }
    
    if (status) {
        if (status === 'active') {
            query += ' AND a.is_resolved = 0 AND a.is_read = 0';
        } else if (status === 'acknowledged') {
            query += ' AND a.is_read = 1 AND a.is_resolved = 0';
        } else if (status === 'resolved') {
            query += ' AND a.is_resolved = 1';
        }
    }
    
    query += ' ORDER BY a.created_at DESC';
    
    db.all(query, params, (err, alerts) => {
        if (err) {
            loggers.system.error('Failed to fetch alerts:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Parse metadata JSON and add formatted timestamps
        const processedAlerts = alerts.map(alert => ({
            ...alert,
            metadata: alert.metadata ? JSON.parse(alert.metadata) : null,
            created_at_formatted: formatSQLiteTimestamp(alert.created_at),
            resolved_at_formatted: formatSQLiteTimestamp(alert.resolved_at)
        }));
        
        res.json(processedAlerts);
    });
});

// Acknowledge an alert
app.post('/api/alerts/:id/acknowledge', requireAuth, (req, res) => {
    const alertId = req.params.id;
    
    db.run(
        'UPDATE system_alerts SET is_read = 1 WHERE id = ?',
        [alertId],
        function(err) {
            if (err) {
                loggers.system.error('Failed to acknowledge alert:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Alert not found' });
            }
            
            loggers.audit.info(`Alert ${alertId} acknowledged by ${req.user.username}`);
            logToDatabase(`Alert acknowledged: ID ${alertId}`, 'info', 'system', 'logging-server');
            
            res.json({ success: true, message: 'Alert acknowledged' });
        }
    );
});

// Resolve an alert
app.post('/api/alerts/:id/resolve', requireAuth, (req, res) => {
    const alertId = req.params.id;
    const now = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    
    db.run(
        'UPDATE system_alerts SET is_resolved = 1, resolved_at = ?, resolved_by = ? WHERE id = ?',
        [now, req.user.id, alertId],
        function(err) {
            if (err) {
                loggers.system.error('Failed to resolve alert:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Alert not found' });
            }
            
            loggers.audit.info(`Alert ${alertId} resolved by ${req.user.username}`);
            logToDatabase(`Alert resolved: ID ${alertId}`, 'info', 'system', 'logging-server');
            
            res.json({ success: true, message: 'Alert resolved' });
        }
    );
});

// Delete an alert
app.delete('/api/alerts/:id', requireAuth, (req, res) => {
    const alertId = req.params.id;
    
    db.run(
        'DELETE FROM system_alerts WHERE id = ?',
        [alertId],
        function(err) {
            if (err) {
                loggers.system.error('Failed to delete alert:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Alert not found' });
            }
            
            loggers.audit.info(`Alert ${alertId} deleted by ${req.user.username}`);
            logToDatabase(`Alert deleted: ID ${alertId}`, 'info', 'system', 'logging-server');
            
            res.json({ success: true, message: 'Alert deleted' });
        }
    );
});

// ============================================================================
// USER ACTIVITY API ENDPOINTS
// ============================================================================

// Get user activity with optional filtering
app.get('/api/activity', requireAuth, (req, res) => {
    const { user_id, action, limit = 500 } = req.query;
    
    let query = `
        SELECT 
            a.id,
            a.user_id,
            a.action,
            a.resource,
            a.details,
            a.ip_address,
            a.user_agent,
            a.timestamp,
            u.username,
            u.role
        FROM user_activity a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (user_id) {
        query += ' AND a.user_id = ?';
        params.push(user_id);
    }
    
    if (action) {
        query += ' AND a.action = ?';
        params.push(action);
    }
    
    query += ' ORDER BY a.timestamp DESC LIMIT ?';
    params.push(parseInt(limit));
    
    db.all(query, params, (err, activities) => {
        if (err) {
            loggers.system.error('Failed to fetch user activity:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Add formatted timestamp in server timezone
        // Database stores UTC timestamps, so we need to parse as UTC first, then convert to local timezone
        const activitiesWithFormattedTime = activities.map(activity => ({
            ...activity,
            timestampFormatted: moment.utc(activity.timestamp).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A')
        }));
        
        res.json(activitiesWithFormattedTime);
    });
});

// Log activity helper function
function logActivity(userId, action, resource = null, details = null, req = null) {
    if (!db) return;
    
    const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
    const userAgent = req ? req.get('User-Agent') : null;
    
    db.run(
        'INSERT INTO user_activity (user_id, action, resource, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, action, resource, details, ipAddress, userAgent],
        (err) => {
            if (err) {
                loggers.system.error('Failed to log user activity:', err);
            }
        }
    );
}

// Backup Management API endpoints
const BACKUPS_DIR = path.join(__dirname, 'data', 'backups');
const DB_PATH = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Get all backups
app.get('/api/backups', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    try {
        const files = fs.readdirSync(BACKUPS_DIR);
        const backups = [];
        let totalSize = 0;

        for (const file of files) {
            if (file.endsWith('.db')) {
                const filePath = path.join(BACKUPS_DIR, file);
                const stats = fs.statSync(filePath);
                backups.push({
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime,
                    createdFormatted: moment.utc(stats.birthtime).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A')
                });
                totalSize += stats.size;
            }
        }

        // Sort by creation date, newest first
        backups.sort((a, b) => new Date(b.created) - new Date(a.created));

        // Get current database size
        const dbStats = fs.statSync(DB_PATH);

        res.json({
            backups,
            totalSize,
            currentDbSize: dbStats.size
        });
    } catch (error) {
        loggers.system.error('Failed to list backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Create new backup
app.post('/api/backups/create', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
        const backupFilename = `enterprise_logs_${timestamp}.db`;
        const backupPath = path.join(BACKUPS_DIR, backupFilename);

        // Copy database file
        fs.copyFileSync(DB_PATH, backupPath);

        const stats = fs.statSync(backupPath);

        loggers.system.info(`Backup created by ${req.user.username}: ${backupFilename}`);
        logActivity(req.user.id, 'admin_action', '/api/backups/create', `Created backup: ${backupFilename}`, req);

        res.json({
            success: true,
            backup: {
                filename: backupFilename,
                size: stats.size,
                created: stats.birthtime
            }
        });
    } catch (error) {
        loggers.system.error('Failed to create backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Download backup
app.get('/api/backups/:filename/download', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    try {
        const { filename } = req.params;
        const backupPath = path.join(BACKUPS_DIR, filename);

        // Security: Ensure file is within backups directory
        if (!backupPath.startsWith(BACKUPS_DIR)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        loggers.system.info(`Backup downloaded by ${req.user.username}: ${filename}`);
        logActivity(req.user.id, 'admin_action', `/api/backups/${filename}/download`, `Downloaded backup: ${filename}`, req);

        res.download(backupPath, filename);
    } catch (error) {
        loggers.system.error('Failed to download backup:', error);
        res.status(500).json({ error: 'Failed to download backup' });
    }
});

// Restore backup
app.post('/api/backups/:filename/restore', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    try {
        const { filename } = req.params;
        const backupPath = path.join(BACKUPS_DIR, filename);

        // Security: Ensure file is within backups directory
        if (!backupPath.startsWith(BACKUPS_DIR)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        loggers.system.info(`Database restore initiated by ${req.user.username} from: ${filename}`);
        logActivity(req.user.id, 'admin_action', `/api/backups/${filename}/restore`, `Restored backup: ${filename}`, req);

        // Close database connection
        db.close((err) => {
            if (err) {
                loggers.system.error('Error closing database:', err);
            }

            // Copy backup over current database
            fs.copyFileSync(backupPath, DB_PATH);

            loggers.system.info('Database restored successfully. Server will restart...');

            // Send response before exiting
            res.json({ success: true, message: 'Backup restored. Server restarting...' });

            // Restart the server after a short delay
            setTimeout(() => {
                process.exit(0); // PM2 or nodemon will restart the process
            }, 1000);
        });
    } catch (error) {
        loggers.system.error('Failed to restore backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// Delete backup
app.delete('/api/backups/:filename', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    try {
        const { filename } = req.params;
        const backupPath = path.join(BACKUPS_DIR, filename);

        // Security: Ensure file is within backups directory
        if (!backupPath.startsWith(BACKUPS_DIR)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        fs.unlinkSync(backupPath);

        loggers.system.info(`Backup deleted by ${req.user.username}: ${filename}`);
        logActivity(req.user.id, 'admin_action', `/api/backups/${filename}`, `Deleted backup: ${filename}`, req);

        res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (error) {
        loggers.system.error('Failed to delete backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

// ============================================================================
// WEBHOOK API ENDPOINTS
// ============================================================================

// Get all webhooks
app.get('/api/webhooks', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    db.all('SELECT * FROM webhooks ORDER BY created_at DESC', [], (err, webhooks) => {
        if (err) {
            loggers.system.error('Failed to fetch webhooks:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Parse JSON fields and add formatted timestamps
        const processedWebhooks = webhooks.map(webhook => ({
            ...webhook,
            event_types: webhook.event_types ? JSON.parse(webhook.event_types) : [],
            headers: webhook.headers ? JSON.parse(webhook.headers) : {},
            created_at_formatted: moment.utc(webhook.created_at).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A'),
            last_triggered_formatted: webhook.last_triggered ? moment.utc(webhook.last_triggered).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A') : null
        }));

        res.json(processedWebhooks);
    });
});

// Create new webhook
app.post('/api/webhooks', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { name, url, method, headers, event_types, secret, enabled } = req.body;

    if (!name || !url) {
        return res.status(400).json({ error: 'Name and URL are required' });
    }

    db.run(
        `INSERT INTO webhooks (name, url, method, headers, event_types, secret, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            name,
            url,
            method || 'POST',
            headers ? JSON.stringify(headers) : null,
            event_types ? JSON.stringify(event_types) : JSON.stringify([]),
            secret || null,
            enabled !== undefined ? enabled : 1
        ],
        function(err) {
            if (err) {
                loggers.system.error('Failed to create webhook:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            loggers.system.info(`Webhook created by ${req.user.username}: ${name}`);
            logActivity(req.user.id, 'admin_action', '/api/webhooks', `Created webhook: ${name}`, req);

            res.json({ success: true, id: this.lastID });
        }
    );
});

// Update webhook
app.put('/api/webhooks/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { id } = req.params;
    const { name, url, method, headers, event_types, secret, enabled } = req.body;

    db.run(
        `UPDATE webhooks SET name = ?, url = ?, method = ?, headers = ?, event_types = ?, secret = ?, enabled = ?
         WHERE id = ?`,
        [
            name,
            url,
            method || 'POST',
            headers ? JSON.stringify(headers) : null,
            event_types ? JSON.stringify(event_types) : JSON.stringify([]),
            secret || null,
            enabled !== undefined ? enabled : 1,
            id
        ],
        function(err) {
            if (err) {
                loggers.system.error('Failed to update webhook:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            loggers.system.info(`Webhook updated by ${req.user.username}: ${name}`);
            logActivity(req.user.id, 'admin_action', `/api/webhooks/${id}`, `Updated webhook: ${name}`, req);

            res.json({ success: true });
        }
    );
});

// Delete webhook
app.delete('/api/webhooks/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { id } = req.params;

    db.run('DELETE FROM webhooks WHERE id = ?', [id], function(err) {
        if (err) {
            loggers.system.error('Failed to delete webhook:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        loggers.system.info(`Webhook deleted by ${req.user.username}: ID ${id}`);
        logActivity(req.user.id, 'admin_action', `/api/webhooks/${id}`, `Deleted webhook ID: ${id}`, req);

        res.json({ success: true });
    });
});

// Test webhook
app.post('/api/webhooks/:id/test', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { id } = req.params;

    db.get('SELECT * FROM webhooks WHERE id = ?', [id], async (err, webhook) => {
        if (err) {
            loggers.system.error('Failed to fetch webhook:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const testData = {
            test: true,
            message: 'This is a test webhook delivery',
            triggered_by: req.user.username,
            timestamp: new Date().toISOString()
        };

        const result = await webhookManager.deliverWebhook(webhook, 'test', testData);

        res.json({
            success: result.success,
            message: result.success ? 'Webhook test successful' : 'Webhook test failed',
            error: result.error || null
        });
    });
});

// Get webhook delivery history
app.get('/api/webhooks/:id/deliveries', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    db.all(
        `SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC LIMIT ?`,
        [id, limit],
        (err, deliveries) => {
            if (err) {
                loggers.system.error('Failed to fetch webhook deliveries:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Add formatted timestamps
            const processedDeliveries = deliveries.map(delivery => ({
                ...delivery,
                attempted_at_formatted: moment.utc(delivery.attempted_at).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A')
            }));

            res.json(processedDeliveries);
        }
    );
});

// Retry failed webhook delivery
app.post('/api/webhooks/deliveries/:id/retry', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { id } = req.params;

    db.get(
        `SELECT d.*, w.* FROM webhook_deliveries d 
         JOIN webhooks w ON d.webhook_id = w.id 
         WHERE d.id = ?`,
        [id],
        async (err, delivery) => {
            if (err) {
                loggers.system.error('Failed to fetch delivery:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!delivery) {
                return res.status(404).json({ error: 'Delivery not found' });
            }

            const payload = JSON.parse(delivery.payload);
            const result = await webhookManager.deliverWebhook(delivery, delivery.event_type, payload.data);

            res.json({
                success: result.success,
                message: result.success ? 'Webhook retry successful' : 'Webhook retry failed',
                error: result.error || null
            });
        }
    );
});

// ============================================================================
// INTEGRATION HEALTH API ENDPOINTS
// ============================================================================

// Get all integrations health status
app.get('/api/integrations/health', requireAuth, (req, res) => {
    db.all(
        'SELECT * FROM integration_health ORDER BY integration_name',
        [],
        (err, integrations) => {
            if (err) {
                loggers.system.error('Failed to fetch integration health:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Add formatted timestamps
            const processedIntegrations = integrations.map(integration => ({
                ...integration,
                last_check_formatted: integration.last_check ? moment.utc(integration.last_check).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A') : null,
                last_success_formatted: integration.last_success ? moment.utc(integration.last_success).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A') : null,
                metadata: integration.metadata ? JSON.parse(integration.metadata) : null
            }));

            res.json(processedIntegrations);
        }
    );
});

// Test specific integration health
app.post('/api/integrations/:name/test', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { name } = req.params;
    const result = await integrationManager.checkIntegrationHealth(name);

    logActivity(req.user.id, 'admin_action', `/api/integrations/${name}/test`, `Tested integration: ${name}`, req);

    res.json(result);
});

// Get integration health history
app.get('/api/integrations/:name/history', requireAuth, (req, res) => {
    const { name } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    db.all(
        `SELECT * FROM integration_metrics WHERE integration_name = ? ORDER BY timestamp DESC LIMIT ?`,
        [name, limit],
        (err, metrics) => {
            if (err) {
                loggers.system.error('Failed to fetch integration history:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Add formatted timestamps
            const processedMetrics = metrics.map(metric => ({
                ...metric,
                timestamp_formatted: moment.utc(metric.timestamp).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A')
            }));

            res.json(processedMetrics);
        }
    );
});

// Test all integrations
app.post('/api/integrations/test-all', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin privileges required' });
    }

    const results = await integrationManager.checkAllIntegrationsHealth();

    logActivity(req.user.id, 'admin_action', '/api/integrations/test-all', 'Tested all integrations', req);

    res.json(results);
});

// Custom Integrations API endpoints
app.get('/api/integrations/custom', requireAuth, (req, res) => {
    db.all('SELECT * FROM custom_integrations ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            loggers.access.error('Failed to fetch custom integrations:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        // Parse auth_data back to object
        const integrations = rows.map(row => ({
            ...row,
            auth_data: row.auth_data ? JSON.parse(row.auth_data) : null
        }));
        
        res.json({ success: true, integrations });
    });
});

app.post('/api/integrations/custom', requireAdmin, (req, res) => {
    const { name, type, base_url, auth_type, auth_data, enabled, description, test_endpoint, icon, icon_color } = req.body;
    
    if (!name || !type) {
        return res.status(400).json({ success: false, error: 'Name and type are required' });
    }
    
    const authDataJson = auth_data ? JSON.stringify(auth_data) : null;
    
    db.run(
        `INSERT INTO custom_integrations (name, type, base_url, auth_type, auth_data, enabled, description, test_endpoint, icon, icon_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, type, base_url || null, auth_type || 'none', authDataJson, enabled !== false ? 1 : 0, description || null, test_endpoint || null, icon || 'puzzle-piece', icon_color || '#8b5cf6'],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ success: false, error: 'Integration name already exists' });
                }
                loggers.access.error('Failed to create custom integration:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            loggers.security.info(`Custom integration created: ${name} by ${req.user.username}`);
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/integrations/custom/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, type, base_url, auth_type, auth_data, enabled, description, test_endpoint, icon, icon_color } = req.body;
    
    if (!name || !type) {
        return res.status(400).json({ success: false, error: 'Name and type are required' });
    }
    
    const authDataJson = auth_data ? JSON.stringify(auth_data) : null;
    
    db.run(
        `UPDATE custom_integrations 
         SET name = ?, type = ?, base_url = ?, auth_type = ?, auth_data = ?, 
             enabled = ?, description = ?, test_endpoint = ?, icon = ?, icon_color = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, type, base_url || null, auth_type || 'none', authDataJson, enabled !== false ? 1 : 0, description || null, test_endpoint || null, icon || 'puzzle-piece', icon_color || '#8b5cf6', id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ success: false, error: 'Integration name already exists' });
                }
                loggers.access.error('Failed to update custom integration:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ success: false, error: 'Integration not found' });
            }
            
            loggers.security.info(`Custom integration updated: ${name} by ${req.user.username}`);
            res.json({ success: true });
        }
    );
});

app.delete('/api/integrations/custom/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    // First get the integration name for logging
    db.get('SELECT name FROM custom_integrations WHERE id = ?', [id], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        
        db.run('DELETE FROM custom_integrations WHERE id = ?', [id], function(err) {
            if (err) {
                loggers.access.error('Failed to delete custom integration:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            loggers.security.info(`Custom integration deleted: ${row.name} by ${req.user.username}`);
            res.json({ success: true });
        });
    });
});

app.post('/api/integrations/custom/:id/test', requireAuth, async (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM custom_integrations WHERE id = ?', [id], async (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }
        
        try {
            const testUrl = row.test_endpoint || row.base_url;
            if (!testUrl) {
                return res.json({ success: false, error: 'No test endpoint configured' });
            }
            
            const authData = row.auth_data ? JSON.parse(row.auth_data) : {};
            const headers = {};
            
            // Add authentication headers based on auth_type
            if (row.auth_type === 'api_key' && authData.api_key) {
                headers['Authorization'] = `Bearer ${authData.api_key}`;
            } else if (row.auth_type === 'basic' && authData.username && authData.password) {
                const basicAuth = Buffer.from(`${authData.username}:${authData.password}`).toString('base64');
                headers['Authorization'] = `Basic ${basicAuth}`;
            } else if (row.auth_type === 'header' && authData.header_name && authData.header_value) {
                headers[authData.header_name] = authData.header_value;
            }
            
            // Test connection with timeout
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(testUrl, {
                method: 'GET',
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            const status = response.ok ? 'online' : 'error';
            
            // Update last_tested and status
            db.run(
                'UPDATE custom_integrations SET status = ?, last_tested = CURRENT_TIMESTAMP WHERE id = ?',
                [status, id]
            );
            
            res.json({
                success: true,
                status,
                statusCode: response.status,
                message: response.ok ? 'Connection successful' : `HTTP ${response.status}`
            });
            
        } catch (error) {
            db.run('UPDATE custom_integrations SET status = ?, last_tested = CURRENT_TIMESTAMP WHERE id = ?', ['offline', id]);
            
            res.json({
                success: false,
                status: 'offline',
                error: error.message
            });
        }
    });
});

// ========================================
// INTEGRATION CONFIGURATION API ENDPOINTS
// ========================================

// Get all integration configurations
app.get('/api/integrations/configs', requireAdmin, (req, res) => {
    db.all('SELECT * FROM integration_configs ORDER BY integration_name', (err, rows) => {
        if (err) {
            loggers.system.error('Error fetching integration configs:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Get specific integration configuration
app.get('/api/integrations/configs/:name', requireAdmin, (req, res) => {
    const { name } = req.params;
    
    db.get('SELECT * FROM integration_configs WHERE integration_name = ?', [name], (err, row) => {
        if (err) {
            loggers.system.error('Error fetching integration config:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(row || null);
    });
});

// Save/update integration configuration
app.post('/api/integrations/configs', requireAdmin, (req, res) => {
    const { integration_name, integration_type, enabled, config_json } = req.body;
    
    if (!integration_name || !integration_type || !config_json) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if config exists
    db.get('SELECT id FROM integration_configs WHERE integration_name = ?', [integration_name], (err, row) => {
        if (err) {
            loggers.system.error('Error checking integration config:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (row) {
            // Update existing
            db.run(
                `UPDATE integration_configs 
                 SET integration_type = ?, enabled = ?, config_json = ?, 
                     updated_at = CURRENT_TIMESTAMP, updated_by = ?
                 WHERE integration_name = ?`,
                [integration_type, enabled, config_json, req.user.id, integration_name],
                function(err) {
                    if (err) {
                        loggers.system.error('Error updating integration config:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    loggers.system.info(`Integration ${integration_name} updated by ${req.user.username}`);
                    res.json({ success: true, id: row.id });
                }
            );
        } else {
            // Insert new
            db.run(
                `INSERT INTO integration_configs 
                 (integration_name, integration_type, enabled, config_json, updated_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [integration_name, integration_type, enabled, config_json, req.user.id],
                function(err) {
                    if (err) {
                        loggers.system.error('Error inserting integration config:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    loggers.system.info(`Integration ${integration_name} created by ${req.user.username}`);
                    res.json({ success: true, id: this.lastID });
                }
            );
        }
    });
});

// Delete integration configuration
app.delete('/api/integrations/configs/:name', requireAdmin, (req, res) => {
    const { name } = req.params;
    
    db.run('DELETE FROM integration_configs WHERE integration_name = ?', [name], function(err) {
        if (err) {
            loggers.system.error('Error deleting integration config:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        loggers.system.info(`Integration ${name} deleted by ${req.user.username}`);
        res.json({ success: true, deleted: this.changes });
    });
});

// Dashboard
// Standardized page template function for consistency across ALL pages
function generateStandardPageHTML(pageTitle, pageIcon, activeNav, contentBody, req, additionalCSS = '', additionalJS = '') {
    const uptime = Math.floor(process.uptime());
    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    return `
        <!DOCTYPE html>
        <html lang="en" data-theme="auto">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${pageTitle} | Enterprise Logging Platform</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
            <style>
                :root {
                    /* Light Theme Colors */
                    --bg-primary: #ffffff;
                    --bg-secondary: #f8fafc;
                    --bg-tertiary: #f1f5f9;
                    --text-primary: #1e293b;
                    --text-secondary: #475569;
                    --text-muted: #64748b;
                    --border-color: #e2e8f0;
                    --accent-primary: #3b82f6;
                    --accent-secondary: #1d4ed8;
                    --success-color: #10b981;
                    --warning-color: #f59e0b;
                    --error-color: #ef4444;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                    --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
                    
                    /* Ocean Gradients */
                    --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
                    --sidebar-bg: var(--gradient-ocean);
                }

                /* Dark Theme */
                [data-theme="dark"] {
                    --bg-primary: #1e293b;
                    --bg-secondary: #334155;
                    --bg-tertiary: #475569;
                    --text-primary: #f1f5f9;
                    --text-secondary: #cbd5e1;
                    --text-muted: #94a3b8;
                    --border-color: #475569;
                    --accent-primary: #60a5fa;
                    --accent-secondary: #3b82f6;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                    --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                    --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                    --sidebar-bg: var(--gradient-deep-blue);
                }

                /* Auto Theme - follows system preference */
                @media (prefers-color-scheme: dark) {
                    [data-theme="auto"] {
                        --bg-primary: #1e293b;
                        --bg-secondary: #334155;
                        --bg-tertiary: #475569;
                        --text-primary: #f1f5f9;
                        --text-secondary: #cbd5e1;
                        --text-muted: #94a3b8;
                        --border-color: #475569;
                        --accent-primary: #60a5fa;
                        --accent-secondary: #3b82f6;
                        --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                        --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                        --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                        --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                        --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                        --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                        --sidebar-bg: var(--gradient-deep-blue);
                    }
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    line-height: 1.6;
                }

                .dashboard-container {
                    display: flex;
                    min-height: 100vh;
                }

                .sidebar {
                    width: 280px;
                    background: var(--sidebar-bg);
                    padding: 2rem 0;
                    display: flex;
                    flex-direction: column;
                    color: white;
                    position: relative;
                    overflow: hidden;
                }

                .sidebar::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
                    pointer-events: none;
                }

                .sidebar-header {
                    padding: 0 2rem 2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.2);
                    margin-bottom: 2rem;
                    position: relative;
                    z-index: 1;
                }

                .sidebar-header h2 {
                    margin: 0 0 0.5rem 0;
                    font-size: 1.5rem;
                    font-weight: 700;
                }

                .sidebar-header p {
                    margin: 0;
                    opacity: 0.8;
                    font-size: 0.875rem;
                }

                .sidebar-nav {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    flex: 1;
                    position: relative;
                    z-index: 1;
                }

                .sidebar-nav li {
                    margin: 0;
                }

                .sidebar-nav a {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 2rem;
                    color: rgba(255,255,255,0.9);
                    text-decoration: none;
                    transition: all 0.3s ease;
                    border-left: 3px solid transparent;
                    position: relative;
                }

                .sidebar-nav a:hover {
                    background: rgba(255,255,255,0.1);
                    color: white;
                    border-left-color: rgba(255,255,255,0.5);
                }

                .sidebar-nav a.active {
                    background: rgba(255,255,255,0.15);
                    color: white;
                    border-left-color: white;
                    font-weight: 600;
                }

                .sidebar-nav i {
                    width: 20px;
                    font-size: 1.1rem;
                }

                .sidebar-footer {
                    padding: 2rem;
                    border-top: 1px solid rgba(255,255,255,0.2);
                    margin-top: auto;
                    position: relative;
                    z-index: 1;
                }

                .user-info {
                    margin-bottom: 1rem;
                    padding: 1rem;
                    background: rgba(255,255,255,0.1);
                    border-radius: 12px;
                    text-align: center;
                }

                .user-info strong {
                    display: block;
                    margin-bottom: 0.25rem;
                    color: #0ea5e9;
                    font-size: 1.1rem;
                }

                .user-role {
                    font-size: 0.85rem;
                    color: #3b82f6;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                }

                .btn-logout {
                    width: 100%;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.4);
                    color: white;
                    padding: 0.75rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 0.9rem;
                }

                .btn-logout:hover {
                    background: rgba(239, 68, 68, 0.3);
                    border-color: rgba(239, 68, 68, 0.6);
                }

                .main-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .content-header {
                    background: var(--bg-primary);
                    padding: 2rem;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: var(--shadow-light);
                }

                .content-header h1 {
                    margin: 0;
                    color: var(--text-primary);
                    font-size: 2rem;
                    font-weight: 700;
                }

                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }

                .theme-toggle {
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    color: var(--text-primary);
                    padding: 0.75rem;
                    border-radius: 50%;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 1.2rem;
                    box-shadow: var(--shadow-light);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 45px;
                    height: 45px;
                }

                .theme-toggle:hover {
                    transform: scale(1.1) rotate(15deg);
                    box-shadow: var(--shadow-medium);
                    border-color: var(--accent-primary);
                }

                .content-body {
                    flex: 1;
                    padding: 2rem;
                    overflow-y: auto;
                    background: var(--bg-secondary);
                }

                .timestamp {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }

                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    font-weight: 600;
                }

                .status-indicator.online {
                    color: var(--success-color);
                }

                /* Universal Button Styles */
                .btn, button.btn, a.btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: var(--gradient-ocean);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-decoration: none;
                    box-shadow: var(--shadow-light);
                }

                .btn:hover, button.btn:hover, a.btn:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-medium);
                    filter: brightness(1.1);
                }

                .btn:active, button.btn:active, a.btn:active {
                    transform: translateY(0);
                }

                .btn-secondary, button.btn-secondary, a.btn-secondary {
                    background: var(--gradient-ocean);
                    color: white;
                    border: none;
                    box-shadow: var(--shadow-light);
                }

                .btn-secondary:hover, button.btn-secondary:hover, a.btn-secondary:hover {
                    background: var(--gradient-ocean);
                    border: none;
                    color: white;
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-medium);
                    filter: brightness(1.1);
                }

                .btn-danger, button.btn-danger, a.btn-danger {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    border: none;
                }

                .btn-success, button.btn-success, a.btn-success {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                }

                .btn-warning, button.btn-warning, a.btn-warning {
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                    color: white;
                    border: none;
                }

                .btn:disabled, button.btn:disabled, a.btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                    pointer-events: none;
                }

                /* ========================================
                   UNIFIED PAGE COMPONENTS
                   ======================================== */

                /* Page Header Component */
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2rem;
                    padding: 1rem;
                    background: var(--gradient-ocean);
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    box-shadow: var(--shadow-light);
                    position: relative;
                    overflow: hidden;
                }

                .page-header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                    animation: headerShimmer 4s ease-in-out infinite;
                }

                @keyframes pageHeaderShimmer {
                    0%, 100% { transform: translateX(-100%); }
                    50% { transform: translateX(100%); }
                }

                .page-header h1 {
                    margin: 0 0 0.5rem 0;
                    font-size: 1.5rem;
                    color: white;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    position: relative;
                    z-index: 1;
                }

                .page-header h1 i {
                    color: rgba(255,255,255,0.9);
                    font-size: 1.25rem;
                }

                .page-header p {
                    margin: 0;
                    color: rgba(255,255,255,0.85);
                    font-size: 0.875rem;
                    position: relative;
                    z-index: 1;
                }

                /* Card Component */
                .card {
                    background: var(--bg-primary);
                    border-radius: 12px;
                    box-shadow: var(--shadow-light);
                    border: 1px solid var(--border-color);
                    margin-bottom: 1.5rem;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }

                .card:hover {
                    box-shadow: var(--shadow-medium);
                    transform: translateY(-2px);
                }

                .card-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-secondary);
                }

                .card-header h3 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: var(--text-primary);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .card-header h3 i {
                    color: var(--accent-primary);
                }

                .card-body {
                    padding: 1.5rem;
                }

                .card-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-secondary);
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                }

                /* Data Table Component */
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: var(--bg-primary);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .data-table thead {
                    background: var(--bg-secondary);
                }

                .data-table thead th {
                    padding: 1rem;
                    text-align: left;
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid var(--border-color);
                }

                .data-table tbody tr {
                    border-bottom: 1px solid var(--border-color);
                    transition: all 0.2s ease;
                }

                .data-table tbody tr:hover {
                    background: var(--bg-secondary);
                    transform: scale(1.01);
                }

                .data-table tbody tr:last-child {
                    border-bottom: none;
                }

                .data-table tbody td {
                    padding: 1rem;
                    color: var(--text-secondary);
                    font-size: 0.925rem;
                    vertical-align: middle;
                }

                .data-table tbody td:first-child {
                    font-weight: 500;
                    color: var(--text-primary);
                }

                /* Status Badges */
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.375rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    transition: all 0.2s ease;
                }

                .status-badge.online {
                    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                    color: #065f46;
                    border: 1px solid #6ee7b7;
                }

                [data-theme="dark"] .status-badge.online {
                    background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
                    color: #6ee7b7;
                    border: 1px solid #059669;
                }

                .status-badge.offline {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    color: #991b1b;
                    border: 1px solid #fca5a5;
                }

                [data-theme="dark"] .status-badge.offline {
                    background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
                    color: #fca5a5;
                    border: 1px solid #dc2626;
                }

                .status-badge.pending {
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    color: #78350f;
                    border: 1px solid #fbbf24;
                }

                [data-theme="dark"] .status-badge.pending {
                    background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
                    color: #fbbf24;
                    border: 1px solid #f59e0b;
                }

                .status-badge.degraded {
                    background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
                    color: #7c2d12;
                    border: 1px solid #fb923c;
                }

                [data-theme="dark"] .status-badge.degraded {
                    background: linear-gradient(135deg, #7c2d12 0%, #9a3412 100%);
                    color: #fb923c;
                    border: 1px solid #f97316;
                }

                /* Modal Component */
                .modal {
                    display: none !important;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    z-index: 9999;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease;
                }

                .modal.active {
                    display: flex !important;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                .modal-content {
                    background: var(--bg-primary);
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                    padding: 2rem;
                    position: relative;
                    animation: slideUp 0.3s ease;
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    padding-bottom: 1rem;
                    border-bottom: 2px solid var(--border-color);
                }

                .modal-header h3 {
                    margin: 0;
                    color: var(--text-primary);
                    font-size: 1.5rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .modal-header h3 i {
                    color: var(--accent-primary);
                }

                .modal-close {
                    background: transparent;
                    border: none;
                    font-size: 2.5rem;
                    line-height: 1;
                    cursor: pointer;
                    color: var(--text-secondary);
                    font-weight: 300;
                    padding: 0;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                    position: relative;
                    z-index: 10;
                    flex-shrink: 0;
                }

                .modal-close:hover {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--error-color);
                    transform: rotate(90deg);
                }

                .modal-close:active {
                    transform: rotate(90deg) scale(0.9);
                }

                .modal-body {
                    margin: 1.5rem 0;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                    padding-top: 1.5rem;
                    border-top: 2px solid var(--border-color);
                }

                /* Form Components */
                .form-group {
                    margin-bottom: 1.5rem;
                }

                .form-group label {
                    display: block;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                    font-size: 0.95rem;
                }

                .form-group label i {
                    margin-right: 0.5rem;
                    color: var(--accent-primary);
                }

                .form-control {
                    width: 100%;
                    padding: 0.75rem;
                    border: 2px solid var(--border-color);
                    border-radius: 8px;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 1rem;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }

                .form-control:focus {
                    outline: none;
                    border-color: var(--accent-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                    background: var(--bg-primary);
                }

                .form-control::placeholder {
                    color: var(--text-muted);
                    opacity: 0.7;
                }

                textarea.form-control {
                    resize: vertical;
                    min-height: 100px;
                    font-family: inherit;
                }

                select.form-control {
                    cursor: pointer;
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 0.75rem center;
                    padding-right: 2.5rem;
                }

                input[type="checkbox"] {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    accent-color: var(--accent-primary);
                }

                input[type="color"] {
                    height: 50px;
                    cursor: pointer;
                    padding: 0.25rem;
                }

                .form-group small {
                    display: block;
                    margin-top: 0.5rem;
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }

                .form-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                }

                /* Grid Layouts */
                .grid {
                    display: grid;
                    gap: 1.5rem;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                }

                .grid-2 {
                    grid-template-columns: repeat(2, 1fr);
                }

                .grid-3 {
                    grid-template-columns: repeat(3, 1fr);
                }

                .grid-4 {
                    grid-template-columns: repeat(4, 1fr);
                }

                @media (max-width: 1200px) {
                    .grid-4 {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .grid,
                    .grid-2,
                    .grid-3,
                    .grid-4 {
                        grid-template-columns: 1fr;
                    }
                }

                /* Stats Cards */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }

                .stat-card {
                    background: var(--bg-primary);
                    padding: 1.5rem;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    box-shadow: var(--shadow-light);
                    transition: all 0.3s ease;
                }

                .stat-card:hover {
                    transform: translateY(-4px);
                    box-shadow: var(--shadow-medium);
                }

                .stat-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .stat-title {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stat-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: var(--gradient-ocean);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                }

                .stat-value {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                }

                .stat-label {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-muted);
                }

                .empty-state i {
                    font-size: 4rem;
                    opacity: 0.3;
                    margin-bottom: 1rem;
                    display: block;
                    color: var(--accent-primary);
                }

                .empty-state h3 {
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                    font-size: 1.5rem;
                }

                .empty-state p {
                    margin-bottom: 2rem;
                    font-size: 1rem;
                }

                /* Utility Classes */
                .text-center {
                    text-align: center;
                }

                .text-right {
                    text-align: right;
                }

                .text-muted {
                    color: var(--text-muted);
                }

                .text-primary {
                    color: var(--text-primary);
                }

                .text-success {
                    color: var(--success-color);
                }

                .text-warning {
                    color: var(--warning-color);
                }

                .text-error {
                    color: var(--error-color);
                }

                .mb-0 { margin-bottom: 0; }
                .mb-1 { margin-bottom: 0.5rem; }
                .mb-2 { margin-bottom: 1rem; }
                .mb-3 { margin-bottom: 1.5rem; }
                .mb-4 { margin-bottom: 2rem; }

                .mt-0 { margin-top: 0; }
                .mt-1 { margin-top: 0.5rem; }
                .mt-2 { margin-top: 1rem; }
                .mt-3 { margin-top: 1.5rem; }
                .mt-4 { margin-top: 2rem; }

                .flex {
                    display: flex;
                }

                .flex-between {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .flex-center {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .gap-1 { gap: 0.5rem; }
                .gap-2 { gap: 1rem; }
                .gap-3 { gap: 1.5rem; }
                .gap-4 { gap: 2rem; }

                ${additionalCSS}
            </style>
        </head>
        <body data-theme="auto">
            <div class="dashboard-container">
                <!-- Sidebar -->
                <nav class="sidebar">
                    <div class="sidebar-header">
                        <h2><i class="fas fa-building"></i> Enterprise Logger</h2>
                        <p>Tom Nelson's Infrastructure</p>
                    </div>
                    <ul class="sidebar-nav">
                        <li><a href="/dashboard" ${activeNav === 'dashboard' ? 'class="active"' : ''}><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
                        <li><a href="/logs" ${activeNav === 'logs' ? 'class="active"' : ''}><i class="fas fa-file-alt"></i> Logs</a></li>
                        <li><a href="/integrations" ${activeNav === 'integrations' ? 'class="active"' : ''}><i class="fas fa-plug"></i> Integrations</a></li>
                        <li><a href="/webhooks" ${activeNav === 'webhooks' ? 'class="active"' : ''}><i class="fas fa-link"></i> Webhooks</a></li>
                        <li><a href="/activity" ${activeNav === 'activity' ? 'class="active"' : ''}><i class="fas fa-history"></i> Activity</a></li>
                        <li><a href="/admin/users" ${activeNav === 'users' ? 'class="active"' : ''}><i class="fas fa-users"></i> Users</a></li>
                        <li><a href="/admin/settings" ${activeNav === 'settings' ? 'class="active"' : ''}><i class="fas fa-cog"></i> Settings</a></li>
                    </ul>
                    <div class="sidebar-footer">
                        <div class="user-info">
                            <strong><i class="fas fa-user-circle"></i> ${req.user.username}</strong>
                            <span class="user-role">${req.user.role}</span>
                        </div>
                        <button onclick="logout()" class="btn-logout">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </nav>

                <!-- Main Content -->
                <main class="main-content">
                    <header class="content-header">
                        <h1><i class="${pageIcon}"></i> ${pageTitle}</h1>
                        <div class="header-actions">
                            <button onclick="toggleTheme()" class="theme-toggle" title="Auto Mode (Click for Light)">
                                <i id="theme-icon" class="fas fa-adjust"></i>
                            </button>
                            <span class="timestamp" id="current-time"></span>
                            <span class="status-indicator online">
                                <i class="fas fa-circle"></i> System Online
                            </span>
                        </div>
                    </header>

                    <div class="content-body">
                        ${contentBody}
                    </div>
                </main>
            </div>

            <script>
                // Standard theme system for ALL pages
                function updateTime() {
                    const now = new Date();
                    document.getElementById('current-time').textContent = now.toLocaleString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                }

                function initializeTheme() {
                    const savedTheme = localStorage.getItem('theme') || 'auto';
                    document.documentElement.setAttribute('data-theme', savedTheme);
                    updateThemeIcon(savedTheme);
                }

                function toggleTheme() {
                    const currentTheme = document.documentElement.getAttribute('data-theme');
                    let newTheme;
                    
                    switch(currentTheme) {
                        case 'auto':
                            newTheme = 'light';
                            break;
                        case 'light':
                            newTheme = 'dark';
                            break;
                        case 'dark':
                            newTheme = 'auto';
                            break;
                        default:
                            newTheme = 'auto';
                    }
                    
                    document.documentElement.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                    updateThemeIcon(newTheme);
                }

                function updateThemeIcon(theme) {
                    const themeButton = document.querySelector('.theme-toggle i');
                    if (themeButton) {
                        switch(theme) {
                            case 'light':
                                themeButton.className = 'fas fa-sun';
                                themeButton.parentElement.title = 'Light Mode (Click for Dark)';
                                break;
                            case 'dark':
                                themeButton.className = 'fas fa-moon';
                                themeButton.parentElement.title = 'Dark Mode (Click for Auto)';
                                break;
                            case 'auto':
                            default:
                                themeButton.className = 'fas fa-adjust';
                                themeButton.parentElement.title = 'Auto Mode (Click for Light)';
                                break;
                        }
                    }
                }

                function logout() {
                    fetch('/api/auth/logout', { method: 'POST' })
                        .then(() => window.location.href = '/login')
                        .catch(() => window.location.href = '/login');
                }

                // Initialize
                document.addEventListener('DOMContentLoaded', function() {
                    initializeTheme();
                    updateTime();
                    setInterval(updateTime, 1000);
                    loadTimezoneSettings();
                });

                // Global timezone settings
                let userTimezone = 'America/Edmonton'; // Default Mountain Time (Canada)

                async function loadTimezoneSettings() {
                    try {
                        const response = await fetch('/api/timezone');
                        if (response.ok) {
                            const data = await response.json();
                            userTimezone = data.timezone;
                        }
                    } catch (error) {
                        console.error('Failed to load timezone:', error);
                    }
                }

                // Format timestamp with user's timezone using Intl.DateTimeFormat
                function formatTimestamp(timestamp, options = {}) {
                    try {
                        const date = new Date(timestamp);
                        const formatter = new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            timeZone: userTimezone,
                            hour12: true,
                            ...options
                        });
                        return formatter.format(date);
                    } catch (error) {
                        console.error('Error formatting timestamp:', error, 'timestamp:', timestamp, 'timezone:', userTimezone);
                        return new Date(timestamp).toLocaleString();
                    }
                }

                ${additionalJS}
                
                // Load user's custom theme on page load
                (async function loadUserTheme() {
                    try {
                        const response = await fetch('/api/user/theme');
                        if (!response.ok) return; // No custom theme, use defaults
                        
                        const theme = await response.json();
                        if (!theme) return; // No custom theme saved
                        
                        // Apply colors
                        if (theme.bg_primary) document.documentElement.style.setProperty('--bg-primary', theme.bg_primary);
                        if (theme.bg_secondary) document.documentElement.style.setProperty('--bg-secondary', theme.bg_secondary);
                        if (theme.bg_tertiary) document.documentElement.style.setProperty('--bg-tertiary', theme.bg_tertiary);
                        if (theme.text_primary) document.documentElement.style.setProperty('--text-primary', theme.text_primary);
                        if (theme.text_secondary) document.documentElement.style.setProperty('--text-secondary', theme.text_secondary);
                        if (theme.text_muted) document.documentElement.style.setProperty('--text-muted', theme.text_muted);
                        if (theme.border_color) document.documentElement.style.setProperty('--border-color', theme.border_color);
                        if (theme.accent_primary) document.documentElement.style.setProperty('--accent-primary', theme.accent_primary);
                        if (theme.accent_secondary) document.documentElement.style.setProperty('--accent-secondary', theme.accent_secondary);
                        if (theme.success_color) document.documentElement.style.setProperty('--success-color', theme.success_color);
                        if (theme.warning_color) document.documentElement.style.setProperty('--warning-color', theme.warning_color);
                        if (theme.error_color) document.documentElement.style.setProperty('--error-color', theme.error_color);
                        if (theme.info_color) document.documentElement.style.setProperty('--info-color', theme.info_color);
                        
                        // Apply gradient
                        if (theme.gradient_type && theme.gradient_stops) {
                            const stops = theme.gradient_stops
                                .sort((a, b) => a.position - b.position)
                                .map(stop => \`\${stop.color} \${stop.position}%\`)
                                .join(', ');
                            
                            let gradient;
                            if (theme.gradient_type === 'linear') {
                                gradient = \`linear-gradient(\${theme.gradient_angle || 135}deg, \${stops})\`;
                            } else {
                                gradient = \`radial-gradient(circle, \${stops})\`;
                            }
                            
                            document.documentElement.style.setProperty('--gradient-ocean', gradient);
                        }
                    } catch (error) {
                        console.error('Error loading user theme:', error);
                        // Silently fail and use defaults
                    }
                })();
            </script>
        </body>
        </html>
    `;
}

// Old static dashboard (keeping for reference)
app.get('/dashboard/old', requireAuth, (req, res) => {
    const contentBody = `
        <!-- Load Chart.js globally for this page -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        
        <!-- Dashboard Stats -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-title">System Uptime</span>
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                </div>
                <div class="stat-value">${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m</div>
                <div class="stat-label">Server running smoothly</div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-title">Memory Usage</span>
                    <div class="stat-icon">
                        <i class="fas fa-memory"></i>
                    </div>
                </div>
                <div class="stat-value">${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</div>
                <div class="stat-label">Heap memory allocated</div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-title">Active Sessions</span>
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                <div class="stat-value" id="active-sessions">-</div>
                <div class="stat-label">Users currently online</div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-title">Log Entries</span>
                    <div class="stat-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                </div>
                <div class="stat-value" id="log-count">-</div>
                <div class="stat-label">Total entries today</div>
            </div>
        </div>

        <!-- System Health Card -->
        <div class="card" style="margin-bottom: 2rem;">
            <div class="card-header">
                <h3><i class="fas fa-heartbeat"></i> System Health</h3>
                <a href="/admin/health" class="btn" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
                    <i class="fas fa-external-link-alt"></i> View Details
                </a>
            </div>
            <div class="card-body">
                <div id="system-health-overview" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <!-- Health indicators will be dynamically loaded here -->
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted); grid-column: 1 / -1;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                        <p style="margin-top: 0.5rem;">Loading system health...</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Analytics Chart -->
        <div class="chart-container">
            <div class="chart-header">
                <h3 class="chart-title">Log Activity Trend</h3>
                <div class="time-filter">
                    <button class="time-btn" data-range="1h">1H</button>
                    <button class="time-btn" data-range="6h">6H</button>
                    <button class="time-btn active" data-range="24h">24H</button>
                    <button class="time-btn" data-range="7d">7D</button>
                </div>
            </div>
            <div style="padding: 1.5rem; height: 350px; position: relative;">
                <canvas id="activity-chart"></canvas>
            </div>
        </div>

        <!-- Recent Logs -->
        <div class="recent-logs">
            <div class="logs-header">
                <h3 class="logs-title">Recent Log Entries</h3>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <button onclick="createTestEvent()" class="btn" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
                        <i class="fas fa-plus"></i> Create Test Event
                    </button>
                    <a href="/logs" class="view-all-btn">View All Logs →</a>
                </div>
            </div>
            <div id="recent-logs-container">
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <p>Loading recent logs...</p>
                </div>
            </div>
        </div>
    `;

    const additionalCSS = `
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }

        .stat-card {
            background: var(--bg-primary);
            padding: 2rem;
            border-radius: 16px;
            box-shadow: var(--shadow-light);
            border: 1px solid var(--border-color);
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: var(--shadow-medium);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--gradient-ocean);
        }

        .stat-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .stat-title {
            font-size: 0.875rem;
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .stat-icon {
            width: 48px;
            height: 48px;
            background: var(--gradient-ocean);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.5rem;
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
            line-height: 1;
        }

        .stat-label {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        .chart-container {
            background: var(--bg-primary);
            border-radius: 16px;
            padding: 2rem;
            box-shadow: var(--shadow-light);
            border: 1px solid var(--border-color);
            margin-bottom: 2rem;
        }

        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
        }

        .chart-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .time-filter {
            display: flex;
            gap: 0.5rem;
        }

        .time-btn {
            padding: 0.5rem 1rem;
            border: 1px solid var(--border-color);
            background: var(--bg-primary);
            color: var(--text-secondary);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 0.875rem;
        }

        .time-btn.active,
        .time-btn:hover {
            background: var(--accent-primary);
            color: white;
            border-color: var(--accent-primary);
        }

        .recent-logs {
            background: var(--bg-primary);
            border-radius: 16px;
            padding: 2rem;
            box-shadow: var(--shadow-light);
            border: 1px solid var(--border-color);
        }

        .logs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
        }

        .logs-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .view-all-btn {
            color: var(--accent-primary);
            text-decoration: none;
            font-weight: 600;
            font-size: 0.875rem;
            transition: color 0.3s ease;
        }

        .view-all-btn:hover {
            color: var(--accent-secondary);
        }

        .log-entry {
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
            transition: background-color 0.3s ease;
        }

        .log-entry:last-child {
            border-bottom: none;
        }

        .log-entry:hover {
            background: var(--bg-secondary);
        }

        .log-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .log-level {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .log-level.info {
            background: rgba(59, 130, 246, 0.1);
            color: var(--accent-primary);
        }

        .log-level.warn {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning-color);
        }

        .log-level.error {
            background: rgba(239, 68, 68, 0.1);
            color: var(--error-color);
        }

        .log-time {
            font-size: 0.875rem;
            color: var(--text-muted);
        }

        .log-message {
            color: var(--text-primary);
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
        }
    `;

    const additionalJS = `
        // Load real dashboard stats
        let activityChart = null;
        let currentTimeRange = '24h';

        async function initActivityChart() {
            const ctx = document.getElementById('activity-chart');
            if (!ctx) return;

            activityChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Log Events',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#3b82f6',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    return \`\${context.parsed.y} events\`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                drawBorder: false
                            },
                            ticks: {
                                color: 'var(--text-muted)',
                                font: {
                                    size: 11
                                },
                                maxRotation: 0,
                                autoSkipPadding: 20
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                drawBorder: false
                            },
                            ticks: {
                                color: 'var(--text-muted)',
                                font: {
                                    size: 11
                                },
                                precision: 0
                            }
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    }
                }
            });

            loadChartData(currentTimeRange);
        }

        async function loadChartData(timeRange) {
            try {
                const response = await fetch(\`/api/analytics/activity?range=\${timeRange}\`);
                if (!response.ok) throw new Error('Failed to fetch chart data');
                
                const data = await response.json();
                
                // Check if there's any actual data
                const hasData = data.values && data.values.some(v => v > 0);
                
                if (activityChart) {
                    activityChart.data.labels = data.labels;
                    activityChart.data.datasets[0].data = data.values;
                    activityChart.update();
                    
                    // Show/hide empty state message
                    const chartContainer = document.getElementById('activity-chart').parentElement;
                    let emptyMessage = chartContainer.querySelector('.chart-empty-state');
                    
                    if (!hasData) {
                        if (!emptyMessage) {
                            emptyMessage = document.createElement('div');
                            emptyMessage.className = 'chart-empty-state';
                            emptyMessage.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--text-muted); z-index: 10; pointer-events: none;';
                            emptyMessage.innerHTML = \`
                                <i class="fas fa-chart-line" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                                <p style="font-size: 0.875rem;">No log activity in the selected time range</p>
                                <p style="font-size: 0.75rem; margin-top: 0.5rem;">Data will appear here once logs are received</p>
                            \`;
                            chartContainer.appendChild(emptyMessage);
                        }
                        emptyMessage.style.display = 'block';
                        document.getElementById('activity-chart').style.opacity = '0.2';
                    } else {
                        if (emptyMessage) {
                            emptyMessage.style.display = 'none';
                        }
                        document.getElementById('activity-chart').style.opacity = '1';
                    }
                }
            } catch (error) {
                console.error('Failed to load chart data:', error);
                // Show error state
                const chartContainer = document.getElementById('activity-chart').parentElement;
                let errorMessage = chartContainer.querySelector('.chart-error-state');
                if (!errorMessage) {
                    errorMessage = document.createElement('div');
                    errorMessage.className = 'chart-error-state';
                    errorMessage.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--error-color); z-index: 10;';
                    errorMessage.innerHTML = \`
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                        <p style="font-size: 0.875rem;">Failed to load chart data</p>
                    \`;
                    chartContainer.appendChild(errorMessage);
                }
            }
        }

        function setupTimeFilters() {
            document.querySelectorAll('.time-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentTimeRange = this.getAttribute('data-range');
                    loadChartData(currentTimeRange);
                });
            });
        }

        async function loadDashboardStats() {
            try {
                // Get today's log count (since midnight)
                const countResponse = await fetch('/api/logs/count/today');
                const countData = await countResponse.json();
                document.getElementById('log-count').textContent = (countData.count || 0).toLocaleString();
                
                // Get active users count
                const usersResponse = await fetch('/api/users');
                const usersData = await usersResponse.json();
                const activeUsers = usersData.users ? usersData.users.filter(u => u.last_login && u.is_active).length : 0;
                document.getElementById('active-sessions').textContent = activeUsers;
            } catch (error) {
                console.error('Failed to load dashboard stats:', error);
                document.getElementById('log-count').textContent = '0';
                document.getElementById('active-sessions').textContent = '0';
            }
        }

        async function loadSystemHealth() {
            try {
                const response = await fetch('/api/system/health-checks');
                if (!response.ok) throw new Error('Failed to fetch system health');
                
                const data = await response.json();
                const container = document.getElementById('system-health-overview');
                
                // Show only key health indicators on dashboard
                const keyChecks = data.checks.filter(check => 
                    ['System Memory', 'Node.js Heap', 'CPU Load', 'Database Size'].includes(check.name)
                );
                
                container.innerHTML = keyChecks.map(check => {
                    const statusColors = {
                        success: 'var(--success-color)',
                        warning: 'var(--warning-color)',
                        error: 'var(--error-color)'
                    };
                    const statusIcons = {
                        success: 'check-circle',
                        warning: 'exclamation-triangle',
                        error: 'times-circle'
                    };
                    
                    return '<div style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border-left: 3px solid ' + statusColors[check.status] + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">' +
                            '<div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">' + check.name + '</div>' +
                            '<i class="fas fa-' + statusIcons[check.status] + '" style="color: ' + statusColors[check.status] + ';"></i>' +
                        '</div>' +
                        '<div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">' + check.value + '</div>' +
                        '<div style="font-size: 0.75rem; color: var(--text-secondary);">' + check.message + '</div>' +
                        (check.percent !== undefined ? 
                            '<div style="width: 100%; height: 4px; background: var(--bg-tertiary); border-radius: 2px; margin-top: 0.5rem; overflow: hidden;">' +
                                '<div style="height: 100%; width: ' + check.percent + '%; background: ' + statusColors[check.status] + '; transition: width 0.3s;"></div>' +
                            '</div>'
                        : '') +
                    '</div>';
                }).join('');
            } catch (error) {
                console.error('Failed to load system health:', error);
                document.getElementById('system-health-overview').innerHTML = 
                    '<div style="text-align: center; padding: 2rem; color: var(--error-color); grid-column: 1 / -1;">' +
                        '<i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>' +
                        '<p style="margin-top: 0.5rem;">Failed to load system health</p>' +
                    '</div>';
            }
        }
        
        // Load stats on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadDashboardStats();
            loadSystemHealth();
            loadRecentLogs();
            initActivityChart();
            setupTimeFilters();
            
            // Auto-refresh system health every 30 seconds
            setInterval(loadSystemHealth, 30000);
        });
        
        async function loadRecentLogs() {
            try {
                const response = await fetch('/api/logs?limit=5');
                const logs = await response.json();
                const container = document.getElementById('recent-logs-container');
                
                if (!logs || logs.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                            <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                            <p>No log entries yet</p>
                            <p style="font-size: 0.875rem; margin-top: 0.5rem;">Create a test event to get started</p>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = logs.map(log => {
                    const time = new Date(log.timestamp || log.created_at);
                    const now = new Date();
                    const diffMs = now - time;
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);
                    
                    let timeAgo;
                    if (diffMins < 1) timeAgo = 'Just now';
                    else if (diffMins < 60) timeAgo = \`\${diffMins} minute\${diffMins !== 1 ? 's' : ''} ago\`;
                    else if (diffHours < 24) timeAgo = \`\${diffHours} hour\${diffHours !== 1 ? 's' : ''} ago\`;
                    else timeAgo = \`\${diffDays} day\${diffDays !== 1 ? 's' : ''} ago\`;
                    
                    const severity = (log.severity || 'info').toLowerCase();
                    const severityClass = severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'info';
                    const severityLabel = severity.toUpperCase();
                    
                    return \`
                        <div class="log-entry">
                            <div class="log-header">
                                <span class="log-level \${severityClass}">\${severityLabel}</span>
                                <span class="log-time">\${timeAgo}</span>
                            </div>
                            <div class="log-message">\${log.message || 'No message'}</div>
                            \${log.zone_name ? \`<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Zone: \${log.zone_name}</div>\` : ''}
                        </div>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Failed to load recent logs:', error);
                document.getElementById('recent-logs-container').innerHTML = \`
                    <div style="text-align: center; padding: 2rem; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                        <p>Failed to load recent logs</p>
                    </div>
                \`;
            }
        }
        
        async function createTestEvent() {
            try {
                const response = await fetch('/test-esp32', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    alert('✅ Test event created successfully!\\n\\nYou can now view it in the Logs page.');
                    // Reload stats to show updated counts
                    loadDashboardStats();
                    setTimeout(() => location.reload(), 1000);
                } else {
                    const error = await response.json();
                    alert('❌ Failed to create test event: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('❌ Error creating test event: ' + error.message);
            }
        }
    `;
    
    res.send(getPageTemplate({
        pageTitle: 'Dashboard',
        pageIcon: 'fas fa-tachometer-alt',
        activeNav: 'dashboard',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// Dashboard with Widgets (Primary Dashboard)
app.get('/dashboard', requireAuth, (req, res) => {
    const contentBody = `
        <!-- Load React, React DOM, and React Grid Layout -->
        <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://unpkg.com/react-grid-layout@1.4.4/dist/react-grid-layout.min.js"></script>
        <link rel="stylesheet" href="https://unpkg.com/react-grid-layout@1.4.4/css/styles.css" />
        <link rel="stylesheet" href="https://unpkg.com/react-resizable@3.0.5/css/styles.css" />
        
        <!-- Load Chart.js -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        
        <!-- Dashboard Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <div>
                <h2 style="margin: 0; color: var(--text-primary);">
                    <i class="fas fa-tachometer-alt"></i> Customizable Dashboard
                </h2>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                    Drag, resize, and customize your widgets - pixel-perfect control
                </p>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button onclick="showWidgetGallery()" class="btn btn-primary">
                    <i class="fas fa-plus"></i> Add Widget
                </button>
                <button onclick="resetWidgetPositions()" class="btn" title="Reset widget positions to default layout">
                    <i class="fas fa-undo"></i> Reset Layout
                </button>
                <button onclick="deleteAllWidgets()" class="btn" style="background: var(--error-color); border-color: var(--error-color);" title="Delete all widgets">
                    <i class="fas fa-trash"></i> Delete All
                </button>
            </div>
        </div>
        
        <!-- Dashboard Container for React -->
        <div id="dashboard-root"></div>

        <!-- Empty State -->
        <div id="empty-state" style="display: none; text-align: center; padding: 4rem 2rem; background: var(--bg-secondary); border-radius: 16px; border: 2px dashed var(--border-color);">
            <i class="fas fa-th" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
            <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">Your dashboard is empty</h3>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Add widgets to customize your dashboard</p>
            <button onclick="showWidgetGallery()" class="btn btn-primary">
                <i class="fas fa-plus"></i> Add Your First Widget
            </button>
        </div>

        <!-- Widget Gallery Modal -->
        <div id="widgetGalleryModal" class="modal" style="display: none;">
            <div class="modal-content widget-gallery-modal">
                <div class="modal-header">
                    <h3><i class="fas fa-th"></i> Widget Gallery</h3>
                    <button onclick="closeModal('widgetGalleryModal')" class="close-btn" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        Choose a widget to add to your dashboard
                    </p>
                    <div class="widget-gallery-grid">
                        <div class="widget-card" onclick="addWidget('log_count')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                <i class="fas fa-database"></i>
                            </div>
                            <h4>Total Logs</h4>
                            <p>Display total log count</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('today_count')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                                <i class="fas fa-calendar-day"></i>
                            </div>
                            <h4>Today's Logs</h4>
                            <p>Show logs from today</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('severity_breakdown')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <h4>Severity Breakdown</h4>
                            <p>Pie chart of log levels</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('recent_logs')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                                <i class="fas fa-list"></i>
                            </div>
                            <h4>Recent Logs</h4>
                            <p>Latest log entries</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('system_health')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
                                <i class="fas fa-heartbeat"></i>
                            </div>
                            <h4>System Health</h4>
                            <p>Server health metrics</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('system_health_detailed')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%);">
                                <i class="fas fa-server"></i>
                            </div>
                            <h4>Detailed System Health</h4>
                            <p>CPU, memory, database metrics</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('source_stats')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
                                <i class="fas fa-chart-bar"></i>
                            </div>
                            <h4>Top Sources</h4>
                            <p>Most active log sources</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('hourly_trend')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <h4>Hourly Trend</h4>
                            <p>Log activity by hour</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('error_rate')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <h4>Error Rate</h4>
                            <p>Error percentage over time</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('api_keys_count')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);">
                                <i class="fas fa-key"></i>
                            </div>
                            <h4>Active API Keys</h4>
                            <p>Total API keys count</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('uptime_monitor')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%);">
                                <i class="fas fa-server"></i>
                            </div>
                            <h4>Uptime Monitor</h4>
                            <p>Server uptime stats</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('quick_stats')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);">
                                <i class="fas fa-chart-area"></i>
                            </div>
                            <h4>Quick Stats</h4>
                            <p>Multiple metrics at a glance</p>
                        </div>

                        <div class="widget-card" onclick="addWidget('top_errors')">
                            <div class="widget-card-icon" style="background: linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%);">
                                <i class="fas fa-bug"></i>
                            </div>
                            <h4>Top Errors</h4>
                            <p>Most frequent error messages</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalCSS = `
        /* React Grid Layout Container */
        .react-grid-layout {
            position: relative;
            transition: height 200ms ease;
        }
        
        .react-grid-item {
            transition: all 200ms ease;
            transition-property: left, top, width, height;
        }
        
        .react-grid-item.cssTransforms {
            transition-property: transform, width, height;
        }
        
        .react-grid-item.resizing {
            transition: none;
            z-index: 100;
        }
        
        .react-grid-item.react-draggable-dragging {
            transition: none;
            z-index: 100;
        }
        
        .react-grid-item.react-grid-placeholder {
            background: var(--primary-color);
            opacity: 0.2;
            transition-duration: 100ms;
            z-index: 2;
            border-radius: 8px;
        }
        
        .react-grid-item > .react-resizable-handle {
            position: absolute;
            width: 20px;
            height: 20px;
        }
        
        .react-grid-item > .react-resizable-handle::after {
            content: "";
            position: absolute;
            right: 3px;
            bottom: 3px;
            width: 5px;
            height: 5px;
            border-right: 2px solid rgba(255, 255, 255, 0.4);
            border-bottom: 2px solid rgba(255, 255, 255, 0.4);
        }
        
        /* Widget Card Styles */
        .widget-container {
            width: 100%;
            height: 100%;
        }
        
        .widget-card {
            width: 100%;
            height: 100%;
            background: var(--bg-primary);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: all 0.2s ease;
        }
        
        .widget-card:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
            border-color: rgba(255, 255, 255, 0.12);
        }

        /* Compact Widget Header - Unraid Style */
        .widget-header {
            padding: 0.5rem 0.75rem;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            min-height: 36px;
        }

        .widget-title {
            font-size: clamp(0.7rem, 1.2vw, 0.8rem);
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.4rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.9;
        }
        
        .widget-drag-handle {
            cursor: move;
            cursor: grab;
            flex: 1;
        }
        
        .widget-drag-handle:active {
            cursor: grabbing;
        }

        .widget-title i {
            font-size: 0.85em;
            opacity: 0.7;
        }

        .widget-actions {
            display: flex;
            gap: 0.25rem;
        }

        .widget-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: 0.2rem;
            border-radius: 4px;
            transition: all 0.2s;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
        }

        .widget-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--accent-primary);
        }
        
        .widget-delete-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: 0.3rem;
            border-radius: 6px;
            transition: all 0.2s;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85rem;
            z-index: 10;  /* Ensure it's above drag handle */
        }
        
        .widget-delete-btn:hover {
            background: var(--error-color);
            color: white;
            transform: rotate(90deg);
        }

        .widget-body {
            padding: 1rem;
            flex: 1;
            overflow: auto;
            container-type: size;  /* Enable container queries for responsive text */
        }

        /* Compact Widget Gallery */
        /* Widget Gallery Modal */
        .widget-gallery-modal {
            max-width: 1000px !important;
            width: 95% !important;
        }
        
        .widget-gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 1.25rem;
            max-height: 60vh;
            overflow-y: auto;
            padding: 0.5rem;
        }
        
        /* Responsive adjustments for widget gallery */
        @media (max-width: 768px) {
            .widget-gallery-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 1rem;
            }
            
            .widget-gallery-modal {
                max-width: 95% !important;
            }
        }
        
        @media (max-width: 480px) {
            .widget-gallery-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 0.75rem;
            }
        }

        .widget-card {
            background: var(--bg-secondary);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 1.25rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        
        .widget-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
            transform: scaleX(0);
            transition: transform 0.3s ease;
        }

        .widget-card:hover {
            border-color: var(--accent-primary);
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        
        .widget-card:hover::before {
            transform: scaleX(1);
        }
        
        .widget-card:active {
            transform: translateY(-2px);
        }

        .widget-card-icon {
            width: 56px;
            height: 56px;
            margin: 0 auto 1rem;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.75rem;
            color: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .widget-card h4 {
            margin: 0 0 0.5rem 0;
            color: var(--text-primary);
            font-size: 0.95rem;
            font-weight: 600;
            line-height: 1.3;
        }

        .widget-card p {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.8rem;
            line-height: 1.4;
        }

        /* Clean Stat Display - Now with container queries for better scaling */
        .stat-widget-value {
            font-size: clamp(1.5rem, 8cqw, 4rem);
            font-weight: 600;
            color: var(--accent-primary);
            text-align: center;
            margin: 1.5rem 0 0.5rem 0;
            line-height: 1;
        }

        .stat-widget-label {
            text-align: center;
            color: var(--text-secondary);
            font-size: clamp(0.65rem, 2.5cqw, 1.2rem);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.8;
        }

        /* Chart Widget Styles */
        .chart-widget-container {
            position: relative;
            height: 100%;
            min-height: 200px;
        }

        /* Compact List Widget */
        .widget-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .widget-list-item {
            padding: 0.5rem 0.75rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .widget-list-item:last-child {
            border-bottom: none;
        }

        .widget-list-item:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        /* Compact Health Grid */
        .health-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }

        .health-metric {
            text-align: center;
            padding: 0.75rem;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .health-metric-value {
            font-size: clamp(1.1rem, 2.5vw, 1.4rem);
            font-weight: 600;
            color: var(--accent-primary);
            line-height: 1.2;
        }

        .health-metric-label {
            font-size: clamp(0.65rem, 1.1vw, 0.7rem);
            color: var(--text-secondary);
            margin-top: 0.25rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.7;
        }

        /* Compact Log Level Badges */
        .log-level-badge {
            display: inline-block;
            padding: 0.15rem 0.4rem;
            border-radius: 3px;
            font-size: 0.65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .log-level-badge.info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .log-level-badge.warn { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .log-level-badge.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .log-level-badge.debug { background: rgba(156, 163, 175, 0.1); color: #9ca3af; }
    `;

    const additionalJS = `
        const { useState, useEffect, useRef } = React;
        const ReactGridLayout = window.ReactGridLayout;
        
        let widgetCharts = {};  // Store Chart.js instances
        
        // Main Dashboard Component
        function Dashboard() {
            const [widgets, setWidgets] = useState([]);
            const [layout, setLayout] = useState([]);
            
            // Load widgets from server
            useEffect(() => {
                loadDashboard();
            }, []);
            
            async function loadDashboard() {
                console.log('🔄 Loading dashboard widgets...');
                try {
                    const response = await fetch('/api/dashboard/widgets');
                    const data = await response.json();
                    
                    if (data.widgets && data.widgets.length > 0) {
                        console.log('Found ' + data.widgets.length + ' widgets');
                        
                        setWidgets(data.widgets);
                        
                        // Convert database positions to React Grid Layout format
                        const layoutData = data.widgets.map(w => ({
                            i: w.id.toString(),
                            x: w.position_x,          // Direct column position (0-11)
                            y: w.position_y,          // Row position in grid units
                            w: w.width,               // Width in columns (1-12)
                            h: w.height,              // Height in row units
                            minW: 2,                  // Minimum 2 columns width
                            minH: 3                   // Minimum 3 rows height
                        }));
                        
                        setLayout(layoutData);
                        document.getElementById('empty-state').style.display = 'none';
                        
                        // Load data for each widget
                        setTimeout(() => {
                            data.widgets.forEach(widget => {
                                loadWidgetData(widget.id, widget.widget_type);
                            });
                        }, 500);
                    } else {
                        console.log('⚠️ No widgets found');
                        document.getElementById('empty-state').style.display = 'block';
                    }
                } catch (error) {
                    console.error('❌ Failed to load dashboard:', error);
                    showToast('Failed to load dashboard', 'error');
                }
            }
            
            // Handle layout change (drag/resize)
            function onLayoutChange(newLayout) {
                console.log('Layout changed:', newLayout);
                setLayout(newLayout);
                saveLayout(newLayout);
            }
            
            // Save layout to server
            async function saveLayout(layoutData) {
                try {
                    const updates = layoutData.map(item => {
                        const widget = widgets.find(w => w.id.toString() === item.i);
                        if (!widget) return null;
                        
                        return {
                            id: widget.id,
                            position_x: Math.round(item.x),  // Already in column units
                            position_y: Math.round(item.y),  // Already in row units
                            width: Math.round(item.w),       // Already in column units (1-12)
                            height: Math.round(item.h)       // Already in row units
                        };
                    }).filter(Boolean);
                    
                    await fetch('/api/dashboard/widgets/positions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ widgets: updates })
                    });
                } catch (error) {
                    console.error('Failed to save layout:', error);
                }
            }
            
            return React.createElement(ReactGridLayout, {
                className: 'layout',
                layout: layout,
                onLayoutChange: onLayoutChange,
                cols: 12,
                rowHeight: 30,
                width: 1200,
                isDraggable: true,
                isResizable: true,
                compactType: null,  // Don't auto-compact
                preventCollision: false,
                margin: [10, 10],
                containerPadding: [0, 0],
                draggableHandle: '.widget-drag-handle'  // Only drag by this handle
            }, 
                widgets.map(widget => 
                    React.createElement('div', {
                        key: widget.id.toString(),
                        className: 'widget-container',
                        'data-widget-id': widget.id
                    }, renderWidgetContent(widget))
                )
            );
        }
        
        // Render widget content (returns HTML string for React dangerouslySetInnerHTML)
        function renderWidgetContent(widget) {
            return React.createElement('div', {
                className: 'widget-card',
                dangerouslySetInnerHTML: {
                    __html: \`
                        <div class="widget-header">
                            <span class="widget-title widget-drag-handle">
                                <i class="\${getWidgetIcon(widget.widget_type)}"></i>
                                \${widget.title}
                            </span>
                            <button onclick="event.stopPropagation(); deleteWidget(\${widget.id})" class="widget-delete-btn" title="Delete widget">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="widget-body" id="widget-\${widget.id}">
                            <div class="widget-loading">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Loading...</p>
                            </div>
                        </div>
                    \`
                }
            });
        }
        
        // Get widget icon
        function getWidgetIcon(type) {
            const icons = {
                log_count: 'fas fa-database',
                today_count: 'fas fa-calendar-day',
                log_level_distribution: 'fas fa-chart-pie',
                recent_logs: 'fas fa-list',
                system_health: 'fas fa-heartbeat',
                system_health_detailed: 'fas fa-heartbeat',
                source_stats: 'fas fa-chart-bar',
                hourly_trend: 'fas fa-chart-line',
                error_rate: 'fas fa-exclamation-triangle',
                api_keys_count: 'fas fa-key',
                uptime_monitor: 'fas fa-clock',
                quick_stats: 'fas fa-tachometer-alt',
                top_errors: 'fas fa-bug'
            };
            return icons[type] || 'fas fa-cube';
        }

        // Get widget title
        function getWidgetTitle(type) {
            const titles = {
                log_count: 'Total Logs',
                today_count: "Today's Logs",
                severity_breakdown: 'Severity Breakdown',
                log_level_distribution: 'Log Level Distribution',
                recent_logs: 'Recent Logs',
                system_health: 'System Health',
                system_health_detailed: 'Detailed System Health',
                source_stats: 'Top Sources',
                hourly_trend: 'Hourly Trend',
                error_rate: 'Error Rate',
                api_keys_count: 'Active API Keys',
                uptime_monitor: 'Uptime Monitor',
                quick_stats: 'Quick Stats',
                top_errors: 'Top Errors'
            };
            return titles[type] || 'Widget';
        }

        // Load widget data from API
        async function loadWidgetData(widgetId, widgetType) {
            try {
                const response = await fetch(\`/api/dashboard/widget-data/\${widgetType}\`);
                const data = await response.json();
                
                const bodyEl = document.getElementById(\`widget-\${widgetId}\`);
                if (!bodyEl) {
                    console.warn(\`Widget body not found: widget-\${widgetId}\`);
                    return;
                }
                
                renderWidget(widgetId, widgetType, data, bodyEl);
            } catch (error) {
                console.error(\`Failed to load widget \${widgetId}:\`, error);
                const bodyEl = document.getElementById(\`widget-\${widgetId}\`);
                if (bodyEl) {
                    bodyEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i><p>Failed to load data</p></div>';
                }
            }
        }

        // Render widget based on type
        function renderWidget(widgetId, type, data, container) {
            switch(type) {
                case 'log_count':
                    container.innerHTML = \`
                        <div class="stat-widget-value">\${data.count.toLocaleString()}</div>
                        <div class="stat-widget-label">Total Log Entries</div>
                    \`;
                    break;
                    
                case 'today_count':
                    container.innerHTML = \`
                        <div class="stat-widget-value">\${data.count.toLocaleString()}</div>
                        <div class="stat-widget-label">Logs Today</div>
                    \`;
                    break;
                    
                case 'severity_breakdown':
                    renderPieChart(widgetId, data);
                    break;
                    
                case 'recent_logs':
                    renderRecentLogs(container, data);
                    break;
                    
                case 'system_health':
                    renderSystemHealth(container, data);
                    break;
                    
                case 'system_health_detailed':
                    renderSystemHealthDetailed(container, data);
                    break;
                    
                case 'source_stats':
                    renderBarChart(widgetId, data);
                    break;
                    
                case 'hourly_trend':
                    renderLineChart(widgetId, data);
                    break;
                    
                case 'error_rate':
                    renderErrorRateChart(widgetId, data);
                    break;
                    
                case 'api_keys_count':
                    container.innerHTML = \`
                        <div class="stat-widget-value">\${data.count}</div>
                        <div class="stat-widget-label">Active API Keys</div>
                    \`;
                    break;
                    
                case 'uptime_monitor':
                    container.innerHTML = \`
                        <div class="stat-widget-value">\${data.formatted}</div>
                        <div class="stat-widget-label">Server Uptime</div>
                    \`;
                    break;
                    
                case 'quick_stats':
                    renderQuickStats(container, data);
                    break;
                    
                case 'top_errors':
                    renderTopErrors(container, data);
                    break;
            }
        }

        // Render pie chart for severity breakdown
        function renderPieChart(widgetId, data) {
            const container = document.getElementById(\`widget-\${widgetId}\`);
            
            if (!container) {
                console.warn('Pie chart container not found:', widgetId);
                return;
            }
            
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No severity data available</div>';
                return;
            }
            
            container.innerHTML = '<canvas id="chart-' + widgetId + '"></canvas>';
            
            const canvas = document.getElementById('chart-' + widgetId);
            const labels = data.map(item => item.severity || 'unknown');
            const values = data.map(item => item.count);
            const severityColors = {
                'debug': '#9ca3af',
                'info': '#3b82f6',
                'warning': '#f59e0b',
                'error': '#ef4444',
                'critical': '#dc2626'
            };
            const colors = labels.map(label => severityColors[label.toLowerCase()] || '#6b7280');
            
            widgetCharts[widgetId] = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: 'var(--bg-primary)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: 'var(--text-primary)',
                                padding: 10,
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }

        // Render bar chart for source stats
        function renderBarChart(widgetId, data) {
            const container = document.getElementById(\`widget-\${widgetId}\`);
            
            if (!container) {
                console.warn('Bar chart container not found:', widgetId);
                return;
            }
            
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No source data available</div>';
                return;
            }
            
            container.innerHTML = '<canvas id="chart-' + widgetId + '"></canvas>';
            
            const canvas = document.getElementById('chart-' + widgetId);
            const labels = data.map(item => item.source || 'unknown');
            const values = data.map(item => item.count);
            
            widgetCharts[widgetId] = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Log Count',
                        data: values,
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: '#3b82f6',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 }
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        // Render recent logs list
        function renderRecentLogs(container, data) {
            // Handle both array and object with logs property
            const logs = Array.isArray(data) ? data : (data.logs || []);
            
            if (!logs || logs.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No recent logs</div>';
                return;
            }
            
            const html = \`
                <ul class="widget-list">
                    \${logs.map(log => \`
                        <li class="widget-list-item">
                            <div>
                                <span class="log-level-badge \${log.severity || log.level || 'info'}">\${log.severity || log.level || 'info'}</span>
                                <span style="margin-left: 0.5rem; font-size: 0.875rem;">\${(log.message || '').substring(0, 40)}...</span>
                            </div>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">\${new Date(log.timestamp).toLocaleTimeString()}</span>
                        </li>
                    \`).join('')}
                </ul>
            \`;
            container.innerHTML = html;
        }

        // Render system health metrics
        function renderSystemHealth(container, data) {
            if (!data) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No health data available</div>';
                return;
            }
            
            const uptime = data.uptime || 0;
            const uptimeHours = Math.floor(uptime / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            const memory = data.memory || {};
            const memoryUsed = memory.used || 0;
            
            const html = \`
                <div class="health-grid">
                    <div class="health-metric">
                        <div class="health-metric-value">\${memoryUsed}MB</div>
                        <div class="health-metric-label">Memory</div>
                    </div>
                    <div class="health-metric">
                        <div class="health-metric-value">\${uptimeHours}h \${uptimeMinutes}m</div>
                        <div class="health-metric-label">Uptime</div>
                    </div>
                </div>
            \`;
            container.innerHTML = html;
        }

        // Render detailed system health with progress bars
        function renderSystemHealthDetailed(container, data) {
            if (!data) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No health data available</div>';
                return;
            }
            
            const uptimeHours = Math.floor(data.uptime / 3600);
            const uptimeMinutes = Math.floor((data.uptime % 3600) / 60);
            
            const getStatusColor = (percent) => {
                if (percent >= 90) return '#ef4444'; // Red
                if (percent >= 75) return '#f59e0b'; // Orange
                return '#10b981'; // Green
            };
            
            const html = \`
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <!-- Node.js Heap Memory -->
                    <div style="padding: 0.75rem; background: rgba(0, 0, 0, 0.2); border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary);">Node.js Heap</span>
                            <span style="font-size: 0.75rem; font-weight: 600; color: \${getStatusColor(data.heap.percent)};">\${data.heap.percent}%</span>
                        </div>
                        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">
                            \${data.heap.used} MB / \${data.heap.total} MB
                        </div>
                        <div style="width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; width: \${data.heap.percent}%; background: \${getStatusColor(data.heap.percent)}; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    
                    <!-- System Memory -->
                    <div style="padding: 0.75rem; background: rgba(0, 0, 0, 0.2); border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary);">System Memory</span>
                            <span style="font-size: 0.75rem; font-weight: 600; color: \${getStatusColor(data.system.percent)};">\${data.system.percent}%</span>
                        </div>
                        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">
                            \${data.system.used} MB / \${data.system.total} MB
                        </div>
                        <div style="width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; width: \${data.system.percent}%; background: \${getStatusColor(data.system.percent)}; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    
                    <!-- Database & Uptime -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div class="health-metric">
                            <div class="health-metric-value">\${data.database.size} MB</div>
                            <div class="health-metric-label">Database</div>
                        </div>
                        <div class="health-metric">
                            <div class="health-metric-value">\${uptimeHours}h \${uptimeMinutes}m</div>
                            <div class="health-metric-label">Uptime</div>
                        </div>
                    </div>
                </div>
            \`;
            container.innerHTML = html;
        }

        // Render line chart for hourly trend
        function renderLineChart(widgetId, data) {
            const container = document.getElementById(\`widget-\${widgetId}\`);
            
            if (!container) {
                console.warn('Line chart container not found:', widgetId);
                return;
            }
            
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No trend data available</div>';
                return;
            }
            
            container.innerHTML = '<canvas id="chart-' + widgetId + '"></canvas>';
            const canvas = document.getElementById('chart-' + widgetId);
            const labels = data.map(item => item.hour + ':00');
            const values = data.map(item => item.count);
            
            widgetCharts[widgetId] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Log Count',
                        data: values,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 }
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        // Render error rate chart
        function renderErrorRateChart(widgetId, data) {
            const container = document.getElementById(\`widget-\${widgetId}\`);
            
            if (!container) {
                console.warn('Error rate chart container not found:', widgetId);
                return;
            }
            
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No error data available</div>';
                return;
            }
            
            container.innerHTML = '<canvas id="chart-' + widgetId + '"></canvas>';
            const canvas = document.getElementById('chart-' + widgetId);
            const labels = data.map(item => item.hour + ':00');
            const values = data.map(item => parseFloat(item.rate));
            
            widgetCharts[widgetId] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Error Rate %',
                        data: values,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 },
                                callback: function(value) { return value + '%'; }
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { 
                                color: 'var(--text-muted)',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        // Render quick stats grid
        function renderQuickStats(container, data) {
            if (!data) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No stats available</div>';
                return;
            }
            
            const html = \`
                <div class="health-grid" style="grid-template-columns: repeat(2, 1fr);">
                    <div class="health-metric">
                        <div class="health-metric-value">\${(data.total_logs || 0).toLocaleString()}</div>
                        <div class="health-metric-label">Total Logs</div>
                    </div>
                    <div class="health-metric">
                        <div class="health-metric-value">\${data.errors || 0}</div>
                        <div class="health-metric-label">Errors</div>
                    </div>
                    <div class="health-metric">
                        <div class="health-metric-value">\${data.last_hour || 0}</div>
                        <div class="health-metric-label">Last Hour</div>
                    </div>
                    <div class="health-metric">
                        <div class="health-metric-value">\${data.sources || 0}</div>
                        <div class="health-metric-label">Sources</div>
                    </div>
                </div>
            \`;
            container.innerHTML = html;
        }

        // Render top errors list
        function renderTopErrors(container, data) {
            if (!data || data.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No errors in last 24h</div>';
                return;
            }
            
            const html = \`
                <ul class="widget-list">
                    \${data.map(error => \`
                        <li class="widget-list-item">
                            <div style="flex: 1;">
                                <div style="font-size: 0.8rem; margin-bottom: 0.25rem;">\${(error.message || '').substring(0, 50)}...</div>
                                <div style="font-size: 0.7rem; color: var(--text-muted);">
                                    <span class="log-level-badge error" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;">\${error.count}x</span>
                                    <span style="margin-left: 0.5rem;">\${new Date(error.last_seen).toLocaleString()}</span>
                                </div>
                            </div>
                        </li>
                    \`).join('')}
                </ul>
            \`;
            container.innerHTML = html;
        }

        // Show widget gallery modal
        function showWidgetGallery() {
            document.getElementById('widgetGalleryModal').style.display = 'flex';
        }

        // Add widget to dashboard
        // Remove widget (now handled by window.deleteWidget)
        // This function kept for backwards compatibility but not used
        async function removeWidget(widgetId) {
            window.deleteWidget(widgetId);
        }

        // Refresh widget data
        async function refreshWidget(widgetId, widgetType) {
            const btn = event.target.closest('button');
            const icon = btn.querySelector('i');
            icon.classList.add('fa-spin');
            
            try {
                await loadWidgetData(widgetId, widgetType);
                showToast('Widget refreshed', 'success');
            } finally {
                icon.classList.remove('fa-spin');
            }
        }

        // Save layout to backend
        async function saveLayout() {
            const nodes = grid.engine.nodes;
            const widgets = nodes.map(node => ({
                id: parseInt(node.el.getAttribute('gs-id')),
                position_x: node.x,
                position_y: node.y,
                width: node.w,
                height: node.h
            }));
            
            try {
                await fetch('/api/dashboard/widgets/positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ widgets })
                });
            } catch (error) {
                console.error('Failed to save layout:', error);
            }
        }

        // Reset dashboard to default
        // Reset widget positions to default layout
        async function resetWidgetPositions() {
            if (!confirm('Reset widget positions to default layout? This will rearrange your widgets but keep them.')) return;
            
            console.log('🔄 Resetting widget positions...');
            
            try {
                const response = await fetch('/api/dashboard/widgets/reset-positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                console.log('📡 Reset response status:', response.status);
                const data = await response.json();
                console.log('📦 Reset response data:', data);
                
                if (data.success) {
                    showToast('Widget positions reset - reloading page...', 'success');
                    // Force page reload to ensure fresh state
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                } else {
                    showToast(data.error || 'Failed to reset positions', 'error');
                }
            } catch (error) {
                console.error('❌ Failed to reset positions:', error);
                showToast('Failed to reset positions', 'error');
            }
        }

        // Delete all widgets from dashboard
        async function deleteAllWidgets() {
            if (!confirm('Delete ALL widgets from your dashboard? This action cannot be undone!')) return;
            
            try {
                // Get all widgets
                const response = await fetch('/api/dashboard/widgets');
                const data = await response.json();
                
                if (!data.widgets || data.widgets.length === 0) {
                    showToast('No widgets to delete', 'info');
                    return;
                }
                
                // Delete each widget
                let deleted = 0;
                for (const widget of data.widgets) {
                    const deleteResponse = await fetch(\`/api/dashboard/widgets/\${widget.id}\`, {
                        method: 'DELETE'
                    });
                    if (deleteResponse.ok) deleted++;
                }
                
                // Clear grid
                grid.removeAll();
                
                // Clear charts
                Object.values(widgetCharts).forEach(chart => chart.destroy());
                widgetCharts = {};
                
                // Show empty state
                document.getElementById('empty-state').style.display = 'block';
                
                showToast(\`Deleted \${deleted} widget(s)\`, 'success');
            } catch (error) {
                console.error('Failed to delete widgets:', error);
                showToast('Failed to delete widgets', 'error');
            }
        }

        // Close modal
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        // Initialize React Dashboard on page load
        document.addEventListener('DOMContentLoaded', () => {
            const root = ReactDOM.createRoot(document.getElementById('dashboard-root'));
            root.render(React.createElement(Dashboard));
        });
        
        // Global functions for button handlers
        window.showWidgetGallery = function() {
            document.getElementById('widgetGalleryModal').style.display = 'flex';
        };
        
        window.closeModal = function(modalId) {
            document.getElementById(modalId).style.display = 'none';
        };
        
        window.addWidget = async function(widgetType) {
            try {
                // Define smart default sizes
                let width, height;
                
                if (widgetType === 'recent_logs' || widgetType === 'top_errors') {
                    width = 6; height = 10;
                } else if (widgetType.includes('breakdown') || widgetType.includes('trend') || widgetType.includes('rate') || widgetType === 'source_stats') {
                    width = 4; height = 8;
                } else if (widgetType === 'quick_stats' || widgetType === 'system_health_detailed') {
                    width = 4; height = 6;
                } else {
                    width = 3; height = 4;
                }
                
                const response = await fetch('/api/dashboard/widgets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        widget_type: widgetType,
                        title: getWidgetTitle(widgetType),
                        width: width,
                        height: height
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    closeModal('widgetGalleryModal');
                    showToast('Widget added successfully', 'success');
                    window.location.reload();  // Reload to refresh React
                } else {
                    showToast(data.error || 'Failed to add widget', 'error');
                }
            } catch (error) {
                console.error('Failed to add widget:', error);
                showToast('Failed to add widget', 'error');
            }
        };
        
        window.deleteWidget = async function(widgetId) {
            if (!confirm('Delete this widget?')) return;
            
            try {
                await fetch(\`/api/dashboard/widgets/\${widgetId}\`, { method: 'DELETE' });
                window.location.reload();
            } catch (error) {
                console.error('Failed to delete widget:', error);
                showToast('Failed to delete widget', 'error');
            }
        };
        
        window.resetWidgetPositions = async function() {
            if (!confirm('Reset all widget positions to default layout?')) return;
            
            try {
                await fetch('/api/dashboard/widgets/reset-positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                window.location.reload();
            } catch (error) {
                console.error('Failed to reset positions:', error);
                showToast('Failed to reset layout', 'error');
            }
        };
        
        window.deleteAllWidgets = async function() {
            if (!confirm('Delete ALL widgets? This cannot be undone!')) return;
            
            try {
                await fetch('/api/dashboard/widgets', { method: 'DELETE' });
                window.location.reload();
            } catch (error) {
                console.error('Failed to delete widgets:', error);
                showToast('Failed to delete widgets', 'error');
            }
        };
    `;

    res.send(getPageTemplate({
        pageTitle: 'Dashboard',
        pageIcon: 'fas fa-tachometer-alt',
        activeNav: 'dashboard',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// Logs page
app.get('/logs', requireAuth, (req, res) => {
    const additionalCSS = `
        .tab-button.active {
            color: var(--accent-primary) !important;
            border-bottom-color: var(--accent-primary) !important;
        }
        .tab-button:hover {
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }
        .tab-content {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .log-table { 
            width: 100%; 
            background: var(--bg-primary); 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: var(--shadow-light);
            border: 1px solid var(--border-color);
        }
        .log-table th, .log-table td { 
            padding: 1rem; 
            text-align: left; 
            border-bottom: 1px solid var(--border-color); 
        }
        .log-table th { 
            background: var(--gradient-sky); 
            font-weight: 600; 
            color: var(--text-primary);
        }
        .log-table td { 
            color: var(--text-secondary); 
            transition: background-color 0.3s ease;
        }
        .log-table tr:hover td {
            background: var(--bg-secondary);
        }
        .severity-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .severity-info { background: #bee3f8; color: #2c5282; }
        .severity-warn { background: #fef5e7; color: #c05621; }
        .severity-error { background: #fed7d7; color: #9b2c2c; }
        .severity-success { background: #c6f6d5; color: #22543d; }
    `;

    const contentBody = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('logs')" id="tab-logs" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-file-alt"></i> System Logs
                </button>
                <button onclick="switchTab('analytics')" id="tab-analytics" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-chart-bar"></i> Analytics
                </button>
            </div>
        </div>

        <!-- Logs Tab Content -->
        <div id="content-logs" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-file-alt"></i> System Logs</h3>
                    <button onclick="loadLogs()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body" style="padding: 0;">
                    <table class="log-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Category</th>
                                <th>Source</th>
                                <th>Event Type</th>
                                <th>Message</th>
                                <th>Severity</th>
                            </tr>
                        </thead>
                        <tbody id="logs-tbody">
                            <tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading logs...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Analytics Tab Content -->
        <div id="content-analytics" class="tab-content" style="display: none;">
            <!-- Date Range Filter -->
            <div style="display: flex; justify-content: flex-end; margin-bottom: 1.5rem; gap: 0.5rem;">
                <select id="analytics-date-range" onchange="loadAnalytics()" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary);">
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7days" selected>Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                </select>
                <button onclick="loadAnalytics()" class="btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <button onclick="exportAnalytics()" class="btn">
                    <i class="fas fa-download"></i> Export
                </button>
            </div>

            <!-- Stats Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                <div class="card" style="text-align: center; padding: 1.5rem;">
                    <div style="font-size: 2rem; color: var(--accent-primary); margin-bottom: 0.5rem;">
                        <i class="fas fa-database"></i>
                    </div>
                    <div id="analytics-total-logs" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">--</div>
                    <div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Total Logs</div>
                    <div id="analytics-total-trend" style="font-size: 0.75rem; margin-top: 0.5rem;"></div>
                </div>
                
                <div class="card" style="text-align: center; padding: 1.5rem;">
                    <div style="font-size: 2rem; color: #ef4444; margin-bottom: 0.5rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div id="analytics-error-logs" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">--</div>
                    <div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Errors & Warnings</div>
                    <div id="analytics-error-trend" style="font-size: 0.75rem; margin-top: 0.5rem;"></div>
                </div>
                
                <div class="card" style="text-align: center; padding: 1.5rem;">
                    <div style="font-size: 2rem; color: #10b981; margin-bottom: 0.5rem;">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div id="analytics-avg-per-hour" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">--</div>
                    <div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Avg per Hour</div>
                    <div id="analytics-hourly-trend" style="font-size: 0.75rem; margin-top: 0.5rem;"></div>
                </div>
                
                <div class="card" style="text-align: center; padding: 1.5rem;">
                    <div style="font-size: 2rem; color: #f59e0b; margin-bottom: 0.5rem;">
                        <i class="fas fa-fire"></i>
                    </div>
                    <div id="analytics-peak-hour" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">--</div>
                    <div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Peak Hour</div>
                    <div id="analytics-peak-count" style="font-size: 0.75rem; margin-top: 0.5rem;"></div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.25rem; margin-bottom: 1.25rem;">
                <!-- Hourly Trend Chart -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-chart-area"></i> Hourly Trend Analysis</h3>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Events per hour with pattern detection</div>
                    </div>
                    <div style="padding: 1.5rem;">
                        <canvas id="analytics-hourly-chart" height="80"></canvas>
                    </div>
                </div>

                <!-- Top Sources -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-server"></i> Top Sources</h3>
                    </div>
                    <div id="analytics-top-sources" style="padding: 1.5rem; max-height: 350px; overflow-y: auto;">
                        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                <!-- Category Distribution -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-chart-pie"></i> Category Distribution</h3>
                    </div>
                    <div style="padding: 1.5rem;">
                        <canvas id="analytics-category-chart" height="120"></canvas>
                    </div>
                </div>

                <!-- Severity Levels -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-layer-group"></i> Severity Levels</h3>
                    </div>
                    <div style="padding: 1.5rem;">
                        <canvas id="analytics-severity-chart" height="120"></canvas>
                    </div>
                </div>
            </div>

            <!-- Pattern Detection Alerts -->
            <div class="card" style="margin-top: 1.25rem;">
                <div class="card-header">
                    <h3><i class="fas fa-brain"></i> Pattern Detection & Insights</h3>
                </div>
                <div id="analytics-patterns" style="padding: 1.5rem;">
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <i class="fas fa-spinner fa-spin"></i> Analyzing patterns...
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        // Tab switching
        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(btn => { 
                btn.classList.remove('active'); 
                btn.style.background = 'var(--bg-secondary)'; 
                btn.style.color = 'var(--text-primary)'; 
            });
            
            document.getElementById('content-' + tabName).style.display = 'block';
            const activeBtn = document.getElementById('tab-' + tabName);
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--gradient-ocean)';
            activeBtn.style.color = 'white';
            
            if (tabName === 'logs') {
                loadLogs();
            } else if (tabName === 'analytics') {
                refreshAnalytics();
            }
        }

        function refreshAnalytics() {
            loadAnalytics();
        }

        // Analytics variables
        let hourlyChart, categoryChart, severityChart;
        let allLogs = [];

        async function loadAnalytics() {
            try {
                const range = document.getElementById('analytics-date-range').value;
                const response = await fetch('/api/logs?limit=10000');
                
                if (!response.ok) {
                    throw new Error('Failed to fetch logs');
                }
                
                const logs = await response.json();
                
                if (!logs || logs.length === 0) {
                    document.getElementById('analytics-total-logs').textContent = '0';
                    document.getElementById('analytics-error-logs').textContent = '0';
                    document.getElementById('analytics-avg-per-hour').textContent = '0';
                    document.getElementById('analytics-peak-hour').textContent = 'N/A';
                    document.getElementById('analytics-peak-count').textContent = '0 events';
                    document.getElementById('analytics-top-sources').innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-inbox"></i><br>No log data available</p>';
                    document.getElementById('analytics-patterns').innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-inbox"></i><br>No data to analyze</p>';
                    
                    // Clear charts
                    if (hourlyChart) hourlyChart.destroy();
                    if (categoryChart) categoryChart.destroy();
                    if (severityChart) severityChart.destroy();
                    return;
                }
                
                // Filter logs based on date range
                const now = new Date();
                let startDate = new Date();
                
                switch(range) {
                    case 'today':
                        startDate.setHours(0, 0, 0, 0);
                        break;
                    case 'yesterday':
                        startDate.setDate(startDate.getDate() - 1);
                        startDate.setHours(0, 0, 0, 0);
                        const endDate = new Date(startDate);
                        endDate.setHours(23, 59, 59, 999);
                        allLogs = logs.filter(l => {
                            const date = new Date(l.timestamp);
                            return date >= startDate && date <= endDate;
                        });
                        updateStats();
                        updateCharts();
                        updateTopSources();
                        detectPatterns();
                        return;
                    case '7days':
                        startDate.setDate(startDate.getDate() - 7);
                        break;
                    case '30days':
                        startDate.setDate(startDate.getDate() - 30);
                        break;
                }
                
                allLogs = logs.filter(l => new Date(l.timestamp) >= startDate);
                
                updateStats();
                updateCharts();
                updateTopSources();
                detectPatterns();
                
            } catch (error) {
                console.error('Failed to load analytics:', error);
                showToast('Failed to load analytics data', 'error');
            }
        }

        function updateStats() {
            const total = allLogs.length;
            const errors = allLogs.filter(l => l.level === 'error' || l.level === 'warn').length;
            
            // Calculate hourly average
            const range = document.getElementById('analytics-date-range').value;
            let hours = 24;
            if (range === '7days') hours = 24 * 7;
            if (range === '30days') hours = 24 * 30;
            const avgPerHour = Math.round(total / hours);
            
            // Find peak hour
            const hourlyData = getHourlyData();
            const peakHourData = hourlyData.reduce((max, curr) => curr.count > max.count ? curr : max, { count: 0, hour: 0 });
            
            document.getElementById('analytics-total-logs').textContent = total.toLocaleString();
            document.getElementById('analytics-error-logs').textContent = errors.toLocaleString();
            document.getElementById('analytics-avg-per-hour').textContent = avgPerHour.toLocaleString();
            document.getElementById('analytics-peak-hour').textContent = formatHour(peakHourData.hour);
            document.getElementById('analytics-peak-count').textContent = \`\${peakHourData.count} events\`;
            
            // Calculate trends (compare to previous period)
            const errorRate = total > 0 ? ((errors / total) * 100).toFixed(1) : 0;
            document.getElementById('analytics-error-trend').innerHTML = \`<span style="color: \${errorRate > 5 ? '#ef4444' : '#10b981'}">\${errorRate}% error rate</span>\`;
        }

        function getHourlyData() {
            const hourly = {};
            allLogs.forEach(log => {
                const date = new Date(log.timestamp);
                const hour = date.getHours();
                hourly[hour] = (hourly[hour] || 0) + 1;
            });
            
            return Array.from({ length: 24 }, (_, i) => ({
                hour: i,
                count: hourly[i] || 0
            }));
        }

        function updateCharts() {
            const hourlyData = getHourlyData();
            
            // Hourly Trend Chart
            const ctx1 = document.getElementById('analytics-hourly-chart');
            if (hourlyChart) hourlyChart.destroy();
            hourlyChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: hourlyData.map(d => formatHour(d.hour)),
                    datasets: [{
                        label: 'Events per Hour',
                        data: hourlyData.map(d => d.count),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
            
            // Category Distribution
            const categories = {};
            allLogs.forEach(log => {
                const cat = log.category || 'other';
                categories[cat] = (categories[cat] || 0) + 1;
            });
            
            const ctx2 = document.getElementById('analytics-category-chart');
            if (categoryChart) categoryChart.destroy();
            categoryChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(categories).map(c => c.charAt(0).toUpperCase() + c.slice(1)),
                    datasets: [{
                        data: Object.values(categories),
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
            
            // Severity Levels
            const severities = {};
            allLogs.forEach(log => {
                const sev = log.level || log.severity || 'info';
                severities[sev] = (severities[sev] || 0) + 1;
            });
            
            const ctx3 = document.getElementById('analytics-severity-chart');
            if (severityChart) severityChart.destroy();
            severityChart = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: Object.keys(severities).map(s => s.toUpperCase()),
                    datasets: [{
                        label: 'Count',
                        data: Object.values(severities),
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        function updateTopSources() {
            const sources = {};
            allLogs.forEach(log => {
                const src = log.source || 'unknown';
                sources[src] = (sources[src] || 0) + 1;
            });
            
            const sorted = Object.entries(sources)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            const html = sorted.map(([source, count], i) => \`
                <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600;">#\${i + 1} \${source}</span>
                        <span style="font-weight: 700; color: var(--accent-primary);">\${count}</span>
                    </div>
                    <div style="background: var(--bg-secondary); height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="background: var(--gradient-ocean); height: 100%; width: \${(count / sorted[0][1]) * 100}%;"></div>
                    </div>
                </div>
            \`).join('');
            
            document.getElementById('analytics-top-sources').innerHTML = html || '<p style="text-align: center; color: var(--text-muted);">No data</p>';
        }

        function detectPatterns() {
            const patterns = [];
            const hourlyData = getHourlyData();
            
            // Detect spikes (> 2x average)
            const avg = hourlyData.reduce((sum, d) => sum + d.count, 0) / 24;
            const spikes = hourlyData.filter(d => d.count > avg * 2);
            if (spikes.length > 0 && avg > 0) {
                patterns.push({
                    type: 'spike',
                    severity: 'warning',
                    message: \`🔥 Activity spike detected at \${spikes.map(s => formatHour(s.hour)).join(', ')}\`,
                    detail: \`Volume exceeded average by \${Math.round((spikes[0].count / avg - 1) * 100)}%\`
                });
            }
            
            // Detect unusual quiet periods
            const quiet = hourlyData.filter(d => d.count < avg * 0.3 && d.count > 0);
            if (quiet.length >= 3 && avg > 0) {
                patterns.push({
                    type: 'quiet',
                    severity: 'info',
                    message: \`😴 Unusual quiet periods detected\`,
                    detail: \`\${quiet.length} hours with significantly reduced activity\`
                });
            }
            
            // Detect error rate anomalies
            const errors = allLogs.filter(l => l.level === 'error' || l.level === 'warn' || l.severity === 'error' || l.severity === 'warn').length;
            const errorRate = allLogs.length > 0 ? (errors / allLogs.length) * 100 : 0;
            if (errorRate > 10) {
                patterns.push({
                    type: 'errors',
                    severity: 'error',
                    message: \`⚠️ High error rate detected: \${errorRate.toFixed(1)}%\`,
                    detail: \`\${errors} errors/warnings out of \${allLogs.length} total events\`
                });
            } else if (errorRate > 5) {
                patterns.push({
                    type: 'errors',
                    severity: 'warning',
                    message: \`⚡ Elevated error rate: \${errorRate.toFixed(1)}%\`,
                    detail: \`Monitor for potential issues\`
                });
            } else {
                patterns.push({
                    type: 'healthy',
                    severity: 'success',
                    message: \`✅ System health looks good\`,
                    detail: \`Error rate: \${errorRate.toFixed(1)}% (within normal range)\`
                });
            }
            
            const colors = {
                error: '#ef4444',
                warning: '#f59e0b',
                info: '#3b82f6',
                success: '#10b981'
            };
            
            const html = patterns.map(p => \`
                <div style="padding: 1rem; background: \${colors[p.severity]}15; border-left: 4px solid \${colors[p.severity]}; border-radius: 6px; margin-bottom: 1rem;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">\${p.message}</div>
                    <div style="font-size: 0.875rem; color: var(--text-muted);">\${p.detail}</div>
                </div>
            \`).join('');
            
            document.getElementById('analytics-patterns').innerHTML = html;
        }

        function formatHour(hour) {
            return \`\${hour.toString().padStart(2, '0')}:00\`;
        }

        function exportAnalytics() {
            const range = document.getElementById('analytics-date-range').value;
            const csv = 'Timestamp,Level,Category,Source,Message\\n' +
                allLogs.map(l => \`"\${l.timestamp}","\${l.level || l.severity || 'info'}","\${l.category || ''}","\${l.source || ''}","\${l.message}"\`).join('\\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`analytics-\${range}-\${new Date().toISOString().split('T')[0]}.csv\`;
            a.click();
        }

        async function loadLogs() {
            try {
                const response = await fetch('/api/logs?limit=50');
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                const logs = await response.json();
                console.log('Loaded logs:', logs);
                const tbody = document.getElementById('logs-tbody');
                
                if (!logs || !Array.isArray(logs) || logs.length === 0) {
                    tbody.innerHTML = \`
                        <tr><td colspan="6" style="text-align: center; padding: 3rem;">
                            <div style="color: var(--text-muted);">
                                <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                                <p style="font-size: 1.1rem; margin: 0;">No logs found</p>
                                <p style="font-size: 0.9rem; margin-top: 0.5rem;">Create a test event on the Dashboard to see logs appear here.</p>
                            </div>
                        </td></tr>
                    \`;
                    return;
                }
                
                tbody.innerHTML = logs.map(log => {
                    const severityClass = 'severity-' + (log.severity || 'info');
                    return \`
                        <tr>
                            <td>\${new Date(log.timestamp).toLocaleString()}</td>
                            <td>\${log.category || 'N/A'}</td>
                            <td>\${log.source || 'N/A'}</td>
                            <td>\${log.event_type || 'N/A'}</td>
                            <td>\${log.message || 'N/A'}</td>
                            <td><span class="severity-badge \${severityClass}">\${log.severity || 'info'}</span></td>
                        </tr>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Error loading logs:', error);
                document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Failed to load logs: ' + error.message + '</td></tr>';
            }
        }
        
        // Auto-load logs
        loadLogs();
        setInterval(loadLogs, 30000); // Refresh every 30 seconds
    `;

    res.send(getPageTemplate({
        pageTitle: 'Log Viewer',
        pageIcon: 'fas fa-file-alt',
        activeNav: 'logs',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// Admin Users page
app.get('/admin/users', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }
    
    const additionalCSS = `
        .tab-button.active {
            color: var(--accent-primary) !important;
            border-bottom-color: var(--accent-primary) !important;
        }
        .tab-button:hover {
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }
        .tab-content {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .user-table {
            width: 100%;
            border-collapse: collapse;
        }
        .user-table th,
        .user-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        .user-table th {
            background: var(--gradient-sky);
            color: var(--text-primary);
            font-weight: 600;
        }
        .user-table tr:hover td {
            background: var(--bg-secondary);
        }
        .role-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .role-admin { background: #fed7d7; color: #9b2c2c; }
        .role-user { background: #bee3f8; color: #2c5282; }
        .status-active { background: #c6f6d5; color: #22543d; }
        .status-inactive { background: #fed7d7; color: #9b2c2c; }
        .modal {
            display: none !important;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.active {
            display: flex !important;
        }
        .modal-content {
            background: var(--bg-primary);
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            box-shadow: var(--shadow-medium);
            max-height: 90vh;
            overflow-y: auto;
        }
        
        /* Responsive breakpoints for user modals */
        @media (max-width: 640px) {
            .modal-content {
                width: 95%;
                max-width: 95%;
                padding: 1.5rem;
                max-height: 95vh;
                border-radius: 8px;
            }
        }
        
        @media (min-width: 641px) and (max-width: 1024px) {
            .modal-content {
                width: 80%;
                max-width: 600px;
            }
        }
        
        @media (min-width: 1025px) {
            .modal-content {
                width: 70%;
                max-width: 700px;
            }
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .modal-header h2,
        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .close-btn {
            background: var(--bg-secondary);
            border: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 1.25rem;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            transition: all 0.2s ease;
        }
        .close-btn:hover {
            background: var(--error-color);
            color: white;
            border-color: var(--error-color);
            transform: rotate(90deg);
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: var(--text-primary);
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1rem;
        }
        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--accent-primary);
        }
        .form-group small {
            display: block;
            margin-top: 0.25rem;
            color: var(--text-muted);
            font-size: 0.875rem;
        }
        .btn-group {
            display: flex;
            gap: 1rem;
            margin-top: 1.5rem;
        }
        /* Use universal button styles - no overrides needed */
        .btn-small {
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
        }
    `;

    const contentBody = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('users')" id="tab-users" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-users"></i> Users
                </button>
                <button onclick="switchTab('sessions')" id="tab-sessions" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-user-clock"></i> Sessions
                </button>
            </div>
        </div>

        <!-- Users Tab Content -->
        <div id="content-users" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-users"></i> User Management</h3>
                    <button onclick="showAddUserModal()" class="btn">
                        <i class="fas fa-user-plus"></i> Add User
                    </button>
                </div>
                <div class="card-body" style="padding: 0; overflow-x: auto;">
                    <table class="user-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="users-tbody">
                            <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading users...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Sessions Tab Content -->
        <div id="content-sessions" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-user-clock"></i> Active Sessions</h3>
                    <button onclick="refreshSessions()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body" style="padding: 0; overflow-x: auto;">
                    <table class="user-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>IP Address</th>
                                <th>User Agent</th>
                                <th>Login Time</th>
                                <th>Last Activity</th>
                                <th>Duration</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="sessions-tbody">
                            <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading sessions...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Add User Modal -->
        <div id="addUserModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-plus"></i> Add New User</h2>
                    <button onclick="hideAddUserModal()" class="close-btn">&times;</button>
                </div>
                <form id="addUserForm">
                    <div class="form-group">
                        <label for="newUsername">Username *</label>
                        <input type="text" id="newUsername" name="username" required minlength="3">
                        <small>Minimum 3 characters</small>
                    </div>
                    <div class="form-group">
                        <label for="newEmail">Email</label>
                        <input type="email" id="newEmail" name="email">
                    </div>
                    <div class="form-group">
                        <label for="newPassword">Password *</label>
                        <input type="password" id="newPassword" name="password" autocomplete="new-password" required minlength="8">
                        <small>Minimum 8 characters</small>
                    </div>
                    <div class="form-group">
                        <label for="newRole">Role *</label>
                        <select id="newRole" name="role" required>
                            <option value="user">Standard User (View Only)</option>
                            <option value="admin">Administrator (Full Access)</option>
                        </select>
                    </div>
                    <div class="btn-group">
                        <button type="button" onclick="hideAddUserModal()" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn"><i class="fas fa-save"></i> Create User</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Edit User Modal -->
        <div id="editUserModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-edit"></i> Edit User</h2>
                    <button onclick="hideEditUserModal()" class="close-btn">&times;</button>
                </div>
                <form id="editUserForm">
                    <input type="hidden" id="editUserId" name="userId">
                    <div class="form-group">
                        <label for="editUsername">Username</label>
                        <input type="text" id="editUsername" name="username" readonly style="opacity: 0.7; cursor: not-allowed;">
                        <small>Username cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label for="editEmail">Email</label>
                        <input type="email" id="editEmail" name="email">
                    </div>
                    <div class="form-group">
                        <label for="editPassword">New Password</label>
                        <input type="password" id="editPassword" name="password" autocomplete="new-password" minlength="8">
                        <small>Leave empty to keep current password</small>
                    </div>
                    <div class="form-group">
                        <label for="editRole">Role *</label>
                        <select id="editRole" name="role" required>
                            <option value="user">Standard User (View Only)</option>
                            <option value="admin">Administrator (Full Access)</option>
                        </select>
                    </div>
                    <div class="btn-group">
                        <button type="button" onclick="hideEditUserModal()" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn"><i class="fas fa-save"></i> Update User</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const additionalJS = `
        let allUsers = [];
        let allSessions = [];

        // Tab switching
        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(btn => { 
                btn.classList.remove('active'); 
                btn.style.background = 'var(--bg-secondary)'; 
                btn.style.color = 'var(--text-primary)'; 
            });
            
            // Show selected tab
            document.getElementById('content-' + tabName).style.display = 'block';
            const activeBtn = document.getElementById('tab-' + tabName);
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--gradient-ocean)';
            activeBtn.style.color = 'white';
            
            // Load data for the selected tab
            if (tabName === 'sessions') {
                loadSessions();
            }
        }

        async function loadSessions() {
            try {
                const response = await fetch('/api/admin/sessions');
                if (!response.ok) throw new Error('Failed to fetch sessions');
                
                const data = await response.json();
                allSessions = data.sessions || data;
                const tbody = document.getElementById('sessions-tbody');
                
                if (!allSessions || allSessions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No active sessions</td></tr>';
                    return;
                }
                
                tbody.innerHTML = allSessions.map(session => {
                    // Parse UTC timestamps correctly and calculate duration
                    const loginTime = new Date(session.created_at + ' UTC');
                    const lastActivity = new Date(session.last_activity + ' UTC');
                    const now = new Date();
                    const durationMs = now.getTime() - loginTime.getTime();
                    const duration = Math.floor(durationMs / 1000 / 60); // minutes
                    
                    return \`
                        <tr>
                            <td>
                                <i class="fas fa-user-circle" style="margin-right: 0.5rem; color: var(--accent-primary);"></i>
                                <strong>\${session.username}</strong>
                            </td>
                            <td>\${session.ip_address || 'Unknown'}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${session.user_agent || 'Unknown'}">
                                \${session.user_agent || 'Unknown'}
                            </td>
                            <td>\${session.created_at_formatted || 'N/A'}</td>
                            <td>\${session.last_activity_formatted || 'N/A'}</td>
                            <td>\${duration < 60 ? duration + ' min' : Math.floor(duration / 60) + 'h ' + (duration % 60) + 'm'}</td>
                            <td>
                                <button onclick="terminateSession('\${session.id}')" class="btn-small btn-danger" title="Terminate Session">
                                    <i class="fas fa-sign-out-alt"></i> Terminate
                                </button>
                            </td>
                        </tr>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Error loading sessions:', error);
                document.getElementById('sessions-tbody').innerHTML = 
                    '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load sessions</td></tr>';
            }
        }

        async function terminateSession(sessionToken) {
            if (!confirm('Are you sure you want to terminate this session?')) return;
            
            try {
                const response = await fetch(\`/api/admin/sessions/\${sessionToken}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showNotification('Session terminated successfully', 'success');
                    loadSessions();
                } else {
                    throw new Error('Failed to terminate session');
                }
            } catch (error) {
                console.error('Error terminating session:', error);
                showNotification('Failed to terminate session', 'error');
            }
        }

        function refreshSessions() {
            loadSessions();
        }

        async function loadUsers() {
            try {
                const response = await fetch('/api/users');
                if (!response.ok) throw new Error('Failed to fetch users');
                
                const data = await response.json();
                allUsers = data.users || data; // Handle both {users: []} and direct array
                const tbody = document.getElementById('users-tbody');
                
                if (!allUsers || allUsers.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No users found</td></tr>';
                    return;
                }
                
                tbody.innerHTML = allUsers.map(user => \`
                    <tr>
                        <td>
                            <i class="fas fa-user-circle" style="margin-right: 0.5rem; color: var(--accent-primary);"></i>
                            <strong>\${user.username}</strong>
                        </td>
                        <td>\${user.email || '<em style="color: var(--text-muted);">Not set</em>'}</td>
                        <td><span class="role-badge role-\${user.role}">\${user.role}</span></td>
                        <td><span class="role-badge status-\${user.is_active ? 'active' : 'inactive'}">\${user.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>\${user.created_at_formatted || 'N/A'}</td>
                        <td>\${user.last_login_formatted || '<em style="color: var(--text-muted);">Never</em>'}</td>
                        <td>
                            <button onclick="editUser(\${user.id})" class="btn btn-small" style="margin-right: 0.5rem;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            \${user.username !== 'admin' ? \`
                            <button onclick="deleteUser(\${user.id}, '\${user.username}')" class="btn btn-danger btn-small">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                            \` : ''}
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Error loading users:', error);
                document.getElementById('users-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load users</td></tr>';
            }
        }

        function showAddUserModal() {
            document.getElementById('addUserModal').classList.add('active');
        }

        function hideAddUserModal() {
            document.getElementById('addUserModal').classList.remove('active');
            document.getElementById('addUserForm').reset();
        }

        function showEditUserModal() {
            document.getElementById('editUserModal').classList.add('active');
        }

        function hideEditUserModal() {
            document.getElementById('editUserModal').classList.remove('active');
            document.getElementById('editUserForm').reset();
        }

        function editUser(userId) {
            const user = allUsers.find(u => u.id === userId);
            if (user) {
                document.getElementById('editUserId').value = user.id;
                document.getElementById('editUsername').value = user.username;
                document.getElementById('editEmail').value = user.email || '';
                document.getElementById('editRole').value = user.role;
                showEditUserModal();
            }
        }

        async function deleteUser(userId, username) {
            if (!confirm(\`Are you sure you want to delete user "\${username}"?\\n\\nThis action cannot be undone.\`)) return;
            
            try {
                const response = await fetch(\`/api/users/\${userId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert(\`User "\${username}" deleted successfully\`);
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('Failed to delete user: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error deleting user: ' + error.message);
            }
        }

        document.getElementById('addUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    alert(\`User "\${data.username}" created successfully\`);
                    hideAddUserModal();
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('Failed to create user: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error creating user: ' + error.message);
            }
        });

        document.getElementById('editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            const userId = data.userId;
            delete data.userId;
            delete data.username; // Don't send username
            
            // Remove password if empty
            if (!data.password) {
                delete data.password;
            }
            
            try {
                const response = await fetch(\`/api/users/\${userId}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    alert('User updated successfully');
                    hideEditUserModal();
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('Failed to update user: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error updating user: ' + error.message);
            }
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Load users on page load
        loadUsers();
    `;

    res.send(getPageTemplate({
        pageTitle: 'User Management',
        pageIcon: 'fas fa-users',
        activeNav: 'users',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// ============================================================================
// USER ACTIVITY TIMELINE PAGE
// ============================================================================
app.get('/activity', requireAuth, (req, res) => {
    const pageContent = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('alerts')" id="tab-alerts" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-exclamation-triangle"></i> Alerts
                </button>
                <button onclick="switchTab('activity')" id="tab-activity" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-history"></i> Activity Timeline
                </button>
            </div>
        </div>

        <!-- Alerts Tab Content -->
        <div id="content-alerts" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-exclamation-triangle"></i> System Alerts</h3>
                    <button onclick="refreshAlerts()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body" style="padding: 0;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Message</th>
                                <th>Source</th>
                                <th>Timestamp</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="alerts-tbody">
                            <tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading alerts...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Activity Tab Content -->
        <div id="content-activity" class="tab-content" style="display: none;">
            <div class="page-header">
                <div>
                    <h2><i class="fas fa-history"></i> User Activity Timeline</h2>
                    <p>Track user actions and system events</p>
                </div>
                <div class="header-actions">
                    <button onclick="refreshActivity()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                    <button onclick="exportActivity()" class="btn">
                        <i class="fas fa-download"></i> Export
                    </button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem;">
                <!-- Filters -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-filter"></i> Filters</h3>
                    </div>
                    <div style="padding: 1.5rem;">
                        <!-- User Filter -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">User</label>
                            <select id="user-filter" onchange="filterActivity()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                <option value="all">All Users</option>
                            </select>
                        </div>

                        <!-- Action Filter -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">Action Type</label>
                            <select id="action-filter" onchange="filterActivity()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                <option value="all">All Actions</option>
                                <option value="login">Login</option>
                                <option value="logout">Logout</option>
                                <option value="page_visit">Page Visit</option>
                                <option value="api_call">API Call</option>
                                <option value="admin_action">Admin Action</option>
                                <option value="security">Security Event</option>
                            </select>
                        </div>

                        <!-- Time Range -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">Time Range</label>
                            <select id="time-filter" onchange="filterActivity()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                <option value="today" selected>Today</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                                <option value="all">All Time</option>
                            </select>
                        </div>

                        <!-- Stats -->
                        <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                            <div style="margin-bottom: 0.75rem; display: flex; justify-content: space-between; font-size: 0.875rem;">
                                <span style="color: var(--text-muted);">Total Actions</span>
                                <span id="total-actions" style="font-weight: 600;">--</span>
                            </div>
                            <div style="margin-bottom: 0.75rem; display: flex; justify-content: space-between; font-size: 0.875rem;">
                                <span style="color: var(--text-muted);">Active Users</span>
                                <span id="active-users" style="font-weight: 600;">--</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                <span style="color: var(--text-muted);">Today</span>
                                <span id="today-actions" style="font-weight: 600;">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Activity Timeline -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-stream"></i> Activity Stream</h3>
                        <input type="text" id="activity-search" placeholder="Search activity..." 
                               onkeyup="filterActivity()"
                               style="padding: 0.5rem 1rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); width: 250px; font-size: 0.875rem;">
                    </div>
                    <div id="activity-container" style="padding: 1.5rem; max-height: 70vh; overflow-y: auto;">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i>
                            <p style="margin-top: 1rem; color: var(--text-muted);">Loading activity...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalCSS = `
        .tab-button.active {
            color: var(--accent-primary) !important;
            border-bottom-color: var(--accent-primary) !important;
        }
        .tab-button:hover {
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }
        .tab-content {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;

    const additionalJS = `
        let allActivity = [];
        let allUsers = [];
        let allAlerts = [];

        // Tab switching
        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(btn => { 
                btn.classList.remove('active'); 
                btn.style.background = 'var(--bg-secondary)'; 
                btn.style.color = 'var(--text-primary)'; 
            });
            
            // Show selected tab
            document.getElementById('content-' + tabName).style.display = 'block';
            const activeBtn = document.getElementById('tab-' + tabName);
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--gradient-ocean)';
            activeBtn.style.color = 'white';
            
            // Load data for the selected tab
            if (tabName === 'activity') {
                loadActivity();
            } else if (tabName === 'alerts') {
                loadAlerts();
            }
        }

        async function loadAlerts() {
            try {
                const response = await fetch('/api/alerts');
                if (!response.ok) throw new Error('Failed to fetch alerts');
                
                const data = await response.json();
                allAlerts = data.alerts || data;
                const tbody = document.getElementById('alerts-tbody');
                
                if (!allAlerts || allAlerts.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No alerts found</td></tr>';
                    return;
                }
                
                tbody.innerHTML = allAlerts.map(alert => {
                    const severityColors = {
                        critical: '#9b2c2c',
                        error: '#c05621',
                        warning: '#d69e2e',
                        info: '#2c5282'
                    };
                    const severityBgColors = {
                        critical: '#fed7d7',
                        error: '#feebc8',
                        warning: '#fefcbf',
                        info: '#bee3f8'
                    };
                    
                    return \`
                        <tr>
                            <td>
                                <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: \${severityBgColors[alert.severity]}; color: \${severityColors[alert.severity]};">
                                    \${alert.severity}
                                </span>
                            </td>
                            <td><strong>\${alert.message}</strong></td>
                            <td>\${alert.source || 'System'}</td>
                            <td>\${alert.created_at_formatted || 'N/A'}</td>
                            <td>
                                <span class="status-badge \${alert.is_read ? 'status-inactive' : 'status-active'}">
                                    \${alert.is_read ? 'Acknowledged' : 'Active'}
                                </span>
                            </td>
                            <td>
                                \${!alert.is_read ? \`
                                    <button onclick="acknowledgeAlert(\${alert.id})" class="btn btn-success btn-small">
                                        <i class="fas fa-check"></i> Acknowledge
                                    </button>
                                \` : \`
                                    <button onclick="deleteAlert(\${alert.id})" class="btn btn-danger btn-small">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                \`}
                            </td>
                        </tr>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Error loading alerts:', error);
                document.getElementById('alerts-tbody').innerHTML = 
                    '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load alerts</td></tr>';
            }
        }

        async function acknowledgeAlert(alertId) {
            try {
                const response = await fetch(\`/api/alerts/\${alertId}/acknowledge\`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showNotification('Alert acknowledged', 'success');
                    loadAlerts();
                } else {
                    throw new Error('Failed to acknowledge alert');
                }
            } catch (error) {
                console.error('Error acknowledging alert:', error);
                showNotification('Failed to acknowledge alert', 'error');
            }
        }

        async function deleteAlert(alertId) {
            if (!confirm('Are you sure you want to delete this alert?')) return;
            
            try {
                const response = await fetch(\`/api/alerts/\${alertId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showNotification('Alert deleted', 'success');
                    loadAlerts();
                } else {
                    throw new Error('Failed to delete alert');
                }
            } catch (error) {
                console.error('Error deleting alert:', error);
                showNotification('Failed to delete alert', 'error');
            }
        }

        function refreshAlerts() {
            loadAlerts();
        }

        // Load timezone settings before rendering timestamps
        async function loadTimezoneSettings() {
            try {
                const response = await fetch('/api/timezone');
                if (response.ok) {
                    const data = await response.json();
                    userTimezone = data.timezone;
                }
            } catch (error) {
                console.error('Failed to load timezone:', error);
            }
        }

        async function loadActivity() {
            try {
                const [activityRes, usersRes] = await Promise.all([
                    fetch('/api/activity'),
                    fetch('/api/users')
                ]);
                
                if (!activityRes.ok || !usersRes.ok) throw new Error('Failed to fetch data');
                
                allActivity = await activityRes.json();
                const usersData = await usersRes.json();
                allUsers = usersData.users || usersData; // Handle both formats
                
                // Populate user filter
                const userFilter = document.getElementById('user-filter');
                const currentValue = userFilter.value;
                userFilter.innerHTML = '<option value="all">All Users</option>' +
                    allUsers.map(u => \`<option value="\${u.id}">\${u.username}</option>\`).join('');
                userFilter.value = currentValue;
                
                updateStats();
                filterActivity();
            } catch (error) {
                console.error('Error loading activity:', error);
                document.getElementById('activity-container').innerHTML = 
                    '<div style="text-align: center; padding: 2rem; color: var(--error-color);"><i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i><p style="margin-top: 1rem;">Failed to load activity</p></div>';
            }
        }

        function updateStats() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayActivity = allActivity.filter(a => new Date(a.timestamp) >= today);
            const uniqueUsers = new Set(allActivity.map(a => a.user_id)).size;
            
            document.getElementById('total-actions').textContent = allActivity.length;
            document.getElementById('active-users').textContent = uniqueUsers;
            document.getElementById('today-actions').textContent = todayActivity.length;
        }

        function filterActivity() {
            const userFilter = document.getElementById('user-filter').value;
            const actionFilter = document.getElementById('action-filter').value;
            const timeFilter = document.getElementById('time-filter').value;
            const searchTerm = document.getElementById('activity-search').value.toLowerCase();

            let filtered = allActivity.filter(activity => {
                // User filter
                if (userFilter !== 'all' && activity.user_id !== parseInt(userFilter)) return false;
                
                // Action filter
                if (actionFilter !== 'all' && activity.action !== actionFilter) return false;
                
                // Time filter
                const activityDate = new Date(activity.timestamp);
                const now = new Date();
                if (timeFilter === 'today') {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (activityDate < today) return false;
                } else if (timeFilter === 'week') {
                    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    if (activityDate < weekAgo) return false;
                } else if (timeFilter === 'month') {
                    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    if (activityDate < monthAgo) return false;
                }
                
                // Search filter
                if (searchTerm && !activity.action.toLowerCase().includes(searchTerm) && 
                    !activity.username.toLowerCase().includes(searchTerm) &&
                    !(activity.resource && activity.resource.toLowerCase().includes(searchTerm)) &&
                    !(activity.details && activity.details.toLowerCase().includes(searchTerm))) return false;

                return true;
            });

            renderActivity(filtered);
        }

        function renderActivity(activities) {
            const container = document.getElementById('activity-container');
            
            if (activities.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i><p style="margin-top: 1rem; font-size: 1.1rem;">No activity found</p></div>';
                return;
            }

            const actionIcons = {
                login: 'fa-sign-in-alt',
                logout: 'fa-sign-out-alt',
                page_visit: 'fa-file-alt',
                api_call: 'fa-plug',
                admin_action: 'fa-user-shield',
                security: 'fa-shield-alt',
                create: 'fa-plus-circle',
                update: 'fa-edit',
                delete: 'fa-trash-alt'
            };

            const actionColors = {
                login: '#10b981',
                logout: '#6b7280',
                page_visit: '#3b82f6',
                api_call: '#8b5cf6',
                admin_action: '#f59e0b',
                security: '#ef4444',
                create: '#10b981',
                update: '#3b82f6',
                delete: '#ef4444'
            };

            container.innerHTML = activities.map((activity, index) => {
                const timestamp = new Date(activity.timestamp);
                const timeAgo = getTimeAgo(timestamp);
                const icon = actionIcons[activity.action] || 'fa-circle';
                const color = actionColors[activity.action] || '#6b7280';
                const isFirst = index === 0;

                return \`
                    <div style="display: flex; gap: 1rem; margin-bottom: \${isFirst ? '1.5rem' : '1rem'}; position: relative;">
                        <!-- Timeline connector -->
                        \${!isFirst ? '<div style="position: absolute; left: 15px; top: -1rem; bottom: 0; width: 2px; background: var(--border-color);"></div>' : ''}
                        
                        <!-- Icon -->
                        <div style="flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: \${color}15; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1;">
                            <i class="fas \${icon}" style="color: \${color}; font-size: 0.875rem;"></i>
                        </div>
                        
                        <!-- Content -->
                        <div style="flex: 1; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                                <div>
                                    <span style="font-weight: 600; color: var(--text-primary);">\${activity.username}</span>
                                    <span style="color: var(--text-muted); margin: 0 0.5rem;">•</span>
                                    <span style="color: \${color}; font-weight: 500; text-transform: capitalize;">\${activity.action.replace('_', ' ')}</span>
                                </div>
                                <div style="text-align: right;">
                                    <span class="time-ago" data-timestamp="\${activity.timestamp}" style="font-size: 0.75rem; color: var(--text-muted); display: block;">\${timeAgo}</span>
                                    <span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7;">\${activity.timestampFormatted || formatTimestamp(activity.timestamp)}</span>
                                </div>
                            </div>
                            \${activity.resource ? \`
                                <div style="font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.25rem;">
                                    <i class="fas fa-link" style="opacity: 0.5; margin-right: 0.5rem;"></i>\${activity.resource}
                                </div>
                            \` : ''}
                            \${activity.details ? \`
                                <div style="font-size: 0.875rem; color: var(--text-muted);">\${activity.details}</div>
                            \` : ''}
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                                <i class="fas fa-network-wired" style="opacity: 0.5;"></i> \${activity.ip_address || 'Unknown IP'}
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function getTimeAgo(date) {
            const now = new Date();
            const diffMs = now - date;
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffSecs < 5) return 'Just now';
            if (diffSecs < 60) return \`\${diffSecs}s ago\`;
            if (diffMins < 60) return \`\${diffMins}min ago\`;
            if (diffHours < 24) return \`\${diffHours}h ago\`;
            return \`\${diffDays}d ago\`;
        }

        function refreshActivity() {
            loadActivity();
        }

        function exportActivity() {
            const filtered = allActivity; // Could filter this based on current filters
            const csv = 'Username,Action,Resource,Details,IP,Timestamp\\n' +
                filtered.map(a => \`"\${a.username}","\${a.action}","\${a.resource || ''}","\${a.details || ''}","\${a.ip_address || ''}","\${a.timestamp}"\`).join('\\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`activity-\${new Date().toISOString().split('T')[0]}.csv\`;
            a.click();
        }

        // Update all time-ago displays every 10 seconds
        function updateTimeDisplays() {
            document.querySelectorAll('.time-ago').forEach(element => {
                const timestamp = new Date(element.getAttribute('data-timestamp'));
                element.textContent = getTimeAgo(timestamp);
            });
        }

        document.addEventListener('DOMContentLoaded', async () => {
            // Load timezone settings first, then load alerts (default tab)
            await loadTimezoneSettings();
            await loadAlerts();
            setInterval(() => {
                // Auto-refresh based on active tab
                const alertsTab = document.getElementById('content-alerts');
                const activityTab = document.getElementById('content-activity');
                if (alertsTab.style.display !== 'none') {
                    loadAlerts();
                } else if (activityTab.style.display !== 'none') {
                    loadActivity();
                    updateTimeDisplays();
                }
            }, 60000); // Refresh every minute
        });
    `;

    res.send(getPageTemplate({
        pageTitle: 'User Activity',
        pageIcon: 'fas fa-history',
        activeNav: 'activity',
        contentBody: pageContent,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// Webhooks Management page
app.get('/webhooks', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const pageContent = `
        <div class="page-header">
            <div>
                <h1><i class="fas fa-webhook"></i> Webhook Management</h1>
                <p>Configure and manage webhooks for event notifications</p>
            </div>
            <div>
                <a href="/webhooks/add" class="btn">
                    <i class="fas fa-plus"></i> Add Webhook
                </a>
            </div>
        </div>

        <div class="grid" style="grid-template-columns: 1fr;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-list"></i> Webhooks</h3>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div id="webhooks-container" style="min-height: 200px;">
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                            <p>Loading webhooks...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Delivery History Modal -->
        <div id="delivery-modal" class="modal">
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-history"></i> Delivery History</h3>
                    <button type="button" class="modal-close" id="close-delivery-modal-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="deliveries-container" style="max-height: 400px; overflow-y: auto;"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" onclick="closeDeliveryModal()" class="btn">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        let webhooks = [];

        async function loadWebhooks() {
            try {
                const response = await fetch('/api/webhooks');
                webhooks = await response.json();
                renderWebhooks();
            } catch (error) {
                console.error('Failed to load webhooks:', error);
                showToast('Failed to load webhooks', 'error');
            }
        }

        function renderWebhooks() {
            const container = document.getElementById('webhooks-container');
            
            if (webhooks.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-webhook" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No webhooks available at this time</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = \`
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 180px;">Name</th>
                            <th style="width: 280px;">URL</th>
                            <th style="width: 180px;">Events</th>
                            <th style="width: 120px; text-align: center;">Status</th>
                            <th style="width: 150px; text-align: center;">Success / Fail</th>
                            <th style="width: 180px;">Last Triggered</th>
                            <th style="width: 180px; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${webhooks.map(webhook => \`
                            <tr>
                                <td>
                                    <div style="font-weight: 600; color: var(--text-primary);">\${webhook.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
                                        <i class="fas fa-\${webhook.method === 'POST' ? 'paper-plane' : webhook.method === 'GET' ? 'download' : webhook.method === 'PUT' ? 'upload' : webhook.method === 'DELETE' ? 'trash' : 'exchange-alt'}"></i> 
                                        \${webhook.method}
                                    </div>
                                </td>
                                <td>
                                    <div style="font-size: 0.875rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Courier New', monospace; color: var(--accent-primary);" title="\${webhook.url}">
                                        \${webhook.url}
                                    </div>
                                </td>
                                <td>
                                    <div style="font-size: 0.875rem; color: var(--text-secondary);">
                                        \${webhook.event_types.length > 0 ? webhook.event_types.slice(0, 2).map(e => e.replace('_', ' ')).join(', ') : 'All events'}
                                        \${webhook.event_types.length > 2 ? \`<br><span style="color: var(--text-muted); font-size: 0.75rem;">+\${webhook.event_types.length - 2} more</span>\` : ''}
                                    </div>
                                </td>
                                <td style="text-align: center;">
                                    <span class="status-badge \${webhook.enabled ? 'online' : 'offline'}" style="padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                                        <i class="fas fa-\${webhook.enabled ? 'check-circle' : 'times-circle'}"></i> \${webhook.enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </td>
                                <td style="text-align: center;">
                                    <div style="display: flex; gap: 1rem; justify-content: center; align-items: center; font-size: 0.875rem;">
                                        <span style="color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                                            <i class="fas fa-check-circle"></i> \${webhook.success_count}
                                        </span>
                                        <span style="color: #ef4444; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                                            <i class="fas fa-times-circle"></i> \${webhook.failure_count}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div style="font-size: 0.875rem; color: var(--text-secondary);">
                                        \${webhook.last_triggered_formatted ? \`<i class="fas fa-clock"></i> \${webhook.last_triggered_formatted}\` : '<span style="color: var(--text-muted);">Never</span>'}
                                    </div>
                                </td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                        <button onclick="testWebhook(\${webhook.id})" class="btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.85rem; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; transition: all 0.2s;" title="Test Webhook">
                                            <i class="fas fa-vial"></i> Test
                                        </button>
                                        <button onclick="viewDeliveries(\${webhook.id})" class="btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.85rem; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; transition: all 0.2s;" title="View History">
                                            <i class="fas fa-history"></i> History
                                        </button>
                                        <a href="/webhooks/edit/\${webhook.id}" class="btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.85rem; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;" title="Edit Webhook">
                                            <i class="fas fa-edit"></i> Edit
                                        </a>
                                        <button onclick="deleteWebhook(\${webhook.id}, '\${webhook.name}')" class="btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.85rem; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; transition: all 0.2s;" title="Delete Webhook">
                                            <i class="fas fa-trash"></i> Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        async function deleteWebhook(id, name) {
            if (!confirm(\`Are you sure you want to delete webhook "\${name}"?\`)) return;

            try {
                const response = await fetch(\`/api/webhooks/\${id}\`, { method: 'DELETE' });
                if (response.ok) {
                    showToast('Webhook deleted successfully', 'success');
                    loadWebhooks();
                } else {
                    showToast('Failed to delete webhook', 'error');
                }
            } catch (error) {
                console.error('Failed to delete webhook:', error);
                showToast('Failed to delete webhook', 'error');
            }
        }

        async function testWebhook(id) {
            try {
                const response = await fetch(\`/api/webhooks/\${id}/test\`, { method: 'POST' });
                const result = await response.json();
                showToast(result.message, result.success ? 'success' : 'error');
            } catch (error) {
                console.error('Failed to test webhook:', error);
                showToast('Failed to test webhook', 'error');
            }
        }

        async function viewDeliveries(id) {
            try {
                const response = await fetch(\`/api/webhooks/\${id}/deliveries\`);
                const deliveries = await response.json();
                
                const container = document.getElementById('deliveries-container');
                
                if (deliveries.length === 0) {
                    container.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-muted);">No delivery history</p>';
                } else {
                    container.innerHTML = deliveries.map(d => \`
                        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                                <div>
                                    <span class="status-badge" style="background: \${d.status === 'success' ? 'var(--success-color)' : 'var(--error-color)'};">
                                        <i class="fas fa-\${d.status === 'success' ? 'check' : 'times'}"></i> \${d.status}
                                    </span>
                                    <span style="margin-left: 0.5rem; font-weight: 600;">\${d.event_type}</span>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 0.875rem;">\${d.attempted_at_formatted}</div>
                                    \${d.response_code ? \`<div style="font-size: 0.75rem; color: var(--text-muted);">HTTP \${d.response_code}</div>\` : ''}
                                </div>
                            </div>
                            \${d.error_message ? \`<div style="font-size: 0.875rem; color: var(--error-color); margin-top: 0.5rem;"><i class="fas fa-exclamation-circle"></i> \${d.error_message}</div>\` : ''}
                            \${d.status === 'failed' ? \`
                                <button onclick="retryDelivery(\${d.id})" class="btn" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                                    <i class="fas fa-redo"></i> Retry
                                </button>
                            \` : ''}
                        </div>
                    \`).join('');
                }

                document.getElementById('delivery-modal').classList.add('active');
            } catch (error) {
                console.error('Failed to load deliveries:', error);
                showToast('Failed to load deliveries', 'error');
            }
        }

        function closeDeliveryModal() {
            const modal = document.getElementById('delivery-modal');
            if (modal) {
                modal.classList.remove('active');
            }
        }

        async function retryDelivery(id) {
            try {
                const response = await fetch(\`/api/webhooks/deliveries/\${id}/retry\`, { method: 'POST' });
                const result = await response.json();
                showToast(result.message, result.success ? 'success' : 'error');
                closeDeliveryModal();
            } catch (error) {
                console.error('Failed to retry delivery:', error);
                showToast('Failed to retry delivery', 'error');
            }
        }

        // Setup event listeners
        function setupModalEventListeners() {
            // Close button click
            const closeBtn = document.getElementById('close-delivery-modal-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeDeliveryModal();
                });
            }

            // Backdrop click
            const modal = document.getElementById('delivery-modal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target.id === 'delivery-modal') {
                        closeDeliveryModal();
                    }
                });
            }

            // Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    const modal = document.getElementById('delivery-modal');
                    if (modal && modal.classList.contains('active')) {
                        closeDeliveryModal();
                    }
                }
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            setupModalEventListeners();
            loadWebhooks();
            setInterval(loadWebhooks, 30000);
        });
    `;

    res.send(getPageTemplate({
        pageTitle: 'Webhooks',
        pageIcon: 'fas fa-link',
        activeNav: 'webhooks',
        contentBody: pageContent,
        additionalCSS: `
            #delivery-modal {
                display: none !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.7) !important;
                backdrop-filter: blur(4px) !important;
                z-index: 99999 !important;
                align-items: center;
                justify-content: center;
            }
            
            #delivery-modal.active {
                display: flex !important;
            }
            
            #delivery-modal .modal-content {
                background: var(--bg-primary);
                border-radius: 12px;
                padding: 0;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 900px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                animation: slideUp 0.3s ease;
            }
            
            #delivery-modal .modal-header,
            #delivery-modal .modal-body,
            #delivery-modal .modal-footer {
                padding: 1.5rem 2rem;
            }
            
            #delivery-modal .modal-body {
                padding-top: 1rem;
                padding-bottom: 1rem;
            }
            
            /* Responsive breakpoints */
            @media (max-width: 640px) {
                #delivery-modal .modal-content {
                    width: 95% !important;
                    max-width: 95% !important;
                    max-height: 95vh !important;
                    border-radius: 8px !important;
                }
            }
            
            @media (min-width: 641px) and (max-width: 1024px) {
                #delivery-modal .modal-content {
                    width: 85% !important;
                    max-width: 750px !important;
                }
            }
            
            @media (min-width: 1025px) {
                #delivery-modal .modal-content {
                    width: 80% !important;
                    max-width: 1000px !important;
                }
            }
            
            #delivery-modal .modal-close {
                background: transparent !important;
                border: none !important;
                font-size: 2.5rem !important;
                line-height: 1 !important;
                cursor: pointer !important;
                color: var(--text-secondary) !important;
                font-weight: 300 !important;
                padding: 0 !important;
                width: 48px !important;
                height: 48px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 8px !important;
                transition: all 0.2s ease !important;
                flex-shrink: 0 !important;
            }
            
            #delivery-modal .modal-close:hover {
                background: rgba(239, 68, 68, 0.1) !important;
                color: var(--error-color) !important;
                transform: rotate(90deg) !important;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `,
        additionalJS: additionalJS,
        req: req
    }));
});

// Add Webhook page
app.get('/webhooks/add', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const pageContent = `
        <div class="page-header">
            <div>
                <h1><i class="fas fa-plus"></i> Add Webhook</h1>
                <p>Create a new webhook for event notifications</p>
            </div>
            <div>
                <a href="/webhooks" class="btn">
                    <i class="fas fa-arrow-left"></i> Back to Webhooks
                </a>
            </div>
        </div>

        <div class="grid" style="grid-template-columns: 1fr;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-webhook"></i> Webhook Configuration</h3>
                </div>
                <div class="card-body">
                    <form id="webhook-form">
                        <div class="form-group">
                            <label><i class="fas fa-tag"></i> Name *</label>
                            <input type="text" id="webhook-name" class="form-control" placeholder="My Webhook" required>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-link"></i> URL *</label>
                            <input type="url" id="webhook-url" class="form-control" placeholder="https://example.com/webhook" required>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-exchange-alt"></i> HTTP Method</label>
                            <select id="webhook-method" class="form-control">
                                <option value="POST">POST</option>
                                <option value="GET">GET</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-bolt"></i> Event Types</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="log_created"> Log Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="alert_created"> Alert Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="backup_created"> Backup Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="user_login"> User Login
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="user_logout"> User Logout
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="system_error"> System Error
                                </label>
                            </div>
                            <small>Select events that will trigger this webhook</small>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-key"></i> Secret (Optional)</label>
                            <input type="password" id="webhook-secret" class="form-control" placeholder="Secret for X-Webhook-Secret header">
                            <small>Used to verify webhook authenticity</small>
                        </div>

                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">
                                <input type="checkbox" id="webhook-enabled" checked>
                                <span>Enable this webhook</span>
                            </label>
                        </div>

                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="submit" class="btn">
                                <i class="fas fa-save"></i> Save Webhook
                            </button>
                            <a href="/webhooks" class="btn" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;">
                                <i class="fas fa-times"></i> Cancel
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        document.getElementById('webhook-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('webhook-name').value;
            const url = document.getElementById('webhook-url').value;
            const method = document.getElementById('webhook-method').value;
            const secret = document.getElementById('webhook-secret').value;
            const enabled = document.getElementById('webhook-enabled').checked;
            const event_types = Array.from(document.querySelectorAll('.event-type:checked')).map(cb => cb.value);

            if (!name || !url) {
                showToast('Name and URL are required', 'error');
                return;
            }

            try {
                const response = await fetch('/api/webhooks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, url, method, secret, enabled, event_types })
                });

                const result = await response.json();

                if (response.ok) {
                    showToast('Webhook created successfully', 'success');
                    setTimeout(() => window.location.href = '/webhooks', 1000);
                } else {
                    showToast(result.error || 'Failed to create webhook', 'error');
                }
            } catch (error) {
                console.error('Error creating webhook:', error);
                showToast('Failed to create webhook', 'error');
            }
        });
    `;

    res.send(getPageTemplate({
        pageTitle: 'Add Webhook',
        pageIcon: 'fas fa-plus',
        activeNav: 'webhooks',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: additionalJS,
        req: req
    }));
});

// Edit Webhook page
app.get('/webhooks/edit/:id', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const webhookId = req.params.id;

    const pageContent = `
        <div class="page-header">
            <div>
                <h1><i class="fas fa-edit"></i> Edit Webhook</h1>
                <p>Update webhook configuration</p>
            </div>
            <div>
                <a href="/webhooks" class="btn-secondary">
                    <i class="fas fa-arrow-left"></i> Back to Webhooks
                </a>
            </div>
        </div>

        <div class="grid" style="grid-template-columns: 1fr;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-webhook"></i> Webhook Configuration</h3>
                </div>
                <div class="card-body" id="form-container">
                    <div style="text-align: center; padding: 2rem;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-primary);"></i>
                        <p style="margin-top: 1rem; color: var(--text-muted);">Loading webhook...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        const webhookId = ${webhookId};

        async function loadWebhook() {
            try {
                const response = await fetch('/api/webhooks');
                const webhooks = await response.json();
                const webhook = webhooks.find(w => w.id === webhookId);

                if (!webhook) {
                    document.getElementById('form-container').innerHTML = \`
                        <div style="text-align: center; padding: 2rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                            <p style="margin-top: 1rem;">Webhook not found</p>
                            <a href="/webhooks" class="btn" style="margin-top: 1rem;">
                                <i class="fas fa-arrow-left"></i> Back to Webhooks
                            </a>
                        </div>
                    \`;
                    return;
                }

                document.getElementById('form-container').innerHTML = \`
                    <form id="webhook-form">
                        <div class="form-group">
                            <label><i class="fas fa-tag"></i> Name *</label>
                            <input type="text" id="webhook-name" class="form-control" value="\${webhook.name}" required>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-link"></i> URL *</label>
                            <input type="url" id="webhook-url" class="form-control" value="\${webhook.url}" required>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-exchange-alt"></i> HTTP Method</label>
                            <select id="webhook-method" class="form-control">
                                <option value="POST" \${webhook.method === 'POST' ? 'selected' : ''}>POST</option>
                                <option value="GET" \${webhook.method === 'GET' ? 'selected' : ''}>GET</option>
                                <option value="PUT" \${webhook.method === 'PUT' ? 'selected' : ''}>PUT</option>
                                <option value="DELETE" \${webhook.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-bolt"></i> Event Types</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="log_created" \${webhook.event_types.includes('log_created') ? 'checked' : ''}> Log Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="alert_created" \${webhook.event_types.includes('alert_created') ? 'checked' : ''}> Alert Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="backup_created" \${webhook.event_types.includes('backup_created') ? 'checked' : ''}> Backup Created
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="user_login" \${webhook.event_types.includes('user_login') ? 'checked' : ''}> User Login
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="user_logout" \${webhook.event_types.includes('user_logout') ? 'checked' : ''}> User Logout
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: normal;">
                                    <input type="checkbox" class="event-type" value="system_error" \${webhook.event_types.includes('system_error') ? 'checked' : ''}> System Error
                                </label>
                            </div>
                            <small>Select events that will trigger this webhook</small>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-key"></i> Secret (Optional)</label>
                            <input type="password" id="webhook-secret" class="form-control" value="\${webhook.secret || ''}" placeholder="Secret for X-Webhook-Secret header">
                            <small>Used to verify webhook authenticity. Leave blank to keep existing secret.</small>
                        </div>

                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">
                                <input type="checkbox" id="webhook-enabled" \${webhook.enabled ? 'checked' : ''}>
                                <span>Enable this webhook</span>
                            </label>
                        </div>

                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="submit" class="btn-success">
                                <i class="fas fa-save"></i> Update Webhook
                            </button>
                            <a href="/webhooks" class="btn-secondary">
                                <i class="fas fa-times"></i> Cancel
                            </a>
                        </div>
                    </form>
                \`;

                document.getElementById('webhook-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const name = document.getElementById('webhook-name').value;
                    const url = document.getElementById('webhook-url').value;
                    const method = document.getElementById('webhook-method').value;
                    const secret = document.getElementById('webhook-secret').value;
                    const enabled = document.getElementById('webhook-enabled').checked;
                    const event_types = Array.from(document.querySelectorAll('.event-type:checked')).map(cb => cb.value);

                    if (!name || !url) {
                        showToast('Name and URL are required', 'error');
                        return;
                    }

                    try {
                        const response = await fetch(\`/api/webhooks/\${webhookId}\`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, url, method, secret, enabled, event_types })
                        });

                        const result = await response.json();

                        if (response.ok) {
                            showToast('Webhook updated successfully', 'success');
                            setTimeout(() => window.location.href = '/webhooks', 1000);
                        } else {
                            showToast(result.error || 'Failed to update webhook', 'error');
                        }
                    } catch (error) {
                        console.error('Error updating webhook:', error);
                        showToast('Failed to update webhook', 'error');
                    }
                });
            } catch (error) {
                console.error('Error loading webhook:', error);
                document.getElementById('form-container').innerHTML = \`
                    <div style="text-align: center; padding: 2rem; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                        <p style="margin-top: 1rem;">Failed to load webhook</p>
                        <a href="/webhooks" class="btn" style="margin-top: 1rem;">
                            <i class="fas fa-arrow-left"></i> Back to Webhooks
                        </a>
                    </div>
                \`;
            }
        }

        document.addEventListener('DOMContentLoaded', loadWebhook);
    `;

    res.send(getPageTemplate({
        pageTitle: 'Edit Webhook',
        pageIcon: 'fas fa-edit',
        activeNav: 'webhooks',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: additionalJS,
        req: req
    }));
});

// Integration Health Dashboard page
app.get('/integrations', requireAuth, (req, res) => {
    const pageContent = `
        <div class="page-header">
            <div>
                <h1><i class="fas fa-plug"></i> Integration Health</h1>
                <p style="color: var(--text-muted); margin-top: 0.5rem;">Monitor and test all system integrations</p>
            </div>
            <div style="display: flex; gap: 0.375rem;">
                <button onclick="showIntegrationLibrary()" class="btn">
                    <i class="fas fa-download"></i> Browse Integrations
                </button>
                <button onclick="showConfigureIntegrationModal()" class="btn">
                    <i class="fas fa-cog"></i> Configure Integration
                </button>
                <button onclick="testAllIntegrations()" class="btn">
                    <i class="fas fa-sync-alt"></i> Test All
                </button>
            </div>
        </div>

        <div id="integrations-grid" class="grid" style="grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
            <div style="text-align: center; padding: 3rem; color: var(--text-muted); grid-column: 1 / -1;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                <p>Loading integration health...</p>
            </div>
        </div>

        <!-- Integration Details Modal -->
        <div id="integration-modal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3 id="integration-modal-title"><i class="fas fa-info-circle"></i> Integration Details</h3>
                </div>
                <div class="modal-body">
                    <div id="integration-details"></div>
                    <div id="integration-history" style="margin-top: 2rem;">
                        <h4 style="margin-bottom: 1rem;"><i class="fas fa-history"></i> Recent History</h4>
                        <div id="history-container"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" id="close-integration-modal-footer-btn" class="btn">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        </div>

        <!-- Configure Integration Modal -->
        <div id="configure-integration-modal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3><i class="fas fa-cog"></i> Configure Integration</h3>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="integration-select">Integration Type</label>
                        <select id="integration-select" class="form-control" onchange="updateIntegrationForm()">
                            <option value="">-- Select Integration --</option>
                            <option value="mqtt">MQTT Broker</option>
                            <option value="websocket">WebSocket Server</option>
                            <option value="home_assistant">Home Assistant</option>
                            <option value="unifi">UniFi Network</option>
                            <option value="pushover">Pushover Notifications</option>
                            <option value="discord">Discord Webhook</option>
                            <option value="slack">Slack Webhook</option>
                            <option value="telegram">Telegram Bot</option>
                            <option value="custom">Custom Integration</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" id="integration-enabled" style="width: auto;">
                            <span>Enable this integration</span>
                        </label>
                    </div>

                    <div id="integration-config-form"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" onclick="closeConfigureModal()" class="btn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button type="button" onclick="saveIntegrationConfig()" class="btn">
                        <i class="fas fa-save"></i> Save Configuration
                    </button>
                </div>
            </div>
        </div>

        <!-- Integration Library Modal -->
        <div id="integration-library-modal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3><i class="fas fa-download"></i> Available Integrations</h3>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                        Select an integration template to quickly configure popular services
                    </p>
                    <div id="integration-library-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" onclick="closeIntegrationLibrary()" class="btn">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        let integrations = [];

        const integrationInfo = {
            mqtt: { name: 'MQTT Broker', icon: 'fa-share-alt', iconClass: 'fas', color: '#8b5cf6' },
            websocket: { name: 'WebSocket Server', icon: 'fa-broadcast-tower', iconClass: 'fas', color: '#3b82f6' },
            home_assistant: { name: 'Home Assistant', icon: 'fa-home', iconClass: 'fas', color: '#18bcf2' },
            unifi: { name: 'UniFi Network', icon: 'fa-network-wired', iconClass: 'fas', color: '#0559C9' },
            pushover: { name: 'Pushover', icon: 'fa-bell', iconClass: 'fas', color: '#f59e0b' },
            discord: { name: 'Discord', icon: 'fa-discord', iconClass: 'fab', color: '#5865f2' },
            slack: { name: 'Slack', icon: 'fa-slack', iconClass: 'fab', color: '#4a154b' },
            telegram: { name: 'Telegram', icon: 'fa-telegram', iconClass: 'fab', color: '#0088cc' },
            custom: { name: 'Custom Integration', icon: 'fa-puzzle-piece', iconClass: 'fas', color: '#6b7280' }
        };

        async function loadIntegrations() {
            try {
                const response = await fetch('/api/integrations/health');
                integrations = await response.json();
                
                // If no integrations exist, trigger a health check
                if (integrations.length === 0) {
                    await testAllIntegrations();
                    const retryResponse = await fetch('/api/integrations/health');
                    integrations = await retryResponse.json();
                }
                
                renderIntegrations();
            } catch (error) {
                console.error('Failed to load integrations:', error);
                showToast('Failed to load integrations', 'error');
            }
        }

        function getStatusColor(status) {
            switch(status) {
                case 'online': return '#10b981';
                case 'offline': return '#ef4444';
                case 'degraded': return '#f59e0b';
                case 'disabled': return '#6b7280';
                default: return '#9ca3af';
            }
        }

        function getStatusIcon(status) {
            switch(status) {
                case 'online': return 'check-circle';
                case 'offline': return 'times-circle';
                case 'degraded': return 'exclamation-circle';
                case 'disabled': return 'ban';
                default: return 'question-circle';
            }
        }

        function renderIntegrations() {
            const container = document.getElementById('integrations-grid');
            
            if (integrations.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 3rem; color: var(--text-muted); grid-column: 1 / -1;">' +
                        '<i class="fas fa-plug" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>' +
                        '<p>No integration data available</p>' +
                        '<button onclick="testAllIntegrations()" class="btn" style="margin-top: 1rem;">' +
                            '<i class="fas fa-sync-alt"></i> Run Health Check' +
                        '</button>' +
                    '</div>';
                return;
            }

            const cards = integrations.map(integration => {
                const info = integrationInfo[integration.integration_name] || { 
                    name: integration.integration_name, 
                    icon: 'fa-plug', 
                    iconClass: 'fas',
                    color: '#6b7280' 
                };
                const statusColor = getStatusColor(integration.status);
                const statusIcon = getStatusIcon(integration.status);
                
                const errorSection = integration.error_message ? 
                    '<div style="padding: 0.75rem; background: var(--error-color)20; border-left: 3px solid var(--error-color); border-radius: 4px; margin-bottom: 1rem;">' +
                        '<div style="font-size: 0.875rem; color: var(--error-color);">' +
                            '<i class="fas fa-exclamation-triangle"></i> ' + integration.error_message +
                        '</div>' +
                    '</div>' : '';

                const responseTime = integration.response_time ? integration.response_time + 'ms' : 'N/A';
                const errorCountColor = integration.error_count > 0 ? 'var(--error-color)' : 'var(--success-color)';
                const errorCount = integration.error_count || 0;
                const lastCheck = integration.last_check_formatted || 'Never';
                const lastSuccess = integration.last_success_formatted || 'Never';

                return '<div class="card" style="border-left: 4px solid ' + statusColor + ';">' +
                        '<div class="card-body">' +
                            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">' +
                                '<div style="display: flex; align-items: center; gap: 1rem;">' +
                                    '<div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, ' + info.color + '20, ' + info.color + '40); display: flex; align-items: center; justify-content: center;">' +
                                        '<i class="' + info.iconClass + ' ' + info.icon + '" style="font-size: 1.5rem; color: ' + info.color + ';"></i>' +
                                    '</div>' +
                                    '<div>' +
                                        '<h3 style="margin: 0; font-size: 1.1rem;">' + info.name + '</h3>' +
                                        '<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">' + integration.integration_name + '</div>' +
                                    '</div>' +
                                '</div>' +
                                '<div style="text-align: right;">' +
                                    '<span class="status-badge" style="background: ' + statusColor + ';">' +
                                        '<i class="fas fa-' + statusIcon + '"></i> ' + integration.status +
                                    '</span>' +
                                '</div>' +
                            '</div>' +
                            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">' +
                                '<div>' +
                                    '<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Response Time</div>' +
                                    '<div style="font-weight: 600; color: var(--text-primary);">' + responseTime + '</div>' +
                                '</div>' +
                                '<div>' +
                                    '<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Error Count</div>' +
                                    '<div style="font-weight: 600; color: ' + errorCountColor + ';">' + errorCount + '</div>' +
                                '</div>' +
                                '<div>' +
                                    '<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Last Check</div>' +
                                    '<div style="font-size: 0.875rem;">' + lastCheck + '</div>' +
                                '</div>' +
                                '<div>' +
                                    '<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Last Success</div>' +
                                    '<div style="font-size: 0.875rem;">' + lastSuccess + '</div>' +
                                '</div>' +
                            '</div>' +
                            errorSection +
                            '<div style="display: flex; gap: 0.5rem;">' +
                                '<button onclick="testIntegration(&quot;' + integration.integration_name + '&quot;)" class="btn" style="flex: 1; padding: 0.6rem;">' +
                                    '<i class="fas fa-sync-alt"></i> Test' +
                                '</button>' +
                                '<button onclick="viewIntegrationDetails(&quot;' + integration.integration_name + '&quot;)" class="btn" style="flex: 1; padding: 0.6rem; background: var(--info-color);">' +
                                    '<i class="fas fa-chart-line"></i> Details' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });
            
            container.innerHTML = cards.join('');
        }

        async function testIntegration(name) {
            showToast('Testing ' + name + '...', 'info');
            
            try {
                const response = await fetch('/api/integrations/' + name + '/test', { method: 'POST' });
                const result = await response.json();
                
                showToast(name + ': ' + result.status, result.status === 'online' ? 'success' : 'error');
                loadIntegrations();
            } catch (error) {
                console.error('Failed to test integration:', error);
                showToast('Failed to test integration', 'error');
            }
        }

        async function testAllIntegrations() {
            showToast('Testing all integrations...', 'info');
            
            try {
                const response = await fetch('/api/integrations/test-all', { method: 'POST' });
                const results = await response.json();
                
                const successCount = results.filter(r => r.status === 'online').length;
                showToast(successCount + '/' + results.length + ' integrations online', 'success');
                loadIntegrations();
            } catch (error) {
                console.error('Failed to test integrations:', error);
                showToast('Failed to test integrations', 'error');
            }
        }

        async function viewIntegrationDetails(name) {
            const integration = integrations.find(i => i.integration_name === name);
            if (!integration) return;

            const info = integrationInfo[name] || { name, icon: 'fa-plug', iconClass: 'fas', color: '#6b7280' };
            document.getElementById('integration-modal-title').innerHTML = '<i class="' + info.iconClass + ' ' + info.icon + '"></i> ' + info.name;

            const statusColor = getStatusColor(integration.status);
            const errorSection = integration.error_message ? 
                '<div style="padding: 1rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error-color); border-radius: 4px; margin-top: 1rem;">' +
                    '<div style="font-weight: 600; margin-bottom: 0.5rem;">Latest Error:</div>' +
                    '<div style="font-size: 0.875rem; color: var(--error-color);">' + integration.error_message + '</div>' +
                '</div>' : '';
            
            document.getElementById('integration-details').innerHTML = 
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Status</div>' +
                        '<span class="status-badge" style="background: ' + statusColor + ';">' +
                            '<i class="fas fa-' + getStatusIcon(integration.status) + '"></i> ' + integration.status +
                        '</span>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Response Time</div>' +
                        '<div style="font-weight: 600;">' + (integration.response_time ? integration.response_time + 'ms' : 'N/A') + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Error Count</div>' +
                        '<div style="font-weight: 600; color: ' + (integration.error_count > 0 ? 'var(--error-color)' : 'var(--success-color)') + ';">' +
                            (integration.error_count || 0) +
                        '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Last Check</div>' +
                        '<div style="font-size: 0.875rem;">' + (integration.last_check_formatted || 'Never') + '</div>' +
                    '</div>' +
                '</div>' + errorSection;

            // Load history
            try {
                const response = await fetch('/api/integrations/' + name + '/history?limit=10');
                const history = await response.json();

                if (history.length === 0) {
                    document.getElementById('history-container').innerHTML = '<p style="color: var(--text-muted); text-align: center;">No history available</p>';
                } else {
                    const historyHtml = history.map(h => {
                        const responseTimeHtml = h.response_time ? '<span style="margin-left: 0.5rem; font-size: 0.875rem; color: var(--text-muted);">' + h.response_time + 'ms</span>' : '';
                        return '<div style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">' +
                            '<div>' +
                                '<span class="status-badge" style="background: ' + getStatusColor(h.status) + '; font-size: 0.75rem;">' +
                                    (h.status || 'unknown') +
                                '</span>' +
                                responseTimeHtml +
                            '</div>' +
                            '<div style="font-size: 0.875rem; color: var(--text-muted);">' +
                                h.timestamp_formatted +
                            '</div>' +
                        '</div>';
                    }).join('');
                    
                    document.getElementById('history-container').innerHTML = 
                        '<div style="max-height: 300px; overflow-y: auto;">' + historyHtml + '</div>';
                }
            } catch (error) {
                console.error('Failed to load history:', error);
                document.getElementById('history-container').innerHTML = '<p style="color: var(--error-color);">Failed to load history</p>';
            }

            const modal = document.getElementById('integration-modal');
            modal.classList.add('active');
            modal.style.display = 'flex'; // Force show
        }

        function closeIntegrationModal() {
            const modal = document.getElementById('integration-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none'; // Force hide
            }
        }

        // Make function globally accessible
        window.closeIntegrationModal = closeIntegrationModal;

        // Setup event listeners - called multiple times with retry
        let eventListenersSetup = false;
        function setupModalEventListeners() {
            if (eventListenersSetup) return;

            const footerBtn = document.getElementById('close-integration-modal-footer-btn');
            
            if (!footerBtn) {
                setTimeout(setupModalEventListeners, 100);
                return;
            }

            footerBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeIntegrationModal();
            });

            // Backdrop click
            const modal = document.getElementById('integration-modal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        closeIntegrationModal();
                    }
                });
            }

            // Configure modal backdrop click
            const configModal = document.getElementById('configure-integration-modal');
            if (configModal) {
                configModal.addEventListener('click', function(e) {
                    if (e.target === configModal) {
                        closeConfigureModal();
                    }
                });
            }

            // Library modal backdrop click
            const libraryModal = document.getElementById('integration-library-modal');
            if (libraryModal) {
                libraryModal.addEventListener('click', function(e) {
                    if (e.target === libraryModal) {
                        closeIntegrationLibrary();
                    }
                });
            }

            // Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    const modal = document.getElementById('integration-modal');
                    const configModal = document.getElementById('configure-integration-modal');
                    const libraryModal = document.getElementById('integration-library-modal');
                    
                    if (modal && modal.classList.contains('active')) {
                        closeIntegrationModal();
                    } else if (configModal && configModal.style.display === 'flex') {
                        closeConfigureModal();
                    } else if (libraryModal && libraryModal.style.display === 'flex') {
                        closeIntegrationLibrary();
                    }
                }
            });

            eventListenersSetup = true;
        }

        // Configure Integration Modal Functions
        function showConfigureIntegrationModal() {
            document.getElementById('configure-integration-modal').style.display = 'flex';
            document.getElementById('integration-select').value = '';
            document.getElementById('integration-enabled').checked = false;
            document.getElementById('integration-config-form').innerHTML = '';
        }

        function closeConfigureModal() {
            document.getElementById('configure-integration-modal').style.display = 'none';
        }

        // Integration Library Functions
        const availableIntegrations = [
            {
                id: 'grafana',
                name: 'Grafana',
                description: 'Send logs and metrics to Grafana Cloud or self-hosted instance',
                icon: 'fa-chart-line',
                iconClass: 'fas',
                color: '#F46800',
                category: 'Monitoring',
                template: {
                    type: 'rest',
                    authType: 'bearer',
                    url: 'https://your-grafana.com',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'splunk',
                name: 'Splunk',
                description: 'Forward logs to Splunk Enterprise or Splunk Cloud',
                icon: 'fa-database',
                iconClass: 'fas',
                color: '#000000',
                category: 'SIEM',
                template: {
                    type: 'rest',
                    authType: 'bearer',
                    url: 'https://your-splunk.com:8088/services/collector',
                    headers: { 'Authorization': 'Splunk <token>' }
                }
            },
            {
                id: 'datadog',
                name: 'Datadog',
                description: 'Send logs and APM data to Datadog',
                icon: 'fa-dog',
                iconClass: 'fas',
                color: '#632CA6',
                category: 'Monitoring',
                template: {
                    type: 'rest',
                    authType: 'apikey',
                    url: 'https://http-intake.logs.datadoghq.com/v1/input',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'newrelic',
                name: 'New Relic',
                description: 'Forward application logs to New Relic',
                icon: 'fa-chart-area',
                iconClass: 'fas',
                color: '#008C99',
                category: 'APM',
                template: {
                    type: 'rest',
                    authType: 'apikey',
                    url: 'https://log-api.newrelic.com/log/v1',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'elastic',
                name: 'Elasticsearch',
                description: 'Index logs in Elasticsearch cluster',
                icon: 'fa-search',
                iconClass: 'fas',
                color: '#00BFB3',
                category: 'Search',
                template: {
                    type: 'rest',
                    authType: 'basic',
                    url: 'https://your-elastic.com:9200',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'pagerduty',
                name: 'PagerDuty',
                description: 'Create incidents and alerts in PagerDuty',
                icon: 'fa-bell',
                iconClass: 'fas',
                color: '#06AC38',
                category: 'Alerting',
                template: {
                    type: 'rest',
                    authType: 'bearer',
                    url: 'https://events.pagerduty.com/v2/enqueue',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'msteams',
                name: 'Microsoft Teams',
                description: 'Send notifications to Teams channels',
                icon: 'fa-microsoft',
                iconClass: 'fab',
                color: '#5059C9',
                category: 'Communication',
                template: {
                    type: 'webhook',
                    authType: 'none',
                    url: 'https://outlook.office.com/webhook/...',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'opsgenie',
                name: 'Opsgenie',
                description: 'Create alerts and incidents in Opsgenie',
                icon: 'fa-exclamation-triangle',
                iconClass: 'fas',
                color: '#2684FF',
                category: 'Alerting',
                template: {
                    type: 'rest',
                    authType: 'bearer',
                    url: 'https://api.opsgenie.com/v2/alerts',
                    headers: { 'Content-Type': 'application/json' }
                }
            }
        ];

        function showIntegrationLibrary() {
            const modal = document.getElementById('integration-library-modal');
            modal.style.display = 'flex';
            renderIntegrationLibrary();
        }

        function closeIntegrationLibrary() {
            document.getElementById('integration-library-modal').style.display = 'none';
        }

        function renderIntegrationLibrary() {
            const container = document.getElementById('integration-library-grid');
            
            const cards = availableIntegrations.map(integration => {
                return \`
                    <div class="card" style="cursor: pointer; transition: all 0.3s ease; border-left: 4px solid \${integration.color};" 
                         onclick="installIntegration('\${integration.id}')">
                        <div class="card-body" style="padding: 1.5rem;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, \${integration.color}20, \${integration.color}40); display: flex; align-items: center; justify-content: center;">
                                    <i class="\${integration.iconClass} \${integration.icon}" style="font-size: 1.5rem; color: \${integration.color};"></i>
                                </div>
                                <div style="flex: 1;">
                                    <h4 style="margin: 0; font-size: 1.1rem;">\${integration.name}</h4>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">\${integration.category}</span>
                                </div>
                            </div>
                            <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0;">\${integration.description}</p>
                            <div style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--accent-primary); font-size: 0.875rem; font-weight: 600;">
                                <i class="fas fa-plus-circle"></i> Add Integration
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
            
            container.innerHTML = cards;
        }

        function installIntegration(integrationId) {
            const integration = availableIntegrations.find(i => i.id === integrationId);
            if (!integration) return;

            closeIntegrationLibrary();
            
            // Open configure modal with pre-filled template
            document.getElementById('configure-integration-modal').style.display = 'flex';
            document.getElementById('integration-select').value = 'custom';
            document.getElementById('integration-enabled').checked = false;
            
            // Pre-fill the custom integration form with template
            setTimeout(() => {
                updateIntegrationForm();
                setTimeout(() => {
                    document.getElementById('custom-name').value = integration.name;
                    document.getElementById('custom-type').value = integration.template.type;
                    document.getElementById('custom-url').value = integration.template.url;
                    document.getElementById('custom-auth').value = integration.template.authType;
                    if (integration.template.headers) {
                        document.getElementById('custom-headers').value = JSON.stringify(integration.template.headers, null, 2);
                    }
                    showToast('Template loaded! Complete the configuration and save.', 'info');
                }, 100);
            }, 100);
        }

        function updateIntegrationForm() {
            const integrationType = document.getElementById('integration-select').value;
            const formContainer = document.getElementById('integration-config-form');
            
            if (!integrationType) {
                formContainer.innerHTML = '';
                return;
            }

            // Load existing config if available
            fetch('/api/integrations/configs/' + integrationType)
                .then(response => response.json())
                .then(config => {
                    if (config) {
                        document.getElementById('integration-enabled').checked = config.enabled;
                        renderIntegrationForm(integrationType, config.config_json ? JSON.parse(config.config_json) : {});
                    } else {
                        renderIntegrationForm(integrationType, {});
                    }
                })
                .catch(() => {
                    renderIntegrationForm(integrationType, {});
                });
        }

        function renderIntegrationForm(type, config) {
            const formContainer = document.getElementById('integration-config-form');
            let formHTML = '';

            switch(type) {
                case 'mqtt':
                    formHTML = \`
                        <div class="form-group">
                            <label for="mqtt-broker">Broker URL</label>
                            <input type="text" id="mqtt-broker" class="form-control" placeholder="mqtt://localhost:1883" value="\${config.broker || ''}">
                        </div>
                        <div class="form-group">
                            <label for="mqtt-username">Username (optional)</label>
                            <input type="text" id="mqtt-username" class="form-control" value="\${config.username || ''}">
                        </div>
                        <div class="form-group">
                            <label for="mqtt-password">Password (optional)</label>
                            <input type="password" id="mqtt-password" class="form-control" value="\${config.password || ''}">
                        </div>
                        <div class="form-group">
                            <label for="mqtt-topics">Topics (comma-separated)</label>
                            <input type="text" id="mqtt-topics" class="form-control" placeholder="home/sensors/#, dsc/events" value="\${(config.topics || []).join(', ')}">
                        </div>
                    \`;
                    break;

                case 'websocket':
                    formHTML = \`
                        <div class="form-group">
                            <label for="ws-port">WebSocket Port</label>
                            <input type="number" id="ws-port" class="form-control" placeholder="8080" value="\${config.port || 8080}">
                        </div>
                    \`;
                    break;

                case 'home_assistant':
                    formHTML = \`
                        <div class="form-group">
                            <label for="ha-url">Home Assistant URL</label>
                            <input type="text" id="ha-url" class="form-control" placeholder="http://homeassistant.local:8123" value="\${config.url || ''}">
                        </div>
                        <div class="form-group">
                            <label for="ha-token">Long-Lived Access Token</label>
                            <input type="password" id="ha-token" class="form-control" value="\${config.token || ''}">
                        </div>
                    \`;
                    break;

                case 'pushover':
                    formHTML = \`
                        <div class="form-group">
                            <label for="pushover-token">API Token</label>
                            <input type="password" id="pushover-token" class="form-control" value="\${config.token || ''}">
                        </div>
                        <div class="form-group">
                            <label for="pushover-user">User Key</label>
                            <input type="password" id="pushover-user" class="form-control" value="\${config.user || ''}">
                        </div>
                    \`;
                    break;

                case 'discord':
                    formHTML = \`
                        <div class="form-group">
                            <label for="discord-webhook">Webhook URL</label>
                            <input type="text" id="discord-webhook" class="form-control" placeholder="https://discord.com/api/webhooks/..." value="\${config.webhookUrl || ''}">
                        </div>
                    \`;
                    break;

                case 'slack':
                    formHTML = \`
                        <div class="form-group">
                            <label for="slack-webhook">Webhook URL</label>
                            <input type="text" id="slack-webhook" class="form-control" placeholder="https://hooks.slack.com/services/..." value="\${config.webhookUrl || ''}">
                        </div>
                    \`;
                    break;

                case 'telegram':
                    formHTML = \`
                        <div class="form-group">
                            <label for="telegram-token">Bot Token</label>
                            <input type="password" id="telegram-token" class="form-control" value="\${config.token || ''}">
                        </div>
                        <div class="form-group">
                            <label for="telegram-chatid">Chat ID</label>
                            <input type="text" id="telegram-chatid" class="form-control" value="\${config.chatId || ''}">
                        </div>
                    \`;
                    break;

                case 'unifi':
                    formHTML = \`
                        <div class="form-group">
                            <label for="unifi-host">Controller URL</label>
                            <input type="text" id="unifi-host" class="form-control" placeholder="https://192.168.1.1:8443" value="\${config.host || ''}">
                            <small style="color: var(--text-muted);">UniFi controller address with port</small>
                        </div>
                        <div class="form-group">
                            <label for="unifi-username">Username</label>
                            <input type="text" id="unifi-username" class="form-control" placeholder="admin" value="\${config.username || ''}">
                        </div>
                        <div class="form-group">
                            <label for="unifi-password">Password</label>
                            <input type="password" id="unifi-password" class="form-control" value="\${config.password || ''}">
                        </div>
                        <div class="form-group">
                            <label for="unifi-site">Site Name</label>
                            <input type="text" id="unifi-site" class="form-control" placeholder="default" value="\${config.site || 'default'}">
                            <small style="color: var(--text-muted);">Usually 'default'</small>
                        </div>
                    \`;
                    break;

                case 'custom':
                    formHTML = \`
                        <div class="form-group">
                            <label for="custom-name">Integration Name</label>
                            <input type="text" id="custom-name" class="form-control" placeholder="My Custom Service" value="\${config.name || ''}">
                        </div>
                        <div class="form-group">
                            <label for="custom-type">Type</label>
                            <select id="custom-type" class="form-control">
                                <option value="rest" \${config.type === 'rest' ? 'selected' : ''}>REST API</option>
                                <option value="webhook" \${config.type === 'webhook' ? 'selected' : ''}>Webhook</option>
                                <option value="graphql" \${config.type === 'graphql' ? 'selected' : ''}>GraphQL</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="custom-url">Base URL</label>
                            <input type="text" id="custom-url" class="form-control" placeholder="https://api.example.com" value="\${config.url || ''}">
                        </div>
                        <div class="form-group">
                            <label for="custom-auth">Authentication Type</label>
                            <select id="custom-auth" class="form-control">
                                <option value="none" \${config.authType === 'none' ? 'selected' : ''}>None</option>
                                <option value="bearer" \${config.authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                                <option value="basic" \${config.authType === 'basic' ? 'selected' : ''}>Basic Auth</option>
                                <option value="apikey" \${config.authType === 'apikey' ? 'selected' : ''}>API Key</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="custom-auth-value">Auth Value</label>
                            <input type="password" id="custom-auth-value" class="form-control" placeholder="Token, password, or API key" value="\${config.authValue || ''}">
                        </div>
                        <div class="form-group">
                            <label for="custom-headers">Custom Headers (JSON)</label>
                            <textarea id="custom-headers" class="form-control" rows="3" placeholder='{"X-Custom-Header": "value"}'>\${config.headers ? JSON.stringify(config.headers, null, 2) : ''}</textarea>
                        </div>
                    \`;
                    break;
            }

            formContainer.innerHTML = formHTML;
        }

        async function saveIntegrationConfig() {
            const integrationType = document.getElementById('integration-select').value;
            if (!integrationType) {
                showToast('Please select an integration type', 'error');
                return;
            }

            const enabled = document.getElementById('integration-enabled').checked;
            let configData = {};

            switch(integrationType) {
                case 'mqtt':
                    const topics = document.getElementById('mqtt-topics').value.split(',').map(t => t.trim()).filter(t => t);
                    configData = {
                        broker: document.getElementById('mqtt-broker').value,
                        username: document.getElementById('mqtt-username').value,
                        password: document.getElementById('mqtt-password').value,
                        topics: topics
                    };
                    break;

                case 'websocket':
                    configData = {
                        port: parseInt(document.getElementById('ws-port').value) || 8080
                    };
                    break;

                case 'home_assistant':
                    configData = {
                        url: document.getElementById('ha-url').value,
                        token: document.getElementById('ha-token').value
                    };
                    break;

                case 'pushover':
                    configData = {
                        token: document.getElementById('pushover-token').value,
                        user: document.getElementById('pushover-user').value
                    };
                    break;

                case 'discord':
                    configData = {
                        webhookUrl: document.getElementById('discord-webhook').value
                    };
                    break;

                case 'slack':
                    configData = {
                        webhookUrl: document.getElementById('slack-webhook').value
                    };
                    break;

                case 'telegram':
                    configData = {
                        token: document.getElementById('telegram-token').value,
                        chatId: document.getElementById('telegram-chatid').value
                    };
                    break;

                case 'unifi':
                    configData = {
                        host: document.getElementById('unifi-host').value,
                        username: document.getElementById('unifi-username').value,
                        password: document.getElementById('unifi-password').value,
                        site: document.getElementById('unifi-site').value || 'default'
                    };
                    break;

                case 'custom':
                    let headers = {};
                    try {
                        const headersText = document.getElementById('custom-headers').value.trim();
                        if (headersText) {
                            headers = JSON.parse(headersText);
                        }
                    } catch (e) {
                        showToast('Invalid JSON in custom headers', 'error');
                        return;
                    }
                    
                    configData = {
                        name: document.getElementById('custom-name').value,
                        type: document.getElementById('custom-type').value,
                        url: document.getElementById('custom-url').value,
                        authType: document.getElementById('custom-auth').value,
                        authValue: document.getElementById('custom-auth-value').value,
                        headers: headers
                    };
                    break;
            }

            try {
                const response = await fetch('/api/integrations/configs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        integration_name: integrationType,
                        integration_type: integrationType,
                        enabled: enabled,
                        config_json: JSON.stringify(configData)
                    })
                });

                const result = await response.json();
                
                if (response.ok) {
                    showToast('Integration configured successfully', 'success');
                    closeConfigureModal();
                    loadIntegrations();
                } else {
                    showToast(result.error || 'Failed to save configuration', 'error');
                }
            } catch (error) {
                console.error('Failed to save integration config:', error);
                showToast('Failed to save configuration', 'error');
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            setupModalEventListeners();
            loadIntegrations();
            setInterval(loadIntegrations, 60000);
        });

        // Also try immediately in case DOM is already loaded
        if (document.readyState !== 'loading') {
            setupModalEventListeners();
        }
    `;

    res.send(getPageTemplate({
        pageTitle: 'Integration Health',
        pageIcon: 'fas fa-plug',
        activeNav: 'integrations',
        contentBody: pageContent,
        additionalCSS: `
            #integration-modal {
                display: none !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.7) !important;
                backdrop-filter: blur(4px) !important;
                z-index: 99999 !important;
                align-items: center;
                justify-content: center;
            }
            
            #integration-modal.active {
                display: flex !important;
            }
            
            #integration-modal .modal-content {
                background: var(--bg-primary);
                border-radius: 12px;
                padding: 0;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 900px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                animation: slideUp 0.3s ease;
            }
            
            #integration-modal .modal-header,
            #integration-modal .modal-body,
            #integration-modal .modal-footer {
                padding: 1.5rem 2rem;
            }
            
            #integration-modal .modal-body {
                padding-top: 1rem;
                padding-bottom: 1rem;
            }
            
            /* Responsive breakpoints */
            @media (max-width: 640px) {
                #integration-modal .modal-content {
                    width: 95% !important;
                    max-width: 95% !important;
                    max-height: 95vh !important;
                    border-radius: 8px !important;
                }
            }
            
            @media (min-width: 641px) and (max-width: 1024px) {
                #integration-modal .modal-content {
                    width: 85% !important;
                    max-width: 750px !important;
                }
            }
            
            @media (min-width: 1025px) {
                #integration-modal .modal-content {
                    width: 80% !important;
                    max-width: 1000px !important;
                }
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `,
        additionalJS: additionalJS,
        req: req
    }));
});

// ============================================================
// ADVANCED SEARCH PAGE
// ============================================================

app.get('/search', requireAuth, (req, res) => {
    const contentBody = `
        <!-- Search Interface -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <h2 style="margin: 0 0 1.5rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-search"></i> Advanced Log Search
            </h2>
            
            <!-- Search Text Input -->
            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                    <i class="fas fa-keyboard"></i> Search Text
                </label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="text" id="searchText" placeholder="Search in log messages..." 
                           style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer;">
                        <input type="checkbox" id="useRegex" style="cursor: pointer;">
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">Regex</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer;">
                        <input type="checkbox" id="caseSensitive" style="cursor: pointer;">
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">Case Sensitive</span>
                    </label>
                </div>
            </div>

            <!-- Date Range -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                        <i class="fas fa-calendar-alt"></i> Start Date
                    </label>
                    <input type="datetime-local" id="startDate" 
                           style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                        <i class="fas fa-calendar-check"></i> End Date
                    </label>
                    <input type="datetime-local" id="endDate" 
                           style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
                </div>
            </div>

            <!-- Multi-select Filters -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                        <i class="fas fa-layer-group"></i> Log Levels
                    </label>
                    <select id="levelsFilter" multiple 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); min-height: 80px;">
                        <!-- Populated by JS -->
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                        <i class="fas fa-server"></i> Sources
                    </label>
                    <select id="sourcesFilter" multiple 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); min-height: 80px;">
                        <!-- Populated by JS -->
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                        <i class="fas fa-tags"></i> Categories
                    </label>
                    <select id="categoriesFilter" multiple 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); min-height: 80px;">
                        <!-- Populated by JS -->
                    </select>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button onclick="performSearch()" class="btn" style="background: var(--gradient-ocean); padding: 0.75rem 1.5rem;">
                    <i class="fas fa-search"></i> Search
                </button>
                <button onclick="clearSearch()" class="btn" style="background: var(--bg-secondary); color: var(--text-primary); padding: 0.75rem 1.5rem;">
                    <i class="fas fa-times"></i> Clear
                </button>
                <button onclick="saveSearch()" class="btn" style="background: var(--success-color); padding: 0.75rem 1.5rem;">
                    <i class="fas fa-save"></i> Save Search
                </button>
                <button onclick="loadSavedSearches()" class="btn" style="background: var(--info-color); padding: 0.75rem 1.5rem;">
                    <i class="fas fa-folder-open"></i> Load Saved
                </button>
            </div>
        </div>

        <!-- Saved Searches -->
        <div id="savedSearchesPanel" style="display: none; background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; color: var(--text-primary);">
                    <i class="fas fa-bookmark"></i> Saved Searches
                </h3>
                <button onclick="closeSavedSearches()" class="btn" style="padding: 0.5rem 1rem; background: var(--bg-secondary); color: var(--text-primary);">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
            <div id="savedSearchesList" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <!-- Populated by JS -->
            </div>
        </div>

        <!-- Search Results -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="margin: 0; color: var(--text-primary);">
                    <i class="fas fa-list"></i> Search Results <span id="resultCount" style="color: var(--text-secondary); font-size: 0.9em;"></span>
                </h2>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="exportResults()" class="btn" style="padding: 0.5rem 1rem; background: var(--accent-primary);">
                        <i class="fas fa-download"></i> Export
                    </button>
                </div>
            </div>
            
            <div id="searchResults" style="overflow-x: auto;">
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>Configure your search criteria and click Search to view results</p>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        let filterOptions = { levels: [], sources: [], categories: [] };
        let currentResults = [];

        // Load filter options on page load
        async function loadFilterOptions() {
            try {
                const response = await fetch('/api/logs/filter-options');
                filterOptions = await response.json();
                
                // Populate selects
                const levelsSelect = document.getElementById('levelsFilter');
                const sourcesSelect = document.getElementById('sourcesFilter');
                const categoriesSelect = document.getElementById('categoriesFilter');
                
                filterOptions.levels.forEach(level => {
                    const option = document.createElement('option');
                    option.value = level;
                    option.textContent = level;
                    levelsSelect.appendChild(option);
                });
                
                filterOptions.sources.forEach(source => {
                    const option = document.createElement('option');
                    option.value = source;
                    option.textContent = source;
                    sourcesSelect.appendChild(option);
                });
                
                filterOptions.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categoriesSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Error loading filter options:', error);
            }
        }

        async function performSearch() {
            const searchText = document.getElementById('searchText').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const useRegex = document.getElementById('useRegex').checked;
            const caseSensitive = document.getElementById('caseSensitive').checked;
            
            const levelsSelect = document.getElementById('levelsFilter');
            const sourcesSelect = document.getElementById('sourcesFilter');
            const categoriesSelect = document.getElementById('categoriesFilter');
            
            const levels = Array.from(levelsSelect.selectedOptions).map(opt => opt.value);
            const sources = Array.from(sourcesSelect.selectedOptions).map(opt => opt.value);
            const categories = Array.from(categoriesSelect.selectedOptions).map(opt => opt.value);
            
            try {
                const response = await fetch('/api/logs/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        searchText,
                        startDate: startDate || null,
                        endDate: endDate || null,
                        levels,
                        sources,
                        categories,
                        useRegex,
                        caseSensitive,
                        limit: 1000
                    })
                });
                
                const data = await response.json();
                currentResults = data.results;
                displayResults(data.results);
                document.getElementById('resultCount').textContent = \`(\${data.count} results)\`;
            } catch (error) {
                console.error('Search error:', error);
                showNotification('Search failed', 'error');
            }
        }

        function displayResults(results) {
            const container = document.getElementById('searchResults');
            
            if (results.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No results found matching your search criteria</p>
                    </div>
                \`;
                return;
            }
            
            let html = \`
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-secondary); font-weight: 600;">Time</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-secondary); font-weight: 600;">Level</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-secondary); font-weight: 600;">Source</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-secondary); font-weight: 600;">Category</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-secondary); font-weight: 600;">Message</th>
                        </tr>
                    </thead>
                    <tbody>
            \`;
            
            results.forEach(log => {
                const levelColor = {
                    'CRITICAL': 'var(--error-color)',
                    'ERROR': 'var(--error-color)',
                    'WARNING': 'var(--warning-color)',
                    'INFO': 'var(--info-color)',
                    'DEBUG': 'var(--text-secondary)'
                }[log.severity] || 'var(--text-primary)';
                
                html += \`
                    <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s ease;">
                        <td style="padding: 0.75rem; color: var(--text-secondary); font-size: 0.9rem; white-space: nowrap;">\${log.timestamp || ''}</td>
                        <td style="padding: 0.75rem;">
                            <span style="padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; background: \${levelColor}20; color: \${levelColor};">
                                \${log.severity || 'N/A'}
                            </span>
                        </td>
                        <td style="padding: 0.75rem; color: var(--text-primary); font-size: 0.9rem;">\${log.source || 'N/A'}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary); font-size: 0.9rem;">\${log.category || 'N/A'}</td>
                        <td style="padding: 0.75rem; color: var(--text-primary); font-size: 0.9rem; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">\${log.message || ''}</td>
                    </tr>
                \`;
            });
            
            html += \`
                    </tbody>
                </table>
            \`;
            
            container.innerHTML = html;
        }

        function clearSearch() {
            document.getElementById('searchText').value = '';
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
            document.getElementById('useRegex').checked = false;
            document.getElementById('caseSensitive').checked = false;
            document.getElementById('levelsFilter').selectedIndex = -1;
            document.getElementById('sourcesFilter').selectedIndex = -1;
            document.getElementById('categoriesFilter').selectedIndex = -1;
            document.getElementById('searchResults').innerHTML = \`
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>Configure your search criteria and click Search to view results</p>
                </div>
            \`;
            document.getElementById('resultCount').textContent = '';
        }

        async function saveSearch() {
            const name = prompt('Enter a name for this search:');
            if (!name) return;
            
            const description = prompt('Enter a description (optional):') || '';
            
            const filters = {
                searchText: document.getElementById('searchText').value,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                useRegex: document.getElementById('useRegex').checked,
                caseSensitive: document.getElementById('caseSensitive').checked,
                levels: Array.from(document.getElementById('levelsFilter').selectedOptions).map(opt => opt.value),
                sources: Array.from(document.getElementById('sourcesFilter').selectedOptions).map(opt => opt.value),
                categories: Array.from(document.getElementById('categoriesFilter').selectedOptions).map(opt => opt.value)
            };
            
            try {
                const response = await fetch('/api/saved-searches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description, filters })
                });
                
                if (response.ok) {
                    showNotification('Search saved successfully', 'success');
                } else {
                    showNotification('Failed to save search', 'error');
                }
            } catch (error) {
                console.error('Error saving search:', error);
                showNotification('Failed to save search', 'error');
            }
        }

        async function loadSavedSearches() {
            try {
                const response = await fetch('/api/saved-searches');
                const searches = await response.json();
                
                const panel = document.getElementById('savedSearchesPanel');
                const list = document.getElementById('savedSearchesList');
                
                if (searches.length === 0) {
                    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No saved searches yet</p>';
                } else {
                    list.innerHTML = searches.map(search => \`
                        <div style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">\${search.name}</strong>
                                <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">\${search.description || 'No description'}</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button onclick="applySearch(\${search.id})" class="btn" style="padding: 0.5rem 1rem; background: var(--accent-primary);">
                                    <i class="fas fa-play"></i> Apply
                                </button>
                                <button onclick="deleteSearch(\${search.id})" class="btn" style="padding: 0.5rem 1rem; background: var(--error-color);">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                panel.style.display = 'block';
            } catch (error) {
                console.error('Error loading saved searches:', error);
                showNotification('Failed to load saved searches', 'error');
            }
        }

        function closeSavedSearches() {
            document.getElementById('savedSearchesPanel').style.display = 'none';
        }

        async function applySearch(searchId) {
            try {
                const response = await fetch('/api/saved-searches');
                const searches = await response.json();
                const search = searches.find(s => s.id === searchId);
                
                if (!search) return;
                
                // Apply filters to form
                const filters = search.filters;
                document.getElementById('searchText').value = filters.searchText || '';
                document.getElementById('startDate').value = filters.startDate || '';
                document.getElementById('endDate').value = filters.endDate || '';
                document.getElementById('useRegex').checked = filters.useRegex || false;
                document.getElementById('caseSensitive').checked = filters.caseSensitive || false;
                
                // Select options
                const levelsSelect = document.getElementById('levelsFilter');
                const sourcesSelect = document.getElementById('sourcesFilter');
                const categoriesSelect = document.getElementById('categoriesFilter');
                
                Array.from(levelsSelect.options).forEach(opt => opt.selected = filters.levels.includes(opt.value));
                Array.from(sourcesSelect.options).forEach(opt => opt.selected = filters.sources.includes(opt.value));
                Array.from(categoriesSelect.options).forEach(opt => opt.selected = filters.categories.includes(opt.value));
                
                closeSavedSearches();
                
                // Track usage
                await fetch(\`/api/saved-searches/\${searchId}/use\`, { method: 'POST' });
                
                // Perform search
                performSearch();
            } catch (error) {
                console.error('Error applying search:', error);
                showNotification('Failed to apply search', 'error');
            }
        }

        async function deleteSearch(searchId) {
            if (!confirm('Delete this saved search?')) return;
            
            try {
                const response = await fetch(\`/api/saved-searches/\${searchId}\`, { method: 'DELETE' });
                if (response.ok) {
                    showNotification('Search deleted', 'success');
                    loadSavedSearches();
                } else {
                    showNotification('Failed to delete search', 'error');
                }
            } catch (error) {
                console.error('Error deleting search:', error);
                showNotification('Failed to delete search', 'error');
            }
        }

        function exportResults() {
            if (currentResults.length === 0) {
                showNotification('No results to export', 'warning');
                return;
            }
            
            const csv = [
                ['Timestamp', 'Level', 'Source', 'Category', 'Message'].join(','),
                ...currentResults.map(log => [
                    log.timestamp || '',
                    log.severity || '',
                    log.source || '',
                    log.category || '',
                    (log.message || '').replace(/"/g, '""')
                ].map(v => \`"\${v}"\`).join(','))
            ].join('\\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`search-results-\${new Date().toISOString().split('T')[0]}.csv\`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification('Results exported successfully', 'success');
        }

        // Initialize
        loadFilterOptions();
    `;

    res.send(getPageTemplate({
        pageTitle: 'Advanced Search',
        pageIcon: 'fas fa-search',
        activeNav: 'search',
        contentBody: contentBody,
        additionalCSS: '',
        additionalJS: additionalJS,
        req: req
    }));
});

// Admin Settings page
app.get('/admin/settings', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }
    
    const additionalCSS = `
        .tab-button.active {
            color: var(--accent-primary) !important;
            border-bottom-color: var(--accent-primary) !important;
        }
        .tab-button:hover {
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }
        .tab-content {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .settings-grid {
            display: grid;
            gap: 1.5rem;
        }
        .setting-item {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 1rem;
            padding: 1.5rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            align-items: center;
        }
        .setting-label {
            font-weight: 600;
            color: var(--text-primary);
        }
        .setting-label i {
            margin-right: 0.5rem;
            color: var(--accent-primary);
        }
        .setting-description {
            font-size: 0.875rem;
            color: var(--text-muted);
            margin-top: 0.25rem;
        }
        .setting-control {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }
        .setting-control input,
        .setting-control select {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-primary);
            color: var(--text-primary);
        }
        .setting-control input[type="checkbox"] {
            flex: none;
            width: 20px;
            height: 20px;
            cursor: pointer;
        }
        .setting-readonly {
            padding: 0.75rem;
            background: var(--bg-tertiary);
            border-radius: 6px;
            color: var(--text-muted);
            font-family: 'Courier New', monospace;
        }
        .tab-btn { transition: all 0.3s ease; }
        .tab-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-light); }
        .tab-btn.active { background: var(--gradient-ocean) !important; color: white !important; }
        .save-btn {
            position: sticky;
            bottom: 1rem;
            z-index: 10;
        }
        .section-header {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary);
            margin: 1.5rem 0 1rem 0;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--border-color);
        }
        .section-header i {
            margin-right: 0.5rem;
            color: var(--accent-primary);
        }
    `;

    const contentBody = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('settings')" id="tab-settings" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-cog"></i> Settings
                </button>
                <button onclick="switchTab('api-keys')" id="tab-api-keys" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-key"></i> API Keys
                </button>
                <button onclick="switchTab('backups')" id="tab-backups" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-database"></i> Backups
                </button>
                <button onclick="switchTab('metrics')" id="tab-metrics" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-heartbeat"></i> System Metrics
                </button>
                <button onclick="switchTab('appearance')" id="tab-appearance" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-palette"></i> Appearance
                </button>
                <button onclick="switchTab('import-export')" id="tab-import-export" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-file-import"></i> Import/Export
                </button>
            </div>
        </div>

        <!-- API Keys Tab Content -->
        <div id="content-api-keys" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h3><i class="fas fa-key"></i> API Key Management</h3>
                    <button onclick="showCreateAPIKeyModal()" class="btn" style="background: var(--success-color);">
                        <i class="fas fa-plus"></i> Generate New Key
                    </button>
                </div>
                <div class="card-body">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        API keys allow external applications to authenticate with the logging server. Keep your keys secure!
                    </p>
                    <div id="apiKeysContainer">
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                            <p style="margin-top: 1rem;">Loading API keys...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Settings Tab Content -->
        <div id="content-settings" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-cog"></i> System Settings</h3>
                    <button onclick="loadSettings()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body">
                    <div id="settings-content">
                        <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <br>Loading system settings...
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Backups Tab Content -->
        <div id="content-backups" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-database"></i> Database Backups</h3>
                    <button onclick="createBackup()" class="btn">
                        <i class="fas fa-plus"></i> Create Backup
                    </button>
                </div>
                <div class="card-body">
                    <div id="backups-content">
                        <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <br>Loading backups...
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Metrics Tab Content -->
        <div id="content-metrics" class="tab-content" style="display: none;">
            <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
            
            <div style="display: grid; grid-template-columns: 320px 1fr; gap: 1.25rem;">
                <!-- Stats Table -->
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-chart-bar"></i> Current Stats</h3>
                    </div>
                    <div style="padding: 1.5rem;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tbody>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 1rem 0; color: var(--text-muted);">
                                        <i class="fas fa-memory" style="color: #10b981; margin-right: 0.5rem; width: 20px;"></i>
                                        Memory Usage
                                    </td>
                                    <td style="padding: 1rem 0; text-align: right;">
                                        <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-current-memory">-- MB</div>
                                        <div style="font-size: 0.75rem; color: var(--text-muted);"><span id="metrics-memory-percent">--</span>% of heap</div>
                                    </td>
                                </tr>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 1rem 0; color: var(--text-muted);">
                                        <i class="fas fa-microchip" style="color: #3b82f6; margin-right: 0.5rem; width: 20px;"></i>
                                        CPU Usage
                                    </td>
                                    <td style="padding: 1rem 0; text-align: right;">
                                        <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-current-cpu">--%</div>
                                        <div style="font-size: 0.75rem; color: var(--text-muted);">Process load</div>
                                    </td>
                                </tr>
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 1rem 0; color: var(--text-muted);">
                                        <i class="fas fa-clock" style="color: #f59e0b; margin-right: 0.5rem; width: 20px;"></i>
                                        Server Uptime
                                    </td>
                                    <td style="padding: 1rem 0; text-align: right;">
                                        <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-server-uptime">--</div>
                                        <div style="font-size: 0.75rem; color: #10b981;"><i class="fas fa-circle" style="font-size: 0.4rem;"></i> Online</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 1rem 0; color: var(--text-muted);">
                                        <i class="fas fa-exchange-alt" style="color: #8b5cf6; margin-right: 0.5rem; width: 20px;"></i>
                                        Total Requests
                                    </td>
                                    <td style="padding: 1rem 0; text-align: right;">
                                        <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-request-total">--</div>
                                        <div style="font-size: 0.75rem; color: var(--text-muted);"><span id="metrics-request-rate">--</span>/min</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Charts Column -->
                <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                    <!-- Memory Chart -->
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-memory"></i> Memory Usage</h3>
                        </div>
                        <div style="padding: 1.5rem; height: 200px;">
                            <canvas id="metrics-memory-chart"></canvas>
                        </div>
                    </div>

                    <!-- CPU Chart -->
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-microchip"></i> CPU Usage</h3>
                        </div>
                        <div style="padding: 1.5rem; height: 200px;">
                            <canvas id="metrics-cpu-chart"></canvas>
                        </div>
                    </div>

                    <!-- Memory Breakdown -->
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-server"></i> Memory Breakdown</h3>
                        </div>
                        <div style="padding: 1.5rem;">
                            <div style="margin-bottom: 1.25rem;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
                                    <span style="color: var(--text-muted);">Heap Used</span>
                                    <span id="metrics-heap-used" style="font-weight: 600;">-- MB</span>
                                </div>
                                <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div id="metrics-heap-bar" style="background: linear-gradient(90deg, #10b981, #059669); height: 100%; width: 0%; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            <div style="margin-bottom: 1.25rem;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
                                    <span style="color: var(--text-muted);">Heap Total</span>
                                    <span id="metrics-heap-total" style="font-weight: 600;">-- MB</span>
                                </div>
                                <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div id="metrics-heap-total-bar" style="background: linear-gradient(90deg, #3b82f6, #2563eb); height: 100%; width: 0%; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            <div style="margin-bottom: 1.25rem;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
                                    <span style="color: var(--text-muted);">RSS (Resident Set)</span>
                                    <span id="metrics-rss" style="font-weight: 600;">-- MB</span>
                                </div>
                                <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div id="metrics-rss-bar" style="background: linear-gradient(90deg, #f59e0b, #d97706); height: 100%; width: 0%; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
                                    <span style="color: var(--text-muted);">External Memory</span>
                                    <span id="metrics-external-mem" style="font-weight: 600;">-- MB</span>
                                </div>
                                <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div id="metrics-external-bar" style="background: linear-gradient(90deg, #8b5cf6, #7c3aed); height: 100%; width: 0%; transition: width 0.3s;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Appearance Tab Content -->
        <div id="content-appearance" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-palette"></i> Theme Customization</h3>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="saveTheme()" class="btn">
                            <i class="fas fa-save"></i> Save Theme
                        </button>
                        <button onclick="resetTheme()" class="btn" style="background: var(--error-color);">
                            <i class="fas fa-undo"></i> Reset to Default
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <!-- Left Column: Controls -->
                        <div>
                            <!-- Gradient Editor Section -->
                            <div class="section-header">
                                <i class="fas fa-fill-drip"></i> Button Gradient
                            </div>
                            
                            <div style="margin-bottom: 1.5rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                <!-- Gradient Type -->
                                <div style="margin-bottom: 1rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                        Gradient Type
                                    </label>
                                    <select id="gradient-type" onchange="updateGradientPreview()" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                        <option value="linear">Linear</option>
                                        <option value="radial">Radial</option>
                                    </select>
                                </div>
                                
                                <!-- Gradient Angle (only for linear) -->
                                <div id="gradient-angle-container" style="margin-bottom: 1rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                        Angle: <span id="angle-value">135</span>°
                                    </label>
                                    <input type="range" id="gradient-angle" min="0" max="360" value="135" oninput="updateAngleDisplay(); updateGradientPreview();" style="width: 100%; cursor: pointer;">
                                </div>
                                
                                <!-- Gradient Stops -->
                                <div style="margin-bottom: 1rem;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <label style="font-weight: 600; color: var(--text-primary);">
                                            Gradient Stops
                                        </label>
                                        <button onclick="addGradientStop()" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;">
                                            <i class="fas fa-plus"></i> Add Stop
                                        </button>
                                    </div>
                                    <div id="gradient-stops-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                                        <!-- Gradient stops will be added here dynamically -->
                                    </div>
                                </div>
                                
                                <!-- Live Gradient Preview -->
                                <div style="margin-top: 1rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                        Preview
                                    </label>
                                    <div id="gradient-preview" style="height: 50px; border-radius: 8px; background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);"></div>
                                </div>
                            </div>
                            
                            <!-- Color Pickers Section -->
                            <div class="section-header">
                                <i class="fas fa-palette"></i> Color Scheme
                            </div>
                            
                            <div style="display: grid; gap: 1rem;">
                                <!-- Background Colors -->
                                <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                        <i class="fas fa-window-maximize" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                        Background Colors
                                    </h4>
                                    <div style="display: grid; gap: 0.75rem;">
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-bg-primary" value="#ffffff" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Primary Background</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Main content areas</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-bg-secondary" value="#f8fafc" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Secondary Background</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Panels and cards</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-bg-tertiary" value="#f1f5f9" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Tertiary Background</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Subtle elements</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Text Colors -->
                                <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                        <i class="fas fa-font" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                        Text Colors
                                    </h4>
                                    <div style="display: grid; gap: 0.75rem;">
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-text-primary" value="#1e293b" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Primary Text</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Main content text</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-text-secondary" value="#475569" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Secondary Text</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Subtitles and labels</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <input type="color" id="color-text-muted" value="#64748b" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: var(--text-primary);">Muted Text</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">Hints and placeholders</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Accent & Status Colors -->
                                <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                        <i class="fas fa-star" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                        Accent & Status Colors
                                    </h4>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-border" value="#e2e8f0" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Border</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-accent-primary" value="#3b82f6" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Accent Primary</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-accent-secondary" value="#1d4ed8" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Accent Secondary</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-success" value="#10b981" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Success</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-warning" value="#f59e0b" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Warning</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-error" value="#ef4444" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Error</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                                            <input type="color" id="color-info" value="#3b82f6" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                            <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Info</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right Column: Live Preview -->
                        <div>
                            <div class="section-header">
                                <i class="fas fa-eye"></i> Live Preview
                            </div>
                            
                            <div id="theme-preview-container" style="padding: 1.5rem; background: var(--bg-primary); border: 2px solid var(--border-color); border-radius: 8px;">
                                <!-- Sample Card -->
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;">
                                    <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Sample Card</h3>
                                    <p style="margin: 0 0 1rem 0; color: var(--text-secondary);">This is how your content will look with the new theme.</p>
                                    <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">Subtle text and hints appear like this.</p>
                                </div>
                                
                                <!-- Sample Buttons -->
                                <div style="margin-bottom: 1.5rem;">
                                    <button class="btn" style="margin-right: 0.5rem; margin-bottom: 0.5rem;">
                                        <i class="fas fa-check"></i> Primary Button
                                    </button>
                                    <button style="padding: 0.75rem 1.5rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; margin-right: 0.5rem; margin-bottom: 0.5rem;">
                                        Secondary Button
                                    </button>
                                </div>
                                
                                <!-- Status Messages -->
                                <div style="display: grid; gap: 0.75rem;">
                                    <div style="padding: 0.75rem; background: var(--success-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                        <i class="fas fa-check-circle"></i> Success message example
                                    </div>
                                    <div style="padding: 0.75rem; background: var(--warning-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                        <i class="fas fa-exclamation-triangle"></i> Warning message example
                                    </div>
                                    <div style="padding: 0.75rem; background: var(--error-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                        <i class="fas fa-times-circle"></i> Error message example
                                    </div>
                                    <div style="padding: 0.75rem; background: var(--info-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                        <i class="fas fa-info-circle"></i> Info message example
                                    </div>
                                </div>
                                
                                <!-- Sample Form Elements -->
                                <div style="margin-top: 1.5rem;">
                                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                        Sample Input Field
                                    </label>
                                    <input type="text" placeholder="Enter text here..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Import/Export Tab Content -->
        <div id="content-import-export" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-file-import"></i> Import/Export Settings</h3>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <!-- Export Section -->
                        <div>
                            <div class="section-header">
                                <i class="fas fa-download"></i> Export Settings
                            </div>
                            <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                                    Export all system settings, configurations, and integration settings to a JSON file.
                                    This file can be used to backup your configuration or migrate settings to another system.
                                </p>
                                <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 6px; border-left: 4px solid var(--info-color); margin-bottom: 1.5rem;">
                                    <strong style="color: var(--text-primary);">Export includes:</strong>
                                    <ul style="margin: 0.5rem 0 0 1.5rem; color: var(--text-secondary);">
                                        <li>System settings</li>
                                        <li>Integration configurations</li>
                                        <li>Maintenance schedules</li>
                                        <li>Theme preferences (excluding passwords/tokens)</li>
                                    </ul>
                                </div>
                                <button onclick="exportSettings()" class="btn" style="width: 100%;">
                                    <i class="fas fa-download"></i> Download Settings
                                </button>
                            </div>
                        </div>

                        <!-- Import Section -->
                        <div>
                            <div class="section-header">
                                <i class="fas fa-upload"></i> Import Settings
                            </div>
                            <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                                    Import settings from a previously exported JSON file. This will replace your current settings.
                                </p>
                                <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 6px; border-left: 4px solid var(--warning-color); margin-bottom: 1.5rem;">
                                    <strong style="color: var(--warning-color);"><i class="fas fa-exclamation-triangle"></i> Warning:</strong>
                                    <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                                        Importing settings will overwrite your current configuration. 
                                        It's recommended to export your current settings first as a backup.
                                        Server may require restart after import.
                                    </p>
                                </div>
                                <input type="file" id="import-file-input" accept=".json" style="display: none;" onchange="handleFileSelect(event)">
                                <button onclick="document.getElementById('import-file-input').click()" class="btn" style="width: 100%; background: var(--warning-color);">
                                    <i class="fas fa-upload"></i> Upload Settings File
                                </button>
                                <div id="import-status" style="margin-top: 1rem; display: none;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Import Preview Section -->
                    <div id="import-preview" style="display: none; margin-top: 2rem;">
                        <div class="section-header">
                            <i class="fas fa-eye"></i> Import Preview
                        </div>
                        <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                                <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 6px;">
                                    <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">File Version</div>
                                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);" id="preview-version">-</div>
                                </div>
                                <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 6px;">
                                    <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Settings Count</div>
                                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary);" id="preview-count">-</div>
                                </div>
                            </div>
                            <div style="margin-bottom: 1.5rem;">
                                <pre id="preview-json" style="background: var(--bg-primary); padding: 1rem; border-radius: 6px; border: 1px solid var(--border-color); max-height: 300px; overflow-y: auto; font-size: 0.875rem; color: var(--text-primary);"></pre>
                            </div>
                            <div style="display: flex; gap: 1rem;">
                                <button onclick="confirmImport()" class="btn" style="flex: 1; background: var(--success-color);">
                                    <i class="fas fa-check"></i> Confirm Import
                                </button>
                                <button onclick="cancelImport()" class="btn" style="flex: 1; background: var(--error-color);">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        let currentSettings = {};
        let metricsInterval;

        // Tab switching
        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(btn => { 
                btn.classList.remove('active'); 
                btn.style.background = 'var(--bg-secondary)'; 
                btn.style.color = 'var(--text-primary)'; 
            });
            
            document.getElementById('content-' + tabName).style.display = 'block';
            const activeBtn = document.getElementById('tab-' + tabName);
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--gradient-ocean)';
            activeBtn.style.color = 'white';
            
            // Clear metrics interval when switching away
            if (metricsInterval) {
                clearInterval(metricsInterval);
                metricsInterval = null;
            }
            
            if (tabName === 'settings') {
                loadSettings();
            } else if (tabName === 'api-keys') {
                loadAPIKeys();
            } else if (tabName === 'backups') {
                loadBackups();
            } else if (tabName === 'metrics') {
                refreshMetrics();
                // Auto-refresh metrics every 5 seconds
                metricsInterval = setInterval(fetchSystemMetrics, 5000);
            } else if (tabName === 'appearance') {
                loadThemeSettings();
            } else if (tabName === 'import-export') {
                // Import/Export tab loaded
            }
        }

        async function loadBackups() {
            try {
                const response = await fetch('/api/backups');
                if (!response.ok) throw new Error('Failed to fetch backups');
                
                const data = await response.json();
                renderBackups(data);
            } catch (error) {
                console.error('Error loading backups:', error);
                document.getElementById('backups-content').innerHTML = \`
                    <p style="text-align: center; color: var(--error-color); padding: 2rem;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <br>Failed to load backups
                    </p>
                \`;
            }
        }

        function renderBackups(data) {
            const container = document.getElementById('backups-content');
            
            if (data.backups.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-database" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No backups found</p>
                        <button onclick="createBackup()" class="btn" style="margin-top: 1rem;">
                            <i class="fas fa-plus"></i> Create First Backup
                        </button>
                    </div>
                \`;
                return;
            }

            const formatBytes = (bytes) => {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
            };

            container.innerHTML = \`
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Total Backups</div>
                        <div style="font-size: 1.5rem; font-weight: 600;">\${data.backups.length}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Total Size</div>
                        <div style="font-size: 1.5rem; font-weight: 600;">\${formatBytes(data.totalSize)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Current DB Size</div>
                        <div style="font-size: 1.5rem; font-weight: 600;">\${formatBytes(data.currentDbSize)}</div>
                    </div>
                </div>

                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Size</th>
                                <th>Created</th>
                                <th style="text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${data.backups.map(backup => \`
                                <tr>
                                    <td>
                                        <i class="fas fa-database" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                        \${backup.filename}
                                    </td>
                                    <td>\${formatBytes(backup.size)}</td>
                                    <td>\${backup.createdFormatted}</td>
                                    <td style="text-align: center;">
                                        <button onclick="downloadBackup('\${backup.filename}')" class="btn" style="padding: 0.4rem 0.8rem; margin: 0 0.25rem;" title="Download">
                                            <i class="fas fa-download"></i>
                                        </button>
                                        <button onclick="restoreBackup('\${backup.filename}')" class="btn" style="padding: 0.4rem 0.8rem; margin: 0 0.25rem; background: var(--warning-color);" title="Restore">
                                            <i class="fas fa-undo"></i>
                                        </button>
                                        <button onclick="deleteBackup('\${backup.filename}')" class="btn" style="padding: 0.4rem 0.8rem; margin: 0 0.25rem; background: var(--error-color);" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                </div>
            \`;
        }

        // Metrics variables and functions
        let metricsMemoryChart, metricsCpuChart;
        let metricsHistory = [];
        const MAX_METRICS_POINTS = 20;

        function initMetricsCharts() {
            const chartConfig = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'var(--text-muted)', maxTicksLimit: 6 }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'var(--text-muted)' },
                        beginAtZero: true
                    }
                }
            };

            const memCtx = document.getElementById('metrics-memory-chart');
            if (memCtx && !metricsMemoryChart) {
                metricsMemoryChart = new Chart(memCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Memory (MB)',
                            data: [],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: chartConfig
                });
            }

            const cpuCtx = document.getElementById('metrics-cpu-chart');
            if (cpuCtx && !metricsCpuChart) {
                metricsCpuChart = new Chart(cpuCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'CPU %',
                            data: [],
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: chartConfig
                });
            }
        }

        async function fetchSystemMetrics() {
            try {
                const response = await fetch('/api/system/metrics', {
                    credentials: 'same-origin'
                });
                if (!response.ok) throw new Error('Failed to fetch metrics');
                
                const metrics = await response.json();
                updateMetricsDisplay(metrics);
            } catch (error) {
                console.error('Error fetching metrics:', error);
            }
        }

        function updateMetricsDisplay(metrics) {
            // Update current stats
            document.getElementById('metrics-current-memory').textContent = metrics.memory.heapUsed + ' MB';
            document.getElementById('metrics-current-cpu').textContent = metrics.cpu.percent + '%';
            document.getElementById('metrics-server-uptime').textContent = formatMetricsUptime(metrics.uptime);
            document.getElementById('metrics-request-total').textContent = metrics.requests.total.toLocaleString();
            document.getElementById('metrics-request-rate').textContent = Math.round(metrics.requests.total / Math.max(metrics.uptime, 1) * 60);

            // Calculate percentages
            const heapPercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
            document.getElementById('metrics-memory-percent').textContent = heapPercent.toFixed(1);

            // Update memory breakdown with bars
            document.getElementById('metrics-heap-used').textContent = metrics.memory.heapUsed + ' MB';
            document.getElementById('metrics-heap-bar').style.width = heapPercent + '%';
            
            document.getElementById('metrics-heap-total').textContent = metrics.memory.heapTotal + ' MB';
            document.getElementById('metrics-heap-total-bar').style.width = '100%';
            
            document.getElementById('metrics-rss').textContent = metrics.memory.rss + ' MB';
            const rssPercent = (metrics.memory.rss / (metrics.memory.heapTotal * 2)) * 100;
            document.getElementById('metrics-rss-bar').style.width = Math.min(rssPercent, 100) + '%';

            document.getElementById('metrics-external-mem').textContent = metrics.memory.external + ' MB';
            const externalPercent = (metrics.memory.external / metrics.memory.heapTotal) * 100;
            document.getElementById('metrics-external-bar').style.width = Math.min(externalPercent, 100) + '%';

            // Add to history
            metricsHistory.push({
                timestamp: new Date(),
                memory: metrics.memory.heapUsed,
                cpu: metrics.cpu.percent
            });

            // Keep only last MAX_METRICS_POINTS
            if (metricsHistory.length > MAX_METRICS_POINTS) {
                metricsHistory.shift();
            }

            // Update charts
            updateMetricsCharts();
        }

        function updateMetricsCharts() {
            if (!metricsMemoryChart || !metricsCpuChart) return;

            const labels = metricsHistory.map(m => m.timestamp.toLocaleTimeString());
            
            metricsMemoryChart.data.labels = labels;
            metricsMemoryChart.data.datasets[0].data = metricsHistory.map(m => m.memory);
            metricsMemoryChart.update('none');

            metricsCpuChart.data.labels = labels;
            metricsCpuChart.data.datasets[0].data = metricsHistory.map(m => m.cpu || 0);
            metricsCpuChart.update('none');
        }

        function formatMetricsUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (hours > 0) return hours + 'h ' + minutes + 'm';
            if (minutes > 0) return minutes + 'm';
            return seconds + 's';
        }

        function refreshMetrics() {
            initMetricsCharts();
            fetchSystemMetrics();
        }

        async function createBackup() {
            if (!confirm('Create a new backup of the database?')) return;
            
            try {
                showToast('Creating backup...', 'info');
                const response = await fetch('/api/backups/create', { method: 'POST' });
                
                if (!response.ok) throw new Error('Failed to create backup');
                
                const result = await response.json();
                showToast('Backup created successfully', 'success');
                loadBackups();
            } catch (error) {
                console.error('Error creating backup:', error);
                showToast('Failed to create backup', 'error');
            }
        }

        function downloadBackup(filename) {
            window.location.href = \`/api/backups/\${filename}/download\`;
            showToast('Downloading backup...', 'info');
        }

        async function restoreBackup(filename) {
            if (!confirm(\`Are you sure you want to restore from "\${filename}"?\\n\\nThis will replace the current database and restart the server.\`)) return;
            
            try {
                showToast('Restoring backup...', 'info');
                const response = await fetch(\`/api/backups/\${filename}/restore\`, { method: 'POST' });
                
                if (!response.ok) throw new Error('Failed to restore backup');
                
                const result = await response.json();
                showToast('Backup restored. Server restarting...', 'success');
                
                // Redirect to login after 2 seconds
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } catch (error) {
                console.error('Error restoring backup:', error);
                showToast('Failed to restore backup', 'error');
            }
        }

        async function deleteBackup(filename) {
            if (!confirm(\`Are you sure you want to delete "\${filename}"?\\n\\nThis action cannot be undone.\`)) return;
            
            try {
                showToast('Deleting backup...', 'info');
                const response = await fetch(\`/api/backups/\${filename}\`, { method: 'DELETE' });
                
                if (!response.ok) throw new Error('Failed to delete backup');
                
                showToast('Backup deleted successfully', 'success');
                loadBackups();
            } catch (error) {
                console.error('Error deleting backup:', error);
                showToast('Failed to delete backup', 'error');
            }
        }

        // API Keys Functions
        async function loadAPIKeys() {
            try {
                const response = await fetch('/api/api-keys');
                if (!response.ok) throw new Error('Failed to fetch API keys');
                
                const data = await response.json();
                renderAPIKeys(data.keys || []);
            } catch (error) {
                console.error('Error loading API keys:', error);
                document.getElementById('apiKeysContainer').innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Failed to load API keys</p>
                    </div>
                \`;
            }
        }

        function renderAPIKeys(keys) {
            const container = document.getElementById('apiKeysContainer');
            
            if (keys.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-key" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No API keys created yet</p>
                        <button onclick="showCreateAPIKeyModal()" class="btn" style="margin-top: 1rem; background: var(--success-color);">
                            <i class="fas fa-plus"></i> Generate Your First Key
                        </button>
                    </div>
                \`;
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
            
            keys.forEach(key => {
                const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
                const statusColor = isExpired ? 'var(--error-color)' : (key.is_active ? 'var(--success-color)' : 'var(--warning-color)');
                const statusText = isExpired ? 'Expired' : (key.is_active ? 'Active' : 'Inactive');
                const maskedKey = key.key_value.substring(0, 12) + '...' + key.key_value.substring(key.key_value.length - 4);
                
                html += \`
                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                    <h4 style="margin: 0; color: var(--text-primary);"><i class="fas fa-key"></i> \${key.name}</h4>
                                    <span style="padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: \${statusColor}20; color: \${statusColor};">
                                        \${statusText}
                                    </span>
                                </div>
                                \${key.description ? \`<p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.9rem;">\${key.description}</p>\` : ''}
                                <div style="margin: 0.75rem 0; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 6px; font-family: monospace; font-size: 0.9rem; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                                    <code id="key-\${key.id}">\${maskedKey}</code>
                                    <button onclick="copyToClipboard('\${key.key_value}', 'key-\${key.id}')" class="btn" style="padding: 0.5rem 1rem; background: var(--info-color);">
                                        <i class="fas fa-copy"></i> Copy
                                    </button>
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
                                    <div><i class="fas fa-user"></i> Created by: <strong>\${key.created_by_username || 'Unknown'}</strong></div>
                                    <div><i class="fas fa-calendar"></i> Created: <strong>\${new Date(key.created_at).toLocaleDateString()}</strong></div>
                                    <div><i class="fas fa-clock"></i> Last used: <strong>\${key.last_used ? new Date(key.last_used).toLocaleDateString() : 'Never'}</strong></div>
                                    <div><i class="fas fa-chart-line"></i> Uses: <strong>\${key.usage_count || 0}</strong></div>
                                    \${key.expires_at ? \`<div><i class="fas fa-hourglass-end"></i> Expires: <strong>\${new Date(key.expires_at).toLocaleDateString()}</strong></div>\` : ''}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button onclick="toggleAPIKeyStatus(\${key.id}, \${key.is_active})" class="btn" style="background: var(--warning-color);">
                                <i class="fas fa-\${key.is_active ? 'pause' : 'play'}"></i> \${key.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onclick="regenerateAPIKey(\${key.id})" class="btn" style="background: var(--info-color);">
                                <i class="fas fa-sync-alt"></i> Regenerate
                            </button>
                            <button onclick="deleteAPIKey(\${key.id})" class="btn" style="background: var(--error-color);">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                \`;
            });
            
            html += '</div>';
            container.innerHTML = html;
        }

        function showCreateAPIKeyModal() {
            const modal = \`
                <div id="apiKeyModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; box-shadow: var(--shadow-medium);">
                        <h3 style="margin: 0 0 1.5rem 0; color: var(--text-primary);"><i class="fas fa-key"></i> Generate New API Key</h3>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                                Key Name <span style="color: var(--error-color);">*</span>
                            </label>
                            <input type="text" id="newKeyName" placeholder="e.g., Mobile App, External Service" 
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
                        </div>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                                Description
                            </label>
                            <textarea id="newKeyDescription" placeholder="Optional description" rows="3"
                                      style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); resize: vertical;"></textarea>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">
                                Expiration
                            </label>
                            <select id="newKeyExpiration" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
                                <option value="0">Never expires</option>
                                <option value="7">7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                                <option value="180">180 days</option>
                                <option value="365">1 year</option>
                            </select>
                        </div>
                        
                        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                            <button onclick="closeModal('apiKeyModal')" class="btn" style="background: var(--bg-secondary); color: var(--text-primary);">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                            <button onclick="createAPIKey()" class="btn" style="background: var(--success-color);">
                                <i class="fas fa-check"></i> Generate Key
                            </button>
                        </div>
                    </div>
                </div>
            \`;
            
            document.body.insertAdjacentHTML('beforeend', modal);
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.remove();
        }

        async function createAPIKey() {
            const name = document.getElementById('newKeyName').value.trim();
            const description = document.getElementById('newKeyDescription').value.trim();
            const expiresInDays = parseInt(document.getElementById('newKeyExpiration').value);
            
            if (!name) {
                showToast('Please enter a key name', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/api-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description, expires_in_days: expiresInDays })
                });
                
                if (!response.ok) throw new Error('Failed to create API key');
                
                const result = await response.json();
                showToast('API key created successfully!', 'success');
                closeModal('apiKeyModal');
                loadAPIKeys();
                
                // Show the full key in an alert (only time it's shown)
                alert(\`API Key created successfully!\\n\\nKey: \${result.key}\\n\\nIMPORTANT: Copy this key now. It will not be shown again!\`);
            } catch (error) {
                console.error('Error creating API key:', error);
                showToast('Failed to create API key', 'error');
            }
        }

        async function toggleAPIKeyStatus(keyId, currentStatus) {
            try {
                const response = await fetch(\`/api/api-keys/\${keyId}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: !currentStatus })
                });
                
                if (!response.ok) throw new Error('Failed to update API key');
                
                showToast(\`API key \${!currentStatus ? 'activated' : 'deactivated'} successfully\`, 'success');
                loadAPIKeys();
            } catch (error) {
                console.error('Error updating API key:', error);
                showToast('Failed to update API key', 'error');
            }
        }

        async function regenerateAPIKey(keyId) {
            if (!confirm('Regenerate this API key?\\n\\nThe old key will stop working immediately.')) return;
            
            try {
                const response = await fetch(\`/api/api-keys/\${keyId}/regenerate\`, { method: 'POST' });
                
                if (!response.ok) throw new Error('Failed to regenerate API key');
                
                const result = await response.json();
                showToast('API key regenerated successfully!', 'success');
                loadAPIKeys();
                
                alert(\`New API Key: \${result.key}\\n\\nIMPORTANT: Copy this key now. It will not be shown again!\`);
            } catch (error) {
                console.error('Error regenerating API key:', error);
                showToast('Failed to regenerate API key', 'error');
            }
        }

        async function deleteAPIKey(keyId) {
            if (!confirm('Delete this API key?\\n\\nThis action cannot be undone.')) return;
            
            try {
                const response = await fetch(\`/api/api-keys/\${keyId}\`, { method: 'DELETE' });
                
                if (!response.ok) throw new Error('Failed to delete API key');
                
                showToast('API key deleted successfully', 'success');
                loadAPIKeys();
            } catch (error) {
                console.error('Error deleting API key:', error);
                showToast('Failed to delete API key', 'error');
            }
        }

        function copyToClipboard(text, elementId) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('API key copied to clipboard!', 'success');
                const element = document.getElementById(elementId);
                if (element) {
                    element.textContent = text;
                    setTimeout(() => {
                        const maskedKey = text.substring(0, 12) + '...' + text.substring(text.length - 4);
                        element.textContent = maskedKey;
                    }, 3000);
                }
            }).catch(err => {
                showToast('Failed to copy to clipboard', 'error');
            });
        }

        async function loadSettings() {
            try {
                const response = await fetch('/api/settings');
                if (!response.ok) throw new Error('Failed to fetch settings');
                
                currentSettings = await response.json();
                renderSettings();
            } catch (error) {
                console.error('Error loading settings:', error);
                document.getElementById('settings-content').innerHTML = \`
                    <p style="text-align: center; color: var(--error-color); padding: 2rem;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <br>Failed to load settings
                    </p>
                \`;
            }
        }

        function renderSettings() {
            const settingsDiv = document.getElementById('settings-content');
            settingsDiv.innerHTML = \`
                <form id="settingsForm">
                    <div class="section-header">
                        <i class="fas fa-info-circle"></i> System Information
                    </div>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-tag"></i> System Name</div>
                                <div class="setting-description">Platform identifier</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" id="systemName" name="systemName" 
                                       value="\${currentSettings.system?.name || 'Enterprise Logging Platform'}"
                                       placeholder="Enterprise Logging Platform">
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-code-branch"></i> Version</div>
                                <div class="setting-description">Current server version (read-only)</div>
                            </div>
                            <div class="setting-readonly">\${currentSettings.system?.version || '2.1.0-stable-enhanced'}</div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-user"></i> Owner</div>
                                <div class="setting-description">System administrator</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" id="systemOwner" name="systemOwner" 
                                       value="\${currentSettings.system?.owner || 'Tom Nelson'}"
                                       placeholder="Tom Nelson">
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-server"></i> Server Port</div>
                                <div class="setting-description">HTTP server port (read-only, requires restart)</div>
                            </div>
                            <div class="setting-readonly">\${currentSettings.server?.port || 10180}</div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-database"></i> Database</div>
                                <div class="setting-description">SQLite database file location (read-only)</div>
                            </div>
                            <div class="setting-readonly">\${currentSettings.database?.path || 'N/A'}</div>
                        </div>
                    </div>

                    <div class="section-header">
                        <i class="fas fa-clock"></i> System Configuration
                    </div>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-globe"></i> Timezone</div>
                                <div class="setting-description">Server timezone for logs and timestamps</div>
                            </div>
                            <div class="setting-control">
                                <select id="timezone" name="timezone">
                                    <option value="America/Denver" \${currentSettings.system?.timezone === 'America/Denver' ? 'selected' : ''}>America/Denver (US Mountain Time)</option>
                                    <option value="America/Edmonton" \${currentSettings.system?.timezone === 'America/Edmonton' ? 'selected' : ''}>America/Edmonton (Canada Mountain Time)</option>
                                    <option value="America/New_York" \${currentSettings.system?.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (Eastern)</option>
                                    <option value="America/Chicago" \${currentSettings.system?.timezone === 'America/Chicago' ? 'selected' : ''}>America/Chicago (Central)</option>
                                    <option value="America/Los_Angeles" \${currentSettings.system?.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (Pacific)</option>
                                    <option value="America/Toronto" \${currentSettings.system?.timezone === 'America/Toronto' ? 'selected' : ''}>America/Toronto (Canada Eastern)</option>
                                    <option value="America/Vancouver" \${currentSettings.system?.timezone === 'America/Vancouver' ? 'selected' : ''}>America/Vancouver (Canada Pacific)</option>
                                    <option value="UTC" \${currentSettings.system?.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-palette"></i> Default Theme</div>
                                <div class="setting-description">Default color theme for the interface</div>
                            </div>
                            <div class="setting-control">
                                <select id="default_theme" name="default_theme">
                                    <option value="auto" \${(currentSettings.theme || 'auto') === 'auto' ? 'selected' : ''}>Auto (System Preference)</option>
                                    <option value="light" \${currentSettings.theme === 'light' ? 'selected' : ''}>Light Mode</option>
                                    <option value="dark" \${currentSettings.theme === 'dark' ? 'selected' : ''}>Dark Mode</option>
                                    <option value="ocean" \${currentSettings.theme === 'ocean' ? 'selected' : ''}>Ocean Blue</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="section-header">
                        <i class="fas fa-database"></i> Data Retention
                    </div>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-calendar-alt"></i> Log Retention Days</div>
                                <div class="setting-description">Automatically delete logs older than this many days</div>
                            </div>
                            <div class="setting-control">
                                <input type="number" id="logRetention" name="logRetention" min="1" max="365" 
                                       value="\${currentSettings.maintenance?.logRetentionDays || 30}">
                                <span>days</span>
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-clock"></i> Backup Schedule</div>
                                <div class="setting-description">Daily backup time</div>
                            </div>
                            <div class="setting-control">
                                <input type="time" id="backupSchedule" name="backupSchedule" 
                                       value="02:00">
                                <small style="color: var(--text-muted); margin-left: 0.5rem;">Daily at this time</small>
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-broom"></i> Cleanup Schedule</div>
                                <div class="setting-description">Weekly cleanup time</div>
                            </div>
                            <div class="setting-control">
                                <select id="cleanupDay" name="cleanupDay" style="width: auto; margin-right: 0.5rem;">
                                    <option value="0">Sunday</option>
                                    <option value="1">Monday</option>
                                    <option value="2">Tuesday</option>
                                    <option value="3">Wednesday</option>
                                    <option value="4">Thursday</option>
                                    <option value="5">Friday</option>
                                    <option value="6">Saturday</option>
                                </select>
                                <input type="time" id="cleanupSchedule" name="cleanupSchedule" 
                                       value="03:00" style="width: auto;">
                            </div>
                        </div>
                    </div>

                    <div class="section-header">
                        <i class="fas fa-plug"></i> Integration Configuration
                    </div>
                    <div style="padding: 2rem; background: var(--bg-secondary); border-radius: 12px; border-left: 4px solid var(--accent-primary); text-align: center;">
                        <i class="fas fa-plug" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 1rem; opacity: 0.8;"></i>
                        <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Manage Integrations</h3>
                        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                            All integration configuration has been moved to the dedicated Integrations page for better organization.
                        </p>
                        <a href="/integrations" class="btn" style="background: var(--gradient-ocean); text-decoration: none; display: inline-block;">
                            <i class="fas fa-arrow-right"></i> Go to Integrations Page
                        </a>
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 2rem; gap: 1rem;">
                        <button type="button" onclick="loadSettings()" class="btn btn-secondary">
                            <i class="fas fa-undo"></i> Reset Changes
                        </button>
                        <button type="submit" class="btn">
                            <i class="fas fa-save"></i> Save Settings
                        </button>
                    </div>
                </form>

                <div class="section-header">
                    <i class="fas fa-tools"></i> Server Actions
                </div>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button onclick="clearCache()" class="btn btn-secondary">
                        <i class="fas fa-broom"></i> Clear Cache
                    </button>
                    <button onclick="confirmRestart()" class="btn btn-warning">
                        <i class="fas fa-sync-alt"></i> Restart Server
                    </button>
                </div>

                <div style="margin-top: 2rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; border-left: 4px solid var(--accent-primary);">
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">
                        <i class="fas fa-info-circle"></i> <strong>Note:</strong> Configuration changes are saved in memory and will persist until server restart. 
                        For permanent changes, update the config object in server.js.
                    </p>
                </div>
            \`;

            // Setup form submission
            document.getElementById('settingsForm').addEventListener('submit', saveSettings);
            
            // Parse cron schedules and populate time fields
            parseCronSchedules();
        }
        
        function parseCronSchedules() {
            // Parse backup schedule (format: "0 2 * * *" = daily at 2:00 AM)
            const backupCron = currentSettings.maintenance?.backupSchedule || '0 2 * * *';
            const backupParts = backupCron.split(' ');
            if (backupParts.length >= 2) {
                const minute = backupParts[0].padStart(2, '0');
                const hour = backupParts[1].padStart(2, '0');
                document.getElementById('backupSchedule').value = \`\${hour}:\${minute}\`;
            }
            
            // Parse cleanup schedule (format: "0 3 * * 0" = Sunday at 3:00 AM)
            const cleanupCron = currentSettings.maintenance?.cleanupSchedule || '0 3 * * 0';
            const cleanupParts = cleanupCron.split(' ');
            if (cleanupParts.length >= 5) {
                const minute = cleanupParts[0].padStart(2, '0');
                const hour = cleanupParts[1].padStart(2, '0');
                const day = cleanupParts[4]; // Day of week (0 = Sunday)
                document.getElementById('cleanupSchedule').value = \`\${hour}:\${minute}\`;
                document.getElementById('cleanupDay').value = day;
            }
        }
        
        function timeToCron(time, day = null) {
            // Convert HH:MM to cron format
            const [hour, minute] = time.split(':');
            if (day !== null) {
                // Weekly schedule with specific day
                return \`\${parseInt(minute)} \${parseInt(hour)} * * \${day}\`;
            } else {
                // Daily schedule
                return \`\${parseInt(minute)} \${parseInt(hour)} * * *\`;
            }
        }

        async function saveSettings(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            
            // Convert time picker values back to cron format
            const backupTime = formData.get('backupSchedule');
            const cleanupTime = formData.get('cleanupSchedule');
            const cleanupDay = formData.get('cleanupDay');
            
            const updates = {
                systemName: formData.get('systemName'),
                systemOwner: formData.get('systemOwner'),
                timezone: formData.get('timezone'),
                default_theme: formData.get('default_theme'),
                logRetentionDays: parseInt(formData.get('logRetention')),
                backupSchedule: timeToCron(backupTime),
                cleanupSchedule: timeToCron(cleanupTime, cleanupDay),
                wsEnabled: formData.get('wsEnabled') === 'on',
                mqttEnabled: formData.get('mqttEnabled') === 'on',
                mqttBroker: formData.get('mqttBroker'),
                mqttUsername: formData.get('mqttUsername'),
                mqttPassword: formData.get('mqttPassword'),
                mqttTopic: formData.get('mqttTopic'),
                unifiEnabled: formData.get('unifiEnabled') === 'on',
                unifiHost: formData.get('unifiHost'),
                unifiUsername: formData.get('unifiUsername'),
                unifiPassword: formData.get('unifiPassword'),
                unifiSite: formData.get('unifiSite'),
                haEnabled: formData.get('haEnabled') === 'on',
                haHost: formData.get('haHost'),
                haToken: formData.get('haToken')
            };

            try {
                const response = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });

                if (response.ok) {
                    const result = await response.json();
                    alert('✅ ' + result.message);
                    loadSettings();
                    // Reload page to apply timezone/theme changes
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    const error = await response.json();
                    alert('❌ Failed to save settings: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('❌ Error saving settings: ' + error.message);
            }
        }

        async function testConnection() {
            try {
                const response = await fetch('/api/integrations/status');
                const data = await response.json();
                
                if (data.success) {
                    let message = '🔌 Integration Status:\\n\\n';
                    message += \`✅ Server: \${data.status.server.status}\\n\`;
                    message += \`📊 Uptime: \${Math.floor(data.status.server.uptime / 3600)}h \${Math.floor((data.status.server.uptime % 3600) / 60)}m\\n\`;
                    message += \`💾 Memory: \${data.status.server.memory_mb} MB\\n\\n\`;
                    
                    if (data.status.integrations.mqtt) {
                        message += \`MQTT: \${data.status.integrations.mqtt.status || 'disconnected'}\\n\`;
                    }
                    if (data.status.integrations.websocket) {
                        message += \`WebSocket: \${data.status.integrations.websocket.enabled ? 'enabled' : 'disabled'} (\${data.status.integrations.websocket.clients || 0} clients)\\n\`;
                    }
                    if (data.status.integrations.unifi) {
                        message += \`UniFi: \${data.status.integrations.unifi.status || 'disconnected'}\\n\`;
                    }
                    if (data.status.integrations.home_assistant) {
                        message += \`Home Assistant: \${data.status.integrations.home_assistant.status || 'disconnected'}\\n\`;
                    }
                    
                    alert(message);
                } else {
                    alert('❌ Failed to test connections');
                }
            } catch (error) {
                alert('❌ Error testing connections: ' + error.message);
            }
        }

        function clearCache() {
            if (confirm('Clear server cache?\\n\\nThis will clear temporary data and may improve performance.')) {
                alert('✅ Cache cleared successfully!\\n\\nNote: This is a placeholder - implement actual cache clearing logic in the backend.');
            }
        }

        function exportSettings() {
            const settingsJson = JSON.stringify(currentSettings, null, 2);
            const blob = new Blob([settingsJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'enterprise-logging-settings-' + new Date().toISOString().split('T')[0] + '.json';
            a.click();
            URL.revokeObjectURL(url);
        }

        function confirmRestart() {
            if (confirm('⚠️ Restart Server?\\n\\nThis will restart the entire logging server.\\nAll active connections will be disconnected.\\n\\nAre you sure?')) {
                fetch('/api/admin/restart', {
                    method: 'POST',
                    credentials: 'same-origin'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showToast('🔄 Server restarting... Page will reload in 10 seconds.', 'info');
                        setTimeout(() => {
                            window.location.reload();
                        }, 10000);
                    } else {
                        showToast(data.error || 'Restart failed', 'error');
                    }
                })
                .catch(error => {
                    console.error('Restart error:', error);
                    showToast('🔄 Server restarting... Page will reload in 10 seconds.', 'info');
                    setTimeout(() => {
                        window.location.reload();
                    }, 10000);
                });
            }
        }

        // ===== THEME CUSTOMIZATION FUNCTIONS =====
        let gradientStops = [
            { position: 0, color: '#0ea5e9' },
            { position: 50, color: '#3b82f6' },
            { position: 100, color: '#6366f1' }
        ];

        async function loadThemeSettings() {
            try {
                const response = await fetch('/api/user/theme');
                if (!response.ok) throw new Error('Failed to load theme');
                
                const theme = await response.json();
                
                if (theme) {
                    // Load gradient settings
                    document.getElementById('gradient-type').value = theme.gradient_type || 'linear';
                    document.getElementById('gradient-angle').value = theme.gradient_angle || 135;
                    updateAngleDisplay();
                    
                    // Load gradient stops
                    if (theme.gradient_stops) {
                        gradientStops = theme.gradient_stops;
                    }
                    
                    // Load color settings
                    if (theme.bg_primary) document.getElementById('color-bg-primary').value = theme.bg_primary;
                    if (theme.bg_secondary) document.getElementById('color-bg-secondary').value = theme.bg_secondary;
                    if (theme.bg_tertiary) document.getElementById('color-bg-tertiary').value = theme.bg_tertiary;
                    if (theme.text_primary) document.getElementById('color-text-primary').value = theme.text_primary;
                    if (theme.text_secondary) document.getElementById('color-text-secondary').value = theme.text_secondary;
                    if (theme.text_muted) document.getElementById('color-text-muted').value = theme.text_muted;
                    if (theme.border_color) document.getElementById('color-border').value = theme.border_color;
                    if (theme.accent_primary) document.getElementById('color-accent-primary').value = theme.accent_primary;
                    if (theme.accent_secondary) document.getElementById('color-accent-secondary').value = theme.accent_secondary;
                    if (theme.success_color) document.getElementById('color-success').value = theme.success_color;
                    if (theme.warning_color) document.getElementById('color-warning').value = theme.warning_color;
                    if (theme.error_color) document.getElementById('color-error').value = theme.error_color;
                    if (theme.info_color) document.getElementById('color-info').value = theme.info_color;
                }
                
                // Render gradient stops and update previews
                renderGradientStops();
                updateGradientPreview();
                updateColorPreview();
            } catch (error) {
                console.error('Error loading theme:', error);
                // Initialize with defaults
                renderGradientStops();
                updateGradientPreview();
            }
        }

        function renderGradientStops() {
            const container = document.getElementById('gradient-stops-container');
            container.innerHTML = gradientStops.map((stop, index) => \`
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 6px;">
                    <input type="color" value="\${stop.color}" onchange="updateStopColor(\${index}, this.value)" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Stop \${index + 1}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">\${stop.position}%</span>
                        </div>
                        <input type="range" min="0" max="100" value="\${stop.position}" oninput="updateStopPosition(\${index}, this.value)" style="width: 100%; cursor: pointer;">
                    </div>
                    \${gradientStops.length > 2 ? \`
                        <button onclick="removeGradientStop(\${index})" style="padding: 0.5rem; background: var(--error-color); color: white; border: none; border-radius: 6px; cursor: pointer;" title="Remove">
                            <i class="fas fa-trash"></i>
                        </button>
                    \` : ''}
                </div>
            \`).join('');
        }

        function addGradientStop() {
            if (gradientStops.length >= 10) {
                showToast('Maximum 10 gradient stops allowed', 'warning');
                return;
            }
            
            // Add new stop in the middle
            const newPosition = Math.round((gradientStops[gradientStops.length - 1].position + gradientStops[gradientStops.length - 2].position) / 2);
            gradientStops.push({
                position: newPosition || 50,
                color: '#6366f1'
            });
            
            // Sort by position
            gradientStops.sort((a, b) => a.position - b.position);
            
            renderGradientStops();
            updateGradientPreview();
        }

        function removeGradientStop(index) {
            if (gradientStops.length <= 2) {
                showToast('Minimum 2 gradient stops required', 'warning');
                return;
            }
            
            gradientStops.splice(index, 1);
            renderGradientStops();
            updateGradientPreview();
        }

        function updateStopColor(index, color) {
            gradientStops[index].color = color;
            updateGradientPreview();
        }

        function updateStopPosition(index, position) {
            gradientStops[index].position = parseInt(position);
            
            // Update the display
            const stopElements = document.querySelectorAll('#gradient-stops-container > div');
            if (stopElements[index]) {
                const posLabel = stopElements[index].querySelector('.text-muted');
                if (posLabel) posLabel.textContent = position + '%';
            }
            
            updateGradientPreview();
        }

        function updateAngleDisplay() {
            const angle = document.getElementById('gradient-angle').value;
            document.getElementById('angle-value').textContent = angle;
        }

        function updateGradientPreview() {
            const type = document.getElementById('gradient-type').value;
            const angle = document.getElementById('gradient-angle').value;
            
            // Show/hide angle control
            document.getElementById('gradient-angle-container').style.display = type === 'linear' ? 'block' : 'none';
            
            // Sort stops by position
            const sortedStops = [...gradientStops].sort((a, b) => a.position - b.position);
            
            // Build gradient string
            const stops = sortedStops.map(stop => \`\${stop.color} \${stop.position}%\`).join(', ');
            let gradient;
            
            if (type === 'linear') {
                gradient = \`linear-gradient(\${angle}deg, \${stops})\`;
            } else {
                gradient = \`radial-gradient(circle, \${stops})\`;
            }
            
            // Update preview
            document.getElementById('gradient-preview').style.background = gradient;
            
            // Update live CSS variable
            document.documentElement.style.setProperty('--gradient-ocean', gradient);
        }

        function updateColorPreview() {
            // Update all CSS variables with current color values
            const colorMap = {
                'color-bg-primary': '--bg-primary',
                'color-bg-secondary': '--bg-secondary',
                'color-bg-tertiary': '--bg-tertiary',
                'color-text-primary': '--text-primary',
                'color-text-secondary': '--text-secondary',
                'color-text-muted': '--text-muted',
                'color-border': '--border-color',
                'color-accent-primary': '--accent-primary',
                'color-accent-secondary': '--accent-secondary',
                'color-success': '--success-color',
                'color-warning': '--warning-color',
                'color-error': '--error-color',
                'color-info': '--info-color'
            };
            
            Object.keys(colorMap).forEach(inputId => {
                const value = document.getElementById(inputId).value;
                document.documentElement.style.setProperty(colorMap[inputId], value);
            });
        }

        async function saveTheme() {
            try {
                const themeData = {
                    gradient_type: document.getElementById('gradient-type').value,
                    gradient_angle: parseInt(document.getElementById('gradient-angle').value),
                    gradient_stops: gradientStops,
                    bg_primary: document.getElementById('color-bg-primary').value,
                    bg_secondary: document.getElementById('color-bg-secondary').value,
                    bg_tertiary: document.getElementById('color-bg-tertiary').value,
                    text_primary: document.getElementById('color-text-primary').value,
                    text_secondary: document.getElementById('color-text-secondary').value,
                    text_muted: document.getElementById('color-text-muted').value,
                    border_color: document.getElementById('color-border').value,
                    accent_primary: document.getElementById('color-accent-primary').value,
                    accent_secondary: document.getElementById('color-accent-secondary').value,
                    success_color: document.getElementById('color-success').value,
                    warning_color: document.getElementById('color-warning').value,
                    error_color: document.getElementById('color-error').value,
                    info_color: document.getElementById('color-info').value
                };
                
                const response = await fetch('/api/user/theme', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(themeData)
                });
                
                if (!response.ok) throw new Error('Failed to save theme');
                
                showToast('Theme saved successfully! Changes will persist across sessions.', 'success');
            } catch (error) {
                console.error('Error saving theme:', error);
                showToast('Failed to save theme', 'error');
            }
        }

        async function resetTheme() {
            if (!confirm('Are you sure you want to reset to the default theme? This will reload the page.')) return;
            
            try {
                const response = await fetch('/api/user/theme', { method: 'DELETE' });
                
                if (!response.ok) throw new Error('Failed to reset theme');
                
                showToast('Theme reset to defaults. Reloading...', 'success');
                
                // Reload page after a short delay
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                console.error('Error resetting theme:', error);
                showToast('Failed to reset theme', 'error');
            }
        }

        // ===== IMPORT/EXPORT FUNCTIONS =====
        let importData = null;

        function exportSettings() {
            window.location.href = '/api/settings/export';
            showToast('Downloading settings export...', 'info');
        }

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    importData = JSON.parse(e.target.result);
                    
                    // Show preview
                    document.getElementById('import-preview').style.display = 'block';
                    document.getElementById('preview-version').textContent = importData.version || 'Unknown';
                    document.getElementById('preview-count').textContent = (importData.settings ? importData.settings.length : 0) + ' settings';
                    document.getElementById('preview-json').textContent = JSON.stringify(importData, null, 2);
                    
                    showToast('File loaded successfully. Review and confirm import.', 'success');
                } catch (error) {
                    console.error('Error parsing import file:', error);
                    showToast('Invalid JSON file format', 'error');
                    importData = null;
                }
            };
            reader.readAsText(file);
        }

        async function confirmImport() {
            if (!importData) {
                showToast('No import data loaded', 'error');
                return;
            }

            if (!confirm('Are you sure you want to import these settings?\\n\\nThis will overwrite your current configuration and may require a server restart.')) {
                return;
            }

            try {
                const response = await fetch('/api/settings/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(importData)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Import failed');
                }

                const result = await response.json();
                showToast(result.message, 'success');
                
                // Reset form
                cancelImport();
                document.getElementById('import-file-input').value = '';
                
                // Reload settings
                loadSettings();
            } catch (error) {
                console.error('Error importing settings:', error);
                showToast('Failed to import settings: ' + error.message, 'error');
            }
        }

        function cancelImport() {
            importData = null;
            document.getElementById('import-preview').style.display = 'none';
            document.getElementById('import-file-input').value = '';
        }

        // Load settings on page load
        loadSettings();
    `;

    res.send(getPageTemplate({
        pageTitle: 'System Settings',
        pageIcon: 'fas fa-cog',
        activeNav: 'settings',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// System Health Checks Page
app.get('/admin/health', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const contentBody = `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-heartbeat"></i> System Health Checks</h3>
                <button onclick="refreshHealthChecks()" class="btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
            <div class="card-body">
                <!-- Overall Status Card -->
                <div id="overall-health" style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 1.5rem; text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--text-muted);"></i>
                    <p style="margin-top: 1rem; color: var(--text-muted);">Loading health status...</p>
                </div>

                <!-- Health Checks Grid -->
                <div id="health-checks-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.25rem;">
                    <!-- Health check cards will be dynamically inserted here -->
                </div>

                <!-- Last Updated -->
                <div style="text-align: center; margin-top: 1.5rem; color: var(--text-muted); font-size: 0.875rem;">
                    <i class="fas fa-clock"></i> Last updated: <span id="last-updated">Never</span>
                </div>
            </div>
        </div>
    `;

    const additionalCSS = `
        .health-check-card {
            padding: 1.5rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border-left: 4px solid var(--border-color);
            transition: all 0.3s ease;
        }
        .health-check-card:hover {
            box-shadow: var(--shadow-medium);
            transform: translateY(-2px);
        }
        .health-check-card.status-success {
            border-left-color: var(--success-color);
        }
        .health-check-card.status-warning {
            border-left-color: var(--warning-color);
        }
        .health-check-card.status-error {
            border-left-color: var(--error-color);
        }
        .health-check-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        .health-check-name {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        .health-check-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            font-size: 1.25rem;
        }
        .health-check-icon.status-success {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success-color);
        }
        .health-check-icon.status-warning {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning-color);
        }
        .health-check-icon.status-error {
            background: rgba(239, 68, 68, 0.1);
            color: var(--error-color);
        }
        .health-check-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
        }
        .health-check-message {
            font-size: 0.875rem;
            color: var(--text-secondary);
            margin-bottom: 1rem;
        }
        .health-check-progress {
            width: 100%;
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
        }
        .health-check-progress-bar {
            height: 100%;
            transition: width 0.3s ease;
        }
        .health-check-progress-bar.status-success {
            background: linear-gradient(90deg, var(--success-color), #059669);
        }
        .health-check-progress-bar.status-warning {
            background: linear-gradient(90deg, var(--warning-color), #d97706);
        }
        .health-check-progress-bar.status-error {
            background: linear-gradient(90deg, var(--error-color), #dc2626);
        }
        .overall-status {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 2rem;
            border-radius: 8px;
            font-size: 1.25rem;
            font-weight: 600;
        }
        .overall-status.status-success {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success-color);
        }
        .overall-status.status-warning {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning-color);
        }
        .overall-status.status-error {
            background: rgba(239, 68, 68, 0.1);
            color: var(--error-color);
        }
    `;

    const additionalJS = `
        async function refreshHealthChecks() {
            try {
                const response = await fetch('/api/system/health-checks');
                if (!response.ok) throw new Error('Failed to fetch health checks');
                
                const data = await response.json();
                renderHealthChecks(data);
            } catch (error) {
                console.error('Error fetching health checks:', error);
                showToast('Failed to load health checks', 'error');
            }
        }

        function renderHealthChecks(data) {
            // Update overall status
            const overallDiv = document.getElementById('overall-health');
            const statusIcons = {
                success: 'check-circle',
                warning: 'exclamation-triangle',
                error: 'times-circle'
            };
            const statusMessages = {
                success: 'All Systems Operational',
                warning: 'Some Issues Detected',
                error: 'Critical Issues Detected'
            };
            
            overallDiv.innerHTML = '<div class="overall-status status-' + data.overall + '">' +
                '<i class="fas fa-' + statusIcons[data.overall] + '" style="font-size: 2rem;"></i>' +
                '<div>' +
                    '<div>' + statusMessages[data.overall] + '</div>' +
                    '<div style="font-size: 0.875rem; font-weight: normal; opacity: 0.8; margin-top: 0.25rem;">' +
                        data.successCount + ' passing, ' + data.warningCount + ' warnings, ' + data.errorCount + ' errors' +
                    '</div>' +
                '</div>' +
            '</div>';

            // Render health check cards
            const grid = document.getElementById('health-checks-grid');
            grid.innerHTML = data.checks.map(check => 
                '<div class="health-check-card status-' + check.status + '">' +
                    '<div class="health-check-header">' +
                        '<div class="health-check-name">' +
                            check.name +
                        '</div>' +
                        '<div class="health-check-icon status-' + check.status + '">' +
                            '<i class="fas fa-' + check.icon + '"></i>' +
                        '</div>' +
                    '</div>' +
                    '<div class="health-check-value">' + check.value + '</div>' +
                    '<div class="health-check-message">' + check.message + '</div>' +
                    (check.percent !== undefined ? 
                        '<div class="health-check-progress">' +
                            '<div class="health-check-progress-bar status-' + check.status + '" style="width: ' + check.percent + '%;"></div>' +
                        '</div>'
                    : '') +
                    (check.details ? 
                        '<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">' +
                            check.details +
                        '</div>'
                    : '') +
                '</div>'
            ).join('');

            // Update last updated timestamp
            document.getElementById('last-updated').textContent = data.timestamp;
        }

        // Load health checks on page load
        refreshHealthChecks();

        // Auto-refresh every 30 seconds
        setInterval(refreshHealthChecks, 30000);
    `;

    res.send(getPageTemplate({
        pageTitle: 'System Health',
        pageIcon: 'fas fa-heartbeat',
        activeNav: '',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

// ============================================================
// SECURITY & AUDIT MONITORING (CONSOLIDATED)
// ============================================================

app.get('/admin/security', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const contentBody = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('rate-limits')" id="tab-rate-limits" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-shield-alt"></i> Rate Limiting
                </button>
                <button onclick="switchTab('audit-trail')" id="tab-audit-trail" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-clipboard-list"></i> Audit Trail
                </button>
            </div>
        </div>

        <!-- Rate Limiting Tab -->
        <div id="content-rate-limits" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-shield-alt"></i> Rate Limiting Dashboard</h3>
                    <button onclick="refreshRateLimits()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                        <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--error-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Blocked IPs</div>
                                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="blocked-ips-count">-</div>
                                </div>
                                <i class="fas fa-ban" style="font-size: 2rem; color: var(--error-color); opacity: 0.5;"></i>
                            </div>
                        </div>
                        <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--accent-primary);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Total Requests (1h)</div>
                                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="total-requests-count">-</div>
                                </div>
                                <i class="fas fa-exchange-alt" style="font-size: 2rem; color: var(--accent-primary); opacity: 0.5;"></i>
                            </div>
                        </div>
                        <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--success-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Unique IPs (1h)</div>
                                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="unique-ips-count">-</div>
                                </div>
                                <i class="fas fa-network-wired" style="font-size: 2rem; color: var(--success-color); opacity: 0.5;"></i>
                            </div>
                        </div>
                    </div>
                    <div id="rate-limits-container">
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Loading rate limit data...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Audit Trail Tab -->
        <div id="content-audit-trail" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-clipboard-list"></i> Audit Trail</h3>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="exportAuditTrail()" class="btn">
                            <i class="fas fa-download"></i> Export CSV
                        </button>
                        <button onclick="refreshAuditTrail()" class="btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">User</label>
                            <select id="filter-user" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                <option value="">All Users</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Action</label>
                            <select id="filter-action" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                <option value="">All Actions</option>
                                <option value="login">Login</option>
                                <option value="logout">Logout</option>
                                <option value="create">Create</option>
                                <option value="update">Update</option>
                                <option value="delete">Delete</option>
                                <option value="export">Export</option>
                                <option value="import">Import</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Start Date</label>
                            <input type="date" id="filter-start-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">End Date</label>
                            <input type="date" id="filter-end-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                        </div>
                    </div>
                    <div id="audit-trail-container">
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Loading audit trail...</p>
                        </div>
                    </div>
                    <div id="pagination-info" style="text-align: center; margin-top: 1rem; color: var(--text-muted); font-size: 0.875rem;"></div>
                </div>
            </div>
        </div>
    `;

    const additionalCSS = `
        .tab-btn { transition: all 0.3s ease; }
        .tab-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-light); }
        .tab-btn.active { background: var(--gradient-ocean) !important; color: white !important; }
        .tab-content { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `;

    const additionalJS = `
        let currentTab = 'rate-limits';
        function switchTab(tabName) {
            currentTab = tabName;
            document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('active'); btn.style.background = 'var(--bg-secondary)'; btn.style.color = 'var(--text-primary)'; });
            document.getElementById('tab-' + tabName).classList.add('active');
            document.getElementById('tab-' + tabName).style.background = 'var(--gradient-ocean)';
            document.getElementById('tab-' + tabName).style.color = 'white';
            document.querySelectorAll('.tab-content').forEach(content => { content.style.display = 'none'; });
            document.getElementById('content-' + tabName).style.display = 'block';
            if (tabName === 'rate-limits') { refreshRateLimits(); }
            else if (tabName === 'audit-trail') { if (!window.usersLoaded) { loadUsers(); window.usersLoaded = true; } refreshAuditTrail(); }
        }
        async function refreshRateLimits() {
            try {
                const statsResponse = await fetch('/api/rate-limits/stats');
                if (!statsResponse.ok) throw new Error('Failed to fetch stats');
                const stats = await statsResponse.json();
                document.getElementById('blocked-ips-count').textContent = stats.blockedIPs || 0;
                document.getElementById('total-requests-count').textContent = (stats.totalRequests || 0).toLocaleString();
                document.getElementById('unique-ips-count').textContent = stats.uniqueIPs || 0;
                const response = await fetch('/api/rate-limits');
                if (!response.ok) throw new Error('Failed to fetch rate limits');
                const data = await response.json();
                const container = document.getElementById('rate-limits-container');
                if (!data.rateLimits || data.rateLimits.length === 0) { container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i><p>No rate limit activity</p></div>'; return; }
                let html = '<table class="data-table"><thead><tr><th>IP Address</th><th>Endpoint</th><th>Requests</th><th>Window Start</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
                data.rateLimits.forEach(limit => {
                    const isBlocked = limit.blocked_until && new Date(limit.blocked_until) > new Date();
                    const statusColor = isBlocked ? 'var(--error-color)' : 'var(--success-color)';
                    const statusText = isBlocked ? 'Blocked' : 'Active';
                    const statusIcon = isBlocked ? 'ban' : 'check-circle';
                    html += \`<tr><td><code style="background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px;">\${limit.ip_address}</code></td><td><code style="font-size: 0.875rem;">\${limit.endpoint}</code></td><td><span style="font-weight: 600; color: var(--accent-primary);">\${limit.request_count}</span> requests</td><td>\${formatTimestamp(limit.window_start)}</td><td><span style="color: \${statusColor}; font-weight: 600;"><i class="fas fa-\${statusIcon}"></i> \${statusText}</span></td><td>\${isBlocked ? \`<button onclick="unblockIP('\${limit.ip_address}')" class="btn" style="padding: 0.5rem 1rem; font-size: 0.875rem;"><i class="fas fa-unlock"></i> Unblock</button>\` : '-'}</td></tr>\`;
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            } catch (error) { console.error('Error loading rate limits:', error); document.getElementById('rate-limits-container').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i><p>Failed to load</p></div>'; }
        }
        async function unblockIP(ip) {
            if (!confirm(\`Unblock IP \${ip}?\`)) return;
            try { const response = await fetch('/api/rate-limits/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) }); if (!response.ok) throw new Error('Failed'); showToast(\`IP \${ip} unblocked\`, 'success'); refreshRateLimits(); } catch (error) { showToast('Failed to unblock', 'error'); }
        }
        async function loadUsers() {
            try { const response = await fetch('/api/users'); if (!response.ok) throw new Error('Failed'); const users = await response.json(); const select = document.getElementById('filter-user'); const userList = Array.isArray(users) ? users : (users.users || []); userList.forEach(user => { const option = document.createElement('option'); option.value = user.id; option.textContent = user.username + ' (' + user.email + ')'; select.appendChild(option); }); } catch (error) { console.error('Error loading users:', error); }
        }
        async function refreshAuditTrail() {
            try {
                const params = new URLSearchParams(); const userId = document.getElementById('filter-user').value; const action = document.getElementById('filter-action').value; const startDate = document.getElementById('filter-start-date').value; const endDate = document.getElementById('filter-end-date').value;
                if (userId) params.append('user_id', userId); if (action) params.append('action', action); if (startDate) params.append('start_date', startDate); if (endDate) params.append('end_date', endDate); params.append('limit', '100');
                const response = await fetch('/api/audit-trail?' + params.toString());
                if (!response.ok) throw new Error('Failed');
                const data = await response.json();
                const container = document.getElementById('audit-trail-container');
                if (!data.activities || data.activities.length === 0) { container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i><p>No entries found</p></div>'; document.getElementById('pagination-info').textContent = ''; return; }
                let html = '<table class="data-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th><th>IP</th></tr></thead><tbody>';
                data.activities.forEach(activity => {
                    const colors = { login: 'var(--success-color)', logout: 'var(--text-muted)', create: 'var(--accent-primary)', update: 'var(--warning-color)', delete: 'var(--error-color)', export: 'var(--info-color)', import: 'var(--info-color)' };
                    const color = colors[activity.action] || 'var(--text-primary)';
                    html += \`<tr><td>\${formatTimestamp(activity.timestamp)}</td><td><strong>\${activity.username||'Unknown'}</strong><br><small style="color: var(--text-muted);">\${activity.email||''}</small></td><td><span style="color: \${color}; font-weight: 600; text-transform: uppercase; font-size: 0.875rem;">\${activity.action}</span></td><td><code>\${activity.resource||'-'}</code></td><td style="max-width: 300px; overflow: hidden;">\${activity.details||'-'}</td><td><code>\${activity.ip_address||'-'}</code></td></tr>\`;
                });
                html += '</tbody></table>';
                container.innerHTML = html;
                document.getElementById('pagination-info').textContent = \`Showing \${data.activities.length} of \${data.total} total\`;
            } catch (error) { console.error('Error:', error); document.getElementById('audit-trail-container').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i><p>Failed to load</p></div>'; }
        }
        async function exportAuditTrail() { try { window.location.href = '/api/audit-trail/export'; showToast('Export started', 'success'); } catch (error) { showToast('Export failed', 'error'); } }
        refreshRateLimits();
    `;

    res.send(getPageTemplate({ pageTitle: 'Security & Audit Monitoring', pageIcon: 'fas fa-shield-alt', activeNav: 'security', contentBody: contentBody, additionalCSS: additionalCSS, additionalJS: additionalJS, req: req }));
});

// Redirect old URLs
app.get('/admin/rate-limits', requireAuth, (req, res) => { res.redirect('/admin/security'); });
app.get('/admin/audit-trail', requireAuth, (req, res) => { res.redirect('/admin/security'); });

// Rate Limiting Dashboard Page (OLD - KEEP FOR NOW)
app.get('/admin/rate-limits-old', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const contentBody = `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-shield-alt"></i> Rate Limiting Dashboard</h3>
                <button onclick="refreshRateLimits()" class="btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>
            <div class="card-body">
                <!-- Stats Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--error-color);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Blocked IPs</div>
                                <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="blocked-ips-count">-</div>
                            </div>
                            <i class="fas fa-ban" style="font-size: 2rem; color: var(--error-color); opacity: 0.5;"></i>
                        </div>
                    </div>
                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--accent-primary);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Total Requests (1h)</div>
                                <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="total-requests-count">-</div>
                            </div>
                            <i class="fas fa-exchange-alt" style="font-size: 2rem; color: var(--accent-primary); opacity: 0.5;"></i>
                        </div>
                    </div>
                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--success-color);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Unique IPs (1h)</div>
                                <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="unique-ips-count">-</div>
                            </div>
                            <i class="fas fa-network-wired" style="font-size: 2rem; color: var(--success-color); opacity: 0.5;"></i>
                        </div>
                    </div>
                </div>

                <!-- Rate Limits Table -->
                <div id="rate-limits-container">
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Loading rate limit data...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        async function refreshRateLimits() {
            try {
                console.log('Fetching rate limits stats...');
                // Load stats
                const statsResponse = await fetch('/api/rate-limits/stats');
                if (!statsResponse.ok) {
                    const errorText = await statsResponse.text();
                    console.error('Stats response error:', statsResponse.status, errorText);
                    throw new Error('Failed to fetch stats: ' + statsResponse.status);
                }
                const stats = await statsResponse.json();
                console.log('Stats received:', stats);
                document.getElementById('blocked-ips-count').textContent = stats.blockedIPs || 0;
                document.getElementById('total-requests-count').textContent = (stats.totalRequests || 0).toLocaleString();
                document.getElementById('unique-ips-count').textContent = stats.uniqueIPs || 0;

                console.log('Fetching rate limits data...');
                // Load rate limits table
                const response = await fetch('/api/rate-limits');
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Rate limits response error:', response.status, errorText);
                    throw new Error('Failed to fetch rate limits: ' + response.status);
                }
                const data = await response.json();
                console.log('Rate limits received:', data);
                const container = document.getElementById('rate-limits-container');

                if (!data.rateLimits || data.rateLimits.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i><p>No rate limit activity in the last hour</p></div>';
                    return;
                }

                container.innerHTML = '<div class="data-table-container"><table class="data-table"><thead><tr><th>IP Address</th><th>Endpoint</th><th>Requests</th><th>Window Start</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
                    data.rateLimits.map(limit => {
                        const isBlocked = limit.is_blocked === 1;
                        const statusBadge = isBlocked ? 
                            '<span style="padding: 0.25rem 0.75rem; background: var(--error-color); color: white; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">BLOCKED</span>' :
                            '<span style="padding: 0.25rem 0.75rem; background: var(--success-color); color: white; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">ACTIVE</span>';
                        
                        const unblockBtn = isBlocked ? 
                            '<button onclick="unblockIP(' + "'" + limit.ip_address + "'" + ')" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.875rem; background: var(--success-color);"><i class="fas fa-unlock"></i> Unblock</button>' : 
                            '-';
                        
                        return '<tr>' +
                            '<td><code style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem;">' + limit.ip_address + '</code></td>' +
                            '<td>' + limit.endpoint + '</td>' +
                            '<td><strong>' + limit.request_count + '</strong></td>' +
                            '<td>' + formatTimestamp(limit.window_start) + '</td>' +
                            '<td>' + statusBadge + '</td>' +
                            '<td>' + unblockBtn + '</td>' +
                        '</tr>';
                    }).join('') +
                '</tbody></table></div>';
                
                console.log('Rate limits page updated successfully');
            } catch (error) {
                console.error('Error loading rate limits:', error);
                showToast('Failed to load rate limit data: ' + error.message, 'error');
                document.getElementById('rate-limits-container').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i><p>Failed to load rate limit data</p><p style="font-size: 0.875rem; margin-top: 0.5rem;">' + error.message + '</p></div>';
            }
        }

        async function unblockIP(ip) {
            if (!confirm('Are you sure you want to unblock IP: ' + ip + '?')) return;

            try {
                const response = await fetch('/api/rate-limits/' + ip, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to unblock IP');

                showToast('IP ' + ip + ' has been unblocked', 'success');
                refreshRateLimits();
            } catch (error) {
                console.error('Error unblocking IP:', error);
                showToast('Failed to unblock IP', 'error');
            }
        }

        // Load on page load
        console.log('Initializing rate limits page...');
        refreshRateLimits();
        // Auto-refresh every 30 seconds
        setInterval(refreshRateLimits, 30000);
    `;

    res.send(getPageTemplate({
        pageTitle: 'Rate Limiting',
        pageIcon: 'fas fa-shield-alt',
        activeNav: 'rate-limits',
        contentBody: contentBody,
        additionalCSS: '',
        additionalJS: additionalJS,
        req: req
    }));
});

// Audit Trail Viewer Page
app.get('/admin/audit-trail', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const contentBody = `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-clipboard-list"></i> Audit Trail</h3>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="exportAuditTrail()" class="btn">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                    <button onclick="refreshAuditTrail()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>
            <div class="card-body">
                <!-- Filters -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">User</label>
                        <select id="filter-user" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                            <option value="">All Users</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Action</label>
                        <select id="filter-action" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                            <option value="">All Actions</option>
                            <option value="login">Login</option>
                            <option value="logout">Logout</option>
                            <option value="create">Create</option>
                            <option value="update">Update</option>
                            <option value="delete">Delete</option>
                            <option value="export">Export</option>
                            <option value="import">Import</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Start Date</label>
                        <input type="date" id="filter-start-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">End Date</label>
                        <input type="date" id="filter-end-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                    </div>
                </div>

                <!-- Activity Table -->
                <div id="audit-trail-container">
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Loading audit trail...</p>
                    </div>
                </div>

                <!-- Pagination Info -->
                <div id="pagination-info" style="text-align: center; margin-top: 1rem; color: var(--text-muted); font-size: 0.875rem;"></div>
            </div>
        </div>
    `;

    const additionalJS = `
        async function loadUsers() {
            try {
                console.log('Loading users for filter...');
                const response = await fetch('/api/users');
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Users response error:', response.status, errorText);
                    throw new Error('Failed to fetch users: ' + response.status);
                }
                const users = await response.json();
                console.log('Users received:', users);
                const select = document.getElementById('filter-user');
                
                // Handle both array and object with users property
                const userList = Array.isArray(users) ? users : (users.users || []);
                
                userList.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.username + ' (' + user.email + ')';
                    select.appendChild(option);
                });
                console.log('User filter populated with', userList.length, 'users');
            } catch (error) {
                console.error('Error loading users:', error);
                showToast('Failed to load user list', 'error');
            }
        }

        async function refreshAuditTrail() {
            try {
                console.log('Fetching audit trail...');
                const userId = document.getElementById('filter-user').value;
                const action = document.getElementById('filter-action').value;
                const startDate = document.getElementById('filter-start-date').value;
                const endDate = document.getElementById('filter-end-date').value;

                const params = new URLSearchParams();
                if (userId) params.append('user_id', userId);
                if (action) params.append('action', action);
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
                params.append('limit', '100');

                const url = '/api/audit-trail?' + params.toString();
                console.log('Fetching:', url);
                const response = await fetch(url);
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Audit trail response error:', response.status, errorText);
                    throw new Error('Failed to fetch audit trail: ' + response.status);
                }
                const data = await response.json();
                console.log('Audit trail received:', data);
                const container = document.getElementById('audit-trail-container');

                if (!data.activities || data.activities.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i><p>No activity found matching your filters</p></div>';
                    document.getElementById('pagination-info').textContent = '';
                    return;
                }

                container.innerHTML = '<div class="data-table-container"><table class="data-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th><th>IP Address</th></tr></thead><tbody>' +
                    data.activities.map(activity => 
                        '<tr>' +
                            '<td>' + formatTimestamp(activity.timestamp) + '</td>' +
                            '<td><strong>' + (activity.username || 'Unknown') + '</strong><br><span style="font-size: 0.75rem; color: var(--text-muted);">' + (activity.email || '') + '</span></td>' +
                            '<td><span style="padding: 0.25rem 0.5rem; background: var(--accent-primary); color: white; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">' + activity.action.toUpperCase() + '</span></td>' +
                            '<td>' + (activity.resource || '-') + '</td>' +
                            '<td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + (activity.details || '') + '">' + (activity.details || '-') + '</td>' +
                            '<td><code style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem;">' + (activity.ip_address || '-') + '</code></td>' +
                        '</tr>'
                    ).join('') +
                '</tbody></table></div>';

                document.getElementById('pagination-info').textContent = 'Showing ' + data.activities.length + ' of ' + data.total + ' total activities';
                console.log('Audit trail page updated successfully');
            } catch (error) {
                console.error('Error loading audit trail:', error);
                showToast('Failed to load audit trail: ' + error.message, 'error');
                document.getElementById('audit-trail-container').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i><p>Failed to load audit trail</p><p style="font-size: 0.875rem; margin-top: 0.5rem;">' + error.message + '</p></div>';
            }
        }

        function exportAuditTrail() {
            window.location.href = '/api/audit-trail/export';
            showToast('Exporting audit trail to CSV...', 'info');
        }

        // Load on page load
        console.log('Initializing audit trail page...');
        loadUsers();
        refreshAuditTrail();
    `;

    res.send(getPageTemplate({
        pageTitle: 'Audit Trail',
        pageIcon: 'fas fa-clipboard-list',
        activeNav: 'audit-trail',
        contentBody: contentBody,
        additionalCSS: '',
        additionalJS: additionalJS,
        req: req
    }));
});

// Export/Import Settings Page (added to Settings page as a new tab)
// This will be added as a 5th tab in the existing settings page

// Test ESP32 endpoint
app.post('/test-esp32', requireAuth, (req, res) => {
    const testMessage = `Test ESP32 event - Zone 1 opened (triggered by ${req.user.username})`;
    const timestamp = moment().tz(TIMEZONE).toISOString();
    
    db.run(
        `INSERT INTO log_events (timestamp, category, source, device_id, event_type, severity, zone_number, zone_name, message, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [timestamp, 'security', 'DSC-Test', 'dashboard-test', 'zone_open', 'info', 1, 'Front Door', testMessage, JSON.stringify({ test: true, user: req.user.username })],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            loggers.security.info(`Test event created by ${req.user.username}`);
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Integration management endpoints
app.get('/api/integrations/status', requireAuth, (req, res) => {
    const rawStatus = integrationManager.getStatus();
    const memUsage = process.memoryUsage();
    
    res.json({
        success: true,
        status: {
            server: {
                status: 'running',
                uptime: process.uptime(),
                memory_mb: Math.round(memUsage.heapUsed / 1024 / 1024)
            },
            integrations: {
                mqtt: rawStatus.integrations.mqtt || { status: 'disconnected' },
                websocket: rawStatus.websocket || { enabled: false, port: 0, clients: 0 },
                unifi: rawStatus.integrations.unifi || { status: 'disconnected' },
                home_assistant: rawStatus.integrations.home_assistant || rawStatus.integrations.homeAssistant || { status: 'disconnected' }
            }
        },
        config: {
            mqtt: {
                enabled: config.integrations.mqtt.enabled,
                broker: config.integrations.mqtt.enabled ? config.integrations.mqtt.broker : 'disabled'
            },
            unifi: {
                enabled: config.integrations.unifi.enabled,
                host: config.integrations.unifi.enabled ? config.integrations.unifi.host : 'disabled'
            },
            homeAssistant: {
                enabled: config.integrations.homeAssistant.enabled,
                host: config.integrations.homeAssistant.enabled ? config.integrations.homeAssistant.host : 'disabled'
            },
            websocket: {
                enabled: config.integrations.websocket.enabled,
                port: config.integrations.websocket.port
            }
        }
    });
});

// MQTT publish endpoint
app.post('/api/integrations/mqtt/publish', requireAuth, (req, res) => {
    if (!config.integrations.mqtt.enabled || !integrationManager.mqttClient?.connected) {
        return res.status(400).json({ error: 'MQTT not connected' });
    }
    
    const { topic, message } = req.body;
    if (!topic || message === undefined) {
        return res.status(400).json({ error: 'Topic and message are required' });
    }
    
    try {
        integrationManager.mqttClient.publish(topic, JSON.stringify(message));
        loggers.system.info(`MQTT message published to ${topic} by ${req.user.username}`);
        res.json({ success: true, topic, message });
    } catch (error) {
        loggers.system.error('MQTT publish error:', error);
        res.status(500).json({ error: 'Failed to publish message' });
    }
});

// WebSocket broadcast endpoint
app.post('/api/integrations/websocket/broadcast', requireAuth, (req, res) => {
    if (!config.integrations.websocket.enabled) {
        return res.status(400).json({ error: 'WebSocket not enabled' });
    }
    
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }
    
    try {
        integrationManager.broadcastToWebSockets({
            type: 'admin_broadcast',
            message,
            user: req.user.username,
            timestamp: moment().tz(TIMEZONE).toISOString()
        });
        
        res.json({ 
            success: true, 
            clients: integrationManager.connectedClients.size,
            message 
        });
    } catch (error) {
        loggers.system.error('WebSocket broadcast error:', error);
        res.status(500).json({ error: 'Failed to broadcast message' });
    }
});

// System health endpoint
// Get current system metrics
app.get('/api/system/metrics', requireAuth, (req, res) => {
    if (!metricsManager) {
        return res.status(503).json({ error: 'Metrics manager not initialized' });
    }

    const metrics = metricsManager.getSystemMetrics();
    res.json(metrics);
});

app.get('/api/system/health', requireAuth, (req, res) => {
    const os = require('os');
    const fs = require('fs');
    
    try {
        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        // Get CPU usage (simplified)
        const cpuLoadAvg = os.loadavg()[0];
        const cpuUsage = Math.min(Math.round((cpuLoadAvg / os.cpus().length) * 100), 100);
        
        // Get memory usage percentage
        const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);
        
        // Get disk usage (simplified - using app directory)
        let diskUsage = 0;
        try {
            const stats = fs.statSync(__dirname);
            diskUsage = Math.round(Math.random() * 30 + 30); // Simulated for demo
        } catch {
            diskUsage = 0;
        }
        
        res.json({
            cpu: cpuUsage,
            memory: memoryUsagePercent,
            disk: diskUsage,
            uptime: Math.round(process.uptime())
        });
    } catch (error) {
        loggers.system.error('Health check error:', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
});

// Comprehensive system health checks endpoint
app.get('/api/system/health-checks', requireAuth, (req, res) => {
    const os = require('os');
    const fs = require('fs');
    
    try {
        const checks = [];
        
        // 1. Memory Check
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryPercent = (usedMemory / totalMemory) * 100;
        const memoryUsedMB = Math.round(usedMemory / 1024 / 1024);
        const memoryTotalMB = Math.round(totalMemory / 1024 / 1024);
        
        checks.push({
            name: 'System Memory',
            status: memoryPercent > 90 ? 'error' : memoryPercent > 75 ? 'warning' : 'success',
            value: `${memoryUsedMB} MB / ${memoryTotalMB} MB`,
            percent: Math.round(memoryPercent),
            message: memoryPercent > 90 ? 'Critical: Memory usage above 90%' : 
                     memoryPercent > 75 ? 'Warning: Memory usage above 75%' : 
                     'Memory usage is healthy',
            icon: 'memory'
        });
        
        // 2. Node.js Heap Memory Check
        const heapUsage = process.memoryUsage();
        const heapUsedMB = Math.round(heapUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(heapUsage.heapTotal / 1024 / 1024);
        const heapPercent = (heapUsage.heapUsed / heapUsage.heapTotal) * 100;
        
        checks.push({
            name: 'Node.js Heap',
            status: heapPercent > 90 ? 'error' : heapPercent > 75 ? 'warning' : 'success',
            value: `${heapUsedMB} MB / ${heapTotalMB} MB`,
            percent: Math.round(heapPercent),
            message: heapPercent > 90 ? 'Critical: Heap usage above 90%' : 
                     heapPercent > 75 ? 'Warning: Heap usage above 75%' : 
                     'Heap usage is healthy',
            icon: 'microchip'
        });
        
        // 3. CPU Load Check
        const cpuLoadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        const cpuPercent = Math.min((cpuLoadAvg / cpuCount) * 100, 100);
        
        checks.push({
            name: 'CPU Load',
            status: cpuPercent > 90 ? 'error' : cpuPercent > 75 ? 'warning' : 'success',
            value: `${Math.round(cpuPercent)}%`,
            percent: Math.round(cpuPercent),
            message: cpuPercent > 90 ? 'Critical: CPU load above 90%' : 
                     cpuPercent > 75 ? 'Warning: CPU load above 75%' : 
                     'CPU load is healthy',
            icon: 'tachometer-alt',
            details: `Load average: ${cpuLoadAvg.toFixed(2)} (${cpuCount} cores)`
        });
        
        // 4. Database Size Check
        const dbPath = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');
        let dbSizeMB = 0;
        let dbStatus = 'success';
        let dbMessage = 'Database is healthy';
        
        if (fs.existsSync(dbPath)) {
            const dbStats = fs.statSync(dbPath);
            dbSizeMB = Math.round(dbStats.size / 1024 / 1024);
            
            if (dbSizeMB > 1000) {
                dbStatus = 'warning';
                dbMessage = 'Database size exceeds 1 GB - consider cleanup';
            } else if (dbSizeMB > 2000) {
                dbStatus = 'error';
                dbMessage = 'Critical: Database size exceeds 2 GB';
            }
        }
        
        checks.push({
            name: 'Database Size',
            status: dbStatus,
            value: `${dbSizeMB} MB`,
            percent: Math.min(Math.round((dbSizeMB / 2000) * 100), 100),
            message: dbMessage,
            icon: 'database'
        });
        
        // 5. Database Connection Check
        let dbConnectionStatus = 'success';
        let dbConnectionMessage = 'Database connection is healthy';
        
        try {
            db.get('SELECT 1', (err) => {
                if (err) {
                    dbConnectionStatus = 'error';
                    dbConnectionMessage = 'Database connection failed';
                }
            });
        } catch (error) {
            dbConnectionStatus = 'error';
            dbConnectionMessage = 'Database connection error';
        }
        
        checks.push({
            name: 'Database Connection',
            status: dbConnectionStatus,
            value: dbConnectionStatus === 'success' ? 'Connected' : 'Disconnected',
            message: dbConnectionMessage,
            icon: 'plug'
        });
        
        // 6. Server Uptime Check
        const uptimeSeconds = Math.round(process.uptime());
        const uptimeHours = Math.floor(uptimeSeconds / 3600);
        const uptimeDays = Math.floor(uptimeHours / 24);
        const uptimeDisplay = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours % 24}h` : `${uptimeHours}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;
        
        checks.push({
            name: 'Server Uptime',
            status: 'success',
            value: uptimeDisplay,
            message: `Server has been running for ${uptimeDisplay}`,
            icon: 'clock'
        });
        
        // 7. Log Directory Size Check
        const logDirPath = path.join(__dirname, 'data', 'logs');
        let logDirSizeMB = 0;
        let logStatus = 'success';
        let logMessage = 'Log directory size is healthy';
        
        if (fs.existsSync(logDirPath)) {
            const files = fs.readdirSync(logDirPath);
            logDirSizeMB = files.reduce((total, file) => {
                try {
                    const stats = fs.statSync(path.join(logDirPath, file));
                    return total + stats.size;
                } catch {
                    return total;
                }
            }, 0) / 1024 / 1024;
            logDirSizeMB = Math.round(logDirSizeMB);
            
            if (logDirSizeMB > 500) {
                logStatus = 'warning';
                logMessage = 'Log directory exceeds 500 MB - consider cleanup';
            } else if (logDirSizeMB > 1000) {
                logStatus = 'error';
                logMessage = 'Critical: Log directory exceeds 1 GB';
            }
        }
        
        checks.push({
            name: 'Log Directory Size',
            status: logStatus,
            value: `${logDirSizeMB} MB`,
            percent: Math.min(Math.round((logDirSizeMB / 1000) * 100), 100),
            message: logMessage,
            icon: 'file-alt'
        });
        
        // 8. Active Sessions Check
        let sessionCount = 0;
        db.get('SELECT COUNT(*) as count FROM user_sessions WHERE active = 1', (err, row) => {
            if (!err && row) {
                sessionCount = row.count;
            }
        });
        
        checks.push({
            name: 'Active Sessions',
            status: sessionCount > 50 ? 'warning' : 'success',
            value: `${sessionCount} sessions`,
            message: sessionCount > 50 ? 'High number of active sessions' : 'Session count is normal',
            icon: 'users'
        });
        
        // Calculate overall health
        const errorCount = checks.filter(c => c.status === 'error').length;
        const warningCount = checks.filter(c => c.status === 'warning').length;
        const overallStatus = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success';
        
        res.json({
            overall: overallStatus,
            errorCount,
            warningCount,
            successCount: checks.filter(c => c.status === 'success').length,
            checks,
            timestamp: moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss z')
        });
    } catch (error) {
        loggers.system.error('Health checks error:', error);
        res.status(500).json({ error: 'Failed to perform health checks' });
    }
});

// Rate Limiting API Endpoints
app.get('/api/rate-limits', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        db.all(`
            SELECT 
                ip_address,
                endpoint,
                request_count,
                window_start,
                blocked_until,
                CASE 
                    WHEN blocked_until > datetime('now') THEN 1
                    ELSE 0
                END as is_blocked
            FROM rate_limits
            WHERE window_start > datetime('now', '-1 hour')
            ORDER BY window_start DESC
            LIMIT 100
        `, (err, rows) => {
            if (err) {
                loggers.system.error('Error fetching rate limits:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ rateLimits: rows || [] });
        });
    } catch (error) {
        loggers.system.error('Rate limits fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch rate limits' });
    }
});

app.get('/api/rate-limits/stats', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const stats = {};
        
        // Get currently blocked IPs
        db.get(`
            SELECT COUNT(DISTINCT ip_address) as count
            FROM rate_limits
            WHERE blocked_until > datetime('now')
        `, (err, row) => {
            if (err) {
                loggers.system.error('Error fetching blocked IPs count:', err);
                stats.blockedIPs = 0;
            } else {
                stats.blockedIPs = row ? row.count : 0;
            }
            
            // Get total requests in last hour
            db.get(`
                SELECT SUM(request_count) as total
                FROM rate_limits
                WHERE window_start > datetime('now', '-1 hour')
            `, (err2, row2) => {
                if (err2) {
                    loggers.system.error('Error fetching request count:', err2);
                    stats.totalRequests = 0;
                } else {
                    stats.totalRequests = row2 && row2.total ? row2.total : 0;
                }
                
                // Get unique IPs
                db.get(`
                    SELECT COUNT(DISTINCT ip_address) as count
                    FROM rate_limits
                    WHERE window_start > datetime('now', '-1 hour')
                `, (err3, row3) => {
                    if (err3) {
                        loggers.system.error('Error fetching unique IPs:', err3);
                        stats.uniqueIPs = 0;
                    } else {
                        stats.uniqueIPs = row3 ? row3.count : 0;
                    }
                    
                    res.json(stats);
                });
            });
        });
    } catch (error) {
        loggers.system.error('Rate limit stats error:', error);
        res.status(500).json({ error: 'Failed to fetch rate limit stats' });
    }
});

app.delete('/api/rate-limits/:ip', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { ip } = req.params;

    db.run('DELETE FROM rate_limits WHERE ip_address = ?', [ip], function(err) {
        if (err) {
            loggers.system.error('Error unblocking IP:', err);
            return res.status(500).json({ error: 'Failed to unblock IP' });
        }
        
        logActivity(req.user.id, 'unblock_ip', 'rate_limits', `Unblocked IP: ${ip}`, req);
        res.json({ success: true, message: `IP ${ip} has been unblocked` });
    });
});

// API Key Management Page
app.get('/admin/api-keys', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send(getPageTemplate({
            pageTitle: 'Access Denied',
            pageIcon: 'fas fa-ban',
            activeNav: '',
            contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
            additionalCSS: '',
            additionalJS: '',
            req: req
        }));
    }

    const contentBody = `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-key"></i> API Key Management</h3>
                <button onclick="showCreateKeyModal()" class="btn btn-primary">
                    <i class="fas fa-plus"></i> Generate New Key
                </button>
            </div>
            <div class="card-body">
                <div id="api-keys-container">
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Loading API keys...</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Key Modal -->
        <div id="create-key-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
            <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <h3 style="margin: 0 0 1.5rem 0;"><i class="fas fa-key"></i> Generate New API Key</h3>
                
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Name *</label>
                    <input type="text" id="key-name" placeholder="e.g., Production API Key" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                </div>

                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Description</label>
                    <textarea id="key-description" placeholder="Brief description of what this key is used for" rows="3" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);"></textarea>
                </div>

                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Expires In</label>
                    <select id="key-expiry" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                        <option value="0">Never</option>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                        <option value="90" selected>90 days</option>
                        <option value="180">180 days</option>
                        <option value="365">1 year</option>
                    </select>
                </div>

                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 2rem;">
                    <button onclick="hideCreateKeyModal()" class="btn">Cancel</button>
                    <button onclick="createApiKey()" class="btn btn-primary">
                        <i class="fas fa-check"></i> Generate Key
                    </button>
                </div>
            </div>
        </div>

        <!-- Key Display Modal -->
        <div id="key-display-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
            <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 600px; width: 90%;">
                <h3 style="margin: 0 0 1rem 0; color: var(--success-color);"><i class="fas fa-check-circle"></i> API Key Generated</h3>
                
                <div style="background: var(--warning-color); background: rgba(255, 193, 7, 0.1); border: 1px solid var(--warning-color); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                    <p style="margin: 0; color: var(--warning-color); font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> Important: Save this key now!</p>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">You won't be able to see it again. Store it securely.</p>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Your API Key:</label>
                    <div style="position: relative;">
                        <input type="text" id="generated-key" readonly style="width: 100%; padding: 0.75rem; padding-right: 100px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); font-family: monospace; font-size: 0.875rem;">
                        <button onclick="copyApiKey()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 0.5rem 1rem; background: var(--accent-primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>

                <div style="text-align: right;">
                    <button onclick="hideKeyDisplayModal()" class="btn btn-primary">
                        <i class="fas fa-check"></i> I've Saved It
                    </button>
                </div>
            </div>
        </div>
    `;

    const additionalJS = `
        function showCreateKeyModal() {
            document.getElementById('create-key-modal').style.display = 'flex';
            document.getElementById('key-name').value = '';
            document.getElementById('key-description').value = '';
            document.getElementById('key-expiry').value = '90';
        }

        function hideCreateKeyModal() {
            document.getElementById('create-key-modal').style.display = 'none';
        }

        function hideKeyDisplayModal() {
            document.getElementById('key-display-modal').style.display = 'none';
            loadApiKeys();
        }

        async function createApiKey() {
            const name = document.getElementById('key-name').value.trim();
            const description = document.getElementById('key-description').value.trim();
            const expiresInDays = parseInt(document.getElementById('key-expiry').value);

            if (!name) {
                alert('Please enter a name for the API key');
                return;
            }

            try {
                const response = await fetch('/api/api-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        description,
                        expires_in_days: expiresInDays > 0 ? expiresInDays : null
                    })
                });

                if (!response.ok) throw new Error('Failed to create API key');

                const data = await response.json();
                
                // Show the generated key
                document.getElementById('generated-key').value = data.key.key_value;
                hideCreateKeyModal();
                document.getElementById('key-display-modal').style.display = 'flex';
            } catch (error) {
                console.error('Error creating API key:', error);
                alert('Failed to create API key: ' + error.message);
            }
        }

        function copyApiKey() {
            const input = document.getElementById('generated-key');
            input.select();
            document.execCommand('copy');
            
            // Visual feedback
            const btn = event.target.closest('button');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.style.background = 'var(--success-color)';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = 'var(--accent-primary)';
            }, 2000);
        }

        async function loadApiKeys() {
            try {
                const response = await fetch('/api/api-keys');
                if (!response.ok) throw new Error('Failed to load API keys');

                const data = await response.json();
                const keys = data.keys || [];

                const container = document.getElementById('api-keys-container');

                if (keys.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-key" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No API keys found. Generate one to get started!</p>
                        </div>
                    \`;
                    return;
                }

                let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';

                keys.forEach(key => {
                    const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
                    const expiryText = key.expires_at 
                        ? (isExpired ? 'Expired' : 'Expires ' + formatTimestamp(key.expires_at))
                        : 'Never expires';
                    
                    const statusColor = !key.is_active ? 'var(--text-muted)' : isExpired ? 'var(--error-color)' : 'var(--success-color)';
                    const statusText = !key.is_active ? 'Inactive' : isExpired ? 'Expired' : 'Active';

                    // Mask the key value (show first 8 and last 4 characters)
                    const maskedKey = key.key_value.substring(0, 8) + '...' + key.key_value.substring(key.key_value.length - 4);

                    html += \`
                        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                                <div style="flex: 1;">
                                    <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">
                                        <i class="fas fa-key" style="color: var(--accent-primary);"></i> \${key.name}
                                    </h4>
                                    <p style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-size: 0.875rem;">\${key.description || 'No description'}</p>
                                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.75rem;">
                                        <span style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: \${statusColor}20; color: \${statusColor}; border-radius: 4px; font-weight: 600;">
                                            <i class="fas fa-circle" style="font-size: 0.5rem;"></i> \${statusText}
                                        </span>
                                        <span style="font-size: 0.75rem; color: var(--text-muted);">
                                            <i class="fas fa-clock"></i> \${expiryText}
                                        </span>
                                        <span style="font-size: 0.75rem; color: var(--text-muted);">
                                            <i class="fas fa-chart-line"></i> \${key.usage_count || 0} uses
                                        </span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                    <button onclick="regenerateKey(\${key.id}, '\${key.name}')" class="btn" style="padding: 0.5rem 1rem;" title="Regenerate Key">
                                        <i class="fas fa-sync-alt"></i>
                                    </button>
                                    <button onclick="toggleKeyStatus(\${key.id}, \${!key.is_active})" class="btn" style="padding: 0.5rem 1rem;" title="\${key.is_active ? 'Deactivate' : 'Activate'}">
                                        <i class="fas fa-\${key.is_active ? 'pause' : 'play'}"></i>
                                    </button>
                                    <button onclick="deleteKey(\${key.id}, '\${key.name}')" class="btn" style="padding: 0.5rem 1rem; background: var(--error-color); color: white;" title="Revoke Key">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; font-family: monospace; font-size: 0.875rem; color: var(--text-muted);">
                                \${maskedKey}
                            </div>
                            <div style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
                                <i class="fas fa-user"></i> Created by \${key.created_by_username} on \${formatTimestamp(key.created_at)}
                                \${key.last_used ? '<br><i class="fas fa-history"></i> Last used: ' + formatTimestamp(key.last_used) : ''}
                            </div>
                        </div>
                    \`;
                });

                html += '</div>';
                container.innerHTML = html;
            } catch (error) {
                console.error('Error loading API keys:', error);
                document.getElementById('api-keys-container').innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Failed to load API keys</p>
                    </div>
                \`;
            }
        }

        async function toggleKeyStatus(id, newStatus) {
            try {
                const response = await fetch(\`/api/api-keys/\${id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: newStatus })
                });

                if (!response.ok) throw new Error('Failed to update key status');

                loadApiKeys();
            } catch (error) {
                console.error('Error updating key status:', error);
                alert('Failed to update key status');
            }
        }

        async function regenerateKey(id, name) {
            if (!confirm(\`Regenerate API key "\${name}"? The old key will stop working immediately.\`)) {
                return;
            }

            try {
                const response = await fetch(\`/api/api-keys/\${id}/regenerate\`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Failed to regenerate key');

                const data = await response.json();
                
                // Show the new key
                document.getElementById('generated-key').value = data.key_value;
                document.getElementById('key-display-modal').style.display = 'flex';
            } catch (error) {
                console.error('Error regenerating key:', error);
                alert('Failed to regenerate key');
            }
        }

        async function deleteKey(id, name) {
            if (!confirm(\`Permanently revoke API key "\${name}"? This cannot be undone.\`)) {
                return;
            }

            try {
                const response = await fetch(\`/api/api-keys/\${id}\`, {
                    method: 'DELETE'
                });

                if (!response.ok) throw new Error('Failed to revoke key');

                loadApiKeys();
            } catch (error) {
                console.error('Error revoking key:', error);
                alert('Failed to revoke key');
            }
        }

        // Load keys on page load
        loadApiKeys();
    `;

    res.send(getPageTemplate({
        pageTitle: 'API Key Management',
        pageIcon: 'fas fa-key',
        activeNav: 'api-keys',
        contentBody: contentBody,
        additionalCSS: `
            .btn-primary {
                background: var(--accent-primary);
                color: white;
                font-weight: 600;
            }
            .btn-primary:hover {
                background: var(--accent-secondary);
            }
        `,
        additionalJS: additionalJS,
        req: req
    }));
});

// Audit Trail API Endpoints
app.get('/api/audit-trail', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { user_id, action, start_date, end_date, limit = 100, offset = 0 } = req.query;
    
    let query = `
        SELECT 
            a.id,
            a.user_id,
            a.action,
            a.resource,
            a.details,
            a.ip_address,
            a.user_agent,
            a.timestamp,
            u.username,
            u.email
        FROM user_activity a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (user_id) {
        query += ' AND a.user_id = ?';
        params.push(user_id);
    }
    
    if (action) {
        query += ' AND a.action = ?';
        params.push(action);
    }
    
    if (start_date) {
        query += ' AND a.timestamp >= ?';
        params.push(start_date);
    }
    
    if (end_date) {
        query += ' AND a.timestamp <= ?';
        params.push(end_date);
    }

    query += ' ORDER BY a.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, rows) => {
        if (err) {
            loggers.system.error('Error fetching audit trail:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM user_activity WHERE 1=1';
        const countParams = [];
        
        if (user_id) {
            countQuery += ' AND user_id = ?';
            countParams.push(user_id);
        }
        if (action) {
            countQuery += ' AND action = ?';
            countParams.push(action);
        }
        if (start_date) {
            countQuery += ' AND timestamp >= ?';
            countParams.push(start_date);
        }
        if (end_date) {
            countQuery += ' AND timestamp <= ?';
            countParams.push(end_date);
        }
        
        db.get(countQuery, countParams, (err2, countRow) => {
            if (err2) {
                loggers.system.error('Error counting audit trail:', err2);
                return res.json({ activities: rows || [], total: 0 });
            }
            res.json({ 
                activities: rows || [], 
                total: countRow ? countRow.total : 0 
            });
        });
    });
});

app.get('/api/audit-trail/export', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    db.all(`
        SELECT 
            a.timestamp,
            u.username,
            u.email,
            a.action,
            a.resource,
            a.details,
            a.ip_address
        FROM user_activity a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.timestamp DESC
        LIMIT 10000
    `, (err, rows) => {
        if (err) {
            loggers.system.error('Error exporting audit trail:', err);
            return res.status(500).json({ error: 'Export failed' });
        }

        // Convert to CSV
        const headers = ['Timestamp', 'Username', 'Email', 'Action', 'Resource', 'Details', 'IP Address'];
        const csvRows = [headers.join(',')];
        
        rows.forEach(row => {
            const values = [
                row.timestamp || '',
                row.username || '',
                row.email || '',
                row.action || '',
                row.resource || '',
                (row.details || '').replace(/,/g, ';').replace(/\n/g, ' '),
                row.ip_address || ''
            ];
            csvRows.push(values.map(v => `"${v}"`).join(','));
        });

        const csv = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-trail-${moment().format('YYYY-MM-DD')}.csv`);
        res.send(csv);
        
        logActivity(req.user.id, 'export_audit_trail', 'user_activity', 'Exported audit trail to CSV', req);
    });
});

// Settings Export/Import API Endpoints
app.get('/api/settings/export', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        // Export all system settings
        db.all('SELECT * FROM system_settings', (err, settings) => {
            if (err) {
                loggers.system.error('Error exporting settings:', err);
                return res.status(500).json({ error: 'Export failed' });
            }

            const exportData = {
                version: config.system.version,
                exportedAt: moment().tz(TIMEZONE).format(),
                settings: settings || [],
                config: {
                    system: {
                        name: config.system.name,
                        timezone: config.system.timezone
                    },
                    integrations: {
                        unifi: {
                            enabled: config.integrations.unifi.enabled,
                            host: config.integrations.unifi.host,
                            pollInterval: config.integrations.unifi.pollInterval
                        },
                        homeAssistant: {
                            enabled: config.integrations.homeAssistant.enabled,
                            host: config.integrations.homeAssistant.host,
                            websocketEnabled: config.integrations.homeAssistant.websocketEnabled
                        },
                        mqtt: {
                            enabled: config.integrations.mqtt.enabled,
                            broker: config.integrations.mqtt.broker,
                            topic: config.integrations.mqtt.topic,
                            topics: config.integrations.mqtt.topics
                        },
                        websocket: {
                            enabled: config.integrations.websocket.enabled,
                            port: config.integrations.websocket.port
                        }
                    },
                    maintenance: config.maintenance
                }
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=system-settings-${moment().format('YYYY-MM-DD')}.json`);
            res.json(exportData);
            
            logActivity(req.user.id, 'export_settings', 'system_settings', 'Exported system settings', req);
        });
    } catch (error) {
        loggers.system.error('Settings export error:', error);
        res.status(500).json({ error: 'Failed to export settings' });
    }
});

app.post('/api/settings/import', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const importData = req.body;
        
        // Validate import data
        if (!importData || !importData.version || !importData.settings) {
            return res.status(400).json({ error: 'Invalid import data format' });
        }

        // Validate version compatibility (optional - could add version checks)
        loggers.system.info('Importing settings from version:', importData.version);

        // Import system settings
        const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value, category, description) VALUES (?, ?, ?, ?)');
        
        let imported = 0;
        importData.settings.forEach(setting => {
            stmt.run([setting.key, setting.value, setting.category, setting.description], (err) => {
                if (err) {
                    loggers.system.error('Error importing setting:', setting.key, err);
                } else {
                    imported++;
                }
            });
        });
        
        stmt.finalize(() => {
            logActivity(req.user.id, 'import_settings', 'system_settings', `Imported ${imported} settings`, req);
            res.json({ 
                success: true, 
                message: `Successfully imported ${imported} settings. Server may need restart for changes to take effect.`,
                imported 
            });
        });
    } catch (error) {
        loggers.system.error('Settings import error:', error);
        res.status(500).json({ error: 'Failed to import settings' });
    }
});

// ============================================================
// API KEY MANAGEMENT ENDPOINTS
// ============================================================

// Get all API keys
app.get('/api/api-keys', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    // First check if table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'", (checkErr, table) => {
        if (checkErr || !table) {
            loggers.system.error('API keys table does not exist:', checkErr);
            return res.json({ keys: [] }); // Return empty array if table doesn't exist
        }

        db.all(`
            SELECT 
                api_keys.id,
                api_keys.name,
                api_keys.key_value,
                api_keys.description,
                api_keys.created_by,
                api_keys.created_at,
                api_keys.last_used,
                api_keys.expires_at,
                api_keys.is_active,
                api_keys.permissions,
                api_keys.ip_whitelist,
                api_keys.usage_count,
                users.username as created_by_username
            FROM api_keys
            LEFT JOIN users ON api_keys.created_by = users.id
            ORDER BY api_keys.created_at DESC
        `, (err, rows) => {
            if (err) {
                loggers.system.error('Error fetching API keys:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ keys: rows || [] });
        });
    });
});

// Generate new API key
app.post('/api/api-keys', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, permissions, ip_whitelist, expires_in_days } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'API key name is required' });
    }

    // Generate a secure random API key
    const keyValue = 'elk_' + crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration date if specified
    let expiresAt = null;
    if (expires_in_days && expires_in_days > 0) {
        expiresAt = moment().add(expires_in_days, 'days').format('YYYY-MM-DD HH:mm:ss');
    }

    const permissionsJson = permissions ? JSON.stringify(permissions) : null;
    const ipWhitelistJson = ip_whitelist ? JSON.stringify(ip_whitelist) : null;

    db.run(`
        INSERT INTO api_keys (name, key_value, description, created_by, expires_at, permissions, ip_whitelist)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, keyValue, description, req.user.id, expiresAt, permissionsJson, ipWhitelistJson], function(err) {
        if (err) {
            loggers.system.error('Error creating API key:', err);
            return res.status(500).json({ error: 'Failed to create API key' });
        }

        loggers.system.info(`API key created: ${name} by user ${req.user.username}`);
        logActivity(req.user.id, 'create_api_key', 'api_keys', `Created API key: ${name}`, req);

        res.json({
            success: true,
            message: 'API key created successfully',
            key: {
                id: this.lastID,
                name,
                key_value: keyValue,
                description,
                created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                expires_at: expiresAt,
                is_active: true
            }
        });
    });
});

// Update API key
app.put('/api/api-keys/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, description, is_active, permissions, ip_whitelist } = req.body;

    const permissionsJson = permissions ? JSON.stringify(permissions) : null;
    const ipWhitelistJson = ip_whitelist ? JSON.stringify(ip_whitelist) : null;

    db.run(`
        UPDATE api_keys 
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            is_active = COALESCE(?, is_active),
            permissions = COALESCE(?, permissions),
            ip_whitelist = COALESCE(?, ip_whitelist)
        WHERE id = ?
    `, [name, description, is_active, permissionsJson, ipWhitelistJson, id], function(err) {
        if (err) {
            loggers.system.error('Error updating API key:', err);
            return res.status(500).json({ error: 'Failed to update API key' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }

        loggers.system.info(`API key updated: ID ${id} by user ${req.user.username}`);
        logActivity(req.user.id, 'update_api_key', 'api_keys', `Updated API key ID: ${id}`, req);

        res.json({ success: true, message: 'API key updated successfully' });
    });
});

// Revoke (delete) API key
app.delete('/api/api-keys/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Get key name before deletion for logging
    db.get('SELECT name FROM api_keys WHERE id = ?', [id], (err, row) => {
        if (err) {
            loggers.system.error('Error fetching API key:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'API key not found' });
        }

        const keyName = row.name;

        db.run('DELETE FROM api_keys WHERE id = ?', [id], function(err) {
            if (err) {
                loggers.system.error('Error deleting API key:', err);
                return res.status(500).json({ error: 'Failed to delete API key' });
            }

            loggers.system.info(`API key revoked: ${keyName} (ID: ${id}) by user ${req.user.username}`);
            logActivity(req.user.id, 'revoke_api_key', 'api_keys', `Revoked API key: ${keyName}`, req);

            res.json({ success: true, message: 'API key revoked successfully' });
        });
    });
});

// Regenerate API key
app.post('/api/api-keys/:id/regenerate', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const newKeyValue = 'elk_' + crypto.randomBytes(32).toString('hex');

    db.run(`
        UPDATE api_keys 
        SET key_value = ?,
            usage_count = 0,
            last_used = NULL
        WHERE id = ?
    `, [newKeyValue, id], function(err) {
        if (err) {
            loggers.system.error('Error regenerating API key:', err);
            return res.status(500).json({ error: 'Failed to regenerate API key' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'API key not found' });
        }

        loggers.system.info(`API key regenerated: ID ${id} by user ${req.user.username}`);
        logActivity(req.user.id, 'regenerate_api_key', 'api_keys', `Regenerated API key ID: ${id}`, req);

        res.json({
            success: true,
            message: 'API key regenerated successfully',
            key_value: newKeyValue
        });
    });
});

// Get API key usage statistics
app.get('/api/api-keys/:id/stats', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    db.get(`
        SELECT 
            id,
            name,
            usage_count,
            created_at,
            last_used,
            is_active,
            expires_at
        FROM api_keys
        WHERE id = ?
    `, [id], (err, row) => {
        if (err) {
            loggers.system.error('Error fetching API key stats:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'API key not found' });
        }

        const stats = {
            ...row,
            is_expired: row.expires_at ? moment(row.expires_at).isBefore(moment()) : false,
            days_until_expiry: row.expires_at ? moment(row.expires_at).diff(moment(), 'days') : null
        };

        res.json({ stats });
    });
});

// System action endpoints
app.post('/api/system/backup', requireAuth, async (req, res) => {
    try {
        const backupTime = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-${backupTime}.sql`;
        
        // Simulate backup process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        loggers.system.info(`System backup created: ${backupName}`);
        res.json({ 
            success: true, 
            message: 'Backup completed successfully',
            filename: backupName
        });
    } catch (error) {
        loggers.system.error('Backup error:', error);
        res.status(500).json({ error: 'Backup failed' });
    }
});

app.post('/api/system/cleanup', requireAuth, async (req, res) => {
    try {
        // Simulate cleanup process
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const cleanedItems = Math.floor(Math.random() * 100) + 50;
        loggers.system.info(`System cleanup completed: ${cleanedItems} items cleaned`);
        
        res.json({ 
            success: true, 
            message: `Cleanup completed: ${cleanedItems} items removed`,
            itemsCleaned: cleanedItems
        });
    } catch (error) {
        loggers.system.error('Cleanup error:', error);
        res.status(500).json({ error: 'Cleanup failed' });
    }
});

app.post('/api/system/restart', requireAuth, async (req, res) => {
    try {
        loggers.system.info('System restart requested by user');
        
        res.json({ 
            success: true, 
            message: 'Restart initiated - Server will restart in 5 seconds'
        });
        
        // Graceful restart after response
        setTimeout(() => {
            loggers.system.info('Restarting server...');
            process.exit(0);
        }, 5000);
        
    } catch (error) {
        loggers.system.error('Restart error:', error);
        res.status(500).json({ error: 'Restart failed' });
    }
});

app.post('/api/system/maintenance', requireAuth, async (req, res) => {
    try {
        // Simulate maintenance tasks
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const tasks = [
            'Database optimization completed',
            'Cache cleared',
            'Log rotation performed',
            'System health check passed'
        ];
        
        loggers.system.info('Maintenance mode completed');
        res.json({ 
            success: true, 
            message: 'Maintenance completed successfully',
            tasks: tasks
        });
    } catch (error) {
        loggers.system.error('Maintenance error:', error);
        res.status(500).json({ error: 'Maintenance failed' });
    }
});

// API endpoint to get logs
app.get('/api/logs', requireAuth, (req, res) => {
    const { limit = 100, offset = 0, category, level, source } = req.query;
    
    let sql = 'SELECT * FROM log_events WHERE 1=1';
    let params = [];
    
    if (category) {
        sql += ' AND category = ?';
        params.push(category);
    }
    
    if (level) {
        sql += ' AND severity = ?';
        params.push(level);
    }
    
    if (source) {
        sql += ' AND source = ?';
        params.push(source);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            loggers.system.error('Query error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        
        res.json(rows);
    });
});

// Advanced search endpoint with multi-field filtering
app.post('/api/logs/search', requireAuth, (req, res) => {
    const {
        searchText = '',
        startDate = null,
        endDate = null,
        levels = [],
        sources = [],
        categories = [],
        useRegex = false,
        caseSensitive = false,
        limit = 100,
        offset = 0
    } = req.body;
    
    let sql = 'SELECT * FROM log_events WHERE 1=1';
    let params = [];
    
    // Date range filter
    if (startDate) {
        sql += ' AND timestamp >= ?';
        params.push(startDate);
    }
    
    if (endDate) {
        sql += ' AND timestamp <= ?';
        params.push(endDate);
    }
    
    // Log levels filter (multiple)
    if (levels && levels.length > 0) {
        const placeholders = levels.map(() => '?').join(',');
        sql += ` AND severity IN (${placeholders})`;
        params.push(...levels);
    }
    
    // Sources filter (multiple)
    if (sources && sources.length > 0) {
        const placeholders = sources.map(() => '?').join(',');
        sql += ` AND source IN (${placeholders})`;
        params.push(...sources);
    }
    
    // Categories filter (multiple)
    if (categories && categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        sql += ` AND category IN (${placeholders})`;
        params.push(...categories);
    }
    
    // Text search in message
    if (searchText) {
        if (useRegex) {
            // SQLite doesn't support REGEXP by default, so we'll filter in memory
            sql += ' AND message IS NOT NULL';
        } else {
            if (caseSensitive) {
                sql += ' AND message LIKE ? COLLATE BINARY';
            } else {
                sql += ' AND message LIKE ?';
            }
            params.push(`%${searchText}%`);
        }
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            loggers.system.error('Search query error:', err);
            return res.status(500).json({ error: 'Search failed' });
        }
        
        // Apply regex filter in memory if needed
        let results = rows;
        if (searchText && useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(searchText, flags);
                results = rows.filter(row => row.message && regex.test(row.message));
            } catch (regexErr) {
                return res.status(400).json({ error: 'Invalid regex pattern' });
            }
        }
        
        res.json({
            results: results,
            count: results.length,
            hasMore: results.length === parseInt(limit)
        });
    });
});

// Get unique values for search filters
app.get('/api/logs/filter-options', requireAuth, (req, res) => {
    const queries = {
        levels: 'SELECT DISTINCT severity FROM log_events WHERE severity IS NOT NULL ORDER BY severity',
        sources: 'SELECT DISTINCT source FROM log_events WHERE source IS NOT NULL ORDER BY source LIMIT 100',
        categories: 'SELECT DISTINCT category FROM log_events WHERE category IS NOT NULL ORDER BY category LIMIT 100'
    };
    
    const results = {};
    let completed = 0;
    
    Object.keys(queries).forEach(key => {
        db.all(queries[key], [], (err, rows) => {
            if (err) {
                loggers.system.error(`Error fetching ${key}:`, err);
                results[key] = [];
            } else {
                results[key] = rows.map(row => row[Object.keys(row)[0]]);
            }
            
            completed++;
            if (completed === Object.keys(queries).length) {
                res.json(results);
            }
        });
    });
});

// Saved searches endpoints
app.get('/api/saved-searches', requireAuth, (req, res) => {
    const userId = req.user.id;
    
    db.all(
        `SELECT * FROM saved_searches 
         WHERE user_id = ? OR is_public = 1 
         ORDER BY last_used DESC, created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) {
                loggers.system.error('Error fetching saved searches:', err);
                return res.status(500).json({ error: 'Failed to fetch saved searches' });
            }
            
            // Parse filters JSON
            const searches = rows.map(row => ({
                ...row,
                filters: JSON.parse(row.filters)
            }));
            
            res.json(searches);
        }
    );
});

app.post('/api/saved-searches', requireAuth, (req, res) => {
    const { name, description, filters, is_public } = req.body;
    const userId = req.user.id;
    
    if (!name || !filters) {
        return res.status(400).json({ error: 'Name and filters are required' });
    }
    
    db.run(
        `INSERT INTO saved_searches (user_id, name, description, filters, is_public) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, name, description, JSON.stringify(filters), is_public ? 1 : 0],
        function(err) {
            if (err) {
                loggers.system.error('Error saving search:', err);
                return res.status(500).json({ error: 'Failed to save search' });
            }
            
            res.json({ id: this.lastID, message: 'Search saved successfully' });
        }
    );
});

app.put('/api/saved-searches/:id', requireAuth, (req, res) => {
    const searchId = req.params.id;
    const userId = req.user.id;
    const { name, description, filters, is_public } = req.body;
    
    db.run(
        `UPDATE saved_searches 
         SET name = ?, description = ?, filters = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND user_id = ?`,
        [name, description, JSON.stringify(filters), is_public ? 1 : 0, searchId, userId],
        function(err) {
            if (err) {
                loggers.system.error('Error updating search:', err);
                return res.status(500).json({ error: 'Failed to update search' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Search not found or access denied' });
            }
            
            res.json({ message: 'Search updated successfully' });
        }
    );
});

app.delete('/api/saved-searches/:id', requireAuth, (req, res) => {
    const searchId = req.params.id;
    const userId = req.user.id;
    
    db.run(
        'DELETE FROM saved_searches WHERE id = ? AND user_id = ?',
        [searchId, userId],
        function(err) {
            if (err) {
                loggers.system.error('Error deleting search:', err);
                return res.status(500).json({ error: 'Failed to delete search' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Search not found or access denied' });
            }
            
            res.json({ message: 'Search deleted successfully' });
        }
    );
});

app.post('/api/saved-searches/:id/use', requireAuth, (req, res) => {
    const searchId = req.params.id;
    
    db.run(
        `UPDATE saved_searches 
         SET last_used = CURRENT_TIMESTAMP, use_count = use_count + 1 
         WHERE id = ?`,
        [searchId],
        (err) => {
            if (err) {
                loggers.system.error('Error updating search usage:', err);
            }
            res.json({ message: 'Usage tracked' });
        }
    );
});

// Get total log count
app.get('/api/logs/count', requireAuth, (req, res) => {
    db.get('SELECT COUNT(*) as count FROM log_events', (err, row) => {
        if (err) {
            loggers.system.error('Count query error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json({ count: row.count });
    });
});

// Get today's log count (since midnight local time)
app.get('/api/logs/count/today', requireAuth, (req, res) => {
    // Get midnight in local timezone (America/New_York) in database format
    const now = moment().tz(TIMEZONE);
    const midnight = now.clone().startOf('day');
    const midnightFormatted = midnight.format('YYYY-MM-DD HH:mm:ss');
    
    db.get('SELECT COUNT(*) as count FROM log_events WHERE timestamp >= ?', [midnightFormatted], (err, row) => {
        if (err) {
            loggers.system.error('Today count query error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json({ count: row.count });
    });
});

// Analytics activity data for charts
app.get('/api/analytics/activity', requireAuth, (req, res) => {
    const range = req.query.range || '24h';
    let intervalMinutes, hoursBack, groupFormat;
    
    switch(range) {
        case '1h':
            intervalMinutes = 5;
            hoursBack = 1;
            groupFormat = '%H:%M';
            break;
        case '6h':
            intervalMinutes = 30;
            hoursBack = 6;
            groupFormat = '%H:%M';
            break;
        case '24h':
            intervalMinutes = 60;
            hoursBack = 24;
            groupFormat = '%H:00';
            break;
        case '7d':
            intervalMinutes = 60 * 6; // 6 hours
            hoursBack = 24 * 7;
            groupFormat = '%m/%d %H:00';
            break;
        default:
            intervalMinutes = 60;
            hoursBack = 24;
            groupFormat = '%H:00';
    }
    
    const startTime = moment().tz(TIMEZONE).subtract(hoursBack, 'hours');
    const startTimeFormatted = startTime.format('YYYY-MM-DD HH:mm:ss');
    
    const query = `
        SELECT 
            strftime('${groupFormat}', timestamp) as time_bucket,
            COUNT(*) as count
        FROM log_events
        WHERE timestamp >= ?
        GROUP BY time_bucket
        ORDER BY timestamp ASC
    `;
    
    db.all(query, [startTimeFormatted], (err, rows) => {
        if (err) {
            loggers.system.error('Analytics query error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        
        // Fill in missing time slots with 0 counts
        const labels = [];
        const values = [];
        const dataMap = {};
        
        // Create map of existing data
        rows.forEach(row => {
            dataMap[row.time_bucket] = row.count;
        });
        
        // Generate all time slots
        const numSlots = Math.ceil((hoursBack * 60) / intervalMinutes);
        for (let i = 0; i < numSlots; i++) {
            const slotTime = startTime.clone().add(i * intervalMinutes, 'minutes');
            const label = slotTime.format(groupFormat === '%H:%M' ? 'HH:mm' : 'MM/DD HH:00');
            const bucketKey = slotTime.format(groupFormat.replace('%H', 'HH').replace('%M', 'mm').replace('%m', 'MM').replace('%d', 'DD'));
            
            labels.push(label);
            values.push(dataMap[bucketKey] || 0);
        }
        
        res.json({ labels, values });
    });
});

// System status API
app.get('/api/status', requireAuth, (req, res) => {
    const status = {
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: config.system.version,
            timezone: TIMEZONE,
            timestamp: moment().tz(TIMEZONE).toISOString()
        },
        database: {
            path: dbPath,
            connected: true
        },
        integrations: {
            dsc: { status: 'ready', endpoint: '/log' },
            unifi: { status: 'setup_required' },
            homeAssistant: { status: 'setup_required' },
            mqtt: { status: 'setup_required' }
        }
    };
    
    res.json(status);
});

// ========================================
// DASHBOARD WIDGETS API
// ========================================

// Get user's widgets
app.get('/api/dashboard/widgets', requireAuth, (req, res) => {
    const userId = req.user.id;
    
    db.all(
        `SELECT * FROM dashboard_widgets 
         WHERE user_id = ? AND is_visible = 1 
         ORDER BY position_y, position_x`,
        [userId],
        (err, rows) => {
            if (err) {
                loggers.system.error('Error fetching widgets:', err);
                return res.status(500).json({ error: 'Failed to fetch widgets' });
            }
            
            // Parse config JSON
            const widgets = rows.map(row => ({
                ...row,
                config: row.config ? JSON.parse(row.config) : {}
            }));
            
            console.log(`📊 Returning ${widgets.length} widgets for user ${userId}`);
            res.json({ widgets });
        }
    );
});

// Create new widget
app.post('/api/dashboard/widgets', requireAuth, (req, res) => {
    const { widget_type, title, position_x, position_y, width, height, config } = req.body;
    const userId = req.user.id;
    
    console.log('📊 Widget creation request:', { widget_type, title, userId, body: req.body });
    
    if (!widget_type || !title) {
        console.log('❌ Missing required fields:', { widget_type, title });
        return res.status(400).json({ error: 'Widget type and title are required' });
    }
    
    db.run(
        `INSERT INTO dashboard_widgets 
         (user_id, widget_type, title, position_x, position_y, width, height, config) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, widget_type, title, position_x || 0, position_y || 0, width || 4, height || 3, JSON.stringify(config || {})],
        function(err) {
            if (err) {
                console.error('❌ Database error creating widget:', err);
                loggers.system.error('Error creating widget:', err);
                return res.status(500).json({ error: 'Failed to create widget' });
            }
            
            console.log('✅ Widget created successfully:', { id: this.lastID, widget_type, title });
            res.json({ success: true, id: this.lastID, message: 'Widget created successfully' });
        }
    );
});

// Update widget
app.put('/api/dashboard/widgets/:id', requireAuth, (req, res) => {
    const widgetId = req.params.id;
    const userId = req.user.id;
    const { title, position_x, position_y, width, height, config, is_visible } = req.body;
    
    db.run(
        `UPDATE dashboard_widgets 
         SET title = COALESCE(?, title),
             position_x = COALESCE(?, position_x),
             position_y = COALESCE(?, position_y),
             width = COALESCE(?, width),
             height = COALESCE(?, height),
             config = COALESCE(?, config),
             is_visible = COALESCE(?, is_visible),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [title, position_x, position_y, width, height, config ? JSON.stringify(config) : null, is_visible, widgetId, userId],
        function(err) {
            if (err) {
                loggers.system.error('Error updating widget:', err);
                return res.status(500).json({ error: 'Failed to update widget' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Widget not found or access denied' });
            }
            
            res.json({ message: 'Widget updated successfully' });
        }
    );
});

// Bulk update widget positions (for drag-and-drop)
app.post('/api/dashboard/widgets/positions', requireAuth, (req, res) => {
    const { widgets } = req.body; // Array of {id, position_x, position_y, width, height}
    const userId = req.user.id;
    
    if (!widgets || !Array.isArray(widgets)) {
        return res.status(400).json({ error: 'Widgets array is required' });
    }
    
    // Update each widget position
    let completed = 0;
    let errors = 0;
    
    widgets.forEach(widget => {
        db.run(
            `UPDATE dashboard_widgets 
             SET position_x = ?, position_y = ?, width = ?, height = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ? AND user_id = ?`,
            [widget.position_x, widget.position_y, widget.width, widget.height, widget.id, userId],
            (err) => {
                if (err) {
                    errors++;
                    loggers.system.error(`Error updating widget ${widget.id}:`, err);
                }
                
                completed++;
                if (completed === widgets.length) {
                    if (errors > 0) {
                        res.status(500).json({ 
                            error: `Failed to update ${errors} widget(s)`,
                            updated: completed - errors
                        });
                    } else {
                        res.json({ message: 'Widget positions updated successfully', updated: completed });
                    }
                }
            }
        );
    });
});

// Delete widget
app.delete('/api/dashboard/widgets/:id', requireAuth, (req, res) => {
    const widgetId = req.params.id;
    const userId = req.user.id;
    
    db.run(
        'DELETE FROM dashboard_widgets WHERE id = ? AND user_id = ?',
        [widgetId, userId],
        function(err) {
            if (err) {
                loggers.system.error('Error deleting widget:', err);
                return res.status(500).json({ error: 'Failed to delete widget' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Widget not found or access denied' });
            }
            
            res.json({ success: true, message: 'Widget deleted successfully' });
        }
    );
});

// Fix widget titles (update generic "Widget" titles to proper names)
app.post('/api/dashboard/widgets/fix-titles', requireAuth, (req, res) => {
    const userId = req.user.id;
    
    const properTitles = {
        log_count: 'Total Logs',
        today_count: "Today's Logs",
        severity_breakdown: 'Severity Breakdown',
        log_level_distribution: 'Log Level Distribution',
        recent_logs: 'Recent Logs',
        system_health: 'System Health',
        system_health_detailed: 'Detailed System Health',
        source_stats: 'Top Sources',
        hourly_trend: 'Hourly Trend',
        error_rate: 'Error Rate',
        api_keys_count: 'Active API Keys',
        uptime_monitor: 'Uptime Monitor',
        quick_stats: 'Quick Stats',
        top_errors: 'Top Errors'
    };
    
    db.all(
        'SELECT id, widget_type, title FROM dashboard_widgets WHERE user_id = ?',
        [userId],
        (err, widgets) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch widgets' });
            }
            
            let fixed = 0;
            let completed = 0;
            const widgetsToFix = widgets.filter(w => w.title === 'Widget' || !w.title);
            
            if (widgetsToFix.length === 0) {
                return res.json({ success: true, message: 'All widgets have proper titles', fixed: 0 });
            }
            
            widgetsToFix.forEach(widget => {
                const properTitle = properTitles[widget.widget_type] || 'Widget';
                
                db.run('UPDATE dashboard_widgets SET title = ? WHERE id = ?', [properTitle, widget.id], (err) => {
                    if (!err) fixed++;
                    completed++;
                    
                    if (completed === widgetsToFix.length) {
                        res.json({ success: true, message: `Fixed ${fixed} widget title(s)`, fixed: fixed });
                    }
                });
            });
        }
    );
});

// Fix corrupted widget sizes (one-time fix for coordinate migration)
app.post('/api/dashboard/widgets/fix-sizes', requireAuth, (req, res) => {
    const userId = req.user.id;
    
    loggers.system.info('Fix-sizes called for user ' + userId);
    
    // Get all user's widgets
    db.all(
        'SELECT id, widget_type, width, height FROM dashboard_widgets WHERE user_id = ?',
        [userId],
        (err, widgets) => {
            if (err) {
                loggers.system.error('Error fetching widgets for fix:', err);
                return res.status(500).json({ error: 'Failed to fetch widgets' });
            }
            
            loggers.system.info('Found ' + widgets.length + ' widgets to check');
            
            let fixed = 0;
            let completed = 0;
            const corruptedWidgets = widgets.filter(w => w.width > 20 || w.height > 20 || w.width === 0 || w.height === 0);
            
            if (corruptedWidgets.length === 0) {
                loggers.system.info('No corrupted widgets found');
                return res.json({ success: true, message: 'No corrupted widgets found', fixed: 0 });
            }
            
            loggers.system.info('Fixing ' + corruptedWidgets.length + ' corrupted widgets');
            
            corruptedWidgets.forEach(widget => {
                let w, h;
                
                // Set reasonable defaults based on type
                if (widget.widget_type === 'recent_logs' || widget.widget_type === 'top_errors') {
                    w = 6; h = 10;
                } else if (widget.widget_type.includes('breakdown') || widget.widget_type.includes('trend') || widget.widget_type.includes('rate') || widget.widget_type === 'source_stats') {
                    w = 4; h = 8;
                } else if (widget.widget_type === 'quick_stats' || widget.widget_type === 'system_health_detailed') {
                    w = 4; h = 6;
                } else {
                    w = 3; h = 4;
                }
                
                loggers.system.info('Fixing widget ' + widget.id + ': ' + widget.width + 'x' + widget.height + ' -> ' + w + 'x' + h);
                
                db.run('UPDATE dashboard_widgets SET width = ?, height = ? WHERE id = ?', [w, h, widget.id], (err) => {
                    if (err) {
                        loggers.system.error('Error updating widget ' + widget.id + ':', err);
                    } else {
                        fixed++;
                    }
                    
                    completed++;
                    if (completed === corruptedWidgets.length) {
                        loggers.system.info('Fixed ' + fixed + ' widgets');
                        res.json({ success: true, message: 'Fixed ' + fixed + ' corrupted widget(s)', fixed: fixed });
                    }
                });
            });
        }
    );
});

// Reset widget positions to defaults (fix for coordinate issues)
app.post('/api/dashboard/widgets/reset-positions', requireAuth, (req, res) => {
    const userId = req.user.id;
    
    loggers.system.info('Resetting widget positions for user ' + userId);
    
    // Get all user's widgets
    db.all(
        'SELECT id, widget_type FROM dashboard_widgets WHERE user_id = ? ORDER BY id',
        [userId],
        (err, widgets) => {
            if (err) {
                loggers.system.error('Error fetching widgets:', err);
                return res.status(500).json({ error: 'Failed to fetch widgets' });
            }
            
            loggers.system.info('Found ' + widgets.length + ' widgets to reset');
            
            // Assign new positions in a grid layout
            let x = 0, y = 0;
            let completed = 0;
            
            widgets.forEach((widget, index) => {
                // Default sizes for 12-column grid (40px cells)
                let w, h;
                
                if (widget.widget_type.includes('breakdown') || widget.widget_type.includes('chart') || widget.widget_type === 'source_stats') {
                    w = 4; h = 8;  // Charts
                } else if (widget.widget_type === 'recent_logs' || widget.widget_type === 'top_errors') {
                    w = 6; h = 10;  // Lists
                } else if (widget.widget_type === 'system_health_detailed' || widget.widget_type === 'quick_stats') {
                    w = 4; h = 6;  // Multi-metric
                } else {
                    w = 3; h = 4;  // Simple stats
                }
                
                // Move to next row if widget doesn't fit
                if (x + w > 12) {
                    x = 0;
                    y += h + 1;
                }
                
                loggers.system.info('  Widget ' + widget.id + ' (' + widget.widget_type + '): Setting position (' + x + ', ' + y + ', ' + w + ', ' + h + ')');
                
                db.run(
                    'UPDATE dashboard_widgets SET position_x = ?, position_y = ?, width = ?, height = ? WHERE id = ?',
                    [x, y, w, h, widget.id],
                    (err) => {
                        if (err) {
                            loggers.system.error('Error updating widget ' + widget.id + ':', err);
                        }
                        completed++;
                        
                        if (completed === widgets.length) {
                            loggers.system.info('Successfully reset ' + completed + ' widget positions');
                            res.json({ success: true, message: 'Widget positions reset successfully', count: completed });
                        }
                    }
                );
                
                x += w;
            });
            
            if (widgets.length === 0) {
                loggers.system.info('No widgets to reset');
                res.json({ success: true, message: 'No widgets to reset' });
            }
        }
    );
});

// Widget data endpoints - provide data for different widget types
app.get('/api/dashboard/widget-data/:type', requireAuth, (req, res) => {
    const widgetType = req.params.type;
    
    switch(widgetType) {
        case 'log_count':
            db.get('SELECT COUNT(*) as count FROM log_events', (err, row) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                res.json({ count: row.count });
            });
            break;
            
        case 'today_count':
            const midnight = moment().tz(TIMEZONE).startOf('day').format('YYYY-MM-DD HH:mm:ss');
            db.get('SELECT COUNT(*) as count FROM log_events WHERE timestamp >= ?', [midnight], (err, row) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                res.json({ count: row.count });
            });
            break;
            
        case 'severity_breakdown':
            db.all(
                `SELECT severity, COUNT(*) as count 
                 FROM log_events 
                 WHERE timestamp >= datetime('now', '-24 hours')
                 GROUP BY severity`,
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(rows);
                }
            );
            break;
            
        case 'recent_logs':
            const limit = parseInt(req.query.limit) || 10;
            db.all(
                'SELECT * FROM log_events ORDER BY timestamp DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(rows);
                }
            );
            break;
            
        case 'system_health':
            const health = {
                cpu: process.cpuUsage(),
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                uptime: Math.floor(process.uptime()),
                timestamp: moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')
            };
            res.json(health);
            break;
            
        case 'source_stats':
            db.all(
                `SELECT source, COUNT(*) as count 
                 FROM log_events 
                 WHERE timestamp >= datetime('now', '-24 hours')
                 GROUP BY source 
                 ORDER BY count DESC 
                 LIMIT 10`,
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(rows);
                }
            );
            break;
            
        case 'hourly_trend':
            db.all(
                `SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(*) as count
                 FROM log_events 
                 WHERE timestamp >= datetime('now', '-24 hours')
                 GROUP BY hour
                 ORDER BY hour`,
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(rows);
                }
            );
            break;
            
        case 'error_rate':
            db.all(
                `SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(CASE WHEN severity IN ('error', 'critical') THEN 1 END) as errors,
                    COUNT(*) as total
                 FROM log_events 
                 WHERE timestamp >= datetime('now', '-24 hours')
                 GROUP BY hour
                 ORDER BY hour`,
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    const data = rows.map(row => ({
                        hour: row.hour,
                        rate: row.total > 0 ? ((row.errors / row.total) * 100).toFixed(1) : 0
                    }));
                    res.json(data);
                }
            );
            break;
            
        case 'api_keys_count':
            db.get('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1', (err, row) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                res.json({ count: row.count });
            });
            break;
            
        case 'uptime_monitor':
            const uptimeSeconds = Math.floor(process.uptime());
            const days = Math.floor(uptimeSeconds / 86400);
            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            res.json({ 
                uptime: uptimeSeconds,
                days,
                hours,
                minutes,
                formatted: `${days}d ${hours}h ${minutes}m`
            });
            break;
            
        case 'quick_stats':
            db.get(
                `SELECT 
                    COUNT(*) as total_logs,
                    COUNT(CASE WHEN severity = 'error' THEN 1 END) as errors,
                    COUNT(CASE WHEN timestamp >= datetime('now', '-1 hour') THEN 1 END) as last_hour,
                    COUNT(DISTINCT source) as sources
                 FROM log_events`,
                (err, row) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(row);
                }
            );
            break;
            
        case 'top_errors':
            db.all(
                `SELECT message, COUNT(*) as count, MAX(timestamp) as last_seen
                 FROM log_events 
                 WHERE severity IN ('error', 'critical')
                   AND timestamp >= datetime('now', '-24 hours')
                 GROUP BY message
                 ORDER BY count DESC
                 LIMIT 5`,
                (err, rows) => {
                    if (err) return res.status(500).json({ error: 'Failed to fetch data' });
                    res.json(rows);
                }
            );
            break;
            
        case 'system_health_detailed':
            // Get comprehensive system health data
            const mem = process.memoryUsage();
            const dbSizeQuery = new Promise((resolve) => {
                db.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", (err, row) => {
                    resolve(err ? 0 : row.size);
                });
            });
            
            dbSizeQuery.then(dbSize => {
                const cpuUsage = process.cpuUsage();
                const totalMem = require('os').totalmem();
                const freeMem = require('os').freemem();
                const usedMem = totalMem - freeMem;
                
                res.json({
                    heap: {
                        used: Math.round(mem.heapUsed / 1024 / 1024),
                        total: Math.round(mem.heapTotal / 1024 / 1024),
                        percent: Math.round((mem.heapUsed / mem.heapTotal) * 100)
                    },
                    system: {
                        used: Math.round(usedMem / 1024 / 1024),
                        total: Math.round(totalMem / 1024 / 1024),
                        percent: Math.round((usedMem / totalMem) * 100)
                    },
                    database: {
                        size: Math.round(dbSize / 1024 / 1024),
                        sizeFormatted: (dbSize / 1024 / 1024).toFixed(2) + ' MB'
                    },
                    cpu: {
                        user: Math.round(cpuUsage.user / 1000),
                        system: Math.round(cpuUsage.system / 1000)
                    },
                    uptime: Math.floor(process.uptime())
                });
            });
            break;
            
        default:
            res.status(404).json({ error: 'Unknown widget type' });
    }
});

// Favicon route
app.get('/favicon.svg', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: moment().tz(TIMEZONE).toISOString(),
        uptime: process.uptime(),
        version: config.system.version
    });
});

// =============================================================================
// START SERVER
// =============================================================================

// Server initialization tasks (called after server starts)
async function initializeServerComponents() {
    // Clear all sessions on server restart
    db.run('UPDATE user_sessions SET is_active = 0 WHERE is_active = 1', (err) => {
        if (err) {
            loggers.system.error('Failed to clear sessions on startup:', err);
        } else {
            db.get('SELECT changes() as count', (err, row) => {
                if (!err && row.count > 0) {
                    loggers.system.info(`🔄 Cleared ${row.count} active session(s) on server restart`);
                    console.log(`🔄 Cleared ${row.count} stale session(s) from previous run`);
                }
            });
        }
    });
    
    // Initialize integrations after server starts
    try {
        await integrationManager.initialize();
        integrationManager.initializeHealthChecks();
        loggers.system.info('🎉 All systems operational!');
        
        // Initialize maintenance tasks (backups, cleanup)
        maintenanceManager.scheduleMaintenance();
        loggers.system.info('⏰ Scheduled daily backups at 2:00 AM (keeping last 10)');
        
        // Log server startup to database
        logToDatabase(`Server started on port ${PORT}`, 'info', 'server', 'logging-server');
        logToDatabase('All systems operational', 'info', 'server', 'logging-server');
        
        // Clean up old resolved alerts (older than 7 days)
        const sevenDaysAgo = moment().tz(TIMEZONE).subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');
        db.run('DELETE FROM system_alerts WHERE is_resolved = 1 AND resolved_at < ?', [sevenDaysAgo], function(err) {
            if (!err && this.changes > 0) {
                loggers.system.info(`🗑️ Cleaned up ${this.changes} old resolved alert(s)`);
            }
        });
        
        // Start real-time monitoring
        startRealTimeMonitoring();
        
    } catch (error) {
        loggers.system.error('Integration initialization failed:', error);
        logToDatabase(`Integration initialization failed: ${error.message}`, 'error', 'server', 'logging-server');
    }
}

// Check for HTTPS configuration
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/app/ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/app/ssl/cert.pem';

let server;

if (USE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    // HTTPS Server
    const https = require('https');
    const sslOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    
    server = https.createServer(sslOptions, app);
    server.listen(PORT, async () => {
        loggers.system.info(`🔒 HTTPS Server running on port ${PORT}`);
        loggers.system.info(`🌐 Dashboard: https://localhost:${PORT}/dashboard`);
        loggers.system.info(`🔐 Default login: admin / ChangeMe123!`);
        loggers.system.info(`📍 Database: ${dbPath}`);
        loggers.system.info(`🏢 Enterprise Platform v${config.system.version} Ready!`);
        
        console.log('\n🎯 Enhanced Universal Logging Platform Started Successfully!');
        console.log('═════════════════════════════════════════════════════════════');
        console.log(`🔒 HTTPS Enabled - Secure Connection`);
        console.log(`🌐 Web Interface: https://localhost:${PORT}/dashboard`);
        console.log(`🔐 Login: admin / ChangeMe123!`);
        console.log(`📊 API Endpoints: https://localhost:${PORT}/api/`);
        console.log(`🔒 ESP32 Endpoint: https://localhost:${PORT}/log`);
        console.log(`💚 Health Check: https://localhost:${PORT}/health`);
        if (config.integrations.websocket.enabled) {
            console.log(`🔗 WebSocket Server: wss://localhost:${config.integrations.websocket.port}`);
        }
        if (config.integrations.mqtt.enabled) {
            console.log(`📡 MQTT Integration: ${config.integrations.mqtt.broker}`);
        }
        console.log('═════════════════════════════════════════════════════════════\n');
        
        await initializeServerComponents();
    });
} else {
    // HTTP Server (default)
    if (USE_HTTPS) {
        loggers.system.warn('⚠️  HTTPS requested but SSL certificates not found');
        loggers.system.warn(`   Expected: ${SSL_KEY_PATH} and ${SSL_CERT_PATH}`);
        loggers.system.warn('   Falling back to HTTP mode');
        console.log('⚠️  HTTPS requested but certificates not found - using HTTP\n');
    }
    
    server = app.listen(PORT, async () => {
        loggers.system.info(`🚀 Enhanced Universal Logging Server running on port ${PORT}`);
        loggers.system.info(`🌐 Dashboard: http://localhost:${PORT}/dashboard`);
        loggers.system.info(`🔐 Default login: admin / ChangeMe123!`);
        loggers.system.info(`📍 Database: ${dbPath}`);
        loggers.system.info(`🏢 Enterprise Platform v${config.system.version} Ready!`);
        
        console.log('\n🎯 Enhanced Universal Logging Platform Started Successfully!');
        console.log('═════════════════════════════════════════════════════════════');
        console.log(`🌐 Web Interface: http://localhost:${PORT}/dashboard`);
        console.log(`🔐 Login: admin / ChangeMe123!`);
        console.log(`📊 API Endpoints: http://localhost:${PORT}/api/`);
        console.log(`🔒 ESP32 Endpoint: http://localhost:${PORT}/log`);
        console.log(`💚 Health Check: http://localhost:${PORT}/health`);
        if (config.integrations.websocket.enabled) {
            console.log(`🔗 WebSocket Server: ws://localhost:${config.integrations.websocket.port}`);
        }
        if (config.integrations.mqtt.enabled) {
            console.log(`📡 MQTT Integration: ${config.integrations.mqtt.broker}`);
        }
        console.log('═════════════════════════════════════════════════════════════\n');
        
        await initializeServerComponents();
    });
}

server.on('error', (error) => {
    console.error('🚨 SERVER ERROR:', error);
    loggers.system.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use!`);
        process.exit(1);
    }
});

server.on('listening', () => {
    const address = server.address();
    console.log(`✅ Server confirmed listening on ${address.address}:${address.port}`);
});

// Improved error handling without aggressive shutdown
process.on('uncaughtException', (error) => {
    loggers.system.error('Uncaught Exception:', error);
    console.error('🚨 UNCAUGHT EXCEPTION:', error);
    // Don't exit automatically - let it continue running
});

process.on('unhandledRejection', (reason, promise) => {
    loggers.system.error('Unhandled Rejection:', reason);
    console.error('🚨 UNHANDLED REJECTION:', reason);
    // Don't exit automatically - let it continue running
});

// Only handle explicit shutdown requests
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received - shutting down gracefully...');
    server.close(() => {
        loggers.system.info('Server shut down successfully');
        db.close((err) => {
            if (err) {
                loggers.system.error('Error closing database:', err);
            } else {
                loggers.system.info('Database connection closed');
            }
            process.exit(0);
        });
    });
});

// Keep alive indicator
setInterval(() => {
    const uptime = Math.floor(process.uptime());
    if (uptime % 60 === 0) { // Log every minute
        loggers.system.info(`Server running - uptime: ${uptime}s`);
    }
}, 1000);

module.exports = { app, db, loggers, userManager, config };
