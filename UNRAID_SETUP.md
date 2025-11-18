# 🐳 Unraid Docker Setup Guide - Enterprise Logging Platform

Complete guide for deploying the Enterprise Logging Platform on Unraid with persistent data and proper configuration.

---

## 📋 **Prerequisites**

- Unraid 6.9+ installed
- Docker service enabled
- At least 1GB RAM available
- Network access to Unraid server

---

## 🚀 **Method 1: Unraid Template (Recommended)**

### **Step 1: Add Custom Container Template**

1. Open Unraid WebUI
2. Navigate to: **Docker** → **Add Container**
3. Click **"Advanced View"** toggle (top right)
4. Fill in the following configuration:

#### **Basic Settings**

| Field | Value |
|-------|-------|
| **Name** | `enterprise-logging-server` |
| **Repository** | `node:18-alpine` (or build custom image) |
| **Network Type** | `Bridge` |
| **Console shell command** | `sh` |

#### **Port Mappings**

| Container Port | Host Port | Protocol | Description |
|----------------|-----------|----------|-------------|
| `10180` | `10180` | TCP | Web UI |
| `8081` | `8081` | TCP | WebSocket |
| `8082` | `8082` | TCP | Real-time Streaming |
| `514` | `514` | UDP | Syslog UDP |
| `601` | `601` | TCP | Syslog TCP |
| `12201` | `12201` | UDP | GELF UDP |
| `12202` | `12202` | TCP | GELF TCP |
| `5044` | `5044` | TCP | Beats/Logstash |
| `9880` | `9880` | TCP | Fluentd |

#### **Volume Mappings** (Critical for Data Persistence)

| Container Path | Host Path | Access Mode | Description |
|----------------|-----------|-------------|-------------|
| `/app/data` | `/mnt/user/appdata/logging-server/data` | Read/Write | Databases & state |
| `/app/logs` | `/mnt/user/appdata/logging-server/logs` | Read/Write | Application logs |
| `/app/data/backups` | `/mnt/user/appdata/logging-server/backups` | Read/Write | Database backups |
| `/app/data/sessions` | `/mnt/user/appdata/logging-server/sessions` | Read/Write | User sessions |

#### **Environment Variables**

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `10180` | Web server port |
| `WS_PORT` | `8081` | WebSocket port |
| `TZ` | `America/Denver` | Timezone (adjust to yours) |
| `AUTH_PASSWORD` | `YourSecurePassword123!` | Admin password |
| `JWT_SECRET` | `your-random-secret-key` | JWT signing key |
| `PUID` | `99` | User ID (Unraid nobody) |
| `PGID` | `100` | Group ID (Unraid users) |

#### **Advanced Settings**

| Field | Value |
|-------|-------|
| **Privileged** | `No` |
| **Extra Parameters** | `--restart=unless-stopped` |
| **Post Arguments** | (leave empty) |
| **CPU Pinning** | (optional - leave default) |
| **Memory Limit** | `2G` (recommended) |

---

## 🏗️ **Method 2: Docker Compose on Unraid**

### **Step 1: Install Compose Manager Plugin**

1. Go to: **Plugins** → **Install Plugin**
2. Search for: `docker-compose`
3. Install the Docker Compose Manager plugin

### **Step 2: Create docker-compose.yml**

SSH into your Unraid server:
```bash
ssh root@<unraid-ip>
cd /mnt/user/appdata/logging-server
nano docker-compose.yml
```

Paste the following configuration:

```yaml
version: '3.8'

services:
  logging-server:
    container_name: enterprise-logging-server
    image: node:18-alpine
    restart: unless-stopped
    
    ports:
      - "10180:10180"  # Web UI
      - "8081:8081"    # WebSocket
      - "8082:8082"    # Streaming
      - "514:514/udp"  # Syslog UDP
      - "601:601"      # Syslog TCP
      - "12201:12201/udp"  # GELF UDP
      - "12202:12202"  # GELF TCP
      - "5044:5044"    # Beats
      - "9880:9880"    # Fluentd
    
    volumes:
      - /mnt/user/appdata/logging-server/app:/app
      - /mnt/user/appdata/logging-server/data:/app/data
      - /mnt/user/appdata/logging-server/logs:/app/logs
      - /mnt/user/appdata/logging-server/backups:/app/data/backups
    
    environment:
      - NODE_ENV=production
      - PORT=10180
      - WS_PORT=8081
      - TZ=America/Denver
      - AUTH_PASSWORD=YourSecurePassword123!
      - JWT_SECRET=your-random-secret-key-change-this
      - PUID=99
      - PGID=100
    
    command: sh -c "apk add --no-cache sqlite && npm install -g pm2 && cd /app && npm install && pm2-runtime start server.js --name logging-server"
    
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:10180/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    
    networks:
      - logging-network

networks:
  logging-network:
    driver: bridge
```

