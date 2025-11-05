# ESPHome Logging Server Integration Guide 📡

Your logging server is **already configured** to accept ESPHome logs! This guide helps you configure your ESPHome devices to send logs to the server.

---

## 🎯 Quick Start

### Prerequisites
- ✅ Logging server running on port **10180**
- ✅ ESPHome device on same network
- ✅ Server IP address (e.g., `192.168.1.100`)

### Configuration Files Included

1. **ESPHOME_LOGGING_BASIC.yaml** - Minimal setup (ERROR logs only)
2. **ESPHOME_LOGGING_FULL.yaml** - Complete setup (all log levels + MQTT fallback)

---

## 📋 Option 1: Basic Configuration (Recommended to Start)

**Best for:** Testing, low network traffic, production stability

**What it logs:** 
- ❌ ERROR messages (critical issues)
- ⚠️ WARN messages (optional, uncomment to enable)
- ✅ Boot notifications

**Network impact:** Minimal (only errors)

### Quick Setup

1. Copy `ESPHOME_LOGGING_BASIC.yaml` sections to your device YAML
2. Replace `YOUR_SERVER_IP` with your server's IP address (e.g., `192.168.1.100`)
3. Replace `my-device` with your device name
4. Flash to device

### Test It

```bash
# From another machine, test the endpoint
curl -X POST http://YOUR_SERVER_IP:10180/log \
  -H "Content-Type: application/json" \
  -d '{
    "message": "ESPHome test message from curl",
    "severity": "info",
    "category": "esphome",
    "source": "test-device"
  }'
```

Check your logging server dashboard - you should see the test message appear!

---

## 📋 Option 2: Full Configuration (Advanced)

**Best for:** Development, detailed monitoring, troubleshooting

**What it logs:**
- 🐛 DEBUG messages (all details)
- ℹ️ INFO messages (general status)
- ⚠️ WARN messages (issues)
- ❌ ERROR messages (critical)
- 📊 System health (WiFi, memory, uptime)
- 🔄 MQTT fallback if HTTP fails

**Network impact:** Moderate to High (depending on verbosity)

### Quick Setup

1. Copy `ESPHOME_LOGGING_FULL.yaml` sections to your device YAML
2. Replace:
   - `YOUR_SERVER_IP` → Your logging server IP
   - `YOUR_MQTT_BROKER` → Your MQTT broker IP (optional)
   - `my-device` → Your device name
3. Flash to device

### Features

✅ **Automatic fallback:** If HTTP fails, switches to MQTT  
✅ **Health monitoring:** Tracks WiFi signal, memory, uptime  
✅ **Boot notifications:** Logs device startup with IP/MAC  
✅ **Smart filtering:** Critical logs always sent, info can be throttled  

---

## 🔍 What Your Server Already Supports

Your logging server **automatically detects** ESPHome devices:

### Endpoint Detection
```javascript
// Server detects ESPHome via the /log endpoint
if (url.includes('/log')) {
    // Marks as ESP32/ESPHome connection
    // Shows in Network Monitor widget with teal icon
}
```

### Connection Tracking
- 🔵 **ESP32 icon** appears in Network Monitor widget
- 📊 **Request counts** tracked per device
- 🟢 **Live status** (green dot = active in last 60s)
- 📈 **Bandwidth** monitoring

### Data Format Expected
```json
{
  "message": "Your log message",
  "severity": "info|warning|error",
  "category": "esphome",
  "source": "device-name"
}
```

---

## 🎛️ Customization Tips

### Filter Noisy Components

```yaml
logger:
  level: DEBUG
  logs:
    sensor: INFO      # Less verbose for sensors
    mqtt: WARN        # Only warnings from MQTT
    component: ERROR  # Only errors from components
```

### Batch Logs (Reduce Network Traffic)

Instead of logging every event, batch them:

```yaml
# Example: Log WiFi signal every 5 minutes instead of every change
sensor:
  - platform: wifi_signal
    update_interval: 300s  # 5 minutes
```

### Log Only Significant Changes

```yaml
sensor:
  - platform: dht
    temperature:
      name: "Temperature"
      filters:
        - delta: 0.5  # Only log if changed by 0.5°C
      on_value:
        then:
          - http_request.post:
              url: "http://YOUR_SERVER_IP:10180/log"
              # ... rest of config
```

---

## 🚨 Troubleshooting

### Logs Not Appearing?

1. **Check network connectivity:**
   ```bash
   # From ESPHome device serial console
   # You should see: "Sending ERROR log to server"
   ```

2. **Verify server is reachable:**
   ```bash
   ping YOUR_SERVER_IP
   curl http://YOUR_SERVER_IP:10180/health
   ```

