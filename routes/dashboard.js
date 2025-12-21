/** Enhanced Dashboard with Muuri Grid + Apache ECharts
 * Features:
 * - Free-form draggable widgets (no rigid grid)
 * - Overlapping support enabled
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
        // Disable caching AGGRESSIVELY + version parameter to force cache bust
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Add unique version to break browser cache
        res.setHeader('X-Dashboard-Version', Date.now().toString());
        
        // PERFORMANCE: Send HTML shell immediately, load data via AJAX
        // Only fetch critical data needed for initial render
        const stats = { totalLogs: 0, errors: 0, warnings: 0, devices: 0 };
        const recentLogs = [];
        const systemHealth = {};
        const logSources = [];
        const logLevelStats = [];
        const hourlyStats = [];
        const integrationStats = [];

        const contentBody = `
    <!-- Muuri + ECharts + Leaflet Dashboard -->
    <!-- Local vendor assets (no external DNS required) -->
    <link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
    <script src="/vendor/muuri/muuri.min.js"></script>
    <script src="/vendor/echarts/echarts.min.js"></script>
    <script src="/vendor/leaflet/leaflet.js"></script>
    
    <!-- Dashboard Main Script - External with cache busting -->
    <script src="/js/dashboard-main.js?v=${Date.now()}"></script>
    
    <!-- Widget System scripts moved below primary initialization script to ensure dependencies are defined first -->
        
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
        
        /* Widget sizing - VERSION 20251208-2132 - all widgets resizable */
        .widget-small { width: 240px; height: 200px; min-width: 200px; min-height: 160px; max-width: 960px; max-height: 640px; }
        .widget-medium { width: 320px; height: 320px; min-width: 240px; min-height: 240px; max-width: 960px; max-height: 640px; }
        .widget-large { width: 400px; height: 400px; min-width: 320px; min-height: 320px; max-width: 960px; max-height: 640px; }
        .widget-wide { width: 480px; height: 320px; min-width: 360px; min-height: 240px; max-width: 960px; max-height: 640px; }
        .widget-full { width: calc(100% - 20px); min-width: 640px; height: 280px; min-height: 200px; max-width: 100%; max-height: 640px; }
        .widget-tall { width: 320px; height: 480px; min-width: 240px; min-height: 360px; max-width: 960px; max-height: 800px; }
        
        /* Make widget-item-content resizable */
        .widget-item-content {
            resize: both;
            overflow: auto;
            position: relative;
        }
        
        /* Resize handle indicator - visible and clickable */
        .widget-item-content::after {
            content: '';
            position: absolute;
            bottom: 0;
            right: 0;
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, transparent 40%, var(--border-color) 40%, var(--border-color) 45%, transparent 45%, transparent 55%, var(--border-color) 55%, var(--border-color) 60%, transparent 60%);
            cursor: nwse-resize;
            z-index: 10;
            opacity: 0.6;
            pointer-events: auto;
        }
        
        .widget-item-content:hover::after {
            opacity: 1;
            background: linear-gradient(135deg, transparent 40%, var(--accent-primary) 40%, var(--accent-primary) 45%, transparent 45%, transparent 55%, var(--accent-primary) 55%, var(--accent-primary) 60%, transparent 60%);
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
            padding: 6px 12px;
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
            font-size: 0.875rem;
            font-weight: 600;
            line-height: 1.2;
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
            overflow: auto;
            display: flex;
            flex-direction: column;
            color: #e2e8f0; /* Light grey/white text for readability */
            min-height: 0; /* Allow flex child to shrink below content size */
        }
        
        /* Ensure all text inside widgets is readable */
        .widget-content * {
            color: inherit;
        }
        
        .widget-content strong {
            color: #f1f5f9; /* Slightly brighter white for emphasis */
        }
        
        .widget-content small {
            color: #cbd5e1; /* Medium grey for secondary text */
        }
        
        .chart-container {
            width: 100%;
            height: 100%;
            min-height: 250px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        /* Ensure embedded media/content scale with widget size */
        .widget-content img,
        .widget-content video,
        .widget-content iframe,
        .widget-content object,
        .widget-content embed,
        .widget-content canvas {
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            display: block;
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
            color: #f8fafc; /* Bright white for stat values */
            margin-bottom: 3px;
        }
        
        .stat-label {
            font-size: 0.7rem;
            color: #cbd5e1; /* Light grey for labels */
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        /* Status badge styles moved to base template */
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
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
                                <button onclick="removeWidget('system-stats')" class="btn-icon" aria-label="Remove System Overview widget">
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
                                <button onclick="removeWidget('log-levels')" class="btn-icon" aria-label="Remove Log Levels widget">
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
                                <button onclick="removeWidget('system-metrics')" class="btn-icon" aria-label="Remove System Metrics widget">
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
                                <button onclick="removeWidget('timeline')" class="btn-icon" aria-label="Remove Log Activity Timeline widget">
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
                                <button onclick="removeWidget('integrations')" class="btn-icon" aria-label="Remove Integration Health widget">
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

            <!-- Geolocation Map Widget -->
            <div class="widget-item widget-wide" data-widget-id="geolocation-map">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="fas fa-map-marked-alt"></i> Geographic Distribution</h3>
                            <div class="widget-actions">
                                <button onclick="removeWidget('geolocation-map')" class="btn-icon" aria-label="Remove Geographic Distribution widget">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            <div class="chart-container" id="chart-geolocation-map"></div>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <script>
        // VERSION CHECK: ${Date.now()} - If you see this in console, cache is working!
        console.log('📦 Dashboard inline script loading... Version:', ${Date.now()});
        // NOTE: 'grid' variable is declared in external dashboard-main.js to avoid conflicts
        let charts = {};
        let isLocked = false;
        let resizeObserverReady = false; // Flag to prevent auto-save during initial load
        const DEBUG_LAYOUT_LOG = true; // Detailed per-widget layout logging
        
        // Timezone-aware timestamp formatter
        const USER_TIMEZONE = '${req.systemSettings?.timezone || 'UTC'}';
        function formatTimestamp(timestamp, options = {}) {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(timestamp);
                const defaultOptions = {
                    timeZone: USER_TIMEZONE,
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                };
                return date.toLocaleString('en-US', { ...defaultOptions, ...options });
            } catch (error) {
                console.error('Error formatting timestamp:', error);
                return timestamp;
            }
        }
        
        function formatTime(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(timestamp);
                return date.toLocaleTimeString('en-US', {
                    timeZone: USER_TIMEZONE,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            } catch (error) {
                console.error('Error formatting time:', error);
                return timestamp;
            }
        }
        
        // NOTE: Main initialization moved to /js/dashboard-main.js for better cache control
        // The external file includes: initializeGrid(), refreshSystemStats(), formatTimestamp(), etc.

        // Resize Observer to react when user resizes widgets (CSS resize)
        function setupResizeObservers() {
            try {
                const debouncedResize = debounce(() => {
                    try { Object.values(charts).forEach(c => c && c.resize && c.resize()); } catch (e) { /* Chart resize non-critical */ }
                }, 60);
                
                // Auto-save layout after resize completes (debounced to avoid excessive saves)
                const debouncedSave = debounce(() => {
                    if (!isLocked && resizeObserverReady) {
                        console.log('🔄 Auto-saving layout after resize...');
                        autoSaveLayout();
                    }
                }, 1000); // Wait 1 second after resize stops before saving
                
                const ro = new ResizeObserver((entries) => {
                    debouncedResize();
                    if (resizeObserverReady) {
                        console.log('📏 Resize detected on', entries.length, 'element(s)');
                        debouncedSave();
                    }
                });
                // Observe both .widget-item AND .widget-item-content (CSS resize is on content)
                document.querySelectorAll('.widget-item, .widget-item-content').forEach(el => ro.observe(el));
                // Keep reference to avoid GC
                window._widgetResizeObserver = ro;
                
                // Enable auto-save after a short delay
                setTimeout(() => {
                    resizeObserverReady = true;
                    console.log('✅ Resize auto-save enabled');
                }, 500);
            } catch (e) {
                console.warn('ResizeObserver not available, widget auto-resize disabled');
            }
        }

        // Tiny debounce helper
        function debounce(fn, wait) {
            let t;
            return function() {
                const ctx = this, args = arguments;
                clearTimeout(t);
                t = setTimeout(() => fn.apply(ctx, args), wait);
            };
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
                        textStyle: { color: '#e2e8f0', fontSize: 16 },
                        subtextStyle: { color: '#cbd5e1', fontSize: 12 }
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

            // PERFORMANCE: Load data via AJAX instead of embedding in HTML
            // Show loading state immediately
            renderEmptyChart('logLevelsChart', 'Loading...', 'Fetching dashboard data', '⏳');
            
            // Fetch all dashboard data in a single request
            fetch('/api/dashboard-data/all')
                .then(res => res.json())
                .then(response => {
                    if (!response.success) throw new Error(response.error);
                    
                    const { logLevelStats, hourlyStats, integrationStats } = response.data;
                    const systemData = response.data.stats || {};
                    
                    renderChartsWithData(logLevelStats, hourlyStats, systemData, integrationStats);
                })
                .catch(error => {
                    console.error('Error loading dashboard data:', error);
                    renderEmptyChart('logLevelsChart', 'Error Loading Data', error.message, '⚠️');
                });
        }
        
        function renderChartsWithData(logLevelData, hourlyData, systemData, integrationData) {
            
            // Log Levels Pie Chart
            if (logLevelData.length > 0) {
                const chart = echarts.init(document.getElementById('logLevelsChart'));
                chart.setOption({
                    tooltip: {
                        trigger: 'item',
                        formatter: '{b}: {c} ({d}%)',
                        textStyle: { color: '#e2e8f0' }
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
                            position: 'outside',
                            color: '#e2e8f0',
                            fontSize: 12
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
                        title: { offsetCenter: [0, '80%'], fontSize: 12, color: '#e2e8f0' },
                        detail: { formatter: '{value}%', fontSize: 16, color: '#f1f5f9' },
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
                        title: { offsetCenter: [0, '80%'], fontSize: 12, color: '#e2e8f0' },
                        detail: { formatter: '{value}%', fontSize: 16, color: '#f1f5f9' },
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
                        title: { offsetCenter: [0, '80%'], fontSize: 12, color: '#e2e8f0' },
                        detail: { formatter: '{value}%', fontSize: 16, color: '#f1f5f9' },
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
                        axisPointer: { type: 'cross' },
                        textStyle: { color: '#e2e8f0' }
                    },
                    legend: {
                        data: levels.map(l => l.toUpperCase()),
                        bottom: 0,
                        textStyle: { color: '#e2e8f0' }
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
                        data: hours,
                        axisLabel: { color: '#cbd5e1' },
                        axisLine: { lineStyle: { color: '#475569' } }
                    },
                    yAxis: { 
                        type: 'value',
                        axisLabel: { color: '#cbd5e1' },
                        axisLine: { lineStyle: { color: '#475569' } },
                        splitLine: { lineStyle: { color: '#334155' } }
                    },
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
            if (integrationData.length > 0 && integrationData[0].type !== 'No active integrations' && integrationData[0].type !== 'Error Loading') {
                intChart.setOption({
                    tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' },
                        textStyle: { color: '#e2e8f0' }
                    },
                    legend: {
                        data: ['Total', 'Healthy'],
                        bottom: 0,
                        textStyle: { color: '#e2e8f0' }
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
                        data: integrationData.map(d => d.type),
                        axisLabel: { color: '#cbd5e1' },
                        axisLine: { lineStyle: { color: '#475569' } }
                    },
                    yAxis: { 
                        type: 'value',
                        axisLabel: { color: '#cbd5e1' },
                        axisLine: { lineStyle: { color: '#475569' } },
                        splitLine: { lineStyle: { color: '#334155' } }
                    },
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
                            color: '#fca5a5',
                            fontSize: 16
                        },
                        subtextStyle: {
                            color: '#f87171',
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
                // Show empty state message - "No active integrations"
                intChart.setOption({
                    title: {
                        text: 'No Active Integrations',
                        subtext: 'Enable integrations on the Integrations page',
                        left: 'center',
                        top: 'center',
                        textStyle: {
                            color: '#e2e8f0',
                            fontSize: 16
                        },
                        subtextStyle: {
                            color: '#cbd5e1',
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
        // Fallback drag lock helper (used if grid.setOptions is unavailable or fails)
        function applyDragLockFallback(enabled) {
            try {
                const headers = document.querySelectorAll('.widget-header');
                headers.forEach(h => {
                    if (!enabled) {
                        h.setAttribute('data-lock', '1');
                    } else {
                        h.removeAttribute('data-lock');
                    }
                });
            } catch (e) {
                console.warn('Fallback drag lock application failed:', e.message);
            }
        }

        // Single delegated listener blocking mousedown when locked (fallback mode)
        document.addEventListener('mousedown', function(e) {
            const header = e.target.closest('.widget-header');
            if (header && header.getAttribute('data-lock') === '1') {
                e.preventDefault();
            }
        }, true);

        function toggleLock() {
            try {
                console.log('[toggleLock] START - current isLocked:', isLocked);
                isLocked = !isLocked;
                console.log('[toggleLock] TOGGLED - new isLocked:', isLocked);
                const dragEnabled = !isLocked;
                if (grid) {
                    if (typeof grid.setOptions === 'function') {
                        try {
                            grid.setOptions({ dragEnabled: dragEnabled });
                            console.log('[toggleLock] grid.setOptions executed');
                        } catch (err) {
                            console.warn('grid.setOptions failed, applying fallback drag suppression:', err.message);
                            applyDragLockFallback(dragEnabled);
                        }
                    } else {
                        console.log('[toggleLock] Using fallback (no setOptions)');
                        applyDragLockFallback(dragEnabled);
                    }
                }
                const lockEl = document.getElementById('lockText');
                console.log('[toggleLock] lockEl:', lockEl, 'exists:', !!lockEl);
                if (lockEl) {
                    lockEl.textContent = isLocked ? 'Locked' : 'Unlocked';
                    console.log('[toggleLock] Set lockText to:', lockEl.textContent);
                }
                const btn = document.querySelector('.control-btn');
                if (btn) {
                    btn.classList.toggle('active');
                    console.log('[toggleLock] Toggled button active class');
                }
                console.log('[toggleLock] COMPLETE');
            } catch (e) {
                console.error('toggleLock failed:', e);
                window._lockError = e.message || 'lock_error';
            }
        }
        
        function resetLayout() {
            if (confirm('Reset dashboard to default layout?')) {
                localStorage.removeItem('dashboardLayout');
                location.reload();
            }
        }
        
        async function saveLayout() {
            const items = grid.getItems();
            const layout = items.map(item => {
                const elem = item.getElement();
                const rect = elem.getBoundingClientRect();

                // Use Muuri's internal _left/_top properties - these are the actual positions
                let left = typeof item._left === 'number' ? item._left : 0;
                let top = typeof item._top === 'number' ? item._top : 0;
                
                // Validate positions - only reject severely negative coordinates (< -50px indicates a real problem)
                // Small negatives (e.g. -5, -26) are normal from dragging near edges
                if (left < -50 || top < -50) {
                    console.warn('Rejecting invalid position for', elem.getAttribute('data-widget-id'), 'left:', left, 'top:', top);
                    return null; // Mark as invalid
                }
                
                // If internal properties are 0, try getPosition() as backup
                if (left === 0 && top === 0) {
                    const pos = item.getPosition();
                    if (pos && (pos.left !== 0 || pos.top !== 0)) {
                        left = pos.left;
                        top = pos.top;
                        // Validate again (only severely negative)
                        if (left < -50 || top < -50) {
                            console.warn('Rejecting invalid getPosition for', elem.getAttribute('data-widget-id'));
                            return null;
                        }
                    }
                }
                
                // Last resort: parse CSS transform (ALWAYS check if still 0,0)
                if (left === 0 && top === 0) {
                    var styleTransform = window.getComputedStyle(elem).transform || elem.style.transform || '';
                    if (styleTransform && styleTransform !== 'none') {
                        // matrix(a, b, c, d, tx, ty) - tx and ty are at positions 5 and 6
                        var matrixMatch = styleTransform.match(/matrix\\(([^)]+)\\)/);
                        if (matrixMatch) {
                            var values = matrixMatch[1].split(',').map(function(v) { return parseFloat(v.trim()); });
                            if (values.length >= 6) {
                                left = values[4];
                                top = values[5];
                            }
                        } else {
                            // Try translate format
                            var translateMatch = styleTransform.match(/translate[^(]*\\(([^,]+),\\s*([^)]+)\\)/);
                            if (translateMatch) {
                                left = parseFloat(translateMatch[1]);
                                top = parseFloat(translateMatch[2]);
                            }
                        }
                    }
                }

                return {
                    id: elem.getAttribute('data-widget-id'),
                    left: Math.round(left),
                    top: Math.round(top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
            }).filter(item => item !== null); // Remove invalid entries
            
            // Don't save if we have no valid positions
            if (layout.length === 0) {
                console.warn('No valid widget positions to save');
                return;
            }
            
            if (DEBUG_LAYOUT_LOG) {
                console.log('[Layout] Manual save for', layout.length, 'widgets');
                items.forEach(item => {
                    const el = item.getElement();
                    const id = el.getAttribute('data-widget-id');
                    const muuriInternal = { left: item._left, top: item._top };
                    const muuriPos = item.getPosition();
                    const inlineTransform = el.style.transform || ''; 
                    const computedTransform = window.getComputedStyle(el).transform || ''; 
                    const rect = el.getBoundingClientRect();
                    const saved = layout.find(l => l.id === id);
                    console.log('[Layout] ' + id + ' saved=(' + saved.left + ',' + saved.top + ') internal=(' + muuriInternal.left + ',' + muuriInternal.top + ') getPosition=(' + muuriPos.left + ',' + muuriPos.top + ') size=(' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ') inlineTransform="' + inlineTransform + '" computedTransform="' + computedTransform + '"');
                });
            }
            
            try {
                const res = await fetch('/api/dashboard/positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ layout })
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
                showToast && showToast('Layout saved', 'success');
            } catch (err) {
                console.warn('Server save failed, falling back to localStorage:', err.message);
                localStorage.setItem('dashboardLayout', JSON.stringify(layout));
                alert('Layout saved locally');
            }
        }
        
        async function autoSaveLayout() {
            const items = grid.getItems();
            const layout = items.map(item => {
                const elem = item.getElement();
                const rect = elem.getBoundingClientRect();

                // Use Muuri's internal _left/_top properties - these are the actual positions
                // Muuri stores positions internally and updates them after drag release
                let left = typeof item._left === 'number' ? item._left : 0;
                let top = typeof item._top === 'number' ? item._top : 0;
                
                // If internal properties are 0, try getPosition() as backup
                if (left === 0 && top === 0) {
                    const pos = item.getPosition();
                    if (pos && (pos.left !== 0 || pos.top !== 0)) {
                        left = pos.left;
                        top = pos.top;
                    }
                }
                
                // Last resort: parse CSS transform (ALWAYS check if still 0,0)
                if (left === 0 && top === 0) {
                    var styleTransform = window.getComputedStyle(elem).transform || elem.style.transform || '';
                    if (styleTransform && styleTransform !== 'none') {
                        // matrix(a, b, c, d, tx, ty) - tx and ty are at positions 5 and 6
                        var matrixMatch = styleTransform.match(/matrix\\(([^)]+)\\)/);
                        if (matrixMatch) {
                            var values = matrixMatch[1].split(',').map(function(v) { return parseFloat(v.trim()); });
                            if (values.length >= 6) {
                                left = values[4];
                                top = values[5];
                            }
                        } else {
                            // Try translate format
                            var translateMatch = styleTransform.match(/translate[^(]*\\(([^,]+),\\s*([^)]+)\\)/);
                            if (translateMatch) {
                                left = parseFloat(translateMatch[1]);
                                top = parseFloat(translateMatch[2]);
                            }
                        }
                    }
                }

                return {
                    id: elem.getAttribute('data-widget-id'),
                    left: Math.round(left),
                    top: Math.round(top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
            });
            if (DEBUG_LAYOUT_LOG) {
                console.log('[Layout] Auto-save for', layout.length, 'widgets');
                items.forEach(item => {
                    const el = item.getElement();
                    const id = el.getAttribute('data-widget-id');
                    const muuriInternal = { left: item._left, top: item._top };
                    const muuriPos = item.getPosition();
                    const inlineTransform = el.style.transform || ''; 
                    const computedTransform = window.getComputedStyle(el).transform || ''; 
                    const rect = el.getBoundingClientRect();
                    const saved = layout.find(l => l.id === id);
                    console.log('[Layout] AUTO ' + id + ' saved=(' + saved.left + ',' + saved.top + ') internal=(' + muuriInternal.left + ',' + muuriInternal.top + ') getPosition=(' + muuriPos.left + ',' + muuriPos.top + ') size=(' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ') inlineTransform="' + inlineTransform + '" computedTransform="' + computedTransform + '"');
                });
            }
            
            try {
                await fetch('/api/dashboard/positions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ layout })
                });
            } catch (err) {
                localStorage.setItem('dashboardLayout', JSON.stringify(layout));
            }
        }
        
        async function loadSavedLayout() {
            let layout = null;
            try {
                const res = await fetch('/api/dashboard/positions', { credentials: 'same-origin' });
                const data = await res.json();
                if (res.ok && data.success && Array.isArray(data.layout) && data.layout.length) {
                    layout = data.layout;
                    console.log('✅ Loaded layout from server:', layout.length, 'widgets', layout);
                } else {
                    console.log('⚠️ Server returned no layout:', data);
                }
            } catch (err) {
                console.error('❌ Failed to load layout from server:', err);
            }

            // Fallback to localStorage if server has nothing
            if (!layout || !Array.isArray(layout) || layout.length === 0) {
                const saved = localStorage.getItem('dashboardLayout');
                if (saved) {
                    try { 
                        layout = JSON.parse(saved);
                        console.log('💾 Loaded layout from localStorage:', layout.length, 'widgets');
                    } catch (err) {
                        console.error('❌ Failed to parse localStorage layout:', err);
                    }
                }
            }
            
            if (!layout || !Array.isArray(layout) || layout.length === 0) {
                console.log('ℹ️ No saved layout found, using default positions');
                return;
            }

            const items = grid.getItems();
            console.log('🔧 Applying saved positions to', items.length, 'grid items');
            
            let appliedCount = 0;
            
            // Apply saved positions to widgets
            layout.forEach(savedItem => {
                const item = items.find(i => i.getElement().getAttribute('data-widget-id') === savedItem.id);
                if (!item) {
                    console.warn('⚠️ Widget not found in grid:', savedItem.id);
                    return;
                }
                
                const el = item.getElement();
                const content = el.querySelector('.widget-item-content');
                
                // Set size if saved
                if (savedItem.width && savedItem.height) {
                    if (content) {
                        content.style.width = savedItem.width + 'px';
                        content.style.height = savedItem.height + 'px';
                    }
                }
                
                // Apply position - use Muuri's positioning API
                const left = typeof savedItem.left === 'number' ? savedItem.left : 0;
                const top = typeof savedItem.top === 'number' ? savedItem.top : 0;
                
                console.log('📍 Positioning', savedItem.id, 'at (left=' + left + ', top=' + top + ')');
                
                // Set transform on the outer element
                el.style.transform = 'translate(' + left + 'px, ' + top + 'px)';
                
                // Update Muuri's internal position tracking
                item._left = left;
                item._top = top;
                
                appliedCount++;
            });
            
            console.log('✅ Applied positions to', appliedCount, 'widgets');
            
            // Force Muuri to update without re-layout
            grid.refreshItems();
            
            // Refresh charts after positioning
            setTimeout(() => {
                try { 
                    Object.values(charts).forEach(c => c && c.resize && c.resize()); 
                    console.log('📊 Charts refreshed');
                } catch (err) { 
                    console.warn('Chart resize error:', err);
                }
            }, 100);
        }
        
        function removeWidget(widgetIdOrElement) {
            if (!confirm('Remove this widget?')) return;
            
            let widgetElement;
            
            // Ensure we have access to grid
            const gridInstance = window.grid || grid;
            if (!gridInstance) {
                console.error('Grid not initialized');
                return;
            }
            
            // Handle both cases: widgetId string or button element from onclick
            if (typeof widgetIdOrElement === 'string') {
                // Old format: widgetId passed as string
                const items = gridInstance.getItems();
                const item = items.find(i => 
                    i.getElement().getAttribute('data-widget-id') === widgetIdOrElement
                );
                if (item) {
                    widgetElement = item.getElement();
                }
            } else if (widgetIdOrElement && widgetIdOrElement.nodeType) {
                // New format: button element passed, find parent widget-item
                widgetElement = widgetIdOrElement.closest('.widget-item');
            }
            
            if (widgetElement) {
                const items = gridInstance.getItems();
                const item = items.find(i => i.getElement() === widgetElement);
                if (item) {
                    // Clean up ResizeObserver if exists
                    if (widgetElement._resizeObserver) {
                        widgetElement._resizeObserver.disconnect();
                        delete widgetElement._resizeObserver;
                    }
                    
                    // Remove from Muuri grid
                    gridInstance.remove([item], { removeElements: true });
                    
                    // Force DOM removal if still present (fallback)
                    setTimeout(function() {
                        if (widgetElement && widgetElement.parentNode) {
                            widgetElement.parentNode.removeChild(widgetElement);
                        }
                    }, 50);
                    
                    autoSaveLayout();
                    console.log('Widget removed successfully');
                } else {
                    console.error('Widget item not found in grid');
                }
            } else {
                console.error('Widget element not found');
            }
        }
        
        function addWidget() {
            openModal('widgetMarketplace');
        }
        
        function refreshAllWidgets() {
            location.reload();
        }
        
        async function fetchGeolocationMap(widgetId) {
            try {
                const chart = document.getElementById('chart-' + widgetId);
                if (!chart) {
                    console.warn('Geolocation chart element not found:', 'chart-' + widgetId);
                    return;
                }
                console.log('Fetching geolocation data for widget:', widgetId);
                
                let geo;
                try {
                    const response = await fetch('/api/analytics/geolocation?limit=800', { credentials: 'same-origin' });
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }
                    geo = await response.json();
                } catch (fetchErr) {
                    console.error('Geolocation fetch failed:', fetchErr);
                    chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Failed to load geolocation data<br><small>' + fetchErr.message + '</small></div>';
                    return;
                }
                
                console.log('Geolocation data received:', geo);
                if (!geo || !geo.success) {
                    chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Geolocation error<br><small>' + (geo?.message || 'Unknown error') + '</small></div>';
                    return;
                }
                if ((geo.externalIPs === 0 || !geo.locations || geo.locations.length === 0) && !(geo.serverLocation && geo.serverLocation.lat && geo.serverLocation.lon)) {
                    chart.innerHTML = '<div class="empty-state"><i class="fas fa-globe empty-state-icon"></i><br>No geolocation data available<br><small>Logs with external IPs will appear here</small></div>';
                    return;
                }

                // Check if Leaflet is available
                if (typeof L === 'undefined') {
                    console.error('Leaflet library not loaded');
                    chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Map library not loaded</div>';
                    return;
                }

                // Clear and set up map container
                chart.innerHTML = '';
                chart.style.width = '100%';
                chart.style.height = '100%';
                chart.style.minHeight = '280px';

                // Initialize Leaflet map
                const map = L.map(chart, {
                    center: [20, 0],
                    zoom: 2,
                    minZoom: 1,
                    zoomControl: true,
                    scrollWheelZoom: true
                });

                // Add OpenStreetMap tiles (high quality, free)
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                    maxZoom: 18,
                    minZoom: 1
                }).addTo(map);

                // Add server location pin if configured
                if (geo.serverLocation && geo.serverLocation.lat && geo.serverLocation.lon) {
                    const serverIcon = L.icon({
                        iconUrl: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="#ef4444" stroke="#ffffff" stroke-width="2" d="M16 0C7.163 0 0 7.163 0 16c0 13 16 32 16 32s16-19 16-32C32 7.163 24.837 0 16 0zm0 22c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/></svg>'),
                        iconSize: [32, 48],
                        iconAnchor: [16, 48],
                        popupAnchor: [0, -48]
                    });
                    
                    const serverMarker = L.marker([geo.serverLocation.lat, geo.serverLocation.lon], { icon: serverIcon }).addTo(map);
                    serverMarker.bindPopup('<strong style="color:#fca5a5;">🖥️ Server Location</strong><br>' +
                        '<strong style="color:#f1f5f9;">' + (geo.serverLocation.city || geo.serverLocation.region || 'Unknown') + '</strong><br>' +
                        '<span style="color:#e2e8f0;">' + geo.serverLocation.country + '</span><br>' +
                        '<small style="color:#cbd5e1;">' + geo.serverLocation.lat.toFixed(4) + ', ' + geo.serverLocation.lon.toFixed(4) + '</small>');
                    
                    // Center map on server location if no other data
                    if (geo.locations.length === 0) {
                        map.setView([geo.serverLocation.lat, geo.serverLocation.lon], 8);
                    }
                }

                // Add log source markers
                if (geo.locations && geo.locations.length > 0) {
                    const bounds = [];
                    
                    geo.locations.forEach(function(loc) {
                        if (loc.lat && loc.lon) {
                            const marker = L.circleMarker([loc.lat, loc.lon], {
                                radius: Math.max(Math.min(loc.count / 2, 20), 8),
                                fillColor: '#0ea5e9',
                                color: '#ffffff',
                                weight: 2,
                                opacity: 1.0,
                                fillOpacity: 0.7
                            }).addTo(map);
                            
                            marker.bindPopup('<strong>' + (loc.country || 'Unknown') + '</strong><br>' +
                                'IP: <code style="background:#f1f5f9; padding:2px 4px; border-radius:3px;">' + loc.ip + '</code><br>' +
                                (loc.city ? loc.city + '<br>' : '') +
                                '<strong style="color:#0ea5e9;">' + loc.count + '</strong> log' + (loc.count > 1 ? 's' : ''));
                            
                            bounds.push([loc.lat, loc.lon]);
                        }
                    });

                    // Fit map to show all markers
                    if (bounds.length > 0) {
                        if (geo.serverLocation && geo.serverLocation.lat && geo.serverLocation.lon) {
                            bounds.push([geo.serverLocation.lat, geo.serverLocation.lon]);
                        }
                        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
                    }
                }

                // Add map info overlay
                const infoDiv = L.control({ position: 'topright' });
                infoDiv.onAdd = function() {
                    const div = L.DomUtil.create('div', 'leaflet-control-info');
                    div.style.background = 'rgba(255, 255, 255, 0.95)';
                    div.style.padding = '8px 12px';
                    div.style.borderRadius = '6px';
                    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                    div.style.fontSize = '0.85rem';
                    div.style.lineHeight = '1.4';
                    div.innerHTML = '<strong style="color:#f1f5f9;">Log Geographic Distribution</strong><br>' +
                        '<span style="color:#e2e8f0;">' + geo.externalIPs + ' external IPs / ' + geo.uniqueIPs + ' total</span>' +
                        (geo.serverLocation ? '<br><span style="color:#fca5a5;">🖥️ Server: ' + (geo.serverLocation.city || geo.serverLocation.country || 'Unknown') + '</span>' : '');
                    return div;
                };
                infoDiv.addTo(map);

                console.log('Leaflet map initialized successfully with', geo.locations.length, 'locations');
            } catch (error) {
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading geolocation</div>';
                console.error('Geolocation map error:', error);
            }
        }
        
        // Missing onclick handler functions (required by widget HTML)
        function refreshWidget(widgetId) {
            console.log('Refreshing widget:', widgetId);
            if (typeof initializeWidgetData === 'function') {
                initializeWidgetData(widgetId);
            }
        }
        
        function openWidgetSettings(widgetId) {
            console.log('Opening settings for widget:', widgetId);
            // Widget-specific settings handled by widget implementation
            const widget = document.querySelector('[data-widget-id="' + widgetId + '"]');
            if (widget) {
                const settingsBtn = widget.querySelector('.widget-settings-btn');
                if (settingsBtn && typeof settingsBtn.onclick === 'function') {
                    settingsBtn.onclick();
                } else {
                    showToast('Settings not available for this widget', 'info');
                }
            } else {
                showToast('Widget not found', 'warning');
            }
        }
        
        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
            }
        }
        
        // Event handler functions
        function logout() {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .then(() => window.location.href = '/')
                .catch(err => console.error('Logout failed:', err));
        }
        
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
            }
        }
        
        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme') || 'auto';
            const themes = ['auto', 'light', 'dark'];
            const currentIndex = themes.indexOf(currentTheme);
            const nextTheme = themes[(currentIndex + 1) % themes.length];
            html.setAttribute('data-theme', nextTheme);
            localStorage.setItem('preferred-theme', nextTheme);
        }
        
        // Simple toast notification function
        function showToast(message, type = 'info') {
            // Create toast if it doesn't exist
            let toast = document.getElementById('toast-notification');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'toast-notification';
                toast.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: 8px; z-index: 10000; display: none; transition: all 0.3s ease;';
                document.body.appendChild(toast);
            }
            
            // Set color based on type
            const colors = {
                'success': 'var(--success-color, #10b981)',
                'error': 'var(--error-color, #ef4444)',
                'warning': 'var(--warning-color, #f59e0b)',
                'info': 'var(--accent-secondary, #3b82f6)'
            };
            
            toast.style.backgroundColor = colors[type] || colors.info;
            toast.style.color = '#ffffff';
            toast.textContent = message;
            toast.style.display = 'block';
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                toast.style.display = 'none';
            }, 3000);
        }
        
        // Expose functions from first script block globally for onclick handlers and external scripts
        // Note: grid is exposed inside initializeGrid() after Muuri initialization
        // Functions from second script block will be exposed after they're defined
        window.refreshWidget = refreshWidget;
        window.openWidgetSettings = openWidgetSettings;
        window.removeWidget = removeWidget;
        window.closeModal = closeModal;
        window.saveLayout = saveLayout;
        window.showToast = showToast;
        window.toggleLock = toggleLock;
        window.resetLayout = resetLayout;
        window.addWidget = addWidget;
        window.refreshAllWidgets = refreshAllWidgets;
        window.logout = logout;
        window.toggleSidebar = toggleSidebar;
        window.toggleTheme = toggleTheme;
        // Expose functions needed by external dashboard-main.js
        window.initializeCharts = initializeCharts;
        window.loadSavedLayout = loadSavedLayout;
        window.setupResizeObservers = setupResizeObservers;
        
        console.log('✅ First script block functions exposed globally');
        </script>
        <!-- Deferred Widget System Scripts -->
        <script src="/js/widget-catalog.js"></script>
        <script src="/js/widget-marketplace.js"></script>
        
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
        // Second script block: Widget fetch functions that need widgetCatalog from first block
        
        function generateWidgetHTML(widget) {
            // Generate appropriate HTML based on widget category and type
            switch(widget.category) {
                case 'analytics':
                    return '<div class="chart-container" id="chart-' + widget.id + '"></div>';
                case 'monitoring':
                    return widget.size === 'small' 
                        ? '<div class="stat-item"><div class="stat-icon"><i class="fas fa-' + widget.icon + '"></i></div><div class="stat-value" id="val-' + widget.id + '">--</div><div class="stat-label">' + widget.name + '</div></div>'
                        : '<div class="chart-container" id="chart-' + widget.id + '"></div>';
                case 'data':
                    return '<div id="data-' + widget.id + '" style="overflow-y: auto; height: 100%;"><p style="text-align:center; color: var(--text-muted); padding: 2rem;">Loading data...</p></div>';
                case 'actions':
                    return '<div id="action-' + widget.id + '" style="padding: 1rem;">' + getActionWidgetHTML(widget.id) + '</div>';
                case 'system':
                    return '<div id="system-' + widget.id + '" style="padding: 1rem;"><p style="text-align:center; color: var(--text-muted); padding: 1rem;">Loading...</p></div>';
                case 'custom':
                    return '<div class="chart-container" id="chart-' + widget.id + '"></div>';
                default:
                    return '<p>Widget loaded</p>';
            }
        }
        
        function getActionWidgetHTML(widgetId) {
            var t = {};
            t['quick-search'] = '<input type="text" id="quick-search-input" placeholder="Search logs..." title="Try: level:error AND source:api" class="form-control" style="margin-bottom: 0.5rem;" onkeypress="if(event.key===&quot;Enter&quot;) performQuickSearch()">' +
                '<button class="btn" style="width: 100%;" onclick="performQuickSearch()"><i class="fas fa-search"></i> Search</button>' +
                '<div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem; text-align:center;">Supports: field:value AND/OR operators</div>';
            t['log-export'] = '<select id="export-format" class="form-control" style="margin-bottom: 0.5rem;">' +
                '<option value="json">JSON</option><option value="csv">CSV</option><option value="ndjson">NDJSON</option><option value="xml">XML</option></select>' +
                '<button class="btn" style="width: 100%;" onclick="performLogExport()"><i class="fas fa-download"></i> Export</button>';
            t['filter-presets'] = '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="applyFilterPreset(&quot;errors&quot;)">Errors Only</button>' +
                '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="applyFilterPreset(&quot;lasthour&quot;)">Last Hour</button>' +
                '<button class="btn btn-secondary" style="width: 100%;" onclick="applyFilterPreset(&quot;critical&quot;)">Critical Events</button>';
            t['bookmark-manager'] = '<div style="display:flex; flex-direction:column;">' +
                '<input type="text" id="bookmark-label-input" placeholder="Bookmark label..." class="form-control" style="margin-bottom:0.5rem;" />' +
                '<textarea id="bookmark-query-input" placeholder="Query (e.g. level=error AND source=api)" class="form-control" style="margin-bottom:0.5rem; min-height:60px;"></textarea>' +
                '<button class="btn" style="width:100%; margin-bottom:0.5rem;" onclick="saveBookmark()"><i class="fas fa-bookmark"></i> Save Bookmark</button>' +
                '<div id="bookmark-list" style="flex:1; max-height:160px; overflow-y:auto; border:1px solid var(--border-color); border-radius:4px; padding:0.5rem; font-size:0.75rem;"></div>' +
                '</div>';
            t['stats-calculator'] = '<div style="text-align: center;">' +
                '<button class="btn" style="width: 100%; margin-bottom: 0.5rem;" onclick="calculateStats(&quot;count&quot;)"><i class="fas fa-hashtag"></i> Count</button>' +
                '<button class="btn" style="width: 100%; margin-bottom: 0.5rem;" onclick="calculateStats(&quot;avg&quot;)"><i class="fas fa-chart-line"></i> Average</button>' +
                '<button class="btn" style="width: 100%;" onclick="calculateStats(&quot;sum&quot;)"><i class="fas fa-plus"></i> Sum</button>' +
                '</div>';
            t['bulk-actions'] = '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="bulkAction(&quot;delete&quot;)"><i class="fas fa-trash"></i> Delete Selected</button>' +
                '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="bulkAction(&quot;archive&quot;)"><i class="fas fa-archive"></i> Archive</button>' +
                '<button class="btn btn-secondary" style="width: 100%;" onclick="bulkAction(&quot;export&quot;)"><i class="fas fa-file-export"></i> Export</button>';
            t['quick-notes'] = '<textarea id="quick-notes-text" placeholder="Add notes..." class="form-control" style="margin-bottom: 0.5rem; min-height: 80px;"></textarea>' +
                '<button class="btn" style="width: 100%;" onclick="saveQuickNote()"><i class="fas fa-save"></i> Save Note</button>' +
                '<div id="quick-notes-list" style="margin-top:0.75rem; max-height:160px; overflow-y:auto; font-size:0.75rem; border:1px solid var(--border-color); border-radius:4px; padding:0.5rem;"></div>';
            return t[widgetId] || '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">Widget configuration in progress...</p>';
        }

        async function refreshQuickNotes(){
            try {
                const resp = await fetch('/api/notes', { credentials:'same-origin' });
                const data = await resp.json();
                const listDiv = document.getElementById('quick-notes-list');
                if(!listDiv) return;
                if(!data.success || !data.notes.length){
                    listDiv.innerHTML = '<div style="text-align:center; color: var(--text-muted);">No notes</div>';
                    return;
                }
                listDiv.innerHTML = data.notes.map(function(n){
                    return '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding:2px 4px;">'
                        + '<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="'+n.text.replace(/"/g,'&quot;')+'">'+n.text+'</span>'
                        + '<button class="btn-icon" style="color:var(--error-color);" onclick="deleteQuickNote('+n.id+')" title="Delete"><i class="fas fa-times"></i></button>'
                        + '</div>'; }).join('');
            } catch(e){
                const listDiv = document.getElementById('quick-notes-list');
                if(listDiv) listDiv.innerHTML = '<div style="text-align:center; color: var(--error-color);">Err</div>';
            }
        }

        async function saveQuickNote(){
            const ta = document.getElementById('quick-notes-text');
            if(!ta) return;
            const text = ta.value.trim();
            if(!text){ ta.focus(); return; }
            try {
                const resp = await fetch('/api/notes', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
                const data = await resp.json();
                if(data.success){ ta.value=''; refreshQuickNotes(); showToast('Note saved','success'); }
                else showToast('Save failed','error');
            } catch(e){ showToast('Error','error'); }
        }

        async function deleteQuickNote(id){
            try {
                const resp = await fetch('/api/notes/'+id, { method:'DELETE', credentials:'same-origin' });
                const data = await resp.json();
                if(data.success){ refreshQuickNotes(); showToast('Deleted','success'); }
                else showToast('Delete failed','error');
            } catch(e){ showToast('Error','error'); }
        }

        // Bookmarks management
        async function refreshBookmarks(){
           try { const resp = await fetch('/api/bookmarks',{credentials:'same-origin'});
                 const data = await resp.json();
                 const listDiv = document.getElementById('bookmark-list');
                 if(!listDiv) return;
                 if(!data.success || !data.bookmarks || !data.bookmarks.length){
                     listDiv.innerHTML = '<div style="text-align:center; color: var(--text-muted);">No bookmarks</div>';
                     return;
                 }
                 listDiv.innerHTML = data.bookmarks.map(function(b){
                    var safeLabel = (b.label||'').replace(/"/g,'&quot;');
                    var safeQuery = (b.query||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                    return '<div style="display:flex; align-items:center; border-bottom:1px solid var(--border-color); padding:2px 4px;">'
                        + '<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="'+safeLabel+' | '+safeQuery+'"><strong>'+safeLabel+'</strong>: '+safeQuery+'</span>'
                        + '<button class="btn-icon" style="color:var(--accent-color);" onclick="applyBookmarkQuery(&quot;'+safeQuery+'&quot;)" title="Apply"><i class="fas fa-play"></i></button>'
                        + '<button class="btn-icon" style="color:var(--error-color);" onclick="deleteBookmark('+b.id+')" title="Delete"><i class="fas fa-times"></i></button>'
                        + '</div>';
                 }).join('');
           } catch(e){
               const listDiv = document.getElementById('bookmark-list');
               if(listDiv) listDiv.innerHTML = '<div style="text-align:center; color: var(--error-color);">Err</div>';
           }
        }

        async function saveBookmark(){
            const labelEl = document.getElementById('bookmark-label-input');
            const queryEl = document.getElementById('bookmark-query-input');
            if(!labelEl || !queryEl) return;
            const label = labelEl.value.trim();
            const query = queryEl.value.trim();
            if(!label || !query){
                if(!label) labelEl.focus(); else queryEl.focus();
                showToast('Label & query required','error');
                return;
            }
            try {
                const resp = await fetch('/api/bookmarks',{method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label, query })});
                const data = await resp.json();
                if(data.success){
                    labelEl.value=''; queryEl.value='';
                    refreshBookmarks();
                    showToast('Bookmark saved','success');
                } else showToast('Save failed','error');
            } catch(e){ showToast('Error','error'); }
        }

        async function deleteBookmark(id){
            try {
                const resp = await fetch('/api/bookmarks/'+id,{method:'DELETE', credentials:'same-origin'});
                const data = await resp.json();
                if(data.success){ refreshBookmarks(); showToast('Deleted','success'); }
                else showToast('Delete failed','error');
            } catch(e){ showToast('Error','error'); }
        }

        function applyBookmarkQuery(q){
            if(!q) return;
            const input = document.getElementById('quick-search-input');
            if(input) input.value = q;
            window.location.href = '/search?q='+encodeURIComponent(q);
        }
        
        function initializeWidgetData(widgetId) {
            // Fetch and display real widget data from API
            const widgetType = widgetId.replace(/^\d+-/, ''); // Extract widget type
            
            // Analytics widgets
            if (widgetType === 'log-volume' || widgetType === 'log-rate-graph') {
                fetchLogVolumeData(widgetId);
            } else if (widgetType === 'error-rate' || widgetType === 'error-rate-trend') {
                fetchErrorRateData(widgetId);
            } else if (widgetType === 'response-histogram') {
                fetchResponseHistogram(widgetId);
            } else if (widgetType === 'top-errors') {
                fetchTopErrors(widgetId);
            } else if (widgetType === 'log-heatmap') {
                fetchLogHeatmap(widgetId);
            } else if (widgetType === 'source-comparison') {
                fetchSourceComparison(widgetId);
            } else if (widgetType === 'severity-distribution') {
                fetchSeverityDistribution(widgetId);
            } else if (widgetType === 'hourly-breakdown') {
                fetchHourlyBreakdown(widgetId);
            
            // Monitoring widgets
            } else if (widgetType === 'system-health' || widgetType === 'service-health') {
                fetchSystemHealthData(widgetId);
            } else if (widgetType === 'active-alerts') {
                fetchActiveAlerts(widgetId);
            } else if (widgetType === 'error-threshold') {
                fetchErrorThreshold(widgetId);
            } else if (widgetType === 'disk-gauge') {
                fetchDiskGauge(widgetId);
            } else if (widgetType === 'memory-cpu-trend') {
                fetchMemoryCpuTrend(widgetId);
            } else if (widgetType === 'uptime-tracker') {
                fetchUptimeTracker(widgetId);
            } else if (widgetType === 'log-anomaly') {
                fetchLogAnomaly(widgetId);
            } else if (widgetType === 'sla-monitor') {
                fetchSlaMonitor(widgetId);
            
            // Data view widgets
            } else if (widgetType === 'log-levels') {
                fetchLogLevelsData(widgetId);
            } else if (widgetType === 'recent-errors') {
                fetchRecentErrors(widgetId);
            } else if (widgetType === 'live-stream') {
                fetchLiveStream(widgetId);
            } else if (widgetType === 'search-results') {
                fetchSearchResults(widgetId);
            } else if (widgetType === 'filtered-table') {
                fetchFilteredTable(widgetId);
            } else if (widgetType === 'tag-cloud') {
                fetchTagCloud(widgetId);
            } else if (widgetType === 'source-activity') {
                fetchSourceActivity(widgetId);
            } else if (widgetType === 'user-activity') {
                fetchUserActivity(widgetId);
            } else if (widgetType === 'event-timeline') {
                fetchEventTimeline(widgetId);
            
            // System tool widgets
            } else if (widgetType === 'integration-status') {
                fetchIntegrationStatus(widgetId);
            } else if (widgetType === 'webhook-tester') {
                fetchWebhookTester(widgetId);
            } else if (widgetType === 'database-stats') {
                fetchDatabaseStats(widgetId);
            } else if (widgetType === 'session-monitor') {
                fetchSessionMonitor(widgetId);
            } else if (widgetType === 'api-key-manager') {
                fetchApiKeyManager(widgetId);
            } else if (widgetType === 'backup-status') {
                fetchBackupStatus(widgetId);
            } else if (widgetType === 'log-retention') {
                fetchLogRetention(widgetId);
            } else if (widgetType === 'system-info') {
                fetchSystemInfo(widgetId);
            
            // Custom visualization widgets
            } else if (widgetType === 'query-builder') {
                fetchQueryBuilder(widgetId);
            } else if (widgetType === 'saved-query') {
                fetchSavedQuery(widgetId);
            } else if (widgetType === 'correlation-matrix') {
                fetchCorrelationMatrix(widgetId);
            } else if (widgetType === 'pattern-detection') {
                fetchPatternDetection(widgetId);
            } else if (widgetType === 'custom-chart') {
                fetchCustomChart(widgetId);
            } else if (widgetType === 'metric-formula') {
                fetchMetricFormula(widgetId);
            } else if (widgetType === 'data-transformer') {
                fetchDataTransformer(widgetId);
            } else if (widgetType === 'geolocation-map') {
                fetchGeolocationMap(widgetId);
            
            // Generic fallback
            } else if (widgetType.includes('chart') || widgetType.includes('graph')) {
                fetchGenericChartData(widgetId);
            }
            
            // Update value displays
            const val = document.getElementById('val-' + widgetId);
            if (val) {
                fetchWidgetValue(widgetId, val);
            }
        }
        
        async function fetchLogVolumeData(widgetId) {
            try {
                const response = await fetch('/api/logs/stats?period=7d&groupBy=day', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined') {
                    // Check if we have data
                    if (!data.success || !data.labels || data.labels.length === 0) {
                        chart.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line empty-state-icon"></i><br>No log data for the past 7 days<br><small>Start logging to see volume trends</small></div>';
                        return;
                    }
                    
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Log Volume (7 Days)', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { 
                            data: data.labels || [],
                            axisLabel: { color: 'var(--text-muted)' }
                        },
                        yAxis: { 
                            name: 'Count',
                            nameTextStyle: { color: 'var(--text-muted)' },
                            axisLabel: { color: 'var(--text-muted)' }
                        },
                        series: [{ 
                            type: 'line', 
                            data: data.values || [], 
                            smooth: true,
                            areaStyle: { opacity: 0.3 },
                            itemStyle: { color: '#3b82f6' },
                            lineStyle: { width: 3 }
                        }]
                    });
                    charts['log-volume-' + widgetId] = ec;
                }
            } catch (error) {
                console.error('Failed to load log volume data:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) {
                    chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading data</div>';
                }
            }
        }
        
        async function fetchErrorRateData(widgetId) {
            try {
                const response = await fetch('/api/logs/stats?period=24h&groupBy=hour&level=error', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Error Rate (24h)', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { data: data.labels || [], axisLabel: { color: 'var(--text-muted)' } },
                        yAxis: { name: 'Errors', axisLabel: { color: 'var(--text-muted)' }, nameTextStyle: { color: 'var(--text-muted)' } },
                        series: [{ 
                            type: 'bar', 
                            data: data.values || [],
                            itemStyle: { color: '#ef4444' }
                        }]
                    });
                }
            } catch (error) {
                console.error('Failed to load error rate data:', error);
            }
        }
        
        async function fetchServiceHealthChecks(widgetId) {
            try {
                const response = await fetch('/health', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId) || document.getElementById('system-' + widgetId);
                if (container) {
                    const statusColor = data.status === 'ready' ? 'var(--success-color)' : 'var(--warning-color)';
                    container.innerHTML = 
                        '<div style="padding: 1rem;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 0.5rem;">' +
                        '<span><strong>System Status</strong></span>' +
                        '<span style="color: ' + statusColor + ';"><i class="fas fa-circle" style="font-size: 0.5rem;"></i> ' + (data.status || 'unknown') + '</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 0.5rem;">' +
                        '<span><strong>Node Version</strong></span>' +
                        '<span>' + (data.node || 'N/A') + '</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 0.5rem;">' +
                        '<span><strong>Engines</strong></span>' +
                        '<span style="color: ' + (data.enginesInitialized ? 'var(--success-color)' : 'var(--warning-color)') + ';"><i class="fas fa-circle" style="font-size: 0.5rem;"></i> ' + (data.enginesInitialized ? 'Initialized' : 'Starting') + '</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px;">' +
                        '<span><strong>Uptime</strong></span>' +
                        '<span>' + formatUptime(data.uptime || 0) + '</span>' +
                        '</div>' +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load service health:', error);
                const container = document.getElementById('data-' + widgetId) || document.getElementById('system-' + widgetId);
                if (container) container.innerHTML = '<div style="padding: 1rem; color: var(--error-color); text-align: center;">Failed to load health checks</div>';
            }
        }
        
        async function fetchSystemHealthData(widgetId) {
            try {
                const response = await fetch('/health', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const val = document.getElementById('val-' + widgetId);
                if (val) {
                    val.textContent = data.status === 'ready' ? 'Healthy' : 'Degraded';
                    val.style.color = data.status === 'ready' ? 'var(--success-color)' : 'var(--warning-color)';
                }
            } catch (error) {
                console.error('Failed to load system health:', error);
            }
        }
        
        async function fetchLogLevelsData(widgetId) {
            try {
                const response = await fetch('/api/logs/stats?period=24h&groupBy=level', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.byLevel) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Log Levels', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'item' },
                        series: [{
                            type: 'pie',
                            radius: '60%',
                            data: Object.entries(data.byLevel).map(([name, value]) => ({ name, value }))
                        }]
                    });
                }
            } catch (error) {
                console.error('Failed to load log levels data:', error);
            }
        }
        
        async function fetchGenericChartData(widgetId) {
            try {
                const response = await fetch('/api/logs/stats?period=24h&groupBy=hour', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Activity (24h)', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { data: data.labels || [], axisLabel: { color: 'var(--text-muted)' } },
                        yAxis: { axisLabel: { color: 'var(--text-muted)' } },
                        series: [{ type: 'line', data: data.values || [], smooth: true }]
                    });
                }
            } catch (error) {
                console.error('Failed to load chart data:', error);
            }
        }
        
        async function fetchWidgetValue(widgetId, element) {
            try {
                const response = await fetch('/api/logs?limit=1', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                if (data.total !== undefined) {
                    element.textContent = data.total.toLocaleString();
                }
            } catch (error) {
                console.error('Failed to load widget value:', error);
                element.textContent = '---';
            }
        }
        
        // Quick search functionality
        function performQuickSearch() {
            const query = document.getElementById('quick-search-input')?.value;
            if (query && query.trim()) {
                window.location.href = '/search?q=' + encodeURIComponent(query.trim());
            }
        }
        
        // Log export functionality
        async function performLogExport() {
            const format = document.getElementById('export-format')?.value || 'json';
            try {
                const response = await fetch('/api/logs/export?format=' + format + '&limit=1000', {
                    credentials: 'same-origin'
                });
                if (!response.ok) throw new Error('Export failed');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'logs_export_' + new Date().toISOString().split('T')[0] + '.' + format;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showToast('Export completed successfully', 'success');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Export failed: ' + error.message, 'error');
            }
        }
        
        // Filter preset functionality
        function applyFilterPreset(preset) {
            const presets = {
                'errors': '/logs?level=error',
                'lasthour': '/logs?time=1h',
                'critical': '/logs?level=critical'
            };
            if (presets[preset]) {
                window.location.href = presets[preset];
            }
        }
        
        // Additional action widget handlers
        async function calculateStats(type) {
            try {
                // Fetch stats from multiple sources
                const [logsRes, metricsRes] = await Promise.all([
                    fetch('/api/logs/stats?period=24h', { credentials: 'same-origin' }),
                    fetch('/api/system/metrics', { credentials: 'same-origin' })
                ]);
                
                const logsData = await logsRes.json();
                const metricsData = await metricsRes.json();
                
                // Calculate statistics based on type
                let statsMessage = '';
                switch(type) {
                    case 'summary':
                        const totalLogs = logsData.total || 0;
                        const errorCount = logsData.byLevel?.error || 0;
                        const errorRate = totalLogs > 0 ? ((errorCount / totalLogs) * 100).toFixed(2) : 0;
                        statsMessage = 'Total Logs: ' + totalLogs.toLocaleString() + '\\n' +
                                     'Errors: ' + errorCount.toLocaleString() + '\\n' +
                                     'Error Rate: ' + errorRate + '%\\n' +
                                     'Memory: ' + (metricsData.memoryUsage / 1024).toFixed(2) + ' GB\\n' +
                                     'CPU: ' + metricsData.cpuUsage.toFixed(1) + '%';
                        break;
                    case 'average':
                        const avgPerHour = ((logsData.total || 0) / 24).toFixed(1);
                        statsMessage = 'Average Logs per Hour (24h): ' + avgPerHour + '\\n' +
                                     'Avg Memory Usage: ' + (metricsData.memoryUsage / 1024).toFixed(2) + ' GB';
                        break;
                    case 'total':
                        statsMessage = 'Total Logs (24h): ' + (logsData.total || 0).toLocaleString() + '\\n' +
                                     'Total Requests: ' + (metricsData.totalRequests || 0).toLocaleString();
                        break;
                    default:
                        statsMessage = 'Unknown stat type';
                }
                
                alert(statsMessage);
            } catch (error) {
                console.error('Failed to calculate stats:', error);
                alert('Error calculating statistics');
            }
        }
        
        async function bulkAction(action) {
            if (!confirm('Are you sure you want to perform bulk ' + action + ' action?')) {
                return;
            }
            
            try {
                let endpoint = '';
                let method = 'POST';
                let body = {};
                
                switch(action) {
                    case 'delete':
                        endpoint = '/api/logs/delete';
                        method = 'DELETE';
                        body = { level: 'debug', older_than: '7d' };
                        break;
                    case 'archive':
                        endpoint = '/api/logs/archive';
                        body = { older_than: '30d' };
                        break;
                    case 'export':
                        window.location.href = '/api/logs/export?format=json&period=24h';
                        alert('Export started...');
                        return;
                    default:
                        alert('Unknown action: ' + action);
                        return;
                }
                
                const response = await fetch(endpoint, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(body)
                });
                
                const result = await response.json();
                alert('Action completed: ' + (result.message || 'Success'));
            } catch (error) {
                console.error('Bulk action failed:', error);
                alert('Action failed: ' + error.message);
            }
        }
        
        async function saveQuickNote() {
            const noteText = document.getElementById('quick-notes-text')?.value;
            if (!noteText) {
                alert('Please enter a note');
                return;
            }
            try {
                const response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ note: noteText, timestamp: new Date().toISOString() })
                });
                if (response.ok) {
                    alert('Note saved successfully');
                    document.getElementById('quick-notes-text').value = '';
                } else {
                    alert('Failed to save note');
                }
            } catch (error) {
                console.error('Failed to save note:', error);
                alert('Error saving note');
            }
        }
        
        // ========== ANALYTICS WIDGET FETCHERS ==========
        
        async function fetchResponseHistogram(widgetId) {
            try {
                // API returns buckets array with {bucket, count}
                const response = await fetch('/api/analytics/histogram/hourly?hours=24', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success && data.buckets) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Response Time Distribution (24h)', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { 
                            data: data.buckets.map(b => b.bucket.substring(11, 16)), // Extract HH:MM
                            axisLabel: { color: 'var(--text-muted)', rotate: 45 }
                        },
                        yAxis: { name: 'Count', axisLabel: { color: 'var(--text-muted)' } },
                        series: [{ 
                            type: 'bar', 
                            data: data.buckets.map(b => b.count), 
                            itemStyle: { color: '#3b82f6' }
                        }]
                    });
                    charts[widgetId] = ec;
                } else if (chart) {
                    chart.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar empty-state-icon"></i><br>No histogram data available</div>';
                }
            } catch (error) {
                console.error('Failed to load response histogram:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading data</div>';
            }
        }
        
        async function fetchTopErrors(widgetId) {
            try {
                const response = await fetch('/api/logs?level=error&limit=10&groupBy=message', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                // API returns { logs: [...] } not { results: [...] }
                const logs = data.logs || data.results || [];
                if (container && logs.length > 0) {
                    container.innerHTML = '<div style="padding: 1rem;">' + logs.map((log, i) => 
                        '<div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">' +
                        '<span style="font-weight: 600; color: var(--error-color);">' + (i + 1) + '. </span>' +
                        '<span>' + (log.message || 'Unknown error').substring(0, 80) + '</span>' +
                        '<span style="float: right; color: var(--text-muted);">' + (log.count || 1) + 'x</span>' +
                        '</div>'
                    ).join('') + '</div>';
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No errors found</div>';
                }
            } catch (error) {
                console.error('Failed to load top errors:', error);
            }
        }
        
        async function fetchLogHeatmap(widgetId) {
            try {
                const response = await fetch('/api/analytics/heatmap/severity-time', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success && data.points) {
                    // Build heatmap data: x=hour, y=severity, value=count
                    const hours = [...new Set(data.points.map(p => p.hour))].sort();
                    const severities = [...new Set(data.points.map(p => p.severity))];
                    const heatmapData = data.points.map(p => [hours.indexOf(p.hour), severities.indexOf(p.severity), p.count]);
                    const maxCount = Math.max(...data.points.map(p => p.count));
                    
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Log Activity Heatmap (24h)', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { position: 'top', formatter: params => severities[params.value[1]] + ' @ ' + hours[params.value[0]] + ':00 - ' + params.value[2] + ' logs' },
                        xAxis: { type: 'category', data: hours.map(h => h + ':00'), axisLabel: { color: 'var(--text-muted)', rotate: 45 } },
                        yAxis: { type: 'category', data: severities, axisLabel: { color: 'var(--text-muted)' } },
                        visualMap: { min: 0, max: maxCount, calculable: true, orient: 'horizontal', left: 'center', bottom: '5%', inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'] } },
                        series: [{ name: 'Logs', type: 'heatmap', data: heatmapData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }]
                    });
                    charts[widgetId] = ec;
                } else if (chart) {
                    chart.innerHTML = '<div class="empty-state"><i class="fas fa-th empty-state-icon"></i><br>No heatmap data available</div>';
                }
            } catch (error) {
                console.error('Failed to load log heatmap:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading data</div>';
            }
        }
        
        async function fetchSourceComparison(widgetId) {
            try {
                const response = await fetch('/api/analytics/top-sources?limit=10', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                // API returns { top: [...] } not { topSources: [...] }
                const sources = data.top || data.topSources || [];
                if (chart && typeof echarts !== 'undefined' && sources.length > 0) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Log Volume by Source', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                        xAxis: { type: 'category', data: sources.map(s => s.source), axisLabel: { color: 'var(--text-muted)', rotate: 45 } },
                        yAxis: { type: 'value', name: 'Count', axisLabel: { color: 'var(--text-muted)' }, nameTextStyle: { color: 'var(--text-muted)' } },
                        series: [{ type: 'bar', data: sources.map(s => s.count), itemStyle: { color: '#8b5cf6' } }]
                    });
                } else if (chart) {
                    chart.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No data available</div>';
                }
            } catch (error) {
                console.error('Failed to load source comparison:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load data</div>';
            }
        }
        
        async function fetchSeverityDistribution(widgetId) {
            try {
                const response = await fetch('/api/analytics/severities', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                // API returns { severities: [{severity, count}] } array, not object
                const severities = data.severities || [];
                if (chart && typeof echarts !== 'undefined' && severities.length > 0) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Severity Levels', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'item' },
                        series: [{
                            type: 'pie',
                            radius: '60%',
                            data: severities.map(s => ({ name: s.severity, value: s.count }))
                        }]
                    });
                }
            } catch (error) {
                console.error('Failed to load severity distribution:', error);
            }
        }
        
        async function fetchHourlyBreakdown(widgetId) {
            try {
                const response = await fetch('/api/analytics/histogram/hourly?hours=24', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success && data.buckets) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: '24-Hour Activity', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                        xAxis: { data: data.buckets.map(b => b.bucket.substring(11, 16)), axisLabel: { color: 'var(--text-muted)', rotate: 45 } },
                        yAxis: { name: 'Logs', axisLabel: { color: 'var(--text-muted)' } },
                        series: [{ type: 'line', data: data.buckets.map(b => b.count), smooth: true, areaStyle: { opacity: 0.3 }, itemStyle: { color: '#3b82f6' }, lineStyle: { width: 2 } }]
                    });
                    charts[widgetId] = ec;
                } else if (chart) {
                    chart.innerHTML = '<div class="empty-state"><i class="fas fa-clock empty-state-icon"></i><br>No activity data</div>';
                }
            } catch (error) {
                console.error('Failed to load hourly breakdown:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading data</div>';
            }
        }
        
        // ========== MONITORING WIDGET FETCHERS ==========
        
        async function fetchActiveAlerts(widgetId) {
            try {
                const response = await fetch('/api/alerts?status=active', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container && data.alerts) {
                    if (data.alerts.length === 0) {
                        container.innerHTML = '<div style="padding:1rem;"><p style="text-align:center; color: var(--success-color);">No active alerts</p></div>';
                    } else {
                        container.innerHTML = '<div style="padding:1rem;">' + data.alerts.map(function(alert){
                            return '<div style="padding:0.75rem; margin-bottom:0.5rem; border-left:3px solid var(--warning-color); background: var(--bg-secondary);">' +
                                '<strong>' + (alert.title || 'Alert') + '</strong><br>' +
                                '<small style="color: var(--text-muted);">' + (alert.description || '') + '</small>' +
                                '</div>';
                        }).join('') + '</div>';
                    }
                }
            } catch (error) {
                console.error('Failed to load active alerts:', error);
            }
        }
        
        async function fetchErrorThreshold(widgetId) {
            try {
                // Get error count from last hour
                const response = await fetch('/api/logs/count?level=error', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                if (val && data.success) {
                    const count = data.count || 0;
                    const threshold = 100;
                    val.innerHTML = '<div style="font-size:0.85em; line-height:1.2;">' +
                        '<div><strong>' + count + '</strong> errors</div>' +
                        '<div style="color:var(--text-muted); font-size:0.75em;">Threshold: ' + threshold + '</div>' +
                        '</div>';
                    val.style.color = count > threshold ? 'var(--error-color)' : (count > 50 ? 'var(--warning-color)' : 'var(--success-color)');
                }
            } catch (error) {
                console.error('Failed to load error threshold:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = 'Error';
            }
        }
        
        async function fetchDiskGauge(widgetId) {
            try {
                const response = await fetch('/api/system/metrics', { credentials: 'same-origin' });
                const metrics = await response.json();
                const healthRes = await fetch('/api/system/health', { credentials: 'same-origin' });
                const health = await healthRes.json();
                const val = document.getElementById('val-' + widgetId);
                const chart = document.getElementById('chart-' + widgetId);

                // Prefer detailed metrics if exposed, else fallback to health checks percentage
                const diskPercent = typeof metrics.disk === 'number' ? metrics.disk : parseInt(health.checks?.storage?.usage || '0');
                const usedMB = metrics.diskUsedMB || metrics.databaseSizeMB || 0;
                const totalMB = metrics.diskTotalMB || 0;
                const usedGB = (usedMB / 1024).toFixed(2);
                const totalGB = totalMB ? (totalMB / 1024).toFixed(2) : 'N/A';
                const trend = metrics.diskTrend || [];

                const color = diskPercent > 90 ? 'var(--error-color)' : diskPercent > 75 ? 'var(--warning-color)' : 'var(--success-color)';

                if (val) {
                    // Compact widget with full context
                    val.innerHTML = '<div style="font-size:0.8em; line-height:1.2;">' +
                        '<div><strong>' + diskPercent + '%</strong></div>' +
                        (totalMB ? '<div style="color:var(--text-muted);">' + usedGB + ' / ' + totalGB + ' GB</div>' : '') +
                        '</div>';
                    val.style.color = color;
                } else if (chart && typeof echarts !== 'undefined') {
                    // Build sparkline for trend if available (last 24 data points)
                    var sparklineHTML = '';
                    var projectionHTML = '';
                    if(trend.length >= 2){
                        var recentTrend = trend.slice(-24);
                        var trendValues = recentTrend.map(function(t){ return t.usedMB; });
                        var min = Math.min.apply(null, trendValues);
                        var max = Math.max.apply(null, trendValues);
                        var range = max - min || 1;
                        var width = 180;
                        var height = 30;
                        var points = trendValues.map(function(v, i){
                            var x = (i / (trendValues.length - 1)) * width;
                            var y = height - ((v - min) / range) * height;
                            return x + ',' + y;
                        }).join(' ');
                        sparklineHTML = '<svg width="'+width+'" height="'+height+'" style="margin:5px auto; display:block;">'
                            + '<polyline points="'+points+'" fill="none" stroke="'+color+'" stroke-width="2"/>'
                            + '</svg>';
                        
                        // Simple linear projection to full capacity
                        if(trendValues.length >= 3 && totalMB > usedMB){
                            var first = trendValues[0];
                            var last = trendValues[trendValues.length - 1];
                            var growthPerHour = (last - first) / (trendValues.length - 1);
                            if(growthPerHour > 0){
                                var remainingMB = totalMB - usedMB;
                                var hoursToFull = remainingMB / growthPerHour;
                                if(hoursToFull > 0 && hoursToFull < 1000){
                                    var days = Math.floor(hoursToFull / 24);
                                    var hours = Math.floor(hoursToFull % 24);
                                    projectionHTML = '<div style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-top:3px;">Projected full: ~'+days+'d '+hours+'h</div>';
                                }
                            }
                        }
                    }

                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: 'Disk Usage', left: 'center', top: '4%', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        graphic: totalMB ? [{
                            type: 'text',
                            left: 'center',
                            top: '78%',
                            style: { text: usedGB + ' / ' + totalGB + ' GB', fill: 'var(--text-secondary)', fontSize: 12 }
                        }] : [],
                        series: [{
                            type: 'gauge',
                            startAngle: 180,
                            endAngle: 0,
                            min: 0,
                            max: 100,
                            axisLine: { lineStyle: { width: 15, color: [[0.75, '#10b981'], [0.9, '#f59e0b'], [1, '#ef4444']] } },
                            pointer: { width: 4 },
                            axisTick: { distance: -15, length: 5 },
                            splitLine: { distance: -20, length: 15 },
                            axisLabel: { distance: 20, fontSize: 10, formatter: '{value}%' },
                            detail: { formatter: '{value}%', fontSize: 20, offsetCenter: [0, '60%'], valueAnimation: true, color },
                            data: [{ value: diskPercent, name: 'Used' }]
                        }]
                    });
                    charts['disk-' + widgetId] = ec;
                    
                    // Inject sparkline and projection below gauge
                    if(sparklineHTML || projectionHTML){
                        chart.insertAdjacentHTML('beforeend', '<div style="position:absolute; bottom:5px; left:50%; transform:translateX(-50%); text-align:center; width:100%;">'
                            + sparklineHTML + projectionHTML + '</div>');
                    }
                }
            } catch (error) {
                console.error('Failed to load disk gauge:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = 'Error';
            }
        }
        
        async function fetchMemoryCpuTrend(widgetId) {
            try {
                const response = await fetch('/api/system/metrics', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                const chart = document.getElementById('chart-' + widgetId);
                
                // Format memory from MB to GB with proper unit
                const memoryGB = (data.memoryUsage / 1024).toFixed(2);
                const cpuPercent = data.cpuUsage.toFixed(1);
                
                if (val) {
                    // Small widget: show both metrics
                    val.innerHTML = '<div style="font-size: 0.85em;"><div>CPU: ' + cpuPercent + '%</div><div>MEM: ' + memoryGB + ' GB</div></div>';
                } else if (chart && typeof echarts !== 'undefined') {
                    // Chart widget: show current values (can be extended with historical data)
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { 
                            text: 'CPU: ' + cpuPercent + '% | Memory: ' + memoryGB + ' GB', 
                            left: 'center', 
                            top: '5%', 
                            textStyle: { fontSize: 14, color: 'var(--text-primary)' } 
                        },
                        tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
                        legend: { data: ['CPU Usage', 'Memory Usage'], bottom: 5, left: 'center', textStyle: { color: 'var(--text-muted)' } },
                        grid: { left: '15%', right: '15%', bottom: '20%', top: '30%', containLabel: true },
                        xAxis: { type: 'category', data: ['Current'], axisLabel: { color: 'var(--text-muted)' } },
                        yAxis: { type: 'value', name: '%', max: 100, axisLabel: { formatter: '{value}%', color: 'var(--text-muted)' }, nameTextStyle: { color: 'var(--text-muted)' } },
                        series: [
                            { 
                                name: 'CPU Usage', 
                                type: 'bar', 
                                data: [parseFloat(cpuPercent)], 
                                itemStyle: { color: '#3b82f6' },
                                label: { show: true, position: 'top', formatter: '{c}%' }
                            },
                            { 
                                name: 'Memory Usage', 
                                type: 'bar', 
                                data: [Math.min(100, (data.memoryUsage / 16384 * 100).toFixed(1))], // Assuming 16GB max
                                itemStyle: { color: '#10b981' },
                                label: { show: true, position: 'top', formatter: '{c}%' }
                            }
                        ]
                    });
                    charts['mem-cpu-' + widgetId] = ec;
                }
            } catch (error) {
                console.error('Failed to load memory/CPU trend:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = 'Error';
            }
        }
        
        async function fetchUptimeTracker(widgetId) {
            try {
                const response = await fetch('/api/system/health', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                const chart = document.getElementById('chart-' + widgetId);
                
                if (data.uptime) {
                    const hours = Math.floor(data.uptime / 3600);
                    const days = Math.floor(hours / 24);
                    const remainingHours = hours % 24;
                    const uptimeText = days + 'd ' + remainingHours + 'h';
                    
                    if (val) {
                        // Small widget: show uptime
                        val.textContent = uptimeText;
                    } else if (chart) {
                        // Chart widget: show uptime details
                        chart.innerHTML = 
                            '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 15px;">' +
                                '<div style="font-size: 2em; font-weight: bold; color: var(--success-color); margin-bottom: 10px;">' + uptimeText + '</div>' +
                                '<div style="font-size: 0.9em; color: var(--text-secondary);">System Uptime</div>' +
                                '<div style="margin-top: 15px; font-size: 0.85em; color: var(--text-primary);">' +
                                    '<div>Status: <span style="color: var(--success-color);">✓ ' + (data.status || 'Healthy') + '</span></div>' +
                                    '<div>Total Seconds: ' + data.uptime.toLocaleString() + 's</div>' +
                                '</div>' +
                            '</div>';
                    }
                }
            } catch (error) {
                console.error('Failed to load uptime:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = 'Error';
            }
        }
        
        async function fetchLogAnomaly(widgetId) {
            try {
                const response = await fetch('/api/analytics/anomalies', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                
                if (container) {
                    if (!data.success || !data.anomalies) {
                        container.innerHTML = '<div class="empty-state"><i class="fas fa-search empty-state-icon" style="font-size:2rem;"></i><br>Unable to fetch anomaly data</div>';
                        return;
                    }
                    
                    if (data.anomalies.length === 0) {
                        container.innerHTML = '<div class="empty-state success"><i class="fas fa-check-circle empty-state-icon" style="font-size:2rem;"></i><br>No anomalies detected<br><small>System is operating normally</small></div>';
                    } else {
                        var getSeverityColor = function(sev){
                            if(sev === 'critical') return 'var(--error-color)';
                            if(sev === 'high') return '#f59e0b';
                            if(sev === 'medium') return 'var(--warning-color)';
                            return 'var(--info-color)';
                        };
                        var getSeverityIcon = function(sev){
                            if(sev === 'critical') return '&#128308;'; // Red circle
                            if(sev === 'high') return '&#128992;';     // Orange circle
                            if(sev === 'medium') return '&#128993;';   // Yellow circle
                            return '&#128309;'; // Blue circle
                        };
                        
                        container.innerHTML = '<div style="padding: 1rem; max-height:100%; overflow-y:auto;">' + 
                            '<div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; text-align: center; font-size:0.85em;">' +
                            '<strong>Detection:</strong> ' + (data.detectionMethod || 'statistical') + ' | ' +
                            '<strong>Analyzed:</strong> ' + (data.totalAnalyzed || 0) + ' samples' +
                            '</div>' +
                            data.anomalies.map(function(a){
                                var color = getSeverityColor(a.severity);
                                var icon = getSeverityIcon(a.severity);
                                return '<div style="padding: 0.75rem; margin-bottom: 0.5rem; border-left: 3px solid ' + color + '; background: var(--bg-secondary); border-radius: 4px; font-size:0.85em;">' +
                                    '<span style="font-size: 1.2rem;">' + icon + '</span> ' +
                                    '<strong style="color:' + color + ';">' + a.severity.toUpperCase() + '</strong> ' +
                                    '| Hour ' + a.hour + ' (' + a.level + ')' +
                                    '<br><strong>Count:</strong> ' + a.count + ' (mean: ' + a.mean + ', σ: ' + a.stdev + ')' +
                                    '<br><strong>Z-Score:</strong> ' + a.zScore + ' (' + a.deviation + ')' +
                                    '</div>';
                            }).join('') + '</div>';
                    }
                }
            } catch (error) {
                console.error('Failed to load anomaly data:', error);
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container) {
                    container.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading anomaly data</div>';
                }
            }
        }
        
        async function fetchSlaMonitor(widgetId) {
            try {
                // Get real SLA data
                const response = await fetch('/health', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                
                const val = document.getElementById('val-' + widgetId);
                const chart = document.getElementById('chart-' + widgetId);
                
                if (!data || data.status !== 'ready') {
                    if (val) val.textContent = 'N/A';
                    if (chart) chart.innerHTML = '<div class="empty-state"><i class="fas fa-certificate empty-state-icon"></i><br>SLA data unavailable</div>';
                    return;
                }
                
                // Calculate uptime percentage from actual uptime
                const uptime = data.uptime || 0;
                const uptimeHours = uptime / 3600;
                // Calculate uptime percentage (assume 30 days total time window)
                const uptimePercent = uptimeHours > 0 ? Math.min(99.99, (uptimeHours / (30 * 24)) * 100).toFixed(2) : '0.00';
                
                
                if (val) {
                    // Small widget: show uptime percentage from health
                    val.innerHTML = '<div style="font-size:0.85em; line-height:1.2;">' +
                        '<div><strong>' + uptimePercent + '%</strong></div>' +
                        '<div style="color:var(--text-muted); font-size:0.7em;">Uptime</div>' +
                        '<div style="color:var(--text-muted); font-size:0.7em;">Status: ' + data.status + '</div>' +
                        '</div>';
                    val.style.color = data.status === 'ready' ? 'var(--success-color)' : 'var(--warning-color)';
                } else if (chart) {
                    chart.innerHTML = '<div style="padding:1rem; text-align:center;">' +
                        '<div style="font-size:2rem; font-weight:700; color:var(--success-color);">' + uptimePercent + '%</div>' +
                        '<div style="color:var(--text-muted); margin-top:0.5rem;">System Uptime (30d window)</div>' +
                        '<div style="margin-top:1rem; font-size:0.85rem;">Status: <span style="color:' + (data.status === 'ready' ? 'var(--success-color)' : 'var(--warning-color)') + ';">✓ ' + data.status + '</span></div>' +
                        '<div style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-muted);">Server running for ' + formatUptime(data.uptime || 0) + '</div>' +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load SLA:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = 'Error';
            }
        }
        
        // ========== DATA VIEW WIDGET FETCHERS ==========
        
        async function fetchRecentErrors(widgetId) {
            try {
                const response = await fetch('/api/logs?level=error&limit=20&sort=desc', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                // API returns { logs: [...] } not { results: [...] }
                const logs = data.logs || data.results || [];
                if (container && logs.length > 0) {
                    container.innerHTML = '<div style="max-height: 100%; overflow-y: auto;">' + logs.map(log => 
                        '<div style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">' +
                        '<div style="color: var(--error-color); font-weight: 600;">' + (log.message || 'Error') + '</div>' +
                        '<div style="color: var(--text-muted); font-size: 0.75rem;">' + 
                        (log.source || 'Unknown') + ' • ' + formatTimestamp(log.timestamp) +
                        '</div></div>'
                    ).join('') + '</div>';
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No recent errors</div>';
                }
            } catch (error) {
                console.error('Failed to load recent errors:', error);
            }
        }
        
        async function fetchLiveStream(widgetId) {
            try {
                // Use /api/logs?limit=50&sort=desc for live stream (latest endpoint may not exist)
                const response = await fetch('/api/logs?limit=50&sort=desc', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                const logs = data.logs || [];
                if (container && logs.length > 0) {
                    container.innerHTML = '<div style="max-height: 100%; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">' + 
                        logs.map(log => 
                            '<div style="padding: 0.25rem; border-bottom: 1px solid var(--border-color);">' +
                            '<span style="color: var(--text-muted);">' + formatTime(log.timestamp) + '</span> ' +
                            '<span style="color: ' + getLevelColor(log.level) + ';">[' + (log.level || 'INFO') + ']</span> ' +
                            (log.message || '') +
                            '</div>'
                        ).join('') + '</div>';
                    
                    // Auto-refresh every 5 seconds
                    setTimeout(() => fetchLiveStream(widgetId), 5000);
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No logs available</div>';
                }
            } catch (error) {
                console.error('Failed to load live stream:', error);
            }
        }
        
        function getLevelColor(level) {
            const colors = {
                'error': 'var(--error-color)',
                'warn': 'var(--warning-color)',
                'info': 'var(--info-color)',
                'debug': 'var(--text-muted)'
            };
            return colors[level?.toLowerCase()] || 'var(--text-primary)';
        }
        
        async function fetchSearchResults(widgetId) {
            try {
                // Show recent error logs
                const response = await fetch('/api/logs?level=error&limit=20&sort=desc', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                const logs = data.logs || data.results || [];
                
                if (container && logs.length > 0) {
                    container.innerHTML = '<div style="padding: 0.5rem; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-muted); text-align: center;"><i class="fas fa-exclamation-triangle"></i> Most Recent Error Logs</div>' +
                        '<table style="width: 100%; border-collapse: collapse; font-size:0.85rem;">' +
                        '<thead><tr style="border-bottom: 2px solid var(--border-color); font-weight: 600;">' +
                        '<th style="padding: 0.5rem; text-align: left;">Time</th>' +
                        '<th style="padding: 0.5rem; text-align: left;">Level</th>' +
                        '<th style="padding: 0.5rem; text-align: left;">Message</th>' +
                        '</tr></thead><tbody>' +
                        logs.map(log =>
                            '<tr style="border-bottom: 1px solid var(--border-color);">' +
                            '<td style="padding: 0.5rem;">' + formatTime(log.timestamp) + '</td>' +
                            '<td style="padding: 0.5rem;"><span style="color: ' + getLevelColor(log.level) + ';">' + (log.level || 'ERROR') + '</span></td>' +
                            '<td style="padding: 0.5rem;">' + (log.message || '').substring(0, 60) + '</td>' +
                            '</tr>'
                        ).join('') + '</tbody></table>';
                } else if (container) {
                    container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle empty-state-icon" style="color: var(--success-color);"></i><br>No Recent Errors<br><small>No error logs found in the system</small></div>';
                }
            } catch (error) {
                console.error('Failed to load search results:', error);
                const container = document.getElementById('data-' + widgetId);
                if (container) container.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading results</div>';
            }
        }
        
        async function fetchFilteredTable(widgetId) {
            try {
                const response = await fetch('/api/logs?limit=50', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                const logs = data.logs || data.results || [];
                if (container && logs.length > 0) {
                    container.innerHTML = '<table style="width: 100%; font-size: 0.85rem;">' +
                        '<thead><tr style="background: var(--bg-secondary);">' +
                        '<th style="padding: 0.5rem;">Time</th>' +
                        '<th style="padding: 0.5rem;">Level</th>' +
                        '<th style="padding: 0.5rem;">Source</th>' +
                        '<th style="padding: 0.5rem;">Message</th>' +
                        '</tr></thead><tbody>' +
                        logs.map(log => 
                            '<tr style="border-bottom: 1px solid var(--border-color);">' +
                            '<td style="padding: 0.5rem;">' + new Date(log.timestamp).toLocaleTimeString() + '</td>' +
                            '<td style="padding: 0.5rem;"><span style="color: ' + getLevelColor(log.level) + ';">' + (log.level || 'INFO') + '</span></td>' +
                            '<td style="padding: 0.5rem;">' + (log.source || '-') + '</td>' +
                            '<td style="padding: 0.5rem;">' + (log.message || '').substring(0, 50) + '</td>' +
                            '</tr>'
                        ).join('') + '</tbody></table>';
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No logs to display</div>';
                }
            } catch (error) {
                console.error('Failed to load filtered table:', error);
            }
        }
        
        async function fetchTagCloud(widgetId) {
            try {
                const response = await fetch('/api/analytics/categories', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('chart-' + widgetId);
                // API returns { categories: [{category, count}] } array, not object
                const categories = data.categories || [];
                if (container && categories.length > 0) {
                    const entries = categories.map(c => [c.category, c.count]);
                    if(entries.length === 0){
                        container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);"><i class="fas fa-tags" style="font-size:3rem; margin-bottom:1rem; opacity:0.3;"></i><br>No Categories Available<br><small>This widget shows log sources and categories as a tag cloud.<br>Add <code>category</code> field to your logs to see them visualized here.</small></div>';
                        return;
                    }
                    
                    // Calculate min/max for log-based scaling
                    const counts = entries.map(e => e[1]);
                    const minCount = Math.min(...counts);
                    const maxCount = Math.max(...counts);
                    
                    // Map tags with log-scaled sizes
                    const tags = entries.map(([tag, count]) => {
                        var logScale = Math.log(count + 1) / Math.log(maxCount + 1);
                        var size = 14 + Math.floor(logScale * 50); // 14px to 64px range
                        return { name: tag, value: count, textStyle: { fontSize: size } };
                    });
                    
                    // Categorize tags by frequency
                    var categorizeTag = function(count, max){
                        var ratio = count / max;
                        if(ratio > 0.7) return { cat: 'High', color: 'hsl(0,70%,50%)' };    // Red
                        if(ratio > 0.4) return { cat: 'Medium', color: 'hsl(30,70%,50%)' }; // Orange
                        if(ratio > 0.15) return { cat: 'Low', color: 'hsl(200,70%,50%)' };  // Blue
                        return { cat: 'Rare', color: 'hsl(140,60%,45%)' };                  // Green
                    };
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(container);
                        ec.setOption({
                            title: { 
                                text: 'Category Tag Cloud', 
                                left: 'center', 
                                top: 0,
                                textStyle: { fontSize: 14, color: 'var(--text-primary)' } 
                            },
                            grid: { top: 40, bottom: 70 },
                            series: [{
                                type: 'wordCloud',
                                shape: 'circle',
                                left: 'center',
                                top: 50,
                                width: '90%',
                                height: '70%',
                                sizeRange: [14, 64],
                                rotationRange: [0, 0],
                                data: tags,
                                textStyle: {
                                    fontFamily: 'sans-serif',
                                    fontWeight: 'bold',
                                    color: function(params) {
                                        var count = params.value || 0;
                                        return categorizeTag(count, maxCount).color;
                                    }
                                },
                                emphasis: {
                                    textStyle: { shadowBlur: 5, shadowColor: 'rgba(0,0,0,0.3)' }
                                }
                            }]
                        });
                        
                        // Add legend below chart
                        var legendHTML = '<div style="position:absolute; bottom:5px; left:50%; transform:translateX(-50%); display:flex; gap:1rem; font-size:0.7rem; color:var(--text-muted);">'
                            + '<span><span style="display:inline-block; width:10px; height:10px; background:hsl(0,70%,50%); border-radius:2px; margin-right:3px;"></span>High (>70%)</span>'
                            + '<span><span style="display:inline-block; width:10px; height:10px; background:hsl(30,70%,50%); border-radius:2px; margin-right:3px;"></span>Medium (40-70%)</span>'
                            + '<span><span style="display:inline-block; width:10px; height:10px; background:hsl(200,70%,50%); border-radius:2px; margin-right:3px;"></span>Low (15-40%)</span>'
                            + '<span><span style="display:inline-block; width:10px; height:10px; background:hsl(140,60%,45%); border-radius:2px; margin-right:3px;"></span>Rare (<15%)</span>'
                            + '</div>';
                        container.style.position = 'relative';
                        container.insertAdjacentHTML('beforeend', legendHTML);
                    }
                }
            } catch (error) {
                console.error('Failed to load tag cloud:', error);
                const container = document.getElementById('chart-' + widgetId);
                if (container) {
                    container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);"><i class="fas fa-tags" style="font-size:3rem; margin-bottom:1rem; opacity:0.3;"></i><br>Tag Cloud<br><small>Displays log sources and categories as a tag cloud.<br>No category data available yet.</small></div>';
                }
            }
        }
        
        async function fetchSourceActivity(widgetId) {
            try {
                const response = await fetch('/api/analytics/top-sources?limit=15', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                // API returns { top: [...] } not { topSources: [...] }
                const sources = data.top || data.topSources || [];
                if (container && sources.length > 0) {
                    container.innerHTML = '<div style="padding: 1rem;">' + sources.map(source => 
                        '<div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">' +
                        '<span>' + (source.source || 'Unknown') + '</span>' +
                        '<span style="font-weight: 600; color: var(--accent-primary);">' + source.count.toLocaleString() + '</span>' +
                        '</div>'
                    ).join('') + '</div>';
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No source data available</div>';
                }
            } catch (error) {
                console.error('Failed to load source activity:', error);
            }
        }
        
        async function fetchUserActivity(widgetId) {
            try {
                const response = await fetch('/api/audit-trail?limit=20', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                // API may return { logs: [...] } or { results: [...] } or { events: [...] }
                const logs = data.logs || data.results || data.events || [];
                if (container && logs.length > 0) {
                    container.innerHTML = '<div style="max-height: 100%; overflow-y: auto;">' + logs.map(log => 
                        '<div style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">' +
                        '<div style="font-weight: 600;">' + (log.username || log.user || 'System') + '</div>' +
                        '<div style="font-size: 0.85rem; color: var(--text-muted);">' + (log.action || 'Action') + '</div>' +
                        '<div style="font-size: 0.75rem; color: var(--text-muted);">' + new Date(log.timestamp).toLocaleString() + '</div>' +
                        '</div>'
                    ).join('') + '</div>';
                } else if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No user activity</div>';
                }
            } catch (error) {
                console.error('Failed to load user activity:', error);
            }
        }
        
        async function fetchEventTimeline(widgetId) {
            try {
                const response = await fetch('/api/logs?limit=100&sort=desc', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                const logs = data.logs || data.results || [];
                if (chart && typeof echarts !== 'undefined' && logs.length > 0) {
                    const ec = echarts.init(chart);
                    const events = logs.map(log => [
                        new Date(log.timestamp).getTime(),
                        log.level === 'error' ? 1 : 0,
                        log.message
                    ]);
                    ec.setOption({
                        title: { text: 'Event Timeline', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { type: 'time' },
                        yAxis: { type: 'value', show: false },
                        series: [{
                            type: 'scatter',
                            data: events,
                            symbolSize: 8
                        }]
                    });
                }
            } catch (error) {
                console.error('Failed to load event timeline:', error);
            }
        }
        
        // Initialize marketplace on page load
        document.addEventListener('DOMContentLoaded', () => {
            renderWidgetGrid(widgetCatalog);
        });
        
        // ========== SYSTEM TOOL WIDGET FETCHERS ==========
        
        async function fetchIntegrationStatus(widgetId) {
            try {
                const response = await fetch('/api/integrations/status', {
                    credentials: 'same-origin'
                });
                
                if (!response.ok) {
                    throw new Error('Integrations endpoint not available');
                }
                
                const data = await response.json();
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                
                if (container) {
                    if (!data.integrations || data.integrations.length === 0) {
                        container.innerHTML = '<div class="empty-state"><i class="fas fa-plug empty-state-icon"></i><br>No Integrations<br><small style="color:var(--text-muted);">Configure integrations in Settings to see their status here</small></div>';
                        return;
                    }
                    
                    container.innerHTML = '<div style="padding: 1rem;">' + data.integrations.map(int => 
                        '<div style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-secondary); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">' +
                        '<div><strong>' + (int.name || 'Integration') + '</strong><br><small style="color: var(--text-muted);">' + (int.type || '') + '</small></div>' +
                        '<span class="status-badge ' + (int.status === 'connected' ? 'healthy' : 'degraded') + '">' + (int.status || 'unknown') + '</span>' +
                        '</div>'
                    ).join('') + '</div>';
                }
            } catch (error) {
                console.error('Failed to load integration status:', error);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container) {
                    container.innerHTML = '<div class="empty-state"><i class="fas fa-plug empty-state-icon"></i><br>Integrations Unavailable<br><small style="color:var(--text-muted);">Integration monitoring not enabled on this server</small></div>';
                }
            }
        }
        
        async function fetchWebhookTester(widgetId) {
            const container = document.getElementById('system-' + widgetId) || document.getElementById('action-' + widgetId) || document.getElementById('data-' + widgetId);
            if (container) {
                container.innerHTML = 
                    '<div style="padding: 1rem;">' +
                    '<input type="url" id="webhook-url-' + widgetId + '" placeholder="https://example.com/webhook" class="form-control" style="margin-bottom: 0.5rem;">' +
                    '<button class="btn" onclick="testWebhookFromWidget(&quot;' + widgetId + '&quot;)" style="width: 100%;"><i class="fas fa-paper-plane"></i> Send Test</button>' +
                    '<div id="webhook-result-' + widgetId + '" style="margin-top: 0.5rem; padding: 0.5rem; border-radius: 4px; display: none;"></div>' +
                    '</div>';
            }
        }
        
        async function testWebhookFromWidget(widgetId) {
            const url = document.getElementById('webhook-url-' + widgetId)?.value;
            const resultDiv = document.getElementById('webhook-result-' + widgetId);
            if (!url || !resultDiv) return;
            
            try {
                const response = await fetch('/api/webhooks/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ url, payload: { test: true, timestamp: Date.now() } })
                });
                const data = await response.json();
                resultDiv.style.display = 'block';
                resultDiv.style.background = data.success ? 'var(--success-bg)' : 'var(--error-bg)';
                resultDiv.style.color = data.success ? 'var(--success-color)' : 'var(--error-color)';
                resultDiv.textContent = data.message || (data.success ? 'Success!' : 'Failed');
            } catch (error) {
                resultDiv.style.display = 'block';
                resultDiv.style.background = 'var(--error-bg)';
                resultDiv.style.color = 'var(--error-color)';
                resultDiv.textContent = 'Error: ' + error.message;
            }
        }
        
        async function fetchDatabaseStats(widgetId) {
            try {
                const [metricsRes, healthRes] = await Promise.all([
                    fetch('/api/system/metrics', { credentials: 'same-origin' }),
                    fetch('/api/system/health', { credentials: 'same-origin' })
                ]);
                const metrics = await metricsRes.json();
                const health = await healthRes.json();
                
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container) {
                    // Extract database stats from health check
                    const dbCheck = health.checks?.database || {};
                    const logCount = dbCheck.log_count || 0;
                    let responseTime = dbCheck.response_time || 'N/A';
                    // If response_time is a number, format it with 'ms'
                    if (typeof responseTime === 'number') {
                        responseTime = responseTime.toFixed(2) + 'ms';
                    } else if (responseTime !== 'N/A' && !responseTime.includes('ms')) {
                        responseTime = responseTime + 'ms';
                    }
                    const dbStatus = dbCheck.status || 'unknown';
                    
                    // Calculate approximate database size (rough estimate: 500 bytes per log)
                    const estimatedSizeKB = (logCount * 0.5).toFixed(2);
                    const sizeDisplay = estimatedSizeKB > 1024 
                        ? (estimatedSizeKB / 1024).toFixed(2) + ' MB' 
                        : estimatedSizeKB + ' KB';
                    
                    container.innerHTML = 
                        '<div style="padding: 1rem;">' +
                        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">' +
                        '<div style="text-align: center;"><div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-primary);">' + sizeDisplay + '</div><div style="color: var(--text-muted); font-size: 0.75rem;">DB Size (Est.)</div></div>' +
                        '<div style="text-align: center;"><div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-primary);">' + logCount.toLocaleString() + '</div><div style="color: var(--text-muted); font-size: 0.75rem;">Total Logs</div></div>' +
                        '<div style="text-align: center;"><div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-primary);">' + responseTime + '</div><div style="color: var(--text-muted); font-size: 0.75rem;">Response Time</div></div>' +
                        '<div style="text-align: center;"><div style="font-size: 1.5rem; font-weight: 700; color: ' + (dbStatus === 'healthy' ? 'var(--success-color)' : 'var(--warning-color)') + ';">✓</div><div style="color: var(--text-muted); font-size: 0.75rem;">Status: ' + dbStatus + '</div></div>' +
                        '</div></div>';
                }
            } catch (error) {
                console.error('Failed to load database stats:', error);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container) {
                    container.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--error-color);">Failed to load database stats</div>';
                }
            }
        }
        
        async function fetchSessionMonitor(widgetId) {
            try {
                // Use users API to get active sessions
                const response = await fetch('/api/users', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                
                const userCount = (data.users && data.users.length) || 0;
                
                if (val) {
                    val.textContent = userCount;
                } else if (container) {
                    container.innerHTML = 
                        '<div style="padding: 1rem; text-align: center;">' +
                        '<div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-primary);">' + userCount + '</div>' +
                        '<div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">Active Users</div>' +
                        '<div style="margin-top: 1rem; font-size: 0.75rem; color: var(--text-muted);">Registered user accounts</div>' +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load session count:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = '0';
            }
        }
        
        async function fetchApiKeyManager(widgetId) {
            const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
            if (container) {
                container.innerHTML = 
                    '<div style="padding: 1rem; text-align: center;">' +
                    '<p style="color: var(--text-muted); margin-bottom: 1rem;">Manage API keys and access tokens</p>' +
                    '<button class="btn btn-primary" onclick="window.location.href=&quot;/admin/api-keys&quot;">Manage Keys</button>' +
                    '</div>';
            }
        }
        
        async function fetchBackupStatus(widgetId) {
            try {
                const response = await fetch('/api/backups', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                
                // API returns {success: true, backups: []}
                const backups = (data.success && data.backups) || [];
                const backupCount = backups.length;
                
                if (val) {
                    val.textContent = backupCount;
                } else if (container) {
                    const latest = backups[0];
                    let latestTime = 'Never';
                    if (latest && latest.created_at) {
                        try {
                            latestTime = new Date(latest.created_at).toLocaleString();
                        } catch (e) {
                            latestTime = latest.created_at;
                        }
                    }
                    
                    container.innerHTML = 
                        '<div style="padding: 1rem; text-align: center;">' +
                        '<div style="font-size: 1.5rem; font-weight: 700; color: ' + (backupCount > 0 ? 'var(--success-color)' : 'var(--warning-color)') + ';">' + backupCount + '</div>' +
                        '<div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">Total Backups</div>' +
                        '<div style="margin-top: 1rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px; font-size: 0.75rem;">' +
                        '<div style="color: var(--text-muted);">Latest Backup:</div>' +
                        '<div style="margin-top: 0.25rem;">' + latestTime + '</div>' +
                        '</div>' +
                        (backupCount === 0 ? '<div style="margin-top:0.5rem; font-size:0.7rem; color:var(--warning-color);">⚠ No backups found</div>' : '') +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load backup status:', error);
                const val = document.getElementById('val-' + widgetId);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                if (val) val.textContent = '0';
                if (container) container.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading backups</div>';
            }
        }
        
        async function fetchLogRetention(widgetId) {
            try {
                const response = await fetch('/api/settings', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const val = document.getElementById('val-' + widgetId);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                
                // Settings API returns {settings: {system: {retention_days: X}}}
                const retentionDays = (data.settings && data.settings.system && data.settings.system.retention_days) || 30;
                
                if (val) {
                    val.textContent = retentionDays + ' days';
                } else if (container) {
                    container.innerHTML = 
                        '<div style="padding: 1rem; text-align: center;">' +
                        '<div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-primary);">' + retentionDays + '</div>' +
                        '<div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">Days</div>' +
                        '<div style="margin-top: 1rem; font-size: 0.75rem; color: var(--text-muted);">Log retention period</div>' +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load log retention:', error);
                const val = document.getElementById('val-' + widgetId);
                if (val) val.textContent = '30 days';
            }
        }
        
        async function fetchSystemInfo(widgetId) {
            try {
                const response = await fetch('/health', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                if (container) {
                    container.innerHTML = 
                        '<div style="padding: 1rem;">' +
                        '<div style="margin-bottom: 0.5rem;"><strong>Version:</strong> ' + (data.version || '2.2.0') + '</div>' +
                        '<div style="margin-bottom: 0.5rem;"><strong>Platform:</strong> Node.js</div>' +
                        '<div style="margin-bottom: 0.5rem;"><strong>Node:</strong> ' + (data.node || 'N/A') + '</div>' +
                        '<div style="margin-bottom: 0.5rem;"><strong>Status:</strong> <span style="color: ' + (data.status === 'ready' ? 'var(--success-color)' : 'var(--warning-color)') + ';">✓ ' + (data.status || 'unknown') + '</span></div>' +
                        '<div><strong>Uptime:</strong> ' + formatUptime(data.uptime || 0) + '</div>' +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to load system info:', error);
                const container = document.getElementById('system-' + widgetId) || document.getElementById('data-' + widgetId);
                if (container) container.innerHTML = '<div style="padding: 1rem; color: var(--error-color);">Failed to load system info</div>';
            }
        }
        
        function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return days + 'd ' + hours + 'h ' + minutes + 'm';
        }
        
        // ========== CUSTOM VISUALIZATION WIDGET FETCHERS ==========
        
        async function fetchQueryBuilder(widgetId) {
            const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
            if (container) {
                container.innerHTML = 
                    '<div style="padding: 1rem;">' +
                    '<textarea id="query-sql-' + widgetId + '" placeholder="SELECT * FROM logs WHERE level = &apos;error&apos; LIMIT 10" class="form-control" style="height: 100px; font-family: monospace; margin-bottom: 0.5rem;"></textarea>' +
                    '<button class="btn btn-primary" onclick="executeCustomQuery(&quot;' + widgetId + '&quot;)" style="width: 100%;"><i class="fas fa-play"></i> Execute Query</button>' +
                    '<div id="query-results-' + widgetId + '" style="margin-top: 1rem; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;"></div>' +
                    '</div>';
            }
        }
        
        async function executeCustomQuery(widgetId) {
            const sql = document.getElementById('query-sql-' + widgetId)?.value;
            const resultsDiv = document.getElementById('query-results-' + widgetId);
            if (!sql || !resultsDiv) return;
            
            resultsDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Executing...</p>';
            
            try {
                // Note: This would need a backend endpoint to safely execute queries
                resultsDiv.innerHTML = '<p style="color: var(--warning-color);">Custom queries require admin privileges and backend implementation.</p>';
            } catch (error) {
                resultsDiv.innerHTML = '<p style="color: var(--error-color);">Error: ' + error.message + '</p>';
            }
        }
        
        async function fetchSavedQuery(widgetId) {
            try {
                const response = await fetch('/api/saved-searches?limit=10', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const container = document.getElementById('data-' + widgetId);
                if (container && data.searches) {
                    container.innerHTML = '<div style="padding: 1rem;">' + 
                        (data.searches.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">No saved queries</p>' :
                        data.searches.map(search => 
                            '<div style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-secondary); border-radius: 6px; cursor: pointer;" onclick="executeSavedQuery(' + search.id + ')">' +
                            '<strong>' + (search.name || 'Query') + '</strong><br>' +
                            '<small style="color: var(--text-muted);">Used ' + (search.use_count || 0) + ' times</small>' +
                            '</div>'
                        ).join('')) + '</div>';
                }
            } catch (error) {
                console.error('Failed to load saved queries:', error);
            }
        }
        
        async function executeSavedQuery(searchId) {
            window.location.href = '/search?saved=' + searchId;
        }
        
        async function fetchCorrelationMatrix(widgetId) {
            try {
                const response = await fetch('/api/analytics/stats', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                
                if (chart) {
                    // Check if correlation data exists
                    if (!data.correlations || !data.correlations.labels || !data.correlations.matrix) {
                        chart.innerHTML = '<div class="empty-state"><i class="fas fa-chart-area empty-state-icon" style="font-size:2rem;"></i><br>Correlation Analysis<br><small style="color:var(--text-muted);">Not enough data for correlation analysis. Requires multiple log sources and categories.</small></div>';
                        return;
                    }
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(chart);
                        ec.setOption({
                            title: { text: 'Correlation Matrix', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                            tooltip: { position: 'top', formatter: function(params) { return params.value[2] !== undefined ? 'Correlation: ' + params.value[2].toFixed(2) : 'N/A'; } },
                            grid: { height: '60%', top: '15%' },
                            xAxis: { type: 'category', data: data.correlations.labels, axisLabel: { rotate: 45, fontSize: 10, color: 'var(--text-muted)' } },
                            yAxis: { type: 'category', data: data.correlations.labels, axisLabel: { fontSize: 10, color: 'var(--text-muted)' } },
                            visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '5%', text: ['High', 'Low'] },
                            series: [{ name: 'Correlation', type: 'heatmap', data: data.correlations.matrix || [], label: { show: true, fontSize: 8 } }]
                        });
                        charts['correlation-' + widgetId] = ec;
                    }
                }
            } catch (error) {
                console.error('Failed to load correlation matrix:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) {
                    chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading correlation data</div>';
                }
            }
        }
        
        async function fetchPatternDetection(widgetId) {
            try {
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (!container) return;
                
                container.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Analyzing patterns...</div>';
                
                // Fetch recent logs for pattern analysis
                const [logsResp, statsResp] = await Promise.all([
                    fetch('/api/logs?limit=500&hours=24', { credentials: 'same-origin' }),
                    fetch('/api/logs/stats?period=24h', { credentials: 'same-origin' })
                ]);
                
                const logsData = await logsResp.json();
                const statsData = await statsResp.json();
                const logs = logsData.logs || logsData.results || [];
                
                if (logs.length === 0) {
                    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox empty-state-icon"></i><br>No Data<br><small style="color:var(--text-muted);">Not enough logs for pattern analysis</small></div>';
                    return;
                }
                
                const patterns = [];
                
                // 1. Detect recurring error messages (same message appearing multiple times)
                const errorMessages = {};
                logs.filter(log => log.level === 'error').forEach(log => {
                    const msg = (log.message || '').substring(0, 100); // First 100 chars
                    if (msg) {
                        errorMessages[msg] = (errorMessages[msg] || 0) + 1;
                    }
                });
                
                Object.entries(errorMessages).forEach(([msg, count]) => {
                    if (count >= 3) { // Recurring if appears 3+ times
                        patterns.push({
                            type: '🔄 Recurring Error',
                            description: msg.length > 60 ? msg.substring(0, 57) + '...' : msg,
                            count: count,
                            confidence: Math.min(count / 10, 1), // Max confidence at 10+ occurrences
                            severity: count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low'
                        });
                    }
                });
                
                // 2. Detect error spikes (sudden increase in errors)
                const errorCount = logs.filter(log => log.level === 'error').length;
                const totalCount = logs.length;
                const errorRate = totalCount > 0 ? (errorCount / totalCount) : 0;
                
                if (errorRate > 0.2 && errorCount > 10) { // More than 20% errors
                    patterns.push({
                        type: '📈 Error Spike',
                        description: 'High error rate detected: ' + (errorRate * 100).toFixed(1) + '% of recent logs',
                        count: errorCount,
                        confidence: Math.min(errorRate * 2, 1),
                        severity: errorRate > 0.5 ? 'high' : errorRate > 0.3 ? 'medium' : 'low'
                    });
                }
                
                // 3. Detect source-specific issues (one source producing many errors)
                const errorsBySource = {};
                logs.filter(log => log.level === 'error' && log.source).forEach(log => {
                    errorsBySource[log.source] = (errorsBySource[log.source] || 0) + 1;
                });
                
                Object.entries(errorsBySource).forEach(([source, count]) => {
                    if (count >= 5) {
                        patterns.push({
                            type: '🎯 Source Issue',
                            description: '"' + source + '" is producing frequent errors',
                            count: count,
                            confidence: Math.min(count / 15, 1),
                            severity: count >= 20 ? 'high' : count >= 10 ? 'medium' : 'low'
                        });
                    }
                });
                
                // 4. Detect warning escalation (many warnings that might become errors)
                const warningCount = logs.filter(log => log.level === 'warning').length;
                if (warningCount > 30 && warningCount > errorCount * 3) {
                    patterns.push({
                        type: '⚠️ Warning Escalation',
                        description: 'High warning volume (' + warningCount + ') may indicate emerging issues',
                        count: warningCount,
                        confidence: 0.7,
                        severity: 'medium'
                    });
                }
                
                // 5. Check for time-based patterns (errors during specific hours)
                if (logs.length >= 100) {
                    const errorsByHour = {};
                    logs.filter(log => log.level === 'error' && log.timestamp).forEach(log => {
                        try {
                            const hour = new Date(log.timestamp).getHours();
                            errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
                        } catch (e) {}
                    });
                    
                    const avgErrorsPerHour = Object.values(errorsByHour).reduce((a, b) => a + b, 0) / Object.keys(errorsByHour).length;
                    Object.entries(errorsByHour).forEach(([hour, count]) => {
                        if (count > avgErrorsPerHour * 2 && count >= 5) {
                            patterns.push({
                                type: '⏰ Time Pattern',
                                description: 'Errors peak around ' + hour + ':00 (' + count + ' errors)',
                                count: count,
                                confidence: 0.8,
                                severity: 'low'
                            });
                        }
                    });
                }
                
                // Sort patterns by severity and count
                patterns.sort((a, b) => {
                    const severityOrder = { high: 3, medium: 2, low: 1 };
                    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0) || b.count - a.count;
                });
                
                // Display results
                if (patterns.length === 0) {
                    container.innerHTML = '<div class="empty-state success"><i class="fas fa-check-circle empty-state-icon" style="color: var(--success-color);"></i><br>No Patterns Detected<br><small style="color:var(--text-muted);">✓ No recurring issues or anomalies found in the last 24 hours</small></div>';
                } else {
                    const severityColors = {
                        high: 'var(--error-color)',
                        medium: 'var(--warning-color)',
                        low: 'var(--info-color)'
                    };
                    
                    container.innerHTML = '<div style="padding: 0.75rem;">' +
                        '<div style="margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; text-align: center; font-size: 0.75rem;">' +
                        '<strong>' + patterns.length + ' pattern' + (patterns.length !== 1 ? 's' : '') + ' detected</strong> in last 24h | ' +
                        '<span style="color: var(--text-muted);">Analyzed ' + logs.length + ' logs</span>' +
                        '</div>' +
                        patterns.slice(0, 10).map(pattern => 
                            '<div style="padding: 0.65rem; margin-bottom: 0.5rem; border-left: 3px solid ' + (severityColors[pattern.severity] || 'var(--accent-primary)') + '; background: var(--bg-secondary); border-radius: 4px;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.25rem;">' +
                            '<strong style="font-size: 0.85rem;">' + pattern.type + '</strong>' +
                            '<span style="font-size: 0.7rem; padding: 0.1rem 0.4rem; background: ' + (severityColors[pattern.severity] || 'var(--bg-tertiary)') + '; border-radius: 3px; text-transform: uppercase;">' + pattern.severity + '</span>' +
                            '</div>' +
                            '<div style="font-size: 0.8rem; color: var(--text-primary); margin-bottom: 0.25rem;">' + pattern.description + '</div>' +
                            '<div style="font-size: 0.7rem; color: var(--text-muted);">Occurrences: ' + pattern.count + ' | Confidence: ' + (pattern.confidence * 100).toFixed(0) + '%</div>' +
                            '</div>'
                        ).join('') +
                        (patterns.length > 10 ? '<div style="text-align: center; padding: 0.5rem; color: var(--text-muted); font-size: 0.75rem;">...and ' + (patterns.length - 10) + ' more</div>' : '') +
                        '</div>';
                }
            } catch (error) {
                console.error('Failed to analyze patterns:', error);
                const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
                if (container) {
                    container.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Analysis Error<br><small style="color:var(--error-color);">' + error.message + '</small></div>';
                }
            }
        }
        
        async function fetchCustomChart(widgetId) {
            try {
                const response = await fetch('/api/logs/stats?period=7d', {
                    credentials: 'same-origin'
                });
                const data = await response.json();
                const chart = document.getElementById('chart-' + widgetId);
                if (chart && typeof echarts !== 'undefined' && data.success && data.labels && data.labels.length > 0) {
                    const ec = echarts.init(chart);
                    ec.setOption({
                        title: { text: '7-Day Log Volume', left: 'center', textStyle: { fontSize: 14, color: 'var(--text-primary)' } },
                        tooltip: { trigger: 'axis' },
                        xAxis: { data: data.labels || [], axisLabel: { color: 'var(--text-muted)', rotate: 45 } },
                        yAxis: { name: 'Logs', axisLabel: { color: 'var(--text-muted)' }, nameTextStyle: { color: 'var(--text-muted)' } },
                        series: [{ type: 'bar', data: data.values || [], itemStyle: { color: '#10b981' } }]
                    });
                    charts['custom-' + widgetId] = ec;
                } else if (chart) {
                    chart.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar empty-state-icon"></i><br>7-Day Log Volume<br><small style="color:var(--text-muted);">No log data available for the past 7 days.<br>This chart shows daily log volume trends.</small></div>';
                }
            } catch (error) {
                console.error('Failed to load custom chart:', error);
                const chart = document.getElementById('chart-' + widgetId);
                if (chart) chart.innerHTML = '<div class="empty-state error"><i class="fas fa-exclamation-triangle empty-state-icon"></i><br>Error loading chart</div>';
            }
        }
        
        async function fetchMetricFormula(widgetId) {
            const container = document.getElementById('data-' + widgetId) || document.getElementById('system-' + widgetId);
            if (container) {
                container.innerHTML = 
                    '<div style="padding: 1rem;">' +
                    '<label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">Formula (24h data):</label>' +
                    '<input type="text" id="metric-formula-' + widgetId + '" placeholder="(errors / total) * 100" value="(errors / total) * 100" class="form-control" style="margin-bottom: 0.5rem; font-family: monospace;">' +
                    '<button class="btn btn-primary" onclick="calculateMetricFormula(&quot;' + widgetId + '&quot;)" style="width: 100%; margin-bottom: 0.5rem;"><i class="fas fa-calculator"></i> Calculate</button>' +
                    '<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Available variables: <code>errors</code>, <code>warnings</code>, <code>info</code>, <code>total</code></div>' +
                    '<div id="metric-result-' + widgetId + '" style="margin-top: 0.5rem; text-align: center; font-size: 1.8rem; font-weight: 700; color: var(--accent-primary);">Enter formula & calculate</div>' +
                    '</div>';
                // Auto-calculate on load
                setTimeout(() => calculateMetricFormula(widgetId), 500);
            }
        }
        
        async function calculateMetricFormula(widgetId) {
            const formula = document.getElementById('metric-formula-' + widgetId)?.value;
            const resultDiv = document.getElementById('metric-result-' + widgetId);
            if (!formula || !resultDiv) return;
            
            try {
                // Fetch required data from stats endpoint
                const response = await fetch('/api/logs/stats?period=24h', { credentials: 'same-origin' });
                const data = await response.json();
                
                if (!data.success) {
                    resultDiv.textContent = 'Error: Stats unavailable';
                    resultDiv.style.color = 'var(--error-color)';
                    return;
                }
                
                // Extract metrics for formula evaluation
                const total = data.total || 0;
                const errors = data.byLevel?.error || 0;
                const warnings = data.byLevel?.warning || 0;
                const info = data.byLevel?.info || 0;

                // Safe expression parser (supports numbers, errors, warnings, info, total, + - * / parentheses)
                function parseExpression(expr, ctx){
                    const tokens = expr.replace(/\s+/g,'')
                        .replace(/warnings/g, ctx.warnings.toString())
                        .replace(/errors/g, ctx.errors.toString())
                        .replace(/info/g, ctx.info.toString())
                        .replace(/total/g, ctx.total.toString());
                    if(!/^[-+*/()0-9.]+$/.test(tokens)) throw new Error('Invalid characters');
                    // Shunting-yard to RPN
                    const output=[]; const ops=[]; const prec={'+':1,'-':1,'*':2,'/':2};
                    let i=0; let num='';
                    function flushNum(){ if(num){ output.push(num); num=''; } }
                    while(i<tokens.length){
                        const c=tokens[i];
                        if(/[0-9.]/.test(c)){ num+=c; }
                        else if(c in prec){ flushNum(); while(ops.length){ const top=ops[ops.length-1]; if(top in prec && prec[top] >= prec[c]) output.push(ops.pop()); else break; } ops.push(c); }
                        else if(c==='('){ flushNum(); ops.push(c); }
                        else if(c===')'){ flushNum(); while(ops.length && ops[ops.length-1] !== '(') output.push(ops.pop()); if(!ops.length) throw new Error('Mismatched parentheses'); ops.pop(); }
                        else { throw new Error('Unexpected token'); }
                        i++;
                    }
                    flushNum(); while(ops.length){ const op=ops.pop(); if(op==='(') throw new Error('Mismatched parentheses'); output.push(op); }
                    // Evaluate RPN
                    const stack=[]; output.forEach(t=>{
                        if(t in prec){
                            if(stack.length<2) throw new Error('Malformed expression');
                            const b=parseFloat(stack.pop()); const a=parseFloat(stack.pop());
                            let r; if(t==='+' ) r=a+b; else if(t==='-') r=a-b; else if(t==='*') r=a*b; else if(t==='/'){ if(b===0) throw new Error('Divide by zero'); r=a/b; }
                            stack.push(r);
                        } else { stack.push(t); }
                    });
                    if(stack.length!==1) throw new Error('Malformed result');
                    const val=parseFloat(stack[0]); if(!isFinite(val)) throw new Error('Invalid result');
                    return val;
                }

                let result;
                try { result = parseExpression(formula, { errors, warnings, info, total }); }
                catch(e){ resultDiv.textContent='Err: ' + e.message; resultDiv.style.color='var(--error-color)'; return; }
                resultDiv.textContent = result.toFixed(2);
                resultDiv.style.color = 'var(--accent-primary)';
            } catch (error) {
                resultDiv.textContent = 'Error';
                resultDiv.style.color = 'var(--error-color)';
            }
        }
        
        async function fetchDataTransformer(widgetId) {
            const container = document.getElementById('data-' + widgetId) || document.getElementById('chart-' + widgetId);
            if (container) {
                container.innerHTML = 
                    '<div style="padding: 1rem;">' +
                    '<label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">Transform:</label>' +
                    '<select id="transform-type-' + widgetId + '" class="form-control" style="margin-bottom: 0.5rem;">' +
                    '<option value="aggregate">Aggregate by Source</option>' +
                    '<option value="pivot">Pivot by Level</option>' +
                    '<option value="filter">Filter Errors</option>' +
                    '<option value="group">Group by Hour</option>' +
                    '</select>' +
                    '<button class="btn btn-primary" onclick="applyDataTransform(&quot;' + widgetId + '&quot;)" style="width: 100%;"><i class="fas fa-cogs"></i> Apply Transform</button>' +
                    '<div id="transform-result-' + widgetId + '" style="margin-top: 1rem; max-height: 200px; overflow-y: auto; font-size: 0.85rem;"></div>' +
                    '</div>';
            }
        }
        
        async function applyDataTransform(widgetId) {
            const transformType = document.getElementById('transform-type-' + widgetId)?.value;
            const resultDiv = document.getElementById('transform-result-' + widgetId);
            if (!transformType || !resultDiv) return;
            
            resultDiv.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Transforming data...</p>';
            
            try {
                let endpoint = '/api/logs/stats';
                let displayData = [];
                
                if (transformType === 'aggregate') {
                    endpoint += '?groupBy=source';
                    const response = await fetch(endpoint, { credentials: 'same-origin' });
                    const data = await response.json();
                    if (data.success && data.bySource) {
                        displayData = Object.entries(data.bySource).map(([key, val]) => ({ label: key, count: val }));
                    }
                } else if (transformType === 'pivot') {
                    endpoint += '?groupBy=level';
                    const response = await fetch(endpoint, { credentials: 'same-origin' });
                    const data = await response.json();
                    if (data.success && data.byLevel) {
                        displayData = Object.entries(data.byLevel).map(([key, val]) => ({ label: key, count: val }));
                    }
                } else if (transformType === 'filter') {
                    endpoint = '/api/logs?level=error&limit=10';
                    const response = await fetch(endpoint, { credentials: 'same-origin' });
                    const data = await response.json();
                    if (data.results) {
                        displayData = data.results.map(r => ({ label: (r.message || 'Error').substring(0, 40) + '...', count: 1 }));
                    }
                } else if (transformType === 'group') {
                    endpoint += '?groupBy=hour';
                    const response = await fetch(endpoint, { credentials: 'same-origin' });
                    const data = await response.json();
                    if (data.success && data.labels && data.values) {
                        displayData = data.labels.map((label, i) => ({ label, count: data.values[i] }));
                    }
                }
                
                if (displayData.length === 0) {
                    resultDiv.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No data to transform<br><small>Try adding some logs first</small></p>';
                } else {
                    resultDiv.innerHTML = '<table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">' + 
                        '<thead><tr style="background: var(--bg-secondary); font-weight: 600;"><th style="padding: 0.5rem; text-align: left;">Category</th><th style="padding: 0.5rem; text-align: right;">Count</th></tr></thead><tbody>' +
                        displayData.slice(0, 10).map(r => 
                            '<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 0.5rem;">' + 
                            r.label + 
                            '</td><td style="padding: 0.5rem; text-align: right; font-weight: 600; color: var(--accent-primary);">' + 
                            r.count + 
                            '</td></tr>'
                        ).join('') + '</tbody></table>';
                }
            } catch (error) {
                console.error('Data transform error:', error);
                resultDiv.innerHTML = '<p style="color: var(--error-color); padding: 1rem; text-align: center;"><i class="fas fa-exclamation-triangle"></i> Error: ' + error.message + '</p>';
            }
        }
        
        // Expose second script block functions globally
        window.initializeWidgetData = initializeWidgetData;
        window.initializeWidget = initializeWidgetData; // Alias for marketplace compatibility
        window.testWebhookFromWidget = testWebhookFromWidget;
        window.executeCustomQuery = executeCustomQuery;
        window.calculateMetricFormula = calculateMetricFormula;
        window.applyDataTransform = applyDataTransform;
        window.applyBookmarkQuery = applyBookmarkQuery;
        window.performQuickSearch = performQuickSearch;
        window.performLogExport = performLogExport;
        window.applyFilterPreset = applyFilterPreset;
        window.saveBookmark = saveBookmark;
        window.calculateStats = calculateStats;
        window.bulkAction = bulkAction;
        window.saveQuickNote = saveQuickNote;
        window.refreshQuickNotes = refreshQuickNotes;
        console.log('✅ Second script block functions exposed globally');
        
        // Initialize geolocation widget (handle both immediate and deferred loading)
        function initGeoWidget() {
            const geoChart = document.getElementById('chart-geolocation-map');
            if (geoChart && typeof initializeWidgetData === 'function') {
                console.log('Initializing geolocation widget');
                initializeWidgetData('geolocation-map');
            }
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGeoWidget);
        } else {
            // DOM already loaded, run immediately
            initGeoWidget();
        }
        
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
        console.error('Dashboard route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
