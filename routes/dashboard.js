/**nhanced Dashboard with Muuri Grid + Apache ECharts
 * Features:
 * - Free-form draggable widgets (no rigid grid)
 * - Overlapping support
 * - Smooth animations
 * - Enterprise-grade charts with ECharts
 * - Unlimited customizability
 */

const express = require('express');
const router = express.Router();
const { getPageTemplate } = require('../configs/templates/base');

router.get('/', async (req, res) => {
    try {
        // Override CSP for dashboard to allow CDN resources
        res.setHeader('Content-Security-Policy', 
            "default-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com https://use.fontawesome.com https://unpkg.com blob:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com blob:; " +
            "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; " +
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://use.fontawesome.com https://cdnjs.cloudflare.com; " +
            "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://use.fontawesome.com https://cdnjs.cloudflare.com; " +
            "style-src-attr 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://use.fontawesome.com https://cdnjs.cloudflare.com; " +
            "img-src 'self' data: https: blob:; " +
            "font-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.gstatic.com https://use.fontawesome.com https://cdnjs.cloudflare.com data:; " +
            "connect-src 'self' ws: wss: https: http:; "
        );
        
        // Fetch dashboard data
        const stats = await req.dal.getSystemStats() || {};
        const recentLogs = await req.dal.getRecentLogs(20) || [];
        const systemHealth = await req.dal.getSystemHealth() || {};
        const logSources = await req.dal.getLogSources() || [];

        // Get log level distribution for pie chart
        let logLevelStats = [];
        try {
            logLevelStats = await req.dal.all(`
                SELECT level, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= datetime('now', 'localtime', '-24 hours') 
                GROUP BY level 
                ORDER BY count DESC
            `) || [];
        } catch (error) {
            req.app.locals?.loggers?.system?.error('Error getting log level stats:', error);
        }

        // Get hourly log distribution for timeline chart
        let hourlyStats = [];
        try {
            hourlyStats = await req.dal.all(`
                SELECT 
                    strftime('%H:00', timestamp) as hour,
                    COUNT(*) as count,
                    level
                FROM logs 
                WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
                GROUP BY hour, level
                ORDER BY hour
            `) || [];
        } catch (error) {
            req.app.locals?.loggers?.system?.error('Error getting hourly stats:', error);
        }

        // Get integration health stats
        let integrationStats = [];
        try {
            // First try integration_health table (group by integration_name)
            integrationStats = await req.dal.all(`
                SELECT 
                    integration_name AS type,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy
                FROM integration_health
                GROUP BY integration_name
            `) || [];
            
            // If no data, check integrations table or create sample data
            if (!integrationStats || integrationStats.length === 0) {
                const integrations = await req.dal.all(`SELECT type, config FROM integrations WHERE enabled = 1`) || [];
                if (integrations.length > 0) {
                    integrationStats = integrations.map(i => ({
                        type: i.type || 'Unknown',
                        total: 1,
                        healthy: 1
                    }));
                } else {
                    // Show helpful empty state
                    integrationStats = [
                        { type: 'No Integrations', total: 0, healthy: 0 }
                    ];
                }
            }
        } catch (error) {
            req.app.locals?.loggers?.system?.error('Error getting integration stats:', error);
            integrationStats = [{ type: 'Error Loading', total: 0, healthy: 0 }];
        }

        const contentBody = `
    <!-- Muuri + ECharts Dashboard -->
    <!-- Local vendor assets (no external DNS required) -->
    <link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script src="/vendor/muuri/muuri.min.js"></script>
    <script src="/vendor/echarts/echarts.min.js"></script>
        
    <style>
        /* Muuri Grid Styles */
        .dashboard-grid {
            position: relative;
            width: 100%;
            min-height: calc(100vh - 200px);
        }
        
        .widget-item {
            position: absolute;
            display: block;
            margin: 5px;
            z-index: 1;
        }
        
        .widget-item.muuri-item-dragging {
            z-index: 3;
        }
        
        .widget-item.muuri-item-releasing {
            z-index: 2;
        }
        
        .widget-item.muuri-item-hidden {
            z-index: 0;
        }
        
        .widget-item-content {
            width: 100%;
            height: 100%;
            cursor: move;
        }
        
        .widget-item-content:active {
            cursor: grabbing;
        }
        
        /* Widget sizing - all widgets resizable */
        .widget-small { width: 300px; height: 200px; resize: both; overflow: hidden; }
        .widget-medium { width: 400px; height: 350px; resize: both; overflow: hidden; }
        .widget-large { width: 500px; height: 450px; resize: both; overflow: hidden; }
        .widget-wide { width: 600px; height: 350px; resize: both; overflow: hidden; }
        .widget-full { width: calc(100% - 20px); min-width: 800px; height: 280px; resize: both; overflow: hidden; }
        .widget-tall { width: 400px; height: 550px; resize: both; overflow: hidden; }
        
        /* Resize handle indicator */
        .widget-item::after {
            content: '';
            position: absolute;
            bottom: 2px;
            right: 2px;
            width: 12px;
            height: 12px;
            background: linear-gradient(135deg, transparent 50%, var(--border-color) 50%);
            pointer-events: none;
            opacity: 0.5;
        }
        
        /* Widget card */
        .widget-card {
            height: 100%;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            box-shadow: var(--shadow-small);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: box-shadow 0.2s ease;
        }
        
        .widget-item.muuri-item-dragging .widget-card {
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border-color: var(--accent-primary);
        }
        
        .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-secondary);
            border-radius: 12px 12px 0 0;
            cursor: move;
        }
        
        .widget-header:active {
            cursor: grabbing;
        }
        
        .widget-header h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1rem;
            font-weight: 600;
        }
        
        .widget-actions {
            display: flex;
            gap: 8px;
        }
        
        .btn-icon {
            background: none;
            border: none;
            color: var(--text-muted);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .btn-icon:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }
        
        .widget-content {
            flex: 1;
            padding: 16px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .chart-container {
            width: 100%;
            height: 100%;
            min-height: 150px;
        }
        
        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 10px;
            height: 100%;
            align-content: start;
        }
        
        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            text-align: center;
            min-height: 120px;
        }
        
        .stat-icon {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gradient-ocean);
            border-radius: 50%;
            color: white;
            font-size: 1.1rem;
            margin-bottom: 6px;
        }
        
        .stat-value {
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 3px;
        }
        
        .stat-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-badge.healthy { background: #10b981; color: white; }
        .status-badge.degraded { background: #f59e0b; color: white; }
        .status-badge.unhealthy { background: #ef4444; color: white; }
        .status-badge.unknown { background: #6b7280; color: white; }
        
        /* Dashboard Controls */
        .dashboard-controls {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            padding: 16px;
            background: var(--bg-primary);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }
        
        .control-btn {
            padding: 8px 16px;
            border: 1px solid var(--border-color);
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.875rem;
            transition: all 0.2s ease;
        }
        
        .control-btn:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent-primary);
        }
        
        .control-btn.active {
            background: var(--accent-primary);
            border-color: var(--accent-primary);
            color: white;
        }
        </style>

        <!-- Dashboard Controls -->
        <div class="dashboard-controls">
            <button class="control-btn active" onclick="toggleLock()">
                <i class="fas fa-lock-open"></i> <span id="lockText">Unlocked</span>
            </button>
            <button class="control-btn" onclick="resetLayout()">
                <i class="fas fa-undo"></i> Reset Layout
            </button>
            <button class="control-btn" onclick="saveLayout()">
                <i class="fas fa-save"></i> Save Layout
            </button>
            <button class="control-btn" onclick="addWidget()">
                <i class="fas fa-plus"></i> Add Widget
            </button>
            <button class="control-btn" onclick="refreshAllWidgets()">
                <i class="fas fa-sync"></i> Refresh All
            </button>
        </div>

        <!-- Dashboard Grid -->
        <div class="dashboard-grid" id="dashboardGrid">
            
            <!-- System Stats Widget -->
            <div class="widget-item widget-full" data-widget-id="system-stats">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-bar"></i> System Overview</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('system-stats')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-database"></i></div>
                                    <div class="stat-value" id="totalLogs">${(stats.totalLogs || 0).toLocaleString()}</div>
                                    <div class="stat-label">Total Logs</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
                                    <div class="stat-value" id="logsToday">${(stats.logsToday || 0).toLocaleString()}</div>
                                    <div class="stat-label">Logs Today</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-server"></i></div>
                                    <div class="stat-value" id="sources">${logSources.length}</div>
                                    <div class="stat-label">Active Sources</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-plug"></i></div>
                                    <div class="stat-value" id="integrations">${integrationStats.length}</div>
                                    <div class="stat-label">Integrations</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon"><i class="fas fa-heartbeat"></i></div>
                                    <div class="stat-value">
                                        <span class="status-badge ${systemHealth.status || 'unknown'}">${(systemHealth.status || 'UNKNOWN').toUpperCase()}</span>
                                    </div>
                                    <div class="stat-label">System Health</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Log Levels Chart -->
            <div class="widget-item widget-medium" data-widget-id="log-levels">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-pie"></i> Log Levels (24h)</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('log-levels')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="chart-container" id="logLevelsChart"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- System Metrics -->
            <div class="widget-item widget-medium" data-widget-id="system-metrics">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-tachometer-alt"></i> System Metrics</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('system-metrics')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="chart-container" id="systemMetricsChart"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Hourly Timeline -->
            <div class="widget-item widget-wide" data-widget-id="timeline">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-chart-line"></i> Log Activity Timeline (24h)</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('timeline')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="chart-container" id="timelineChart"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Integration Health -->
            <div class="widget-item widget-medium" data-widget-id="integrations">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-plug"></i> Integration Health</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('integrations')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="chart-container" id="integrationsChart"></div>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <script>
        let grid;
        let charts = {};
        let isLocked = false;
        
        // Initialize Dashboard
        document.addEventListener('DOMContentLoaded', function() {
            initializeGrid();
            initializeCharts();
            loadSavedLayout();
            req.app.locals?.loggers?.system?.info('🎨 Muuri Dashboard initialized');
        });
        
        // Initialize Muuri Grid
        function initializeGrid() {
            grid = new Muuri('.dashboard-grid', {
                dragEnabled: true,
                dragHandle: '.widget-header',
                dragSortHeuristics: {
                    sortInterval: 50,
                    minDragDistance: 10,
                    minBounceBackAngle: 1
                },
                layoutDuration: 300,
                layoutEasing: 'ease-out',
                dragRelease: {
                    duration: 300,
                    easing: 'ease-out'
                }
            });
            
            // Save layout on drag end
            grid.on('dragEnd', function() {
                if (!isLocked) {
                    autoSaveLayout();
                }
            });
        }
        
        // Initialize All Charts
        function initializeCharts() {
            // Helper to render a consistent empty-state chart
            function renderEmptyChart(elId, title, subtext, emoji = '📭') {
                const chart = echarts.init(document.getElementById(elId));
                chart.setOption({
                    title: {
                        text: title,
                        subtext: subtext,
                        left: 'center',
                        top: 'center',
                        textStyle: { color: '#94a3b8', fontSize: 16 },
                        subtextStyle: { color: '#64748b', fontSize: 12 }
                    },
                    graphic: {
                        type: 'text',
                        left: 'center',
                        top: '45%',
                        style: { text: emoji, fontSize: 48, fill: '#cbd5e1' }
                    }
                });
                return chart;
            }

            const logLevelData = ${JSON.stringify(logLevelStats)};
            const hourlyData = ${JSON.stringify(hourlyStats)};
            const systemData = ${JSON.stringify(systemHealth)};
            const integrationData = ${JSON.stringify(integrationStats)};
            
            // Log Levels Pie Chart
            if (logLevelData.length > 0) {
                const chart = echarts.init(document.getElementById('logLevelsChart'));
                chart.setOption({
                    tooltip: {
                        trigger: 'item',
                        formatter: '{b}: {c} ({d}%)'
                    },
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        avoidLabelOverlap: false,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: '#fff',
                            borderWidth: 2
                        },
                        label: {
                            show: true,
                            position: 'outside'
                        },
                        data: logLevelData.map(d => ({
                            value: d.count,
                            name: d.level.toUpperCase(),
                            itemStyle: {
                                color: {
                                    'info': '#3b82f6',
                                    'warning': '#f59e0b',
                                    'error': '#ef4444',
                                    'debug': '#6b7280'
                                }[d.level] || '#6b7280'
                            }
                        }))
                    }]
                });
                charts.logLevels = chart;
            } else {
                // Empty state for Log Levels
                charts.logLevels = renderEmptyChart(
                    'logLevelsChart',
                    'No Logs in Last 24h',
                    'Adjust time range or verify logging sources',
                    '📊'
                );
            }
            
            // System Metrics Gauge
            const cpu = systemData.cpu || 0;
            const mem = systemData.memory || 0;
            const disk = systemData.disk || 0;
            
            const metricsChart = echarts.init(document.getElementById('systemMetricsChart'));
            metricsChart.setOption({
                tooltip: {
                    formatter: '{b}: {c}%'
                },
                series: [
                    {
                        name: 'CPU',
                        type: 'gauge',
                        center: ['16%', '50%'],
                        radius: '80%',
                        min: 0,
                        max: 100,
                        splitNumber: 5,
                        axisLine: {
                            lineStyle: {
                                width: 10,
                                color: [[0.6, '#10b981'], [0.8, '#f59e0b'], [1, '#ef4444']]
                            }
                        },
                        pointer: { width: 4 },
                        title: { offsetCenter: [0, '80%'], fontSize: 12 },
                        detail: { formatter: '{value}%', fontSize: 16 },
                        data: [{ value: cpu, name: 'CPU' }]
                    },
                    {
                        name: 'Memory',
                        type: 'gauge',
                        center: ['50%', '50%'],
                        radius: '80%',
                        min: 0,
                        max: 100,
                        splitNumber: 5,
                        axisLine: {
                            lineStyle: {
                                width: 10,
                                color: [[0.6, '#10b981'], [0.8, '#f59e0b'], [1, '#ef4444']]
                            }
                        },
                        pointer: { width: 4 },
                        title: { offsetCenter: [0, '80%'], fontSize: 12 },
                        detail: { formatter: '{value}%', fontSize: 16 },
                        data: [{ value: mem, name: 'Memory' }]
                    },
                    {
                        name: 'Disk',
                        type: 'gauge',
                        center: ['84%', '50%'],
                        radius: '80%',
                        min: 0,
                        max: 100,
                        splitNumber: 5,
                        axisLine: {
                            lineStyle: {
                                width: 10,
                                color: [[0.6, '#10b981'], [0.8, '#f59e0b'], [1, '#ef4444']]
                            }
                        },
                        pointer: { width: 4 },
                        title: { offsetCenter: [0, '80%'], fontSize: 12 },
                        detail: { formatter: '{value}%', fontSize: 16 },
                        data: [{ value: disk, name: 'Disk' }]
                    }
                ]
            });
            charts.systemMetrics = metricsChart;
            
            // Timeline Chart
            if (hourlyData.length > 0) {
                const hours = [...new Set(hourlyData.map(d => d.hour))].sort();
                const levels = ['info', 'warning', 'error', 'debug'];
                
                const series = levels.map(level => ({
                    name: level.toUpperCase(),
                    type: 'line',
                    stack: 'Total',
                    smooth: true,
                    areaStyle: {},
                    emphasis: { focus: 'series' },
                    data: hours.map(hour => {
                        const item = hourlyData.find(d => d.hour === hour && d.level === level);
                        return item ? item.count : 0;
                    }),
                    itemStyle: {
                        color: {
                            'info': '#3b82f6',
                            'warning': '#f59e0b',
                            'error': '#ef4444',
                            'debug': '#6b7280'
                        }[level]
                    }
                }));
                
                const timelineChart = echarts.init(document.getElementById('timelineChart'));
                timelineChart.setOption({
                    tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'cross' }
                    },
                    legend: {
                        data: levels.map(l => l.toUpperCase()),
                        bottom: 0
                    },
                    grid: {
                        left: '3%',
                        right: '4%',
                        bottom: '15%',
                        top: '3%',
                        containLabel: true
                    },
                    xAxis: {
                        type: 'category',
                        boundaryGap: false,
                        data: hours
                    },
                    yAxis: { type: 'value' },
                    series: series
                });
                charts.timeline = timelineChart;
            } else {
                // Empty state for Timeline
                charts.timeline = renderEmptyChart(
                    'timelineChart',
                    'No Activity in Last 24h',
                    'No logs recorded during this period',
                    '⏱️'
                );
            }
            
            // Integration Health Chart
            const intChart = echarts.init(document.getElementById('integrationsChart'));
            if (integrationData.length > 0 && integrationData[0].type !== 'No Integrations' && integrationData[0].type !== 'Error Loading') {
                intChart.setOption({
                    tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' }
                    },
                    legend: {
                        data: ['Total', 'Healthy'],
                        bottom: 0
                    },
                    grid: {
                        left: '3%',
                        right: '4%',
                        bottom: '15%',
                        top: '3%',
                        containLabel: true
                    },
                    xAxis: {
                        type: 'category',
                        data: integrationData.map(d => d.type)
                    },
                    yAxis: { type: 'value' },
                    series: [
                        {
                            name: 'Total',
                            type: 'bar',
                            data: integrationData.map(d => d.total),
                            itemStyle: { color: '#3b82f6' }
                        },
                        {
                            name: 'Healthy',
                            type: 'bar',
                            data: integrationData.map(d => d.healthy),
                            itemStyle: { color: '#10b981' }
                        }
                    ]
                });
                charts.integrations = intChart;
            } else if (integrationData.length > 0 && integrationData[0].type === 'Error Loading') {
                // Show error state message
                intChart.setOption({
                    title: {
                        text: 'Failed to Load Integrations',
                        subtext: 'Check server logs and database connectivity',
                        left: 'center',
                        top: 'center',
                        textStyle: {
                            color: '#ef4444',
                            fontSize: 16
                        },
                        subtextStyle: {
                            color: '#b91c1c',
                            fontSize: 12
                        }
                    },
                    graphic: {
                        type: 'text',
                        left: 'center',
                        top: '45%',
                        style: {
                            text: '⚠️',
                            fontSize: 48,
                            fill: '#fca5a5'
                        }
                    }
                });
                charts.integrations = intChart;
            } else {
                // Show empty state message
                intChart.setOption({
                    title: {
                        text: 'No Integrations Configured',
                        subtext: 'Visit Integrations page to add services',
                        left: 'center',
                        top: 'center',
                        textStyle: {
                            color: '#94a3b8',
                            fontSize: 16
                        },
                        subtextStyle: {
                            color: '#64748b',
                            fontSize: 12
                        }
                    },
                    graphic: {
                        type: 'text',
                        left: 'center',
                        top: '45%',
                        style: {
                            text: '🔌',
                            fontSize: 48,
                            fill: '#cbd5e1'
                        }
                    }
                });
                charts.integrations = intChart;
            }
            
            // Resize charts on window resize
            window.addEventListener('resize', function() {
                Object.values(charts).forEach(chart => chart.resize());
            });
        }
        
        // Dashboard Controls
        function toggleLock() {
            isLocked = !isLocked;
            grid.setOptions({ dragEnabled: !isLocked });
            document.getElementById('lockText').textContent = isLocked ? 'Locked' : 'Unlocked';
            document.querySelector('.control-btn').classList.toggle('active');
        }
        
        async function resetLayout() {
            if (!confirm('Reset dashboard to default layout?')) return;
            try {
                await fetch('/api/dashboard/reset-positions', { method: 'POST' });
            } catch (e) {
                // ignore network/server errors; fallback to local only
            }
            localStorage.removeItem('dashboardLayout');
            location.reload();
        }
        
        async function saveLayout() {
            const items = grid.getItems();
            const layout = items.map(item => {
                const elem = item.getElement();
                const rect = elem.getBoundingClientRect();
                return {
                    id: elem.getAttribute('data-widget-id'),
                    left: item.getPosition().left,
                    top: item.getPosition().top,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
            });
            try {
                const res = await fetch('/api/dashboard/positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ layout })
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
                showToast && showToast('Layout saved', 'success');
            } catch (err) {
                req.app.locals?.loggers?.system?.warn('Server save failed, falling back to localStorage:', err.message);
                localStorage.setItem('dashboardLayout', JSON.stringify(layout));
                alert('Layout saved locally');
            }
        }
        
        async function autoSaveLayout() {
            const items = grid.getItems();
            const layout = items.map(item => {
                const elem = item.getElement();
                const rect = elem.getBoundingClientRect();
                return {
                    id: elem.getAttribute('data-widget-id'),
                    left: item.getPosition().left,
                    top: item.getPosition().top,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
            });
            try {
                await fetch('/api/dashboard/positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ layout })
                });
            } catch (err) {
                localStorage.setItem('dashboardLayout', JSON.stringify(layout));
            }
        }
        
        async function loadSavedLayout() {
            let layout = null;
            try {
                const res = await fetch('/api/dashboard/positions');
                const data = await res.json();
                if (res.ok && data.success && Array.isArray(data.layout) && data.layout.length) {
                    layout = data.layout;
                }
            } catch {}

            // Fallback to localStorage if server has nothing
            if (!layout) {
                const saved = localStorage.getItem('dashboardLayout');
                if (saved) {
                    try { layout = JSON.parse(saved); } catch {}
                }
            }
            if (!layout || !Array.isArray(layout) || layout.length === 0) return;

            const items = grid.getItems();
            layout.forEach(savedItem => {
                const item = items.find(i => i.getElement().getAttribute('data-widget-id') === savedItem.id);
                if (!item) return;
                const el = item.getElement();
                if (savedItem.width && savedItem.height) {
                    el.style.width = savedItem.width + 'px';
                    el.style.height = savedItem.height + 'px';
                }
                if (typeof item._setTranslate === 'function') {
                    try { item._setTranslate(savedItem.left || 0, savedItem.top || 0); }
                    catch (e) { el.style.transform = 'translate(' + (savedItem.left || 0) + 'px, ' + (savedItem.top || 0) + 'px)'; }
                } else {
                    el.style.transform = 'translate(' + (savedItem.left || 0) + 'px, ' + (savedItem.top || 0) + 'px)';
                }
            });
            grid.refreshItems();
            setTimeout(() => {
                try { Object.values(charts).forEach(c => c && c.resize && c.resize()); } catch (err) {}
            }, 50);
        }
        
        function removeWidget(widgetId) {
            if (confirm('Remove this widget?')) {
                const items = grid.getItems();
                const item = items.find(i => 
                    i.getElement().getAttribute('data-widget-id') === widgetId
                );
                if (item) {
                    grid.remove(item, { removeElements: true });
                }
            }
        }
        
        function addWidget() {
            openModal('widgetMarketplace');
        }
        
        function refreshAllWidgets() {
            location.reload();
        }
        </script>
        
        <!-- Widget Marketplace Modal -->
        <div id="widgetMarketplace" class="modal">
            <div class="modal-content" style="max-width: 1000px; max-height: 80vh;">
                <div class="modal-header">
                    <h2><i class="fas fa-store"></i> Widget Marketplace</h2>
                    <button class="btn-icon" onclick="closeModal('widgetMarketplace')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- Search and Filter -->
                    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                        <input type="text" id="widgetSearch" placeholder="Search widgets..." 
                            style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary);"
                            oninput="filterWidgets()">
                        <select id="widgetCategory" 
                            style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary);"
                            onchange="filterWidgets()">
                            <option value="all">All Categories</option>
                            <option value="analytics">Analytics & Metrics</option>
                            <option value="monitoring">Monitoring & Alerts</option>
                            <option value="data">Data Views</option>
                            <option value="actions">Quick Actions</option>
                            <option value="system">System Tools</option>
                            <option value="custom">Custom Visualizations</option>
                        </select>
                    </div>
                    
                    <!-- Widget Grid -->
                    <div id="widgetGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; max-height: 500px; overflow-y: auto;"></div>
                </div>
            </div>
        </div>
        
        <style>
        .modal {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .modal.active { display: flex; }
        .modal-content {
            background: var(--bg-primary);
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            width: 100%;
            display: flex;
            flex-direction: column;
            max-height: 90vh;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
        }
        .modal-header h2 {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .modal-body {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
        }
        .widget-card-market {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .widget-card-market:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
            border-color: var(--accent-primary);
        }
        .widget-card-market h3 {
            margin: 0 0 0.5rem 0;
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-primary);
        }
        .widget-card-market p {
            margin: 0 0 1rem 0;
            font-size: 0.85rem;
            color: var(--text-muted);
            line-height: 1.4;
        }
        .widget-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            background: var(--gradient-ocean);
            color: white;
            border-radius: 4px;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        </style>
        
        <script>
        // Widget Marketplace Data
        const widgetCatalog = [
            // Analytics & Metrics
            { id: 'log-rate-graph', name: 'Log Rate Graph', icon: 'chart-line', category: 'analytics', description: 'Real-time log ingestion rate over time', size: 'wide' },
            { id: 'error-rate-trend', name: 'Error Rate Trends', icon: 'chart-area', category: 'analytics', description: 'Track error frequency and patterns', size: 'medium' },
            { id: 'response-histogram', name: 'Response Time Histogram', icon: 'chart-bar', category: 'analytics', description: 'Distribution of response times', size: 'medium' },
            { id: 'top-errors', name: 'Top Error Messages', icon: 'exclamation-triangle', category: 'analytics', description: 'Most frequent error messages', size: 'medium' },
            { id: 'log-heatmap', name: 'Log Volume Heatmap', icon: 'th', category: 'analytics', description: 'Activity patterns by hour and day', size: 'wide' },
            { id: 'source-comparison', name: 'Source Comparison', icon: 'balance-scale', category: 'analytics', description: 'Compare log volumes across sources', size: 'medium' },
            { id: 'severity-distribution', name: 'Severity Distribution', icon: 'layer-group', category: 'analytics', description: 'Breakdown of log severity levels', size: 'small' },
            { id: 'hourly-breakdown', name: 'Hourly Breakdown', icon: 'clock', category: 'analytics', description: '24-hour activity breakdown', size: 'wide' },
            
            // Monitoring & Alerts
            { id: 'active-alerts', name: 'Active Alerts', icon: 'bell', category: 'monitoring', description: 'Current system alerts and warnings', size: 'medium' },
            { id: 'error-threshold', name: 'Error Threshold Monitor', icon: 'tachometer-alt', category: 'monitoring', description: 'Alert when errors exceed threshold', size: 'small' },
            { id: 'service-health', name: 'Service Health Checks', icon: 'heartbeat', category: 'monitoring', description: 'Monitor integrated service status', size: 'medium' },
            { id: 'disk-gauge', name: 'Disk Usage Gauge', icon: 'hdd', category: 'monitoring', description: 'Real-time disk space monitoring', size: 'small' },
            { id: 'memory-cpu-trend', name: 'Memory/CPU Trends', icon: 'microchip', category: 'monitoring', description: 'System resource usage over time', size: 'medium' },
            { id: 'uptime-tracker', name: 'Uptime Tracker', icon: 'clock', category: 'monitoring', description: 'Service uptime and availability', size: 'small' },
            { id: 'log-anomaly', name: 'Anomaly Detector', icon: 'search', category: 'monitoring', description: 'Detect unusual log patterns', size: 'medium' },
            { id: 'sla-monitor', name: 'SLA Monitor', icon: 'certificate', category: 'monitoring', description: 'Track SLA compliance metrics', size: 'small' },
            
            // Data Views
            { id: 'recent-errors', name: 'Recent Errors', icon: 'list', category: 'data', description: 'Latest error log entries', size: 'medium' },
            { id: 'live-stream', name: 'Live Log Stream', icon: 'stream', category: 'data', description: 'Real-time log feed', size: 'tall' },
            { id: 'search-results', name: 'Search Results', icon: 'search', category: 'data', description: 'Saved search query results', size: 'wide' },
            { id: 'filtered-table', name: 'Filtered Log Table', icon: 'table', category: 'data', description: 'Customizable log data table', size: 'wide' },
            { id: 'tag-cloud', name: 'Tag Cloud', icon: 'tags', category: 'data', description: 'Visual representation of log tags', size: 'medium' },
            { id: 'source-activity', name: 'Source Activity List', icon: 'server', category: 'data', description: 'Activity by log source', size: 'medium' },
            { id: 'user-activity', name: 'User Activity', icon: 'users', category: 'data', description: 'Track user actions and events', size: 'medium' },
            { id: 'event-timeline', name: 'Event Timeline', icon: 'stream', category: 'data', description: 'Chronological event visualization', size: 'wide' },
            
            // Quick Actions
            { id: 'quick-search', name: 'Quick Search', icon: 'search', category: 'actions', description: 'Instant search form widget', size: 'small' },
            { id: 'log-export', name: 'Log Exporter', icon: 'download', category: 'actions', description: 'Export logs to various formats', size: 'small' },
            { id: 'filter-presets', name: 'Filter Presets', icon: 'filter', category: 'actions', description: 'Save and apply filter combinations', size: 'small' },
            { id: 'bookmark-manager', name: 'Bookmark Manager', icon: 'bookmark', category: 'actions', description: 'Manage saved searches and views', size: 'medium' },
            { id: 'stats-calculator', name: 'Quick Stats', icon: 'calculator', category: 'actions', description: 'Calculate stats for selected data', size: 'small' },
            { id: 'bulk-actions', name: 'Bulk Actions', icon: 'tasks', category: 'actions', description: 'Perform actions on multiple logs', size: 'small' },
            { id: 'quick-notes', name: 'Quick Notes', icon: 'sticky-note', category: 'actions', description: 'Add annotations and notes', size: 'small' },
            
            // System Tools
            { id: 'integration-status', name: 'Integration Status', icon: 'plug', category: 'system', description: 'Monitor integration health', size: 'medium' },
            { id: 'webhook-tester', name: 'Webhook Tester', icon: 'link', category: 'system', description: 'Test webhook configurations', size: 'medium' },
            { id: 'database-stats', name: 'Database Stats', icon: 'database', category: 'system', description: 'Database size and performance', size: 'small' },
            { id: 'session-monitor', name: 'Session Monitor', icon: 'user-clock', category: 'system', description: 'Active user sessions', size: 'small' },
            { id: 'api-key-manager', name: 'API Key Manager', icon: 'key', category: 'system', description: 'Manage API keys and tokens', size: 'medium' },
            { id: 'backup-status', name: 'Backup Status', icon: 'save', category: 'system', description: 'Monitor backup operations', size: 'small' },
            { id: 'log-retention', name: 'Log Retention', icon: 'archive', category: 'system', description: 'Manage log retention policies', size: 'small' },
            { id: 'system-info', name: 'System Information', icon: 'info-circle', category: 'system', description: 'Platform version and details', size: 'small' },
            
            // Custom Visualizations
            { id: 'query-builder', name: 'Custom Query Builder', icon: 'code', category: 'custom', description: 'Build custom SQL queries', size: 'wide' },
            { id: 'saved-query', name: 'Saved Query Results', icon: 'table', category: 'custom', description: 'Display saved query output', size: 'wide' },
            { id: 'correlation-matrix', name: 'Correlation Matrix', icon: 'project-diagram', category: 'custom', description: 'Visualize data correlations', size: 'large' },
            { id: 'pattern-detection', name: 'Pattern Detector', icon: 'magic', category: 'custom', description: 'Identify recurring patterns', size: 'medium' },
            { id: 'custom-chart', name: 'Custom Chart', icon: 'chart-pie', category: 'custom', description: 'Create custom visualizations', size: 'medium' },
            { id: 'metric-formula', name: 'Metric Formula', icon: 'flask', category: 'custom', description: 'Define custom calculated metrics', size: 'small' },
            { id: 'data-transformer', name: 'Data Transformer', icon: 'random', category: 'custom', description: 'Transform and aggregate data', size: 'medium' },
            { id: 'geolocation-map', name: 'Geolocation Map', icon: 'map-marked-alt', category: 'custom', description: 'Map logs by geographic location', size: 'large' }
        ];
        
        function filterWidgets() {
            const search = document.getElementById('widgetSearch').value.toLowerCase();
            const category = document.getElementById('widgetCategory').value;
            
            const filtered = widgetCatalog.filter(w => {
                const matchesSearch = w.name.toLowerCase().includes(search) || w.description.toLowerCase().includes(search);
                const matchesCategory = category === 'all' || w.category === category;
                return matchesSearch && matchesCategory;
            });
            
            renderWidgetGrid(filtered);
        }
        
        function renderWidgetGrid(widgets) {
            const grid = document.getElementById('widgetGrid');
            grid.innerHTML = widgets.map(w => \`
                <div class="widget-card-market" onclick="installWidget('\${w.id}')">
                    <h3>
                        <i class="fas fa-\${w.icon}"></i>
                        \${w.name}
                    </h3>
                    <p>\${w.description}</p>
                    <span class="widget-badge">\${w.category}</span>
                </div>
            \`).join('');
        }
        
        function installWidget(widgetId) {
            const widget = widgetCatalog.find(w => w.id === widgetId);
            if (!widget) return;
            
            closeModal('widgetMarketplace');
            
            // Create widget HTML based on type
            const widgetHTML = generateWidgetHTML(widget);
            
            // Create widget element
            const div = document.createElement('div');
            div.className = 'widget-item widget-' + widget.size;
            div.setAttribute('data-widget-id', widget.id);
            div.innerHTML = \`
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-\${widget.icon}"></i> \${widget.name}</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('\${widget.id}')" class="btn-icon">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            \${widgetHTML}
                        </div>
                    </div>
                </div>
            \`;
            
            // Add to grid
            document.querySelector('.dashboard-grid').appendChild(div);
            grid.add(div);
            
            // Initialize widget data
            initializeWidgetData(widget.id);
            
            showToast(\`Added \${widget.name}\`, 'success');
        }
        
        function generateWidgetHTML(widget) {
            // Generate appropriate HTML based on widget category and type
            switch(widget.category) {
                case 'analytics':
                    return \`<div class="chart-container" id="chart-\${widget.id}"></div>\`;
                case 'monitoring':
                    return widget.size === 'small' 
                        ? \`<div class="stat-item"><div class="stat-icon"><i class="fas fa-\${widget.icon}"></i></div><div class="stat-value" id="val-\${widget.id}">--</div><div class="stat-label">\${widget.name}</div></div>\`
                        : \`<div class="chart-container" id="chart-\${widget.id}"></div>\`;
                case 'data':
                    return \`<div id="data-\${widget.id}" style="overflow-y: auto; height: 100%;"><p style="text-align:center; color: var(--text-muted); padding: 2rem;">Loading data...</p></div>\`;
                case 'actions':
                    return \`<div id="action-\${widget.id}" style="padding: 1rem;">\${getActionWidgetHTML(widget.id)}</div>\`;
                case 'system':
                    return \`<div id="system-\${widget.id}" style="text-align: center; padding: 2rem;"><i class="fas fa-\${widget.icon}" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 1rem;"></i><p style="color: var(--text-muted);">System widget ready</p></div>\`;
                case 'custom':
                    return \`<div class="chart-container" id="chart-\${widget.id}"></div>\`;
                default:
                    return \`<p>Widget loaded</p>\`;
            }
        }
        
        function getActionWidgetHTML(widgetId) {
            // Specific HTML for action widgets
            const templates = {
                'quick-search': \`
                    <input type="text" placeholder="Search logs..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">
                    <button class="btn" style="width: 100%;" onclick="alert('Search functionality coming soon')"><i class="fas fa-search"></i> Search</button>
                \`,
                'log-export': \`
                    <select style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">
                        <option>JSON</option>
                        <option>CSV</option>
                        <option>XML</option>
                    </select>
                    <button class="btn" style="width: 100%;" onclick="alert('Export functionality coming soon')"><i class="fas fa-download"></i> Export</button>
                \`,
                'filter-presets': \`
                    <button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="alert('Filter preset 1')">Errors Only</button>
                    <button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="alert('Filter preset 2')">Last Hour</button>
                    <button class="btn btn-secondary" style="width: 100%;" onclick="alert('Filter preset 3')">Critical Events</button>
                \`
            };
            return templates[widgetId] || '<p style="text-align: center; color: var(--text-muted);">Action widget ready</p>';
        }
        
        function initializeWidgetData(widgetId) {
            // Fetch and display widget-specific data
            // This is a placeholder - in production, make actual API calls
            setTimeout(() => {
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined') {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Sample Data', left: 'center', textStyle: { fontSize: 14 } },
                        tooltip: {},
                        xAxis: { data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
                        yAxis: {},
                        series: [{ type: 'line', data: [10, 20, 15, 30, 25, 40, 35], smooth: true }]
                    });
                }
                
                const val = document.getElementById('val-' + widgetId);
                if (val) {
                    val.textContent = Math.floor(Math.random() * 100);
                }
            }, 500);
        }
        
        // Initialize marketplace on page load
        document.addEventListener('DOMContentLoaded', () => {
            renderWidgetGrid(widgetCatalog);
        });
        </script>
        `;

        const html = getPageTemplate({
            pageTitle: 'Enhanced Dashboard',
            pageIcon: 'fa-tachometer-alt',
            activeNav: 'dashboard',
            contentBody,
            req
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Dashboard route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
