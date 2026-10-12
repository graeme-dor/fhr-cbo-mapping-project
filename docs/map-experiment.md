# CBO-DBE school accessibility map

Alternative map version: `0.2.1`. The original map remains at version `0.1.4`, with its source workbook unchanged. The alternative is published from `main` at [CBO-DBE school accessibility map](https://graeme-dor.github.io/fhr-cbo-mapping-project/accessibility/). The original remains at the repository’s root URL.

Preview: `python3 -m http.server 8001 --bind 127.0.0.1 --directory web`, then open http://127.0.0.1:8001/accessibility/.

## Province grouping and navigation

The default is **DBE provinces**: Gauteng, KwaZulu-Natal, Limpopo and Mpumalanga. The province selector offers All provinces, the combined DBE-province view, individual DBE provinces first, and other provinces in a separate group. Groups derive from the dataset rather than a fixed province list.

Each DBE school connects to its closest CBO in its own province and takes that CBO's colour. Straight mode chooses the shortest Haversine distance. Road mode independently chooses the smallest OSRM-reported driving-route length among eligible CBOs; winners can differ. This is a distance suitability scenario without capacity constraints. Equal distances use stable CBO IDs.

CBO focus shows only allocated schools and does not recalculate winners using fewer candidates. Selecting a province/CBO automatically fits the map. Select All provinces in the dropdown to restore the national overview. Fit-view and overview buttons have been removed.

FHR remains an optional assigned-marker layer, without FHR distance calculations or routing requests.

## Preloaded roads

`web/accessibility/data/roads.json` contains a versioned snapshot of all 425 eligible CBO–DBE road distances and only the 85 nearest-CBO route geometries. It is about 1.5 MB uncompressed. The map loads this local file once in the background after starting the basemap and straight-line view; mode changes, filtering, school selection and zooming make **no routing API calls**. Road mode draws every nearest route in the selected view, and selecting a school highlights and zooms to its path. Basemap tiles still load normally from OpenStreetMap.

The snapshot uses OSRM car routing. Reported distances are the lengths of the routing engine's selected driving routes, not a guarantee of mathematically shortest road paths. No live traffic is included. Coordinates snap to mapped roads, excluding off-road access; snaps over 250 metres are flagged. Missing/unreachable results never substitute straight distances.

A fingerprint of institution coordinates, IDs, provinces and comparison distances binds the snapshot to the dataset. The app and tests reject mismatched or incomplete snapshots instead of reusing obsolete allocations.

## First-load performance

The basemap starts after the institution data loads, without waiting for the larger road snapshot. Both data downloads start together; the road toggle becomes available only after its snapshot passes validation. A failed road download leaves the straight-line map usable. Tiles are first requested at the fitted DBE-province view, avoiding a redundant initial national tile request. Leaflet 1.9.4 and its licence are included under `vendor/` so the map library loads from GitHub Pages rather than a separate CDN. A preconnect hint prepares the tile connection; no tiles are bulk-prefetched. First visits still depend on the visitor’s network and the public tile provider.

## Refresh pipeline

```sh
node scripts/build_road_snapshot.mjs
```

The script reads the generated `web/data/map.json`, leaving the workbook untouched. If the snapshot matches, it makes no routing requests and regenerates the full export. After location/comparison updates it rebuilds the snapshot. For newer road data with unchanged institutions:

```sh
node scripts/build_road_snapshot.mjs --refresh
```

For another compatible OSRM provider:

```sh
node scripts/build_road_snapshot.mjs https://your-osrm-server.example/routed-car --refresh
```

Building this dataset uses four province table requests and ten grouped route requests, spaced at least 1.1 seconds apart. Route batches alternate CBO and school waypoints; only independent outbound legs are kept, with `continue_straight=false`. Each extracted path is checked against its matrix distance within 10 metres before saving. A complete validated snapshot replaces the previous JSON atomically. No scheduled/background refresh is enabled. A dedicated provider is appropriate if refresh frequency or dataset size grows.

Only already-public institution coordinates are sent to the routing provider. No workbook files or private addresses are sent. The build timestamp and provider are recorded, and the snapshot date appears under About road distances.

## Full export

Export full spreadsheet downloads `web/accessibility/data/distances.csv` directly, regardless of province, CBO or distance-mode selections. It always contains all 425 eligible same-province CBO–DBE comparison rows. It is the complete distance table, not a copy of the original workbook or an FHR distance export.

The nine columns include province, CBO and DBE names, straight-line kilometres, road-network kilometres, nearest CBO for each distance method and Yes/No indicators for whether each row is the winner. UTF-8 encoding supports opening the CSV in Excel. Export uses the same saved road snapshot as the map and requires no live routing requests.

## Validation

Run `node tests/test_experiment.mjs`. Checks cover province restrictions, all 85 school winners, metric-specific allocations, focus invariance, incomplete/unreachable results, FHR markers without distances, the full CSV's agreement with saved roads, province groups, snapshot fingerprints, stale-data rejection and extraction of independent route legs. Workflow checks validate the snapshot and export before deploying both maps.

References: [OSRM table, route and geometry APIs](https://project-osrm.org/docs/v5.24.0/api/), [routing service attribution and usage policy](https://routing.openstreetmap.de/about.html).
