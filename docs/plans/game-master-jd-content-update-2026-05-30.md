# Game Master JD Content Update: Plan

## Goal
Plan a hybrid, repo-canonical plus admin-live workflow for updating the JD/game-master content that shapes WAGDIE location-room narrative generation. This covers both service-agent persona/system content and synced GM knowledge documents while preserving strict runtime contracts, Official ElizaOS sync behavior, admin authentication boundaries, and no-public-fallback guarantees.

## Background
- User direction: cover both GM persona prompts and GM knowledge documents; assume a hybrid source-of-truth model where canonical content can live in the repo but remains reviewable/syncable through the existing admin/live path; choose the safer rollout posture from the code seams.
- Admin entry point is `/admin/game-master-agent`: `app/admin/game-master-agent/page.tsx:5` mounts `GameMasterAgentAdminContainer`, and page copy scopes the tool to creating/adopting the official GM agent, tuning persona, and managing `.txt/.md` knowledge at `app/admin/game-master-agent/page.tsx:13-17`.
- Admin UI calls `API_ROOT = '/api/admin/eliza/game-master-agent'` in `components/admin/game-master-agent/GameMasterAgentAdminContainer.tsx:10`; it fetches state, bootstraps/adopts, clears settings, saves persona, uploads knowledge, deletes knowledge, and retries sync across `components/admin/game-master-agent/GameMasterAgentAdminContainer.tsx:101-226`.
- Persona authoring currently edits `name`, `username`, `backstory`, `systemPrompt`, `bio`, `lore`, `topics`, `adjectives`, and `style` via `components/admin/game-master-agent/GameMasterAgentPersonaForm.tsx:20-32`; update payload cleanup and `FIELD_LIMITS` slicing happen in `components/admin/game-master-agent/GameMasterAgentPersonaForm.tsx:47-89`.
- Knowledge authoring currently accepts `.txt`/`.md`, enforces max size, and displays sync states (`pending`, `indexed`, `deleted`, `error`, `unsynced`) in `components/admin/game-master-agent/GameMasterAgentKnowledgePanel.tsx:20-32`, `:47-80`, and `:184-191`.
- Admin routes require `requireAdminNoStore()` before work: main route in `app/api/admin/eliza/game-master-agent/route.ts:12-14`, knowledge upload/list in `app/api/admin/eliza/game-master-agent/knowledge/route.ts:13-15`, document delete in `app/api/admin/eliza/game-master-agent/knowledge/[documentId]/route.ts:17-19`, retry sync in `app/api/admin/eliza/game-master-agent/knowledge/[documentId]/sync/route.ts:16-18`.
- `PATCH /api/admin/eliza/game-master-agent` parses JSON and calls `gameMasterAgentService.updateActiveGameMasterPersona(body, auth.address)` at `app/api/admin/eliza/game-master-agent/route.ts:33-57`; knowledge upload parses multipart file content and calls `uploadGameMasterKnowledgeDocument({ filename, mimeType, content })` in `app/api/admin/eliza/game-master-agent/knowledge/route.ts:24-53`.
- Runtime GM identity resolves through `resolveActiveGameMasterAgent()` with DB setting first, env fallback second, and missing last in `lib/eliza/gameMasterAgent/service.ts:274-304`; `resolveRuntimeGameMasterAgentId()` validates the official record and self-heals missing DB-backed records in `lib/eliza/gameMasterAgent/service.ts:306-327`.
- Default bootstrapped GM persona content lives in `buildDefaultGameMasterCharacter()` at `lib/eliza/gameMasterAgent/service.ts:143-187`; a static ElizaOS service character mirrors the same concept in `services/elizaos/src/characters/wagdie-game-master-character.ts:1-84`. This duplication is the clearest drift seam.
- Persona updates validate with `validatePutCharacterSheetUpdate`, merge with `applyWagdieUpdateToAgentCharacter`, replace the Official Eliza character record, and mark setting source as `admin` in `lib/eliza/gameMasterAgent/service.ts:489-518`.
- GM knowledge documents are embedded on the Official character record via `character.knowledge`: reading/writing helpers live in `lib/eliza/knowledge.ts:34-42` and `:104-114`; uploads append the embedded document and immediately call sync in `lib/eliza/gameMasterAgent/service.ts:528-554`.
- Knowledge sync hashes content, upserts `pending`, calls Official ElizaOS indexing, then upserts `indexed` or records an error in `lib/eliza/gameMasterAgent/service.ts:594-664`; deletion removes from the Official index before removing the embedded document in `lib/eliza/gameMasterAgent/service.ts:570-592` and `:666-716`.
- Sync state persists in `eliza_service_agent_knowledge_sync_states` with statuses `pending | indexed | deleted | error` (`lib/eliza/gameMasterAgent/repository.ts:4-37`, `:197-264`); admin setting persists in `eliza_game_master_agent_settings` (`lib/eliza/gameMasterAgent/repository.ts:90`, `:189-230`).
- Official knowledge transport is isolated behind `lib/eliza/official/knowledge-client.ts:1-179`; indexing uses `/wagdie-knowledge/index`, deletion uses `/wagdie-knowledge/delete`, and payloads include `serviceAgentKey`, `documentId`, `officialAgentId`, `path`, `content`, `contentHash`, and `sourcePointer`.
- Location-room ticks require a resolvable GM when narrative/gameplay modes need one: feature gate at `lib/eliza/locationRooms/service.ts:488-505`, gameplay gate at `lib/eliza/locationRooms/service.ts:507-532`, manual tick route error mapping at `app/api/eliza/location-rooms/[locationId]/tick/route.ts:49-63` and `:103-105`.
- Runtime narrative flow selects a speaker and calls `narrativeCoordinator.processTurn()` in `lib/eliza/locationRooms/service.ts:1707-1765`; combat/gameplay routing happens first in `lib/eliza/locationRooms/service.ts:1515-1704`.
- Runtime does not manually inject GM knowledge into local prompts. `OfficialGameMasterBeatGenerator` sends `buildGameMasterBeatPrompt(input)` to an ephemeral Official ElizaOS session for the resolved GM agent at `lib/eliza/locationRooms/gameMasterGenerator.ts:2014-2047`; indexed GM knowledge retrieval, if used, happens inside Official ElizaOS.
- GM output is still constrained locally by strict schemas and validators: `GameMasterBeatOutput` is defined at `lib/eliza/locationRooms/gameMasterGenerator.ts:93-126`; contract lines are built at `:1111-1163`; prompt assembly is at `:1253-1318`; progression validation is at `:587-688`; normalization/parsing is at `:873-953`; repair path is at `:2063-2149`.
- Narrative coordinator persists GM output, merges `adventurePatch`, appends public GM narration when allowed, passes GM context into character generation, and updates private state across `lib/eliza/locationRooms/narrativeCoordinator.ts:865-1499`; character prompt context mapping is at `:656-682`.
- Scene checks and combat handoffs are content-sensitive but schema-bound: scene-check request contract at `lib/eliza/locationRooms/gameMasterGenerator.ts:1104-1108`, scene-check outcome generation at `:2180-2327`, combat readiness validation at `:672-688`, combat trigger marker at `lib/eliza/locationRooms/narrativeCoordinator.ts:1068-1071`, and later auto-tick promotion at `lib/eliza/locationRooms/service.ts:1580-1595`.
- Relevant prior plans: `docs/plans/elizaos-agent-location-rooms-2026-05-11.md` defines canonical WAGDIE room/tick ownership and public/internal transcript rules; `docs/plans/game-master-narrative-agent-2026-05-22.md` adds the GM layer, strict JSON contracts, public `game_master` narration, no direct canon mutation, and idempotent coordinator behavior; `docs/plans/admin-game-master-agent-settings-2026-05-22.md` adds admin-managed GM persona and service-agent-keyed knowledge sync.
- Later prior art tightens behavior: `docs/plans/gm-narrative-optimization-2026-05-26.md` introduces richer TTRPG cadence, scene-check diversity, spatial continuity, adventure memory, and quality gates; `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md` requires Official GM output rather than deterministic public fallback; `docs/plans/no-fallback-narration-quality-2026-05-30.md` extends no-public-fallback policy; `docs/plans/location-room-refactor-2026-05-30.md` asks future work to preserve interface/default implementation seams and strict generation-contract behavior.
- Recent relevant commits from prior-art scan: `809af6bf` baseline public staked-character location rooms; `67636619` plan GM narrative optimization; `c3ccd7cc` add GM cadence and spatial memory; `dec5f299` improve scene check diversity and consequences; `56307a6c` add GM narrative quality gates; `9d6f774c` add GM narrative quality evaluation; `4c62e898` require ElizaOS GM output; `f9262b46` improve ElizaOS GM output reliability; `6d384b17` improve Eliza narrative generation; `ca697e72` improve narrative quality and chat recovery.

