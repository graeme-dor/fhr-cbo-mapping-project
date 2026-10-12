# Connection explorer — experiment 01

Branch: `experiment/map-visualisation`. Baseline: live release `v0.1.4`.

This experiment adds `web/experiment/` and keeps the existing map and dataset intact. There is no production deployment from this branch: GitHub Pages deploys only `main`. No optimisation solver is used in this iteration.

## Preview

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory web
```

Open http://127.0.0.1:8001/experiment/. For the original design in the same checkout, open http://127.0.0.1:8001/.

## Visual choices

- Grey OpenStreetMap background, produced by filtering only the raster tile pane. Markers and lines retain their colours. A designed grey vector basemap could replace this later; CARTO now requires an API key.
- Each of the 25 CBOs has a distinct colour, allocated in stable ID order. The same colour follows its connections. CBOs are large circles, DBE schools hollow circles, and FHR schools diamonds. The legend and shape reinforce colour meaning.
- Solid lines represent supplied FHR assignments. Dashed lines represent DBE comparisons/scenarios.
- Straight-line and driving-route geometry toggles preserve the selected relationships, allowing a like-for-like comparison.
- CBO focus, distance sorting, view export, and optional 5/10/25 km straight-line rings.

## Relationships

FHR schools retain the existing reviewed workbook assignments.

DBE nearest-CBO mode is explicitly a hypothetical scenario: each school is linked to the nearest current CBO **by straight-line distance within its province**. This is not an approved allocation and does not consider workload, service eligibility or capacity. Switching to road geometry does not reassign schools. Finding the nearest CBO by driving distance would require a complete road-distance matrix and a separate scenario definition.

The all-DBE comparison view reproduces the existing rule: each CBO compared against every DBE school in its province. In its overview, school markers are neutral because each school has multiple candidate CBOs; line colours identify the CBOs.

## Road routing

Routes use OSRM's car endpoint operated by FOSSGIS. Requests are sequential, spaced at least 1.1 seconds apart. Up to 60 uncached routes are requested for a view; larger views require a province/CBO filter. Results are cached in the browser for seven days, keyed by directed endpoint coordinates. Failed/no-route requests remain unavailable. There is no silent substitution of straight lines for road geometry.

The distance is the length of OSRM's selected driving route, not a guarantee of the mathematically shortest road path. Coordinates are snapped onto roads; off-road access is excluded. A snap above 250 metres is marked for road-access review. No live traffic or real-time travel-time claims are made. Summary statistics show loaded-route coverage and label partial averages.

The routing provider receives the endpoint coordinates. No private street addresses or workbook contents are sent. These institution coordinates are already included in the public map. Public demo routing is appropriate for occasional exploration; a dedicated provider or a reviewed precomputed route dataset is recommended before wider sharing.

## Why retain Leaflet rather than migrate to R/Shiny now?

The requested behaviours are map presentation and route comparison over fixed facilities. They can be implemented in the existing static application. GitHub Pages cannot run an R/Shiny server.

R/Shiny plus r5r or a spopt-based pipeline is appropriate if a later stage introduces optimisation: e.g. choose facility locations, minimise weighted travel cost, or allocate schools subject to CBO capacity. First define demand weights, eligible facilities, capacity, province/catchment restrictions and the objective. Then generate scenario outputs in a separate analysis pipeline and visualise them here, or move to Shiny if live solver interaction becomes necessary.

Sources: [OSRM API](https://project-osrm.org/docs/v5.24.0/api/), [routing service policy](https://routing.openstreetmap.de/about.html), [spopt location solvers](https://pysal.org/spopt/api.html), [r5r detailed itineraries](https://ipeagit.github.io/r5r/reference/detailed_itineraries.html), [CARTO basemap requirements](https://github.com/CartoDB/basemap-styles).
