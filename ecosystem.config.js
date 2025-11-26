// PM2 Ecosystem Configuration for Logging Server
// Usage: pm2 start ecosystem.config.js
// Or: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'logging-server',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables (production)
      env_production: {
        NODE_ENV: 'production',
        PORT: 10180,
        
        // CRITICAL: Set these values before deployment!
        JWT_SECRET: process.env.JWT_SECRET || 'REPLACE_WITH_SECURE_SECRET',
        AUTH_PASSWORD: process.env.AUTH_PASSWORD || 'ChangeMe123!',
        
        // Optional: Rate limiting control
        // DISABLE_RATE_LIMITING: 'false',
        
        // Optional: Disk monitoring quota
        // DISK_QUOTA_MB: '10240',
      },
      
      // Development environment
      env_development: {
        NODE_ENV: 'development',
        PORT: 10180,
        ALLOW_DEV_SECRET: 'true',
        AUTH_PASSWORD: 'admin',
        DEBUG: 'true'
      },
      
      // PM2 behavior
      watch: false,
      ignore_watch: ['node_modules', 'data', 'logs', '.git'],
      max_memory_restart: '1G',
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Cron-based restart (optional - restart daily at 3 AM)
      // cron_restart: '0 3 * * *',
      
      // Source maps for better error traces
      source_map_support: true,
      
      // Post-deploy hooks (optional)
      // post_update: ['npm install', 'echo "Deployment complete"']
    }
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'logger',
      host: ['production-server.local'],
      ref: 'origin/master',
      repo: 'git@github.com:rejavarti/logging-server.git',
      path: '/app/logging-server',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
