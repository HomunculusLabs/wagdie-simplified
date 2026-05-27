# Crow's Den Location Room Smoke Checklist

Canonical Crow's Den location is `locations.id='11'`. Do not smoke against legacy `crows_den` except to verify diagnostics redirect operators back to `11`.

## Preflight

- Confirm the target environment has the `eliza_location_room_ticks.turn_intent` migration applied.
- Confirm Crow's Den canonical id remains `11` and chain-backed location data points to `chain_location_id='11'`.
- Confirm at least two eligible participants are staked/synced at location `11`.
- Confirm official ElizaOS and the game-master agent resolve successfully in admin diagnostics.
- Confirm diagnostics show a visible Crow's Den combat catalog: `adventureCatalog.hasVisibleCombatCatalog=true`, with non-zero visible `80_encounters` and/or `30_monsters` counts. If this reports `missing_location_adventure_catalog`, do not add placeholder production copy; obtain product-approved public-safe encounter/monster text or use a dev-only fixture outside production migrations.

## Smoke Path

1. Open admin location-room diagnostics for location `11`.
2. Verify the diagnostics payload/UI shows grouped summaries for durable intent, retry/cadence, GM repair/failure, adventure catalog, combat promotion, and trigger/readiness.
3. Trigger an admin `story` tick for location `11`; verify the tick persists `turn_intent='story'` and routes to narrative rather than consuming an existing combat trigger.
4. Exercise or simulate invalid GM JSON; verify the GM repair path attempts repair once and stores only safe `gmGeneration` diagnostics.
5. If repair fails, verify the beat/tick becomes failed or dead through normal retry handling and diagnostics recommend `inspect_gm_repair_failure` or `wait_for_retry` as appropriate.
6. Verify no gameplay combat encounter spawns without an unconsumed narrative/admin `start_combat` trigger.
7. Drive or fixture a ready-without-trigger state (`ttrpgPhase='threat'`, `combatReadiness='ready'`, `threatLevel>=3`, `lastEncounterSeed` present, `lastCombatReadyBeatId` present, no active encounter). Verify diagnostics show `promotion.eligible=true`, a source beat id, and recommended action `combat_ready_pending_auto_tick` while cadence is not due.
8. Run the next eligible `auto` tick; verify diagnostics/state move to an explicit pending trigger (`requestedGameplayAction='start_combat'`, `lastCombatTriggerBeatId=<ready beat id>`) and then gameplay consumes it (`consumedCombatTriggerBeatId=<same beat id>`) through the existing gameplay path.
9. Verify active gameplay state shows an active encounter/run and the tick has a `gameplay_run_id`.
10. Trigger an admin `combat` tick as a control; verify diagnostics show an explicit unconsumed manual trigger such as `manual:<tick_id>` and the next combat-capable processing path can create/consume it.
11. Verify diagnostics distinguish these operator states: missing catalog data, foreshadowing, ready pending auto promotion, pending trigger, consumed trigger, active encounter, retry wait, normal cadence wait, missing public GM message, and parse/repair failure.
12. On a fresh/reset canonical Crow's Den room, verify the first completed narrative tick creates at least one public `author_kind='game_master'` message before/alongside character output.
13. After repeated room activity, verify narrative state does not remain flat indefinitely: `ttrpgPhase='story'`, `combatReadiness='none'`, and `threatLevel=0|null` should escalate visibly without requiring combat.
14. If completed narrative beats and public agent messages exist but no public GM messages exist, verify diagnostics recommend `missing_public_game_master_message`.

## Notes

- Active-adventure cadence is intentionally still a follow-up. A healthy room may report `wait_for_cadence` until `ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES` elapses.
- Do not deploy or modify remote servers as part of this local smoke checklist.
