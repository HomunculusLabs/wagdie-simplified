# Location Room Watch UI Redesign: Plan

## Goal
Make `/location-rooms/[locationId]` a readable, purpose-built watch page for spectators who leave it open while gameplay unfolds. The redesign should improve information hierarchy, transcript scanning, live/follow-latest behavior, and character/encounter awareness without adding management actions to the public page.

## Background
- The public route is intentionally dynamic/no-store: `app/location-rooms/[locationId]/page.tsx:4-6`; it decodes the route param and renders `LocationRoomWatchPage` at `app/location-rooms/[locationId]/page.tsx:21-25`.
- `LocationRoomWatchPage` is the current client shell. It calls `usePublicLocationRoom({ locationId, pageSize: PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE, passiveRefresh: true })` at `components/location-rooms/LocationRoomWatchPage.tsx:17-22`, renders header facts/chips at `components/location-rooms/LocationRoomWatchPage.tsx:93-149`, a status sidebar at `components/location-rooms/LocationRoomWatchPage.tsx:159-161`, and the transcript at `components/location-rooms/LocationRoomWatchPage.tsx:171`.
- The public hook fetches `GET /api/eliza/location-rooms/${locationId}?pageSize=50` with `cache: 'no-store'`, tracks `roomData`, `isLoading`, `error`, and `lastFetchedAt`, aborts stale requests, ignores out-of-order responses, and passively refreshes every 10 seconds only while the document is visible: `hooks/usePublicLocationRoom.ts:39-78`, `hooks/usePublicLocationRoom.ts:94-116`.
- Follow-latest is local scroll behavior only: `followLatest` state lives in `LocationRoomWatchPage` at `components/location-rooms/LocationRoomWatchPage.tsx:15`; the effect scrolls to `transcriptEndRef` when enabled and the latest sequence changes at `components/location-rooms/LocationRoomWatchPage.tsx:26-29`; the toggle does not affect polling or pagination.
- The public API route delegates to `locationRoomService.getPublicRoom(locationId, { page, pageSize })` and returns `jsonNoStore(room)`: `app/api/eliza/location-rooms/[locationId]/route.ts:15-21`. `LocationRoomService.getPublicRoom` delegates to `LocationRoomPublicRoomReader.getPublicRoom`: `lib/eliza/locationRooms/service.ts:121-123`.
- `LocationRoomPublicRoomReader` canonicalizes aliases, ensures the room exists, loads public messages, public stats, optional gameplay state, and optional narrative/TTRPG state, then returns `PublicLocationRoomRead`: `lib/eliza/locationRooms/service/publicRoomReader.ts:219-298`.
- Public pagination is constrained by the read model: invalid page defaults to `1`, invalid page size defaults to `20`, and page size is clamped to `1..50`: `lib/eliza/locationRooms/service/publicRoomReader.ts:31-42`. The watch page already requests the max page size of 50.
- Public messages are filtered to `visibility = 'public'`, ordered newest-first by query, then reversed before return so the UI receives chronological order: `lib/eliza/locationRooms/repository.ts:837-844`.
- Public data boundaries are load-bearing. `PublicLocationRoomParticipant` excludes owner/staker wallets and private backstory by comment and projection: `lib/eliza/locationRooms/types.ts:187-199`, `lib/eliza/locationRooms/service/publicRoomReader.ts:45-57`. `PublicLocationRoomGameplayRolls` explicitly avoids raw mechanics/private state: `lib/eliza/locationRooms/types.ts:267-270`.
- Current UI component seams are already useful: `EncounterTranscript` sorts/empties/maps messages (`components/location-rooms/EncounterTranscript.tsx:11-45`); `EncounterMessageCard` owns per-message identity, metadata, prose, legacy roll fallback, and `StructuredRollPanel` rendering (`components/location-rooms/EncounterMessageCard.tsx:42-131`); `EncounterStatusSidebar` owns room status, participant, monster, and rewards panels (`components/location-rooms/EncounterStatusSidebar.tsx:112-266`); `StructuredRollPanel` supports `roomy` and `compact` variants (`components/location-rooms/StructuredRollPanel.tsx:4-139`).
- Presentation helpers are centralized in `components/location-rooms/locationRoomPresentation.ts`, including time formatting, message domain/kind/phase labels, tone classes, status tones, chronological sorting, lookups, stat predicates, and reward predicates: `components/location-rooms/locationRoomPresentation.ts:8-202`.
- Prior plan `docs/plans/location-encounter-watch-page-2026-05-24.md` established V1 as read-only, with management remaining on `/map`, conservative privacy boundaries, and structured `gameplayRolls` replacing embedded `Rolls:` text. Its work items named the current component boundaries: `docs/plans/location-encounter-watch-page-2026-05-24.md:111`, `docs/plans/location-encounter-watch-page-2026-05-24.md:126`, `docs/plans/location-encounter-watch-page-2026-05-24.md:200`.
- The prior critique flagged structured roll DTO/source seam, participant stat source seam, and freshness/activity seam as the highest-risk areas, and warned not to remove embedded `Rolls:` fallback until structured rolls render in both the watch page and sidebar: `docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md:5`, `docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md:16`.
- Current test coverage exists for hook invocation, alias/freshness display, `/map` link, transcript identity, sidebar stats, structured rolls, no management controls, scene-check labels, loading/error/retry/empty states, compact structured rolls in map sidebar, and backend public roll projection: `tests/components/location-rooms/location-room-watch-page.test.tsx:257-461`, `tests/components/map/staking-sidebar/components.test.tsx:91-167`, `tests/lib/eliza/location-room-gameplay-public-rolls.test.ts:35`, `tests/lib/eliza/location-room-scene-checks.test.ts:287`.
- Storybook coverage appears absent for `components/location-rooms/`, `LocationRoom`, `Encounter`, and `StructuredRoll` stories.
- The supplied screenshot shows the current pain: a heavy header fact grid, large repeated GM cards, dense right sidebar, duplicated room freshness/status data, weak scan hierarchy for “what happened recently?”, and character cards that compete with the transcript rather than help spectators follow the action.

