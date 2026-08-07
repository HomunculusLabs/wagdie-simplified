# Architecture Overview

This page is the evergreen system map for the WAGDIE Simplified app. It summarizes current seams and points to source files that remain authoritative.

## Source map

- **App shell and routes:** `app/layout.tsx`, `app/page.tsx`, route folders under `app/`, and API handlers under `app/api/*`.
- **Client providers:** `components/providers.tsx` wires Wagmi, RainbowKit, React Query, transaction state, and the chat dock.
- **API helpers:** route handlers use shared helpers from `lib/api/*`, domain services from `lib/services/*`, repositories from `lib/repositories/*`, and integration clients from `lib/eliza/*`, `lib/contracts/*`, and `lib/supabase.ts`.
- **Schema truth:** Supabase migrations live in `supabase/migrations/`; docs should not duplicate table inventories.
- **Script truth:** runnable scripts are declared in `package.json`; implementation lives under `scripts/`.
- **Tests:** Jest tests are organized by area under `tests/`.

## Runtime and app shell

The app is a Next.js 15 App Router application using React 18 and TypeScript. `package.json` pins Node `23.3.0`; command examples should use Bun first and defer the full script list to `package.json`.

`app/layout.tsx` imports `@/lib/utils/server-browser-globals` before global CSS and wraps every page in `Providers`, `Header`, and `Footer`. `components/providers.tsx` installs the app-wide client providers:

- `WagmiProvider` with `lib/wagmi.ts` configuration.
- `QueryClientProvider` for React Query state.
- `RainbowKitProvider` for wallet UI.
- `TransactionProvider` for transaction state.
- `ChatDockProvider`, `ChatDock`, and `ChatToggleButton` for the global Eliza chat dock.

`middleware.ts` has two cross-cutting responsibilities: it can proxy local `/api/*` requests to `WAGDIE_API_BASE_URL` for UI-only development, and it sets the page-load CSRF cookie outside excluded static/public routes.

## App Router areas

Pages are grouped by user-facing product area under `app/`:

- `app/characters/*` — character browser, character detail, and animated character view.
- `app/map/page.tsx` — Phaser-backed world map and staking sidebar.
- `app/map-editor/*` and `app/searing-map-editor/*` — map editing tooling.
- `app/searing/*` and `app/spread/*` — searing, infection, cure, and related token flows.
- `app/lore/*` — effective public lore built from base lore, published base-event overrides, and auto-public community submissions; see `docs/architecture/lore-source-of-truth.md` for source boundaries and `docs/architecture/lore-submission-lifecycle.md` for submission lifecycle/admin moderation semantics.
- `app/videos/*` — low-poly video gallery.
- `app/admin/*` — admin-only management surfaces.

The route reference belongs in `docs/reference/routes-and-apis.md`; this page only names the areas and architecture boundaries.

## API route pattern

API handlers live under `app/api/*` and should stay thin when a domain has reusable logic. Common patterns in current code:

- `app/api/characters/route.ts` parses query parameters with `lib/api/params`, calls `getCharacters()` from `lib/services/character-service.ts`, and returns responses through `lib/api/responses`.
- `app/api/characters/[tokenId]/route.ts` delegates GET/PATCH behavior to `lib/api/handlers/character-update.ts`.
- `lib/api/handlers/character-update.ts` handles session checks, admin/owner authorization, field allow-listing, stat validation, and calls `updateCharacter()`.
- Eliza routes use `lib/eliza/sessionAuth.ts`, `lib/eliza/characterResolver.ts`, and `lib/eliza/client.ts`; see `docs/architecture/eliza-and-backend.md`.

Routes that need Node-only libraries declare `export const runtime = 'nodejs'` where required.

## Data and persistence

Supabase/Postgres access is centralized where practical:

- `lib/supabase.ts` builds browser-safe anon clients and server-only admin clients. Server code prefers runtime `SUPABASE_*` values; browser code can only use `NEXT_PUBLIC_*` values.
- Character reads and writes go through `lib/services/character-service.ts` and `lib/repositories/character-repository.ts`. The repository facade delegates specialized concerns to `lib/repositories/character/*`.
- Location, lore, searing, concord, event, and Eliza persistence have repositories under `lib/repositories/*`, `lib/lore/*`, and `lib/eliza/*`.
- Official ElizaOS conversation mappings are persisted by `lib/eliza/officialConversationRepository.ts` in the `eliza_official_conversation_links` table created by migrations.

Treat `supabase/migrations/` and typed data access files as the source of truth. For lore-specific source boundaries, use `docs/architecture/lore-source-of-truth.md`. Avoid copying schema checklists into docs.

## Blockchain and authentication

Wallet and chain state are split between browser providers, API sessions, and contract helpers:

- `lib/wagmi.ts` configures Wagmi chains, injected/Coinbase connectors, mainnet RPC fallbacks, and Sepolia RPC URL selection.
- `lib/contracts/addresses.ts` centralizes mainnet/Sepolia contract addresses and optional env overrides.
- `components/providers.tsx` places `WagmiProvider` and `RainbowKitProvider` around the UI.
- `app/api/auth/nonce/route.ts` issues SIWE nonces and stores them in an HTTP-only cookie.
- `app/api/auth/verify/route.ts` validates the SIWE message/signature, checks the cookie nonce, then stores wallet auth in `iron-session` via `lib/auth/session.ts`.
- Character mutation routes use the session address, admin checks, and `canEditCharacter()` to gate writes.

Blockchain transactions are initiated from UI hooks/components and reconciled through API/sync flows after confirmation. Contract-specific operational procedures belong in operations docs, not this architecture overview.

## Map and Phaser boundary

The map is the main browser-only subsystem. `app/map/page.tsx` dynamically imports `game/PhaserGame.tsx` with SSR disabled, collects data through map hooks, and passes React callbacks into the Phaser bridge. `game/PhaserGame.tsx` owns Phaser lifecycle and subscribes to typed events from `game/EventBus.ts`. `game/scenes/MapScene.ts` renders the map, markers, panning, zooming, and editor interactions.

See `docs/architecture/map-and-phaser.md` for the detailed React↔Phaser event contract.

## Eliza and backend boundary

Eliza integration uses WAGDIE-owned API routes as the stable browser contract. `app/api/eliza/chat/route.ts` is the representative route: it requires wallet and Eliza auth, verifies the WAGDIE character, resolves or creates an Eliza record, and streams Server-Sent Events back to the browser as `token`, `complete`, and `error` events.

`lib/eliza/client.ts` selects either the legacy/custom gateway or the official ElizaOS adapter based on `ELIZA_INTEGRATION_MODE`. See `docs/architecture/eliza-and-backend.md` for the route/gateway contract.

## Scripts, assets, and tests

- `scripts/` contains asset localization, metadata extraction/compare, GCS import, searing materialization, lore seed/parity, indexers, and ElizaOS validation utilities.
- `package.json` is the command inventory; docs should describe categories and link to script names rather than duplicating every command.
- `tests/` mirrors major app areas: API routes, Eliza gateway/auth, hooks, map behavior, repositories, services, unit utilities, and selected e2e/security tests.

## Architecture guardrails

- Keep browser-only APIs behind client components or runtime guards; Phaser and wallet providers should not be imported into server components directly.
- Keep API routes focused on HTTP parsing, authorization, and response shape. Put reusable behavior in `lib/api/handlers`, services, repositories, or integration clients.
- Keep schema facts in migrations and data-access code.
- Keep lore source-of-truth and canonization vocabulary aligned with `docs/architecture/lore-source-of-truth.md`.
- Keep operational procedures under `docs/operations/*` and route inventories under `docs/reference/*`.
