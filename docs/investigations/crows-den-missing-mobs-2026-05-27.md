# Investigation: Crow's Den Missing Mobs

## Summary
Crow's Den is not summoning mobs because it is currently in narrative danger/foreshadowing state, not combat trigger state. Gameplay encounter creation was not attempted because no unconsumed `requestedGameplayAction='start_combat'` trigger exists.

Missing or unseeded Crow's Den monster/encounter metadata likely explains generic danger seeds and weak mob specificity, but it is not the routing blocker by itself.

## Symptoms
- Fresh dev reset completed one scheduled tick successfully.
- First post-reset beat produced GM narration and Vola response, but no mob/monster/combat summon.
- Room state after first tick remained exploration with `combatReadiness: none`, `threatLevel: 0`, and `requestedGameplayAction: null`.
- Need determine whether the absence of mobs is intended gating, prompt/model behavior, missing metadata, scene-check escalation flow, or gameplay handoff failure.

## Background / Prior Research
- Dev runtime probe at `2026-05-27T13:22Z` found Crow's Den `location_id=11` had advanced to `tick_count=21` after reset.
- Recent ticks were scheduled `auto` ticks; all listed ticks had `gameplay_run_id=null`.
- Gameplay tables had zero rows for the room: `eliza_location_room_gameplay_states`, `eliza_location_room_gameplay_encounters`, `eliza_location_room_gameplay_turns`, `eliza_location_room_gameplay_runs`, death reviews, and reward claims.
- Narrative state had progressed to `ttrpgPhase='threat'`, `threatLevel=2`, `combatReadiness='foreshadow'`, `requestedGameplayAction=null`, `lastCombatTriggerBeatId=null`, `consumedCombatTriggerBeatId=null`.
- Latest completed beat metadata had scene-check escalation `decision='danger'`, `threatLevel=2`, and `encounterSeed.title='Escalating danger'`, but `requestedGameplayAction=null`.
- Prior art confirms gameplay/combat is intentionally gated: scheduled `auto` ticks are narrative-first and gameplay requires an active encounter, admin combat intent, or an explicit unconsumed narrative `start_combat` trigger.
- `isUnconsumedCombatTrigger()` requires `requestedGameplayAction === 'start_combat'`, `lastCombatTriggerBeatId`, and not already consumed (`lib/eliza/locationRooms/service.ts:436-441` per prior-art probe).
- Scene-check escalation deliberately does not directly request combat: `danger` and `combat_ready` set threat/readiness metadata and `lastEncounterSeed`, but leave `requestedGameplayAction=null`.
- GM scene-check outcome prompt says scene checks must never request combat directly; `combat_ready` means a later GM beat may choose combat.
- Location metadata sections `80_encounters` and `30_monsters` feed escalation candidates, but they are hints/seeds unless later converted into a `start_combat` request and gameplay handoff.

## Investigator Findings

### 2026-05-27 Read-only investigator pass

**Scope / safety:** Source, DB, containers, and room state were not mutated. One runtime check used public read APIs only; direct private Supabase SELECT attempts were not available from this session (`localhost:8010` fetch failure for `.env.local`, `PGRST301 JWSError JWSInvalidSignature` for `.env`). Two child probes that requested live Supabase approval were cancelled; the completed child probe covered code/tests for service and gameplay triggers.

**Runtime evidence after more ticks:**
- Public room read at `2026-05-27T13:34:43Z` from `GET http://localhost:3000/api/eliza/location-rooms/11?pageSize=50` reported canonical room `0fccb62c-acd6-481c-9548-0b9241b0b3c1`, `locationId=11`, `tickCount=27`, `tickEnabled=true`, `lastTickAt=2026-05-27T13:34:10.033Z`, `nextTickAt=2026-05-27T13:36:10.033Z`, and `60` public messages. The latest visible message was still a `game_master` narrative/scene-check consequence: a critical-failure investigate check, not a combat encounter setup.
- The same public response did not include a `gameplay` summary. That public endpoint only projects gameplay when `isLocationRoomGameplayEnabledForLocation()` returns true and can load gameplay state/encounter (`lib/eliza/locationRooms/service.ts:536-557`, `lib/eliza/locationRooms/service.ts:298-329`), so this corroborates “no visible active gameplay” but does not expose private tick `gameplay_run_id` or private `requestedGameplayAction`.
- Prior DB evidence in this report remains the load-bearing private-state evidence: at `2026-05-27T13:22Z`, all recent ticks had `gameplay_run_id=null`, gameplay tables were empty, and narrative state had `requestedGameplayAction=null` / no combat trigger.

