# Chat Streaming Session Recovery: Plan

## Goal
Fix live public character chat streaming so first-turn/fresh chats recover from Official ElizaOS `SESSION_NOT_FOUND` responses, empty upstream streams do not masquerade as successful assistant replies, and the recently updated chatbar can safely rely on the backend to mint and return the WAGDIE conversation id.

The plan is intentionally not a chatbar refactor. First-turn `conversationId: null` from the browser is valid and must remain supported; Official ElizaOS session ids stay server-side.

## Background
- Current incident report: `docs/investigations/live-chat-streaming-failure-2026-05-30.md:3-4` identifies the live failure class: `/api/eliza/chat` reaches Official ElizaOS, but fresh no-conversation streams hit upstream `404 SESSION_NOT_FOUND`; OK-but-empty SSE can be reported as success.
- Production evidence: `docs/investigations/live-chat-streaming-failure-2026-05-30.md:24-51` records token `4073`, `hasConversationId: false`, one empty complete with `hasContent: false`, and repeated upstream `SESSION_NOT_FOUND` 404s.
- Frontend chatbar behavior: `hooks/useCharacterChat.ts:60-64` initializes `conversationId` to `null`; `hooks/useCharacterChat.ts:101-112` posts the current `conversationId` to `/api/eliza/chat`; `hooks/useCharacterChat.ts:189-198` sets it only after a successful `complete` event. First-turn errors therefore retry as fresh backend chats.
- Chatbar persistence/restore: `components/chat/ChatSidebar.tsx:139-144` writes conversation id to localStorage only after one exists; `components/chat/ChatSidebar.tsx:153-172` restores only after auth and conversation-list validation. `components/chat/ChatSidebar.tsx:190-204` selects existing conversations or intentionally clears state for New Chat.
- Dock scope: `contexts/ChatDockContext.tsx:4-31` carries `tokenId`, `characterName`, and `characterId`; `components/chat/ChatDock.tsx:12-19` mounts `ChatSidebar` keyed by `target.tokenId`, so first-turn `conversationId: null` is expected behavior, not a chatbar bug by itself.
- API bridge: `app/api/eliza/chat/route.ts:23` accepts optional `conversationId`; `app/api/eliza/chat/route.ts:89-94` logs `hasConversationId`; `app/api/eliza/chat/route.ts:172-185` passes `body.conversationId` into `serverClient.chat.sendMessageStream`; `app/api/eliza/chat/route.ts:188-207` turns setup failures into SSE `error` events.
- Official client fresh/reuse seam: `lib/eliza/official/client.ts:353-367` creates an official session and WAGDIE mapping when no conversation id is supplied; `lib/eliza/official/client.ts:370-383` sends to `link.officialSessionId`; `lib/eliza/official/client.ts:387-393` retries/rebinds only for `response.status === 404 && input.conversationId`, so fresh chats do not recover.
- Mapping model: `supabase/migrations/20260510020000_create_eliza_official_conversation_links.sql:4-22` defines `eliza_official_conversation_links`; `lib/eliza/officialConversationRepository.ts:151-184` creates WAGDIE conversation mappings; `lib/eliza/officialConversationRepository.ts:237-261` rebinds an existing row; `lib/eliza/officialConversationRepository.ts:300-325` records errors while keeping rows active.
- Messaging seam: `lib/eliza/official/messaging.ts:99-121` normalizes create-session responses; `lib/eliza/official/messaging.ts:137-145` detects `SESSION_NOT_FOUND`; `lib/eliza/official/messaging.ts:197-214` posts to `/api/messaging/sessions/{sessionId}/messages`; `lib/eliza/official/messaging.ts:372-424` already implements one-shot missing-session recovery for ephemeral flows.
- SSE seam: `lib/eliza/official/stream.ts:109-136` throws for non-OK/bodyless upstream responses; `lib/eliza/official/stream.ts:152-207` handles `chunk`, `done`/`complete`, and `error`; `lib/eliza/official/stream.ts:256-267` currently calls `onComplete` at EOF even when `fullText` is empty and no supported terminal event arrived.
- Frontend SSE consumer: `hooks/useCharacterChat.ts:175-200` handles `token`, `complete`, and `error`; empty `complete` appends an assistant message and stores the returned conversation id even if the content is blank.
- Existing tests: `tests/api/eliza/official-client.test.ts:408-452` covers fresh official chat success; `tests/api/eliza/official-client.test.ts:607-641` covers existing mapping reuse; `tests/lib/eliza/official-messaging.test.ts:203-245` covers ephemeral `SESSION_NOT_FOUND` recovery; `tests/lib/eliza/official-messaging.test.ts:247-278` covers no recovery for generic 404; `tests/lib/eliza/official-stream.test.ts:20-83` covers errors and valid complete cases but not OK empty EOF or unsupported-only streams.
- Smoke prior art: `scripts/elizaos-official-smoke.ts:413-467` treats direct service SSE without token-like data and terminal events as failure; `scripts/elizaos-route-parity.ts:303-340` checks `/api/eliza/chat` emits known events, requires token output, and requires `complete.conversationId`.
- Recent git prior art: `7befe0a8 fix: normalize official eliza sessions` touched `lib/eliza/official/messaging.ts` normalization/recovery; `f9262b46 fix: improve elizaos gm output reliability` touched official stream handling/tests; `91c3f561 fix: restore character chat alongside persona assistant` restored public chat surfaces.

