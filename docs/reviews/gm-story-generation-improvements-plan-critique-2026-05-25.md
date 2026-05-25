# GM Story Generation Improvements Plan Critique

## 1. Top 3 under-specified seams

1. **Decision selection lifecycle is unclear.** The plan defines `activeDecision.selectedOptionId?` (`docs/plans/gm-story-generation-improvements-2026-05-25.md:41`) and character `declaredAction.chosenOptionId?` (`docs/plans/gm-story-generation-improvements-2026-05-25.md:83-88`), but does not say who validates a chosen option, marks `selectedOptionId`, clears/replaces the active decision, or handles a character choosing an unlisted action. Item 5 only says to merge declared action and GM patch (`docs/plans/gm-story-generation-improvements-2026-05-25.md:186-189`), leaving implementers to guess whether merge helpers, coordinator, or the next GM beat owns this transition.
2. **`publicAdventure` ownership and derivation are underspecified.** The approach says visibility comes from sanitized `metadata.publicAdventure` projected by `toPublicMessage()` (`docs/plans/gm-story-generation-improvements-2026-05-25.md:33`, `:96`), and Item 5 says messages include sanitized `publicAdventure` (`:189`) before Item 6 defines the public DTO (`:201-208`). Implementers must guess whether `publicAdventure` is derived write-time in the coordinator, read-time in service, or both, and which helper is canonical for sanitizing it.
3. **Retry/idempotency lacks source-id mechanics.** The plan requires idempotent merge and non-duplicating clocks/ledger (`docs/plans/gm-story-generation-improvements-2026-05-25.md:113-115`, `:186-188`) but drops the export’s concrete framing that the coordinator supplies deterministic sources like `beat:${beat.id}` / `scene_check:${sceneCheckId}` and the merge helper derives missing ids (`prompt-exports/oracle-plan-2026-05-25-170541-gm-story-plan-5de8b8-17b6.md:244-250`). Without this, duplicate prevention is easy to implement inconsistently.

## 2. Specificity balance

- **Over-specified:** Item 7 names `components/location-rooms/AdventureSignalPanel.tsx` as a new file (`docs/plans/gm-story-generation-improvements-2026-05-25.md:229`). That is a tactical component-organization choice the implementation agent can own; the requirement should be display-only rendering, not a specific file split.
- **Dropped useful export framing:** The export explicitly says to pass active decision/adventure context into character turns (`prompt-exports/oracle-plan-2026-05-25-170541-gm-story-plan-5de8b8-17b6.md:572-575`) and optionally extend `LocationRoomNarrativeTurnContext` (`:592-593`). The plan’s Item 4 asks for `chosenOptionId` but does not state how available options reach the character generator.
- **Dropped useful safety framing:** The export says to sanitize again at projection time (`prompt-exports/oracle-plan-2026-05-25-170541-gm-story-plan-5de8b8-17b6.md:502-504`); the plan only says to project sanitized metadata (`docs/plans/gm-story-generation-improvements-2026-05-25.md:207`). Re-sanitizing at the public boundary is worth keeping.

## 3. Contradictions or missing dependencies

- Item 5 depends on Items 1-4 but requires message `publicAdventure` metadata before Item 6 defines the public DTO/projection shape (`docs/plans/gm-story-generation-improvements-2026-05-25.md:182-208`). Either Item 6’s DTO/sanitizer shape should precede the message-metadata part of Item 5, or Item 5 should only persist internal metadata.
- Item 4 depends only on Item 1 (`docs/plans/gm-story-generation-improvements-2026-05-25.md:177`), but meaningful `chosenOptionId` validation depends on active-decision context from Item 2/5 unless validation is intentionally deferred.
- “Open Questions: None blocking” (`docs/plans/gm-story-generation-improvements-2026-05-25.md:261-262`) is too strong given the ordering and ownership questions above.

## 4. Risk of over-planning

- The full adventure model bundles arc summaries, stakes, decisions, ledger, discoveries, clocks, declared action, and last outcome (`docs/plans/gm-story-generation-improvements-2026-05-25.md:39-46`). Consider cutting or marking discoveries/clocks as second-pass if the first implementation should prioritize visible choices, declared intent, and tiered consequences.
- Item 8 can likely be acceptance criteria across Items 3-7 rather than a standalone work item, unless a separate regression pass is required by process.

## 5. Questions that would change implementation order

1. Should public DTO/sanitizer types be implemented before coordinator writes `publicAdventure` metadata?
2. Should `selectedOptionId` be set immediately from `declaredAction.chosenOptionId`, or only after the next GM beat resolves the choice?
3. Are clocks/discoveries required for the first pass, or can they follow after choices/intent/consequences?
4. Should character-turn prompting receive active decision options as typed context before always-structured output is enabled?
