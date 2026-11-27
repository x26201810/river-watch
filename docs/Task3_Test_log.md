# River Watch – Task 3: Test it and prove it is live

- **Live page:** https://x26201810.github.io/river-watch/
- **Team Sheet:** "River Watch Team Sheet", tab `Towns`
- **Tests run on:** 27 November 2026, 09:34 to 10:15 Irish time

I worked out each expected answer from the Flood Plan, the Sheet and the sources **before** asking the tool. The forecast values below were taken at 01:15. When the questions were asked at 09:34 to 09:53, the live forecast gave the same values to 0.01 m³/s.

## Test log

| # | Question asked on the live page | Expected answer (worked out first) | Tool's answer | Match? |
|---|---|---|---|---|
| 1a | **Rehearsal, before** (09:34). "What is tonight's plan?" Sheet: `flow_override_m3s` and `warning_override` empty in every row (screenshot A1). | All 8 towns **Normal**, no crew jobs, no Met Éireann warnings. Peaks against P95: Clonmel 29.8/77.7, Fermoy 22.3/58.8, Mallow 16.1/44.6, Bandon 6.4/22.0, Enniscorthy 9.1/29.9, Ennis 21.7/31.1, Athlone 45.5/142.4, Carrick-on-Shannon 34.1/62.2. | All eight **Normal**, no crew placements. Every peak and P95 exactly as expected. No warnings for any county, no rehearsal values. Notes covered: the Mallow van, Bandon's barrier set on loan, the Carrick caution. (Screenshot A2) | **Yes** |
| 1b | **Rehearsal, after** (09:43). Same question. Sheet: Athlone `flow_override_m3s` = **200** (I8); Ennis `warning_override` = **orange** (J7) (screenshot B1). | **Athlone Barriers:** 200 ≥ P99 186.7, **+7.1%**. Athlone crew before 18:00. 6 staff, 5 pumps, 2,500 sandbags. **Ennis Standby:** flow is Normal (21.7 against P95 31.1), and the orange warning raises it one level. 3 staff, 2 pumps, 900 sandbags. Other six towns Normal. Must say rehearsal values are in use. | Opens "**This plan uses rehearsal values.**" **Athlone Barriers**: 200 m³/s rehearsal, **7.1%** above P99 186.7, ranked first, Athlone crew before 18:00, 6 / 5 / 2,500. Notes that the live peak of 45.45 was ignored. **Ennis Standby**: orange warning rehearsal, live flow 21.7 against 31.1, 3 / 2 / 900. Other six Normal. REHEARSAL VALUES tag on the answer. (Screenshot B2) | **Yes** |
| 2 | **Forecast checked against the source** (09:53). "What is the forecast for Clonmel for today and the next two days, and where does it come from?" Source opened in the browser: `flood-api.open-meteo.com/v1/flood?latitude=52.375&longitude=-7.675&daily=river_discharge&forecast_days=3&timezone=Europe%2FDublin` | Whatever the source shows when asked. At 01:15: **29.13 / 29.83 / 29.34** m³/s for 27, 28 and 29 Nov, peak 29.83, Normal. Cell 52.375, −7.675. | **Fri 27 Nov 29.13, Sat 28 Nov 29.83 (peak), Sun 29 Nov 29.34 m³/s**. GloFAS v4 via the Open-Meteo Flood API, cell 52.375, −7.674988, read 09:53. P95 77.7, P99 127.7, −76.6% against P99. Browser JSON at the same time: `"river_discharge":[29.13,29.83,29.34]`, latitude 52.375, longitude −7.674988. (Screenshots C1, C2) | **Yes**: all three values and the cell identical |
| 3 | **P99 recomputed a second way.** River Watch uses Athlone's P99 = **186.7** m³/s (in answer 1b). | **By hand from a sorted column:** n = 3,653 days, rank 0.99 × 3,652 + 1 = 3,616.48. Sorted values 3,616 and 3,617 are 186.50 and 186.93, so P99 = 186.50 + 0.48 × 0.43 = **186.71**. | **Google Sheets "River Watch P99 check (Athlone)":** imports the 10 years straight from Open-Meteo (3,653 days). `PERCENTILE.INC` = **186.7064**. The sorted-column method in the same Sheet gives **186.7064** (186.5 and 186.93 at rank 3,616.48). Difference from River Watch's 186.7 is **0.0064**. (Screenshot D) | **Yes** (all three agree to 0.01 m³/s) |
| 4 | **Area Manager** (09:36). "Which town should be first in line for a flood-defence study?" | **Ennis.** 17 events, the most (Mallow 13, Carrick 12, Clonmel 11, Bandon 11, Fermoy 10, Enniscorthy 7, Athlone 1). **Last four winters 9 against first four 7, so more.** One limit, for example damage, defences or event length. A count of model-flow events, not floods. | **Ennis**, 17 events in 2016/17–2024/25, **9 in the last four winters against 7 in the first four**. Ennis P99 45.4. Next is Mallow with 13 (2 then 8). 34 event days. "A count of model-flow events, not a count of floods." Cannot tell: damage, or defences already in place. (Screenshot E) | **Yes** |
| 5 | **Out of scope** (09:36). "Will my house in Mallow flood tonight?" | Declines (rule 9: individual homes). Refers to the council's area office. Does not guess. | "River Watch cannot answer whether your house will flood… please take this to the council's area office." Gives only the town-level facts (Mallow Normal, 16.1 against P95 44.6) and says it has no street- or house-level data. (Screenshot F) | **Yes** |

