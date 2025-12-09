# Home Assistant to Logging Server Integration Guide

## 🏠 Overview

Your logging server supports receiving logs from Home Assistant through multiple methods:

1. **RESTful API** - HTTP POST endpoints
2. **WebSocket** - Real-time streaming (already configured on your ESP32!)
3. **MQTT Bridge** - Via MQTT broker
4. **Syslog** - Standard syslog protocol

---

## 🚀 Quick Setup - RESTful Command (Recommended)

This method sends logs directly from Home Assistant to your logging server via HTTP POST.

### Step 1: Add to Home Assistant configuration.yaml

```yaml
# configuration.yaml
rest_command:
  send_log_to_server:
    url: "http://192.168.222.3:10180/api/logs/ingest"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "timestamp": "{{ now().isoformat() }}",
        "message": "{{ message }}",
        "level": "{{ level | default('info') }}",
        "source": "{{ source | default('home-assistant') }}",
        "service": "{{ service | default('automation') }}",
        "entity_id": "{{ entity_id | default('') }}",
        "domain": "{{ domain | default('System') }}",
        "event_type": "{{ event_type | default('service_called') }}"
      }
```

### Step 2: Create Automation to Send Logs

```yaml
# automations.yaml
- alias: "Log Service Calls to External Server"
  description: "Send all service calls to external logging server"
  trigger:
    - platform: event
      event_type: call_service
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "Service called: {{ trigger.event.data.service }}"
        level: "info"
        source: "home-assistant"
        service: "{{ trigger.event.data.domain }}.{{ trigger.event.data.service }}"
        domain: "{{ trigger.event.data.domain }}"
        event_type: "service_called"

- alias: "Log Automation Triggers to External Server"
  description: "Send automation trigger events to logging server"
  trigger:
    - platform: event
      event_type: automation_triggered
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "Automation triggered: {{ trigger.event.data.name }}"
        level: "info"
        source: "home-assistant"
        service: "automation"
        entity_id: "{{ trigger.event.data.entity_id }}"
        domain: "System"
        event_type: "automation_triggered"

- alias: "Log State Changes to External Server"
  description: "Send important state changes to logging server"
  trigger:
    - platform: state
      entity_id:
        - light.*
        - switch.*
        - automation.*
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "{{ trigger.to_state.attributes.friendly_name | default(trigger.entity_id) }} changed from {{ trigger.from_state.state }} to {{ trigger.to_state.state }}"
        level: "info"
        source: "home-assistant"
        service: "{{ trigger.to_state.domain }}"
        entity_id: "{{ trigger.entity_id }}"
        domain: "{{ trigger.to_state.domain }}"
        event_type: "state_change"
```

### Step 3: Restart Home Assistant

```bash
# Development Tools > YAML > Check Configuration
# Then: Development Tools > Restart
```

---

## 🔌 Method 2: WebSocket Streaming (For ESP32/Custom Components)

Your ESP32 POE device is **already configured** to send logs via WebSocket!

```json
"log_ws_enabled": true,
"log_ws_url": "ws://192.168.222.3:10180/ws"
```

### For Home Assistant Custom Component

If you want to create a custom component to stream logs via WebSocket:

