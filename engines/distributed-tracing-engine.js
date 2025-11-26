/**
 * Distributed Tracing Engine
 * Provides OpenTelemetry integration, trace collection, and span analysis
 * 
 * Features:
 * - OpenTelemetry SDK integration
 * - Jaeger exporter support
 * - Trace and span collection
 * - Service dependency mapping
 * - Performance analytics
 */

// OpenTelemetry SDK imports (installed via package.json)
let NodeSDK, JaegerExporter, getNodeAutoInstrumentations;
try {
    const { NodeSDK: SDK } = require('@opentelemetry/sdk-node');
    const { JaegerExporter: Exporter } = require('@opentelemetry/exporter-jaeger');
    const { getNodeAutoInstrumentations: getInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    NodeSDK = SDK;
    JaegerExporter = Exporter;
    getNodeAutoInstrumentations = getInstrumentations;
} catch (err) {
    // OpenTelemetry packages not installed - tracing will be disabled
    NodeSDK = null;
}

class DistributedTracingEngine {
    constructor(dal, loggers, config = {}) {
        this.dal = dal;
        this.loggers = loggers;
        this.config = config.tracing || {};
        this.isInitialized = false;
        this.otelSDK = null;
        this.traces = [];
        this.spans = [];
        this.services = new Set();
        this.dependencies = [];
        this.stats = {
            totalTraces: 0,
            totalSpans: 0,
            avgDuration: 0,
            errorsCount: 0,
            activeSpans: 0,
            activeTraces: 0
        };
    }

    async initialize() {
        try {
            this.loggers.system.info('🔍 Initializing Distributed Tracing Engine...');
            
            // Initialize OpenTelemetry if configured
            if (this.config && this.config.enabled && NodeSDK) {
                try {
                    const serviceName = this.config.serviceName || 'logging-server';
                    const jaegerEndpoint = this.config.jaegerEndpoint || 'http://localhost:14268/api/traces';
                    const samplingRate = this.config.samplingRate || 0.1;
                    
                    // Configure Jaeger exporter
                    const jaegerExporter = new JaegerExporter({
                        endpoint: jaegerEndpoint,
                        serviceName: serviceName
                    });
                    
                    // Configure OpenTelemetry SDK with auto-instrumentation
                    this.otelSDK = new NodeSDK({
                        serviceName: serviceName,
                        traceExporter: jaegerExporter,
                        instrumentations: [
                            getNodeAutoInstrumentations({
                                '@opentelemetry/instrumentation-fs': {
                                    enabled: false // Disable fs to reduce noise
                                },
                                '@opentelemetry/instrumentation-http': {
                                    enabled: true,
                                    requestHook: (span, request) => {
                                        span.setAttribute('http.client_ip', request.socket?.remoteAddress || 'unknown');
                                    }
                                },
                                '@opentelemetry/instrumentation-express': {
                                    enabled: true
                                }
                            })
                        ],
                        sampler: {
                            shouldSample: () => {
                                // Simple probability-based sampling
                                return Math.random() < samplingRate 
                                    ? { decision: 1 } // RECORD_AND_SAMPLE
                                    : { decision: 0 }; // NOT_RECORD
                            },
                            toString: () => `ProbabilitySampler{${samplingRate}}`
                        }
                    });
                    
                    // Start the SDK
                    await this.otelSDK.start();
                    
                    this.loggers.system.info('   ✅ OpenTelemetry SDK started');
                    this.loggers.system.info('   • Service Name:', serviceName);
                    this.loggers.system.info('   • Jaeger Endpoint:', jaegerEndpoint);
                    this.loggers.system.info('   • Sampling Rate:', (samplingRate * 100).toFixed(1) + '%');
                    this.loggers.system.info('   • Auto-instrumentation: Enabled (HTTP, Express)');
                } catch (otelError) {
                    this.loggers.system.error('   ❌ OpenTelemetry initialization failed:', otelError.message);
                    this.loggers.system.warn('   • Tracing will be disabled');
                }
            } else if (this.config && this.config.enabled && !NodeSDK) {
                this.loggers.system.warn('   ⚠️  OpenTelemetry packages not installed');
                this.loggers.system.warn('   • Install: npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-jaeger');
                this.loggers.system.warn('   • Tracing will be disabled');
            } else {
                this.loggers.system.info('   • Distributed Tracing: Disabled');
            }
            
            this.isInitialized = true;
            this.loggers.system.info('✅ Distributed Tracing Engine initialized successfully');
            return true;
        } catch (error) {
            this.loggers.system.error('Failed to initialize Distributed Tracing Engine:', error);
            return false;
        }
    }

    getTraceStats() {
        return {
            totalTraces: this.stats.totalTraces,
            totalSpans: this.stats.totalSpans,
            avgDuration: this.stats.avgDuration,
            errorsCount: this.stats.errorsCount,
            activeSpans: this.stats.activeSpans,
            activeTraces: this.stats.activeTraces,
            servicesCount: this.services.size,
            config: {
                enabled: this.config.enabled,
                serviceName: this.config.serviceName,
                jaegerEndpoint: this.config.jaegerEndpoint,
                samplingRate: this.config.samplingRate
            }
        };
    }

    async searchTraces(filters = {}) {
        try {
            const {
                traceId,
                service,
                minDuration,
                maxDuration,
                hasError,
                startTime,
                endTime,
                limit = 100
            } = filters;
            
            let results = [...this.traces];
            
            // Apply filters
            if (traceId) {
                results = results.filter(t => t.traceId === traceId);
            }
            
            if (service) {
                results = results.filter(t => t.service === service);
            }
            
            if (minDuration !== undefined) {
                results = results.filter(t => t.duration >= minDuration);
            }
            
            if (maxDuration !== undefined) {
                results = results.filter(t => t.duration <= maxDuration);
            }
            
            if (hasError !== undefined) {
                results = results.filter(t => t.error === hasError);
            }
            
            if (startTime) {
                results = results.filter(t => new Date(t.timestamp) >= new Date(startTime));
            }
            
            if (endTime) {
                results = results.filter(t => new Date(t.timestamp) <= new Date(endTime));
            }
            
            // Sort by timestamp descending (newest first)
            results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Apply limit
            results = results.slice(0, limit);
            
            return {
                success: true,
                traces: results,
                total: results.length,
                filtered: results.length < this.traces.length
            };
        } catch (error) {
            this.loggers.system.error('Error searching traces:', error);
            throw error;
        }
    }

    async getTraceData(traceId) {
        try {
            const trace = this.traces.find(t => t.traceId === traceId);
            if (!trace) {
                return null;
            }
            
            const relatedSpans = this.spans.filter(s => s.traceId === traceId);
            
            return {
                ...trace,
                spans: relatedSpans,
                spanCount: relatedSpans.length,
                totalDuration: relatedSpans.reduce((sum, span) => sum + (span.duration || 0), 0),
                errorCount: relatedSpans.filter(span => span.error).length
            };
        } catch (error) {
            this.loggers.system.error('Error getting trace data:', error);
            return null;
        }
    }

    async getServiceDependencies() {
        try {
            const dependencies = [];
            const serviceMap = new Map();
            
            // Analyze spans to build service dependency graph
            this.spans.forEach(span => {
                if (span.parentSpan) {
                    const parentService = span.parentSpan.service;
                    const currentService = span.service;
                    
                    if (parentService && currentService && parentService !== currentService) {
                        const key = `${parentService}->${currentService}`;
                        if (!serviceMap.has(key)) {
                            serviceMap.set(key, {
                                from: parentService,
                                to: currentService,
                                callCount: 0,
                                avgDuration: 0,
                                errorRate: 0
                            });
                        }
                        
                        const dep = serviceMap.get(key);
                        dep.callCount++;
                        dep.avgDuration = (dep.avgDuration * (dep.callCount - 1) + span.duration) / dep.callCount;
                        if (span.error) {
                            dep.errorRate = (dep.errorRate * (dep.callCount - 1) + 1) / dep.callCount;
                        }
                    }
                }
            });
            
            return Array.from(serviceMap.values());
        } catch (error) {
            this.loggers.system.error('Error getting service dependencies:', error);
            return [];
        }
    }

    addTrace(trace) {
        try {
            this.traces.push({
                traceId: trace.traceId || this.generateTraceId(),
                service: trace.service || 'unknown',
                operation: trace.operation || 'unknown',
                timestamp: trace.timestamp || new Date().toISOString(),
                duration: trace.duration || 0,
                severity: trace.severity || 'info',
                error: trace.error || false,
                ...trace
            });
            
            this.stats.totalTraces++;
            if (trace.service) {
                this.services.add(trace.service);
            }
            
            this.loggers.system.debug('Added trace:', trace.traceId);
        } catch (error) {
            this.loggers.system.error('Error adding trace:', error);
        }
    }

    addSpan(span) {
        try {
            this.spans.push({
                spanId: span.spanId || this.generateSpanId(),
                traceId: span.traceId || 'unknown',
                service: span.service || 'unknown',
                operation: span.operation || 'unknown',
                timestamp: span.timestamp || new Date().toISOString(),
                duration: span.duration || 0,
                error: span.error || false,
                parentSpan: span.parentSpan || null,
                tags: span.tags || {},
                ...span
            });
            
            this.stats.totalSpans++;
            if (span.duration) {
                this.stats.avgDuration = (this.stats.avgDuration * (this.stats.totalSpans - 1) + span.duration) / this.stats.totalSpans;
            }
            if (span.error) {
                this.stats.errorsCount++;
            }
            
            this.loggers.system.debug('Added span:', span.spanId);
        } catch (error) {
            this.loggers.system.error('Error adding span:', error);
        }
    }

    generateTraceId() {
        return 'trace_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    generateSpanId() {
        return 'span_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Middleware to automatically trace HTTP requests
    getTracingMiddleware() {
        return (req, res, next) => {
            const traceId = this.generateTraceId();
            const spanId = this.generateSpanId();
            const startTime = Date.now();
            
            req.traceId = traceId;
            req.spanId = spanId;
            
            // Add trace to ongoing requests
            this.addTrace({
                traceId,
                service: 'http-server',
                operation: `${req.method} ${req.path}`,
                timestamp: new Date(startTime).toISOString(),
                tags: {
                    method: req.method,
                    path: req.path,
                    userAgent: req.headers['user-agent'],
                    ip: req.ip
                }
            });
            
            // Hook into response to capture duration
            const originalSend = res.send;
            res.send = function(body) {
                const duration = Date.now() - startTime;
                const error = res.statusCode >= 400;
                
                // Update trace with final data
                const trace = this.traces.find(t => t.traceId === traceId);
                if (trace) {
                    trace.duration = duration;
                    trace.error = error;
                    trace.statusCode = res.statusCode;
                }
                
                // Add corresponding span
                this.addSpan({
                    spanId,
                    traceId,
                    service: 'http-server',
                    operation: `${req.method} ${req.path}`,
                    timestamp: new Date(startTime).toISOString(),
                    duration,
                    error,
                    tags: {
                        statusCode: res.statusCode,
                        responseSize: body ? body.length : 0
                    }
                });
                
                return originalSend.call(this, body);
            }.bind(this);
            
            next();
        };
    }

    cleanup() {
        try {
            // Shutdown OpenTelemetry SDK
            if (this.otelSDK) {
                this.otelSDK.shutdown()
                    .then(() => this.loggers.system.info('OpenTelemetry SDK shutdown complete'))
                    .catch(err => this.loggers.system.error('OpenTelemetry SDK shutdown error:', err));
            }
            
            // Clean up old traces (keep only last 1000)
            if (this.traces.length > 1000) {
                this.traces = this.traces.slice(-1000);
            }
            
            // Clean up old spans (keep only last 5000)
            if (this.spans.length > 5000) {
                this.spans = this.spans.slice(-5000);
            }
            
            this.loggers.system.debug('Cleaned up old traces and spans');
        } catch (error) {
            this.loggers.system.error('Error during tracing cleanup:', error);
        }
    }
}

module.exports = DistributedTracingEngine;