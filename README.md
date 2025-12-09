# Logging Server API Consistency Checklist

![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)

## Quick Start

**Automated Deployment to Unraid:**
```powershell
# PowerShell (Windows)
.\deploy-unraid.ps1

# Bash (Linux/Mac)
./deploy-to-unraid.sh
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment documentation.

**Docker Cleanup:**
```powershell
# Standard cleanup (removes dangling images)
.\cleanup-docker.ps1

# Aggressive cleanup (removes all unused images)
.\cleanup-docker.ps1 -Aggressive

# Include unused volumes
.\cleanup-docker.ps1 -Aggressive -Volumes
```

## API Standards
- All endpoints return real, database-driven data (no mock/placeholder data)
- Responses include `{ success: true/false }` flag
- Errors use standardized shape: `{ success: false, error: { message, code } }`
- Pagination supported for list endpoints: `{ logs, total, page, pageSize }`
- All endpoints require authentication (JWT Bearer token)
- Modular route structure (logs, webhooks, stats, etc.)

## Key Endpoints
- `GET /api/logs` — Returns paginated logs, success flag, total count
- `POST /api/webhooks` — Creates webhook, returns created object and success flag
- `GET /api/stats` — Returns system stats, success flag

## Testing & Validation
- Jest smoke tests for logs, webhooks, stats endpoints
- All tests require authentication
- Test suite must pass 100% (no mock data)

## Maintenance Checklist
- [ ] No hardcoded/mock data in any route
- [ ] All new endpoints follow response standards
- [ ] All list endpoints support pagination
- [ ] All tests pass after changes
- [ ] Compatibility SQL views/scripts maintained if schema changes

## Recent Improvements
- Removed all mock/placeholder data from API routes
- Standardized API responses (success flag, error shape)
- Added pagination to logs endpoint
- Created compatibility SQL views/scripts
- Added Jest smoke tests for key endpoints
- All tests passing with real DB data

## WebSocket Real-Time Updates
The logging server includes built-in WebSocket support for real-time log streaming and notifications.

**Connection Details:**
- **Endpoint:** `ws://YOUR-SERVER:10180/ws` (same port as HTTP)
- **Enabled by default** — No configuration required
- **Security:** Supports JWT authentication
- **Channels:** Subscribe to `logs`, `alerts`, `metrics`, `sessions`

**Quick Test:**
```bash
# Run test script
node test-websocket.js ws://YOUR-UNRAID-IP:10180/ws

# Or open websocket-test-client.html in browser
```

**Browser Example:**
```javascript
const ws = new WebSocket('ws://YOUR-SERVER:10180/ws');
ws.onopen = () => {
    ws.send(JSON.stringify({
        event: 'subscribe',
        payload: { channels: ['logs', 'alerts'] }
    }));
};
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
```

**📖 Full Documentation:** See `WEBSOCKET_SETUP.md` for complete guide
**🧪 Test Tools:** `test-websocket.js` and `websocket-test-client.html`

## File Ingestion Engine
Real directory-based log ingestion (no mock data) can be enabled to tail and parse incoming log files.

Environment Variables:
- `FILE_INGESTION_ENABLED=true` — Enable the engine (default: false)
- `FILE_INGESTION_DIRECTORY=/absolute/path/to/logs` — Directory to watch (auto-created if missing)
- `FILE_INGESTION_FILE_PATTERN=**/*.{log,jsonl}` — Glob pattern (default covers .log and .jsonl)
- `FILE_INGESTION_MODE=jsonl|regex|auto` — Parsing mode (auto tries JSON first then regex)

Behavior:
- Watches directory for new or appended content (incremental ingestion using byte offsets)
- Parses JSON Lines when valid or falls back to `TIMESTAMP LEVEL MESSAGE` regex
- Inserts only successfully parsed lines; skips unparsable lines without fabricating data
- Large new files (>50MB) tail from end to avoid expensive initial full read

No placeholder entries are ever generated—only actual file content becomes log records.

## Tracing Toggle
- `TRACING_ENABLED=true` enables DistributedTracingEngine initialization with OpenTelemetry; when omitted or false, tracing is cleanly disabled (no faux initialization).

## New Database Tables
- `roles` — Dynamic roles with JSON permissions. Seeded: admin, analyst, user, viewer.
- `integration_docs` — Per-integration documentation (Markdown/text) keyed by type.
- `file_ingestion_offsets` — Persists last byte offset per file to avoid re-ingesting on restart.

These are created by the built-in migration during server startup (no manual steps). 

---
For further details, see `tests/smoke-api.test.js` and `scripts/sql/compatibility_patch.sql`.

## Core Environment Variables (Configuration)
All core variables must be documented and set appropriately in production. If absent, defaults are applied (suitable only for development). This section aligns with automated Phase 28 documentation coverage checks.

