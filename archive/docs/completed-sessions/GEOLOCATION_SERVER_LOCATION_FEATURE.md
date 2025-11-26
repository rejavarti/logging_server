# Geolocation Server Location Feature

## Overview
The geolocation map widget displays the server's own location as a distinct red pin marker, helping visualize where logs are being collected from relative to traffic sources.

## How It Works

### Backend Detection Priority (`/api/analytics/geolocation`)
1. **Manual Configuration** (Priority 1): Uses lat/lon set in Admin Settings ⭐ Recommended
2. **Auto-Detection** (Priority 2): Scans network interfaces for first non-internal public IPv4
3. **Environment Override** (Priority 3): Uses `SERVER_PUBLIC_IP` environment variable
4. **Geolocation**: Resolves IPs to coordinates via `geoip-lite` database

### Frontend Visualization
- **Server Marker**: 🔴 Red pin icon (24px, white border)
- **Log Sources**: 🔵 Blue scatter dots (sized by frequency)
- **Subtitle**: Shows server location status
- **Hover Info**: Displays "Server: [Location]" or "Server: Configured"

## Configuration

### Method 1: Manual Configuration ⭐ RECOMMENDED
Navigate to **Admin → Settings** → **Server Location (Geolocation)** section:

1. Enter latitude: e.g., `51.5074` for London
2. Enter longitude: e.g., `-0.1278` for London  
3. Click **Save Settings**

**Finding Coordinates:**
- Google Maps: Right-click location → Click coordinates at top
- OpenStreetMap: Search location → coordinates in URL
- Data center provider documentation
- Online geocoding services

**Examples:**
- London: `51.5074, -0.1278`
- New York: `40.7128, -74.0060`
- Tokyo: `35.6762, 139.6503`
- Sydney: `-33.8688, 151.2093`

**Advantages:**
- Most accurate (exact location you specify)
- Works behind NAT/proxies
- No IP geolocation database dependencies
- Highest priority - overrides all other methods

### Method 2: Environment Variable
For servers behind NAT/proxy without manual config:

```bash
-e SERVER_PUBLIC_IP=203.0.113.42
```

Docker Compose:
```yaml
environment:
  - SERVER_PUBLIC_IP=203.0.113.42
```

### Method 3: Auto-Detection (Fallback)
Automatic if no manual config exists.

**Limitations:**
- Requires public IPv4 address
- Fails behind NAT/proxies  
- IP geolocation can be inaccurate
- Depends on network interface availability

### Complete Docker Example
```bash
docker run -d \
  --name Rejavarti-Logging-Server \
  -p 10180:10180 \
  -v /mnt/user/appdata/logging-server:/app/data \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret-here \
  -e SERVER_PUBLIC_IP=203.0.113.42  # Optional fallback \
  rejavarti/logging-server:latest
```

## API Response Structure
```json
{
  "success": true,
  "locations": [{"ip": "...", "lat": ..., "lon": ..., "count": ...}],
  "serverLocation": {
    "ip": "manual",
    "country": "Configured",
    "region": null,
    "city": null,
    "lat": 51.5074,
    "lon": -0.1278,
    "isServer": true,
    "source": "manual"
  },
  "externalIPs": 15,
  "uniqueIPs": 23,
  "byCountry": {"US": 10, "UK": 5},
  "timestamp": 1700000000000
}
```

**Source Values:**
- `manual`: Admin Settings configuration (Priority 1)
- `ip-detection`: Network interface auto-detect (Priority 2)
- `env-override`: SERVER_PUBLIC_IP variable (Priority 3)

## Troubleshooting

### Server Location Not Showing
1. ✅ **Set manual coordinates** in Admin → Settings (recommended)
2. Check server has public IP (most home servers don't)
3. Set `SERVER_PUBLIC_IP` env var if behind NAT
4. Verify geoip-lite: `node -e "console.log(require('geoip-lite').lookup('8.8.8.8'))"`

### Behind Reverse Proxy
Auto-detection finds proxy's internal IP.
- **Best:** Manual lat/lon in Admin Settings
- **Alternative:** `SERVER_PUBLIC_IP` env pointing to origin IP

### Coordinates Not Saving
1. Valid ranges: Latitude -90 to +90, Longitude -180 to +180
2. Use decimal degrees (not DMS format)
3. Check browser console for errors
4. Verify admin permissions
5. Review server logs for database errors

### Wrong Server Location
IP geolocation databases are often inaccurate (especially ISPs, VPNs, cloud).
- **Solution:** Always use manual configuration for precision

### Settings Not Persisting
1. Verify `/api/settings` endpoint working
2. Check database file permissions in `/app/data`
3. Confirm Docker volume mount correct
4. Look for database lock errors in logs

## Visual Design
- **Server Pin**: Red pin (24px), white border, shadow on hover
- **Traffic Dots**: Blue scatter (8-16px), scaled by frequency
- **Interaction**: Server pin glows on hover
- **Layering**: Server marker on top (z-index: 10)
- **Contrast**: Red/blue color scheme for clear distinction

## Benefits
- **Geographic Context**: Server location relative to traffic
- **Security**: Identify anomalous geographic patterns
- **Performance**: Visualize latency by distance
- **Compliance**: Verify data residency
- **Multi-region**: Compare traffic across deployments
- **Network Analysis**: Understand routing patterns

## Database Storage
Stored in `settings` table as JSON:
```sql
INSERT OR REPLACE INTO settings (key, value, updated_at) 
VALUES ('system_settings', 
  '{"server_latitude": 51.5074, "server_longitude": -0.1278, ...}', 
  CURRENT_TIMESTAMP);
```

## Version History
- **1.0.15** (Nov 19, 2025): Server location via IP detection
- **1.0.16** (Nov 19, 2025): Manual lat/lon in Admin Settings

## Future Enhancements
- City name reverse geocoding for manual coordinates
- Multiple server locations (distributed deployments)
- Traffic density heatmap by distance from server
- Latency color-coding based on geographic distance
- Regional traffic analytics dashboard
- Integration with CDN edge location mapping
