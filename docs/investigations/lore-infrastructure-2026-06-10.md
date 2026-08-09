# Investigation: Lore Infrastructure Improvements

## Summary
The lore infrastructure is functional and reasonably covered at the unit/API level, but it has grown across multiple product surfaces without a single durable contract for lifecycle semantics, canonization vocabulary, source-of-truth authority, and transactional/observable workflow boundaries. The highest-impact improvements are to clarify the submission lifecycle, make multi-step writes transactional, surface effective-lore health/cache behavior to operators, and document how public lore, DB base lore, submissions, canonization, and Eliza/game-master knowledge relate.

## Symptoms
- The project has multiple lore-related surfaces: public lore pages, community submissions, admin review/canonization, Eliza knowledge sync, location-room/game-master narrative systems, and static/content-backed lore data.
- The question is architectural rather than a single bug: identify friction, duplication, reliability gaps, and opportunities to make lore infrastructure more coherent and maintainable.

## Background / Prior Research
No external research was required initially; this is an internal codebase architecture investigation.

## Investigator Findings
<!-- Pair investigator appends structured analysis here: file:line refs, evidence, conclusions. -->

### Phase 3 - Architecture Verification

#### Confirmed findings

1. **Submission lifecycle semantics are internally consistent but product-facing language is ambiguous.**
   - Statuses are only `submitted`, `changes_requested`, `public`, `canonized`, and `closed`; visibility is separately `pending|public|hidden`; publication kind is `community|official` (`types/lore-submission.ts:4`, `types/lore-submission.ts:13`, `types/lore-submission.ts:16`).
   - `createSubmission()` inserts a submitted row, then immediately calls `publishCommunitySubmission()` (`lib/services/lore-submission-service.ts:188`, `lib/services/lore-submission-service.ts:192`). The unit test codifies this as "auto-publishes valid token-owner submissions as public community lore" (`tests/unit/lore-submission-service.test.ts:140`).
   - `reviseSubmission()` is allowed only from `changes_requested`, saves the revision, then immediately auto-publishes again (`lib/services/lore-submission-service.ts:220`, `lib/services/lore-submission-service.ts:247`, `lib/services/lore-submission-service.ts:248`).
   - Admin review still has an `approve` action that delegates to publish (`lib/services/lore-submission-service.ts:303`, `lib/services/lore-submission-service.ts:309`), and separate admin publish/canonize/decanonize/unpublish routes delegate through the action handler (`app/api/admin/lore/submissions/[submissionId]/action-route.ts:24`, `app/api/admin/lore/submissions/[submissionId]/review/route.ts:4`). This makes "review queue" and "approve/publish" semantics appear heavier than the current default auto-publication policy.

2. **Canonization is split across two models: base-event overrides and submission canonization.**
   - Static/base lore events carry embedded `canon` paths in checked-in arrays (`lib/lore/data/events.ts:33`). DB base events store `canon JSONB` (`supabase/migrations/20260509020000_create_lore_base_tables.sql:91`, `supabase/migrations/20260509020000_create_lore_base_tables.sql:105`).
   - Base-event admin canonization uses `lore_canonization_overrides` with editable draft/current fields plus separate published snapshot fields (`supabase/migrations/20260509000000_create_lore_canonization_overrides.sql:4`, `supabase/migrations/20260509000000_create_lore_canonization_overrides.sql:21`). Effective public reads apply only `publishedOverride` (`lib/lore/effective-query.ts:30`, `lib/lore/effective-query.ts:40`).
   - Community submissions instead carry `canon_status`, `canon_stage_id`, `canon_note`, and `canon_path` directly on `lore_submissions` (`supabase/migrations/20260509010000_create_lore_submissions.sql:45`, `supabase/migrations/20260509010000_create_lore_submissions.sql:67`). Canonizing a submission changes status/kind/canon fields in place (`lib/services/lore-submissions/transitions.ts:15`, `lib/services/lore-submissions/transitions.ts:21`).
   - Recommendation implication: operators need one mental model for "canonical state" even if implementation keeps static-event overrides separate from community-submission promotion.

