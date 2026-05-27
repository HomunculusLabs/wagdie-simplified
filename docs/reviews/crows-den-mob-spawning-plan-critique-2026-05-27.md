# Crow's Den Mob Spawning Plan Critique

## 1. Top 3 under-specified seams

1. **Promotion/routing timing inside the same tick.** The plan says a later eligible `auto` tick writes a trigger and “the same tick can then route” through gameplay (`docs/plans/crows-den-mob-spawning-2026-05-27.md:31`), and later expects the next auto tick to “promotes/enters gameplay” (`docs/plans/crows-den-mob-spawning-2026-05-27.md:227`). Implementers still have to guess the exact service control flow: mutate narrative state before the existing trigger read, re-read from repository, or pass the updated state in-memory.

2. **Catalog refresh/staleness semantics.** The plan says to refresh existing states whose catalog is missing/stale (`docs/plans/crows-den-mob-spawning-2026-05-27.md:76-78`) but does not define stale detection, equality/versioning, or which live fields are protected if catalog shape changes. The export explicitly framed existing-state repair as a risk and said runtime refresh “must update existing states, not only new states” (`prompt-exports/oracle-plan-2026-05-27-103558-crows-den-plan-68e27-8404.md:683-684`); the plan keeps that goal but not enough merge rules.

3. **Source beat selection edge cases.** The fallback order uses `lastCombatReadyBeatId`, `lastBeatId`, then latest completed beat (`docs/plans/crows-den-mob-spawning-2026-05-27.md:45-47`), while stamping is added only for future ready transitions (`docs/plans/crows-den-mob-spawning-2026-05-27.md:60-61`). For pre-existing ready states, implementers must decide whether `lastBeatId` after readiness is acceptable, whether scene-check/result beats qualify, and how to detect “already-consumed source triggers” (`docs/plans/crows-den-mob-spawning-2026-05-27.md:42`).

## 2. Specificity balance

- **Over-specified:** exact helper name/shape (`buildLocationSeededNarrativeMetadata`) and diagnostic field names (`lastCombatPromotionTriggerId`, etc.) are probably tactical choices an implementation agent can refine (`docs/plans/crows-den-mob-spawning-2026-05-27.md:68`, `52-56`). Keep required semantics, not exact API.
- **Useful framing dropped/softened:** the export notes package/migration metadata was trimmed and migrations may need inspection if schema/data delivery details matter (`prompt-exports/oracle-plan-2026-05-27-103558-crows-den-plan-68e27-8404.md:50`). The plan asserts “No schema change is required” and chooses migration/seed without saying to inspect current migration conventions (`docs/plans/crows-den-mob-spawning-2026-05-27.md:83`).

## 3. Contradictions or missing dependencies

- Item 2 depends on source beat fields from Item 3, but Item 2’s dependencies only mention Item 1 (`docs/plans/crows-den-mob-spawning-2026-05-27.md:156-167`). Implementation order fixes this, but the work-item dependency list is misleading.
- Item 7 depends on product-approved Crow’s Den text (`docs/plans/crows-den-mob-spawning-2026-05-27.md:255`), while Open Questions allow safe placeholders for dev validation (`docs/plans/crows-den-mob-spawning-2026-05-27.md:270-272`). Clarify whether placeholders are allowed in the migration/seed or only local/dev fixtures.

## 4. Risk of over-planning

Cut or simplify the exhaustive diagnostics/test matrices. Items 5-6 list many fields and scenarios (`docs/plans/crows-den-mob-spawning-2026-05-27.md:205-227`); keep only diagnostics needed to distinguish missing catalog, ready-no-trigger, pending trigger, consumed trigger, and active encounter. The rest can follow from implementation discoveries.

## 5. Questions that would change implementation order

1. Are dev placeholders acceptable in committed seed/migration content, or must catalog copy be approved before Item 7?
2. Must promotion and gameplay encounter creation happen in the same auto tick, or is writing a pending trigger sufficient for the following auto tick?
3. Should existing ready states without `lastCombatReadyBeatId` be eligible for promotion via fallback beats, or must they wait for a new ready transition after the coordinator stamping lands?
