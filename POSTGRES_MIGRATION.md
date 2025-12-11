# PostgreSQL Migration Guide

## Why PostgreSQL?

SQLite has a fundamental limitation: **it cannot reliably work with network filesystems** like Unraid SMB shares. This causes `SQLITE_CANTOPEN` errors because SQLite's locking mechanism creates files (WAL, SHM, or journal files) that don't work properly over SMB/CIFS.

PostgreSQL solves this by:
- ✅ Running as a separate service with its own storage
- ✅ Handling concurrent connections properly
- ✅ Working perfectly with any storage backend
- ✅ Better performance for large datasets
- ✅ Superior data integrity and ACID compliance

## Quick Start with Docker Compose

1. **Create environment file**:
```bash
# .env file
POSTGRES_PASSWORD=YourSecurePostgresPassword123!
JWT_SECRET=your-jwt-secret-here
AUTH_PASSWORD=Admin123!
```

2. **Start the stack**:
```bash
docker-compose -f docker-compose.postgres.yml up -d
```

3. **Access the application**:
- Web UI: http://your-server:10180/dashboard
- Login: admin / Admin123!

## Manual Unraid Setup

### Option 1: Docker Compose (Recommended)

1. **Install Docker Compose** on Unraid (via Nerd Tools)

2. **Create directory**:
```bash
mkdir -p /mnt/user/appdata/logging-server-postgres
cd /mnt/user/appdata/logging-server-postgres
```

3. **Copy files**:
   - `docker-compose.postgres.yml`
   - `.env` with your passwords

4. **Start**:
```bash
docker-compose -f docker-compose.postgres.yml up -d
```

### Option 2: Separate Containers

**1. Start PostgreSQL**:
```bash
docker run -d \
  --name logging-server-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=logging_server \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=YourSecurePassword123! \
  -v /mnt/user/appdata/logging-server-postgres/data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine
```

**2. Initialize schema**:
```bash
docker exec -i logging-server-postgres psql -U postgres -d logging_server < migrations/postgres-schema.sql
```

**3. Start logging server**:
```bash
docker run -d \
  --name logging-server \
  --restart unless-stopped \
  --link logging-server-postgres:postgres \
  -e DB_TYPE=postgres \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=logging_server \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=YourSecurePassword123! \
  -e TZ=America/Edmonton \
  -e JWT_SECRET=your-jwt-secret \
  -e AUTH_PASSWORD=Admin123! \
  -p 10180:10180 \
  -p 8081:8081 \
  -p 8082:8082 \
  rejavarti/logging-server:latest
```

## Migration from SQLite

### Export existing data:
```bash
# Backup SQLite database
docker cp Rejavarti-Logging-Server:/app/data/databases/enterprise_logs.db ./backup.db

# Export to SQL
sqlite3 backup.db .dump > backup.sql
```

### Convert and import:
```bash
# Use the migration script (coming soon)
node scripts/sqlite-to-postgres.js backup.sql
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_TYPE` | No | `sqlite` | Set to `postgres` to use PostgreSQL |
| `POSTGRES_HOST` | Yes* | `localhost` | PostgreSQL server hostname |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL server port |
| `POSTGRES_DB` | Yes* | `logging_server` | Database name |
| `POSTGRES_USER` | Yes* | `postgres` | Database user |
| `POSTGRES_PASSWORD` | Yes* | - | Database password |

*Required when `DB_TYPE=postgres`

## Performance Tuning

### PostgreSQL Configuration

Edit `postgresql.conf` for better performance:

```conf
# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 16MB

# WAL
wal_buffers = 16MB
checkpoint_completion_target = 0.9
max_wal_size = 1GB

# Query Planning
random_page_cost = 1.1
effective_io_concurrency = 200
```

## Backup and Restore

### Automated Backups:
```bash
#!/bin/bash
# Add to cron: 0 2 * * * /path/to/backup.sh
docker exec logging-server-postgres pg_dump -U postgres logging_server | gzip > /mnt/user/backups/logging_server_$(date +%Y%m%d).sql.gz
```

### Restore:
```bash
gunzip -c backup.sql.gz | docker exec -i logging-server-postgres psql -U postgres -d logging_server
```

## Monitoring

### Check PostgreSQL status:
```bash
docker exec logging-server-postgres psql -U postgres -d logging_server -c "
  SELECT 
    schemaname, 
    tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

### Connection pool stats:
```bash
docker logs logging-server | grep postgres
```

## Troubleshooting

### "Connection refused"
- Check PostgreSQL is running: `docker ps | grep postgres`
- Verify network: `docker exec logging-server ping postgres`
- Check password in environment variables

### "relation does not exist"
- Run schema migration: `docker exec -i logging-server-postgres psql -U postgres -d logging_server < migrations/postgres-schema.sql`

### Slow queries
- Enable query logging in PostgreSQL
- Analyze query plans: `EXPLAIN ANALYZE SELECT ...`
- Add indexes for frequently queried columns

## Rollback to SQLite

If you need to revert:

1. Remove `DB_TYPE=postgres` from environment
2. Restart container with SQLite volume mount
3. Data will not be preserved - restore from backup

## Support

For issues or questions:
- GitHub Issues: https://github.com/rejavarti/logging_server/issues
- Documentation: See README.md