## Approach
Use a targeted hardening pass across the Official chat boundary:

1. Preserve the frontend contract: `conversationId: null` on first turn remains valid. The backend creates the WAGDIE conversation row and returns that id on successful non-empty completion.
2. Preserve the WAGDIE conversation id after the backend creates the local mapping. Recovery should rebind only the hidden Official ElizaOS `official_session_id`, never expose or replace it in the browser contract.
3. Centralize true `SESSION_NOT_FOUND` classification so the app recovers only upstream session-loss responses, not every 404.
4. Reuse the existing Official session/mapping seams (`createSession`, `sendSessionMessage`, `rebindSession`) rather than adding a parallel session system.
5. Apply one-shot missing-session recovery to both fresh and existing persisted public chats.
6. Fail closed on empty, unsupported, or truncated Official SSE streams before they become route `complete` events.
7. Add route and hook-level defensive guards so blank completion cannot store an empty assistant message if an adapter regresses later.
8. Extend tests, smoke coverage, and logs around first-turn fresh chat, existing conversation reuse, stale-session rebind, and non-empty assistant content.

## Work Items

### Item 1 — Centralize true `SESSION_NOT_FOUND` classification
**Goal:** Provide a shared classifier that can distinguish recoverable Official session-loss responses from generic 404s.

**Done when:**
- `lib/eliza/official/messaging.ts` has one shared body/status classification helper used by both response-based and error-based `SESSION_NOT_FOUND` checks.
- The response classifier inspects `response.clone()` and does not consume the original body.
- The classifier returns true for structured `{ error: { code: 'SESSION_NOT_FOUND' } }`, literal `SESSION_NOT_FOUND`, and plain-language “session not found” 404 bodies.
- The classifier returns false for non-404 statuses and generic 404s such as missing route/agent.
- Existing ephemeral recovery uses the same semantics through the shared helper; avoid parallel, diverging classifiers.
- Tests cover true structured/plain missing-session bodies, generic 404, non-404, and body re-read safety.

**Key files:**
- `lib/eliza/official/messaging.ts:137-145`
- `lib/eliza/official/messaging.ts:197-214`
- `tests/lib/eliza/official-messaging.test.ts:203-278`

**Dependencies:** None.

**Size:** Small.

### Item 2 — Add persisted public-chat missing-session recovery
**Goal:** Make fresh and existing Official public chats recover once when the Official session used for message streaming is missing.

