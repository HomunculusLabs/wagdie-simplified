# Local Hosted Character Images: Plan

## Goal
Implement a local-hosted current character image model for WAGDIE: original image/metadata remains preserved as provenance, served metadata uses verified local/app-origin current image URLs, and searing can update the current image/metadata without losing original image references.

This is a bounded cross-subsystem refactor, not a single route patch. The image contract spans static metadata, asset collection, character hydration, NFT metadata, searing materialization, repair/backfill scripts, character-page provenance display, tests, and operations.

## Implementation Progress
- [x] Items 1–4 — Foundation image contract, DB migration, verification primitives, collector manifest/status semantics.
- [x] Items 5–7 — Runtime hydration, app-origin current image route, served metadata builder.
- [x] Items 8–9 — Searing current-image storage plus repair/backfill tooling.
- [x] Items 10–11 — Character-page provenance UI, docs, rollout, final verification.

## Background
- Token 30 exposed the core failure mode: `public/metadata/characters/30.json` points to canonical IPFS CID `QmfDpdGm8rJoY58hKcWidsaombZtSPGXVUCn18orHAp96t`, while local/prod `public/images/characters/30.png` is a different image. Its manifest entry had `image_downloaded:false` and `image_source_url:null`, so local existence did not prove provenance (`docs/investigations/character-30-metadata-image-2026-06-03.md`).
- The asset collector reads `wagdie_characters` rows with `token_id`, `metadata`, optional `image_url`, and infection flags (`scripts/collect-character-assets.ts:7-14`, `scripts/collect-character-assets.ts:367-397`), writes each row's metadata to `public/metadata/characters/{token_id}.json` (`scripts/collect-character-assets.ts:467-470`), and downloads images to `public/images/characters/{token_id}.png` from ordered candidates (`scripts/collect-character-assets.ts:206-237`).
- The collector currently skips already-present base images unless a row is infected/seared, recording `image_exists:true` without byte/hash/source verification (`scripts/collect-character-assets.ts:467-499`). Manifest entries contain `image_exists`, `image_downloaded`, `image_source_url`, and errors, but no source hash, local hash, content type, verification status, or original/current image distinction (`scripts/collect-character-assets.ts:23-31`, `scripts/collect-character-assets.ts:486-512`).
- `lib/data/local-character-asset-status.ts` gates runtime local image availability. Current generated code treats every token `1..6666` as having a local image unless listed missing (`lib/data/local-character-asset-status.ts:1-11`), so app display uses generated status, not per-request filesystem or provenance checks.
- Runtime character APIs use DB rows plus local asset hydration: `serverCharacterRepository` injects `characterLocalAssets` (`lib/repositories/character-repository.server.ts:1-6`); `CharacterQueryRepository` hydrates reads before returning (`lib/repositories/character/character-query-repository.ts:313-321`, `lib/repositories/character/character-query-repository.ts:439-446`).
- `characterLocalAssets` loads `public/metadata/characters/manifest.json`, reads each `metadata_file`, and hydrates DB characters by starting from local/base metadata and overlaying dynamic DB fields (`lib/services/assets/character-local-assets.ts:153-211`, `lib/services/assets/character-local-assets.ts:30-39`, `lib/services/assets/character-local-assets.ts:252-269`). Dynamic keys include `isSeared`, `searImage`, infection fields, `searedConcord`, and `searing_materialization`.
- Runtime image priority is current-state oriented: infected image, then seared image, then local static image, then placeholder (`lib/utils/image.ts:199-221`). Seared image candidates are `metadata.searing_materialization.seared_image_url`, then `metadata.searImage`, then DB/current `image_url` (`lib/utils/image.ts:166-187`).
- Collector seared candidate order diverges from runtime: it tries `metadata.searImage` before nested `searing_materialization.seared_image_url`, then `image_url`, then metadata image fields (`scripts/collect-character-assets.ts:224-234`). This can preserve a stale legacy seared URL instead of the latest materialization URL.
- NFT metadata route behavior is separate from runtime character APIs. `/api/characters/metadata/[tokenId]` reads static JSON from `public/metadata/characters/{tokenId}.json`, computes a hosted local fallback from `public/images/characters/{tokenId}.png`, and deletes `animation_url` before returning (`app/api/characters/metadata/[tokenId]/route.ts:10-11`, `app/api/characters/metadata/[tokenId]/route.ts:34-43`, `app/api/characters/metadata/[tokenId]/route.ts:64-83`). It does not query Supabase or apply current seared/infected read-model state.
- Current working tree includes a token-30 safety fix: the NFT metadata route preserves a non-empty `metadata.image` and only checks local fallback when `image` is missing/blank (`app/api/characters/metadata/[tokenId]/route.ts:74-79`), with tests covering preservation/fallback (`tests/api/characters-metadata-route.test.ts:37-91`). That prevents unverified local override but is not the final served-current-local model.
- Searing ingestion and materialization are separate. The indexer decodes `ConcordSeared` logs and upserts `searing_events` (`scripts/indexer/searing-event-handler.ts:35-52`, `scripts/indexer/searing-event-handler.ts:151-184`); image generation happens later through `/api/characters/[tokenId]/searing/sync`, `/api/sync/searing`, or `scripts/materialize-searing-events.ts` (`app/api/characters/[tokenId]/searing/sync/route.ts:21-54`, `app/api/sync/searing/route.ts:19-83`, `scripts/materialize-searing-events.ts:37-75`).
- Searing materialization resolves layers from hydrated character metadata, composes PNG bytes, uploads through storage, then writes `metadata.isSeared`, `metadata.searImage`, `metadata.searing_materialization.seared_image_url`, DB `image_url`, `character_concords`, and `searing_events.seared_image_url` (`lib/services/searing-materialization-service.ts:409-448`, `lib/repositories/character-materialization-repository.ts:101-180`, `lib/repositories/searing-event-repository.ts:198-224`).
- Current searing storage is GCS-backed: `SearingStorageService.uploadSearedImage()` uploads PNGs with immutable cache headers and returns `https://storage.googleapis.com/{bucket}/{object}` (`lib/services/searing-storage.ts:51-65`, `lib/services/searing-storage.ts:72-91`). Existing unit tests encode GCS URLs as expected behavior (`tests/unit/searing-storage.test.ts:20-23`, `tests/unit/searing-materialization-service.test.ts:103-120`).
- Production token 4702 showed local-relative seared URLs in `/api/characters/4702` and `/api/characters/4702/searing`, but selected source code does not explain how future materialization would produce `/images/characters/4702.png?v=seared-...`; that appears to be state drift, manual repair, or an untracked rewrite/import path (`docs/investigations/local-hosted-character-images-2026-06-03.md`).
- Prior investigations: `docs/investigations/character-30-metadata-image-2026-06-03.md` covers token 30 root cause; `docs/investigations/local-hosted-character-images-2026-06-03.md` covers image contract split; `docs/investigations/searing-image-generation-2026-05-08.md` separates indexing from materialization; `docs/investigations/searing-updated-metadata-original-image-2026-05-28.md` shows searing composition uses root trait attributes, not `image_url` or previous seared image.

