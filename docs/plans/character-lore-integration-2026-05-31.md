# Character Lore Integration: Plan

## Goal

Integrate effective lore content into `/characters/[tokenId]` so the playable character sheet can surface a token’s official and community lore appearances without replacing the existing editable story, AI persona, wallet/on-chain, artwork/image fallback, owner actions, chat, or modal flows.

## Background

- `/characters/[tokenId]` is currently a client route (`'use client'`) that owns loading, edit mode, tab state, ownership checks, image display, save/cancel handlers, chat readiness, and modal lifecycle before passing state into `CharacterSheetLayout` (`app/characters/[tokenId]/page.tsx:1`, `app/characters/[tokenId]/page.tsx:58`, `app/characters/[tokenId]/page.tsx:66`, `app/characters/[tokenId]/page.tsx:169`). The lore integration should preserve that client state owner by moving it behind a thin client component if the page becomes a server wrapper.
- Character detail data currently comes from `useCharacterDetailData`, which fetches `/api/characters/${tokenId}` with `cache: 'no-store'` and stores a `Character` object (`hooks/useCharacterDetailData.ts:17`, `hooks/useCharacterDetailData.ts:22`). The public `Character` type already includes editable `background_story`, metadata fallback fields, owner/staker addresses, image fields, stats, equipment, infection, and staking state (`types/character.ts:8`).
- The current sheet tab model is `CharacterSheetTab = 'sheet' | 'ai-persona' | 'on-chain'` (`components/characters/detail/CharacterSheetLayout.tsx:22`). The `sheet` tab renders `CharacterStorySection`, `CharacterEquipmentSection`, and mobile owner actions; the AI persona tab receives `characterBackstory={editor.state.story}`; the on-chain tab renders wallet/ownership data (`components/characters/detail/CharacterSheetLayout.tsx:337`, `components/characters/detail/CharacterSheetLayout.tsx:347`, `components/characters/detail/CharacterSheetLayout.tsx:363`).
- `CharacterStorySection` is the current story/lore CTA seam. It renders the editable/display story and, when `showLoreNav && !isEditMode`, the “Add community story” action (`components/characters/detail/CharacterStorySection.tsx:22`, `components/characters/detail/CharacterStorySection.tsx:31`). The route wires that action to `/lore/submit?tokenId=${tokenId}` (`app/characters/[tokenId]/page.tsx:185`). The final integration should additionally gate this submit/no-lore CTA to token owners/admins.
- The editor initializes `story` from `character.background_story ?? character.metadata?.background_story ?? ''`, preserving DB columns as source of truth after saves while keeping metadata fallback (`hooks/useCharacterEditor.ts:98`). This local editable story is distinct from public lore event appearances and must not be overwritten by lore archive content.
- Public lore character pages already resolve the effective lore view by slug, then load all effective events, events for the character, locations, seasons, character connections, media, and sources (`app/lore/characters/[slug]/page.tsx:22`, `app/lore/characters/[slug]/page.tsx:28`, `app/lore/characters/[slug]/page.tsx:45`). They render `CharacterProfile`, not the playable character sheet (`app/lore/characters/[slug]/page.tsx:89`).
- `CharacterProfile` demonstrates the available lore presentation data: summary, aliases, tags, traits, first appearance, associated locations, co-appearing characters, appearance timeline, source-backed appearances, and a token-linked “Add a story” link (`components/lore/CharacterProfile.tsx:76`, `components/lore/CharacterProfile.tsx:111`, `components/lore/CharacterProfile.tsx:132`, `components/lore/CharacterProfile.tsx:193`). It routes official events to `/lore/events/[slug]` and community events to `/lore/community/[slug]` (`components/lore/CharacterProfile.tsx:29`).
- Effective lore is assembled asynchronously from the active base dataset, published canonization overrides, and published community submissions (`lib/lore/effective-query.ts:191`). Token-only published submissions can synthesize missing `LoreCharacter` records as `character-{tokenId}` with `/characters/{tokenId}` as `externalUrl` (`lib/lore/effective-query.ts:143`).
- The effective lore API already exposes the key read seams needed for character-page integration: `getEffectiveEventsForCharacter(characterId)`, `getEffectiveCharacterConnections(characterId)`, `getEffectiveCharacterBySlug(slug)`, and `getAllEffectiveLoreCharacters()` (`lib/lore/effective-query.ts:337`, `lib/lore/effective-query.ts:387`, `lib/lore/effective-query.ts:456`, `lib/lore/effective-query.ts:464`). There is no direct token-id lookup helper today.
- `LoreCharacter` is keyed by `id`/`slug` and can include `tokenId`, `imageUrl`, `externalUrl`, origin/class/alignment/level, first appearance, and tags (`lib/lore/types.ts:92`). `LoreEvent` includes `kind`, `slug`, title/summary/body, relationship ids, canon metadata, source ids, media ids, tags, and keywords (`lib/lore/types.ts:121`).
- Prior plan `docs/plans/character-page-coherence-2026-05-11.md` completed the current sheet architecture and explicitly preserved character data contracts, edit/save flow, AI persona, wallet, image fallback, chat, animated route, modals, and owner actions (`docs/plans/character-page-coherence-2026-05-11.md:5`, `docs/plans/character-page-coherence-2026-05-11.md:17`). This integration should extend that architecture rather than re-open it.
- Prior plan `docs/plans/lore-real-data-transition-2026-05-09.md` established the public lore composition order: DB/static base dataset, published canonization overrides, published community submissions, then shared source/media/entity resolution (`docs/plans/lore-real-data-transition-2026-05-09.md:19`). It also kept `lib/lore/query.ts` as static compatibility and moved public routes to the effective layer (`docs/plans/lore-real-data-transition-2026-05-09.md:28`).
- Prior plan `docs/plans/community-lore-media-submissions-2026-05-09.md` planned and marked mostly complete a token-owner submission workflow where public/canonized submissions are adapted into effective lore records and community routes (`docs/plans/community-lore-media-submissions-2026-05-09.md:28`, `docs/plans/community-lore-media-submissions-2026-05-09.md:220`, `docs/plans/community-lore-media-submissions-2026-05-09.md:341`).

