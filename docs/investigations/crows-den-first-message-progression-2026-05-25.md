# Investigation: Crow's Den First GM Message and Tick Progression

## Summary
Crow's Den ticks are completing successfully, but the GM beat contract allows product-invalid character-only narrative beats: `publicNarration` may be null, the coordinator skips the `game_master` message in that case, and the service still completes the tick after the character response. Story progression is structurally valid but weak because `story` / `combatReadiness='none'` / `threatLevel=0` remains valid indefinitely as long as objective/open-thread fields exist.

## Symptoms
- Story does not advance naturally on ticks after restart.
- The Game Master did not send the first message for the restarted adventure.

## Background / Prior Research
- Dev server checkout is `332fec60 fix: harden crows den progression`, with the latest migration applied.
- Current Crow's Den room (`location_id='11'`, room `0fccb62c-acd6-481c-9548-0b9241b0b3c1`) has `tick_enabled=true`, `tick_count=3`, no room `last_error`, `next_tick_at=2026-05-25 08:21:07 UTC`.
- Runtime rows after reset/restart: 3 completed ticks, 3 completed narrative beats, 3 public messages, 1 narrative state, and no gameplay state/run/encounter/turn rows.
- All 3 ticks completed successfully with `turn_intent='auto'`; the first was scheduled, the next two were admin-triggered. No tick had `last_error`.
- All 3 public messages are `author_kind='agent'` character reactions. There are **zero `game_master` public messages**.
- All 3 narrative beats have `status='completed'`, accepted GM generation metadata, non-empty `speaker_instruction`, and structurally valid `state_after`, but `public_narration` is empty/null for every beat. This directly explains the missing first GM message.
- Narrative state is progressing structurally (`current_objective` and `open_threads` exist), but it remains `ttrpgPhase='story'`, `combatReadiness='none'`, `threatLevel=0`, `requestedGameplayAction=null`, and `lastEncounterSeed=null` after three ticks. This matches the report that ticks do not feel like story escalation/progression.
- Recent app logs after schema cache reload show no new location-room errors; the old `turn_intent` schema-cache error appeared in logs but did not recur in the latest post-reload window.

## Investigator Findings
<!-- Pair investigator appends structured findings here. -->

### 2026-05-25 Code-path verification

**Root cause:** the missing first/public Game Master message happens before API/UI projection. The GM beat contract explicitly allows `publicNarration` to be null, normalization accepts it, `narrativeCoordinator` skips the GM append when it is null, and `LocationRoomService` still completes the narrative tick once the character reaction is appended. The weak progression symptom is likewise allowed by the progression contract: non-aftermath beats need only a `currentObjective` and at least one `openThreads` entry; `ttrpgPhase='story'`, `combatReadiness='none'`, and `threatLevel=0`/null are valid forever unless the model chooses foreshadow/ready/start_combat.

