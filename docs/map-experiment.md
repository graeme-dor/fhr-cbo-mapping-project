# CBO-DBE school accessibility map

Alternative map version: `0.4.3`. The original map remains at version `0.1.4`, with its source workbook unchanged. The alternative is published from `main` at [CBO-DBE school accessibility map](https://graeme-dor.github.io/fhr-cbo-mapping-project/accessibility/). The original remains at the repository’s root URL.

Preview: `python3 -m http.server 8001 --bind 127.0.0.1 --directory web`, then open http://127.0.0.1:8001/accessibility/.

## Province grouping and navigation

The default is **DBE provinces**: Gauteng, KwaZulu-Natal, Limpopo and Mpumalanga. The province selector offers All provinces, the combined DBE-province view, individual DBE provinces first, and other provinces in a separate group. Groups derive from the dataset rather than a fixed province list.

Each DBE school connects to its closest CBO in its own province and takes that CBO's colour. Straight mode chooses the shortest Haversine distance. Road mode independently chooses the smallest OSRM-reported driving-route length among eligible CBOs; winners can differ. This is a distance suitability scenario without capacity constraints. Equal distances use stable CBO IDs.

CBO focus shows all DBE schools in the CBO’s province, grouped as nearest allocations and other connections, and does not recalculate winners using fewer candidates. Selecting a province/CBO automatically fits the map. Select All provinces in the dropdown to restore the national overview. Fit-view and overview buttons have been removed.

FHR is an optional workbook-assigned layer with straight-line and road distances. Only explicit workbook CBO–FHR assignments are connected. FHR links do not change DBE nearest allocations.

## Preloaded roads

`web/accessibility/data/roads.json` contains a versioned snapshot of all 425 eligible CBO–DBE road distances and 74 workbook-assigned CBO–FHR distances, plus route geometries for every available pair. Paths are simplified with a 15 metre tolerance for display only, retaining their original road-distance measurements. The map loads this local file once in the background after starting the basemap and straight-line view; mode changes, filtering, school selection and zooming make **no routing API calls**. Road mode draws all same-province DBE routes, with nearest allocations coloured and other comparisons in grey, plus optional dashed assigned FHR routes in the selected view, and selecting a school highlights and zooms to its path. Basemap tiles still load normally from OpenStreetMap.

The snapshot uses OSRM car routing. Reported distances are the lengths of the routing engine's selected driving routes, not a guarantee of mathematically shortest road paths. No live traffic is included. Coordinates snap to mapped roads, excluding off-road access; snaps over 250 metres are flagged. Missing/unreachable results never substitute straight distances.

A fingerprint of institution coordinates, IDs, provinces and comparison distances binds the snapshot to the dataset. The app and tests reject mismatched or incomplete snapshots instead of reusing obsolete allocations.

## First-load performance

The basemap starts after the institution data loads, without waiting for the larger road snapshot. Both data downloads start together; the road toggle becomes available only after its snapshot passes validation. A failed road download leaves the straight-line map usable. Tiles are first requested at the fitted DBE-province view, avoiding a redundant initial national tile request. Leaflet 1.9.4 and its licence are included under `vendor/` so the map library loads from GitHub Pages rather than a separate CDN. A preconnect hint prepares the tile connection; no tiles are bulk-prefetched. First visits still depend on the visitor’s network and the public tile provider.

## Refresh pipeline

```sh
node scripts/build_road_snapshot.mjs
```

The script reads the generated `web/data/map.json`, leaving the workbook untouched. If the snapshot matches, it makes no routing requests and regenerates both full exports. After location/comparison updates it rebuilds the snapshot. For newer road data with unchanged institutions:

```sh
node scripts/build_road_snapshot.mjs --refresh
```

For another compatible OSRM provider:

```sh
node scripts/build_road_snapshot.mjs https://your-osrm-server.example/routed-car --refresh
```

The builder reuses saved distances and paths by coordinate pair when extending the dataset. Missing distances and paths are requested in sequential CBO groups, spaced at least 1.1 seconds apart. Route batches contain at most 25 schools. Route batches alternate CBO and school waypoints; only independent outbound legs are kept, with `continue_straight=false`. Each extracted path is checked against its matrix distance within 10 metres before saving. A complete validated snapshot replaces the previous JSON atomically. No scheduled/background refresh is enabled. A dedicated provider is appropriate if refresh frequency or dataset size grows.

Only already-public institution coordinates are sent to the routing provider. No workbook files or private addresses are sent. The build timestamp and provider are recorded, and the snapshot date appears under About road distances.

## Full export

Export full spreadsheet downloads `web/accessibility/data/distances.csv` directly, regardless of province, CBO or distance-mode selections. It always contains all 425 eligible same-province CBO–DBE comparison rows. It is the complete distance table, not a copy of the original workbook or an FHR distance export.

The nine columns include province, CBO and DBE names, straight-line kilometres, road-network kilometres, nearest CBO for each distance method and Yes/No indicators for whether each row is the winner. UTF-8 encoding supports opening the CSV in Excel. Export uses the same saved road snapshot as the map and requires no live routing requests.

## Validation

Run `node tests/test_experiment.mjs`. Checks cover province restrictions, all 85 school winners, metric-specific allocations, focus invariance, incomplete/unreachable results, assigned FHR connections and distances, both full CSVs's agreement with saved roads, province groups, snapshot fingerprints, stale-data rejection and extraction of independent route legs. Workflow checks validate the snapshot and export before deploying both maps.

References: [OSRM table, route and geometry APIs](https://project-osrm.org/docs/v5.24.0/api/), [routing service attribution and usage policy](https://routing.openstreetmap.de/about.html).

Assigned FHR CSV export downloads `web/accessibility/data/fhr-distances.csv` independently of view filters. It contains 74 assigned pairs with CBO province/name, FHR school province/name, straight-line kilometres and road-network kilometres. CSV files do not support tabs, so DBE and FHR are separate downloads. Neither export includes internal IDs or road-status fields.

Connection strokes have thin, non-interactive white casings to separate them from the grey basemap. The symbol legend uses the map’s 20 px CBO and 8 px DBE proportions, and the line legend explains nearest-CBO colours, neutral comparisons and assigned FHR dashes.

Version 0.3.2 trials white comparison lines in place of grey. The legend retains the owner’s requested Grey wording pending feedback on the trial.

Version 0.3.3 restores grey comparison strokes. White casings are used only in road mode; straight connections have no outline. The illustrative coloured-line legend swatch uses green, gold and blue. CBO assignment colours are unchanged.

Version 0.3.4 uses finer, lighter grey straight connections while retaining the road styling. A pro bono design credit for Graeme Dor and DataVision Analytics appears below the map acknowledgements.

Version 0.3.5 uses shorter legend labels and neutral FHR legend symbols. The compact acknowledgement block centres the design credit above the Leaflet and data-provider credits.

## District comparison

The **Nearest CBO comparison** selector defaults to **Within the province**. **Within the same district** restricts nearest candidates to CBOs whose coordinates fall in the same district or metropolitan municipality as the school, and whose recorded province matches the school. The existing province-wide distances and grey comparisons remain available. Colours follow the selected nearest comparison. CBO focus never changes which CBO wins. FHR assignments remain unchanged.

School popups show both provincial and district nearest results for the selected distance method. A district with no mapped CBO has **No CBO in this district**, rather than a silent provincial fallback. In district view those schools stay visible neutrally and are listed separately. A mapped-versus-recorded province mismatch is flagged for location/province review and excluded from district allocation; province-wide results continue to use the recorded province.

Boundaries: Municipal Demarcation Board, hosted by [Western Cape Government](https://gis.westerncape.gov.za/hosting/rest/services/Hosted/Demarcation/FeatureServer/0), **labelled 2018 in the service description**, retrieved 15 October 2026. This is a pinned reference baseline, not a statement of current legal boundaries. The 52 areas include district and metropolitan municipalities; metros such as Tshwane are district-level comparison areas. Source metadata, URL and SHA-256 are in `data/boundaries/source.json`; lossless source geometry is archived in `data/boundaries/districts-mdb-2018.geojson.gz`. Coordinate assignment uses the full polygons including holes; ambiguous boundary points are flagged for review. Only the small generated `districts.json` file is loaded by the map. No school coordinates are sent to the boundary service.

To regenerate district assignments after location updates:

```sh
python3 scripts/build_districts.py
node scripts/build_road_snapshot.mjs
```

The main `scripts/build.py` pipeline also regenerates district assignments without changing the source workbook. Changed coordinates invalidate saved assignments in the map. The road snapshot builder regenerates the full 425-row DBE export with district names, same-district flags, nearest district CBO names and distances for both methods, and gap/review notes. Updating district information alone makes no routing requests. To update the boundary baseline, replace the geometry and source manifest together and rerun the commands above.

Baseline checks (15 October 2026): 66 of 85 DBE schools have an eligible same-district CBO; 18 have no mapped CBO in their district; one (Wolvenkop Special School) needs location/province review. Two assigned FHR schools (Alpha Primary and Veritas Secondary) also have coordinate/province mismatches; their recorded FHR relationships are retained. These flags identify data to review, not a confirmed correction.

## Excel downloads

The two export buttons download `distances.xlsx` (all 425 DBE comparison rows) and `fhr-distances.xlsx` (all 74 assigned FHR rows). Both use plain black text, standard-height data rows and uncoloured headers, with filters, the first row and two identifier columns frozen, numeric distances displayed to one decimal place, and the full three-decimal values retained. District gaps keep blank numeric cells and explanatory text. Exports always include the complete dataset, independent of map filters. CSV files remain as internal, testable pipeline intermediates.

`scripts/build_road_snapshot.mjs` regenerates both Excel files through `scripts/export_excel.mjs`. Excel generation uses the bundled Codex Node.js runtime and `@oai/artifact-tool`; run the builder with that runtime's Node executable. It locates the bundled package directory at `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`, or use `RUNTIME_NODE_MODULES` to specify the directory returned by the workspace dependency loader. No packages are installed into the repository. To regenerate only Excel files from the current CSV intermediates, run `scripts/export_excel.mjs` with the same runtime. The committed Excel files are checked in CI using read-only value comparisons with the CSV intermediates.