## Approach
Redesign the watch page as a targeted UI/readability pass on top of the existing public read model. Do not plan backend, schema, route, or DTO changes unless implementation uncovers an unrelated compile-time issue.

The existing `PublicLocationRoomRead` payload is sufficient for the desired watcher experience:
- latest/current message from `roomData.messages` plus `activity.latestSequence`;
- freshness from `activity.generatedAt`, `activity.latestMessageCreatedAt`, and hook `lastFetchedAt`;
- encounter state from `roomData.gameplay`;
- TTRPG phase/readiness from `roomData.ttrpg`;
- roster/status from `participants` joined with `gameplay.characters`.

Use a live-room/chatroom spectator model:
1. Preserve chronological transcript order as the canonical room feed.
2. Make the transcript feel like the primary live surface, not a dashboard: compact room header, readable message stream, clear latest/new-activity affordances.
3. Add a lightweight, UI-derived **Current beat** affordance only insofar as it helps orient viewers without pulling attention away from the feed. Prefer a compact pinned/inline latest summary over a large separate hero card.
4. Keep follow-latest as client-only scroll behavior, but expose paused/new-activity state clearly.
5. Replace the heavy header fact grid with a compact location identity block and live status rail.
6. Keep the encounter/character sidebar broadly intact, but make it reliably sticky on desktop and reduce only the most distracting duplication.
7. Add scan aids inside the transcript only where they improve chatroom readability. V1 should prioritize continuation styling and latest/new-activity markers; defer phase/domain dividers unless implementation finds a low-risk, clearly readable treatment.

### Constraints
- Keep the public page read-only. No staking, wallet connection, manual tick, “Advance Gameplay,” “Stir the Room,” or adventure choice controls. `/map` remains the management path.
- Preserve no-store behavior across the route, API, and fetch hook.
- Preserve public DTO privacy boundaries: no owner/staker wallets, private backstory, raw metadata, exact private gameplay state, raw mechanics, equipment snapshots, or modifier-source internals.
- Preserve structured roll rendering and legacy `Rolls:` fallback for old messages without structured rolls.
- Treat `LocationRoomService`, `LocationRoomPublicRoomReader`, public DTOs, and `usePublicLocationRoom` as load-bearing seams, not redesign targets.

### UI shape
- **Top row:** Back to map, refresh, and follow/latest control.
- **Identity block:** Location name, short watcher copy, and alias/canonical chip only when relevant.
- **Live status rail:** Compact facts only: participants, public message count/latest sequence, phase/readiness, encounter status/round, and one relative freshness label such as “updated/fetched just now.” It may show a compact passive-refresh warning when existing data is still usable.
- **Current beat affordance:** Compact latest-public-message orientation with speaker, sequence, label/domain/phase, time, concise content, optional public roll outcome summary, and jump-to-latest control. It should feel like part of the live room feed, not a competing dashboard card.
- **Transcript:** Chronological chatroom-like feed with continuation styling, latest marker, and inline new-activity affordance when paused. Phase/domain dividers are deferred from V1.
- **Awareness panel:** Existing encounter/character sidebar kept recognizable, made sticky on desktop, and trimmed only where it duplicates the header or overwhelms the transcript. Detailed timestamps stay here rather than in the rail.

