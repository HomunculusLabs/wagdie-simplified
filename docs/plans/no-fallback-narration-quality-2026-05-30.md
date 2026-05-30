# No-Fallback Narration Quality: Plan

## Goal
Eliminate accepted public narration/action fallbacks in location-room narrative and gameplay flows. Public GM narration, character actions, encounter setup, and gameplay outcomes should come from configured ElizaOS/Official agents after validation/repair, or fail retryably with safe diagnostics instead of publishing generic static copy.

This plan also keeps the related quality improvements: shorter combat loops, stronger encounter identity, and prompt/validator pressure for richer GM and character output.

## Background
- Dev location 11 narration review showed the quality problem is not raw message generation volume alone: 264 of 339 public messages were combat-domain messages, with long combat runs of 100+ messages before returning to narrative.
- Repeated public phrasing was concentrated in combat outcomes and fallback character actions: `A dreadful encounter` appeared 69 times, `WAGDIE horror` appeared 134 times, and `I strike at the nearest threat before it can press its advantage.` appeared 22 times in the reviewed transcript.
- Location-room tick retry behavior already exists in `lib/eliza/locationRooms/service.ts`: `processClaimedTickUnsafe()` routes the tick, while `processClaimedTick()` catches thrown errors and marks ticks failed/dead with retry scheduling. Generation failures should use that path instead of returning accepted fallback content.
- Combat gameplay turns append public setup/action/roll/outcome messages through `DefaultGameplayCoordinator.processTurn`. Key persistence and append seams are in `lib/eliza/locationRooms/gameplay/coordinator.ts:551-639`, `:653-726`, `:818-864`, and `:885-983`.
- Combat GM outcome generation already follows the target policy: `generateOutcomeNarration()` throws `GameMasterGameplayOutcomeGenerationError` after transport failure or failed repair, and the coordinator persists `outcomeGenerationFailure` before rethrowing (`lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:1015-1140`; `lib/eliza/locationRooms/gameplay/coordinator.ts:885-922`).
- A static combat fallback helper still exists but appears unused: `buildFallbackOutcomeNarration` in `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:896-964`. It should be removed to prevent reintroduction of the exact generic phrase family visible in older transcripts.
- Scene-check GM outcomes still have an active static fallback: `buildFallbackGameMasterSceneCheckOutcome` creates deterministic public narration and `fallbackUsed = true` metadata after repair failure (`lib/eliza/locationRooms/gameMasterGenerator.ts:1480-1641`; repair/fallback path at `:2211-2236`).
- GM beat generation also has a fallback beat path via `buildFallbackGameMasterBeat` / `generateBeat()` repair-failure behavior (`lib/eliza/locationRooms/gameMasterGenerator.ts:452-900`). If it can produce public GM narration or drive public instructions, it conflicts with the no-fallback policy.
- Official character turn generation accepts non-JSON prose as usable public content/action when structured output is required. `normalizeOfficialLocationRoomTurnResponse` treats parse failure as `content` and fallback `declaredAction` (`lib/eliza/locationRooms/officialTurnGenerator.ts:227-255`), and the narrative coordinator can store/use that action (`lib/eliza/locationRooms/narrativeCoordinator.ts:943-1002`, `:1039-1069`, `:1147-1176`).
- Generic scene-check inference can convert weak declared action text into scene-check behavior through keyword fallbacks (`lib/eliza/locationRooms/narrativeCoordinator.ts:626-723`, `:726`). This remains useful only if it is fed by valid structured agent action, not synthesized fallback prose.
- Gameplay character action generation still has public fallback action paths after Official transport or semantic repair failure (`lib/eliza/locationRooms/gameplay/actionGenerator.ts`). Those paths are the likely source of repeated generic attacks.
- Gameplay encounter proposal generation catches errors and returns `buildFallbackEncounterProposal`; setup append also has a literal fallback such as `A threat emerges in the room.` (`lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:705-746`; `lib/eliza/locationRooms/gameplay/coordinator.ts:560-582`). This is in scope because encounter setup/title/monster identity becomes public narrative context.
- Combat pacing is controlled by service run synchronization, gameplay rules, and config (`lib/eliza/locationRooms/service.ts:1313-1455`, `:1571-1667`; `lib/eliza/locationRooms/gameplay/rules.ts`; `lib/eliza/config.ts:230-398`). Current/default run and monster budgets allow combat to dominate the transcript.
- Prior plan `docs/plans/combat-narration-quality-2026-05-29.md:23-34` already established strict semantic parse/repair, typed diagnostics, and no static GM fallback as public success. Its tests prove weak GM outcome repair and failed-repair throws in `tests/lib/eliza/location-room-gameplay-generators.test.ts:780-831`.
- Prior plan `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md:22-35` says deterministic fallback must not be published as successful GM narration; `:73-101` defines strict vs recoverable failures and retry semantics.

