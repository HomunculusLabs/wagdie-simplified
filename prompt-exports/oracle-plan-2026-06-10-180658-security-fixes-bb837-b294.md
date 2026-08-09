## Final Prompt
<taskname="Security Fixes"/>
<task>Fix the security issues identified in the prior scan for the Next.js WAGDIE app. Address the listed findings with minimal safe changes, preserving existing route behavior where possible and adding/updating focused tests.</task>

<architecture>
- Next.js App Router API handlers live under `app/api/**/route.ts`; most return via `lib/api/responses.ts` helpers (`jsonRaw`, `jsonNoStore`, error variants).
- Wallet auth uses SIWE plus iron-session: `app/api/auth/nonce` creates a `siwe-nonce` cookie, `app/api/auth/verify` parses the SIWE message, compares nonce cookie, calls `verifySiweMessage()`, then persists `session.address`, `session.siwe`, and a legacy `siwe-session` cookie via `lib/auth/session.ts`.
- Eliza auth is a second SIWE-like flow gated by the Wagdie session: `app/api/eliza/auth/nonce` stores `session.eliza.siwe`; `app/api/eliza/auth/verify` verifies the stored message in official mode via `verifySiweMessage()` or delegates to legacy Eliza in legacy mode, then stores `session.eliza.tokens`.
- CSRF and rate limit helpers already exist in `lib/middleware/csrf.ts` and `lib/middleware/rate-limit.ts`, but routes generally do not wrap handlers with them. `middleware.ts` only sets a readable `csrf-token` cookie on page requests and skips API routes unless proxying to `WAGDIE_API_BASE_URL`.
- Sync routes differ in auth: `app/api/sync/ownership/route.ts` requires `SYNC_SECRET_KEY` via Authorization bearer or `?secret=`, while `app/api/sync/staking/route.ts` currently accepts unauthenticated POST and calls `syncStakingState()` which performs admin-backed writes.
- `next.config.js` currently disables eslint/type checking during builds and only defines CORS headers for asset/metadata paths, not global security headers.
- Dependency state: `package.json` requests `next`/`eslint-config-next` `^15.0.0`; sliced `bun.lock` shows current lock resolution around Next 15.5.6. Prior scan called out Next.js <15.5.16 as critical/high.</architecture>

<selected_context>
package.json: full manifest with scripts, dependencies, devDependencies; contains Next and eslint-config-next ranges and test scripts.
bun.lock: targeted slices for root dependency ranges and locked Next-related entries (`next`, `@next/env`, `@next/eslint-plugin-next`, `eslint-config-next`, SWC vicinity) to guide lockfile update.
next.config.js: full config; build gates disabled with `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors`; `headers()` only covers CORS-specific paths.
middleware.ts: full middleware; optional remote API proxy; issues `csrf-token` cookie on page routes, skips local API routes and animated character embed page.
lib/auth/session.ts: full iron-session options; has hardcoded SESSION_SECRET fallback and `generateNonce()` using `Math.random()`.
lib/auth/siwe.ts: full SIWE helper; `verifySiweMessage(message, signature)` only delegates to `SiweMessage.verify({ signature })` and returns address; no trusted nonce/domain/chain binding except callers' partial checks.
app/api/auth/nonce/route.ts: full nonce route; GET/POST create random SIWE nonce cookie via `lib/auth/siwe.generateNonce()`; no rate limit wrapper currently.
app/api/auth/verify/route.ts: full verify route; validates cookie nonce, calls `verifySiweMessage`, writes session/cookies; no rate limit or CSRF wrapper currently.
app/api/auth/logout/route.ts and app/api/auth/me/route.ts: full auth session read/write route context.
app/api/eliza/auth/nonce/route.ts: full Eliza nonce route; derives SIWE `domain`/`uri` from request headers and hardcodes `chainId: 1`; stores message in session.
app/api/eliza/auth/verify/route.ts: full Eliza verify route; official mode verifies message/signature/address against session but relies on stored message fields created from request headers; legacy mode delegates to Eliza client.
lib/eliza/siwe.ts is not selected; if needed, locate via imports from Eliza nonce. Current selected file still shows how `createSIWEMessage()` is called.
app/api/sync/staking/route.ts: full unauthenticated POST route accepting token IDs and calling `syncStakingState()`.
app/api/sync/ownership/route.ts: full authorized sync pattern using `SYNC_SECRET_KEY`.
app/api/sync/eliza-location-rooms/route.ts: full sync route for comparison.
lib/services/sync/staking-state-sync.ts: full implementation of staking sync/admin write behavior.
lib/middleware/csrf.ts: full double-submit cookie wrapper and constants `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`.
lib/middleware/rate-limit.ts: full in-memory rate limiter, `authRateLimiter`, `withRateLimit()`, and rate-limit header helpers.
lib/api/auth.ts, lib/auth/admin.ts, lib/auth/character-permissions.ts: full route auth helpers used by protected routes.
lib/api/responses.ts/errors.ts/client.ts: response helper context and conventions.
lib/supabase.ts: Supabase client/admin factory context.
Relevant route samples selected full or slices: character update/searing/concord/lore/chat/location-room routes and admin snippets show existing auth/response conventions and cookie-authenticated mutating surfaces; do not assume all need CSRF changes.
Tests selected full: `tests/integration/auth-nonce.test.ts`, `auth-verify.test.ts`, `csrf-protection.test.ts`, `rate-limit-auth.test.ts`; `tests/unit/csrf.test.ts`, `rate-limit.test.ts`, `session-validation.test.ts`; `tests/api/eliza/auth-routes.test.ts`, `eliza/siwe.test.ts`, `sync-staking-route.test.ts`; `tests/e2e/security-headers.test.ts`. Several current tests are expectation-only or comment that behavior will pass once wrappers are applied.
</selected_context>

