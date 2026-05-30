# Eliza and Backend Architecture

This page documents the durable backend route/service/gateway pattern, with Eliza chat as the main example. It intentionally describes contracts and seams, not migration history.

## Backend route pattern

Most backend code follows this shape:

```text
app/api/*/route.ts
  ├─ parse HTTP params/body
  ├─ load session or authorization state when required
  ├─ validate domain inputs
  ├─ call lib/api/handlers, lib/services, repositories, or integration clients
  └─ return stable JSON or stream contracts
```

Representative non-Eliza examples:

- `app/api/characters/route.ts` parses filters/pagination, calls `getCharacters()` from `lib/services/character-service.ts`, and returns a raw JSON response.
- `app/api/characters/[tokenId]/route.ts` delegates to `lib/api/handlers/character-update.ts`.
- `lib/api/handlers/character-update.ts` performs wallet session checks, admin/owner authorization, allowed-field filtering, stat validation, and the final service write.
- `lib/services/character-service.ts` wraps character business operations and depends on the repository interface.
- `lib/repositories/character-repository.ts` is the compatibility facade over specialized Supabase-backed character repositories.

Use this pattern for new backend endpoints: route files should own HTTP contracts; reusable domain behavior should move into handlers/services/repositories.

## Supabase and service layers

`lib/supabase.ts` creates the Supabase clients used by backend and selected browser-safe flows:

- `createSupabaseClient()` uses server runtime env vars on the server and `NEXT_PUBLIC_*` values in the browser.
- `createSupabaseAdminClient()` creates a server-only service-role client with Supabase auth persistence disabled.
- `getSupabase()` and `getSupabaseAdmin()` lazily initialize singleton clients.

Domain-specific data access is layered above those clients. Current examples include character repositories in `lib/repositories/character/*`, location and event repositories under `lib/repositories/*`, lore persistence under `lib/lore/*`, sync services under `lib/services/sync/*`, and Eliza persistence under `lib/eliza/*`.

Schema truth remains in `supabase/migrations/`.

## Eliza route areas

Browser-facing Eliza APIs live under `app/api/eliza/*`:

- `auth/nonce` and `auth/verify` implement the user-scoped Eliza SIWE gate.
- `characters/[tokenId]` gets or mutates the AI character/persona for a WAGDIE token.
- `chat` streams chat output to the browser.
- `conversations` lists user conversations; related conversation detail/delete routes live under the same route area.
- `location-rooms/*` contains location-room Eliza flows when that feature is enabled.

The browser should depend on these route contracts, not on custom Eliza or official ElizaOS service details.

## Eliza auth contract

Eliza auth is layered on top of the base WAGDIE wallet session:

1. The user completes normal wallet SIWE auth through `app/api/auth/nonce/route.ts`, `app/api/auth/verify/route.ts`, `lib/auth/siwe.ts`, and `lib/auth/session.ts`.
2. `app/api/eliza/auth/nonce/route.ts` requires `session.address`, creates or fetches an Eliza nonce/session id, builds a WAGDIE-owned SIWE message, and stores it in `session.eliza.siwe`.
3. `app/api/eliza/auth/verify/route.ts` verifies the signature. In legacy mode it calls `getElizaClient().auth.verify()`. In official mode it verifies the SIWE message inside WAGDIE and creates an app-owned access token gate.
4. `lib/eliza/sessionAuth.ts` provides `requireWalletSession()` and `requireElizaUserToken()` helpers used by protected Eliza routes.

In official mode, WAGDIE owns browser-facing SIWE/session semantics. The official ElizaOS service is called server-to-server and its credentials are not exposed to the browser.

## Chat route contract

`app/api/eliza/chat/route.ts` is the representative backend/gateway flow. Its stable browser contract is:

- Method: `POST /api/eliza/chat`
- Required JSON body: `{ tokenId, message }`
- Optional JSON body: `{ conversationId }`
- Response: `text/event-stream`
- SSE event names preserved for the frontend: `token`, `complete`, and `error`

The route flow is:

```text
POST /api/eliza/chat
  ├─ getSession()
  ├─ requireWalletSession(session)
  ├─ requireElizaUserToken(session)
  ├─ validate canonical tokenId and message
  ├─ getCharacter(tokenId) from WAGDIE data
  ├─ getElizaClient()
  ├─ getCharacterByTokenId(...) as a no-side-effect canonical persona lookup
  ├─ return 409 AI_PERSONA_REQUIRED if no saved persona exists
  └─ serverClient.chat.sendMessageStream(..., callbacks)
        ├─ onChunk    → SSE event: token
        ├─ onComplete → SSE event: complete
        └─ onError    → SSE event: error
```

