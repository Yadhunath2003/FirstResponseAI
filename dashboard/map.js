let map = null;
let incidentLocation = [38.9592, -95.2453]; // Default to Lawrence, KS if nothing else
let mapZones = {};

function initMap(lat, lng) {
    if (map) return; // already initialized
    
    incidentLocation = [lat, lng];
    map = L.map('map').setView(incidentLocation, 16);

    // Simple OSM tiles but dark-mode filtered via CSS later or explicitly
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    // Add Incident Command marker
    L.marker(incidentLocation).addTo(map)
        .bindPopup('<b>Incident Location</b>').openPopup();
}

function updateZones(zones) {
    if(!map) return;
    
    for(const key in mapZones) {
        map.removeLayer(mapZones[key]);
    }
    mapZones = {};

    zones.forEach(zone => {
        const colorMap = {
            danger:          '#e74c3c',
            hot:             '#e74c3c',
            warm:            '#f39c12',
            cold:            '#2ecc71',
            safe:            '#2ecc71',
            staging_area:    '#9b59b6',
            staging:         '#9b59b6',
            landing_zone:    '#3498db',
            landing:         '#3498db',
            blocked_road:    '#e67e22',
            evacuation:      '#e74c3c',
        };
        
        const color = colorMap[zone.zone_type] || '#3498db';
        
        // radius_meters is already in meters — Leaflet L.circle uses meters natively
        // Clamp between 100m minimum and 50km maximum for sanity
        const radiusMeters = Math.min(Math.max(zone.radius_meters || 500, 100), 50000);
        
        const circle = L.circle([zone.center_lat, zone.center_lng], {
            color: color,
            fillColor: color,
            fillOpacity: 0.2,
            weight: 2,
            radius: radiusMeters
        }).addTo(map);

        circle.bindPopup(`<b>${zone.label || zone.zone_type}</b><br>Type: ${zone.zone_type}<br>Radius: ${(radiusMeters/1000).toFixed(1)} km`);
        mapZones[zone.id] = circle;
        
        // Auto-fit map to show all zones
        map.fitBounds(circle.getBounds(), { padding: [20, 20] });
    });
}
