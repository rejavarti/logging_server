# 🔌 Service Integrations Guide

Complete guide to integrate Home Assistant, Plex, Unraid, UniFi, Cloudflare, and Netdata with your logging server.

---

## 📋 **Your Logging Server Endpoints**

- **Base URL**: `http://192.168.222.3:10180`
- **Main Logging Endpoint**: `POST http://192.168.222.3:10180/log`
- **Authentication**: Basic Auth
  - Username: `admin` (or your AUTH_USERNAME)
  - Password: `943Nelson8034!` (or your AUTH_PASSWORD)

---

## 1. 🏠 **Home Assistant Integration**

### Method 1: RESTful Command (Recommended)

Add to your `configuration.yaml`:

```yaml
# Add to configuration.yaml
rest_command:
  send_to_logging_server:
    url: "http://192.168.222.3:10180/log"
    method: POST
    username: admin
    password: "943Nelson8034!"
    content_type: "application/json"
    payload: >
      {
        "timestamp": "{{ now().isoformat() }}",
        "category": "{{ category | default('home_automation') }}",
        "source": "HomeAssistant",
        "device_id": "{{ device_id | default('ha-main') }}",
        "event_type": "{{ event_type }}",
        "severity": "{{ severity | default('info') }}",
        "message": "{{ message }}",
        "metadata": {{ metadata | default('{}') | tojson }}
      }
```

### Create Automations for Events

#### Option 1: Log EVERYTHING (Comprehensive Logging)

This automation logs **ALL** state changes from all entities in Home Assistant. Perfect for complete system visibility.

