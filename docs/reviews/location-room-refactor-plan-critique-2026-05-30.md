# Location Room Refactor Plan Critique — 2026-05-30

## 1. Top 3 under-specified seams

1. **Service scenario harness contract** — Item 3 names inputs/options for `serviceHarness.ts` (`docs/plans/location-room-refactor-2026-05-30.md:89-97`) but not the assertion surface: what state snapshots/results the harness returns, whether scenarios drive `requestTickAndProcess()` only or may call lower-level methods, and how tick/message/gameplay/narrative side effects are inspected. Implementers will guess the harness API.
2. **Shared repair runner boundary** — Item 7 says the runner owns initial collection, parse/validate, repair prompting, diagnostics, and typed final errors (`docs/plans/location-room-refactor-2026-05-30.md:149-156`) while also saying it must not know narrative/gameplay schemas. It does not specify the callback/hook shape that keeps prompts, validators, error mapping, and Official session metadata domain-owned.
3. **Tick processor ownership/dependencies** — Item 13 gives `LocationRoomTickProcessor` nearly all current safe/unsafe processing responsibilities (`docs/plans/location-room-refactor-2026-05-30.md:242-250`) but does not define what remains in `LocationRoomService`, how constructor dependencies are grouped, or how manual/scheduled callers share clock/config/repository/coordinator dependencies without duplicating service state.

## 2. Specificity balance

- **Dropped useful export specificity:** the follow-up export explicitly preserved `extractGameMasterJsonObject()` compatibility (`prompt-exports/oracle-plan-2026-05-30-144751-location-room-refact-4a9b.md:139-140`); the plan weakens that to generic “compatibility exports” (`docs/plans/location-room-refactor-2026-05-30.md:123-125`). Keep the named symbol because it is a concrete migration guard.
- **Dropped routing semantics:** the export’s Item 4 distinguishes `story` intent from `auto` combat promotion (`prompt-exports/oracle-plan-2026-05-30-144751-location-room-refact-4a9b.md:109-111`); the plan collapses these into broader coverage (`docs/plans/location-room-refactor-2026-05-30.md:107-110`). That framing is useful and should stay.
- **Over-specified tactical module names:** Items 8–9 list many target modules (`docs/plans/location-room-refactor-2026-05-30.md:170-176`, `186-191`). Those should remain examples, not required architecture; the implementation agent should own exact file granularity after seeing coupling.

## 3. Contradictions or missing dependencies

- Item 11 and Item 12 both include room lookup/ensure-style responsibilities (`docs/plans/location-room-refactor-2026-05-30.md:217`, `232`). The plan depends on Item 10 identity/config extraction but does not say whether room ensure/canonical lookup is shared or intentionally duplicated across reader/manual tick service.
- Item 7’s “runner collects initial text” may pull transport concerns into shared code, while the same item says Official session metadata remains domain-specific (`docs/plans/location-room-refactor-2026-05-30.md:154-157`). This needs a boundary decision before implementation.
- Item 1 says the implementation task records baseline commands (`docs/plans/location-room-refactor-2026-05-30.md:63-66`), while the export said the plan itself should record them (`prompt-exports/oracle-plan-2026-05-30-144751-location-room-refact-4a9b.md:17-24`). Decide where the durable checklist lives.

## 4. Risk of over-planning

- Sixteen items is reasonable for sequencing, but the middle could become ceremony: Items 5–7 may be one incremental “shared generation contract” phase with sub-steps rather than three separate gates if tests stay green.
- Item 10 may be too small as a standalone checkpoint; errors/identity/config guards could be extracted opportunistically with the first service collaborator unless they block clean diffs.
- Item 16 should avoid updating this plan with post-hoc implementation notes unless that is the team convention; a short refactor note or module README may be cleaner.

## 5. Questions that would change implementation order

1. Should service scenario harness coverage be required before **any** generation-module movement, or only before `LocationRoomService` extraction?
2. Is `LocationRoomTickProcessor` intended to be constructor-injected as a collaborator, or privately composed inside `LocationRoomService` until the facade is stable?
3. Should the shared repair runner own transport collection, or only operate on provided text plus callbacks?
