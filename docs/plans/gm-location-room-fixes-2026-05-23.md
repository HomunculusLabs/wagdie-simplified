# GM Location Room Fixes: Plan

## Goal
Fix location-room inactivity by ensuring The Crow's Den can process ticks through the worker path, uses the configured game-master narrative mode in dev, exposes actionable admin diagnostics, and canonicalizes the duplicate Crows Den location to the chain-backed `locations.id='11'`.

## Background
- Investigation report `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md:3-4` found canonical Crows Den (`locations.id='11'`) has eligible staked Eliza characters and a due pending tick, but no worker is invoking `/api/sync/eliza-location-rooms`.
- Dev runtime evidence in `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md:58-64` found six staked `wagdie_characters` at `location_id='11'`, an enabled `eliza_location_rooms` row, one `scheduled` tick stuck `pending` since `2026-05-11`, and no public messages.
- Manual tick route queues only: `app/api/eliza/location-rooms/[locationId]/tick/route.ts:21-37` calls `locationRoomService.requestTick(...)` and returns `202 queued`; it does not process the tick inline.
- Manual enqueue seam: `lib/eliza/locationRooms/service.ts:366-432` validates feature/config, room, participants, owner/admin authorization, cooldown, then calls `repository.enqueueTick(...)` with `triggerType: 'owner' | 'admin'`.
- Worker entrypoint: `app/api/sync/eliza-location-rooms/route.ts:9-40` authorizes with `SYNC_SECRET_KEY` and delegates to `locationRoomService.runScheduledWorker()`.
- Worker processing flow: `lib/eliza/locationRooms/service.ts:435-502` ensures eligible rooms, enqueues due scheduled ticks, then calls `processDueTicks`; `lib/eliza/locationRooms/repository.ts:329-385` claims due `pending`/`failed` ticks and stale `processing` locks.
- Visible messages only happen after a claimed tick enters processing: `lib/eliza/locationRooms/service.ts:543-747` branches through gameplay, narrative, or plain official generation and appends public messages.
- Cron config currently omits the location-room worker: `vercel.json:1-9` schedules only `/api/sync/ownership?secret=${SYNC_SECRET_KEY}`.
- Operations docs already describe location-room sync: `docs/operations/data-sync-and-assets.md:79-90` documents the guarded route, accepted methods, `SYNC_SECRET_KEY`, disabled/config errors, and `runScheduledWorker()` delegation.
- Narrative mode is env-gated and defaults off: `lib/eliza/config.ts:247-263`; prior investigation `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md:67-74` confirms the GM is configured but GM-authored beats are not expected until `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true`.
- Runtime GM setting should be admin-first with env fallback: `docs/plans/admin-game-master-agent-settings-2026-05-22.md:29-39`; GM admin UI states admin setting wins over env fallback in `components/admin/game-master-agent/GameMasterAgentStatusPanel.tsx:66-69`.
- Admin narrative inspection exists but is narrow: `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts:53-123` loads location, room, state, and recent beats; errors are sanitized.
- Gameplay inspection has a parallel admin shape: `app/api/admin/eliza/location-rooms/[locationId]/gameplay/route.ts:26-39`, `lib/eliza/locationRooms/gameplay/adminService.ts:119-150`, and `app/api/admin/eliza/gameplay/shared.ts:118-145` expose state, encounter, turns, claims, and counts.
- Participant eligibility uses exact location IDs from `CHARACTERS_TABLE`: `lib/eliza/locationRooms/membership.ts:96-129` filters by `location_id` and counts eligible locations. `lib/db/tables.ts:9-16` defaults `CHARACTERS_TABLE` to `wagdie_characters`.
- Duplicate location risk: investigation found `locations.id='11'`, name `The Crow's Den`, `chain_location_id='11'`, and `locations.id='crows_den'`, name `Crow's Den`, no chain id. The user chose to canonicalize to `11` rather than diagnostics-only.
- User choices from upfront checkpoint: manual triggers should process immediately, narrative mode should be enabled in dev, duplicate Crows Den should canonicalize to `11`, and admin diagnostics should be added.

## Approach
Use the existing architecture rather than replacing it. The queue, claim locks, generation branches, GM resolver, and admin auth patterns are already present; the failure is that the processor is not scheduled and manual triggers do not process the queued tick. The implementation should:

1. Schedule the existing worker so due ticks are processed automatically.
2. Add a bounded, room-scoped immediate-processing path for owner/admin manual triggers.
3. Enable GM narrative mode in dev while preserving production-safe code defaults.
4. Add an admin diagnostics view/API that explains room health, pending ticks, config gates, GM readiness, duplicate-location hazards, and next actions.
5. Canonicalize the duplicate Crows Den rows so the map, staking sync, room APIs, and admin diagnostics converge on `locations.id='11'`.

