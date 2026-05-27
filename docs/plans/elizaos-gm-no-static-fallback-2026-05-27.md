# ElizaOS GM No Static Fallback: Plan

## Goal
Make location-room Game Master narration come from the configured Official ElizaOS Game Master agent, not deterministic static fallback text. Static fallback should no longer be accepted as normal public `gm_beat` or `gm_outcome` output; model/transport/contract failures should fail loudly with safe diagnostics, while recoverable private metadata failures should preserve model-authored public prose.

## Background
- Manual/admin room ticks enter through `app/api/eliza/location-rooms/[locationId]/tick/route.ts:50` and call `LocationRoomService.requestTickAndProcess(...)` at `route.ts:64-69`.
- Location-room readiness is gated in `lib/eliza/locationRooms/service.ts:487-531`: rooms need `ELIZA_LOCATION_ROOMS_ENABLED` and `ELIZAOS_BASE_URL`; narrative/gameplay additionally require official integration and a resolvable GM agent.
- Runtime GM resolution happens through `gameMasterAgentService.resolveRuntimeGameMasterAgentId()` in `lib/eliza/gameMasterAgent/service.ts:279-303`; bootstrap/adoption/creation live in `service.ts:379-457`.
- ElizaOS registers `wagdieGameMasterCharacter` in `services/elizaos/src/server.ts:25-38`; the GM character metadata key lives in `services/elizaos/src/characters/wagdie-game-master-character.ts:75-83`.
- Narrative processing resolves the GM id at `lib/eliza/locationRooms/narrativeCoordinator.ts:686`, creates/reuses a beat at `narrativeCoordinator.ts:708-718`, invokes `generateBeat(...)` at `narrativeCoordinator.ts:731-740`, stores output at `narrativeCoordinator.ts:756-763`, and appends public GM messages at `narrativeCoordinator.ts:781-802`.
- `OfficialGameMasterBeatGenerator` uses Official ElizaOS sessions in `lib/eliza/locationRooms/gameMasterGenerator.ts:1612-1770`; scene-check outcomes use the same pattern at `gameMasterGenerator.ts:1779-1823`.
- Official transport is wrapped by `lib/eliza/official/messaging.ts:52-159`, covering agent start, session creation, message send, and SSE collection.
- Beat normalization parses a large JSON contract in `normalizeGameMasterBeatResponse()` at `lib/eliza/locationRooms/gameMasterGenerator.ts:693`; progression validation is centralized in `validateGameMasterBeatProgressionContract()` at `gameMasterGenerator.ts:454`.
- Failure categories come from `categorizeBeatResponseError()` at `lib/eliza/locationRooms/gameMasterGenerator.ts:1513`: `empty_response`, `missing_json_object`, `invalid_json`, `speaker_constraint`, `token_constraint`, `progression_contract`, `missing_required_field`, `validation_error`.
- Static public fallback currently comes from `buildFallbackGameMasterBeat()` at `lib/eliza/locationRooms/gameMasterGenerator.ts:584` and is selected after certain repair failures at `gameMasterGenerator.ts:1752`.
- Scene-check static fallback comes from `buildFallbackGameMasterSceneCheckOutcome()` at `lib/eliza/locationRooms/gameMasterGenerator.ts:1435`, is used by generator catch handling at `gameMasterGenerator.ts:1818`, and is also used by coordinator fallback logic at `lib/eliza/locationRooms/narrativeCoordinator.ts:1148`.
- `fallbackUsed` is preserved through `toGameMasterBeatMetadata()` at `lib/eliza/locationRooms/narrativeCoordinator.ts:180` and `storeBeatGameMasterOutput()` at `lib/eliza/locationRooms/narrativeRepository.ts:258`.
- Public append decisions live in `shouldAppendGameMasterMessage()` at `lib/eliza/locationRooms/narrativeCoordinator.ts:462`; public `gm_beat` append happens at `narrativeCoordinator.ts:787`; public `gm_outcome` append happens at `narrativeCoordinator.ts:1213`.
- Prior work established important constraints: `docs/plans/crows-den-progression-fix-2026-05-24.md`, `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`, `docs/plans/gm-narrative-optimization-2026-05-26.md`, and `docs/investigations/crows-den-missing-mobs-2026-05-27.md`. The plan must preserve explicit `start_combat` handoff semantics.

