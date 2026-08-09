# Review: Adobe XD UI Implementation Plan — `/profile` route and shell/dock seams

**Subject plan:** `docs/plans/adobe-xd-ui-implementation-2026-08-07.md`
**Baseline:** the generated plan in `prompt-exports/oracle-plan-2026-08-07-115621-xd-implementation-pl-8c15.md`
**Date:** 2026-08-07

## Scope and method

I compared the live plan against the generated plan in the export, then verified every load-bearing `/profile`, shell, dock, and archive claim against current source (`useAuth`, `AuthContext`, `useCharacters`, `useOwnedCharacters`, `useTokenBalances`, `useSearingConcords`, `useWalletAuth`, `lib/auth/admin`, `Header`, `Navigation`, `WalletButton`, `UserDropdown`, `providers`, `.storybook/preview`, `app/lore/page.tsx`, `lib/lore/effective-query.ts` + `types.ts`, `LoreArchive`, `CharacterProfile`).

The four user decisions are treated as authoritative and are **not** criticized:
- Archive views under `/lore`;
- a real current-user `/profile` route;
- structural work proceeds with asset/font fallbacks;
- closed-dock 1920×1080 pixel parity is the primary visual acceptance target.

Findings are limited to the five requested categories, tagged **[C1]–[C5]**. Verified-correct callouts are included only where they anchor a correction.

---

## Findings

### F1 — `isAdmin` is mis-sourced (it is not on `useAuth`)  **[C2/C3]**

- **Plan says:** "Reuse `useAuth`/`isAdmin`" (Risks) and lists `isAdmin: boolean` on the `AccountDrawer` props.
- **Code shows:** `useAuth` / `AuthContext` (`hooks/useAuth.ts`, `contexts/AuthContext.tsx`) exposes **no** `isAdmin`. `isAdmin` is a standalone, client-side, hardcoded-address pure function in `lib/auth/admin.ts:20` (`ADMIN_WALLETS`). `Header` already imports and uses it directly (`components/layout/Header.tsx:9`, `:32` → `isAdmin(address)`); the only hook wrapper is `hooks/map/useAdminAuth.ts`, which is map-scoped.
- **Correction:** Source the drawer/profile admin flag from `isAdmin(address)` (`lib/auth/admin`), exactly as `Header` does today. State in the plan that this is a client-side constant list, not session-derived, so reviewers don't expect a backend admin claim.

### F2 — The "connected/unauthenticated" profile state is rejection-driven, not steady  **[C2/C4]**

- **Plan says:** Profile state flows `… connected/unauthenticated → authenticating → authenticated`, and "connected-but-unauthenticated users see an authenticate action" (Profile §5).
- **Code shows:** `AuthContext` **auto-fires SIWE** on connect — the effect at `contexts/AuthContext.tsx` calls `authenticate({ auto: true })` whenever `hasHydrated`, not authenticated, `hydrationStatus === 'none' | 'mismatch'`, and the address is not in `rejectedAddressesRef` / `autoAttemptedAddressesRef`. So a connected non-rejecting wallet moves to `authenticating` almost immediately; the persistent "connected/unauthenticated" state exists only for users who **rejected** the signature (or in the brief pre-auto-sign window).
- **Why it matters:** Re-authentication after rejection must clear `rejectedAddressesRef`, which only `authenticate({ force: true })` does (`hooks/useAuth.ts` exposes `force`). The canonical pattern is already in `components/lore/submissions/UserSubmissionsList.tsx:69` — `auth.authenticate({ force: true })`, labeled "Sign wallet message." The plan never mentions `force` or the rejection set. Reusing `UserSubmissionsList` inherits the correct behavior, but the plan's state machine and acceptance states ("connected/unauthenticated") are misleading as written. The Storybook/acceptance "connected-unauthenticated" state should be framed as *signature-rejected recovery*, and SIWE gating is softer than "connected ≠ authenticated" implies (any non-rejecting connected wallet auto-signs).

### F3 — Token hooks lack the cancellation the plan hard-requires  **[C4]**

