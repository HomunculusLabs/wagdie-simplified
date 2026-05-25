# Crow's Den Progression Fix: Plan

## Goal
Fix Crow's Den adventure progression so admin-started story ticks reliably produce structured TTRPG narrative, preserve explicit `story`/`auto`/`combat` intent through the tick queue, and hand off to combat only through an explicit unconsumed narrative/admin trigger.

## Background
- Current investigation: `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md:3-17` records the fresh-start runtime state: Crow's Den can start, but later ticks include `Game-master beat response contained invalid JSON`, narrative state remains `exploration` / `combatReadiness='none'`, there is no objective/encounter seed/combat trigger, and no gameplay state/run/encounter is created.
- Root cause evidence: `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md:24-52` verifies fail-closed narrative GM parsing, `story` intent behaving like `auto`, atmospheric progression being allowed indefinitely, and gameplay handoff correctly requiring an unconsumed `start_combat` trigger.
- User decisions from upfront checkpoint:
  - Invalid GM JSON should **retry/repair once, then fail visibly**. Do not silently synthesize a successful story beat after repair fails.
  - Progression should use **guided escalation**. Require objectives/open threads and rising threat, but let the GM choose when fiction demands combat.
  - Durable `story`/`auto`/`combat` tick intent persistence is in scope now.
  - Ops scope is uncertain. Include diagnostics now because they clarify failure modes; leave active-adventure cadence as a later/open enhancement unless implementation proves it is required.
- Narrative GM path: `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-69` parses `auto|story|combat` and calls `LocationRoomService.requestTickAndProcess()`. `lib/eliza/locationRooms/service.ts:1420-1456` routes narrative ticks into `narrativeCoordinator.processTurn()` and marks ticks complete after a character message.
- Narrative parser contract: `lib/eliza/locationRooms/gameMasterGenerator.ts:118-140` extracts JSON; `lib/eliza/locationRooms/gameMasterGenerator.ts:146-223` validates/caps fields and metadata; `lib/eliza/locationRooms/gameMasterGenerator.ts:313-371` streams official GM output and normalizes it without repair. Existing tests at `tests/lib/eliza/location-room-game-master-generator.test.ts:147-210` cover fenced JSON and invalid JSON rejection.
- Narrative progression seam: `lib/eliza/locationRooms/gameMasterGenerator.ts:234-313` builds the GM prompt, including current state/objective/open threads and TTRPG fields. `lib/eliza/locationRooms/narrativeTypes.ts:118-176` normalizes invalid phase/readiness/action values to safe defaults; `lib/eliza/locationRooms/narrativeCoordinator.ts:275-293` persists `stateAfter` and TTRPG metadata after character response.
- Tick intent seam: `lib/eliza/locationRooms/types.ts:14-16` defines `LocationRoomTurnIntent`; `lib/eliza/locationRooms/service.ts:612-726` validates manual ticks and writes admin `combat` indirectly into narrative metadata; `lib/eliza/locationRooms/repository.ts:359-385` enqueues ticks without durable intent. Base tick schema in `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:21-61` also lacks intent.
- Combat handoff seam: `lib/eliza/locationRooms/service.ts:1030-1051` derives an encounter trigger from unconsumed narrative metadata; `lib/eliza/locationRooms/service.ts:1346-1417` routes active encounters or triggers to gameplay; `lib/eliza/locationRooms/gameplay/coordinator.ts:377-384` skips gameplay with `no_combat_trigger` when no explicit trigger exists, and `lib/eliza/locationRooms/gameplay/coordinator.ts:466-482` consumes triggers idempotently.
- Diagnostics/cadence prior art: `docs/plans/gm-location-room-fixes-2026-05-23.md:143-179` defines admin diagnostics for config gates, GM readiness, participants, room fields, active/recent ticks, transcript stats, narrative/gameplay state, and recommended action. `docs/plans/elizaos-agent-location-rooms-2026-05-11.md:124-137` documents default `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES=360`; `vercel.json:8-11` schedules the worker every 15 minutes.
- Prior design constraint: `docs/plans/ttrpg-story-combat-experience-2026-05-24.md:33-71` chose story-first routing with explicit single-use combat triggers; `docs/plans/ttrpg-story-combat-experience-2026-05-24.md:158-174` keeps gameplay from auto-spawning encounters without a trigger.

## Approach
Keep the existing tick queue, narrative coordinator, metadata-backed combat trigger, and gameplay gate. This is not a broad refactor.

The fix has four first-order parts:

