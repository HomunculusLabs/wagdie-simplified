# Investigation: ElizaOS Story Stop

## Summary
Crow's Den did not stop because the narrative state ended. Scheduled turns remain enabled, but every new turn fails before generation when Official ElizaOS tries to persist the inbound prompt message.

The best-supported root cause is UTF-16 code-unit truncation creating an unpaired surrogate in an Official ElizaOS prompt. ElizaOS accepts the prompt by `content.length <= 4000`, then fails later when it inserts the same content into `central_messages.raw_message` as `jsonb`.

## Symptoms
- Dev Crow's Den room `location_id=11` remains `tick_enabled: true`, but scheduled ticks fail.
- Room `last_error` is `Official ElizaOS streaming request failed`.
- App logs report upstream `MESSAGE_SEND_FAILED` from Official ElizaOS.
- ElizaOS logs show `Failed to create message in database` while inserting into `central_messages`.
- Last successful public story message observed was seq `1068`; subsequent scheduled ticks fail.

## Background / Prior Research
- Prior dev inspection found repeated failed ticks around `2026-05-27T08:38Z`–`2026-05-27T08:49Z`.
- A read-only dev runtime probe at `2026-05-27T10:03Z` confirmed the room remains `tick_enabled=true`, with `504` failed ticks and only `7` completed ticks.
- App logs repeatedly report Official ElizaOS `MESSAGE_SEND_FAILED` with `Failed to create message in database` while inserting into `central_messages`.
- ElizaOS `central_messages.content` is `text` with no varchar length limit; `raw_message` and `metadata` are `jsonb`.
- The referenced session channels exist in ElizaOS `channels`, making a missing `channel_id` FK unlikely.
- The failing logged prompt contains the fancy Unicode participant name `𝔐𝔞𝔩𝔞𝔠𝔥𝔦𝔱𝔢, 𝔱𝔥𝔢 𝔐𝔞𝔯𝔞𝔲𝔡𝔢𝔯 (#6558)` and a suspicious truncated escape fragment around `𝔐𝔞𝔩\\ud835…`.
- Strong current hypothesis: prompt truncation splits a Unicode surrogate pair or otherwise creates invalid JSONB in `raw_message`, so ElizaOS fails before model generation.
- Code seam mapping found 3900-character clamps in `lib/eliza/locationRooms/gameMasterGenerator.ts` and `lib/eliza/locationRooms/officialTurnGenerator.ts`; they use JS `.length` / `.slice()` rather than byte-safe or surrogate-safe truncation.

## Investigator Findings

### 2026-05-27 - UTF-16 prompt-clamp / ElizaOS JSONB investigation

**Conclusion: hypothesis proven at the code-path level.** The WAGDIE location-room prompt clamps use JavaScript UTF-16 code-unit `.length` / `.slice()` operations, so a clamp boundary can bisect a non-BMP character such as the gothic letters in `𝔐𝔞𝔩𝔞𝔠𝔥𝔦𝔱𝔢`. Official ElizaOS then persists the request as `raw_message` JSONB before model generation. The runtime facts in this report — `MESSAGE_SEND_FAILED`, `Failed to create message in database`, `central_messages.raw_message` being JSONB, and a logged truncated `𝔐𝔞\\ud835…` fragment — match this failure mode and do not match session/FK or ordinary length failures.

