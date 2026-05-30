# Combat Narration Plan Critique

## 1. Top 3 under-specified seams

1. **Character action repair trigger.** The plan says `generateAction()` should repair non-JSON or validation-failed output once (`docs/plans/combat-narration-quality-2026-05-29.md:37-40`), but the existing seam named in the plan is `normalizeGameplayActionResponse()` (`actionGenerator.ts:217`), which currently converts some non-JSON into legal fallback. An implementer must guess whether to add a strict/repair mode, split parsing from fallback synthesis, or infer “semantic failure” from fallback metadata.
2. **GM quality validator boundary.** `validateGameplayOutcomeNarrationQuality()` is required to reject “obvious generic/passive narration” and require one anchor (`docs/plans/combat-narration-quality-2026-05-29.md:58-60`), but the acceptable false-positive/false-negative boundary is not defined. Implementers must guess whether named but still-generic prose passes, whether action-only prose passes without consequence, and which available facts should be canonical inputs.
3. **Persisting diagnostics on failed GM outcome.** The coordinator must store diagnostics and also throw/avoid appending `gm_outcome` after repair failure (`docs/plans/combat-narration-quality-2026-05-29.md:79-82`). The export usefully states the existing retry behavior: if GM outcome generation throws after action/roll-card append, the turn remains `resolved` and can reuse stored mechanics (`prompt-exports/oracle-plan-2026-05-29-114554-combat-narration-d6c-765f.md:242-246`). The plan does not specify where failed-generation diagnostics are persisted before/while preserving that retry state.

## 2. Specificity balance

- **Over-specified:** exact repair prompt ingredients for character actions (`docs/plans/...:38`) and exact diagnostic category names (`docs/plans/...:61`) may be better as examples, unless downstream consumers already require those exact strings.
- **Over-specified:** “Tests cover that prompt guidance remains present” (`docs/plans/...:103`) risks brittle prompt-string tests. Outcome/contract tests would leave tactical prompt wording to the implementation agent.
- **Dropped framing from export:** the export notes the GM prompt already has consequence-first guidance (`prompt-exports/...:220-224`). The plan reads more like adding new prompt policy than tightening an existing prompt plus adding acceptance/repair.
- **Useful framing retained but thinned:** the export’s “reuse current retry architecture” point (`prompt-exports/...:242-248`) is only implicit in the plan’s retryability bullet; this is central enough to make explicit in Item 3.

## 3. Contradictions or missing dependencies

- Item 2 says it can proceed independently except shared diagnostic vocabulary (`docs/plans/...:71`), but if Item 2 changes GM failure from fallback-return to throw, Item 3’s coordinator behavior is needed to avoid unsafe persistence/message outcomes. Treat them as coupled or implement Item 3’s failure path before enabling throws.
- Item 5 says admin diagnostics are optional if recent-turn metadata is unavailable (`docs/plans/...:119`), but the smoke-doc acceptance mentions repair failure being visible via safe status/diagnostics (`docs/plans/...:121`). Decide whether visibility means existing turn failure/last error or a new admin diagnostics projection.
- `Open Questions: None` (`docs/plans/...:150-151`) overstates certainty; several implementation-order questions below remain.

## 4. Risk of over-planning

- Item 5 could be reduced to focused tests plus one smoke-doc note. Optional admin diagnostics expansion should be cut unless existing metadata access is confirmed.
- Item 4 can likely be folded into Item 2 as prompt/acceptance guidance. Keeping it separate may create redundant prompt work and brittle tests.
- The plan should avoid hard-coding diagnostics taxonomy beyond safe categories unless consumers depend on exact values.

## 5. Questions that would change implementation order

1. Should `normalizeGameplayActionResponse()` gain a strict mode/split parser before action repair is implemented?
2. Can coordinator metadata be updated while preserving a `resolved` retryable turn after GM generation throws?
3. Do admin diagnostics already read recent gameplay turn metadata? If not, defer diagnostics UI/docs beyond safe failure status.
4. Should GM repair failure surface as a typed error carrying safe diagnostics, and should that type be defined before generator/coordinator changes?
