# Location Room GM Grounding and Atomic Tick Writes: Plan

## Goal
Fix the two live room-11 failure modes: the Game Master must generate narration grounded in the active room/adventure context, and location-room ticks must not leave partial public transcripts when later GM scene-check outcome generation fails.

Preserve the existing no-public-fallback policy: if GM scene-check outcome generation/repair fails, the tick/beat should fail through existing failure handling, but no deterministic/static public outcome or broken partial public transcript should be published.

## Background
- Live dev room 11 reset exposed two independent issues: GM narration invented off-location anchors (storm/cottage/map, iron door/dark passage) and a scene-check outcome failed after partial public writes with `Game-master scene-check outcome repair failed (initial: progression_contract, repair: invalid_json)`.
- GM beat prompts are built by `buildGameMasterBeatPrompt()` in `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1245`, and scene-check outcome prompts by `buildGameMasterSceneCheckOutcomePrompt()` in `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1349`. They include location id, recent transcript, narrative state, adventure memory, spatial context, and catalog anchors, but they do not guarantee explicit room/location premise text after reset.
- Adventure memory is derived from `normalizeAdventureMemory()` and catalog metadata. `seedAdventureMetadataFromCatalog()` preserves existing live adventure memory unless `options.reseed` is true (`lib/eliza/locationRooms/narrativeTypes.ts:942`), and `refreshAdventureCatalogMetadataFromLocation()` calls it without reseed (`lib/eliza/locationRooms/narrativeTypes.ts:1059`). This makes stale or weak adventure state a load-bearing risk.
- `DefaultLocationRoomNarrativeCoordinator.processTurn()` loads location details, refreshes catalog metadata, then generates/stores a GM beat (`lib/eliza/locationRooms/narrativeCoordinator.ts:870`, `:912`, `:940`). Public GM beat append happens before character/scene-check outcome flow today (`lib/eliza/locationRooms/narrativeCoordinator.ts:955`, `:968`).
- Scene-check public writes are non-atomic today: character action and roll card are appended before `generateSceneCheckOutcome()` (`lib/eliza/locationRooms/narrativeCoordinator.ts:1248`, `:1301`, `:1373`). If outcome generation/repair throws, beat/tick fail while public messages remain.
- Tick processor catch behavior marks completion only if `processTurn()` returned an `appendedMessageId`; because scene-check failure occurs before return, `LocationRoomTickProcessor` marks failed/retry and keeps partial public writes (`lib/eliza/locationRooms/service/tickProcessor.ts:704`, `:720`, `:818`, `:839`, `:854`).
- Message persistence is currently one-at-a-time via `LocationRoomRepository.appendMessage()` (`lib/eliza/locationRooms/repository.ts:704`). Public retry safety depends on unique keyed/unkeyed indexes in `supabase/migrations/20260522030000_allow_keyed_location_room_messages.sql:6` and `:12`.
- The repo already uses `security definer` Postgres helper functions for transactional repairs (`supabase/migrations/20260604001000_add_repair_seared_current_image_rpc.sql:5`, `:14`), so a transactional location-room message publish RPC fits existing migration style.
- Existing prior art matters: `docs/plans/location-room-refactor-2026-05-30.md`, `docs/plans/combat-narration-quality-2026-05-29.md`, and `docs/investigations/crows-den-first-message-progression-2026-05-25.md` already define strict JSON validation/no-public-fallback expectations. `tests/lib/eliza/location-room-game-master-generator.test.ts` and `tests/lib/eliza/location-room-narrative-coordinator.test.ts` are likely primary coverage points.

## Approach

### 1. Hard-ground GM prompts with canonical location context
Add reusable canonical location-grounding prompt helpers in `lib/eliza/locationRooms/gameMaster/officialGenerator.ts`. Both GM beat and scene-check outcome prompts should receive explicit current-location facts independent of mutable adventure memory.

Add optional `location?: LocationRoomLocationDetails | null` to the internal generator inputs:

- `GenerateGameMasterBeatInput`
- `GenerateGameMasterSceneCheckOutcomeInput`

`DefaultLocationRoomNarrativeCoordinator.processTurn()` already loads `locationDetails`; pass that through to both `generateBeat()` and `generateSceneCheckOutcome()`.

The new prompt block should appear immediately after room/location identifiers and before transcript/adventure memory. It should include:

