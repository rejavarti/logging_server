# Logging Server - Unraid Deployment Instructions
Generated: 2025-10-26 18:23:25

## 🚀 Quick Deployment Steps

### 1. Transfer Files to Unraid
```bash
# Option A: Upload via Unraid web interface
# Upload logging-server-deployment-2025-10-26-1823.zip to /mnt/user/appdata/

# Option B: Use SCP/SFTP
scp logging-server-deployment-2025-10-26-1823.zip root@192.168.222.3:/mnt/user/appdata/
```

### 2. Extract on Unraid Server
```bash
# SSH into Unraid
ssh root@192.168.222.3

# Extract package
cd /mnt/user/appdata/
unzip logging-server-deployment-2025-10-26-1823.zip
mv deploy-package logging-server
cd logging-server
```

### 3. Build and Deploy Docker Container
```bash
# Build the Docker image with PM2 support
docker-compose build

# Start the container
docker-compose up -d

# Verify deployment
docker ps | grep dsc-universal-logger
curl http://192.168.222.3:10180/health
```

### 4. First-Time Setup
```bash
# Check logs
docker logs dsc-universal-logger

# Access web interface
# URL: http://192.168.222.3:10180
# Default credentials: dsc_logger / SecureLog2025!

# Create admin account
# Navigate to /register and create your admin user
```

### 5. Verify Features
- ✅ Login page: http://192.168.222.3:10180
- ✅ Dashboard: http://192.168.222.3:10180/dashboard
- ✅ Integrations: http://192.168.222.3:10180/integrations
- ✅ Webhooks: http://192.168.222.3:10180/webhooks
- ✅ Settings: http://192.168.222.3:10180/settings
- ✅ Health check: http://192.168.222.3:10180/health

### 6. Optional: Update Environment Variables
Edit docker-compose.yml if you want to change:
- PORT (default: 10180)
- AUTH_USERNAME (default: dsc_logger)
- AUTH_PASSWORD (default: SecureLog2025!)
- TZ (timezone, default: America/Denver)

After changes:
```bash
docker-compose down
docker-compose up -d
```

## 🔄 Restart Functionality
The container includes PM2 for automatic restarts:
- Manual restart: Use "Restart Server" button in Settings page
- Automatic restart: PM2 handles crashes and restarts
- Docker restart policy: Container restarts automatically on failure

## 📊 Monitoring
```bash
# View logs
docker logs -f dsc-universal-logger

# Check health
curl http://192.168.222.3:10180/health

# Check container stats
docker stats dsc-universal-logger
```

## 🗄️ Data Persistence
All data is stored in Docker volumes:
- /mnt/user/appdata/logging-server/data/databases - SQLite databases
- /mnt/user/appdata/logging-server/data/backups - Automatic backups (2 AM daily, keeps 10)
- /mnt/user/appdata/logging-server/data/sessions - User sessions
- /mnt/user/appdata/logging-server/logs - Categorized log files

## 🔧 Troubleshooting
```bash
# Container won't start
docker logs dsc-universal-logger

# Permission issues
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server/data
chown -R 1001:1001 /mnt/user/appdata/logging-server/logs

# Rebuild container
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Reset everything
docker-compose down -v
rm -rf data/databases/* data/sessions/* logs/*
docker-compose up -d
```

## 📦 Package Contents
- server.js - Main application
- package.json - Dependencies
- Dockerfile - Container configuration with PM2
- docker-compose.yml - Unraid deployment config
- public/ - Static web assets
- scripts/ - Utility scripts
- Empty runtime directories (data/, logs/)

## 🎯 Production Ready Features
✅ PM2 process management for auto-restart
✅ Enterprise authentication with RBAC
✅ Integration management (MQTT, WebSocket, UniFi, Home Assistant)
✅ Webhook system for event notifications
✅ Automatic daily backups (2 AM, keeps 10)
✅ Health monitoring endpoints
✅ Session management
✅ Activity logging and audit trails
✅ Real-time WebSocket updates
✅ Ocean Blue themed UI

## 🔐 Security Notes
- Change default AUTH_PASSWORD before production use
- First user registered becomes admin
- Use HTTPS reverse proxy (Nginx Proxy Manager recommended)
- Regularly check /settings/audit for access logs
- Backups are automatic but verify they're working

## 📞 Support
If you encounter issues:
1. Check docker logs: docker logs dsc-universal-logger
2. Verify health endpoint: curl http://192.168.222.3:10180/health
3. Check container status: docker ps -a
4. Review deployment logs above

---
Deployment Package Created: 2025-10-26 18:23:25
Version: 2.1.0-stable-enhanced