## Approach

### Chosen product contract
Use this plan's contract as the implementation target:

1. Static metadata remains canonical original provenance.
   - `public/metadata/characters/{tokenId}.json` is treated as an original NFT snapshot.
   - Its `image` value means original/canonical source image, not current served image.
   - Static snapshots are not overwritten from current DB metadata during normal asset collection.
2. DB/read-model owns current served state.
   - Served metadata and runtime APIs use current local/app-origin image URLs.
   - Legacy fields (`metadata.image`, top-level `image_url`) remain current-image aliases for compatibility.
   - Original image references are preserved explicitly as `metadata.originalImage` and DB original fields.
3. Local/app-origin means public image URLs should be under the app origin. Preserve `/images/characters/{tokenId}.png` as the stable smart-contract/base image path, and use a versioned current-image route such as `/images/characters/current/{tokenId}.png?v=...` for mutable altered/seared state. GCS may remain backing storage, but app-visible current URLs should not be raw `storage.googleapis.com` URLs.
4. Searing updates current image and current metadata, while preserving original image and original metadata provenance.

### Data model
Add an additive migration for current/original image state on `wagdie_characters`:

- `original_image_url text null`
- `original_metadata_sha256 text null`
- `current_image_url text null`
- `current_image_version text null`
- `current_image_kind text null` using at least `base`, `seared`, `infected`, and `placeholder`; allow additive states such as `repair` if the migration/backfill flow needs them.
- `current_image_sha256 text null`
- `current_image_storage jsonb not null default '{}'::jsonb`
- `current_image_updated_at timestamptz null`

`current_image_storage` should use this stable shape:

```ts
{
  type: 'public-static' | 'gcs'
  objectName?: string
  backingUrl?: string
  localPath?: string
}
```

