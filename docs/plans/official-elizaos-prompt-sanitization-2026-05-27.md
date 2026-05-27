# Official ElizaOS Prompt Sanitization: Plan

## Goal
Fix Crow's Den / location-room Official ElizaOS turn failures by making all Official ElizaOS-bound prompt content Unicode-safe before persistence, while preserving required GM/character JSON contracts and adding regression coverage for near-limit Unicode payloads.

## Background
- Investigation report: `docs/investigations/elizaos-story-stop-2026-05-27.md`.
- The supported root cause is unsafe UTF-16 `.length` / `.slice()` truncation producing an unpaired surrogate in an Official ElizaOS prompt, then ElizaOS failing while inserting that prompt into `central_messages.raw_message jsonb`.
- Prompt builders currently clamp with JavaScript UTF-16 `.length` / `.slice()`:
  - `lib/eliza/locationRooms/gameMasterGenerator.ts:184`, `749-771`, `1136-1144`
  - `lib/eliza/locationRooms/officialTurnGenerator.ts:31-41`
- Official transport currently sends `input.content` directly via `JSON.stringify` in `lib/eliza/official/messaging.ts:109-121`.
- Existing GM prompt-builder behavior preserves required JSON contract markers by truncating earlier context first, then appending the contract marker and contract body. Preserve this behavior.
- Validation seams:
  - Focused Jest prompt/GM tests in `tests/lib/eliza/location-room-game-master-generator.test.ts`.
  - Official ElizaOS live smoke in `scripts/elizaos-official-smoke.ts`, currently using short ASCII chat messages.
  - Commands: `bun run test`, focused Jest for the GM test file, `bun run elizaos:smoke`, `bun run elizaos:smoke:post-restart`, `bun run elizaos:db:validate`, `bun run elizaos:routes:validate`.
- User decisions:
  - Fix boundary: central Official transport defense plus GM/character prompt-builder updates.
  - Smoke scope: near-limit Unicode validation should be always-on in the normal Official ElizaOS smoke path.
  - Dev room recovery/reset is out of scope for this plan.

## Approach
Implement the fix at two layers:

1. **Builder-level correctness:** replace prompt-local `.length` / `.slice()` truncation with Unicode-safe, byte-budget-aware clamping that preserves required JSON contract suffixes.
2. **Transport-level defense:** sanitize and clamp all `OfficialElizaMessagingClient.sendSessionMessage()` content immediately before `JSON.stringify`, so future Official callers cannot reintroduce invalid Unicode payloads.

Use a conservative WAGDIE safety budget of **3900 UTF-8 bytes** for Official-bound content. ElizaOS appears to enforce `content.length <= 4000` code units, but the failure mode is invalid Unicode reaching `raw_message jsonb`, not a simple DB text length limit.

The implementation should prefer a small sibling utility such as `lib/eliza/official/text.ts`, but exact placement can be adjusted if tests/imports make colocating elsewhere cleaner. Keep the helper dependency-light so both app code and `scripts/elizaos-official-smoke.ts` can use it. Verify `String.prototype.toWellFormed()`, `TextEncoder`, and `Buffer.byteLength` compatibility under Node 23.3.0 and the repo build; include a manual fallback for lone-surrogate repair if needed.

## Contract-Preserving Clamp Rules
The implementation agent should not have to infer these edge cases:

1. Sanitize to well-formed text before measuring or clamping.
2. If the full text is within the byte budget, return it unchanged except for sanitization.
3. If preserving a suffix contract, find the marker and treat everything from the marker to the end as the suffix.
4. If `suffix + truncation notice` fits within the byte budget, clamp only the prefix and return `prefix + notice + suffix`.
5. If `suffix + notice` does not fit but the suffix alone fits, drop the notice and preserve the suffix with as much prefix as fits.
6. If the suffix alone does not fit, safely clamp the suffix as a last-resort fallback and rely on tests to prove current GM/character contracts do not hit this path.
7. Never truncate by raw code-unit `.slice()` when producing outbound Official content.

## Work Items

### Item 1 — Add shared Official-bound text utility
**Goal:** Provide one small utility for Official ElizaOS-bound strings that can sanitize malformed Unicode and clamp without splitting code points.

**Done when:**
- A helper exists under `lib/eliza/official/` or equivalent Official-bound module with an exported `OFFICIAL_ELIZA_MESSAGE_MAX_BYTES` safety budget.
- It removes or repairs unpaired surrogates, removes NUL characters, preserves valid non-BMP Unicode, and clamps by UTF-8 byte length.
- It exposes both plain clamping and suffix-preserving clamping using the fallback rules above.
- Tests assert representative payloads remain under both the 3900-byte WAGDIE budget and the upstream 4000-code-unit ElizaOS validation limit.
- It avoids import/runtime choices that break app code or smoke scripts; if script import compatibility is uncertain, validate it immediately after this item.

**Key files:**
- New `lib/eliza/official/text.ts` or equivalent.
- `tests/lib/eliza/location-room-game-master-generator.test.ts` or focused Official utility tests.

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Add central Official transport defense
**Goal:** Ensure every Official ElizaOS session message is safe at the last boundary before ElizaOS persistence.

**Done when:**
- `OfficialElizaMessagingClient.sendSessionMessage()` sanitizes/clamps `input.content` before `JSON.stringify`.
- The sent body uses the sanitized content while preserving `transport`, `metadata`, headers, signal, URL, retry behavior, and streaming behavior.
- Transport-level truncation is accepted behavior for over-budget Official messages; it is preferable to upstream persistence failure.
- Diagnostics, if added, log only source/session context and input/output code-unit + UTF-8 byte lengths, never full prompt bodies.

