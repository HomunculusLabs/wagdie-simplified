# Automated 100-Turn Gameplay: Plan

## Goal
Make initiated location-room gameplay runs automatically advance toward 100 completed gameplay turns without requiring repeated manual tick clicks, while preserving the existing Game Master, location-room tick queue, participant eligibility, scheduled worker, retry behavior, and one-gameplay-turn-per-tick idempotency model.

## Background
- Location-room gameplay is tick-queue based, not a standalone run loop. Manual initiation enters `POST /api/eliza/location-rooms/[locationId]/tick` and calls `LocationRoomService.requestTickAndProcess()` (`app/api/eliza/location-rooms/[locationId]/tick/route.ts:21`, `lib/eliza/locationRooms/service.ts:376`).
- Scheduled automation enters `/api/sync/eliza-location-rooms`, authorized by `SYNC_SECRET_KEY`, and calls `LocationRoomService.runScheduledWorker()` (`app/api/sync/eliza-location-rooms/route.ts:36`, `lib/eliza/locationRooms/service.ts:589`). Vercel cron already invokes this worker every 15 minutes (`vercel.json:8`).
- `runScheduledWorker()` currently enqueues due scheduled ticks and processes due ticks with `maxTicksPerRun` (`lib/eliza/locationRooms/service.ts:589`). `ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN` is worker throughput, defaulting to 5 (`lib/eliza/config.ts:234`), not a gameplay target.
- One completed gameplay turn maps to one completed location-room tick. Tick processing flows through `processClaimedTickUnsafe()` into `gameplayCoordinator.processTurn()` (`lib/eliza/locationRooms/service.ts:637`, `lib/eliza/locationRooms/service.ts:676`, `lib/eliza/locationRooms/gameplay/coordinator.ts:306`).
- Gameplay turn idempotency is tick-scoped: `GameplayTurn.tickId` is unique, `findTurnByTickId()` runs before work, and completed turns short-circuit (`lib/eliza/locationRooms/gameplay/types.ts:282`, `lib/eliza/locationRooms/gameplay/coordinator.ts:322`, `supabase/migrations/20260522020000_create_location_room_gameplay.sql:70`).
- Gameplay state and encounters track status, active encounter id, round number, and terminal states, but there is no explicit initiated gameplay-run object (`lib/eliza/locationRooms/gameplay/types.ts:203`, `lib/eliza/locationRooms/gameplay/types.ts:218`).
- Current gameplay max encounter rounds are capped at 50 by config parsing (`ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS`, `lib/eliza/config.ts:270`). Mechanics can abandon encounters past the configured max (`lib/eliza/locationRooms/gameplay/rules.ts:718`), which conflicts with a 100-turn target.
- Existing room queue concurrency is already guarded by one active pending/processing tick per room (`idx_eliza_location_room_ticks_one_active`, `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:107`) plus claim locks and retry/backoff in `lib/eliza/locationRooms/repository.ts`.
- Prior art: `docs/plans/elizaos-agent-location-rooms-2026-05-11.md` designed conservative scheduled ticking; `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md` confirmed inactivity when the sync route was not invoked and that manual ticks only process one tick. Game Master and gameplay work landed around `docs/plans/game-master-narrative-agent-2026-05-22.md`, `docs/plans/admin-game-master-agent-settings-2026-05-22.md`, `docs/plans/gameplay-earnings-and-stats-2026-05-22.md`, and commit `db42cabc`.

## Approach
Use the existing tick queue as the unit of work. Add a persisted gameplay-run target and teach the scheduled worker to enqueue continuation ticks for active runs until the run reaches its target or a hard terminal condition stops it. Do not run 100 turns inline in the initiating HTTP request.

Chosen semantics:
- A gameplay run targets **100 completed gameplay turns** by default.
- A run may span multiple encounters.
- Ordinary encounter `victory` does not stop the run; the next continuation tick can create a new encounter through existing coordinator behavior.
- Hard stop conditions are target reached, insufficient eligible participants, no living/playable participants, disabled room ticks, invalid gameplay config, dead run tick, or terminal failure states such as defeat/fled/abandoned with no playable continuation.

