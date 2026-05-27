# ElizaOS Validation

> Lifecycle: Runbook
> Last validated: 2026-05-11
> Canonical sources: `docs/runbooks/elizaos-dev-validation.md`, `package.json`, `scripts/elizaos-official-smoke.ts`, `scripts/validate-elizaos-migrations.ts`, `scripts/elizaos-route-parity.ts`, `lib/eliza/client.ts`, `app/api/eliza/*`, `.env.example`

This page is the current operations entry point for ElizaOS validation. The detailed dated procedure remains in `docs/runbooks/elizaos-dev-validation.md`; this page summarizes the validation layers and links them to source truth.

## What is being validated

Eliza integration has two server-side modes selected by `lib/eliza/client.ts` and Eliza config:

- `legacy` / `dual`: the app-owned custom gateway and legacy inference path remain visible to the app.
- `official`: WAGDIE uses the hosted official ElizaOS adapter/service as the primary backend.

Routes under `app/api/eliza/*` preserve browser-facing contracts while switching the server-side gateway underneath. The chat route, for example, keeps the SSE event contract of `token`, `complete`, and optional `error` events.

## Validation layers

Use these layers in order for dev promotion:

1. **Supabase migration/role validation** — confirms WAGDIE app database migration tables, RLS posture, and service/anon/auth access expectations for ElizaOS migration support.
2. **Direct ElizaOS service smoke** — confirms hosted service health, service auth, disposable agent/session/message behavior, always-on near-limit Unicode session-message persistence, knowledge ingestion, and restart persistence checks.
3. **WAGDIE route parity** — confirms browser-facing WAGDIE routes still work against the official integration path, including SIWE gates and Eliza route contracts.

## Package scripts

Use Bun package scripts from `package.json`:

```bash
bun run elizaos:db:validate
bun run elizaos:smoke
bun run elizaos:smoke:post-restart
bun run elizaos:routes:validate
```

Do not run the internal `npx ts-node` commands directly unless you are changing the script implementation itself.

## Required source review before live validation

Before running against a live dev target, review:

- `docs/runbooks/elizaos-dev-validation.md` for the detailed, dated procedure and mutation caveats.
- `.env.example` for the current environment variable families.
- `scripts/elizaos-official-smoke.ts` for smoke-script options.
- `scripts/validate-elizaos-migrations.ts` for database target guards.
- `scripts/elizaos-route-parity.ts` for route parity options and mutation flags.
- `app/api/eliza/chat/route.ts` and related route files for the browser contract you are validating.

## Environment groups

### ElizaOS service smoke

Minimum live validation values:

- `ELIZAOS_BASE_URL`
- `ELIZAOS_API_KEY` or `ELIZA_SERVER_AUTH_TOKEN`

Common optional values:

- `WAGDIE_KNOWLEDGE_INGESTION_TOKEN` or `ELIZAOS_KNOWLEDGE_API_KEY`
- `ELIZAOS_HEALTH_PATH`
- `ELIZAOS_SMOKE_PHASE`
- `ELIZAOS_SMOKE_RUN_ID`
- `ELIZAOS_SMOKE_STATE_PATH`
- `ELIZAOS_SMOKE_SKIP_CHAT`
- `ELIZAOS_SMOKE_TOKEN_ID`
- `ELIZAOS_SMOKE_CLEANUP`
- `ELIZAOS_SMOKE_FAIL_ON_SKIPPED`

### Supabase validation

Minimum live validation values:

- `ELIZA_DB_VALIDATION_TARGET_ENV=dev` or `WAGDIE_SUPABASE_TARGET_ENV=dev`
- `SUPABASE_DB_URL` or another supported direct database URL variable
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or supported service-key fallback
- `SUPABASE_ANON_KEY` or supported anon-key fallback

Use `ELIZA_DB_VALIDATION_EXPECT_SUPABASE_REF` or `WAGDIE_DEV_SUPABASE_PROJECT_REF` for remote dev/staging targets when possible. Only use unverified-target overrides intentionally and never as a default.

### WAGDIE route parity

Minimum route parity values:

- `WAGDIE_DEV_BASE_URL` or `WAGDIE_APP_BASE_URL`
- `WAGDIE_ROUTE_PARITY_PRIVATE_KEY` or `WAGDIE_TEST_WALLET_PRIVATE_KEY`
- `WAGDIE_ROUTE_PARITY_TOKEN_ID` or `WAGDIE_TEST_TOKEN_ID`

Mutation checks require explicit opt-in. Only use disposable or approved test targets.

## Mutation policy

Route parity defaults are mostly non-mutating, but chat can create conversations unless skipped. Mutation flags can edit character AI persona/import data and knowledge documents. Do not run mutation checks against collector/user tokens unless the owner has explicitly approved disposable edits.

Use the detailed caveats in `docs/runbooks/elizaos-dev-validation.md` when setting mutation, cleanup, second-wallet, and fail-on-skipped flags.

## Restart validation

The smoke script supports a fresh phase and a post-restart phase. Preserve the state path and run ID from the fresh run, restart only the hosted ElizaOS service/container, then run the post-restart command against the same state.

```bash
bun run elizaos:smoke
bun run elizaos:smoke:post-restart
```

Record the restart timestamp, deployed service artifact/image, state path, and run ID in the operational note or release checklist for the validation event.

## Pass criteria

A dev validation pass should show:

- database validation succeeds against the intended non-production WAGDIE Supabase target;
- ElizaOS service health and auth checks pass;
- disposable agent/session/message/knowledge checks pass or are explicitly skipped with approval;
- post-restart smoke validates persisted state as described by the smoke script;
- WAGDIE route parity validates auth gates, character/export routes, chat SSE shape, conversations, and knowledge list shape;
- any mutation checks were scoped to an approved disposable target.

## Related docs

- Detailed dated runbook: `docs/runbooks/elizaos-dev-validation.md`
- Route/API index: `docs/reference/routes-and-apis.md`
- Testing guide: `docs/development/testing.md`
