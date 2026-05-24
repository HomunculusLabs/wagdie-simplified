# TTRPG Story and Combat Experience: Plan

## Goal
Make location-room gameplay feel more like a true D&D/TTRPG session: the GM advances story first, combat is a distinct phase rather than the default, and one spotlighted character reacts in their own voice to meaningful GM beats. Keep the public message list as the shared surface, but add stronger narrative/gameplay domains so the watch page can render story, combat, and important dice cleanly.

## Background
- User direction from planning checkpoint: prefer explicit phases, but account for the in-progress encounter watch page; keep one spotlighted character reaction per beat; keep a single message list with stronger domains; mechanics should be mostly hidden, but dice rolls remain important.
- Prior investigation: `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md` found that gameplay enablement currently acts as combat initiation. Gameplay-enabled ticks route directly to `gameplayCoordinator.processTurn(...)` before narrative handling (`lib/eliza/locationRooms/service.ts:1044-1049`), while the narrative branch starts later (`lib/eliza/locationRooms/service.ts:1103-1104`). If no encounter exists, gameplay generates and creates one after only participant guardrails (`lib/eliza/locationRooms/gameplay/coordinator.ts:383-423`).
- Tick/service seam: manual ticks enter through `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-36`, then `LocationRoomService.requestTickAndProcess()` validates/enqueues/claims/processes ticks (`lib/eliza/locationRooms/service.ts:443-502`). Manual validation creates/reuses a `GameplayRun` when gameplay is enabled (`lib/eliza/locationRooms/service.ts:504-626`). Scheduled and active-run continuation logic lives at `lib/eliza/locationRooms/service.ts:672-893`.
- Narrative beat seam: `LocationRoomNarrativeCoordinator.processTurn()` creates/reuses a GM beat, calls `gameMasterGenerator.generateBeat(...)`, appends optional public GM narration, generates the selected character response, then persists narrative state (`lib/eliza/locationRooms/narrativeCoordinator.ts:119-260`). `GameMasterBeatOutput` currently contains `publicNarration`, `speakerInstruction`, `stateAfter`, and metadata (`lib/eliza/locationRooms/gameMasterGenerator.ts:17-27`).
- Combat seam: `LocationRoomGameplayCoordinator.processTurn()` owns encounter setup, character action generation, backend mechanics, death/reward processing, GM outcome narration, public message append, and continuity write-back (`lib/eliza/locationRooms/gameplay/coordinator.ts:345-803`). Existing gameplay statuses already include `idle | active_encounter | aftermath` for room state and `active | victory | defeat | fled | abandoned` for encounters (`lib/eliza/locationRooms/gameplay/types.ts:4-16`).
- Character voice seam: narrative flow enforces one selected speaker by selecting/persisting `selectedTokenId` (`lib/eliza/locationRooms/service.ts:1088-1099`), asking the GM to plan exactly one beat for that speaker (`lib/eliza/locationRooms/gameMasterGenerator.ts:229-269`), validating the GM did not change speakers (`lib/eliza/locationRooms/gameMasterGenerator.ts:140-204`), and resolving that token to its official character agent (`lib/eliza/locationRooms/officialTurnGenerator.ts:91-107`). The character prompt injects private GM context and the just-posted public GM narration (`lib/eliza/locationRooms/officialTurnGenerator.ts:30-50`) and asks for exactly one short in-world utterance (`lib/eliza/locationRooms/officialTurnGenerator.ts:52-72`).
- Gameplay action voice seam: gameplay selects one speaker/actor (`lib/eliza/locationRooms/gameplay/coordinator.ts:490-511`), sends that character a D&D-style action prompt with optional `speakerInstruction` (`lib/eliza/locationRooms/gameplay/actionGenerator.ts:27-39`, `lib/eliza/locationRooms/gameplay/actionGenerator.ts:133-169`), resolves the selected character agent (`lib/eliza/locationRooms/gameplay/actionGenerator.ts:237-259`), and appends `action.publicSpeech` as that character (`lib/eliza/locationRooms/gameplay/coordinator.ts:716-735`).
- Public DTO/message seam: persisted messages have one `content` and `metadata` shape (`lib/eliza/locationRooms/types.ts:8-48`). Public messages currently expose optional `gameplayMessageKind` and `gameplayRolls` (`lib/eliza/locationRooms/types.ts:190-198`), and `LocationRoomService.getPublicRoom()` assembles room identity, activity, participants, messages, optional gameplay summary, and pagination (`lib/eliza/locationRooms/service.ts:367-441`). `toPublicMessage()` forwards sanitized gameplay metadata while preserving one content string (`lib/eliza/locationRooms/service.ts:185-199`).
- Roll seam: gameplay outcome messages write `gameplayMessageKind: 'gm_outcome'`, legacy `rollSummary`, and optional `publicRolls` (`lib/eliza/locationRooms/gameplay/coordinator.ts:750-769`). Structured public rolls are projected/sanitized in `lib/eliza/locationRooms/gameplay/publicRolls.ts:219-233` and `lib/eliza/locationRooms/gameplay/publicRolls.ts:337-362`.
- Watch page prior art: `docs/plans/location-encounter-watch-page-2026-05-24.md` establishes a read-only route, public stats, structured metadata, shared hook, transcript/sidebar/roll components, and a migration away from embedded roll text. Its review (`docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md`) warns to keep embedded `Rolls:` until both watch page and sidebar render structured rolls.
- Watch page/client seams: public GET route is `app/api/eliza/location-rooms/[locationId]/route.ts:12-21`; page route renders `LocationRoomWatchPage` (`app/location-rooms/[locationId]/page.tsx:21-25`); shared hook fetches the public room with passive refresh (`hooks/usePublicLocationRoom.ts:58-128`); `LocationRoomWatchPage`, `EncounterTranscript`, `EncounterMessageCard`, `EncounterStatusSidebar`, and `StructuredRollPanel` render the public read shape and structured rolls.

