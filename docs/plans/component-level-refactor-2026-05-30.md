# Component-Level Refactor: Plan

## Goal
Refactor three high-value component-level targets without changing behavior: `components/searing/SearingPageClient.tsx`, `app/page.tsx`, and `components/characters/FilterSidebar.tsx`.

The refactor should move stateful orchestration into focused hooks, move presentational blocks into smaller components, and replace repeated filter props/rendering with typed configuration-driven groups where that reduces coupling.

## Background
- `SearingPageClient` is a single client component that currently owns wallet/auth gating, selected WAGDIE/Concord state, sync state, transaction state wiring, optimistic image state, and the main searing layout. The concentrated state starts around `components/searing/SearingPageClient.tsx:204` and includes `selectedCharacterId`, `selectedConcord`, `syncState`, `lastSearingHash`, `isSyncing`, and `optimisticSearedImagesByTokenId`.
- Searing data is already mostly hook-backed: `useOwnedCharacters(address, { enabled, perPage: 200, sort: 'asc' })` at `components/searing/SearingPageClient.tsx:226` and `useSearingConcords({ enabled, walletAddress: address })` at `components/searing/SearingPageClient.tsx:237`. The page should preserve those data seams while extracting local selection and sync orchestration.
- Searing selection is auto-managed from list changes in two effects at `components/searing/SearingPageClient.tsx:258` and `components/searing/SearingPageClient.tsx:270`; manual selection resets sync/hash state at `components/searing/SearingPageClient.tsx:311` and `components/searing/SearingPageClient.tsx:317`.
- Searing off-chain sync posts to `/api/characters/${tokenId}/searing/sync` in `syncSearingMaterialization` at `components/searing/SearingPageClient.tsx:328`, normalizes with `readSearingSyncResponse` / `syncStateFromResponse` at `components/searing/SearingPageClient.tsx:346`, stores optimistic seared images at `components/searing/SearingPageClient.tsx:353`, and always refetches characters/concords at `components/searing/SearingPageClient.tsx:360` and `components/searing/SearingPageClient.tsx:367`.
- Searing preview is local to `ResultPreview` at `components/searing/SearingPageClient.tsx:108`; it chooses between current art, `/api/characters/${tokenId}/searing/preview?concordId=${concordId}`, and completed sync image URLs at `components/searing/SearingPageClient.tsx:120`–`130`. Infection visibility is load-bearing: completed seared art can be hidden by infection at `components/searing/SearingPageClient.tsx:286`–`299` and passed into `SearingOffchainStatus` at `components/searing/SearingPageClient.tsx:524`.
- The home page is a client component because it uses `document.cookie`, `useState`, `useEffect`, and a video ref (`app/page.tsx:1`, `app/page.tsx:28`–`38`, `app/page.tsx:254`–`273`). Its refactor must preserve cookie timing: read only after mount, show the modal only when loaded and no choice exists, and treat closing as session-only dismissal.
- `app/page.tsx` defines local presentational units: `VideoPlayer` (`app/page.tsx:40`), `FeatureCard` (`app/page.tsx:130`), `Section` (`app/page.tsx:191`), and `CtaLink` (`app/page.tsx:223`). The default export then combines consent modal, hero video, sections, cards, blockquote, and final CTA from `app/page.tsx:254` through the end of the file.
- `VideoPlayer` has local imperative behavior: `videoRef` and `isMuted` at `app/page.tsx:49`–`50`, consent reset at `app/page.tsx:52`–`56`, unmute/play handling at `app/page.tsx:58`–`70`, consented `<video>` rendering at `app/page.tsx:75`–`88`, and poster/enable UI at `app/page.tsx:109`–`125`.
- `FilterSidebar` is a controlled presentation component, but its prop interface is broad and parallel: current tab/sort/search, two boolean filters, six dropdown value/option/change/loading groups, clear behavior, count, and className are all declared at `components/characters/FilterSidebar.tsx:19`–`66` and destructured again at `components/characters/FilterSidebar.tsx:79`–`114`.
- The `FilterSidebar` parent wiring in `app/characters/page.tsx` mirrors that broad surface: filters and handlers come from `useCharacterBrowseFilters` at `app/characters/page.tsx:32`–`43`, option data comes from individual hooks at `app/characters/page.tsx:62`–`67`, `the17Options` is parent-composed at `app/characters/page.tsx:68`–`79`, and the `FilterSidebar` callsite passes the parallel value/options/handler/loading props at `app/characters/page.tsx:131`–`168`.
- Repetition inside `FilterSidebar` is concentrated in active-filter counting (`components/characters/FilterSidebar.tsx:119`–`130`) and dropdown rendering for origin/alignment/The 17/equipment (`components/characters/FilterSidebar.tsx:343`–`407`). The equipment dropdowns already use one generic `TraitDropdown`, making config-driven rendering a low-risk first step for trait-like filters.
- Prior art in `specs/019-code-complexity-refactor/contracts/markerConfig.ts:1`–`5` and `specs/019-code-complexity-refactor/contracts/markerConfig.ts:22`–`69` favors typed config maps plus helpers to replace repeated branching/rendering logic.
- Prior plans favor preserving public seams while extracting internals behind them first: `docs/plans/location-room-refactor-2026-05-30.md:11`–`15` and `docs/plans/location-room-refactor-2026-05-30.md:53`–`56`. Component prior art also keeps route/page ownership stable while extracting composition seams, as in `docs/plans/character-page-coherence-2026-05-11.md:39`–`47`.