```yaml
# Add to automations.yaml or configuration.yaml
automation:
  - alias: "Log ALL State Changes to Server"
    description: "Logs every state change in Home Assistant to the logging server"
    trigger:
      - platform: event
        event_type: state_changed
    condition:
      # Filter out frequent/noisy updates if needed
      - condition: template
        value_template: >
          {% set entity = trigger.event.data.entity_id %}
          {% set old = trigger.event.data.old_state %}
          {% set new = trigger.event.data.new_state %}
          {{ old != None and new != None and old.state != new.state and
             not entity.startswith('sensor.time') and
             not entity.startswith('sun.') and
             not entity.endswith('_last_updated') }}
    action:
      - service: rest_command.send_to_logging_server
        data:
          category: >
            {% set entity = trigger.event.data.entity_id %}
            {% if entity.startswith('alarm_') %}security
            {% elif entity.startswith('lock.') %}security
            {% elif entity.startswith('binary_sensor.') and 'door' in entity %}security
            {% elif entity.startswith('binary_sensor.') and 'window' in entity %}security
            {% elif entity.startswith('binary_sensor.') and 'motion' in entity %}security
            {% elif entity.startswith('climate.') %}climate
            {% elif entity.startswith('light.') %}lighting
            {% elif entity.startswith('switch.') %}power
            {% elif entity.startswith('media_player.') %}media
            {% elif entity.startswith('sensor.') and 'temperature' in entity %}climate
            {% elif entity.startswith('sensor.') and 'humidity' in entity %}climate
            {% elif entity.startswith('sensor.') and 'power' in entity %}energy
            {% elif entity.startswith('person.') %}presence
            {% elif entity.startswith('device_tracker.') %}presence
            {% else %}home_automation
            {% endif %}
          device_id: "{{ trigger.event.data.entity_id }}"
          event_type: "state_change"
          severity: >
            {% set entity = trigger.event.data.entity_id %}
            {% set new_state = trigger.event.data.new_state.state %}
            {% if entity.startswith('alarm_') and new_state == 'triggered' %}critical
            {% elif entity.startswith('binary_sensor.') and 'smoke' in entity and new_state == 'on' %}critical
            {% elif entity.startswith('binary_sensor.') and 'water' in entity and new_state == 'on' %}critical
            {% elif entity.startswith('lock.') and new_state == 'unlocked' %}warning
            {% elif entity.startswith('binary_sensor.') and ('door' in entity or 'window' in entity) and new_state == 'on' %}warning
            {% elif new_state == 'unavailable' or new_state == 'unknown' %}warning
            {% else %}info
            {% endif %}
          message: >
            {% set old = trigger.event.data.old_state %}
            {% set new = trigger.event.data.new_state %}
            {% set name = new.attributes.friendly_name if new.attributes.friendly_name else trigger.event.data.entity_id %}
            {{ name }} changed from {{ old.state }} to {{ new.state }}
          metadata: >
            {{ {
              'entity_id': trigger.event.data.entity_id,
              'old_state': trigger.event.data.old_state.state,
              'new_state': trigger.event.data.new_state.state,
              'old_attributes': trigger.event.data.old_state.attributes,
              'new_attributes': trigger.event.data.new_state.attributes,
              'last_changed': trigger.event.data.new_state.last_changed,
              'last_updated': trigger.event.data.new_state.last_updated
            } | tojson }}

  - alias: "Log ALL Service Calls"
    description: "Logs every service call made in Home Assistant"
    trigger:
      - platform: event
        event_type: call_service
    action:
      - service: rest_command.send_to_logging_server
        data:
          category: "automation"
          device_id: "ha-services"
          event_type: "service_call"
          severity: "info"
          message: "Service called: {{ trigger.event.data.domain }}.{{ trigger.event.data.service }}"
          metadata: >
            {{ {
              'domain': trigger.event.data.domain,
              'service': trigger.event.data.service,
              'service_data': trigger.event.data.service_data
            } | tojson }}

  - alias: "Log Automation Triggers"
    description: "Logs when automations are triggered"
    trigger:
      - platform: event
        event_type: automation_triggered
    action:
      - service: rest_command.send_to_logging_server
        data:
          category: "automation"
          device_id: "{{ trigger.event.data.entity_id }}"
          event_type: "automation_triggered"
          severity: "info"
          message: "Automation triggered: {{ trigger.event.data.name }}"
          metadata: >
            {{ {
              'entity_id': trigger.event.data.entity_id,
              'name': trigger.event.data.name,
              'source': trigger.event.data.source
            } | tojson }}

  - alias: "Log Script Executions"
    description: "Logs when scripts are executed"
    trigger:
      - platform: event
        event_type: script_started
    action:
      - service: rest_command.send_to_logging_server
        data:
          category: "automation"
          device_id: "{{ trigger.event.data.entity_id }}"
          event_type: "script_started"
          severity: "info"
          message: "Script started: {{ trigger.event.data.name }}"
          metadata: >
            {{ trigger.event.data | tojson }}
```

#### Option 2: Log Specific Categories (Selective Logging)

If "log everything" is too verbose, use these targeted automations instead:

```yaml
# Log all motion sensor events
automation:
  - alias: "Log Motion Detection to Server"
    trigger:
      - platform: state
        entity_id: binary_sensor.living_room_motion
        to: "on"
    action:
      - service: rest_command.send_to_logging_server
        data:
          event_type: "motion_detected"
          severity: "info"
          message: "Motion detected in Living Room"
          device_id: "motion_living_room"
          metadata: >
            {{ {'entity_id': trigger.entity_id, 'from_state': trigger.from_state.state, 'to_state': trigger.to_state.state} | tojson }}

  - alias: "Log Door/Window Sensors"
    trigger:
      - platform: state
        entity_id: 
          - binary_sensor.front_door
          - binary_sensor.back_door
          - binary_sensor.bedroom_window
    action:
      - service: rest_command.send_to_logging_server
        data:
          event_type: "door_window_event"
          severity: "{{ 'warning' if trigger.to_state.state == 'on' else 'info' }}"
          message: "{{ trigger.to_state.attributes.friendly_name }} {{ 'opened' if trigger.to_state.state == 'on' else 'closed' }}"
          device_id: "{{ trigger.entity_id }}"
          
  - alias: "Log System Events"
    trigger:
      - platform: homeassistant
        event: start
      - platform: homeassistant
        event: shutdown
    action:
      - service: rest_command.send_to_logging_server
        data:
          event_type: "system_event"
          severity: "info"
          message: "Home Assistant {{ trigger.event }}"
          category: "system"
```

