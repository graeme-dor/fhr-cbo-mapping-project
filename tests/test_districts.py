import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('districts',ROOT/'scripts/build_districts.py')
districts=importlib.util.module_from_spec(spec)
spec.loader.exec_module(districts)

class DistrictGeometryTests(unittest.TestCase):
    def test_holes_boundaries_and_multipolygons(self):
        outer=[[0,0],[10,0],[10,10],[0,10],[0,0]]
        hole=[[4,4],[6,4],[6,6],[4,6],[4,4]]
        g={'type':'Polygon','coordinates':[outer,hole]}
        self.assertTrue(districts.contains((2,2),g))
        self.assertFalse(districts.contains((5,5),g))
        self.assertIsNone(districts.contains((0,5),g))
        self.assertIsNone(districts.contains((4,5),g))
        multi={'type':'MultiPolygon','coordinates':[[outer,hole],[[[20,20],[22,20],[22,22],[20,22],[20,20]]]]}
        self.assertTrue(districts.contains((21,21),multi))
        self.assertFalse(districts.contains((15,15),multi))

    def test_saved_assignments_match_pinned_source_and_current_sites(self):
        data=json.loads((ROOT/'web/data/map.json').read_text())
        saved=json.loads((ROOT/'web/accessibility/data/districts.json').read_text())
        self.assertEqual(districts.build(data),saved)
        self.assertEqual(len(saved['assignments']),len(data['sites']))
        names={s['name']:saved['assignments'][s['id']] for s in data['sites']}
        self.assertEqual(names['OUT-LGBT Well-being']['district_code'],'TSH')
        self.assertEqual(names['Tsosoloso School']['district_code'],'JHB')
        self.assertEqual(names['Wolvenkop Special School']['status'],'province_mismatch')
        self.assertTrue(all(r['status'] in ('matched','province_mismatch') for r in saved['assignments'].values()))

if __name__=='__main__':unittest.main()
