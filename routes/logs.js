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
const { getPageTemplate } = require('../configs/templates/base');
const { escapeHtml, formatDate } = require('../utils/html-helpers');
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
        const logs = await req.dal.getLogEntries({
            level: filters.level,
            source: filters.source,
            search: filters.search,
            startDate: filters.startDate,
            endDate: filters.endDate,
            limit,
            offset
        });
        
        const totalResult = await req.dal.getLogCount(filters);
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
                padding: 0.5rem 0.75rem; 
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
            .log-table th:first-child, .log-table td:first-child {
                min-width: 180px;
                max-width: 180px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
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
            /* Severity badge styles moved to base template */
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
                        <div class="card-actions" style="display:flex;gap:0.5rem;align-items:center;">
                            <button onclick="loadLogs()" class="btn">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                            <button onclick="exportLogsCSV()" class="btn btn-secondary" title="Export visible logs as CSV">
                                <i class="fas fa-file-csv"></i> CSV
                            </button>
                            <button onclick="exportLogsJSON()" class="btn btn-secondary" title="Export visible logs as JSON">
                                <i class="fas fa-file-code"></i> JSON
                            </button>
                            <button onclick="exportLogsNDJSON()" class="btn btn-secondary" title="Export latest logs as NDJSON">
                                <i class="fas fa-stream"></i> NDJSON
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding: 0;">
                        <div class="table-responsive">
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
                                            <td>${formatDate(log.timestamp)}</td>
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
            </div>

            <!-- Analytics Tab Content -->
            <div id="content-analytics" class="tab-content" style="display: none;">
                <!-- Date Range Filter -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">
                            <input type="checkbox" id="auto-update-toggle" checked>
                            <i class="fas fa-sync-alt"></i>
                            Auto-update charts (30s)
                        </label>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <select id="analytics-date-range" onchange="loadAnalytics()" class="form-control">
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="7days" selected>Last 7 Days</option>
                            <option value="30days">Last 30 Days</option>
                        </select>
                        <button onclick="loadAnalytics()" class="btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button onclick="exportAnalyticsCSV()" class="btn btn-secondary" title="Export analytics as CSV">
                            <i class="fas fa-file-csv"></i> CSV
                        </button>
                        <button onclick="exportAnalyticsJSON()" class="btn btn-secondary" title="Export analytics as JSON">
                            <i class="fas fa-file-code"></i> JSON
                        </button>
                    </div>
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
                            <button onclick="clearAdvancedFilters()" class="btn btn-secondary" title="Clear search and filters">
                                <i class="fas fa-eraser"></i> Clear
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding: 0;">
                        <div class="table-responsive" style="max-height: 800px; overflow-y: auto;">
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
                                <tbody id="advanced-logs-tbody">
                                    <tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                                        <i class="fas fa-spinner fa-spin"></i> Loading logs...
                                    </td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const additionalJS = `
            // Chart.js loading helper (Chart.js is already loaded globally in the base template)
            // --- Pagination State Preservation for Logs Page ---
            document.addEventListener('DOMContentLoaded', () => {
                try {
                    const params = new URLSearchParams(window.location.search);
                    const pageParam = params.get('page');
                    if (pageParam) {
                        sessionStorage.setItem('logs-current-page', pageParam);
                    } else {
                        const storedPage = sessionStorage.getItem('logs-current-page');
                        if (storedPage && storedPage !== '1') {
                            params.set('page', storedPage);
                            window.location.replace('/logs?' + params.toString());
                        }
                    }
                } catch (e) {
                    req.app.locals?.loggers?.system?.warn('Logs pagination restore failed:', e);
                }
            });
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
                // Preserve pagination when switching tabs (no page reset on return)
                const currentPage = new URLSearchParams(window.location.search).get('page');
                if (currentPage) {
                    sessionStorage.setItem('logs-current-page', currentPage);
                }
            }

            function refreshAnalytics() {
                loadAnalytics();
            }

            // Analytics variables
            let hourlyChart, categoryChart, severityChart;
            let allLogs = [];
            let chartUpdateInterval = null; // legacy variable for backward compatibility
            
            // Chart auto-update now handled by Realtime registry; these wrappers preserved for UI toggle logic
            function startChartAutoUpdate() {
                if (window.registerRealtimeTask) {
                    window.registerRealtimeTask('logs-analytics-refresh', async () => { try { await loadAnalytics(); } catch(e){ console.debug('Analytics refresh error:', e.message); } }, 30000, { runImmediately: true });
                }
            }
            function stopChartAutoUpdate() {
                if (window.unregisterRealtimeTask) window.unregisterRealtimeTask('logs-analytics-refresh');
            }
            
            // Enhanced chart update with animation
            function updateChartData(chart, newData) {
                if (!chart || !newData) return;
                
                chart.data.labels = newData.labels;
                chart.data.datasets[0].data = newData.values;
                chart.update('active'); // Use 'active' animation mode for smooth updates
            }

            // Hold latest datasets for export
            let latestLogs = [];
            let latestAnalytics = null;

            // Load logs function
            async function loadLogs() {
                try {
                    const data = await apiFetch('/api/logs?limit=100', { credentials: 'include', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
                    const logs = (data && (data.logs || data)) || [];
                    latestLogs = Array.isArray(logs) ? logs : [];
                    const tbody = document.getElementById('logs-tbody');
                    if (!Array.isArray(logs) || logs.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No logs found</td></tr>';
                        return;
                    }
                    tbody.innerHTML = logs.map(function(log){
                        return '<tr>' +
                               '<td>' + formatTimestamp(log.timestamp) + '</td>' +
                               '<td>' + (log.category || 'System') + '</td>' +
                               '<td>' + (log.source || 'System') + '</td>' +
                               '<td>' + (log.event_type || log.level) + '</td>' +
                               '<td>' + escapeHtml(log.message) + '</td>' +
                               '<td><span class="severity-badge severity-' + log.level + '">' + log.level.toUpperCase() + '</span></td>' +
                               '</tr>'; 
                    }).join('');
                } catch (error) {
                    req.app.locals?.loggers?.system?.error('Error loading logs:', error);
                    const tbody = document.getElementById('logs-tbody');
                    if (tbody) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--error-color);">Error loading logs: ' + (error.message || 'Unknown error') + '</td></tr>';
                    }
                }
            }

            // Analytics functions
            async function loadAnalytics() {
                const dateRange = document.getElementById('analytics-date-range').value;
                
                try {
                    const response = await apiFetch('/api/logs/analytics?range=' + dateRange, { credentials: 'include', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
                    // API returns data nested under 'analytics' key
                    const data = response.analytics || response;
                    latestAnalytics = data;
                    updateAnalyticsStats(data);
                    updateAnalyticsCharts(data);
                } catch (error) {
                    req.app.locals?.loggers?.system?.error('Error loading analytics:', error);
                    // Show error in analytics stats
                    document.getElementById('analytics-total-logs').textContent = 'Error';
                    document.getElementById('analytics-error-logs').textContent = 'Error';
                    document.getElementById('analytics-avg-per-hour').textContent = 'Error';
                    document.getElementById('analytics-active-sources').textContent = 'Error';
                }
            }

            function updateAnalyticsStats(data) {
                if (!data) return;
                document.getElementById('analytics-total-logs').textContent = (data.totalLogs || 0).toLocaleString();
                document.getElementById('analytics-error-logs').textContent = (data.errorLogs || 0).toLocaleString();
                document.getElementById('analytics-avg-per-hour').textContent = Math.round(data.avgPerHour || 0);
                document.getElementById('analytics-active-sources').textContent = data.activeSources || 0;
            }

            function updateAnalyticsCharts(data) {
                if (!data) return;
                waitForChart(() => {
                    if (data.hourlyData) updateHourlyChart(data.hourlyData);
                    if (data.severityData) updateSeverityChart(data.severityData);
                    if (data.categoryData) updateCategoryChart(data.categoryData);
                });
            }

            function updateHourlyChart(data) {
                if (!data || !data.labels || !data.values) {
                    console.warn('Invalid hourly chart data:', data);
                    return;
                }
                
                const ctx = document.getElementById('hourly-chart');
                if (!ctx) {
                    console.error('Canvas element "hourly-chart" not found');
                    return;
                }
                
                // If chart exists, update data instead of recreating
                if (hourlyChart) {
                    updateChartData(hourlyChart, data);
                    return;
                }
                
                hourlyChart = new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            label: 'Logs per Hour',
                            data: data.values || [],
                            borderColor: 'var(--accent-primary)',
                            backgroundColor: 'var(--accent-primary-light)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        animation: {
                            duration: 1000,
                            easing: 'easeInOutQuart'
                        },
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
                if (!data || !data.labels || !data.values) {
                    console.warn('Invalid severity chart data:', data);
                    return;
                }
                
                const ctx = document.getElementById('severity-chart');
                if (!ctx) {
                    console.error('Canvas element "severity-chart" not found');
                    return;
                }
                
                // If chart exists, update data instead of recreating
                if (severityChart) {
                    updateChartData(severityChart, data);
                    return;
                }
                
                severityChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            data: data.values || [],
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
                        animation: {
                            animateRotate: true,
                            duration: 1000
                        },
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }

            function updateCategoryChart(data) {
                if (!data || !data.labels || !data.values) {
                    console.warn('Invalid category chart data:', data);
                    return;
                }
                
                const ctx = document.getElementById('category-chart');
                if (!ctx) {
                    console.error('Canvas element "category-chart" not found');
                    return;
                }
                
                // If chart exists, update data instead of recreating
                if (categoryChart) {
                    updateChartData(categoryChart, data);
                    return;
                }
                
                categoryChart = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: data.labels || [],
                        datasets: [{
                            label: 'Log Count',
                            data: data.values || [],
                            backgroundColor: 'var(--accent-primary)'
                        }]
                    },
                    options: {
                        responsive: true,
                        animation: {
                            duration: 1000,
                            easing: 'easeInOutQuart'
                        },
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
                const tbody = document.getElementById('advanced-logs-tbody');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading logs...</td></tr>';
                
                try {
                    const data = await apiFetch('/api/logs?limit=500', { credentials: 'include', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
                    const logs = data && (data.logs || data) || [];
                    allLogs = logs;
                    renderAdvancedLogs(logs);
                } catch (error) {
                    req.app.locals?.loggers?.system?.error('Error loading advanced logs:', error);
                    const tbody = document.getElementById('advanced-logs-tbody');
                    if (tbody) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--error-color);">Error loading logs: ' + (error.message || 'Unknown error') + '</td></tr>';
                    }
                }
            }

            function renderAdvancedLogs(logs) {
                const tbody = document.getElementById('advanced-logs-tbody');
                
                if (!Array.isArray(logs) || logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No logs found</td></tr>';
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

            function filterAdvancedLogs() {
                const searchInput = document.getElementById('advanced-search');
                const searchTerm = (searchInput ? searchInput.value : '').toLowerCase();
                const severityFilterEl = document.getElementById('advanced-severity-filter');
                const categoryFilterEl = document.getElementById('advanced-category-filter');
                const severityFilter = severityFilterEl ? severityFilterEl.value : '';
                const categoryFilter = categoryFilterEl ? categoryFilterEl.value : '';
                
                if (!Array.isArray(allLogs)) {
                    req.app.locals?.loggers?.system?.error('allLogs is not an array:', allLogs);
                    return;
                }
                
                let filtered = allLogs.filter(log => {
                    if (!log) return false;
                    
                    const message = log.message || '';
                    const source = log.source || '';
                    const level = log.level || '';
                    const category = log.category || '';
                    
                    const matchesSearch = !searchTerm || 
                        message.toLowerCase().includes(searchTerm) ||
                        source.toLowerCase().includes(searchTerm);
                    
                    const matchesSeverity = !severityFilter || level === severityFilter;
                    const matchesCategory = !categoryFilter || category === categoryFilter;
                    
                    return matchesSearch && matchesSeverity && matchesCategory;
                });
                
                renderAdvancedLogs(filtered);
            }

            function clearAdvancedFilters() {
                const searchInput = document.getElementById('advanced-search');
                const severityFilterEl = document.getElementById('advanced-severity-filter');
                const categoryFilterEl = document.getElementById('advanced-category-filter');
                if (searchInput) searchInput.value = '';
                if (severityFilterEl) severityFilterEl.value = '';
                if (categoryFilterEl) categoryFilterEl.value = '';
                // Re-render full list
                if (Array.isArray(allLogs)) {
                    renderAdvancedLogs(allLogs);
                }
            }

            // ===== Export helpers =====
            function downloadBlob(text, filename, type = 'text/plain') {
                const blob = new Blob([text], { type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }

            function toCSV(rows, headers) {
                // Safe CSV builder without regex newlines to avoid parsing issues in inline scripts
                if (!Array.isArray(rows) || rows.length === 0) return headers.join(',') + '\\n';
                const escapeField = (v) => {
                    if (v === null || v === undefined) return '';
                    const s = String(v).replace(/"/g, '""');
                    return (s.includes('"') || s.includes(',') || s.includes('\\n')) ? '"' + s + '"' : s;
                };
                const lines = [headers.join(',')];
                for (const row of rows) {
                    const line = headers.map(h => escapeField(row[h]));
                    lines.push(line.join(','));
                }
                return lines.join('\\n');
            }

            // Logs export
            function exportLogsCSV() {
                if (!latestLogs || latestLogs.length === 0) {
                    showToast('No logs to export', 'warning');
                    return;
                }
                const rows = latestLogs.map(l => ({
                    timestamp: formatTimestamp(l.timestamp),
                    source: l.source || 'System',
                    category: l.category || 'System',
                    level: l.level,
                    event_type: l.event_type || l.level,
                    message: l.message || ''
                }));
                const csv = toCSV(rows, ['timestamp','source','category','level','event_type','message']);
                var logFileName = 'logs-export-' + new Date().toISOString().split('T')[0] + '.csv';
                downloadBlob(csv, logFileName, 'text/csv');
                showToast('Logs exported (CSV)', 'success');
            }

            function exportLogsJSON() {
                if (!latestLogs || latestLogs.length === 0) {
                    showToast('No logs to export', 'warning');
                    return;
                }
                const json = JSON.stringify(latestLogs, null, 2);
                var logJsonName = 'logs-export-' + new Date().toISOString().split('T')[0] + '.json';
                downloadBlob(json, logJsonName, 'application/json');
                showToast('Logs exported (JSON)', 'success');
            }

            // NDJSON export hits backend streaming exporter for correctness and low memory
            async function exportLogsNDJSON() {
                try {
                    const resp = await fetch('/api/logs/export?format=ndjson&limit=10000', { credentials: 'same-origin' });
                    if (!resp.ok) { showToast('NDJSON export failed', 'error'); return; }
                    const blob = await resp.blob();
                    var ndjsonName = 'logs-export-' + new Date().toISOString().split('T')[0] + '.ndjson';
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = ndjsonName;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    showToast('Logs exported (NDJSON)', 'success');
                } catch (e) {
                    showToast('NDJSON export error: ' + (e && e.message ? e.message : 'Unknown error'), 'error');
                }
            }

            // Analytics export
            function exportAnalyticsCSV() {
                if (!latestAnalytics) {
                    showToast('No analytics data to export', 'warning');
                    return;
                }
                const sections = [];
                // Hourly
                const hourlyRows = (latestAnalytics.hourlyData?.labels || []).map((label, i) => ({
                    hour: label,
                    value: latestAnalytics.hourlyData?.values?.[i] ?? 0
                }));
                sections.push('"Hourly Logs"');
                sections.push(toCSV(hourlyRows, ['hour','value']));
                // Severity
                const sevRows = (latestAnalytics.severityData?.labels || []).map((label, i) => ({
                    level: label,
                    count: latestAnalytics.severityData?.values?.[i] ?? 0
                }));
                sections.push('\\n"Severity Distribution"');
                sections.push(toCSV(sevRows, ['level','count']));
                // Category
                const catRows = (latestAnalytics.categoryData?.labels || []).map((label, i) => ({
                    category: label,
                    count: latestAnalytics.categoryData?.values?.[i] ?? 0
                }));
                sections.push('\\n"Categories"');
                sections.push(toCSV(catRows, ['category','count']));

                var analyticsCsvName = 'analytics-export-' + new Date().toISOString().split('T')[0] + '.csv';
                downloadBlob(sections.join('\\n'), analyticsCsvName, 'text/csv');
                showToast('Analytics exported (CSV)', 'success');
            }

            function exportAnalyticsJSON() {
                if (!latestAnalytics) {
                    showToast('No analytics data to export', 'warning');
                    return;
                }
                const json = JSON.stringify(latestAnalytics, null, 2);
                var analyticsJsonName = 'analytics-export-' + new Date().toISOString().split('T')[0] + '.json';
                downloadBlob(json, analyticsJsonName, 'application/json');
                showToast('Analytics exported (JSON)', 'success');
            }

            // Helper functions
            function formatTimestamp(timestamp) {
                if (!timestamp) return 'N/A';
                try {
                    const date = new Date(timestamp);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
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

            // Expose key functions globally for inline onclick handlers
            // Ensures buttons like <button onclick="switchTab('analytics')"> work reliably
            window.switchTab = typeof switchTab === 'function' ? switchTab : undefined;
            window.loadLogs = typeof loadLogs === 'function' ? loadLogs : undefined;
            window.exportLogsCSV = typeof exportLogsCSV === 'function' ? exportLogsCSV : undefined;
            window.exportLogsJSON = typeof exportLogsJSON === 'function' ? exportLogsJSON : undefined;
            window.exportLogsNDJSON = typeof exportLogsNDJSON === 'function' ? exportLogsNDJSON : undefined;
            window.loadAnalytics = typeof loadAnalytics === 'function' ? loadAnalytics : undefined;
            window.exportAnalyticsCSV = typeof exportAnalyticsCSV === 'function' ? exportAnalyticsCSV : undefined;
            window.exportAnalyticsJSON = typeof exportAnalyticsJSON === 'function' ? exportAnalyticsJSON : undefined;
            window.loadAdvancedLogs = typeof loadAdvancedLogs === 'function' ? loadAdvancedLogs : undefined;
            window.filterAdvancedLogs = typeof filterAdvancedLogs === 'function' ? filterAdvancedLogs : undefined;

            // Auto-load logs when page loads
            document.addEventListener('DOMContentLoaded', function() {
                loadLogs();
                
                // Add auto-update toggle functionality
                const autoUpdateToggle = document.getElementById('auto-update-toggle');
                if (autoUpdateToggle) {
                    autoUpdateToggle.addEventListener('change', function() {
                        if (this.checked) { startChartAutoUpdate(); req.app.locals?.loggers?.system?.info('Chart auto-update enabled'); }
                        else { stopChartAutoUpdate(); req.app.locals?.loggers?.system?.info('Chart auto-update disabled'); }
                    });
                }
                // Start auto-update by default (Realtime registry)
                startChartAutoUpdate();
            });
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

        const html = getPageTemplate({
            pageTitle: 'System Logs',
            pageIcon: 'fas fa-file-text',
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
        req.app.locals?.loggers?.system?.error('Logs route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API endpoints removed - these are now handled by dedicated routes/api/logs.js
// This follows the Unix philosophy: make each component do one thing well
// routes/logs.js = HTML page serving
// routes/api/logs.js = API data serving

module.exports = router;