# Location Room Scene Checks Plan Critique

Scope: bounded critique of `docs/plans/location-room-scene-checks-2026-05-25.md` against `prompt-exports/oracle-plan-2026-05-25-140809-scene-checks-16ba37-9f0f.md`.

## 1. Top 3 under-specified seams

1. **Persistence/idempotency is asserted, not designed.** The plan says to use JSON metadata/dedupe and avoid schema unless proven necessary (`docs/plans/location-room-scene-checks-2026-05-25.md:35`), and Item 5 requires storing resolution before appending the roll card (`:124-127`). It does not say which beat metadata shape is authoritative, whether `narrativeRepository` needs a patch/update helper, or how retries resume partially completed `character_action → roll_card → gm_outcome`. The export explicitly flagged persistence shape as open (`prompt-exports/oracle-plan-2026-05-25-140809-scene-checks-16ba37-9f0f.md:50`) and sketched `storeBeatSceneCheckMetadata` (`:617-620`), which the plan compresses too far.
2. **Action/check taxonomy boundary is blurry.** Item 1 limits scene-check action types to `defend/help/investigate/negotiate/flee/rest` (`docs/plans/...:44`) while also reusing gameplay roll primitives. The export warns existing roll mechanics require a `GameplayActionType` and that skills like `arcana`/`nature` must remain roll choices, not action branches (`prompt-exports/...:217`). The plan does not specify whether these scene action names are mapped to existing `GameplayActionType`, introduced as a separate enum, or passed through existing `resolveActionRoll()` safely.
3. **Narrative message contract needs a stronger seam.** Item 5 names stable order and dedupe generally (`docs/plans/...:123-128`) but does not specify `messageDomain`, `messageKind`, dedupe-key namespace, or whether `messageId` is final message vs. character action. The export included concrete narrative-domain examples and per-message dedupe keys (`prompt-exports/...:536-574`). Implementers would otherwise guess how much combat coordinator shape to copy.

## 2. Specificity balance

- **Over-specified:** Item 1’s exact non-combat action list (`docs/plans/...:44`) may be too tactical unless the implementation truly needs a closed enum now; a smaller requirement like “non-combat action intent, separate from check type” would preserve agent ownership.
- **Useful framing dropped:** The export’s “Add focused tests first” recommendation (`prompt-exports/...:46`) became a final Item 8 after all implementation work (`docs/plans/...:179-196`). Keeping at least rules/normalization tests earlier would reduce risk in this mechanics-heavy change.
- **Useful framing dropped:** The export’s manual tick warning not to conflate tick-level `auto|story|combat` with per-character roll/check choice (`prompt-exports/...:9`) is softened in the plan background (`docs/plans/...:11`); that warning should stay prominent because it affects API/service routing decisions.

## 3. Contradictions or missing dependencies

- Item 1 says “Dependencies: None,” but safe stat fallback depends on gameplay stats config and existing rule behavior; the export had explicit stat-source priority and config handling (`prompt-exports/...:331-338`).
- Item 3 depends on Items 1-2, but GM request normalization can proceed after Item 1 without public roll projection; Item 4 depends on Item 3, yet character proposals could be built against Item 1 independently. Current dependencies may serialize work unnecessarily.
- “Open Questions: None blocking” (`docs/plans/...:209-210`) conflicts with unresolved persistence shape, action mapping, and test ordering questions that could change implementation sequence.

## 4. Risk of over-planning

- The eight work items are reasonable, but Item 8 bundles unit, service, generator, UI, and diagnostics into one broad terminal phase; split mentally into “early contract tests” vs. “final diagnostics/UI coverage” rather than treating it as one late deliverable.
- The Deferred Skill Challenges section (`docs/plans/...:201-207`) is useful as a boundary, but its bullet list can be cut from the implementation prompt; “deferred entirely” is enough for this build.

## 5. Questions that would change implementation order

1. Should the implementer add a narrow beat-metadata patch helper first, or prove existing narrative repository updates can safely persist resolution/message IDs before adding new APIs?
2. Should scene-check action intent be a new scene-only enum mapped into existing gameplay action resolution, or should `resolveActionRoll()` grow a scene-check-specific wrapper before any generators are changed?
3. Should tests for normalization/adjudication/idempotency be written before GM/character prompt changes, instead of after all integration work?
