const express = require('express');
const { getPageTemplate } = require('../../templates/base');
const router = express.Router();

// Multi-Protocol Ingestion Management Page
router.get('/', (req, res) => {
    const config = req.app.locals.config || {};
    
    const pageContent = `
        <div class="container-fluid">
            <div class="row">
                <div class="col-12">
                    <h2><i class="fas fa-network-wired"></i> Multi-Protocol Log Ingestion</h2>
                    <p class="text-muted">Enterprise-grade log ingestion supporting Syslog, GELF, Beats, Fluent Bit and more</p>
                    
                    <div class="row mb-4">
                        <!-- Protocol Status Cards -->
                        <div class="col-md-3 mb-3">
                            <div class="card border-primary">
                                <div class="card-body text-center">
                                    <i class="fas fa-server fa-2x text-primary mb-2"></i>
                                    <h5>Syslog</h5>
                                    <p class="text-muted">RFC3164/5424</p>
                                    <div class="protocol-status" data-protocol="syslog">
                                        <span class="badge bg-success">Active</span>
                                        <br><small>UDP: ${config.ingestion?.syslog?.udpPort || 514} | TCP: ${config.ingestion?.syslog?.tcpPort || 601}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-3 mb-3">
                            <div class="card border-info">
                                <div class="card-body text-center">
                                    <i class="fas fa-layer-group fa-2x text-info mb-2"></i>
                                    <h5>GELF</h5>
                                    <p class="text-muted">Graylog Extended</p>
                                    <div class="protocol-status" data-protocol="gelf">
                                        <span class="badge bg-success">Active</span>
                                        <br><small>UDP: ${config.ingestion?.gelf?.udpPort || 12201} | TCP: ${config.ingestion?.gelf?.tcpPort || 12202}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-3 mb-3">
                            <div class="card border-warning">
                                <div class="card-body text-center">
                                    <i class="fas fa-heartbeat fa-2x text-warning mb-2"></i>
                                    <h5>Beats</h5>
                                    <p class="text-muted">Elastic Ecosystem</p>
                                    <div class="protocol-status" data-protocol="beats">
                                        <span class="badge bg-success">Active</span>
                                        <br><small>TCP: ${config.ingestion?.beats?.tcpPort || 5044}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-3 mb-3">
                            <div class="card border-success">
                                <div class="card-body text-center">
                                    <i class="fas fa-stream fa-2x text-success mb-2"></i>
                                    <h5>Fluent Bit</h5>
                                    <p class="text-muted">Fluent Ecosystem</p>
                                    <div class="protocol-status" data-protocol="fluent">
                                        <span class="badge bg-success">Active</span>
                                        <br><small>HTTP: ${config.ingestion?.fluent?.httpPort || 9880}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-md-8">
                            <!-- Statistics Card -->
                            <div class="card mb-4">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-bar"></i> Ingestion Statistics</h5>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <canvas id="protocolChart" width="400" height="200"></canvas>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="stats-grid" id="statsGrid">
                                                <div class="text-center">
                                                    <i class="fas fa-spinner fa-spin"></i> Loading statistics...
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Protocol Testing Card -->
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-vial"></i> Protocol Testing</h5>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label class="form-label">Protocol</label>
                                        <select class="form-select" id="testProtocol">
                                            <option value="syslog-rfc3164">Syslog RFC3164</option>
                                            <option value="syslog-rfc5424">Syslog RFC5424</option>
                                            <option value="gelf">GELF</option>
                                            <option value="beats">Beats</option>
                                            <option value="fluent">Fluent Bit</option>
                                            <option value="json">JSON</option>
                                        </select>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <label class="form-label">Test Message</label>
                                        <textarea class="form-control" id="testMessage" rows="3" 
                                            placeholder="Enter a log message to test parsing..."></textarea>
                                    </div>
                                    
                                    <div class="mb-3">
                                        <button type="button" class="btn btn-primary" onclick="testParsing()">
                                            <i class="fas fa-play"></i> Test Parsing
                                        </button>
                                        <button type="button" class="btn btn-secondary ms-2" onclick="loadSampleMessage()">
                                            <i class="fas fa-file-alt"></i> Load Sample
                                        </button>
                                    </div>
                                    
                                    <div id="testResults" class="d-none">
                                        <h6>Parsing Results</h6>
                                        <pre id="parsedOutput" class="bg-light p-3 rounded"></pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4">
                            <!-- Configuration Card -->
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-cog"></i> Configuration</h5>
                                </div>
                                <div class="card-body">
                                    <h6>Environment Variables</h6>
                                    <div class="mb-2">
                                        <small class="text-muted">SYSLOG_UDP_PORT</small><br>
                                        <code>${config.ingestion?.syslog?.udpPort || 514}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">SYSLOG_TCP_PORT</small><br>
                                        <code>${config.ingestion?.syslog?.tcpPort || 601}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">GELF_UDP_PORT</small><br>
                                        <code>${config.ingestion?.gelf?.udpPort || 12201}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">GELF_TCP_PORT</small><br>
                                        <code>${config.ingestion?.gelf?.tcpPort || 12202}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">BEATS_TCP_PORT</small><br>
                                        <code>${config.ingestion?.beats?.tcpPort || 5044}</code>
                                    </div>
                                    <div class="mb-2">
                                        <small class="text-muted">FLUENT_HTTP_PORT</small><br>
                                        <code>${config.ingestion?.fluent?.httpPort || 9880}</code>
                                    </div>
                                    
                                    <hr>
                                    
                                    <h6>Protocol Documentation</h6>
                                    <div class="list-group list-group-flush">
                                        <a href="#" class="list-group-item list-group-item-action" onclick="showProtocolHelp('syslog')">
                                            <i class="fas fa-book"></i> Syslog Setup
                                        </a>
                                        <a href="#" class="list-group-item list-group-item-action" onclick="showProtocolHelp('gelf')">
                                            <i class="fas fa-book"></i> GELF Setup
                                        </a>
                                        <a href="#" class="list-group-item list-group-item-action" onclick="showProtocolHelp('beats')">
                                            <i class="fas fa-book"></i> Beats Setup
                                        </a>
                                        <a href="#" class="list-group-item list-group-item-action" onclick="showProtocolHelp('fluent')">
                                            <i class="fas fa-book"></i> Fluent Bit Setup
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            let protocolChart;
            
            async function loadIngestionStats() {
                try {
                    const response = await fetch('/api/ingestion/status');
                    const data = await response.json();
                    
                    if (data.success) {
                        updateStatsGrid(data.stats);
                        updateProtocolChart(data.stats.messagesByProtocol);
                    }
                } catch (error) {
                    console.error('Failed to load ingestion stats:', error);
                }
            }
            
            function updateStatsGrid(stats) {
                const grid = document.getElementById('statsGrid');
                grid.innerHTML = \`
                    <div class="row text-center">
                        <div class="col-6 mb-3">
                            <h4 class="text-primary">\${stats.totalMessages.toLocaleString()}</h4>
                            <small class="text-muted">Total Messages</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h4 class="text-success">\${stats.connectionsActive}</h4>
                            <small class="text-muted">Active Connections</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h4 class="text-info">\${formatBytes(stats.bytesReceived)}</h4>
                            <small class="text-muted">Bytes Received</small>
                        </div>
                        <div class="col-6 mb-3">
                            <h4 class="text-warning">\${stats.errors}</h4>
                            <small class="text-muted">Parse Errors</small>
                        </div>
                    </div>
                \`;
            }
            
            function updateProtocolChart(messagesByProtocol) {
                const ctx = document.getElementById('protocolChart').getContext('2d');
                
                if (protocolChart) {
                    protocolChart.destroy();
                }
                
                const protocols = Object.keys(messagesByProtocol);
                const counts = Object.values(messagesByProtocol);
                
                protocolChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: protocols.map(p => p.replace('-', ' ').toUpperCase()),
                        datasets: [{
                            data: counts,
                            backgroundColor: ['#007bff', '#28a745', '#ffc107', '#17a2b8', '#6f42c1', '#e83e8c'],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }
            
            async function testParsing() {
                const protocol = document.getElementById('testProtocol').value;
                const message = document.getElementById('testMessage').value;
                
                if (!message.trim()) {
                    alert('Please enter a message to test');
                    return;
                }
                
                try {
                    const response = await fetch('/api/ingestion/test-parse', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ protocol, message })
                    });
                    
                    const result = await response.json();
                    
                    document.getElementById('testResults').classList.remove('d-none');
                    document.getElementById('parsedOutput').textContent = JSON.stringify(result, null, 2);
                    
                } catch (error) {
                    alert('Failed to test parsing: ' + error.message);
                }
            }
            
            function loadSampleMessage() {
                const protocol = document.getElementById('testProtocol').value;
                const samples = {
                    'syslog-rfc3164': '<34>Oct 11 22:14:15 mymachine su: su root failed for lonvick on /dev/pts/8',
                    'syslog-rfc5424': '<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [exampleSDID@32473 iut="3" eventSource="Application" eventID="1011"] BOMAn application event log entry',
                    'gelf': '{"version":"1.1","host":"example.org","short_message":"A short message","full_message":"A long message","timestamp":1385053862.3072,"level":1,"_user_id":9001,"_some_info":"foo","_some_env_var":"bar"}',
                    'beats': '{"@timestamp":"2023-01-01T12:00:00.000Z","beat":{"name":"filebeat","hostname":"web-server"},"message":"User login successful","fields":{"environment":"production"}}',
                    'fluent': '[1640995200, {"host":"web-server","message":"Request processed","level":"info","response_time":123}]',
                    'json': '{"timestamp":"2023-01-01T12:00:00Z","host":"web-server","level":"info","message":"Application started successfully"}'
                };
                
                document.getElementById('testMessage').value = samples[protocol] || '';
            }
            
            function showProtocolHelp(protocol) {
                const helpContent = {
                    syslog: 'Configure your syslog daemon to forward logs to this server:\\n\\nrsyslog: *.* @@server:601\\nudp: *.* @server:514',
                    gelf: 'Configure Graylog or applications to send GELF messages:\\n\\nHost: server\\nPort: 12201 (UDP) or 12202 (TCP)\\nProtocol: GELF',
                    beats: 'Configure Filebeat, Metricbeat, etc:\\n\\noutput.logstash:\\n  hosts: ["server:5044"]',
                    fluent: 'Configure Fluent Bit:\\n\\n[OUTPUT]\\n    name http\\n    host server\\n    port 9880\\n    uri /fluent/logs'
                };
                
                alert(helpContent[protocol] || 'Help not available for this protocol');
            }
            
            function formatBytes(bytes) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
            
            // Load Chart.js dynamically
            function loadChartJS() {
                if (typeof Chart === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
                    script.onload = function() {
                        loadIngestionStats();
                    };
                    document.head.appendChild(script);
                } else {
                    loadIngestionStats();
                }
            }
            
            // Load stats on page load
            document.addEventListener('DOMContentLoaded', () => {
                loadChartJS();
                
                // Refresh stats every 30 seconds
                setInterval(loadIngestionStats, 30000);
            });
        </script>
    `;

    res.send(getPageTemplate({
        pageTitle: 'Multi-Protocol Ingestion',
        pageIcon: 'fa-network-wired',
        activeNav: 'ingestion',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: '',
        req: req
    }));
});

module.exports = router;