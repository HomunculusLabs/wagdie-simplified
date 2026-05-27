# Crow's Den Mob Spawning: Plan

## Goal
Make Crow's Den reliably progress from narrative danger into concrete mob/encounter gameplay when the story reaches combat-ready conditions, while preserving the existing explicit `start_combat` handoff and giving the GM concrete `80_encounters` / `30_monsters` catalog material to draw from.

## Background
- Investigation report: `docs/investigations/crows-den-missing-mobs-2026-05-27.md`.
- Runtime evidence after reset showed many completed narrative/scene-check ticks, but no gameplay rows and no tick `gameplay_run_id`.
- Current private state was danger/foreshadowing, not combat trigger state: `requestedGameplayAction=null`, `lastCombatTriggerBeatId=null`, `combatReadiness='foreshadow'`, `threatLevel=2`.
- Gameplay routing is explicitly edge-triggered: `isUnconsumedCombatTrigger()` requires `requestedGameplayAction === 'start_combat'`, `lastCombatTriggerBeatId`, and an unconsumed trigger (`lib/eliza/locationRooms/service.ts:436-441`).
- `buildEncounterTriggerFromNarrativeState()` returns `null` unless that gate passes, then carries `lastEncounterSeed` and speaker instruction into gameplay (`lib/eliza/locationRooms/service.ts:1137-1165`).
- Normal GM beat persistence creates `lastCombatTriggerBeatId` only when the GM outputs `requestedGameplayAction='start_combat'` (`lib/eliza/locationRooms/narrativeCoordinator.ts:959-973`).
- Scene-check escalation intentionally does not summon combat directly. `danger` and `combat_ready` patches set threat/readiness/seed metadata but leave `requestedGameplayAction=null` (`lib/eliza/locationRooms/encounterEscalation.ts:313-333`), and scene-check outcome persistence forces `requestedGameplayAction:null` and `lastCombatTriggerBeatId:null` (`lib/eliza/locationRooms/narrativeCoordinator.ts:1229-1246`).
- The GM prompt currently tells the GM not to start combat automatically even when ready; readiness is treated as a case-by-case decision point (`lib/eliza/locationRooms/gameMasterGenerator.ts:878-885`, `927-935`).
- Crow's Den currently does not expose usable `adventureCatalog.sections['80_encounters']` or `['30_monsters']` in served location metadata, so danger seeds fall back to generic `Escalating danger`.
- Location metadata normalization supports `30_monsters` and `80_encounters` (`lib/domain/location/metadata-types.ts:5-16`; `lib/domain/location/metadata.ts:155-177`, `326-334`).
- Location-room prompt/catalog code only sees catalog data if narrative state metadata contains `adventureCatalog` or `locationMetadata.adventureCatalog` (`lib/eliza/locationRooms/gameMasterGenerator.ts:973-1002`, `1088-1105`; `lib/eliza/locationRooms/encounterEscalation.ts:132-154`).
- `seedAdventureMetadataFromCatalog()` exists (`lib/eliza/locationRooms/narrativeTypes.ts:933-960`) but currently has no production caller and seeds defaults only, not catalog sections.
- Prior work already established scene-check escalation and trigger handoff as separate concerns. This plan keeps that separation and adds a bridge between sustained readiness and the existing trigger route.

## Approach
Implement this as a targeted narrative/gameplay bridge, not a routing rewrite.

1. Keep scene-check outcomes limited to `danger` / `combat_ready` metadata. They should never directly set `requestedGameplayAction='start_combat'`.
2. When a later eligible `auto` tick sees sustained combat-ready state with a valid seed, promote that state into the existing explicit `start_combat` trigger format.
3. Let the current service/gameplay path consume the trigger and create the encounter. Do not add a second encounter-creation route.
4. Seed and refresh normalized location adventure catalog metadata into narrative state so GM and escalation code can choose concrete Crow's Den monsters/encounters instead of generic fallback danger.
5. Extend diagnostics and smoke tests so operators can distinguish: foreshadowing, ready-without-trigger, pending trigger, consumed trigger, active encounter, and missing catalog data.

### Deterministic promotion policy
On a later eligible `auto` tick, if the room is already combat-ready and has a valid encounter seed but no active encounter and no unconsumed trigger, `LocationRoomService` writes a normal explicit `start_combat` narrative trigger before the existing trigger-read/routing decision. The service should then continue in-memory with the updated narrative state, or re-read the updated state before calling `buildEncounterTriggerFromNarrativeState()`; do not wait for a second auto tick and do not create a separate gameplay route.

