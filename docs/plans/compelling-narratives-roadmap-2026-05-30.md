# Compelling Narratives Roadmap: Plan

## Goal
Define the next implementation roadmap for making location-room play consistently compelling: richer GM source material, stronger ElizaOS character voices, better scene/action pacing, stronger encounter/combat identity, and targeted quality gates that keep the game from drifting into generic narration.

## Background
- Location-room narratives are now materially more reliable after the no-fallback work, but reliability is only the foundation. The next bottleneck is source material and orchestration quality: what the GM has to draw from, how character voices enter Official ElizaOS, and how scenes are framed/paced.
- GM content enters primarily through `locations.metadata.adventureCatalog`, normalized by `normalizeLocationAdventureCatalog()` (`lib/domain/location/metadata.ts:138-160`) with sections such as `00_setting`, `10_plot`, `20_characters`, `30_monsters`, `40_places`, `50_items`, `60_shops_services`, `70_factions`, `80_encounters`, and `90_rules_guidance` (`lib/domain/location/metadata-types.ts:4-16`). Thin catalog data means the GM relies mostly on state and transcript.
- Narrative state seeds/refreshes catalog content through `refreshAdventureCatalogMetadataFromLocation()` and `seedAdventureMetadataFromCatalog()` (`lib/eliza/locationRooms/narrativeTypes.ts:935-1065`), then persists live adventure memory: arc summary, stakes, active decision, consequence ledger, discoveries, clocks, spatial context, last action, and last outcome (`lib/eliza/locationRooms/narrativeTypes.ts:235-245`).
- GM prompt assembly uses adventure memory plus retrieved catalog entries. `formatAdventureMemoryLines()` reads live adventure memory and catalog entries (`lib/eliza/locationRooms/gameMasterGenerator.ts:1121-1160`), while `retrieveAdventureCatalogEntries()` scores catalog entries against objective, active decision, open threads, last outcome, tags, and selected token (`lib/eliza/locationRooms/narrativeTypes.ts:1068-1112`).
- Active decisions are the explicit scene-options mechanism. `LocationRoomAdventureDecision` and options live in `lib/eliza/locationRooms/narrativeTypes.ts:165-175`; character prompts receive active decision/spatial context through `toCharacterNarrativeContext()` (`lib/eliza/locationRooms/narrativeCoordinator.ts:655-682`) and `formatActiveDecision()` (`lib/eliza/locationRooms/officialTurnGenerator.ts:121-135`).
- Encounter richness depends on catalog `80_encounters` and `30_monsters`. Scene-check outcomes surface catalog candidates (`lib/eliza/locationRooms/gameMasterGenerator.ts:1236-1256`), `buildCatalogPreferredEncounterSeed()` ranks visible encounters/monsters (`lib/eliza/locationRooms/encounterEscalation.ts:274-330`), and auto combat promotion only starts from explicit/ready threat state (`lib/eliza/locationRooms/service.ts:1148-1177`, `:1571-1647`).
- Character voice, bio, lore, style, examples, and system prompt enter through persisted Official ElizaOS `AgentCharacter` records, not by being manually concatenated into the location-room prompt. Mapping happens in `toAgentCharacterFromAICharacter()` (`lib/eliza/agent-character-mapper.ts:115-164`) and updates in `toAgentCharacterPatchFromUpdate()` (`lib/eliza/agent-character-mapper.ts:166-217`).
- Persona editing and persistence run through `app/api/eliza/characters/[tokenId]/route.ts:131-181`; allowed user-managed fields are defined in `lib/eliza/character-sheet-policy.ts:67-82`; dual/Official sync uses `syncOfficialPersonaShadow()` (`lib/eliza/personaMigration.ts:123-152`).
- Runtime location-room character turns resolve the selected token to an Official ElizaOS agent via `ElizaOfficialLocationRoomTurnGenerator.generateTurn()` (`lib/eliza/locationRooms/officialTurnGenerator.ts:404-447`) and `resolveCharacterByTokenId()` (`lib/eliza/characterResolver.ts:95-133`). Missing records create minimal default agents from name/background story (`lib/eliza/characterResolver.ts:31-62`), which is useful for resilience but weak for voice.
- Explicit character room prompts include speaker identity, participant list, recent transcript, and private GM narrative context (`lib/eliza/locationRooms/officialTurnGenerator.ts:187-207`; narrative context serialization at `:163-185`). Persisted character sheets supply the real voice/persona layer.
- Existing quality gates already cover cadence, concrete prose, scene checks, combat handoff, no-fallback behavior, and harness scoring. Examples: `validateGameMasterBeatProgressionContract()` (`lib/eliza/locationRooms/gameMasterGenerator.ts:526`), `validateConcreteNarrativeText()` (`:510`), scene-check outcome validation (`:1340-1382`), combat outcome validation (`lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts:560-666`), and narrative harness scoring (`scripts/location-room-narrative-quality.ts:22-194`; `tests/lib/eliza/location-room-narrative-harness.test.ts:47-79`).
- Admin diagnostics expose cadence, retry state, GM generation/fallback metrics, catalog visibility, and combat-ready state (`lib/eliza/locationRooms/adminDiagnostics.ts:101-122`, `:414`, `:501`, `:559`, `:579`). These are the obvious place to observe whether content/persona improvements actually move quality.
- External action-forward narration references support a clear design direction: Wushu-style play treats described actions as happening in the fiction while dice determine scene momentum, rewards vivid relevant details, and uses dice/pool caps as pacing controls. See Wushu Open PDF: https://www.story-games.at/wushu/wushuopen_pocketmod.pdf and overview: https://2d4chan.org/wiki/Wushu_Open.
- Broader pacing references emphasize aggressive scene framing: start close to the meaningful choice, cut after the scene’s purpose is served, and avoid flow-breaking exposition. See The Alexandrian on scene framing and closing frames: https://thealexandrian.net/wordpress/31520/roleplaying-games/the-art-of-pacing-part-2-scene-framing and https://thealexandrian.net/wordpress/31533/roleplaying-games/the-art-of-pacing-part-4-closing-the-frame.