```python
# custom_components/external_logger/__init__.py
import asyncio
import json
import logging
import websockets
from homeassistant.core import HomeAssistant, Event

_LOGGER = logging.getLogger(__name__)

DOMAIN = "external_logger"
WS_URL = "ws://192.168.222.3:10180/ws"

async def async_setup(hass: HomeAssistant, config: dict):
    """Set up the external logger component."""
    
    async def send_log(message, level="info"):
        """Send log to external server via WebSocket."""
        try:
            async with websockets.connect(WS_URL) as ws:
                # Subscribe to logs channel
                await ws.send(json.dumps({
                    "event": "subscribe",
                    "payload": {"channels": ["logs"]}
                }))
                
                # Send log entry
                await ws.send(json.dumps({
                    "event": "log",
                    "payload": {
                        "message": message,
                        "level": level,
                        "source": "home-assistant",
                        "timestamp": datetime.now().isoformat()
                    }
                }))
        except Exception as e:
            _LOGGER.error(f"Failed to send log: {e}")
    
    async def handle_event(event: Event):
        """Handle events and send to external logger."""
        event_type = event.event_type
        data = event.data
        
        if event_type == "call_service":
            message = f"Service called: {data.get('domain')}.{data.get('service')}"
            await send_log(message, "info")
        elif event_type == "state_changed":
            entity_id = data.get("entity_id")
            new_state = data.get("new_state")
            old_state = data.get("old_state")
            if new_state and old_state:
                message = f"{entity_id} changed from {old_state.state} to {new_state.state}"
                await send_log(message, "info")
    
    # Listen to all events
    hass.bus.async_listen("call_service", handle_event)
    hass.bus.async_listen("state_changed", handle_event)
    hass.bus.async_listen("automation_triggered", handle_event)
    
    return True
```

---

## 📨 Method 3: HTTP Webhook (Simple)

### Create Webhook Automation

```yaml
# automations.yaml
- alias: "Send Logs via Webhook"
  trigger:
    - platform: event
      event_type: call_service
  action:
    - service: shell_command.send_log
      data:
        message: "{{ trigger.event.data.service }}"

# configuration.yaml
shell_command:
  send_log: >
    curl -X POST http://192.168.222.3:10180/api/logs/ingest \
      -H "Content-Type: application/json" \
      -d '{"message":"{{ message }}","level":"info","source":"home-assistant"}'
```

---

## 🔍 Method 4: Syslog Integration

Home Assistant can send logs via Syslog protocol.

### Add to configuration.yaml

```yaml
# configuration.yaml
logger:
  default: info
  logs:
    homeassistant.core: info
    homeassistant.components: info

# Use external syslog (requires custom component or add-on)
syslog:
  host: 192.168.222.3
  port: 514
  protocol: udp
```

**Note**: This requires a syslog add-on or custom component.

---

## 📊 Method 5: Node-RED Integration

If you use Node-RED with Home Assistant, you can easily bridge logs:

### Node-RED Flow

```json
[
  {
    "id": "ha_event_listener",
    "type": "server-state-changed",
    "z": "flow_id",
    "name": "Listen to State Changes",
    "server": "ha_server",
    "entityidfilter": "",
    "outputinitially": false,
    "x": 150,
    "y": 100,
    "wires": [["format_log"]]
  },
  {
    "id": "format_log",
    "type": "function",
    "z": "flow_id",
    "name": "Format Log",
    "func": "msg.payload = {\n  timestamp: new Date().toISOString(),\n  message: `${msg.data.entity_id} changed to ${msg.data.new_state.state}`,\n  level: 'info',\n  source: 'home-assistant',\n  entity_id: msg.data.entity_id,\n  domain: msg.data.entity_id.split('.')[0]\n};\nreturn msg;",
    "x": 350,
    "y": 100,
    "wires": [["send_to_logger"]]
  },
  {
    "id": "send_to_logger",
    "type": "http request",
    "z": "flow_id",
    "name": "Send to Logging Server",
    "method": "POST",
    "ret": "txt",
    "url": "http://192.168.222.3:10180/api/logs/ingest",
    "tls": "",
    "x": 570,
    "y": 100,
    "wires": [[]]
  }
]
```

---

## 🧪 Testing Your Setup

### Test 1: Manual REST Command

In Home Assistant Developer Tools > Services:

```yaml
service: rest_command.send_log_to_server
data:
  message: "Test log from Home Assistant"
  level: "info"
  source: "home-assistant"
  service: "test"
```

### Test 2: Verify in Logging Server

1. Open your logging server: http://192.168.222.3:10180
2. Go to Dashboard
3. Look for logs with source = "home-assistant"
4. Use filters: `source:home-assistant`

### Test 3: Check WebSocket Connection

```bash
# From your Windows machine
node test-websocket.js ws://192.168.222.3:10180/ws
```

---

## 📝 Converting Your Existing Logs

