/**
 * System Stats Widget
 * Displays overview of system metrics: total logs, error rate, uptime, active sources
 */

const BaseWidget = require('./base-widget');

class SystemStatsWidget extends BaseWidget {
    constructor() {
        super({
            id: 'system-stats',
            title: 'System Overview',
            icon: 'fas fa-chart-bar',
            category: 'monitoring',
            size: 'full',
            refreshInterval: 30000 // 30 seconds
        });
    }

    getDescription() {
        return 'Real-time system overview showing total logs, error rate, uptime, and active sources';
    }

    async fetchData(dal) {
        try {
            const stats = await dal.getSystemStats() || {};
            const health = await dal.getSystemHealth() || {};
            
            return {
                totalLogs: stats.totalLogs || 0,
                errorRate: stats.errorRate || 0,
                uptime: health.uptime || 0,
                activeSources: stats.activeSources || 0
            };
        } catch (error) {
            console.error('Error fetching system stats:', error);
            return null;
        }
    }

    renderContent(data) {
        if (!data || !this.validateData(data)) {
            return this.renderEmptyState('No system data available');
        }

        return `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-database"></i></div>
                    <div class="stat-value" id="totalLogs">${(data.totalLogs || 0).toLocaleString()}</div>
                    <div class="stat-label">Total Logs</div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="stat-value" id="errorRate">${(data.errorRate || 0).toFixed(2)}%</div>
                    <div class="stat-label">Error Rate</div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-value" id="uptime">${this.formatUptime(data.uptime || 0)}</div>
                    <div class="stat-label">Uptime</div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-server"></i></div>
                    <div class="stat-value" id="activeSources">${(data.activeSources || 0).toLocaleString()}</div>
                    <div class="stat-label">Active Sources</div>
                </div>
            </div>
        `;
    }

    validateData(data) {
        return data && typeof data.totalLogs !== 'undefined';
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        
        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
        } else {
            return `${Math.floor(seconds / 60)}m`;
        }
    }

    getClientScript() {
        return `
            async function fetchSystemStats(widgetId) {
                try {
                    const response = await fetch('/api/system/metrics', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    document.getElementById('totalLogs').textContent = (data.totalLogs || 0).toLocaleString();
                    document.getElementById('errorRate').textContent = (data.errorRate || 0).toFixed(2) + '%';
                    document.getElementById('uptime').textContent = formatUptime(data.uptime || 0);
                    document.getElementById('activeSources').textContent = (data.activeSources || 0).toLocaleString();
                } catch (error) {
                    console.error('Failed to fetch system stats:', error);
                }
            }
            
            function formatUptime(seconds) {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                if (days > 0) return days + 'd ' + hours + 'h';
                if (hours > 0) return hours + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
                return Math.floor(seconds / 60) + 'm';
            }
        `;
    }
}

module.exports = SystemStatsWidget;
