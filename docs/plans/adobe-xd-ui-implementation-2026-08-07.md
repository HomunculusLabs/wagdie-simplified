# Adobe XD UI Implementation Plan

## Goal

Translate the July 29, 2026 `Wagdie_UI_UX` Adobe XD handoff into a responsive, accessible redesign of the matching public WAGDIE surfaces without changing settled data, wallet/auth, lore, Phaser, chat, or persistence architecture.

The work is primarily a presentation and information-architecture refactor: `/lore` becomes the canonical **Archive** with URL-addressable Timeline and Lore Characters views; `/characters` remains the NFT collection; lore and NFT character details remain distinct; and a new current-user `/profile` route composes existing wallet identity, owned characters, supported game-token holdings, and authenticated lore submissions without introducing a general profile database.

## Background

### Design handoff evidence

- The source is the [Adobe XD developer spec](https://xd.adobe.com/view/e8de645e-88b1-4ef1-8f8e-f685f5fc01b4-bd8d/specs/), revision 5, modified July 29, 2026. It contains eight 1920px-wide desktop artboards with a 1080px prototype viewport and no tablet or mobile artboards.
- The artboards represent public and authenticated home states, Archive timeline, Archive character listing, Event detail, canon and community lore-character details, and a wallet Profile page. The recorded graph links home/archive/event/character flows but does not demonstrate wallet connection, drawer opening, filters/search/sort, audio, loading/error/empty/disabled states, or keyboard/touch behavior.
- Repeated patterns include the desktop header/footer, account drawer, event and character cards, Canon/Community badges, archive filters, community CTA, audio bar, and reference tiles. XD exposes only four symbols, each with a single default state, so production component states must come from current repository behavior.
- The handoff specifies Hold Money for display/UI, Inter for body copy, Helvetica Neue for footer copy, near-black/brown surfaces, `#E9C793` gold, and purple accents (`#B690EB`, `#7453A3`, `#7549B4`). It does not provide semantic token names, a grid, spacing tokens, or responsive rules.
- Asset export is disabled and the exported-assets collection is empty. Hero, event, character, token, map, social, audio, and ornamental imagery is visible, but original formats, crops, dimensions, and licensing/source-of-truth are not supplied.
- Lorem ipsum, spelling errors, inconsistent character/account names, and a 2025 footer date are presentation placeholders, not production content.

### Current application seams

- `app/layout.tsx:37-52` owns the single global `Providers → Header → main → Footer` shell. `components/providers.tsx:23-101` also mounts wallet/query/auth/transaction providers and global chat/persona docks whose open widths push desktop content.
- `components/layout/Header.tsx:25-144` owns the sticky responsive header, mobile navigation, wallet controls, and current menu trigger. Its overlay, body-scroll lock, connected actions, and admin links continue at `components/layout/Header.tsx:146-290`; this is the seam for the XD account experience rather than a parallel shell.
- `components/layout/Navigation.tsx:13-58` is the public route registry. Lore visibility depends on `NEXT_PUBLIC_SHOW_LORE_NAV`; Searing and Spread remain connected-wallet actions.
- `/characters` owns URL-addressable browse filters, responsive desktop/mobile filters, query states, card grid, and pagination (`app/characters/page.tsx:27-51`, `app/characters/page.tsx:128-345`). `/characters/[tokenId]` preserves a server validation/lore-preload boundary before `CharacterDetailClient` orchestrates ownership, editing, image, AI, chat, and modal behavior (`app/characters/[tokenId]/page.tsx:14-55`, `app/characters/[tokenId]/CharacterDetailClient.tsx:7-38`).
- `/lore` is a force-dynamic server page that parses URL filters and loads effective archive data (`app/lore/page.tsx:10-36`). `components/lore/LoreArchive.tsx:63-125` owns filters, result counts, timeline, and empty state; official and community detail routes deliberately retain different narrative/provenance hierarchies.
- Styling is Tailwind-first. Current gothic semantic tokens live in `tailwind.config.ts:20-70`; responsive behavior is primarily inline `sm`/`md`/`lg`/`xl` utilities. `public/fonts/HoldMoney-Regular.ttf` is already referenced as `Wagdie Fraktur` at `app/globals.css:40-44`, but repository presence does not establish license provenance for expanded use.
- Storybook imports production CSS and supplies application mocks (`.storybook/preview.tsx:45-134`), but its selected `mockState` and `mockStates` map are not passed into `MockAuthProvider`. Jest discovers tests only under `tests/` (`jest.config.js:1-29`).
- UI-only work can use Node 23.3.0/Bun and `WAGDIE_API_BASE_URL=https://fateofwagdie.com` without local Supabase (`docs/onboarding/quickstart.md:5-9`, `docs/onboarding/quickstart.md:27-41`).

### Prior art and boundaries

- The surviving 002/003 contracts established a wallet-aware shell and page-composition vocabulary, but their archived Next.js 13/Chakra/Firebase/Goerli assumptions are stale (`specs/002-basic-ui-wireframe/contracts/component-interfaces.ts:58-310`, `docs/archive/PAGE_WIREFRAMES.md:784-880`).
- Current guidance retains dark gothic surfaces, sharp edges, restrained glow, Tailwind/shared primitives, mobile-first layouts, semantic HTML, visible focus, keyboard access, and at least 44px primary touch targets (`docs/development/design-system.md:15-105`).
- The settled homepage, NFT character detail, and lore event architecture in `docs/plans/homepage-improvements-2026-05-11.md`, `docs/plans/character-page-coherence-2026-05-11.md`, and `docs/plans/event-pages-overhaul-2026-05-19.md` remains authoritative.
- Map, searing, spread, videos, location rooms, submissions, admin, and editor routes are absent from XD. They receive additive token/shell changes only; their composition and behavior stay out of scope.

## Executive Decisions

### Route and information architecture

| XD concept | Production destination | Decision |
|---|---|---|
| Public home | `/` | Restyle the existing consent-aware home. Do not create a second home route. |
| Authenticated home | `/` plus connected shell state | Authentication changes the header/account actions, not the homepage data contract. |
| Archive Timeline | `/lore` | Timeline is the default. Bare `/lore` remains canonical and backward compatible. |
| Archive Characters | `/lore?view=characters` | Add a URL-addressable narrative-character view linking to `/lore/characters/[slug]`. |
| Event detail | `/lore/events/[slug]` or `/lore/community/[slug]` | Preserve official/community route and provenance distinctions. |
| Canon/community character artboards | `/lore/characters/[slug]` | Adapt one lore profile to official, community-only, mixed, and sparse appearance data; do not invent character-level canon state. |
| NFT character inventory | `/characters` | Preserve token ownership, trait filters, wallet-aware tabs, and `/characters/[tokenId]` destinations. |
| NFT character detail | `/characters/[tokenId]` | Preserve the settled character sheet/editor/AI/chat/ritual surface. |
| Profile | `/profile` plus header account drawer link | Add a current-connected-wallet route backed by existing auth, character, game-token, and lore-submission sources; do not invent editable identity/settings/history. |

### Navigation semantics

- Rename the top-level **Lore** label to **Archive** while retaining `/lore` and `NEXT_PUBLIC_SHOW_LORE_NAV`.
- Keep **Characters** pointing to `/characters` and explicitly treat it as the NFT collection.
- Inside Archive, use ordinary links labeled **Timeline** and **Lore Characters**, with `aria-current="page"`; they are route navigation, not ARIA tabs.
- Do not redirect among `/characters`, `/lore?view=characters`, `/characters/[tokenId]`, and `/lore/characters/[slug]`.
- A lore profile with `tokenId` may expose a secondary **View NFT character sheet** link. It must not change the primary lore-profile destination.
- Active global navigation is exact for `/` and prefix-based for route families so nested lore/character pages keep their parent item active.

### Profile/account scope

Add a current-user-only `/profile` route; do not add a public `/profile/[address]` route. The page uses the connected wallet as the public-holdings key and the SIWE session only for private authored content.

Existing `useAuth` state (`hooks/useAuth.ts:10-29`) supplies wallet address, connected/authenticated/hydrating states, connect, authenticate, disconnect, and session refresh. Hydration accepts a session only when it matches the connected address and clears stale state on wallet change (`contexts/AuthContext.tsx:105-195`).

The XD sections map to existing sources as follows:

- **Identity:** current address and session-selected character from auth. No username, avatar, ENS reverse lookup, biography, join date, notification, or settings model exists (`app/api/auth/me/route.ts:8-27`). Display address-based identity only.
- **Owned Characters:** use the paginated `useCharacters({ tab: 'owned', wallet, ... })` contract (`hooks/useCharacters.ts:14-67`) rather than the capped `useOwnedCharacters` helper, which defaults to 100 and discards pagination metadata (`hooks/useOwnedCharacters.ts:8-32`, `hooks/useOwnedCharacters.ts:74-173`). Preserve the repository’s established meaning of owned-or-staked custody.
- **Owned Tokens:** present only supported WAGDIE game holdings. `useTokenBalances` supplies Concord, Corpse, and Mushroom aggregate balances; searing-mapped Concord items may reuse the indexed/RPC-backed coverage in `useSearingConcords`/`/api/concords/owned` (`hooks/useSearingConcords.ts:24-53`, `hooks/useSearingConcords.ts:130-160`). Label this as supported game-token coverage, not a complete arbitrary wallet inventory.
- **Archive Posts:** interpret the artboard section as the authenticated user’s lore submissions. `GET /api/lore/submissions` derives ownership from the SIWE session (`app/api/lore/submissions/route.ts:11-20`); reuse or extract the loading/error/empty semantics of `components/lore/submissions/UserSubmissionsList.tsx:20-110`.

The account drawer remains the compact identity/action surface and gains a primary **View profile** link. It does not duplicate full profile grids. Rich identity, arbitrary wallet assets, or authored content beyond lore submissions requires separately approved data/indexing work.

### Architecture boundary

- The `/profile` route reuses existing endpoints/hooks; no new repository, database, migration, serializer, authentication protocol, ownership source, or effective-lore domain schema is required for the scoped sections.
- No Phaser, chat/persona, transaction, video-consent, or character-detail orchestration rewrite.
- No second layout, route registry, wallet provider, lore query path, character repository, or dialog framework.
- New design tokens are additive; existing token meanings are not globally repurposed.

## Current-State and Data Flow

### Global shell

`RootLayout → Providers → Header + route content + Footer`. Provider ordering and persistent dock composition remain unchanged. The current content wrapper changes its desktop margin when chat/persona docks open; redesigned grids must react to available content width rather than assume the full viewport.

### Home

`useVideoConsent` remains the source of truth for the `wagdie_video_consent` cookie, session-only dismissal, consent modal, and `VideoPlayer`. Explicit grant/deny persists for one year; Escape, close, and backdrop dismissal do not persist denial. Static home cards continue to orient users without fetching lore, ownership, or map data.

### Archive

Current flow: `searchParams → parseLoreArchiveFilters → effective lore queries → LoreArchive → LoreFilterBar + LoreTimeline → LoreEventCard → official/community route`.

The new character view adds parsing and a server-side presentation transformation. It reuses effective lore characters/events; it does not add a client cache or a backend endpoint. Every filter/view/page navigation yields an authoritative server render.

### NFT collection/detail

`/characters` retains URL search params and wallet address as inputs to `useCharacterBrowseFilters`, React Query, facet hooks, loading/error/empty/grid/pagination rendering, debounce cleanup, query-key isolation, and back/forward restoration. `/characters/[tokenId]` retains server validation/lore preload and all client-owned editing, save, ownership, modal, image, AI, and chat state.

### Dock-aware content width

Existing chat/persona visibility events remain last-write-wins and idempotent. `ChatDockContentWrapper` already publishes `--chat-dock-offset` and applies it at `md+` (`components/providers.tsx:23-69`). Redesigned grids inherit the reduced content width, and the header drawer consumes `var(--chat-dock-offset)` for its desktop right edge. Do not introduce a parallel inset variable, import chat context into pages, or attach new dock listeners.

## Detailed Design

### Design tokens and typography

1. Map each XD color to an intent and existing-token check before adding anything: `#E9C793` → parchment/gold (compare `bone`, `soul-accent`, `gold`); `#B690EB` → light purple, `#7453A3` → base purple, and `#7549B4` → deep purple (compare `arcane`/current accent roles); add near-black/brown surfaces only if `soul-900`, `soul-950`, and `midnight` cannot express the measured hierarchy.
2. Name tokens for intent, not origin; never use names such as `xd-purple`.
3. Keep existing danger, success, canon, and community status colors authoritative.
4. Define typography roles:
   - `font-display` for brand and prominent page headings;
   - `font-ui` for navigation, buttons, controls, metadata, and compact cards;
   - `font-serif` for long-form lore prose.
5. `font-ui` uses a system-sans or existing Eskapade fallback until Inter provenance/binaries are approved. Do not globally replace lore prose or remap `body` merely to match the artboard.
6. Expanded Hold Money usage is conditional on project-owner confirmation of web-use and redistribution rights despite the existing binary.
7. Add global CSS only for approved `@font-face` declarations, a helper reused by at least three redesigned components, and reduced-motion behavior. Route layout stays in Tailwind utilities.

### Asset, font, audio, copy, and signoff gates

| Gate | Owner/evidence | Blocks | Fallback |
|---|---|---|---|
| Hold Money/Inter provenance | Product/legal/design: source, binary, web-use/redistribution terms | Exact typography and new font release | Existing repository fonts/system sans |
| XD raster/vector exports | Designer: originals, crop intent, source artboard, minimum dimensions, source/license | Asset-level parity | Existing repository imagery and CSS ornamentation |
| Event audio | Product/design: file, title, attribution, license, control behavior | Audio player only | Omit audio UI |
| Canonical copy | Product/content: approved home, CTA, footer, and account copy | Final copy signoff | Existing production copy |
| External links | Product: confirmed destinations | Link release | Existing environment-backed URLs |
| Visual signoff | Designer/product: production-data review at agreed widths | Production rollout | Keep preview unreleased |

Every delivered asset receives a manifest entry with source, owner, license, export date, target component, intrinsic dimensions, and alt/decorative classification. Originals remain owned by design/product; engineering owns optimized derivatives and repository naming under a dedicated subtree such as `public/images/ui/wagdie-ui-ux-2026/`.

Never ship screenshots, blurred reconstructions, broken images, lorem ipsum, XD typos, example wallet identities, or an inactive audio control. Missing decorative art falls back to CSS borders/gradients/current ornaments; missing content images use existing deterministic cover/portrait fallbacks. Structural work can proceed before gates pass; exact asset/font parity cannot.

### Shared editorial heading

Add `components/shared/EditorialHeading.tsx` as a server-compatible presentational component with this stable contract: `eyebrow?: ReactNode`, `title: ReactNode`, `description?: ReactNode`, `headingLevel?: 1 | 2 | 3`, `align?: 'left' | 'center'`, `id?: string`, and `className?: string`. It owns no state and never infers heading semantics from visual size. Keep route-specific headings separate if reuse would require route-specific variants.

Keep `Button`, `Card`, and `Badge` APIs stable. Add a primitive visual variant only when at least three features use it. Canon/community semantics stay in domain components such as `CanonStatusBadge`.

### Header and account drawer

Add `components/layout/HeaderDrawer.tsx` as the accessible replacement for the existing inline Header “Menu” drawer—not a coexisting second overlay. `Header` owns open state, computes admin status with the client-side pure `isAdmin(address)` function from `lib/auth/admin.ts:20`, and passes the result; admin state is not session-derived.

Explicit contract:

```text
HeaderDrawerProps:
  isOpen: boolean
  address?: string
  isConnected: boolean
  isAuthenticated: boolean
  isHydrating: boolean
  isAdmin: boolean
  onClose(): void
  onAuthenticate(options?: { force?: boolean }): Promise<void>
  onDisconnect(): Promise<void>
```

The drawer owns only pending/error display and focus lifecycle. Its conditional menu content preserves the existing public, social, connected, and admin destinations.

Required behavior:

1. Replace the existing drawer markup and `header-drawer` scroll-lock path atomically. Disconnected users retain the Menu trigger, public/social destinations, orientation copy, and connect affordance; they do not see empty account/profile sections.
2. Connected users see one address/account trigger. Remove the duplicate connected `WalletButton`/immediate-disconnect affordance, add the primary `/profile` link, and preserve `/lore/submit`, Searing, Spread, social, and admin destinations.
3. Content includes safely wrapped full/truncated address, wallet/SIWE state, authenticate action only when required, owned-character link, connected actions, public/social/admin links, and explicit disconnect.
4. Disable repeated authenticate/disconnect clicks while pending.
5. Successful disconnect closes the drawer. Failure preserves valid auth state, leaves the drawer open, and announces a retryable error through `aria-live`.
6. Address disappearance/change, route navigation, Escape, backdrop, or close control closes the drawer.
7. Restore focus to the trigger, trap Tab/Shift+Tab, use `role="dialog"`/`aria-modal`, retain at least 44px controls, and centralize body-scroll locking through existing utilities.
8. At desktop widths the panel and backdrop end at existing `var(--chat-dock-offset)` so they do not cover an open persistent dock; on mobile the variable is not applied and the drawer occupies the viewport.
9. Move full desktop navigation to `lg` if measured header content collides; otherwise retain `md`. Mobile/tablet keep the established menu.

`WalletButton` calls `useAuth` directly and does not delegate to `UserDropdown`. `UserDropdown` is already orphaned from the shell and its `useWalletAuth` dependency is a compatibility wrapper over `useAuth`; leave this dead-code cleanup out of the redesign unless separately approved.

### Routed profile

Add `app/profile/page.tsx` as a thin route entry and `components/profile/ProfilePageClient.tsx` as the connected-wallet composition boundary. The route does not accept an address parameter and does not SSR private submissions.

State flow:

```text
AuthProvider/useAuth
  → disconnected | connecting | hydrating | authenticating | authenticated | signature-rejected recovery
  → public wallet holdings keyed by current address
  → authenticated lore submissions only after matching SIWE session
```

Required composition and behavior:

1. Render the XD identity hero using safely wrapped/truncated wallet address and authentication state; never synthesize an ENS/user name.
2. Disconnected users see an orientation message and connect action. Connecting/hydrating states remain stable and do not flash stale holdings.
3. Owned Characters uses `useCharacters` with `tab='owned'`, current wallet, explicit page/per-page state, and existing `CharacterCard` destinations. Add a handler/integration test proving `owner_address OR staker_address` custody and retain a defensive per-page owner/staker filter in the profile adapter. Wallet changes reset page and isolate the old query key.
4. Supported Game Tokens shows the aggregate Concord/Corpse/Mushroom balances first. Label optional detail as **Searable Concords — subset of your Concord balance**; blocked IDs and Concords absent from the searing map are intentionally omitted. Lazy-load this detail only when aggregate Concord is positive and the user expands the section, avoiding the current 2000-row searing-map request on every profile visit.
5. Archive Posts does not fetch until `isAuthenticated`. The recoverable steady state after automatic SIWE is **signature rejected**; its action calls `authenticate({ force: true })`, matching `UserSubmissionsList.tsx:69`, then retries the session-owned endpoint. Preserve private/hidden visibility rules.
6. Each section has independent loading, error, retry, and empty states. A token RPC failure must not erase characters or posts; a submission auth failure must not hide public holdings.
7. Before Profile consumes them, add wallet/request generation guards to `useTokenBalances` and `useSearingConcords`: ignore completions whose captured address/request ID is no longer current, and abort raw fetches where supported. Address disappearance/change immediately clears prior holdings and private results; stale on-chain or fetch completions must not repopulate the page.
8. Cards link to existing character, token/gameplay, submission detail, or published lore routes only when those destinations exist.
9. No editable profile fields, public address lookup, arbitrary token indexer, or cross-wallet private content is introduced.

At 1920px, match the Profile artboard’s hero, section ordering, card geometry, column counts, whitespace, and footer placement as closely as approved assets and real data allow. At narrower widths, apply the shared responsive rules rather than preserving fixed desktop geometry.

### Homepage

Keep `app/page.tsx` client-side and preserve `useVideoConsent` unchanged. Recompose the route into:

1. image/video-forward hero;
2. canonical WAGDIE orientation copy;
3. primary `/characters` and secondary `/map` CTAs;
4. cards for live systems only;
5. Archive CTA only when `NEXT_PUBLIC_SHOW_LORE_NAV=true`;
6. community CTA and footer transition.

Public and connected artboards share one body; connected differences live in Header/account state. Do not fetch owned characters on home. `FeatureCard` stays a static presentation contract and does not accept lore/event DTOs. `VideoPlayer` retains consent, poster, muted autoplay-after-grant, and explicit unmute behavior. Audio is added only if approved media arrives, uses user-initiated native controls, and never autoplays.

### Archive URL contract

Add `lib/lore/archive-view-params.ts` with:

- `ArchiveView = 'timeline' | 'characters'`;
- view defaulting to `timeline` on missing/invalid input;
- a positive-integer character page defaulting to 1;
- canonical URL construction that omits `view=timeline`;
- `page` applying only to `view=characters`;
- filter/view changes resetting page to 1;
- character pagination preserving filters and `view=characters`.

Keep `LoreArchiveFilters` unchanged so navigation state does not contaminate the domain filter contract.

### Lore-character archive model

Add `lib/lore/archive-character-summary.ts` as a pure presentation builder. Each `LoreCharacterArchiveItem` contains the lore character, total/official/community appearance counts, and optional compact first/latest appearances.

Algorithm and invariants:

1. Index all effective event appearances by character ID in one pass.
2. With no active archive filter, include every effective lore character, including zero-appearance profiles.
3. With filters, include character IDs referenced by matching effective archive items.
4. Derive official/community counts from the complete appearance set, not just the filtered subset.
5. Sort by name, then token ID, then stable ID.
6. Paginate after filtering/sorting at 24 cards per page.
7. Clamp an excessive page to the last non-empty page; empty results use page 1.
8. Keep complexity at `O(events + appearances + characters log characters)`; do not issue one effective-event query per card.
9. Describe official/community/mixed **appearances**, never a character-level canon status that the domain does not contain.

### Archive presentation

Add:

- `components/lore/LoreArchiveViewNav.tsx`: server-compatible link navigation preserving filters and resetting page;
- `components/lore/LoreCharacterArchiveCard.tsx`: portrait/fallback, name, token reference, canonical summary, appearance count, and official/community/mixed appearance wording;
- `components/lore/LoreCharacterArchiveGrid.tsx`: result grid, character-specific empty state, and link pagination.

Extend `LoreArchive` with view state, character items, and character pagination while preserving timeline items, filters, seasons, locations, and character filter options.

- Timeline renders the existing filter summary, `LoreTimeline`, and clearable empty state.
- Lore Characters renders its own count/grid/empty copy and link pagination.
- The common filter bar remains available; filters constrain characters through matching appearances. Preserve its current URL-authoritative keyword synchronization and include `view` while resetting/removing character `page` on every filter mutation.
- Cards have one primary link to `/lore/characters/[slug]`. Any NFT-sheet link is a separate secondary link, never nested inside the primary link.
- Missing portrait/summary uses deterministic existing fallbacks; do not invent biography text.

### Lore event and character details

- `OfficialLoreEventDetail` retains archive navigation, image-forward hero, narrative body, story context, compact media, related records, and secondary `<details>` provenance. Do not restore workflow components to official primary content.
- `CommunityEventDetail → LoreEventDetail` retains the community warning, canon stage/status, workflow/path, sources, and preservation details. Shared styling must not make it indistinguishable from accepted official canon.
- Remove the redundant generic `BannerHeader` from `app/lore/characters/[slug]/page.tsx`; `CharacterProfile` owns the route `h1` and becomes the artboard-style hero.
- `CharacterProfile` derives official/community/mixed appearance wording from `appearedInEvents`, preserves event-level `CanonStatusBadge`, aliases, tags, traits, locations, connections, sources, submission CTA, and sparse states, and adds an explicit NFT-sheet link only when `tokenId` exists.
- No `LoreCharacter` schema or effective-query contract changes.

### NFT collection and detail

For `/characters`, limit changes to an editorial heading, card/spacing/accent polish, and a grid that is verified against dock-reduced width. Preserve all filter models, URL semantics, loading/background-fetching/wallet-required/error/empty states, pagination, and card destinations. Do not replace NFT filters with Archive filters or point NFT cards at lore profiles.

`/characters/[tokenId]` receives only inherited shell/additive-token effects. Any direct restyle of its settled character sheet is a separate follow-up.

### Footer and global failures

Restyle `Footer` with the shared surface/type language, retain environment-backed external links, and render the current year at server render rather than copying XD’s 2025 value. Align `app/error.tsx` and `app/not-found.tsx` with the same heading/button/surface language while preserving logging/reset and current navigation choices.

## Responsive Specification

XD is a 1920px directional reference, not a fixed-width contract.

### Desktop: 1024px and above

- **At 1920×1080 with the persistent dock closed, desktop pixel parity is the primary visual target** for shell height, content bounds, section spacing, card dimensions/columns, borders, typography sizes/line heights, image crops, and overlay geometry. Record intentional deviations caused by canonical content, accessibility, missing assets, or production states.
- Use screenshot overlays/difference review against each XD artboard after approved assets/fonts are substituted. Fallback assets permit structural implementation but do not satisfy final parity signoff.
- At other desktop widths and with the dock open, preserve the approved 1920 proportions where practical while allowing content to reflow; never freeze the application at 1920px.
- Center content with measured artboard-derived bounds while preserving readable prose widths; never stretch lore prose solely to fill the artboard.
- Show full navigation only when measured content fits.
- Use a roughly 360–420px account drawer that respects dock inset.
- Allow two-column narrative heroes while keeping readable prose measures.
- Prefer available-width-aware `auto-fit/minmax` grids where a dock can change content width.

### Tablet: 640–1023px

- Use the mobile/menu header unless measured space proves desktop navigation is usable.
- Collapse grids before cards fall below readable minimum widths.
- Preserve existing filter-drawer behavior.
- Stack hero image/text; metadata may remain two columns.
- Keep the account drawer no wider than the viewport.

### Mobile: below 640px

- Use at least 16px side padding and 44px primary controls.
- Account drawer is full width.
- Use two character columns only if names/status remain readable; otherwise use one.
- Wrap addresses, URLs, titles, tags, and filter values without horizontal overflow.
- Clamp card summaries only; never clamp primary detail headings or narrative bodies.

### Motion and media

Respect `prefers-reduced-motion`; give hover effects equivalent focus treatment; reserve image aspect ratios to prevent layout shift; and keep video controls available without hover.

Review at 375, 768, 1024, 1440, and 1920px, plus 1440/1920 with a 360px right dock open.

## Accessibility and Interaction Semantics

- Exactly one route `h1`; visual size never determines heading level.
- Archive view switcher is `<nav>` with links and `aria-current`.
- Navigating cards are real links, not click handlers on wrappers.
- Account drawer meets dialog focus, Escape, backdrop, restoration, labeling, and scroll-lock requirements.
- Icon controls have accessible names; form controls keep visible labels.
- Filtering/disconnect errors use `aria-live`.
- Canon/community distinctions use text as well as color.
- Decorative images have empty alt text; entity/event images use canonical descriptions.
- Poster imagery never implies video playback has begun.
- Keyboard order remains Header → page navigation → filters/content → pagination → Footer.
- Storybook Accessibility panel is a release gate for every new state.
- Unsupported XD actions never appear as enabled controls.

## Failure, Empty, Auth, and Edge Cases

| Surface | Required production behavior |
|---|---|
| Header hydration | Stable disabled/loading connection affordance; no false authenticated flash. |
| Disconnected drawer/profile | Header Menu preserves public/social links and connect action; `/profile` shows disconnected orientation with no stale holdings. |
| SIWE signature rejected | Address/public holdings remain; private posts show **Sign wallet message**, calling `authenticate({ force: true })`. |
| Authenticate/disconnect pending | Disable repeat actions and expose status. |
| Disconnect failure | Keep drawer/address; announce retryable error. |
| Invalid Archive view/page | Timeline/1 defaults; clamp excessive character page. |
| Empty Timeline | Existing filtered/no-stories explanation and clear-filter action. |
| Empty Lore Characters | Explain that no lore characters appear in matching records and allow filter clearing. |
| Zero appearances | Render profile/card without invented status or biography. |
| Mixed appearances | Mixed wording plus event-level canon badges. |
| Missing image | Existing deterministic cover/portrait/text fallback. |
| Long content | Wrap; clamp only card summaries. |
| Lore query failure | Preserve effective-query fallback/diagnostics; unrecoverable error reaches `app/error.tsx`. |
| NFT owned tab without wallet | Preserve Wallet Required alert and disabled query. |
| NFT React Query error/background fetch | Preserve filters/current results and explicit state; no placeholder data. |
| Video consent absent/denied | Poster and explicit enable action; no autoplay. |
| Missing approved audio | Omit the control. |
| Lore flag off | Hide Archive nav/home CTA; direct-route policy and NFT Characters remain unchanged. |
| Dock open | Grids reflow; account overlay does not cover persistent dock. |

## Content Ownership

- Effective lore data owns lore titles, summaries, bodies, names, appearance kinds/canon states, sources, and media attribution.
- Character APIs/types own NFT names, images, ownership, traits, and status.
- Product/content owns home orientation, CTA, footer, and account copy, seeded from current production copy.
- Product and engineering jointly review authentication wording for accuracy.
- Existing environment configuration remains source of truth for external links.
- Runtime owns footer year.
- Design/content owns alt text for supplied editorial assets; engineering may derive entity-name alt text from domain data.
- The scoped `/profile` page owns address identity, supported public holdings, and SIWE-owned lore submissions. Editable identity, activity/notifications/settings, arbitrary wallet inventory, and non-submission authored content remain separate data/product scope.

## File Impact

### New files

| File | Responsibility |
|---|---|
| `components/layout/HeaderDrawer.tsx` | Controlled accessible account dialog/drawer with `/profile` entry. |
| `app/profile/page.tsx` | Current-user route entry. |
| `app/lore/loading.tsx` | Accessible Archive loading skeleton for server navigation. |
| `components/profile/ProfilePageClient.tsx` | Auth/holdings/submissions composition and independent section states. |
| `components/profile/ProfileIdentity.tsx` | Address/session identity hero. |
| `components/profile/ProfileOwnedCharacters.tsx` | Paginated owned/staked character section. |
| `components/profile/ProfileGameTokens.tsx` | Explicitly scoped game-token balances/Concord coverage. |
| `components/profile/ProfileArchivePosts.tsx` | SIWE-gated lore submission section. |
| `components/profile/ProfilePageClient.stories.tsx` | Disconnected/hydrating/auth/data/error/responsive states. |
| `.storybook/mocks/hooks/useCharacters.ts` | Central Storybook owned-character hook state for Profile stories. |
| `tests/components/profile/ProfilePageClient.test.tsx` | Auth gating, wallet changes, section isolation, pagination. |
| `components/layout/HeaderDrawer.stories.tsx` | Auth, pending/error, long-address, and responsive states. |
| `components/shared/EditorialHeading.tsx` | Reusable semantic editorial heading. |
| `components/lore/LoreArchiveViewNav.tsx` | Link-based Timeline/Lore Characters navigation. |
| `components/lore/LoreCharacterArchiveCard.tsx` | Narrative character archive card. |
| `components/lore/LoreCharacterArchiveGrid.tsx` | Grid, empty state, and link pagination. |
| `lib/lore/archive-view-params.ts` | Archive view/page parsing and href construction. |
| `lib/lore/archive-character-summary.ts` | Pure event-to-character presentation model. |
| `tests/components/layout/HeaderDrawer.test.tsx` | Drawer focus/auth/disconnect behavior. |
| `tests/components/layout/Navigation.test.tsx` | Nested activation and feature visibility. |
| `tests/lib/lore/archive-view-params.test.ts` | URL defaults, invalid inputs, hrefs, page reset. |
| `tests/lib/lore/archive-character-summary.test.ts` | Filtering, counts, order, pagination, edge cases. |
| `tests/components/lore/LoreArchive.test.tsx` | Both views and empty/filter behavior. |
| `docs/design-handoffs/wagdie-ui-ux-2026.md` | Conditional asset/font/audio/copy provenance manifest. |

### Modified files

| Area/files | Planned change |
|---|---|
| `tailwind.config.ts`, `app/globals.css` | Add approved semantic tokens, fallback-aware font roles, and reduced-motion helpers without redefining current tokens. |
| `components/providers.tsx` | Keep existing `--chat-dock-offset`; no new variable unless a verified non-dock inset use emerges. |
| `components/lore/submissions/UserSubmissionsList.tsx` or extracted shared presentation | Reuse submission ownership/loading semantics in Profile without duplicating endpoint logic. |
| `hooks/useTokenBalances.ts`, `hooks/useSearingConcords.ts` | Add address/request generation guards and raw-fetch aborts; lazy-load searable Concord detail. |
| Profile-facing character adapter/tests | Set explicit page size, retain owner-or-staker defensive filtering, and prove backend custody semantics without adding a general wallet indexer. |
| `components/layout/Header.tsx`, `Navigation.tsx`, `Footer.tsx` | One connected account trigger/drawer, Archive label/prefix activation, responsive fit, shared styling/current year. |
| `components/layout/*.stories.tsx`, `.storybook/preview.tsx`, `.storybook/mock-providers.tsx` | Deterministic auth/global states and updated shell stories; pass selected `mockState` into the central provider. |
| `app/page.tsx`, `components/home/CtaLink.tsx`, `FeatureCard.tsx`, `HomeSection.tsx`, `VideoPlayer.tsx` | Recompose/restyle while preserving consent and route contracts. |
| `app/lore/page.tsx`, `LoreArchive.tsx`, `LoreFilterBar.tsx`, `LoreTimeline.tsx`, `LoreEventCard.tsx` | Parse/preserve view/page, build character models, render two views, reset page on filters, align cards/grid. |
| `app/lore/characters/[slug]/page.tsx`, `CharacterProfile.tsx`, `CharacterPortrait.tsx`, `AppearedInTimeline.tsx` | Remove redundant banner, add artboard hero/appearance summary/NFT link, preserve sparse states and badges. |
| `OfficialLoreEventDetail.tsx`, `LoreEventDetail.tsx`, corresponding stories | Visual alignment only; retain official/community hierarchy. |
| `app/characters/page.tsx`, `CharacterCard.tsx`, `FilterSidebar.tsx`, `MobileFilterBar.tsx`, `ActiveFilters.tsx`, dropdown/toggle files | Editorial/token/grid polish only; preserve models and query behavior. |
| `app/error.tsx`, `app/not-found.tsx` | Shared visual language; unchanged reset/navigation semantics. |

### Explicitly unchanged

- `app/layout.tsx` provider/shell ordering and metadata contract, except an optional approved global typography class;
- auth/wallet provider, types, SIWE routes, session storage, and `/api/auth/me` response shape;
- `contexts/ChatDockContext.tsx` and chat/persona architecture;
- lore domain types, effective-query/repository/canonization/submission/persistence contracts;
- official/community server query and metadata behavior;
- character browse hooks/API types;
- `/characters/[tokenId]` route, `CharacterDetailClient`, and settled detail components;
- Phaser/map, Searing, Spread, videos, rooms, admin, editors, submissions, database, and migrations.

## Execution Index

## Orchestration Status

- [x] Slice 1 — Foundations, handoff manifest, and shared shell (`Work Items 1–3`) — focused Jest and targeted lint passed.
- [x] Slice 2 — Routed current-user Profile (`Work Item 4`) — `/profile`, section isolation, SIWE force-recovery, custody coverage, navigable character links, and token race/provider guards implemented.
- [x] Slice 3 — Homepage composition (`Work Item 5`) — consent-safe media, session-scoped dismissal, reduced-motion behavior, persistent playback controls, and CTA contracts implemented.
- [x] Slice 4 — Archive Timeline/Characters and lore details (`Work Items 6–8`) — relevant lore tests and touched-file lint passed; effective-source attribution preserved.
- [x] Slice 5 — NFT/global polish and code-side integration (`Work Items 9–10 plus automated portions of 12`) — responsive/accessibility polish, deterministic states, and Storybook integration are complete.
- [ ] Final asset substitution and release acceptance (`Work Items 11–12`) — pending designer-exported assets/font provenance, approved audio/copy/link sources, production-like visual overlays, and product/design signoff.

### Current verification notes

- The post-audit regression set passes: 39 tests across five suites cover profile/auth failure isolation, owned-character custody/navigation, Concord provider mode, video consent persistence, and reduced-motion/playback controls.
- The broader redesigned-surface run passed 92 tests across 20 suites before the final submission-failure assertion was added; that updated profile suite also passes independently.
- Storybook production build passes under the repository-pinned Node 23.3.0, including the new connected, authenticating, failure, pagination, wallet-change, mobile, and media states.
- Targeted lint for the changed production, test, and story files passes, and `git diff --check` is clean.
- Full Jest currently reaches 1,447 passing tests; 64 failures remain in archived Leaflet/map imports, missing Playwright/canvas infrastructure, performance/asset-loading mocks, admin UI expectation drift, and other suites outside the XD implementation.
- Full typecheck and Next production build remain blocked after successful compilation by existing API, location, Eliza, asset-service, chain-ID, repository, and legacy code errors outside the changed slice paths.
- Final XD parity remains pending the external assets and visual signoff above; repository fallbacks are intentionally retained until those inputs exist.

### Work Item 1 — Handoff manifest and fallback approval

**Goal:** Record font, image, audio, copy, and link provenance before exact-parity assets enter the build.

**Done when:** Every XD dependency is approved, pending with a named fallback, or excluded; no unlicensed/placeholder asset is eligible to ship.

**Key files:** `docs/design-handoffs/wagdie-ui-ux-2026.md`, `public/images/ui/wagdie-ui-ux-2026/` (conditional).

**Dependencies:** Designer/product/legal input; does not block structural work.

**Size:** S.

### Work Item 2 — Additive design foundations

**Goal:** Add semantic colors, fallback-aware typography roles, reduced motion, and `EditorialHeading` without regressing out-of-scope routes.

**Done when:** New roles render in Storybook; existing token values are unchanged; representative map, searing, rooms, and admin pages show no unintended global change.

**Key files:** `tailwind.config.ts`, `app/globals.css`, `components/shared/EditorialHeading.tsx`.

**Dependencies:** Work Item 1 only for final fonts/assets; fallbacks unblock implementation.

**Size:** M.

### Work Item 3 — Shell and account drawer

**Goal:** Align header/navigation/footer and map the XD profile/account concept to one accessible, wallet-aware drawer.

**Done when:** One `HeaderDrawer` replaces the inline Menu drawer; disconnected public/social/connect and connected profile/submission/gameplay/admin/disconnect destinations remain available; one connected trigger, focus/scroll/error behavior, and dock-open geometry pass.

**Key files:** `components/providers.tsx`, `components/layout/HeaderDrawer.tsx`, `Header.tsx`, `Navigation.tsx`, `Footer.tsx`, shell stories/tests, Storybook mocks.

**Dependencies:** Work Item 2. Land atomically to avoid duplicate controls or incomplete focus behavior.

**Size:** L.

### Work Item 4 — Routed current-user profile

**Goal:** Implement the XD Profile artboard at `/profile` using current wallet identity, paginated owned characters, supported WAGDIE game tokens, and SIWE-owned lore submissions.

**Done when:** Disconnected/hydrating/authenticating/signature-rejected/authenticated states are correct; rejected SIWE can retry with `force:true`; public holdings follow the connected address; private submissions wait for a matching session; owned-or-staked pagination is proved; each section isolates loading/error/empty/retry behavior; token hooks reject stale completions; aggregate and searable-subset Concord coverage is explicit/lazy; the closed-dock 1920 layout passes overlay parity.

**Key files:** `app/profile/page.tsx`, `components/profile/ProfilePageClient.tsx`, profile section components/stories/tests, `hooks/useCharacters.ts`, `hooks/useTokenBalances.ts`, `hooks/useSearingConcords.ts`, `components/lore/submissions/UserSubmissionsList.tsx` or an extracted shared presentation seam.

**Dependencies:** Work Items 2–3. Uses existing APIs; richer identity/general wallet inventory is explicitly out of scope.

**Size:** L.

### Work Item 5 — Homepage composition

**Goal:** Recreate the XD home hierarchy with canonical copy, live destinations, consent-safe media, and feature-flagged Archive entry.

**Done when:** Public/connected shell states share one body; consent semantics are unchanged; lore flag on/off and responsive views pass; no unsupported audio ships.

**Key files:** `app/page.tsx`, `components/home/*`, existing consent tests, home stories.

**Dependencies:** Work Items 2–3; approved assets optional through fallbacks.

**Size:** M.

### Work Item 6 — Archive URL and summary foundations

**Goal:** Define deterministic Timeline/Lore Characters URL state and an efficient lore-character presentation model.

**Done when:** Invalid/default/canonical URLs, page reset, filtering, full appearance counts, stable sort, 24-item pagination, clamping, and zero/mixed appearances pass unit tests.

**Key files:** `lib/lore/archive-view-params.ts`, `lib/lore/archive-character-summary.ts`, corresponding tests.

**Dependencies:** Existing effective lore contracts only.

**Size:** M.

### Work Item 7 — Archive Timeline and Lore Characters

**Goal:** Implement both XD Archive views at `/lore` without conflating lore entities with NFTs.

**Done when:** Both views are URL-addressable; filters persist/reset page correctly; cards route to lore profiles; empty/loading/failure behavior and link pagination are complete.

**Key files:** `app/lore/page.tsx`, `components/lore/LoreArchive.tsx`, `LoreFilterBar.tsx`, `LoreArchiveViewNav.tsx`, `LoreCharacterArchiveCard.tsx`, `LoreCharacterArchiveGrid.tsx`, tests/stories.

**Dependencies:** Work Items 2 and 6. Land navigation and both views atomically.

**Size:** XL.

### Work Item 8 — Lore event and character details

**Goal:** Align XD detail hierarchy while preserving official/community provenance and the lore-domain boundary.

**Done when:** Official/community event distinctions survive; lore profiles support official/community/mixed/zero-appearance and missing-image states; optional NFT link is explicit; no schema changes occur.

**Key files:** `app/lore/characters/[slug]/page.tsx`, `components/lore/CharacterProfile.tsx`, `AppearedInTimeline.tsx`, `CharacterPortrait.tsx`, `OfficialLoreEventDetail.tsx`, `LoreEventDetail.tsx`, stories.

**Dependencies:** Work Items 2 and 7.

**Size:** L.

### Work Item 9 — NFT collection visual alignment

**Goal:** Apply the shared editorial/card language to `/characters` without changing collection semantics.

**Done when:** All URL filters, wallet warning, loading/background fetch/error/empty states, pagination, and `/characters/[tokenId]` destinations remain intact at responsive and dock-open widths.

**Key files:** `app/characters/page.tsx`, `components/characters/CharacterCard.tsx`, filters/mobile bar/active filters/dropdowns, existing tests.

**Dependencies:** Work Items 2–3. Independent of Archive data work.

**Size:** M.

### Work Item 10 — Global failure surfaces

**Goal:** Make error and not-found routes visually coherent without changing recovery behavior.

**Done when:** Error logging/reset and current navigation targets work with long content and keyboard focus.

**Key files:** `app/error.tsx`, `app/not-found.tsx`.

**Dependencies:** Work Item 2.

**Size:** S.

### Work Item 11 — Final assets and content substitution

**Goal:** Replace fallbacks only with approved, optimized sources and canonical copy.

**Done when:** Manifest entries, intrinsic sizes, crops, alt/decorative status, attribution, licensing, and copy approval are complete; unresolved items remain omitted/fallbacked.

**Key files:** Handoff manifest, approved public asset subtree, affected component copy/assets.

**Dependencies:** Work Item 1 and completed route compositions.

**Size:** M, dependent on handoff availability.

### Work Item 12 — Integrated verification and release

**Goal:** Prove behavior, accessibility, responsiveness, visual intent, and rollback safety with production-like data.

**Done when:** The acceptance matrix passes; designer/product signs off at target widths and auth/data states; phases remain independently revertable without a long-lived duplicate UI flag.

**Key files:** Stories/tests plus preview deployment; no new runtime architecture.

**Dependencies:** Work Items 3–11.

**Size:** L.

## Storybook and Automated Coverage

### Required Storybook states

- Header: disconnected, authenticating, signature-rejected, authenticated, admin, mobile.
- Header drawer: disconnected public/social/connect, authenticated profile/actions/admin, signature-rejected recovery, disconnecting/error, long address.
- Profile: disconnected, connecting/hydrating, authenticating, signature-rejected recovery, authenticated; owned/staked pagination; aggregate game balances; lazy searable-Concord subset; lore submissions; independent section failures; wallet change.
- Navigation: Archive enabled/disabled and nested active routes.
- Home: desktop/mobile, long copy, lore enabled/disabled, poster/consented states.
- Archive: Timeline, Lore Characters, filtered, empty, official/community/mixed, sparse images, long titles.
- Lore profile: official-only, community-only, mixed, no appearances, no image, token-linked.
- Official event: full and sparse related context.
- Community event: workflow/status remains explicit.
- Footer: environment links and current year.

Wire the Storybook `mockState` global into the actual mock providers instead of declaring an unused state map. Extend the central mock provider if necessary; do not mock `useAuth` separately in every story.

### Required automated tests

- Archive view/page parsing, defaults, invalid input, canonical hrefs, and page reset.
- Lore-character indexing, filter selection, complete counts, stable sort, pagination, clamping, and zero/mixed appearances.
- Timeline versus Lore Characters rendering and empty/filter behavior.
- No character-level canon assertion for community/mixed data.
- Account drawer focus trap, Escape, backdrop, focus restoration, auth/disconnect pending, success, and failure.
- Header shows one connected trigger with no duplicate disconnect affordance and a working `/profile` link.
- Profile gates lore submissions on a matching authenticated session, retries rejection with `authenticate({ force: true })`, proves/preserves owned-or-staked custody, labels aggregate versus searable Concord coverage, rejects stale wallet completions, and isolates section failures.
- Jest component tests mock `useAuth`, `useCharacters`, `useTokenBalances`, and `useSearingConcords` at module boundaries; hook-focused tests mock `BalancesService` plus `/api/concords/searing-map` and `/api/concords/owned` fetches to prove request-generation guards. Storybook uses the central `HookMocksProvider`/auth provider rather than per-story hook mocks.
- Navigation prefix activation and lore feature visibility.
- Existing video-consent, character-filter/detail, source-preservation, and effective-source suites remain unchanged and passing.
- Interaction tests assert semantics; snapshot-only coverage is insufficient.

## Tradeoffs and Rejected Alternatives

1. **Do not map XD Archive Characters to `/characters`.** Narrative lore entities and token inventory have different filters, data, ownership, and destinations.
2. **Do not create `/archive` and redirect `/lore`.** Label/presentation changes preserve established links and the effective-query boundary.
3. **Do not create a second `/lore/characters` listing route.** A query-backed Archive view keeps the two XD modes together and preserves filter context.
4. **Do not merge lore and NFT character details.** Ownership/editing/AI/chat and provenance/appearances are materially different responsibilities.
5. **Do not create a general public/editable profile domain.** The user-selected `/profile` route is current-wallet-only and composes existing data sources; it must not invent identity fields, arbitrary assets, or cross-wallet private content.
6. **Do not use XD fonts/assets without provenance.** Repository presence or screenshots do not prove redistribution rights or source authority.
7. **Do not flatten community events into the process-light official template.** Explicit workflow/status prevents misleading canon presentation.
8. **Do not maintain duplicate redesigned component trees behind a new global flag.** Use Storybook, preview deployment, revertable phases, and the existing lore navigation flag.
9. **Do not render an inactive audio player.** It is misleading and inaccessible without approved media and behavior.

## Risks, Compatibility, and Rollback

- `view` and `page` are additive; current `/lore` URLs remain valid and invalid input degrades safely.
- Archive prop additions must land atomically with the route, components, tests, and stories.
- Global regressions are mitigated by additive tokens and representative out-of-scope smoke checks.
- Font shifts are mitigated by fallbacks and approval before preload/global use.
- Canon misstatement is mitigated by appearance-only wording and event-level badges.
- Dock overlap is mitigated by available-width grids, a CSS inset, and dock-open review.
- Auth/admin regressions are mitigated by reusing `useAuth`, computing the client-side admin flag with `isAdmin(address)` from `lib/auth/admin`, and testing every state.
- Storybook drift is mitigated by wiring globals into central mocks.
- Large lore sets are mitigated by one-pass indexing, server pagination, and production-like benchmarking.
- Missing assets do not block structure; approved repository assets/CSS are explicit fallbacks.
- Land foundations, shell, home, Archive, details, NFT alignment, and final assets as separate revertable changes. Rollback is code-only; no data downgrade or cleanup is required.

## Rollout and Visual Review

- Storybook is the component-state review surface; preview deployment is the integrated route review surface.
- Capture approved references at 375, 768, 1024, 1440, and 1920px, including 1440/1920 with a 360px dock open. Treat closed-dock 1920×1080 overlays as the primary pixel-parity gate.
- Compare disconnected, authenticating, signature-rejected recovery, authenticated, and admin shell states.
- At 1920×1080, evaluate literal geometry/spacing/type/image parity with overlays or image diffs once approved assets/fonts are present. Canonical content, accessibility, real state behavior, and dock constraints are documented exceptions rather than reasons to abandon the parity target. Other widths prioritize responsive production behavior.
- Test `NEXT_PUBLIC_SHOW_LORE_NAV=false` and `true`.
- Do not ship a long-lived redesign flag or legacy/redesigned parallel tree.

## Verification Matrix

| Area | Automated proof | Manual proof |
|---|---|---|
| Shell/account | Header/navigation/drawer interaction tests; typecheck | One trigger, focus/scroll, connect/auth/disconnect/admin/profile, mobile menu, dock-open behavior; 1920 overlay parity |
| Home | Existing consent suite; build | No pre-consent autoplay, canonical CTAs, lore flag states, no unsupported audio; 1920 overlay parity |
| Archive Timeline | Parser/component/effective-lore tests | URL filters, correct official/community routes, useful empty state |
| Archive Characters | Summary/pagination/component tests | Narrative entities only, correct lore-profile links, accurate appearance wording; 1920 overlay parity |
| Routed Profile | Profile auth/data isolation/pagination tests | Current-wallet identity, public holdings, SIWE-only posts, explicit token coverage, independent failures, 1920 overlay parity |
| Official event | Existing stories/build | Narrative-first hierarchy and secondary provenance retained |
| Community event | Process stories/tests | Workflow/status remains explicit and distinguishable |
| Lore character | New state stories/tests | Official/community/mixed/zero-appearance, fallback portrait, explicit NFT link |
| NFT collection | Existing filter tests/build | All query/auth/loading/error/empty/background-fetch/pagination behavior retained |
| NFT detail | Existing `CharacterDetailClient` test | Ownership, edit/save, lore, AI/chat, modal, image behavior unchanged |
| Assets/fonts | Build and asset-path validation | No broken/unlicensed/screenshot assets or incorrect crops |
| Accessibility | Interaction tests and Storybook a11y | Keyboard-only, visible focus, zoom, reduced motion, screen-reader labels |
| Responsive | Build/Storybook | All target widths plus dock-open desktop; no horizontal overflow |
| Global failures | Build/route smoke | Error reset and 404 navigation with long text |

### Commands

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run build-storybook
```

Use focused Jest paths during each work item and the full suite before release. Run build/preview validation with both values of `NEXT_PUBLIC_SHOW_LORE_NAV`.

## Final Acceptance Criteria

- All eight artboards have a documented production mapping.
- Archive Timeline and Lore Characters are distinct URL-addressable views.
- Lore and NFT character semantics are never conflated.
- `/profile` is current-wallet-only, uses existing scoped data sources, protects private submissions with SIWE, labels incomplete token coverage, and introduces no invented identity/settings fields.
- Canonical loading, error, empty, disconnected, authentication, disabled, sparse-data, and dock-open states remain functional.
- Responsive/accessibility behavior is specified and verified beyond XD’s desktop-only evidence.
- Existing wallet/auth, effective lore, character query, Phaser, chat, and persistence contracts remain unchanged.
- Product/design signs off against production-like data, with 1920×1080 pixel-parity overlays as the primary visual gate and documented accessibility/content/state exceptions; each implementation phase remains independently revertable.

## User Decisions Incorporated

- Archive uses `/lore` and `/lore?view=characters`; `/characters` remains the NFT collection.
- Add a real current-user `/profile` route using the scoped existing sources described above.
- Structural work proceeds with repository fallbacks; production exports/font provenance gate final parity and release.
- Closed-dock 1920×1080 desktop pixel parity is the primary visual acceptance target; narrower widths remain responsive and accessible.

## References

- [Adobe XD developer spec](https://xd.adobe.com/view/e8de645e-88b1-4ef1-8f8e-f685f5fc01b4-bd8d/specs/)
- `docs/development/design-system.md`
- `docs/onboarding/quickstart.md`
- `docs/plans/homepage-improvements-2026-05-11.md`
- `docs/plans/character-page-coherence-2026-05-11.md`
- `docs/plans/event-pages-overhaul-2026-05-19.md`
- `specs/002-basic-ui-wireframe/contracts/component-interfaces.ts`
- `specs/003-page-wireframes/contracts/components.yaml`
