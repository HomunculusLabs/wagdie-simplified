# Investigation: GM Story Immersion and Player Agency

## Summary
GM output feels shallow because the narrative loop preserves continuity as summary/objective/open threads, but does not persist a durable adventure model: choices, stakes, consequences, discoveries, clocks, or declared character intent. The safest fix is an additive `metadata.adventure` layer plus prompt/schema changes that force every non-aftermath GM beat or scene-check outcome to carry one meaningful piece of agency, pressure, or consequence forward.

## Symptoms
- GM narrative can feel more like short scene description than immersive adventure progression.
- Failed rolls/checks should produce stronger consequences and fictional complications.
- The adventure needs a deeper plot arc, not isolated beats.
- Characters need clearer room to decide what to do rather than only react.
- Decisions should persist and affect later GM beats.

## Background / Prior Research
No external research required yet. This appears to be an in-repo prompt/state/flow design issue involving location-room GM generation, scene checks, narrative state persistence, and character turn prompts.

## Investigator Findings
<!-- Pair investigator appends structured findings here. -->

### 2026-05-25 - Location-room GM immersion flow trace

**Scope:** Traced the read-only flow across `gameMasterGenerator`, `narrativeCoordinator`, `narrativeTypes` / `narrativeRepository`, `officialTurnGenerator`, and `sceneChecks` to verify why location-room GM output still feels shallow after the recent progression/scene-check hardening.

#### Finding 1 - GM beat schema is structurally too shallow for durable agency/stakes/consequences