Keep `image_url` as the legacy/current alias and keep it equal to `current_image_url` after migration/backfill.

Extend `CharacterMetadata` with optional compatibility/provenance fields:

- `originalImage?: string`
- `currentImage?: { url, version, kind, sha256?, source, updatedAt, storage? }`

Use source values as an audit trail: `verified-local-base`, `searing-materialization`, `infection-materialization`, or `repair`.

Compatibility rules:

- DB `metadata.image` becomes the current served image URL.
- DB `metadata.originalImage` preserves the original static/IPFS image.
- Existing searing fields remain valid: `isSeared`, `searImage`, `searedConcord`, `searing_materialization.seared_image_url`.
- Searing also updates dynamic seared attributes (`Seared Trait`, `Seared Token`, `Concord`) where the existing resolver/materialization metadata can provide them.

### Verified base asset manifest
Upgrade `public/metadata/characters/manifest.json` from an existence list into an audit artifact. Each item should be able to answer: what original source did we mirror, what bytes did we fetch, what local file do we serve, and has it been verified?

Target manifest fields:

- `token_id`
- `metadata_file`
- `metadata_sha256`
- `original_image_url`
- `source_image_url`
- `source_image_sha256`
- `source_content_type`
- `source_byte_length`
- `local_base_image_file`
- `local_base_image_url`
- `local_base_image_sha256`
- `local_base_image_byte_length`
- `local_base_image_content_type`
- `current_base_image_url`
- `current_base_image_version`
- `verification_status`: `verified`, `missing_local`, `source_unreachable`, `hash_mismatch`, `download_failed`, or `unverified_existing`
- `verified_at`
- `verification_error`

`hasLocalCharacterImage()` must eventually mean verified local base image, not merely valid token ID. Server-side code can read rich manifest details; client-safe generated status should stay small.

### App-origin current image route
Do not rely on runtime writes to `public/`. Add an app-origin current image route backed by verified public base files and/or durable backing storage such as GCS. This route complements, but does not replace, the stable smart-contract/base path at `/images/characters/{tokenId}.png`:

- Route shape: `/images/characters/current/{tokenId}.png?v={version}`.
- Version formats: `base-{sha16}` for verified base images and `seared-{tx8}-log{logIndex}-{sha16}` for materialized sears.
- Suggested file: `app/images/characters/current/[file]/route.ts` with `runtime = 'nodejs'`.
- The `/current/` subpath avoids collision with existing static `public/images/characters/{id}.png` files, which must remain available for smart-contract/base URI compatibility; verify this with a route test.
- With version query: return `Cache-Control: public, max-age=31536000, immutable`.
- Without version query: use short cache or `no-store`.
- For `kind=base`, read verified base file from `public/images/characters/{tokenId}.png` only if manifest verification matches.
- For generated/seared images, fetch the `backingUrl` over HTTPS from the existing public GCS object and stream it through the app-origin route. If the bucket later becomes private, this route's internals can switch to the GCS SDK without changing public URLs.
- Return `404` for unverified/missing current images; route/API callers may then degrade to original metadata image explicitly rather than silently serving a wrong local PNG.

Add shared URL helpers for app-relative and absolute URL construction so metadata route, materialization, repair scripts, and tests use the same version format.

### Served metadata builder
Create a central service (e.g. `lib/services/character-served-metadata-service.ts`) that builds NFT metadata from original static JSON plus current DB/read-model state:

1. Read original static JSON.
2. Fetch hydrated character/current image state.
3. Build response from original metadata.
4. Replace `image` with absolute current app-origin URL when verified/current exists.
5. Include original provenance fields: `original_image` plus optional structured `image_provenance`.
6. Overlay seared current fields and dynamic seared attributes when the character is seared: `Seared Trait`, `Seared Token`, and `Concord`.
7. Preserve current route behavior around CORS/cache and `animation_url` removal. Animation support is explicitly out of scope for this pass and can be revisited later if product needs it.

Degraded behavior:

- Missing static metadata remains `404`.
- DB unavailable but verified base manifest exists: serve verified base current image.
- No verified current image: preserve original `image` and use conservative cache; do not blanket-serve unverified local files. Runtime character APIs should use the same degraded behavior, exposing original image as the explicit fallback before placeholder.

### Searing current-image storage
Keep GCS as durable backing storage if desired, but stop using raw GCS URLs as served current URLs. Introduce a current-image storage/localizer service, for example `lib/services/assets/character-current-image-storage.ts`, with an interface returning:

