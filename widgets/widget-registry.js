/**
 * Widget Registry
 * Central registry for all dashboard widgets
 * Provides discovery, instantiation, and metadata for widgets
 */

const SystemStatsWidget = require('./system-stats-widget');
const LogLevelsWidget = require('./log-levels-widget');
const SystemMetricsWidget = require('./system-metrics-widget');
const TimelineWidget = require('./timeline-widget');
const IntegrationHealthWidget = require('./integration-health-widget');
const GeolocationMapWidget = require('./geolocation-map-widget');

class WidgetRegistry {
    constructor() {
        this.widgets = new Map();
        this.registerDefaultWidgets();
    }

    /**
     * Register default widgets that ship with the system
     */
    registerDefaultWidgets() {
        this.register(new SystemStatsWidget());
        this.register(new LogLevelsWidget());
        this.register(new SystemMetricsWidget());
        this.register(new TimelineWidget());
        this.register(new GeolocationMapWidget());
        this.register(new IntegrationHealthWidget());
    }

    /**
     * Register a widget instance
     */
    register(widget) {
        if (!widget.id) {
            throw new Error('Widget must have an ID');
        }
        this.widgets.set(widget.id, widget);
    }

    /**
     * Get widget by ID
     */
    get(widgetId) {
        return this.widgets.get(widgetId);
    }

    /**
     * Check if widget exists
     */
    has(widgetId) {
        return this.widgets.has(widgetId);
    }

    /**
     * Get all registered widgets
     */
    getAll() {
        return Array.from(this.widgets.values());
    }

    /**
     * Get widgets by category
     */
    getByCategory(category) {
        return this.getAll().filter(w => w.category === category);
    }

    /**
     * Get widget metadata for marketplace
     */
    getMarketplaceCatalog() {
        return this.getAll().map(widget => widget.getMetadata());
    }

    /**
     * Render widget HTML
     */
    async renderWidget(widgetId, dal) {
        const widget = this.get(widgetId);
        if (!widget) {
            return `<div class="error">Widget "${widgetId}" not found</div>`;
        }

        try {
            const data = await widget.fetchData(dal);
            return widget.render(data);
        } catch (error) {
            console.error(`Error rendering widget ${widgetId}:`, error);
            return widget.renderError(error);
        }
    }

    /**
     * Get all client-side scripts for registered widgets
     */
    getAllClientScripts() {
        const scripts = [];
        for (const widget of this.widgets.values()) {
            const script = widget.getClientScript();
            if (script) {
                scripts.push(script);
            }
        }
        return scripts.join('\n\n');
    }

    /**
     * Get widget IDs grouped by category
     */
    getCategorizedWidgets() {
        const categorized = {};
        for (const widget of this.widgets.values()) {
            const category = widget.category || 'general';
            if (!categorized[category]) {
                categorized[category] = [];
            }
            categorized[category].push(widget.getMetadata());
        }
        return categorized;
    }
}

// Singleton instance
const widgetRegistry = new WidgetRegistry();

module.exports = widgetRegistry;