## Approach
Use an incremental, behavior-preserving extraction strategy rather than a broad architecture rewrite.

1. Keep route exports, existing data hooks, blockchain hooks, URL/filter behavior, cookie semantics, and searing sync contracts intact first.
2. Extract local presentational JSX before extracting stateful orchestration. This keeps behavior visible and reduces risk while moving code. The homepage is the intentional exception: extract video consent before homepage presentation because cookie/modal behavior is the riskier seam and should be isolated before moving surrounding UI.
3. Introduce page-specific controller hooks only for orchestration that is currently local to the large component. Do not move existing data-fetching or blockchain logic out of the hooks that already own it.
4. For `FilterSidebar`, first introduce config-driven rendering behind the existing prop surface. Only after that is stable should the public sidebar prop shape collapse into a grouped `FilterSidebarModel` at known call sites.
5. Add focused regression coverage around extracted seams rather than layout snapshots for every new component.

### Searing page target shape
`SearingPageClient` should become the route-facing composition shell. It should render wallet gating, the character/concord sections, result/approval/action/status aside, and error/callout blocks from one controller result.

Recommended new seams:
- `components/searing/useSearingPageController.ts`: owns current page-local state, auto-selection effects, selection handlers, sync orchestration, approval handler wrapping, computed `canSear`, active tx hash, and completed-image-hidden-by-infection computation.
- `components/searing/SearingCharacterTile.tsx`: extracted current `CharacterTile` behavior, including infection disclosure, optimistic seared image handling, seared badge logic, and image fallback.
- `components/searing/SearingResultPreview.tsx`: extracted current `ResultPreview` behavior, including source image selection, preview API URL, completed sync image precedence, variant badge logic, and image fallback.
- `components/searing/searing-page-utils.ts`: pure helpers currently local to the page, such as character naming and seared-state checks.

The controller should compose existing hooks (`useOwnedCharacters`, `useSearingConcords`, `useSearing`) instead of replacing them. It should keep the current approval-status ref pattern, current sync payload, current sync response helpers, and current success/failure refetch behavior.

Minimum controller result contract:
- `wallet`: address/connect/auth/hydration/connected state needed for the connect prompt and wallet-gated layout.
- `characters`: items, selected id, selected item, loading/error, optimistic image map, refetch, and select handler.
- `concords`: items, selected item, loading/error, refetch, and select handler.
- `approval`: current approval status, approving flag, and approve handler.
- `transaction`: searing flag, tx status, active tx hash, and error.
- `sync`: sync state, syncing flag, retry handler, and completed-image-hidden-by-infection flag.
- Top-level `canSear` and `onSear` for the primary action.

