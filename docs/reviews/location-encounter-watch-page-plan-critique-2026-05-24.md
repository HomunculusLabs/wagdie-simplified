# Location Encounter Watch Page Plan — Bounded Critique

## 1. Top 3 under-specified seams

1. **Structured roll DTO/source seam** — The plan says to create `gameplayRolls`, convert “coordinator mechanical summaries,” and sanitize stored metadata (`docs/plans/location-encounter-watch-page-2026-05-24.md:52-77`), but it never states the public DTO shape, whether projection is from `mechanicalSummary`, `GameplayTurn.diceResults`, stored message metadata, or a combined adapter, nor how action/effect/retaliation/death fields should be normalized. Implementers will likely invent incompatible shapes.
2. **Participant stat source seam** — Item 4 asks for class/level/core stats/max HP/AC/speed from “the character source” (`docs/plans/location-encounter-watch-page-2026-05-24.md:81-91`) but does not name the repository/query boundary or call out DB-column verification. The export explicitly noted `locationRoomMembershipRepository.listEligibleParticipantsByLocation()`, `wagdie_characters`, and “Validate exact DB column names during implementation” (`prompt-exports/oracle-plan-2026-05-24-101027-watch-page-plan-cb94-1c67.md:354-366`, `:572-576`); that useful seam was mostly dropped.
3. **Freshness/activity data seam** — The plan requires identity/activity fields and a header with turn counts, last tick time, generated/fetched timestamps (`docs/plans/location-encounter-watch-page-2026-05-24.md:40-47`, `:114-121`), but it does not specify which existing fields supply last tick time/turn count or whether a repository helper is needed. The export named a possible `repository.ts` stats helper (`prompt-exports/oracle-plan-2026-05-24-101027-watch-page-plan-cb94-1c67.md:578-580`); the final plan only references service/types.

## 2. Specificity balance

- **Over-specified:** Item 7 names five new component files and helper boundaries (`docs/plans/location-encounter-watch-page-2026-05-24.md:127-141`). That is mostly tactical; the implementation agent can own exact file splits once the API seams are fixed.
- **Under-specified vs. export:** The export gave concrete hook defaults including watch page page size `50` and sidebar `30` (`prompt-exports/...md:407-409`), plus a typed hook shape (`:384-399`). The plan keeps “configurable page size” and “optional passive refresh” (`docs/plans/...md:99-102`) but loses defaults that affect UX and tests.
- **Useful dropped framing:** The export’s migration risk framing is clearer: removing embedded `Rolls:` should land only after structured UI exists in both watch page and sidebar (`prompt-exports/...md:601-604`). The plan says this, but split across Items 3 and 9, making ordering easier to miss.

## 3. Contradictions or missing dependencies

- Item 5 lists no hard dependency on Item 1 while its shared hook returns the extended DTO shape (`docs/plans/...md:96-108`). This is probably workable in parallel, but tests and types will churn unless Item 1 lands first.
- Item 6 depends only on Items 1 and 5, but its header requires freshness fields that may require service/repository work beyond Item 1 (`docs/plans/...md:114-123`).
- Item 8 depends on Item 7 for `StructuredRollPanel`, but also needs canonical identity from Item 1; add that dependency or state it is optional fallback behavior.

## 4. Risk of over-planning

Cut or simplify most exact component/file lists in Items 6–7 and keep them as “suggested boundaries.” Preserve the contract/privacy/migration decisions; those are the high-value plan content. Item 10 is broad but acceptable as a checklist—avoid making every listed test mandatory before the first vertical slice.

## 5. Questions that would change implementation order

1. Are public stat fields already available from `membership.ts`, or does this require repository/schema work? If schema work is needed, do Item 4 before UI.
2. Should activity metadata include true gameplay turn count/last tick time, or only latest public message sequence/time? True tick data may require repository work before Item 6.
3. Should the first vertical slice keep embedded `Rolls:` text until both watch and sidebar panels render structured rolls? If yes, defer Item 9 until after sidebar compatibility ships.