## Approach
Make location-room gameplay story-first by adding an explicit TTRPG phase/readiness model, routing ticks through narrative unless combat is active or explicitly triggered, and strengthening the single public message list with public-safe domains/kinds. The recommended path is incremental and metadata-backed: store phase/readiness/trigger details in existing narrative/gameplay metadata first, avoid a DB migration in V1, preserve existing public DTO compatibility, and update the watch page to render phases, narrative/combat domains, and sanitized structured rolls without exposing raw mechanics.

### Phase model
Use five public-safe TTRPG phases:

- `story`
- `exploration`
- `threat`
- `combat`
- `aftermath`

Use three combat-readiness values:

- `none`
- `foreshadow`
- `ready`

Use three manual/processing intents:

- `auto` — default existing client behavior, but story-first.
- `story` — force narrative routing where allowed.
- `combat` — admin-only explicit combat request.

### Routing policy
- No active encounter + no explicit trigger/readiness → narrative.
- Narrative GM can raise phase/readiness to `threat` / `ready` and request `start_combat`; that tick still completes as GM narration plus one spotlighted character reaction.
- A completed narrative beat with `requestedGameplayAction: start_combat` becomes a single-use combat trigger. The next eligible manual or scheduled tick may consume that trigger; `combatReadiness: ready` alone is not enough.
- Trigger consumption must be idempotent: store the consumed narrative beat id on the created encounter and/or gameplay state before encounter creation can be retried, and treat retries for the same beat as continuation rather than a second encounter.
- Admin `combat` intent may create a combat trigger without a prior narrative beat. Owner/manual `combat` intent is rejected.
- Active encounter → combat.
- Terminal encounter → complete the combat run, mark phase `aftermath`, then the next narrative tick produces exactly one aftermath beat before the GM returns the phase to `story` or `exploration`.

### Public message model
Keep one `messages[]` list and add additive public fields:

- `messageDomain`: `narrative | combat`
- `messageKind`: `gm_beat | character_reaction | gm_setup | character_action | gm_outcome`
- `ttrpgPhase`: `story | exploration | threat | combat | aftermath`

Do not add separate `mechanics` or `system` message domains in V1. Dice/mechanics remain attached as structured `gameplayRolls` on relevant combat messages. Keep existing `gameplayMessageKind` for backward compatibility, and use fallback projection for historical messages that lack the new metadata.