- **Plan says:** Profile requirement #7 — "Address disappearance/change immediately clears prior holdings … Aborted/stale requests must not repopulate the page."
- **Code shows:** `useTokenBalances.ts` and `useSearingConcords.ts` are `useEffect` + `useState` + raw `fetch` with **no `AbortController` and no request-id guard.** On a rapid wallet change, an in-flight callback closes over the old `address`/`walletAddress` and can `setBalances`/`setConcords` *after* the new address is current (race). Contrast `AuthContext`, which uses `latestAddressRef` + `hydrationRequestIdRef` precisely to prevent this, and `useOwnedCharacters.ts`, which uses `AbortController`. `useCharacters` is safe by contrast (React Query key isolation).
- **Correction:** The plan must either (a) require the profile's token sections to add an `AbortController`/request-id guard (mirroring `AuthContext`) before treating requirement #7 as met, or (b) migrate those reads to React Query. As written, the chosen hooks do not satisfy a stated hard requirement.

### F4 — Concord "aggregate" vs "searable subset" relationship is unresolved  **[C2]**

- **Plan says:** ProfileGameTokens "renders aggregate Concord/Corpse/Mushroom balances and, if included, searing-mapped Concord cards. Explain the coverage boundary."
- **Code shows:** `useTokenBalances` returns one **aggregate** Concord balance; `useSearingConcords` returns only **searable, non-blocked** items — `BLOCKED_SEARING_CONCORD_IDS = {12,15,25,27}` (`useSearingConcords.ts`) plus searing-map membership further reduce the set. The searable cards are therefore a strict, intentionally-filtered subset of the aggregate Concord total.
- **Why it matters:** Showing both surfaces two Concord figures whose subset relationship is unexplained (e.g., aggregate 47 vs a grid of 5 searable). "Explain the coverage boundary" is the right instinct but underspecified: the plan must state that searable cards are a subset, that blocked/non-mapped Concord are intentionally omitted, and how the two numbers relate. This is a material copy/UX decision left open.

### F5 — The dock CSS variable is `--chat-dock-offset`, not `--app-right-inset`  **[C3]**

- **Plan says:** "Publishes a descendant CSS custom property such as `--app-right-inset`" and File Impact: "`components/providers.tsx` — Publish `--app-right-inset`."
- **Code shows:** `ChatDockContentWrapper` (`components/providers.tsx`) already publishes `--chat-dock-offset` (inline `style`) and applies `md:mr-[var(--chat-dock-offset)]`. There is no `--app-right-inset`. Because `Header` is a descendant of that wrapper, `var(--chat-dock-offset)` already resolves inside `Header` and the drawer; the drawer panel only needs `right: var(--chat-dock-offset)` to avoid covering the dock.
- **Correction:** Consume the existing `var(--chat-dock-offset)` rather than introducing a parallel name, or explicitly justify `--app-right-inset` as a distinct alias. Note the offset is `md:`-only, which already matches the plan's "dock push is desktop-only" stance.

### F6 — `AccountDrawer` vs the existing Header "Menu" drawer is unresolved (replace vs coexist)  **[C2]**

- **Plan says:** Add `components/layout/AccountDrawer.tsx` as a new controlled dialog; "Disconnected users see the existing connect affordance; no empty account drawer opens." The failure table reinforces: "Disconnected account → Connect affordance only; no empty drawer."
- **Code shows:** `Header` **already** renders a full right-side drawer (`isDrawerOpen`; trigger `Header.tsx:96-105`; markup ~205-300) containing: connected welcome / pilgrim-connect section; Map/Lore/Videos links (redundant — `Navigation.tsx:18-25` already lists World Map, Lore, Low Poly); connected actions (Searing, **Lore Submission** `/lore/submit`, Spread — `/lore/submit` is drawer-only); admin links (`isAdminWallet`-gated); and social links (Discord/X/OpenSea — drawer-only). This drawer lacks `role="dialog"`/`aria-modal`, focus trap, Escape handler, and focus restoration.
- **Gap:** The plan never states whether `AccountDrawer` **replaces** this existing drawer or **coexists** with it. Two unaddressed consequences:
  1. **Social-link placement for disconnected users.** Social links currently live *only* in this drawer. If the disconnected drawer is removed per "no empty drawer," desktop disconnected users lose that entry — the plan restyles `Footer` but never assigns social links there.
  2. **Scroll-lock dedup.** The existing drawer uses `lockBodyScroll('header-drawer')` (`Header.tsx`). The plan's "centralize body-scroll locking / no duplicate lock" must explicitly retire that path or alias it, not just add a new one.
