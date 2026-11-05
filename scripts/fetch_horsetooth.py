#!/usr/bin/env python3
"""
Fetch daily water data for Horsetooth Reservoir, CO (station HTOOTHR)
from the US Bureau of Reclamation HydroMet ARC050 service and emit JSON.

Source: https://www.usbr.gov/gp-bin/arc050_form.pl?HTOOTHR
Report:  ARC050, Daily Data for One Year

Usage:
    python3 fetch_horsetooth.py [--years 2026 2025 2024] [--out data.json]
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

URL = "https://www.usbr.gov/gp-bin/arc050.pl"
STATION = "HTOOTHR"

# Parameters to pull. FB = forebay elevation (water level), AF = storage,
# QD = total discharge (outflow), IN = computed inflow, PP = precipitation.
PARAMS = ["FB", "AF", "QD", "IN", "PP"]

MONTHS = {
    "October": 10, "November": 11, "December": 12, "January": 1,
    "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9,
}

UNITS = {
    "FB": "ft",
    "AF": "acre-ft",
    "QD": "cfs",
    "IN": "cfs",
    "PP": "in",
}

LABELS = {
    "FB": "Forebay Elevation (water level)",
    "AF": "Storage Content",
    "QD": "Total Discharge (outflow)",
    "IN": "Computed Inflow",
    "PP": "Precipitation",
}

# Values the ARC050 report uses for missing data.
MISSING = {"", "*", "-", "--", "M", "E"}

# Plausibility windows for QC. Values outside are treated as sensor/report
# artifacts and dropped (observed: a -2.0 elevation sentinel and a single
# 8-ft one-day spike in the tail of a partially-completed water year).
PLAUSIBLE = {
    "FB": (5300.0, 5500.0),   # forebay elevation, ft
    "AF": (0.0, 200000.0),    # storage, acre-ft
    "QD": (0.0, 5000.0),      # discharge, cfs
    "IN": (0.0, 5000.0),      # inflow, cfs
    "PP": (0.0, 5.0),         # precip, in
}


def fetch_year(year: int) -> str:
    body = urllib.parse.urlencode({
        "station": STATION,
        "parameters": "ALL",
        "year": str(year),
    }).encode()
    req = urllib.request.Request(URL, data=body)
    req.add_header("User-Agent", "horsetooth-dashboard/1.0")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_year(text: str, year: int) -> dict:
    """Return {param: {date_iso: value}} for one water-year report."""
    parts = re.split(r"Parameter code:\s+(\S+)\s+([^\n]*)\n", text)
    out: dict = {}
    for i in range(1, len(parts), 3):
        code = parts[i].strip()
        if code not in PARAMS:
            continue
        block = parts[i + 2]
        hdr = re.search(r"Day\s+((?:[A-Z][a-z]+\s+)+)", block)
        if not hdr:
            continue
        months = hdr.group(1).split()
        series: dict = {}
        for line in block.splitlines():
            m = re.match(r"^\s*(\d{1,2})\s+(.*)$", line)
            if not m:
                continue
            day = int(m.group(1))
            for mi, raw in enumerate(m.group(2).split()):
                if mi >= len(months) or raw in MISSING:
                    continue
                try:
                    val = float(raw)
                except ValueError:
                    continue
                lo, hi = PLAUSIBLE.get(code, (-float("inf"), float("inf")))
                if not lo <= val <= hi:
                    continue
                mo = MONTHS[months[mi]]
                # USBR names a water year by the calendar year it ENDS in:
                # water year YYYY runs Oct (YYYY-1) through Sep (YYYY).
                yr = year - 1 if mo >= 10 else year
                try:
                    d = dt.date(yr, mo, day)
                except ValueError:
                    continue
                series[d.isoformat()] = val
        out[code] = series
    return out


def merge(years: dict) -> dict:
    """Merge per-water-year dicts into one series per parameter."""
    merged = {p: {} for p in PARAMS}
    for _year, params in years.items():
        for p, series in params.items():
            merged.setdefault(p, {}).update(series)
    for p in merged:
        merged[p] = {k: merged[p][k] for k in sorted(merged[p])}
    return merged


def summarize(merged: dict) -> dict:
    stats = {}
    for p, series in merged.items():
        if not series:
            continue
        vals = list(series.values())
        dates = list(series)
        stats[p] = {
            "unit": UNITS[p],
            "label": LABELS[p],
            "count": len(vals),
            "min": min(vals),
            "max": max(vals),
            "first_date": dates[0],
            "last_date": dates[-1],
            "last_value": series[dates[-1]],
        }
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="+", type=int,
                    default=[2027, 2026, 2025, 2024, 2023, 2022, 2021])
    ap.add_argument("--out", default="data.json")
    args = ap.parse_args()

    per_year = {}
    for y in args.years:
        try:
            text = fetch_year(y)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"warning: water year {y} failed: {exc}", file=sys.stderr)
            continue
        if "Enter a valid 4 digit water year" in text:
            print(f"warning: water year {y} rejected by server", file=sys.stderr)
            continue
        per_year[str(y)] = parse_year(text, y)

    merged = merge(per_year)
    payload = {
        "station": STATION,
        "station_name": "Horsetooth Reservoir, CO (SCADA)",
        "source": "https://www.usbr.gov/gp-bin/arc050_form.pl?HTOOTHR",
        "report": "ARC050, Daily Data for One Year",
        "generated": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "note": ("USBR names a water year by the calendar year it ENDS in, so water "
                 "year YYYY runs Oct (YYYY-1) through Sep (YYYY). A report for YYYY "
                 "therefore covers Oct of the previous calendar year through Sep of "
                 "YYYY. Days with no value are omitted."),
        "params": PARAMS,
        "units": UNITS,
        "labels": LABELS,
        "stats": summarize(merged),
        "data": merged,
    }
    with open(args.out, "w") as fh:
        json.dump(payload, fh)
    # Also publish a copy into the web root so the static server serves it.
    web_copy = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "public", "data.json")
    with open(web_copy, "w") as fh:
        json.dump(payload, fh)
    print(f"wrote {args.out} and {os.path.normpath(web_copy)}: "
          f"{len(per_year)} water years, {sum(len(v) for v in merged.values())} points")
    for p in PARAMS:
        s = payload["stats"].get(p)
        if s:
            print(f"  {p:3} {s['label']:34} {s['count']:4d} pts  "
                  f"{s['first_date']} .. {s['last_date']}  "
                  f"last={s['last_value']:.2f} {s['unit']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