### Home page target shape
`app/page.tsx` should remain a client route for this refactor. Splitting into a server shell would add client/server boundary risk without addressing the requested component-level complexity.

Recommended new seams:
- `components/home/useVideoConsent.ts`: owns `videoConsent`, loaded state, session-dismissed state, derived modal visibility, derived `hasVideoConsent`, explicit grant/deny persistence, and session-only dismiss handling.
- `components/home/VideoPlayer.tsx`: owns current video ref/muted state, reset-to-muted behavior when consent is missing, click-to-unmute/play behavior, consented video rendering, and poster/enable UI.
- `components/home/FeatureCard.tsx`, `components/home/HomeSection.tsx`, and `components/home/CtaLink.tsx`: extracted local presentational components.
- Additional homepage composition components are acceptable if they make `app/page.tsx` read as route composition without hiding route-owned consent/modal behavior.

The route should keep high-level page order, `Layout`, consent modal wiring, env-derived links/feature flags, and the copy/link/image data unless a later implementation explicitly chooses to extract static arrays. `useVideoConsent` should expose the modal-ready state and callbacks: `shouldShowConsentModal`, `hasVideoConsent`, explicit grant/deny handlers, and a session-only dismiss handler used by close/Escape/backdrop paths.

### Filter sidebar target shape
`FilterSidebar` should remain controlled by `app/characters/page.tsx`; URL behavior and filter state stay in `useCharacterBrowseFilters`.

Recommended two-step migration:
1. Keep the existing `FilterSidebarProps` while internally building typed configs for toggle filters, primary dropdowns, and equipment dropdowns. Render `OriginDropdown` for origin, `AlignmentDropdown` for alignment, and `TraitDropdown` for The 17/Armor/Back/Mask. Derive active filter count from those configs plus search.
2. Once the internal rendering path is stable, replace the parallel external props with a grouped `FilterSidebarModel` and update the known call sites: `app/characters/page.tsx` and `components/characters/FilterSidebar.stories.tsx`.

The grouped model should separate tab, sort, search, toggles, primary trait filters, equipment trait filters, total count, and clear-all behavior. It should not absorb `ActiveFilters`, character querying, wallet gating, or URL synchronization.

Minimum `FilterSidebarModel` boundary:
- `tab`: current tab and tab-change handler.
- `sort`: current sort and sort-change handler.
- `search`: input value, change handler, and clear handler.
- `toggles`: checked state and change handlers for boolean filters.
- `traitGroups`: grouped dropdown configs for primary filters and equipment filters, preserving origin/alignment/trait control kinds.
- `totalCount` and `onClearAllFilters`.

During Item 6, the internal config shapes should be close enough to this model that Item 7 is mostly a callsite migration, not a second redesign.

## Work Items

### Item 1 — Establish behavioral baseline
**Goal:** Record the current behavior and test commands before moving code.

**Done when:**
- Baseline checks are run or explicitly recorded before implementation begins.
- Suggested commands are captured for the implementer:
  - `bun run test -- tests/hooks/useCharacterBrowseFilters.test.tsx`
  - `bun run test -- tests/hooks/useSearingConcords.test.ts`
  - `bun run test -- tests/components/characters/searing/SearingConcordGrid.test.tsx`
- Manual checklist is recorded for searing selection reset, searing sync retry, video consent grant/deny/dismiss, filter URL updates, clear-all, mobile sidebar open/close, and desktop collapse/expand.

**Key files:**
- `components/searing/SearingPageClient.tsx`
- `app/page.tsx`
- `components/characters/FilterSidebar.tsx`
- `tests/hooks/useCharacterBrowseFilters.test.tsx`
- `tests/hooks/useSearingConcords.test.ts`
- `tests/components/characters/searing/SearingConcordGrid.test.tsx`

