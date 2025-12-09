# 🚀 Logging Server with WebSocket - Quick Start Guide

## ✅ Current Status

Your logging server is **fully configured** with WebSocket support and ready to use on Unraid!

### What's Working

✅ **WebSocket Server** - Built-in and enabled by default  
✅ **Real-time Updates** - Push notifications for logs, alerts, metrics, sessions  
✅ **HTTP/HTTPS Support** - Flexible deployment options  
✅ **Connection Management** - Auto-cleanup, heartbeat, authentication  
✅ **Multiple Ingestion Protocols** - Syslog, GELF, Beats, Fluentd, MQTT  

---

## 📡 WebSocket Connection Info

### For Unraid Deployment

**Connection URL:**
```
ws://YOUR-UNRAID-IP:10180/ws
```

Replace `YOUR-UNRAID-IP` with your Unraid server's IP address (e.g., `192.168.1.100`)

### Default Configuration

- **Path:** `/ws`
- **Port:** Same as web UI (10180)
- **Protocol:** WebSocket (ws://)
- **Authentication:** Optional JWT token
- **Max Connections:** 500
- **Heartbeat:** 30 seconds

---

## 🧪 Testing Your Setup

### Option 1: Browser Console (Fastest)

1. Open your logging server web UI: `http://YOUR-UNRAID-IP:10180`
2. Press F12 to open DevTools
3. Go to Console tab
4. Run this code:

```javascript
const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');
ws.onopen = () => {
    console.log('✅ Connected!');
    // Subscribe to real-time logs
    ws.send(JSON.stringify({
        event: 'subscribe',
        payload: { channels: ['logs', 'alerts'] }
    }));
};
ws.onmessage = (e) => {
    console.log('📨 Received:', JSON.parse(e.data));
};
```

### Option 2: HTML Test Client

Open `websocket-test-client.html` in any browser:

1. Enter your WebSocket URL: `ws://YOUR-UNRAID-IP:10180/ws`
2. Click "Connect"
3. Click "Subscribe" to start receiving updates
4. Watch real-time messages appear!

### Option 3: Node.js Test Script

```bash
node test-websocket.js ws://YOUR-UNRAID-IP:10180/ws
```

This runs automated tests and shows connection status.

---

## 📋 Docker Setup on Unraid

### Current docker-compose.unraid.yml Configuration

Your WebSocket is already configured in the docker-compose file:

```yaml
services:
  logging-server:
    image: rejavarti/logging-server:latest
    ports:
      - "10180:3000"     # Web UI + WebSocket (same port!)
      - "8081:8081"      # Optional separate WebSocket port
```

**Important:** WebSocket runs on the **same port** as the web UI by default. The `8081` port mapping is optional and currently not used by the code.

### If Using Docker Run Command

```bash
docker run -d --name rejavarti-logging-server \
  -p 10180:3000 \
  -v /mnt/user/appdata/logging-server/data:/app/data \
  -e NODE_ENV=production \
  -e JWT_SECRET="your-secret-here" \
  -e AUTH_PASSWORD="your-password-here" \
  --restart unless-stopped \
  rejavarti/logging-server:latest
```

WebSocket is automatically enabled - no additional environment variables needed!

---

## 🔌 Using WebSocket in Your Applications

### JavaScript/Browser

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');

// Handle connection
ws.onopen = () => {
    console.log('Connected!');
    
    // Optional: Authenticate with JWT
    ws.send(JSON.stringify({
        event: 'authenticate',
        payload: { token: 'YOUR_JWT_TOKEN' }
    }));
    
    // Subscribe to channels
    ws.send(JSON.stringify({
        event: 'subscribe',
        payload: { channels: ['logs', 'alerts', 'metrics', 'sessions'] }
    }));
};

// Receive real-time updates
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.event === 'log') {
        console.log('New log:', message.data);
    } else if (message.event === 'alert') {
        console.log('New alert:', message.data);
    }
};

// Handle disconnection
ws.onclose = () => console.log('Disconnected');
ws.onerror = (err) => console.error('Error:', err);
```

### Node.js

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');

ws.on('open', () => {
    ws.send(JSON.stringify({
        event: 'subscribe',
        payload: { channels: ['logs'] }
    }));
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('Received:', message);
});
```

### Python

