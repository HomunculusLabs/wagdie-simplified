# Investigation: Crow's Den Adventure Progression Errors

## Summary
Crow's Den starts successfully, but progression fails in the narrative layer: malformed GM JSON fails ticks, and successful beats are allowed to remain atmospheric without objectives, escalation, or a combat trigger. Gameplay handoff is not broken; it is correctly waiting for an explicit unconsumed `start_combat` trigger that the narrative layer never produces.

## Symptoms
- Admin-triggered Crow's Den story tick starts the room after reset.
- The adventure reports errors during or after progression.
- The room does not feel like it progresses naturally from story into ongoing TTRPG play.

## Background / Prior Research
- Dev runtime snapshot for Crow's Den (`location_id='11'`, room `0fccb62c-acd6-481c-9548-0b9241b0b3c1`) showed `tick_count=4`, 6 messages, 6 ticks, 6 narrative beats, 1 narrative state, and no gameplay states/runs/encounters/turns after the fresh start.
- Room-level `last_error` is `Game-master beat response contained invalid JSON`; two latest admin ticks failed with that same error.
- Recent tick history: scheduled first tick completed, three admin ticks completed, then admin tick `ffc8bb9b-231d-43fd-9d3a-9abf56796a32` failed at `2026-05-24 18:41 UTC`, admin tick `b23b394e-4bb6-4a8c-8288-01a6ef229ffc` completed, then admin tick `f3feeba4-8d2a-4370-9f8a-7627d731351e` failed at `2026-05-24 18:44 UTC`.
- Narrative state metadata remained `ttrpgPhase='exploration'`, `combatReadiness='none'`, `requestedGameplayAction=null`, `lastEncounterSeed=null`, `consumedCombatTriggerBeatId=null`; no gameplay state was created.
- Completed beats are mostly atmospheric exploration. `currentObjective` remains null throughout, `threatLevel` stays null/0, and `encounterSeed` remains null, which matches the reported feeling that the adventure is not progressing naturally.
- The deployed database schema lacks newer local story/combat columns such as `eliza_location_room_ticks.turn_intent` and `eliza_location_room_gameplay_states.story_phase`, which may indicate migrations are not applied or dev is not on the expected schema baseline.

## Investigator Findings
<!-- Pair investigator appends structured findings here. -->

### 2026-05-24 - Progression/routing investigation

**Finding 1 - Narrative GM parsing is fail-closed, matching the observed `Game-master beat response contained invalid JSON` failures.**
- Evidence: `extractGameMasterJsonObject()` accepts fenced JSON or first/last-brace content, but throws on empty/no-object/invalid JSON; `normalizeGameMasterBeatResponse()` does not catch those parse errors and also throws on missing required `speakerInstruction`/`stateSummary` (`lib/eliza/locationRooms/gameMasterGenerator.ts:130-154`, `lib/eliza/locationRooms/gameMasterGenerator.ts:159-210`). `OfficialGameMasterBeatGenerator.generateBeat()` returns normalization directly after collecting model text, with no repair/fallback path (`lib/eliza/locationRooms/gameMasterGenerator.ts:354-371`).
- Conclusion: Hypothesis 1 confirmed. A malformed GM response aborts the tick before durable public output/state progression, and the service records/retries the failed tick (`lib/eliza/locationRooms/service.ts:1459-1551`).
- Recommendation update after implementation: keep the parser strict, attempt one same-session JSON repair, and then fail visibly if repair also violates the contract. Store only safe generation diagnostics such as repair status, error categories, and response lengths; do not synthesize a successful beat or expose raw model text.

