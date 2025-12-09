# WebSocket Setup Guide - Logging Server

## Overview

The logging server has built-in WebSocket support for real-time updates. WebSocket connections are **automatically enabled** and run on the same port as the HTTP server.

---

## 🔌 Connection Details

### WebSocket Endpoint
- **Path**: `/ws`
- **Protocol**: `ws://` (HTTP) or `wss://` (HTTPS)
- **Port**: Same as web UI (default: 10180)

### Unraid Connection URLs
```
ws://YOUR-UNRAID-IP:10180/ws      # WebSocket over HTTP
wss://YOUR-UNRAID-IP:10181/ws     # WebSocket over HTTPS (if enabled)
```

---

## 🚀 Quick Start

### Browser Connection (JavaScript)
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');

// Connection opened
ws.onopen = () => {
    console.log('✅ WebSocket connected!');
    
    // Authenticate with JWT token (optional but recommended)
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

// Receive messages
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Received:', message);
    
    switch(message.event) {
        case 'connected':
            console.log('Client ID:', message.clientId);
            break;
        case 'authenticated':
            console.log('Authenticated as:', message.username);
            break;
        case 'subscribed':
            console.log('Subscribed to:', message.channels);
            break;
        case 'log':
            console.log('New log:', message.data);
            break;
        case 'alert':
            console.log('New alert:', message.data);
            break;
    }
};

// Handle errors
ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
};

// Connection closed
ws.onclose = () => {
    console.log('🔌 WebSocket disconnected');
};
```

---

## 📡 WebSocket Events

### Client → Server Events

#### 1. Authenticate
```javascript
ws.send(JSON.stringify({
    event: 'authenticate',
    payload: { token: 'your-jwt-token' }
}));
```

#### 2. Subscribe to Channels
```javascript
ws.send(JSON.stringify({
    event: 'subscribe',
    payload: { channels: ['logs', 'alerts', 'metrics', 'sessions'] }
}));
```

Available channels:
- `logs` - Real-time log entries
- `alerts` - System alerts and notifications
- `metrics` - Performance metrics
- `sessions` - User session changes

#### 3. Unsubscribe from Channels
```javascript
ws.send(JSON.stringify({
    event: 'unsubscribe',
    payload: { channels: ['metrics'] }
}));
```

#### 4. Ping (Heartbeat)
```javascript
ws.send(JSON.stringify({
    event: 'ping'
}));
```

### Server → Client Events

#### 1. Connected
```javascript
{
    event: 'connected',
    clientId: 'client_123_abc',
    timestamp: '2025-12-06T10:30:00.000Z'
}
```

#### 2. Authenticated
```javascript
{
    event: 'authenticated',
    username: 'admin',
    timestamp: '2025-12-06T10:30:01.000Z'
}
```

#### 3. Subscribed
```javascript
{
    event: 'subscribed',
    channels: ['logs', 'alerts'],
    timestamp: '2025-12-06T10:30:02.000Z'
}
```

#### 4. Data Events
```javascript
{
    event: 'log',
    channel: 'logs',
    data: {
        id: 12345,
        message: 'User logged in',
        level: 'info',
        timestamp: '2025-12-06T10:30:05.000Z'
    },
    timestamp: '2025-12-06T10:30:05.000Z'
}
```

#### 5. Pong (Response to Ping)
```javascript
{
    event: 'pong',
    timestamp: '2025-12-06T10:30:10.000Z'
}
```

#### 6. Error
```javascript
{
    event: 'error',
    error: 'Authentication failed'
}
```

---

## 🐳 Docker/Unraid Configuration

### Standard Setup (WebSocket on Same Port)
The WebSocket server runs on the **same HTTP server** by default. No additional port mapping needed.

```yaml
# docker-compose.unraid.yml
services:
  logging-server:
    image: rejavarti/logging-server:latest
    ports:
      - "10180:3000"     # Web UI + WebSocket
```

Connection: `ws://YOUR-UNRAID-IP:10180/ws`

### Separate WebSocket Port (Optional)
If you want WebSocket on a dedicated port (e.g., 8081):

```yaml
services:
  logging-server:
    image: rejavarti/logging-server:latest
    ports:
      - "10180:3000"     # Web UI
      - "8081:8081"      # WebSocket (if configured)
    environment:
      - WS_PORT=8081
```

**Note**: Current implementation uses the same port. To use a separate port, the server code would need modification.

---

## 🔒 Security Features

### 1. Authentication
- WebSocket connections support JWT token authentication
- Tokens can be obtained via `/api/auth/login` endpoint
- Authenticated connections have full access to subscribed channels

### 2. Heartbeat/Keepalive
- Server pings clients every **30 seconds**
- Connections timeout after **35 seconds** of inactivity
- Automatic cleanup of stale connections

### 3. Connection Limits
- Maximum **500 concurrent connections**
- Oldest connections are terminated when limit is reached
- Prevents memory exhaustion attacks

### 4. Message Validation
- All incoming messages must be valid JSON
- Unknown events return error responses
- Prevents malformed message attacks

---

## 🧪 Testing WebSocket Connection

