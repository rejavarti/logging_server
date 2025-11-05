# 🐳 Docker Deployment Guide
## Enhanced Universal Logging Platform

### 🚀 Quick Start

#### Option 1: Docker Compose (Recommended)
```bash
# Clone or download the project
git clone <repository-url>
cd logging-server

# Copy environment template
cp env.docker .env

# Edit .env file with your secure password
nano .env  # Change AUTH_PASSWORD

# Start with Docker Compose
docker-compose up -d
```

#### Option 2: Docker Run
```bash
docker run -d \
  --name enhanced-logging-platform \
  --restart unless-stopped \
  -p 10180:10180 \
  -e AUTH_PASSWORD="YourSecurePassword123!" \
  -e NODE_ENV=production \
  -v ./data:/app/data \
  -v ./logs:/app/logs \
  rejavarti/rejavartis_logging_server:latest
```

### 🔧 Configuration

#### Environment Variables
Copy `env.docker` to `.env` and customize:

```bash
# Required
AUTH_PASSWORD=YourSecurePassword123!
PORT=10180
NODE_ENV=production

# Optional
TZ=America/Denver
ENABLE_METRICS=true
LOG_RETENTION_DAYS=30
```

#### ⚠️ Port Configuration Important Notes
- **Internal Port** (`PORT` in .env): Must match the port your application binds to
- **Docker Port Mapping**: Format is `host-port:container-port`
- **Keep Them Consistent**: If you change `PORT=10180` to `PORT=8080`, also update Docker mapping to `8080:8080`

**Examples:**
```bash
# Standard configuration
PORT=10180 (in .env)
-p 10180:10180 (Docker mapping)

# Custom port configuration  
PORT=8080 (in .env)
-p 8080:8080 (Docker mapping)

# External port different from internal
PORT=10180 (in .env)
-p 80:10180 (Docker mapping - external port 80, internal port 10180)
```

#### Volume Mounts
```yaml
volumes:
  - ./data:/app/data          # Database and persistent storage
  - ./logs:/app/logs          # Application logs
  - ./uploads:/app/uploads    # File uploads (optional)
  - ./ssl:/app/ssl:ro         # SSL certificates (optional)
```

### 🌐 First-Time Setup

The container includes the web-based setup wizard:

1. **Start Container**: `docker-compose up -d`
2. **Check Logs**: `docker-compose logs -f`
3. **Setup Wizard**: Navigate to `http://localhost:10180` (same port as main app!)
4. **Complete Setup**: Follow the guided configuration
5. **Seamless Transition**: Setup completes → main server starts → automatic redirect to login
6. **Ready to Use**: Login with your admin credentials - no manual steps!

### 📊 Accessing Your Platform

- **Web Dashboard**: `http://localhost:10180`
- **Admin Login**: `admin` / `your-password`
- **API Endpoint**: `http://localhost:10180/api`
- **Health Check**: `http://localhost:10180/api/health`

### 🔍 Monitoring

#### Container Health
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Container stats
docker stats enhanced-logging-platform
```

#### Application Health
```bash
# Built-in health check
curl http://localhost:10180/api/health

# System statistics
curl http://localhost:10180/api/stats
```

### 🗄️ Data Persistence

All important data is stored in mounted volumes:

```
./data/
├── databases/           # SQLite databases
├── setup-complete.json  # Setup status
└── backups/            # Automatic backups

./logs/
├── system.log          # Application logs
├── access.log          # HTTP access logs
└── error.log           # Error logs
```

### 🔄 Updates

#### Update to Latest Version
```bash
# Pull latest image
docker-compose pull

# Recreate container
docker-compose up -d
```

#### Backup Before Update
```bash
# Backup data directory
tar -czf logging-backup-$(date +%Y%m%d).tar.gz data/

# Or use built-in backup
docker-compose exec enhanced-logging-platform npm run backup
```

### 🛠️ Troubleshooting

#### Container Won't Start
```bash
# Check container logs
docker-compose logs enhanced-logging-platform

# Check port availability
netstat -tlnp | grep 10180

# Verify environment file
cat .env
```

#### Port Configuration Issues
```bash
# Symptom: Connection refused or container not accessible
# Check if Docker port mapping matches internal port