**Dependencies:** None.

**Size:** S

### Item 2 — Extract Searing pure helpers and presentational pieces
**Goal:** Move local searing JSX helpers out of `SearingPageClient` without changing state ownership yet.

**Done when:**
- Current `CharacterTile` behavior is moved to `components/searing/SearingCharacterTile.tsx`.
- Current `ResultPreview` behavior is moved to `components/searing/SearingResultPreview.tsx`.
- Character naming and seared-state helpers live in a small pure helper module.
- `SearingPageClient` still owns all current state, effects, handlers, and sync orchestration.
- Rendered output and child props are unchanged.

**Key files:**
- `components/searing/SearingPageClient.tsx`
- `components/searing/SearingCharacterTile.tsx`
- `components/searing/SearingResultPreview.tsx`
- `components/searing/searing-page-utils.ts`

**Dependencies:** Item 1.

**Size:** M

### Item 3 — Extract `useSearingPageController`
**Goal:** Move searing page orchestration into one page-specific hook while keeping `SearingPageClient` as the route-facing composition shell.

**Done when:**
- `components/searing/useSearingPageController.ts` owns current page-local state, effects, handlers, and sync orchestration.
- `SearingPageClient` renders from the controller result.
- Auto-selection behavior is unchanged for both characters and Concords.
- Manual selection still resets `syncState` and `lastSearingHash`.
- Sync still posts the same payload, uses `readSearingSyncResponse` / `syncStateFromResponse`, writes optimistic completed image URLs, and refetches characters and Concords on success and failure.
- Approval and sear transaction behavior still comes from `useSearing`.

**Key files:**
- `components/searing/SearingPageClient.tsx`
- `components/searing/useSearingPageController.ts`
- `hooks/useOwnedCharacters.ts`
- `hooks/useSearingConcords.ts`
- `hooks/useSearing.ts`
- `components/characters/searing/searing-sync-state.ts`

**Dependencies:** Item 2.

**Size:** L

### Item 4 — Extract homepage video consent hook and video component
**Goal:** Separate browser-only consent state and imperative video behavior from the homepage route.

**Done when:**
- `components/home/useVideoConsent.ts` owns cookie read/write and session dismissal state.
- `components/home/VideoPlayer.tsx` owns video ref/muted behavior.
- Cookie is still read only after mount.
- Explicit choices still persist to `wagdie_video_consent`.
- Modal close/Escape/backdrop still only dismisses autoplay for the browser session.
- `app/page.tsx` still controls the modal and passes `hasVideoConsent` plus the grant handler into `VideoPlayer`.

**Key files:**
- `app/page.tsx`
- `components/home/useVideoConsent.ts`
- `components/home/VideoPlayer.tsx`

**Dependencies:** Item 1.

**Size:** M

### Item 5 — Extract homepage presentation components
**Goal:** Reduce `app/page.tsx` to route-level composition while preserving the visual hierarchy and links.

**Done when:**
- Current local `FeatureCard`, `Section`, and `CtaLink` are moved under `components/home/`.
- Additional homepage composition components are introduced only if they reduce route-file complexity without hiding route-owned consent behavior.
- `showLoreNav`, `DISCORD_URL`, and `WIKI_URL` behavior is unchanged.
- All links, external target/rel behavior, image paths, text, and CTA order are unchanged.

**Key files:**
- `app/page.tsx`
- `components/home/FeatureCard.tsx`
- `components/home/HomeSection.tsx`
- `components/home/CtaLink.tsx`
- Optional additional `components/home/` composition files chosen during implementation

**Dependencies:** Item 4.

**Size:** M

### Item 6 — Introduce internal config rendering in `FilterSidebar`
**Goal:** Remove repeated toggle/dropdown rendering inside `FilterSidebar` while preserving the current prop interface.

