/**
 * Search Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Advanced search interface
 * - Complex query building
 * - Search results with highlighting
 * - Saved searches functionality
 */

const express = require('express');
const { getPageTemplate } = require('../configs/templates/base');
const { escapeHtml, formatDate } = require('../utils/html-helpers');
const router = express.Router();

/**
 * Advanced Search Route - Complex search interface
 * GET /search
 */
router.get('/', async (req, res) => {
    try {
        const query = req.query.q || '';
        const level = req.query.level || '';
        const source = req.query.source || '';
        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';
        const regex = req.query.regex === 'true';
        const caseSensitive = req.query.case_sensitive === 'true';
        
        let results = [];
        let total = 0;
        let searchPerformed = false;
        
        // Search if query OR any filter is provided
        if (query || level || source || startDate || endDate) {
            searchPerformed = true;
            const searchParams = {
                query,
                level: level || null,
                source: source || null,
                startDate: startDate || null,
                endDate: endDate || null,
                regex,
                caseSensitive
            };
            
            const searchResult = await req.dal.advancedSearch(searchParams);
            results = searchResult.results;
            total = searchResult.total;
        }
        
        const sources = await req.dal.getLogSources().catch(() => []);
        const levels = ['debug', 'info', 'warning', 'error'];
        
        // Get saved searches from settings or database
        let savedSearches = [];
        try {
            // Query settings table for saved_searches JSON
            const savedSearchConfig = await req.dal.get(
                `SELECT value FROM settings WHERE key = 'saved_searches'`
            );
            if (savedSearchConfig && savedSearchConfig.value) {
                savedSearches = JSON.parse(savedSearchConfig.value);
            }
        } catch (err) {
            req.app.locals?.loggers?.system?.warn('Failed to load saved searches:', err.message);
        }

        const contentBody = `
        <!-- Saved Searches Section -->
        ${savedSearches.length > 0 ? `
        <div class="card mb-3">
            <div class="card-header">
                <h3><i class="fas fa-star"></i> Saved Searches</h3>
            </div>
            <div class="card-body">
                <div class="saved-searches">
                    ${savedSearches.map(search => `
                        <div class="saved-search-item">
                            <div class="search-info">
                                <strong>${escapeHtml(search.name)}</strong>
                                <span class="search-query">${escapeHtml(search.query)}</span>
                            </div>
                            <div class="search-actions">
                                <button onclick="loadSavedSearch(${search.id})" class="btn-small">
                                    <i class="fas fa-play"></i> Run
                                </button>
                                <button onclick="deleteSavedSearch(${search.id})" class="btn-small btn-danger">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Advanced Search Form -->
        <div class="card mb-3">
            <div class="card-header">
                <h3><i class="fas fa-search-plus"></i> Advanced Search</h3>
                <div class="card-actions">
                    <button onclick="clearSearch()" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Clear
                    </button>
                    ${query ? `<button onclick="saveCurrentSearch()" class="btn"><i class="fas fa-star"></i> Save Search</button>` : ''}
                </div>
            </div>
            <div class="card-body">
                <form id="search-form" class="advanced-search-form">
                    <div class="search-main">
                        <div class="form-group">
                            <label for="query"><i class="fas fa-search"></i> Search Query</label>
                            <input type="text" id="query" name="q" class="form-control search-input" 
                                   placeholder="Enter search terms, keywords, or patterns..." value="${escapeHtml(query)}"
                                   autocomplete="off">
                            <small class="form-help">
                                <strong>Search Tips:</strong> Use quotes for exact phrases, + for required terms, - to exclude terms.
                                Enable regex for advanced pattern matching.
                            </small>
                        </div>
                        
                        <div class="search-options">
                            <div class="search-option">
                                <input type="checkbox" id="regex" name="regex" ${regex ? 'checked' : ''}>
                                <label for="regex"><i class="fas fa-code"></i> Regex Mode</label>
                            </div>
                            <div class="search-option">
                                <input type="checkbox" id="case_sensitive" name="case_sensitive" ${caseSensitive ? 'checked' : ''}>
                                <label for="case_sensitive"><i class="fas fa-font"></i> Case Sensitive</label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="search-filters">
                        <div class="filter-row">
                            <div class="form-group">
                                <label for="level"><i class="fas fa-layer-group"></i> Log Level</label>
                                <select id="level" name="level" class="form-control">
                                    <option value="">All Levels</option>
                                    ${levels.map(l => `<option value="${l}" ${level === l ? 'selected' : ''}>${l.toUpperCase()}</option>`).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="source"><i class="fas fa-server"></i> Source</label>
                                <select id="source" name="source" class="form-control">
                                    <option value="">All Sources</option>
                                    ${sources.map(s => `<option value="${s}" ${source === s ? 'selected' : ''}>${s}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="filter-row">
                            <div class="form-group">
                                <label for="start_date"><i class="fas fa-calendar-alt"></i> Start Date</label>
                                <input type="datetime-local" id="start_date" name="start_date" 
                                       class="form-control" value="${startDate}">
                            </div>
                            
                            <div class="form-group">
                                <label for="end_date"><i class="fas fa-calendar-alt"></i> End Date</label>
                                <input type="datetime-local" id="end_date" name="end_date" 
                                       class="form-control" value="${endDate}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="search-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-search"></i> Search Logs
                        </button>
                        <button type="button" onclick="showQueryHelp()" class="btn btn-secondary">
                            <i class="fas fa-question-circle"></i> Query Help
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Search Results -->
        ${searchPerformed ? `
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-list-alt"></i> Search Results</h3>
                <div class="results-summary">
                    ${total > 0 ? `Found ${(total || 0).toLocaleString()} matching entries` : 'No results found'}
                </div>
            </div>
            <div class="card-body">
                ${results.length > 0 ? `
                <div class="search-results">
                    ${results.map((log, index) => `
                        <div class="result-item" data-index="${index}">
                            <div class="result-header">
                                <div class="result-meta">
                                    <span class="timestamp">${formatDate(log.timestamp)}</span>
                                    <span class="level-badge ${log.level}">${log.level.toUpperCase()}</span>
                                    <span class="source">${log.source || 'System'}</span>
                                </div>
                                <div class="result-actions">
                                    <button onclick="viewLogDetails(${log.id})" class="btn-small" title="View Details">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button onclick="copyLogMessage('${escapeHtml(log.message).replace(/'/g, "\\\'")}')" 
                                            class="btn-small" title="Copy Message">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="result-content">
                                <div class="message-highlight">
                                    ${highlightSearchTerms(log.message, query, regex, caseSensitive)}
                                </div>
                                ${log.metadata ? `
                                    <div class="metadata-preview">
                                        <i class="fas fa-database"></i> 
                                        ${Object.keys(JSON.parse(log.metadata)).length} metadata fields
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${total > 100 ? `
                <div class="search-pagination">
                    <p class="text-muted">
                        Showing first 100 results of ${(total || 0).toLocaleString()} matches. 
                        Refine your search for more specific results.
                    </p>
                </div>
                ` : ''}
                ` : `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No logs found matching your search criteria.</p>
                    <div class="empty-suggestions">
                        <p><strong>Try:</strong></p>
                        <ul>
                            <li>Using broader search terms</li>
                            <li>Checking your date range</li>
                            <li>Removing filters</li>
                            <li>Using regex mode for pattern matching</li>
                        </ul>
                    </div>
                </div>
                `}
            </div>
        </div>
        ` : `
        <!-- Search Instructions -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-lightbulb"></i> Search Instructions</h3>
            </div>
            <div class="card-body">
                <div class="search-instructions">
                    <div class="instruction-section">
                        <h4><i class="fas fa-search"></i> Basic Search</h4>
                        <ul>
                            <li><strong>Simple terms:</strong> <code>error database</code> - Find logs containing both words</li>
                            <li><strong>Exact phrases:</strong> <code>"connection failed"</code> - Find exact phrase</li>
                            <li><strong>Required terms:</strong> <code>+error +database</code> - Both terms must be present</li>
                            <li><strong>Exclude terms:</strong> <code>error -warning</code> - Include error, exclude warning</li>
                        </ul>
                    </div>
                    
                    <div class="instruction-section">
                        <h4><i class="fas fa-code"></i> Regular Expression Search</h4>
                        <ul>
                            <li><strong>Pattern matching:</strong> <code>\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}</code> - Find IP addresses</li>
                            <li><strong>Word boundaries:</strong> <code>\\berror\\b</code> - Find whole word "error"</li>
                            <li><strong>Case insensitive:</strong> <code>(?i)error</code> - Case insensitive matching</li>
                            <li><strong>Alternation:</strong> <code>(error|warning|critical)</code> - Any of these words</li>
                        </ul>
                    </div>
                    
                    <div class="instruction-section">
                        <h4><i class="fas fa-filter"></i> Advanced Filtering</h4>
                        <ul>
                            <li>Combine search terms with log level filters</li>
                            <li>Filter by specific sources or systems</li>
                            <li>Use date ranges for temporal analysis</li>
                            <li>Save frequently used searches for quick access</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        `}

        <!-- Save Search Modal -->
        <div id="save-search-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-star"></i> Save Search</h3>
                    <button onclick="closeModal('save-search-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="save-search-form">
                        <div class="form-group">
                            <label for="search-name"><i class="fas fa-tag"></i> Search Name</label>
                            <input type="text" id="search-name" name="name" class="form-control" 
                                   placeholder="Enter a name for this search..." required>
                        </div>
                        
                        <div class="form-group">
                            <label for="search-description"><i class="fas fa-comment"></i> Description</label>
                            <textarea id="search-description" name="description" class="form-control" 
                                      placeholder="Optional description..." rows="3"></textarea>
                        </div>
                        
                        <div class="search-preview">
                            <strong>Search Query:</strong> <code id="search-preview-query"></code>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="btn">
                                <i class="fas fa-save"></i> Save Search
                            </button>
                            <button type="button" onclick="closeModal('save-search-modal')" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Query Help Modal -->
        <div id="query-help-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-question-circle"></i> Search Query Help</h3>
                    <button onclick="closeModal('query-help-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="help-content">
                        <div class="help-section">
                            <h4>Basic Search Operators</h4>
                            <table class="help-table">
                                <tbody>
                                    <tr><td><code>"exact phrase"</code></td><td>Search for exact phrase</td></tr>
                                    <tr><td><code>+required</code></td><td>Term must be present</td></tr>
                                    <tr><td><code>-excluded</code></td><td>Term must not be present</td></tr>
                                    <tr><td><code>term1 term2</code></td><td>Either term can be present</td></tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="help-section">
                            <h4>Regular Expression Patterns</h4>
                            <table class="help-table">
                                <tbody>
                                    <tr><td><code>\\d+</code></td><td>One or more digits</td></tr>
                                    <tr><td><code>\\w+</code></td><td>One or more word characters</td></tr>
                                    <tr><td><code>.*</code></td><td>Any characters (wildcard)</td></tr>
                                    <tr><td><code>^start</code></td><td>Line starts with "start"</td></tr>
                                    <tr><td><code>end$</code></td><td>Line ends with "end"</td></tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="help-section">
                            <h4>Common Examples</h4>
                            <table class="help-table">
                                <tbody>
                                    <tr><td><code>"connection failed" +database</code></td><td>Exact phrase with required term</td></tr>
                                    <tr><td><code>\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}</code></td><td>IP addresses (regex mode)</td></tr>
                                    <tr><td><code>(error|warning|critical)</code></td><td>Any of these severity levels</td></tr>
                                    <tr><td><code>user\\s+\\w+\\s+login</code></td><td>User login patterns</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        // escapeHtml() imported from utils/html-helpers

        function formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(timestamp);
                return date.toLocaleString('en-US', {
                    timeZone: req.systemSettings.timezone || 'America/Edmonton',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            } catch (error) {
                return timestamp;
            }
        }

        function highlightSearchTerms(text, query, isRegex, caseSensitive) {
            if (!query || !text) return escapeHtml(text);
            
            let escaped = escapeHtml(text);
            
            try {
                if (isRegex) {
                    const flags = caseSensitive ? 'g' : 'gi';
                    const regex = new RegExp(query, flags);
                    escaped = escaped.replace(regex, '<mark>$&</mark>');
                } else {
                    // Simple text highlighting
                    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
                    terms.forEach(term => {
                        const flags = caseSensitive ? 'g' : 'gi';
                        const regex = new RegExp(escapeRegex(term), flags);
                        escaped = escaped.replace(regex, '<mark>$&</mark>');
                    });
                }
            } catch (error) {
                // If regex is invalid, fall back to plain text
                req.app.locals?.loggers?.system?.error('Highlight error:', error);
            }
            
            return escaped;
        }

        function escapeRegex(text) {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        const additionalCSS = `
        .saved-searches {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .saved-search-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }

        .saved-search-item:hover {
            background: var(--bg-tertiary);
            transform: translateY(-1px);
        }

        .search-info strong {
            display: block;
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .search-query {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.85rem;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
        }

        .search-actions {
            display: flex;
            gap: 0.5rem;
        }

        .advanced-search-form {
            background: var(--bg-secondary);
            padding: 2rem;
            border-radius: 12px;
        }

        .search-main {
            margin-bottom: 2rem;
        }

        .search-input {
            font-size: 1.1rem;
            padding: 1rem;
            border-radius: 8px;
        }

        .form-help {
            margin-top: 0.5rem;
            padding: 0.75rem;
            background: var(--bg-tertiary);
            border-radius: 6px;
            border-left: 3px solid var(--accent-primary);
        }

        .search-options {
            display: flex;
            gap: 2rem;
            margin-top: 1rem;
            padding: 1rem;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .search-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .search-option input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }

        .search-option label {
            margin: 0;
            font-size: 0.95rem;
            color: var(--text-secondary);
            cursor: pointer;
        }

        .search-filters {
            margin-bottom: 2rem;
            padding: 1.5rem;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .filter-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 1rem;
        }

        .filter-row:last-child {
            margin-bottom: 0;
        }

        .search-results {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .result-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.2s ease;
        }

        .result-item:hover {
            background: var(--bg-tertiary);
            transform: translateY(-1px);
            box-shadow: var(--shadow-light);
        }

        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .result-meta {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .result-meta .timestamp {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .result-meta .source {
            font-size: 0.9rem;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .result-actions {
            display: flex;
            gap: 0.5rem;
        }

        .result-content {
            line-height: 1.5;
        }

        .message-highlight {
            color: var(--text-primary);
            margin-bottom: 0.5rem;
        }

        .message-highlight mark {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: #78350f;
            padding: 0.125rem 0.25rem;
            border-radius: 3px;
            font-weight: 600;
        }

        [data-theme="dark"] .message-highlight mark, 
        [data-theme="ocean"] .message-highlight mark {
            background: linear-gradient(135deg, #92400e 0%, #78350f 100%);
            color: #fbbf24;
        }

        .metadata-preview {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-style: italic;
        }

        .search-pagination {
            text-align: center;
            padding: 1.5rem;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-top: 1rem;
        }

        .search-instructions {
            display: grid;
            gap: 2rem;
        }

        .instruction-section {
            padding: 1.5rem;
            background: var(--bg-secondary);
            border-radius: 8px;
            border-left: 4px solid var(--accent-primary);
        }

        .instruction-section h4 {
            color: var(--text-primary);
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .instruction-section ul {
            list-style: none;
            padding: 0;
        }

        .instruction-section li {
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--border-color);
        }

        .instruction-section li:last-child {
            border-bottom: none;
        }

        .instruction-section code {
            background: var(--bg-tertiary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            color: var(--accent-primary);
            font-weight: 600;
        }

        .search-preview {
            margin: 1rem 0;
            padding: 1rem;
            background: var(--bg-tertiary);
            border-radius: 6px;
            border-left: 3px solid var(--accent-primary);
        }

        .search-preview code {
            background: var(--bg-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            color: var(--text-primary);
        }

        .help-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }

        .help-table td {
            padding: 0.5rem;
            border-bottom: 1px solid var(--border-color);
            vertical-align: top;
        }

        .help-table td:first-child {
            width: 40%;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .help-table code {
            background: var(--bg-tertiary);
            padding: 0.125rem 0.25rem;
            border-radius: 3px;
            font-size: 0.9em;
        }

        .empty-suggestions {
            text-align: left;
            margin-top: 1.5rem;
            padding: 1rem;
            background: var(--bg-secondary);
            border-radius: 8px;
        }

        .empty-suggestions ul {
            list-style: disc;
            margin-left: 1.5rem;
            margin-top: 0.5rem;
        }

        .empty-suggestions li {
            margin-bottom: 0.25rem;
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .filter-row {
                grid-template-columns: 1fr;
            }
            
            .result-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
            
            .search-options {
                flex-direction: column;
                gap: 1rem;
            }
        }

        /* Modal Styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: var(--shadow-large);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-secondary);
            border-radius: 12px 12px 0 0;
        }

        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1.25rem;
        }

        .btn-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--text-muted);
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 6px;
            transition: all 0.2s ease;
        }

        .btn-close:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .modal-body {
            padding: 1.5rem;
        }

        body.modal-open {
            overflow: hidden;
        }
        `;

        const additionalJS = `
        // Search form handling
        document.getElementById('search-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const params = new URLSearchParams();
            
            for (let [key, value] of formData.entries()) {
                if (value.trim()) {
                    params.append(key, value);
                }
            }
            
            // Add checkbox values
            if (document.getElementById('regex').checked) {
                params.append('regex', 'true');
            }
            if (document.getElementById('case_sensitive').checked) {
                params.append('case_sensitive', 'true');
            }
            
            // Allow search with filters only (no query required)
            const hasQuery = params.get('q');
            const hasFilters = params.get('level') || params.get('source') || params.get('start_date') || params.get('end_date');
            
            if (!hasQuery && !hasFilters) {
                showToast('Please enter a search query or select at least one filter', 'warning');
                return;
            }
            
            // Persist filters before navigating
            persistSearchFilters();
            window.location.href = '/search?' + params.toString();
        });

        // Clear search
        function clearSearch() {
            document.getElementById('search-form').reset();
            ['query','level','source','start_date','end_date','regex','case_sensitive'].forEach(k => sessionStorage.removeItem('search-'+k));
            window.location.href = '/search';
        }

        // Show query help modal
        function showQueryHelp() {
            openModal('query-help-modal');
        }

        // Save current search
        function saveCurrentSearch() {
            const query = document.getElementById('query').value;
            if (!query) {
                showToast('No search query to save', 'warning');
                return;
            }
            
            document.getElementById('search-preview-query').textContent = query;
            openModal('save-search-modal');
        }

        // Modal management functions
        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'flex';
                document.body.classList.add('modal-open');
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }

        // Close modal on background click
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                closeModal(e.target.id);
            }
        });

        // Handle save search form
        document.getElementById('save-search-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const params = new URLSearchParams(window.location.search);
            
            const searchData = {
                name: formData.get('name'),
                description: formData.get('description'),
                query: params.get('q'),
                level: params.get('level'),
                source: params.get('source'),
                startDate: params.get('start_date'),
                endDate: params.get('end_date'),
                regex: params.get('regex') === 'true',
                caseSensitive: params.get('case_sensitive') === 'true'
            };
            
            try {
                const response = await fetch('/api/search/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(searchData)
                , credentials: 'same-origin' });
                
                if (response.ok) {
                    showToast('Search saved successfully', 'success');
                    closeModal('save-search-modal');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error('Failed to save search');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Save search error:', error);
                showToast('Failed to save search', 'error');
            }
        });

        // Load saved search
        async function loadSavedSearch(searchId) {
            try {
                const response = await fetch(\`/api/search/saved/\${searchId}\`);
                if (response.ok) {
                    const search = await response.json();
                    
                    const params = new URLSearchParams();
                    if (search.query) params.append('q', search.query);
                    if (search.level) params.append('level', search.level);
                    if (search.source) params.append('source', search.source);
                    if (search.startDate) params.append('start_date', search.startDate);
                    if (search.endDate) params.append('end_date', search.endDate);
                    if (search.regex) params.append('regex', 'true');
                    if (search.caseSensitive) params.append('case_sensitive', 'true');
                    
                    window.location.href = '/search?' + params.toString();
                } else {
                    throw new Error('Failed to load saved search');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Load saved search error:', error);
                showToast('Failed to load saved search', 'error');
            }
        }

        // Delete saved search
        async function deleteSavedSearch(searchId) {
            if (!confirm('Are you sure you want to delete this saved search?')) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/search/saved/\${searchId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showToast('Search deleted successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error('Failed to delete search');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Delete saved search error:', error);
                showToast('Failed to delete search', 'error');
            }
        }

        // View log details (shared with logs page)
        async function viewLogDetails(logId) {
            try {
                showLoading('log-detail-content');
                openModal('log-detail-modal');
                
                const response = await fetch(\`/api/logs/\${logId}\`);
                if (response.ok) {
                    const log = await response.json();
                    displayLogDetails(log);
                } else {
                    throw new Error('Failed to load log details');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Error loading log details:', error);
                showError('log-detail-content', 'Failed to load log details');
            }
        }

        // Display log details (shared with logs page)  
        function displayLogDetails(log) {
            const content = document.getElementById('log-detail-content');
            const metadata = log.metadata ? JSON.parse(log.metadata) : {};
            
            content.innerHTML = \`
                <div class="log-detail">
                    <div class="detail-section">
                        <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>ID:</label>
                                <span>\${log.id}</span>
                            </div>
                            <div class="detail-item">
                                <label>Timestamp:</label>
                                <span>\${formatTimestamp(log.timestamp)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Level:</label>
                                <span class="level-badge \${log.level || 'info'}">\${(log.level || 'UNKNOWN').toUpperCase()}</span>
                            </div>
                            <div class="detail-item">
                                <label>Source:</label>
                                <span>\${log.source || 'System'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <h4><i class="fas fa-comment-alt"></i> Message</h4>
                        <div class="message-display">
                            \${escapeHtml(log.message)}
                        </div>
                        <div class="detail-actions">
                            <button onclick="copyToClipboard('\${escapeHtml(log.message).replace(/'/g, "\\\\\'")}')" class="btn btn-secondary">
                                <i class="fas fa-copy"></i> Copy Message
                            </button>
                        </div>
                    </div>
                    
                    \${Object.keys(metadata).length > 0 ? \`
                        <div class="detail-section">
                            <h4><i class="fas fa-database"></i> Metadata (\${Object.keys(metadata).length} fields)</h4>
                            <div class="metadata-display">
                                <pre><code>\${JSON.stringify(metadata, null, 2)}</code></pre>
                            </div>
                            <div class="detail-actions">
                                <button onclick="copyToClipboard('\${JSON.stringify(metadata, null, 2)}')" class="btn btn-secondary">
                                    <i class="fas fa-copy"></i> Copy Metadata
                                </button>
                            </div>
                        </div>
                    \` : ''}
                </div>
            \`;
        }

        // Copy log message
        function copyLogMessage(message) {
            copyToClipboard(message);
        }

        // Focus search input on page load
        document.addEventListener('DOMContentLoaded', function() {
            const queryInput = document.getElementById('query');
            if (queryInput && !queryInput.value) {
                queryInput.focus();
            }
        });

        // Auto-save search inputs to localStorage
        const searchInputs = ['query', 'level', 'source', 'start_date', 'end_date'];
        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                // Load saved value
                const savedValue = localStorage.getItem(\`search-\${inputId}\`);
                if (savedValue && !input.value) {
                    input.value = savedValue;
                }
                
                // Save on change
                input.addEventListener('change', function() {
                    if (this.value) {
                        localStorage.setItem(\`search-\${inputId}\`, this.value);
                    } else {
                        localStorage.removeItem(\`search-\${inputId}\`);
                    }
                });
            }
        });
        // --- Added sessionStorage persistence (non-breaking alongside existing localStorage) ---
        function persistSearchFilters() {
            const map = {
                query: document.getElementById('query'),
                level: document.getElementById('level'),
                source: document.getElementById('source'),
                start_date: document.getElementById('start_date'),
                end_date: document.getElementById('end_date'),
                regex: document.getElementById('regex'),
                case_sensitive: document.getElementById('case_sensitive')
            };
            Object.entries(map).forEach(([k, el]) => {
                if (!el) return;
                if (el.type === 'checkbox') {
                    sessionStorage.setItem('search-'+k, el.checked ? '1' : '');
                } else {
                    sessionStorage.setItem('search-'+k, el.value.trim());
                }
            });
        }

        function restoreSearchFilters() {
            ['query','level','source','start_date','end_date','regex','case_sensitive'].forEach(k => {
                const el = document.getElementById(k);
                const val = sessionStorage.getItem('search-'+k);
                if (!el || !val) return;
                if (el.type === 'checkbox') {
                    el.checked = val === '1' || el.checked;
                } else if (!el.value) {
                    el.value = val;
                }
            });
        }

        document.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const hasParams = [...urlParams.keys()].some(k => ['q','level','source','start_date','end_date','regex','case_sensitive'].includes(k));
            if (!hasParams) {
                restoreSearchFilters();
            } else {
                persistSearchFilters();
            }
            // Live persistence
            ['query','level','source','start_date','end_date','regex','case_sensitive'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const evt = el.type === 'checkbox' ? 'change' : 'input';
                el.addEventListener(evt, debounce(persistSearchFilters, 300));
            });
        });
        `;

        const html = getPageTemplate({
            pageTitle: 'Advanced Search',
            pageIcon: 'fa-search-plus',
            activeNav: 'search',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Search route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Route - Save search
 * POST /api/search/save
 */
router.post('/api/save', async (req, res) => {
    try {
        const searchData = {
            ...req.body,
            userId: req.user.id
        };
        
        const savedSearch = await req.dal.createSavedSearch(searchData);
        res.json(savedSearch);
        
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Save search API error:', error);
        res.status(500).json({ error: 'Failed to save search' });
    }
});

/**
 * API Route - Get saved search
 * GET /api/search/saved/:id
 */
router.get('/api/saved/:id', async (req, res) => {
    try {
        const search = await req.dal.getSavedSearchById(req.params.id, req.user.id);
        if (!search) {
            return res.status(404).json({ error: 'Search not found' });
        }
        res.json(search);
        
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Get saved search API error:', error);
        res.status(500).json({ error: 'Failed to get saved search' });
    }
});

/**
 * API Route - Delete saved search
 * DELETE /api/search/saved/:id
 */
router.delete('/api/saved/:id', async (req, res) => {
    try {
        await req.dal.deleteSavedSearch(req.params.id, req.user.id);
        res.json({ success: true });
        
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Delete saved search API error:', error);
        res.status(500).json({ error: 'Failed to delete saved search' });
    }
});

module.exports = router;