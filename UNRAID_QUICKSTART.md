# 🚀 Unraid Quick Start - Enterprise Logging Server

## ⚡ **Fastest Setup (3 Options)**

### **Option 1: Community Applications Template** ⭐ EASIEST
1. Open Unraid WebUI → **Docker** → **Add Container**
2. Click **"Template repositories"** at bottom
3. Add: `https://raw.githubusercontent.com/rejavarti/Node-Red-Logging/master/unraid-template.xml`
4. Search for: `Enterprise Logging Server`
5. Configure password, click **Apply**
6. Access: `http://YOUR-UNRAID-IP:10180`

### **Option 2: Auto-Deploy Script** 
```bash
# SSH into Unraid
cd /tmp
wget https://raw.githubusercontent.com/rejavarti/Node-Red-Logging/master/unraid-deploy.sh
bash unraid-deploy.sh
```

### **Option 3: Manual Docker Run**
```bash
docker run -d \
  --name enterprise-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -p 8081:8081 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -e NODE_ENV=production \
  -e AUTH_PASSWORD="YourPassword123!" \
  -e TZ=America/Denver \
  node:18-alpine \
  sh -c "apk add --no-cache sqlite && npm i -g pm2 && cd /app && npm i && pm2-runtime server.js"
```

---

## 📊 **Essential Configuration**

### **Required Ports**
| Port | Protocol | Purpose |
|------|----------|---------|
| 10180 | TCP | Web UI ⭐ |
| 8081 | TCP | WebSocket |

### **Optional Ingestion Ports**
| Port | Protocol | Service |
|------|----------|---------|
| 514 | UDP | Syslog UDP |
| 601 | TCP | Syslog TCP |
| 12201 | UDP | GELF UDP |
| 12202 | TCP | GELF TCP |
| 5044 | TCP | Beats/Logstash |
| 9880 | TCP | Fluentd |

### **Critical Environment Variables**
```bash
AUTH_PASSWORD=YourSecurePassword123!  # ⚠️ CHANGE THIS!
TZ=America/Denver                     # Your timezone
NODE_ENV=production                   # Don't change
```

### **Data Persistence Paths**
```
/mnt/user/appdata/logging-server/data     # Database (CRITICAL)
/mnt/user/appdata/logging-server/logs     # App logs
/mnt/user/appdata/logging-server/backups  # DB backups
```

---

## 🔧 **Common Management Commands**

```bash
# Container Management
docker start enterprise-logging-server
docker stop enterprise-logging-server
docker restart enterprise-logging-server
docker logs enterprise-logging-server -f

# Shell Access
docker exec -it enterprise-logging-server sh

# PM2 Process Management (inside container)
docker exec enterprise-logging-server pm2 list
docker exec enterprise-logging-server pm2 reload logging-server
docker exec enterprise-logging-server pm2 logs

# Database Backup
docker exec enterprise-logging-server sqlite3 \
  /app/data/logging.db \
  ".backup '/app/data/backups/manual-$(date +%Y%m%d).db'"

# Check Health
curl http://localhost:10180/api/system/health
```

---

## ✅ **Post-Install Checklist**

- [ ] Access Web UI: `http://UNRAID-IP:10180`
- [ ] Login with username: `admin`
- [ ] Change default password in Settings
- [ ] Configure timezone in Settings
- [ ] Enable ingestion protocols you need
- [ ] Set up automated backups (Settings → Backups)
- [ ] Create your first dashboard
- [ ] Configure retention policy
- [ ] Test log ingestion from a source

---

## 🐛 **Troubleshooting Quick Fixes**

### **Can't Access Web UI**
```bash
# Check container is running
docker ps | grep enterprise-logging

# Check logs for errors
docker logs enterprise-logging-server --tail 50

# Verify port not in use
netstat -tuln | grep 10180

# Restart container
docker restart enterprise-logging-server
```

### **Database Locked Error**
```bash
# Restart PM2
docker exec enterprise-logging-server pm2 restart logging-server
```

### **High Memory Usage**
```bash
# Check stats
docker stats enterprise-logging-server

# Reload app (clears cache)
docker exec enterprise-logging-server pm2 reload logging-server
```

### **Port Conflicts**
```bash
# Find what's using port
lsof -i :10180

# Change host port mapping
docker stop enterprise-logging-server
docker rm enterprise-logging-server
# Re-run with different port: -p 10181:10180
```

---

## 📞 **Quick Help**

**Web UI**: http://UNRAID-IP:10180  
**Health Check**: http://UNRAID-IP:10180/api/system/health  
**Default Login**: admin / (your AUTH_PASSWORD)  

**Full Documentation**: See `UNRAID_SETUP.md`  
**Issues**: Check logs first: `docker logs enterprise-logging-server`

---

## 🎯 **Next Steps**

1. **Secure**: Change admin password & generate JWT secret
2. **Configure**: Enable needed ingestion protocols
3. **Backup**: Set automated backup schedule
4. **Monitor**: Create dashboards for your infrastructure
5. **Alerts**: Configure notifications (webhook/email)

---

**🚀 You're ready to go! Happy logging!**