**Combat trigger gate verified:**
- Gameplay routing is intentionally edge-triggered. `isUnconsumedCombatTrigger()` requires exactly `requestedGameplayAction === 'start_combat'`, a truthy `lastCombatTriggerBeatId`, and `consumedCombatTriggerBeatId !== lastCombatTriggerBeatId` (`lib/eliza/locationRooms/service.ts:436-441`).
- `buildEncounterTriggerFromNarrativeState()` returns `null` unless that gate passes, then carries the trigger id, source, optional recent beat speaker instruction, and optional `lastEncounterSeed` into gameplay (`lib/eliza/locationRooms/service.ts:1137-1165`).
- `processClaimedTick()` routes to gameplay only when gameplay is enabled and either an active encounter exists, admin `combat` intent synthesizes a trigger, or an `auto` tick sees an unconsumed narrative trigger; `story` intentionally does not consume/start combat from a pending trigger (`lib/eliza/locationRooms/service.ts:1468-1501`). When a trigger/active encounter exists, the service creates/reuses a gameplay run and calls `gameplayCoordinator.processTurn(...)` with the `encounterTrigger` (`lib/eliza/locationRooms/service.ts:1508-1537`).
- The gameplay coordinator consumes a trigger by clearing `requestedGameplayAction` and writing `consumedCombatTriggerBeatId` while moving TTRPG metadata to combat (`lib/eliza/locationRooms/gameplay/coordinator.ts:482-493`).

**GM validation and persistence verified:**
- The GM parser accepts only `null`/empty or `start_combat` for `requestedGameplayAction`; other values throw (`lib/eliza/locationRooms/gameMasterGenerator.ts:292-300`).
- A `start_combat` GM beat is valid only when it is not combined with a scene check and has `ttrpgPhase='threat'`, `combatReadiness='ready'`, and a public-safe `encounterSeed`; `ready` itself requires threat phase and `threatLevel >= 3` (`lib/eliza/locationRooms/gameMasterGenerator.ts:483-511`).
- Completed narrative beats persist GM TTRPG fields and set `lastCombatTriggerBeatId` only when `requestedGameplayAction === 'start_combat'`; otherwise it is reset to `null` (`lib/eliza/locationRooms/narrativeCoordinator.ts:959-973`).
- Admin `combat` intent can synthesize a durable manual trigger (`manual:<tickId>`) with `threat/ready/start_combat` metadata (`lib/eliza/locationRooms/service.ts:1100-1124`).

**Scene-check escalation does not summon mobs by design:**
- Failed scene checks floor to `danger` (`failure -> threatLevel 2`, `critical_failure -> threatLevel 3`) (`lib/eliza/locationRooms/encounterEscalation.ts:230-249`).
- `danger` patches set `ttrpgPhase='threat'`, `combatReadiness='foreshadow'`, and `requestedGameplayAction=null`; `combat_ready` patches set `threat/ready/threatLevel>=3` and `lastEncounterSeed`, but still force `requestedGameplayAction=null` (`lib/eliza/locationRooms/encounterEscalation.ts:313-333`).
- The scene-check outcome persistence path explicitly applies the normalized escalation and then forces `requestedGameplayAction:null` and `lastCombatTriggerBeatId:null` (`lib/eliza/locationRooms/narrativeCoordinator.ts:1229-1246`).
- The scene-check outcome prompt says outcomes must never request combat directly and that `combat_ready` only means the next GM beat may choose combat (`lib/eliza/locationRooms/gameMasterGenerator.ts:1118-1123`). The normal GM beat prompt repeats that even `combatReadiness='ready'` should be handled case-by-case and must not automatically start combat (`lib/eliza/locationRooms/gameMasterGenerator.ts:879-885`, `lib/eliza/locationRooms/gameMasterGenerator.ts:929-935`).

