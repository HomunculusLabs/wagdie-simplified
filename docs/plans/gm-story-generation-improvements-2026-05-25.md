# GM Story Generation Improvements: Plan

## Goal
Improve WAGDIE location-room GM output so adventures feel like a real TTRPG loop: the GM establishes stakes, presents visible choices, remembers consequences, reacts to character decisions, and makes failures change the fiction. Preserve the existing separation between normal narrative, non-combat scene checks, and combat handoff.

## Background
- User decisions for this plan:
  - Choices should be visible to players, not only private GM state.
  - Character turns should always return structured declared intent, not only when the GM presents an active decision.
  - Failed/partial rolls should use mixed consequences by tier: softer fail-forward complications for partial/soft failures, harder setbacks for stronger failures.
- Investigation: `docs/investigations/gm-story-immersion-2026-05-25.md` found that the narrative loop preserves continuity as summary/objective/open threads, but lacks durable adventure memory for choices, stakes, consequences, discoveries, clocks, and declared character intent.
- Existing metadata pattern: `LocationRoomNarrativeState`, `LocationRoomNarrativeBeat`, and output metadata are extensible JSON bags in `lib/eliza/locationRooms/narrativeTypes.ts`; typed normalize/merge helpers already exist for TTRPG metadata and scene-check metadata (`narrativeTypes.ts:253-377`).
- GM generator seam: `GameMasterBeatOutput` and `GenerateGameMasterBeatInput` live in `lib/eliza/locationRooms/gameMasterGenerator.ts:66-107`; GM response normalization is in `gameMasterGenerator.ts:518`; prompt state rendering is in `buildNarrativeStateLines()` around `gameMasterGenerator.ts:805`; the current GM contract around `gameMasterGenerator.ts:750-802` has no structured choices/stakes/consequence fields.
- Coordinator seam: `LocationRoomNarrativeCoordinator.processTurn()` owns beat creation/reuse, GM output persistence, character turn generation, scene-check execution, and final narrative state updates (`lib/eliza/locationRooms/narrativeCoordinator.ts:352+`). `toGameMasterBeatMetadata()` maps GM output into beat metadata (`narrativeCoordinator.ts:162`). State updates happen after normal/scene-check branches (`narrativeCoordinator.ts:514`, `narrativeCoordinator.ts:756-781`).
- Character agency seam: `officialTurnGenerator.ts` currently asks for prose-only short utterances unless scene-check context exists (`lib/eliza/locationRooms/officialTurnGenerator.ts:136-180`). Scene-check JSON parsing already normalizes `publicSpeech` and optional `sceneCheckProposal` (`officialTurnGenerator.ts:181-226`).
- Scene-check seam: non-combat checks are mediated and backend-resolved in `lib/eliza/locationRooms/sceneChecks/*`; public roll projection includes scene-check-specific fields in `sceneChecks/publicRolls.ts:4-48`. Scene-check outcomes are currently durable mostly as beat metadata plus room-level `lastSceneCheckId` / `lastSceneCheckOutcome`.
- UI projection seam: raw message metadata is not exposed wholesale. `LocationRoomService.toPublicMessage()` projects only selected metadata fields (`lib/eliza/locationRooms/service.ts:259-279`). `EncounterMessageCard` renders message content, labels, and structured roll panels. `locationRoomPresentation.ts` owns message labels. Visible structured choices require explicit public DTO/projection and UI additions.
- Location metadata seam: `locations.metadata` is already an extensible JSON bag normalized by `lib/domain/location/metadata.ts`, while `eliza_location_rooms` has no metadata column (`supabase/migrations/20260511000000_create_eliza_location_rooms.sql:4-18`). Location-specific adventure defaults and reusable content should therefore live under `locations.metadata.adventureCatalog` and be copied/selected into room narrative metadata only when the room narrative state is initialized, explicitly reset, or when the GM needs bounded retrieval context.
- Prior art:
  - `docs/plans/ttrpg-story-combat-experience-2026-05-24.md` and commit `2a1c9520` established story-first routing and narrative/combat separation.
  - `docs/plans/crows-den-progression-fix-2026-05-24.md` and commit `531776e1` hardened GM JSON repair, progression, and diagnostics.
  - `docs/plans/location-room-scene-checks-2026-05-25.md` and commit `8403ac81` added non-combat scene checks as a narrative-path subsystem.
  - `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md` and commit `c48868b3` separated action intent from mechanical check type.