## Approach

Use a compact, read-only lore appearances integration inside the existing `sheet` tab, placed immediately after `CharacterStorySection` and before equipment. Do not add a new top-level lore tab and do not embed the full `/lore/characters/[slug]` profile in the playable character page.

Prefer server-side lore loading over a new client `/api/characters/[tokenId]/lore` fetch. Because `app/characters/[tokenId]/page.tsx` is currently a client component, make the route file a thin server wrapper and move the existing interactive page body into a client component such as `CharacterDetailClient`. The server wrapper parses the route `tokenId`, loads optional effective token lore via `lib/lore/effective-query.ts`, catches lore-load failures so the playable sheet can still render, and passes the resulting lore state into the client component as initial props. The client component keeps the existing character fetch, editing, wallet, AI persona, chat, image, tab, and modal ownership.

The integration has three boundaries:

1. **Effective token lore resolver** — add a named read helper that resolves published effective lore for a playable token id. The helper should return a compact, serializable DTO containing the matched lore character summary, all matched character ids, ordered appearance summaries, first appearance, associated locations, seasons, sources, and source count.
2. **Server route wrapper** — load lore on the server for `/characters/[tokenId]` and pass it into the client detail shell. This avoids a new client API endpoint while keeping server-only lore repositories out of client code.
3. **Character-sheet presentation seam** — add a compact `CharacterLoreAppearancesSection` under the existing detail component tree. It receives the lore DTO, renders read-only links and summaries, and never owns fetching or mutation.

Preserve the conceptual split between playable character backstory and public lore appearances. `editor.state.story`, `character.background_story`, AI persona backstory inputs, dirty-state detection, and save payloads remain driven only by the playable `Character` record and metadata fallback. Effective lore is contextual, source-backed archive content.

When no effective lore character exists for a token, render no empty lore panel. Keep the “Add community story” CTA as the only no-lore action, and show that CTA only to token owners/admins while `showLoreNav` is enabled and the sheet is not in edit mode. Published lore appearances remain public when they exist; only the submission CTA is owner-gated.

## Implementation Progress

