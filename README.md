# Horsetooth Reservoir — Water Level, Elevation & Outflow

Daily water data dashboard for **Horsetooth Reservoir, CO** from the U.S. Bureau of
Reclamation HydroMet **ARC050** service, station `HTOOTHR`.

Source: <https://www.usbr.gov/gp-bin/arc050_form.pl?HTOOTHR>

## Data

| Code | Parameter | Unit |
|------|-----------|------|
| `FB` | Forebay elevation (water level) | ft |
| `AF` | Reservoir storage content | acre-ft |
| `QD` | Daily mean total discharge (outflow) | cfs |
| `IN` | Daily mean computed inflow | cfs |
| `PP` | Total precipitation | in/day |

USBR reports by **water year**, which runs Oct 1 – Sep 30. A water-year report for
`YYYY` therefore covers Oct `YYYY` through Sep `YYYY+1`, so consecutive reports overlap
by 11 months. The fetcher merges them and deduplicates by date.

## Refresh the data

```bash
python3 scripts/fetch_horsetooth.py
```

Writes `data.json` and `public/data.json`. Defaults to water years 2021–2026
(`--years 2026 2025 2024` to narrow it).

## Run locally

```bash
python3 serve.py            # http://127.0.0.1:8004/
python3 serve.py --port 9000 --host 0.0.0.0
```

Any static file server pointed at `public/` works too.

## Files

```
scripts/fetch_horsetooth.py   fetch + parse + QC + JSON export
serve.py                      static file server (default port 8004)
public/index.html             dashboard markup
public/styles.css             theme
public/app.js                 chart rendering (ECharts, via CDN)
public/data.json              generated dataset
```

## Notes

- Values outside per-parameter plausibility windows are dropped as sensor/report
  artifacts (observed in the source: a `-2.0` elevation sentinel and a single 8-ft
  one-day spike in the tail of an incomplete water year).
- Data are provisional and subject to revision by USBR.