**Key files:**
- `lib/eliza/official/messaging.ts:109-121`
- Optional focused transport test file if mocking `fetch` is cleaner than expanding the GM test file.

**Dependencies:** Item 1.

**Size:** Small to medium.

### Item 3 — Replace GM prompt clamps while preserving contracts
**Goal:** Make GM beat and scene-check outcome prompts Unicode-safe without weakening the existing JSON contract-preserving behavior.

**Done when:**
- `truncatePromptValue()`, `clampGameMasterPrompt()`, and `clampGameMasterSceneCheckOutcomePrompt()` no longer use unsafe code-unit slicing for truncation.
- GM beat prompts still preserve `Return only JSON with this contract:` whenever technically possible.
- Scene-check outcome prompts still preserve `Return only a JSON object with this exact scene-check outcome contract:` whenever technically possible.
- Truncation notice wording no longer claims an inaccurate `4000-character` limit; it refers to the Official ElizaOS safety budget.

**Key files:**
- `lib/eliza/locationRooms/gameMasterGenerator.ts:184`
- `lib/eliza/locationRooms/gameMasterGenerator.ts:749-771`
- `lib/eliza/locationRooms/gameMasterGenerator.ts:1136-1144`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 4 — Replace character prompt clamps while preserving narrative contract
**Goal:** Make location-room character prompts Unicode-safe and prevent clamping from removing the narrative JSON contract.

**Done when:**
- `truncatePromptValue()` and `clampOfficialPrompt()` in `officialTurnGenerator.ts` no longer split surrogate pairs or exceed the selected safety budget.
- Narrative-context prompts preserve the `Return JSON only with this contract:` section when present.
- The `publicSpeech` / `declaredAction` contract and scene-check rule lines survive clamping whenever technically possible.

**Key files:**
- `lib/eliza/locationRooms/officialTurnGenerator.ts:31-41`

**Dependencies:** Item 1.

**Size:** Medium.

### Item 5 — Add deterministic Unicode regression tests
**Goal:** Prove the incident class without requiring live ElizaOS.

**Done when:**
- Tests construct near-budget prompt content with gothic letters and emoji at truncation boundaries.
- Tests assert clamped content stays within the Official safety budget, contains no lone surrogates, and does not serialize to broken `\\ud8xx` / `\\ud9xx` fragments.
- GM beat prompt tests assert the JSON contract still appears after clamping.
- GM scene-check outcome prompt tests assert the scene-check outcome contract still appears after clamping.
- Character narrative prompt tests assert `Return JSON only with this contract`, `publicSpeech`, and `declaredAction` survive clamping.
- Existing tests expecting the old `4000-character` truncation notice are updated.
- A transport-level test verifies `sendSessionMessage()` sanitizes malformed/over-budget content before sending.

**Key files:**
- `tests/lib/eliza/location-room-game-master-generator.test.ts`
- Optional new `tests/lib/eliza/official-messaging.test.ts`
- Optional focused utility test if cleaner.

**Dependencies:** Items 1–4.

**Size:** Medium.

### Item 6 — Add always-on near-limit Unicode smoke coverage
**Goal:** Catch future ElizaOS `central_messages.raw_message` persistence failures in the normal Official ElizaOS smoke path.

**Done when:**
- `bun run elizaos:smoke` fresh phase sends a disposable session message containing near-limit, well-formed non-BMP Unicode content.
- The new smoke check is inserted in `scripts/elizaos-official-smoke.ts` inside `checkChatAndSessions()` after the existing two SSE message checks and before disposable session deletion/error-compat checks.
- The smoke payload is intentionally built over budget, then clamped by the same helper if import-compatible; if not import-compatible, the script uses a local builder aligned to the same 3900-byte budget and surrogate-safety behavior.
- The payload includes observed-style gothic name content plus other non-BMP characters near the boundary.
- The check runs through the existing `sendSseMessage()` / session-message path and fails on upstream `MESSAGE_SEND_FAILED` / non-OK behavior.
- The check is skipped only when existing chat/SSE checks are skipped via `ELIZAOS_SMOKE_SKIP_CHAT=true`.
- `docs/operations/elizaos-validation.md` mentions normal smoke now includes near-limit Unicode persistence coverage.

**Key files:**
- `scripts/elizaos-official-smoke.ts`
- `docs/operations/elizaos-validation.md`
- `package.json` scripts as command reference.

**Dependencies:** Item 1 if the smoke script imports the shared helper; otherwise this item can proceed with a local aligned builder after Item 1 settles the budget/behavior.

**Size:** Small to medium.

## Verification Checklist
- Focused Jest for `tests/lib/eliza/location-room-game-master-generator.test.ts` passes.
- Any new focused Official utility/transport test passes.
- `bun run test` is run if feasible before commit.
- `bun run elizaos:smoke` is run when live env/service credentials are available; if unavailable, report the limitation explicitly.
- No Crow's Den reset/recovery steps are included as part of this plan.

## Open Questions
None blocking. The only sequencing-sensitive check is whether `scripts/elizaos-official-smoke.ts` can import the shared helper cleanly; validate that immediately after Item 1 because it determines whether Item 6 reuses the helper or mirrors its behavior locally.

## References
- `docs/investigations/elizaos-story-stop-2026-05-27.md`
- `docs/operations/elizaos-validation.md`
- `docs/operations/crows-den-location-room-smoke.md`
- `docs/reviews/official-elizaos-prompt-sanitization-plan-critique-2026-05-27.md`
