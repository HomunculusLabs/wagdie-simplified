# Location-Room Agent Dice-Roll Choices: Plan

## Goal
Enable elizaOS character/player agents in location rooms to make D&D-like roll choices as part of their turns. An agent should narrate intent, choose a fixed or contextual check such as `explore`, `investigate`, `arcana`, or `nature`, have the server resolve authoritative dice/check mechanics, and receive a GM-narrated outcome with a visible public roll card.

This is a targeted extension of the existing gameplay turn pipeline, not a broad rewrite. The first version uses the user-confirmed model: elizaOS agents are the players, mechanics are server-owned, the GM narrates computed results, checks are fixed plus contextual, and the transcript shows an immediate structured roll card.

## Implementation Progress
- [x] Build 1/3 — Core roll-choice mechanics/prompts (Items 1–6): implemented in `types.ts`, `rules.ts`, `actionGenerator.ts`, `gameMasterGameplayGenerator.ts`, plus focused rules/generator tests. Verified with `bun run test tests/lib/eliza/location-room-gameplay-rules.test.ts tests/lib/eliza/location-room-gameplay-generators.test.ts`.
- [x] Build 2/3 — Public roll-card DTO/message kind/UI (Items 7, 8, 10): implemented `roll_card` message kind, public check display fields, public-roll projection/sanitization, presentation labels/styles, and focused public-roll/service/watch-page tests. Verified with `bun run test tests/lib/eliza/location-room-gameplay-public-rolls.test.ts tests/api/eliza/location-room-service.test.ts tests/components/location-rooms/location-room-watch-page.test.tsx`.
- [x] Build 3/3 — Coordinator sequencing, idempotency, and final verification (Item 9 + checklist): implemented `character_action` → `roll_card` → `gm_outcome` sequencing, roll-card metadata/dedupe, resolved-before-GM-outcome state persistence, coordinator retry tests, post-review trust-boundary fixes, and final changed-test verification. Verified with `bun run test tests/lib/eliza/location-room-gameplay-rules.test.ts tests/lib/eliza/location-room-gameplay-generators.test.ts tests/lib/eliza/location-room-gameplay-public-rolls.test.ts tests/api/eliza/location-room-service.test.ts tests/components/location-rooms/location-room-watch-page.test.tsx tests/lib/eliza/location-room-gameplay-coordinator.test.ts`.

