# Admin Game Master Agent Settings: Plan

## Goal

Add an `/admin` surface where any admin wallet can create, edit, and manage the non-token-bound official ElizaOS game-master agent used by location-room narrative ticks, including persona updates and knowledge uploads.

The existing env var `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` should remain useful as deployment/default/fallback context, but admins need an in-app way to handle the GM agent through existing Eliza infrastructure rather than editing env files.

## Background

- User decision: the GM agent should use existing Eliza infrastructure but should not be bound to a WAGDIE token. Admins should be able to create/edit/update the agent and upload knowledge so the team can build a good GM agent over time.
- User decision: `/admin` is the desired surface. Env-only display is not enough for the final product; env can remain fallback/default context while admin tooling manages the runtime GM agent.
- Existing admin pages use `AdminGate` and `AdminShell`, with feature-specific routes linked from `/admin` overview cards and top nav (`components/admin/AdminGate.tsx:19`, `components/admin/AdminShell.tsx:10`, `components/admin/AdminNav.tsx:6`, `app/admin/page.tsx:5`).
- Admin APIs consistently use `requireAdmin()` / `isAuthError()` before service calls, then shared JSON response helpers (`lib/api/auth.ts:33`, `app/api/admin/lore/canonization/route.ts:7`, `app/api/admin/lore/submissions/[submissionId]/action-route.ts:25`).
- Client admin containers load no-store admin APIs and manage local loading/error/action state before `PATCH`/`POST`/`DELETE` mutations (`components/admin/lore-canonization/LoreCanonizationAdminContainer.tsx:49`, `components/admin/lore-canonization/LoreCanonizationAdminContainer.tsx:118`).
- Current GM narrative implementation reads `elizaConfig.locationRooms.narrative.gameMasterAgentId` from `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID`; the GM generator starts that official agent, creates a room-scoped transient session, sends the strict JSON beat prompt, then deletes the session (`lib/eliza/config.ts:169`, `lib/eliza/locationRooms/gameMasterGenerator.ts:281`, `lib/eliza/locationRooms/gameMasterGenerator.ts:286`, `lib/eliza/locationRooms/gameMasterGenerator.ts:289`).
- Narrative beats persist the `game_master_agent_id` used per tick, so changing the active GM agent later should not erase which agent produced historical beats (`lib/eliza/locationRooms/narrativeCoordinator.ts:132`, `lib/eliza/locationRooms/narrativeRepository.ts:228`).
- Existing admin narrative inspection is read-only at `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`; it uses admin auth and intentionally omits private speaker instructions/model metadata (`app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts:51`, `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts:58`).
- Token-bound persona routes resolve Eliza records by token `externalId`, authorize mutations via `authorizeElizaCharacterMutation(tokenId)`, then use `characters.createRecord()` / `characters.replaceRecord()` (`app/api/eliza/characters/[tokenId]/route.ts:51`, `app/api/eliza/characters/[tokenId]/route.ts:82`, `app/api/eliza/characters/[tokenId]/route.ts:145`, `app/api/eliza/characters/[tokenId]/route.ts:153`).
- Persona import/export and editing reuse mapper and policy utilities: `mergeAgentCharacter()`, `applyWagdieUpdateToAgentCharacter()`, `toAICharacterFromRecord()`, and `validatePutCharacterSheetUpdate()` (`lib/eliza/agent-character-mapper.ts:210`, `lib/eliza/agent-character-mapper.ts:260`, `lib/eliza/agent-character-mapper.ts:301`, `lib/eliza/character-sheet-policy.ts:359`).
- Knowledge management already stores documents on `character.knowledge`, accepts multipart uploads, and syncs/deletes documents in official mode through `syncKnowledgeDocumentToOfficial()` / `deleteKnowledgeDocumentFromOfficial()` (`app/api/eliza/characters/[tokenId]/knowledge/route.ts:82`, `app/api/eliza/characters/[tokenId]/knowledge/[documentId]/route.ts:78`, `lib/eliza/knowledge.ts:34`, `lib/eliza/knowledgeSync.ts:121`, `lib/eliza/knowledgeSync.ts:219`).
- Existing character AI editor UI is token-owner oriented: `AIPersonaTab` uses `useAICharacter`, `useAIPersonaEditor`, and `useKnowledgeUpload`; the Advanced tab hosts `KnowledgeEditor` (`components/characters/ai-editor/AIPersonaTab.tsx:45`, `components/characters/ai-editor/AIPersonaTab.tsx:61`, `components/characters/ai-editor/AIPersonaTab.tsx:64`, `components/characters/ai-editor/tabs/AdvancedTab.tsx:99`).
- Prior art: `docs/plans/official-eliza-package-migration-2026-05-10.md` keeps WAGDIE canonical for persona/knowledge data while integrating official ElizaOS behind stable `/api/eliza/*` routes.
- Prior art: `docs/plans/admin-panel-workflows-2026-05-09.md` establishes `/admin` as the operational surface and uses draft/publish semantics for admin-managed runtime data rather than static-file edits.
- Prior art/current work: `docs/plans/game-master-narrative-agent-2026-05-22.md` introduced the GM narrative runtime and deliberately chose a non-token-backed admin-managed service GM agent.

