"""Search GloFAS cells (via Open-Meteo Flood API) around each OPW gauge and
compare each cell's 2020 mean daily flow (one year keeps the search inside the free rate limit) with the gauge's measured mean.
The right cell is on the named river, close to the town, with a similar mean.
Output: data/cell_search.csv
"""
import csv, json, os, statistics as st, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWNS = json.load(open(os.path.join(ROOT, "data", "towns_gauges.json")))
API = "https://flood-api.open-meteo.com/v1/flood"
OFF = [-0.05, 0.0, 0.05]


def fetch(lats, lons):
    url = (f"{API}?latitude={','.join(f'{x:.3f}' for x in lats)}"
           f"&longitude={','.join(f'{x:.3f}' for x in lons)}"
           "&daily=river_discharge&start_date=2020-01-01&end_date=2020-12-31")
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "river-watch-student"}), timeout=180) as r:
        d = json.load(r)
    return d if isinstance(d, list) else [d]


out = []
for t in TOWNS:
    lats, lons = [], []
    for dy in OFF:
        for dx in OFF:
            lats.append(t["gauge_lat"] + dy); lons.append(t["gauge_lon"] + dx)
    seen = set()
    for res in fetch(lats, lons):
        key = (res["latitude"], res["longitude"])
        if key in seen:
            continue
        seen.add(key)
        q = [v for v in res["daily"]["river_discharge"] if v is not None]
        out.append({"town": t["town"], "cell_lat": key[0], "cell_lon": key[1],
                    "dist_to_town_km": round((((key[0]-t["town_lat"])*111)**2 + ((key[1]-t["town_lon"])*68)**2) ** .5, 1),
                    "glofas_mean": round(st.mean(q), 1), "gauge_mean": t["gauge_mean_2020"],
                    "ratio": round(st.mean(q) / t["gauge_mean_2020"], 2)})
    time.sleep(40)

with open(os.path.join(ROOT, "data", "cell_search.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0]))
    w.writeheader(); w.writerows(out)
for t in TOWNS:
    rows = sorted([r for r in out if r["town"] == t["town"]], key=lambda r: abs(1 - r["ratio"]))
    print(t["town"], t["gauge_mean_2020"], [(r["cell_lat"], r["cell_lon"], r["glofas_mean"], r["dist_to_town_km"]) for r in rows[:4]])
