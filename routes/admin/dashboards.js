const express = require('express');
const { getPageTemplate } = require('../../templates/base');
const router = express.Router();

// Advanced Dashboard Builder Management Page
router.get('/', (req, res) => {
    const pageContent = `
        <div class="container-fluid">
            <div class="row">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h3><i class="fas fa-tachometer-alt text-primary"></i> Advanced Dashboard Builder</h3>
                            <button class="btn btn-primary" onclick="createDashboard()">
                                <i class="fas fa-plus"></i> Create Dashboard
                            </button>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <!-- Dashboard List -->
                                <div class="col-md-6">
                                    <h5>My Dashboards</h5>
                                    <div id="dashboardList" class="list-group">
                                        <div class="text-center p-3">
                                            <i class="fas fa-spinner fa-spin"></i> Loading dashboards...
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Widget Types -->
                                <div class="col-md-6">
                                    <h5>Available Widget Types</h5>
                                    <div id="widgetTypes" class="row">
                                        <div class="text-center p-3">
                                            <i class="fas fa-spinner fa-spin"></i> Loading widget types...
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Dashboard Statistics -->
                            <div class="row mt-4">
                                <div class="col-md-12">
                                    <h5>Dashboard Statistics</h5>
                                    <div class="row" id="dashboardStats">
                                        <div class="col-md-3">
                                            <div class="stat-card">
                                                <div class="stat-icon bg-primary">
                                                    <i class="fas fa-tachometer-alt"></i>
                                                </div>
                                                <div class="stat-content">
                                                    <h4 id="totalDashboards">-</h4>
                                                    <p>Total Dashboards</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="stat-card">
                                                <div class="stat-icon bg-success">
                                                    <i class="fas fa-puzzle-piece"></i>
                                                </div>
                                                <div class="stat-content">
                                                    <h4 id="totalWidgets">-</h4>
                                                    <p>Total Widgets</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="stat-card">
                                                <div class="stat-icon bg-info">
                                                    <i class="fas fa-users"></i>
                                                </div>
                                                <div class="stat-content">
                                                    <h4 id="activeUsers">-</h4>
                                                    <p>Active Users</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="stat-card">
                                                <div class="stat-icon bg-warning">
                                                    <i class="fas fa-chart-line"></i>
                                                </div>
                                                <div class="stat-content">
                                                    <h4 id="widgetTypesCount">12</h4>
                                                    <p>Widget Types</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Dashboard Modal -->
        <div class="modal fade" id="createDashboardModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Create New Dashboard</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="createDashboardForm">
                            <div class="mb-3">
                                <label for="dashboardName" class="form-label">Dashboard Name</label>
                                <input type="text" class="form-control" id="dashboardName" required>
                            </div>
                            <div class="mb-3">
                                <label for="dashboardDescription" class="form-label">Description</label>
                                <textarea class="form-control" id="dashboardDescription" rows="3"></textarea>
                            </div>
                            <div class="mb-3">
                                <label for="dashboardTags" class="form-label">Tags (comma-separated)</label>
                                <input type="text" class="form-control" id="dashboardTags" placeholder="monitoring, alerts, metrics">
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="dashboardPublic">
                                <label class="form-check-label" for="dashboardPublic">
                                    Make dashboard public
                                </label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="submitCreateDashboard()">Create Dashboard</button>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .stat-card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .stat-icon {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 15px;
                color: white;
                font-size: 24px;
            }
            
            .stat-content h4 {
                margin: 0;
                font-size: 28px;
                font-weight: bold;
                color: #333;
            }
            
            .stat-content p {
                margin: 0;
                color: #666;
                font-size: 14px;
            }
            
            .widget-type-card {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .widget-type-card:hover {
                background: #e9ecef;
                border-color: #007bff;
            }
            
            .widget-type-icon {
                font-size: 24px;
                margin-bottom: 10px;
                color: #007bff;
            }
            
            .dashboard-item {
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .dashboard-item:hover {
                background-color: #f8f9fa;
            }
            
            .dashboard-actions {
                opacity: 0;
                transition: opacity 0.2s;
            }
            
            .dashboard-item:hover .dashboard-actions {
                opacity: 1;
            }
        </style>

        <script>
            document.addEventListener('DOMContentLoaded', function() {
                loadDashboards();
                loadWidgetTypes();
                loadDashboardStats();
                
                // Refresh data every 30 seconds
                setInterval(() => {
                    loadDashboards();
                    loadDashboardStats();
                }, 30000);
            });

            async function loadDashboards() {
                try {
                    const response = await fetch('/api/dashboards');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayDashboards(data.data);
                    } else {
                        document.getElementById('dashboardList').innerHTML = '<div class="alert alert-warning">No dashboards found</div>';
                    }
                } catch (error) {
                    console.error('Failed to load dashboards:', error);
                    document.getElementById('dashboardList').innerHTML = '<div class="alert alert-danger">Failed to load dashboards</div>';
                }
            }

            async function loadWidgetTypes() {
                try {
                    const response = await fetch('/api/dashboards/widget-types');
                    const data = await response.json();
                    
                    if (data.success) {
                        displayWidgetTypes(data.data);
                        document.getElementById('widgetTypesCount').textContent = data.data.length;
                    }
                } catch (error) {
                    console.error('Failed to load widget types:', error);
                    document.getElementById('widgetTypes').innerHTML = '<div class="alert alert-danger">Failed to load widget types</div>';
                }
            }

            async function loadDashboardStats() {
                try {
                    const response = await fetch('/api/dashboards');
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('totalDashboards').textContent = data.count || 0;
                        
                        // Calculate total widgets across all dashboards
                        let totalWidgets = 0;
                        for (const dashboard of data.data) {
                            // This would normally come from the dashboard API
                            totalWidgets += dashboard.widget_count || 0;
                        }
                        document.getElementById('totalWidgets').textContent = totalWidgets;
                        document.getElementById('activeUsers').textContent = '1'; // Current user
                    }
                } catch (error) {
                    console.error('Failed to load dashboard stats:', error);
                }
            }

            function displayDashboards(dashboards) {
                const container = document.getElementById('dashboardList');
                
                if (dashboards.length === 0) {
                    container.innerHTML = '<div class="alert alert-info">No dashboards created yet. Click "Create Dashboard" to get started.</div>';
                    return;
                }

                let html = '';
                dashboards.forEach(dashboard => {
                    const isPublic = dashboard.is_public ? '<i class="fas fa-globe text-success" title="Public"></i>' : '<i class="fas fa-lock text-muted" title="Private"></i>';
                    const lastModified = dashboard.updated_at ? new Date(dashboard.updated_at).toLocaleDateString() : 'Never';
                    
                    html += \`
                        <div class="list-group-item dashboard-item d-flex justify-content-between align-items-center" onclick="editDashboard('\${dashboard.id}')">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center">
                                    <h6 class="mb-1">\${dashboard.name} \${isPublic}</h6>
                                    <div class="dashboard-actions ms-2">
                                        <button class="btn btn-sm btn-outline-primary me-1" onclick="event.stopPropagation(); editDashboard('\${dashboard.id}')" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteDashboard('\${dashboard.id}')" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                                <p class="mb-1 text-muted">\${dashboard.description || 'No description'}</p>
                                <small class="text-muted">Last modified: \${lastModified} • \${dashboard.widget_count || 0} widgets</small>
                            </div>
                        </div>
                    \`;
                });
                
                container.innerHTML = html;
            }

            function displayWidgetTypes(types) {
                const container = document.getElementById('widgetTypes');
                
                if (types.length === 0) {
                    container.innerHTML = '<div class="alert alert-warning">No widget types available</div>';
                    return;
                }

                // Group by category
                const categories = {};
                types.forEach(type => {
                    if (!categories[type.category]) {
                        categories[type.category] = [];
                    }
                    categories[type.category].push(type);
                });

                let html = '';
                Object.entries(categories).forEach(([category, categoryTypes]) => {
                    html += \`<div class="col-12"><h6 class="text-muted text-uppercase mt-2">\${category}</h6></div>\`;
                    
                    categoryTypes.forEach(type => {
                        html += \`
                            <div class="col-md-6">
                                <div class="widget-type-card">
                                    <div class="widget-type-icon">
                                        <i class="fas fa-\${type.icon || 'chart-bar'}"></i>
                                    </div>
                                    <h6>\${type.name}</h6>
                                    <small class="text-muted">\${type.description || 'No description'}</small>
                                </div>
                            </div>
                        \`;
                    });
                });
                
                container.innerHTML = html;
            }

            function createDashboard() {
                const modal = new bootstrap.Modal(document.getElementById('createDashboardModal'));
                modal.show();
            }

            async function submitCreateDashboard() {
                const formData = {
                    name: document.getElementById('dashboardName').value,
                    description: document.getElementById('dashboardDescription').value,
                    tags: document.getElementById('dashboardTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
                    isPublic: document.getElementById('dashboardPublic').checked
                };

                if (!formData.name.trim()) {
                    showToast('Please enter a dashboard name', 'error');
                    return;
                }

                try {
                    const response = await fetch('/api/dashboards', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        const modal = bootstrap.Modal.getInstance(document.getElementById('createDashboardModal'));
                        modal.hide();
                        document.getElementById('createDashboardForm').reset();
                        loadDashboards();
                        loadDashboardStats();
                        showToast('Dashboard created successfully', 'success');
                    } else {
                        showToast('Failed to create dashboard: ' + (data.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    console.error('Create dashboard error:', error);
                    showToast('Failed to create dashboard', 'error');
                }
            }

            function editDashboard(dashboardId) {
                // Navigate to dashboard editor
                window.location.href = '/dashboard/' + dashboardId;
            }

            async function deleteDashboard(dashboardId) {
                if (!confirm('Are you sure you want to delete this dashboard? This action cannot be undone.')) {
                    return;
                }

                try {
                    const response = await fetch('/api/dashboards/' + dashboardId, {
                        method: 'DELETE'
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        loadDashboards();
                        loadDashboardStats();
                        showToast('Dashboard deleted successfully', 'success');
                    } else {
                        showToast('Failed to delete dashboard: ' + (data.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    console.error('Delete dashboard error:', error);
                    showToast('Failed to delete dashboard', 'error');
                }
            }

            function showToast(message, type) {
                // Simple toast implementation
                console.log(\`[\${type.toUpperCase()}] \${message}\`);
                
                const alertClass = type === 'error' ? 'alert-danger' : 
                                 type === 'warning' ? 'alert-warning' : 
                                 type === 'success' ? 'alert-success' : 'alert-info';
                
                const toastHtml = \`
                    <div class="alert \${alertClass} alert-dismissible fade show position-fixed" role="alert" style="top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
                        \${message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                \`;
                
                document.body.insertAdjacentHTML('beforeend', toastHtml);
                
                // Auto-remove after 5 seconds
                setTimeout(() => {
                    const alerts = document.querySelectorAll('.alert');
                    if (alerts.length > 0) {
                        alerts[alerts.length - 1].remove();
                    }
                }, 5000);
            }
        </script>
    `;

    res.send(getPageTemplate({
        pageTitle: 'Dashboard Builder',
        pageIcon: 'fa-tachometer-alt',
        activeNav: 'dashboards',
        contentBody: pageContent,
        additionalCSS: '',
        additionalJS: '',
        req: req
    }));
});

module.exports = router;