**Evidence:**
- Public narration is optional by type and prompt: `GameMasterBeatOutput.publicNarration` is `string | null` (`lib/eliza/locationRooms/gameMasterGenerator.ts:56-59`), the prompt contract says `"publicNarration": "optional public narration for observers, or null"` (`lib/eliza/locationRooms/gameMasterGenerator.ts:401-404`), and normalization uses `parseOptionalString(...)` for `publicNarration` after validation (`lib/eliza/locationRooms/gameMasterGenerator.ts:341-346`). Beat storage types also allow null/optional public narration (`lib/eliza/locationRooms/narrativeTypes.ts:42-49`, `lib/eliza/locationRooms/narrativeTypes.ts:76-80`).
- The progression validator does not require public narration and only checks non-aftermath `currentObjective`/`openThreads`; `combatReadiness='none'` has no minimum threat or escalation requirement (`lib/eliza/locationRooms/gameMasterGenerator.ts:194-230`). Defaults normalize missing phase/readiness to `story`/`none`, and threat to null (`lib/eliza/locationRooms/narrativeTypes.ts:122-143`, `lib/eliza/locationRooms/narrativeTypes.ts:164-177`).
- The GM append is conditional on public narration: `shouldAppendGameMasterMessage` returns false when `!output.publicNarration` (`lib/eliza/locationRooms/narrativeCoordinator.ts:210-212`). When narration exists, the appended GM message is public and `authorKind: 'game_master'` (`lib/eliza/locationRooms/narrativeCoordinator.ts:288-304`).
- Character-only beats are valid by coordinator/service code: the coordinator always proceeds to generate and append the selected character reaction after the optional GM append (`lib/eliza/locationRooms/narrativeCoordinator.ts:327-356`), then updates state/completes the beat (`lib/eliza/locationRooms/narrativeCoordinator.ts:358-380`). The service only requires `narrativeResult.messageId` and then marks the tick completed (`lib/eliza/locationRooms/service.ts:1501-1524`). This matches the live evidence of completed ticks/beats with agent-only messages and null public narration (`docs/investigations/crows-den-first-message-progression-2026-05-25.md:13-20`).
- Public API/UI is not hiding public GM messages: the public route returns `locationRoomService.getPublicRoom(...)` directly (`app/api/eliza/location-rooms/[locationId]/route.ts:12-20`); `getPublicRoom` loads `listPublicMessages` and maps all messages via `toPublicMessage` (`lib/eliza/locationRooms/service.ts:487-540`); `listPublicMessages` filters only `visibility='public'`, not `author_kind` (`lib/eliza/locationRooms/repository.ts:789-802`); `toPublicMessage` preserves `authorKind`, `authorName`, and `content` (`lib/eliza/locationRooms/service.ts:258-279`). The UI fetch hook stores the returned `PublicLocationRoomRead` without message filtering (`hooks/usePublicLocationRoom.ts:66-85`), transcript maps all `roomData.messages` (`components/location-rooms/EncounterTranscript.tsx:11-40`), and message cards explicitly render `authorKind === 'game_master'` as Game Master (`components/location-rooms/EncounterMessageCard.tsx:45-59`).
- Tests encode the current permissive behavior: the narrative coordinator fixture defaults `publicNarration: null` (`tests/lib/eliza/location-room-narrative-coordinator.test.ts:130-142`); the happy path with narration expects GM then character appends (`tests/lib/eliza/location-room-narrative-coordinator.test.ts:240-310`); retry after GM append expects only the character append (`tests/lib/eliza/location-room-narrative-coordinator.test.ts:338-376`); and a mocked `publicNarration: null` beat still returns `{ selectedTokenId: 1, messageId: 'msg-character' }` and appends only the agent message (`tests/lib/eliza/location-room-narrative-coordinator.test.ts:532-573`). Service tests likewise mock narrative completion as only `{ selectedTokenId: 1, messageId: 'msg-character' }` and still expect the tick completed (`tests/api/eliza/location-room-service.test.ts:1617-1648`).
- Combat remains explicitly gated: auto ticks only build a gameplay encounter trigger from narrative state when `requestedGameplayAction === 'start_combat'` and there is an unconsumed `lastCombatTriggerBeatId` (`lib/eliza/locationRooms/service.ts:402-405`, `lib/eliza/locationRooms/service.ts:1084-1108`, `lib/eliza/locationRooms/service.ts:1410-1415`). Therefore requiring stronger story escalation does not have to force combat; it can require public narration and/or `foreshadow`/higher threat after repeated activity while preserving `start_combat` as the handoff gate.

**Eliminated hypotheses:**
- Public API/UI hiding: disproved; public `game_master` messages would be returned and rendered if appended.
- Tick failure/retry as the primary cause: disproved for the observed run; code and live evidence both allow completed narrative ticks with only a character message.
- Combat/gameplay rows blocking the first GM message: unlikely; the missing first message is explained entirely in the narrative branch before any gameplay handoff.

**Recommended fix direction:** make public narration contextually required for first beats/no-prior-public-GM beats, and add a progression guard/repair instruction that escalates after repeated room activity (for example move from `story` to `exploration`/`threat` or `combatReadiness='foreshadow'` with `threatLevel >= 1`) while keeping `requestedGameplayAction='start_combat'` reserved for explicit combat triggers with an encounter seed.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The issue may be caused by the newly stricter narrative progression contract rejecting first-beat GM output, the repair/failure path preventing public GM output, tick intent/routing behavior after reset, schema/cache mismatch, or scheduled/manual tick cadence/retry state.
**Findings:** Report created; live runtime evidence pending.
**Evidence:** User reported story ticks still do not advance and first GM message was missing.
**Conclusion:** Needs investigation.

## Root Cause

Crow's Den is not failing at the tick, API, UI, or gameplay layer. It is completing narrative ticks with a product-invalid but code-valid GM beat.

The root cause is the narrative GM contract and coordinator behavior:

1. **Public GM narration is optional.** `GameMasterBeatOutput.publicNarration` is nullable, the prompt describes `publicNarration` as optional, and normalization accepts missing/empty narration as `null` (`lib/eliza/locationRooms/gameMasterGenerator.ts:56-59`, `lib/eliza/locationRooms/gameMasterGenerator.ts:401-404`, `lib/eliza/locationRooms/gameMasterGenerator.ts:341-346`).
2. **The coordinator only appends a GM message when narration exists.** `shouldAppendGameMasterMessage()` returns false for null narration, so no public `game_master` message is inserted (`lib/eliza/locationRooms/narrativeCoordinator.ts:210-212`, `lib/eliza/locationRooms/narrativeCoordinator.ts:288-304`).
3. **The service treats character-only narrative output as success.** The coordinator still appends the selected character response and returns `messageId`; `LocationRoomService` then marks the tick completed (`lib/eliza/locationRooms/narrativeCoordinator.ts:327-380`, `lib/eliza/locationRooms/service.ts:1501-1524`).
4. **The progression contract does not force visible escalation.** Non-aftermath beats require objective/open threads, but `story` with `combatReadiness='none'` and `threatLevel=0` remains valid indefinitely unless the model chooses escalation (`lib/eliza/locationRooms/gameMasterGenerator.ts:194-230`, `lib/eliza/locationRooms/narrativeTypes.ts:122-177`).