Keep `LocationRoomService.processClaimedTick()` as the single path that executes gameplay, narrative, or plain official generation. Do not duplicate generation logic in routes. Manual processing should claim one target room tick using the same lock semantics as the scheduled worker, then call the existing claimed-tick processor.

## Work Items

### Item 1 — Schedule the location-room worker
**Goal:** Ensure due location-room ticks are processed automatically without manual operator intervention.

**Done when:**
- `vercel.json` includes a cron for `/api/sync/eliza-location-rooms?secret=${SYNC_SECRET_KEY}`.
- The planned cadence is `*/15 * * * *` unless deployment limits require a slower cadence; document any deviation.
- The sync route remains protected by `SYNC_SECRET_KEY` and supports the existing bearer/query-secret contract.
- `app/api/sync/eliza-location-rooms/route.ts` declares Node runtime if needed for consistency with server-side Eliza dependencies.
- `docs/operations/data-sync-and-assets.md` documents cadence, secret behavior, expected result counters, and manual invocation shape.

**Key files:**
- `vercel.json`
- `app/api/sync/eliza-location-rooms/route.ts`
- `docs/operations/data-sync-and-assets.md`

**Dependencies:** Existing `SYNC_SECRET_KEY`; deployed scheduler support. Use the existing Vercel query-string secret pattern unless deployment constraints force a different scheduler.

**Size:** Small.

### Item 2 — Add immediate manual/admin tick processing
**Goal:** Make owner/admin manual room triggers enqueue and then process the target room’s active tick immediately, with bounded and actionable feedback.

**Done when:**
- Manual POST still validates auth, owner/admin actor, participant count, feature flags, room enabled state, cooldown, and narrative/gameplay readiness exactly as today.
- After enqueue or dedupe, the service attempts to claim/process one eligible active tick for that same room only.
- Manual processing never processes unrelated rooms and does not call global `runScheduledWorker()`.
- Tick selection mirrors worker eligibility unless there is a documented reason to diverge: prefer the newly enqueued tick; otherwise choose the oldest due `pending`/retryable `failed` active tick for the room; report `already_processing` for a non-stale processing lock; do not process not-due ticks.
- The response remains compatible with existing polling and adds an actionable `processing` summary. The exact DTO names are implementation-owned, but the outcome must distinguish terminal processing, another worker owning the tick, no claimable tick, and retry/failure states.
- Cron/manual races are safe because the implementation reuses DB claim locks.
- Tests cover completed processing, deduped pending tick processing, already-processing race, failed/dead processing, and existing validation/error mapping.

**Key files:**
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/repository.ts`
- `lib/eliza/locationRooms/types.ts`
- `hooks/map/useLocationRoom.ts`
- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`

**Dependencies:** Existing `processClaimedTick()` path; new repository methods for active-tick lookup and specific tick claim.

**Size:** Medium.

**Implementation shape:**
- Keep existing `requestTick()` unchanged for compatibility.
- Add a new service method for enqueue-and-process behavior; the implementation agent may choose exact method/type names.
- Extract shared private validation/enqueue logic from `requestTick()` so both methods use the same checks.
- Add repository seams for room-scoped active tick lookup and specific tick claim, keeping locking behavior aligned with `claimDueTicks()`.
- If enqueue creates a tick, target that tick. If enqueue dedupes, fetch the room’s oldest claimable active tick and attempt to claim it.
- If claim succeeds, call existing `processClaimedTick(claimedTick, now)`. If claim fails because another worker owns it, return an actionable non-attempted processing state.
- Route status can be `200` when a processing attempt reaches a terminal worker result and `202` when the tick remains queued or owned by another worker.

### Item 3 — Enable GM narrative mode for dev
**Goal:** Make configured GM narrative beats active in the intended dev runtime while preserving production-safe defaults in code.

**Done when:**
- `lib/eliza/config.ts` continues to default `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED` to `false` when unset.
- `.env.example` documents location-room narrative env vars and GM fallback behavior.
- Docker Compose/dev deployment passes dev defaults for `ELIZA_LOCATION_ROOMS_ENABLED=true` and `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true`, plus optional passthrough for `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID`.
- Non-Compose local development remains explicit: `.env.example` documents the vars, but `bun run dev` only enables narrative when the developer sets `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true`.
- Docs state dev narrative mode still requires reachable `ELIZAOS_BASE_URL`, valid ElizaOS auth, and either an active admin GM setting or env fallback GM id.
- Config tests cover narrative default and override.

