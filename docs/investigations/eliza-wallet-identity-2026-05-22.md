# Investigation: Eliza Wallet Identity Handling

## Summary
In official Eliza mode, each connected wallet is treated as a unique Eliza chat/conversation user by deriving a deterministic `officialUserId` from the lowercased wallet address. Conversation/session state is wallet-scoped through that `officialUserId`, while character persona and knowledge memory are character/token/agent scoped and shared across wallets; legacy/custom mode cannot be proven wallet-scoped from this repo and has a stale-token caveat.

## Symptoms
- Need to understand how website Eliza agents identify users across wallet connections.
- Need to determine whether switching wallets changes Eliza conversation/user identity or shares state.

## Background / Prior Research
No external research gathered initially; this appears to be answerable from workspace code. If ElizaOS runtime identity semantics are needed, add external research here.

## Investigator Findings
<!-- Pair investigator appends structured analysis here with file:line refs, evidence, and conclusions. -->

### 2026-05-22 Pair Investigation - Wallet Identity and Scope

#### 1. Website wallet auth -> session address -> Eliza auth token storage
**Evidence**
- Website SIWE verification writes the authenticated wallet into the iron session as `session.address` and preserves the WAGDIE SIWE details/expiry, but it does not clear any existing `session.eliza` object when the wallet session changes (`app/api/auth/verify/route.ts:66-75`). Logout destroys the whole iron session and clears the legacy SIWE cookies (`app/api/auth/logout/route.ts:9-28`).
- Eliza auth nonce requires `session.address`; official mode creates app-owned nonce/session state, legacy mode asks the legacy Eliza client for nonce/sessionId, and both modes overwrite `session.eliza` with fresh SIWE state plus `tokens: undefined` to clear stale Eliza tokens before verification (`app/api/eliza/auth/nonce/route.ts:54-70`, `app/api/eliza/auth/nonce/route.ts:83-105`).
- Official Eliza verify checks the signed SIWE address against `session.address`, creates an opaque `wagdie_eliza_*` app-gate token, derives `officialUserId = getOfficialElizaUserIdForWallet(session.address)`, and stores `{ mode: 'official', officialUserId }` in `session.eliza.tokens` (`app/api/eliza/auth/verify/route.ts:76-118`). Legacy verify stores only legacy access/refresh tokens plus `mode: 'legacy'`, with no wallet binding field (`app/api/eliza/auth/verify/route.ts:122-138`).
- The deterministic official user id comes from `createOfficialWalletUserId(address)`, which hashes the lowercased trimmed wallet address in the `wallet-user` scope (`lib/eliza/authBridge.ts:11-13`, `lib/eliza/official/ids.ts:17-25`, `lib/eliza/official/ids.ts:33-35`).
- Official token status recomputes the wallet-derived official id from the current `session.address` and rejects a stored official token whose `tokens.officialUserId` does not match; non-official tokens are also rejected in official mode (`lib/eliza/sessionAuth.ts:84-105`). The route tests cover storing the official id and hiding it from responses (`tests/api/eliza/auth-routes.test.ts:109-143`, `tests/api/eliza/auth-routes.test.ts:149-169`) and rejecting stale legacy tokens in official mode (`tests/api/eliza/auth-routes.test.ts:172-191`).

**Conclusion**
Official mode treats the current wallet as the identity source and derives a stable, deterministic official Eliza user id from it. Legacy mode stores user-scoped Eliza tokens but local code does not bind those tokens to the wallet address.

#### 2. Chat send -> server-side identity injection -> official Eliza client/session creation/continuation
**Evidence**
- `/api/eliza/chat` requires both a wallet session and a valid Eliza token (`app/api/eliza/chat/route.ts:56-68`), resolves the character by WAGDIE token id (`app/api/eliza/chat/route.ts:101-115`), and injects `userId: tokenResult.officialUserId`, `walletAddress: walletResult.address`, `tokenId`, and any `conversationId` into the server-side gateway call (`app/api/eliza/chat/route.ts:166-179`).
- The official client refuses chat without a configured/input official user id (`lib/eliza/official/client.ts:175-184`). For a new official chat it creates an ElizaOS messaging session with `userId: officialUserId`, then creates a local conversation link containing `walletAddress`, `officialUserId`, `tokenId`, `officialAgentId`, and `officialSessionId` (`lib/eliza/official/client.ts:330-368`). For continuation, it requires `conversationRepository.findForUser(input.conversationId, officialUserId)` and verifies the mapped agent matches the requested character (`lib/eliza/official/client.ts:350-354`).
- Tests assert the chat route passes the wallet-derived official user id into `sendMessageStream` (`tests/api/eliza/chat.test.ts:131-175`) and the official client creates official sessions/repository links with that id (`tests/api/eliza/official-client.test.ts:398-447`).