3. **Source-of-truth boundaries are mostly centralized for public lore, but still fragmented operationally.**
   - Static base lore is assembled from `lib/lore/data/*` (`lib/lore/base-dataset.ts:1`, `lib/lore/base-dataset.ts:151`), while active base lore defaults to DB and falls back once to static on load/validation failure (`lib/lore/base-query.ts:20`, `lib/lore/base-query.ts:59`, `lib/lore/base-query.ts:67`).
   - Effective lore concurrently loads active base data, published canonization overrides, and published submissions, then filters collisions, synthesizes token characters, applies overrides, appends submissions, and merges submission sources/media (`lib/lore/effective-query.ts:177`, `lib/lore/effective-query.ts:182`, `lib/lore/effective-query.ts:188`, `lib/lore/effective-query.ts:195`, `lib/lore/effective-query.ts:204`).
   - Public lore pages use effective query surfaces (`app/lore/page.tsx:7`, `app/lore/page.tsx:22`; `app/lore/community/[slug]/page.tsx:35`; `app/lore/events/[slug]/page.tsx:79`). This eliminates the worst concern that public pages directly mix static and DB reads.
   - Eliza/game-master remains adjacent rather than automatically synchronized with effective lore: canonical GM content is a static repo bundle (`lib/eliza/gameMasterAgent/canonicalContent.ts:248`, `lib/eliza/gameMasterAgent/canonicalContent.ts:253`), the campaign guide says runtime ticks rely on live location metadata/catalog/Official knowledge rather than repo campaign files (`lib/content/campaign/gmKnowledge.ts:5`), and GM prompts ground on room/location metadata and adventure memory (`lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1313`, `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:1438`). No automatic effective-lore-to-GM-knowledge bridge was found.

4. **Repository mutations are non-transactional and can leave partial state.**
   - `createSubmission()` inserts the submission, then separately replaces links, then separately writes the `submit` review (`lib/repositories/lore-submission-repository.ts:177`, `lib/repositories/lore-submission-repository.ts:204`, `lib/repositories/lore-submission-repository.ts:205`).
   - `updateStatusConditional()` updates the row, then separately inserts the review, and may separately patch `reviewed_at` (`lib/repositories/lore-submission-repository.ts:382`, `lib/repositories/lore-submission-repository.ts:393`, `lib/repositories/lore-submission-repository.ts:404`).
   - `reviseSubmission()` updates the submission, deletes/reinserts links via `replaceLinks()`, then writes the `resubmit` review (`lib/repositories/lore-submission-repository.ts:418`, `lib/repositories/lore-submission-repository.ts:442`, `lib/repositories/lore-submission-repository.ts:443`). `replaceLinks()` deletes before insert, so insert failure can empty links (`lib/repositories/lore-submission-repository.ts:481`, `lib/repositories/lore-submission-repository.ts:491`).
   - Migrations define tables/RLS/constraints, but no transactional RPC for these multi-table workflows (`supabase/migrations/20260509010000_create_lore_submissions.sql:1`).

5. **Repository/database type safety is weak and drift-prone.**
   - Submission repository disables `no-explicit-any`, casts Supabase to an untyped client, and maps `any` rows to DTOs (`lib/repositories/lore-submission-repository.ts:1`, `lib/repositories/lore-submission-repository.ts:70`, `lib/repositories/lore-submission-repository.ts:83`, `lib/repositories/lore-submission-repository.ts:93`).
   - Base lore repository has the same untyped Supabase boundary and unchecked JSON casts for `entity_refs` and `canon` (`lib/repositories/lore-base-repository.ts:1`, `lib/repositories/lore-base-repository.ts:21`, `lib/repositories/lore-base-repository.ts:125`, `lib/repositories/lore-base-repository.ts:186`).
   - Canonization repository uses hand-written row types with `unknown` paths and array-only normalization (`lib/repositories/lore-canonization-repository.ts:10`, `lib/repositories/lore-canonization-repository.ts:18`, `lib/repositories/lore-canonization-repository.ts:72`). Submission `canon_path` is likewise cast after only `Array.isArray` (`lib/repositories/lore-submission-repository.ts:89`).
   - DB constraints help for enums and high-level shapes (`supabase/migrations/20260509010000_create_lore_submissions.sql:27`, `supabase/migrations/20260509010000_create_lore_submissions.sql:72`), but do not validate JSON element shape.

