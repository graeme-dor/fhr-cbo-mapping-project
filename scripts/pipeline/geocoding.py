from .common import number


def resolve(sites, overrides, bounds):
    """Reuse workbook coordinates; apply reviewed overrides; never guess locations."""
    south, north, west, east = bounds
    queue = []
    for site in sites:
        override = overrides.get(site["id"])
        if override:
            if not override.get("source"):
                raise ValueError(f"Override needs a source: {site['id']}")
            site.update(latitude=number(override.get("latitude")),
                        longitude=number(override.get("longitude")),
                        coordinate_source=override["source"])
        lat, lon = site["latitude"], site["longitude"]
        valid = lat is not None and lon is not None and south <= lat <= north and west <= lon <= east
        site["coordinate_status"] = "available" if valid else "needs_review"
        if not valid:
            queue.append(dict(id=site["id"], name=site["name"], kind=site["kind"],
                              province=site["province"], address=site["address"],
                              source_sheet=site["source_sheet"], source_row=site["source_row"],
                              reason="Missing or outside South Africa bounds"))
    return queue