### Dice and mechanics
Mechanics should remain mostly hidden but meaningful. Full rolls, deltas, DCs, and scoring internals stay private; sanitized `gameplayRolls` remain the public mechanics surface. Keep embedded `Rolls:` text temporarily until both watch-page and map/sidebar paths can render structured rolls reliably.

## Work Items

### Item 1 — Define TTRPG phase and message-domain contracts
**Goal:** Add explicit shared type contracts for phases, combat readiness, turn intent, public message domains, and public message kinds without changing behavior yet.

**Done when:**
- `lib/eliza/locationRooms/types.ts` defines phase/readiness/intent/domain/kind unions.
- `PublicLocationRoomMessage` additively supports `messageDomain`, `messageKind`, and `ttrpgPhase`.
- `PublicLocationRoomRead` additively supports a public-safe TTRPG summary.
- Existing `gameplayMessageKind` remains unchanged.

**Key files:** `lib/eliza/locationRooms/types.ts`; `lib/eliza/locationRooms/service.ts`; `tests/api/eliza/location-room-service.test.ts`.

**Dependencies:** None.

**Size:** M

### Item 2 — Add metadata-backed phase/readiness helpers
**Goal:** Create a reusable normalization/projection seam for reading and writing phase/readiness metadata from narrative/gameplay state without requiring a DB migration.

**Done when:**
- Helpers normalize missing/malformed phase, readiness, threat level, requested action, and encounter seed.
- Implementation first verifies current narrative/gameplay repository metadata read/write paths are sufficient for routing decisions; if not, it adds a migration/repository slice before Item 6.
- Narrative state metadata can store `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, `lastEncounterSeed`, `lastCombatTriggerBeatId`, and `consumedCombatTriggerBeatId`.
- Narrative beat metadata stores the GM’s phase/readiness output for auditability.
- Public projection uses only sanitized values.

**Key files:** `lib/eliza/locationRooms/narrativeTypes.ts`; `lib/eliza/locationRooms/narrativeRepository.ts`; `lib/eliza/locationRooms/service.ts`; `lib/eliza/locationRooms/types.ts`.

**Dependencies:** Item 1.

**Size:** M

### Item 3 — Expand the narrative GM beat contract
**Goal:** Make the GM explicitly choose story/exploration/threat/aftermath progression and combat readiness while still producing exactly one GM beat for one selected speaker.

**Done when:**
- `GameMasterBeatOutput` includes sanitized `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, and optional public-safe `encounterSeed`.
- `buildGameMasterBeatPrompt()` says not to spawn combat by default, to use `threat` for foreshadowing, and to request combat structurally only when fiction clearly escalates.
- The prompt preserves exactly one selected speaker.
- Response normalization validates the new fields and safely defaults missing fields for compatibility.

**Key files:** `lib/eliza/locationRooms/gameMasterGenerator.ts`; `tests/lib/eliza/location-room-game-master-generator.test.ts`.

**Dependencies:** Items 1–2.

**Size:** M

### Item 4 — Persist narrative phase/readiness and preserve one spotlight reaction
**Goal:** Apply the expanded GM output inside the narrative coordinator while preserving the current “GM narration + one character reaction” structure.

**Done when:**
- `narrativeCoordinator.processTurn()` stores phase/readiness/requested action/encounter seed on beat metadata.
- Narrative state metadata is updated after the selected character response.
- Narrative GM messages carry `messageDomain: narrative`, `messageKind: gm_beat`, and `ttrpgPhase`.
- Character reaction messages carry `messageDomain: narrative`, `messageKind: character_reaction`, and `ttrpgPhase`.
- A narrative beat that requests combat does not start combat in the same narrative flow; it leaves a trigger for a later tick.

**Key files:** `lib/eliza/locationRooms/narrativeCoordinator.ts`; `lib/eliza/locationRooms/narrativeRepository.ts`; `lib/eliza/locationRooms/narrativeTypes.ts`; `tests/lib/eliza/location-room-narrative-coordinator.test.ts`.

**Dependencies:** Items 2–3.

**Size:** M

