/* Ask the Control Tower — Q&A engine v1 (hardened Mon Oct 26, 2026;
 * the Wed Oct 28 "engine v1" milestone, pulled forward).
 *
 * ACCURACY BY CONSTRUCTION:
 *  - Answers are assembled ONLY from fact-store.json values (settled
 *    2026-10-26). Templates reference placeholders resolved by buildView();
 *    if any placeholder cannot be resolved, the engine REFUSES rather
 *    than improvising a number.
 *  - Every answer carries a Source line AND a Scope line (panel vs
 *    analysis set, cohort, years) — no number ships without its scope.
 *  - Out-of-set questions are refused, never improvised.
 *
 * MATCHING (v1 hardening over the scaffold's keyword counter):
 *  - Normalization: case/punctuation/hyphen variants collapse; institution
 *    name variants fold to canonical tokens ("UNC Wilmington",
 *    "UNC-Wilmington", "University of North Carolina Wilmington" -> "uncw").
 *  - Weighted intent scoring with synonyms (gap/difference/disparity/
 *    divide; drives/factors/predicts; ...). Exact bank questions keep a
 *    fast path.
 *  - Multi-part questions: clauses split on "?" / ";" / " and <question
 *    word>"; each strongly-matched clause is answered separately, each
 *    part with its own Source + Scope lines.
 *  - Near-miss questions: a weak-but-unique match, a spotlight institution
 *    (Harvard / Trine), a sector-specific Pell gap, or a year-specific
 *    horizon gap is answered with the closest supported fact, prefaced by
 *    a notice that names what is and isn't covered. Questions naming
 *    unsupported metrics (tuition, salary, debt, enrollment size),
 *    future values, unknown institutions, or institutional trivia are
 *    refused cleanly.
 *
 * META MODEL API LAYER (per verified event requirements — building with
 * Meta AI products is the event premise and 25% of the score):
 *  - phraseWithMeta() is the integration point. It receives ONLY the
 *    user's question + the already-assembled, fact-store-only answer, and
 *    may rephrase it. Its system prompt forbids introducing any number
 *    that is not in the supplied text.
 *  - STUB STATUS: disabled by default. It activates only when
 *    META_API_CONFIG is injected at deploy time (endpoint + key from the
 *    claimed participant credits). No key is ever committed to this repo.
 *    On ANY failure the deterministic answer ships unchanged — the demo
 *    can never break live.
 */

const META_API_CONFIG = window.META_API_CONFIG || { enabled: false, endpoint: "", apiKey: "" };

let FACTS = null;
let BANK = null;

/* Resolve every placeholder used in templates from the settled fact
 * store. This map is the audit trail: placeholder -> fact path. */
