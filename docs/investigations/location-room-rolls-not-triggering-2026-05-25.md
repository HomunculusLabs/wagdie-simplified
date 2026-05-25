# Investigation: Location Room Rolls Not Triggering

## Summary
Crow's Den is not rolling because scheduled `auto` ticks are narrative-first and only enter gameplay after an active encounter or an unconsumed narrative/admin gameplay trigger. Dev config is enabled and allowlisted for Crow's Den, but the latest narrative state has no `requestedGameplayAction`, no combat trigger id, and remains in exploration/none/0, so the worker correctly stays on the narrative path.

## Symptoms
- Crow's Den automatic scheduled ticks complete successfully with `failed = 0`.
- GM narrative and agent messages are posted.
- After observed ticks, DB counts remain `gameplay_states = 0`, `encounters = 0`, `gameplay_turns = 0`.
- The user expects dice rolls / structured gameplay choices to occur as part of the TTRPG loop.

## Background / Prior Research
- Dev observation on 2026-05-25 after deploying `c48868b3 feat: add agent dice-roll choices to location rooms`: tick 1 and tick 2 completed automatically at 2-minute cadence, but gameplay counts remained zero.
- Recent dev messages showed story progression only: GM opener, Vola response, GM escalation, second character response.
- No external research needed; this is in-repo flow and deployed DB behavior.

## Investigator Findings
<!-- Pair investigator appends findings here. -->

### 2026-05-25 - Routing/metadata verification

**Finding 1 - Scheduled `auto` ticks are enqueued as narrative-capable auto ticks, not pre-attached gameplay turns.**
- Evidence: `runScheduledWorker()` calls `enqueueDueScheduledTicks()`, claims due ticks, and sends each claimed tick to `processClaimedTick()` / `processClaimedTickUnsafe()` (`lib/eliza/locationRooms/service.ts:808-865`, `lib/eliza/locationRooms/service.ts:1324-1389`). Scheduled due rooms enqueue ticks with `triggerType: 'scheduled'`, `gameplayRunId: null`, and `turnIntent: 'auto'` (`lib/eliza/locationRooms/service.ts:782-789`).
- Conclusion: automatic Crow's Den ticks begin as normal auto ticks. They do not inherently create gameplay runs, gameplay turns, dice rolls, or structured roll-card messages.

**Finding 2 - Gameplay routing requires gameplay enabled+allowlisted, then either an active encounter or an explicit combat trigger.**
- Evidence: the gameplay feature gate returns false unless `elizaConfig.locationRooms.gameplay.enabled` is true and the location id appears in `locationAllowlist` (`lib/eliza/locationRooms/service.ts:409-418`); config reads those values from `ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED` and `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_ALLOWLIST` / `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_IDS` (`lib/eliza/config.ts:280-285`). Inside `processClaimedTickUnsafe()`, gameplay routing is considered only under that gate (`lib/eliza/locationRooms/service.ts:1420-1423`). With no active encounter, admin `combat` builds a manual trigger, scheduled/manual `auto` consults narrative state, and `story` does not consume a trigger (`lib/eliza/locationRooms/service.ts:1424-1438`). Only `activeEncounter || encounterTrigger` calls `ensureGameplayRunForCombat()` and `gameplayCoordinator.processTurn()` (`lib/eliza/locationRooms/service.ts:1441-1460`); otherwise processing falls through to the narrative coordinator (`lib/eliza/locationRooms/service.ts:1491-1524`).
- Conclusion: the hypothesis is confirmed for service routing. Gameplay-enabled/allowlisted is necessary but not sufficient; auto ticks stay narrative-only unless combat is already active or a valid unconsumed trigger exists.