## Approach
Adopt a clear product rule: **deterministic static fallback must not be published as successful Game Master narration in any environment.** If the Official ElizaOS GM agent cannot produce a valid/repaired output, the tick should fail or retry with safe diagnostics; it should not append static prose that looks like real GM narration.

This does not mean every malformed optional field should fail the tick. The implementation should split validation into:

1. **Core model-authored public contract** — fields that prove the GM agent actually produced usable narration and turn direction.
2. **Recoverable private enrichment** — metadata such as `adventurePatch`, optional escalation details, and optional scene-check request data that the backend can synthesize safely from the model-authored prose.

Core failures should throw and be visible in health diagnostics. Recoverable private failures should preserve AI public text, synthesize minimal backend-owned metadata, and record recovery diagnostics.

### Product policy
- Public `gm_beat` and `gm_outcome` messages must only come from accepted or repaired Official ElizaOS GM output.
- `buildFallbackGameMasterBeat()` and `buildFallbackGameMasterSceneCheckOutcome()` may remain only for legacy tests or private harness scaffolding, not normal production public output.
- Existing stored fallback messages remain readable, but health diagnostics should label them as legacy static fallback occurrences.
- The implementation should avoid storing raw prompts or raw model responses in persisted diagnostics.

### Core vs recoverable validation
For normal GM beats, core fields should remain strict:
- `speakerInstruction`
- `stateSummary`
- `currentObjective` and at least one `openThreads` entry outside aftermath
- required `publicNarration` when progression context requires it
- selected speaker/token safety
- concrete public narration requirements
- combat handoff invariants

For scene-check outcomes, core fields should remain strict:
- `publicNarration`
- `stateSummary`
- `currentObjective`
- non-empty `openThreads`
- safe, concrete, tier-appropriate consequence narration
- duplicate-opening protection after repair

Recovery should be implemented as a narrow acceptance matrix, not broad leniency:

| Field / condition | Strict or recoverable | Recovery source | Diagnostic key |
| --- | --- | --- | --- |
| Empty response / no JSON / invalid JSON after repair | Strict failure | None | `empty_response`, `missing_json_object`, `invalid_json` |
| Missing required public narration | Strict failure | None | `missing_required_field` |
| Unsafe or non-concrete public narration | Strict failure | None | `progression_contract` or `validation_error` |
| Invalid selected speaker/token ids | Strict failure | None | `speaker_constraint` / `token_constraint` |
| Invalid `start_combat` handoff | Strict failure | None | `progression_contract` |
| Missing/weak beat `adventurePatch` with valid model-authored public narration | Recoverable | model-authored `publicNarration`, `speakerInstruction`, `currentObjective` | `adventure_patch_defaulted_from_model_prose` |
| Invalid optional beat `sceneCheckRequest` without combat handoff | Recoverable | drop to `null` | `scene_check_request_dropped_invalid_optional` |
| Missing/weak scene-check outcome `adventurePatch` | Recoverable | model-authored `publicNarration`, roll tier, scene-check id | `scene_check_adventure_patch_defaulted_from_model_prose` |
| Invalid/missing scene-check escalation | Recoverable | backend normalization to `none` or safe catalog-backed danger | `scene_check_escalation_normalized` |

Recovered outputs should keep `status: accepted` or `status: repaired` based on whether the initial or repair response supplied the model-authored public prose, plus a non-empty `recoveries` array. Do not introduce a third successful status unless implementation proves it materially simplifies diagnostics.

### Scene-check behavior
Scene-check outcomes should follow the same no-static-public-fallback policy as GM beats. If outcome generation fails after repair, coordinator should mark the beat failed with safe diagnostics and rethrow so the tick enters retry/dead handling.

Retry/resume contract:
- If `character_action` and `roll_card` were already appended, keep them as public facts for that beat.
- On retry of the same beat, reuse stored `sceneCheck.characterAction`, `sceneCheck.resolution`, and `sceneCheck.publicRolls`; do not re-generate the character action or reroll the scene check.
- Retry only the missing GM outcome step, then append `gm_outcome` with the existing `scene_check:${beat.id}:gm_outcome` dedupe key.
- The tick/beat should remain failed or retryable until the GM outcome is generated or retry policy marks it dead; do not mark the beat completed with only `character_action` + `roll_card`.