**Conclusion**
Official chat creation and continuation are wallet-user scoped server-side. A caller cannot select an arbitrary official user id from the browser; the route derives it from the session token path.

#### 3. Conversation list/get/delete -> repository lookup keys and wallet isolation
**Evidence**
- List/get/delete routes all require wallet session and token, then create the user client with `{ accessToken, officialUserId, walletAddress }` in official mode (`app/api/eliza/conversations/route.ts:34-56`, `app/api/eliza/conversations/[conversationId]/route.ts:27-52`, `app/api/eliza/conversations/[conversationId]/route.ts:116-139`). Route tests assert list/get/delete pass the wallet-derived official identity and lowercased wallet into `createUserClient` (`tests/api/eliza/conversations.test.ts:216-301`).
- Official conversation schema records lowercased `wallet_address`, non-null `official_user_id`, `official_session_id UNIQUE`, and service-role-only RLS; its header comment says cross-wallet isolation is enforced by wallet/user lookup keys (`supabase/migrations/20260510020000_create_eliza_official_conversation_links.sql:1-16`, `supabase/migrations/20260510020000_create_eliza_official_conversation_links.sql:34-54`).
- Repository isolation is primarily `official_user_id`: `findForUser` filters by `id`, `official_user_id`, and non-deleted status; `listForUser` filters by `official_user_id` and active status, optionally by `official_agent_id`; `markDeleted`, `markActivity`, `recordError`, and `rebindSession` all update by `id + official_user_id` (`lib/eliza/officialConversationRepository.ts:182-191`, `lib/eliza/officialConversationRepository.ts:207-223`, `lib/eliza/officialConversationRepository.ts:237-250`, `lib/eliza/officialConversationRepository.ts:264-284`, `lib/eliza/officialConversationRepository.ts:297-310`, `lib/eliza/officialConversationRepository.ts:323-338`).
- Official client list/get/delete all fetch by the configured official user id; delete first deletes the hosted official session and then soft-deletes the local link by `conversationId + officialUserId` (`lib/eliza/official/client.ts:445-509`). Official-client tests cover missing-user rejection, user-scoped continuation, NOT_FOUND for a missing mapping, and list/get/delete repository calls by `officialUserId` (`tests/api/eliza/official-client.test.ts:501-523`, `tests/api/eliza/official-client.test.ts:542-565`, `tests/api/eliza/official-client.test.ts:583-623`, `tests/api/eliza/official-client.test.ts:637-669`).

**Conclusion**
Official conversation isolation is enforced by deterministic wallet-derived `official_user_id`; `wallet_address` is stored/indexed for auditing and passed to link creation, but lookup/delete enforcement is `conversation id + official_user_id`.

#### 4. Frontend active conversation persistence on wallet switch
**Evidence**
- Chat sidebar persists the active conversation under `wagdie-chat-conversation-${tokenId}-${address}`, so the localStorage key is wallet-scoped when the `address` used is correct (`components/chat/ChatSidebar.tsx:28-30`, `components/chat/ChatSidebar.tsx:98-103`). It restores only if connected/authenticated, no current `conversationId` exists, and the saved id appears in the fetched user-scoped conversation list; invalid saved ids are removed (`components/chat/ChatSidebar.tsx:112-130`). New conversation/delete active conversation remove the current address-scoped key (`components/chat/ChatSidebar.tsx:160-179`).
- The in-memory chat `conversationId` and messages live in hook state and are cleared only by `newConversation()` or unmount, not by wallet address changes (`hooks/useCharacterChat.ts:63-70`, `hooks/useCharacterChat.ts:196-198`, `hooks/useCharacterChat.ts:225-238`). `useConversations` similarly holds active conversation/list in React state (`hooks/useConversations.ts:69-72`, `hooks/useConversations.ts:140-154`, `hooks/useConversations.ts:168-194`).
- Global wallet auth does clear volatile WAGDIE auth state on normalized wallet-address changes (`contexts/AuthContext.tsx:180-185`), but that does not reset chat hook state. `useElizaAuth` clears its cached Eliza token only when disconnected, not when `address` changes while still connected (`hooks/useElizaAuth.ts:52-65`).

**Conclusion**
Persistent saved conversation ids are designed to be wallet-scoped, but there is a frontend caveat: if the wallet address changes while `ChatSidebar` remains mounted with an old in-memory `conversationId`, the persistence effect can write the old conversation id under the new wallet's key, and restore is skipped because `conversationId` is already set. Server-side official repository checks should reject use of that old conversation for the new wallet, but the UI can carry stale state/errors until it is reset.

