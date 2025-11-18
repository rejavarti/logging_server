# Rejavarti's Enterprise Logging Server

[![Docker Image Size](https://img.shields.io/docker/image-size/rejavarti/rejavartis_logging_server/latest)](https://hub.docker.com/r/rejavarti/rejavartis_logging_server)
[![Docker Pulls](https://img.shields.io/docker/pulls/rejavarti/rejavartis_logging_server)](https://hub.docker.com/r/rejavarti/rejavartis_logging_server)

**Universal Infrastructure Monitoring Platform** with Enterprise Authentication, Multi-User Support, and Real-Time Analytics.

Perfect for DSC security systems, UniFi networks, Home Assistant, Node-RED, IoT devices, and comprehensive infrastructure logging.

---

## 🚀 Quick Start

### Pull and Run

```bash
docker pull rejavarti/rejavartis_logging_server:latest

docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=ChangeMe123! \
  rejavarti/rejavartis_logging_server:latest
```

**Access**: http://localhost:10180

### Docker Compose

```yaml
version: '3.8'

services:
  logging-server:
    image: rejavarti/rejavartis_logging_server:latest
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

Then run: `docker-compose up -d`

---

## ✨ Key Features

### 🔐 Security & Authentication
- **Multi-User System**: Admin and User roles with RBAC
- **Session Management**: Secure cookie-based authentication
- **Activity Logging**: Complete audit trail of all actions
- **Password Security**: bcrypt hashing with salt

### 🔗 Integration Management
- **MQTT**: Connect to MQTT brokers with auto-reconnection
- **WebSocket**: Real-time updates to connected clients
- **UniFi**: Monitor UniFi network equipment
- **Home Assistant**: Smart home integration
- **Custom Integrations**: Add your own via API

### 📊 Advanced Logging
- **Categorized Storage**: Critical, Security, System, Zone, Access logs
- **Retention Policies**: Automatic cleanup (1 year to 30 days)
- **Real-Time Dashboard**: Ocean Blue themed responsive UI
- **Search & Filter**: Query logs by category, severity, source
- **Analytics**: Activity statistics and trends

### 🎯 Webhook System
- **Event Notifications**: Trigger webhooks on specific events
- **Delivery Tracking**: Monitor success/failure rates
- **Retry Logic**: Automatic retry on failures
- **Test Functionality**: Test webhooks before deployment

### 🛠️ Maintenance & Operations
- **Automatic Backups**: Daily backups at 2 AM (keeps last 10)
- **Health Monitoring**: `/health` endpoint for monitoring
- **PM2 Integration**: Auto-restart on crashes
- **Server Restart**: One-click restart from UI
- **Database Cleanup**: Automated old log removal

### 🎨 User Interface
- **Ocean Blue Theme**: Modern, responsive design
- **Dark Mode Optimized**: Easy on the eyes
- **Real-Time Updates**: WebSocket-powered live data
- **Mobile Friendly**: Works on all devices
- **Intuitive Navigation**: Easy to use for all skill levels

---

## ⚙️ Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `production` | No | Node.js environment |
| `PORT` | `10180` | No | Server port |
| `TZ` | `America/Denver` | No | Timezone for logs |
| `AUTH_USERNAME` | `dsc_logger` | No | Default username |
| `AUTH_PASSWORD` | - | **YES** | Default password (change immediately!) |

---

## 📡 API Endpoints

### Logging
- `POST /log` - Single log event
- `POST /log/bulk` - Bulk log events
- `GET /api/logs` - Query logs with filters

### Integrations
- `GET /api/integrations/status` - Integration status
- `POST /api/integrations/mqtt/publish` - Publish MQTT
- `POST /api/integrations/websocket/broadcast` - WebSocket broadcast

### Webhooks
- `GET /api/webhooks` - List webhooks
- `POST /api/webhooks` - Create webhook
- `PUT /api/webhooks/:id` - Update webhook
- `DELETE /api/webhooks/:id` - Delete webhook

### System
- `GET /health` - Health check (no auth required)
- `GET /api/system/metrics` - System metrics
- `POST /api/admin/restart` - Restart server (admin only)

---

## 🔌 Integration Examples

### Node-RED

Use HTTP Request node with Basic Auth:

```javascript
msg.payload = {
    category: "system",
    source: "node-red",
    device_id: "automation-server",
    event_type: "flow_executed",
    message: "Automation completed"
};
msg.headers = {
    "Authorization": "Basic " + Buffer.from("admin:password").toString("base64")
};
return msg;
```

**URL**: `http://your-server:10180/log`  
**Method**: POST

### Home Assistant

```yaml
rest_command:
  log_event:
    url: "http://192.168.1.100:10180/log"
    method: POST
    headers:
      authorization: "Basic <base64-credentials>"
    payload: '{"category":"security","source":"home-assistant","message":"{{ message }}"}'
```

### ESP32/Arduino

```cpp
#include <HTTPClient.h>

HTTPClient http;
http.begin("http://192.168.1.100:10180/log");
http.setAuthorization("admin", "password");
http.addHeader("Content-Type", "application/json");
http.POST("{\"category\":\"system\",\"message\":\"ESP32 online\"}");
```

---

## 📁 Data Persistence

Mount these volumes to persist data:

| Container Path | Purpose | Backup |
|----------------|---------|--------|
| `/app/data` | Databases, sessions, backups | Required |
| `/app/logs` | Categorized log files | Optional |

**Example**:
```bash
-v /mnt/user/appdata/logging-server/data:/app/data \
-v /mnt/user/appdata/logging-server/logs:/app/logs
```

---

## 🎯 Use Cases

### Home Security
- Log DSC security panel events
- Track door/window sensors
- Monitor motion detectors
- Arm/disarm history

### Network Monitoring
- UniFi device status
- Network alerts and warnings
- Bandwidth usage logs
- Connection tracking

### Smart Home
- Home Assistant events
- Automation execution logs
- Device state changes
- Energy monitoring

### IoT Devices
- ESP32/Arduino logging
- Sensor readings
- Device health monitoring
- Error tracking

### Infrastructure
- Server status updates
- Application logs
- Performance metrics
- System health checks

---

## 🚀 First-Time Setup

1. **Start Container**: Use docker run or docker-compose
2. **Access Web UI**: http://your-server:10180
3. **Login**: Use AUTH_USERNAME and AUTH_PASSWORD
4. **Register Admin**: Go to `/register` - first user becomes admin
5. **Configure Integrations**: Add MQTT, WebSocket, etc.
6. **Create Webhooks**: Set up event notifications
7. **Add Users**: Settings → Users (admin only)

---

## 🔧 Troubleshooting

### Container Won't Start

```bash
docker logs rejavarti-logging-server
```

Common issues:
- Port 10180 already in use
- Missing AUTH_PASSWORD environment variable
- Volume permission issues

### Can't Access UI

```bash
# Test health endpoint
curl http://localhost:10180/health

# Check container status
docker ps | grep rejavarti

# Check port mapping
docker port rejavarti-logging-server
```

### Reset Password

```bash
docker exec -it rejavarti-logging-server sh
sqlite3 /app/data/databases/enterprise_logs.db
DELETE FROM users WHERE username='admin';
```

Then re-register at `/register`

---

## 📊 Technical Details

- **Base Image**: Node.js 18 Alpine Linux (minimal, secure)
- **Process Manager**: PM2 (auto-restart, graceful shutdown)
- **Database**: SQLite 3 (embedded, no external DB needed)
- **Session Store**: SQLite-based (persistent sessions)
- **Real-Time**: WebSocket for live updates
- **Authentication**: bcrypt password hashing
- **Logging**: Winston with daily file rotation
- **Container Size**: 391MB
- **Architecture**: linux/amd64

---

## 🔐 Security Best Practices

1. ✅ **Change Default Password**: Set strong AUTH_PASSWORD
2. ✅ **Use HTTPS**: Deploy behind reverse proxy (Nginx, Traefik)
3. ✅ **Restrict Access**: Use firewall rules or VPN
4. ✅ **Regular Updates**: `docker pull rejavarti/rejavartis_logging_server:latest`
5. ✅ **Monitor Logs**: Check audit logs in Settings
6. ✅ **Backup Data**: Regular backups of `/app/data` volume

---

## 📚 Additional Resources

- **Full Documentation**: [GitHub README](https://github.com/rejavarti/logging-server)
- **Deployment Guide**: Detailed setup instructions included
- **Unraid Template**: GUI installation for Unraid users
- **API Documentation**: Complete API reference in README

---

## 🗺️ Roadmap

- [x] Multi-user authentication with RBAC
- [x] Integration management (MQTT, WebSocket, UniFi, Home Assistant)
- [x] Webhook system with delivery tracking
- [x] Automatic daily backups
- [x] PM2 auto-restart
- [x] Real-time dashboard
- [ ] Email notifications (SMTP)
- [ ] SMS alerts (Twilio)
- [ ] Advanced analytics
- [ ] Mobile app
- [ ] Multi-factor authentication

---

## 📄 License

MIT License

---

## 🙏 Support

- **Docker Hub**: https://hub.docker.com/r/rejavarti/rejavartis_logging_server
- **GitHub**: https://github.com/rejavarti/logging-server
- **Issues**: Report bugs or request features on GitHub

---

## 📈 Stats

- **Downloads**: Track your pull count above
- **Stars**: Star the repository if you find it useful
- **Version**: 1.0.0
- **Last Updated**: October 27, 2025

---

**Created by**: Tom Nelson (Rejavarti)  
**Purpose**: Universal infrastructure monitoring and logging platform  
**Ideal For**: Home labs, small businesses, IoT projects, security systems

---

Pull and deploy in seconds! 🚀

```bash
docker pull rejavarti/rejavartis_logging_server:latest
```
