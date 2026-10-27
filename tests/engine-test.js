#!/usr/bin/env node
/* Number-integrity + matching test for Ask the Control Tower (engine v1).
 *
 * Runs app.js headlessly (Node vm, stubbed window/document/fetch) against:
 *   - the full 10-question bank, verbatim
 *   - paraphrase variants (case/punctuation, synonyms, name variants)
 *   - multi-part questions
 *   - near-miss questions (closest supported fact, scope named)
 *   - out-of-set probes (must be refused, never improvised)
 *   - the trustee summary
 *
 * Assertions for EVERY case:
 *   (a) every numeric token in the answer is a number that appears in
 *       fact-store-settled-2026-10-26.json (values, string contents, or
 *       object keys) — nothing rendered that the store doesn't hold;
 *   (b) "16.3" appears ONLY as the naive-baseline MAE in the
 *       model-accuracy answer, and every Pell-gap answer states 16.4;
 *   (c) out-of-set probes are refused with the "outside the verified
 *       fact set" marker and no Source line;
 *   (d) every non-refused answer carries the Source line AND a Scope:
 *       line (panel vs analysis set, cohort, years);
 *   (e) the matched intent ids equal the expected ids.
 *
 * Run: node tests/engine-test.js   (exit 1 on any failure)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BUILD = path.join(__dirname, "..");
const SETTLED = path.join(BUILD, "..", "fact-store-settled-2026-10-26.json");

/* ---------- allowed numbers, from the SETTLED fact store ---------- */
function extractNumbers(str, set) {
  const re = /(\d[\d,]*(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(str)) !== null) set.add(parseFloat(m[1].replace(/,/g, "")));
}
function collectAllowed(node, set) {
  if (typeof node === "number") { set.add(node); return; }
  if (typeof node === "string") { extractNumbers(node, set); return; }
  if (Array.isArray(node)) { node.forEach(v => collectAllowed(v, set)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) { extractNumbers(k, set); collectAllowed(v, set); }
  }
}
const allowed = new Set();
collectAllowed(JSON.parse(fs.readFileSync(SETTLED, "utf8")), allowed);

function answerNumbers(text) {
  const out = [];
  const re = /(\d[\d,]*(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ raw: m[1], value: parseFloat(m[1].replace(/,/g, "")) });
  return out;
}
const inAllowed = v => [...allowed].some(a => Math.abs(a - v) < 1e-9);

/* ---------- load the engine headlessly ---------- */
let domCallback = null;
const ctx = {
  console,
  setTimeout,
  window: {},
  document: {
    addEventListener(ev, cb) { if (ev === "DOMContentLoaded") domCallback = cb; },
    getElementById() { return { appendChild() {}, addEventListener() {}, dataset: {} }; },
    createElement() { return { addEventListener() {}, textContent: "" }; }
  },
  fetch: async url => ({ json: async () => JSON.parse(fs.readFileSync(path.join(BUILD, url), "utf8")) })
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(BUILD, "app.js"), "utf8"), ctx, { filename: "app.js" });
vm.runInContext(`
  globalThis.__run = async (casesJson) => {
    while (typeof FACTS === "undefined" || !FACTS || !BANK) {
      await new Promise(r => setTimeout(r, 5));
    }
    const cases = JSON.parse(casesJson);
    const out = [];
    for (const c of cases) {
      if (c.type === "trustee") {
        const t = trusteeAnswer();
        out.push({ name: c.name, text: t.text, ids: t.ids, refused: !!t.refused, nearMiss: !!t.nearMiss });
      } else {
        const a = await answerQuestion(c.q);
        out.push({ name: c.name, text: a.text, ids: a.ids || [], refused: !!a.refused, nearMiss: !!a.nearMiss });
      }
    }
    return out;
  };`, ctx);
if (domCallback) domCallback();

