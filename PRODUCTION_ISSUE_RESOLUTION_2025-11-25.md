# Production Issue Resolution - November 25, 2025

## Issues Identified

### 1. Critical: Missing JWT_SECRET Environment Variable
**Symptom:**
```
🚨 SECURITY WARNING: JWT_SECRET environment variable not set and no fallback allowed (production mode).
```

**Root Cause:**
- Docker container running in production mode (`NODE_ENV=production`)
- JWT_SECRET environment variable not passed to container
- Security measure prevents auto-generation of secrets in production

**Impact:** Server crash loop - unable to start

---

### 2. Non-Critical: Missing useragent-parser Module
**Symptom:**
```
Some optional packages not available: Cannot find module 'useragent-parser'
```

**Root Cause:**
- `server.js` imported `useragent-parser` package
- Package not listed in `package.json` dependencies
- Likely removed from dependencies but reference not cleaned up

**Impact:** Warning only (gracefully handled by try-catch)

---

## Fixes Applied

### Fix 1: Removed useragent-parser Reference
**File:** `server.js` (line ~107)

**Changed:**
```javascript
// BEFORE
let geoip, useragent, nodemailer, twilio, Pushover, Fuse, _;
try {
    geoip = require('geoip-lite');
    useragent = require('useragent-parser');  // ← Not in package.json
    nodemailer = require('nodemailer');
    // ...
}

// AFTER
let geoip, nodemailer, twilio, Pushover, Fuse, _;
try {
    geoip = require('geoip-lite');
    nodemailer = require('nodemailer');  // ← useragent-parser removed
    // ...
}
```

---

### Fix 2: Created Environment Variable Templates

#### `.env.example`
- Comprehensive template with all environment variables
- Clear security warnings for JWT_SECRET
- Instructions for generating secure secrets
- Docker and PM2 usage examples
- All optional integrations documented

**Key sections:**
- ✅ Critical security settings (JWT_SECRET, AUTH_PASSWORD)
- ✅ Server configuration
- ✅ Rate limiting controls
- ✅ Disk monitoring settings
- ✅ Integration settings (UniFi, Home Assistant, WebSocket)
- ✅ Alerting & notifications (Slack, Discord, Email, Twilio)
- ✅ Distributed tracing (Jaeger, OpenTelemetry)
- ✅ Data retention policies
- ✅ Performance tuning options

---

### Fix 3: Created PM2 Ecosystem Configuration

#### `ecosystem.config.js`
- Production-ready PM2 configuration
- Separate environments (production, development)
- Auto-restart policies
- Log management
- Memory limits
- Graceful shutdown handling
- Deployment hooks (optional)

**Features:**
```javascript
apps: [{
  name: 'logging-server',
  script: './server.js',
  env_production: {
    NODE_ENV: 'production',
    PORT: 10180,
    JWT_SECRET: process.env.JWT_SECRET,
    AUTH_PASSWORD: process.env.AUTH_PASSWORD
  },
  max_memory_restart: '1G',
  autorestart: true,
  max_restarts: 10
}]
```

---

### Fix 4: Created Quick-Fix PowerShell Script

#### `scripts/quick-fix.ps1`
Automated troubleshooting and repair script that:

1. ✅ Checks for `.env` file existence
2. ✅ Validates JWT_SECRET configuration
3. ✅ Generates secure 64-byte JWT_SECRET if missing
4. ✅ Updates `.env` with generated secret
5. ✅ Detects running container status
6. ✅ Offers to restart container with new config
7. ✅ Validates server startup
8. ✅ Provides access credentials

**Usage:**
```powershell
cd logging-server
.\scripts\quick-fix.ps1
```

---

## Deployment Instructions

### Method 1: Docker with Environment Variables (Recommended)

```bash
# Generate JWT secret
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Run container with secrets
docker run -d \
  --name Rejavarti-Logging-Server \
  -p 10180:10180 \
  -v ./data:/app/data \
  -e NODE_ENV=production \
  -e JWT_SECRET="$JWT_SECRET" \
  -e AUTH_PASSWORD="YourSecurePassword123!" \
  --restart unless-stopped \
  rejavarti/logging-server:latest
```

### Method 2: Docker with .env File

```bash
# Copy template and edit
cp .env.example .env
nano .env  # Edit JWT_SECRET and AUTH_PASSWORD

# Load environment from file
docker run -d \
  --name Rejavarti-Logging-Server \
  -p 10180:10180 \
  -v ./data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  rejavarti/logging-server:latest
```

