# Eliza Interactive D&D Game: Plan

## Goal
Build a simple D&D-style gameplay layer for WAGDIE Eliza characters by extending existing location-room narrative ticks. V1 should preserve high agent autonomy, use server-owned dice and rules validation, let the GM author encounters within balancing constraints, make death immediate in gameplay, and keep token burn/permadeath finality behind admin review.

## Background
- User decisions for this plan: extend existing location rooms; keep Eliza character agency high; make death immediate inside gameplay but admin-gated for token burn/canonical finality; let the GM author monsters/rewards through a structure/formula for balancing rather than unconstrained freeform generation.
- Existing location-room gameplay already runs as a queued tick pipeline: `POST /api/eliza/location-rooms/[locationId]/tick` calls `locationRoomService.requestTick(...)`, while scheduled sync calls `locationRoomService.runScheduledWorker()` (`app/api/eliza/location-rooms/[locationId]/tick/route.ts:19-34`, `app/api/sync/eliza-location-rooms/route.ts:29-42`).
- Location-room config gates include feature enablement, narrative enablement, transcript window, max ticks/run, tick interval, GM agent id, and narrative output limits (`lib/eliza/config.ts:149-193`; runtime validation in `lib/eliza/locationRooms/service.ts:158-180`).
- Core room/tick/message/participant types live in `lib/eliza/locationRooms/types.ts:1-184`; narrative state and beat types live in `lib/eliza/locationRooms/narrativeTypes.ts:3-69`.
- Participant eligibility excludes invalid/burned rows (`lib/eliza/locationRooms/membership.ts:87-109`), and speaker selection is deterministic/fair by prior public message count, oldest/never-spoken sequence, then token id (`lib/eliza/locationRooms/service.ts:118-151`).
- The current GM beat prompt receives room ids, tick id, selected speaker, eligible participants, recent public transcript, and private narrative state (`lib/eliza/locationRooms/gameMasterGenerator.ts:221-267`). The strict GM output contract includes `publicNarration`, `speakerInstruction`, `stateSummary`, `currentObjective`, `openThreads`, `featuredTokenIds`, and `selectedSpeakerTokenId` (`lib/eliza/locationRooms/gameMasterGenerator.ts:249-258`).
- GM output is normalized/validated for JSON shape, required fields, eligible token ids, and selected-speaker match (`lib/eliza/locationRooms/gameMasterGenerator.ts:121-190`). `GameMasterBeatGenerator` is the local extension interface (`lib/eliza/locationRooms/gameMasterGenerator.ts:269-271`).
- `DefaultLocationRoomNarrativeCoordinator.processTurn(...)` orchestrates persistent narrative state, idempotent beat creation, GM output generation/reuse, optional public GM narration, selected character generation, public message append, and state/beat completion (`lib/eliza/locationRooms/narrativeCoordinator.ts:126-261`).
- Public GM and character messages are persisted via `repository.appendMessage(...)`; GM narration uses `authorKind: 'game_master'`, and character responses use `authorKind: 'agent'` with narrative metadata (`lib/eliza/locationRooms/narrativeCoordinator.ts:177-244`). Public room reads intentionally expose simplified public fields only (`lib/eliza/locationRooms/service.ts:103-114`).
- Persistence extension points include `LocationRoomRepository` for rooms/ticks/messages (`lib/eliza/locationRooms/repository.ts:198-218`), `LocationRoomNarrativeRepository` for narrative state/beats (`lib/eliza/locationRooms/narrativeRepository.ts:130-143`), `LocationRoomMembershipRepository` for eligible participants (`lib/eliza/locationRooms/membership.ts:87-91`), and constructor-injected coordinators/generators in `LocationRoomService` (`lib/eliza/locationRooms/service.ts:182-190`).
- The local ElizaOS service is a separate package at `services/elizaos` with `@elizaos/core`, `@elizaos/server`, bootstrap, and Venice dependencies (`services/elizaos/package.json:1-18`). `services/elizaos/src/server.ts` starts an `AgentServer`, registers plugins, and registers the current spike character (`services/elizaos/src/server.ts:1-58`).
- The service currently registers `bootstrapPlugin`, `venicePlugin`, and a local `wagdieKnowledgePlugin` (`services/elizaos/src/server.ts:3-6`, `services/elizaos/src/server.ts:26-29`). The local plugin exposes authenticated `/wagdie-knowledge/index` and `/wagdie-knowledge/delete` routes (`services/elizaos/src/wagdie-knowledge-plugin.ts:344-365`), showing the repo’s current custom-plugin pattern.
- Next talks to Eliza through `lib/eliza/client.ts`, selected by `ELIZA_INTEGRATION_MODE` (`lib/eliza/client.ts:53-64`), with official service config in `lib/eliza/config.ts:58-122` and official adapter/session logic in `lib/eliza/official/client.ts:203-534` plus messaging transport in `lib/eliza/official/messaging.ts:55-170`.
- Official WAGDIE characters are mapped to ElizaOS agents by external token id and receive required plugins `@elizaos/plugin-bootstrap` and `@elizaos/plugin-venice` (`lib/eliza/official/client.ts:245-318`, `lib/eliza/official/client.ts:33-34`, `lib/eliza/official/client.ts:98-121`).
- Admin-managed GM prior art lives in `docs/plans/admin-game-master-agent-settings-2026-05-22.md`: admin settings take precedence over env fallback, use deterministic non-token external id, and manage persona/knowledge under `/admin` (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:45-68`). Runtime GM resolution uses admin-managed GM first, env fallback second (`docs/plans/admin-game-master-agent-settings-2026-05-22.md:137-154`).
- GM narrative prior art explicitly extends location rooms without replacing room/tick/transcript architecture (`docs/plans/game-master-narrative-agent-2026-05-22.md:5-11`) and defines structured GM beat generation with public narration, private speaker instruction, updated continuity, and strict validation (`docs/plans/game-master-narrative-agent-2026-05-22.md:142-161`).
- Location-room prior art says WAGDIE owns room identity, transcripts, tick state, visibility, and authorization while hosted ElizaOS generates turns (`docs/plans/elizaos-agent-location-rooms-2026-05-11.md:36-47`), and defines V1 room/tick/message schema and tick loop (`docs/plans/elizaos-agent-location-rooms-2026-05-11.md:49-106`, `docs/plans/elizaos-agent-location-rooms-2026-05-11.md:151-165`).
- Searing has a full on-chain transaction -> API sync -> materialization -> character read-model persistence path. UI calls `/api/characters/${wagdieId}/searing/sync` after chain success (`components/modals/SearingModal.tsx:153-177`), the sync route verifies transaction/hash/chain and calls materialization (`app/api/characters/[tokenId]/searing/sync/route.ts:20-49`), and the service writes `searing_events`, generated images, and character read-model fields (`lib/services/searing-materialization-service.ts:273-458`; `lib/repositories/character-materialization-repository.ts:105-149`).
- Corpse burning is currently client/on-chain only in this repo: `useCorpseBurning` exposes approval/balance/burn transaction flow (`hooks/useCorpseBurning.ts:20-232`), and `CorpseBurningModal` presents irreversible UX (`components/modals/CorpseBurningModal.tsx:20-203`), but no repo-local API/repository persists corpse-burn events directly.
- Admin review/publish patterns exist for irreversible/authoritative changes: lore submissions use admin-authenticated action routes (`app/api/admin/lore/submissions/[submissionId]/action-route.ts:21-32`) and conditional status transitions (`lib/services/lore-submissions/transitions.ts:8-108`); lore canonization uses draft-vs-published overrides and explicit publish/reset (`lib/services/lore-canonization-service.ts:19-123`).
- There is no explicit `permadeath` domain/service/repository flow yet. “Death” appears mostly as map/event-layer terminology, while permanent behavior is represented by searing materialization and irreversible burn UX.
- External ElizaOS 1.7.x plugin conventions: custom plugins export `Plugin` from `@elizaos/core` with arrays such as `actions`, `providers`, `services`, optional `init`, and default export; actions validate/execute commands and return `ActionResult`, providers inject current context, and services hold persistent lifecycle/state. Relevant docs: https://docs.elizaos.ai/plugins/components, https://docs.elizaos.ai/plugins/development, https://github.com/elizaOS/eliza. This repo pins ElizaOS-related packages around `1.7.2`.
- No substantive prior planning for rewards/loot/XP/points was found in `docs/plans`, `docs/investigations`, `docs/reviews`, `docs/architecture`, or `specs`; this plan introduces that domain.

## Approach

### Recommended V1 architecture
Add a targeted, additive gameplay branch on top of location-room ticks rather than refactoring room infrastructure. The existing room system already provides the right runtime surface: queued ticks, participant lookup, public transcript, retry semantics, GM integration, and admin-managed GM identity.

V1 should keep **one active encounter per location room**. This maps cleanly to current room/tick state, avoids party-splitting complexity, and is sufficient for scheduled or manually triggered public gameplay. Encounters require at least two living eligible characters to start; if an active encounter later drops below that threshold, the coordinator should resolve the encounter into `defeat`, `fled`, or `abandoned` rather than starting a new solo loop.

Gameplay enablement should have two gates: a disabled-by-default global config gate and a V1 per-location allowlist so rollout can enable one room without changing global behavior. A richer admin-managed gameplay settings UI can come later.

The gameplay branch should sit beside the existing narrative coordinator:

```text
LocationRoomService.processClaimedTickUnsafe(...)
  if gameplay.enabled:
    gameplayCoordinator.processTurn(...)
  else if narrative.enabled:
    narrativeCoordinator.processTurn(...)
  else:
    existing single-agent turn
```

Gameplay mode should require location rooms, official ElizaOS, narrative/GM configuration, and a resolvable admin-managed GM agent. Disabling gameplay must restore current narrative/non-narrative behavior without data migration.

### Gameplay state model
Introduce private gameplay state alongside existing narrative state. The implementation agent should own exact type names and table columns, but the V1 model needs these concepts:

- room gameplay state: room id, location id, status (`idle`, `active_encounter`, `aftermath`), active encounter id, character HP/status/XP/temporary boons/wounds;
- encounter state: encounter id, room id, location id, status (`active`, `victory`, `defeat`, `fled`, `abandoned`), difficulty, round number, monster state, and reward plan;
- turn state: tick id, encounter id, selected token id, structured agent action, dice results, mechanical deltas, public message ids, and lifecycle status;
- death review state: token id, encounter/turn context, gameplay death status, admin finality decision, and future burn-sync status if a token-specific burn path is added later.

Keep private gameplay mechanics out of public room reads. Public APIs should expose only additive summaries such as encounter status, round, visible character/monster status bands, and pending reward text.

### Gameplay tick sequence
A gameplay tick should proceed in phases:

1. Load room, participants, recent public transcript, narrative state, gameplay room state, and active encounter.
2. If no encounter exists and enough eligible living characters are present, ask the GM for an encounter proposal.
3. Validate and normalize the GM’s monster/reward proposal through backend balance rules, then persist the encounter.
4. Select a living gameplay participant using the existing deterministic speaker-balancing algorithm, filtered for gameplay eligibility.
5. Ask the selected Eliza character for a structured autonomous action plus public speech.
6. Parse and validate the action envelope before any mechanics resolve.
7. Roll dice and apply mechanical effects server-side.
8. Ask the GM to narrate the backend-computed outcome and update non-mechanical continuity.
9. Persist gameplay deltas, deaths, rewards, and turn state.
10. Append idempotent public transcript messages for GM setup/outcome narration and the selected character action.
11. Complete the tick and advance existing room scheduling.

The GM may set tone, stakes, encounter premise, monster flavor, and narration. The backend owns numeric mechanics, dice, HP/damage, death transitions, rewards, persistence, and validation.

### Dice and rules ownership
Add server-side dice and rules modules with injectable RNG for tests. The GM may request roll intent, target, and stakes, but final DCs, modifiers, success tiers, damage, death, and reward values must be derived or clamped by backend rules.

V1 action types should be small and legible defaults in the rules module: `attack`, `defend`, `help`, `investigate`, `negotiate`, `flee`, and `rest`. The implementation may represent them as constants/config inside `rules.ts`, but V1 should not let prompts invent new mechanical action types. The structured action envelope should include an action type, optional legal target, public speech, and an intent summary. Invalid JSON, unsupported action types, missing public speech, or illegal targets should fail before dice resolve. Raw roll metadata should remain private/admin-visible; public transcript text can mention outcomes without exposing full mechanical payloads.

### Balanced GM-generated monsters and rewards
The GM can propose encounter flavor, monster archetypes, goals, reward theme, and stakes. Backend rules validate or normalize all mechanics.

Recommended balancing shape:

```text
budget = partySize * baseBudgetByLevel[avgLevel] * difficultyMultiplier
```

Backend rules should clamp or derive monster count, total monster HP, AC, attack bonus, damage dice, DCs, XP, and reward budget. V1 constants should live in a dedicated rules module, not in prompts. Prefer normalization with stored metadata over hard failure when the proposal is structurally valid but outside bounds; hard-fail only malformed or unsafe proposals.

Rewards in V1 are gameplay-local only: XP, temporary boons, narrative rewards, and room-visible victory text. Do not write token metadata, searing materialization, mushroom balances, inventory, or on-chain state in V1.

### Gameplay death and admin-gated finality
Gameplay death is immediate in encounter state: when backend rules resolve a fatal outcome, mark the character gameplay-dead, exclude them from future gameplay speaker selection, and allow public death narration.

Canonical finality is separate and admin-gated. The system should create a pending death review when gameplay death occurs, but no route should automatically burn tokens or assume the current corpse-burning flow can finalize a specific character. Admin review outcomes should be explicit:

- `reject_death`: the gameplay death is treated as invalid and the character is restored to playable gameplay state through a recorded admin override;
- `gameplay_only`: the character remains gameplay-dead, but no canonical/token finality is pursued;
- `approve_finality`: the character remains gameplay-dead and is marked approved for a future token-specific finality/burn sync.

A future token-specific on-chain burn sync should be a separate follow-up after the finality domain exists.

### ElizaOS gameplay plugin
Create a small `wagdie-gameplay-plugin` as an enhancement, not the source of truth. It should help agents understand available actions, inject current game context vocabulary, and encourage structured action declarations. The Next backend remains authoritative for action validation, dice, mechanics, death, rewards, and persistence.

Do not add the custom plugin to `REQUIRED_WAGDIE_AGENT_PLUGINS` until the hosted ElizaOS service can resolve it for dynamically created token agents.

## Work Items

### Item 1 — Add gameplay config gates
**Goal:** Add disabled-by-default gameplay mode without changing current room behavior.

**Done when:**
- `elizaConfig.locationRooms.gameplay` includes global enablement, a V1 location allowlist, default difficulty, max encounter rounds, action/output length limits, dice visibility, and monster/reward budget settings.
- Gameplay mode validates that location rooms, official ElizaOS, narrative/GM configuration, and a resolvable GM agent are available.
- Disabled gameplay leaves existing narrative/non-narrative ticks unchanged.
- Rollout can enable exactly one location room before broader rollout.

**Key files:**
- `lib/eliza/config.ts`
- `lib/eliza/locationRooms/service.ts`
- `app/api/eliza/location-rooms/[locationId]/tick/route.ts`
- `app/api/sync/eliza-location-rooms/route.ts`

**Dependencies:** None

**Size:** S

### Item 2 — Create gameplay persistence schema
**Goal:** Persist gameplay room state, encounters, turns, dice results, rewards, and death reviews as additive service-role data.

**Done when:**
- A migration adds gameplay tables for room states, encounters, turns, and death reviews.
- Each gameplay turn is unique by `tick_id`.
- Each room has at most one active encounter.
- Death review rows are unique for an unresolved `(token_id, encounter_id)` pair.
- RLS mirrors existing location-room narrative tables: no direct anon/authenticated access.

**Key files:**
- New `supabase/migrations/*_create_location_room_gameplay.sql`
- `supabase/migrations/20260511000000_create_eliza_location_rooms.sql`
- `supabase/migrations/20260522000000_add_location_room_narrative.sql`

**Dependencies:** Item 1

**Size:** M

### Item 3 — Add gameplay domain types and repository
**Goal:** Provide typed gameplay access without leaking schema details into the coordinator.

**Done when:**
- Types cover room gameplay state, encounters, turns, actions, rolls, rewards, and death reviews.
- Repository methods can ensure room state, create/reuse a turn by tick, create an active encounter, update encounter and character state, persist dice/action/outcome data, and create pending death reviews idempotently.
- Stored errors are bounded/truncated consistently with narrative repository behavior.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/types.ts`
- New `lib/eliza/locationRooms/gameplay/repository.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`

**Dependencies:** Item 2

**Size:** M

### Item 4 — Add dice and rules modules
**Goal:** Make rolls, DCs, damage, monster stats, death, and rewards backend-authoritative.

**Done when:**
- Dice roller supports V1 formulas such as `d20`, `1d4`, `1d6`, `1d8`, and `2d6`.
- RNG is injectable for deterministic tests.
- Rules module exposes action validation, roll derivation, success tiers, damage calculation, HP/death transitions, encounter budget normalization, and reward normalization.
- GM-generated numeric proposals are clamped or rejected before persistence.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/dice.ts`
- New `lib/eliza/locationRooms/gameplay/rules.ts`

**Dependencies:** Item 3

**Size:** M

### Item 5 — Add balanced GM encounter and outcome generators
**Goal:** Let the GM propose encounters/rewards and narrate outcomes while backend rules constrain mechanics.

**Done when:**
- Encounter proposal prompts include room/location identity, participants, recent transcript, current narrative/gameplay state, requested difficulty, and budget.
- GM output includes encounter premise, monster flavor/archetypes, reward theme, and stakes.
- Backend normalizes all monster/reward mechanics through `rules.ts`.
- Outcome prompts receive selected action, server roll results, mechanical deltas, and prior encounter state.
- Outcome output narrates backend-computed results and may update non-mechanical continuity, but cannot directly assign HP, death, XP, or rewards.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/official/messaging.ts`
- `lib/eliza/gameMasterAgent/service.ts`

**Dependencies:** Items 3–4

**Size:** L

### Item 6 — Add autonomous character action generation
**Goal:** Let selected Eliza characters choose structured gameplay actions instead of only speaking.

**Done when:**
- New action generator resolves/starts the selected token’s official agent.
- Prompt includes public transcript, visible encounter state, character HP/status, available action types, and private GM instruction when available.
- Agent returns a structured action envelope plus public speech.
- Invalid action JSON, unsupported action type, missing public speech, or illegal target fails the turn before mechanics resolve.
- Existing `officialTurnGenerator.ts` remains unchanged for non-gameplay ticks.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/official/messaging.ts`

**Dependencies:** Items 4–5

**Size:** M

### Item 7 — Build gameplay coordinator and wire the tick loop
**Goal:** Orchestrate full D&D turns through existing location-room ticks.

**Done when:**
- `LocationRoomService` calls the gameplay coordinator when gameplay mode is enabled.
- The gameplay coordinator ensures gameplay state, starts encounters when needed, filters gameplay-dead characters from speaker selection, creates/reuses turns by tick, generates autonomous actions, rolls dice, applies deltas, creates death reviews, appends public transcript messages idempotently, and completes ticks.
- Retry after partial transcript append does not duplicate action/outcome messages.
- Existing narrative mode remains unchanged when gameplay is disabled.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/repository.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`

**Dependencies:** Items 3–6

**Size:** L

### Item 8 — Add public gameplay summaries to room reads
**Goal:** Make gameplay visible to visitors without exposing private mechanics or model metadata.

**Done when:**
- `GET /api/eliza/location-rooms/[locationId]` returns an optional `gameplay` summary with mode/status, encounter public title/status, round, visible character HP/status bands, visible monster HP/status bands, and pending reward summary.
- Public room messages expose only safe classification needed by UI, such as `gameplayMessageKind: 'gm_setup' | 'character_action' | 'gm_outcome'`, without exposing raw private metadata.
- Private GM JSON, private instructions, full dice metadata, and admin death review details remain hidden.
- Existing clients remain compatible if they ignore `gameplay` and optional message classification.

**Key files:**
- `lib/eliza/locationRooms/types.ts`
- `lib/eliza/locationRooms/service.ts`
- `app/api/eliza/location-rooms/[locationId]/route.ts`

**Dependencies:** Item 7

**Size:** M

### Item 9 — Add admin gameplay and death review APIs
**Goal:** Give admins visibility and finality control for gameplay deaths.

**Done when:**
- Admins can list pending death reviews.
- Admins can update death reviews with explicit outcomes: reject death and restore gameplay playability, keep death gameplay-only, or approve canonical finality intent.
- A lightweight room gameplay inspection endpoint can show current state and recent turns for debugging/admin context, but should stay read-only in V1.
- No route burns tokens automatically.
- Responses use the existing admin auth/shared-response style from admin Eliza routes where possible, no-store, and bounded errors.

**Key files:**
- New `app/api/admin/eliza/location-rooms/[locationId]/gameplay/route.ts`
- New `app/api/admin/eliza/gameplay/deaths/route.ts`
- New `app/api/admin/eliza/gameplay/deaths/[reviewId]/route.ts`
- `app/api/admin/eliza/game-master-agent/shared.ts`
- `app/api/admin/lore/submissions/[submissionId]/action-route.ts`
- `lib/services/lore-submissions/transitions.ts`
- `lib/services/lore-canonization-service.ts`

**Dependencies:** Items 2–7

**Size:** M

### Item 10 — Add optional ElizaOS gameplay plugin spike
**Goal:** Prove and then add a custom ElizaOS gameplay plugin that improves agent play without making the plugin authoritative or blocking backend validation.

**Done when:**
- A spike verifies where the plugin can run: local ElizaOS service only, hosted token agents, or both.
- Local ElizaOS service registers `wagdieGameplayPlugin` if supported.
- Plugin defines gameplay context/provider/action vocabulary for available actions and turn state.
- Backend action parser still validates all outputs and remains source of truth.
- `lib/eliza/official/client.ts` is touched only for guard/no-op checks unless hosted plugin support is confirmed; do not add the plugin to required token-agent plugins until hosted service support is verified.

**Key files:**
- New `services/elizaos/src/wagdie-gameplay-plugin.ts`
- `services/elizaos/src/server.ts`
- `services/elizaos/package.json`
- `lib/eliza/official/client.ts`

**Dependencies:** Item 6; can run after Item 8 if UI classification metadata is needed first

**Size:** M

### Item 11 — Add gameplay UI affordances
**Goal:** Make gameplay understandable in the existing room surface.

**Done when:**
- Room panel shows encounter status, living/dead character states, monster state, and rewards.
- Public transcript visually distinguishes GM setup, character action, and GM roll/outcome narration using the safe message classification exposed by room reads.
- Manual trigger copy becomes gameplay-aware when gameplay is enabled.
- Gameplay death is visible immediately but labeled as not yet canonical/token-final.

**Key files:**
- `components/map/staking-sidebar/LocationRoomPanel.tsx`
- `hooks/map/useLocationRoom.ts`
- `components/map/staking-sidebar/LocationTabs.tsx`

**Dependencies:** Item 8

**Size:** M

### Item 12 — Add tests and rollout checks
**Goal:** Verify gameplay is deterministic where required, retry-safe, private by default, and reversible by config.

**Done when:**
- Unit tests cover dice rolls with injected RNG, monster/reward normalization, action validation, death review creation, and dead-character speaker exclusion.
- Coordinator tests cover encounter start, successful action/roll/outcome turn, retry after partial append, victory reward assignment, and gameplay death.
- Route tests cover disabled behavior, config errors, public summary privacy, and admin death review auth.
- Existing location-room narrative tests still pass.
- Staging rollout starts with gameplay disabled globally, then enables the global gate plus a one-location allowlist.

**Key files:**
- New `tests/lib/eliza/location-room-gameplay-rules.test.ts`
- New `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- New `tests/api/admin/eliza/gameplay-deaths-routes.test.ts`
- Existing `tests/api/eliza/location-room-service.test.ts`
- Existing `tests/api/eliza/location-room-routes.test.ts`
- Existing GM narrative tests

**Dependencies:** Items 1–11

**Size:** L

## Orchestration Progress
- [x] Wave 1 — Foundation: Items 1–4 implemented (config gates, gameplay schema, domain/repository, dice/rules) and focused tests passed per agent report.
- [x] Wave 2 — Gameplay orchestration: Items 5–7 implemented (GM/action generators, gameplay coordinator, service wiring, keyed transcript dedupe) and targeted tests passed per agent report.
- [x] Wave 3 — Surfaces/plugin/UI: Items 8–11 implemented (public gameplay summary, admin death APIs, local gameplay plugin, room UI affordances) and targeted tests passed per agent reports.
- [x] Wave 4 — Tests and rollout checks: Item 12 implemented/verified (focused gameplay/API/UI/plugin tests passed; rollout remains disabled-by-default with one-location allowlist gating).

## Open Questions
- Which token-specific on-chain mechanism, if any, should later represent canonical permadeath? V1 deliberately stops at admin-approved finality intent and does not burn tokens automatically.
- Should V2 rewards graduate from gameplay-local XP/boons into durable character-sheet, inventory, or on-chain state? V1 deliberately avoids that commitment.

## References
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/game-master-narrative-agent-2026-05-22.md`
- `docs/plans/admin-game-master-agent-settings-2026-05-22.md`
- `docs/architecture/eliza-and-backend.md`
- `docs/architecture/map-and-phaser.md`
- ElizaOS plugin components: https://docs.elizaos.ai/plugins/components
- ElizaOS plugin development: https://docs.elizaos.ai/plugins/development
- ElizaOS GitHub: https://github.com/elizaOS/eliza
