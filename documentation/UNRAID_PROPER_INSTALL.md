# 🚀 Making Unraid Install Properly - Complete Guide

## 🎯 Goal
Make the logging server installable in Unraid with all paths, ports, and variables pre-configured.

---

## ✅ Solution 1: Manual XML Template (Immediate Fix)

### Step 1: Copy Template to Unraid

```bash
# SSH into your Unraid server
ssh root@192.168.222.3

# Navigate to templates directory
cd /boot/config/plugins/dockerMan/templates-user/

# Download the template (if you have it hosted)
# Or create it manually:
nano RejavartiLoggingServer.xml
```

### Step 2: Paste Template Content

Copy the contents of `unraid-template.xml` into the file, then save (Ctrl+X, Y, Enter).

### Step 3: Use the Template

1. Go to Unraid Docker tab
2. Click "Add Container"
3. Under "Template", select "RejavartiLoggingServer"
4. All paths, ports, and variables will be pre-filled!
5. Just click "Apply"

---

## ✅ Solution 2: Rebuild and Push Docker Image (Best Long-Term)

The updated Dockerfile now includes proper labels that Unraid Community Applications can read.

### Step 1: Rebuild Image with New Labels

```bash
cd "c:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server"

# Rebuild with updated labels
docker build --no-cache -t rejavarti/logging-server:latest -t rejavarti/logging-server:1.1.0 .
```

### Step 2: Push to Docker Hub

```bash
# Login if needed
docker login

# Push both tags
docker push rejavarti/logging-server:1.1.0
docker push rejavarti/logging-server:latest
```

### Step 3: Wait for Community Applications to Update

After pushing, Unraid Community Applications should pick up the new labels within 24-48 hours.

---

## ✅ Solution 3: Add to Community Applications (Most Permanent)

### Option A: Fork CA Templates Repository

1. Fork this repository: https://github.com/Squidly271/docker-templates
2. Add your `unraid-template.xml` to your fork
3. Submit a Pull Request
4. Once merged, your template will appear in Community Applications

### Option B: Host Template Yourself

1. **Create a GitHub Repository** for your templates:
   ```bash
   # Create a new repo: unraid-templates
   # Add unraid-template.xml to it
   ```

2. **Get Raw URL**:
   ```
   https://raw.githubusercontent.com/rejavarti/unraid-templates/main/RejavartiLoggingServer.xml
   ```

3. **Add to Unraid CA**:
   - Unraid → Docker → "Template Repositories"
   - Add: `https://raw.githubusercontent.com/rejavarti/unraid-templates/main/`
   - Save and refresh

---

## ✅ Solution 4: Direct Import URL (Fastest)

### For Your Current Unraid:

1. Go to Unraid → Docker tab
2. Click "Add Container"
3. At the bottom, click "Show more settings"
4. Find "Template repositories" or "Import Template"
5. If you host the XML somewhere accessible, paste the URL

### Manual Import Steps:

```bash
# SSH into Unraid
ssh root@192.168.222.3

# Copy template to user templates
cp /path/to/unraid-template.xml /boot/config/plugins/dockerMan/templates-user/RejavartiLoggingServer.xml

# Refresh Docker page in web UI
```

---

## 🔧 What Changed in the Image

### New Dockerfile Labels Added:

```dockerfile
LABEL maintainer="Tom Nelson <rejavarti@github.com>" \
      org.opencontainers.image.version="1.1.0" \
      org.opencontainers.image.url="https://hub.docker.com/r/rejavarti/logging-server" \
      io.unraid.category="Tools: HomeAutomation: Network:Other Status:Stable" \
      io.unraid.support="https://hub.docker.com/r/rejavarti/logging-server" \
      io.unraid.webui="http://[IP]:[PORT:10180]/dashboard" \
      io.unraid.icon="https://raw.githubusercontent.com/rejavarti/logging-server/main/public/favicon.svg"
```

These labels tell Unraid:
- ✅ Category (where to show in apps)
- ✅ Support URL (help link)
- ✅ Web UI (auto-generates dashboard link)
- ✅ Icon (visual identifier)

---

## 📋 Template Configuration Summary

The XML template now includes:

### Ports:
- ✅ 10180 (TCP) - Pre-configured

