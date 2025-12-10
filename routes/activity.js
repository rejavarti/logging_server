/**
 * Activity Routes Module
 * Extracted from monolithic server.js with 100% functionality preservation
 * 
 * Handles:
 * - Activity monitoring and logging
 * - User action tracking
 * - System event timeline
 * - Activity analytics and reporting
 */

const express = require('express');
const { getPageTemplate } = require('../configs/templates/base');
const { escapeHtml } = require('../utils/html-helpers');
const router = express.Router();

/**
 * Activity Monitoring Route - Activity timeline and analytics
 * GET /activity
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const type = req.query.type || '';
        const user = req.query.user || '';
        const startDate = req.query.start_date || '';
        const endDate = req.query.end_date || '';

        const filters = {
            type: type || null,
            user: user || null,
            startDate: startDate || null,
            endDate: endDate || null
        };

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // PERFORMANCE: Send HTML shell immediately, load data via AJAX
        const activities = [];
        const total = 0;
        const totalPages = 0;
        
        const activityStats = {
            totalActivities: 0,
            activitiesToday: 0,
            activeUsers: 0,
            mostActiveAction: 'N/A'
        };
        
        const users = [];
        const types = [];

        const contentBody = `
        <!-- Activity Stats -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Total Activities</div>
                    <div class="stat-icon">
                        <i class="fas fa-history"></i>
                    </div>
                </div>
                <div class="stat-value">${(activityStats.totalActivities || 0).toLocaleString()}</div>
                <div class="stat-label">all time</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Today's Activities</div>
                    <div class="stat-icon">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                </div>
                <div class="stat-value">${(activityStats.activitiesToday || 0).toLocaleString()}</div>
                <div class="stat-label">activities today</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Active Users</div>
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                <div class="stat-value">${activityStats.activeUsers}</div>
                <div class="stat-label">last 24 hours</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Most Active</div>
                    <div class="stat-icon">
                        <i class="fas fa-user-crown"></i>
                    </div>
                </div>
                <div class="stat-value">${activityStats.mostActiveAction || 'N/A'}</div>
                <div class="stat-label">action type</div>
            </div>
        </div>

        <!-- Activity Filters -->
        <div class="card mb-3">
            <div class="card-header">
                <h3><i class="fas fa-filter"></i> Activity Filters</h3>
                <div class="card-actions">
                    <button onclick="clearActivityFilters()" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Clear Filters
                    </button>
                    <button onclick="exportActivity()" class="btn">
                        <i class="fas fa-download"></i> Export Activity
                    </button>
                </div>
            </div>
            <div class="card-body">
                <form id="activity-filter-form" class="filter-form">
                    <div class="filter-grid">
                        <div class="form-group">
                            <label for="activity-type"><i class="fas fa-layer-group"></i> Activity Type</label>
                            <select id="activity-type" name="type" class="form-control">
                                <option value="">All Types</option>
                                ${types.map(t => `<option value="${t}" ${type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="activity-user"><i class="fas fa-user"></i> User</label>
                            <select id="activity-user" name="user" class="form-control">
                                <option value="">All Users</option>
                                ${users.map(u => `<option value="${u.id}" ${user === u.id.toString() ? 'selected' : ''}>${u.username}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="activity-start-date"><i class="fas fa-calendar-alt"></i> Start Date</label>
                            <input type="datetime-local" id="activity-start-date" name="start_date" 
                                   class="form-control" value="${startDate}">
                        </div>
                        
                        <div class="form-group">
                            <label for="activity-end-date"><i class="fas fa-calendar-alt"></i> End Date</label>
                            <input type="datetime-local" id="activity-end-date" name="end_date" 
                                   class="form-control" value="${endDate}">
                        </div>
                        
                        <div class="form-group">
                            <label for="activity-limit"><i class="fas fa-list-ol"></i> Per Page</label>
                            <select id="activity-limit" name="limit" class="form-control">
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
                        <button type="button" onclick="toggleRealTimeActivity()" class="btn btn-secondary" id="realtime-activity-btn">
                            <i class="fas fa-play"></i> Start Real-time
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Activity Timeline -->
        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-timeline"></i> Activity Timeline</h3>
                <div class="results-summary">
                    Showing ${activities.length} of ${(total || 0).toLocaleString()} activities
                    ${total > limit ? `(Page ${page} of ${totalPages})` : ''}
                </div>
            </div>
            <div class="card-body" style="padding: 0;">
                ${activities.length > 0 ? `
                <div class="table-responsive">
                    <table class="log-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Type</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Target</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${activities.map(activity => {
                                // Parse details JSON to show helpful info
                                let detailsPreview = '-';
                                let hasDetails = false;
                                const detailsStr = activity.details || activity.metadata || '';
                                if (detailsStr) {
                                    try {
                                        // Handle double-encoded JSON
                                        let parsed = detailsStr;
                                        if (typeof parsed === 'string') {
                                            parsed = JSON.parse(parsed);
                                            // Check if still a string (double-encoded)
                                            if (typeof parsed === 'string') {
                                                parsed = JSON.parse(parsed);
                                            }
                                        }
                                        hasDetails = true;
                                        // Build a short preview of useful info
                                        const previewParts = [];
                                        if (parsed.ip) previewParts.push('IP: ' + parsed.ip);
                                        if (parsed.username) previewParts.push(parsed.username);
                                        if (parsed.reason) previewParts.push(parsed.reason);
                                        if (parsed.method) previewParts.push(parsed.method);
                                        if (parsed.filename) previewParts.push(parsed.filename);
                                        if (parsed.changes) previewParts.push(parsed.changes + ' changes');
                                        detailsPreview = previewParts.length > 0 ? previewParts.slice(0, 2).join(', ') : 'View';
                                    } catch (e) {
                                        hasDetails = detailsStr.length > 2;
                                        detailsPreview = 'View';
                                    }
                                }
                                // Derive target from resource_type + resource_id
                                const target = activity.resource_id || activity.target || '-';
                                return `
                                <tr>
                                    <td>${formatTimestamp(activity.timestamp || activity.created_at)}</td>
                                    <td>
                                        <span class="severity-badge severity-${getActivityTypeClass(activity.resource_type || activity.action)}">
                                            ${(activity.resource_type || activity.action || 'Unknown').toUpperCase()}
                                        </span>
                                    </td>
                                    <td>${escapeHtml(activity.username || 'System')}</td>
                                    <td>${escapeHtml(activity.action || '-')}</td>
                                    <td>${target !== '-' ? escapeHtml(String(target)) : '-'}</td>
                                    <td>
                                        ${hasDetails ? `
                                        <button onclick="viewActivityDetails(${activity.id})" class="btn-small btn-info" title="View Details">
                                            <i class="fas fa-eye"></i> ${escapeHtml(detailsPreview)}
                                        </button>
                                        ` : '<span style="color: var(--text-muted);">-</span>'}
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
                ` : `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No activity entries found matching your criteria.</p>
                    <button onclick="clearActivityFilters()" class="btn btn-secondary">Clear Filters</button>
                </div>
                `}
            </div>
            
            ${totalPages > 1 ? `
                <div class="card-footer">
                    <nav class="pagination-nav">
                        <div class="pagination-info">
                            Page ${page} of ${totalPages} (${(total || 0).toLocaleString()} total activities)
                        </div>
                        <div class="pagination-controls">
                            ${page > 1 ? `<a href="?${new URLSearchParams({...req.query, page: page - 1}).toString()}" class="btn btn-secondary"><i class="fas fa-chevron-left"></i> Previous</a>` : ''}
                            ${page < totalPages ? `<a href="?${new URLSearchParams({...req.query, page: page + 1}).toString()}" class="btn btn-secondary">Next <i class="fas fa-chevron-right"></i></a>` : ''}
                        </div>
                    </nav>
                </div>
            ` : ''}
        </div>

        <!-- Activity Detail Modal -->
        <div id="activity-detail-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-info-circle"></i> Activity Details</h3>
                    <button onclick="closeModal('activity-detail-modal')" class="btn-close" aria-label="Close Activity Details">
                        <i class="fas fa-times" aria-hidden="true"></i>
                        <span class="btn-close-text">Close</span>
                    </button>
                </div>
                <div class="modal-body" id="activity-detail-content">
                    <!-- Activity details will be loaded here -->
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

        function getActivityTypeClass(type) {
            const classMap = {
                'login': 'success',
                'logout': 'info',
                'create': 'success',
                'update': 'warning',
                'delete': 'danger',
                'view': 'info',
                'export': 'warning',
                'import': 'success',
                'error': 'danger',
                'system': 'info'
            };
            return classMap[type] || 'info';
        }

        function getActivityIcon(type) {
            const iconMap = {
                'login': 'fas fa-sign-in-alt',
                'logout': 'fas fa-sign-out-alt',
                'create': 'fas fa-plus-circle',
                'update': 'fas fa-edit',
                'delete': 'fas fa-trash-alt',
                'view': 'fas fa-eye',
                'export': 'fas fa-download',
                'import': 'fas fa-upload',
                'error': 'fas fa-exclamation-triangle',
                'system': 'fas fa-cog'
            };
            return iconMap[type] || 'fas fa-circle';
        }

        const additionalCSS = `
        .activity-timeline {
            position: relative;
            padding-left: 2rem;
        }
        /* Accessible close button text (hidden visually in compact layouts) */
        .btn-close-text {
            margin-left: 0.35rem;
            font-size: 0.85rem;
            font-weight: 600;
        }
        @media (max-width: 640px) {
            .btn-close-text { display: none; }
        }

        .activity-timeline::before {
            content: '';
            position: absolute;
            left: 1rem;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--border-color);
        }

        .timeline-item {
            position: relative;
            margin-bottom: 2rem;
            padding-left: 2rem;
        }

        .timeline-marker {
            position: absolute;
            left: -2rem;
            top: 0.5rem;
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 0.8rem;
            border: 2px solid var(--bg-primary);
            z-index: 1;
        }

        .timeline-marker.success {
            background: var(--success-color);
        }

        .timeline-marker.warning {
            background: var(--warning-color);
        }

        .timeline-marker.danger {
            background: var(--error-color);
        }

        .timeline-marker.info {
            background: var(--info-color);
        }

        .timeline-content {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.2s ease;
        }

        .timeline-content:hover {
            background: var(--bg-tertiary);
            transform: translateY(-1px);
            box-shadow: var(--shadow-light);
        }

        .timeline-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .activity-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .activity-type {
            background: var(--gradient-ocean);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .activity-user {
            color: var(--text-secondary);
            font-weight: 500;
            font-size: 0.9rem;
        }

        .activity-time {
            color: var(--text-muted);
            font-size: 0.85rem;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .activity-actions {
            display: flex;
            gap: 0.5rem;
        }

        .timeline-description {
            margin-bottom: 0.5rem;
        }

        .timeline-description strong {
            color: var(--text-primary);
            font-size: 1rem;
        }

        .timeline-description p {
            margin: 0.5rem 0 0 0;
            color: var(--text-secondary);
            line-height: 1.4;
        }

        .activity-target {
            display: inline-block;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 500;
            margin-top: 0.5rem;
        }

        .activity-metadata {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-muted);
            font-size: 0.85rem;
            font-style: italic;
            margin-top: 0.5rem;
        }

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
            
            .timeline-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
            
            .activity-info {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
        }
        `;

        const additionalJS = `
    let realtimeActivityActive = false; // state flag only; actual polling now via Realtime registry
    let realtimeActivityInterval; // retained for backward compatibility (no longer used once registry active)
        // --- Pagination State Preservation ---
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const currentPageParam = urlParams.get('page');
                if (currentPageParam) {
                    // Store current page for later restoration
                    sessionStorage.setItem('activity-current-page', currentPageParam);
                } else {
                    // If no page param but we have a stored page, restore it seamlessly
                    const storedPage = sessionStorage.getItem('activity-current-page');
                    if (storedPage && storedPage !== '1') {
                        urlParams.set('page', storedPage);
                        // Preserve any existing non-page params (e.g., filters)
                        window.location.replace('/activity?' + urlParams.toString());
                    }
                }
            } catch (err) {
                req.app.locals?.loggers?.system?.warn('Pagination state restore failed:', err);
            }
        });

        // Enhance modal accessibility (ESC to close + overlay click)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('activity-detail-modal');
                if (modal && modal.classList.contains('open')) {
                    closeModal('activity-detail-modal');
                }
            }
        });
        document.addEventListener('DOMContentLoaded', () => {
            const modal = document.getElementById('activity-detail-modal');
            if (modal) {
                modal.addEventListener('click', (evt) => {
                    if (evt.target === modal) {
                        closeModal('activity-detail-modal');
                    }
                });
            }
        });

        // Handle activity filter form submission
        document.getElementById('activity-filter-form').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const params = new URLSearchParams();
            
            for (let [key, value] of formData.entries()) {
                if (value.trim()) {
                    params.append(key, value);
                }
            }
            // Preserve current page if already on a later page (task requirement)
            const existingPage = new URLSearchParams(window.location.search).get('page');
            if (existingPage) {
                params.set('page', existingPage);
            }
            
            window.location.href = '/activity?' + params.toString();
        });

        // Clear activity filters
        function clearActivityFilters() {
            document.getElementById('activity-filter-form').reset();
            const existingPage = new URLSearchParams(window.location.search).get('page') || sessionStorage.getItem('activity-current-page');
            if (existingPage && existingPage !== '1') {
                window.location.href = '/activity?page=' + existingPage;
            } else {
                window.location.href = '/activity';
            }
        }

        // Toggle real-time activity updates
        function toggleRealTimeActivity() {
            const btn = document.getElementById('realtime-activity-btn');
            if (!btn) return;
            if (!realtimeActivityActive) {
                realtimeActivityActive = true;
                btn.innerHTML = '<i class="fas fa-pause"></i> Stop Real-time';
                btn.classList.add('realtime-active');
                // Register realtime task (idempotent)
                if (window.registerRealtimeTask) {
                    window.registerRealtimeTask('activity-timeline-sync', async () => {
                        try {
                            const response = await fetch('/api/activity/latest', { credentials: 'same-origin' });
                            if (response.ok) {
                                const newActivities = await response.json();
                                if (Array.isArray(newActivities) && newActivities.length) {
                                    prependNewActivities(newActivities);
                                }
                            }
                        } catch (e) { /* silent */ }
                    }, 3000, { runImmediately: true });
                }
                showToast('Real-time activity updates started', 'success');
            } else {
                realtimeActivityActive = false;
                btn.innerHTML = '<i class="fas fa-play"></i> Start Real-time';
                btn.classList.remove('realtime-active');
                if (window.unregisterRealtimeTask) window.unregisterRealtimeTask('activity-timeline-sync');
                if (realtimeActivityInterval) { clearInterval(realtimeActivityInterval); }
                showToast('Real-time activity updates stopped', 'info');
            }
        }

        // Prepend new activities to timeline
        function prependNewActivities(newActivities) {
            const timeline = document.getElementById('activity-timeline');
            if (!timeline) return;
            
            newActivities.forEach(activity => {
                const item = document.createElement('div');
                item.className = 'timeline-item';
                item.setAttribute('data-activity-id', activity.id);
                item.style.animation = 'slideInRight 0.3s ease';
                
                item.innerHTML = \`
                    <div class="timeline-marker \${getActivityTypeClass(activity.type)}">
                        <i class="\${getActivityIcon(activity.type)}"></i>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <div class="activity-info">
                                <span class="activity-type">\${(activity.type || 'UNKNOWN').toUpperCase()}</span>
                                <span class="activity-user">by \${activity.username || 'System'}</span>
                                <span class="activity-time">\${formatTimestamp(activity.timestamp)}</span>
                            </div>
                            <div class="activity-actions">
                                <button onclick="viewActivityDetails(\${activity.id})" class="btn-small" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                \${activity.metadata ? \`
                                <button onclick="copyActivityData(\${activity.id})" class="btn-small" title="Copy Data">
                                    <i class="fas fa-copy"></i>
                                </button>
                                \` : ''}
                            </div>
                        </div>
                        <div class="timeline-description">
                            <strong>\${escapeHtml(activity.action)}</strong>
                            \${activity.description ? \`<p>\${escapeHtml(activity.description)}</p>\` : ''}
                            \${activity.target ? \`<span class="activity-target">Target: \${escapeHtml(activity.target)}</span>\` : ''}
                        </div>
                        \${activity.metadata ? \`
                        <div class="activity-metadata">
                            <i class="fas fa-database"></i>
                            \${Object.keys(JSON.parse(activity.metadata)).length} metadata fields
                        </div>
                        \` : ''}
                    </div>
                \`;
                
                timeline.insertBefore(item, timeline.firstChild);
            });
            
            // Remove excess items to maintain performance
            const items = timeline.children;
            while (items.length > 100) {
                timeline.removeChild(timeline.lastChild);
            }
        }

        // Get activity type class
        function getActivityTypeClass(type) {
            const classMap = {
                'login': 'success',
                'logout': 'info',
                'create': 'success',
                'update': 'warning',
                'delete': 'danger',
                'view': 'info',
                'export': 'warning',
                'import': 'success',
                'error': 'danger',
                'system': 'info'
            };
            return classMap[type] || 'info';
        }

        // Get activity icon
        function getActivityIcon(type) {
            const iconMap = {
                'login': 'fas fa-sign-in-alt',
                'logout': 'fas fa-sign-out-alt',
                'create': 'fas fa-plus-circle',
                'update': 'fas fa-edit',
                'delete': 'fas fa-trash-alt',
                'view': 'fas fa-eye',
                'export': 'fas fa-download',
                'import': 'fas fa-upload',
                'error': 'fas fa-exclamation-triangle',
                'system': 'fas fa-cog'
            };
            return iconMap[type] || 'fas fa-circle';
        }

        // View activity details in modal
        async function viewActivityDetails(activityId) {
            try {
                showLoading('activity-detail-content');
                openModal('activity-detail-modal');
                
                const response = await fetch('/api/activity/' + activityId, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to load activity details');
                }
                
                const activity = await response.json();
                if (activity) { 
                    displayActivityDetails(activity); 
                } else { 
                    showError('activity-detail-content', 'No data'); 
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Error loading activity details:', error);
                showError('activity-detail-content', error.message || 'Failed to load activity details');
            }
        }

        // Display activity details in modal
        function displayActivityDetails(activity) {
            const content = document.getElementById('activity-detail-content');
            const metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
            
            // Parse details to check for settings diff (old_value/new_value)
            let detailsObj = null;
            let isDiffAvailable = false;
            try {
                if (activity.details) {
                    detailsObj = typeof activity.details === 'string' ? JSON.parse(activity.details) : activity.details;
                    isDiffAvailable = detailsObj && ('old_value' in detailsObj) && ('new_value' in detailsObj);
                }
            } catch (parseErr) {
                detailsObj = null;
            }
            
            content.innerHTML = \`
                <div class="activity-detail">
                    <div class="detail-section">
                        <h4><i class="fas fa-info-circle"></i> Activity Information</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>ID:</label>
                                <span>\${activity.id}</span>
                            </div>
                            <div class="detail-item">
                                <label>Type:</label>
                                <span class="activity-type">\${(activity.type || 'UNKNOWN').toUpperCase()}</span>
                            </div>
                            <div class="detail-item">
                                <label>Action:</label>
                                <span>\${activity.action}</span>
                            </div>
                            <div class="detail-item">
                                <label>User:</label>
                                <span>\${activity.username || 'System'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Timestamp:</label>
                                <span>\${formatTimestamp(activity.timestamp)}</span>
                            </div>
                            \${activity.target ? \`
                            <div class="detail-item">
                                <label>Target:</label>
                                <span>\${activity.target}</span>
                            </div>
                            \` : ''}
                        </div>
                    </div>
                    
                    \${activity.description ? \`
                        <div class="detail-section">
                            <h4><i class="fas fa-comment-alt"></i> Description</h4>
                            <div class="message-display">
                                \${escapeHtml(activity.description)}
                            </div>
                        </div>
                    \` : ''}
                    
                    \${isDiffAvailable ? \`
                        <div class="detail-section">
                            <h4><i class="fas fa-code-compare"></i> Before / After Diff</h4>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
                                    <div style="font-weight: 600; color: var(--error-color); margin-bottom: 0.5rem;">
                                        <i class="fas fa-minus-circle"></i> Old Value
                                    </div>
                                    <pre style="margin: 0; word-wrap: break-word; white-space: pre-wrap; font-size: 0.875rem;"><code>\${escapeHtml(JSON.stringify(detailsObj.old_value, null, 2))}</code></pre>
                                </div>
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
                                    <div style="font-weight: 600; color: var(--success-color); margin-bottom: 0.5rem;">
                                        <i class="fas fa-plus-circle"></i> New Value
                                    </div>
                                    <pre style="margin: 0; word-wrap: break-word; white-space: pre-wrap; font-size: 0.875rem;"><code>\${escapeHtml(JSON.stringify(detailsObj.new_value, null, 2))}</code></pre>
                                </div>
                            </div>
                        </div>
                    \` : ''}
                    
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

        // Copy activity data
        async function copyActivityData(activityId) {
            try {
                const response = await fetch('/api/activity/' + activityId, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to load activity data');
                }
                
                const activity = await response.json();
                if (!activity) throw new Error('No activity data');
                
                const data = {
                    id: activity.id,
                    type: activity.type,
                    action: activity.action,
                    user: activity.username || 'System',
                    timestamp: activity.timestamp,
                    target: activity.target,
                    description: activity.description,
                    metadata: activity.metadata ? JSON.parse(activity.metadata) : null
                };
                await copyToClipboard(JSON.stringify(data, null, 2));
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Error copying activity data:', error);
                showToast(error.message || 'Failed to copy activity data', 'error');
            }
        }

        // Export activity
        async function exportActivity() {
            try {
                const params = new URLSearchParams(window.location.search);
                params.set('export', 'true');
                const blob = await apiFetch('/api/activity/export?' + params.toString(), {}, { responseType: 'blob' });
                if (!blob) throw new Error('No export data');
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'activity-export-' + new Date().toISOString().split('T')[0] + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showToast('Activity exported successfully', 'success');
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Export error:', error);
                showToast(error.message || 'Failed to export activity', 'error');
            }
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
            if (window.unregisterRealtimeTask) window.unregisterRealtimeTask('activity-timeline-sync');
            if (realtimeActivityInterval) { clearInterval(realtimeActivityInterval); }
        });
        `;

        const html = getPageTemplate({
            pageTitle: 'Activity Monitor',
            pageIcon: 'fas fa-history',
            activeNav: 'activity',
            contentBody,
            additionalCSS,
            additionalJS,
            req,
            SYSTEM_SETTINGS: req.systemSettings,
            TIMEZONE: req.systemSettings.timezone
        });

        res.send(html);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Activity route error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * API Route - Get latest activities for real-time updates
 * GET /api/activity/latest
 */
router.get('/api/latest', async (req, res) => {
    try {
        const since = req.query.since || new Date(Date.now() - 30000).toISOString(); // Last 30 seconds
        const activities = await req.dal.getActivitiesSince(since);
        res.json(activities);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Latest activities API error:', error);
        res.status(500).json({ error: 'Failed to get latest activities' });
    }
});

/**
 * API Route - Export activities
 * GET /api/activity/export
 * NOTE: MUST be defined BEFORE /api/:id to avoid shadowing
 */
router.get('/api/export', async (req, res) => {
    try {
        const filters = {
            type: req.query.type || null,
            user: req.query.user || null,
            startDate: req.query.start_date || null,
            endDate: req.query.end_date || null
        };

        const activities = await req.dal.exportActivities(filters);
        
        // Generate CSV
        const csvHeader = 'ID,Timestamp,Type,Action,User,Target,Description,Metadata\n';
        const csvRows = activities.map(activity => {
            const fields = [
                activity.id,
                activity.timestamp,
                activity.type,
                `"${(activity.action || '').replace(/"/g, '""')}"`,
                activity.username || 'System',
                `"${(activity.target || '').replace(/"/g, '""')}"`,
                `"${(activity.description || '').replace(/"/g, '""')}"`,
                `"${(activity.metadata || '').replace(/"/g, '""')}"`
            ];
            return fields.join(',');
        });

        const csv = csvHeader + csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="activity-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);

    } catch (error) {
        req.app.locals?.loggers?.system?.error('Export activities API error:', error);
        res.status(500).json({ error: 'Failed to export activities' });
    }
});

/**
 * API Route - Get single activity details
 * GET /api/activity/:id
 * NOTE: Parameterized route MUST come AFTER static routes like /api/export
 */
router.get('/api/:id', async (req, res) => {
    try {
        const activity = await req.dal.getActivityById(req.params.id);
        if (!activity) {
            return res.status(404).json({ error: 'Activity not found' });
        }
        res.json(activity);
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Activity details API error:', error);
        res.status(500).json({ error: 'Failed to get activity details' });
    }
});

module.exports = router;