# Location Room Narrative Reliability: Long-Term Plan

## Goal
Make location-room public narrative reliable by putting lifecycle truth in backend state, routing every tick through an explicit output policy, and validating all model-facing prose against shared public narrative contracts.

## Background
Recent room 11 review exposed these failure classes:

- Scheduled ticks kept advancing after public messages stopped; logs showed skip routing such as `insufficient_participants` after combat cleared `activeEncounterId`.
- Combat terminal state was not absorbing: the Rafter Crow-Wight was narrated dead/disabled, then later targeted again.
- Roll-tier facts and prose disagreed: failures could read like hits, grazes, or successes.
- Character actions repeated stale phrases and taunts.
- Public prose leaked internal/mechanical labels such as `Bell Bait`, `encounter site`, `DC`, `check`, and backend terminology.
- Scene-check successes sometimes lacked concrete payoff.

The core architectural principle is: **public narrative is an output of a room state machine, not a side effect of whichever route happened to run.**

Relevant repo seams:

- `lib/eliza/locationRooms/service/tickProcessor.ts` — primary tick routing and route lifecycle.
- `lib/eliza/locationRooms/service/scheduledWorker.ts` — scheduled active gameplay continuation path; must share lifecycle policy with tick processor.
- `lib/eliza/locationRooms/service/gameplayRouting.ts` — gameplay run status and terminal aftermath helpers.
- `lib/eliza/locationRooms/service/routeDiagnostics.ts` — current route decision logging; starting point for durable observability.
- `lib/eliza/locationRooms/gameplay/coordinator.ts` — combat orchestration, encounter terminalization, public message ordering.
- `lib/eliza/locationRooms/gameplay/rules.ts` — backend roll tiers, damage, target death, encounter status.
- `lib/eliza/locationRooms/gameplay/gameMaster/officialGenerator.ts` — combat GM outcome prompts/validators.
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts` — narrative GM and scene-check outcome prompts/validators.
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts` and `lib/eliza/locationRooms/officialTurnGenerator.ts` — character speech/action generation.
- `lib/eliza/locationRooms/generation/*` — shared generation diagnostics, JSON extraction, repair primitives.
- `services/elizaos/src/characters/*` — GM and character agent sheets.

## Approach

### Principle 1 — Backend owns truth
Roll tiers, damage, target status, terminal encounter state, flee/death/reward facts, and participant eligibility must be represented as typed backend facts before any model prose is accepted.

### Principle 2 — Lifecycle owns public output
Every tick should end as one of:

- `public_message_appended`
- `intentional_no_output`
- `blocked_waiting_for_participants`
- `terminal_run_closed`
- `failed_retry`

A scheduled tick should not silently advance indefinitely without either public output or an explicit durable non-output state.

### Principle 3 — Generators own style inside a fact contract
Models can choose language and tone, but they cannot contradict backend facts, resurrect terminal threats, leak private labels, or convert failures into hits.

### Principle 4 — Content improves quality after correctness
More GM book content and richer character sheets matter, but they should not be used to patch state-machine or fact-alignment failures.

## Phased Work Items

### Phase 1 — Lifecycle and public-output hardening

**Goal:** Stop silent tick advancement and terminal-combat drift while establishing the first shared public-output contract.

**Done when:**

- Ticks classify output outcome explicitly instead of only completing/skipping loosely.
- Post-terminal combat cannot strand the room in repeated silent skips.
- Terminal encounters are absorbing for fresh actions.
- GM-only aftermath can run even when character speech is unavailable, but character speech remains participant-gated.
- A shared public denylist/contract starts replacing route-local copies.
- Room 11-style replay/scenario coverage exists for terminal encounter → aftermath/no silent skip.

**Key files:**

- `lib/eliza/locationRooms/service/tickProcessor.ts`
- `lib/eliza/locationRooms/service/scheduledWorker.ts`
- `lib/eliza/locationRooms/service/gameplayRouting.ts`
- `lib/eliza/locationRooms/service/routeDiagnostics.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/generation/*`
- `tests/api/eliza/location-room-service.test.ts`
- `tests/lib/eliza/locationRooms/fixtures/*`

**Dependencies:** Current local routing/terminal/prose fixes should remain intact.

**Size:** Large.

### Phase 2 — Shared public narrative contract

**Goal:** Create a unified validation pipeline for narrative GM beats, scene-check outcomes, gameplay GM outcomes, combat character actions, and deterministic fallbacks.

**Done when:**

- All public generation routes validate through shared hard constraints for fact alignment, publicness, narrative motion, grounding, payoff/consequence, and voice hygiene.
- Route-specific adapters supply typed fact capsules.
- Repair diagnostics use shared failure categories.
- Fallbacks are fact-aware and never contradict backend state.