1. Add one-shot narrative GM JSON repair before visible failure. The strict normalizer remains the validator; invalid output triggers one repair prompt in the same GM session. If the repair also fails, the tick fails visibly through the existing retry/dead path with safe diagnostics.
2. Strengthen the guided progression contract. Non-aftermath beats must carry a concrete objective and open thread. Danger should move through `exploration` / `threat` and readiness instead of remaining indefinite atmosphere. Combat still requires explicit `requestedGameplayAction='start_combat'` and a public-safe `encounterSeed`.
3. Add durable `turn_intent` to ticks. The accepted API intent must survive enqueue, dedupe, claim, retry, and processing. `story` must not accidentally consume combat triggers. `auto` remains story-first but can use an unconsumed trigger. Admin `combat` creates/uses an explicit trigger.
4. Extend admin diagnostics. Operators need to distinguish invalid GM JSON/repair failure, retry delay, normal cadence wait, missing combat trigger, objective/readiness state, and durable tick intent.

Active-adventure cadence is intentionally deferred. The plan should not change the 360-minute default interval unless implementation proves diagnostics and manual/admin controls cannot support the workflow.

Deployment order matters: the `turn_intent` migration and any generated Supabase/database types must land before repository code that selects `turn_intent`. GM repair/progression changes can be implemented independently of the migration if the team wants to split risk across PRs.

## Implementation Progress
- [x] Slice 1 — durable tick intent plumbing and intent-aware routing. Focused service/generator/coordinator diagnostics-adjacent tests and `git diff --check` passed per implementation agent.
- [x] Slice 2 — narrative GM repair, guided progression validation, and safe beat diagnostics. Focused generator/coordinator/narrative/service tests and `git diff --check` passed per implementation agent.
- [x] Slice 3 — admin diagnostics, docs, final verification. Admin health diagnostics now project durable tick intent, retry/cadence state, safe GM generation/repair status, and trigger/readiness blockers; the admin UI renders those summaries and docs include the canonical Crow's Den `11` smoke checklist. Orchestrator reran focused test set: 6 suites, 87 tests passed; `git diff --check` passed.

## Work Items

### Item 1 — Add durable tick intent plumbing
**Goal:** Persist `story`/`auto`/`combat` intent on tick rows so accepted API intent remains meaningful after enqueue, dedupe, claim, retry, and scheduled processing.

**Done when:**
- A new migration adds `eliza_location_room_ticks.turn_intent` with default `auto`, a check constraint for `auto|story|combat`, and an index useful for room diagnostics.
- `LocationRoomTick` includes `turnIntent: LocationRoomTurnIntent`.
- `repository.ts` selects/maps/inserts `turn_intent` in all tick paths.
- Manual ticks persist the requested intent.
- Scheduled room ticks use `auto`.
- Active gameplay-run continuation ticks use `combat`.
- Deduped pending/failed manual ticks can promote intent by priority `combat > story > auto` without mutating processing ticks. Promotion must target the existing open room tick returned by the repository lookup path, may update failed-but-not-due ticks so the next claim sees the stronger intent, and must return the promoted tick in the request result when no immediate claim is possible.
- Admin `combat` remains idempotent across enqueue-time and processing-time behavior: request-time metadata may create the trigger, but processing must be able to repair/recreate the deterministic `manual:${tick.id}` trigger if the persisted combat tick is later claimed without usable trigger metadata.

**Key files:**
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:21-61`
- new migration under `supabase/migrations/`
- `lib/eliza/locationRooms/types.ts:14-16`, `lib/eliza/locationRooms/types.ts:65-85`
- `lib/eliza/locationRooms/repository.ts:359-385`
- `lib/eliza/locationRooms/service.ts:612-726`, `lib/eliza/locationRooms/service.ts:855-1026`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** None.

**Size:** Large.

### Item 2 — Make service routing intent-aware while preserving the combat gate
**Goal:** Route claimed ticks from persisted `turnIntent` without weakening the existing story-first / explicit-trigger combat model.

**Done when:**
- `story` intent always routes to narrative unless there is already active combat continuation state; it must not create, consume, or route through a pending narrative combat trigger.
- `auto` remains story-first but routes to gameplay when an active encounter/run exists or an unconsumed trigger exists.
- Admin `combat` persists as `combat` and creates/repairs a deterministic metadata-backed trigger when needed, e.g. `manual:${tick.id}`.
- Owner `combat` remains forbidden.
- Gameplay still skips with `no_combat_trigger` when no explicit trigger exists.
- Existing gameplay run lifecycle behavior is preserved.

**Key files:**
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-69`
- `lib/eliza/locationRooms/service.ts:1030-1051`, `lib/eliza/locationRooms/service.ts:1346-1417`
- `lib/eliza/locationRooms/gameplay/coordinator.ts:377-384`, `lib/eliza/locationRooms/gameplay/coordinator.ts:466-482`
- `tests/api/eliza/location-room-service.test.ts:940-1159`, `tests/api/eliza/location-room-service.test.ts:1290-1679`

