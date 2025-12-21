// ============================================================================
// AI-POWERED ANOMALY DETECTION ENGINE
// ============================================================================

const cron = require('node-cron');

class AnomalyDetectionEngine {
    constructor(database, loggers, config) {
        this.db = database;
        this.loggers = loggers || console;
        this.config = config || {};
        this.models = new Map();
        this.trainingData = [];
        this.anomalyThresholds = new Map();
        this.detectionRules = new Map();
        this.recentAnomalies = [];
        this.patternCache = new Map();
        this.isTraining = false;
        this.lastTrainingTime = null;
        this.statistics = {
            totalAnalyzed: 0,
            anomaliesDetected: 0,
            falsePositives: 0,
            modelAccuracy: 0,
            trainingIterations: 0
        };
    }

    async initialize() {
        try {

            
            // Create anomaly detection schema
            await this.createAnomalySchema();
            
            // Create correlation schema
            await this.createCorrelationSchema();
            
            // Load existing models and rules
            await this.loadDetectionRules();
            await this.loadAnomalyThresholds();
            
            // Initialize default detection rules
            await this.createDefaultDetectionRules();
            
            // Schedule training and analysis tasks
            this.scheduleAnalysisTasks();
            
            this.loggers.system.info('AI-Powered Anomaly Detection Engine initialized successfully');
            return true;
        } catch (error) {
            this.loggers.system.error('Failed to initialize Anomaly Detection Engine:', error);
            return false;
        }
    }

    async createAnomalySchema() {
        // Skip table creation for PostgreSQL - schema is created by postgres-schema.sql
        if (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
            this.loggers.system.info('✅ Anomaly detection schema exists (PostgreSQL)');
            return;
        }

        const queries = [
            `CREATE TABLE IF NOT EXISTS anomaly_detections (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                log_id INTEGER,
                anomaly_type TEXT NOT NULL,
                severity TEXT DEFAULT 'medium',
                confidence_score REAL DEFAULT 0,
                description TEXT,
                pattern_data TEXT,
                context_data TEXT,
                resolved BOOLEAN DEFAULT false,
                resolved_at TIMESTAMPTZ,
                resolved_by INTEGER,
                false_positive BOOLEAN DEFAULT false,
                feedback_provided BOOLEAN DEFAULT false,
                FOREIGN KEY (log_id) REFERENCES logs (id),
                FOREIGN KEY (resolved_by) REFERENCES users (id)
            )`,
            `CREATE TABLE IF NOT EXISTS anomaly_rules (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                rule_type TEXT NOT NULL,
                parameters TEXT NOT NULL,
                enabled BOOLEAN DEFAULT true,
                confidence_threshold REAL DEFAULT 0.7,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                usage_count INTEGER DEFAULT 0,
                accuracy_rating REAL DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS anomaly_patterns (
                id SERIAL PRIMARY KEY,
                pattern_type TEXT NOT NULL,
                pattern_signature TEXT NOT NULL,
                frequency_normal REAL DEFAULT 0,
                frequency_threshold REAL DEFAULT 0,
                first_seen TIMESTAMPTZ DEFAULT NOW(),
                last_seen TIMESTAMPTZ DEFAULT NOW(),
                occurrence_count INTEGER DEFAULT 1,
                is_baseline BOOLEAN DEFAULT false
            )`,
            `CREATE TABLE IF NOT EXISTS anomaly_training_data (
                id SERIAL PRIMARY KEY,
                feature_vector TEXT NOT NULL,
                label TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                source_type TEXT DEFAULT 'automatic'
            )`,
            `CREATE TABLE IF NOT EXISTS anomaly_models (
                id SERIAL PRIMARY KEY,
                model_name TEXT UNIQUE NOT NULL,
                model_type TEXT NOT NULL,
                model_data TEXT NOT NULL,
                training_date TIMESTAMPTZ DEFAULT NOW(),
                accuracy_score REAL DEFAULT 0,
                validation_score REAL DEFAULT 0,
                parameters TEXT,
                is_active BOOLEAN DEFAULT true
            )`
        ];

        for (const query of queries) {
            await this.db.run(query);
        }
    }

