# TTRPG Story/Combat Plan Critique

## 1. Top 3 under-specified seams

1. **Combat trigger consumption/idempotency.** The plan says a narrative beat can leave a trigger for “the next eligible tick” (`docs/plans/ttrpg-story-combat-experience-2026-05-24.md:46`) and later introduces `lastCombatTriggerBeatId` / `encounterTrigger` (`...:85`, `...:163-167`), but never defines how a trigger is marked consumed, retried, or protected from duplicate scheduled/manual ticks.
2. **Manual intent auth/API contract.** Item 5 chooses forbidden for owner `combat` intent and admin bypass (`...:130-134`), but leaves the concrete request schema, auth source for “admin,” response status/body, and hook behavior for invalid intent to implementation guesswork.
3. **Aftermath/run lifecycle boundary.** Routing says terminal encounter becomes aftermath narrative then returns to story/exploration (`...:47-48`), while Item 12 says runs stop when phase moves to aftermath/story (`...:242-245`). It is unclear which component sets aftermath, whether exactly one aftermath beat is guaranteed, and whether run completion happens before or after that beat.

## 2. Specificity balance

- **Over-specified:** `mechanics/system` domains and `roll_summary/system_event` kinds are reserved in the public model (`...:51-57`) without producers or V1 acceptance criteria. Keep if needed for compatibility; otherwise defer.
- **Over-specified/tactical:** worker counters “where practical without heavy new queries” (`...:246`) is implementation-detail guidance, not core story/combat behavior.
- **Dropped useful export framing:** the export explicitly called out uncertain DB migration/repository needs (`prompt-exports/oracle-plan-2026-05-24-104616-ttrpg-gameplay-plan-0dc0.md:84-86`). The plan commits to metadata-first/no migration (`docs/plans/...:287`) but does not add a discovery/checkpoint for whether current repository metadata writes are sufficient.
- **Dropped useful privacy detail:** the export listed “raw roll faces if not already allowed” among private fields (`prompt-exports/...:547-550`); the plan’s privacy line omits raw roll faces (`docs/plans/...:212`).

## 3. Contradictions or missing dependencies

- **Scheduled combat policy conflicts with open question.** Routing policy allows scheduled ticks to create combat after completed narrative request (`...:49`), but Open Questions asks whether scheduled ticks should ever create brand-new combat from readiness or only leave a pending owner/admin/manual trigger (`...:292`). Decide before Item 6/12.
- **Combat message metadata has no clear writer.** Item 4 covers narrative message metadata (`...:114-118`), and Item 9 projects stored metadata/fallbacks, but no work item explicitly requires new combat setup/action/outcome messages to persist `messageDomain`, `messageKind`, and `ttrpgPhase`.
- **Item 14 is circular.** It asks to update the same plan with decisions already stated in the plan; better as a short rollout note or pre-implementation checklist.

## 4. Risk of over-planning

The plan is probably heavier than needed for V1. Cut/simplify: reserved public kinds with no producers, worker counter improvements, and the separate documentation item unless it records decisions not already present. Consider merging Items 9–11 into one public projection/UI compatibility slice if implementation sequencing permits.

## 5. Questions that would change implementation order

1. Can scheduled ticks consume a narrative combat trigger, or must combat start only from owner/admin/manual action?
2. Is metadata-only persistence acceptable after checking repository write/read paths, or is a migration required before routing depends on phase/readiness?
3. Is admin combat intent API-only in V1, or does admin UI exposure need to ship with Item 5?
4. Should an aftermath beat be mandatory before gameplay run completion, or can terminal combat complete the run immediately and let later narrative resume?
