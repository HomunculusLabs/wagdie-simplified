# GM Adventure Signal Tuning Plan Critique

## 1. Top 3 under-specified seams

1. **Visibility metadata ownership/defaults** — The plan chooses `publicAdventureVisibility: 'hidden' | 'featured'`, hides unflagged metadata, and says routine messages may either omit `metadata.publicAdventure` or mark it hidden (`docs/plans/gm-adventure-signal-tuning-2026-05-25.md:47-53`, `109-115`, `128-132`). An implementer still has to decide where that type lives, whether write sites should omit vs. write `hidden`, and whether helper logic belongs in `publicAdventure.ts`, `types.ts`, or `service.ts`. The export had a useful explicit projection sketch and legacy-row behavior (`prompt-exports/oracle-plan-2026-05-25-191150-signal-tuning-plan-c-b9d0.md:320-339`) that should be retained as the seam contract.

2. **“Internal story pressure” definition** — The plan says story pressure may be internal-only and can be satisfied by `adventurePatch` without public projection (`docs/plans/gm-adventure-signal-tuning-2026-05-25.md:35-43`, `161-166`), but does not say which private fields count, or how to prevent a beat that mutates memory while the visible narration remains atmospheric. This affects `validateGameMasterBeatProgressionContract(...)` behavior directly.

3. **Featured-state UI path** — Item 5 says future `message.adventure` should render as “compact secondary cue or disclosure” (`docs/plans/gm-adventure-signal-tuning-2026-05-25.md:143-149`), but no owner defines when anything becomes featured because the same plan forbids adding a GM-controlled feature flag (`49-53`). The implementation agent would have to invent fixture semantics and UI shape for a path product may not want yet.

## 2. Specificity balance

- **Over-specific:** The enum name/value pair is probably a tactical implementation choice unless consumers already need that exact metadata shape. The product decision is “API hides by default; explicit feature only.”
- **Under-specific after condensing export:** The plan drops the export’s clearer “public overload path” framing: coordinator writes → service sanitizes → DTO reaches UI → `AdventureSignalPanel` repeats it (`prompt-exports/oracle-plan-2026-05-25-191150-signal-tuning-plan-c-b9d0.md:185-192`). That framing is useful because it tells implementers why API gating must precede UI cleanup.
- **Dropped useful guardrails:** The export explicitly said not to duplicate scene-check mechanics, combat routing, persistence tables, or public roll DTOs (`prompt-exports/oracle-plan-2026-05-25-191150-signal-tuning-plan-c-b9d0.md:202-209`). The plan preserves separation generally, but loses these concrete implementation tripwires.

## 3. Contradictions / missing dependencies

- Item 2 lists `narrativeTypes.ts` while the approach says no schema change is needed for catalog or adventure memory (`docs/plans/gm-adventure-signal-tuning-2026-05-25.md:67-70`, `100-101`). If only prompt rendering changes, this dependency may invite unnecessary type/schema edits.
- Item 5 depends only on Item 3, but compact “featured” UI tests require a defined featured fixture/policy. If no featured producer exists this pass, test only absence/removal.
- Item 7 changes scene-check outcome prompting, but depends only on Items 3–4. If prompt naturalization is real, it also depends on Item 1; if not, it duplicates Item 4.

## 4. Risk of over-planning

Cut or fold: Item 2 into Item 1; Item 7 into Items 4/6 unless scene-check prompt text genuinely changes; Item 8 into acceptance criteria. Eight items is heavy for a tuning pass whose blocker is already identified as routine internal state being written/projected/rendered publicly (`prompt-exports/oracle-plan-2026-05-25-191150-signal-tuning-plan-c-b9d0.md:211-213`).

## 5. Order-changing questions

1. Should old stored `metadata.publicAdventure` disappear from public API immediately, or must existing transcript behavior be preserved for historical messages?
2. Is any featured adventure cue required in this pass? If no, remove rather than design compact UI.
3. Must every internal story-pressure update be reflected in natural narration, even if not as `message.adventure`?
4. Is catalog compaction a specific target count or an implementation-owned prompt tuning choice?