- This is a scope decision that changes Work Item 3 from "add a dialog" to "replace the shell's primary menu surface." It must be resolved before sizing.

### F7 — Inherited export premise "`WalletButton` delegates to `UserDropdown`" is inaccurate  **[C3]**

- **Export said / plan inherits:** `WalletButton` delegates connected state to `UserDropdown`; treat `UserDropdown` as a second account system to avoid.
- **Code shows:** `WalletButton` (`components/wallet/WalletButton.tsx`) calls `useAuth` directly and renders an immediate-disconnect button when connected — it does **not** delegate to `UserDropdown`. `UserDropdown` (`components/wallet/UserDropdown.tsx`) is a separate component that is **not rendered by `Header`** at all, and it consumes `useWalletAuth`, which is just a thin compatibility wrapper over `useAuth` (`hooks/useWalletAuth.ts`) — **not** a second auth system.
- **Correction:** The plan's actionable point ("remove the duplicate connected `WalletButton`/immediate-disconnect affordance") remains valid and well-aimed (the duplication is the "Welcome, 0x…" trigger plus the connected `WalletButton`, both in `Header`). But the record should reflect that `UserDropdown` is already orphaned from the shell, so "retain it unchanged" is retaining dead code, not suppressing a live second account system.

### F8 — Owned-character custody guarantee when switching hooks is under-specified  **[C2]**

- **Plan says:** Use paginated `useCharacters({ tab:'owned', wallet, … })` instead of `useOwnedCharacters`, and "Preserve the repository's established meaning of owned-or-staked custody."
- **Code shows:** `useOwnedCharacters.ts` fetches `/api/characters?tab=owned` and then **defensively re-filters** `owner_address || staker_address` (lines ~140-150). `useCharacters` hits the same endpoint but applies **no** such defensive filter. The helper's own filter implies the backend's `tab=owned` set cannot be fully trusted to include staked characters.
- **Correction:** Either confirm the `/api/characters?tab=owned` backend always returns staked-too (so the filter is redundant), or port the owner-OR-staker guard into the profile section. Also note `useCharacters` defaults `perPage=50` vs `useOwnedCharacters`'s `100` — the plan's "explicit page/per-page state" covers this only if the profile actually sets `perPage`, else the page size halves.

### F9 — Token-mapping specificity from the export is generalized away  **[C1]**

- **Export specified:** a per-color candidate map — `#E9C793`→parchment/gold; `#B690EB`/`#7453A3`/`#7549B4`→light/base/deep arcane-purple; near-black/brown only after confirming `soul-900`/`soul-950`/`midnight` cannot reproduce it — i.e., hex → semantic role → existing-token-to-check.
- **Plan weakens to:** "Add semantic Tailwind tokens … only after checking whether current `soul-*`, `bone`, `ash`, and `arcane` values already cover the role." The hex values survive in Background, but the implementer-facing per-color → existing-token mapping is dropped, forcing re-derivation. Minor, but implementation-bearing; restore the explicit map.

### F10 — `AccountDrawer` explicit prop contract was dropped (and `isAdmin` with it)  **[C1]**

- **Export specified:** an explicit `AccountDrawer` props shape (`isOpen, address, isConnected, isAuthenticated, isHydrating, isAdmin, onClose, onAuthenticate, onDisconnect`).
- **Plan describes** behavior only and omits the contract — and the unsourced `isAdmin` is exactly F1. Restore the explicit prop shape with `isAdmin` correctly sourced (`lib/auth/admin`). If F6 resolves to "replace the existing drawer," the contract must also carry menu/social/admin content, not just account state.

### F11 — Testability of the non-React-Query token hooks under Jest is unaddressed  **[C4]**

