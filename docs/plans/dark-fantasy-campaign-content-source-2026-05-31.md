# Dark Fantasy Campaign Content Source: Plan

## Goal
Plan a robust original dark-fantasy campaign content source for the WAGDIE game-master/JD system: monsters, NPCs, locations, factions, hazards, encounters, decisions, clocks, and scenario prompts that can push location-room stories forward. The plan uses the existing repo-canonical GM content workflow and per-location Johnny Decimal `adventureCatalog` runtime, without changing runtime generation to read repo files directly.

## Background
- Current GM/JD canonical content workflow already exists: `docs/plans/game-master-jd-content-update-2026-05-30.md:3-25` frames a hybrid repo-canonical persona/knowledge model applied into the live Official ElizaOS GM agent; `docs/runbooks/game-master-agent-content-sync.md:1-28` documents the operator path of editing `lib/eliza/gameMasterAgent/canonicalContent.ts`, deploying, reviewing `/admin/game-master-agent`, applying persona/knowledge, verifying sync, and rolling back through admin UI.
- The canonical GM source bundle lives in `lib/eliza/gameMasterAgent/canonicalContent.ts`. Key extension points are `GameMasterCanonicalContentBundle` (`lib/eliza/gameMasterAgent/canonicalContent.ts:22`), `GAME_MASTER_CANONICAL_PERSONA_FIELDS` (`:43`), `canonicalPersona` (`:62`), `operatingPrinciplesKnowledge` (`:137`), exported `GAME_MASTER_CANONICAL_CONTENT` (`:242`), and helpers `buildCanonicalGameMasterAgentCharacter()` / `toStoredCanonicalKnowledgeDocument()` (`:261`, `:265`).
- Canonical review and apply are already wired: `buildGameMasterCanonicalContentReview()` lives in `lib/eliza/gameMasterAgent/canonicalReview.ts:389`; `reviewToken` staleness protection is built in `canonicalReview.ts:333`; `GameMasterAgentService.applyCanonicalGameMasterContent()` starts at `lib/eliza/gameMasterAgent/service.ts:529` and handles persona apply, knowledge upsert, sync, and canonical metadata.
- Admin preview/apply already exists for repo-canonical GM content: `GameMasterAgentCanonicalContentPanel` displays bundle/persona/knowledge drift and blockers (`components/admin/game-master-agent/GameMasterAgentCanonicalContentPanel.tsx:1`, `:78`, `:122`, `:151`, `:194`); the admin container posts `expectedReviewToken` to `${API_ROOT}/canonical/apply` (`components/admin/game-master-agent/GameMasterAgentAdminContainer.tsx:218`); the route validates body and calls `applyCanonicalGameMasterContent()` in `app/api/admin/eliza/game-master-agent/canonical/apply/route.ts:24`, `:56`, `:73`.
- Runtime GM identity still resolves through the live Official GM agent, not repo files: `resolveRuntimeGameMasterAgentId()` is in `lib/eliza/gameMasterAgent/service.ts:349`; narrative coordinator uses a `GameMasterAgentResolver` in `lib/eliza/locationRooms/narrativeCoordinator.ts:108` and calls it at `:870`; gameplay coordinator also uses the resolver in `lib/eliza/locationRooms/gameplay/coordinator.ts:80`, `:523`.
- Location-level JD content is a separate and important seam: `lib/domain/location/metadata-types.ts:7-18` defines Johnny Decimal-style `LocationAdventureCatalogSectionKey` sections: `00_setting`, `10_plot`, `20_characters`, `30_monsters`, `40_places`, `50_items`, `60_shops_services`, `70_factions`, `80_encounters`, and `90_rules_guidance`; `LocationAdventureCatalogEntry` and decision shapes are in `metadata-types.ts:20-37`; defaults for live adventure memory are in `metadata-types.ts:39-58`; normalized catalog type is in `metadata-types.ts:60-66`.
- Location catalog safety/normalization already exists: content limits and banned public-text patterns are in `lib/domain/location/metadata.ts:21-28`; entry normalization is in `metadata.ts:118-140`; `normalizeLocationAdventureCatalog()` accepts either `sections` or top-level JD section keys in `metadata.ts:163-183`.
- Runtime copies location catalog into narrative state and adventure memory: `ensureNarrativeStateWithLocationCatalog()` loads location metadata and refreshes catalog in `lib/eliza/locationRooms/service/tickProcessor.ts:61-80`; `refreshAdventureCatalogMetadataFromLocation()` normalizes catalog and records section counts in `lib/eliza/locationRooms/narrativeTypes.ts:1002-1038`; `seedAdventureMetadataFromCatalog()` initializes arc summary, stakes, opening decision, discoveries, and clocks from catalog defaults in `narrativeTypes.ts:956-981`.
- GM beat contracts already carry story-driving hooks: `GameMasterBeatOutput` includes `publicNarration`, `speakerInstruction`, `stateAfter`, `ttrpgPhase`, `combatReadiness`, `threatLevel`, `requestedGameplayAction`, `encounterSeed`, `sceneCheckRequest`, and `adventurePatch` in `lib/eliza/locationRooms/gameMaster/officialGenerator.ts:96-135`; JSON-only contract markers are at `officialGenerator.ts:207-208`; progression validation enforces concrete interaction, objectives/open threads, pressure, scene-check/combat separation, and `start_combat` requirements in `officialGenerator.ts:587-749`.
- Adventure memory can store scenario continuity: types for `arcSummary`, `currentStakes`, `activeDecision`, `consequenceLedger`, `discoveries`, `clocks`, `spatialContext`, `lastDeclaredAction`, and `lastOutcome` live in `lib/eliza/locationRooms/narrativeTypes.ts:160-236`; normalization/merge helpers are at `narrativeTypes.ts:756-790`, `:830-874`, and `:896-937`; public projection is gated/sanitized in `lib/eliza/locationRooms/publicAdventure.ts:151-185`.
- Monsters and encounters have existing runtime touchpoints: scene-check escalation uses visible `80_encounters` and `30_monsters` entries in `lib/eliza/locationRooms/encounterEscalation.ts:158-172`, ranking by objective, adventure memory, spatial context, consequences, discoveries, and recent outcome in `encounterEscalation.ts:174-207`; `LocationRoomEncounterSeed` can carry `encounterHints` and `monsterHints` in `lib/eliza/locationRooms/types.ts:65-70`; gameplay monster state is defined in `lib/eliza/locationRooms/gameplay/types.ts:262-273`; `GameplayEncounterProposal` includes monster count/name/archetype, HP/AC/attack/damage, checks, and rewards in `lib/eliza/locationRooms/gameplay/rules.ts:59-75`.
- Combat handoff remains story-first: `LocationRoomSceneCheckEscalation` supports `none | danger | combat_ready` and danger kinds like `trap`, `hazard`, `pursuit`, `social_threat`, and `monster_pressure` in `lib/eliza/locationRooms/types.ts:45-79`; auto ticks promote threat-ready narrative state to combat only with phase `threat`, readiness `ready`, threat level >= 3, encounter seed, and unconsumed beat in `lib/eliza/locationRooms/service/tickProcessor.ts:95-137`; routing to gameplay happens in `tickProcessor.ts:472-566`.
- Prior art strongly favors location-authored adventure catalogs: `docs/plans/gm-story-generation-improvements-2026-05-25.md:42-77` introduced the JD sections; `docs/plans/narrative-encounter-escalation-2026-05-26.md:99-119` specified metadata-first encounter seeds using `80_encounters` then `30_monsters`; `docs/plans/crows-den-mob-spawning-2026-05-27.md:108-128` called for Crow’s Den `locations.id='11'` catalog data in `80_encounters` and `30_monsters` via migration/seed rather than admin PATCH; commit `2beec1fe` seeded Crow’s Den narrative catalog.
- Narrative quality/no-fallback constraints remain load-bearing: `docs/plans/gm-narrative-optimization-2026-05-26.md:79-94` records strict GM JSON, public GM narration, adventure memory, and quality gates; `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md:41-49` says public `gm_beat`/`gm_outcome` must come from accepted/repaired Official GM output; `docs/plans/compelling-narratives-roadmap-2026-05-30.md:70-101` sets production-quality content density and public-safe rules for monsters, places, factions, encounters, decisions, clocks, and rules guidance.
- External constraints: Wizards’ SRD 5.2 is available under CC BY 4.0 with attribution requirements and compatibility-language limits (https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf); CC BY 4.0 permits reuse/adaptation, including commercial use, but does not grant trademark/endorsement rights (https://creativecommons.org/licenses/by/4.0/legalcode.en); Wizards says OGL 1.0a remains in place and SRD 5.1 was released under Creative Commons (https://www.dndbeyond.com/posts/1439-ogl-1-0a-creative-commons); OGL Product Identity can include names, logos, characters, stories, places, creatures, and other expressive elements if designated (https://opengamingfoundation.org/ogl.html). For this plan, treat “D&D-like” as original TTRPG-inspired structure, not copied Wizards lore, monsters, settings, prose, logos, or trade dress.
- External structural facts useful for original design: SRD-style monsters are rules-facing stat blocks with identity, type, armor/HP/speed, abilities/saves/senses/languages/challenge, traits/actions/reactions/legendary actions; adventure structures commonly include social interaction, exploration, hazards/traps, combat encounters, NPC attitudes, environmental features, treasure/equipment, and encounter budgeting. If any SRD text is copied later, attribution and license handling become implementation requirements; original WAGDIE content avoids that burden.

## Approach
Build a repo-authored, original WAGDIE dark-fantasy campaign content source that deliberately feeds both existing content seams:

1. **Global GM guidance** through the repo-canonical Official GM knowledge workflow.
2. **Concrete per-location story anchors** through `locations.metadata.adventureCatalog`.

This is a content-source and export pipeline, not a runtime generation refactor. Runtime ticks should continue using live Official ElizaOS GM state plus normalized location metadata. The first production target should be Crow’s Den/location `11`, because existing plans and runtime seams already exercise `30_monsters`, `80_encounters`, catalog refresh, scene-check escalation, and combat-ready promotion there.

### Design decisions
- Add a source-only campaign package under `lib/content/campaign/`.
- Author richer source objects than runtime accepts, then compile them down to the existing `adventureCatalog` shape.
- Use global canonical GM knowledge for reusable guidance: how to read JD sections, monster/NPC/faction/hazard behavior, scenario patterns, public-safety rules, and IP constraints.
- Use per-location catalog content for concrete runtime anchors: location-specific monsters, NPCs, places, factions, encounters, clocks, decisions, and scenario prompts.
- Keep mechanics downstream. Campaign source may describe monster identity, signs, tactics, lairs, fears, and encounter pressure, but should not store raw HP/DC/reward/finality text in location catalog entries.
- Use Crow’s Den as the first flagship location and validation target; generalize only after the source model, compiler, and validation prove useful there.

### New campaign source package
Add:

```text
lib/content/campaign/
  types.ts
  validation.ts
  compiler.ts
  darkFantasyCampaign.ts
  gmKnowledge.ts
  locations/crowsDen.ts
```

The source model should represent a versioned `CampaignPack` with one or more `CampaignLocationSource` entries. Source entry kinds should include `setting`, `plot`, `scenario_prompt`, `npc`, `monster`, `place`, `item`, `service`, `faction`, `hazard`, `encounter`, and `rules_guidance`.

Each source kind compiles deterministically into one JD runtime section:

| Source kind | Runtime section |
|---|---|
| `setting` | `00_setting` |
| `plot`, `scenario_prompt` | `10_plot` |
| `npc` | `20_characters` |
| `monster` | `30_monsters` |
| `place` | `40_places` |
| `item` | `50_items` |
| `service` | `60_shops_services` |
| `faction` | `70_factions` |
| `hazard`, `encounter` | `80_encounters` |
| `rules_guidance` | `90_rules_guidance` |

Monster source entries should carry authoring-only detail such as sensory signs, behavior, lair/haunt, hunger/desire, tactics, fears/limits, encounter roles, and related IDs. Compiler output should collapse that into public-safe `summary`, `tags`, and `relatedEntryIds`.

Encounter and hazard entries should describe visible trigger, immediate pressure, player-facing choice, consequence direction, related monster/faction/place, and non-mechanical escalation hints. They should not describe fixed dice DCs, guaranteed outcomes, loot drops, or permanent finality.

Each production-ready flagship location should include `arcSummary`, `currentStakes`, an `openingDecision` with 2–4 options, at least two clocks where appropriate, and initial discoveries.

### Campaign compiler and validation
Add a compiler that converts `CampaignLocationSource` into raw `adventureCatalog` JSON accepted by `normalizeLocationAdventureCatalog()`. It should also emit an informational metadata marker outside the catalog:

```ts
campaignContentSource: {
  packId: string
  version: string
  locationSlug: string
}
```

Runtime story logic should continue reading only `adventureCatalog`.

Validation should run before content reaches migrations or canonical GM knowledge. It must prove:
- compiled catalogs survive `normalizeLocationAdventureCatalog()` without dropping required entries;
- title, summary, tag, section, and count limits are respected;
- every `relatedEntryIds` target exists in the same location source;
- reveal-gated entries do not count toward visible encounter/monster minimums;
- unsafe public text, mechanics terms, and known D&D/Wizards protected identity terms are rejected;
- Crow’s Den meets compelling-location density targets from prior planning.

The IP/originality lint is a guardrail, not a substitute for narrative/product review.

### Canonical GM knowledge export
Add a deterministic campaign guide knowledge document, e.g. `canonical/dark-fantasy-campaign-source-guide.md`, with a stable ID such as `canonical:dark-fantasy-campaign-source-guide`. It should explain how the GM should use the campaign source and JD sections without copying protected D&D/Wizards material.

`lib/eliza/gameMasterAgent/canonicalContent.ts` should append this document to `GAME_MASTER_CANONICAL_CONTENT.knowledge` and bump `contentVersion` to the next approved value. Runtime impact still requires admin review/apply in `/admin/game-master-agent`.

### Crow’s Den pilot and migration path
Author `lib/content/campaign/locations/crowsDen.ts` as the first production content module for `locations.id = '11'`. It should include original tavern/rookery/threshold setting anchors, NPCs with motives and secrets, monsters with signs/lairs/tactics/limits, factions with conflicting agendas, hazards, 8–12 reusable `80_encounters`, 3–6 reusable `30_monsters`, defaults, clocks, and `90_rules_guidance`.

Add a render/check script under `scripts/campaign/render-location-catalog.ts` to validate and print compiled catalog JSON for a location. Use that output for a Supabase data migration that targets `locations.id = '11'`, preserves existing metadata, and replaces only `metadata.adventureCatalog` plus `metadata.campaignContentSource`.

## Work Items

### Item 1 — Define the campaign source model
**Goal:** Create a source-only TypeScript model for original WAGDIE dark-fantasy campaign content that can represent monsters, NPCs, factions, places, items, hazards, encounters, decisions, clocks, scenario prompts, and GM guidance.

**Done when:**
- `lib/content/campaign/types.ts` defines campaign pack, location source, entry variants, defaults/decision/clock source types, and IP policy metadata.
- Each source entry variant has a deterministic mapping to one JD section.
- Type docs explicitly state that source files are not read by runtime ticks.
- Source types include enough fields for rich authoring but compile down to current catalog fields.

**Key files:**
- New `lib/content/campaign/types.ts`
- New `lib/content/campaign/darkFantasyCampaign.ts`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Add campaign validation and IP/safety lint
**Goal:** Prevent invalid, unsafe, mechanics-heavy, or non-original content from entering canonical knowledge or location metadata.

**Done when:**
- `lib/content/campaign/validation.ts` validates section density, ID uniqueness, related-entry references, visible encounter/monster counts, public unsafe terms, mechanics terms, and known D&D/Wizards protected identity or trade-dress terms.
- Validation runs compiled catalogs through `normalizeLocationAdventureCatalog()`.
- Tests prove invalid entries are rejected before normalization silently drops them.
- Validation output identifies exact location/entry/field failures.

**Key files:**
- New `lib/content/campaign/validation.ts`
- `lib/domain/location/metadata.ts`
- `lib/domain/location/metadata-types.ts`
- New `tests/lib/content/campaign/validation.test.ts`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Add compiler from source content to `adventureCatalog`
**Goal:** Compile rich source entries into the existing runtime `locations.metadata.adventureCatalog` shape without changing runtime schema.

**Done when:**
- `lib/content/campaign/compiler.ts` converts source locations into `sections`, `defaults`, and a top-level `campaignContentSource` metadata marker.
- Compiler output respects all current normalization limits.
- Compiler preserves enough tags and related IDs for `retrieveAdventureCatalogEntries()` and `encounterEscalation.ts` ranking.
- Compiler never emits source-only author notes or mechanics.
- Tests confirm compiled output round-trips through `normalizeLocationAdventureCatalog()` with expected counts.

**Key files:**
- New `lib/content/campaign/compiler.ts`
- `lib/domain/location/metadata.ts`
- `lib/domain/location/metadata-types.ts`
- New `tests/lib/content/campaign/compiler.test.ts`

**Dependencies:** Items 1–2.

**Size:** Medium.

### Item 4 — Author global GM campaign knowledge
**Goal:** Give the Official GM reusable guidance for using the original campaign source without putting location-specific runtime content directly into prompts.

**Done when:**
- `lib/content/campaign/gmKnowledge.ts` exports markdown content for a canonical GM knowledge document.
- The document covers WAGDIE dark-fantasy tone, JD section usage, monster/NPC/faction/hazard/clock/scenario guidance, public-safe non-mechanical output rules, and explicit no-D&D/Wizards-copying guidance.
- `lib/eliza/gameMasterAgent/canonicalContent.ts` includes the new document in `GAME_MASTER_CANONICAL_CONTENT.knowledge`.
- `contentVersion` is bumped.
- Canonical content validation passes.
- Admin canonical review shows the new/changed knowledge document as drifted until applied.

**Key files:**
- New `lib/content/campaign/gmKnowledge.ts`
- `lib/eliza/gameMasterAgent/canonicalContent.ts`
- `lib/eliza/gameMasterAgent/canonicalReview.ts`
- `lib/eliza/gameMasterAgent/service.ts`
- New or updated `tests/lib/eliza/game-master-agent-canonical-content.test.ts`

**Dependencies:** Items 1–3.

**Size:** Medium.

### Item 5 — Author Crow’s Den campaign source
**Goal:** Create the first production-ready location module for Crow’s Den/location `11`, using original WAGDIE content and the compelling-location density standard.

**Done when:**
- `lib/content/campaign/locations/crowsDen.ts` defines full source coverage for setting entries, plot/scenario prompts, NPCs, monsters, places, items, optional services/rumors/favors, factions, hazards/encounters, rules guidance, and defaults with opening decision and clocks.
- Visible `80_encounters` count is at least 8.
- Visible `30_monsters` count is at least 3.
- No entry uses protected D&D/Wizards identity, lore, prose, logos, or trade dress.
- No entry is dropped by catalog normalization.
- Narrative/product owner approval is recorded before production migration lands.

**Key files:**
- New `lib/content/campaign/locations/crowsDen.ts`
- `docs/plans/compelling-narratives-roadmap-2026-05-30.md`
- `docs/plans/crows-den-mob-spawning-2026-05-27.md`
- New `tests/lib/content/campaign/crows-den.test.ts`

**Dependencies:** Items 1–3. Product/narrative approval is required before production data merge.

**Size:** Large.

### Item 6 — Add catalog render/check script
**Goal:** Make generated location catalog JSON reproducible and prevent migration/source drift.

**Done when:**
- `scripts/campaign/render-location-catalog.ts` can render compiled catalog JSON for a location, validate the selected location, and optionally check a committed migration JSON payload against source output.
- Script supports Crow’s Den/location `11`.
- CI or a focused test command can fail when source and generated migration diverge.
- Script does not run during runtime ticks.

**Key files:**
- New `scripts/campaign/render-location-catalog.ts`
- `package.json` script entry, if project convention allows
- New `tests/lib/content/campaign/rendered-catalog.test.ts`

**Dependencies:** Items 1–5.

**Size:** Small-to-medium.

### Item 7 — Seed Crow’s Den `adventureCatalog`
**Goal:** Write the compiled Crow’s Den catalog into `locations.metadata` through the approved Supabase migration/seed path.

**Done when:**
- A Supabase data migration updates `locations.id = '11'`.
- The migration preserves existing metadata fields.
- The migration writes `metadata.adventureCatalog` and `metadata.campaignContentSource`.
- `GET /api/locations/11` exposes normalized catalog metadata.
- Admin diagnostics show nonzero visible `80_encounters` and `30_monsters` counts.
- Existing runtime catalog refresh in `tickProcessor.ts` copies the catalog into narrative state without further code changes.

**Key files:**
- New `supabase/migrations/<timestamp>_seed_crows_den_campaign_catalog.sql`
- `lib/repositories/locationRepository.ts`, only if existing read path fails to expose metadata correctly
- `app/api/locations/[id]/route.ts`, only if API projection omits needed normalized metadata
- `lib/eliza/locationRooms/service/tickProcessor.ts`, no expected code change

**Dependencies:** Items 5–6.

**Size:** Small-to-medium.

### Item 8 — Add content-source tests and narrative integration checks
**Goal:** Prove the campaign source reaches the existing runtime seams without runtime direct-file reads.

**Done when:**
- Tests confirm the campaign source validates, Crow’s Den compiled catalog meets density requirements, compiled catalog survives `normalizeLocationAdventureCatalog()`, `retrieveAdventureCatalogEntries()` can retrieve anchors, `buildCatalogPreferredEncounterSeed()` prefers Crow’s Den `80_encounters` and includes related `30_monsters` hints, and reveal-gated entries are not counted as visible escalation candidates.
- Tests do not require Official ElizaOS network access.
- Existing location-room runtime tests continue passing.

**Key files:**
- New `tests/lib/content/campaign/*.test.ts`
- Existing or updated `tests/lib/eliza/location-room-encounter-escalation.test.ts`
- Existing or updated `tests/lib/eliza/location-room-narrative-harness.test.ts`
- `lib/eliza/locationRooms/encounterEscalation.ts`
- `lib/eliza/locationRooms/narrativeTypes.ts`

**Dependencies:** Items 1–7.

**Size:** Medium.

### Item 9 — Add operator workflow documentation
**Goal:** Document how future campaign content changes move from source files to live GM behavior and location metadata.

**Done when:**
- Documentation explains: edit campaign source, validate/render catalog, generate/update migration, update canonical GM knowledge if global guidance changes, deploy, open `/admin/game-master-agent`, review/apply canonical GM knowledge, verify Crow’s Den catalog counts and runtime diagnostics, and run smoke/eval commands.
- Documentation states runtime does not read campaign source files directly.
- Documentation states location catalog is public-safe and non-mechanical.
- Documentation records the unresolved approval-owner question.

**Key files:**
- `docs/plans/dark-fantasy-campaign-content-source-2026-05-31.md`
- `docs/runbooks/game-master-agent-content-sync.md`
- `docs/operations/crows-den-location-room-smoke.md`

**Dependencies:** Items 4–8.

**Size:** Small.

## Risks and Migration
- **IP/originality risk:** Automated banned-term lint reduces risk but cannot prove originality. Final production copy needs narrative/product owner review before migration merge.
- **Catalog safety-filter risk:** `normalizeLocationAdventureCatalog()` may drop unsafe entries. Validation/tests must assert normalized counts match expected output counts.
- **Runtime apply risk:** Canonical GM knowledge changes do not affect runtime until applied through `/admin/game-master-agent`.
- **Data migration risk:** Crow’s Den migration changes production location metadata. It should preserve existing metadata keys and only replace `adventureCatalog` plus `campaignContentSource`.
- **Rollback:** GM knowledge rollback uses existing admin knowledge delete/reapply flow or a later canonical content version. Location metadata rollback requires a follow-up Supabase migration restoring the previous `adventureCatalog` payload or removing the seeded catalog.

## Open Questions
- Should the first implementation be strictly Crow’s Den/location `11`, or should it include empty source scaffolding for multiple future map locations?
- Should campaign entries remain fully narrative-facing in V1, or should source-only monster entries include optional mechanics hints that the compiler strips from `adventureCatalog` but tests against gameplay proposal boundaries?
- Who owns final narrative/product approval for production Crow’s Den content before the data migration lands?

## References
- `docs/plans/game-master-jd-content-update-2026-05-30.md`
- `docs/runbooks/game-master-agent-content-sync.md`
- `docs/plans/gm-story-generation-improvements-2026-05-25.md`
- `docs/plans/narrative-encounter-escalation-2026-05-26.md`
- `docs/plans/crows-den-mob-spawning-2026-05-27.md`
- `docs/plans/compelling-narratives-roadmap-2026-05-30.md`
- `docs/plans/elizaos-gm-no-static-fallback-2026-05-27.md`
- `docs/plans/gm-narrative-optimization-2026-05-26.md`
- D&D SRD 5.2 CC PDF: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf
- Creative Commons BY 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode.en
- Wizards OGL/CC statement: https://www.dndbeyond.com/posts/1439-ogl-1-0a-creative-commons
- Open Game License text: https://opengamingfoundation.org/ogl.html
