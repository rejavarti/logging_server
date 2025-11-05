/**
 * Dashboard Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Main dashboard route
 * - Real-time stats and system status
 * - Dashboard widgets and components
 */

const express = require('express');
const getPageTemplate = require('../templates/base');
const router = express.Router();

// Utility functions for template rendering
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return timestamp;
        return date.toLocaleString('en-US', {
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

/**
 * Dashboard Route - Main system overview page
 * GET /dashboard
 */
router.get('/', async (req, res) => {
    try {
        // Get real data from DAL
        const stats = await req.dal.getSystemStats();
        const recentLogs = await req.dal.getRecentLogs(10);
        const systemHealth = await req.dal.getSystemHealth();
        const currentTime = new Date().toISOString();
        
        // Get dashboard builder widgets if available
        const dashboards = req.dashboardBuilder ? await req.dashboardBuilder.getUserDashboards(req.user?.id) : { success: false, data: [] };
        const hasCustomDashboard = dashboards.success && dashboards.data.length > 0;
        
        const contentBody = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Total Logs</div>
                    <div class="stat-icon">
                        <i class="fas fa-database"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalLogs.toLocaleString()}</div>
                <div class="stat-label">Log entries stored</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Logs Today</div>
                    <div class="stat-icon">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.logsToday.toLocaleString()}</div>
                <div class="stat-label">New entries today</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Storage Used</div>
                    <div class="stat-icon">
                        <i class="fas fa-hdd"></i>
                    </div>
                </div>
                <div class="stat-value">${formatBytes(stats.storageUsed)}</div>
                <div class="stat-label">Database size</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">System Health</div>
                    <div class="stat-icon">
                        <i class="fas fa-heartbeat"></i>
                    </div>
                </div>
                <div class="stat-value">
                    <span class="status-badge ${systemHealth.status}">${systemHealth.status}</span>
                </div>
                <div class="stat-label">Overall status</div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-clock"></i> Recent Activity</h3>
                <a href="/logs" class="btn btn-secondary">
                    <i class="fas fa-eye"></i> View All Logs
                </a>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Level</th>
                                <th>Source</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody id="recent-logs">
                            ${recentLogs.map(log => `
                                <tr>
                                    <td><span class="timestamp">${formatTimestamp(log.timestamp)}</span></td>
                                    <td><span class="status-badge ${log.level}">${log.level}</span></td>
                                    <td>${log.source || 'System'}</td>
                                    <td>${log.message}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        ${hasCustomDashboard ? `
        <!-- Custom Dashboard Widgets -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-magic"></i> Custom Dashboards</h3>
                <div class="card-actions">
                    <a href="/dashboard/builder" class="btn">
                        <i class="fas fa-plus"></i> Create Dashboard
                    </a>
                    <a href="/admin/dashboards" class="btn btn-secondary">
                        <i class="fas fa-cog"></i> Manage
                    </a>
                </div>
            </div>
            <div class="card-body">
                <div class="dashboard-grid">
                    ${dashboards.data.slice(0, 3).map(dashboard => `
                        <div class="dashboard-card">
                            <div class="dashboard-header">
                                <h4>${dashboard.name}</h4>
                                <span class="badge">${dashboard.widgets ? JSON.parse(dashboard.widgets).length : 0} widgets</span>
                            </div>
                            <p>${dashboard.description || 'No description'}</p>
                            <div class="dashboard-actions">
                                <a href="/dashboard/builder/${dashboard.id}" class="btn btn-sm">View</a>
                                <a href="/dashboard/builder/${dashboard.id}" class="btn btn-sm btn-secondary">Edit</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : `
        <!-- Dashboard Builder Invitation -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-magic"></i> Advanced Dashboard Builder</h3>
                <div class="card-actions">
                    <a href="/dashboard/builder" class="btn">
                        <i class="fas fa-plus"></i> Create Custom Dashboard
                    </a>
                </div>
            </div>
            <div class="card-body">
                <div class="invitation-content">
                    <div class="invitation-icon">
                        <i class="fas fa-th-large"></i>
                    </div>
                    <h4>Create Your Custom Dashboard</h4>
                    <p>Build interactive dashboards with drag-and-drop widgets including charts, metrics, alerts, and real-time data visualization.</p>
                    <div class="feature-list">
                        <div class="feature-item">
                            <i class="fas fa-chart-bar"></i>
                            <span>Interactive Charts & Graphs</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-tachometer-alt"></i>
                            <span>Real-time Metrics</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-bell"></i>
                            <span>Alert Widgets</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-palette"></i>
                            <span>Customizable Layouts</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `}

        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-chart-line"></i> System Metrics</h3>
                <div class="card-actions">
                    <button onclick="refreshMetrics()" class="btn btn-secondary">
                        <i class="fas fa-sync"></i> Refresh
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-label">CPU Usage</div>
                        <div class="metric-value">${systemHealth.cpu}%</div>
                        <div class="metric-bar">
                            <div class="metric-fill" style="width: ${systemHealth.cpu}%"></div>
                        </div>
                    </div>
                    
                    <div class="metric-item">
                        <div class="metric-label">Memory Usage</div>
                        <div class="metric-value">${systemHealth.memory}%</div>
                        <div class="metric-bar">
                            <div class="metric-fill" style="width: ${systemHealth.memory}%"></div>
                        </div>
                    </div>
                    
                    <div class="metric-item">
                        <div class="metric-label">Disk Usage</div>
                        <div class="metric-value">${systemHealth.disk}%</div>
                        <div class="metric-bar">
                            <div class="metric-fill" style="width: ${systemHealth.disk}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        const additionalCSS = `
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
        }

        .metric-item {
            background: var(--bg-secondary);
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .metric-label {
            font-size: 0.875rem;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
            font-weight: 600;
        }

        .metric-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.75rem;
        }

        .metric-bar {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
        }

        .metric-fill {
            height: 100%;
            background: var(--gradient-ocean);
            transition: width 0.3s ease;
        }

        .table-responsive {
            overflow-x: auto;
        }

        .status-badge.info { 
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            color: #1e40af;
            border: 1px solid #93c5fd;
        }

        [data-theme="dark"] .status-badge.info, [data-theme="ocean"] .status-badge.info {
            background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
            color: #93c5fd;
            border: 1px solid #3b82f6;
        }

        .status-badge.error { 
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            color: #991b1b;
            border: 1px solid #fca5a5;
        }

        [data-theme="dark"] .status-badge.error, [data-theme="ocean"] .status-badge.error {
            background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
            color: #fca5a5;
            border: 1px solid #dc2626;
        }

        .status-badge.warning { 
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #78350f;
            border: 1px solid #fbbf24;
        }

        [data-theme="dark"] .status-badge.warning, [data-theme="ocean"] .status-badge.warning {
            background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
            color: #fbbf24;
            border: 1px solid #f59e0b;
        }

        .status-badge.debug { 
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            color: #374151;
            border: 1px solid #d1d5db;
        }

        [data-theme="dark"] .status-badge.debug, [data-theme="ocean"] .status-badge.debug {
            background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
            color: #d1d5db;
            border: 1px solid #6b7280;
        }

        /* Dashboard Builder Styles */
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
        }

        .dashboard-card {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.2s ease;
        }

        .dashboard-card:hover {
            border-color: var(--accent-primary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .dashboard-header h4 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1rem;
        }

        .badge {
            background: var(--accent-primary);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .dashboard-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.75rem;
        }

        .invitation-content {
            text-align: center;
            padding: 2rem;
        }

        .invitation-icon {
            font-size: 3rem;
            color: var(--accent-primary);
            margin-bottom: 1rem;
            opacity: 0.8;
        }

        .invitation-content h4 {
            color: var(--text-primary);
            margin-bottom: 1rem;
        }

        .invitation-content p {
            color: var(--text-muted);
            margin-bottom: 1.5rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }

        .feature-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1.5rem;
        }

        .feature-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }

        .feature-item i {
            color: var(--accent-primary);
            font-size: 1.1rem;
        }

        .feature-item span {
            color: var(--text-secondary);
            font-weight: 500;
        }
        `;

        const additionalJS = `
        // Format bytes helper
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }

        // Refresh metrics
        async function refreshMetrics() {
            try {
                showLoading('recent-logs');
                const response = await fetch('/api/dashboard/refresh');
                if (response.ok) {
                    const data = await response.json();
                    updateDashboard(data);
                    showToast('Dashboard refreshed', 'success');
                } else {
                    throw new Error('Failed to refresh dashboard');
                }
            } catch (error) {
                console.error('Error refreshing dashboard:', error);
                showToast('Failed to refresh dashboard', 'error');
            }
        }

        // Update dashboard with new data
        function updateDashboard(data) {
            // Update recent logs table
            const logsTable = document.getElementById('recent-logs');
            if (logsTable && data.recentLogs) {
                logsTable.innerHTML = data.recentLogs.map(log => \`
                    <tr>
                        <td><span class="timestamp">\${formatTimestamp(log.timestamp)}</span></td>
                        <td><span class="status-badge \${log.level}">\${log.level}</span></td>
                        <td>\${log.source || 'System'}</td>
                        <td>\${log.message}</td>
                    </tr>
                \`).join('');
            }
        }

        // Auto-refresh dashboard every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/dashboard/refresh');
                if (response.ok) {
                    const data = await response.json();
                    updateDashboard(data);
                }
            } catch (error) {
                console.error('Auto-refresh failed:', error);
            }
        }, 30000);
        `;

        const html = getPageTemplate('Dashboard', contentBody, additionalCSS, additionalJS, req, 'dashboard', 'fa-tachometer-alt');

        res.send(html);

    } catch (error) {
        console.error('Dashboard route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Route - Dashboard refresh endpoint
 * GET /api/dashboard/refresh
 */
router.get('/api/refresh', async (req, res) => {
    try {
        const recentLogs = await req.dal.getRecentLogs(10);
        const stats = await req.dal.getSystemStats();
        const systemHealth = await req.dal.getSystemHealth();

        res.json({
            recentLogs,
            stats,
            systemHealth,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Dashboard API refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh dashboard' });
    }
});

module.exports = router;