Scene-check outcomes must continue to preserve combat handoff boundaries:
- may set danger/combat-ready metadata and encounter seeds
- must not directly set `requestedGameplayAction`
- must not directly set `lastCombatTriggerBeatId`

### Diagnostics
Expose enough health information to answer: “Did the GM agent run, did model output pass, was public text AI-authored, and why did it fail?” Use existing JSON metadata if recent-window diagnostics remain derived from beat/message metadata; introduce a migration only if implementation chooses to persist aggregate counters separately.

Transport-stage errors should be wrapped before parse/repair diagnostics whenever possible:
- `start_agent`
- `create_session`
- `send_message`
- `collect_stream`
- `create_repair_session`
- `repair_send_message`
- `repair_collect_stream`

Coordinator should be able to persist these safe diagnostics even when failure happens before a model response exists. Health should use a non-mutating GM record validation helper if live validation is added; it should not rely on a mutating resolver just to render diagnostics.

Add recent-window diagnostics for:
- accepted count
- repaired count
- repair-failed count
- recovered-structured count
- legacy static fallback count
- latest failure category
- latest transport stage
- latest recoveries

Health/admin surfaces should distinguish:
- missing config
- stale/missing official GM record
- `startAgent` failure
- session creation failure
- message/send/stream failure
- JSON/contract failure
- recoverable private metadata failure

### Dev smoke policy
Smoke checks must avoid stale transcript confusion. Each smoke run should capture a baseline latest sequence/tick id, trigger a specific tick, and inspect only messages for that tick or messages with sequence greater than the baseline.

## Work Items

### Item 1 — Lock down no-public-static-fallback policy
**Goal:** Change the generator/coordinator policy so deterministic fallback is never returned or appended as normal public GM output.

**Done when:**
- `generateBeat()` throws `GameMasterBeatGenerationError` after unrecovered initial+repair failure instead of returning `buildFallbackGameMasterBeat()`.
- Scene-check outcome generation no longer returns `buildFallbackGameMasterSceneCheckOutcome()` after catch-all failures.
- Coordinator no longer imports or calls scene-check fallback when `generateSceneCheckOutcome` is absent or throws.
- No new code path writes `fallbackUsed: true` for current successful GM output.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:584`, `gameMasterGenerator.ts:1435`, `gameMasterGenerator.ts:1752`, `gameMasterGenerator.ts:1818`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:1148`, `narrativeCoordinator.ts:1213`

**Dependencies:** None.

**Size:** Large.

### Item 2 — Preserve AI prose while recovering private metadata
**Goal:** Split validation so valid model-authored public narration is not discarded because optional/private metadata is malformed.

**Done when:**
- Beat normalization distinguishes strict core fields from recoverable private fields.
- Weak/missing `adventurePatch` can be synthesized from model-authored public narration, speaker instruction, current objective, or roll facts.
- Optional invalid scene-check requests can be dropped with recovery diagnostics when no combat handoff is requested.
- Scene-check outcome recovery can synthesize private `adventurePatch` from public narration, roll tier, and scene-check id.
- Recovery diagnostics are persisted without raw prompts or raw model text.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:693`, `gameMasterGenerator.ts:454`, `gameMasterGenerator.ts:1271`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts:258`

**Dependencies:** Item 1 policy should be defined first.

**Size:** Large.

### Item 3 — Add scene-check outcome repair and fail-loud handling
**Goal:** Bring scene-check outcomes up to the same repair/failure standard as normal GM beats.

**Done when:**
- `generateSceneCheckOutcome()` performs one repair attempt on parse/validation failure.
- A dedicated `GameMasterSceneCheckOutcomeGenerationError` or equivalent diagnostic error is thrown after unrecovered failure.
- Coordinator marks the beat failed with safe scene-check outcome diagnostics and rethrows.
- Retry dedupe behavior preserves `character_action` and `roll_card` without duplicating them.
- Scene-check combat-ready escalation tests continue proving no direct `start_combat` trigger is set.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:1779-1823`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:1025-1275`
- `lib/eliza/locationRooms/narrativeRepository.ts:258-326`