- **Plan says:** Add `tests/components/profile/ProfilePageClient.test.tsx` covering auth gating, pagination, section isolation, wallet-change clearing.
- **Code shows:** `useTokenBalances` and `useSearingConcords` are `useEffect`+`useState`+raw-`fetch` (not React Query); `useTokenBalances` additionally depends on wagmi `usePublicClient`/`useWalletClient` and `BalancesService` (on-chain reads). Storybook has `MockTokenBalancesProvider` (`.storybook/mock-providers`), but Jest tests under `tests/` do **not** share it. The plan names no mock strategy for these two hooks, so "section isolation" cannot be written as specified. Name the approach (MSW/`fetch` mocks for `/api/concords/searing-map`, `/api/concords/owned`, and `BalancesService`; or hook injection) in Work Item 4.

### F12 — `useSearingConcords` cost as a profile dependency is unflagged  **[C4]**

- **Code shows:** `useSearingConcords` fetches `/api/concords/searing-map?limit=2000` on every enabled mount (regardless of ownership) plus `/api/concords/owned`. Pulling it into `/profile` adds a 2000-row fetch to **every connected visitor's** page load.
- **Plan says:** searing-mapped cards are "if included" (optional) but does not flag this cost or gate it. `/profile` is a new high-traffic authenticated surface; decide deliberately — lazy-load, skip when aggregate Concord balance is 0, or accept the cost — rather than inherit it silently.

---

## Questions whose answers would materially change design or implementation order  **[C5]**

1. **(F6)** Does `AccountDrawer` **replace** the existing Header "Menu" drawer or **coexist**? If replace, Work Item 3 grows to "replace the shell's primary menu surface" and must preserve `/lore/submit`, social, and admin entries (and relocate social links for the disconnected state). This changes sizing and must precede the Work Item 3 breakdown.
2. **(F8)** Does `/api/characters?tab=owned` reliably return staked characters (owner_address preserved), or is `useOwnedCharacters`'s owner-OR-staker filter load-bearing? Determines whether the profile can safely drop it.
3. **(F4)** How should the aggregate Concord balance and the searable-subset cards be labeled relative to each other to avoid implying two different totals?
4. **(F2)** Given auto-SIWE, is the profile's "authenticate action" primarily a signature-rejection recovery affordance? If so, reuse `UserSubmissionsList`'s `force:true` pattern verbatim and relabel the acceptance state accordingly.
5. **(F9/F10)** Should the plan retain the explicit `AccountDrawer` prop contract and the per-color token→existing-token map from the export, rather than generalizing both away?

---

## Verified correct (for credibility, not as findings)

- `useCharacters({ tab:'owned' })` is type-valid — `CharacterFilterTab` includes `'owned'` (`types/character.ts:168`).
- `useOwnedCharacters` does default to `perPage=100` and returns no pagination metadata — the plan's reason for preferring `useCharacters` is sound.
- `useTokenBalances` supplies Concord/Corpse/Mushroom; `useSearingConcords` + `/api/concords/owned` is the indexed/RPC coverage path — both as the plan states.
- `GET /api/lore/submissions` derives ownership from the SIWE session via `requireAuth()` (`app/api/lore/submissions/route.ts`), and `UserSubmissionsList` is the right reuse target (`useEffect` gated on `isAuthenticated`, 401-safe).
- `AuthContext` hydration accepts a session only on address match and clears stale state on wallet change, exactly as the plan cites.
- The archive-character-summary algorithm is feasible: `LoreEvent.characterIds` + `LoreEvent.kind` (`'official'|'community'`, `lib/lore/types.ts`) support one-pass indexing and complete official/community counts; `CharacterProfile` already receives `appearedInEvents`/`firstAppearance`; `LoreArchive` already receives all `characters`; `LoreArchiveFilters` is correctly kept free of `view`/`page`.
- The Storybook `mockState` global is read but never passed to `MockAuthProvider` (`.storybook/preview.tsx`) — the plan's wiring fix is accurate.
- `globals.css:40-44` references `HoldMoney-Regular.ttf` as `Wagdie Fraktur` — the plan's citation is accurate.
