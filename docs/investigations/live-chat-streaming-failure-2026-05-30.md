# Investigation: Live Chat Streaming Failure

## Summary
Live chat requests are reaching `/api/eliza/chat` and Official ElizaOS, but fresh no-conversation streams fail when ElizaOS returns `404 SESSION_NOT_FOUND` for the official session ID used by `/api/messaging/sessions/{sessionId}/messages`. The WAGDIE official chat client only retries/rebinds stale sessions for existing conversations, not fresh sessions, and the official SSE parser also masks OK-but-empty streams as successful empty completions.

## Symptoms
- Chat streaming is failing on the live website.
- Production environment is accessible via `sshpass -p "girlboss" ssh saltysloane@192.168.50.7` for Docker/container logs.

## Background / Prior Research

### Production Docker log findings - 2026-05-30

Read-only production log probe over `sshpass -p "girlboss" ssh saltysloane@192.168.50.7` found the relevant live containers:
- `wagdie-simplified-app-1` — image `wagdie-simplified-app`, up 26h, port `42069->3000`.
- `wagdie-simplified-elizaos-1` — image `wagdie-simplified-elizaos`, up 2 days, healthy, port `3002->3001`.
- Also present but likely non-prod/dev: `wagdie-lore-dev-app` on `42070->3000`, `wagdie-simplified-dev-elizaos-1` on `3001->3001`.

Recent `wagdie-simplified-app-1` logs show `/api/eliza/chat` accepts requests for token `4073`, then fails while setting up official ElizaOS streaming. One request completed without content:

```text
2026-05-30T16:17:43.042235321Z [Eliza Chat] Request accepted { tokenId: '4073', hasConversationId: false }
2026-05-30T16:17:47.668264471Z [Eliza Official Chat] stream complete { conversationId: '3fdf1752-c783-4417-8030-8c80cb35c11e', officialSessionId: '7efeaf7e-e1b8-451b-af1b-c95683927f83', firstTokenMs: null, durationMs: 4450, outcome: 'complete' }
2026-05-30T16:17:47.668374129Z [Eliza Chat] Stream complete { tokenId: '4073', hasContent: false, contentLength: 0 }
```

The next attempts failed with upstream ElizaOS 404 `SESSION_NOT_FOUND`:

```text
2026-05-30T16:18:18.196826910Z [Eliza Chat] Request accepted { tokenId: '4073', hasConversationId: false }
2026-05-30T16:18:18.866830865Z [Official ElizaOS] streaming request failed { status: 404, upstreamBody: {"error":{"code":"SESSION_NOT_FOUND","message":"Session with ID '29dafb85-9831-45c8-81a5-265ea55796ec' not found", ...}} }
2026-05-30T16:18:18.883138977Z [Eliza Chat] Stream setup failed { code: 'API_ERROR', message: 'Official ElizaOS streaming request failed', details: { upstreamStatus: 404, ... } }
```

```text
2026-05-30T16:18:36.456267549Z [Eliza Chat] Request accepted { tokenId: '4073', hasConversationId: false }
2026-05-30T16:18:36.736635129Z [Official ElizaOS] streaming request failed { status: 404, upstreamBody: {"error":{"code":"SESSION_NOT_FOUND","message":"Session with ID 'db87c8d6-f822-442c-9a68-026bfcd2cc3d' not found", ...}} }
2026-05-30T16:18:36.754362183Z [Eliza Chat] Stream setup failed { code: 'API_ERROR', message: 'Official ElizaOS streaming request failed', details: { upstreamStatus: 404, ... } }
```

Counts from the recent production log window examined by the probe:

```text
app_SESSION_NOT_FOUND=1120
app_stream_setup_failed=2
app_stream_complete=1
eliza_settings_errors=177
app_venice_econn=0
```

The ElizaOS container logs show many `Session deleted` messages around the same period and repeated bootstrap settings errors:

```text
Info  [HTTP] Session deleted (sessionId=...)
Error [PLUGIN:BOOTSTRAP:PROVIDER:SETTINGS] No world found for user during onboarding
Error [PLUGIN:BOOTSTRAP:PROVIDER:SETTINGS] Critical error in settings provider (error=No server ownership found for onboarding)
```

