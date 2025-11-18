/**
 * Advanced Dashboard Builder Route with Drag & Drop
 * Full dashboard creation and editing interface
 */

const express = require('express');
const { getPageTemplate } = require('../configs/templates/base');
const router = express.Router();

/**
 * Dashboard Builder - Drag & Drop Interface
 * GET /dashboard/builder/:id?
 */
router.get('/builder/:id?', async (req, res) => {
    try {
        const dashboardId = req.params.id;
        let dashboard = null;
        
        // Load existing dashboard if ID provided
        if (dashboardId) {
            const result = await req.dashboardBuilder.getDashboard(dashboardId);
            if (result.success) {
                dashboard = result.dashboard;
            }
        }
        
        const contentBody = `
        <div class="dashboard-builder-container">
            <div class="builder-header">
                <div class="builder-title">
                    <h2><i class="fas fa-magic"></i> ${dashboardId ? 'Edit Dashboard' : 'Dashboard Builder'}</h2>
                    <div class="dashboard-info" ${!dashboard ? 'style="display:none"' : ''}>
                        <input type="text" id="dashboardName" class="form-control" value="${dashboard?.name || ''}" placeholder="Dashboard Name">
                    </div>
                </div>
                
                <div class="builder-actions">
                    <button class="btn btn-secondary" onclick="previewDashboard()">
                        <i class="fas fa-eye"></i> Preview
                    </button>
                    <button class="btn btn-success" onclick="saveDashboard()">
                        <i class="fas fa-save"></i> Save Dashboard
                    </button>
                    <button class="btn btn-primary" onclick="window.location.href='/admin/dashboards'">
                        <i class="fas fa-arrow-left"></i> Back to Dashboards
                    </button>
                </div>
            </div>
            
            <div class="builder-workspace">
                <!-- Widget Palette -->
                <div class="widget-palette">
                    <div class="palette-header">
                        <h4><i class="fas fa-puzzle-piece"></i> Widget Types</h4>
                        <button class="btn btn-sm btn-outline-secondary" onclick="refreshWidgetTypes()">
                            <i class="fas fa-sync"></i>
                        </button>
                    </div>
                    <div class="palette-content" id="widgetPalette">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i> Loading widgets...
                        </div>
                    </div>
                </div>
                
                <!-- Dashboard Canvas -->
                <div class="dashboard-canvas">
                    <div class="canvas-header">
                        <h4><i class="fas fa-th-large"></i> Dashboard Layout</h4>
                        <div class="canvas-controls">
                            <label class="form-label">
                                <i class="fas fa-mobile-alt"></i> Layout:
                                <select id="layoutMode" class="form-select" onchange="changeLayoutMode()">
                                    <option value="grid">Grid (12 columns)</option>
                                    <option value="freeform">Freeform</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    
                    <div class="canvas-grid" id="dashboardCanvas">
                        <div class="empty-canvas">
                            <div class="empty-icon">
                                <i class="fas fa-plus-circle"></i>
                            </div>
                            <p>Drag widgets from the palette to start building your dashboard</p>
                        </div>
                    </div>
                </div>
                
                <!-- Properties Panel -->
                <div class="properties-panel">
                    <div class="panel-header">
                        <h4><i class="fas fa-cog"></i> Properties</h4>
                    </div>
                    <div class="panel-content" id="propertiesContent">
                        <div class="no-selection">
                            <i class="fas fa-mouse-pointer"></i>
                            <p>Select a widget to edit its properties</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Widget Configuration Modal -->
        <div class="modal fade" id="widgetConfigModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Configure Widget</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="widgetConfigContent">
                        <!-- Dynamic content -->
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveWidgetConfig()">Save Widget</button>
                    </div>
                </div>
            </div>
        </div>
        `;

        const additionalCSS = `
        .dashboard-builder-container {
            height: calc(100vh - 120px);
            display: flex;
            flex-direction: column;
            background: var(--bg-primary);
        }

        .builder-header {
            display: flex;
            justify-content: between;
            align-items: center;
            padding: 1rem;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            box-shadow: var(--shadow-small);
        }

        .builder-title {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex: 1;
        }

        .builder-title h2 {
            margin: 0;
            color: var(--text-primary);
        }

        .dashboard-info input {
            max-width: 300px;
        }

        .builder-actions {
            display: flex;
            gap: 0.5rem;
        }

        .builder-workspace {
            display: flex;
            flex: 1;
            min-height: 0;
        }

        .widget-palette {
            width: 250px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
        }

        .palette-header, .panel-header, .canvas-header {
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-tertiary);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .palette-header h4, .panel-header h4, .canvas-header h4 {
            margin: 0;
            font-size: 1rem;
            color: var(--text-primary);
        }

        .palette-content {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
        }

        .widget-type-item {
            background: var(--bg-primary);
            border: 2px dashed var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 0.75rem;
            cursor: grab;
            transition: all 0.2s ease;
            text-align: center;
        }

        .widget-type-item:hover {
            border-color: var(--accent-primary);
            background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-medium);
        }

        .widget-type-item.dragging {
            opacity: 0.5;
            cursor: grabbing;
        }

        .widget-icon {
            font-size: 1.5rem;
            color: var(--accent-primary);
            margin-bottom: 0.5rem;
        }

        .widget-name {
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .widget-description {
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .dashboard-canvas {
            flex: 1;
            background: var(--bg-primary);
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .canvas-controls {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .canvas-controls .form-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin: 0;
            font-size: 0.9rem;
        }

        .canvas-controls .form-select {
            width: auto;
            font-size: 0.9rem;
        }

        .canvas-grid {
            flex: 1;
            position: relative;
            overflow: auto;
            padding: 1rem;
            background: 
                linear-gradient(to right, var(--border-color) 1px, transparent 1px),
                linear-gradient(to bottom, var(--border-color) 1px, transparent 1px);
            background-size: 20px 20px;
        }

        .empty-canvas {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-muted);
            text-align: center;
        }

        .empty-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            opacity: 0.3;
        }

        .dashboard-widget {
            position: absolute;
            background: var(--bg-secondary);
            border: 2px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            cursor: move;
            min-width: 200px;
            min-height: 150px;
            box-shadow: var(--shadow-small);
        }

        .dashboard-widget.selected {
            border-color: var(--accent-primary);
            box-shadow: var(--shadow-medium);
        }

        .dashboard-widget.dragging {
            opacity: 0.7;
            z-index: 1000;
        }

        .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border-color);
        }

        .widget-title {
            font-weight: 700;
            color: var(--text-primary);
            font-size: 1.1rem;
            letter-spacing: 0.2px;
        }

        .widget-actions {
            display: flex;
            gap: 0.25rem;
        }

        .widget-actions button {
            padding: 0.25rem 0.5rem;
            font-size: 0.75rem;
            line-height: 1;
        }

        .widget-content {
            color: var(--text-secondary);
            font-size: 0.85rem;
            text-align: center;
            padding: 1rem 0;
        }

        .properties-panel {
            width: 280px;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
        }

        .panel-content {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
        }

        .no-selection {
            text-align: center;
            color: var(--text-muted);
            padding: 2rem 1rem;
        }

        .no-selection i {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            opacity: 0.5;
        }

        .property-group {
            margin-bottom: 1.5rem;
        }

        .property-group h6 {
            color: var(--text-primary);
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .property-item {
            margin-bottom: 0.75rem;
        }

        .loading-spinner {
            text-align: center;
            padding: 2rem;
            color: var(--text-muted);
        }

        .drop-zone {
            border: 2px dashed var(--accent-primary) !important;
            background: rgba(var(--accent-primary-rgb), 0.1) !important;
        }

        /* Responsive design */
        @media (max-width: 1200px) {
            .widget-palette, .properties-panel {
                width: 220px;
            }
        }

        @media (max-width: 992px) {
            .builder-workspace {
                flex-direction: column;
            }
            
            .widget-palette, .properties-panel {
                width: 100%;
                height: 200px;
            }
            
            .dashboard-canvas {
                min-height: 400px;
            }
        }
        `;

        const additionalJS = `
        let currentDashboard = ${dashboard ? JSON.stringify(dashboard) : 'null'};
        let selectedWidget = null;
        let widgetTypes = [];
        let nextWidgetId = 1;

        document.addEventListener('DOMContentLoaded', function() {
            initializeDashboardBuilder();
            loadWidgetTypes();
            
            if (currentDashboard) {
                loadDashboard(currentDashboard);
                document.getElementById('dashboardName').value = currentDashboard.name;
                document.querySelector('.dashboard-info').style.display = 'block';
            }
        });

        function initializeDashboardBuilder() {
            const canvas = document.getElementById('dashboardCanvas');
            
            // Enable drop functionality on canvas
            canvas.addEventListener('dragover', handleDragOver);
            canvas.addEventListener('drop', handleCanvasDrop);
            canvas.addEventListener('click', clearSelection);
        }

        async function loadWidgetTypes() {
            try {
                const response = await fetch('/api/dashboards/widget-types');
                const data = await response.json();
                
                if (data.success) {
                    widgetTypes = data.data;
                    displayWidgetPalette(widgetTypes);
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Failed to load widget types:', error);
                document.getElementById('widgetPalette').innerHTML = '<div class="alert alert-danger">Failed to load widget types</div>';
            }
        }

        function displayWidgetPalette(types) {
            const palette = document.getElementById('widgetPalette');
            
            if (types.length === 0) {
                palette.innerHTML = '<div class="alert alert-warning">No widget types available</div>';
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
                html += \`<div class="category-header">\${category.charAt(0).toUpperCase() + category.slice(1)}</div>\`;
                
                categoryTypes.forEach(type => {
                    html += \`
                        <div class="widget-type-item" draggable="true" data-widget-type="\${type.type}" 
                             onmousedown="startWidgetDrag(event)" ondragstart="handleDragStart(event)">
                            <div class="widget-icon">
                                <i class="fas fa-\${type.icon}"></i>
                            </div>
                            <div class="widget-name">\${type.name}</div>
                            <div class="widget-description">\${type.description}</div>
                        </div>
                    \`;
                });
            });
            
            palette.innerHTML = html;
        }

        function handleDragStart(event) {
            const widgetType = event.target.closest('.widget-type-item').dataset.widgetType;
            event.dataTransfer.setData('text/plain', widgetType);
            event.target.classList.add('dragging');
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.currentTarget.classList.add('drop-zone');
        }

        function handleCanvasDrop(event) {
            event.preventDefault();
            event.currentTarget.classList.remove('drop-zone');
            
            const widgetType = event.dataTransfer.getData('text/plain');
            if (widgetType) {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                
                createWidget(widgetType, x, y);
            }
            
            // Clean up dragging classes
            document.querySelectorAll('.dragging').forEach(el => {
                el.classList.remove('dragging');
            });
        }

        function createWidget(widgetType, x, y) {
            const widget = widgetTypes.find(w => w.type === widgetType);
            if (!widget) return;

            const widgetId = \`widget_\${nextWidgetId++}\`;
            const widgetElement = document.createElement('div');
            widgetElement.className = 'dashboard-widget';
            widgetElement.dataset.widgetId = widgetId;
            widgetElement.dataset.widgetType = widgetType;
            widgetElement.style.left = x + 'px';
            widgetElement.style.top = y + 'px';
            
            widgetElement.innerHTML = \`
                <div class="widget-header">
                    <div class="widget-title">
                        <i class="fas fa-\${widget.icon}"></i> \${widget.name}
                    </div>
                    <div class="widget-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="configureWidget('\${widgetId}')" title="Configure">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteWidget('\${widgetId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="widget-content">
                    \${widget.description}
                    <br><small class="text-muted">Click configure to set up this widget</small>
                </div>
            \`;

            // Make widget draggable and selectable
            widgetElement.addEventListener('mousedown', (e) => selectWidget(widgetId, e));
            widgetElement.addEventListener('dragstart', (e) => e.preventDefault());

            const canvas = document.getElementById('dashboardCanvas');
            const emptyState = canvas.querySelector('.empty-canvas');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            canvas.appendChild(widgetElement);
            selectWidget(widgetId);
            
            showToast('Widget added to dashboard', 'success');
        }

        function selectWidget(widgetId, event) {
            if (event) {
                event.stopPropagation();
            }
            
            // Clear previous selection
            document.querySelectorAll('.dashboard-widget').forEach(w => {
                w.classList.remove('selected');
            });
            
            // Select new widget
            const widget = document.querySelector(\`[data-widget-id="\${widgetId}"]\`);
            if (widget) {
                widget.classList.add('selected');
                selectedWidget = widgetId;
                showWidgetProperties(widgetId);
            }
        }

        function clearSelection(event) {
            if (!event.target.closest('.dashboard-widget')) {
                document.querySelectorAll('.dashboard-widget').forEach(w => {
                    w.classList.remove('selected');
                });
                selectedWidget = null;
                showNoSelection();
            }
        }

        function showWidgetProperties(widgetId) {
            const widget = document.querySelector(\`[data-widget-id="\${widgetId}"]\`);
            if (!widget) return;

            const widgetType = widget.dataset.widgetType;
            const position = { 
                x: parseInt(widget.style.left), 
                y: parseInt(widget.style.top),
                width: widget.offsetWidth,
                height: widget.offsetHeight
            };

            const propertiesContent = document.getElementById('propertiesContent');
            propertiesContent.innerHTML = \`
                <div class="property-group">
                    <h6>Widget Information</h6>
                    <div class="property-item">
                        <label class="form-label">Type</label>
                        <input type="text" class="form-control" value="\${widgetType}" readonly>
                    </div>
                    <div class="property-item">
                        <label class="form-label">Title</label>
                        <input type="text" class="form-control" id="widgetTitle" value="\${widget.querySelector('.widget-title').textContent.trim()}">
                    </div>
                </div>
                
                <div class="property-group">
                    <h6>Position & Size</h6>
                    <div class="row">
                        <div class="col-6">
                            <label class="form-label">X</label>
                            <input type="number" class="form-control" id="widgetX" value="\${position.x}">
                        </div>
                        <div class="col-6">
                            <label class="form-label">Y</label>
                            <input type="number" class="form-control" id="widgetY" value="\${position.y}">
                        </div>
                    </div>
                    <div class="row mt-2">
                        <div class="col-6">
                            <label class="form-label">Width</label>
                            <input type="number" class="form-control" id="widgetWidth" value="\${position.width}">
                        </div>
                        <div class="col-6">
                            <label class="form-label">Height</label>
                            <input type="number" class="form-control" id="widgetHeight" value="\${position.height}">
                        </div>
                    </div>
                </div>
                
                <div class="property-group">
                    <button class="btn btn-primary btn-sm w-100" onclick="configureWidget('\${widgetId}')">
                        <i class="fas fa-cog"></i> Advanced Configuration
                    </button>
                    <button class="btn btn-danger btn-sm w-100 mt-2" onclick="deleteWidget('\${widgetId}')">
                        <i class="fas fa-trash"></i> Remove Widget
                    </button>
                </div>
            \`;

            // Add event listeners for property changes
            ['widgetX', 'widgetY', 'widgetWidth', 'widgetHeight'].forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.addEventListener('change', updateWidgetProperties);
                }
            });
        }

        function showNoSelection() {
            const propertiesContent = document.getElementById('propertiesContent');
            propertiesContent.innerHTML = \`
                <div class="no-selection">
                    <i class="fas fa-mouse-pointer"></i>
                    <p>Select a widget to edit its properties</p>
                </div>
            \`;
        }

        function updateWidgetProperties() {
            if (!selectedWidget) return;

            const widget = document.querySelector(\`[data-widget-id="\${selectedWidget}"]\`);
            if (!widget) return;

            const x = document.getElementById('widgetX')?.value;
            const y = document.getElementById('widgetY')?.value;
            const width = document.getElementById('widgetWidth')?.value;
            const height = document.getElementById('widgetHeight')?.value;

            if (x !== undefined) widget.style.left = x + 'px';
            if (y !== undefined) widget.style.top = y + 'px';
            if (width !== undefined) widget.style.width = width + 'px';
            if (height !== undefined) widget.style.height = height + 'px';
        }

        function configureWidget(widgetId) {
            // Show configuration modal
            const modal = new bootstrap.Modal(document.getElementById('widgetConfigModal'));
            modal.show();
            
            // Load widget configuration interface based on widget type
            const widget = document.querySelector(\`[data-widget-id="\${widgetId}"]\`);
            const widgetType = widget ? widget.dataset.widgetType : 'unknown';
            
            document.getElementById('widgetConfigContent').innerHTML = \`
                <div class="mb-3">
                    <label class="form-label">Widget Title</label>
                    <input type="text" class="form-control" id="widgetTitle" value="${widgetType} Widget">
                </div>
                <div class="mb-3">
                    <label class="form-label">Refresh Interval (seconds)</label>
                    <input type="number" class="form-control" id="widgetRefresh" value="30" min="5">
                </div>
                <div class="mb-3">
                    <label class="form-label">Data Source</label>
                    <select class="form-control" id="widgetDataSource">
                        <option value="logs">System Logs</option>
                        <option value="metrics">System Metrics</option>
                        <option value="integrations">Integrations</option>
                        <option value="custom">Custom Query</option>
                    </select>
                </div>
                <button onclick="saveWidgetConfig('${widgetId}')" class="btn btn-primary">
                    <i class="fas fa-save"></i> Save Configuration
                </button>
            \`;
        }
        
        function saveWidgetConfig(widgetId) {
            const title = document.getElementById('widgetTitle').value;
            const refresh = document.getElementById('widgetRefresh').value;
            const dataSource = document.getElementById('widgetDataSource').value;
            
            showToast(\`Widget configuration saved: \${title}\`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('widgetConfigModal')).hide();
        }

        function deleteWidget(widgetId) {
            if (confirm('Are you sure you want to delete this widget?')) {
                const widget = document.querySelector(\`[data-widget-id="\${widgetId}"]\`);
                if (widget) {
                    widget.remove();
                    
                    if (selectedWidget === widgetId) {
                        selectedWidget = null;
                        showNoSelection();
                    }
                    
                    // Show empty state if no widgets left
                    const canvas = document.getElementById('dashboardCanvas');
                    const widgets = canvas.querySelectorAll('.dashboard-widget');
                    if (widgets.length === 0) {
                        const emptyState = canvas.querySelector('.empty-canvas');
                        if (emptyState) {
                            emptyState.style.display = 'flex';
                        }
                    }
                    
                    showToast('Widget deleted', 'success');
                }
            }
        }

        async function saveDashboard() {
            const name = document.getElementById('dashboardName')?.value?.trim();
            if (!name) {
                showToast('Please enter a dashboard name', 'error');
                return;
            }

            // Collect dashboard data
            const widgets = [];
            document.querySelectorAll('.dashboard-widget').forEach(widget => {
                const widgetData = {
                    id: widget.dataset.widgetId,
                    type: widget.dataset.widgetType,
                    name: widget.querySelector('.widget-title').textContent.trim(),
                    position: {
                        x: parseInt(widget.style.left) || 0,
                        y: parseInt(widget.style.top) || 0,
                        width: widget.offsetWidth,
                        height: widget.offsetHeight
                    },
                    configuration: {}
                };
                widgets.push(widgetData);
            });

            const dashboardData = {
                name: name,
                description: \`Dashboard with \${widgets.length} widgets\`,
                layoutConfig: {
                    mode: document.getElementById('layoutMode')?.value || 'grid',
                    widgets: widgets
                }
            };

            try {
                let response;
                if (currentDashboard) {
                    // Update existing dashboard
                    response = await fetch(\`/api/dashboards/\${currentDashboard.id}\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(dashboardData)
                    });
                } else {
                    // Create new dashboard
                    response = await fetch('/api/dashboards', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(dashboardData)
                    });
                }

                const result = await response.json();
                if (result.success) {
                    showToast('Dashboard saved successfully!', 'success');
                    if (!currentDashboard) {
                        // Redirect to edit the newly created dashboard
                        setTimeout(() => {
                            window.location.href = \`/dashboard/builder/\${result.id}\`;
                        }, 1500);
                    }
                } else {
                    showToast('Failed to save dashboard: ' + result.error, 'error');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Save dashboard error:', error);
                showToast('Failed to save dashboard', 'error');
            }
        }

        function previewDashboard() {
            try {
                // Collect current widget configuration
                const widgets = [];
                document.querySelectorAll('.dashboard-widget').forEach(widgetEl => {
                    const widgetId = widgetEl.dataset.widgetId;
                    const widgetType = widgetEl.dataset.widgetType;
                    const rect = widgetEl.getBoundingClientRect();
                    
                    widgets.push({
                        id: widgetId,
                        type: widgetType,
                        position: {
                            x: parseInt(widgetEl.style.left) || 0,
                            y: parseInt(widgetEl.style.top) || 0,
                            width: parseInt(widgetEl.style.width) || 300,
                            height: parseInt(widgetEl.style.height) || 200
                        }
                    });
                });
                
                const dashboardData = {
                    name: document.getElementById('dashboardName')?.value || 'Untitled Dashboard',
                    description: currentDashboard?.description || '',
                    widgets: widgets
                };
                
                // Store in sessionStorage for preview window
                sessionStorage.setItem('dashboard_preview_data', JSON.stringify(dashboardData));
                
                // Open preview in new window
                const previewWindow = window.open('/dashboard/preview', '_blank', 'width=1280,height=800');
                if (!previewWindow) {
                    showToast('Please allow popups to preview dashboard', 'warning');
                } else {
                    showToast('Opening dashboard preview', 'success');
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Preview error:', error);
                showToast('Failed to open preview', 'error');
            }
        }

        function refreshWidgetTypes() {
            loadWidgetTypes();
            showToast('Widget types refreshed', 'success');
        }

        function changeLayoutMode() {
            const mode = document.getElementById('layoutMode').value;
            showToast(\`Layout mode changed to \${mode}\`, 'info');
        }

        function loadDashboard(dashboard) {
            if (!dashboard.configuration?.widgets) return;

            const canvas = document.getElementById('dashboardCanvas');
            const emptyState = canvas.querySelector('.empty-canvas');
            if (emptyState) {
                emptyState.style.display = 'none';
            }

            dashboard.configuration.widgets.forEach(widgetData => {
                const widget = widgetTypes.find(w => w.type === widgetData.type);
                if (!widget) return;

                const widgetElement = document.createElement('div');
                widgetElement.className = 'dashboard-widget';
                widgetElement.dataset.widgetId = widgetData.id;
                widgetElement.dataset.widgetType = widgetData.type;
                widgetElement.style.left = widgetData.position.x + 'px';
                widgetElement.style.top = widgetData.position.y + 'px';
                widgetElement.style.width = widgetData.position.width + 'px';
                widgetElement.style.height = widgetData.position.height + 'px';
                
                widgetElement.innerHTML = \`
                    <div class="widget-header">
                        <div class="widget-title">
                            <i class="fas fa-\${widget.icon}"></i> \${widgetData.name || widget.name}
                        </div>
                        <div class="widget-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="configureWidget('\${widgetData.id}')" title="Configure">
                                <i class="fas fa-cog"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteWidget('\${widgetData.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="widget-content">
                        \${widget.description}
                        <br><small class="text-muted">Configured widget</small>
                    </div>
                \`;

                widgetElement.addEventListener('mousedown', (e) => selectWidget(widgetData.id, e));
                canvas.appendChild(widgetElement);
                
                nextWidgetId = Math.max(nextWidgetId, parseInt(widgetData.id.replace('widget_', '')) + 1);
            });
        }

        // showToast() is provided by base.js template
        `;

        const html = getPageTemplate('Dashboard Builder', contentBody, additionalCSS, additionalJS, req, 'dashboard-builder', 'fa-magic');
        res.send(html);

    } catch (error) {
        req.loggers.api.error('Dashboard builder error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Dashboard Preview Route
 * GET /dashboard/preview
 */
router.get('/preview', async (req, res) => {
    const contentBody = `
        <div style="height: 100vh; background: var(--bg-primary); overflow: auto;">
            <div style="background: var(--bg-secondary); padding: 1rem; border-bottom: 1px solid var(--border-color); box-shadow: var(--shadow-small);">
                <div style="display: flex; justify-content: space-between; align-items: center; max-width: 1400px; margin: 0 auto;">
                    <h2 style="margin: 0;"><i class="fas fa-eye"></i> Dashboard Preview</h2>
                    <button onclick="window.close()" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Close Preview
                    </button>
                </div>
            </div>
            <div id="preview-container" style="padding: 2rem; max-width: 1400px; margin: 0 auto;">
                <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                    <p style="margin-top: 1rem;">Loading dashboard preview...</p>
                </div>
            </div>
        </div>
        <script>
            // Load dashboard data from sessionStorage
            try {
                const previewData = sessionStorage.getItem('dashboard_preview_data');
                if (!previewData) {
                    document.getElementById('preview-container').innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                            <p style="margin-top: 1rem;">No preview data available</p>
                        </div>
                    \`;
                } else {
                    const dashboard = JSON.parse(previewData);
                    renderDashboardPreview(dashboard);
                }
            } catch (error) {
                req.app.locals?.loggers?.system?.error('Preview load error:', error);
                document.getElementById('preview-container').innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                        <p style="margin-top: 1rem;">Failed to load preview</p>
                    </div>
                \`;
            }
            
            function renderDashboardPreview(dashboard) {
                const container = document.getElementById('preview-container');
                container.innerHTML = \`
                    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                        <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">\${dashboard.name}</h3>
                        <p style="margin: 0; color: var(--text-secondary);">\${dashboard.description || 'No description'}</p>
                    </div>
                    <div id="widgets-container" style="position: relative; min-height: 600px; background: var(--bg-primary); border-radius: 12px; border: 1px dashed var(--border-color); padding: 1rem;">
                        \${dashboard.widgets.length === 0 ? 
                            \`<div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-cube" style="font-size: 2rem;"></i>
                                <p style="margin-top: 1rem;">No widgets added yet</p>
                            </div>\` : ''
                        }
                    </div>
                \`;
                
                // Render widgets
                const widgetsContainer = document.getElementById('widgets-container');
                dashboard.widgets.forEach(widget => {
                    const widgetEl = document.createElement('div');
                    widgetEl.style.cssText = \`
                        position: absolute;
                        left: \${widget.position.x}px;
                        top: \${widget.position.y}px;
                        width: \${widget.position.width}px;
                        height: \${widget.position.height}px;
                        background: var(--bg-secondary);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 1rem;
                        box-shadow: var(--shadow-small);
                    \`;
                    widgetEl.innerHTML = \`
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <h5 style="margin: 0; color: var(--text-primary);">\${widget.type}</h5>
                            <span style="background: var(--accent-primary); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">\${widget.id}</span>
                        </div>
                        <div style="color: var(--text-muted); font-size: 0.875rem;">
                            Widget preview content would appear here
                        </div>
                    \`;
                    widgetsContainer.appendChild(widgetEl);
                });
            }
        </script>
    `;
    
    res.send(getPageTemplate({
        pageTitle: 'Dashboard Preview',
        pageIcon: 'fas fa-eye',
        activeNav: 'dashboards',
        contentBody: contentBody,
        req: req
    }));
});

module.exports = router;