## Background
- User direction from the up-front checkpoint: the "players" are elizaOS agents, not humans choosing from UI controls; roll choice should be represented in agent action generation. Roll authority should be hybrid: backend resolves mechanics, and the GM agent narrates the outcome. Available checks should be fixed plus contextual. The public transcript should show an immediate roll card rather than hiding the roll only inside the later GM response.
- Current gameplay action generation already prompts character agents for a strict JSON envelope: `actionType`, `target`, `publicSpeech`, and `intentSummary` in `lib/eliza/locationRooms/gameplay/actionGenerator.ts:134-168`. Today the available action types are combat-oriented (`attack`, `defend`, `help`, `investigate`, `negotiate`, `flee`, `rest`). Non-JSON character-agent replies fall back to cautious `investigate` handling in `lib/eliza/locationRooms/gameplay/actionGenerator.ts:174-197`.
- The action envelope and supported action list live in `lib/eliza/locationRooms/gameplay/types.ts:14-16` and `lib/eliza/locationRooms/gameplay/types.ts:280-286`. Validation is centralized in `validateGameplayActionEnvelope()` at `lib/eliza/locationRooms/gameplay/rules.ts:299-359`, including legal targets and action-specific requirements.
- Server-side dice/check mechanics already exist. `deriveActionRollPlan()` chooses DC, target kind, and modifiers at `lib/eliza/locationRooms/gameplay/rules.ts:361-411`; `determineSuccessTier()` maps natural 1/20 and DC thresholds to critical failure, failure, partial success, success, and critical success at `lib/eliza/locationRooms/gameplay/rules.ts:413-420`; `resolveActionRoll()` performs the d20 roll at `lib/eliza/locationRooms/gameplay/rules.ts:422-445`.
- The current coordinator resolves the action, persists mechanics, asks the GM to narrate only backend-computed facts, then appends two public messages: a character action and a GM outcome. The message writes are in `lib/eliza/locationRooms/gameplay/coordinator.ts:760-841`.
- Structured public roll metadata already exists but is attached to the GM outcome message. `projectPublicGameplayRolls()` converts mechanical summaries into public-safe roll data in `lib/eliza/locationRooms/gameplay/publicRolls.ts:234-247`; `sanitizePublicGameplayRolls()` protects the public DTO in `lib/eliza/locationRooms/gameplay/publicRolls.ts:341-354`.
- The public DTO exposes `PublicLocationRoomGameplayRolls` and `PublicLocationRoomMessage.gameplayRolls` in `lib/eliza/locationRooms/types.ts:156-224`. The DTO intentionally excludes raw mechanics, modifier sources, private state, full metadata, and wallets.
- The watch UI already separates narration from roll display. `EncounterMessageCard` splits legacy `Rolls:` prose, then renders `StructuredRollPanel` when `message.gameplayRolls` is present in `components/location-rooms/EncounterMessageCard.tsx:19-39` and `components/location-rooms/EncounterMessageCard.tsx:118-127`.
- Message classification currently distinguishes `gm_setup`, `character_action`, and `gm_outcome` via `PublicLocationRoomGameplayMessageKind` in `lib/eliza/locationRooms/types.ts:156`. There is no public gameplay message kind for an immediate roll-card-only event yet.
- Location-room agent participation has two agent layers. The GM agent produces structured narrative beats (`services/elizaos/src/characters/wagdie-game-master-character.ts:1` and `lib/eliza/locationRooms/gameMasterGenerator.ts:45-64`), while per-character elizaOS agents are resolved by token ID and prompted through `lib/eliza/locationRooms/officialTurnGenerator.ts:148-195` for narrative turns or `lib/eliza/locationRooms/gameplay/actionGenerator.ts` for gameplay turns.
- Tick-level intent already exists for room processing (`LocationRoomTurnIntent = 'auto' | 'story' | 'combat'`) in `lib/eliza/locationRooms/types.ts:16-17`, with API validation and admin-only combat handling in `app/api/eliza/location-rooms/[locationId]/tick/route.ts:24-44` and `lib/eliza/locationRooms/service.ts:640-652`. This is broader than per-agent roll choice and should not be conflated with action/check selection.
- Prior art: `docs/plans/eliza-interactive-dnd-game-2026-05-22.md` established one active encounter per room, structured character actions, server-owned dice/rules, and GM outcome narration. `docs/plans/location-encounter-watch-page-2026-05-24.md` introduced the public watch page and structured public roll metadata. `docs/plans/ttrpg-story-combat-experience-2026-05-24.md` added story/combat routing, message domains/kinds, and public structured rolls. `docs/plans/crows-den-progression-fix-2026-05-24.md` hardened progression and combat handoff.

## Approach
### 1. Keep actions and checks separate
Do not add every D&D-like check to `GameplayActionType`. `actionType` should remain the tactical/effect driver: attack damage, defend/help behavior, rest healing, flee state, performance counters, and target requirements. Add a separate roll-choice/check model for the mechanical check the agent wants to attempt.

The normalized persisted action shape should add optional `rollChoice` to `GameplayActionEnvelope`:

- `source`: `fixed`, `contextual`, or `inferred`
- `checkType`: a server-known `GameplayCheckType`
- `contextualCheckId`: present only when the agent chose a server-offered contextual check
- `label`: server-normalized display label

Missing `rollChoice` remains valid for backward compatibility. When absent, the server infers a check from the existing `actionType`.