<relationships>
- `/api/auth/nonce` -> `generateNonce()` from `lib/auth/siwe.ts` -> sets `siwe-nonce` cookie -> `/api/auth/verify` extracts nonce with `SiweMessage`, compares cookie, then calls `verifySiweMessage()` -> `getSession()` -> iron-session `sessionOptions`.
- `/api/eliza/auth/nonce` -> `getSession()` (requires `session.address`) -> `createSIWEMessage({ domain, uri, chainId: 1, nonce })` -> stores `session.eliza.siwe` -> `/api/eliza/auth/verify` -> `verifySiweMessage()` in official mode or `getElizaClient().auth.verify()` in legacy mode.
- `lib/middleware/rate-limit.withRateLimit(handler)` wraps `(NextRequest) => Promise<NextResponse>` handlers; auth route exports may need adapting so GET/POST remain exported functions with compatible signatures.
- `lib/middleware/csrf.withCsrfProtection(handler)` expects `NextRequest` and optional params context; it bypasses requests with Authorization header. Apply only to cookie-authenticated mutating routes where clients can send `X-CSRF-Token`; avoid broad application to webhook/cron/API-client routes that cannot receive a browser CSRF token without client updates.
- `middleware.ts` sets the CSRF cookie for page routes but intentionally returns early for `/api/*`; route-level CSRF validation must use the cookie/header pair rather than relying on global middleware to block API mutations.
- `app/api/sync/staking/route.ts` -> `syncStakingState()` -> Supabase admin writes. `app/api/sync/ownership/route.ts` provides a likely `SYNC_SECRET_KEY` authorization pattern for cron/manual sync endpoints.
- `next.config.js headers()` should merge global security headers with existing CORS exceptions for fonts/images/metadata/animated pages; be careful with `frame-ancestors` / `X-Frame-Options` because `/characters/:tokenId/animated` is intentionally embeddable by marketplaces per `middleware.ts` comments.
</relationships>

<work_items>
1. Update vulnerable dependencies: bump Next.js to a safe version at or above 15.5.16 and keep `eslint-config-next` aligned; update `bun.lock` consistently. Verify other audit-critical/high findings if package manager output is available to the next model.
2. Remove the production hardcoded session secret fallback in `lib/auth/session.ts`; fail closed in production if `SESSION_SECRET` is missing/weak, while preserving usable local development behavior. Update `tests/unit/session-validation.test.ts` or add focused coverage.
3. Protect `app/api/sync/staking/route.ts` with auth comparable to other sync routes, likely `SYNC_SECRET_KEY` bearer/query support, before `syncStakingState()` runs. Update `tests/api/sync-staking-route.test.ts` to assert unauthorized requests do not call sync/admin-write code.
4. Apply CSRF protection to selected cookie-authenticated mutating routes only. Good candidates from selected context include SIWE verify/logout and other browser session mutations; avoid cron/sync bearer-token routes and public API-client routes unless corresponding clients are updated.
5. Bind SIWE verification to trusted config: nonce/domain/uri/chain should be checked against expected app configuration rather than accepting request-derived host/domain or signature/address alone. Main and Eliza flows both need consideration; Eliza nonce currently derives host/origin from request headers and hardcodes chainId 1.
6. Apply auth rate limiting to auth nonce/verify routes, including Eliza auth if appropriate. Existing tests/mock structure expects wrappers to be used but may need strengthening from expectation-only assertions to actual 429 behavior.
7. Add global security headers in `next.config.js` while preserving existing CORS headers and marketplace embedding needs for animated pages. Tests mention X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and CSP directives.
8. Re-enable eslint/type checking build gates by removing `ignoreDuringBuilds` / `ignoreBuildErrors` or setting them false, then fix any surfaced local type/lint issues required by this change.</work_items>

<likely_tests>
- `bun test tests/unit/session-validation.test.ts tests/unit/rate-limit.test.ts tests/unit/csrf.test.ts`
- `bun test tests/integration/auth-nonce.test.ts tests/integration/auth-verify.test.ts tests/integration/rate-limit-auth.test.ts tests/integration/csrf-protection.test.ts`
- `bun test tests/api/eliza/auth-routes.test.ts tests/api/eliza/siwe.test.ts tests/api/sync-staking-route.test.ts`
- `bun test tests/e2e/security-headers.test.ts` (currently mostly static expectations; may need conversion if asserting actual config output)
- `bun run lint` and `bun run build` after re-enabling Next build gates.
</likely_tests>

<ambiguities>
- Trusted SIWE app origin/domain/chain config is not obvious in selected files. `NEXT_PUBLIC_CHAIN_ID` appears in README context from search, but Eliza nonce currently hardcodes chain 1 and derives host/origin from request headers. Next model should locate or add a server-trusted config source if needed.
- `bun.lock` is included only as slices due to size. The next model may need to regenerate the lockfile with Bun rather than manually editing all transitive Next entries.
- CSRF client token plumbing is not fully selected. Apply CSRF narrowly unless corresponding frontend/API client callers are identified and updated.
</ambiguities>

## Selection
- Files: 105 total (60 full, 42 slice, 3 codemap)
- Total tokens: 77407 (Auto view)
- Token breakdown: full 64504, slice 9431, codemap 3472