## Approach
The next phase should be a staged quality program, not another broad runtime rewrite. The system already has the needed extension points: location `adventureCatalog`, durable `metadata.adventure`, Official ElizaOS character sheets, scene-check escalation, explicit combat handoff, diagnostics, and narrative harness scoring.

The priority order is:

1. Add lightweight quality attribution metrics so we can tell whether failures come from thin catalog content, weak personas, scene pacing, or combat style.
2. Fill out the GM’s source content through the adventure catalog, starting with Crow’s Den/location `11` before generalizing to other locations.
3. Improve ElizaOS character sheet/persona quality and observability.
4. Tune runtime scene/action pacing around aggressive scene framing and action-forward turns.
5. Tune encounter/combat style and transcript balance after catalog and persona inputs are stronger.
6. Use deterministic and live transcript evaluation as a release gate.

This order is intentional. Do not start by changing orchestration heuristics broadly. Better runtime pacing over thin content just produces generic scenes faster. The first runtime investments should measure quality, then give the GM and characters better material.

### Content standard for compelling locations
For each priority location, author a dense but bounded `adventureCatalog`:

- `00_setting`: 3–5 entries.
- `10_plot`: 4–6 entries.
- `20_characters`: 4–8 entries.
- `30_monsters`: 3–6 entries.
- `40_places`: 6–10 entries.
- `50_items`: 4–8 entries.
- `60_shops_services`: 0–3 entries where the location has commerce, services, rumors, favors, or support NPCs; optional for Crow’s Den if it does not fit the fiction.
- `70_factions`: 2–5 entries.
- `80_encounters`: 8–12 entries.
- `90_rules_guidance`: 3–5 entries.
- `defaults.openingDecision`: 2–4 actionable options.
- At least 2 clocks where applicable.

These ranges are authoring targets for production-quality locations, not universal hard gates until the metrics are calibrated. Crow’s Den validates the standard first.

Content rules:

- Entries must be public-safe and non-mechanical.
- No HP, DCs, rewards, death/finality, wallets, private chain data, or raw prompt text.
- Entries should name concrete objects, routes, NPCs, motives, omens, and consequences.
- `80_encounters` should be reusable scene seeds, not combat stat blocks.
- `30_monsters` should describe behavior, signs, lairs, fears, tactics, and sensory identity, not mechanics.
- `90_rules_guidance` should include tone and pacing instructions specific to the location.

### Persona standard for compelling characters
Character voice should continue to come from persisted Official ElizaOS `AgentCharacter` records, not by manually concatenating persona fields into location-room prompts.

Recommended persona expectations:

- `bio`: 3–8 short identity/behavior bullets.
- `lore`: backstory plus unresolved motives.
- `topics`: recurring concerns, fears, obsessions, faction ties, or scene interests.
- `adjectives`: voice texture and demeanor.
- `style.chat`: dialogue style that can survive short public turns.
- `messageExamples`: at least 2 strong in-world examples.
- `system`: concise behavioral constraints, not a lore dump.

Sparse/default personas should not block turns or compelling-ready status initially, but they should become visible warnings in diagnostics/evaluation.

### Runtime style target
Use the Wushu-adjacent principle as the runtime target:

- Character declared actions happen fictionally; dice determine momentum/cost/consequence, not whether the player is allowed to act.
- GM beats should frame near a meaningful choice, obstacle, cost, reveal, or route.
- Scenes should cut or reframe after their dramatic purpose is served.
- Combat should be a scene with changing battlefield state, not a transcript takeover.

### Metric definitions
The new metrics are scorer/evaluation fields, not product DTOs or persisted room schema.

- `catalogAnchorSignalCount`: GM beats/outcomes that mention concrete catalog-derived anchors, detected through known catalog entry names/tags where available and a bounded text heuristic where metadata is unavailable.
- `distinctCharacterVoiceSignalCount`: character messages with speaker-specific lexical/style variance relative to other recent speakers, not just message length.
- `sceneFrameStrengthCount`: GM beats that present a concrete choice, obstacle, cost, reveal, route, or imminent action instead of only atmosphere.
- `actionForwardResponseCount`: character turns with concrete verbs and declared fictional movement/intervention, not agreement-only speech.
- `combatTranscriptShare`: combat-domain public messages divided by total public messages over a configured transcript window, initially reported over harness scenarios and recent live-room windows.
- `genericThreatIdentityCount`: public setup/outcome text containing known generic encounter/threat phrases.

These metrics begin as raw reports. Thresholds become release gates only after Crow’s Den baselines exist.

### Content approval and storage
No new database schema is required. Approved production catalog content should use the existing `locations.metadata.adventureCatalog` JSON shape and land through the repo’s established Supabase migration/seed path.

Rules:

- Do not commit placeholder production content.
- Crow’s Den content can be drafted in parallel with metrics work, but should not be treated as validated until Item 1 produces baseline reports.
- Final production content needs product/narrative-owner approval before merge.
- If a non-production scratch file is useful during writing, keep it clearly outside the production seed/migration path.

## Work Items

### Item 1 — Add narrative quality attribution metrics
**Goal:** Establish baseline metrics that separate catalog weakness, persona weakness, pacing weakness, and combat dominance.

**Done when:**
- `scripts/location-room-narrative-quality.ts` reports non-breaking raw scorer metrics, not product DTOs, for:
  - catalog anchor signal count,
  - distinct character voice signal count,
  - scene frame strength count,
  - action-forward response count,
  - combat transcript share,
  - generic threat identity count.
- `scripts/location-room-narrative-eval.ts` includes the new metrics in live JSON output.
- Harness tests cover metric calculation without making uncalibrated metrics hard failures yet.
- Existing GNQS scoring remains backward-compatible.

