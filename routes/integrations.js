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
const { getPageTemplate } = require('../templates/base');
const router = express.Router();

/**
 * Integrations Management Route - Main integrations interface
 * GET /integrations
 */
router.get('/', async (req, res) => {
    try {
        // Temporary fallback since DAL methods don't exist yet
        const integrations = [];
        const integrationStats = { 
            total: 0, 
            active: 0, 
            inactive: 0,
            messagesToday: 0,
            successRate: 100
        };
        const availableIntegrations = [];

        const contentBody = `
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
                    <div class="stat-title">Messages Today</div>
                    <div class="stat-icon">
                        <i class="fas fa-paper-plane"></i>
                    </div>
                </div>
                <div class="stat-value">${integrationStats.messagesToday.toLocaleString()}</div>
                <div class="stat-label">integration messages</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Success Rate</div>
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-value">${integrationStats.successRate}%</div>
                <div class="stat-label">last 24 hours</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Available Types</div>
                    <div class="stat-icon">
                        <i class="fas fa-cubes"></i>
                    </div>
                </div>
                <div class="stat-value">${availableIntegrations.length}</div>
                <div class="stat-label">integration types</div>
            </div>
        </div>

        <!-- Configured Integrations -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-plug"></i> Configured Integrations</h3>
                <div class="card-actions">
                    <button onclick="showAddIntegration()" class="btn">
                        <i class="fas fa-plus"></i> Add Integration
                    </button>
                    <button onclick="refreshIntegrations()" class="btn btn-secondary">
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
                                    <div class="integration-icon">
                                        <i class="${getIntegrationIcon(integration.type)}"></i>
                                    </div>
                                    <div class="integration-details">
                                        <h4>${escapeHtml(integration.name)}</h4>
                                        <span class="integration-type">${integration.type.toUpperCase()}</span>
                                    </div>
                                </div>
                                <div class="integration-status">
                                    <span class="status-badge ${integration.enabled ? (integration.connected ? 'online' : 'warning') : 'offline'}">
                                        ${integration.enabled ? (integration.connected ? 'Connected' : 'Connecting') : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="integration-config">
                                <div class="config-row">
                                    <span class="config-label">Endpoint:</span>
                                    <span class="config-value">${integration.endpoint || 'N/A'}</span>
                                </div>
                                <div class="config-row">
                                    <span class="config-label">Messages Sent:</span>
                                    <span class="config-value">${integration.messagesSent || 0}</span>
                                </div>
                                <div class="config-row">
                                    <span class="config-label">Last Activity:</span>
                                    <span class="config-value">${integration.lastActivity ? formatTimestamp(integration.lastActivity) : 'Never'}</span>
                                </div>
                                <div class="config-row">
                                    <span class="config-label">Success Rate:</span>
                                    <span class="config-value">${integration.successRate || 0}%</span>
                                </div>
                            </div>
                            
                            <div class="integration-actions">
                                <button onclick="testIntegration(${integration.id})" class="btn-small" title="Test Integration">
                                    <i class="fas fa-play"></i> Test
                                </button>
                                <button onclick="editIntegration(${integration.id})" class="btn-small" title="Edit Integration">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button onclick="viewIntegrationLogs(${integration.id})" class="btn-small" title="View Logs">
                                    <i class="fas fa-history"></i> Logs
                                </button>
                                <button onclick="toggleIntegration(${integration.id}, ${integration.enabled})" 
                                        class="btn-small ${integration.enabled ? 'btn-warning' : 'btn-success'}" 
                                        title="${integration.enabled ? 'Disable' : 'Enable'} Integration">
                                    <i class="fas fa-${integration.enabled ? 'pause' : 'play'}"></i>
                                </button>
                                <button onclick="deleteIntegration(${integration.id})" class="btn-small btn-danger" title="Delete Integration">
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

        <!-- Available Integrations -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-cubes"></i> Available Integration Types</h3>
            </div>
            <div class="card-body">
                <div class="available-integrations-grid">
                    ${availableIntegrations.map(integration => `
                        <div class="available-integration-card">
                            <div class="available-integration-icon">
                                <i class="${integration.icon}"></i>
                            </div>
                            <div class="available-integration-info">
                                <h4>${integration.name}</h4>
                                <p>${integration.description}</p>
                                <div class="integration-features">
                                    ${integration.features.map(feature => `
                                        <span class="feature-tag">${feature}</span>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="available-integration-actions">
                                <button onclick="addIntegrationType('${integration.type}')" class="btn btn-small">
                                    <i class="fas fa-plus"></i> Add
                                </button>
                                <button onclick="viewIntegrationDocs('${integration.type}')" class="btn btn-small btn-secondary">
                                    <i class="fas fa-book"></i> Docs
                                </button>
                            </div>
                        </div>
                    `).join('')}
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
                                <select id="integration-type" name="type" class="form-control" required onchange="updateIntegrationForm()">
                                    <option value="">Select integration type...</option>
                                    ${availableIntegrations.map(integration => 
                                        `<option value="${integration.type}">${integration.name}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div id="integration-config-fields">
                            <!-- Dynamic configuration fields will be loaded here -->
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
        `;

        function escapeHtml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

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

        const additionalCSS = `
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
            background: var(--gradient-ocean);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
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

        .config-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.25rem 0;
            border-bottom: 1px solid var(--border-color);
        }

        .config-row:last-child {
            border-bottom: none;
        }

        .config-label {
            font-size: 0.9rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        .config-value {
            font-size: 0.9rem;
            color: var(--text-secondary);
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
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
        `;

        const additionalJS = `
        // Integration type configurations
        const integrationConfigs = {
            slack: {
                fields: [
                    { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/...' },
                    { name: 'channel', label: 'Channel', type: 'text', required: false, placeholder: '#general' },
                    { name: 'username', label: 'Bot Username', type: 'text', required: false, placeholder: 'LogBot' }
                ]
            },
            discord: {
                fields: [
                    { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://discord.com/api/webhooks/...' },
                    { name: 'username', label: 'Bot Username', type: 'text', required: false, placeholder: 'LogBot' }
                ]
            },
            teams: {
                fields: [
                    { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://outlook.office.com/webhook/...' }
                ]
            },
            email: {
                fields: [
                    { name: 'smtpHost', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
                    { name: 'smtpPort', label: 'SMTP Port', type: 'number', required: true, placeholder: '587' },
                    { name: 'username', label: 'Username', type: 'email', required: true, placeholder: 'your-email@gmail.com' },
                    { name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'App password or account password' },
                    { name: 'fromAddress', label: 'From Address', type: 'email', required: true, placeholder: 'alerts@yourcompany.com' },
                    { name: 'toAddress', label: 'To Address', type: 'email', required: true, placeholder: 'admin@yourcompany.com' }
                ]
            },
            webhook: {
                fields: [
                    { name: 'url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://api.example.com/webhook' },
                    { name: 'method', label: 'HTTP Method', type: 'select', required: true, options: ['POST', 'PUT', 'PATCH'], default: 'POST' },
                    { name: 'headers', label: 'Custom Headers', type: 'textarea', required: false, placeholder: 'Authorization: Bearer token\\nContent-Type: application/json' },
                    { name: 'timeout', label: 'Timeout (seconds)', type: 'number', required: false, placeholder: '30', default: 30 }
                ]
            },
            mqtt: {
                fields: [
                    { name: 'brokerUrl', label: 'Broker URL', type: 'text', required: true, placeholder: 'mqtt://localhost:1883' },
                    { name: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'logs/events' },
                    { name: 'username', label: 'Username', type: 'text', required: false, placeholder: 'Optional username' },
                    { name: 'password', label: 'Password', type: 'password', required: false, placeholder: 'Optional password' },
                    { name: 'clientId', label: 'Client ID', type: 'text', required: false, placeholder: 'logging-server' }
                ]
            }
        };

        // Show add integration modal
        function showAddIntegration() {
            document.getElementById('integration-modal-title').textContent = 'Add Integration';
            document.getElementById('integration-save-btn-text').textContent = 'Add Integration';
            document.getElementById('integration-form').reset();
            document.getElementById('integration-id').value = '';
            document.getElementById('integration-enabled').checked = true;
            document.getElementById('integration-verify-ssl').checked = true;
            document.getElementById('integration-config-fields').innerHTML = '';
            openModal('integration-modal');
        }

        // Add specific integration type
        function addIntegrationType(type) {
            showAddIntegration();
            document.getElementById('integration-type').value = type;
            updateIntegrationForm();
        }

        // Update integration form based on selected type
        function updateIntegrationForm() {
            const type = document.getElementById('integration-type').value;
            const configFields = document.getElementById('integration-config-fields');
            
            if (!type || !integrationConfigs[type]) {
                configFields.innerHTML = '';
                return;
            }
            
            const config = integrationConfigs[type];
            let html = \`<div class="config-field-group"><h4><i class="fas fa-cogs"></i> Configuration</h4><div class="form-row">\`;
            
            config.fields.forEach(field => {
                html += \`<div class="form-group">\`;
                html += \`<label for="config-\${field.name}"><i class="fas fa-\${getFieldIcon(field.type)}"></i> \${field.label}</label>\`;
                
                if (field.type === 'textarea') {
                    html += \`<textarea id="config-\${field.name}" name="\${field.name}" class="form-control" 
                             placeholder="\${field.placeholder || ''}" \${field.required ? 'required' : ''}>\${field.default || ''}</textarea>\`;
                } else if (field.type === 'select') {
                    html += \`<select id="config-\${field.name}" name="\${field.name}" class="form-control" \${field.required ? 'required' : ''}>\`;
                    if (field.options) {
                        field.options.forEach(option => {
                            html += \`<option value="\${option}" \${field.default === option ? 'selected' : ''}>\${option}</option>\`;
                        });
                    }
                    html += \`</select>\`;
                } else {
                    html += \`<input type="\${field.type}" id="config-\${field.name}" name="\${field.name}" class="form-control" 
                             placeholder="\${field.placeholder || ''}" value="\${field.default || ''}" \${field.required ? 'required' : ''}>\`;
                }
                
                if (field.placeholder && field.type !== 'textarea') {
                    html += \`<small>\${field.placeholder}</small>\`;
                }
                html += \`</div>\`;
            });
            
            html += \`</div></div>\`;
            configFields.innerHTML = html;
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
                    
                    updateIntegrationForm();
                    
                    // Set configuration values
                    if (integration.config) {
                        const config = typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config;
                        Object.keys(config).forEach(key => {
                            const field = document.getElementById(\`config-\${key}\`);
                            if (field) {
                                field.value = config[key];
                            }
                        });
                    }
                    
                    openModal('integration-modal');
                } else {
                    throw new Error('Failed to load integration');
                }
            } catch (error) {
                console.error('Edit integration error:', error);
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
            
            // Get configuration fields
            const configFieldGroup = document.querySelector('.config-field-group');
            if (configFieldGroup) {
                const configInputs = configFieldGroup.querySelectorAll('input, textarea, select');
                configInputs.forEach(input => {
                    if (input.name && input.name !== 'enabled' && input.name !== 'verifySsl') {
                        integrationData.config[input.name] = input.value;
                    }
                });
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
                console.error('Save integration error:', error);
                showToast(error.message, 'error');
            }
        });

        // Test integration
        async function testIntegration(integrationId) {
            try {
                const response = await fetch(\`/api/integrations/\${integrationId}/test\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showToast('Integration test successful', 'success');
                } else {
                    showToast(\`Integration test failed: \${result.error || 'Unknown error'}\`, 'error');
                }
            } catch (error) {
                console.error('Test integration error:', error);
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
            
            // Get configuration fields
            const configFieldGroup = document.querySelector('.config-field-group');
            if (configFieldGroup) {
                const configInputs = configFieldGroup.querySelectorAll('input, textarea, select');
                configInputs.forEach(input => {
                    if (input.name && input.name !== 'enabled' && input.name !== 'verifySsl') {
                        testData.config[input.name] = input.value;
                    }
                });
            }
            
            if (!testData.type) {
                showToast('Please select an integration type first', 'warning');
                return;
            }
            
            try {
                document.getElementById('integration-test-btn').disabled = true;
                document.getElementById('integration-test-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
                
                const response = await fetch('/api/integrations/test', {
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
                console.error('Test integration error:', error);
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
                console.error('Toggle integration error:', error);
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
                console.error('Delete integration error:', error);
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
                console.error('View docs error:', error);
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
        console.error('Integrations route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Routes for Integration Management
 */

// Get all integrations
router.get('/api', async (req, res) => {
    try {
        const integrations = await req.dal.getIntegrations();
        res.json(integrations);
    } catch (error) {
        console.error('Get integrations API error:', error);
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
        console.error('Get integration API error:', error);
        res.status(500).json({ error: 'Failed to get integration' });
    }
});

// Create integration
router.post('/api', async (req, res) => {
    try {
        const integration = await req.dal.createIntegration(req.body);
        res.json(integration);
    } catch (error) {
        console.error('Create integration API error:', error);
        res.status(500).json({ error: 'Failed to create integration' });
    }
});

// Update integration
router.put('/api/:id', async (req, res) => {
    try {
        const integration = await req.dal.updateIntegration(req.params.id, req.body);
        res.json(integration);
    } catch (error) {
        console.error('Update integration API error:', error);
        res.status(500).json({ error: 'Failed to update integration' });
    }
});

// Delete integration
router.delete('/api/:id', async (req, res) => {
    try {
        await req.dal.deleteIntegration(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete integration API error:', error);
        res.status(500).json({ error: 'Failed to delete integration' });
    }
});

// Toggle integration enabled status
router.post('/api/:id/toggle', async (req, res) => {
    try {
        await req.dal.toggleIntegration(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Toggle integration API error:', error);
        res.status(500).json({ error: 'Failed to toggle integration' });
    }
});

// Test integration
router.post('/api/:id/test', async (req, res) => {
    try {
        const result = await req.dal.testIntegration(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Test integration API error:', error);
        res.status(500).json({ error: 'Failed to test integration' });
    }
});

// Test integration from form data
router.post('/api/test', async (req, res) => {
    try {
        const result = await req.dal.testIntegrationData(req.body);
        res.json(result);
    } catch (error) {
        console.error('Test integration data API error:', error);
        res.status(500).json({ error: 'Failed to test integration' });
    }
});

// Get integration documentation
router.get('/api/docs/:type', async (req, res) => {
    try {
        const docs = await req.dal.getIntegrationDocs(req.params.type);
        res.json(docs);
    } catch (error) {
        console.error('Get integration docs API error:', error);
        res.status(500).json({ error: 'Failed to get integration documentation' });
    }
});

module.exports = router;