# River Watch – Task 3: Test it and prove it is live

- **Live page:** https://x26201810.github.io/river-watch/
- **Team Sheet:** "River Watch Team Sheet", tab `Towns`
- **Tests run on:** 27 November 2026

I worked out each expected answer from the Flood Plan, the Sheet and the sources **before** asking the tool. The expected values below were taken at 01:15 on 27 Nov 2026. The forecast is re-checked at the time each question is asked (see "Time asked").

## Test log

| # | Question asked on the live page | Expected answer (worked out first) | Tool's answer (summary; full text and screenshot in appendix) | Match? |
|---|---|---|---|---|
| 1a | **Rehearsal, before.** "What is tonight's plan? Which towns need barriers, which go on standby, and where do the three crews go?" Sheet: `flow_override_m3s` and `warning_override` empty in every row (screenshot). | All 8 towns **Normal**. No crew jobs. No warnings in force (Met Éireann list empty). Highest peak relative to P95: **Ennis** at 21.65 m³/s against a P95 of 31.1. | _to fill_ | _to fill_ |
| 1b | **Rehearsal, after.** Same question. Sheet: Athlone `flow_override_m3s` = **200** (cell I8); Ennis `warning_override` = **orange** (cell J7) (screenshot). | **Athlone Barriers.** 200 is at or above its P99 of 186.7, which is +7.1%. The Athlone crew erects barriers before 18:00. Standby measures too: 6 staff, 5 pumps, 2,500 sandbags. **Ennis Standby.** Its flow alone is Normal (21.65 against a P95 of 31.1), but the orange warning raises it one level (rule 4/5): 3 staff, 2 pumps, 900 sandbags. Every other town Normal. Clonmel and Mallow crews have no jobs. The answer **must say that rehearsal values are in use**. | _to fill_ | _to fill_ |
| 2 | **Forecast checked against the source.** "What is the forecast river flow for Clonmel for today and the next two days, and where does it come from?" Then open the source in the browser: https://flood-api.open-meteo.com/v1/flood?latitude=52.375&longitude=-7.675&daily=river_discharge&forecast_days=3&timezone=Europe%2FDublin | Values from the source opened in the browser at the time of asking. At 01:15 they were 27 Nov **29.13**, 28 Nov **29.83**, 29 Nov **29.34** m³/s; the peak is 29.83, which is Normal (P95 77.7). Source: Open-Meteo Flood API, GloFAS v4, cell 52.375, −7.675. | _to fill_ | _to fill_ |
| 3 | **P99 recomputed a second way.** "What is Athlone's 99th percentile threshold, and how was it worked out?" | **186.7 m³/s**: Athlone's own daily flows, 1 Jan 2016 to 31 Dec 2025, GloFAS cell 53.425, −7.975. **Second way 1 (by hand from a sorted column):** n = 3,653 days. Rank position 0.99 × 3,652 + 1 = 3,616.48. Sorted values at ranks 3,616 and 3,617 are 186.50 and 186.93. 186.50 + 0.48 × 0.43 = **186.71**. **Second way 2 (another tool):** Google Sheets "River Watch P99 check (Athlone)" imports the 10 years straight from Open-Meteo and gives `PERCENTILE.INC` = _to fill_ (screenshot). | _to fill_ | _to fill_ |
| 4 | **Area Manager's question.** "Which town should be first in line for a full flood-defence study?" | **Ennis.** 17 high-flow events, more than any other town: Mallow 13, Carrick-on-Shannon 12, Clonmel 11, Bandon 11, Fermoy 10, Enniscorthy 7, Athlone 1. **Last four winters (2021/22–2024/25): 9 events. First four (2016/17–2019/20): 7. So yes, more.** One thing the count cannot tell, for example damage done, homes at risk or defences already in place. It is also a count of model-flow events, not of floods. | _to fill_ | _to fill_ |
| 5 | **Out of scope.** "Is the N24 closed between Clonmel and Carrick-on-Suir tonight, and should we tell people to avoid it?" | River Watch does **not** cover road closures (Flood Plan rule 9). It should refer the question to the council's area office and **not** guess about the road. | _to fill_ | _to fill_ |

## Errors found and fixed

| What was wrong | What I changed | Retest |
|---|---|---|
| During the build, notes in the Sheet that matched no known pattern were silently ignored. A new note such as "Quay wall repairs this week" would have changed nothing and said nothing. | `engine.js` now flags any note it cannot read: "Note not understood by the code, Duty Officer to check". Test 17 was added in `tests/engine.test.js`. | `node tests/engine.test.js`: 17 tests passed. |
| **"What if the Suir at Clonmel reaches 150 m³/s?"** (27 Nov, 01:26) got the right level (Barriers, Clonmel crew), but the **AI worked out the hypothetical itself**. No code checked it. It also left out the 17.5% margin over P99 and the Standby kit (6 staff, 4 pumps, 2,000 sandbags). | `engine.js` gained `parseWhatIf`: it reads the town (or a river with only one town) and the flow from the question. `app.js` then runs the **same engine** with that flow and sends the result as `FACTS.what_if`. The prompt tells the AI to answer only from `FACTS.what_if` and never to work a what-if out itself. A river with two towns (the Shannon) gets "which town?". Test 18 added. | `node tests/engine.test.js`: 18 passed. Live retest: _to fill_ |
| **Cost rose with every follow-up question** (€0.00128, then €0.00143, €0.00245, €0.00323), because each new question resent every earlier copy of the FACTS. | The chat history now keeps only the earlier questions and answers. Fresh FACTS are read and sent once, with the new question, so old numbers are not repeated either. | Live retest: _cost per answer to fill_ |

## Cost

**Questions sent to the AI while building and testing:**

| When | Questions | Through |
|---|---|---|
| Build check, 27 Nov 00:59 | 2 (tonight's plan; house and insurance, out of scope) | Team Apps Script |
| Rehearsal check, 27 Nov 01:09 | 2 (Clonmel at 150 m³/s; follow-up on river level in metres) | Team Apps Script |
| Your own checks on the site | _to fill_ | Live page |
| Task 3 tests above | 6 (1a, 1b, 2, 3, 4, 5) | Live page |
| **Total** | _to fill_ | |

**Measured cost per answer** (Claude Haiku 5.5: $0.10 per million tokens in, $0.125 for cache writes, $0.01 for cache reads, $0.50 out; ECB rate $1 = €0.9112 on 26 Nov 2026):

- **First answer** (cache written): 2,278 input + 2,186 cache-write + 1,643 output tokens = **$0.0013, about €0.0012**.
- **Later answer** (cache read): 2,281 input + 2,186 cache-read + 546 output tokens = **$0.0005, about €0.0005**.
- **The live page sends a fuller facts table than my build check did,** so its answers run larger. Each answer on the page shows its own cost: _fill from the page, for example "€0.00xx"_.
- **Estimate:** about **€0.001 per answer**. At about 330 answers a month that is **about €0.30–0.40 a month**.
- **Cap:** auto-reload is **off** on the Anthropic account, so spending cannot go past the prepaid credit.

## Appendix: screenshots and full answers

_(paste screenshots: 1a page + Sheet cells, 1b page + Sheet cells, 2 page + Open-Meteo in the browser, 3 page + P99 check Sheet, 4 page, 5 page)_
