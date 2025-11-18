# Docker Compose Quick Start Guide

## 🚀 One-Command Deployment

This guide shows how to deploy Rejavarti's Logging Server using Docker Compose.

---

## 📦 Prerequisites

- Docker and Docker Compose installed
- Unraid server (or any Linux system with Docker)

---

## 🎯 Quick Installation

### Step 1: Create Directory Structure

SSH into your Unraid server:

```bash
ssh root@192.168.222.3
```

Create the required directories:

```bash
mkdir -p /mnt/user/appdata/logging-server/{data/{databases,backups,sessions},logs}
chmod -R 755 /mnt/user/appdata/logging-server
```

### Step 2: Download docker-compose.yml

```bash
cd /mnt/user/appdata/logging-server
wget https://raw.githubusercontent.com/rejavarti/logging-server/main/docker-compose.yml
```

Or create it manually with your preferred editor:

```bash
nano docker-compose.yml
```

### Step 3: Configure Environment Variables

Edit the docker-compose.yml file:

```bash
nano docker-compose.yml
```

**⚠️ IMPORTANT**: Change these values:

```yaml
environment:
  - TZ=America/Denver              # Change to your timezone
  - AUTH_USERNAME=admin             # Change to your username
  - AUTH_PASSWORD=ChangeMe123!     # ⚠️ CHANGE THIS PASSWORD!
```

### Step 4: Start the Container

```bash
docker-compose up -d
```

That's it! 🎉

---

## 🌐 Access Your Server

**URL**: http://192.168.222.3:10180

**Login**: Use the username/password you set in docker-compose.yml

---

## 📋 docker-compose.yml Template

Here's the complete file with all settings:

```yaml
version: '3.8'

services:
  logging-server:
    # Pull from Docker Hub
    image: rejavarti/rejavartis_logging_server:latest
    
    container_name: rejavarti-logging-server
    restart: unless-stopped
    
    # Port mapping
    ports:
      - "10180:10180"
    
    # Volume mounts for persistent data
    volumes:
      - /mnt/user/appdata/logging-server/data:/app/data
      - /mnt/user/appdata/logging-server/logs:/app/logs
      - /etc/localtime:/etc/localtime:ro
    
    # Environment variables
    environment:
      # Node.js environment
      - NODE_ENV=production
      
      # Application port
      - PORT=10180
      
      # Timezone (change to yours!)
      # Examples: America/New_York, Europe/London, Asia/Tokyo
      - TZ=America/Denver
      
      # Authentication credentials (⚠️ CHANGE THESE!)
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=ChangeMe123!
    
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M
    
    # Health check
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:10180/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    
    # Logging configuration
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    
    # Labels for organization
    labels:
      - "com.rejavarti.logging-server.version=1.0.0"
      - "com.rejavarti.logging-server.description=Enterprise Logging Platform"

# Network configuration
networks:
  default:
    name: logging-network
```

---

## 🔧 Docker Compose Commands

### Start Container
```bash
docker-compose up -d
```

### Stop Container
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

### Restart Container
```bash
docker-compose restart
```

### Update to Latest Version
```bash
docker-compose pull
docker-compose up -d
```

### Stop and Remove (Data Persists)
```bash
docker-compose down
```

### Stop and Remove Everything (⚠️ Deletes Data!)
```bash
docker-compose down -v
```

---

## ⚙️ Configuration Options

### Change Port

Edit `docker-compose.yml`:

```yaml
ports:
  - "8080:10180"  # Access via port 8080 instead
```

Don't forget to also update `PORT` environment variable if changing internal port!

### Change Data Location

```yaml
volumes:
  - /your/custom/path/data:/app/data
  - /your/custom/path/logs:/app/logs
```

### Change Timezone

```yaml
environment:
  - TZ=America/New_York  # Eastern Time
  - TZ=Europe/London     # GMT
  - TZ=Asia/Tokyo        # JST
```

### Adjust Resources

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'      # Use up to 4 CPU cores
      memory: 2G       # Use up to 2GB RAM
