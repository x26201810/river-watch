"""Flood Plan rule 8: count each town's high-flow events (run once, stored).

Event = a run of consecutive days with daily flow >= the town's own P99
(the same P99 River Watch uses for Barriers), counted only inside the winters
1 Oct - 31 Mar, 2016/17 to 2024/25 (9 winters). A run that crosses 31 Mar or
1 Oct is cut at the winter edge. Input: data/history_daily.csv (GloFAS cell),
data/history_summary.json (P99). Output: data/events.json
"""
import csv, json, os
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
summary = {t["town"]: t for t in json.load(open(os.path.join(ROOT, "data", "history_summary.json")))["towns"]}
flows = {}
for r in csv.DictReader(open(os.path.join(ROOT, "data", "history_daily.csv"))):
    if r["glofas_m3s"] != "":
        flows.setdefault(r["town"], {})[r["date"]] = float(r["glofas_m3s"])

WINTERS = [f"{y}/{str(y + 1)[2:]}" for y in range(2016, 2025)]
FIRST4, LAST4 = WINTERS[:4], WINTERS[-4:]

out = {"rule": "Flood Plan rule 8", "definition": "run of consecutive days with daily flow >= town P99, inside 1 Oct-31 Mar",
       "winters": WINTERS, "first_four": FIRST4, "last_four": LAST4,
       "source": "Open-Meteo Flood API (GloFAS v4), same cells and P99 as history_summary.json; scripts/build_events.py",
       "towns": []}
for town, s in summary.items():
    p99, q = s["p99_m3s"], flows[town]
    per_winter, events = {}, []
    for i, w in enumerate(WINTERS):
        y = 2016 + i
        d, end = date(y, 10, 1), date(y + 1, 3, 31)
        run = None
        n = 0
        while d <= end:
            v = q.get(d.isoformat())
            if v is not None and v >= p99:
                if run is None:
                    run = {"winter": w, "start": d.isoformat(), "days": 0, "peak_m3s": v}
                run["days"] += 1
                run["peak_m3s"] = max(run["peak_m3s"], v)
                run["end"] = d.isoformat()
            elif run:
                events.append(run); n += 1; run = None
            d += timedelta(days=1)
        if run:
            events.append(run); n += 1
        per_winter[w] = n
    total = sum(per_winter.values())
    f4, l4 = sum(per_winter[w] for w in FIRST4), sum(per_winter[w] for w in LAST4)
    out["towns"].append({"town": town, "p99_m3s": p99, "total_events": total, "per_winter": per_winter,
                         "first_four_events": f4, "last_four_events": l4,
                         "trend": "more in last four" if l4 > f4 else "fewer in last four" if l4 < f4 else "same",
                         "total_event_days": sum(e["days"] for e in events), "events": events})
    print(f"{town:20} total={total:2d} first4={f4} last4={l4} days={out['towns'][-1]['total_event_days']} {per_winter}")

json.dump(out, open(os.path.join(ROOT, "data", "events.json"), "w"), indent=1)