**Done when:**
- `lib/eliza/official/client.ts` uses the shared classifier after `sendSessionMessage()` and before stream collection.
- The existing broad `response.status === 404 && input.conversationId` block is replaced, not augmented, by a one-shot helper reused by fresh and existing paths.
- Fresh no-`conversationId` chat flow creates a WAGDIE mapping, detects true `SESSION_NOT_FOUND`, creates a replacement Official session, rebinds the same WAGDIE link via `conversationRepository.rebindSession()`, retries once, and returns the original WAGDIE conversation id on success.
- Existing mapped chat flow performs the same true-missing-session rebind/retry once.
- Generic 404s do not rebind or retry; this is an intentional behavior tightening so route/config/agent problems stay visible.
- The intermediate pre-recovery missing-session response does not call `recordError()`; only final retry failure records an error. Successful rebind clears `last_error` through `rebindSession()`.
- Replacement-session rebind failure best-effort deletes the replacement session and surfaces the mapping error. Best-effort deletion of the old missing Official session is allowed but should not block success.
- Recovery checks `input.signal?.aborted` before creating a replacement session and passes the same abort signal to the retry send.
- Official session ids remain server-only; route/frontend still receive only the WAGDIE conversation id.
- Safe logs identify creation, recovery attempt/result, generic 404, WAGDIE conversation id, old/new Official session id, token id, agent id, and fresh-vs-existing state without message content or secrets.

**Key files:**
- `lib/eliza/official/client.ts:353-424`
- `lib/eliza/officialConversationRepository.ts:237-261`
- `lib/eliza/officialConversationRepository.ts:300-325`
- `tests/api/eliza/official-client.test.ts:408-452`
- `tests/api/eliza/official-client.test.ts:607-641`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Fail closed on empty/truncated/unsupported Official SSE
**Goal:** Prevent upstream OK responses with no assistant content from becoming successful blank assistant messages.

**Done when:**
- `streamOfficialElizaSse()` tracks meaningful assistant content, supported terminal events, seen event types, and byte/content counts.
- Success requires a supported terminal event (`done` or `complete`) and non-empty assistant content.
- Recognized assistant content remains the existing supported set: non-empty `chunk` events from `chunk`/`text`/`content` or nested `delta.content`, `data.chunk`, `data.text`, `data.content.text`; terminal `done`/`complete` content from accumulated chunks or final `text`, `content`, `message`, `data.text`, `data.content`, `data.message`, `response.text`, or `response.content`.
- Raw string terminal payload support is not broadened until captured Official ElizaOS samples prove it is needed.
- HTTP 200 empty body, unsupported-only events, chunk-without-terminal, terminal-without-content, and EOF-without-terminal throw a route-safe `WagdieElizaError` with `code: 'API_ERROR'`, `statusCode: 502`, and `isRetryable: true` instead of calling `onComplete`.
- Existing valid chunk + terminal and terminal-content-only cases still succeed.
- Error details include safe diagnostics such as reason, event types, content length, and bytes read; exact reason-string names are implementation-owned.
- Tests cover empty body, unsupported-only stream, chunk-without-terminal, empty terminal, terminal-content-only success, and existing error behavior.

**Key files:**
- `lib/eliza/official/stream.ts:109-136`
- `lib/eliza/official/stream.ts:152-207`
- `lib/eliza/official/stream.ts:256-267`
- `tests/lib/eliza/official-stream.test.ts:20-83`

**Dependencies:** None.

**Size:** Medium.

### Item 4 — Add route-level safety guards
**Goal:** Keep `/api/eliza/chat` tolerant of first-turn `conversationId: null` while blocking blank gateway completions.

**Done when:**
- `app/api/eliza/chat/route.ts` normalizes `null`, missing, empty, or whitespace-only `conversationId` to `undefined` before logging and passing into the gateway.
- `hasConversationId` logs use the normalized value.
- `onComplete` validates `message.content.trim()` before sending route `event: complete`.
- Blank completion emits route `event: error` with a stable code such as `EMPTY_ASSISTANT_MESSAGE` and does not emit `complete`.
- Tests cover null normalization, successful non-empty complete, blank completion as SSE `error`, and official user id propagation remaining intact.