### Files
### Selected Files
/Users/t3rpz/projects/wagdie-simplified/
├── app/
│   ├── admin/
│   │   └── lore/
│   │       └── submissions/
│   │           └── [submissionId]/
│   │               └── page.tsx — 88 tokens (lines 32-36)
│   ├── api/
│   │   ├── admin/
│   │   │   └── eliza/
│   │   │       └── game-master-agent/
│   │   │           ├── canonical/
│   │   │           │   └── apply/
│   │   │           │       └── route.ts — 97 tokens (lines 5-9, 76-80)
│   │   │           └── shared.ts — 274 tokens (lines 59-63, 84-102, 108-112, 128-132)
│   │   ├── auth/
│   │   │   ├── logout/
│   │   │   │   └── route.ts — 254 tokens (full)
│   │   │   ├── me/
│   │   │   │   └── route.ts — 218 tokens (full)
│   │   │   ├── nonce/
│   │   │   │   └── route.ts — 222 tokens (full)
│   │   │   └── verify/
│   │   │       └── route.ts — 712 tokens (full)
│   │   ├── character/
│   │   │   └── [tokenId]/
│   │   │       └── route.ts — 243 tokens (full)
│   │   ├── characters/
│   │   │   ├── [tokenId]/
│   │   │   │   ├── searing/
│   │   │   │   │   ├── preview/
│   │   │   │   │   │   └── route.ts — 876 tokens (full)
│   │   │   │   │   └── sync/
│   │   │   │   │       └── route.ts — 559 tokens (full)
│   │   │   │   └── route.ts — 219 tokens (full)
│   │   │   ├── animation/
│   │   │   │   └── [tokenId]/
│   │   │   │       └── route.ts — 21 tokens (lines 205-209)
│   │   │   └── metadata/
│   │   │       └── [tokenId]/
│   │   │           └── route.ts — 157 tokens (lines 34-38, 47-51, 64-68, 70-74)
│   │   ├── concords/
│   │   │   └── searing-map/
│   │   │       ├── [concordId]/
│   │   │       │   └── route.ts — 586 tokens (full)
│   │   │       └── route.ts — 667 tokens (full)
│   │   ├── eliza/
│   │   │   ├── auth/
│   │   │   │   ├── nonce/
│   │   │   │   │   └── route.ts — 956 tokens (full)
│   │   │   │   └── verify/
│   │   │   │       └── route.ts — 1,413 tokens (full)
│   │   │   ├── characters/
│   │   │   │   └── [tokenId]/
│   │   │   │       ├── export/
│   │   │   │       │   └── route.ts — 477 tokens (full)
│   │   │   │       └── knowledge/
│   │   │   │           └── route.ts — 1,620 tokens (full)
│   │   │   ├── chat/
│   │   │   │   └── route.ts — 2,401 tokens (full)
│   │   │   └── location-rooms/
│   │   │       └── [locationId]/
│   │   │           └── tick/
│   │   │               └── route.ts — 1,063 tokens (full)
│   │   ├── lore/
│   │   │   └── submissions/
│   │   │       ├── [submissionId]/
│   │   │       │   └── route.ts — 90 tokens (lines 4-8, 31-35)
│   │   │       ├── route.ts — 84 tokens (lines 4-8, 22-26)
│   │   │       └── shared.ts — 696 tokens (full)
│   │   └── sync/
│   │       ├── eliza-location-rooms/
│   │       │   └── route.ts — 619 tokens (full)
│   │       ├── ownership/
│   │       │   └── route.ts — 881 tokens (full)
│   │       └── staking/
│   │           └── route.ts — 450 tokens (full)
│   └── images/
│       └── characters/
│           └── current/
│               └── [file]/
│                   └── route.ts — 834 tokens (full)
├── components/
│   ├── characters/
│   │   ├── ActiveFilters.tsx — 36 tokens (lines 37-41)
│   │   └── OriginDropdown.tsx — 39 tokens (lines 117-121)
│   └── lore/
│       └── submissions/
│           └── MarkdownPreview.tsx — 65 tokens (lines 1-4, 13-17)
├── hooks/
│   └── useCharacterBrowseFilters.ts — 82 tokens (lines 95-99)
├── lib/
│   ├── api/
│   │   ├── handlers/
│   │   │   └── character-update.ts — 1,590 tokens (full)
│   │   ├── auth.ts — 341 tokens (full)
│   │   ├── client.ts — 44 tokens (lines 97-101)
│   │   ├── errors.ts — 267 tokens (full)
│   │   └── responses.ts — 1,388 tokens (full)
│   ├── auth/
│   │   ├── admin.ts — 202 tokens (full)
│   │   ├── character-permissions.ts — 526 tokens (full)
│   │   ├── session.ts — 237 tokens (full)
│   │   └── siwe.ts — 603 tokens (full)
│   ├── domain/
│   │   └── searing/
│   │       ├── concord-searing-map-input.ts — 793 tokens (full)
│   │       ├── concord-searing-map.ts — 646 tokens (full)
│   │       └── searing-layer-resolver.ts — 1,980 tokens (full)
│   ├── eliza/
│   │   ├── gateway/
│   │   │   └── errors.ts — 63 tokens (lines 57-61)
│   │   ├── locationRooms/
│   │   │   ├── gameMaster/
│   │   │   │   └── officialGenerator.ts — 109 tokens (lines 27-31, 995-999)
│   │   │   ├── gameplay/
│   │   │   │   ├── gameMaster/
│   │   │   │   │   └── officialGenerator.ts — 113 tokens (lines 453-457, 1342-1346)
│   │   │   │   ├── actionGenerator.ts — 109 tokens (lines 234-238, 313-317)
│   │   │   │   ├── coordinator.ts — 63 tokens (lines 20-24, 1274-1278)
│   │   │   │   ├── publicRolls.ts — 1,067 tokens (lines 61-69, 176-181, 265-273, 283-287, 298-304, 315-329, 338-342, 348-352, 355-362, 364-368, 374-380, 383-395, 399-413)
│   │   │   │   └── repository.ts — 81 tokens (lines 404-408, 1123-1127)
│   │   │   ├── generation/
│   │   │   │   └── diagnostics.ts — 163 tokens (lines 25-29, 65-69, 85-89, 121-125)
│   │   │   ├── service/
│   │   │   │   └── publicRoomReader.ts — 189 tokens (lines 26-30, 122-126)
│   │   │   ├── adminDiagnostics.ts — 356 tokens (lines 360-364, 377-381, 394-398, 742-746, 1259-1263, 1280-1284)
│   │   │   ├── narrativeCoordinator.ts — 639 tokens (lines 58-62, 464-468, 478-482, 526-533, 560-564, 604-611, 1015-1019, 1040-1044)
│   │   │   ├── narrativeRepository.ts — 119 tokens (lines 83-87, 315-319, 323-327)
│   │   │   ├── officialTurnGenerator.ts — 436 tokens (lines 12-20, 45-49, 253-257, 604-609, 646-651)
│   │   │   └── publicAdventure.ts — 108 tokens (lines 154-158, 182-185)
│   │   ├── official/
│   │   │   ├── messaging.ts — 111 tokens (lines 218-222, 255-259, 323-327)
│   │   │   ├── service-client.ts — 95 tokens (lines 9-13, 40-44)
│   │   │   └── text.ts — 395 tokens (lines 20-24, 60-73, 85-92, 97-101, 119-123)
│   │   ├── character-sheet-policy.ts — 36 tokens (lines 382-386)
│   │   ├── persona-assistant.ts — 109 tokens (lines 2-6, 409-413)
│   │   ├── routeAuth.ts — 429 tokens (full)
│   │   └── sessionAuth.ts — 875 tokens (full)
│   ├── lore/
│   │   └── submissions/
│   │       ├── ownership.ts — 1,158 tokens (full)
│   │       └── validation.ts — 2,290 tokens (full)
│   ├── middleware/
│   │   ├── csrf.ts — 797 tokens (full)
│   │   └── rate-limit.ts — 1,544 tokens (full)
│   ├── repositories/
│   │   ├── character/
│   │   │   └── character-query-repository.ts — 43 tokens (lines 144-148)
│   │   └── lore-base-repository.ts — 50 tokens (lines 192-196)
│   ├── services/
│   │   ├── assets/
│   │   │   ├── character-current-image-service.ts — 3,080 tokens (full)
│   │   │   └── image-loader.ts — 278 tokens (full)
│   │   ├── sync/
│   │   │   └── staking-state-sync.ts — 4,293 tokens (full)
│   │   ├── character-served-metadata-service.ts — 1,748 tokens (full)
│   │   ├── lore-submission-service.ts — 116 tokens (lines 77-84, 494-498)
│   │   ├── searing-image-composer.ts — 1,233 tokens (full)
│   │   └── searing-materialization-service.ts — 4,705 tokens (full)
│   ├── utils/
│   │   └── audit-logger.ts — 769 tokens (full)
│   └── supabase.ts — 962 tokens (full)
├── scripts/
│   ├── indexer/
│   │   └── etherscan-rate-limiter.ts — 142 tokens (lines 80-84, 91-95, 105-109)
│   ├── lore/
│   │   └── seed-base-lore.ts — 60 tokens (lines 81-85)
│   ├── location-room-narrative-eval.ts — 415 tokens (lines 48-52, 69-73)
│   └── repair-current-character-images.ts — 304 tokens (lines 623-627, 630-634, 697-701, 948-952)
├── tests/
│   ├── api/
│   │   ├── eliza/
│   │   │   ├── auth-routes.test.ts — 1,852 tokens (full)
│   │   │   └── siwe.test.ts — 542 tokens (full)
│   │   ├── characters-metadata-route.test.ts — 325 tokens (lines 62-66, 84-92, 100-114)
│   │   └── sync-staking-route.test.ts — 953 tokens (full)
│   ├── e2e/
│   │   └── security-headers.test.ts — 955 tokens (full)
│   ├── integration/
│   │   ├── auth-nonce.test.ts — 954 tokens (full)
│   │   ├── auth-verify.test.ts — 1,969 tokens (full)
│   │   ├── csrf-protection.test.ts — 975 tokens (full)
│   │   └── rate-limit-auth.test.ts — 1,186 tokens (full)
│   └── unit/
│       ├── audit-logger.test.ts — 214 tokens (lines 216-220, 223-227, 230-234, 237-241, 246-250)
│       ├── csrf.test.ts — 1,062 tokens (full)
│       ├── lore-submission-service.test.ts — 76 tokens (lines 2-6, 244-248)
│       ├── rate-limit.test.ts — 1,235 tokens (full)
│       └── session-validation.test.ts — 696 tokens (full)
├── bun.lock — 2,248 tokens (lines 1-70 (Root workspace dependencies and devDependencies showing Next.js and eslint-config-next requested ranges for audit/remediation consistency.), 590-605 (Locked @next/env, @next/eslint-plugin-next, and SWC package entries around current Next 15.5.6 resolution.), 1598-1606 (Locked eslint-config-next entry and dependency versions tied to Next linting upgrade.), 2298-2306 (Locked next package entry currently resolving to next@15.5.6 for upgrade target verification.))
├── middleware.ts — 1,145 tokens (full)
├── next.config.js — 940 tokens (full)
└── package.json — 1,340 tokens (full)