**Evidence from WAGDIE prompt code**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:184` sets `OFFICIAL_ELIZA_MESSAGE_MAX_CHARS = 3900`.
- `lib/eliza/locationRooms/gameMasterGenerator.ts:750-752` truncates prompt fragments with `normalized.length` and `normalized.slice(...)`.
- `lib/eliza/locationRooms/gameMasterGenerator.ts:756-771` clamps full GM prompts with `prompt.length` and `prompt.slice(...)`, including contract-preserving truncation before sending.
- `lib/eliza/locationRooms/gameMasterGenerator.ts:1136-1144` repeats the same code-unit clamp for scene-check outcome prompts.
- `lib/eliza/locationRooms/officialTurnGenerator.ts:31-41` uses the same 3900-code-unit limit and direct `prompt.slice(...)` for character-turn prompts; `lib/eliza/locationRooms/officialTurnGenerator.ts:33-37` also truncates prompt fragments with `.slice()`.
- `lib/eliza/official/messaging.ts:109-121` sends `{ content, transport, metadata }` by `JSON.stringify(...)` to `/api/messaging/sessions/:sessionId/messages`; there is no surrogate sanitization between prompt construction and the Official ElizaOS request body.

**Reproduction of the exact string hazard**
- Local Node 23.3.0 check: `𝔐` is one displayed character but two UTF-16 code units (`0xd835 0xdd10`). Slicing `('a'.repeat(3898) + '𝔐' + 'x').slice(0, 3899) + '…'` yields a 3900-code-unit string whose tail is `[0x61, 0xd835, 0x2026]` and `/[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])/` is true. `JSON.stringify({ content })` ends with `\\ud835…"}`. That is the same class of fragment called out in the runtime facts.
- This is not limited to the final full-prompt clamp: any prompt-fragment clamp using `.slice()` can create an unpaired surrogate if the source field is long enough and has non-BMP Unicode near the boundary.

**Evidence from Official ElizaOS 1.7.2 storage path**
- The service package is pinned in this repo at `services/elizaos/package.json:11-13` (`@elizaos/server` / `@elizaos/core` / bootstrap at `1.7.2`). I inspected the published `@elizaos/server@1.7.2` and `@elizaos/plugin-sql@1.7.2` tarballs in `/tmp` because the server package is not vendored in the repo.
- `@elizaos/server@1.7.2 dist/index.js:25471-25476` accepts any object whose `content` is a string as a session-message request.
- `@elizaos/server@1.7.2 dist/index.js:25615-25627` validates non-empty `content.length <= 4000`; this is also UTF-16 code-unit length and does not reject lone surrogates.
- `@elizaos/server@1.7.2 dist/index.js:25749-25818` handles `POST /api/messaging/sessions/:sessionId/messages`, then calls `serverInstance.createMessage({ channelId: session.channelId, authorId: session.userId, content: body.content, rawMessage: { content: body.content, attachments: body.attachments }, sourceType: 'user', metadata })`. The failure message `Failed to create message in database` is thrown around that create call, before any model response is generated.
- `@elizaos/plugin-sql@1.7.2 dist/node/index.node.js:12665-12680` defines `central_messages.content` as `text` and `raw_message` / `metadata` as `jsonb`.
- `@elizaos/plugin-sql@1.7.2 dist/node/index.node.js:14574-14593` inserts `rawMessage: data.rawMessage` directly into `central_messages`. A lone surrogate in `rawMessage.content` is therefore the sensitive path, while `content text` itself has no varchar-style limit.

**Eliminated hypotheses**
- **Missing/expired session:** unlikely. ElizaOS checks `sessions.get(sessionId)` and expiration before the database insert in `@elizaos/server@1.7.2 dist/index.js:25749-25766`. A bad session should surface as session-not-found/expired, not `Failed to create message in database`.
- **Missing channel FK:** unlikely. Session creation creates a fresh channel before storing the in-memory session (`@elizaos/server@1.7.2 dist/index.js:25661-25725`), and this report's runtime facts say the referenced session channels exist. If the channel were missing, the observed suspicious `\\ud835` fragment would be unrelated coincidence.
- **Missing author FK:** ruled out for this schema. `@elizaos/plugin-sql@1.7.2 dist/node/index.node.js:12665-12680` defines `central_messages.author_id` as plain `text` with no FK reference; only `channel_id` and `in_reply_to_root_message_id` have references.
- **Pure content length:** ruled out. WAGDIE clamps outbound location-room prompts to 3900 code units (`gameMasterGenerator.ts:184`, `officialTurnGenerator.ts:31`), while ElizaOS rejects only `content.length > 4000` before insertion (`@elizaos/server@1.7.2 dist/index.js:25615-25627`). Also, a simple length rejection should occur during request validation, not as a wrapped database-create failure, and `central_messages.content` is `text`, not varchar-limited.

