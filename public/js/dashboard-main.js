/** Dashboard Main JavaScript - Version 2024-12-21 */

let grid;
let charts = {};
let isLocked = false;
let resizeObserverReady = false; // Flag to prevent auto-save during initial load
const DEBUG_LAYOUT_LOG = true; // Detailed per-widget layout logging

// Timezone-aware timestamp formatter
const USER_TIMEZONE = 'America/Edmonton';
function formatTimestamp(timestamp, options = {}) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        const defaultOptions = {
            timeZone: USER_TIMEZONE,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', { ...defaultOptions, ...options });
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return timestamp;
    }
}

function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            timeZone: USER_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (error) {
        console.error('Error formatting time:', error);
        return timestamp;
    }
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOMContentLoaded fired, starting initialization...');
    try {
        initializeGrid();
        console.log('✅ initializeGrid() completed');
    } catch (error) {
        console.error('❌ initializeGrid() failed:', error);
    }
    initializeCharts();
    // Load layout AFTER grid and charts are initialized
    setTimeout(() => {
        loadSavedLayout();
        setTimeout(() => {
            setupResizeObservers();
        }, 1000);
    }, 500);
    // Start refreshing system stats every 30 seconds
    refreshSystemStats();
    setInterval(refreshSystemStats, 30000);
    console.log('🎨 Muuri Dashboard initialized');
});

// Refresh system stats widget
async function refreshSystemStats() {
    try {
        const response = await fetch('/api/system/metrics', { credentials: 'same-origin' });
        if (!response.ok) return;
        const data = await response.json();
        
        const totalLogsEl = document.getElementById('totalLogs');
        const logsTodayEl = document.getElementById('logsToday');
        const sourcesEl = document.getElementById('sources');
        
        if (totalLogsEl) totalLogsEl.textContent = (data.totalLogs || 0).toLocaleString();
        if (logsTodayEl && data.logsToday !== undefined) logsTodayEl.textContent = (data.logsToday || 0).toLocaleString();
        if (sourcesEl) sourcesEl.textContent = (data.activeSources || 0).toLocaleString();
    } catch (error) {
        console.error('Failed to refresh system stats:', error);
    }
}

// Initialize Muuri Grid
function initializeGrid() {
    console.log('🔧 [1] Starting initializeGrid function...');
    console.log('🔧 [2] Checking for grid container...');
    const container = document.querySelector('.dashboard-grid');
    console.log('🔧 [3] Grid container:', container);
    console.log('📦 Grid container exists:', !!container);
    console.log('📦 Widget items found:', document.querySelectorAll('.widget-item').length);
    console.log('📦 Widget headers found:', document.querySelectorAll('.widget-header').length);
    
    console.log('🔧 [4] Creating Muuri instance...');
    grid = new Muuri('.dashboard-grid', {
        dragEnabled: true,
        dragHandle: '.widget-header',
        dragSortHeuristics: {
            sortInterval: 50,
            minDragDistance: 10,
            minBounceBackAngle: 1
        },
        layoutDuration: 0,
        layoutEasing: 'ease-out',
        dragRelease: {
            duration: 300,
            easing: 'ease-out'
        },
        dragSort: false,
        layout: function (grid, layoutId, items, width, height, callback) {
            var layout = [];
            items.forEach(function(item) {
                var position = item.getPosition();
                layout.push({
                    left: position.left,
                    top: position.top,
                    width: item._width,
                    height: item._height
                });
            });
            if (callback) callback(layout);
        }
    });
    
    console.log('✅ Muuri grid created, items:', grid.getItems().length);
    console.log('🎮 Drag enabled:', grid._settings.dragEnabled);
    console.log('🎮 Drag handle:', grid._settings.dragHandle);
    
    // Test drag handle styles
    const headers = document.querySelectorAll('.widget-header');
    headers.forEach((header, i) => {
        const styles = window.getComputedStyle(header);
        console.log(`Header ${i}: cursor=${styles.cursor}, pointer-events=${styles.pointerEvents}, z-index=${styles.zIndex}`);
    });
    
    // Debug: Monitor all drag events
    grid.on('dragStart', function(item) {
        console.log('🟢 dragStart event fired for', item.getElement().getAttribute('data-widget-id'));
    });
    
    grid.on('dragEnd', function(item) {
        console.log('🔴 dragEnd event fired for', item.getElement().getAttribute('data-widget-id'));
    });
    
    grid.on('dragReleaseStart', function(item) {
        console.log('🟡 dragReleaseStart event fired for', item.getElement().getAttribute('data-widget-id'));
    });
    
    grid.on('dragReleaseEnd', function(item) {
        console.log('🎯 dragReleaseEnd event fired for', item.getElement().getAttribute('data-widget-id'), 'isLocked:', isLocked);
        if (!isLocked) {
            setTimeout(function() {
                console.log('⏱️ Calling autoSaveLayout after 50ms delay');
                autoSaveLayout();
            }, 50);
        } else {
            console.log('🔒 Layout is locked, skipping auto-save');
        }
    });
    
    window.grid = grid;
    console.log('✅ [5] Grid initialization completed successfully');
}

console.log('✅ Dashboard main script loaded (external file)');
