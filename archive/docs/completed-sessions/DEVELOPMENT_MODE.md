# Development Mode Setup

## What Changed
The `docker-compose.yml` now includes source code bind mounts for live development. This means:
- ✅ **All code changes** in your VS Code workspace are **immediately visible** inside the container
- ✅ **No rebuilds needed** - just reload the app process
- ✅ **Faster iteration** - edit, save, reload

## Apply the Changes

### Step 1: Start Docker Desktop
Make sure Docker Desktop is running on Windows.

### Step 2: Recreate the Container
Navigate to the docker-files directory and recreate the container with the new volumes:

```powershell
cd "C:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server\docker-files"

# Stop and remove the existing container
docker-compose down

# Recreate with new bind mounts (no rebuild needed)
docker-compose up -d
```

### Step 3: Verify the Bind Mount
Check that your workspace is mounted:

```powershell
docker exec logging-server ls -la /app | Select-String "routes|database-access-layer"
```

You should see your source files listed.

### Step 4: Reload After Code Changes
After editing files in VS Code, reload the app inside the container:

```powershell
# Option A: Restart PM2 process (fast, ~2 seconds)
docker exec logging-server pm2 reload all

# Option B: Restart entire container (slower, ~10 seconds)
docker restart logging-server
```

## How the Bind Mount Works

The docker-compose.yml now has:
```yaml
volumes:
  - ..:/app:delegated              # Mount entire workspace to /app
  - /app/node_modules              # Exclude node_modules (use container's)
  - /app/data                      # Exclude data (use container volume)
  - /app/logs                      # Exclude logs (use container volume)
  - /app/backups                   # Exclude backups (use container volume)
```

This setup:
1. Mounts your entire `logging-server` workspace to `/app` in the container
2. Excludes `node_modules` (uses the container's pre-built modules)
3. Excludes data directories (preserves container volumes for persistence)

## Production vs Development

**For Production:** Comment out the source bind mount lines in `docker-compose.yml`:
```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
  - ./backups:/app/backups
  - ./ssl:/app/ssl:ro
  # - ..:/app:delegated           # DISABLED for production
  # - /app/node_modules
```

**For Development:** Keep them enabled (current state).

## Troubleshooting

### Changes not appearing?
```powershell
# 1. Verify bind mount is active
docker inspect logging-server --format='{{json .Mounts}}' | ConvertFrom-Json | Where-Object {$_.Destination -eq "/app"}

# 2. Force reload PM2
docker exec logging-server pm2 reload all --update-env

# 3. Check app logs
docker logs logging-server --tail 50
```

### Container won't start?
```powershell
# Check logs for errors
docker-compose logs

# Rebuild if needed (rare)
docker-compose build --no-cache
docker-compose up -d
```

## Current Changes Ready to Test

After recreating the container, these fixes will be live:
- ✅ Integration API CRUD endpoints (list/get/create/update/delete/toggle)
- ✅ Integration toggle method in DAL
- ✅ Settings page functions exposed globally
- ✅ Tracing API endpoints (status/dependencies/search/trace)

No rebuild needed—just `docker-compose down` then `docker-compose up -d`!