## Approach

Add a targeted `/admin/game-master-agent` workflow backed by a small service-agent domain layer. The active runtime GM agent should resolve from admin-managed settings first, then fall back to `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` only when no admin-managed agent exists. Admins can bootstrap the GM agent, edit its persona, upload/delete/sync knowledge, and inspect which source is active.

Do not refactor token-bound character personas into a generic system. The existing token persona routes and hooks are shaped around numeric token ids and token-owner authorization; the GM agent needs admin authorization, a stable service-agent identity, and no WAGDIE token binding. Reuse mapper, validation, editor, and knowledge helper primitives where they fit, but build admin/service-agent routes and hooks explicitly.

### Key decisions

- **Use a DB setting as the product path.** A single active setting row points to the official ElizaOS GM agent id. Env remains bootstrap/fallback, not the normal admin edit surface.
- **Use a stable non-token external id for created agents.** Created GM agents should use a deterministic external id such as `wagdie:service:location-room-game-master`, not a numeric token external id.
- **Adopt env safely without rewriting identity.** Treat `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` as an official record/agent id. If it resolves, persist it as `env_adopted` and preserve its existing official identity/external id as-is; do not backfill or overwrite the deterministic service external id during adoption.
- **Keep historical provenance.** Narrative beats already store `game_master_agent_id`; rotating the active setting affects future ticks only.
- **Use a parallel service-agent knowledge sync table.** Existing `eliza_knowledge_sync_states` is token/document keyed; extending it for a non-token service agent would blur semantics and risk token knowledge regressions. V1 GM knowledge uploads should support `.txt` and `.md` only, matching the current `KnowledgeEditor` UI.
- **Prefer editor component reuse over container reuse.** Reuse low-level persona and knowledge editor pieces where practical, but create admin-specific data hooks/routes rather than forcing `AIPersonaTab`, `useAICharacter`, or `useKnowledgeUpload` through fake token ids.

## Work Items

## Implementation Progress

- [x] Foundation/runtime slice: Items 1–3. Implemented by session `520CDEE0-19CA-4B6D-850E-78181A33E9B8`; focused service/generator/coordinator tests passed. Full typecheck remains blocked by unrelated existing errors.
- [x] Admin API slice: Item 4. Implemented by session `182A4F3A-CDEB-47D0-89BF-CFF58704F872`; focused service/API tests passed. Full typecheck remains blocked by unrelated existing errors.
- [x] Admin UI slice: Item 5. Implemented by session `C43472EE-8649-4840-89C6-061E4B2118CE`; focused admin UI component tests passed. Full lint remains blocked by unrelated existing errors.
- [x] Verification slice: Item 6. Implemented by session `7A23E1C4-A718-4E47-9746-77DCE9E1AF99`; focused GM/admin/runtime and token-bound regression suites passed; production build passed. Repo-wide lint/typecheck remain blocked by unrelated existing errors.

### Item 1 — Add GM agent settings and service-agent knowledge schema

**Goal:** Create durable admin-managed state for the active GM agent and official knowledge sync records that are not tied to token ids.

**Done when:**

- A migration adds `eliza_game_master_agent_settings` with a single allowed `setting_key` such as `location-room-game-master`, `official_agent_id`, optional `external_id`, `source`, `created_by`, `updated_by`, validation/error timestamps, and updated-at handling.
- The settings table is service-role only and follows existing Supabase/RLS conventions for sensitive Eliza operational state.
- A migration adds `eliza_service_agent_knowledge_sync_states` keyed by `(service_agent_key, document_id)` with official memory id, content hash, source pointer, sync status, errors, timestamps, and a deleted marker if delete/retry flows need it in V1.
- Existing token-bound `eliza_knowledge_sync_states` behavior is not changed.

**Key files:**