6. **Effective-lore fallback/collision behavior has low operator observability.**
   - DB base fallback, override fallback, and submission fallback are one-shot `console.warn` paths that return static/empty results without surfacing provenance to admin/public callers (`lib/lore/base-query.ts:33`, `lib/lore/base-query.ts:67`; `lib/lore/effective-query.ts:53`, `lib/lore/effective-query.ts:77`).
   - Published submission id/slug collisions are skipped with a one-shot warning only (`lib/lore/effective-query.ts:117`, `lib/lore/effective-query.ts:146`). There is no returned diagnostic count or admin-visible health panel for skipped lore.
   - Effective lore is React-cached outside tests (`lib/lore/effective-query.ts:232`, `lib/lore/effective-query.ts:237`); the inspected admin publish/canonization routes return updated records but do not explicitly invalidate effective-lore cache (`app/api/admin/lore/canonization/[eventId]/publish/route.ts:17`, `app/api/admin/lore/submissions/[submissionId]/canonize/route.ts:6`).

7. **Tests cover slices well but not full workflow integration or failure atomicity.**
   - Service tests cover auto-publication, exact transition payloads, stale transition conflicts, and active DB-reference validation (`tests/unit/lore-submission-service.test.ts:140`, `tests/unit/lore-submission-service.test.ts:224`, `tests/unit/lore-submission-service.test.ts:299`, `tests/unit/lore-submission-service.test.ts:334`).
   - Route tests mock `loreSubmissionService`, so they verify delegation/error mapping but not repository/database side effects (`tests/api/lore-submissions-route.test.ts:28`, `tests/api/lore-submissions-route.test.ts:108`, `tests/api/lore-submissions-route.test.ts:193`).
   - Repository tests currently cover nullable array mapping and error throwing only (`tests/unit/lore-submission-repository.test.ts:45`, `tests/unit/lore-submission-repository.test.ts:72`). They do not simulate partial failures after submission update/link delete/review insert.
   - Effective-query tests cover published overrides, DB base data, collision filtering, and published submissions in archive/source/media resolution (`tests/unit/lore-effective-query.test.ts:249`, `tests/unit/lore-effective-query.test.ts:262`, `tests/unit/lore-effective-query.test.ts:322`, `tests/unit/lore-effective-query.test.ts:379`). They are unit-mocked and do not verify cache invalidation after admin mutations.

#### Eliminated or qualified hypotheses

- **Not all lifecycle logic is missing.** Conditional status filters and DB constraints are present: status transitions call `updateStatusConditional()` with expected statuses (`lib/services/lore-submissions/transitions.ts:21`, `lib/services/lore-submission-service.ts:375`), and the migration requires public/canonized rows to have slugs/public visibility (`supabase/migrations/20260509010000_create_lore_submissions.sql:72`).
- **Public pages are not randomly mixing static arrays.** They route through `effective-query`; remaining static query/export surfaces appear mainly compatibility/fixture-oriented (`lib/lore/base-dataset.ts:151`; `app/lore/page.tsx:22`).
- **Canonization drafts are intentionally hidden from public effective reads.** Effective merge uses `publishedOverride` only (`lib/lore/effective-query.ts:30`), and tests assert draft-only overrides do not affect archive filters (`tests/unit/lore-effective-query.test.ts:240`).
- **DB constraints are useful but incomplete.** They cover enums, visibility, slug uniqueness, and broad JSON array/object checks; they do not replace transaction boundaries or generated database types.

#### Prioritized recommendations