## Approach
Implement this as a metadata-first, targeted extension of the existing location-room narrative loop. Do not add database columns or rewrite routing. Existing `metadata JSONB` on narrative state/beats is enough for additive structured adventure memory, and old rows can normalize to empty adventure memory.

The core design is a bounded `metadata.adventure` model seeded from optional location-specific adventure catalog entries and exposed through per-message public projections:

- Durable private/state memory lives under narrative state `metadata.adventure`.
- Location-authored content lives under `locations.metadata.adventureCatalog` and initializes `metadata.adventure` for new/reset rooms without overwriting an active adventure.
- The GM prompt receives only a bounded, relevant subset of the location catalog each tick, not the full catalog.
- GM and scene-check outcome models return `adventurePatch` instead of replacing the whole adventure state.
- The coordinator merges patches idempotently at existing state-update boundaries.
- Character turns always produce `publicSpeech` plus `declaredAction`; declared action is narrative intent only and never triggers dice by itself.
- Public transcript visibility comes from sanitized `metadata.publicAdventure` projected by `LocationRoomService.toPublicMessage()` into an optional `message.adventure` DTO.
- Public projection is sanitized again at the service boundary; raw `metadata.adventure`, `adventurePatch`, adjudication details, roll facts, and private state are never exposed.
- Combat remains governed only by existing `requestedGameplayAction: 'start_combat'` rules; scene checks remain the existing single-roll narrative subsystem.

### Location adventure catalog
Add an optional location-level catalog object under `locations.metadata.adventureCatalog`. This is authoring/config data, not live mutable room state. Use a Johnny Decimal-style local taxonomy so each location can define reusable content the GM may draw from without inventing everything from scratch.

Suggested catalog shape:

- `00_setting` — location premise, tone, sensory motifs, forbidden reveals.
- `10_plot` — arc seeds, fronts, clocks, secrets, escalation paths.
- `20_characters` — named NPCs, ghosts, rivals, allies, shopkeepers, patrons.
- `30_monsters` — possible enemies, omens, lairs, behaviors, non-mechanical threat notes.
- `40_places` — sub-rooms, landmarks, hidden routes, doors, shrines, hazards.
- `50_items` — mundane items, relics, keys, clues, cursed objects, loot flavor.
- `60_shops_services` — merchants, services, prices/flavor where appropriate, non-combat opportunities.
- `70_factions` — local powers, agendas, relationships, reputation hooks.
- `80_encounters` — reusable scene seeds, complications, social scenes, exploration prompts.
- `90_rules_guidance` — tone guidance, failure guidance, safety constraints, content that must not be revealed yet.

Each entry should have a stable id like `30.10.crow-wight`, `50.20.rusted-key`, or `80.30.black-market-bargain`, plus a compact public-safe summary, tags, optional reveal conditions, and optional links to other entries. Keep mechanics out unless they are public-safe narrative hints; combat stats still belong to gameplay systems.

At narrative-state initialization or explicit room reset, normalize the catalog and seed `metadata.adventure` from its `00_setting` / `10_plot` defaults. Once a room is running, live room narrative state remains authoritative; location metadata should not overwrite in-progress decisions or consequences. During ticks, retrieve a bounded subset of catalog entries relevant to the current objective, active decision, open threads, selected character, or recent failures, and render that subset into the GM prompt.

### Adventure memory model
Add typed helpers in `lib/eliza/locationRooms/narrativeTypes.ts` for a bounded `metadata.adventure` namespace:

