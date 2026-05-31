# Investigation: /characters Has Sheet Filter Not Filtering

## Summary
The `/characters` "Has Sheet" filter is wired from the UI through the API into the repository, but the repository predicate is too broad. It ORs over fields (`name.not.is.null`, `str.not.is.null`) that are populated/defaulted for ordinary no-sheet characters, so `hasSheet=true` can match almost the same population as the unfiltered list.

## Symptoms
- Enabling the "Has Sheet" filter on `/characters` does not visibly narrow the character list.
- The expected behavior is that only characters with character-sheet data are shown.

## Background / Prior Research
- Prior workspace report `docs/investigations/has-sheet-filter-2026-05-18.md` concluded the UI/API plumbing was present but the repository predicate was too broad: `name.not.is.null` and `str.not.is.null` can match ordinary no-sheet characters because imports/default schema populate those fields.
- That prior conclusion needs fresh verification against the current code before recommending a fix.

## Investigator Findings
<!-- Pair investigator appends structured analysis here. -->

### 2026-05-31 Pair Investigation - End-to-End Trace and Predicate Semantics

#### Conclusion
The current code confirms the prior hypothesis: `hasSheet` is wired from the `/characters` UI through the API and into the repository, but the repository predicate is semantically too broad. It treats non-null/defaulted read-model columns (`name`, `str`) as sheet evidence, and those columns can be populated for no-sheet characters.

#### 1. UI URL/filter state -> hook -> API client -> route -> service -> repository is wired
- URL parsing reads `hasSheet=true` into `filters.hasSheet` (`hooks/useCharacterBrowseFilters.ts:71-82`). URL building writes `hasSheet=true` only when truthy (`hooks/useCharacterBrowseFilters.ts:88-102`). The toggle handler calls `updateFilters({ hasSheet })` (`hooks/useCharacterBrowseFilters.ts:199-201`).
- `/characters` destructures `hasSheet` from the parsed filters (`app/characters/page.tsx:49-63`), passes `hasSheet: hasSheet || undefined` into `useCharacters()` (`app/characters/page.tsx:92-108`), and wires the sidebar toggle to `handlers.onHasSheetChange` (`app/characters/page.tsx:140-145`).
- `useCharacters` declares `hasSheet?: boolean` (`hooks/useCharacters.ts:13-29`), includes it in the React Query key (`hooks/useCharacters.ts:44-45`), and forwards it to `api.characters.getCharacters()` (`hooks/useCharacters.ts:46-59`).
- The API client serializes `hasSheet` into `/api/characters` params only when truthy (`lib/api/endpoints.ts:20-39`); the lower-level client appends non-null params to the URL (`lib/api/client.ts:84-104`).
- `app/api/characters/route.ts` delegates GET to the shared list handler (`app/api/characters/route.ts:6-12`). The handler parses `searchParams.get('hasSheet') === 'true'` (`lib/api/handlers/character-list.ts:31-50`) and forwards `hasSheet: hasSheet || undefined` to `getCharacters()` (`lib/api/handlers/character-list.ts:75-91`).
- `CharacterService.getCharacters()` does no transformation; it delegates directly to `repository.findMany(filters)` (`lib/services/character-service.ts:15-23`), and the exported helper calls that service method (`lib/services/character-service.ts:75-78`).

**Eliminated hypothesis:** the filter is not being dropped in URL state, the React hook, the client request, the route handler, or service forwarding.

#### 2. Exact repository predicate and why it matches no-sheet records
- `applyHasSheetFilter()` returns the query unchanged when `filters.hasSheet` is falsy, but when true it applies this Supabase/PostgREST OR predicate (`lib/repositories/character/character-query-repository.ts:135-146`):

```ts
query.or(
  'name.not.is.null,' +
  'str.not.is.null,' +
  'level.gt.1,' +
  'background_story.not.is.null'
)
```