**Key files:**
- `app/api/eliza/chat/route.ts:23`
- `app/api/eliza/chat/route.ts:89-94`
- `app/api/eliza/chat/route.ts:126-166`
- `app/api/eliza/chat/route.ts:172-185`
- `tests/api/eliza/chat.test.ts:188-301`

**Dependencies:** Item 3 should land before this guard, or both should land in the same PR so parser and route behavior agree. Item 2 is independent.

**Size:** Small.

### Item 5 — Harden the chatbar hook without changing ownership of sessions
**Goal:** Keep the chatbar as a WAGDIE conversation consumer, not an Official session creator, while preventing blank/malformed `complete` events from persisting state.

**Done when:**
- `useCharacterChat` still sends first-turn requests with no usable conversation id and does not generate Official session ids client-side.
- On route `complete`, final assistant content is derived from streamed token content first, then `data.content`.
- Blank final content raises `CharacterChatError` with `EMPTY_ASSISTANT_MESSAGE`, does not append an assistant message, and does not call `setConversationId()`.
- Missing or non-string `data.conversationId` raises `MISSING_CONVERSATION_ID` and does not persist state.
- Route `error` events continue to remove the optimistic user message and leave `conversationId` unchanged.
- Hook tests are added if a minimal harness is available; otherwise the implementation notes why route/smoke coverage is the guardrail and avoids creating a broad component test harness.
- `ChatSidebar` needs no structural change beyond normal error display for new error codes.

**Key files:**
- `hooks/useCharacterChat.ts:60-64`
- `hooks/useCharacterChat.ts:101-112`
- `hooks/useCharacterChat.ts:175-218`
- `components/chat/ChatSidebar.tsx:139-172` (read-only context unless error copy needs adjustment)
- `components/chat/ChatSidebar.tsx:190-204` (read-only context unless error copy needs adjustment)

**Dependencies:** Item 4 for route error code consistency.

**Size:** Small to medium, depending on test harness availability.

### Item 6 — Strengthen smoke/manual validation
**Goal:** Make regressions visible outside unit tests, especially in first-turn route behavior and stale Official session recovery.

**Done when:**
- `scripts/elizaos-official-smoke.ts` requires non-empty assistant content and a supported terminal event for direct Official SSE.
- `scripts/elizaos-route-parity.ts` sends a first-turn request without `conversationId`, asserts non-empty token/content, asserts `complete.conversationId`, and confirms no Official session id leaks to the response.
- Route parity sends a second message with the returned WAGDIE conversation id and verifies existing-conversation reuse.
- Live validation can target token `4073` if still persona-ready, otherwise an equivalent live character.
- The stale-session drill remains in the Validation Plan rather than becoming required smoke-script functionality.

**Key files:**
- `scripts/elizaos-official-smoke.ts:413-467`
- `scripts/elizaos-route-parity.ts:303-340`

**Dependencies:** Items 2–5.

**Size:** Medium.

### Item 7 — Add rollout observability and deployment checks
**Goal:** Provide enough production signal to prove the fix worked and distinguish upstream ElizaOS volatility from app regressions.

**Done when:**
- New logs are searchable for official session creation, missing-session recovery attempt, recovery success/failure, non-recoverable 404, empty stream blocked, and empty assistant completion blocked.
- Logs include enough safe correlation data to connect WAGDIE conversation id, Official session id, token/agent id, fresh-vs-existing state, upstream status/code, event types, and content length; exact field names are implementation-owned.
- Logs do not include message content, API keys, raw wallet addresses, or long upstream bodies.
- Deployment checklist verifies app official mode, internal `ELIZAOS_BASE_URL`, app/service auth token match, shared Docker network, ElizaOS DB config, service health, and current `@elizaos/server` pin.
- Post-release monitoring checks `SESSION_NOT_FOUND`, recovery counts, `Stream setup failed`, `Empty assistant completion blocked`, `hasContent: false`, and route parity failures.

**Key files:**
- `lib/eliza/official/client.ts:395-435`
- `lib/eliza/official/stream.ts:109-136`
- `app/api/eliza/chat/route.ts:132-207`
- `docker-compose.yml:172-174` (deployment-check reference)
- `docker-compose.yml:231-236` (deployment-check reference)
- `.env.example:84-93` (deployment-check reference)
- `services/elizaos/package.json` (deployment-check reference)

