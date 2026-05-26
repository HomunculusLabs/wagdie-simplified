# GM Narrative Optimization: Plan

## Goal
Improve the location-room Game Master narrative loop so Crow’s Den produces richer, more coherent TTRPG play: recurring GM scene beats, diverse rolls, concrete failure/partial consequences, stronger spatial continuity, and measurable quality gates before dev deployment.

## Background

### Current live/dev evidence
- Dev Crow’s Den was reset, restarted, and paused after a preserved transcript sample. Current dev room `location_id='11'` had `tick_count=59`, `tick_enabled=false`, and no room `last_error` after preservation.
- The preserved transcript showed infrastructure is working: auto ticks complete without manual UI input; roll cards and GM outcomes are generated; all six character personas rotate.
- The same sample exposed quality issues: only one `gm_beat` after many ticks, roll type skew toward `Investigate`, repeated fallback-style failure copy, local-but-not-global spatial continuity, and occasional character text artifacts.

### User decisions from upfront checkpoint
- GM cadence scope: optimize both service-level routing/cadence and intra-beat public message sequencing.
- Roll triggering authority: keep layered inputs — GM request, character proposal, and backend fallback — but add pacing/diversity guardrails.
- Quality gate: use a hybrid process — deterministic GNQS/harness gates plus a small live transcript review checklist.

### Service and coordinator seams
- Manual ticks enter through `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-70`, read optional `intent: auto | story | combat`, and call `locationRoomService.requestTickAndProcess(...)`.
- Scheduled worker enters through `app/api/sync/eliza-location-rooms/route.ts:42` and calls `locationRoomService.runScheduledWorker()`.
- Cadence config lives at `lib/eliza/config.ts:230-250`: normal room tick interval, active narrative interval, worker allowlist, and max ticks per run.
- Due room selection is `tick_enabled=true` plus `next_tick_at IS NULL OR <= now` in `lib/eliza/locationRooms/repository.ts:352-367`.
- Tick routing in `lib/eliza/locationRooms/service.ts:1415-1744` gates participant count, combat/gameplay, narrative routing, route diagnostics, and cadence advancement.
- Narrative success uses `activeNarrativeTickIntervalMinutes` in `lib/eliza/locationRooms/service.ts:1649-1653`; combat/skips use normal cadence.
- `DefaultLocationRoomNarrativeCoordinator.processTurn(...)` runs the GM beat, optional public GM message, character turn, optional scene check, roll card, GM outcome, state update, and completion in `lib/eliza/locationRooms/narrativeCoordinator.ts:653-1222`.
- GM public beat messages are `messageKind: 'gm_beat'` in `lib/eliza/locationRooms/narrativeCoordinator.ts:744-780`.
- Normal non-roll character messages are `messageKind: 'character_reaction'` in `lib/eliza/locationRooms/narrativeCoordinator.ts:876-981`.
- Scene-check action, roll card, outcome sequence is implemented in `lib/eliza/locationRooms/narrativeCoordinator.ts:986-1217`.