### **Step 3: Deploy with Compose Manager**

```bash
docker-compose up -d
```

---

## 📦 **Method 3: Pre-Built Docker Image (Fastest)**

### **Step 1: Build Image Locally**

On your development machine (Windows):
```powershell
cd "C:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server"

# Build the image
docker build -t rejavarti/logging-server:latest .

# Save image to tar file
docker save rejavarti/logging-server:latest -o logging-server.tar

# Copy to Unraid (via network share or SCP)
# Option A: Network share
Copy-Item logging-server.tar "\\<unraid-ip>\appdata\logging-server\"

# Option B: SCP
scp logging-server.tar root@<unraid-ip>:/mnt/user/appdata/logging-server/
```

### **Step 2: Load Image on Unraid**

SSH into Unraid:
```bash
ssh root@<unraid-ip>

# Load the Docker image
docker load -i /mnt/user/appdata/logging-server/logging-server.tar

# Verify image loaded
docker images | grep logging-server
```

### **Step 3: Run Container**

```bash
docker run -d \
  --name enterprise-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -p 8081:8081 \
  -p 8082:8082 \
  -p 514:514/udp \
  -p 601:601 \
  -p 12201:12201/udp \
  -p 12202:12202 \
  -p 5044:5044 \
  -p 9880:9880 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -v /mnt/user/appdata/logging-server/backups:/app/data/backups \
  -e NODE_ENV=production \
  -e PORT=10180 \
  -e WS_PORT=8081 \
  -e TZ=America/Denver \
  -e AUTH_PASSWORD=YourSecurePassword123! \
  -e JWT_SECRET=your-random-secret-key \
  rejavarti/logging-server:latest
```

---

## ✅ **Post-Installation Verification**

### **1. Check Container Status**
```bash
docker ps | grep logging-server
docker logs enterprise-logging-server --tail 50
```

### **2. Test Web UI**
Open browser to: `http://<unraid-ip>:10180`

### **3. Test Health Endpoint**
```bash
curl http://localhost:10180/api/system/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "uptime": "12s",
  "version": "2.2.0"
}
```

### **4. Verify Data Persistence**
```bash
ls -la /mnt/user/appdata/logging-server/data/
# Should see: logging.db, logging.db-wal, logging.db-shm
```

---

## 🔧 **Configuration & Management**

### **Accessing the Container**
```bash
# Shell access
docker exec -it enterprise-logging-server sh

# Check PM2 status
docker exec enterprise-logging-server pm2 status

# View logs
docker exec enterprise-logging-server pm2 logs logging-server

# Reload after config changes
docker exec enterprise-logging-server pm2 reload all
```

### **Backup Database**
```bash
# Manual backup
docker exec enterprise-logging-server sqlite3 /app/data/logging.db ".backup '/app/data/backups/manual-backup.db'"

# Or use built-in backup API
curl -X POST http://<unraid-ip>:10180/api/backups/create \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"description": "Manual backup"}'
```

### **Update Container**

```bash
# Stop container
docker stop enterprise-logging-server

# Remove old container (data persists in volumes)
docker rm enterprise-logging-server

# Pull/load new image
docker pull rejavarti/logging-server:latest  # if using registry
# OR
docker load -i /path/to/new-image.tar

# Recreate container with same parameters
docker run -d ...  # (use same command from Step 3)
```

---

## 🛡️ **Security Best Practices**

1. **Change Default Passwords**
   - Set strong `AUTH_PASSWORD` (min 12 chars, mixed case, numbers, symbols)
   - Generate random `JWT_SECRET` (use: `openssl rand -hex 32`)

2. **Firewall Rules**
   - Only expose necessary ports to your network
   - Use reverse proxy (nginx/traefik) for HTTPS

3. **Regular Backups**
   - Enable automatic backups in Settings
   - Store backups on separate storage pool
   - Test restore procedure periodically

4. **Monitor Resources**
   - Check Unraid Dashboard for CPU/RAM usage
   - Set memory limits to prevent OOM issues
   - Monitor disk space in `/appdata`