- `arcSummary: string | null` — compact larger adventure arc.
- `currentStakes: string | null` — what is at risk right now.
- `activeDecision: { id, prompt, options, selectedOptionId? } | null` — current player-facing choice.
- `consequenceLedger: Array<{ id, source, summary, status, tier? }>` — latest durable costs, complications, advantages, or unresolved aftermath; cap at 5-8.
- `discoveries: string[]` — durable clues/reveals; cap and sanitize.
- `clocks: Array<{ id, label, value, max, summary }>` — lightweight plot pressure; use absolute values, not deltas, to avoid retry duplication.
- `lastDeclaredAction: { tokenId, beatId, summary, chosenOptionId?, actionIntent? } | null` — narrative intent only.
- `lastOutcome: { kind: 'beat' | 'scene_check', sourceId, tier?, summary } | null`.

Normalize all fields: collapse whitespace, cap lengths, cap arrays, slug/limit ids, and reject public-unsafe mechanics such as wallets, HP, rewards, death/finality, or raw model payloads.

### Decision lifecycle
The coordinator owns decision lifecycle transitions because it has the beat id, selected speaker, generated declared action, and current state in one transaction.

- GM `adventurePatch.activeDecision` creates or replaces the current active decision.
- Character `declaredAction.chosenOptionId` is validated against the active decision options before persistence.
- If valid, the coordinator records the chosen option in `lastDeclaredAction` and marks `activeDecision.selectedOptionId` / `selectedOptionLabel` in adventure memory.
- If missing or invalid, the declared action is still persisted as freeform narrative intent, but no option is selected.
- The next GM beat decides whether to clear, replace, or keep the active decision through its next `adventurePatch.activeDecision` value. A `null` patch clears it.
- This avoids requiring the UI or public API to mutate decisions; the tick loop remains authoritative.

### Retry/idempotency mechanics
Use deterministic source ids so retries cannot duplicate consequences or clock movement:

- Normal beat source: `beat:${beat.id}`.
- Scene-check source: `scene_check:${sceneCheckId}`.
- Character action source: `declared_action:${beat.id}`.

Merge helpers derive missing ledger/clock ids from source id plus type/index. Reapplying the same patch replaces existing entries for the same source/id instead of appending duplicates. Clock updates use absolute `value`, not deltas.

### GM beat contract
Extend `GameMasterBeatOutput` with `adventurePatch` and extend the GM JSON contract to ask for:

- updated `arcSummary`
- updated `currentStakes`
- visible `activeDecision` with 2-4 options when a meaningful choice exists
- a new `consequence` when the fiction changes
- `discoveries`
- absolute `clockUpdates`

For non-aftermath beats, validation should require at least one story-pressure signal in addition to existing objective/open-thread requirements:

- visible active decision, or
- scene-check request, or
- consequence, or
- stakes update, or
- discovery, or
- clock update, or
- existing combat handoff request.

This prevents passive room-description-only beats without forcing combat.

### Scene-check outcome consequences
Extend scene-check outcome JSON with `adventurePatch`. Require tier-sensitive consequences:

- `critical_success`: major discovery, advantage, opened route, or reduced pressure.
- `success`: progress with low/no cost; discovery or clarified decision.
- `partial_success`: progress plus complication, clock pressure, or harder choice.
- `failure`: fail-forward complication, lost opportunity, increased pressure.
- `critical_failure`: hard setback, danger escalation, major complication, or clock advance.

Do not change roll facts, adjudication, dice resolution, public roll cards, or combat handoff. Only make the fictional consequence durable.

### Character declared intent
When `narrativeContext` exists, request JSON for every character turn:

- `publicSpeech`
- `declaredAction: { summary, chosenOptionId?, actionIntent? }`
- `sceneCheckProposal` only when scene-check context exists and the action is roll-worthy

Pass current active decision/options into the character narrative context before enabling `chosenOptionId`; otherwise character agents cannot reliably choose a valid visible option. If JSON parsing fails but prose exists, keep compatibility by normalizing speech and synthesizing a safe declared action summary from the content. No-context generation can remain prose-compatible.

### Public transcript visibility
Because raw metadata is intentionally not exposed, add a public-safe projection:

- `PublicLocationRoomMessage.adventure?: PublicLocationRoomAdventure`
- Define DTO/sanitizer shape before coordinator writes public metadata.
- Coordinator writes `metadata.publicAdventure` on messages using the same public sanitizer helper.
- `LocationRoomService.toPublicMessage()` re-sanitizes `metadata.publicAdventure` at read/projection time.
- Render a display-only adventure panel under transcript messages:
  - GM beat: stakes and visible decision options.
  - Character message: declared action.
  - Scene outcome: consequence and clock pressure.

