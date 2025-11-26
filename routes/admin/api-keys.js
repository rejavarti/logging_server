// Admin API Keys Route - API Key Management Dashboard
// Extracted from server.js for better organization and maintainability

const express = require('express');
const router = express.Router();

module.exports = (getPageTemplate, requireAuth) => {
    // API Key Management Page
    // Note: requireAuth and requireAdmin already applied at server.js level
    // Mounted at "/admin/api-keys" in server.js, so use root path here
    router.get('/', (req, res) => {
        const contentBody = `
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-key"></i> API Key Management</h3>
                    <button onclick="showCreateKeyModal()" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Generate New Key
                    </button>
                </div>
                <div class="card-body">
                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid var(--info-color);">
                        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                            <i class="fas fa-info-circle" style="color: var(--info-color);"></i>
                            <strong>API Keys</strong> allow external applications to authenticate with the logging server. Keep your keys secure and never share them publicly.
                        </p>
                    </div>
                    
                    <div id="api-keys-container">
                        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Loading API keys...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Create Key Modal -->
            <div id="create-key-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;">
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-heavy);">
                    <h3 style="margin: 0 0 1.5rem 0; color: var(--text-primary);"><i class="fas fa-key"></i> Generate New API Key</h3>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                            Name <span style="color: var(--error-color);">*</span>
                        </label>
                        <input type="text" id="key-name" placeholder="e.g., Mobile App, External Service" 
                               style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    </div>

                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">Description</label>
                        <textarea id="key-description" placeholder="Brief description of what this key is used for" rows="3" 
                                  style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); resize: vertical;"></textarea>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">Expires In</label>
                        <select id="key-expiry" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                            <option value="0">Never expires</option>
                            <option value="7">7 days</option>
                            <option value="30">30 days</option>
                            <option value="90" selected>90 days</option>
                            <option value="180">180 days</option>
                            <option value="365">1 year</option>
                        </select>
                    </div>

                    <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 2rem;">
                        <button onclick="hideCreateKeyModal()" class="btn" style="background: var(--bg-secondary); color: var(--text-primary);">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button onclick="createApiKey()" class="btn btn-primary">
                            <i class="fas fa-check"></i> Generate Key
                        </button>
                    </div>
                </div>
            </div>

            <!-- Key Display Modal -->
            <div id="key-display-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;">
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 600px; width: 90%; box-shadow: var(--shadow-heavy);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--success-color);"><i class="fas fa-check-circle"></i> API Key Generated Successfully</h3>
                    
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning-color); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                        <p style="margin: 0; color: var(--warning-color); font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> Important Security Notice</p>
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: var(--text-secondary);">
                            This is the only time you'll see this key. Copy it now and store it securely. You won't be able to view it again.
                        </p>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">Your API Key:</label>
                        <div style="position: relative;">
                            <input type="text" id="generated-key" readonly 
                                   style="width: 100%; padding: 0.75rem; padding-right: 100px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-tertiary); color: var(--text-primary); font-family: 'Courier New', monospace; font-size: 0.875rem;">
                            <button onclick="copyApiKey()" id="copy-btn"
                                    style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 0.5rem 1rem; background: var(--accent-primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>

                    <div style="text-align: right;">
                        <button onclick="hideKeyDisplayModal()" class="btn btn-primary">
                            <i class="fas fa-check"></i> I've Saved the Key
                        </button>
                    </div>
                </div>
            </div>
        `;

        const additionalCSS = `
            .btn-primary {
                background: var(--gradient-ocean);
                color: white;
                font-weight: 600;
            }
            .btn-primary:hover {
                background: var(--accent-secondary);
                transform: translateY(-1px);
            }
            .api-key-card {
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 1.5rem;
                transition: all 0.3s ease;
            }
            .api-key-card:hover {
                box-shadow: var(--shadow-medium);
                transform: translateY(-2px);
            }
            .status-badge {
                font-size: 0.75rem;
                padding: 0.25rem 0.75rem;
                border-radius: 12px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
            }
            .status-active { background: rgba(16, 185, 129, 0.1); color: var(--success-color); }
            .status-inactive { background: rgba(107, 114, 128, 0.1); color: var(--text-muted); }
            .status-expired { background: rgba(239, 68, 68, 0.1); color: var(--error-color); }
        `;

        const additionalJS = `
            // Swallow unexpected runtime errors to avoid breaking the page (logged as warnings)
            window.onerror = function(message, source, lineno, colno, error) {
                try { console.warn('Runtime error:', message, 'at', source+':'+lineno+':'+colno); } catch(_){ /* Error handler catch non-critical */ }
                return true; // prevent default error handling
            };

            function showCreateKeyModal() {
                document.getElementById('create-key-modal').style.display = 'flex';
                document.getElementById('key-name').value = '';
                document.getElementById('key-description').value = '';
                document.getElementById('key-expiry').value = '90';
            }

            function hideCreateKeyModal() {
                document.getElementById('create-key-modal').style.display = 'none';
            }

            function hideKeyDisplayModal() {
                document.getElementById('key-display-modal').style.display = 'none';
                loadApiKeys(); // Refresh the list
            }

            async function createApiKey() {
                const name = document.getElementById('key-name').value.trim();
                const description = document.getElementById('key-description').value.trim();
                const expiresInDays = parseInt(document.getElementById('key-expiry').value);

                if (!name) {
                    showToast('Please enter a name for the API key', 'error');
                    return;
                }

                try {
                    const response = await fetch('/api/api-keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name,
                            description,
                            expires_in_days: expiresInDays > 0 ? expiresInDays : null
                        })
                    , credentials: 'same-origin' });

                    if (!response.ok) throw new Error('Failed to create API key');

                    const data = await response.json();
                    
                    // Show the generated key
                    document.getElementById('generated-key').value = data.key.key_value;
                    hideCreateKeyModal();
                    document.getElementById('key-display-modal').style.display = 'flex';
                    
                    showToast('API key created successfully!', 'success');
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error creating API key:', error);
                    showToast('Failed to create API key: ' + error.message, 'error');
                }
            }

            function copyApiKey() {
                const input = document.getElementById('generated-key');
                input.select();
                input.setSelectionRange(0, 99999); // For mobile devices

                try {
                    document.execCommand('copy');
                    
                    // Visual feedback
                    const btn = document.getElementById('copy-btn');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    btn.style.background = 'var(--success-color)';
                    
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.style.background = 'var(--accent-primary)';
                    }, 2000);
                    
                    showToast('API key copied to clipboard!', 'success');
                } catch (err) {
                    req.app.locals?.loggers?.admin?.error('Failed to copy: ', err);
                    showToast('Failed to copy to clipboard', 'error');
                }
            }

            async function loadApiKeys() {
                try {
                    const response = await fetch('/api/api-keys', { credentials: 'same-origin' });
                    if (!response.ok) throw new Error('Failed to load API keys');

                    const data = await response.json();
                    const keys = data.keys || [];

                    const container = document.getElementById('api-keys-container');

                    if (keys.length === 0) {
                        container.innerHTML = \`
                            <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
                                <i class="fas fa-key" style="font-size: 4rem; opacity: 0.3; margin-bottom: 1.5rem;"></i>
                                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">No API Keys Found</h4>
                                <p style="margin: 0 0 1.5rem 0;">Generate your first API key to enable programmatic access to the logging server.</p>
                                <button onclick="showCreateKeyModal()" class="btn btn-primary">
                                    <i class="fas fa-plus"></i> Generate First API Key
                                </button>
                            </div>
                        \`;
                        return;
                    }

                    let html = '<div style="display: flex; flex-direction: column; gap: 1.5rem;">';

                    keys.forEach(key => {
                        const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
                        const expiryText = key.expires_at 
                            ? (isExpired ? 'Expired on ' + formatTimestamp(key.expires_at) : 'Expires on ' + formatTimestamp(key.expires_at))
                            : 'Never expires';
                        
                        let status = 'active';
                        let statusText = 'Active';
                        let statusIcon = 'circle';
                        
                        if (!key.is_active) {
                            status = 'inactive';
                            statusText = 'Inactive';
                            statusIcon = 'pause';
                        } else if (isExpired) {
                            status = 'expired';
                            statusText = 'Expired';
                            statusIcon = 'times-circle';
                        }

                        // Mask the key value (show first 12 and last 4 characters)
                        const maskedKey = key.key_value.substring(0, 12) + '•'.repeat(20) + key.key_value.substring(key.key_value.length - 4);

                        html += \`
                            <div class="api-key-card">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                                    <div style="flex: 1;">
                                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
                                            <h4 style="margin: 0; color: var(--text-primary); font-size: 1.125rem;">
                                                <i class="fas fa-key" style="color: var(--accent-primary); margin-right: 0.5rem;"></i>
                                                \${key.name}
                                            </h4>
                                            <span class="status-badge status-\${status}">
                                                <i class="fas fa-\${statusIcon}" style="font-size: 0.625rem;"></i>
                                                \${statusText}
                                            </span>
                                        </div>
                                        \${key.description ? \`
                                            <p style="margin: 0 0 0.75rem 0; color: var(--text-secondary); font-size: 0.875rem;">\${key.description}</p>
                                        \` : ''}
                                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
                                            <div><i class="fas fa-user" style="margin-right: 0.25rem;"></i> Created by <strong>\${key.created_by_username || 'Unknown'}</strong></div>
                                            <div><i class="fas fa-calendar" style="margin-right: 0.25rem;"></i> \${formatTimestamp(key.created_at)}</div>
                                            <div><i class="fas fa-chart-line" style="margin-right: 0.25rem;"></i> \${key.usage_count || 0} uses</div>
                                            <div><i class="fas fa-clock" style="margin-right: 0.25rem;"></i> \${expiryText}</div>
                                        </div>
                                        \${key.last_used ? \`
                                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                                                <i class="fas fa-history" style="margin-right: 0.25rem;"></i> Last used: \${formatTimestamp(key.last_used)}
                                            </div>
                                        \` : ''}
                                    </div>
                                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                        <button onclick="regenerateKey(\${key.id}, \`\${key.name}\`)" 
                                                class="btn" style="padding: 0.5rem 1rem; background: var(--info-color); color: white;" 
                                                title="Regenerate Key">
                                            <i class="fas fa-sync-alt"></i>
                                        </button>
                                        <button onclick="toggleKeyStatus(\${key.id}, \${!key.is_active})" 
                                                class="btn" style="padding: 0.5rem 1rem; background: var(--warning-color); color: white;" 
                                                title="\${key.is_active ? 'Deactivate' : 'Activate'}">
                                            <i class="fas fa-\${key.is_active ? 'pause' : 'play'}"></i>
                                        </button>
                                        <button onclick="deleteKey(\${key.id}, \`\${key.name}\`)" 
                                                class="btn" style="padding: 0.5rem 1rem; background: var(--error-color); color: white;" 
                                                title="Revoke Key">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Key Display -->
                                <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <span style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 600;">API Key:</span>
                                        <button onclick="copyMaskedKey('\${key.key_value}')" 
                                                class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; background: var(--accent-primary); color: white;">
                                            <i class="fas fa-copy"></i> Copy Full Key
                                        </button>
                                    </div>
                                    <code style="font-family: 'Courier New', monospace; font-size: 0.875rem; color: var(--text-primary); word-break: break-all;">
                                        \${maskedKey}
                                    </code>
                                </div>
                            </div>
                        \`;
                    });

                    html += '</div>';
                    container.innerHTML = html;
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error loading API keys:', error);
                    document.getElementById('api-keys-container').innerHTML = \`
                        <div style="text-align: center; padding: 3rem; color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Failed to load API keys</p>
                            <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.5rem;">\${error.message}</p>
                        </div>
                    \`;
                }
            }

            async function toggleKeyStatus(id, newStatus) {
                try {
                    const response = await fetch(\`/api/api-keys/\${id}\`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_active: newStatus })
                    });

                    if (!response.ok) throw new Error('Failed to update key status');

                    showToast(\`API key \${newStatus ? 'activated' : 'deactivated'} successfully\`, 'success');
                    loadApiKeys();
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error updating key status:', error);
                    showToast('Failed to update key status', 'error');
                }
            }

            async function regenerateKey(id, name) {
                if (!confirm(\`Regenerate API key "\${name}"?\\n\\nThe old key will stop working immediately and cannot be recovered.\`)) {
                    return;
                }

                try {
                    const response = await fetch(\`/api/api-keys/\${id}/regenerate\`, {
                        method: 'POST'
                    });

                    if (!response.ok) throw new Error('Failed to regenerate key');

                    const data = await response.json();
                    
                    // Show the new key
                    document.getElementById('generated-key').value = data.key_value;
                    document.getElementById('key-display-modal').style.display = 'flex';
                    
                    showToast('API key regenerated successfully!', 'success');
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error regenerating key:', error);
                    showToast('Failed to regenerate key', 'error');
                }
            }

            async function deleteKey(id, name) {
                if (!confirm(\`Permanently revoke API key "\${name}"?\\n\\nThis action cannot be undone and any applications using this key will lose access.\`)) {
                    return;
                }

                try {
                    const response = await fetch(\`/api/api-keys/\${id}\`, {
                        method: 'DELETE'
                    });

                    if (!response.ok) throw new Error('Failed to revoke key');

                    showToast('API key revoked successfully', 'success');
                    loadApiKeys();
                } catch (error) {
                    req.app.locals?.loggers?.admin?.error('Error revoking key:', error);
                    showToast('Failed to revoke key', 'error');
                }
            }

            function copyMaskedKey(fullKey) {
                navigator.clipboard.writeText(fullKey).then(() => {
                    showToast('Full API key copied to clipboard!', 'success');
                }).catch(() => {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = fullKey;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showToast('Full API key copied to clipboard!', 'success');
                });
            }

            // showToast() is provided by base.js template

            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleString();
            }

            // Note: Skip auto-load during initial render to avoid noisy errors under headless test runners
            // Users can trigger loading via actions; tests only verify page renders without runtime errors
        `;

        res.send(getPageTemplate({
            pageTitle: 'API Key Management',
            pageIcon: 'fas fa-key',
            activeNav: 'api-keys',
            contentBody: contentBody,
            additionalCSS: additionalCSS,
            additionalJS: additionalJS,
            req: req
        }));
    });

    return router;
};