- **Hypothesis verdict:** Confirmed.
- **Evidence:** `GameMasterBeatOutput` persists only `publicNarration`, `speakerInstruction`, `stateAfter`, coarse TTRPG fields, optional combat `encounterSeed`, optional `sceneCheckRequest`, and metadata; there is no first-class `choices`, `stakes`, `consequences`, `decision`, or pressure/clock field (`lib/eliza/locationRooms/gameMasterGenerator.ts:66-95`). The prompt contract likewise asks for `stateSummary`, `currentObjective`, `openThreads`, `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, `encounterSeed`, and `sceneCheckRequest`, but no structured choice/stakes/consequence object (`lib/eliza/locationRooms/gameMasterGenerator.ts:750-802`).
- **Nuance:** The prompt asks the model to “advance the scene with a decision, clue, complication, changed threat/readiness, or explicit consequence,” but that requirement is prose-only and can collapse into a generic summary/open-thread update (`lib/eliza/locationRooms/gameMasterGenerator.ts:787-802`). `encounterSeed.stakes` exists, but only for combat handoff seed text, not general scene stakes or durable player choices (`lib/eliza/locationRooms/types.ts:41-45`, `lib/eliza/locationRooms/narrativeTypes.ts:239-251`).
- **Eliminated alternative:** This is not primarily a database inability to store JSON. Both narrative state and beats have `metadata JSONB`, and beats store `state_before/state_after` JSONB (`supabase/migrations/20260522000000_add_location_room_narrative.sql:13-60`). The current contract simply does not ask for richer structured data.

#### Finding 2 - Scene-check results persist a final snapshot, but not enough future-facing consequence state

- **Hypothesis verdict:** Confirmed with nuance.
- **Evidence:** Scene-check metadata can store request/proposal/adjudication/resolution/publicRolls/messageIds/characterAction/gmOutcome on the individual beat (`lib/eliza/locationRooms/narrativeTypes.ts:120-130`, `lib/eliza/locationRooms/narrativeTypes.ts:273-342`). The coordinator patches those beat-level details as the scene check runs (`lib/eliza/locationRooms/narrativeCoordinator.ts:577-647`, `lib/eliza/locationRooms/narrativeCoordinator.ts:704-755`).
- **Future-state limitation:** The durable room-level update after a scene check keeps only `outcome.stateAfter.stateSummary`, `outcome.stateAfter.currentObjective`, `outcome.stateAfter.openThreads`, plus metadata summaries `lastSceneCheckId` and `lastSceneCheckOutcome` (`lib/eliza/locationRooms/narrativeCoordinator.ts:756-781`). The next GM prompt only renders continuity summary, objective, open threads, TTRPG phase/readiness/threat/action, and last encounter seed; it does not render a scene-check/consequence ledger or `lastSceneCheckOutcome` (`lib/eliza/locationRooms/gameMasterGenerator.ts:807-823`).
- **Fallback weakness:** If scene-check outcome generation fails, fallback narration says the result becomes “the next clear pressure,” but the persisted objective/openThreads mostly preserve the prior state unless it was empty (`lib/eliza/locationRooms/gameMasterGenerator.ts:963-1003`; coordinator fallback similarly at `lib/eliza/locationRooms/narrativeCoordinator.ts:303-331`).
- **Eliminated alternative:** Roll computation/adjudication is not the missing piece. `sceneChecks/rules.ts` normalizes/adjudicates requests and proposals and resolves a roll (`lib/eliza/locationRooms/sceneChecks/rules.ts:94-304`); the immersion gap is that the consequence is not preserved as structured future pressure.

#### Finding 3 - Character turns are intentionally short reactions unless scene-check context exists

- **Hypothesis verdict:** Confirmed.
- **Evidence:** The default character prompt says to “Write exactly one short in-world utterance” and “Keep it under two sentences,” while `normalizeLocationRoomGeneratedContent` caps output at 500 characters (`lib/eliza/locationRooms/officialTurnGenerator.ts:19`, `lib/eliza/locationRooms/officialTurnGenerator.ts:142-179`). The narrative coordinator passes only `stateSummary`, `currentObjective`, `openThreads`, `speakerInstruction`, optional `publicNarration`, and optional scene-check context to the character turn (`lib/eliza/locationRooms/narrativeCoordinator.ts:248-266`).
- **Scene-check exception:** When GM supplies `sceneCheckRequest`, character prompting gains an “Optional scene-check context” block and switches to JSON with `publicSpeech` plus optional `sceneCheckProposal` (`lib/eliza/locationRooms/officialTurnGenerator.ts:79-111`, `lib/eliza/locationRooms/officialTurnGenerator.ts:160-166`). Without that context, the parser never looks for a proposal and treats the response as plain speech (`lib/eliza/locationRooms/officialTurnGenerator.ts:181-226`).
- **Eliminated alternative:** This is not mainly an Eliza transport/session issue. The generator intentionally creates a short-lived session and sends the constrained prompt; the shallow character output follows from the prompt/normalizer contract (`lib/eliza/locationRooms/officialTurnGenerator.ts:248-304`).

#### Finding 4 - Progression context tracks anti-flatness, not longer-term plot pressure

- **Hypothesis verdict:** Confirmed.
- **Evidence:** `GameMasterBeatProgressionContext` contains only public narration requirements, a repeated-flat-opening flag/reason, tick/message counts, and public GM/agent message counts (`lib/eliza/locationRooms/gameMasterGenerator.ts:132-144`). It is built from normalized TTRPG metadata plus room tick/message counts; `requireEscalationBeyondOpening` only checks whether state is still flat after `tickCount >= 2` or `messageCount >= 3` (`lib/eliza/locationRooms/gameMasterGenerator.ts:295-324`). Validation then rejects missing objective/open threads and flat repeated state, and enforces coarse threat/readiness rules (`lib/eliza/locationRooms/gameMasterGenerator.ts:327-394`).
- **Missing plot model:** There is no tracked adventure arc, countdown/clock, antagonist plan, location danger, unresolved consequence ledger, pending decision, or stakes countdown. Durable narrative state is limited to `stateSummary`, `currentObjective`, `openThreads`, and generic metadata (`lib/eliza/locationRooms/narrativeTypes.ts:24-40`; `supabase/migrations/20260522000000_add_location_room_narrative.sql:13-23`).
- **Eliminated alternative:** Recent hardening did solve some earlier flatness. The contract now requires first/no-prior GM narration and rejects repeated `story`/`none`/`0` flatness (`lib/eliza/locationRooms/gameMasterGenerator.ts:338-357`). But that is a guardrail, not a plot-pressure system.

#### Root cause

The location-room GM now has enough state to preserve continuity and avoid the worst “no GM / totally flat opening” failures, but it does not have a durable adventure model. The loop stores a summary/objective/open-thread snapshot and coarse phase/readiness/threat metadata; character turns are constrained to short reactions; and scene-check consequences are either prose folded into the next summary or beat-local metadata. As a result, future beats can remain immersive-looking but shallow because the system cannot reliably ask: what choice was made, what stake changed, what consequence is pending, what pressure is advancing, and what player-facing options now matter?

#### Recommended fixes

1. **Extend the GM beat contract with structured agency fields:** e.g. `playerChoices` / `decisionPoint`, `stakes`, `consequences`, `pendingComplications`, and `nextPressure`. Keep them public-safe and concise, but make them first-class rather than prose hints.
2. **Persist a room-level consequence/pressure ledger:** carry latest scene-check tier, consequence text, affected thread, expiry/clock, and “what changes next if ignored.” Feed this into `buildNarrativeStateLines()` so future GM beats see more than summary/objective/open threads.
3. **Make scene-check outcomes update structured consequences:** require outcome JSON to include `consequence`, `pressureChange`, and `nextDecisionPrompt`, then merge those into durable narrative metadata/state instead of storing only beat-local roll details plus `lastSceneCheckOutcome`.
4. **Give character turns richer agency when appropriate:** add a non-roll “decision context” alongside scene-check context so characters can choose/commit to one of several GM-presented approaches, not only speak under two sentences. Keep short speech, but allow a structured `chosenApproach` when a decision point exists.
5. **Track longer-term plot pressure separately from combat readiness:** add a lightweight arc/clock model per room/location (e.g. `plotPressureLevel`, `activeFront`, `clockSegments`, `stakesAtRisk`) and validate that repeated beats advance or resolve it, without requiring combat.


## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The current narrative loop may be preserving continuity but not enough structured story state, choice pressure, or consequence state for immersive GM behavior.
**Findings:** Report scaffold created; no external research was needed because the issue is in repo-local prompt/state/coordinator behavior.
**Evidence:** Investigation target is the location-room GM/narrative flow recently modified for scene checks.
**Conclusion:** Confirmed as an in-repo code/prompt/state investigation.

### Phase 2 - Broad Context Gathering
**Hypothesis:** Relevant seams are GM prompt/schema, narrative state persistence, scene-check outcome persistence, and character turn prompting.
**Findings:** Context builder selected the GM generator, narrative coordinator, narrative types/repository, official turn generator, scene-check rules, gameplay roll helpers, service routing, and tests.
**Evidence:** Selected files include `lib/eliza/locationRooms/gameMasterGenerator.ts`, `narrativeCoordinator.ts`, `narrativeTypes.ts`, `officialTurnGenerator.ts`, `sceneChecks/*`, and related tests.
**Conclusion:** Confirmed these are the right seams; UI changes are not required for the minimal backend/prompt fix.

### Phase 3 - Pair Investigator
**Hypothesis:** The shallow experience comes from missing durable choice/consequence/plot state, not from broken tick routing or dice mechanics.
**Findings:** Pair investigator confirmed four root gaps: shallow GM schema, scene-check outcome persistence that is not future-facing enough, short prose-only character turns, and progression context that only guards openings/flatness.
**Evidence:** See `## Investigator Findings` above for file:line refs across `gameMasterGenerator.ts`, `narrativeCoordinator.ts`, `officialTurnGenerator.ts`, `narrativeTypes.ts`, and scene-check files.
**Conclusion:** Confirmed.

### Phase 4 - Oracle Synthesis
**Hypothesis:** The safest fix should be additive and preserve narrative / scene-check / combat separation.
**Findings:** Oracle recommended a bounded `metadata.adventure` layer plus `adventurePatch` prompt contracts, declared character actions, and idempotent coordinator merge points.
**Evidence:** Recommendations below consolidate pair evidence and Oracle synthesis.
**Conclusion:** Confirmed as the implementation direction.

## Root Cause
The location-room narrative loop has continuity but not enough structured adventure memory.

- `GameMasterBeatOutput` contains narration/instruction/state/TTRPG/combat/scene-check fields, but no first-class durable choices, stakes, consequences, discoveries, clocks, or declared actions (`lib/eliza/locationRooms/gameMasterGenerator.ts:66-95`).
- The GM JSON contract asks for summary/objective/open threads and coarse TTRPG state, then only prose-instructs the model to advance with a decision/clue/complication/consequence (`lib/eliza/locationRooms/gameMasterGenerator.ts:750-802`). Because this is not structured, weak passive beats can still satisfy the schema.
- Future GM prompts render only continuity summary, current objective, open threads, TTRPG phase/readiness/threat, requested action, and last encounter seed (`lib/eliza/locationRooms/gameMasterGenerator.ts:807-823`). They do not render a consequence ledger, current stakes, active decision, discoveries, clocks, or last declared character action.
- Scene-check resolution is mechanically sound and beat metadata stores request/proposal/adjudication/resolution/roll card ids, but the room-level update after an outcome only carries `stateSummary`, `currentObjective`, `openThreads`, `lastSceneCheckId`, and `lastSceneCheckOutcome` (`lib/eliza/locationRooms/narrativeCoordinator.ts:756-781`). Failure consequences can vanish unless the prose summary happens to preserve them.
- Ordinary character turns are intentionally one short utterance unless scene-check context exists; without scene-check JSON, the parser does not capture a durable action or decision (`lib/eliza/locationRooms/officialTurnGenerator.ts:136-180`).
- Progression context guards against missing/flat openings, but it does not track longer-term plot pressure, unresolved choices, clocks, or consequence debt (`lib/eliza/locationRooms/gameMasterGenerator.ts:132-144`, `lib/eliza/locationRooms/gameMasterGenerator.ts:295-324`).

## Recommendations
1. **Add a bounded `metadata.adventure` namespace to narrative state.** Keep it JSONB-backed in existing `metadata`; no DB migration is required. Add typed normalizers/merge helpers in `lib/eliza/locationRooms/narrativeTypes.ts`.

   Suggested fields:
   - `arcSummary: string | null` — compact larger adventure arc.
   - `currentStakes: string | null` — what is at risk right now.
   - `activeDecision: { prompt: string; options: string[]; selectedOption?: string | null } | null` — current player-facing choice.
   - `consequenceLedger: Array<{ id: string; source: string; summary: string; status: string }>` — latest durable costs, complications, advantages, or unresolved aftermath; cap to a small count such as 5-8.
   - `discoveries: string[]` — durable clues/reveals; cap and sanitize.
   - `clocks: Array<{ id: string; label: string; value: number; max: number; summary: string }>` — lightweight plot pressure.
   - `lastDeclaredAction: { tokenId: number; beatId: string; summary: string; chosenOption?: string | null } | null` — narrative intent only, not a roll.
   - `lastOutcome: { kind: 'beat' | 'scene_check'; sourceId: string; tier?: string | null; summary: string } | null`.

2. **Extend the GM beat contract with additive `adventurePatch`.** In `gameMasterGenerator.ts`, ask the GM to return updates for `arcSummary`, `currentStakes`, `activeDecision`, `consequence`, `discoveries`, and `clockDeltas`. For non-aftermath beats, require at least one story-pressure signal: `activeDecision`, `sceneCheckRequest`, `adventurePatch.consequence`, `adventurePatch.currentStakes`, or `adventurePatch.clockDeltas`. This prevents passive room-description-only beats without forcing combat.

3. **Render adventure memory into future GM prompts.** Extend `buildNarrativeStateLines()` to include arc, stakes, active decision, last declared action, consequence ledger, discoveries, clocks, and last outcome. This is the key continuity fix: the GM must see what changed before deciding the next beat.

4. **Make scene-check consequences durable.** Extend scene-check outcome JSON with `adventurePatch`. Require outcome generation to classify consequences:
   - Success: discovery, advantage, opened route, reduced clock, or clarified decision.
   - Partial/failure: cost, complication, lost opportunity, clock advance, new danger, or harder decision.

   Merge the outcome patch into room-level `metadata.adventure` in `narrativeCoordinator.ts` alongside the existing `lastSceneCheckId` / `lastSceneCheckOutcome` update. Use beat/scene-check ids for idempotency so retries do not duplicate ledger entries or clock changes.

5. **Capture non-roll character agency.** When narrative context exists, have `officialTurnGenerator.ts` request JSON for normal narrative turns as well:
   - `publicSpeech`
   - `declaredAction: { summary, chosenOption } | null`
   - `sceneCheckProposal` only when scene-check context exists or a clearly roll-worthy action is allowed

   `declaredAction` must not trigger dice by itself. Store it in beat metadata and room-level `metadata.adventure.lastDeclaredAction` so the next GM beat can react to what the character actually chose.

6. **Keep boundaries intact.** Do not alter combat handoff, scene-check adjudication, dice resolution, public roll-card projection, or public DTOs unless a later UI plan explicitly requires choice display. This is an adventure-memory/prompt-contract fix, not a new combat/gameplay system.

7. **Test the behavior at persistence boundaries.** Add/update tests for:
   - GM prompt includes adventure state and `adventurePatch` contract.
   - Weak non-aftermath beat without choice/stakes/consequence/clock/scene-check is rejected or repaired.
   - Scene-check success/failure produces durable discoveries/consequences/clocks.
   - Normal character turn persists `declaredAction` without rolling.
   - Retry reuses stored adventure metadata without duplicate consequences or rerolls.
   - Combat still starts only through existing `requestedGameplayAction: 'start_combat'`.

## Preventive Measures
- Treat summary-only state as insufficient for interactive story systems; every durable narrative loop should track at least current stakes, active decision, recent consequence, and pending pressure.
- Keep prompt prose and schema aligned: if a behavior matters, require it structurally and validate it rather than only describing it in instructions.
- Add regression tests that fail when a non-aftermath GM beat can advance without a decision, consequence, stakes, scene check, or clock movement.
- Keep all adventure metadata public-safe, compact, bounded, and idempotently mergeable so retries and long-running rooms remain stable.
- Preserve explicit separation between narrative intent, scene-check proposals, and combat handoff to avoid accidentally turning every decision into a roll or every threat into combat.
