# Event Pages Overhaul: Plan

## Goal
Overhaul the shared `/lore/events/[slug]` official event-detail experience so all official lore records feel cohesive with the newly restyled `/lore` archive, with `genesis-mint` as the reference case.

The target experience is archive-cohesive, narrative-first, and process-light: keep the lore record readable and visually strong, preserve provenance as secondary material, and move related context into an adaptive treatment that helps browsing without dominating the page.

## Background
- User direction from the up-front checkpoint: target all official event detail pages, not only `genesis-mint`; align closely with the restyled `/lore` archive visual language; remove most dense canon/process metadata from the main experience; use an adaptive hybrid for related context.
- The official event route is `app/lore/events/[slug]/page.tsx`. It forces dynamic rendering and resolves event data through the effective lore layer before rendering `LoreEventDetail` (`app/lore/events/[slug]/page.tsx:17`, `app/lore/events/[slug]/page.tsx:33-67`, `app/lore/events/[slug]/page.tsx:85-113`).
- The route only serves official lore events via `getEffectiveOfficialEventBySlug`; community records use a parallel `/lore/community/[slug]` route and should not be conflated in this overhaul unless a shared component seam is intentionally preserved (`app/lore/events/[slug]/page.tsx:34-40`).
- Event page data already includes more than the desired primary experience needs: event, season, locations, characters, related entities, sources, media, related events, all locations, and seasons (`app/lore/events/[slug]/page.tsx:45-66`). The redesign should choose what stays primary, what becomes secondary, and what can be omitted from the official page.
- Current `LoreEventDetail` accepts the full resolved event-detail graph: event, season, locations, characters, related entities, sources, media, relatedEvents, seasons, allLocations, and optional `communityContext` (`components/lore/LoreEventDetail.tsx:20-32`).
- Current `LoreEventDetail` renders a dense record/process page: back links, kind/status chips, `CanonWorkflowSummary`, metadata cards, chronicle body, a right rail for characters/locations/entities, `CanonizationPath`, `MediaGallery`, `SourceList`, and related timeline (`components/lore/LoreEventDetail.tsx:83-217`). This matches the screenshot’s messy process-heavy feel and is the main redesign target.
- The newly restyled `/lore` archive establishes the cohesive visual direction: `max-w-7xl` container, `space-y-8`, dark `bg-soul-950` shell, serif kicker/heading/body hierarchy, active-filter borders, and quiet archive copy (`components/lore/LoreArchive.tsx:64-126`, `app/lore/page.tsx:24-36`).
- Archive cards provide the most concrete visual language to carry into event details: dark translucent cards, `border-midnight-light/35`, image-forward 16:9 covers, bottom gradients, hover `border-soul-accent/50`, compact date/kind/season metadata, and `text-bone`/`text-soul-accent` hierarchy (`components/lore/LoreEventCard.tsx:18-100`).
- `LoreEventCard` currently keeps event cover images in a hardcoded slug map and falls back to a character image (`components/lore/LoreEventCard.tsx:18-55`). If event detail pages need the same hero imagery, that seam should be shared instead of duplicated.
- Shared page chrome currently uses `BannerHeader` on event details, while `/lore` itself renders an in-page hero section. The overhaul should move official event pages closer to the archive page’s in-content hierarchy instead of stacking another generic banner above the record (`app/lore/events/[slug]/page.tsx:94-101`, `components/lore/LoreArchive.tsx:64-80`).
- Visual-system tokens and conventions are already established through Tailwind: `font-display`, `font-serif`, `bg-soul-950`, `bg-soul-900/50`, `bg-black/20`, `border-midnight-light/*`, `text-bone`, and `text-soul-accent` (reported from `tailwind.config.ts:11-19`, `tailwind.config.ts:51-83`, `app/globals.css:35-56`).
- Storybook already covers `LoreEventDetail` and `LoreArchive`, including official and community detail states. The implementation should update or add stories to reflect the new official-detail hierarchy rather than relying only on localhost screenshots (`components/lore/LoreEventDetail.stories.tsx:14-42`, `components/lore/LoreArchive.stories.tsx:14-35`).
- Prior art: commit `df0b3bcb` (`feat: redesign lore archive cards`, May 19, 2026) is the closest visual precedent and touched `app/lore/page.tsx`, `components/lore/LoreArchive.tsx`, `LoreEventCard.tsx`, `LoreFilterBar.tsx`, `LoreTimeline.tsx`, and archive image assets.
- Prior art: commit `b1cb1363` (`feat: add connected lore archive`, May 8, 2026) introduced the archive/detail routes and major lore components including `LoreEventDetail`, `MediaGallery`, `SourceList`, and related navigation.
- Prior art: `docs/plans/community-lore-media-submissions-2026-05-09.md` and `docs/plans/lore-real-data-transition-2026-05-09.md` emphasize keeping public lore routes on shared effective-query contracts rather than separate presentation-only data paths.