Initial runtime hypotheses from logs:
- Primary visible failure is app-level upstream ElizaOS HTTP 404 `SESSION_NOT_FOUND` during official streaming setup, not a Venice/network `ECONN*` outage.
- The app may be creating or resolving an ElizaOS session ID and then streaming against an instance/path where that session is absent, or ElizaOS may be deleting/cleaning up sessions before the stream starts.
- The one “successful” stream had `firstTokenMs: null`, `hasContent: false`, and `contentLength: 0`, so even non-error completion may fail to deliver content.
- Need to inspect the official-mode session creation/mapping/streaming flow and any cleanup/delete calls.

## Investigator Findings
<!-- Pair investigator appends structured analysis here. -->

### 2026-05-30 - Official chat streaming session failure trace

#### Production evidence
- Live app container `wagdie-simplified-app-1` is actually in official mode, not legacy/dual: `NODE_ENV=production`, `ELIZA_INTEGRATION_MODE=official`, `ELIZAOS_BASE_URL=http://elizaos:3001`, `ELIZAOS_HEALTH_PATH=/api/server/health`.
- Live app and ElizaOS containers are on the same Docker networks: app `wagdie-simplified_default=172.18.0.12`, ElizaOS `wagdie-simplified_default=172.18.0.16`; app base URL uses the Compose service name `elizaos`, not container-local `localhost`.
- App `ELIZAOS_API_KEY` is set and equals ElizaOS `ELIZA_SERVER_AUTH_TOKEN` (compared without printing secret values). ElizaOS `SERVER_API_KEY` is different, which is expected because the app should authenticate to the service with `ELIZA_SERVER_AUTH_TOKEN` rather than the runtime/provider key.
- Docker log correlation for the report window confirms the user-facing route reached Official ElizaOS and received upstream session errors:
  - `2026-05-30T16:17:43.042Z` app accepted `/api/eliza/chat` for token `4073` with `hasConversationId: false`.
  - `2026-05-30T16:17:47.668Z` app logged `[Eliza Official Chat] stream complete` for WAGDIE conversation `3fdf1752-c783-4417-8030-8c80cb35c11e`, official session `7efeaf7e-e1b8-451b-af1b-c95683927f83`, but `firstTokenMs: null`; route then logged `hasContent: false` / `contentLength: 0`.
  - `2026-05-30T16:18:18.196Z` app accepted a fresh chat (`hasConversationId: false`) and at `16:18:18.866Z` received Official ElizaOS HTTP `404` with `SESSION_NOT_FOUND` for session `29dafb85-9831-45c8-81a5-265ea55796ec`; route logged `Stream setup failed` at `16:18:18.883Z`.
  - `2026-05-30T16:18:36.456Z` another fresh chat (`hasConversationId: false`) failed the same way for session `db87c8d6-f822-442c-9a68-026bfcd2cc3d` at `16:18:36.736Z`, then route logged `Stream setup failed` at `16:18:36.754Z`.
- ElizaOS logs in the same window did not show those two failed session IDs directly, but did show repeated nearby `Session deleted` lines for other session IDs plus bootstrap settings errors (`No world found for user during onboarding`, `No server ownership found for onboarding`). This supports session volatility/cleanup as a live runtime symptom, but does not prove deletion of the exact failed fresh sessions.

#### File/line trace: `/api/eliza/chat` route and SSE mapping
- `app/api/eliza/chat/route.ts:51-63` requires a wallet session and Eliza app token before chat; in official mode this is a WAGDIE app gate, not direct browser ElizaOS credentials (`app/api/eliza/chat/route.ts:65-68`).
- `app/api/eliza/chat/route.ts:75-89` parses and validates `tokenId`/`message`, then logs request acceptance including `hasConversationId` at `app/api/eliza/chat/route.ts:91-94`.
- `app/api/eliza/chat/route.ts:100-117` resolves the canonical AI persona and returns `409 AI_PERSONA_REQUIRED` if missing; it does not auto-create a persona in public chat.
- `app/api/eliza/chat/route.ts:126-166` maps gateway callbacks to the browser SSE contract: `onChunk` -> `event: token`, `onComplete` -> `event: complete`, `onError` -> `event: error`.
- `app/api/eliza/chat/route.ts:172-185` calls `serverClient.chat.sendMessageStream()` with `characterId`, message, optional WAGDIE `conversationId`, wallet-derived `userId: tokenResult.officialUserId`, wallet address, token id, and abort signal.
- `app/api/eliza/chat/route.ts:188-207` catches setup/stream exceptions and emits an SSE `error` event. Therefore the live `Stream setup failed` entries are errors thrown before the official client called the route `onComplete` callback.

