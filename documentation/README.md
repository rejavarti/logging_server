# 🏢 Enterprise Logging Platform

[![Docker Hub](https://img.shields.io/docker/v/rejavarti/logging-server?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/rejavarti/logging-server)
[![Docker Pulls](https://img.shields.io/docker/pulls/rejavarti/logging-server)](https://hub.docker.com/r/rejavarti/logging-server)
[![Docker Image Size](https://img.shields.io/docker/image-size/rejavarti/logging-server/latest)](https://hub.docker.com/r/rejavarti/logging-server)

Universal Infrastructure Monitoring with Enterprise Authentication and Multi-Source Data Ingestion

## 🚀 Overview

This is a comprehensive enterprise-grade logging platform designed for universal infrastructure monitoring. Starting with DSC PC1500/1550 security systems, it has evolved into a multi-source data ingestion platform supporting UniFi network equipment, Unraid servers, Home Assistant, Node-RED, IoT devices, and environmental sensors - all with enterprise authentication and role-based access control.

**Now available on Docker Hub!** Pull and run with a single command - no build required.

### Architecture

**ESP32 Client** → **Node.js Docker Server** → **SQLite Database** → **File-based Logs**
- **ESP32**: DSC Classic Panel interface with HTTP logging
- **Server**: Node.js Express server on port 10180
- **Storage**: SQLite for structured data + rotating log files
- **Analytics**: REST API with real-time dashboard

---

## 🐳 Quick Start with Docker

### **Pull from Docker Hub (Recommended)**

```bash
docker pull rejavarti/logging-server:latest
```

### **Run with Docker**

```bash
docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=ChangeMe123! \
  rejavarti/logging-server:latest
```

**Access**: http://localhost:10180

### **Run with Docker Compose**

```yaml
version: '3.8'

services:
  logging-server:
    image: rejavarti/logging-server:latest
    container_name: rejavarti-logging-server
    restart: unless-stopped
    ports:
      - "10180:10180"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - PORT=10180
      - TZ=America/Denver
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=ChangeMe123!
```

Then run:
```bash
docker-compose up -d
```

---

## ✨ Features

#### 🔐 Security & Authentication
- Multi-user authentication with RBAC (Admin/User roles)
- Session management with secure cookies
- Activity logging and audit trails
- Password hashing with bcrypt

#### 📊 Categorized Logging
- **Critical**: 1 year retention (system failures, security breaches)
- **Security**: 90 days (arm/disarm events, access codes)
- **System**: 30 days (general system status)
- **Zone**: 30 days (door/window/motion events)
- **Access**: 90 days (user access tracking)

#### 🔗 Integration Management
- **MQTT**: Broker connectivity with automatic reconnection
- **WebSocket**: Real-time updates to connected clients
- **UniFi**: Network equipment monitoring
- **Home Assistant**: Smart home integration
- **Webhooks**: Event-based notifications

#### � Advanced Features
- **Real-time Dashboard**: Ocean Blue themed responsive UI
- **Webhook System**: Configurable event notifications
- **Automatic Backups**: Daily backups at 2 AM (keeps last 10)
- **PM2 Integration**: Auto-restart on crashes
- **Health Monitoring**: Built-in health check endpoints
- **Activity Logging**: Complete audit trail

---

## 🖥️ Installation Options

### **Option 1: Docker Hub (Easiest)**

Pull and run the pre-built image:

```bash
docker pull rejavarti/logging-server:latest

docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=America/Denver \
  rejavarti/logging-server:latest
```

### **Option 2: Unraid GUI**

1. Go to **Docker** tab in Unraid Web UI
2. Click **Add Container**
3. Fill in:
   - **Repository**: `rejavarti/logging-server:latest`
   - **Port**: `10180:10180`
   - **Paths**:
     - Container: `/app/data` → Host: `/mnt/user/appdata/logging-server/data`
     - Container: `/app/logs` → Host: `/mnt/user/appdata/logging-server/logs`
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `TZ=America/Denver`
     - `AUTH_USERNAME=admin`
     - `AUTH_PASSWORD=YourSecurePassword!`
4. Click **Apply**

See [UNRAID_GUI_INSTALLATION.md](deploy-package/UNRAID_GUI_INSTALLATION.md) for detailed GUI setup.

### **Option 3: Build from Source**

```bash
git clone https://github.com/rejavarti/logging-server.git
cd logging-server
docker build -t rejavarti/logging-server:latest .
docker-compose up -d
```

### **Verify Installation**

```bash
curl http://localhost:10180/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": 123.45,
  "version": "1.0.0"
}
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `PORT` | `10180` | Server port |
| `TZ` | `America/Denver` | Timezone for logs |
| `AUTH_USERNAME` | `dsc_logger` | Default username (change after setup) |
| `AUTH_PASSWORD` | - | Default password (**REQUIRED**) |

### First-Time Setup

1. **Access Web Interface**: http://your-server:10180
2. **Login** with AUTH_USERNAME/AUTH_PASSWORD
3. **Register First User**: Navigate to `/register`
   - First user automatically becomes admin
4. **Create Additional Users**: Settings → Users tab
5. **Configure Integrations**: Integrations page
   - Add MQTT, WebSocket, UniFi, Home Assistant
6. **Set Up Webhooks**: Webhooks page
   - Configure event notifications

---

## 📡 API Endpoints

### Logging Endpoints
- `POST /log` - Single log event
- `POST /log/bulk` - Multiple buffered events
- `POST /status` - System status update
- `POST /api/logs` - Query log events with filters

### Integration Endpoints
- `GET /api/integrations/status` - Get integration status
- `POST /api/integrations/mqtt/publish` - Publish MQTT message
- `POST /api/integrations/websocket/broadcast` - Broadcast WebSocket message

### Webhook Endpoints
- `GET /api/webhooks` - List all webhooks
- `POST /api/webhooks` - Create webhook
- `PUT /api/webhooks/:id` - Update webhook
- `DELETE /api/webhooks/:id` - Delete webhook
- `POST /api/webhooks/:id/test` - Test webhook

### System Endpoints
- `GET /health` - Health check
- `GET /api/system/metrics` - System metrics
- `POST /api/admin/restart` - Restart server (admin only)

### Authentication Required
All API endpoints (except `/health`) require authentication via:
- Session cookie (web UI)
- Basic Auth header (API clients)

---

## 🔌 Integration Examples

### Node-RED HTTP Request

```javascript
// Function node
msg.payload = {
    category: "system",
    source: "node-red",
    device_id: flow.get("hostname"),
    event_type: "flow_executed",
    severity: "info",
    message: "Automation flow completed",
    metadata: {
        flow_name: "Home Automation",
        execution_time: 125
    }
};
msg.headers = {
    "Authorization": "Basic " + Buffer.from("admin:password").toString("base64")
};
return msg;

// HTTP Request node
// Method: POST
// URL: http://your-server:10180/log
```

### ESP32 Logging

```cpp
#include <HTTPClient.h>

void logEvent(String category, String message) {
    HTTPClient http;
    http.begin("http://192.168.222.3:10180/log");
    http.setAuthorization("dsc_logger", "SecureLog2025!");
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{";
    payload += "\"category\":\"" + category + "\",";
    payload += "\"device_id\":\"ESP32-001\",";
    payload += "\"event_type\":\"sensor_reading\",";
    payload += "\"message\":\"" + message + "\"";
    payload += "}";
    
    int httpCode = http.POST(payload);
    http.end();
}
```

### Home Assistant Automation

```yaml
automation:
  - alias: "Log to Rejavarti Server"
    trigger:
      - platform: state
        entity_id: binary_sensor.front_door
    action:
      - service: rest_command.log_event
        data:
          category: "security"
          message: "Front door {{ trigger.to_state.state }}"

rest_command:
  log_event:
    url: "http://192.168.222.3:10180/log"
    method: POST
    headers:
      authorization: "Basic ZHNjX2xvZ2dlcjpTZWN1cmVMb2cyMDI1IQ=="
    payload: '{"category":"{{ category }}","source":"home-assistant","device_id":"ha-core","event_type":"automation","message":"{{ message }}"}'
```

---

## 📁 Data Persistence

All data is stored in Docker volumes:

| Path | Contents | Backup |
|------|----------|--------|
| `/app/data/databases/` | SQLite databases | Daily at 2 AM |
| `/app/data/backups/` | Automatic backups (keeps 10) | Manual |
| `/app/data/sessions/` | User sessions | Cleared on restart |
| `/app/logs/` | Categorized log files | Rotated daily |

### Manual Backup

```bash
# Backup database
docker exec rejavarti-logging-server \
  cp /app/data/databases/enterprise_logs.db /app/data/backups/manual-backup.db

# Copy to host
docker cp rejavarti-logging-server:/app/data/backups/manual-backup.db ./backup.db
```

---

## 🔧 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs rejavarti-logging-server

# Common issues:
# - Port 10180 already in use
# - Missing environment variables
# - Permission issues with volumes
```

### Can't Access Web Interface

```bash
# Test health endpoint
curl http://localhost:10180/health

# Check if container is running
docker ps | grep rejavarti

# Check port mapping
docker port rejavarti-logging-server
```

### Reset Admin Password

```bash
# Access container
docker exec -it rejavarti-logging-server sh

# Access SQLite
sqlite3 /app/data/databases/enterprise_logs.db

# View users
SELECT username, role FROM users;

# Delete user to re-register
DELETE FROM users WHERE username='admin';
```

---

## 🚀 Production Deployment

### Recommended Setup

1. **Use Docker Compose** for easier management
2. **Configure reverse proxy** (Nginx, Traefik) for HTTPS
3. **Set strong passwords** - Change AUTH_PASSWORD immediately
4. **Regular backups** - Automated daily backups included
5. **Monitor logs** - Check Docker logs regularly
6. **Update regularly** - Pull latest image: `docker pull rejavarti/logging-server:latest`

### Security Best Practices

- ✅ Use HTTPS with valid SSL certificate
- ✅ Change default AUTH_PASSWORD
- ✅ Create strong admin account password
- ✅ Enable firewall rules (restrict to local network)
- ✅ Regular security updates
- ✅ Monitor audit logs in Settings page

---

## 🎨 Features Showcase

### Dashboard
- Real-time log monitoring
- System metrics and health
- Recent activity feed
- Quick access to all features

### Integrations
- Configure MQTT, WebSocket, UniFi, Home Assistant
- Test connections with one click
- Health monitoring per integration
- Custom integration support

### Webhooks
- Create event-based notifications
- Support for multiple event types
- Delivery tracking and retry logic
- Test webhook functionality

### Settings
- User management (Admin/User roles)
- Integration configuration
- System maintenance tools
- Audit logs and activity tracking
- Server restart functionality

---

## 📊 Technical Specifications

- **Base Image**: Node.js 18 Alpine Linux
- **Process Manager**: PM2 for auto-restart
- **Database**: SQLite 3
- **Session Store**: SQLite-based sessions
- **Authentication**: bcrypt password hashing
- **Logging**: Winston with daily rotation
- **Real-time**: WebSocket (ws library)
- **MQTT**: mqtt.js client
- **HTTP Framework**: Express.js
- **Container Size**: 391MB

---

## 🗺️ Roadmap

- [x] Multi-user authentication with RBAC
- [x] Integration management system
- [x] Webhook notifications
- [x] Automatic backups
- [x] PM2 auto-restart
- [x] Docker Hub publishing
- [ ] Email notifications
- [ ] SMS alerts (Twilio integration)
- [ ] Advanced analytics and reporting
- [ ] Mobile app
- [ ] Multi-factor authentication

---

## 📄 License

MIT License - Created by Tom Nelson (Rejavarti)

---

## 🤝 Contributing

Contributions welcome! Please open an issue or pull request.

---

## 📞 Support

- **Docker Hub**: https://hub.docker.com/r/rejavarti/logging-server
- **Issues**: GitHub Issues
- **Documentation**: See [DEPLOYMENT_GUIDE.md](deploy-package/DEPLOYMENT_GUIDE.md)

---

**Version**: 1.0.0  
**Updated**: October 27, 2025