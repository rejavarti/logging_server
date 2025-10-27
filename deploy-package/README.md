# 🏢 Enterprise Logging Platform

Universal Infrastructure Monitoring with Enterprise Authentication and Multi-Source Data Ingestion

## 🚀 Overview

This is a comprehensive enterprise-grade logging platform designed for universal infrastructure monitoring. Starting with DSC PC1500/1550 security systems, it has evolved into a multi-source data ingestion platform supporting UniFi network equipment, Unraid servers, Home Assistant, Node-RED, IoT devices, and environmental sensors - all with enterprise authentication and role-based access control.

### Architecture

**ESP32 Client** → **Node.js Docker Server** → **SQLite Database** → **File-based Logs**
- **ESP32**: DSC Classic Panel interface with HTTP logging
- **Server**: Node.js Express server on port 10180
- **Storage**: SQLite for structured data + rotating log files
- **Analytics**: REST API for future dashboard integration

### Features

#### 🔐 Security & Authentication
- Basic HTTP authentication
- Configurable credentials via environment variables
- Access code redaction in logs

#### 📊 Categorized Logging
- **Critical**: 1 year retention (system failures, security breaches)
- **Security**: 90 days (arm/disarm events, access codes)
- **System**: 30 days (general system status)
- **Zone**: 30 days (door/window/motion events)
- **Access**: 90 days (user access tracking)

#### 🏠 Zone Monitoring
- Real-time zone state tracking
- Duration analysis (how long doors/windows stay open)
- Daily activity statistics
- Configurable zone types and names

#### 🌐 Network Resilience
- Offline buffering on ESP32
- Bulk log transmission when connectivity restored
- Health monitoring and status reporting

### Installation on Unraid

1. **Create Directory Structure**:
   ```bash
   mkdir -p /mnt/user/appdata/dsc-logger/{data,logs}
   ```

2. **Copy Files**:
   - Place all logging server files in `/mnt/user/appdata/dsc-logger/`
   - Ensure proper permissions: `chmod -R 755 /mnt/user/appdata/dsc-logger/`

3. **Deploy with Docker Compose**:
   ```bash
   cd /mnt/user/appdata/dsc-logger/
   docker-compose up -d
   ```

4. **Verify Deployment**:
   ```bash
   curl http://192.168.222.3:10180/health
   ```

### Configuration

#### ESP32 Configuration
Update `dsc_config.h` with your server details:
```cpp
#define ENABLE_HTTP_LOGGING true
#define HTTP_LOG_SERVER_IP "192.168.222.3"
#define HTTP_LOG_SERVER_PORT 10180
#define HTTP_LOG_USERNAME "dsc_logger"
#define HTTP_LOG_PASSWORD "SecureLog2025!"
```

#### Environment Variables
```bash
AUTH_USERNAME=dsc_logger
AUTH_PASSWORD=SecureLog2025!
NODE_ENV=production
TZ=America/Denver
PORT=10180
```

### API Endpoints

#### Logging
- `POST /log` - Single log event
- `POST /log/bulk` - Multiple buffered events
- `POST /status` - System status update

#### Analytics
- `GET /api/logs` - Query log events
- `GET /api/zones/stats` - Zone activity statistics
- `GET /health` - Server health check

### Zone Configuration

Your active zones (as configured):
1. **Back Door** (door sensor)
2. **Front Door** (door sensor)  
3. **Upper Patio Door** (door sensor)
4. **Downstairs Motion** (motion detector)
5. **Glass Break Sensor** (tamper/vibration)

### Log Categories & Retention

| Category | Retention | Use Case |
|----------|-----------|----------|
| Critical | 365 days | System failures, security breaches |
| Security | 90 days | Arm/disarm, access codes, alarms |
| System | 30 days | WiFi, power, general status |
| Zone | 30 days | Door/window/motion events |
| Access | 90 days | User access tracking |

### File Structure
```
logging-server/
├── package.json          # Node.js dependencies
├── server.js             # Main server application
├── Dockerfile            # Container configuration  
├── docker-compose.yml    # Unraid deployment
├── README.md            # This documentation
├── data/                # Database storage
│   └── databases/       # SQLite files
└── logs/                # Rotating log files
    ├── critical-*.log   # 1 year retention
    ├── security-*.log   # 90 days retention
    └── system-*.log     # 30 days retention
```

### Development & Testing

1. **Local Development**:
   ```bash
   npm install
   npm run dev  # Uses nodemon for auto-restart
   ```

2. **Test Logging**:
   ```bash
   curl -X POST http://localhost:10180/log \
     -H "Content-Type: application/json" \
     -u dsc_logger:SecureLog2025! \
     -d '{
       "category": "security",
       "device_id": "ESP32-DSC-001", 
       "event_type": "zone_opened",
       "zone_number": 1,
       "zone_name": "Back Door",
       "message": "Back door opened"
     }'
   ```

### Monitoring

- **Health Check**: `GET /health`
- **Docker Logs**: `docker logs dsc-universal-logger`
- **Log Files**: `/mnt/user/appdata/dsc-logger/logs/`
- **Database**: SQLite browser for `/mnt/user/appdata/dsc-logger/data/databases/dsc_logs.db`

### Future Enhancements

- Web dashboard for real-time monitoring
- Alert notifications (email, SMS, push)
- Integration with Home Assistant
- Machine learning for pattern recognition
- Export capabilities (CSV, JSON)

### Support

Created for Tom Nelson's comprehensive home security logging platform. The system is designed to scale from a single DSC panel to a universal logging solution for all home automation systems.

**Server**: Unraid @ 192.168.222.3:10180  
**Timezone**: America/Denver (Mountain Time)  
**Storage**: 50TB available capacity