# Task 1: Find and check the data

Sources were checked and downloaded on 26 November 2026. The scripts are in `scripts/` and their outputs in `data/`.

## 1.1 Sources

| # | Data | Publisher | Address | Licence / attribution | Fields used |
|---|---|---|---|---|---|
| 1 | River flow forecast | Open-Meteo, serving GloFAS v4 (Copernicus Emergency Management Service) | `flood-api.open-meteo.com/v1/flood?latitude=…&longitude=…&daily=river_discharge&forecast_days=3&timezone=Europe/Dublin` | CC BY 4.0. "Weather data by Open-Meteo.com". "Flood forecasts from GloFAS, Copernicus EMS". Free API is non-commercial, 10,000 calls a day. | `daily.time`, `daily.river_discharge` (m³/s), returned `latitude`/`longitude` (the cell used) |
| 2 | River flow history 2016–2025 | Same API, same cells (GloFAS v4 reanalysis) | Same endpoint, `start_date=2016-01-01&end_date=2025-12-31` | As above | `daily.river_discharge` |
| 3 | Measured flow (right-river check only) | Office of Public Works, hydro-data | `waterlevel.ie/hydro-data/data/internet/stations/0/{station}/Q/year.json`; list at `…/stations/stations.json` | PSI Directive re-use, Irish Open Data licence (CC BY 4.0). "Contains data from the OPW, waterlevel.ie". Provisional data. | `WEB.Day.Mean` series; `station_no`, `CATCHMENT_SIZE`, `WTO_OBJECT` (river) |
| 4 | National weather warnings | Met Éireann | `www.met.ie/Open_Data/json/warning_IRELAND.json` (backup: `warningsxml/rss.xml` → CAP files) | data.gov.ie: Met Éireann Custom Open Data Licence. Met Éireann: CC BY 4.0, "Copyright Met Éireann. Source met.ie"; headlines shown unaltered. | `type`, `level`, `onset`, `expiry`, `headline`, `regions` |
| 5 | Town locations | GeoNames via Open-Meteo Geocoding | `geocoding-api.open-meteo.com/v1/search?name={town}` | CC BY 4.0 | `latitude`, `longitude`, `admin1`, `id` |
| 6 | Team Sheet | Our team | Google Sheet, tab `Towns`, read live through the Apps Script | Internal | All 11 columns |
| 7 | Exchange rate (cost panel) | European Central Bank | `ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, fallback `api.frankfurter.dev` | "Source: ECB" | USD rate and date |

| Could a better source be used? | Finding |
|---|---|
| EFAS (1.5 km, finer than GloFAS's 5 km) | Copernicus catalogue: "The real-time data is only available to EFAS partners"; the public gets it "with a 30-day delay". No use for tonight. |
| OPW | Measured levels and flows, but no public forecast. |
| Conclusion | GloFAS through Open-Meteo is the only free daily public flow forecast I found for these points. Its 5 km grid is why section 1.2 checks every cell. |

## 1.2 Coordinates and the right-river check

| Step | Method |
|---|---|
| Town | GeoNames search, Irish result, province checked |
| Gauge | OPW list of 571 stations, filtered by river name; nearest daily-flow gauge on the town's named river covering 2016–2025 |
| Model cell | Open-Meteo warns that "the closest river might not be selected correctly". So I tested the 3×3 block of 0.05° cells around each gauge (`find_cells.py`, `check_candidates.py`) and kept the cell on the main river, within about 6 km, with the right size of flow |

| Town | County | River | Town lat, lon | GloFAS cell | OPW gauge (catchment) | Gauge mean | Model mean, same days | Ratio | Daily correlation | Days |
|---|---|---|---|---|---|---|---|---|---|---|
| Clonmel | Tipperary | Suir | 52.3550, −7.7039 | 52.375, −7.675 | 16011 Clonmel (2,144 km²) | 51.2 | 33.6 | 0.66 | 0.84 | 3,522 |
| Fermoy | Cork | Blackwater | 52.1358, −8.2758 | 52.125, −8.325 | 18107 Fermoy Br (1,750 km²) | 46.9 | 24.7 | 0.53 | 0.79 | 3,579 |
| Mallow | Cork | Blackwater | 52.1333, −8.6333 | 52.125, −8.625 | 18055 Mallow Rly Br (1,178 km²) | 35.0 | 18.5 | 0.53 | 0.74 | 3,647 |
| Bandon | Cork | Bandon | 51.7469, −8.7425 | 51.775, −8.725 | 20002 Curranure (431 km²) | 18.0 | 8.4 | 0.47 | 0.76 | 3,354 |
| Enniscorthy | Wexford | Slaney | 52.5008, −6.5578 | 52.525, −6.575 | 12001 Scarawalsh (1,036 km²) | 23.9 | 13.5 | 0.56 | 0.80 | 3,614 |
| Ennis | Clare | Fergus | 52.8436, −8.9864 | 52.825, −9.025 | 27002 Ballycorey (562 km²) | 12.1 | 13.1 | 1.08 | 0.83 | 3,641 |
| Athlone | Westmeath | Shannon | 53.4228, −7.9372 | 53.425, −7.975 | 26027 Athlone (4,601 km²) | 104.3 | 76.8 | 0.74 | 0.84 | 3,516 |
| Carrick-on-Shannon | Leitrim | Shannon | 53.9469, −8.0900 | 53.925, −8.075 | 26085 Jamestown (1,379 km²) | 69.5 | 44.6 | 0.64 | 0.59 | 987 |

| Evidence | What it shows |
|---|---|
| Flow sizes rank the same in gauges and model | Shannon at Athlone largest; Fergus and Bandon smallest. A wrong side-stream cell carries 1–4 m³/s. |
| Ennis | The cell nearest the town centre carries 3.4 m³/s against 15.4 measured on the Fergus: a side stream, rejected. |
| Carrick | Bellantra Br gauge nearby is on the Black River (97 km², 1.8 m³/s), so not used. |
| Fermoy | Gauges: Fermoy = 1.34 × Mallow. Upstream cell 1.33× (chosen); downstream cell 1.73×, which matches the gauge further down after a tributary. |
| Timing | Daily correlation 0.74–0.84 on seven rivers. |
| Weak point | Carrick 0.59 (Jamestown record only from 2019; lakes smooth the flow). Kept, flagged as lower confidence. |
| Model reads low (0.5–0.75 of gauge) | Forecasts are compared only with percentiles from the same model cell, so the bias cancels. |

## 1.3 History summary (stored once)

1 Jan 2016 to 31 Dec 2025: 3,653 days per town, none missing. `build_history.py` ran once and stored `data/history_summary.json`, the eight rows below. The page reads only these rows and never sends daily history to the model. Percentiles use the same method as `PERCENTILE.INC`.

| Town | Mean | Median | P95 (Standby) | P99 (Barriers) | Max |
|---|---|---|---|---|---|
| Clonmel | 33.1 | 25.3 | 77.7 | 127.7 | 291.4 |
| Fermoy | 24.7 | 18.7 | 58.8 | 95.2 | 228.1 |
| Mallow | 18.5 | 14.0 | 44.6 | 71.3 | 207.4 |
| Bandon | 8.2 | 5.5 | 22.0 | 38.7 | 99.7 |
| Enniscorthy | 13.5 | 10.7 | 29.9 | 52.4 | 124.0 |
| Ennis | 13.1 | 10.0 | 31.1 | 45.4 | 65.2 |
| Athlone | 76.2 | 67.1 | 142.4 | 186.7 | 254.3 |
| Carrick-on-Shannon | 27.4 | 21.9 | 62.2 | 88.8 | 133.6 |

## 1.4 Warnings: county names and matching

| Item | Detail |
|---|---|
| How Met Éireann names counties | Not by name: `regions` holds FIPS codes (Met Éireann *Warnings rss feed description*, June 2020). Example: "…for Cork, Kerry, Waterford" carries `["EI11","EI27","EI04"]`. CAP files call the same codes `EMMA_ID`; sea areas (EI805–EI825) are ignored. |
| Plan counties | Tipperary EI26 · Cork EI04 · Wexford EI30 · Clare EI03 · Westmeath EI29 · Leitrim EI14 · Roscommon EI24 (second county for Athlone and Carrick, read from "Town spans … and Roscommon" in `notes`) |
| Rule in code | Keep warnings whose `type` contains "rain", whose `regions` include a town code, and that are in force in the next 48 h (`onset < now + 48 h`, `expiry > now`). Orange or red raises one level; yellow is shown only. |
| Checks | Example file mappings confirmed. "Rain and Low Temperature" arrives as two items, so the type filter is safe. Per-county files now return 404, so the code reads the all-Ireland file. Live file on 26 Nov: empty. |

## 1.5 The AI brain and the key

| Item | Detail |
|---|---|
| Provider, model, tier | Anthropic Claude API, **Claude Haiku 5.5**, standard pay-as-you-go, prepaid credit. Effort `low`; `max_tokens` 40,000 (raised in Task 3; thinking counts towards it). |
| Price (pricing page checked 26 Nov 2026) | $0.10 in / $0.50 out per million tokens; cache reads $0.01. At ECB €1 = $1.0975 that is €0.091 / €0.456. |
| Price per answer | Estimated €0.0008 (about 4,000 tokens in, 1,000 out). **Measured in Task 3: €0.0011 average.** |
| Why this level | Code computes every number and level; the model only explains a small finished table in plain English. A small, fast model is enough. Sonnet 5.5 (about 20× the price) is the fallback if it misreads. |
| Where the key lives | Script Properties of a **standalone** Google Apps Script web app (not bound to the Sheet, so Sheet editors cannot see it). Never in the page, the repo or the Sheet. |
| What caps a leak | Prepaid credit with **auto-reload off**: spending stops at the funded balance. The script fixes the model and token limit, throttles to 20 requests a minute, and Google caps it at 20,000 calls a day. |

## 1.6 Picture and five lines

Diagram: `docs/architecture.svg`

| Part | Role |
|---|---|
| Who asks | The Duty Officer (tonight's plan) and the Area Manager (study town); a person decides |
| The page | GitHub Pages; code applies the Flood Plan and shows each number's source |
| The Sheet | Read live through the Apps Script at every question |
| Sources | Open-Meteo/GloFAS forecast; stored 2016–2025 summary; Met Éireann warnings; OPW gauges for the check only |
| Brain and key | Claude Haiku 5.5 through the Apps Script; key in Script Properties |

## 1.7 Assumptions

| Where the brief could be read two ways | My choice and why |
|---|---|
| "Real river flow history" | GloFAS reanalysis for the same cell as the forecast, so forecast and thresholds share the model's bias. OPW gauges are used to check each cell is on the right river. Gauge percentiles would differ from the marker's if they used gauges. |
| Period | 2016–2025, the brief's example period |
| Notes column | Code applies the patterns it can read: second county, barrier set unavailable, crew limits. Any other note is flagged for the Duty Officer, not guessed at. |
| "Today" | Irish date (`timezone=Europe/Dublin`) |
