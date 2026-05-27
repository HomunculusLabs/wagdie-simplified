# Official ElizaOS Prompt Sanitization Plan — Design Critique

## 1. Top 3 under-specified seams

1. **Suffix-preserving clamp behavior is named, not specified.** The plan requires “plain clamping and suffix-preserving clamping” (`docs/plans/official-elizaos-prompt-sanitization-2026-05-27.md:42-45`) and preserving GM/scene/character contracts (`:72-79`, `:93-98`), but does not define fallback behavior when the suffix plus truncation notice alone exceeds the 3900-byte budget. Implementers must guess whether to drop the notice, clamp the suffix, fail fast, or preserve a partial contract.

2. **Utility API/runtime compatibility is too vague.** The plan says the helper must not rely on server-only APIs (`:45`) but drops the export’s useful framing about Node 23.3.0 APIs and fallback awareness for `TextEncoder`, `Buffer.byteLength`, and `String.prototype.toWellFormed()` (`prompt-exports/oracle-plan-2026-05-27-064540-unicode-prompt-plan-ee05.md:44`, `:93`, `:304`). This leaves an implementation seam around browser/client bundles vs script runtime.

3. **Smoke probe insertion point and payload construction are underspecified.** The plan says `bun run elizaos:smoke` fresh phase sends a near-limit Unicode message and may import or mirror the helper (`docs/plans/...:130-142`), but omits the export’s specific placement inside `checkChatAndSessions()` after the existing two SSE checks (`prompt-exports/...:576-590`). It also does not say whether “near-limit” means below the production 3900-byte helper limit, near upstream 4000 code units, or intentionally over-budget before local clamping.

## 2. Specificity balance

- **Over-specified tactical choice:** The plan hard-codes a new module location as “under `lib/eliza/official/`” and suggests `lib/eliza/official/text.ts` (`docs/plans/...:42`, `:47`). The export allowed colocating in `messaging.ts` or a sibling if cleaner (`prompt-exports/...:43`). Since tests/mocks may drive this choice, prefer leaving file placement as a recommendation, not a done-when constraint.
- **Dropped useful framing:** The plan summarizes tests well, but drops the export’s warning that the existing GM test mocks `@/lib/eliza/official/messaging`, making a separate `text.ts` useful to avoid mock expansion (`prompt-exports/...:740-742`). That is directly actionable implementation guidance.
- **Dropped implementation-order framing:** The plan has dependencies, but not the export’s explicit order to add the utility, then transport defense, then prompt builders, tests, smoke (`prompt-exports/...:748-750`). This matters because utility API shape should settle before touching two prompt builders and tests.

## 3. Contradictions or missing dependencies

- **“Open Questions: None blocking” conflicts with smoke import uncertainty.** The plan says no questions block, then says the implementation agent must verify whether the smoke script can import the shared helper (`docs/plans/...:164-165`). That import decision affects Item 6’s dependency and implementation order.
- **Byte budget rationale is asserted but not test-owned.** The plan chooses 3900 UTF-8 bytes (`:32`) while noting upstream appears to enforce 4000 code units. It should explicitly require one helper-level assertion that both byte and code-unit limits remain safe for representative payloads, otherwise future changes may conflate the two again.
- **Transport truncation dependency on product behavior is implicit.** Item 2 truncates every Official message (`:58-64`), including direct chat. The export flags silent truncation as a risk (`prompt-exports/...:740`); the plan should at least name this as accepted behavior or require diagnostics.

## 4. Risk of over-planning

- The long background is useful but could be trimmed for implementers; lines `docs/plans/...:7-20` repeat investigation conclusions better left to the referenced report.
- Item 7 mostly restates standard verification (`:146-161`). It can be folded into a final “Verification” checklist instead of a full work item with size/dependencies.
- Repeating the same test file in Items 1, 3, 4, and 5 adds noise. Keep concrete test ownership in Item 5 only.

## 5. Questions whose answers would change implementation order

1. Should `scripts/elizaos-official-smoke.ts` import the shared helper, or should it use a local builder? If import compatibility is unknown, validate that immediately after Item 1.
2. Should central transport truncation be allowed for all Official chat/session messages, or only sanitize malformed Unicode and warn on over-budget non-prompt content?
3. What is the required fallback when a contract suffix alone exceeds the byte budget: partial suffix, plain clamp, or explicit failure?
