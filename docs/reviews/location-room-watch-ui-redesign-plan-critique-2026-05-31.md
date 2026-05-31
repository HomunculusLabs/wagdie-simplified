# Location Room Watch UI Redesign Plan Critique

## 1. Top 3 under-specified seams

1. **Transcript display-item contract.** The plan names `deriveCurrentBeat`, `buildTranscriptDisplayItems`, speaker keys, continuations, dividers, and pending markers, but does not define the minimum item shape, stable keys, divider label source, or where exactly the “latest unseen” marker lands when more than one message is unseen (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:60-64`, `:151-155`). An implementer will have to invent the contract and test selectors.
2. **Follow/latest sequence source and empty-state behavior.** The plan says to track `lastSeenSequence` and `pendingLatestSequence`, but does not specify whether “latest sequence” comes from `activity.latestSequence`, the last message, or a fallback when there are no public messages (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:62`, `:112-119`). This affects initial load, duplicate refresh handling, and current-beat visibility.
3. **Freshness/status ownership.** The UI shape includes fetched/generated freshness in the live rail, while Item 2 says detailed operational freshness moves into the awareness panel, and Item 6 keeps freshness/details in the sidebar (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:53`, `:92-93`, `:175`). The plan needs a sharper split: which exact timestamps/chips are rail-level vs sidebar-only vs warning-only.

## 2. Specificity balance

- The plan is appropriately less prescriptive than the export about `CurrentBeatPanel`: making it optional avoids forcing a tactical component boundary (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:63`, `:125-133`).
- It over-specifies helper names before the desired rendered behavior is fully nailed down (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:60`). The implementation agent could own naming if the plan instead required stable derived current beat + transcript item behavior.
- The plan drops useful sidebar framing from the export. The export gave a clearer density hierarchy: encounter/status snapshot, compact roster, lower collapsible/details stats, monsters/rewards/freshness, and mobile awareness before transcript (`prompt-exports/oracle-plan-2026-05-31-110514-watch-ui-plan-6431bf-d9b4.md:278-282`, `:538-539`, `:817-825`). The plan softens this to “keep useful current fields, including stats” and “mobile layout remains usable,” which reintroduces guessing (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:178-181`).

## 3. Contradictions or missing dependencies

- Freshness placement conflicts as noted above: rail freshness vs “detailed freshness” in sidebar needs one source-of-truth rule.
- Item 2 includes the follow/latest control in the header, but Item 3 defines its real states and behavior. Tests in Item 2 should avoid final follow-copy assertions until Item 3 lands (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:91`, `:105-119`).
- If Item 5 depends on `pendingLatestSequence` from Item 3, its inline unseen marker criteria should explicitly depend on that state, not only on presentation helpers (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:147-155`).

## 4. Risk of over-planning

- Phase/domain dividers are repeatedly mentioned but intentionally optional. Consider cutting divider acceptance from the first implementation pass and keeping only continuation styling + latest/new-activity marker (`docs/plans/location-room-watch-ui-redesign-2026-05-31.md:41`, `:55`, `:153`).
- Item 1 risks becoming an abstraction pass before UI behavior proves it needs every helper. Keep only helpers required by Item 2/3/5; defer “concise freshness helper” unless duplication appears.

## 5. Questions whose answers would change implementation order

1. Is the current-beat affordance required for V1, or can transcript + new-activity marker ship first?
2. On mobile, should the awareness panel appear before the transcript as the export suggested, or after/around it as the plan now says?
3. Which exact freshness facts must remain above the fold?
4. Are phase/domain dividers desired in this pass, or should they be deferred until continuation/new-activity behavior is validated?
