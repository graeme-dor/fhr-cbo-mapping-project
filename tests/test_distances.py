import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from pipeline.distances import haversine, build
from pipeline.geocoding import resolve


class GeographyTests(unittest.TestCase):
    def test_known_distance(self):
        a = {"latitude": 0, "longitude": 0}
        b = {"latitude": 0, "longitude": 1}
        self.assertAlmostEqual(haversine(a, b), 111.195, places=3)
        self.assertEqual(haversine(a, a), 0)
        self.assertEqual(haversine(a, b), haversine(b, a))

    def test_missing_coordinates_remain_unavailable(self):
        sites = [dict(id="c", kind="CBO", name="Partner", province="Limpopo", coordinate_status="available", latitude=-24, longitude=29),
                 dict(id="s", kind="DBE", name="School", province="Limpopo", coordinate_status="needs_review")]
        links, _ = build(sites, "province", {})
        self.assertIsNone(links[0]["distance_km"])
        sites[1]["province"] = "Gauteng"
        self.assertEqual(build(sites, "province", {})[0], [])

    def test_ambiguous_fhr_assignment_is_not_guessed(self):
        sites = [dict(id="c", kind="CBO", name="Partner NPC", province="Limpopo"),
                 dict(id="s", kind="FHR", name="School", province="Limpopo", cbo_name="Partner", source_row=2)]
        links, unmatched = build(sites, "province", {})
        self.assertEqual(links, [])
        self.assertEqual(len(unmatched), 1)


if __name__ == "__main__":
    unittest.main()
