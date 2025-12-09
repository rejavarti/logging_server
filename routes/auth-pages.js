/**
 * Authentication Pages Module
 * Handles rendering of login page and related authentication UI
 */

const express = require('express');
const router = express.Router();

/**
 * Login Page Route
 * Renders standalone login page with theme support
 */
router.get('/login', (req, res) => {
    // Check if already authenticated
    if (req.session?.token && req.app.locals.userManager && req.app.locals.userManager.verifyJWT(req.session.token)) {
        return res.redirect('/dashboard');
    }
    
    // Prevent caching to ensure latest JavaScript is served
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const loginPageContent = `
    <button class="theme-toggle" onclick="toggleTheme()" title="Toggle Theme">
        <i class="fas fa-palette"></i>
    </button>
    <div class="login-container">
        <div class="login-header">
            <h1>🔥 Enterprise Logger</h1>
            <p>Advanced Infrastructure Monitoring Platform</p>
        </div>
        
        <div class="login-form">
            <div class="welcome-message">
                <strong>🚀 Welcome to Enterprise Logging Platform</strong><br>
                Secure access to your infrastructure monitoring dashboard
            </div>
            
            <form id="loginForm">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" placeholder="Enter username" autocomplete="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" placeholder="Enter your password" autocomplete="current-password" required>
                </div>
                
                <button type="submit" class="login-btn" id="loginBtn">
                    Sign In
                </button>
            </form>
            
            <div id="error-message" class="error-message"></div>
        </div>
        
        <div class="login-footer">
            <strong>Enhanced Universal Logging Platform v2.1.0-stable-enhanced</strong><br>
            Multi-Source Infrastructure Monitoring
        </div>
    </div>`;

    const loginCSS = getLoginCSS();
    const loginJS = getLoginJS();

    // Send standalone HTML
    res.send(`
<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 Enterprise Logger - Login</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        ${getThemeVariables()}
        ${loginCSS}
    </style>
</head>
<body>
    ${loginPageContent}
    <script>
        ${loginJS}
    </script>
</body>
</html>`);
});

/**
 * Get theme CSS variables
 */
function getThemeVariables() {
    return `
        :root {
            /* Light Theme Colors */
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-tertiary: #f1f5f9;
            --text-primary: #1e293b;
            --text-secondary: #475569;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.2);
            
            /* Light Theme Ocean Gradients */
            --gradient-ocean: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%);
            --gradient-deep-blue: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
            --gradient-sky: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 50%, #0ea5e9 100%);
            
            /* Standard Colors */
            --accent-primary: var(--gradient-ocean);
            --btn-primary: var(--gradient-ocean);
            --accent-secondary: #3b82f6;
            --login-bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
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
            --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
            
            /* Ocean Gradients for Dark Theme */
            --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
            --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
            --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
            
            /* Standard Colors */
            --accent-primary: var(--gradient-ocean);
            --btn-primary: var(--gradient-ocean);
            --accent-secondary: #3b82f6;
            --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
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
                --shadow-light: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
                --shadow-medium: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                --shadow-glow: 0 0 20px rgba(96, 165, 250, 0.4);
                
                /* Ocean Gradients for Auto Dark Mode */
                --gradient-ocean: linear-gradient(135deg, #1e40af 0%, #1e3a8a 50%, #312e81 100%);
                --gradient-deep-blue: linear-gradient(135deg, #0c1e3f 0%, #1e293b 50%, #334155 100%);
                --gradient-sky: linear-gradient(135deg, #1e40af 0%, #3730a3 50%, #4338ca 100%);
                
                /* Standard Colors */
                --accent-primary: var(--gradient-ocean);
                --btn-primary: var(--gradient-ocean);
                --accent-secondary: #3b82f6;
                --login-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            }
        }
    `;
}

/**
 * Get login page CSS
 */