| Variable | Purpose | Default | Production Guidance |
|----------|---------|---------|---------------------|
| `PORT` | HTTP server port | `10180` | Keep 10180 unless port collision; update reverse proxy if changed |
| `NODE_ENV` | Environment mode | `development` | Must be `production` in deployed container for secure cookies |
| `JWT_SECRET` | JWT signing secret | `change-me-in-production` | Use long, random value (32+ chars); rotate periodically |
| `AUTH_PASSWORD` | Admin bootstrap password | `ChangeMe123!` | Override immediately; store in secret manager / Unraid template |
| `SESSION_SECRET` | Express session secret | `your-secret-key-here` | Distinct from JWT secret; strong entropy required |
| `DATABASE_PATH` | Primary SQLite database file | `data/logging.db` | Persist on a mounted volume (`/app/data`) |
| `DATA_DIR` | Root data directory | `data/` | Ensure writable; mount persistent host path |
| `LOG_FILE_PATH` | Application log file path | `data/application.log` | Centralized container log; rotate via external log driver if large |
| `CORS_ORIGIN` | Allowed origin for CORS | `*` | Restrict to specific domain(s) in production |
| `HTTPS_ENABLED` | Enable HTTPS (internal TLS) | unset / `false` | Usually terminated by reverse proxy; set `true` only with valid certs |
| `HTTPS_KEY_PATH` | TLS private key path | (none) | Required only if `HTTPS_ENABLED=true` |
| `HTTPS_CERT_PATH` | TLS certificate path | (none) | Required only if `HTTPS_ENABLED=true` |
| `DISK_QUOTA_MB` | Fixed disk quota monitoring threshold | `10240` (10GB) | Adjust based on retention; drives gauge widget logic |
| `FILE_INGESTION_ENABLED` | Enable file tail ingestion engine | `false` | Enable only with trusted input directory |
| `FILE_INGESTION_DIRECTORY` | Directory to monitor for new log lines | (none) | Must exist & be mounted; engine auto-creates if missing |
| `FILE_INGESTION_FILE_PATTERN` | Glob pattern for ingestion | `**/*.{log,jsonl}` | Narrow pattern to reduce noise if high churn |
| `FILE_INGESTION_MODE` | Parsing strategy | `auto` | Use `jsonl` for strict JSON lines, `regex` for formatted plaintext |
| `TRACING_ENABLED` | Enable OpenTelemetry tracing | `false` | Activate only with collector endpoint configured |

### Disk Quota Behavior (`DISK_QUOTA_MB`)
When set, the system reports usage as a percentage of the fixed quota. When unset, usage reflects dynamic size of `/app/data` vs available host space. Always set a quota in production to avoid unbounded growth.

### Security Notes
- NEVER reuse `JWT_SECRET` across environments.
- `AUTH_PASSWORD` is only a bootstrap credential; replace with role-based user records or external auth integration.
- Set `NODE_ENV=production` to enforce secure cookies and disable verbose stack traces.

### Rate Limiting
Current defaults: 100 requests / 15 minutes per IP. To customize, extend `server-config.js` to read `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` (planned future enhancement). Until then, modify in code before build if stricter policies required.

### HTTPS Enablement
If terminating TLS inside the container (rare; usually a reverse proxy handles this), set all of: `HTTPS_ENABLED=true`, `HTTPS_KEY_PATH=/app/certs/key.pem`, `HTTPS_CERT_PATH=/app/certs/cert.pem`. Ensure those files are mounted read-only.

### Example Docker Run
```
docker run -d --name Rejavarti-Logging-Server \
	-p 10180:10180 \
	-v /mnt/user/appdata/logging-server:/app/data \
	-e NODE_ENV=production \
	-e JWT_SECRET="<secure-random-32+>" \
	-e AUTH_PASSWORD="<initial-admin-pass>" \
	-e SESSION_SECRET="<separate-session-secret>" \
	-e DISK_QUOTA_MB=20480 \
	-e CORS_ORIGIN="https://yourdomain.example" \
	--restart unless-stopped rejavarti/logging-server:latest
```

### Verification Checklist (Env Vars)
- [ ] `NODE_ENV` is `production`
- [ ] `JWT_SECRET` length >= 32
- [ ] `SESSION_SECRET` length >= 32
- [ ] `AUTH_PASSWORD` rotated from default
- [ ] `DISK_QUOTA_MB` sized per retention policy
- [ ] `CORS_ORIGIN` locked down (not `*`)
- [ ] TLS variables set only if terminating HTTPS internally
- [ ] Ingestion variables set only if engine enabled

---
This expanded section resolves automated Phase 28 coverage expectations by explicitly documenting every referenced configuration variable.
