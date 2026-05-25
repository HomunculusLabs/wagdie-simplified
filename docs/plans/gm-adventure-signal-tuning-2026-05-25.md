# GM Adventure Signal Tuning: Plan

## Goal
Tune the location-room GM adventure-memory system so durable plot continuity remains useful, but adventure signals stop dominating the public experience. Automatic ticks should stay plot-forward; public transcript output should read like natural GM narration and character speech, with internal state hidden by default.

## Background
- User direction: the issue is not primarily the location catalog; the adventure signals themselves feel like too much. Public state should be mostly hidden, while automatic ticks should remain plot-forward.
- GM generation flows through `DefaultLocationRoomNarrativeCoordinator.processTurn(...)`, which resolves the GM, ensures narrative state, builds progression context, creates/reuses a beat, generates GM output, appends public messages, generates character turns, optionally resolves scene checks, then updates durable state (`lib/eliza/locationRooms/narrativeCoordinator.ts:461-1063`).
- `GameMasterBeatOutput` carries both public story copy and structured control signals: `publicNarration`, `speakerInstruction`, `stateAfter`, TTRPG phase/readiness/threat, optional `sceneCheckRequest`, and `adventurePatch` (`lib/eliza/locationRooms/gameMasterGenerator.ts:71-102`).
- Adventure memory is injected into the GM prompt through `formatAdventureMemoryLines(...)`, including stakes, active decision, consequence ledger, discoveries, clocks, last declared action/outcome, and relevant location catalog entries (`lib/eliza/locationRooms/gameMasterGenerator.ts:830-895`).
- The existing prompt-size convention preserves the JSON contract first and truncates earlier context, so context/memory is already lower priority than output contract correctness (`lib/eliza/locationRooms/gameMasterGenerator.ts:670-690`).
- GM validation currently requires non-aftermath story pressure through at least one of active decision, stakes, consequence ledger, discoveries, clocks, scene-check request, or combat start (`lib/eliza/locationRooms/gameMasterGenerator.ts:369-393`). This likely nudges the GM toward visible stakes/choice/clock language too often.
- Adventure patches become durable room memory through `mergeAdventureMetadata(...)`; declared actions and scene-check outcomes are also folded into `metadata.adventure` (`lib/eliza/locationRooms/narrativeCoordinator.ts:292-307`, `lib/eliza/locationRooms/narrativeCoordinator.ts:536`, `lib/eliza/locationRooms/narrativeTypes.ts:646-730`).
- Public overload path: coordinator writes `metadata.publicAdventure` at GM/character/scene-check message sites; `service.toPublicMessage(...)` sanitizes it into `PublicLocationRoomMessage.adventure`; `EncounterMessageCard.AdventureSignalPanel` renders repeated stakes, decisions, declared actions, consequences, and clocks (`lib/eliza/locationRooms/narrativeCoordinator.ts:560-596`, `lib/eliza/locationRooms/narrativeCoordinator.ts:689-729`, `lib/eliza/locationRooms/service.ts:260-283`, `components/location-rooms/EncounterMessageCard.tsx:42-140`).
- Existing UI already has patterns for demoting mechanics: legacy roll text is separated into a secondary panel, while message domain/kind/phase labels are compact header chips (`components/location-rooms/EncounterMessageCard.tsx:159-226`, `components/location-rooms/locationRoomPresentation.ts:47-91`).
- Prior art: `docs/plans/gm-story-generation-improvements-2026-05-25.md` introduced durable adventure memory and location `adventureCatalog`; `docs/reviews/gm-story-generation-improvements-plan-critique-2026-05-25.md` flagged potential over-scope around clocks/discoveries versus first-pass choices/intent/consequences; commit `53094b86` implemented the adventure-memory system.
- Prior art: `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md` and commit `531776e1` addressed flat progression by adding stricter progression/repair behavior; this tuning must not reintroduce flat ticks.
- Prior art: `docs/investigations/crows-den-first-message-progression-2026-05-25.md` and commit `46b5afeb` fixed missing initial GM narration; this tuning must preserve required first/public GM narration.
- Prior art: `docs/plans/location-room-scene-checks-2026-05-25.md` and commit `8403ac81` added scene checks as non-combat consequence paths; failure handling should remain mechanically grounded but narratively natural.

## Approach

### 1. Make adventure memory quiet internal continuity by default
`metadata.adventure` remains the durable continuity engine. It should not imply a public panel, visible checklist, or menu-like scene structure.

The GM prompt should describe `adventurePatch` as private continuity memory. It should prefer natural public narration plus compact internal updates. `activeDecision` should be rare and reserved for a genuine fictional fork, not emitted every tick to satisfy validation. Catalog entries should remain optional inspiration, not public content the GM must name.