- [x] Item 1 — Effective token lore contract/resolver and resolver-focused unit tests completed by build agent. Validation reported: `bun run test -- tests/unit/lore-effective-query.test.ts` passed.
- [x] Items 2–3 — Server wrapper/client shell and server lore loading completed by build agent. Validation reported: lint on changed route files passed; resolver unit test still passed.
- [x] Items 4–7 — Presentation seam, layout wiring, owner/admin CTA gating, optional href cleanup completed by build agent. Validation reported: focused component tests and lint passed.
- [x] Item 8 — Focused validation across resolver and component seams completed. Orchestrator-confirmed: focused Jest suites passed (5 suites, 26 tests) and focused lint passed.

## Work Items

### Item 1 — Add the effective token lore contract and resolver

**Goal:** Provide one server-side source of truth for resolving published effective lore by playable token id.

**Done when:**

- `lib/lore/types.ts` exports a shared, serializable `EffectiveTokenCharacterLore` DTO. It may reuse public lore field names, but should expose only the fields needed by the character sheet: matched character summary, `matchedCharacterIds`, ordered appearance summaries, optional `firstAppearance`, associated location summaries, season summaries, source summaries, and `sourceCount`.
- `lib/lore/effective-query.ts` exports `getEffectiveTokenCharacterLore(tokenId: number): Promise<EffectiveTokenCharacterLore | undefined>`.
- The resolver matches `character.tokenId === tokenId` and token-only ids like `character-${tokenId}`. It returns `undefined` for invalid/no-match cases.
- Primary-character selection is deterministic: prefer a token-linked record whose id is not `character-${tokenId}`, then prefer `character-${tokenId}`, then sort remaining matches by `name` and `id`.
- Appearance ordering is deterministic: include events whose `characterIds` intersect `matchedCharacterIds`, then sort by `timelineOrder` and `title`.
- `firstAppearance` comes from `character.firstAppearanceEventId` when it points to an effective matched appearance; otherwise use the first ordered appearance.
- Associated locations and sources are deduped in first-seen appearance order; seasons are deduped from appearances and sorted by existing season order.
- The resolver uses only effective lore data: active base dataset, published canonization overrides, and published community submissions.
- No public lore page helper changes behavior.

**Key files:**

- `lib/lore/types.ts:92`
- `lib/lore/types.ts:121`
- `lib/lore/effective-query.ts:143`
- `lib/lore/effective-query.ts:191`
- `lib/lore/effective-query.ts:337`
- `lib/lore/effective-query.ts:456`
- `tests/unit/lore-effective-query.test.ts`

**Dependencies:** None.

**Size:** M.

### Item 2 — Split the character route into server wrapper and client shell

**Goal:** Enable server-side lore loading without sacrificing the current client-owned character-detail behavior.

**Done when:**

- `app/characters/[tokenId]/page.tsx` no longer carries `'use client'`; it becomes an async server route wrapper.
- The existing interactive page body moves into a client component, for example `app/characters/[tokenId]/CharacterDetailClient.tsx` or `components/characters/detail/CharacterDetailClient.tsx`.
- The server wrapper passes `tokenIdParam` as the original route string; the client shell parses it with the current `parseInt(..., 10)` behavior so invalid-param behavior stays as close as possible to today’s client route.
- The moved client component preserves the existing behavioral ownership: character fetch/loading/not-found, edit/save/cancel, unsaved guard, tab query sync, ownership checks, chat readiness, image handling, add-community-story routing, and modal lifecycle.
- Exact import organization and file placement are implementation details as long as those behaviors and tests are preserved.

**Key files:**

- `app/characters/[tokenId]/page.tsx:1`
- `app/characters/[tokenId]/page.tsx:35`
- `app/characters/[tokenId]/page.tsx:58`
- `app/characters/[tokenId]/page.tsx:169`
- `components/characters/detail/CharacterSheetLayout.tsx`

**Dependencies:** None.

**Size:** M.

### Item 3 — Load effective lore in the server wrapper

**Goal:** Pass optional lore context into the client sheet without adding a new client read endpoint.

**Done when:**

