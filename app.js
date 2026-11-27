/* River Watch page: fetch live data → engine.js applies the Flood Plan → show working → AI explains.
   No API key lives in this file. The AI is reached only through the team's Google Apps Script web app,
   which holds the key in its Script Properties. */
(function () {
  "use strict";
  const E = window.RiverWatchEngine;

  const CONFIG = {
    SHEET_ID: "1__se3fujZ6axbccCweG0kli16UDd-YTVw7mwao1-9Ek",
    SHEET_GID: "0",
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbywW_wIqg3mzzzitgum8h0JZr9h-Q1RTwWYJt3cYwa6Ljq0g1Me12A-fBTakPMuyKqmyQ/exec", // the deployed web app URL (…/exec). Not a secret: the key stays in Script Properties.
    MODEL: "claude-haiku-5-5",
    MAX_TOKENS: 40000,
    // USD per million tokens, Claude Haiku 5.5, prompts under 100k (platform.claude.com/docs/en/about-claude/pricing, checked 26 Nov 2026)
    PRICE_USD: { input: 0.10, cache_write: 0.125, cache_read: 0.01, output: 0.50 },
    HISTORY_TURNS: 6,
  };
  const KEY_STORE = "riverwatch.anthropicKey";
  const TZ = "Europe/Dublin";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (d) => new Intl.DateTimeFormat("en-IE", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(d);
  const fmtDay = (iso) => iso ? new Intl.DateTimeFormat("en-IE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T00:00:00Z")) : "";
  const r1 = (v) => (v == null || !Number.isFinite(v) ? "–" : (Math.round(v * 10) / 10).toLocaleString("en-IE"));

  const state = { stat: null, live: null, advice: null, study: null, chat: [], usage: [], fx: null };

  /* ---------- fetching ---------- */
  async function getJSON(url, opts) {
    const r = await fetch(url, Object.assign({ cache: "no-store" }, opts));
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${new URL(url).host}`);
    return r.json();
  }
  async function getText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} from ${new URL(url).host}`);
    return r.text();
  }

  async function loadStatic() {
    if (state.stat) return state.stat;
    const [summary, events, county, plan] = await Promise.all([
      getJSON("data/history_summary.json"), getJSON("data/events.json"),
      getJSON("data/county_codes.json"), getText("data/flood_plan.txt"),
    ]);
    state.stat = { summary, events, countyCodes: county.codes, countySource: county.source, plan };
    $("planText").textContent = plan;
    return state.stat;
  }

  async function loadSheet() {
    const t = Date.now();
    // Route A: the team's Apps Script reads the Sheet with the owner's access, so the Sheet can stay private.
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        const d = await getJSON(`${CONFIG.APPS_SCRIPT_URL}?action=sheet&t=${t}`);
        if (d.error) throw new Error(d.error.message);
        if (!d.rows || !d.rows.length || !("town" in d.rows[0])) throw new Error("Team server did not return the Towns table");
        return { rows: d.rows, url: "Team server (Apps Script) reading " + d.source, at: new Date(d.read_at || Date.now()) };
      } catch (e) { console.warn("Sheet via team server failed, trying the Sheet link", e); }
    }
    // Route B: the Sheet's own CSV link (needs the Sheet shared as "anyone with the link can view").
    const primary = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${CONFIG.SHEET_GID}&t=${t}`;
    const backup = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=csv&gid=${CONFIG.SHEET_GID}&t=${t}`;
    let text, used = primary;
    try { text = await getText(primary); } catch (e) { used = backup; text = await getText(backup); }
    const rows = E.parseCSV(text);
    if (!rows.length || !("town" in rows[0])) throw new Error("Team Sheet did not return the Towns table (is the team server set up, or the Sheet shared by link?)");
    return { rows, url: used.replace(/&t=\d+/, ""), at: new Date() };
  }

  async function loadForecast(summary) {
    const lat = summary.towns.map((t) => t.cell_lat).join(","), lon = summary.towns.map((t) => t.cell_lon).join(",");
    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&forecast_days=3&timezone=${encodeURIComponent(TZ)}`;
    let res = await getJSON(url);
    if (!Array.isArray(res)) res = [res];
    const out = {}, problems = [];
    summary.towns.forEach((t, i) => {
      const d = res[i];
      if (!d || !d.daily) { problems.push(`${t.town}: no forecast returned`); return; }
      if (Math.abs(d.latitude - t.cell_lat) > 0.01 || Math.abs(d.longitude - t.cell_lon) > 0.01)
        problems.push(`${t.town}: API returned cell ${d.latitude}, ${d.longitude}, not the checked cell`);
      out[t.town] = { dates: d.daily.time, values: d.daily.river_discharge, lat: d.latitude, lon: d.longitude };
    });
    return { byTown: out, url, at: new Date(), problems, days: res[0] && res[0].daily ? res[0].daily.time : [] };
  }

  async function loadWarnings() {
    const url = "https://www.met.ie/Open_Data/json/warning_IRELAND.json";
    const list = await getJSON(url);
    return { list: Array.isArray(list) ? list : [], url, at: new Date() };
  }

  async function loadFx() {
    if (CONFIG.APPS_SCRIPT_URL) {
      try {
        const d = await getJSON(`${CONFIG.APPS_SCRIPT_URL}?action=fx`);
        if (!d.error && d.eurPerUsd) return { eurPerUsd: Math.round(d.eurPerUsd * 10000) / 10000, date: d.date, source: d.source + ", via team server" };
      } catch (e) { /* fall through */ }
    }
    try {
      const d = await getJSON("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
      return { eurPerUsd: d.rates.EUR, date: d.date, source: "ECB reference rate via frankfurter.dev" };
    } catch (e) { return null; }
  }

  async function refreshAll() {
    setStatus("Reading the Team Sheet, river forecast and Met Éireann warnings…");
    $("refreshBtn").disabled = true;
    try {
      const stat = await loadStatic();
      const [sheet, forecast, warnings, fx] = await Promise.allSettled([loadSheet(), loadForecast(stat.summary), loadWarnings(), loadFx()]);
      const live = {
        sheet: sheet.status === "fulfilled" ? sheet.value : { error: String(sheet.reason && sheet.reason.message || sheet.reason) },
        forecast: forecast.status === "fulfilled" ? forecast.value : { error: String(forecast.reason && forecast.reason.message || forecast.reason) },
        warnings: warnings.status === "fulfilled" ? warnings.value : { error: String(warnings.reason && warnings.reason.message || warnings.reason) },
      };
      state.fx = fx.status === "fulfilled" ? fx.value : null;
      state.live = live;
      const now = new Date();
      const errs = ["sheet", "forecast", "warnings"].filter((k) => live[k].error).map((k) => `${k}: ${live[k].error}`);
      if (live.sheet.error) {
        state.advice = null;
        setStatus("Could not read the Team Sheet, so no advice can be worked out. " + live.sheet.error, true);
      } else {
        state.inputs = {
          sheetRows: live.sheet.rows, summary: stat.summary,
          forecast: live.forecast.error ? {} : live.forecast.byTown,
          warnings: live.warnings.error ? [] : live.warnings.list,
          countyCodes: stat.countyCodes, now,
        };
        state.advice = E.computeAdvice(state.inputs);
        if (live.warnings.error) state.advice.dataProblems.push("Met Éireann warnings could not be read: warnings were NOT checked. " + live.warnings.error);
        if (live.forecast.problems) state.advice.dataProblems.push(...live.forecast.problems);
        setStatus(errs.length ? "Some live data failed: " + errs.join("; ") : `Live data read ${fmtTime(now)}.`, errs.length > 0);
      }
      state.study = E.studyAnswer(stat.events);
      render();
      return true;
    } catch (e) {
      setStatus("Could not load River Watch data: " + e.message, true);
      return false;
    } finally { $("refreshBtn").disabled = false; }
  }

  /* ---------- rendering ---------- */
  function setStatus(msg, err) { const s = $("statusBar"); s.textContent = msg; s.classList.toggle("err", !!err); }
  const levelClass = (lvl) => (!lvl ? "None" : lvl.startsWith("Barriers") ? "Barriers" : lvl.startsWith("Standby") ? "Standby" : "Normal");

  function render() {
    const a = state.advice, st = state.stat, live = state.live;
    const tbody = $("adviceTable").querySelector("tbody");
    tbody.innerHTML = "";
    if (a) {
      $("computedAt").textContent = "Worked out " + fmtTime(new Date(a.computedAt));
      const by = (re) => a.towns.filter((t) => t.level && re.test(t.level)).map((t) => t.town);
      const bar = by(/^Barriers$/), sb = by(/^Standby/);
      $("summaryLine").innerHTML = `<strong>Barriers:</strong> ${esc(bar.join(", ") || "none")} &nbsp; <strong>Standby:</strong> ${esc(sb.join(", ") || "none")}` +
        (a.dataProblems.length ? `<div class="status err small">${a.dataProblems.map(esc).join("<br>")}</div>` : "");
      a.towns.forEach((t, i) => {
        const tr = document.createElement("tr");
        tr.className = "town-row"; tr.tabIndex = 0;
        const warn = (t.warnings || []).map((w) => `<span class="pill ${w.level === "yellow" ? "Standby" : "Barriers"}">${esc(w.level)}</span>${w.source.includes("REHEARSAL") ? '<span class="tag">REHEARSAL</span>' : ""}`).join(" ") || '<span class="muted">none</span>';
        tr.innerHTML = `<td><strong>${esc(t.town)}</strong><br><span class="muted small">${esc(t.river || "")}, ${esc((t.counties || []).map((c) => c.county).join(" + ") || t.county || "")}</span></td>
          <td><span class="pill ${levelClass(t.level)}">${esc(t.level || "No advice")}</span>${t.rehearsal && t.rehearsal.length ? '<span class="tag">REHEARSAL</span>' : ""}<div class="small">${esc(t.action || "")}</div></td>
          <td class="num">${r1(t.peak)}<br><span class="muted small">${t.peakDate ? esc(fmtDay(t.peakDate)) : t.rehearsal && t.rehearsal.length ? "override" : ""}</span></td>
          <td class="num">${r1(t.p95)} / ${r1(t.p99)}</td>
          <td class="num">${t.pctOverP99 == null ? "–" : (t.pctOverP99 > 0 ? "+" : "") + r1(t.pctOverP99) + "%"}</td>
          <td>${warn}</td>
          <td>${esc(t.crew || (t.level && t.level.startsWith("Standby (Barriers") ? "none" : "–"))}</td>`;
        const wr = document.createElement("tr");
        wr.className = "work-row"; wr.hidden = true;
        wr.innerHTML = `<td colspan="7">${workingHTML(t)}</td>`;
        const toggle = () => (wr.hidden = !wr.hidden);
        tr.addEventListener("click", toggle);
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        tbody.append(tr, wr);
      });
      const rb = $("rehearsalBanner");
      if (a.rehearsalInUse) {
        rb.hidden = false;
        rb.textContent = "Rehearsal values in use: " + a.towns.filter((t) => t.rehearsal && t.rehearsal.length).map((t) => `${t.town} (${t.rehearsal.join("; ")})`).join(" · ") + ". This advice is not based only on live data.";
      } else rb.hidden = true;
      $("crewList").innerHTML = a.crewPlan.map((c) => `<li><strong>${esc(c.crew)}</strong>${c.active ? "" : ' <span class="muted">(not available)</span>'}: ${c.towns.length ? esc(c.towns.join(" and ")) + " (barriers before 18:00)" : '<span class="muted">no barrier jobs tonight</span>'}<br><span class="muted small">Can work in tonight: ${esc(c.area_tonight.join(", ") || "nowhere")} · ${2 - c.towns.length} of 2 places free</span></li>`).join("");
      $("crewNotes").innerHTML = a.crewNotes.map(esc).join("<br>");
      const flags = a.towns.filter((t) => (t.flags || []).length);
      $("flagList").innerHTML = flags.length ? flags.map((t) => `<li><strong>${esc(t.town)}</strong>: ${t.flags.map(esc).join("; ")}</li>`).join("") : '<li class="muted">No flags tonight.</li>';
    }
    renderStudy(); renderSources(); renderCost(); renderRoute();
  }

  function workingHTML(t) {
    const s = t.sheet || {};
    const lines = [];
    if (t.peakSource) lines.push(`<strong>Forecast peak</strong> ${r1(t.peak)} m³/s${t.peakDate ? " on " + esc(fmtDay(t.peakDate)) : ""}. Source: ${esc(t.peakSource)}.`);
    if (t.forecastDays) lines.push(`Daily forecast: ${t.forecastDays.map((d, i) => `${esc(fmtDay(d))} ${r1(t.forecastValues[i])}`).join(" · ")} m³/s.`);
    if (t.livePeak != null) lines.push(`Live forecast peak (not used because of the override): ${r1(t.livePeak)} m³/s.`);
    if (t.p95 != null) lines.push(`<strong>Thresholds</strong> P95 ${t.p95}, P99 ${t.p99} m³/s: this town's own daily flows 2016-01-01 to 2025-12-31, same GloFAS cell ${esc((t.cell || []).join(", "))} (data/history_summary.json).`);
    if (t.counties) lines.push(`<strong>Counties checked for warnings</strong>: ${t.counties.map((c) => `${esc(c.county)} (${esc(c.code || "no code")})`).join(", ")}${t.counties.length > 1 ? ", second county from the notes column" : ""}.`);
    (t.warnings || []).forEach((w) => lines.push(`Warning: ${esc(w.level)}, "${esc(w.headline || "")}"${w.onset ? `, ${esc(fmtTime(new Date(w.onset)))} to ${esc(fmtTime(new Date(w.expiry)))}` : ""}. Source: ${esc(w.source)}.`));
    lines.push(`<strong>Team Sheet</strong>: barrier_sets ${esc(s.barrier_sets)}, pumps ${esc(s.pumps)}, sandbags ${esc(s.sandbags)}, staff_on_call ${esc(s.staff_on_call)}, crew_based_here ${esc(s.crew_based_here)}, flow_override ${esc(s.flow_override_m3s == null ? "empty" : s.flow_override_m3s)}, warning_override ${esc(s.warning_override || "empty")}. Notes: "${esc(s.notes)}".`);
    (t.steps || []).forEach((x) => lines.push("→ " + esc(x)));
    (t.rehearsal || []).forEach((x) => lines.push(`<span class="tag">REHEARSAL</span> ${esc(x)}`));
    return lines.map((l) => `<div>${l}</div>`).join("");
  }

  function renderStudy() {
    const st = state.study, ev = state.stat && state.stat.events;
    if (!st || !ev) return;
    const top = st.ranked[0];
    $("studyHead").innerHTML = st.tie
      ? `<strong>Tie:</strong> ${esc(st.top.join(" and "))} with ${top.total_events} events each.`
      : `<strong>${esc(top.town)}</strong> has the most high-flow events: ${top.total_events} in nine winters. Last four winters (${esc(st.last_four_winters[0])}–${esc(st.last_four_winters[3])}): ${top.last_four}; first four (${esc(st.first_four_winters[0])}–${esc(st.first_four_winters[3])}): ${top.first_four}.`;
    const head = `<thead><tr><th>Town</th>${ev.winters.map((w) => `<th class="num">${esc(w)}</th>`).join("")}<th class="num">Total</th><th class="num">First 4</th><th class="num">Last 4</th><th class="num">Days</th></tr></thead>`;
    const body = ev.towns.slice().sort((a, b) => b.total_events - a.total_events || b.total_event_days - a.total_event_days)
      .map((t) => `<tr><td>${esc(t.town)}<br><span class="muted small">P99 ${t.p99_m3s}</span></td>${ev.winters.map((w) => `<td class="num">${t.per_winter[w]}</td>`).join("")}<td class="num"><strong>${t.total_events}</strong></td><td class="num">${t.first_four_events}</td><td class="num">${t.last_four_events}</td><td class="num">${t.total_event_days}</td></tr>`).join("");
    $("studyTable").innerHTML = head + `<tbody>${body}</tbody>`;
  }

  function renderSources() {
    const live = state.live, st = state.stat;
    if (!live || !st) return;
    const rows = [
      ["Team Google Sheet (Towns tab)", live.sheet.error ? "FAILED: " + live.sheet.error : `${live.sheet.rows.length} towns: kit, crews, notes, rehearsal overrides`, live.sheet.at, `<a href="https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit">open Sheet</a>`],
      ["Open-Meteo Flood API (GloFAS v4)", live.forecast.error ? "FAILED: " + live.forecast.error : "daily river discharge, 8 checked cells", live.forecast.at, live.forecast.days ? live.forecast.days.map(fmtDay).join(", ") + " (Irish time)" : ""],
      ["Met Éireann warnings", live.warnings.error ? "FAILED: " + live.warnings.error : `${live.warnings.list.length} live warning(s), county codes per ${st.countySource.split(";")[0]}`, live.warnings.at, "in force now to +48 h"],
      ["Stored history summary", `P95/P99 per town, ${st.summary.towns[0].period}`, null, `built ${esc(st.summary.built)} by scripts/build_history.py`],
      ["Stored event counts", "rule 8 events, winters 2016/17–2024/25", null, "scripts/build_events.py"],
      ["Exchange rate", state.fx ? `$1 = €${state.fx.eurPerUsd}` : "not available (costs shown in USD)", null, state.fx ? `${esc(state.fx.source)}, rate date ${esc(state.fx.date)}` : ""],
    ];
    $("sourceTable").querySelector("tbody").innerHTML = rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2] ? esc(fmtTime(r[2])) : '<span class="muted">stored file</span>'}</td><td>${r[3]}</td></tr>`).join("");
    const w = live.warnings.list || [];
    $("allWarnings").innerHTML = live.warnings.error ? `<li class="status err">Could not read warnings: ${esc(live.warnings.error)}</li>` :
      w.length ? w.map((x) => `<li><span class="pill ${x.level === "yellow" ? "Standby" : "Barriers"}">${esc(x.level)}</span> ${esc(x.type)}: ${esc(x.headline)} <span class="muted">(${esc((x.regions || []).join(", "))}; ${x.onset ? esc(fmtTime(new Date(x.onset))) : ""} to ${x.expiry ? esc(fmtTime(new Date(x.expiry))) : ""})</span></li>`).join("")
        : `<li class="muted">No warnings in force (Met Éireann, read ${esc(fmtTime(live.warnings.at))}).</li>`;
  }

  function costOf(u) {
    const p = CONFIG.PRICE_USD;
    return ((u.input_tokens || 0) * p.input + (u.cache_creation_input_tokens || 0) * p.cache_write + (u.cache_read_input_tokens || 0) * p.cache_read + (u.output_tokens || 0) * p.output) / 1e6;
  }
  function money(usd) {
    if (state.fx) return `€${(usd * state.fx.eurPerUsd).toFixed(usd < 0.01 ? 5 : 2)}`;
    return `$${usd.toFixed(usd < 0.01 ? 5 : 2)}`;
  }
  function renderCost() {
    const fx = state.fx;
    const last = state.usage[state.usage.length - 1];
    const sessionUsd = state.usage.reduce((s, u) => s + costOf(u), 0);
    const perAnswer = last ? costOf(last) : (4000 * CONFIG.PRICE_USD.input + 1000 * CONFIG.PRICE_USD.output) / 1e6;
    const monthUsd = perAnswer * 330;
    $("costBox").innerHTML = `
      <div>Model: <strong>Claude Haiku 5.5</strong>, $${CONFIG.PRICE_USD.input} per million input tokens and $${CONFIG.PRICE_USD.output} per million output tokens (Anthropic pricing page, checked 26 Nov 2026)${fx ? `; in euro €${(CONFIG.PRICE_USD.input * fx.eurPerUsd).toFixed(3)} / €${(CONFIG.PRICE_USD.output * fx.eurPerUsd).toFixed(3)}` : ""}.</div>
      <div>${last ? `Last answer: ${last.input_tokens + (last.cache_read_input_tokens || 0) + (last.cache_creation_input_tokens || 0)} tokens in, ${last.output_tokens} out = <strong>${money(costOf(last))}</strong>. This visit so far: ${money(sessionUsd)}.` : `Estimated per answer (about 4,000 tokens in, 1,000 out): <strong>${money(perAnswer)}</strong>.`}</div>
      <div>Per month at about 330 answers (30 afternoon briefings + 300 questions): <strong>${money(monthUsd)}</strong>. The live data sources and hosting are free. A $5 (${fx ? "€" + (5 * fx.eurPerUsd).toFixed(2) : ""}) monthly spend limit on the team key caps the worst case.</div>
      <div class="muted">${fx ? `Rate: $1 = €${fx.eurPerUsd}, ${esc(fx.source)}, ${esc(fx.date)}.` : "Live exchange rate unavailable; figures in USD."}</div>`;
  }
  function renderRoute() {
    $("aiRoute").textContent = CONFIG.APPS_SCRIPT_URL
      ? "AI route: the team's server (Google Apps Script). The key is held server-side; nobody using this page needs one."
      : "AI is not set up (no team server URL). The advice table above still works without AI.";
  }


  /* ---------- AI ---------- */
  function systemPrompt() {
    return `You are River Watch, a decision-support assistant for a flood response team that serves eight Irish towns. You talk to the Duty Officer (Aoife Brennan) and the Area Manager.

