# Changelog

## Accessibility map 0.3.1 — 2026-10-14

- Improve connection visibility with slightly thicker coloured strokes, darker grey comparisons and thin white casings in both distance modes.
- Explain coloured nearest-CBO, grey same-province and dashed assigned-FHR connections in the legend.
- Match legend symbol proportions with a larger CBO circle and smaller DBE circle.

## Accessibility map 0.3.0 — 2026-10-14

- Show all same-province CBO–DBE connections, with nearest allocations coloured and other connections in neutral grey.
- Split the distance panel into nearest and other DBE connections. Focusing a CBO shows every DBE school in its province without changing allocation colours.
- Add workbook-assigned FHR straight-line and road distances, dashed connections and a separate full CSV export.
- Preload all 425 DBE and 74 assigned FHR road paths, simplified for faster rendering. Map interaction makes no routing calls.

## Accessibility map 0.2.1 — 2026-10-12

- Start the basemap and straight-line view without waiting for road data.
- Load the saved road layer in the background and enable its control after validation.
- Serve pinned Leaflet assets locally and request tiles only after fitting the initial view.

## Accessibility map 0.2.0 — 2026-10-12

- Published the separate CBO-school accessibility map at `/accessibility/`, retaining the original map at the root URL.
- Added province-restricted nearest-CBO allocations for straight and preloaded road distances, DBE-first province groups and optional FHR markers.
- The full 425-row export has nine columns; CBO ID, DBE ID and Road Status are omitted.
- The original map stays at version 0.1.4.

## 0.1.4 — 2026-10-12

- Imported newly supplied coordinates for Ramokgwakgwa Special Needs Education School and Khonzakahle Primary School.
- Added both DBE school markers and their distances to CBOs in the same province.
- All 184 institution records now have coordinates; the source workbook is read without modification.

## 0.1.3 — 2026-10-11

- Fixed cached JavaScript referencing the removed methodology element.
- Versioned script, stylesheet and map data requests; the build updates asset URLs for each release.

## 0.1.2 — 2026-10-11

- Removed location/review counts and methodology descriptions from the map sidebar.
- Retained loading and error feedback, with methodology documented in the README.

## 0.1.1 — 2026-10-11

- Added eight approved FHR-to-CBO name mappings in a separate configuration file.
- Restored all 24 previously unmatched FHR school connections and their straight-line distances.
- Source workbook remains unchanged; all 74 FHR schools now have matched CBO assignments.

## 0.1.0 — 2026-10-11

- Initial modular workbook import, coordinate review queue, and Haversine distances.
- CBO, DBE and FHR map layers, province filter, CBO selection and distance CSV.
- GitHub Pages deployment workflow configured; initial release published.
- DBE comparisons use same-province schools, confirmed by the project owner. Unmatched FHR CBO names require review.
