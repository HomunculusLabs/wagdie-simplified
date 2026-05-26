# GM Narrative Quality Optimization Runs

## Goal

Optimize location-room TTRPG GM story quality using one primary metric:

**GM Narrative Quality Score (GNQS): 0-100**

Continuity matters, but exact plot determinism is not required. A valid TTRPG transcript may fork unpredictably if the GM preserves consequences, stakes, active choices, declared actions, and prior outcomes.

## Stop Criteria

Stop after the first condition is met:

1. Oracle/user satisfied with quality.
2. Live Crow's Den warnings are zero or near-zero without deterministic harness regressions.
3. Maximum 5 optimization loops completed.

## Score Formula

| Submetric | Weight |
|---|---:|
| Roll/outcome integrity | 10 |
| Narration/outcome substance | 15 |
| Failure consequence strength | 15 |
| Agency/choice affordance | 15 |
| Continuity pressure | 20 |
| Check variety | 10 |
| Repetition freshness | 10 |
| Character affordance | 5 |
| **Total** | **100** |

## Commands

### Deterministic CI-safe harness

```bash
bun run narrative:harness:test
```

### Live/static transcript evaluator

```bash
bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000
```

### Live/fresh tick evaluator

```bash
NARRATIVE_EVAL_TRIGGER_TICKS=10 NARRATIVE_EVAL_COOKIE='...' \
bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000
```

### Correctness guardrails

```bash
bun run test -- tests/lib/eliza/location-room-scene-checks.test.ts tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand
bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand
bun run build
```

Note: `bun run build` is recorded but does not replace focused Jest validation.

## Baseline Records

| Run ID | Date | Source | Sample | GNQS | Key warnings / failure | Decision |
|---|---|---|---:|---:|---|---|
| baseline-harness-1 | 2026-05-26 | deterministic harness | 10 scenarios x 30 ticks | 98 | none | Establish CI baseline |
| baseline-harness-2 | 2026-05-26 | deterministic harness | 10 scenarios x 30 ticks | 98 | none | Confirms deterministic repeatability |
| baseline-harness-3 | 2026-05-26 | deterministic harness | 10 scenarios x 30 ticks | 98 | none | Confirms deterministic repeatability |
| baseline-live-static-crows-den | 2026-05-26 | live/static Crow's Den via localhost | unavailable | N/A | `bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000` failed: `fetch failed`; `curl -v 'http://localhost:3000/api/eliza/location-rooms/11?page=1&pageSize=300'` confirmed connection refused on `::1:3000` and `127.0.0.1:3000` | No live localhost server reachable; keep scout warnings as current live target |
| baseline-live-fresh-1 | TBD | live Crow's Den fresh ticks | 10 triggered ticks | TBD | Pending tick enablement/auth; do not fix in setup phase | Pending |
| baseline-live-fresh-2 | TBD | live Crow's Den fresh ticks | 10 triggered ticks | TBD | Pending tick enablement/auth; do not fix in setup phase | Pending |
| baseline-live-fresh-3 | TBD | live Crow's Den fresh ticks | 10 triggered ticks | TBD | Pending tick enablement/auth; do not fix in setup phase | Pending |
| post-loop-2-live-static-crows-den | 2026-05-26 | live/static Crow's Den via localhost proxy | 76 public messages | 72 | `GM narration too short on average (156)`; `check variety too narrow (2)`; `same check type repeated 8 times in a row`; score warning `GNQS below minimum (72 < 75)` | Measurement command now succeeds; remaining issues are transcript quality warnings, not fetch blockers |

## Loop 0 Deterministic Baseline Details

All three deterministic runs produced identical aggregate output.

| Field | Value |
|---|---:|
| GNQS | 98 |
| Grade | excellent |
| Total messages | 700 |
| GM messages | 400 |
| Character messages | 300 |
| Roll cards | 100 |
| GM outcomes | 100 |
| Completed ticks | 300 |
| Failed ticks | 0 |
| Avg GM narration chars | 343 |
| Avg outcome chars | 500 |
| Unique speakers | 30 |
| Unique check types | 6 |
| Repeated check-type max run | 2 |
| Failure outcomes | 72 |
| Weak failure outcomes | 0 |
| Repeated outcome openings | 1 |

### Aggregate GNQS Submetrics

