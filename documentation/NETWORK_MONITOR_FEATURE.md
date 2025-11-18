# Network Monitor Widget - Feature Documentation

## Overview
The Network Monitor widget provides real-time visibility into your logging server's HTTP/HTTPS network traffic, helping you verify that connections (like Node-RED) are properly established and transmitting data.

## Features

### Real-Time Metrics
- **Incoming Traffic**: Tracks bytes received and number of requests
- **Outgoing Traffic**: Tracks bytes sent and number of responses
- **Total Statistics**: Cumulative data transfer and request counts
- **Connection Status**: Live indicator showing network is active

### What It Monitors
- All HTTP requests to port **10180**
- Node-RED HTTP connections
- ESP32 device logging endpoints (`/log`)
- API requests (`/api/*`)
- Dashboard and web interface traffic
- WebSocket connections (port 10181)

### Use Cases

#### 1. **Verify Node-RED Connection**
When you have Node-RED sending data to your logging server:
- Check the "Incoming" section to see bytes being received
- Monitor request count to confirm logs are coming through
- Verify connection is "Active & Transmitting"

#### 2. **Debug Integration Issues**
If an integration isn't working:
- No incoming traffic = connection problem
- Incoming but no outgoing = server processing issue
- Both active = working correctly

#### 3. **Monitor Server Load**
- Track total data transferred
- Identify high-traffic periods
- Plan capacity and bandwidth needs

#### 4. **Verify ESP32 Devices**
- See when your ESP32 devices are sending logs
- Monitor data volume from IoT devices
- Confirm real-time connectivity

## Widget Layout

```
┌─────────────────────────────────────┐
│      Network Monitor Widget         │
├─────────────────┬───────────────────┤
│   INCOMING ↓    │   OUTGOING ↑      │
│   2.5 MB        │   3.8 MB          │
│   1,234 req     │   1,234 resp      │
├─────────────────┴───────────────────┤
│  Total Data: 6.3 MB                 │
│  Total Requests: 2,468              │
├─────────────────────────────────────┤
│ ✓ Network Active & Transmitting    │
│ ℹ Monitoring HTTP on port 10180    │
└─────────────────────────────────────┘
```

## Technical Details

### Data Collection
- **Middleware Integration**: Automatically tracks all HTTP requests/responses
- **Request Size**: Captured from `Content-Length` header
- **Response Size**: Tracked via `res.send()` interception
- **Zero Performance Impact**: Minimal overhead, async processing

### Metrics Manager Enhancement
New methods added to `SystemMetricsManager`:
```javascript
- trackIncomingRequest(bytes)   // Called on each request
- trackOutgoingRequest(bytes)   // Called on each response
- getNetworkStats()             // Returns current stats
```

### Data Reset
Network statistics are **cumulative** since server start:
- Restart server to reset counters
- Historical data planned for future versions
- 30-minute rolling history available via metrics

## Adding to Dashboard

1. Click **"+ Add Widget"** button on dashboard
2. Scroll to **"Network Monitor"** card (green network icon)
3. Click to add
4. Drag to desired position
5. Data updates in real-time automatically

## Color Coding

- **Green** 🟢 = Incoming traffic (downloads, requests received)
- **Blue** 🔵 = Outgoing traffic (uploads, responses sent)
- **Success Indicator** ✓ = Active connection confirmed

## Troubleshooting

### No Data Showing
- **Server just started**: Make a few requests to populate
- **Page not refreshed**: Click refresh icon on widget
- **Metrics disabled**: Check server logs for initialization errors

### Unexpected Low Traffic
- Node-RED might be caching responses
- Devices may be offline
- Check firewall/network connectivity

### Very High Traffic
- **Normal**: High traffic is expected with many devices
- **API abuse**: Check Activity Log for unusual patterns
- **Memory issues**: Monitor System Health widget

## Node-RED Example

To verify Node-RED is transmitting properly:

```javascript
// In Node-RED HTTP Request node:
URL: http://localhost:10180/log
Method: POST
Payload: { message: "Test from Node-RED", severity: "info" }

// After sending, check Network Monitor widget:
// - Incoming should increase (your POST request)
// - Outgoing should increase (server response)
```

## Future Enhancements (Planned)

- [ ] Historical traffic graphs (last 24 hours)
- [ ] Peak traffic time identification
- [ ] Connection quality metrics (latency, errors)
- [ ] Per-endpoint traffic breakdown
- [ ] Real-time bandwidth usage chart
- [ ] Alert on abnormal traffic patterns
- [ ] Export network statistics to CSV

## Related Widgets

Works great alongside:
- **System Health** - Server resource usage
- **Integration Status** - Integration connectivity
- **Error Rate Gauge** - Error monitoring
- **Quick Stats** - Overall system overview

## Support

For issues or questions:
- Check server logs: `logging-server/data/logs/system.log`
- View metrics: `/api/system/metrics` endpoint
- Dashboard: http://localhost:10180/dashboard

---

**Version**: 1.0.0  
**Added**: October 30, 2025  
**Author**: Tom Nelson  
**Server**: Enhanced Universal Logging Platform v2.1.0