### Scene-check and roll seams
- Allowed mechanical check types are fixed in `lib/eliza/locationRooms/gameplay/types.ts:20-42`.
- Scene-check intents are distinct from mechanical check types in `lib/eliza/locationRooms/sceneChecks/types.ts:10-27` and mapped in `lib/eliza/locationRooms/sceneChecks/rules.ts:21-39`.
- GM request is normalized in `lib/eliza/locationRooms/sceneChecks/rules.ts:86-120` and has priority in adjudication at `lib/eliza/locationRooms/sceneChecks/rules.ts:163-183`.
- Character proposals are normalized at `lib/eliza/locationRooms/sceneChecks/rules.ts:122-151`; the character prompt receives optional scene-check context from `lib/eliza/locationRooms/narrativeCoordinator.ts:420-447` and `lib/eliza/locationRooms/officialTurnGenerator.ts:80-107`.
- Backend fallback classification is regex-based in `lib/eliza/locationRooms/narrativeCoordinator.ts:514-557`, normalized through `lib/eliza/locationRooms/sceneChecks/rules.ts:153-161`, and only used when no GM request/proposal exists in `lib/eliza/locationRooms/narrativeCoordinator.ts:836-844`.
- Current anti-repetition exists but is shallow: GM prompt recent-check guidance in `lib/eliza/locationRooms/gameMasterGenerator.ts:751-814`, backend fallback repeated-type avoidance in `lib/eliza/locationRooms/narrativeCoordinator.ts:465-588`, and duplicate outcome-opening validation in `lib/eliza/locationRooms/gameMasterGenerator.ts:766-824` and `1197-1199`.
- Backend roll facts are immutable for GM outcomes: roll resolution in `lib/eliza/locationRooms/sceneChecks/rules.ts:277-304`, public roll projection in `lib/eliza/locationRooms/sceneChecks/publicRolls.ts:3-48`, roll-card append in `lib/eliza/locationRooms/narrativeCoordinator.ts:1032-1054`, and GM outcome generation in `lib/eliza/locationRooms/narrativeCoordinator.ts:1071-1156`.

### Evaluation seams
- Deterministic harness script is `narrative:harness:test` in `package.json:30`; live evaluator is `narrative:harness:live` in `package.json:31`.
- Shared scoring lives in `scripts/location-room-narrative-quality.ts:22-156` and currently measures roll/outcome integrity, narration substance, failure consequence strength, agency, continuity keyword signals, check variety, repetition, and character affordance.
- Live evaluator imports the scorer and fetches live transcripts in `scripts/location-room-narrative-eval.ts:3-115`.
- Deterministic 10×30 scenario harness lives in `tests/lib/eliza/location-room-narrative-harness.ts:919-1036`; Jest gates live in `tests/lib/eliza/location-room-narrative-harness.test.ts:49-76` plus fixture tests for weak output and repetition.
- Metric extension points exist for GM cadence, check diversity, fallback phrasing, spatial continuity, and concrete consequences in `scripts/location-room-narrative-quality.ts` and the harness aggregate paths.

### Prior art and settled constraints
- Story-first/combat separation is settled in `docs/plans/ttrpg-story-combat-experience-2026-05-24.md` and commit `2a1c9520`: narrative must not auto-spawn combat without an explicit unconsumed combat trigger.
- Crow’s Den canonical location is `locations.id='11'`; duplicate `crows_den` should not be used for this work.
- Progression hardening already landed in commit `531776e1`: strict GM JSON, one repair attempt, durable tick intent, no silent synthesized success.
- Fresh adventures require public GM narration from commit `46b5afeb`; public API/UI were ruled out as hiding GM messages.
- Scene checks are narrative-path rolls, not combat, from `docs/plans/location-room-scene-checks-2026-05-25.md` and commit `8403ac81`.
- Character roll choices are separated from narrative action intent from `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md` and commit `c48868b3`.
- Adventure memory exists internally from `docs/plans/gm-story-generation-improvements-2026-05-25.md` and commit `53094b86`; public adventure UI was intentionally quieted by `docs/plans/gm-adventure-signal-tuning-2026-05-25.md` and commit `0815f8c8`.
- GNQS and harness instrumentation landed in commit `9d6f774c`; deterministic baseline reached GNQS 98, but live Crow’s Den still warned on short GM narration, narrow check variety, and repeated check types.

## Approach

Implement this as a targeted evolution of the existing location-room narrative loop, not a broad refactor. The current architecture already separates service routing/cadence, GM generation, character generation, scene-check adjudication, persistence, and evaluation. The plan strengthens those seams by adding recurring public GM beat cadence, bounded spatial continuity memory, backend-only roll diversity guardrails, stronger consequence fallbacks, and expanded deterministic/live quality gates. Prefer scorer/evaluator/harness instrumentation; any production hook should be bounded, metadata-only, and justified by transcript/state analysis being insufficient.

The implementation must preserve the existing story-first combat contract: narrative scene checks are not combat, and combat starts only through an active encounter, explicit unconsumed narrative combat trigger, gameplay run continuation, or admin combat intent.