- `Canonical location grounding:`
- `Location id: <room.locationId>`
- `Location name: <location.name || "Unknown">`
- A rule that canonical grounding overrides stale adventure memory when they conflict.
- A rule forbidding unsupported off-location anchors such as `storm`, `cottage`, `map`, `iron door`, or `dark passage` unless those anchors appear in canonical grounding, current spatial context, catalog, or recent public transcript.
- Bounded premise text from normalized location metadata when present, such as `summary`, `description`, `publicDescription`, `lore`, `premise`, `scenePremise`, or `narrativePremise`.
- Bounded catalog defaults: arc summary, current stakes, opening decision prompt/options, discoveries, clocks.
- A compact set of visible catalog anchors from normalized catalog sections. Iterate over existing normalized sections rather than hard-coding section ids that may not exist.

### 2. Validate known off-location drift before publication
Add narrow validation for the exact live regression. This is in scope for the implementation, not a follow-up.

Build an `allowedGroundingText` from:

- location name/id
- extracted premise fields
- normalized catalog defaults/entries
- current spatial context
- recent transcript

If generated public narration contains a known drift sentinel absent from `allowedGroundingText`, fail validation with the existing generation/repair path. Initial sentinels should cover the live failures: `storm`, `cottage`, `map`, `iron door`, and `dark passage`.

Boundary rules:

- Apply validation to both GM beat public narration and scene-check outcome public narration.
- Normalize matching case-insensitively and handle simple plural/possessive variants; do not use broad fuzzy matching.
- Treat multi-word sentinels (`iron door`, `dark passage`) as phrase matches.
- Treat single-word sentinels (`map`, `storm`, `cottage`) as whole-word matches to avoid substring false positives.
- Permit a sentinel when it appears in canonical location grounding, current spatial context, selected catalog anchors/defaults, or recent public transcript.

This should not become a broad hallucination detector. It should only block observed unsupported off-location anchors when canonical grounding is available, while allowing those terms if the location/catalog/transcript actually contains them.

### 3. Add explicit reset/admin reseed behavior
Normal ticks should not silently overwrite live adventure memory. Reset/admin tooling should get an explicit reseed path so a test/dev reset can start from canonical location catalog defaults instead of stale or weak adventure memory.

Add a targeted service/admin operation that:

- Locates the canonical room for a location id.
- Clears room-scoped transcript/tick/narrative/gameplay state according to existing reset needs.
- Recreates or updates the narrative state with `seedAdventureMetadataFromCatalog(..., { reseed: true })` using current location metadata.
- Resets scheduler fields (`tick_count`, `last_tick_at`, `next_tick_at`) consistently.
- Avoids changing normal runtime `refreshAdventureCatalogMetadataFromLocation()` behavior.

This should be treated as dev/admin control-plane behavior, not automatic runtime reseeding.

### 4. Buffer all scene-check public message inputs before publishing
Refactor `DefaultLocationRoomNarrativeCoordinator.processTurn()` so all fallible scene-check work completes before public messages are published.

Current selected scene-check order:

1. Generate/store GM beat.
2. Potentially append public GM beat.
3. Generate character turn.
4. Append character action.
5. Resolve scene check.
6. Append roll card.
7. Generate GM scene-check outcome.
8. Append GM outcome.
9. Update narrative state and complete beat.

New selected scene-check order:

1. Generate/store GM beat.
2. Determine whether a public GM beat is required, but do not publish it yet.
3. Generate character turn.
4. Adjudicate scene check.
5. Patch beat metadata with scene-check id, adjudication, and character action.
6. Resolve or reuse stored roll resolution.
7. Project or reuse stored public roll facts.
8. Generate or reuse stored GM scene-check outcome.
9. Patch beat metadata with `gmOutcome`.
10. Prepare final narrative state/adventure metadata.
11. Build a public message batch in display order:
    - optional `gm_beat`
    - `character_action`
    - `roll_card`
    - `gm_outcome`
12. Publish the batch transactionally.
13. Patch beat metadata with message ids returned from the transaction.
14. Update narrative state and complete beat.

If `generateSceneCheckOutcome()` throws, no public GM beat, character action, roll card, or GM outcome from that tick should be appended. Existing beat failure diagnostics and tick retry/dead handling remain intact.

### 5. Publish public message batches through a DB transaction
Coordinator-level buffering prevents generation-failure partial writes; the chosen scope also requires transaction-backed publication so append-time DB failures cannot leave half of a generated scene-check transcript.

Add a narrow Postgres RPC migration, following the repo’s `security definer` pattern, for atomic location-room message batch append. This is not a broader persistence refactor.

Suggested shape:

```sql
create or replace function append_location_room_messages_batch(
  p_messages jsonb
)
returns jsonb
language plpgsql
security definer
as $$
...
$$;
```

The RPC should:

- Accept an ordered JSON array of message draft objects.
- Generate message ids server-side; do not require or trust client-supplied ids.
- Validate required fields server-side: `room_id`, `location_id`, `author_kind`, `author_name`, `content`.
- Coerce optional fields: `tick_id`, `token_id`, `official_agent_id`, `visibility`, `metadata`.
- Normalize `visibility` to `public` when omitted.
- Normalize `dedupeKey` into `metadata->>'dedupeKey'` exactly like `appendMessage()`.
- For public messages with `tick_id`, reuse an existing keyed row by `(room_id, tick_id, visibility, author_kind, metadata->>'dedupeKey')` when `dedupeKey` is non-empty.
- For public messages with `tick_id` and no `dedupeKey`, reuse an existing unkeyed row by `(room_id, tick_id, visibility, author_kind)` where `metadata->>'dedupeKey'` is null/empty.
- Do not dedupe internal rows unless the existing single-message behavior already does; match `appendMessage()` semantics.
- Insert all missing messages in one transaction and return rows in the same order as the input array.
- Use existing table constraints/indexes for final integrity rather than duplicating all validation logic in TypeScript.

Add `appendMessagesBatch(inputs: CreateLocationRoomMessageInput[]): Promise<LocationRoomMessage[]>` to `LocationRoomRepository`, implemented through Supabase `.rpc(...)`. Keep `appendMessage()` for existing single-message flows.

If the RPC encounters a non-dedupe failure, the transaction should abort and no subset of the batch should be visible.

### 6. Preserve non-scene behavior and same-tick GM context
For non-scene-check turns, public GM beat append can also be delayed until the character turn has been generated and adjudication is known. Preserve character prompt behavior by passing `visiblePublicNarrationForBeat = gameMasterOutput.publicNarration` to the turn generator when the GM beat would be public, even though the public message has not yet been appended.

Then publish in public order:

1. Optional `gm_beat`
2. Character reaction/action
3. State/beat completion as today

Non-scene single/double-message publish can use the new batch RPC for consistency, but the critical required path is selected scene checks.

### 7. Preserve idempotent retry semantics
Use existing dedupe keys and beat metadata:

- `narrative:${beat.id}:gm_beat`
- `scene_check:${beat.id}:character_action`
- `scene_check:${beat.id}:roll_card`
- `scene_check:${beat.id}:gm_outcome`

Retries should reuse stored scene-check data:

- If stored resolution exists, do not reroll.
- If stored public roll facts exist, reuse them.
- If stored `gmOutcome` exists, do not regenerate it.
- If any public message id exists, do not append that message again.

When delayed appends update beat metadata, preserve existing rich scene-check metadata. Do not replace it with stale `toGameMasterBeatMetadata()` output after scene metadata has been patched.

Post-publish recovery rule:

- If batch publish succeeds but later beat metadata/state patching fails, the next retry must rediscover already-published messages via dedupe/RPC return behavior, not rely only on stored message ids.
- Coordinator retry logic should treat existing deduped rows returned from `appendMessagesBatch()` as valid message ids and patch missing beat metadata from those rows.
- Tests should cover this by simulating metadata patch failure after a successful batch publish, then retrying without duplicate public messages.

## Work Items

### Item 1 — Canonical location grounding in GM prompts
**Goal:** Ensure GM beat and scene-check outcome prompts always include explicit current-location grounding derived from `LocationRoomLocationDetails` and normalized location metadata/catalog.

**Done when:**
- `GenerateGameMasterBeatInput` and `GenerateGameMasterSceneCheckOutcomeInput` accept optional `location`.
- `DefaultLocationRoomNarrativeCoordinator.processTurn()` passes loaded `locationDetails` into both GM generation calls.
- `buildGameMasterBeatPrompt()` and `buildGameMasterSceneCheckOutcomePrompt()` include a bounded `Canonical location grounding` block.
- Prompt tests assert The Crow’s Den/location 11 context appears in both prompt types even when existing adventure memory is stale or weak.

**Key files:**
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1245`
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1349`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:870`
- `lib/domain/location/metadata.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Known off-location drift validation
**Goal:** Prevent observed unsupported location drift anchors from passing validation when canonical grounding is available.

**Done when:**
- Public narration validation checks known drift sentinel phrases against allowed grounding text.
- The validation is only active when location/catalog/spatial grounding is present.
- Tests reject unsupported `storm/cottage/map` and `iron door/dark passage` text.
- Tests allow those terms when explicitly present in location/catalog/transcript grounding.

**Key files:**
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Item 1.

**Size:** Small-to-medium.

### Item 3 — Explicit reset reseed operation
**Goal:** Add an admin/dev reset path that starts a location room from current canonical location catalog defaults instead of stale adventure memory.

**Done when:**
- A service/admin operation can reset a specified location room and reseed narrative state with `seedAdventureMetadataFromCatalog(..., { reseed: true })`.
- Normal scheduled/manual ticks still use current non-reseed catalog refresh behavior.
- Tests cover that reset reseeds The Crow’s Den metadata and normal refresh does not overwrite live adventure memory.