**Key files:**
- `scripts/location-room-narrative-quality.ts`
- `scripts/location-room-narrative-eval.ts`
- `tests/lib/eliza/location-room-narrative-harness.test.ts`
- `tests/lib/eliza/location-room-narrative-harness.ts`
- `lib/eliza/locationRooms/adminDiagnostics.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Author and seed Crow’s Den adventure catalog depth
**Goal:** Give the GM a real book of content for location `11`, using the existing `adventureCatalog` schema rather than adding a new source system.

**Done when:**
- Crow’s Den/location `11` has production-quality `adventureCatalog` coverage meeting the section density standard above. Other locations wait until the Crow’s Den loop validates the standard.
- `80_encounters` has at least 8 visible entries and `30_monsters` has at least 3 visible entries.
- Defaults include an opening decision, stakes, discoveries, and clocks.
- Admin diagnostics show catalog source present and visible encounter/monster counts.
- Static/live evaluation shows improved catalog anchor signal and lower generic threat identity count.

**Key files:**
- Approved Supabase migration/seed path for `locations.metadata.adventureCatalog`
- `lib/domain/location/metadata-types.ts`
- `lib/domain/location/metadata.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `lib/eliza/locationRooms/adminDiagnostics.ts`

**Dependencies:** Item 1 for validation. Content drafting may begin in parallel, but production merge waits for baseline metrics and content approval.

**Size:** Large.

### Item 3 — Tune GM catalog usage and adventure memory prompts
**Goal:** Make the GM use the richer catalog as private inspiration while preserving concise, public-safe narrative output.

**Done when:**
- GM prompt language treats catalog entries as concrete inspiration for public narration, active decisions, scene checks, discoveries, and encounter seeds.
- Retrieved catalog entries remain bounded; prompt size does not grow substantially.
- GM output uses concrete catalog anchors without sounding like it is listing database entries.
- `adventurePatch` continues to maintain spatial context, consequence ledger, discoveries, clocks, active decision, and last outcome.
- Harness/live eval shows higher catalog anchor signal and spatial continuity without increased repair failures.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `tests/lib/eliza/location-room-narrative-harness.test.ts`

**Dependencies:** Items 1 and 2.

**Size:** Medium.

### Item 4 — Improve Official ElizaOS persona quality workflow
**Goal:** Make characters read as distinct agents by improving persisted character sheet quality and observability, without duplicating persona text in runtime prompts.

**Done when:**
- Persona assistant guidance favors distinct in-world voice, concrete verbs, location-relevant motives, and short public-room examples.
- Character sheet completeness can be evaluated or surfaced safely: missing persisted persona, default neutral persona creation, missing examples/style/lore/topics.
- `AgentCharacter` mapping continues to round-trip `bio`, `lore`, `topics`, `adjectives`, `style`, `messageExamples`, `postExamples`, `templates`, and `system`.
- Sparse/default personas do not block runtime turns or initial compelling-ready status; they appear as warnings that can be prioritized separately.
- Evaluation shows improved distinct character voice signal.

**Key files:**
- `lib/eliza/agent-character-mapper.ts`
- `lib/eliza/character-sheet-policy.ts`
- `lib/eliza/characterResolver.ts`
- `lib/eliza/personaMigration.ts`
- `app/api/eliza/characters/[tokenId]/persona-assistant/route.ts`
- `app/api/eliza/characters/[tokenId]/route.ts`
- `lib/eliza/locationRooms/adminDiagnostics.ts`

**Dependencies:** Item 1 preferred; can run partly in parallel with Item 2.

**Size:** Large.

### Item 5 — Tune scene/action pacing for action-forward play
**Goal:** Make ordinary narrative turns feel like forward motion: start near meaningful choices, treat declared actions as fictional motion, and cut/reframe after the scene’s purpose is served.