## Approach
Add a repo-canonical GM content bundle for WAGDIE location rooms, covering both service-agent persona/system fields and synced GM knowledge documents. Then expose admin-only preview/apply controls that push that bundle into the existing live Official ElizaOS GM agent.

The plan should **not** change runtime generation or inject repo files directly into prompts. Location-room ticks should continue resolving the active Official GM agent through `GameMasterAgentService`, using Official indexed knowledge and the current strict JSON validation, repair, and no-public-fallback behavior.

### 1. Use a hybrid source of truth
- **Repo canonical content** defines intended persona/system fields and canonical GM knowledge documents.
- **Official ElizaOS live state remains runtime state** and is what location-room ticks use.
- **Admin applies/syncs repo content into live state** after preview.
- Runtime prompt assembly in `lib/eliza/locationRooms/gameMasterGenerator.ts` remains unchanged.

This keeps file I/O and content-version branching out of the tick path, where failures become public product risk.

### 2. Add a repo-canonical content package
Add a repo-canonical content package under `lib/eliza/gameMasterAgent/`, with `canonicalContent.ts` as the likely manifest/export point. The implementation may use a pure TypeScript bundle, imported markdown constants, or a small manifest plus bundled content modules, but it must avoid runtime `fs` reads in the location-room tick path.