### Method 2: Using notify service

```yaml
notify:
  - platform: rest
    name: logging_server
    resource: http://192.168.222.3:10180/log
    method: POST
    authentication: basic
    username: admin
    password: "943Nelson8034!"
    data:
      category: "home_automation"
      source: "HomeAssistant"
      device_id: "ha-notify"
      event_type: "notification"
      severity: "info"
```

---

## 2. 🎬 **Plex Integration**

Plex supports webhook notifications. Configure it to send events to your server.

### Setup Plex Webhooks

1. **Get Plex Pass** (required for webhooks)
2. **Configure Webhook** in Plex Settings:
   - URL: `http://192.168.222.3:10180/api/webhooks/plex`
   - Method: POST

### Create Webhook Handler in Your Logging Server

Add this endpoint to handle Plex webhooks (you'll need to add this code):

**Note**: Since you have webhook support in your dashboard, you can:
1. Go to **Settings → Webhooks** in your dashboard
2. Create a new webhook called "Plex Events"
3. URL: Auto-generated by your server
4. Event types: All
5. Copy the webhook URL and add it to Plex

**Or use a Node-RED flow to transform Plex webhook data:**

```json
[
    {
        "id": "plex_webhook",
        "type": "http in",
        "url": "/plex",
        "method": "post"
    },
    {
        "id": "transform_plex",
        "type": "function",
        "func": "const payload = msg.payload;\nconst event = payload.event;\nconst metadata = payload.Metadata || {};\n\nmsg.payload = {\n    timestamp: new Date().toISOString(),\n    category: 'media',\n    source: 'Plex',\n    device_id: payload.Player?.title || 'plex-server',\n    event_type: event,\n    severity: 'info',\n    message: `${event}: ${metadata.title || 'Unknown'}`,\n    metadata: JSON.stringify({\n        user: payload.Account?.title,\n        media_type: metadata.type,\n        title: metadata.title,\n        year: metadata.year,\n        rating: metadata.rating\n    })\n};\n\nreturn msg;"
    },
    {
        "id": "send_to_logger",
        "type": "http request",
        "method": "POST",
        "url": "http://192.168.222.3:10180/log",
        "authType": "basic",
        "username": "admin",
        "password": "943Nelson8034!"
    }
]
```

---

## 3. 🖥️ **Unraid Integration**

### Method 1: Syslog Forwarding

Edit `/boot/config/go` to add syslog forwarding:

```bash
# Add to /boot/config/go
rsyslogd -i /var/run/rsyslogd.pid
echo "*.* @192.168.222.3:10514" >> /etc/rsyslog.conf
killall -HUP rsyslogd
```

**Note**: Your logging server needs a syslog listener. I can help you add this if needed.

### Method 2: Custom Script for Docker Events

Create `/boot/config/plugins/user.scripts/scripts/docker_logger/script`:

```bash
#!/bin/bash
# Monitor Docker events and send to logging server

docker events --format '{{json .}}' | while read event; do
    STATUS=$(echo $event | jq -r '.status')
    CONTAINER=$(echo $event | jq -r '.Actor.Attributes.name')
    TIME=$(echo $event | jq -r '.time')
    
    curl -X POST http://192.168.222.3:10180/log \
        -u admin:943Nelson8034! \
        -H "Content-Type: application/json" \
        -d "{
            \"timestamp\": \"$(date -Iseconds)\",
            \"category\": \"infrastructure\",
            \"source\": \"Unraid\",
            \"device_id\": \"unraid-docker\",
            \"event_type\": \"docker_$STATUS\",
            \"severity\": \"info\",
            \"message\": \"Container $CONTAINER: $STATUS\",
            \"metadata\": $(echo $event | jq -c .)
        }"
done
```

### Method 3: Unraid Notifications Plugin

Install **Unraid Notifications** plugin and configure webhook:

1. Go to **Settings → Notification Settings**
2. Add **Custom Agent**
3. **Webhook URL**: `http://192.168.222.3:10180/log`
4. **Method**: POST
5. **Auth**: Basic (admin / 943Nelson8034!)

---

## 4. 📡 **UniFi Controller Integration**

### Method 1: Using UniFi Event Logs

Create a script to poll UniFi events:

```bash
#!/bin/bash
# Save as /usr/local/bin/unifi_logger.sh

UNIFI_HOST="your-unifi-controller"
UNIFI_USERNAME="admin"
UNIFI_PASSWORD="your-password"
SITE="default"

# Login to UniFi
COOKIE=$(curl -s -X POST "https://$UNIFI_HOST:8443/api/login" \
    --cookie-jar - \
    --data "{\"username\":\"$UNIFI_USERNAME\",\"password\":\"$UNIFI_PASSWORD\"}" \
    --insecure | grep "unifises" | awk '{print $7}')

# Get recent events
curl -s "https://$UNIFI_HOST:8443/api/s/$SITE/stat/event?_limit=100" \
    --cookie "unifises=$COOKIE" \
    --insecure | jq -c '.data[]' | while read event; do
    
    KEY=$(echo $event | jq -r '.key')
    MSG=$(echo $event | jq -r '.msg')
    TIME=$(echo $event | jq -r '.time')
    
    curl -X POST http://192.168.222.3:10180/log \
        -u admin:943Nelson8034! \
        -H "Content-Type: application/json" \
        -d "{
            \"timestamp\": \"$(date -d @$TIME -Iseconds)\",
            \"category\": \"network\",
            \"source\": \"UniFi\",
            \"device_id\": \"unifi-controller\",
            \"event_type\": \"$KEY\",
            \"severity\": \"info\",
            \"message\": \"$MSG\",
            \"metadata\": $(echo $event | jq -c .)
        }"
done
```

### Method 2: UniFi Syslog

1. Go to **UniFi Settings → System → Logging**
2. Enable **Remote Logging**
3. **Host**: `192.168.222.3`
4. **Port**: `514` (requires syslog support in your logging server)

---

## 5. ☁️ **Cloudflare Integration**

### Method 1: Cloudflare Logpush (Enterprise)

If you have Cloudflare Enterprise, you can push logs directly.

### Method 2: Cloudflare Workers (Free Tier)

Create a Cloudflare Worker to forward events:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  const response = await fetch(request)
  
  // Log request to your server
  const logData = {
    timestamp: new Date().toISOString(),
    category: "cdn",
    source: "Cloudflare",
    device_id: "cf-worker",
    event_type: "http_request",
    severity: "info",
    message: `${request.method} ${new URL(request.url).pathname} - ${response.status}`,
    metadata: JSON.stringify({
      method: request.method,
      url: request.url,
      status: response.status,
      cf_ray: response.headers.get('cf-ray'),
      country: request.cf?.country
    })
  }
  
  // Send to logging server (async, don't wait)
  event.waitUntil(
    fetch('http://192.168.222.3:10180/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa('admin:943Nelson8034!')
      },
      body: JSON.stringify(logData)
    })
  )
  
  return response
}
```

### Method 3: Cloudflare API Polling

```python
#!/usr/bin/env python3
import requests
import time
from datetime import datetime, timedelta

