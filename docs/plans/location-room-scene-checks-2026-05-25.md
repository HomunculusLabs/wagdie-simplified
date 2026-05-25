# Location Room Scene Checks: Plan

## Goal
Add non-combat scene checks to location-room narrative play so characters can propose roll-worthy story/exploration actions, the GM/backend can request or override the check, the backend rolls server-side, and the room posts public structured roll cards without forcing normal exploration into combat encounters.

Deliver single-roll checks first. Multi-roll skill challenges are a later phase after the single-roll path is stable.

## Background
- User decisions: use a separate scene-check path rather than reusing combat encounters; allow both character proposals and GM/backend decisions; implement single-roll checks first, then phase in multi-roll skill challenges.
- Current scheduled worker path enters `LocationRoomService.runScheduledWorker()` from `app/api/sync/eliza-location-rooms/route.ts:42` and from worker autostart at `lib/eliza/locationRooms/workerAutostart.ts:57-60`.
- Manual tick API currently parses only `auto | story | combat` at `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-44`; durable tick intent is `LocationRoomTurnIntent = 'auto' | 'story' | 'combat'` in `lib/eliza/locationRooms/types.ts:16-17`.
- Scheduled due rooms enqueue `turnIntent: 'auto'`, `triggerType: 'scheduled'`, and `gameplayRunId: null` in `lib/eliza/locationRooms/service.ts:784-791`.
- The primary routing seam is `processClaimedTickUnsafe()` in `lib/eliza/locationRooms/service.ts:1380+`: gameplay claims a tick around `service.ts:1422-1462`; otherwise narrative fallback starts around `service.ts:1515-1549`.
- Current gameplay/combat routing requires gameplay enabled+allowlisted (`lib/eliza/locationRooms/service.ts:404-412`) and either an active encounter or an unconsumed `start_combat` trigger (`service.ts:400-403`, `service.ts:1102-1129`, `service.ts:1422-1462`).
- Narrative metadata already acts as a durable state-machine patch object in `lib/eliza/locationRooms/narrativeTypes.ts:92-103` and `:166-205`; combat handoff metadata is written in `lib/eliza/locationRooms/narrativeCoordinator.ts:372-390`.
- Roll mechanics already separate fixed and contextual checks. Character gameplay prompts request `rollChoice` at `lib/eliza/locationRooms/gameplay/actionGenerator.ts:192-198`; validation and inference live in `lib/eliza/locationRooms/gameplay/rules.ts:373-468`; roll plans resolve server-side in `rules.ts:529-657`.
- Public roll cards already project check metadata in `lib/eliza/locationRooms/gameplay/publicRolls.ts:139-156` and are appended by combat gameplay coordinator around `lib/eliza/locationRooms/gameplay/coordinator.ts:826-834`.
- The ElizaOS WAGDIE gameplay plugin is attached at server config (`services/elizaos/src/server.ts:24-37`) and provides a no-op action helper (`services/elizaos/src/wagdie-gameplay-plugin.ts:67-126`), but its JSON contract lacks `rollChoice` (`wagdie-gameplay-plugin.ts:25-33`, `:45-55`, `:78-82`, `:109-114`). Backend is tolerant because missing `rollChoice` is inferred (`lib/eliza/locationRooms/gameplay/rules.ts:373-381`, `:422-428`), but plugin guidance is stale.
- Prior art: `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md` and commit `c48868b3` implemented roll choices inside gameplay/combat; `docs/plans/ttrpg-story-combat-experience-2026-05-24.md` and commit `2a1c9520` intentionally made narrative story-first and combat explicitly triggered; `docs/investigations/location-room-rolls-not-triggering-2026-05-25.md` confirmed rolls are absent because Crow's Den remains narrative-only with no active encounter or trigger.

## Approach
Implement scene checks as a narrative-path subsystem, not as combat encounters or gameplay runs. The route should reuse existing roll primitives (`GameplayCheckType`, `GameplayRollChoice`, contextual checks, dice, and public roll DTOs), but it should not require `GameplayEncounter`, `GameplayRun`, monsters, retaliation, rewards, death/finality, or combat lifecycle state.

A narrative tick may produce this sequence:

1. Optional GM beat.
2. Character in-world action/speech, optionally with a scene-check proposal.
3. Backend adjudication: GM request wins when present; otherwise valid character proposal wins; otherwise backend can safely fall back or skip.
4. Server-side d20 roll using validated fixed/contextual check metadata.
5. Public narrative `roll_card` message.
6. GM scene-check outcome narration using only backend-computed roll facts.