This plan does not introduce interactive option clicking. Choices are visible structure in the transcript; character agents still decide through the tick loop.

## Work Items

### Item 1 — Add adventure metadata model
**Goal:** Create bounded typed adventure-memory types, normalizers, and merge helpers under existing narrative metadata.

**Done when:**
- `normalizeAdventureMemory()` returns safe defaults for old/missing metadata.
- `normalizeAdventurePatch()` caps and sanitizes GM/output fields.
- `normalizeDeclaredAction()` validates/sanitizes character intent.
- `mergeAdventureMetadata()` is idempotent for repeated beat/scene-check source ids.
- Decision selection helpers can validate `chosenOptionId` against active decision options and record or ignore invalid selections deterministically.
- Clock updates use absolute values and do not double-advance on retry.
- Unit tests cover caps, dedupe, old metadata, public-safety filtering, decision-option validation, and clock merge behavior.

**Key files:**
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts` or a new focused narrative-types test

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Add location adventure catalog
**Goal:** Allow each map location to define a reusable Johnny Decimal-style adventure catalog of monsters, characters, shops, items, places, factions, clues, encounters, and guidance that can seed and inform GM stories.

**Done when:**
- `locations.metadata.adventureCatalog` has a documented normalized shape with numbered sections such as `00_setting`, `10_plot`, `20_characters`, `30_monsters`, `40_places`, `50_items`, `60_shops_services`, `70_factions`, `80_encounters`, and `90_rules_guidance`.
- Catalog entries have stable local ids, compact summaries, tags, optional reveal conditions, and optional related-entry ids.
- A catalog normalizer reuses adventure-memory public-safety and length bounds.
- Narrative state initialization can seed arc/stakes/opening decision/discoveries/clocks from catalog defaults only when no live adventure memory exists or a reset explicitly requests reseeding.
- A retrieval helper can select a bounded subset of relevant catalog entries for the GM prompt based on active objective, decision, open threads, recent outcome, selected speaker, and tags.
- Existing running room state is not overwritten by later location metadata edits.
- Tests cover missing catalog, valid catalog, oversized catalog truncation, invalid ids, reset/reseed behavior, and bounded retrieval.

**Key files:**
- `lib/domain/location/metadata-types.ts`
- `lib/domain/location/metadata.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`

**Dependencies:** Item 1.

**Size:** Large.

### Item 3 — Extend public adventure DTO and sanitizer
**Goal:** Define the public-safe shape for visible choices, declared intent, consequences, and clocks before coordinator code starts writing it.

**Done when:**
- `PublicLocationRoomMessage` has optional `adventure` data.
- Public adventure DTO includes only bounded public-safe fields: stakes, active decision/options, selected option, declared action, consequence, clocks.
- A reusable sanitizer converts internal/publicAdventure-like metadata into the DTO shape.
- `LocationRoomService.toPublicMessage()` projects only sanitized `metadata.publicAdventure` and never exposes raw `metadata.adventure`, `adventurePatch`, adjudication details, or private state.
- Service/projection tests verify safe inclusion and raw metadata exclusion.

**Key files:**
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/service.ts`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 4 — Extend GM beat schema and prompt
**Goal:** Make GM beats produce durable story pressure through `adventurePatch` and render prior adventure memory into future GM prompts.

**Done when:**
- `GameMasterBeatOutput` includes `adventurePatch`.
- `buildNarrativeStateLines()` renders arc, stakes, active decision, consequence ledger, discoveries, clocks, last declared action, last outcome, and a bounded relevant subset of location catalog entries.
- GM beat prompt/repair prompt/fallback include the `adventurePatch` contract.
- `normalizeGameMasterBeatResponse()` parses and validates `adventurePatch`.
- Non-aftermath weak beats without choice/stakes/consequence/discovery/clock/scene-check/combat are rejected or repaired.
- Fallback beat creates safe stakes and a visible active decision without forcing combat.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Items 1-3, including catalog retrieval from Item 2.

