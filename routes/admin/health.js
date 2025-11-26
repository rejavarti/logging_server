// Admin Health Route - System Health Monitoring Dashboard
// Extracted from server.js for better organization and maintainability

const express = require('express');
const router = express.Router();

module.exports = (getPageTemplate, requireAuth) => {
    // System Health Checks Page
    // Note: requireAuth and requireAdmin already applied at server.js level
    // Mounted at "/admin/health" in server.js, so use root path here
    router.get('/', (req, res) => {
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
                    const response = await fetch('/api/system/health-checks', { credentials: 'same-origin' });
                    if (!response.ok) throw new Error('Failed to fetch health checks');
                    
                    const data = await response.json();
                    renderHealthChecks(data);
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error fetching health checks:', error);
                    showToast('Failed to load health checks', 'error');
                    
                    // Show error state
                    document.getElementById('overall-health').innerHTML = \`
                        <div class="overall-status status-error">
                            <i class="fas fa-times-circle" style="font-size: 2rem;"></i>
                            <div>
                                <div>Health Check Failed</div>
                                <div style="font-size: 0.875rem; font-weight: normal; opacity: 0.8; margin-top: 0.25rem;">
                                    Unable to retrieve system status
                                </div>
                            </div>
                        </div>
                    \`;
                    
                    document.getElementById('health-checks-grid').innerHTML = \`
                        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                            <p>Failed to load health checks</p>
                            <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.5rem;">
                                \${error.message}
                            </p>
                        </div>
                    \`;
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
                
                overallDiv.innerHTML = \`
                    <div class="overall-status status-\${data.overall}">
                        <i class="fas fa-\${statusIcons[data.overall]}" style="font-size: 2rem;"></i>
                        <div>
                            <div>\${statusMessages[data.overall]}</div>
                            <div style="font-size: 0.875rem; font-weight: normal; opacity: 0.8; margin-top: 0.25rem;">
                                \${data.successCount || 0} passing, \${data.warningCount || 0} warnings, \${data.errorCount || 0} errors
                            </div>
                        </div>
                    </div>
                \`;

                // Render health check cards
                const grid = document.getElementById('health-checks-grid');
                
                if (!data.checks || data.checks.length === 0) {
                    grid.innerHTML = \`
                        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-heartbeat" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No health checks configured</p>
                        </div>
                    \`;
                    return;
                }
                
                grid.innerHTML = data.checks.map(check => \`
                    <div class="health-check-card status-\${check.status}">
                        <div class="health-check-header">
                            <div class="health-check-name">
                                \${check.name}
                            </div>
                            <div class="health-check-icon status-\${check.status}">
                                <i class="fas fa-\${check.icon}"></i>
                            </div>
                        </div>
                        <div class="health-check-value">\${check.value}</div>
                        <div class="health-check-message">\${check.message}</div>
                        \${check.percent !== undefined ? \`
                            <div class="health-check-progress">
                                <div class="health-check-progress-bar status-\${check.status}" style="width: \${check.percent}%;"></div>
                            </div>
                        \` : ''}
                        \${check.details ? \`
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                                \${check.details}
                            </div>
                        \` : ''}
                    </div>
                \`).join('');

                // Update last updated timestamp
                document.getElementById('last-updated').textContent = data.timestamp || new Date().toLocaleString();
            }

            // showToast() is provided by base.js template

            let healthRefreshInterval = null;
            
            // Load health checks on page load
            refreshHealthChecks();

            // Auto-refresh every 30 seconds
            healthRefreshInterval = setInterval(refreshHealthChecks, 30000);
            
            // Cleanup interval on page unload to prevent memory leaks
            window.addEventListener('beforeunload', () => {
                if (healthRefreshInterval) {
                    clearInterval(healthRefreshInterval);
                    healthRefreshInterval = null;
                }
            });
        `;

        res.send(getPageTemplate({
            pageTitle: 'System Health',
            pageIcon: 'fas fa-heartbeat',
            activeNav: 'health',
            contentBody: contentBody,
            additionalCSS: additionalCSS,
            additionalJS: additionalJS,
            req: req
        }));
    });

    return router;
};