### 2. Define a closed, server-owned check taxonomy
Add a closed `GAMEPLAY_CHECK_TYPES` list in `lib/eliza/locationRooms/gameplay/types.ts`. The implementation should include the user examples (`explore`, `investigate`, `arcana`, `nature`) plus existing action-compatible checks (`attack`, `defend`, `help`, `negotiate`, `flee`, `rest`). It may add adjacent common checks such as `perception`, `survival`, `athletics`, `stealth`, `persuasion`, `intimidation`, `medicine`, `history`, or `religion` only when the stat/DC mapping is defined in the same change and covered by tests.

`rules.ts` should own fixed check configuration: labels, base DCs, and primary stat mappings. Suggested first-pass mappings are intentionally modest and can be tuned during implementation, but they should be explicit rather than invented ad hoc:

| Check | Suggested primary stats | Suggested base DC |
|---|---|---:|
| `explore` | WIS or DEX | 12 |
| `investigate` | INT or WIS | 12 |
| `arcana` | INT | 13 |
| `nature` | INT or WIS | 12 |
| `perception` / `survival` | WIS, with CON as appropriate for survival | 12 |
| `athletics` / `stealth` | STR for athletics, DEX for stealth | 12 |
| `persuasion` / `intimidation` | CHA, with STR allowed for intimidation | 13 |

Existing action checks should preserve current behavior where possible.

### 3. Normalize contextual checks as encounter mechanics
Contextual checks should be proposed during gameplay encounter setup and normalized by backend rules before they reach character-agent prompts or roll resolution.

Canonical shape:

- Input seam: optional `contextualChecks` on the GM encounter proposal handled in `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts` and normalized in `rules.ts`.
- Stored seam: `encounter.mechanics.contextualChecks` on the normalized gameplay encounter.
- Runtime seam: action generation and roll resolution read only the normalized stored options.

Each normalized contextual option should contain:

- `id`: stable slug, max 64 chars
- `label`: public-safe label, max 80 chars
- `description`: optional public-safe description, max 160 chars
- `checkType`: valid `GameplayCheckType`
- `dc`: server-clamped `8..20`, defaulting to the contextual proposal DC, then encounter `sceneDc`, then fixed-check base DC

Cap contextual checks at four per encounter. Fallback encounters should use no contextual checks unless the fallback generator can produce one deterministic, tested `explore`-style option.

### 4. Update agent action generation, not human UI controls
Because the players are elizaOS agents, the primary input seam is `buildGameplayActionPrompt()` in `lib/eliza/locationRooms/gameplay/actionGenerator.ts`. The prompt should continue to ask for `actionType`, `target`, `publicSpeech`, and `intentSummary`, and add a required `rollChoice` for new generations.

The prompt should list available tactical actions, fixed checks, and normalized contextual checks. It should explicitly explain that `actionType` is intent/effect while `rollChoice` is the mechanical check. Contextual choices must use an offered `contextualCheckId`; agents must not invent contextual ids.

Fallback behavior should remain robust: if the agent returns prose or invalid JSON, preserve the existing cautious `investigate` fallback and attach an inferred/fixed `investigate` roll choice.

### 5. Resolve dice/checks on the server
Extend `validateGameplayActionEnvelope()` and the roll-planning functions so validation and mechanics are server-owned:

- fixed choices must use known `GameplayCheckType` values,
- contextual choices must match normalized encounter options,
- agent-supplied contextual labels/DCs/check types are ignored,
- target validation remains action-driven (`attack` requires monster target, `help` requires character target),
- `deriveActionRollPlan()` resolves DC/modifier/check metadata from `rollChoice`,
- `resolveGameplayTurnMechanics()` keeps action effects driven by `actionType` while dice/check metadata comes from `rollChoice`.

This preserves existing combat mechanics while allowing a character to, for example, take a cautious `defend` action using `perception`, or attempt an `investigate` action using a contextual `read-the-runes` check.