- That string means any row with `name IS NOT NULL`, `str IS NOT NULL`, `level > 1`, or `background_story IS NOT NULL` can pass. `applyNonTraitFilters()` applies this after wallet/tab/search filters (`lib/repositories/character/character-query-repository.ts:188-196`). It is used both in the normal listing query before order/range (`lib/repositories/character/character-query-repository.ts:374-383`) and in token-constrained paths (`lib/repositories/character/character-query-repository.ts:293-303`).
- Import generation sets `sheet = token.get('sheet', {}) or {}` and `raw_metadata = token.get('rawMetadata', {}) or {}` (`scripts/generate_migration.py:92-94`), then sets `name = sheet.get('name') or raw_metadata.get('name')` (`scripts/generate_migration.py:113-114`). Therefore, no-sheet records with normal NFT metadata names can satisfy `name.not.is.null`.
- Missing sheet stats are defaulted: `clamp_stat()` returns `10` when a value is missing, and `str_val = clamp_stat(attributes.get('strength'))` uses that default (`scripts/generate_migration.py:116-124`). The generated INSERT writes `str_val` and other defaulted stats for each character row (`scripts/generate_migration.py:141-149`). Therefore, no-sheet records can satisfy `str.not.is.null`.
- Schema/migration defaults reinforce the same issue: generated `wagdie_characters` schema has `str INTEGER DEFAULT 10`, other core stats default `10`, `level INTEGER DEFAULT 1`, and `experience INTEGER DEFAULT 0` (`scripts/generate_migration.py:231-257`). The newer `characters` schema migration also adds `level DEFAULT 1`, `str/dex/con/int/wis/cha DEFAULT 10`, `hp/max_hp/ac DEFAULT 10`, and `speed DEFAULT 30` (`supabase/migrations/20251028000000_page_wireframes_schema.sql:59-109`).

**Conclusion:** the repository predicate is not a reliable `has sheet` predicate. `name.not.is.null` and especially `str.not.is.null` are expected to be true for many ordinary/no-sheet rows.

#### 3. Metadata/import evidence for a real sheet-vs-no-sheet distinction
- `scripts/generate_migration.py` preserves an imported sheet marker by copying raw metadata and adding `combined['sheet'] = sheet` only when `sheet` is truthy (`scripts/generate_migration.py:136-140`). That makes `metadata.sheet` the clearest imported-sheet signal in the generated import path.
- Local metadata sample with a sheet: `public/metadata/characters/10.json` has top-level `sheet` starting at line 4, including name, level, equipment, attributes, hit points, background story, and XP (`public/metadata/characters/10.json:1-26`).
- Local metadata sample without a sheet: `public/metadata/characters/2833.json` has a normal top-level NFT `name`, `image`, `tokenId`, and `attributes`, but no top-level `sheet` object (`public/metadata/characters/2833.json:1-71`). This sample would still feed `raw_metadata.name` into the DB `name` column via the import generator.
- A local count over `public/metadata/characters/*.json` found 6,667 JSON files, 1,564 with a truthy top-level `sheet`, and 5,103 without `sheet`; 5,102 of the no-sheet files still have a top-level `name`. This supports that top-level metadata names are common and not a sheet indicator.
- The older TS migration transformer only consolidates `name`, `imageUrl`, and `attributes` into metadata (`scripts/migration/src/services/transform-service.ts:312-337`), so there are multiple import paths and not all model `metadata.sheet` explicitly. Current operational code nevertheless reads `metadata.sheet` in at least one place by casting the metadata type (`lib/eliza/locationRooms/membership.ts:81-84`).
- `CharacterMetadata` currently documents sheet-like fields such as `level`, `hit_points`, `equipment`, `attributes`, and `background_story`, but does not model a nested `sheet` object (`types/character.ts:44-72`). That is a typing gap if `metadata.sheet` becomes the canonical imported-sheet marker.

#### 4. Product semantic ambiguity: imported sheet vs later customized sheet fields
- At investigation time, UI copy said the toggle meant “Show only characters with custom name, stats, level, or backstory,” not necessarily “has imported metadata.sheet” (`components/characters/SheetToggle.tsx:20-26`). The implementation fix later aligned this tooltip with imported-sheet semantics.
- The detail editor initializes from DB columns first and metadata fallbacks second (`hooks/useCharacterEditor.ts:97-122`). The update diff compares state against DB/metadata fallbacks and emits updates only for editable DB fields (`lib/domain/character/update-diff.ts:10-45`).
- PATCH update allow-list includes `background_story`, `equipment`, `name`, stats, HP/AC/speed, level, and experience, but excludes `metadata` (`lib/api/handlers/character-update.ts:27-32`, `lib/api/handlers/character-update.ts:96-103`). The repository update writes only the passed update object to the row (`lib/repositories/character/character-query-repository.ts:453-481`). Therefore, a user can later customize DB sheet fields without creating/updating `metadata.sheet`.
- Some sheet display checks also use stat-presence heuristics that default stats can satisfy: `CharacterSheetLayout` considers any core stat `> 0` as `hasCharacterSheet` and separately recognizes the all-10 default statline as placeholder (`components/characters/detail/CharacterSheetLayout.tsx:144-158`); `CharacterSheetPanel` uses the same `> 0` `hasCharacterSheet` test (`components/characters/detail/CharacterSheetPanel.tsx:52-61`); `SheetTitleAndAttributes` checks `str/dex/con > 0` (`components/characters/SheetTitleAndAttributes.tsx:72-80`).

