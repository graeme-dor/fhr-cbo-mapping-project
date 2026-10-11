# FHR CBO and school mapping

A static interactive map, with a separate Python data pipeline. The Excel workbook is an immutable input. Version: **0.1.0** (initial local implementation).

## Project layout

```text
Heat map v2.xlsx           Current source workbook, untouched and Git-ignored
data/raw/                 Future dated source workbooks (Git-ignored)
config/project.json       Tab names, workbook path, DBE comparison scope
config/cbo_aliases.json    Reviewed FHR-to-CBO name mappings
data/geocoding/            Reviewed coordinate overrides and future provider cache
scripts/build.py           Pipeline entry point
scripts/pipeline/cbos.py   CBO tab adapter
scripts/pipeline/dbe.py    DBE tab adapter, shared across provinces
scripts/pipeline/fhr.py    FHR adapter: unpivots School 1–3 into school records
scripts/pipeline/geocoding.py  Coordinate validation, overrides and review queue
scripts/pipeline/distances.py  Relationships and straight-line distances
data/processed/           Generated detailed data (Git-ignored)
reports/                  Missing locations and unmatched CBO names (Git-ignored)
web/                      Shareable static map and generated public data
tests/                    Distance and relationship checks
.github/workflows/        Validation and GitHub Pages deployment
VERSION                   Current map/data release version
CHANGELOG.md              Human-readable changes
```

## Run locally

Requires Python 3.10+; install dependencies into your own virtual environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/build.py
python -m unittest discover -s tests
python -m http.server 8000 --directory web
```

Open http://localhost:8000. The map requires internet access for Leaflet 1.9.4 and OpenStreetMap tiles. Only `web/` is deployed. The original workbook and street addresses are excluded from the website. Published map data includes institution names and coordinates.

## Methodology and review

- Larger purple dots: CBOs. Smaller blue dots: DBE schools. Teal dots: FHR schools.
- Coordinates already in the workbook are reused, not independently verified. Missing or out-of-bounds coordinates remain unavailable, never zero-distance or invented points.
- Haversine distance uses latitude/longitude on a sphere of mean radius 6,371.0088 km. Exports preserve three decimal places; the map displays one. These are straight-line comparisons, not road lengths or travel times.
- DBE compares each CBO versus schools in the **same province**, as confirmed by the project owner. DBE tabs do not specify assignments. Select `national` in the config for all CBO-to-DBE pairs. An assignment-only option needs an explicit relationship table before implementation.
- FHR has explicit CBO-to-school assignments. Exact names after whitespace, case and punctuation normalization are matched within the province. Differing names are reported for review, never fuzzy-matched automatically. Add approved aliases to `config/cbo_aliases.json` as `{"FHR tab CBO name": "CBO partners tab name"}` and rebuild.
- Institution IDs are derived from type, province and normalized name, so row reordering does not change them. Renaming changes the ID. Future official EMIS/CBO IDs would improve identity tracking. Conflicting same-name records stop the build.
- DBE/FHR occurrences remain separate layers even when the same school appears in both; cross-program deduplication needs reviewed shared identifiers.

## Updating the workbook

1. Save a dated workbook in `data/raw/` and update `workbook` in the config, or replace the current source file yourself. The pipeline only reads it.
2. Run `python scripts/build.py`.
3. Review `reports/geocoding_queue.json` and `reports/unmatched_fhr_cbos.json`. For location corrections, use `data/geocoding/overrides.json`: `{"site-id": {"latitude": -26.0, "longitude": 28.0, "source": "Reviewed source URL or note"}}`.
4. Rebuild after corrections, run tests, inspect the map, update `VERSION` and `CHANGELOG.md`, and commit the config/code plus `web/data/` snapshot.
5. Push to `main`. GitHub Actions validates and deploys the snapshot. Each published dataset records the source workbook SHA-256 for traceability.

The first workflow intentionally deploys a locally generated snapshot because the workbook is excluded from Git. Fully automated Excel ingestion later needs an agreed source location (e.g. OneDrive retrieval in a protected job). Keep ingestion and geocoding separate from deployment so that deploying the same release does not trigger API calls or alter coordinates.

## GitHub and release versioning

Connect the intended repository, then choose **Settings → Pages → Source: GitHub Actions**. The provided workflow publishes `web/` after checks pass on `main`. Pull requests run validation without deployment.

Use feature branches and pull requests for changes. Keep `VERSION`, `CHANGELOG.md`, and generated metadata aligned. Suggested release convention: `v0.1.0` initial map, `v0.1.1` reviewed data corrections, `v0.2.0` new controls/layers, and `v1.0.0` the accepted first production map. Create annotated Git tags and GitHub Releases for milestones. Roll back by restoring a previous release snapshot in a new commit; `main` will redeploy it.

Repository: [graeme-dor/fhr-cbo-mapping-project](https://github.com/graeme-dor/fhr-cbo-mapping-project). Intended map URL: https://graeme-dor.github.io/fhr-cbo-mapping-project/.

## Future iterations

1. Review unmatched names and missing coordinates, then approve DBE comparison/assignment rules.
2. Add a provider-backed geocoding stage only for unresolved sites, with cached results, source metadata and human review of ambiguous candidates. Reuse the same resolver across tab adapters. Do not run public geocoding requests in the browser or on every deployment.
3. Add road routing as a separate distance provider. Preserve straight-line distance alongside road km and optional travel minutes. Cache by endpoint coordinates, routing profile and provider version.
4. Add distance thresholds, nearest-CBO summaries, search and school deduplication if needed.

References: [GitHub Pages deployment](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically), [Leaflet 1.9.4 documentation](https://leafletjs.com/reference-1.9.4.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), [Nominatim geocoding policy](https://operations.osmfoundation.org/policies/nominatim/).
