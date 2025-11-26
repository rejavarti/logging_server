# 🔧 Unraid Template Configuration Fix

## Problem
When Unraid auto-imports from Docker Hub, it pulls the wrong environment variables from the Node.js base image instead of the actual application configuration.

## Quick Fix - Manual Configuration

### Step 1: Remove Incorrect Variables
In the Unraid Docker template, **DELETE** these variables:
- ❌ `NODE_VERSION` (18.20.8)
- ❌ `YARN_VERSION` (1.22.22)
- ❌ Keep `NODE_ENV` (production) - this one is correct
- ❌ `Community_Applications_Conversion` (not needed)

### Step 2: Add Required Paths

Click **"Add another Path, Port, Variable, Label or Device"** and add:

#### Path 1 - Data Directory
- **Config Type**: `Path`
- **Name**: `Data Directory`
- **Container Path**: `/app/data`
- **Host Path**: `/mnt/user/appdata/logging-server/data`
- **Access Mode**: `Read/Write`

#### Path 2 - Logs Directory
- **Config Type**: `Path`
- **Name**: `Logs Directory`
- **Container Path**: `/app/logs`
- **Host Path**: `/mnt/user/appdata/logging-server/logs`
- **Access Mode**: `Read/Write`

#### Path 3 - SSL Certificates (Optional)
- **Config Type**: `Path`
- **Name**: `SSL Certificates`
- **Container Path**: `/app/ssl`
- **Host Path**: `/mnt/user/appdata/logging-server/ssl`
- **Access Mode**: `Read Only`

### Step 3: Fix Port Mapping

The port should already be there, but verify:
- **Container Port**: `10180`
- **Host Port**: `10180` (or your preferred port)
- **Connection Type**: `TCP`

### Step 4: Add Required Environment Variables

Click **"Add another Path, Port, Variable, Label or Device"** and add:

#### Variable 1 - Application Port
- **Config Type**: `Variable`
- **Name**: `Application Port`
- **Key**: `PORT`
- **Value**: `10180`

#### Variable 2 - Timezone
- **Config Type**: `Variable`
- **Name**: `Timezone`
- **Key**: `TZ`
- **Value**: `America/Denver` (change to your timezone)

#### Variable 3 - Admin Username
- **Config Type**: `Variable`
- **Name**: `Admin Username`
- **Key**: `AUTH_USERNAME`
- **Value**: `admin`

#### Variable 4 - Admin Password
- **Config Type**: `Variable`
- **Name**: `Admin Password`
- **Key**: `AUTH_PASSWORD`
- **Value**: `ChangeMe123!` (⚠️ CHANGE THIS!)
- **Display**: `Password` (to hide value)

#### Variable 5 - Enable HTTPS (Optional)
- **Config Type**: `Variable`
- **Name**: `Enable HTTPS`
- **Key**: `USE_HTTPS`
- **Value**: `false`

### Step 5: Final Configuration Summary

After completing the steps above, your Unraid template should have:

**Ports:**
- ✅ Port 10180 → 10180 (TCP)

**Paths:**
- ✅ `/mnt/user/appdata/logging-server/data` → `/app/data` (RW)
- ✅ `/mnt/user/appdata/logging-server/logs` → `/app/logs` (RW)
- ✅ `/mnt/user/appdata/logging-server/ssl` → `/app/ssl` (RO) - Optional

**Environment Variables:**
- ✅ `NODE_ENV` = `production`
- ✅ `PORT` = `10180`
- ✅ `TZ` = `America/Denver` (your timezone)
- ✅ `AUTH_USERNAME` = `admin`
- ✅ `AUTH_PASSWORD` = `YourSecurePassword`
- ✅ `USE_HTTPS` = `false` (set to `true` if using SSL)

### Step 6: Create Directories and Start

Before starting the container, create the directories:

```bash
# SSH into Unraid
ssh root@your-unraid-ip

# Create directories
mkdir -p /mnt/user/appdata/logging-server/{data/{databases,backups,sessions},logs}

# Set permissions
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server
```

Then click **"Apply"** in Unraid to start the container.

---

## Better Solution - Use XML Template

Instead of manually configuring, you can import the pre-configured template:

### Option A: Import from File

1. Download `unraid-template.xml` from the repository
2. Copy to `/boot/config/plugins/dockerMan/templates-user/`
3. Refresh Docker page in Unraid
4. Click "Add Container" → Select "RejavartiLoggingServer"

### Option B: Import from URL (Future)

Once the template is hosted, you can add it to Community Applications template repository.

---

## Access the Dashboard

After the container starts:

1. **Open Browser**: `http://your-unraid-ip:10180/dashboard`
2. **Login**:
   - Username: `admin`
   - Password: `ChangeMe123!` (or what you set)
3. **Change Password**: Go to Settings → Security

---

## Verification

Check if the container is working:

```bash
# Check container logs
docker logs rejavarti-logging-server

# You should see:
# 🎯 Enhanced Universal Logging Platform Started Successfully!
# 🌐 Web Interface: http://localhost:10180/dashboard

# Test health endpoint
curl http://localhost:10180/health

# Should return:
# {"status":"healthy","uptime":xxx,"version":"2.1.0-stable-enhanced"}
```

---

## Common Issues

### Issue 1: Container won't start
**Solution**: Check directory permissions
```bash
chmod -R 755 /mnt/user/appdata/logging-server
chown -R 1001:1001 /mnt/user/appdata/logging-server
```

### Issue 2: Can't access dashboard
**Solution**: Verify port mapping and firewall
```bash
# Check if port is listening
netstat -tulpn | grep 10180

# Test from Unraid
curl http://localhost:10180/health
```

### Issue 3: Database errors
**Solution**: Ensure data directory has correct permissions
```bash
ls -la /mnt/user/appdata/logging-server/data/
# Should show directories owned by user 1001
```

---

## Quick Start Command (Alternative)

If you prefer command line:

```bash
docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -e NODE_ENV=production \
  -e PORT=10180 \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=ChangeMe123! \
  rejavarti/logging-server:latest
```

---

## Need Help?

- **Docker Hub**: https://hub.docker.com/r/rejavarti/logging-server
- **Documentation**: See README.md and other guides in the repository
- **Health Check**: http://your-ip:10180/health