```

---

## 🔍 Verification

### Check Container Status
```bash
docker-compose ps
```

Expected output:
```
NAME                        STATUS              PORTS
rejavarti-logging-server   Up 2 minutes        0.0.0.0:10180->10180/tcp
```

### Test Health Endpoint
```bash
curl http://localhost:10180/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T12:00:00.000Z",
  "uptime": 120.45,
  "version": "1.0.0"
}
```

### View Container Logs
```bash
docker-compose logs -f logging-server
```

Look for:
```
✅ Server running on port 10180
✅ Database initialized
✅ Integrations loaded
🎉 All systems operational!
```

---

## 📁 Directory Structure

After deployment, your directory structure will be:

```
/mnt/user/appdata/logging-server/
├── docker-compose.yml          # Configuration file
├── data/
│   ├── databases/             # SQLite databases
│   │   └── enterprise_logs.db
│   ├── backups/               # Automatic backups (2 AM daily)
│   │   └── enterprise_logs_2025-10-27_02-00-00.db
│   └── sessions/              # User sessions
└── logs/                      # Categorized log files
    ├── critical-2025-10-27.log
    ├── security-2025-10-27.log
    ├── system-2025-10-27.log
    └── access-2025-10-27.log
```

---

## 🔄 Updating

To update to the latest version:

```bash
cd /mnt/user/appdata/logging-server

# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d

# Verify update
curl http://localhost:10180/health
```

Your data will persist through updates! ✅

---

## 🛠️ Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs

# Common issues:
# - Port 10180 already in use
# - Missing AUTH_PASSWORD
# - Permission issues with volumes
```

### Can't Access Web Interface

```bash
# Verify container is running
docker-compose ps

# Test health endpoint
curl http://localhost:10180/health

# Check if port is listening
netstat -tlnp | grep 10180
```

### Permission Errors

```bash
# Fix permissions
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server
```

### Reset Everything

```bash
# Stop and remove container
docker-compose down

# Delete all data (⚠️ WARNING!)
rm -rf /mnt/user/appdata/logging-server/data/*
rm -rf /mnt/user/appdata/logging-server/logs/*

# Start fresh
docker-compose up -d
```

---

## 🔐 Security Best Practices

1. ✅ **Change AUTH_PASSWORD** immediately
2. ✅ **Use strong passwords** (12+ characters, mixed case, numbers, symbols)
3. ✅ **Restrict network access** (firewall rules, VPN)
4. ✅ **Regular backups** (automated daily, manual monthly)
5. ✅ **Keep updated** (`docker-compose pull` regularly)
6. ✅ **Monitor logs** (check for suspicious activity)
7. ✅ **Use HTTPS** for internet access (reverse proxy)

---

## 🎯 Next Steps

After successful deployment:

1. **Access Web UI**: http://192.168.222.3:10180
2. **Login**: Use credentials from docker-compose.yml
3. **Register Admin**: Navigate to `/register` (first user becomes admin)
4. **Configure Integrations**: Go to `/integrations`
   - Add MQTT broker
   - Configure WebSocket
   - Add UniFi controller
   - Connect Home Assistant
5. **Set Up Webhooks**: Go to `/webhooks`
   - Create event notifications
   - Test delivery
6. **Create Users**: Settings → Users (admin only)
7. **Review Settings**: Check timezone, backups, maintenance

---

## 📊 Monitoring

### Container Stats
```bash
docker stats rejavarti-logging-server
```

### Health Check
```bash
watch -n 5 'curl -s http://localhost:10180/health | jq'
```

### Log Monitoring
```bash
tail -f /mnt/user/appdata/logging-server/logs/system-*.log
```

---

## 📞 Support

- **Docker Hub**: https://hub.docker.com/r/rejavarti/rejavartis_logging_server
- **GitHub**: https://github.com/rejavarti/logging-server
- **Documentation**: See README.md

---

**Version**: 1.0.0  
**Last Updated**: October 27, 2025

**Pro Tip**: Save this docker-compose.yml file - it contains all your configuration and makes updates/migrations easy! 🚀
