"""Assign public map coordinates to pinned MDB district/metro polygons, offline."""
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVINCES = {'EC':'Eastern Cape','FS':'Free State','GP':'Gauteng','GT':'Gauteng','KZN':'KwaZulu-Natal','LP':'Limpopo','LIM':'Limpopo','MP':'Mpumalanga','NW':'North West','NC':'Northern Cape','WC':'Western Cape'}


def in_ring(point, ring):
    """Ray crossing, with boundary points reported separately for review."""
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:] + ring[:1]):
        cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax)
        if abs(cross) < 1e-12 and min(ax,bx)-1e-10 <= x <= max(ax,bx)+1e-10 and min(ay,by)-1e-10 <= y <= max(ay,by)+1e-10:
            return None
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            inside = not inside
    return inside


def contains(point, geometry):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in polygons:
        exterior = in_ring(point, polygon[0])
        if exterior is None:
            return None
        if exterior:
            for hole in polygon[1:]:
                result = in_ring(point, hole)
                if result is None:
                    return None
                if result:
                    break
            else:
                return True
    return False


def build(data):
    source = json.loads((ROOT/'data/boundaries/source.json').read_text())
    raw = gzip.decompress((ROOT/'data/boundaries/districts-mdb-2018.geojson.gz').read_bytes())
    if hashlib.sha256(raw).hexdigest() != source['geometry_sha256']:
        raise ValueError('Boundary source checksum mismatch')
    features = json.loads(raw)['features']
    if len(features) != source['feature_count'] or len({f['properties']['district'] for f in features}) != 52:
        raise ValueError('Incomplete district/metro boundary set')
    areas = []
    for f in features:
        g = f['geometry']
        if g['type'] not in ('Polygon','MultiPolygon'):
            raise ValueError('Unexpected district geometry')
        polys = [g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        points = [p for poly in polys for ring in poly for p in ring]
        areas.append((f, (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))))
    assignments = {}
    for s in data['sites']:
        x,y = s['longitude'],s['latitude']
        row = {k:s[k] for k in ('latitude','longitude','province')}
        row['status'] = 'unmatched'
        hits = []
        boundary = False
        if isinstance(x,(int,float)) and isinstance(y,(int,float)):
            for f, (xmin,ymin,xmax,ymax) in areas:
                if xmin <= x <= xmax and ymin <= y <= ymax:
                    result = contains((x,y),f['geometry'])
                    boundary |= result is None
                    if result:
                        hits.append(f['properties'])
        if len(hits)==1 and not boundary:
            a=hits[0]
            row.update(district_code=a['district'],district_name=a['district_n'],district_province=PROVINCES[a['province']],category=a['category'])
            row['status']='matched' if row['district_province']==s['province'] else 'province_mismatch'
        elif boundary or len(hits)>1:
            row['status']='boundary_review'
        assignments[s['id']]=row
    return {'metadata':source,'assignments':assignments}


def main():
    data=json.loads((ROOT/'web/data/map.json').read_text())
    output=build(data)
    (ROOT/'web/accessibility/data/districts.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(dict(Counter(r['status'] for r in output['assignments'].values())))
    names={s['id']:s['name'] for s in data['sites']}
    for key,row in output['assignments'].items():
        if row['status']!='matched':
            print(names[key], row)


if __name__=='__main__':
    main()