This keeps the current Game Master/action generation path intact (`actionGenerator.ts`, `gameMasterGameplayGenerator.ts`, `gameplay/coordinator.ts`, `gameplay/rules.ts`) and uses the worker budget as the safety valve for ElizaOS cost/rate pressure.

## Design Details

### Gameplay run persistence
Add `eliza_location_room_gameplay_runs` with one active run per room and a nullable `gameplay_run_id` on `eliza_location_room_ticks`. The run table should track `target_completed_turns`, `completed_turns`, start actor/wallet/token, last tick, last advancement, completed time, stop reason, last error, metadata, and timestamps. Keep the table service-role only, matching existing gameplay persistence patterns.

The tick association is required so progress can be counted from durable tick/turn state rather than timestamps or room metadata. Failed retryable ticks remain part of the same run and block new continuation ticks until retried or marked dead.

Progress should count **completed gameplay turns**, not merely completed room ticks. The repository helper may use `gameplay_run_id` on ticks for scope, but the authoritative count must join or correlate to `eliza_location_room_gameplay_turns` where the corresponding `tick_id` has `status = 'completed'`. This avoids double counting idempotent reprocessing and avoids incrementing progress for a completed room tick that skipped or failed to produce a completed gameplay turn.

### Repository and type model
Add gameplay-run types to `lib/eliza/locationRooms/gameplay/types.ts` and repository methods to `lib/eliza/locationRooms/gameplay/repository.ts` for active/recent run lookup, create-or-reuse active run, progress updates, completion, and stop/failure. Add `gameplayRunId` to `LocationRoomTick` and `enqueueTick()` in `lib/eliza/locationRooms/types.ts` and `lib/eliza/locationRooms/repository.ts`.

Required room tick helpers:
- attach an existing safe tick to a run when a manual initiation dedupes against an unassociated due tick,
- count completed gameplay turns for a run by correlating run ticks to completed gameplay turns,
- find an open room tick (`pending`, `processing`, or retryable `failed`) so the worker does not enqueue past existing work.

### Configuration
Add automation config under `elizaConfig.locationRooms.gameplay`:
- `automation.targetCompletedTurns`, default `100`, env `ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS`.
- `automation.maxActiveRunsPerWorker`, default small and bounded, env `ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_MAX_ACTIVE_RUNS_PER_WORKER`.

Raise the `ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS` parser cap from 50 to at least 200. For run-associated turns, use an effective max rounds value of at least the active run target so a 100-turn run is not abandoned solely by the old encounter-round cap.

### Initiation path
Manual gameplay initiation should create or reuse an active run only for gameplay-enabled locations. `validateAndEnqueueManualTick()` should preserve existing canonical location resolution, auth, room tick-enabled checks, participant eligibility checks, and admin/owner logic. The initial tick should be associated with the run when it is created or reused.

Extend the public tick response additively with a safe `gameplayRun` summary: id, status, target, completed count, remaining count, and whether the run was reused. Keep existing `200` vs `202` behavior.

### Worker drain loop
`runScheduledWorker()` should remain globally bounded by `maxTicksPerRun`, but should add an active-run continuation pass. Processing budget is consumed only by claimed/processed ticks, not by enqueue attempts. `maxActiveRunsPerWorker` is a scan/fairness cap: the worker should inspect at most that many active runs per invocation, ordered by `last_advanced_at NULLS FIRST, updated_at ASC` so stale or never-advanced runs do not starve.

Recommended loop:
1. Enqueue normal scheduled due ticks once.
2. Process due ticks up to remaining processing budget using existing `claimDueTicks()` and `processClaimedTick()`.
3. Update/complete/stop any associated gameplay runs from the tick result.
4. Inspect active runs up to the scan cap and enqueue continuation ticks for runs below target that have no open tick, still pass eligibility/config checks, and are not already represented in this worker pass.
5. Repeat until the processing budget is exhausted or no progress/enqueue occurred.