**Crow's Den metadata visibility:**
- Public location reads at `2026-05-27T13:33Z` for `GET /api/locations/11` on localhost/fate/runiverse all returned canonical `id='11'`, `name="The Crow's Den"`, `chain_location_id='11'`, and metadata keys limited to map/canonicalization fields (`active`, `bounds`, `center`, `isActive`, `is_active`, `coordinates`, `chain_location_id`, `canonical_location_id`). No `metadata.adventureCatalog`, `80_encounters`, or `30_monsters` sections were visible. The legacy duplicate `crows_den` row from `GET /api/locations` was also metadata-only and had no catalog.
- The public locations API returns `LocationService` data directly (`app/api/locations/[id]/route.ts:28-33`) and the repository normalizes raw `locations.metadata` through `normalizeLocationMetadata()` (`lib/repositories/locationRepository.ts:124-146`), whose normalizer preserves a valid `adventureCatalog` when present (`lib/domain/location/metadata.ts:300-336`). Therefore this is evidence that the currently served Crow's Den location metadata does not contain a usable adventure catalog, not merely that the public API strips it.
- Location-room prompts can use `narrativeState.metadata.adventureCatalog` or `narrativeState.metadata.locationMetadata.adventureCatalog` for quiet inspiration and scene-check escalation candidates (`lib/eliza/locationRooms/gameMasterGenerator.ts:973-1002`, `lib/eliza/locationRooms/gameMasterGenerator.ts:1088-1105`). Encounter seed selection likewise prefers visible `80_encounters` first and `30_monsters` second when such catalog data is present in narrative state metadata (`lib/eliza/locationRooms/encounterEscalation.ts:132-153`, `lib/eliza/locationRooms/encounterEscalation.ts:257-295`).
- However, the default location-room repository method used by `getPublicRoom()` / tick validation loads only `id,name` (`lib/eliza/locationRooms/repository.ts:281-287`), and `ensureStateForRoom()` inserts a new narrative state with `metadata: input.metadata ?? {}` (`lib/eliza/locationRooms/narrativeRepository.ts:161-179`). Current production code has a `seedAdventureMetadataFromCatalog()` helper (`lib/eliza/locationRooms/narrativeTypes.ts:933-960`) but no runtime usage in `lib/eliza/locationRooms/*`. So even if a location row later gains catalog metadata, the location-room narrative state must explicitly carry/seed it before the GM and scene-check prompts can see it.

**Existing tests / eliminated hypotheses:**
- Not a gameplay handoff failure: service tests prove an unconsumed narrative trigger routes into gameplay with seed and speaker instruction (`tests/api/eliza/location-room-service.test.ts:1962-2015`), story intent does not consume a trigger (`tests/api/eliza/location-room-service.test.ts:2017-2076`), active encounters continue through gameplay (`tests/api/eliza/location-room-service.test.ts:2078-2131`), admin combat trigger repair/persistence works (`tests/api/eliza/location-room-service.test.ts:2134-2185`), and already-consumed triggers do not route again (`tests/api/eliza/location-room-service.test.ts:2188-2229`).
- Not a scene-check bypass bug: escalation tests assert `combat_ready` does not include `lastCombatTriggerBeatId` and catalog seeds/hints are advisory (`tests/lib/eliza/location-room-encounter-escalation.test.ts:120-204`). GM-generator tests also show visible catalog candidates are included while reveal-gated ones are hidden (`tests/lib/eliza/location-room-game-master-generator.test.ts:1336-1368`).
- Missing/unused Crow's Den catalog is a contributing quality/seed issue, not sufficient by itself to explain no mobs: catalog entries are hints for `encounterSeed` and prompt inspiration, but gameplay still requires a later explicit `start_combat` trigger.

