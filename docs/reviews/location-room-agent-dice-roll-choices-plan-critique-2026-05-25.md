# Location-Room Agent Dice-Roll Choices Plan Critique

## Top 3 under-specified seams

1. **Check config semantics are left to invention.** The plan says `rules.ts` should own labels, base DCs, and primary stat mappings (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:46`), but does not preserve the export’s concrete defaulting guidance (`sceneDc` vs fixed-check DC) or example stat/DC mapping (`prompt-exports/oracle-plan-2026-05-25-112857-agent-roll-plan-3fd2-9c66.md:307`). An implementer would have to invent the first balance pass for `explore`, `arcana`, `nature`, etc.

2. **Contextual-check normalization lacks an exact ownership/shape contract.** The plan says encounter setup can propose up to four contextual checks and that the backend normalizes them (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:48`, `:156-160`), but it does not specify whether `GameplayEncounterProposal`, `NormalizedGameplayEncounter.mechanics`, or fallback encounter generation are the canonical input/output types. It also leaves “no contextual checks or one safe `explore`-style contextual check” as a choice, which changes prompt/test expectations.

3. **Retry sequencing is directionally right but operationally incomplete.** The plan calls for `gameplay:roll_card` dedupe and preserving `publicMessageIds` (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:89`, `:250-252`, `:309`), but it drops the export’s explicit coordinator order to store the turn as `resolved` before appending action/roll-card messages and only complete it after GM narration (`prompt-exports/oracle-plan-2026-05-25-112857-agent-roll-plan-3fd2-9c66.md:455-461`). That lost detail affects crash recovery implementation order.

## Specificity balance

- **Over-specific:** The full fixed check taxonomy is probably too prescriptive for a plan (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:37-44`). The invariant should be “closed, server-owned list including user examples and existing action-compatible checks”; the final list can be owned by implementation after mapping stats/DCs.
- **Over-specific:** Requiring a new `roll_card` kind is a reasonable decision, but “authored by the game master” plus a sample content string risks tactical coupling to presentation (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:87`). The durable requirement is immediate public-safe structured roll metadata.
- **Dropped useful framing:** The export called out `GameplayModifierTarget`/check-type interactions (`prompt-exports/oracle-plan-2026-05-25-112857-agent-roll-plan-3fd2-9c66.md:542`) and made `performance.ts` conditional “if any check-specific counters are needed” (`:686-688`). The plan lists `performance.ts` as a key file without the conditional, which could send implementation into unnecessary performance-counter work.

## Contradictions or missing dependencies

- **Item 4 depends on Items 1–3, but Item 3 says mechanics read contextual options.** If contextual check storage/normalization is not available until Item 4, Item 3 can only add fixed/inferred mechanics or must be reordered/split.
- **Item 8 depends only on Item 7, but UI/presentation changes are named in Item 8.** If `locationRoomPresentation.ts` changes there, Item 10’s dependency on presentation work becomes blurry.
- **“No schema migration is expected” is correctly cautious (`docs/plans/location-room-agent-dice-roll-choices-2026-05-25.md:305`), but it is a hidden dependency:** implementation must verify the existing JSON columns cover encounter mechanics, persisted action, mechanical deltas, and message metadata before relying on the no-migration path.

## Risk of over-planning

- Item 11 is mostly a roll-up of tests already embedded in Items 2–10. Keep it as a verification checklist, not a separate implementation phase.
- The Background is useful for orientation but too long for an implementation agent that already has key files; keep only the architecture anchors and user decisions.
- The fixed check list should be trimmed or marked provisional until DC/stat mapping is specified.

## Questions that would change implementation order

1. Should contextual-check normalization be implemented before roll-planning changes, so Item 3 can consume the final stored shape?
2. Is the first version required to generate contextual checks during encounter setup, or can v1 ship fixed checks plus the `rollChoice`/`roll_card` path first?
3. Should crash recovery require persisting a `resolved` turn before public message append, as in the export, or can the existing coordinator persistence model be adapted without that state boundary?