- `publicPath`: `/images/characters/current/{tokenId}.png?v=seared-{tx8}-log{logIndex}-{sha16}`
- `version`
- `sha256`
- `storage`: backing descriptor such as `{ type: 'gcs', objectName, backingUrl }`

Wire this before `CharacterMaterializationRepository.updateSearingReadModel()` and `SearingEventRepository.markCompleted()` so DB rows and events store the app-origin current URL, while backing storage details go into `current_image_storage` and `materialization_metadata`. The searing update path must also seed `original_image_url` and `metadata.originalImage` from static metadata when missing, so a sear cannot race ahead of the backfill and lose provenance.

### Migration/backfill/repair workflow
Add an idempotent repair command, e.g. `scripts/repair-current-character-images.ts`, with dry-run by default and scoped modes (`--token`, `--tokens`, `--range`, `--all --yes`, `--repair-base`, `--repair-seared`, `--refresh-opensea`). It should:

1. Populate original image fields from static metadata.
2. Verify or repair base images against canonical source bytes.
3. Set base current fields for verified base images.
4. Scan completed searing events.
5. Convert legacy external/GCS seared URLs into app-origin current URLs backed by durable storage descriptors.
6. Update `wagdie_characters` and `searing_events` together for repaired sears.
7. Emit token IDs requiring marketplace refresh.

## Work Items

### Item 1 — Define shared current/original image types and URL helpers
**Goal:** Establish the vocabulary and URL construction used by later DB, route, searing, and script work.

**Done when:**
- `types/character.ts` includes optional current/original image fields without breaking existing consumers.
- A shared helper builds app-relative and absolute `/images/characters/current/{tokenId}.png?v={version}` URLs.
- Version format is pinned to `base-{sha16}` and `seared-{tx8}-log{logIndex}-{sha16}`.
- No runtime behavior changes yet.

**Key files:** `types/character.ts`, new helper under `lib/services/assets/` or `lib/utils/`, `lib/utils/image.ts:199-221`.

**Dependencies:** None.

**Size:** S.

### Item 2 — Add additive DB migration for current image state
**Goal:** Give the DB read model explicit fields for original provenance and current served image state.

**Done when:**
- A new Supabase migration adds original/current image columns to `wagdie_characters`.
- Migration is additive and rollback-safe; no existing field is removed.
- TypeScript types/repository row types can read/write the new columns.

**Key files:** `supabase/migrations/`, `types/character.ts`, `lib/repositories/character/character-query-repository.ts:429-446`, `lib/db/tables.ts:11-14`.

**Dependencies:** Item 1.

**Size:** M.

### Item 3 — Extract asset verification primitives
**Goal:** Make base image correctness verifiable by bytes and provenance, not file existence.

**Done when:**
- Hash/content-type/candidate normalization helpers exist and can compare local bytes to canonical source bytes.
- IPFS gateway normalization continues to support existing behavior.
- Token 30-style mismatch can be represented in a unit test without live network.

**Key files:** `scripts/collect-character-assets.ts:99-149`, `scripts/collect-character-assets.ts:252-365`, new helper module if extraction is useful, `tests/`.

**Dependencies:** Item 1.

**Size:** M.

### Item 4 — Upgrade asset collection manifest and verified local status
**Goal:** Turn `assets:collect` into a verified local mirror generator for original/base images.

**Done when:**
- Existing local files are verified against canonical metadata/source bytes instead of blindly accepted (`scripts/collect-character-assets.ts:467-499`).
- Manifest includes source/local hash, byte length, content type, verification state, original source URL, current base URL, and mismatch reason.
- Static original metadata is preserved by default rather than overwritten from current DB fields.
- Generated local status means verified base availability, not broad token range.
- All consumers of `hasLocalCharacterImage()` or generated local status are audited and either moved to richer current-image state or explicitly kept on verified-base-only semantics.
- Collector seared candidate order matches runtime order where dynamic repair is involved.

**Key files:** `scripts/collect-character-assets.ts`, `lib/data/local-character-asset-status.ts`, `public/metadata/characters/manifest.json`, `lib/utils/image.ts:166-187`.

**Dependencies:** Items 1 and 3.

**Size:** L.

### Item 5 — Update character hydration for original/current fields
**Goal:** Make normal character APIs return a coherent current image while preserving original provenance.