Promotion is allowed only when all of these are true:
- `turnIntent === 'auto'`.
- Gameplay is enabled for the room location.
- No active gameplay encounter exists.
- No existing unconsumed combat trigger exists.
- Narrative state exists or can be ensured.
- TTRPG metadata has `ttrpgPhase='threat'`, `combatReadiness='ready'`, `threatLevel >= 3`, no current `requestedGameplayAction='start_combat'`, and a valid `lastEncounterSeed`.
- A source beat id can be resolved.

Promotion is blocked for story ticks, active encounters, existing unconsumed triggers, missing seeds, missing source beat ids, gameplay-disabled locations, or already-consumed source triggers.

Use a real narrative beat id as the trigger id, not a synthetic id. Resolve it in this order:
1. `metadata.lastCombatReadyBeatId`.
2. `metadata.lastBeatId`, only if it belongs to the same ready-state progression and is not already consumed.
3. Latest recent completed narrative beat from `narrativeRepository.listRecentBeatsByRoomId(room.id, 10)`, only if it is safe to treat as the ready source.

For existing ready states without `lastCombatReadyBeatId`, allow fallback promotion only when a valid source beat can be resolved and `consumedCombatTriggerBeatId !== sourceBeatId`. Otherwise wait for a fresh ready transition after source stamping lands.

Write promotion metadata through `mergeNarrativeTtrpgMetadata()` with these required semantics:
- `requestedGameplayAction: 'start_combat'`
- `lastCombatTriggerBeatId: sourceBeatId`
- preserved `lastEncounterSeed`
- preserved `combatReadiness='ready'`
- enough promotion diagnostics to report source beat id, tick id, and timestamp. Exact diagnostic field names are implementation details.

Repeat prevention should use existing semantics: skip while an unconsumed trigger exists, and skip after gameplay writes `consumedCombatTriggerBeatId === sourceBeatId`.

### Combat-ready source stamping
In `narrativeCoordinator.ts`, stamp source metadata whenever state becomes `combatReadiness='ready'` without directly requesting combat:
- Normal GM ready/no-trigger path: `lastCombatReadyBeatId=beat.id`, `lastCombatReadyAt=<iso>`.
- Scene-check `combat_ready` path: `lastCombatReadyBeatId=beat.id`, `lastCombatReadySceneCheckId=<sceneCheckId>`, `lastCombatReadyAt=<iso>`.

Do not set `lastCombatTriggerBeatId` in these paths. That remains reserved for explicit `start_combat` triggers.

### Adventure catalog propagation
Store normalized catalog metadata at `narrativeState.metadata.adventureCatalog`. Do not store raw location metadata.

Add or extend a pure helper in `narrativeTypes.ts` that:
- Accepts existing narrative metadata and location metadata.
- Normalizes location `adventureCatalog` using the existing domain metadata helpers.
- Writes/refreshes `metadata.adventureCatalog` when available.
- Treats catalog staleness as a normalized-catalog mismatch: compare stable entry ids, section membership, visibility/reveal flags, and public text fields, not object identity.
- Seeds missing adventure defaults via `seedAdventureMetadataFromCatalog()`.
- Preserves live adventure memory fields such as outcomes, clocks, discoveries, active decisions, consequence ledger, and spatial context.
- Never deletes live narrative memory while refreshing catalog sections.
- Returns updated metadata plus enough change/catalog summary information for diagnostics/tests.

Wire the helper in two runtime paths:
- In `DefaultLocationRoomNarrativeCoordinator.processTurn()`, before the first `ensureStateForRoom()`, load location details via `locationRoomRepository.getLocationDetails(room.locationId)`, pass seeded metadata into state creation, and update existing states whose catalog is missing/stale.
- In `LocationRoomService` before promotion/routing reads TTRPG metadata, run the same refresh so existing Crow's Den rooms can be repaired without a reset.

Validate `locationRoomRepository.getLocationDetails()` returns normalized `metadata`. If it only returns id/name or raw metadata, update it to expose the normalized location metadata needed by the helper.

### Crow's Den catalog data
No schema change is expected, but implementation should inspect existing Supabase migration and seed conventions before choosing the delivery file. Add public-safe Crow's Den catalog data through a Supabase data migration or seed script, not the current admin PATCH route, because `LocationRepository.update()` only preserves known map/location metadata fields.

