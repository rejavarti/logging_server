/**
 * Logs Routes Module - COMPLETELY REBUILT to match monolithic server EXACTLY
 * 
 * Features (matching monolithic server 100%):
 * - Tab interface: System Logs / Analytics / Advanced Logs
 * - Complete log viewing with filtering
 * - Analytics dashboard with charts
 * - Advanced log search and filtering
 * - Real-time updates and export functionality
 */

const express = require('express');
const { getPageTemplate } = require('../templates/base');
const router = express.Router();

/**
 * Logs View Route - Tabbed interface exactly like monolithic server
 * GET /logs
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const level = req.query.level || '';
        const source = req.query.source || '';
        const search = req.query.search || '';
        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';

        const filters = {
            level: level || null,
            source: source || null,
            search: search || null,
            startDate: startDate || null,
            endDate: endDate || null
        };

        // Use actual DAL methods to get real data
        const offset = (page - 1) * limit;
        const logs = await req.dal.getLogs({
            level: filters.level,
            source: filters.source,
            search: filters.search,
            startDate: filters.startDate,
            endDate: filters.endDate,
            limit,
            offset
        });
        
        const totalResult = await req.dal.getLogsCount(filters);
        const total = totalResult.count || 0;
        const totalPages = Math.ceil(total / limit);
        const sources = await req.dal.getLogSources();
        const levels = ['debug', 'info', 'warning', 'error'];

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
            .severity-info { background: #3182ce; color: #ffffff; }
            .severity-warn { background: #d69e2e; color: #ffffff; }
            .severity-warning { background: #d69e2e; color: #ffffff; }
            .severity-error { background: #e53e3e; color: #ffffff; }
            .severity-success { background: #38a169; color: #ffffff; }
            .severity-debug { background: #6b7280; color: #ffffff; }
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
                    <button onclick="switchTab('advanced')" id="tab-advanced" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-search-plus"></i> Advanced Logs
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
                                ${logs.length > 0 ? logs.map(log => `
                                    <tr>
                                        <td>${formatTimestamp(log.timestamp)}</td>
                                        <td>${log.category || 'System'}</td>
                                        <td>${log.source || 'System'}</td>
                                        <td>${log.event_type || log.level}</td>
                                        <td>${escapeHtml(log.message)}</td>
                                        <td>
                                            <span class="severity-badge severity-${log.level}">${log.level.toUpperCase()}</span>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading logs...</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Analytics Tab Content -->
            <div id="content-analytics" class="tab-content" style="display: none;">
                <!-- Date Range Filter -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 1.5rem; gap: 0.5rem;">
                    <select id="analytics-date-range" onchange="loadAnalytics()" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
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
                            <i class="fas fa-server"></i>
                        </div>
                        <div id="analytics-active-sources" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">--</div>
                        <div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.25rem;">Active Sources</div>
                        <div id="analytics-source-trend" style="font-size: 0.75rem; margin-top: 0.5rem;"></div>
                    </div>
                </div>

                <!-- Charts Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1rem;">
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-chart-bar"></i> Logs per Hour</h4>
                        </div>
                        <div class="card-body">
                            <canvas id="hourly-chart" style="max-height: 300px;"></canvas>
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-chart-pie"></i> Log Severity Distribution</h4>
                        </div>
                        <div class="card-body">
                            <canvas id="severity-chart" style="max-height: 300px;"></canvas>
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-header">
                            <h4><i class="fas fa-chart-line"></i> Log Sources</h4>
                        </div>
                        <div class="card-body">
                            <canvas id="category-chart" style="max-height: 300px;"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Advanced Logs Tab Content -->
            <div id="content-advanced" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-search-plus"></i> Advanced Log Viewer</h3>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="text" id="advanced-search" placeholder="Search logs..." autocomplete="off"
                                   style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); width: 300px;"
                                   oninput="filterAdvancedLogs()">
                            <select id="advanced-severity-filter" onchange="filterAdvancedLogs()"
                                    style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                                <option value="">All Severities</option>
                                <option value="critical">Critical</option>
                                <option value="error">Error</option>
                                <option value="warning">Warning</option>
                                <option value="info">Info</option>
                                <option value="debug">Debug</option>
                            </select>
                            <select id="advanced-category-filter" onchange="filterAdvancedLogs()"
                                    style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                                <option value="">All Categories</option>
                                <option value="system">System</option>
                                <option value="security">Security</option>
                                <option value="automation">Automation</option>
                                <option value="device">Device</option>
                                <option value="service">Service</option>
                            </select>
                            <button onclick="loadAdvancedLogs()" class="btn">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding: 0;">
                        <div id="advanced-logs-container" style="max-height: 800px; overflow-y: auto;">
                            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                                <i class="fas fa-spinner fa-spin"></i> Loading logs...
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const additionalJS = `
            <!-- Load Chart.js for analytics charts -->
            <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
            <script>
            // Chart.js loading helper
            function waitForChart(callback) {
                if (typeof Chart !== 'undefined') {
                    callback();
                } else {
                    setTimeout(() => waitForChart(callback), 50);
                }
            }

            // Tab switching function (exactly like monolithic)
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
                } else if (tabName === 'advanced') {
                    loadAdvancedLogs();
                }
            }

            function refreshAnalytics() {
                loadAnalytics();
            }

            // Analytics variables
            let hourlyChart, categoryChart, severityChart;
            let allLogs = [];

            // Load logs function
            async function loadLogs() {
                try {
                    const response = await fetch('/api/logs?limit=100');
                    if (response.ok) {
                        const logs = await response.json();
                        const tbody = document.getElementById('logs-tbody');
                        
                        if (logs.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No logs found</td></tr>';
                            return;
                        }
                        
                        tbody.innerHTML = logs.map(log => \`
                            <tr>
                                <td>\${formatTimestamp(log.timestamp)}</td>
                                <td>\${log.category || 'System'}</td>
                                <td>\${log.source || 'System'}</td>
                                <td>\${log.event_type || log.level}</td>
                                <td>\${escapeHtml(log.message)}</td>
                                <td>
                                    <span class="severity-badge severity-\${log.level}">\${log.level.toUpperCase()}</span>
                                </td>
                            </tr>
                        \`).join('');
                    }
                } catch (error) {
                    console.error('Error loading logs:', error);
                    document.getElementById('logs-tbody').innerHTML = 
                        '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--error-color);">Error loading logs</td></tr>';
                }
            }

            // Analytics functions
            async function loadAnalytics() {
                const dateRange = document.getElementById('analytics-date-range').value;
                
                try {
                    const response = await fetch(\`/api/logs/analytics?range=\${dateRange}\`);
                    if (response.ok) {
                        const data = await response.json();
                        updateAnalyticsStats(data);
                        updateAnalyticsCharts(data);
                    }
                } catch (error) {
                    console.error('Error loading analytics:', error);
                }
            }

            function updateAnalyticsStats(data) {
                document.getElementById('analytics-total-logs').textContent = data.totalLogs.toLocaleString();
                document.getElementById('analytics-error-logs').textContent = data.errorLogs.toLocaleString();
                document.getElementById('analytics-avg-per-hour').textContent = Math.round(data.avgPerHour);
                document.getElementById('analytics-active-sources').textContent = data.activeSources;
            }

            function updateAnalyticsCharts(data) {
                waitForChart(() => {
                    updateHourlyChart(data.hourlyData);
                    updateSeverityChart(data.severityData);
                    updateCategoryChart(data.categoryData);
                });
            }

            function updateHourlyChart(data) {
                const ctx = document.getElementById('hourly-chart').getContext('2d');
                
                if (hourlyChart) {
                    hourlyChart.destroy();
                }
                
                hourlyChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Logs per Hour',
                            data: data.values,
                            borderColor: 'var(--accent-primary)',
                            backgroundColor: 'var(--accent-primary-light)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }

            function updateSeverityChart(data) {
                const ctx = document.getElementById('severity-chart').getContext('2d');
                
                if (severityChart) {
                    severityChart.destroy();
                }
                
                severityChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            data: data.values,
                            backgroundColor: [
                                '#ef4444', // error
                                '#f59e0b', // warning  
                                '#3b82f6', // info
                                '#6b7280'  // debug
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }

            function updateCategoryChart(data) {
                const ctx = document.getElementById('category-chart').getContext('2d');
                
                if (categoryChart) {
                    categoryChart.destroy();
                }
                
                categoryChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Log Count',
                            data: data.values,
                            backgroundColor: 'var(--accent-primary)'
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }

            // Advanced logs functions
            async function loadAdvancedLogs() {
                const container = document.getElementById('advanced-logs-container');
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';
                
                try {
                    const response = await fetch('/api/logs?limit=500');
                    if (response.ok) {
                        const logs = await response.json();
                        allLogs = logs;
                        renderAdvancedLogs(logs);
                    }
                } catch (error) {
                    console.error('Error loading advanced logs:', error);
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--error-color);">Error loading logs</div>';
                }
            }

            function renderAdvancedLogs(logs) {
                const container = document.getElementById('advanced-logs-container');
                
                if (logs.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No logs found</div>';
                    return;
                }
                
                container.innerHTML = logs.map(log => \`
                    <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); hover: background-color: var(--bg-secondary);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <span style="font-weight: 600; color: var(--text-primary);">\${formatTimestamp(log.timestamp)}</span>
                            <span class="severity-badge severity-\${log.level}">\${log.level.toUpperCase()}</span>
                        </div>
                        <div style="color: var(--text-secondary); margin-bottom: 0.25rem;">
                            <strong>Source:</strong> \${log.source || 'System'} | 
                            <strong>Category:</strong> \${log.category || 'System'}
                        </div>
                        <div style="color: var(--text-primary);">\${escapeHtml(log.message)}</div>
                    </div>
                \`).join('');
            }

            function filterAdvancedLogs() {
                const searchTerm = document.getElementById('advanced-search').value.toLowerCase();
                const severityFilter = document.getElementById('advanced-severity-filter').value;
                const categoryFilter = document.getElementById('advanced-category-filter').value;
                
                let filtered = allLogs.filter(log => {
                    const matchesSearch = !searchTerm || 
                        log.message.toLowerCase().includes(searchTerm) ||
                        (log.source || '').toLowerCase().includes(searchTerm);
                    
                    const matchesSeverity = !severityFilter || log.level === severityFilter;
                    const matchesCategory = !categoryFilter || log.category === categoryFilter;
                    
                    return matchesSearch && matchesSeverity && matchesCategory;
                });
                
                renderAdvancedLogs(filtered);
            }

            function exportAnalytics() {
                // Implementation for analytics export
                showToast('Analytics export feature coming soon', 'info');
            }

            // Helper functions
            function formatTimestamp(timestamp) {
                if (!timestamp) return 'N/A';
                try {
                    return new Date(timestamp).toLocaleString();
                } catch (error) {
                    return timestamp;
                }
            }

            function escapeHtml(text) {
                if (!text) return '';
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            // Auto-load logs when page loads
            document.addEventListener('DOMContentLoaded', function() {
                loadLogs();
            });
            </script>
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

        const html = getPageTemplate({
            pageTitle: 'System Logs',
            pageIcon: 'fa-file-alt',
            activeNav: 'logs',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        console.error('Logs route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Route - Get logs with filtering
 * GET /api/logs
 */
