# Crow's Den Progression Fix Plan Critique

Scope: critique of `docs/plans/crows-den-progression-fix-2026-05-24.md` against the original context-builder export at `prompt-exports/oracle-plan-2026-05-24-204403-crows-den-plan-5d1f1-c95c.md`.

## 1. Top 3 under-specified seams

1. **Deduped tick intent promotion semantics** — The plan requires scheduled ticks as `auto`, gameplay continuations as `combat`, and pending/failed manual ticks to promote by `combat > story > auto` without touching processing ticks (`docs/plans/crows-den-progression-fix-2026-05-24.md:44-46`). It does not say how to identify the deduped row, whether failed-but-not-due ticks can be promoted, what response should be returned after promotion, or how this interacts with any admin combat trigger already created before enqueue.
2. **Repair failure persistence boundary** — The plan says failed repair produces no public messages/state update (`docs/plans/crows-den-progression-fix-2026-05-24.md:89-90`) and later says failed repair marks the beat failed/dead with safe metadata (`docs/plans/crows-den-progression-fix-2026-05-24.md:129-131`). Implementers must infer whether a narrative beat row always exists before generation, where failed-generation metadata lives, and how tick failure/dead status maps to narrative beat status.
3. **Guided progression validation mechanics** — The requirement that non-aftermath beats have objective/open thread and must “advance” or raise threat/readiness (`docs/plans/crows-den-progression-fix-2026-05-24.md:106-108`) is directionally right but underspecified. It does not define how to compare against previous state, what counts as objective/thread advancement, or whether stale/reworded open threads fail validation.

## 2. Specificity balance

- **Over-specific tactical choices:** The diagnostics item enumerates many exact fields/UI renderings; useful, but an implementation agent should own the DTO/UI grouping once it inspects current diagnostics surfaces. The migration index is also framed as “useful for room diagnostics” rather than explaining the query it must support.
- **Useful export framing dropped:** The export explicitly says transport failures before response collection should not enter the repair path (`prompt-exports/oracle-plan-2026-05-24-204403-crows-den-plan-5d1f1-c95c.md:311`), calls out a private repair prompt builder (`...:333`), and notes generated Supabase type drift/regeneration (`...:783`). Those are practical implementation constraints that the plan mostly omits.

## 3. Contradictions or missing dependencies

- “Beat failed/dead” is imprecise: `dead` appears to be tick lifecycle language, not necessarily narrative beat lifecycle language.
- Item 6 diagnostics should also depend on Item 4, because “missing objective/readiness” diagnostics are only meaningful after the guided progression contract is defined.
- The plan misses a deployment/schema dependency from the export: new repository code selecting `turn_intent` requires the migration and any generated DB types to be applied/regenerated first.
- Admin `combat` trigger timing is unclear: enqueue-time trigger creation vs processing-time deterministic repair affects Item 1/2 ordering and idempotency.

## 4. Risk of over-planning

Cut or simplify the exhaustive diagnostics/UI field list into: “extend diagnostics service/API with intent, retry/cadence, safe GM repair status, and trigger/readiness summary; render minimally in admin UI.” Also collapse Item 7’s long test/smoke list into behavior clusters so implementation can adapt to existing test helpers without treating every bullet as a separate required test.

## 5. Questions that would change implementation order

1. Must the `turn_intent` migration/types land before any service work, or can GM repair ship independently first?
2. Should admin combat triggers be created at manual request time, claim/processing time, or both for repair/idempotency?
3. What is the canonical storage surface for safe GM generation diagnostics: tick error fields, narrative beat metadata, or a dedicated diagnostics projection?
4. Is admin UI rendering required in the first implementation PR, or is diagnostics API/test coverage enough for the first fix?