### 6. Keep GM narration downstream of computed facts
Update `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts` so outcome prompts include the selected check facts: check type, label, source, contextual check id when relevant, roll total, DC, tier, and public speech.

Keep the existing constraint that the GM may narrate only backend-computed facts. The GM should not assign dice, HP, death, rewards, or mechanical state.

### 7. Add an immediate `roll_card` transcript message
Add a new public gameplay message kind: `roll_card`. The durable requirement is immediate public-safe structured roll metadata in the transcript; exact content copy and styling can be owned by implementation.

The new gameplay turn order should be:

1. optional `gm_setup`,
2. `character_action`,
3. `roll_card`,
4. `gm_outcome`.

Coordinator sequencing should preserve crash recovery:

1. generate/validate action,
2. resolve mechanics,
3. persist the turn as resolved enough to recover the computed action/roll,
4. append `character_action`,
5. append `roll_card` with `metadata.publicRolls` and a distinct dedupe key such as `gameplay:roll_card`,
6. persist updated `publicMessageIds`,
7. generate GM outcome narration,
8. append `gm_outcome`,
9. mark the turn completed.

For new turns, the roll card becomes the canonical location for structured roll metadata. Keep legacy `rollSummary` metadata on `gm_outcome` for compatibility/debugging, and keep old `gm_outcome.gameplayRolls` rendering compatible for historical turns.

### 8. Extend the public DTO and UI additively
Update `PublicLocationRoomGameplayMessageKind` and message-kind handling to include `roll_card`. Extend `PublicLocationRoomGameplayActionRoll` additively with optional check display fields: `checkType`, `checkLabel`, `checkSource`, and `contextualCheckId`.

Update `projectPublicGameplayRolls()` and `sanitizePublicGameplayRolls()` to emit and preserve those public-safe fields. Then update `StructuredRollPanel` to prefer `checkLabel`/`checkType` over `actionType`, while keeping the old action-only display fallback. `EncounterMessageCard` can render `roll_card` through the same structured-roll path it already uses.

## Work Items
### Item 1 — Define the check taxonomy and action envelope extension
**Goal:** Add backend types for fixed/contextual checks and optional `rollChoice` without turning every check into an action effect.

**Done when:**
- `GAMEPLAY_CHECK_TYPES` and `GameplayCheckType` exist.
- `GameplayRollChoice` and `GameplayContextualCheckOption` exist.
- `GameplayActionEnvelope` accepts optional normalized `rollChoice`.
- Existing `GameplayActionType` consumers are not forced to treat `arcana`, `nature`, or other skill checks as action-effect branches.

**Key files:**
- `lib/eliza/locationRooms/gameplay/types.ts:14-16`
- `lib/eliza/locationRooms/gameplay/types.ts:280-286`

**Dependencies:** None.

**Size:** Small.

### Item 2 — Add fixed check configuration and roll-choice validation
**Goal:** Validate fixed roll choices and backward-compatible inferred roll choices before contextual checks are introduced.

**Done when:**
- Fixed check labels, base DCs, and primary stat mappings are defined in `rules.ts`.
- `validateGameplayActionEnvelope()` accepts valid fixed roll choices.
- Invalid fixed check types fail validation.
- Missing `rollChoice` infers from `actionType` for old actions.
- Target validation remains unchanged and action-driven.

**Key files:**
- `lib/eliza/locationRooms/gameplay/rules.ts:299-359`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Normalize contextual checks from encounter setup
**Goal:** Let GM encounter setup propose contextual check options while backend clamps and owns them.