Recommended implementation order:

1. Add cadence config and progression-context fields that initially rely on transcript/adventure-memory anchors.
2. Add bounded spatial continuity memory and prompt rendering.
3. Implement recurring GM beat cadence with idempotency tests, using spatial memory when available and transcript-derived anchors otherwise.
4. Extract recent scene-check pattern helper and update prompt/fallback usage.
5. Expand backend fallback check-type candidates and diversity selection.
6. Strengthen coordinator-level fallback outcomes.
7. Extend GNQS/live evaluator metrics.
8. Update deterministic harness scenarios and gates.
9. Add service/combat-separation regression tests.
10. Update validation docs/scoreboard and run deterministic + live checks.

## Work Items

### Item 1 — Recurring public GM beat cadence

**Goal:** Ensure public `gm_beat` messages recur during active narrative play instead of appearing only on the opener, escalation, or combat handoff. These beats should re-frame the scene, restate visible pressure, anchor current options, and leave agency with the characters.

**Cadence rule:** count public `agent` messages with `messageKind` `character_reaction` or `character_action`, and public GM scene-check messages with `messageKind` `roll_card` or `gm_outcome`, since the last public `gm_beat`. Default thresholds: `publicGmBeatMaxAgentMessages=5`, `publicGmBeatMaxSceneChecks=3`, and `publicGmBeatMinMessagesBetween=4`. Cadence is due only after at least one prior public GM beat exists and the minimum gap is satisfied.

**Done when:**
- A room whose counts cross the cadence rule forces a public GM beat on the next narrative tick.
- Routine cadence GM beats do not request or start combat unless the existing explicit combat trigger contract is satisfied.
- Retry/idempotency remains intact: stored beats do not append duplicate GM messages.
- Route diagnostics or returned narrative result exposes a boolean such as `publicGameMasterBeatAppended` or an equivalent diagnostics field.
- Existing opener and flat-state escalation behavior still passes.

**Key files:** `lib/eliza/config.ts`, `lib/eliza/locationRooms/gameMasterGenerator.ts`, `lib/eliza/locationRooms/narrativeCoordinator.ts`, `lib/eliza/locationRooms/service.ts`, `tests/lib/eliza/location-room-game-master-generator.test.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`.

**Dependencies:** None. Item 1 can use transcript-derived anchors before Item 2 lands; Item 2 should land before final cadence quality gates are hardened.

**Size:** Medium.

### Item 2 — Bounded spatial continuity memory

**Goal:** Give the GM an explicit private spatial model so narration and outcomes maintain global continuity across ticks: current area, landmarks, available routes, blocked routes, and unresolved spatial questions.

**Spatial memory shape:** add an optional `spatialContext` object under existing adventure metadata/patch JSON, with bounded fields: `currentArea: string | null`, `landmarks: string[]`, `routes: string[]`, and `unresolvedSpatialQuestions: string[]`. Normalize `currentArea` to 120 chars, `landmarks` and `routes` to 6 items, unresolved questions to 4 items, and individual entries to roughly 120–180 chars. Merge arrays case-insensitively, favor newest bounded entries, and apply existing adventure text safety filtering.

**Done when:**
- Old metadata without spatial context normalizes safely.
- GM beat and scene-check outcome prompts include spatial memory when present.
- `adventurePatch.spatialContext` persists through adventure metadata merge without a database migration and with deterministic merge precedence.
- Public cadence GM beats and scene-check outcomes include a clear spatial anchor in tests.
- Character prompts can use visible routes/landmarks if the turn context exposes them.

**Key files:** `lib/eliza/locationRooms/narrativeTypes.ts`, `lib/eliza/locationRooms/gameMasterGenerator.ts`, `lib/eliza/locationRooms/narrativeCoordinator.ts`, `lib/eliza/locationRooms/officialTurnGenerator.ts`, `lib/eliza/locationRooms/types.ts`, `tests/lib/eliza/location-room-game-master-generator.test.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`, `tests/lib/eliza/location-room-narrative-harness.ts`.