## Implementation Notes
- Add UI-only derivation helpers in `components/location-rooms/locationRoomPresentation.ts` only where they prevent duplicated component logic. The plan requires stable derived behavior, not exact helper names.
- Current/latest sequence should resolve as `roomData.activity?.latestSequence ?? lastChronologicalMessage?.sequence ?? null`. Empty message sets produce no current-beat affordance and no pending new-activity marker.
- Transcript display items need a minimal stable contract: message items carry a stable key from message id/sequence, the public message, `isLatest`, and `isContinuation`; optional marker items carry a stable key and label for the first unseen message boundary. Divider items are not required for V1.
- Continuation detection should mark messages from the same public speaker close together in the same phase/domain. Break continuation on speaker change, domain/phase change, large time gap, or structured rolls.
- `LocationRoomWatchPage` should own enhanced follow state: `followLatest`, `lastSeenSequence`, and `pendingLatestSequence`. Initial load should set last-seen without showing “new activity”; following mode scrolls and clears pending; paused mode leaves scroll position alone and exposes “New activity — jump to latest.” When paused, the inline marker belongs before the first rendered message with `sequence > lastSeenSequence`, not merely before the latest message.
- Add `components/location-rooms/CurrentBeatPanel.tsx` only as a compact presentational affordance if the implementation needs a separate component; otherwise an inline/pinned latest summary within `LocationRoomWatchPage` is acceptable. It must not fetch, mutate, or render private/adventure action data.
- Extend `EncounterTranscript` props additively with `pendingLatestSequence` and `onJumpToLatest`; extend `EncounterMessageCard` additively with `isContinuation` while preserving current structured roll and GM-name behavior.
- Keep `EncounterStatusSidebar` recognizable and reorganize only as needed. The primary requirement is that it remains reliably sticky on desktop and does not duplicate the new header/live rail.
- Keep tests behavior-oriented. Update assertions away from old fact-grid placement and toward watcher outcomes plus privacy/read-only guarantees.

## Work Items

### Item 1 — Add UI-only presentation helpers
**Goal:** Centralize current-beat and transcript display derivation so components remain presentational and do not duplicate sorting/speaker/phase logic.

**Done when:**
- `locationRoomPresentation.ts` exposes only the helpers needed for latest/current beat summary, stable transcript message/marker display items, same-speaker continuation detection, and the live rail’s single relative freshness label if existing helpers are insufficient.
- Helpers consume only `PublicLocationRoomRead` and public message/participant/gameplay shapes.
- Helpers reuse existing formatting, sorting, label, participant lookup, and gameplay lookup utilities.
- Empty message arrays return stable null/empty results.
- No public DTO, API route, repository, service, or hook changes are made.

**Key files:**
- `components/location-rooms/locationRoomPresentation.ts`

**Dependencies:** None

**Size:** M

### Item 2 — Redesign the page shell, header, and live status rail
**Goal:** Replace the heavy fact-grid header with a spectator-oriented hierarchy that explains the location and current room state without crowding the transcript.

**Done when:**
- `LocationRoomWatchPage` header contains the `/map` link, location title, short read-only watcher copy, alias/canonical chip when relevant, refresh button, an initial follow/latest control, and compact live status rail.
- Rail-level freshness is limited to one viewer-friendly relative label. Detailed freshness — latest message time, generated time, fetched time, last tick, and turn count — lives in the awareness panel.
- Public passive-refresh errors with existing data appear as compact warning state in the rail or nearby, not a dominant transcript-blocking alert.
- Initial loading, no-data, hard error/retry, and empty transcript states remain available and readable.
- No management controls are introduced.

**Key files:**
- `components/location-rooms/LocationRoomWatchPage.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Item 1

**Size:** M

### Item 3 — Make follow-latest and new-activity behavior explicit
**Goal:** Improve leave-open spectator behavior without changing polling, pagination, API ordering, or backend reads.

**Done when:**
- `LocationRoomWatchPage` tracks following vs paused, last seen sequence, and pending latest sequence.
- When following, a new latest sequence scrolls to the transcript end, updates last seen, and clears pending activity.
- When paused, a new latest sequence does not scroll and shows a “New activity — jump to latest” affordance.
- Clicking the paused/new-activity affordance resumes following, scrolls to latest, updates last seen, and clears pending state.
- Duplicate latest sequences do not create new activity.
- Tests cover following mode, paused mode, same-sequence refresh behavior, empty-message fallback, `activity.latestSequence` fallback to last message sequence, and mocked `scrollIntoView`.

**Key files:**
- `components/location-rooms/LocationRoomWatchPage.tsx`
- `components/location-rooms/EncounterTranscript.tsx`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Item 2

**Size:** M

### Item 4 — Add compact latest/current-beat orientation
**Goal:** Give spectators immediate “what just happened?” context while keeping the page feeling like a live chatroom/watch room rather than a dashboard.

**Done when:**
- A compact current-beat/latest-message affordance appears when at least one public message exists and renders nothing for an empty transcript. This is a V1 requirement, but it should be visually compact and integrated with the live room/feed.
- It previews the latest public message using public fields only: speaker, sequence, message label/domain/phase, time, and concise content.
- It optionally summarizes public structured roll outcome when `gameplayRolls` exists.
- It includes a read-only jump-to-latest control wired to the same local scroll behavior as follow-latest.
- It can be implemented as `CurrentBeatPanel.tsx` or as an inline/pinned section in `LocationRoomWatchPage`, whichever better preserves the chatroom feel.
- It does not render adventure choices, manual trigger controls, staking controls, or private data.

**Key files:**
- `components/location-rooms/CurrentBeatPanel.tsx` (optional new component)
- `components/location-rooms/LocationRoomWatchPage.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Items 1–3

