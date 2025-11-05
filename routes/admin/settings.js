// Admin Settings Route - Enterprise Configuration Management
// Extracted from server.js for better organization and maintainability

const express = require('express');
const { getPageTemplate } = require('../../templates/base');
const router = express.Router();
    // Admin Settings page
    router.get('/settings', (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).send(getPageTemplate({
                pageTitle: 'Access Denied',
                pageIcon: 'fas fa-ban',
                activeNav: '',
                contentBody: '<div class="card"><div class="card-body"><h2 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Access Denied</h2><p>Admin privileges required to access this page.</p><a href="/dashboard" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a></div></div>',
                additionalCSS: '',
                additionalJS: '',
                req: req
            }));
        }
        
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
            .settings-grid {
                display: grid;
                gap: 1.5rem;
            }
            .setting-item {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 1rem;
                padding: 1.5rem;
                background: var(--bg-secondary);
                border-radius: 8px;
                border: 1px solid var(--border-color);
                align-items: center;
            }
            .setting-label {
                font-weight: 600;
                color: var(--text-primary);
            }
            .setting-label i {
                margin-right: 0.5rem;
                color: var(--accent-primary);
            }
            .setting-description {
                font-size: 0.875rem;
                color: var(--text-muted);
                margin-top: 0.25rem;
            }
            .setting-control {
                display: flex;
                gap: 0.5rem;
                align-items: center;
            }
            .setting-control input,
            .setting-control select {
                flex: 1;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                background: var(--bg-primary);
                color: var(--text-primary);
            }
            .setting-control input[type="checkbox"] {
                flex: none;
                width: 20px;
                height: 20px;
                cursor: pointer;
            }
            .setting-readonly {
                padding: 0.75rem;
                background: var(--bg-tertiary);
                border-radius: 6px;
                color: var(--text-muted);
                font-family: 'Courier New', monospace;
            }
            .tab-btn { transition: all 0.3s ease; }
            .tab-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-light); }
            .tab-btn.active { background: var(--gradient-ocean) !important; color: white !important; }
            .save-btn {
                position: sticky;
                bottom: 1rem;
                z-index: 10;
            }
            .section-header {
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--text-primary);
                margin: 1.5rem 0 1rem 0;
                padding-bottom: 0.5rem;
                border-bottom: 2px solid var(--border-color);
            }
            .section-header i {
                margin-right: 0.5rem;
                color: var(--accent-primary);
            }
        `;

        const contentBody = `
            <!-- Tab Navigation -->
            <div style="background: var(--bg-primary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-light); border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button onclick="switchTab('settings')" id="tab-settings" class="tab-btn active" style="padding: 0.75rem 1.5rem; border: none; background: var(--gradient-ocean); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-cog"></i> Settings
                    </button>
                    <button onclick="switchTab('api-keys')" id="tab-api-keys" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-key"></i> API Keys
                    </button>
                    <button onclick="switchTab('backups')" id="tab-backups" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-database"></i> Backups
                    </button>
                    <button onclick="switchTab('metrics')" id="tab-metrics" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-heartbeat"></i> System Metrics
                    </button>
                    <button onclick="switchTab('appearance')" id="tab-appearance" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-palette"></i> Appearance
                    </button>
                    <button onclick="switchTab('import-export')" id="tab-import-export" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-file-import"></i> Import/Export
                    </button>
                </div>
            </div>

            <!-- API Keys Tab Content -->
            <div id="content-api-keys" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3><i class="fas fa-key"></i> API Key Management</h3>
                        <button onclick="showCreateAPIKeyModal()" class="btn" style="background: var(--success-color);">
                            <i class="fas fa-plus"></i> Generate New Key
                        </button>
                    </div>
                    <div class="card-body">
                        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                            API keys allow external applications to authenticate with the logging server. Keep your keys secure!
                        </p>
                        <div id="apiKeysContainer">
                            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                                <p style="margin-top: 1rem;">Loading API keys...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Settings Tab Content -->
            <div id="content-settings" class="tab-content">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-cog"></i> System Settings</h3>
                        <button onclick="loadSettings()" class="btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="card-body">
                        <div id="settings-content">
                            <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                                <br>Loading system settings...
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Backups Tab Content -->
            <div id="content-backups" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-database"></i> Database Backups</h3>
                        <button onclick="createBackup()" class="btn">
                            <i class="fas fa-plus"></i> Create Backup
                        </button>
                    </div>
                    <div class="card-body">
                        <div id="backups-content">
                            <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                                <br>Loading backups...
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Metrics Tab Content -->
            <div id="content-metrics" class="tab-content" style="display: none;">
                <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
                
                <div style="display: grid; grid-template-columns: 320px 1fr; gap: 1.25rem;">
                    <!-- Stats Table -->
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-chart-bar"></i> Current Stats</h3>
                        </div>
                        <div style="padding: 1.5rem;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tbody>
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 1rem 0; color: var(--text-muted);">
                                            <i class="fas fa-memory" style="color: #10b981; margin-right: 0.5rem; width: 20px;"></i>
                                            Memory Usage
                                        </td>
                                        <td style="padding: 1rem 0; text-align: right;">
                                            <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-current-memory">-- MB</div>
                                            <div style="font-size: 0.75rem; color: var(--text-muted);"><span id="metrics-memory-percent">--</span>% of heap</div>
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 1rem 0; color: var(--text-muted);">
                                            <i class="fas fa-microchip" style="color: #3b82f6; margin-right: 0.5rem; width: 20px;"></i>
                                            CPU Usage
                                        </td>
                                        <td style="padding: 1rem 0; text-align: right;">
                                            <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-current-cpu">--%</div>
                                            <div style="font-size: 0.75rem; color: var(--text-muted);">Process load</div>
                                        </td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 1rem 0; color: var(--text-muted);">
                                            <i class="fas fa-clock" style="color: #f59e0b; margin-right: 0.5rem; width: 20px;"></i>
                                            Server Uptime
                                        </td>
                                        <td style="padding: 1rem 0; text-align: right;">
                                            <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-server-uptime">--</div>
                                            <div style="font-size: 0.75rem; color: #10b981;"><i class="fas fa-circle" style="font-size: 0.4rem;"></i> Online</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 1rem 0; color: var(--text-muted);">
                                            <i class="fas fa-exchange-alt" style="color: #8b5cf6; margin-right: 0.5rem; width: 20px;"></i>
                                            Total Requests
                                        </td>
                                        <td style="padding: 1rem 0; text-align: right;">
                                            <div style="font-weight: 600; font-size: 1.1rem;" id="metrics-request-total">--</div>
                                            <div style="font-size: 0.75rem; color: var(--text-muted);"><span id="metrics-request-rate">--</span>/min</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Charts Column -->
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <!-- Memory Chart -->
                        <div class="card">
                            <div class="card-header">
                                <h3><i class="fas fa-memory"></i> Memory Usage</h3>
                            </div>
                            <div style="padding: 1.5rem; height: 200px;">
                                <canvas id="metrics-memory-chart"></canvas>
                            </div>
                        </div>

                        <!-- CPU Chart -->
                        <div class="card">
                            <div class="card-header">
                                <h3><i class="fas fa-microchip"></i> CPU Usage</h3>
                            </div>
                            <div style="padding: 1.5rem; height: 200px;">
                                <canvas id="metrics-cpu-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Appearance Tab Content -->
            <div id="content-appearance" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-palette"></i> Theme Customization</h3>
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="saveTheme()" class="btn">
                                <i class="fas fa-save"></i> Save Theme
                            </button>
                            <button onclick="resetTheme()" class="btn" style="background: var(--error-color);">
                                <i class="fas fa-undo"></i> Reset to Default
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                            <!-- Left Column: Controls -->
                            <div>
                                <!-- Color Pickers Section -->
                                <div class="section-header">
                                    <i class="fas fa-palette"></i> Color Scheme
                                </div>
                                
                                <div style="display: grid; gap: 1rem;">
                                    <!-- Background Colors -->
                                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                        <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                            <i class="fas fa-window-maximize" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                            Background Colors
                                        </h4>
                                        <div style="display: grid; gap: 0.75rem;">
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-bg-primary" value="#ffffff" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Primary Background</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Main content areas</div>
                                                </div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-bg-secondary" value="#f8fafc" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Secondary Background</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Panels and cards</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Right Column: Live Preview -->
                            <div>
                                <div class="section-header">
                                    <i class="fas fa-eye"></i> Live Preview
                                </div>
                                
                                <div id="theme-preview-container" style="padding: 1.5rem; background: var(--bg-primary); border: 2px solid var(--border-color); border-radius: 8px;">
                                    <!-- Sample Card -->
                                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;">
                                        <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Sample Card</h3>
                                        <p style="margin: 0 0 1rem 0; color: var(--text-secondary);">This is how your content will look with the new theme.</p>
                                        <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">Subtle text and hints appear like this.</p>
                                    </div>
                                    
                                    <!-- Sample Buttons -->
                                    <div style="margin-bottom: 1.5rem;">
                                        <button class="btn" style="margin-right: 0.5rem; margin-bottom: 0.5rem;">
                                            <i class="fas fa-check"></i> Primary Button
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Import/Export Tab Content -->
            <div id="content-import-export" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-file-import"></i> Import/Export Settings</h3>
                    </div>
                    <div class="card-body">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                            <!-- Export Section -->
                            <div>
                                <div class="section-header">
                                    <i class="fas fa-download"></i> Export Settings
                                </div>
                                <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                                        Export all system settings, configurations, and integration settings to a JSON file.
                                    </p>
                                    <button onclick="exportSettings()" class="btn" style="width: 100%;">
                                        <i class="fas fa-download"></i> Download Settings
                                    </button>
                                </div>
                            </div>

                            <!-- Import Section -->
                            <div>
                                <div class="section-header">
                                    <i class="fas fa-upload"></i> Import Settings
                                </div>
                                <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                                        Import settings from a previously exported JSON file.
                                    </p>
                                    <input type="file" id="import-file-input" accept=".json" style="display: none;" onchange="handleFileSelect(event)">
                                    <button onclick="document.getElementById('import-file-input').click()" class="btn" style="width: 100%; background: var(--warning-color);">
                                        <i class="fas fa-upload"></i> Upload Settings File
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const additionalJS = `
            let currentSettings = {};
            let metricsInterval;

            // Tab switching
            function switchTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
                document.querySelectorAll('.tab-btn').forEach(btn => { 
                    btn.classList.remove('active'); 
                    btn.style.background = 'var(--bg-secondary)'; 
                    btn.style.color = 'var(--text-primary)'; 
                });
                
                document.getElementById('content-' + tabName).style.display = 'block';
                const activeBtn = document.getElementById('tab-' + tabName);
                activeBtn.classList.add('active');
                activeBtn.style.background = 'var(--gradient-ocean)';
                activeBtn.style.color = 'white';
                
                if (metricsInterval) {
                    clearInterval(metricsInterval);
                    metricsInterval = null;
                }
                
                if (tabName === 'settings') {
                    loadSettings();
                } else if (tabName === 'api-keys') {
                    loadAPIKeys();
                } else if (tabName === 'backups') {
                    loadBackups();
                } else if (tabName === 'metrics') {
                    refreshMetrics();
                    metricsInterval = setInterval(fetchSystemMetrics, 5000);
                } else if (tabName === 'appearance') {
                    loadThemeSettings();
                }
            }

            async function loadSettings() {
                try {
                    const response = await fetch('/api/settings');
                    if (!response.ok) throw new Error('Failed to fetch settings');
                    
                    currentSettings = await response.json();
                    renderSettings();
                } catch (error) {
                    console.error('Error loading settings:', error);
                    document.getElementById('settings-content').innerHTML = \`
                        <p style="text-align: center; color: var(--error-color); padding: 2rem;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <br>Failed to load settings
                        </p>
                    \`;
                }
            }

            function renderSettings() {
                document.getElementById('settings-content').innerHTML = \`
                    <div class="settings-grid">
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-tag"></i> System Name</div>
                                <div class="setting-description">Platform identifier</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" value="\${currentSettings.system?.name || 'Enterprise Logging Platform'}" readonly>
                            </div>
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-code-branch"></i> Version</div>
                                <div class="setting-description">Current server version</div>
                            </div>
                            <div class="setting-readonly">\${currentSettings.system?.version || '2.1.0-stable-enhanced'}</div>
                        </div>
                    </div>
                \`;
            }

            async function loadAPIKeys() {
                try {
                    const response = await fetch('/api/api-keys');
                    if (!response.ok) throw new Error('Failed to fetch API keys');
                    
                    const data = await response.json();
                    renderAPIKeys(data.keys || []);
                } catch (error) {
                    console.error('Error loading API keys:', error);
                    document.getElementById('apiKeysContainer').innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Failed to load API keys</p>
                        </div>
                    \`;
                }
            }

            function renderAPIKeys(keys) {
                const container = document.getElementById('apiKeysContainer');
                
                if (keys.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-key" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No API keys created yet</p>
                            <button onclick="showCreateAPIKeyModal()" class="btn" style="margin-top: 1rem; background: var(--success-color);">
                                <i class="fas fa-plus"></i> Generate Your First Key
                            </button>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = '<div>API keys loaded successfully</div>';
            }

            async function loadBackups() {
                document.getElementById('backups-content').innerHTML = \`
                    <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-database" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                        <p>No backups found</p>
                    </div>
                \`;
            }

            function refreshMetrics() {
                // Initialize metrics display
                document.getElementById('metrics-current-memory').textContent = '0 MB';
                document.getElementById('metrics-current-cpu').textContent = '0%';
                document.getElementById('metrics-server-uptime').textContent = '0h 0m';
            }

            function loadThemeSettings() {
                // Initialize theme settings
                console.log('Theme settings loaded');
            }

            function exportSettings() {
                showToast('Exporting settings...', 'info');
            }

            function saveTheme() {
                showToast('Theme saved successfully!', 'success');
            }

            function resetTheme() {
                if (confirm('Reset theme to defaults?')) {
                    showToast('Theme reset to defaults', 'success');
                }
            }

            function updateColorPreview() {
                // Update color preview
            }

            function showCreateAPIKeyModal() {
                alert('API Key creation modal would open here');
            }

            function createBackup() {
                if (confirm('Create a new backup?')) {
                    showToast('Backup created successfully', 'success');
                }
            }

            async function fetchSystemMetrics() {
                // Fetch metrics from API
            }

            function handleFileSelect(event) {
                const file = event.target.files[0];
                if (file) {
                    showToast('File selected: ' + file.name, 'info');
                }
            }

            function showToast(message, type = 'info') {
                console.log(\`[\${type.toUpperCase()}] \${message}\`);
            }

            // Load settings on page load
            loadSettings();
        `;

        res.send(getPageTemplate({
            pageTitle: 'System Settings',
            pageIcon: 'fas fa-cog',
            activeNav: 'settings',
            contentBody: contentBody,
            additionalCSS: additionalCSS,
            additionalJS: additionalJS,
            req: req
        }));
    });

module.exports = router;