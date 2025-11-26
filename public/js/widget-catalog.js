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
