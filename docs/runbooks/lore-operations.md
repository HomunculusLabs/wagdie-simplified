# Lore Operations Runbook

> Lifecycle: Runbook
> Last validated: 2026-06-10
> Target environment: WAGDIE admin UI and server-side lore APIs
> Canonical sources: `docs/architecture/lore-source-of-truth.md`, `docs/architecture/lore-submission-lifecycle.md`, `lib/lore/effective-query.ts`, lore services/repositories, and Supabase migrations

## Purpose

Use this runbook when operating public lore, community submissions, and base-event canonization overrides. It is an operator workflow guide, not a schema reference.

## Preconditions

- You have admin access to `/admin/*`.
- You understand that valid token-owner submissions are auto-public community lore by default.
- You have reviewed `docs/architecture/lore-source-of-truth.md` for the difference between base-event overrides, submission promotion, and Eliza/Game Master knowledge.

## Identify the lore surface

Before changing anything, identify which surface you are operating:

1. **Base event:** existing official/static lore event shown in the public archive.
2. **Community submission:** token-owner lore record under `/admin/lore/submissions`.
3. **Eliza/Game Master knowledge:** AI/persona/knowledge data under Eliza or location-room systems.

Do not use one surface to imply changes in another. In particular, publishing a base-event override does not promote a community submission, and canonizing a submission does not automatically update Eliza knowledge.

## Base-event canonization override workflow

Use `/admin/lore-canonization` for base-event canon metadata only.

1. Select the base event.
2. Review the static baseline, current published override, and any draft override.
3. Edit `status`, `stage`, `canon note`, and path steps.
4. Save a draft when the work should be preserved but not yet public.
5. Publish the override only when the edited canon metadata should affect public effective lore.
6. Reset to static only when you want to remove override state and return to the base event's static/DB canon metadata.

Stop if the intended change is about a user-submitted lore record. Use the submission moderation workflow instead.

## Community submission moderation and promotion workflow

Use `/admin/lore/submissions` for token-owner submissions.

1. Inspect the current status and public slug.
2. If the record is public community lore, remember that it is already visible in effective public lore.
3. Use moderation actions for closure/rejection, change requests where workflow state allows them, and audit notes.
4. Use curation fields to improve title, summary, body, tags, graph references, canon notes, and canon path metadata.
5. Use canon controls to promote public community lore to official canon or return canonized lore to community status.
6. Hide/unpublish only when the record should no longer appear in public effective lore.

Do not describe the normal path as approval before publication. `approve` exists only as a legacy/API alias for publish behavior.

## Eliza and Game Master boundary

Public lore operations do not automatically update Eliza or Game Master knowledge.

- If you need to change GM behavior, follow the relevant Eliza/Game Master admin flow and validation procedure.
- If you need effective lore to feed AI knowledge in the future, stop and request a reviewed projection/sync design. Do not add an ad hoc bridge.

## Stop conditions

Stop and escalate before changing data if:

- the operation requires direct database edits instead of admin/service routes,
- public effective lore appears stale after a successful admin mutation,
- a base event and a submission disagree about the same id or slug,
- the requested change would imply automatic Eliza/GM sync,
- you are unsure whether a record is a base event or a community submission.

## Live RPC rollback verification

The transactional submission workflow RPCs have a live Postgres integration harness that is skipped by default. To run it against a migrated local Supabase/Postgres database:

```bash
LORE_RPC_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" bun run test:lore:rpc
```

Use this after changing `supabase/migrations/*lore_submission_workflow_rpcs*.sql` or the lore submission repository transaction boundary. The harness verifies rollback behavior for failed atomic create/revise publication, stale transitions without audit side effects, and public close/unpublish compatibility with DB constraints.

## Related docs

- `docs/architecture/lore-source-of-truth.md`
- `docs/architecture/lore-submission-lifecycle.md`
- `docs/architecture/eliza-and-backend.md`
- `docs/investigations/lore-infrastructure-2026-06-10.md` historical background only