## Approach
Use a targeted presentation split: official event pages get a new official-only detail component, while community event pages keep the existing process-explicit detail path. The new official component should remain a server component with no client state.

This is preferable to turning `LoreEventDetail` into a large variant-driven component. Official records need a narrative, archive-like presentation with only lightweight canon/provenance signals. Community records still need explicit canon workflow visibility so submissions, disputes, and review states are not confused with accepted canon. Preserving the community path also reduces regression risk.

The official route should continue using the existing effective-query data seam. This plan does not introduce new persistence, new lore data contracts, Markdown rendering, or domain-level canon changes. The work is mostly presentation, route shaping, and Storybook coverage.

Recommended structure:

1. Extract the archive cover-image lookup from `LoreEventCard` into a shared presentation helper.
2. Add `OfficialLoreEventDetail` for `/lore/events/[slug]`.
3. Update the official event route to render the new component and compute richer related context.
4. Leave `CommunityEventDetail -> LoreEventDetail` process behavior intact.
5. Add Storybook coverage for the new official hierarchy and verify the archive/card stories still render.
6. Polish against `/lore/events/genesis-mint`, then spot-check the other official event slugs.

### Official detail hierarchy
The new official template should use the archive’s visual language and this content hierarchy:

1. **Archive-style nav** — keep `← Back to lore archive` and an optional compact official-canon browse link. Do not keep `BannerHeader` on official event detail pages.
2. **Image-forward hero** — use the shared cover helper. Include title, summary, quiet metadata, and a small official/canon chip. Avoid workflow stage language in the hero.
3. **Narrative body** — render `event.body` as large, readable serif prose. Continue newline-split paragraph rendering; do not introduce Markdown rendering in this task.
4. **Story context** — show characters, locations, and related entity chips as lore context, not as an audit sidebar. Use an adaptive desktop/mobile layout instead of a permanently heavy right rail.
5. **Media** — keep media when present, positioned after narrative/context as preserved fragments rather than process evidence.
6. **Related context** — combine chronological neighbors, connected records, and browse-by-context chips in an adaptive related section.
7. **Secondary provenance** — keep sources/provenance discoverable near the bottom in a low-emphasis native `<details>` section. Do not add client state for this. Do not render `CanonWorkflowSummary` or `CanonizationPath` in the official primary path.

### Related-context data shape
Replace the current single `relatedEvents` helper with a route-local related-context helper that returns:

- `timelineNeighbors`: previous/next official events by `timelineOrder`, excluding the current event.
- `connectedEvents`: up to four events from all effective events, official and community, sharing characters or locations, scored by shared characters, shared locations, same season, timeline distance, and title.

Keep timeline-neighbor and connected-event lists separate in route data; dedupe overlap in rendering, not in the data helper, so the UI can choose whether an overlapping record belongs in the chronological row, the connected grid, or both. If connected events are plentiful, use archive-card-style grid treatment. If there are only one or two, render compact cards. If none exist, omit empty filler copy and rely on browse/context chips. Because connected events may include community records, use existing event-kind routing behavior when linking cards.