The data update should target `locations.id='11'` and include visible entries in:
- `metadata.adventureCatalog.sections['80_encounters']`
- `metadata.adventureCatalog.sections['30_monsters']`

Initial entries should not be reveal-gated unless intentionally hidden. Keep mechanics out of location metadata: no HP, DCs, rewards, wallet/private data, or unrevealed spoiler payloads.

### GM prompt alignment
Prompt changes are advisory; backend promotion is the reliability mechanism.

Update `gameMasterGenerator.ts` wording so the GM understands:
- If `combatReadiness='ready'`, it may request `start_combat` when the fiction supports it.
- If it does not request combat, backend promotion may start combat on a later eligible auto tick after sustained readiness.
- Scene-check outcomes should still produce `combat_ready`, not direct `start_combat`.

Keep validation unchanged: `start_combat` still requires threat phase, ready state, threat level, valid seed, and no simultaneous scene-check request.

### Diagnostics
Extend `adminDiagnostics.ts` to show the minimum state needed to explain mob spawning:
- Effective catalog source and visible `80_encounters` / `30_monsters` counts.
- Current seed presence and whether it came from catalog-backed data.
- Readiness state, requested action, trigger id, consumed trigger id, active encounter state, and promotion eligibility/blocker.
- Recommended action that distinguishes missing catalog data from combat-ready-pending-auto-tick.

## Work Items

### Item 1 — Seed and refresh adventure catalog metadata
**Goal:** Make normalized Crow's Den location adventure catalog data available to narrative state, GM prompt generation, and scene-check escalation.

**Done when:**
- A pure helper in `narrativeTypes.ts` merges normalized location `adventureCatalog` into narrative metadata and seeds missing adventure defaults without overwriting live narrative memory.
- Narrative coordinator state creation receives seeded metadata.
- Existing states with missing/stale catalog are refreshed during narrative/service processing.
- `getLocationDetails()` exposes the normalized metadata required by the helper.

**Key files:**
- `lib/eliza/locationRooms/narrativeTypes.ts:933-960`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/repository.ts`
- `lib/domain/location/metadata.ts:155-177`, `326-334`
- `lib/domain/location/metadata-types.ts:5-16`

**Dependencies:** Existing location metadata normalization and public catalog schema.

**Size:** Medium.

### Item 2 — Add deterministic combat-ready promotion
**Goal:** Convert sustained `combat_ready` narrative state into the existing explicit `start_combat` trigger on a later eligible auto tick.

**Done when:**
- `LocationRoomService` has a private promotion helper with the gate described above.
- Promotion writes `requestedGameplayAction='start_combat'` and `lastCombatTriggerBeatId=<sourceBeatId>` through existing TTRPG metadata merge semantics.
- Promotion uses a narrative beat id as trigger id.
- Story ticks, missing seeds, missing source beats, active encounters, existing unconsumed triggers, consumed source triggers, and gameplay-disabled locations do not promote.
- Existing gameplay handoff and consumption remain the only encounter-creation path.

**Key files:**
- `lib/eliza/locationRooms/service.ts:436-441`, `1137-1165`, `1420-1779`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts:330-740`

**Dependencies:** Item 1 catalog refresh and Item 3 source stamping should land first so promotion has concrete seeds and stable source beat ids when metadata exists.

**Size:** Medium.

### Item 3 — Stamp combat-ready source metadata
**Goal:** Give promotion a stable source beat id when readiness comes from either normal GM output or scene-check escalation.

**Done when:**
- Normal GM ready/no-trigger persistence stamps `lastCombatReadyBeatId` and timestamp.
- Scene-check `combat_ready` persistence stamps `lastCombatReadyBeatId`, `lastCombatReadySceneCheckId`, and timestamp.
- Scene-check persistence still forces `requestedGameplayAction:null` and `lastCombatTriggerBeatId:null`.
- Normal GM `start_combat` still writes the direct trigger exactly as before.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts:900-1279`
- `lib/eliza/locationRooms/encounterEscalation.ts:313-333`

**Dependencies:** Item 2 uses these source fields, but this can be developed alongside the service helper.

**Size:** Small-to-medium.

### Item 4 — Align GM prompt text without making prompt behavior load-bearing
**Goal:** Let the GM request combat when ready while making clear that backend promotion is the reliability mechanism.

**Done when:**
- Ready-state prompt language no longer discourages all automatic combat starts.
- Scene-check prompt language still treats `combat_ready` as readiness, not direct combat.
- GM validation still rejects unsafe or malformed `start_combat` requests.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:878-885`, `927-935`, `973-1002`, `1088-1105`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Item 2 policy should be fixed first so prompt copy matches backend behavior.