### Codemaps
/Users/t3rpz/projects/wagdie-simplified/
├── app/
│   └── api/
│       └── admin/
│           └── eliza/
│               └── game-master-agent/
│                   └── knowledge/
│                       └── [documentId]/
│                           └── route.ts — 86 tokens (manual)
└── lib/
    └── eliza/
        └── locationRooms/
            ├── sceneChecks/
            │   └── types.ts — 862 tokens (manual)
            └── repository.ts — 2,524 tokens (manual)


---

## Generated Plan

## Chat Send ✅
- **Chat**: `security-fixes-BB8374` | **Mode**: plan

### Response
## 1. **Summary**

Implement targeted security hardening rather than a broad refactor: upgrade Next.js to the patched line, fail closed on weak production session secrets, secure nonce generation, require sync-secret authorization before staking admin writes, add focused CSRF/rate-limit wrappers to cookie-backed mutation/auth routes, bind SIWE messages to server-trusted origin/chain configuration, add global security headers while preserving marketplace embedding for animated character pages, and re-enable build-time lint/type gates. Preserve existing response body shapes where possible and update/add focused tests around the changed security boundaries.

---

## 2. **Current-state analysis**

### Auth and session flow

- `app/api/auth/nonce/route.ts`
  - Uses `generateNonce()` from `lib/auth/siwe.ts`.
  - Stores nonce in `siwe-nonce` cookie.
  - Returns `{ nonce }`.
  - No rate limit currently.

- `app/api/auth/verify/route.ts`
  - Reads body `{ message, signature }`.
  - Extracts nonce from SIWE message via `new SiweMessage(message).nonce`.
  - Compares message nonce to `siwe-nonce` cookie.
  - Calls `verifySiweMessage(message, signature)`.
  - Persists `session.address`, `session.siwe`, `session.expires`.
  - Sets legacy `siwe-session` cookie.
  - No CSRF or rate limit currently.
  - SIWE verification only proves signature/address; it does not bind domain, URI, or chain to trusted server configuration.

- `lib/auth/session.ts`
  - Uses `SESSION_SECRET || 'complex_password...'`.
  - This is unsafe in production because missing secret silently falls back to a hardcoded shared secret.
  - `generateNonce()` uses `Math.random()` and is used by Eliza official auth nonce route.

