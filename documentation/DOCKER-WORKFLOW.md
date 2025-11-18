# 🐳 Docker-First Development Workflow

## ⚠️ IMPORTANT: Never Edit Local Files!

All development should happen **inside Docker containers** to avoid sync issues.

## Quick Setup

```powershell
# 1. Set up Docker development environment
.\docker-dev-setup.ps1

# 2. Lock local files to prevent accidents  
.\lock-local-files.ps1

# 3. Start developing in Docker
.\docker-dev.ps1 shell
```

## Development Commands

| Task | Command | Description |
|------|---------|-------------|
| **Edit File** | `.\docker-dev.ps1 edit server.js` | Edit files inside container |
| **Shell Access** | `.\docker-dev.ps1 shell` | Open container bash shell |
| **View Logs** | `.\docker-dev.ps1 logs` | Stream application logs |
| **Restart App** | `.\docker-dev.ps1 restart` | Restart Node.js server |
| **Rebuild Container** | `.\docker-dev.ps1 rebuild` | Full container rebuild |
| **Run Tests** | `.\docker-dev.ps1 test` | Execute test suite |

## VS Code Integration

1. Install "Dev Containers" extension
2. Open Command Palette (`Ctrl+Shift+P`)
3. Select: "Dev Containers: Reopen in Container"
4. Edit directly in containerized environment

## Direct Docker Commands

```bash
# Edit files directly in container
docker exec -it enhanced-logging-dev nano /app/server.js

# Shell access
docker exec -it enhanced-logging-dev /bin/bash

# Run commands in container
docker exec enhanced-logging-dev npm install new-package
```

## File Protection Status

- 🔒 **Local files are read-only** - prevents accidental edits
- 🐳 **Container has full access** - all changes happen here
- 🔄 **Volume mounted** - changes persist and sync automatically

## Troubleshooting

**If you accidentally edited local files:**
```powershell
# Revert local changes
git checkout -- .

# Rebuild container with latest Docker state
.\docker-dev.ps1 rebuild
```

**If you need to unlock files temporarily:**
```powershell
# For Docker rebuilds only
.\unlock-files.ps1
# ... do Docker operations ...
.\lock-local-files.ps1
```

## Access Points

- 🌐 **Web Interface**: http://localhost:10180
- 🔐 **Login**: admin / ChangeMe123!
- 📊 **API Base**: http://localhost:10180/api/
- 💚 **Health**: http://localhost:10180/health