"""Read the source workbook and generate reviewed, traceable map data."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
import openpyxl
from pipeline import cbos, dbe, fhr, geocoding, distances

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text())


def save(path, value):
    (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    config = read("config/project.json")
    source = ROOT / config["workbook"]
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sites = cbos.extract(workbook[config["cbo_sheet"]])
    for sheet in config["dbe_sheets"]:
        sites.extend(dbe.extract(workbook[sheet]))
    sites.extend(fhr.extract(workbook[config["fhr_sheet"]]))
    workbook.close()
    # Preserve repeated source occurrences without multiplying map markers.
    unique = {}
    for site in sites:
        previous = unique.get(site["id"])
        if previous:
            fields = ("name", "province", "address", "latitude", "longitude", "cbo_name")
            if any(previous.get(k) != site.get(k) for k in fields):
                raise ValueError(f"Conflicting duplicate institution: {site['name']}; introduce an explicit ID/disambiguation")
            previous["source_occurrences"].append({"sheet": site["source_sheet"], "row": site["source_row"]})
        else:
            site["source_occurrences"] = [{"sheet": site["source_sheet"], "row": site["source_row"]}]
            unique[site["id"]] = site
    sites = list(unique.values())
    queue = geocoding.resolve(sites, read("data/geocoding/overrides.json"), config["coordinate_bounds"])
    links, unmatched = distances.build(sites, config["dbe_distance_scope"], read("config/cbo_aliases.json"))
    metadata = dict(version=(ROOT / "VERSION").read_text().strip(), workbook_sha256=digest,
                    distance_method="haversine", dbe_scope=config["dbe_distance_scope"],
                    dbe_scope_status=config["dbe_scope_status"], counts=dict(Counter(s["kind"] for s in sites)),
                    missing_coordinates=len(queue), unresolved_fhr_assignments=len(unmatched))
    save("data/processed/sites.json", sites)
    save("data/processed/distances.json", links)
    save("reports/geocoding_queue.json", queue)
    save("reports/unmatched_fhr_cbos.json", unmatched)
    save("reports/build_summary.json", metadata)
    # Only fields needed for the shareable map enter the website.
    public_sites = [{k: s[k] for k in ("id", "kind", "name", "province", "latitude", "longitude", "coordinate_status")} for s in sites]
    save("web/data/map.json", dict(metadata=metadata, sites=public_sites, links=links))
    # A new release must not reuse cached scripts/styles from a previous page.
    index = ROOT / "web/index.html"
    html = index.read_text()
    for asset in ("app.js", "styles.css"):
        html = re.sub(re.escape(asset) + r'(?:\?v=[^"\s]*)?(?=")',
                      asset + "?v=" + metadata["version"], html)
    index.write_text(html)
    with (ROOT / "web/data/distances.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["CBO", "School", "School layer", "Basis", "Straight-line km"])
        lookup = {s["id"]: s for s in sites}
        for link in links:
            # Prefix spreadsheet formula characters in institution names for safe CSV opening.
            def safe(value):
                return "'" + value if value.startswith(("=", "+", "-", "@")) else value
            writer.writerow([safe(lookup[link["cbo_id"]]["name"]), safe(lookup[link["school_id"]]["name"]),
                             lookup[link["school_id"]]["kind"], link["basis"], link["distance_km"]])
    if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise RuntimeError("Source workbook changed during build")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
