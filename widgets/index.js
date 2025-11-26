/**
 * Widget Module Exports
 * Central export point for all widget-related modules
 */

const { widgetRegistry } = require('./widget-registry');
const BaseWidget = require('./base-widget');
const SystemStatsWidget = require('./system-stats-widget');
const LogLevelsWidget = require('./log-levels-widget');
const SystemMetricsWidget = require('./system-metrics-widget');
const TimelineWidget = require('./timeline-widget');
const IntegrationHealthWidget = require('./integration-health-widget');
const GeolocationMapWidget = require('./geolocation-map-widget');

module.exports = {
    widgetRegistry,
    BaseWidget,
    SystemStatsWidget,
    LogLevelsWidget,
    SystemMetricsWidget,
    TimelineWidget,
    IntegrationHealthWidget,
    GeolocationMapWidget
};