**Size:** Small.

### Item 5 — Extend diagnostics and smoke coverage
**Goal:** Make the admin/debug surface explain why mobs are or are not spawning.

**Done when:**
- Diagnostics show catalog source, visible encounter/monster counts, effective seed details, promotion eligibility, source beat id, blocker reason, pending trigger, consumed trigger, and active encounter status.
- Recommended action distinguishes missing catalog data from combat-ready-pending-auto-tick.
- Crow's Den smoke doc verifies catalog visibility, ready-no-trigger state, auto promotion, trigger consumption, and gameplay encounter creation.

**Key files:**
- `lib/eliza/locationRooms/adminDiagnostics.ts:388-878`
- `docs/operations/crows-den-location-room-smoke.md`

**Dependencies:** Items 1-3 define the data diagnostics should report.

**Size:** Medium.

### Item 6 — Add regression tests for the full lifecycle
**Goal:** Lock down the intended narrative-to-gameplay lifecycle so future prompt/routing changes do not silently break mob spawning.

**Done when:**
- Service tests cover the critical routing lifecycle: danger/foreshadow no-route, story tick no-promotion, auto promotion, gameplay routing, trigger consumption, missing seed/source skip, existing trigger skip, and consumed source skip.
- Narrative coordinator tests cover source stamping and the invariant that scene-check `combat_ready` never writes a direct trigger.
- GM generator tests cover prompt copy and unchanged validation rules.
- Encounter escalation tests cover visible catalog seed selection and reveal-gated hiding.
- A harness or integration test covers the complete path: scene-check produces `combat_ready`, same scene-check tick does not create gameplay, next story tick stays narrative, next auto tick promotes/enters gameplay, trigger is consumed.

**Key files:**
- `tests/api/eliza/location-room-service.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-encounter-escalation.test.ts`
- `tests/lib/eliza/location-room-narrative-harness.ts`

**Dependencies:** Items 1-5.

**Size:** Large.

### Item 7 — Seed Crow's Den catalog data and verify in dev
**Goal:** Give Crow's Den concrete public-safe encounter/monster content and prove the dev environment can reach gameplay encounters after reset.

**Done when:**
- A Supabase migration or seed script updates `locations.metadata` for `id='11'` with visible `80_encounters` and `30_monsters` catalog entries.
- `GET /api/locations/11` shows normalized catalog metadata.
- Admin diagnostics show visible encounter/monster counts and no catalog-seeding recommendation.
- After resetting Crow's Den in dev, the smoke lifecycle reaches: foreshadow/danger, combat_ready, promoted trigger, active gameplay encounter, consumed trigger.

**Key files:**
- `supabase/migrations/...`
- `app/api/locations/[id]/route.ts`
- `lib/repositories/locationRepository.ts`
- `docs/operations/crows-den-location-room-smoke.md`

**Dependencies:** Items 1-6 for runtime and diagnostics. Product-approved Crow's Den encounter/monster text is required for production content; committed seed/migration content should not use placeholders unless the team explicitly accepts dev-only fixture wording and keeps it out of production data paths.

**Size:** Small-to-medium.

## Implementation Order
1. Add the narrative metadata catalog merge helper and tests.
2. Wire catalog seeding/refresh through narrative coordinator and service; validate location metadata loading.
3. Stamp combat-ready source ids in normal and scene-check persistence paths.
4. Add the service promotion helper and route promoted state through the existing trigger handoff.
5. Add lifecycle regression tests around service/coordinator/gameplay consumption.
6. Update GM prompt text and generator tests.
7. Extend diagnostics and smoke documentation.
8. Seed Crow's Den `80_encounters` / `30_monsters` data.
9. Deploy to dev, reset Crow's Den, and run the smoke lifecycle.

## Open Questions
- Crow's Den catalog content still needs product-approved encounter and monster copy. Do not commit placeholder content to production-bound migrations unless the team explicitly approves it; use dev-only fixtures or a local seed path for temporary validation.
- Promotion threshold is intentionally set to “later eligible auto tick after ready state.” If product wants extra dramatic delay, add a numeric ready-age threshold before implementation; otherwise use the next eligible auto tick for reliability.

## References
- `docs/investigations/crows-den-missing-mobs-2026-05-27.md`
- `docs/operations/crows-den-location-room-smoke.md`
- `docs/plans/narrative-encounter-escalation-2026-05-26.md`