### Cover-image seam
Move the slug-to-cover map out of `LoreEventCard.tsx` into a small shared helper, for example `components/lore/lore-event-cover.ts`. It should prefer explicit event cover images, fall back to the first related character image, and return a deterministic no-image state. Both `LoreEventCard` and `OfficialLoreEventDetail` should use it.

## Work Items

### Item 1 — Extract a shared event-cover helper
**Goal:** Share event cover-image selection between archive cards and the new official event hero.

**Done when:**
- The hardcoded `eventCoverImages` map no longer lives inside `LoreEventCard.tsx`.
- `LoreEventCard` renders the same covers and fallbacks as before.
- The helper can return explicit event cover, first character image fallback, or no-image fallback metadata.
- No lore domain or persistence changes are introduced.

**Key files:**
- `components/lore/lore-event-cover.ts` — new helper.
- `components/lore/LoreEventCard.tsx` — consume helper (`components/lore/LoreEventCard.tsx:18-55`).
- `components/lore/LoreEventCard.stories.tsx` — verify archive-card behavior.

**Dependencies:** None.

**Size:** Small.

### Item 2 — Add the official-only event detail template
**Goal:** Introduce `OfficialLoreEventDetail` as the shared presentation template for all official `/lore/events/[slug]` pages.

**Done when:**
- The component renders archive-style nav, image-forward hero, compact official metadata, narrative body, story context, media, adaptive related context, and secondary provenance.
- The component remains server-rendered and does not introduce client state.
- The component does not render `CanonWorkflowSummary`, `CanonizationPath`, or workflow-stage emphasis in the primary official page path.
- It reuses existing lore types and existing subcomponents where they fit: `CharacterPortrait`, `EntityChips`, `MediaGallery`, `SourceList`, and `LoreEventCard`.
- It stays presentation-only and does not create new public data contracts.

**Key files:**
- `components/lore/OfficialLoreEventDetail.tsx` — new component.
- `components/lore/CharacterPortrait.tsx` — compact character context.
- `components/lore/EntityChips.tsx` — location/entity/context chips.
- `components/lore/MediaGallery.tsx` — secondary media section.
- `components/lore/SourceList.tsx` — secondary provenance.
- `components/lore/LoreEventCard.tsx` — related cards.
- `components/lore/lore-event-cover.ts` — hero image seam.

**Dependencies:** Item 1.

**Size:** Medium-large.

### Item 3 — Switch the official route to the new template
**Goal:** Make all official event detail pages use the new official template while preserving the effective-query resolver seam.

**Done when:**
- `app/lore/events/[slug]/page.tsx` imports and renders `OfficialLoreEventDetail` instead of `BannerHeader + LoreEventDetail`.
- The route still uses `getEffectiveOfficialEventBySlug`, `getAllEffectiveLoreEvents`, `getAllEffectiveLoreCharacters`, `getAllEffectiveLoreLocations`, `getAllEffectiveLoreSeasons`, and the existing effective source/media/entity helpers (`app/lore/events/[slug]/page.tsx:33-67`).
- The resolver passes `allCharacters` so related archive cards can use character-image fallbacks consistently with `LoreEventCard`.
- The old single `relatedEvents` output is replaced by a richer `relatedContext` object; avoid maintaining duplicate official-page related rendering paths.
- Official metadata generation and `notFound()` behavior remain unchanged (`app/lore/events/[slug]/page.tsx:69-113`).

**Key files:**
- `app/lore/events/[slug]/page.tsx`.
- `components/lore/OfficialLoreEventDetail.tsx`.

**Dependencies:** Items 1–2.

**Size:** Medium.

### Item 4 — Preserve community/process detail behavior
**Goal:** Avoid regressing the community lore path while official pages become process-light. Treat this as a guardrail during Item 3 and verify it immediately after the official route switch.

**Done when:**
- `/lore/community/[slug]` still renders `CommunityEventDetail` and the existing process-explicit `LoreEventDetail` behavior.
- `LoreEventDetail` remains available for community/detail states that need `CanonWorkflowSummary`, `CanonizationPath`, sources, and community context warning.
- No official route imports `LoreEventDetail` directly after the split.
- Existing community Storybook coverage still demonstrates workflow/process visibility.

