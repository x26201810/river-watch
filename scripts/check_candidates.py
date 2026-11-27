"""For the 2-3 best candidate cells per town, correlate GloFAS daily flow with
the OPW gauge's measured daily mean flow over 2020 (same days only).
High correlation + similar size = same river. Output: data/candidate_check.csv
"""
import csv, json, os, statistics as st, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWNS = {t["town"]: t for t in json.load(open(os.path.join(ROOT, "data", "towns_gauges.json")))}
CANDS = {
    "Clonmel": [(52.375, -7.675), (52.375, -7.725), (52.375, -7.625)],
    "Fermoy": [(52.125, -8.325), (52.125, -8.225), (52.175, -8.275)],
    "Mallow": [(52.125, -8.625), (52.125, -8.675)],
    "Bandon": [(51.775, -8.725), (51.725, -8.675)],
    "Enniscorthy": [(52.525, -6.575), (52.475, -6.625), (52.525, -6.625)],
    "Ennis": [(52.825, -9.025), (52.875, -9.025), (52.825, -8.975)],
    "Athlone": [(53.425, -7.975), (53.375, -7.975)],
    "Carrick-on-Shannon": [(53.925, -8.075), (53.925, -8.025)],
}


def gauge_series(no):
    for ts in json.load(open(os.path.join(ROOT, "data", "raw", "opw", f"{no}.json"))):
        if ts["ts_shortname"] == "WEB.Day.Mean":
            return {r[0][:10]: r[1] for r in ts["data"] if r[1] is not None}


def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** .5


rows = []
for town, cells in CANDS.items():
    g = gauge_series(TOWNS[town]["gauge_no"])
    url = ("https://flood-api.open-meteo.com/v1/flood?latitude=" + ",".join(str(c[0]) for c in cells)
           + "&longitude=" + ",".join(str(c[1]) for c in cells)
           + "&daily=river_discharge&start_date=2020-01-01&end_date=2020-12-31")
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "river-watch-student"}), timeout=180) as r:
        res = json.load(r)
    res = res if isinstance(res, list) else [res]
    for c, d in zip(cells, res):
        pairs = [(v, g[day]) for day, v in zip(d["daily"]["time"], d["daily"]["river_discharge"]) if v is not None and day in g]
        a, b = [p[0] for p in pairs], [p[1] for p in pairs]
        rows.append({"town": town, "cell_lat": d["latitude"], "cell_lon": d["longitude"], "days": len(pairs),
                     "glofas_mean": round(st.mean(a), 1), "gauge_mean": round(st.mean(b), 1),
                     "ratio": round(st.mean(a) / st.mean(b), 2), "daily_corr": round(corr(a, b), 3)})
        print(rows[-1])
    time.sleep(15)

with open(os.path.join(ROOT, "data", "candidate_check.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
