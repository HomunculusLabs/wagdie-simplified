# Location Encounter Watch Page: Plan

## Goal
Create a dedicated, readability-first watch page for WAGDIE location encounters so users can leave a window open and follow room gameplay as it unfolds. The experience should present narrative dialogue with basic character identity beside each speaker, a persistent character stats/status sidebar, and structured GM roll UI instead of relying on embedded `Rolls:` text.

## Background
- User direction: target a dedicated watch page, not just an expanded map modal; prioritize readability over cinematic drama or operator-only diagnostics; show basic character identity beside dialogue and character stats in a sidebar; expose GM rolls through structured metadata.
- Current room UI lives inside the map staking sidebar. `app/map/page.tsx:187` passes selected map/staking state into `MapStakingSidebar`, which activates `useLocationRoom` only when the sidebar is open, the selected marker is a location, and the `room` tab is active (`components/map/MapStakingSidebar.tsx:96`).
- `useLocationRoom` already wraps the public room read and trigger flow: it fetches `/api/eliza/location-rooms/:locationId?pageSize=30` with `cache: 'no-store'`, exposes `roomData`, loading/error state, `refetch`, and owner/admin-gated `triggerTick`, then polls briefly only after a manual trigger (`hooks/map/useLocationRoom.ts:11`, `hooks/map/useLocationRoom.ts:87`, `hooks/map/useLocationRoom.ts:144`). It is reusable but currently requires `stakedHere`, wallet, and active state from the map sidebar.
- `LocationRoomPanel` is a prop-driven renderer over `PublicLocationRoomRead` and already encodes distinct visual treatments for `gm_setup`, `character_action`, and `gm_outcome` cards (`components/map/staking-sidebar/LocationRoomPanel.tsx:6`, `components/map/staking-sidebar/LocationRoomPanel.tsx:31`). It also renders compact gameplay character/monster status cards and counts living/dead characters (`components/map/staking-sidebar/LocationRoomPanel.tsx:25`, `components/map/staking-sidebar/LocationRoomPanel.tsx:69`, `components/map/staking-sidebar/LocationRoomPanel.tsx:110`).
- Public room types are intentionally compact: `PublicLocationRoomParticipant` exposes only `tokenId`, `name`, `imageUrl`; `PublicLocationRoomMessage` exposes author, optional `tokenId`, content, timestamp, and optional `gameplayMessageKind`; `PublicLocationRoomGameplaySummary` exposes encounter status, character status/hp bands, monster state, and pending reward summary (`lib/eliza/locationRooms/types.ts:87`, `lib/eliza/locationRooms/types.ts:99`, `lib/eliza/locationRooms/types.ts:138`).
- The public service is the drop point for richer data. `toPublicParticipant` strips background/owner/staker data, `toPublicMessage` only forwards the gameplay message kind, and `toPublicGameplaySummary` converts full character HP to status bands (`lib/eliza/locationRooms/service.ts:157`, `lib/eliza/locationRooms/service.ts:178`, `lib/eliza/locationRooms/service.ts:206`).
- Structured roll data already exists before the public seam. `GameplayDiceRollResult` stores formula, rolls, and total; `GameplayTurn` persists `diceResults` and `mechanicalDeltas` (`lib/eliza/locationRooms/gameplay/types.ts:301`, `lib/eliza/locationRooms/gameplay/types.ts:312`). The gameplay coordinator stores full dice/mechanical data on the turn and only puts a formatted `rollSummary` string into public GM outcome message metadata/content (`lib/eliza/locationRooms/gameplay/coordinator.ts:700`, `lib/eliza/locationRooms/gameplay/coordinator.ts:745`, `lib/eliza/locationRooms/gameplay/coordinator.ts:783`).
- Character identity/stats data exists in the `Character` type: token/name/class, `image_url`/metadata art fields, core stats, HP/max HP, AC, speed, infection/staking/burned status (`types/character.ts:11`). Existing UI helpers include `useCharacterImageDisplay`, `CharacterArtworkCard`, `CoreStatsEditor`, and compact `DerivedStatsEditor` HP/AC/speed display (`components/characters/DerivedStatsEditor.tsx:8`, `components/characters/DerivedStatsEditor.tsx:43`).
- Prior location room plan established public rooms, transcripts, queued ticks, and the sidebar room tab (`docs/plans/elizaos-agent-location-rooms-2026-05-11.md:36`, `docs/plans/elizaos-agent-location-rooms-2026-05-11.md:198`). The interactive D&D plan layered gameplay summaries and visual GM setup/action/outcome narration into `LocationRoomPanel` (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:231`, `docs/plans/eliza-interactive-dnd-game-2026-05-22.md:308`). The automated gameplay plan moved toward worker-driven continuation ticks (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:5`).
- Prior readability work on event pages favors narrative-first, process-light reading with large serif prose and secondary provenance (`docs/plans/event-pages-overhaul-2026-05-19.md:4`, `docs/plans/event-pages-overhaul-2026-05-19.md:43`). The video viewing plan is useful prior art for a dedicated leave-open/theater route that is separate from dense management UI (`docs/plans/lowpoly-video-viewing-2026-05-11.md:3`).
- Operational caveat: Crows Den investigation found room inactivity can come from tick processing gaps and duplicate location identifiers (`crows_den` vs canonical `locations.id='11'`), so a watch page should make freshness/location identity legible rather than masking stale rooms (`docs/investigations/crows-den-narrative-inactivity-2026-05-23.md:4`, `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md:51`).