**Key files:**

- `lib/eliza/locationRooms/generation/publicNarrativeContract.ts` or equivalent new module
- `lib/eliza/locationRooms/gameplay/gameMaster/officialGenerator.ts`
- `lib/eliza/locationRooms/gameMaster/officialGenerator.ts`
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/sceneChecks/*`

**Dependencies:** Phase 1 output classification and terminal lifecycle facts.

**Size:** Large.

### Phase 3 — Narrative memory and content model

**Goal:** Promote compact structured memory and content cards so generation uses stable room facts instead of raw transcript vibes.

**Done when:**

- Room memory tracks public continuity, GM planning state, character phrase/action memory, combat terminal summaries, and spatial state.
- GM book content includes location affordance cards, monster public identity cards, tier payoff examples, forbidden labels, and aftermath templates.
- Character sheets expose public narrative projections without private wallet/mechanical leakage.

**Key files:**

- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/encounterEscalation.ts`
- `lib/content/campaign/locations/*`
- `services/elizaos/src/characters/*`

**Dependencies:** Phase 2 contract vocabulary.

**Size:** Large.

### Phase 4 — Observability, evals, and deployment gates

**Goal:** Make stalls, validator failures, repairs, fallbacks, and quality regressions visible before they reach production.

**Done when:**

- Route decisions and generation attempts are durable/queryable events, not just console logs.
- Stall detectors catch silent advancement, skip streaks, terminal mismatch, missing aftermath, and target resurrection.
- Room 11 replay fixtures and narrative evals run in CI/preview.
- Deployment gates include lifecycle tests, public narrative contract tests, eval thresholds, lint/build/typecheck, and preview smoke.

**Key files:**

- `lib/eliza/locationRooms/service/routeDiagnostics.ts`
- admin diagnostics routes/components adjacent to location rooms
- `scripts/location-room-narrative-eval.ts`
- `docs/operations/deployment.md`
- `package.json`

**Dependencies:** Phase 1/2 diagnostics schemas.

**Size:** Medium-large.

## Phase 1 Execution Plan

1. Add or extend a typed tick output classification/result in the service layer.
2. Route post-terminal/no-active-encounter gameplay-run ticks into terminal closure or aftermath eligibility instead of repeated silent skip.
3. Ensure `scheduledWorker.ts` and `tickProcessor.ts` share the same terminal/run interpretation.
4. Add a small shared public-output contract/denylist module and use it in at least the GM output validators touched by current work.
5. Add Room 11-style regression coverage:
   - terminal encounter clears `activeEncounterId`
   - next scheduled/run tick does not become unbounded `insufficient_participants`
   - no fresh action targets terminal/dead monster
   - public prose rejects observed internal terms
6. Run focused tests:
   - `bun run test -- --runTestsByPath tests/api/eliza/location-room-service.test.ts tests/lib/eliza/location-room-gameplay-coordinator.test.ts tests/lib/eliza/location-room-gameplay-generators.test.ts tests/lib/eliza/location-room-game-master-generator.test.ts --runInBand`

## Phase 3 Progress Notes — 2026-06-10

- Added additive structured-memory type scaffolding in `lib/eliza/locationRooms/narrativeTypes.ts` for public continuity, GM planning state, character phrase/action memory, combat terminal summaries, spatial state, and GM content-book cards.
- Added pure helper scaffolding in `lib/eliza/locationRooms/narrativeMemory.ts` for normalizing/projecting structured memory, recording character phrase/action memory, projecting terminal encounter summaries, and normalizing/building GM content books from raw cards or visible location catalog entries.
- Added focused tests in `tests/lib/eliza/location-room-narrative-memory.test.ts` without integrating helpers into generator prompts/contracts; Phase 2 can wire these projections into route-specific fact capsules later.
- Focused tests run: `bun run test -- --runTestsByPath tests/lib/eliza/location-room-narrative-types.test.ts tests/lib/eliza/location-room-narrative-memory.test.ts --runInBand`.

## Open Questions

- Should post-combat GM-only aftermath be allowed when there are zero eligible character speakers, or should the room enter a visible/admin `blocked_waiting_for_participants` state?
- Should public roll cards continue showing `DC`/`check` terminology, while GM prose blocks those terms? Current recommendation: yes, roll cards can be mechanical UI; prose should stay public-world language.
- Where should durable route/generation events persist: existing tick/message metadata, a new event table, or admin diagnostics-only storage?

## References

- ChatGPT Pro long-term strategy response provided June 10, 2026.
- Current local fix stream: routing/terminal combat handling, action repetition, GM prose validation.