**Dependencies:** Item 1 benefits from this; implement after cadence if avoiding prompt churn is more important than memory-first work.

**Size:** Medium.

### Item 3 — Backend roll diversity guardrails

**Goal:** Reduce repeated `Investigate`/`Perception` skew while preserving layered authority: GM requests remain highest priority, valid character proposals remain second, and backend diversity applies only to fallback inference. Share recent-pattern logic between the GM prompt and backend fallback; the exact helper file/module boundary is an implementation detail unless tests or import hygiene require a new module.

**Done when:**
- Backend fallback avoids a third repeated check type when another semantically valid candidate exists.
- Backend fallback keeps the semantic primary when no valid alternative fits.
- GM-requested and character-proposed checks are never overridden for diversity.
- Recent check-pattern extraction is shared by generator prompt guidance and coordinator fallback selection.
- Tests cover expanded mappings and source-priority preservation.

**Key files:** `lib/eliza/locationRooms/narrativeCoordinator.ts`, `lib/eliza/locationRooms/gameMasterGenerator.ts`, `lib/eliza/locationRooms/officialTurnGenerator.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`, `tests/lib/eliza/location-room-game-master-generator.test.ts`, `tests/lib/eliza/location-room-scene-checks.test.ts`.

**Dependencies:** Prefer after Item 1 to reduce prompt churn conflicts.

**Size:** Medium.

### Item 4 — Stronger partial/failure consequence fallbacks

**Goal:** Ensure every partial/failure scene-check outcome creates a concrete visible consequence, preserves agency, and updates durable private memory even when model generation fails or an injected generator lacks `generateSceneCheckOutcome`.

**Done when:**
- Coordinator-level fallback outcomes for partial/failure are substantive enough for transcript quality gates.
- Failure-tier fallback names a visible cost, pressure, blocked route, worsened clock, or harder next choice.
- Failure-tier fallback records a consequence in adventure memory.
- Success-tier fallback records discovery, advantage, or stakes movement.
- Public text still avoids unsafe mechanics such as HP, rewards, death/finality, wallets, private chain data, or hidden mechanics.

**Key files:** `lib/eliza/locationRooms/narrativeCoordinator.ts`, `lib/eliza/locationRooms/gameMasterGenerator.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`, `tests/lib/eliza/location-room-game-master-generator.test.ts`, `tests/lib/eliza/location-room-narrative-harness.test.ts`.

**Dependencies:** Item 2. Failure/partial outcomes should update spatial context when they open, block, narrow, or reveal routes/landmarks.

**Size:** Small to Medium.

### Item 5 — GNQS metrics for GM cadence and spatial continuity

**Goal:** Make the requested quality themes measurable in deterministic and live validation, not just subjective review.

**Metric definitions:** `publicGameMasterBeatCount` counts public `game_master` messages with `messageKind === 'gm_beat'`; `publicGameMasterBeatMaxGap` is the maximum public-message count between `gm_beat` messages after the opener; `spatialContinuitySignalCount` counts public GM beats/outcomes with concrete spatial terms such as room, door, stair, cellar, route, path, threshold, wall, table, tunnel, landing, arch, floor, passage, landmark, or exit. On transcripts with at least 20 messages, warn when GM beats are fewer than 2, max gap exceeds 10, or spatial signal count is below 4. Fold cadence into narration/continuity scoring and spatial signals into continuity pressure unless a later implementation intentionally revises GNQS weights.

**Done when:**
- Shared scorer reports public GM beat count, maximum public-message gap between GM beats, and spatial continuity signal count.
- Scorer warns when longer transcripts have too few GM scene beats, too-wide GM beat gaps, or thin spatial continuity.
- Metrics fold into existing GNQS submetrics without breaking comparability unless the scoreboard formula is explicitly revised.
- Live evaluator output includes the new metrics and warnings.
- Weak fixture tests can trigger cadence/spatial warnings.