## Approach
Build a dedicated public route at `/location-rooms/[locationId]` that reads the same public room API as the sidebar but presents it in a larger, passive viewing layout. Use `locationId` rather than lore slug in V1 because the room API, service canonicalization, staking data, and existing route all key off location id; the API should make requested-vs-canonical identity visible so legacy aliases like `crows_den` are understandable.

The V1 watch page should be read-only. It should not render wallet connection, staking, unstaking, or manual tick controls; instead, it should link back to `/map` for management/trigger actions while the existing sidebar keeps owner/admin controls. This preserves the leave-open viewing mode and avoids mixing passive observation with wallet-gated operations.

Extend the public API additively rather than creating a watch-only endpoint. `PublicLocationRoomRead` should gain public-safe identity/freshness data, participant static sheet stats for the sidebar, and sanitized structured roll metadata on relevant GM outcome messages. Public roll projection should be a combined adapter: create `publicRolls` from the coordinator's fresh `mechanicalSummary` when writing a new GM outcome, store that sanitized payload in message metadata, and have `toPublicMessage` expose only stored metadata that passes the same sanitizer. The public seam must remain conservative: expose static character sheet stats and gameplay bands/status, not owner/staker wallets, exact current gameplay HP, equipment snapshots, modifier sources, raw `mechanicalDeltas`, or raw message metadata.

Extract shared read-only room fetching into a hook that both the watch page and current map hook can use. Keep `LocationRoomPanel` intact for sidebar density; build watch-specific components under `components/location-rooms/` and share only safe presentation helpers plus a reusable `StructuredRollPanel` with compact/roomy variants.

## Decisions
- Route: `/location-rooms/[locationId]`.
- Watch page controls: read-only in V1; manual trigger remains in the existing map/sidebar flow.
- Character sidebar depth: basic identity/image, static public sheet stats (`class`, `level`, core stats, `maxHp`, `ac`, `speed`) when available, plus dynamic gameplay `status` and `hpBand`; no exact current gameplay HP.
- Roll display: use new structured public metadata for new messages. Do not make brittle parsing of embedded `Rolls:` text the primary path.
- Migration: existing stored messages may keep embedded roll text and lack structured metadata; no backfill required for V1.

## Work Items

### Item 1 — Define additive public room DTOs
**Goal:** Lock the public contract for the watch page without changing behavior yet.

**Done when:**
- `PublicLocationRoomRead` includes additive `identity` and `activity` metadata for requested/canonical location id, alias status, generated time, latest sequence/time, message count, and — where available without a heavy query — last tick/turn counts.
- `PublicLocationRoomParticipant` supports optional public static sheet stats and class/level.
- `PublicLocationRoomMessage` supports optional structured `gameplayRolls`.
- The first `gameplayRolls` shape is explicit and intentionally small: action roll summary, public effects, optional retaliation summary, deaths, and encounter status after; no raw mechanics.
- The DTO comments or adjacent types state what must not be exposed publicly.

**Key files:** `lib/eliza/locationRooms/types.ts:87`, `lib/eliza/locationRooms/types.ts:99`, `lib/eliza/locationRooms/types.ts:138`.

**Dependencies:** None.

**Size:** M.

### Item 2 — Add safe structured roll projection
**Goal:** Convert existing gameplay mechanics into a public-safe roll payload for UI rendering.

