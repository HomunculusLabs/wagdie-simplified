# Event Pages Overhaul Plan Critique

## 1. Top 3 under-specified seams

1. **Connected-event scope is ambiguous.** The plan defines `connectedEvents` only as “up to four events sharing characters or locations” (`docs/plans/event-pages-overhaul-2026-05-19.md:52-56`). The export explicitly said to use “all effective events, official and community” (`prompt-exports/oracle-plan-2026-05-19-193858-event-detail-plan-c8-5733.md:386`). That policy matters: including community records changes copy, visual treatment, and whether official pages can link into community pages.
2. **Related-context overlap ownership needs one more rule.** The plan says the component decides overlap/sparse rendering (`docs/plans/event-pages-overhaul-2026-05-19.md:58`) but does not preserve the export’s useful “dedupe against timeline neighbors in rendering, not data” framing (`prompt-exports/oracle-plan-2026-05-19-193858-event-detail-plan-c8-5733.md:398`). Without that, implementers may prune route data too early and lose UI flexibility.
3. **Provenance collapse behavior is optional instead of specified.** “Preferably low-emphasis and collapsible” (`docs/plans/event-pages-overhaul-2026-05-19.md:50`) leaves the implementer to decide whether sources are visible, collapsed, or custom-interactive. The export’s native `<details>` guidance (`prompt-exports/oracle-plan-2026-05-19-193858-event-detail-plan-c8-5733.md:321`) was more actionable and avoided client-state scope.

## 2. Specificity balance

The plan mostly strikes the right balance by specifying outcomes instead of exact layout. Two useful export constraints were dropped and should probably be restored: `OfficialLoreEventDetail` as a server/no-client-state component (`prompt-exports/...md:248`) and the exact connected-event candidate pool (`prompt-exports/...md:386`). Conversely, the named helper path `components/lore/lore-event-cover.ts` is tactical, but acceptable because it protects a concrete duplication seam already identified in the plan.

## 3. Contradictions or missing dependencies

- The related helper is described as a replacement (`docs/plans/event-pages-overhaul-2026-05-19.md:52-53`) but Item 3 says “replaced or supplemented” (`docs/plans/event-pages-overhaul-2026-05-19.md:112`). Pick one; keeping both `relatedEvents` and `relatedContext` invites duplicate rendering paths.
- Item 4 is listed after the official route switch, but community preservation should be a pre/post guardrail around Item 3, not only a later dependent task (`docs/plans/event-pages-overhaul-2026-05-19.md:123-129`).
- Item 3 says pass `allCharacters` “if related archive cards need” it (`docs/plans/event-pages-overhaul-2026-05-19.md:111`). If `LoreEventCard` remains the related-card renderer, this should be a firm dependency, not conditional.

## 4. Risk of over-planning

Low overall. The plan already cut the export’s post-implementation plan-update work item, which is good. The main simplification opportunity is the long Background: prior-art commit and prior-plan bullets are useful context, but an implementation agent probably only needs them as references, not as required reading before starting.

## 5. Questions whose answers would change implementation order

1. Should official detail pages link to community records in `connectedEvents`, or should related cards stay official-only for now?
2. Should provenance be collapsed by default using native `<details>`, or visibly present but low-emphasis?
3. Should Storybook coverage be created before route switching so the new template can be reviewed in isolation, or after route integration?