**Ambiguity:** if product semantics mean “imported character sheet,” `metadata.sheet` is the likely marker. If semantics mean “imported sheet OR later user customization,” the system needs an explicit durable marker such as `has_sheet`, `sheet_created_at`, or a well-defined non-default/customization predicate; current `name`/`str` heuristics are not enough.

#### 5. Relevant tests and coverage gaps
- URL helper tests cover `hasSheet` parsing, URL building, active-filter detection, page changes preserving `hasSheet`, and clear-all behavior (`tests/hooks/useCharacterBrowseFilters.test.tsx:32-101`, `tests/hooks/useCharacterBrowseFilters.test.tsx:135-180`).
- API route tests cover `hasElizaProfile` forwarding (`tests/api/characters-route.test.ts:100-116`) but do not include an equivalent `?hasSheet=true` forwarding assertion.
- Repository tests are facade/delegation-focused (`tests/repositories/character-repository.test.ts`) and current search found no focused test for `CharacterQueryRepository.applyHasSheetFilter()` or the Supabase `.or()` predicate.
- No discovered regression test uses one sheet metadata fixture and one no-sheet metadata fixture to assert the intended `hasSheet` semantics or prevent `name.not.is.null` / `str.not.is.null` from being used as sheet evidence.

#### Final verdict
Hypothesis proven. The bug is not missing plumbing; it is backend predicate semantics. Current `hasSheet` reaches the repository, but the repository’s OR predicate can match no-sheet records because import/schema behavior populates/defaults the very fields used as evidence.


## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The filter may be dropped in UI/API state, or it may be forwarded correctly but mapped to a predicate that is true for most/all records.
**Findings:** Existing prior report points to backend repository predicate semantics rather than UI plumbing, but current code needs re-verification.
**Evidence:** `docs/investigations/has-sheet-filter-2026-05-18.md`.
**Conclusion:** No external web/docs research needed; proceed with workspace context discovery and pair investigation.

### Phase 2 - Context Builder / Initial Oracle Assessment
**Hypothesis:** Broad workspace discovery should reveal whether the filter is dropped before the backend or mishandled in query construction.
**Findings:** Context discovery selected the `/characters` page, filter hook/components, data hook, API client/handler, service/repository, import scripts, metadata samples, specs, and tests. The initial oracle assessment identified `applyHasSheetFilter()` as the most likely fault.
**Evidence:** Current selection includes `app/characters/page.tsx`, `hooks/useCharacterBrowseFilters.ts`, `hooks/useCharacters.ts`, `lib/api/handlers/character-list.ts`, `lib/repositories/character/character-query-repository.ts`, and `scripts/generate_migration.py`.
**Conclusion:** The investigation should focus on proving whether the repository predicate is true for no-sheet records.

### Phase 3 - Pair Investigator
**Hypothesis:** `hasSheet` reaches the repository, but `applyHasSheetFilter()` uses fields that are not reliable sheet markers.
**Findings:** Confirmed by independent trace. The pair appended detailed evidence under `## Investigator Findings`.
**Evidence:** UI/API forwarding is present at `hooks/useCharacterBrowseFilters.ts:71-102`, `app/characters/page.tsx:49-108`, `hooks/useCharacters.ts:13-59`, `lib/api/endpoints.ts:20-39`, and `lib/api/handlers/character-list.ts:31-91`. The repository predicate is at `lib/repositories/character/character-query-repository.ts:135-146`.
**Conclusion:** UI/API plumbing is eliminated as the root cause; backend predicate semantics are confirmed as the failure.