**Dependencies:** Item 1.

**Size:** Large.

### Item 3 — Add one-shot narrative GM JSON repair with visible failure
**Goal:** Prevent a single malformed GM response from immediately failing progression, while keeping invalid output visible when repair also fails.

**Done when:**
- `normalizeGameMasterBeatResponse()` remains strict and continues to reject invalid JSON / invalid contract fields.
- `OfficialGameMasterBeatGenerator.generateBeat()` attempts normal parsing first, then sends one repair prompt in the same session if validation fails.
- Repair prompt repeats the JSON-only contract, selected speaker/token constraints, and guided progression constraints.
- If repair succeeds, generation returns the repaired output with safe diagnostics such as repair attempted/repaired and error category.
- If repair fails, generation throws a visible, categorized error; no public GM message, character message, or narrative state update is appended for that failed beat.
- Transport/session failures before a model response is collected do not enter the repair path; they should continue to fail through existing tick retry/dead handling.
- Repair prompting should live behind a private helper/builder in `gameMasterGenerator.ts` so the initial prompt contract, repair contract, and validation error formatting stay testable.
- Raw model response text is not stored or exposed in public/admin APIs.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:118-223`, `lib/eliza/locationRooms/gameMasterGenerator.ts:234-371`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:153-293`, `lib/eliza/locationRooms/narrativeCoordinator.ts:300-310`
- `lib/eliza/locationRooms/narrativeRepository.ts:73-80`, `lib/eliza/locationRooms/narrativeRepository.ts:291-304`
- `tests/lib/eliza/location-room-game-master-generator.test.ts:147-210`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** None, but implement before diagnostics so diagnostic shape is known.

**Size:** Large.

### Item 4 — Strengthen guided narrative progression contract
**Goal:** Make successful narrative beats structurally useful for TTRPG play without forcing combat on a fixed tick count.

**Done when:**
- GM prompt includes current phase/readiness/threat/action/seed metadata in addition to objective/open threads.
- Non-aftermath beats must produce a concrete `currentObjective` and at least one unresolved `openThread`.
- Beats must preserve or refine a concrete objective/thread and should advance the scene by adding a decision, clue, complication, changed threat/readiness, or explicit consequence. Do not require brittle string-diff validation against prior objective/thread text; enforce structural usefulness in prompt/repair validation and cover it with tests.
- Combat request validation requires `ttrpgPhase='threat'`, `combatReadiness='ready'`, and a non-null public-safe `encounterSeed`.
- Readiness validation ties `foreshadow` / `ready` to meaningful threat levels.
- Existing story-first behavior remains: the GM may escalate gradually and should only request combat when fiction demands it.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:234-313`
- `lib/eliza/locationRooms/gameMasterGenerator.ts:146-223`
- `lib/eliza/locationRooms/narrativeTypes.ts:118-176`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:275-293`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-types.test.ts`

**Dependencies:** Item 3, because new validation failures should use the repair path before visible failure.

**Size:** Medium.

### Item 5 — Persist safe GM generation diagnostics on narrative beats
**Goal:** Make parse/repair failure state inspectable without exposing raw model output or private prompt content.

**Done when:**
- Narrative beat rows remain the canonical storage surface for safe GM generation diagnostics because `processTurn()` creates/reuses a beat before generation.
- Successful repaired beats store safe metadata such as `gmGeneration.status='repaired'`, `repairAttempted=true`, `repaired=true`, and initial error category.
- Failed repair marks the narrative beat `failed` through existing beat lifecycle semantics and stores safe metadata such as `repairAttempted=true`, `repaired=false`, initial/repair error categories, and response lengths. Tick lifecycle (`failed`/`dead`) remains owned by service retry handling.
- Stored errors remain truncated/sanitized.
- Failed repair does not append public messages or update narrative state.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts:153-293`, `lib/eliza/locationRooms/narrativeCoordinator.ts:300-310`
- `lib/eliza/locationRooms/narrativeRepository.ts:73-80`, `lib/eliza/locationRooms/narrativeRepository.ts:291-304`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Item 3.