## Approach
Use one rule across all public-generating seams:

> Hidden repair is allowed. Public fallback success is not.

For every GM beat, scene-check outcome, character action, combat action, encounter setup, and combat outcome:

1. Accept valid model output.
2. If invalid, run one bounded repair attempt where the code already has enough context to repair safely.
3. If repair fails or transport fails, throw a typed generation error with safe diagnostics.
4. Let existing tick retry/dead-letter behavior handle the failure.
5. Do not append public fallback narration/action.

This avoids a broad scheduler/routing rewrite. The service already owns retry lifecycle; the implementation should make each generator/coordinator participate correctly.

### Generation diagnostics contract
Standardize diagnostics around these statuses:

- `accepted` — initial model output passed validation.
- `repaired` — initial output failed, hidden repair succeeded.
- `repair_failed` — repair or transport failed; caller must throw/retry, not publish.

Each public-generating path should capture safe metadata only: error category, transport stage, response length, response flags, repair attempted, and repaired status. Raw model text should not be persisted.

### Strict narrative generation
- GM beat repair failure should throw `GameMasterBeatGenerationError` instead of returning `buildFallbackGameMasterBeat()`.
- Scene-check outcome repair failure should throw `GameMasterSceneCheckOutcomeGenerationError` instead of returning `buildFallbackGameMasterSceneCheckOutcome()`.
- Narrative coordinator should keep its current failure behavior: persist diagnostics, avoid appending the failed public message, and rethrow so the tick retry pipeline runs.

### Strict Official character turns
- Structured narrative character turns should require JSON with valid `publicSpeech` and `declaredAction`.
- Non-JSON prose should not become public `content` or a synthesized `declaredAction` when structured output was requested.
- Add one hidden repair attempt in the Official turn generator.
- After failed repair, throw `OfficialLocationRoomTurnGenerationError`; treat the whole tick as failed rather than trying to partially continue from an already appended GM beat.
- If a GM beat was already appended before the Official character failure, retry should reuse the durable GM beat/public message IDs and regenerate only the missing character/scene-check portion. The whole tick is failed for scheduling/accounting, not for deleting already-public messages.
- Preserve plain prose behavior only for contexts that explicitly request unstructured speech.
- Invalid optional `sceneCheckProposal` should remain non-fatal when `publicSpeech` and `declaredAction` are valid; preserve `sceneCheckProposalError` for diagnostics and do not infer a backend scene check from that invalid proposal.

### Scene-check inference policy
Keep backend-inferred scene checks enabled, but rename and constrain them:

- New reason: `backend_inferred`.
- Preserve `backend_fallback` only for legacy persisted metadata compatibility.
- Allow inference only when the declared action came from valid structured model output.
- Do not infer checks from coordinator-synthesized action summaries or malformed/non-JSON agent output.

### Strict gameplay action generation
- Production gameplay action parsing should be strict. The implementation may keep `parseGameplayActionResponseStrict()`, make the existing normalizer strict, add a strict mode, or rename legacy tolerant behavior, as long as production public append paths cannot accept tolerant fallback actions.
- Initial semantic failure may get one repair attempt.
- Transport failure or repair failure should throw `GameplayActionGenerationError`.
- The gameplay coordinator should persist `actionGenerationFailure` diagnostics and rethrow before appending `character_action` or `roll_card`.
- Remove or quarantine tolerant helpers such as raw-response/action-error fallback builders so production public append paths cannot call them.

### Strict encounter setup and identity
Encounter proposal/setup is public narrative, so it must also be model-sourced or fail retryably.

