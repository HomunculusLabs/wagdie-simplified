# Combat Narration Quality: Plan

## Goal
Improve location-room combat narration so public combat logs read as consequence-first action instead of passive/generic fallback text. Scope is narration only: character action response quality/retry, GM combat outcome quality, and public message acceptance criteria.

Out of scope: encounter identity/naming, speaker rotation, combat trigger routing, encounter escalation, and broader narrative progression.

## Background
- User decision from up-front checkpoint: scope this plan to narration only; use retry-before-fallback for malformed character-agent combat actions; no hard preference on whether GM prose repeats mechanical numbers from roll cards.
- Character combat actions flow through `OfficialGameplayActionGenerator.generateAction()` in `lib/eliza/locationRooms/gameplay/actionGenerator.ts:317`, with the strict JSON action prompt built by `buildGameplayActionPrompt()` at `lib/eliza/locationRooms/gameplay/actionGenerator.ts:162`.
- Semantic action response handling currently centers on `normalizeGameplayActionResponse()` at `lib/eliza/locationRooms/gameplay/actionGenerator.ts:217`: parsed JSON is validated, while non-JSON responses can be converted into legal fallback actions with fallback metadata.
- Transport/session retry already exists in `sendAndCollectSessionMessage()` at `lib/eliza/official/messaging.ts:225`, but this retries transport/session failures, not semantically invalid action JSON.
- The gameplay coordinator builds validation context, reuses/persists actions, and appends public `character_action` messages in `lib/eliza/locationRooms/gameplay/coordinator.ts:616`, `lib/eliza/locationRooms/gameplay/coordinator.ts:631`, and `lib/eliza/locationRooms/gameplay/coordinator.ts:792`.
- Backend mechanics for combat outcomes are computed in `resolveGameplayTurnMechanics()` at `lib/eliza/locationRooms/gameplay/rules.ts:919` and carried as `GameplayTurnMechanicalDeltas` from `lib/eliza/locationRooms/gameplay/rules.ts:113`.
- Public roll-card facts are projected by `projectPublicGameplayRolls()` in `lib/eliza/locationRooms/gameplay/publicRolls.ts:153`, so structured mechanics do not need to be re-explained in GM prose.
- GM combat outcome prompts are built in `buildGameplayOutcomeNarrationPrompt()` at `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:577`, using selected check facts, stat-aware summaries, sanitized mechanical deltas, recent transcript, and narrative state. The prompt already contains consequence-first guidance; this plan tightens acceptance/repair around that existing intent.
- GM combat outcome normalization requires `publicNarration` in `normalizeGameplayOutcomeNarrationResponse()` at `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:493`; deterministic fallback currently lives in `buildFallbackOutcomeNarration()` at `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:629`.
- The gameplay coordinator appends public combat `gm_outcome` messages from `outcome.publicNarration` at `lib/eliza/locationRooms/gameplay/coordinator.ts:865` and stores the same text as turn `outcomeSummary` at `lib/eliza/locationRooms/gameplay/coordinator.ts:916`.
- Prior art warns against accepting deterministic public fallback as successful GM output: `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md:35` and `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md:47` state public GM messages should come from accepted/repaired Official ElizaOS output, not silent static fallback.
- Prior art also establishes one-shot repair semantics: `docs/plans/crows-den-progression-fix-2026-05-24.md:7` and `docs/plans/crows-den-progression-fix-2026-05-24.md:27` prefer repair once, then fail visibly rather than silently synthesize successful story beats.

## Approach
Implement a targeted narration-quality change across three seams without changing combat mechanics or room orchestration.

1. **Separate semantic parsing from fallback synthesis for character actions.** The current action normalizer can turn non-JSON into fallback. Add a strict parse/validate path, or split the parser, so `generateAction()` can detect semantic failure before fallback synthesis. Only after one Official semantic repair fails should deterministic action fallback be synthesized.
2. **Add GM outcome quality validation and repair.** Structurally valid JSON is not enough if the narration is generic pressure/filler. Validate GM output against backend facts and one-shot repair weak/malformed output. Keep the existing consequence-first prompt guidance, but make acceptance enforce it.
3. **Represent GM repair failure as a typed failure with safe diagnostics.** Define a typed GM outcome generation error that carries only safe metadata. The coordinator must persist safe failure diagnostics and preserve retryable resolved turn state before surfacing the failure.
4. **Do not publish static GM fallback as success.** After Official GM output plus one repair fails, do not append `buildFallbackOutcomeNarration()` as successful public `gm_outcome`. Reuse the existing retry architecture: the action, mechanics, and roll card can remain reusable while GM narration is retried.
5. **Keep roll-card/prose separation explicit.** Roll cards remain the structured mechanics surface. GM prose narrates visible consequence, position, momentum, retaliation, protection, death/victory/flee aftermath, and other facts already present in backend deltas.

