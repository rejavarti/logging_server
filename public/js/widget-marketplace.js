// Widget Marketplace Functions

function filterWidgets() {
    const search = document.getElementById('widgetSearch').value.toLowerCase();
    const category = document.getElementById('widgetCategory').value;
    
    const filtered = widgetCatalog.filter(w => {
        const matchesSearch = w.name.toLowerCase().includes(search) || w.description.toLowerCase().includes(search);
        const matchesCategory = category === 'all' || w.category === category;
        return matchesSearch && matchesCategory;
    });
    
    renderWidgetGrid(filtered);
}

function renderWidgetGrid(widgets) {
    const grid = document.getElementById('widgetGrid');
    grid.innerHTML = widgets.map(function(w) {
        return '<div class="widget-card-market" onclick="installWidget(\'' + w.id + '\')">' +
            '<h3><i class="fas fa-' + w.icon + '"></i> ' + w.name + '</h3>' +
            '<p>' + w.description + '</p>' +
            '<span class="widget-badge">' + w.category + '</span>' +
            '</div>';
    }).join('');
}

function installWidget(widgetId) {
    const widget = widgetCatalog.find(w => w.id === widgetId);
    if (!widget) return;
    
    const widgetHTML = generateWidgetHTML(widget);
    const div = document.createElement('div');
    div.className = 'widget-item';
    div.setAttribute('data-widget-id', widget.id);
    
    // Add size class based on widget definition
    let sizeClass = 'widget-' + (widget.size || 'medium');
    
    div.innerHTML = '<div class="widget-item-content ' + sizeClass + '">' +
        '<div class="widget-card">' +
        '<div class="widget-header">' +
        '<div class="widget-title"><i class="fas fa-' + widget.icon + '"></i> ' + widget.name + '</div>' +
        '<div class="widget-actions">' +
        '<button class="btn-icon" title="Refresh" onclick="refreshWidget(\'' + widget.id + '\')"><i class="fas fa-sync-alt"></i></button>' +
        '<button class="btn-icon" title="Remove" onclick="removeWidget(this)"><i class="fas fa-times"></i></button>' +
        '</div></div>' +
        '<div class="widget-body">' + widgetHTML + '</div>' +
        '</div></div>';
    
    document.querySelector('.dashboard-grid').appendChild(div);
    
    // Add to Muuri grid
    if (window.grid) {
        try {
            const items = window.grid.add([div]);
            window.grid.refreshItems();
            window.grid.layout();
            
            // Setup resize observer for this specific widget
            if (items && items.length > 0) {
                const widgetContent = div.querySelector('.widget-item-content');
                if (widgetContent && typeof ResizeObserver !== 'undefined') {
                    // Make widget-item-content resizable
                    widgetContent.style.resize = 'both';
                    widgetContent.style.overflow = 'auto';
                    
                    // Debounce to avoid too many layout calls
                    let resizeTimeout;
                    const resizeObserver = new ResizeObserver(function(entries) {
                        clearTimeout(resizeTimeout);
                        resizeTimeout = setTimeout(function() {
                            // Notify Muuri that item dimensions changed
                            window.grid.refreshItems([div]);
                            window.grid.layout();
                            
                            // Trigger chart resize if applicable
                            if (typeof window.charts !== 'undefined') {
                                Object.keys(window.charts).forEach(function(chartId) {
                                    if (window.charts[chartId] && window.charts[chartId].resize) {
                                        window.charts[chartId].resize();
                                    }
                                });
                            }
                            
                            // Save layout after resize completes
                            if (typeof saveLayout === 'function') {
                                saveLayout();
                            }
                        }, 150);
                    });
                    resizeObserver.observe(widgetContent);
                    
                    // Store observer to clean up later if needed
                    div._resizeObserver = resizeObserver;
                }
            }
        } catch (e) {
            console.error('Muuri add failed:', e);
        }
    }
    
    if (typeof window.initializeWidget === 'function') {
        window.initializeWidget(widget.id);
    } else if (typeof window.initializeWidgetData === 'function') {
        window.initializeWidgetData(widget.id);
    } else {
        console.warn('No widget initialization function found for', widget.id);
    }
    closeModal('widgetMarketplace');
    saveLayout();
    
    showToast('Added ' + widget.name, 'success');
}

