/**
 * Geolocation Map Widget
 * Displays log sources on an interactive Leaflet map
 */

const BaseWidget = require('./base-widget');

class GeolocationMapWidget extends BaseWidget {
    constructor() {
        super({
            id: 'geolocation-map',
            title: 'Geographic Distribution',
            icon: 'fas fa-map-marked-alt',
            category: 'analytics',
            size: 'wide',
            refreshInterval: 0 // Manual refresh only
        });
    }

    getDescription() {
        return 'Interactive map showing geographic distribution of log sources';
    }

    async fetchData(dal) {
        try {
            // Query logs with geolocation data
            const geoLogs = await dal.all(`
                SELECT 
                    source,
                    metadata,
                    COUNT(*) as count
                FROM logs 
                WHERE metadata LIKE '%latitude%' 
                  OR metadata LIKE '%longitude%'
                  OR metadata LIKE '%ip%'
                GROUP BY source
                LIMIT 100
            `) || [];

            // Parse geolocation data from metadata
            const locations = [];
            for (const log of geoLogs) {
                try {
                    const meta = typeof log.metadata === 'string' 
                        ? JSON.parse(log.metadata) 
                        : log.metadata;
                    
                    if (meta && (meta.latitude || meta.lat) && (meta.longitude || meta.lon || meta.lng)) {
                        locations.push({
                            source: log.source,
                            lat: meta.latitude || meta.lat,
                            lon: meta.longitude || meta.lon || meta.lng,
                            count: log.count,
                            ip: meta.ip || 'Unknown'
                        });
                    }
                } catch (e) {
                    // Skip invalid metadata
                }
            }

            return { locations };
        } catch (error) {
            console.error('Error fetching geolocation data:', error);
            return null;
        }
    }

    renderContent(data) {
        if (!data || !data.locations || data.locations.length === 0) {
            return this.renderEmptyState('No geolocation data available');
        }

        return `
            <div id="chart-${this.id}" style="width:100%; height:400px;"></div>
            <script>
                (function() {
                    const locations = ${JSON.stringify(data.locations)};
                    if (typeof L !== 'undefined' && locations.length > 0) {
                        const map = L.map('chart-${this.id}').setView([locations[0].lat, locations[0].lon], 5);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; OpenStreetMap contributors'
                        }).addTo(map);
                        
                        locations.forEach(loc => {
                            L.marker([loc.lat, loc.lon])
                                .bindPopup('<b>' + loc.source + '</b><br>' + loc.count + ' logs<br>IP: ' + loc.ip)
                                .addTo(map);
                        });
                    }
                })();
            </script>
        `;
    }

    getClientScript() {
        return `
            async function fetchGeolocationData(widgetId) {
                try {
                    const response = await fetch('/api/logs/geolocation', { credentials: 'same-origin' });
                    const data = await response.json();
                    
                    const mapContainer = document.getElementById('chart-' + widgetId);
                    if (!mapContainer) {
                        console.error('[Map] Container #chart-' + widgetId + ' not found');
                        return;
                    }
                    
                    const locations = data.locations || data.data?.locations || [];
                    if (!Array.isArray(locations) || locations.length === 0) {
                        mapContainer.innerHTML = '<div class="empty-state">No geolocation data available</div>';
                        return;
                    }
                    
                    // Only initialize if Leaflet is available and container is empty
                    if (typeof L !== 'undefined' && !mapContainer._leaflet_id) {
                        const map = L.map(mapContainer).setView([locations[0].lat, locations[0].lon], 5);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; OpenStreetMap contributors'
                        }).addTo(map);
                        
                        locations.forEach(loc => {
                            L.marker([loc.lat, loc.lon])
                                .bindPopup('<b>' + loc.source + '</b><br>' + loc.count + ' logs<br>IP: ' + (loc.ip || 'Unknown'))
                                .addTo(map);
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch geolocation data:', error);
                }
            }
        `;
    }
}

module.exports = GeolocationMapWidget;
