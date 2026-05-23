# Investigation: Crows Den Narrative Inactivity

## Summary
The canonical Crows Den room (`locations.id='11'`) has eligible staked Eliza characters and a due pending location-room tick, but no worker is invoking `/api/sync/eliza-location-rooms` to claim/process that tick into public messages. The GM agent is configured, but dev currently has narrative mode disabled, so GM-authored narrative beats are not expected until `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true` is set.

## Symptoms
- User reports two Eliza characters are staked at The Crows Den.
- The GM agent is configured and visible in admin state.
- No visible narrative ticks/events/dialogue are happening for that location.

## Background / Prior Research
No external research was needed; the issue is explained by in-repo worker wiring plus dev runtime/database state.

## Investigator Findings
<!-- Pair investigator appended structured findings here with file:line refs and evidence. -->

### 2026-05-23 - Pair investigator runtime/code-path trace

#### Executive finding
The most likely root cause is that queued/due location-room ticks are not being processed automatically. The only in-repo worker entrypoint is the guarded sync route `GET|POST /api/sync/eliza-location-rooms`, but `vercel.json` schedules only `/api/sync/ownership` and has no cron for location rooms. Manual room activity also only queues a tick; it does not process it inline. Therefore any Crows Den tick can remain invisible until something invokes the sync worker.

#### Code-path evidence
- Manual tick route calls `locationRoomService.requestTick(...)` and returns `202 queued`; it does not call `processDueTicks()` or `runScheduledWorker()` (`app/api/eliza/location-rooms/[locationId]/tick/route.ts:21-37`).
- The sync route is the worker entrypoint: after `SYNC_SECRET_KEY` auth it calls `locationRoomService.runScheduledWorker()` (`app/api/sync/eliza-location-rooms/route.ts:9-40`).
- `runScheduledWorker()` enqueues due scheduled ticks and then processes due ticks (`lib/eliza/locationRooms/service.ts:484-502`).
- Tick claiming only happens inside `processDueTicks()`, which calls `repository.claimDueTicks(...)` (`lib/eliza/locationRooms/service.ts:470-482`). The repository claims `pending`/`failed` due ticks, plus stale `processing` locks (`lib/eliza/locationRooms/repository.ts:337-398`).
- The visible transcript append happens only after a claimed tick enters `processClaimedTickUnsafe()`: gameplay branch appends public gameplay messages, otherwise narrative/plain generation appends public messages and marks the tick completed (`lib/eliza/locationRooms/service.ts:553-738`, `lib/eliza/locationRooms/narrativeCoordinator.ts:168-239`, `lib/eliza/locationRooms/gameplay/coordinator.ts:440-456`, `lib/eliza/locationRooms/gameplay/coordinator.ts:686-723`).
- No automatic location-room worker schedule was found in repo config. `vercel.json` contains only the ownership cron (`vercel.json:1-9`), and the operations doc describes `/api/sync/eliza-location-rooms` as the route that must be invoked for location-room sync (`docs/operations/data-sync-and-assets.md:79-90`).

#### Runtime evidence available without mutating room state
- Public app API evidence from `GET https://wagdie.runiverse.ai/api/locations` on 2026-05-23 showed two Crows Den-like locations at the same coordinates: `id="crows_den"`, name `"Crow's Den"`, no `chain_location_id`; and `id="11"`, name `"The Crow's Den"`, `chain_location_id="11"`.
- Public app API evidence from `GET https://wagdie.runiverse.ai/api/characters?tab=staked...` on 2026-05-23 returned 314 staked rows total and 6 rows at `location_id="11"` (`1443`, `3157`, `4291`, `5051`, `5873`, `6558`), with none found at `location_id="crows_den"`.

