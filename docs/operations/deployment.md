# Deployment

> Lifecycle: Runbook
> Last validated: 2026-06-10
> Canonical sources: `package.json`, `.nvmrc`, `.env.example`, `next.config.js`, `middleware.ts`, Vercel project settings

This page summarizes deployment expectations for WAGDIE Simplified. Keep exact command and environment truth in the source files above.

## Platform expectation

The app is a Next.js 15 App Router project intended for Vercel-style deployments.

Use:

- Node `23.3.0` from `.nvmrc` and `package.json` `engines.node`.
- Bun for install and package-script examples.
- `package.json` `scripts` for the complete command inventory.

Common deployment verification:

```bash
nvm use
bun install
bun run lint
bun run typecheck
bun run build
```

## Environment families

`.env.example` is the best committed map of environment variable families. Production and preview deployments generally need values for these areas:

- App URL and session: `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET`. `NODE_ENV` is normally platform/runtime controlled and should not be manually overridden unless the deployment platform explicitly requires it.
- Supabase browser/server access: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Blockchain RPC and chain selection: public and server RPC URLs plus `NEXT_PUBLIC_CHAIN_ID`.
- Contract overrides when the default contract addresses are not appropriate.
- Protected sync jobs: `SYNC_SECRET_KEY`.
- Eliza and ElizaOS integration values when AI routes are enabled.
- External project links such as Discord, OpenSea, and Twitter/X.

Never put server-only secrets in `NEXT_PUBLIC_*` variables.

## Build and runtime caveats

`next.config.js` currently has these deployment-relevant behaviors:

- `reactStrictMode` is disabled to avoid development double-effect issues in map-related code.
- TypeScript and ESLint build errors are ignored during `next build`; deployment readiness still depends on narrow tests and review for touched code.
- Remote image patterns include IPFS gateways, Google Cloud Storage, OpenSea/raw media, Twitter/X media, and Discord CDN domains.
- CORS headers are emitted for fonts, character images, animated character pages, and character metadata API responses.
- WebP requests for map and legend icons are rewritten to PNG assets.

`middleware.ts` is part of the deployed request path. It sets CSRF cookies on page requests, skips unnecessary cookies for public animated NFT pages, and can proxy `/api/*` to a remote WAGDIE app when `WAGDIE_API_BASE_URL` is configured.

## CI and deployment gates

Required baseline gates for production and preview promotion:

```bash
bun run lint
bun run typecheck
bun run build
bun run test -- --runInBand
```

Location-room narrative/lifecycle changes should also run the bounded gate:

```bash
bun run gate:location-rooms
```

At minimum, that bounded gate covers lifecycle regression tests, public narrative contract-style checks, stall diagnostics, and narrative eval CLI smoke. Repo-wide `lint`, `typecheck`, and `build` remain baseline promotion gates above; if those are temporarily blocked by unrelated baseline debt, document the failure and run touched-file lint plus the bounded location-room gate before dev-only deployment.

For preview or staging rooms with API access, run the live narrative eval against a safe room before promotion:

```bash
bun run narrative:eval -- --base-url <preview-url> --location 11 --min-score 75 --fail-on-warnings
```

If structured route diagnostic logs were captured during the preview smoke, pass them into the eval so stall detectors can catch silent advancement and skip streaks:

```bash
bun run narrative:eval -- --base-url <preview-url> --location 11 --fail-on-warnings --diagnostics-file route-diagnostics.json
```

The live eval reports GNQS, public narrative warnings, escalation observability warnings, and stall findings for silent advancement, skip streaks, terminal mismatch, missing aftermath, and target resurrection where the public transcript/diagnostic input contains enough evidence.

## Preview deployments

Preview deployments should use preview-safe values for service-role keys, RPC endpoints, sync secrets, and Eliza/ElizaOS settings. If a preview deployment is intended only for UI review, prefer using the local/onboarding proxy pattern instead of pointing a local developer at mutable production services.

When preview environments run API routes, verify:

- Supabase points at the intended project.
- `SESSION_SECRET` is set and at least 32 characters.
- RPC URLs are available for server sync routes and wallet-visible reads.
- `SYNC_SECRET_KEY` is set if protected sync endpoints will be triggered.
- Eliza routes are either fully configured or intentionally disabled/left in legacy mode according to the current cutover plan.

## Production deployment checklist

Before promoting a production deploy:

- [ ] Confirm Node `23.3.0` is selected by the deployment platform.
- [ ] Run the relevant build/test path for the changed area; see `docs/development/testing.md`.
- [ ] For location-room lifecycle/narrative changes, run `bun run gate:location-rooms` or equivalent required CI jobs.
- [ ] For location-room preview promotion, run `bun run narrative:eval -- --base-url <preview-url> --location 11 --fail-on-warnings` and include `--diagnostics-file` when route diagnostic logs are available.
- [ ] Review environment variable diffs against `.env.example`.
- [ ] Confirm Supabase URL and service-role keys target the intended project.
- [ ] Confirm `SYNC_SECRET_KEY` is rotated/stored in the platform secret store and not in source.
- [ ] Confirm ElizaOS mode and URLs match the approved integration state.
- [ ] Smoke-check public pages, authenticated wallet flows, and the route areas touched by the deploy.

## Rollback notes

Use the deployment platform's rollback mechanism for app-code regressions. For data migrations, rollback is not automatically implied by an app rollback; inspect `supabase/migrations/` and any runbook for the specific migration or data job before reverting database state.

## Related docs

- `docs/operations/data-sync-and-assets.md`
- `docs/operations/elizaos-validation.md`
- `docs/reference/routes-and-apis.md`