function generateWidgetHTML(widget) {
    switch(widget.category) {
        case 'analytics':
            return '<div class="chart-container" id="chart-' + widget.id + '"></div>';
        case 'monitoring':
            return widget.size === 'small' 
                ? '<div class="stat-item"><div class="stat-icon"><i class="fas fa-' + widget.icon + '"></i></div><div class="stat-value" id="val-' + widget.id + '">--</div><div class="stat-label">' + widget.name + '</div></div>'
                : '<div class="chart-container" id="chart-' + widget.id + '"></div>';
        case 'data':
            return '<div id="data-' + widget.id + '" style="overflow-y: auto; height: 100%;"><p style="text-align:center; color: var(--text-muted); padding: 2rem;">Loading data...</p></div>';
        case 'actions':
            return '<div id="action-' + widget.id + '" style="padding: 1rem;">' + getActionWidgetHTML(widget.id) + '</div>';
        case 'system':
            return '<div id="system-' + widget.id + '" style="padding: 1rem;"><p style="text-align:center; color: var(--text-muted); padding: 1rem;">Loading...</p></div>';
        case 'custom':
            return '<div class="chart-container" id="chart-' + widget.id + '"></div>';
        default:
            return '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Widget loading...</div>';
    }
}

function getActionWidgetHTML(widgetId) {
    var t = {};
    t['quick-search'] = '<input type="text" id="quick-search-input" placeholder="Search logs..." title="Try: level:error AND source:api" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;" onkeypress="if(event.key===\'Enter\') performQuickSearch()">' +
        '<button class="btn" style="width: 100%;" onclick="performQuickSearch()"><i class="fas fa-search"></i> Search</button>' +
        '<div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem; text-align:center;">Supports: field:value AND/OR operators</div>';
    t['log-export'] = '<select id="export-format" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">' +
        '<option value="json">JSON</option><option value="csv">CSV</option><option value="ndjson">NDJSON</option><option value="xml">XML</option></select>' +
        '<button class="btn" style="width: 100%;" onclick="performLogExport()"><i class="fas fa-download"></i> Export</button>';
    t['filter-presets'] = '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="applyFilterPreset(\'errors\')">Errors Only</button>' +
        '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="applyFilterPreset(\'lasthour\')">Last Hour</button>' +
        '<button class="btn btn-secondary" style="width: 100%;" onclick="applyFilterPreset(\'critical\')">Critical Events</button>';
    t['bookmark-manager'] = '<div style="display:flex; flex-direction:column;">' +
        '<input type="text" id="bookmark-label-input" placeholder="Bookmark label..." style="width:100%; padding:0.5rem; border:1px solid var(--border-color); border-radius:6px; margin-bottom:0.5rem;" />' +
        '<textarea id="bookmark-query-input" placeholder="Query (e.g. level=error AND source=api)" style="width:100%; padding:0.5rem; border:1px solid var(--border-color); border-radius:6px; margin-bottom:0.5rem; min-height:60px;"></textarea>' +
        '<button class="btn" style="width:100%; margin-bottom:0.5rem;" onclick="saveBookmark()"><i class="fas fa-bookmark"></i> Save Bookmark</button>' +
        '<div id="bookmark-list" style="flex:1; max-height:160px; overflow-y:auto; border:1px solid var(--border-color); border-radius:4px; padding:0.5rem; font-size:0.75rem;"></div>' +
        '</div>';
    t['stats-calculator'] = '<div style="text-align: center;">' +
        '<button class="btn" style="width: 100%; margin-bottom: 0.5rem;" onclick="calculateStats(\'count\')"><i class="fas fa-hashtag"></i> Count</button>' +
        '<button class="btn" style="width: 100%; margin-bottom: 0.5rem;" onclick="calculateStats(\'avg\')"><i class="fas fa-chart-line"></i> Average</button>' +
        '<button class="btn" style="width: 100%;" onclick="calculateStats(\'sum\')"><i class="fas fa-plus"></i> Sum</button>' +
        '</div>';
    t['bulk-actions'] = '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="bulkAction(\'delete\')"><i class="fas fa-trash"></i> Delete Selected</button>' +
        '<button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="bulkAction(\'archive\')"><i class="fas fa-archive"></i> Archive</button>' +
        '<button class="btn btn-secondary" style="width: 100%;" onclick="bulkAction(\'export\')"><i class="fas fa-file-export"></i> Export</button>';
    t['quick-notes'] = '<textarea id="quick-notes-text" placeholder="Add notes..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem; min-height: 80px;"></textarea>' +
        '<button class="btn" style="width: 100%;" onclick="saveQuickNote()"><i class="fas fa-save"></i> Save Note</button>' +
        '<div id="quick-notes-list" style="margin-top:0.75rem; max-height:160px; overflow-y:auto; font-size:0.75rem; border:1px solid var(--border-color); border-radius:4px; padding:0.5rem;"></div>';
    return t[widgetId] || '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">Widget configuration in progress...</p>';
}

// Expose functions globally (needed for inline onclick handlers in generated HTML)
window.filterWidgets = filterWidgets;
window.installWidget = installWidget;
window.renderWidgetGrid = renderWidgetGrid;
window.generateWidgetHTML = generateWidgetHTML;
window.getActionWidgetHTML = getActionWidgetHTML;