- `generateEncounterProposal()` should validate model output, repair once, then throw `GameMasterGameplayEncounterProposalGenerationError` on failure.
- Production should not return `buildFallbackEncounterProposal()` after generation failure.
- If proposal generation fails before an encounter exists, persist safe diagnostics on gameplay room state metadata rather than forcing an early nullable gameplay turn. Use a stable metadata key such as `encounterProposalGenerationFailure` containing status, repair/transport diagnostics, trigger source, and encounter seed summary; clear or supersede it after a later successful proposal.
- New/active setup append should require validated `publicSetupNarration` or a non-generic model-sourced public summary.
- Existing persisted encounters that lack `publicSetupNarration` may use a non-generic stored `publicSummary`; if the stored summary is missing or generic, throw retryably instead of appending literal fallback copy.
- Remove literal setup fallback strings such as `A threat emerges in the room.` from public append paths.
- Reject generic identity phrases such as `A dreadful encounter`, `WAGDIE horror`, `A threat gathers`, `A threat emerges`, and similar default monster names.

### Combat pacing
Fix combat length separately from fallback removal:

- Gameplay runs should honor `maxEncounterRounds`; they should not bypass the round cap with `Number.MAX_SAFE_INTEGER`.
- Proposed defaults for ordinary fights, with env overrides preserved:
  - `ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS`: default `6` instead of `12`.
  - `ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS`: default `20` instead of `100`.
  - `ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_MONSTER_COUNT`: default `3` instead of `6`.
  - `ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_TOTAL_MONSTER_HP`: default `36` instead of `180`.
- Keep mechanics refactoring out of this pass unless tests show the above does not materially reduce combat transcript dominance.

### Prompt quality pass
After strict failure behavior is in place, improve prompts without relying on fallback prose:

- Encounter proposal prompt: require concrete title, monster identity, setup narration, and seed/location anchors.
- Gameplay action prompt: explicitly avoid repeating recent openings and require target/room-specific tactical language.
- Repair prompts: include compact failure categories and the strict JSON contract; avoid accepting merely plausible prose.

## Work Items

### Item 1 — Standardize no-fallback generation diagnostics
**Goal:** Establish reusable diagnostics and typed-error surfaces for strict public generation failures.

**Done when:**
- Official character turns, gameplay character actions, and gameplay encounter proposals have typed generation errors with safe diagnostics.
- Diagnostics distinguish `accepted`, `repaired`, and `repair_failed`.
- Existing combat GM outcome diagnostics remain compatible.
- No raw model output is persisted in failure metadata.

**Key files:**
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Remove accepted GM beat and scene-check outcome fallbacks
**Goal:** Ensure narrative GM beat and scene-check GM outcome repair failures throw retryable errors instead of publishing deterministic public GM text.

**Done when:**
- `generateBeat()` repair failure throws `GameMasterBeatGenerationError`.
- `generateSceneCheckOutcome()` repair failure throws `GameMasterSceneCheckOutcomeGenerationError`.
- Coordinator failure handling persists diagnostics and appends no failed public GM message.
- Static scene-check fallback builders are deleted or unreachable from production.
- Tests that previously expected `fallbackUsed` are updated to expect thrown typed failures and non-append behavior.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Make structured Official character turns strict
**Goal:** Stop malformed/non-JSON structured character turns from becoming public character actions or declared actions.

**Done when:**
- Structured Official turn generation requires valid JSON with non-empty `publicSpeech` and valid `declaredAction`.
- One hidden repair attempt is used for malformed structured output.
- Failed repair throws `OfficialLocationRoomTurnGenerationError`.
- Public character messages are not appended after structured turn failure.
- Plain prose remains valid only for contexts that explicitly request unstructured speech.
- Result metadata includes whether `declaredAction` came from structured model output.

**Key files:**
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Items 1 and the narrative coordinator retry/idempotency handling in this item.

**Size:** Large.

### Item 4 — Constrain backend-inferred scene checks
**Goal:** Keep useful backend inference without letting fallback-derived or synthesized actions trigger scene checks.