Normal scheduled due ticks get first chance at the worker budget each run. Active gameplay runs then fill remaining capacity. This preserves existing room automation and prevents a long 100-turn run from starving unrelated scheduled rooms.

Do not call the gameplay coordinator directly from the worker. The worker should only create/claim/process room ticks.

### Run lifecycle mapping
A run tick result should map to run state explicitly:
- `failed`: keep the run `active`; do not enqueue a new run tick while the failed tick is retryable/open.
- `dead`: mark the run `failed` with `stop_reason = 'tick_dead'` and preserve a safe/truncated error.
- `skipped` with `insufficient_participants` or `insufficient_living_gameplay_participants`: mark the run `stopped` with the matching reason.
- gameplay outcome `defeat`, `fled`, or `abandoned`: mark the run `stopped` unless the implementation verifies a playable continuation path. Ordinary `victory` should not stop the run; current coordinator behavior creates a new encounter when no active encounter exists (`lib/eliza/locationRooms/gameplay/coordinator.ts:342`).
- `completed`: recount completed gameplay turns for the run from persistence, update denormalized progress, and mark `completed` with `stop_reason = 'target_reached'` when progress reaches the target.

### Progress visibility
Extend admin gameplay inspection to include `activeRun` and `recentRuns` using safe fields only. Do not expose full `startedByWallet` unless the existing admin route already exposes equivalent wallet data; omit or truncate it. Public room reads may optionally include a small non-sensitive run summary under `gameplay.run`, but admin visibility is the required first step.

## Work Items

### Item 1 — Add gameplay run schema
**Goal:** Persist active/completed/stopped gameplay runs and associate location-room ticks with run ids.

**Done when:**
- `eliza_location_room_gameplay_runs` exists with service-role-only access.
- `eliza_location_room_ticks.gameplay_run_id` exists and is indexed.
- A partial unique index enforces one active run per room.
- Migration applies cleanly after current room/gameplay migrations.

**Key files:**
- `supabase/migrations/<timestamp>_create_location_room_gameplay_runs.sql`
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql`
- `supabase/migrations/20260522020000_create_location_room_gameplay.sql`

**Dependencies:** Existing room/tick/gameplay tables.

**Size:** Medium.

### Item 2 — Add run types and repository support
**Goal:** Expose typed run CRUD/progress operations and tick/run association to services.

**Done when:**
- Gameplay run row mapping exists.
- Active/recent run queries exist.
- Create-or-reuse active run handles unique-index races.
- Run progress, completion, stop, and failure methods sanitize stored errors.
- Tick repository maps and writes `gameplayRunId`.
- Helpers exist to attach a tick, count completed gameplay turns scoped by run ticks, and find open room ticks.

**Key files:**
- `lib/eliza/locationRooms/gameplay/types.ts`
- `lib/eliza/locationRooms/gameplay/repository.ts`
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/repository.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Add automation config
**Goal:** Separate the 100-turn target from worker throughput and remove the current max-round conflict.

**Done when:**
- Config exposes `gameplay.automation.targetCompletedTurns`, default `100`.
- Config exposes active-run worker scan tuning; processing throughput remains `ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN`.
- Max encounter round cap supports at least 100, preferably 200.
- `.env.example`, Docker Compose passthrough, and config tests are updated.

**Key files:**
- `lib/eliza/config.ts`
- `.env.example`
- `docker-compose.yml`
- `tests/unit/eliza-config.test.ts`

**Dependencies:** None.

**Size:** Small.

### Item 4 — Start or reuse a run from manual gameplay initiation
**Goal:** Make admin/owner gameplay initiation create a bounded background run while preserving current authorization and first-tick behavior.

**Done when:**
- Manual tick requests for gameplay-enabled rooms create or reuse an active run.
- Initial manual tick is associated with `gameplayRunId` when safe.
- Non-gameplay rooms behave as before.
- Response includes additive safe `gameplayRun` summary.
- Owner/admin authorization behavior is unchanged.

**Key files:**
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/types.ts`
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts`
- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`

**Dependencies:** Items 1–3.

**Size:** Medium.