**Done when:**
- Encounter proposal parsing accepts optional `contextualChecks`.
- Normalized encounters store bounded `mechanics.contextualChecks`.
- Contextual checks are capped, string-limited, valid-check-only, and DC-clamped with the defaulting order in this plan.
- Fallback encounters remain valid with no contextual checks unless a deterministic fallback contextual option is explicitly tested.
- Tests cover malformed, excessive, and valid contextual checks.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`

**Dependencies:** Items 1–2.

**Size:** Medium.

### Item 4 — Extend roll planning to use selected checks
**Goal:** Resolve d20 mechanics from `rollChoice` while preserving action-driven gameplay effects.

**Done when:**
- `deriveActionRollPlan()` includes `checkType`, `checkLabel`, `checkSource`, and optional `contextualCheckId` in its roll plan/result.
- `resolveActionRoll()` and `resolveGameplayTurnMechanics()` pass through check metadata.
- DC and primary-stat selection come from the selected fixed check or normalized contextual option.
- Attack/rest/flee/help effects still depend on `actionType`.
- Existing no-`rollChoice` tests pass through inferred checks.
- Any performance-counter changes are added only if the selected-check data creates a concrete scoring need.

**Key files:**
- `lib/eliza/locationRooms/gameplay/rules.ts:361-445`
- `lib/eliza/locationRooms/gameplay/rules.ts:709-909`
- `lib/eliza/locationRooms/gameplay/performance.ts` if check-specific counters are needed
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`

**Dependencies:** Items 2–3.

**Size:** Medium.

### Item 5 — Update character-agent gameplay prompts
**Goal:** Make elizaOS character/player agents choose both a tactical action and a roll check.

**Done when:**
- The gameplay prompt lists fixed checks and normalized contextual checks.
- The JSON contract includes `rollChoice`.
- Prompt text explains the difference between `actionType` and `rollChoice`.
- Non-JSON and official-error fallbacks include an inferred/fixed `investigate` roll choice.
- Tests confirm `explore`, `arcana`, `nature`, and contextual options appear in the prompt.

**Key files:**
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts:134-168`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts:174-197`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** Items 1–4.

**Size:** Medium.

### Item 6 — Include selected checks in GM outcome facts
**Goal:** Let the GM narrate the chosen check outcome without giving it mechanical authority.

**Done when:**
- GM outcome prompt includes selected check type/label/source and contextual check id when applicable.
- Sanitized mechanical summaries include public-safe check metadata.
- Existing prompt rules still forbid inventing dice, HP, deaths, XP, rewards, or state changes beyond backend facts.
- Tests assert check metadata appears in outcome prompts.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** Items 4–5.

**Size:** Small.

### Item 7 — Extend public roll DTO projection and sanitization
**Goal:** Public roll metadata can display the selected check while preserving old roll metadata.

**Done when:**
- `PublicLocationRoomGameplayActionRoll` has optional check display fields.
- `projectPublicGameplayRolls()` emits check fields from mechanical summaries.
- `sanitizePublicGameplayRolls()` preserves only public-safe check fields.
- Old metadata without check fields still sanitizes and renders.

**Key files:**
- `lib/eliza/locationRooms/types.ts:156-224`
- `lib/eliza/locationRooms/gameplay/publicRolls.ts:234-247`
- `lib/eliza/locationRooms/gameplay/publicRolls.ts:341-354`
- `tests/lib/eliza/location-room-gameplay-public-rolls.test.ts`

**Dependencies:** Item 4.

**Size:** Small.

### Item 8 — Add the `roll_card` message kind and public mapping
**Goal:** Represent immediate roll cards as first-class transcript messages.

**Done when:**
- Public and internal message-kind unions include `roll_card` where needed.
- Public read mapping exposes `roll_card` messages and their `gameplayRolls`.
- Existing clients remain compatible because the DTO changes are additive.

**Key files:**
- `lib/eliza/locationRooms/types.ts:156`
- `lib/eliza/locationRooms/service.ts:250`

**Dependencies:** Item 7.

**Size:** Small.

### Item 9 — Re-sequence coordinator message appends
**Goal:** Append an immediate structured roll card before GM outcome narration with a recoverable state boundary.