---

## 🔍 **Troubleshooting**

### **Container Won't Start**

**Check logs:**
```bash
docker logs enterprise-logging-server
```

**Common issues:**
- Port conflicts: `docker ps` - check if ports already in use
- Permission issues: Ensure appdata folders exist and are writable
- Memory: Check if Unraid has enough available RAM

### **Can't Access Web UI**

**Verify network:**
```bash
# Check if port is listening
netstat -tuln | grep 10180

# Test from Unraid itself
curl http://localhost:10180
```

**Check firewall:**
```bash
# Temporarily disable to test
iptables -F
```

### **Database Corruption**

**Restore from backup:**
```bash
docker exec enterprise-logging-server sh -c "
  cd /app/data && 
  mv logging.db logging.db.corrupt && 
  cp backups/latest-backup.db logging.db
"

# Reload server
docker exec enterprise-logging-server pm2 reload all
```

### **High Memory Usage**

**Restart PM2:**
```bash
docker exec enterprise-logging-server pm2 restart logging-server
```

**Clear old logs:**
```bash
docker exec enterprise-logging-server sh -c "
  cd /app/data && 
  sqlite3 logging.db 'DELETE FROM logs WHERE timestamp < datetime(\"now\", \"-30 days\")'
"
```

---

## 📊 **Monitoring & Maintenance**

### **Automated Backups**

Create a User Script in Unraid:

1. Go to: **Settings** → **User Scripts** → **Add New Script**
2. Name: `Logging Server Backup`
3. Script content:
```bash
#!/bin/bash
# Backup Enterprise Logging Server database

BACKUP_DIR="/mnt/user/backups/logging-server"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
docker exec enterprise-logging-server sqlite3 /app/data/logging.db ".backup '/app/data/backups/auto-backup-${TIMESTAMP}.db'"

# Copy to secure location
cp /mnt/user/appdata/logging-server/data/backups/auto-backup-${TIMESTAMP}.db "$BACKUP_DIR/"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t | tail -n +8 | xargs -r rm

echo "Backup completed: auto-backup-${TIMESTAMP}.db"
```

4. Schedule: `Daily` at `2:00 AM`

### **Health Monitoring Script**

```bash
#!/bin/bash
# Check logging server health and restart if needed

HEALTH_URL="http://localhost:10180/api/system/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$RESPONSE" != "200" ]; then
    echo "Health check failed! Restarting container..."
    docker restart enterprise-logging-server
    /usr/local/emhttp/webGui/scripts/notify -i alert -s "Logging Server Restarted" -d "Health check failed, container restarted automatically"
fi
```

---

## 🎯 **Quick Reference**

### **Common Commands**
```bash
# Start/Stop
docker start enterprise-logging-server
docker stop enterprise-logging-server
docker restart enterprise-logging-server

# Logs
docker logs enterprise-logging-server -f
docker logs enterprise-logging-server --tail 100

# Stats
docker stats enterprise-logging-server

# Shell access
docker exec -it enterprise-logging-server sh

# PM2 management
docker exec enterprise-logging-server pm2 list
docker exec enterprise-logging-server pm2 reload all
docker exec enterprise-logging-server pm2 logs
```

### **Important URLs**
- **Web UI**: `http://<unraid-ip>:10180`
- **Health Check**: `http://<unraid-ip>:10180/api/system/health`
- **API Docs**: `http://<unraid-ip>:10180/api/docs` (if enabled)

### **Default Credentials**
- **Username**: `admin` (or as configured)
- **Password**: Set via `AUTH_PASSWORD` environment variable

---

## 📞 **Support**

If you encounter issues:

1. Check logs: `docker logs enterprise-logging-server --tail 100`
2. Verify all environment variables are set correctly
3. Ensure all required ports are mapped and not in use
4. Check Unraid system logs: `/var/log/syslog`
5. Review this guide's troubleshooting section

---

## 🚀 **Next Steps**

After successful installation:

1. ✅ Login to Web UI at `http://<unraid-ip>:10180`
2. ✅ Change default admin password
3. ✅ Configure ingestion sources (Syslog, GELF, etc.)
4. ✅ Set up automated backups
5. ✅ Configure retention policies in Settings
6. ✅ Create dashboards for monitoring
7. ✅ Set up alerts and notifications

---

**🎉 Your Enterprise Logging Server is now running on Unraid!**