How River Watch works: code has already fetched the live data and applied The Flood Plan. Each user message contains FACTS (JSON) worked out at that moment, followed by a QUESTION. Your job is to explain those facts and answer the question. You do not do new arithmetic on the river data and you never change a level, a crew allocation or a flag that the FACTS give. If you believe the FACTS conflict with the Flood Plan, say so plainly and tell the Duty Officer to check, but still report what the FACTS say.

Rules for every answer:
1. Start with the direct answer in one or two sentences, then the supporting detail.
2. Every number you give must come from the FACTS, and say where it came from and for which date or time (for example "forecast peak 23.3 m³/s for Sat 28 Nov, GloFAS forecast via Open-Meteo, read 15:02").
3. If FACTS.rehearsal_in_use is true, say clearly at the top that the answer uses rehearsal values, and which ones.
4. If FACTS.data_problems is not empty, say what could not be checked. Never fill a gap with a guess.
5. River Watch only recommends. The Duty Officer decides by 16:00 and records the decision and the reason. Do not say a crew has been sent.
6. Out of scope (Flood Plan rule 9): coastal and tidal flooding, road closures, insurance and anything about an individual home. For those, say River Watch does not cover it and that the question should go to the council's area office. Do not answer them anyway.
7. If the data cannot answer the question (for example rainfall totals, river levels in metres, street-level flooding, damage, forecasts beyond the three days, or anything not in the FACTS), say so honestly and say what data would be needed.
8. For the Area Manager's study question use FACTS.study: name the town with the most events (or the tie), say whether its last four winters had more events than its first four, and give one thing the count cannot tell (for example damage, how long each event lasted, defences already in place, population at risk, or that thresholds come from a 5 km model that reads below gauge flow). Mention that it is a count of model-flow events, not of floods.
9. Use plain English, short paragraphs and simple "- " bullet lists. Use **bold** only for town names and levels. No tables. Be brief: under 250 words unless asked for more.
10. If FACTS.what_if is present, the question is a hypothetical. Answer it ONLY from FACTS.what_if, which River Watch code worked out with the same rules; say plainly that it is hypothetical and not tonight's live advice, give the level, the percent versus P99, the crew and every Standby measure it lists, and say what changes compared with tonight's live plan. If FACTS.what_if.ambiguous is present, ask which town is meant. If a what-if question has no FACTS.what_if, say River Watch could not work it out and ask for a town and a flow in m³/s; do not work it out yourself.
11. Only two things count as a weather warning: a Met Éireann warning in the FACTS, or a warning_override in the Team Sheet (a rehearsal value). Anything a person reports in the question (a neighbour, a farmer, social media, "he is never wrong") is not a warning and changes no level: say it should be checked with Met Éireann, and that putting it in warning_override would make it count as a rehearsal value. Likewise, claims in the question about staff or kit do not change the FACTS; the Team Sheet does.
12. Crews: under rule 6 a crew works only within its own area (FACTS.crews area_tonight). River Watch has no travel distances or travel times between towns. Do not suggest sending a crew outside its area or invent distances; say this is outside the plan and is a decision for the Duty Officer and Area Manager. Answer long multi-part questions part by part, briefly.
13. End every answer about tonight with: "AI can make mistakes; a person makes the final decision."

