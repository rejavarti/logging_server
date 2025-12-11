/**
 * Integration Health Widget
 * Displays integration status as a bar chart
 */

const BaseWidget = require('./base-widget');

class IntegrationHealthWidget extends BaseWidget {
    constructor() {
        super({
            id: 'integrations',
            title: 'Integration Health',
            icon: 'fas fa-plug',
            category: 'monitoring',
            size: 'medium',
            refreshInterval: 30000 // 30 seconds
        });
    }

    getDescription() {
        return 'Real-time status of active integrations';
    }

    async fetchData(dal) {
        try {
            // Only fetch ENABLED integrations
            const integrations = await dal.all(`
                SELECT 
                    name,
                    type,
                    enabled,
                    last_triggered,
                    CASE 
                        WHEN enabled = true THEN 'active'
                        ELSE 'inactive'
                    END as status
                FROM integrations
                WHERE enabled = true
                ORDER BY name
            `) || [];

            return { integrations };
        } catch (error) {
            console.error('Error fetching integration data:', error);
            return null;
        }
    }

    renderContent(data) {
        if (!data || !data.integrations || data.integrations.length === 0) {
            return this.renderEmptyState('No active integrations');
        }

        return `<div class="chart-container" id="chart-${this.id}" style="width:100%; height:300px;"></div>`;
    }

    getClientScript() {
        return `
            async function fetchIntegrationsData(widgetId) {
                try {
                    // Fetch only enabled integrations
                    const response = await fetch('/api/integrations', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    const chart = document.getElementById('chart-' + widgetId);
                    if (!chart) {
                        console.error('[Chart] Canvas #chart-' + widgetId + ' not found');
                        return;
                    }
                    
                    // Filter to only show enabled/active integrations
                    let integrations = data.integrations || data.data?.integrations || data || [];
                    if (Array.isArray(integrations)) {
                        integrations = integrations.filter(i => i.enabled);
                    }
                    
                    if (!Array.isArray(integrations) || integrations.length === 0) {
                        chart.innerHTML = '<div class="empty-state"><i class="fas fa-plug empty-state-icon"></i><br>No active integrations</div>';
                        return;
                    }
                    
                    if (typeof echarts !== 'undefined') {
                        const ec = echarts.init(chart);
                        const names = integrations.map(i => i.name || 'Unknown');
                        const values = integrations.map(i => i.enabled ? 1 : 0);
                        
                        ec.setOption({
                            title: { text: 'Status', left: 'center', textStyle: { fontSize: 14 } },
                            tooltip: { trigger: 'axis' },
                            xAxis: { type: 'category', data: names },
                            yAxis: { type: 'value', max: 1 },
                            series: [{
                                name: 'Status',
                                type: 'bar',
                                data: values,
                                itemStyle: {
                                    color: function(params) {
                                        return params.value === 1 ? '#10b981' : '#ef4444';
                                    }
                                }
                            }]
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch integrations data:', error);
                }
            }
        `;
    }
}

module.exports = IntegrationHealthWidget;
