from .common import make_site, records


def extract(sheet):
    return [site for row, r in records(sheet)
            if (site := make_site("CBO", r.get("institution name"), r.get("province"),
                                  r.get("physical address"), r.get("location"),
                                  r.get("latitude"), r.get("longitude"),
                                  r.get("gps coordinates"), sheet.title, row))]
