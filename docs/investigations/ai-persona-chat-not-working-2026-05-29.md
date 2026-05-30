# Investigation: AI Persona Chat Not Working

## Summary
Character persona chat is gated by more than the existence of an Eliza character. The strongest repo-supported root cause is a contract mismatch: the public UI only exposes chat when `GET /api/eliza/characters/[tokenId]` finds a canonical `externalId === tokenId` persona, while the chat API itself can resolve or auto-create by token id if the user can reach it; even then, wallet/Eliza auth and mode-specific runtime config can independently block streaming.

## Symptoms
- Character AI persona chat is not working.
- An Eliza character / AI persona has been created, but chat still fails or does not respond as expected.

## Background / Prior Research
No external fact-gathering identified yet; this appears primarily workspace-specific.

## Investigator Findings

### 2026-05-29 - End-to-end chat flow and hypothesis assessment

#### End-to-end flow traced
- Character detail page loads both the WAGDIE character and AI persona: `useCharacterDetailData(tokenId)` and `useAICharacter(String(tokenId))` in `app/characters/[tokenId]/page.tsx:50-51`.
- The public chat action is opened via `openChat({ tokenId: String(tokenId), characterName: name, characterId: aiCharacter?.id })`, but the button is only shown when `showChatAction={Boolean(aiCharacter?.id)}` in `app/characters/[tokenId]/page.tsx:163-165`.
- `CharacterSheetLayout` renders the `chat` button only inside `{showChatAction && (...)}` at `components/characters/detail/CharacterSheetLayout.tsx:272-276`.
- The dock target carries `{ tokenId, characterName, characterId? }` per `contexts/ChatDockContext.tsx:6-10`; `openChat` stores that target and opens the drawer at `contexts/ChatDockContext.tsx:26-29`.
- `ChatSidebar` wires auth, history, and sending via `useElizaAuth`, `useConversations`, and `useCharacterChat` at `components/chat/ChatSidebar.tsx:49-95`.
- Conversation history auto-fetch is gated by `isOpen && isConnected && isAuthenticated` at `components/chat/ChatSidebar.tsx:89-94`; connected-but-unauthenticated users see a `Load history` signing prompt at `components/chat/ChatSidebar.tsx:330-354`.
- Sending calls `getToken()` first, then `sendMessage(content)` in `components/chat/ChatSidebar.tsx:184-198`.
- `useCharacterChat` posts `{ tokenId, message: content, conversationId }` with cookies to `POST /api/eliza/chat` at `hooks/useCharacterChat.ts:101-112`, then expects SSE `token`, `complete`, and `error` events at `hooks/useCharacterChat.ts:159-187`.
- `/api/eliza/chat` requires wallet session and Eliza token before parsing/streaming at `app/api/eliza/chat/route.ts:51-63`, validates token/message at `app/api/eliza/chat/route.ts:70-84`, verifies the WAGDIE character exists at `app/api/eliza/chat/route.ts:92-99`, resolves/creates the Eliza record at `app/api/eliza/chat/route.ts:101-117`, and streams through `serverClient.chat.sendMessageStream(...)` at `app/api/eliza/chat/route.ts:167-178`.

#### Hypothesis 1: UI gating mismatch — **Proved as a likely failure mode**
- Evidence: the visible public chat button depends on `aiCharacter?.id` from `useAICharacter` (`app/characters/[tokenId]/page.tsx:50-51`, `app/characters/[tokenId]/page.tsx:163-165`). `useAICharacter` fetches `GET /api/eliza/characters/${tokenId}` and treats 404 as `aiCharacter=null` (`hooks/useAICharacter.ts:52-70`). That GET route only calls canonical `getCharacterRecordByExternalId(elizaClient, tokenId)` and returns 404 when absent (`app/api/eliza/characters/[tokenId]/route.ts:37-62`).
- Evidence: chat itself uses a different behavior: `/api/eliza/chat` calls `resolveCharacterByTokenId(...)` (`app/api/eliza/chat/route.ts:101-117`), and the resolver first looks up by external id, then auto-creates a default record with `createRecord({ externalId: tokenId, character })` if missing (`lib/eliza/characterResolver.ts:109-128`).
- Conclusion: a user can be blocked before chat by the UI because the button is hidden unless a canonical `externalId === tokenId` record is discoverable, even though the chat route is designed to resolve or auto-create one once called. This mismatch can make “persona chat not working” appear as “no chat action” when the existing Eliza persona is keyed by internal `id`, a non-canonical external id, or is otherwise undiscoverable by `/characters/external/{tokenId}`.

