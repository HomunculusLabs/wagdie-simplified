# Location Room Refactor: Plan

## Goal

Plan a low-risk refactor of the location-room narrative/gameplay generation stack, `LocationRoomService` orchestration, and location-room test harnesses so the current behavior remains stable while the largest files become easier to change safely.

The plan covers targets 1–3 from the refactor scan: generation modules, service orchestration seams, and scenario-first test fixture/harness consolidation.

## Background

### Up-front decisions

- Preserve the current interface + default implementation pattern as the primary public seam. Refactors should extract internals behind existing generator/coordinator/service contracts before changing callers.
- Extract a shared generation-contract layer for parse/validate/repair behavior used by narrative and gameplay GM generation.
- Prioritize scenario harnesses first for test consolidation, then layer smaller typed builders where they make harnesses and focused unit tests simpler.

### Generation/coordinator seams

- Narrative GM generation already has a narrow interface: `GameMasterBeatGenerator` exposes `generateBeat()` and optional `generateSceneCheckOutcome()` in `lib/eliza/locationRooms/gameMasterGenerator.ts:2000`; `OfficialGameMasterBeatGenerator` injects `OfficialElizaMessagingClient` at `lib/eliza/locationRooms/gameMasterGenerator.ts:2005-2012`.
- Gameplay GM generation mirrors that shape: `GameMasterGameplayGenerator` exposes `generateEncounterProposal()` and `generateOutcomeNarration()` in `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:186`.
- `DefaultLocationRoomNarrativeCoordinator` injects repositories, `GameMasterBeatGenerator`, turn generator, GM resolver, and RNG at `lib/eliza/locationRooms/narrativeCoordinator.ts:859-867`. Its `processTurn()` creates/reuses a beat, calls `gameMasterGenerator.generateBeat()`, validates progression, stores GM output, and only then appends public messages (`lib/eliza/locationRooms/narrativeCoordinator.ts:873-947`).
- `DefaultLocationRoomGameplayCoordinator` similarly injects `GameMasterGameplayGenerator` and owns persistence after generation. It calls encounter proposal generation around `lib/eliza/locationRooms/gameplay/coordinator.ts:579`, creates the active encounter around `lib/eliza/locationRooms/gameplay/coordinator.ts:622`, calls outcome narration around `lib/eliza/locationRooms/gameplay/coordinator.ts:1037`, appends GM outcome messages around `lib/eliza/locationRooms/gameplay/coordinator.ts:1073`, and stores the completed turn around `lib/eliza/locationRooms/gameplay/coordinator.ts:1126`.
- Both generator files combine prompt building, Official ElizaOS ephemeral messaging, JSON extraction, normalization, validation, repair prompts, diagnostics, fallback behavior, and error types. The current files are large (`gameMasterGenerator.ts` ~2330 lines; `gameplay/gameMasterGameplayGenerator.ts` ~1486 lines), but the coordinators already isolate persistence from generation.
- Official messaging is already abstracted through `OfficialElizaMessagingClient` in `lib/eliza/official/messaging.ts:186`; ephemeral session send/collect/delete behavior lives in `sendAndCollectOfficialEphemeralSessionMessage()` around `lib/eliza/official/messaging.ts:410`.

### Service orchestration seams

- `LocationRoomService` is the central runtime orchestration layer and singleton (`lib/eliza/locationRooms/service.ts:534`, `lib/eliza/locationRooms/service.ts:1884`). Constructor injection at `lib/eliza/locationRooms/service.ts:535-543` is the main test/refactor seam: room repository, membership repository, turn generator, narrative coordinator, GM resolver, gameplay coordinator, gameplay repository, and narrative repository.
- Public room reads are handled by `getPublicRoom()` (`lib/eliza/locationRooms/service.ts:546-630`), called by `app/api/eliza/location-rooms/[locationId]/route.ts:15-20`. It mixes canonical location resolution, room creation, participant lookup, transcript pagination, gameplay state lookup, narrative state lookup, and public DTO assembly.
- Manual tick enqueue/process is handled by `requestTickAndProcess()` (`lib/eliza/locationRooms/service.ts:631-694`), called by `app/api/eliza/location-rooms/[locationId]/tick/route.ts:64-69`. `validateAndEnqueueManualTick()` starts at `lib/eliza/locationRooms/service.ts:696` and owns feature/config checks, location existence, room enabled checks, participant count, ownership/cooldown checks, and turn intent handling.
- Scheduled processing is exposed through `runScheduledWorker()` (`lib/eliza/locationRooms/service.ts:876-943`), called by `app/api/sync/eliza-location-rooms/route.ts:41-47`.
- `processClaimedTick()` is the safe retry/dead wrapper (`lib/eliza/locationRooms/service.ts:1455-1510`); `processClaimedTickUnsafe()` is the main routing engine (`lib/eliza/locationRooms/service.ts:1512-1880`). It loads room/participants/messages, checks gameplay config, routes to gameplay/combat or narrative/plain generation, and updates tick/room state.
- Prior plans explicitly treat `LocationRoomService.processClaimedTick()` as the single execution path for gameplay/narrative/plain generation and warn against duplicating manual route generation logic (`docs/plans/gm-location-room-fixes-2026-05-23.md:21-33`).

