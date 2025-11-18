# Logging Server API Consistency Checklist

![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)

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
