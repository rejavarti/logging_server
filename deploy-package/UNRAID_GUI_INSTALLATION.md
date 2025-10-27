See full guide at: https://github.com/rejavarti/logging-server/blob/main/UNRAID_GUI_INSTALLATION.md

Quick GUI Installation:
1. SSH into Unraid, extract package to /mnt/user/appdata/logging-server-source
2. Build image: docker build -t rejavarti/logging-server:latest .
3. Go to Docker tab > Add Container
4. Repository: rejavarti/logging-server:latest
5. Add port 10180:10180
6. Add paths: /app/data and /app/logs
7. Add env vars: NODE_ENV, PORT, TZ, AUTH_USERNAME, AUTH_PASSWORD
8. Apply and start!

See unraid-template.xml for full template import.