#### File/line trace: Official client session lifecycle and 404 recovery asymmetry
- `lib/eliza/client.ts:57-64` selects `createOfficialServerClient()` only when `elizaConfig.mode === 'official'`; live env confirmed this branch is active.
- `lib/eliza/official/client.ts:333-344` constructs helpers for starting the agent and creating an official session with `agentId`, wallet-derived `userId`, and WAGDIE metadata.
- Existing-conversation path: when `input.conversationId` is present, `lib/eliza/official/client.ts:346-352` loads a WAGDIE mapping via `conversationRepository.findForUser()` and validates the mapped official agent id, then starts the agent.
- Fresh-conversation path: when no WAGDIE `conversationId` is present, `lib/eliza/official/client.ts:353-367` starts the agent, calls `createOfficialSession()`, then persists a WAGDIE conversation mapping with `officialSessionId: session.sessionId`.
- If mapping insertion fails, the fresh session is best-effort deleted (`lib/eliza/official/client.ts:365-366`), but that is not the live failure path because the later `sendSessionMessage()` is reached.
- Message send path is defined at `lib/eliza/official/client.ts:370-383`; it posts the user content to the mapped `officialSessionId` with `transport: 'sse'` and WAGDIE metadata.
- **Recovery asymmetry:** `lib/eliza/official/client.ts:387-393` recreates and rebinds an official session only when `response.status === 404 && input.conversationId`. Fresh conversations (`hasConversationId: false` in production logs) do not enter this recovery block, so a fresh-session 404 is passed to stream collection and fails.
- `lib/eliza/official/client.ts:395-424` records successful activity and logs `[Eliza Official Chat] stream complete`; live empty completion proves this path can mark activity and route completion even with no text.
- `lib/eliza/official/client.ts:430-435` records a mapping error only after the thrown error unwinds; there is no fresh-session replacement attempt before throwing.

#### File/line trace: messaging session normalization and send path
- `lib/eliza/official/messaging.ts:99-105` accepts `sessionId` or `id`, either top-level or under `data`, from session creation responses.
- `lib/eliza/official/messaging.ts:107-121` throws a 502 `WagdieElizaError` if session creation returns no usable ID. The live error was not this path; it had concrete UUIDs in the upstream 404 body.
- `lib/eliza/official/messaging.ts:189-196` creates sessions through `this.client.sessions.createSession({ agentId, userId, metadata })` and normalizes the result.
- `lib/eliza/official/messaging.ts:203-217` sends messages via raw `fetch` to `${baseUrl}/api/messaging/sessions/${sessionId}/messages` with JSON `{ content, transport, metadata }`; this is the exact request path implicated by `SESSION_NOT_FOUND`.
- Ephemeral Official flows already contain missing-session recovery: `lib/eliza/official/messaging.ts:137-145` detects `SESSION_NOT_FOUND`, and `lib/eliza/official/messaging.ts:372-424` deletes/recreates once. That recovery is not used by public persisted chat in `OfficialWagdieElizaClient.chat.sendMessageStream()`.
- Tests cover create-session ID shape normalization and the ephemeral recovery path (`tests/lib/eliza/official-messaging.test.ts:153-169`, `tests/lib/eliza/official-messaging.test.ts:203-245`), but there is no equivalent persisted-chat fresh-session recovery test.