**Dependencies:** Items 2–4 for log locations.

**Size:** Small.

## Implementation Order
1. Item 1 — classifier and tests.
2. Item 2 — persisted chat recovery and official-client tests.
3. Item 3 — strict Official SSE parser and stream tests.
4. Item 4 — route normalization/blank-complete guard and route tests.
5. Item 5 — hook defensive handling and hook tests where feasible.
6. Item 6 — smoke/manual validation scripts.
7. Item 7 — deployment checklist, logs, and production monitoring pass.

Run targeted tests after each related item, then run the relevant chat/Eliza group before deployment:

```bash
bun run test -- tests/lib/eliza/official-messaging.test.ts
bun run test -- tests/api/eliza/official-client.test.ts
bun run test -- tests/lib/eliza/official-stream.test.ts
bun run test -- tests/api/eliza/chat.test.ts
bun run test -- tests/hooks/useCharacterChat.test.tsx # if added
```

## Validation Plan
1. **Local unit/integration:** all tests listed in work items pass; no generic 404 recovery; no blank `complete` path.
2. **Official-mode staging/dev:** verify `ELIZA_INTEGRATION_MODE=official`, internal `ELIZAOS_BASE_URL`, app/service auth token match, shared Docker network, service DB config, and health endpoint.
3. **Direct Official smoke:** non-empty assistant content and terminal event required.
4. **Route parity smoke:** first-turn request omits `conversationId`; response includes non-empty content and WAGDIE `conversationId`; second message with that id succeeds.
5. **Event-shape sampling:** if no recent successful Official SSE samples exist, capture safe event type/terminal payload-shape metadata before broadening parser compatibility beyond the existing supported fields.
6. **Stale-session drill:** delete the hidden Official session for a known WAGDIE conversation, send again with the WAGDIE id, confirm recovery log, rebind, same returned WAGDIE id, and non-empty assistant content.
7. **Production rollout:** deploy app image, run route parity against token `4073` or an equivalent persona-ready token, then monitor old/new failure counters for the first production window.

## Risks and Rollback
- **Classifier too strict:** Some upstream missing-session bodies may not include the expected code/string. Mitigate with structured code, literal string, and phrase matching; log generic 404 snippets for tuning.
- **Parser too strict:** Official ElizaOS may emit valid assistant content under an unsupported event name. Mitigate by capturing event names in safe logs and broadening support only from observed samples.
- **Duplicate upstream sends:** Retry only when upstream says the session does not exist; do not retry generic stream failures.
- **Behavior change for existing generic 404:** Existing conversations no longer rebind on all 404s. This is intentional so route/config problems remain visible.
- **Blank successes become user-visible errors:** Desired behavior; users see retryable errors instead of blank assistant messages.

Rollback is app-only: no schema migration is required because `eliza_official_conversation_links` already supports rebind via `official_session_id` updates. If parser strictness blocks valid streams, roll back that part or broaden parser support using captured upstream event samples.

## Open Questions
- What exact successful non-empty SSE event shapes does Official ElizaOS emit in production today? This does not block the fix, but should guide any parser compatibility expansion beyond existing `chunk`, `done`, and `complete` support.
- Is a hook test harness already available enough to test `useCharacterChat` cheaply, or should hook behavior be covered by route/parity smoke for this fix and a separate test-harness cleanup later?

## References
- `docs/investigations/live-chat-streaming-failure-2026-05-30.md`
- `docs/investigations/ai-persona-chat-not-working-2026-05-29.md`
- `app/api/eliza/chat/route.ts`
- `hooks/useCharacterChat.ts`
- `components/chat/ChatSidebar.tsx`
- `lib/eliza/official/client.ts`
- `lib/eliza/official/messaging.ts`
- `lib/eliza/official/stream.ts`
- `lib/eliza/officialConversationRepository.ts`
- `scripts/elizaos-official-smoke.ts`
- `scripts/elizaos-route-parity.ts`