- The server wrapper derives `showLoreNav` from the same `NEXT_PUBLIC_SHOW_LORE_NAV` flag currently used by the client module and passes that value through to the client shell.
- The server wrapper parses `tokenIdParam` separately for lore loading. If it is not a positive integer, skip `getEffectiveTokenCharacterLore` and pass `initialLore: null` plus no lore error; do not call the resolver with `NaN`.
- When `showLoreNav` is enabled and the parsed token id is valid, the wrapper calls `getEffectiveTokenCharacterLore(tokenId)`.
- Lore-load failures are caught and converted into a compact `initialLoreError`/degraded prop so the playable character page can still render.
- No effective lore returns `initialLore: null`, not a synthetic empty record.
- The server wrapper passes a serializable prop contract into the client shell: `tokenIdParam`, `showLoreNav`, `initialLore`, and optional `initialLoreError`.
- The route remains dynamic/no-store as needed so server-loaded lore reflects published submissions and canonization overrides.

**Key files:**

- `app/characters/[tokenId]/page.tsx`
- `lib/lore/effective-query.ts`
- `lib/lore/types.ts`
- `docs/plans/lore-real-data-transition-2026-05-09.md:19`

**Dependencies:** Items 1 and 2.

**Size:** S.

### Item 4 — Add a compact lore appearances presentation seam

**Goal:** Introduce a read-only character-detail component for effective lore appearances without duplicating the full lore profile page.

**Done when:**

- `components/characters/detail/CharacterLoreAppearancesSection.tsx` renders compact effective lore context from `EffectiveTokenCharacterLore` props.
- The component links the full lore profile to `/lore/characters/${lore.character.slug}`.
- Official event links go to `/lore/events/[slug]`; community event links go to `/lore/community/[slug]`.
- The component may reuse link conventions or compact source/timeline helpers from `components/lore`, but it does not embed `CharacterProfile` or own fetching.
- The component clearly distinguishes archive appearances from editable story/backstory.
- `components/characters/detail/index.ts` exports the new component if the detail barrel is used.

**Key files:**

- `components/characters/detail/CharacterLoreAppearancesSection.tsx`
- `components/characters/detail/index.ts`
- `components/lore/CharacterProfile.tsx:29`
- `components/lore/CharacterProfile.tsx:76`
- `components/lore/CharacterProfile.tsx:193`
- `components/lore/AppearedInTimeline.tsx`
- `components/lore/SourceList.tsx`

**Dependencies:** Item 1.

**Size:** M.

### Item 5 — Wire lore into `CharacterSheetLayout` additively

**Goal:** Place effective lore context in the existing `sheet` tab without changing the tab contract or existing sheet behavior.

**Done when:**

- `CharacterSheetLayoutProps` accepts optional `lore` and `loreError` props derived from server-loaded `initialLore`/`initialLoreError`. It does not need client loading/retry props unless the implementation adds a client refresh path later.
- Lore rendering is considered only inside `activeTab === 'sheet'`.
- The lore block appears after `CharacterStorySection` and before `CharacterEquipmentSection`.
- Lore renders only when `showLoreNav && !isEditMode`.
- `loreError` renders as a compact degraded state; it does not block the playable sheet.
- `lore === null` with no error renders nothing, leaving the owner-only “Add community story” CTA as the no-lore path.
- Existing `sheet`, `ai-persona`, and `on-chain` tab behavior is unchanged.

**Key files:**

- `components/characters/detail/CharacterSheetLayout.tsx:22`
- `components/characters/detail/CharacterSheetLayout.tsx:337`
- `components/characters/detail/CharacterStorySection.tsx:22`
- `components/characters/detail/CharacterStorySection.tsx:31`
- `tests/components/characters/detail/CharacterSheetLayout.test.tsx`

**Dependencies:** Items 3 and 4.

**Size:** M.

### Item 6 — Gate submission/no-lore CTAs to token owners/admins

**Goal:** Keep no-lore prompting focused on users who can act on the token while preserving public lore visibility when appearances exist.

**Done when:**

- Replace the ambiguous CTA permission with a clearly named boolean such as `canSubmitCommunityStory` or `canEditCharacter`, derived from the existing admin-inclusive `canEditCharacterForAddress(character, address, userIsAdmin)` result.
- The “Add community story” CTA in `CharacterStorySection` renders only when `showLoreNav && canSubmitCommunityStory && !isEditMode`.
- If `lore === null`, non-owners/non-admins see no empty lore panel and no submit CTA.
- If `lore` exists, owners and non-owners can both see the read-only lore appearances section, subject to `showLoreNav`.
- The route still points allowed CTA clicks to `/lore/submit?tokenId=${tokenId}`.
- Tests cover admin-inclusive CTA permission so the owner-only wording does not accidentally exclude admins.