/* ---------- cases ---------- */
const BANK_QS = [
  ["bank/pell-gap", "What's the Pell graduation gap?", ["pell-gap"]],
  ["bank/top-predictor", "What predicts graduation most?", ["top-predictor"]],
  ["bank/model-accuracy", "How accurate is the model?", ["model-accuracy"]],
  ["bank/uncw-compare", "How does UNC Wilmington compare to the national picture?", ["uncw-compare"]],
  ["bank/sectors", "Which sector graduates the most students — and which has the smallest Pell gap?", ["sectors"]],
  ["bank/trend", "Has graduation improved over time?", ["trend"]],
  ["bank/horizons", "Does giving students more time close the Pell gap?", ["horizons"]],
  ["bank/clusters", "What do peer institutions look like?", ["clusters"]],
  ["bank/race-gaps", "How big are the racial graduation gaps?", ["race-gaps"]],
  ["bank/scope", "How much data is this based on?", ["scope"]]
];
const PARAPHRASES = [
  ["para/case-punct", "WHAT IS THE PELL GRADUATION GAP?!", ["pell-gap"]],
  ["para/synonym-difference", "What's the difference in completion between Pell and non-Pell students?", ["pell-gap"]],
  ["para/low-income-divide", "How big is the low-income graduation divide?", ["pell-gap"]],
  ["para/factor-matters-most", "Which factor matters most for whether students graduate?", ["top-predictor"]],
  ["para/drives", "What drives graduation rates?", ["top-predictor"]],
  ["para/trust-predictions", "Can I trust the model's predictions?", ["model-accuracy"]],
  ["para/error", "How much error is there in the model's graduation-rate estimates?", ["model-accuracy"]],
  ["para/uncw-stack-up", "How does UNC Wilmington stack up against the rest of the country?", ["uncw-compare"]],
  ["para/uncw-abbrev", "Compare UNCW with the national picture.", ["uncw-compare"]],
  ["para/public-private", "Do public or private colleges graduate more students?", ["sectors"]],
  ["para/type-of-college", "Which type of college graduates the most students?", ["sectors"]],
  ["para/better-over-years", "Have graduation rates gotten better over the years?", ["trend"]],
  ["para/extra-time-catch-up", "Does extra time help Pell students catch up?", ["horizons"]],
  ["para/similar-institutions", "What do similar institutions look like?", ["clusters"]],
  ["para/by-race", "What do graduation rates look like by race?", ["race-gaps"]],
  ["para/black-hispanic", "What were 2023 graduation rates for Black and Hispanic students?", ["race-gaps"]],
  ["para/how-many-institutions", "How many institutions is this based on?", ["scope"]],
  ["para/dataset-behind", "Tell me about the dataset behind these answers.", ["scope"]]
];
const MULTI = [
  ["multi/gap+accuracy", "What's the Pell gap, and how accurate is the model?", ["pell-gap", "model-accuracy"]],
  ["multi/uncw+sectors", "How does UNC Wilmington compare nationally, and which sector graduates the most students?", ["uncw-compare", "sectors"]],
  ["multi/trend+predictor", "Has graduation improved over time, and what predicts it?", ["trend", "top-predictor"]]
];
const NEAR_MISS = [
  ["near/harvard-gap", "What's the Pell gap at Harvard?", ["spotlight"], { nearMiss: false, contains: ["Harvard", "96.6"] }],
  ["near/public-gap", "What is the Pell gap for public colleges?", ["sector-gap"], { nearMiss: false, contains: ["7.5"] }],
  ["near/gap-after-4-years", "How big is the Pell gap after four years?", ["horizons-detail"], { nearMiss: false, contains: ["14.6"] }],
  ["near/uncw-overall-rate", "What is UNC Wilmington's overall graduation rate?", ["uncw-compare"], { nearMiss: true, contains: ["67.3"] }],
  ["near/trine-bare", "Tell me about Trine University.", ["spotlight"], { nearMiss: true, contains: ["Trine", "52.5"] }],
  ["near/retention-matter", "Does retention really matter that much?", ["top-predictor"], { nearMiss: true, contains: ["9.49"] }]
];
const OUT_OF_SET = [
  ["oos/tuition", "What is the tuition at Harvard?"],
  ["oos/enrollment", "How many students attend UNC Wilmington?"],
  ["oos/salary", "What is the average starting salary for graduates?"],
  ["oos/football", "Which college has the best football team?"],
  ["oos/future-2030", "What will the Pell gap be in 2030?"],
  ["oos/duke", "What's the Pell gap at Duke University?"],
  ["oos/president", "Who is the president of UNCW?"]
];

