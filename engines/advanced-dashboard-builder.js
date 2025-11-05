// engines/advanced-dashboard-builder.js - Advanced Drag & Drop Dashboard Builder
const crypto = require('crypto');

/**
 * Advanced Dashboard Builder Engine
 * Provides drag & drop dashboard creation with customizable widgets
 */
class AdvancedDashboardBuilder {
    constructor(dal, loggers, config) {
        this.dal = dal;
        this.loggers = loggers;
        this.config = config || {};
        this.dashboards = new Map();
        this.widgets = new Map();
        this.layouts = new Map();
        this.templates = new Map();
        this.userPreferences = new Map();
        this.widgetTypes = [
            'log_timeline',
            'metrics_chart', 
            'alert_summary',
            'system_status',
            'log_levels_pie',
            'source_breakdown',
            'error_trending',
            'performance_gauge',
            'geo_map',
            'correlation_matrix',
            'real_time_feed',
            'custom_query'
        ];
    }

    async initialize() {
        try {
            this.loggers.system.info('📊 Initializing Advanced Dashboard Builder...');
            
            // Initialize database tables for dashboards
            await this.initializeDashboardTables();
            
            // Load existing dashboards and widgets
            await this.loadDashboards();
            await this.loadWidgets();
            
            // Initialize default templates
            await this.initializeDefaultTemplates();
            
            this.loggers.system.info('✅ Advanced Dashboard Builder initialized');
            this.loggers.system.info('   • Widget Types: 12 available');
            this.loggers.system.info('   • Drag & Drop: Enabled');
            this.loggers.system.info('   • Real-time Updates: Active');
            this.loggers.system.info('   • Custom Layouts: Supported');
            
        } catch (error) {
            this.loggers.system.error('❌ Dashboard Builder initialization failed:', error);
            throw error;
        }
    }