**Key files:**

- `components/characters/detail/CharacterStorySection.tsx:8`
- `components/characters/detail/CharacterStorySection.tsx:31`
- `app/characters/[tokenId]/page.tsx:66`
- `app/characters/[tokenId]/page.tsx:185`
- `lib/domain/character/ownership`

**Dependencies:** None for the CTA permission change; Item 5 for validating the final no-lore layout.

**Size:** S.

### Item 7 — Centralize lore href conventions if duplication appears

**Goal:** Avoid a third copy of official/community/profile link conventions while keeping this as a small consistency cleanup.

**Done when:**

- If implementation would otherwise duplicate event/profile URL logic, add `lib/lore/navigation.ts` with helpers such as `getLoreEventHref(event)` and `getLoreCharacterHref(character)`.
- Existing `CharacterProfile`, `AppearedInTimeline`, and new `CharacterLoreAppearancesSection` use the helper where practical.
- There is no visual or behavior change in existing public lore pages.
- If the implementation can avoid meaningful duplication without this file, this item may be skipped.

**Key files:**

- `lib/lore/navigation.ts`
- `components/lore/CharacterProfile.tsx:29`
- `components/lore/AppearedInTimeline.tsx`
- `components/characters/detail/CharacterLoreAppearancesSection.tsx`

**Dependencies:** Item 4.

**Size:** S.

### Item 8 — Validate preservation and lore visibility

**Goal:** Confirm the new lore integration is additive, source-correct, and does not regress existing character-page flows.

**Done when:**

- Unit coverage verifies token-id resolver behavior for no match, base token-linked lore characters, token-only synthesized `character-{tokenId}` records from published submissions, multiple matched ids, and exclusion of unpublished/draft submissions.
- Component coverage verifies lore renders in the `sheet` tab when present, renders nothing for no-lore state, does not render in `ai-persona`/`on-chain`, owner/admin-gates the submit CTA, and leaves AI persona/wallet behavior intact.
- Route/component coverage or manual verification confirms the server wrapper passes lore props into the client shell without breaking query tab aliases or client hooks.
- Smoke checks cover story edit/save/cancel, AI persona tab and chat readiness, `?tab=wallet` alias, image fallback/disclosure, owner actions/modals, no-lore behavior for owners vs non-owners, and published vs unpublished community lore visibility.
- Targeted validation commands are documented in the implementation summary, with `bun run test` or focused Jest commands used as appropriate.

**Key files:**

- `tests/unit/lore-effective-query.test.ts`
- `tests/components/characters/detail/CharacterSheetLayout.test.tsx`
- `app/characters/[tokenId]/page.tsx`
- `components/characters/detail/CharacterSheetLayout.tsx`
- `components/characters/detail/CharacterStorySection.tsx`

**Dependencies:** Items 1–6.

**Size:** M.

## Open Questions

None blocking. The plan locks in in-sheet lore placement, server-side lore loading through a route wrapper/client shell split, and owner/admin-only no-lore submission CTA behavior.

## References

- `app/characters/[tokenId]/page.tsx`
- `components/characters/detail/CharacterSheetLayout.tsx`
- `components/characters/detail/CharacterStorySection.tsx`
- `hooks/useCharacterDetailData.ts`
- `hooks/useCharacterEditor.ts`
- `types/character.ts`
- `app/lore/characters/[slug]/page.tsx`
- `components/lore/CharacterProfile.tsx`
- `components/lore/AppearedInTimeline.tsx`
- `components/lore/SourceList.tsx`
- `lib/lore/effective-query.ts`
- `lib/lore/types.ts`
- `tests/unit/lore-effective-query.test.ts`
- `tests/components/characters/detail/CharacterSheetLayout.test.tsx`
- `docs/plans/character-page-coherence-2026-05-11.md`
- `docs/plans/lore-real-data-transition-2026-05-09.md`
- `docs/plans/community-lore-media-submissions-2026-05-09.md`
