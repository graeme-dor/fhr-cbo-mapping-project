# DBE connection explorer — experiment 02

Version: `0.2.0-experiment.2`. Branch: `experiment/map-visualisation`. Baseline: live release `v0.1.4`.

This experiment lives in `web/experiment/`. GitHub Pages deploys only `main`; this branch does not replace the live map or modify the source workbook.

## Preview

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory web
```

Open http://127.0.0.1:8001/experiment/.

## Simplified view

Choose a province and one CBO. Every DBE school in that province is compared with the selected CBO. A validation guard rejects links whose CBO and DBE school provinces differ, even if such a link enters the dataset later. There is no nearest-CBO allocation scenario.

The grey OpenStreetMap background retains distinct CBO colours. Large circles identify CBOs; hollow circles identify DBE schools. Straight mode draws all the selected CBO's DBE connections and lists their Haversine distances. Clicking a school focuses its connection.

The optional FHR checkbox shows only the selected CBO's assigned FHR schools as diamond markers. It does not draw FHR lines, calculate FHR distances or make FHR routing requests. Baseline data may contain earlier FHR measurements; this experiment ignores them.

## Faster road mode

Previously each connection required its own full route request. Road mode now uses OSRM's table endpoint to retrieve all uncached DBE distances for the selected CBO in one request. Only the selected school's route geometry is requested; the nearest available school is initially selected. Choosing another school loads only that path.

Distances and paths are cached separately in the browser for seven days, keyed by directed endpoint coordinates. Existing route caches are reused. Requests are spaced at least 1.1 seconds apart to respect the public service policy. Changing province, CBO or distance mode cancels obsolete requests. Switching the FHR layer makes no routing requests.

This removes the per-school sequence of route requests when loading the distance list. The public service can still be slow or unavailable. For a widely shared version, precompute reviewed road distances in the data pipeline or use a dedicated routing provider.

Distances measure OSRM's selected driving route, without live traffic. Locations are snapped to mapped roads; off-road access is excluded. Snaps above 250 metres are flagged. Unreachable routes are explicitly unavailable; road mode does not substitute straight lines.

The provider receives institution coordinates already included in the public map. No workbook files or private addresses are sent.

## Approach

Leaflet suits this presentation over fixed CBOs and schools and runs on GitHub Pages. R/Shiny, r5r and optimisation solvers would be useful for a later stage involving capacity constraints, choosing facility locations or optimising allocations. They are not necessary for the current province comparisons.

References: [OSRM table and route APIs](https://project-osrm.org/docs/v5.24.0/api/), [routing service policy](https://routing.openstreetmap.de/about.html).

## Checks

Run `node tests/test_experiment.mjs`. Checks cover all 425 DBE comparisons, rejection of injected cross-province links, FHR marker use without distances, batch request counts, null/unreachable results, route selection, cancellation and persistent cache reuse.