**Dependencies:** Items 1 and 2.

**Size:** Large.

### Item 4 — Verify Official ElizaOS GM agent readiness and transport stages
**Goal:** Make failures in GM agent setup or transport explicit instead of collapsing into generic generation errors.

**Done when:**
- Generator diagnostics categorize transport stage failures: `start_agent`, `create_session`, `send_message`, `collect_stream`, `create_repair_session`, `repair_send_message`, `repair_collect_stream`.
- Beat and scene-check generation failures before parse/repair still become typed diagnostic errors that coordinator can persist safely.
- Health diagnostics expose resolved GM source/id and whether the official record validated.
- If health performs live official-record validation, it uses a non-mutating helper rather than a self-healing/mutating resolver.
- Admin health can distinguish config/agent readiness failures from model contract failures.
- No raw API response bodies, prompts, or model outputs are exposed through diagnostics.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:1612-1823`
- `lib/eliza/gameMasterAgent/service.ts:279-303`, `service.ts:379-457`
- `lib/eliza/locationRooms/adminDiagnostics.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/health/route.ts`
- `lib/eliza/official/messaging.ts:52-159`

**Dependencies:** Items 1 and 3 for new diagnostics shapes.

**Size:** Medium.

### Item 5 — Add fallback/model-failure health metrics
**Goal:** Make fallback/model failures observable in admin/dev health so static fallback cannot silently dominate the transcript again.

**Done when:**
- Health diagnostics include recent accepted/repaired/repair-failed/recovered counts.
- Health diagnostics count legacy fallback occurrences from recent beats/outcomes where `fallbackUsed === true`.
- Latest failure category, latest transport stage, and latest recovery list are visible.
- Admin narrative inspection includes safe per-beat generation status fields.
- Recommended action remains `inspect_gm_repair_failure` when the latest generation status is repair failed.

**Key files:**
- `lib/eliza/locationRooms/adminDiagnostics.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** Items 1-4.

**Size:** Medium.

### Item 6 — Update tests and smoke docs
**Goal:** Replace fallback-acceptance tests with fail-loud/recovery tests and update Crow’s Den smoke procedure to inspect only fresh output.

**Done when:**
- Generator tests expect unrecovered repair failure to throw and include diagnostics, not return static fallback.
- Generator tests cover model-authored public prose preserved when private metadata is recovered.
- Scene-check tests cover repair success, repair failure, metadata recovery, and no public static fallback.
- Coordinator tests cover scene-check outcome failure: no `gm_outcome`, beat failed, tick retries/dead-handles.
- Existing explicit combat handoff tests still pass.
- `docs/operations/crows-den-location-room-smoke.md` documents baseline/delta transcript inspection and no-static-fallback checks.

**Key files:**
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-narrative-harness.ts`
- `docs/operations/crows-den-location-room-smoke.md`
- `package.json`

**Dependencies:** Items 1-5.

**Size:** Medium.

## Validation Plan
Run targeted local tests first. AGENTS.md specifies Bun for this repo:

```bash
bun run test tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand
bun run test tests/lib/eliza/location-room-narrative-coordinator.test.ts --runInBand
```

Then run the relevant smoke/harness flow if the package script exists in the branch; otherwise use the documented Crow's Den smoke procedure:

```bash
bun run narrative:harness:test
```

Manual dev smoke should:
1. capture baseline latest sequence and latest tick id;
2. trigger a new Crow’s Den tick;
3. inspect only the triggered tick or sequence delta;
4. assert no new public message came from `fallbackUsed` metadata or known deterministic fallback phrases;
5. if generation fails, assert no static public GM message was appended and health shows repair/transport diagnostics.

## Open Questions
None blocking. Recommended policy is intentionally strict: no deterministic public fallback in any environment. If production resilience is later required, it should degrade privately with diagnostics rather than publishing static GM narration.

## References
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/adminDiagnostics.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- `lib/eliza/official/messaging.ts`
- `services/elizaos/src/server.ts`
- `services/elizaos/src/characters/wagdie-game-master-character.ts`
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/investigations/crows-den-missing-mobs-2026-05-27.md`
