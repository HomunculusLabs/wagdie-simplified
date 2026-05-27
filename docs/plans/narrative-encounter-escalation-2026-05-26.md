# Narrative Encounter Escalation: Plan

## Goal
Make location-room narrative scenes escalate into structured danger or combat when the fiction earns it, especially after hostile failed rolls, while preserving story-first routing and using location adventure metadata as the preferred encounter source.

## Background
- User decisions for this plan: escalation should be **fast**; the GM should decide whether escalation becomes danger/trap pressure or full combat; combat encounter content should prefer **location metadata** over generic invention.
- Existing combat handoff is explicit-trigger based. `LocationRoomNarrativeTtrpgMetadata` tracks `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, `lastEncounterSeed`, `lastCombatTriggerBeatId`, and `consumedCombatTriggerBeatId` (`lib/eliza/locationRooms/narrativeTypes.ts:85`).
- GM beat validation already permits combat only when the scene is in threat mode, combat readiness is ready, threat level is high enough, and an encounter seed exists (`lib/eliza/locationRooms/gameMasterGenerator.ts:469`). This preserves the previous design constraint that combat must be explicitly triggered.
- Narrative coordinator writes the durable combat trigger when GM output requests `start_combat`, including `lastEncounterSeed` and `lastCombatTriggerBeatId` (`lib/eliza/locationRooms/narrativeCoordinator.ts:913`).
- Service routing converts an unconsumed narrative combat trigger into gameplay routing on `auto` ticks and calls `gameplayCoordinator.processTurn` (`lib/eliza/locationRooms/service.ts:1140`, `lib/eliza/locationRooms/service.ts:1505`).
- Scene-check failures currently generate and persist visible consequences through `GameMasterBeatGenerator.generateSceneCheckOutcome()` or fallback (`lib/eliza/locationRooms/gameMasterGenerator.ts:1026`, `lib/eliza/locationRooms/gameMasterGenerator.ts:1214`). Failure tiers must include consequence language and `adventurePatch.consequenceLedger` (`lib/eliza/locationRooms/gameMasterGenerator.ts:1048`, `lib/eliza/locationRooms/gameMasterGenerator.ts:1162`).
- Important gap: scene-check GM outcomes update state summary, open threads, adventure memory, and spatial context, but persisted TTRPG combat metadata is copied from the earlier GM beat output, not from the scene-check outcome (`lib/eliza/locationRooms/narrativeCoordinator.ts:1155`, `lib/eliza/locationRooms/narrativeCoordinator.ts:1159`). This is why a failed roll can say “attention turns hostile” without making the next tick combat-ready.
- Adventure memory already stores consequences, clocks, active decisions, discoveries, spatial context, last declared action, and last outcome (`lib/eliza/locationRooms/narrativeTypes.ts:221`). Spatial context tracks current area, landmarks, routes, and unresolved spatial questions (`lib/eliza/locationRooms/narrativeTypes.ts:188`).
- Location-authored adventure metadata exists as `locations.metadata.adventureCatalog` with Johnny-decimal sections: `00_setting`, `10_plot`, `20_characters`, `30_monsters`, `40_places`, `50_items`, `60_shops_services`, `70_factions`, `80_encounters`, `90_rules_guidance` (`lib/domain/location/metadata-types.ts:5`).
- Catalog entries are generic `LocationAdventureCatalogEntry` records with `id`, `section`, `title`, `summary`, `tags`, reveal conditions, and related entry ids (`lib/domain/location/metadata-types.ts:20`). Catalog retrieval already injects top private GM inspirations into prompts (`lib/eliza/locationRooms/narrativeTypes.ts:886`, `lib/eliza/locationRooms/gameMasterGenerator.ts:942`).
- Relevant prior art: `docs/plans/ttrpg-story-combat-experience-2026-05-24.md` established story-first routing and single-use combat triggers; `docs/plans/location-room-scene-checks-2026-05-25.md` established non-combat scene checks; `docs/plans/gm-narrative-optimization-2026-05-26.md` added GM beat cadence, spatial memory, roll diversity, and quality gates while preserving explicit combat routing.

## Approach
Implement this as a targeted narrative/gameplay bridge change, not a routing rewrite.

Add an explicit scene-check escalation contract for GM outcome generation, normalize it with backend safety rules, persist it into narrative TTRPG metadata after hostile failed scene checks, and let the **next GM beat** decide whether to keep danger as structured narrative pressure or emit the existing explicit `start_combat` trigger. Combat routing remains unchanged: no active encounter and no unconsumed `start_combat` trigger means the tick stays narrative.

Use a hybrid escalation model:
- The GM outcome may explicitly classify the result as `none`, `danger`, or `combat_ready`.
- Backend normalization treats GM output as raw/untrusted JSON and produces the normalized escalation state.
- Backend normalization enforces a safe floor from the roll tier: hostile failure/critical failure can be promoted to structured danger even if the GM omits it.
- Backend code must not promote an ordinary `failure` directly to `combat_ready`; `combat_ready` requires GM-declared readiness plus a valid seed. `critical_failure` may become `combat_ready` only if the GM declares it and validation succeeds.
- Scene-check outcome escalation may make the scene combat-ready, but it must not directly create `requestedGameplayAction: 'start_combat'` or `lastCombatTriggerBeatId`.
- The next GM beat sees readiness and decides whether the fiction now demands structured combat.

Preserve scene-check separation: this plan must not rewrite roll proposal/adjudication, layered roll inputs, or the non-combat scene-check path. It only changes how hostile scene-check outcomes update narrative threat metadata.

Encounter seeds should become additively richer and should prefer location catalog content from `80_encounters` and `30_monsters`. Seeds remain public-safe continuity hints, not authoritative gameplay mechanics. HP, AC, DCs, rewards, and concrete mechanics still belong to the gameplay proposal/normalization path.

## Design

### Scene-check escalation model
Add normalized escalation metadata for GM scene-check outcomes:

- `decision`: `none | danger | combat_ready`
- `dangerKind`: `trap | hazard | pursuit | social_threat | monster_pressure | environment | unknown`
- `reason`: concise explanation for why this outcome does or does not escalate
- optional `threatLevel`
- optional `encounterSeed`
- optional `catalogEntryIds`

Semantics:
- `none`: no escalation beyond normal adventure memory.
- `danger`: persist structured threat pressure, but do **not** create a combat trigger.
- `combat_ready`: persist `ttrpgPhase: 'threat'`, `combatReadiness: 'ready'`, `threatLevel >= 3`, and an encounter seed, but still do **not** set `requestedGameplayAction: 'start_combat'`.
- Only a later GM beat may emit `requestedGameplayAction: 'start_combat'`.

### Escalation normalization
Create a pure helper module, recommended path: `lib/eliza/locationRooms/encounterEscalation.ts`.

Responsibilities:
- Accept raw GM-provided escalation JSON and normalize it into safe internal state.
- Derive a safe escalation floor from roll tier.
- Enrich missing encounter seeds from catalog metadata.
- Produce a TTRPG metadata patch.
- Preserve old metadata reads because all new fields are optional JSON additions; no database migration should be required.

Backend rules:
- `failure` and `critical_failure` with missing/`none` escalation are promoted to at least `danger`.
- `partial_success` may remain `none` unless GM chooses `danger` or `combat_ready`.
- `danger` sets at least `ttrpgPhase: 'threat'`, `combatReadiness: 'foreshadow'`, and a threat level floor (`>= 2` for failure, `>= 3` for critical failure).
- `combat_ready` sets `ttrpgPhase: 'threat'`, `combatReadiness: 'ready'`, `threatLevel >= 3`, clears direct gameplay action, and ensures `lastEncounterSeed` exists.
- Never set `lastCombatTriggerBeatId` from a scene-check outcome escalation.

### Metadata-first encounter seeds
Extend `LocationRoomEncounterSeed` additively with bounded source metadata and public-safe catalog hints:
- seed source (`gm`, `location_catalog`, `fallback`, or `admin`)
- selected catalog entry ids
- encounter hints
- monster hints

Catalog priority:
1. Normalize catalog from `narrativeState.metadata.adventureCatalog` or `narrativeState.metadata.locationMetadata.adventureCatalog`.
2. Consider only entries that pass existing catalog normalization/safety and reveal-condition constraints.
3. Score `80_encounters` first and `30_monsters` second using current objective, active decision, open threads, recent outcome, tags, selected token id, and GM-provided catalog ids when present.
4. Use the best `80_encounters` entry for seed title/summary/stakes when available.
5. Attach a small bounded set of encounter and monster hints; exact limits can follow existing metadata/token budget conventions.
6. If no catalog match exists, use GM-provided seed.
7. If no GM seed exists, build a fallback seed from outcome narration and roll tier.

### GM scene-check outcome contract
Extend `GameMasterSceneCheckOutcomeOutput` to include escalation JSON. The prompt should state:
- The GM decides case-by-case whether the outcome creates structured danger or combat readiness.
- Scene-check outcome generation must never request combat directly.
- `combat_ready` means “the next GM beat may choose to start combat,” not “route immediately to combat.”
- Prefer listed catalog candidates from `80_encounters` and `30_monsters`.

Fallback scene-check outcomes should emit conservative escalation:
- `danger` for failure/critical failure.
- usually `none` or `danger` for partial success.
- never direct combat.

### Coordinator persistence
In `DefaultLocationRoomNarrativeCoordinator.processTurn()`, after scene-check outcome generation and adventure merge:
- Normalize outcome escalation.
- Build scene adventure metadata as today.
- Apply escalation patch before `mergeNarrativeTtrpgMetadata()`.
- Persist bounded escalation metadata keyed by `sceneCheckId`. The stored normalized escalation for a scene check is authoritative for retry/idempotency; reprocessing the same stored outcome should not re-promote threat or duplicate seed selection.
- Persist diagnostics only where useful for evaluator/debug visibility; exact field names are implementation-owned.

Invariant:
- Scene-check outcome may set `combatReadiness: 'ready'`.
- Scene-check outcome must not set `requestedGameplayAction: 'start_combat'`.
- Existing service combat routing remains unchanged.

### Next GM beat behavior
Update GM beat prompt context so the next beat sees:
- current `ttrpgPhase`
- `combatReadiness`
- `threatLevel`
- `lastEncounterSeed`
- `lastSceneCheckEscalation`

Prompt instruction:
- If combat readiness is `ready`, choose case-by-case: keep structured narrative danger or emit `requestedGameplayAction: 'start_combat'` using the encounter seed.
- Do not start combat automatically just because readiness is ready.

Existing combat validation remains the enforcement point for actual combat triggers.

## Work Items

### Item 1 — Add escalation and richer seed types
**Goal:** Define additive internal types for scene-check escalation and catalog-enriched encounter seeds.

**Done when:**
- `LocationRoomEncounterSeed` supports optional `source`, `catalogEntryIds`, `encounterHints`, and `monsterHints`.
- Scene-check escalation decision and danger-kind types exist.
- Existing callers compile without behavior changes.

**Key files:**
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** None.

**Size:** Small.

### Item 2 — Add pure escalation and catalog-seed helpers
**Goal:** Centralize escalation normalization and metadata-first encounter seed construction.

**Done when:**
- A pure helper module can normalize GM escalation output, derive failure-tier escalation floors, build catalog-preferred seeds from `80_encounters` and `30_monsters`, and return a safe TTRPG metadata patch.
- Unit tests cover failure promotion to `danger`, `combat_ready` never emitting `requestedGameplayAction`, catalog seed preference for `80_encounters`, and monster hints from `30_monsters`.

**Key files:**
- `lib/eliza/locationRooms/encounterEscalation.ts` (new)
- `lib/domain/location/metadata-types.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Extend scene-check outcome GM contract
**Goal:** Ask the GM to classify scene-check outcomes as no escalation, structured danger, or combat-ready.