**Done when:**
- Existing `FilterSidebarProps` remains unchanged.
- Internal config arrays drive sheet/profile toggles, primary dropdowns, and equipment dropdowns.
- `OriginDropdown`, `AlignmentDropdown`, and `TraitDropdown` are still used for their current option shapes and display behavior.
- The 17, Armor, Back, and Mask render through the same trait-config path.
- Active filter count is derived from the same values as today.
- Mobile toggle, overlay, desktop collapse, clear-all, search, tabs, and sort behavior are unchanged.

**Key files:**
- `components/characters/FilterSidebar.tsx`
- `components/characters/OriginDropdown.tsx`
- `components/characters/AlignmentDropdown.tsx`
- `components/characters/TraitDropdown.tsx`
- `components/characters/SheetToggle.tsx`

**Dependencies:** Item 1.

**Size:** M

### Item 7 — Migrate `FilterSidebar` to a grouped model prop
**Goal:** Reduce parent/sidebar coupling by replacing parallel props with a typed `FilterSidebarModel`.

**Done when:**
- `FilterSidebarProps` becomes a grouped model plus optional className.
- `app/characters/page.tsx` builds the model from existing `filters`, `searchInput`, `setSearchInput`, `handlers`, and option hook results.
- `useCharacterBrowseFilters` is not changed.
- `ActiveFilters` wiring in `app/characters/page.tsx` is not changed.
- `FilterSidebar.stories.tsx` uses the new model shape.
- No duplicate old/new prop path remains after migration.

**Key files:**
- `components/characters/FilterSidebar.tsx`
- `components/characters/filter-sidebar-types.ts`
- `app/characters/page.tsx`
- `components/characters/FilterSidebar.stories.tsx`

**Dependencies:** Item 6.

**Size:** M

### Item 8 — Add focused regression coverage for extracted seams
**Goal:** Cover behavior that became easier to test after extraction without over-testing layout.

**Done when:**
- Focused tests cover searing pure helpers and/or `SearingResultPreview` image-state selection.
- Focused tests cover `useVideoConsent` with mocked `document.cookie`.
- Focused tests or Storybook verification cover `FilterSidebar` active-count/model rendering if existing coverage is insufficient.
- Existing `useCharacterBrowseFilters` tests still pass unchanged.

**Key files:**
- `tests/components/searing/`
- `tests/components/home/`
- Optional `tests/components/characters/`
- `tests/hooks/useCharacterBrowseFilters.test.tsx`

**Dependencies:** Items 3, 4, and 7.

**Size:** M

### Item 9 — Final cleanup and validation
**Goal:** Remove leftover local duplication and verify the refactor preserved behavior.

**Done when:**
- `SearingPageClient` contains page composition, not local business orchestration.
- `app/page.tsx` contains route composition and modal wiring, not local component definitions.
- `FilterSidebar` contains collapse/mobile state and config rendering, not parallel repetitive dropdown blocks.
- No route paths, API payloads, query params, cookie names, or public exports changed unexpectedly.
- Baseline commands from Item 1 pass, or any pre-existing failures are documented.

**Key files:**
- `components/searing/SearingPageClient.tsx`
- `app/page.tsx`
- `components/characters/FilterSidebar.tsx`
- New files introduced by prior items

**Dependencies:** Items 3, 5, and 8.

**Size:** S

## Open Questions
None blocking. Implementation should preserve visible behavior unless a later test exposes behavior that is already broken or ambiguous.

## References
- `components/searing/SearingPageClient.tsx`
- `app/page.tsx`
- `components/characters/FilterSidebar.tsx`
- `app/characters/page.tsx`
- `hooks/useCharacterBrowseFilters.ts`
- `tests/hooks/useCharacterBrowseFilters.test.tsx`
- `tests/hooks/useSearingConcords.test.ts`
- `tests/components/characters/searing/SearingConcordGrid.test.tsx`
- `specs/019-code-complexity-refactor/contracts/markerConfig.ts`
- `docs/plans/location-room-refactor-2026-05-30.md`
- `docs/plans/character-page-coherence-2026-05-11.md`