**Key files:**
- `app/lore/community/[slug]/page.tsx`.
- `components/lore/CommunityEventDetail.tsx`.
- `components/lore/LoreEventDetail.tsx`.
- `components/lore/LoreEventDetail.stories.tsx`.

**Dependencies:** Item 3.

**Size:** Small.

### Item 5 — Add Storybook coverage for the redesigned official detail page
**Goal:** Make the new official event hierarchy reviewable outside the app route and protect the archive-card visual seam.

**Done when:**
- A new official detail story exists using `genesis-mint` fixture data.
- The story covers an official canon event with cover image and, where feasible from fixtures, a sparse related-context state.
- Existing `LoreEventDetail` stories are renamed or documented so the process-heavy template is clearly community/legacy-oriented.
- `LoreEventCard` stories still pass after cover-helper extraction.

**Key files:**
- `components/lore/OfficialLoreEventDetail.stories.tsx` — new.
- `components/lore/LoreEventDetail.stories.tsx` — clarify scope.
- `components/lore/LoreEventCard.stories.tsx` — verify helper extraction.
- `components/lore/story-data.ts` — extend only if needed for deterministic related-context fixtures.

**Dependencies:** Items 1–4.

**Size:** Medium.

### Item 6 — Visual QA and responsive polish
**Goal:** Confirm the final official event page matches the archive redesign and removes the messy process-heavy presentation.

**Done when:**
- `/lore/events/genesis-mint` uses the same broad visual language as `/lore`: `max-w-7xl`, `bg-soul-950`, dark translucent panels, quiet metadata, `text-bone`/`text-soul-accent`, and image-forward hierarchy.
- Dense workflow/process blocks no longer appear above or beside the narrative body.
- The page is readable on mobile and desktop.
- Related context adapts cleanly for no connected events, one/two connected events, and three-plus connected events.
- Provenance remains discoverable but clearly secondary.
- Other official event slugs are spot-checked for sparse/missing media and varying related-entity counts.

**Key files:**
- `components/lore/OfficialLoreEventDetail.tsx`.
- `components/lore/lore-event-cover.ts`.
- `app/lore/events/[slug]/page.tsx`.
- `tailwind.config.ts` — reference only; no expected token changes.
- `app/globals.css` — reference only; no expected global changes.

**Dependencies:** Items 1–5.

**Size:** Medium.

## Implementation Progress
- [x] Core implementation: shared event-cover helper, official-only detail template, official route switch, richer related context, and community guardrail verification.
- [x] Storybook coverage and visual QA/polish: added official detail stories for the genesis-mint reference and sparse related-context state, clarified the legacy/community process detail stories, and ran focused lore lint checks. Full lint and Storybook build are still blocked by unrelated existing project issues noted during verification.

## Open Questions
None blocking. The implementation agent should own exact layout tactics within these constraints: archive-cohesive, narrative-first, process-light, official/community split preserved, related content adaptive.

## Verification
- `bun run test` for unit/domain regressions where feasible.
- `bun run lint` for route/component changes.
- Storybook review of the new official detail story, existing archive story, and event-card story.
- Browser review of `http://localhost:3001/lore/events/genesis-mint` plus at least one other official event slug with different related/media density.

## References
- Current page under review: `http://localhost:3001/lore/events/genesis-mint`
- `app/lore/events/[slug]/page.tsx`
- `app/lore/community/[slug]/page.tsx`
- `components/lore/LoreEventDetail.tsx`
- `components/lore/LoreArchive.tsx`
- `components/lore/LoreEventCard.tsx`
- `components/lore/LoreEventDetail.stories.tsx`
- `components/lore/LoreArchive.stories.tsx`
- `docs/plans/community-lore-media-submissions-2026-05-09.md`
- `docs/plans/lore-real-data-transition-2026-05-09.md`
- Commit `df0b3bcb` — `feat: redesign lore archive cards`
- Commit `b1cb1363` — `feat: add connected lore archive`