- New `supabase/migrations/*_create_eliza_game_master_agent_settings.sql`
- `supabase/migrations/20260510010000_create_eliza_knowledge_sync_states.sql`
- `supabase/migrations/20260522000000_add_location_room_narrative.sql`

**Dependencies:** Current GM narrative migration and official knowledge sync migration.

**Size:** M

### Item 2 — Add a GM service-agent domain module

**Goal:** Encapsulate active GM agent resolution, bootstrap/adoption, persona update, and knowledge sync behind admin-safe service functions.

**Done when:**

- New constants define the service agent key, deterministic GM external id, and default GM display name.
- A repository can read/upsert/clear the active GM settings row with service-role Supabase access.
- A service can resolve the effective runtime agent id with precedence: DB setting → env fallback → missing config error.
- A bootstrap operation is idempotent: return existing DB setting; otherwise treat env fallback as an official agent/record id and adopt it exactly if resolvable; otherwise find/create the deterministic official service agent by `GAME_MASTER_AGENT_EXTERNAL_ID`; then persist the active setting.
- Persona update uses existing Eliza character gateway/mapping/policy utilities where applicable, but is admin-authorized and service-agent keyed rather than token-owner authorized.
- The service uses `createOfficialServerClient()` / official character APIs for this explicitly official, non-token-bound agent instead of routing through user-scoped or token-oriented clients.
- Knowledge helpers reuse record-level functions such as `getKnowledgeDocuments()`, `appendKnowledgeDocument()`, `removeKnowledgeDocumentById()`, and `replaceKnowledgeDocuments()`, but not token lookup or token-keyed sync repositories.
- GM knowledge sync writes a source pointer that includes `serviceAgentKey`, `officialAgentId`, `documentId`, and content hash. Upload/update sync should write embedded knowledge before indexing, mark sync `error` on upstream failure without losing the embedded document, and retry should re-index the current embedded document content/hash. Delete should attempt upstream deletion when a synced memory id exists, then remove embedded knowledge and mark deleted/error according to the outcome.

**Key files:**

- New `lib/eliza/gameMasterAgent/constants.ts`
- New `lib/eliza/gameMasterAgent/repository.ts`
- New `lib/eliza/gameMasterAgent/service.ts`
- `lib/eliza/client.ts`
- `lib/eliza/gateway/types.ts`
- `lib/eliza/agent-character-mapper.ts`
- `lib/eliza/character-sheet-policy.ts`
- `lib/eliza/knowledge.ts`
- `lib/eliza/knowledgeSync.ts`
- `lib/eliza/official/knowledge-client.ts`

**Dependencies:** Item 1.

**Size:** L

### Item 3 — Wire runtime GM resolution to admin settings

**Goal:** Make location-room narrative ticks use the admin-managed GM agent when present while preserving env fallback and current operational errors.

**Done when:**

- `gameMasterGenerator` no longer reads `elizaConfig.locationRooms.narrative.gameMasterAgentId` directly; it receives the effective official GM agent id as input.
- `narrativeCoordinator` resolves the effective GM agent id once per narrative tick before creating/reusing a beat, stores that id on the beat, and passes the same id into generation. Do not add caching in V1; a per-tick DB lookup keeps admin rotations simple and can be optimized later if it becomes hot.
- `LocationRoomService` narrative config validation becomes async where narrative mode is enabled, accepts either admin-managed setting or env fallback, and produces a clear 503-style error when neither exists.
- Existing behavior remains unchanged when narrative mode is disabled.
- Historical beat provenance remains intact when the active GM setting changes.

**Key files:**

- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/narrativeRepository.ts`
- `lib/eliza/config.ts`

**Dependencies:** Items 1 and 2.

**Size:** M

### Item 4 — Add admin GM agent APIs

**Goal:** Provide admin-only API routes for viewing, bootstrapping, editing, clearing, and managing knowledge for the GM agent.

**Done when:**

- `GET /api/admin/eliza/game-master-agent` returns no-store state including effective source (`admin`, `env`, or `missing`), env fallback id presence, active setting, editable `AICharacter` DTO when available, knowledge summaries, and sync statuses.
- `POST /api/admin/eliza/game-master-agent` idempotently bootstraps/adopts/creates the GM agent and returns the same state shape.
- `PATCH /api/admin/eliza/game-master-agent` updates persona fields for the active GM agent; if no active setting exists, it returns a `409` instructing admins to create/adopt first.
- `DELETE /api/admin/eliza/game-master-agent` clears only the DB setting and never deletes the official ElizaOS agent; runtime falls back to env if available.
- Knowledge routes support `.txt`/`.md` upload, delete, and retry sync for GM knowledge documents without exposing provider secrets or raw upstream errors.
- `GET` merges embedded `character.knowledge` documents with service-agent sync rows by `documentId`; embedded documents are the source of truth for title/content, and sync rows add indexing status/error/timestamps.
- All routes use `requireAdmin()`, no-store responses, bounded error messages, and existing file size constraints.

**Key files:**

- New `app/api/admin/eliza/game-master-agent/route.ts`
- New `app/api/admin/eliza/game-master-agent/knowledge/route.ts`
- New `app/api/admin/eliza/game-master-agent/knowledge/[documentId]/route.ts`
- New `app/api/admin/eliza/game-master-agent/knowledge/[documentId]/sync/route.ts`
- `lib/api/auth.ts`
- `lib/api/responses.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/narrative/route.ts`
- `app/api/eliza/characters/[tokenId]/knowledge/route.ts`

**Dependencies:** Items 1 and 2.

**Size:** L

### Item 5 — Add `/admin/game-master-agent` UI

**Goal:** Give admins a usable product surface for creating/adopting the GM agent, editing persona fields, managing knowledge, and seeing runtime source/fallback status.

**Done when:**

- `/admin` overview and `AdminNav` include a GM Agent entry.
- `app/admin/game-master-agent/page.tsx` uses `AdminGate` and `AdminShell` with a feature container.
- The admin container loads `GET /api/admin/eliza/game-master-agent` with no-store semantics, shows env fallback/admin setting status, and offers a create/adopt action when no DB setting exists.
- The persona editor supports the GM agent fields needed to build a useful GM, using existing validation/editor components where practical; implementation owns the exact component split after inspecting reuse boundaries.
- The knowledge panel uploads/deletes `.txt`/`.md` GM knowledge documents and shows sync status/retry affordances.
- The UI does not imply the GM agent is token-owned and does not expose ElizaOS API keys, private sessions, or narrative beat private instructions.

**Key files:**

- `app/admin/page.tsx`
- `components/admin/AdminNav.tsx`
- New `app/admin/game-master-agent/page.tsx`
- New `components/admin/game-master-agent/*` admin container/form/panel components
- `components/characters/ai-editor/editors/KnowledgeEditor.tsx`
- `components/characters/ai-editor/SystemPromptEditor.tsx`
- `components/characters/ai-editor/tabs/AdvancedTab.tsx`
- `hooks/useAIPersonaEditor.ts`

**Dependencies:** Item 4.

**Size:** L

### Item 6 — Tests and rollout checks

**Goal:** Verify admin management works without regressing token-bound personas, GM narrative runtime, or knowledge sync.

**Done when:**

- Priority 1: repository/service tests cover DB setting precedence, exact env adoption, deterministic creation, clearing to env fallback, missing-agent errors, and service-agent knowledge sync status merging.
- Priority 2: runtime and route tests cover admin-managed id precedence over env fallback, beat provenance after rotation, require-admin behavior, no-store responses, bootstrap, persona update, clear, `.txt`/`.md` knowledge upload/delete/retry, and bounded upstream errors.
- Priority 3: UI tests cover nav/card presence, create/adopt empty state, persona save, knowledge upload/delete/retry states, and source/fallback status display.
- Existing token-bound persona/knowledge tests and focused GM narrative generator/coordinator tests still pass after runtime resolution changes.

**Key files:**

- New `tests/lib/eliza/game-master-agent-service.test.ts`
- New `tests/api/admin/eliza/game-master-agent-routes.test.ts`
- New `tests/components/admin/game-master-agent.test.tsx`
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- `tests/lib/eliza/location-room-narrative-coordinator.test.ts`
- `tests/hooks/useKnowledgeUpload.test.ts`

**Dependencies:** Items 1–5.

**Size:** M

## Open Questions

- Should V1 expose import/export JSON for the GM persona, or is in-app editing plus `.txt`/`.md` knowledge upload sufficient for the first admin release?

## References

- `docs/plans/game-master-narrative-agent-2026-05-22.md`
- `docs/plans/official-eliza-package-migration-2026-05-10.md`
- `docs/plans/admin-panel-workflows-2026-05-09.md`
- `app/admin/page.tsx`
- `components/admin/AdminGate.tsx`
- `components/admin/AdminShell.tsx`
- `components/admin/AdminNav.tsx`
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `app/api/eliza/characters/[tokenId]/route.ts`
- `app/api/eliza/characters/[tokenId]/knowledge/route.ts`
- `components/characters/ai-editor/AIPersonaTab.tsx`