#### Hypothesis 2: Auth/session gate — **Proved**
- Evidence: the sidebar hides chat entirely behind wallet connection when `!isConnected` (`components/chat/ChatSidebar.tsx:240-254`). For connected wallets, `handleSend` calls `getToken()` and aborts if it returns null (`components/chat/ChatSidebar.tsx:184-198`).
- Evidence: `useElizaAuth.getToken()` checks cached token, then requires `isConnected && address`, calls `GET /api/eliza/auth`, and only starts SIWE when that returns 401 `NO_TOKEN` or `TOKEN_EXPIRED`; it then calls nonce, signs the message, and verifies (`hooks/useElizaAuth.ts:81-177`).
- Evidence: server-side `/api/eliza/chat` independently requires `requireWalletSession` and `requireElizaUserToken` before it even parses the chat body (`app/api/eliza/chat/route.ts:51-63`). Missing wallet returns `UNAUTHORIZED`; missing/expired Eliza token returns `NO_TOKEN`/`TOKEN_EXPIRED` in `lib/eliza/sessionAuth.ts:35-86`. Tests assert these 401s in `tests/api/eliza/chat.test.ts:40-88`.
- Conclusion: even with a valid persona record, chat cannot stream unless the browser has a WAGDIE wallet session and a non-expired Eliza token in the iron-session cookie. In official mode, the token must also be mode `official` and wallet-mapped, or `requireElizaUserToken` returns `NO_TOKEN` (`lib/eliza/sessionAuth.ts:88-106`).

#### Hypothesis 3: Persona persistence/schema mismatch — **Partly proved; primary risk is discoverability, not editable-field loss**
- Evidence: canonical mutation identity is a decimal token id. `parseCanonicalElizaTokenId` rejects non-canonical strings like leading-zero ids and returns `externalId: String(parsedTokenId)` (`lib/eliza/routeAuth.ts:20-30`). `PUT /api/eliza/characters/[tokenId]` authorizes to that canonical `externalTokenId`, looks up by external id, and creates missing records with `externalId: externalTokenId` (`app/api/eliza/characters/[tokenId]/route.ts:118-149`, `app/api/eliza/characters/[tokenId]/route.ts:182-189`). Tests verify GET by external id and PUT create with `externalId: '123'` in `tests/api/eliza/character-record.test.ts:50-64` and `tests/api/eliza/character-record.test.ts:195-216`.
- Evidence: import does **not** create a missing character record. It authorizes, looks up `getCharacterRecordByExternalId(client, externalTokenId)`, and returns 404 if missing (`app/api/eliza/characters/[tokenId]/import/route.ts:72-120`). If present, it updates by internal `record.id` only (`app/api/eliza/characters/[tokenId]/import/route.ts:123-126`).
- Evidence: import/export intentionally keep identity backend-owned. Backend-owned paths include `id` and `externalId` (`lib/eliza/character-sheet-policy.ts:35-45`); import skips backend-owned fields and only patches persona fields (`lib/eliza/character-sheet-policy.ts:417-496`); export emits persona fields but no `id`/`externalId` (`lib/eliza/character-sheet-policy.ts:507-541`). Tests assert backend-owned fields are omitted/skipped while safe fields survive (`tests/api/eliza/import-export.test.ts:98-141`, `tests/api/eliza/import-export.test.ts:300-363`).
- Evidence: official mode preserves prompt-critical custom fields by relocating unsupported top-level `backstory` and `lore` into `settings.wagdie` before creating/updating agents (`lib/eliza/official/client.ts:110-139`, `lib/eliza/official/client.ts:287-318`), while the WAGDIE DTO maps `system`, `bio`, `lore`, `backstory`, examples, templates, and settings back out (`lib/eliza/agent-character-mapper.ts:273-339`).
- Conclusion: saves through PUT should create discoverable records when the backend honors `externalId`. Imports can fail for an owner who tries to import before a record exists, because import requires an existing canonical record. Imported/exported JSON cannot fix or create identity links because `id`/`externalId` are intentionally stripped/skipped. Also note a backend dependency: legacy `replaceRecord(record.id, { character })` does not resend `externalId` (`app/api/eliza/characters/[tokenId]/route.ts:149-155`, `app/api/eliza/characters/[tokenId]/import/route.ts:123-126`), so the legacy gateway must preserve the external-id index on replace.