**Size:** M

### Item 5 — Improve transcript scanability and reduce repeated speaker chrome
**Goal:** Make chronological reading easier without changing transcript order or public message semantics.

**Done when:**
- `EncounterTranscript` renders stable display items instead of directly mapping raw sorted messages.
- Continuation styling and latest/new-activity markers make the stream easier to follow.
- Phase/domain dividers are deferred from V1 unless the implementation agent can add sparse major-beat separators without increasing visual noise.
- An inline new-activity marker appears before the first unseen message when the viewer is paused.
- `EncounterMessageCard` supports `isContinuation`; continuation messages reduce repeated avatar/name chrome but keep timestamp, sequence, labels, prose, and rolls readable.
- Latest message remains visibly marked.
- Structured roll rendering and legacy `Rolls:` fallback remain intact.
- GM messages still render as `Game Master`, never internal GM agent names.

**Key files:**
- `components/location-rooms/EncounterTranscript.tsx`
- `components/location-rooms/EncounterMessageCard.tsx`
- `components/location-rooms/StructuredRollPanel.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Items 1 and 3

**Size:** L

### Item 6 — Keep the awareness sidebar useful and sticky
**Goal:** Preserve the existing character/encounter sidebar’s utility while making it reliably available beside the live feed on desktop.

**Done when:**
- `EncounterStatusSidebar` remains the recognizable sidebar for room status, characters, monsters, rewards, and freshness/details.
- The sidebar is reliably sticky on desktop and does not scroll away while the transcript advances.
- Header/sidebar duplication is reduced where it distracts from the transcript.
- Character cards keep the useful current fields, including stats, but the implementation may visually tune density if needed.
- Missing stat fallback remains clear.
- Monsters and rewards render only when present.
- Desktop sidebar uses sticky positioning so it remains visible beside the transcript. On mobile, keep the transcript primary; show compact room/roster awareness near the top only if it does not push the feed too far down, and place detailed sidebar content below the feed or behind existing responsive stacking.
- No management actions are added.

**Key files:**
- `components/location-rooms/EncounterStatusSidebar.tsx`
- `components/location-rooms/locationRoomPresentation.ts`
- `tests/components/location-rooms/location-room-watch-page.test.tsx`

**Dependencies:** Item 2

**Size:** M

### Item 7 — Update focused regression coverage
**Goal:** Protect the redesigned watcher behavior and existing public constraints.

**Done when:**
- Tests confirm the hook is still called with page size 50 and passive refresh.
- Tests confirm `/map` link, alias/canonical identity, compact live status rail, current beat, follow/latest paused new-activity behavior, chronological transcript content, hidden internal GM names, structured rolls, legacy roll fallback, sidebar roster/status/stat fallback, loading/error/empty states, and absence of management controls.
- Tests stop depending on the removed header fact-grid placement.
- Existing backend public roll projection tests remain unchanged unless UI fixture shape updates require test fixture maintenance.

**Key files:**
- `tests/components/location-rooms/location-room-watch-page.test.tsx`
- `tests/components/map/staking-sidebar/components.test.tsx`

**Dependencies:** Items 2–6

**Size:** M

## Open Questions
- None blocking. Transcript phase/domain dividers are explicitly deferred from V1 unless they emerge as a low-risk polish during implementation; the core pass is the chatroom-like feed, follow/latest behavior, compact latest orientation, and sticky sidebar.

## References
- Screenshot supplied in the planning request.
- `docs/plans/location-encounter-watch-page-2026-05-24.md`
- `docs/reviews/location-encounter-watch-page-plan-critique-2026-05-24.md`
- `docs/plans/location-room-refactor-2026-05-30.md`
- `docs/reviews/location-room-refactor-plan-critique-2026-05-30.md`