Do not conflate tick-level intent (`auto | story | combat`) with per-character roll/check choice. Combat routing remains unchanged. `requestedGameplayAction` should stay combat-only for `start_combat`; scene checks should use separate request/proposal metadata and one-shot idempotency state.

Use existing JSON metadata and message dedupe for the first release. The authoritative retry state should live on `LocationRoomNarrativeBeat.metadata.sceneCheck` with request/proposal/adjudication/resolution/message id subfields. Add a narrow repository helper to patch that metadata before appending the roll card; do not add schema unless implementation proves JSON metadata cannot safely handle retry/idempotency.

## Work Items

### Item 1 — Define scene-check domain types and single-roll rules
**Goal:** Add a small scene-check layer that can normalize GM requests, normalize character proposals, adjudicate the final check, and resolve one backend-owned roll using existing gameplay check primitives.

**Done when:**
- New scene-check types exist for request, proposal, adjudication, and resolution.
- Scene-check action intent is explicitly separate from check type: e.g. `investigate` is an action intent, while `arcana`, `nature`, or `perception` stay `rollChoice.checkType` values.
- The implementation either maps scene-check action intent into existing `GameplayActionType` for `resolveActionRoll()` or wraps `resolveActionRoll()` behind a scene-check-specific adapter; this boundary is explicit and tested.
- GM request precedence is explicit: GM request > valid character proposal > backend fallback/skip.
- Roll resolution uses existing backend roll rules/dice and never trusts agent-supplied dice, DC authority, rewards, HP, death, or finality.
- Missing stats fall back safely and honor existing gameplay stats configuration.
- Normalization/adjudication tests are written with this item, before prompt integration.

**Key files:**
- Add `lib/eliza/locationRooms/sceneChecks/types.ts`
- Add `lib/eliza/locationRooms/sceneChecks/rules.ts`
- Reuse `lib/eliza/locationRooms/gameplay/types.ts`
- Reuse `lib/eliza/locationRooms/gameplay/rules.ts:373-657`
- Reuse `lib/eliza/locationRooms/gameplay/dice.ts`

**Dependencies:** Existing gameplay check types/rules and gameplay stats config.

**Size:** Large.

### Item 2 — Project scene checks as public roll cards
**Goal:** Reuse the existing public roll-card DTO path while distinguishing narrative scene checks from combat rolls.

**Done when:**
- Public roll metadata supports an additive context marker, e.g. `rollContext: 'combat' | 'scene_check'`.
- Scene-check roll cards include actor, action/check label, source, d20 result, modifier, total, DC, tier/outcome, and request source metadata.
- Existing combat roll-card behavior remains backward-compatible.
- Repository public-message projection still exposes roll cards through the existing `message.gameplayRolls` compatibility surface.

**Key files:**
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/repository.ts`
- `lib/eliza/locationRooms/gameplay/publicRolls.ts`
- Add `lib/eliza/locationRooms/sceneChecks/publicRolls.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Extend GM narrative beats with optional scene-check requests
**Goal:** Let the GM request a non-combat check during story/exploration without using `start_combat` or combat encounter routing.

**Done when:**
- `GameMasterBeatOutput` can carry `sceneCheckRequest: null | request`.
- GM prompt contract includes optional `sceneCheckRequest` and clearly separates it from `requestedGameplayAction: 'start_combat'`.
- GM response normalization validates scene-check request fields and rejects/repairs unsafe mechanics.
- Fallback GM beats set `sceneCheckRequest: null`.
- Narrative beat metadata persists the sanitized scene-check request.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** Items 1-2.

**Size:** Large.

### Item 4 — Extend narrative character turns with optional scene-check proposals
**Goal:** Let character agents propose roll-worthy story actions while preserving normal prose behavior when no check is needed or when the model ignores the structured contract.

**Done when:**
- Character narrative turn context can include scene-check mode/request/contextual options.
- When scene-check context exists, the character prompt asks for JSON with `publicSpeech` and optional `sceneCheckProposal`.
- Prose-only responses remain valid: public speech is used and proposal is null.
- Invalid proposal data does not fail the whole tick; it either falls back or skips according to scene-check rules.
- The ElizaOS gameplay plugin guidance includes `rollChoice` and optional scene-check proposal guidance, without making the plugin authoritative for mechanics.