**Existing validation coverage / gaps**
- Unit tests assert location-room prompt content and the presence of the GM truncation marker (`tests/lib/eliza/location-room-game-master-generator.test.ts:279-311`) and structured character-turn prompt behavior (`tests/lib/eliza/location-room-game-master-generator.test.ts:1073-1080`, `1488-1560`), but I found no tests for non-BMP Unicode at clamp boundaries or for rejecting lone surrogate output.
- The live smoke script can send arbitrary session content via `sendSseMessage` (`scripts/elizaos-official-smoke.ts:393-411`), but current chat/session smoke calls use short ASCII messages only (`scripts/elizaos-official-smoke.ts:500-503`). The operations docs list the smoke commands (`package.json:24-27`, `docs/operations/elizaos-validation.md:29-35`) but do not include a near-limit Unicode payload probe.

**Recommended fix locations**
1. Add a shared Unicode-safe clamp/sanitize helper for Official ElizaOS-bound strings. It should never emit unpaired surrogates; using code-point iteration (`Array.from` / `for...of`) plus a final lone-surrogate scrub is sufficient for this bug, and a byte-budgeted variant would be safer if ElizaOS later enforces bytes.
2. Replace clamp/truncate calls in `lib/eliza/locationRooms/gameMasterGenerator.ts:750-771` and `1136-1144`, and in `lib/eliza/locationRooms/officialTurnGenerator.ts:33-41`.
3. Add a final defense in `lib/eliza/official/messaging.ts:109-121` before `JSON.stringify` so all Official ElizaOS session messages are surrogate-safe even if future prompt builders forget to use the helper.
4. Add unit tests in `tests/lib/eliza/location-room-game-master-generator.test.ts` that construct near-3900 prompts with `𝔐`/emoji at the boundary, assert length remains within the ElizaOS limit, assert no unpaired surrogate regex match, and assert the serialized request body does not contain an unpaired `\\ud8xx` / `\\ud9xx` escape.
5. Extend `scripts/elizaos-official-smoke.ts` with an opt-in near-limit Unicode session-message probe against a disposable session to catch ElizaOS JSONB storage regressions without making normal smoke runs expensive or risky.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** Scheduled story progression is failing at the Official ElizaOS message persistence boundary, not in narrative state selection.
**Findings:** Dev runtime checks confirmed the room remained tick-enabled while repeated ticks failed with `Official ElizaOS streaming request failed`.
**Evidence:** See Background / Prior Research and Investigator Findings.
**Conclusion:** Confirmed. The story did not naturally stop; ElizaOS failed while persisting the inbound Official prompt.

### Phase 2 - Prompt Truncation and Storage Path
**Hypothesis:** UTF-16 `.slice()` truncation can split non-BMP Unicode and create invalid JSONB when ElizaOS stores `raw_message`.
**Findings:** WAGDIE prompt builders clamp with `.length` / `.slice()`; Official transport sends the result without sanitization; ElizaOS stores the request body into `raw_message jsonb` before generation.
**Evidence:** `lib/eliza/locationRooms/gameMasterGenerator.ts:749-771`, `lib/eliza/locationRooms/gameMasterGenerator.ts:1136-1144`, `lib/eliza/locationRooms/officialTurnGenerator.ts:33-41`, `lib/eliza/official/messaging.ts:109-121`, and ElizaOS 1.7.2 storage-path findings above.
**Conclusion:** Best-supported root cause. Exact failed payload was not captured, but the logged `\\ud835` fragment matches this mechanism.

## Root Cause
The failure is best explained by unsafe prompt truncation on Official ElizaOS-bound messages:

1. Location-room GM and character prompts are clamped with JavaScript UTF-16 code-unit APIs, not Unicode-safe APIs.
   - `lib/eliza/locationRooms/gameMasterGenerator.ts:184` defines `OFFICIAL_ELIZA_MESSAGE_MAX_CHARS = 3900`.
   - `lib/eliza/locationRooms/gameMasterGenerator.ts:749-752`, `756-771`, and `1136-1144` use `.length` / `.slice()` for prompt truncation.
   - `lib/eliza/locationRooms/officialTurnGenerator.ts:31-41` uses the same `.length` / `.slice()` pattern for character prompts.
2. Non-BMP Unicode names such as `𝔐𝔞𝔩𝔞𝔠𝔥𝔦𝔱𝔢` are represented by surrogate pairs in JavaScript. `.slice()` can split the pair and leave a lone surrogate.
3. `lib/eliza/official/messaging.ts:109-121` sends the resulting `input.content` directly in `JSON.stringify({ content, transport, metadata })`, with no final sanitization.
4. Official ElizaOS stores the inbound request content into `central_messages.raw_message` as `jsonb` before generation. Runtime logs show the failure at that database-create step and include a suspicious `\\ud835`-class fragment near the fancy Unicode name.

This is proven viable at the code-path level and is the best-supported explanation for the observed dev failure. The exact failed request body and underlying PostgreSQL error text were not captured, so the wording should remain slightly qualified rather than claiming absolute proof from a single captured payload.

## Eliminated Hypotheses
- **Narrative state stopped naturally:** eliminated. The room remained `tick_enabled=true`; the worker continued scheduling ticks and recording failures.
- **Pure `content` length limit:** unlikely. ElizaOS `central_messages.content` is `text`, and ElizaOS request validation rejects only `content.length > 4000` before insertion. The observed error is a database-create failure.
- **Missing author FK:** eliminated for the inspected schema. `author_id` is text without an FK.
- **Missing channel FK / stale session:** unlikely. Runtime inspection found referenced channels in ElizaOS `channels`; ElizaOS validates session existence before the message-create path.
- **Encounter escalation logic directly broke story flow:** unlikely as direct cause. The escalation changes increased prompt/context size and made truncation more likely, but the failure boundary is Official ElizaOS message persistence.

## Recommendations
1. Add a shared Official ElizaOS-bound string sanitizer/clamp that is surrogate-safe and uses a conservative byte budget. Treat 3900 bytes as a WAGDIE safety budget, not as an ElizaOS-declared byte limit.
2. Replace unsafe prompt truncation in:
   - `lib/eliza/locationRooms/gameMasterGenerator.ts:749-771`
   - `lib/eliza/locationRooms/gameMasterGenerator.ts:1136-1144`
   - `lib/eliza/locationRooms/officialTurnGenerator.ts:33-41`
3. Add a final defensive sanitization layer in `lib/eliza/official/messaging.ts:109-121` before `JSON.stringify`, so future prompt builders cannot send unpaired surrogates to Official ElizaOS.
4. Add unit tests for near-boundary non-BMP Unicode prompts, including gothic letters and emoji. Assert that clamped prompts preserve required JSON contract markers, remain under the safety budget, and contain no unpaired surrogates or serialized `\\ud8xx` / `\\ud9xx` fragments.
5. Add an opt-in live smoke probe to `scripts/elizaos-official-smoke.ts` for near-limit Unicode session messages. Keep it opt-in so normal smoke tests stay cheap and safe.
6. Improve logging for future incidents: record prompt source, code-unit length, UTF-8 byte length, clamped length, session id, and upstream body enough to distinguish validation, DB, and model-generation failures without exposing full prompt content.

## Preventive Measures
- Centralize all Official ElizaOS payload constraints in one helper rather than duplicating prompt-local `.slice()` logic.
- Add regression tests whenever location-room prompt contracts or metadata increase prompt size.
- Keep narrative escalation/catalog additions behind prompt-size tests so richer context cannot silently push requests into persistence failures.
- Preserve a dev smoke workflow that can validate Official ElizaOS persistence with realistic Unicode names before resetting live room state.