**Done when:**
- New message order is `gm_setup` if present, then `character_action`, `roll_card`, and `gm_outcome`.
- The turn is persisted as resolved before public action/roll-card append and completed after GM outcome append, or an equivalent existing state boundary is documented in tests.
- `roll_card` carries `metadata.publicRolls` and uses a distinct dedupe key.
- New `gm_outcome` messages no longer duplicate structured `publicRolls`, while retaining legacy `rollSummary` metadata if useful.
- Retry paths dedupe action, roll card, and outcome messages and preserve `publicMessageIds`.
- Coordinator tests cover message order and retry/idempotency behavior.

**Key files:**
- `lib/eliza/locationRooms/gameplay/coordinator.ts:760-841`
- `lib/eliza/locationRooms/repository.ts:702-854`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`

**Dependencies:** Items 7–8.

**Size:** Large.

### Item 10 — Update watch UI rendering
**Goal:** Roll cards render clearly in the public transcript.

**Done when:**
- `locationRoomPresentation.ts` labels `roll_card` as a roll/check result and gives it appropriate combat styling.
- `StructuredRollPanel` prefers `checkLabel` or formatted `checkType` before falling back to `actionType`.
- Legacy GM outcome rolls still render for historical messages.
- Watch-page/component tests cover roll-card rendering.

**Key files:**
- `components/location-rooms/locationRoomPresentation.ts:43-84`
- `components/location-rooms/StructuredRollPanel.tsx:22`
- `components/location-rooms/EncounterMessageCard.tsx:118-127`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Items 7–9.

**Size:** Medium.

## Verification Checklist
- Rules tests cover fixed checks, contextual checks, invalid choices, missing-`rollChoice` inference, and success-tier behavior.
- Generator tests cover prompt content and fallback roll choices.
- Public-roll tests cover check-field projection/sanitization and old metadata compatibility.
- Coordinator tests cover `character_action` → `roll_card` → `gm_outcome` ordering and dedupe/retry behavior.
- Watch-page tests cover the visible roll card and legacy roll rendering.
- Implementation verifies existing JSON-backed columns are sufficient for encounter mechanics, persisted action, mechanical deltas, and message metadata before relying on the no-migration path.

## Compatibility and Risks
- **No schema migration is expected for v1, but this must be verified.** New fields should fit existing JSON-backed action, mechanics, encounter, and message metadata; implementation must confirm those columns cover the storage paths before skipping migrations.
- **Old gameplay turns must continue to work.** Missing `rollChoice` should infer from `actionType`; old `gm_outcome.gameplayRolls` should still sanitize and render.
- **Do not conflate tick intent with roll choice.** `LocationRoomTurnIntent` remains room/tick routing (`auto`, `story`, `combat`), not the agent's chosen skill/check.
- **Contextual check trust boundary is critical.** The GM can suggest scene-flavored options, but the backend must normalize ids, labels, count, valid check type, and DC.
- **Partial tick failure after `roll_card` is acceptable only if retry is idempotent.** Use the existing message dedupe pattern and a tested resolved/completed turn boundary so retries can complete the missing GM outcome cleanly.
- **Avoid overloading `actionType`.** Keeping checks separate prevents `arcana`/`nature` from becoming accidental combat-effect branches.

## Open Questions
None blocking. The plan resolves the initial open questions as follows: introduce a separate check taxonomy rather than expanding `GameplayActionType`; add a new `roll_card` public message kind for immediate rolls; start with a bounded fixed check list plus up to four server-normalized contextual checks per encounter.

## References
- `docs/plans/eliza-interactive-dnd-game-2026-05-22.md`
- `docs/plans/location-encounter-watch-page-2026-05-24.md`
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/plans/crows-den-progression-fix-2026-05-24.md`
- `docs/reviews/eliza-interactive-dnd-game-plan-critique-2026-05-22.md`
- `docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md`
- `docs/reviews/location-room-agent-dice-roll-choices-plan-critique-2026-05-25.md`
