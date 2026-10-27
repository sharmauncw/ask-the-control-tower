# Ask the Control Tower — build scaffold

Scaffold stood up Mon Oct 26, 2026 (event Day 1), after the official-rules
read in `../event-requirements-verified-2026-10-26.md`.

## Files
- `index.html` — standalone assistant page (integrates into the live Control
  Tower page at the Oct 29 step).
- `app.js` — Q&A engine + Meta Model API phrasing layer (stubbed, see below).
- `fact-store.json` — the SETTLED fact store (copy of
  `../fact-store-settled-2026-10-26.json`). The only numbers the assistant
  may state.
- `questions.json` — the 10-question bank + trustee summary. Templates are
  filled exclusively from `fact-store.json` via the audited placeholder map
  in `app.js` (`buildView`).

## Architecture (accuracy by construction)
1. Question → matched to the bank (exact or keyword match).
2. Answer assembled from fact-store values only; an unresolvable placeholder
   withholds the answer instead of guessing.
3. Citation line appended to every answer.
4. Unmatched questions get an explicit "outside the verified fact set"
   response — never an improvised figure.

## Engine v1 (Mon Oct 26, 2026 — the Oct 28 milestone, pulled forward)
`app.js` matching was hardened beyond the scaffold's keyword counter:
- **Normalization + variants:** case/punctuation/hyphen variants collapse;
  institution variants fold to canonical tokens ("UNC Wilmington",
  "UNC-Wilmington", "University of North Carolina Wilmington" → `uncw`).
- **Weighted intent scoring with synonyms** (gap/difference/disparity/
  divide; drives/factors/predicts; trust/error; …), exact bank questions
  keep a fast path.
- **Multi-part questions** are split into clauses; each strongly matched
  clause is answered separately, each part with its own Source + Scope.
- **Near-miss questions** answer the closest supported fact with a
  closest-fact preface that names the scope — including three derived
  intents with no bank question: spotlight institutions (Harvard, Trine),
  sector-specific Pell gaps, and the year-4 horizon gap.
- **Citation discipline:** every answer carries a Source line AND a Scope
  line (panel vs analysis set, cohort, years).
- **Clean refusals:** unsupported metrics (tuition, salary, debt,
  enrollment size, acceptance-rate values), future values, unknown
  institutions, and institutional trivia are refused before scoring.

## Tests
`tests/engine-test.js` (Node, no dependencies) runs the engine headlessly:
the full bank verbatim, 18 paraphrases, 3 multi-part questions, 6
near-miss questions, 7 out-of-set probes, and the trustee summary —
45 cases. It asserts every rendered number exists in
`../fact-store-settled-2026-10-26.json`, that 16.3 appears only as the
naive-baseline MAE, that every answer carries Source + Scope lines, and
that out-of-set probes are refused. Run: `node tests/engine-test.js`.
Latest output: `tests/engine-test-output.log` (45 passed, 0 failed).

## Meta Model API layer — STUB, by design
Verified event rules make building with Meta AI products the event premise,
and "Use of Meta AI Tooling" is 25% of the score. `phraseWithMeta()` in
`app.js` is the integration point: it receives the question + the assembled
verified answer and may rephrase it under a system prompt that forbids
introducing or altering any number and requires the citation to survive
unchanged. It is **disabled until** the $150 participant credits are claimed
and an endpoint + key are injected at deploy time via `window.META_API_CONFIG`
(never committed). Any API failure falls back to the deterministic answer —
the demo cannot break live.

## Run locally
Any static server from this folder, e.g. `python3 -m http.server` — then open
`index.html`. No build step, no keys needed for the deterministic path.

## TODO in-window (per build plan)
- Oct 27: Akanksha approves question bank (already drafted; facts settled).
- Oct 28: engine v1 review — DONE EARLY (Oct 26): hardened matching +
  number-integrity test suite (see "Engine v1" and "Tests" above).
- Oct 29: integrate ask box into the Control Tower page + panel highlighting
  (`data-panel` hook is already emitted by the engine).
- Oct 30: claim credits, wire the real Muse endpoint into
  `phraseWithMeta()`, verify no-number-drift on all 10 answers; phone-size pass.
- Oct 31: polish + demo video take 1 (video is scored — Demo = 25%; max
  length not published, confirm in-portal).
- Nov 2: dry-run the real submission form at
  cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
  (fields are not publicly visible before login).