Based on your log format:
```
2025-11-19 11:13:31  System  automation  info  Service called: system_log.write
```

### Parsing Template for REST Command

```yaml
rest_command:
  send_log_to_server:
    url: "http://192.168.222.3:10180/api/logs/ingest"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "timestamp": "{{ timestamp | default(now().isoformat()) }}",
        "message": "{{ message }}",
        "level": "{{ level | default('INFO') | lower }}",
        "source": "home-assistant",
        "domain": "{{ domain | default('System') }}",
        "service": "{{ service | default('automation') }}",
        "category": "{{ category | default('info') }}"
      }
```

---

## 🔐 Security Considerations

### Option 1: Add Authentication Header

If your logging server requires authentication:

```yaml
rest_command:
  send_log_to_server:
    url: "http://192.168.222.3:10180/api/logs/ingest"
    method: POST
    headers:
      Content-Type: "application/json"
      Authorization: "Bearer YOUR_JWT_TOKEN"
    payload: >
      {...}
```

### Option 2: Use Secrets

```yaml
# secrets.yaml
logging_server_url: "http://192.168.222.3:10180/api/logs/ingest"
logging_server_token: "your-jwt-token-here"

# configuration.yaml
rest_command:
  send_log_to_server:
    url: !secret logging_server_url
    headers:
      Authorization: !secret logging_server_token
```

---

## 📈 Example Use Cases

### Log Important Automations

```yaml
- alias: "Log Security Events"
  trigger:
    - platform: state
      entity_id: binary_sensor.front_door
      to: "on"
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "🚨 Front door opened!"
        level: "warning"
        source: "home-assistant-security"
        entity_id: "binary_sensor.front_door"
```

### Log Climate Changes

```yaml
- alias: "Log Temperature Changes"
  trigger:
    - platform: state
      entity_id: climate.living_room
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "Living room temperature set to {{ trigger.to_state.attributes.temperature }}°C"
        level: "info"
        source: "home-assistant-climate"
```

### Log Energy Usage

```yaml
- alias: "Log High Energy Usage"
  trigger:
    - platform: numeric_state
      entity_id: sensor.home_power
      above: 5000  # 5kW
  action:
    - service: rest_command.send_log_to_server
      data:
        message: "⚡ High energy usage detected: {{ states('sensor.home_power') }}W"
        level: "warning"
        source: "home-assistant-energy"
```

---

## 🔧 Troubleshooting

### Logs Not Appearing?

1. **Check Home Assistant logs:**
   ```
   Settings > System > Logs
   ```

2. **Test REST command manually:**
   ```yaml
   service: rest_command.send_log_to_server
   data:
     message: "Test"
   ```

3. **Verify logging server is reachable:**
   ```bash
   # From Home Assistant terminal
   curl http://192.168.222.3:10180/health
   ```

4. **Check firewall settings on Unraid**

5. **Verify port mapping in docker-compose:**
   ```bash
   docker ps | grep logging-server
   ```

---

## 📚 API Endpoints

Your logging server accepts logs at:

- **HTTP POST**: `http://192.168.222.3:10180/api/logs/ingest`
- **WebSocket**: `ws://192.168.222.3:10180/ws`
- **Syslog UDP**: `192.168.222.3:514`
- **Syslog TCP**: `192.168.222.3:601`

### JSON Format

```json
{
  "timestamp": "2025-12-06T10:30:00.000Z",
  "message": "Service called: light.turn_on",
  "level": "info",
  "source": "home-assistant",
  "service": "light.turn_on",
  "entity_id": "light.living_room",
  "domain": "light"
}
```

---

## 🎯 Next Steps

1. ✅ Add `rest_command` to configuration.yaml
2. ✅ Create automation to send logs
3. ✅ Restart Home Assistant
4. ✅ Trigger a service call (turn on/off a light)
5. ✅ Check your logging server dashboard
6. ✅ Set up filters in dashboard for `source:home-assistant`

**Your Home Assistant logs will now stream in real-time to your logging server! 🎉**
