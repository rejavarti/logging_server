/**
 * Complete Page Template System
 * Extracted from monolithic server.js with 100% feature preservation
 * 
 * This module contains:
 * - Complete theme system (auto/light/dark/ocean)  
 * - All CSS variables and styling
 * - Complete JavaScript utilities
 * - Sidebar navigation
 * - Header with theme toggle
 * - All animations and effects
 * 
 * ZERO functionality loss - every style, theme, and feature preserved
 */

const moment = require('moment-timezone');

/**
 * Master Page Template Generator
 * Creates consistent layout for all pages with complete theme system
 * 
 * Support both object and individual parameter calls for compatibility
 */
function getPageTemplate(pageTitle, contentBody, additionalCSS, additionalJS, req, activeNav, pageIcon) {
    // Handle both object and individual parameter calls
    let options;
    if (typeof pageTitle === 'object') {
        options = pageTitle;
    } else {
        options = {
            pageTitle: pageTitle || 'Dashboard',
            contentBody: contentBody || '',
            additionalCSS: additionalCSS || '',
            additionalJS: additionalJS || '',
            req: req || { user: { username: 'admin', role: 'admin' } },
            activeNav: activeNav || 'dashboard',
            pageIcon: pageIcon || 'fa-tachometer-alt'
        };
    }
    
    const {
        pageTitle: title = 'Dashboard',
        pageIcon: icon = 'fa-tachometer-alt',
        activeNav: nav = 'dashboard',
        contentBody: content = '',
        additionalCSS: extraCSS = '',
        additionalJS: extraJS = '',
        req: requestObj
    } = options;
    
    // Ensure we have user data
    const user = requestObj?.user || { username: 'admin', role: 'admin' };

    // Get system settings for theme and timezone (will be injected by server)
    const SYSTEM_SETTINGS = options.SYSTEM_SETTINGS || {};
    const TIMEZONE = options.TIMEZONE || 'America/Edmonton';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | Enterprise Logging Platform</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js"></script>
        <style>
            :root {
                /* Light Theme Colors */
                --bg-primary: #ffffff;
                --bg-secondary: #f8fafc;
                --bg-tertiary: #f1f5f9;
                --text-primary: #1e293b;
                --text-secondary: #475569;
                --text-muted: #64748b;
                --border-color: #e2e8f0;
                
                /* Ocean Gradients */
                --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
                --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #1d4ed8;
                --success-color: #10b981;
                --warning-color: #f59e0b;
                --error-color: #ef4444;
                --info-color: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
                
                --sidebar-bg: var(--gradient-ocean);
            }

            /* Dark Theme */
            [data-theme="dark"] {
                --bg-primary: #1e293b;
                --bg-secondary: #334155;
                --bg-tertiary: #475569;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-color: #475569;
                
                /* Ocean Gradients for Dark Theme */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                --sidebar-bg: var(--gradient-deep-blue);
            }

            /* Auto Theme - follows system preference */
            @media (prefers-color-scheme: dark) {
                [data-theme="auto"] {
                    --bg-primary: #1e293b;
                    --bg-secondary: #334155;
                    --bg-tertiary: #475569;
                    --text-primary: #f1f5f9;
                    --text-secondary: #cbd5e1;
                    --text-muted: #94a3b8;
                    --border-color: #475569;
                    
                    /* Ocean Gradients for Auto Dark Mode */
                    --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                    --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                    --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                    
                    /* Standard Colors - Using Ocean Gradient as Primary */
                    --accent-primary: var(--gradient-ocean);
                    --btn-primary: var(--gradient-ocean);
                    --accent-secondary: #3b82f6;
                    --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                    --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                    --sidebar-bg: var(--gradient-deep-blue);
                }
            }

            /* Ocean Theme */
            [data-theme="ocean"] {
                --bg-primary: #1e293b;
                --bg-secondary: #334155;
                --bg-tertiary: #475569;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-color: #475569;
                
                /* Ocean Gradients */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors - Using Ocean Gradient as Primary */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                --sidebar-bg: var(--gradient-deep-blue);
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background: var(--bg-secondary);
                color: var(--text-primary);
                line-height: 1.6;
            }

            .dashboard-container {
                display: flex;
                min-height: 100vh;
            }

            .sidebar {
                width: 280px;
                background: var(--sidebar-bg);
                padding: 2rem 0;
                display: flex;
                flex-direction: column;
                color: white;
                position: relative;
                overflow: hidden;
            }

            .sidebar::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
                pointer-events: none;
            }

            .sidebar-header {
                border-bottom: 1px solid rgba(255,255,255,0.2);
                margin-bottom: 2rem;
                position: relative;
                z-index: 1;
                overflow: hidden;
                background: var(--gradient-ocean);
                margin: -2rem -2rem 2rem -2rem;
                padding: 0 2rem;
                text-align: center;
                height: 94px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .sidebar-header::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
                animation: headerShimmer 4s ease-in-out infinite;
                pointer-events: none;
            }

            .sidebar-header h2 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 700;
                position: relative;
                z-index: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                line-height: 1.2;
            }

            .sidebar-header p {
                margin: 0;
                opacity: 0.8;
                font-size: 0.875rem;
                position: relative;
                z-index: 1;
            }

            .sidebar-nav {
                list-style: none;
                padding: 0;
                margin: 0;
                flex: 1;
                position: relative;
                z-index: 1;
            }

            .sidebar-nav li {
                margin: 0;
            }

            .sidebar-nav a {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 1rem 2rem;
                color: rgba(255,255,255,0.9);
                text-decoration: none;
                transition: all 0.3s ease;
                border-left: 3px solid transparent;
                position: relative;
            }

            .sidebar-nav a:hover {
                background: rgba(255,255,255,0.1);
                color: white;
                border-left-color: rgba(255,255,255,0.5);
            }

            .sidebar-nav a.active {
                background: rgba(255,255,255,0.15);
                color: white;
                border-left-color: white;
                font-weight: 600;
            }

            .sidebar-nav i {
                width: 20px;
                font-size: 1.1rem;
            }

            .sidebar-footer {
                padding: 2rem;
                border-top: 1px solid rgba(255,255,255,0.2);
                margin-top: auto;
                position: relative;
                z-index: 1;
            }

            .user-info {
                margin-bottom: 1rem;
                padding: 1rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                text-align: center;
            }

            .user-info strong {
                display: block;
                margin-bottom: 0.25rem;
                color: white;
                font-size: 1.1rem;
            }

            .user-role {
                font-size: 0.85rem;
                color: #3b82f6;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
            }

            .btn-logout {
                width: 100%;
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.4);
                color: white;
                padding: 0.75rem;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.9rem;
            }

            .btn-logout:hover {
                background: rgba(239, 68, 68, 0.3);
                border-color: rgba(239, 68, 68, 0.6);
            }

            .main-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .content-header {
                background: var(--gradient-ocean);
                padding: 1.5rem 2rem;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: var(--shadow-light);
                position: relative;
                overflow: hidden;
            }

            .content-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
                animation: headerShimmer 4s ease-in-out infinite;
            }

            .content-header h1 {
                margin: 0;
                color: white;
                font-size: 1.75rem;
                font-weight: 700;
                position: relative;
                z-index: 1;
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                position: relative;
                z-index: 1;
            }

            .theme-toggle {
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                color: var(--text-primary);
                padding: 0.75rem;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 1.2rem;
                box-shadow: var(--shadow-light);
                display: flex;
                align-items: center;
                justify-content: center;
                width: 45px;
                height: 45px;
            }

            .theme-toggle:hover {
                transform: scale(1.1) rotate(15deg);
                box-shadow: var(--shadow-medium);
                border-color: var(--accent-primary);
            }

            .content-body {
                flex: 1;
                padding: 2rem;
                overflow-y: auto;
                background: var(--bg-secondary);
            }

            .timestamp {
                font-size: 0.875rem;
                color: var(--text-muted);
                font-weight: 500;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.875rem;
                font-weight: 600;
            }

            .status-indicator.online {
                color: var(--success-color);
            }

            /* Universal Button Styles */
            .btn, button.btn, a.btn {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                padding: 0.375rem 0.75rem;
                background: var(--gradient-ocean);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                box-shadow: var(--shadow-light);
            }

            .btn:hover, button.btn:hover, a.btn:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-medium);
                filter: brightness(1.1);
            }

            .btn:active, button.btn:active, a.btn:active {
                transform: translateY(0);
            }

            .btn-secondary, button.btn-secondary, a.btn-secondary {
                background: var(--bg-tertiary);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
            }

            .btn-secondary:hover, button.btn-secondary:hover, a.btn-secondary:hover {
                background: var(--bg-secondary);
                border-color: var(--accent-primary);
            }

            .btn-danger, button.btn-danger, a.btn-danger {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                border: none;
            }

            .btn-success, button.btn-success, a.btn-success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
            }

            .btn-warning, button.btn-warning, a.btn-warning {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: white;
                border: none;
            }

            .btn:disabled, button.btn:disabled, a.btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                pointer-events: none;
            }

            /* Card Component */
            .card {
                background: var(--bg-primary);
                border-radius: 12px;
                box-shadow: var(--shadow-light);
                border: 1px solid var(--border-color);
                margin-bottom: 1.5rem;
                overflow: hidden;
                transition: all 0.3s ease;
            }

            .card:hover {
                box-shadow: var(--shadow-medium);
                transform: translateY(-2px);
            }

            .card-header {
                padding: 1.5rem;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-secondary);
            }

            .card-header h3 {
                margin: 0;
                font-size: 1.25rem;
                color: var(--text-primary);
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .card-header h3 i {
                color: var(--accent-primary);
            }

            .card-body {
                padding: 1.5rem;
            }

            .card-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid var(--border-color);
                background: var(--bg-secondary);
                display: flex;
                justify-content: flex-end;
                gap: 1rem;
            }

            /* Data Table Component */
            .data-table {
                width: 100%;
                border-collapse: collapse;
                background: var(--bg-primary);
                border-radius: 8px;
                overflow: hidden;
            }

            .data-table thead {
                background: var(--bg-secondary);
            }

            .data-table thead th {
                padding: 1rem;
                text-align: left;
                font-weight: 600;
                color: var(--text-primary);
                font-size: 0.875rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 2px solid var(--border-color);
            }

            .data-table tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: all 0.2s ease;
            }

            .data-table tbody tr:hover {
                background: var(--bg-secondary);
                transform: scale(1.01);
            }

            .data-table tbody tr:last-child {
                border-bottom: none;
            }

            .data-table tbody td {
                padding: 1rem;
                color: var(--text-secondary);
                font-size: 0.925rem;
                vertical-align: middle;
            }

            .data-table tbody td:first-child {
                font-weight: 500;
                color: var(--text-primary);
            }

            /* Status Badges */
            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.375rem;
                padding: 0.375rem 0.75rem;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 600;
                letter-spacing: 0.3px;
                text-transform: uppercase;
                transition: all 0.2s ease;
            }

            .status-badge.online {
                background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                color: #065f46;
                border: 1px solid #6ee7b7;
            }

            [data-theme="dark"] .status-badge.online, [data-theme="ocean"] .status-badge.online {
                background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
                color: #6ee7b7;
                border: 1px solid #059669;
            }

            .status-badge.offline {
                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                color: #991b1b;
                border: 1px solid #fca5a5;
            }

            [data-theme="dark"] .status-badge.offline, [data-theme="ocean"] .status-badge.offline {
                background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
                color: #fca5a5;
                border: 1px solid #dc2626;
            }

            .status-badge.pending {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                color: #78350f;
                border: 1px solid #fbbf24;
            }

            [data-theme="dark"] .status-badge.pending, [data-theme="ocean"] .status-badge.pending {
                background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
                color: #fbbf24;
                border: 1px solid #f59e0b;
            }

            /* Form Components */
            .form-group {
                margin-bottom: 1.5rem;
            }

            .form-group label {
                display: block;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 0.5rem;
                font-size: 0.95rem;
            }

            .form-group label i {
                margin-right: 0.5rem;
                color: var(--accent-primary);
            }

            .form-control {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid var(--border-color);
                border-radius: 8px;
                background: var(--bg-primary);
                color: var(--text-primary);
                font-size: 1rem;
                transition: all 0.2s ease;
                font-family: inherit;
            }

            .form-control:focus {
                outline: none;
                border-color: var(--accent-primary);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                background: var(--bg-primary);
            }

            .form-control::placeholder {
                color: var(--text-muted);
                opacity: 0.7;
            }

            textarea.form-control {
                resize: vertical;
                min-height: 100px;
                font-family: inherit;
            }

            select.form-control {
                cursor: pointer;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 0.75rem center;
                padding-right: 2.5rem;
            }

            input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
                accent-color: var(--accent-primary);
            }

            .form-group small {
                display: block;
                margin-top: 0.5rem;
                font-size: 0.875rem;
                color: var(--text-muted);
            }

            /* Stats Cards */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1.5rem;
                margin-bottom: 2rem;
            }

            .stat-card {
                background: var(--bg-primary);
                padding: 1.5rem;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                box-shadow: var(--shadow-light);
                transition: all 0.3s ease;
            }

            .stat-card:hover {
                transform: translateY(-4px);
                box-shadow: var(--shadow-medium);
            }

            .stat-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }

            .stat-title {
                font-size: 0.875rem;
                color: var(--text-muted);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .stat-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                background: var(--gradient-ocean);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
            }

            .stat-value {
                font-size: 2rem;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 0.5rem;
            }

            .stat-label {
                font-size: 0.875rem;
                color: var(--text-muted);
            }

            /* Utility Classes */
            .text-center {
                text-align: center;
            }

            .text-right {
                text-align: right;
            }

            .text-muted {
                color: var(--text-muted);
            }

            .text-primary {
                color: var(--text-primary);
            }

            .text-success {
                color: var(--success-color);
            }

            .text-warning {
                color: var(--warning-color);
            }

            .text-error {
                color: var(--error-color);
            }

            .mb-0 { margin-bottom: 0; }
            .mb-1 { margin-bottom: 0.5rem; }
            .mb-2 { margin-bottom: 1rem; }
            .mb-3 { margin-bottom: 1.5rem; }
            .mb-4 { margin-bottom: 2rem; }

            .mt-0 { margin-top: 0; }
            .mt-1 { margin-top: 0.5rem; }
            .mt-2 { margin-top: 1rem; }
            .mt-3 { margin-top: 1.5rem; }
            .mt-4 { margin-top: 2rem; }

            .flex {
                display: flex;
            }

            .flex-between {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .flex-center {
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .gap-1 { gap: 0.5rem; }
            .gap-2 { gap: 1rem; }
            .gap-3 { gap: 1.5rem; }
            .gap-4 { gap: 2rem; }

            /* Animation Keyframes */
            @keyframes headerShimmer {
                0% { transform: translateX(-100%); }
                50% { transform: translateX(100%); }
                100% { transform: translateX(-100%); }
            }

            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            ${extraCSS}
        </style>
    </head>
    <body data-theme="auto">
        <div class="dashboard-container">
            <!-- Sidebar -->
            <nav class="sidebar">
                <div class="sidebar-header">
                    <h2><i class="fas fa-chart-network"></i> Enterprise Logging Platform</h2>
                </div>
                <ul class="sidebar-nav">
                    <li><a href="/dashboard" ${nav === 'dashboard' ? 'class="active"' : ''}><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
                    <li><a href="/logs" ${nav === 'logs' ? 'class="active"' : ''}><i class="fas fa-file-alt"></i> Logs</a></li>
                    <li><a href="/search" ${nav === 'search' ? 'class="active"' : ''}><i class="fas fa-search"></i> Advanced Search</a></li>
                    <li><a href="/integrations" ${nav === 'integrations' ? 'class="active"' : ''}><i class="fas fa-plug"></i> Integrations</a></li>
                    <li><a href="/webhooks" ${nav === 'webhooks' ? 'class="active"' : ''}><i class="fas fa-link"></i> Webhooks</a></li>
                    <li><a href="/activity" ${nav === 'activity' ? 'class="active"' : ''}><i class="fas fa-history"></i> Activity</a></li>
                    <li><a href="/analytics-advanced" ${nav === 'analytics-advanced' ? 'class="active"' : ''}><i class="fas fa-chart-line"></i> Advanced Analytics</a></li>
                    <li><a href="/admin/ingestion" ${nav === 'ingestion' ? 'class="active"' : ''}><i class="fas fa-network-wired"></i> Multi-Protocol Ingestion</a></li>
                    <li><a href="/admin/tracing" ${nav === 'tracing' ? 'class="active"' : ''}><i class="fas fa-project-diagram"></i> Distributed Tracing</a></li>
                    <li><a href="/admin/dashboards" ${nav === 'dashboards' ? 'class="active"' : ''}><i class="fas fa-tachometer-alt"></i> Dashboard Builder</a></li>
                    <li><a href="/admin/security" ${nav === 'security' ? 'class="active"' : ''}><i class="fas fa-shield-alt"></i> Security & Audit</a></li>
                    <li><a href="/admin/users" ${nav === 'users' ? 'class="active"' : ''}><i class="fas fa-users"></i> Users</a></li>
                    <li><a href="/admin/settings" ${nav === 'settings' ? 'class="active"' : ''}><i class="fas fa-cog"></i> Settings</a></li>
                </ul>
                <div class="sidebar-footer">
                    <div class="user-info">
                        <strong><i class="fas fa-user-circle"></i> ${user.username}</strong>
                        <span class="user-role">${user.role}</span>
                    </div>
                    <button onclick="logout()" class="btn-logout">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>
            </nav>

            <!-- Main Content -->
            <main class="main-content">
                <header class="content-header">
                    <h1><i class="${icon}"></i> ${title}</h1>
                    <div class="header-actions">
                        <a href="/search" class="search-toggle" title="Advanced Search" style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: var(--bg-secondary); color: var(--text-primary); text-decoration: none; margin-right: 8px; transition: all 0.3s ease; border: 1px solid var(--border-color);">
                            <i class="fas fa-search"></i>
                        </a>
                        <button onclick="toggleTheme()" class="theme-toggle" title="Auto Mode (Click for Light)">
                            <i id="theme-icon" class="fas fa-adjust"></i>
                        </button>
                        <span class="timestamp" id="current-time"></span>
                        <span class="status-indicator online">
                            <i class="fas fa-circle"></i> System Online
                        </span>
                    </div>
                </header>

                <div class="content-body">
                    ${content}
                </div>
            </main>
        </div>

        <script>
            // ===== SHARED JAVASCRIPT UTILITIES - SINGLE SOURCE OF TRUTH =====
            
            // TIMEZONE CONFIGURATION (from server settings)
            const TIMEZONE = '${SYSTEM_SETTINGS.timezone || TIMEZONE}';
            const TIMEZONE_ABBR = '${moment().tz(SYSTEM_SETTINGS.timezone || TIMEZONE).format('z')}';
            const DEFAULT_THEME = '${SYSTEM_SETTINGS.default_theme || 'auto'}';
            
            // Format time in configured timezone
            function formatTime(date) {
                if (!date) return 'N/A';
                const d = new Date(date);
                return d.toLocaleString('en-US', {
                    timeZone: TIMEZONE,
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            // Update current time display
            function updateTime() {
                const now = new Date();
                document.getElementById('current-time').textContent = formatTime(now);
            }

            // Theme Management - COMPLETE SYSTEM PRESERVED
            let currentTheme = localStorage.getItem('theme') || DEFAULT_THEME;
            
            function toggleTheme() {
                const themes = ['auto', 'light', 'dark', 'ocean'];
                const currentIndex = themes.indexOf(currentTheme);
                currentTheme = themes[(currentIndex + 1) % themes.length];
                localStorage.setItem('theme', currentTheme);
                applyTheme();
            }

            function applyTheme() {
                const icon = document.getElementById('theme-icon');
                const body = document.body;
                
                if (currentTheme === 'light') {
                    body.setAttribute('data-theme', 'light');
                    icon.className = 'fas fa-sun';
                    document.querySelector('.theme-toggle').title = 'Light Mode (Click for Dark)';
                } else if (currentTheme === 'dark') {
                    body.setAttribute('data-theme', 'dark');
                    icon.className = 'fas fa-moon';
                    document.querySelector('.theme-toggle').title = 'Dark Mode (Click for Ocean)';
                } else if (currentTheme === 'ocean') {
                    body.setAttribute('data-theme', 'ocean');
                    icon.className = 'fas fa-water';
                    document.querySelector('.theme-toggle').title = 'Ocean Blue Mode (Click for Auto)';
                } else {
                    // Auto mode
                    const hour = new Date().getHours();
                    if (hour >= 6 && hour < 18) {
                        body.setAttribute('data-theme', 'light');
                    } else {
                        body.setAttribute('data-theme', 'ocean');
                    }
                    icon.className = 'fas fa-adjust';
                    document.querySelector('.theme-toggle').title = 'Auto Mode (Click for Light)';
                }
            }

            // Notification System
            function showNotification(message, type = 'info') {
                console.log(\`[\${type.toUpperCase()}] \${message}\`);
                alert(message);
            }

            // Logout Function
            async function logout() {
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            }

            // Initialize on page load
            document.addEventListener('DOMContentLoaded', function() {
                applyTheme();
                updateTime();
                setInterval(updateTime, 1000);
            });

            // ===== COMPLETE UTILITY FUNCTIONS - ALL PRESERVED =====
            
            // Toast Notifications
            function showToast(message, type = 'info') {
                const toast = document.createElement('div');
                const colors = {
                    success: 'var(--success-color)',
                    error: 'var(--error-color)',
                    warning: 'var(--warning-color)',
                    info: 'var(--accent-primary)'
                };
                const icons = {
                    success: 'check-circle',
                    error: 'exclamation-circle',
                    warning: 'exclamation-triangle',
                    info: 'info-circle'
                };
                
                toast.style.cssText = \`
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: \${colors[type] || colors.info};
                    color: white;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 10001;
                    animation: slideInRight 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    min-width: 250px;
                    max-width: 400px;
                \`;
                
                // Secure toast creation without innerHTML
                const icon = document.createElement('i');
                icon.className = \`fas fa-\${icons[type] || icons.info}\`;
                
                const textSpan = document.createElement('span');
                textSpan.textContent = message; // XSS-safe text assignment
                
                toast.appendChild(icon);
                toast.appendChild(textSpan);
                
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.animation = 'slideOutRight 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }

            // Format timestamp for display
            function formatTimestamp(timestamp, options = {}) {
                if (!timestamp) return 'N/A';
                try {
                    let dateStr = timestamp;
                    if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
                        dateStr = dateStr.replace(' ', 'T') + 'Z';
                    }
                    
                    const date = new Date(dateStr);
                    if (isNaN(date.getTime())) return timestamp;
                    
                    const opts = {
                        timeZone: TIMEZONE,
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                        ...options
                    };
                    
                    return date.toLocaleString('en-US', opts);
                } catch (error) {
                    console.error('Error formatting timestamp:', error);
                    return timestamp;
                }
            }

            // Format Bytes
            function formatBytes(bytes, decimals = 2) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const dm = decimals < 0 ? 0 : decimals;
                const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
            }

            // Format Number with commas
            function formatNumber(num) {
                return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
            }

            // Get Status Color
            function getStatusColor(status) {
                const statusMap = {
                    'online': '#10b981',
                    'success': '#10b981',
                    'active': '#10b981',
                    'offline': '#ef4444',
                    'error': '#ef4444',
                    'failed': '#ef4444',
                    'degraded': '#f59e0b',
                    'warning': '#f59e0b',
                    'pending': '#f59e0b',
                    'disabled': '#6b7280',
                    'inactive': '#6b7280',
                    'unknown': '#9ca3af'
                };
                return statusMap[status?.toLowerCase()] || '#9ca3af';
            }

            // Get Status Icon
            function getStatusIcon(status) {
                const iconMap = {
                    'online': 'check-circle',
                    'success': 'check-circle',
                    'active': 'check-circle',
                    'offline': 'times-circle',
                    'error': 'times-circle',
                    'failed': 'times-circle',
                    'degraded': 'exclamation-circle',
                    'warning': 'exclamation-triangle',
                    'pending': 'clock',
                    'disabled': 'ban',
                    'inactive': 'ban',
                    'unknown': 'question-circle'
                };
                return iconMap[status?.toLowerCase()] || 'question-circle';
            }

            // Time Ago Helper
            function timeAgo(timestamp) {
                const now = new Date();
                const time = new Date(timestamp);
                const diffMs = now - time;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                
                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return \`\${diffMins} minute\${diffMins !== 1 ? 's' : ''} ago\`;
                if (diffHours < 24) return \`\${diffHours} hour\${diffHours !== 1 ? 's' : ''} ago\`;
                if (diffDays < 7) return \`\${diffDays} day\${diffDays !== 1 ? 's' : ''} ago\`;
                return time.toLocaleDateString();
            }

            // Debounce Helper
            function debounce(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            }

            // Copy to Clipboard
            async function copyToClipboard(text) {
                try {
                    await navigator.clipboard.writeText(text);
                    showToast('Copied to clipboard', 'success');
                } catch (err) {
                    console.error('Failed to copy:', err);
                    showToast('Failed to copy to clipboard', 'error');
                }
            }

            // Confirm Dialog
            function confirmDialog(message, callback) {
                if (confirm(message)) {
                    callback();
                }
            }

            // Loading Spinner - XSS-safe implementation
            function showLoading(elementId) {
                const element = document.getElementById(elementId);
                if (element) {
                    // Clear existing content safely
                    element.textContent = '';
                    
                    // Create container
                    const container = document.createElement('div');
                    container.style.textAlign = 'center';
                    container.style.padding = '3rem';
                    container.style.color = 'var(--text-muted)';
                    
                    // Create spinner icon
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-spinner fa-spin';
                    icon.style.fontSize = '2rem';
                    icon.style.marginBottom = '0.5rem';
                    
                    // Create loading text
                    const text = document.createElement('p');
                    text.textContent = 'Loading...';
                    
                    container.appendChild(icon);
                    container.appendChild(text);
                    element.appendChild(container);
                }
            }

            // Error Display - XSS-safe implementation
            function showError(elementId, message) {
                const element = document.getElementById(elementId);
                if (element) {
                    // Clear existing content safely
                    element.textContent = '';
                    
                    // Create container
                    const container = document.createElement('div');
                    container.style.textAlign = 'center';
                    container.style.padding = '3rem';
                    container.style.color = 'var(--error-color)';
                    
                    // Create error icon
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-exclamation-triangle';
                    icon.style.fontSize = '2rem';
                    icon.style.marginBottom = '0.5rem';
                    
                    // Create error message - XSS-safe text assignment
                    const text = document.createElement('p');
                    text.textContent = message; // textContent prevents XSS
                    
                    container.appendChild(icon);
                    container.appendChild(text);
                    element.appendChild(container);
                }
            }

            // Empty State - XSS-safe implementation
            function showEmptyState(elementId, message, icon = 'inbox') {
                const element = document.getElementById(elementId);
                if (element) {
                    // Clear existing content safely
                    element.textContent = '';
                    
                    // Create container
                    const container = document.createElement('div');
                    container.style.textAlign = 'center';
                    container.style.padding = '3rem';
                    container.style.color = 'var(--text-muted)';
                    
                    // Create icon - validate icon name to prevent injection
                    const iconElement = document.createElement('i');
                    // Sanitize icon name to only allow alphanumeric and hyphens
                    const safeIcon = icon.replace(/[^a-zA-Z0-9\-]/g, '');
                    iconElement.className = \`fas fa-\${safeIcon}\`;
                    iconElement.style.fontSize = '3rem';
                    iconElement.style.opacity = '0.3';
                    iconElement.style.marginBottom = '1rem';
                    
                    // Create message - XSS-safe text assignment
                    const text = document.createElement('p');
                    text.textContent = message; // textContent prevents XSS
                    
                    container.appendChild(iconElement);
                    container.appendChild(text);
                    element.appendChild(container);
                }
            }

            // Modal Helpers
            function openModal(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }

            function closeModal(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }

            // Close modal on escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal.active').forEach(modal => {
                        modal.classList.remove('active');
                        document.body.style.overflow = '';
                    });
                }
            });

            // Close modal on backdrop click
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('modal')) {
                    e.target.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });

            // ===== PAGE-SPECIFIC JAVASCRIPT =====
            ${extraJS}
        </script>
    </body>
    </html>
    `;
}

// Export the template function for use in routes
module.exports = { getPageTemplate };