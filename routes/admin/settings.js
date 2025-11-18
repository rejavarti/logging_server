// Admin Settings Route - Enterprise Configuration Management
// Extracted from server.js for better organization and maintainability

const express = require('express');
const { getPageTemplate } = require('../../configs/templates/base');
const router = express.Router();

// Redirect base /admin to /admin/settings for a stable landing page
router.get('/', (req, res) => {
    return res.redirect('/admin/settings');
});

// Admin Settings page - requireAdmin middleware already applied at server.js level
router.get('/settings', (req, res) => {
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
                    <!-- Integrations tab removed - no configurable settings available -->
                    <!--
                    <button onclick="switchTab('integrations')" id="tab-integrations" class="tab-btn" style="padding: 0.75rem 1.5rem; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        <i class="fas fa-project-diagram"></i> Integrations
                    </button>
                    -->
                </div>
            <!-- Integrations Tab Content -->
            <div id="content-integrations" class="tab-content" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-project-diagram"></i> External Integrations</h3>
                    </div>
                    <div class="card-body">
                        <!-- OpenTelemetry Tracing Section - HIDDEN: No configurable settings available.
                             To enable tracing, set environment variables directly (see documentation). -->
                        <!--
                        <div class="section-header">
                            <i class="fas fa-chart-network"></i> Distributed Tracing (OpenTelemetry)
                        </div>
                        ... section content hidden ...
                        -->
                        <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                                <div>
                                    <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">OpenTelemetry Integration</h4>
                                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                                        Monitor distributed requests across services with Jaeger tracing
                                    </p>
                                </div>
                                <div id="tracing-status-badge">
                                    <span style="background: var(--warning-color); color: white; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600;">
                                        <i class="fas fa-exclamation-triangle"></i> Not Configured
                                    </span>
                                </div>
                            </div>
                            
                            <div id="tracing-config-details" style="margin-top: 1rem; padding: 1rem; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-color);">
                                <h5 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">Current Configuration</h5>
                                <div style="display: grid; grid-template-columns: 150px 1fr; gap: 0.75rem; font-size: 0.875rem;">
                                    <strong>Service Name:</strong>
                                    <code id="tracing-service-name" style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px;">enterprise-logging-platform</code>
                                    
                                    <strong>Jaeger Endpoint:</strong>
                                    <code id="tracing-endpoint" style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px;">Not Set</code>
                                    
                                    <strong>Sampling Rate:</strong>
                                    <code id="tracing-sampling" style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px;">100%</code>
                                    
                                    <strong>Status:</strong>
                                    <span id="tracing-enabled-status" style="color: var(--warning-color); font-weight: 600;">
                                        <i class="fas fa-times-circle"></i> Disabled - Requires Configuration
                                    </span>
                                </div>
                            </div>
                            
                            <div id="tracing-setup-instructions" style="margin-top: 1.5rem; padding: 1rem; background: var(--info-color-light); border-radius: 6px; border-left: 4px solid var(--info-color);">
                                <h5 style="margin: 0 0 0.75rem 0; color: var(--text-primary); font-size: 1rem;">
                                    <i class="fas fa-info-circle"></i> Setup Instructions
                                </h5>
                                <p style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 0.875rem;">
                                    To enable distributed tracing, you need to configure a Jaeger backend:
                                </p>
                                
                                <div style="background: var(--bg-primary); padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
                                    <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Option 1: Docker Compose</h6>
                                    <pre style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 0.8125rem;"><code>docker run -d --name jaeger \\
  -p 16686:16686 \\
  -p 14268:14268 \\
  jaegertracing/all-in-one:latest</code></pre>
                                </div>
                                
                                <div style="background: var(--bg-primary); padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
                                    <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Option 2: Environment Variables</h6>
                                    <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem;">Set these environment variables and restart the server:</p>
                                    <pre style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 0.8125rem;"><code>TRACING_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
TRACING_SAMPLING_RATE=0.1
TRACING_SERVICE_NAME=enterprise-logging-platform</code></pre>
                                </div>
                                
                                <div style="background: var(--bg-primary); padding: 1rem; border-radius: 6px;">
                                    <h6 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">Access Jaeger UI</h6>
                                    <p style="margin: 0; font-size: 0.875rem;">
                                        After setup, access Jaeger at: 
                                        <a href="http://localhost:16686" target="_blank" style="color: var(--accent-primary); text-decoration: underline;">http://localhost:16686</a>
                                    </p>
                                </div>
                                
                                <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-primary); border-radius: 6px; border-left: 4px solid var(--success-color);">
                                    <p style="margin: 0; font-size: 0.875rem;">
                                        <strong>Note:</strong> Tracing is optional. The system works fully without it. Enable only if you need advanced performance monitoring.
                                    </p>
                                </div>
                            </div>
                            
                            <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
                                <a href="/admin/tracing" class="btn" style="background: var(--accent-primary);">
                                    <i class="fas fa-chart-network"></i> View Tracing Dashboard
                                </a>
                                <button onclick="testTracingConnection()" class="btn" style="background: var(--info-color);">
                                    <i class="fas fa-plug"></i> Test Connection
                                </button>
                            </div>
                        </div>
                        End of hidden OpenTelemetry section -->
                        
                        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                            <i class="fas fa-puzzle-piece" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                            <p>Additional integrations can be configured via environment variables or the configuration file.</p>
                            <p style="font-size: 0.875rem; margin-top: 0.5rem;">
                                See the <a href="/docs" style="color: var(--accent-primary);">documentation</a> for details on available integrations.
                            </p>
                        </div>
                    </div>
                </div>
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
                                <!-- Gradient Editor Section -->
                                <div class="section-header">
                                    <i class="fas fa-fill-drip"></i> Button Gradient
                                </div>
                                
                                <div style="margin-bottom: 1.5rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                    <!-- Gradient Type -->
                                    <div style="margin-bottom: 1rem;">
                                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                            Gradient Type
                                        </label>
                                        <select id="gradient-type" onchange="updateGradientPreview()" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                                            <option value="linear">Linear</option>
                                            <option value="radial">Radial</option>
                                        </select>
                                    </div>
                                    
                                    <!-- Gradient Angle (only for linear) -->
                                    <div id="gradient-angle-container" style="margin-bottom: 1rem;">
                                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                            Angle: <span id="angle-value">135</span>°
                                        </label>
                                        <input type="range" id="gradient-angle" min="0" max="360" value="135" oninput="updateAngleDisplay(); updateGradientPreview();" style="width: 100%; cursor: pointer;">
                                    </div>
                                    
                                    <!-- Gradient Stops -->
                                    <div style="margin-bottom: 1rem;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                            <label style="font-weight: 600; color: var(--text-primary);">
                                                Gradient Stops
                                            </label>
                                            <button onclick="addGradientStop()" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;">
                                                <i class="fas fa-plus"></i> Add Stop
                                            </button>
                                        </div>
                                        <div id="gradient-stops-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                                            <!-- Gradient stops will be added here dynamically -->
                                        </div>
                                    </div>
                                    
                                    <!-- Live Gradient Preview -->
                                    <div style="margin-top: 1rem;">
                                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                            Preview
                                        </label>
                                        <div id="gradient-preview" style="height: 50px; border-radius: 8px; background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);"></div>
                                    </div>
                                </div>
                                
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
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-bg-tertiary" value="#f1f5f9" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Tertiary Background</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Subtle elements</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Text Colors -->
                                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                        <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                            <i class="fas fa-font" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                            Text Colors
                                        </h4>
                                        <div style="display: grid; gap: 0.75rem;">
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-text-primary" value="#1e293b" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Primary Text</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Main content text</div>
                                                </div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-text-secondary" value="#475569" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Secondary Text</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Subtitles and labels</div>
                                                </div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 1rem;">
                                                <input type="color" id="color-text-muted" value="#64748b" onchange="updateColorPreview()" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; color: var(--text-primary);">Muted Text</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">Hints and placeholders</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Accent & Status Colors -->
                                    <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">
                                        <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1rem;">
                                            <i class="fas fa-star" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                            Accent & Status Colors
                                        </h4>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-border" value="#e2e8f0" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Border</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-accent-primary" value="#3b82f6" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Accent Primary</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-accent-secondary" value="#1d4ed8" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Accent Secondary</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-success" value="#10b981" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Success</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-warning" value="#f59e0b" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Warning</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-error" value="#ef4444" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Error</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                <input type="color" id="color-info" value="#3b82f6" onchange="updateColorPreview()" style="width: 40px; height: 35px; border: none; border-radius: 6px; cursor: pointer;">
                                                <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Info</div>
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
                                        <button style="padding: 0.75rem 1.5rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; cursor: pointer; margin-right: 0.5rem; margin-bottom: 0.5rem;">
                                            Secondary Button
                                        </button>
                                    </div>
                                    
                                    <!-- Status Messages -->
                                    <div style="display: grid; gap: 0.75rem;">
                                        <div style="padding: 0.75rem; background: var(--success-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                            <i class="fas fa-check-circle"></i> Success message example
                                        </div>
                                        <div style="padding: 0.75rem; background: var(--warning-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                            <i class="fas fa-exclamation-triangle"></i> Warning message example
                                        </div>
                                        <div style="padding: 0.75rem; background: var(--error-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                            <i class="fas fa-times-circle"></i> Error message example
                                        </div>
                                        <div style="padding: 0.75rem; background: var(--info-color); color: white; border-radius: 6px; font-size: 0.875rem;">
                                            <i class="fas fa-info-circle"></i> Info message example
                                        </div>
                                    </div>
                                    
                                    <!-- Sample Form Elements -->
                                    <div style="margin-top: 1.5rem;">
                                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                                            Sample Input Field
                                        </label>
                                        <input type="text" placeholder="Enter text here..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
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
            let metricsInterval, metricsMemoryChart, metricsCpuChart;
            let metricsHistory = [];
            const MAX_METRICS_POINTS = 20;

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
                } else if (tabName === 'integrations') {
                    loadTracingConfig();
                }
            }

            async function loadSettings() {
                try {
                    const response = await fetch('/api/settings');
                    if (!response.ok) throw new Error('Failed to fetch settings');
                    
                    currentSettings = await response.json();
                    renderSettings();
                    // After rendering settings, update the port status badges
                    if (typeof loadPortStatus === 'function') {
                        requestAnimationFrame(loadPortStatus);
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error loading settings:', error);
                    document.getElementById('settings-content').innerHTML = \`
                        <p style="text-align: center; color: var(--error-color); padding: 2rem;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <br>Failed to load settings
                        </p>
                    \`;
                }
            }

            function renderSettings() {
                const settings = currentSettings.settings || currentSettings;
                document.getElementById('settings-content').innerHTML = \`
                    <div class="settings-grid">
                        <!-- System Information -->
                        <div class="section-header">
                            <i class="fas fa-info-circle"></i> System Information
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-tag"></i> System Name</div>
                                <div class="setting-description">Platform identifier</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" value="\${settings.system?.name || 'Enterprise Logging Platform'}" readonly>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-code-branch"></i> Version</div>
                                <div class="setting-description">Current server version</div>
                            </div>
                            <div class="setting-readonly">\${settings.system?.version || '2.3.0-comprehensive-restore'}</div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-server"></i> Server Port</div>
                                <div class="setting-description">HTTP server port</div>
                            </div>
                            <div class="setting-readonly">\${settings.system?.port || '10180'}</div>
                        </div>

                        <!-- Log Retention -->
                        <div class="section-header">
                            <i class="fas fa-database"></i> Log Retention & Storage
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-calendar-alt"></i> Retention Days</div>
                                <div class="setting-description">How long to keep logs before archiving</div>
                            </div>
                            <div class="setting-control">
                                <input type="number" id="retention-days" value="\${settings.system?.retention_days || 30}" min="1" max="365">
                                <span>days</span>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-hdd"></i> Max Log Size</div>
                                <div class="setting-description">Maximum size per log file</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" id="max-log-size" value="\${settings.system?.max_log_size || '10MB'}">
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-archive"></i> Auto Archive</div>
                                <div class="setting-description">Automatically archive old logs</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="auto-archive" \${settings.system?.auto_archive !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-compress"></i> Compression</div>
                                <div class="setting-description">Enable log compression</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="compression-enabled" \${settings.system?.compression_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>

                        <!-- Logging & Monitoring -->
                        <div class="section-header">
                            <i class="fas fa-chart-line"></i> Logging & Monitoring
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-bug"></i> Log Level</div>
                                <div class="setting-description">Minimum log level to capture</div>
                            </div>
                            <div class="setting-control">
                                <select id="log-level">
                                    <option value="debug" \${settings.system?.log_level === 'debug' ? 'selected' : ''}>Debug</option>
                                    <option value="info" \${settings.system?.log_level === 'info' || !settings.system?.log_level ? 'selected' : ''}>Info</option>
                                    <option value="warning" \${settings.system?.log_level === 'warning' ? 'selected' : ''}>Warning</option>
                                    <option value="error" \${settings.system?.log_level === 'error' ? 'selected' : ''}>Error</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-clock"></i> Timezone</div>
                                <div class="setting-description">Server timezone for log timestamps</div>
                            </div>
                            <div class="setting-control">
                                <select id="timezone">
                                    <option value="UTC" \${!settings.system?.timezone || settings.system?.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
                                    <optgroup label="Americas">
                                        <option value="America/New_York" \${settings.system?.timezone === 'America/New_York' ? 'selected' : ''}>Eastern Time</option>
                                        <option value="America/Chicago" \${settings.system?.timezone === 'America/Chicago' ? 'selected' : ''}>Central Time</option>
                                        <option value="America/Denver" \${settings.system?.timezone === 'America/Denver' ? 'selected' : ''}>Mountain Time</option>
                                        <option value="America/Phoenix" \${settings.system?.timezone === 'America/Phoenix' ? 'selected' : ''}>Arizona</option>
                                        <option value="America/Los_Angeles" \${settings.system?.timezone === 'America/Los_Angeles' ? 'selected' : ''}>Pacific Time</option>
                                        <option value="America/Anchorage" \${settings.system?.timezone === 'America/Anchorage' ? 'selected' : ''}>Alaska</option>
                                        <option value="Pacific/Honolulu" \${settings.system?.timezone === 'Pacific/Honolulu' ? 'selected' : ''}>Hawaii</option>
                                        <option value="America/Toronto" \${settings.system?.timezone === 'America/Toronto' ? 'selected' : ''}>Toronto</option>
                                        <option value="America/Vancouver" \${settings.system?.timezone === 'America/Vancouver' ? 'selected' : ''}>Vancouver</option>
                                        <option value="America/Mexico_City" \${settings.system?.timezone === 'America/Mexico_City' ? 'selected' : ''}>Mexico City</option>
                                        <option value="America/Sao_Paulo" \${settings.system?.timezone === 'America/Sao_Paulo' ? 'selected' : ''}>São Paulo</option>
                                        <option value="America/Buenos_Aires" \${settings.system?.timezone === 'America/Buenos_Aires' ? 'selected' : ''}>Buenos Aires</option>
                                    </optgroup>
                                    <optgroup label="Europe">
                                        <option value="Europe/London" \${settings.system?.timezone === 'Europe/London' ? 'selected' : ''}>London</option>
                                        <option value="Europe/Paris" \${settings.system?.timezone === 'Europe/Paris' ? 'selected' : ''}>Paris</option>
                                        <option value="Europe/Berlin" \${settings.system?.timezone === 'Europe/Berlin' ? 'selected' : ''}>Berlin</option>
                                        <option value="Europe/Rome" \${settings.system?.timezone === 'Europe/Rome' ? 'selected' : ''}>Rome</option>
                                        <option value="Europe/Madrid" \${settings.system?.timezone === 'Europe/Madrid' ? 'selected' : ''}>Madrid</option>
                                        <option value="Europe/Amsterdam" \${settings.system?.timezone === 'Europe/Amsterdam' ? 'selected' : ''}>Amsterdam</option>
                                        <option value="Europe/Brussels" \${settings.system?.timezone === 'Europe/Brussels' ? 'selected' : ''}>Brussels</option>
                                        <option value="Europe/Vienna" \${settings.system?.timezone === 'Europe/Vienna' ? 'selected' : ''}>Vienna</option>
                                        <option value="Europe/Stockholm" \${settings.system?.timezone === 'Europe/Stockholm' ? 'selected' : ''}>Stockholm</option>
                                        <option value="Europe/Moscow" \${settings.system?.timezone === 'Europe/Moscow' ? 'selected' : ''}>Moscow</option>
                                        <option value="Europe/Athens" \${settings.system?.timezone === 'Europe/Athens' ? 'selected' : ''}>Athens</option>
                                        <option value="Europe/Istanbul" \${settings.system?.timezone === 'Europe/Istanbul' ? 'selected' : ''}>Istanbul</option>
                                    </optgroup>
                                    <optgroup label="Asia">
                                        <option value="Asia/Dubai" \${settings.system?.timezone === 'Asia/Dubai' ? 'selected' : ''}>Dubai</option>
                                        <option value="Asia/Kolkata" \${settings.system?.timezone === 'Asia/Kolkata' ? 'selected' : ''}>India</option>
                                        <option value="Asia/Bangkok" \${settings.system?.timezone === 'Asia/Bangkok' ? 'selected' : ''}>Bangkok</option>
                                        <option value="Asia/Singapore" \${settings.system?.timezone === 'Asia/Singapore' ? 'selected' : ''}>Singapore</option>
                                        <option value="Asia/Hong_Kong" \${settings.system?.timezone === 'Asia/Hong_Kong' ? 'selected' : ''}>Hong Kong</option>
                                        <option value="Asia/Shanghai" \${settings.system?.timezone === 'Asia/Shanghai' ? 'selected' : ''}>Shanghai</option>
                                        <option value="Asia/Tokyo" \${settings.system?.timezone === 'Asia/Tokyo' ? 'selected' : ''}>Tokyo</option>
                                        <option value="Asia/Seoul" \${settings.system?.timezone === 'Asia/Seoul' ? 'selected' : ''}>Seoul</option>
                                        <option value="Asia/Jerusalem" \${settings.system?.timezone === 'Asia/Jerusalem' ? 'selected' : ''}>Jerusalem</option>
                                    </optgroup>
                                    <optgroup label="Pacific">
                                        <option value="Australia/Sydney" \${settings.system?.timezone === 'Australia/Sydney' ? 'selected' : ''}>Sydney</option>
                                        <option value="Australia/Melbourne" \${settings.system?.timezone === 'Australia/Melbourne' ? 'selected' : ''}>Melbourne</option>
                                        <option value="Australia/Brisbane" \${settings.system?.timezone === 'Australia/Brisbane' ? 'selected' : ''}>Brisbane</option>
                                        <option value="Australia/Perth" \${settings.system?.timezone === 'Australia/Perth' ? 'selected' : ''}>Perth</option>
                                        <option value="Pacific/Auckland" \${settings.system?.timezone === 'Pacific/Auckland' ? 'selected' : ''}>Auckland</option>
                                        <option value="Pacific/Fiji" \${settings.system?.timezone === 'Pacific/Fiji' ? 'selected' : ''}>Fiji</option>
                                    </optgroup>
                                    <optgroup label="Africa">
                                        <option value="Africa/Cairo" \${settings.system?.timezone === 'Africa/Cairo' ? 'selected' : ''}>Cairo</option>
                                        <option value="Africa/Johannesburg" \${settings.system?.timezone === 'Africa/Johannesburg' ? 'selected' : ''}>Johannesburg</option>
                                        <option value="Africa/Lagos" \${settings.system?.timezone === 'Africa/Lagos' ? 'selected' : ''}>Lagos</option>
                                        <option value="Africa/Nairobi" \${settings.system?.timezone === 'Africa/Nairobi' ? 'selected' : ''}>Nairobi</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>

                        <!-- Alert Settings -->
                        <div class="section-header">
                            <i class="fas fa-bell"></i> Alert Configuration
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-envelope"></i> Email Alerts</div>
                                <div class="setting-description">Enable email notifications</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="email-enabled" \${settings.alerts?.email_enabled ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-webhook"></i> Webhook Alerts</div>
                                <div class="setting-description">Enable webhook notifications</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="webhook-enabled" \${settings.alerts?.webhook_enabled ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fab fa-slack"></i> Slack Alerts</div>
                                <div class="setting-description">Enable Slack notifications</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="slack-enabled" \${settings.alerts?.slack_enabled ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fab fa-discord"></i> Discord Alerts</div>
                                <div class="setting-description">Enable Discord notifications</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="discord-enabled" \${settings.alerts?.discord_enabled ? 'checked' : ''}>
                            </div>
                        </div>

                        <!-- Ingestion Settings -->
                        <div class="section-header">
                            <i class="fas fa-download"></i> Log Ingestion
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-terminal"></i> Syslog Protocol</div>
                                <div class="setting-description">Enable Syslog UDP/TCP ingestion</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="syslog-enabled" \${settings.ingestion?.syslog_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-network-wired"></i> GELF Protocol</div>
                                <div class="setting-description">Enable Graylog Extended Log Format</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="gelf-enabled" \${settings.ingestion?.gelf_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-heartbeat"></i> Beats Protocol</div>
                                <div class="setting-description">Enable Elastic Beats ingestion</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="beats-enabled" \${settings.ingestion?.beats_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-stream"></i> Fluent Protocol</div>
                                <div class="setting-description">Enable Fluentd/Fluent Bit ingestion</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="fluent-enabled" \${settings.ingestion?.fluent_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-tachometer-alt"></i> Rate Limit</div>
                                <div class="setting-description">Maximum logs per second</div>
                            </div>
                            <div class="setting-control">
                                <input type="number" id="rate-limit" value="\${settings.ingestion?.rate_limit || 1000}" min="100" max="10000">
                                <span>logs/sec</span>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-file-alt"></i> Max Message Size</div>
                                <div class="setting-description">Maximum size per log message</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" id="max-message-size" value="\${settings.ingestion?.max_message_size || '1MB'}">
                            </div>
                        </div>

                        <!-- Ingestion Port Status -->
                        <div class="section-header">
                            <i class="fas fa-door-open"></i> Ingestion Port Status
                        </div>
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-ethernet"></i> Port Guardian (Desired State)</div>
                                <div class="setting-description">Shows which host ports are intended to be open. Actual firewall state is enforced by Port Guardian.</div>
                            </div>
                            <div class="setting-control" style="flex-wrap: wrap; gap: 0.5rem;" id="ingestion-port-status">
                                <span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading...</span>
                            </div>
                        </div>

                        <!-- Security Settings -->
                        <div class="section-header">
                            <i class="fas fa-shield-alt"></i> Security & Authentication
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-lock"></i> Authentication</div>
                                <div class="setting-description">Require authentication for access</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="auth-enabled" \${settings.security?.auth_enabled !== false ? 'checked' : ''} disabled>
                                <span style="color: var(--text-muted); font-size: 0.875rem;">(Cannot be disabled)</span>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-key"></i> JWT Expiry</div>
                                <div class="setting-description">JWT token expiration time</div>
                            </div>
                            <div class="setting-control">
                                <input type="text" id="jwt-expiry" value="\${settings.security?.jwt_expiry || '24h'}">
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-hand-paper"></i> Rate Limiting</div>
                                <div class="setting-description">Enable API rate limiting</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="rate-limiting" \${settings.security?.rate_limiting !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-clipboard-list"></i> Audit Logging</div>
                                <div class="setting-description">Log all user activities</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="audit-logging" \${settings.security?.audit_logging !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-user-shield"></i> Password Policy</div>
                                <div class="setting-description">Password strength requirements</div>
                            </div>
                            <div class="setting-control">
                                <select id="password-policy">
                                    <option value="weak" \${settings.security?.password_policy === 'weak' ? 'selected' : ''}>Weak (8+ chars)</option>
                                    <option value="medium" \${settings.security?.password_policy === 'medium' ? 'selected' : ''}>Medium (10+ chars, mixed case)</option>
                                    <option value="strong" \${settings.security?.password_policy === 'strong' || !settings.security?.password_policy ? 'selected' : ''}>Strong (12+ chars, symbols)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Performance Settings -->
                        <div class="section-header">
                            <i class="fas fa-rocket"></i> Performance Optimization
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-memory"></i> Enable Caching</div>
                                <div class="setting-description">Cache frequently accessed data</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="cache-enabled" \${settings.performance?.cache_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-hourglass-half"></i> Cache TTL</div>
                                <div class="setting-description">Cache time-to-live in seconds</div>
                            </div>
                            <div class="setting-control">
                                <input type="number" id="cache-ttl" value="\${settings.performance?.cache_ttl || 300}" min="60" max="3600">
                                <span>seconds</span>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-broadcast-tower"></i> Streaming</div>
                                <div class="setting-description">Enable real-time log streaming</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="streaming-enabled" \${settings.performance?.streaming_enabled !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-compress-arrows-alt"></i> Response Compression</div>
                                <div class="setting-description">Compress HTTP responses</div>
                            </div>
                            <div class="setting-control">
                                <input type="checkbox" id="compression" \${settings.performance?.compression !== false ? 'checked' : ''}>
                            </div>
                        </div>
                        
                        <div class="setting-item">
                            <div>
                                <div class="setting-label"><i class="fas fa-search"></i> Indexing Strategy</div>
                                <div class="setting-description">Database indexing method</div>
                            </div>
                            <div class="setting-control">
                                <select id="indexing">
                                    <option value="auto" \${settings.performance?.indexing === 'auto' || !settings.performance?.indexing ? 'selected' : ''}>Automatic</option>
                                    <option value="aggressive" \${settings.performance?.indexing === 'aggressive' ? 'selected' : ''}>Aggressive</option>
                                    <option value="conservative" \${settings.performance?.indexing === 'conservative' ? 'selected' : ''}>Conservative</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 2rem; text-align: right;">
                        <button onclick="saveSettings()" class="btn" style="background: var(--success-color); padding: 1rem 2rem; font-size: 1rem;">
                            <i class="fas fa-save"></i> Save All Settings
                        </button>
                    </div>
                \`;
            }
            
            async function saveSettings() {
                try {
                    const updatedSettings = {
                        system: {
                            retention_days: parseInt(document.getElementById('retention-days')?.value) || 30,
                            max_log_size: document.getElementById('max-log-size')?.value || '10MB',
                            log_level: document.getElementById('log-level')?.value || 'info',
                            timezone: document.getElementById('timezone')?.value || 'UTC',
                            auto_archive: document.getElementById('auto-archive')?.checked || false,
                            compression_enabled: document.getElementById('compression-enabled')?.checked || false
                        },
                        alerts: {
                            email_enabled: document.getElementById('email-enabled')?.checked || false,
                            webhook_enabled: document.getElementById('webhook-enabled')?.checked || false,
                            slack_enabled: document.getElementById('slack-enabled')?.checked || false,
                            discord_enabled: document.getElementById('discord-enabled')?.checked || false
                        },
                        ingestion: {
                            syslog_enabled: document.getElementById('syslog-enabled')?.checked || false,
                            gelf_enabled: document.getElementById('gelf-enabled')?.checked || false,
                            beats_enabled: document.getElementById('beats-enabled')?.checked || false,
                            fluent_enabled: document.getElementById('fluent-enabled')?.checked || false,
                            rate_limit: parseInt(document.getElementById('rate-limit')?.value) || 1000,
                            max_message_size: document.getElementById('max-message-size')?.value || '1MB'
                        },
                        security: {
                            auth_enabled: true,
                            jwt_expiry: document.getElementById('jwt-expiry')?.value || '24h',
                            rate_limiting: document.getElementById('rate-limiting')?.checked || false,
                            audit_logging: document.getElementById('audit-logging')?.checked || false,
                            password_policy: document.getElementById('password-policy')?.value || 'strong'
                        },
                        performance: {
                            cache_enabled: document.getElementById('cache-enabled')?.checked || false,
                            cache_ttl: parseInt(document.getElementById('cache-ttl')?.value) || 300,
                            streaming_enabled: document.getElementById('streaming-enabled')?.checked || false,
                            compression: document.getElementById('compression')?.checked || false,
                            indexing: document.getElementById('indexing')?.value || 'auto'
                        }
                    };
                    
                    const response = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedSettings)
                    });
                    
                    if (!response.ok) throw new Error('Failed to save settings');
                    
                    showToast('Settings saved successfully!', 'success');
                    loadSettings(); // Reload to show updated values
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error saving settings:', error);
                    showToast('Failed to save settings', 'error');
                }
            }

            // Ingestion Port Status helpers
            async function loadPortStatus() {
                try {
                    const res = await fetch('/api/ingestion/ports-status');
                    if (!res.ok) throw new Error('Failed to fetch port status');
                    const data = await res.json();
                    renderPortStatus(data.ports || []);
                } catch (e) {
                    const el = document.getElementById('ingestion-port-status');
                    if (el) el.innerHTML = '<span style="color: var(--error-color);">Failed to load port status</span>';
                }
            }

            function renderPortStatus(ports) {
                const container = document.getElementById('ingestion-port-status');
                if (!container) return;
                if (!Array.isArray(ports) || ports.length === 0) {
                    container.innerHTML = '<span style="color: var(--text-muted);">No ports configured</span>';
                    return;
                }
                const badgeStyle = (open) => \`display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-weight:600;background:\${open ? 'var(--success-color)' : 'var(--bg-tertiary)'};color:\${open ? '#fff' : 'var(--text-secondary)'};\`;
                container.innerHTML = ports.map(p => \`
                    <span style="\${badgeStyle(p.desiredOpen)}">
                        <i class="fas \${p.desiredOpen ? 'fa-unlock' : 'fa-lock'}"></i>
                        \${p.name} <code style="background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px;">\${p.port}/\${p.protocol}</code>
                    </span>
                \`).join(' ');
            }

            // API Keys Functions
            async function loadAPIKeys() {
                try {
                    const response = await fetch('/api/api-keys');
                    if (!response.ok) throw new Error('Failed to fetch API keys');
                    
                    const data = await response.json();
                    renderAPIKeys(data.keys || []);
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error loading API keys:', error);
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

                let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
                keys.forEach(key => {
                    const rawKey = (key && typeof key.key_value === 'string') ? key.key_value : '';
                    const maskedKey = rawKey
                        ? (rawKey.substring(0, 12) + '...' + rawKey.substring(Math.max(0, rawKey.length - 4)))
                        : '••••••••••••••••';
                    const statusColor = key.is_active ? 'var(--success-color)' : 'var(--warning-color)';
                    const statusText = key.is_active ? 'Active' : 'Inactive';
                    
                    html += \`
                        <div style="padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                        <h4 style="margin: 0; color: var(--text-primary);"><i class="fas fa-key"></i> \${key.name}</h4>
                                        <span style="padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: \${statusColor}20; color: \${statusColor};">
                                            \${statusText}
                                        </span>
                                    </div>
                                    \${key.description ? \`<p style="margin: 0.5rem 0; color: var(--text-secondary); font-size: 0.9rem;">\${key.description}</p>\` : ''}
                                    <div style="margin: 0.75rem 0; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 6px; font-family: monospace; font-size: 0.9rem; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                                        <code>\${maskedKey}</code>
                                        <button onclick="copyToClipboard('\${rawKey.replace(/['"\\\\]/g, '')}')" class="btn" style="padding: 0.5rem 1rem; background: var(--info-color);">
                                            <i class="fas fa-copy"></i> Copy
                                        </button>
                                    </div>
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
                                        <div><i class="fas fa-calendar"></i> Created: <strong>\${new Date(key.created_at).toLocaleDateString()}</strong></div>
                                        <div><i class="fas fa-clock"></i> Last used: <strong>\${key.last_used ? new Date(key.last_used).toLocaleDateString() : 'Never'}</strong></div>
                                        <div><i class="fas fa-chart-line"></i> Uses: <strong>\${key.usage_count || 0}</strong></div>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button onclick="toggleAPIKeyStatus(\${key.id}, \${key.is_active})" class="btn" style="background: var(--warning-color);">
                                    <i class="fas fa-\${key.is_active ? 'pause' : 'play'}"></i> \${key.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button onclick="deleteAPIKey(\${key.id})" class="btn" style="background: var(--error-color);">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    \`;
                });
                html += '</div>';
                container.innerHTML = html;
            }

            function showCreateAPIKeyModal() {
                const modalHTML = \`
                    <div id="api-key-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                        <div style="background: var(--bg-secondary); padding: 2rem; border-radius: 12px; max-width: 500px; width: 90%;">
                            <h3 style="margin-top: 0;">Create New API Key</h3>
                            <div style="margin-bottom: 1rem;">
                                <label style="display: block; margin-bottom: 0.5rem;">Key Name:</label>
                                <input id="new-key-name" type="text" placeholder="e.g., Production Integration" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
                            </div>
                            <div style="margin-bottom: 1rem;">
                                <label style="display: block; margin-bottom: 0.5rem;">Description:</label>
                                <textarea id="new-key-desc" rows="3" placeholder="Optional description" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;"></textarea>
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                <button onclick="closeAPIKeyModal()" class="btn" style="background: var(--bg-tertiary);">Cancel</button>
                                <button onclick="createAPIKey()" class="btn" style="background: var(--accent-primary);">Create Key</button>
                            </div>
                        </div>
                    </div>
                \`;
                document.body.insertAdjacentHTML('beforeend', modalHTML);
            }

            function closeAPIKeyModal() {
                const modal = document.getElementById('api-key-modal');
                if (modal) modal.remove();
            }
            
            function closeAPIKeyDisplayModal() {
                const modal = document.getElementById('api-key-display-modal');
                if (modal) modal.remove();
            }
            
            function copyAPIKeyValue() {
                const keyElement = document.getElementById('api-key-value');
                if (keyElement) {
                    const keyValue = keyElement.textContent;
                    navigator.clipboard.writeText(keyValue).then(() => {
                        showToast('Key copied!', 'success');
                    }).catch(() => {
                        showToast('Failed to copy key', 'error');
                    });
                }
            }

            async function createAPIKey() {
                const name = document.getElementById('new-key-name').value.trim();
                const description = document.getElementById('new-key-desc').value.trim();
                
                if (!name) {
                    showToast('Please enter a key name', 'warning');
                    return;
                }
                
                try {
                    const response = await fetch('/api/api-keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, description })
                    });
                    
                    if (!response.ok) throw new Error('Failed to create key');
                    const data = await response.json();
                    
                    closeAPIKeyModal();
                    showToast('API key created successfully!', 'success');
                    
                    // Show the new key in an alert (only time it's visible)
                    if (data.key && data.key.key_value) {
                        // Create a modal with copy button
                        const modal = document.createElement('div');
                        modal.id = 'api-key-display-modal';
                        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
                        modal.innerHTML = \`
                            <div style="background: var(--bg-primary); padding: 2rem; border-radius: 12px; max-width: 600px; width: 90%; border: 2px solid var(--warning-color);">
                                <h3 style="margin: 0 0 1rem 0; color: var(--success-color);"><i class="fas fa-check-circle"></i> API Key Created!</h3>
                                
                                <div style="background: var(--warning-color); color: var(--bg-primary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: 600;">
                                    <i class="fas fa-exclamation-triangle"></i> IMPORTANT: Copy this Private Key now!
                                    <br><small style="font-weight: normal;">This key will NOT be shown again. It cannot be retrieved later.</small>
                                </div>
                                
                                <p style="margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">
                                    <strong>Private Key</strong> (save this securely - required for authentication):
                                </p>
                                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 2px solid var(--accent-primary);">
                                    <div id="api-key-value" style="font-family: monospace; word-break: break-all; font-size: 0.9rem; color: var(--text-primary);">\${data.key.key_value}</div>
                                </div>
                                
                                <p style="margin-bottom: 1rem; color: var(--text-muted); font-size: 0.85rem;">
                                    <i class="fas fa-info-circle"></i> The <strong>Public Key</strong> (for identification) is always visible on the main API Keys page.
                                </p>
                                
                                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                    <button onclick="copyAPIKeyValue()" class="btn" style="background: var(--accent-primary);">
                                        <i class="fas fa-copy"></i> Copy Private Key
                                    </button>
                                    <button onclick="closeAPIKeyDisplayModal()" class="btn">
                                        Close
                                    </button>
                                </div>
                            </div>
                        \`;
                        document.body.appendChild(modal);
                        modal.onclick = (e) => { if (e.target === modal) closeAPIKeyDisplayModal(); };
                    }
                    
                    loadAPIKeys();
                } catch (error) {
                    showToast('Failed to create API key', 'error');
                }
            }

            async function toggleAPIKeyStatus(keyId, currentStatus) {
                try {
                    const response = await fetch(\`/api/api-keys/\${keyId}\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_active: !currentStatus })
                    });
                    if (!response.ok) throw new Error('Failed to update');
                    showToast(\`API key \${!currentStatus ? 'activated' : 'deactivated'}\`, 'success');
                    loadAPIKeys();
                } catch (error) {
                    showToast('Failed to update API key', 'error');
                }
            }

            async function deleteAPIKey(keyId) {
                if (!confirm('Delete this API key? This action cannot be undone.')) return;
                try {
                    const response = await fetch(\`/api/api-keys/\${keyId}\`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Failed to delete');
                    showToast('API key deleted', 'success');
                    loadAPIKeys();
                } catch (error) {
                    showToast('Failed to delete API key', 'error');
                }
            }

            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast('API key copied to clipboard', 'success');
                }).catch(() => {
                    showToast('Failed to copy', 'error');
                });
            }

            // Backups Functions
            async function loadBackups() {
                try {
                    const response = await fetch('/api/backups');
                    if (!response.ok) throw new Error('Failed to fetch backups');
                    const data = await response.json();
                    
                    // Format the data before rendering
                    data.backups = data.backups.map(backup => ({
                        ...backup,
                        size: backup.size_bytes || 0, // Use size_bytes for formatBytes()
                        createdFormatted: backup.created ? new Date(backup.created).toLocaleString() : 'Unknown'
                    }));
                    
                    // Calculate total size
                    data.totalSize = data.backups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
                    
                    renderBackups(data);
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error loading backups:', error);
                    document.getElementById('backups-content').innerHTML = \`
                        <p style="text-align: center; color: var(--error-color); padding: 2rem;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <br>Failed to load backups
                        </p>
                    \`;
                }
            }

            function renderBackups(data) {
                const container = document.getElementById('backups-content');
                if (data.backups.length === 0) {
                    container.innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-database" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                            <p>No backups found</p>
                            <button onclick="createBackup()" class="btn" style="margin-top: 1rem;">
                                <i class="fas fa-plus"></i> Create First Backup
                            </button>
                        </div>
                    \`;
                    return;
                }

                const formatBytes = (bytes) => {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
                };

                container.innerHTML = \`
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-muted);">Total Backups</div>
                            <div style="font-size: 1.5rem; font-weight: 600;">\${data.backups.length}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-muted);">Total Size</div>
                            <div style="font-size: 1.5rem; font-weight: 600;">\${formatBytes(data.totalSize)}</div>
                        </div>
                    </div>
                    <div class="data-table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Size</th>
                                    <th>Created</th>
                                    <th style="text-align: center;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${data.backups.map(backup => \`
                                    <tr>
                                        <td><i class="fas fa-database" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>\${backup.filename}</td>
                                        <td>\${formatBytes(backup.size)}</td>
                                        <td>\${backup.createdFormatted}</td>
                                        <td style="text-align: center;">
                                            <button onclick="downloadBackup('\${backup.filename}')" class="btn" style="padding: 0.4rem 0.8rem; margin: 0 0.25rem;"><i class="fas fa-download"></i></button>
                                            <button onclick="deleteBackup('\${backup.filename}')" class="btn" style="padding: 0.4rem 0.8rem; margin: 0 0.25rem; background: var(--error-color);"><i class="fas fa-trash"></i></button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
            }

            async function createBackup() {
                if (!confirm('Create a new backup of the database?')) return;
                try {
                    showToast('Creating backup...', 'info');
                    const response = await fetch('/api/backups/create', { method: 'POST' });
                    if (!response.ok) throw new Error('Failed');
                    showToast('Backup created successfully', 'success');
                    loadBackups();
                } catch (error) {
                    showToast('Failed to create backup', 'error');
                }
            }

            function downloadBackup(filename) {
                window.location.href = \`/api/backups/\${filename}/download\`;
                showToast('Downloading backup...', 'info');
            }

            async function deleteBackup(filename) {
                if (!confirm(\`Delete "\${filename}"? This cannot be undone.\`)) return;
                try {
                    const response = await fetch(\`/api/backups/\${filename}\`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Failed');
                    showToast('Backup deleted', 'success');
                    loadBackups();
                } catch (error) {
                    showToast('Failed to delete backup', 'error');
                }
            }

            // Metrics Functions
            function initMetricsCharts() {
                const chartConfig = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'var(--text-muted)', maxTicksLimit: 6 } },
                        y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'var(--text-muted)' }, beginAtZero: true }
                    }
                };

                const memCtx = document.getElementById('metrics-memory-chart');
                if (memCtx && !metricsMemoryChart) {
                    metricsMemoryChart = new Chart(memCtx, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [{
                                label: 'Memory (MB)',
                                data: [],
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: chartConfig
                    });
                }

                const cpuCtx = document.getElementById('metrics-cpu-chart');
                if (cpuCtx && !metricsCpuChart) {
                    metricsCpuChart = new Chart(cpuCtx, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [{
                                label: 'CPU %',
                                data: [],
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: chartConfig
                    });
                }
            }

            async function fetchSystemMetrics() {
                try {
                    const response = await fetch('/api/system/metrics', { credentials: 'same-origin' });
                    if (!response.ok) throw new Error('Failed to fetch metrics');
                    const metrics = await response.json();
                    updateMetricsDisplay(metrics);
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error fetching metrics:', error);
                }
            }

            function updateMetricsDisplay(metrics) {
                const memoryUsage = metrics.memoryUsage || 0;
                const cpuUsage = metrics.cpuUsage || 0;
                const uptime = metrics.uptime || 0;
                const totalRequests = metrics.totalRequests || 0;
                
                document.getElementById('metrics-current-memory').textContent = memoryUsage + ' MB';
                document.getElementById('metrics-current-cpu').textContent = cpuUsage + '%';
                document.getElementById('metrics-server-uptime').textContent = formatMetricsUptime(uptime);
                document.getElementById('metrics-request-total').textContent = totalRequests.toLocaleString();
                document.getElementById('metrics-request-rate').textContent = Math.round(totalRequests / Math.max(uptime / 1000, 1) * 60);

                const heapPercent = Math.min(Math.max((memoryUsage / 2048) * 100, 0), 100);
                document.getElementById('metrics-memory-percent').textContent = heapPercent.toFixed(1);

                metricsHistory.push({ timestamp: new Date(), memory: memoryUsage, cpu: cpuUsage });
                if (metricsHistory.length > MAX_METRICS_POINTS) metricsHistory.shift();

                updateMetricsCharts();
            }

            function updateMetricsCharts() {
                if (!metricsMemoryChart || !metricsCpuChart) return;
                const labels = metricsHistory.map(m => m.timestamp.toLocaleTimeString());
                metricsMemoryChart.data.labels = labels;
                metricsMemoryChart.data.datasets[0].data = metricsHistory.map(m => m.memory);
                metricsMemoryChart.update('none');
                metricsCpuChart.data.labels = labels;
                metricsCpuChart.data.datasets[0].data = metricsHistory.map(m => m.cpu || 0);
                metricsCpuChart.update('none');
            }

            function formatMetricsUptime(seconds) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                if (hours > 0) return hours + 'h ' + minutes + 'm';
                if (minutes > 0) return minutes + 'm';
                return seconds + 's';
            }

            function refreshMetrics() {
                initMetricsCharts();
                fetchSystemMetrics();
            }

            // Appearance Functions - Gradient Stops Array
            let gradientStops = [
                { position: 0, color: '#0ea5e9' },
                { position: 50, color: '#3b82f6' },
                { position: 100, color: '#6366f1' }
            ];

            async function loadThemeSettings() {
                try {
                    const response = await fetch('/api/user/theme');
                    if (!response.ok) throw new Error('Failed to load theme');
                    
                    const theme = await response.json();
                    
                    if (theme) {
                        // Load gradient settings
                        document.getElementById('gradient-type').value = theme.gradient_type || 'linear';
                        document.getElementById('gradient-angle').value = theme.gradient_angle || 135;
                        updateAngleDisplay();
                        
                        // Load gradient stops
                        if (theme.gradient_stops) {
                            gradientStops = theme.gradient_stops;
                        }
                        
                        // Load color settings
                        if (theme.bg_primary) document.getElementById('color-bg-primary').value = theme.bg_primary;
                        if (theme.bg_secondary) document.getElementById('color-bg-secondary').value = theme.bg_secondary;
                        if (theme.bg_tertiary) document.getElementById('color-bg-tertiary').value = theme.bg_tertiary;
                        if (theme.text_primary) document.getElementById('color-text-primary').value = theme.text_primary;
                        if (theme.text_secondary) document.getElementById('color-text-secondary').value = theme.text_secondary;
                        if (theme.text_muted) document.getElementById('color-text-muted').value = theme.text_muted;
                        if (theme.border_color) document.getElementById('color-border').value = theme.border_color;
                        if (theme.accent_primary) document.getElementById('color-accent-primary').value = theme.accent_primary;
                        if (theme.accent_secondary) document.getElementById('color-accent-secondary').value = theme.accent_secondary;
                        if (theme.success_color) document.getElementById('color-success').value = theme.success_color;
                        if (theme.warning_color) document.getElementById('color-warning').value = theme.warning_color;
                        if (theme.error_color) document.getElementById('color-error').value = theme.error_color;
                        if (theme.info_color) document.getElementById('color-info').value = theme.info_color;
                    }
                    
                    // Render gradient stops and update previews
                    renderGradientStops();
                    updateGradientPreview();
                    updateColorPreview();
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error loading theme:', error);
                    // Initialize with defaults
                    renderGradientStops();
                    updateGradientPreview();
                }
            }

            function renderGradientStops() {
                const container = document.getElementById('gradient-stops-container');
                container.innerHTML = gradientStops.map((stop, index) => \`
                    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 6px;">
                        <input type="color" value="\${stop.color}" onchange="updateStopColor(\${index}, this.value)" style="width: 50px; height: 40px; border: none; border-radius: 6px; cursor: pointer;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Stop \${index + 1}</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">\${stop.position}%</span>
                            </div>
                            <input type="range" min="0" max="100" value="\${stop.position}" oninput="updateStopPosition(\${index}, this.value)" style="width: 100%; cursor: pointer;">
                        </div>
                        \${gradientStops.length > 2 ? \`
                            <button onclick="removeGradientStop(\${index})" style="padding: 0.5rem; background: var(--error-color); color: white; border: none; border-radius: 6px; cursor: pointer;" title="Remove">
                                <i class="fas fa-trash"></i>
                            </button>
                        \` : ''}
                    </div>
                \`).join('');
            }

            function addGradientStop() {
                if (gradientStops.length >= 10) {
                    showToast('Maximum 10 gradient stops allowed', 'warning');
                    return;
                }
                
                // Add new stop in the middle
                const newPosition = Math.round((gradientStops[gradientStops.length - 1].position + gradientStops[gradientStops.length - 2].position) / 2);
                gradientStops.push({
                    position: newPosition || 50,
                    color: '#6366f1'
                });
                
                // Sort by position
                gradientStops.sort((a, b) => a.position - b.position);
                
                renderGradientStops();
                updateGradientPreview();
            }

            function removeGradientStop(index) {
                if (gradientStops.length <= 2) {
                    showToast('Minimum 2 gradient stops required', 'warning');
                    return;
                }
                
                gradientStops.splice(index, 1);
                renderGradientStops();
                updateGradientPreview();
            }

            function updateStopColor(index, color) {
                gradientStops[index].color = color;
                updateGradientPreview();
            }

            function updateStopPosition(index, position) {
                gradientStops[index].position = parseInt(position);
                
                // Update the display
                const stopElements = document.querySelectorAll('#gradient-stops-container > div');
                if (stopElements[index]) {
                    const posLabel = stopElements[index].querySelector('.text-muted');
                    if (posLabel) posLabel.textContent = position + '%';
                }
                
                updateGradientPreview();
            }

            function updateAngleDisplay() {
                const angle = document.getElementById('gradient-angle').value;
                document.getElementById('angle-value').textContent = angle;
            }

            function updateGradientPreview() {
                const type = document.getElementById('gradient-type').value;
                const angle = document.getElementById('gradient-angle').value;
                
                // Show/hide angle control
                document.getElementById('gradient-angle-container').style.display = type === 'linear' ? 'block' : 'none';
                
                // Sort stops by position
                const sortedStops = [...gradientStops].sort((a, b) => a.position - b.position);
                
                // Build gradient string
                const stops = sortedStops.map(stop => \`\${stop.color} \${stop.position}%\`).join(', ');
                let gradient;
                
                if (type === 'linear') {
                    gradient = \`linear-gradient(\${angle}deg, \${stops})\`;
                } else {
                    gradient = \`radial-gradient(circle, \${stops})\`;
                }
                
                // Update preview
                document.getElementById('gradient-preview').style.background = gradient;
                
                // Update live CSS variable
                document.documentElement.style.setProperty('--gradient-ocean', gradient);
            }

            function updateColorPreview() {
                // Update all CSS variables with current color values
                const colorMap = {
                    'color-bg-primary': '--bg-primary',
                    'color-bg-secondary': '--bg-secondary',
                    'color-bg-tertiary': '--bg-tertiary',
                    'color-text-primary': '--text-primary',
                    'color-text-secondary': '--text-secondary',
                    'color-text-muted': '--text-muted',
                    'color-border': '--border-color',
                    'color-accent-primary': '--accent-primary',
                    'color-accent-secondary': '--accent-secondary',
                    'color-success': '--success-color',
                    'color-warning': '--warning-color',
                    'color-error': '--error-color',
                    'color-info': '--info-color'
                };
                
                Object.keys(colorMap).forEach(inputId => {
                    const element = document.getElementById(inputId);
                    if (element) {
                        const value = element.value;
                        document.documentElement.style.setProperty(colorMap[inputId], value);
                    }
                });
            }

            async function saveTheme() {
                try {
                    const themeData = {
                        gradient_type: document.getElementById('gradient-type').value,
                        gradient_angle: parseInt(document.getElementById('gradient-angle').value),
                        gradient_stops: gradientStops,
                        bg_primary: document.getElementById('color-bg-primary').value,
                        bg_secondary: document.getElementById('color-bg-secondary').value,
                        bg_tertiary: document.getElementById('color-bg-tertiary').value,
                        text_primary: document.getElementById('color-text-primary').value,
                        text_secondary: document.getElementById('color-text-secondary').value,
                        text_muted: document.getElementById('color-text-muted').value,
                        border_color: document.getElementById('color-border').value,
                        accent_primary: document.getElementById('color-accent-primary').value,
                        accent_secondary: document.getElementById('color-accent-secondary').value,
                        success_color: document.getElementById('color-success').value,
                        warning_color: document.getElementById('color-warning').value,
                        error_color: document.getElementById('color-error').value,
                        info_color: document.getElementById('color-info').value
                    };
                    
                    const response = await fetch('/api/user/theme', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(themeData)
                    });
                    
                    if (!response.ok) throw new Error('Failed to save theme');
                    
                    showToast('Theme saved successfully! Changes will persist across sessions.', 'success');
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error saving theme:', error);
                    showToast('Failed to save theme', 'error');
                }
            }

            async function resetTheme() {
                if (!confirm('Are you sure you want to reset to the default theme? This will reload the page.')) return;
                
                try {
                    const response = await fetch('/api/user/theme', { method: 'DELETE' });
                    
                    if (!response.ok) throw new Error('Failed to reset theme');
                    
                    showToast('Theme reset to defaults. Reloading...', 'success');
                    
                    // Reload page after a short delay
                    setTimeout(() => window.location.reload(), 1000);
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error resetting theme:', error);
                    showToast('Failed to reset theme', 'error');
                }
            }

            function applyThemeToPage(theme) {
                try {
                    // Handle both API response format (theme.colors) and manual format (theme.data)
                    let themeData = theme;
                    if (theme.data) {
                        themeData = typeof theme.data === 'string' ? JSON.parse(theme.data) : theme.data;
                    }
                    
                    if (themeData && themeData.colors) {
                        const root = document.documentElement;
                        if (themeData.colors.primary) root.style.setProperty('--accent-primary', themeData.colors.primary);
                        if (themeData.colors.background) root.style.setProperty('--bg-primary', themeData.colors.background);
                        if (themeData.colors.text) root.style.setProperty('--text-primary', themeData.colors.text);
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error applying theme:', error);
                }
            }

            async function applyCustomColors() {
                const primaryColor = document.getElementById('theme-primary-color')?.value;
                const bgColor = document.getElementById('theme-bg-color')?.value;
                const textColor = document.getElementById('theme-text-color')?.value;
                
                if (!primaryColor && !bgColor && !textColor) {
                    showToast('No colors selected', 'warning');
                    return;
                }
                
                try {
                    const themeData = {
                        colors: {
                            primary: primaryColor || '#3b82f6',
                            background: bgColor || '#0f172a',
                            text: textColor || '#f8fafc'
                        }
                    };
                    
                    const token = localStorage.getItem('authToken');
                    const response = await fetch('/api/themes/save', {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {}),
                        body: JSON.stringify({
                            name: 'Custom Theme',
                            data: themeData
                        })
                    });
                    
                    if (!response.ok) throw new Error('Failed to save theme');
                    applyThemeToPage({ data: themeData });
                    showToast('Custom theme applied successfully!', 'success');
                } catch (error) {
                    showToast('Failed to apply custom colors', 'error');
                }
            }

            async function saveTheme() {
                const themeName = prompt('Enter theme name:');
                if (!themeName) return;
                
                try {
                    const currentColors = {
                        primary: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim(),
                        background: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(),
                        text: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()
                    };
                    
                    const token = localStorage.getItem('authToken');
                    const response = await fetch('/api/themes/save', {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {}),
                        body: JSON.stringify({
                            name: themeName,
                            data: { colors: currentColors }
                        })
                    });
                    
                    if (!response.ok) throw new Error('Failed');
                    showToast(\`Theme "\${themeName}" saved successfully!\`, 'success');
                } catch (error) {
                    showToast('Failed to save theme', 'error');
                }
            }

            async function resetTheme() {
                if (!confirm('Reset theme to system default?')) return;
                try {
                    const response = await fetch('/api/themes/reset', { method: 'POST' });
                    if (!response.ok) throw new Error('Failed');
                    location.reload(); // Reload to apply default theme
                } catch (error) {
                    showToast('Failed to reset theme', 'error');
                }
            }

            async function exportTheme() {
                try {
                    const response = await fetch('/api/themes/current');
                    if (!response.ok) throw new Error('Failed');
                    const data = await response.json();
                    
                    const themeJson = JSON.stringify(data.theme, null, 2);
                    const blob = new Blob([themeJson], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'theme-export-' + new Date().toISOString().split('T')[0] + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Theme exported successfully', 'success');
                } catch (error) {
                    showToast('Failed to export theme', 'error');
                }
            }

            async function importTheme(event) {
                const file = event.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const theme = JSON.parse(e.target.result);
                        if (!theme.name || !theme.data) {
                            throw new Error('Invalid theme format');
                        }
                        
                        const response = await fetch('/api/themes/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(theme)
                        });
                        
                        if (!response.ok) throw new Error('Failed');
                        applyThemeToPage(theme);
                        showToast(\`Theme "\${theme.name}" imported successfully\`, 'success');
                    } catch (error) {
                        showToast('Invalid theme file', 'error');
                    }
                };
                reader.readAsText(file);
            }

            function updateColorPreview() {
                // Update color preview in real-time
                const primaryColor = document.getElementById('theme-primary-color')?.value;
                if (primaryColor) {
                    document.documentElement.style.setProperty('--accent-primary', primaryColor);
                }
            }

            // Import/Export Functions
            function exportSettings() {
                const settingsJson = JSON.stringify(currentSettings, null, 2);
                const blob = new Blob([settingsJson], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'settings-export-' + new Date().toISOString().split('T')[0] + '.json';
                a.click();
                URL.revokeObjectURL(url);
                showToast('Settings exported successfully', 'success');
            }

            function handleFileSelect(event) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const settings = JSON.parse(e.target.result);
                        if (confirm('Import these settings? This will overwrite current configuration.')) {
                            showToast('Settings imported - Save to apply', 'success');
                        }
                    } catch (error) {
                        showToast('Invalid settings file', 'error');
                    }
                };
                reader.readAsText(file);
            }
            
            // Tracing Configuration Functions
            async function loadTracingConfig() {
                try {
                    const response = await fetch('/api/tracing/status');
                    const data = await response.json();
                    
                    if (data.success && data.status) {
                        const status = data.status;
                        const isConfigured = status.endpoint && status.endpoint !== 'http://localhost:14268/api/traces';
                        
                        // Update badge
                        document.getElementById('tracing-status-badge').innerHTML = isConfigured ?
                            \`<span style="background: var(--success-color); color: white; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600;">
                                <i class="fas fa-check-circle"></i> Configured
                            </span>\` :
                            \`<span style="background: var(--warning-color); color: white; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600;">
                                <i class="fas fa-exclamation-triangle"></i> Not Configured
                            </span>\`;
                        
                        // Update configuration details
                        document.getElementById('tracing-service-name').textContent = status.service_name || 'enterprise-logging-platform';
                        document.getElementById('tracing-endpoint').textContent = status.endpoint || 'Not Set';
                        document.getElementById('tracing-sampling').textContent = \`\${(status.sampling_rate * 100).toFixed(0)}%\`;
                        
                        document.getElementById('tracing-enabled-status').innerHTML = status.enabled && isConfigured ?
                            \`<span style="color: var(--success-color); font-weight: 600;">
                                <i class="fas fa-check-circle"></i> Enabled & Active
                            </span>\` :
                            \`<span style="color: var(--warning-color); font-weight: 600;">
                                <i class="fas fa-times-circle"></i> Disabled - Requires Configuration
                            </span>\`;
                        
                        // Hide setup instructions if configured
                        if (isConfigured) {
                            document.getElementById('tracing-setup-instructions').style.display = 'none';
                        }
                    }
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Failed to load tracing config:', error);
                }
            }
            
            async function testTracingConnection() {
                try {
                    showToast('Testing tracing connection...', 'info');
                    const response = await fetch('/api/tracing/status');
                    const data = await response.json();
                    
                    if (data.success && data.status && data.status.health === 'healthy') {
                        showToast('Tracing connection successful!', 'success');
                    } else {
                        showToast('Tracing is not properly configured', 'warning');
                    }
                } catch (error) {
                    showToast('Failed to connect to tracing backend', 'error');
                }
            }
            
            // showToast() is provided by base.js template

            // Load settings on page load
            loadSettings();

            // Expose key functions globally for inline onclick handlers
            // This mirrors the logs page approach to avoid "is not defined" errors with inline handlers
            window.switchTab = typeof switchTab === 'function' ? switchTab : undefined;
            window.loadSettings = typeof loadSettings === 'function' ? loadSettings : undefined;
            window.saveSettings = typeof saveSettings === 'function' ? saveSettings : undefined;
            window.loadAPIKeys = typeof loadAPIKeys === 'function' ? loadAPIKeys : undefined;
            window.showCreateAPIKeyModal = typeof showCreateAPIKeyModal === 'function' ? showCreateAPIKeyModal : undefined;
            window.closeAPIKeyModal = typeof closeAPIKeyModal === 'function' ? closeAPIKeyModal : undefined;
            window.createAPIKey = typeof createAPIKey === 'function' ? createAPIKey : undefined;
            window.toggleAPIKeyStatus = typeof toggleAPIKeyStatus === 'function' ? toggleAPIKeyStatus : undefined;
            window.deleteAPIKey = typeof deleteAPIKey === 'function' ? deleteAPIKey : undefined;
            window.loadBackups = typeof loadBackups === 'function' ? loadBackups : undefined;
            window.createBackup = typeof createBackup === 'function' ? createBackup : undefined;
            window.downloadBackup = typeof downloadBackup === 'function' ? downloadBackup : undefined;
            window.deleteBackup = typeof deleteBackup === 'function' ? deleteBackup : undefined;
            window.refreshMetrics = typeof refreshMetrics === 'function' ? refreshMetrics : undefined;
            window.loadThemeSettings = typeof loadThemeSettings === 'function' ? loadThemeSettings : undefined;
            window.applyThemeToPage = typeof applyThemeToPage === 'function' ? applyThemeToPage : undefined;
            window.applyCustomColors = typeof applyCustomColors === 'function' ? applyCustomColors : undefined;
            window.saveTheme = typeof saveTheme === 'function' ? saveTheme : undefined;
            window.resetTheme = typeof resetTheme === 'function' ? resetTheme : undefined;
            window.exportTheme = typeof exportTheme === 'function' ? exportTheme : undefined;
            window.importTheme = typeof importTheme === 'function' ? importTheme : undefined;
            window.updateColorPreview = typeof updateColorPreview === 'function' ? updateColorPreview : undefined;
            window.exportSettings = typeof exportSettings === 'function' ? exportSettings : undefined;
            window.handleFileSelect = typeof handleFileSelect === 'function' ? handleFileSelect : undefined;
            window.loadTracingConfig = typeof loadTracingConfig === 'function' ? loadTracingConfig : undefined;
            window.testTracingConnection = typeof testTracingConnection === 'function' ? testTracingConnection : undefined;
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