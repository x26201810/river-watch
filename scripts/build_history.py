"""Build the stored history summary River Watch uses (run once, not per question).

For each town's chosen GloFAS cell:
  * fetch daily river discharge 2016-01-01..2025-12-31 from the Open-Meteo Flood API
    (GloFAS reanalysis/consolidated record for the same cell the forecast uses)
  * compute P95 and P99 (linear interpolation, same as numpy/Excel PERCENTILE.INC)
  * check against the OPW gauge on the same days: mean ratio and daily correlation
Outputs:
  data/history_daily.csv   one row per town per day (kept so later tasks never refetch)
  data/history_summary.csv one row per town  <- what the tool reads
  data/history_summary.json same, for the web page
"""
import csv, json, os, statistics as st, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWNS = json.load(open(os.path.join(ROOT, "data", "towns_gauges.json")))
START, END = "2016-01-01", "2025-12-31"
CELLS = {  # chosen in check_candidates.py / see README for the reasoning
    "Clonmel": (52.375, -7.675), "Fermoy": (52.125, -8.325), "Mallow": (52.125, -8.625),
    "Bandon": (51.775, -8.725), "Enniscorthy": (52.525, -6.575), "Ennis": (52.825, -9.025),
    "Athlone": (53.425, -7.975), "Carrick-on-Shannon": (53.925, -8.075),
}


def pct(sorted_vals, p):
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    return sum((x-ma)*(y-mb) for x, y in zip(a, b)) / (sum((x-ma)**2 for x in a) * sum((y-mb)**2 for y in b)) ** .5


def gauge(no):
    for ts in json.load(open(os.path.join(ROOT, "data", "raw", "opw", f"{no}.json"))):
        if ts["ts_shortname"] == "WEB.Day.Mean":
            return {r[0][:10]: r[1] for r in ts["data"] if r[1] is not None}


daily, summary = [], []
for t in TOWNS:
    lat, lon = CELLS[t["town"]]
    raw_path = os.path.join(ROOT, "data", "raw", "glofas", f"{t['town']}.json")
    if not os.path.exists(raw_path):
        url = (f"https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lon}"
               f"&daily=river_discharge&start_date={START}&end_date={END}")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "river-watch-student"}), timeout=180) as r:
            open(raw_path, "w").write(r.read().decode())
        time.sleep(20)
    d = json.load(open(raw_path))
    days, q = d["daily"]["time"], d["daily"]["river_discharge"]
    vals = sorted(v for v in q if v is not None)
    g = gauge(t["gauge_no"])
    pairs = [(v, g[day]) for day, v in zip(days, q) if v is not None and day in g]
    for day, v in zip(days, q):
        daily.append({"town": t["town"], "date": day, "glofas_m3s": v, "gauge_m3s": g.get(day, "")})
    a, b = [p[0] for p in pairs], [p[1] for p in pairs]
    gs = sorted(b)
    summary.append({
        "town": t["town"], "county": t["county"], "river": t["river"],
        "town_lat": t["town_lat"], "town_lon": t["town_lon"],
        "cell_lat": d["latitude"], "cell_lon": d["longitude"],
        "period": f"{START} to {END}", "days": len(vals), "missing_days": len(q) - len(vals),
        "mean_m3s": round(st.mean(vals), 1), "median_m3s": round(st.median(vals), 1),
        "p95_m3s": round(pct(vals, .95), 1), "p99_m3s": round(pct(vals, .99), 1),
        "max_m3s": round(vals[-1], 1),
        "gauge_no": t["gauge_no"], "gauge_name": t["gauge_name"], "overlap_days": len(pairs),
        "gauge_mean_m3s": round(st.mean(b), 1), "glofas_mean_same_days": round(st.mean(a), 1),
        "model_to_gauge_ratio": round(st.mean(a) / st.mean(b), 2), "daily_corr": round(corr(a, b), 3),
        "gauge_p99_m3s": round(pct(gs, .99), 1),
    })
    print(summary[-1])

with open(os.path.join(ROOT, "data", "history_daily.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(daily[0])); w.writeheader(); w.writerows(daily)
with open(os.path.join(ROOT, "data", "history_summary.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(summary[0])); w.writeheader(); w.writerows(summary)
json.dump({"source": "Open-Meteo Flood API (GloFAS v4), computed by scripts/build_history.py",
           "built": time.strftime("%Y-%m-%d"), "towns": summary},
          open(os.path.join(ROOT, "data", "history_summary.json"), "w"), indent=1)