#### File/line trace: official stream handling of 404 and empty EOF
- `lib/eliza/official/stream.ts:115-139` treats any non-OK response or missing response body as a failed streaming setup, logs upstream status/body, and throws `WagdieElizaError('Official ElizaOS streaming request failed')`. For `404`, this is `code: 'API_ERROR'` and `isRetryable` depends on `isRetryableGatewayStatus(404)`; it does not specially classify `SESSION_NOT_FOUND`.
- `lib/eliza/official/stream.ts:146-170` accumulates supported `chunk` event text; `lib/eliza/official/stream.ts:171-180` treats `done`/`complete` as success, falling back to final content if no chunks streamed.
- `lib/eliza/official/stream.ts:181-205` handles upstream SSE `error` events by invoking `onError` and then throwing.
- `lib/eliza/official/stream.ts:222-257` flushes a final partial SSE buffer and handles tail `chunk`/`done`/`complete` events.
- **Empty/unsupported-stream bug:** if the HTTP response is OK and the body reaches EOF without supported chunks, error events, or a complete/done event, `lib/eliza/official/stream.ts:259-271` still calls `onComplete` with `content: fullText`, even when `fullText === ''`. `lib/eliza/official/messaging.ts:462-478` then returns collected text or normalized `streamedText`, so an empty OK stream can be treated as a successful empty completion.
- Unit tests cover SSE error and valid complete cases (`tests/lib/eliza/official-stream.test.ts:20-83`), but do not cover an OK empty EOF or unsupported-only event stream. The smoke script is stricter than app code: `scripts/elizaos-official-smoke.ts:449-466` fails if direct service SSE lacks token/chunk/message plus done/complete events.

#### File/line trace: WAGDIE mapping persistence/rebind/error behavior
- The mapping table is `eliza_official_conversation_links` (`lib/eliza/officialConversationRepository.ts:84-86`).
- `lib/eliza/officialConversationRepository.ts:159-184` creates a mapping row with WAGDIE conversation id, normalized wallet address, official user id, token id, official agent id, official session id, status `active`, and message count `0`.
- `lib/eliza/officialConversationRepository.ts:186-202` only finds UUID WAGDIE conversation ids for the exact `official_user_id` and non-deleted status.
- `lib/eliza/officialConversationRepository.ts:236-259` rebinds an existing WAGDIE conversation to a replacement `official_session_id`, clears `last_error`, and sets status `active`.
- `lib/eliza/officialConversationRepository.ts:261-287` marks activity and increments message count; fresh empty completion still increments by 2 via the client wrapper.
- `lib/eliza/officialConversationRepository.ts:289-313` records errors by setting `last_error` but leaving status `active`; this preserves rows for retry but may also leave newly-created broken fresh mappings visible unless the UI filters/error-handles them.

#### Frontend chatbar/session generation behavior
- `components/chat/ChatDock.tsx:13-19` mounts `ChatSidebar` keyed only by `target.tokenId`, so opening/closing the dock does not itself reset chat state for the same token; switching token remounts it.
- `hooks/useCharacterChat.ts:60-64` initializes `conversationId` to `null` and `hooks/useCharacterChat.ts:101-112` POSTs that `conversationId` value to `/api/eliza/chat` on send.
- On successful `complete`, `hooks/useCharacterChat.ts:189-198` appends the assistant message and sets `conversationId` from the server-returned WAGDIE conversation id. Until that complete event happens, the frontend has no conversation id.
- On errors, `hooks/useCharacterChat.ts:207-218` records the error and removes the optimistic user message, but does not set a conversation id from the failed stream. Therefore repeated retries after a stream setup failure continue to send `conversationId: null`, re-entering the backend fresh-session path.
- `components/chat/ChatSidebar.tsx:139-144` persists a conversation id to localStorage only after one exists, and `components/chat/ChatSidebar.tsx:153-172` restores it only after authentication and conversation list loading confirm the saved id still exists. First-turn chats, explicit “new conversation”, failed first streams, or sends before restore completes all produce `hasConversationId: false` and force fresh backend session creation.
- Conclusion: the chatbar does not directly create Official ElizaOS sessions, but its normal first-turn behavior is exactly what triggers the backend fresh no-conversation branch. Because the backend currently lacks fresh-session `SESSION_NOT_FOUND` recovery, a first-turn failure never returns a WAGDIE conversation id to the chatbar, so retries remain fresh and can repeatedly create broken backend mappings/sessions.

#### Docker/env mismatch analysis
- `lib/eliza/config.ts:48-56` defaults any unset/misspelled `ELIZA_INTEGRATION_MODE` to `legacy`; `lib/eliza/client.ts:57-64` only uses Official ElizaOS in exact `official` mode.
- `.env.example:84-93` documents the key deployment distinction: Compose app URL should be `http://elizaos:3001`, while host-shell smoke uses `http://localhost:3001`, and app `ELIZAOS_API_KEY` must match service `ELIZA_SERVER_AUTH_TOKEN`.
- `docker-compose.yml:172-174` exposes ElizaOS on the host while the container service listens on `3001`; `docker-compose.yml:231-234` wires app `ELIZA_INTEGRATION_MODE`, `ELIZAOS_BASE_URL`, `ELIZAOS_API_KEY`, and health path; `docker-compose.yml:235-236` enables location-room features by default.
- `Dockerfile:24-34` shows the production runner only bakes `NODE_ENV=production`; ElizaOS mode/base URL/API key are runtime env values.
- Live checks eliminated the highest-probability deployment mismatch for the current incident: app is in `official` mode, uses `http://elizaos:3001`, has matching service auth, and shares a Docker network with ElizaOS.

