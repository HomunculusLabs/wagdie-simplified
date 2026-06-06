# Data Sync and Assets

> Lifecycle: Runbook
> Last validated: 2026-06-04
> Canonical sources: `package.json`, `scripts/`, `app/api/sync/*`, `lib/services/sync/*`, `lib/services/searing-materialization-service`, `supabase/migrations/`, `.env.example`

This page groups repeatable data-sync and asset operations without becoming a scripts reference. Use `package.json` for the exact script inventory and each script/route for current behavior.

## Safety rules

- Confirm the target environment before running any write-capable job.
- Use Bun package scripts rather than invoking internal `npx ts-node` commands directly.
- Prefer dry-run options when the script supports them.
- Keep service-role keys, sync secrets, RPC URLs, and database URLs in local environment files or secret stores, not committed docs.
- Treat `supabase/migrations/` as schema truth; do not rely on table-count checklists.

## Environment families

Most data and asset jobs need some combination of:

- Supabase server access: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and sometimes `SUPABASE_ANON_KEY`.
- Optional table override: `NEXT_PUBLIC_CHARACTERS_TABLE` or script-specific table variables.
- RPC/contract values for blockchain-derived syncs.
- `SYNC_SECRET_KEY` for protected sync routes.
- Script-specific tuning variables such as page size, concurrency, limits, token IDs, or dry-run flags. Check the script source before running.

## Ownership sync

Route: `app/api/sync/ownership/route.ts`

Purpose: sync NFT ownership from chain-derived services into Supabase.

Characteristics:

- Accepts `GET` and `POST`.
- Requires `SYNC_SECRET_KEY` via `Authorization: Bearer <secret>` or `?secret=<secret>`. Prefer the `Authorization` header; use query-string secrets only when a scheduler/tool requires them and URL logging has been considered.
- Uses the Supabase admin client and `OwnershipSyncService`.
- Returns processed/updated/failed counts and a timestamp.

Use this route from a trusted scheduler or manual operator context only.

## Staking sync

Route: `app/api/sync/staking/route.ts`

Purpose: reconcile staking state for requested token IDs.

Characteristics:

- Accepts `POST` with JSON body containing `tokenIds`.
- Limits each request to 50 token IDs.
- Delegates to `syncStakingState`.
- Returns per-token results including `locationId`, `chainLocationId`, success, and optional error.

This route is designed for app-triggered or operator-triggered targeted reconciliation rather than a full unbounded crawl.

## Searing materialization and sync

Route: `app/api/sync/searing/route.ts`

Script category: searing materialization package script in `package.json`.

Purpose: materialize pending searing events and reconcile derived searing assets/state.

Route characteristics:

- Accepts `POST`.
- Requires `SYNC_SECRET_KEY` via bearer token or `?secret=<secret>`. Prefer bearer auth because query-string secrets can be captured in logs, browser history, scheduler dashboards, and proxy traces.
- Supports `limit`, `includeFailed` / `retryFailed`, and optional `tokenIds`.
- Caps `limit` at 50 and `tokenIds` at 50 per request.
- Delegates to `searingMaterializationService.materializePendingBatch`.

Script characteristics:

- Uses `scripts/materialize-searing-events.ts`.
- Supports environment-controlled limit, retry behavior, dry-run behavior, and token filtering in source.
- Should be run first against a disposable or dev target when changing searing logic.

## Eliza location-room sync

Route: `app/api/sync/eliza-location-rooms/route.ts`

Purpose: run the scheduled worker that maintains Eliza location-room state.

Characteristics:

- Accepts `GET` and `POST` and declares the Node.js runtime for server-side ElizaOS dependencies.
- Vercel runs `/api/sync/eliza-location-rooms?secret=${SYNC_SECRET_KEY}` every 15 minutes (`*/15 * * * *`).
- Requires `SYNC_SECRET_KEY` via bearer token or `?secret=<secret>`. Prefer bearer auth because query-string secrets can be captured in logs, browser history, scheduler dashboards, and proxy traces; the query-string form exists for the current Vercel cron pattern.
- Manual/operator invocation shape: `curl -X POST -H "Authorization: Bearer $SYNC_SECRET_KEY" "$NEXT_PUBLIC_APP_URL/api/sync/eliza-location-rooms"`.
- Returns counters including `enqueued`, `deduped`, `processed`, `completed`, `skipped`, `failed`, `dead`, and per-tick `results`, plus a `timestamp`.
- Returns `503` when location rooms are disabled, the official ElizaOS service is not configured, or narrative mode is enabled without a resolvable Game Master.
- Delegates to `locationRoomService.runScheduledWorker()`.

Dev narrative mode:

- Code defaults keep `ELIZA_LOCATION_ROOMS_ENABLED=false` and `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=false` unless explicitly configured.
- Docker Compose dev passes `ELIZA_LOCATION_ROOMS_ENABLED=true` and `ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED=true` to the app service, with optional passthrough for `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID`.
- Non-Compose local development remains explicit: set the location-room vars in `.env.local` before `bun run dev`.
- Narrative mode still requires reachable `ELIZAOS_BASE_URL`, valid `ELIZAOS_API_KEY`, and either an active admin Game Master setting or the `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` env fallback.

Crows Den location-room smoke checklist:

1. Confirm canonical Crows Den is `locations.id='11'` and `chain_location_id='11'`.
2. Confirm at least two eligible participants are staked/synced at `location_id='11'`.
3. Confirm Game Master state is available in `/admin/game-master-agent` or via the `ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID` fallback.
4. Open `/admin/location-rooms` for location `11` and confirm diagnostics do not recommend `use_canonical_location_11`.
5. Trigger manual room activity as an admin or eligible owner.
6. Confirm the active tick leaves `pending` and is not stuck behind a non-stale `processing` lock.
7. Confirm a public location-room message appears.
8. Confirm a narrative beat exists when narrative mode is enabled.
9. Confirm the scheduled cron processes later due ticks through `/api/sync/eliza-location-rooms`.

See `docs/operations/elizaos-validation.md` before promoting this flow beyond dev validation.

## Character image and metadata workflows

Character images now have two public app-origin paths with different lifecycles:

- `/images/characters/{tokenId}.png` is the permanent base/smart-contract compatibility path. Keep it available; do not deprecate or replace it with the mutable current route.
- `/images/characters/current/{tokenId}.png?v={version}` is the served current image path for verified base images and altered/seared current images. Versioned URLs are cache-safe and may be backed by `public/` files or durable storage such as GCS.

Served NFT metadata from `/api/characters/metadata/{tokenId}` starts from the original static metadata snapshot, replaces `image` with a verified current app-origin URL when available, and exposes original provenance through `original_image` and `image_provenance`. If no verified/current image is available, the route must fall back to the original static image rather than serving unverified local bytes.

Script categories in `package.json` cover these workflows:

- Import GCS images into local/public character image paths and update character metadata.
- Point database metadata at local character images.
- Extract PNG metadata from a GCS bucket dump.
- Compare extracted image metadata against database rows.
- Collect local character assets and generate verified local asset status.
- Repair/backfill current/original image fields and emit marketplace refresh candidates.

Important source files include:

- `scripts/import-gcs-images.ts`
- `scripts/point-images-to-local.ts`
- `scripts/extract-png-metadata.ts`
- `scripts/compare-extracted-metadata.ts`
- `scripts/collect-character-assets.ts`
- `scripts/repair-current-character-images.ts`
- `lib/services/assets/character-current-image-service.ts`
- `lib/services/character-served-metadata-service.ts`

### Current character image rollout flow

1. Run a verified asset audit with `bun run assets:collect` against a small known-good token range first, then the intended full scope. Inspect `public/metadata/characters/manifest.json` for `verification_status` values including mismatches and unreachable sources.
2. Deploy the metadata/current image route changes before any production repair writes `/images/characters/current/...` URLs into the read model.
3. Run `bun run assets:repair-current` in dry-run mode for representative base and seared tokens. Use scoped flags such as `--token`, `--tokens`, or `--range` before considering `--all --yes`.
4. Backfill base current fields only for verified base images. The stable public base path remains `/images/characters/{tokenId}.png`; the DB/read model current URL should use `/images/characters/current/{tokenId}.png?v=base-{sha16}`.
5. Repair seared rows after base provenance is populated. Completed searing events should store app-origin current URLs plus backing storage descriptors, not raw `storage.googleapis.com` URLs as the served image.
6. Run the searing materialization worker (`bun run searing:materialize` or the protected `/api/sync/searing` route) in a limited batch before wider rollout.
7. Capture the repair script's operator-owned marketplace refresh list. Refresh marketplaces manually for changed tokens; do not add automatic OpenSea refresh behavior to the app or worker.

### Rollout gates and monitoring checks

Track these gates during rollout and before declaring completion:

- `wagdie_characters` rows missing `current_image_url` after expected base/seared repair scope.
- Completed `searing_events` whose `seared_image_url` is absent or not under `/images/characters/current/`.
- Manifest entries with `verification_status` other than `verified` for tokens expected to have local base images.
- Any served metadata response whose `image` points to an unversioned current route, raw GCS URL, or unverified local fallback.

Rollback guidance: keep the additive DB columns, disable or bypass current-image serving if needed, and let served metadata fall back to the original static image. Do not roll back by pointing metadata at unverified `/images/characters/{tokenId}.png` bytes.

Common controls visible in script source include `DRY_RUN`, import limits, page sizes, concurrency, image extension filters, local image directories, public prefixes, missing-image download toggles, token/range selectors, and `--yes` guards for mutation. Check the script before running because these knobs are intentionally script-specific.

## Lore seed and parity workflows

Script categories in `package.json` cover base lore seeding and parity verification.

Important source files include:

- `scripts/lore/seed-base-lore.ts`
- `scripts/lore/verify-base-lore-parity.ts`
- `lib/lore/base-dataset`
- `lib/repositories/lore-base-repository`

Use these when promoting static base lore into Supabase or checking drift between the static dataset and the database. For admin/user submission routes, use route-specific tests and the lore docs owned by the relevant feature work.

## Suggested operator flow

1. Identify the environment and confirm it is safe for mutation.
2. Check `package.json` for the package script name.
3. Read the script or route source for required env vars, dry-run flags, limits, and mutation behavior.
4. Export secrets locally or use the platform secret store.
5. Run a dry run or limited token/job batch where supported.
6. Inspect logs and output artifacts.
7. Run the validation or parity check for the workflow if one exists.
8. Record unusual findings in the relevant dated plan, investigation, or runbook; do not turn one-off output into evergreen docs without revalidation.

## Related docs

- `docs/operations/deployment.md`
- `docs/operations/elizaos-validation.md`
- `docs/reference/routes-and-apis.md`
- `docs/development/testing.md`
