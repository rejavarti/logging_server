#!/bin/bash
# EMERGENCY ERROR DIAGNOSTIC SCRIPT
# Run this if you encounter any errors during testing

echo "🚨 EMERGENCY ERROR DIAGNOSTICS - $(date)"
echo "═══════════════════════════════════════════════════════════════"

# 1. Check Docker container status
echo "🐳 Docker Container Status:"
docker ps -a | grep enhanced-logging
echo ""

# 2. Get recent error logs
echo "📋 Recent Error Logs (last 20 lines):"
docker logs enhanced-logging-production --tail 20 2>&1 | grep -i "error\|exception\|fail\|crash"
echo ""

# 3. Check database file
echo "🗄️ Database Status:"
docker exec enhanced-logging-production ls -lh /app/logs.db
echo ""

# 4. Test health endpoint
echo "💚 Health Check:"
curl -s http://localhost:10180/health | jq . 2>/dev/null || echo "Health endpoint not responding"
echo ""

# 5. Check memory usage
echo "💾 Memory Usage:"
docker stats enhanced-logging-production --no-stream --format "CPU: {{.CPUPerc}} | Memory: {{.MemUsage}}"
echo ""

# 6. Test database connectivity
echo "🔌 Database Connection Test:"
docker exec enhanced-logging-production node -e "
const db = require('./universal-sqlite-adapter');
try {
  const adapter = new db('/app/logs.db');
  adapter.get('SELECT 1').then(() => console.log('✅ Database OK')).catch(e => console.log('❌ DB Error:', e.message));
} catch(e) {
  console.log('❌ Adapter Error:', e.message);
}
"

echo "═══════════════════════════════════════════════════════════════"