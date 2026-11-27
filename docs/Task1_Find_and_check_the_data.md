# River Watch – Task 1: Find and check the data

All sources were checked and downloaded on **26 November 2026**. Every script that produced a number here is in `scripts/`, and every output file is in `data/`.

---

## 1. Sources

| # | Source | Publisher | Address | Licence / attribution line | Fields used |
|---|---|---|---|---|---|
| 1 | **River flow forecast** | Open-Meteo, serving GloFAS v4 from the Copernicus Emergency Management Service (ECMWF) | `https://flood-api.open-meteo.com/v1/flood?latitude=…&longitude=…&daily=river_discharge&forecast_days=3&timezone=Europe/Dublin` | Open-Meteo API data: CC BY 4.0. Attribution: "Weather data by Open-Meteo.com" (with link). Underlying data: "Flood forecasts from the Global Flood Awareness System (GloFAS), Copernicus Emergency Management Service". | `daily.time`, `daily.river_discharge` (m³/s), and the returned `latitude`/`longitude` (the grid cell actually used) |
| 2 | **River flow history, 2016–2025** | Same API and same grid cells, GloFAS v4 reanalysis/consolidated record | Same endpoint with `start_date=2016-01-01&end_date=2025-12-31` | As above | `daily.river_discharge` |
| 3 | **Measured river flow** (for the right-river check only) | Office of Public Works (OPW), hydro-data | `https://waterlevel.ie/hydro-data/data/internet/stations/0/{station_no}/Q/year.json`; station list at `…/data/internet/stations/stations.json` | Re-use under the PSI Directive 2003/98/EC and the Irish Open Data licence (DPER Circular 12/2016, CC BY 4.0). Attribution: "Contains data from the Office of Public Works, waterlevel.ie". OPW states the data is provisional and unvalidated. | Series `WEB.Day.Mean`: timestamp, value (m³/s), quality code. Station metadata: `station_no`, `station_name`, `CATCHMENT_SIZE`, `WTO_OBJECT` (river) |
| 4 | **National weather warnings** | Met Éireann | `https://www.met.ie/Open_Data/json/warning_IRELAND.json` (all valid warnings). Backup: RSS `https://www.met.ie/warningsxml/rss.xml` linking to CAP files on `cap.met.ie` | data.gov.ie lists the dataset under the "Met Éireann Custom Open Data Licence". Met Éireann's warning description says the warnings are open data under CC 4.0 and that the headline and description must not be altered. Attribution: "Copyright Met Éireann. Source met.ie. This data is published under a Creative Commons Attribution 4.0 International (CC BY 4.0)." River Watch shows the headline word for word. | `type` (Rain, Wind…), `level` (yellow/orange/red), `onset`, `expiry`, `headline`, `regions` (county codes) |
| 5 | **Town locations** | GeoNames, via the Open-Meteo Geocoding API | `https://geocoding-api.open-meteo.com/v1/search?name={town}` | GeoNames: CC BY 4.0 | `latitude`, `longitude`, `admin1`, GeoNames `id` (filtered to `country_code = IE`) |
| 6 | **Team Sheet** | Our team | Google Sheet "River Watch Team Sheet", tab `Towns`, read live by the Apps Script (snapshot: `River Watch Team Sheet - Towns.csv`) | Internal | All 11 columns |
| 7 | **Exchange rate** (cost panel) | European Central Bank | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`; fallback `https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR` | ECB: free re-use with source acknowledged ("Source: ECB"). Frankfurter: open source, ECB data | USD rate and its date |

Open-Meteo and Met Éireann send `Access-Control-Allow-Origin: *`, so the page reads them directly from the browser. The only server is a Google Apps Script web app (section 5). It holds the AI key, reads the private Team Sheet, and fetches the ECB exchange rate.

**Could a better source have been used?**

- **Forecast:** the obvious upgrade is EFAS, the European Flood Awareness System, which runs at about 1.5 km instead of GloFAS's 5 km. But its catalogue entry on the Copernicus EWDS (`efas-forecast`) says: "The real-time data is only available to EFAS partners". The public gets forecasts only "with a 30-day delay", which is useless for tonight's decision.
- **OPW:** it publishes measured levels and flows but no public flow forecast.
- **Conclusion:** GloFAS through Open-Meteo is the only free, public, daily river-flow forecast for these points that I could find. Its known weakness at a 5 km grid is the reason for the check in section 2.

---

## 2. Coordinates and the right-river check

### How I found them

1. **Town:** I geocoded each name with GeoNames, kept the Irish result, and checked that the province (`admin1`) made sense.
2. **Gauge:** I took the OPW station list (571 stations), filtered it on catchment and river name (`WTO_OBJECT`), and picked the nearest station on the town's named river that has a daily flow (Q) series covering 2016–2025.
3. **Forecast cell:** GloFAS works on a 0.05° (about 5 km) grid, and Open-Meteo warns that "the closest river might not be selected correctly". So I did not just use the town's coordinates. I queried the 3×3 block of cells around each gauge (`scripts/find_cells.py`), compared each cell's 2020 mean flow with the gauge's measured 2020 mean (`scripts/check_candidates.py`), and kept the cell that is on the main river, within about 6 km of the town, and the right size for its place on the river.

### Coordinates used

| Town | County | River | Town lat, lon (GeoNames id) | GloFAS cell used | OPW gauge used for the check |
|---|---|---|---|---|---|
| Clonmel | Tipperary | Suir | 52.3550, −7.7039 (2965353) | **52.375, −7.675** | 16011 Clonmel (Suir, 2,144 km²) |
| Fermoy | Cork | Blackwater | 52.1358, −8.2758 (2964320) | **52.125, −8.325** | 18107 Fermoy Br D/S (Blackwater, 1,750 km²) |
| Mallow | Cork | Blackwater | 52.1333, −8.6333 (2962714) | **52.125, −8.625** | 18055 Mallow Railway Br (Blackwater, 1,178 km²) |
| Bandon | Cork | Bandon | 51.7469, −8.7425 (2966370) | **51.775, −8.725** | 20002 Curranure (Bandon, 431 km²) |
| Enniscorthy | Wexford | Slaney | 52.5008, −6.5578 (2964403) | **52.525, −6.575** | 12001 Scarawalsh (Slaney, 1,036 km²) |
| Ennis | Clare | Fergus | 52.8436, −8.9864 (2964405) | **52.825, −9.025** | 27002 Ballycorey (Fergus, 562 km²) |
| Athlone | Westmeath | Shannon | 53.4228, −7.9372 (3313472) | **53.425, −7.975** | 26027 Athlone (Shannon, 4,601 km²) |
| Carrick-on-Shannon | Leitrim | Shannon | 53.9469, −8.0900 (2965727) | **53.925, −8.075** | 26085 Jamestown (Shannon, 1,379 km²), about 5 km downstream |

### Proof that each flow belongs to the named river

Measured gauge flow and model flow for the same days in 2016–2025 (`data/history_summary.csv`):

| Town | Gauge mean (m³/s) | GloFAS mean, same days | Ratio | Daily correlation | Days compared |
|---|---|---|---|---|---|
| Clonmel | 51.2 | 33.6 | 0.66 | 0.84 | 3,522 |
| Fermoy | 46.9 | 24.7 | 0.53 | 0.79 | 3,579 |
| Mallow | 35.0 | 18.5 | 0.53 | 0.74 | 3,647 |
| Bandon | 18.0 | 8.4 | 0.47 | 0.76 | 3,354 |
| Enniscorthy | 23.9 | 13.5 | 0.56 | 0.80 | 3,614 |
| Ennis | 12.1 | 13.1 | 1.08 | 0.83 | 3,641 |
| Athlone | 104.3 | 76.8 | 0.74 | 0.84 | 3,516 |
| Carrick-on-Shannon | 69.5 | 44.6 | 0.64 | 0.59 | 987 |

**What this shows:**

- **Size ranks match.** The Shannon at Athlone is the biggest flow and the Fergus and Bandon are the smallest, both in the gauges and in the model. A cell on a wrong, small stream would show a mean of 1–4 m³/s.
- **The wrong-river trap is real.** For Ennis, the cell nearest the town centre (52.825, −8.975) carries only 3.4 m³/s against 15.4 measured on the Fergus. It is a side stream in the model, so I rejected it. For Bellantra Br (26009), a gauge near Carrick, the catchment is the Black River, not the Shannon (97 km², mean 1.8 m³/s), so I did not use it.
- **Position on the river checks out (Fermoy).** Measured flow at Fermoy is 1.34× Mallow's. The cell upstream of Fermoy gives 1.33× Mallow in the model. The cell downstream gives 1.73×, which matches Ballyduff further down after the next tributary joins. That is why Fermoy uses 52.125, −8.325.
- **Timing matches.** Daily correlation is 0.74–0.84 on seven rivers: the model rises and falls on the same days as the gauge.
- **Carrick is the weak one.** Correlation is 0.59 over only 987 days, because Jamestown's record starts in 2019 and has gaps, and Lough Allen and the lakes smooth the upper Shannon. The size is right, so I kept the cell but flag it as lower confidence.
- **The model reads low, and that's handled.** GloFAS runs at about 0.5–0.75 of measured flow on these rivers. River Watch never compares a model forecast with a gauge threshold. It compares a model forecast with model percentiles from the same cell, so the bias cancels out. Comparing against gauge thresholds would leave every town on Normal almost always.

---

## 3. History: period and stored summary

- **Period:** 1 January 2016 to 31 December 2025, which is 10 full years and 3,653 days per town. No days are missing in the GloFAS record.
- **Method:** `scripts/build_history.py` runs **once**. It saves the raw download (`data/raw/glofas/`), the daily table (`data/history_daily.csv`, kept so the Task 8 event count never needs another download), and the summary below (`data/history_summary.json`).
- **What the page uses:** it reads only the eight-row summary. It never sends years of daily values to the model.
- **Percentiles:** linear interpolation, the same method as Excel `PERCENTILE.INC` and numpy's default.

**Summary used by the tool (m³/s, GloFAS cell, 2016–2025):**

| Town | Cell | Mean | Median | **P95 (Standby)** | **P99 (Barriers)** | Max |
|---|---|---|---|---|---|---|
| Clonmel | 52.375, −7.675 | 33.1 | 25.3 | **77.7** | **127.7** | 291.4 |
| Fermoy | 52.125, −8.325 | 24.7 | 18.7 | **58.8** | **95.2** | 228.1 |
| Mallow | 52.125, −8.625 | 18.5 | 14.0 | **44.6** | **71.3** | 207.4 |
| Bandon | 51.775, −8.725 | 8.2 | 5.5 | **22.0** | **38.7** | 99.7 |
| Enniscorthy | 52.525, −6.575 | 13.5 | 10.7 | **29.9** | **52.4** | 124.0 |
| Ennis | 52.825, −9.025 | 13.1 | 10.0 | **31.1** | **45.4** | 65.2 |
| Athlone | 53.425, −7.975 | 76.2 | 67.1 | **142.4** | **186.7** | 254.3 |
| Carrick-on-Shannon | 53.925, −8.075 | 27.4 | 21.9 | **62.2** | **88.8** | 133.6 |

**Smoke test on today's live forecast (26–28 Nov 2026):** every town is Normal. The closest is Ennis, with a peak of 23.3 against a P95 of 31.1.

**Note on "today":** the forecast call must set `timezone=Europe/Dublin`. Otherwise the API's days run on GMT, which is the same in winter but an hour off in summer.

---

## 4. Warnings: how counties are named and matched

- **What Met Éireann provides:** counties are not named in words. Each warning carries a `regions` array of **FIPS county codes**, documented in Met Éireann's *Description of Met Éireann Warnings rss feed* (June 2020), for example `"regions": ["EI11","EI27","EI04"]` for a warning headed "…for Cork, Kerry, Waterford".
- **CAP file wording:** the live CAP files label the same codes `EMMA_ID`. Sea areas use the separate range `EI805`–`EI825`, and River Watch ignores them.
- **Lookup table:** River Watch stores the full table in `data/county_codes.json`, copied from that document. The counties the plan needs:

| Flood Plan county | Code | Towns |
|---|---|---|
| Tipperary | EI26 | Clonmel |
| Cork | EI04 | Fermoy, Mallow, Bandon |
| Wexford | EI30 | Enniscorthy |
| Clare | EI03 | Ennis |
| Westmeath | EI29 | Athlone |
| Leitrim | EI14 | Carrick-on-Shannon |
| Roscommon | EI24 | Athlone and Carrick-on-Shannon (second county, read from the `notes` column: "Town spans … and Roscommon") |

**Matching rule in code (Flood Plan rule 4):**

1. Look up each town's codes from `county`, plus any county named after "spans … and" in `notes`.
2. Keep warnings where `type` contains "rain" (case-insensitive), `regions` includes one of the town's codes, and the warning is in force at any time in the next 48 hours: `onset < now + 48 h` and `expiry > now`.
3. If any kept warning is `orange` or `red`, raise the town one level. Yellow is listed but changes nothing.
4. Wind, fog and other non-rain types are ignored, because the plan says *rain* warning.

**Checks and limits:**

- Met Éireann's example file confirms the mapping. A warning headed "Donegal, Leitrim, Mayo, Sligo" carries EI14, EI20, EI25 and EI06. One headed "Cork, Kerry, Waterford" carries EI11, EI27 and EI04.
- One combined warning ("Rain and Low Temperature") arrives as **two** items, one per type, so filtering on `type` is safe.
- At 23:25 UTC on 26 Nov 2026 the live file was empty (`[]`).
- The per-county files the 2020 document describes (`warning_EI16.json`) now return 404, so the tool reads `warning_IRELAND.json` and filters it.

---

## 5. The AI brain

| Item | Choice |
|---|---|
| Provider | Anthropic, Claude API (direct, first-party) |
| Model | **Claude Haiku 5.5** (`claude-haiku-5-5`), effort `low`, `max_tokens` 1,500 |
| Tier | Standard pay-as-you-go on the Start usage tier, prepaid credits. No Batch or Priority tier. |
| Price (pricing page checked 26 Nov 2026, https://platform.claude.com/docs/en/about-claude/pricing) | Anthropic bills in US dollars: $0.10 per million input tokens and $0.50 per million output tokens (prompts under 100k tokens); cached input $0.01/MTok. **In euro: €0.091 in / €0.456 out / €0.009 cached per million tokens.** |
| Exchange rate | ECB euro reference rate for 26 Nov 2026: **€1 = $1.0975**, so $1 = €0.9112 (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml). Live in the tool: the Apps Script reads the ECB daily file each run, because ECB sends no CORS header and a browser cannot read it directly. If that fails, the page falls back to `api.frankfurter.dev` (ECB-based, CORS-enabled) and shows the rate date next to every euro figure. |
| Price per answer | About 4,000 input tokens (Flood Plan + today's computed table + question) and about 1,000 output tokens: $0.0009, which is **about €0.0008 (0.08 cent)**. 30 afternoon briefings plus about 300 questions a month comes to **about €0.27/month**. For comparison, Claude Sonnet 5.5 ($2/$10 = €1.82/€9.11 per MTok) would be about €0.016 per answer (about €5.50/month). |

**Why this level fits the job:**

- Every number and every level is worked out in plain code from the Flood Plan rules, which can be tested and repeated. The model never does the arithmetic.
- Its job is reading a small, finished table and explaining it, or answering a question about it, in plain English. A small, fast model is enough for that and costs about a tenth of a cent.
- If testing in a later task shows Haiku misreading the table, the fallback is Sonnet 5.5. That costs about 20× more but is still about $6 a month.

**Where the key lives:**

- The Anthropic API key is stored only in a **Google Apps Script project's Script Properties** (`PropertiesService.getScriptProperties()`, key name `ANTHROPIC_API_KEY`).
- The script is deployed as a web app ("Execute as: me", "Who has access: anyone"). The browser sends the question to the web app, and the script adds the key server-side with `UrlFetchApp`.
- The key is never in the page, the GitHub repo or the Sheet.
- **The script must be standalone, not bound to the Team Sheet.** Anyone who can edit a bound Sheet can open its script editor and read Script Properties. The standalone script is shared with nobody and reads the Sheet by its ID.
- The same script also returns the Towns rows as JSON. That means the live tool needs no "Publish to web" link, and the Sheet can stay private.
- The CSV saved in `river-watch/` is a snapshot for the record, not what the tool reads live.

**What stops a leak from costing more than I funded:**

- **Hard money cap:**
  - the key sits in its own Console workspace, "river-watch", with a monthly spend limit of **$5 (about €4.56)**;
  - the account holds only **$5 of prepaid credit** with auto-reload **off**.
  - Over the limit, the API returns HTTP 400 "You have reached your specified workspace API usage limits" and stops. The most a stolen key, or a flood of requests to the web app, can cost is about €4.56.
- **Script guards that slow misuse before that:**
  - the model and `max_tokens` are fixed in the script;
  - questions are capped in length;
  - `CacheService` throttles requests per minute;
  - Google's consumer quota stops `UrlFetchApp` at 20,000 calls a day.
  - Apps Script cannot read the request's `Origin` header, so it cannot reject other websites. The spend limit is the real cap.

---

## 6. Picture and five lines

Diagram: `docs/architecture.svg`

1. **Who asks:** Aoife (Duty Officer) opens the River Watch link each afternoon. The Area Manager uses the same link for the study question. The person decides, and River Watch only recommends.
2. **The page** (GitHub Pages) works out every number in the browser and shows where each came from. It reads the stored 2016–2025 summary (`history_summary.json`), the **team Google Sheet** (via the Apps Script: kit, crews, notes, overrides) and the **Open-Meteo/GloFAS** forecast for eight checked grid cells.
3. **Warnings** come straight from **Met Éireann's** `warning_IRELAND.json`. County codes (EI04 = Cork …) are matched to the plan's counties, plus Roscommon from the notes.
4. **OPW gauges** were used once, offline, to prove each cell sits on the town's named river. They are not called at run time.
5. **The brain** is Claude Haiku 5.5, reached only through a standalone **Google Apps Script** web app that keeps the **key** in Script Properties. A $5 (about €4.56) workspace spend limit and $5 of prepaid credit cap any leak.