#### Hypothesis 4: Runtime config/service gate — **Proved**
- Evidence: integration mode defaults to `legacy`; only exact `ELIZA_INTEGRATION_MODE=official` selects the official adapter, while `legacy` and `dual` use the app-owned HTTP/Venice gateway (`lib/eliza/config.ts:38-46`, `lib/eliza/client.ts:51-59`). Tests cover default legacy, official-only official adapter, and dual retaining legacy user-visible behavior (`tests/api/eliza/client-mode.test.ts:20-76`).
- Evidence: legacy/dual chat requires Venice/OpenAI-compatible inference config. The gateway throws `VALIDATION_ERROR` if `baseUrl`, `apiKey`, or `model` are missing, with the operator message to set `ELIZA_LLM_API_KEY/VENICE_API_KEY` and `ELIZA_LLM_MODEL/VENICE_MODEL` (`lib/eliza/gateway/client.ts:175-187`). `.env.example` leaves `ELIZA_LLM_API_KEY` and `ELIZA_LLM_MODEL` blank by default (`.env.example:133-141`).
- Evidence: official mode uses `ELIZAOS_BASE_URL` and `ELIZAOS_API_KEY` (`lib/eliza/config.ts:215-223`, `.env.example:84-93`), starts the official agent, creates or reuses a session mapping, and sends messages through official messaging (`lib/eliza/official/client.ts:325-420`). It requires a wallet-derived official user id; without one the official client rejects chat with validation before network calls (`lib/eliza/official/client.ts:174-184`; tested in `tests/api/eliza/official-client.test.ts:501-523`).
- Evidence: official conversations depend on WAGDIE session mappings; missing mappings return `NOT_FOUND` without upstream fetch (`lib/eliza/official/client.ts:187-193`, `lib/eliza/official/client.ts:443-507`; tested in `tests/api/eliza/official-client.test.ts:589-609`).
- Conclusion: chat can fail after the UI/auth gates if runtime env is incomplete. In legacy/dual, an existing persona is insufficient without Venice API key + model. In official mode, an existing agent is insufficient without reachable ElizaOS service, service API key, wallet-derived official user identity, and conversation mapping persistence.

#### Hypothesis 5: Duplicate flows — **Proved**
- Evidence: public character chat uses `POST /api/eliza/chat` via `useCharacterChat` (`hooks/useCharacterChat.ts:101-112`) and streams SSE into the dock. It does not call the persona assistant route.
- Evidence: the owner-facing persona assistant is mounted from the AI Persona tab and calls a separate non-streaming route, `POST /api/eliza/characters/[tokenId]/persona-assistant`; the route is imported and dispatched from `app/api/eliza/characters/[tokenId]/persona-assistant/route.ts:1-9`, and the spec explicitly says assistant proposals are client-side drafts until `Save AI Persona` persists through PUT (`specs/017-eliza-persona-editor/contracts/api.yaml:74-83`).
- Evidence: the AI Persona editor save path is separate: `AIPersonaTab` calls `saveAICharacter(updateData)` at `components/characters/ai-editor/AIPersonaTab.tsx:112-124`, and the save button is disabled unless there are unsaved changes and the owner wallet is connected (`components/characters/ai-editor/AIPersonaTab.tsx:454-467`). `useAICharacter.saveAICharacter` sends `PUT /api/eliza/characters/${tokenId}` (`hooks/useAICharacter.ts:83-102`).
- Conclusion: “chat worked in the editor assistant” or “assistant generated persona text” does not prove public character chat can work. These are different routes, auth/owner gates, payload contracts, and persistence semantics. The assistant can draft fields without a saved/discoverable public chat persona.