**Size:** Medium.

### Item 6 — Extend admin diagnostics for progression failures
**Goal:** Give admins enough state to tell whether Crow's Den is blocked by GM parse/repair failure, retry delay, normal cadence, missing combat trigger, missing objective/readiness, or config/participants.

**Done when:**
- Diagnostics service/API expose four grouped summaries: durable intent, retry/cadence state, safe GM repair/failure status, and trigger/readiness summary.
- The summaries are sufficient to distinguish parse/repair failure, failed tick not yet due for retry, healthy cadence wait, missing objective/readiness/trigger, and config/participant blockers.
- Admin UI renders a minimal readable version of those summaries without raw GM response text; exact grouping/layout is implementation-owned.
- Recommended next action distinguishes at least: inspect failed tick, wait for retry, wait for cadence, trigger room tick, missing trigger/readiness, and config/participant blockers.

**Key files:**
- `lib/eliza/locationRooms/adminDiagnostics.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/health/route.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`
- `components/admin/location-rooms/LocationRoomDiagnosticsContainer.tsx`
- `docs/plans/gm-location-room-fixes-2026-05-23.md:143-179`

**Dependencies:** Items 1, 3, 4, 5.

**Size:** Medium.

### Item 7 — Tests, docs, and verification checklist
**Goal:** Lock the behavior down and give deployment/testing a concrete smoke path for canonical Crow's Den.

**Done when:**
- Focused tests cover these behavior clusters:
  - durable `turnIntent` schema/repository/service behavior, including insertion, mapping, deduped promotion, scheduled `auto`, and gameplay continuation `combat`
  - intent-aware routing, including `story` staying narrative despite an unconsumed trigger, `auto` routing gameplay only with a valid trigger, admin `combat` creating/using a deterministic trigger, and owner combat remaining forbidden
  - narrative GM repair and progression, including one repair attempt, visible failed repair with no public messages/state update, objective/open-thread structure, and combat seed/readiness validation
  - diagnostics projection for repair failure, retry wait, cadence wait, missing trigger/readiness, and tick intent
- Plan and investigation docs are updated after implementation if behavior differs from this plan.
- Ops notes include a smoke checklist for location `11`:
  1. migration includes `turn_intent`
  2. Crow's Den canonical id remains `11`
  3. admin `story` tick persists `story`
  4. invalid GM JSON repairs once
  5. failed repair yields failed/dead tick diagnostics
  6. no combat spawns without an unconsumed trigger
  7. admin `combat` creates explicit trigger
  8. diagnostics distinguish retry wait, cadence wait, missing trigger, and parse/repair failure

**Key files:**
- `tests/api/eliza/location-room-service.test.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-narrative-types.test.ts`
- likely new diagnostics test under `tests/lib/eliza/`
- `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md`
- `docs/operations/` or existing runbook/docs location selected by implementer

**Dependencies:** Items 1–6.

**Size:** Medium.

## Slice 3 Notes
- The health diagnostics payload now exposes grouped summaries for `durableIntent`, `retryCadence`, `gmGeneration`, and `triggerReadiness`.
- `recommendedNextAction` now separates GM repair failure (`inspect_gm_repair_failure`), non-due failed retry (`wait_for_retry`), normal cadence wait (`wait_for_cadence`), readiness/trigger blockers (`missing_trigger_readiness`), and existing config/participant/manual tick blockers.
- Active-adventure cadence remains deferred; normal healthy rooms can still report a cadence wait under the configured interval.

## Open Questions
- Active-adventure cadence remains unresolved. This plan intentionally limits first-order ops work to diagnostics. If manual/admin progression still feels too slow after repair, guided progression, and diagnostics, add a follow-up plan for adventure-active cadence or run-specific interval.

## References
- `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md`
- `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md`
- `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md`
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/plans/gm-location-room-fixes-2026-05-23.md`

## Verification Commands
Run focused tests before broad suite:

```bash
bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts
bun run test -- tests/lib/eliza/location-room-narrative-coordinator.test.ts
bun run test -- tests/lib/eliza/location-room-narrative-types.test.ts
bun run test -- tests/api/eliza/location-room-service.test.ts
```

If diagnostics tests are added separately, run them directly as well. Full `bun run test` and `bun run lint` should be run before commit, but current unrelated failures should be documented rather than hidden if they persist.
