# Automated 100-Turn Gameplay Plan Critique

## 1. Top 3 under-specified seams

1. **Run stop semantics are named but not operationalized.** The plan says victory continues, but hard stops include “defeat/fled/abandoned with no playable continuation” (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:23-24`). It does not define which existing tick/coordinator outcomes map to each machine reason, how to detect “no playable continuation,” or whether an abandoned encounter can start a fresh encounter under the same run.
2. **Progress counting risks tick/turn ambiguity.** The design says progress should be durable, but the required helpers are “count completed run ticks” and “find an open room tick” (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:39-41`). An implementer must guess whether `completed_turns` is counted from completed room ticks, completed gameplay turns joined by `tickId`, or denormalized run state. This matters for idempotent reprocessing and for completed ticks that do not produce a new completed gameplay turn.
3. **Worker budget/fairness is underspecified.** The loop enqueues continuation ticks that “fit within the remaining worker budget” (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:56-61`) and also adds `maxActiveRunsPerWorker` (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:45-46`), but does not define whether enqueues consume processing budget, how active runs are ordered, or how to prevent one long run from starving normal scheduled room ticks.

## 2. Specificity balance

- **Over-specified:** Item 1’s table shape and Item 3’s exact env names are useful, but they may be too tactical for the implementation agent; column/index/env naming can be implementation-owned if the behavior is locked.
- **Dropped from export:** The original export had explicit lifecycle subsections for failed, dead, skipped, and completed ticks (`prompt-exports/oracle-plan-2026-05-24-045453-100-turn-gameplay-2c-abe5.md:701-727`). The plan compresses this to “hard terminal, skipped, or dead states stop/fail” (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:173-177`), losing useful implementation framing.
- **Dropped from export:** Migration/deploy ordering risk was explicit: selecting `gameplay_run_id` before migration will fail (`prompt-exports/oracle-plan-2026-05-24-045453-100-turn-gameplay-2c-abe5.md:853-856`). The plan does not carry this dependency into the schema work item.

## 3. Contradictions or missing dependencies

- Item 7 depends on Items 2 and 6, but admin inspection can be implemented after schema/repository support without the worker loop; making it depend on Item 6 unnecessarily delays observability.
- Item 5 depends on Items 2–3, but if run context is persisted in Item 1 and typed in Item 2, Item 3 is only needed for config max-round behavior, not for loading/passing run context.
- The plan says ordinary victory creates the next encounter via existing coordinator behavior, but does not verify that current coordinator behavior actually creates a new encounter after victory without additional state reset.

## 4. Risk of over-planning

Cut or simplify the long References list and detailed table-field inventory. Keep only behavioral invariants, schema requirements, and ordering constraints. The implementer needs less exhaustive background and more precise definitions for stop reasons, counting source, and worker fairness.

## 5. Questions that would change implementation order

1. Must admin progress visibility ship before the worker loop for safe rollout/observability?
2. Is the target exactly 100 completed gameplay turns, or “up to 100 unless any encounter terminal state occurs”? The current open question (`docs/plans/automated-100-turn-gameplay-2026-05-24.md:233-235`) can change Items 5–6.
3. Should a completed ordinary victory reset/start a new encounter automatically within the same run, or should that require explicit product approval first?
4. Is `maxActiveRunsPerWorker` a scan limit, enqueue limit, or processing fairness cap?
