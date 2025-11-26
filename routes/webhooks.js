/**
 * Webhooks Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Webhook management interface
 * - Webhook creation, editing, deletion
 * - Webhook testing and validation
 * - Webhook logs and analytics
 */

const express = require('express');
const { getPageTemplate } = require('../configs/templates/base');
const { escapeHtml } = require('../utils/html-helpers');
const router = express.Router();

/**
 * Webhooks Management Route - Main webhook interface
 * GET /webhooks
 */
router.get('/', async (req, res) => {
    try {
        // Use actual DAL methods to get real webhook data
        const webhooks = await req.dal.getWebhooks() || [];
        
        // Get recent webhook deliveries from activity log
        let recentDeliveries = [];
        try {
            recentDeliveries = await req.dal.all(
                `SELECT * FROM activity_log 
                 WHERE action = 'webhook_delivery' 
                 ORDER BY timestamp DESC 
                 LIMIT 100`
            ) || [];
        } catch (err) {
            req.app.locals?.loggers?.system?.warn('Failed to fetch webhook deliveries:', err.message);
        }
        
        // Calculate webhook statistics
        const activeWebhooks = webhooks.filter(w => w.active);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayDeliveries = recentDeliveries.filter(d => new Date(d.attempted_at) >= todayStart);
        const successfulDeliveries = recentDeliveries.filter(d => d.delivery_status === 'success');
        const successRate = recentDeliveries.length > 0 ? Math.round((successfulDeliveries.length / recentDeliveries.length) * 100) : 100;
        
        const responseTimes = recentDeliveries
            .filter(d => d.response_time)
            .map(d => d.response_time);
        const avgResponseTime = responseTimes.length > 0 
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : 0;
        
        const webhookStats = {
            total: webhooks.length,
            active: activeWebhooks.length,
            inactive: webhooks.length - activeWebhooks.length,
            deliveriesToday: todayDeliveries.length,
            successRate: successRate,
            avgResponseTime: avgResponseTime
        };

        const contentBody = `
        <!-- Webhook Stats -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Active Webhooks</div>
                    <div class="stat-icon">
                        <i class="fas fa-link"></i>
                    </div>
                </div>
                <div class="stat-value">${webhooks.filter(w => w.active).length}</div>
                <div class="stat-label">of ${webhooks.length} total</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Deliveries Today</div>
                    <div class="stat-icon">
                        <i class="fas fa-paper-plane"></i>
                    </div>
                </div>
                <div class="stat-value">${(webhookStats.deliveriesToday || 0).toLocaleString()}</div>
                <div class="stat-label">webhook calls</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Success Rate</div>
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-value">${webhookStats.successRate}%</div>
                <div class="stat-label">last 24 hours</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Avg Response Time</div>
                    <div class="stat-icon">
                        <i class="fas fa-stopwatch"></i>
                    </div>
                </div>
                <div class="stat-value">${webhookStats.avgResponseTime}ms</div>
                <div class="stat-label">response time</div>
            </div>
        </div>

        <!-- Webhooks List -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-link"></i> Webhooks</h3>
                <div class="card-actions">
                    <button onclick="createWebhook()" class="btn">
                        <i class="fas fa-plus"></i> Create Webhook
                    </button>
                    <button onclick="refreshWebhooks()" class="btn btn-secondary">
                        <i class="fas fa-sync"></i> Refresh
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${webhooks.length > 0 ? `
                <div class="webhooks-grid">
                    ${webhooks.map(webhook => `
                        <div class="webhook-card" data-webhook-id="${webhook.id}">
                            <div class="webhook-header">
                                <div class="webhook-info">
                                    <h4>${escapeHtml(webhook.name)}</h4>
                                    <span class="webhook-url" title="${webhook.url}">${webhook.url}</span>
                                </div>
                                <div class="webhook-status">
                                    <span class="status-badge ${webhook.active ? 'online' : 'offline'}">
                                        ${webhook.active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="webhook-details">
                                <div class="detail-row">
                                    <span class="detail-label">Events:</span>
                                    <span class="detail-value">${webhook.events.split(',').length} event(s)</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Method:</span>
                                    <span class="detail-value">${webhook.method || 'POST'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Last Delivery:</span>
                                    <span class="detail-value">${webhook.lastDelivery ? formatTimestamp(webhook.lastDelivery) : 'Never'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Success Rate:</span>
                                    <span class="detail-value">${webhook.successRate || 0}%</span>
                                </div>
                            </div>
                            
                            <div class="webhook-actions">
                                <button onclick="testWebhook(${webhook.id})" class="btn-small btn-warning" title="Test Webhook">
                                    <i class="fas fa-play"></i> Test
                                </button>
                                <button onclick="editWebhook(${webhook.id})" class="btn-small btn-primary" title="Edit Webhook">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button onclick="viewWebhookLogs(${webhook.id})" class="btn-small btn-info" title="View Logs">
                                    <i class="fas fa-history"></i> Logs
                                </button>
                                <button onclick="toggleWebhook(${webhook.id}, ${webhook.active})" 
                                        class="btn-small ${webhook.active ? 'btn-warning' : 'btn-success'}" 
                                        title="${webhook.active ? 'Disable' : 'Enable'} Webhook">
                                    <i class="fas fa-${webhook.active ? 'pause' : 'play'}"></i>
                                </button>
                                <button onclick="deleteWebhook(${webhook.id})" class="btn-small btn-danger" title="Delete Webhook">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : `
                <div class="empty-state">
                    <i class="fas fa-link"></i>
                    <p>No webhooks configured yet.</p>
                    <button onclick="createWebhook()" class="btn">
                        <i class="fas fa-plus"></i> Create Your First Webhook
                    </button>
                </div>
                `}
            </div>
        </div>

        <!-- Recent Deliveries -->
        ${recentDeliveries.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-history"></i> Recent Deliveries</h3>
                <a href="/webhooks/deliveries" class="btn btn-secondary">
                    <i class="fas fa-eye"></i> View All
                </a>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 180px;">Webhook</th>
                                <th style="width: 150px;">Event</th>
                                <th style="width: 140px; text-align: center;">Status</th>
                                <th style="width: 120px; text-align: right;">Response Time</th>
                                <th style="width: 180px;">Timestamp</th>
                                <th style="width: 150px; text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentDeliveries.map(delivery => `
                                <tr>
                                    <td>
                                        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(delivery.webhookName)}</div>
                                    </td>
                                    <td>
                                        <span class="event-badge">
                                            ${delivery.event}
                                        </span>
                                    </td>
                                    <td style="text-align: center;">
                                        <span class="status-badge" style="background: ${delivery.success ? '#10b981' : '#ef4444'};">
                                            <i class="fas fa-${delivery.success ? 'check-circle' : 'times-circle'}"></i> ${delivery.success ? 'Success' : 'Failed'}
                                        </span>
                                        ${delivery.statusCode ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">HTTP ${delivery.statusCode}</div>` : ''}
                                    </td>
                                    <td style="text-align: right;">
                                        <span style="font-weight: 600; color: var(--text-secondary);">${delivery.responseTime}ms</span>
                                    </td>
                                    <td>
                                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                                            <i class="fas fa-clock"></i> ${formatTimestamp(delivery.timestamp)}
                                        </div>
                                    </td>
                                    <td>
                                        <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                            <button onclick="viewDeliveryDetails(${delivery.id})" class="btn-small btn-info" title="View Details">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            ${!delivery.success ? `
                                            <button onclick="retryDelivery(${delivery.id})" class="btn-small btn-warning" title="Retry">
                                                <i class="fas fa-redo"></i>
                                            </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Webhook Form Modal -->
        <div id="webhook-modal" class="modal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3><i class="fas fa-link"></i> <span id="modal-title">Create Webhook</span></h3>
                    <button onclick="closeModal('webhook-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="webhook-form">
                        <input type="hidden" id="webhook-id" name="id">
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="webhook-name"><i class="fas fa-tag"></i> Name</label>
                                <input type="text" id="webhook-name" name="name" class="form-control" 
                                       placeholder="Webhook name..." required>
                                <small>A descriptive name for this webhook</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="webhook-url"><i class="fas fa-link"></i> URL</label>
                                <input type="url" id="webhook-url" name="url" class="form-control" 
                                       placeholder="https://example.com/webhook" required>
                                <small>The endpoint URL that will receive webhook calls</small>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="webhook-method"><i class="fas fa-code"></i> HTTP Method</label>
                                <select id="webhook-method" name="method" class="form-control">
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="webhook-timeout"><i class="fas fa-clock"></i> Timeout (seconds)</label>
                                <input type="number" id="webhook-timeout" name="timeout" class="form-control" 
                                       value="30" min="5" max="300">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="webhook-events"><i class="fas fa-calendar-check"></i> Events</label>
                            <div class="events-grid">
                                <div class="event-option">
                                    <input type="checkbox" id="event-log-created" name="events" value="log.created">
                                    <label for="event-log-created">Log Created</label>
                                </div>
                                <div class="event-option">
                                    <input type="checkbox" id="event-log-error" name="events" value="log.error">
                                    <label for="event-log-error">Error Log</label>
                                </div>
                                <div class="event-option">
                                    <input type="checkbox" id="event-log-warning" name="events" value="log.warning">
                                    <label for="event-log-warning">Warning Log</label>
                                </div>
                                <div class="event-option">
                                    <input type="checkbox" id="event-system-alert" name="events" value="system.alert">
                                    <label for="event-system-alert">System Alert</label>
                                </div>
                                <div class="event-option">
                                    <input type="checkbox" id="event-integration-status" name="events" value="integration.status">
                                    <label for="event-integration-status">Integration Status</label>
                                </div>
                                <div class="event-option">
                                    <input type="checkbox" id="event-user-action" name="events" value="user.action">
                                    <label for="event-user-action">User Action</label>
                                </div>
                            </div>
                            <small>Select which events should trigger this webhook</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="webhook-headers"><i class="fas fa-list"></i> Custom Headers</label>
                            <textarea id="webhook-headers" name="headers" class="form-control" rows="4" 
                                      placeholder="Authorization: Bearer your-token
Content-Type: application/json
X-Custom-Header: value"></textarea>
                            <small>One header per line in format: Header-Name: value</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="webhook-secret"><i class="fas fa-key"></i> Secret Key (Optional)</label>
                            <input type="text" id="webhook-secret" name="secret" class="form-control" 
                                   placeholder="Optional secret for webhook verification">
                            <small>Used to generate HMAC signature for webhook verification</small>
                        </div>
                        
                        <div class="form-group">
                            <div class="form-options">
                                <div class="form-option">
                                    <input type="checkbox" id="webhook-active" name="active" checked>
                                    <label for="webhook-active">Active</label>
                                </div>
                                <div class="form-option">
                                    <input type="checkbox" id="webhook-verify-ssl" name="verifySsl" checked>
                                    <label for="webhook-verify-ssl">Verify SSL</label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="btn">
                                <i class="fas fa-save"></i> <span id="save-btn-text">Create Webhook</span>
                            </button>
                            <button type="button" onclick="testWebhookForm()" class="btn btn-secondary" id="test-btn">
                                <i class="fas fa-play"></i> Test
                            </button>
                            <button type="button" onclick="closeModal('webhook-modal')" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Delivery Details Modal -->
        <div id="delivery-modal" class="modal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3><i class="fas fa-info-circle"></i> Delivery Details</h3>
                    <button onclick="closeModal('delivery-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="delivery-details">
                    <!-- Delivery details will be loaded here -->
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

        const additionalCSS = `
        .webhooks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 1.5rem;
        }

        .webhook-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }

        .webhook-card:hover {
            background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .webhook-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }

        .webhook-info h4 {
            margin: 0 0 0.5rem 0;
            color: var(--text-primary);
            font-size: 1.1rem;
        }

        .webhook-url {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8rem;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            display: block;
            word-break: break-all;
            max-width: 280px;
        }

        .webhook-details {
            margin-bottom: 1rem;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.25rem 0;
            border-bottom: 1px solid var(--border-color);
        }

        .detail-row:last-child {
            border-bottom: none;
        }

        .detail-label {
            font-size: 0.9rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        .detail-value {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }

        .webhook-actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .event-badge {
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 500;
        }

        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 1rem;
        }

        .events-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            padding: 1rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .event-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .event-option input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }

        .event-option label {
            margin: 0;
            font-size: 0.9rem;
            cursor: pointer;
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

        .modal-content.large {
            max-width: 900px;
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

        .delivery-section {
            margin-bottom: 2rem;
            padding: 1.5rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .delivery-section h4 {
            margin-bottom: 1rem;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .detail-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }

        .detail-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .detail-item label {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .detail-item span {
            color: var(--text-primary);
            font-weight: 500;
        }

        .code-block {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9rem;
            overflow-x: auto;
            white-space: pre-wrap;
            color: var(--text-primary);
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .webhooks-grid {
                grid-template-columns: 1fr;
            }
            
            .webhook-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
            
            .webhook-url {
                max-width: 100%;
            }
            
            .form-row {
                grid-template-columns: 1fr;
            }
            
            .events-grid {
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
        // Create new webhook
        function createWebhook() {
            document.getElementById('modal-title').textContent = 'Create Webhook';
            document.getElementById('save-btn-text').textContent = 'Create Webhook';
            document.getElementById('webhook-form').reset();
            document.getElementById('webhook-id').value = '';
            document.getElementById('webhook-active').checked = true;
            document.getElementById('webhook-verify-ssl').checked = true;
            openModal('webhook-modal');
        }

        // Modal management functions
        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'flex';
                document.body.classList.add('modal-open');
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }

        // Close modal on background click
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                closeModal(e.target.id);
            }
        });

        // Edit existing webhook
        async function editWebhook(webhookId) {
            try {
                const response = await fetch(\`/api/webhooks/\${webhookId}\`);
                if (response.ok) {
                    const webhook = await response.json();
                    
                    document.getElementById('modal-title').textContent = 'Edit Webhook';
                    document.getElementById('save-btn-text').textContent = 'Update Webhook';
                    
                    document.getElementById('webhook-id').value = webhook.id;
                    document.getElementById('webhook-name').value = webhook.name;
                    document.getElementById('webhook-url').value = webhook.url;
                    document.getElementById('webhook-method').value = webhook.method || 'POST';
                    document.getElementById('webhook-timeout').value = webhook.timeout || 30;
                    document.getElementById('webhook-headers').value = webhook.headers || '';
                    document.getElementById('webhook-secret').value = webhook.secret || '';
                    document.getElementById('webhook-active').checked = webhook.active;
                    document.getElementById('webhook-verify-ssl').checked = webhook.verifySsl !== false;
                    
                    // Clear event checkboxes
                    document.querySelectorAll('input[name="events"]').forEach(cb => cb.checked = false);
                    
                    // Set event checkboxes
                    if (webhook.events) {
                        const events = webhook.events.split(',');
                        events.forEach(event => {
                            const checkbox = document.querySelector(\`input[value="\${event.trim()}"]\`);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                    
                    openModal('webhook-modal');
                } else {
                    throw new Error('Failed to load webhook');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Edit webhook error:', error);
                showToast('Failed to load webhook details', 'error');
            }
        }

        // Handle webhook form submission
        document.getElementById('webhook-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const webhookData = {};
            
            // Get form values
            for (let [key, value] of formData.entries()) {
                if (key === 'events') {
                    webhookData.events = webhookData.events || [];
                    webhookData.events.push(value);
                } else {
                    webhookData[key] = value;
                }
            }
            
            // Convert events array to comma-separated string
            if (webhookData.events) {
                webhookData.events = webhookData.events.join(',');
            }
            
            // Handle checkboxes
            webhookData.active = document.getElementById('webhook-active').checked;
            webhookData.verifySsl = document.getElementById('webhook-verify-ssl').checked;
            
            const isEdit = !!webhookData.id;
            const url = isEdit ? \`/api/webhooks/\${webhookData.id}\` : '/api/webhooks';
            const method = isEdit ? 'PUT' : 'POST';
            
            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(webhookData)
                });
                
                if (response.ok) {
                    showToast(\`Webhook \${isEdit ? 'updated' : 'created'} successfully\`, 'success');
                    closeModal('webhook-modal');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to save webhook');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Save webhook error:', error);
                showToast(error.message, 'error');
            }
        });

        // Test webhook
        async function testWebhook(webhookId) {
            try {
                const response = await fetch(\`/api/webhooks/\${webhookId}/test\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showToast(\`Webhook test successful (HTTP \${result.statusCode})\`, 'success');
                } else {
                    showToast(\`Webhook test failed: \${result.error || 'Unknown error'}\`, 'error');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Test webhook error:', error);
                showToast('Failed to test webhook', 'error');
            }
        }

        // Test webhook from form
        async function testWebhookForm() {
            const form = document.getElementById('webhook-form');
            const formData = new FormData(form);
            
            const testData = {
                url: formData.get('url'),
                method: formData.get('method') || 'POST',
                headers: formData.get('headers'),
                timeout: parseInt(formData.get('timeout')) || 30,
                verifySsl: document.getElementById('webhook-verify-ssl').checked
            };
            
            if (!testData.url) {
                showToast('Please enter a webhook URL first', 'warning');
                return;
            }
            
            try {
                document.getElementById('test-btn').disabled = true;
                document.getElementById('test-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
                
                const response = await fetch('/api/webhooks/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testData)
                , credentials: 'same-origin' });
                
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
                    \${result.statusCode ? \`<p><strong>HTTP Status:</strong> \${result.statusCode}</p>\` : ''}
                    \${result.responseTime ? \`<p><strong>Response Time:</strong> \${result.responseTime}ms</p>\` : ''}
                    \${result.error ? \`<p><strong>Error:</strong> \${result.error}</p>\` : ''}
                \`;
                
                const modalActions = document.querySelector('.modal-actions');
                modalActions.parentNode.insertBefore(resultDiv, modalActions);
                
                if (result.success) {
                    showToast(\`Webhook test successful (HTTP \${result.statusCode})\`, 'success');
                } else {
                    showToast(\`Webhook test failed: \${result.error || 'Unknown error'}\`, 'error');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Test webhook error:', error);
                showToast('Failed to test webhook', 'error');
            } finally {
                document.getElementById('test-btn').disabled = false;
                document.getElementById('test-btn').innerHTML = '<i class="fas fa-play"></i> Test';
            }
        }

        // Toggle webhook active status
        async function toggleWebhook(webhookId, currentStatus) {
            const action = currentStatus ? 'disable' : 'enable';
            
            if (!confirm(\`Are you sure you want to \${action} this webhook?\`)) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/webhooks/\${webhookId}/toggle\`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showToast(\`Webhook \${action}d successfully\`, 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error(\`Failed to \${action} webhook\`);
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Toggle webhook error:', error);
                showToast(error.message, 'error');
            }
        }

        // Delete webhook
        async function deleteWebhook(webhookId) {
            if (!confirm('Are you sure you want to delete this webhook? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/webhooks/\${webhookId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showToast('Webhook deleted successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error('Failed to delete webhook');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Delete webhook error:', error);
                showToast('Failed to delete webhook', 'error');
            }
        }

        // View webhook logs
        function viewWebhookLogs(webhookId) {
            window.open(\`/webhooks/logs/\${webhookId}\`, '_blank');
        }

        // View delivery details
        async function viewDeliveryDetails(deliveryId) {
            try {
                showLoading('delivery-details');
                openModal('delivery-modal');
                
                const response = await fetch(\`/api/webhooks/deliveries/\${deliveryId}\`);
                if (response.ok) {
                    const delivery = await response.json();
                    displayDeliveryDetails(delivery);
                } else {
                    throw new Error('Failed to load delivery details');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('View delivery error:', error);
                showError('delivery-details', 'Failed to load delivery details');
            }
        }

        // Display delivery details
        function displayDeliveryDetails(delivery) {
            const content = document.getElementById('delivery-details');
            
            content.innerHTML = \`
                <div class="delivery-section">
                    <h4><i class="fas fa-info-circle"></i> Delivery Information</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>ID:</label>
                            <span>\${delivery.id}</span>
                        </div>
                        <div class="detail-item">
                            <label>Webhook:</label>
                            <span>\${delivery.webhookName}</span>
                        </div>
                        <div class="detail-item">
                            <label>Event:</label>
                            <span class="event-badge">\${delivery.event}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="status-badge \${delivery.success ? 'online' : 'offline'}">
                                \${delivery.success ? 'Success' : 'Failed'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <label>HTTP Status:</label>
                            <span>\${delivery.statusCode || 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Response Time:</label>
                            <span>\${delivery.responseTime}ms</span>
                        </div>
                        <div class="detail-item">
                            <label>Timestamp:</label>
                            <span>\${formatTimestamp(delivery.timestamp)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Attempt:</label>
                            <span>\${delivery.attempt || 1}</span>
                        </div>
                    </div>
                </div>
                
                \${delivery.requestPayload ? \`
                    <div class="delivery-section">
                        <h4><i class="fas fa-upload"></i> Request Payload</h4>
                        <div class="code-block">\${JSON.stringify(JSON.parse(delivery.requestPayload), null, 2)}</div>
                    </div>
                \` : ''}
                
                \${delivery.requestHeaders ? \`
                    <div class="delivery-section">
                        <h4><i class="fas fa-list"></i> Request Headers</h4>
                        <div class="code-block">\${delivery.requestHeaders}</div>
                    </div>
                \` : ''}
                
                \${delivery.responseBody ? \`
                    <div class="delivery-section">
                        <h4><i class="fas fa-download"></i> Response Body</h4>
                        <div class="code-block">\${delivery.responseBody}</div>
                    </div>
                \` : ''}
                
                \${delivery.error ? \`
                    <div class="delivery-section">
                        <h4><i class="fas fa-exclamation-triangle"></i> Error Details</h4>
                        <div class="code-block">\${delivery.error}</div>
                    </div>
                \` : ''}
            \`;
        }

        // Retry delivery
        async function retryDelivery(deliveryId) {
            try {
                const response = await fetch(\`/api/webhooks/deliveries/\${deliveryId}/retry\`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        showToast('Webhook delivery retried successfully', 'success');
                    } else {
                        showToast(\`Retry failed: \${result.error}\`, 'error');
                    }
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error('Failed to retry delivery');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Retry delivery error:', error);
                showToast('Failed to retry delivery', 'error');
            }
        }

        // Refresh webhooks
        function refreshWebhooks() {
            location.reload();
        }
        `;

        const html = getPageTemplate({
            pageTitle: 'Webhooks',
            pageIcon: 'fa-link',
            activeNav: 'webhooks',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Webhooks route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Routes for Webhook Management
 */

// Get all webhooks
router.get('/api', async (req, res) => {
    try {
        const webhooks = await req.dal.getWebhooks();
        res.json(webhooks);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get webhooks API error:', error);
        res.status(500).json({ error: 'Failed to get webhooks' });
    }
});

// Get single webhook
router.get('/api/:id', async (req, res) => {
    try {
        const webhook = await req.dal.getWebhookById(req.params.id);
        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }
        res.json(webhook);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get webhook API error:', error);
        res.status(500).json({ error: 'Failed to get webhook' });
    }
});

// Create webhook
router.post('/api', async (req, res) => {
    try {
        const webhook = await req.dal.createWebhook(req.body);
        res.json(webhook);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Create webhook API error:', error);
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

// Update webhook
router.put('/api/:id', async (req, res) => {
    try {
        const webhook = await req.dal.updateWebhook(req.params.id, req.body);
        res.json(webhook);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Update webhook API error:', error);
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

// Delete webhook
router.delete('/api/:id', async (req, res) => {
    try {
        await req.dal.deleteWebhook(req.params.id);
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Delete webhook API error:', error);
        res.status(500).json({ error: 'Failed to delete webhook' });
    }
});

// Toggle webhook active status
router.post('/api/:id/toggle', async (req, res) => {
    try {
        await req.dal.toggleWebhook(req.params.id);
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Toggle webhook API error:', error);
        res.status(500).json({ error: 'Failed to toggle webhook' });
    }
});

// Test webhook
router.post('/api/:id/test', async (req, res) => {
    try {
        const result = await req.dal.testWebhook(req.params.id);
        res.json(result);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Test webhook API error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// Test webhook from form data
router.post('/api/test', async (req, res) => {
    try {
        const result = await req.dal.testWebhookData(req.body);
        res.json(result);
        } catch (error) {
        req.app.locals?.loggers?.system?.error('Test webhook data API error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// --- Backward compatibility UI routes (added to restore monolithic paths) ---
// /webhooks/add
router.get('/add', async (req, res) => {
        try {
                const content = `
                <div class="card">
                    <div class="card-header"><h3><i class="fas fa-plus"></i> Add Webhook</h3></div>
                    <div class="card-body">
                        <p>Creation now handled directly on the main /webhooks page. This legacy route is preserved for bookmarks.</p>
                        <a href="/webhooks" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Back</a>
                    </div>
                </div>`;
                res.send(getPageTemplate('webhooks-add', content, req));
        } catch (e) {
                res.status(500).send(getPageTemplate('webhooks-add', `<div class='error'>Failed: ${e.message}</div>`, req));
        }
});

// /webhooks/edit/:id
router.get('/edit/:id', async (req, res) => {
        try {
                const webhook = await req.dal.getWebhookById(req.params.id);
                if (!webhook) {
                        return res.status(404).send(getPageTemplate('webhooks-edit', `<div class='error'>Webhook not found</div>`, req));
                }
                const content = `
                <div class="card">
                    <div class="card-header"><h3><i class="fas fa-edit"></i> Edit Webhook</h3></div>
                    <div class="card-body">
                        <form id="edit-webhook-form" data-id="${webhook.id}">
                            <div class="form-group"><label>Name</label><input class="form-control" value="${webhook.name}"/></div>
                            <div class="form-group"><label>URL</label><input class="form-control" value="${webhook.url}"/></div>
                            <div class="form-group"><label>Method</label><input class="form-control" value="${webhook.method || 'POST'}"/></div>
                            <p>Editing submits via existing /webhooks API endpoints.</p>
                            <a href="/webhooks" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Back</a>
                        </form>
                    </div>
                </div>`;
                res.send(getPageTemplate('webhooks-edit', content, req));
        } catch (e) {
                res.status(500).send(getPageTemplate('webhooks-edit', `<div class='error'>Failed: ${e.message}</div>`, req));
        }
});

module.exports = router;