# Narrative Encounter Escalation Plan — Bounded Critique

## 1. Top 3 under-specified seams

1. **Escalation persistence/idempotency contract** — Item 4 requires retries/idempotent reprocessing to “reuse stored outcome/escalation safely” (`docs/plans/narrative-encounter-escalation-2026-05-26.md:176`), but does not define the identity key, merge precedence, or whether `lastSceneCheckEscalation` is source-of-truth vs diagnostic (`docs/plans/narrative-encounter-escalation-2026-05-26.md:98`). Implementers must guess how to avoid re-promoting an old failed check.
2. **Catalog seed scoring and candidate source** — The plan says normalize catalog from two metadata locations and score `80_encounters` before `30_monsters` (`docs/plans/narrative-encounter-escalation-2026-05-26.md:74-76`), but omits scoring inputs, tie-breakers, reveal-condition handling, public/private safety filtering, and how GM-provided `catalogEntryIds` interact with backend-selected entries.
3. **GM output raw-vs-normalized boundary** — The plan says `GameMasterSceneCheckOutcomeOutput` should include “normalized escalation” (`docs/plans/narrative-encounter-escalation-2026-05-26.md:157`) while Item 2 separately owns normalization. It should specify whether the parser accepts raw untrusted JSON and the helper produces normalized state, or whether the generator type itself is already normalized.

## 2. Specificity balance

- **Dropped useful framing:** The export explicitly preserved scene-check/non-combat separation and layered roll inputs (`prompt-exports/oracle-plan-2026-05-26-180029-encounter-escalation-286d.md:17`). The final plan preserves combat routing, but should restate this scene-check constraint so escalation work does not accidentally rewrite roll proposal/adjudication.
- **Dropped useful framing:** The export says quality gates should prefer bounded metadata/scorer/harness additions and avoid production-heavy transcript analysis (`prompt-exports/oracle-plan-2026-05-26-180029-encounter-escalation-286d.md:48`, `:501`). Item 8 implies this, but does not carry the constraint strongly.
- **Over-specific tactical choices:** Exact diagnostic field names (`lastEscalationSceneCheckId`, `lastEncounterSeedSource`, etc.) and hint counts (“up to two” encounters, “three” monsters) (`docs/plans/narrative-encounter-escalation-2026-05-26.md:78`, `:98`) are implementation details unless downstream consumers require them.
- **Dropped migration/risk framing:** The export’s risks/migration section (`prompt-exports/oracle-plan-2026-05-26-180029-encounter-escalation-286d.md:557`) noted additive JSON/no DB migration/rollback behavior. The final plan assumes this but does not tell implementers to preserve old metadata reads.

## 3. Contradictions or missing dependencies

- Item 8 only lists eval scripts, but “reports public TTRPG phase, combat readiness, threat level, and gameplay status from the room response” (`docs/plans/narrative-encounter-escalation-2026-05-26.md:242`) may require service/API/type exposure if those fields are not already public. Add an explicit verify-first dependency or key file.
- Item 6 depends only on Items 1–2, but meaningful gameplay preference tests require an enriched seed to be persisted and then consumed after a `start_combat` trigger, so its validation depends on Items 4–5 even if prompt formatting can start earlier.
- “Open Questions: None blocking” (`docs/plans/narrative-encounter-escalation-2026-05-26.md:254`) conflicts with choices that affect order: idempotency source-of-truth, catalog reveal filtering, and whether failed hostile checks may ever be backend-promoted beyond `danger` to `combat_ready`.

## 4. Risk of over-planning

- Cut or demote Item 8 to an exit checklist unless eval output is required for merge; deterministic harness coverage in Item 7 is the core safety proof.
- Keep the new helper module, but simplify exact function/interface recommendations from the export (`prompt-exports/oracle-plan-2026-05-26-180029-encounter-escalation-286d.md:185`) into responsibilities; the implementation agent can choose function boundaries.
- Trim exact hint-count and diagnostic-name prescriptions unless they are acceptance criteria; they create churn without changing the escalation contract.

## 5. Questions that would change implementation order

1. Is stored escalation metadata authoritative for retry/idempotency, or can it be recomputed from the persisted scene-check outcome each time?
2. Should catalog reveal conditions/private GM notes be enforced during seed construction before any prompt/response exposure?
3. Can a single hostile `failure` be backend-promoted to `combat_ready`, or only GM-declared `combat_ready` can do that?
4. Are public TTRPG readiness fields already available in room responses, or must Item 8 add API/type exposure first?
5. Should gameplay seed formatting wait until after coordinator persistence is working, so tests exercise the real handoff path?
