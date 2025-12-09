# ESP32 POE WebSocket Logging - Configuration Guide

## 🎯 Current Status

Your ESP32 POE device is **already configured** to send logs to your logging server!

### Existing Configuration

From your `esp32-poe-settings.json`:

```json
"log_ws_enabled": true,
"log_ws_url": "ws://192.168.222.3:10180/ws",
"log_level": "info",
"log_batch_ms": 75,
"log_buffer_size": 128
```

✅ **WebSocket enabled**  
✅ **Server URL configured** (192.168.222.3:10180)  
✅ **Log level set to info**  
✅ **Batching enabled** (75ms intervals)  

---

## 🔧 Configuration Options

### Log Levels

Available levels (from most to least verbose):

- `debug` - All messages including debug info
- `info` - General information (recommended)
- `warning` - Warnings and errors
- `error` - Errors only
- `none` - Disable logging

**Change log level:**
```json
"log_level": "debug"  // For troubleshooting
"log_level": "info"   // Normal operation (current)
"log_level": "warning" // Only important messages
```

### Batching Configuration

**Current settings:**
- `log_batch_ms: 75` - Send logs every 75 milliseconds
- `log_buffer_size: 128` - Buffer up to 128 messages

**Optimization options:**

**For real-time streaming (low latency):**
```json
"log_batch_ms": 50,      // Send every 50ms
"log_buffer_size": 64    // Smaller buffer
```

**For reduced network traffic:**
```json
"log_batch_ms": 250,     // Send every 250ms
"log_buffer_size": 256   // Larger buffer
```

**For high-volume logging:**
```json
"log_batch_ms": 100,
"log_buffer_size": 512
```

---

## 📡 WebSocket Connection Details

### Server Information

