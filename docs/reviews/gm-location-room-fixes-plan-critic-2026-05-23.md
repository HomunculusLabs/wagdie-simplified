# Critic Review: GM Location Room Fixes Plan

Source plan: `docs/plans/gm-location-room-fixes-2026-05-23.md`  
Compared with export: `prompt-exports/oracle-plan-2026-05-23-155915-room-fix-plan-550213-d759.md`

## 1. Top 3 under-specified seams

1. **Manual immediate-processing tick selection/claim semantics.** The plan names `findActiveTickByRoomId` / `claimTickForImmediateProcessing` and says dedupe should fetch “the room’s active tick” (`docs/plans/gm-location-room-fixes-2026-05-23.md:83-86`), but does not define ordering or eligibility among `pending`, retryable `failed`, stale `processing`, not-due manual ticks, or multiple active rows. Implementers must infer whether to mirror `claimDueTicks` exactly or create a looser manual-only claim path.
2. **Duplicate-location migration reference scope.** The plan requires deactivating/hiding `crows_den`, moving `wagdie_characters.location_id`, and failing on non-empty duplicate room state (`docs/plans/gm-location-room-fixes-2026-05-23.md:150-152`), then separately says to inspect live references (`:163`). It does not list which FK-like text columns/tables beyond characters and room state must be checked before the migration is safe.
3. **Dev narrative enablement boundary.** “Docker Compose/dev environment passes dev defaults” (`docs/plans/gm-location-room-fixes-2026-05-23.md:94`) is ambiguous: does this include `.env.local`, non-Compose `bun run dev`, Storybook/tests, or only Compose? This matters because the plan also preserves code defaults and expects missing GM config to surface as `503` (`:209`).

## 2. Specificity balance

- **Over-specified:** Item 2 prescribes method names, result unions, and route status behavior (`docs/plans/...:81-86`). The export only required bounded, room-scoped, actionable feedback; the implementation agent should own exact DTO names/status taxonomy unless tests or UI already require them.
- **Over-specified:** Item 4 mandates a new `/admin/location-rooms` UI defaulting to `11` (`docs/plans/...:113`). The export explicitly noted no existing diagnostics UI was found and said to choose API-only first unless a visible page is mandated (`prompt-exports/...:106-109`).
- **Dropped useful framing:** The export suggested cron cadence guidance, including `*/15 * * * *` unless deployment needs slower (`prompt-exports/...:304-307`); the plan only says to document cadence, leaving the scheduler frequency undecided.

## 3. Contradictions or missing dependencies

- `Open Questions` says none are blocking (`docs/plans/...:211-212`), but the migration depends on live-reference inspection before destructive cleanup (`:163`). That inspection can change implementation order or convert the migration into a manual data-repair task.
- Diagnostics must flag `crows_den` as non-canonical (`:154`), but canonicalization is ordered after diagnostics UI/API. The plan should clarify whether diagnostics must work both before and after the migration, or whether migration precedes duplicate diagnostics.
- Item 4 depends on repository diagnostics from Item 2, but Item 2’s repository additions are framed around immediate processing only. It is unclear which diagnostic query helpers are part of Item 2 vs. Item 4.

## 4. Risk of over-planning

- The diagnostics section is the largest expansion. Cut/simplify to API-first with minimal fields needed to explain the original failure: canonical location, participants, config/GM readiness, active tick, latest public message, and next action. UI and detailed narrative/gameplay panels can follow.
- Item 6 mostly repeats per-item test expectations plus the smoke checklist. Keep the smoke checklist and only list cross-cutting tests not already attached to Items 1–5.
- Remove exact implementation-shape bullets for manual processing unless they are meant as hard requirements.

## 5. Questions whose answers change implementation order

1. Is a visible admin page required now, or is API-first acceptable? If API-first, do it after core processing/cron and defer UI.
2. Does live data contain `crows_den` references or non-empty duplicate room state? If yes, migration/manual cleanup may need to precede diagnostics or be split.
3. Should manual POST wait for full GM/character generation, or only claim/start one tick and rely on worker recovery? Timeout tolerance changes whether Item 2 should precede Item 1.
4. What cron cadence is acceptable for Vercel/deployment limits? That affects whether manual immediate processing is essential for operator feedback.