1. **Clarify and rename the submission lifecycle.** Decide whether token-owner submissions are intentionally "auto-public community records" or should be pending admin review. If auto-public is intended, rename admin copy/actions around moderation/curation rather than approval; if not, remove the create/revise auto-publish call path.
2. **Introduce transactional mutation boundaries.** Move create+links+review, revise+link replacement+review, and status+review writes into Supabase RPCs or another transaction-capable repository layer. Preserve conditional status checks inside the transaction.
3. **Generate and use DB table types.** Refresh `lib/database.types.ts` for lore tables and replace untyped Supabase clients/manual `any` row mapping with generated row/insert/update types plus runtime parsers for JSON columns.
4. **Add effective-lore health/provenance.** Expose base source (`database|static`), override/submission fetch status, collision counts, and last fallback errors to an admin diagnostics endpoint/page instead of one-shot console warnings only.
5. **Unify canonization operator UX.** Present a single canonization model that distinguishes static-event override publication from submission promotion, with shared vocabulary for `canon_status`, stage, draft/published, and public effective result.
6. **Define the Eliza lore bridge explicitly.** Either document that GM knowledge is intentionally separate and location-metadata-driven, or add a projection/sync job from effective lore changes into Official GM knowledge/location metadata with review controls.
7. **Add integration/failure tests.** Cover end-to-end create→auto-public→effective archive, request-changes→revise→effective archive, public→canonized→official event kind, collision observability, and simulated mid-repository failures/rollbacks.

#### Concrete verification targets

- Add a test that creates a submission through the service and asserts `getEffectiveArchiveItems()` sees the resulting community event with source/media records.
- Add a test that request-changes then revise either remains pending or auto-public according to the chosen policy, and assert the admin UI copy/buttons match that policy.
- Add repository/RPC tests where link insert or review insert fails; expected outcome should be full rollback and no orphan/partially updated submission.
- Add an effective-lore diagnostics test that forces base DB failure, override failure, submission failure, and collision, then asserts machine-readable diagnostics rather than only `console.warn`.
- Add a cache invalidation verification after `publishDraft()`, `canonizeSubmission()`, `decanonizeSubmission()`, and `unpublishSubmission()` so public pages cannot serve stale effective lore after admin actions.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** Lore infrastructure may be spread across public routes, admin workflows, database-backed submissions, static content data, and Eliza/game-master knowledge paths with weak boundaries or duplication.
**Findings:** Created this report and confirmed repo investigation conventions.
**Evidence:** `docs/investigations/README.md` describes investigations as point-in-time debugging or research records.
**Conclusion:** Proceeding to Context Builder for broad workspace discovery.

### Phase 2 - Context Builder Broad Discovery
**Hypothesis:** Broad workspace discovery will identify the relevant lore surfaces and initial architectural improvement themes.
**Findings:** Context Builder selected 86 relevant files spanning public lore routes, public/admin lore APIs, admin submission/canonization UI, core `lib/lore` query/domain code, submission/canonization services and repositories, migrations, Eliza knowledge adjacency, and tests. Initial themes: ambiguous submission lifecycle, split canonization models, fragmented source-of-truth, non-transactional multi-step writes, untyped repository/database boundary, effective-lore observability gaps, duplicated static/effective query logic, and uncertain Eliza knowledge projection.
**Evidence:** Selection includes `lib/services/lore-submission-service.ts`, `lib/services/lore-submissions/transitions.ts`, `lib/lore/effective-query.ts`, `lib/repositories/lore-submission-repository.ts`, lore migrations under `supabase/migrations/`, and Eliza knowledge files under `lib/eliza/**`.
**Conclusion:** Dispatching pair investigator for line-level verification and report findings.

### Phase 4 - Oracle Synthesis
**Hypothesis:** The verified pair findings should be synthesized into a small set of root causes, eliminated hypotheses, and prioritized improvements.
**Findings:** Oracle characterized the system as a working but maturing architecture: public read paths are mostly centralized, but write-side workflows, admin semantics, persistence boundaries, observability, and source-of-truth contracts remain split.
**Evidence:** Pair-confirmed evidence in `## Investigator Findings`; Oracle synthesis over refreshed selection including `lib/lore/data/events.ts`, `lib/eliza/locationRooms/gameMaster/officialGenerator.ts`, and `tests/unit/lore-effective-query.test.ts`.
**Conclusion:** Final recommendations should prioritize lifecycle clarity, transactional reliability, effective-lore diagnostics/cache invalidation, and documented source-of-truth boundaries.