### Item 5 — Add explicit manual tick intent without breaking existing clients
**Goal:** Allow admin-only forced combat/story intent while keeping existing owner/manual POST behavior compatible and story-first.

**Done when:**
- Manual tick POST accepts an optional JSON body with `intent?: 'auto' | 'story' | 'combat'`; omitted/empty bodies behave as `auto`.
- Admin status continues to come from the existing route actor derivation (`actor: 'admin' | 'owner'`) and service authorization path.
- Owner requests with `intent: 'combat'` return a clear forbidden/error response; they are not silently downgraded.
- Admin requests with `intent: 'combat'` create an admin-sourced combat trigger.
- V1 is API/service-only for admin combat intent; no admin UI control is required in this plan.
- Current public/map UI does not need new combat controls in this slice.

**Key files:** `app/api/eliza/location-rooms/[locationId]/tick/route.ts`; `lib/eliza/locationRooms/types.ts`; `lib/eliza/locationRooms/service.ts`; `hooks/map/useLocationRoom.ts`; `tests/api/eliza/location-room-routes.test.ts`; `tests/hooks/useLocationRoom.test.tsx`.

**Dependencies:** Item 1.

**Size:** M

### Item 6 — Replace gameplay-before-narrative routing with a phase-aware turn router
**Goal:** Make `LocationRoomService` decide whether each tick is narrative, combat, or aftermath before calling a coordinator.

**Done when:**
- `processClaimedTickUnsafe()` no longer routes purely on `isLocationRoomGameplayEnabledForLocation(...)`.
- Routing handles active encounter, terminal encounter/aftermath, admin combat intent, unconsumed narrative `start_combat`, and default narrative flow.
- Narrative routing still selects one speaker through `selectLocationRoomSpeaker()`.
- Combat routing attaches or creates a gameplay run only when combat actually starts or continues.
- Consuming a narrative combat trigger is atomic/idempotent enough that a repeated manual/scheduled claim for the same trigger cannot create a second encounter.
- Existing non-gameplay narrative behavior remains unchanged.
- Returned tick results use clear skip/stop reasons when routing cannot proceed.

**Key files:** `lib/eliza/locationRooms/service.ts`; `lib/eliza/locationRooms/speakerSelection.ts`; `lib/eliza/locationRooms/narrativeRepository.ts`; `lib/eliza/locationRooms/gameplay/repository.ts`; `tests/api/eliza/location-room-service.test.ts`.

**Dependencies:** Items 2, 4, and 5.

**Size:** L

### Item 7 — Gate encounter creation inside the gameplay coordinator
**Goal:** Prevent accidental combat creation even if a future caller routes into gameplay incorrectly.

**Done when:**
- `ProcessGameplayLocationRoomTurnInput` includes optional `encounterTrigger` data with source, optional `narrativeBeatId`, optional sanitized `encounterSeed`, and optional `speakerInstruction`.
- If no active encounter exists and no valid `encounterTrigger` is provided, `processTurn()` returns/skips with `no_combat_trigger` and does not call `generateEncounterProposal()`.
- Existing active encounters continue as before.
- New encounter metadata records trigger source, narrative beat id, encounter seed, and phase when present.
- Combat setup/action/outcome messages persist `messageDomain: combat`, the matching `messageKind`, and `ttrpgPhase: combat` metadata.
- The gameplay action generator receives narrative `speakerInstruction` when combat was triggered by a narrative beat.

**Key files:** `lib/eliza/locationRooms/gameplay/coordinator.ts`; `lib/eliza/locationRooms/gameplay/actionGenerator.ts`; `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`; `lib/eliza/locationRooms/gameplay/types.ts`; `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`.

**Dependencies:** Items 3–6.

**Size:** L

### Item 8 — Thread narrative encounter seeds into combat proposal generation
**Goal:** Let combat feel like a continuation of the story rather than a fresh random encounter.

**Done when:**
- `GenerateGameplayEncounterProposalInput` accepts optional `encounterSeed`.
- `buildGameplayEncounterProposalPrompt()` includes the seed as narrative context, not authoritative mechanics.
- Parser/normalizer still clamps all mechanics and rewards.
- Fallback encounter generation uses seed title/summary/stakes when available.
- Tests prove seed text influences prompt/fallback but does not allow raw mechanics or unsafe fields.