**Done when:**
- A pure helper such as `lib/eliza/locationRooms/gameplay/publicRolls.ts` converts a fresh coordinator `GameplayMechanicalOutcomeSummary` into a whitelisted public roll DTO.
- The same module exposes sanitization/type-guard logic for reading stored `metadata.publicRolls` back through `toPublicMessage`.
- The normalized shape covers action roll (`actionType`, actor, target kind/id, dice roll, modifier, total, DC, tier), public effects (damage/healing), optional retaliation (monster, target, attack/damage rolls, target AC, hit, amount), deaths, and encounter status after.
- Unit tests cover action rolls, damage/healing/retaliation effects, death/status outcomes, and malformed metadata.

**Key files:** `lib/eliza/locationRooms/gameplay/types.ts:301`, `lib/eliza/locationRooms/gameplay/coordinator.ts:700`, `lib/eliza/locationRooms/gameplay/coordinator.ts:783`, `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`.

**Dependencies:** Item 1.

**Size:** M.

### Item 3 — Store and expose public roll metadata
**Goal:** Make new GM outcome messages carry structured rolls through the public read without forwarding raw mechanics.

**Done when:**
- `gameplay/coordinator.ts` stores both legacy/debug `rollSummary` and new sanitized `publicRolls` metadata on GM outcome messages.
- `toPublicMessage` exposes `gameplayRolls` only when stored metadata passes the public-roll sanitizer.
- Raw `metadata`, raw `mechanicalDeltas`, and admin serializer shapes are not forwarded to public clients.
- Existing embedded roll text is kept temporarily until both watch page and sidebar can render structured rolls; Item 9 must remain after sidebar compatibility, not before.

**Key files:** `lib/eliza/locationRooms/gameplay/coordinator.ts:745`, `lib/eliza/locationRooms/service.ts:178`, `app/api/admin/eliza/gameplay/shared.ts:100`.

**Dependencies:** Items 1–2.

**Size:** M.

### Item 4 — Extend public participant/sidebar data safely
**Goal:** Provide enough character data for a persistent watch sidebar while preserving privacy and gameplay boundaries.

**Done when:**
- `locationRoomMembershipRepository.listEligibleParticipantsByLocation()` and its backing query/mapping are the named source seam for adding public-safe static sheet fields; implementation verifies exact `wagdie_characters`/character row column names before editing.
- `LocationRoomParticipant` carries optional class/level/core stats/max HP/AC/speed, and `toPublicParticipant` emits them where available.
- Watch UI can join `roomData.participants` to `roomData.gameplay.characters` for current status and HP band.
- Missing stat data degrades to identity/status with a “stats unavailable” state.

**Key files:** `lib/eliza/locationRooms/service.ts:157`, `lib/eliza/locationRooms/service.ts:206`, `lib/eliza/locationRooms/membership.ts`, `types/character.ts:11`, `components/characters/DerivedStatsEditor.tsx:43`.

**Dependencies:** Item 1.

**Size:** M.

### Item 5 — Add shared read-only room hook
**Goal:** Reuse room fetching for the watch page without coupling it to map staking state.

**Done when:**
- `hooks/usePublicLocationRoom.ts` fetches `GET /api/eliza/location-rooms/[locationId]` with `cache: 'no-store'`, abort/nonce protection, configurable page size, optional passive refresh, `lastFetchedAt`, and `refetch`.
- Defaults are explicit: the watch page requests page size `50` and the sidebar keeps page size `30`.
- Passive refresh pauses when `document.visibilityState !== 'visible'`.
- `hooks/map/useLocationRoom.ts` composes the shared hook while retaining map-specific trigger eligibility, manual tick POST, and post-trigger polling.
- Existing hook behavior and tests remain equivalent for the sidebar.

**Key files:** `hooks/map/useLocationRoom.ts:11`, `hooks/map/useLocationRoom.ts:87`, `hooks/map/useLocationRoom.ts:144`, `tests/hooks/useLocationRoom.test.tsx`.

**Dependencies:** Item 1 for stable DTO typing; behavior can be developed in parallel only if tests are staged to avoid type churn.

**Size:** M.

### Item 6 — Build the dedicated watch page shell and layout
**Goal:** Create the public, leave-open viewing surface.