**Done when:**
- The raw scene-check outcome response schema includes an escalation JSON object.
- Scene-check outcome prompt includes escalation JSON fields and catalog candidate guidance.
- Scene-check outcome parser passes raw escalation to the helper and stores only normalized escalation downstream.
- Fallback scene-check outcome emits conservative escalation and never direct combat.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/encounterEscalation.ts`

**Dependencies:** Items 1–2.

**Size:** Medium.

### Item 4 — Persist outcome-driven TTRPG escalation
**Goal:** Close the sequencing gap by applying scene-check outcome escalation to durable narrative metadata.

**Done when:**
- Scene-check outcome path updates narrative state with escalation-derived `ttrpgPhase`, `combatReadiness`, `threatLevel`, and `lastEncounterSeed`.
- It preserves `requestedGameplayAction: null` and does not create `lastCombatTriggerBeatId`.
- Stored normalized escalation is keyed by `sceneCheckId` and treated as authoritative for retries; reprocessing the same scene check does not repeatedly increase threat, duplicate diagnostics, or select a different seed unless the original outcome is absent.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/encounterEscalation.ts`

**Dependencies:** Items 2–3.

**Size:** Medium.

### Item 5 — Teach the next GM beat to decide danger vs combat
**Goal:** Make the next GM beat aware of combat-ready pressure without auto-routing to combat.