    async createCorrelationSchema() {
        // Skip table creation for PostgreSQL - schema is created by postgres-schema.sql
        if (process.env.DB_TYPE === 'postgres' || process.env.DB_TYPE === 'postgresql') {
            this.loggers.system.info('✅ Correlation schema exists (PostgreSQL)');
            return;
        }

        const queries = [
            `CREATE TABLE IF NOT EXISTS log_correlations (
                id SERIAL PRIMARY KEY,
                rule_id TEXT NOT NULL,
                rule_name TEXT NOT NULL,
                pattern_type TEXT NOT NULL,
                severity TEXT DEFAULT 'medium',
                event_count INTEGER DEFAULT 0,
                time_window INTEGER DEFAULT 300,
                confidence_score REAL DEFAULT 0,
                threshold_value REAL DEFAULT 0,
                detected_at TIMESTAMPTZ DEFAULT NOW(),
                first_event_time TIMESTAMPTZ,
                last_event_time TIMESTAMPTZ,
                events_json TEXT,
                alert_triggered BOOLEAN DEFAULT false,
                alert_sent_at TIMESTAMPTZ,
                resolved BOOLEAN DEFAULT false,
                resolved_at TIMESTAMPTZ,
                resolved_by TEXT,
                notes TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS correlation_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                pattern_type TEXT NOT NULL,
                conditions TEXT NOT NULL,
                time_window INTEGER DEFAULT 300,
                threshold INTEGER DEFAULT 5,
                severity TEXT DEFAULT 'medium',
                enabled BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                last_triggered TIMESTAMPTZ,
                trigger_count INTEGER DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS correlation_events (
                id SERIAL PRIMARY KEY,
                correlation_id INTEGER NOT NULL,
                log_id INTEGER NOT NULL,
                event_timestamp TIMESTAMPTZ NOT NULL,
                event_data TEXT,
                matched_pattern TEXT,
                FOREIGN KEY (correlation_id) REFERENCES log_correlations (id),
                FOREIGN KEY (log_id) REFERENCES logs (id)
            )`
        ];

        for (const query of queries) {
            await this.db.run(query);
        }
    }

    async loadDetectionRules() {
        try {

            
            const rules = await this.db.all(`
                SELECT * FROM anomaly_rules 
                WHERE enabled = true 
                ORDER BY name
            `);

            this.detectionRules.clear();
            for (const rule of rules) {
                let config = {};
                try {
                    // Use rule_config instead of parameters and handle null/undefined
                    config = rule.rule_config ? JSON.parse(rule.rule_config) : {};
                } catch (parseError) {
                    this.loggers.system.warn(`Invalid JSON in rule config for rule ${rule.id}:`, parseError.message);
                    config = {};
                }
                
                this.detectionRules.set(rule.id, {
                    ...rule,
                    parameters: config
                });
            }

            this.loggers.system.info(`Loaded ${rules.length} anomaly detection rules`);
        } catch (error) {

            this.loggers.system.error('Failed to load detection rules:', error);
        }
    }

    async loadAnomalyThresholds() {
        try {

            
            const patterns = await this.db.all(`
                SELECT * FROM anomaly_patterns 
                WHERE is_baseline = true
            `);

            this.anomalyThresholds.clear();
            for (const pattern of patterns) {
                this.anomalyThresholds.set(pattern.pattern_signature, pattern);
            }

            this.loggers.system.info(`Loaded ${patterns.length} baseline patterns`);
        } catch (error) {

            this.loggers.system.error('Failed to load anomaly thresholds:', error);
        }
    }