### Test/harness seams

- The largest location-room tests use local per-file builders and mock factories rather than a common fixture layer: `tests/api/eliza/location-room-service.test.ts` is ~3210 lines, `tests/lib/eliza/location-room-narrative-coordinator.test.ts` is ~2917 lines, and `tests/lib/eliza/location-room-game-master-generator.test.ts` is ~2045 lines.
- Duplicate builders recur across tests: `room()`, `tick()`, `participant()`, `message()`, `narrativeState()`, `makeRepository()`, `makeNarrativeRepository()`, and `makeGameplayRepository()` appear in service, coordinator, diagnostics, gameplay, and generator tests.
- `tests/lib/eliza/location-room-narrative-harness.ts` is the strongest reusable seam. It defines scenario seeds, in-memory repositories, scripted GM/turn generators, config wrapping, and service-driven tick execution. `runNarrativeHarnessScenario()` composes in-memory room/narrative repositories, membership, scripted generators, `DefaultLocationRoomNarrativeCoordinator`, and `LocationRoomService` at `tests/lib/eliza/location-room-narrative-harness.ts:1095-1130`, then drives manual story ticks through the service loop.
- The harness in-memory room repository starts at `tests/lib/eliza/location-room-narrative-harness.ts:432` and models room lookup, due ticks, pending ticks, message append, and tick lifecycle. This is closer to the real orchestration seam than one-off jest mocks.
- Existing test prior art uses the harness for deterministic quality gates: `docs/plans/gm-narrative-optimization-2026-05-26.md:38-44` references deterministic 10×30 scenarios and Jest gates; `docs/plans/gm-narrative-optimization-2026-05-26.md:58-66` says narrative work should strengthen existing seams rather than start as a broad architecture rewrite.

### Prior art and constraints

- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md:3-43` established the original model: one persistent room per `locations.id`, local WAGDIE transcript/state as canonical, and no durable Official group-room session dependency.
- `docs/plans/game-master-narrative-agent-2026-05-22.md:82-102` settled narrative identity constraints: DB `locations.id` is narrative identity, continuity lives outside transcript rows, `game_master` is a first-class public author kind, and narrative mode skips with fewer than two eligible participants.
- `docs/plans/game-master-narrative-agent-2026-05-22.md:121-153` planned strict JSON GM contracts and validation before public writes; `docs/plans/game-master-narrative-agent-2026-05-22.md:179-196` planned coordinator idempotency: at most one public GM message + one public agent message per tick, and failures should use tick retry/dead behavior rather than append public errors.
- `docs/reviews/game-master-narrative-agent-plan-critique-2026-05-22.md:3-10` flagged retry/idempotency and GM identity/resolution as historically risky seams. This refactor should avoid weakening DB uniqueness, resolver injection, beat provenance, or tick failure behavior.
- Recent history is dense in this area: baseline location rooms (`809af6bf`), gameplay automation (`6a167a2a`), story-first encounters (`2a1c9520`), scene checks (`8403ac81`), adventure memory (`53094b86`), quality evaluation (`9d6f774c`), and narrative reliability changes through May 30, 2026. The plan should assume active product behavior is load-bearing.

## Approach

Refactor in dependency-safe order: **tests/harness first**, then **shared generation-contract extraction**, then **narrative/gameplay GM module splits**, then **`LocationRoomService` internal orchestration splits**, and finally **test cleanup and facade documentation**. Items 5–7 can land as one implementation phase if the shared generation contract stays small and tests remain green; they are separated here to clarify boundaries, not to require three PRs.

Preserve the current public seams throughout: `GameMasterBeatGenerator`, `GameMasterGameplayGenerator`, `Official*Generator` default implementations, singleton exports, `LocationRoomService` constructor/public methods, and API route calls. Move code behind those facades before changing consumers. Coordinators remain the persistence/idempotency owners; `LocationRoomService.processClaimedTick()` remains the single manual/scheduled execution path until it is extracted behind a dedicated internal tick processor.

## Work Items

### Item 1 — Freeze behavioral baseline and checklist

**Goal:** Establish a known-good safety baseline before moving code.

**Done when:**
- The plan/task records the baseline command set, and the implementation task records the pass/fail result before production movement. Suggested baseline commands: `bun run test -- tests/api/eliza/location-room-service.test.ts`, `bun run test -- tests/lib/eliza/location-room-narrative-coordinator.test.ts`, `bun run test -- tests/lib/eliza/location-room-gameplay-coordinator.test.ts`, `bun run test -- tests/lib/eliza/location-room-game-master-generator.test.ts`, and `bun run test -- tests/lib/eliza/location-room-narrative-harness.test.ts`.
- The high-risk behavior checklist is explicit: manual tick enqueue/process, already-processing/not-claimable handling, retry/dead tick handling, narrative vs gameplay/combat routing, no duplicate public GM/character messages, scene checks not directly starting combat, and GM identity/provenance preservation.

**Key files:** `tests/api/eliza/location-room-service.test.ts`, `tests/lib/eliza/location-room-narrative-harness.ts`, `tests/lib/eliza/location-room-narrative-coordinator.test.ts`, `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`, `tests/lib/eliza/location-room-game-master-generator.test.ts`.

**Dependencies:** None.

**Size:** S

### Item 2 — Extract reusable narrative harness fixtures behind the current harness facade

**Goal:** Turn `tests/lib/eliza/location-room-narrative-harness.ts` into a facade over reusable scenario fixtures without changing existing harness imports.

**Done when:**
- Existing imports from `location-room-narrative-harness.ts` still work.
- Scenario seeds, in-memory repositories, scripted generators, config helpers, and scoring helpers are moved into focused fixture files.
- No production files change.
- Existing deterministic harness behavior is unchanged.

**Key files:** `tests/lib/eliza/location-room-narrative-harness.ts`; new fixture modules under `tests/lib/eliza/locationRooms/fixtures/` such as `scenarios.ts`, `inMemoryRepositories.ts`, `scriptedGenerators.ts`, `config.ts`, and optionally `narrativeQuality.ts`.

**Dependencies:** Item 1.

**Size:** M

### Item 3 — Add a service scenario harness around real `LocationRoomService`

**Goal:** Create a scenario-first harness for service routing tests before splitting production service code.

**Done when:**
- A helper can construct a real `LocationRoomService` with in-memory room/narrative repositories, static membership, real or scripted `DefaultLocationRoomNarrativeCoordinator`, scripted gameplay coordinator/repository doubles, injectable config wrapper, and deterministic `now`.
- Harness options cover `auto | story | combat` intents, `admin | owner` actors, gameplay enabled/disabled state, active encounter/run presence, combat-ready narrative metadata, scene-check request/proposal metadata, and preexisting open/failed/processing ticks.
- The harness API drives `requestTickAndProcess()` by default, returns the service result plus inspectable snapshots of room/tick/message/narrative/gameplay state, and reserves lower-level service/processor calls for targeted unit tests only.

**Key files:** new `tests/lib/eliza/locationRooms/fixtures/serviceHarness.ts`; extend `tests/lib/eliza/locationRooms/fixtures/inMemoryRepositories.ts`, `scriptedGenerators.ts`, and add `gameplayDoubles.ts` as needed.

**Dependencies:** Item 2.

**Size:** M

### Item 4 — Move critical service-routing tests onto the scenario harness

**Goal:** Lock down routing semantics at scenario level before production service extraction.

**Done when:**
- Scenario-harness coverage exists for: `story` intent always routes narrative and does not consume combat triggers; `auto` intent can promote safe combat-ready metadata; active encounters route to gameplay; active gameplay runs continue through gameplay; narrative scene-check request/proposal metadata stays narrative; admin `combat` intent creates deterministic combat trigger metadata; insufficient participants skip ticks and update cadence; retry/dead behavior marks narrative beats or gameplay turns appropriately.
- Mock-heavy tests remain only where they assert exact repository interaction details not covered by scenarios.

**Key files:** `tests/api/eliza/location-room-service.test.ts`, `tests/lib/eliza/locationRooms/fixtures/serviceHarness.ts`.

**Dependencies:** Item 3.

**Size:** M

### Item 5 — Extract shared generation JSON/text utilities

**Goal:** Remove low-level duplication and cross-coupling before splitting generator files.

**Done when:**
- Shared JSON extraction and Official response text normalization live outside narrative/gameplay modules.
- Gameplay generation no longer depends on narrative generator internals for generic JSON extraction.
- `extractGameMasterJsonObject()` remains exported from `lib/eliza/locationRooms/gameMasterGenerator.ts` as a named compatibility guard while its implementation moves to shared code.
- Existing tests observe equivalent behavior and error messages.

**Key files:** new `lib/eliza/locationRooms/generation/json.ts`; `lib/eliza/locationRooms/gameMasterGenerator.ts`; `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`.

**Dependencies:** Item 1.

**Size:** M

### Item 6 — Extract shared generation diagnostics primitives

**Goal:** Centralize common diagnostic mechanics without changing domain-specific error classes or public diagnostic shapes.

**Done when:**
- Common response flags, raw-response length metadata, repair-attempt metadata, and transport-stage metadata live in shared generation utilities.
- Narrative diagnostics retain their existing shape and names.
- Gameplay diagnostics retain their existing shape and names.
- Coordinator consumers that read generation diagnostics continue to work.

**Key files:** new `lib/eliza/locationRooms/generation/diagnostics.ts`; `lib/eliza/locationRooms/gameMasterGenerator.ts`; `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`; verify `lib/eliza/locationRooms/narrativeCoordinator.ts` and `lib/eliza/locationRooms/gameplay/coordinator.ts`.

**Dependencies:** Item 5.

**Size:** M

### Item 7 — Extract a shared generation repair runner

**Goal:** Unify initial parse → repair prompt → repair parse behavior as a shared generation-contract layer.

**Done when:**
- A generic runner owns the parse/validate/repair control flow while staying transport-agnostic: callers provide initial text, a domain repair-prompt builder, a repair-text collection callback, a parser/validator callback, diagnostic mapping, and typed error construction.
- The runner does not know Official Eliza session metadata, narrative schemas, or gameplay schemas.
- Narrative and gameplay keep their own prompt builders, validators, error classes, diagnostic category mapping, Official Eliza session metadata, and initial transport collection.

**Key files:** new `lib/eliza/locationRooms/generation/repairRunner.ts`; `lib/eliza/locationRooms/gameMasterGenerator.ts`; `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`.

**Dependencies:** Item 6.

**Size:** M

### Item 8 — Split narrative GM generation behind the existing facade

**Goal:** Break up `gameMasterGenerator.ts` while preserving all current imports and exports.

**Done when:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts` becomes a compatibility facade/re-export surface.
- Existing consumers can continue importing from `./gameMasterGenerator`.
- Narrative internals are moved into focused modules for types/interfaces, constants, parse/normalize helpers, validation/progression contracts, fallback beat generation, prompt builders, repair prompts, diagnostics/error helpers, and the Official implementation/singleton. The exact file granularity is implementation-owned; the listed modules below are examples to guide coupling, not mandatory architecture.
- `DefaultLocationRoomNarrativeCoordinator` behavior and preferably imports remain unchanged.

