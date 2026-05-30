# Critique: No-Fallback Narration Quality Plan

## 1. Top 3 under-specified seams

1. **Structured Official turn failure after an already-appended GM beat.** The plan says failed Official repair should “treat the whole tick as failed” (`docs/plans/no-fallback-narration-quality-2026-05-30.md:58`) and later says implementation should verify idempotency (`:290`), but does not specify whether the GM beat remains public, is reused on retry, or how `narrativeCoordinator.ts` records Official-turn diagnostics before rethrow. This is the highest-risk seam because partial public append behavior is expected, not exceptional.

2. **Encounter proposal failure before an encounter/turn exists.** The plan chooses “persist safe diagnostics on gameplay room state metadata” (`:81`, `:292`) but omits the storage API, metadata key shape, and retry reuse behavior. The export had useful fallback framing: prefer an early nullable turn if repository support exists; otherwise use `GameplayRoomState.metadata` (`prompt-exports/oracle-plan-2026-05-30-074903-no-fallback-plan-799-329e.md:656-683`). The plan’s collapsed version leaves implementers guessing.

3. **Validated setup narration vs. old persisted encounters.** Item 6 requires validated setup narration or a non-generic summary (`docs/plans/no-fallback-narration-quality-2026-05-30.md:215`), but does not say how to treat existing encounters lacking `publicSetupNarration`. The export explicitly covered old persisted encounters and when to throw instead of using stale/generic summaries (`prompt-exports/...md:693-697`). Without that, a coordinator edit could either break old rooms or keep a generic public fallback path.

## 2. Specificity balance

- **Dropped useful framing:** The export allowed invalid optional `sceneCheckProposal` to be non-fatal when `publicSpeech` and `declaredAction` are valid, while preserving `sceneCheckProposalError` (`prompt-exports/...md:314-317`). The plan only says structured turns require valid speech/action (`docs/plans/...md:55`, `:150-155`), so an implementer may make optional proposal validation too strict.
- **Over-specified tactical choice:** “`parseGameplayActionResponseStrict()` should be the only accepted parser” (`docs/plans/...md:70`) over-commits to a function-level solution. The requirement is no production tolerant fallback; implementation should be free to make the existing normalizer strict, add a strict mode, or rename legacy tolerant behavior.
- **Possibly over-specific defaults:** The exact combat defaults (`6`, `20`, `3`, `36`) are actionable (`docs/plans/...md:90-94`, `:237-238`), but they are policy knobs. If not already product-approved, frame them as proposed defaults plus tests/env overrides rather than hard requirements.

## 3. Contradictions or missing dependencies

- **“Open Questions: none” contradicts plan text.** The plan itself flags idempotency verification (`docs/plans/...md:290`) and repository/state persistence uncertainty (`:81`, `:292`), then says nothing is blocking (`:294-295`). These are order-affecting questions.
- **Item 3 dependency is incomplete.** It depends only on Item 1 (`:164`), but safe failure requires narrative coordinator idempotency/diagnostic handling before or alongside strict Official turn behavior.
- **Item 6 dependency is incomplete.** It depends only on Item 1 (`:227`), but strict encounter setup also depends on deciding where pre-encounter diagnostics persist and whether `rules.normalizeEncounterProposal()` can still inject generic defaults.

## 4. Risk of over-planning

Cut or simplify Item 8 as a separate work item. “Delete fallback dead code and add guardrails” (`docs/plans/...md:250-268`) mostly follows from Items 2/5/6 and can be a final checklist in each item plus one repository search. Also compress the diagnostics standardization item unless it produces shared types immediately used by the first behavior change.

## 5. Questions that would change implementation order

1. Should Official-turn strictness wait until narrative retry/idempotency behavior for already-appended GM beats is tested?
2. For encounter proposal failures, should diagnostics live on an early nullable gameplay turn or only on gameplay room state metadata?
3. Are the new combat pacing defaults product-approved, or should fallback removal ship first with pacing as a separate config-only PR?