### Eliza auth flow

- `app/api/eliza/auth/nonce/route.ts`
  - Requires existing Wagdie session address.
  - In official mode, creates app-owned nonce/session ID.
  - Builds SIWE message from request-derived host/origin and hardcoded chain ID `1`.
  - Stores `session.eliza.siwe`.
  - No CSRF or rate limit.

- `app/api/eliza/auth/verify/route.ts`
  - Requires Wagdie session and stored `session.eliza.siwe`.
  - Official mode calls `verifySiweMessage(message, signature)` and checks verified address equals session address.
  - Legacy mode delegates to Eliza client.
  - Does not revalidate that stored SIWE message matches trusted app domain/URI/chain.
  - No CSRF or rate limit.

### CSRF

- `middleware.ts` sets readable `csrf-token` cookie on page routes.
- `lib/middleware/csrf.ts` already implements double-submit validation:
  - Cookie: `csrf-token`
  - Header: `X-CSRF-Token`
  - Bypasses requests with any `Authorization` header.
- Existing mutating routes generally do not use `withCsrfProtection()`.
- `tests/integration/csrf-protection.test.ts` currently documents expected future behavior for character PATCH but still expects current unprotected behavior in one test.

### Rate limiting

- `lib/middleware/rate-limit.ts` already provides:
  - `RateLimiter`
  - `authRateLimiter`
  - `withRateLimit()`
  - standard rate-limit headers.
- Auth routes do not currently import/wrap with it.
- `tests/integration/rate-limit-auth.test.ts` mostly asserts mock availability rather than actual route 429 behavior.

### Sync routes

- `app/api/sync/ownership/route.ts` and `app/api/sync/eliza-location-rooms/route.ts` require `SYNC_SECRET_KEY` via bearer token or query secret.
- `app/api/sync/staking/route.ts` currently accepts unauthenticated POST and calls `syncStakingState()`.
- `syncStakingState()` uses Supabase admin client and writes character staking state, so this route must be protected before parsing body or calling the sync service.

### Headers/build gates/dependencies

- `next.config.js`
  - `eslint.ignoreDuringBuilds: true`
  - `typescript.ignoreBuildErrors: true`
  - CORS headers only for fonts, images, animated pages, and metadata API.
  - No global security headers.
- `middleware.ts` explicitly avoids CSRF cookie on `/characters/:tokenId/animated` because marketplaces embed it in sandboxed cross-site iframes.
- `package.json` requests `next` and `eslint-config-next` as `^15.0.0`.
- `bun.lock` currently resolves Next-related packages to `15.5.6`, below the prior scan’s safe threshold `15.5.16`.

---

## 3. **Design**

### A. Dependency and build-gate hardening

Use a targeted dependency bump.

#### Package versions

Update:

- `next`
- `eslint-config-next`

to the same patched version line, minimum `15.5.16`.

Preferred package manifest target:

```jsonc
{
  "dependencies": {
    "next": "^15.5.16"
  },
  "devDependencies": {
    "eslint-config-next": "^15.5.16"
  }
}
```

Then regenerate `bun.lock` with Bun so all `next`, `@next/env`, `@next/swc-*`, `@next/eslint-plugin-next`, and `eslint-config-next` lock entries align.

#### Build gates

In `next.config.js`, remove or set false:

- `eslint.ignoreDuringBuilds`
- `typescript.ignoreBuildErrors`

Target final behavior:

- `bun run build` fails on TypeScript errors.
- `bun run build` fails on Next lint errors.

If existing unrelated issues surface, fix them directly rather than reintroducing global ignores.

---

### B. Session secret and secure nonce generation

Modify `lib/auth/session.ts`.

#### New behavior

- In production:
  - `SESSION_SECRET` must exist.
  - It must be at least 32 characters.
  - Missing/weak secret throws during module initialization.
- In non-production:
  - Missing `SESSION_SECRET` uses a dev-only fallback.
  - Weak explicitly configured `SESSION_SECRET` still throws, because an explicit weak secret is almost always a mistake.
- Replace `Math.random()` nonce generation with cryptographic randomness.

#### Interface impact

No public signature changes:

```ts
export async function getSession(): Promise<IronSession<UserSession>>
export function generateNonce(): string
```

`generateNonce()` should return the same style as `lib/auth/siwe.generateNonce()` unless a caller depends on old format. Use 32 hex characters for consistency.

#### Test impact

Update `tests/unit/session-validation.test.ts`:

- Set `NODE_ENV='production'` for missing/empty/short secret failure tests.
- Add non-production missing-secret test verifying import succeeds.
- Add test verifying short explicitly configured secret fails even outside production.
- Add `generateNonce()` format/uniqueness test if not already covered elsewhere.

---

### C. Trusted SIWE configuration and verification binding

Add a small auth config helper rather than scattering origin parsing.

#### New file: `lib/auth/siwe-config.ts`

Kind: internal module.

Responsibilities:

- Resolve trusted SIWE domain, URI, and chain ID.
- Fail closed in production if origin config is absent/invalid.
- Permit request-derived fallback only in non-production.

Recommended env names:

1. `WAGDIE_APP_ORIGIN` — preferred canonical origin, e.g. `https://wagdie.example`
2. Fallbacks, in order:
   - `NEXT_PUBLIC_APP_URL`
   - `NEXTAUTH_URL`
   - `VERCEL_PROJECT_PRODUCTION_URL`
   - `VERCEL_URL`

Chain ID env order:

1. `SIWE_CHAIN_ID`
2. `NEXT_PUBLIC_CHAIN_ID`
3. `CHAIN_ID`
4. Default `1`

Expose shapes like:

```ts
type TrustedSiweConfig = {
  domain: string
  uri: string
  chainId: number
}

function getTrustedSiweConfig(request?: NextRequest): TrustedSiweConfig
```

Contract:

- `uri` is normalized origin only: protocol + host, no path, no trailing slash.
- `domain` is `new URL(uri).host`.
- In production, request headers must not be used as fallback.
- In non-production only, if no env origin exists, derive from request host/proto as current code does.

#### Modify `lib/auth/siwe.ts`

Extend verification options additively:

