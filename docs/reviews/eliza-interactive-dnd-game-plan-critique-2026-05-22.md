# Eliza Interactive D&D Game Plan Critique

Scope: critique of `docs/plans/eliza-interactive-dnd-game-2026-05-22.md` against the original context_builder export, limited to implementation-readiness seams.

## 1. Top 3 under-specified seams

1. **Encounter start / eligibility threshold.** The plan says to start an encounter when “enough eligible living characters” are present (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:66`), but the export used the concrete threshold “at least two eligible living characters” (`prompt-exports/oracle-plan-2026-05-22-154430-dnd-game-plan-19e87c-d7c8.md:336`). An implementer would have to guess whether solo encounters are legal, whether downed characters count, and what happens when a room drops below threshold mid-encounter.
2. **Gameplay enablement scope.** Item 2 defines a global-ish `elizaConfig.locationRooms.gameplay` block (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:129`), while rollout says to enable “one location room” (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:338`). The plan does not specify whether per-room enablement lives in env/config, room DB state, admin UI, or a hardcoded allowlist.
3. **Death review resolution semantics.** The plan correctly separates gameplay death from canonical finality (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:98-100`), but Item 10 says admins can “reject finality, keep death gameplay-only, or approve canonical finality intent” (`docs/plans/eliza-interactive-dnd-game-2026-05-22.md:277`) without defining whether rejection revives gameplay state, only rejects token finality, or creates a lasting noncanonical death. This affects schema, coordinator rules, admin APIs, and UI copy.

## 2. Specificity balance

- **Useful framing dropped from export:** concrete minimum party size (`export:336`), explicit “raw roll metadata remains private/admin-visible” (`export:360`), and “V1 constants should live in a dedicated rules module, not in prompts” (`export:396`) are more implementation-guiding than tactical. Consider restoring them.
- **Potential over-specification:** named dice formulas and fixed action taxonomy are acceptable as V1 defaults, but the plan may over-constrain tactical implementation if treated as exhaustive rather than initial rules-module constants.
- **UI message distinction needs a data seam:** Item 12 requires distinguishing GM setup, character action, and GM roll/outcome narration (`plan:317`), but Item 9 only adds an aggregate `gameplay` summary (`plan:258`). The plan should say whether transcript messages gain public metadata or whether UI infers this from `authorKind`/ordering.

## 3. Contradictions or missing dependencies

- Global gameplay config vs per-location rollout is the main contradiction (`plan:129` vs `plan:338`).
- Item 11 says not to add the plugin to required token-agent plugins until hosted support is verified (`plan:300`) but still lists `lib/eliza/official/client.ts` as a key file. That should be clarified as a guard/no-op check, not plugin registration.
- Admin gameplay APIs depend on an auth/response pattern, but the plan names prior lore services rather than the concrete shared admin auth helper seam; implementers may copy the wrong route style.

## 4. Risk of over-planning

- **Item 1** is meta-work on the plan itself and can be cut once this plan is accepted.
- **Item 11** should probably be a follow-up/spike unless structured action prompting proves insufficient; the backend is explicitly authoritative, so the plugin is not V1-critical.
- **Item 10** could start with only death-review list/update endpoints. Full “inspect room gameplay state and recent turns” may duplicate repository/debug needs before UI/admin workflows are proven.

## 5. Questions that would change implementation order

1. Is gameplay enabled globally, per location room, or both?
2. Is the minimum encounter party size one or two living characters?
3. When an admin rejects finality, should the character remain gameplay-dead, be revived, or enter a separate disputed state?
4. Does V1 require UI transcript classification metadata, or can UI wait until backend gameplay is stable?
5. Is hosted ElizaOS plugin support expected soon enough to justify Item 11 before backend/UI completion?