# 1. Verify internal port in .env
grep "PORT=" .env

# 2. Check Docker port mapping
docker port enhanced-logging-platform

# 3. Fix mismatched ports
# If .env shows PORT=8080 but docker-compose.yml shows "10180:10180"
# Either change .env to PORT=10180 OR change docker-compose.yml to "8080:8080"

# 4. Restart after fixing
docker-compose down && docker-compose up -d
```

#### Setup Issues
```bash
# Reset setup (removes setup marker)
rm -f data/setup-complete.json

# Restart container to trigger setup again
docker-compose restart
```

#### Performance Issues
```bash
# Check resource usage
docker stats enhanced-logging-platform

# Adjust memory limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '0.5'
```

### 🔐 Security Considerations

#### Production Deployment
1. **Change Default Password**: Set strong `AUTH_PASSWORD`
2. **Use HTTPS**: Configure SSL certificates
3. **Firewall**: Restrict port 10180 access
4. **Updates**: Keep container image updated
5. **Backups**: Regular automated backups

#### SSL Configuration
```yaml
environment:
  - USE_HTTPS=true
  - SSL_CERT_PATH=/app/ssl/cert.pem
  - SSL_KEY_PATH=/app/ssl/key.pem
volumes:
  - ./ssl:/app/ssl:ro
```

### 🏢 Unraid Deployment

#### Community Applications
1. Search for "Enhanced Logging Platform"
2. Click Install
3. Configure:
   - **Port**: 10180
   - **Host Path**: `/mnt/user/appdata/logging-server`
   - **Password**: Set secure password

#### Manual Unraid Template
```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>Enhanced-Logging-Platform</Name>
  <Repository>rejavarti/rejavartis_logging_server:latest</Repository>
  <Registry>https://hub.docker.com/r/rejavarti/rejavartis_logging_server</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://github.com/rejavarti/logging_server</Support>
  <Project>https://hub.docker.com/r/rejavarti/rejavartis_logging_server</Project>
  <Overview>Enterprise Universal Logging Platform with Web Dashboard</Overview>
  <Category>Tools:HomeAutomation Network:Other Status:Stable</Category>
  <WebUI>http://[IP]:[PORT:10180]/</WebUI>
  <TemplateURL/>
  <Icon>https://raw.githubusercontent.com/rejavarti/logging_server/main/public/favicon.svg</Icon>
  <Config Name="Web Port" Target="10180" Default="10180" Mode="tcp" Description="Web interface port" Type="Port" Display="always" Required="true" Mask="false">10180</Config>
  <Config Name="Data Directory" Target="/app/data" Default="/mnt/user/appdata/logging-server/data" Mode="rw" Description="Persistent data storage" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/logging-server/data</Config>
  <Config Name="Log Directory" Target="/app/logs" Default="/mnt/user/appdata/logging-server/logs" Mode="rw" Description="Application logs" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/logging-server/logs</Config>
  <Config Name="Admin Password" Target="AUTH_PASSWORD" Default="ChangeMe123!" Mode="" Description="Admin account password (CHANGE THIS!)" Type="Variable" Display="always" Required="true" Mask="true">ChangeMe123!</Config>
  <Config Name="Timezone" Target="TZ" Default="America/Denver" Mode="" Description="Container timezone" Type="Variable" Display="advanced" Required="false" Mask="false">America/Denver</Config>
</Container>
```

### 📈 Scaling

#### Multiple Instances
```yaml
# docker-compose.yml for multiple instances
services:
  logging-primary:
    # ... primary instance config
    ports:
      - "10180:10180"
  
  logging-secondary:
    # ... secondary instance config  
    ports:
      - "10181:10180"
```

#### Load Balancer
```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - logging-primary
      - logging-secondary
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
```

### 📞 Support

- **Documentation**: Check included `INITIAL_SETUP.md`
- **Health Validation**: Run `docker-compose exec enhanced-logging-platform npm run validate`
- **Container Logs**: `docker-compose logs -f enhanced-logging-platform`
- **Issues**: Check GitHub repository or Docker Hub page