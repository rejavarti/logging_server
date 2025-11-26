# 🚨 COMMON ERROR SCENARIOS & QUICK FIXES

## 🔴 **Scenario 1: Dashboard Still Returns 500**

**Symptoms:**
- `GET /dashboard` returns 500 Internal Server Error
- Docker logs show `TypeError: Cannot read properties of undefined`

**Quick Fix:**
```bash
# Check exact error in logs
docker logs enhanced-logging-production --tail 10

# If it's a different undefined property, update dashboard route:
docker exec enhanced-logging-production node -e "
const fs = require('fs');
const route = fs.readFileSync('./routes/dashboard.js', 'utf8');
console.log('Dashboard route issues around line 147:', route.split('\n').slice(145, 150));
"

# Apply the logsToday fix we created
docker restart enhanced-logging-production
```

## 🔴 **Scenario 2: Database Empty Again**

**Symptoms:**
- Database file is 0 bytes
- "No tables found" errors
- Charts show no data

**Quick Fix:**
```bash
# Re-run our fixed migration
docker exec enhanced-logging-production node fixed-database-migration.js

# Verify tables exist
docker exec enhanced-logging-production node test-db-tables.js
```

## 🔴 **Scenario 3: Authentication Not Working**

**Symptoms:**
- Can't log into dashboard
- All endpoints redirect to login
- Admin credentials don't work

**Quick Fix:**
```bash
# Check admin user exists
docker exec enhanced-logging-production node -e "
const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const db = new UniversalSQLiteAdapter('/app/logs.db');
db.get('SELECT username, role FROM users WHERE username = \"admin\"')
  .then(user => console.log('Admin user:', user))
  .catch(e => console.log('Error:', e.message));
"

# Reset admin password if needed
docker exec enhanced-logging-production node -e "
const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const bcrypt = require('bcrypt');
const db = new UniversalSQLiteAdapter('/app/logs.db');

bcrypt.hash('ChangeMe123!', 10).then(hash => {
  return db.run('UPDATE users SET password_hash = ? WHERE username = \"admin\"', [hash]);
}).then(() => {
  console.log('✅ Admin password reset to: ChangeMe123!');
}).catch(e => console.log('❌ Error:', e.message));
"
```

## 🔴 **Scenario 4: Charts Not Loading**

**Symptoms:**
- Dashboard loads but charts are empty
- JavaScript console errors
- "Chart is not defined" errors

**Quick Fix:**
```bash
# Check Chart.js CDN accessibility and canvas elements
docker exec enhanced-logging-production grep -n "Chart\|canvas" ./routes/dashboard.js | head -5

# Verify chart data endpoints work
curl -s http://localhost:10180/api/logs/stats 2>/dev/null || echo "Chart data endpoint issue"
```

## 🔴 **Scenario 5: Docker Container Won't Start**

**Symptoms:**
- Container exits immediately
- "better-sqlite3" compilation errors
- Missing dependencies

**Quick Fix:**
```bash
# Check container logs for startup errors
docker logs enhanced-logging-production

# If better-sqlite3 issues, rebuild container:
docker stop enhanced-logging-production
docker rm enhanced-logging-production

# Restart with our validated configuration
docker run -d \
  --name enhanced-logging-production \
  -p 10180:3000 \
  -v logging-data:/app/data \
  --health-cmd="node -e \"require('http').get('http://localhost:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\"" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  enhanced-logging-server:latest
```

## 🔴 **Scenario 6: Memory/Performance Issues**

**Symptoms:**
- Slow response times
- High CPU usage
- Container restarts frequently

**Quick Fix:**
```bash
# Check resource usage
docker stats enhanced-logging-production --no-stream

# Optimize database if needed
docker exec enhanced-logging-production node -e "
const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const db = new UniversalSQLiteAdapter('/app/logs.db');
db.run('PRAGMA optimize').then(() => console.log('✅ Database optimized'));
"

# Clear old logs if database is large
docker exec enhanced-logging-production node -e "
const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
const db = new UniversalSQLiteAdapter('/app/logs.db');
db.run('DELETE FROM logs WHERE timestamp < datetime(\"now\", \"-30 days\")')
  .then(() => console.log('✅ Old logs cleaned'));
"
```

## 🔧 **Emergency Recovery Commands**

```bash
# 1. Complete system reset (if all else fails)
docker stop enhanced-logging-production
docker rm enhanced-logging-production
docker volume rm logging-data
# Then redeploy fresh

# 2. Backup current database before fixes
docker cp enhanced-logging-production:/app/logs.db ./logs-backup-$(date +%Y%m%d).db

# 3. Quick health check
docker exec enhanced-logging-production node -e "
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('Memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB');
require('http').get('http://localhost:3000/health', (res) => {
  console.log('Health status:', res.statusCode);
  process.exit(0);
}).on('error', (e) => {
  console.log('Health check failed:', e.message);
  process.exit(1);
});
"
```

## 📞 **When to Use Each Recovery Script**

- **error-recovery-system.js**: First line of defense - automatic diagnosis
- **fixed-database-migration.js**: Database corruption or missing tables  
- **database-integrity-check.js**: Verify database after fixes
- **final-system-validation.js**: Complete end-to-end testing
- **emergency-diagnostics.sh**: When you need raw diagnostic data

## 🎯 **Error Escalation Path**

1. **First**: Run `error-recovery-system.js`
2. **If database issues**: Run `fixed-database-migration.js`
3. **If still broken**: Check Docker logs + restart container
4. **If persistent**: Use emergency diagnostics
5. **Last resort**: Full system redeploy with fresh database

Remember: We've already fixed the two major issues (database corruption + dashboard 500), so any remaining errors should be minor edge cases! 🎉