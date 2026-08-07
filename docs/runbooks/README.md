# Runbooks

> Lifecycle: Runbook index
> Last validated: 2026-05-11
> Canonical sources: `package.json`, deployment configuration, environment/secrets management, `supabase/migrations/`, and relevant route/service code

Runbooks describe repeatable operational procedures. Unlike plans and investigations, runbooks may be used as current instructions, but only within their validation date and canonical-source caveats.

## Runbook policy

Every runbook should include:

- Purpose and target environment.
- Preconditions and required secrets without exposing raw secret values.
- Bun-first commands where package scripts exist.
- A `Last validated` date or equivalent validation note.
- Rollback or stop conditions when the procedure can affect live systems.

If a runbook becomes obsolete, mark it superseded in this index and link the replacement. Do not silently leave stale operational steps as current guidance.

## Inventory

| File | Classification | Summary / validation note |
| --- | --- | --- |
| `elizaos-dev-validation.md` | Runbook | Dev-server validation path for official ElizaOS setup and remaining cutover gates. Existing body has target assumptions and avoids hardcoded secrets; later operations docs may curate or point to it. |
| `lore-operations.md` | Runbook | Operator guide for base-event canonization overrides, auto-public community submission moderation/curation, submission promotion, and Eliza/Game Master boundary stop conditions. Last validated 2026-06-10. |