**Finding 3 - The unconsumed narrative trigger is exactly `requestedGameplayAction === 'start_combat'` plus an unconsumed `lastCombatTriggerBeatId`.**
- Evidence: `isUnconsumedCombatTrigger()` requires `requestedGameplayAction === 'start_combat'`, a truthy `lastCombatTriggerBeatId`, and `consumedCombatTriggerBeatId !== lastCombatTriggerBeatId` (`lib/eliza/locationRooms/service.ts:402-407`). `buildEncounterTriggerFromNarrativeState()` returns null unless that predicate passes and a trigger id exists; otherwise it returns a narrative/admin encounter trigger for gameplay (`lib/eliza/locationRooms/service.ts:1036-1063`).
- Evidence: narrative beats persist GM output metadata including `requestedGameplayAction` and `encounterSeed` (`lib/eliza/locationRooms/narrativeCoordinator.ts:120-130`, `lib/eliza/locationRooms/narrativeCoordinator.ts:294-301`). After the character reaction, narrative state stores `requestedGameplayAction`, `lastEncounterSeed`, and sets `lastCombatTriggerBeatId` to the beat id only when the requested action is `start_combat`; otherwise it clears that trigger id (`lib/eliza/locationRooms/narrativeCoordinator.ts:385-393`). Gameplay encounter creation consumes the trigger by writing `requestedGameplayAction: null` and `consumedCombatTriggerBeatId` (`lib/eliza/locationRooms/gameplay/coordinator.ts:480-498`).
- Conclusion: a Crow's Den state with `requestedGameplayAction=null` or no fresh `lastCombatTriggerBeatId` cannot route an automatic tick into gameplay.

**Finding 4 - Dice rolls / roll-card choices are downstream of gameplay turn execution, so narrative-only ticks cannot emit them.**
- Evidence: if `LocationRoomGameplayCoordinator.processTurn()` is called with no active encounter and no valid `encounterTrigger`, it immediately returns `status: 'skipped', reason: 'no_combat_trigger'` before generating an encounter proposal (`lib/eliza/locationRooms/gameplay/coordinator.ts:405-421`). Actual action generation and mechanic resolution happen only after an encounter exists: it creates/reuses a gameplay turn (`lib/eliza/locationRooms/gameplay/coordinator.ts:518-526`), generates/validates a gameplay action (`lib/eliza/locationRooms/gameplay/coordinator.ts:641-658`), resolves mechanics/dice and stores `diceResults` (`lib/eliza/locationRooms/gameplay/coordinator.ts:664-690`), then appends the public roll-card message with `gameplayMessageKind: 'roll_card'` and optional `publicRolls` (`lib/eliza/locationRooms/gameplay/coordinator.ts:817-840`).
- Conclusion: the missing dice rolls are an expected consequence of not entering gameplay turn execution.

**Finding 5 - Regression tests encode the expected fallthrough and trigger behavior.**
- Evidence: `routes an allowlisted gameplay room through narrative when no encounter or trigger exists` sets gameplay enabled and allowlists `loc-1`, runs the scheduled worker, asserts `gameplayCoordinator.processTurn` is not called, and asserts `narrativeCoordinator.processTurn` is called (`tests/api/eliza/location-room-service.test.ts:1702-1746`). `routes an unconsumed narrative combat trigger into gameplay with seed and speaker instruction` proves a narrative state with `requestedGameplayAction: 'start_combat'`, `lastCombatTriggerBeatId`, and unconsumed state enters gameplay and passes an `encounterTrigger` (`tests/api/eliza/location-room-service.test.ts:1749-1821`). `routes story intent through narrative without consuming an unconsumed combat trigger` proves `story` intent bypasses trigger consumption (`tests/api/eliza/location-room-service.test.ts:1820-1862`). `does not consume an already-consumed narrative combat trigger twice` proves consumed triggers fall back to narrative (`tests/api/eliza/location-room-service.test.ts:1990-2015`). At the coordinator level, `does not create an encounter without an explicit combat trigger` asserts `no_combat_trigger` and no encounter proposal/create call (`tests/lib/eliza/location-room-gameplay-coordinator.test.ts:491-504`).
- Verification: `bun run test tests/api/eliza/location-room-service.test.ts tests/lib/eliza/location-room-gameplay-coordinator.test.ts --runInBand` passed: 2 suites, 65 tests.

**Finding 6 - Local dev env does not currently enable the gameplay gate; DB verification was not reachable from this session.**
- Evidence: `.env.local` / `.env` contain Supabase and sync credentials, but no `ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED`, `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_ALLOWLIST`, or `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_IDS` values were present in the files or process environment checked from this workspace. Given config defaults (`lib/eliza/config.ts:280-285`), local dev gameplay evaluates to disabled with an empty allowlist unless these are supplied by another runtime layer.
- DB feasibility: a read-only Supabase check for location id `11` was attempted using the present local env credentials; both sandboxed and escalated attempts failed with `TypeError: fetch failed`, so current Crow's Den DB metadata could not be independently verified from this session.