**Finding 2 - Manual `intent` is parsed, but only admin `combat` has a durable side effect; `story` is effectively a no-op alias for `auto`.**
- Evidence: The API accepts `intent: auto | story | combat` and passes it into `requestTickAndProcess()` (`app/api/eliza/location-rooms/[locationId]/tick/route.ts:23-68`). `validateAndEnqueueManualTick()` rejects owner combat, then for `combat` updates narrative-state metadata with `requestedGameplayAction: 'start_combat'` and `lastCombatTriggerBeatId: manual:<uuid>` before enqueuing (`lib/eliza/locationRooms/service.ts:669-700`). The tick insert persists trigger/requester/run fields, but no `intent`/`turn_intent` (`lib/eliza/locationRooms/repository.ts:360-385`), and the tick type likewise has no intent field (`lib/eliza/locationRooms/types.ts:65-85`, `lib/eliza/locationRooms/types.ts:369-374`).
- Conclusion: Hypothesis 2 partially confirmed. Combat can be made durable through narrative metadata, but tick rows cannot distinguish `story` from `auto`, so post-claim routing is not driven by the manual intent that the API accepted.
- Recommendation update after implementation: `turn_intent` is now durable on tick rows and routing uses the persisted `auto` / `story` / `combat` intent. Admin combat remains explicit through deterministic manual trigger metadata.

