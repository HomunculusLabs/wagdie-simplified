# Crow's Den Location Room Smoke Checklist

Canonical Crow's Den location is `locations.id='11'`. Do not smoke against legacy `crows_den` except to verify diagnostics redirect operators back to `11`.

## Preflight

- Confirm the target environment has the `eliza_location_room_ticks.turn_intent` migration applied.
- Confirm Crow's Den canonical id remains `11` and chain-backed location data points to `chain_location_id='11'`.
- Confirm at least two eligible participants are staked/synced at location `11`.
- Confirm official ElizaOS and the game-master agent resolve successfully in admin diagnostics.
- Confirm `GET /api/locations/11` returns `metadata.adventureCatalog.sections['80_encounters']` and `['30_monsters']` with non-empty visible entries.
- Confirm diagnostics show a visible Crow's Den combat catalog: `adventureCatalog.hasVisibleCombatCatalog=true`, with non-zero visible `80_encounters` and/or `30_monsters` counts. If this reports `missing_location_adventure_catalog`, do not proceed with story/combat smoke until the catalog migration has been applied.

## Smoke Policy: Fresh Transcript Delta Only

Static fallback prose is no longer an acceptable successful public Game Master result. Public `gm_beat` and `gm_outcome` messages in a new smoke run must come from accepted or repaired Official ElizaOS GM output. If the GM agent cannot produce valid output, the tick should fail/retry with safe diagnostics; it must not append deterministic fallback narration that looks successful.

To avoid stale transcript confusion, every smoke run must inspect only fresh output:

1. Before triggering a tick, capture a baseline from the public transcript and diagnostics:
   - latest public `sequence` for room `11`;
   - latest narrative tick id for room `11`;
   - latest narrative beat id, if diagnostics expose it.
2. Trigger exactly one intended tick and record the returned/new tick id.
3. Inspect messages only when they match the triggered tick id or have `sequence > <baseline latest sequence>`.
4. Ignore older public messages when judging the current smoke, even if they contain legacy static fallback metadata.
5. For each fresh public Game Master message, inspect metadata and reject the run if `fallbackUsed === true` appears on the message metadata, nested `gmGeneration`, beat metadata, or scene-check outcome metadata.
6. Also reject fresh deterministic fallback copy/generic pressure-only prose such as “room shifts,” “pressure gathers,” “repeated hesitation,” or static text that does not name Crow’s Den anchors.

Legacy stored fallback messages may remain readable in historical transcripts. Treat them as historical data only; current health should count them as `recentLegacyFallbackCount` when they fall inside the recent diagnostics window, not as successful current output.

## Smoke Path

1. Open admin location-room diagnostics for location `11`.
2. Verify the diagnostics payload/UI shows grouped summaries for durable intent, retry/cadence, GM repair/failure, adventure catalog, combat promotion, and trigger/readiness.
3. Capture the fresh-run baseline described above: latest public transcript sequence, latest tick id, and latest beat id if available.
4. Trigger an admin `story` tick for location `11`; record the triggered tick id and verify the tick persists `turn_intent='story'` and routes to narrative rather than consuming an existing combat trigger.
5. Inspect only messages for the triggered tick or `sequence` values greater than the baseline. Verify any new public `gm_beat`/`gm_outcome` has no `fallbackUsed === true` metadata and is not deterministic/static fallback prose.
6. Exercise or simulate invalid GM JSON; verify the GM repair path attempts repair once and stores only safe `gmGeneration` diagnostics.
7. If repair fails, verify the beat/tick becomes failed or dead through normal retry handling, no new public static GM message is appended for that failed generation, and diagnostics recommend `inspect_gm_repair_failure` or `wait_for_retry` as appropriate.
8. Verify health/admin diagnostics expose recent accepted/repaired/repair-failed/recovered counts, `recentLegacyFallbackCount`, latest failure category, latest transport stage, and latest recoveries without raw prompts or raw model output.
9. Verify no gameplay combat encounter spawns without an unconsumed narrative/admin `start_combat` trigger.
10. Drive or fixture a ready-without-trigger state (`ttrpgPhase='threat'`, `combatReadiness='ready'`, `threatLevel>=3`, `lastEncounterSeed` present, `lastCombatReadyBeatId` present, no active encounter). Verify diagnostics show `promotion.eligible=true`, a source beat id, and recommended action `combat_ready_pending_auto_tick` while cadence is not due.
11. Run the next eligible `auto` tick; verify diagnostics/state move to an explicit pending trigger (`requestedGameplayAction='start_combat'`, `lastCombatTriggerBeatId=<ready beat id>`) and then gameplay consumes it (`consumedCombatTriggerBeatId=<same beat id>`) through the existing gameplay path.
12. Verify active gameplay state shows an active encounter/run and the tick has a `gameplay_run_id`.
13. Trigger an admin `combat` tick as a control; verify diagnostics show an explicit unconsumed manual trigger such as `manual:<tick_id>` and the next combat-capable processing path can create/consume it.
14. Verify diagnostics distinguish these operator states: missing catalog data, foreshadowing, ready pending auto promotion, pending trigger, consumed trigger, active encounter, retry wait, normal cadence wait, missing public GM message, parse/repair failure, transport-stage failure, recoverable private metadata defaulting, and legacy static fallback occurrences.
15. On a fresh/reset canonical Crow's Den room, verify the first completed narrative tick creates at least one fresh public `author_kind='game_master'` message before/alongside character output.
16. After repeated room activity, verify narrative state does not remain flat indefinitely: `ttrpgPhase='story'`, `combatReadiness='none'`, and `threatLevel=0|null` should escalate visibly without requiring combat.
17. Verify fresh public GM messages and scene-check outcomes name concrete Crow's Den anchors such as the bell rope, rafters, shutters, table, cellar stair, salt, feathers, casks, or floorboards; reject generic pressure-only copy such as “room shifts,” “pressure gathers,” or “repeated hesitation.”
18. If completed narrative beats and public agent messages exist but no fresh public GM messages exist, verify diagnostics recommend `missing_public_game_master_message`.

## Notes

- Active-adventure cadence is intentionally still a follow-up. A healthy room may report `wait_for_cadence` until `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES` elapses.
- `buildFallbackGameMasterBeat()` / static scene-check fallback output may appear in legacy tests or historical records only. They must not be accepted as current successful public smoke output.
- Do not deploy or modify remote servers as part of this local smoke checklist.