Story-pressure validation should continue to reject flat/non-progressing beats, but the pressure may be internal-only. A valid tick can advance plot by updating durable adventure memory without exposing a public adventure signal. Internal story pressure should count only when the GM also gives natural public narration that makes the changed situation understandable. A hidden memory update alone is not enough if the visible narration is still atmospheric filler.

Internal story pressure should be satisfied by at least one of:
- an `adventurePatch.currentStakes` update reflected naturally in narration;
- an `adventurePatch.consequenceLedger` or `lastOutcome` update reflected naturally in narration;
- a meaningful `discovery` or `clock` update reflected naturally in narration;
- a rare `activeDecision` when the fiction has a real fork;
- a `sceneCheckRequest` or explicit combat handoff through the existing rules.

Preserve existing safeguards:
- first/no-prior-GM public narration remains required;
- opening narration remains substantive;
- repeated flat `story` / `none` / low-threat state remains invalid;
- non-aftermath beats still require objective/open threads;
- combat remains an explicit handoff through the existing combat trigger rules.

### 2. Hide public adventure state by default at the API boundary
Choose API-level quieting, not UI-only hiding. This prevents future clients from accidentally treating internal adventure state as default gameplay UI.

Projection ownership should be explicit:
- `service.toPublicMessage(...)` owns whether raw message metadata becomes `PublicLocationRoomMessage.adventure`.
- A helper in `publicAdventure.ts` may centralize the visibility check plus existing sanitization.
- `types.ts` may define a small metadata visibility type if needed by tests, but this should not become a durable schema migration.

Contract:
- unflagged legacy `metadata.publicAdventure` is not projected;
- routine messages either omit `metadata.publicAdventure` or write hidden/debug-only metadata that the public DTO ignores;
- only explicit future featured metadata may project `message.adventure`;
- no GM-controlled featured flag is introduced in this pass.

This means old stored adventure metadata will disappear from the public API immediately after the change. That is acceptable and intentional for the test environment because the current visible state is the problem.

### 3. Stop writing routine public adventure metadata from the coordinator
The coordinator should continue merging durable adventure patches, declared actions, scene-check outcomes, and TTRPG metadata into narrative state. It should stop attaching routine `publicAdventure` to GM beats, character reactions, scene-check action messages, roll cards, and scene-check GM outcomes.

Public transcript content should be the main experience:
- GM narration carries stakes and consequences naturally;
- character speech/action stays natural;
- scene-check roll cards remain structured because they are explicit mechanics;
- scene-check outcome consequences persist internally without a repeated adventure-state panel.

### 4. Remove the default transcript adventure panel
`EncounterMessageCard` should no longer render the current large `AdventureSignalPanel` for routine messages. Do not design a new compact featured-state UI in this pass; no producer will feature adventure signals yet. If product later wants occasional featured cues, that should be a separate follow-up with explicit semantics.

The watch page should prioritize:
- GM prose;
- character voice/action;
- roll/mechanics panels only when a roll actually happened;
- compact header labels for phase/domain/kind.

### 5. Keep catalog support, but reduce prompt dominance
The catalog was added for GM guidance and should stay. The tuning pass should reduce its prompt weight: fewer entries, language that frames catalog content as inspiration/constraints, and explicit instruction not to expose catalog items as a checklist. Live adventure memory remains more authoritative than location metadata.

No schema change is needed for catalog or adventure memory.

## Implementation Guardrails
- Do not duplicate scene-check mechanics.
- Do not change combat routing or combat trigger requirements.
- Do not add persistence tables or migrations for this tuning pass.
- Do not broaden public roll DTOs.
- Do not make ordinary narrative depend on combat state.
- Do not introduce a GM-controlled public-feature flag for adventure signals in this pass.

## Work Items

### Item 1 — Retune GM prompt, catalog context, and story-pressure validation
**Goal:** Keep automatic ticks plot-forward while making `adventurePatch` private continuity memory rather than a public UI contract.

**Done when:**
- GM prompt says `adventurePatch` is private continuity memory by default.
- `activeDecision` is described as rare and only for clear fictional forks.
- Public narration instructions emphasize natural prose over listing stakes/options/clocks.
- `formatAdventureMemoryLines(...)` presents adventure memory/catalog as quiet continuity guidance and bounded inspiration.
- Story pressure can be satisfied by internal adventure memory updates only when the public narration also reflects the changed fictional situation naturally.
- Repair/fallback behavior carries the same quiet-memory guidance.
- First GM narration, repeated-flat-state rejection, objective/open-thread requirements, and combat handoff rules remain unchanged.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Gate public adventure projection at the service boundary
**Goal:** Make public adventure DTO projection explicit and hidden by default.