### Paths:
- ✅ `/mnt/user/appdata/logging-server/data` → `/app/data`
- ✅ `/mnt/user/appdata/logging-server/logs` → `/app/logs`
- ✅ `/mnt/user/appdata/logging-server/ssl` → `/app/ssl` (optional)

### Environment Variables:
- ✅ `NODE_ENV=production`
- ✅ `PORT=10180`
- ✅ `TZ=America/Denver`
- ✅ `AUTH_USERNAME=admin`
- ✅ `AUTH_PASSWORD=ChangeMe123!`
- ✅ `USE_HTTPS=false`
- ✅ `SSL_CERT_PATH=/app/ssl/cert.pem`
- ✅ `SSL_KEY_PATH=/app/ssl/key.pem`

---

## 🎯 Recommended Actions (In Order)

### Right Now (Immediate):

1. **Rebuild Docker image** with new labels:
   ```bash
   docker build --no-cache -t rejavarti/logging-server:latest -t rejavarti/logging-server:1.1.0 .
   ```

2. **Push to Docker Hub**:
   ```bash
   docker push rejavarti/logging-server:1.1.0
   docker push rejavarti/logging-server:latest
   ```

3. **Copy XML template to Unraid**:
   ```bash
   scp unraid-template.xml root@192.168.222.3:/boot/config/plugins/dockerMan/templates-user/RejavartiLoggingServer.xml
   ```

4. **Refresh Unraid Docker page** - Template should now appear!

### Future (Long-term):

1. **Create GitHub repo** for the project (if not already)
2. **Add unraid-template.xml** to the repo
3. **Submit to Community Applications** or host your own template repository

---

## 🧪 Testing the New Template

After copying the template to Unraid:

1. **Unraid UI** → Docker tab
2. Click **"Add Container"**
3. Select **"RejavartiLoggingServer"** from template dropdown
4. Verify all fields are pre-populated:
   - Port: 10180
   - Paths: /mnt/user/appdata/logging-server/*
   - Variables: All present with defaults
5. Click **"Apply"**
6. Container should start automatically
7. Access: `http://192.168.222.3:10180/dashboard`

---

## 📝 Next Steps

### Step 1: Rebuild and Push (Required)
```bash
cd "c:\Users\Tom Nelson\Documents\Visual_Studio_Code\Node-Red-Home-Assistant\logging-server"
docker build --no-cache -t rejavarti/logging-server:latest -t rejavarti/logging-server:1.1.0 .
docker push rejavarti/logging-server:1.1.0
docker push rejavarti/logging-server:latest
```

### Step 2: Install Template on Unraid
```bash
# From Windows, copy to Unraid
scp unraid-template.xml root@192.168.222.3:/boot/config/plugins/dockerMan/templates-user/RejavartiLoggingServer.xml

# Or manually paste content in Unraid
```

### Step 3: Test Installation
1. Remove existing container (if any)
2. Use the new template
3. Verify everything works
4. Update Docker Hub description with installation instructions

---

## 🎉 Result

After completing these steps:

✅ **Docker image** has proper Unraid labels  
✅ **XML template** includes all paths and variables  
✅ **One-click installation** in Unraid  
✅ **No manual configuration** needed  
✅ **Community-ready** for distribution  

Users can now install with a single click and all settings will be pre-configured!

---

## 🔍 Verification

Check if labels are in the image:
```bash
docker inspect rejavarti/logging-server:latest | grep -A 20 Labels
```

Should show:
- `io.unraid.category`
- `io.unraid.webui`
- `io.unraid.support`
- `io.unraid.icon`

---

## 📚 Additional Resources

- **Unraid Docker Templates**: https://github.com/Squidly271/docker-templates
- **Community Applications**: https://forums.unraid.net/topic/38582-plug-in-community-applications/
- **Template Format**: https://github.com/Squidly271/docker-templates/blob/master/Template-Format.md

---

## 💡 Pro Tips

1. **Version your templates** - Update version in XML when you update the image
2. **Test before distributing** - Always test the template on a clean Unraid install
3. **Keep defaults sensible** - Use paths that work for most users
4. **Document everything** - Good descriptions help users configure correctly
5. **Provide icon** - Make sure the icon URL is accessible and permanent

---

**Ready to rebuild and push?** Let me know and I can help with that next! 🚀