**Key files:** `scripts/location-room-narrative-quality.ts`, `scripts/location-room-narrative-eval.ts`, `tests/lib/eliza/location-room-narrative-harness.test.ts`, `prompt-exports/optimize-gm-narrative-quality-runs.md`.

**Dependencies:** Items 1 and 2.

**Size:** Medium.

### Item 6 — Deterministic harness upgrades

**Goal:** Keep CI coverage aligned with the new production behaviors: recurring GM beats, roll diversity, concrete consequences, and spatial continuity.

**Done when:**
- `bun run narrative:harness:test` passes reliably.
- Harness still validates no failed ticks and matched roll/outcome counts.
- Deterministic scenarios exercise periodic GM beats, broader roll types, spatial context patches, and tiered consequences.
- Aggregate gates catch regressions in cadence, diversity, consequence strength, and spatial continuity.
- Calibration targets before hardening: aggregate GNQS ≥ 85, per-scenario GNQS ≥ 75, empty aggregate warnings, repeated check run ≤ 2, and unique check types ≥ 5 aggregate. Treat new thresholds as warnings until Item 5 confirms score comparability on deterministic and live samples.

**Key files:** `tests/lib/eliza/location-room-narrative-harness.ts`, `tests/lib/eliza/location-room-narrative-harness.test.ts`, `scripts/location-room-narrative-quality.ts`.

**Dependencies:** Items 1–5.

**Size:** Medium.

### Item 7 — Story/combat separation regression tests

**Goal:** Prove narrative optimization does not weaken the settled story-first/combat boundary.

**Done when:**
- Tests fail if GM cadence alone causes combat routing.
- `intent: story` never consumes a narrative combat trigger or starts combat.
- `intent: auto` routes to combat only when existing explicit trigger rules are satisfied.
- Admin `intent: combat` behavior remains unchanged.
- Narrative scene checks remain `messageDomain: 'narrative'` and do not create gameplay encounters.

**Key files:** `lib/eliza/locationRooms/service.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`, existing or new service-level tests under `tests/lib/eliza/` or `tests/api/eliza/`.

**Dependencies:** Item 1.

**Size:** Small to Medium.

### Slice 3 Notes — Items 5–8

- Shared GNQS scoring now reports `publicGameMasterBeatCount`, `publicGameMasterBeatMaxGap`, and `spatialContinuitySignalCount`. These fold into narration/continuity submetrics while preserving the published score-weight table; the new thresholds emit calibration warnings on 20+ message transcripts.
- Live evaluator output includes the new metrics through the existing `metrics` payload and now warns on sparse public GM beat cadence or thin spatial continuity.
- Deterministic harness gates now include aggregate GNQS ≥ 85, per-scenario GNQS ≥ 75, empty aggregate warnings, repeated check run ≤ 2, unique check types ≥ 5, public GM beat max gap ≤ 10, and aggregate spatial signal coverage. Scenarios exercise spatial context patches and tiered consequences.
- Service-level harness regression coverage proves `intent: story` stays narrative even with an unconsumed combat trigger, while `intent: auto` and admin `intent: combat` still route to combat only through explicit trigger rules. The story probe reaches a narrative scene check with `messageDomain: 'narrative'` and no gameplay run creation.
- Validation on 2026-05-26: `bun run narrative:harness:test` passed with GNQS 98, 210 public GM beats, max GM beat gap 7, 331 spatial continuity signals, 6 unique check types, repeated check run 2, and no warnings.
- Focused guardrails passed on 2026-05-26: scene-check/coordinator suites (31 tests) and game-master-generator suite (24 tests).
- Static Crow’s Den scoring remains available with paused/dev-safe ticks: `bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000` exited 0 with 0 triggered ticks, GNQS 74, 98 messages, 19 roll/outcome pairs, 0 public GM beats by strict `messageKind === 'gm_beat'` metadata, max GM beat gap 98, and 15 spatial continuity signals. This is a quality-warning result, not an environment failure.
- Fresh Crow’s Den tick validation was not run; it requires tick enablement plus auth/config (`NARRATIVE_EVAL_COOKIE`/bearer token and optional `NARRATIVE_EVAL_TRIGGER_TICKS`).