### Item 5 — Pass run context into gameplay turn processing
**Goal:** Ensure run-associated turns do not abandon solely because the old encounter-round cap is below the run target.

**Done when:**
- `processClaimedTickUnsafe()` loads run context for `tick.gameplayRunId`.
- `LocationRoomGameplayCoordinator.processTurn()` accepts optional run target context.
- Effective max encounter rounds is at least the active run target.
- Existing generation, action, mechanics, death, and reward paths are otherwise unchanged.

**Key files:**
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/types.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`

**Dependencies:** Items 2 for run context; Item 3 for the effective max-round behavior.

**Size:** Small.

### Item 6 — Add active-run worker enqueue/drain loop
**Goal:** Let the scheduled sync worker automatically advance active runs toward their target within `maxTicksPerRun`.

**Done when:**
- `runScheduledWorker()` remains budgeted by `maxTicksPerRun`.
- Active runs enqueue continuation ticks only when below target, no open room tick exists, eligibility/config checks pass, and worker budget remains.
- Failed retryable ticks block new continuation ticks.
- Completed run ticks update progress from durable persistence.
- Target reached marks the run completed.
- Hard terminal, skipped, or dead states stop/fail the run with machine-readable reasons.
- Sync response includes additive run counters.

**Key files:**
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/types.ts`
- `app/api/sync/eliza-location-rooms/route.ts`
- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`

**Dependencies:** Items 2–5.

**Size:** Large.

### Item 7 — Add admin run progress inspection
**Goal:** Expose active/recent run status through existing admin gameplay diagnostics.

**Done when:**
- Admin gameplay inspection includes active run and recent runs.
- Serializer exposes safe run progress fields: id, status, target, completed, remaining, started actor/token, last tick, last advanced time, stop reason, last error, created/updated times.
- Route remains admin-only and no-store.
- Tests cover active, stopped, completed, and failed run summaries.

**Key files:**
- `lib/eliza/locationRooms/gameplay/adminService.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/gameplay/route.ts`
- Admin gameplay shared serializer imported from `../../../gameplay/shared`
- `tests/api/eliza/location-room-routes.test.ts`

**Dependencies:** Item 2. Item 6 is only needed for live worker progress to appear, not for the inspection schema/serializer.

**Size:** Medium.

### Item 8 — Add lifecycle regression tests
**Goal:** Lock in run semantics and prevent regressions in idempotency, retry behavior, and eligibility.

**Done when:**
- Tests prove one manual initiation starts one active run.
- Repeated initiation reuses the active run.
- One completed run tick increments progress once.
- Completed turn idempotency prevents double counting.
- Worker drains multiple ticks only within configured budget.
- Failed ticks retry instead of being skipped over.
- Dead ticks fail the run.
- Insufficient participants stops the run.
- Target reached completes the run.

**Key files:**
- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`
- `tests/lib/eliza/location-room-gameplay-generators.test.ts` only if prompt inputs change

**Dependencies:** Items 4–7.

**Size:** Medium.

## Migration and Rollout Notes
- Apply the schema migration before deploying runtime code that selects `eliza_location_room_ticks.gameplay_run_id` or reads `eliza_location_room_gameplay_runs`.
- Old code can tolerate the additive table/column, so rollback should leave the schema in place rather than dropping run history.
- Ship admin run inspection before or alongside the worker drain loop if possible; it gives operators a way to verify active run progress and stopped reasons during rollout.

## Open Questions
- Cadence is intentionally not fixed here. The run target is 100; actual wall-clock speed remains governed by cron frequency and `ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN`.

## References
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts`
- `app/api/sync/eliza-location-rooms/route.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/repository.ts`
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/membership.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/repository.ts`
- `lib/eliza/locationRooms/gameplay/types.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/config.ts`
- `vercel.json`
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql`
- `supabase/migrations/20260522020000_create_location_room_gameplay.sql`
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md`
- `docs/plans/game-master-narrative-agent-2026-05-22.md`
- `docs/plans/admin-game-master-agent-settings-2026-05-22.md`
- `docs/plans/gameplay-earnings-and-stats-2026-05-22.md`