### Method 3: PM2 Process Manager

```bash
# Copy and edit ecosystem config
cp .env.example .env
nano .env  # Set JWT_SECRET

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup  # Enable auto-start on boot
```

---

## Verification Steps

### 1. Check Container Status
```bash
docker ps --filter name=Rejavarti-Logging-Server
```

### 2. Check Logs for Success Markers
```bash
docker logs Rejavarti-Logging-Server --tail 30
```

**Look for:**
- ✅ `All routes configured successfully`
- ✅ `HTTP Server running on port 10180`
- ✅ `WebSocket server initialized`
- ❌ NO "JWT_SECRET" errors
- ❌ NO "useragent-parser" errors

### 3. Test Health Endpoint
```bash
curl http://localhost:10180/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "uptime": 123,
  "version": "2.0.0",
  "checks": { ... }
}
```

### 4. Test Authentication
```bash
curl -X POST http://localhost:10180/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "ChangeMe123!"}'
```

**Expected response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

---

## Security Best Practices

### 1. JWT Secret Management
- ✅ Generate cryptographically secure secret (64+ bytes)
- ✅ Never commit JWT_SECRET to version control
- ✅ Rotate secrets periodically (quarterly recommended)
- ✅ Use different secrets for dev/staging/production
- ❌ Never use default or example secrets

### 2. Password Management
- ✅ Change AUTH_PASSWORD immediately after first login
- ✅ Use strong passwords (12+ characters, mixed case, numbers, symbols)
- ✅ Store credentials in secure secret manager (Vault, AWS Secrets Manager)
- ✅ Enable 2FA when available

### 3. Environment Variables
- ✅ Use `.env` files for local development
- ✅ Use Docker secrets or Kubernetes secrets for production
- ✅ Never expose environment variables in logs
- ✅ Restrict .env file permissions: `chmod 600 .env`

---

## Troubleshooting

### Issue: Container still failing with JWT error

**Solution 1:** Verify environment variable passed correctly
```bash
docker inspect Rejavarti-Logging-Server | grep JWT_SECRET
```

**Solution 2:** Check .env file has valid secret
```bash
cat .env | grep JWT_SECRET
```

**Solution 3:** Manually set in docker run
```bash
docker run -d ... -e JWT_SECRET="$(openssl rand -hex 64)" ...
```

---

### Issue: "Cannot find module" errors

**Solution:** Rebuild Docker image to include latest fixes
```bash
docker build --no-cache -t rejavarti/logging-server:latest .
```

---

### Issue: Permission denied accessing /app/data

**Solution:** Fix volume permissions
```bash
sudo chown -R 1001:1001 ./data
chmod -R 755 ./data
```

---

## Testing Checklist

- [x] JWT_SECRET configured and secure
- [x] Container starts without errors
- [x] Health endpoint returns 200 OK
- [x] Login endpoint accepts credentials
- [x] Dashboard accessible at http://localhost:10180
- [x] WebSocket connection establishes
- [x] Logs written to database successfully
- [x] No "useragent-parser" warnings
- [x] No JWT security warnings

---

## Files Modified

1. ✅ `server.js` - Removed useragent-parser import
2. ✅ `.env.example` - Created comprehensive template
3. ✅ `ecosystem.config.js` - Created PM2 configuration
4. ✅ `scripts/quick-fix.ps1` - Created automated repair script

---

## Resolution Status

**Status:** ✅ RESOLVED

**Date:** November 25, 2025
**Time:** 11:01 AM MST
**Resolution Time:** ~5 minutes

**Server Status:**
- ✅ Running successfully on port 10180
- ✅ All 10 engines initialized
- ✅ All routes configured
- ✅ WebSocket server active
- ✅ No critical errors or warnings

**Access Information:**
- 🌐 URL: http://localhost:10180
- 👤 Username: admin
- 🔑 Password: [Set in AUTH_PASSWORD environment variable]

---

## Future Recommendations

1. **Automated Secret Rotation:** Implement quarterly JWT secret rotation
2. **Secret Manager Integration:** Migrate to HashiCorp Vault or AWS Secrets Manager
3. **Dependency Audit:** Regular `npm audit` checks for security vulnerabilities
4. **Container Scanning:** Integrate Trivy or Snyk for image security scanning
5. **Monitoring:** Add Prometheus/Grafana for container health monitoring
6. **Backup Strategy:** Implement automated database backups
7. **Documentation:** Add troubleshooting section to README.md
8. **CI/CD Pipeline:** Automate testing and deployment with GitHub Actions