## Work Items

### Item 1 — Add strict semantic repair for character combat actions
**Goal:** Add retry-before-fallback behavior for malformed/non-JSON combat action responses from Official ElizaOS character agents.

**Done when:**
- `normalizeGameplayActionResponse()` either gains a strict mode or is split into strict parse/validate and fallback-synthesis helpers.
- `OfficialGameplayActionGenerator.generateAction()` uses the strict path first, attempts exactly one semantic repair when the response is non-JSON or fails gameplay action validation, then uses deterministic fallback only if repair also fails.
- The repair prompt includes enough contract context for the model to fix the shape and legality of the action: legal monster ids, legal character token ids, contextual checks, the safe error category/message, and JSON-only instructions. Exact prompt wording is implementation-owned.
- Deterministic action fallback remains available after failed repair or Official transport/session failure, but metadata distinguishes semantic fallback after repair failure from transport/session fallback.
- Transport retry logic remains in `lib/eliza/official/messaging.ts` and is not conflated with semantic repair.

**Key files:**
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts:162`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts:217`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts:317`
- `lib/eliza/locationRooms/gameplay/rules.ts:466`
- `lib/eliza/official/messaging.ts:225`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Validate and repair GM combat outcome narration
**Goal:** Ensure public combat `gm_outcome` text is consequence-first, backend-fact-bound, and repaired once when malformed or weak.

**Done when:**
- A `validateGameplayOutcomeNarrationQuality()` seam validates normalized GM output against canonical backend inputs: actor/action, selected target monster, `GameplayTurnMechanicalDeltas`, encounter before/after state, and public roll projection.
- The validator rejects only obvious weak output: blank/missing narration, generic pressure/filler without visible consequence, named-but-generic prose with no result, or action-only prose that never states what changed.
- The validator accepts prose when it includes at least one concrete backend-supported anchor and consequence: contact, miss, damage, healing, retaliation, protection, position change, visible strain, death, victory, flee state, or other action-specific result.
- `OfficialGameMasterGameplayGenerator.generateOutcomeNarration()` performs initial generation, normalization, quality validation, one repair attempt on malformed/weak output, and returns accepted/repaired Official output only.
- Repair diagnostics use safe allowlisted categories such as empty response, invalid/missing JSON, missing required field, weak narration, validation error, or transport error. Exact category strings are implementation-owned unless existing consumers require specific values.
- `buildGameplayOutcomeNarrationPrompt()` keeps roll cards as the structured mechanics surface and emphasizes visible fictional consequence without inventing HP, XP/rewards, finality/death, new dice, or unstated monster abilities.
- `buildFallbackOutcomeNarration()` may remain as a direct helper for legacy/private tests but is not used as production public success after Official GM repair failure.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:493`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:577`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:629`
- `lib/eliza/locationRooms/gameplay/rules.ts:113`
- `lib/eliza/locationRooms/gameplay/publicRolls.ts:153`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** None for validator/prose contract work; Item 3 must land before enabling throw-on-GM-repair-failure in production flow.

**Size:** Large.

### Item 3 — Preserve coordinator retry behavior and block public static GM outcomes
**Goal:** Wire generator diagnostics through the gameplay coordinator while preserving existing retry behavior after GM outcome generation failures.

**Done when:**
- A typed GM outcome generation failure carries safe diagnostics from the generator to the coordinator without raw prompts or raw model responses.
- Before surfacing a GM repair failure, the coordinator persists safe status/category metadata in the existing turn/tick metadata path while preserving the already resolved action/mechanics state for retry.
- If GM outcome generation fails after repair, the coordinator does not append public `gm_outcome`, does not update narrative state with synthetic outcome text, and does not set `outcomeSummary` to fallback prose.
- Existing resolved-turn retry behavior remains valid: action, mechanics, and roll-card state can be reused on retry instead of rerolling combat.
- Successful accepted/repaired GM outcome still appends exactly one public `gm_outcome` and completes the turn.
- Visibility for failed repair means existing tick/turn failure state plus safe metadata/last error. Do not add admin UI unless the existing diagnostics projection already exposes recent turn metadata with low risk.

