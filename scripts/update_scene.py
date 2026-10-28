#!/usr/bin/env python3
"""Fetch city weather and render self-contained SVGs for a GitHub README."""

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

from render_scene import render_footer, render_header

ROOT = Path(__file__).resolve().parents[1]
WEATHER = {
    0: ("clear", "Clear"), 1: ("clear", "Mostly clear"),
    2: ("cloud", "Partly cloudy"), 3: ("cloud", "Overcast"),
    45: ("fog", "Fog"), 48: ("fog", "Freezing fog"),
    51: ("rain", "Light drizzle"), 53: ("rain", "Drizzle"),
    55: ("rain", "Dense drizzle"), 56: ("rain", "Freezing drizzle"),
    57: ("rain", "Freezing drizzle"), 61: ("rain", "Light rain"),
    63: ("rain", "Rain"), 65: ("rain", "Heavy rain"),
    66: ("rain", "Freezing rain"), 67: ("rain", "Freezing rain"),
    71: ("snow", "Light snow"), 73: ("snow", "Snow"),
    75: ("snow", "Heavy snow"), 77: ("snow", "Snow grains"),
    80: ("rain", "Light showers"), 81: ("rain", "Showers"),
    82: ("rain", "Heavy showers"), 85: ("snow", "Snow showers"),
    86: ("snow", "Heavy snow showers"), 95: ("storm", "Thunderstorm"),
    96: ("storm", "Storm with hail"), 99: ("storm", "Storm with hail"),
}


def number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Invalid " + name)
    return value


def validate_config(config):
    if not isinstance(config.get("city"), str) or not 1 <= len(config["city"]) <= 40:
        raise ValueError("City must contain 1–40 characters")
    if not -90 <= number(config.get("latitude"), "latitude") <= 90:
        raise ValueError("Latitude out of range")
    if not -180 <= number(config.get("longitude"), "longitude") <= 180:
        raise ValueError("Longitude out of range")
    ZoneInfo(config["timezone"])
    return config


def fetch_weather(config):
    query = urlencode({
        "latitude": config["latitude"], "longitude": config["longitude"],
        "timezone": config["timezone"], "timeformat": "unixtime",
        "current": "temperature_2m,weather_code,is_day",
        "daily": "sunrise,sunset", "forecast_days": 2,
    })
    request = Request("https://api.open-meteo.com/v1/forecast?" + query,
                      headers={"User-Agent": "TianLu-hub-living-study/1.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except (URLError, TimeoutError, OSError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def phase_at(now, sunrise, sunset):
    # A short transition on either side of sunrise/sunset; no fixed clock hours.
    transition = 30 * 60
    if sunrise - transition <= now < sunrise + transition:
        return "dawn"
    if sunset - transition <= now < sunset + transition:
        return "dusk"
    return "day" if sunrise <= now < sunset else "night"


def build_scene(payload, config, now=None):
    validate_config(config)
    now = time.time() if now is None else number(now, "current time")
    local_zone = ZoneInfo(config["timezone"])
    current = payload["current"]
    observed = number(current.get("time"), "weather timestamp")
    if not -900 <= now - observed <= 5400:
        raise ValueError("Weather timestamp is stale or in the future")
    temperature = number(current.get("temperature_2m"), "temperature")
    if not -100 <= temperature <= 70:
        raise ValueError("Temperature out of range")
    code = number(current.get("weather_code"), "weather code")
    if code not in WEATHER:
        raise ValueError("Unknown WMO weather code")
    if payload.get("current_units", {}).get("temperature_2m") != "°C":
        raise ValueError("Expected Celsius temperature")
    if payload.get("current_units", {}).get("time") != "unixtime":
        raise ValueError("Expected Unix timestamps")

    today = datetime.fromtimestamp(now, local_zone).date()
    daily = payload["daily"]
    sunrise = sunset = None
    for raw_rise, raw_set in zip(daily["sunrise"], daily["sunset"]):
        rise = number(raw_rise, "sunrise")
        setting = number(raw_set, "sunset")
        if datetime.fromtimestamp(rise, local_zone).date() == today:
            if not rise < setting or datetime.fromtimestamp(setting, local_zone).date() != today:
                raise ValueError("Invalid sunrise/sunset interval")
            sunrise, sunset = rise, setting
            break
    if sunrise is None:
        raise ValueError("No sunrise/sunset for today's local date")

    weather, label = WEATHER[code]
    local_observed = datetime.fromtimestamp(observed, local_zone)
    return {
        "city": config["city"], "timezone": config["timezone"],
        "temperature_c": round(temperature, 1), "weather": weather,
        "weather_label": label, "weather_code": int(code),
        "phase": phase_at(now, sunrise, sunset),
        "observed_at": datetime.fromtimestamp(observed, timezone.utc).isoformat(),
        "observed_label": local_observed.strftime("%b %d, %H:%M %Z"),
        "sunrise": datetime.fromtimestamp(sunrise, local_zone).isoformat(),
        "sunset": datetime.fromtimestamp(sunset, local_zone).isoformat(),
        "source": "https://open-meteo.com/",
    }


def write_scene(scene, output_dir):
    # Complete and validate every render before touching the published assets.
    header, footer = render_header(scene), render_footer(scene)
    for svg in (header, footer):
        if ET.fromstring(svg).tag != "{http://www.w3.org/2000/svg}svg":
            raise ValueError("Renderer did not produce an SVG")
    files = {
        "night-header.svg": header, "night-footer.svg": footer,
        "study-state.json": json.dumps(scene, ensure_ascii=False, indent=2) + "\n",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in files.items():
        target = output_dir / filename
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "study.json")
    parser.add_argument("--output", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    try:
        config = validate_config(json.loads(args.config.read_text(encoding="utf-8")))
        scene = build_scene(fetch_weather(config), config)
        write_scene(scene, args.output)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("Scene update failed; previous assets retained: " + str(error), file=sys.stderr)
        return 1
    print("Updated {city}: {weather_label}, {temperature_c}°C, {phase}; {observed_label}".format(**scene))
    return 0


if __name__ == "__main__":
    sys.exit(main())
