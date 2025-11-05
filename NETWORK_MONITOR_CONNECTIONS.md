# Network Monitor Widget - Connection Tracking

## ✅ Widget Title
**"Network Monitor"** - Properly configured and displayed

## 🔌 Connection Type Detection

The Network Monitor now automatically detects and displays **4 different connection types**:

### 1. **Node-RED** 🔴
- **Icon**: `fa-project-diagram`
- **Color**: Dark Red (#8B0000)
- **Detected by**: 
  - User-Agent contains "Node-RED"
  - URL contains "node-red"
- **Shows**: When Node-RED sends HTTP requests to your logging server

### 2. **ESP32 Devices** 🔵
- **Icon**: `fa-microchip`
- **Color**: Teal (#00979C)
- **Detected by**: 
  - Requests to `/log` endpoint
- **Shows**: When ESP32 devices send log data

### 3. **API Calls** 💜
- **Icon**: `fa-code`
- **Color**: Indigo (#6366f1)
- **Detected by**: 
  - Requests to `/api/*` endpoints (excluding dashboard)
- **Shows**: External API integrations and automation calls

### 4. **Dashboard/UI** 🔵
- **Icon**: `fa-tachometer-alt`
- **Color**: Blue (#3b82f6)
- **Detected by**: 
  - Requests to `/dashboard`, `/logs`, `/webhooks` pages
- **Shows**: User interface interactions

## 📊 Widget Display

```
┌─────────────────────────────────────┐
│      Network Monitor Widget         │
├─────────────────┬───────────────────┤
│   INCOMING ↓    │   OUTGOING ↑      │
│   2.5 MB        │   3.8 MB          │
│   1,234 req     │   1,234 resp      │
├─────────────────────────────────────┤
│  🔌 Active Connections              │
├─────────────────────────────────────┤
│  🔴 Node-RED        125 req  🟢     │
│  🔵 ESP32           89 req   🟢     │
│  💜 API             45 req   🟢     │
│  🔵 Dashboard       220 req  🟢     │
├─────────────────────────────────────┤
│  Total Data: 6.3 MB                 │
│  Total Requests: 2,468              │
├─────────────────────────────────────┤
│  Port 10180 • 🟢 Active             │
└─────────────────────────────────────┘
```

## 🟢 Connection Status Indicators

Each connection type shows:
- **Request Count**: Total requests received
- **Status Dot**: 
  - 🟢 **Green** = Active (received data in last 60 seconds)
  - ⚫ **Gray** = Inactive (no recent activity)

## 🎯 Real-World Examples

### Node-RED Sending Data
```javascript
// In Node-RED HTTP Request node
POST http://localhost:10180/log
User-Agent: Node-RED/3.0.2

// Widget will show:
🔴 Node-RED    1 req  🟢
```

### ESP32 Logging
```cpp
// ESP32 code
http.POST("http://192.168.1.100:10180/log", payload);

// Widget will show:
🔵 ESP32    1 req  🟢
```

### API Integration
```bash
# External script
curl http://localhost:10180/api/logs

# Widget will show:
💜 API    1 req  🟢
```

### Dashboard Access
```
# User opens dashboard
http://localhost:10180/dashboard

# Widget will show:
🔵 Dashboard    1 req  🟢
```

## 🔍 Technical Details

### Detection Logic
The system analyzes incoming requests and categorizes them based on:
1. **URL Path** - Where the request is going
2. **User-Agent** - What software sent the request
3. **Endpoint Pattern** - API vs UI vs device endpoints

### Activity Tracking
- Connections marked **active** if data received in last 60 seconds
- Automatically updates to **inactive** after 1 minute of no activity
- Request counts are cumulative since server start

### Data Collected Per Connection Type
- **Request Count** - Total number of requests
- **Bytes Transferred** - Total data received
- **Last Seen** - Timestamp of most recent activity
- **Active Status** - Boolean (within 60 seconds)

## 📈 Use Cases

### 1. Verify Node-RED Integration
**Problem**: "Is Node-RED sending data?"
**Solution**: Check Network Monitor for Node-RED connection with green dot

### 2. Monitor ESP32 Devices
**Problem**: "Are my IoT devices online?"
**Solution**: ESP32 connection shows request count and active status

### 3. Debug API Issues
**Problem**: "Is my automation calling the API?"
**Solution**: API connection displays all external API calls

### 4. Track Dashboard Usage
**Problem**: "How often is the dashboard accessed?"
**Solution**: Dashboard connection shows UI request frequency

## 🚀 Getting Started

1. **Add Widget**: Dashboard → "+ Add Widget" → "Network Monitor"
2. **Position Widget**: Drag to desired location
3. **Start Sending Data**: Use Node-RED, ESP32, or API calls
4. **Watch Connections**: See real-time connection tracking

## 🔧 Customization Options (Future)

Planned enhancements:
- [ ] Click connection to see detailed request history
- [ ] Filter by connection type
- [ ] Export connection statistics
- [ ] Set alerts for connection failures
- [ ] Historical connection graphs

## 💡 Tips

- **Green dots** = Everything working
- **Gray dots** = Check device connectivity
- **High request counts** = Active system (good!)
- **No connections** = Check firewall/network settings

---

**Version**: 2.0.0  
**Updated**: October 30, 2025  
**Features**: Connection type detection, active status indicators  
**Author**: Tom Nelson