- **IP Address:** 192.168.222.3
- **Port:** 10180
- **Protocol:** WebSocket (ws://)
- **Endpoint:** /ws
- **Full URL:** ws://192.168.222.3:10180/ws

### Network Configuration

Your ESP32 is on the same network:

```json
"static_ip": "192.168.224.4",
"static_ip_gateway": "192.168.224.1",
"static_ip_netmask": "255.255.255.0",
"dns_server_1": "192.168.222.13",
"dns_server_2": "192.168.222.12"
```

**Network diagram:**
```
ESP32 POE: 192.168.224.4 (your device)
    ↓
Gateway: 192.168.224.1
    ↓
Logging Server: 192.168.222.3:10180 (Unraid)
```

---

## 🧪 Testing WebSocket Connection

### Method 1: Check Device Status

Access your MiLight Hub interface:
```
http://192.168.224.4
```

Look for WebSocket status indicator or connection logs.

### Method 2: Monitor from Logging Server

1. Open logging server dashboard:
   ```
   http://192.168.222.3:10180
   ```

2. Check for WebSocket clients:
   - Go to Dashboard
   - Look for "Connected Clients" or similar
   - Should show ESP32 connection

3. Filter logs by source:
   ```
   source:esp32
   source:milight
   ```

### Method 3: Network Packet Capture

```bash
# On Unraid terminal
tcpdump -i br0 -n port 10180 and host 192.168.224.4
```

Expected output:
```
WebSocket handshake between 192.168.224.4 and 192.168.222.3
```

---

## 🔍 Troubleshooting

### WebSocket Not Connecting

**1. Verify logging server is running:**
```bash
docker ps | grep logging-server
```

**2. Check port is open:**
```bash
curl http://192.168.222.3:10180/health
```

**3. Test WebSocket endpoint:**
```bash
node test-websocket.js ws://192.168.222.3:10180/ws
```

**4. Check firewall on Unraid:**
- Go to Settings > Network Settings
- Verify port 10180 is not blocked

**5. Verify ESP32 can reach server:**
```bash
# From ESP32 terminal (if available)
ping 192.168.222.3
```

### Logs Not Appearing

**1. Increase log level:**
```json
"log_level": "debug"
```

**2. Reduce batch interval:**
```json
"log_batch_ms": 50
```

**3. Check buffer isn't full:**
```json
"log_buffer_size": 256  // Increase if needed
```

**4. Restart ESP32:**
- Power cycle device
- Or use web interface restart button

### Connection Drops

**Symptoms:**
- Intermittent logging
- Gaps in log timeline
- Connection timeouts

**Solutions:**

**1. Increase buffer size:**
```json
"log_buffer_size": 256
```

**2. Adjust batch timing:**
```json
"log_batch_ms": 100
```

**3. Check network stability:**
```bash
# From Unraid
ping -c 100 192.168.224.4
```

**4. Verify DNS resolution:**
```json
"dns_server_1": "192.168.222.13",
"dns_server_2": "192.168.222.12"
```

---

## 📊 Log Message Format

### ESP32 Log Structure

Your ESP32 sends logs in this format:

```json
{
  "timestamp": "2025-12-06T10:30:00.000Z",
  "level": "info",
  "message": "RF24 packet received",
  "source": "esp32-milight-hub",
  "device_id": 57345,
  "component": "rf24",
  "data": {
    "rssi": -45,
    "channel": "HIGH",
    "device_type": "rgb_cct"
  }
}
```

### Common Log Events

**MiLight Hub Events:**
- `RF24 packet received` - Light command received
- `MQTT message published` - State published to MQTT
- `HTTP request received` - Web API call
- `WebSocket connected` - Client connected
- `Device state changed` - Light state updated

**System Events:**
- `WiFi connected` - Network connected
- `IP address assigned` - Network configured
- `MQTT connected` - MQTT broker connected
- `Heap free: XXX bytes` - Memory status

---

## 🔧 Advanced Configuration

### Custom Log Filtering on ESP32

If you want to filter which logs are sent (ESP32 firmware permitting):

```json
"log_level": "info",
"log_exclude_patterns": [
  "heap free",
  "wifi rssi"
],
"log_include_only": [
  "packet",
  "mqtt",
  "http"
]
```

**Note:** Check your ESP32 firmware documentation for available filtering options.

### WebSocket Authentication

If your logging server requires authentication:

```json
"log_ws_url": "ws://192.168.222.3:10180/ws",
"log_ws_auth_token": "your-jwt-token-here"
```

To get a JWT token:
1. Login to logging server web UI
2. Open browser DevTools (F12)
3. Go to Application > Cookies
4. Copy the `sessionId` or JWT token value

### Multiple Log Destinations

You can configure ESP32 to send logs to multiple destinations:

```json
"log_ws_enabled": true,
"log_ws_url": "ws://192.168.222.3:10180/ws",
"log_syslog_enabled": true,
"log_syslog_server": "192.168.222.3",
"log_syslog_port": 514
```

---

## 📈 Performance Tuning

### For High-Frequency Events (Lights)

If you're controlling many lights and generating lots of logs:

```json
"log_level": "warning",        // Reduce verbosity
"log_batch_ms": 200,           // Batch longer
"log_buffer_size": 512,        // Increase buffer
"packet_repeat_throttle_sensitivity": 0
```

### For Debugging

When troubleshooting issues:

```json
"log_level": "debug",          // Maximum verbosity
"log_batch_ms": 50,            // Send immediately
"log_buffer_size": 128         // Standard buffer
```

### For Low-Bandwidth Networks

If network is slow or congested:

```json
"log_level": "info",
"log_batch_ms": 500,           // Batch longer
"log_buffer_size": 256,        // Larger buffer
"mqtt_state_rate_limit": 1000  // Reduce MQTT traffic
```

---

## 🔐 Security Considerations

### Network Security

Your ESP32 is on a different subnet (192.168.224.x) than the logging server (192.168.222.x). This is good for network segmentation!

**Ensure proper routing:**
```
ESP32 (192.168.224.4)
  → Gateway (192.168.224.1)
  → Router/Firewall
  → Logging Server (192.168.222.3)
```

### WebSocket Security

**Current setup:** Unencrypted WebSocket (ws://)

**For production, consider:**
1. Using WSS (WebSocket Secure)
2. Adding authentication token
3. Network firewall rules
4. VPN if accessing remotely

**To enable WSS:**
```json
"log_ws_url": "wss://192.168.222.3:10181/ws"  // Note: wss:// and port 10181
```

Requires HTTPS on logging server (see DESKTOP_DEPLOYMENT_GUIDE.md).

---

## 📊 Monitoring ESP32 Logs

### In Logging Server Dashboard

1. **Filter by source:**
   ```
   source:esp32
   source:milight
   ```

2. **Filter by log level:**
   ```
   level:warning
   level:error
   ```

3. **Filter by component:**
   ```
   component:rf24
   component:mqtt
   ```

4. **Time-based filtering:**
   - Use dashboard date/time selectors
   - Last hour, last 24 hours, etc.

### Create Custom Dashboard Widget

In logging server web UI:
1. Go to Dashboard
2. Click "Add Widget"
3. Configure:
   - **Type:** Log Stream
   - **Filter:** `source:esp32`
   - **Title:** ESP32 MiLight Hub Logs
   - **Refresh:** Auto (real-time)

---

## 🎯 Recommended Settings

For your MiLight Hub setup, these settings are optimal:

```json
{
  "log_ws_enabled": true,
  "log_ws_url": "ws://192.168.222.3:10180/ws",
  "log_level": "info",
  "log_batch_ms": 100,
  "log_buffer_size": 256
}
```

**Why these settings:**
- `info` level - Good balance of detail vs. noise
- `100ms` batching - Low latency, reasonable network usage
- `256` buffer - Handles bursts of light commands

---

## 🔄 Applying Configuration Changes

### Method 1: Web Interface

1. Go to `http://192.168.224.4`
2. Navigate to Settings
3. Modify log settings
4. Click Save
5. Restart device (if required)

### Method 2: Upload JSON

1. Modify `esp32-poe-settings.json`
2. Upload via web interface
3. Restart device

### Method 3: API (if supported)

```bash
curl -X POST http://192.168.224.4/settings \
  -H "Content-Type: application/json" \
  -d @esp32-poe-settings.json
```

---

## 📚 Related Documentation

- **WebSocket Setup:** See `WEBSOCKET_SETUP.md`
- **Logging Server Deployment:** See `DESKTOP_DEPLOYMENT_GUIDE.md`
- **Home Assistant Integration:** See `HOME_ASSISTANT_INTEGRATION.md`
- **ESP32 Firmware:** Check MiLight Hub documentation

---

## 🆘 Getting Help

### Check ESP32 Status

```bash
# Via web interface
http://192.168.224.4/status

# Via API (if available)
curl http://192.168.224.4/api/status
```

### Check Logging Server

```bash
# Health check
curl http://192.168.222.3:10180/health

# WebSocket clients
curl http://192.168.222.3:10180/api/websocket/clients
```

### View Logs

**ESP32 logs (serial):**
- Connect via USB
- Use serial monitor (115200 baud)

**Logging server:**
```bash
docker logs rejavarti-logging-server --tail 100 | grep -i websocket
```

---

## ✅ Verification Checklist

- [ ] ESP32 is powered on and connected to network
- [ ] Static IP is accessible: `ping 192.168.224.4`
- [ ] Logging server is running on Unraid
- [ ] WebSocket endpoint is accessible: `ws://192.168.222.3:10180/ws`
- [ ] `log_ws_enabled` is set to `true`
- [ ] `log_ws_url` points to correct server
- [ ] Log level is appropriate for your needs
- [ ] Logs are appearing in logging server dashboard
- [ ] Real-time updates are working

**Your ESP32 POE device is configured and ready to stream logs! 🚀**
