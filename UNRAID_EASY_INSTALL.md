# Rejavarti's Logging Server - Unraid Installation Guide
## Easy Installation with Automatic Directory Creation

This guide shows you how to install the logging server with **automatic directory creation**.

---

## 🚀 Method 1: One-Command Installation (Easiest)

### Step 1: SSH into Unraid
```bash
ssh root@192.168.222.3
```

### Step 2: Run the Install Script
```bash
curl -sSL https://raw.githubusercontent.com/rejavarti/logging-server/main/unraid-install.sh | bash
```

Or download and run:
```bash
wget https://raw.githubusercontent.com/rejavarti/logging-server/main/unraid-install.sh
chmod +x unraid-install.sh
./unraid-install.sh
```

**The script will:**
- ✅ Automatically create all required directories
- ✅ Set proper permissions
- ✅ Pull the Docker image
- ✅ Start the container
- ✅ Show you access URL and credentials

---

## 🐳 Method 2: Manual Docker Command with Auto-Directory Creation

```bash
# Create directories
mkdir -p /mnt/user/appdata/logging-server/{data/{databases,backups,sessions},logs}

# Set permissions
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server

# Pull and run
docker pull rejavarti/rejavartis_logging_server:latest

docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=YourSecurePassword123! \
  rejavarti/rejavartis_logging_server:latest
```

---

## 🖥️ Method 3: Unraid GUI (Manual Setup)

### Step 1: Create Directories First
SSH into Unraid and run:
```bash
mkdir -p /mnt/user/appdata/logging-server/{data/{databases,backups,sessions},logs}
chmod -R 755 /mnt/user/appdata/logging-server
```

### Step 2: Add Container in GUI
1. Open Unraid Web UI
2. Go to **Docker** tab
3. Click **Add Container**
4. Fill in the template:

| Field | Value |
|-------|-------|
| **Name** | `rejavarti-logging-server` |
| **Repository** | `rejavarti/rejavartis_logging_server:latest` |
| **Network Type** | `bridge` |

5. **Add Port Mapping:**
   - Container Port: `10180`
   - Host Port: `10180`
   - Protocol: TCP

6. **Add Path Mappings:**
   - Container: `/app/data` → Host: `/mnt/user/appdata/logging-server/data`
   - Container: `/app/logs` → Host: `/mnt/user/appdata/logging-server/logs`

7. **Add Environment Variables:**
   - `NODE_ENV` = `production`
   - `PORT` = `10180`
   - `TZ` = `America/Denver`
   - `AUTH_USERNAME` = `admin`
   - `AUTH_PASSWORD` = `YourSecurePassword!` (⚠️ Mask this!)

8. Click **Apply**

---

## 📦 Method 4: Using the Unraid Template XML

### Step 1: Create Directories
```bash
mkdir -p /mnt/user/appdata/logging-server/{data/{databases,backups,sessions},logs}
chmod -R 755 /mnt/user/appdata/logging-server
```

### Step 2: Import Template
1. Download `unraid-template.xml` from the repository
2. Copy to: `/boot/config/plugins/dockerMan/templates-user/rejavarti-logging-server.xml`
3. In Docker tab, click **Add Container**
4. Select **"Rejavarti-Logging-Server"** from template dropdown
5. Configure environment variables
6. Click **Apply**

---

## ✅ Verification

After installation, verify the container is running:

```bash
# Check container status
docker ps | grep rejavarti

# Test health endpoint
curl http://localhost:10180/health

# View logs
docker logs -f rejavarti-logging-server
```

Expected health response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T12:00:00.000Z",
  "uptime": 45.123,
  "version": "1.0.0"
}
```

---

## 🌐 Access Your Server

**URL**: http://192.168.222.3:10180

**Login**: admin / (your password)

**First-Time Setup**:
1. Login with AUTH_USERNAME/AUTH_PASSWORD
2. Navigate to `/register`
3. Create admin account (first user becomes admin)
4. Configure integrations in `/integrations`
5. Set up webhooks in `/webhooks`

---

## 📁 Directory Structure Created

```
/mnt/user/appdata/logging-server/
├── data/
│   ├── databases/          # SQLite databases
│   ├── backups/            # Automatic backups (2 AM daily)
│   └── sessions/           # User sessions
└── logs/                   # Categorized log files
    ├── critical-*.log      # 365 days retention
    ├── security-*.log      # 90 days retention
    ├── system-*.log        # 30 days retention
    └── access-*.log        # 90 days retention
```

---

## 🔧 Container Management

```bash
# View logs
docker logs -f rejavarti-logging-server

# Restart container
docker restart rejavarti-logging-server

# Stop container
docker stop rejavarti-logging-server

# Start container
docker start rejavarti-logging-server

# Remove container (data persists)
docker stop rejavarti-logging-server
docker rm rejavarti-logging-server

# Update to latest
docker pull rejavarti/rejavartis_logging_server:latest
docker stop rejavarti-logging-server
docker rm rejavarti-logging-server
# Then run docker run command again
```

---

## 🔄 Updating

To update to the latest version:

```bash
# Pull latest image
docker pull rejavarti/rejavartis_logging_server:latest

# Stop and remove old container
docker stop rejavarti-logging-server
docker rm rejavarti-logging-server

# Start with new image (data persists in volumes)
docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=YourPassword \
  rejavarti/rejavartis_logging_server:latest
```

---

## 🛠️ Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs rejavarti-logging-server

# Common issues:
# - Port 10180 already in use
# - Missing AUTH_PASSWORD
# - Permission issues
```

### Permission Errors
```bash
# Fix permissions
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server
```

### Can't Access Web Interface
```bash
# Verify container is running
docker ps | grep rejavarti

# Test health endpoint
curl http://localhost:10180/health

# Check if port is listening
netstat -tlnp | grep 10180
```

---

## 📞 Support

- **Docker Hub**: https://hub.docker.com/r/rejavarti/rejavartis_logging_server
- **GitHub**: https://github.com/rejavarti/logging-server
- **Issues**: Report on GitHub

---

**Version**: 1.0.0  
**Last Updated**: October 27, 2025