**Done when:**
- `characterLocalAssets` reads upgraded manifest fields.
- Hydrated metadata includes `originalImage` and `currentImage` where available.
- Hydrated top-level `image_url` uses verified current image URL, seared/infected current state, or placeholder; it no longer trusts unverified base local files.
- Existing dynamic merge behavior for seared/infected fields is preserved.

**Key files:** `lib/services/assets/character-local-assets.ts:30-39`, `lib/services/assets/character-local-assets.ts:153-211`, `lib/services/assets/character-local-assets.ts:252-269`, `lib/domain/character/character-runtime-assets.ts`.

**Dependencies:** Items 1, 2, and 4.

**Size:** L.

### Item 6 — Add app-origin current image serving route
**Goal:** Provide a stable app-origin URL for current character images without relying on runtime writes to `public/`.

**Done when:**
- `/images/characters/current/{tokenId}.png?v={version}` serves verified base images and durable-storage-backed current/seared images.
- The route refuses unverified or missing images with `404`.
- Cache headers are immutable when a version is present.
- Tests cover verified base, GCS-backed seared, missing/unverified, and cache behavior.

**Key files:** new `app/images/characters/current/[file]/route.ts`, `lib/services/searing-storage.ts:51-91`, new URL/helper service, `docs/reference/routes-and-apis.md`.

**Dependencies:** Items 1, 2, and 4.

**Size:** L.

### Item 7 — Build served metadata from original plus current read model
**Goal:** Make `/api/characters/metadata/{id}` serve current local/app-origin metadata while preserving original image provenance.

**Done when:**
- A central metadata builder reads original static JSON and current DB/hydrated state.
- Returned `image` is an absolute app-origin current image URL when verified/current exists.
- Returned metadata includes original provenance, e.g. `original_image` and/or structured `image_provenance`.
- Seared characters expose current seared image and dynamic/seared metadata according to the chosen contract.
- Existing CORS/cache/error behavior is preserved.
- Token 30 route tests are updated to expect verified local current image plus original provenance, not unverified local fallback.

**Key files:** `app/api/characters/metadata/[tokenId]/route.ts:64-83`, new `lib/services/character-served-metadata-service.ts`, `tests/api/characters-metadata-route.test.ts:37-91`, `public/metadata/characters/30.json`, `public/metadata/characters/4702.json`.

**Dependencies:** Items 2, 5, and 6.

**Size:** L.

### Item 8 — Store seared images as app-origin current images
**Goal:** Ensure future searing writes proper current local/app-origin image URLs everywhere.

**Done when:**
- Materialization stores generated PNG bytes through a current-image storage/localizer service.
- `SearingMaterializationService` receives an app-origin URL descriptor, not raw GCS URL, for DB/event writes.
- `CharacterMaterializationRepository.updateSearingReadModel()` preserves original image fields and updates current columns, `image_url`, `metadata.image`, `metadata.currentImage`, `metadata.searImage`, and `metadata.searing_materialization.seared_image_url` consistently.
- `SearingEventRepository.markCompleted()` stores the app-origin seared URL and backing storage details in materialization metadata.
- Completed/cache-safe detection accepts the new app-origin seared URL format.

**Key files:** `lib/services/searing-materialization-service.ts:409-448`, `lib/repositories/character-materialization-repository.ts:101-180`, `lib/repositories/searing-event-repository.ts:198-224`, `lib/services/searing-storage.ts:51-91`, `tests/unit/searing-materialization-service.test.ts:103-120`, `tests/unit/searing-storage.test.ts:20-23`.

**Dependencies:** Items 1, 2, and 6.

**Size:** L.

### Item 9 — Add repair/backfill tooling for existing base and seared rows
**Goal:** Safely migrate current production data into the new contract and repair stale/mismatched images.

**Done when:**
- A dry-run-first repair script can target one token, a token list, a range, or all tokens.
- Base repair verifies original images, fixes token 30-style mismatches, and populates current base fields.
- Seared repair scans completed `searing_events`, rewrites/repairs legacy GCS or local-relative rows into the app-origin current route contract, and updates character/event rows together.
- Script outputs a list of tokens needing marketplace refresh.
- Script is idempotent and logs before/after values for audit.

**Key files:** new `scripts/repair-current-character-images.ts`, `scripts/import-gcs-images.ts`, `scripts/point-images-to-local.ts`, `scripts/materialize-searing-events.ts`, `scripts/refresh-opensea-metadata.ts`, `lib/repositories/searing-event-repository.ts:198-224`.

**Dependencies:** Items 2, 4, 6, 7, and 8.

