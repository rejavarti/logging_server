/**
 * Logs Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Log viewing with advanced filtering
 * - Real-time log streaming
 * - Log export functionality
 * - Search and pagination
 */

const express = require('express');
const router = express.Router();

/**
 * Logs View Route - Main log viewing interface
 * GET /logs
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const level = req.query.level || '';
        const source = req.query.source || '';
        const search = req.query.search || '';
        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';

        const filters = {
            level: level || null,
            source: source || null,
            search: search || null,
            startDate: startDate || null,
            endDate: endDate || null
        };

        // Use actual DAL methods to get real data
        const offset = (page - 1) * limit;
        const logs = await req.dal.getLogs({
            level: filters.level,
            source: filters.source,
            search: filters.search,
            startDate: filters.startDate,
            endDate: filters.endDate,
            limit,
            offset
        });
        
        const totalResult = await req.dal.getLogsCount(filters);
        const total = totalResult.count || 0;
        const totalPages = Math.ceil(total / limit);
        const sources = await req.dal.getLogSources();
        const levels = ['debug', 'info', 'warning', 'error'];

        const contentBody = `
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('logs')" id="tab-logs" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-file-alt"></i> System Logs
                </button>
                <button onclick="switchTab('analytics')" id="tab-analytics" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-chart-bar"></i> Analytics
                </button>
                <button onclick="switchTab('advanced')" id="tab-advanced" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-search-plus"></i> Advanced Logs
                </button>
            </div>
        </div>

        <!-- System Logs Tab Content -->
        <div id="content-logs" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-file-alt"></i> System Logs</h3>
                    <div class="card-actions">
                        <button onclick="loadLogs()" class="btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button onclick="exportLogs()" class="btn btn-secondary">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding: 0;">
                    <!-- Filters Section -->
                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
                        <form id="filter-form" class="filter-form">
                            <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                                <div class="form-group">
                                    <label for="level"><i class="fas fa-layer-group"></i> Level</label>
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
                                
                                <div class="form-group">
                                    <label for="search"><i class="fas fa-search"></i> Search</label>
                                    <input type="text" id="search" name="search" class="form-control" 
                                           placeholder="Search in messages..." value="${search}">
                                </div>
                                
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
                        
                        <div class="form-group">
                            <label for="limit"><i class="fas fa-list-ol"></i> Per Page</label>
                            <select id="limit" name="limit" class="form-control">
                                <option value="25" ${limit === 25 ? 'selected' : ''}>25</option>
                                <option value="50" ${limit === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${limit === 100 ? 'selected' : ''}>100</option>
                                <option value="200" ${limit === 200 ? 'selected' : ''}>200</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="filter-actions">
                        <button type="submit" class="btn">
                            <i class="fas fa-search"></i> Apply Filters
                        </button>
                        <button type="button" onclick="toggleRealTime()" class="btn btn-secondary" id="realtime-btn">
                            <i class="fas fa-play"></i> Start Real-time
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Results Section -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-list"></i> Log Entries</h3>
                <div class="results-summary">
                    Showing ${logs.length} of ${total.toLocaleString()} entries
                    ${total > limit ? `(Page ${page} of ${totalPages})` : ''}
                </div>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table class="logs-table" id="logs-table">
                        <thead>
                            <tr>
                                <th style="width: 200px;">Timestamp</th>
                                <th style="width: 80px;">Level</th>
                                <th style="width: 120px;">Source</th>
                                <th>Message</th>
                                <th style="width: 100px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="logs-tbody">
                            ${logs.map(log => `
                                <tr class="log-row" data-level="${log.level}">
                                    <td class="timestamp-cell">
                                        <span class="timestamp" title="${log.timestamp}">
                                            ${formatTimestamp(log.timestamp)}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="level-badge ${log.level}">${log.level.toUpperCase()}</span>
                                    </td>
                                    <td class="source-cell">
                                        <span class="source" title="${log.source || 'System'}">${log.source || 'System'}</span>
                                    </td>
                                    <td class="message-cell">
                                        <div class="message-content">
                                            ${escapeHtml(log.message)}
                                        </div>
                                        ${log.metadata ? `<div class="metadata-preview">+${Object.keys(JSON.parse(log.metadata)).length} metadata fields</div>` : ''}
                                    </td>
                                    <td class="actions-cell">
                                        <button onclick="viewLogDetails(${log.id})" class="btn-small" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button onclick="copyLogMessage('${escapeHtml(log.message).replace(/'/g, "\\\'")}')" 
                                                class="btn-small" title="Copy Message">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                ${total === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No log entries found matching your criteria.</p>
                        <button onclick="clearFilters()" class="btn btn-secondary">Clear Filters</button>
                    </div>
                ` : ''}
            </div>
            
            ${totalPages > 1 ? `
                <div class="card-footer">
                    <nav class="pagination-nav">
                        <div class="pagination-info">
                            Page ${page} of ${totalPages} (${total.toLocaleString()} total entries)
                        </div>
                        <div class="pagination-controls">
                            ${page > 1 ? `<a href="?${new URLSearchParams({...req.query, page: page - 1}).toString()}" class="btn btn-secondary"><i class="fas fa-chevron-left"></i> Previous</a>` : ''}
                            ${page < totalPages ? `<a href="?${new URLSearchParams({...req.query, page: page + 1}).toString()}" class="btn btn-secondary">Next <i class="fas fa-chevron-right"></i></a>` : ''}
                        </div>
                    </nav>
                </div>
            ` : ''}
        </div>

        <!-- Log Detail Modal -->
        <div id="log-detail-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-info-circle"></i> Log Details</h3>
                    <button onclick="closeModal('log-detail-modal')" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="log-detail-content">
                    <!-- Log details will be loaded here -->
                </div>
            </div>
        </div>
        `;

        const additionalCSS = `
        .filter-form {
            background: var(--bg-secondary);
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }

        .filter-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .filter-actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-start;
            align-items: center;
            flex-wrap: wrap;
        }

        .results-summary {
            font-size: 0.9rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        .table-container {
            overflow-x: auto;
            max-height: 600px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
        }

        .logs-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
            background: var(--bg-primary);
        }

        .logs-table thead {
            background: var(--bg-secondary);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .logs-table thead th {
            padding: 1rem 0.75rem;
            text-align: left;
            font-weight: 600;
            color: var(--text-primary);
            border-bottom: 2px solid var(--border-color);
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .logs-table tbody tr {
            border-bottom: 1px solid var(--border-color);
            transition: background-color 0.2s ease;
        }

        .logs-table tbody tr:hover {
            background: var(--bg-secondary);
        }

        .logs-table tbody td {
            padding: 0.75rem;
            vertical-align: top;
            border-bottom: 1px solid var(--border-color);
        }

        .timestamp-cell {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .level-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            text-align: center;
            min-width: 60px;
            text-transform: uppercase;
        }

        .level-badge.debug {
            background: var(--bg-tertiary);
            color: var(--text-muted);
            border: 1px solid var(--border-color);
        }

        .level-badge.info {
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            color: #1e40af;
            border: 1px solid #93c5fd;
        }

        .level-badge.warning {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #78350f;
            border: 1px solid #fbbf24;
        }

        .level-badge.error {
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            color: #991b1b;
            border: 1px solid #fca5a5;
        }

        [data-theme="dark"] .level-badge.info, [data-theme="ocean"] .level-badge.info {
            background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
            color: #93c5fd;
            border: 1px solid #3b82f6;
        }

        [data-theme="dark"] .level-badge.warning, [data-theme="ocean"] .level-badge.warning {
            background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
            color: #fbbf24;
            border: 1px solid #f59e0b;
        }

        [data-theme="dark"] .level-badge.error, [data-theme="ocean"] .level-badge.error {
            background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
            color: #fca5a5;
            border: 1px solid #dc2626;
        }

        .source-cell {
            font-weight: 500;
            color: var(--text-secondary);
        }

        .message-cell {
            max-width: 400px;
        }

        .message-content {
            word-break: break-word;
            line-height: 1.4;
        }

        .metadata-preview {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 0.25rem;
            font-style: italic;
        }

        .actions-cell {
            text-align: center;
        }

        .btn-small {
            padding: 0.25rem 0.5rem;
            font-size: 0.75rem;
            border: none;
            background: var(--bg-secondary);
            color: var(--text-secondary);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            margin: 0 0.125rem;
        }

        .btn-small:hover {
            background: var(--accent-primary);
            color: white;
            transform: translateY(-1px);
        }

        .pagination-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }

        .pagination-info {
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        .pagination-controls {
            display: flex;
            gap: 0.5rem;
        }

        .empty-state {
            text-align: center;
            padding: 3rem;
            color: var(--text-muted);
        }

        .empty-state i {
            font-size: 3rem;
            opacity: 0.3;
            margin-bottom: 1rem;
        }

        .empty-state p {
            font-size: 1.1rem;
            margin-bottom: 1.5rem;
        }

        /* Modal Styles */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .modal.active {
            opacity: 1;
            visibility: visible;
        }

        .modal-content {
            background: var(--bg-primary);
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            border: 1px solid var(--border-color);
            max-width: 800px;
            width: 90%;
            max-height: 80vh;
            overflow: hidden;
            transform: translateY(20px);
            transition: transform 0.3s ease;
        }

        .modal.active .modal-content {
            transform: translateY(0);
        }

        .modal-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-secondary);
        }

        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
        }

        .btn-close {
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 1.2rem;
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .btn-close:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .modal-body {
            padding: 1.5rem;
            max-height: 60vh;
            overflow-y: auto;
        }

        /* Real-time indicator */
        .realtime-active {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .filter-grid {
                grid-template-columns: 1fr;
            }
            
            .pagination-nav {
                flex-direction: column;
                text-align: center;
            }
            
            .table-container {
                font-size: 0.8rem;
            }
            
            .logs-table thead th,
            .logs-table tbody td {
                padding: 0.5rem 0.25rem;
            }
        }
        `;

        const additionalJS = `
        let realtimeActive = false;
        let realtimeInterval;

        // Escape HTML to prevent XSS
        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }

        // Clear all filters
        function clearFilters() {
            document.getElementById('filter-form').reset();
            window.location.href = '/logs';
        }

        // Apply filters
        document.getElementById('filter-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const params = new URLSearchParams();
            
            for (let [key, value] of formData.entries()) {
                if (value.trim()) {
                    params.append(key, value);
                }
            }
            
            window.location.href = '/logs?' + params.toString();
        });

        // Toggle real-time updates
        function toggleRealTime() {
            const btn = document.getElementById('realtime-btn');
            
            if (!realtimeActive) {
                realtimeActive = true;
                btn.innerHTML = '<i class="fas fa-pause"></i> Stop Real-time';
                btn.classList.add('realtime-active');
                
                // Start polling for new logs
                realtimeInterval = setInterval(async () => {
                    try {
                        const response = await fetch('/api/logs/latest');
                        if (response.ok) {
                            const newLogs = await response.json();
                            if (newLogs.length > 0) {
                                prependNewLogs(newLogs);
                            }
                        }
                    } catch (error) {
                        console.error('Real-time update failed:', error);
                    }
                }, 2000);
                
                showToast('Real-time updates started', 'success');
            } else {
                realtimeActive = false;
                btn.innerHTML = '<i class="fas fa-play"></i> Start Real-time';
                btn.classList.remove('realtime-active');
                
                if (realtimeInterval) {
                    clearInterval(realtimeInterval);
                }
                
                showToast('Real-time updates stopped', 'info');
            }
        }

        // Prepend new logs to table
        function prependNewLogs(newLogs) {
            const tbody = document.getElementById('logs-tbody');
            const existingRows = tbody.querySelectorAll('tr');
            
            newLogs.forEach(log => {
                const row = document.createElement('tr');
                row.className = 'log-row';
                row.setAttribute('data-level', log.level);
                row.style.animation = 'slideInRight 0.3s ease';
                
                row.innerHTML = \`
                    <td class="timestamp-cell">
                        <span class="timestamp" title="\${log.timestamp}">
                            \${formatTimestamp(log.timestamp)}
                        </span>
                    </td>
                    <td>
                        <span class="level-badge \${log.level}">\${log.level.toUpperCase()}</span>
                    </td>
                    <td class="source-cell">
                        <span class="source" title="\${log.source || 'System'}">\${log.source || 'System'}</span>
                    </td>
                    <td class="message-cell">
                        <div class="message-content">
                            \${escapeHtml(log.message)}
                        </div>
                        \${log.metadata ? \`<div class="metadata-preview">+\${Object.keys(JSON.parse(log.metadata)).length} metadata fields</div>\` : ''}
                    </td>
                    <td class="actions-cell">
                        <button onclick="viewLogDetails(\${log.id})" class="btn-small" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="copyLogMessage('\${escapeHtml(log.message).replace(/'/g, "\\\\\'")}')" 
                                class="btn-small" title="Copy Message">
                            <i class="fas fa-copy"></i>
                        </button>
                    </td>
                \`;
                
                tbody.insertBefore(row, tbody.firstChild);
            });
            
            // Remove excess rows to maintain performance
            while (tbody.children.length > 100) {
                tbody.removeChild(tbody.lastChild);
            }
        }

        // View log details in modal
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
                console.error('Error loading log details:', error);
                showError('log-detail-content', 'Failed to load log details');
            }
        }

        // Display log details in modal
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
                                <span class="level-badge \${log.level}">\${log.level.toUpperCase()}</span>
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

        // Export logs
        async function exportLogs() {
            try {
                const params = new URLSearchParams(window.location.search);
                params.set('export', 'true');
                
                const response = await fetch('/api/logs/export?' + params.toString());
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`logs-export-\${new Date().toISOString().split('T')[0]}.csv\`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    showToast('Logs exported successfully', 'success');
                } else {
                    throw new Error('Export failed');
                }
            } catch (error) {
                console.error('Export error:', error);
                showToast('Failed to export logs', 'error');
            }
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
            if (realtimeInterval) {
                clearInterval(realtimeInterval);
            }
        });
        `;

        function escapeHtml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

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

        const getPageTemplate = req.app.get('pageTemplate');
        const html = getPageTemplate({
            pageTitle: 'Log Viewer',
            pageIcon: 'fa-file-alt',
            activeNav: 'logs',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        console.error('Logs route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Route - Get latest logs for real-time updates
 * GET /api/logs/latest
 */
router.get('/api/latest', async (req, res) => {
    try {
        const since = req.query.since || new Date(Date.now() - 10000).toISOString(); // Last 10 seconds
        const logs = await req.dal.getLogsSince(since);
        res.json(logs);
    } catch (error) {
        console.error('Latest logs API error:', error);
        res.status(500).json({ error: 'Failed to get latest logs' });
    }
});

/**
 * API Route - Get single log details
 * GET /api/logs/:id
 */
router.get('/api/:id', async (req, res) => {
    try {
        const log = await req.dal.getLogById(req.params.id);
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }
        res.json(log);
    } catch (error) {
        console.error('Log details API error:', error);
        res.status(500).json({ error: 'Failed to get log details' });
    }
});

/**
 * API Route - Export logs
 * GET /api/logs/export
 */
router.get('/api/export', async (req, res) => {
    try {
        const filters = {
            level: req.query.level || null,
            source: req.query.source || null,
            search: req.query.search || null,
            startDate: req.query.start_date || null,
            endDate: req.query.end_date || null
        };

        const logs = await req.dal.exportLogs(filters);
        
        // Generate CSV
        const csvHeader = 'ID,Timestamp,Level,Source,Message,Metadata\n';
        const csvRows = logs.map(log => {
            const fields = [
                log.id,
                log.timestamp,
                log.level,
                log.source || 'System',
                `"${(log.message || '').replace(/"/g, '""')}"`,
                `"${(log.metadata || '').replace(/"/g, '""')}"`
            ];
            return fields.join(',');
        });

        const csv = csvHeader + csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="logs-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);

    } catch (error) {
        console.error('Export logs API error:', error);
        res.status(500).json({ error: 'Failed to export logs' });
    }
});

module.exports = router;