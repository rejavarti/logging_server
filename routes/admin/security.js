// Admin Security Route - Security & Audit Monitoring Dashboard
// Extracted from server.js for better organization and maintainability

const express = require('express');
const router = express.Router();

module.exports = (getPageTemplate, requireAuth) => {
    // Security & Audit Monitoring (Consolidated)
    // Note: requireAuth and requireAdmin already applied at server.js level
    router.get('/security', (req, res) => {
        const contentBody = `
            <!-- Tab Navigation -->
            <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button onclick="switchTab('rate-limits')" id="tab-rate-limits" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-shield-alt"></i> Rate Limiting
                    </button>
                    <button onclick="switchTab('audit-trail')" id="tab-audit-trail" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-clipboard-list"></i> Audit Trail
                    </button>
                </div>
            </div>

            <!-- Rate Limiting Tab -->
            <div id="content-rate-limits" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-shield-alt"></i> Rate Limiting Dashboard</h3>
                        <button onclick="refreshRateLimits()" class="btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                            <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--error-color);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Blocked IPs</div>
                                        <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="blocked-ips-count">-</div>
                                    </div>
                                    <i class="fas fa-ban" style="font-size: 2rem; color: var(--error-color); opacity: 0.5;"></i>
                                </div>
                            </div>
                            <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--accent-primary);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Total Requests (1h)</div>
                                        <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="total-requests-count">-</div>
                                    </div>
                                    <i class="fas fa-exchange-alt" style="font-size: 2rem; color: var(--accent-primary); opacity: 0.5;"></i>
                                </div>
                            </div>
                            <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--success-color);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Unique IPs (1h)</div>
                                        <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);" id="unique-ips-count">-</div>
                                    </div>
                                    <i class="fas fa-network-wired" style="font-size: 2rem; color: var(--success-color); opacity: 0.5;"></i>
                                </div>
                            </div>
                        </div>
                        <div id="rate-limits-container">
                            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                                <p>Loading rate limit data...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Audit Trail Tab -->
            <div id="content-audit-trail" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-clipboard-list"></i> Audit Trail</h3>
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="exportAuditTrail()" class="btn">
                                <i class="fas fa-download"></i> Export CSV
                            </button>
                            <button onclick="refreshAuditTrail()" class="btn">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">User</label>
                                <select id="filter-user" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                    <option value="">All Users</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Action</label>
                                <select id="filter-action" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                    <option value="">All Actions</option>
                                    <option value="login">Login</option>
                                    <option value="logout">Logout</option>
                                    <option value="create">Create</option>
                                    <option value="update">Update</option>
                                    <option value="delete">Delete</option>
                                    <option value="export">Export</option>
                                    <option value="import">Import</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Start Date</label>
                                <input type="date" id="filter-start-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">End Date</label>
                                <input type="date" id="filter-end-date" onchange="refreshAuditTrail()" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                            </div>
                        </div>
                        <div id="audit-trail-container">
                            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                                <p>Loading audit trail...</p>
                            </div>
                        </div>
                        <div id="pagination-info" style="text-align: center; margin-top: 1rem; color: var(--text-muted); font-size: 0.875rem;"></div>
                    </div>
                </div>
            </div>
        `;

        const additionalCSS = `
            .tab-btn { transition: all 0.3s ease; }
            .tab-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-light); }
            .tab-btn.active { background: var(--gradient-ocean) !important; color: white !important; }
            .tab-content { animation: fadeIn 0.3s ease; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `;

        const additionalJS = `
            let currentTab = 'rate-limits';
            
            function switchTab(tabName) {
                currentTab = tabName;
                document.querySelectorAll('.tab-btn').forEach(btn => { 
                    btn.classList.remove('active'); 
                    btn.style.background = 'var(--bg-secondary)'; 
                    btn.style.color = 'var(--text-primary)'; 
                });
                document.getElementById('tab-' + tabName).classList.add('active');
                document.getElementById('tab-' + tabName).style.background = 'var(--gradient-ocean)';
                document.getElementById('tab-' + tabName).style.color = 'white';
                
                document.querySelectorAll('.tab-content').forEach(content => { 
                    content.style.display = 'none'; 
                });
                document.getElementById('content-' + tabName).style.display = 'block';
                
                if (tabName === 'rate-limits') { 
                    refreshRateLimits(); 
                } else if (tabName === 'audit-trail') { 
                    if (!window.usersLoaded) { 
                        loadUsers(); 
                        window.usersLoaded = true; 
                    } 
                    refreshAuditTrail(); 
                }
            }
            
            async function refreshRateLimits() {
                try {
                    const statsResponse = await fetch('/api/rate-limits/stats');
                    if (!statsResponse.ok) throw new Error('Failed to fetch stats');
                    const stats = await statsResponse.json();
                    
                    document.getElementById('blocked-ips-count').textContent = stats.blockedIPs || 0;
                    document.getElementById('total-requests-count').textContent = (stats.totalRequests || 0).toLocaleString();
                    document.getElementById('unique-ips-count').textContent = stats.uniqueIPs || 0;
                    
                    const response = await fetch('/api/rate-limits');
                    if (!response.ok) throw new Error('Failed to fetch rate limits');
                    const data = await response.json();
                    
                    const container = document.getElementById('rate-limits-container');
                    
                    // Check if data exists and rateLimits is an array
                    if (!data || !data.rateLimits || !Array.isArray(data.rateLimits) || data.rateLimits.length === 0) { 
                        container.innerHTML = \`
                            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                                <p>No rate limit activity</p>
                            </div>
                        \`; 
                        return; 
                    }
                    
                    let html = '<table class="data-table"><thead><tr><th>IP Address</th><th>Endpoint</th><th>Requests</th><th>Window Start</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
                    
                    data.rateLimits.forEach(limit => {
                        const isBlocked = limit.blocked_until && new Date(limit.blocked_until) > new Date();
                        const statusColor = isBlocked ? 'var(--error-color)' : 'var(--success-color)';
                        const statusText = isBlocked ? 'Blocked' : 'Active';
                        const statusIcon = isBlocked ? 'ban' : 'check-circle';
                        
                        html += \`
                            <tr>
                                <td><code style="background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px;">\${limit.ip_address}</code></td>
                                <td><code style="font-size: 0.875rem;">\${limit.endpoint}</code></td>
                                <td><span style="font-weight: 600; color: var(--accent-primary);">\${limit.request_count}</span> requests</td>
                                <td>\${formatTimestamp(limit.window_start)}</td>
                                <td><span style="color: \${statusColor}; font-weight: 600;"><i class="fas fa-\${statusIcon}"></i> \${statusText}</span></td>
                                <td>\${isBlocked ? \`<button onclick="unblockIP('\${limit.ip_address}')" class="btn" style="padding: 0.5rem 1rem; font-size: 0.875rem;"><i class="fas fa-unlock"></i> Unblock</button>\` : '-'}</td>
                            </tr>
                        \`;
                    });
                    
                    html += '</tbody></table>';
                    container.innerHTML = html;
                } catch (error) { 
                    req.app.locals?.loggers?.admin?.error('Error loading rate limits:', error); 
                    document.getElementById('rate-limits-container').innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Failed to load</p>
                        </div>
                    \`; 
                }
            }
            
            async function unblockIP(ip) {
                if (!confirm(\`Unblock IP \${ip}?\`)) return;
                try { 
                    const response = await fetch('/api/rate-limits/unblock', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ ip }) 
                    }); 
                    if (!response.ok) throw new Error('Failed'); 
                    showToast(\`IP \${ip} unblocked\`, 'success'); 
                    refreshRateLimits(); 
                } catch (error) { 
                    showToast('Failed to unblock', 'error'); 
                }
            }
            
            async function loadUsers() {
                try { 
                    const response = await fetch('/api/users'); 
                    if (!response.ok) throw new Error('Failed'); 
                    const users = await response.json(); 
                    const select = document.getElementById('filter-user'); 
                    const userList = Array.isArray(users) ? users : (users.users || []); 
                    userList.forEach(user => { 
                        const option = document.createElement('option'); 
                        option.value = user.id; 
                        option.textContent = user.username + ' (' + user.email + ')'; 
                        select.appendChild(option); 
                    }); 
                } catch (error) { 
                    req.app.locals?.loggers?.admin?.error('Error loading users:', error); 
                }
            }
            
            async function refreshAuditTrail() {
                try {
                    const params = new URLSearchParams(); 
                    const userId = document.getElementById('filter-user').value; 
                    const action = document.getElementById('filter-action').value; 
                    const startDate = document.getElementById('filter-start-date').value; 
                    const endDate = document.getElementById('filter-end-date').value;
                    
                    if (userId) params.append('user_id', userId); 
                    if (action) params.append('action', action); 
                    if (startDate) params.append('start_date', startDate); 
                    if (endDate) params.append('end_date', endDate); 
                    params.append('limit', '100');
                    
                    const response = await fetch('/api/audit-trail?' + params.toString());
                    if (!response.ok) throw new Error('Failed');
                    const data = await response.json();
                    
                    const container = document.getElementById('audit-trail-container');
                    if (!data.activities || data.activities.length === 0) { 
                        container.innerHTML = \`
                            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
                                <p>No entries found</p>
                            </div>
                        \`; 
                        document.getElementById('pagination-info').textContent = ''; 
                        return; 
                    }
                    
                    let html = '<table class="data-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th><th>IP</th></tr></thead><tbody>';
                    
                    data.activities.forEach(activity => {
                        const colors = { 
                            login: 'var(--success-color)', 
                            logout: 'var(--text-muted)', 
                            create: 'var(--accent-primary)', 
                            update: 'var(--warning-color)', 
                            delete: 'var(--error-color)', 
                            export: 'var(--info-color)', 
                            import: 'var(--info-color)' 
                        };
                        const color = colors[activity.action] || 'var(--text-primary)';
                        
                        html += \`
                            <tr>
                                <td>\${formatTimestamp(activity.timestamp)}</td>
                                <td><strong>\${activity.username||'Unknown'}</strong><br><small style="color: var(--text-muted);">\${activity.email||''}</small></td>
                                <td><span style="color: \${color}; font-weight: 600; text-transform: uppercase; font-size: 0.875rem;">\${activity.action}</span></td>
                                <td><code>\${activity.resource||'-'}</code></td>
                                <td style="max-width: 300px; overflow: hidden;">\${activity.details||'-'}</td>
                                <td><code>\${activity.ip_address||'-'}</code></td>
                            </tr>
                        \`;
                    });
                    
                    html += '</tbody></table>';
                    container.innerHTML = html;
                    document.getElementById('pagination-info').textContent = \`Showing \${data.activities.length} of \${data.total} total\`;
                } catch (error) { 
                    req.app.locals?.loggers?.admin?.error('Error:', error); 
                    document.getElementById('audit-trail-container').innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Failed to load</p>
                        </div>
                    \`; 
                }
            }
            
            async function exportAuditTrail() { 
                try { 
                    window.location.href = '/api/audit-trail/export'; 
                    showToast('Export started', 'success'); 
                } catch (error) { 
                    showToast('Export failed', 'error'); 
                } 
            }
            
            // showToast() is provided by base.js template
            
            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleString();
            }
            
            refreshRateLimits();
        `;

        res.send(getPageTemplate({ 
            pageTitle: 'Security & Audit Monitoring', 
            pageIcon: 'fas fa-shield-alt', 
            activeNav: 'security', 
            contentBody: contentBody, 
            additionalCSS: additionalCSS, 
            additionalJS: additionalJS, 
            req: req 
        }));
    });

    // Redirect old URLs
    router.get('/rate-limits', requireAuth, (req, res) => { 
        res.redirect('/admin/security'); 
    });

    return router;
};