CF_API_KEY = "your-api-key"
CF_EMAIL = "your-email"
CF_ZONE_ID = "your-zone-id"

def get_cloudflare_logs():
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(minutes=5)
    
    headers = {
        "X-Auth-Email": CF_EMAIL,
        "X-Auth-Key": CF_API_KEY
    }
    
    url = f"https://api.cloudflare.com/client/v4/zones/{CF_ZONE_ID}/logs/received"
    params = {
        "start": int(start_time.timestamp()),
        "end": int(end_time.timestamp())
    }
    
    response = requests.get(url, headers=headers, params=params)
    return response.json()

def send_to_logger(log_entry):
    requests.post(
        "http://192.168.222.3:10180/log",
        auth=("admin", "943Nelson8034!"),
        json={
            "timestamp": datetime.utcnow().isoformat(),
            "category": "cdn",
            "source": "Cloudflare",
            "device_id": "cf-api",
            "event_type": "zone_event",
            "severity": "info",
            "message": str(log_entry),
            "metadata": log_entry
        }
    )

if __name__ == "__main__":
    logs = get_cloudflare_logs()
    for entry in logs:
        send_to_logger(entry)
```

---

## 6. 📊 **Netdata Integration**

### Method 1: Netdata Alarm Notifications

Edit `/etc/netdata/health_alarm_notify.conf`:

```bash
# Enable custom webhook
SEND_CUSTOM="YES"