| Submetric | Score |
|---|---:|
| Roll/outcome integrity | 100 |
| Narration/outcome substance | 100 |
| Failure consequence strength | 100 |
| Agency/choice affordance | 85 |
| Continuity pressure | 100 |
| Check variety | 100 |
| Repetition freshness | 99 |
| Character affordance | 100 |

### Per-scenario GNQS Range

- Minimum scenario GNQS: 97
- Maximum scenario GNQS: 98
- Warnings: none for all scenarios

## Current Known Live Scout Metrics

These are pre-instrumentation scout metrics from the setup plan, retained as the live warning target until localhost or an authenticated live environment is available.

- Location: Crow's Den (`11`)
- Messages: 50
- GM messages: 20
- Character messages: 30
- Roll cards: 14
- GM outcomes: 14
- Avg GM narration chars: 143
- Avg GM outcome chars: 107
- Unique speakers: 6
- Unique check types: 2
- Repeated check-type max run: 9
- Failure outcomes: 7
- Weak failure outcomes: 7
- Repeated outcome openings: 8
- Fresh tick trigger status: previously blocked by HTTP 503, `Location room ticks are disabled`

## Optimization Candidates

| Rank | Candidate | Expected lift | Risk | Status |
|---:|---|---|---|---|
| 1 | Strengthen scene-check failure/partial consequence contract and fallback | Failure consequence strength, outcome substance, continuity pressure | Medium: may over-punish or over-narrate | Implemented in Loop 1 |
| 2 | Publish public GM agency framing when adventure pressure changes | Agency, continuity, narration substance, character affordance | Medium/high: may crowd transcript or expose private state | Pending; not implemented in Loop 0 |
| 3 | Reduce check-type overuse and repeated outcome openings | Check variety, repetition freshness | Low/medium: may choose less natural checks | Pending; not implemented in Loop 0 |

## Loop Log

### Loop 0 — Instrumentation + Baseline

**Change:** Added shared GNQS scoring to deterministic harness and live evaluator only. No GM prompt/output optimization was applied.

**Files touched:**
- `scripts/location-room-narrative-quality.ts`
- `tests/lib/eliza/location-room-narrative-harness.ts`
- `tests/lib/eliza/location-room-narrative-harness.test.ts`
- `scripts/location-room-narrative-eval.ts`
- `prompt-exports/optimize-gm-narrative-quality-runs.md`

**Results:**

| Measurement | GNQS | Notes |
|---|---:|---|
| deterministic harness run 1 | 98 | pass, no warnings |
| deterministic harness run 2 | 98 | pass, no warnings |
| deterministic harness run 3 | 98 | pass, no warnings |
| live static Crow's Den | N/A | localhost unavailable; evaluator failed with `fetch failed`; curl confirmed connection refused |
| live fresh median | N/A | not attempted; tick enablement/auth unavailable and out of scope |

**Variance / reliability notes:**
- Deterministic harness variance: 0 GNQS points across 3 runs.
- Deterministic scenario score range: 97-98.
- Live/static measurement reliability: unavailable because no localhost server was listening on port 3000.
- Live/fresh tick reliability: not assessed in setup phase; previous scout indicated ticks disabled via HTTP 503.

**Guardrail results:**

| Command | Status | Notes |
|---|---|---|
| `bun run test -- tests/lib/eliza/location-room-scene-checks.test.ts tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand` | pass | 2 suites, 24 tests passed |
| `bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand` | pass | 1 suite, 15 tests passed |
| `bun run build` | pass | Next build succeeded; output noted type validation and linting were skipped by project config |

**Decision:** Instrumentation and baseline landed. Do not proceed to Candidate #1/#2/#3 until the next optimization loop decision.

### Loop 1 — Candidate #1

**Candidate:** Strengthen scene-check consequence quality.

**Change summary:** Strengthened `gameMasterGenerator.ts` scene-check outcome validation so `partial_success`, `failure`, and `critical_failure` public narration must be substantive (180+ normalized chars), consequence-bearing, and agency-preserving. Upgraded deterministic fallback scene-check outcome narration for failure tiers so fallback failures/critical failures include visible complications, pressure/danger, and a next choice. Added focused generator tests for weak public narration rejection, durable private consequence with weak public text rejection, strong failure narration acceptance, and fallback failure-tier quality.