**Key files:** `lib/eliza/locationRooms/gameMasterGenerator.ts`; possible new modules under `lib/eliza/locationRooms/gameMaster/` such as `types.ts`, `constants.ts`, `parsing.ts`, `validation.ts`, `progressionContext.ts`, `fallback.ts`, `prompts.ts`, `repair.ts`, `diagnostics.ts`, and `officialGenerator.ts`.

**Dependencies:** Items 5, 6, 7.

**Size:** L

### Item 9 — Split gameplay GM generation behind the existing facade

**Goal:** Break up `gameplay/gameMasterGameplayGenerator.ts` while preserving all current imports and exports.

**Done when:**
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts` becomes a compatibility facade/re-export surface.
- Existing consumers can continue importing from `./gameMasterGameplayGenerator`.
- Gameplay internals are moved into focused modules for types/interfaces, parse/normalize helpers, encounter proposal validation, outcome narration validation, fallback generation, prompt builders, repair prompts, diagnostics/error helpers, and the Official implementation/singleton. The exact file granularity is implementation-owned; the listed modules below are examples to guide coupling, not mandatory architecture.
- `DefaultLocationRoomGameplayCoordinator` behavior and preferably imports remain unchanged.

**Key files:** `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`; possible new modules under `lib/eliza/locationRooms/gameplay/gameMaster/` such as `types.ts`, `parsing.ts`, `validation.ts`, `fallback.ts`, `prompts.ts`, `repair.ts`, `diagnostics.ts`, and `officialGenerator.ts`.

**Dependencies:** Items 5, 6, 7.

**Size:** L

### Item 10 — Extract `LocationRoomService` errors, identity, and config guards

**Goal:** Move simple support logic out of `service.ts` before extracting orchestration.

**Done when:**
- Service error classes live in a dedicated file and are re-exported from `service.ts`.
- Canonical location alias resolution and room-identity helpers live outside `service.ts` and are reused by both public-room reads and manual tick preparation instead of reimplemented in each collaborator.
- Feature/gameplay config guard functions live outside `service.ts`.
- API routes and tests can keep importing service errors from `lib/eliza/locationRooms/service`.

**Key files:** `lib/eliza/locationRooms/service.ts`; new `lib/eliza/locationRooms/service/errors.ts`, `identity.ts`, and `configGuards.ts`.

**Dependencies:** Item 4.

**Size:** S

### Item 11 — Extract public room projection reader

**Goal:** Move `getPublicRoom()` read/projection logic behind an internal collaborator.

**Done when:**
- A `LocationRoomPublicRoomReader` owns canonical location lookup via the shared identity helper, room ensure, participant reads, public message pagination, message stats reads, gameplay summary reads, narrative/TTRPG summary reads, and `PublicLocationRoomRead` assembly.
- `LocationRoomService.getPublicRoom()` only delegates.
- Response DTO shape and `app/api/eliza/location-rooms/[locationId]/route.ts` behavior are unchanged.

**Key files:** `lib/eliza/locationRooms/service.ts`; new `lib/eliza/locationRooms/service/publicRoomReader.ts`.

**Dependencies:** Item 10.

**Size:** M

### Item 12 — Extract manual tick validation/enqueue service

**Goal:** Move manual tick preparation out of `LocationRoomService` without changing processing flow.

**Done when:**
- A `LocationRoomManualTickService` owns current `validateAndEnqueueManualTick()` behavior: feature/config checks, canonical location lookup via the shared identity helper, room ensure, tick enabled check, participant minimum check, owner wallet authorization, owner cooldown, combat intent authorization, gameplay-enabled check for combat intent, failed-open-tick dedupe behavior, and enqueue result assembly.
- `LocationRoomService.requestTick()` delegates to this collaborator.
- `LocationRoomService.requestTickAndProcess()` uses this collaborator, then still claims/processes through the shared tick processing path.

**Key files:** `lib/eliza/locationRooms/service.ts`; new `lib/eliza/locationRooms/service/manualTickService.ts`.

**Dependencies:** Item 10.

**Size:** M

### Item 13 — Extract claimed tick processor and routing diagnostics

**Goal:** Move the retry/dead wrapper and routing engine out of `LocationRoomService`.

**Done when:**
- A `LocationRoomTickProcessor` owns current `processClaimedTick()`, `processClaimedTickUnsafe()`, route-safe error conversion, retry/dead marking, narrative beat failure marking, gameplay turn failure marking, route selection across gameplay/combat/narrative/plain generation, room update after processed/skipped ticks, and gameplay run synchronization after ticks.
- `LocationRoomService` remains the public facade and composes the processor privately through constructor defaults/options; the processor does not become a new public API route dependency.
- Manual and scheduled flows both delegate to the same `LocationRoomTickProcessor` instance with shared repositories/coordinators/config/clock dependencies, avoiding duplicate service state.
- Route diagnostic logging is moved to a focused helper/module.
- No generation call is added to API routes or manual tick preparation.

**Key files:** `lib/eliza/locationRooms/service.ts`; new `lib/eliza/locationRooms/service/tickProcessor.ts` and `routeDiagnostics.ts`.

**Dependencies:** Items 10, 11, 12.

**Size:** L

### Item 14 — Extract scheduled worker orchestration

**Goal:** Move scheduled sync worker loop out of `LocationRoomService`.

**Done when:**
- A `LocationRoomScheduledWorker` owns current `runScheduledWorker()` behavior: feature/config checks, due room discovery, scheduled tick enqueue/claim loop, max-tick limit handling, active gameplay-run continuation enqueue/attachment, and worker result counters.
- It delegates claimed ticks to `LocationRoomTickProcessor`.
- `LocationRoomService.runScheduledWorker()` only delegates.
- `app/api/sync/eliza-location-rooms/route.ts` behavior is unchanged.

**Key files:** `lib/eliza/locationRooms/service.ts`; new `lib/eliza/locationRooms/service/scheduledWorker.ts`.

**Dependencies:** Item 13.

**Size:** L

### Item 15 — Consolidate duplicated service-test builders and mocks

**Goal:** Replace remaining local test duplication with reusable fixture seams after production structure is stable.

**Done when:**
- Repeated builders in `tests/api/eliza/location-room-service.test.ts` are removed or replaced with shared fixtures for rooms, ticks, participants, messages, narrative state, gameplay state, encounters, and runs.
- Broad mock-heavy routing tests are replaced by scenario-harness tests where possible.
- Remaining mock-heavy tests are limited to exact repository interaction or edge-case assertions.

**Key files:** `tests/api/eliza/location-room-service.test.ts`; new/extended `tests/lib/eliza/locationRooms/fixtures/builders.ts`, `serviceHarness.ts`, and `inMemoryRepositories.ts`.

**Dependencies:** Items 4, 11, 12, 13, 14.

**Size:** M

### Item 16 — Final facade cleanup and documentation update

**Goal:** Ensure the refactor leaves stable public surfaces and clear ownership boundaries.

**Done when:**
- Facade files contain exports and minimal compatibility glue only: `lib/eliza/locationRooms/gameMasterGenerator.ts`, `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`, and `lib/eliza/locationRooms/service.ts`.
- No production caller imports internal split files unless intentionally internal.
- A short module ownership note or README records final ownership and test seams; avoid post-hoc churn in this plan unless the team wants the plan to double as an implementation log.
- Relevant tests pass through the same public service/generator interfaces as before.

**Key files:** `lib/eliza/locationRooms/gameMasterGenerator.ts`, `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`, `lib/eliza/locationRooms/service.ts`, `docs/plans/location-room-refactor-2026-05-30.md`.

**Dependencies:** Items 8, 9, 14, 15.

**Size:** S


## Items 1–4 implementation baseline (2026-05-30)

### Baseline command set and observed results

- `bun run test -- tests/api/eliza/location-room-service.test.ts tests/lib/eliza/location-room-narrative-harness.test.ts` — **PASS** on 2026-05-30 after the harness-foundation changes (80 tests passed).
- `bun run test -- tests/lib/eliza/location-room-narrative-coordinator.test.ts tests/lib/eliza/location-room-gameplay-coordinator.test.ts tests/lib/eliza/location-room-game-master-generator.test.ts` — **PARTIAL/FAIL** on 2026-05-30: `location-room-gameplay-coordinator.test.ts` passed, `location-room-game-master-generator.test.ts` passed, and `location-room-narrative-coordinator.test.ts` failed 3 tests on existing `publicNarration` scene-frame validation expectations.

### High-risk behavior checklist for this slice

- Manual tick enqueue/process remains exercised through `LocationRoomService.requestTickAndProcess()`.
- Already-processing/not-claimable tick handling is supported by the service scenario harness via preexisting tick options.
- Retry/dead tick behavior is covered at scenario level for narrative retry and gameplay-run death.
- Narrative vs gameplay/combat routing is covered for `story`, `auto`, active encounter, active run, and admin `combat` intents.
- Duplicate public GM/character message prevention remains covered by the existing narrative harness and coordinator baselines; this slice keeps existing imports working.
- Scene-check request/proposal metadata stays on the narrative route and does not directly start combat.
- GM identity/provenance remains behind the existing resolver/generator seams; no production service/generator files changed.

## Open Questions

None after the up-front checkpoint. Implementation can still make local tactical choices within these constraints.

## References

- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/service.ts`
- `tests/lib/eliza/location-room-narrative-harness.ts`
- `tests/api/eliza/location-room-service.test.ts`
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/game-master-narrative-agent-2026-05-22.md`
- `docs/plans/gm-location-room-fixes-2026-05-23.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/reviews/game-master-narrative-agent-plan-critique-2026-05-22.md`
