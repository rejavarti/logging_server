// ============================================================================
// LOG CORRELATION ENGINE
// ============================================================================

class LogCorrelationEngine {
    constructor(database, loggers, config) {
        this.db = database;
        this.loggers = loggers || console;
        this.config = config || {};
        this.correlationRules = [];
        this.activeCorrelations = new Map();
    }

    async initialize() {

        
        this.loggers.system.info('🔗 Initializing Log Correlation Engine...');
        await this.loadCorrelationRules();
        this.loggers.system.info('✅ Log Correlation Engine initialized successfully');
        return true;
    }

    async loadCorrelationRules() {
        // Default correlation rules for common patterns
        this.correlationRules = [
            {
                id: 'auth_failures',
                name: 'Authentication Failure Pattern',
                pattern: 'authentication|login.*fail',
                timeWindow: 300, // 5 minutes
                threshold: 3,
                severity: 'high'
            },
            {
                id: 'error_burst',
                name: 'Error Message Burst',
                pattern: 'error|exception|fail',
                timeWindow: 60, // 1 minute
                threshold: 10,
                severity: 'medium'
            },
            {
                id: 'system_restart',
                name: 'System Restart Sequence',
                pattern: 'restart|reboot|shutdown',
                timeWindow: 120, // 2 minutes
                threshold: 1,
                severity: 'low'
            }
        ];
    }

    async correlateLogEvent(logEvent) {
        for (const rule of this.correlationRules) {
            if (this.matchesPattern(logEvent.message, rule.pattern)) {
                await this.processCorrelation(rule, logEvent);
            }
        }
    }

    matchesPattern(message, pattern) {
        const regex = new RegExp(pattern, 'i');
        return regex.test(message);
    }

    async processCorrelation(rule, logEvent) {
        const correlationKey = `${rule.id}_${Math.floor(Date.now() / (rule.timeWindow * 1000))}`;
        
        if (!this.activeCorrelations.has(correlationKey)) {
            this.activeCorrelations.set(correlationKey, {
                rule: rule,
                events: [],
                startTime: Date.now()
            });
        }

        const correlation = this.activeCorrelations.get(correlationKey);
        correlation.events.push(logEvent);

        // Check if threshold is met
        if (correlation.events.length >= rule.threshold) {
            await this.triggerCorrelationAlert(correlation);
            this.activeCorrelations.delete(correlationKey);
        }
    }

    async triggerCorrelationAlert(correlation) {

        const alertMessage = `Pattern detected: ${correlation.rule.name} - ${correlation.events.length} related events found`;
        
        // Log the correlation
        this.loggers.system.warn('Log correlation detected:', {
            rule: correlation.rule.name,
            eventCount: correlation.events.length,
            severity: correlation.rule.severity
        });

        // Store correlation in database
        try {
            await this.db.run(`
                INSERT INTO log_correlations (rule_id, rule_name, event_count, severity, detected_at, events_json)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                correlation.rule.id,
                correlation.rule.name,
                correlation.events.length,
                correlation.rule.severity,
                new Date().toISOString(),
                JSON.stringify(correlation.events.map(e => ({
                    timestamp: e.timestamp,
                    message: e.message,
                    source: e.source,
                    level: e.level
                })))
            ]);
        } catch (error) {
        this.loggers.system.error('Failed to store log correlation:', error);
        }

        return {
            type: 'correlation',
            rule: correlation.rule,
            eventCount: correlation.events.length,
            message: alertMessage
        };
    }

    getCorrelationStats() {
        return {
            activeCorrelations: this.activeCorrelations.size,
            rulesLoaded: this.correlationRules.length,
            status: 'active'
        };
    }
}

module.exports = LogCorrelationEngine;
