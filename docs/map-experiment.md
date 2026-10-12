# Nearest CBO explorer — experiment 03

Version: `0.2.0-experiment.3`. Branch: `experiment/map-visualisation`. Baseline: live `v0.1.4`. The original map and workbook are unchanged. GitHub Pages deploys only `main`.

Preview: `python3 -m http.server 8001 --bind 127.0.0.1 --directory web`, then open http://127.0.0.1:8001/experiment/.

## Allocation and navigation

The default view shows all provinces and all CBOs. Each DBE school is connected to the closest CBO **in its own province** and takes that CBO's colour. Straight mode chooses the shortest Haversine distance. Road mode independently chooses the shortest OSRM-reported driving-route distance among eligible CBOs. Changing distance mode can change the winning CBO.

This is a distance suitability scenario over fixed facilities, without capacity or eligibility constraints beyond province. OSRM selects a driving route; its length does not guarantee the mathematically shortest road path. Equal distances are resolved by stable CBO ID.

Province and CBO selectors filter the view. A CBO focus shows only DBE schools allocated to it; it does not recalculate winners using a reduced candidate set. CBO popups and the colour legend also offer focus. The All provinces button restores the overview; Fit view fits the current selection.

The optional FHR layer shows assigned schools as diamonds. It makes no FHR distance calculations or routing requests.

## Road performance and correctness

Road allocation requires comparing every eligible CBO, not only the straight-line winner. One OSRM table request retrieves a province's complete CBO-to-DBE distance matrix. This dataset has DBE schools in four provinces, so a fresh all-province road overview needs four requests covering 425 pairs. Cache reuse can reduce that number. Province focus needs at most one batch.

School colours follow road-matrix winners. To avoid loading 85 separate road geometries, road mode loads a detailed path only when a school is selected. The road overview shows coloured locations; it does not draw straight lines masquerading as road paths.

A school has no road winner until every eligible candidate has a result. Null results mean unreachable and are excluded. Missing results are not treated as unreachable or replaced by straight distances. Unresolved schools appear neutrally in the overview. A location snapped more than 250 metres from a road is marked for access review. Off-road access and live traffic are excluded.

Browser caches last seven days, keyed by directed endpoint coordinates. Requests are separated by at least 1.1 seconds; obsolete requests are cancelled. The public routing service can still be unavailable or slow. A production version should use a dedicated provider or precompute reviewed matrices in the data pipeline.

## Distance export

Export distances loads all necessary province matrices before downloading a UTF-8 CSV. It includes one row per eligible CBO–DBE pair within the selected province and CBO filters, rather than only the winning pair. With All provinces and All CBOs there are 425 data rows.

Columns include province, CBO and DBE IDs/names, straight-line kilometres, road-network kilometres, road status, nearest CBO by straight line, nearest CBO by road and a Yes/No indicator for each method. Nearest winners are always determined using every CBO in the school's province, including when the export focuses on one CBO. Unreachable pairs have blank road distances with explicit status; a school with no reachable CBO has blank road-winner fields. If the service fails, export reports the error and asks for retry instead of silently presenting incomplete comparisons as final.

Institution coordinates already present on the public map are sent to the routing service. Workbook files and private addresses are not sent.

## Checks

Run `node tests/test_experiment.mjs`. Checks cover province guards, all 85 school winners, independently changing road winners, CBO focus invariance, incomplete and unreachable matrices, FHR markers without distances, 425 export rows, batch request counts, cancellation and cache reuse.

The static Leaflet approach supports these fixed-facility comparisons on GitHub Pages. Capacity-constrained optimisation or facility location selection could later justify a separate R/Shiny or analysis pipeline.

References: [OSRM APIs](https://project-osrm.org/docs/v5.24.0/api/), [public routing service policy](https://routing.openstreetmap.de/about.html).