**Done when:**
- `app/location-rooms/[locationId]/page.tsx` renders a no-cache route and passes the param to a client watch component.
- `components/location-rooms/LocationRoomWatchPage.tsx` uses the shared hook, owns auto-refresh/follow-latest behavior, and renders loading/error/empty states.
- The desktop layout has a large transcript region and sticky stats/status sidebar; mobile stacks status before transcript.
- The header displays location name, canonical/alias notice when relevant, participant count, message count/latest sequence, last message time, server-generated/fetched timestamps, and last tick/turn counts only when the public activity seam exposes them.
- The page links back to `/map` for staking or manual trigger actions but does not render trigger controls itself.

**Key files:** `app/location-rooms/[locationId]/page.tsx`, `components/location-rooms/LocationRoomWatchPage.tsx`, `components/shared/BannerHeader.tsx`, `app/videos/page.tsx`, `app/lore/locations/[slug]/page.tsx`.

**Dependencies:** Items 1 and 5 for route/read behavior; Item 4 or a smaller activity helper if the first slice requires full participant stats and tick/turn freshness.

**Size:** L.

### Item 7 — Build transcript, profile, sidebar, and roll components
**Goal:** Present the encounter as a readable story with character identity and operational clarity where it helps comprehension.

**Done when:**
- Suggested boundaries include transcript, message-card, status-sidebar, structured-roll, and presentation-helper modules; implementation may merge/split these if the public API contracts stay intact.
- The transcript renders messages chronologically by sequence with large readable prose and clear spacing.
- Message rendering joins each message to participant/gameplay data, displays avatar/name/token/status beside dialogue, and uses a clear GM identity for game-master messages.
- The status sidebar displays encounter status, participant stat cards, monster state, rewards, freshness, and stale/no-message copy.
- `StructuredRollPanel` renders `gameplayRolls` for GM outcome messages in a roomy watch variant and a compact sidebar variant.
- Presentation helpers for timestamps/status/card colors are shared where useful without turning `LocationRoomPanel` into a variant-heavy component.

**Key files:** `components/location-rooms/EncounterTranscript.tsx`, `components/location-rooms/EncounterMessageCard.tsx`, `components/location-rooms/EncounterStatusSidebar.tsx`, `components/location-rooms/StructuredRollPanel.tsx`, `components/location-rooms/locationRoomPresentation.ts`, `components/map/staking-sidebar/LocationRoomPanel.tsx:31`.

**Dependencies:** Items 3, 4, and 6.

**Size:** L.

### Item 8 — Add sidebar bridge and structured-roll compatibility
**Goal:** Keep the existing room tab useful and point users toward the larger watch surface.

**Done when:**
- `LocationRoomPanel` accepts and renders an “Open watch page” link.
- `MapStakingSidebar` passes a fallback watch href from the selected location id before room data loads; once room data exists, canonical `roomData.room.locationId` or `identity.canonicalLocationId` is preferred.
- The sidebar renders compact `StructuredRollPanel` when `message.gameplayRolls` exists.
- Existing owner/admin trigger controls remain unchanged.

**Key files:** `components/map/MapStakingSidebar.tsx:96`, `components/map/staking-sidebar/LocationRoomPanel.tsx:6`, `components/map/staking-sidebar/LocationRoomPanel.tsx:337`.

**Dependencies:** Items 1, 3, and 7. Canonical identity is preferred when present; fallback href behavior should still work before the extended DTO is loaded.

**Size:** S.

### Item 9 — Complete roll-summary migration
**Goal:** Stop embedding new roll summaries in narrative content after structured rendering is available everywhere it is needed.

**Done when:**
- New GM outcome message `content` uses only `outcome.publicNarration` once watch page and sidebar structured roll rendering have shipped.
- `rollSummary` remains in metadata for compatibility/debugging.
- Existing historical messages are left as-is; UI does not parse them for structure.
- Tests assert structured roll rendering rather than text parsing for new fixture messages.

**Key files:** `lib/eliza/locationRooms/gameplay/coordinator.ts:700`, `lib/eliza/locationRooms/gameplay/coordinator.ts:745`, `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`.

**Dependencies:** Items 3, 7, and 8.

**Size:** S.

### Item 10 — Test and document the workflow
**Goal:** Protect the public API, existing sidebar behavior, and new watch experience.

**Done when:**
- API tests cover additive public fields, sanitized `gameplayRolls`, participant stat exposure, and identity/activity metadata.
- Hook tests cover shared read behavior, passive polling, visibility pause, and no regression in `useLocationRoom` trigger behavior.
- Component tests cover the first vertical slice requirements: identity beside dialogue, stats sidebar fallback behavior, structured roll rendering, alias/freshness display, no watch-page trigger controls, and sidebar watch link.
- The plan or follow-up docs note the V1 read-only stance, privacy boundaries, legacy message behavior, and `/map` management path.

