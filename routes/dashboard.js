/**
 * Dashboard Routes Module - REBUILT with Complete Functionality
 * 
 * Features:
 * - Chart.js widgets with real-time data
 * - Gridstack.js drag-and-drop interface  
 * - System metrics dashboard
 * - Integration with dashboard builder
 * - Advanced analytics and visualizations
 */

const express = require('express');
const { getPageTemplate } = require('../templates/base');
const router = express.Router();

/**
 * Main Dashboard Route - Complete dashboard with widgets and real-time data
 * GET /dashboard
 */
router.get('/', async (req, res) => {
    try {
        // Get real-time data from DAL with error handling
        let stats = { totalLogs: 0, errorCount: 0, warningCount: 0, infoCount: 0, debugCount: 0 };
        let recentLogs = [];
        let systemHealth = { status: 'unknown', uptime: 0, memory: 0, disk: 0 };
        let logSources = [];
        
        try {
            stats = await req.dal.getSystemStats() || stats;
        } catch (error) {
            console.error('Error getting system stats:', error);
        }
        
        try {
            recentLogs = await req.dal.getRecentLogs(20) || [];
        } catch (error) {
            console.error('Error getting recent logs:', error);
        }
        
        try {
            systemHealth = await req.dal.getSystemHealth() || systemHealth;
        } catch (error) {
            console.error('Error getting system health:', error);
        }
        
        try {
            logSources = await req.dal.getLogSources() || [];
        } catch (error) {
            console.error('Error getting log sources:', error);
        }
        
        // Get user's custom dashboards
        let userDashboards = { success: false, data: [] };
        try {
            if (req.dashboardBuilder) {
                userDashboards = await req.dashboardBuilder.getUserDashboards(req.user?.id || 1);
                // Ensure data is an array
                if (!userDashboards || !userDashboards.data || !Array.isArray(userDashboards.data)) {
                    userDashboards = { success: false, data: [] };
                }
            }
        } catch (error) {
            console.error('Error getting user dashboards:', error);
            userDashboards = { success: false, data: [] };
        }

        // Get log level distribution for pie chart
        const logLevelStats = await req.dal.all(`
            SELECT level, COUNT(*) as count 
            FROM log_events 
            WHERE timestamp >= datetime('now', '-24 hours') 
            GROUP BY level 
            ORDER BY count DESC
        `);

        // Get hourly log distribution for timeline chart  
        const hourlyStats = await req.dal.all(`
            SELECT 
                strftime('%H:00', timestamp) as hour,
                COUNT(*) as count,
                level
            FROM log_events 
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY hour, level
            ORDER BY hour
        `);

        const contentBody = `
        <!-- Include Chart.js and Gridstack -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/gridstack@9.0.0/dist/gridstack.min.css">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/gridstack@9.0.0/dist/gridstack-all.js"></script>

        <!-- Dashboard Header with Actions -->
        <div class="dashboard-header">
            <div class="dashboard-title">
                <h1><i class="fas fa-tachometer-alt"></i> System Dashboard</h1>
                <div class="dashboard-subtitle">
                    Real-time monitoring and analytics • Last updated: <span id="lastUpdate">${new Date().toLocaleTimeString()}</span>
                </div>
            </div>
            <div class="dashboard-actions">
                ${userDashboards && userDashboards.success && userDashboards.data && Array.isArray(userDashboards.data) && userDashboards.data.length > 0 ? `
                    <div class="dashboard-selector">
                        <select id="dashboardSelect" onchange="switchDashboard()" class="form-select">
                            <option value="default">Default Dashboard</option>
                            ${userDashboards.data.map(d => `<option value="${d.id || 'unknown'}">${d.name || 'Unnamed'}</option>`).join('')}
                        </select>
                    </div>
                ` : ''}
                <button onclick="toggleAutoRefresh()" id="autoRefreshBtn" class="btn btn-secondary">
                    <i class="fas fa-sync"></i> Auto Refresh: ON
                </button>
                <a href="/dashboard/builder" class="btn">
                    <i class="fas fa-magic"></i> Custom Dashboards
                </a>
            </div>
        </div>

        <!-- Main Dashboard Grid -->
        <div class="grid-stack" id="dashboardGrid">
            
            <!-- System Stats Widget -->
            <div class="grid-stack-item" gs-w="12" gs-h="2" gs-id="system-stats">
                <div class="grid-stack-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-bar"></i> System Overview</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('system-stats')" class="btn-icon">
                                    <i class="fas fa-sync"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-database"></i></div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="totalLogs">${stats.totalLogs.toLocaleString()}</div>
                                        <div class="stat-label">Total Logs</div>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="logsToday">${stats.logsToday.toLocaleString()}</div>
                                        <div class="stat-label">Logs Today</div>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-server"></i></div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="sources">${logSources.length}</div>
                                        <div class="stat-label">Active Sources</div>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-heartbeat"></i></div>
                                    <div class="stat-info">
                                        <div class="stat-value">
                                            <span class="status-badge ${systemHealth.status}">${systemHealth.status.toUpperCase()}</span>
                                        </div>
                                        <div class="stat-label">System Health</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Log Levels Pie Chart Widget -->
            <div class="grid-stack-item" gs-w="6" gs-h="4" gs-id="log-levels-chart">
                <div class="grid-stack-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-pie"></i> Log Levels (24h)</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('log-levels-chart')" class="btn-icon">
                                    <i class="fas fa-sync"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <canvas id="logLevelsChart" width="400" height="300"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- System Metrics Gauges Widget -->
            <div class="grid-stack-item" gs-w="6" gs-h="4" gs-id="system-metrics">
                <div class="grid-stack-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-tachometer-alt"></i> System Metrics</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('system-metrics')" class="btn-icon">
                                    <i class="fas fa-sync"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="metrics-grid">
                                <div class="metric-gauge">
                                    <canvas id="cpuGauge" width="120" height="120"></canvas>
                                    <div class="metric-label">CPU Usage</div>
                                    <div class="metric-value" id="cpuValue">${systemHealth.cpu || 0}%</div>
                                </div>
                                <div class="metric-gauge">
                                    <canvas id="memoryGauge" width="120" height="120"></canvas>
                                    <div class="metric-label">Memory Usage</div>
                                    <div class="metric-value" id="memoryValue">${systemHealth.memory || 0}%</div>
                                </div>
                                <div class="metric-gauge">
                                    <canvas id="diskGauge" width="120" height="120"></canvas>
                                    <div class="metric-label">Disk Usage</div>
                                    <div class="metric-value" id="diskValue">${systemHealth.disk || 0}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Hourly Timeline Chart Widget -->
            <div class="grid-stack-item" gs-w="12" gs-h="4" gs-id="hourly-timeline">
                <div class="grid-stack-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-line"></i> Log Activity Timeline (24h)</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('hourly-timeline')" class="btn-icon">
                                    <i class="fas fa-sync"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <canvas id="timelineChart" width="800" height="300"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Recent Logs Widget -->
            <div class="grid-stack-item" gs-w="12" gs-h="5" gs-id="recent-logs">
                <div class="grid-stack-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-list"></i> Recent Activity</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('recent-logs')" class="btn-icon">
                                    <i class="fas fa-sync"></i>
                                </button>
                                <a href="/logs" class="btn-icon" title="View All Logs">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="recent-logs-container" id="recentLogsContainer">
                                ${recentLogs.map(log => `
                                    <div class="log-entry" data-level="${log.level}">
                                        <div class="log-timestamp">${formatTimestamp(log.timestamp)}</div>
                                        <div class="log-level">
                                            <span class="level-badge ${log.level}">${log.level.toUpperCase()}</span>
                                        </div>
                                        <div class="log-source">${log.source || 'System'}</div>
                                        <div class="log-message">${escapeHtml(log.message)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
        `;

        const additionalCSS = `
        /* Dashboard Layout */
        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 2rem;
            padding: 1.5rem;
            background: var(--bg-secondary);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }

        .dashboard-title h1 {
            margin: 0 0 0.5rem 0;
            color: var(--text-primary);
            font-size: 1.75rem;
            font-weight: 700;
        }

        .dashboard-subtitle {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .dashboard-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .dashboard-selector select {
            min-width: 200px;
        }

        /* Grid Stack Customization */
        .grid-stack {
            margin: 0;
        }

        .grid-stack-item-content {
            height: 100%;
            overflow: hidden;
        }

        /* Widget Cards */
        .widget-card {
            height: 100%;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            box-shadow: var(--shadow-small);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
        }

        .widget-card:hover {
            border-color: var(--accent-primary);
            box-shadow: var(--shadow-medium);
        }

        .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-secondary);
            border-radius: 12px 12px 0 0;
        }

        .widget-header h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1rem;
            font-weight: 600;
        }

        .widget-actions {
            display: flex;
            gap: 0.5rem;
        }

        .btn-icon {
            background: none;
            border: none;
            color: var(--text-muted);
            padding: 0.5rem;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-icon:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .widget-content {
            flex: 1;
            padding: 1.5rem;
            overflow: auto;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .stat-icon {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gradient-ocean);
            border-radius: 12px;
            color: white;
            font-size: 1.5rem;
        }

        .stat-info {
            flex: 1;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .stat-label {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        /* Metrics Gauges */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1.5rem;
            text-align: center;
        }

        .metric-gauge {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
        }

        .metric-label {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-weight: 600;
        }

        .metric-value {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        /* Recent Logs */
        .recent-logs-container {
            max-height: 300px;
            overflow-y: auto;
        }

        .log-entry {
            display: grid;
            grid-template-columns: 140px 80px 120px 1fr;
            gap: 1rem;
            align-items: center;
            padding: 0.75rem;
            border-bottom: 1px solid var(--border-color);
            transition: background-color 0.2s ease;
        }

        .log-entry:hover {
            background: var(--bg-secondary);
        }

        .log-timestamp {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .level-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            text-align: center;
        }

        .level-badge.info { 
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            color: #1e40af;
        }

        .level-badge.error { 
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            color: #991b1b;
        }

        .level-badge.warning { 
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #78350f;
        }

        .level-badge.debug { 
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            color: #374151;
        }

        [data-theme="dark"] .level-badge.info, [data-theme="ocean"] .level-badge.info {
            background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
            color: #93c5fd;
        }

        [data-theme="dark"] .level-badge.error, [data-theme="ocean"] .level-badge.error {
            background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
            color: #fca5a5;
        }

        [data-theme="dark"] .level-badge.warning, [data-theme="ocean"] .level-badge.warning {
            background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
            color: #fbbf24;
        }

        [data-theme="dark"] .level-badge.debug, [data-theme="ocean"] .level-badge.debug {
            background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
            color: #d1d5db;
        }

        .log-source {
            font-weight: 500;
            color: var(--text-secondary);
            font-size: 0.85rem;
        }

        .log-message {
            color: var(--text-primary);
            font-size: 0.9rem;
            word-break: break-word;
        }

        .status-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-badge.healthy {
            background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
            color: #065f46;
        }

        .status-badge.warning {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #78350f;
        }

        .status-badge.error {
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            color: #991b1b;
        }

        [data-theme="dark"] .status-badge.healthy, [data-theme="ocean"] .status-badge.healthy {
            background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
            color: #a7f3d0;
        }

        /* Auto-refresh indicator */
        .auto-refresh-active {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .dashboard-header {
                flex-direction: column;
                gap: 1rem;
                align-items: stretch;
            }

            .dashboard-actions {
                justify-content: space-between;
            }

            .log-entry {
                grid-template-columns: 1fr;
                gap: 0.5rem;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            .metrics-grid {
                grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            }
        }
        `;

        const additionalJS = `
        // Dashboard Configuration
        let autoRefreshEnabled = true;
        let refreshInterval;
        let grid;
        let charts = {};

        // Initialize Dashboard
        document.addEventListener('DOMContentLoaded', function() {
            initializeGrid();
            initializeCharts();
            startAutoRefresh();
            
            console.log('🎯 Dashboard initialized with real-time widgets');
        });

        // Initialize Gridstack
        function initializeGrid() {
            grid = GridStack.init({
                cellHeight: 70,
                verticalMargin: 10,
                resizable: { handles: 'e, se, s, sw, w' },
                draggable: { handle: '.widget-header' }
            });
            
            // Save layout on change
            grid.on('change', function(event, items) {
                saveLayoutToLocalStorage();
            });
            
            // Load saved layout
            loadLayoutFromLocalStorage();
        }

        // Initialize All Charts
        function initializeCharts() {
            initializeLogLevelsChart();
            initializeSystemGauges();
            initializeTimelineChart();
        }

        // Log Levels Pie Chart
        function initializeLogLevelsChart() {
            const ctx = document.getElementById('logLevelsChart');
            const data = ${JSON.stringify(logLevelStats)};
            
            const colors = {
                'info': '#3b82f6',
                'warning': '#f59e0b', 
                'error': '#ef4444',
                'debug': '#6b7280'
            };

            charts.logLevels = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.map(d => d.level.toUpperCase()),
                    datasets: [{
                        data: data.map(d => d.count),
                        backgroundColor: data.map(d => colors[d.level] || '#6b7280'),
                        borderWidth: 0,
                        hoverBorderWidth: 3,
                        hoverBorderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { 
                                padding: 20,
                                usePointStyle: true,
                                font: { size: 12 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return \`\${context.label}: \${context.raw} (\${percentage}%)\`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // System Metrics Gauges
        function initializeSystemGauges() {
            const health = ${JSON.stringify(systemHealth)};
            
            createGauge('cpuGauge', health.cpu || 0, 'CPU');
            createGauge('memoryGauge', health.memory || 0, 'Memory'); 
            createGauge('diskGauge', health.disk || 0, 'Disk');
        }

        function createGauge(canvasId, value, label) {
            const ctx = document.getElementById(canvasId);
            
            charts[canvasId] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [value, 100 - value],
                        backgroundColor: [
                            value > 80 ? '#ef4444' : value > 60 ? '#f59e0b' : '#10b981',
                            '#e5e7eb'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    circumference: 180,
                    rotation: 270,
                    cutout: '70%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                }
            });
        }

        // Timeline Chart
        function initializeTimelineChart() {
            const ctx = document.getElementById('timelineChart');
            const hourlyData = ${JSON.stringify(hourlyStats)};
            
            // Process data for stacked chart
            const hours = [...new Set(hourlyData.map(d => d.hour))].sort();
            const levels = ['info', 'warning', 'error', 'debug'];
            
            const datasets = levels.map(level => {
                const color = {
                    'info': '#3b82f6',
                    'warning': '#f59e0b',
                    'error': '#ef4444', 
                    'debug': '#6b7280'
                }[level];
                
                return {
                    label: level.toUpperCase(),
                    data: hours.map(hour => {
                        const entry = hourlyData.find(d => d.hour === hour && d.level === level);
                        return entry ? entry.count : 0;
                    }),
                    backgroundColor: color,
                    borderColor: color,
                    borderWidth: 1
                };
            });

            charts.timeline = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: hours,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true,
                            title: { display: true, text: 'Hour of Day' }
                        },
                        y: {
                            stacked: true,
                            title: { display: true, text: 'Log Count' }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    }
                }
            });
        }

        // Auto Refresh Functionality
        function startAutoRefresh() {
            if (autoRefreshEnabled) {
                refreshInterval = setInterval(refreshAllWidgets, 30000); // 30 seconds
                document.getElementById('autoRefreshBtn').classList.add('auto-refresh-active');
            }
        }

        function toggleAutoRefresh() {
            const btn = document.getElementById('autoRefreshBtn');
            
            if (autoRefreshEnabled) {
                clearInterval(refreshInterval);
                autoRefreshEnabled = false;
                btn.textContent = 'Auto Refresh: OFF';
                btn.insertAdjacentHTML('afterbegin', '<i class="fas fa-sync"></i> ');
                btn.classList.remove('auto-refresh-active');
            } else {
                startAutoRefresh();
                autoRefreshEnabled = true;
                btn.textContent = 'Auto Refresh: ON';
                btn.insertAdjacentHTML('afterbegin', '<i class="fas fa-sync"></i> ');
                btn.classList.add('auto-refresh-active');
            }
        }

        // Refresh Functions
        async function refreshAllWidgets() {
            try {
                const response = await fetch('/api/dashboard/refresh');
                if (response.ok) {
                    const data = await response.json();
                    updateDashboardData(data);
                    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                }
            } catch (error) {
                console.error('Auto-refresh failed:', error);
            }
        }

        function refreshWidget(widgetId) {
            // Widget refresh logging moved to proper logger system
            refreshAllWidgets();
        }

        function updateDashboardData(data) {
            // Update stats
            if (data.stats) {
                document.getElementById('totalLogs').textContent = data.stats.totalLogs.toLocaleString();
                document.getElementById('logsToday').textContent = data.stats.logsToday.toLocaleString();
            }

            // Update recent logs (secure DOM manipulation)
            if (data.recentLogs) {
                const container = document.getElementById('recentLogsContainer');
                
                // Clear container safely
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
                
                // Create elements securely without innerHTML
                data.recentLogs.forEach(log => {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    logEntry.setAttribute('data-level', log.level);
                    
                    const timestamp = document.createElement('div');
                    timestamp.className = 'log-timestamp';
                    timestamp.textContent = formatTimestamp(log.timestamp);
                    
                    const levelDiv = document.createElement('div');
                    levelDiv.className = 'log-level';
                    const badge = document.createElement('span');
                    badge.className = \`level-badge \${log.level}\`;
                    badge.textContent = log.level.toUpperCase();
                    levelDiv.appendChild(badge);
                    
                    const source = document.createElement('div');
                    source.className = 'log-source';
                    source.textContent = log.source || 'System';
                    
                    const message = document.createElement('div');
                    message.className = 'log-message';
                    message.textContent = log.message; // textContent is XSS-safe
                    
                    logEntry.appendChild(timestamp);
                    logEntry.appendChild(levelDiv);
                    logEntry.appendChild(source);
                    logEntry.appendChild(message);
                    
                    container.appendChild(logEntry);
                });
            }
        }

        // Dashboard Switching
        function switchDashboard() {
            const select = document.getElementById('dashboardSelect');
            const dashboardId = select.value;
            
            if (dashboardId === 'default') {
                // Stay on current page
                return;
            } else {
                // Redirect to custom dashboard
                window.location.href = \`/dashboard/builder/\${dashboardId}\`;
            }
        }

        // Layout Persistence
        function saveLayoutToLocalStorage() {
            if (grid) {
                const layout = grid.save();
                localStorage.setItem('dashboardLayout', JSON.stringify(layout));
            }
        }

        function loadLayoutFromLocalStorage() {
            try {
                const saved = localStorage.getItem('dashboardLayout');
                if (saved && grid) {
                    const layout = JSON.parse(saved);
                    grid.load(layout);
                }
            } catch (error) {
                // Layout loading error - using default layout
            }
        }

        // Utility Functions
        function formatTimestamp(timestamp) {
            try {
                return new Date(timestamp).toLocaleString('en-US', {
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

        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }

        // Cleanup on unload
        window.addEventListener('beforeunload', function() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        });
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
                    timeZone: req.systemSettings?.timezone || 'America/Edmonton',
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
            pageTitle: 'System Dashboard',
            pageIcon: 'fa-tachometer-alt', 
            activeNav: 'dashboard',
            contentBody,
            additionalCSS,
            additionalJS,
            req
        });

        res.send(html);

    } catch (error) {
        console.error('Dashboard route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Dashboard Refresh API - Get updated data for auto-refresh
 * GET /api/dashboard/refresh
 */
router.get('/api/refresh', async (req, res) => {
    try {
        const stats = await req.dal.getSystemStats();
        const recentLogs = await req.dal.getRecentLogs(20);
        const systemHealth = await req.dal.getSystemHealth();
        
        res.json({
            success: true,
            stats,
            recentLogs,
            systemHealth,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Dashboard refresh API error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to refresh dashboard data' 
        });
    }
});

module.exports = router;