### Item 8 — Crow’s Den/dev validation loop

**Goal:** Create a repeatable hybrid validation checklist for canonical Crow’s Den `location_id='11'` using deterministic gates and live transcript review. This is an exit checklist unless docs/scoreboard updates are explicitly required by the implementation workflow.

**Done when:**
- Scoreboard has new rows for this optimization pass.
- Validation notes distinguish “environment unavailable” from “quality failed.”
- The plan names deterministic and live pass/fail criteria.
- Dev validation can score a preserved/static transcript and, when auth/config permits, trigger fresh ticks.

**Key files:** `prompt-exports/optimize-gm-narrative-quality-runs.md`, `docs/plans/gm-narrative-optimization-2026-05-26.md`, `scripts/README.md` if command docs need refresh.

**Dependencies:** Items 1–7.

**Size:** Small.

## Validation Plan

Run these before dev deployment:

```bash
bun run narrative:harness:test
bun run test -- tests/lib/eliza/location-room-scene-checks.test.ts tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand
bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand
bun run build
```

Run static/live Crow’s Den scoring against dev or localhost after deployment. If Crow’s Den is paused (`tick_enabled=false`) or auth/config is unavailable, static transcript scoring is still valid and should be recorded separately from quality failures; fresh-tick validation requires enabling ticks plus auth/config:

```bash
bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000 --fail-on-warnings
```

Run fresh-tick scoring when auth/config permits:

```bash
NARRATIVE_EVAL_TRIGGER_TICKS=10 NARRATIVE_EVAL_COOKIE='...' bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000 --fail-on-warnings
```

Live review checklist:

- At least 2 public `gm_beat` messages in 50+ public messages (`publicGameMasterBeatCount`).
- No GM beat gap above 10 public messages (`publicGameMasterBeatMaxGap`).
- At least 3 unique check types in 15+ rolls; target 5+ over larger samples.
- No repeated check-type run above 2 unless semantically unavoidable.
- Failure/partial outcomes visibly change the situation and leave a next choice.
- Transcript repeatedly anchors current room/route/landmark state (`spatialContinuitySignalCount`; calibration warning below 4 on 20+ message transcripts).
- No combat starts without explicit trigger/admin combat intent.

## Risks and Constraints

- **No database migration should be required.** Spatial continuity belongs in existing bounded JSON adventure metadata.
- **Prompt strictness can increase repair/fallback usage.** Mitigate with coordinator fallback quality and generator tests.
- **Recurring GM beats can crowd the transcript.** Mitigate with minimum message gap and max-agent/scene-check thresholds.
- **Over-diversifying rolls can choose unnatural checks.** Mitigate by applying diversity only to backend fallback among semantically valid candidates.
- **Combat separation is non-negotiable.** Preserve service routing conditions and add regression tests.

## Open Questions
None blocking. Implementation assumptions are:
- Spatial memory should land before final cadence gates are hardened, but cadence can initially use transcript-derived anchors.
- New GNQS thresholds start as calibration warnings until deterministic and live samples confirm comparability.
- GM beat cadence counts public `character_reaction`, `character_action`, `roll_card`, and `gm_outcome` messages since the last public `gm_beat`.
- Spatial context can be passed to character prompts if it remains visible/public-safe; otherwise keep it GM/outcome-only for the first pass.
- Static Crow’s Den scoring is acceptable when auth/config blocks fresh ticks; fresh ticking is required before a dev/live confidence claim.
- Preserve both cadence layers, layered roll sources, hybrid quality gates, no automatic combat escalation, and canonical Crow’s Den `location_id='11'` for dev smoke.

## References
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/plans/location-room-scene-checks-2026-05-25.md`
- `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md`
- `docs/plans/gm-story-generation-improvements-2026-05-25.md`
- `docs/plans/gm-adventure-signal-tuning-2026-05-25.md`
- `prompt-exports/optimize-gm-narrative-quality-runs.md`