function getLoginCSS() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--login-bg);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        
        /* Animated background */
        body::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
            animation: shimmer 3s ease-in-out infinite;
        }
        
        @keyframes shimmer {
            0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(30deg); }
            50% { transform: translateX(100%) translateY(100%) rotate(30deg); }
        }
        
        .login-container {
            background: var(--bg-primary);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: var(--shadow-medium);
            overflow: hidden;
            width: 100%;
            max-width: 420px;
            margin: 2rem;
            border: 1px solid var(--border-color);
            position: relative;
            z-index: 1;
            transition: all 0.3s ease;
        }
        
        .login-header {
            background: var(--gradient-ocean);
            color: white;
            padding: 2.5rem 2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .login-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
            animation: headerShimmer 4s ease-in-out infinite;
        }
        
        @keyframes headerShimmer {
            0%, 100% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
        }
        
        .login-header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            font-weight: 700;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .login-header p {
            opacity: 0.9;
            font-size: 0.95rem;
            position: relative;
            z-index: 1;
        }
        
        .login-form {
            padding: 2.5rem 2rem;
        }
        
        .theme-toggle {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: var(--gradient-sky);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.75rem;
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1.2rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 10;
        }
        .theme-toggle:hover {
            transform: scale(1.1) rotate(15deg);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            background: var(--gradient-deep-blue);
        }
        
        .form-group {
            margin-bottom: 1.75rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.75rem;
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.95rem;
        }
        
        .form-group input {
            width: 100%;
            padding: 1rem 1.25rem;
            border: 2px solid var(--border-color);
            border-radius: 12px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: var(--bg-secondary);
            color: var(--text-primary);
            box-sizing: border-box;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: var(--shadow-glow);
            transform: translateY(-1px);
        }
        
        .login-btn {
            width: 100%;
            padding: 1.25rem;
            background: var(--gradient-ocean);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1.05rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .login-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .login-btn:hover::before {
            left: 100%;
        }
        
        .login-btn:hover {
            transform: translateY(-3px);
            box-shadow: var(--shadow-glow);
            background: var(--gradient-deep-blue);
        }
        
        .login-btn:active {
            transform: translateY(-1px);
        }
        
        .error-message {
            margin-top: 1.5rem;
            padding: 1rem;
            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            border: 1px solid #fecaca;
            border-radius: 12px;
            color: #dc2626;
            display: none;
            font-weight: 500;
        }
        
        .login-footer {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            padding: 1.75rem;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 0.85rem;
        }
        
        .welcome-message {
            background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            padding: 1.25rem;
            border-radius: 12px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
            color: #1e40af;
            border: 1px solid #93c5fd;
            font-weight: 500;
        }
        
        /* Responsive design */
        @media (max-width: 480px) {
            .login-container {
                margin: 1rem;
                border-radius: 16px;
            }
            
            .login-header {
                padding: 2rem 1.5rem;
            }
            
            .login-form {
                padding: 2rem 1.5rem;
            }
            
            .login-header h1 {
                font-size: 1.75rem;
            }
        }
    `;
}

/**
 * Get login page JavaScript
 */
function getLoginJS() {
    return `
        // Form validation utility
        function showFieldError(fieldId, message) {
            const field = document.getElementById(fieldId);
            if (!field) return;
            const existingError = field.parentElement.querySelector('.field-error');
            if (existingError) existingError.remove();
            field.classList.remove('is-invalid');
            if (!message) return;
            field.classList.add('is-invalid');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            errorDiv.style.cssText = 'color: #dc2626; font-size: 0.8rem; margin-top: 0.25rem;';
            errorDiv.textContent = message;
            field.parentElement.appendChild(errorDiv);
        }
        
        function validateLoginForm() {
            let isValid = true;
            showFieldError('username', null);
            showFieldError('password', null);
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            
            if (!username) {
                showFieldError('username', 'Username is required');
                isValid = false;
            }
            
            if (!password) {
                showFieldError('password', 'Password is required');
                isValid = false;
            } else if (password.length < 4) {
                showFieldError('password', 'Password must be at least 4 characters');
                isValid = false;
            }
            
            return isValid;
        }
        
        // Login form submission
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateLoginForm()) {
                return;
            }
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('error-message');
            
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
            
            try {
                const originalText = loginBtn.textContent;
                loginBtn.disabled = true;
                loginBtn.textContent = 'Signing In...';
                
                // Force HTTP protocol to match current page (prevent HTTPS upgrade)
                const apiUrl = window.location.protocol + '//' + window.location.host + '/api/auth/login';
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                    credentials: 'same-origin'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    try {
                        if (result.token) {
                            localStorage.setItem('authToken', result.token);
                            document.cookie = 'token=' + result.token + '; Path=/; SameSite=Lax';
                        }
                    } catch (storageErr) {
                        console.warn('Failed to persist auth token:', storageErr.message);
                    }

                    loginBtn.textContent = 'Success! Redirecting...';
                    loginBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 500);
                } else {
                    throw new Error(result.error || 'Login failed');
                }
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.style.display = 'block';
                
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
                loginBtn.style.background = '';
                
                loginBtn.style.animation = 'shake 0.5s ease-in-out';
                setTimeout(() => {
                    loginBtn.style.animation = '';
                }, 500);
            }
        });
        
        // Shake animation
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
        \`;
        document.head.appendChild(style);
        
        // Theme management
        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme') || 'auto';
            let nextTheme;
            
            switch(currentTheme) {
                case 'auto': nextTheme = 'light'; break;
                case 'light': nextTheme = 'dark'; break;
                case 'dark': nextTheme = 'auto'; break;
                default: nextTheme = 'auto';
            }
            
            html.setAttribute('data-theme', nextTheme);
            
            try {
                localStorage.setItem('preferred-theme', nextTheme);
            } catch(e) {
                console.warn('Cannot save theme preference:', e);
            }
            
            const toggle = document.querySelector('.theme-toggle i');
            const button = document.querySelector('.theme-toggle');
            switch(nextTheme) {
                case 'light':
                    toggle.className = 'fas fa-sun';
                    button.title = 'Switch to Dark Theme';
                    break;
                case 'dark':
                    toggle.className = 'fas fa-moon';
                    button.title = 'Switch to Auto Theme';
                    break;
                case 'auto':
                    toggle.className = 'fas fa-palette';
                    button.title = 'Switch to Light Theme';
                    break;
            }
        }
        
        // Initialize theme
        (function() {
            try {
                const saved = localStorage.getItem('preferred-theme') || 'auto';
                document.documentElement.setAttribute('data-theme', saved);
                
                const toggle = document.querySelector('.theme-toggle i');
                const button = document.querySelector('.theme-toggle');
                switch(saved) {
                    case 'light':
                        toggle.className = 'fas fa-sun';
                        button.title = 'Switch to Dark Theme';
                        break;
                    case 'dark':
                        toggle.className = 'fas fa-moon';
                        button.title = 'Switch to Auto Theme';
                        break;
                    case 'auto':
                        toggle.className = 'fas fa-palette';
                        button.title = 'Switch to Light Theme';
                        break;
                }
            } catch(e) {
                console.warn('Cannot load theme preference:', e);
            }
        })();
        
        // Auto-focus username
        document.getElementById('username').focus();
    `;
}

module.exports = router;
