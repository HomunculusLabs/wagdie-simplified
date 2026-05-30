# Plan Critique: Chat Streaming Session Recovery

**Target:** `docs/plans/chat-streaming-session-recovery-2026-05-30.md`
**Compared against:** `prompt-exports/oracle-plan-2026-05-30-132622-chat-recovery-plan-2-47b0.md`
**Scope:** under-specification, specificity balance vs. export, contradictions, over-planning, ordering questions.

## 1. Top 3 under-specified seams

1. **Classifier surface vs. existing error-based classifier.** Item 1 says "exposes a response classifier that inspects `response.clone()`" but `lib/eliza/official/messaging.ts:137-145` already exports `isOfficialSessionNotFoundError()` (error-based). The plan never says whether to (a) add a parallel response-classifier, (b) refactor both error and response paths through one shared body/status helper, or (c) leave the error path alone. The export was explicit ("export the existing error-based classifier *or* refactor both error/response paths to share one body/status classifier"). Implementer will guess.
2. **What counts as "non-empty assistant content from terminal" in `streamOfficialElizaSse`.** Item 3 says success requires "non-empty assistant content from chunks or recognized terminal content fields" (`lib/eliza/official/stream.ts:152-207`) but never enumerates which fields on `done`/`complete` payloads are recognized — `text`, `content`, `message`, `data.content`, raw string payload, etc. Without a list, the parser tightening will either lock out valid shapes or stay too loose. The export at least listed candidates and explicitly flagged "raw string `done`/`complete` payload behavior: choose support if captured samples show it" — that decision-gate is gone from the plan.
3. **Where recovery is wrapped in `client.ts:353-424`.** Item 2 lists a single line range covering both fresh and existing branches, but does not say whether the one-shot recovery should be a private helper inside `chat.sendMessageStream()` reused by both branches, or two ad-hoc try/catches. Given that the existing existing-conversation rebind already lives at `lib/eliza/official/client.ts:387-393`, the implementer must decide whether to delete/replace that block or wrap around it. A one-line directive ("extract `sendOnceWithSessionRebind(link, …)` and call from both branches") would remove the guess.

## 2. Specificity balance (plan vs. export)

**Useful framing the export had, that the plan dropped:**
- Abort/signal propagation on the retry send (`input.signal?.aborted` check before creating replacement session; pass `signal` to retry `sendSessionMessage`). Material for cancellation correctness — not in plan.
- `WagdieElizaError` shape for empty-stream throws (`code: 'API_ERROR'`, `statusCode: 502`, `isRetryable: true`). Plan only says "route-safe `WagdieElizaError`" — implementer now picks status/retryable semantics that route error handling depends on.
- Explicit "do not add parallel session systems; reuse `rebindSession`, `createSession`, `sendSessionMessage`" guidance — useful guardrail removed.

**Plan over-specifies (implementer should own):**
- Item 3's fixed reason taxonomy (`empty_stream` | `unsupported_stream` | `missing_terminal` | `empty_terminal`). These are log strings; pinning them in a plan invites churn if the implementer finds a cleaner split.
- Item 7's exhaustive log-field list (twelve named fields including `firstTokenMs`, `durationMs`). Over-prescriptive for an ops-observability pass — a "log session ids, conversation id, upstream status/code, content length, recovery state" sentence would do.
- Item 2's "best-effort delete old session after successful rebind" is fine to mention, but the plan asserts it as a hard "done when" item; treat as optional cleanup so it doesn't block.

## 3. Contradictions and missing dependencies

- **Item 4 dependency text vs. Implementation Order.** Item 4 says "Items 2 and 3 can land before or with this guard"; the ordered list places it strictly after both. Pick one.
- **Item 7 "Key files" includes `docker-compose.yml`, `.env.example`, `services/elizaos/package.json`** but its "Done when" describes only checklist verifications, not edits. Misleading — either drop those files or specify what gets changed in them.
- **Behavior tightening for existing-conversation 404 is not flagged as a breaking-on-purpose change in Item 2's "Done when."** Today `client.ts:387-393` rebinds on *any* 404 with conversationId; the new behavior narrows to true `SESSION_NOT_FOUND`. The Risks section mentions it ("intentional so route/config problems remain visible") but the work item itself does not, so an implementer reading Item 2 in isolation may not realize they're removing existing recovery, not just adding new recovery.
- **`recordError()` timing during the recovery window is unspecified.** Item 2 says "Retry failure does not loop; existing `recordError()` handling records the final failure." It does not say whether the first failed send (the one that triggered recovery) should also call `recordError()`. The export was silent too, but it matters for monitoring noise and `last_error` semantics on the link.

## 4. Over-planning — cut or simplify

- **Item 7** mostly duplicates Validation Plan §2 (env/auth/health checks) and Risks/monitoring. Fold its monitoring bullets into Validation Plan and drop the standalone item — there are no real code changes here, just an ops checklist.
- **Item 6's "documented/admin-gated stale-session validation path"** is a one-off operator drill (capture WAGDIE id → delete Official session via `DELETE /api/messaging/sessions/{id}` → resend). That is a runbook step, not a smoke-script change. Move it under Validation Plan §5 (where it already partially exists) and remove from Item 6's "done when."
- **Background section** is dense (12 bullets, ~40 file:line refs). Useful for orientation but several lines just restate the investigation doc. Trimming the SSE-seam and repo-seam bullets to one line each would tighten without losing signal.
- **Item 5's `ChatSidebar.tsx` "Key files" entry.** The plan explicitly says ChatSidebar needs no structural change. Listing two line ranges as "key files" implies edits. Drop or annotate "read-only context."

## 5. Questions whose answers would change implementation order

1. **Are there captured production samples of Official ElizaOS `done`/`complete` payload shapes?** If not, Item 3 (parser tightening) should be preceded by a sample-capture step (a logging-only patch deployed first to record `eventTypes` and terminal payload shapes), otherwise the strict parser may immediately reject valid streams. The export flagged this as an open question; the plan demoted it to a Risks bullet — promoting it would re-order Items 3 and 6.
2. **Does a hook test harness exist for `useCharacterChat`?** (Already in Open Questions.) If no, Item 5 collapses to a ~20-line defensive change and should merge into Item 4 rather than being a standalone phase — Implementation Order step 5 disappears.
3. **Should the classifier be one function or two (response-based + error-based)?** Drives whether Item 1 is a small refactor of `messaging.ts:137-145` (touches existing call sites) or a pure addition. Refactor path means Item 1 has its own messaging-test regression surface that must land before Item 2, as ordered. Pure addition lets Items 1 and 2 land together.
4. **Does `recordError()` fire on the intermediate (pre-recovery) failure?** Affects whether the recovery path also needs a "clear last_error on successful retry" step, which is not currently in Item 2.