# Your logging server
CUSTOM_WEBHOOK_URL="http://192.168.222.3:10180/log"
CUSTOM_WEBHOOK_USERNAME="admin"
CUSTOM_WEBHOOK_PASSWORD="943Nelson8034!"
CUSTOM_WEBHOOK_OPTIONS=""

# Custom payload
CUSTOM_WEBHOOK_DATA=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "category": "monitoring",
  "source": "Netdata",
  "device_id": "${host}",
  "event_type": "alarm_${status}",
  "severity": "${severity}",
  "message": "${name} on ${host}: ${value_string}",
  "metadata": {
    "alarm": "${name}",
    "chart": "${chart}",
    "family": "${family}",
    "status": "${status}",
    "value": "${value}",
    "units": "${units}",
    "info": "${info}"
  }
}
EOF
)
```

### Method 2: Netdata to Node-RED to Logger

Install Netdata's Node-RED integration:

```json
[
    {
        "id": "netdata_webhook",
        "type": "http in",
        "url": "/netdata",
        "method": "post"
    },
    {
        "id": "transform_netdata",
        "type": "function",
        "func": "msg.payload = {\n    timestamp: new Date().toISOString(),\n    category: 'monitoring',\n    source: 'Netdata',\n    device_id: msg.payload.host || 'netdata-server',\n    event_type: 'alarm',\n    severity: msg.payload.status === 'CRITICAL' ? 'error' : msg.payload.status === 'WARNING' ? 'warning' : 'info',\n    message: `${msg.payload.alarm}: ${msg.payload.value} ${msg.payload.units}`,\n    metadata: JSON.stringify(msg.payload)\n};\nreturn msg;"
    },
    {
        "id": "send_to_logger",
        "type": "http request",
        "method": "POST",
        "url": "http://192.168.222.3:10180/log",
        "authType": "basic",
        "username": "admin",
        "password": "943Nelson8034!"
    }
]
```

---

## 🧪 **Testing Your Integrations**

### Test with curl:

```bash
curl -X POST http://192.168.222.3:10180/log \
  -u admin:943Nelson8034! \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-10-27T16:00:00Z",
    "category": "test",
    "source": "Manual Test",
    "device_id": "test-device",
    "event_type": "test_event",
    "severity": "info",
    "message": "This is a test message from integration setup",
    "metadata": "{\"test\": true}"
  }'
```

### Expected Response:
```json
{
  "success": true,
  "message": "Log entry created",
  "id": 123
}
```

---

## 📝 **Next Steps**

1. Start with **Home Assistant** (easiest to set up)
2. Add **Netdata** for system monitoring
3. Configure **Unraid** Docker events
4. Set up **UniFi** event logging
5. Add **Plex** webhooks
6. Configure **Cloudflare** (if needed)

## 🔧 **Need Help?**

- Check the logs: `docker logs RejavartiLoggingServer`
- View in dashboard: http://192.168.222.3:10180/dashboard
- All events are stored in `/app/data/databases/enterprise_logs.db`

---

**Would you like me to help you set up any specific integration first?**