    async initializeDashboardTables() {
        try {
            // Tables already exist from database migration, just verify
            const tables = ['dashboards', 'dashboard_widgets', 'widget_templates'];
            
            for (const table of tables) {
                const exists = await this.dal.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);
                if (!exists) {
                    this.loggers.system.warn(`Table ${table} does not exist, it should be created by database migration`);
                }
            }
            
            this.loggers.system.info('✅ Dashboard database tables verified');
        } catch (error) {
            this.loggers.system.error('Failed to verify dashboard tables:', error);
            throw error;
        }
    }

    async loadDashboards() {
        try {
            const dashboards = await this.dal.all('SELECT * FROM dashboards ORDER BY created_at DESC');

            if (dashboards && Array.isArray(dashboards)) {
                for (const dashboard of dashboards) {
                    this.dashboards.set(dashboard.id, {
                        ...dashboard,
                        layoutConfig: dashboard.configuration ? JSON.parse(dashboard.configuration) : {},
                        tags: dashboard.name ? dashboard.name.split(',') : []
                    });
                }
                this.loggers.system.info(`📊 Loaded ${dashboards.length} dashboard(s)`);
            } else {
                this.loggers.system.info(`📊 No dashboards found`);
            }
        } catch (error) {
            this.loggers.system.error('Failed to load dashboards:', error);
        }
    }

    async loadWidgets() {
        try {
            // Handle case where dashboard_id column might not exist yet during migration
            let widgets;
            try {
                widgets = await this.dal.all('SELECT * FROM dashboard_widgets ORDER BY dashboard_id');
            } catch (error) {
                if (error.message.includes('no such column: dashboard_id')) {
                    this.loggers.system.warn('Database migration in progress, skipping widget loading');
                    return; // Skip widget loading during migration
                }
                throw error;
            }

            if (widgets && Array.isArray(widgets)) {
                for (const widget of widgets) {
                    if (!this.widgets.has(widget.dashboard_id)) {
                        this.widgets.set(widget.dashboard_id, []);
                    }
                    
                    this.widgets.get(widget.dashboard_id).push({
                        ...widget,
                        config: widget.configuration ? JSON.parse(widget.configuration) : {}
                    });
                }
                this.loggers.system.info(`🎛️ Loaded ${widgets.length} widget(s)`);
            } else {
                this.loggers.system.info(`🎛️ No widgets found`);
            }
        } catch (error) {
            if (!error.message.includes('no such column: dashboard_id')) {
                this.loggers.system.error('Failed to load widgets:', error);
            }
        }
    }

    async initializeDefaultTemplates() {
        const defaultTemplates = [
            {
                id: 'log_timeline_basic',
                name: 'Basic Log Timeline',
                description: 'Simple timeline view of log entries',
                type: 'log_timeline',
                template: JSON.stringify({
                    timeRange: '1h',
                    maxEntries: 100,
                    showLevels: true,
                    colorCoding: true
                })
            },
            {
                id: 'metrics_realtime_chart',
                name: 'Real-time Metrics Chart',
                description: 'Live updating metrics visualization',
                type: 'metrics_chart',
                template: JSON.stringify({
                    refreshInterval: 5,
                    chartType: 'line',
                    showLegend: true,
                    dataPoints: 50
                })
            },
            {
                id: 'alert_summary_widget',
                name: 'Alert Summary',
                description: 'Overview of recent alerts and their status',
                type: 'alert_summary',
                template: JSON.stringify({
                    showResolved: false,
                    maxAlerts: 10,
                    groupBySeverity: true
                })
            },
            {
                id: 'system_health_gauge',
                name: 'System Health Gauge',
                description: 'System health visualization with gauges',
                type: 'system_status',
                template: JSON.stringify({
                    showCPU: true,
                    showMemory: true,
                    showDisk: true,
                    thresholds: { warning: 70, critical: 90 }
                })
            }
        ];

        try {
            for (const template of defaultTemplates) {
                const existing = await this.dal.get('SELECT id FROM widget_templates WHERE id = ?', [template.id]);
                
                if (!existing) {
                    await this.dal.run(
                        'INSERT INTO widget_templates (id, name, description, widget_type, default_config, category, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [template.id, template.name, template.description, template.type, template.template, 'system', 1]
                    );
                }
            }
            
            this.loggers.system.info(`📋 Initialized ${defaultTemplates.length} default widget templates`);
        } catch (error) {
            this.loggers.system.error('Failed to initialize default templates:', error);
        }
    }

    // ============================================================================
    // DASHBOARD MANAGEMENT METHODS
    // ============================================================================

    async createDashboard(dashboardData, userId) {
        try {
            const dashboardId = crypto.randomUUID();
            const now = new Date().toISOString();
            
            const result = await this.dal.run(`
                INSERT INTO dashboards 
                (id, name, description, configuration, user_id, is_public, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                dashboardId,
                dashboardData.name,
                dashboardData.description || '',
                JSON.stringify(dashboardData.layoutConfig || {}),
                userId,
                dashboardData.isPublic ? 1 : 0,
                now,
                now
            ]);

            const dashboard = {
                id: dashboardId,
                ...dashboardData,
                created_at: now,
                updated_at: now
            };

            this.dashboards.set(dashboardId, dashboard);
            
            this.loggers.system.info(`✅ Created dashboard: ${dashboardData.name} (${dashboardId})`);
            return { success: true, id: dashboardId, dashboard };
            
        } catch (error) {
            this.loggers.system.error('Failed to create dashboard:', error);
            return { success: false, error: error.message };
        }
    }

    async updateDashboard(dashboardId, updates, userId) {
        try {
            const now = new Date().toISOString();
            
            await this.dal.run(`
                UPDATE dashboards 
                SET name = ?, description = ?, configuration = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            `, [
                updates.name,
                updates.description || '',
                JSON.stringify(updates.layoutConfig || {}),
                now,
                dashboardId,
                userId
            ]);

            // Update local cache
            if (this.dashboards.has(dashboardId)) {
                const dashboard = this.dashboards.get(dashboardId);
                Object.assign(dashboard, updates, { updated_at: now });
            }

            this.loggers.system.info(`✅ Updated dashboard: ${dashboardId}`);
            return { success: true };
            
        } catch (error) {
            this.loggers.system.error('Failed to update dashboard:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteDashboard(dashboardId, userId) {
        try {
            // Delete widgets first
            await this.dal.run('DELETE FROM dashboard_widgets WHERE dashboard_id = ?', [dashboardId]);
            
            // Delete dashboard
            await this.dal.run('DELETE FROM dashboards WHERE id = ? AND user_id = ?', [dashboardId, userId]);

            // Update local cache
            this.dashboards.delete(dashboardId);
            this.widgets.delete(dashboardId);

            this.loggers.system.info(`✅ Deleted dashboard: ${dashboardId}`);
            return { success: true };
            
        } catch (error) {
            this.loggers.system.error('Failed to delete dashboard:', error);
            return { success: false, error: error.message };
        }
    }

    async getDashboard(dashboardId) {
        try {
            const dashboard = await this.dal.get('SELECT * FROM dashboards WHERE id = ?', [dashboardId]);
            
            if (!dashboard) {
                return { success: false, error: 'Dashboard not found' };
            }

            const widgets = await this.dal.all('SELECT * FROM dashboard_widgets WHERE dashboard_id = ?', [dashboardId]);

            return {
                success: true,
                dashboard: {
                    ...dashboard,
                    configuration: dashboard.configuration ? JSON.parse(dashboard.configuration) : {},
                    widgets: widgets.map(w => ({
                        ...w,
                        configuration: w.configuration ? JSON.parse(w.configuration) : {}
                    }))
                }
            };
            
        } catch (error) {
            this.loggers.system.error('Failed to get dashboard:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserDashboards(userId) {
        try {
            const dashboards = await this.dal.all(
                'SELECT * FROM dashboards WHERE user_id = ? OR is_public = 1 ORDER BY created_at DESC', 
                [userId]
            );

            return { success: true, dashboards };
            
        } catch (error) {
            this.loggers.system.error('Failed to get user dashboards:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================================================
    // WIDGET MANAGEMENT METHODS
    // ============================================================================

    async createWidget(dashboardId, widgetData, userId) {
        try {
            const widgetId = crypto.randomUUID();
            const now = new Date().toISOString();

            await this.dal.run(`
                INSERT INTO dashboard_widgets 
                (id, dashboard_id, name, type, configuration, position, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                widgetId,
                dashboardId,
                widgetData.name || widgetData.type,
                widgetData.type,
                JSON.stringify(widgetData.configuration || {}),
                JSON.stringify(widgetData.position || {}),
                now,
                now
            ]);

            this.loggers.system.info(`✅ Created widget: ${widgetData.type} in dashboard ${dashboardId}`);
            return { success: true, id: widgetId };
            
        } catch (error) {
            this.loggers.system.error('Failed to create widget:', error);
            return { success: false, error: error.message };
        }
    }

    async updateWidget(widgetId, updates) {
        try {
            const now = new Date().toISOString();

            await this.dal.run(`
                UPDATE dashboard_widgets 
                SET name = ?, configuration = ?, position = ?, updated_at = ?
                WHERE id = ?
            `, [
                updates.name,
                JSON.stringify(updates.configuration || {}),
                JSON.stringify(updates.position || {}),
                now,
                widgetId
            ]);

            return { success: true };
            
        } catch (error) {
            this.loggers.system.error('Failed to update widget:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteWidget(widgetId) {
        try {
            await this.dal.run('DELETE FROM dashboard_widgets WHERE id = ?', [widgetId]);
            return { success: true };
            
        } catch (error) {
            this.loggers.system.error('Failed to delete widget:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================================================
    // TEMPLATE MANAGEMENT METHODS
    // ============================================================================

    async getWidgetTypes() {
        try {
            const templates = await this.dal.all('SELECT * FROM widget_templates ORDER BY name');
            
            const types = this.widgetTypes.map(type => {
                const template = templates.find(t => t.type === type);
                return {
                    type,
                    name: template ? template.name : type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    description: template ? template.description : `${type} widget`,
                    category: this.getWidgetCategory(type),
                    icon: this.getWidgetIcon(type),
                    template: template ? template.template : '{}'
                };
            });

            return { success: true, types };
            
        } catch (error) {
            this.loggers.system.error('Failed to get widget types:', error);
            return { success: false, error: error.message };
        }
    }

    getWidgetCategory(type) {
        const categories = {
            'log_timeline': 'logging',
            'metrics_chart': 'metrics', 
            'alert_summary': 'alerting',
            'system_status': 'system',
            'log_levels_pie': 'logging',
            'source_breakdown': 'logging',
            'error_trending': 'analytics',
            'performance_gauge': 'metrics',
            'geo_map': 'analytics',
            'correlation_matrix': 'analytics',
            'real_time_feed': 'real-time',
            'custom_query': 'custom'
        };
        
        return categories[type] || 'general';
    }

    getWidgetIcon(type) {
        const icons = {
            'log_timeline': 'chart-line',
            'metrics_chart': 'chart-bar', 
            'alert_summary': 'exclamation-triangle',
            'system_status': 'server',
            'log_levels_pie': 'chart-pie',
            'source_breakdown': 'sitemap',
            'error_trending': 'chart-area',
            'performance_gauge': 'tachometer-alt',
            'geo_map': 'globe',
            'correlation_matrix': 'project-diagram',
            'real_time_feed': 'stream',
            'custom_query': 'search'
        };
        
        return icons[type] || 'puzzle-piece';
    }
}

module.exports = AdvancedDashboardBuilder;