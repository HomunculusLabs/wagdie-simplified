# Game Master Agent Canonical Content Sync Runbook

Use this workflow for future JD/persona/knowledge revisions to the WAGDIE location-room game-master agent.

## Operator workflow

1. Edit the repo-canonical bundle in `lib/eliza/gameMasterAgent/canonicalContent.ts`.
   - Keep canonical document IDs stable across content edits.
   - Keep documents as `.md` or `.txt` paths and within the configured knowledge size/document limits.
2. Run focused validation before deploy:
   `bun run test tests/lib/eliza/game-master-agent-service.test.ts tests/api/admin-eliza-game-master-agent-routes.test.ts tests/components/admin/game-master-agent-admin-container.test.tsx --runInBand`.
3. Deploy the application containing the content update.
4. Open `/admin/game-master-agent` as an admin. If no active GM setting exists, create/adopt the game-master agent first; canonical apply is disabled while the page is only using env fallback.
5. Review the **Canonical Content** panel.
   - Confirm bundle ID/version, persona drift, changed persona fields, canonical document statuses, preserved live documents, and any document-limit conflict.
6. Apply persona and knowledge independently.
   - Apply persona when the preview is current and no persona edits are dirty.
   - Apply knowledge to upsert canonical docs and sync them to Official ElizaOS knowledge.
7. Verify sync states in the panel.
   - Canonical docs should report indexed/in-sync when sync succeeds.
   - If a doc reports error or unknown, check ElizaOS availability and retry/apply again after refreshing the page.
8. Roll back through the admin UI if needed.
   - Persona rollback: edit/save the live persona in `/admin/game-master-agent`, or deploy the prior canonical bundle and apply it.
   - Knowledge rollback: delete unwanted knowledge documents from the admin knowledge panel. Canonical apply preserves non-canonical admin docs and does not auto-delete repo-removed canonical docs in V1.

## Runtime note

Location-room runtime generation uses the active Official ElizaOS live game-master agent state. Runtime ticks do **not** read repo canonical files directly; repo content only affects runtime after an admin applies persona and/or syncs knowledge into Official live state.
