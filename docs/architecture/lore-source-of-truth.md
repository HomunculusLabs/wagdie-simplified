# Lore Source of Truth

This page is the evergreen architecture contract for WAGDIE lore data. Investigation files can explain why these boundaries changed; implementation, admin copy, and runbooks should follow this document.

## Current policy

Public lore is built from an **effective lore** view. Effective lore is the read-time merge of active base lore, published base-event canonization overrides, and public community submissions.

The system intentionally keeps three responsibilities separate:

1. **Base lore ownership:** static lore arrays and DB base lore tables define the project-maintained archive seed.
2. **Community submission ownership:** token-owner submissions enter public community lore through the submission workflow documented in `docs/architecture/lore-submission-lifecycle.md`.
3. **AI/Eliza knowledge ownership:** Eliza and Game Master knowledge are adjacent operational systems, not automatic mirrors of effective public lore.

Do not introduce an automatic effective-lore-to-Eliza sync bridge unless a future product decision creates a reviewed projection job.

## Source map

| Layer | Current source of truth | Public effect | Primary files |
| --- | --- | --- | --- |
| Static base lore | Checked-in arrays under `lib/lore/data/*` | Fallback and seed material for base archive content | `lib/lore/base-dataset.ts`, `lib/lore/data/*` |
| DB base lore | Supabase base lore tables | Preferred active base dataset when enabled and valid | `lib/lore/base-query.ts`, `lib/repositories/lore-base-repository.ts`, `supabase/migrations/20260509020000_create_lore_base_tables.sql` |
| Effective public lore | Read-time merge of base lore, published overrides, and public submissions | Public `/lore/*` pages and archive helpers | `lib/lore/effective-query.ts`, public lore routes under `app/lore/*` |
| Base-event canonization overrides | Draft/published rows in `lore_canonization_overrides` | Published overrides replace the `canon` metadata of existing base events in effective lore | `lib/services/lore-canonization-service.ts`, `lib/lore/canonization-overrides.ts`, `components/admin/lore-canonization/*` |
| Community submissions | Rows in `lore_submissions` and related link/review tables | Public/canonized submissions are adapted into effective lore events, sources, and media | `lib/services/lore-submission-service.ts`, `lib/lore/submissions/adapter.ts`, `components/admin/lore-submissions/*` |
| Eliza / Game Master knowledge | Eliza persona/knowledge services and repo-canonical GM bundles | Drives agent behavior and location-room narration; does not automatically update public lore | `lib/eliza/*`, `lib/eliza/gameMasterAgent/canonicalContent.ts`, `lib/content/campaign/gmKnowledge.ts` |

## Effective public lore merge

`lib/lore/effective-query.ts` is the public read boundary. Public pages should use its helpers instead of directly mixing static arrays, DB base tables, overrides, and submissions.

At a high level, effective lore:

1. Loads the active base dataset from DB, falling back to static base data when DB base loading or validation fails.
2. Loads canonization overrides and applies only **published** base-event overrides.
3. Loads public/canonized community submissions.
4. Adapts submissions into lore events, source records, media records, and token character summaries.
5. Skips submission id/slug collisions so base lore remains stable.

Diagnostics and cache behavior are owned by the effective-lore diagnostics surfaces/workstream. Operators should prefer those explicit diagnostics when available and treat console warnings as implementation hints only, not as a complete health surface.

## Canonization models

The product uses one operator vocabulary but two persistence models.

### Base-event override

A base-event override edits the `canon` metadata for an existing base lore event. It has draft and published states:

- **Draft override:** saved admin work; not visible in public effective lore.
- **Published override:** visible public override applied by effective lore.
- **Reset to static:** removes override state and returns the base event to its static/DB canon metadata.

Use this vocabulary in `components/admin/lore-canonization/*` and related page copy. Avoid describing this surface as submission promotion.

### Submission promotion

A community submission carries canon fields directly on `lore_submissions`. Admins can:

- keep it as public community lore,
- curate its title/body/metadata,
- promote it to official canon,
- return canonized lore to community status,
- hide/unpublish it from effective public lore.

Use this vocabulary in `components/admin/lore-submissions/*`. Avoid describing auto-public community submissions as waiting for approval.

## Shared canon vocabulary

Shared labels and stage definitions live in `lib/lore/canonization.ts` and `lib/lore/types.ts`.

- `canon_status` / `CanonStatus` answers: is this canon, canonizing, community, disputed, non-canon, or archival?
- `canon_stage_id` / `CanonizationStageId` answers: where is this record in the canonization path?
- `path` / `CanonizationStep[]` records the operator-visible workflow steps and source references.
- `kind: 'official' | 'community'` answers how the event appears in the public archive.
- `draft` and `published` apply to base-event overrides only.
- `public`, `canonized`, and `closed` are submission workflow statuses, not base-event override states.

UI copy should prefer central canon labels from `canonStatusLabels`, `getCanonizationStatusLabel()`, and `getCanonizationStageDefinition()` where practical.

## Eliza and Game Master boundary

Eliza and Game Master knowledge are intentionally separate from effective public lore today.

- Canonical GM content is a repo-owned bundle in `lib/eliza/gameMasterAgent/canonicalContent.ts`.
- The campaign guide in `lib/content/campaign/gmKnowledge.ts` states that runtime ticks rely on live location metadata, retrieved catalog entries, active adventure memory, and live Official agent knowledge.
- No current system automatically projects effective public lore into Eliza or GM knowledge.

If product later wants AI knowledge to consume effective lore, add a reviewed projection/sync design with operator controls. Do not wire direct automatic sync as part of source-of-truth documentation or copy cleanup.

## Guardrails

- Keep schema facts in migrations and repository code, not duplicated tables in docs.
- Keep public lore reads behind `lib/lore/effective-query.ts` helpers.
- Keep submission lifecycle language aligned with `docs/architecture/lore-submission-lifecycle.md`.
- Keep base-event override UI language distinct from submission promotion language.
- Link durable decisions from architecture docs or runbooks; keep investigations historical.
