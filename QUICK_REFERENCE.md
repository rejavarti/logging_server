# Quick Reference - Docker Cache & Dashboard Fixes

## 🚀 Fast Builds (For Slow Internet)

```powershell
# Daily development build (10-30 seconds)
.\docker-build-cached.ps1

# First time or troubleshooting (3-5 minutes)
.\docker-build-cached.ps1 -NoCache
```

**Why it's fast**: BuildKit cache keeps npm packages between builds
**Where**: Cache stored in Docker volumes (survives image deletion)

---

## 🎨 Dashboard Widget Layout

**Save Layout**: Click "Save Layout" button after arranging widgets
**Auto-save**: Widgets auto-save position after drag ends
**Persistence**: Uses `/api/dashboard/positions` + localStorage fallback

**Troubleshooting**:
- Layout not saving? Check browser console for errors
- Widgets jumping? Wait 100ms after page load before dragging
- Lost positions? Check localStorage: `localStorage.getItem('dashboardLayout')`

---

## 🔍 Search Tips

**Partial matches now work**: 
- Search "unified" → finds "unified-test"
- Searches both message AND source fields

**Search syntax**:
- `unified` - finds in message or source
- `level:error` - filter by level
- `source:api` - filter by source
- Combine filters in Advanced Search form

---

## 🗺️ Geographic Map

**Improvements**:
- Larger markers (easier to see)
- Darker info box text (better contrast)
- Markers stay visible when zoomed out
- minZoom: 1 (was 2)

---

## 📊 Integration Health

**Now shows**: Only ENABLED integrations
**Empty state**: "No active integrations" when none exist
**Tab renamed**: "Custom Integrations" → "Add Integration"

---

## 📝 Activity & Sessions

**Activity Logs**: Now shows diverse actions (not just login)
**Sessions**: Current login visible in Admin → Users → Active Sessions

**Refresh seed data**:
```powershell
docker exec Rejavarti-Logging-Server rm /app/data/databases/enterprise_logs.db
docker restart Rejavarti-Logging-Server
```

---

## 🐳 Container Management

```powershell
# Build
.\docker-build-cached.ps1

# Run
docker run -d --name Rejavarti-Logging-Server `
  -p 10180:10180 `
  -v "${PWD}/data:/app/data" `
  -e NODE_ENV=production `
  -e AUTH_PASSWORD=ChangeMe123! `
  --restart unless-stopped `
  rejavarti/logging-server:latest

# Check logs
docker logs Rejavarti-Logging-Server -f

# Restart
docker restart Rejavarti-Logging-Server

# Stop & remove
docker stop Rejavarti-Logging-Server
docker rm Rejavarti-Logging-Server
```

---

## 🧹 Cache Management

```powershell
# View cache size
docker system df -v

# Clear BuildKit cache (when troubleshooting)
docker builder prune --all

# Clear volume cache (rarely needed)
docker volume prune
```

---

## ⚡ Performance

| Action | Time | Note |
|--------|------|------|
| First build | 3-5 min | Downloads all packages |
| Cached build | 10-30 sec | Reuses cached packages |
| Dashboard load | <2 sec | No change |
| Widget drag/save | <1 sec | Instant feedback |

---

## 🔧 Troubleshooting

**Build fails**:
```powershell
docker builder prune --all
.\docker-build-cached.ps1 -NoCache
```

**Layout not saving**:
- Check browser console (F12)
- Try manual save: click "Save Layout"
- Check API: `GET /api/dashboard/positions`

**Search not working**:
- Clear filters in Advanced Search
- Check source field contains expected value
- Verify logs exist: `GET /api/logs?limit=10`

**Sessions not showing**:
- Ensure logged in as admin
- Check API: `GET /api/admin/sessions`
- Verify user_sessions table exists

---

## 📚 Documentation

- **Full details**: `ISSUE_RESOLUTION_2025-11-22.md`
- **Cache setup**: `DOCKER_CACHE_SETUP.md`
- **Build script**: `docker-build-cached.ps1`

---

## ✅ Quick Test

```powershell
# 1. Fast build
.\docker-build-cached.ps1

# 2. Run container
docker run -d --name test-server -p 10180:10180 `
  -e AUTH_PASSWORD=test123 `
  rejavarti/logging-server:latest

# 3. Check startup (should see "HTTP Server running")
docker logs test-server 2>&1 | Select-Object -Last 10

# 4. Login: http://localhost:10180/dashboard
# Username: admin
# Password: test123

# 5. Test features:
#    - Drag widgets → Save → Refresh (positions persist)
#    - Search "unified" (finds results)
#    - Admin → Users (see active session)

# 6. Cleanup
docker stop test-server
docker rm test-server
```

---

## 🎯 Key Takeaways

1. ✅ Use `docker-build-cached.ps1` for fast builds on slow internet
2. ✅ Widget layouts now persist correctly after save
3. ✅ Search finds partial matches in both message and source
4. ✅ All UI visibility issues fixed (map markers, text contrast)
5. ✅ BuildKit cache saves ~150MB bandwidth per build