Public chat does not create personas as a side effect. `getCharacterByTokenId()` in `lib/eliza/characterResolver.ts` maps a WAGDIE token id to an existing Eliza `CharacterRecord` by canonical external id and returns `null` when missing. `PUT /api/eliza/characters/[tokenId]` is the canonical create/update path; users must save an AI persona before public chat can stream.

The route uses `ReadableStream`, aborts upstream streaming when the client cancels, and normalizes gateway errors with `toStreamErrorPayload()`.

## Gateway selection

`lib/eliza/client.ts` is the server-side gateway selector:

- `getElizaClient()` returns a singleton server client and throws if called in the browser.
- `createUserClient()` creates user-scoped clients for conversation routes.
- `ELIZA_INTEGRATION_MODE=legacy` or `dual` uses `createWagdieElizaHttpClient()` from `lib/eliza/gateway/client.ts`.
- `ELIZA_INTEGRATION_MODE=official` uses `createOfficialWagdieElizaClient()` from `lib/eliza/official/client.ts`.

`lib/eliza/config.ts` centralizes server-side Eliza configuration, including custom gateway URL/API key, Venice inference settings for legacy/dual mode, official ElizaOS URL/API key, and location-room settings.

## Gateway interface

`lib/eliza/gateway/types.ts` defines the route-facing gateway contract. Routes depend on `WagdieElizaClient`, not directly on the legacy HTTP implementation or official ElizaOS SDK.

Important interfaces:

- `WagdieElizaAuthGateway` — nonce and verify methods for legacy auth.
- `WagdieElizaCharactersGateway` — record lookup, create, and replace methods.
- `WagdieElizaChatGateway` — `sendMessageStream(input, callbacks)`.
- `WagdieElizaConversationsGateway` — list, list-for-character, get, and delete.
- `GatewayChatSendInput` — includes character id, message, optional conversation id, wallet/user identity, token id, optional resolved character payload, and abort signal.
- `StreamCallbacks` — route callback contract for chunks, completion, and errors.

This interface is the compatibility layer that lets routes preserve browser behavior while the upstream implementation changes.

## Legacy/custom gateway behavior

`lib/eliza/gateway/client.ts` implements the app-owned raw HTTP gateway. It uses the custom Eliza API for auth, character records, and conversation metadata/history, and uses Venice/OpenAI-compatible streaming for chat inference when configured.

In this mode, `sendMessageStream()` builds messages from the character record and streams model chunks through the shared callback interface. Route files should not know whether chunks came from Venice, custom Eliza, or another implementation.

## Official ElizaOS adapter behavior

`lib/eliza/official/client.ts` adapts `@elizaos/api-client` to the same `WagdieElizaClient` interface. It:

- Creates/updates official agents from WAGDIE character records.
- Adds WAGDIE metadata such as external token id to official character settings.
- Requires a wallet-derived official user id for chat/conversation routes.
- Starts agents and creates official sessions for new conversations.
- Persists WAGDIE conversation ids to official session ids through `lib/eliza/officialConversationRepository.ts`.
- Maps official session messages back to WAGDIE conversation DTOs.

The official adapter explicitly does not expose official ElizaOS SIWE nonce/verify to the browser. WAGDIE route auth remains the browser-facing auth gate.

## Character/persona route contract

`app/api/eliza/characters/[tokenId]/route.ts` is the persona route:

- `GET` validates the token id, uses `getCharacterRecordByExternalId()`, and returns a WAGDIE `AICharacter` DTO or `404`.
- `PUT` uses `authorizeElizaCharacterMutation()` to require character ownership, validates the payload with `validatePutCharacterSheetUpdate()`, then creates or replaces a canonical Eliza record through the gateway.
- SDK adapter helpers in `lib/eliza/sdkAdapter` convert between WAGDIE-facing DTOs and agent character payloads.

In dual and official modes, persona migration/shadow bookkeeping happens behind this route; the browser contract remains a WAGDIE `AICharacter` response.

## Conversation route contract

`app/api/eliza/conversations/route.ts` requires both wallet and Eliza auth. It creates a user-scoped gateway client with `createUserClient()`, translates optional `tokenId` filters to Eliza record ids through `getRecordIdByTokenId()`, and maps gateway conversation summaries into WAGDIE `Conversation` DTOs.

Official-mode conversations use Supabase-backed links in `eliza_official_conversation_links` so WAGDIE conversation ids remain stable while official ElizaOS session ids stay server-side.

## Backend guardrails

- Keep browser contracts stable at `app/api/eliza/*`; gateway implementations may change behind `lib/eliza/client.ts`.
- Do not expose official ElizaOS API keys, sessions, or SIWE semantics to the browser.
- Use `requireWalletSession()` and `requireElizaUserToken()` for protected Eliza routes.
- Use `characterResolver` helpers for token id ↔ Eliza record id translation.
- Keep Supabase schema details in migrations and repository code.
- Keep operational validation and cutover procedures under `docs/operations/*`, not in this architecture page.