**Root cause:** Crow's Den is not summoning mobs because the current runtime has escalated danger through narrative/scene-check state but has not produced a valid unconsumed `requestedGameplayAction='start_combat'` trigger. This is the intended explicit-trigger gate, not a broken gameplay coordinator. Scene-check `danger`/`combat_ready` intentionally stop short of combat; the next normal GM beat must decide to emit `start_combat`, or an admin `combat` tick must synthesize the trigger. Additionally, currently served Crow's Den location metadata does not expose `80_encounters` / `30_monsters`, and the location-room state path does not seed location metadata by default, so catalog-authored mobs are not available as prompt candidates in the observed flow.

**Recommended fixes/checks:**
1. Decide the product policy for “mobs should appear.” If `combat_ready` plus repeated danger should reliably create encounters, add a deterministic progression rule: after `combatReadiness='ready'` and `threatLevel >= 3` for N eligible auto beats, require the next GM beat to emit `start_combat` with the last encounter seed, or add an explicit backend promotion step that writes a normal unconsumed trigger. Keep scene-check outcomes themselves non-combat to preserve the current separation.
2. Add/restore Crow's Den `locations.metadata.adventureCatalog.sections['80_encounters']` and `['30_monsters']` entries, then update the location-room state initialization/refresh path to load `getLocationDetails()` and seed/carry normalized catalog metadata into narrative state (using the existing `seedAdventureMetadataFromCatalog()` helper where appropriate). Add diagnostics showing catalog section counts visible to GM prompts.
3. Add focused regressions: (a) `combat_ready` alone does not route; (b) a following GM `start_combat` beat routes to gameplay and consumes the trigger; (c) Crow's Den-like location metadata is visible in scene-check prompt candidates; (d) a malformed private DB trigger missing ready/seed is either rejected by routing or clearly flagged by diagnostics.
4. Add/extend admin diagnostics and smoke checks to show private `requestedGameplayAction`, `lastCombatTriggerBeatId`, `consumedCombatTriggerBeatId`, `lastEncounterSeed.source/catalogEntryIds`, gameplay enabled/allowlisted status, active encounter/run ids, and `80_encounters`/`30_monsters` visibility. This would make “danger foreshadowing,” “combat-ready but no explicit trigger,” “trigger consumed,” and “gameplay disabled/no catalog” distinguishable without DB spelunking.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The GM/narrative flow is completing, but the encounter/mob summon path is not being triggered or handed off.
**Findings:** Runtime advanced through many narrative ticks and scene-checks, but no unconsumed `start_combat` trigger or gameplay rows were created.
**Evidence:** Background / Prior Research and Investigator Findings above.
**Conclusion:** Confirmed trigger absence. This is expected explicit-trigger gating, not a downstream gameplay handoff failure.

## Root Cause
Primary root cause: **expected explicit-trigger gating**.

Crow's Den has advanced through narrative danger and scene-check escalation, but the observed runtime state does not satisfy the gameplay routing gate:

- `requestedGameplayAction=null`
- `lastCombatTriggerBeatId=null`
- `combatReadiness='foreshadow'`
- `threatLevel=2`
- no gameplay rows and no tick `gameplay_run_id`

The service requires an unconsumed combat trigger before creating gameplay encounters. `isUnconsumedCombatTrigger()` requires `requestedGameplayAction === 'start_combat'`, a truthy `lastCombatTriggerBeatId`, and `consumedCombatTriggerBeatId !== lastCombatTriggerBeatId` (`lib/eliza/locationRooms/service.ts:436-441`). `buildEncounterTriggerFromNarrativeState()` returns `null` unless that gate passes (`lib/eliza/locationRooms/service.ts:1137-1165`).