```ts
type VerifySiweExpectedFields = {
  nonce?: string
  domain?: string
  uri?: string
  chainId?: number
  address?: string
}

verifySiweMessage(
  message: string,
  signature: string,
  expected?: VerifySiweExpectedFields
): Promise<{ success: boolean; address?: string; error?: string }>
```

Behavior:

1. Parse `SiweMessage`.
2. Before or immediately after signature verification, compare expected fields:
   - nonce exact match
   - domain exact match
   - URI exact normalized origin match
   - chain ID numeric match
   - address lowercased match when provided
3. Call SIWE library verification with at least `signature`, and pass `domain`/`nonce` if the library supports them.
4. Return `{ success: false, error: 'Invalid SIWE message' }` for field mismatches; do not leak which trusted field failed beyond logs.

Add a helper if useful:

```ts
validateSiweMessageFields(message: string, expected: VerifySiweExpectedFields): { ok: true } | { ok: false; error: string }
```

Use it in legacy Eliza mode before delegating to Eliza so request-derived/stale stored messages cannot bypass trusted binding.

#### Main auth route changes

`app/api/auth/nonce/route.ts`

- Resolve trusted config.
- Keep returning `nonce`.
- Additively include `domain`, `uri`, and `chainId` only if existing clients tolerate extra fields. Existing tests only assert `nonce`, so this is safe unless strict consumers exist.
- If production config is invalid, return 500 with existing raw error style.

`app/api/auth/verify/route.ts`

- Resolve trusted config from server env/request fallback.
- Keep cookie nonce comparison.
- Pass expected fields to `verifySiweMessage()`:

```ts
expected = {
  nonce,
  domain: trusted.domain,
  uri: trusted.uri,
  chainId: trusted.chainId,
}
```

Preserve existing response bodies/status codes where possible:

- Missing body fields: 400
- Missing nonce cookie: 400
- Nonce mismatch: 401
- Verification failure: 401
- Unexpected config/runtime errors: 500

#### Eliza auth route changes

`app/api/eliza/auth/nonce/route.ts`

- Replace request-derived `domain`/`uri` with `getTrustedSiweConfig(request)`.
- Replace hardcoded `chainId: 1` with trusted config chain ID.
- Store message exactly as generated.

`app/api/eliza/auth/verify/route.ts`

- Resolve trusted config.
- In official mode:
  - Call `verifySiweMessage(message, signature, { ...trusted, address: session.address })`.
- In legacy mode:
  - Validate stored message fields against trusted config and session address before `elizaClient.auth.verify(...)`.
  - Do not verify signature locally in legacy mode unless doing so is known to be compatible with the delegated flow.

---

### D. Auth rate limiting

Use existing `withRateLimit()`; no new limiter type is needed.

#### Routes to wrap

- `GET /api/auth/nonce`
- `POST /api/auth/nonce`
- `POST /api/auth/verify`
- `POST /api/eliza/auth/nonce`
- `POST /api/eliza/auth/verify`

#### Wrapper order

For verify routes that also get CSRF:

```ts
export const POST = withRateLimit(withCsrfProtection(handlePost))
```

This means:

1. Rate limit blocks brute force first.
2. CSRF validation runs before parsing sensitive bodies/signatures.
3. Handler runs only if both pass.

For nonce routes:

```ts
export const GET = withRateLimit(handleNonceRequest)
export const POST = withRateLimit(handleNonceRequest)
```

#### Response contracts

- 429 response body remains from `withRateLimit()`:
  - `{ error: 'Too many requests. Please try again later.' }`
- Include:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
  - `Retry-After` on blocked responses.

---

### E. CSRF protection for selected cookie-authenticated mutations

Use `lib/middleware/csrf.ts`.

#### Routes to protect now

Apply narrowly to avoid breaking cron/API-client routes:

1. `POST /api/auth/verify`
2. `POST /api/auth/logout`
3. `POST /api/eliza/auth/nonce`
4. `POST /api/eliza/auth/verify`
5. `PATCH /api/characters/[tokenId]`
6. `PATCH /api/character/[tokenId]`

Do **not** apply in this change to:

- `/api/sync/**` routes — they use bearer/query sync secret instead.
- public lore submission routes — they already have their own rate limiting and may not be browser-session authenticated.
- searing sync route — transaction verification flow is public and not cookie-authenticated.
- manual location room tick route in this pass, because selected script context uses cookie-based harness calls and client plumbing is not fully selected.

#### Helper compatibility

Update `withCsrfProtection()` typing to support route param context generically. Runtime behavior can remain unchanged.

Illustrative shape:

```ts
function withCsrfProtection<P extends Record<string, string>>(
  handler: (
    request: NextRequest,
    context?: { params: Promise<P> }
  ) => Promise<NextResponse>
)
```

#### Client plumbing

Update `lib/api/client.ts` so unsafe same-origin requests automatically include `X-CSRF-Token` from the `csrf-token` cookie when:

- running in browser,
- method is not `GET`, `HEAD`, or `OPTIONS`,
- caller did not already set `X-CSRF-Token`,
- request is not using an `Authorization` header.

Validation required during implementation:

- Search for direct browser `fetch('/api/auth/verify'...)`, `fetch('/api/auth/logout'...)`, `fetch('/api/eliza/auth/nonce'...)`, `fetch('/api/eliza/auth/verify'...)`, and character PATCH callers.
- Update any direct callers to use either:
  - existing API client after it is fixed, or
  - a small shared client-side helper that reads `csrf-token` and adds `X-CSRF-Token`.

---

### F. Protect staking sync route with sync secret

Add shared sync auth helper to avoid duplicating local `verifyAuthorization()` logic.

#### New file: `lib/api/sync-auth.ts`

Kind: internal server helper.

Responsibilities:

```ts
function verifySyncAuthorization(request: NextRequest): boolean
```

Behavior:

- Read `SYNC_SECRET_KEY`.
- If missing, log `SYNC_SECRET_KEY not configured` and return false.
- Accept:
  - `Authorization: Bearer <secret>`
  - `?secret=<secret>`
- Prefer constant-time comparison when possible.
- Trim only the `Bearer ` prefix; do not trim or normalize secret values otherwise.

#### Modify sync routes