**Size:** XL.

### Item 10 — Update runtime image policy and character-page provenance UI
**Goal:** Keep UI/runtime display aligned with the new current-image contract and make image provenance visible on the character page.

**Done when:**
- `lib/utils/image.ts` recognizes `metadata.currentImage.url` and uses `metadata.originalImage` only as the explicit degraded fallback before placeholder when no verified/current image exists.
- Callers that previously relied on local-image existence as a proxy for display safety are audited against the new verified-current/verified-base distinction.
- Infected and seared precedence remains intact.
- Character cards, sheets, staking sidebar, and searing UI continue using shared helpers without per-component source logic.
- The character detail page exposes, in an appropriate UI section, the current/altered image, the preserved original image, and the canonical IPFS/source image link when available.
- Tests cover current image precedence, original image preservation, seared current image, infected current image, fallback behavior, and character-page provenance display.

**Key files:** `lib/utils/image.ts:112-120`, `lib/utils/image.ts:166-221`, `hooks/useCharacterImageDisplay.ts:24-53`, `components/characters/CharacterCard.tsx`, `components/characters/detail/`, `app/characters/[tokenId]/`, `components/searing/SearingResultPreview.tsx`, `tests/unit/image.test.ts`, `tests/components/characters/detail/`.

**Dependencies:** Items 1, 5, and 8.

**Size:** M.

### Item 11 — Operational rollout, docs, and marketplace refresh
**Goal:** Make the migration repeatable and observable in production.

**Done when:**
- Operations docs define the sequence: run verified asset audit, repair/backfill base current fields, repair seared rows, deploy metadata/current routes, run materialization worker, and output the operator-owned marketplace refresh list.
- Reference docs describe the permanent `/images/characters/{id}.png` base/smart-contract image path, `/images/characters/current/{id}.png` altered-current image path, and served metadata semantics.
- Monitoring reports the leading rollout gates: tokens with missing `current_image_url`, completed searing events with non-app-origin `seared_image_url`, and verified manifest mismatches. Additional metrics can be added after rollout.
- Rollback guidance documents falling back to original static image without serving unverified local bytes.

**Key files:** `docs/operations/data-sync-and-assets.md`, `docs/reference/routes-and-apis.md`, `app/api/sync/searing/route.ts`, `scripts/materialize-searing-events.ts`.

**Dependencies:** Items 7, 8, 9, and 10.

**Size:** M.

## Migration and Rollout Sequence
1. Merge code/data model changes behind existing behavior where possible: types, URL helpers, migration.
2. Deploy additive DB migration before any writer uses new columns.
3. Run asset verification in dry-run for token 30 and a small known-good range.
4. Update collector and generate upgraded manifest/status in a branch; inspect token 30 mismatch output.
5. Deploy current image route and served metadata builder with degraded fallback to original image when current is unavailable.
6. Backfill verified base current fields for all verified tokens.
7. Update searing materialization storage/read-model writes.
8. Repair existing seared rows, including token 4702, into the app-origin current route contract.
9. Produce the changed-token list for manual OpenSea/marketplace refresh by the operator.
10. Enable monitoring/alerts for local-only policy violations.

## Risks and Rollback
- **Serverless filesystem:** do not rely on writing generated seared PNGs to `public/` at runtime. Use app-origin route backed by durable storage.
- **Marketplace caches:** every image-byte change needs a version change and marketplace refresh.
- **DB/static divergence:** static JSON becomes original provenance while DB/read-model becomes current. This is intentional but must be documented.
- **Legacy GCS rows:** old seared rows may remain external until repair runs.
- **Unreachable IPFS sources:** mark as `source_unreachable`; do not mark local files verified unless bytes can be proven or an operator explicitly accepts a stored expected hash.
- **Rollback:** additive DB columns preserve old data; metadata route can fall back to original static `image`; GCS backing objects remain immutable; app-origin current route can be disabled without deleting stored bytes.

## Open Questions
None. `/images/characters/{id}.png` is treated as permanent because it is needed for smart-contract/base URI compatibility.

## References
- `docs/investigations/character-30-metadata-image-2026-06-03.md`
- `docs/investigations/local-hosted-character-images-2026-06-03.md`
- `docs/investigations/searing-image-generation-2026-05-08.md`
- `docs/investigations/searing-updated-metadata-original-image-2026-05-28.md`
- `docs/operations/data-sync-and-assets.md`
- `docs/reference/routes-and-apis.md`