The package should export a versioned content bundle with:
- `schemaVersion`
- `bundleId`
- `contentVersion`
- `persona`
- `knowledge[]`

The persona should consolidate existing default/static GM persona text from `lib/eliza/gameMasterAgent/service.ts:143-187` and `services/elizaos/src/characters/wagdie-game-master-character.ts:1-84`. Canonical knowledge documents should have deterministic IDs, titles, `.md`/`.txt` paths, MIME intent, and content.

If final JD/persona/knowledge copy is not available during implementation, build the canonical structure and seed only from existing GM/default content. Do not invent new JD lore. Final content can then be added as a content-only revision and applied through the same review/sync flow.

Required invariants:
- Canonical document IDs are stable across content edits.
- Paths pass existing `.txt`/`.md` validation.
- Each doc is `<= FIELD_LIMITS.maxKnowledgeSize`.
- Canonical docs plus preserved live docs do not exceed `FIELD_LIMITS.maxKnowledgeDocs`.
- Runtime location-room code does not read the bundle directly.
- `services/elizaos/src/characters/wagdie-game-master-character.ts` either imports/adapts the canonical package if its build allows it, or remains a compatibility export covered by a parity test.

### 3. Add canonical review/diff primitives
Add `lib/eliza/gameMasterAgent/canonicalReview.ts` as a pure comparison layer that computes repo-vs-live drift without mutating Official ElizaOS. It should produce a `GameMasterCanonicalContentReview` containing:
- bundle/version metadata;
- a stale-preview protection token;
- persona status, hashes, changed fields, and last-applied metadata;
- knowledge status, document previews, hashes, live status, sync status, and document-limit conflicts.

The `reviewToken` should be precise enough to avoid both silent overwrites and unnecessary conflicts. Hash these inputs:
- canonical `bundleId`, `contentVersion`, persona hash, and canonical doc `id/path/contentHash` set;
- active setting identity/source and update timestamp if available;
- Official record ID and update timestamp if available;
- normalized live persona fields covered by the canonical persona;
- all live embedded knowledge document IDs plus canonical-doc live `path/contentHash`, so a new admin upload that affects document limits invalidates stale previews;
- canonical apply metadata recorded in setting JSONB.

Do not include raw upstream error text in the token inputs. Apply requests must include the token so admin edits made after preview are not silently overwritten.

### 4. Extend `GameMasterAgentService`, not runtime generation
Add service methods on `GameMasterAgentService`:
- `getCanonicalGameMasterContentReview()`
- `applyCanonicalGameMasterContent({ persona?, knowledge?, expectedReviewToken }, actor?)`