Scene-check escalation is working as designed, but it does not summon mobs directly. `combat_ready` and `danger` patches set threat/readiness/seed metadata while leaving `requestedGameplayAction:null` (`lib/eliza/locationRooms/encounterEscalation.ts:313-333`). Scene-check outcome persistence also forces `requestedGameplayAction:null` and `lastCombatTriggerBeatId:null` (`lib/eliza/locationRooms/narrativeCoordinator.ts:1229-1246`).

Normal GM beat persistence only creates `lastCombatTriggerBeatId` when the GM output requests `start_combat` (`lib/eliza/locationRooms/narrativeCoordinator.ts:959-973`). Current runtime evidence shows that has not happened.

Secondary contributing issue: Crow's Den currently does not expose visible `adventureCatalog.sections['80_encounters']` or `['30_monsters']` in served location metadata, and the location-room state path does not seed location metadata into narrative state by default. That likely explains fallback/generic `Escalating danger` seeds and weak mob specificity, but it does not bypass the explicit `start_combat` trigger requirement.

## Eliminated Hypotheses
- **Unicode persistence is still blocking ticks:** eliminated for this symptom. Runtime advanced through many completed narrative/scene-check ticks after the Unicode fix.
- **Gameplay coordinator failed after trigger:** unlikely/eliminated for current evidence. Runtime never produced the trigger required to enter gameplay, and tests cover gameplay routing when a trigger exists.
- **Scene-check escalation is broken because it did not start combat:** eliminated. Scene-check escalation intentionally primes danger/readiness and never directly writes combat trigger fields.
- **Missing metadata alone explains no gameplay rows:** eliminated as the primary cause. Missing metadata affects encounter seed quality and mob specificity, but gameplay still requires a later explicit combat trigger.
- **GM prompt conservatism is proven root cause:** not proven yet. The observed private state is `foreshadow` / threat 2, not `ready` / threat >= 3. GM conservatism becomes the main suspect only if the room reaches `combatReadiness='ready'`, `threatLevel>=3`, and `lastEncounterSeed` but later normal GM beats still never emit `start_combat`.

## Recommendations
1. Decide product policy for when mobs should appear. If the expectation is “mobs should reliably appear after sustained danger,” implement that explicitly rather than relying on model discretion.
2. Preserve scene-check separation: do not make scene-check outcomes directly start combat. Instead, either:
   - strengthen later GM beat prompting once `combatReadiness='ready'` and `threatLevel>=3`, or
   - add a deterministic backend promotion rule after sustained `ready` state that writes a normal unconsumed `start_combat` trigger using the last encounter seed.
3. Add/restore Crow's Den `locations.metadata.adventureCatalog.sections['80_encounters']` and `['30_monsters']` so the GM has concrete mob/encounter candidates instead of generic fallback seeds.
4. Update location-room state initialization/refresh so normalized location adventure metadata is actually carried into narrative state/prompt context where `encounterEscalation.ts` and `gameMasterGenerator.ts` can use it.
5. Add diagnostics that expose: `requestedGameplayAction`, `lastCombatTriggerBeatId`, `consumedCombatTriggerBeatId`, `combatReadiness`, `threatLevel`, `lastEncounterSeed.source/catalogEntryIds`, gameplay run/encounter ids, and visible `80_encounters` / `30_monsters` counts.
6. Add regressions for the intended lifecycle: danger does not route combat; `combat_ready` alone does not route; a following GM `start_combat` beat routes to gameplay and consumes the trigger; Crow's Den-like metadata reaches prompt candidates.
7. Run an admin/manual `combat` tick as a control if you want runtime proof that the gameplay handoff works in dev. This is not required to explain the current absence of mobs, but it is useful deployment smoke coverage.

## Preventive Measures
- Keep narrative danger state and combat trigger state distinct in diagnostics and smoke checks.
- Add smoke expectations that distinguish “foreshadowing,” “combat-ready but no trigger,” “trigger pending,” “trigger consumed,” and “active encounter.”
- Require location metadata visibility checks when testing location-specific mob/encounter behavior.
- Avoid treating catalog hints as gameplay state; require explicit trigger creation before gameplay rows are expected.