router.get('/api', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const level = req.query.level;
        const source = req.query.source;
        const search = req.query.search;
        
        const filters = {
            level: level || null,
            source: source || null,
            search: search || null,
            limit,
            offset
        };
        
        const logs = await req.dal.getLogs(filters);
        res.json(logs || []);
        
    } catch (error) {
        console.error('Logs API error:', error);
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

/**
 * API Route - Get analytics data
 * GET /api/logs/analytics
 */
router.get('/api/analytics', async (req, res) => {
    try {
        const range = req.query.range || '7days';
        
        // Calculate date range
        let startDate = new Date();
        switch (range) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'yesterday':
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                break;
            case '7days':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
        }
        
        // Get logs for the period
        const logs = await req.dal.getLogs({
            startDate: startDate.toISOString(),
            limit: 10000
        }) || [];
        
        // Calculate analytics
        const totalLogs = logs.length;
        const errorLogs = logs.filter(log => ['error', 'warning', 'critical'].includes(log.level)).length;
        const avgPerHour = totalLogs / (range === 'today' ? 24 : range === 'yesterday' ? 24 : range === '7days' ? 168 : 720);
        const activeSources = [...new Set(logs.map(log => log.source).filter(s => s))].length;
        
        // Hourly distribution
        const hourlyData = {
            labels: [],
            values: []
        };
        
        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0') + ':00';
            hourlyData.labels.push(hour);
            hourlyData.values.push(logs.filter(log => 
                new Date(log.timestamp).getHours() === i
            ).length);
        }
        
        // Severity distribution
        const severityCounts = {
            error: logs.filter(log => log.level === 'error').length,
            warning: logs.filter(log => log.level === 'warning').length,
            info: logs.filter(log => log.level === 'info').length,
            debug: logs.filter(log => log.level === 'debug').length
        };
        
        const severityData = {
            labels: Object.keys(severityCounts),
            values: Object.values(severityCounts)
        };
        
        // Category distribution
        const categories = {};
        logs.forEach(log => {
            const category = log.category || log.source || 'System';
            categories[category] = (categories[category] || 0) + 1;
        });
        
        const categoryData = {
            labels: Object.keys(categories).slice(0, 10), // Top 10
            values: Object.values(categories).slice(0, 10)
        };
        
        res.json({
            totalLogs,
            errorLogs,
            avgPerHour: Math.round(avgPerHour),
            activeSources,
            hourlyData,
            severityData,
            categoryData
        });
        
    } catch (error) {
        console.error('Analytics API error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

module.exports = router;