Service behavior should reuse existing mutation paths:
- Persona apply validates through the current character update policy, merges with current Official character data, replaces the Official record, and records canonical metadata in the existing setting JSONB metadata.
- Knowledge apply upserts canonical docs by deterministic ID into embedded `character.knowledge`, preserves non-canonical admin-uploaded docs, fails before write if document limits would be exceeded, then syncs changed/missing/error/deleted/unsynced canonical docs through existing Official indexing.
- Repo-removed canonical docs are not auto-deleted in V1. If a live document can be identified as previously repo-canonical but no longer exists in the current bundle, review should flag it as obsolete/preserved and leave deletion to an explicit admin action using the existing knowledge delete flow.
- Sync failures should preserve embedded docs and record per-doc sync errors. They should return a partial-failure result rather than throwing unless the embedded write itself failed.
- Index changed docs in a deterministic, low-load order. Serial sync is the safe default; bounded concurrency is acceptable if the implementation confirms Official ElizaOS ordering/rate behavior does not matter.
- Env fallback records should not be mutated unless they have been adopted into the DB-backed admin setting.

No DB migration is expected: existing `metadata JSONB` and `source_pointer JSONB` can hold canonical apply metadata.

### 5. Add admin-first preview/apply surface
Extend admin state with `canonicalContent`, then add `POST /api/admin/eliza/game-master-agent/canonical/apply` as the primary mutation path. A small operator script/helper may also be added later if non-UI rollout is required, but it should call the same service methods rather than bypassing admin/service semantics.

The route must:
- use `requireAdminNoStore()`;
- parse and validate JSON;
- require `expectedReviewToken` and at least one of `persona` or `knowledge`;
- return refreshed state plus a sanitized apply result;
- map stale preview conflicts to `409`;
- avoid exposing raw Official/provider errors.

Add a `GameMasterAgentCanonicalContentPanel` under the existing admin container. It should show bundle version, persona drift, changed fields, canonical docs, live status, and sync status. It should apply persona and knowledge independently, disabled when the active setting or Official record is unavailable, persona edits are dirty, review token is missing, knowledge would exceed limits, or any busy action is in progress.

### 6. Keep runtime contracts unchanged
Do not broaden this work into `LocationRoomService`, `DefaultLocationRoomNarrativeCoordinator`, or `OfficialGameMasterBeatGenerator` behavior changes. Tests may need import/type updates, but the plan intentionally keeps runtime generation semantics stable:
- active GM ID still resolves through `GameMasterAgentService`;
- Official ElizaOS remains the generation/retrieval surface;
- strict local schemas still gate public output;
- fallback text is not introduced as successful GM narration.

## Work Items

### Item 1 — Add repo-canonical GM content bundle
**Goal:** Establish a single repo-canonical content package for GM persona/system fields and canonical knowledge documents.

**Done when:**
- `lib/eliza/gameMasterAgent/canonicalContent.ts` exports a versioned bundle.
- Persona content consolidates existing default/static GM persona text.
- Canonical knowledge docs have deterministic IDs, `.md`/`.txt` paths, content, titles, and MIME intent when final content is available.
- If final JD copy is unavailable, the bundle ships the structure plus existing default GM content only; it does not invent lore.
- Bundle validation enforces field limits, file extensions, MIME intent, and max doc size.
- No runtime location-room code reads this bundle directly.
- Cross-package reuse for `services/elizaos/src/characters/wagdie-game-master-character.ts` is either proven by build/typecheck or replaced with a parity-test approach.

**Key files:**
- New `lib/eliza/gameMasterAgent/canonicalContent.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- `services/elizaos/src/characters/wagdie-game-master-character.ts`
- `types/eliza.ts`

**Dependencies:** None.

**Size:** M

### Item 2 — Add canonical review/diff primitives
**Goal:** Let admin state show repo-vs-live drift without mutating Official ElizaOS.

**Done when:**
- A pure review module computes persona hash, live hash, changed fields, canonical document statuses, and a `reviewToken`.
- Review handles missing active setting, missing Official record, sync-state lookup failure, and document-limit conflicts.
- `GameMasterAgentAdminState` includes `canonicalContent`.
- Existing GET state responses remain no-store and sanitized.

**Key files:**
- New `lib/eliza/gameMasterAgent/canonicalReview.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- `app/api/admin/eliza/game-master-agent/shared.ts`
- `components/admin/game-master-agent/types.ts`