**Files touched in Loop 1:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `prompt-exports/optimize-gm-narrative-quality-runs.md`

**Results:**

| Measurement | Before | After | Delta |
|---|---:|---:|---:|
| deterministic GNQS | 98 | 98 | 0 |
| live median GNQS | N/A | N/A | N/A |
| weak failure outcomes | 0 deterministic / 7 scout live | 0 deterministic / live unavailable | 0 deterministic / live N/A |
| avg outcome chars | 500 deterministic / 107 scout live | 500 deterministic / live unavailable | 0 deterministic / live N/A |
| repeated openings | 1 deterministic / 8 scout live | 1 deterministic / live unavailable | 0 deterministic / live N/A |

**Aggregate deterministic GNQS submetric deltas:**

| Submetric | Before | After | Delta |
|---|---:|---:|---:|
| Roll/outcome integrity | 100 | 100 | 0 |
| Narration/outcome substance | 100 | 100 | 0 |
| Failure consequence strength | 100 | 100 | 0 |
| Agency/choice affordance | 85 | 85 | 0 |
| Continuity pressure | 100 | 100 | 0 |
| Check variety | 100 | 100 | 0 |
| Repetition freshness | 99 | 99 | 0 |
| Character affordance | 100 | 100 | 0 |

**Loop 1 guardrail results:**

| Command | Status | Notes |
|---|---|---|
| `bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand` | pass | 1 suite, 19 tests passed |
| `bun run test -- tests/lib/eliza/location-room-scene-checks.test.ts tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand` | pass | 2 suites, 24 tests passed |
| `bun run narrative:harness:test` | pass | GNQS 98, grade excellent, no warnings; 10 scenarios x 30 ticks |
| `bun run build` | pass | Next build succeeded; type validation and linting skipped by project config |
| `bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000` | failed/unavailable | Evaluator printed `fetch failed`; curl confirmed connection refused on `::1:3000` and `127.0.0.1:3000` |

**Decision:** Candidate #1 landed without deterministic regressions. Live impact remains unmeasured because localhost was not reachable.

### Loop 2 — Scene-check repetition guardrails

**Candidate:** Check variety and outcome-opening freshness.

**Change summary:** Added compact recent scene-check pattern context to GM beat and scene-check outcome prompts: recent check types, repeated check-type run, and recent GM outcome openings. Added narrow duplicate outcome-opening validation so generated duplicate openings fall back safely. Updated backend fallback inference so it avoids a third consecutive same check type only when the declared action/content also supports a semantically valid alternative; explicit GM `sceneCheckRequest` and valid character `sceneCheckProposal` remain authoritative.

**Files touched in Loop 2:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `prompt-exports/optimize-gm-narrative-quality-runs.md`

**Results:**

| Measurement | Before | After | Delta |
|---|---:|---:|---:|
| deterministic GNQS | 98 | 98 | 0 |
| live GNQS | N/A | N/A | N/A |
| check variety submetric | 100 | 100 | 0 |
| repetition freshness submetric | 99 | 99 | 0 |
| unique check types | 6 | 6 | 0 |
| repeated check-type max run | 2 | 2 | 0 |
| repeated outcome openings | 1 | 1 | 0 |
| weak failure outcomes | 0 | 0 | 0 |

**Aggregate deterministic GNQS submetric deltas:**

| Submetric | Before | After | Delta |
|---|---:|---:|---:|
| Roll/outcome integrity | 100 | 100 | 0 |
| Narration/outcome substance | 100 | 100 | 0 |
| Failure consequence strength | 100 | 100 | 0 |
| Agency/choice affordance | 85 | 85 | 0 |
| Continuity pressure | 100 | 100 | 0 |
| Check variety | 100 | 100 | 0 |
| Repetition freshness | 99 | 99 | 0 |
| Character affordance | 100 | 100 | 0 |

**Loop 2 guardrail results:**

| Command | Status | Notes |
|---|---|---|
| `bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand` | pass | 1 suite, 21 tests passed |
| `bun run test -- tests/lib/eliza/location-room-scene-checks.test.ts tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand` | pass | 2 suites, 28 tests passed |
| `bun run narrative:harness:test` | pass | GNQS 98, grade excellent, no warnings; 10 scenarios x 30 ticks |
| `bun run build` | pass | Next build succeeded; type validation and linting skipped by project config; existing browser data/punycode warnings appeared |
| `bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000` | failed/unavailable | Evaluator printed `fetch failed`; no live localhost measurement recorded |