#### 5. Character persona/knowledge APIs and official knowledge sync scope
**Evidence**
- Character GET/PUT resolves and mutates persona records by WAGDIE `tokenId`/external id, not by wallet-user id. PUT only authorizes the caller as owner/staker/admin before mutating the token-scoped character (`app/api/eliza/characters/[tokenId]/route.ts:30-64`, `app/api/eliza/characters/[tokenId]/route.ts:75-107`, `app/api/eliza/characters/[tokenId]/route.ts:146-189`). Authorization derives permissions from `session.address` and character ownership/staking/admin state (`lib/eliza/routeAuth.ts:36-58`, `lib/auth/character-permissions.ts:39-80`).
- Official character creation uses a deterministic official agent id from `externalId`/token id and stores WAGDIE metadata; lookup scans official agents by the WAGDIE external id (`lib/eliza/official/client.ts:260-292`, `lib/eliza/official/ids.ts:27-31`).
- Persona migration/sync state is keyed by `token_id` with optional `legacy_character_id` and `official_agent_id`; no wallet/user key exists in the migration table (`supabase/migrations/20260510000000_create_eliza_persona_migration_links.sql:1-16`). The app records official persona sync success by token id/official agent id (`app/api/eliza/characters/[tokenId]/route.ts:191-206`, `lib/eliza/personaMigration.ts:67-93`).
- Knowledge GET/POST/DELETE read and replace the character record's knowledge documents for the token-scoped character; mutations require the same character mutation authorization (`app/api/eliza/characters/[tokenId]/knowledge/route.ts:38-67`, `app/api/eliza/characters/[tokenId]/knowledge/route.ts:78-205`, `app/api/eliza/characters/[tokenId]/knowledge/[documentId]/route.ts:24-64`, `app/api/eliza/characters/[tokenId]/knowledge/[documentId]/route.ts:74-171`).
- Official knowledge sync is token/agent/document scoped: source pointers include `tokenId`, `documentId`, `officialAgentId`, and content hash, and sync state has primary key `(token_id, document_id)` with no wallet/user column (`lib/eliza/knowledgeSync.ts:65-81`, `lib/eliza/knowledgeSync.ts:122-196`, `lib/eliza/knowledgeSync.ts:213-281`, `supabase/migrations/20260510010000_create_eliza_knowledge_sync_states.sql:1-21`).

**Conclusion**
Persona and knowledge are character/token scoped and shared across wallets once authorized edits are saved. They are not per-wallet memory/state. Official knowledge sync indexes WAGDIE canonical token documents into the official agent/memory scope, not into a wallet-specific user scope.

#### 6. Legacy/custom Eliza mode caveat
**Evidence**
- Legacy nonce/verify uses the legacy Eliza auth contract and stores returned access/refresh tokens without an associated wallet address or `officialUserId` (`app/api/eliza/auth/nonce/route.ts:63-70`, `app/api/eliza/auth/verify/route.ts:122-138`, `types/wallet.ts:70-91`).
- `requireElizaUserToken` only performs wallet-derived id validation in official mode. In legacy mode, any non-expired token in `session.eliza.tokens` is accepted after the generic access-token/expiry checks (`lib/eliza/sessionAuth.ts:65-82`, `lib/eliza/sessionAuth.ts:84-109`).
- Main wallet SIWE verify overwrites `session.address` but does not clear `session.eliza`; therefore, if a browser/session changes wallets without an intervening logout or `/api/eliza/auth/nonce`, legacy Eliza tokens can remain in the session (`app/api/auth/verify/route.ts:66-75`). `useElizaAuth` can also keep an in-memory token across address changes because its cleanup effect watches `isConnected` rather than the actual `address` (`hooks/useElizaAuth.ts:52-65`, `hooks/useElizaAuth.ts:89-126`).

**Conclusion**
Official mode has server-side stale-token protection via recomputed wallet-derived `officialUserId`; legacy/custom mode does not locally bind Eliza tokens to the wallet address. Legacy safety depends on the legacy Eliza server's own token semantics or on forcing a fresh Eliza auth nonce/verify after wallet changes. Recommendation: clear `session.eliza` when main wallet SIWE `session.address` changes, clear `useElizaAuth` state on `address` changes, and reset chat conversation state on wallet changes to avoid stale UI and legacy-token reuse.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** Wallet address is used as the Eliza user identity and/or conversation participant key.
**Findings:** Initial file map shows Eliza auth/chat/conversation APIs under `app/api/eliza`, wallet UI under `components/wallet`, auth logic under `lib/auth`, and Eliza integration under `lib/eliza`.
**Evidence:** User-provided file map and repository guidelines.
**Conclusion:** Proceeded with context_builder to discover relevant workspace files before pair investigation.

