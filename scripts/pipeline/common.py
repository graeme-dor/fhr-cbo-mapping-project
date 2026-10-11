import hashlib
import math
import re


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def key(value):
    return re.sub(r"[^a-z0-9]", "", clean(value).lower())


def stable_id(kind, province, name):
    identity = f"{kind}:{key(province)}:{key(name)}"
    return kind.lower() + "-" + hashlib.sha256(identity.encode()).hexdigest()[:16]


def province(value):
    value = clean(value)
    return {"kwazulunatal": "KwaZulu-Natal", "northwest": "North West"}.get(key(value), value)


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def records(sheet):
    rows = sheet.iter_rows(values_only=True)
    headers = [clean(h).lower() for h in next(rows)]
    for row_number, row in enumerate(rows, 2):
        record = dict(zip(headers, row))
        if any(clean(v) for v in row):
            yield row_number, record


def make_site(kind, name, prov, address, location, lat, lon, gps, sheet, row):
    name, prov = clean(name), province(prov)
    if not name:
        return None
    latitude, longitude = number(lat), number(lon)
    if latitude is None or longitude is None:
        parts = clean(gps).split(",")
        if len(parts) == 2:
            latitude, longitude = map(number, parts)
    return dict(id=stable_id(kind, prov, name), kind=kind, name=name,
                province=prov, address=clean(address), location=clean(location),
                latitude=latitude, longitude=longitude,
                coordinate_source="workbook", source_sheet=sheet, source_row=row)
