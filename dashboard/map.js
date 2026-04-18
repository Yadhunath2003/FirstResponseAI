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
    
    // Clear out simple layers for a fresh render
    for(const key in mapZones) {
        map.removeLayer(mapZones[key]);
    }
    mapZones = {};

    zones.forEach(zone => {
        let color = "#3498db";
        if (zone.zone_type === 'hot') color = "#e74c3c";
        else if(zone.zone_type === 'warm') color = "#f39c12";
        else if(zone.zone_type === 'cold') color = "#2ecc71";
        else if(zone.zone_type === 'staging') color = "#9b59b6";
        
        let zLayer = L.circle([zone.location_lat, zone.location_lng], {
            color: color,
            fillColor: color,
            fillOpacity: 0.2,
            radius: zone.radius || 30
        }).addTo(map);

        zLayer.bindPopup(`<b>${zone.label}</b><br>Type: ${zone.zone_type}`);
        mapZones[zone.id] = zLayer;
    });
}