```python
import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    print(f"Received: {data}")

def on_open(ws):
    ws.send(json.dumps({
        'event': 'subscribe',
        'payload': {'channels': ['logs', 'alerts']}
    }))

ws = websocket.WebSocketApp(
    "ws://YOUR-UNRAID-IP:10180/ws",
    on_message=on_message,
    on_open=on_open
)
ws.run_forever()
```

---

## 📡 Available Events

### Client → Server

| Event | Description | Example |
|-------|-------------|---------|
| `authenticate` | Authenticate with JWT token | `{ event: 'authenticate', payload: { token: 'xxx' } }` |
| `subscribe` | Subscribe to channels | `{ event: 'subscribe', payload: { channels: ['logs', 'alerts'] } }` |
| `unsubscribe` | Unsubscribe from channels | `{ event: 'unsubscribe', payload: { channels: ['metrics'] } }` |
| `ping` | Manual heartbeat | `{ event: 'ping' }` |

### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `connected` | Initial connection confirmation | `{ event: 'connected', clientId: 'xxx', timestamp: '...' }` |
| `authenticated` | Authentication successful | `{ event: 'authenticated', username: 'admin' }` |
| `subscribed` | Subscription confirmed | `{ event: 'subscribed', channels: ['logs'] }` |
| `log` | New log entry | `{ event: 'log', channel: 'logs', data: {...} }` |
| `alert` | New alert | `{ event: 'alert', channel: 'alerts', data: {...} }` |
| `pong` | Response to ping | `{ event: 'pong', timestamp: '...' }` |
| `error` | Error message | `{ event: 'error', error: 'message' }` |

---

## 🔒 Security Features

✅ **JWT Authentication** - Optional token-based authentication  
✅ **Connection Limits** - Max 500 concurrent connections  
✅ **Heartbeat/Timeout** - 30-second ping, 35-second timeout  
✅ **Auto-cleanup** - Stale connections automatically removed  
✅ **Message Validation** - All messages must be valid JSON  

---

## 🐛 Troubleshooting

### Connection Refused

**Check if container is running:**
```bash
docker ps | grep logging-server
```

**Check logs:**
```bash
docker logs rejavarti-logging-server --tail 50 | grep -i websocket
```

Expected output:
```
✅ WebSocket server initialized on path /ws
```

### Can't Connect from Browser

1. **Check URL** - Must be `ws://` (not `http://`)
2. **Check Port** - Should be `10180` (same as web UI)
3. **Check Firewall** - Ensure port 10180 is accessible
4. **Try localhost** - Test from Unraid terminal first

### No Real-Time Updates

1. **Subscribe to channels** - Must send subscribe event
2. **Check authentication** - May need JWT token
3. **Generate test logs** - Use web UI to create logs and see if they appear

---

## 📊 Monitoring WebSocket

### Check Connected Clients

**Via API:**
```bash
curl http://YOUR-UNRAID-IP:10180/api/websocket/clients \
  -H "Cookie: sessionId=YOUR_SESSION"
```

**Via Browser Console (if logged in):**
```javascript
fetch('/api/websocket/clients', { credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log('Connected clients:', d));
```

### Check Server Health

```bash
curl http://YOUR-UNRAID-IP:10180/health
```

---

## 📚 Documentation Files

Created for you:

1. **`WEBSOCKET_SETUP.md`** - Complete WebSocket documentation
2. **`test-websocket.js`** - Node.js test script
3. **`websocket-test-client.html`** - Browser-based test tool
4. **`README.md`** - Updated with WebSocket section

---

## 🎯 Next Steps

1. ✅ Verify WebSocket connection using test tools
2. ✅ Subscribe to channels you need (logs, alerts, metrics, sessions)
3. ✅ Integrate WebSocket into your applications
4. ✅ Monitor connection health via API endpoint
5. ✅ Configure authentication if needed

---

## 💡 Quick Tips

- **Same Port**: WebSocket uses the same port as web UI (10180)
- **No Config Needed**: Enabled by default, just connect!
- **Real-time**: Subscribe to channels for instant updates
- **Scalable**: Supports up to 500 concurrent connections
- **Production-Ready**: Built-in security and error handling

---

## 🆘 Need Help?

- Check server logs: `docker logs rejavarti-logging-server`
- Review WebSocket docs: `WEBSOCKET_SETUP.md`
- Test connection: `node test-websocket.js`
- Open HTML tester: `websocket-test-client.html`

**Your logging server is ready to stream real-time updates! 🚀**