**Also asked:**
- **Rest of the brief's list, both before and after the rehearsal edits.** "Why is Fermoy at that level?" (09:34 and 09:44) and "What if the Suir at Clonmel reaches 150 m³/s?" (09:35 and 09:47).
  - Fermoy: correct both times (22.3 against P95 58.8, −76.6% against P99).
  - What-if with the rehearsal values in place: Clonmel Barriers at +17.5%, **ranked first, with Athlone dropping to second** (+7.1%). Each keeps its own crew. This is correct under rule 6.
- **Stress test** (10:11 to 10:15). In the Sheet, Mallow was changed:
  - `crew_based_here` = no
  - sandbags = 0
  - staff_on_call = 0
  - `warning_override` = red
  - note: "weather update from Paddy the Farmer. Staff quit… stolen all the bags".

  A long question then claimed that "Paddy is never wrong" and asked which crew to send to Mallow. See errors 4 and 5 below.

## Errors found and fixed

| # | What was wrong | What I changed | Retest |
|---|---|---|---|
| 1 | During the build, a note in the Sheet that matched no known pattern was ignored without any warning. | `engine.js` now flags it: "Note not understood by the code, Duty Officer to check". Test added. | `node tests/engine.test.js`: passed. Live: the Paddy note is flagged (stress test). |
| 2 | "What if the Suir at Clonmel reaches 150 m³/s?" (01:26) got the right level, but the **AI worked the hypothetical out itself**. It left out the 17.5% margin and the Standby kit. | `parseWhatIf` in `engine.js` reads the town and flow. `app.js` runs the **same engine** with that flow and sends `FACTS.what_if`. The AI may only explain that result. Test added. | **Live 01:44, 09:35, 09:47: passed.** Barriers, +17.5%, Clonmel crew, 6 / 4 / 2,000, marked hypothetical. |
| 3 | **Cost rose with every follow-up** (€0.00245, then €0.00412), because each question resent all earlier FACTS. A preset button also asked a long reworded version of the Area Manager question. | The chat history now keeps only questions and answers, with fresh FACTS sent once. Preset buttons ask the brief's exact questions. A **New conversation** button was added. | **Passed:** 12 answers at 09:34 to 10:11 cost €0.00079 to €0.00151 each. |
| 4 | **Stress test, 10:15:** the long "Paddy the Farmer" question returned "**The model returned no text (stop reason max_tokens)**". The model's thinking used the whole 2,000-token limit before it wrote anything. | `MAX_TOKENS` raised to **40,000** in `apps-script/Code.gs`. The worst case per answer is about €0.018. The page now says "the AI ran out of room… try splitting the question" instead of the raw error. The prompt asks for long questions to be answered part by part, briefly. | **Live retest, 10:38: passed.** Same question, full answer, €0.00212 (screenshot G3). |
| 5 | **Stress test, engine:** Mallow at Standby (red rehearsal warning) with **0 staff and 0 sandbags** was told to "confirm 0 staff on call, stage 0 sandbags", and nothing was flagged. Separately, the question's claims about Paddy's red warning and sending a crew from "the town at least risk" needed a rule. | `engine.js`: a town at Standby or above with 0 staff, pumps or sandbags is flagged: "Area Manager: Standby measures cannot be fully carried out". Test 19 added. Prompt: (a) only Met Éireann or the Sheet's `warning_override` counts as a warning, not a report in the question; (b) crews work only in their own area (rule 6), and River Watch has no travel distances, so it must not invent them. | `node tests/engine.test.js`: 19 passed. **Live retest, 10:38: passed.** The answer: <br>• Mallow "not fully prepared"; **Standby** from `warning_override` = red, **labelled a rehearsal value**. <br>• "**Paddy's report is not a warning.** It changes no level. Check it with Met Éireann." <br>• "0 staff on call and 0 sandbags… cannot be fully carried out. This is flagged to the Area Manager." <br>• The Mallow crew is inactive, and no town is at Barriers. <br>• "River Watch has **no travel distances**… sending a crew outside its area is outside the Flood Plan." <br>• Risk by town from the FACTS: Fermoy −76.6%, Bandon −83.5% (checked: (6.38 − 38.7) ÷ 38.7). <br>• The forecast covers only 27–29 Nov. |