#### Overall conclusions
- Most likely user-visible failure modes are: (1) chat button hidden because `GET /api/eliza/characters/[tokenId]` cannot find a canonical external-id-linked record, (2) wallet/Eliza token missing or expired, or (3) runtime config missing for the selected integration mode.
- The strongest architectural mismatch is that the UI requires pre-existing discoverability, while `/api/eliza/chat` has auto-create behavior that users cannot reach if the chat button is hidden.
- Import/export are safe by design but cannot repair identity mismatches; import also cannot bootstrap a missing AI character record.
- Editor assistant/persona assistant success is not evidence that public chat is configured, persisted, authenticated, or runtime-ready.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** The failure may be in the character chat UI, API route wiring, persona persistence/export/import, Eliza gateway/service integration, authentication, or missing environment/runtime linkage between the Next.js app and ElizaOS service.
**Findings:** Created this report and confirmed investigation conventions under `docs/investigations/`.
**Evidence:** Report path: `/Users/t3rpz/projects/wagdie-simplified/docs/investigations/ai-persona-chat-not-working-2026-05-29.md`.
**Conclusion:** Proceeding to broad workspace context discovery before main pair investigation.

### Phase 2 - Context Builder Broad Discovery
**Hypothesis:** The failure could be in UI gating, API route contracts, persona persistence/schema, auth/session requirements, legacy/official runtime configuration, or duplicate editor-assistant vs public-chat flows.
**Findings:** Context Builder selected the relevant public character page, chat dock/sidebar/hooks, Eliza character/chat/auth routes, Eliza client/gateway/official adapters, tests, specs, and runtime env examples. Its initial assessment identified canonical external-id lookup, auth token requirements, and runtime configuration as the highest-risk gates.
**Evidence:** `app/characters/[tokenId]/page.tsx`, `hooks/useAICharacter.ts`, `app/api/eliza/characters/[tokenId]/route.ts`, `app/api/eliza/chat/route.ts`, `lib/eliza/characterResolver.ts`, `lib/eliza/gateway/client.ts`, `lib/eliza/official/client.ts`, and related tests/specs were selected for analysis.
**Conclusion:** Confirmed the investigation needs end-to-end chain analysis, not a single-route check.

### Phase 3 - Pair Investigator Main Inquiry
**Hypothesis:** Public chat may fail because visible chat readiness, saved persona readiness, auth readiness, and runtime readiness are separate contracts.
**Findings:** The pair investigator traced the complete flow and proved the main gates: UI requires `aiCharacter?.id`; persona GET only resolves by canonical external id; chat API resolves/auto-creates by token id but is unreachable if UI hides the button; send/history require wallet and Eliza auth; legacy/dual mode requires Venice/OpenAI-compatible inference env; official mode requires ElizaOS/service/session mapping config; persona assistant/editor routes are separate from public chat.
**Evidence:** See `## Investigator Findings` above for file:line references.
**Conclusion:** Confirmed multiple concrete failure modes. The strongest architectural mismatch is UI pre-gating by discoverable persona despite backend auto-create behavior.

### Phase 4 - Oracle Synthesis
**Hypothesis:** A final diagnosis should distinguish repo-proven root causes from deployment-dependent gates.
**Findings:** Oracle agreed the repo-supported diagnosis is a contract mismatch across the persona/chat chain: “an Eliza character exists” does not imply WAGDIE-linked, chat-ready, authenticated, runtime-configured public chat.
**Evidence:** Synthesized from selected files and pair findings; key verified evidence includes the `showChatAction={Boolean(aiCharacter?.id)}` gate, `GET /api/eliza/characters/[tokenId]` canonical external-id lookup, `/api/eliza/chat` resolver/autocreate path, auth-token requirements, and gateway/official runtime checks.
**Conclusion:** Root cause and recommendations below separate confirmed code-contract issues from environment checks.