**Key files:** `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`; `lib/eliza/locationRooms/gameplay/rules.ts`; `tests/lib/eliza/location-room-gameplay-generators.test.ts`.

**Dependencies:** Item 7.

**Size:** M

### Item 9 — Strengthen public message projection with domains/kinds/phases
**Goal:** Expose story and combat as distinct public-safe domains while preserving the same `messages[]` list.

**Done when:**
- `toPublicMessage()` projects stored `metadata.messageDomain`, `metadata.messageKind`, and `metadata.ttrpgPhase`.
- Historical fallback mapping classifies legacy gameplay kinds as combat and non-gameplay GM/agent messages as narrative.
- Invalid or malformed metadata is ignored or coerced to safe defaults.
- Public API tests assert raw metadata, private mechanics, and private narrative state are not exposed.

**Key files:** `lib/eliza/locationRooms/service.ts`; `lib/eliza/locationRooms/types.ts`; `lib/eliza/locationRooms/gameplay/publicRolls.ts`; `tests/api/eliza/location-room-service.test.ts`; `tests/lib/eliza/location-room-gameplay-public-rolls.test.ts`.

**Dependencies:** Items 1, 4, and 7.

**Size:** M

### Item 10 — Keep dice/mechanics hidden but renderable
**Goal:** Preserve private mechanics while making important dice results visible through structured public roll data.

**Done when:**
- Combat outcome messages continue to store sanitized `publicRolls` metadata.
- `gameplayRolls` remains attached to public `gm_outcome` messages.
- Raw mechanical deltas, private DCs, raw roll faces if not already allowed, exact private HP deltas, modifier internals, and reward scoring internals remain private.
- Embedded `Rolls:` text remains temporarily until both watch page and map/sidebar render structured rolls reliably.
- The later removal condition is documented.

**Key files:** `lib/eliza/locationRooms/gameplay/coordinator.ts`; `lib/eliza/locationRooms/gameplay/publicRolls.ts`; `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`; `components/location-rooms/StructuredRollPanel.tsx`; `tests/lib/eliza/location-room-gameplay-public-rolls.test.ts`; `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`.

**Dependencies:** Item 9.

**Size:** S

### Item 11 — Update the watch page to render phases and domains
**Goal:** Keep the in-progress watch page compatible while making story/combat separation visible.

**Done when:**
- Transcript cards visually distinguish narrative GM beat, narrative character reaction, combat setup, combat character action, and combat outcome.
- Header/sidebar show current phase and readiness from the public TTRPG summary.
- `StructuredRollPanel` still renders only when `gameplayRolls` exists.
- Historical messages without new domains render through fallback domain/kind mapping.
- The page remains read-only and continues using `usePublicLocationRoom()`.

**Key files:** `components/location-rooms/LocationRoomWatchPage.tsx`; `components/location-rooms/EncounterTranscript.tsx`; `components/location-rooms/EncounterMessageCard.tsx`; `components/location-rooms/EncounterStatusSidebar.tsx`; `components/location-rooms/locationRoomPresentation.ts`; `components/location-rooms/StructuredRollPanel.tsx`; `tests/components/location-rooms/location-room-watch-page.test.tsx`.

**Dependencies:** Item 9.

**Size:** M

### Item 12 — Adjust scheduled workers and gameplay-run lifecycle
**Goal:** Ensure automated runs do not resurrect old immediate-combat behavior.

**Done when:**
- Scheduled ticks enqueue normally for active rooms, but processing routes through the phase-aware router.
- Active gameplay-run continuations only advance active combat encounters.
- Runs are stopped/completed when encounter status becomes victory/defeat/fled/abandoned or participants become insufficient.
- Terminal combat writes/marks `aftermath`; the next narrative tick produces one aftermath beat and then lets the GM return to `story` or `exploration`.
- A single-use narrative `start_combat` trigger can create/attach a run when combat begins.

**Key files:** `lib/eliza/locationRooms/service.ts`; `lib/eliza/locationRooms/gameplay/repository.ts`; `lib/eliza/locationRooms/gameplay/types.ts`; `tests/api/eliza/location-room-service.test.ts`; `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`.