    async createDefaultDetectionRules() {
        try {

            
            const existingRules = await this.db.get('SELECT COUNT(*) as count FROM anomaly_rules');
            if (existingRules.count > 0) return;

            const defaultRules = [
                {
                    name: 'High Error Rate Spike',
                    description: 'Detects sudden spikes in error log frequency',
                    rule_type: 'frequency_spike',
                    parameters: {
                        log_level: 'error',
                        time_window: 300, // 5 minutes
                        spike_threshold: 3.0, // 3x normal rate
                        minimum_count: 5
                    },
                    confidence_threshold: 0.8
                },
                {
                    name: 'Unusual Source Pattern',
                    description: 'Detects logs from unusual or new sources',
                    rule_type: 'source_anomaly',
                    parameters: {
                        min_confidence: 0.7,
                        learning_period_days: 7,
                        new_source_threshold: 0.9
                    },
                    confidence_threshold: 0.7
                },
                {
                    name: 'Message Content Anomaly',
                    description: 'Detects unusual patterns in log message content',
                    rule_type: 'content_anomaly',
                    parameters: {
                        similarity_threshold: 0.3,
                        min_message_length: 10,
                        pattern_window: 1000 // messages
                    },
                    confidence_threshold: 0.75
                },
                {
                    name: 'Time Series Anomaly',
                    description: 'Detects anomalies in log timing patterns',
                    rule_type: 'temporal_anomaly',
                    parameters: {
                        time_buckets: 24, // hourly buckets
                        deviation_threshold: 2.0, // 2 standard deviations
                        min_history_days: 3
                    },
                    confidence_threshold: 0.8
                },
                {
                    name: 'Security Event Clustering',
                    description: 'Detects potential security incidents through event clustering',
                    rule_type: 'security_cluster',
                    parameters: {
                        cluster_window: 600, // 10 minutes
                        security_keywords: ['failed', 'unauthorized', 'denied', 'blocked', 'attack'],
                        cluster_threshold: 5,
                        confidence_boost: 1.2
                    },
                    confidence_threshold: 0.85
                }
            ];

            for (const rule of defaultRules) {
                await this.db.run(`
                    INSERT INTO anomaly_rules (
                        name, description, rule_type, parameters, confidence_threshold
                    ) VALUES (?, ?, ?, ?, ?)
                `, [
                    rule.name,
                    rule.description,
                    rule.rule_type || 'statistical',
                    JSON.stringify(rule.parameters || {}),
                    rule.confidence_threshold || 0.8
                ]);
            }

            await this.loadDetectionRules();
            this.loggers.system.info('Created default anomaly detection rules');
        } catch (error) {

            this.loggers.system.error('Failed to create default detection rules:', error);
        }
    }

    async analyzeLogEvent(logEvent) {
        try {
            this.statistics.totalAnalyzed++;

            // Extract features from log event
            const features = this.extractFeatures(logEvent);
            
            // Run through all detection rules
            const anomalies = [];
            for (const [ruleId, rule] of this.detectionRules) {
                const result = await this.evaluateRule(rule, logEvent, features);
                if (result.isAnomaly) {
                    anomalies.push({
                        ruleId,
                        rule,
                        ...result
                    });
                }
            }

            // Process detected anomalies
            for (const anomaly of anomalies) {
                await this.processAnomaly(logEvent, anomaly);
            }

            return {
                analyzed: true,
                anomaliesFound: anomalies.length,
                anomalies: anomalies.map(a => ({
                    type: a.rule.rule_type,
                    confidence: a.confidence,
                    description: a.description
                }))
            };

        } catch (error) {

            this.loggers.system.error('Error analyzing log event:', error);
            return { analyzed: false, error: error.message };
        }
    }

    extractFeatures(logEvent) {
        const features = {};

        // Basic features
        features.timestamp = new Date(logEvent.timestamp).getTime();
        features.hour = new Date(logEvent.timestamp).getHours();
        features.dayOfWeek = new Date(logEvent.timestamp).getDay();
        features.severity = this.encodeSeverity(logEvent.severity || logEvent.level);
        features.sourceHash = this.hashString(logEvent.source || 'unknown');
        features.messageLength = (logEvent.message || '').length;

        // Text features
        const message = logEvent.message || '';
        features.hasNumbers = /\d/.test(message);
        features.hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(message);
        features.wordCount = message.split(/\s+/).length;
        features.upperCaseRatio = (message.match(/[A-Z]/g) || []).length / message.length;

        // Pattern features
        features.containsIP = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(message);
        features.containsURL = /(https?:\/\/[^\s]+)/.test(message);
        features.containsEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(message);

        // Security-related features
        const securityKeywords = ['error', 'failed', 'denied', 'unauthorized', 'blocked', 'attack', 'malware', 'virus'];
        features.securityScore = securityKeywords.reduce((score, keyword) => {
            return score + (message.toLowerCase().includes(keyword) ? 1 : 0);
        }, 0) / securityKeywords.length;

        return features;
    }

