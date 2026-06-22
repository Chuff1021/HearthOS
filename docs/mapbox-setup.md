# Mapbox Setup

HearthOS supports Mapbox in two separate places:

- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`: public `pk...` token for browser map tiles.
- `MAPBOX_SECRET_ACCESS_TOKEN`: secret `sk...` token for server-only geocoding and directions.

Do not put an `sk...` token in `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`; browser map tiles expose public env vars to users. If no public token is configured, the dispatch maps fall back to Carto/Esri tiles while tracking and GPS data still work.
