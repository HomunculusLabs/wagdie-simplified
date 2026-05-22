# Bounded Design Critique: Game Master Narrative Agent Plan

## 1. Top 3 under-specified seams

1. **Retry/idempotency boundary for GM narration is asserted but not designed.** The plan requires no duplicate GM message on retry (`docs/plans/game-master-narrative-agent-2026-05-22.md:49`, `:172-181`), but current `appendMessage()` only does a pre-insert lookup by `tick_id + visibility + author_kind` (`lib/eliza/locationRooms/repository.ts:389-402`). The existing migration has a non-unique tick index, not a unique constraint (`supabase/migrations/20260511000000_create_eliza_location_rooms.sql:129-130`). Implementer must guess whether to add a DB unique index, transaction, upsert, or accept race risk.
2. **GM identity/resolution path is unresolved but Item 4 assumes it.** Item 4 says the generator starts the configured GM agent and creates/deletes a short-lived session (`docs/plans/game-master-narrative-agent-2026-05-22.md:125-130`), while the open question asks whether this is a new official service agent, existing character-like record, or admin-managed sheet (`:280`). That answer changes schema/config, resolver reuse, seed/admin setup, and test fixtures.
3. **Eligibility fallback for rooms with fewer than two participants is unclear.** The approach gates narrative mode on “at least two eligible participants” (`docs/plans/game-master-narrative-agent-2026-05-22.md:30`), but Item 6 only says narrative-disabled ticks append one character and narrative-enabled success appends GM + agent (`:171-175`). It does not say whether narrative-enabled 1-participant rooms fall back to the old single-speaker turn, skip, fail, or enqueue later.

## 2. Specificity balance

- **Over-specified tactical choice:** Item 4 hard-codes “short-lived official session” lifecycle (`docs/plans/...:126`). That mirrors the export’s detailed design, but the plan also leaves GM identity unresolved; the implementation agent should own exact transport/session mechanics once identity is answered.
- **Potentially over-specified product schema:** `tension level` and `featured token ids` are named as required generated fields (`docs/plans/...:128-129`). The export had a fuller schema (`prompt-exports/oracle-plan-2026-05-22-074514-gm-narrative-plan-6e-fac2.md:316-349`), but the plan does not justify which fields are MVP-critical versus future analytics/admin affordances.
- **Dropped useful framing:** The export explicitly says the public room API can remain response-compatible and needs no new public state fields in V1 (`prompt-exports/...:684-691`). The plan implies this in Item 1, but it should be restated near UI/API work to prevent accidental public exposure of narrative state.

## 3. Contradictions or missing dependencies

- **Admin controls contradiction:** Item 8 says admin output is read-only except optional pause/resume (`docs/plans/...:218-219`), but Open Questions asks whether pause/resume should ship or remain read-only (`:281`). Treat pause/resume as undecided, not part of Done When.
- **Missing dependency:** Item 6’s retry guarantee depends on repository/schema idempotency, not just coordinator logic. The current plan lists `repository.ts` only “if append idempotency needs adjustment” (`docs/plans/...:181`); based on the spot-check, it does.
- **Missing dependency/order gate:** Item 4 should depend on answering the GM identity question, not only Items 2–3.

## 4. Risk of over-planning

- **Cut/simplify Item 9 from V1 plan body.** It is already deferred, but still carries size, key files, and dependencies (`docs/plans/...:227-253`). Keep it as a one-paragraph later-phase note.
- **Split Item 8.** Read-only admin inspection is useful; pause/resume controls are a separate control-plane feature and should be cut unless the open question is answered before implementation.
- **Trim generated beat fields.** For MVP, public narration, speaker instruction, and continuity summary may be enough; objective/open threads/tension/featured ids can be optional unless admin inspection or prompting truly needs them first.

## 5. Questions whose answers would change implementation order

1. What is the GM agent identity/resolution model? Answer before Item 4.
2. Should retry idempotency be enforced in the database, repository transaction/upsert, or coordinator state machine? Answer before Item 1/6.
3. For narrative-enabled rooms with fewer than two eligible participants, should ticks fall back, skip, or fail? Answer before Item 6 tests.
4. Is Item 8 strictly read-only for V1, or does pause/resume ship? Answer before admin API design.