**Done when:**
- `service.toPublicMessage(...)` projects `message.adventure` only when message metadata explicitly marks adventure state as featured.
- Existing/unflagged `metadata.publicAdventure` is not projected.
- A visibility helper or type is added only as needed to keep the projection contract clear.
- `PublicLocationRoomMessage.adventure` remains optional and unchanged for compatibility.
- Projection tests verify raw/internal adventure metadata is not exposed.

**Key files:**
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/publicAdventure.ts`
- `lib/eliza/locationRooms/types.ts`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** None.

**Size:** Small.

### Item 3 — Quiet coordinator public message metadata while preserving durable memory
**Goal:** Stop routine narrative messages from carrying public adventure panels while preserving all internal state updates.

**Done when:**
- GM beat messages no longer include routine `metadata.publicAdventure`.
- Character reaction/action messages no longer include routine `metadata.publicAdventure`.
- Scene-check roll-card messages do not include adventure state.
- Scene-check GM outcome messages preserve natural public narration but hide structured adventure consequence by default.
- Durable state updates still merge GM `adventurePatch`, declared actions, scene-check outcome patches, last outcome, and TTRPG metadata.
- Retry/idempotency remains unchanged.
- Tests prove quiet successful auto ticks persist internal adventure memory while public messages omit `adventure`.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-scene-checks.test.ts`

**Dependencies:** Items 1–2.

**Size:** Medium.

### Item 4 — Remove routine adventure panel rendering
**Goal:** Ensure adventure signals no longer dominate the public watch-page experience.

**Done when:**
- `EncounterMessageCard` no longer renders the large `AdventureSignalPanel` for normal messages.
- No new compact/featured adventure UI is designed in this pass.
- Normal GM prose and character speech are visually primary.
- `StructuredRollPanel` remains unchanged for scene/combat roll cards.
- Component tests cover absence of the adventure panel by default.

**Key files:**
- `components/location-rooms/EncounterMessageCard.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- `components/location-rooms/StructuredRollPanel.tsx`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Item 2.

**Size:** Small.

### Item 5 — Regression coverage and documentation lock-in
**Goal:** Lock in the intended product contract so future work does not reintroduce visible-state overload.

**Done when:**
- Tests cover quiet successful auto tick, required first GM narration, repeated flat state rejection, public API hiding unfeatured `metadata.publicAdventure`, UI not rendering the adventure panel by default, scene-check consequences persisting internally, and scene checks remaining separate from combat.
- This plan remains the source of truth for the final decisions: public adventure state hidden by default at API projection, story pressure may be internal-only if reflected naturally in prose, catalog remains quiet internal guidance, and first narration/non-flat progression safeguards remain.

**Key files:**
- `docs/plans/gm-adventure-signal-tuning-2026-05-25.md`
- Test files listed in Items 1–4.

**Dependencies:** Items 1–4.

**Size:** Small.

## Risks and Constraints
- **Public API behavior changes:** existing stored messages with `metadata.publicAdventure` will stop projecting `message.adventure` unless explicitly marked as featured. This is intentional and matches the “mostly hidden” requirement.
- **No data migration required:** durable adventure state remains in JSON metadata; old message rows are safely ignored by new projection logic.
- **Rollback behavior:** rolling back service projection would re-expose old stored `publicAdventure` metadata.
- **Main regression risk:** over-quieting can reintroduce flat atmospheric ticks. Mitigate with generator/coordinator/service tests proving internal story pressure still produces visible plot movement in the prose.
- **Future featured cues:** if needed, define featured metadata ownership and UI semantics in a separate follow-up. This pass removes overload; it does not design a new public state surface.

## Open Questions
None blocking. The plan chooses API-level quieting, immediate hiding of legacy unfeatured public adventure metadata, no featured-state UI in this pass, and internal story pressure that must still be reflected in natural narration.

## References
- `docs/plans/gm-story-generation-improvements-2026-05-25.md`
- `docs/reviews/gm-story-generation-improvements-plan-critique-2026-05-25.md`
- `docs/reviews/gm-adventure-signal-tuning-plan-critique-2026-05-25.md`
- `docs/investigations/crows-den-adventure-progression-errors-2026-05-24.md`
- `docs/investigations/crows-den-first-message-progression-2026-05-25.md`
- `docs/plans/location-room-scene-checks-2026-05-25.md`
- `docs/investigations/gm-story-immersion-2026-05-25.md`
- Commit `53094b86` — `feat: add adventure memory to location rooms`
- Commit `531776e1` — `fix: harden crows den progression`
- Commit `46b5afeb` — `fix: require public gm narration for fresh adventures`
- Commit `8403ac81` — `feat: add narrative scene checks to location rooms`