### Phase 2 - Context Builder / Oracle Initial Assessment
**Hypothesis:** Official Eliza mode maps wallets to deterministic users, while knowledge/persona state is character-scoped.
**Findings:** Context builder selected wallet auth, Eliza auth/chat/conversation routes, official client/repository files, migrations, frontend chat hooks, and tests. Initial Oracle assessment matched the final model: official conversations are wallet-scoped; character knowledge/persona is shared per character; legacy mode depends on upstream token scoping.
**Evidence:** Selected files listed in context_builder output; later verified by pair findings above.
**Conclusion:** Confirmed as the main path for pair investigation.

### Phase 3 - Pair Investigator
**Hypothesis:** Direct source/test/migration evidence proves or disproves wallet-scoped Eliza identity.
**Findings:** Pair investigator appended detailed findings under `## Investigator Findings`, including official user id derivation, server-side identity injection, repository lookup keys, frontend persistence behavior, character knowledge/persona scope, and legacy caveats.
**Evidence:** See file:line references in `## Investigator Findings`.
**Conclusion:** Official chat/conversation state is wallet-scoped; persona/knowledge state is character-scoped; legacy mode has a local stale-token risk.

### Phase 4 - Oracle Synthesis
**Hypothesis:** Final answer needs precise wording around "unique user".
**Findings:** Oracle agreed that "each wallet is a unique Eliza user" is accurate only for official chat/conversation identity. It recommended distinguishing official conversation state from character-scoped memory and legacy/custom mode.
**Evidence:** Oracle synthesis over selected report and key source files; spot-checked `app/api/auth/verify/route.ts:66-75`, `lib/eliza/official/ids.ts:33-35`, `lib/eliza/sessionAuth.ts:84-105`, and `components/chat/ChatSidebar.tsx:28-30`, `:98-103`.
**Conclusion:** Final report uses scoped wording: official wallet user identity yes; character memory no; legacy unresolved/stale-token caveat.

## Root Cause
This is primarily an identity-model finding rather than a single defect.

Official Eliza chat/conversation identity is wallet-scoped: the website authenticates a wallet into `session.address`, official Eliza auth derives a stable `officialUserId` from the lowercased wallet address, chat routes inject that identity server-side, and official conversation repository operations are keyed by `conversation id + official_user_id`. A browser cannot provide an arbitrary official user id in the chat payload.

Character persona and knowledge memory are not per-wallet. Persona edits and knowledge documents are authorized by wallet permissions, but the persisted records are keyed by character token/external agent/document identifiers. After an authorized edit, that character state is shared across wallets.

Two caveats remain:
- Frontend `localStorage` restores active conversations with a wallet+token key, but in-memory chat/conversation state can survive an address change while the chat sidebar remains mounted. Official server-side checks should reject cross-wallet conversation reuse, but the UI can show stale state or errors until reset.
- Legacy/custom Eliza mode stores access/refresh tokens without a local wallet binding. Main WAGDIE SIWE verification overwrites `session.address` without clearing `session.eliza`, and `requireElizaUserToken()` validates legacy tokens by expiry only. Legacy wallet isolation therefore depends on the upstream Eliza access-token semantics or on forcing re-authentication after wallet switches.

## Recommendations
1. Clear `session.eliza` when `/api/auth/verify` authenticates a different wallet, or store the normalized wallet address with Eliza tokens and reject mismatches in `requireElizaUserToken()`.
2. Clear `useElizaAuth` cached token state whenever `address` changes, not only when the wallet disconnects.
3. Reset chat/conversation hook state on wallet address changes so stale in-memory `conversationId` and messages do not carry into another wallet's UI state.
4. Document the identity model: official conversations are wallet-scoped; persona and knowledge memory are character-scoped; legacy/custom mode relies on upstream access-token scoping unless local wallet binding is added.
5. Add a wallet-switch regression test: authenticate wallet A, obtain an Eliza token/conversation, authenticate wallet B in the same browser session, and assert stale Eliza token/conversation state is cleared or rejected.

## Preventive Measures
- Maintain the invariant that server routes derive wallet/user identity from the session, not request bodies.
- Keep official conversation repository operations scoped by `officialUserId`.
- Add tests around wallet changes for `session.eliza`, `useElizaAuth`, and chat sidebar state.
- Keep knowledge/persona documentation explicit that authorized edits update shared character state, not wallet-private memory.
