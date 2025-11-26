/**
 * Timeline Widget
 * Displays hourly log activity in a stacked area chart over 24 hours
 */

const BaseWidget = require('./base-widget');

class TimelineWidget extends BaseWidget {
    constructor() {
        super({
            id: 'timeline',
            title: 'Log Activity Timeline (24h)',
            icon: 'fas fa-chart-line',
            category: 'analytics',
            size: 'wide',
            refreshInterval: 60000 // 1 minute
        });
    }

    getDescription() {
        return 'Hourly log activity visualization over the last 24 hours, stacked by level';
    }

    async fetchData(dal) {
        try {
            const hourlyStats = await dal.all(`
                SELECT 
                    strftime('%H:00', timestamp) as hour,
                    COUNT(*) as count,
                    level
                FROM logs 
                WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
                GROUP BY hour, level
                ORDER BY hour
            `) || [];

            return { hourlyStats };
        } catch (error) {
            console.error('Error fetching timeline data:', error);
            return null;
        }
    }

    renderContent(data) {
        if (!data || !data.hourlyStats || data.hourlyStats.length === 0) {
            return this.renderEmptyState('No log activity in last 24 hours');
        }

        return `<div class="chart-container" id="chart-${this.id}" style="width:100%; height:300px;"></div>`;
    }

    getClientScript() {
        return `
            async function fetchTimelineData(widgetId) {
                try {
                    const response = await fetch('/api/logs/stats?groupBy=hour', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    const chart = document.getElementById('chart-' + widgetId);
                    if (!chart) {
                        console.error('[Chart] Canvas #chart-' + widgetId + ' not found');
                        return;
                    }
                    
                    if (!data.labels || !data.values || data.labels.length === 0) {
                        chart.parentElement.innerHTML = '<div class="empty-state">No data available</div>';
                        return;
                    }
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(chart);
                        ec.setOption({
                            title: { text: 'Hourly Activity', left: 'center', textStyle: { fontSize: 14 } },
                            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                            xAxis: { type: 'category', data: data.labels },
                            yAxis: { type: 'value' },
                            series: [{
                                name: 'Logs',
                                type: 'line',
                                data: data.values,
                                smooth: true,
                                areaStyle: { opacity: 0.3 },
                                lineStyle: { width: 2 },
                                color: '#60a5fa'
                            }]
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch timeline data:', error);
                }
            }
        `;
    }
}

module.exports = TimelineWidget;
