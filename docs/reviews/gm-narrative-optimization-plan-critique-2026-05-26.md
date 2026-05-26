# GM Narrative Optimization Plan — Bounded Critique

## 1. Top 3 under-specified seams

1. **GM beat cadence thresholds and counters** — The plan says “several character/scene-check messages” should force a beat and diagnostics/result “can indicate” append status (`docs/plans/gm-narrative-optimization-2026-05-26.md:81-85`), but does not define which message kinds count, minimum gap, prior-beat requirement, or diagnostic field. The export had concrete defaults/rules (`publicGmBeatMaxAgentMessages`, `publicGmBeatMaxSceneChecks`, `publicGmBeatMinMessagesBetween`; `prompt-exports/oracle-plan-2026-05-26-162552-gm-optimization-plan-ffac.md:223-233`).
2. **Spatial memory shape/merge contract** — Item 2 names current area, landmarks, routes, blocked routes, and unresolved questions (`docs/plans/gm-narrative-optimization-2026-05-26.md:94-105`) but omits schema, bounds, normalization, merge precedence, and safety filtering. The export included a concrete `LocationRoomAdventureSpatialContext` and field limits (`prompt-exports/oracle-plan-2026-05-26-162552-gm-optimization-plan-ffac.md:291-308`). Without this, implementers may create incompatible adventure metadata.
3. **GNQS/spatial metric definitions** — Item 5 asks for beat count, max gap, and spatial continuity signal count (`docs/plans/gm-narrative-optimization-2026-05-26.md:149-155`), while Item 6 suggests gates (`docs/plans/gm-narrative-optimization-2026-05-26.md:168-170`), but neither defines signal terms, transcript-size thresholds, or how scores fold into existing GNQS. The export supplied warning thresholds and an explicit “fold into existing submetrics” constraint (`prompt-exports/oracle-plan-2026-05-26-162552-gm-optimization-plan-ffac.md:522-535`).

## 2. Specificity balance

- **Dropped useful framing from the export:** production-overhead discipline (“prefer scorer/evaluator/harness instrumentation; bounded metadata-only production hook”) is absent from the final plan (`prompt-exports/oracle-plan-2026-05-26-162552-gm-optimization-plan-ffac.md:60`). Add that constraint back if implementation might be tempted to add runtime analysis.
- **Dropped useful caveat:** the export notes Crow’s Den can be scored statically when `tick_enabled=false`, but fresh ticks need auth/config (`prompt-exports/oracle-plan-2026-05-26-162552-gm-optimization-plan-ffac.md:696-698`). The plan mentions environment-vs-quality failure (`docs/plans/gm-narrative-optimization-2026-05-26.md:200-203`) but not the concrete ordering implication.
- **Over-specific tactical choice:** Item 3 mandates a new `recentPatterns.ts` helper (`docs/plans/gm-narrative-optimization-2026-05-26.md:121`). Sharing recent-pattern logic is the right requirement; the exact file/module boundary could be left to the implementation agent unless repo conventions require it.
- **Potentially premature gates:** Item 6’s targets (GNQS ≥85, per-scenario ≥75, unique check types ≥5) may be useful, but should be labeled calibration targets until Item 5 confirms metric comparability.

## 3. Contradictions or missing dependencies

- Item 1 wants GM beats to “anchor current options” (`docs/plans/gm-narrative-optimization-2026-05-26.md:79`), but Item 2 supplies the spatial model afterward. If spatial anchoring is mandatory for first cadence tests, Item 2 should precede Item 1 or Item 1 should rely only on transcript-derived anchors.
- Item 4 says Item 2 is only needed “if fallback outcomes should update spatial context” (`docs/plans/gm-narrative-optimization-2026-05-26.md:142`), but the overall goal includes spatial continuity for outcomes. Make that dependency explicit or keep fallback spatial updates out of Item 4.
- `Open Questions: None blocking` (`docs/plans/gm-narrative-optimization-2026-05-26.md:253-254`) conflicts with choices that materially affect order: cadence thresholds, scorer blocking vs warning-only, and whether character prompts receive spatial context.

## 4. Risk of over-planning

- Consider merging Items 5 and 6 into one “measurement + harness gates” workstream; they are tightly coupled and separate sequencing may create churn.
- Item 8 is mostly validation bookkeeping. Keep it as an exit checklist rather than an implementation work item unless docs/scoreboard updates are mandatory deliverables.
- The background is useful, but the implementer-facing plan could trim long seam inventories once key file lists and constraints are retained.

## 5. Questions that would change implementation order

1. Should spatial memory be implemented before recurring cadence so cadence beats can be tested against real spatial anchors?
2. Are new GNQS thresholds hard CI blockers immediately, or warnings until calibrated on deterministic/live samples?
3. Which exact message kinds count toward GM beat cadence gaps?
4. Should spatial context be passed to character prompts, or remain GM/outcome-only for this pass?
5. Is fresh Crow’s Den ticking required before merge, or is static transcript scoring acceptable when auth/config is unavailable?