#### Hypotheses assessed
1. **No scheduled worker is processing queued/due ticks - supported.** The worker code exists, but visible repo/deployment config does not schedule it. This is sufficient to explain no visible narrative activity because ticks are only visible after claim/process/append.
2. **Crows Den id or chain mapping prevents eligible participants - partially eliminated for `locations.id="11"`, still a UI/data hazard.** Membership uses exact DB `wagdie_characters.location_id === locationId` (`lib/eliza/locationRooms/membership.ts:96-106`) and scheduled eligibility counts exact DB location IDs (`lib/eliza/locationRooms/membership.ts:110-129`). Runtime public API shows eligible staked rows at DB location `"11"`, so participants should be eligible if the room route uses `"11"`. However, the duplicate `"crows_den"` location has no staked rows and no chain id; selecting/routing that duplicate would show an empty/non-eligible room.
3. **`eliza_location_rooms` row missing, disabled, not due, or has errors - eliminated for canonical `11` in dev.** Dev DB has a room row for `location_id='11'` with `tick_enabled=true`, `last_tick_at=null`, `next_tick_at=null`, `tick_count=0`, and `last_error=null`.
4. **Ticks exist but are pending/failed/dead - confirmed pending.** Dev DB has one scheduled tick for `location_id='11'`, status `pending`, attempts `0`, `next_attempt_at=2026-05-11`, no lock, no selected token, no completion, and no error.
5. **Crows Den is routed to gameplay rather than plain narrative - not supported by current dev env evidence.** Dev env did not show `ELIZA_LOCATION_ROOM_GAMEPLAY_ENABLED` or a gameplay allowlist. Gameplay routing is config-gated (`lib/eliza/config.ts:271-276`, `lib/eliza/locationRooms/service.ts:247-252`).
6. **Generation is failing after claim - not supported by current dev evidence.** The tick has never been claimed (`attempts=0`, no lock, no error), so generation has not started.

## Investigation Log

### Phase 1 - Initial triage
**Hypothesis:** The issue may be caused by location-room tick scheduling/configuration, missing room sync, eligibility filters for staked Eliza characters, missing manual/automatic tick trigger, or runtime failure after queueing.
**Findings:** Initial search surfaced location-room tick API, admin narrative route, game-master config service, and location-room config.
**Evidence:** `app/api/eliza/location-rooms/[locationId]/tick/route.ts`, `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`, `lib/eliza/config.ts`, `lib/eliza/gameMasterAgent/service.ts`.
**Conclusion:** Broad context gathering was required.

### Phase 2 - Context builder assessment
**Hypothesis:** GM availability alone does not create room activity; room state, participants, tick queue, sync worker, and UI path all need to line up.
**Findings:** Context builder confirmed the only processor path is `/api/sync/eliza-location-rooms`, and manual tick only queues work.
**Evidence:** `app/api/sync/eliza-location-rooms/route.ts:9-40`, `lib/eliza/locationRooms/service.ts:435-502`, `app/api/eliza/location-rooms/[locationId]/tick/route.ts:21-37`.
**Conclusion:** Worker invocation and runtime room/tick state were the decisive checks.

### Phase 3 - Dev runtime database/env verification
**Hypothesis:** The canonical room might lack participants, room state, or due ticks.
**Findings:** Canonical Crows Den is `locations.id='11'` with `chain_location_id='11'`; duplicate `crows_den` also exists. Active table `wagdie_characters` has six staked participants at `location_id='11'`, including two with Eliza `official_agent_id`s. The location room exists and is enabled. One scheduled tick is pending and due since 2026-05-11. No public messages exist.
**Evidence:** Read-only dev DB checks on 2026-05-23:
- `locations`: `id='11'`, `name='The Crow''s Den'`, `chain_location_id='11'`; duplicate `id='crows_den'`, `name='Crow''s Den'`, no chain id.
- `wagdie_characters`: tokens `1443`, `3157`, `4291`, `5051`, `5873`, `6558` at `location_id='11'`, all `staking_status='staked'`, not burned; `3157` and `5873` have official Eliza agent ids.
- `eliza_location_rooms`: row for `location_id='11'`, `tick_enabled=true`, `next_tick_at=null`, `tick_count=0`, `last_error=null`.
- `eliza_location_room_ticks`: one `scheduled` tick for `location_id='11'`, `status='pending'`, `attempts=0`, `next_attempt_at=2026-05-11`, `last_error=null`.
- `eliza_location_room_messages`: no public messages for `11` or `crows_den`.
**Conclusion:** The room is eligible and due; the tick is simply unprocessed.