**Dependencies:** Item 1.

**Size:** M

### Item 3 — Add canonical persona apply service operation
**Goal:** Apply repo-canonical service-agent persona/system content to the active Official GM agent through existing persona replacement semantics.

**Done when:**
- `GameMasterAgentService.applyCanonicalGameMasterContent({ persona: true })` requires an active DB setting.
- Apply rejects stale `expectedReviewToken` with a conflict error.
- Canonical persona validates through existing character update policy.
- Official record replacement uses the existing mapper/replace flow.
- Setting metadata records bundle ID, content version, persona hash, applied timestamp, and actor.
- Source remains or becomes `admin`.
- Env fallback records cannot be mutated unless first adopted.

**Key files:**
- `lib/eliza/gameMasterAgent/service.ts`
- `lib/eliza/gameMasterAgent/canonicalContent.ts`
- `lib/eliza/gameMasterAgent/canonicalReview.ts`
- `app/api/admin/eliza/game-master-agent/shared.ts`

**Dependencies:** Items 1–2.

**Size:** M

### Item 4 — Add canonical knowledge apply/sync service operation
**Goal:** Upsert repo-canonical GM knowledge docs into embedded Official character knowledge and sync them to Official ElizaOS memory.

**Done when:**
- Canonical docs are upserted by deterministic document ID.
- Non-canonical admin-uploaded live docs are preserved.
- Apply fails before writing if max document count would be exceeded.
- Embedded knowledge is written before Official indexing.
- Changed, missing, errored, deleted, or unsynced canonical docs are indexed in a deterministic, low-load order.
- Repo-removed canonical docs are flagged as obsolete/preserved and are not deleted automatically in V1.
- Sync failures preserve embedded docs and record per-doc error state.
- Source pointers include canonical bundle metadata.
- Result reports per-doc sync success/failure without leaking raw upstream details to routes.

**Key files:**
- `lib/eliza/gameMasterAgent/service.ts`
- `lib/eliza/gameMasterAgent/canonicalReview.ts`
- `lib/eliza/knowledge.ts`
- `lib/eliza/official/knowledge-client.ts`
- `lib/eliza/gameMasterAgent/repository.ts`

**Dependencies:** Items 1–2.

**Size:** L

### Item 5 — Add admin canonical apply API
**Goal:** Provide an admin-only mutation endpoint for applying repo-canonical persona and knowledge after preview.

**Done when:**
- `POST /api/admin/eliza/game-master-agent/canonical/apply` exists.
- Route uses `requireAdminNoStore()`.
- Route validates JSON body and requires `expectedReviewToken`.
- Route supports persona-only and knowledge-only apply.
- Response includes refreshed admin state and sanitized apply result.
- Stale preview maps to `409`.
- Sync failures never expose raw Official/provider errors.
- If an operator script is needed, the route/service contract is reusable by that script rather than duplicated.