## Root Cause
The issue is best described as a chat-readiness contract mismatch, with additional deployment-dependent gates:

1. **Confirmed UI/backend mismatch:** The public character page hides the chat action unless `useAICharacter(String(tokenId))` returns an AI character id. That hook treats a 404 from `GET /api/eliza/characters/[tokenId]` as `aiCharacter=null`, and that GET route only finds records by canonical `externalId === tokenId`. However, `/api/eliza/chat` later calls `resolveCharacterByTokenId`, which can auto-create a missing external-id-linked record. Therefore users can be prevented from reaching a backend path that is explicitly designed to resolve or create the chat persona.
2. **Confirmed identity/discoverability requirement:** “An Eliza character exists” is insufficient unless it is linked to the WAGDIE token by canonical `externalId: String(tokenId)`. Existing agents keyed only by internal id, wrong external id, imported JSON without identity fields, or unsaved assistant drafts will not satisfy the UI’s readiness check.
3. **Confirmed auth/session gate:** Public chat send/history requires a connected wallet plus a valid Eliza token in the WAGDIE app session. `/api/eliza/chat` rejects missing wallet or Eliza tokens before it parses or resolves the persona.
4. **Confirmed runtime gate:** Legacy/dual chat requires Venice/OpenAI-compatible inference key and model; official mode requires ElizaOS base URL/API key, service-side provider config, wallet-derived official user/session mapping, and backing persistence. Persona creation can succeed while streaming still fails because these runtime dependencies are absent.
5. **Confirmed duplicate-flow risk:** The owner persona assistant/editor is not the same as public chat. Assistant output is a draft until saved via `PUT /api/eliza/characters/[tokenId]`, and editor/import/export success does not prove public chat auth/runtime readiness.

Eliminated or lower-probability hypotheses:
- Missing `characterId` in the chat POST is not the primary bug; `useCharacterChat` intentionally sends token id and `/api/eliza/chat` resolves by token id.
- Normal `PUT /api/eliza/characters/[tokenId]` is designed to create canonical records when the client/gateway preserves external ids.
- Persona assistant success does not prove public chat should work because it uses a separate route and persistence flow.

## Recommendations
1. **Fix the UI/backend contract mismatch** in `app/characters/[tokenId]/page.tsx` / `CharacterSheetLayout`: either allow chat by `tokenId` even when `aiCharacter?.id` is missing, or show a clear “No linked AI persona found” state with a create/repair action instead of silently hiding chat.
2. **Add a canonical persona repair/backfill path** for existing Eliza agents so every WAGDIE persona has `externalId: String(tokenId)` and is discoverable by `GET /api/eliza/characters/[tokenId]`.
3. **Add a chat readiness/preflight endpoint** that reports WAGDIE character existence, linked persona status, wallet session, Eliza token validity, integration mode, legacy inference config, official service health, and conversation mapping availability.
4. **Improve chat error surfacing** in the dock: display API/SSE error codes distinctly for missing persona, wallet/auth required, token expired, provider config missing, official service unavailable, and conversation mapping failures.
5. **Validate runtime config loudly** at startup/deploy: legacy/dual should warn or fail when inference key/model are blank; official mode should verify `ELIZAOS_BASE_URL`, `ELIZAOS_API_KEY`, service auth, service-side provider config, and Supabase mapping access.
6. **Clarify editor-assistant persistence semantics:** make assistant proposals visibly “draft until saved,” and make import either create-first or clearly require an existing canonical persona record.

## Preventive Measures
- Add integration tests for “chat button visible / hidden” states when persona GET returns 200 vs 404, and for allowing backend auto-create if the UI is changed to permit token-id chat.
- Add contract tests that every create/save path preserves `externalId === tokenId` and that replace/import paths cannot break the external-id index.
- Add smoke tests or health checks for `/api/eliza/chat` in each integration mode with missing-vs-present runtime config.
- Add operational runbook steps for diagnosing a failing token: check `GET /api/eliza/characters/{tokenId}`, `GET /api/eliza/auth`, `POST /api/eliza/chat` SSE output, server logs, `ELIZA_INTEGRATION_MODE`, and mode-specific env/service health.