### Method 1: Browser DevTools
1. Open your logging server in browser: `http://YOUR-UNRAID-IP:10180`
2. Open DevTools (F12)
3. Go to Console tab
4. Run:
```javascript
const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', e.data);
ws.onerror = (e) => console.error('Error:', e);
```

### Method 2: Docker Logs
Check if WebSocket server initialized:
```bash
docker logs rejavarti-logging-server | grep -i websocket
```

Expected output:
```
✅ WebSocket server initialized on path /ws
WebSocket client connected: client_123_abc from 192.168.1.100
```

### Method 3: API Endpoint
Check connected WebSocket clients:
```bash
curl -X GET http://YOUR-UNRAID-IP:10180/api/websocket/clients \
  -H "Cookie: sessionId=YOUR_SESSION_ID"
```

Response:
```json
{
    "success": true,
    "clients": [
        {
            "clientId": "client_123_abc",
            "authenticated": true,
            "username": "admin",
            "subscriptions": ["logs", "alerts"],
            "connectedAt": "2025-12-06T10:30:00.000Z",
            "status": "connected"
        }
    ],
    "count": 1
}
```

---

## 🐛 Troubleshooting

### Issue: Connection Refused

**Check if server is running:**
```bash
docker ps | grep logging-server
```

**Check server logs:**
```bash
docker logs rejavarti-logging-server --tail 50
```

**Verify port mapping:**
```bash
docker port rejavarti-logging-server
```

### Issue: Connection Drops Immediately

**Cause**: Firewall or proxy blocking WebSocket upgrade

**Solution**: Ensure WebSocket upgrade headers are allowed:
```
Upgrade: websocket
Connection: Upgrade
```

For reverse proxies (nginx), add:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Issue: No Real-Time Updates

**Check subscription:**
```javascript
ws.send(JSON.stringify({
    event: 'subscribe',
    payload: { channels: ['logs'] }
}));
```

**Verify you're authenticated:**
```javascript
ws.send(JSON.stringify({
    event: 'authenticate',
    payload: { token: 'YOUR_JWT_TOKEN' }
}));
```

### Issue: Messages Not Being Broadcast

**Check if WebSocket server is enabled:**
```bash
docker exec rejavarti-logging-server node -e "console.log(require('./config/server-config').config.integrations.websocket)"
```

Should show:
```json
{ enabled: true, path: '/ws' }
```

---

## 📊 Monitoring WebSocket Performance

### Connection Stats
```bash
# View active connections
docker exec rejavarti-logging-server node -e "console.log(global.wsClients ? global.wsClients.size : 0)"

# View server metrics
curl http://YOUR-UNRAID-IP:10180/health
```

### Memory Usage
```bash
# Check container memory
docker stats rejavarti-logging-server --no-stream
```

---

## 🔧 Advanced Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_ENABLED` | `true` | Enable/disable WebSocket server |
| `WS_PATH` | `/ws` | WebSocket endpoint path |
| `WS_HEARTBEAT_INTERVAL` | `30000` | Ping interval (ms) |
| `WS_TIMEOUT` | `35000` | Connection timeout (ms) |
| `WS_MAX_CONNECTIONS` | `500` | Max concurrent connections |

### Custom WebSocket Configuration
Create a file at `/app/config/websocket.json` in the container:
```json
{
    "enabled": true,
    "path": "/ws",
    "heartbeatInterval": 30000,
    "timeout": 35000,
    "maxConnections": 500
}
```

---

## 📚 Integration Examples

### React Component
```jsx
import { useEffect, useState } from 'react';

function LogStream() {
    const [logs, setLogs] = useState([]);
    
    useEffect(() => {
        const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');
        
        ws.onopen = () => {
            // Subscribe to logs
            ws.send(JSON.stringify({
                event: 'subscribe',
                payload: { channels: ['logs'] }
            }));
        };
        
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.event === 'log') {
                setLogs(prev => [message.data, ...prev].slice(0, 100));
            }
        };
        
        return () => ws.close();
    }, []);
    
    return (
        <div>
            {logs.map(log => (
                <div key={log.id}>{log.message}</div>
            ))}
        </div>
    );
}
```

### Node.js Client
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://YOUR-UNRAID-IP:10180/ws');

ws.on('open', () => {
    console.log('Connected');
    
    ws.send(JSON.stringify({
        event: 'subscribe',
        payload: { channels: ['alerts'] }
    }));
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('Received:', message);
});
```

---

## 🎯 Summary

- ✅ **WebSocket is enabled by default** on `/ws` path
- ✅ **No additional configuration needed** for basic usage
- ✅ **Runs on same port** as web UI (10180)
- ✅ **Supports authentication** via JWT tokens
- ✅ **Real-time channels**: logs, alerts, metrics, sessions
- ✅ **Automatic heartbeat** and connection management
- ✅ **Production-ready** with security features

For more information, see:
- `server.js` lines 2280-2650 (WebSocket implementation)
- `config/server-config.js` lines 90-95 (WebSocket config)
- `DESKTOP_DEPLOYMENT_GUIDE.md` section on WebSocket