function buildView(fs) {
  const sh = fs.model.top_predictors_shap;
  const cl = Object.fromEntries(fs.peer_clusters.map(c => [c.label, c]));
  const hz = fs.equity_by_horizon.horizons;
  return {
    "equity_headline.pell_rate": fs.equity_headline.pell_rate,
    "equity_headline.nonpell_rate": fs.equity_headline.nonpell_rate,
    "equity_headline.gap_pp": fs.equity_headline.gap_pp,
    "equity_headline.median_institution_gap_pp": fs.equity_headline.median_institution_gap_pp,
    "model.top_predictor_shap": sh[0].shap,
    "model.second_predictor_shap": sh[1].shap,
    "model.mae_pp": fs.model.mae_pp,
    "model.r2": fs.model.r2,
    "model.naive_baseline_mae_pp": fs.model.naive_baseline_mae_pp,
    "spotlights.uncw.pell": fs.spotlights["UNC Wilmington"].pell,
    "spotlights.uncw.nonpell": fs.spotlights["UNC Wilmington"].nonpell,
    "spotlights.uncw.gap_pp": fs.spotlights["UNC Wilmington"].gap_pp,
    "spotlights.harvard.pell": fs.spotlights["Harvard"].pell,
    "spotlights.harvard.nonpell": fs.spotlights["Harvard"].nonpell,
    "spotlights.harvard.gap_pp": fs.spotlights["Harvard"].gap_pp,
    "spotlights.trine.pell": fs.spotlights["Trine University"].pell,
    "spotlights.trine.nonpell": fs.spotlights["Trine University"].nonpell,
    "spotlights.trine.gap_pp": fs.spotlights["Trine University"].gap_pp,
    "by_sector.grad_private_nonprofit": fs.by_sector.grad_rate["Private nonprofit"],
    "by_sector.grad_public": fs.by_sector.grad_rate["Public"],
    "by_sector.grad_for_profit": fs.by_sector.grad_rate["Private for-profit"],
    "by_sector.gap_for_profit": fs.by_sector.median_pell_gap_pp["Private for-profit"],
    "by_sector.gap_public": fs.by_sector.median_pell_gap_pp["Public"],
    "by_sector.gap_nonprofit": fs.by_sector.median_pell_gap_pp["Private nonprofit"],
    "trends.grad_2015": fs.trends.median_grad_rate_150["2015"],
    "trends.grad_2023": fs.trends.median_grad_rate_150["2023"],
    "trends.retention_range": fs.trends.median_retention.range,
    "equity_by_horizon.pell_gain": fs.equity_by_horizon.gain_4_to_8_years.pell_pp,
    "equity_by_horizon.nonpell_gain": fs.equity_by_horizon.gain_4_to_8_years.nonpell_pp,
    "horizons.gap_4": hz["4"].gap_pp,
    "horizons.pell_4": hz["4"].pell,
    "horizons.nonpell_4": hz["4"].nonpell,
    "clusters.small_access.grad": cl["Small access colleges"].grad_rate,
    "clusters.small_access.pell": cl["Small access colleges"].pell_share,
    "clusters.large_access.grad": cl["Large access-serving institutions"].grad_rate,
    "clusters.large_access.pell": cl["Large access-serving institutions"].pell_share,
    "clusters.mainstream.grad": cl["The mainstream middle"].grad_rate,
    "clusters.mainstream.pell": cl["The mainstream middle"].pell_share,
    "clusters.selective.grad": cl["Selective and well-resourced"].grad_rate,
    "clusters.selective.pell": cl["Selective and well-resourced"].pell_share,
    "race.asian": fs.race_medians_2023.Asian,
    "race.white": fs.race_medians_2023.White,
    "race.hispanic": fs.race_medians_2023.Hispanic,
    "race.black": fs.race_medians_2023.Black,
    "race.gap_wb": fs.race_medians_2023.gap_white_minus_black_pp,
    "scope.full_institution_years": fs.scope.full_panel.institution_years.toLocaleString("en-US"),
    "scope.full_institutions": fs.scope.full_panel.institutions.toLocaleString("en-US"),
    "scope.analysis_institution_years": fs.scope.analysis_set.institution_years.toLocaleString("en-US"),
    "scope.analysis_institutions": fs.scope.analysis_set.institutions.toLocaleString("en-US")
  };
}

function fillTemplate(template, view) {
  let missing = null;
  const out = template.replace(/\{([^}]+)\}/g, (m, key) => {
    if (!(key in view)) { missing = key; return m; }
    return String(view[key]);
  });
  return missing ? null : out;
}

/* ---------------- normalization ---------------- */

/* Stage 1: lowercase + fold institution variants + dashes to spaces.
 * Keeps "?" and ";" so clauses can be split before punctuation goes. */
function foldInstitutions(text) {
  let t = " " + text.toLowerCase() + " ";
  t = t.replace(/university of north carolina( at)? wilmington/g, " uncw ");
  t = t.replace(/unc[\s-]+wilmington/g, " uncw ");
  t = t.replace(/harvard university/g, " harvard ");
  t = t.replace(/trine university/g, " trine ");
  t = t.replace(/[–—-]+/g, " ");
  return t.replace(/\s+/g, " ");
}