### Phase 4 - Narrative / GM config check
**Hypothesis:** The configured GM agent should be producing narrative beats.
**Findings:** Dev env has `ELIZA_LOCATION_ROOMS_ENABLED=true` and `ELIZAOS_BASE_URL=http://elizaos:3001`, but does not set `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED`. `lib/eliza/config.ts:247-263` defaults narrative mode to `false`. `LocationRoomService` only requires and uses the GM resolver when narrative mode is enabled, or when gameplay mode for a location requires narrative readiness (`lib/eliza/locationRooms/service.ts:259-283`, `lib/eliza/locationRooms/service.ts:624-657`).
**Conclusion:** GM availability is not the direct blocker for visible messages. With current dev env, a processed non-gameplay tick should produce a plain official character turn, not a GM-planned narrative beat.

## Root Cause
The primary root cause is **missing location-room worker invocation**. The dev database already contains a due pending tick for canonical Crows Den (`location_id='11'`), but nothing is claiming and processing it into public messages.

The code requires `/api/sync/eliza-location-rooms` to run. That route authenticates with `SYNC_SECRET_KEY` and calls `locationRoomService.runScheduledWorker()` (`app/api/sync/eliza-location-rooms/route.ts:9-40`). `runScheduledWorker()` enqueues due scheduled ticks and then claims/processes due ticks (`lib/eliza/locationRooms/service.ts:484-502`). Manual activity is not enough because the manual endpoint returns a queued tick without processing it (`app/api/eliza/location-rooms/[locationId]/tick/route.ts:21-37`).

The repo-visible schedule does not include the location-room worker. `vercel.json:1-9` only schedules `/api/sync/ownership?secret=${SYNC_SECRET_KEY}`. Therefore, unless an external cron/process exists outside the repo, location-room ticks can remain pending indefinitely.

Secondary findings:
- **Narrative mode is disabled in dev.** The GM agent is configured, but `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED` is not set, so GM narrative beats are not expected yet. This does not block plain visible character messages once the worker processes ticks.
- **Duplicate Crows Den location rows exist.** `id='11'` is canonical for chain staking and has participants; `id='crows_den'` has no chain id and no staked participants. If the UI routes to `crows_den`, users will see an empty/non-active room even though the chain-backed room is `11`.

## Recommendations
1. **Run the location-room worker once in dev to validate the diagnosis.** Call `POST /api/sync/eliza-location-rooms` with `Authorization: Bearer <SYNC_SECRET_KEY>` or `?secret=<SYNC_SECRET_KEY>`. This is intentionally not done during this read-only investigation because it mutates tick/message state. Expected result: the existing pending tick for `location_id='11'` is claimed, processed, and either completed with a public message or marked failed with a concrete `last_error`.
2. **Add a scheduled worker invocation.** Add a cron/platform schedule for `/api/sync/eliza-location-rooms?secret=${SYNC_SECRET_KEY}`. If using Vercel cron, add it next to the existing ownership cron in `vercel.json:1-9`. Use an interval aligned with `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES=360` or faster if you want queued manual ticks to resolve promptly.
3. **Enable narrative mode only if GM-authored beats are desired now.** Set `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true` in dev if the expectation is GM-planned room beats. Otherwise, processed ticks will use plain official character turn generation. If gameplay mode is enabled for Crows Den later, narrative mode and a resolvable GM become required.
4. **Add operational visibility for stuck ticks.** The admin location-room view should expose room id, participant count, latest tick status, `attempts`, `next_attempt_at`, `last_error`, and whether narrative/gameplay mode is active. GM availability alone is a misleading health signal.
5. **Canonicalize The Crow's Den to `locations.id='11'`.** Hide/merge/deactivate the duplicate `crows_den` row after checking references, or make the map/sidebar always route to `id='11'` for the chain-backed location. Do not rely on name matching.

## Preventive Measures
- Add a health check or alert for due `eliza_location_room_ticks` stuck in `pending` beyond one worker interval.
- Add a deployment checklist item: every queued-worker endpoint must have a cron/scheduler and a documented secret path.
- Add a test or runbook step that seeds an eligible room, invokes `/api/sync/eliza-location-rooms`, and asserts a tick leaves `pending`.
- Add a data integrity check for duplicate map locations sharing coordinates/name variants but only one chain id.