#### Conclusions
- **Hypothesis mostly proven.** Live `/api/eliza/chat` reaches Official ElizaOS and fails during message streaming because an official session ID used immediately after fresh-session setup is not routable by `/api/messaging/sessions/{sessionId}/messages`, producing upstream `404 SESSION_NOT_FOUND`.
- The fresh-session part is inferred from code plus production facts: production logs show `hasConversationId: false`; in that branch the official client must create a new official session and mapping before sending; the failing upstream body contains the exact session UUID being used by the message endpoint.
- **Recovery asymmetry proven.** Existing WAGDIE conversations get one official-session replacement/rebind on `404` (`input.conversationId` only), but fresh conversations do not. This matches the observed `hasConversationId: false` failures.
- **Secondary empty-success bug proven in code and observed in production.** The route can report complete with `hasContent: false`, and `streamOfficialElizaSse()` explicitly completes OK empty/unsupported streams at EOF.
- **Eliminated as primary causes for this incident:** WAGDIE app not in official mode, app using host-style `localhost` for ElizaOS from inside Docker, app/service API key mismatch, browser-facing auth directly hitting ElizaOS, missing AI persona for token `4073`, and Venice/network `ECONN*` outage in app logs.
- **Not fully proven yet:** why ElizaOS `@elizaos/server@1.7.2` creates/returns a session ID that `/messages` cannot immediately route. Candidate causes remain upstream session volatility/deletion, an ElizaOS runtime/session registry bug, settings/onboarding/world bootstrap errors interfering with session registration, or undocumented ordering requirements after session creation.

#### Recommended fixes and tests
1. Add persisted-chat fresh-session `SESSION_NOT_FOUND` recovery in `OfficialWagdieElizaClient.chat.sendMessageStream()`: if the first `sendSessionMessage()` for a newly-created WAGDIE conversation returns a 404 whose body contains `SESSION_NOT_FOUND`, create a replacement official session, `rebindSession(link.id, officialUserId, replacement.sessionId)`, then retry once. Reuse the existing detection logic from `lib/eliza/official/messaging.ts:137-145` or export a shared helper.
2. Change `streamOfficialElizaSse()` to fail closed for OK empty/unsupported streams: require at least one meaningful chunk or an explicit `done`/`complete` event with non-empty content; otherwise throw a route-safe `WagdieElizaError` such as `Official ElizaOS stream ended without assistant content` instead of calling `onComplete` with empty content.
3. Add tests:
   - Fresh public chat with no WAGDIE `conversationId` gets first-send `SESSION_NOT_FOUND`, creates a replacement official session, rebinds the new mapping, retries, and completes with the WAGDIE conversation id.
   - Existing-conversation 404 recovery/rebind is explicitly covered; current code has the branch but no direct test was found.
   - Generic 404 without `SESSION_NOT_FOUND` does not recover.
   - OK empty SSE body and unsupported-only SSE body throw errors and never call route `complete`.
   - `/api/eliza/chat` surfaces the new empty-stream failure as SSE `error`, not `complete`.
4. Improve production observability: log `officialSessionId` immediately after create, before send, on 404 recovery, and after rebind; include a safe upstream error code (`SESSION_NOT_FOUND`) without dumping long stack bodies.
5. Extend live validation beyond direct service smoke: add route-parity/app-level first-turn chat coverage that exercises `/api/eliza/chat` with no existing WAGDIE conversation and asserts non-empty assistant content. The direct smoke script already validates direct service SSE shape (`scripts/elizaos-official-smoke.ts:417-470`) but not the app's fresh mapping/recovery behavior.
6. Track an upstream follow-up against `@elizaos/server@1.7.2` for create-session/immediate-message `SESSION_NOT_FOUND`, especially if app-side retry/rebind masks a persistent service-side session registry issue.


## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The failure may be in the live Docker deployment/runtime config, Next.js `/api/eliza/chat` SSE streaming route, Eliza gateway/client, auth/session prerequisites, middleware proxying, or upstream LLM/provider connectivity.
**Findings:** Created this report and confirmed the existing investigation convention under `docs/investigations/`. A related 2026-05-29 investigation identified prior chat risk areas: UI/persona discoverability, auth/session gating, and runtime integration config.
**Evidence:** Report path: `/Users/t3rpz/projects/wagdie-simplified/docs/investigations/live-chat-streaming-failure-2026-05-30.md`; related report: `docs/investigations/ai-persona-chat-not-working-2026-05-29.md`.
**Conclusion:** Proceeded to production log fact-gathering before broad workspace context discovery.

### Phase 1.5 - Production Logs
**Hypothesis:** Runtime logs can distinguish auth/persona failures from official streaming/session failures.
**Findings:** Live app accepted chat for token `4073` and failed at Official ElizaOS streaming setup with upstream `404 SESSION_NOT_FOUND`; one nearby request completed with no assistant content.
**Evidence:** `wagdie-simplified-app-1` logs at `2026-05-30T16:18:18Z` and `2026-05-30T16:18:36Z`; empty completion at `2026-05-30T16:17:47Z`.
**Conclusion:** Confirmed the current failure reaches the server and Official ElizaOS path; it is not primarily a browser/UI/auth/persona gate for this token/request sequence.

### Phase 2 - Context Builder Broad Discovery
**Hypothesis:** The relevant code is in Official ElizaOS session creation, mapping, message streaming, and SSE parsing.
**Findings:** Context Builder selected the chat route, official client, messaging, stream parser, conversation repository, config/docker files, smoke script, and related tests. It identified fresh-session 404 recovery asymmetry and empty-stream success handling as the main repo-level risks.
**Evidence:** Selected files include `app/api/eliza/chat/route.ts`, `lib/eliza/official/client.ts`, `lib/eliza/official/messaging.ts`, `lib/eliza/official/stream.ts`, `lib/eliza/officialConversationRepository.ts`, `docker-compose.yml`, and official client/stream tests.
**Conclusion:** Proceeded to pair investigation for line-level verification and live env correlation.

### Phase 3 - Pair Investigator Main Inquiry
**Hypothesis:** Fresh official chat sessions are not recoverable when first message streaming returns `SESSION_NOT_FOUND`, while empty streams can be falsely reported as success.
**Findings:** Pair investigator verified live official mode/config, eliminated obvious base URL/API-key/network mismatch, traced the fresh vs existing conversation session lifecycle, proved 404 recovery only exists for `input.conversationId`, and proved OK empty EOF can call `onComplete` with empty content.
**Evidence:** See `## Investigator Findings`; spot-checked code in `app/api/eliza/chat/route.ts:89-207`, `lib/eliza/official/client.ts:337-435`, `lib/eliza/official/messaging.ts:99-217`, `lib/eliza/official/stream.ts:115-271`, and `lib/eliza/officialConversationRepository.ts:236-313`.
**Conclusion:** Confirmed the WAGDIE-side defect and separated it from the upstream reason fresh sessions are not routable.

### Phase 4 - Oracle Synthesis
**Hypothesis:** The final report should distinguish confirmed app-level defects from unproven upstream session lifecycle causes.
**Findings:** Oracle agreed the confirmed app-level root cause is missing `SESSION_NOT_FOUND` recovery for fresh persisted public chats plus empty-stream success handling; upstream session volatility/normalization/service behavior remains unresolved.
**Evidence:** Synthesized from selected files and pair findings; Oracle cautioned against claiming ElizaOS definitely deletes exact failed sessions or that retry/rebind is the complete root-cause fix.
**Conclusion:** Final root cause and recommendations below preserve those distinctions.

## Root Cause
The confirmed failure is at the WAGDIE app ↔ Official ElizaOS session/message boundary.

For fresh chats (`hasConversationId: false`), `OfficialWagdieElizaClient.chat.sendMessageStream()` starts the official agent, creates an official session, persists a WAGDIE conversation link with that `officialSessionId`, then posts the user message to `/api/messaging/sessions/{officialSessionId}/messages` with `transport: 'sse'`. Production logs show that message-streaming request returns upstream ElizaOS `404 SESSION_NOT_FOUND` for the official session ID.

