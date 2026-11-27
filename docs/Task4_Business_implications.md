# River Watch – Task 4: Business implications

**To:** Area Manager · **From:** Flood response team · **Date:** 27 November 2026

**What changes.**
- **For the team:** River Watch replaces four websites and a spreadsheet with one link that applies the Flood Plan the same way every afternoon and shows every number's source. Last winter's two wrong-town calls came from that manual step.
- **For the sector:** shared rules, recorded reasons and rehearsals make councils' decisions comparable and auditable.

**What it supports, and what it must never decide alone.**
- **Supports:** tonight's level for each town, the crew allocation, and a data-based shortlist for a flood-defence study (Ennis: 17 high-flow events, rising from 7 to 9).
- **Never alone:**
  - sending crews or erecting barriers;
  - public warnings;
  - choosing the study town, which needs damage, defences and population data;
  - anything about homes or roads.

The Duty Officer decides and records why.

**Where it sits in Ireland.**
- **Met Éireann:** its Flood Forecasting Centre, operational since early 2024, gives local authorities flood guidance at broad river-catchment level [1]. River Watch complements it with town-level advice; read the Centre's guidance alongside.
- **Dublin City Council:** it is piloting an AI flood early-warning system trained on ten years of sensor data, with trial lead times of 13–21 hours [2]. Same principle: AI gives earlier information and staff act. We use a 5 km global model, not our own sensors.

**Running cost at 1,000 questions a month.**
- **Claude Haiku 5.5:** measured €0.0008–0.0021 per answer, average €0.0011, so **about €1.10 a month**. GitHub Pages and Google Apps Script cost nothing.
- **Open-Meteo:** the free API is non-commercial only, limited to 10,000 calls a day, and has no uptime guarantee [3]. Operational use needs its paid licence, which would be the largest cost.
- **Cheaper brain:** there is no cheaper Claude model, and free tiers add rate limits and data-use terms.
- **Dearer brain:** Sonnet 5.5 costs about 20× (around €22 a month) and Opus 5.5 about 40× (around €44). Either handles long, messy questions better; levels stay identical because code computes them.

**Risks, and what goes in place first.**
- **Wrong number from the wrong place.** Model squares were checked against OPW gauges; 19 rule tests pass. Recheck yearly, and treat Carrick-on-Shannon with caution.
- **A forecast that misses.** The 5 km model reads low and can mistime peaks on small rivers. Compare with live OPW levels and Centre guidance, and review each flood against the advice.
- **A source going down.** River Watch reports failures and never guesses. Keep a manual fallback procedure and buy the Open-Meteo licence.
- **A leaked key.** The key lives only in Apps Script, with $5 of prepaid credit and auto-reload off. Rotate it each term.
- **Over-trust.** Keep "a person makes the final decision" on the page, record each decision and reason, and run a monthly rehearsal drill.

---

**Sources**

[1] Met Éireann, *Flood Forecasting Centre*, https://www.met.ie/about-us/specialised-services/flood-forecasting-centre (accessed 27 Nov 2026).
[2] Dublin City Council, *Dublin City Council and EMR to pilot AI early warning system for major flood events*, https://www.dublincity.ie/news/dublin-city-council-and-emr-pilot-ai-early-warning-system-major-flood-events (accessed 27 Nov 2026).
[3] Open-Meteo, *Pricing*, https://open-meteo.com/en/pricing (accessed 27 Nov 2026).