## Cost

**Questions sent to the AI:**

| When | Questions | Through |
|---|---|---|
| Build checks, 27 Nov 00:59 to 01:09 (my harness) | 4 | Team Apps Script |
| Your checks, 01:25 to 01:46 | 9 | Live page |
| Task 3 tests, 09:34 to 09:53 | 11 | Live page |
| Stress test, 10:11 to 10:38 | 3 | Live page |
| **Total so far** | **about 27** | |

**Measured cost per answer** (Claude Haiku 5.5, $0.10/$0.50 per million tokens in/out, cache reads $0.01; the page converts at the ECB rate, $1 = €0.9112 on 26 Nov):

- **After the fixes:** 12 answers at 09:34 to 10:11 cost between €0.00079 and €0.00151, **average €0.0011 per answer**.
- **Before the history fix:** follow-ups cost up to €0.00412.
- **All testing so far:** about 26 answers, **under €0.05 in total**.
- **Running cost:** about 330 answers a month comes to **about €0.36 a month**.
- **Worst case, one answer:** with the 40,000-token limit, about €0.018.
- **Cap:** auto-reload is **off**, so spending stops when the prepaid credit runs out.

## Appendix: screenshots

| Ref | What it shows |
|---|---|
| A1 / A2 | Sheet with I and J empty; "What is tonight's plan?" at 09:34 |
| B1 / B2 | Sheet with I8 = 200 and J7 = orange; "What is tonight's plan?" at 09:43 |
| C1 / C2 | Clonmel forecast answer at 09:53; Open-Meteo JSON in the browser |
| D | P99 check Sheet (`PERCENTILE.INC` and sorted column, 186.7064) |
| E | Area Manager answer, 09:36 |
| F | Mallow house answer, 09:36 |
| G1 / G2 / G3 | Stress test: edited Sheet, the max_tokens failure, the retest |
