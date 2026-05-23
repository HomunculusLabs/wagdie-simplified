# Gameplay Earnings and Stats Plan Critique

## 1. Top 3 under-specified seams

1. **Claimant wallet / ownership authority.** The plan says claim rows store `claimant wallet` (`docs/plans/gameplay-earnings-and-stats-2026-05-22.md:139`, `:287`) and owner reads can match either death-time claimant or current owner/staker (`:383`), but it does not define precedence among owner, staker, current holder, and death-time snapshot. This affects schema, auth, and fraud/transfer behavior.
2. **Performance scoring weights.** The scoring formula lists components but not weights, caps, normalization, or where “objective contribution” comes from (`:116-127`). An implementer would have to invent balance constants and possibly new objective semantics before reward tiers can be tested.
3. **Concord/searing modifier source.** The plan says seared Concords may contribute from “existing Concord effect/read-model data” (`:104-105`) and Item 2 should include Concord/searing context (`:183`), but it does not name the authoritative field/table or fallback behavior when no effect metadata exists. This is too vague for a deterministic modifier resolver.

## 2. Specificity balance

- **Over-specified tactical choices:** The fixed action-to-stat mapping, D&D-style modifier formula, exact non-stat caps, and “any weapon/armor gives +1” rules (`:76-105`) are useful examples but read like product balance decisions. Better marked as default V1 constants/config candidates than hard implementation requirements.
- **Useful framing dropped/softened from export:** The export’s relationship map clearly identifies the exact integration seam: membership provides participants; stats must be hydrated separately via `CharacterQueryRepository`/`CharacterService`; `GameplayCharacterState -> resolveGameplayTurnMechanics()` is the mechanics seam; death loop -> `createPendingDeathReview()` is the claim seam (`prompt-exports/oracle-plan-2026-05-22-181433-stats-rewards-plan-9-9886.md:49-56`). The final plan has the pieces, but the work items could preserve this “do not extend membership” routing more explicitly.
- **Dropped line-item shape:** The export gave a concrete line item shape including `assetType`, `chainId`, `contractAddress`, `concordId`, and `amount` (`prompt-exports/...stats-rewards-plan-9-9886.md:467-484`). The plan only says points plus optional configured Concord entitlement (`docs/plans/...:130-136`), which leaves schema/type design less constrained.

## 3. Contradictions or missing dependencies

- The goal promises token/Concord rewards (`:4`), but the first open question still asks whether the denomination is points, Concord entitlement, or future token amount (`:446-448`). That answer should precede Item 7 schema and Item 8 types.
- Status `claimed` is included in the ledger (`:141-146`), while V1 repeatedly says no on-chain transfer and admin reward APIs are read-only except death-review-driven status changes (`:344`, `:367-375`). Either define a non-transfer “claimed” workflow or omit it from V1.
- Item 12 depends only on admin inspection, but owner visibility also depends on a resolved ownership/staking authority and auth path (`:379-388`), which is not captured as a dependency.

## 4. Risk of over-planning

The 14-item sequence likely over-plans V1. Items 11–13 can be simplified or deferred: expose claim summaries through existing death-review/admin surfaces first, postpone standalone reward browsing and owner endpoint until denomination/visibility are settled, and treat prompt/plugin text as a small follow-up after mechanics/claims stabilize. Item 14 is also too broad as a final catch-all; split only the tests needed for gated V1 acceptance.

## 5. Questions that would change implementation order

1. What is the V1 canonical reward denomination and line-item schema?
2. Who is the claim beneficiary when owner and staker differ, or ownership changes after death?
3. Are Concord/searing modifiers in V1 mechanics, or should V1 ship DB stats + points ledger first?
4. Must owner-visible claim reads ship in V1, or can admin-only verification come first?
