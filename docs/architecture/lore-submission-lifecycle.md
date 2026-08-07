# Lore Submission Lifecycle

This page records the durable product policy for community lore submissions. It is the evergreen lifecycle reference; investigation files can explain how we arrived here, but implementation and admin copy should follow this document.

## Policy: token-owner submissions are auto-public community lore

Valid submissions from authenticated token owners are published immediately as **public community lore**. The public submission route is not a pre-publication approval queue.

Current service contract:

1. A submitter creates a lore submission for a token they own.
2. `LoreSubmissionService.createSubmission()` validates ownership, abuse limits, content shape, and active lore references.
3. The submission row is created in the `submitted` workflow state.
4. The service immediately publishes the row as `public` with `visibility = 'public'`, `published_kind = 'community'`, and `canon_status = 'community'`.
5. If an admin requests changes and the submitter revises the record, `LoreSubmissionService.reviseSubmission()` applies the same auto-public community publication behavior after the revised payload is saved.

The brief `submitted` state remains part of the workflow for transition safety, legacy/stale rows, and admin helper paths, but it should not be described to operators as the normal waiting-for-approval state.

## Admin role after publication

Admin tools are for post-public operation of community lore:

- **Moderation:** close/reject, hide/unpublish, request changes where workflow state allows it, and leave audit notes.
- **Curation:** add curated title, summary, Markdown body, tags, graph references, canon notes, and canon path metadata. Curated fields affect community/canon snapshots when publication metadata is refreshed.
- **Canonization:** promote public community lore to official canon, or decanonize official lore back to public community lore.

Admin copy should avoid implying that every valid community submission waits for approval before becoming public. The word `approve` is retained only as a legacy/API alias for the publish action; UI-facing language should prefer `publish community record`, `moderate`, `curate`, `hide`, and `canonize`.

## Status and visibility semantics

- `submitted` + `pending`: newly created or revised record before the auto-public transition completes, or an exceptional row that an admin may publish through the admin helper path.
- `public` + `public`: visible public community lore.
- `canonized` + `public`: visible official/canon lore promoted from a community submission.
- `changes_requested` + `pending`: hidden from public lore until the submitter revises, after which the record is auto-published again.
- `closed` + `hidden`: moderated out of public effective lore.

## Source files

- `lib/services/lore-submission-service.ts` owns create/revise auto-public behavior and admin transitions.
- `lib/services/lore-submissions/transitions.ts` owns conditional status transition payloads.
- `components/admin/lore-submissions/**` owns admin-facing moderation, curation, and canonization copy.
- `tests/unit/lore-submission-service.test.ts` locks in auto-public create behavior.
- `tests/api/lore-submissions-route.test.ts` verifies route delegation to the workflow service.

## Related docs

- `docs/architecture/lore-source-of-truth.md` defines how community submissions merge with base lore, canonization overrides, and Eliza/Game Master knowledge boundaries.
- `docs/runbooks/lore-operations.md` gives operator workflow guidance for moderation, curation, base-event overrides, and submission promotion.
