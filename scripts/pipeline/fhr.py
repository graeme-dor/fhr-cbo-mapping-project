from .common import clean, make_site, records


def extract(sheet):
    sites = []
    for row, r in records(sheet):
        for slot in range(1, 4):
            prefix = f"school {slot} "
            site = make_site("FHR", r.get(prefix + "name"), r.get("province"),
                             r.get(prefix + "physical address"), "",
                             r.get(prefix + "latitude"), r.get(prefix + "longitude"),
                             r.get(prefix + "gps coordinates", r.get(prefix + "gps coordinate")),
                             sheet.title, row)
            if site:
                site["cbo_name"] = clean(r.get("cbo"))
                sites.append(site)
    return sites
