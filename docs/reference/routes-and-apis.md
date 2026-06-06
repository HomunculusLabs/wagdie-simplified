# Routes and API Areas

This is a maintained index of WAGDIE Simplified route and API areas. It is not generated per-route API documentation.

## Source of truth

- App pages and layouts: `app/`
- API route handlers: `app/api/*/route.ts`
- Shared API helpers, repositories, and services: `lib/`
- Route tests: `tests/api/`, `tests/integration/`, and related service tests

When this page conflicts with route handlers or tests, trust the code and update the index.

## Page route areas

| Route area | Source | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Public landing page. |
| `/characters` | `app/characters/page.tsx` | Character browser and filters. |
| `/characters/[tokenId]` | `app/characters/[tokenId]/page.tsx` | Character details, sheet tabs, ownership-aware editing, wallet/actions, and AI persona surfaces. |
| `/characters/[tokenId]/animated` | `app/characters/[tokenId]/animated/` | Public animated character view; deployment config allows cross-origin embedding. |
| `/map` | `app/map/page.tsx` | Phaser-backed map and staking experience. |
| `/map-editor` | `app/map-editor/page.tsx` | Map/location editing tools. |
| `/searing` | `app/searing/page.tsx` | Searing and concord flow UI. |
| `/searing-map-editor` | `app/searing-map-editor/page.tsx` | Concord-to-searing map tooling. |
| `/spread` | `app/spread/page.tsx` | Infection/spread interaction UI. |
| `/lore` and nested lore routes | `app/lore/` | Lore archive, entity detail pages, community submissions, and submit flow. |
| `/videos` | `app/videos/page.tsx` | Low-poly video gallery. |
| `/admin` and nested admin routes | `app/admin/` | Admin shell, map location tooling, lore submissions/canonization, and searing-map admin areas. |

## API area index

### Auth

Source: `app/api/auth/`

Area includes SIWE/session endpoints such as nonce, verify, logout, and current-user/session lookup. Session implementation details live under `lib/auth/`.

### Character and characters

Sources: `app/api/character/` and `app/api/characters/`

Area includes character browse/detail data, metadata, animation metadata, traits/origins/alignments, nested concord data, staking status, searing preview/sync, events, and character update flows. Business logic should live in services/repositories where practical rather than directly in route files.

Character metadata and images use an original/current split:

- `/api/characters/metadata/[tokenId]` serves NFT metadata built from the original static snapshot plus current read-model state. `image` is a verified current app-origin URL when one exists; `original_image` and `image_provenance` preserve the canonical source/original image. When current image resolution fails, the route falls back to the original static image rather than unverified local bytes.
- `/images/characters/{tokenId}.png` is the permanent base/smart-contract compatibility image path. It represents the local mirrored base image and must remain available for base URI compatibility.
- `/images/characters/current/{tokenId}.png?v={version}` is the mutable-state current image route. Use `base-{sha16}` versions for verified base images and `seared-{tx8}-log{logIndex}-{sha16}` versions for materialized sears. Versioned responses are intended to be cache-safe; unversioned current requests should not be treated as immutable.
- Current/seared images should be app-origin URLs even when their durable backing object is in GCS. API responses and served metadata should not expose raw GCS URLs as the primary current image after repair/materialization.

### Concords

Source: `app/api/concords/`

Area includes owned concord lookup, concord transfers, and searing-map data by concord or collection.

### Locations and map data

Source: `app/api/locations/`

Area includes location reads and updates used by the map, staking sidebar, and admin/editor surfaces.

### Sync jobs

Source: `app/api/sync/`

Area includes protected or targeted reconciliation endpoints:

- ownership sync;
- staking sync;
- searing materialization/sync;
- Eliza location-room scheduled worker.

Some sync routes require `SYNC_SECRET_KEY`; see `docs/operations/data-sync-and-assets.md`.

### Eliza and ElizaOS

Source: `app/api/eliza/`

Area includes Eliza app auth, chat streaming, conversations, character import/export and persona records, knowledge documents, and location rooms.

The chat route preserves the browser SSE contract with `token`, `complete`, and optional `error` events while server-side gateway selection is handled under `lib/eliza/`.

Operational validation belongs in `docs/operations/elizaos-validation.md`.

### Lore submissions and admin lore

Sources: `app/api/lore/` and `app/api/admin/lore/`

Area includes community lore submissions, user-facing submission detail/update flows, admin submission review/curation, and canonization workflows.

### Tweets

Source: `app/api/tweets/route.ts`

Area provides tweet/lore-feed data for UI surfaces that still consume tweet-shaped records.

## Route behavior notes

- Middleware can proxy `/api/*` to `WAGDIE_API_BASE_URL` for UI-only local development; local API handlers are bypassed when that proxy is active.
- Middleware also sets CSRF cookies on page requests and skips that cookie for public animated NFT pages.
- `next.config.js` adds CORS headers for fonts, character images, animated character pages, and character metadata responses.
- Character image display helpers prefer infected art, then seared/current altered art, then structured `metadata.currentImage.url`, then verified base assets, then explicit `metadata.originalImage` provenance fallback before the placeholder.
- API contracts should be verified against route tests and route handlers before documenting request/response details.

## Adding or changing routes

When adding a route area or changing a contract:

1. Update or add route tests for meaningful behavior.
2. Keep domain logic in `lib/` services/repositories where practical.
3. Update this index if the route belongs to a new area or changes the purpose of an existing area.
4. Add operational details to `docs/operations/` only if the route is part of a repeatable runbook.
5. Avoid turning this page into generated per-route documentation; cite source files instead.
