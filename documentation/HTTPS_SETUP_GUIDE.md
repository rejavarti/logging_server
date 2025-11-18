# 🔒 HTTPS Setup Guide

This guide explains how to enable HTTPS/SSL for the Enhanced Universal Logging Server.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Self-Signed Certificates (Development/Local)](#self-signed-certificates)
3. [Let's Encrypt Certificates (Production)](#lets-encrypt-certificates)
4. [Docker Configuration](#docker-configuration)
5. [Unraid Configuration](#unraid-configuration)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## ✅ Prerequisites

- Docker installed and running
- OpenSSL (included in most Linux distributions and Docker containers)
- For production: A domain name pointing to your server

---

## 🔐 Self-Signed Certificates (Development/Local)

Perfect for local network use or testing. Browser will show a warning (this is normal).

### Method 1: Quick Generation

```bash
# Create SSL directory
mkdir -p /mnt/user/appdata/logging-server/ssl
cd /mnt/user/appdata/logging-server/ssl

# Generate self-signed certificate (valid for 1 year)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Set proper permissions
chmod 644 cert.pem
chmod 600 key.pem
```

### Method 2: Interactive Generation

```bash
# Create SSL directory
mkdir -p /mnt/user/appdata/logging-server/ssl
cd /mnt/user/appdata/logging-server/ssl

# Generate certificate with prompts
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365

# Answer the prompts:
# Country Name: US
# State: Your State
# Locality: Your City
# Organization: Your Company/Name
# Common Name: localhost (or your server's IP/hostname)
# Email: your@email.com
```

### Method 3: Certificate with SAN (Multiple Domains)

```bash
# Create config file
cat > san.cnf << EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=Colorado
L=Denver
O=Home Network
CN=logging-server.local

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = logging-server.local
IP.1 = 192.168.222.3
IP.2 = 127.0.0.1
EOF

# Generate certificate
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -config san.cnf \
  -extensions v3_req

# Set permissions
chmod 644 cert.pem
chmod 600 key.pem
```

---

## 🌐 Let's Encrypt Certificates (Production)

For internet-facing servers with a domain name. Automatically trusted by browsers.

### Prerequisites

- Public IP address
- Domain name (e.g., logging.example.com)
- Port 80 and 443 open on your router/firewall

### Method 1: Certbot (Standalone)

```bash
# Install Certbot
apt-get update
apt-get install certbot

# Generate certificate
certbot certonly --standalone -d logging.example.com

# Copy certificates to Docker directory
mkdir -p /mnt/user/appdata/logging-server/ssl
cp /etc/letsencrypt/live/logging.example.com/fullchain.pem \
   /mnt/user/appdata/logging-server/ssl/cert.pem
cp /etc/letsencrypt/live/logging.example.com/privkey.pem \
   /mnt/user/appdata/logging-server/ssl/key.pem

# Set permissions
chmod 644 /mnt/user/appdata/logging-server/ssl/cert.pem
chmod 600 /mnt/user/appdata/logging-server/ssl/key.pem
```

### Method 2: Certbot with Webroot

```bash
# Generate certificate (server must be running on port 80)
certbot certonly --webroot \
  -w /var/www/html \
  -d logging.example.com

# Copy and set permissions as above
```

### Auto-Renewal Setup

```bash
# Create renewal hook
cat > /etc/letsencrypt/renewal-hooks/deploy/copy-to-docker.sh << 'EOF'
#!/bin/bash
cp /etc/letsencrypt/live/logging.example.com/fullchain.pem \
   /mnt/user/appdata/logging-server/ssl/cert.pem
cp /etc/letsencrypt/live/logging.example.com/privkey.pem \
   /mnt/user/appdata/logging-server/ssl/key.pem
chmod 644 /mnt/user/appdata/logging-server/ssl/cert.pem
chmod 600 /mnt/user/appdata/logging-server/ssl/key.pem
docker restart rejavarti-logging-server
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-to-docker.sh

# Test renewal
certbot renew --dry-run
```

---

## 🐳 Docker Configuration

### Update docker-compose.yml

```yaml
services:
  logging-server:
    image: rejavarti/rejavartis_logging_server:latest
    container_name: rejavarti-logging-server
    restart: unless-stopped
    
    ports:
      - "443:10180"  # Map HTTPS port
      # or keep original: "10180:10180"
    
    volumes:
      - /mnt/user/appdata/logging-server/data:/app/data
      - /mnt/user/appdata/logging-server/logs:/app/logs
      - /mnt/user/appdata/logging-server/ssl:/app/ssl:ro  # SSL certificates
      - /etc/localtime:/etc/localtime:ro
    
    environment:
      - NODE_ENV=production
      - PORT=10180
      - TZ=America/Denver
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=YourSecurePassword!
      
      # Enable HTTPS
      - USE_HTTPS=true
      - SSL_CERT_PATH=/app/ssl/cert.pem
      - SSL_KEY_PATH=/app/ssl/key.pem
```

### Start with HTTPS

```bash
# Stop existing container
docker-compose down

# Pull latest image (with HTTPS support)
docker-compose pull

# Start with new configuration
docker-compose up -d

# Check logs
docker-compose logs -f
```

---

## 🖥️ Unraid Configuration

### GUI Method

1. **Stop Container**: Click "Stop" on the logging-server container

2. **Edit Container**: Click the container icon and select "Edit"

3. **Add SSL Volume Path**:
   - Click "Add another Path"
   - Config Type: `Path`
   - Name: `SSL Certificates`
   - Container Path: `/app/ssl`
   - Host Path: `/mnt/user/appdata/logging-server/ssl`
   - Access Mode: `Read Only`

4. **Add HTTPS Environment Variables**:
   - Click "Add another Variable"
   - Config Type: `Variable`
   - Name: `USE_HTTPS`
   - Key: `USE_HTTPS`
   - Value: `true`
   
   - Click "Add another Variable"
   - Config Type: `Variable`
   - Name: `SSL_CERT_PATH`
   - Key: `SSL_CERT_PATH`
   - Value: `/app/ssl/cert.pem`
   
   - Click "Add another Variable"
   - Config Type: `Variable`
   - Name: `SSL_KEY_PATH`
   - Key: `SSL_KEY_PATH`
   - Value: `/app/ssl/key.pem`

5. **Update Port Mapping** (optional):
   - Change Host Port from `10180` to `443` for standard HTTPS

6. **Save and Start**: Click "Apply" then start the container

### Command Line Method

```bash
# SSH into Unraid
ssh root@192.168.222.3

# Create SSL directory and generate certificates
mkdir -p /mnt/user/appdata/logging-server/ssl
cd /mnt/user/appdata/logging-server/ssl

# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -subj "/C=US/ST=Colorado/L=Denver/O=Home/CN=192.168.222.3"

# Set permissions
chmod 644 cert.pem
chmod 600 key.pem

# Stop and remove old container
docker stop rejavarti-logging-server
docker rm rejavarti-logging-server

# Pull latest image
docker pull rejavarti/rejavartis_logging_server:latest

# Start with HTTPS
docker run -d \
  --name rejavarti-logging-server \
  --restart unless-stopped \
  -p 10180:10180 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -v /mnt/user/appdata/logging-server/logs:/app/logs \
  -v /mnt/user/appdata/logging-server/ssl:/app/ssl:ro \
  -v /etc/localtime:/etc/localtime:ro \
  -e NODE_ENV=production \
  -e PORT=10180 \
  -e TZ=America/Denver \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=YourPassword \
  -e USE_HTTPS=true \
  -e SSL_CERT_PATH=/app/ssl/cert.pem \
  -e SSL_KEY_PATH=/app/ssl/key.pem \
  rejavarti/rejavartis_logging_server:latest
```

---

## ✅ Verification

### Check Server Logs

```bash
# Docker Compose
docker-compose logs | grep -i https

# Docker
docker logs rejavarti-logging-server | grep -i https

# Expected output:
# 🔒 HTTPS Server running on port 10180
# 🌐 Dashboard: https://localhost:10180/dashboard
```

### Test HTTPS Connection

```bash
# Test with curl (ignore self-signed certificate warning)
curl -k https://localhost:10180/health

# Expected response:
# {"status":"healthy","uptime":123,"version":"2.1.0-stable-enhanced"}
```

### Browser Access

1. **Open Dashboard**: `https://192.168.222.3:10180/dashboard`
2. **Certificate Warning**: For self-signed certificates, click "Advanced" → "Proceed to site"
3. **Login**: Enter your admin credentials
4. **Verify**: Look for 🔒 lock icon in browser address bar

### Check Certificate Details

```bash
# View certificate information
openssl x509 -in /mnt/user/appdata/logging-server/ssl/cert.pem -text -noout

# Check expiration date
openssl x509 -in /mnt/user/appdata/logging-server/ssl/cert.pem -noout -dates
```

---

## 🔧 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs logging-server

# Common issues:
# 1. Certificate files not found
# 2. Incorrect file permissions
# 3. Invalid certificate format
```

### "HTTPS requested but certificates not found"

```bash
# Verify files exist
ls -la /mnt/user/appdata/logging-server/ssl/

# Should show:
# -rw-r--r-- 1 user user cert.pem
# -rw------- 1 user user key.pem

# If missing, generate certificates (see above)
```

### "Permission Denied" Errors

```bash
# Fix permissions
cd /mnt/user/appdata/logging-server/ssl
chmod 644 cert.pem
chmod 600 key.pem
chown 1001:1001 *.pem  # Match container user
```

### Browser Shows Certificate Error

**For Self-Signed Certificates**: This is normal. Click "Advanced" → "Proceed"

**To Avoid Warning**:
1. Use Let's Encrypt (production)
2. Add certificate to browser's trusted certificates
3. Use a reverse proxy (Nginx Proxy Manager, Traefik)

### Mixed Content Warnings

If some resources fail to load:

```javascript
// Update ESP32/client code to use https://
const char* serverUrl = "https://192.168.222.3:10180/log";
```

### Fall Back to HTTP

If HTTPS causes issues:

```bash
# Edit docker-compose.yml
environment:
  - USE_HTTPS=false  # Change to false

# Restart
docker-compose restart
```

---

## 📊 Port Configuration

### Standard Ports

| Protocol | Standard Port | Custom Port | Usage |
|----------|--------------|-------------|-------|
| HTTP     | 80           | 10180       | Unencrypted |
| HTTPS    | 443          | 10180       | Encrypted |

### Recommended Port Mappings

**Internal Network** (no external access):
```yaml
ports:
  - "10180:10180"  # Custom port, HTTP or HTTPS
```

**External Access** (internet-facing):
```yaml
ports:
  - "443:10180"     # Standard HTTPS port
  # or
  - "8443:10180"    # Alternative HTTPS port
```

---

## 🔐 Security Best Practices

1. **Strong Certificates**: Use 4096-bit RSA keys minimum
2. **Regular Rotation**: Renew certificates before expiration
3. **Secure Permissions**: 
   - cert.pem: 644 (readable)
   - key.pem: 600 (owner only)
4. **Strong Passwords**: Change default AUTH_PASSWORD
5. **Firewall Rules**: Only expose necessary ports
6. **Regular Updates**: Keep Docker image updated
7. **Monitor Logs**: Check for unauthorized access attempts

---

## 🎯 Quick Reference

### Generate Self-Signed Certificate (One-liner)

```bash
mkdir -p /mnt/user/appdata/logging-server/ssl && cd $_ && openssl req -x509 -newkey rsa:4096 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost" && chmod 644 cert.pem && chmod 600 key.pem
```

### Enable HTTPS (docker-compose)

```bash
# Edit docker-compose.yml, change:
- USE_HTTPS=false
# to:
- USE_HTTPS=true

# Restart
docker-compose down && docker-compose up -d
```

### Disable HTTPS (docker-compose)

```bash
# Edit docker-compose.yml, change:
- USE_HTTPS=true
# to:
- USE_HTTPS=false

# Restart
docker-compose restart
```

---

## 📚 Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Docker Networking Guide](https://docs.docker.com/network/)
- [Unraid Docker Documentation](https://unraid.net/community/apps)

---

## 💡 Tips

- **Development**: Use HTTP or self-signed certificates
- **Production**: Use Let's Encrypt for automatically trusted certificates
- **Local Network**: Self-signed certificates are fine
- **Internet Access**: Always use valid certificates (Let's Encrypt)
- **Reverse Proxy**: Consider Nginx Proxy Manager or Traefik for easier management
- **Certificate Expiration**: Set calendar reminders for renewal

---

**Questions or Issues?** Check the [main README](README.md) or [create an issue](https://github.com/rejavarti/logging-server/issues).