**Key files:**
- New `app/api/admin/eliza/game-master-agent/canonical/apply/route.ts`
- `app/api/admin/eliza/game-master-agent/shared.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- `tests/api/admin-eliza-game-master-agent-routes.test.ts`

**Dependencies:** Items 2–4.

**Size:** M

### Item 6 — Add admin canonical content panel
**Goal:** Let admins review repo-canonical drift and apply persona/knowledge safely from `/admin/game-master-agent`.

**Done when:**
- New panel shows bundle version, persona drift, changed fields, canonical docs, live status, and sync status.
- Buttons apply persona and knowledge independently.
- Buttons are disabled when no active setting exists, Official record is unavailable, persona edits are dirty, review token is missing, knowledge would exceed document limit, or a busy action is active.
- Container posts `expectedReviewToken` to canonical apply route.
- Existing persona and knowledge workflows still behave unchanged.

**Key files:**
- New `components/admin/game-master-agent/GameMasterAgentCanonicalContentPanel.tsx`
- `components/admin/game-master-agent/GameMasterAgentAdminContainer.tsx`
- `components/admin/game-master-agent/types.ts`
- `tests/components/admin/game-master-agent-admin-container.test.tsx`

**Dependencies:** Item 5.

**Size:** M

### Item 7 — Add focused canonical content tests
**Goal:** Verify repo-canonical apply behavior without regressing admin auth, Official sync semantics, or runtime no-fallback behavior.

**Done when:**
- Service tests cover canonical review statuses, persona drift detection, successful persona apply, stale review token conflict, knowledge upsert preserving extra live docs, max-doc conflict before write, and sync failure preserving embedded docs.
- API tests cover admin requirement, no-store response, sanitized sync errors, and `409` stale preview.
- UI tests cover panel rendering, disabled states, apply persona/knowledge calls, and dirty persona lockout.
- Existing location-room generator/coordinator tests are not modified except if imports/types require updates.

**Key files:**
- `tests/lib/eliza/game-master-agent-service.test.ts`
- `tests/api/admin-eliza-game-master-agent-routes.test.ts`
- `tests/components/admin/game-master-agent-admin-container.test.tsx`

**Dependencies:** Items 1–6.

**Size:** M

### Item 8 — Document rollout and operator workflow
**Goal:** Make content updates repeatable for future JD/persona/knowledge revisions.

**Done when:**
- A plan/runbook explains: edit canonical bundle in repo, deploy, open `/admin/game-master-agent`, review drift, apply persona and sync knowledge, verify sync states, and rollback through admin edit/delete if needed.
- Notes explicitly state runtime generation still uses Official live state, not repo files directly.
- Notes warn that canonical apply never deletes non-canonical admin docs automatically.

**Key files:**
- `docs/plans/game-master-jd-content-update-2026-05-30.md`
- Optional `docs/runbooks/game-master-agent-content-sync.md`
- Optional operator script/helper if non-UI rollout is required

**Dependencies:** Items 1–7.

**Size:** S

## Progress
- [x] Items 1–4 — canonical content package, review/diff primitives, persona apply service, and knowledge apply/sync service. Implemented in `lib/eliza/gameMasterAgent/canonicalContent.ts`, `lib/eliza/gameMasterAgent/canonicalReview.ts`, `lib/eliza/gameMasterAgent/service.ts`, plus supporting types/sanitization and focused tests. Validation reported: `bun run test tests/lib/eliza/game-master-agent-service.test.ts tests/lib/eliza/game-master-agent-persona.test.ts tests/components/admin/game-master-agent-admin-container.test.tsx --runInBand` passed; full `tsc` still has pre-existing unrelated repo errors.
- [x] Items 5–6 — admin canonical apply API and admin canonical content panel. Implemented in `app/api/admin/eliza/game-master-agent/canonical/apply/route.ts`, `components/admin/game-master-agent/GameMasterAgentCanonicalContentPanel.tsx`, and `GameMasterAgentAdminContainer.tsx`. Validation reported: `bun run test tests/api/admin-eliza-game-master-agent-routes.test.ts tests/components/admin/game-master-agent-admin-container.test.tsx --runInBand` passed; full `tsc` still has pre-existing unrelated repo errors.
- [x] Items 7–8 — focused test completion and rollout/operator docs. Added service/API/UI coverage for canonical sync failure preservation, sync lookup failure, admin/no-store validation, stale-preview no-store, apply disabled states, and dirty persona lockout. Added operator workflow in `docs/runbooks/game-master-agent-content-sync.md`. Validation: `bun run test tests/lib/eliza/game-master-agent-service.test.ts tests/api/admin-eliza-game-master-agent-routes.test.ts tests/components/admin/game-master-agent-admin-container.test.tsx --runInBand` passed (32 tests, 3 suites).

## Open Questions
- The final JD canon/content package is not present in the inspected files. If product/content owners can provide final copy before build starts, Item 1 should include it; otherwise build the canonical structure with existing GM/default content only and treat final copy as a later content-only revision.
- Validate whether `services/elizaos/src/characters/wagdie-game-master-character.ts` can import/adapt the canonical package under the service package build. If not, keep the service file as a compatibility export and add a parity test.
- Decide before rollout whether a non-UI operator script/helper is required. This does not change the core service design, but it may move a script/runbook task ahead of the admin panel for production operations.

## References
- `docs/plans/elizaos-agent-location-rooms-2026-05-11.md`
- `docs/plans/game-master-narrative-agent-2026-05-22.md`
- `docs/plans/admin-game-master-agent-settings-2026-05-22.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md`
- `docs/plans/no-fallback-narration-quality-2026-05-30.md`
- `docs/plans/location-room-refactor-2026-05-30.md`