- `app/api/sync/staking/route.ts`
  - Call `verifySyncAuthorization(request)` before parsing JSON body.
  - If false, return `jsonNoStore({ results: [], error: 'Unauthorized' }, { status: 401 })` to preserve the route’s `{ results, error }` shape.
  - Ensure `syncStakingState()` is not called on unauthorized requests.

- Optionally migrate for consistency:
  - `app/api/sync/ownership/route.ts`
  - `app/api/sync/eliza-location-rooms/route.ts`

Keep their existing unauthorized body/status shape:

- ownership/location-room sync currently return raw `{ error: 'Unauthorized' }` via `jsonRawError`.

---

### G. Global security headers with animated-page exception

Modify `next.config.js`.

#### Required headers

Apply to normal app/API responses:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: ...`
- Optional low-risk additions:
  - `X-DNS-Prefetch-Control: off`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

#### CSP baseline

Use a broad compatibility CSP to avoid breaking wallet/map/media behavior:

```txt
default-src 'self';
base-uri 'self';
object-src 'none';
form-action 'self';
frame-ancestors 'none';
script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
media-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https: wss:;
frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;
```

#### Preserve marketplace embedding

Do not send `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` for:

- `/characters/:tokenId/animated`
- `/characters/:tokenId/animated/`

Keep existing CORS headers for that route.

Implementation options:

- Preferred: use a custom header source that excludes animated pages via negative pattern and a separate animated-page header entry with only safe non-frame headers.
- Validate in tests that animated route does not receive `X-Frame-Options` or `frame-ancestors`.

Existing CORS-specific paths must retain:

- `/fonts/:path*`
- `/images/characters/:path*`
- `/characters/:tokenId/animated`
- `/api/characters/metadata/:tokenId`

---

## 4. **File-by-file impact**

### `package.json`

- Update `next` to `^15.5.16` or newer patched version.
- Update `eslint-config-next` to same aligned version.
- No script changes required.

Depends on: none.

---

### `bun.lock`

- Regenerate with Bun after package changes.
- Verify locked versions for:
  - `next`
  - `@next/env`
  - `@next/eslint-plugin-next`
  - `eslint-config-next`
  - all `@next/swc-*`

Depends on: `package.json`.

---

### `next.config.js`

- Remove/disable build ignores.
- Add reusable security header constants.
- Update `headers()` to apply global security headers while preserving existing CORS header rules and animated-page embedding exception.

Depends on: none.

---

### `lib/auth/session.ts`

- Add session secret validation at module initialization.
- Remove production hardcoded fallback.
- Keep dev-only fallback for missing local secret.
- Replace `Math.random()` nonce generation with crypto-secure generation.

Depends on: none.

---

### `lib/auth/siwe-config.ts` **new**

- Add trusted SIWE config resolver.
- Normalize app origin/domain and chain ID.
- Enforce production fail-closed behavior.

Depends on: `next/server` type only if accepting `NextRequest`.

---

### `lib/auth/siwe.ts`

- Extend `verifySiweMessage()` with expected-field options.
- Validate nonce/domain/URI/chain/address.
- Keep old two-argument call sites working.

Depends on: `lib/auth/siwe-config.ts` only if shared types are imported; otherwise keep independent.

---

### `lib/middleware/csrf.ts`

- Update wrapper typing to support specific route params.
- Do not change runtime validation semantics unless necessary.

Depends on: none.

---

### `lib/api/client.ts`

- Add browser-side CSRF header injection for unsafe same-origin requests.
- Preserve existing URL construction and caller-provided headers.
- Do not add CSRF header when an `Authorization` header is present.

Depends on: `CSRF_COOKIE_NAME`/`CSRF_HEADER_NAME` constants or duplicate literal names if importing server-oriented module causes bundling concerns. Prefer a tiny shared constants module only if import causes client issues.

---

### `lib/api/sync-auth.ts` **new**

- Add shared `verifySyncAuthorization(request)` helper.

Depends on: `next/server`, Node crypto if using timing-safe comparison.

---

### `app/api/auth/nonce/route.ts`

- Change handlers to accept `NextRequest`.
- Resolve trusted SIWE config.
- Apply `withRateLimit()` to GET and POST.
- Optionally include `domain`, `uri`, `chainId` in response.

Depends on: `lib/auth/siwe-config.ts`, `lib/middleware/rate-limit.ts`.

---

### `app/api/auth/verify/route.ts`

- Extract internal `handlePost(request)`.
- Wrap export with `withRateLimit(withCsrfProtection(handlePost))`.
- Resolve trusted SIWE config.
- Pass expected nonce/domain/URI/chain to `verifySiweMessage()`.

Depends on: SIWE config, SIWE verifier, CSRF/rate-limit wrappers.

---

### `app/api/auth/logout/route.ts`

- Extract internal `handlePost()`.
- Wrap `POST` with `withCsrfProtection()`.

Depends on: CSRF wrapper.

---

### `app/api/eliza/auth/nonce/route.ts`

- Use trusted SIWE config instead of request-derived host/origin.
- Use configured chain ID instead of hardcoded `1`.
- Wrap `POST` with `withRateLimit(withCsrfProtection(handlePost))`.

Depends on: SIWE config, CSRF/rate-limit wrappers.

---

### `app/api/eliza/auth/verify/route.ts`

- Resolve trusted SIWE config.
- Official mode: pass expected domain/URI/chain/address into `verifySiweMessage()`.
- Legacy mode: validate stored SIWE message fields before delegating.
- Wrap `POST` with `withRateLimit(withCsrfProtection(handlePost))`.

Depends on: SIWE config, SIWE verifier/field validator, CSRF/rate-limit wrappers.

---

### `app/api/characters/[tokenId]/route.ts`

- Wrap only `PATCH` export with `withCsrfProtection()`.
- Leave `GET` unchanged.

Depends on: CSRF wrapper typing.

---

### `app/api/character/[tokenId]/route.ts`

- Same as plural route: wrap only `PATCH`.
- Preserve backward-compatible alias behavior.

Depends on: CSRF wrapper typing.

---

### `app/api/sync/staking/route.ts`

- Add authorization check before JSON body parsing.
- Unauthorized response shape: `{ results: [], error: 'Unauthorized' }`, status `401`, `Cache-Control: no-store`.
- Ensure `syncStakingState()` is not called unless authorized.

Depends on: `lib/api/sync-auth.ts`.

---

### `app/api/sync/ownership/route.ts`

- Replace local `verifyAuthorization()` with shared helper.
- Preserve response body/status.

Depends on: `lib/api/sync-auth.ts`.

---

### `app/api/sync/eliza-location-rooms/route.ts`

- Replace local `verifyAuthorization()` with shared helper.
- Preserve response body/status.

Depends on: `lib/api/sync-auth.ts`.

---

### Tests

#### `tests/unit/session-validation.test.ts`

- Update env-sensitive expectations.
- Add secure nonce coverage for `lib/auth/session.generateNonce()`.

#### `tests/integration/auth-nonce.test.ts`

- Create `NextRequest` objects for GET/POST because route handlers now accept request.
- Assert 429 behavior when mocked limiter blocks.
- Adjust expected response if additive SIWE config fields are returned.

#### `tests/integration/auth-verify.test.ts`

- Include matching CSRF cookie/header for success-path tests.
- Add explicit missing-CSRF test expecting 403.
- Set trusted SIWE origin/chain env in setup.
- Ensure nonce/domain/chain mismatch tests return 401.

#### `tests/integration/rate-limit-auth.test.ts`

- Strengthen tests to call actual route exports and assert 429 status/body.
- Cover nonce and verify routes.

#### `tests/integration/csrf-protection.test.ts`

- Replace “currently allow without CSRF” test with expected 403.
- Add success test with matching cookie/header.
- Keep Authorization-header bypass test if route auth still permits.

#### `tests/api/eliza/auth-routes.test.ts`

- Add trusted SIWE config env setup.
- Add CSRF header/cookie to protected POST requests.
- Assert official nonce message uses trusted domain/URI/chain, not request spoofed host.
- Assert official verify calls `verifySiweMessage()` with expected fields.

#### `tests/api/sync-staking-route.test.ts`

- Add unauthorized test:
  - no `SYNC_SECRET_KEY` or wrong/missing secret
  - expect 401
  - expect `syncStakingState` not called.
- Update existing tests to include valid bearer or query secret.
- Add query-secret and bearer-secret success coverage.

#### `tests/e2e/security-headers.test.ts`

- Convert from static expectations to importing `next.config.js` and calling `headers()`.
- Assert:
  - normal routes receive XFO/CSP/nosniff/referrer policy.
  - animated route retains CORS and does not receive frame-denying headers.
  - metadata route retains CORS headers.

---

## 5. **Risks and migration**

- **Production env requirement:** deployments must set `SESSION_SECRET` and trusted SIWE origin before release:
  - `SESSION_SECRET`
  - `WAGDIE_APP_ORIGIN`
  - optionally `SIWE_CHAIN_ID`
- **CSRF rollout:** protected browser POST/PATCH callers must send `X-CSRF-Token`. Update shared API client and direct fetch callers in the same atomic change as route wrappers.
- **SIWE clients:** if the wallet client constructs SIWE messages with a different domain/URI/chain than the new trusted config, verification will fail. Ensure frontend uses the same origin/chain values returned by `/api/auth/nonce` or already matches deployment origin.
- **Build gates:** re-enabling build checks may expose unrelated latent errors. Fix them directly; do not re-disable global gates.
- **Dependency lock:** do not manually edit partial `bun.lock` slices. Regenerate the full lockfile.

---

## 6. **Implementation order**

1. **Dependency/build config**
   - Update `package.json`.
   - Regenerate `bun.lock`.
   - Re-enable build gates in `next.config.js`.

2. **Session hardening**
   - Update `lib/auth/session.ts`.
   - Update `tests/unit/session-validation.test.ts`.

3. **Trusted SIWE config**
   - Add `lib/auth/siwe-config.ts`.
   - Extend `lib/auth/siwe.ts`.
   - Update SIWE unit/integration tests for trusted fields.

4. **Rate limiting**
   - Wrap auth nonce/verify and Eliza auth nonce/verify routes.
   - Strengthen rate-limit tests.

5. **CSRF route protection and client plumbing** — land atomically
   - Update CSRF wrapper typing.
   - Update `lib/api/client.ts`.
   - Wrap selected auth/Eliza/character mutation routes.
   - Update direct frontend callers found by search.
   - Update CSRF/auth tests.

6. **Staking sync authorization**
   - Add `lib/api/sync-auth.ts`.
   - Protect staking route before body parsing.
   - Optionally migrate ownership/location-room sync routes to shared helper.
   - Update sync route tests.

7. **Security headers**
   - Add global headers in `next.config.js`.
   - Preserve animated route embedding.
   - Update security header tests to inspect actual config.

8. **Final validation**
   - Run focused tests listed in the task.
   - Run `bun run lint`.
   - Run `bun run build`.
   - Run package audit if available and confirm no remaining critical/high Next-related findings.


---

## Orchestrator progress

- [x] Config/dependency/security-header track: `package.json` Next ranges bumped to `^15.5.16`, `bun.lock` regenerated to Next 15.5.19, build lint/type ignores removed, global security headers added with animated-page embedding exception, and `tests/e2e/security-headers.test.ts` updated/passing. Note: `bun run build` now compiles then fails on existing unrelated lint issues because the lint gate is active.
- [x] Auth/SIWE/rate-limit/CSRF track: session hardening, trusted SIWE config/verification, auth rate limiting, narrow CSRF route wrappers, CSRF client plumbing, and focused tests completed in session `34460131-449A-47B9-BE9A-807AF37471FE`. Remaining reported failures are unrelated repo-wide lint/type/test issues.
- [x] Sync staking authorization track: `lib/api/sync-auth.ts` added, `/api/sync/staking` now requires sync authorization before body parsing/admin writes, comparable sync routes migrated to shared helper, and `tests/api/sync-staking-route.test.ts` passed (8 tests).
- [ ] Final validation/fixup track: pending.

> 💡 Continue this plan conversation with ask_oracle(chat_id: "security-fixes-BB8374", new_chat: false)