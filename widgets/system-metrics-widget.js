/**
 * System Metrics Gauge Widget
 * Displays CPU, Memory, and Disk usage gauges
 */

const BaseWidget = require('./base-widget');

class SystemMetricsWidget extends BaseWidget {
    constructor() {
        super({
            id: 'system-metrics',
            title: 'System Metrics',
            icon: 'fas fa-tachometer-alt',
            category: 'monitoring',
            size: 'large',
            refreshInterval: 10000 // 10 seconds
        });
    }

    getDescription() {
        return 'Real-time gauges showing CPU, memory, and disk usage';
    }

    async fetchData(dal) {
        try {
            const response = await fetch('http://localhost:10180/api/system/metrics');
            const metrics = await response.json();
            
            return {
                cpu: metrics.cpuUsage || 0,
                memory: metrics.memoryUsage || 0,
                disk: metrics.diskUsage || 0
            };
        } catch (error) {
            console.error('Error fetching system metrics:', error);
            return null;
        }
    }

    renderContent(data) {
        return `<div class="chart-container" id="chart-${this.id}" style="width:100%; height:350px;"></div>`;
    }

    getClientScript() {
        return `
            async function fetchSystemMetricsData(widgetId) {
                try {
                    const response = await fetch('/api/system/metrics', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    const chart = document.getElementById('chart-' + widgetId);
                    if (!chart) {
                        console.error('[Chart] Canvas #chart-' + widgetId + ' not found');
                        return;
                    }
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(chart);
                        ec.setOption({
                            title: { text: 'System Resources', left: 'center', textStyle: { fontSize: 14 } },
                            series: [
                                {
                                    name: 'CPU',
                                    type: 'gauge',
                                    center: ['25%', '55%'],
                                    radius: '60%',
                                    detail: { formatter: '{value}%', fontSize: 14 },
                                    data: [{ value: (data.cpuUsage || 0).toFixed(2), name: 'CPU' }],
                                    axisLine: { lineStyle: { width: 10, color: [[0.3, '#34d399'], [0.7, '#fbbf24'], [1, '#f87171']] } }
                                },
                                {
                                    name: 'Memory',
                                    type: 'gauge',
                                    center: ['50%', '55%'],
                                    radius: '60%',
                                    detail: { formatter: '{value} MB', fontSize: 14 },
                                    data: [{ value: (data.memoryUsage || 0).toFixed(2), name: 'Memory' }],
                                    axisLine: { lineStyle: { width: 10, color: [[0.3, '#34d399'], [0.7, '#fbbf24'], [1, '#f87171']] } }
                                },
                                {
                                    name: 'Disk',
                                    type: 'gauge',
                                    center: ['75%', '55%'],
                                    radius: '60%',
                                    detail: { formatter: '{value}%', fontSize: 14 },
                                    data: [{ value: (data.diskUsage || 0).toFixed(2), name: 'Disk' }],
                                    axisLine: { lineStyle: { width: 10, color: [[0.3, '#34d399'], [0.7, '#fbbf24'], [1, '#f87171']] } }
                                }
                            ]
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch system metrics:', error);
                }
            }
        `;
    }
}

module.exports = SystemMetricsWidget;