**Key files:**
- `lib/eliza/locationRooms/gameplay/coordinator.ts:631`
- `lib/eliza/locationRooms/gameplay/coordinator.ts:792`
- `lib/eliza/locationRooms/gameplay/coordinator.ts:865`
- `lib/eliza/locationRooms/gameplay/coordinator.ts:916`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`

**Dependencies:** Item 2 for generator error shape. Implement coordinator failure persistence before switching production GM failure from fallback-return to throw.

**Size:** Medium.

### Item 4 — Add focused contract tests and smoke coverage
**Goal:** Prove the new behavior through outcome-focused tests and operational smoke checks without expanding scope.

**Done when:**
- Tests cover action strict parse/repair, action fallback after failed semantic repair, GM repair, GM repair failure, no public static `gm_outcome` after failed GM repair, retryability, and safe metadata.
- Tests assert behavioral contracts rather than brittle prompt-string snapshots, except for minimal invariants required by the prompt contract.
- Existing diagnostics coverage confirms failed GM repair is visible through safe turn/tick failure state and metadata. Admin diagnostics UI/projection changes are deferred unless existing recent-turn metadata support makes them trivial.
- `docs/operations/crows-den-location-room-smoke.md` includes combat-specific smoke checks: no deterministic public `gm_outcome` after failed GM repair, roll card owns mechanics, GM outcome describes visible consequence, and repair failure is visible through safe status/diagnostics.

**Key files:**
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `docs/operations/crows-den-location-room-smoke.md`
- `lib/eliza/locationRooms/adminDiagnostics.ts` only if existing projection support is already present and low-risk

**Dependencies:** Items 1–3.

**Size:** Medium.

## Implementation Order
1. Add strict action parse/validate seam and one-shot action repair.
2. Define GM outcome validation and typed safe failure diagnostics.
3. Update coordinator failure persistence/retry behavior before enabling production GM throw-on-repair-failure.
4. Enable GM repair failure to block public `gm_outcome` fallback success.
5. Add/adjust focused tests and smoke documentation.

## Risks and Constraints
- Stricter GM narration validation can increase failed ticks. Keep heuristics narrow: reject only obvious generic/passive output and rely on one repair attempt.
- Removing public GM fallback success means some combat turns may temporarily show `character_action` + `roll_card` without `gm_outcome` until retry. This is intentional and matches the prior no-static-fallback policy.
- Character action fallback remains acceptable after failed semantic repair or Official transport failure because gameplay needs a legal action to continue. It must be clearly marked as fallback.
- No database schema migration is required. Metadata additions should be additive and safe for old readers.
- Existing stored fallback messages remain historical records; the plan governs new output only.

## Acceptance Criteria
- Public successful combat logs contain `character_action`, `roll_card`, and consequence-first `gm_outcome`.
- Non-JSON/malformed character action output gets one semantic repair before fallback synthesis.
- GM combat outcome malformed JSON, missing `publicNarration`, or weak generic prose gets one repair attempt.
- Failed GM repair does not append deterministic/static public `gm_outcome`.
- Turn/tick failure is visible through existing failure handling and safe diagnostics.
- `roll_card` remains the structured source for dice/mechanics.
- GM prose does not invent mechanics outside `GameplayTurnMechanicalDeltas`.
- Encounter naming, speaker rotation, combat trigger routing, and broader narrative progression remain out of scope.

## Implementation Verification Points
- Confirm the chosen strict action parsing seam cannot accidentally synthesize fallback before repair.
- Confirm coordinator metadata can be persisted before surfacing GM narration failure while preserving retryable resolved mechanics.
- Confirm existing diagnostics surfaces are sufficient for failed-repair visibility before adding any admin diagnostics projection.

## Open Questions
None blocking. The implementation verification points above affect sequencing and validation, not product direction.

## References
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/locationRooms/gameplay/publicRolls.ts`
- `lib/eliza/official/messaging.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md`
- `docs/plans/crows-den-progression-fix-2026-05-24.md`