**Decision:** Scene-check repetition guardrails landed without deterministic regressions. Live impact remains unmeasured because localhost was not reachable.

#### Post-Loop-2 live/static Crow's Den measurement — localhost restored

**Scope:** Measurement-only. No GM prompt behavior, coordinator public narration rules, scene-check logic, production narrative behavior, tick enablement, or persistence changed. No fresh ticks were triggered (`triggerTicks: 0`).

**Server restore / endpoint check:**

```bash
tmux new-session -d -s wagdie-dev 'cd /Users/t3rpz/projects/wagdie-simplified && bun run dev'
curl -sS -i 'http://localhost:3000/api/eliza/location-rooms/11?page=1&pageSize=300' | head -n 30
```

Result: HTTP 200 via local Next middleware proxy to `https://fateofwagdie.com`. Upstream caps each page at `pageSize: 50`; the evaluator paginated until the public transcript was exhausted, measuring all 76 available messages for the requested 300-message window.

**Evaluator command:**

```bash
bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000
```

Result: pass / exit 0. Measurement parser fix only: metadata-less public success outcomes are inferred as the next GM message after a roll card; live evaluator reports warnings by default and can still gate with `--fail-on-warnings`.

| Field | Value |
|---|---:|
| GNQS | 72 |
| Grade | needs_work |
| Total messages | 76 |
| GM messages | 31 |
| Character messages | 45 |
| Roll cards | 15 |
| GM outcomes | 15 |
| Completed ticks | 0 |
| Failed ticks | 0 |
| Avg GM narration chars | 156 |
| Avg outcome chars | 217 |
| Unique speakers | 6 |
| Unique check types | 2 |
| Repeated check-type max run | 8 |
| Failure outcomes | 3 |
| Weak failure outcomes | 0 |
| Repeated outcome openings | 0 |

**GNQS submetrics:**

| Submetric | Score |
|---|---:|
| Roll/outcome integrity | 100 |
| Narration/outcome substance | 84 |
| Failure consequence strength | 98 |
| Agency/choice affordance | 55 |
| Continuity pressure | 55 |
| Check variety | 0 |
| Repetition freshness | 100 |
| Character affordance | 100 |

**Warnings:**

- `GM narration too short on average (156)`
- `check variety too narrow (2)`
- `same check type repeated 8 times in a row`
- Score warning: `GNQS below minimum (72 < 75)`

**Comparison to scout baseline:**

| Metric | Scout baseline | Post-Loop-2 live/static | Delta |
|---|---:|---:|---:|
| Messages | 50 | 76 | +26 |
| GM messages | 20 | 31 | +11 |
| Character messages | 30 | 45 | +15 |
| Roll cards | 14 | 15 | +1 |
| GM outcomes | 14 | 15 | +1 |
| Avg GM narration chars | 143 | 156 | +13 |
| Avg GM outcome chars | 107 | 217 | +110 |
| Unique speakers | 6 | 6 | 0 |
| Unique check types | 2 | 2 | 0 |
| Repeated check-type max run | 9 | 8 | -1 |
| Failure outcomes | 7 | 3 | -4 |
| Weak failure outcomes | 7 | 0 | -7 |
| Repeated outcome openings | 8 | 0 | -8 |

**Measurement notes:** The scout baseline was pre-instrumentation and sampled 50 messages with 14 roll/outcome pairs. The post-Loop-2 evaluator now follows public API pagination, so it measured the full 76-message static transcript with 15 roll/outcome pairs after metadata-less public outcome parsing. The main remaining live/static blockers are short average public GM narration and narrow/repeated check variety in the existing transcript, not localhost/API reachability.

### Loop 3 — Candidate #3

**Candidate:** Check variety and outcome-opening freshness.

**Change summary:** TBD.

**Results:** TBD.

**Decision:** TBD.

## Manual Review Notes

Use this section for qualitative review. A run can pass GNQS and still need human inspection if:

- GM prose is long but vague.
- Failure consequences are punitive without offering next choices.
- Characters speak but do not meaningfully act.
- Continuity exists privately but is invisible to public transcript.
- Check variety improves by choosing semantically wrong checks.

## Final Decision

TBD.