**Key files:**
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/types.ts`
- `services/elizaos/src/wagdie-gameplay-plugin.ts`
- Existing reference: `lib/eliza/locationRooms/gameplay/actionGenerator.ts:160-204`

**Dependencies:** Items 1-3.

**Size:** Medium.

### Item 5 — Integrate scene checks into the narrative coordinator with durable idempotency
**Goal:** Add the scene-check message sequence to the narrative path: character action, roll card, and GM outcome, without changing combat routing.

**Done when:**
- Narrative coordinator adjudicates a scene check after GM beat + character action.
- If no check is requested/proposed, current narrative flow is unchanged.
- If a check is resolved, the coordinator stores `metadata.sceneCheck.resolution` before appending the roll card so retries do not reroll.
- Beat metadata records at least: `id`, sanitized GM request, sanitized character proposal, final adjudication, roll resolution/public rolls, and message ids for character action / roll card / GM outcome.
- Message order is stable: `character_action` → `roll_card` → `gm_outcome`.
- Scene-check messages use narrative-domain metadata, not combat-domain metadata. Recommended message metadata: `messageDomain: 'narrative'`, `messageKind: 'character_action' | 'roll_card' | 'gm_outcome'`, `sceneCheck: true`, `beatId`, `sceneCheckId`, and `ttrpgPhase`.
- Dedupe keys are namespaced per beat/scene-check step, e.g. `scene_check:<beatId>:character_action`, `scene_check:<beatId>:roll_card`, and `scene_check:<beatId>:gm_outcome`.
- On retry, existing beat metadata and deduped messages are reused and the coordinator resumes at the first missing step.
- `ProcessNarrativeLocationRoomTurnResult` remains backward-compatible with `messageId` as the final appended public message, while optionally returning all message ids and `sceneCheckId`.
- `LocationRoomService` only needs result-handling updates; combat routing remains unchanged.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/service.ts`
- Reference: `lib/eliza/locationRooms/gameplay/coordinator.ts:760-910`

**Dependencies:** Items 1-4.

**Size:** Large.

### Item 6 — Add GM outcome narration for scene checks
**Goal:** After a scene check roll, have the GM narrate the consequence and update narrative continuity using only backend-computed roll facts.

**Done when:**
- GM outcome generation receives actor, action, check, roll total, DC, success tier, and public-safe context.
- Prompt forbids invented dice, DCs, HP, damage, rewards, death, or finality.
- Output updates state summary, objective, and open threads.
- Safe fallback outcome exists for provider/JSON failures.
- Outcome message is public and narrative-domain, not combat-domain.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- Reference: `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`

**Dependencies:** Item 5.

**Size:** Medium.

### Item 7 — Update watch-page presentation for narrative roll cards
**Goal:** Make scene-check roll cards visually/readably distinct from combat while reusing existing structured-roll UI.

**Done when:**
- Narrative `character_action`, `roll_card`, and `gm_outcome` labels render as scene action/check/outcome.
- `StructuredRollPanel` uses scene-check wording when `rollContext === 'scene_check'`.
- Combat roll cards remain unchanged.
- Tests cover the new labels and structured scene-check rendering.

**Key files:**
- `components/location-rooms/locationRoomPresentation.ts`
- `components/location-rooms/StructuredRollPanel.tsx`
- `components/location-rooms/EncounterMessageCard.tsx`
- `components/location-rooms/EncounterTranscript.tsx`

**Dependencies:** Items 2 and 5.

**Size:** Small.

### Item 8 — Finish integration tests, UI tests, and deployment diagnostics
**Goal:** Cover the routing distinction and make future debugging clear when a room does or does not roll. Early unit tests for rules/normalization belong in Item 1; this item completes cross-module coverage.

**Done when:**
- Unit tests cover scene-check request/proposal normalization, GM override precedence, invalid proposal fallback, and no-reroll retry behavior.
- Service tests cover allowlisted narrative scene checks without creating gameplay runs or encounters.
- Generator tests cover GM scene-check request prompt, character proposal prompt, prose fallback, and outcome prompt safety.
- UI tests cover narrative scene-check roll cards.
- Routing diagnostics/logs expose: gameplay gate result, active encounter id, combat trigger id, scene-check request/proposal presence, selected route, and skip reason.

**Key files:**
- Add `tests/lib/eliza/location-room-scene-checks.test.ts`
- `tests/api/eliza/location-room-service.test.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`
- `tests/components/location-rooms/*`
- `lib/eliza/locationRooms/service.ts`

**Dependencies:** Items 1-7.

**Size:** Medium.

## Deferred: Skill Challenges
Multi-roll skill challenges are deferred entirely from this build. Once single-roll scene checks are stable, create a separate plan for challenge state, multi-turn progress/failure counters, and UI progress display.

## Open Questions
None blocking.

## References
- `docs/investigations/location-room-rolls-not-triggering-2026-05-25.md`
- `docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md`
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- Recent commits: `c48868b3`, `2a1c9520`, `531776e1`