**Key files:**
- `.env.example`
- `docker-compose.yml`
- `lib/eliza/config.ts`
- `tests/unit/eliza-config.test.ts`
- `docs/operations/data-sync-and-assets.md`

**Dependencies:** Official ElizaOS service must be reachable; GM admin setting or env fallback must exist.

**Size:** Small.

### Item 4 — Add admin room health diagnostics
**Goal:** Expose an admin-readable diagnostics page/API that explains why a room is idle, pending, misconfigured, duplicated, or failing.

**Done when:**
- Admins can open `/admin/location-rooms`, defaulting to location `11`, and query any location id.
- A new admin health endpoint returns no-store diagnostics for a location.
- Diagnostics include:
  - location id/name/chain id/active state and duplicate/canonical hints;
  - config gates: location rooms enabled, official ElizaOS configured, narrative enabled, gameplay enabled for this location, tick interval, max ticks per run;
  - GM readiness: required or not, ready or not, source `database | env | missing`, and safe error;
  - participant count, minimum required count, and sample token ids/names;
  - room fields: `tickEnabled`, `lastTickAt`, `nextTickAt`, `tickCount`, `lastError`;
  - active/recent ticks: status, attempts, trigger type, selected token, next attempt, completion, and last error;
  - public transcript stats: message count, latest sequence, latest created time;
  - narrative state/beat status and gameplay state/encounter status when applicable;
  - recommended next action such as `run_location_room_worker`, `configure_game_master`, `use_canonical_location_11`, `stake_or_sync_participants`, or `healthy`.
- Stored errors are sanitized consistently with existing admin narrative/gameplay routes.
- Tests cover no-room, pending due tick, failed tick, GM missing, duplicate `crows_den`, and healthy states.

**Key files:**
- New `lib/eliza/locationRooms/adminDiagnostics.ts`
- New `app/api/admin/eliza/location-rooms/[locationId]/health/route.ts`
- New `app/admin/location-rooms/page.tsx`
- New `components/admin/location-rooms/LocationRoomDiagnosticsContainer.tsx`
- `components/admin/AdminNav.tsx`
- `lib/eliza/locationRooms/repository.ts`
- `lib/eliza/locationRooms/membership.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/locationRooms/gameplay/adminService.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- `tests/api/eliza/location-room-routes.test.ts`

**Dependencies:** Existing admin auth and GM resolver. Reuse Item 2 repository methods for tick lookup where practical, but keep diagnostics-specific list/stat queries in Item 4 so the immediate-processing work does not grow into a broad diagnostics refactor.

**Size:** Large.

**Scope boundary:** Build the health API and minimal admin page in this pass because the user requested admin diagnostics. Keep the UI focused on the original failure modes: canonical location, participants, config/GM readiness, active/recent ticks, latest public message state, and recommended next action. Rich narrative/gameplay drilldowns can link to existing inspection endpoints rather than duplicating every field.

### Item 5 — Canonicalize duplicate Crows Den
**Goal:** Make chain-backed `locations.id='11'` the canonical Crows Den location and prevent `crows_den` from attracting UI/admin/staking references.

**Done when:**
- A migration ensures canonical row `locations.id='11'` has `chain_location_id='11'` and remains active.
- Duplicate `locations.id='crows_den'` is deactivated or otherwise hidden from active map/admin selection, with metadata pointing to canonical id `11`.
- Any `wagdie_characters.location_id='crows_den'` rows are updated to `location_id='11'`.
- The migration checks known FK-like text references before deactivation: `wagdie_characters.location_id`, `eliza_location_rooms.location_id`, `eliza_location_room_ticks.location_id`, `eliza_location_room_messages.location_id`, narrative state/beat `location_id`, and gameplay state/encounter/turn/claim tables if present.
- Duplicate operational room state is handled safely: empty duplicate room rows may be deleted; non-empty duplicate room state causes the migration to fail loudly rather than silently losing transcripts/ticks.
- Staking sync continues mapping chain location `11` only to DB location `11`.
- Admin diagnostics flags `crows_den` as non-canonical and points admins to `11`.

**Key files:**
- New `supabase/migrations/20260523000000_canonicalize_crows_den_location.sql`
- `supabase/migrations/20260506000000_add_locations_chain_location_id.sql`
- `lib/services/sync/staking-state-sync.ts`
- `scripts/indexer/staking-event-handler.ts`
- Location/map API files if implementation search finds active-location filtering gaps.

**Dependencies:** Inspect live references before destructive cleanup. This inspection is a required implementation step, not an unresolved product question. Preserve the existing unique partial index on non-null `locations.chain_location_id`.

**Size:** Medium.

### Item 6 — Verification coverage and smoke checklist
**Goal:** Prove the original inactivity path is fixed and guard against recurrence.

**Done when:**
- Tests cover sync route auth and worker result, manual immediate processing success/failure/race states, narrative config default/override, diagnostics payloads, and migration assumptions.
- Operations docs include a smoke checklist:
  1. Confirm canonical Crows Den is `locations.id='11'`.
  2. Confirm at least two eligible participants at `location_id='11'`.
  3. Confirm GM state is available in admin.
  4. Trigger manual room activity as admin.
  5. Confirm the active tick leaves `pending`.
  6. Confirm a public message appears.
  7. Confirm a narrative beat exists when narrative mode is enabled.
  8. Confirm the scheduled cron processes later due ticks.

**Key files:**
- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`
- `tests/unit/eliza-config.test.ts`
- New diagnostics tests
- `docs/operations/data-sync-and-assets.md`

