# Gameplay Earnings and Stats: Plan

## Goal
Plan an extension to the Eliza location-room gameplay system so character stats feed gameplay mechanics and dead characters can earn performance-based token/concord rewards through an off-chain claim ledger. V1 should calculate a balanced performance score at gameplay death, store a pending reward claim, and release it only through the existing admin-gated death/finality flow.

## Background
- User decisions for this plan: gameplay stats should use existing editable character stat fields as the primary source; traits/concords/searing can act as deterministic modifiers; death-time earnings should be calculated as a pending reward at gameplay death; V1 reward asset should be an off-chain claim ledger rather than immediate on-chain transfer; performance should use a balanced score across combat, assists, survival, objectives, noncombat success, and difficulty.
- Canonical character gameplay fields already exist on `characters`: `str/dex/con/int/wis/cha`, `hp/max_hp/ac/speed`, `level/experience`, and `equipment`. They are defined in the page-wireframes schema with stat bounds and `hp <= max_hp` (`supabase/migrations/20251028000000_page_wireframes_schema.sql:50-140`).
- Character types expose the same DB fields on `Character`, `EditableCharacterFields`, `CharacterUpdate`, `Equipment`, and metadata fallbacks (`types/character.ts:9-35`, `types/character.ts:38-75`, `types/character.ts:91-103`).
- Character reads flow through `CharacterService.getCharacter()` / `getCharacters()` (`lib/services/character-service.ts:17-29`) and `CharacterQueryRepository.findById()` / `findMany()` (`lib/repositories/character/character-query-repository.ts:326-413`). Updates are allowlisted and validated in `lib/api/handlers/character-update.ts:52-170`.
- The character editor already treats DB stat columns as source of truth after saves and uses defaults for missing values (`hooks/useCharacterEditor.ts:87-113`, `hooks/useCharacterEditor.ts:237-249`); `lib/domain/character/update-diff.ts:7-44` builds PATCH diffs from those DB fields.
- Existing NFT metadata traits are display/filter inputs, not canonical gameplay stats. `extractNFTTraits()` categorizes identity/equipment/cosmetic traits from metadata (`lib/utils/nft-traits.ts:14-31`, `lib/utils/nft-traits.ts:40-58`), and character list filters apply metadata containment checks (`lib/repositories/character/character-query-repository.ts:37-60`, `lib/repositories/character/character-query-repository.ts:136-179`).
- Searing derives visual/trait transformations from Concord metadata and WAGDIE NFT traits, especially `Alignment`, through layer resolver logic (`lib/domain/searing/searing-layer-resolver.ts:64-94`, `lib/domain/searing/searing-layer-resolver.ts:180-213`).
- Tokens of Concord ownership is indexed in `concord_transfers`, which stores token id, addresses, amount, transaction hash, block/log indexes, mint/burn flags, and metadata (`supabase/migrations/20251231200000_concord_transfers.sql:5`). Wallet-facing ownership is exposed by `/api/concords/owned`, which reconstructs balances from indexed transfers and falls back to on-chain `tokensOfConcord.balanceOfBatch` (`app/api/concords/owned/route.ts:21-202`).
- Character Concord read models live in `concords` and `character_concords`, with `quantity`, `is_seared`, and `seared_at` (`supabase/migrations/20251028000000_page_wireframes_schema.sql:10`, `supabase/migrations/20251028000000_page_wireframes_schema.sql:27`; `types/character.ts:103`, `types/character.ts:113`). Character details read joined concord rows through `lib/repositories/character/character-query-repository.ts:468`.
- Searing events are recorded in `searing_events` with WAGDIE token id, Concord id, event type, transaction/log fields, actor address, metadata, and materialization fields (`supabase/migrations/20251231000000_searing_events.sql:4`, `supabase/migrations/20260413000000_concord_searing_maps.sql:73`). The indexer decodes `ConcordSeared` and writes `searing_events` (`scripts/indexer/searing-event-handler.ts:107-185`).
- Searing materialization verifies/sees on-chain events, loads character and concord map data, resolves layers, uploads images, updates character searing read model, marks `character_concords` as seared, and completes materialization (`lib/services/searing-materialization-service.ts:268-442`).
- Blockchain/concord service extension points include the `tokensOfConcord` address (`lib/contracts/addresses.ts:14`, `lib/contracts/addresses.ts:24`), concord approval/balance/searing methods (`lib/services/blockchain/searing.ts:221`, `lib/services/blockchain/searing.ts:319`, `lib/services/blockchain/searing.ts:409-464`), and the Concord transfer indexer (`scripts/indexer/concord-transfer-handler.ts:130`, `scripts/indexer/concord-transfer-handler.ts:272`).
- Current gameplay persistence tables include `eliza_location_room_gameplay_states`, `eliza_location_room_gameplay_encounters`, `eliza_location_room_gameplay_turns`, and `eliza_location_room_gameplay_death_reviews` (`supabase/migrations/20260522020000_create_location_room_gameplay.sql:5`, `supabase/migrations/20260522020000_create_location_room_gameplay.sql:26`, `supabase/migrations/20260522020000_create_location_room_gameplay.sql:62`, `supabase/migrations/20260522020000_create_location_room_gameplay.sql:94`).
- Runtime gameplay types include room state, encounter state, turn state, dice results, reward plan, and death review (`lib/eliza/locationRooms/gameplay/types.ts:4-142`). `GameplayCharacterState` currently models HP, max HP, status, XP, temporary boons, and wounds (`lib/eliza/locationRooms/gameplay/types.ts:28`).
- Gameplay mechanics are server-side in `resolveGameplayTurnMechanics()` (`lib/eliza/locationRooms/gameplay/rules.ts:540` / `lib/eliza/locationRooms/gameplay/rules.ts:547-681`). `GameplayTurnMechanicalDeltas` captures action roll, damage, healing, retaliation, before/after character and monster state, deaths, reward assignments, encounter status, and round data (`lib/eliza/locationRooms/gameplay/rules.ts:75-90`).
- Gameplay rewards currently apply on victory to living/non-fled characters only (`lib/eliza/locationRooms/gameplay/rules.ts:633-655`; `lib/eliza/locationRooms/gameplay/coordinator.ts:502-543`). Public gameplay summaries expose only pending reward text/boons/narrative rewards, not XP (`lib/eliza/locationRooms/service.ts:208-212`).
- Gameplay deaths already create pending admin-reviewed death records (`lib/eliza/locationRooms/gameplay/coordinator.ts:500-519`; `tests/lib/eliza/location-room-gameplay-coordinator.test.ts:536-553`). `createPendingDeathReview()` stores death context and metadata (`lib/eliza/locationRooms/gameplay/repository.ts:514-548`). Admin outcomes include `reject_death`, `gameplay_only`, and `approve_finality`, with `approve_finality` setting `burnSyncStatus: 'pending'` without performing burns (`lib/eliza/locationRooms/gameplay/adminService.ts:10-14`, `lib/eliza/locationRooms/gameplay/adminService.ts:135-185`).
- Admin gameplay inspection exposes full recent turns including action, dice, and mechanical deltas (`app/api/admin/eliza/location-rooms/[locationId]/gameplay/route.ts:25-38`, `lib/eliza/locationRooms/gameplay/adminService.ts:99-129`, `app/api/admin/eliza/gameplay/shared.ts:80-119`). Public exposure is intentionally banded and private (`lib/eliza/locationRooms/types.ts:83-111`, `lib/eliza/locationRooms/service.ts:143-212`).
- Prior art confirms stats/equipment are already part of `/api/characters/{tokenId}` (`specs/015-character-stats-equipment/contracts/character-api.yaml:11-15`, `specs/015-character-stats-equipment/contracts/character-api.yaml:54-121`) and that imports/defaults can populate missing stats as defaults, so default stats alone do not prove a custom sheet (`docs/investigations/has-sheet-filter-2026-05-18.md:45-57`).
- Prior D&D gameplay plan deliberately limited V1 rewards to gameplay-local XP/boons/narrative rewards and avoided token metadata, balances, inventory, and on-chain writes (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:130-132`). No prior claim ledger, token earnings, or claimable balance domain was found in checked docs/plans/specs/investigations.

## Approach

### Current answer: stats are not yet pulled into gameplay
The current location-room gameplay implementation does **not** use the editable character stats yet. `DefaultLocationRoomGameplayCoordinator` currently initializes gameplay characters with fixed `hp/maxHp = 10`, `xp = 0`, empty boons/wounds, and status-only state; `GameplayCharacterState` does not carry `str/dex/con/int/wis/cha`, `ac`, `speed`, `level`, `equipment`, trait sources, Concord/searing modifiers, or performance counters. `resolveGameplayTurnMechanics()` currently resolves mechanics from action type, difficulty, dice, monster state, and stored gameplay HP/status.

The plan should add stat-aware gameplay as an additive extension: hydrate existing DB stats into gameplay state, apply deterministic bounded modifiers from equipment/NFT traits/seared Concord context, expand rules to use effective stats, track performance counters, and create a pending off-chain reward claim when gameplay death occurs.

### Recommended architecture
Add four focused subsystems under `lib/eliza/locationRooms/gameplay/`:

1. **Character sheet resolver** — batch-hydrates canonical character stats/equipment/metadata/concord context by token id and produces normalized gameplay sheet snapshots.
2. **Modifier resolver** — applies deterministic bounded modifiers after DB stats. Priority is DB stats → equipment → NFT trait modifiers → seared Concord modifiers. GM/plugin output never modifies authoritative stats or rewards.
3. **Performance/reward engine** — updates per-character performance counters every turn, calculates death-time score and reward line items, and creates a pending claim linked to the death review.
4. **Reward claim ledger/admin surface** — persists claim rows, lets admin finality decisions update claim status, and keeps public room reads private while allowing admin inspection in V1. Owner-facing claim reads are a follow-up once claim presentation and eventual claim mechanics are designed.

Keep membership eligibility separate from stat hydration. Location-room membership should continue deciding who is present/eligible; gameplay should separately resolve stats for those token ids.

### Stat hydration model
Extend `GameplayCharacterState` in backward-compatible JSON form with:

- `sourceStats`: canonical DB stats at snapshot time (`str/dex/con/int/wis/cha`, `ac`, `speed`, `level`, `experience`).
- `effectiveStats`: source stats plus deterministic bounded modifiers, including effective `maxHp`.
- `equipmentSnapshot`: existing `Equipment` JSON or null.
- `modifierSources`: source/key/value/label records for auditability.
- `performance`: balanced counters used by the death reward score.
- `sheetSnapshotAt`: timestamp for stat refresh auditing.

First creation rules:
- `maxHp` from `characters.max_hp`, default `10`.
- current gameplay `hp` from `characters.hp` if valid, otherwise `maxHp`.
- core stats default to `10`; `ac` defaults to `10`; `speed` defaults to `30`; `level` defaults to `1`; `experience` defaults to `0`.

Reconciliation rules:
- Refresh source stats, effective stats, equipment, and modifier sources.
- Do not reset gameplay-local HP, death state, wounds, boons, or gameplay XP.
- If effective `maxHp` changes, update max HP and clamp current HP down if needed; do not heal automatically.
- Old gameplay rows lacking stat fields should be enriched on the next reconciliation.

### Stat-aware mechanics
Move roll modifiers from fixed constants to effective stats.

Recommended action-to-stat mapping:

| Action | Primary stat |
|---|---|
| `attack` | max(`str`, `dex`) |
| `defend` | max(`dex`, `con`) |
| `help` | `cha` |
| `investigate` | max(`int`, `wis`) |
| `negotiate` | `cha` |
| `flee` | `dex` |
| `rest` | `con` |

Stat modifier formula:

```text
modifier = clamp(floor((stat - 10) / 2), -5, +5)
```

`deriveActionRollPlan()` should accept actor effective stats and modifier sources. `resolveActionRoll()` should use the mapped stat modifier, bounded equipment/trait/Concord action modifiers, and the existing difficulty-derived DC. Monster retaliation should roll against actor `effectiveStats.ac`; attack damage and rest healing may add positive stat modifiers while staying capped and deterministic.

### Deterministic modifier rules
Add a backend-only modifier resolver with bounded V1 constants. The numbers below are default config candidates, not hard-coded forever balance; implementations should keep them centralized under gameplay config/rules so they can be tuned without changing prompts or GM behavior.

```text
max equipment modifier per roll: +1
max NFT trait modifier per roll: +1
max seared Concord modifier per roll: +1
max total non-stat modifier per roll: +2
max effective AC bonus from modifiers: +2
```

Recommended V1 source rules:
- DB stats are primary and bounded by existing stat validation.
- Equipment JSON: default V1 constants may treat any weapon entry as `+1 attack` and any armor entry as `+1 ac`; item entries only affect actions through an allowlisted helper registry.
- NFT traits: only recognized trait types are considered (`Armor`, `Back`, `Mask`, `Weapon`, `Alignment`); modifiers are allowlisted and generic, not freeform by trait value.
- Concord/searing: unseared Concords do not modify gameplay in V1. Seared Concords may modify gameplay only from `character_concords.is_seared` joined to structured `concords` effect data (`effect_type`, effect value/metadata where present) or an explicit concord-id allowlist in gameplay config. If no structured effect or allowlist entry exists, the Concord contributes no modifier. All Concord modifiers are capped and recorded in `modifierSources`.

### Performance scoring and death rewards
Add `GameplayPerformanceCounters` to each character state and update them after every resolved turn. Counters should derive only from backend mechanical deltas, not GM freeform ratings. Until explicit objective tags exist, “objective contribution” should be derived from successful help/investigate/negotiate actions and victory participation rather than a subjective GM score. Counters should cover:

- rounds acted and survived;
- damage dealt and taken;
- successful attacks, defends, helps, and noncombat actions;
- objective contributions;
- critical successes/failures;
- fled count.

At gameplay death, calculate a reward exactly once using versioned V1 weights:

```text
combat = min(30, damageDealt * 2 + successfulAttacks * 4)
assist = min(20, successfulHelps * 6 + successfulDefends * 3)
survival = min(20, roundsSurvived * 2)
objective = min(15, objectiveContributions * 5)
noncombat = min(10, successfulNoncombatActions * 4)
critical = min(10, criticalSuccesses * 5) - min(10, criticalFailures * 5)
penalty = min(15, fledCount * 10)

rawScore = combat + assist + survival + objective + noncombat + critical - penalty
finalScore = clamp(round(rawScore * difficultyMultiplier), 0, 100)
```

These weights are policy constants under `death-rewards-v1`; changes should produce a new policy version rather than rewriting historical claims.

V1 reward denomination is fixed for this plan: every pending claim receives off-chain `gameplay_reward_points`, and high-performing deaths may additionally receive an off-chain `erc1155_concord_entitlement` line item if a Concord tier is configured. This is still a claim ledger entry, not an on-chain transfer.

Line item shape should be explicit:

```ts
type GameplayRewardClaimLineItem =
  | { assetType: 'gameplay_reward_points'; amount: number }
  | {
      assetType: 'erc1155_concord_entitlement'
      chainId: number
      contractAddress: string
      concordId: number
      amount: number
    }
```

Concord/token entitlement is tiered and optional via config:

- score `< 50`: points only;
- score `50–79`: points + minor configured Concord entitlement if configured;
- score `80+`: points + higher configured Concord entitlement if configured.

No on-chain transfer occurs in V1. The claim ledger is the product boundary.

### Claim ledger and finality gating
Add `eliza_location_room_gameplay_reward_claims`, one row per death review. Store room/location/encounter/turn/death review ids, token id, immutable beneficiary wallet, beneficiary source, claim status, performance score/breakdown, line items, policy version, release metadata, claim metadata, bounded errors, and timestamps.

Beneficiary authority for V1 is the death-time gameplay participant wallet snapshot: use `staker_address` when present, otherwise `owner_address`. Later ownership transfers do not change the claim beneficiary; current owners may get read visibility only if a later endpoint allows it, but release authority remains tied to the death-time beneficiary.

Recommended V1 statuses:
- `pending_review`
- `released`
- `rejected`
- `voided`

Admin outcome mapping:

| Admin death outcome | Claim behavior |
|---|---|
| `reject_death` | `pending_review` → `rejected`; character playability is restored through existing admin override behavior. |
| `gameplay_only` | `pending_review` → `voided` with metadata reason `gameplay_only_no_token_finality`; no token/Concord release. |
| `approve_finality` | `pending_review` → `released`; records admin wallet and release timestamp; no on-chain transfer. |

Public room reads should not expose raw performance, line items, or claim data. V1 exposes claim details through admin death-review/gameplay inspection surfaces first. Owner-visible claim reads are a follow-up once claim presentation and eventual claim/transfer mechanics are designed; the ledger still stores immutable beneficiary wallet data now so that future endpoint has a safe authority source.

## Work Items

### Item 1 — Add stats/reward config gates
**Goal:** Add safe rollout controls for stat-aware mechanics and death reward claims.

**Done when:**
- `elizaConfig.locationRooms.gameplay.stats` includes `enabled`, `refreshSheetOnReconcile`, and modifier caps.
- `elizaConfig.locationRooms.gameplay.deathRewards` includes `enabled`, `policyVersion`, points multiplier/cap, difficulty multipliers, and optional Concord entitlement tier config.
- Defaults preserve current gameplay behavior unless explicitly enabled.
- Gameplay remains functional with legacy fixed stats when gates are off.

**Key files:**
- `lib/eliza/config.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`

**Dependencies:** None

**Size:** S

### Item 2 — Add gameplay character sheet resolver
**Goal:** Hydrate existing canonical character stats/equipment/metadata for gameplay participants.

**Done when:**
- A resolver loads character rows by token id in batch.
- Missing stats normalize to existing editor/schema defaults.
- Resolver output includes source stats, equipment, metadata traits, seared Concord context from `character_concords`/`concords`, and owner/staker wallet at snapshot time.
- Gameplay code does not extend membership eligibility with stat responsibilities.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/characterSheetResolver.ts`
- `lib/repositories/character/character-query-repository.ts`
- `types/character.ts`
- `lib/services/character-service.ts`

**Dependencies:** Item 1

**Size:** M

### Item 3 — Add deterministic gameplay modifier resolver
**Goal:** Convert equipment, NFT traits, and seared Concord context into bounded backend-owned modifiers.

**Done when:**
- New modifier module applies DB stats first, then bounded modifiers.
- Modifier sources are recorded with source/key/value/label.
- Unrecognized traits/equipment/concords are ignored, not treated as freeform modifiers.
- Seared Concord modifiers only apply from existing read models, not GM/plugin output.
- Total non-stat bonuses are capped.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/modifiers.ts`
- `lib/utils/nft-traits.ts`
- `lib/domain/searing/searing-layer-resolver.ts`
- `lib/repositories/character/character-query-repository.ts`
- `types/character.ts`

**Dependencies:** Item 2

**Size:** M

### Item 4 — Extend gameplay character state with sheet snapshots and performance counters
**Goal:** Store stat snapshots and counters in existing gameplay state JSON without breaking old rows.

**Done when:**
- `GameplayCharacterState` includes source stats, effective stats, modifier sources, equipment snapshot, sheet snapshot timestamp, and performance counters.
- Old gameplay state rows without these fields still parse and are enriched on next reconciliation.
- Reconciliation refreshes stats/modifiers but does not reset gameplay-local HP/death state.
- Existing public room summaries remain compatible and HP bands still work.

**Key files:**
- `lib/eliza/locationRooms/gameplay/types.ts`
- `lib/eliza/locationRooms/gameplay/repository.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/service.ts`

**Dependencies:** Items 2–3

**Size:** M

### Item 5 — Make rules stat-aware
**Goal:** Use effective character stats in roll plans, AC checks, damage, healing, and death resolution.

**Done when:**
- `resolveGameplayTurnMechanics()` consumes actor effective stats.
- Action roll modifiers use the configured action-to-stat mapping.
- Monster retaliation rolls against character AC.
- Damage/healing include bounded stat contributions.
- Mechanical deltas include stat/modifier inputs used for admin audit.
- Existing tests are updated for deterministic stat-aware expectations.

**Key files:**
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/locationRooms/gameplay/dice.ts`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`

**Dependencies:** Item 4

**Size:** M

### Item 6 — Add performance tracking engine
**Goal:** Track balanced per-character gameplay contribution over time.

**Done when:**
- New performance module updates counters from each turn’s mechanical deltas.
- Counters cover combat, assists, survival, objective/noncombat contribution, criticals, failures, and damage taken.
- Coordinator persists updated counters after every resolved turn.
- Admin turn inspection can show performance counter changes.
- Public room reads do not expose raw performance counters.

**Key files:**
- New `lib/eliza/locationRooms/gameplay/performance.ts`
- `lib/eliza/locationRooms/gameplay/rules.ts`
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `app/api/admin/eliza/gameplay/shared.ts`
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`

**Dependencies:** Item 5

**Size:** M

### Item 7 — Add reward claim ledger schema
**Goal:** Persist death-time pending token/Concord reward claims off-chain.

**Done when:**
- Migration creates `eliza_location_room_gameplay_reward_claims`.
- Claims are service-role-only with RLS mirroring gameplay tables.
- Each death review has at most one reward claim.
- Claim rows store score, breakdown, line items, policy version, status, release metadata, immutable beneficiary wallet, and beneficiary source.
- Existing databases with no claims remain valid.

**Key files:**
- New `supabase/migrations/*_create_location_room_gameplay_reward_claims.sql`
- `supabase/migrations/20260522020000_create_location_room_gameplay.sql`

**Dependencies:** Item 6

**Size:** M

### Item 8 — Add reward claim types and repository methods
**Goal:** Provide typed access to the claim ledger.

**Done when:**
- Types cover claim status, line item shape, scoring breakdown, and create/update/list inputs.
- Repository can create/reuse claim by death review id.
- Repository can update claim status for admin outcomes.
- Repository supports admin listing by status, location, token id, and review id.
- Stored errors are bounded like existing gameplay errors.

**Key files:**
- `lib/eliza/locationRooms/gameplay/types.ts`
- `lib/eliza/locationRooms/gameplay/repository.ts`
- New optional `lib/eliza/locationRooms/gameplay/rewardClaims.ts`

**Dependencies:** Item 7

**Size:** M

### Item 9 — Calculate pending death rewards at gameplay death
**Goal:** Create a pending reward claim exactly when immediate gameplay death creates a pending death review.

**Done when:**
- Coordinator calculates death reward for each newly dead token.
- Coordinator creates/reuses the pending death review first, then creates/reuses a linked reward claim.
- Death retry is idempotent and does not duplicate claims.
- Claim line items never trigger on-chain transfers.
- Death review context includes the reward claim id and score summary.

**Key files:**
- `lib/eliza/locationRooms/gameplay/coordinator.ts`
- `lib/eliza/locationRooms/gameplay/performance.ts`
- `lib/eliza/locationRooms/gameplay/repository.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`

**Dependencies:** Items 6–8

**Size:** M

### Item 10 — Gate claim release through admin death review outcomes
**Goal:** Tie reward release to the existing admin finality flow.

**Done when:**
- `reject_death` restores playability and marks linked claim `rejected`.
- `gameplay_only` keeps death gameplay-only and marks linked token/Concord claim `voided`.
- `approve_finality` marks linked claim `released` and records admin wallet/released timestamp.
- No route performs token burns or on-chain reward transfers.
- Admin responses include claim summaries.

**Key files:**
- `lib/eliza/locationRooms/gameplay/adminService.ts`
- `app/api/admin/eliza/gameplay/deaths/[reviewId]/route.ts`
- `app/api/admin/eliza/gameplay/shared.ts`
- `tests/lib/eliza/location-room-gameplay-admin-service.test.ts`
- `tests/api/admin-eliza-gameplay-routes.test.ts`

**Dependencies:** Item 9

**Size:** M

### Item 11 — Add claim summaries to admin death/gameplay inspection
**Goal:** Let admins inspect pending/released/voided reward claims through the existing gameplay/death review surfaces without creating a separate reward-browsing product in V1.

**Done when:**
- Admin death review responses include linked claim summary, performance score, policy version, status, beneficiary wallet/source, and line items.
- Admin room gameplay inspection can include recent claim summaries related to inspected turns/deaths.
- Raw internal errors remain bounded.
- APIs remain read-only for claims except status changes driven by death review outcomes.

**Key files:**
- `app/api/admin/eliza/gameplay/deaths/route.ts`
- `app/api/admin/eliza/gameplay/deaths/[reviewId]/route.ts`
- `app/api/admin/eliza/location-rooms/[locationId]/gameplay/route.ts`
- `app/api/admin/eliza/gameplay/shared.ts`
- `lib/eliza/locationRooms/gameplay/adminService.ts`
- `tests/api/admin-eliza-gameplay-routes.test.ts`

**Dependencies:** Item 10

**Size:** S

### Item 12 — Update prompts/plugin with stat context, advisory only
**Goal:** Let agents see relevant gameplay stats while keeping backend mechanics authoritative.

**Done when:**
- Gameplay action prompt includes visible HP band/status and safe stat flavor, not private scoring internals.
- GM outcome prompt may include backend-computed stat-aware summaries.
- ElizaOS gameplay plugin text says stats/rewards are backend-authoritative.
- No plugin/action output can assign stats, rewards, death, or claim status.

**Key files:**
- `lib/eliza/locationRooms/gameplay/actionGenerator.ts`
- `lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator.ts`
- `services/elizaos/src/wagdie-gameplay-plugin.ts`
- `tests/services/elizaos-gameplay-plugin.test.ts`

**Dependencies:** Items 5–10

**Size:** S

### Item 13 — Add rollout and regression tests
**Goal:** Verify stat hydration, modifiers, scoring, claims, and admin gating are deterministic and private.

**Done when:**
- Unit tests cover stat defaults, stat modifiers, modifier caps, AC retaliation, performance score tiers, and reward line item generation.
- Coordinator tests cover death claim creation, retry idempotency, old state enrichment, and no claim release before admin finality.
- Admin tests cover reject/gameplay-only/approve-finality claim transitions.
- Public room tests verify no raw claim/performance/dice data leaks.
- Existing gameplay tests still pass with stats gates disabled.

**Key files:**
- `tests/lib/eliza/location-room-gameplay-rules.test.ts`
- `tests/lib/eliza/location-room-gameplay-coordinator.test.ts`
- `tests/lib/eliza/location-room-gameplay-admin-service.test.ts`
- `tests/api/admin-eliza-gameplay-routes.test.ts`
- Admin route tests covering claim summaries on death review/gameplay inspection responses

**Dependencies:** Items 1–12

**Size:** L

## Risks and Migration
- Existing gameplay JSON rows lack stats/performance fields. New parsing must treat them as old-state rows and enrich on next tick.
- Stat refresh must not resurrect dead characters or reset gameplay HP.
- Reward claims must be idempotent by `death_review_id`; retries after death review creation must not duplicate rewards.
- Concord entitlement IDs are configurable because no canonical gameplay reward Concord pool exists yet.
- Public APIs should remain minimal; detailed scores, claims, and line items belong in admin surfaces for V1. Owner-visible reads are a follow-up after claim presentation is designed.

## Clarifications Before Build
- New Concord reward IDs will be created later; V1 should keep Concord entitlement tiers configurable/TBD and still create `gameplay_reward_points` claims so the scoring/ledger flow can be proven now.
- Owner-visible claiming is intentionally deferred. V1 should focus on stat-aware gameplay, death-time pending claims, and admin-gated release/void/reject behavior.

## Orchestration Progress
- [x] Wave 1 — Stats foundation: Items 1–4 implemented (stats/deathReward config, character sheet resolver, modifier resolver, enriched gameplay state) and targeted tests passed per agent report.
- [x] Wave 2 — Stat-aware mechanics/performance: Items 5–6 implemented (stat-aware rolls/AC/damage/healing, performance counters, audit deltas) and targeted tests passed per agent report.
- [x] Wave 3 — Claim ledger/admin release flow: Items 7–11 implemented (service-only reward claims, death-time claim creation, admin outcome transitions, admin claim summaries) and targeted tests passed per agent report.
- [x] Wave 4 — Prompts and validation: Items 12–13 implemented; focused gameplay rules/coordinator/admin routes/service/plugin regression suite passed, `git diff --check` passed, and full lint has only unrelated pre-existing failures outside touched stats/claims/plugin files.

## Open Questions
- Which concrete Concord ids should be configured for the 50–79 and 80+ score entitlement tiers once new Concords exist?
- What should the eventual owner-visible on-chain claim/transfer workflow look like after V1 proves the off-chain ledger?

## References
- `docs/plans/eliza-interactive-dnd-game-2026-05-22.md`
- `specs/015-character-stats-equipment/contracts/character-api.yaml`
- `docs/investigations/has-sheet-filter-2026-05-18.md`
- `docs/database-schema.md`
- `docs/investigations/searing-image-generation-2026-05-08.md`
- `docs/plans/admin-panel-workflows-2026-05-09.md`
