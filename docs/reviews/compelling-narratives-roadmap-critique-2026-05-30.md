# Critique: Compelling Narratives Roadmap

## 1. Top 3 under-specified seams

1. **Crow’s Den content path/approval.** Item 2 says `supabase/migrations/...` “or approved seed path” (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:121-122`) but does not decide where production catalog JSON lives, who approves it, or how placeholders are prevented. The export was clearer: use existing JSON metadata shape and do not commit placeholder production content without approval (`prompt-exports/oracle-plan-2026-05-30-120320-narrative-roadmap-07-9353.md:652-654`).
2. **Metric heuristics.** Item 1 names useful raw metrics (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:85-99`) but leaves implementers to define “catalog anchor,” “distinct voice,” and “scene frame strength.” Keep the export’s guardrail that these are scorer fields, not product DTOs (`prompt-exports/oracle-plan-2026-05-30-120320-narrative-roadmap-07-9353.md:263-265`).
3. **Combat-share ceiling.** Item 6 requires a per-location/per-encounter ceiling (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:202-205`) but gives no baseline window, owner, or point at which it becomes enforceable.

## 2. Specificity balance

- **Useful framing dropped:** The export includes `60_shops_services` in the supported taxonomy (`prompt-exports/oracle-plan-2026-05-30-120320-narrative-roadmap-07-9353.md:127-130`, `304-307`); the plan’s content standard omits it (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:36-53`). Say whether this is intentional.
- **Possibly over-specified:** Exact section density ranges (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:36-53`) are helpful as authoring guidance, but should not become universal pass/fail thresholds before metrics are calibrated.
- **Operational detail dropped:** The export gave validation/fresh-tick command framing (`prompt-exports/oracle-plan-2026-05-30-120320-narrative-roadmap-07-9353.md:532-543`); the plan only keeps prose gates.

## 3. Contradictions or missing dependencies

- The narrative says measure first (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:27-34`), but Item 2 lists Item 1 only as “preferred” (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:128-131`). Decide whether catalog authoring can start before baselines.
- The plan says no open questions are blocking (`docs/plans/compelling-narratives-roadmap-2026-05-30.md:246-247`), but release gates still need owners/thresholds for persona signal, combat share, and transcript review.
- The export states no schema migration is required (`prompt-exports/oracle-plan-2026-05-30-120320-narrative-roadmap-07-9353.md:773-776`); the plan’s migration wording could invite unnecessary schema work.

## 4. Risk of over-planning

Trim the opening code-path inventory after the roadmap is accepted. Implementation mostly needs order, seams, file targets, and gates. Also consider merging or sequencing Items 3 and 5 later: both tune GM/runtime prompts, and splitting them now may encourage premature prompt churn before catalog baselines exist.

## 5. Questions that would change implementation order

1. Can Crow’s Den catalog writing run in parallel with metric instrumentation?
2. Who approves production catalog content, and what is the canonical seed/migration path?
3. Is `60_shops_services` intentionally excluded for Crow’s Den?
4. Who sets metric thresholds and per-location combat-share ceilings?
5. Are live/fresh-tick validations required for first rollout, or only harness/static transcript review?
