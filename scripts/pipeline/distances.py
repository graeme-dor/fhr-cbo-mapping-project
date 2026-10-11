import math
from .common import key


def haversine(a, b):
    lat1, lat2 = map(math.radians, [a["latitude"], b["latitude"]])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, max(0, h))))


def build(sites, scope, aliases):
    if scope not in ("province", "national"):
        raise ValueError("DBE scope must be province or national")
    cbos = [s for s in sites if s["kind"] == "CBO"]
    links, unmatched = [], []
    for school in [s for s in sites if s["kind"] != "CBO"]:
        if school["kind"] == "FHR":
            name = aliases.get(school["cbo_name"], school["cbo_name"])
            candidates = [c for c in cbos if key(c["name"]) == key(name) and c["province"] == school["province"]]
            if len(candidates) != 1:
                unmatched.append(dict(school_id=school["id"], cbo_name=school["cbo_name"],
                                      province=school["province"], source_row=school["source_row"]))
                continue
            basis = "workbook_fhr_assignment"
        else:
            candidates = [c for c in cbos if scope == "national" or c["province"] == school["province"]]
            basis = "dbe_" + scope + "_comparison"
        for cbo in candidates:
            available = all(s["coordinate_status"] == "available" for s in (cbo, school))
            links.append(dict(cbo_id=cbo["id"], school_id=school["id"], basis=basis,
                              distance_method="haversine", distance_km=round(haversine(cbo, school), 3) if available else None))
    return links, unmatched
