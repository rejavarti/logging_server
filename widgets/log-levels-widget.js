/**
 * Log Levels Chart Widget
 * Displays distribution of log levels (info, warn, error, debug) in a pie chart
 */

const BaseWidget = require('./base-widget');

class LogLevelsWidget extends BaseWidget {
    constructor() {
        super({
            id: 'log-levels',
            title: 'Log Levels Distribution',
            icon: 'fas fa-chart-pie',
            category: 'analytics',
            size: 'medium',
            refreshInterval: 60000 // 1 minute
        });
    }

    getDescription() {
        return 'Pie chart showing distribution of log levels over last 24 hours';
    }

    async fetchData(dal) {
        try {
            const logLevelStats = await dal.all(`
                SELECT level, COUNT(*) as count 
                FROM logs 
                WHERE timestamp >= NOW() - INTERVAL '24 hours' 
                GROUP BY level 
                ORDER BY count DESC
            `) || [];

            return { levels: logLevelStats };
        } catch (error) {
            console.error('Error fetching log levels:', error);
            return null;
        }
    }

    renderContent(data) {
        if (!data || !data.levels || data.levels.length === 0) {
            return this.renderEmptyState('No log data available for last 24 hours');
        }

        return `<div class="chart-container" id="chart-${this.id}" style="width:100%; height:300px;"></div>`;
    }

    getClientScript() {
        return `
            async function fetchLogLevelsData(widgetId) {
                try {
                    const response = await fetch('/api/logs/stats?groupBy=level', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    const chart = document.getElementById('chart-' + widgetId);
                    if (!chart) {
                        console.error('[Chart] Canvas #chart-' + widgetId + ' not found');
                        return;
                    }
                    
                    const levels = data.byLevel || {};
                    const levelData = Object.entries(levels).map(([level, count]) => ({
                        name: level.toUpperCase(),
                        value: count
                    }));
                    
                    if (levelData.length === 0) {
                        chart.parentElement.innerHTML = '<div class="empty-state">No data available</div>';
                        return;
                    }
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(chart);
                        ec.setOption({
                            title: { text: 'Log Levels (24h)', left: 'center', textStyle: { fontSize: 14 } },
                            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                            legend: { bottom: 10, left: 'center' },
                            series: [{
                                type: 'pie',
                                radius: ['40%', '70%'],
                                avoidLabelOverlap: false,
                                label: { show: false },
                                emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
                                data: levelData,
                                color: ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa']
                            }]
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch log levels:', error);
                }
            }
        `;
    }
}

module.exports = LogLevelsWidget;