**Done when:**
- New scene-check reason `backend_inferred` exists for new inferred checks.
- Legacy `backend_fallback` remains readable where persisted metadata may contain it.
- Inference runs only for declared actions sourced from valid structured model output.
- Inference does not run for coordinator-synthesized action summaries, invalid proposals, or malformed structured output.
- Tests cover allowed and disallowed inference cases.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/sceneChecks/types.ts`
- `lib/eliza/locationRooms/sceneChecks/rules.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Item 3.

**Size:** Medium.

### Item 5 — Remove gameplay character action public fallbacks
**Goal:** Prevent Official gameplay action failures from publishing generic attack/action copy.

**Done when:**
- Gameplay action generation accepts only strict structured action output or repaired strict output.
- Official transport failure, character-resolution failure, initial/repair collection failure, and semantic repair failure throw `GameplayActionGenerationError`.
- Coordinator persists `actionGenerationFailure` diagnostics and rethrows before appending `character_action` or `roll_card`.
- Tolerant fallback helpers are deleted or confined to tests/non-production paths.
- Tests verify no public gameplay action/roll card is appended after action generation failure.

**Key files:**
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** Item 1.

**Size:** Large.

### Item 6 — Require model-sourced encounter setup and identity
**Goal:** Remove public fallback encounter setup/title/monster identity and prevent generic encounter names from seeding the transcript.

**Done when:**
- Encounter proposal generation validates required public identity fields and repairs once.
- Failed proposal/repair throws `GameMasterGameplayEncounterProposalGenerationError`.
- Production no longer returns `buildFallbackEncounterProposal()` after model failure.
- Setup append requires validated setup narration or non-generic model-sourced summary.
- Literal setup fallback strings are removed from public append paths.
- Generic names/phrases are rejected by validation.
- Tests cover proposal failure, setup non-append, and valid identity acceptance.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** Item 1, plus the gameplay-state metadata decision described in the Approach.

**Size:** Large.

### Item 7 — Apply combat pacing caps and safer defaults
**Goal:** Reduce transcript-dominating combat loops while preserving env override flexibility.

**Done when:**
- Gameplay runs honor `elizaConfig.locationRooms.gameplay.maxEncounterRounds`.
- Default combat budgets are lowered: 6 max rounds, 20 target completed turns, 3 max monsters, 36 max total monster HP.
- Existing env variables still override defaults.
- Tests cover max-round behavior during active gameplay runs and config default expectations if applicable.

**Key files:**
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/config.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** None, but should land after strict action/outcome tests are stable.

**Size:** Medium.

### Item 8 — Prompt quality pass for variety and specificity
**Goal:** Improve model output quality after strict failure behavior is in place, without adding fallback prose.

**Done when:**
- Encounter proposal prompt requires concrete setup, monster identity, and location/seed anchors.
- Gameplay action prompt discourages repeated openings and requires target/room-specific tactical language.
- Repair prompts use failure categories and strict JSON contracts.
- Tests or fixture assertions cover rejection/repair of generic encounter identity and repeated/weak outputs where feasible.

**Key files:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts`

**Dependencies:** Items 2, 5, 6.

**Size:** Medium.

## Final Cleanup Checklist
- Production search finds no public append path calling fallback builders for GM beat, scene-check outcome, gameplay action, encounter proposal, or gameplay outcome.
- Unused fallback helpers are deleted, including the unused combat GM outcome fallback helper if no callers remain.
- Tests or lightweight assertions verify failed generation does not append public fallback content.
- Any retained legacy normalizer/helper is explicitly named as legacy/test-only and not used by production generation paths.

## Decisions
- Structured character turn repair failure should fail the whole tick for scheduling/accounting, but durable retry should reuse any already-appended GM beat/public message IDs and regenerate only the missing character/scene-check portion.
- Backend-inferred scene checks stay enabled, but only from valid structured model actions. Fallback-derived or synthesized action summaries must not drive scene checks.
- Encounter proposal failures before encounter creation should persist safe diagnostics on gameplay room state metadata.

## Open Questions
- Are the proposed combat pacing defaults (`6`, `20`, `3`, `36`) product-approved for production defaults, or should they be dev-validated first and shipped as env overrides before changing code defaults?

## References
- `docs/plans/combat-narration-quality-2026-05-29.md`
- `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md`
- `docs/investigations/crows-den-missing-mobs-2026-05-27.md`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/config.ts`