The live dev rows match this exactly: three completed ticks, three accepted completed narrative beats, three character messages, zero GM messages, all `public_narration` values empty/null, and state still at `story` / `none` / `0`.

## Eliminated Hypotheses

- **Public API/UI hiding GM messages:** ruled out. Public reads list all public messages and the UI explicitly renders `authorKind === 'game_master'`.
- **Tick failure/retry:** ruled out for the observed run. Ticks and beats completed with no room/tick errors.
- **GM generation failure:** ruled out for the observed run. Beats show accepted GM generation and non-empty `speakerInstruction`.
- **Gameplay blocking the first GM message:** ruled out. The missing GM message happens in the narrative branch before gameplay handoff.
- **Combat handoff bug as primary cause:** downgraded. No combat trigger exists because narrative metadata never requests one; the explicit gate is behaving as designed.

## Recommendations

1. **Require public GM narration for first/no-prior-GM beats.**
   - In `lib/eliza/locationRooms/gameMasterGenerator.ts`, add a progression context derived from room activity/recent transcript, e.g. `requirePublicNarration=true` when no prior public `game_master` message exists.
   - Pass that context into the initial prompt, repair prompt, normalization, and `validateGameMasterBeatProgressionContract()`.
   - Reject missing `publicNarration` when required so the repair path runs; if repair fails, the tick should fail visibly rather than completing as character-only.

2. **Require visible escalation after repeated room activity without forcing combat.**
   - Add context such as `requireEscalationBeyondOpening=true` after repeated room activity, e.g. `room.tickCount >= 2` or enough prior transcript messages.
   - Reject `story` + `combatReadiness='none'` + `threatLevel=0/null` when escalation is required.
   - Allow escalation into `exploration`, `threat`, `combatReadiness='foreshadow'`, or `threatLevel >= 1` without forcing `start_combat`.
   - Preserve the existing combat gate: combat still requires `requestedGameplayAction='start_combat'`, `ttrpgPhase='threat'`, `combatReadiness='ready'`, a public-safe `encounterSeed`, and an unconsumed trigger id.

3. **Harden stored beat reuse.**
   - In `lib/eliza/locationRooms/narrativeCoordinator.ts`, ensure stored/retried GM output is validated against the same context before reuse. A stored beat with missing required public narration should not complete as a character-only output on retry.

4. **Update diagnostics for this exact failure mode.**
   - In `lib/eliza/locationRooms/adminDiagnostics.ts`, surface whether the latest beat has `publicNarration`, public `game_master` message count, public `agent` message count, and a blocker/recommended action when completed beats exist but zero GM messages exist.

5. **Update tests.**
   - `tests/lib/eliza/location-room-game-master-generator.test.ts`: missing `publicNarration` rejected when required; valid first beat with narration accepted; later beat without narration accepted only when not required; repeated activity rejects `story`/`none`/`0`; repair prompt repeats narration/escalation requirements.
   - `tests/lib/eliza/location-room-narrative-coordinator.test.ts`: first/no-prior-GM beat appends GM message before character message; first/no-prior-GM null narration fails before character append; stored retry output missing required narration is rejected; later character-focused beat may omit GM narration only after a prior GM message exists.
   - Add smoke coverage/ops note asserting Crow's Den fresh-start first completed tick produces a public `game_master` message.

## Preventive Measures

- Add a fresh-start smoke assertion for canonical Crow's Den `location_id='11'`: first completed narrative tick must create at least one public `game_master` message.
- Add a multi-tick assertion that story state cannot remain `story` / `none` / `0` after repeated activity.
- Keep prompt, repair prompt, normalizer, and validator requirements aligned so the model is asked for exactly what validation requires.
- Continue avoiding raw GM response storage; expose only safe categorized diagnostics.
- Document the product contract: first public GM narration is required, later GM narration is optional unless the beat is setting up or escalating the scene.
- Keep combat explicit. Escalation should make the scene feel alive without spawning enemies unless the GM emits a valid `start_combat` trigger.

## Implementation Note

Implemented the local contract hardening so first/no-prior-public-GM beats require non-empty `publicNarration`, repeated flat room activity must visibly escalate out of `story` / `none` / `0|null`, and stored beat reuse is validated against the same progression context before character output. Diagnostics now expose public GM/agent message counts, latest beat public narration presence, and `missing_public_game_master_message` when completed character-only activity exists without a public GM message. Combat remains gated by the existing explicit `start_combat` trigger requirements.
