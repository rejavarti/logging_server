// routes/admin/users.js - Admin Users Management Route
const express = require('express');
const router = express.Router();

module.exports = (getPageTemplate, requireAuth) => {
    /**
     * Admin Users Management Route
     * GET /admin/users (mounted at /admin/users, so this handles /)
     * Handles user management with tabs for users and sessions
     * Note: requireAuth and requireAdmin already applied at server.js level
     */
    router.get('/', (req, res) => {
    const additionalCSS = `
        .tab-button.active {
            color: var(--accent-primary) !important;
            border-bottom-color: var(--accent-primary) !important;
        }
        .tab-button:hover {
            color: var(--accent-primary);
            background: var(--bg-secondary);
        }
        .tab-content {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .user-table {
            width: 100%;
            border-collapse: collapse;
        }
        .user-table th,
        .user-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        .user-table th {
            background: var(--gradient-sky);
            color: var(--text-primary);
            font-weight: 600;
        }
        .user-table tr:hover td {
            background: var(--bg-secondary);
        }
        .role-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .role-admin { background: #e53e3e; color: #ffffff; }
        .role-user { background: #3182ce; color: #ffffff; }
        .status-active { background: #38a169; color: #ffffff; }
        .status-inactive { background: #e53e3e; color: #ffffff; }
        .modal {
            display: none !important;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.active {
            display: flex !important;
        }
        .modal-content {
            background: var(--bg-primary);
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            box-shadow: var(--shadow-medium);
            max-height: 90vh;
            overflow-y: auto;
        }
        
        /* Responsive breakpoints for user modals */
        @media (max-width: 640px) {
            .modal-content {
                width: 95%;
                max-width: 95%;
                padding: 1.5rem;
                max-height: 95vh;
                border-radius: 8px;
            }
        }
        
        @media (min-width: 641px) and (max-width: 1024px) {
            .modal-content {
                width: 80%;
                max-width: 600px;
            }
        }
        
        @media (min-width: 1025px) {
            .modal-content {
                width: 70%;
                max-width: 700px;
            }
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .modal-header h2,
        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .close-btn {
            background: var(--bg-secondary);
            border: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 1.25rem;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            transition: all 0.2s ease;
        }
        .close-btn:hover {
            background: var(--error-color);
            color: white;
            border-color: var(--error-color);
            transform: rotate(90deg);
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: var(--text-primary);
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1rem;
        }
        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--accent-primary);
        }
        .form-group small {
            display: block;
            margin-top: 0.25rem;
            color: var(--text-muted);
            font-size: 0.875rem;
        }
        .btn-group {
            display: flex;
            gap: 1rem;
            margin-top: 1.5rem;
        }
        /* Use universal button styles - no overrides needed */
        .btn-small {
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
        }
    `;

    const contentBody = `
        <div class="content-header"><h1>User Management</h1></div>
        <!-- Tab Navigation -->
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="switchTab('users')" id="tab-users" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-users"></i> Users
                </button>
                <button onclick="switchTab('sessions')" id="tab-sessions" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                    <i class="fas fa-user-clock"></i> Sessions
                </button>
            </div>
        </div>

        <!-- Users Tab Content -->
        <div id="content-users" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-users"></i> User Management</h3>
                    <button onclick="showAddUserModal()" class="btn">
                        <i class="fas fa-user-plus"></i> Add User
                    </button>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-responsive">
                        <table class="user-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Last Login</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading users...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sessions Tab Content -->
        <div id="content-sessions" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-user-clock"></i> Active Sessions</h3>
                    <button onclick="refreshSessions()" class="btn">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-responsive">
                        <table class="user-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>IP Address</th>
                                    <th>User Agent</th>
                                    <th>Login Time</th>
                                    <th>Last Activity</th>
                                    <th>Duration</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="sessions-tbody">
                                <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading sessions...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add User Modal -->
        <div id="addUserModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-plus"></i> Add New User</h2>
                    <button onclick="hideAddUserModal()" class="close-btn">&times;</button>
                </div>
                <form id="addUserForm">
                    <div class="form-group">
                        <label for="newUsername">Username *</label>
                        <input type="text" id="newUsername" name="username" required minlength="3" autocomplete="username">
                        <small>Minimum 3 characters</small>
                    </div>
                    <div class="form-group">
                        <label for="newEmail">Email</label>
                        <input type="email" id="newEmail" name="email">
                    </div>
                    <div class="form-group">
                        <label for="newPassword">Password *</label>
                        <input type="password" id="newPassword" name="password" autocomplete="new-password" required minlength="8">
                        <small>Minimum 8 characters</small>
                    </div>
                    <div class="form-group">
                        <label for="newRole">Role *</label>
                        <select id="newRole" name="role" required>
                            <option value="user">Standard User (View Only)</option>
                            <option value="admin">Administrator (Full Access)</option>
                        </select>
                    </div>
                    <div class="btn-group">
                        <button type="button" onclick="hideAddUserModal()" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn"><i class="fas fa-save"></i> Create User</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Edit User Modal -->
        <div id="editUserModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-user-edit"></i> Edit User</h2>
                    <button onclick="hideEditUserModal()" class="close-btn">&times;</button>
                </div>
                <form id="editUserForm">
                    <input type="hidden" id="editUserId" name="userId">
                    <div class="form-group">
                        <label for="editUsername">Username</label>
                        <input type="text" id="editUsername" name="username" readonly style="opacity: 0.7; cursor: not-allowed;" autocomplete="username">
                        <small>Username cannot be changed</small>
                    </div>
                    <div class="form-group">
                        <label for="editEmail">Email</label>
                        <input type="email" id="editEmail" name="email">
                    </div>
                    <div class="form-group">
                        <label for="editPassword">New Password</label>
                        <input type="password" id="editPassword" name="password" autocomplete="new-password" minlength="8">
                        <small>Leave empty to keep current password</small>
                    </div>
                    <div class="form-group">
                        <label for="editRole">Role *</label>
                        <select id="editRole" name="role" required>
                            <option value="user">Standard User (View Only)</option>
                            <option value="admin">Administrator (Full Access)</option>
                        </select>
                    </div>
                    <div class="btn-group">
                        <button type="button" onclick="hideEditUserModal()" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn"><i class="fas fa-save"></i> Update User</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const additionalJS = `
        let allUsers = [];
        let allSessions = [];

        // Tab switching
        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(btn => { 
                btn.classList.remove('active'); 
                btn.style.background = 'var(--bg-secondary)'; 
                btn.style.color = 'var(--text-primary)'; 
            });
            
            // Show selected tab
            document.getElementById('content-' + tabName).style.display = 'block';
            const activeBtn = document.getElementById('tab-' + tabName);
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--gradient-ocean)';
            activeBtn.style.color = 'white';
            
            // Load data for the selected tab
            if (tabName === 'sessions') {
                loadSessions();
            }
        }

        function formatDate(dateStr) {
            if (!dateStr) return null;
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return null;
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return null;
            }
        }

        function formatDuration(startDateStr) {
            if (!startDateStr) return 'N/A';
            try {
                const startDate = new Date(startDateStr);
                if (isNaN(startDate.getTime())) return 'N/A';
                
                const now = new Date();
                const durationMs = now.getTime() - startDate.getTime();
                if (durationMs < 0) return 'N/A';
                
                const minutes = Math.floor(durationMs / 1000 / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                
                if (days > 0) {
                    return \`\${days}d \${hours % 24}h\`;
                } else if (hours > 0) {
                    return \`\${hours}h \${minutes % 60}m\`;
                } else {
                    return \`\${minutes}m\`;
                }
            } catch (e) {
                return 'N/A';
            }
        }

        async function loadSessions() {
            try {
                const response = await fetch('/api/admin/sessions');
                if (!response.ok) throw new Error('Failed to fetch sessions');
                
                const data = await response.json();
                allSessions = (data.sessions || data).map(session => ({
                    ...session,
                    created_at_formatted: formatDate(session.created_at),
                    last_activity_formatted: formatDate(session.last_activity),
                    duration_formatted: formatDuration(session.created_at)
                }));
                const tbody = document.getElementById('sessions-tbody');
                
                if (!allSessions || allSessions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No active sessions</td></tr>';
                    return;
                }
                
                tbody.innerHTML = allSessions.map(session => {
                    return \`
                        <tr>
                            <td>
                                <i class="fas fa-user-circle" style="margin-right: 0.5rem; color: var(--accent-primary);"></i>
                                <strong>\${session.username}</strong>
                            </td>
                            <td>\${session.ip_address || 'Unknown'}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${session.user_agent || 'Unknown'}">
                                \${session.user_agent || 'Unknown'}
                            </td>
                            <td>\${session.created_at_formatted || 'N/A'}</td>
                            <td>\${session.last_activity_formatted || 'N/A'}</td>
                            <td>\${session.duration_formatted || 'N/A'}</td>
                            <td>
                                <button onclick="terminateSession('\${session.id}')" class="btn-small btn-danger" title="Terminate Session">
                                    <i class="fas fa-sign-out-alt"></i> Terminate
                                </button>
                            </td>
                        </tr>
                    \`;
                }).join('');
            } catch (error) {
                req.app.locals?.loggers?.admin?.error('Error loading sessions:', error);
                document.getElementById('sessions-tbody').innerHTML = 
                    '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load sessions</td></tr>';
            }
        }

        async function terminateSession(sessionToken) {
            if (!confirm('Are you sure you want to terminate this session?')) return;
            
            try {
                const response = await fetch(\`/api/admin/sessions/\${sessionToken}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showNotification('Session terminated successfully', 'success');
                    loadSessions();
                } else {
                    throw new Error('Failed to terminate session');
                }
            } catch (error) {
                req.app.locals?.loggers?.admin?.error('Error terminating session:', error);
                showNotification('Failed to terminate session', 'error');
            }
        }

        function refreshSessions() {
            loadSessions();
        }

        // formatDate() defined at line 369 - duplicate removed

        async function loadUsers() {
            try {
                const response = await fetch('/api/users');
                if (!response.ok) throw new Error('Failed to fetch users');
                
                const data = await response.json();
                allUsers = (data.users || data).map(user => ({
                    ...user,
                    created_at_formatted: formatDate(user.created || user.created_at),
                    last_login_formatted: formatDate(user.lastLogin || user.last_login)
                }));
                const tbody = document.getElementById('users-tbody');
                
                if (!allUsers || allUsers.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No users found</td></tr>';
                    return;
                }
                
                tbody.innerHTML = allUsers.map(user => \`
                    <tr>
                        <td>
                            <i class="fas fa-user-circle" style="margin-right: 0.5rem; color: var(--accent-primary);"></i>
                            <strong>\${user.username}</strong>
                        </td>
                        <td>\${user.email || '<em style="color: var(--text-muted);">Not set</em>'}</td>
                        <td><span class="role-badge role-\${user.role}">\${user.role}</span></td>
                        <td><span class="role-badge status-\${user.is_active || user.status === 'active' ? 'active' : 'inactive'}">\${user.is_active || user.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                        <td>\${user.created_at_formatted || 'N/A'}</td>
                        <td>\${user.last_login_formatted || '<em style="color: var(--text-muted);">Never</em>'}</td>
                        <td>
                            <button onclick="editUser(\${user.id})" class="btn btn-small" style="margin-right: 0.5rem;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            \${user.username !== 'admin' ? \`
                            <button onclick="deleteUser(\${user.id}, '\${user.username}')" class="btn btn-danger btn-small">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                            \` : ''}
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                req.app.locals?.loggers?.admin?.error('Error loading users:', error);
                document.getElementById('users-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--error-color);">Failed to load users</td></tr>';
            }
        }

        function showAddUserModal() {
            document.getElementById('addUserModal').classList.add('active');
        }

        function hideAddUserModal() {
            document.getElementById('addUserModal').classList.remove('active');
            document.getElementById('addUserForm').reset();
        }

        function showEditUserModal() {
            document.getElementById('editUserModal').classList.add('active');
        }

        function hideEditUserModal() {
            document.getElementById('editUserModal').classList.remove('active');
            document.getElementById('editUserForm').reset();
        }

        function editUser(userId) {
            const user = allUsers.find(u => u.id === userId);
            if (user) {
                document.getElementById('editUserId').value = user.id;
                document.getElementById('editUsername').value = user.username;
                document.getElementById('editEmail').value = user.email || '';
                document.getElementById('editRole').value = user.role;
                showEditUserModal();
            }
        }

        async function deleteUser(userId, username) {
            if (!confirm(\`Are you sure you want to delete user "\${username}"?\\n\\nThis action cannot be undone.\`)) return;
            
            try {
                const response = await fetch(\`/api/users/\${userId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert(\`User "\${username}" deleted successfully\`);
                    loadUsers();
                } else {
                    const error = await response.json();
                    alert('Failed to delete user: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error deleting user: ' + error.message);
            }
        }

        document.getElementById('addUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Validate form
            const validation = validateForm(document.getElementById('addUserForm'), {
                'newUsername': {
                    label: 'Username',
                    required: true,
                    minLength: 3,
                    maxLength: 50,
                    pattern: '^[a-zA-Z0-9_-]+$',
                    patternMessage: 'Username can only contain letters, numbers, underscores, and hyphens'
                },
                'newPassword': {
                    label: 'Password',
                    required: true,
                    minLength: 6
                },
                'newRole': {
                    label: 'Role',
                    required: true
                }
            });
            
            if (!validation.valid) {
                return;
            }
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            const submitBtn = e.target.querySelector('button[type="submit"]');
            
            await withLoading(submitBtn, (async () => {
                try {
                    const response = await fetch('/api/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        showToast('User "' + data.username + '" created successfully', 'success');
                        hideAddUserModal();
                        loadUsers();
                    } else {
                        const error = await response.json();
                        showToast('Failed to create user: ' + (error.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    showToast('Error creating user: ' + error.message, 'error');
                }
            })());
        });

        document.getElementById('editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Build validation rules
            const rules = {
                'editRole': {
                    label: 'Role',
                    required: true
                }
            };
            
            // Only validate password if it's being changed
            const passwordField = document.getElementById('editPassword');
            if (passwordField && passwordField.value.trim()) {
                rules['editPassword'] = {
                    label: 'Password',
                    minLength: 6
                };
            }
            
            const validation = validateForm(document.getElementById('editUserForm'), rules);
            
            if (!validation.valid) {
                return;
            }
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            const userId = data.userId;
            delete data.userId;
            delete data.username; // Don't send username
            
            // Remove password if empty
            if (!data.password) {
                delete data.password;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            
            await withLoading(submitBtn, (async () => {
                try {
                    const response = await fetch(\`/api/users/\${userId}\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        showToast('User updated successfully', 'success');
                        hideEditUserModal();
                        loadUsers();
                    } else {
                        const error = await response.json();
                        showToast('Failed to update user: ' + (error.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    showToast('Error updating user: ' + error.message, 'error');
                }
            })());
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Load users on page load
        loadUsers();
    `;

    res.send(getPageTemplate({
        pageTitle: 'User Management',
        pageIcon: 'fas fa-users',
        activeNav: 'users',
        contentBody: contentBody,
        additionalCSS: additionalCSS,
        additionalJS: additionalJS,
        req: req
    }));
});

    return router;
};