The WAGDIE-side defect is that the persisted public chat path only performs replacement/rebind recovery on `response.status === 404 && input.conversationId`. Fresh no-conversation chats do not recover, even though nearby official messaging code already has `SESSION_NOT_FOUND` detection/recovery for ephemeral flows and the repository has `rebindSession()` support. Therefore a transient or upstream fresh-session `SESSION_NOT_FOUND` becomes a user-visible stream setup failure.

A secondary confirmed defect is empty-stream handling: `streamOfficialElizaSse()` treats an OK response that reaches EOF without recognized assistant chunks, `done`/`complete`, or error events as successful completion with `content: fullText`. When `fullText === ''`, the route emits a `complete` event with no assistant content, matching the production `firstTokenMs: null`, `hasContent: false`, `contentLength: 0` log.

Remaining upstream uncertainty: the repo and logs do not yet prove why ElizaOS returns or creates session IDs that are not immediately routable. Plausible causes include session ID shape/normalization mismatch, ElizaOS session registration race or deletion/volatility, `@elizaos/server@1.7.2` lifecycle behavior, or bootstrap/settings/world errors interfering with session availability. Nearby `Session deleted` logs support volatility as a possibility but do not prove deletion of the exact failed session IDs.

Eliminated or strongly deprioritized for this incident:
- Wrong integration mode: production app is confirmed `official`.
- Obvious app base URL mismatch: app uses `http://elizaos:3001`, not container-local `localhost`.
- App/service API-key mismatch: app `ELIZAOS_API_KEY` matches ElizaOS `ELIZA_SERVER_AUTH_TOKEN`.
- Different Docker network: app and ElizaOS share the compose network.
- Legacy/Venice provider outage: failures are Official ElizaOS `/api/messaging/sessions/:id/messages` 404s, not Venice/network `ECONN*` errors.
- Browser/auth never reached server: `/api/eliza/chat` logs `Request accepted`.
- Persona gate as current blocker for token `4073`: the route reaches official streaming setup.
- Stale existing conversation as the only explanation: observed failures had `hasConversationId: false`.

## Recommendations
1. Add persisted public-chat `SESSION_NOT_FOUND` recovery in `OfficialWagdieElizaClient.chat.sendMessageStream()`: detect actual upstream `SESSION_NOT_FOUND` (not generic 404), create a replacement official session, rebind the WAGDIE conversation link, retry once, and apply this consistently to fresh and existing conversations.
2. Fail closed on empty official SSE streams in `lib/eliza/official/stream.ts`: if HTTP 200 ends without assistant content or a meaningful supported terminal event, emit/throw a route-safe error instead of calling `onComplete` with empty content.
3. Add regression tests for fresh no-`conversationId` `SESSION_NOT_FOUND` recovery, existing-conversation 404 rebind, generic 404 no-recovery, empty SSE body, unsupported-only SSE events, and `/api/eliza/chat` surfacing empty-stream failure as SSE `error`.
4. Improve production observability: log selected `officialSessionId` after create, before send, after recovery/rebind, and include safe upstream error code (`SESSION_NOT_FOUND`) plus create-session response key shape without logging secrets or full message content.
5. Extend smoke coverage beyond direct ElizaOS service checks: add an app-level first-turn `/api/eliza/chat` smoke that exercises the full WAGDIE mapping/recovery path and asserts non-empty assistant content.
6. Track an upstream ElizaOS follow-up for `@elizaos/server@1.7.2` create-session/immediate-message `SESSION_NOT_FOUND`, especially if app-side retry/rebind masks a persistent service-side registry/lifecycle issue.

## Preventive Measures
- Add health/smoke checks that run from the app container context against the configured `ELIZAOS_BASE_URL`, not only host-shell URLs.
- Keep route-level chat readiness checks separate from direct ElizaOS service smoke so mapping/session persistence bugs are covered.
- Treat empty assistant streams as operational failures with alertable logs, not successful completions.
- Record official session lifecycle correlation IDs in app and ElizaOS logs so future incidents can answer whether a failed session was created, deleted, or never registered.
- Preserve explicit tests around session mapping `active`/`last_error` behavior so broken fresh mappings do not silently accumulate.