## Eliminated / Qualified Hypotheses

- **Public pages are not randomly mixing static and DB lore.** Public lore routes use effective-query surfaces; the remaining risk is effective-query fallback visibility, collision reporting, and cache invalidation rather than route-level data chaos.
- **Submission lifecycle logic exists, but its product language is ambiguous.** Auto-publication is implemented and tested, yet admin review/publish semantics imply a heavier approval workflow.
- **Canonization drafts are intentionally hidden from public reads.** Effective lore applies published overrides only; the issue is parallel operator models for base-event overrides and submission promotion.
- **DB constraints exist, but they are not enough.** Migrations constrain enums, status/visibility relationships, slug uniqueness, and broad JSON shapes, but do not provide transaction boundaries, generated types, or deep JSON element validation.
- **Eliza/game-master lore is adjacent, not proven broken.** No automatic effective-lore-to-GM projection was found; the decision needed is whether that separation is intentional or should become an explicit sync/projection.

## Root Cause
The lore infrastructure grew from overlapping product needs: static archive pages, DB-backed base-lore rollout, token-owner submissions, admin canonization, effective public reads, and Eliza/game-master knowledge. These layers share domain vocabulary, but the system lacks one durable contract for submission lifecycle semantics, canonization vocabulary across base events versus submissions, source-of-truth authority, and transactional/observable workflow boundaries. Public reads are mostly centralized through `lib/lore/effective-query.ts`, but write-side workflows and admin/operator semantics remain split across services, repositories, migrations, UI copy, and tests.

## Recommendations
1. **P0 — Clarify submission lifecycle policy and language.** Decide whether token-owner lore is intentionally auto-public community content or should be moderated before publication. If auto-public is intended, rename admin copy/actions around post-public moderation and curation; if not, remove the auto-publication path from create/revise.
2. **P1 — Add transactional boundaries for submission writes.** Move create+links+review, revise+links+review, status+review, and replace-links operations into Supabase RPCs or another transaction-capable repository boundary that preserves conditional status checks.
3. **P1 — Add effective-lore diagnostics and cache-invalidation verification.** Expose active base source, DB fallback reason, override/submission fetch status, collision counts, and last successful effective-lore build. Verify cache invalidation after canonization publish/reset and submission publish/canonize/decanonize/unpublish.
4. **P1 — Define source-of-truth boundaries.** Document which layer is authoritative for public lore pages, static fallback, DB base lore, community submissions, base-event canonization, and Eliza/game-master knowledge.
5. **P2 — Strengthen repository/database type safety.** Regenerate `lib/database.types.ts` for lore tables and replace untyped Supabase/manual `any` mapping where feasible; pair generated table types with runtime parsers for JSON columns.
6. **P2 — Unify canonization operator vocabulary.** Align admin/user-facing semantics for `canon_status`, `canon_stage_id`, draft vs published, base-event override vs submission promotion, and official vs community event kind before attempting a schema merge.
7. **P2 — Add focused integration and failure tests.** Cover create→public→effective archive, request-changes→revise→effective archive, public→canonized→official kind, unpublish→hidden, repository partial failures/rollback, diagnostics, and cache invalidation after admin mutations.

## Preventive Measures
- Require lifecycle/state-machine review for future lore workflow changes, including matching service transitions, admin UI copy, API behavior, migrations, and tests.
- Add schema/type drift checks so generated DB types include lore tables and runtime parsers validate JSON columns consistently.
- Add an effective-lore health check or admin diagnostics surface that fails visibly when fallback/collision behavior changes public output.
- Treat Eliza/game-master lore consumption as an explicit projection decision: document separation if intentional, or add reviewed sync jobs if effective lore should feed AI knowledge.
- Promote any repeatable operational procedures from this investigation into `docs/runbooks/` or evergreen architecture docs rather than leaving them only in this point-in-time report.