**Dependencies:** Final shapes from Items 1–5.

**Size:** Medium.

## Implementation Order
1. Add repository active-tick lookup/claim methods and service tests.
2. Add `requestTickAndProcess()` in `LocationRoomService` while keeping `requestTick()` unchanged.
3. Update manual tick route to use immediate processing and update route/frontend tests.
4. Add worker cron, route runtime declaration, and operations docs.
5. Enable dev narrative env/docs/config tests without changing code defaults.
6. Add admin diagnostics service and API that works before and after canonicalization, including a `crows_den -> 11` recommendation.
7. Add minimal `/admin/location-rooms` diagnostics UI and nav item.
8. Add conservative Crows Den canonicalization migration after validating duplicate references in dev.
9. Run the smoke checklist for `location_id='11'`.

## Risks and Constraints
- Immediate manual processing may take longer when narrative mode performs both GM and character generation. Process only one target room tick and rely on stale-lock recovery if the request is interrupted.
- Query-string cron secrets match current `vercel.json` precedent, but bearer auth is safer for manual/operator calls. Document both clearly.
- Do not silently merge non-empty duplicate room transcripts/ticks from `crows_den`; fail the migration with a clear message if unexpected operational state exists.
- Diagnostics are admin-only but still must avoid raw stack traces and private model/provider metadata.
- Enabling dev narrative mode will surface missing GM configuration as a real `503`; diagnostics should make that understandable.

## Orchestration Progress
- [x] Core processing/config slice implemented and verified with focused tests.
- [x] Admin room health diagnostics API/UI implemented and verified with focused tests.
- [x] Crows Den canonicalization migration implemented and verified with focused tests.
- [x] Final verification and smoke checklist coverage.

## Final Verification Notes
- 2026-05-23 focused suite passed: `bun run test -- tests/api/eliza/location-room-service.test.ts tests/api/eliza/location-room-routes.test.ts tests/lib/eliza/location-room-admin-diagnostics.test.ts tests/components/admin/location-room-diagnostics-container.test.tsx tests/unit/crows-den-canonicalization-migration.test.ts tests/unit/eliza-config.test.ts tests/lib/eliza/location-room-gameplay-rules.test.ts` (`80 passed`).
- `bunx tsc --noEmit` was run. A scoped gameplay rules type mismatch was fixed; remaining failures are outside this location-room work in character metadata, concord searing-map routes, lore/modal stories, low-poly video state typing, and nullable Supabase repository helpers.
- `bun run lint` was run. It still fails on unrelated existing lint errors in gateway/official stream/assets/chain-id files; location-room files only report existing `no-explicit-any` warnings in repository/membership helpers.
- Repo build was not run after typecheck because `tsc --noEmit` still fails on unrelated blockers.
- Operations smoke checklist coverage was added to `docs/operations/data-sync-and-assets.md`. Live smoke was not executed in this pass to respect the boundary against deploying or mutating remote/dev DB state.

## Open Questions
None blocking. The plan uses the upfront choices: immediate manual processing, dev narrative enabled, Crows Den canonicalized to `11`, and admin diagnostics included. Implementation must still record the live duplicate-reference inspection result before applying the Crows Den migration; if non-empty duplicate operational state exists, stop that migration and document a manual merge path.

## References
- `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md`
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/admin-game-master-agent-settings-2026-05-22.md`
- `docs/operations/data-sync-and-assets.md`
- `vercel.json`
