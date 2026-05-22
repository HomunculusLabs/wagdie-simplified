# Game Master Narrative Agent: Plan

## Goal

Build a game-master agent layer that advances ongoing collaborative narrative events for characters staked to map tiles, so token holders and visitors can watch location-based characters disagree, solve problems, and create entertaining public story activity over time.

V1 extends the existing WAGDIE-owned Eliza location-room system. It should add narrative direction, continuity, and game-master narration without replacing the current room/tick/transcript architecture or directly mutating canon.

## Background

- Staking already connects on-chain location ids to map tiles: map locations expose `chain_location_id`, staking transactions use that on-chain id, and `syncStakingState()` maps chain ids back to DB `locations.id` before updating `characters.location_id` (`hooks/map/useMapPageSelection.ts:43`, `hooks/map/useMapStakingPanel.ts:385`, `lib/services/sync/staking-state-sync.ts:187`, `lib/services/sync/staking-state-sync.ts:274`).
- The map display and sidebar group staked characters by DB `location_id`, with `useMapData()` fetching `/api/characters?tab=staked` and joining staked rows to loaded locations (`hooks/map/useMapData.ts:72`, `lib/repositories/character/character-staking-repository.ts:20`, `lib/repositories/character/character-query-repository.ts:110`).
- Public Eliza location rooms already provide the closest runtime seam: `LocationRoomService.getPublicRoom()` ensures one room per `locations.id`, loads eligible participants from current staking state, and returns public participants plus public transcript messages (`lib/eliza/locationRooms/service.ts:177`).
- Location-room ticks already implement an event loop: `requestTick()` validates location, participants, owner/admin authorization, cooldown, and enqueues a tick; `runScheduledWorker()` enqueues due rooms and processes claimed ticks (`lib/eliza/locationRooms/service.ts:217`, `lib/eliza/locationRooms/service.ts:324`).
- Location-room persistence already models rooms, ticks, and messages with public/internal visibility and queue states (`supabase/migrations/20260511000000_create_eliza_location_rooms.sql:4`, `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:21`, `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:61`).
- Current room generation is single-speaker turn generation: `processClaimedTickUnsafe()` selects one speaker, loads recent transcript, generates one official Eliza turn, appends one public message, and completes/advances the tick (`lib/eliza/locationRooms/service.ts:371`, `lib/eliza/locationRooms/officialTurnGenerator.ts:32`).
- Speaker selection currently balances recent participation by preferring the participant with fewest recent agent messages, then oldest last sequence, then lowest token id (`lib/eliza/locationRooms/service.ts:112`).
- The frontend already lets observers read location-room activity and eligible token holders manually trigger a room tick: `useLocationRoom()` fetches `/api/eliza/location-rooms/${locationId}`, posts to `/tick`, and polls for a newer sequence; `LocationRoomPanel` renders participants, transcript, tick count, and the “Stir the Room” action (`hooks/map/useLocationRoom.ts:91`, `hooks/map/useLocationRoom.ts:145`, `components/map/staking-sidebar/LocationRoomPanel.tsx:40`).
- Eliza gateway/client code keeps official hosted ElizaOS behind abstractions; `getElizaClient()` and `createUserClient()` select official vs custom gateway, while official conversations are scoped through local conversation-link rows (`lib/eliza/client.ts:52`, `lib/eliza/client.ts:86`, `lib/eliza/officialConversationRepository.ts:8`).
- Public lore is assembled as an effective graph from base lore, published canonization overrides, and public/canonized submissions (`lib/lore/effective-query.ts:30`, `lib/lore/effective-query.ts:74`, `lib/lore/effective-query.ts:194`).
- Lore submissions and canonization already have admin/public publication semantics: submissions can move `public → canonized`, while canonization overrides use draft vs published fields and effective public reads apply only published overrides (`lib/services/lore-submissions/transitions.ts:12`, `lib/repositories/lore-canonization-repository.ts:200`, `lib/lore/effective-query.ts:30`).
- Prior art: `docs/plans/elizaos-agent-location-rooms-2026-05-11.md` planned and commit `809af6bf` implemented public staked-character location rooms, queued ticks, public transcripts, and hosted ElizaOS turn generation; it should be treated as the baseline to extend, not replace.
- Prior art: `docs/investigations/staking-unstaking-2026-05-06.md` documents the DB location id vs on-chain `chain_location_id` bug class; this plan must preserve the separation between contract ids and DB `locations.id`.
- Prior art: `docs/plans/community-lore-media-submissions-2026-05-09.md` and `docs/plans/admin-panel-workflows-2026-05-09.md` established publication/canonization workflows that a game-master event archive can reuse or align with.