**Key files:** `tests/api/eliza/location-room-routes.test.ts`, `tests/hooks/useLocationRoom.test.tsx`, `tests/components/map/staking-sidebar/components.test.tsx`, new `tests/components/location-rooms/*`, `docs/plans/location-encounter-watch-page-2026-05-24.md`.

**Dependencies:** Items 1–9.

**Size:** M.

## Orchestration Progress
- [x] Item 1 — Define additive public room DTOs — completed by session 36FB1A93; DTOs added in `lib/eliza/locationRooms/types.ts`, typecheck blocked by pre-existing unrelated errors.
- [x] Item 2 — Add safe structured roll projection — completed by session 1500FB77; `publicRolls` helper and focused tests added/passed.
- [x] Item 3 — Store and expose public roll metadata — completed by session 0965FED8; coordinator stores `publicRolls`, service exposes sanitized rolls plus identity/activity, targeted tests passed.
- [x] Item 4 — Extend public participant/sidebar data safely — completed by session 54102017; membership query/mapping and `toPublicParticipant` now expose safe static stats, targeted tests passed.
- [x] Item 5 — Add shared read-only room hook — completed by session 7DD9F7A1; `hooks/usePublicLocationRoom.ts` added, `useLocationRoom` composed, targeted hook tests passed.
- [x] Item 6 — Build the dedicated watch page shell and layout — completed by session 2F43CB17; `/location-rooms/[locationId]` route and watch page shell added, focused component tests passed.
- [x] Item 7 — Build transcript, profile, sidebar, and roll components — completed by session 2F43CB17; readable transcript/sidebar/structured roll components added, no `Rolls:` parsing.
- [x] Item 8 — Add sidebar bridge and structured-roll compatibility — completed by session 2B021A9D; sidebar watch link and compact `StructuredRollPanel` added, targeted sidebar tests passed.
- [x] Item 9 — Complete roll-summary migration — completed by session AC4FEA44; new GM outcome content is narration-only, `rollSummary` stays in metadata, targeted 5-suite test run passed.
- [x] Item 10 — Test and document the workflow — completed by this session; focused 8-suite run passed (102 tests) with API/service public fields and rolls, hook behavior, watch components, sidebar bridge, roll-summary migration, and membership/stat exposure covered.

## Final Implementation Notes
- V1 watch page is intentionally read-only: it does not expose wallet connection, staking/unstaking, or manual tick controls.
- Management actions remain on `/map` through the existing sidebar flow, including owner/admin manual trigger behavior.
- Public privacy boundaries remain conservative: static sheet fields and gameplay bands/status are exposed; owner/staker wallets, exact current gameplay HP, raw message metadata, raw mechanical deltas, equipment snapshots, and modifier-source internals are not exposed.
- Rollout behavior change: gameplay-enabled rooms no longer auto-start combat. The root cause and rationale are documented in `docs/investigations/gm-agent-narrative-combat-separation-2026-05-24.md`; combat now requires an active encounter, an explicit admin combat intent, or a consumed narrative combat trigger.
- New GM outcome messages use structured `gameplayRolls` for roll UI and narration-only content; legacy historical messages may still contain embedded `Rolls:` text and are not parsed/backfilled in V1.
- Embedded `Rolls:` text can be removed from new public GM outcome content only after every public dice consumer that needs roll visibility, including the watch page and `/map` sidebar path, renders `gameplayRolls` reliably and compatibility checks confirm no remaining UI depends on parsing embedded roll text.
- Deferred work: no historical structured-roll backfill, no watch-page management controls, and no broader repo-wide TypeScript cleanup beyond this feature.

## Open Questions
None blocking for V1. The plan makes explicit default decisions for the previously open points: the watch page is read-only, the route uses location id, and character stats are limited to public static sheet fields plus gameplay status/hp bands.

## References
- `components/map/staking-sidebar/LocationRoomPanel.tsx`
- `hooks/map/useLocationRoom.ts`
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/types.ts`
- `types/character.ts`
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/eliza-interactive-dnd-game-2026-05-22.md`
- `docs/plans/automated-100-turn-gameplay-2026-05-24.md`
- `docs/plans/event-pages-overhaul-2026-05-19.md`
- `docs/plans/lowpoly-video-viewing-2026-05-11.md`
- `docs/investigations/crows-den-narrative-inactivity-2026-05-23.md`
