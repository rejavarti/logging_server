const express = require('express');
const { getPageTemplate } = require('../../templates/base');
const router = express.Router();

// Distributed Tracing Management Page
router.get('/', (req, res) => {
    const config = req.app.locals.config || {};
    
    const pageContent = `
        <div class="container-fluid">
            <div class="row">
                <div class="col-12">
                    <h2><i class="fas fa-project-diagram"></i> Distributed Tracing & Observability</h2>
                    <p class="text-muted">OpenTelemetry integration with Jaeger for distributed system observability and performance monitoring</p>
                    
                    <div class="row mb-4">
                        <!-- Tracing Status Card -->
                        <div class="col-md-4 mb-3">
                            <div class="card border-primary">
                                <div class="card-body text-center">
                                    <i class="fas fa-chart-network fa-2x text-primary mb-2"></i>
                                    <h5>Tracing Status</h5>
                                    <div id="tracingStatus">
                                        <span class="badge bg-success">Active</span>
                                        <br><small id="serviceName">${config.tracing?.serviceName || 'logging-server'}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4 mb-3">
                            <div class="card border-info">
                                <div class="card-body text-center">
                                    <i class="fas fa-sitemap fa-2x text-info mb-2"></i>
                                    <h5>Service Map</h5>
                                    <div id="serviceMapStats">
                                        <span id="serviceCount">0</span> Services
                                        <br><small>Active Dependencies</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4 mb-3">
                            <div class="card border-warning">
                                <div class="card-body text-center">
                                    <i class="fas fa-stopwatch fa-2x text-warning mb-2"></i>
                                    <h5>Performance</h5>
                                    <div id="performanceStats">
                                        <span id="avgDuration">0ms</span>
                                        <br><small>Avg Trace Duration</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-md-8">
                            <!-- Trace Search Card -->
                            <div class="card mb-4">
                                <div class="card-header">
                                    <h5><i class="fas fa-search"></i> Trace Search & Analysis</h5>
                                </div>
                                <div class="card-body">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">Service</label>
                                            <select class="form-select" id="filterService">
                                                <option value="">All Services</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Severity</label>
                                            <select class="form-select" id="filterSeverity">
                                                <option value="">All Severities</option>
                                                <option value="error">Error</option>
                                                <option value="warning">Warning</option>
                                                <option value="info">Info</option>
                                                <option value="debug">Debug</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Time Range</label>
                                            <select class="form-select" id="filterTimeRange">
                                                <option value="1h">Last Hour</option>
                                                <option value="6h">Last 6 Hours</option>
                                                <option value="24h">Last 24 Hours</option>
                                                <option value="7d">Last 7 Days</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <button type="button" class="btn btn-primary" onclick="searchTraces()">
                                            <i class="fas fa-search"></i> Search Traces
                                        </button>
                                        <button type="button" class="btn btn-secondary ms-2" onclick="refreshData()">
                                            <i class="fas fa-sync"></i> Refresh
                                        </button>
                                    </div>
                                    
                                    <div id="tracingResults">
                                        <div class="text-center text-muted">
                                            <i class="fas fa-search fa-3x mb-3"></i>
                                            <p>Search for traces to see results here</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Service Dependencies Card -->
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-project-diagram"></i> Service Dependencies</h5>
                                </div>
                                <div class="card-body">
                                    <div id="dependencyMap" style="min-height: 400px;">
                                        <div class="text-center">
                                            <i class="fas fa-spinner fa-spin"></i> Loading dependency map...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4">
                            <!-- Statistics Card -->
                            <div class="card mb-4">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-bar"></i> Tracing Statistics</h5>
                                </div>
                                <div class="card-body">
                                    <div id="tracingStatsDetail">
                                        <div class="text-center">
                                            <i class="fas fa-spinner fa-spin"></i> Loading statistics...
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Configuration Card -->
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-cog"></i> Configuration</h5>
                                </div>
                                <div class="card-body">
                                    <h6>OpenTelemetry Settings</h6>
                                    <div class="mb-2">
                                        <small class="text-muted">TRACING_SERVICE_NAME</small><br>
                                        <code>${config.tracing?.serviceName || 'logging-server'}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">JAEGER_ENDPOINT</small><br>
                                        <code>${config.tracing?.jaegerEndpoint || 'http://localhost:14268/api/traces'}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">TRACING_SAMPLING_RATE</small><br>
                                        <code>${config.tracing?.samplingRate || 0.1}</code>
                                    </div>
                                    
                                    <hr>
                                    
                                    <h6>Integration Status</h6>
                                    <div class="list-group list-group-flush">
                                        <div class="list-group-item d-flex justify-content-between align-items-center">
                                            OpenTelemetry SDK
                                            <span class="badge bg-success rounded-pill">Active</span>
                                        </div>
                                        <div class="list-group-item d-flex justify-content-between align-items-center">
                                            Jaeger Exporter
                                            <span class="badge bg-success rounded-pill">Connected</span>
                                        </div>
                                        <div class="list-group-item d-flex justify-content-between align-items-center">
                                            Log Correlation
                                            <span class="badge bg-success rounded-pill">Enabled</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            let tracingStats = {};
            let dependencies = [];
            
            async function loadTracingStatus() {
                try {
                    const response = await fetch('/api/tracing/status');
                    const data = await response.json();
                    
                    if (data.success) {
                        tracingStats = data.stats;
                        updateTracingStats();
                    }
                } catch (error) {
                    console.error('Failed to load tracing status:', error);
                    showError('tracingStatsDetail', 'Failed to load tracing statistics');
                }
            }
            
            function updateTracingStats() {
                // Update main cards
                document.getElementById('avgDuration').textContent = 
                    Math.round(tracingStats.avgDuration || 0) + 'ms';
                
                // Update detailed statistics
                const statsDetail = document.getElementById('tracingStatsDetail');
                statsDetail.innerHTML = \`
                    <div class="row text-center">
                        <div class="col-12 mb-3">
                            <h4 class="text-primary">\${(tracingStats.totalTraces || 0).toLocaleString()}</h4>
                            <small class="text-muted">Total Traces</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h5 class="text-info">\${(tracingStats.totalSpans || 0).toLocaleString()}</h5>
                            <small class="text-muted">Total Spans</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h5 class="text-warning">\${tracingStats.errorsCount || 0}</h5>
                            <small class="text-muted">Errors</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h5 class="text-success">\${tracingStats.activeSpans || 0}</h5>
                            <small class="text-muted">Active Spans</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h5 class="text-secondary">\${tracingStats.activeTraces || 0}</h5>
                            <small class="text-muted">Active Traces</small>
                        </div>
                    </div>
                \`;
            }
            
            async function loadServiceDependencies() {
                try {
                    const response = await fetch('/api/tracing/dependencies');
                    const data = await response.json();
                    
                    if (data.success) {
                        dependencies = data.dependencies;
                        document.getElementById('serviceCount').textContent = data.services.length;
                        updateDependencyMap();
                        
                        // Update service filter
                        const serviceSelect = document.getElementById('filterService');
                        serviceSelect.innerHTML = '<option value="">All Services</option>';
                        data.services.forEach(service => {
                            const option = document.createElement('option');
                            option.value = service;
                            option.textContent = service;
                            serviceSelect.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Failed to load service dependencies:', error);
                    showError('dependencyMap', 'Failed to load service dependencies');
                }
            }
            
            function updateDependencyMap() {
                const mapDiv = document.getElementById('dependencyMap');
                
                if (dependencies.length === 0) {
                    mapDiv.innerHTML = '<div class="text-center text-muted"><p>No service dependencies found</p></div>';
                    return;
                }
                
                let html = '<div class="dependency-list">';
                dependencies.forEach(dep => {
                    const errorRate = dep.count > 0 ? (dep.errors / dep.count * 100).toFixed(1) : 0;
                    const statusClass = errorRate > 10 ? 'danger' : errorRate > 5 ? 'warning' : 'success';
                    
                    html += \`
                        <div class="d-flex align-items-center justify-content-between border-bottom py-2">
                            <div class="flex-grow-1">
                                <strong>\${dep.from}</strong> <i class="fas fa-arrow-right text-muted mx-2"></i> <strong>\${dep.to}</strong>
                                <br><small class="text-muted">\${dep.count} calls • \${Math.round(dep.avgDuration)}ms avg</small>
                            </div>
                            <span class="badge bg-\${statusClass}">\${errorRate}% errors</span>
                        </div>
                    \`;
                });
                html += '</div>';
                
                mapDiv.innerHTML = html;
            }
            
            async function searchTraces() {
                const service = document.getElementById('filterService').value;
                const severity = document.getElementById('filterSeverity').value;
                const timeRange = document.getElementById('filterTimeRange').value;
                
                const params = new URLSearchParams();
                if (service) params.append('service', service);
                if (severity) params.append('severity', severity);
                
                // Calculate time range
                const now = new Date();
                let startTime;
                switch (timeRange) {
                    case '1h':
                        startTime = new Date(now - 60 * 60 * 1000);
                        break;
                    case '6h':
                        startTime = new Date(now - 6 * 60 * 60 * 1000);
                        break;
                    case '24h':
                        startTime = new Date(now - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                        break;
                }
                
                if (startTime) {
                    params.append('start_time', startTime.toISOString());
                    params.append('end_time', now.toISOString());
                }
                
                try {
                    const response = await fetch('/api/tracing/search?' + params.toString());
                    const data = await response.json();
                    
                    if (data.success) {
                        displayTraceResults(data.traces);
                    }
                } catch (error) {
                    console.error('Failed to search traces:', error);
                    showError('tracingResults', 'Failed to search traces');
                }
            }
            
            function displayTraceResults(traces) {
                const resultsDiv = document.getElementById('tracingResults');
                
                if (traces.length === 0) {
                    resultsDiv.innerHTML = '<div class="text-center text-muted"><p>No traces found for the selected filters</p></div>';
                    return;
                }
                
                let html = '<div class="table-responsive"><table class="table table-hover"><thead><tr>';
                html += '<th>Trace ID</th><th>Duration</th><th>Spans</th><th>Services</th><th>Errors</th><th>Start Time</th>';
                html += '</tr></thead><tbody>';
                
                traces.forEach(trace => {
                    const duration = Math.round(trace.duration);
                    const errorClass = trace.error_count > 0 ? 'text-danger' : '';
                    
                    html += \`
                        <tr style="cursor: pointer;" onclick="viewTraceDetail('\${trace.trace_id}')">
                            <td><code>\${trace.trace_id.substring(0, 16)}...</code></td>
                            <td>\${duration}ms</td>
                            <td>\${trace.spans_count}</td>
                            <td>\${trace.services.join(', ')}</td>
                            <td class="\${errorClass}">\${trace.error_count}</td>
                            <td>\${formatTimestamp(trace.start_time)}</td>
                        </tr>
                    \`;
                });
                
                html += '</tbody></table></div>';
                resultsDiv.innerHTML = html;
            }
            
            async function viewTraceDetail(traceId) {
                try {
                    const response = await fetch('/api/tracing/trace/' + traceId);
                    const data = await response.json();
                    
                    if (data.success) {
                        // Show trace detail modal (would implement a proper modal)
                        alert('Trace Details:\\n' + JSON.stringify(data.trace, null, 2));
                    }
                } catch (error) {
                    console.error('Failed to load trace detail:', error);
                }
            }
            
            function refreshData() {
                loadTracingStatus();
                loadServiceDependencies();
                if (document.getElementById('tracingResults').innerHTML.includes('table')) {
                    searchTraces();
                }
            }
            
            function showError(elementId, message) {
                document.getElementById(elementId).innerHTML = \`<div class="alert alert-danger">\${message}</div>\`;
            }
            
            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleString();
            }
            
            // Load data on page load
            document.addEventListener('DOMContentLoaded', () => {
                loadTracingStatus();
                loadServiceDependencies();
                
                // Refresh every 30 seconds
                setInterval(refreshData, 30000);
            });
        </script>
    `;

    res.send(getPageTemplate({
        pageTitle: 'Distributed Tracing',
        pageIcon: 'fa-project-diagram',
        activeNav: 'tracing',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: '',
        req: req
    }));
});

module.exports = router;