/* Stage 2: strip remaining punctuation from one clause. */
function cleanClause(text) {
  return text.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(text) {
  return cleanClause(foldInstitutions(text));
}

/* ---------------- intent definitions ----------------
 * Terms are [phrase, weight] matched as substrings of the normalized
 * clause. STRONG is the score at which an intent answers outright;
 * below it, a unique best match is answered as a near-miss with a
 * closest-fact preface. Derived intents (spotlight, sector-gap,
 * horizons-detail) answer supported facts that have no bank question;
 * their templates live here and are filled through the same audited
 * buildView()/fillTemplate() path as the bank. */

const STRONG = 3;

const BANK_TERMS = {
  "pell-gap": [["pell gap", 4], ["pell", 2], ["non pell", 1], ["low income", 2], ["gap", 1], ["difference", 1], ["dispar", 1], ["divide", 1]],
  "top-predictor": [["predicts", 2], ["predict", 2], ["driver", 2], ["drives graduation", 3], ["drives", 2], ["factor", 2], ["influence", 2], ["matters most", 3], ["most important", 3], ["biggest", 2], ["retention", 2], ["come back", 2], ["second year", 2]],
  "model-accuracy": [["accurate", 3], ["accuracy", 3], ["error", 2], ["mae", 3], ["trust", 2], ["reliable", 2], ["believe", 1], ["prediction", 1], ["model", 1], ["off by", 2], ["how good", 2]],
  "uncw-compare": [["uncw", 4], ["wilmington", 3], ["compare", 2], ["compared", 2], ["stack up", 3], ["stacks up", 3], ["national picture", 2], ["rest of the country", 2], ["nationally", 1], ["other colleges", 1]],
  "sectors": [["sector", 3], ["sectors", 3], ["for profit", 3], ["nonprofit", 3], ["public", 1], ["private", 1], ["type of college", 2], ["types of colleges", 2], ["kind of school", 2], ["graduates the most", 3], ["graduate the most", 3], ["graduates more", 2], ["graduate more", 2], ["most students", 1]],
  "trend": [["trend", 3], ["improv", 3], ["over time", 3], ["over the years", 3], ["changed", 2], ["change", 1], ["better", 2], ["worse", 2], ["since 2015", 2], ["progress", 2], ["risen", 2], ["rose", 2]],
  "horizons": [["more time", 3], ["extra time", 3], ["longer", 2], ["horizon", 3], ["catch up", 3], ["close the gap", 3], ["more years", 2], ["given time", 2], ["wait longer", 2], ["eventually", 1]],
  "clusters": [["peer", 3], ["cluster", 3], ["clusters", 3], ["similar", 3], ["comparable", 2], ["groups of colleges", 2], ["types of institutions", 2], ["grouping", 2]],
  "race-gaps": [["race", 3], ["racial", 3], ["ethnic", 3], ["black", 3], ["hispanic", 3], ["asian", 3], ["white", 1], ["dispar", 1], ["minority", 2], ["students of color", 3]],
  "scope": [["how much data", 3], ["dataset", 3], ["data set", 3], ["sample", 2], ["based on", 2], ["how many institutions", 3], ["how many colleges", 3], ["data behind", 3], ["coverage", 2], ["panel", 1], ["data", 1]]
};

/* Per-intent scope lines: panel vs analysis set, cohort, years. Every
 * number in these strings also appears in the settled fact store. */
const SCOPE_LINES = {
  "pell-gap": "Scope: analysis set (four-year institutions, entering cohorts of 50 or more) — 2015 entering cohort, 8-year award rates, student-weighted.",
  "top-predictor": "Scope: analysis set — gradient-boosted model of 150% graduation rate; trained 2015–2019, tested 2021–2023.",
  "model-accuracy": "Scope: analysis set — gradient-boosted model of 150% graduation rate; trained 2015–2019, tested out of sample 2021–2023.",
  "uncw-compare": "Scope: institution spotlight — 8-year award rates, latest cohort, public IPEDS data; national figures from the analysis set, 2015 entering cohort.",
  "sectors": "Scope: pooled 2015–2023 — cohort-weighted 150% graduation rates; median institution-level Pell gaps by sector.",
  "trend": "Scope: median institution-level rates, four-year institutions — 2015 vs 2023.",
  "horizons": "Scope: analysis set — latest (2015) cohort, award rates at 4, 6 and 8 years after entry.",
  "clusters": "Scope: peer-cluster medians across four-year institutions in the panel.",
  "race-gaps": "Scope: median institution-level 150% graduation rates by race/ethnicity, 2023.",
  "scope": "Scope: full IPEDS panel vs four-year analysis set, 2015–2023.",
  "spotlight": "Scope: institution spotlight — 8-year award rates, latest cohort; public IPEDS data.",
  "sector-gap": "Scope: median institution-level Pell gaps by sector, pooled 2015–2023.",
  "horizons-detail": "Scope: analysis set — latest (2015) cohort, award rates by years since entry."
};

const PANEL_HOOKS = {
  "spotlight": "Spotlights / Peer clusters",
  "sector-gap": "By sector",
  "horizons-detail": "Equity gap (completion by horizon)"
};

/* Tie-break order when scores are equal: derived (more specific)
 * intents first, then bank intents in this order. */
const PRIORITY = ["spotlight", "sector-gap", "horizons-detail", "pell-gap", "race-gaps", "uncw-compare", "sectors", "horizons", "clusters", "top-predictor", "model-accuracy", "trend", "scope"];

/* Derived intents, keyed by institution token for spotlights. */
const SPOTLIGHT_INSTITUTIONS = {
  "harvard": { name: "Harvard", key: "harvard" },
  "trine": { name: "Trine University", key: "trine" }
};
const SPOTLIGHT_CONTEXT = [["pell", 1], ["gap", 1], ["graduation", 1], ["graduate", 1], ["finish", 1], ["award", 1], ["rate", 1], ["compare", 1], ["completion", 1]];
const SECTOR_ANCHORS = [["public", 2], ["nonprofit", 2], ["for profit", 2], ["private", 1], ["by sector", 2], ["sector", 2]];
const SECTOR_CONTEXT = [["pell", 1], ["gap", 1], ["smallest", 1], ["difference", 1], ["pell gap", 4]];
const HORIZON_ANCHORS = [["four years", 3], ["4 years", 3], ["year 4", 3], ["after four", 3], ["six years", 2], ["6 years", 2], ["year 6", 2]];
const HORIZON_CONTEXT = [["gap", 1], ["pell", 1]];

const DERIVED_TEMPLATES = {
  "sector-gap": "Median institution-level Pell gaps by sector: public institutions {by_sector.gap_public} points, private nonprofits {by_sector.gap_nonprofit}, and for-profits {by_sector.gap_for_profit} — smallest in for-profits, and not an equity win: completion there is low for everyone.",
  "horizons-detail": "The gap is there from the start. Four years after entry it stands at {horizons.gap_4} points (Pell {horizons.pell_4}% vs non-Pell {horizons.nonpell_4}%); by year eight it is {equity_headline.gap_pp} points ({equity_headline.pell_rate}% vs {equity_headline.nonpell_rate}%)."
};
const DERIVED_CITATIONS = {
  "sector-gap": "Median institution-level Pell gaps by sector, pooled 2015–2023.",
  "horizons-detail": "Award rates at 4 and 8 years after entry, latest (2015) cohort."
};

function spotlightTemplate(inst) {
  const k = SPOTLIGHT_INSTITUTIONS[inst].key;
  const name = SPOTLIGHT_INSTITUTIONS[inst].name;
  return name + " is one of the lab's spotlight institutions. Its Pell students finish at {spotlights." + k + ".pell}% within eight years, vs {spotlights." + k + ".nonpell}% for non-Pell students — a gap of {spotlights." + k + ".gap_pp} points.";
}

/* ---------------- guards: clean refusals ----------------
 * Checked before scoring. Refusals state no answer figures; the only
 * numbers a refusal may name are the covered period itself (2015–2023),
 * which is a settled fact-store value. */

const UNSUPPORTED_PATTERNS = [
  "tuition", "salary", "salaries", "starting pay", "debt", "football",
  "basketball", "cost to attend", "how much does it cost",
  "how many students", "students attend", "students are enrolled",
  "acceptance rate at", "admission rate at", "endowment",
  "president of", "who is the president", "mascot", "founded", "located"
];

const OTHER_INSTITUTIONS = [
  "duke", "stanford", "yale", "princeton", "columbia", "dartmouth",
  "cornell", "nc state", "north carolina state", "chapel hill",
  "east carolina", "appalachian", "elon", "wake forest", "caltech",
  "oxford", "cambridge", "mit"
];

function guardCheck(rawText, normText) {
  for (const p of UNSUPPORTED_PATTERNS) {
    if (normText.includes(p)) {
      return "That asks for something the verified fact set doesn't contain — it covers graduation outcomes, equity gaps, sectors, peer groups and data scope, not tuition, costs, earnings, enrollment counts or institutional trivia. That question is outside the verified fact set, so I won't improvise an answer.";
    }
  }
  if (/\b(202[7-9]|20[3-9][0-9])\b/.test(normText) || normText.includes("next year") || normText.includes("in the future") || normText.includes("forecast")) {
    return "That asks for a future value. The verified fact set covers 2015–2023 outcomes only, so that question is outside the verified fact set and I won't forecast beyond it.";
  }
  for (const name of OTHER_INSTITUTIONS) {
    if (normText.includes(name)) {
      return "That institution isn't one of the lab's spotlights, so it is outside the verified fact set. The set carries spotlights for Harvard, Trine University and UNC Wilmington, alongside national, sector and peer-cluster figures — I won't improvise beyond it.";
    }
  }
  const m = rawText.match(/(?:at|for|about|of)\s+([A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+){0,3})\s+(University|College|Institute)\b/);
  if (m) {
    const name = m[1].toLowerCase();
    if (!name.includes("north carolina") && !name.includes("harvard") && !name.includes("trine")) {
      return "That institution isn't one of the lab's spotlights, so it is outside the verified fact set. The set carries spotlights for Harvard, Trine University and UNC Wilmington, alongside national, sector and peer-cluster figures — I won't improvise beyond it.";
    }
  }
  return null;
}

/* ---------------- scoring ---------------- */

function termScore(clause, terms) {
  let score = 0, firstPos = Infinity;
  for (const [term, w] of terms) {
    const i = clause.indexOf(term);
    if (i >= 0) { score += w; if (i < firstPos) firstPos = i; }
  }
  return { score, firstPos };
}

/* Score one clause against every intent. Returns candidate objects:
 * { id, score, firstPos, derived, eligible, contextScore } */
function scoreClause(clause) {
  const out = [];
  for (const id of Object.keys(BANK_TERMS)) {
    const s = termScore(clause, BANK_TERMS[id]);
    if (s.score > 0) out.push({ id, score: s.score, firstPos: s.firstPos, derived: false, eligible: true });
  }
  // Spotlight derived intent: needs a spotlight institution token.
  for (const inst of Object.keys(SPOTLIGHT_INSTITUTIONS)) {
    const i = clause.indexOf(inst);
    if (i >= 0) {
      const ctx = termScore(clause, SPOTLIGHT_CONTEXT);
      out.push({ id: "spotlight", inst, score: 6 + ctx.score, firstPos: i, derived: true, eligible: true, contextScore: ctx.score });
    }
  }
  // Sector-gap derived intent: needs a sector anchor + gap context.
  {
    const a = termScore(clause, SECTOR_ANCHORS);
    const c = termScore(clause, SECTOR_CONTEXT);
    if (a.score > 0 && c.score > 0) {
      out.push({ id: "sector-gap", score: a.score + c.score, firstPos: Math.min(a.firstPos, c.firstPos), derived: true, eligible: true, contextScore: c.score });
    }
  }
  // Horizons-detail derived intent: needs a year anchor + gap context.
  {
    const a = termScore(clause, HORIZON_ANCHORS);
    const c = termScore(clause, HORIZON_CONTEXT);
    if (a.score >= 2 && c.score > 0) {
      out.push({ id: "horizons-detail", score: a.score + c.score, firstPos: Math.min(a.firstPos, c.firstPos), derived: true, eligible: true, contextScore: c.score });
    }
  }
  return out;
}

function pickBest(candidates) {
  let best = null;
  for (const c of candidates) {
    if (!best || c.score > best.score ||
        (c.score === best.score && PRIORITY.indexOf(c.id) < PRIORITY.indexOf(best.id))) {
      best = c;
    }
  }
  return best;
}

/* Split the stage-1 text into clauses on "?", ";" and on
 * " and <question word>" boundaries. */
const QUESTION_WORDS = ["what", "how", "which", "who", "does", "do", "is", "are", "can", "why", "tell"];
function splitClauses(stage1) {
  const rawParts = stage1.split(/[?;]+/);
  const clauses = [];
  for (const part of rawParts) {
    const andSplit = part.split(new RegExp("\\band\\s+(?=(?:" + QUESTION_WORDS.join("|") + ")\\b)", "g"));
    for (const piece of andSplit) {
      const c = cleanClause(piece);
      if (c) clauses.push(c);
    }
  }
  return clauses;
}

/* ---------------- answer assembly ---------------- */

const SOURCE_PREFIX = "Source: IPEDS Outcomes Lab panel, 2015–2023 — ";
const NEAR_PREFIX = "I don't have that exact breakdown in the verified fact set — the closest figures it does support are these, with their scope:";
const UNCW_METRIC_PREFIX = "The verified set doesn't carry UNC Wilmington's overall graduation rate — the closest figures are its eight-year award rates by Pell status, with their scope:";

function bankEntry(id) {
  return BANK.questions.find(q => q.id === id);
}

function buildPart(candidate, view) {
  let template, citation, panel;
  if (candidate.id === "spotlight") {
    template = spotlightTemplate(candidate.inst);
    citation = FACTS.spotlights.measure;
    panel = PANEL_HOOKS["spotlight"];
  } else if (candidate.derived) {
    template = DERIVED_TEMPLATES[candidate.id];
    citation = DERIVED_CITATIONS[candidate.id];
    panel = PANEL_HOOKS[candidate.id];
  } else {
    const q = bankEntry(candidate.id);
    if (!q) return null;
    template = q.template;
    citation = q.citation;
    panel = q.panel_hook;
  }
  const filled = fillTemplate(template, view);
  if (filled === null) return null;
  return {
    id: candidate.id,
    text: filled + "\n\n" + SOURCE_PREFIX + citation + "\n" + SCOPE_LINES[candidate.id],
    citation, panel
  };
}

function refusal(text) {
  return { text, citation: null, panel: null, ids: [], refused: true, nearMiss: false };
}

async function answerQuestion(text) {
  const view = buildView(FACTS);
  const stage1 = foldInstitutions(text);
  const norm = cleanClause(stage1);

  // Guards first: unsupported metrics, future values, unknown
  // institutions and trivia are refused even if keywords would match.
  const guarded = guardCheck(text, norm);
  if (guarded) return refusal(guarded);

  // Exact bank question fast path.
  for (const q of BANK.questions) {
    if (norm === normalize(q.question)) {
      const part = buildPart({ id: q.id, derived: false }, view);
      if (!part) return refusal("A figure behind that answer could not be verified against the fact store, so the answer is withheld rather than guessed.");
      const finalText = await phraseWithMeta(text, part.text);
      return { text: finalText, citation: part.citation, panel: part.panel, ids: [q.id], refused: false, nearMiss: false };
    }
  }

  // Multi-part: distinct strong intents across distinct clauses.
  const clauses = splitClauses(stage1);
  if (clauses.length > 1) {
    const strongParts = [];
    const seen = new Set();
    for (const clause of clauses) {
      const best = pickBest(scoreClause(clause));
      if (best && best.score >= STRONG && !seen.has(best.id)) {
        seen.add(best.id);
        strongParts.push(best);
      }
    }
    // The sectors template already names the smallest sector gap, so a
    // sector-gap part alongside it would only repeat the headline.
    const ids = strongParts.map(p => p.id);
    const parts = strongParts.filter(p => !(p.id === "sector-gap" && ids.includes("sectors")));
    if (parts.length > 1) {
      const built = [];
      for (const p of parts) {
        const b = buildPart(p, view);
        if (b) built.push(b);
      }
      if (built.length > 1) {
        const joined = built.map(b => b.text).join("\n\n");
        const finalText = await phraseWithMeta(text, joined);
        return {
          text: finalText,
          citation: built.map(b => b.citation).join(" · "),
          panel: built[0].panel,
          ids: built.map(b => b.id),
          refused: false, nearMiss: false
        };
      }
    }
  }

  // Single answer: score the whole question.
  const best = pickBest(scoreClause(norm));
  if (!best) {
    return refusal("That question is outside the verified fact set this assistant is allowed to use, so I won't improvise an answer. Try one of the suggested questions — every answer here is assembled only from cited IPEDS Outcomes Lab figures.");
  }
  const part = buildPart(best, view);
  if (!part) {
    return refusal("A figure behind that answer could not be verified against the fact store, so the answer is withheld rather than guessed.");
  }
  let prefix = "";
  let nearMiss = false;
  if (best.score < STRONG || (best.id === "spotlight" && best.contextScore === 0)) {
    prefix = NEAR_PREFIX + "\n\n";
    nearMiss = true;
  }
  if (best.id === "uncw-compare" && !norm.includes("pell") &&
      /(overall )?(graduation rate|grad rate|completion rate)/.test(norm)) {
    prefix = UNCW_METRIC_PREFIX + "\n\n";
    nearMiss = true;
  }
  const finalText = await phraseWithMeta(text, prefix + part.text);
  return { text: finalText, citation: part.citation, panel: part.panel, ids: [part.id], refused: false, nearMiss };
}

function trusteeAnswer() {
  const t = BANK.trustee_summary;
  return {
    text: t.text + "\n\n" + SOURCE_PREFIX + t.citation +
      "\nScope: headline figures — full panel (8,670 institutions) for coverage; equity and model figures from the analysis set.",
    citation: t.citation, panel: null, ids: ["trustee"], refused: false, nearMiss: false
  };
}

async function phraseWithMeta(question, assembledAnswer) {
  if (!META_API_CONFIG.enabled || !META_API_CONFIG.endpoint || !META_API_CONFIG.apiKey) {
    return assembledAnswer; // stub: deterministic answer ships
  }
  // TODO (build block, after credits are claimed and key configured):
  // POST to META_API_CONFIG.endpoint (Muse via Meta Model API) with:
  //   system: "You rephrase an already-verified answer into warmer plain
  //     language. You must not introduce, alter, round, or remove ANY
  //     number. You must keep the citation line unchanged. If the draft
  //     says the question is outside the verified fact set, return it
  //     unchanged."
  //   user: { question, draft: assembledAnswer }
  // On timeout/error/non-200: return assembledAnswer unchanged.
  return assembledAnswer;
}

/* ---------- page wiring (scaffold) ---------- */
async function init() {
  const [fsRes, bankRes] = await Promise.all([fetch("fact-store.json"), fetch("questions.json")]);
  FACTS = await fsRes.json();
  BANK = await bankRes.json();

  const chips = document.getElementById("suggested");
  for (const q of BANK.questions) {
    const b = document.createElement("button");
    b.textContent = q.question;
    b.addEventListener("click", () => ask(q.question));
    chips.appendChild(b);
  }
  document.getElementById("trustee").addEventListener("click", () => {
    render(trusteeAnswer().text, null);
  });
  document.getElementById("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    ask(document.getElementById("ask-input").value);
  });
}

async function ask(text) {
  if (!text || !text.trim()) return;
  render("…", null);
  const a = await answerQuestion(text);
  render(a.text, a.panel);
  // TODO (integration step, Oct 29 plan): if a.panel is set, scroll/highlight
  // the matching Control Tower panel.
}

function render(text, panel) {
  const el = document.getElementById("answer");
  el.textContent = text;
  el.dataset.panel = panel || "";
}

document.addEventListener("DOMContentLoaded", init);
