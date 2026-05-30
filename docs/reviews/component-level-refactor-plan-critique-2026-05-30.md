# Component-Level Refactor Plan Critique

Source reviewed: `docs/plans/component-level-refactor-2026-05-30.md` against `prompt-exports/oracle-plan-2026-05-30-161732-component-refactor-7-0a1c.md`.

## 1. Top 3 under-specified seams

1. **`useSearingPageController` result contract.** The plan says `SearingPageClient` should render from “one controller result” and that the hook owns state/effects/handlers (`docs/plans/component-level-refactor-2026-05-30.md:33-40`, `:108-117`), but it omits the export’s useful partial interface (`prompt-exports/oracle-plan-2026-05-30-161732-component-refactor-7-0a1c.md:220`). Implementers must guess the controller shape: grouped loading/error states, wallet/auth fields, active tx hash, approval callback wrapping, refetch exposure, and selected item nullability.
2. **`FilterSidebarModel` boundary.** The plan names a grouped model and categories (`docs/plans/component-level-refactor-2026-05-30.md:59-61`, `:197-208`) but does not define minimal fields or config ownership. The export included a concrete model sketch (`prompt-exports/oracle-plan-2026-05-30-161732-component-refactor-7-0a1c.md:452-478`). Without that, implementers may disagree on whether primary/equipment configs are built in the parent, in `FilterSidebar`, or in `filter-sidebar-types.ts`.
3. **Homepage consent/modal seam.** Item 4 says `useVideoConsent` owns cookie/session dismissal while `app/page.tsx` still controls the modal (`docs/plans/component-level-refactor-2026-05-30.md:131-145`). That split is correct but underspecified: which hook callbacks map to grant, deny, close, Escape, and backdrop; whether `shouldShowConsentModal` lives in the hook; and whether deny is passed into the route or hidden in the modal wiring.

## 2. Specificity balance

- **Dropped useful framing:** The plan wisely removed the export’s long file-by-file impact section (`prompt-exports/...md:764`), but it also dropped the two contract sketches that would reduce ambiguity: `SearingPageController` and `FilterSidebarModel`.
- **Potential over-specification:** The plan names exact optional homepage composition components (`HomeHero`, `HomeFeatureSections`, `HomeFinalCta`) in both approach and Item 5 (`docs/plans/component-level-refactor-2026-05-30.md:50`, `:155-156`). That tactical decomposition should remain implementation-owned; “optional composition components if they reduce route complexity” is enough.
- **Good specificity:** The plan’s preservation notes for searing sync payload/refetch behavior and video cookie timing are appropriately concrete and should stay.

## 3. Contradictions or missing dependencies

- The global approach says extract presentational JSX before stateful orchestration (`docs/plans/component-level-refactor-2026-05-30.md:27`), but homepage Item 4 extracts the stateful consent hook before Item 5 extracts presentational components. This may be fine, but the plan should call it an intentional exception because cookie/modal behavior is the riskier seam.
- Item 8 includes tests for `useVideoConsent` (`docs/plans/component-level-refactor-2026-05-30.md:219-222`) but depends on Items 3, 5, and 7 (`:231`). It should depend on Item 4; Item 5 is not required for consent-hook tests.

## 4. Risk of over-planning

Cut or simplify the “References” list (`docs/plans/component-level-refactor-2026-05-30.md:258-275`) and optional component names. The plan is already specific enough in Work Items; long reference inventories and named optional components create false obligations without changing implementation safety.

## 5. Questions that would change implementation order

1. Should `FilterSidebarModel` be introduced as a type during Item 6, even while keeping old props, to avoid rebuilding configs twice?
2. Should homepage consent tests land immediately after Item 4 instead of waiting for all extracted seams in Item 8?
3. Is the searing controller expected to expose raw refetch/loading/error fields, or only view-ready grouped state for the route shell?