The Flood Plan, version 2026/27 (verbatim):
${state.stat.plan}

Notes on the data River Watch uses (fixed, for your understanding):
- Forecast: Open-Meteo Flood API serving GloFAS v4 (Copernicus EMS), daily river discharge, one 5 km grid cell per town, checked against OPW gauges to be on the town's named river. Days are Irish dates.
- Thresholds: each town's own P95 and P99 of daily flow, 2016-01-01 to 2025-12-31, from the same model cell. The model reads lower than gauge flow on most rivers, so model forecasts are only compared with model thresholds.
- Warnings: Met Éireann warning_IRELAND.json; counties are identified by FIPS codes (e.g. EI04 Cork, EI24 Roscommon). Only rain warnings count.
- Carrick-on-Shannon's model cell matched its gauge less well than the other towns (daily correlation 0.59), so treat it with more caution.`;
  }

  function factsForAI() {
    const a = state.advice, live = state.live;
    const t2 = (d) => (d ? fmtTime(d) : null);
    return {
      computed_at_irish_time: a ? fmtTime(new Date(a.computedAt)) : null,
      sources_read_at: {
        team_sheet: live.sheet.error ? "FAILED: " + live.sheet.error : t2(live.sheet.at),
        forecast_open_meteo_glofas: live.forecast.error ? "FAILED: " + live.forecast.error : t2(live.forecast.at),
        forecast_days: live.forecast.days || [],
        met_eireann_warnings: live.warnings.error ? "FAILED: " + live.warnings.error : t2(live.warnings.at),
      },
      rehearsal_in_use: a ? a.rehearsalInUse : false,
      data_problems: a ? a.dataProblems : ["Team Sheet could not be read: no advice could be worked out"],
      towns: a ? a.towns.map((t) => ({
        town: t.town, river: t.river, counties: t.counties, advice: t.level, action: t.action, crew: t.crew || null,
        forecast_peak_m3s: t.peak == null ? null : Math.round(t.peak * 10) / 10, peak_date: t.peakDate || null, peak_source: t.peakSource || null,
        daily_forecast_m3s: t.forecastDays ? Object.fromEntries(t.forecastDays.map((d, i) => [d, t.forecastValues[i]])) : null,
        live_peak_ignored_due_to_override: t.livePeak == null ? undefined : t.livePeak,
        p95_m3s: t.p95, p99_m3s: t.p99, percent_vs_p99: t.pctOverP99, level_from_flow: t.flowLevel, level_after_warnings: t.planLevel,
        barriers_rank: t.rank || null, barrier_set_available: t.barrierAvailable,
        rain_warnings: t.warnings, rehearsal: t.rehearsal, flags: t.flags, working: t.steps, team_sheet: t.sheet,
      })) : [],
      crews: a ? a.crewPlan : [], crew_notes: a ? a.crewNotes : [],
      area_manager_flags: a ? a.areaManagerFlags : [],
      all_live_met_eireann_warnings: live.warnings.error ? "not available" : (live.warnings.list || []).map((w) => ({ type: w.type, level: w.level, headline: w.headline, regions: w.regions, onset: w.onset, expiry: w.expiry })),
      study: Object.assign({ definition: state.stat.events.definition, source: state.stat.events.source }, state.study,
        { per_winter: Object.fromEntries(state.stat.events.towns.map((t) => [t.town, t.per_winter])),
          events_of_top_town: state.stat.events.towns.find((t) => t.town === state.study.ranked[0].town).events }),
    };
  }

  async function callClaude(messages) {
    const body = {
      model: CONFIG.MODEL, max_tokens: CONFIG.MAX_TOKENS,
      system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
      messages, output_config: { effort: "low" },
    };
    let data;
    if (CONFIG.APPS_SCRIPT_URL) {
      const r = await fetch(CONFIG.APPS_SCRIPT_URL, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ system: body.system, messages }) });
      data = await r.json().catch(() => ({ error: { message: `Team server returned ${r.status}` } }));
      if (data.error) throw new Error(data.error.message || String(data.error));
    } else {
      throw new Error("The team AI server is not set up. The advice table above is still worked out without AI.");
    }
    if (data.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text && data.stop_reason === "max_tokens")
      throw new Error("The AI ran out of room before it could write an answer (it spent its token limit working the question out). Try splitting the question into shorter ones. The advice table above is still correct.");
    if (!text) throw new Error("The model returned no text" + (data.stop_reason ? ` (stop reason ${data.stop_reason})` : ""));
    return { text, usage: data.usage || {}, truncated: data.stop_reason === "max_tokens" };
  }

  function md(text) {
    const lines = esc(text).split(/\n/);
    let html = "", inList = false;
    for (const raw of lines) {
      const l = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      if (/^\s*[-•]\s+/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${l.replace(/^\s*[-•]\s+/, "")}</li>`; }
      else { if (inList) { html += "</ul>"; inList = false; } if (l.trim()) html += `<p>${l.replace(/^#+\s*/, "")}</p>`; }
    }
    return html + (inList ? "</ul>" : "");
  }
  function addMsg(cls, html) {
    const d = document.createElement("div");
    d.className = "msg " + cls; d.innerHTML = html;
    $("chatLog").append(d); d.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return d;
  }

  // What-if questions are worked out by the same engine with the hypothetical flow, never by the AI.
  function whatIf(question) {
    if (!state.inputs || !state.stat) return null;
    const w = E.parseWhatIf(question, state.stat.summary.towns);
    if (!w) return null;
    if (w.ambiguous) return { ambiguous: w.ambiguous };
    const rows = state.inputs.sheetRows.map((r) => (String(r.town).trim().toLowerCase() === w.town.toLowerCase() ? Object.assign({}, r, { flow_override_m3s: String(w.flow) }) : r));
    const adv = E.computeAdvice(Object.assign({}, state.inputs, { sheetRows: rows }));
    return {
      assumption: `HYPOTHETICAL: ${w.town} forecast peak = ${w.flow} m³/s (from the question; not in the Team Sheet and not a forecast). All other live data unchanged.`,
      worked_out_by: "River Watch code, same Flood Plan rules (the working labels the flow as an override)",
      towns: adv.towns.map((t) => ({ town: t.town, advice: t.level, action: t.action, crew: t.crew || null, forecast_peak_m3s: t.peak == null ? null : Math.round(t.peak * 10) / 10,
        p95_m3s: t.p95, p99_m3s: t.p99, percent_vs_p99: t.pctOverP99, barriers_rank: t.rank || null, flags: t.flags, working: t.steps })),
      crews: adv.crewPlan, area_manager_flags: adv.areaManagerFlags,
    };
  }

  async function ask(question) {
    question = question.trim().slice(0, 1500);
    if (!question) return;
    addMsg("user", esc(question));
    const pending = addMsg("ai", '<span class="muted">Re-reading live data, then asking the AI…</span>');
    $("askBtn").disabled = true;
    try {
      await refreshAll(); // live at the moment of each question
      const facts = factsForAI();
      const wi = whatIf(question);
      if (wi) facts.what_if = wi;
      const userTurn = `FACTS (worked out by River Watch code at ${facts.computed_at_irish_time}):\n${JSON.stringify(facts)}\n\nQUESTION: ${question}`;
      const history = state.chat.slice(-CONFIG.HISTORY_TURNS * 2);
      const messages = history.concat([{ role: "user", content: userTurn }]);
      const res = await callClaude(messages);
      // history keeps the question and answer only: the FACTS are re-read fresh for every question,
      // so old copies are not resent (cheaper, and no stale numbers)
      state.chat.push({ role: "user", content: `(earlier question, asked ${facts.computed_at_irish_time}) ${question}` }, { role: "assistant", content: res.text });
      state.usage.push(res.usage);
      pending.innerHTML = md(res.text) + `<div class="meta">${facts.rehearsal_in_use ? '<span class="tag">REHEARSAL VALUES</span> ' : ""}Based on data read ${esc(facts.computed_at_irish_time)} · Claude Haiku 5.5 · ${money(costOf(res.usage))}${res.truncated ? " · answer cut short" : ""} · AI can make mistakes; a person makes the final decision.</div>`;
      renderCost();
    } catch (e) {
      pending.className = "msg err";
      pending.textContent = e.message;
    } finally { $("askBtn").disabled = false; }
  }

  /* ---------- wiring ---------- */
  $("refreshBtn").addEventListener("click", refreshAll);
  // New conversation: forget earlier questions and answers, so the next question starts fresh
  $("newChatBtn").addEventListener("click", () => {
    state.chat = [];
    $("chatLog").innerHTML = "";
    addMsg("ai", '<span class="muted">New conversation started. Earlier questions are forgotten; live data is re-read with every question.</span>');
    $("question").focus();
  });
  $("askForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("question").value; $("question").value = ""; ask(q); });
  $("question").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("askForm").requestSubmit(); } });
  document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));

  refreshAll();
})();