## Approach

Extend the existing location-room queue and transcript as the V1 runtime foundation. Do not introduce a separate Eliza-owned group-room system: the current room/tick/message architecture already owns location identity, current staking membership, scheduled/manual triggers, public transcript persistence, retries, and map UI.

Add a durable game-master narrative layer around the existing tick loop. When narrative mode is enabled and a room has at least two eligible participants, each processed tick should:

1. Load the current room, current participants, recent public transcript, and room narrative state.
2. Select the character speaker using the existing speaker-balancing algorithm.
3. Ask a configured game-master agent for a structured beat containing public narration, private speaker instruction, and updated room continuity.
4. Append one public `game_master` transcript message when public narration is present.
5. Generate the selected character’s response through the existing official character-agent path, now with private narrative context.
6. Append the character’s public `agent` message.
7. Mark beat/state/tick transitions completed, then advance room scheduling as today.

When narrative mode is disabled, the existing behavior must remain unchanged: one selected character utterance per tick.

V1 output should remain public but ephemeral room activity. The game master may create entertaining conflicts, objectives, open threads, and continuity summaries, but it must not directly create lore events, canonization overrides, or effective lore entries. If story quality proves strong, a later admin workflow can promote selected beats into the existing lore submission/canonization pipeline.

### Key design decisions

- **Use DB `locations.id` for all narrative state.** Only staking contract calls should use on-chain `chain_location_id`.
- **Store narrative continuity outside transcript rows.** Transcript messages are the public display layer; narrative state and beat rows are operational memory.
- **Make the game master a first-class public author kind.** Use `game_master`, not `system`, so UI and tests can distinguish narration from character speech.
- **Keep generation idempotent across tick retries.** Beat creation should be unique per tick, and public game-master message append should be protected by a DB-level unique constraint on the game-master message key, not only by a pre-insert lookup.
- **Use an admin-managed official service game-master agent in V1.** `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` should point to an official ElizaOS service agent that any admin wallet can manage through admin-authenticated tooling. Do not model the game master as a token-backed character in V1.
- **Keep canon autonomy conservative.** Generated narrative is not canon in V1; admin-reviewed promotion is optional later work.
- **Skip, do not degrade, when participation is too low.** Narrative-enabled ticks should use the existing insufficient-participants behavior for rooms with fewer than two eligible participants; they should not produce solo game-master narration or fall back to a one-character narrative beat.
- **Support simultaneous multi-location activity.** The game master is a shared service identity, but narrative state, beat records, tick locks, prompts, and transcripts must remain isolated per room/location so the GM can run in multiple map locations at once.

## Work Items

### Item 1 — Add narrative schema and `game_master` author kind

**Goal:** Add durable room-level narrative state and per-tick beat records without changing the public room API contract.

**Done when:**

- A new migration extends the location-room schema after `20260511000000_create_eliza_location_rooms.sql`.
- `game_master` is accepted as an `eliza_location_room_messages.author_kind` value.
- `eliza_location_room_narrative_states` stores one continuity row per room, keyed by room id and DB `location_id`.
- `eliza_location_room_narrative_beats` stores one game-master beat per tick, with status, selected speaker, public narration, speaker instruction, state snapshots, metadata, and error fields.
- The migration adds a DB-level idempotency guard for public game-master transcript rows, e.g. a unique partial index over `room_id`, `tick_id`, `visibility`, and `author_kind` where `tick_id is not null and visibility = 'public' and author_kind = 'game_master'`.
- New tables follow existing service-role/RLS conventions and do not expose internal speaker instructions publicly.
- The public room read response remains backwards-compatible in V1; it may contain `authorKind: 'game_master'`, but it should not expose narrative state or beat rows.

**Key files:**

- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql`
- New `supabase/migrations/*_add_location_room_narrative.sql`
- `lib/eliza/locationRooms/types.ts`

**Dependencies:** Existing location-room schema.

**Size:** M

### Item 2 — Add disabled-by-default narrative config

**Goal:** Introduce an explicit narrative feature flag and game-master agent configuration with predictable failure behavior.

**Done when:**

- `elizaConfig.locationRooms.narrative` exists with `enabled`, `gameMasterAgentId`, public narration length, state-summary length, and open-thread limits.
- `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED` defaults to false.
- Missing `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` only fails when narrative mode is enabled.
- Manual and scheduled tick routes can map narrative misconfiguration to the same 503-style operational boundary used by existing location-room feature/config errors.
- The plan assumes admin wallets, not token owners, are authorized to configure or rotate the shared game-master agent id.

**Key files:**

- `lib/eliza/config.ts`
- `lib/eliza/locationRooms/service.ts`
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts`
- `app/api/sync/eliza-location-rooms/route.ts`

**Dependencies:** None.

**Size:** S

### Item 3 — Implement narrative types and repository

**Goal:** Provide typed persistence access for room narrative states and per-tick beats.

**Done when:**

- The service can ensure one narrative state per room.
- The service can create or reuse one beat per tick.
- Beat status transitions cover planned, game-master message appended, character appended, completed, failed, and dead states.
- Repository writes are idempotent enough for tick retries.
- Stored errors are truncated/sanitized consistently with existing room error behavior.

**Key files:**

- New `lib/eliza/locationRooms/narrativeTypes.ts`
- New `lib/eliza/locationRooms/narrativeRepository.ts`
- `tests/api/eliza/location-room-service.test.ts` or focused repository tests

**Dependencies:** Item 1.

**Size:** M

### Item 4 — Build the game-master beat generator

**Goal:** Add a structured game-master generator that uses the configured official ElizaOS game-master agent to plan one narrative beat.

**Done when:**

- The generator starts or resolves the configured game-master agent and uses the smallest safe official messaging/session lifecycle, cleaning up transient resources when applicable.
- The prompt includes location/room identity, current participants, selected speaker, recent public transcript, current narrative state, and a strict structured-response contract.
- The generated beat must include public narration, private speaker instruction, and updated continuity summary; current objective/open threads may be included if useful for prompting/admin inspection, while tension level and featured token ids should remain optional metadata rather than required MVP fields.
- Invalid JSON, empty speaker instruction, ineligible token references, and over-limit values fail before writing public output.
- Output normalization caps public narration, state summary, and optional open threads according to config.
- The generator uses the configured admin-managed official service game-master agent id; exact transport mechanics may reuse `official/messaging.ts`, but the implementation agent owns the smallest safe integration.
- Each generation call must include room/location id and use room-scoped session/channel metadata so concurrent ticks in different locations cannot cross-contaminate transcript context or continuity state.

**Key files:**

- New `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/official/messaging.ts`
- `lib/eliza/characterResolver.ts` if game-master agent lookup needs the same resolver pattern
- New parser/normalizer tests

**Dependencies:** Items 2 and 3, plus the V1 decision that the game master is a configured official service agent id rather than a token-backed character.

**Size:** M

### Item 5 — Pass narrative context into character turn generation

**Goal:** Let existing character generation respond to game-master direction while preserving current non-narrative behavior.

**Done when:**

- `GenerateOfficialLocationRoomTurnInput` accepts optional narrative context.
- Without narrative context, the existing prompt and tests continue to behave as today.
- With narrative context, the prompt includes private state summary, current objective, open threads, and a single-speaker instruction.
- Character output remains one short in-world utterance.

**Key files:**

- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** Item 3.

**Size:** S

### Item 6 — Add narrative coordinator and integrate the tick loop

**Goal:** Wire game-master beat planning into `LocationRoomService` behind the narrative feature flag.

**Done when:**

- `LocationRoomService` accepts a narrative coordinator dependency alongside repository, membership, and turn generator.
- Narrative-disabled ticks still append exactly one selected character message.
- Narrative-enabled successful ticks append at most one public `game_master` message followed by one public `agent` message per room tick.
- Retry after game-master narration does not duplicate the game-master message, enforced through the schema/repository idempotency decision from Item 1.
- Beat/state rows are marked completed only after the character response is appended.
- Failed generation uses existing tick retry/dead behavior and does not append public error messages.
- Rooms with fewer than two eligible participants follow existing skip/insufficient-participants behavior; narrative mode does not create solo fallback beats.
- Concurrent ticks for different rooms can run safely with the shared game-master service identity because all mutable narrative data is keyed by room id and DB `location_id`.

**Key files:**

- New `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/repository.ts` for schema-backed game-master append idempotency
- `tests/api/eliza/location-room-service.test.ts`

**Dependencies:** Items 3, 4, and 5.

**Size:** L

### Item 7 — Update the public Room UI for game-master narration

**Goal:** Make game-master messages understandable in the existing Room tab without creating a new public surface.

**Done when:**

- `LocationRoomPanel` renders `authorKind === 'game_master'` with a distinct label and style.
- Character messages render unchanged.
- Loading, empty, error, trigger, and polling states remain unchanged.
- Public API remains no-store and response-compatible except for the new `game_master` author kind.
- Public UI does not expose beat ids, state rows, private speaker instructions, raw errors, or model metadata.
- Room copy frames the transcript as public story activity from staked characters at that location.

**Key files:**

- `components/map/staking-sidebar/LocationRoomPanel.tsx`
- `hooks/map/useLocationRoom.ts`
- `components/map/staking-sidebar/LocationTabs.tsx` if copy changes require tab wording

**Dependencies:** Items 1 and 6.

**Size:** S

### Item 8 — Add admin/ops narrative inspection

**Goal:** Give admins visibility into narrative state and beat failures before any lore-promotion work.

**Done when:**

- Admin-only reads can inspect a room’s narrative state and recent beats.
- Public users cannot access internal state, speaker instructions, model metadata, or raw errors.
- Admin output includes room/location id, beat status, selected token id, public narration, state summary, current objective, open threads, last error, and timestamps.
- V1 admin controls are read-only for room narrative state. Admin wallets may manage the shared game-master agent configuration through the admin/config path defined in Item 2.

**Key files:**

- New `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- Existing admin auth helpers

**Dependencies:** Items 1 and 3.

**Size:** M

### Later phase — Optional lore-candidate promotion

Selected narrative beats may later become admin-reviewed lore candidates, but that is intentionally outside V1. Any follow-up should create a draft/prefilled review record and keep existing publish/canonize workflows as the only path into `lib/lore/effective-query.ts`. The game-master generator must never call lore submission or canonization services directly.

### Item 9 — Test, smoke, and rollout

**Goal:** Verify the narrative layer is safe, retryable, and reversible.

**Done when:**

- Unit tests cover narrative-disabled fallback, narrative-enabled happy path, malformed game-master output, retry after game-master append, state/beat mapping, and terminal/dead tick behavior.
- Route tests cover narrative config errors and preserve existing auth/error behavior.
- Component tests cover game-master message rendering.
- Smoke testing confirms scheduled tick creates game-master plus character messages, owner manual trigger still works, non-owner trigger still fails, and turning the feature flag off restores old behavior.
- Staging rollout starts with narrative disabled, then enables one or a small number of rooms before global enablement.

**Key files:**

- `tests/api/eliza/location-room-service.test.ts`
- `tests/api/eliza/location-room-routes.test.ts`
- `tests/hooks/useLocationRoom.test.tsx`
- New narrative repository/generator tests
- `components/map/staking-sidebar/LocationRoomPanel.tsx`

**Dependencies:** Items 1–7.

**Size:** M

## Open Questions

- When story quality is validated, should lore-candidate promotion create a normal community submission, a new admin-only submission source, or a separate review queue that later feeds the existing submission service?

## References

- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/investigations/staking-unstaking-2026-05-06.md`
- `docs/plans/community-lore-media-submissions-2026-05-09.md`
- `docs/plans/admin-panel-workflows-2026-05-09.md`
- Relevant implementation seams: `lib/eliza/locationRooms/service.ts`, `lib/eliza/locationRooms/repository.ts`, `lib/eliza/locationRooms/membership.ts`, `lib/eliza/locationRooms/officialTurnGenerator.ts`, `hooks/map/useLocationRoom.ts`, `components/map/staking-sidebar/LocationRoomPanel.tsx`, `lib/lore/effective-query.ts`