**Done when:**
- GM beat prompts favor scene framing around choice, cost, reveal, route, or obstacle.
- Validation discourages passive atmosphere-only beats when no concrete interaction or decision is introduced.
- Official character turn prompts push concrete declared actions rather than passive agreement/reaction.
- Active decision lifecycle stays GM-owned: choices remain rare, validated, and resolved/reframed by later GM beats.
- Scene-check and combat trigger boundaries remain unchanged.
- Evaluation shows higher scene frame strength and action-forward response counts.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts`
- `lib/eliza/locationRooms/narrativeCoordinator.ts`
- `lib/eliza/locationRooms/officialTurnGenerator.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`
- `scripts/location-room-narrative-quality.ts`

**Dependencies:** Items 1 and 3.

**Size:** Medium.

### Item 6 — Tune encounter/combat style and transcript balance
**Goal:** Make combat inherit location-specific identity and remain a sharp scene instead of dominating the transcript.

**Done when:**
- Encounter setup prefers catalog-backed `80_encounters`, related `30_monsters`, current spatial context, and recent consequence ledger.
- Encounter titles/setup include concrete location/catalog anchors.
- Generic threat titles/phrases are rejected by validation/evaluation.
- Combat narration requires specific target, location anchor, visible tactic, and changed battlefield state.
- Combat transcript share is reported over a defined recent transcript/harness window and compared against per-location/per-encounter expectations once those thresholds are calibrated.
- Existing explicit combat trigger contract remains unchanged.

**Key files:**
- `lib/eliza/locationRooms/encounterEscalation.ts`
- `lib/eliza/locationRooms/service.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `scripts/location-room-narrative-quality.ts`

**Dependencies:** Items 1, 2, and recent no-fallback gameplay strictness.

**Size:** Medium.

### Item 7 — Establish live validation and release gates
**Goal:** Turn compelling narrative quality into a repeatable development/release loop.

**Done when:**
- Deterministic harness and live evaluator reports include the new attribution metrics.
- Dev smoke checklist includes catalog coverage, persona completeness warnings, scene framing, action-forward turns, combat share, and generic threat identity checks.
- Validation commands are documented for deterministic harness runs, static live transcript scoring, and fresh-tick live runs when auth/config permits.
- A location is considered “compelling-ready” only when:
  - catalog coverage passes section minimums,
  - visible encounter/monster catalog counts are nonzero,
  - GNQS remains above threshold,
  - no fallback/generic threat warnings remain,
  - distinct character voice signal is acceptable,
  - GM cadence and spatial continuity warnings are empty,
  - combat share stays within the location/encounter-specific baseline once calibrated,
  - a short qualitative transcript review passes.

**Key files:**
- `scripts/location-room-narrative-quality.ts`
- `scripts/location-room-narrative-eval.ts`
- `tests/lib/eliza/location-room-narrative-harness.test.ts`
- `docs/operations/crows-den-location-room-smoke.md`
- `lib/eliza/locationRooms/adminDiagnostics.ts`

**Dependencies:** Items 1–6.

**Size:** Medium.

## Validation Commands
Use existing commands and extend their reports rather than adding a separate toolchain:

```bash
bun run narrative:harness:test
bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000 --fail-on-warnings
```

Fresh-tick validation when auth/config permits:

```bash
NARRATIVE_EVAL_TRIGGER_TICKS=10 NARRATIVE_EVAL_COOKIE='...' bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000 --fail-on-warnings
```

## Decisions
- Validate the content standard on Crow’s Den/location `11` first.
- Treat combat transcript share as content-dependent; report it immediately, enforce thresholds only after baseline calibration.
- Keep persona completeness as a warning rather than a readiness blocker for the first rollout.
- Crow’s Den catalog writing may begin in parallel with metrics, but production merge waits for metrics baseline and product/narrative approval.
- `60_shops_services` is optional for Crow’s Den but remains part of the supported catalog taxonomy.

## Open Questions
- Who is the named product/narrative owner for approving production catalog content and calibrated readiness thresholds?

## References
- `docs/plans/no-fallback-narration-quality-2026-05-30.md`
- `docs/plans/combat-narration-quality-2026-05-29.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- `docs/plans/ttrpg-story-combat-experience-2026-05-24.md`
- `docs/operations/crows-den-location-room-smoke.md`
- Wushu Open PDF: https://www.story-games.at/wushu/wushuopen_pocketmod.pdf
- Wushu Open overview: https://2d4chan.org/wiki/Wushu_Open
- The Alexandrian scene framing: https://thealexandrian.net/wordpress/31520/roleplaying-games/the-art-of-pacing-part-2-scene-framing
- The Alexandrian closing frames: https://thealexandrian.net/wordpress/31533/roleplaying-games/the-art-of-pacing-part-4-closing-the-frame