**Done when:**
- GM beat prompt includes last scene-check escalation and enriched encounter seed.
- Prompt explicitly allows keeping danger narrative or using `start_combat` when the fiction now demands structured combat.
- Existing combat validation remains unchanged.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** Item 4.

**Size:** Small.

### Item 6 — Prefer enriched seeds in gameplay encounter generation
**Goal:** Ensure gameplay encounter setup uses location metadata hints before generic generation.

**Done when:**
- Encounter seed formatting includes seed source, catalog entry ids, encounter hints, and monster hints.
- Fallback encounter proposal uses seed hints before generic monster/encounter invention.
- Backend normalization still clamps all mechanics and ignores seed mechanics.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/locationRooms/types.ts`

**Dependencies:** Items 1–2 for prompt formatting; Items 4–5 for end-to-end validation through the real handoff path.

**Size:** Small–Medium.

### Item 7 — Add deterministic harness coverage
**Goal:** Prove hostile failed scene checks escalate quickly without bypassing explicit combat-trigger safety.

**Done when:**
- Harness has a scenario where a failed/hostile scene check persists threat/foreshadow or combat-ready metadata.
- A following story tick remains narrative unless a GM beat emits `start_combat`.
- A following auto tick routes to combat only after an explicit unconsumed trigger.
- Tests assert catalog-derived seed ids/hints when location metadata has `30_monsters` and `80_encounters`.

**Key files:**
- `tests/lib/eliza/location-room-narrative-harness.test.ts`
- existing harness support files under `tests/lib/eliza`
- `package.json`

**Dependencies:** Items 4–6.

**Size:** Medium.

### Item 8 — Verify or lightly extend live/eval observability
**Goal:** Confirm Crow’s Den can be evaluated for escalation without heavy production transcript analysis.

**Done when:**
- First verify whether the room response already exposes public TTRPG phase, combat readiness, threat level, and gameplay status.
- If exposed, update live narrative eval to report those fields.
- If not exposed, add the smallest public-safe service/API/type projection needed before updating the eval script.
- Optional warnings flag long transcripts with no escalation after repeated failure outcomes.
- Existing GNQS scoring remains backward-compatible.

**Key files:**
- `lib/eliza/locationRooms/service.ts` if projection is missing
- `lib/eliza/locationRooms/types.ts` if public DTO typing is missing
- `scripts/location-room-narrative-eval.ts`
- `scripts/location-room-narrative-quality.ts`

**Dependencies:** Item 7. This is an exit-check item unless implementation discovers the eval cannot observe escalation state at all.

**Size:** Small.

## Open Questions
None blocking. The plan resolves the core design choices as follows:
- Use both GM-declared escalation and backend normalization.
- Treat stored normalized escalation keyed by `sceneCheckId` as authoritative for retry/idempotency.
- Keep combat routing explicit and one beat delayed.
- Do not backend-promote an ordinary `failure` straight to `combat_ready`; use `danger` unless the GM explicitly declares combat readiness and seed validation succeeds.
- Enforce catalog normalization/safety and reveal-condition constraints before seed construction.
- Enrich seeds with location metadata hints, but keep mechanics in gameplay proposal/normalization.

## References
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/plans/location-room-scene-checks-2026-05-25.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md`