**Dependencies:** Items 6–8.

**Size:** L

### Item 13 — Update tests for the new TTRPG behavior
**Goal:** Replace immediate-combat assumptions with story-first phase behavior while preserving privacy and compatibility regressions.

**Done when:**
- Service tests prove gameplay-enabled rooms with no active encounter route narrative first, narrative readiness can trigger later combat, admin combat intent can force combat, and scheduled ticks do not create combat without readiness/intent.
- Gameplay coordinator tests prove no encounter is created without `encounterTrigger`.
- Narrative generator tests cover phase/readiness parser and prompt.
- Public API tests cover `messageDomain`, `messageKind`, `ttrpgPhase`, TTRPG summary, and historical fallback mapping.
- Watch page tests cover narrative/combat rendering and structured rolls.
- Existing public-roll privacy tests still pass.

**Key files:** `tests/api/eliza/location-room-service.test.ts`; `tests/api/eliza/location-room-routes.test.ts`; `tests/lib/eliza/location-room-game-master-generator.test.ts`; `tests/lib/eliza/location-room-narrative-coordinator.test.ts`; `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`; `tests/lib/eliza/location-room-gameplay-generators.test.ts`; `tests/lib/eliza/location-room-gameplay-public-rolls.test.ts`; `tests/components/location-rooms/location-room-watch-page.test.tsx`; `tests/hooks/useLocationRoom.test.tsx`.

**Dependencies:** Items 1–12.

**Size:** L

### Item 14 — Add rollout notes and removal criteria
**Goal:** Record the behavior change and the narrow compatibility gates that implementation must preserve.

**Done when:**
- A short rollout note states that gameplay-enabled rooms no longer auto-start combat.
- The investigation is linked as the root-cause source for this behavior change.
- A follow-up note tracks when embedded `Rolls:` can be removed.

**Key files:** `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md`; `docs/plans/location-encounter-watch-page-2026-05-24.md`.

**Dependencies:** Items 1–13.

**Size:** S

## Orchestration Progress
- [x] Slice A — Foundation: Items 1–5 (contracts, metadata helpers, narrative GM phase/readiness output, narrative message metadata, manual tick intent). Completed by agent `7552AB4F-891A-4F9B-B82E-91A6CA073CF6`; focused tests passed, lint still has unrelated pre-existing failures.
- [x] Slice B — Routing/combat gates: Items 6–8 and 12 (phase-aware router, encounter trigger/idempotency, encounter seeds, run lifecycle). Completed by agent `9F0A8511-3F14-496C-862A-55B35C72D8AB`; focused routing/gameplay tests passed.
- [x] Slice C — Public/watch surface: Items 9–11 (public projection, dice privacy compatibility, watch-page domain/phase rendering). Completed by agent `6C4C21BD-F6EA-4ABD-9193-8B3BC4B32EB2`; focused public API/watch tests passed.
- [x] Slice D — Tests/docs hardening: Items 13–14 (full regression pass and rollout notes). Completed by this session; focused TTRPG regression suites passed, production build passed, rollout/removal notes added. Full Jest and lint still have unrelated pre-existing failures documented in the handoff summary.

## Risks and Compatibility
- Gameplay-enabled rooms will no longer auto-start combat. This is intentional, but tests and docs must make the behavior change explicit.
- V1 avoids a DB migration by using metadata-backed phase/readiness/domain data. This reduces schema risk but makes phase querying/reporting less efficient; add columns later only if admin analytics or filtering require them.
- Historical messages lack domains/kinds/phases, so public projection must provide fallback mapping.
- Do not remove embedded `Rolls:` text until all public clients that need dice visibility render `gameplayRolls`.

## Open Questions
- How should the watch page visually represent hidden-but-important dice: compact reveal, public summary, or an admin-only detail affordance?

## References
- `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md`
- `docs/plans/location-encounter-watch-page-2026-05-24.md`
- `docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md`
- `docs/plans/eliza-interactive-dnd-game-2026-05-22.md`
- `docs/plans/automated-100-turn-gameplay-2026-05-24.md`
