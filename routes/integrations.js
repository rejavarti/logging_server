/**
 * Integrations Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Integration management interface
 * - Integration configuration and setup
 * - Integration status monitoring
 * - Integration testing and validation
 */

const express = require('express');
const { getPageTemplate } = require('../configs/templates/base');
const { escapeHtml } = require('../utils/html-helpers');
const router = express.Router();

/**
 * Integrations Management Route - Main integrations interface
 * GET /integrations
 */
router.get('/', async (req, res) => {
    try {
        // Get IntegrationManager status for live connection info
        let managerStatus = {};
        try {
            if (req.integrationManager && typeof req.integrationManager.getStatus === 'function') {
                managerStatus = req.integrationManager.getStatus();
            }
        } catch (e) {
            req.app.locals?.loggers?.system?.warn('Integrations page: failed to get manager status:', e.message);
        }

        // Fetch real integrations from DAL when available
        let integrations = [];
        try {
            if (req.dal && typeof req.dal.getIntegrations === 'function') {
                const rows = await req.dal.getIntegrations();
                integrations = (rows || []).map(r => {
                    let cfg = {};
                    if (r.config) { try { cfg = JSON.parse(r.config); } catch (_) { cfg = {}; } }
                    
                    // Determine connected status from IntegrationManager OR database status
                    let connected = false;
                    const intType = (r.type || '').toLowerCase();
                    if (intType === 'homeassistant' && managerStatus.homeAssistant) {
                        connected = managerStatus.homeAssistant.connected === true;
                    } else if (intType === 'mqtt' && managerStatus.mqtt) {
                        connected = managerStatus.mqtt.connected === true;
                    } else if (intType === 'websocket' && managerStatus.websocket) {
                        connected = managerStatus.websocket.connected === true;
                    } else if (r.status === 'enabled' && r.last_sync) {
                        // If no live status but test succeeded recently, assume connected
                        // Database stores UTC via datetime('now'), compare UTC to UTC
                        // This is timezone-independent and handles DST correctly
                        const lastSyncUTC = new Date(r.last_sync + 'Z').getTime(); // Parse as UTC milliseconds
                        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);        // Current UTC milliseconds - 5 min
                        connected = lastSyncUTC > fiveMinutesAgo;
                        // Note: Display formatting uses user's timezone, but comparison stays in UTC
                    }
                    
                    // Format last_sync for display (if available)
                    let lastSyncDisplay = 'Never';
                    if (r.last_sync) {
                        try {
                            const lastSyncDate = new Date(r.last_sync + 'Z'); // Parse as UTC
                            const now = new Date();
                            const diffMs = now - lastSyncDate;
                            const diffMins = Math.floor(diffMs / 60000);
                            
                            if (diffMins < 1) {
                                lastSyncDisplay = 'Just now';
                            } else if (diffMins < 60) {
                                lastSyncDisplay = `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
                            } else if (diffMins < 1440) {
                                const hours = Math.floor(diffMins / 60);
                                lastSyncDisplay = `${hours} hour${hours !== 1 ? 's' : ''} ago`;
                            } else {
                                // For older syncs, show formatted date in user's timezone
                                lastSyncDisplay = lastSyncDate.toLocaleString('en-US', {
                                    timeZone: req.systemSettings?.timezone || 'America/Edmonton',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            }
                        } catch (e) {
                            lastSyncDisplay = 'Unknown';
                        }
                    }
                    
                    return {
                        ...r,
                        config: cfg,
                        enabled: r.enabled ? true : false,
                        connected: connected,
                        statusFromDb: r.status, // Pass through database status
                        lastActivity: lastSyncDisplay // Human-readable last sync time
                    };
                });
            }
        } catch (e) {
            req.app.locals?.loggers?.system?.warn('Integrations page: failed to load integrations from DAL:', e.message);
        }

        // Basic stats derived from real data (no mock data)
        // Query actual metrics from logs table
        let messagesToday = 0;
        let successRate = 100;
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayISO = todayStart.toISOString();
            
            // Count integration-related logs today
            const messageStats = await req.dal.get(
                `SELECT COUNT(*) as total, 
                 SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors 
                 FROM logs 
                 WHERE source LIKE '%integration%' AND timestamp >= ?`,
                [todayISO]
            );
            
            if (messageStats) {
                messagesToday = messageStats.total || 0;
                successRate = messageStats.total > 0 
                    ? Math.round(((messageStats.total - messageStats.errors) / messageStats.total) * 100)
                    : 100;
            }
        } catch (err) {
            req.app.locals?.loggers?.system?.warn('Failed to fetch integration metrics:', err.message);
        }
        
        const integrationStats = {
            total: integrations.length,
            active: integrations.filter(i => i.enabled).length,
            inactive: integrations.filter(i => !i.enabled).length,
            messagesToday,
            successRate
        };
        // Available types are derived dynamically from existing integrations (no hardcoded list)
        const availableTypes = Array.from(new Set((integrations || []).map(i => i.type).filter(Boolean))).sort();

        const contentBody = `
        <!-- Tab Navigation -->
        <div class="tab-navigation">
            <button class="tab-btn active" data-tab="health-monitor" onclick="switchTab('health-monitor')">
                <i class="fas fa-heartbeat"></i> Health Monitor
            </button>
            <button class="tab-btn" data-tab="custom-integrations" onclick="switchTab('custom-integrations')">
                <i class="fas fa-plug"></i> Add Integration
            </button>
        </div>

        <!-- Tab Content: Health Monitor -->
        <div id="health-monitor-tab" class="tab-content active">
            <div class="page-header">
                <div>
                    <h2 style="font-size: 1.5rem; margin: 0;"><i class="fas fa-heartbeat"></i> Integration Health Monitor</h2>
                    <p style="color: var(--text-muted); margin-top: 0.5rem;">Monitor and test all built-in system integrations</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="testAllHealthIntegrations()" class="btn">
                        <i class="fas fa-sync-alt"></i> Test All
                    </button>
                </div>
            </div>

            <div id="health-integrations-grid" class="grid" style="grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
                <div style="text-align: center; padding: 3rem; color: var(--text-muted); grid-column: 1 / -1;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                    <p>Loading integration health...</p>
                </div>
            </div>

            <!-- Health Integration Details Modal -->
            <div id="health-integration-modal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3 id="health-integration-modal-title"><i class="fas fa-info-circle"></i> Integration Details</h3>
                        <button onclick="closeModal('health-integration-modal')" class="btn-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="health-integration-details"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tab Content: Custom Integrations -->
        <div id="custom-integrations-tab" class="tab-content" style="display: none;">
            <!-- Integration Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-title">Active Integrations</div>
                        <div class="stat-icon">
                            <i class="fas fa-plug"></i>
                        </div>
                    </div>
                    <div class="stat-value">${integrations.filter(i => i.enabled).length}</div>
                    <div class="stat-label">of ${integrations.length} configured</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-title">Available Types</div>
                        <div class="stat-icon">
                            <i class="fas fa-cubes"></i>
                        </div>
                    </div>
                    <div class="stat-value">${availableTypes.length}</div>
                    <div class="stat-label">integration types</div>
                </div>
            </div>

            <!-- Configured Integrations -->
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-plug"></i> Configured Integrations</h3>
                    <div class="card-actions">
                        <button onclick="showIntegrationLibrary()" class="btn btn-secondary">
                            <i class="fas fa-th"></i> Browse Templates
                        </button>
                        <button onclick="showAddIntegration()" class="btn">
                            <i class="fas fa-plus"></i> Add Integration
                        </button>
                        <button onclick="refreshCustomIntegrations()" class="btn btn-secondary">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${integrations.length > 0 ? `
                    <div class="integrations-grid">
                        ${integrations.map(integration => `
                            <div class="integration-card" data-integration-id="${integration.id}">
                                <div class="integration-header">
                                    <div class="integration-info">
                                        <div class="integration-icon" style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, ${getIntegrationColor(integration.type)}20, ${getIntegrationColor(integration.type)}40); display: flex; align-items: center; justify-content: center;">
                                            <i class="${getIntegrationIcon(integration.type)}" style="font-size: 1.5rem; color: ${getIntegrationColor(integration.type)};"></i>
                                        </div>
                                        <div class="integration-details">
                                            <h4>${escapeHtml(integration.name)}</h4>
                                            <span class="integration-type">${integration.type.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <div class="integration-status">
                                        <span class="status-badge" style="background: ${getStatusColor(integration.enabled, integration.connected)}; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; color: white;">
                                            ${integration.enabled ? (integration.connected ? '<i class="fas fa-check-circle"></i> Connected' : '<i class="fas fa-exclamation-circle"></i> Connecting') : '<i class="fas fa-times-circle"></i> Disabled'}
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="integration-config" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <div>
                                        <div class="config-label" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Endpoint</div>
                                        <div class="config-value" style="font-weight: 600; color: var(--text-primary);">${integration.endpoint || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div class="config-label" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Messages Sent</div>
                                        <div class="config-value" style="font-weight: 600; color: var(--text-primary);">${integration.messagesSent || 0}</div>
                                    </div>
                                    <div>
                                        <div class="config-label" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Last Activity</div>
                                        <div class="config-value" style="font-size: 0.875rem;" title="${integration.last_sync ? 'Last sync: ' + formatTimestamp(integration.last_sync + 'Z') : 'Never synced'}">${integration.lastActivity || 'Never'}</div>
                                    </div>
                                    <div>
                                        <div class="config-label" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Success Rate</div>
                                        <div class="config-value" style="font-weight: 600; color: ${integration.successRate >= 90 ? '#10b981' : integration.successRate >= 70 ? '#f59e0b' : '#ef4444'};">${integration.successRate || 0}%</div>
                                    </div>
                                </div>
                                
                                <div class="integration-actions">
                                    <button onclick="testCustomIntegration(${integration.id})" class="btn-small" style="flex: 1; padding: 0.6rem; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; border-radius: 6px; transition: all 0.2s;" title="Test Integration">
                                        <i class="fas fa-play"></i> Test
                                    </button>
                                    <button onclick="editIntegration(${integration.id})" class="btn-small" style="flex: 1; padding: 0.6rem; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 6px; transition: all 0.2s;" title="Edit Integration">
                                        <i class="fas fa-edit"></i> Edit
                                    </button>
                                    <button onclick="viewIntegrationLogs(${integration.id})" class="btn-small" style="flex: 1; padding: 0.6rem; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; border-radius: 6px; transition: all 0.2s;" title="View Logs">
                                        <i class="fas fa-history"></i> Logs
                                    </button>
                                    <button onclick="toggleIntegration(${integration.id}, ${integration.enabled})" 
                                            class="btn-small" 
                                            style="padding: 0.6rem; background: linear-gradient(135deg, ${integration.enabled ? '#f59e0b' : '#10b981'} 0%, ${integration.enabled ? '#d97706' : '#059669'} 100%); color: white; border: none; border-radius: 6px; transition: all 0.2s;" 
                                            title="${integration.enabled ? 'Disable' : 'Enable'} Integration">
                                        <i class="fas fa-${integration.enabled ? 'pause' : 'play'}"></i>
                                    </button>
                                    <button onclick="deleteIntegration(${integration.id})" class="btn-small" style="padding: 0.6rem; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 6px; transition: all 0.2s;" title="Delete Integration">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : `
                    <div class="empty-state">
                        <i class="fas fa-plug"></i>
                        <p>No integrations configured yet.</p>
                        <button onclick="showAddIntegration()" class="btn">
                            <i class="fas fa-plus"></i> Add Your First Integration
                        </button>
                    </div>
                    `}
                </div>
            </div>

            <!-- Available Types (from existing integrations) -->
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-cubes"></i> Available Types</h3>
                </div>
                <div class="card-body">
                    ${availableTypes.length ? `
                    <div class="integration-features">
                        ${availableTypes.map(t => `<span class="feature-tag">${t}</span>`).join('')}
                    </div>
                    ` : `
                    <div class="empty-state small">
                        <p>No integration types configured yet.</p>
                    </div>
                    `}
                </div>
            </div>
        </div>

        <!-- Integration Form Modal -->
        <div id="integration-modal" class="modal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3><i class="fas fa-plug"></i> <span id="integration-modal-title">Add Integration</span></h3>
                    <button onclick="closeModal('integration-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="integration-form">
                        <input type="hidden" id="integration-id" name="id">
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="integration-name"><i class="fas fa-tag"></i> Name</label>
                                <input type="text" id="integration-name" name="name" class="form-control" 
                                       placeholder="Integration name..." required>
                                <small>A descriptive name for this integration</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="integration-type"><i class="fas fa-cubes"></i> Type</label>
                                <input list="integration-type-list" id="integration-type" name="type" class="form-control" required placeholder="e.g., webhook, mqtt" />
                                <datalist id="integration-type-list">
                                    ${availableTypes.map(t => `<option value="${t}"></option>`).join('')}
                                </datalist>
                            </div>
                        </div>
                        
                        <div id="integration-config-fields">
                            <div class="config-field-group">
                                <h4><i class="fas fa-code"></i> Configuration (JSON)</h4>
                                <textarea id="config-json" class="form-control" rows="8" placeholder="{\n  \"url\": \"https://example.com\"\n}"></textarea>
                                <small>Provide integration configuration as JSON. Stored exactly as provided.</small>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <div class="form-options">
                                <div class="form-option">
                                    <input type="checkbox" id="integration-enabled" name="enabled" checked>
                                    <label for="integration-enabled">Enabled</label>
                                </div>
                                <div class="form-option">
                                    <input type="checkbox" id="integration-verify-ssl" name="verifySsl" checked>
                                    <label for="integration-verify-ssl">Verify SSL</label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="btn">
                                <i class="fas fa-save"></i> <span id="integration-save-btn-text">Add Integration</span>
                            </button>
                            <button type="button" onclick="testIntegrationForm()" class="btn btn-secondary" id="integration-test-btn">
                                <i class="fas fa-play"></i> Test
                            </button>
                            <button type="button" onclick="closeModal('integration-modal')" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Integration Documentation Modal -->
        <div id="integration-docs-modal" class="modal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3><i class="fas fa-book"></i> Integration Documentation</h3>
                    <button onclick="closeModal('integration-docs-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="integration-docs-content">
                    <!-- Documentation content will be loaded here -->
                </div>
            </div>
        </div>

        <!-- Integration Library Modal -->
        <div id="integration-library-modal" class="modal" style="display: none;">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3><i class="fas fa-th"></i> Integration Templates</h3>
                    <button onclick="closeModal('integration-library-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                        Select an integration template to quickly configure popular services
                    </p>
                    <div id="integration-library-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;"></div>
                </div>
            </div>
        </div>
        `;

        // escapeHtml() imported from utils/html-helpers

        function formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(timestamp);
                return date.toLocaleString('en-US', {
                    timeZone: req.systemSettings.timezone || 'America/Edmonton',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            } catch (error) {
                return timestamp;
            }
        }

        function getIntegrationIcon(type) {
            const iconMap = {
                'slack': 'fab fa-slack',
                'discord': 'fab fa-discord',
                'teams': 'fab fa-microsoft',
                'email': 'fas fa-envelope',
                'sms': 'fas fa-sms',
                'webhook': 'fas fa-link',
                'mqtt': 'fas fa-network-wired',
                'syslog': 'fas fa-server',
                'elasticsearch': 'fas fa-search',
                'influxdb': 'fas fa-database',
                'grafana': 'fas fa-chart-line',
                'prometheus': 'fas fa-fire',
                'custom': 'fas fa-cogs'
            };
            return iconMap[type] || 'fas fa-plug';
        }

        function getIntegrationColor(type) {
            const colorMap = {
                'slack': '#4a154b',
                'discord': '#5865f2',
                'teams': '#6264a7',
                'email': '#ea4335',
                'sms': '#25d366',
                'webhook': '#3b82f6',
                'mqtt': '#8b5cf6',
                'syslog': '#6b7280',
                'elasticsearch': '#f59e0b',
                'influxdb': '#ef4444',
                'grafana': '#f46800',
                'prometheus': '#e6522c',
                'custom': '#6b7280'
            };
            return colorMap[type] || '#3b82f6';
        }

        function getStatusColor(enabled, connected) {
            if (!enabled) return '#6b7280'; // gray for disabled
            if (connected) return '#10b981'; // green for connected
            return '#f59e0b'; // orange for connecting
        }

        const additionalCSS = `
        /* Tab Navigation */
        .tab-navigation {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 2rem;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 0;
        }

        .tab-btn {
            padding: 1rem 2rem;
            background: transparent;
            border: none;
            border-bottom: 3px solid transparent;
            color: var(--text-muted);
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            bottom: -2px;
        }

        .tab-btn:hover {
            color: var(--text-primary);
            background: var(--bg-secondary);
        }

        .tab-btn.active {
            color: var(--accent-color);
            border-bottom-color: var(--accent-color);
            background: var(--bg-secondary);
        }

        .tab-content {
            animation: fadeIn 0.3s ease;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Integration Grid Styles */
        .integrations-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 1.5rem;
        }

        .integration-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }

        .integration-card:hover {
            background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .integration-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .integration-info {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .integration-icon {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            flex-shrink: 0;
        }

        .integration-details h4 {
            margin: 0 0 0.25rem 0;
            color: var(--text-primary);
            font-size: 1.1rem;
        }

        .integration-type {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }

        .integration-config {
            margin-bottom: 1rem;
        }

        .integration-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .available-integrations-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1rem;
        }

        .available-integration-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.2s ease;
        }

        .available-integration-card:hover {
            background: var(--bg-tertiary);
            transform: translateY(-1px);
        }

        .available-integration-icon {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: var(--gradient-ocean);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            margin-bottom: 1rem;
        }

        .available-integration-info h4 {
            margin: 0 0 0.5rem 0;
            color: var(--text-primary);
            font-size: 1rem;
        }

        .available-integration-info p {
            margin: 0 0 1rem 0;
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.4;
        }

        .integration-features {
            margin-bottom: 1rem;
        }

        .feature-tag {
            display: inline-block;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            margin-right: 0.5rem;
            margin-bottom: 0.25rem;
        }

        .available-integration-actions {
            display: flex;
            gap: 0.5rem;
        }

        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 1rem;
        }

        .form-options {
            display: flex;
            gap: 2rem;
            padding: 1rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .form-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .form-option input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }

        .form-option label {
            margin: 0;
            font-size: 0.95rem;
            cursor: pointer;
        }

        .config-field-group {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 1rem;
        }

        .config-field-group h4 {
            margin: 0 0 1rem 0;
            color: var(--text-primary);
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .test-result {
            margin-top: 1rem;
            padding: 1rem;
            border-radius: 8px;
            border-left: 4px solid var(--info-color);
            background: var(--bg-secondary);
        }

        .test-result.success {
            border-left-color: var(--success-color);
            background: rgba(16, 185, 129, 0.1);
        }

        .test-result.error {
            border-left-color: var(--error-color);
            background: rgba(239, 68, 68, 0.1);
        }

        .docs-content {
            line-height: 1.6;
        }

        .docs-content h4 {
            color: var(--text-primary);
            margin: 1.5rem 0 1rem 0;
        }

        .docs-content p {
            margin-bottom: 1rem;
            color: var(--text-secondary);
        }

        .docs-content code {
            background: var(--bg-tertiary);
            padding: 0.125rem 0.25rem;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .docs-content pre {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem;
            overflow-x: auto;
            margin: 1rem 0;
        }

        .docs-content ul {
            margin-left: 1.5rem;
            margin-bottom: 1rem;
        }

        .docs-content li {
            margin-bottom: 0.5rem;
            color: var(--text-secondary);
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .integrations-grid,
            .available-integrations-grid {
                grid-template-columns: 1fr;
            }
            
            .integration-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
            
            .form-row {
                grid-template-columns: 1fr;
            }
            
            .form-options {
                flex-direction: column;
                gap: 1rem;
            }
        }

        /* Modal Styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: var(--shadow-large);
        }

        .modal-content.large {
            max-width: 800px;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-secondary);
            border-radius: 12px 12px 0 0;
        }

        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1.25rem;
        }

        .btn-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--text-muted);
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 6px;
            transition: all 0.2s ease;
        }

        .btn-close:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .modal-body {
            padding: 1.5rem;
        }

        .modal-actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
            margin-top: 2rem;
        }

        body.modal-open {
            overflow: hidden;
        }
        `;

        const additionalJS = `
        // Tab Switching
        function switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('active');
                }
            });

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
                content.classList.remove('active');
            });
            
            const activeTab = document.getElementById(tabName + '-tab');
            if (activeTab) {
                activeTab.style.display = 'block';
                activeTab.classList.add('active');
            }

            // Load data for active tab
            if (tabName === 'health-monitor') {
                loadHealthIntegrations();
            } else if (tabName === 'custom-integrations') {
                // Data already loaded during page render
            }
        }

        // Health Monitor Functions
        let healthIntegrations = [];
        
        const integrationInfo = {
            mqtt: { name: 'MQTT Broker', icon: 'fa-share-alt', iconClass: 'fas', color: '#8b5cf6' },
            websocket: { name: 'WebSocket Server', icon: 'fa-broadcast-tower', iconClass: 'fas', color: '#3b82f6' },
            homeassistant: { name: 'Home Assistant', icon: 'fa-home', iconClass: 'fas', color: '#18bcf2' },
            home_assistant: { name: 'Home Assistant', icon: 'fa-home', iconClass: 'fas', color: '#18bcf2' },
            unifi: { name: 'UniFi Network', icon: 'fa-network-wired', iconClass: 'fas', color: '#0559C9' }
        };

        async function loadHealthIntegrations() {
            try {
                const response = await fetch('/integrations/api/health');
                const data = await response.json();
                healthIntegrations = Array.isArray(data) ? data : [];
                
                if (healthIntegrations.length === 0) {
                    await testAllHealthIntegrations(true);
                    const retryResponse = await fetch('/integrations/api/health');
                    const retryData = await retryResponse.json();
                    healthIntegrations = Array.isArray(retryData) ? retryData : [];
                }
                
                renderHealthIntegrations();
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Failed to load health integrations:', error);
                showToast('Failed to load integration health', 'error');
            }
        }

        function renderHealthIntegrations() {
            const container = document.getElementById('health-integrations-grid');
            if (!container) return;

            if (healthIntegrations.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted); grid-column: 1 / -1;">' +
                    '<i class="fas fa-plug" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>' +
                    '<p style="margin-bottom: 0.5rem;">No active integrations</p>' +
                    '<p style="font-size: 0.875rem;">Enable an integration in the Configured Integrations section above to see health status.</p>' +
                    '</div>';
                return;
            }

            const cards = healthIntegrations.map(integration => {
                const info = integrationInfo[integration.integration_name] || 
                           integrationInfo[integration.integration_name.toLowerCase()] ||
                           { name: integration.integration_name, icon: 'fa-plug', iconClass: 'fas', color: '#6b7280' };
                
                const statusColor = getHealthStatusColor(integration.status);
                const statusIcon = getHealthStatusIcon(integration.status);
                const responseTime = integration.response_time ? integration.response_time + 'ms' : 'N/A';
                const errorCount = integration.error_count || 0;
                const errorCountColor = errorCount === 0 ? '#10b981' : errorCount < 5 ? '#f59e0b' : '#ef4444';
                const lastCheck = integration.last_check_formatted || 'Never';
                const lastSuccess = integration.last_success_formatted || 'Never';

                let errorSection = '';
                if (integration.error_message) {
                    errorSection = '<div style="padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error-color); border-radius: 4px; margin-top: 1rem;">' +
                        '<div style="font-weight: 600; margin-bottom: 0.5rem; font-size: 0.875rem;">Latest Error:</div>' +
                        '<div style="font-size: 0.8rem; color: var(--error-color); font-family: monospace;">' + integration.error_message + '</div>' +
                    '</div>';
                }

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
                            '<button onclick="testHealthIntegration(\\'' + integration.integration_name + '\\')" class="btn" style="flex: 1; padding: 0.6rem;">' +
                                '<i class="fas fa-sync-alt"></i> Test' +
                            '</button>' +
                            '<button onclick="viewHealthIntegrationDetails(\\'' + integration.integration_name + '\\')" class="btn" style="flex: 1; padding: 0.6rem; background: var(--info-color);">' +
                                '<i class="fas fa-chart-line"></i> Details' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            
            container.innerHTML = cards.join('');
        }

        function getHealthStatusColor(status) {
            if (status === 'online') return '#10b981';
            if (status === 'degraded') return '#f59e0b';
            return '#ef4444';
        }

        function getHealthStatusIcon(status) {
            if (status === 'online') return 'check-circle';
            if (status === 'degraded') return 'exclamation-triangle';
            return 'times-circle';
        }

        async function testHealthIntegration(name) {
            showToast('Testing ' + name + '...', 'info');
            
            try {
                const response = await fetch('/integrations/api/health/' + name + '/test', { method: 'POST' });
                const data = await response.json();
                
                // API returns { success: true, result: { status: '...', message: '...' } }
                const testResult = data.result || data;
                const status = testResult.status || 'unknown';
                const message = testResult.message || status;
                
                showToast(name + ': ' + message, status === 'online' ? 'success' : 'error');
                loadHealthIntegrations();
            } catch (error) {
                console.error('Failed to test integration:', error);
                showToast('Failed to test integration', 'error');
            }
        }

        async function testAllHealthIntegrations(skipReload = false) {
            showToast('Testing all integrations...', 'info');
            
            try {
                const response = await fetch('/integrations/api/test-all', { method: 'POST' });
                if (!response.ok) {
                    // Endpoint doesn't exist yet, silently skip
                    if (!skipReload) {
                        loadHealthIntegrations();
                    }
                    return;
                }
                const results = await response.json();
                showToast('Integration tests completed', 'success');
                
                if (!skipReload) {
                    loadHealthIntegrations();
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Failed to test integrations:', error);
                // Don't show error toast on initial load
                if (!skipReload) {
                    loadHealthIntegrations();
                }
            }
        }

        async function viewHealthIntegrationDetails(name) {
            const integration = healthIntegrations.find(i => i.integration_name === name);
            if (!integration) return;

            const info = integrationInfo[name] || 
                        integrationInfo[name.toLowerCase()] ||
                        { name, icon: 'fa-plug', iconClass: 'fas', color: '#6b7280' };
            document.getElementById('health-integration-modal-title').innerHTML = '<i class="' + info.iconClass + ' ' + info.icon + '"></i> ' + info.name;

            const statusColor = getHealthStatusColor(integration.status);
            const errorSection = integration.error_message ? 
                '<div style="padding: 1rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error-color); border-radius: 4px; margin-top: 1rem;">' +
                    '<div style="font-weight: 600; margin-bottom: 0.5rem;">Latest Error:</div>' +
                    '<div style="font-size: 0.875rem; color: var(--error-color); font-family: monospace;">' + integration.error_message + '</div>' +
                '</div>' : '';
            
            document.getElementById('health-integration-details').innerHTML = 
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Status</div>' +
                        '<span class="status-badge" style="background: ' + statusColor + ';">' +
                            '<i class="fas fa-' + getHealthStatusIcon(integration.status) + '"></i> ' + integration.status +
                        '</span>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Response Time</div>' +
                        '<div style="font-weight: 600;">' + (integration.response_time || 'N/A') + 'ms</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Error Count</div>' +
                        '<div style="font-weight: 600;">' + (integration.error_count || 0) + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Last Check</div>' +
                        '<div>' + (integration.last_check_formatted || 'Never') + '</div>' +
                    '</div>' +
                    '<div style="grid-column: 1 / -1;">' +
                        '<div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Last Success</div>' +
                        '<div>' + (integration.last_success_formatted || 'Never') + '</div>' +
                    '</div>' +
                '</div>' +
                errorSection;

            openModal('health-integration-modal');
        }

        // Custom Integrations Functions
        function refreshCustomIntegrations() {
            window.location.reload();
        }

        // Integration Library/Templates
        const availableIntegrations = [
            {
                id: 'slack',
                name: 'Slack',
                category: 'Messaging',
                description: 'Send log notifications to Slack channels via webhooks',
                icon: 'fa-slack',
                iconClass: 'fab',
                color: '#4a154b',
                template: {
                    type: 'webhook',
                    url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'discord',
                name: 'Discord',
                category: 'Messaging',
                description: 'Post log alerts to Discord channels',
                icon: 'fa-discord',
                iconClass: 'fab',
                color: '#5865f2',
                template: {
                    type: 'webhook',
                    url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'teams',
                name: 'Microsoft Teams',
                category: 'Messaging',
                description: 'Send notifications to Teams channels',
                icon: 'fa-microsoft',
                iconClass: 'fab',
                color: '#6264a7',
                template: {
                    type: 'webhook',
                    url: 'https://outlook.office.com/webhook/YOUR_WEBHOOK_URL',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'email',
                name: 'Email Alerts',
                category: 'Notifications',
                description: 'Send log alerts via email using SMTP',
                icon: 'fa-envelope',
                iconClass: 'fas',
                color: '#ea4335',
                template: {
                    type: 'email',
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: false
                }
            },
            {
                id: 'elasticsearch',
                name: 'Elasticsearch',
                category: 'Analytics',
                description: 'Forward logs to Elasticsearch for analysis',
                icon: 'fa-search',
                iconClass: 'fas',
                color: '#f59e0b',
                template: {
                    type: 'elasticsearch',
                    url: 'http://localhost:9200',
                    index: 'logs'
                }
            },
            {
                id: 'grafana',
                name: 'Grafana Loki',
                category: 'Analytics',
                description: 'Stream logs to Grafana Loki for visualization',
                icon: 'fa-chart-line',
                iconClass: 'fas',
                color: '#f46800',
                template: {
                    type: 'loki',
                    url: 'http://localhost:3100/loki/api/v1/push'
                }
            },
            {
                id: 'mqtt-custom',
                name: 'MQTT Broker',
                category: 'IoT',
                description: 'Publish logs to MQTT topics',
                icon: 'fa-network-wired',
                iconClass: 'fas',
                color: '#8b5cf6',
                template: {
                    type: 'mqtt',
                    broker: 'mqtt://localhost:1883',
                    topic: 'logs/events'
                }
            },
            {
                id: 'webhook-custom',
                name: 'Custom Webhook',
                category: 'Custom',
                description: 'Send logs to any HTTP endpoint',
                icon: 'fa-link',
                iconClass: 'fas',
                color: '#3b82f6',
                template: {
                    type: 'webhook',
                    url: 'https://example.com/webhook',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }
            },
            {
                id: 'homeassistant',
                name: 'Home Assistant',
                category: 'Smart Home',
                description: 'Integrate with Home Assistant for home automation logging',
                icon: 'fa-home',
                iconClass: 'fas',
                color: '#18bcf2',
                template: {
                    type: 'homeassistant',
                    url: 'http://homeassistant.local:8123',
                    token: 'YOUR_LONG_LIVED_ACCESS_TOKEN',
                    webhook_id: 'YOUR_WEBHOOK_ID'
                }
            },
            {
                id: 'unifi',
                name: 'UniFi Controller',
                category: 'Network',
                description: 'Monitor UniFi network devices and events',
                icon: 'fa-network-wired',
                iconClass: 'fas',
                color: '#0559C9',
                template: {
                    type: 'unifi',
                    url: 'https://unifi.local:8443',
                    username: 'admin',
                    password: 'YOUR_PASSWORD',
                    site: 'default'
                }
            },
            {
                id: 'influxdb',
                name: 'InfluxDB',
                category: 'Time Series',
                description: 'Store logs in InfluxDB time-series database',
                icon: 'fa-database',
                iconClass: 'fas',
                color: '#ef4444',
                template: {
                    type: 'influxdb',
                    url: 'http://localhost:8086',
                    token: 'YOUR_API_TOKEN',
                    org: 'my-org',
                    bucket: 'logs'
                }
            },
            {
                id: 'prometheus',
                name: 'Prometheus',
                category: 'Monitoring',
                description: 'Export metrics to Prometheus for monitoring',
                icon: 'fa-fire',
                iconClass: 'fas',
                color: '#e6522c',
                template: {
                    type: 'prometheus',
                    url: 'http://localhost:9090',
                    job: 'logging-server'
                }
            },
            {
                id: 'splunk',
                name: 'Splunk',
                category: 'SIEM',
                description: 'Forward logs to Splunk for enterprise security',
                icon: 'fa-shield-alt',
                iconClass: 'fas',
                color: '#000000',
                template: {
                    type: 'splunk',
                    url: 'https://splunk.local:8088',
                    token: 'YOUR_HEC_TOKEN',
                    index: 'main'
                }
            },
            {
                id: 'datadog',
                name: 'Datadog',
                category: 'Monitoring',
                description: 'Send logs to Datadog APM and monitoring',
                icon: 'fa-dog',
                iconClass: 'fas',
                color: '#632ca6',
                template: {
                    type: 'datadog',
                    api_key: 'YOUR_API_KEY',
                    site: 'datadoghq.com',
                    service: 'logging-server'
                }
            },
            {
                id: 'newrelic',
                name: 'New Relic',
                category: 'Monitoring',
                description: 'Stream logs to New Relic observability platform',
                icon: 'fa-chart-area',
                iconClass: 'fas',
                color: '#008c99',
                template: {
                    type: 'newrelic',
                    url: 'https://log-api.newrelic.com/log/v1',
                    api_key: 'YOUR_LICENSE_KEY'
                }
            },
            {
                id: 'pagerduty',
                name: 'PagerDuty',
                category: 'Incident Management',
                description: 'Create incidents in PagerDuty for critical logs',
                icon: 'fa-bell',
                iconClass: 'fas',
                color: '#06ac38',
                template: {
                    type: 'pagerduty',
                    integration_key: 'YOUR_INTEGRATION_KEY',
                    severity: 'error'
                }
            },
            {
                id: 'telegram',
                name: 'Telegram Bot',
                category: 'Messaging',
                description: 'Send log alerts via Telegram bot',
                icon: 'fa-telegram',
                iconClass: 'fab',
                color: '#0088cc',
                template: {
                    type: 'telegram',
                    bot_token: 'YOUR_BOT_TOKEN',
                    chat_id: 'YOUR_CHAT_ID'
                }
            },
            {
                id: 'pushover',
                name: 'Pushover',
                category: 'Notifications',
                description: 'Send push notifications for important logs',
                icon: 'fa-mobile-alt',
                iconClass: 'fas',
                color: '#f59e0b',
                template: {
                    type: 'pushover',
                    user_key: 'YOUR_USER_KEY',
                    api_token: 'YOUR_API_TOKEN'
                }
            },
            {
                id: 'syslog',
                name: 'Syslog Server',
                category: 'Syslog',
                description: 'Forward logs to external syslog server',
                icon: 'fa-server',
                iconClass: 'fas',
                color: '#6b7280',
                template: {
                    type: 'syslog',
                    host: 'syslog.example.com',
                    port: 514,
                    protocol: 'udp',
                    facility: 'local0'
                }
            }
        ];

        function showIntegrationLibrary() {
            renderIntegrationLibrary();
            openModal('integration-library-modal');
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
                                    <h4 style="margin: 0; font-size: 1.05rem;">\${integration.name}</h4>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">\${integration.category}</span>
                                </div>
                            </div>
                            <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0 0 1rem 0;">\${integration.description}</p>
                            <div style="display: flex; align-items: center; gap: 0.5rem; color: \${integration.color}; font-size: 0.875rem; font-weight: 600;">
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

            closeModal('integration-library-modal');
            
            // Pre-fill the integration form with template data
            document.getElementById('integration-modal-title').textContent = 'Add ' + integration.name;
            document.getElementById('integration-save-btn-text').textContent = 'Add Integration';
            document.getElementById('integration-form').reset();
            document.getElementById('integration-id').value = '';
            document.getElementById('integration-name').value = integration.name;
            document.getElementById('integration-type').value = integration.template.type;
            document.getElementById('integration-enabled').checked = true;
            document.getElementById('integration-verify-ssl').checked = true;
            
            // Pre-fill config JSON
            const configObj = { ...integration.template };
            delete configObj.type; // Type is in separate field
            document.getElementById('config-json').value = JSON.stringify(configObj, null, 2);
            
            openModal('integration-modal');
            showToast('Template loaded! Complete the configuration and save.', 'info');
        }

        // Show add integration modal
        function showAddIntegration() {
            document.getElementById('integration-modal-title').textContent = 'Add Integration';
            document.getElementById('integration-save-btn-text').textContent = 'Add Integration';
            document.getElementById('integration-form').reset();
            document.getElementById('integration-id').value = '';
            document.getElementById('integration-enabled').checked = true;
            document.getElementById('integration-verify-ssl').checked = true;
            const cfg = document.getElementById('config-json');
            if (cfg) cfg.value = '';
            openModal('integration-modal');
        }

        // Open modal helper
        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'flex';
                document.body.classList.add('modal-open');
            }
        }
        
        // Close modal helper
        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }

        // Get field icon based on type
        function getFieldIcon(type) {
            const iconMap = {
                'url': 'link',
                'email': 'envelope',
                'password': 'key',
                'text': 'font',
                'number': 'hashtag',
                'select': 'list',
                'textarea': 'align-left'
            };
            return iconMap[type] || 'cog';
        }

        // Edit existing integration
        async function editIntegration(integrationId) {
            try {
                const response = await fetch(\`/api/integrations/\${integrationId}\`);
                if (response.ok) {
                    const integration = await response.json();
                    
                    document.getElementById('integration-modal-title').textContent = 'Edit Integration';
                    document.getElementById('integration-save-btn-text').textContent = 'Update Integration';
                    
                    document.getElementById('integration-id').value = integration.id;
                    document.getElementById('integration-name').value = integration.name;
                    document.getElementById('integration-type').value = integration.type;
                    document.getElementById('integration-enabled').checked = integration.enabled;
                    document.getElementById('integration-verify-ssl').checked = integration.verifySsl !== false;
                    // Populate JSON config
                    try {
                        const cfgEl = document.getElementById('config-json');
                        if (cfgEl) cfgEl.value = JSON.stringify(integration.config || {}, null, 2);
                    } catch(_) { /* Config stringify non-critical */ }
                    
                    openModal('integration-modal');
                } else {
                    throw new Error('Failed to load integration');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Edit integration error:', error);
                showToast('Failed to load integration details', 'error');
            }
        }

        // Handle integration form submission
        document.getElementById('integration-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const integrationData = {
                name: formData.get('name'),
                type: formData.get('type'),
                enabled: document.getElementById('integration-enabled').checked,
                verifySsl: document.getElementById('integration-verify-ssl').checked,
                config: {}
            };
            // Read JSON config
            const cfgEl = document.getElementById('config-json');
            const raw = (cfgEl && cfgEl.value || '').trim();
            if (raw) {
                try { integrationData.config = JSON.parse(raw); }
                catch (e) { showToast('Config JSON is invalid: ' + e.message, 'error'); return; }
            }
            
            const integrationId = document.getElementById('integration-id').value;
            const isEdit = !!integrationId;
            
            if (isEdit) {
                integrationData.id = integrationId;
            }
            
            const url = isEdit ? \`/api/integrations/\${integrationId}\` : '/api/integrations';
            const method = isEdit ? 'PUT' : 'POST';
            
            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(integrationData)
                });
                
                if (response.ok) {
                    showToast(\`Integration \${isEdit ? 'updated' : 'created'} successfully\`, 'success');
                    closeModal('integration-modal');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to save integration');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Save integration error:', error);
                showToast(error.message, 'error');
            }
        });

        // Test integration
        async function testCustomIntegration(integrationId) {
            try {
                showToast('Testing integration...', 'info');
                const response = await fetch(\`/integrations/api/\${integrationId}/test\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showToast('Integration test successful', 'success');
                    // Reload the page to show updated status
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showToast(\`Integration test failed: \${result.error || 'Unknown error'}\`, 'error');
                    setTimeout(() => location.reload(), 1500);
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Test integration error:', error);
                showToast('Failed to test integration', 'error');
            }
        }

        // Test integration from form
        async function testIntegrationForm() {
            const form = document.getElementById('integration-form');
            const formData = new FormData(form);
            const testData = {
                type: formData.get('type'),
                config: {}
            };
            // Read JSON config
            const cfgEl = document.getElementById('config-json');
            const raw = (cfgEl && cfgEl.value || '').trim();
            if (raw) {
                try { testData.config = JSON.parse(raw); }
                catch (e) { showToast('Config JSON is invalid: ' + e.message, 'error'); return; }
            }
            
            if (!testData.type) {
                showToast('Please select an integration type first', 'warning');
                return;
            }
            
            try {
                document.getElementById('integration-test-btn').disabled = true;
                document.getElementById('integration-test-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
                
                const response = await fetch('/integrations/api/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testData)
                });
                
                const result = await response.json();
                
                // Show test result in form
                let existingResult = document.querySelector('.test-result');
                if (existingResult) {
                    existingResult.remove();
                }
                
                const resultDiv = document.createElement('div');
                resultDiv.className = \`test-result \${result.success ? 'success' : 'error'}\`;
                resultDiv.innerHTML = \`
                    <h5><i class="fas fa-\${result.success ? 'check-circle' : 'times-circle'}"></i> Test Result</h5>
                    <p><strong>Status:</strong> \${result.success ? 'Success' : 'Failed'}</p>
                    \${result.message ? \`<p><strong>Message:</strong> \${result.message}</p>\` : ''}
                    \${result.error ? \`<p><strong>Error:</strong> \${result.error}</p>\` : ''}
                \`;
                
                const modalActions = document.querySelector('.modal-actions');
                modalActions.parentNode.insertBefore(resultDiv, modalActions);
                
                if (result.success) {
                    showToast('Integration test successful', 'success');
                } else {
                    showToast(\`Integration test failed: \${result.error || 'Unknown error'}\`, 'error');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Test integration error:', error);
                showToast('Failed to test integration', 'error');
            } finally {
                document.getElementById('integration-test-btn').disabled = false;
                document.getElementById('integration-test-btn').innerHTML = '<i class="fas fa-play"></i> Test';
            }
        }

        // Toggle integration enabled status
        async function toggleIntegration(integrationId, currentStatus) {
            const action = currentStatus ? 'disable' : 'enable';
            
            if (!confirm(\`Are you sure you want to \${action} this integration?\`)) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/integrations/\${integrationId}/toggle\`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showToast(\`Integration \${action}d successfully\`, 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error(\`Failed to \${action} integration\`);
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Toggle integration error:', error);
                showToast(error.message, 'error');
            }
        }

        // Delete integration
        async function deleteIntegration(integrationId) {
            if (!confirm('Are you sure you want to delete this integration? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/integrations/\${integrationId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showToast('Integration deleted successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error('Failed to delete integration');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Delete integration error:', error);
                showToast('Failed to delete integration', 'error');
            }
        }

        // View integration logs
        function viewIntegrationLogs(integrationId) {
            window.open(\`/integrations/logs/\${integrationId}\`, '_blank');
        }

        // View integration documentation
        async function viewIntegrationDocs(type) {
            try {
                showLoading('integration-docs-content');
                openModal('integration-docs-modal');
                
                const response = await fetch(\`/api/integrations/docs/\${type}\`);
                if (response.ok) {
                    const docs = await response.json();
                    displayIntegrationDocs(docs);
                } else {
                    throw new Error('Failed to load documentation');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('View docs error:', error);
                showError('integration-docs-content', 'Failed to load documentation');
            }
        }

        // Display integration documentation
        function displayIntegrationDocs(docs) {
            const content = document.getElementById('integration-docs-content');
            
            content.innerHTML = \`
                <div class="docs-content">
                    <h4>Setup Instructions</h4>
                    <p>\${docs.description}</p>
                    
                    <h4>Configuration</h4>
                    <ul>
                        \${docs.configFields.map(field => \`
                            <li><strong>\${field.label}:</strong> \${field.description}</li>
                        \`).join('')}
                    </ul>
                    
                    \${docs.examples ? \`
                        <h4>Examples</h4>
                        <pre><code>\${docs.examples}</code></pre>
                    \` : ''}
                    
                    \${docs.notes ? \`
                        <h4>Additional Notes</h4>
                        <p>\${docs.notes}</p>
                    \` : ''}
                </div>
            \`;
        }

        // Refresh integrations
        function refreshIntegrations() {
            location.reload();
        }

        // Initialize page - load health integrations on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadHealthIntegrations();
        });
        `;

        const html = getPageTemplate({
            pageTitle: 'Integrations',
            pageIcon: 'fa-plug',
            activeNav: 'integrations',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Integrations route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Integration Logs View Route
 * GET /integrations/logs/:id
 * Shows filtered logs for a specific integration
 */
router.get('/logs/:id', async (req, res) => {
    try {
        const integrationId = req.params.id;
        
        // Get integration details
        let integrationName = 'Unknown Integration';
        let integrationSource = null;
        
        try {
            const integration = await req.dal.get(
                'SELECT * FROM integration_health WHERE id = ?',
                [integrationId]
            );
            
            if (integration) {
                integrationName = integration.integration_name;
                integrationSource = integration.integration_name.toLowerCase().replace(/\s+/g, '_');
            }
        } catch (e) {
            req.app.locals?.loggers?.system?.warn('Could not load integration details:', e.message);
        }

        // Build the content body with filtered logs view
        const contentBody = `
            <div class="page-header d-flex justify-content-between align-items-start">
                <div>
                    <h2><i class="fas fa-list"></i> Logs for ${escapeHtml(integrationName)}</h2>
                    <p class="text-muted">Integration ID: ${escapeHtml(integrationId)}</p>
                </div>
                <a href="/integrations" class="btn btn-secondary">
                    <i class="fas fa-arrow-left"></i> Back to Integrations
                </a>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="card-title mb-0">
                        <i class="fas fa-filter"></i> Filters
                    </h5>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Date Range</label>
                            <select class="form-select" id="dateRange">
                                <option value="1h">Last Hour</option>
                                <option value="24h" selected>Last 24 Hours</option>
                                <option value="7d">Last 7 Days</option>
                                <option value="30d">Last 30 Days</option>
                                <option value="custom">Custom Range</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Log Level</label>
                            <select class="form-select" id="logLevel">
                                <option value="">All Levels</option>
                                <option value="debug">Debug</option>
                                <option value="info">Info</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Search</label>
                            <input type="text" class="form-control" id="searchQuery" placeholder="Search in messages...">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">&nbsp;</label>
                            <button class="btn btn-primary w-100" onclick="loadLogs()">
                                <i class="fas fa-search"></i> Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="card-title mb-0">
                        <i class="fas fa-stream"></i> Log Entries
                    </h5>
                    <div>
                        <button class="btn btn-sm btn-outline-secondary" onclick="exportLogs()">
                            <i class="fas fa-download"></i> Export
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="loadLogs()">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="logsContainer">
                        <div class="text-center py-5">
                            <div class="spinner-border" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <p class="text-muted mt-2">Loading logs...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const additionalCSS = `
            .log-entry {
                padding: 10px;
                border-bottom: 1px solid #dee2e6;
                font-family: 'Courier New', monospace;
                font-size: 0.9rem;
            }
            .log-entry:hover {
                background-color: #f8f9fa;
            }
            .log-timestamp {
                color: #6c757d;
                margin-right: 10px;
            }
            .log-level {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 3px;
                font-weight: bold;
                font-size: 0.75rem;
                margin-right: 10px;
            }
            .log-level-debug { background-color: #6c757d; color: white; }
            .log-level-info { background-color: #0dcaf0; color: white; }
            .log-level-warning { background-color: #ffc107; color: black; }
            .log-level-error { background-color: #dc3545; color: white; }
            .log-level-critical { background-color: #6f42c1; color: white; }
            .log-message {
                word-wrap: break-word;
            }
            .no-logs {
                text-align: center;
                padding: 40px;
                color: #6c757d;
            }
        `;

        const additionalJS = `
            const integrationId = ${integrationId};
            const integrationSource = ${integrationSource ? `'${escapeHtml(integrationSource)}'` : 'null'};

            // Load logs based on current filters
            async function loadLogs() {
                try {
                    const container = document.getElementById('logsContainer');
                    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div></div>';

                    const dateRange = document.getElementById('dateRange').value;
                    const logLevel = document.getElementById('logLevel').value;
                    const searchQuery = document.getElementById('searchQuery').value;

                    // Build query parameters
                    const params = new URLSearchParams();
                    if (integrationSource) params.append('source', integrationSource);
                    if (logLevel) params.append('level', logLevel);
                    if (searchQuery) params.append('search', searchQuery);
                    params.append('limit', '100');

                    // Calculate date range
                    const now = new Date();
                    let startDate;
                    switch(dateRange) {
                        case '1h':
                            startDate = new Date(now.getTime() - 60 * 60 * 1000);
                            break;
                        case '24h':
                            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                            break;
                        case '7d':
                            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                            break;
                        case '30d':
                            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                            break;
                    }
                    if (startDate) {
                        params.append('start_date', startDate.toISOString());
                    }

                    const response = await fetch('/api/logs?' + params.toString());
                    if (!response.ok) throw new Error('Failed to load logs');

                    const data = await response.json();
                    displayLogs(data.logs || []);
                } catch (error) {
                    console.error('Load logs error:', error);
                    document.getElementById('logsContainer').innerHTML = 
                        '<div class="alert alert-danger">Failed to load logs</div>';
                }
            }

            // Display logs in the container
            function displayLogs(logs) {
                const container = document.getElementById('logsContainer');
                
                if (!logs || logs.length === 0) {
                    container.innerHTML = '<div class="no-logs"><i class="fas fa-inbox fa-3x mb-3"></i><p>No logs found</p></div>';
                    return;
                }

                const logsHtml = logs.map(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString();
                    const level = (log.level || 'info').toLowerCase();
                    return \`
                        <div class="log-entry">
                            <span class="log-timestamp">\${timestamp}</span>
                            <span class="log-level log-level-\${level}">\${level.toUpperCase()}</span>
                            <span class="log-message">\${escapeHtml(log.message || '')}</span>
                        </div>
                    \`;
                }).join('');

                container.innerHTML = logsHtml;
            }

            // Export logs to CSV
            function exportLogs() {
                const dateRange = document.getElementById('dateRange').value;
                const logLevel = document.getElementById('logLevel').value;
                const searchQuery = document.getElementById('searchQuery').value;

                const params = new URLSearchParams();
                if (integrationSource) params.append('source', integrationSource);
                if (logLevel) params.append('level', logLevel);
                if (searchQuery) params.append('search', searchQuery);
                params.append('format', 'csv');
                params.append('limit', '10000');

                window.location.href = '/api/logs/export?' + params.toString();
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            // Load logs on page load
            document.addEventListener('DOMContentLoaded', () => {
                loadLogs();
            });
        `;

        const html = getPageTemplate({
            pageTitle: `Logs - ${integrationName}`,
            pageIcon: 'fa-list',
            activeNav: 'integrations',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Integration logs view error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Routes for Integration Management
 */

// Get integration health status - ONLY show enabled integrations from integrations table
router.get('/api/health', async (req, res) => {
    try {
        // Get IntegrationManager status for live connection info
        let managerStatus = {};
        try {
            if (req.integrationManager && typeof req.integrationManager.getStatus === 'function') {
                managerStatus = req.integrationManager.getStatus();
            }
        } catch (e) {
            req.app.locals?.loggers?.system?.warn('Health API: failed to get manager status:', e.message);
        }

        // Get list of ALL integrations from the integrations table (custom configured ones)
        const enabledIntegrations = await req.dal.all(
            'SELECT id, name, type, config, status, enabled, last_sync, error_count, last_error, created_at, updated_at FROM integrations WHERE enabled = 1'
        ) || [];
        
        // If no enabled integrations, return empty array
        if (enabledIntegrations.length === 0) {
            return res.json([]);
        }
        
        // Get health data
        const healthData = await req.dal.all(
            'SELECT * FROM integration_health ORDER BY integration_name'
        ) || [];
        
        // Format timestamps
        const moment = require('moment-timezone');
        const TIMEZONE = req.systemSettings?.timezone || 'America/Edmonton';
        
        // Create a map of health data by integration_name
        const healthMap = new Map();
        healthData.forEach(h => {
            healthMap.set((h.integration_name || '').toLowerCase(), h);
        });
        
        // Build result based on ENABLED integrations, using health data if available
        const processedIntegrations = enabledIntegrations.map(integration => {
            const nameKey = (integration.name || '').toLowerCase().replace(/\\s+/g, '_');
            const typeKey = (integration.type || '').toLowerCase();
            
            // Try to find matching health record by name or type
            const health = healthMap.get(nameKey) || healthMap.get(typeKey) || null;
            
            // Get live status from IntegrationManager if available
            let liveStatus = null;
            if (typeKey === 'homeassistant' && managerStatus.homeAssistant) {
                liveStatus = managerStatus.homeAssistant.connected ? 'online' : 'offline';
            } else if (typeKey === 'mqtt' && managerStatus.mqtt) {
                liveStatus = managerStatus.mqtt.connected ? 'online' : 'offline';
            } else if (typeKey === 'websocket' && managerStatus.websocket) {
                liveStatus = managerStatus.websocket.connected ? 'online' : 'offline';
            }
            
            // Determine status: live status from IntegrationManager OR database status OR health table
            let finalStatus = 'unknown';
            if (liveStatus) {
                finalStatus = liveStatus; // Live connection status (most accurate)
            } else if (integration.status && integration.status !== 'disabled') {
                // Use database status from last test
                finalStatus = integration.status === 'enabled' ? 'online' : integration.status === 'error' ? 'offline' : 'unknown';
            } else if (health?.status) {
                finalStatus = health.status;
            }
            
            const baseData = {
                id: health?.id || integration.id,
                integration_name: nameKey,
                integration_display_name: integration.name,
                integration_type: integration.type,
                status: finalStatus,
                last_check: integration.last_sync || health?.last_check || integration.updated_at,
                response_time: health?.response_time || 0,
                error_count: integration.error_count || health?.error_count || 0,
                last_error: integration.last_error || health?.last_error || null,
                uptime_percentage: health?.uptime_percentage || 100,
                last_success: integration.last_sync || health?.last_success || null,
                metadata: {
                    enabled: true,
                    type: integration.type,
                    description: integration.name + ' integration'
                },
                created_at: health?.created_at || integration.created_at,
                updated_at: health?.updated_at || integration.updated_at
            };
            
            return {
                ...baseData,
                last_check_formatted: baseData.last_check ? 
                    moment.utc(baseData.last_check).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A') : null,
                last_success_formatted: baseData.last_success ? 
                    moment.utc(baseData.last_success).tz(TIMEZONE).format('MM/DD/YYYY, hh:mm:ss A') : null
            };
        });
        
        res.json(processedIntegrations);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get integration health API error:', error);
        res.status(500).json({ error: 'Failed to get integration health' });
    }
});

// Test all integrations health - ONLY test enabled integrations
router.post('/api/test-all', async (req, res) => {
    const start = Date.now();
    try {
        // Only get enabled integrations
        const allRows = await req.dal.getIntegrations();
        const rows = (allRows || []).filter(r => r.enabled);
        
        if (rows.length === 0) {
            return res.json({
                success: true,
                total: 0,
                online: 0,
                offline: 0,
                unconfigured: 0,
                errors: 0,
                averageLatencyMs: 0,
                durationMs: Date.now() - start,
                results: [],
                message: 'No active integrations to test'
            });
        }
        
        const tests = rows.map(r => performIntegrationTest(r, req));
        const settled = await Promise.allSettled(tests);
        const results = settled.map((s, idx) => {
            const base = rows[idx];
            if (s.status === 'fulfilled') return s.value;
            return {
                id: base.id,
                name: base.name,
                type: base.type,
                status: 'error',
                latencyMs: Date.now() - start,
                testedAt: new Date().toISOString(),
                message: 'Integration test failed',
                error: s.reason?.message || String(s.reason)
            };
        });
        const online = results.filter(r => r.status === 'online').length;
        const offline = results.filter(r => r.status === 'offline').length;
        const unconfigured = results.filter(r => r.status === 'unconfigured').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const avgLatency = results.length ? Math.round(results.reduce((a, r) => a + (r.latencyMs || 0), 0) / results.length) : 0;
        res.json({
            success: true,
            total: results.length,
            online,
            offline,
            unconfigured,
            errors: errorCount,
            averageLatencyMs: avgLatency,
            durationMs: Date.now() - start,
            results
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Test all integrations error:', error);
        res.status(500).json({ success: false, error: 'Failed to test integrations' });
    }
});

// Test health integration by name (for built-in integrations)
router.post('/api/health/:name/test', async (req, res) => {
    const start = Date.now();
    try {
        const name = req.params.name.toLowerCase();
        const rows = await req.dal.getIntegrations();
        const target = (rows || []).find(r => (r.name || '').toLowerCase() === name);
        if (!target) return res.status(404).json({ success: false, error: 'Integration not found' });
        const result = await performIntegrationTest(target, req, start);
        
        // Save the test result to the integrations table (primary source)
        const newStatus = result.status === 'online' ? 'enabled' : 'error';
        try {
            await req.dal.run(
                `UPDATE integrations 
                 SET status = ?,
                     last_sync = CASE WHEN ? = 'online' THEN CURRENT_TIMESTAMP ELSE last_sync END,
                     error_count = CASE WHEN ? != 'online' THEN error_count + 1 ELSE 0 END,
                     last_error = CASE WHEN ? != 'online' THEN ? ELSE NULL END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE name = ?`,
                [newStatus, result.status, result.status, result.status, result.message || '', target.name]
            );
            
            // Also update integration_health table for consistency
            await req.dal.run(
                `UPDATE integration_health 
                 SET status = ?, 
                     last_check = CURRENT_TIMESTAMP,
                     response_time = ?,
                     last_success = CASE WHEN ? = 'online' THEN CURRENT_TIMESTAMP ELSE last_success END,
                     error_count = CASE WHEN ? != 'online' THEN error_count + 1 ELSE 0 END,
                     last_error = ?
                 WHERE integration_name = ?`,
                [result.status, result.latencyMs || 0, result.status, result.status, result.message || '', name]
            );
            
            req.app.locals?.loggers?.system?.info(`Integration ${name} tested: ${result.status} - ${result.message}`);
        } catch (dbError) {
            req.app.locals?.loggers?.system?.warn('Failed to update health status:', dbError.message);
        }
        
        res.json({ success: true, result });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Test health integration API error:', error);
        res.status(500).json({ success: false, error: 'Failed to test integration' });
    }
});

// Test integration from form data (STATIC - must be before /api/:id routes)
router.post('/api/test', async (req, res) => {
    try {
        const { type, config } = req.body;
        
        if (!type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Integration type is required' 
            });
        }
        
        // Load test helpers
        const testHelpers = require('../integration-test-helpers');
        
        // Perform actual integration testing based on type
        let testResult = { success: false, message: '', details: {} };
        
        switch (type.toLowerCase()) {
            case 'webhook':
                testResult = await testHelpers.testWebhook(config);
                break;
            case 'homeassistant':
            case 'home_assistant':
                testResult = await testHelpers.testHomeAssistant(config);
                break;
            case 'mqtt':
                testResult = await testHelpers.testMQTT(config);
                break;
            case 'unifi':
                testResult = await testHelpers.testUniFi(config);
                break;
            case 'slack':
            case 'discord':
            case 'teams':
            case 'telegram':
            case 'pushover':
                testResult = await testHelpers.testWebhookBased(type, config);
                break;
            case 'elasticsearch':
            case 'influxdb':
            case 'grafana':
            case 'prometheus':
            case 'splunk':
            case 'datadog':
            case 'newrelic':
                testResult = await testHelpers.testHTTPEndpoint(type, config);
                break;
            default:
                // Generic integration test - attempt basic connectivity
                try {
                    if (config.url) {
                        const response = await fetch(config.url, { method: 'HEAD', timeout: 5000 });
                        testResult = {
                            success: response.ok,
                            message: response.ok ? 'Endpoint reachable' : `HTTP ${response.status}`,
                            details: { type, status: response.status, url: config.url }
                        };
                    } else {
                        testResult = {
                            success: false,
                            message: 'No test URL configured for this integration type',
                            details: { type, note: 'Add "url" field to config for connectivity test' }
                        };
                    }
                } catch (err) {
                    testResult = {
                        success: false,
                        message: `Connection failed: ${err.message}`,
                        details: { type, error: err.message }
                    };
                }
        }
        
        res.json(testResult);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Test integration data API error:', error);
        res.status(500).json({ 
            success: false,
            error: `Failed to test integration: ${error.message}` 
        });
    }
});

// ---- Helper Functions ----
async function performIntegrationTest(integration, req, startOverride) {
    const started = startOverride || Date.now();
    const safeParse = (cfg) => { if (!cfg) return {}; try { return typeof cfg === 'string' ? JSON.parse(cfg) : cfg; } catch { return {}; } };
    const config = safeParse(integration.config);
    const type = (integration.type || '').toLowerCase();
    const common = {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        testedAt: new Date().toISOString()
    };
    if (integration.enabled === 0 || integration.status === 'disabled') {
        return { ...common, status: 'offline', latencyMs: Date.now() - started, message: 'Integration disabled' };
    }
    // Determine test logic by type
    try {
        // Check specific integration types FIRST, before generic URL check
        if (type === 'home_assistant' || type === 'homeassistant') {
            // Check IntegrationManager status first for live status
            let managerStatus = null;
            try {
                if (req.integrationManager && typeof req.integrationManager.getStatus === 'function') {
                    managerStatus = req.integrationManager.getStatus()?.homeAssistant;
                }
            } catch (e) { /* ignore */ }
            
            if (managerStatus && managerStatus.connected === true) {
                return { 
                    ...common, 
                    status: 'online', 
                    latencyMs: Date.now() - started, 
                    message: 'Connected to Home Assistant'
                };
            }
            
            // Fallback to HTTP test if IntegrationManager not available
            const base = config.url;
            if (!base) return { ...common, status: 'unconfigured', latencyMs: Date.now() - started, message: 'No Home Assistant base URL' };
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), 3000);
            let ok = false; let statusCode = null;
            try {
                const resp = await fetch(base.replace(/\/$/, '') + '/api/config', {
                    headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined,
                    signal: controller.signal
                }).catch(() => null);
                if (resp) { statusCode = resp.status; ok = resp.ok; }
            } finally { clearTimeout(to); }
            return { ...common, status: ok ? 'online' : 'offline', latencyMs: Date.now() - started, message: ok ? 'Connected to Home Assistant' : `Unreachable (status ${statusCode ?? 'n/a'})`, httpStatus: statusCode };
        }
        if (type === 'mqtt') {
            const client = req.app.locals?.mqttClient;
            if (!client) return { ...common, status: 'unconfigured', latencyMs: Date.now() - started, message: 'MQTT client not initialised' };
            return { ...common, status: client.connected ? 'online' : 'offline', latencyMs: Date.now() - started, message: client.connected ? 'MQTT connected' : 'MQTT disconnected' };
        }
        // Generic webhook/URL-based integrations (check after specific types)
        if (type === 'webhook' || config.url) {
            const url = config.url || config.endpoint || config.target;
            if (!url) return { ...common, status: 'unconfigured', latencyMs: Date.now() - started, message: 'No URL configured' };
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), 3000);
            let statusCode = null;
            let ok = false;
            try {
                const resp = await fetch(url, { method: 'HEAD', signal: controller.signal }).catch(() => null);
                if (resp) { statusCode = resp.status; ok = resp.ok; }
                if (!resp) {
                    // Fallback to GET if HEAD failed
                    const resp2 = await fetch(url, { method: 'GET', signal: controller.signal }).catch(() => null);
                    if (resp2) { statusCode = resp2.status; ok = resp2.ok; }
                }
            } finally { clearTimeout(to); }
            return {
                ...common,
                status: ok ? 'online' : 'offline',
                latencyMs: Date.now() - started,
                message: ok ? `HTTP ${statusCode}` : `Unreachable (status ${statusCode ?? 'n/a'})`,
                httpStatus: statusCode
            };
        }
        // Default: No specific test logic
        return { ...common, status: 'unconfigured', latencyMs: Date.now() - started, message: 'No test logic for type' };
    } catch (err) {
        return { ...common, status: 'error', latencyMs: Date.now() - started, message: 'Test error', error: err.message };
    }
}

// Get all integrations
router.get('/api', async (req, res) => {
    try {
        const integrations = await req.dal.getIntegrations();
        res.json(integrations);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get integrations API error:', error);
        res.status(500).json({ error: 'Failed to get integrations' });
    }
});

// Get single integration
router.get('/api/:id', async (req, res) => {
    try {
        const integration = await req.dal.getIntegration(req.params.id);
        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }
        res.json(integration);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get integration API error:', error);
        res.status(500).json({ error: 'Failed to get integration' });
    }
});

// Create integration
router.post('/api', async (req, res) => {
    try {
        // Stringify config object if present and convert booleans to integers
        const integrationData = { ...req.body };
        
        // Convert ALL potential booleans to integers for SQLite
        Object.keys(integrationData).forEach(key => {
            if (typeof integrationData[key] === 'boolean') {
                integrationData[key] = integrationData[key] ? 1 : 0;
            }
        });
        
        // Stringify config if it's an object
        if (integrationData.config && typeof integrationData.config === 'object') {
            integrationData.config = JSON.stringify(integrationData.config);
        }
        
        req.app.locals?.loggers?.system?.info('Creating integration with data:', integrationData);
        
        const integration = await req.dal.createIntegration(integrationData);
        res.json(integration);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Create integration API error:', error);
        res.status(500).json({ error: `Failed to create integration: ${error.message}` });
    }
});

// Update integration
router.put('/api/:id', async (req, res) => {
    try {
        // Stringify config object if present and convert booleans to integers
        const integrationData = { ...req.body };
        
        // Convert ALL potential booleans to integers for SQLite
        Object.keys(integrationData).forEach(key => {
            if (typeof integrationData[key] === 'boolean') {
                integrationData[key] = integrationData[key] ? 1 : 0;
            }
        });
        
        // Stringify config if it's an object
        if (integrationData.config && typeof integrationData.config === 'object') {
            integrationData.config = JSON.stringify(integrationData.config);
        }
        
        const integration = await req.dal.updateIntegration(req.params.id, integrationData);
        res.json(integration);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Update integration API error:', error);
        res.status(500).json({ error: `Failed to update integration: ${error.message}` });
    }
});

// Delete integration
router.delete('/api/:id', async (req, res) => {
    try {
        await req.dal.deleteIntegration(req.params.id);
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Delete integration API error:', error);
        res.status(500).json({ error: 'Failed to delete integration' });
    }
});

// Toggle integration enabled status
router.post('/api/:id/toggle', async (req, res) => {
    try {
        await req.dal.toggleIntegration(req.params.id);
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Toggle integration API error:', error);
        res.status(500).json({ error: 'Failed to toggle integration' });
    }
});

// Test integration by ID
router.post('/api/:id/test', async (req, res) => {
    try {
        const result = await req.dal.testIntegration(req.params.id);
        res.json(result);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Test integration API error:', error);
        res.status(500).json({ error: 'Failed to test integration' });
    }
});

// Get integration documentation
router.get('/api/docs/:type', async (req, res) => {
    try {
        const docs = await req.dal.getIntegrationDocs(req.params.type);
        res.json(docs);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get integration docs API error:', error);
        res.status(500).json({ error: 'Failed to get integration documentation' });
    }
});

module.exports = router;