### Phase 4 - Spot Checks and Oracle Synthesis
**Hypothesis:** Import/metadata data proves ordinary no-sheet records satisfy the repository predicate.
**Findings:** Verified. Import generation falls back to raw metadata names and default stats, while only truthy source sheets are stored as `metadata.sheet`. Local metadata count confirms the distinction: 6,667 files total, 1,564 with top-level `sheet`, 5,103 without, and 5,102 no-sheet files still have top-level `name`.
**Evidence:** `scripts/generate_migration.py:92-149`; `public/metadata/characters/10.json:1-30`; `public/metadata/characters/2833.json:1-25`; read-only count run on `public/metadata/characters/*.json`.
**Conclusion:** `name.not.is.null` and `str.not.is.null` cannot be used as sheet evidence. `metadata.sheet` is the clearest imported-sheet marker, but product semantics need confirmation if later user customizations should also count.

## Root Cause
The root cause is `CharacterQueryRepository.applyHasSheetFilter()` using an invalid predicate for the product concept "has sheet". When `filters.hasSheet` is true, it applies:

```ts
query.or(
  'name.not.is.null,' +
  'str.not.is.null,' +
  'level.gt.1,' +
  'background_story.not.is.null'
)
```

Evidence: `lib/repositories/character/character-query-repository.ts:135-146`, invoked by `applyNonTraitFilters()` at `lib/repositories/character/character-query-repository.ts:188-196` and used in the main list query at `lib/repositories/character/character-query-repository.ts:374-383`.

That predicate matches ordinary no-sheet records because `scripts/generate_migration.py:113-149` sets `name` from `sheet.name || rawMetadata.name`, defaults missing stats such as `str` to `10`, and writes those values for every character row. The same import path only adds `combined['sheet'] = sheet` when a source `sheet` exists (`scripts/generate_migration.py:136-140`). Therefore, the true imported-sheet distinction is preserved in `metadata.sheet`, while `name` and stat nullability are polluted by display/default data.

## Recommendations
1. **Clarify product semantics before implementation.** The tooltip copy originally said "Show only characters with custom name, stats, level, or backstory" (`components/characters/SheetToggle.tsx:20-26`), which may mean more than imported metadata sheets. The immediate fix should align copy with imported-sheet semantics.
2. **If "Has Sheet" means imported source sheet only:** replace the repository predicate in `lib/repositories/character/character-query-repository.ts:135-146` with a `metadata.sheet` existence check, after verifying exact Supabase/PostgREST JSON-path syntax (for example, `query.not('metadata->sheet', 'is', null)` or equivalent). Update `types/character.ts` to model nested `metadata.sheet`, and update toggle copy to say imported character sheet data.
3. **If "Has Sheet" means imported sheet OR later user-customized fields:** add a durable marker such as `has_sheet boolean not null default false` or `sheet_created_at timestamptz`, backfill it from agreed criteria, index it, and set it during import/editor saves. Then filter with `query.eq('has_sheet', true)`.
4. **Avoid fragile interim predicates.** Do not use `name.not.is.null` or `str.not.is.null`. If a temporary fallback is unavoidable, use only meaningful non-default signals such as `metadata.sheet` existence, `background_story.not.is.null`, `level.gt.1`, `experience.gt.0`, or stat inequality checks against default `10`—but prefer an explicit marker.
5. **Add regression tests.** Add API forwarding coverage in `tests/api/characters-route.test.ts` for `?hasSheet=true`; add repository/query-builder coverage that the predicate uses the canonical marker and excludes `name.not.is.null`/`str.not.is.null`; add fixture-level semantic coverage using a `10`-style sheet metadata sample and a `2833`-style no-sheet sample.

## Preventive Measures
- Do not infer durable filter concepts from nullable/defaulted display columns.
- For new filters, add tests at each layer: URL/controller, API forwarding, repository predicate, and representative data fixtures.
- Keep UI copy and backend semantics aligned.
- Prefer explicit indexed read-model flags for high-use boolean filters.
- Document the import/backfill rule that defines "has sheet" and keep TypeScript metadata types in sync with JSON fields used by query logic.

## Remaining Evidence Gaps Before Implementation
- Verify exact Supabase/PostgREST JSON path syntax for checking `metadata.sheet` existence.
- Decide whether user-created/customized sheet-like fields should count even if no imported `metadata.sheet` exists.
- Confirm which import path is authoritative for production data before relying solely on `metadata.sheet`; the older TS transformer does not clearly preserve nested `sheet` the same way.