**Finding 3 - The narrative prompt and normalizers allow indefinite atmosphere and do not enforce escalation.**
- Evidence: The prompt includes `currentObjective`, `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, and `encounterSeed`, but says most beats should keep `requestedGameplayAction` null and only start combat when fiction clearly escalates (`lib/eliza/locationRooms/gameMasterGenerator.ts:280-313`). Optional fields normalize conservatively: missing/invalid phase falls back to `story`, readiness to `none`, threat/action/seed to `null` (`lib/eliza/locationRooms/narrativeTypes.ts:113-171`). State updates simply persist the GM output after the character message, including nullable `currentObjective` and nullable trigger fields (`lib/eliza/locationRooms/narrativeCoordinator.ts:263-285`).
- Conclusion: Hypothesis 3 confirmed. Nothing in code forces objective selection, threat/readiness escalation, encounter seeding, or combat handoff after repeated atmospheric beats; the observed `currentObjective=null`, `combatReadiness='none'`, `requestedGameplayAction=null`, and `lastEncounterSeed=null` are permitted steady states.
- Recommendation: Add progression policy to the GM prompt/coordinator: after N exploration beats require a concrete objective/open complication; after M threat beats require `combatReadiness: 'ready'` plus an `encounterSeed`; optionally let room/location config define desired escalation pacing.

**Finding 4 - Story-to-combat handoff is correctly edge-triggered, but Crow's Den never produced the required unconsumed trigger.**
- Evidence: Service routes to gameplay only when there is an active encounter or `buildEncounterTriggerFromNarrativeState()` sees an unconsumed trigger (`lib/eliza/locationRooms/service.ts:1345-1398`). A trigger is unconsumed only if `requestedGameplayAction === 'start_combat'`, `lastCombatTriggerBeatId` is present, and it differs from `consumedCombatTriggerBeatId` (`lib/eliza/locationRooms/service.ts:387-391`). Narrative writes `lastCombatTriggerBeatId = beat.id` only when the GM output requested `start_combat`; otherwise it clears the trigger id (`lib/eliza/locationRooms/narrativeCoordinator.ts:272-282`). Gameplay consumes the trigger by clearing `requestedGameplayAction` and setting `consumedCombatTriggerBeatId` on encounter creation (`lib/eliza/locationRooms/gameplay/coordinator.ts:469-482`).
- Conclusion: Hypothesis 4 confirmed. The gate is coherent and duplicate-safe, but runtime state with `requestedGameplayAction=null` and `lastEncounterSeed=null` means no combat trigger ever reached the router.
- Recommendation: Keep the consumption gate, but make narrative escalation explicit enough to produce a fresh `start_combat` trigger, and add diagnostics/admin UI that displays `lastCombatTriggerBeatId` vs `consumedCombatTriggerBeatId`.

**Finding 5 - Current local migrations match the metadata-based implementation, but the DB must include the latest gameplay-run migration; `turn_intent`/`story_phase` are not expected by this checkout.**
- Evidence: Local base tick schema has trigger/requester/status/attempt/lock/selected/error fields but no `turn_intent` (`supabase/migrations/20260511000000_create_eliza_location_rooms.sql:20-57`). Narrative state has real `current_objective` plus JSONB `metadata`, not scalar `story_phase`/`threat_level` columns (`supabase/migrations/20260522000000_add_location_room_narrative.sql:13-24`). The latest gameplay run migration creates `eliza_location_room_gameplay_runs` and adds `eliza_location_room_ticks.gameplay_run_id`, which the repository selects/inserts/updates (`supabase/migrations/20260524000000_create_location_room_gameplay_runs.sql:5-39`, `lib/eliza/locationRooms/repository.ts:27-29`, `lib/eliza/locationRooms/repository.ts:360-385`). Generated Supabase types are stale for all `eliza_location_room*` tables, with repositories using `any` workarounds (`lib/eliza/locationRooms/narrativeRepository.ts:62-69`, `lib/eliza/locationRooms/gameplay/repository.ts:188-195`).
- Conclusion: Hypothesis 5 is mixed. Missing `turn_intent`/`story_phase` is not a schema drift for this code; those fields do not exist locally either. But a dev/deployed DB missing `20260524000000_create_location_room_gameplay_runs.sql` will break current tick queries because code expects `gameplay_run_id`.
- Recommendation: Verify applied migrations in the target DB, especially `20260524000000_create_location_room_gameplay_runs.sql`; regenerate `lib/database.types.ts`; decide whether to add real `turn_intent`/phase columns or update diagnostics to treat them as metadata-only.

**Finding 6 - Natural progression can have long gaps after manual starts, and failed GM ticks retry with increasing delays.**
- Evidence: Successful/skipped ticks advance `next_tick_at` by `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES`, default 360 minutes (`lib/eliza/config.ts:230-241`, `lib/eliza/locationRooms/repository.ts:743-759`). The scheduled worker is only invoked by cron every 15 minutes (`vercel.json:8-11`, `app/api/sync/eliza-location-rooms/route.ts:35-48`). Failed ticks retry at 5, 10, then 20 minutes before becoming dead at 3 attempts (`lib/eliza/locationRooms/service.ts:74-81`, `lib/eliza/locationRooms/service.ts:178-181`, `lib/eliza/locationRooms/service.ts:1266-1296`). Owner manual ticks also have a 5-minute cooldown (`lib/eliza/locationRooms/service.ts:650-666`).
- Conclusion: Hypothesis 6 confirmed. Even without errors, a completed manual start can leave the room waiting up to the configured room cadence for the next natural tick; with invalid GM JSON, retries can create visible stalls/errors before progression resumes or the tick dies.
- Recommendation: For active adventures, use a shorter tick interval or a temporary adventure-run cadence, and surface failed/retry/dead tick state in admin diagnostics so stalls are distinguishable from normal 6-hour scheduling.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The issue may be caused by runtime failures in the deployed dev environment, tick scheduling/cooldown behavior after manual story ticks, or story/combat gating logic that does not advance narrative state naturally.
**Findings:** Report created; runtime evidence and code-path context gathering pending.
**Evidence:** User reported that the manual start works, but errors occur and progression is unnatural.
**Conclusion:** Needs investigation.

## Root Cause

Crow's Den is failing and stalling in the narrative progression layer, before gameplay can begin.

The primary root cause is twofold:

1. **Narrative GM generation is fail-closed on malformed JSON.** `OfficialGameMasterBeatGenerator.generateBeat()` strictly parses the streamed GM response through `normalizeGameMasterBeatResponse()` / `extractGameMasterJsonObject()`. When the GM returns malformed JSON, the tick fails with `Game-master beat response contained invalid JSON`, no durable public output is appended, and the room enters retry/error state.

2. **Successful narrative beats are allowed to remain structurally atmospheric.** The narrative prompt and normalizers permit `currentObjective=null`, empty or non-progressing open threads, `combatReadiness='none'`, `requestedGameplayAction=null`, and `encounterSeed=null`. As a result, completed Crow's Den beats can feel like atmosphere rather than a TTRPG adventure with objective, rising threat, and eventual combat handoff.

The gameplay handoff is not the root cause. The gameplay coordinator correctly requires an explicit unconsumed narrative/admin combat trigger before creating an encounter. Crow's Den never produced that trigger: runtime state remained `requestedGameplayAction=null`, `lastEncounterSeed=null`, and `combatReadiness='none'`, so no gameplay state/run/encounter was expected.

Contributing factors:
- Manual `intent: story` is accepted by the API but is not persisted on tick rows, so it behaves like `auto` after enqueue. Admin `intent: combat` does have a durable side effect through narrative metadata.
- Default natural cadence is slow: room ticks default to 360 minutes, while failed ticks retry after 5/10/20 minutes before dying.
- Admin/runtime diagnostics do not clearly distinguish parse failure, retry delay, missing combat trigger, and normal long-cadence waiting.
- Generated Supabase types are stale for location-room tables, and the latest gameplay-run migration must be applied. However, missing `turn_intent` and `story_phase` columns are not current local schema drift; this checkout intentionally uses metadata for phase/readiness.

## Recommendations

### First-order fixes

1. **Add visible narrative GM repair.**
   - Keep `normalizeGameMasterBeatResponse()` strict so tests and diagnostics still catch malformed model output.
   - On invalid GM JSON or progression-contract validation failure after a model response is collected, attempt one same-session JSON repair.
   - If repair succeeds, persist safe `gmGeneration` diagnostics on the beat; if repair fails, mark the beat/tick failed through the normal retry/dead lifecycle without appending public messages or mutating narrative state.

2. **Strengthen the narrative GM prompt/progression contract.**
   - Require every non-aftermath beat to advance the room state.
   - Do not allow `currentObjective=null` unless the scene is resolved or in aftermath.
   - Keep at least one unresolved open thread until the adventure is resolved.
   - Require danger to escalate from `exploration` to `threat` instead of remaining at `combatReadiness='none'` indefinitely.
   - When the fiction clearly demands a fight, require `ttrpgPhase='threat'`, `combatReadiness='ready'`, `requestedGameplayAction='start_combat'`, and a public-safe `encounterSeed`.

3. **Add focused regressions.**
   - Invalid narrative GM JSON attempts one repair; if repair fails, no public messages/state updates are written and diagnostics expose only safe repair-failure metadata.
   - Completed narrative beats preserve objective/thread/readiness metadata.
   - Multi-tick story progression can move from exploration to threat/ready to `start_combat`.
   - Gameplay still skips with `no_combat_trigger` when no explicit trigger exists.
   - A narrative/admin combat trigger creates a gameplay encounter and consumes the trigger idempotently.

4. **Improve admin diagnostics.**
   - Show latest tick status, attempts, next retry time, room `last_error`, current objective, open threads, `ttrpgPhase`, `combatReadiness`, `requestedGameplayAction`, `lastCombatTriggerBeatId`, `consumedCombatTriggerBeatId`, and `lastEncounterSeed`.
   - This should make parse failures, missing triggers, retry waits, and normal cadence distinguishable.

5. **Verify deployment schema baseline.**
   - Confirm `20260524000000_create_location_room_gameplay_runs.sql` is applied in the target DB because current code expects gameplay runs and `eliza_location_room_ticks.gameplay_run_id`.
   - Regenerate Supabase types for location-room tables.
   - Do not treat absent `turn_intent` or `story_phase` columns as a blocker unless the product chooses to add those as new functionality.

### Later improvements

1. Add scalar `story_phase` or similar columns only if admin querying/analytics need them; metadata-backed phase/readiness is sufficient for current routing.
2. Add an adventure-active cadence or run-specific tick interval so fresh adventures progress faster than the default 360-minute room cadence.

## Preventive Measures

- Add a regression test that malformed narrative GM JSON receives one repair attempt before the tick fails visibly.
- Add a multi-tick TTRPG progression test covering objective creation, threat escalation, combat trigger creation, and gameplay encounter handoff.
- Keep the gameplay coordinator guard that refuses encounter creation without an explicit `encounterTrigger`.
- Add prompt contract tests that require objective/open-thread progression language and explicit `start_combat` trigger semantics.
- Add admin inspection coverage for durable tick intent, retry/dead tick state, current objective, phase/readiness, combat trigger ids, and safe GM repair/parse-failure diagnostics.
- Add a deployment checklist item to verify the latest location-room migrations and regenerated Supabase types before runtime testing.
- Document that `turn_intent` and `story_phase` are not currently part of the schema; if added later, they should be treated as new behavior rather than assumed drift.
- Document expected cadence: cron runs every 15 minutes, but room progression defaults to `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES=360` unless overridden.