**Size:** Large.

### Item 5 — Add tier-based scene-check outcome patches
**Goal:** Make scene-check successes/failures produce durable consequences according to roll tier.

**Done when:**
- Scene-check outcome prompt includes tier-specific consequence rules.
- `GameMasterSceneCheckOutcomeOutput` includes `adventurePatch`.
- Outcome normalization requires a consequence for `partial_success`, `failure`, and `critical_failure`.
- Success tiers require at least one discovery, advantage/consequence, decision, stakes update, or clock change.
- Fallback outcome generates a safe tier-appropriate consequence from backend roll facts.
- Tests cover critical success, success, partial, failure, and critical failure behavior.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Items 1 and 4.

**Size:** Medium.

### Item 6 — Make character turns always structured
**Goal:** Capture declared character intent on every narrative-context turn without turning every action into a roll.

**Done when:**
- Narrative context includes active decision/options when present.
- Character prompt requests JSON with `publicSpeech`, `declaredAction`, and optional `sceneCheckProposal` only where scene-check context allows it.
- Normalizer returns/synthesizes `declaredAction`.
- `chosenOptionId` is parsed but not trusted until coordinator validation against current active decision.
- Prose fallback still produces speech and a safe declared action summary.
- No-context generation remains prose-compatible.
- Tests cover normal narrative JSON, prose fallback, scene-check JSON, invalid declared action sanitization, and no accidental scene-check proposal outside scene-check context.

**Key files:**
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/types.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Items 1 and 4.

**Size:** Medium.

### Item 7 — Persist adventure memory in the coordinator
**Goal:** Merge GM patches, declared actions, and scene-check outcome patches into durable room state and beat/message metadata.

**Done when:**
- Beat metadata stores GM `adventurePatch` and character `declaredAction` for retry reuse.
- Normal narrative completion merges GM patch, declared action, selected decision option, and last outcome into room-level `metadata.adventure`.
- Scene-check completion merges GM patch, declared action, outcome patch, tier outcome, and existing scene-check metadata without rerolling or duplicating ledger/clocks on retry.
- GM, character, and scene outcome messages include sanitized `publicAdventure` metadata where relevant.
- Existing message ordering remains: GM beat, character action/reaction, optional roll card, GM outcome.
- Existing combat handoff remains tied only to `requestedGameplayAction`.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Items 1-6.

**Size:** Large.

### Item 8 — Render visible choices and intent in the transcript
**Goal:** Show structured GM choices, character declared actions, and consequences in the location-room transcript.

**Done when:**
- GM messages can display current stakes and active decision options.
- Character messages can display declared action.
- Scene outcomes can display consequence and clock pressure.
- Rendering is display-only; no click handling or mutation is introduced.
- Existing `StructuredRollPanel` behavior remains unchanged.
- Component tests cover all three display modes.

**Key files:**
- `components/location-rooms/EncounterMessageCard.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- Optional new presentation component if implementation wants to avoid bloating `EncounterMessageCard.tsx`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Item 7.

**Size:** Medium.

### Item 9 — Validate separation boundaries and build
**Goal:** Prove the richer story system does not collapse narrative, scene checks, and combat into one flow.

**Done when:**
- Normal declared action alone never triggers dice.
- Scene checks still require GM request/proposal adjudication.
- Combat still starts only through existing `requestedGameplayAction: 'start_combat'`.
- Scene-check roll projection tests still pass.
- Existing combat public roll compatibility still passes.
- Focused test command and `bun run build` pass, with any pre-existing global lint/typecheck failures documented separately.

**Key files:**
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-scene-checks.test.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** Items 1-8.

**Size:** Small.

## Open Questions
None blocking after the up-front decisions. Implementation should proceed with visible choices, always-structured character intent, and tier-based mixed failure consequences. The only tactical choice left to implementation is component organization for the transcript display.

## References
- `docs/investigations/gm-story-immersion-2026-05-25.md`
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/plans/crows-den-progression-fix-2026-05-24.md`
- `docs/plans/location-room-scene-checks-2026-05-25.md`
- `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md`
- `docs/reviews/gm-story-generation-improvements-plan-critique-2026-05-25.md`
