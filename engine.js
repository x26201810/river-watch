/* River Watch rules engine: applies The Flood Plan (v2026/27) in plain code.
   No network, no AI. Input = live data already fetched; output = facts + working.
   Used by the page (window.RiverWatchEngine) and by tests (require('./engine.js')). */
(function (root) {
  "use strict";

  const LEVELS = ["Normal", "Standby", "Barriers"];
  // Flood Plan rule 6: crews and areas (fixed by the plan; a crew exists only if its base row says crew_based_here = yes)
  const CREWS = [
    { name: "Clonmel crew", base: "Clonmel", area: ["Clonmel", "Fermoy", "Enniscorthy"] },
    { name: "Mallow crew", base: "Mallow", area: ["Mallow", "Fermoy", "Bandon"] },
    { name: "Athlone crew", base: "Athlone", area: ["Athlone", "Carrick-on-Shannon", "Ennis"] },
  ];
  const CREW_CAPACITY = 2;

  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
  const num = (s) => {
    const t = String(s == null ? "" : s).replace(/,/g, "").trim();
    if (t === "") return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : NaN;
  };
  const round1 = (v) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10) / 10);

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const header = (rows.shift() || []).map((h) => h.trim());
    return rows
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((r) => Object.fromEntries(header.filter(Boolean).map((h, i) => [h, (r[i] || "").trim()])));
  }

  /* ---------- notes ---------- */
  function readNotes(note, countyCodes) {
    const out = { secondCounties: [], barrierUnavailable: null, crewOnlyIn: null, crewUnavailable: null };
    const n = String(note || "");
    const spans = n.match(/spans\s+([A-Za-z]+)\s+and\s+([A-Za-z]+)/i);
    if (spans) out.secondCounties = [spans[1], spans[2]].filter((c) => countyCodes[cap(c)]).map(cap);
    if (/barrier set[^.;]*\b(on loan|loaned|unavailable|out of service|damaged|broken|missing|away)\b/i.test(n))
      out.barrierUnavailable = n;
    const only = n.match(/([A-Za-z-]+) crew can (?:only )?work in ([A-Za-z-]+)(?: only)?/i);
    if (only) out.crewOnlyIn = { crew: cap(only[1]) + " crew", town: titleTown(only[2]) };
    const un = n.match(/([A-Za-z-]+) crew (?:is )?(?:unavailable|not available|off duty|stood down|off tonight)/i);
    if (un) out.crewUnavailable = cap(un[1]) + " crew";
    // anything the code could not turn into a rule is shown to the Duty Officer, never silently ignored
    out.unread = n.trim() !== "" && !/^normal service\.?$/i.test(n.trim()) &&
      !(out.secondCounties.length || out.barrierUnavailable || out.crewOnlyIn || out.crewUnavailable);
    return out;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const titleTown = (s) => s.split("-").map((p, i) => (i && p.length <= 2 ? p.toLowerCase() : cap(p))).join("-");

  /* ---------- warnings (rule 4 + rule 5) ---------- */
  function warningsFor(codes, warnings, now) {
    const horizon = new Date(now.getTime() + 48 * 3600 * 1000);
    return (warnings || []).filter((w) => {
      if (!/rain/i.test(w.type || "")) return false;
      if (!(w.regions || []).some((r) => codes.includes(r))) return false;
      const on = w.onset ? new Date(w.onset) : now, ex = w.expiry ? new Date(w.expiry) : horizon;
      return on <= horizon && ex >= now;
    });
  }

  /* ---------- crews (rule 6) ---------- */
  function allocateCrews(candidates, crews) {
    // candidates already ranked; add each in turn if a full assignment still exists (bipartite, capacity 2)
    const accepted = [];
    let best = {};
    for (const c of candidates) {
      const trial = accepted.concat([c]);
      const a = assign(trial, crews);
      if (a) { accepted.push(c); best = a; }
    }
    return best; // town -> crew name
  }
  function assign(towns, crews) {
    const load = Object.fromEntries(crews.map((c) => [c.name, 0]));
    const res = {};
    const go = (i) => {
      if (i === towns.length) return true;
      const t = towns[i];
      for (const c of crews) {
        if (c.area.includes(t) && load[c.name] < c.capacity) {
          load[c.name]++; res[t] = c.name;
          if (go(i + 1)) return true;
          load[c.name]--; delete res[t];
        }
      }
      return false;
    };
    return go(0) ? res : null;
  }

  /* ---------- main ---------- */
  function computeAdvice(input) {
    const { sheetRows, summary, forecast, warnings, countyCodes, now } = input;
    const sheet = {};
    (sheetRows || []).forEach((r) => (sheet[norm(r.town)] = r));
    const dataProblems = [];
    const towns = summary.towns.map((s) => {
      const w = { town: s.town, river: s.river, steps: [], flags: [], rehearsal: [] };
      const row = sheet[norm(s.town)];
      if (!row) {
        dataProblems.push(`${s.town} is missing from the Team Sheet`);
        w.level = null; w.action = "No advice: town missing from the Team Sheet"; w.flags.push("Town missing from Team Sheet");
        return w;
      }
      w.county = row.county || s.county;
      w.sheet = {
        crew_based_here: norm(row.crew_based_here), barrier_sets: num(row.barrier_sets), pumps: num(row.pumps),
        sandbags: num(row.sandbags), staff_on_call: num(row.staff_on_call),
        flow_override_m3s: num(row.flow_override_m3s), warning_override: norm(row.warning_override), notes: row.notes || "",
      };
      ["barrier_sets", "pumps", "sandbags", "staff_on_call", "flow_override_m3s"].forEach((k) => {
        if (Number.isNaN(w.sheet[k])) { w.flags.push(`Sheet value ${k} = "${row[k]}" is not a number`); dataProblems.push(`${s.town}: ${k} not a number`); }
      });
      const notes = readNotes(row.notes, countyCodes);
      w.notesRead = notes;
      if (notes.unread) {
        w.flags.push(`Note not understood by the code, Duty Officer to check: "${row.notes}"`);
        w.steps.push(`Notes: "${row.notes}" matched no known pattern, so it changed nothing; check it by hand`);
      }
      w.p95 = s.p95_m3s; w.p99 = s.p99_m3s;
      w.cell = [s.cell_lat, s.cell_lon];

      // rule 2: forecast peak (today + next two days)
      const f = forecast && forecast[s.town];
      if (w.sheet.flow_override_m3s != null && !Number.isNaN(w.sheet.flow_override_m3s)) {
        w.peak = w.sheet.flow_override_m3s; w.peakSource = "Team Sheet flow_override_m3s (REHEARSAL VALUE)";
        w.rehearsal.push(`flow_override_m3s = ${w.peak} m³/s used in place of the forecast peak`);
        if (f && f.values) w.livePeak = Math.max(...f.values.filter((v) => v != null));
      } else if (f && f.values && f.values.some((v) => v != null)) {
        const vals = f.values.map((v, i) => ({ v, d: f.dates[i] })).filter((x) => x.v != null);
        const top = vals.reduce((a, b) => (b.v > a.v ? b : a));
        w.peak = top.v; w.peakDate = top.d; w.forecastDays = f.dates; w.forecastValues = f.values;
        w.peakSource = `Open-Meteo/GloFAS forecast, cell ${s.cell_lat}, ${s.cell_lon}, days ${f.dates[0]} to ${f.dates[f.dates.length - 1]}`;
        if (f.dates.length < 3) w.flags.push("Forecast has fewer than 3 days");
      } else {
        w.level = null; w.action = "No advice: forecast missing. Check the river manually.";
        w.flags.push("Forecast missing for this town"); dataProblems.push(`${s.town}: forecast missing`);
        return w;
      }
      w.pctRaw = ((w.peak - w.p99) / w.p99) * 100;
      w.pctOverP99 = round1(w.pctRaw);
      // rule 3
      let lvl = w.peak >= w.p99 ? 2 : w.peak >= w.p95 ? 1 : 0;
      w.flowLevel = LEVELS[lvl];
      w.steps.push(`Rule 2/3: peak ${round1(w.peak)} m³/s vs P95 ${w.p95} and P99 ${w.p99} → ${w.flowLevel}`);

      // rule 4 + 5: warnings
      const counties = [w.county].concat(notes.secondCounties.filter((c) => norm(c) !== norm(w.county)));
      w.counties = counties.map((c) => ({ county: c, code: countyCodes[cap(c)] || null }));
      w.counties.filter((c) => !c.code).forEach((c) => w.flags.push(`No Met Éireann code for county "${c.county}"`));
      const codes = w.counties.map((c) => c.code).filter(Boolean);
      const live = warningsFor(codes, warnings, now).map((x) => ({
        level: norm(x.level), headline: x.headline, onset: x.onset, expiry: x.expiry, regions: x.regions, source: "Met Éireann" }));
      const wo = w.sheet.warning_override;
      if (["yellow", "orange", "red"].includes(wo)) {
        live.push({ level: wo, headline: `Rehearsal: warning_override = ${wo}`, source: "Team Sheet warning_override (REHEARSAL VALUE)" });
        w.rehearsal.push(`warning_override = ${wo} treated as a live ${wo} rain warning`);
      } else if (wo) w.flags.push(`warning_override "${row.warning_override}" not understood (use yellow, orange or red)`);
      w.warnings = live;
      const raising = live.filter((x) => x.level === "orange" || x.level === "red");
      if (raising.length && lvl < 2) {
        lvl += 1;
        w.steps.push(`Rule 4: ${raising[0].level} rain warning (${raising[0].source}) → raised one level to ${LEVELS[lvl]}`);
      } else if (raising.length) w.steps.push(`Rule 4: ${raising[0].level} rain warning in force; already at Barriers`);
      else if (live.length) w.steps.push(`Rule 4: yellow rain warning noted; changes nothing`);
      else w.steps.push(`Rule 4: no rain warning for ${counties.join(" or ")} in the next 48 h`);
      w.planLevel = LEVELS[lvl];

      // rule 7: barrier sets
      w.barrierAvailable = (w.sheet.barrier_sets || 0) > 0 && !notes.barrierUnavailable;
      if (lvl === 2 && !w.barrierAvailable) {
        w.steps.push(`Rule 7: no barrier set available (${notes.barrierUnavailable ? "notes: " + notes.barrierUnavailable : "barrier_sets = " + w.sheet.barrier_sets}) → Standby measures, flag to Area Manager`);
        w.flags.push("Area Manager: at Barriers but no barrier set available");
      }
      return w;
    });

    // rule 6: crews
    const crewNotes = [];
    const crews = CREWS.map((c) => {
      const baseRow = sheet[norm(c.base)];
      const active = baseRow && norm(baseRow.crew_based_here) === "yes";
      let area = c.area.slice();
      towns.forEach((t) => {
        const n = t.notesRead;
        if (n && n.crewOnlyIn && n.crewOnlyIn.crew === c.name) { area = area.filter((x) => x === n.crewOnlyIn.town); crewNotes.push(`${c.name}: notes say it can work in ${n.crewOnlyIn.town} only tonight`); }
        if (n && n.crewUnavailable === c.name) { area = []; crewNotes.push(`${c.name}: notes say it is unavailable`); }
      });
      if (!active) crewNotes.push(`${c.name}: Team Sheet says no crew based at ${c.base}`);
      return { name: c.name, base: c.base, area: active ? area : [], capacity: CREW_CAPACITY, active: !!active };
    });
    const atBarriers = towns.filter((t) => t.planLevel === "Barriers" && t.barrierAvailable);
    // percent compared unrounded; differences below 1e-9 (float noise) count as a tie → higher peak first
    atBarriers.sort((a, b) => (Math.abs(b.pctRaw - a.pctRaw) > 1e-9 ? b.pctRaw - a.pctRaw : b.peak - a.peak));
    atBarriers.forEach((t, i) => (t.rank = i + 1));
    const allocation = allocateCrews(atBarriers.map((t) => t.town), crews);

    towns.forEach((t) => {
      if (t.level === null) return;
      const standby = `Standby measures: confirm ${t.sheet.staff_on_call} staff on call, check ${t.sheet.pumps} pumps, stage ${t.sheet.sandbags} sandbags`;
      if (t.planLevel === "Normal") { t.level = "Normal"; t.action = "No action"; }
      else if (t.planLevel === "Standby") { t.level = "Standby"; t.action = standby; }
      else if (!t.barrierAvailable) { t.level = "Standby (Barriers needed, no set)"; t.action = standby + ". Flagged to Area Manager (no barrier set)."; }
      else if (allocation[t.town]) {
        t.level = "Barriers"; t.crew = allocation[t.town];
        t.action = `${t.crew} erects barriers before 18:00. ${standby}`;
        t.steps.push(`Rule 6: ranked ${t.rank} (${t.pctOverP99}% vs P99) → ${t.crew}`);
      } else {
        t.level = "Standby (Barriers needed, no crew)";
        t.action = standby + ". Flagged to Area Manager (no crew place).";
        t.flags.push("Area Manager: at Barriers but no crew place available");
        t.steps.push(`Rule 6: ranked ${t.rank} (${t.pctOverP99}% vs P99) → no crew place left in its area`);
      }
    });

    const crewPlan = crews.map((c) => ({
      crew: c.name, active: c.active, area_tonight: c.area,
      towns: Object.entries(allocation).filter(([, v]) => v === c.name).map(([k]) => k),
    }));
    return {
      computedAt: now.toISOString(), towns, crewPlan, crewNotes, dataProblems,
      rehearsalInUse: towns.some((t) => t.rehearsal && t.rehearsal.length),
      areaManagerFlags: towns.filter((t) => (t.flags || []).some((f) => f.startsWith("Area Manager"))).map((t) => ({ town: t.town, flags: t.flags })),
    };
  }

  /* ---------- rule 8 ---------- */
  function studyAnswer(events) {
    const ranked = events.towns.slice().sort((a, b) => b.total_events - a.total_events || b.total_event_days - a.total_event_days);
    const top = ranked.filter((t) => t.total_events === ranked[0].total_events);
    return { ranked: ranked.map((t) => ({ town: t.town, total_events: t.total_events, first_four: t.first_four_events, last_four: t.last_four_events, trend: t.trend, event_days: t.total_event_days })), top: top.map((t) => t.town), tie: top.length > 1, first_four_winters: events.first_four, last_four_winters: events.last_four };
  }

  const api = { computeAdvice, studyAnswer, parseCSV, readNotes, LEVELS, CREWS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RiverWatchEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
