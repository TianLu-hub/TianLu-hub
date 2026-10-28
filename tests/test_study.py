import copy
from datetime import datetime
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import update_scene as study
from render_scene import render_footer, render_header


ZONE = ZoneInfo("America/New_York")
CONFIG = {"city": "New York", "latitude": 40.7128, "longitude": -74.006,
          "timezone": "America/New_York"}


def epoch(local):
    return datetime.fromisoformat(local).replace(tzinfo=ZONE).timestamp()


def payload(local="2026-10-28T12:00", code=61):
    date = local[:10]
    return {
        "current": {"time": epoch(local), "temperature_2m": 12.4,
                    "weather_code": code, "is_day": 1},
        "current_units": {"time": "unixtime", "temperature_2m": "°C"},
        "daily": {"sunrise": [epoch(date + "T07:20")],
                  "sunset": [epoch(date + "T18:00")]},
    }


class WeatherTests(unittest.TestCase):
    def test_weather_families(self):
        for code, expected in [(0, "clear"), (3, "cloud"), (48, "fog"),
                               (67, "rain"), (86, "snow"), (99, "storm")]:
            with self.subTest(code=code):
                data = payload(code=code)
                scene = study.build_scene(data, CONFIG, data["current"]["time"])
                self.assertEqual(scene["weather"], expected)

    def test_solar_boundaries_use_todays_sunrise(self):
        sunrise, sunset = epoch("2026-10-28T07:20"), epoch("2026-10-28T18:00")
        for local, expected in [("06:49", "night"), ("06:50", "dawn"),
                                ("07:49", "dawn"), ("07:50", "day"),
                                ("17:29", "day"), ("17:30", "dusk"),
                                ("18:29", "dusk"), ("18:30", "night")]:
            with self.subTest(local=local):
                self.assertEqual(study.phase_at(epoch("2026-10-28T" + local), sunrise, sunset), expected)

    def test_dst_local_labels_and_midnight_date(self):
        for local, abbreviation in [("2026-07-01T00:15", "EDT"),
                                    ("2026-12-01T00:15", "EST")]:
            data = payload(local)
            scene = study.build_scene(data, CONFIG, data["current"]["time"])
            self.assertTrue(scene["observed_label"].endswith(abbreviation))
            self.assertEqual(scene["phase"], "night")

    def test_rejects_stale_future_and_invalid_data(self):
        baseline = payload()
        now = baseline["current"]["time"]
        for key, value in [("temperature_2m", None), ("temperature_2m", float("nan")),
                           ("temperature_2m", True), ("weather_code", 500),
                           ("time", now - 5401), ("time", now + 901)]:
            with self.subTest(key=key, value=value):
                data = copy.deepcopy(baseline)
                data["current"][key] = value
                with self.assertRaises(ValueError):
                    study.build_scene(data, CONFIG, now)

    def test_rejects_missing_or_inverted_solar_day(self):
        data = payload()
        now = data["current"]["time"]
        data["daily"]["sunset"] = [data["daily"]["sunrise"][0] - 1]
        with self.assertRaises(ValueError):
            study.build_scene(data, CONFIG, now)
        data["daily"] = {"sunrise": [], "sunset": []}
        with self.assertRaises(ValueError):
            study.build_scene(data, CONFIG, now)

    def test_failed_fetch_keeps_existing_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "study.json").write_text(json.dumps(CONFIG))
            assets = root / "assets"
            assets.mkdir()
            original = {"night-header.svg": "previous header", "night-footer.svg": "previous footer"}
            for filename, content in original.items():
                (assets / filename).write_text(content)
            with patch.object(sys, "argv", ["update_scene", "--config", str(root / "study.json"),
                                             "--output", str(assets)]), \
                    patch.object(study, "fetch_weather", side_effect=OSError("API unavailable")):
                self.assertEqual(study.main(), 1)
            for filename, content in original.items():
                self.assertEqual((assets / filename).read_text(), content)


class RenderTests(unittest.TestCase):
    def test_all_weather_and_phase_combinations_are_safe_svg(self):
        data = payload()
        base = study.build_scene(data, CONFIG, data["current"]["time"])
        for phase in ("dawn", "day", "dusk", "night"):
            for weather in ("clear", "cloud", "rain", "snow", "fog", "storm"):
                with self.subTest(phase=phase, weather=weather):
                    scene = dict(base, phase=phase, weather=weather)
                    for renderer in (render_header, render_footer):
                        svg = renderer(scene)
                        root = ET.fromstring(svg)
                        self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
                        self.assertIn("prefers-reduced-motion", svg)
                        self.assertNotIn("<script", svg)
                        self.assertNotIn("<foreignObject", svg)
                        for element in root.iter():
                            for name, value in element.attrib.items():
                                self.assertFalse(name.startswith("on"))
                                if name.endswith("href"):
                                    self.assertTrue(value.startswith("#"))

    def test_metadata_is_xml_escaped(self):
        data = payload()
        scene = study.build_scene(data, CONFIG, data["current"]["time"])
        scene.update(city='New <York> & "friends"', weather_label="Rain & clouds")
        svg = render_header(scene)
        self.assertIn("New &lt;York&gt; &amp;", svg)
        ET.fromstring(svg)

    def test_unchanged_render_does_not_rewrite_files(self):
        data = payload()
        scene = study.build_scene(data, CONFIG, data["current"]["time"])
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            study.write_scene(scene, target)
            before = {p.name: p.stat().st_mtime_ns for p in target.iterdir()}
            study.write_scene(scene, target)
            after = {p.name: p.stat().st_mtime_ns for p in target.iterdir()}
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
