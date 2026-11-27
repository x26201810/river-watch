// Run: node tests/engine.test.js   (no dependencies)
const fs = require("fs"), path = require("path"), assert = require("assert");
const E = require("../engine.js");
const root = path.join(__dirname, "..");
const summary = JSON.parse(fs.readFileSync(path.join(root, "data/history_summary.json")));
const codes = JSON.parse(fs.readFileSync(path.join(root, "data/county_codes.json"))).codes;
const events = JSON.parse(fs.readFileSync(path.join(root, "data/events.json")));
const baseRows = E.parseCSV(fs.readFileSync(path.join(root, "River Watch Team Sheet - Towns.csv"), "utf8"));
const now = new Date("2026-11-27T15:00:00Z");

const flat = (v) => Object.fromEntries(summary.towns.map((t) => [t.town, { dates: ["2026-11-27", "2026-11-28", "2026-11-29"], values: [v(t), v(t), v(t)] }]));
const run = (rows, forecast, warnings = []) => E.computeAdvice({ sheetRows: rows, summary, forecast, warnings, countyCodes: codes, now });
const rowsWith = (edit) => baseRows.map((r) => ({ ...r, ...(edit[r.town] || {}) }));
const T = (out, name) => out.towns.find((t) => t.town === name);
let n = 0; const test = (name, fn) => { fn(); n++; console.log("ok -", name); };

test("CSV parses quoted thousands and all 8 towns", () => {
  assert.strictEqual(baseRows.length, 8);
  assert.strictEqual(T(run(baseRows, flat((t) => 1)), "Clonmel").sheet.sandbags, 2000);
});

test("Normal below P95, Standby at P95, Barriers at P99 (rule 3, 'at or above')", () => {
  const o1 = run(baseRows, flat((t) => t.p95_m3s - 0.1));
  assert(o1.towns.every((t) => t.level === "Normal"));
  const o2 = run(baseRows, flat((t) => t.p95_m3s));
  assert(o2.towns.every((t) => t.level === "Standby"));
  const o3 = run(rowsWith({}), flat((t) => (t.town === "Ennis" ? t.p99_m3s : 0)));
  assert.strictEqual(T(o3, "Ennis").level, "Barriers");
  assert.strictEqual(T(o3, "Ennis").crew, "Athlone crew");
});

test("Peak is the highest of the three days", () => {
  const f = flat(() => 0); f.Clonmel = { dates: ["a", "b", "c"], values: [10, 200, 20] };
  const o = run(baseRows, f);
  assert.strictEqual(T(o, "Clonmel").peak, 200);
  assert.strictEqual(T(o, "Clonmel").peakDate, "b");
});

test("Bandon at Barriers: no barrier set → Standby measures + Area Manager flag (rule 7)", () => {
  const o = run(baseRows, flat((t) => (t.town === "Bandon" ? 999 : 0)));
  const b = T(o, "Bandon");
  assert.match(b.level, /no set/);
  assert(b.flags.some((f) => /no barrier set/.test(f)));
  assert(!o.crewPlan.some((c) => c.towns.includes("Bandon")), "Bandon must not take a crew place");
});

test("Barrier set on loan in notes blocks barriers even if barrier_sets = 1", () => {
  const o = run(rowsWith({ Bandon: { barrier_sets: "1" } }), flat((t) => (t.town === "Bandon" ? 999 : 0)));
  assert.match(T(o, "Bandon").level, /no set/);
});

test("Mallow crew restricted to Mallow by notes: Fermoy goes to Clonmel crew", () => {
  const o = run(baseRows, flat((t) => (t.town === "Fermoy" || t.town === "Mallow" ? t.p99_m3s * 2 : 0)));
  assert.strictEqual(T(o, "Mallow").crew, "Mallow crew");
  assert.strictEqual(T(o, "Fermoy").crew, "Clonmel crew");
});

test("Crew overflow: ranking by % over P99, loser flagged (rule 6)", () => {
  // Clonmel crew area this night: Clonmel, Fermoy, Enniscorthy (Mallow crew is Mallow-only)
  const pct = { Clonmel: 1.10, Fermoy: 1.50, Enniscorthy: 1.30 };
  const o = run(baseRows, flat((t) => (pct[t.town] ? t.p99_m3s * pct[t.town] : 0)));
  assert.strictEqual(T(o, "Fermoy").crew, "Clonmel crew");
  assert.strictEqual(T(o, "Enniscorthy").crew, "Clonmel crew");
  assert.match(T(o, "Clonmel").level, /no crew/);
  assert(o.areaManagerFlags.some((f) => f.town === "Clonmel"));
});

test("Tie on % goes to the higher forecast peak", () => {
  const o = run(baseRows, flat((t) => (["Clonmel", "Fermoy", "Enniscorthy"].includes(t.town) ? t.p99_m3s * 1.2 : 0)));
  // Clonmel has the highest P99 so the highest peak at equal %; Enniscorthy the lowest
  assert.match(T(o, "Enniscorthy").level, /no crew/);
});