3. **Check server logs:**
   ```bash
   # On server machine
   cd logging-server
   cat data/logs/access.log | grep "/log"
   ```

4. **Enable ESPHome debug:**
   ```yaml
   logger:
     level: VERBOSE  # Temporarily for debugging
   ```

### High Network Traffic?

**Solution 1:** Use ERROR-only logging
```yaml
logger:
  on_message:
    - level: ERROR  # Remove INFO and WARN handlers
```

**Solution 2:** Increase update intervals
```yaml
sensor:
  - platform: wifi_signal
    update_interval: 300s  # Was 60s
```

**Solution 3:** Add filters
```yaml
sensor:
  - platform: template
    filters:
      - throttle: 60s  # Max one log per minute
```

### Server Shows "Connection Inactive"?

The Network Monitor widget shows **green dot** only if device sent data in last **60 seconds**.

For devices that log infrequently:
- This is **normal behavior**
- Gray dot = no logs recently (device might still be online)
- Green dot = actively logging

---

## 📊 Viewing Logs in Dashboard

Once configured:

1. **Navigate to:** `http://YOUR_SERVER_IP:10180/dashboard`
2. **Check Network Monitor widget:** Should show ESP32 device with request count
3. **View logs:** Click "Logs" in sidebar → Filter by source: `device-name`
4. **Advanced search:** Use category: `esphome` to see all ESPHome logs

### Useful Filters

| Filter | Description |
|--------|-------------|
| `source:device-name` | All logs from specific device |
| `category:esphome` | All ESPHome logs |
| `severity:error` | Only errors |
| `message:WiFi` | Logs containing "WiFi" |

---

## 🎯 Best Practices

### ✅ DO:
- Start with BASIC config (errors only)
- Test with one device first
- Monitor network traffic
- Use meaningful device names
- Log boot events for diagnostics

### ❌ DON'T:
- Log every sensor reading (use delta filters)
- Use DEBUG level in production
- Forget to set `update_interval` (defaults can be frequent)
- Leave development logging enabled long-term

---

## 📈 Production Recommendations

### Stable Production Setup
```yaml
logger:
  level: INFO  # Balanced verbosity
  on_message:
    - level: ERROR  # Always log errors
    - level: WARN   # Log warnings
    # Skip INFO in production to reduce traffic

# Log only important events
esphome:
  on_boot:  # Startup notification
  on_shutdown:  # Shutdown notification (if supported)
```

### Development/Testing Setup
```yaml
logger:
  level: DEBUG  # See everything
  on_message:
    - level: ERROR
    - level: WARN
    - level: INFO
    # Full logging for troubleshooting
```

---

## 🔗 Integration with Home Assistant

ESPHome can send logs to **both** your logging server AND Home Assistant:

```yaml
# Send to logging server
logger:
  on_message:
    - http_request.post:
        url: "http://YOUR_SERVER_IP:10180/log"
        # ...

# Also expose to Home Assistant
api:
  encryption:
    key: "YOUR_KEY"
  
# Home Assistant will show device logs in its UI
```

Benefits:
- ✅ Centralized logging in your server
- ✅ Home Assistant still has access to logs
- ✅ Best of both worlds!

---

## 📝 Example: Complete Working Device

Here's a minimal working example:

```yaml
esphome:
  name: temperature-sensor
  platform: ESP32
  board: nodemcu-32s

wifi:
  ssid: "MyWiFi"
  password: "MyPassword"

logger:
  level: INFO

http_request:
  useragent: esphome/temperature-sensor
  timeout: 10s

logger:
  on_message:
    - level: ERROR
      then:
        - http_request.post:
            url: "http://192.168.1.100:10180/log"
            headers:
              Content-Type: "application/json"
            json:
              message: !lambda 'return std::string(tag) + ": " + message;'
              severity: "error"
              category: "esphome"
              source: "temperature-sensor"

api:
ota:

sensor:
  - platform: dht
    model: DHT22
    pin: GPIO4
    temperature:
      name: "Temperature"
    humidity:
      name: "Humidity"
    update_interval: 60s
```

---

## 🆘 Need Help?

1. Check server logs: `logging-server/data/logs/access.log`
2. Check ESPHome serial console for HTTP errors
3. Verify JSON format matches server expectations
4. Test with `curl` first to isolate issues

---

## ✅ Success Checklist

- [ ] Server running and accessible
- [ ] Test `curl` command works
- [ ] ESPHome device has network connectivity
- [ ] Server IP address is correct in YAML
- [ ] Device flashed with updated config
- [ ] Logs appearing in dashboard
- [ ] Network Monitor shows device connection
- [ ] Severity levels displaying correctly

---

**That's it!** Your ESPHome devices can now send logs to your centralized logging server. Start with the basic config and expand as needed. 🚀
