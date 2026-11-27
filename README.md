# River Watch

Decision support for the flood response team that serves eight Irish towns (NCI CA2, fictional Flood Plan 2026/27).
Each afternoon it says which towns go to **Barriers** or **Standby** tonight and where the three crews go.
It also answers the Area Manager's flood-defence study question. A person makes the final decision.

**Live page:** `https://x26201810.github.io/river-watch/`

## How it works

- **Code computes, the AI explains.**
  - `engine.js` applies the Flood Plan (rules 2 to 8) in plain JavaScript and records every step of its working.
  - `app.js` re-reads the Team Sheet, the forecast and the warnings **at every question**, runs the engine, and sends the computed facts plus the plan to Claude Haiku 5.5.
- **Live sources** (no values typed into the code):
  - Team Google Sheet;
  - Open-Meteo Flood API (GloFAS v4) for 8 grid cells, each checked to sit on the town's named river;
  - Met Éireann `warning_IRELAND.json`;
  - ECB euro rate.
- **Stored once** (built by the scripts in `scripts/`):
  - `data/history_summary.json`: P95 and P99 per town, 2016–2025;
  - `data/events.json`: rule 8 event counts;
  - `data/county_codes.json`: Met Éireann county codes.
- **AI key:** it is in **no file in this repository**.
  - The page reaches the AI only through `apps-script/Code.gs`, a standalone Google Apps Script web app that keeps the key in its Script Properties.
  - Nobody using the page needs a key.
  - The web app URL is in `CONFIG.APPS_SCRIPT_URL` in `app.js`; the URL is not a secret.

## Run the tests

```
node tests/engine.test.js
```

## Rebuild the stored data

```
python3 scripts/build_history.py
python3 scripts/build_events.py
```

`data/raw/` is not committed; the scripts download it again.

Task 1 write-up: `docs/Task1_Find_and_check_the_data.md`.