**Overall conclusion:** The hypothesis is confirmed by current code and tests. Scheduled automatic ticks only reach gameplay/roll execution when the location is gameplay-enabled and allowlisted, and there is either an active encounter or an unconsumed narrative/admin combat trigger. Otherwise the tick proceeds through the narrative coordinator, producing GM/agent narrative messages but no gameplay state, encounter, gameplay turn, dice results, or structured roll-card choices.

## Investigation Log

### Phase 1 - Initial Triage
**Hypothesis:** The story loop is working, but the gameplay/roll loop is gated behind a combat or gameplay action that the GM has not requested, or the coordinator is not routing narrative actions into gameplay state.
**Findings:** Initial deployed DB evidence shows narrative messages and ticks, but zero gameplay rows.
**Evidence:** Dev DB counts after automatic ticks: `gameplay_states = 0`, `encounters = 0`, `gameplay_turns = 0`.
**Conclusion:** Needs code-path investigation from scheduled tick → GM beat → gameplay coordinator / roll-choice generation.

### Phase 4 - Dev Runtime Config and Narrative State
**Hypothesis:** Dev may not be rolling because gameplay is disabled or Crow's Den is missing from the gameplay allowlist.
**Findings:** Dev runtime config has gameplay enabled and Crow's Den allowlisted, so config is not the current blocker. The latest narrative state has no gameplay trigger.
**Evidence:** Runtime env: `ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED=true`, `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_ALLOWLIST=11`. Latest Crow's Den narrative metadata: empty `requestedGameplayAction`, empty `lastCombatTriggerBeatId`, empty `consumedCombatTriggerBeatId`, `ttrpgPhase=exploration`, `combatReadiness=none`, `threatLevel=0`.
**Conclusion:** Confirmed design/routing gate, not dev config disablement.

## Root Cause
The primary root cause is the current routing design, not broken dice code. Dice-roll choices and roll cards are implemented downstream of `LocationRoomGameplayCoordinator.processTurn()`, but scheduled `auto` ticks only call that coordinator when gameplay is enabled/allowlisted and either an active encounter exists or an unconsumed `start_combat` trigger exists.

Crow's Den dev config is enabled and allowlisted:
- `ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED=true`
- `ELIZA_LOCATION_ROOM_GAMEPLAY_LOCATION_ALLOWLIST=11`

The current Crow's Den narrative state does not provide the trigger required to enter gameplay:
- `requestedGameplayAction`: empty/null
- `lastCombatTriggerBeatId`: empty/null
- `consumedCombatTriggerBeatId`: empty/null
- `ttrpgPhase`: `exploration`
- `combatReadiness`: `none`
- `threatLevel`: `0`

Therefore the observed DB state (`gameplay_states = 0`, `encounters = 0`, `gameplay_turns = 0`) is expected under the current architecture: narrative ticks can advance indefinitely without rolls unless the GM starts combat or an admin manually triggers combat.

## Recommendations
1. Keep `start_combat` conservative, but add a separate non-combat roll trigger instead of forcing every roll through combat. Suggested new action: `request_check`, `scene_check`, or `start_skill_challenge`.
2. Extend narrative metadata with a one-shot non-combat trigger id, e.g. `lastRollTriggerBeatId` / `consumedRollTriggerBeatId`, parallel to the combat trigger consumption model.
3. Add a lightweight scene-check coordinator or a no-monster `scene_challenge` gameplay mode. Do not reuse monster/combat encounter assumptions for ordinary exploration checks.
4. Update the GM contract so exploration/threat beats can request specific checks without starting combat: perception, survival, stealth, athletics, persuasion, history/religion/arcana, etc.
5. Keep admin `combat` as the force-start combat path for testing full encounter/roll-card behavior.
6. Add admin diagnostics showing why the latest tick routed to narrative vs combat/gameplay: gameplay disabled, not allowlisted, no active encounter, no unconsumed combat trigger, no unconsumed roll trigger.

## Preventive Measures
- Add routing logs/metrics for each scheduled tick: gameplay gate result, active encounter id, trigger ids, selected route, and skip reason.
- Add regression tests for non-combat roll routing once implemented: narrative beat requests a scene check → next auto tick consumes exactly one roll trigger → public roll card is written → trigger is marked consumed.
- Document current behavior in admin UI: scheduled ticks are narrative-first; roll cards currently appear only after gameplay/combat routing starts.
