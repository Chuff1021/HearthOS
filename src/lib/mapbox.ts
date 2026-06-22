type TileStyle = "street" | "satellite";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

function publicMapboxToken() {
  const token = MAPBOX_TOKEN.trim();
  return token.startsWith("pk.") ? token : "";
}

export function hasMapboxTiles() {
  return Boolean(publicMapboxToken());
}

export function mapboxProviderLabel() {
  return hasMapboxTiles() ? "Mapbox" : "Carto";
}

export function createTrackingTileLayer(L: any, style: TileStyle) {
  const token = publicMapboxToken();

  if (token) {
    const mapboxStyle = style === "satellite" ? "satellite-streets-v12" : "streets-v12";
    return L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/${mapboxStyle}/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`,
      {
        attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; OpenStreetMap',
        maxZoom: 22,
        tileSize: 512,
        zoomOffset: -1,
      }
    );
  }

  if (style === "satellite") {
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 20,
    });
  }

  return L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 20,
  });
}
