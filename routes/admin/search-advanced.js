const express = require('express');
const { getPageTemplate } = require('../../configs/templates/base');
const router = express.Router();

// Advanced Search Management Page
router.get('/', (req, res) => {
    const pageContent = `
        <div class="container-fluid">
            <div class="row">
                <div class="col-12">
                    <h2><i class="fas fa-search"></i> Advanced Search & Query Language</h2>
                    <p class="text-muted">Elasticsearch-style DSL queries with fuzzy search and advanced analytics</p>
                    
                    <div class="row">
                        <div class="col-md-8">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h5><i class="fas fa-code"></i> Query Builder</h5>
                                    <div>
                                        <select id="queryTemplate" class="form-select form-select-sm" onchange="loadTemplate()">
                                            <option value="">Select Template</option>
                                            <option value="errors_last_hour">Errors (Last Hour)</option>
                                            <option value="security_events">Security Events</option>
                                            <option value="device_activity">Device Activity</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <ul class="nav nav-tabs" id="queryTabs" role="tablist">
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link active" id="simple-tab" data-bs-toggle="tab" data-bs-target="#simple" type="button">Simple Query</button>
                                        </li>
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link" id="dsl-tab" data-bs-toggle="tab" data-bs-target="#dsl" type="button">DSL Query</button>
                                        </li>
                                        <li class="nav-item" role="presentation">
                                            <button class="nav-link" id="fuzzy-tab" data-bs-toggle="tab" data-bs-target="#fuzzy" type="button">Fuzzy Search</button>
                                        </li>
                                    </ul>
                                    
                                    <div class="tab-content mt-3" id="queryTabContent">
                                        <div class="tab-pane fade show active" id="simple" role="tabpanel">
                                            <div class="mb-3">
                                                <label for="simpleQuery" class="form-label">Simple Query String</label>
                                                <input type="text" class="form-control" id="simpleQuery" placeholder="severity:error AND message:failed OR source:device123">
                                                <div class="form-text">
                                                    Examples: <code>severity:error</code>, <code>message:"login failed"</code>, <code>source:device* AND timestamp:>now-1h</code>
                                                </div>
                                            </div>
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <label for="simpleSize" class="form-label">Results</label>
                                                    <select class="form-select" id="simpleSize">
                                                        <option value="10">10 results</option>
                                                        <option value="20" selected>20 results</option>
                                                        <option value="50">50 results</option>
                                                        <option value="100">100 results</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="simpleSort" class="form-label">Sort</label>
                                                    <select class="form-select" id="simpleSort">
                                                        <option value="timestamp:desc" selected>Timestamp (newest first)</option>
                                                        <option value="timestamp:asc">Timestamp (oldest first)</option>
                                                        <option value="severity:desc">Severity (highest first)</option>
                                                        <option value="source:asc">Source (A-Z)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="tab-pane fade" id="dsl" role="tabpanel">
                                            <div class="mb-3">
                                                <label for="dslQuery" class="form-label">Elasticsearch-style DSL Query</label>
                                                <textarea class="form-control" id="dslQuery" rows="10" placeholder='{\n  "query": {\n    "bool": {\n      "must": [\n        { "term": { "severity": "error" } },\n        { "range": { "timestamp": { "gte": "now-1h" } } }\n      ]\n    }\n  },\n  "aggs": {\n    "by_source": {\n      "terms": { "field": "source", "size": 10 }\n    }\n  }\n}'></textarea>
                                            </div>
                                        </div>
                                        
                                        <div class="tab-pane fade" id="fuzzy" role="tabpanel">
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <label for="fuzzyText" class="form-label">Search Text</label>
                                                    <input type="text" class="form-control" id="fuzzyText" placeholder="authentication">
                                                </div>
                                                <div class="col-md-3">
                                                    <label for="fuzzyField" class="form-label">Field</label>
                                                    <select class="form-select" id="fuzzyField">
                                                        <option value="message" selected>Message</option>
                                                        <option value="source">Source</option>
                                                        <option value="category">Category</option>
                                                        <option value="device_id">Device ID</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-3">
                                                    <label for="fuzzyLevel" class="form-label">Fuzziness</label>
                                                    <select class="form-select" id="fuzzyLevel">
                                                        <option value="1">1 (strict)</option>
                                                        <option value="2" selected>2 (moderate)</option>
                                                        <option value="3">3 (loose)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="mt-3">
                                        <button type="button" class="btn btn-primary" onclick="executeSearch()">
                                            <i class="fas fa-search"></i> Execute Search
                                        </button>
                                        <button type="button" class="btn btn-secondary" onclick="clearSearch()">
                                            <i class="fas fa-eraser"></i> Clear
                                        </button>
                                        <button type="button" class="btn btn-info" onclick="showAnalytics()">
                                            <i class="fas fa-chart-line"></i> Analytics
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-info-circle"></i> Search Help</h5>
                                </div>
                                <div class="card-body">
                                    <h6>Simple Query Syntax:</h6>
                                    <ul class="small">
                                        <li><code>field:value</code> - Exact match</li>
                                        <li><code>field:"exact phrase"</code> - Phrase match</li>
                                        <li><code>field:value*</code> - Wildcard</li>
                                        <li><code>AND</code>, <code>OR</code> - Operators</li>
                                    </ul>
                                    
                                    <h6>DSL Query Features:</h6>
                                    <ul class="small">
                                        <li><code>bool</code> queries with must/should/must_not</li>
                                        <li><code>term</code>, <code>match</code>, <code>range</code> queries</li>
                                        <li><code>wildcard</code> and <code>fuzzy</code> queries</li>
                                        <li><code>aggregations</code> for analytics</li>
                                    </ul>
                                    
                                    <h6>Fuzzy Search:</h6>
                                    <ul class="small">
                                        <li>Handles typos and variations</li>
                                        <li>Adjustable fuzziness levels</li>
                                        <li>Field-specific search</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div class="card mt-3" id="suggestionsCard" style="display: none;">
                                <div class="card-header">
                                    <h6><i class="fas fa-lightbulb"></i> Suggestions</h6>
                                </div>
                                <div class="card-body">
                                    <div id="suggestionsList"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row mt-4">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h5><i class="fas fa-list"></i> Search Results</h5>
                                    <span id="searchInfo" class="text-muted"></span>
                                </div>
                                <div class="card-body">
                                    <div id="searchResults">
                                        <div class="text-center text-muted">
                                            <i class="fas fa-search fa-3x mb-3"></i>
                                            <p>Execute a search to see results here</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row mt-4" id="aggregationsSection" style="display: none;">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-bar"></i> Aggregations</h5>
                                </div>
                                <div class="card-body">
                                    <div id="aggregationsResults"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let templates = {};

            async function loadTemplates() {
                try {
                    const response = await fetch('/api/search/templates');
                    const data = await response.json();
                    if (data.success) {
                        templates = data.templates;
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Failed to load templates:', error);
                }
            }

            function loadTemplate() {
                const templateName = document.getElementById('queryTemplate').value;
                if (templateName && templates[templateName]) {
                    document.getElementById('dslQuery').value = JSON.stringify(templates[templateName], null, 2);
                    // Switch to DSL tab
                    document.getElementById('dsl-tab').click();
                }
            }

            async function executeSearch() {
                const activeTab = document.querySelector('.nav-link.active').id;
                let searchData = {};

                try {
                    if (activeTab === 'simple-tab') {
                        const query = document.getElementById('simpleQuery').value;
                        const size = document.getElementById('simpleSize').value;
                        const sort = document.getElementById('simpleSort').value;

                        if (!query) {
                            showToast('Please enter a search query', 'warning');
                            return;
                        }

                        const response = await fetch(\`/api/search/simple?q=\${encodeURIComponent(query)}&size=\${size}&sort=\${sort}\`);
                        searchData = await response.json();
                    } else if (activeTab === 'dsl-tab') {
                        const queryText = document.getElementById('dslQuery').value;
                        
                        if (!queryText) {
                            showToast('Please enter a DSL query', 'warning');
                            return;
                        }

                        let query;
                        try {
                            query = JSON.parse(queryText);
                        } catch (e) {
                            showToast('Invalid JSON in DSL query', 'error');
                            return;
                        }

                        const response = await fetch('/api/search/query', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query })
                        });
                        searchData = await response.json();
                    } else if (activeTab === 'fuzzy-tab') {
                        const text = document.getElementById('fuzzyText').value;
                        const field = document.getElementById('fuzzyField').value;
                        const fuzziness = document.getElementById('fuzzyLevel').value;

                        if (!text) {
                            showToast('Please enter text for fuzzy search', 'warning');
                            return;
                        }

                        const response = await fetch('/api/search/fuzzy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text, field, fuzziness: parseInt(fuzziness) })
                        });
                        searchData = await response.json();
                    }

                    if (searchData.success) {
                        displayResults(searchData);
                        showToast(\`Found \${searchData.hits.total} results in \${searchData.took}ms\`, 'success');
                    } else {
                        showToast(\`Search failed: \${searchData.error}\`, 'error');
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Search error:', error);
                    showToast('Search execution failed', 'error');
                }
            }

            function displayResults(data) {
                const resultsDiv = document.getElementById('searchResults');
                const infoSpan = document.getElementById('searchInfo');
                
                infoSpan.textContent = \`\${data.hits.total} results (\${data.took}ms)\`;
                
                if (data.hits.hits.length === 0) {
                    resultsDiv.innerHTML = '<div class="text-center text-muted"><i class="fas fa-exclamation-circle fa-2x mb-3"></i><p>No results found</p></div>';
                    return;
                }

                let html = '<div class="table-responsive"><table class="table table-striped table-hover"><thead><tr><th>Timestamp</th><th>Severity</th><th>Source</th><th>Message</th></tr></thead><tbody>';
                
                data.hits.hits.forEach(hit => {
                    const source = hit._source;
                    const severityClass = getSeverityClass(source.severity);
                    const timestamp = formatTimestamp(source.timestamp);
                    
                    html += \`
                        <tr>
                            <td>\${timestamp}</td>
                            <td><span class="badge \${severityClass}">\${source.severity}</span></td>
                            <td>\${source.source || 'N/A'}</td>
                            <td>\${source.message}</td>
                        </tr>
                    \`;
                });
                
                html += '</tbody></table></div>';
                resultsDiv.innerHTML = html;

                // Display aggregations if present
                if (data.aggregations && Object.keys(data.aggregations).length > 0) {
                    displayAggregations(data.aggregations);
                    document.getElementById('aggregationsSection').style.display = 'block';
                } else {
                    document.getElementById('aggregationsSection').style.display = 'none';
                }
            }

            function displayAggregations(aggregations) {
                const aggDiv = document.getElementById('aggregationsResults');
                let html = '<div class="row">';

                Object.entries(aggregations).forEach(([name, agg]) => {
                    html += '<div class="col-md-6 mb-3">';
                    html += \`<h6>\${name}</h6>\`;
                    
                    if (agg.buckets) {
                        html += '<ul class="list-group list-group-flush">';
                        agg.buckets.forEach(bucket => {
                            html += \`<li class="list-group-item d-flex justify-content-between align-items-center">
                                \${bucket.key}
                                <span class="badge bg-primary rounded-pill">\${bucket.doc_count}</span>
                            </li>\`;
                        });
                        html += '</ul>';
                    } else if (agg.value !== undefined) {
                        html += \`<div class="alert alert-info">\${agg.value}</div>\`;
                    }
                    
                    html += '</div>';
                });

                html += '</div>';
                aggDiv.innerHTML = html;
            }

            async function showAnalytics() {
                try {
                    const response = await fetch('/api/search/analytics?period=24h');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayAnalytics(data.analytics);
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Analytics error:', error);
                    showToast('Failed to load analytics', 'error');
                }
            }

            function displayAnalytics(analytics) {
                // Create analytics modal or section
                // This would show charts and statistics
                showToast('Analytics feature coming soon!', 'info');
            }

            function clearSearch() {
                document.getElementById('simpleQuery').value = '';
                document.getElementById('dslQuery').value = '';
                document.getElementById('fuzzyText').value = '';
                document.getElementById('searchResults').innerHTML = '<div class="text-center text-muted"><i class="fas fa-search fa-3x mb-3"></i><p>Execute a search to see results here</p></div>';
                document.getElementById('searchInfo').textContent = '';
                document.getElementById('aggregationsSection').style.display = 'none';
            }

            function getSeverityClass(severity) {
                const classes = {
                    critical: 'bg-danger',
                    error: 'bg-danger',
                    warning: 'bg-warning text-dark',
                    info: 'bg-info',
                    debug: 'bg-secondary'
                };
                return classes[severity] || 'bg-secondary';
            }

            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleString();
            }

            // showToast() is provided by base.js template

            // Load templates on page load
            document.addEventListener('DOMContentLoaded', loadTemplates);
        </script>
    `;

    res.send(getPageTemplate({
        pageTitle: 'Advanced Search',
        pageIcon: 'fa-search-plus',
        activeNav: 'search-advanced',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: '',
        req: req
    }));
});

module.exports = router;