    encodeSeverity(severity) {
        const severityMap = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'warning': 2,
            'error': 3,
            'critical': 4,
            'fatal': 5
        };
        return severityMap[severity?.toLowerCase()] || 1;
    }

    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash) % 10000; // Normalize to 0-9999
    }

    async evaluateRule(rule, logEvent, features) {
        try {
            switch (rule.rule_type) {
                case 'frequency_spike':
                    return await this.evaluateFrequencySpike(rule, logEvent, features);
                case 'source_anomaly':
                    return await this.evaluateSourceAnomaly(rule, logEvent, features);
                case 'content_anomaly':
                    return await this.evaluateContentAnomaly(rule, logEvent, features);
                case 'temporal_anomaly':
                    return await this.evaluateTemporalAnomaly(rule, logEvent, features);
                case 'security_cluster':
                    return await this.evaluateSecurityCluster(rule, logEvent, features);
                default:
                    return { isAnomaly: false, confidence: 0, description: 'Unknown rule type' };
            }
        } catch (error) {

            this.loggers.system.error(`Error evaluating rule ${rule.name}:`, error);
            return { isAnomaly: false, confidence: 0, description: 'Evaluation error' };
        }
    }

    async evaluateFrequencySpike(rule, logEvent, features) {
        const params = rule.parameters;
        const targetLevel = logEvent.severity || logEvent.level;
        
        if (targetLevel !== params.log_level) {
            return { isAnomaly: false, confidence: 0 };
        }

        // Get recent count within time window
        const cutoffTime = new Date(Date.now() - params.time_window * 1000);
        const recentCount = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM logs 
            WHERE timestamp > ? AND (severity = ? OR level = ?)
        `, [cutoffTime.toISOString(), params.log_level, params.log_level]);

        if (recentCount.count < params.minimum_count) {
            return { isAnomaly: false, confidence: 0 };
        }

        // Get historical average for same time period
        const historicalAvg = await this.getHistoricalAverage(params.log_level, params.time_window);
        
        const spikeRatio = recentCount.count / Math.max(historicalAvg, 1);
        
        if (spikeRatio >= params.spike_threshold) {
            const confidence = Math.min(0.9, 0.5 + (spikeRatio - params.spike_threshold) * 0.1);
            return {
                isAnomaly: true,
                confidence,
                description: `${params.log_level} frequency spike: ${recentCount.count} events (${spikeRatio.toFixed(1)}x normal)`
            };
        }

        return { isAnomaly: false, confidence: 0 };
    }

    async evaluateSourceAnomaly(rule, logEvent, features) {
        const params = rule.parameters;
        const source = logEvent.source || 'unknown';
        
        // Check if source is in baseline patterns
        const sourcePattern = await this.db.get(`
            SELECT * FROM anomaly_patterns 
            WHERE pattern_type = 'source' AND pattern_signature = ?
        `, [source]);

        if (!sourcePattern) {
            // New source detected
            const confidence = params.new_source_threshold || 0.8;
            
            // Store new pattern
            await this.db.run(`
                INSERT INTO anomaly_patterns (
                    pattern_type, pattern_signature, frequency_normal
                ) VALUES (?, ?, ?)
            `, ['source', source, 1]);

            return {
                isAnomaly: true,
                confidence,
                description: `New log source detected: ${source}`
            };
        }

        // Check if source frequency is unusual
        const recentActivity = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM logs 
            WHERE source = ? AND timestamp > NOW() - INTERVAL '1 hour'
        `, [source]);

        const expectedFrequency = sourcePattern.frequency_normal;
        const actualFrequency = recentActivity.count;
        
        if (expectedFrequency > 0) {
            const deviationRatio = Math.abs(actualFrequency - expectedFrequency) / expectedFrequency;
            
            if (deviationRatio > 2.0) { // Significant deviation
                const confidence = Math.min(0.9, params.min_confidence + deviationRatio * 0.1);
                return {
                    isAnomaly: true,
                    confidence,
                    description: `Unusual activity from source ${source}: ${actualFrequency} vs expected ${expectedFrequency}`
                };
            }
        }

        return { isAnomaly: false, confidence: 0 };
    }

    async evaluateContentAnomaly(rule, logEvent, features) {
        const params = rule.parameters;
        const message = logEvent.message || '';
        
        if (message.length < params.min_message_length) {
            return { isAnomaly: false, confidence: 0 };
        }

        // Get recent similar messages for comparison
        const recentMessages = await this.db.all(`
            SELECT message FROM logs 
            WHERE timestamp > NOW() - INTERVAL '1 hour'
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [params.pattern_window]);

        // Calculate similarity scores
        let maxSimilarity = 0;
        for (const recentMsg of recentMessages) {
            const similarity = this.calculateMessageSimilarity(message, recentMsg.message);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        if (maxSimilarity < params.similarity_threshold) {
            const confidence = 0.6 + (params.similarity_threshold - maxSimilarity) * 0.5;
            return {
                isAnomaly: true,
                confidence: Math.min(0.95, confidence),
                description: `Unusual message pattern detected (similarity: ${maxSimilarity.toFixed(2)})`
            };
        }

        return { isAnomaly: false, confidence: 0 };
    }

    async evaluateTemporalAnomaly(rule, logEvent, features) {
        const params = rule.parameters;
        const currentHour = features.hour;
        
        // Get historical activity for this hour
        const historicalData = await this.db.all(`
            SELECT COUNT(*) as count, 
                   TO_CHAR(timestamp, 'HH24') as hour
            FROM logs 
            WHERE timestamp > NOW() - INTERVAL '\${params.min_history_days} days'
            GROUP BY TO_CHAR(timestamp, 'HH24')
        `);

        const hourlyStats = historicalData.reduce((acc, row) => {
            acc[parseInt(row.hour)] = row.count;
            return acc;
        }, {});

        const expectedCount = hourlyStats[currentHour] || 0;
        
        // Get current hour activity
        const currentActivity = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM logs 
            WHERE TO_CHAR(timestamp, 'HH24') = $1
            AND DATE(timestamp) = CURRENT_DATE
        `, [currentHour.toString().padStart(2, '0')]);

        const actualCount = currentActivity.count;
        
        if (expectedCount > 0) {
            const deviation = Math.abs(actualCount - expectedCount) / expectedCount;
            
            if (deviation >= params.deviation_threshold) {
                const confidence = Math.min(0.9, 0.5 + deviation * 0.2);
                return {
                    isAnomaly: true,
                    confidence,
                    description: `Temporal anomaly at hour ${currentHour}: ${actualCount} vs expected ${expectedCount}`
                };
            }
        }

        return { isAnomaly: false, confidence: 0 };
    }

    async evaluateSecurityCluster(rule, logEvent, features) {
        const params = rule.parameters;
        const message = (logEvent.message || '').toLowerCase();
        
        // Check if message contains security keywords
        const hasSecurityKeywords = params.security_keywords.some(keyword => 
            message.includes(keyword)
        );

        if (!hasSecurityKeywords) {
            return { isAnomaly: false, confidence: 0 };
        }

        // Look for clustering of security events
        const cutoffTime = new Date(Date.now() - params.cluster_window * 1000);
        const securityEvents = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM logs 
            WHERE timestamp > ?
            AND (${params.security_keywords.map(() => 'LOWER(message) LIKE ?').join(' OR ')})
        `, [
            cutoffTime.toISOString(),
            ...params.security_keywords.map(keyword => `%${keyword}%`)
        ]);

        if (securityEvents.count >= params.cluster_threshold) {
            const confidence = Math.min(0.95, 
                rule.confidence_threshold * params.confidence_boost * 
                (securityEvents.count / params.cluster_threshold)
            );

            return {
                isAnomaly: true,
                confidence,
                description: `Security event cluster detected: ${securityEvents.count} events in ${params.cluster_window}s`
            };
        }

        return { isAnomaly: false, confidence: 0 };
    }

    calculateMessageSimilarity(message1, message2) {
        // Simple Jaccard similarity based on word sets
        const words1 = new Set(message1.toLowerCase().split(/\s+/));
        const words2 = new Set(message2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    async getHistoricalAverage(level, timeWindow) {
        try {
            const result = await this.db.get(`
                SELECT AVG(hourly_count) as avg_count
                FROM (
                    SELECT COUNT(*) as hourly_count
                    FROM logs 
                    WHERE (severity = $1 OR level = $2)
                    AND timestamp > NOW() - INTERVAL '7 days'
                    AND timestamp <= NOW() - INTERVAL '1 day'
                    GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD HH24')
                ) hourly_data
            `, [level, level]);

            return result?.avg_count || 1;
        } catch (error) {

            this.loggers.system.error('Error getting historical average:', error);
            return 1;
        }
    }

    async processAnomaly(logEvent, anomalyResult) {
        try {

            
            // Store anomaly detection
            const anomalyId = await this.db.run(`
                INSERT INTO anomaly_detections (
                    log_id, anomaly_type, severity, confidence_score,
                    description, pattern_data, context_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                logEvent.id,
                anomalyResult.rule.rule_type,
                this.getSeverityFromConfidence(anomalyResult.confidence),
                anomalyResult.confidence,
                anomalyResult.description,
                JSON.stringify(anomalyResult.pattern || {}),
                JSON.stringify({ features: this.extractFeatures(logEvent) })
            ]);

            // Update statistics
            this.statistics.anomaliesDetected++;
            
            // Update rule usage
            await this.db.run(`
                UPDATE anomaly_rules 
                SET usage_count = usage_count + 1
                WHERE id = ?
            `, [anomalyResult.ruleId]);

            // Add to recent anomalies for tracking
            this.recentAnomalies.push({
                id: anomalyId.lastID,
                timestamp: new Date(),
                type: anomalyResult.rule.rule_type,
                confidence: anomalyResult.confidence,
                description: anomalyResult.description
            });

            // Keep only recent anomalies (last 100)
            if (this.recentAnomalies.length > 100) {
                this.recentAnomalies = this.recentAnomalies.slice(-100);
            }

            // Trigger alert if confidence is high enough
            if (anomalyResult.confidence >= 0.8) {
                try {
                    const AlertingEngine = require('./alerting-engine');
                    const alertingEngine = new AlertingEngine(this.db);
                    
                    const alertEvent = {
                        ...logEvent,
                        anomaly_detected: true,
                        anomaly_confidence: anomalyResult.confidence,
                        anomaly_description: anomalyResult.description
                    };
                    
                    await alertingEngine.processLogEvent(alertEvent);
                } catch (alertError) {
            this.loggers.system.error('Failed to trigger alert for anomaly:', alertError);
                }
            }

            this.loggers.system.info(`Anomaly detected: ${anomalyResult.description} (confidence: ${anomalyResult.confidence.toFixed(2)})`);

        } catch (error) {

            this.loggers.system.error('Error processing anomaly:', error);
        }
    }

    getSeverityFromConfidence(confidence) {
        if (confidence >= 0.9) return 'critical';
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.6) return 'medium';
        return 'low';
    }

    scheduleAnalysisTasks() {

        
        // Update baseline patterns every hour
        setInterval(async () => {
            await this.updateBaselinePatterns();
        }, 60 * 60 * 1000);

        // Train models daily at 3 AM
        cron.schedule('0 3 * * *', async () => {
            await this.trainAnomalyModels();
        });

        // Clean up old anomalies weekly
        cron.schedule('0 4 * * 0', async () => {
            await this.cleanupOldAnomalies();
        });

            this.loggers.system.info('Scheduled anomaly detection tasks');
    }

    async updateBaselinePatterns() {
        try {

            this.loggers.system.info('Updating baseline patterns...');

            // Update source patterns
            const sourceCounts = await this.db.all(`
                SELECT source, COUNT(*) as count
                FROM logs 
                WHERE timestamp > datetime('now', '-24 hours')
                GROUP BY source
            `);

            for (const sourceCount of sourceCounts) {
                await this.db.run(`
                    INSERT OR REPLACE INTO anomaly_patterns (
                        pattern_type, pattern_signature, frequency_normal, 
                        last_seen, occurrence_count, is_baseline
                    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 1)
                `, ['source', sourceCount.source, sourceCount.count, sourceCount.count]);
            }

            // Update hourly patterns
            const hourlyCounts = await this.db.all(`
                SELECT TO_CHAR(timestamp, 'HH24') as hour, COUNT(*) as count
                FROM logs 
                WHERE timestamp > NOW() - INTERVAL '7 days'
                GROUP BY TO_CHAR(timestamp, 'HH24')
            `);

            for (const hourlyCount of hourlyCounts) {
                await this.db.run(`
                    INSERT OR REPLACE INTO anomaly_patterns (
                        pattern_type, pattern_signature, frequency_normal,
                        last_seen, occurrence_count, is_baseline
                    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 1)
                `, ['hourly', hourlyCount.hour, hourlyCount.count, hourlyCount.count]);
            }

            this.loggers.system.info('Baseline patterns updated');
        } catch (error) {

            this.loggers.system.error('Failed to update baseline patterns:', error);
        }
    }

    async trainAnomalyModels() {
        if (this.isTraining) {

            this.loggers.system.warn('Model training already in progress');
            return;
        }

        this.isTraining = true;
        
        try {

            this.loggers.system.info('Starting anomaly model training...');

            // Collect training data from recent logs and anomalies
            const trainingData = await this.collectTrainingData();
            
            if (trainingData.length < 100) {
            this.loggers.system.warn('Insufficient training data for model training');
                return;
            }

            // Simple statistical model training
            const model = await this.trainStatisticalModel(trainingData);
            
            // Validate model
            const validationScore = await this.validateModel(model, trainingData);
            
            // Store model if it performs well
            if (validationScore > 0.7) {
                await this.storeModel('statistical_v1', model, validationScore);
                this.statistics.modelAccuracy = validationScore;
                this.statistics.trainingIterations++;
            this.loggers.system.info(`Model training completed with accuracy: ${validationScore.toFixed(3)}`);
            } else {
            this.loggers.system.warn(`Model training resulted in low accuracy: ${validationScore.toFixed(3)}`);
            }

            this.lastTrainingTime = new Date();

        } catch (error) {

            this.loggers.system.error('Model training failed:', error);
        } finally {
            this.isTraining = false;
        }
    }

    async collectTrainingData() {
        try {
            // Get confirmed anomalies (positive examples)
            const anomalies = await this.db.all(`
                SELECT l.*, ad.anomaly_type, ad.confidence_score
                FROM logs l
                JOIN anomaly_detections ad ON l.id = ad.log_id
                WHERE ad.false_positive = 0
                AND ad.timestamp > NOW() - INTERVAL '30 days'
                LIMIT 500
            `);

            // Get normal logs (negative examples)
            const normalLogs = await this.db.all(`
                SELECT l.* FROM logs l
                LEFT JOIN anomaly_detections ad ON l.id = ad.log_id
                WHERE ad.id IS NULL
                AND l.timestamp > NOW() - INTERVAL '7 days'
                ORDER BY RANDOM()
                LIMIT 1000
            `);

            const trainingData = [];

            // Process anomalies as positive examples
            for (const log of anomalies) {
                const features = this.extractFeatures(log);
                trainingData.push({
                    features,
                    label: 'anomaly',
                    weight: 1.0
                });
            }

            // Process normal logs as negative examples
            for (const log of normalLogs) {
                const features = this.extractFeatures(log);
                trainingData.push({
                    features,
                    label: 'normal',
                    weight: 0.5 // Lower weight for normal examples
                });
            }

            return trainingData;
        } catch (error) {

            this.loggers.system.error('Error collecting training data:', error);
            return [];
        }
    }

    async trainStatisticalModel(trainingData) {
        // Simple statistical model based on feature distributions
        const model = {
            type: 'statistical',
            featureStats: {},
            thresholds: {},
            created: new Date().toISOString()
        };

        const anomalyData = trainingData.filter(d => d.label === 'anomaly');
        const normalData = trainingData.filter(d => d.label === 'normal');

        if (anomalyData.length === 0 || normalData.length === 0) {
            throw new Error('Insufficient training data for both classes');
        }

        // Calculate feature statistics for both classes
        const featureNames = Object.keys(anomalyData[0].features);
        
        for (const feature of featureNames) {
            const anomalyValues = anomalyData.map(d => d.features[feature]).filter(v => typeof v === 'number');
            const normalValues = normalData.map(d => d.features[feature]).filter(v => typeof v === 'number');

            if (anomalyValues.length > 0 && normalValues.length > 0) {
                model.featureStats[feature] = {
                    anomaly: {
                        mean: this.calculateMean(anomalyValues),
                        std: this.calculateStdDev(anomalyValues),
                        min: Math.min(...anomalyValues),
                        max: Math.max(...anomalyValues)
                    },
                    normal: {
                        mean: this.calculateMean(normalValues),
                        std: this.calculateStdDev(normalValues),
                        min: Math.min(...normalValues),
                        max: Math.max(...normalValues)
                    }
                };

                // Calculate threshold for this feature
                const anomalyMean = model.featureStats[feature].anomaly.mean;
                const normalMean = model.featureStats[feature].normal.mean;
                model.thresholds[feature] = (anomalyMean + normalMean) / 2;
            }
        }

        return model;
    }

    calculateMean(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    calculateStdDev(values) {
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    async validateModel(model, trainingData) {
        let correct = 0;
        let total = 0;

        for (const sample of trainingData) {
            const prediction = this.predictWithModel(model, sample.features);
            const actualLabel = sample.label;
            
            if ((prediction.isAnomaly && actualLabel === 'anomaly') || 
                (!prediction.isAnomaly && actualLabel === 'normal')) {
                correct++;
            }
            total++;
        }

        return total > 0 ? correct / total : 0;
    }

    predictWithModel(model, features) {
        let anomalyScore = 0;
        let featureCount = 0;

        for (const [featureName, value] of Object.entries(features)) {
            if (typeof value === 'number' && model.featureStats[featureName]) {
                const stats = model.featureStats[featureName];
                
                // Simple threshold-based scoring
                if (Math.abs(value - stats.anomaly.mean) < Math.abs(value - stats.normal.mean)) {
                    anomalyScore += 1;
                }
                featureCount++;
            }
        }

        const confidence = featureCount > 0 ? anomalyScore / featureCount : 0;
        return {
            isAnomaly: confidence > 0.5,
            confidence: confidence,
            score: anomalyScore
        };
    }

    async storeModel(modelName, modelData, accuracy) {
        try {
            await this.db.run(`
                INSERT OR REPLACE INTO anomaly_models (
                    model_name, model_type, model_data, accuracy_score, validation_score
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                modelName,
                modelData.type,
                JSON.stringify(modelData),
                accuracy,
                accuracy
            ]);

            this.models.set(modelName, modelData);
        } catch (error) {

            this.loggers.system.error('Failed to store model:', error);
        }
    }

    async cleanupOldAnomalies() {
        try {

            
            // Delete old resolved anomalies (keep for 90 days)
            await this.db.run(`
                DELETE FROM anomaly_detections 
                WHERE resolved = 1 
                AND resolved_at < NOW() - INTERVAL '90 days'
            `);

            // Delete old training data (keep for 30 days)
            await this.db.run(`
                DELETE FROM anomaly_training_data 
                WHERE created_at < NOW() - INTERVAL '30 days'
            `);

            this.loggers.system.info('Cleaned up old anomaly data');
        } catch (error) {

            this.loggers.system.error('Failed to cleanup old anomalies:', error);
        }
    }

    async getAnomalyStatistics() {
        try {
            const totalAnomalies = await this.db.get(`
                SELECT COUNT(*) as count FROM anomaly_detections
            `);

            const recentAnomalies = await this.db.get(`
                SELECT COUNT(*) as count FROM anomaly_detections
                WHERE timestamp > NOW() - INTERVAL '24 hours'
            `);

            const anomaliesBySeverity = await this.db.all(`
                SELECT severity, COUNT(*) as count
                FROM anomaly_detections
                WHERE timestamp > NOW() - INTERVAL '7 days'
                GROUP BY severity
            `);

            const topRules = await this.db.all(`
                SELECT ar.name, ar.usage_count, ar.accuracy_rating
                FROM anomaly_rules ar
                WHERE ar.enabled = true
                ORDER BY ar.usage_count DESC
                LIMIT 10
            `);

            const modelInfo = await this.db.all(`
                SELECT * FROM anomaly_models
                WHERE is_active = 1
                ORDER BY training_date DESC
            `);

            return {
                totalAnomalies: totalAnomalies.count,
                recentAnomalies: recentAnomalies.count,
                anomaliesBySeverity,
                topRules,
                modelInfo,
                runtimeStats: this.statistics,
                isTraining: this.isTraining,
                lastTrainingTime: this.lastTrainingTime,
                recentAnomaliesBuffer: this.recentAnomalies.slice(-20)
            };
        } catch (error) {

            this.loggers.system.error('Failed to get anomaly statistics:', error);
            return null;
        }
    }

    async markAnomalyAsFalsePositive(anomalyId, userId) {
        try {
            await this.db.run(`
                UPDATE anomaly_detections 
                SET false_positive = 1, 
                    feedback_provided = 1,
                    resolved = 1,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = ?
                WHERE id = ?
            `, [userId, anomalyId]);

            this.statistics.falsePositives++;
            return { success: true };
        } catch (error) {

            this.loggers.system.error('Failed to mark anomaly as false positive:', error);
            return { success: false, error: error.message };
        }
    }

    async resolveAnomaly(anomalyId, userId) {
        try {
            await this.db.run(`
                UPDATE anomaly_detections 
                SET resolved = 1,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = ?
                WHERE id = ?
            `, [userId, anomalyId]);

            return { success: true };
        } catch (error) {

            this.loggers.system.error('Failed to resolve anomaly:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = AnomalyDetectionEngine;