**Key files:**
- `lib/eliza/locationRooms/narrativeTypes.ts:942`
- `lib/eliza/locationRooms/narrativeTypes.ts:1059`
- likely admin/service reset code to be discovered by implementation agent
- location-room admin/API tests

**Dependencies:** None. This can land before or alongside prompt grounding because it relies on existing catalog seeding behavior.

**Size:** Medium.

### Item 4 — Transactional public message batch append
**Goal:** Add DB-backed atomic publication for multi-message location-room transcript writes.

**Done when:**
- A Supabase migration creates `append_location_room_messages_batch(p_messages jsonb)` or equivalent.
- The function inserts/returns an ordered batch atomically and preserves existing dedupe behavior.
- `LocationRoomRepository` exposes `appendMessagesBatch()` backed by `.rpc(...)`.
- Tests cover successful ordered batch insert, dedupe reuse, and failed batch rollback/no partial rows.

**Key files:**
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql:61`
- `supabase/migrations/20260522030000_allow_keyed_location_room_messages.sql:6`
- `supabase/migrations/20260522030000_allow_keyed_location_room_messages.sql:12`
- `supabase/migrations/20260604001000_add_repair_seared_current_image_rpc.sql:5`
- `lib/eliza/locationRooms/repository.ts:226`
- `lib/eliza/locationRooms/repository.ts:704`

**Dependencies:** None. Implement and test this before final scene-check publish uses it.

**Size:** Large.

### Item 5 — Buffer scene-check public writes until GM outcome succeeds
**Goal:** Reorder `DefaultLocationRoomNarrativeCoordinator.processTurn()` so scene-check public messages are built after all fallible generation succeeds, then published transactionally.

**Done when:**
- Character action, roll card, GM outcome, and optional GM beat message inputs are buffered before publish.
- `generateSceneCheckOutcome()` failure leaves no public messages for that tick.
- Public scene-check success publishes the full message set through `appendMessagesBatch()` in transcript order.
- Existing failure diagnostics are still recorded through `markBeatFailed()` and tick failure remains handled by `LocationRoomTickProcessor`.
- Existing scene-check success path still renders public messages in the expected order.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts:955`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:1248`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:1301`
- `lib/eliza/locationRooms/narrativeCoordinator.ts:1373`
- `lib/eliza/locationRooms/service/tickProcessor.ts:704`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`

**Dependencies:** Item 4 for final transactional publish. The coordinator can still be refactored behind an `appendMessagesBatch()` seam while Item 4 is being implemented.

**Size:** Large.

### Item 6 — Retry/idempotency and metadata preservation tests
**Goal:** Ensure the buffered transactional scene-check flow remains safe on retries and does not duplicate or erase rich scene-check metadata.

**Done when:**
- Tests confirm stored resolution/public roll facts/GM outcome are reused on retry.
- Tests confirm existing message ids prevent duplicate append.
- Tests confirm delayed GM beat metadata updates preserve existing scene-check metadata.
- Existing no-public-fallback tests still pass.

**Key files:**
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`

**Dependencies:** Items 4–5.

**Size:** Medium.

## Execution Status
- [x] Item A — GM grounding + drift validation
- [x] Item B — Transactional message batch RPC/repository
- [x] Item C — Reset/reseed admin/service path
- [x] Item D — Coordinator atomic scene-check publishing + retry/idempotency tests

## Verification Checklist
- Reset room 11 through the new reseed operation.
- Confirm ElizaOS app/service/db are healthy and API keys match before running ticks.
- Run first tick from zero state.
- Verify transcript starts with The Crow’s Den / canonical room context.
- Verify forced GM outcome generation failure leaves no partial public transcript.
- Verify retry after post-publish metadata failure does not duplicate public messages.

## Open Questions
- Exact admin/API surface for reset reseed should be chosen during implementation after checking current admin route conventions. This discovery is an explicit prerequisite of Item 3, not hidden follow-up work.
- Exact RPC payload shape should be finalized during implementation, but it must preserve existing dedupe semantics, server-generated ids, rollback on non-dedupe failure, and input-order return rows.

## References
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/service/tickProcessor.ts`
- `lib/domain/location/metadata.ts`
- `lib/eliza/locationRooms/repository.ts`
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql`
- `supabase/migrations/20260522030000_allow_keyed_location_room_messages.sql`
- `supabase/migrations/20260604001000_add_repair_seared_current_image_rpc.sql`
- `docs/plans/location-room-refactor-2026-05-30.md`
- `docs/plans/combat-narration-quality-2026-05-29.md`
- `docs/investigations/crows-den-first-message-progression-2026-05-25.md`