const cases = [];
for (const [name, q, ids] of [...BANK_QS, ...PARAPHRASES, ...MULTI]) cases.push({ name, q, expect: { ids, refused: false } });
for (const [name, q, ids, extra] of NEAR_MISS) cases.push({ name, q, expect: { ids, refused: false, ...extra } });
for (const [name, q] of OUT_OF_SET) cases.push({ name, q, expect: { ids: [], refused: true } });
cases.push({ name: "trustee/summary", type: "trustee", expect: { ids: ["trustee"], refused: false } });

/* ---------- run + assert ---------- */
(async () => {
  const results = await vm.runInContext(`__run(${JSON.stringify(JSON.stringify(cases.map(({ name, q, type }) => ({ name, q, type }))))})`, ctx);
  let pass = 0, fail = 0;
  const failures = [];
  results.forEach((r, i) => {
    const exp = cases[i].expect;
    const problems = [];
    // (e) routing
    const gotIds = [...r.ids].sort().join(",");
    const wantIds = [...exp.ids].sort().join(",");
    if (gotIds !== wantIds) problems.push(`intent ids: expected [${wantIds}], got [${gotIds}]`);
    if (!!exp.refused !== r.refused) problems.push(`refused: expected ${!!exp.refused}, got ${r.refused}`);
    if (exp.nearMiss !== undefined && exp.nearMiss !== r.nearMiss) problems.push(`nearMiss: expected ${exp.nearMiss}, got ${r.nearMiss}`);
    if (exp.contains) for (const s of exp.contains) if (!r.text.includes(s)) problems.push(`answer missing expected content "${s}"`);
    // (a) number integrity — applies to every output, refusals included
    for (const n of answerNumbers(r.text)) {
      if (!inAllowed(n.value)) problems.push(`number not in settled fact store: "${n.raw}" (=${n.value})`);
    }
    // (b) 16.3 discipline
    if (r.text.includes("16.3") && !r.ids.includes("model-accuracy")) {
      problems.push(`"16.3" appears outside the model-accuracy answer (ids: ${r.ids.join(",") || "none"})`);
    }
    if (r.ids.includes("model-accuracy") && r.text.includes("16.3") && !/naive/i.test(r.text)) {
      problems.push(`"16.3" in model-accuracy answer is not framed as the naive baseline`);
    }
    if (r.ids.includes("pell-gap")) {
      if (!r.text.includes("16.4")) problems.push(`pell-gap answer does not state 16.4`);
      // In a multi-part answer that also includes model-accuracy, "16.3"
      // may appear — but only in its naive-baseline framing (asserted
      // above). As the Pell gap itself it may never appear.
      if (r.text.includes("16.3") && !r.ids.includes("model-accuracy")) {
        problems.push(`pell-gap answer contains 16.3`);
      }
    }
    // (c) refusals: marker present, no Source line
    if (r.refused) {
      if (!r.text.includes("outside the verified fact set")) problems.push(`refusal lacks the "outside the verified fact set" marker`);
      if (r.text.includes("Source:")) problems.push(`refusal unexpectedly carries a Source line`);
    }
    // (d) answers: Source + Scope lines mandatory
    if (!r.refused) {
      if (!r.text.includes("Source: IPEDS Outcomes Lab panel, 2015–2023")) problems.push(`answer lacks the Source line`);
      if (!r.text.includes("Scope:")) problems.push(`answer lacks a Scope line`);
    }
    if (problems.length === 0) {
      pass++;
      console.log(`PASS  ${r.name}`);
    } else {
      fail++;
      console.log(`FAIL  ${r.name}`);
      for (const p of problems) console.log(`      - ${p}`);
      failures.push({ name: r.name, q: cases[i].q || "(trustee)", problems, text: r.text });
    }
  });
  console.log(`\n${pass} passed, ${fail} failed, ${results.length} total`);
  if (failures.length) {
    console.log(`\n--- failure detail (verbatim) ---`);
    for (const f of failures) {
      console.log(`\n[${f.name}] Q: ${f.q}`);
      for (const p of f.problems) console.log(`  * ${p}`);
      console.log(`  answer: ${JSON.stringify(f.text)}`);
    }
    process.exit(1);
  }
})().catch(e => { console.error("TEST HARNESS ERROR:", e); process.exit(2); });
