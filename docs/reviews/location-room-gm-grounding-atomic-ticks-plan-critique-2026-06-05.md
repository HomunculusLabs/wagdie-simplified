# Location Room GM Grounding + Atomic Ticks Plan Critique

## 1. Top 3 under-specified seams
1. **Batch RPC dedupe semantics are still ambiguous** (`docs/plans/location-room-gm-grounding-atomic-ticks-2026-06-05.md:114`, `:127-130`, `:227-230`). The plan requires keyed and unkeyed dedupe reuse while returning rows in input order, but does not specify conflict targets, how unkeyed rows are matched safely, or whether message IDs are client-supplied vs. generated. This is the highest-risk seam because it affects rollback/idempotency tests.
2. **Post-publish metadata failure recovery is not defined** (`docs/plans/...:93-100`, `:151-162`, `:258-263`). The batch publish is atomic, but beat metadata/state patches happen after publish. If metadata patching fails, the next retry must rediscover already-published messages by dedupe/RPC return behavior, not only by stored message IDs. The plan hints at this but does not make it a done-when.
3. **Drift validation source boundaries are fuzzy** (`docs/plans/...:42-57`, `:188-197`). “Allowed grounding text” includes transcript/spatial/catalog/premise, but the plan does not define token/phrase matching rules for broad sentinels like `map`, case/plural handling, or whether validation applies to GM beat, scene-check outcome, or both normalization paths. Implementers could create either noisy false positives or ineffective checks.

## 2. Specificity balance
- The stricter scope choices are reflected correctly: drift validation, DB transaction/RPC, and reset reseed tooling are included rather than deferred.
- The plan should carry forward the export’s useful blast-radius framing: the export repeatedly notes the repo has no batch append API and that buffering alone was the lower-blast-radius fix (`prompt-exports/oracle-plan-2026-06-05-164007-gm-atomic-grounding-e735.md:52`, `:60`, `:163`, `:387`). Since RPC is now chosen, the plan should explicitly constrain it to a narrow repository method and migration tests, not a broader persistence refactor.
- The plan is appropriately less tactical than the export on catalog section IDs: it says to iterate normalized sections instead of hard-coding IDs (`docs/plans/...:40`), which avoids overfitting to the export’s suggested section list (`prompt-exports/...:217-218`).

## 3. Contradictions or missing dependencies
- **Item 3 dependency looks wrong/too serial**: reset reseed depends on existing catalog seeding behavior, not necessarily Item 1 prompt grounding (`docs/plans/...:205-221`). If live room-11 validation depends on reset tooling, Item 3 may need to land before or alongside prompt tests, not after Item 1 by default.
- **Item 5 depends on Item 4, but coordinator buffering can be developed/tested before RPC** (`docs/plans/...:244-266`). If Item 4 slips, implementers should still be able to refactor generation-before-publish behind an interface, then swap single append vs. batch append.
- The plan names likely admin/service reset code “to be discovered” (`docs/plans/...:214-217`) but Work Item 7 depends on using it for room 11 (`docs/plans/...:291-299`). That discovery should be an explicit prerequisite, not hidden in implementation.

## 4. Risk of over-planning
- The Approach and Work Items duplicate the same long scene-check sequence (`docs/plans/...:68-100`, `:244-263`). Keep one canonical sequence to reduce drift during implementation.
- The runbook item (`docs/plans/...:285-302`) is useful but should be a short verification checklist, not an implementation work item competing with code changes.

## 5. Questions that would change implementation order
1. Should the RPC/migration be implemented and tested first, or should coordinator buffering land first behind an `appendMessagesBatch()` seam?
2. Which existing admin/reset route or service owns reset reseed? If none exists, is adding an API route required before prompt/atomic tests are considered complete?
3. Must retry recovery handle “batch publish succeeded, metadata patch failed” in the first implementation, or is that a follow-up acceptance gap?