test("Without the Mallow note, Fermoy can use the Mallow crew (matching, not greedy)", () => {
  const rows = rowsWith({ Mallow: { notes: "Normal service" } });
  const pct = { Clonmel: 1.1, Fermoy: 1.5, Enniscorthy: 1.3 };
  const o = run(rows, flat((t) => (pct[t.town] ? t.p99_m3s * pct[t.town] : 0)));
  assert(["Barriers"].includes(T(o, "Clonmel").level), "all three get crews");
  assert.strictEqual(T(o, "Fermoy").crew, "Mallow crew");
});

test("Orange rain warning on second county (Roscommon) raises Athlone and Carrick (rule 4)", () => {
  const w = [{ type: "Rain", level: "orange", onset: "2026-11-28T06:00:00Z", expiry: "2026-11-28T18:00:00Z", regions: ["EI24"], headline: "Orange rain Roscommon" }];
  const o = run(baseRows, flat(() => 0), w);
  assert.strictEqual(T(o, "Athlone").level, "Standby");
  assert.strictEqual(T(o, "Carrick-on-Shannon").level, "Standby");
  assert.strictEqual(T(o, "Ennis").level, "Normal");
});

test("Yellow changes nothing; wind and out-of-window warnings ignored", () => {
  const w = [
    { type: "Rain", level: "yellow", onset: "2026-11-27T16:00:00Z", expiry: "2026-11-28T06:00:00Z", regions: ["EI04"] },
    { type: "Wind", level: "red", onset: "2026-11-27T16:00:00Z", expiry: "2026-11-28T06:00:00Z", regions: ["EI04"] },
    { type: "Rain", level: "red", onset: "2026-11-30T16:00:00Z", expiry: "2026-12-01T06:00:00Z", regions: ["EI04"] },
    { type: "Rain", level: "red", onset: "2026-11-26T00:00:00Z", expiry: "2026-11-27T12:00:00Z", regions: ["EI04"] },
  ];
  const o = run(baseRows, flat(() => 0), w);
  ["Fermoy", "Mallow", "Bandon"].forEach((t) => assert.strictEqual(T(o, t).level, "Normal"));
  assert.strictEqual(T(o, "Mallow").warnings.length, 1);
});

test("Warning raises Standby to Barriers; never above Barriers", () => {
  const w = [{ type: "Rain", level: "red", onset: "2026-11-27T16:00:00Z", expiry: "2026-11-28T06:00:00Z", regions: ["EI03"] }];
  const o = run(baseRows, flat((t) => (t.town === "Ennis" ? t.p95_m3s : t.town === "Clonmel" ? 999 : 0)), w);
  assert.strictEqual(T(o, "Ennis").level, "Barriers");
});

test("Rehearsal values: flow override and warning override, and they are reported", () => {
  const rows = rowsWith({ Clonmel: { flow_override_m3s: "150" }, Ennis: { warning_override: "Orange" } });
  const o = run(rows, flat(() => 1));
  assert.strictEqual(T(o, "Clonmel").peak, 150);
  assert.strictEqual(T(o, "Clonmel").level, "Barriers");
  assert.strictEqual(T(o, "Ennis").level, "Standby");
  assert(o.rehearsalInUse);
  assert(T(o, "Clonmel").rehearsal.length && T(o, "Ennis").rehearsal.length);
});

test("Changing crew_based_here to no removes that crew", () => {
  const rows = rowsWith({ Athlone: { crew_based_here: "no" } });
  const o = run(rows, flat((t) => (t.town === "Athlone" ? 999 : 0)));
  assert.match(T(o, "Athlone").level, /no crew/);
});

test("Missing forecast is reported, not guessed", () => {
  const f = flat(() => 1); delete f.Bandon;
  const o = run(baseRows, f);
  assert.strictEqual(T(o, "Bandon").level, null);
  assert(o.dataProblems.length);
});

test("Rule 8: Ennis has the most events; last four vs first four", () => {
  const a = E.studyAnswer(events);
  assert.deepStrictEqual(a.top, ["Ennis"]);
  const ennis = a.ranked[0];
  assert.strictEqual(ennis.total_events, 17);
  assert(ennis.last_four > ennis.first_four);
});

test("A note the code cannot read is flagged, not ignored; starter notes are all understood", () => {
  const o0 = run(baseRows, flat(() => 1));
  assert(o0.towns.every((t) => !(t.flags || []).some((f) => f.startsWith("Note not understood"))));
  const o = run(rowsWith({ Ennis: { notes: "Quay wall repairs this week" } }), flat(() => 1));
  assert((T(o, "Ennis").flags || []).some((f) => f.startsWith("Note not understood")));
});

console.log(`\n${n} tests passed`);
