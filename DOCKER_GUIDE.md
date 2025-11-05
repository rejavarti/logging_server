# 🐳 Docker Deployment Guide

## Quick Start

### Option 1: Automatic Setup (Recommended)
```bash
# Run with environment variables for zero-touch deployment
docker run -d \
  --name logging-server \
  -p 10180:10180 \
  -e AUTH_PASSWORD=YourSecurePassword123 \
  -e NODE_ENV=production \
  -v logging-data:/app/data \
  logging-server
```

### Option 2: Interactive Setup
```bash
# Run without environment variables for web-based setup
docker run -d \
  --name logging-server \
  -p 10180:10180 \
  -v logging-data:/app/data \
  logging-server
```

Then open: http://localhost:10180

---

## 🚀 Deployment Options

### Development Mode
```bash
docker run -it --rm \
  --name logging-server-dev \
  -p 10180:10180 \
  -v "$(pwd)/data":/app/data \
  logging-server
```

### Production Mode
```bash
docker run -d \
  --name logging-server-prod \
  -p 10180:10180 \
  -e AUTH_PASSWORD=SecurePassword123 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  -v logging-data:/app/data \
  logging-server
```

### Docker Compose
```yaml
version: '3.8'
services:
  logging-server:
    image: logging-server
    container_name: logging-server
    ports:
      - "10180:10180"
    environment:
      - AUTH_PASSWORD=YourSecurePassword123
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - logging-data:/app/data
    restart: unless-stopped

volumes:
  logging-data:
```

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_PASSWORD` | No* | - | Admin password (enables auto-setup) |
| `NODE_ENV` | No | development | Environment mode |
| `LOG_LEVEL` | No | debug | Logging verbosity |
| `SESSION_SECRET` | No | auto-generated | Session encryption key |
| `JWT_SECRET` | No | auto-generated | JWT token encryption |

\* **Required for automatic setup, optional for interactive setup**

---

## 🔒 Security Features

### Automatic Security
- ✅ Environment file permissions automatically set to 600
- ✅ Secure password hashing with bcrypt
- ✅ JWT token-based authentication
- ✅ Session management with secure cookies
- ✅ Input validation and sanitization

### Manual Security Tools
```bash
# Check environment file security
docker exec logging-server node env-security.js check

# Create encrypted backup
docker exec logging-server node env-security.js backup-encrypted MyPassword123

# Restore from backup
docker exec logging-server node env-security.js restore MyPassword123
```

---

## 📊 Port Configuration

**Single Port Design**: Port `10180` is used for both setup and main application

- **Setup Phase**: Web wizard at http://localhost:10180
- **Main Application**: Server automatically starts at same port after setup
- **No Manual Restart**: Seamless transition from setup to login

---

## 🔄 Container Management

### Start/Stop
```bash
# Start container
docker start logging-server

# Stop container
docker stop logging-server

# Restart container
docker restart logging-server
```

### Logs and Debugging
```bash
# View real-time logs
docker logs -f logging-server

# View last 100 lines
docker logs --tail 100 logging-server

# Access container shell
docker exec -it logging-server /bin/bash
```

### Data Management
```bash
# Backup data volume
docker run --rm -v logging-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/logging-data-backup.tar.gz -C /data .

# Restore data volume
docker run --rm -v logging-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/logging-data-backup.tar.gz -C /data
```

---

## 🏗️ Building from Source

### Build Image
```bash
# Standard build
docker build -t logging-server .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t logging-server .
```

### Development Build
```bash
# Build with development dependencies
docker build --target development -t logging-server-dev .
```

---

## 🚨 Troubleshooting

### Container Won't Start
```bash
# Check container status
docker ps -a

# View startup logs
docker logs logging-server

# Check port conflicts
netstat -tulpn | grep 10180
```

### Setup Issues
```bash
# Force recreation of setup
docker exec logging-server rm -f /app/data/setup-complete.json
docker restart logging-server
```

### Permission Problems
```bash
# Fix data directory permissions
docker exec logging-server chown -R node:node /app/data
docker exec logging-server chmod 755 /app/data
```

### Reset Everything
```bash
# Complete reset (WARNING: Deletes all data)
docker stop logging-server
docker rm logging-server
docker volume rm logging-data
```

---

## 🔧 Advanced Configuration

### Custom Configuration
```bash
# Mount custom config
docker run -d \
  --name logging-server \
  -p 10180:10180 \
  -v $(pwd)/config:/app/config \
  -v logging-data:/app/data \
  logging-server
```

### Health Checks
```yaml
# Docker Compose with health check
version: '3.8'
services:
  logging-server:
    image: logging-server
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:10180/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Resource Limits
```bash
# Run with resource constraints
docker run -d \
  --name logging-server \
  --memory="512m" \
  --cpus="0.5" \
  -p 10180:10180 \
  logging-server
```

---

## 🌐 Integration Examples

### Behind Reverse Proxy (nginx)
```nginx
server {
    listen 80;
    server_name logging.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:10180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Docker Swarm
```yaml
version: '3.8'
services:
  logging-server:
    image: logging-server
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    ports:
      - "10180:10180"
    environment:
      - AUTH_PASSWORD=SecurePassword123
```

---

## 📞 Support

- 📖 **Documentation**: [README.md](README.md)
- 🐛 **Issues**: Check container logs first
- 🔧 **Configuration**: Use environment variables or web setup
- 🔒 **Security**: Built-in security tools available

**Professional Installation Experience with Enterprise-Grade Security** ✨